"use server";

import { redirect } from "next/navigation";
import { saveSession } from "@/lib/session";
import { verifyCredentials } from "@/lib/data";

export type LoginState = { error: string } | null;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const userId = await verifyCredentials(email, password);
  if (!userId) {
    return { error: "These credentials do not match our records." };
  }

  await saveSession({ userId });

  redirect("/");
}
