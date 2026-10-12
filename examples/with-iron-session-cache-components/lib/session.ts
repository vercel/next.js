import "server-only";

import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";

export type SessionData = {
  userId?: string;
};

const COOKIE_NAME = "app_session";

const password = process.env.SESSION_PASSWORD!;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function getSession(): Promise<SessionData> {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie) {
    return {};
  }
  try {
    return await unsealData<SessionData>(cookie, { password });
  } catch {
    // An expired, tampered, or otherwise unsealable cookie (for example after
    // SESSION_PASSWORD is rotated) is treated the same as no session, so
    // callers redirect to /login instead of hitting the error boundary.
    return {};
  }
}

export async function saveSession(data: SessionData) {
  const sealed = await sealData(data, { password });
  (await cookies()).set(COOKIE_NAME, sealed, cookieOptions);
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}
