import { sampleIssues } from "./sample-issues";
import type { Issue } from "./triage";

/**
 * Loads the issues to triage. A step, so a replayed workflow reuses the
 * recorded result. Replace the sample data with a call to your issue tracker.
 */
export async function loadIssues(): Promise<Issue[]> {
  "use step";
  return sampleIssues;
}
