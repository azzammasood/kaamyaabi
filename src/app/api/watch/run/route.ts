import { runWatchChecks } from "@/lib/demo-agent";
import { sendWhatsAppText } from "@/lib/whatsapp-send";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return runScheduledWatch(request);
}

export async function POST(request: Request) {
  return runScheduledWatch(request);
}

async function runScheduledWatch(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const result = await runWatchChecks((phone, body) => sendWhatsAppText(phone, body));

  return Response.json({
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...result,
  });
}

function isAuthorized(request: Request) {
  const secret = process.env.WATCH_CRON_SECRET || process.env.TRIGGER_SECRET_KEY;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = url.searchParams.get("secret");

  return bearer === secret || querySecret === secret;
}
