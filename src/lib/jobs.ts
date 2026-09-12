import type { WorkerProfile } from "@/lib/ai";
import type { LanguageCode } from "@/lib/language";

export type JobListing = {
  id: string;
  title: string;
  employer: string;
  applicationMethod:
    | "ats_link"
    | "job_board_link"
    | "contact"
    | "external_link"
    | "unavailable";
  contactHint?: string;
  location: string;
  locationVerified: boolean;
  platform: JobPlatform;
  sourceLabel: string;
  reliability: "high" | "medium" | "low";
  salaryPkr: number | null;
  match: number;
  source: "live" | "demo";
  url?: string;
  summary: string;
  why: string[];
};

export type ApplicationResult = {
  messages: string[];
  provider: "boringproject" | "manual";
  status: "queued" | "needs_manual_submit" | "failed";
  externalSessionId?: string;
};

type JobSearchOptions = {
  preferDirectContact?: boolean;
};

export type JobSearchStatus = {
  provider: "exa" | "seeded";
  liveCalls: number;
  liveFailures: number;
  liveResultsSeen: number;
  duplicateResultsRemoved: number;
  sourcesQueried: string[];
  liveCostDollars: number;
  lastSearchAt?: string;
  lastError?: string;
};

const applicationStatus = {
  boringProjectCalls: 0,
  boringProjectFailures: 0,
  manualHandoffs: 0,
  lastProvider: "manual" as ApplicationResult["provider"],
  lastStatus: "needs_manual_submit" as ApplicationResult["status"],
  lastSessionId: undefined as string | undefined,
  lastError: undefined as string | undefined,
};

type JobPlatform =
  | "linkedin"
  | "olx"
  | "rozee"
  | "mustakbil"
  | "indeed"
  | "jobz"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "bamboohr"
  | "company"
  | "web"
  | "demo";

type SearchSource = {
  platform: JobPlatform;
  label: string;
  domains?: string[];
  reliability: JobListing["reliability"];
  querySuffix: string;
};

const jobSearchStatus: JobSearchStatus = {
  provider: "seeded",
  liveCalls: 0,
  liveFailures: 0,
  liveResultsSeen: 0,
  duplicateResultsRemoved: 0,
  sourcesQueried: [],
  liveCostDollars: 0,
};

const searchSources: SearchSource[] = [
  {
    platform: "olx",
    label: "OLX Pakistan",
    domains: ["olx.com.pk"],
    reliability: "medium",
    querySuffix: "site:olx.com.pk jobs hiring contact",
  },
  {
    platform: "rozee",
    label: "Rozee.pk",
    domains: ["rozee.pk"],
    reliability: "medium",
    querySuffix: "site:rozee.pk jobs apply",
  },
  {
    platform: "mustakbil",
    label: "Mustakbil",
    domains: ["mustakbil.com"],
    reliability: "medium",
    querySuffix: "site:mustakbil.com jobs apply",
  },
  {
    platform: "jobz",
    label: "Jobz.pk",
    domains: ["jobz.pk"],
    reliability: "medium",
    querySuffix: "site:jobz.pk jobs Pakistan apply",
  },
  {
    platform: "indeed",
    label: "Indeed",
    domains: ["indeed.com", "indeed.com.pk"],
    reliability: "medium",
    querySuffix: "site:indeed.com jobs Pakistan apply",
  },
  {
    platform: "linkedin",
    label: "LinkedIn Jobs",
    domains: ["linkedin.com"],
    reliability: "medium",
    querySuffix: "site:linkedin.com/jobs hiring apply",
  },
  {
    platform: "greenhouse",
    label: "Greenhouse ATS",
    domains: ["greenhouse.io", "greenhouse.com", "boards.greenhouse.io"],
    reliability: "high",
    querySuffix: "site:boards.greenhouse.io jobs apply",
  },
  {
    platform: "lever",
    label: "Lever ATS",
    domains: ["lever.co", "jobs.lever.co"],
    reliability: "high",
    querySuffix: "site:jobs.lever.co jobs apply",
  },
  {
    platform: "ashby",
    label: "Ashby ATS",
    domains: ["ashbyhq.com", "jobs.ashbyhq.com"],
    reliability: "high",
    querySuffix: "site:jobs.ashbyhq.com jobs apply",
  },
  {
    platform: "workable",
    label: "Workable ATS",
    domains: ["workable.com", "apply.workable.com"],
    reliability: "high",
    querySuffix: "site:apply.workable.com jobs apply",
  },
  {
    platform: "bamboohr",
    label: "BambooHR ATS",
    domains: ["bamboohr.com"],
    reliability: "high",
    querySuffix: "site:bamboohr.com/careers jobs apply",
  },
  {
    platform: "web",
    label: "Company career pages",
    reliability: "low",
    querySuffix: "company careers apply online Pakistan",
  },
];

const seededJobs: JobListing[] = [
  {
    id: "family-driver-g10",
    title: "Family Driver",
    employer: "Khan Family",
    applicationMethod: "unavailable",
    platform: "demo",
    sourceLabel: "Demo fallback",
    reliability: "low",
    location: "G-10 Islamabad",
    locationVerified: true,
    salaryPkr: 38000,
    match: 92,
    source: "demo",
    summary: "Family needs a reliable driver near G-10 for daily household travel.",
    why: ["Very close to your preferred area", "Driving role matches your profile"],
  },
  {
    id: "office-driver-f8",
    title: "Office Driver",
    employer: "Blue Area Office",
    applicationMethod: "unavailable",
    platform: "demo",
    sourceLabel: "Demo fallback",
    reliability: "low",
    location: "F-8 Islamabad",
    locationVerified: true,
    salaryPkr: 45000,
    match: 81,
    source: "demo",
    summary: "Office driver role with weekday routine and immediate joining.",
    why: ["Meets your minimum salary", "Office transport is close to G sectors"],
  },
  {
    id: "delivery-driver-g11",
    title: "Delivery Driver",
    employer: "Local Delivery Co.",
    applicationMethod: "unavailable",
    platform: "demo",
    sourceLabel: "Demo fallback",
    reliability: "low",
    location: "G-11 Islamabad",
    locationVerified: true,
    salaryPkr: 35000,
    match: 64,
    source: "demo",
    summary: "Delivery driver opening in G-11 with flexible timings.",
    why: ["Nearby location", "Below your minimum salary, so negotiation required"],
  },
];

type ExaSearchResponse = {
  results?: Array<{
    id?: string;
    title?: string;
    url?: string;
    text?: string;
    summary?: string;
    publishedDate?: string;
  }>;
  costDollars?: {
    total?: number;
  };
};

export async function findJobsForProfile(
  profile: WorkerProfile,
  options: JobSearchOptions = {},
) {
  try {
    const liveJobs = await findLiveJobs(profile, options);

    if (liveJobs.length > 0) {
      jobSearchStatus.provider = "exa";
      return liveJobs.slice(0, 3);
    }
  } catch (error) {
    jobSearchStatus.liveFailures += 1;
    jobSearchStatus.lastError =
      error instanceof Error ? error.message : "Unknown Exa search error";
    console.warn("Exa job search failed; using seeded jobs.", error);
  }

  jobSearchStatus.provider = "seeded";
  return rankSeededJobs(profile).slice(0, 3);
}

export function getJobSearchStatus() {
  return jobSearchStatus;
}

export function getApplicationStatus() {
  return applicationStatus;
}

export function formatJobList(
  jobs: JobListing[],
  profile: WorkerProfile,
  language: LanguageCode = "english",
) {
  const sourceLabel = jobs.some((job) => job.source === "live")
    ? "multi-source live search"
    : "demo fallback";
  const liveSources = [
    ...new Set(jobs.filter((job) => job.source === "live").map((job) => job.sourceLabel)),
  ];

  if (language === "urdu") {
    return `Mujhe ${jobs.length} job matches mile (${sourceLabel}).
${liveSources.length > 0 ? `Sources used: ${liveSources.join(", ")}.\n` : ""}

${jobs.map((job, index) => formatJobCard(job, index + 1, language)).join("\n\n")}

Recommended: pehle #1 par apply karein. Salary ask: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}+.

Reply APPLY 1, APPLY 2, ya APPLY 3.`;
  }

  if (language === "pashto") {
    return `Ma ${jobs.length} job matches paida kre (${sourceLabel}).
${liveSources.length > 0 ? `Sources used: ${liveSources.join(", ")}.\n` : ""}

${jobs.map((job, index) => formatJobCard(job, index + 1, language)).join("\n\n")}

Recommended: lomray #1 apply oka. Salary ask: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}+.

Reply APPLY 1, APPLY 2, ya APPLY 3.`;
  }

  return `I found ${jobs.length} job matches (${sourceLabel}).
${liveSources.length > 0 ? `Sources used: ${liveSources.join(", ")}.\n` : ""}

${jobs.map((job, index) => formatJobCard(job, index + 1, language)).join("\n\n")}

Recommended: apply to #1 first. Salary ask: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}+.

Reply APPLY 1, APPLY 2, or APPLY 3.`;
}

export function getJobBySelection(jobs: JobListing[] | undefined, text: string) {
  if (!jobs || jobs.length === 0) {
    return undefined;
  }

  const selection = text.match(/\b([1-3])\b/)?.[1];
  const index = selection ? Number(selection) - 1 : 0;
  return jobs[index] ?? jobs[0];
}

export function formatApplicationSummary(
  job: JobListing,
  profile: WorkerProfile,
  language: LanguageCode = "english",
) {
  const targetSalary = Math.max(profile.minimumSalaryPkr, job.salaryPkr ?? 0);
  const salaryAsk = `PKR ${targetSalary.toLocaleString("en-PK")}`;
  const applicationMessage = buildApplicationMessage(job, profile, salaryAsk, language);

  if (job.applicationMethod === "unavailable") {
    return {
      targetSalary,
      started:
        language === "urdu"
          ? `Yeh demo fallback match hai, real external listing nahi.

Main is par fake apply nahi karunga. JOBS dobara bhejein aur live listing choose karein.`
          : language === "pashto"
            ? `Da demo fallback match da, real external listing na da.

Za fake apply na kawom. JOBS bia rawalega aw live listing choose oka.`
            : `This match is a demo fallback, not a real external listing.

I will not pretend to apply to it. Send JOBS again and choose a live listing with APPLY 1, APPLY 2, or APPLY 3.`,
      offer: "",
    };
  }

  const actionLine =
    job.applicationMethod === "contact" && job.contactHint
      ? `Contact/apply here: ${job.contactHint}`
      : `Open the real ${job.sourceLabel} application page: ${job.url}`;

  if (language === "urdu") {
    return {
      targetSalary,
      started: `Real application packet tayyar

${formatJobCard(job, 1, language)}

Worker CV:
${profile.name} - ${profile.role}
${profile.experienceYears} years experience
Skills: ${profile.skills.join(", ")}
Location: ${profile.location}
Available: ${profile.availability}
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}

${actionLine}`,
      offer: `Yeh message employer/listing par send/apply karein:

${applicationMessage}

Apply ya message bhejne ke baad DONE reply karein.

Agar site extra sawaal pooche, yahan copy kar dein.`,
    };
  }

  if (language === "pashto") {
    return {
      targetSalary,
      started: `Real application packet tayyar da

${formatJobCard(job, 1, language)}

Worker CV:
${profile.name} - ${profile.role}
${profile.experienceYears} years experience
Skills: ${profile.skills.join(", ")}
Location: ${profile.location}
Available: ${profile.availability}
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}

${actionLine}`,
      offer: `Da message employer/listing ta send/apply oka:

${applicationMessage}

Apply ya message na pas DONE reply oka.

Ka site extra pokhtane okri, hagha dalta copy ka.`,
    };
  }

  return {
    targetSalary,
    started: `Real application packet ready

${formatJobCard(job, 1, language)}

Worker CV:
${profile.name} - ${profile.role}
${profile.experienceYears} years experience
Skills: ${profile.skills.join(", ")}
Location: ${profile.location}
Available: ${profile.availability}
Minimum salary: PKR ${profile.minimumSalaryPkr.toLocaleString("en-PK")}

${actionLine}`,
    offer: `Send/apply with this message:

${applicationMessage}

After you submit or message the employer, reply DONE.

If the site asks extra questions, copy them here and I will help answer.`,
  };
}

export async function startJobApplication(
  job: JobListing,
  profile: WorkerProfile,
  language: LanguageCode = "english",
): Promise<ApplicationResult> {
  if (job.applicationMethod === "unavailable") {
    applicationStatus.manualHandoffs += 1;
    applicationStatus.lastProvider = "manual";
    applicationStatus.lastStatus = "needs_manual_submit";

    const application = formatApplicationSummary(job, profile, language);
    return {
      messages: [application.started, application.offer].filter(Boolean),
      provider: "manual",
      status: "needs_manual_submit",
    };
  }

  const boringProjectKey = process.env.BORING_PROJECT_API_KEY;
  const candidateProfileId = process.env.BORING_PROJECT_CANDIDATE_PROFILE_ID;

  if (boringProjectKey && candidateProfileId && job.url) {
    const result = await submitWithBoringProject({
      apiKey: boringProjectKey,
      candidateProfileId,
      job,
      language,
      profile,
    });

    if (result.status === "queued") {
      return result;
    }
  }

  applicationStatus.manualHandoffs += 1;
  applicationStatus.lastProvider = "manual";
  applicationStatus.lastStatus = "needs_manual_submit";

  const application = formatApplicationSummary(job, profile, language);

  return {
    messages: [
      boringProjectKey && !candidateProfileId
        ? autoApplyMissingCandidateMessage(language)
        : autoApplyNotConfiguredMessage(language),
      application.started,
      application.offer,
    ].filter(Boolean),
    provider: "manual",
    status: "needs_manual_submit",
  };
}

async function submitWithBoringProject(input: {
  apiKey: string;
  candidateProfileId: string;
  job: JobListing;
  language: LanguageCode;
  profile: WorkerProfile;
}): Promise<ApplicationResult> {
  applicationStatus.boringProjectCalls += 1;
  applicationStatus.lastProvider = "boringproject";

  try {
    const response = await fetch(
      "https://apply-api.boringproject.ai/api/v1/sessions/apply",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidateProfileId: input.candidateProfileId,
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/applications/boringproject/webhook`,
          jobs: [
            {
              companyName: input.job.employer,
              title: input.job.title,
              jobId: input.job.id,
              link: input.job.url,
            },
          ],
          metadata: {
            source: "kaamyaabi-whatsapp",
            workerName: input.profile.name,
            workerRole: input.profile.role,
            workerLocation: input.profile.location,
            expectedSalaryPkr: input.profile.minimumSalaryPkr,
          },
        }),
      },
    );

    const json = (await response.json().catch(() => ({}))) as {
      sessionId?: string;
      status?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(
        json.error || json.message || `BoringProject returned ${response.status}`,
      );
    }

    applicationStatus.lastStatus = "queued";
    applicationStatus.lastSessionId = json.sessionId;
    applicationStatus.lastError = undefined;

    return {
      messages: [
        `Auto-apply queued via BoringProject.

Job: ${input.job.title}
Company: ${input.job.employer}
Source: ${input.job.sourceLabel}
Session: ${json.sessionId ?? "not returned"}
Status: ${json.status ?? "queued"}

I will treat the webhook result as final: submitted, needs input, or failed.`,
      ],
      provider: "boringproject",
      status: "queued",
      externalSessionId: json.sessionId,
    };
  } catch (error) {
    applicationStatus.boringProjectFailures += 1;
    applicationStatus.lastStatus = "failed";
    applicationStatus.lastError =
      error instanceof Error ? error.message : "Unknown BoringProject error";

    const application = formatApplicationSummary(
      input.job,
      input.profile,
      input.language,
    );
    return {
      messages: [
        `Auto-apply failed, so I prepared the manual application packet instead.

Reason: ${applicationStatus.lastError}`,
        application.started,
        application.offer,
      ],
      provider: "manual",
      status: "failed",
    };
  }
}

function buildApplicationMessage(
  job: JobListing,
  profile: WorkerProfile,
  salaryAsk: string,
  language: LanguageCode,
) {
  if (language === "urdu") {
    return `Assalamualaikum, main ${job.title} ke liye apply kar raha hoon.

Name: ${profile.name}
Role: ${profile.role}
Experience: ${profile.experienceYears} years
Area: ${profile.location}
Skills: ${profile.skills.join(", ")}
Availability: ${profile.availability}
Expected salary: ${salaryAsk}

Main is job mein interested hoon aur details discuss kar sakta hoon.`;
  }

  if (language === "pashto") {
    return `Assalamualaikum, za da ${job.title} la para apply kawom.

Name: ${profile.name}
Role: ${profile.role}
Experience: ${profile.experienceYears} years
Area: ${profile.location}
Skills: ${profile.skills.join(", ")}
Availability: ${profile.availability}
Expected salary: ${salaryAsk}

Za de job ke interested yam aw details discuss kawalay sham.`;
  }

  return `Assalamualaikum, I am applying for ${job.title}.

Name: ${profile.name}
Role: ${profile.role}
Experience: ${profile.experienceYears} years
Area: ${profile.location}
Skills: ${profile.skills.join(", ")}
Availability: ${profile.availability}
Expected salary: ${salaryAsk}

I am interested in this job and available to discuss details.`;
}

function formatJobCard(
  job: JobListing,
  index: number,
  language: LanguageCode = "english",
) {
  const locationLabel = job.locationVerified
    ? job.location
    : `${job.location} (verify on listing)`;
  const linkLine = job.url ? `\nOpen listing: ${job.url}` : "";
  const applyLine =
    job.applicationMethod === "contact" && job.contactHint
      ? `\nApply/contact: ${job.contactHint}`
      : job.applicationMethod !== "unavailable" && job.url
        ? `\nApply route: ${formatApplicationMethod(job.applicationMethod)}`
        : "\nApplication route: not available for this demo fallback";

  if (language === "urdu") {
    return `*${index}. ${job.title}*
${job.employer} | ${locationLabel}

Salary: ${formatSalary(job.salaryPkr)}
Match: ${job.match}%
Source: ${job.sourceLabel}
Reliability: ${job.reliability}

${job.summary}${applyLine}

Fit: ${job.why.join("; ")}${linkLine}`;
  }

  if (language === "pashto") {
    return `*${index}. ${job.title}*
${job.employer} | ${locationLabel}

Salary: ${formatSalary(job.salaryPkr)}
Match: ${job.match}%
Source: ${job.sourceLabel}
Reliability: ${job.reliability}

${job.summary}${applyLine}

Fit: ${job.why.join("; ")}${linkLine}`;
  }

  return `*${index}. ${job.title}*
${job.employer} | ${locationLabel}

Salary: ${formatSalary(job.salaryPkr)}
Match: ${job.match}%
Source: ${job.sourceLabel}
Reliability: ${job.reliability}

${job.summary}${applyLine}

Fit: ${job.why.join("; ")}${linkLine}`;
}

function formatSalary(salaryPkr: number | null) {
  return salaryPkr ? `PKR ${salaryPkr.toLocaleString("en-PK")}` : "Not listed";
}

function formatApplicationMethod(method: JobListing["applicationMethod"]) {
  switch (method) {
    case "ats_link":
      return "official ATS apply page";
    case "job_board_link":
      return "job board apply/contact page";
    case "contact":
      return "direct employer contact";
    case "external_link":
      return "external application page";
    default:
      return "unavailable";
  }
}

function autoApplyMissingCandidateMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Auto-apply provider configured hai, lekin BORING_PROJECT_CANDIDATE_PROFILE_ID missing hai.";
    case "pashto":
      return "Auto-apply provider configured da, kho BORING_PROJECT_CANDIDATE_PROFILE_ID missing da.";
    default:
      return "Auto-apply provider is configured, but BORING_PROJECT_CANDIDATE_PROFILE_ID is missing.";
  }
}

function autoApplyNotConfiguredMessage(language: LanguageCode) {
  switch (language) {
    case "urdu":
      return "Auto-apply provider abhi configured nahi, is liye maine reliable application handoff tayyar kiya.";
    case "pashto":
      return "Auto-apply provider la configured na da, no ma reliable application handoff tayyar ko.";
    default:
      return "Auto-apply provider is not configured yet, so I prepared the reliable application handoff.";
  }
}

async function findLiveJobs(
  profile: WorkerProfile,
  options: JobSearchOptions,
): Promise<JobListing[]> {
  const apiKey = process.env.EXA_API_KEY;

  if (!apiKey) {
    return [];
  }

  jobSearchStatus.lastSearchAt = new Date().toISOString();
  jobSearchStatus.liveResultsSeen = 0;
  jobSearchStatus.duplicateResultsRemoved = 0;
  jobSearchStatus.sourcesQueried = selectedSearchSources().map((source) => source.label);

  const results = await Promise.allSettled(
    selectedSearchSources().map((source) =>
      searchSource(profile, source, apiKey, options),
    ),
  );

  const jobs = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  for (const result of results) {
    if (result.status === "rejected") {
      jobSearchStatus.liveFailures += 1;
      jobSearchStatus.lastError =
        result.reason instanceof Error ? result.reason.message : "Unknown source error";
    }
  }

  jobSearchStatus.liveResultsSeen = jobs.length;
  return dedupeAndRankJobs(jobs, profile, options).slice(0, 6);
}

async function searchSource(
  profile: WorkerProfile,
  source: SearchSource,
  apiKey: string,
  options: JobSearchOptions,
) {
  jobSearchStatus.liveCalls += 1;

  const directContactQuery = options.preferDirectContact
    ? " phone WhatsApp contact number email direct hiring"
    : "";
  const query = `${profile.role} job ${profile.location} Pakistan salary hiring apply ${source.querySuffix}${directContactQuery}`;
  const body: Record<string, unknown> = {
    query,
    type: "auto",
    numResults: 3,
    contents: {
      text: {
        maxCharacters: 900,
      },
      summary: {
        query:
          "Extract job title, company, location, salary, application/contact route, and why this may fit the worker.",
      },
      livecrawl: "preferred",
      livecrawlTimeout: 1000,
    },
  };

  if (source.domains) {
    body.includeDomains = source.domains;
  }

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Exa returned ${response.status}`);
  }

  const json = (await response.json()) as ExaSearchResponse;
  jobSearchStatus.liveCostDollars += json.costDollars?.total ?? 0;

  return (
    json.results
      ?.map((result, index) => normalizeExaResult(result, index, profile, source))
      .filter((job): job is JobListing => Boolean(job)) ?? []
  );
}

function selectedSearchSources() {
  const limit = Number(process.env.JOB_SEARCH_SOURCE_LIMIT ?? 8);
  return searchSources.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 8);
}

function normalizeExaResult(
  result: NonNullable<ExaSearchResponse["results"]>[number],
  index: number,
  profile: WorkerProfile,
  source: SearchSource,
): JobListing | undefined {
  const title = clean(result.title);
  const body = cleanSummary(`${result.summary ?? ""} ${result.text ?? ""}`);

  if (
    !title ||
    !result.url ||
    !looksLikeJobResult(`${title} ${body}`) ||
    !matchesWorkerRole(`${title} ${body}`, profile.role) ||
    looksExpiredOrClosed(`${title} ${body}`)
  ) {
    return undefined;
  }

  const salaryPkr = extractSalary(`${title} ${body}`);
  const detectedLocation = extractLocation(`${title} ${body}`);
  const location = detectedLocation || profile.location;
  const locationVerified = Boolean(detectedLocation);
  const employer = extractEmployer(`${title} ${body}`, result.url);
  const contactHint = extractContact(`${title} ${body}`);
  const platform = detectPlatform(result.url, source);
  const sourceLabel = getSourceLabel(platform, source);
  const reliability = getReliability(platform, source.reliability);
  const match = scoreLiveJob({
    index,
    location,
    locationVerified,
    platform,
    profile,
    reliability,
    salaryPkr,
    text: `${title} ${body}`,
  });

  return {
    id: result.id || result.url,
    title: simplifyTitle(`${title} ${body}`, profile.role),
    employer,
    applicationMethod: getApplicationMethod(platform, contactHint),
    contactHint,
    location,
    locationVerified,
    platform,
    sourceLabel,
    reliability,
    salaryPkr,
    match,
    source: "live",
    url: result.url,
    summary:
      truncate(body, 170) ||
      `Live result found for ${profile.role} near ${profile.location}.`,
    why: buildWhy(profile, location, locationVerified, salaryPkr, "live"),
  };
}

function dedupeAndRankJobs(
  jobs: JobListing[],
  profile: WorkerProfile,
  options: JobSearchOptions,
) {
  const seen = new Map<string, JobListing>();

  for (const job of jobs) {
    const key = normalizeDedupeKey(job);
    const existing = seen.get(key);

    if (!existing || job.match > existing.match) {
      seen.set(key, job);
    } else {
      jobSearchStatus.duplicateResultsRemoved += 1;
    }
  }

  return Array.from(seen.values())
    .map((job) => ({
      ...job,
      match: Math.min(
        98,
        job.match +
          (job.locationVerified ? exactLocationBoost(job.location, profile.location) : 0) +
          (options.preferDirectContact && job.applicationMethod === "contact" ? 10 : 0),
      ),
    }))
    .sort((a, b) => b.match - a.match);
}

function normalizeDedupeKey(job: JobListing) {
  const urlKey = job.url ? cleanUrlForDedupe(job.url) : "";
  return `${urlKey}|${job.title}|${job.employer}`
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, " ")
    .trim();
}

function cleanUrlForDedupe(url: string) {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function rankSeededJobs(profile: WorkerProfile) {
  return seededJobs
    .map((job) => ({
      ...job,
      match: scoreSeededJob(job, profile),
      why: buildWhy(profile, job.location, job.locationVerified, job.salaryPkr, "demo"),
    }))
    .sort((a, b) => b.match - a.match);
}

function scoreSeededJob(job: JobListing, profile: WorkerProfile) {
  let score = job.match;

  if (job.salaryPkr && job.salaryPkr >= profile.minimumSalaryPkr) {
    score += 6;
  }

  if (profile.location.toLowerCase().includes("g-") && job.location.includes("G-")) {
    score += 4;
  }

  return Math.min(score, 98);
}

function buildWhy(
  profile: WorkerProfile,
  location: string,
  locationVerified: boolean,
  salaryPkr: number | null,
  source: "live" | "demo",
) {
  const reasons = [
    `${profile.role} matches your profile`,
    locationVerified && location
      ? `Location: ${location}`
      : "Location not visible, confirm before applying",
  ];

  if (salaryPkr && salaryPkr >= profile.minimumSalaryPkr) {
    reasons.push("Salary meets your minimum");
  } else if (salaryPkr) {
    reasons.push("Salary is below your minimum, negotiate first");
  } else {
    reasons.push("Salary not listed, ask before confirming");
  }

  if (source === "live") {
    reasons.push("Found from live multi-source search");
  }

  return reasons;
}

function looksLikeJobResult(text: string) {
  return /\b(job|career|hiring|vacancy|apply|driver|developer|electrician|plumber|teacher|sales|delivery)\b/i.test(
    text,
  );
}

function matchesWorkerRole(text: string, role: string) {
  const lowerText = text.toLowerCase();
  return getRoleTerms(role).some((term) => lowerText.includes(term));
}

function getRoleTerms(role: string) {
  const lowerRole = role.toLowerCase();

  if (/\bdriver|driving|chauffeur\b/.test(lowerRole)) {
    return ["driver", "driving", "chauffeur", "ltv", "htv", "vehicle", "car"];
  }

  if (/\bdeveloper|engineer|react|software|programmer\b/.test(lowerRole)) {
    return [
      "developer",
      "engineer",
      "software",
      "programmer",
      "frontend",
      "backend",
      "react",
      "mobile",
      "web",
    ];
  }

  if (/\belectrician|electrical\b/.test(lowerRole)) {
    return ["electrician", "electrical", "wiring", "maintenance"];
  }

  if (/\bplumber|plumbing\b/.test(lowerRole)) {
    return ["plumber", "plumbing", "pipe", "water"];
  }

  if (/\bcook|chef\b/.test(lowerRole)) {
    return ["cook", "chef", "kitchen"];
  }

  if (/\bguard|security\b/.test(lowerRole)) {
    return ["guard", "security"];
  }

  if (/\bmaid|cleaner|cleaning\b/.test(lowerRole)) {
    return ["maid", "cleaner", "cleaning", "housekeeping"];
  }

  if (/\bdelivery|rider\b/.test(lowerRole)) {
    return ["delivery", "rider", "courier"];
  }

  if (/\bsales\b/.test(lowerRole)) {
    return ["sales", "retail", "customer"];
  }

  return lowerRole
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2);
}

function looksExpiredOrClosed(text: string) {
  return /\b(expired|closed|filled|no longer accepting|not accepting applications)\b/i.test(
    text,
  );
}

function clean(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function cleanSummary(value: string | undefined) {
  return clean(value)
    .replace(/^[-\s]*(job title|summary)\s*:\s*/i, "")
    .replace(/^[-\s]+/, "")
    .replace(/\s+-\s+/g, ". ");
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function simplifyTitle(title: string, fallbackRole: string) {
  const fromSummary = title.match(/job title:\s*([^.]+)/i)?.[1]?.trim();
  const withoutSite = (fromSummary || title).split("|")[0]?.trim();
  return truncate(withoutSite || `${fallbackRole} Job`, 72);
}

function extractEmployer(text: string, url: string | undefined) {
  const fromSummary =
    text.match(/\b(?:company|company\/organization|organization):\s*([^.]+)/i)?.[1]?.trim() ||
    text.match(/\bby\s+([A-Z][A-Za-z0-9 .&]+)\b/)?.[1]?.trim();

  if (fromSummary) {
    return truncate(fromSummary, 46);
  }

  if (!url) {
    return "Employer";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Employer";
  }
}

function extractLocation(text: string) {
  return (
    text.match(/\b(?:G|F|I)-?\d{1,2}\s+Islamabad\b/i)?.[0] ||
    text.match(/\bIslamabad\b/i)?.[0] ||
    text.match(/\bRawalpindi\b/i)?.[0] ||
    text.match(/\bLahore\b/i)?.[0] ||
    text.match(/\bKarachi\b/i)?.[0] ||
    undefined
  );
}

function extractSalary(text: string) {
  const salaryMatch =
    text.match(/(?:PKR|Rs\.?|salary)\s*([\d,]{4,7})/i)?.[1] ||
    text.match(/([\d,]{2,3})\s*(?:k|hazaar)/i)?.[1];

  if (!salaryMatch) {
    return null;
  }

  const number = Number(salaryMatch.replace(/,/g, ""));

  if (Number.isNaN(number)) {
    return null;
  }

  return number < 1000 ? number * 1000 : number;
}

function extractContact(text: string) {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim();

  if (email) {
    return email;
  }

  return text
    .match(
      /\b(?:phone|whatsapp|contact|call|mobile)\D{0,25}((?:\+92|0092|0)3\d{2}[\s.-]?\d{7})\b/i,
    )?.[1]
    ?.trim();
}

function detectPlatform(url: string, source: SearchSource): JobPlatform {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes("linkedin.com")) return "linkedin";
    if (hostname.includes("olx.com.pk")) return "olx";
    if (hostname.includes("rozee.pk")) return "rozee";
    if (hostname.includes("mustakbil.com")) return "mustakbil";
    if (hostname.includes("indeed.")) return "indeed";
    if (hostname.includes("jobz.pk")) return "jobz";
    if (hostname.includes("greenhouse.")) return "greenhouse";
    if (hostname.includes("lever.co")) return "lever";
    if (hostname.includes("ashbyhq.com")) return "ashby";
    if (hostname.includes("workable.com")) return "workable";
    if (hostname.includes("bamboohr.com")) return "bamboohr";
    if (hostname.includes("careers") || hostname.includes("jobs")) return "company";
  } catch {
    return source.platform;
  }

  return source.platform;
}

function getApplicationMethod(
  platform: JobPlatform,
  contactHint: string | undefined,
): JobListing["applicationMethod"] {
  if (contactHint) {
    return "contact";
  }

  if (["greenhouse", "lever", "ashby", "workable", "bamboohr"].includes(platform)) {
    return "ats_link";
  }

  if (["linkedin", "olx", "rozee", "mustakbil", "indeed", "jobz"].includes(platform)) {
    return "job_board_link";
  }

  return platform === "demo" ? "unavailable" : "external_link";
}

function getSourceLabel(platform: JobPlatform, source: SearchSource) {
  const sourceByPlatform: Record<JobPlatform, string> = {
    linkedin: "LinkedIn Jobs",
    olx: "OLX Pakistan",
    rozee: "Rozee.pk",
    mustakbil: "Mustakbil",
    indeed: "Indeed",
    jobz: "Jobz.pk",
    greenhouse: "Greenhouse ATS",
    lever: "Lever ATS",
    ashby: "Ashby ATS",
    workable: "Workable ATS",
    bamboohr: "BambooHR ATS",
    company: "Company career page",
    web: "Web listing",
    demo: "Demo fallback",
  };

  return sourceByPlatform[platform] ?? source.label;
}

function getReliability(
  platform: JobPlatform,
  fallback: JobListing["reliability"],
): JobListing["reliability"] {
  if (["greenhouse", "lever", "ashby", "workable", "bamboohr"].includes(platform)) {
    return "high";
  }

  if (["linkedin", "olx", "rozee", "mustakbil", "indeed", "jobz"].includes(platform)) {
    return "medium";
  }

  return fallback;
}

function scoreLiveJob(input: {
  index: number;
  location: string;
  locationVerified: boolean;
  platform: JobPlatform;
  profile: WorkerProfile;
  reliability: JobListing["reliability"];
  salaryPkr: number | null;
  text: string;
}) {
  const reliabilityBoost = { high: 12, medium: 8, low: 2 }[input.reliability];
  const salaryBoost =
    input.salaryPkr && input.salaryPkr >= input.profile.minimumSalaryPkr
      ? 8
      : input.salaryPkr
        ? -3
        : 0;
  const roleBoost = input.text.toLowerCase().includes(input.profile.role.toLowerCase())
    ? 8
    : 0;
  const platformBoost = input.platform === "company" ? 4 : 0;

  return Math.max(
    60,
    Math.min(
      98,
      68 +
        reliabilityBoost +
        salaryBoost +
        roleBoost +
        platformBoost -
        input.index * 3 -
        (input.locationVerified ? 0 : 8),
    ),
  );
}

function exactLocationBoost(jobLocation: string, profileLocation: string) {
  const profileParts = profileLocation.toLowerCase().match(/\b[gif]-?\d{1,2}\b/g) ?? [];
  const jobText = jobLocation.toLowerCase();

  return profileParts.some((part) => jobText.includes(part.replace("-", "")) || jobText.includes(part))
    ? 5
    : 0;
}
