import type { Issue } from "./triage";

const issues: Issue[] = [
  {
    number: 101,
    title: "Checkout button does nothing on Safari",
    body: "Since yesterday's release, clicking Pay on the checkout page does nothing in Safari 19. No error in the console. Chrome and Firefox work. Customers on iPhone cannot complete orders.",
  },
  {
    number: 102,
    title: "Add dark mode",
    body: "It would be great if the dashboard followed the system dark mode setting.",
  },
  {
    number: 103,
    title: "README still says to run `npm run setup`",
    body: "The setup script was removed two releases ago, but the README still tells new contributors to run it.",
  },
  {
    number: 104,
    title: "Upgrade the test runner",
    body: "Our test runner is three major versions behind and prints deprecation warnings on every run.",
  },
  {
    number: 105,
    title: "Exports feel slow",
    body: "Exporting a report to CSV takes a while for our larger workspaces. Not sure if this is expected or if something changed.",
  },
  {
    number: 106,
    title: "Search ignores accents",
    body: "Searching for 'cafe' does not find 'café'. Is this intended? Some of our users expect it to match, others don't.",
  },
];

/**
 * Loads the issues to triage. A step, so a replayed workflow reuses the
 * recorded result. Replace the sample data with a call to your issue tracker.
 */
export async function loadIssues(): Promise<Issue[]> {
  "use step";
  return issues;
}
