#!/usr/bin/env node
/**
 * Stop hook (plugin-level, gated on .claude/port).
 * Runs a compilation pass, then blocks if there are compilation errors.
 * The agent must fix them or dismiss them to proceed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Why we silently skip when the port file is missing
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors enter-manual-compile.mjs. No port file → either the skill was
 * never activated, or activation failed because the Next.js version is too
 * old to expose the required MCP tools. Blocking a stop on a non-functional
 * skill would trap the agent with no way forward, so we exit 0.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The Webpack edge case (port file present, but hooks are no-ops)
 * ─────────────────────────────────────────────────────────────────────────
 * If the dev server is running `next dev --webpack`, the MCP tools exist
 * but do nothing: `compile_and_resume` is a no-op and `get_compilation_issues`
 * returns an empty list. This hook will then exit 0 every time, which is
 * the correct degradation — webpack users just lose the feedback loop.
 * See enter-manual-compile.mjs for the full rationale.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Why we do NOT short-circuit on `stop_hook_active`
 * ─────────────────────────────────────────────────────────────────────────
 * Repeated blocks are fine: the agent can always dismiss non-actionable
 * issues via dismiss-errors.mjs and stop cleanly. The block message itself
 * surfaces that escape hatch.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { existsSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getPort,
  ping,
  getCompilationIssues,
  compileAndResume,
  filterDismissedIssues,
} from './mcp-client.mjs'

// CLAUDE_PROJECT_DIR is guaranteed to be set in hook subprocesses.
// https://code.claude.com/docs/en/hooks#reference-scripts-by-path
const portFile = join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'port')

// Resolve the dismiss-errors script to an absolute path at hook time.
// We can't print `${CLAUDE_SKILL_DIR}/...` in the block message because
// that's a skill-load-time template substitution, not a runtime env var —
// the agent's Bash tool invocation wouldn't expand it. Computing from
// import.meta.url is also self-contained (no reliance on CLAUDE_PLUGIN_ROOT
// being set in the agent's Bash subprocess).
const hookDir = dirname(fileURLToPath(import.meta.url))
const dismissScript = resolve(
  hookDir,
  '..',
  'skills',
  'next-dev',
  'scripts',
  'dismiss-errors.mjs'
)

if (!existsSync(portFile)) {
  process.exit(0)
}

// Self-disable if the dev server is gone. The port file persists across
// sessions but the dev server may not — see enter-manual-compile.mjs for
// the full rationale.
function selfDisable() {
  try {
    unlinkSync(portFile)
  } catch {}
}

try {
  const port = getPort()

  if (!(await ping(port))) {
    selfDisable()
    process.exit(0)
  }

  // Run a compilation pass before checking for errors.
  // This processes all accumulated file changes in one batch.
  try {
    await compileAndResume(port)
  } catch {
    // If compile fails, continue with error check anyway.
  }

  const result = await getCompilationIssues(port)
  const allIssues = result.issues || []
  const { issues, dismissedCount } = filterDismissedIssues(allIssues)

  if (issues.length === 0) {
    process.exit(0)
  }

  const lines =
    dismissedCount > 0
      ? [`Compilation errors found (${dismissedCount} dismissed hidden):`, '']
      : ['Compilation errors found:', '']

  for (const issue of issues) {
    const severity = issue.severity || 'error'
    const file = issue.filePath || 'unknown'
    const title = issue.title || 'Unknown error'

    let line = `[${severity}] ${file}: ${title}`

    if (issue.description) line += ` — ${issue.description}`

    if (issue.source?.range) {
      const r = issue.source.range
      line += ` (line ${r.start?.line ?? '?'}:${r.start?.column ?? '?'})`
    }

    lines.push(line)

    if (issue.detail) {
      lines.push(issue.detail.trim())
    }

    if (issue.codeFrame) {
      lines.push(issue.codeFrame)
    }

    lines.push('')
  }

  lines.push(
    `${issues.length} issue(s). Fix them. If they aren't fixable from your end (third-party code, bundler stubs, false positives), use the escape hatch to dismiss everything currently reported and stop:`,
    `  node "${dismissScript}"`,
    `Dismissed issues stay hidden for the rest of the session.`
  )

  const output = {
    decision: 'block',
    reason: lines.join('\n'),
  }
  process.stdout.write(JSON.stringify(output))
  process.exit(0)
} catch (err) {
  // Server unreachable mid-call — self-disable and don't block the stop.
  selfDisable()
  process.exit(0)
}
