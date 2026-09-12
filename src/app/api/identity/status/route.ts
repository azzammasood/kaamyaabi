import { NextResponse } from "next/server";

import { getAuth0 } from "@/lib/auth0";

export async function GET() {
  const auth0 = getAuth0();

  if (!auth0) {
    return NextResponse.json({
      configured: false,
      authenticated: false,
    });
  }

  const session = await auth0.getSession();

  return NextResponse.json({
    configured: true,
    authenticated: Boolean(session),
    user: session
      ? {
          email: session.user.email,
          emailVerified: session.user.email_verified,
          name: session.user.name,
          sub: session.user.sub,
        }
      : null,
  });
}
