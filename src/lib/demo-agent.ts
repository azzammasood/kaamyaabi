import {
  extractWorkerProfile,
  getAiStatus,
  getAiUsageSummary,
  type WorkerProfile,
} from "@/lib/ai";
import { runJobApplicationAgent } from "@/lib/job-application-agent";
import { runJobHuntingAgent } from "@/lib/job-hunting-agent";
import {
  formatJobMessages,
  getApplicationStatus,
  getJobBySelection,
  getJobSearchStatus,
  type ApplicantContact,
  type JobListing,
} from "@/lib/jobs";
import {
  detectLanguage,
  detectLanguageChange,
  type LanguageCode,
} from "@/lib/language";
import {
  runTrustAgent,
} from "@/lib/trust-agent";
import { assessWorkerTrust, formatTrustBadge } from "@/lib/trust";

export type AgentReply =
  | string
  | {
      kind: "buttons";
      body: string;
      buttons: Array<{ id: string; title: string }>;
    };

type Session = {
  applications?: Array<{
    jobId: string;
    jobTitle: string;
    provider: "boringproject" | "email" | "manual";
    submittedAt: string;
  }>;
  contact?: ApplicantContact;
  jobs?: JobListing[];
  language?: LanguageCode;
  profile?: WorkerProfile;
  rejectedJobIds?: string[];
  selectedJob?: JobListing;
  stage: "new" | "profile_review" | "jobs_shown" | "application_ready" | "applied";
  watchMode?: {
    autoApply: boolean;
    createdAt: string;
    lastCheckedAt?: string;
    lastTopJobId?: string;
  };
};

export type WorkerMessage = {
  from: string;
  type?: string;
  text?: string;
  transcript?: string;
  sendProgress?: (body: string) => Promise<void>;
  contact?: ApplicantContact;
};

const globalForSessions = globalThis as typeof globalThis & {
  __kaamyaabiSessions?: Map<string, Session>;
};

const sessions = globalForSessions.__kaamyaabiSessions ?? new Map<string, Session>();
globalForSessions.__kaamyaabiSessions = sessions;

export async function handleWorkerMessage(message: WorkerMessage): Promise<AgentReply[]> {
  const session = sessions.get(message.from) ?? { stage: "new" };
  const text = message.text?.trim() ?? "";
  const spokenText = message.transcript?.trim() || text;
  const normalized = text.toLowerCase();
  const requestedLanguage = detectLanguageChange(spokenText);

  if (requestedLanguage) {
    session.language = requestedLanguage;
    sessions.set(message.from, session);
    return [languageChangedMessage(requestedLanguage)];
  }

  if (!session.language && spokenText) {
    session.language = detectLanguage(spokenText);
    sessions.set(message.from, session);
  }

  const language = session.language ?? "english";
  session.contact = mergeApplicantContact(session.contact, message.contact, text);
  sessions.set(message.from, session);

  if (["reset", "restart"].includes(normalized)) {
    sessions.set(message.from, { stage: "new", language });
    return [resetMessage(language)];
  }

  if (normalized === "status") {
    return [buildStatusMessage(language)];
  }

  if (["usage", "ai status"].includes(normalized)) {
    return [getAiUsageSummary()];
  }

  if (["jobs", "find jobs", "job listings"].includes(normalized)) {
    if (!session.profile) {
      return [needsProfileMessage(language)];
    }

    await sendProgress(message, progressMessage("jobs", language));
    const jobs = await runJobHuntingAgent(session.profile);
    session.jobs = jobs;
    session.rejectedJobIds = [];
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return buildJobListingReplies(jobs, session.profile, language);
  }

  if (isDirectContactCommand(normalized)) {
    if (!session.profile) {
      return [needsProfileMessage(language)];
    }

    await sendProgress(message, progressMessage("direct", language));
    const jobs = await runJobHuntingAgent(session.profile, {
      preferDirectContact: true,
    });
    session.jobs = jobs;
    session.rejectedJobIds = [];
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return [
      directContactIntro(language),
      ...buildJobListingReplies(jobs, session.profile, language),
    ];
  }

  if (isProfileNoCommand(normalized) && session.stage === "profile_review") {
    return [editProfileMessage(language)];
  }

  if (isApplicationDoneCommand(normalized) && session.stage === "application_ready") {
    if (session.selectedJob) {
      session.applications = [
        ...(session.applications ?? []),
        {
          jobId: session.selectedJob.id,
          jobTitle: session.selectedJob.title,
          provider: "manual",
          submittedAt: new Date().toISOString(),
        },
      ];
    }

    session.stage = "applied";
    sessions.set(message.from, session);

    return [submittedMessage(language), watchSuggestionReply(language)];
  }

  if (isSaveApplicationCommand(normalized) && session.stage === "application_ready") {
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return [savedForLaterMessage(language)];
  }

  if (isWatchYesCommand(normalized) && session.profile && session.stage === "applied") {
    await sendProgress(message, progressMessage("watch", language));
    const jobs = await runJobHuntingAgent(session.profile, {
      preferDirectContact: true,
    });
    session.jobs = jobs;
    session.rejectedJobIds = [];
    session.stage = "jobs_shown";
    session.watchMode = {
      autoApply: true,
      createdAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      lastTopJobId: jobs[0]?.id,
    };
    sessions.set(message.from, session);

    return [
      watchApplyActiveMessage(language),
      ...buildJobListingReplies(jobs, session.profile, language),
    ];
  }

  if (isWatchNoCommand(normalized) && session.stage === "applied") {
    return [watchDeclinedMessage(language)];
  }

  if (normalized === "confirm" && session.stage === "application_ready") {
    return [confirmNeedsSubmissionMessage(language)];
  }

  if (isRejectCommand(normalized) && session.profile && session.stage === "jobs_shown") {
    return rejectJob(message.from, session, text);
  }

  if (isApplyCommand(normalized) && session.profile && session.jobs?.length) {
    return beginApplication(message.from, session, text, message);
  }

  if (isApplyCommand(normalized)) {
    return [noCurrentMatchesMessage(language)];
  }

  if (normalized.startsWith("watch")) {
    if (session.profile) {
      const autoApply = /\bapply\b/.test(normalized);
      await sendProgress(message, progressMessage("watch", language));
      const jobs = await runJobHuntingAgent(session.profile, {
        preferDirectContact: true,
      });
      session.jobs = jobs;
      session.rejectedJobIds = [];
      session.stage = "jobs_shown";
      session.watchMode = {
        autoApply,
        createdAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        lastTopJobId: jobs[0]?.id,
      };
      sessions.set(message.from, session);

      if (autoApply && jobs[0]) {
        const application = await beginApplication(
          message.from,
          session,
          "APPLY 1",
          message,
        );

        return [
          watchApplyActiveMessage(language),
          ...buildJobListingReplies(jobs, session.profile, language),
          ...application,
        ];
      }

      return [
        watchActiveMessage(language),
        ...buildJobListingReplies(jobs, session.profile, language),
      ];
    }

    return [watchNeedsProfileMessage(language)];
  }

  if (isProfileYesCommand(normalized) && session.profile) {
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    await sendProgress(message, progressMessage("jobs", language));
    const jobs = await runJobHuntingAgent(session.profile);
    session.jobs = jobs;
    session.rejectedJobIds = [];
    sessions.set(message.from, session);

    return [
      buildCvMessage(session.profile, language),
      ...buildJobListingReplies(jobs, session.profile, language),
    ];
  }

  if (message.type === "audio") {
    const transcript =
      message.transcript ||
      "Assalamualaikum, mujhe driver ka kaam chahiye G-9 ya G-10 ke qareeb. Mere paas 4 saal ka experience hai. Salary 40 hazaar se kam na ho. Main Monday se start kar sakta hoon.";

    if (!hasJobIntent(transcript)) {
      return [
        voiceTranscriptMessage(transcript, language),
        buildOutOfScopeMessage(language),
      ];
    }

    const missingFields = getMissingProfileFields(transcript).filter(
      (field) => field !== "name" || !hasContactName(session.contact),
    );

    if (missingFields.length > 0) {
      return [
        voiceTranscriptMessage(transcript, language),
        buildMissingDetailsMessage(missingFields, language),
      ];
    }

    await sendProgress(message, progressMessage("profile", language));
    const profile = applyContactName(
      await extractWorkerProfile(transcript, {
        preferredProvider: "gemini",
      }),
      session.contact,
    );
    const profileMissingFields = getMissingExtractedProfileFields(profile);

    if (profileMissingFields.length > 0) {
      return [
        voiceTranscriptMessage(transcript, language),
        buildMissingDetailsMessage(profileMissingFields, language),
      ];
    }

    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [
      voiceTranscriptMessage(transcript, language),
      buildProfileReviewReply(profile, language, session.contact ?? { phone: message.from }),
    ];
  }

  if (session.profile && session.selectedJob && text.length > 8) {
    return [buildNegotiationReply(session.profile, session.selectedJob, text, language)];
  }

  if (text && !isKnownShortCommand(normalized) && !hasJobIntent(text)) {
    return [buildOutOfScopeMessage(language)];
  }

  if (hasJobIntent(text)) {
    const missingFields = getMissingProfileFields(text).filter(
      (field) => field !== "name" || !hasContactName(session.contact),
    );

    if (missingFields.length > 0) {
      return [buildMissingDetailsMessage(missingFields, language)];
    }

    await sendProgress(message, progressMessage("profile", language));
    const profile = applyContactName(
      await extractWorkerProfile(text, {
        preferredProvider: "openrouter",
      }),
      session.contact,
    );
    const profileMissingFields = getMissingExtractedProfileFields(profile);

    if (profileMissingFields.length > 0) {
      return [buildMissingDetailsMessage(profileMissingFields, language)];
    }

    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [buildProfileReviewReply(profile, language, session.contact ?? { phone: message.from })];
  }

  return [introMessage(language)];
}

export async function runWatchChecks(
  sendMessage: (phone: string, body: string) => Promise<void>,
) {
  const watchedSessions = Array.from(sessions.entries()).filter(
    ([, session]) => session.watchMode && session.profile,
  );
  let alertsSent = 0;
  let applicationsStarted = 0;

  for (const [phone, session] of watchedSessions) {
    if (!session.profile || !session.watchMode) {
      continue;
    }

    const language = session.language ?? "english";
    const jobs = await runJobHuntingAgent(session.profile, {
      preferDirectContact: true,
    });
    const topJob = jobs[0];

    session.jobs = jobs;
    session.rejectedJobIds = [];
    session.stage = "jobs_shown";
    session.watchMode.lastCheckedAt = new Date().toISOString();

    if (!topJob || topJob.id === session.watchMode.lastTopJobId) {
      sessions.set(phone, session);
      continue;
    }

    session.watchMode.lastTopJobId = topJob.id;
    sessions.set(phone, session);

    await sendMessage(phone, watchAlertMessage(language, topJob, session.profile));
    alertsSent += 1;

    if (session.watchMode.autoApply) {
      const applicationMessages = await beginApplication(phone, session, "APPLY 1");

      for (const reply of applicationMessages) {
        await sendMessage(phone, replyToText(reply));
      }

      applicationsStarted += 1;
    }
  }

  return {
    alertsSent,
    applicationsStarted,
    checkedSessions: watchedSessions.length,
  };
}

function isKnownShortCommand(normalized: string) {
  if (isApplyCommand(normalized) || isRejectCommand(normalized)) {
    return true;
  }

  return [
    "hi",
    "hello",
    "hey",
    "yes",
    "y",
    "profile_yes",
    "no",
    "reject",
    "profile_no",
    "edit",
    "apply",
    "approve",
    "confirm",
    "done",
    "submitted",
    "application_done",
    "save_later",
    "save for later",
    "jobs",
    "find jobs",
    "job listings",
    "contacts",
    "direct jobs",
    "direct contact",
    "opportunities",
    "status",
    "usage",
    "ai status",
  ].includes(normalized);
}

function mergeApplicantContact(
  current: ApplicantContact | undefined,
  incoming: ApplicantContact | undefined,
  text: string,
): ApplicantContact {
  const emailFromText = text
    .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
    ?.trim();

  return {
    ...current,
    ...incoming,
    email: incoming?.email || emailFromText || current?.email,
    name: incoming?.name || current?.name,
    phone: incoming?.phone || current?.phone,
    whatsappName: incoming?.whatsappName || current?.whatsappName,
  };
}

function applyContactName(
  profile: WorkerProfile,
  contact: ApplicantContact | undefined,
): WorkerProfile {
  if (profile.name.trim().toLowerCase() !== "not provided") {
    return profile;
  }

  const fallbackName = contact?.name || contact?.whatsappName;
  if (!hasContactName(contact) || !fallbackName) {
    return profile;
  }

  return {
    ...profile,
    name: fallbackName.trim(),
  };
}

function hasContactName(contact: ApplicantContact | undefined) {
  const value = contact?.name || contact?.whatsappName;
  return Boolean(value && value.trim().length > 1 && !/^\+?\d/.test(value.trim()));
}

function isApplyCommand(normalized: string) {
  return /^(apply|approve|confirm)([\s_]+[1-3])?$/.test(normalized);
}

function isRejectCommand(normalized: string) {
  return /^(reject|skip|no)([\s_]+[1-3])?$/.test(normalized);
}

function isProfileYesCommand(normalized: string) {
  return ["yes", "y", "profile_yes"].includes(normalized);
}

function isProfileNoCommand(normalized: string) {
  return ["no", "n", "edit", "profile_no"].includes(normalized);
}

function isApplicationDoneCommand(normalized: string) {
  return ["done", "submitted", "application_done"].includes(normalized);
}

function isSaveApplicationCommand(normalized: string) {
  return ["save_later", "save later", "save for later", "draft"].includes(normalized);
}

function isWatchYesCommand(normalized: string) {
  return ["yes", "y", "watch_yes", "start watching", "start watcher"].includes(normalized);
}

function isWatchNoCommand(normalized: string) {
  return ["no", "n", "watch_no", "skip watching"].includes(normalized);
}

function isDirectContactCommand(normalized: string) {
  return /^(contacts?|direct jobs?|direct contact|opportunities|opportunity search)$/.test(
    normalized,
  );
}

async function sendProgress(
  message: Pick<WorkerMessage, "sendProgress"> | undefined,
  body: string,
) {
  if (!message?.sendProgress) {
    return;
  }

  try {
    await message.sendProgress(body);
  } catch (error) {
    console.warn("Progress message failed", error);
  }
}

function progressMessage(
  stage: "profile" | "jobs" | "direct" | "watch" | "apply",
  language: LanguageCode,
) {
  const messages = {
    profile: {
      english: "Reading your details and building the worker profile...",
      urdu: "Aapki details parh kar worker profile bana raha hoon...",
      pashto: "Sta details goram aw worker profile jorawom...",
    },
    jobs: {
      english: "Scavenging jobs and ranking the safest matches...",
      urdu: "Jobs dhoond raha hoon aur safe matches rank kar raha hoon...",
      pashto: "Jobs ltom aw safe matches rank kawom...",
    },
    direct: {
      english: "Scouting direct-contact opportunities...",
      urdu: "Direct-contact opportunities dhoond raha hoon...",
      pashto: "Direct-contact opportunities ltom...",
    },
    watch: {
      english: "Setting up the watcher and checking fresh listings...",
      urdu: "Watcher set kar raha hoon aur fresh listings check kar raha hoon...",
      pashto: "Watcher set kawom aw fresh listings check kawom...",
    },
    apply: {
      english: "Preparing the safest application path...",
      urdu: "Sab se safe application path tayyar kar raha hoon...",
      pashto: "Da apply safe path tayyarawom...",
    },
  };

  return messages[stage][language];
}

function hasJobIntent(text: string) {
  return (
    text.length > 8 &&
    /\b(job|work|kaam|naukri|rozgar|driver|react|developer|cook|chef|guard|maid|cleaner|electrician|plumber|delivery|sales|teacher|accountant)\b/i.test(
      text,
    )
  );
}

function buildOutOfScopeMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Main job search mein madad karta hoon. Barah-e-karam ek voice note ya text bhejein: kaunsa kaam, experience, area, minimum salary, aur availability.";
    case "pashto":
      return "Za sirf da kar/job search ke madad kawom. Mehrabani oka yo voice note ya text rawalega: kum kar, tajriba, area, minimum salary, aw availability.";
    default:
      return "I can help with job search only. Please send one voice note or text with the work you want, your experience, area, minimum salary, and availability.";
  }
}

function getMissingProfileFields(text: string) {
  const missing: string[] = [];

  if (!hasName(text)) {
    missing.push("name");
  }

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

function getMissingExtractedProfileFields(profile: WorkerProfile) {
  const missing: string[] = [];

  if (!profile.name || /^not (provided|specified)$/i.test(profile.name)) {
    missing.push("name");
  }

  if (!profile.role || /^not (provided|specified)$/i.test(profile.role)) {
    missing.push("work/role");
  }

  if (!profile.location || /^not (provided|specified)$/i.test(profile.location)) {
    missing.push("area/city");
  }

  if (!Number.isFinite(profile.experienceYears) || profile.experienceYears < 0) {
    missing.push("experience");
  }

  if (!Number.isFinite(profile.minimumSalaryPkr) || profile.minimumSalaryPkr <= 0) {
    missing.push("minimum salary");
  }

  if (!profile.availability || /^not (provided|specified)$/i.test(profile.availability)) {
    missing.push("availability");
  }

  if (!profile.skills.some((skill) => !/^not (provided|specified)$/i.test(skill))) {
    missing.push("skills");
  }

  return missing;
}

function hasName(text: string) {
  return /\b(mera naam|mere naam|my name is|name is|naam|i am|i'm|main|mein)\s+[A-Za-z][A-Za-z .'-]{1,50}/i.test(
    text,
  );
}

function hasRole(text: string) {
  return /\b(driver|react\s*native|reactnative|react|developer|cook|chef|guard|maid|cleaner|electrician|plumber|delivery|sales|teacher|accountant)\b/i.test(
    text,
  );
}

function hasLocation(text: string) {
  return /\b(islamabad|rawalpindi|lahore|karachi|peshawar|g-?\d+|f-?\d+|i-?\d+)\b/i.test(
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

function buildMissingDetailsMessage(missingFields: string[], language: LanguageCode) {
  if (language === "urdu") {
    return `Main madad kar sakta hoon, lekin profile banane ke liye kuch details chahiye.

Missing: ${missingFields.join(", ")}

Ek message is tarah bhejein:
Electrician, Islamabad, 3 years experience, minimum salary 45000, available Monday.`;
  }

  if (language === "pashto") {
    return `Za madad kawalay sham, kho profile la para nor details pakar di.

Missing: ${missingFields.join(", ")}

Yo message da se rawalega:
Electrician, Islamabad, 3 years experience, minimum salary 45000, available Monday.`;
  }

  return `I can help, but I need a few more details before making your profile.

Missing: ${missingFields.join(", ")}

Please send one message like:
Electrician, Islamabad, 3 years experience, minimum salary 45000, available Monday.`;
}

function buildProfileReview(
  profile: WorkerProfile,
  language: LanguageCode,
  contact?: ApplicantContact,
) {
  const workerTrust = assessWorkerTrust(profile, contact);
  const trustLine = `Worker check: ${formatTrustBadge(workerTrust)}${
    workerTrust.warnings.length > 0
      ? `\nTrust notes: ${workerTrust.warnings.join("; ")}`
      : ""
  }`;

  if (language === "urdu") {
    return `Maine aapki worker profile bana di:

Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Experience: ${profile.experienceYears} years
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}
Skills: ${profile.skills.join(", ")}
Available: ${profile.availability}
${trustLine}

Kya yeh theek hai? YES reply karein.`;
  }

  if (language === "pashto") {
    return `Ma sta worker profile jora kra:

Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Experience: ${profile.experienceYears} years
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}
Skills: ${profile.skills.join(", ")}
Available: ${profile.availability}
${trustLine}

Da sahi da? YES reply oka.`;
  }

  return `I made your worker profile:

Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Experience: ${profile.experienceYears} years
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}
Skills: ${profile.skills.join(", ")}
Available: ${profile.availability}
${trustLine}

Is this correct? Reply YES.`;
}

function buildProfileReviewReply(
  profile: WorkerProfile,
  language: LanguageCode,
  contact?: ApplicantContact,
): AgentReply {
  const yesTitle = language === "pashto" ? "Yes" : language === "urdu" ? "Yes" : "Yes";
  const noTitle = language === "pashto" ? "No" : language === "urdu" ? "No" : "No";

  return {
    kind: "buttons",
    body: buildProfileReview(profile, language, contact),
    buttons: [
      { id: "PROFILE_YES", title: yesTitle },
      { id: "PROFILE_NO", title: noTitle },
    ],
  };
}

function buildCvMessage(profile: WorkerProfile, language: LanguageCode) {
  if (language === "urdu") {
    return `CV tayyar:

${profile.name}
${profile.role} - ${profile.location}

Experience: ${profile.experienceYears} years
Skills: ${profile.skills.join(", ")}
Languages: ${profile.languages.join(", ")}
Availability: ${profile.availability}
Verification: trusted worker badge pending`;
  }

  if (language === "pashto") {
    return `CV tayyar da:

${profile.name}
${profile.role} - ${profile.location}

Experience: ${profile.experienceYears} years
Skills: ${profile.skills.join(", ")}
Languages: ${profile.languages.join(", ")}
Availability: ${profile.availability}
Verification: trusted worker badge pending`;
  }

  return `CV ready:

${profile.name}
${profile.role} - ${profile.location}

Experience: ${profile.experienceYears} years
Skills: ${profile.skills.join(", ")}
Languages: ${profile.languages.join(", ")}
Availability: ${profile.availability}
Verification: trusted worker badge pending`;
}

function rejectJob(phone: string, session: Session, text: string) {
  const job = getJobBySelection(session.jobs, text);
  const language = session.language ?? "english";

  if (!job) {
    return [noCurrentMatchesMessage(language)];
  }

  session.rejectedJobIds = [...new Set([...(session.rejectedJobIds ?? []), job.id])];
  sessions.set(phone, session);

  const remainingJobs =
    session.jobs?.filter((candidate) => !session.rejectedJobIds?.includes(candidate.id)) ??
    [];

  if (remainingJobs.length === 0) {
    return [
      language === "urdu"
        ? "Rejected. Is list mein aur jobs nahi bachi. JOBS bhejein aur main fresh search chala dunga."
        : language === "pashto"
          ? "Rejected. De list ke nor jobs nishta. JOBS rawalega, za ba fresh search okram."
          : "Rejected. No more jobs left in this list. Send JOBS and I will run a fresh search.",
    ];
  }

  return [
    language === "urdu"
      ? `Rejected #${getSelectionNumber(text)}. Agli job approve kar sakte hain, ya JOBS bhej kar fresh search.`
      : language === "pashto"
        ? `Rejected #${getSelectionNumber(text)}. Bala job approve kawalay she, ya JOBS rawalega.`
        : `Rejected #${getSelectionNumber(text)}. You can approve another job, or send JOBS for a fresh search.`,
  ];
}

async function beginApplication(
  phone: string,
  session: Session,
  text: string,
  message?: WorkerMessage,
) {
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

  session.stage = "application_ready";
  session.selectedJob = job;
  sessions.set(phone, session);

  const trustGate = runTrustAgent({
    contact: session.contact ?? { phone },
    job,
    profile: session.profile,
  });

  if (!trustGate.allowed) {
    return [
      trustBlockedMessage(
        trustGate.workerTrust,
        trustGate.jobTrust,
        session.language ?? "english",
      ),
    ];
  }

  await sendProgress(message, progressMessage("apply", session.language ?? "english"));

  const application = await runJobApplicationAgent({
    applicantContact: session.contact ?? { phone },
    job,
    language: session.language ?? "english",
    profile: session.profile,
  });

  if (application.status === "queued" || application.status === "sent") {
    session.stage = "applied";
    session.applications = [
      ...(session.applications ?? []),
      {
        jobId: job.id,
        jobTitle: job.title,
        provider: application.provider,
        submittedAt: new Date().toISOString(),
      },
    ];
    sessions.set(phone, session);
  }

  if (application.status === "needs_manual_submit") {
    const replies: AgentReply[] = application.messages.slice(0, -1);
    const handoff = application.messages.at(-1);

    if (handoff) {
      replies.push({
        kind: "buttons",
        body: handoff,
        buttons: [
          { id: "APPLICATION_DONE", title: "Done" },
          { id: "SAVE_LATER", title: "Save Later" },
        ],
      });
    }

    return replies;
  }

  return application.messages;
}

function trustBlockedMessage(
  workerTrust: Parameters<typeof formatTrustBadge>[0],
  jobTrust: Parameters<typeof formatTrustBadge>[0],
  language: LanguageCode,
) {
  const details = `Worker check: ${formatTrustBadge(workerTrust)}
${workerTrust.warnings.length > 0 ? `Worker notes: ${workerTrust.warnings.join("; ")}\n` : ""}Job trust: ${formatTrustBadge(jobTrust)}
${jobTrust.warnings.length > 0 ? `Job notes: ${jobTrust.warnings.join("; ")}` : ""}`;

  if (language === "urdu") {
    return `Safety check ne apply block kar diya.

${details}

JOBS bhejein aur better verified listing choose karein, ya profile/contact details complete karein.`;
  }

  if (language === "pashto") {
    return `Safety check apply block ko.

${details}

JOBS rawalega aw better verified listing choose oka, ya profile/contact details complete kra.`;
  }

  return `Safety check blocked this application.

${details}

Send JOBS and choose a better verified listing, or complete your profile/contact details.`;
}

function getSelectionNumber(text: string) {
  return text.match(/(?:^|[^0-9])([1-3])(?:$|[^0-9])/)?.[1] ?? "1";
}

function replyToText(reply: AgentReply) {
  if (typeof reply === "string") {
    return reply;
  }

  return `${reply.body}\n\n${reply.buttons
    .map((button) => `${button.title}: ${button.id.replace("_", " ")}`)
    .join("\n")}`;
}

function buildStatusMessage(language: LanguageCode) {
  const jobStatus = getJobSearchStatus();
  const applyStatus = getApplicationStatus();
  const heading =
    language === "urdu"
      ? "Status:"
      : language === "pashto"
        ? "Status:"
        : "Status:";

  return [
    heading,
    getAiStatus(),
    `Agent orchestration:

CrewAI integrated: no
Runtime orchestration: TypeScript agents
Agents: job hunting, trust/verification, job application`,
    `Job search status:

Provider: ${jobStatus.provider === "exa" ? "Exa live search" : "Seeded demo fallback"}
Exa live calls: ${jobStatus.liveCalls}
Exa failures: ${jobStatus.liveFailures}
Live results seen: ${jobStatus.liveResultsSeen}
Duplicates removed: ${jobStatus.duplicateResultsRemoved}
Sources queried: ${jobStatus.sourcesQueried.length > 0 ? jobStatus.sourcesQueried.join(", ") : "none yet"}
Exa cost seen: $${jobStatus.liveCostDollars.toFixed(4)}
Last live search: ${jobStatus.lastSearchAt ?? "none"}
Last Exa error: ${jobStatus.lastError ?? "none"}
Applications marked submitted: ${countSubmittedApplications()}
Active watch sessions: ${countWatchSessions()}

Application provider:
Auto-apply: ${process.env.BORING_PROJECT_API_KEY ? "BoringProject configured" : "manual handoff only"}
BoringProject calls: ${applyStatus.boringProjectCalls}
BoringProject failures: ${applyStatus.boringProjectFailures}
Contact discovery calls: ${applyStatus.contactDiscoveryCalls}
Contact discovery failures: ${applyStatus.contactDiscoveryFailures}
Mock contact discoveries: ${applyStatus.mockContactDiscoveries}
Email send calls: ${applyStatus.emailSendCalls}
Email send failures: ${applyStatus.emailSendFailures}
Mock email sends: ${applyStatus.mockEmailSends}
Manual handoffs: ${applyStatus.manualHandoffs}
Last application provider: ${applyStatus.lastProvider}
Last application status: ${applyStatus.lastStatus}
Last fallback path: ${applyStatus.lastFallbackPath ?? "none"}
Last provider session: ${applyStatus.lastSessionId ?? "none"}
Last provider error: ${applyStatus.lastError ?? "none"}`,
  ].join("\n\n");
}

function countSubmittedApplications() {
  return Array.from(sessions.values()).reduce(
    (total, session) => total + (session.applications?.length ?? 0),
    0,
  );
}

function countWatchSessions() {
  return Array.from(sessions.values()).filter((session) => session.watchMode).length;
}

function languageChangedMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Theek hai, ab main Urdu/Roman Urdu mein jawab dunga.";
    case "pashto":
      return "Theek da, os ba za Pashto/Roman Pashto ke jawab dar kawom.";
    default:
      return "Done, I will reply in English now.";
  }
}

function resetMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Demo reset ho gaya. Dobara shuru karne ke liye HI bhejein.";
    case "pashto":
      return "Demo reset sho. Da bia shuru la para HI rawalega.";
    default:
      return "Demo reset. Send HI to start again.";
  }
}

function needsProfileMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Pehle worker profile banayein. Kaam, experience, area, minimum salary, aur availability bhejein.";
    case "pashto":
      return "Lomray worker profile jora kra. Kar, tajriba, area, minimum salary, aw availability rawalega.";
    default:
      return "Please make your worker profile first. Send the work you want, experience, area, minimum salary, and availability.";
  }
}

function directContactIntro(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Direct-contact search chal gayi. Main phone/email/WhatsApp wali opportunities ko pehle rank kar raha hoon.";
    case "pashto":
      return "Direct-contact search shuru sho. Za phone/email/WhatsApp wali opportunities makhke rank kawom.";
    default:
      return "Direct-contact search is running. I am prioritizing jobs with phone, email, or WhatsApp contact routes.";
  }
}

function buildJobListingReplies(
  jobs: JobListing[],
  profile: WorkerProfile,
  language: LanguageCode,
): AgentReply[] {
  const sourceLabel = jobs.some((job) => job.source === "live")
    ? "multi-source live search"
    : "demo fallback";
  const liveSources = [
    ...new Set(jobs.filter((job) => job.source === "live").map((job) => job.sourceLabel)),
  ];
  const intro =
    language === "urdu"
      ? `${jobs.length} jobs mil gayi.\n${liveSources.length > 0 ? `Sources: ${liveSources.join(", ")}` : `Source: ${sourceLabel}`}`
      : language === "pashto"
        ? `${jobs.length} jobs paida shwe.\n${liveSources.length > 0 ? `Sources: ${liveSources.join(", ")}` : `Source: ${sourceLabel}`}`
        : `${jobs.length} jobs found.\n${liveSources.length > 0 ? `Sources: ${liveSources.join(", ")}` : `Source: ${sourceLabel}`}`;

  return [
    intro.trim(),
    ...formatJobMessages(jobs, language).map((body, index) => ({
      kind: "buttons" as const,
      body: trimButtonBody(`${body}${formatSalaryAskLine(profile, jobs[index], language)}`),
      buttons: [
        { id: `APPROVE_${index + 1}`, title: "Approve" },
        { id: `REJECT_${index + 1}`, title: "Reject" },
      ],
    })),
  ];
}

function formatSalaryAskLine(
  profile: WorkerProfile,
  job: JobListing | undefined,
  language: LanguageCode,
) {
  const salaryAsk = profile.minimumSalaryPkr > 0 ? profile.minimumSalaryPkr : job?.salaryPkr;

  if (!salaryAsk || salaryAsk <= 0) {
    return "";
  }

  const formatted = salaryAsk.toLocaleString("en-PK");

  if (language === "urdu") {
    return `\n\nSalary ask: PKR ${formatted}+`;
  }

  if (language === "pashto") {
    return `\n\nSalary ask: PKR ${formatted}+`;
  }

  return `\n\nRecommended salary ask: PKR ${formatted}+`;
}

function trimButtonBody(body: string) {
  const maxLength = 980;
  return body.length <= maxLength ? body : `${body.slice(0, maxLength - 3)}...`;
}

function editProfileMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Theek hai. Correct details ek message mein bhej dein.\n\nExample:\nDriver, G-9 Islamabad, 4 years experience, minimum salary 40000, available Monday.";
    case "pashto":
      return "Theek da. Correct details pa yo message ke rawalega.\n\nExample:\nDriver, G-9 Islamabad, 4 years experience, minimum salary 40000, available Monday.";
    default:
      return "No problem. Send the corrected details in one message.\n\nExample:\nDriver, G-9 Islamabad, 4 years experience, minimum salary 40000, available Monday.";
  }
}

function submittedMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Shukriya for using Kaamyaabi.\n\nApplication submitted mark ho gayi. Agar employer reply kare ya sawaal pooche, unka message yahan paste karein.";
    case "pashto":
      return "Kaamyaabi karawalo la manana.\n\nApplication submitted mark shwa. Ka employer reply oko ya pokhtana oko, hagha message darta rawalega.";
    default:
      return "Thank you for using Kaamyaabi.\n\nApplication marked submitted. If the employer replies or asks questions, paste their message here.";
  }
}

function savedForLaterMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Saved in drafts for later.\n\nDemo note: yeh mock draft save hai. Aap JOBS bhej kar list dobara dekh sakte hain.";
    case "pashto":
      return "Later la drafts ke save sho.\n\nDemo note: da mock draft save da. JOBS rawalega che list bia ogore.";
    default:
      return "Saved in drafts for later.\n\nDemo note: this is a mock draft save. Send JOBS when you want to continue.";
  }
}

function watchSuggestionReply(language: LanguageCode): AgentReply {
  const body =
    language === "urdu"
      ? "Kya main ab hamesha fresh jobs watch karun aur best match milte hi aapko approve/reject ke liye bhejun?"
      : language === "pashto"
        ? "Za hamesha fresh jobs ogoram aw best match approval la darta rawalem?"
        : "Should I keep watching for fresh jobs and send the best matches here for your approval?";

  return {
    kind: "buttons",
    body,
    buttons: [
      { id: "WATCH_YES", title: "Yes" },
      { id: "WATCH_NO", title: "No" },
    ],
  };
}

function watchDeclinedMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Theek hai. Watcher start nahi kiya. Fresh list chahiye ho to JOBS bhej dein.";
    case "pashto":
      return "Theek da. Watcher me start na ko. Fresh list la JOBS rawalega.";
    default:
      return "No problem. I did not start the watcher. Send JOBS whenever you want fresh matches.";
  }
}

function confirmNeedsSubmissionMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Real rehne ke liye, main submission tab tak confirm nahi karunga jab tak aap listing/contact par apply na kar dein.\n\nApply karke DONE reply karein.";
    case "pashto":
      return "Da real demo la para, za submission halse na confirm kawom tar so ta pa listing/contact apply na kre.\n\nApply oka, bia DONE reply oka.";
    default:
      return "To keep this real, I cannot confirm submission until you apply on the listing or contact the employer.\n\nOpen the listing/contact from the application packet, submit it, then reply DONE.";
  }
}

function noCurrentMatchesMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Mere paas current job matches nahi hain. Profile ke baad YES reply karein, ya JOBS bhej kar list refresh karein, phir APPLY 1.";
    case "pashto":
      return "Ma sara os current job matches nishta. Profile na pas YES reply oka, ya JOBS rawalega, bia APPLY 1.";
    default:
      return "I do not have your current job matches yet. Reply YES after your profile, or send JOBS to refresh the list, then reply APPLY 1.";
  }
}

function watchApplyActiveMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Watch + apply mode active hai. Maine fresh direct-contact search chala kar top job select kar li.";
    case "pashto":
      return "Watch + apply mode active da. Ma fresh direct-contact search oko aw top job me select kra.";
    default:
      return "Watch + apply mode is active. I ran a fresh direct-contact search and selected the top ranked job.";
  }
}

function watchActiveMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Watch mode active hai. Maine fresh direct-contact listings fetch aur rank kar di.";
    case "pashto":
      return "Watch mode active da. Ma fresh direct-contact listings fetch aw rank kre.";
    default:
      return "Watch mode is active. I fetched and ranked fresh direct-contact listings.";
  }
}

function watchNeedsProfileMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Watcher note ho gaya. Pehle worker profile banayein, phir WATCH ya WATCH APPLY bhejein.";
    case "pashto":
      return "Watcher note sho. Lomray worker profile jora kra, bia WATCH ya WATCH APPLY rawalega.";
    default:
      return "Watcher noted. First make your worker profile, then send WATCH or WATCH APPLY.";
  }
}

function watchAlertMessage(
  language: LanguageCode,
  job: JobListing,
  profile: WorkerProfile,
) {
  if (language === "urdu") {
    return `Nayi direct-contact opportunity mili:

${job.title}
${job.employer} | ${job.location}
Salary: ${job.salaryPkr ? `PKR ${job.salaryPkr.toLocaleString("en-PK")}` : "Not listed"}
Source: ${job.sourceLabel}

Yeh aapke ${profile.role} profile se match karti hai. Reply APPLY 1 agar is par apply/contact karna hai.`;
  }

  if (language === "pashto") {
    return `Naway direct-contact opportunity paida sho:

${job.title}
${job.employer} | ${job.location}
Salary: ${job.salaryPkr ? `PKR ${job.salaryPkr.toLocaleString("en-PK")}` : "Not listed"}
Source: ${job.sourceLabel}

Da sta ${profile.role} profile sara match kai. Reply APPLY 1 ka apply/contact kawal ghware.`;
  }

  return `New direct-contact opportunity found:

${job.title}
${job.employer} | ${job.location}
Salary: ${job.salaryPkr ? `PKR ${job.salaryPkr.toLocaleString("en-PK")}` : "Not listed"}
Source: ${job.sourceLabel}

It matches your ${profile.role} profile. Reply APPLY 1 if you want to apply/contact.`;
}

function voiceTranscriptMessage(transcript: string, language: LanguageCode) {
  switch (language) {
    case "urdu":
      return `Voice note mil gaya. Maine yeh transcribe kiya:\n\n${transcript}`;
    case "pashto":
      return `Voice note rasid sho. Ma da transcribe ko:\n\n${transcript}`;
    default:
      return `Voice note received. I transcribed it as:\n\n${transcript}`;
  }
}

function introMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Assalamualaikum. Main Kaamyaabi hoon, aapka job agent.\n\nEk voice note ya text bhejein:\n- kaam\n- experience\n- area\n- minimum salary\n- availability\n\nZubaan badalni ho to likhein: zubaan pashto kar do / language english.";
    case "pashto":
      return "Assalamualaikum. Za Kaamyaabi yam, sta job agent.\n\nYo voice note ya text rawalega:\n- kum kar\n- tajriba\n- area\n- minimum salary\n- availability\n\nZubaan badalawalo la para: zubaan urdu kar do / language english.";
    default:
      return "Assalamualaikum. I am Kaamyaabi, your job agent.\n\nSend one voice note or text with:\n- work you want\n- experience\n- area\n- minimum salary\n- availability\n\nChange language anytime: zubaan pashto kar do / language urdu.";
  }
}

function buildNegotiationReply(
  profile: WorkerProfile,
  job: JobListing,
  employerMessage: string,
  language: LanguageCode,
) {
  const minimumSalary = profile.minimumSalaryPkr.toLocaleString("en-PK");
  const offeredSalary = extractSalaryFromText(employerMessage);
  const offeredText = offeredSalary ? `PKR ${offeredSalary.toLocaleString("en-PK")}` : "not clear";

  if (language === "urdu") {
    return `Employer reply samajh aa gaya.

Offer salary: ${offeredText}
Your minimum: PKR ${minimumSalary}

Suggested reply:
Assalamualaikum, shukriya. Mere paas ${profile.experienceYears} years ka experience hai aur main ${profile.location} se hoon. Main is role mein interested hoon. Kya salary PKR ${minimumSalary} ya is se upar possible hai? Main ${profile.availability} se start kar sakta hoon.`;
  }

  if (language === "pashto") {
    return `Da employer reply me walwast.

Offer salary: ${offeredText}
Sta minimum: PKR ${minimumSalary}

Suggested reply:
Assalamualaikum, manana. Zama ${profile.experienceYears} years tajriba da aw za da ${profile.location} yam. Za de role ke interested yam. Aya salary PKR ${minimumSalary} ya de na zyada mumkin da? Za ${profile.availability} na start kawalay sham.`;
  }

  return `I read the employer reply.

Offer salary: ${offeredText}
Your minimum: PKR ${minimumSalary}

Suggested reply:
Assalamualaikum, thank you. I have ${profile.experienceYears} years of experience and I am based in ${profile.location}. I am interested in this role. Is PKR ${minimumSalary} or above possible? I can start from ${profile.availability}.`;
}

function extractSalaryFromText(text: string) {
  const match =
    text.match(/(?:pkr|rs\.?|salary|offer)\D{0,20}([\d,]{4,7})/i)?.[1] ||
    text.match(/([\d,]{2,3})\s*(?:k|hazaar)/i)?.[1] ||
    text.match(/\b([\d,]{5,6})\b/)?.[1];

  if (!match) {
    return undefined;
  }

  const value = Number(match.replace(/,/g, ""));
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return value < 1000 ? value * 1000 : value;
}
