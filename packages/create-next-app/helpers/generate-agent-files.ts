import fs from 'fs'
import path from 'path'

/**
 * Generate AGENTS.md and CLAUDE.md in the project root.
 * AGENTS.md contains the instructions, CLAUDE.md references it using @ syntax.
 *
 * Examples and starters may ship their own AGENTS.md with project-specific
 * guidance, so the managed block is upserted between markers instead of
 * overwriting the file: content outside the markers is preserved.
 *
 * Keep the marker and block content in sync with:
 *   - packages/next/src/server/lib/generate-agent-files.ts
 *   - packages/next-codemod/lib/agents-md.ts
 */

const AGENT_RULES_START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
const AGENT_RULES_END_MARKER = '<!-- END:nextjs-agent-rules -->'

const AGENT_RULES_BLOCK = `${AGENT_RULES_START_MARKER}
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` (resolved from this file's directory; in monorepos the \`next\` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by \`next dev\` — verify at \`node_modules/next/dist/server/lib/generate-agent-files.js\`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
${AGENT_RULES_END_MARKER}`

const CLAUDE_MD_CONTENT = `@AGENTS.md
`

export function generateAgentFiles(root: string): void {
  const agentsMdPath = path.join(root, 'AGENTS.md')
  const claudeMdPath = path.join(root, 'CLAUDE.md')

  if (fs.existsSync(agentsMdPath)) {
    const existing = fs.readFileSync(agentsMdPath, 'utf-8')
    const updated = upsertAgentRulesBlock(existing, AGENT_RULES_BLOCK)
    if (updated !== existing) {
      fs.writeFileSync(agentsMdPath, updated, 'utf-8')
    }
  } else {
    fs.writeFileSync(agentsMdPath, AGENT_RULES_BLOCK + '\n', 'utf-8')
  }

  // A shipped CLAUDE.md is left as-is; it usually already references
  // AGENTS.md, and overwriting would drop any customizations.
  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, CLAUDE_MD_CONTENT, 'utf-8')
  }
}

/**
 * Detect the predominant line-ending style. Returns `'\r\n'` if any
 * CRLF is present, `'\n'` otherwise — avoids mixed EOLs on Windows.
 */
function detectEol(content: string): '\r\n' | '\n' {
  return /\r\n/.test(content) ? '\r\n' : '\n'
}

function normalizeEol(s: string, eol: '\r\n' | '\n'): string {
  return s.replace(/\r?\n/g, eol)
}

/**
 * Replace the marker-delimited region in `existing` with `block`, or
 * append the block when no markers are present. Content outside the
 * markers is preserved verbatim.
 */
function upsertAgentRulesBlock(existing: string, block: string): string {
  const eol = detectEol(existing)
  const normalizedBlock = normalizeEol(block, eol)

  const startIdx = existing.indexOf(AGENT_RULES_START_MARKER)
  const endIdx = existing.indexOf(AGENT_RULES_END_MARKER)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx)
    const after = existing.slice(endIdx + AGENT_RULES_END_MARKER.length)
    return before + normalizedBlock + after
  }

  const separator =
    existing.length === 0 || /\r?\n$/.test(existing) ? eol : eol + eol
  return existing + separator + normalizedBlock + eol
}
