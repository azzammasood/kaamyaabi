import {
  startJobApplication,
  type ApplicantContact,
  type JobListing,
} from "@/lib/jobs";
import type { WorkerProfile } from "@/lib/ai";
import type { LanguageCode } from "@/lib/language";

export const jobApplicationAgent = {
  name: "Kaamyaabi Job Application Agent",
  role: "Choose the safest real application path: auto-apply, direct contact, email, official link, or manual handoff.",
};

export function runJobApplicationAgent(input: {
  applicantContact?: ApplicantContact;
  job: JobListing;
  language?: LanguageCode;
  profile: WorkerProfile;
}) {
  return startJobApplication(
    input.job,
    input.profile,
    input.language ?? "english",
    input.applicantContact,
  );
}
