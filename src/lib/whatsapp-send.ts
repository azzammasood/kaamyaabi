export async function sendWhatsAppText(to: string | undefined, body: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!to || !token || !phoneNumberId) {
    console.warn("Skipping WhatsApp reply because configuration is incomplete.");
    return;
  }

  const response = await fetch(
    `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body,
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("WhatsApp reply failed", {
      status: response.status,
      error,
    });
  }
}
