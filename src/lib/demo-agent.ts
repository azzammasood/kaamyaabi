type WorkerProfile = {
  name: string;
  role: string;
  location: string;
  experienceYears: number;
  minimumSalaryPkr: number;
  skills: string[];
  availability: string;
  languages: string[];
};

type Session = {
  profile?: WorkerProfile;
  selectedJobId?: string;
  stage: "new" | "profile_review" | "jobs_shown" | "offer_made" | "confirmed";
};

export type WorkerMessage = {
  from: string;
  type?: string;
  text?: string;
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

  if (normalized === "apply" && session.profile) {
    session.stage = "offer_made";
    session.selectedJobId = jobs[0].id;
    sessions.set(message.from, session);

    return [
      "Got it. I will message the employer as your representative and negotiate within your limits.",
      "Employer simulation:\nPosted salary was PKR 38,000.\nI negotiated using your 4 years of driving experience and nearby location.\n\nGood news: final offer is PKR 45,000, Monday start, Sunday off.\n\nShould I confirm?\nReply CONFIRM.",
    ];
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
    const profile = buildDemoProfile();
    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [
      "Voice note received. For the demo, I transcribed it as:\n\nAssalamualaikum, mujhe driver ka kaam chahiye G-9 ya G-10 ke qareeb. Mere paas 4 saal ka experience hai. Salary 40 hazaar se kam na ho. Main Monday se start kar sakta hoon.",
      buildProfileReview(profile),
    ];
  }

  if (looksLikeProfileText(text)) {
    const profile = buildProfileFromText(text);
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

function buildDemoProfile(): WorkerProfile {
  return {
    name: "Ahmed Khan",
    role: "Driver",
    location: "G-9/G-10 Islamabad",
    experienceYears: 4,
    minimumSalaryPkr: 40000,
    skills: ["Manual driving", "Automatic driving", "City routes"],
    availability: "Monday",
    languages: ["Urdu", "Punjabi"],
  };
}

function buildProfileFromText(text: string): WorkerProfile {
  const profile = buildDemoProfile();
  const salary = text.match(/(?:salary|pkr|rs|hazaar|k)\D*(\d{2,6})/i)?.[1];
  const years = text.match(/(\d+)\s*(?:years?|saal|year)/i)?.[1];

  return {
    ...profile,
    experienceYears: years ? Number(years) : profile.experienceYears,
    minimumSalaryPkr: normalizeSalary(salary) ?? profile.minimumSalaryPkr,
  };
}

function normalizeSalary(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const number = Number(value);
  if (Number.isNaN(number)) {
    return undefined;
  }

  return number < 1000 ? number * 1000 : number;
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
Reply APPLY.`;
}
