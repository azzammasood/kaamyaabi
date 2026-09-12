import { extractWorkerProfile, getAiStatus, type WorkerProfile } from "@/lib/ai";
import {
  findJobsForProfile,
  formatApplicationSummary,
  formatJobList,
  getJobBySelection,
  getJobSearchStatus,
  type JobListing,
} from "@/lib/jobs";

type Session = {
  jobs?: JobListing[];
  profile?: WorkerProfile;
  selectedJob?: JobListing;
  stage: "new" | "profile_review" | "jobs_shown" | "offer_made" | "confirmed";
};

export type WorkerMessage = {
  from: string;
  type?: string;
  text?: string;
  transcript?: string;
};

const sessions = new Map<string, Session>();

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
    return [buildStatusMessage()];
  }

  if (["jobs", "find jobs", "job listings"].includes(normalized)) {
    if (!session.profile) {
      return [
        "Please make your worker profile first. Send the work you want, experience, area, minimum salary, and availability.",
      ];
    }

    const jobs = await findJobsForProfile(session.profile);
    session.jobs = jobs;
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return [formatJobList(jobs, session.profile)];
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
    return beginApplication(message.from, session, text);
  }

  if (normalized === "apply" && session.profile) {
    return beginApplication(message.from, session, text);
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

    const jobs = await findJobsForProfile(session.profile);
    session.jobs = jobs;
    sessions.set(message.from, session);

    return [buildCvMessage(session.profile), formatJobList(jobs, session.profile)];
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
  return [
    "hi",
    "hello",
    "hey",
    "yes",
    "y",
    "no",
    "apply",
    "confirm",
    "jobs",
    "find jobs",
    "job listings",
    "status",
    "usage",
    "ai status",
  ].includes(normalized);
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

function beginApplication(phone: string, session: Session, text: string) {
  if (!session.profile) {
    return [
      "Please make your worker profile first. Send the work you want, experience, area, minimum salary, and availability.",
    ];
  }

  const job = getJobBySelection(session.jobs, text);

  if (!job) {
    return [
      "I do not have job matches yet. Reply YES after your profile, and I will find jobs first.",
    ];
  }

  session.stage = "offer_made";
  session.selectedJob = job;
  sessions.set(phone, session);

  const application = formatApplicationSummary(job, session.profile);

  return [application.started, application.offer];
}

function buildStatusMessage() {
  const jobStatus = getJobSearchStatus();

  return [
    getAiStatus(),
    `Job search status:

Provider: ${jobStatus.provider === "exa" ? "Exa live search" : "Seeded demo fallback"}
Exa live calls: ${jobStatus.liveCalls}
Exa failures: ${jobStatus.liveFailures}
Exa cost seen: $${jobStatus.liveCostDollars.toFixed(4)}
Last live search: ${jobStatus.lastSearchAt ?? "none"}
Last Exa error: ${jobStatus.lastError ?? "none"}`,
  ].join("\n\n");
}
