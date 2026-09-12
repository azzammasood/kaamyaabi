import type { WorkerProfile } from "@/lib/ai";
import type { ApplicantContact, JobListing } from "@/lib/jobs";
import {
  assessJobTrust,
  assessWorkerTrust,
  canApplyWithTrust,
  type TrustAssessment,
} from "@/lib/trust";

export const trustAgent = {
  name: "Kaamyaabi Trust Agent",
  role: "Score workers and jobs before applications so spammy, scammy, or incomplete flows are blocked.",
};

export type TrustGateResult = {
  allowed: boolean;
  workerTrust: TrustAssessment;
  jobTrust: TrustAssessment;
};

export function runTrustAgent(input: {
  contact?: ApplicantContact;
  job: JobListing;
  profile: WorkerProfile;
}): TrustGateResult {
  const workerTrust = assessWorkerTrust(input.profile, input.contact);
  const jobTrust = assessJobTrust(input.job);

  return {
    allowed: canApplyWithTrust(workerTrust, jobTrust),
    workerTrust,
    jobTrust,
  };
}
