import type { WorkerProfile } from "@/lib/ai";

export type JobListing = {
  id: string;
  title: string;
  employer: string;
  applicationMethod: "external_link" | "contact" | "unavailable";
  contactHint?: string;
  location: string;
  salaryPkr: number | null;
  match: number;
  source: "live" | "demo";
  url?: string;
  summary: string;
  why: string[];
};

export type JobSearchStatus = {
  provider: "exa" | "seeded";
  liveCalls: number;
  liveFailures: number;
  liveCostDollars: number;
  lastSearchAt?: string;
  lastError?: string;
};

const jobSearchStatus: JobSearchStatus = {
  provider: "seeded",
  liveCalls: 0,
  liveFailures: 0,
  liveCostDollars: 0,
};

const seededJobs: JobListing[] = [
  {
    id: "family-driver-g10",
    title: "Family Driver",
    employer: "Khan Family",
    applicationMethod: "unavailable",
    location: "G-10 Islamabad",
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
    location: "F-8 Islamabad",
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
    location: "G-11 Islamabad",
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

export async function findJobsForProfile(profile: WorkerProfile) {
  try {
    const liveJobs = await findLiveJobs(profile);

    if (liveJobs.length > 0) {
      jobSearchStatus.provider = "exa";
      return mergeWithSeededJobs(liveJobs, profile).slice(0, 3);
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

export function formatJobList(jobs: JobListing[], profile: WorkerProfile) {
  const sourceLabel = jobs.some((job) => job.source === "live")
    ? "live web + demo fallback"
    : "demo fallback";

  return `I found ${jobs.length} job matches (${sourceLabel}).

${jobs.map((job, index) => formatJobCard(job, index + 1)).join("\n\n")}

Recommended: apply to #1 and negotiate for PKR ${Math.max(
    profile.minimumSalaryPkr,
    45000,
  ).toLocaleString("en-PK")}.

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

export function formatApplicationSummary(job: JobListing, profile: WorkerProfile) {
  const targetSalary = Math.max(profile.minimumSalaryPkr, job.salaryPkr ?? 0);
  const salaryAsk = `PKR ${targetSalary.toLocaleString("en-PK")}`;
  const applicationMessage = buildApplicationMessage(job, profile, salaryAsk);

  if (job.applicationMethod === "unavailable") {
    return {
      targetSalary,
      started: `This match is a demo fallback, not a real external listing.

I will not pretend to apply to it. Send JOBS again and choose a live listing with APPLY 1, APPLY 2, or APPLY 3.`,
      offer: "",
    };
  }

  const actionLine =
    job.applicationMethod === "contact" && job.contactHint
      ? `Contact/apply here: ${job.contactHint}`
      : `Open the real listing and apply here: ${job.url}`;

  return {
    targetSalary,
    started: `Real application packet ready

${formatJobCard(job, 1)}

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

function buildApplicationMessage(
  job: JobListing,
  profile: WorkerProfile,
  salaryAsk: string,
) {
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

function formatJobCard(job: JobListing, index: number) {
  const linkLine = job.url ? `\nOpen listing: ${job.url}` : "";
  const applyLine =
    job.applicationMethod === "contact" && job.contactHint
      ? `\nApply/contact: ${job.contactHint}`
      : job.applicationMethod === "external_link" && job.url
        ? `\nApply via listing link`
        : "\nApplication route: not available for this demo fallback";

  return `*${index}. ${job.title}*
${job.employer} | ${job.location}

Salary: ${formatSalary(job.salaryPkr)}
Match: ${job.match}%
Source: ${job.source === "live" ? "Live web listing" : "Demo verified listing"}

${job.summary}${applyLine}

Fit: ${job.why.join("; ")}${linkLine}`;
}

function formatSalary(salaryPkr: number | null) {
  return salaryPkr ? `PKR ${salaryPkr.toLocaleString("en-PK")}` : "Not listed";
}

async function findLiveJobs(profile: WorkerProfile): Promise<JobListing[]> {
  const apiKey = process.env.EXA_API_KEY;

  if (!apiKey) {
    return [];
  }

  jobSearchStatus.liveCalls += 1;
  jobSearchStatus.lastSearchAt = new Date().toISOString();

  const query = `${profile.role} job ${profile.location} Pakistan salary hiring apply`;
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 5,
      contents: {
        text: {
          maxCharacters: 700,
        },
        summary: {
          query:
            "Summarize the job title, company, location, salary if visible, and why this may fit the worker.",
        },
        livecrawl: "preferred",
        livecrawlTimeout: 1000,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Exa returned ${response.status}`);
  }

  const json = (await response.json()) as ExaSearchResponse;
  jobSearchStatus.liveCostDollars += json.costDollars?.total ?? 0;

  return (
    json.results
      ?.map((result, index) => normalizeExaResult(result, index, profile))
      .filter((job): job is JobListing => Boolean(job)) ?? []
  );
}

function normalizeExaResult(
  result: NonNullable<ExaSearchResponse["results"]>[number],
  index: number,
  profile: WorkerProfile,
): JobListing | undefined {
  const title = clean(result.title);
  const body = cleanSummary(`${result.summary ?? ""} ${result.text ?? ""}`);

  if (!title || !result.url || !looksLikeJobResult(`${title} ${body}`)) {
    return undefined;
  }

  const salaryPkr = extractSalary(`${title} ${body}`);
  const location = extractLocation(`${title} ${body}`) || profile.location;
  const employer = extractEmployer(`${title} ${body}`, result.url);
  const contactHint = extractContact(`${title} ${body}`);
  const match = Math.max(72, 88 - index * 6 + (salaryPkr ? 4 : 0));

  return {
    id: result.id || result.url,
    title: simplifyTitle(`${title} ${body}`, profile.role),
    employer,
    applicationMethod: contactHint ? "contact" : "external_link",
    contactHint,
    location,
    salaryPkr,
    match,
    source: "live",
    url: result.url,
    summary:
      truncate(body, 170) ||
      `Live result found for ${profile.role} near ${profile.location}.`,
    why: buildWhy(profile, location, salaryPkr, "live"),
  };
}

function mergeWithSeededJobs(liveJobs: JobListing[], profile: WorkerProfile) {
  const rankedSeeded = rankSeededJobs(profile);
  return [...liveJobs, ...rankedSeeded].slice(0, 3);
}

function rankSeededJobs(profile: WorkerProfile) {
  return seededJobs
    .map((job) => ({
      ...job,
      match: scoreSeededJob(job, profile),
      why: buildWhy(profile, job.location, job.salaryPkr, "demo"),
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
  salaryPkr: number | null,
  source: "live" | "demo",
) {
  const reasons = [
    `${profile.role} matches your profile`,
    location ? `Location: ${location}` : "Location needs confirmation",
  ];

  if (salaryPkr && salaryPkr >= profile.minimumSalaryPkr) {
    reasons.push("Salary meets your minimum");
  } else if (salaryPkr) {
    reasons.push("Salary is below your minimum, negotiate first");
  } else {
    reasons.push("Salary not listed, ask before confirming");
  }

  if (source === "live") {
    reasons.push("Found from live web search");
  }

  return reasons;
}

function looksLikeJobResult(text: string) {
  return /\b(job|career|hiring|vacancy|apply|driver|developer|electrician|plumber|teacher|sales|delivery)\b/i.test(
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
  return (
    text.match(/\+?\d[\d\s().-]{8,}\d/)?.[0]?.trim() ||
    text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() ||
    undefined
  );
}
