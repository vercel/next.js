/**
 * Shared MCP client utilities for hooks.
 * Handles the SSE-based JSON-RPC protocol used by Next.js MCP endpoint.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// CLAUDE_PROJECT_DIR is guaranteed to be set in hook subprocesses.
// https://code.claude.com/docs/en/hooks#reference-scripts-by-path
const projectDir = process.env.CLAUDE_PROJECT_DIR
const dismissedFile = join(projectDir, '.claude', 'dismissed-issues.json')

export function getPort() {
  return readFileSync(join(projectDir, '.claude', 'port'), 'utf8').trim()
}

/**
 * Stable key for deduplicating/matching issues.
 * Matches the server-side dedup format: severity|filePath|title|startLine:startCol
 */
export function issueKey(issue) {
  const severity = issue.severity || 'error'
  const file = issue.filePath || 'unknown'
  const title = issue.title || ''
  const line = issue.source?.range?.start?.line ?? '?'
  const col = issue.source?.range?.start?.column ?? '?'
  return `${severity}|${file}|${title}|${line}:${col}`
}

/**
 * Write dismissed issue keys. Called by dismiss-errors.mjs.
 */
export function writeDismissed(keys) {
  writeFileSync(dismissedFile, JSON.stringify({ keys }), 'utf8')
}

/**
 * Read dismissed keys. Returns a Set, or null if no dismissals exist.
 */
export function readDismissedKeys() {
  if (!existsSync(dismissedFile)) return null
  try {
    const { keys } = JSON.parse(readFileSync(dismissedFile, 'utf8'))
    return new Set(keys)
  } catch {
    return null
  }
}

/**
 * Filter out dismissed issues. Returns { issues, dismissedCount }.
 * If no dismissals exist, returns all issues with dismissedCount 0.
 */
export function filterDismissedIssues(issues) {
  const dismissed = readDismissedKeys()
  if (!dismissed) return { issues, dismissedCount: 0 }
  const kept = issues.filter((i) => !dismissed.has(issueKey(i)))
  return { issues: kept, dismissedCount: issues.length - kept.length }
}

export function getMcpUrl(port) {
  return `http://localhost:${port}/_next/mcp`
}

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

/**
 * Ping the MCP endpoint. Returns true if reachable, false otherwise.
 */
export async function ping(port) {
  const url = getMcpUrl(port)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'agent-mode-hook', version: '1.0.0' },
        },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Call pause_compilation via the MCP protocol.
 * Pauses compilation until compile_and_resume is called.
 */
export async function pauseCompilation(port) {
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
        clientInfo: { name: 'agent-mode-hook', version: '1.0.0' },
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
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'pause_compilation', arguments: {} },
    }),
  })

  const body = parseSSE(await res.text())
  if (body?.error) {
    throw new Error(body.error.message)
  }

  const text = body?.result?.content?.[0]?.text
  if (!text) {
    throw new Error('Unexpected MCP response shape')
  }

  return JSON.parse(text)
}

/**
 * Call compile_and_resume via the MCP protocol.
 * Compiles all pending changes, then resumes normal compilation.
 */
export async function compileAndResume(port) {
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
        clientInfo: { name: 'agent-mode-hook', version: '1.0.0' },
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
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'compile_and_resume', arguments: {} },
    }),
  })

  const body = parseSSE(await res.text())
  if (body?.error) {
    throw new Error(body.error.message)
  }

  const text = body?.result?.content?.[0]?.text
  if (!text) {
    throw new Error('Unexpected MCP response shape')
  }

  return JSON.parse(text)
}

/**
 * Call get_compilation_issues via the MCP protocol.
 * Returns the parsed result object { issues: [], diagnostics: [] }.
 */
export async function getCompilationIssues(port) {
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
        clientInfo: { name: 'agent-mode-hook', version: '1.0.0' },
      },
    }),
  })

  // Initialized notification
  await fetch(url, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  })

  // Call tool
  const res = await fetch(url, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_compilation_issues', arguments: {} },
    }),
  })

  const body = parseSSE(await res.text())

  if (body?.error) {
    throw new Error(body.error.message)
  }

  // The result is a JSON string inside content[0].text
  const text = body?.result?.content?.[0]?.text
  if (!text) {
    throw new Error('Unexpected MCP response shape')
  }

  return JSON.parse(text)
}
