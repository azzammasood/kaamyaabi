import { extractWorkerProfile, getAiStatus, type WorkerProfile } from "@/lib/ai";

type Session = {
  profile?: WorkerProfile;
  selectedJobId?: string;
  stage: "new" | "profile_review" | "jobs_shown" | "offer_made" | "confirmed";
};

export type WorkerMessage = {
  from: string;
  type?: string;
  text?: string;
  transcript?: string;
};

const sessions = new Map<string, Session>();

const jobs = [
  {
    id: "family-driver-g10",
    title: "Family Driver",
    employer: "Khan Family",
    location: "G-10 Islamabad",
    salaryPkr: 38000,
    match: 92,
  },
  {
    id: "office-driver-f8",
    title: "Office Driver",
    employer: "Blue Area Office",
    location: "F-8 Islamabad",
    salaryPkr: 45000,
    match: 81,
  },
  {
    id: "delivery-driver-g11",
    title: "Delivery Driver",
    employer: "Local Delivery Co.",
    location: "G-11 Islamabad",
    salaryPkr: 35000,
    match: 64,
  },
];

export async function handleWorkerMessage(message: WorkerMessage) {
  const session = sessions.get(message.from) ?? { stage: "new" };
  const text = message.text?.trim() ?? "";
  const normalized = text.toLowerCase();

  if (["reset", "restart"].includes(normalized)) {
    sessions.set(message.from, { stage: "new" });
    return [
      "Demo reset. Send HI to start again.",
    ];
  }

  if (["status", "usage", "ai status"].includes(normalized)) {
    return [getAiStatus()];
  }

  if (["no", "n", "edit"].includes(normalized) && session.stage === "profile_review") {
    return [
      "No problem. Send the corrected details in one message.\n\nExample:\nDriver, G-9 Islamabad, 4 years experience, minimum salary 40000, available Monday.",
    ];
  }

  if (
    ["apply", "confirm"].includes(normalized) &&
    session.profile &&
    session.stage === "jobs_shown"
  ) {
    return beginNegotiation(message.from, session);
  }

  if (normalized === "apply" && session.profile) {
    return beginNegotiation(message.from, session);
  }

  if (normalized === "confirm" && session.stage === "offer_made") {
    session.stage = "confirmed";
    sessions.set(message.from, session);

    return [
      "Confirmed. I told the employer you will start Monday at 9 AM.\n\nI will ask them for exact address and contact person.",
      "Watcher also ready. Send: WATCH driver G-9 50000\nand I will keep looking for better verified jobs.",
    ];
  }

  if (normalized.startsWith("watch")) {
    return [
      "Done. I will keep watching for verified driver jobs near G-9 above PKR 50,000.",
      "Demo alert: New match found: Office Driver in G-8, PKR 50,000, verified employer.\nWant me to apply? Reply APPLY.",
    ];
  }

  if (["yes", "y"].includes(normalized) && session.profile) {
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return [
      buildCvMessage(session.profile),
      buildJobsMessage(session.profile),
    ];
  }

  if (message.type === "audio") {
    const transcript =
      message.transcript ||
      "Assalamualaikum, mujhe driver ka kaam chahiye G-9 ya G-10 ke qareeb. Mere paas 4 saal ka experience hai. Salary 40 hazaar se kam na ho. Main Monday se start kar sakta hoon.";

    if (!hasJobIntent(transcript)) {
      return [
        `Voice note received. I transcribed it as:\n\n${transcript}`,
        buildOutOfScopeMessage(),
      ];
    }

    const missingFields = getMissingProfileFields(transcript);

    if (missingFields.length > 0) {
      return [
        `Voice note received. I transcribed it as:\n\n${transcript}`,
        buildMissingDetailsMessage(missingFields),
      ];
    }

    const profile = await extractWorkerProfile(transcript);
    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [
      `Voice note received. I transcribed it as:\n\n${transcript}`,
      buildProfileReview(profile),
    ];
  }

  if (text && !isKnownShortCommand(normalized) && !hasJobIntent(text)) {
    return [buildOutOfScopeMessage()];
  }

  if (hasJobIntent(text)) {
    const missingFields = getMissingProfileFields(text);

    if (missingFields.length > 0) {
      return [buildMissingDetailsMessage(missingFields)];
    }

    const profile = await extractWorkerProfile(text);
    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [buildProfileReview(profile)];
  }

  return [
    "Assalamualaikum. I am Kaamyaabi, your job agent.\n\nSend one voice note or text with:\n- work you want\n- experience\n- area\n- minimum salary\n- availability",
  ];
}

function isKnownShortCommand(normalized: string) {
  return ["hi", "hello", "hey", "yes", "y", "no", "apply", "confirm"].includes(
    normalized,
  );
}

function hasJobIntent(text: string) {
  return (
    text.length > 8 &&
    /\b(job|work|kaam|naukri|rozgar|driver|react|developer|cook|chef|guard|maid|cleaner|electrician|plumber|delivery|sales|teacher|accountant)\b/i.test(
      text,
    )
  );
}

function buildOutOfScopeMessage() {
  return "I can help with job search only. Please send one voice note or text with the work you want, your experience, area, minimum salary, and availability.";
}

function getMissingProfileFields(text: string) {
  const missing: string[] = [];

  if (!hasRole(text)) {
    missing.push("work/role");
  }

  if (!hasLocation(text)) {
    missing.push("area/city");
  }

  if (!hasExperience(text)) {
    missing.push("experience");
  }

  if (!hasSalary(text)) {
    missing.push("minimum salary");
  }

  if (!hasAvailability(text)) {
    missing.push("availability");
  }

  return missing;
}

function hasRole(text: string) {
  return /\b(driver|react\s*native|reactnative|react|developer|cook|chef|guard|maid|cleaner|electrician|plumber|delivery|sales|teacher|accountant)\b/i.test(
    text,
  );
}

function hasLocation(text: string) {
  return /\b(islamabad|rawalpindi|lahore|karachi|peshawar|g-?\d+|f-?\d+|i-?\d+|near|qareeb|area|city)\b/i.test(
    text,
  );
}

function hasExperience(text: string) {
  return /\b(experience|experienced|saal|years?|mahine|months?|fresh|fresher)\b/i.test(
    text,
  );
}

function hasSalary(text: string) {
  return /(\b(salary|pkr|rs|rupees?|hazaar|minimum|kam na ho)\b.*\d{2,6})|(\d{2,6}.*\b(salary|pkr|rs|rupees?|hazaar|minimum|kam na ho)\b)|(\b\d+\s*k\b)|(\b\d{5,6}\b)/i.test(
    text,
  );
}

function hasAvailability(text: string) {
  return /\b(available|availability|start|monday|tuesday|wednesday|thursday|friday|saturday|sunday|peer|mangal|budh|jumma|hafta|immediately|foran|kal|tomorrow)\b/i.test(
    text,
  );
}

function buildMissingDetailsMessage(missingFields: string[]) {
  return `I can help, but I need a few more details before making your profile.

Missing: ${missingFields.join(", ")}

Please send one message like:
Electrician, Islamabad, 3 years experience, minimum salary 45000, available Monday.`;
}

function buildProfileReview(profile: WorkerProfile) {
  return `I made your worker profile:

Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Experience: ${profile.experienceYears} years
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}
Skills: ${profile.skills.join(", ")}
Available: ${profile.availability}

Is this correct? Reply YES.`;
}

function buildCvMessage(profile: WorkerProfile) {
  return `CV ready:

${profile.name}
${profile.role} - ${profile.location}

Experience: ${profile.experienceYears} years
Skills: ${profile.skills.join(", ")}
Languages: ${profile.languages.join(", ")}
Availability: ${profile.availability}
Verification: trusted worker badge pending`;
}

function buildJobsMessage(profile: WorkerProfile) {
  const bestJob = jobs[0];

  return `I found 3 matches.

Best match: ${bestJob.title} in ${bestJob.location}, PKR ${bestJob.salaryPkr.toLocaleString("en-PK")} (${bestJob.match}% match).

It is close to you, but below your minimum salary of PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}.

Should I negotiate for PKR 45,000?
Reply APPLY or CONFIRM.`;
}

function beginNegotiation(phone: string, session: Session) {
  session.stage = "offer_made";
  session.selectedJobId = jobs[0].id;
  sessions.set(phone, session);

  return [
    "Got it. I will message the employer as your representative and negotiate within your limits.",
    "Employer simulation:\nPosted salary was PKR 38,000.\nI negotiated using your 4 years of driving experience and nearby location.\n\nGood news: final offer is PKR 45,000, Monday start, Sunday off.\n\nShould I confirm?\nReply CONFIRM.",
  ];
}
