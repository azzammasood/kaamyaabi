export const runtime = "nodejs";

type BoringProjectWebhook = {
  sessionId?: string;
  status?: "submitted" | "needs_input" | "failed" | string;
  job?: {
    title?: string;
    companyName?: string;
    link?: string;
  };
  receiptUrl?: string;
  screenshotUrl?: string;
  questions?: string[];
  error?: string;
};

const webhookEvents: BoringProjectWebhook[] = [];

export async function POST(request: Request) {
  const event = (await request.json()) as BoringProjectWebhook;
  webhookEvents.unshift(event);
  webhookEvents.splice(20);

  console.log("BoringProject webhook received", {
    sessionId: event.sessionId,
    status: event.status,
    jobTitle: event.job?.title,
    companyName: event.job?.companyName,
    hasReceipt: Boolean(event.receiptUrl || event.screenshotUrl),
    questions: event.questions?.length ?? 0,
    error: event.error,
  });

  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({
    events: webhookEvents.map((event) => ({
      sessionId: event.sessionId,
      status: event.status,
      job: event.job,
      receiptUrl: event.receiptUrl,
      screenshotUrl: event.screenshotUrl,
      questions: event.questions,
      error: event.error,
    })),
  });
}
