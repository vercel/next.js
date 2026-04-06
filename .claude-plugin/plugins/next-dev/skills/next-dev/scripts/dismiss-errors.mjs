#!/usr/bin/env node
/**
 * Classifies compilation errors as actionable or non-actionable and dismisses
 * the non-actionable ones. Dismissed errors are filtered from future checks
 * (stop hook + get-errors) for the rest of the session.
 *
 * Heuristics for non-actionable:
 * - File is in node_modules/ (third-party dependency, agent can't fix)
 * - Error references turbopack/empty.js (bundler stub for server-only modules)
 *
 * Usage: node dismiss-errors.mjs [port]
 *   --reset   Clear all dismissals
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
}

function parseSSE(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('data:')) {
      return JSON.parse(line.slice(5))
    }
  }
  return null
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const dismissedFile = join(projectDir, '.claude', 'dismissed-issues.json')

function getPort() {
  return readFileSync(join(projectDir, '.claude', 'port'), 'utf8').trim()
}

function getMcpUrl(port) {
  return `http://localhost:${port}/_next/mcp`
}

function issueKey(issue) {
  const severity = issue.severity || 'error'
  const file = issue.filePath || 'unknown'
  const title = issue.title || ''
  const line = issue.source?.range?.start?.line ?? '?'
  const col = issue.source?.range?.start?.column ?? '?'
  return `${severity}|${file}|${title}|${line}:${col}`
}

/**
 * Classify an issue as non-actionable if the agent can't fix it.
 */
function isNonActionable(issue) {
  const file = issue.filePath || ''
  const description = issue.description || ''
  const detail = issue.detail || ''
  const title = issue.title || ''
  const text = `${title} ${description} ${detail}`

  // Third-party dependency — agent can't edit node_modules
  if (file.includes('/node_modules/')) return 'node_modules'

  // Turbopack empty module stub — bundler replaces server-only modules with
  // an empty shim in client bundles, causing "export not found" errors.
  // Not a real code issue; the source file is correct.
  if (text.includes('turbopack/empty.js')) return 'turbopack-stub'

  return null
}

async function mcpCall(port, id, method, params) {
  const url = getMcpUrl(port)

  await fetch(url, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'dismiss-errors', version: '1.0.0' },
      },
    }),
  })

  await fetch(url, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })

  const body = parseSSE(await res.text())
  if (body?.error) throw new Error(body.error.message)

  const text = body?.result?.content?.[0]?.text
  if (!text) throw new Error('Unexpected MCP response shape')
  return JSON.parse(text)
}

// Handle --reset flag
if (process.argv.includes('--reset')) {
  try {
    if (existsSync(dismissedFile)) {
      unlinkSync(dismissedFile)
      console.log('Dismissed issues cleared.')
    } else {
      console.log('No dismissed issues to clear.')
    }
  } catch (err) {
    console.error(`Failed to clear dismissals: ${err.message}`)
    process.exit(1)
  }
  process.exit(0)
}

const port = process.argv[2] || getPort()

try {
  // Compile first to flush pending changes.
  try {
    await mcpCall(port, 2, 'tools/call', {
      name: 'compile_and_resume',
      arguments: {},
    })
  } catch {}

  const result = await mcpCall(port, 3, 'tools/call', {
    name: 'get_compilation_issues',
    arguments: {},
  })
  const allIssues = result.issues || []

  if (allIssues.length === 0) {
    console.log('No compilation errors to classify.')
    process.exit(0)
  }

  // Load existing dismissals so we can merge
  let existingKeys = []
  if (existsSync(dismissedFile)) {
    try {
      existingKeys = JSON.parse(readFileSync(dismissedFile, 'utf8')).keys || []
    } catch {}
  }
  const dismissedSet = new Set(existingKeys)

  const actionable = []
  const dismissed = []

  for (const issue of allIssues) {
    const reason = isNonActionable(issue)
    if (reason) {
      dismissed.push({ issue, reason })
      dismissedSet.add(issueKey(issue))
    } else {
      actionable.push(issue)
    }
  }

  // Write merged dismissals
  if (dismissedSet.size > 0) {
    writeFileSync(
      dismissedFile,
      JSON.stringify({ keys: [...dismissedSet] }),
      'utf8'
    )
  }

  // Report dismissed
  if (dismissed.length > 0) {
    const byReason = {}
    for (const { reason } of dismissed) {
      byReason[reason] = (byReason[reason] || 0) + 1
    }
    const summary = Object.entries(byReason)
      .map(([reason, count]) => `${count} ${reason}`)
      .join(', ')
    console.log(
      `Dismissed ${dismissed.length} non-actionable error(s): ${summary}.`
    )
  }

  // Report actionable
  if (actionable.length === 0) {
    console.log('No actionable errors remain.')
    process.exit(0)
  }

  console.log(`\n${actionable.length} actionable error(s):\n`)

  for (const issue of actionable) {
    const severity = issue.severity || 'error'
    const file = issue.filePath || 'unknown'
    const title = issue.title || 'Unknown error'

    let line = `[${severity}] ${file}: ${title}`
    if (issue.description) line += ` — ${issue.description}`
    if (issue.source?.range) {
      const r = issue.source.range
      line += ` (line ${r.start?.line ?? '?'}:${r.start?.column ?? '?'})`
    }
    console.log(line)

    if (issue.detail) console.log(issue.detail.trim())
    if (issue.codeFrame) console.log(issue.codeFrame)
    console.log()
  }
} catch (err) {
  console.error(`Cannot reach dev server on port ${port}: ${err.message}`)
  process.exit(1)
}
