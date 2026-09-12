import { extractWorkerProfile, type WorkerProfile } from "@/lib/ai";

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
    const profile = await extractWorkerProfile(transcript);
    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [
      `Voice note received. I transcribed it as:\n\n${transcript}`,
      buildProfileReview(profile),
    ];
  }

  if (looksLikeProfileText(text)) {
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

function looksLikeProfileText(text: string) {
  const normalized = text.toLowerCase();
  return (
    text.length > 25 &&
    (normalized.includes("driver") ||
      normalized.includes("kaam") ||
      normalized.includes("experience") ||
      normalized.includes("salary") ||
      normalized.includes("g-9") ||
      normalized.includes("g-10"))
  );
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
