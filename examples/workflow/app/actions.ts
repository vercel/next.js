"use server";

import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { onboardUser } from "@/workflows/onboarding";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;

  // Queues the workflow and returns right away, without waiting for it to
  // finish
  const run = await start(onboardUser, [email]);

  redirect(`/runs/${run.runId}`);
}
