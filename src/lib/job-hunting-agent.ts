import { findJobsForProfile, type JobSearchOptions } from "@/lib/jobs";
import type { WorkerProfile } from "@/lib/ai";

export const jobHuntingAgent = {
  name: "Kaamyaabi Job Hunting Agent",
  role: "Search multi-source jobs, prioritize direct-contact opportunities, dedupe, and rank.",
};

export function runJobHuntingAgent(
  profile: WorkerProfile,
  options: JobSearchOptions = {},
) {
  return findJobsForProfile(profile, options);
}
