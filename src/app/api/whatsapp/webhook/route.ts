import { handleWorkerMessage, runWatchChecks } from "@/lib/demo-agent";
import { transcribeAudio } from "@/lib/ai";
import { downloadWhatsAppMedia } from "@/lib/whatsapp";
import {
  sendWhatsAppButtons,
  sendWhatsAppText,
  sendWhatsAppTyping,
} from "@/lib/whatsapp-send";

type WhatsAppWebhookEntry = {
  changes?: Array<{
    value?: {
      contacts?: Array<{
        profile?: {
          name?: string;
        };
        wa_id?: string;
      }>;
      messages?: Array<{
        from?: string;
        id?: string;
        timestamp?: string;
        type?: string;
        text?: {
          body?: string;
        };
        interactive?: {
          type?: string;
          button_reply?: {
            id?: string;
            title?: string;
          };
        };
        audio?: {
          id?: string;
          mime_type?: string;
        };
      }>;
      statuses?: Array<{
        id?: string;
        recipient_id?: string;
        status?: string;
        timestamp?: string;
      }>;
    };
  }>;
};

type WhatsAppWebhookPayload = {
  object?: string;
  entry?: WhatsAppWebhookEntry[];
};

type WhatsAppWebhookEvent =
  | {
      kind: "message";
      from: string | undefined;
      id: string | undefined;
      type: string | undefined;
      text: string | undefined;
      audioId: string | undefined;
      audioMimeType: string | undefined;
      contactName: string | undefined;
      contactPhone: string | undefined;
      timestamp: string | undefined;
    }
  | {
      kind: "status";
      id: string | undefined;
      recipientId: string | undefined;
      status: string | undefined;
      timestamp: string | undefined;
    };

export const runtime = "nodejs";

const globalForWebhookDedupe = globalThis as typeof globalThis & {
  __kaamyaabiProcessedMessageIds?: Map<string, number>;
};

const processedMessageIds =
  globalForWebhookDedupe.__kaamyaabiProcessedMessageIds ?? new Map<string, number>();
globalForWebhookDedupe.__kaamyaabiProcessedMessageIds = processedMessageIds;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return Response.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;
  const events = extractWebhookEvents(payload);
  const messages = events
    .filter((event) => event.kind === "message")
    .filter(shouldProcessMessage);

  if (events.length > 0) {
    console.info("WhatsApp webhook events", events);
  }

  Promise.all(messages.map(replyToWorker)).catch((error) => {
    console.error("WhatsApp background reply failed", error);
  });

  return Response.json({ received: true });
}

function shouldProcessMessage(message: Extract<WhatsAppWebhookEvent, { kind: "message" }>) {
  const now = Date.now();
  const ttlMs = 15 * 60 * 1000;

  for (const [id, seenAt] of processedMessageIds.entries()) {
    if (now - seenAt > ttlMs) {
      processedMessageIds.delete(id);
    }
  }

  if (!message.id) {
    return true;
  }

  if (processedMessageIds.has(message.id)) {
    console.info("Skipping duplicate WhatsApp message", {
      id: message.id,
      from: message.from,
    });
    return false;
  }

  processedMessageIds.set(message.id, now);
  return true;
}

function extractWebhookEvents(
  payload: WhatsAppWebhookPayload,
): WhatsAppWebhookEvent[] {
  return (
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => {
        const messages =
          change.value?.messages?.map((message) => {
            const contact = change.value?.contacts?.find(
              (candidate) => candidate.wa_id === message.from,
            );

            return {
              kind: "message" as const,
              from: message.from,
              id: message.id,
              type: message.type,
              text:
                message.text?.body ||
                message.interactive?.button_reply?.id ||
                message.interactive?.button_reply?.title,
              audioId: message.audio?.id,
              audioMimeType: message.audio?.mime_type,
              contactName: contact?.profile?.name,
              contactPhone: contact?.wa_id || message.from,
              timestamp: message.timestamp,
            };
          }) ?? [];

        const statuses =
          change.value?.statuses?.map((status) => ({
            kind: "status" as const,
            id: status.id,
            recipientId: status.recipient_id,
            status: status.status,
            timestamp: status.timestamp,
          })) ?? [];

        return [...messages, ...statuses];
      }) ?? [],
    ) ?? []
  );
}

async function replyToWorker(message: Extract<WhatsAppWebhookEvent, { kind: "message" }>) {
  if (!message.from) {
    return;
  }

  let transcript: string | undefined;
  const stopTyping = startTypingLoop(message.id);

  try {
    if (message.type === "audio" && message.audioId) {
      try {
        await sendWhatsAppText(message.from, "Listening to the voice note...");
        const audio = await downloadWhatsAppMedia(message.audioId);
        transcript = await transcribeAudio({
          bytes: audio.bytes,
          mimeType: message.audioMimeType || audio.mimeType,
        });
      } catch (error) {
        console.error("Voice note processing failed", error);
      }
    }

    const replies = await handleWorkerMessage({
      from: message.from,
      type: message.type,
      text: message.text,
      transcript,
      sendProgress: async (body) => {
        await sleep(900);
        await sendWhatsAppText(message.from, body);
      },
      contact: {
        name: message.contactName,
        phone: message.contactPhone || message.from,
        whatsappName: message.contactName,
      },
    });

    for (const reply of replies) {
      await sleep(650);

      if (typeof reply === "string") {
        await sendWhatsAppText(message.from, reply);
      } else {
        await sendWhatsAppButtons(message.from, reply.body, reply.buttons);
      }
    }
  } finally {
    stopTyping();
  }
}

function startTypingLoop(messageId: string | undefined) {
  let stopped = false;

  const tick = () => {
    if (!stopped) {
      sendWhatsAppTyping(messageId).catch((error) => {
        console.warn("WhatsApp typing indicator failed", error);
      });
    }
  };

  tick();
  const timer = setInterval(tick, 4500);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const globalForWatch = globalThis as typeof globalThis & {
  __kaamyaabiWatchStarted?: boolean;
};

if (!globalForWatch.__kaamyaabiWatchStarted && process.env.WATCH_ENABLED !== "false") {
  globalForWatch.__kaamyaabiWatchStarted = true;
  const intervalMs = Number(process.env.WATCH_INTERVAL_MS ?? 5 * 60 * 1000);

  setInterval(() => {
    runWatchChecks((phone, body) => sendWhatsAppText(phone, body)).catch((error) => {
      console.error("Watch check failed", error);
    });
  }, Number.isFinite(intervalMs) && intervalMs >= 30_000 ? intervalMs : 5 * 60 * 1000);
}
