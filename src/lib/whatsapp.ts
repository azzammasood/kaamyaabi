type WhatsAppMediaMetadata = {
  url?: string;
  mime_type?: string;
};

export async function downloadWhatsAppMedia(mediaId: string) {
  const token = process.env.WHATSAPP_TOKEN;

  if (!token) {
    throw new Error("WHATSAPP_TOKEN is not configured");
  }

  const metadataResponse = await fetch(
    `https://graph.facebook.com/v26.0/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!metadataResponse.ok) {
    throw new Error(`WhatsApp media metadata returned ${metadataResponse.status}`);
  }

  const metadata = (await metadataResponse.json()) as WhatsAppMediaMetadata;

  if (!metadata.url) {
    throw new Error("WhatsApp media metadata did not include a URL");
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!mediaResponse.ok) {
    throw new Error(`WhatsApp media download returned ${mediaResponse.status}`);
  }

  return {
    bytes: await mediaResponse.arrayBuffer(),
    mimeType:
      metadata.mime_type ||
      mediaResponse.headers.get("content-type") ||
      "audio/ogg",
  };
}
