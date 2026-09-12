import { extractWorkerProfile, getAiStatus, type WorkerProfile } from "@/lib/ai";
import {
  findJobsForProfile,
  formatJobList,
  getApplicationStatus,
  getJobBySelection,
  getJobSearchStatus,
  startJobApplication,
  type JobListing,
} from "@/lib/jobs";
import {
  detectLanguage,
  detectLanguageChange,
  type LanguageCode,
} from "@/lib/language";

type Session = {
  applications?: Array<{
    jobId: string;
    jobTitle: string;
    provider: "boringproject" | "manual";
    submittedAt: string;
  }>;
  jobs?: JobListing[];
  language?: LanguageCode;
  profile?: WorkerProfile;
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
};

const globalForSessions = globalThis as typeof globalThis & {
  __kaamyaabiSessions?: Map<string, Session>;
};

const sessions = globalForSessions.__kaamyaabiSessions ?? new Map<string, Session>();
globalForSessions.__kaamyaabiSessions = sessions;

export async function handleWorkerMessage(message: WorkerMessage) {
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

  if (["reset", "restart"].includes(normalized)) {
    sessions.set(message.from, { stage: "new", language });
    return [resetMessage(language)];
  }

  if (["status", "usage", "ai status"].includes(normalized)) {
    return [buildStatusMessage(language)];
  }

  if (["jobs", "find jobs", "job listings"].includes(normalized)) {
    if (!session.profile) {
      return [needsProfileMessage(language)];
    }

    const jobs = await findJobsForProfile(session.profile);
    session.jobs = jobs;
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return [formatJobList(jobs, session.profile, language)];
  }

  if (isDirectContactCommand(normalized)) {
    if (!session.profile) {
      return [needsProfileMessage(language)];
    }

    const jobs = await findJobsForProfile(session.profile, {
      preferDirectContact: true,
    });
    session.jobs = jobs;
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    return [
      directContactIntro(language),
      formatJobList(jobs, session.profile, language),
    ];
  }

  if (["no", "n", "edit"].includes(normalized) && session.stage === "profile_review") {
    return [editProfileMessage(language)];
  }

  if (["done", "submitted"].includes(normalized) && session.stage === "application_ready") {
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

    return [submittedMessage(language), watchSuggestion(language)];
  }

  if (normalized === "confirm" && session.stage === "application_ready") {
    return [confirmNeedsSubmissionMessage(language)];
  }

  if (isApplyCommand(normalized) && session.profile && session.stage === "jobs_shown") {
    return beginApplication(message.from, session, text);
  }

  if (isApplyCommand(normalized)) {
    return [noCurrentMatchesMessage(language)];
  }

  if (normalized.startsWith("watch")) {
    if (session.profile) {
      const autoApply = /\bapply\b/.test(normalized);
      const jobs = await findJobsForProfile(session.profile, {
        preferDirectContact: true,
      });
      session.jobs = jobs;
      session.stage = "jobs_shown";
      session.watchMode = {
        autoApply,
        createdAt: new Date().toISOString(),
        lastCheckedAt: new Date().toISOString(),
        lastTopJobId: jobs[0]?.id,
      };
      sessions.set(message.from, session);

      if (autoApply && jobs[0]) {
        const application = await beginApplication(message.from, session, "APPLY 1");

        return [
          watchApplyActiveMessage(language),
          formatJobList(jobs, session.profile, language),
          ...application,
        ];
      }

      return [
        watchActiveMessage(language),
        formatJobList(jobs, session.profile, language),
      ];
    }

    return [watchNeedsProfileMessage(language)];
  }

  if (["yes", "y"].includes(normalized) && session.profile) {
    session.stage = "jobs_shown";
    sessions.set(message.from, session);

    const jobs = await findJobsForProfile(session.profile);
    session.jobs = jobs;
    sessions.set(message.from, session);

    return [
      buildCvMessage(session.profile, language),
      formatJobList(jobs, session.profile, language),
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

    const missingFields = getMissingProfileFields(transcript);

    if (missingFields.length > 0) {
      return [
        voiceTranscriptMessage(transcript, language),
        buildMissingDetailsMessage(missingFields, language),
      ];
    }

    const profile = await extractWorkerProfile(transcript);
    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [
      voiceTranscriptMessage(transcript, language),
      buildProfileReview(profile, language),
    ];
  }

  if (session.profile && session.selectedJob && text.length > 8) {
    return [buildNegotiationReply(session.profile, session.selectedJob, text, language)];
  }

  if (text && !isKnownShortCommand(normalized) && !hasJobIntent(text)) {
    return [buildOutOfScopeMessage(language)];
  }

  if (hasJobIntent(text)) {
    const missingFields = getMissingProfileFields(text);

    if (missingFields.length > 0) {
      return [buildMissingDetailsMessage(missingFields, language)];
    }

    const profile = await extractWorkerProfile(text);
    session.profile = profile;
    session.stage = "profile_review";
    sessions.set(message.from, session);

    return [buildProfileReview(profile, language)];
  }

  return [introMessage(language)];
}

export async function runWatchChecks(
  sendMessage: (phone: string, body: string) => Promise<void>,
) {
  const watchedSessions = Array.from(sessions.entries()).filter(
    ([, session]) => session.watchMode && session.profile,
  );

  for (const [phone, session] of watchedSessions) {
    if (!session.profile || !session.watchMode) {
      continue;
    }

    const language = session.language ?? "english";
    const jobs = await findJobsForProfile(session.profile, {
      preferDirectContact: true,
    });
    const topJob = jobs[0];

    session.jobs = jobs;
    session.stage = "jobs_shown";
    session.watchMode.lastCheckedAt = new Date().toISOString();

    if (!topJob || topJob.id === session.watchMode.lastTopJobId) {
      sessions.set(phone, session);
      continue;
    }

    session.watchMode.lastTopJobId = topJob.id;
    sessions.set(phone, session);

    await sendMessage(phone, watchAlertMessage(language, topJob, session.profile));

    if (session.watchMode.autoApply) {
      const applicationMessages = await beginApplication(phone, session, "APPLY 1");

      for (const reply of applicationMessages) {
        await sendMessage(phone, reply);
      }
    }
  }
}

function isKnownShortCommand(normalized: string) {
  if (isApplyCommand(normalized)) {
    return true;
  }

  return [
    "hi",
    "hello",
    "hey",
    "yes",
    "y",
    "no",
    "apply",
    "confirm",
    "done",
    "submitted",
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

function isApplyCommand(normalized: string) {
  return /^(apply|confirm)(\s+[1-3])?$/.test(normalized);
}

function isDirectContactCommand(normalized: string) {
  return /^(contacts?|direct jobs?|direct contact|opportunities|opportunity search)$/.test(
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

function buildProfileReview(profile: WorkerProfile, language: LanguageCode) {
  if (language === "urdu") {
    return `Maine aapki worker profile bana di:

Name: ${profile.name}
Role: ${profile.role}
Location: ${profile.location}
Experience: ${profile.experienceYears} years
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}
Skills: ${profile.skills.join(", ")}
Available: ${profile.availability}

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

Is this correct? Reply YES.`;
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

async function beginApplication(phone: string, session: Session, text: string) {
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

  const application = await startJobApplication(
    job,
    session.profile,
    session.language ?? "english",
  );

  if (application.status === "queued") {
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

  return application.messages;
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
Manual handoffs: ${applyStatus.manualHandoffs}
Last application provider: ${applyStatus.lastProvider}
Last application status: ${applyStatus.lastStatus}
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
      return "Application submitted mark ho gayi.\n\nAgar employer reply kare ya sawaal pooche, unka message yahan paste karein. Main jawab banwa dunga.";
    case "pashto":
      return "Application submitted mark shwa.\n\nKa employer reply oko ya pokhtana oko, hagha message darta rawalega. Za ba jawab jor kam.";
    default:
      return "Application marked submitted.\n\nIf the employer replies or asks questions, paste their message here and I will help you respond.";
  }
}

function watchSuggestion(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "WATCH APPLY bhejein aur main fresh direct-contact jobs dhoond kar top match par apply/handoff karunga.";
    case "pashto":
      return "WATCH APPLY rawalega, za ba fresh direct-contact jobs ogoram aw top match apply/handoff kam.";
    default:
      return "Send WATCH APPLY and I will keep refreshing direct-contact jobs and apply/handoff the top match.";
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
