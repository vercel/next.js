import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Triages issues with a decision model and escalates unsure ones to a reviewer subagent.",
  model: "openai/gpt-6-luna-fast",
  // Triage runs only through the triage_issues workflow tool.
  tool: false,
  // No shell, files, or web access.
  defaultTools: false,
});
