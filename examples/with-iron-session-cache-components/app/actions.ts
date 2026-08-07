"use server";

import { redirect } from "next/navigation";
import { getSession, destroySession } from "@/lib/session";
import { addUserNote } from "@/lib/data";

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function addNote(formData: FormData) {
  // Re-check the session inside the action. Never trust the client to tell you
  // who the current user is.
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }

  const note = String(formData.get("note") ?? "").trim();
  if (note) {
    await addUserNote(session.userId, note);
  }
}
