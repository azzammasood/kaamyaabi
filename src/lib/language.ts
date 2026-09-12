export type LanguageCode = "english" | "urdu" | "pashto";

export function detectLanguage(text: string | undefined): LanguageCode {
  const value = text?.toLowerCase() ?? "";

  if (!value.trim()) {
    return "english";
  }

  if (
    /\b(pashto|pushto|pukhto|pakhto|pashtu|za|zama|sta|taaso|ta sara|kar kawal|ghwaram|rawalay|rawali)\b/i.test(
      value,
    )
  ) {
    return "pashto";
  }

  if (
    /\b(urdu|zubaan|assalam|salam|mujhe|mujhay|kaam|chahiye|chahye|qareeb|qarib|saal|hazaar|kar do|kardo|main|mein|hoon|hun)\b/i.test(
      value,
    )
  ) {
    return "urdu";
  }

  return "english";
}

export function detectLanguageChange(text: string | undefined): LanguageCode | undefined {
  const value = text?.toLowerCase() ?? "";

  if (!value) {
    return undefined;
  }

  const hasLanguageIntent =
    /\b(language|lang|zubaan|zaban|boli|speak|baat|kar do|kardo|switch)\b/i.test(
      value,
    );

  if (!hasLanguageIntent) {
    return undefined;
  }

  if (/\b(pashto|pushto|pukhto|pakhto|pashtu)\b/i.test(value)) {
    return "pashto";
  }

  if (/\b(urdu|roman urdu)\b/i.test(value)) {
    return "urdu";
  }

  if (/\b(english|angrezi)\b/i.test(value)) {
    return "english";
  }

  return undefined;
}

export function languageName(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Urdu";
    case "pashto":
      return "Pashto";
    default:
      return "English";
  }
}
