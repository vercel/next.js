#!/usr/bin/env node
/**
 * Stop hook (skill-scoped). Runs a compilation pass, then blocks if there
 * are compilation errors. The agent must fix them or dismiss them to proceed.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  getPort,
  getCompilationIssues,
  compileAndResume,
  filterDismissedIssues,
} from './mcp-client.mjs'

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const portFile = join(projectDir, '.claude', 'port')

// No port file = setup didn't complete or skill not fully active.
if (!existsSync(portFile)) {
  process.exit(0)
}

try {
  const port = getPort()

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
    `${issues.length} issue(s). Fix them or dismiss non-actionable ones with: node "./scripts/dismiss-errors.mjs"`
  )

  const output = {
    decision: 'block',
    reason: lines.join('\n'),
  }
  process.stdout.write(JSON.stringify(output))
  process.exit(0)
} catch (err) {
  // Server unreachable — don't block the agent from stopping.
  process.exit(0)
}
