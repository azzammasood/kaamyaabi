import { z } from "zod";

export const workerProfileSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  location: z.string().min(1),
  experienceYears: z.number().int().nonnegative(),
  minimumSalaryPkr: z.number().int().nonnegative(),
  skills: z.array(z.string().min(1)).min(1),
  availability: z.string().min(1),
  languages: z.array(z.string().min(1)).min(1),
});

export type WorkerProfile = z.infer<typeof workerProfileSchema>;

const geminiUsage = {
  transcriptionCalls: 0,
  transcriptionFailures: 0,
  profileCalls: 0,
  profileFailures: 0,
  profileRetries: 0,
  deterministicFallbacks: 0,
};

export async function transcribeAudio(input: {
  bytes: ArrayBuffer;
  mimeType: string;
}) {
  try {
    const data = Buffer.from(input.bytes).toString("base64");
    const response = await requestGemini(
      process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe",
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this WhatsApp voice note exactly. Preserve Urdu, Roman Urdu, and English as spoken. Return transcript text only.",
              },
              { inline_data: { mime_type: input.mimeType, data } },
            ],
          },
        ],
      },
    );

    const transcript = extractGeminiText(response).trim();
    if (!transcript) {
      throw new Error("Gemini returned an empty transcript");
    }

    geminiUsage.transcriptionCalls += 1;
    return transcript;
  } catch (error) {
    geminiUsage.transcriptionFailures += 1;
    console.warn("Gemini transcription failed", error);
    return "I could not transcribe this voice note. Please send the details as text.";
  }
}

export async function extractWorkerProfile(transcript: string) {
  try {
    const response = await requestGemini(
      process.env.GEMINI_MODEL || "gemini-3.8-flash",
      {
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  "Extract a worker profile from this WhatsApp message. Do not invent details. For missing text fields use Not provided, for missing numbers use 0, and for missing lists use [Not provided]. Return JSON only with name, role, location, experienceYears, minimumSalaryPkr, skills, availability, languages.\n\nMessage:\n" +
                  transcript,
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      },
    );

    geminiUsage.profileCalls += 1;
    return parseProfileJson(extractGeminiText(response));
  } catch (error) {
    geminiUsage.profileFailures += 1;
    geminiUsage.deterministicFallbacks += 1;
    console.warn("Gemini profile extraction failed; using transcript-only fallback", error);
    return profileFromTranscript(transcript);
  }
}

export function getAiStatus() {
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const transcribeModel =
    process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe";

  return "AI status since server start:\n\nProvider: Gemini only\nProfile model: " +
    model +
    "\nTranscription model: " +
    transcribeModel +
    "\n\nTranscription calls: " +
    geminiUsage.transcriptionCalls +
    "\nTranscription failures: " +
    geminiUsage.transcriptionFailures +
    "\nProfile calls: " +
    geminiUsage.profileCalls +
    "\nProfile failures: " +
    geminiUsage.profileFailures +
    "\nTemporary retries: " +
    geminiUsage.profileRetries +
    "\nTranscript-only fallbacks: " +
    geminiUsage.deterministicFallbacks;
}

async function requestGemini(model: string, body: unknown) {
  const apiKey = requireEnv("GEMINI_API_KEY");
  let lastStatus = 0;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (response.ok) {
      return (await response.json()) as GeminiGenerateContentResponse;
    }

    lastStatus = response.status;
    if (![429, 500, 502, 503, 504].includes(lastStatus) || attempt === 2) {
      break;
    }

    geminiUsage.profileRetries += 1;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }

  throw new Error("Gemini returned " + lastStatus);
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(name + " is not configured");
  }
  return value;
}

function parseProfileJson(content: string) {
  const jsonText = content
    .trim()
    .replace(/^\u0060\u0060\u0060json\s*/i, "")
    .replace(/^\u0060\u0060\u0060\s*/i, "")
    .replace(/\u0060\u0060\u0060$/i, "")
    .trim();
  const value = JSON.parse(jsonText) as Record<string, unknown>;

  return workerProfileSchema.parse({
    name: textValue(value.name),
    role: textValue(value.role),
    location: textValue(value.location),
    experienceYears: numberValue(value.experienceYears),
    minimumSalaryPkr: numberValue(value.minimumSalaryPkr),
    skills: stringList(value.skills),
    availability: textValue(value.availability),
    languages: stringList(value.languages),
  });
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "Not provided";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const number = Number(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(number) && number >= 0) {
      return Math.round(number);
    }
  }
  return 0;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return ["Not provided"];
  }
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : ["Not provided"];
}

function extractGeminiText(response: GeminiGenerateContentResponse) {
  return response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("") ?? "";
}

function profileFromTranscript(transcript: string): WorkerProfile {
  const normalized = transcript.toLowerCase();
  const yearsMatch = transcript.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:years?|saal|year)/i);
  const salaryMatch = transcript.match(/(?:salary|pkr|rs|hazaar|k)\D*(\d{2,6})/i);
  const locationMatch = transcript.match(/(?:[A-Z]-?\d+(?:\s+Markaz)?|Islamabad|Rawalpindi|Lahore|Karachi|Peshawar|Faisalabad)/i);

  const role = /(?:house\s+)?chef/i.test(transcript)
    ? "House Chef"
    : /react\s*native/i.test(transcript)
      ? "React Native Developer"
      : /driver|drive|gaari/i.test(transcript)
        ? "Driver"
        : "Not provided";

  const skills = role === "House Chef"
    ? ["Cooking"]
    : role === "React Native Developer"
      ? ["React Native"]
      : role === "Driver"
        ? ["Driving"]
        : ["Not provided"];

  return workerProfileSchema.parse({
    name: "Not provided",
    role,
    location: locationMatch?.[0] ?? "Not provided",
    experienceYears: yearsMatch ? wordNumber(yearsMatch[1]) : 0,
    minimumSalaryPkr: salaryMatch ? normalizeSalary(salaryMatch[1]) : 0,
    skills,
    availability: /monday/i.test(normalized)
      ? "Monday"
      : /immediately|foran|fori/i.test(normalized)
        ? "Immediately"
        : "Not provided",
    languages: ["Not provided"],
  });
}

function wordNumber(value: string) {
  const numbers: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  return numbers[value.toLowerCase()] ?? Number(value);
}

function normalizeSalary(value: string) {
  const number = Number(value);
  return number < 1000 ? number * 1000 : number;
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};
