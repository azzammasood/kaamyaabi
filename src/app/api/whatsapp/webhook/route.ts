type WhatsAppWebhookEntry = {
  changes?: Array<{
    value?: {
      messages?: Array<{
        from?: string;
        id?: string;
        timestamp?: string;
        type?: string;
        text?: {
          body?: string;
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

export const runtime = "nodejs";

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

  if (events.length > 0) {
    console.info("WhatsApp webhook events", events);
  }

  return Response.json({ received: true });
}

function extractWebhookEvents(payload: WhatsAppWebhookPayload) {
  return (
    payload.entry?.flatMap((entry) =>
      entry.changes?.flatMap((change) => {
        const messages =
          change.value?.messages?.map((message) => ({
            kind: "message",
            from: message.from,
            id: message.id,
            type: message.type,
            text: message.text?.body,
            timestamp: message.timestamp,
          })) ?? [];

        const statuses =
          change.value?.statuses?.map((status) => ({
            kind: "status",
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
