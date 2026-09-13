"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const signUp = async (formData: FormData) => {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  await auth.api.signUpEmail({
    body: { name, email, password, callbackURL: "/" },
    headers: await headers(),
  });
  redirect("/");
};

export const signIn = async (formData: FormData) => {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  await auth.api.signInEmail({
    body: { email, password, callbackURL: "/", rememberMe: true },
    headers: await headers(),
  });
  redirect("/");
};

export const signOut = async () => {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
};

export const getSession = async () => {
  return await auth.api.getSession({ headers: await headers() });
};
