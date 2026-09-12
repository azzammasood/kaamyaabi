import { extractWorkerProfile } from "@/lib/ai";
import { runJobHuntingAgent } from "@/lib/job-hunting-agent";
import { formatJobList } from "@/lib/jobs";

export const runtime = "nodejs";

export async function GET() {
  const profile = await extractWorkerProfile(
    "Driver, G-9 Islamabad, 4 years experience, minimum salary 40000, available Monday",
  );
  const jobs = await runJobHuntingAgent(profile);

  return Response.json({
    profile,
    jobs,
    whatsappPreview: formatJobList(jobs, profile),
  });
}
