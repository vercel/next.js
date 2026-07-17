"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = { error: string } | null;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = formData.get("username");
  if (typeof username !== "string" || username.trim() === "") {
    return { error: "Enter a username." };
  }

  (await cookies()).set("session", username.trim());
  redirect("/");
}

export async function logout() {
  (await cookies()).delete("session");
  redirect("/login");
}
