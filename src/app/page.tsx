import { getAuth0, isAuth0Configured } from "@/lib/auth0";

export default async function Home() {
  const configured = isAuth0Configured();
  const auth0 = getAuth0();
  const session = auth0 ? await auth0.getSession() : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
              Kaamyaabi
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Verified job agent dashboard</h1>
          </div>
          {session ? (
            <a className="rounded-md border px-4 py-2 text-sm font-medium" href="/auth/logout">
              Log out
            </a>
          ) : (
            <a className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white" href="/auth/login">
              Log in
            </a>
          )}
        </div>

        <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-sm text-zinc-500">Auth0</p>
            <p className="mt-1 font-medium">
              {configured ? "Configured" : "Needs tenant values in .env.local"}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500">Current browser identity</p>
            <p className="mt-1 font-medium">
              {session?.user.email ?? session?.user.name ?? "Not logged in"}
            </p>
          </div>
          <div>
            <p className="text-sm text-zinc-500">WhatsApp command</p>
            <p className="mt-1 font-medium">Send VERIFY to get an identity link.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
