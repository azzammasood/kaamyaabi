import { Auth0Client } from "@auth0/nextjs-auth0/server";

export function isAuth0Configured() {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_SECRET,
  );
}

export function getAuth0() {
  if (!isAuth0Configured()) {
    return undefined;
  }

  return new Auth0Client({
    appBaseUrl:
      process.env.APP_BASE_URL ||
      process.env.AUTH0_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL,
  });
}
