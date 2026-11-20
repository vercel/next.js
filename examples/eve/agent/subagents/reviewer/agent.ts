import { defineAgent } from "eve";

export default defineAgent({
  description: "Classify one issue and summarize it.",
  model: "openai/gpt-6-luna-fast",
  tool: false,
  // No shell, files, or web access: it only reads the issue the workflow sends.
  defaultTools: false,
});
