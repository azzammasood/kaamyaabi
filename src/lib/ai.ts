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

const openRouterUsage = {
  profileAttempts: 0,
  profileCalls: 0,
  profileFailures: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

const workerProfileJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    role: { type: "string" },
    location: { type: "string" },
    experienceYears: { type: "integer" },
    minimumSalaryPkr: { type: "integer" },
    skills: { type: "array", items: { type: "string" } },
    availability: { type: "string" },
    languages: { type: "array", items: { type: "string" } },
  },
  required: [
    "name",
    "role",
    "location",
    "experienceYears",
    "minimumSalaryPkr",
    "skills",
    "availability",
    "languages",
  ],
  additionalProperties: false,
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

export async function extractWorkerProfile(
  transcript: string,
  options: { preferredProvider?: "openrouter" | "gemini" } = {},
) {
  if (options.preferredProvider !== "gemini" && shouldUseOpenRouter()) {
    try {
      return recoverProfileName(await extractProfileWithOpenRouter(transcript), transcript);
    } catch (error) {
      console.warn("OpenRouter profile extraction failed; falling back to Gemini", error);
    }
  }

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
    return recoverProfileName(parseProfileJson(extractGeminiText(response)), transcript);
  } catch (error) {
    geminiUsage.profileFailures += 1;
    geminiUsage.deterministicFallbacks += 1;
    console.warn("Gemini profile extraction failed; using transcript-only fallback", error);
    return recoverProfileName(profileFromTranscript(transcript), transcript);
  }
}

export function getAiStatus() {
  const openRouterModel =
    process.env.OPENROUTER_MODEL || "nex-agi/nex-n2.5-mini:free";
  const openRouterFallbackModel =
    process.env.OPENROUTER_FALLBACK_MODEL || "nex-agi/nex-n2.5-pro:free";
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const transcribeModel =
    process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe";

  return "AI status since server start:\n\nProvider: " +
    (shouldUseOpenRouter() ? "OpenRouter primary, Gemini fallback" : "Gemini only") +
    "\nOpenRouter model: " +
    openRouterModel +
    "\nOpenRouter fallback: " +
    openRouterFallbackModel +
    "\nGemini profile fallback: " +
    model +
    "\nTranscription model: " +
    transcribeModel +
    "\n\nOpenRouter profile calls: " +
    openRouterUsage.profileCalls +
    "\nOpenRouter profile attempts: " +
    openRouterUsage.profileAttempts +
    "\nOpenRouter profile failures: " +
    openRouterUsage.profileFailures +
    "\nOpenRouter tokens seen: " +
    openRouterUsage.totalTokens +
    " total (" +
    openRouterUsage.promptTokens +
    " prompt, " +
    openRouterUsage.completionTokens +
    " completion)" +
    "\n\nGemini transcription calls: " +
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

export function getAiUsageSummary() {
  const openRouterModel =
    process.env.OPENROUTER_MODEL || "nex-agi/nex-n2.5-mini:free";
  const openRouterFallbackModel =
    process.env.OPENROUTER_FALLBACK_MODEL || "nex-agi/nex-n2.5-pro:free";
  const geminiModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const transcribeModel =
    process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe";
  const primary =
    shouldUseOpenRouter() ? "OpenRouter first, Gemini fallback" : "Gemini only";
  const effectiveProfileAi =
    openRouterUsage.profileCalls > 0
      ? "OpenRouter"
      : geminiUsage.profileCalls > 0
        ? "Gemini fallback"
        : geminiUsage.deterministicFallbacks > 0
          ? "Transcript parser fallback"
          : "No completed profile call yet";

  return `AI usage since this server restart:

Mode: ${primary}
Actually used for profile: ${effectiveProfileAi}
Voice transcription: Gemini (${transcribeModel})

OpenRouter:
Model: ${openRouterModel}
Fallback model: ${openRouterFallbackModel}
Attempts: ${openRouterUsage.profileAttempts}
Successes: ${openRouterUsage.profileCalls}
Failures: ${openRouterUsage.profileFailures}
Tokens seen: ${openRouterUsage.totalTokens}

Gemini:
Profile model: ${geminiModel}
Profile calls: ${geminiUsage.profileCalls}
Profile failures: ${geminiUsage.profileFailures}
Voice transcription calls: ${geminiUsage.transcriptionCalls}
Transcript parser fallbacks: ${geminiUsage.deterministicFallbacks}

Note: these counters reset whenever npm run dev restarts.`;
}

function shouldUseOpenRouter() {
  return (
    process.env.AI_PRIMARY_PROVIDER !== "gemini" &&
    Boolean(process.env.OPENROUTER_API_KEY)
  );
}

async function extractProfileWithOpenRouter(transcript: string) {
  const apiKey = requireEnv("OPENROUTER_API_KEY");
  const baseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const models = [
    process.env.OPENROUTER_MODEL || "nex-agi/nex-n2.5-mini:free",
    process.env.OPENROUTER_FALLBACK_MODEL || "nex-agi/nex-n2.5-pro:free",
  ];
  let lastError: unknown;

  for (const model of models) {
    try {
      return await requestOpenRouterProfile({ apiKey, baseUrl, model, transcript });
    } catch (error) {
      lastError = error;
      console.warn("OpenRouter model failed", { model, error });
    }
  }

  throw lastError ?? new Error("OpenRouter extraction failed");
}

async function requestOpenRouterProfile(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  transcript: string;
}) {
  openRouterUsage.profileAttempts += 1;

  const response = await fetch(input.baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + input.apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Kaamyaabi",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      max_tokens: 500,
      provider: { require_parameters: true },
      messages: [
        {
          role: "system",
          content:
            "Extract a Pakistani informal worker profile from WhatsApp text or voice transcript. Preserve the user's spoken language in languages. Do not invent details. Missing text fields must be Not provided, missing numbers 0, missing lists [Not provided]. Return JSON only.",
        },
        { role: "user", content: input.transcript },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "worker_profile",
          strict: true,
          schema: workerProfileJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    openRouterUsage.profileFailures += 1;
    throw new Error("OpenRouter returned " + response.status);
  }

  const json = (await response.json()) as OpenRouterChatResponse;
  const content = json.choices?.[0]?.message?.content;

  if (!content) {
    openRouterUsage.profileFailures += 1;
    throw new Error("OpenRouter returned empty content");
  }

  openRouterUsage.profileCalls += 1;
  openRouterUsage.promptTokens += json.usage?.prompt_tokens ?? 0;
  openRouterUsage.completionTokens += json.usage?.completion_tokens ?? 0;
  openRouterUsage.totalTokens += json.usage?.total_tokens ?? 0;

  return parseProfileJson(content);
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

function recoverProfileName(profile: WorkerProfile, transcript: string) {
  if (!isMissingText(profile.name)) {
    return profile;
  }

  const name = extractNameFromTranscript(transcript);
  return name ? { ...profile, name } : profile;
}

function extractNameFromTranscript(transcript: string) {
  const cleaned = transcript.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:mera naam|mere naam|my name is|name is|naam)\s+([A-Za-z][A-Za-z .'-]{1,50}?)(?:\s+(?:hai|he|hy|is)\b|[,.;]|$)/i,
    /\b(?:i am|i'm|main|mein)\s+([A-Za-z][A-Za-z .'-]{1,50}?)(?:\s+(?:hoon|hun|hon|from|se)\b|[,.;]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern)?.[1];
    const name = normalizeExtractedName(match);
    if (name) {
      return name;
    }
  }

  return undefined;
}

function normalizeExtractedName(value: string | undefined) {
  const name = value
    ?.replace(/\b(?:mujhe|chahiye|ka|ki|ke|job|kaam|work|driver|chef|electrician|plumber)\b.*$/i, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!name || name.length < 2 || /\d/.test(name)) {
    return undefined;
  }

  const words = name.split(" ").slice(0, 4);
  if (words.some((word) => word.length < 2)) {
    return undefined;
  }

  return words
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isMissingText(value: string | undefined) {
  return !value || value.trim().toLowerCase() === "not provided";
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
      : /electrician|bijli/i.test(transcript)
        ? "Electrician"
        : /plumber/i.test(transcript)
          ? "Plumber"
          : /guard|security/i.test(transcript)
            ? "Security Guard"
            : /cook/i.test(transcript)
              ? "Cook"
              : /driver|drive|gaari/i.test(transcript)
        ? "Driver"
        : "Not provided";

  const skills = role === "House Chef"
    ? ["Cooking", "Kitchen work"]
    : role === "React Native Developer"
      ? ["React Native"]
      : role === "Electrician"
        ? ["Electrical work"]
        : role === "Plumber"
          ? ["Plumbing"]
          : role === "Security Guard"
            ? ["Security"]
            : role === "Cook"
              ? ["Cooking"]
      : role === "Driver"
        ? ["Driving"]
        : ["Not provided"];

  return workerProfileSchema.parse({
    name: extractNameFromTranscript(transcript) ?? "Not provided",
    role,
    location: locationMatch?.[0] ?? "Not provided",
    experienceYears: yearsMatch ? wordNumber(yearsMatch[1]) : 0,
    minimumSalaryPkr: salaryMatch ? normalizeSalary(salaryMatch[1]) : 0,
    skills,
    availability: extractAvailability(normalized),
    languages: ["Not provided"],
  });
}

function extractAvailability(normalized: string) {
  const dayMatch = normalized.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|peer|mangal|budh|jumma|hafta|itwar)\b/i,
  )?.[1];

  if (dayMatch) {
    return dayMatch[0].toUpperCase() + dayMatch.slice(1).toLowerCase();
  }

  return /immediately|foran|fori/i.test(normalized) ? "Immediately" : "Not provided";
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

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};
