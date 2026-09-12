import { z } from "zod";

const demoTranscript =
  "Assalamualaikum, mujhe driver ka kaam chahiye G-9 ya G-10 ke qareeb. Mere paas 4 saal ka experience hai. Salary 40 hazaar se kam na ho. Main Monday se start kar sakta hoon.";

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
    return await transcribeWithGemini(input);
  } catch (error) {
    console.warn("Gemini transcription failed; using demo transcript.", error);
    return demoTranscript;
  }
}

export async function extractWorkerProfile(transcript: string) {
  try {
    return await extractProfileWithOpenRouter(transcript);
  } catch (openRouterError) {
    console.warn("OpenRouter profile extraction failed.", openRouterError);

    try {
      return await extractProfileWithGemini(transcript);
    } catch (geminiError) {
      console.warn("Gemini profile extraction failed; using heuristic profile.", geminiError);
      return buildFallbackProfile(transcript);
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

async function transcribeWithGemini(input: {
  bytes: ArrayBuffer;
  mimeType: string;
}) {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.8-flash";
  const data = Buffer.from(input.bytes).toString("base64");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this WhatsApp voice note exactly. If it mixes Urdu/Hindi and English, keep the same language in Roman Urdu where possible. Return transcript text only.",
              },
              {
                inline_data: {
                  mime_type: input.mimeType,
                  data,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini transcription returned ${response.status}`);
  }

  const json = (await response.json()) as GeminiGenerateContentResponse;
  const transcript = extractGeminiText(json).trim();

  if (!transcript) {
    throw new Error("Gemini transcription returned empty text");
  }

  return transcript;
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
      console.warn(`OpenRouter model ${model} failed.`, error);
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
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "Kaamyaabi",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.1,
      max_tokens: 500,
      provider: {
        require_parameters: true,
      },
      messages: [
        {
          role: "system",
          content:
            "Extract a Pakistani informal worker profile from WhatsApp text. Use sensible defaults only when the field is absent. Return JSON only.",
        },
        {
          role: "user",
          content: input.transcript,
        },
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
    throw new Error(`OpenRouter returned ${response.status}`);
  }

  const json = (await response.json()) as OpenRouterChatResponse;
  const content = json.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter returned empty content");
  }

  return parseProfileJson(content);
}

async function extractProfileWithGemini(transcript: string) {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Extract a worker profile from this WhatsApp message. Return JSON only with these keys: name, role, location, experienceYears, minimumSalaryPkr, skills, availability, languages.\n\nMessage:\n${transcript}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini profile extraction returned ${response.status}`);
  }

  const json = (await response.json()) as GeminiGenerateContentResponse;
  return parseProfileJson(extractGeminiText(json));
}

function parseProfileJson(content: string) {
  const jsonText = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return workerProfileSchema.parse(JSON.parse(jsonText));
}

function extractGeminiText(response: GeminiGenerateContentResponse) {
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function buildFallbackProfile(transcript: string): WorkerProfile {
  const salary = transcript.match(/(?:salary|pkr|rs|hazaar|k)\D*(\d{2,6})/i)?.[1];
  const years = transcript.match(/(\d+)\s*(?:years?|saal|year)/i)?.[1];

  return {
    name: "Ahmed Khan",
    role: /driver|drive|gaari/i.test(transcript) ? "Driver" : "Worker",
    location: /g-?9|g-?10/i.test(transcript)
      ? "G-9/G-10 Islamabad"
      : "Islamabad",
    experienceYears: years ? Number(years) : 4,
    minimumSalaryPkr: normalizeSalary(salary) ?? 40000,
    skills: ["Manual driving", "Automatic driving", "City routes"],
    availability: /monday|peer/i.test(transcript) ? "Monday" : "Immediately",
    languages: ["Urdu", "Punjabi"],
  };
}

function normalizeSalary(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const number = Number(value);
  if (Number.isNaN(number)) {
    return undefined;
  }

  return number < 1000 ? number * 1000 : number;
}

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};
