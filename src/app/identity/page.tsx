import { redirect } from "next/navigation";

import { getAuth0, isAuth0Configured } from "@/lib/auth0";
import { getVerifiedIdentity, linkVerifiedIdentity } from "@/lib/identity";

type IdentityPageProps = {
  searchParams: Promise<{
    phone?: string;
  }>;
};

export default async function IdentityPage({ searchParams }: IdentityPageProps) {
  const { phone } = await searchParams;

  if (!isAuth0Configured()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
          Auth0 setup needed
        </p>
        <h1 className="text-3xl font-semibold">Identity verification is not configured yet.</h1>
        <p className="text-zinc-600">
          Add Auth0 tenant values in <code>.env.local</code>, restart the server, then open this page again.
        </p>
      </main>
    );
  }

  const auth0 = getAuth0();
  const session = auth0 ? await auth0.getSession() : null;

  if (!session) {
    const returnTo = phone ? `/identity?phone=${encodeURIComponent(phone)}` : "/identity";
    redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const identity = phone
    ? linkVerifiedIdentity(phone, {
        email: session.user.email,
        emailVerified: session.user.email_verified,
        name: session.user.name,
        sub: session.user.sub,
      })
    : undefined;
  const existingIdentity = phone ? getVerifiedIdentity(phone) : undefined;
  const displayIdentity = identity ?? existingIdentity;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Kaamyaabi identity
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Verified with Auth0</h1>
        <p className="mt-3 text-zinc-600">
          Your account is linked. Go back to WhatsApp and send <strong>STATUS</strong> or continue applying.
        </p>
      </div>

      <dl className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <dt className="text-sm text-zinc-500">Name</dt>
          <dd className="font-medium">{displayIdentity?.name ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">Email</dt>
          <dd className="font-medium">{displayIdentity?.email ?? "Not provided"}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500">WhatsApp</dt>
          <dd className="font-medium">{displayIdentity?.phone ?? phone ?? "Not linked"}</dd>
        </div>
      </dl>

      <a className="text-sm font-medium text-zinc-900 underline" href="/auth/logout">
        Log out
      </a>
    </main>
  );
}
