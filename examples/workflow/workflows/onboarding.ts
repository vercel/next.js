import { getStepMetadata, getWritable, RetryableError, sleep } from "workflow";
import type { ProgressEvent } from "@/lib/progress";

export async function onboardUser(email: string) {
  "use workflow";

  const user = await createUser(email);
  await sendWelcomeEmail(user.email);

  await reportProgress("Waiting 10 seconds before the follow-up email");
  // Pauses the workflow without using any compute. In a real app this could
  // be "3d" or longer.
  await sleep("10s");

  await sendFollowUpEmail(user.email);
  await finish(user.id);

  return { userId: user.id };
}

async function createUser(email: string) {
  "use step";

  // The step ID stays the same across retries, so it works as an
  // idempotency key: a retried step creates the same user, not a second one.
  const { stepId } = getStepMetadata();
  const user = { id: `user_${stepId.slice(-8)}`, email };

  await write({ type: "step", message: `Created user ${user.id}` });
  return user;
}

async function sendWelcomeEmail(email: string) {
  "use step";

  const { attempt } = getStepMetadata();

  // Simulates an email provider that fails on the first try. Workflow SDK
  // retries the step, and the steps that already completed are not repeated.
  if (attempt === 1) {
    await write({
      type: "retry",
      message: "Email provider unavailable, retrying in 3 seconds",
    });
    throw new RetryableError("Email provider unavailable", {
      retryAfter: "3s",
    });
  }

  await write({
    type: "step",
    message: `Sent welcome email to ${email} (attempt ${attempt})`,
  });
}

async function sendFollowUpEmail(email: string) {
  "use step";

  await write({ type: "step", message: `Sent follow-up email to ${email}` });
}

async function reportProgress(message: string) {
  "use step";

  await write({ type: "sleep", message });
}

async function finish(userId: string) {
  "use step";

  await write({ type: "done", message: `Onboarded ${userId}` });
  // Closing the stream tells readers the run has no more progress to report
  await getWritable<Uint8Array>().close();
}

// Writes one progress event to the run's stream as a line of JSON. The stream
// is durable, so a page that reconnects replays every event from the start.
async function write(event: Omit<ProgressEvent, "at">) {
  const writer = getWritable<Uint8Array>().getWriter();
  const line = JSON.stringify({ ...event, at: new Date().toISOString() });
  await writer.write(new TextEncoder().encode(`${line}\n`));
  writer.releaseLock();
}
