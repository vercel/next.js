#!/usr/bin/env node
/**
 * Returns current compilation errors from the Next.js dev server.
 *
 * Usage: node get-errors.mjs [port]
 */

import { readFileSync, existsSync } from 'node:fs'
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

function getPort() {
  return readFileSync(join(projectDir, '.claude', 'port'), 'utf8').trim()
}

function issueKey(issue) {
  const severity = issue.severity || 'error'
  const file = issue.filePath || 'unknown'
  const title = issue.title || ''
  const line = issue.source?.range?.start?.line ?? '?'
  const col = issue.source?.range?.start?.column ?? '?'
  return `${severity}|${file}|${title}|${line}:${col}`
}

function filterDismissedIssues(issues) {
  const dismissedFile = join(projectDir, '.claude', 'dismissed-issues.json')
  if (!existsSync(dismissedFile)) return { issues, dismissedCount: 0 }
  try {
    const { keys } = JSON.parse(readFileSync(dismissedFile, 'utf8'))
    const dismissed = new Set(keys)
    const kept = issues.filter((i) => !dismissed.has(issueKey(i)))
    return { issues: kept, dismissedCount: issues.length - kept.length }
  } catch {
    return { issues, dismissedCount: 0 }
  }
}

function getMcpUrl(port) {
  return `http://localhost:${port}/_next/mcp`
}

async function mcpCall(port, id, method, params) {
  const url = getMcpUrl(port)

  // Initialize
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
        clientInfo: { name: 'get-errors', version: '1.0.0' },
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
  const { issues, dismissedCount } = filterDismissedIssues(allIssues)

  if (issues.length === 0) {
    if (dismissedCount > 0) {
      console.log(`No compilation errors (${dismissedCount} dismissed hidden).`)
    } else {
      console.log('No compilation errors.')
    }
    process.exit(0)
  }

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
    console.log(line)

    if (issue.detail) console.log(issue.detail.trim())
    if (issue.codeFrame) console.log(issue.codeFrame)
    console.log()
  }

  if (dismissedCount > 0) {
    console.log(
      `${issues.length} issue(s) found (${dismissedCount} dismissed hidden).`
    )
  } else {
    console.log(`${issues.length} issue(s) found.`)
  }
} catch (err) {
  console.error(`Cannot reach dev server on port ${port}: ${err.message}`)
  process.exit(1)
}
