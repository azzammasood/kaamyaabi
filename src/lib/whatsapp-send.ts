export async function sendWhatsAppText(to: string | undefined, body: string) {
  return sendWhatsAppMessage(to, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  });
}

export async function sendWhatsAppButtons(
  to: string | undefined,
  body: string,
  buttons: Array<{ id: string; title: string }>,
) {
  return sendWhatsAppMessage(to, {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((button) => ({
          type: "reply",
          reply: {
            id: button.id.slice(0, 256),
            title: button.title.slice(0, 20),
          },
        })),
      },
    },
  });
}

export async function sendWhatsAppTyping(messageId: string | undefined) {
  if (!messageId) {
    return;
  }

  return sendWhatsAppMessage(undefined, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
    typing_indicator: {
      type: "text",
    },
  });
}

async function sendWhatsAppMessage(
  to: string | undefined,
  payload: Record<string, unknown>,
) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if ((!to && !payload.message_id) || !token || !phoneNumberId) {
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
      body: JSON.stringify(payload),
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
