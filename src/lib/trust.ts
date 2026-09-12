import type { WorkerProfile } from "@/lib/ai";
import type { ApplicantContact, JobListing } from "@/lib/jobs";

export type TrustLevel = "verified" | "review" | "blocked";

export type TrustAssessment = {
  level: TrustLevel;
  score: number;
  signals: string[];
  warnings: string[];
};

const scamPatterns = [
  /registration\s+fee/i,
  /advance\s+payment/i,
  /deposit/i,
  /\botp\b/i,
  /bank\s+pin/i,
  /cnic\s+.*(?:deposit|fee|advance)/i,
  /crypto|investment|trading/i,
  /passport\s+hold/i,
];

export function assessWorkerTrust(
  profile: WorkerProfile | undefined,
  contact: ApplicantContact | undefined,
): TrustAssessment {
  let score = 25;
  const signals: string[] = [];
  const warnings: string[] = [];

  if (contact?.phone) {
    score += 20;
    signals.push("WhatsApp phone linked");
  } else {
    warnings.push("phone missing");
  }

  if (profile?.name && !isMissingText(profile.name)) {
    score += 10;
    signals.push("name present");
  } else if (contact?.whatsappName || contact?.name) {
    score += 8;
    signals.push("WhatsApp display name present");
  } else {
    warnings.push("name missing");
  }

  if (contact?.email) {
    score += 8;
    signals.push("email present");
  } else {
    warnings.push("email missing");
  }

  if (profile?.role && !isMissingText(profile.role)) {
    score += 10;
    signals.push("role present");
  } else {
    warnings.push("role missing");
  }

  if (profile?.location && !isMissingText(profile.location)) {
    score += 10;
    signals.push("location present");
  } else {
    warnings.push("location missing");
  }

  if (profile && profile.minimumSalaryPkr > 0) {
    score += 10;
    signals.push("salary expectation present");
  } else {
    warnings.push("salary expectation missing");
  }

  if (profile && profile.experienceYears >= 0) {
    score += 5;
    signals.push("experience present");
  }

  if (profile?.skills.some((skill) => !isMissingText(skill))) {
    score += 7;
    signals.push("skills present");
  } else {
    warnings.push("skills missing");
  }

  return finalizeAssessment(score, signals, warnings, warnings.length >= 4);
}

export function assessJobTrust(job: JobListing): TrustAssessment {
  let score = 35;
  const signals: string[] = [];
  const warnings: string[] = [];
  const text = `${job.title} ${job.employer} ${job.summary} ${job.why.join(" ")}`;

  if (job.source === "live") {
    score += 15;
    signals.push("live source");
  } else {
    warnings.push("demo fallback");
  }

  if (job.reliability === "high") {
    score += 25;
    signals.push("high reliability source");
  } else if (job.reliability === "medium") {
    score += 15;
    signals.push("medium reliability source");
  } else {
    warnings.push("low reliability source");
  }

  if (job.url) {
    score += 10;
    signals.push("listing URL present");
  } else {
    warnings.push("listing URL missing");
  }

  if (job.applicationMethod === "ats_link") {
    score += 15;
    signals.push("official ATS apply route");
  } else if (job.applicationMethod === "job_board_link") {
    score += 10;
    signals.push("job-board apply route");
  } else if (job.applicationMethod === "contact") {
    score += 8;
    signals.push("direct contact route");
  } else {
    warnings.push("application route unclear");
  }

  if (job.locationVerified) {
    score += 5;
    signals.push("location present");
  }

  if (job.salaryPkr && job.salaryPkr > 0) {
    score += 5;
    signals.push("salary visible");
  } else {
    warnings.push("salary not listed");
  }

  const matchedScamPatterns = scamPatterns.filter((pattern) => pattern.test(text));
  if (matchedScamPatterns.length > 0) {
    score -= 55;
    warnings.push("possible scam language");
  }

  const blocked = matchedScamPatterns.length > 0 || score < 35;
  return finalizeAssessment(score, signals, warnings, blocked);
}

export function canApplyWithTrust(
  workerTrust: TrustAssessment,
  jobTrust: TrustAssessment,
) {
  return workerTrust.level !== "blocked" && jobTrust.level !== "blocked";
}

export function formatTrustBadge(assessment: TrustAssessment) {
  const label =
    assessment.level === "verified"
      ? "Verified"
      : assessment.level === "review"
        ? "Needs review"
        : "Blocked";

  return `${label} (${assessment.score}/100)`;
}

function isMissingText(value: string) {
  return /^not (provided|specified)$/i.test(value.trim());
}

function finalizeAssessment(
  score: number,
  signals: string[],
  warnings: string[],
  blocked: boolean,
): TrustAssessment {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level: TrustLevel = blocked
    ? "blocked"
    : normalizedScore >= 75
      ? "verified"
      : "review";

  return {
    level,
    score: normalizedScore,
    signals,
    warnings,
  };
}
