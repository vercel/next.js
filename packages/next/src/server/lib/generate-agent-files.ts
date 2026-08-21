/**
 * Auto-generate AGENTS.md / CLAUDE.md with the managed Next.js agent-rules
 * block when `next dev` detects an AI coding agent but the block is missing.
 *
 * Keep the marker and block content in sync with:
 *   - packages/create-next-app/helpers/generate-agent-files.ts
 *   - packages/next-codemod/lib/agents-md.ts
 */

import fs from 'fs'
import path from 'path'

export const AGENT_RULES_START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
export const AGENT_RULES_END_MARKER = '<!-- END:nextjs-agent-rules -->'

/**
 * Markers written by the pre-bundled-docs version of `agents-md`.
 * Stripped on upsert so projects that ran the old codemod end up with
 * a single current block instead of two stale-and-current blocks.
 */
const LEGACY_AGENT_RULES_START_MARKER = '<!-- NEXT-AGENTS-MD-START -->'
const LEGACY_AGENT_RULES_END_MARKER = '<!-- NEXT-AGENTS-MD-END -->'

function buildAgentRulesBlock(): string {
  return `${AGENT_RULES_START_MARKER}

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` (resolved from this file's directory; in monorepos the \`next\` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by \`next dev\` — verify at \`node_modules/next/dist/server/lib/generate-agent-files.js\`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

${AGENT_RULES_END_MARKER}`
}

const CLAUDE_MD_CONTENT = `@AGENTS.md\n`

export type AgentFileAction = 'created' | 'updated' | 'unchanged' | 'skipped'

export interface AgentFilesResult {
  agentsMd: AgentFileAction
  claudeMd: AgentFileAction
}

/**
 * Returns the managed block (markers included) found in `content`, or
 * `null` when the markers are absent or malformed.
 */
function extractAgentRulesBlock(content: string): string | null {
  const start = content.indexOf(AGENT_RULES_START_MARKER)
  if (start === -1) return null
  const end = content.indexOf(AGENT_RULES_END_MARKER, start)
  if (end === -1) return null
  return content.slice(start, end + AGENT_RULES_END_MARKER.length)
}

/**
 * Returns true when `AGENTS.md` or `CLAUDE.md` at `dir` already
 * contains the current agent-rules block. A block from an earlier
 * Next.js version (older wording, legacy markers) returns false so
 * callers know to upsert the current one over it.
 */
export function hasCurrentAgentRules(dir: string): boolean {
  const block = buildAgentRulesBlock()
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const content = tryReadFile(path.join(dir, file))
    if (!content) continue
    const installed = extractAgentRulesBlock(content)
    if (installed !== null && normalizeEol(installed, '\n') === block) {
      return true
    }
  }
  return false
}

/**
 * Write the agent-rules block into `projectDir`, respecting whichever
 * file the user already uses:
 *
 *   - A file already hosting the managed block → upsert into it, so
 *     upgrades rewrite the block in place instead of adding a copy.
 *   - `AGENTS.md` exists → upsert into it, leave `CLAUDE.md` alone.
 *   - `CLAUDE.md` exists (but not `AGENTS.md`) → upsert into it.
 *   - Neither exists → create both (`AGENTS.md` + `CLAUDE.md` with
 *     `@AGENTS.md` import), matching `create-next-app`.
 *
 * Idempotent: a file already containing the canonical block is
 * reported as `unchanged`.
 */
export function writeAgentFiles(projectDir: string): AgentFilesResult {
  const agentsMdPath = path.join(projectDir, 'AGENTS.md')
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')
  const block = buildAgentRulesBlock()

  const agentsMdExists = fs.existsSync(agentsMdPath)
  const claudeMdExists = fs.existsSync(claudeMdPath)

  const claudeMdHostsBlock =
    claudeMdExists &&
    (tryReadFile(claudeMdPath)?.includes(AGENT_RULES_START_MARKER) ?? false)
  const agentsMdHostsBlock =
    agentsMdExists &&
    (tryReadFile(agentsMdPath)?.includes(AGENT_RULES_START_MARKER) ?? false)

  if (agentsMdExists && (agentsMdHostsBlock || !claudeMdHostsBlock)) {
    return {
      agentsMd: upsertFile(agentsMdPath, block),
      claudeMd: 'skipped',
    }
  }

  if (claudeMdExists) {
    return {
      agentsMd: 'skipped',
      claudeMd: upsertFile(claudeMdPath, block),
    }
  }

  // Neither file exists — scaffold both, matching create-next-app.
  fs.writeFileSync(agentsMdPath, block + '\n', 'utf-8')
  fs.writeFileSync(claudeMdPath, CLAUDE_MD_CONTENT, 'utf-8')
  return { agentsMd: 'created', claudeMd: 'created' }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tryReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function upsertFile(filePath: string, block: string): AgentFileAction {
  const existing = fs.readFileSync(filePath, 'utf-8')
  const updated = upsertAgentRulesBlock(existing, block)
  if (updated === existing) return 'unchanged'
  fs.writeFileSync(filePath, updated, 'utf-8')
  return 'updated'
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

function upsertAgentRulesBlock(existing: string, block: string): string {
  const eol = detectEol(existing)
  const normalizedBlock = normalizeEol(block, eol)

  existing = stripLegacyAgentRulesBlock(existing, eol)

  const startIdx = existing.indexOf(AGENT_RULES_START_MARKER)
  const endIdx = existing.indexOf(AGENT_RULES_END_MARKER)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx)
    const after = existing.slice(endIdx + AGENT_RULES_END_MARKER.length)
    const replaced = before + normalizedBlock + after
    return replaced === existing ? existing : replaced
  }

  const separator =
    existing.length === 0 || /\r?\n$/.test(existing) ? eol : eol + eol
  return existing + separator + normalizedBlock + eol
}

function stripLegacyAgentRulesBlock(
  existing: string,
  eol: '\r\n' | '\n' = '\n'
): string {
  while (true) {
    const startIdx = existing.indexOf(LEGACY_AGENT_RULES_START_MARKER)
    if (startIdx === -1) return existing
    const endIdx = existing.indexOf(LEGACY_AGENT_RULES_END_MARKER, startIdx)
    if (endIdx === -1) return existing

    let cutStart = startIdx
    while (cutStart > 0 && /\s/.test(existing[cutStart - 1])) {
      cutStart--
    }
    let cutEnd = endIdx + LEGACY_AGENT_RULES_END_MARKER.length
    while (cutEnd < existing.length && /\s/.test(existing[cutEnd])) {
      cutEnd++
    }

    const before = existing.slice(0, cutStart)
    const after = existing.slice(cutEnd)

    existing =
      before.length > 0 && after.length > 0
        ? before + eol + eol + after
        : before + after
  }
}
