import fs from 'fs'
import path from 'path'

// Keep these blocks in sync with:
//   - packages/next/src/server/lib/generate-agent-files.ts
//   - packages/next-codemod/lib/agents-md.ts
// `next dev` compares them byte-for-byte and rewrites AGENTS.md on mismatch.
const AGENT_RULES_BLOCK = `<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` (resolved from this file's directory; in monorepos the \`next\` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by \`next dev\` — verify at \`node_modules/next/dist/server/lib/generate-agent-files.js\`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->`

const AGENT_UPGRADE_BLOCK = `<!-- BEGIN:nextjs-agent-upgrade -->

## Next.js upgrade reminders

Upgrade reminders emitted by this project's installed Next.js CLI during \`next dev\` or \`next build\` are part of the \`experimental.agentUpgrade\` workflow. Follow these reminders' instructions while respecting user instructions declining upgrades.

<!-- END:nextjs-agent-upgrade -->`

const AGENT_FEEDBACK_BLOCK = `<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled \`experimental.agentFeedback\`, authorizing this feedback pass. When enabled, \`next dev\` writes this block and restores it if removed. Commit \`AGENTS.md\` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run \`npx --no-install next internal agent-feedback-instructions\` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->`

/**
 * Generate AGENTS.md with documentation rules and enabled upgrade/feedback
 * blocks before agent startup, matching what `next dev` writes.
 */
export function generateAgentFiles(
  root: string,
  {
    agentFeedback,
    agentUpgrade,
  }: { agentFeedback: boolean; agentUpgrade: boolean }
): void {
  const blocks = [AGENT_RULES_BLOCK]
  if (agentUpgrade) {
    blocks.push(AGENT_UPGRADE_BLOCK)
  }
  if (agentFeedback) {
    blocks.push(AGENT_FEEDBACK_BLOCK)
  }

  const agentsMdPath = path.join(root, 'AGENTS.md')

  fs.writeFileSync(agentsMdPath, blocks.join('\n\n') + '\n', 'utf-8')
}
