#!/usr/bin/env node
/**
 * Activates agent-mode: writes the port file, then verifies the MCP endpoint
 * has the get_compilation_issues tool. Cleans up the port file on failure
 * so hooks know setup didn't complete.
 */

import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const port = process.argv[2] || '3000'
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const portFile = join(projectDir, '.claude', 'port')
const dismissedFile = join(projectDir, '.claude', 'dismissed-issues.json')
const url = `http://localhost:${port}/_next/mcp`
const headers = {
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

function fail(message) {
  console.error(message)
  try {
    unlinkSync(portFile)
  } catch {}
  process.exit(1)
}

// Step 1: Write port, clear stale dismissals from previous session
writeFileSync(portFile, port, 'utf8')
try {
  if (existsSync(dismissedFile)) unlinkSync(dismissedFile)
} catch {}
console.log(`Port ${port} written to ${portFile}`)

// Step 2: Verify MCP endpoint
try {
  const initRes = await fetch(url, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'agent-mode-activate', version: '1.0.0' },
      },
    }),
  })

  if (!initRes.ok) {
    fail(
      `MCP endpoint returned ${initRes.status}. Is the dev server running on port ${port}?`
    )
  }

  // Send initialized notification
  await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  })

  // List tools
  const listRes = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    }),
  })

  const listBody = parseSSE(await listRes.text())
  const tools = listBody?.result?.tools?.map((t) => t.name) || []

  const required = [
    'get_compilation_issues',
    'pause_compilation',
    'compile_and_resume',
  ]
  const missing = required.filter((t) => !tools.includes(t))

  if (missing.length > 0) {
    fail(
      `MCP endpoint is reachable but missing required tools: ${missing.join(', ')}.\n` +
        `Available tools: ${tools.join(', ')}\n` +
        `This skill requires a recent Next.js version that exposes these MCP tools, ` +
        `running with Turbopack (the default in recent Next.js). Upgrade to the ` +
        `latest Next.js and start the dev server with: pnpm dev`
    )
  }

  console.log(`Verified. Available tools: ${tools.join(', ')}`)

  // Step 3: Warm up by calling get_compilation_issues in the background.
  // The first call builds module graphs for all routes and can take minutes
  // on large projects. Fire-and-forget so the agent can start working
  // immediately. Turbo-tasks deduplicates — the stop hook's first call
  // will join the same in-flight computation rather than starting a new one.
  console.log(
    'Warming up Turbopack cache in the background (first stop hook may be slow if not ready)...'
  )
  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_compilation_issues', arguments: {} },
    }),
  })
    .then(async (res) => {
      const body = parseSSE(await res.text())
      const issuesText = body?.result?.content?.[0]?.text
      if (issuesText) {
        const { issues } = JSON.parse(issuesText)
        if (issues?.length) {
          console.log(
            `Background warm-up done: ${issues.length} issue(s) found.`
          )
        } else {
          console.log('Background warm-up done: no issues found.')
        }
      }
    })
    .catch(() => {
      // Warm-up failed silently — stop hook will handle it.
    })

  // Manual compile mode is entered per-turn by the UserPromptSubmit hook,
  // not here. This keeps normal HMR active between agent turns.
} catch (err) {
  if (err.name === 'TimeoutError') {
    fail(
      `MCP endpoint at ${url} timed out. Is the dev server running on port ${port}?`
    )
  }
  fail(
    `Cannot reach MCP endpoint at ${url}: ${err.message}\n` +
      `Make sure the dev server is running: pnpm dev -p ${port}`
  )
}
