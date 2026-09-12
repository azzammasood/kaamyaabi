export type VerifiedIdentity = {
  email?: string;
  emailVerified?: boolean;
  name?: string;
  phone: string;
  provider: "auth0";
  sub: string;
  updatedAt: string;
};

const globalForIdentity = globalThis as typeof globalThis & {
  __kaamyaabiIdentities?: Map<string, VerifiedIdentity>;
};

const identities =
  globalForIdentity.__kaamyaabiIdentities ?? new Map<string, VerifiedIdentity>();
globalForIdentity.__kaamyaabiIdentities = identities;

export function normalizePhoneKey(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

export function linkVerifiedIdentity(
  phone: string,
  identity: Omit<VerifiedIdentity, "phone" | "provider" | "updatedAt">,
) {
  const key = normalizePhoneKey(phone);
  const value: VerifiedIdentity = {
    ...identity,
    phone: key,
    provider: "auth0",
    updatedAt: new Date().toISOString(),
  };

  identities.set(key, value);
  return value;
}

export function getVerifiedIdentity(phone: string | undefined) {
  if (!phone) {
    return undefined;
  }

  return identities.get(normalizePhoneKey(phone));
}
