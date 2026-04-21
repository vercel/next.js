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

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code. Heed deprecation notices.
${AGENT_RULES_END_MARKER}`
}

const CLAUDE_MD_CONTENT = `@AGENTS.md\n`

export type AgentFileAction = 'created' | 'updated' | 'unchanged' | 'skipped'

export interface AgentFilesResult {
  agentsMd: AgentFileAction
  claudeMd: AgentFileAction
}

/**
 * Returns true when `AGENTS.md` or `CLAUDE.md` at `dir` contains the
 * managed agent-rules marker.
 */
export function hasAgentRulesInstalled(dir: string): boolean {
  const agentsContent = tryReadFile(path.join(dir, 'AGENTS.md'))
  if (agentsContent?.includes(AGENT_RULES_START_MARKER)) return true

  const claudeContent = tryReadFile(path.join(dir, 'CLAUDE.md'))
  if (claudeContent?.includes(AGENT_RULES_START_MARKER)) return true

  return false
}

/**
 * Write the agent-rules block into `projectDir`, respecting whichever
 * file the user already uses:
 *
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

  if (agentsMdExists) {
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
