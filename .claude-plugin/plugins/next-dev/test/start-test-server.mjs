#!/usr/bin/env node
/**
 * Fake Next.js MCP server for end-to-end testing the next-dev plugin
 * without spinning up a real Next.js dev server.
 *
 * Implements just enough of the JSON-RPC over POST /_next/mcp protocol
 * to satisfy the plugin's hooks:
 *   - initialize / notifications/initialized
 *   - tools/list (returns the three required tool names)
 *   - tools/call: pause_compilation, compile_and_resume, get_compilation_issues
 *
 * Also exposes a tiny control surface so you can toggle the fake error
 * state mid-session without restarting the server:
 *
 *   # Inject fake errors (forces the Stop hook to block)
 *   curl -X POST http://localhost:<port>/control/issues \
 *     -H 'content-type: application/json' \
 *     -d '[{"severity":"error","filePath":"app/page.tsx","title":"Boom","description":"fake error"}]'
 *
 *   # Clear errors (let the Stop hook pass)
 *   curl -X POST http://localhost:<port>/control/clear
 *
 *   # Inspect current state
 *   curl http://localhost:<port>/control/state
 *
 * Usage:
 *   node test/start-test-server.mjs [port]
 */

import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = parseInt(process.argv[2] || process.env.PORT || '3000', 10)

// .../next.js/.claude-plugin/plugins/next-dev/test → .../next.js/.claude-plugin
// `marketplace add` must point at the directory that *contains* marketplace.json
// (i.e. .claude-plugin/), not the repo root. Source paths in marketplace.json
// resolve relative to whatever path you pass to `marketplace add`.
const marketplaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)

let fakeIssues = []

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function toolResult(id, value) {
  return jsonRpcResult(id, {
    content: [{ type: 'text', text: JSON.stringify(value) }],
  })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (chunk) => {
      buf += chunk
    })
    req.on('end', () => resolve(buf))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  try {
    // Control surface — not part of the MCP protocol, just for tests.
    if (req.method === 'POST' && req.url === '/control/issues') {
      fakeIssues = JSON.parse(await readBody(req))
      console.log(`[control] set ${fakeIssues.length} fake issue(s)`)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, count: fakeIssues.length }))
      return
    }

    if (req.method === 'POST' && req.url === '/control/clear') {
      fakeIssues = []
      console.log('[control] cleared fake issues')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
      return
    }

    if (req.method === 'GET' && req.url === '/control/state') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ issues: fakeIssues }))
      return
    }

    // MCP endpoint
    if (req.method === 'POST' && req.url === '/_next/mcp') {
      const raw = await readBody(req)
      const msg = JSON.parse(raw)

      console.log(
        `[mcp] ${msg.method}${msg.params?.name ? ` (${msg.params.name})` : ''}`
      )

      // Notifications have no id and no response body.
      if (msg.method === 'notifications/initialized') {
        res.writeHead(202)
        res.end()
        return
      }

      let payload
      if (msg.method === 'initialize') {
        payload = jsonRpcResult(msg.id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-next-mcp', version: '0.0.0' },
        })
      } else if (msg.method === 'tools/list') {
        payload = jsonRpcResult(msg.id, {
          tools: [
            { name: 'get_compilation_issues', description: 'fake' },
            { name: 'pause_compilation', description: 'fake' },
            { name: 'compile_and_resume', description: 'fake' },
          ],
        })
      } else if (msg.method === 'tools/call') {
        const name = msg.params?.name
        if (name === 'pause_compilation') {
          payload = toolResult(msg.id, { paused: true })
        } else if (name === 'compile_and_resume') {
          payload = toolResult(msg.id, { compiled: true })
        } else if (name === 'get_compilation_issues') {
          payload = toolResult(msg.id, { issues: fakeIssues })
        } else {
          payload = {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: `unknown tool: ${name}` },
          }
        }
      } else {
        payload = {
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `unknown method: ${msg.method}` },
        }
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      })
      res.end(sse(payload))
      return
    }

    res.writeHead(404)
    res.end('not found')
  } catch (err) {
    console.error('[error]', err)
    res.writeHead(500)
    res.end(err.message)
  }
})

server.listen(port, () => {
  console.log(`fake next-dev MCP server listening on http://localhost:${port}`)
  console.log('')
  console.log('In a Claude Code session:')
  console.log(`  /plugin marketplace add ${marketplaceRoot}`)
  console.log(`  /plugin install next-dev@nextjs`)
  console.log(`  /next-dev ${port}`)
  console.log('')
  console.log('Inject a fake error to test the Stop-hook block flow:')
  console.log(
    `  curl -X POST http://localhost:${port}/control/issues -H 'content-type: application/json' \\`
  )
  console.log(
    `    -d '[{"severity":"error","filePath":"app/page.tsx","title":"Boom","description":"fake error"}]'`
  )
  console.log('')
  console.log('Clear errors:')
  console.log(`  curl -X POST http://localhost:${port}/control/clear`)
})
