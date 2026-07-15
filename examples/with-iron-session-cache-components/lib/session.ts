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
  return unsealData<SessionData>(cookie, { password });
}

export async function saveSession(data: SessionData) {
  const sealed = await sealData(data, { password });
  (await cookies()).set(COOKIE_NAME, sealed, cookieOptions);
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}
