#!/usr/bin/env node
/**
 * Memory benchmark for a running Next.js dev server.
 *
 * Discovers all routes via the MCP get_routes endpoint, then compiles each
 * one via the MCP compile_route endpoint — no HTTP requests to the application
 * are made. Samples RSS/VSZ/physical-footprint throughout and writes a CSV.
 *
 * Usage:
 *   node scripts/benchmark-memory.js <base-url> [output-file] [--pause[=N]]
 *
 * Options:
 *   --pause[=N]   Wait 4 seconds after every N compilations (default: 10)
 *
 * Examples:
 *   node scripts/benchmark-memory.js http://localhost:3000
 *   node scripts/benchmark-memory.js http://localhost:3000 /tmp/run-a.csv
 *   node scripts/benchmark-memory.js http://localhost:3000 /tmp/run-a.csv --pause
 *   node scripts/benchmark-memory.js http://localhost:3000 /tmp/run-a.csv --pause=25
 *
 * Output CSV columns:
 *   timestamp, elapsed_ms, rss_kb, vsz_kb, footprint_kb, event
 *
 * 'event' is blank for periodic samples, or "compile:<page>" recorded
 * immediately after each route is compiled.
 *
 * Requires: Next.js dev server with experimental.mcpServer enabled.
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const { URL } = require('url')

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_ROUTES = 50
const SETTLE_MS = 20_000
const SAMPLE_INTERVAL_MS = 250
const PAUSE_MS = 10_000

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flagArgs = process.argv.slice(2).filter((a) => a.startsWith('--'))
const [baseUrlArg, outFileArg] = positional

if (!baseUrlArg) {
  console.error(
    'Usage: node scripts/benchmark-memory.js <base-url> [output-file] [--pause[=N]]'
  )
  process.exit(1)
}

const BASE_URL = baseUrlArg.replace(/\/$/, '')
const OUTFILE =
  outFileArg ||
  `/tmp/next-memory-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`

// --pause enables pausing, optionally with =N to set the pause interval
// (pause every N compilations). Default interval is 10.
const DEFAULT_PAUSE_EVERY = 10
const pauseFlag = flagArgs.find(
  (a) => a === '--pause' || a.startsWith('--pause=')
)
const PAUSE_EVERY = pauseFlag
  ? pauseFlag.includes('=')
    ? parseInt(pauseFlag.slice('--pause='.length), 10)
    : DEFAULT_PAUSE_EVERY
  : 0
if (pauseFlag && (!Number.isFinite(PAUSE_EVERY) || PAUSE_EVERY <= 0)) {
  console.error(`Invalid --pause value: ${pauseFlag}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Find next-server PID
// ---------------------------------------------------------------------------

function findNextServerPid() {
  const result = spawnSync('pgrep', ['-f', 'next-server'], { encoding: 'utf8' })
  const pids = result.stdout.trim().split('\n').filter(Boolean)
  if (pids.length === 0) {
    console.error(
      'Error: no next-server process found. Start the dev server first.'
    )
    process.exit(1)
  }
  if (pids.length > 1) {
    console.error(
      `Error: multiple next-server processes found (pids: ${pids.join(', ')}).\nStop all but one and retry.`
    )
    process.exit(1)
  }
  return parseInt(pids[0], 10)
}

// ---------------------------------------------------------------------------
// RSS/VSZ sampling (macOS: ps returns KB)
// ---------------------------------------------------------------------------

function sampleMemory(pid) {
  const result = spawnSync('ps', ['-o', 'rss=,vsz=', '-p', String(pid)], {
    encoding: 'utf8',
  })
  if (result.status !== 0 || !result.stdout.trim()) return null
  const [rss, vsz] = result.stdout.trim().split(/\s+/).map(Number)
  return { rss, vsz }
}

const PHYSICAL_FOOTPRINT_ONESHOT = `
import sys, struct, ctypes, ctypes.util
libc = ctypes.CDLL(ctypes.util.find_library('c'))
buf = ctypes.create_string_buffer(256)
ret = libc.proc_pid_rusage(int(sys.argv[1]), 4, buf)
if ret != 0:
    sys.exit(1)
print(struct.unpack_from('<Q', buf, 72)[0] // 1024)
`

function makeFootprintSampler(pid) {
  return {
    sample() {
      const result = spawnSync(
        'python3',
        ['-c', PHYSICAL_FOOTPRINT_ONESHOT, String(pid)],
        { encoding: 'utf8' }
      )
      if (result.status !== 0) return null
      return Number(result.stdout.trim())
    },
    close() {},
  }
}

// ---------------------------------------------------------------------------
// HTTP fetch helper (no external deps)
// ---------------------------------------------------------------------------

function fetchUrl(url, timeoutMs = 10_000, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const reqOptions = {
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': 'next-memory-benchmark',
        ...options.headers,
      },
    }
    const req = lib.request(url, reqOptions, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      reject(new Error(`Timeout fetching ${url}`))
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

// ---------------------------------------------------------------------------
// MCP helpers
// ---------------------------------------------------------------------------

// Call a single MCP tool. Returns { isError, body } where body is the parsed
// JSON content from the tool's response.
async function callMcpTool(toolName, args, timeoutMs = 5_000) {
  const url = `${BASE_URL}/_next/mcp`
  const body = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: 1,
  })

  const res = await fetchUrl(url, timeoutMs, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
  })

  // Response is SSE: "event: message\ndata: {...}\n\n"
  const dataLine = res.body.split('\n').find((l) => l.startsWith('data:'))
  if (!dataLine)
    throw new Error(`MCP: no data line in response for ${toolName}`)

  const envelope = JSON.parse(dataLine.slice('data:'.length).trim())
  if (envelope.error)
    throw new Error(`MCP error: ${JSON.stringify(envelope.error)}`)
  if (!envelope.result?.content?.[0]?.text)
    throw new Error(`MCP: unexpected response shape for ${toolName}`)

  return {
    isError: !!envelope.result.isError,
    body: JSON.parse(envelope.result.content[0].text),
  }
}

// ---------------------------------------------------------------------------
// Route discovery and compilation via MCP
// ---------------------------------------------------------------------------

async function discoverRoutes() {
  const { isError, body } = await callMcpTool('get_routes', {})
  if (isError) {
    throw new Error(`get_routes failed: ${JSON.stringify(body)}`)
  }
  const allRoutes = [
    ...new Set([...(body.appRouter ?? []), ...(body.pagesRouter ?? [])]),
  ]
  return {
    allRoutes,
    appCount: (body.appRouter ?? []).length,
    pagesCount: (body.pagesRouter ?? []).length,
  }
}

// Compile all routes via MCP compile_route. Calls onCompiled(routeSpecifier)
// after each successful compilation, where routeSpecifier is the resolved
// route as returned by the server.
async function compileRoutes(routes, onCompiled) {
  let compiledSincePause = 0
  for (const routeSpecifier of routes) {
    const { isError, body } = await callMcpTool(
      'compile_route',
      { routeSpecifier },
      // Some compilation can be very slow
      120_000
    )
    if (!isError) {
      onCompiled(body.routeSpecifier ?? routeSpecifier)
      compiledSincePause++
      if (body.issues?.length) {
        console.warn(
          `\n  ${routeSpecifier} compiled with ${body.issues.length} issue(s)`
        )
      }
    } else if (body.notFound) {
      console.warn(`\n  skipped (not found): ${routeSpecifier}`)
    } else {
      console.warn(
        `\n  compile_route error for ${routeSpecifier}: ${body.error}`
      )
    }
    if (PAUSE_EVERY && compiledSincePause >= PAUSE_EVERY) {
      compiledSincePause = 0
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pid = findNextServerPid()
  console.log(`Found next-server PID: ${pid}`)
  console.log(`Base URL:  ${BASE_URL}`)
  console.log(`Output:    ${OUTFILE}`)
  if (PAUSE_EVERY)
    console.log(
      `Pause mode: ${PAUSE_MS / 1000}s after every ${PAUSE_EVERY} compilations`
    )
  console.log('')

  const footprintSampler = makeFootprintSampler(pid)
  const startTime = Date.now()
  const rows = [
    ['timestamp', 'elapsed_ms', 'rss_kb', 'vsz_kb', 'footprint_kb', 'event'],
  ]

  let routesCompiled = 0

  function now() {
    return Date.now() - startTime
  }

  function recordSample(event = '') {
    const mem = sampleMemory(pid)
    if (!mem) return null
    const footprint = footprintSampler.sample() ?? ''
    rows.push([
      new Date().toISOString(),
      now(),
      mem.rss,
      mem.vsz,
      footprint,
      event,
    ])
    return { ...mem, footprint }
  }

  // Periodic sampler
  const sampler = setInterval(() => {
    const mem = recordSample()
    if (!mem) {
      console.error('\nProcess exited during benchmark.')
      clearInterval(sampler)
      return
    }
    const elapsed = (now() / 1000).toFixed(1)
    const rssMb = (mem.rss / 1024).toFixed(1)
    const footprintMb = mem.footprint ? (mem.footprint / 1024).toFixed(1) : '?'
    process.stdout.write(
      `\r[${elapsed}s] RSS=${rssMb}MB  footprint=${footprintMb}MB  compiled=${routesCompiled}          `
    )
  }, SAMPLE_INTERVAL_MS)

  // Discover routes via MCP get_routes
  let allRoutes, appCount, pagesCount
  try {
    ;({ allRoutes, appCount, pagesCount } = await discoverRoutes())
  } catch (err) {
    clearInterval(sampler)
    console.error(`\nFailed to discover routes via MCP: ${err.message}`)
    console.error(
      'Make sure the dev server is running with experimental.mcpServer enabled.'
    )
    process.exit(1)
  }

  console.log(
    `Discovered ${appCount} app router + ${pagesCount} pages router routes via MCP.`
  )

  // Compile each route via MCP compile_route
  const routesToCompile = allRoutes.slice(0, MAX_ROUTES)
  try {
    await compileRoutes(routesToCompile, (page) => {
      routesCompiled++
      recordSample(`compile:${page}`)
    })
  } catch (err) {
    clearInterval(sampler)
    console.error(`\ncompile_route failed: ${err.message}`)
    process.exit(1)
  }

  console.log(`\nCompiled ${routesCompiled} routes.`)
  console.log(`Settling for ${SETTLE_MS / 1000}s...`)
  await new Promise((r) => setTimeout(r, SETTLE_MS))

  clearInterval(sampler)
  footprintSampler.close()

  // Write CSV
  const csv = rows.map((r) => r.join(',')).join('\n') + '\n'
  fs.writeFileSync(OUTFILE, csv)

  // Summary
  const dataRows = rows.slice(1).filter((r) => r[2])
  const rssValues = dataRows.map((r) => Number(r[2]))
  const vszValues = dataRows.map((r) => Number(r[3]))
  const footprintValues = dataRows.map((r) => Number(r[4])).filter(Boolean)

  const minRss = Math.min(...rssValues)
  const maxRss = Math.max(...rssValues)
  const finalRss = rssValues[rssValues.length - 1]
  const minVsz = Math.min(...vszValues)
  const maxVsz = Math.max(...vszValues)
  const finalVsz = vszValues[vszValues.length - 1]

  const mb = (kb) => (kb / 1024).toFixed(0) + 'MB'

  console.log('\n=== Memory Summary ===')
  console.log(
    `  RSS:       min=${mb(minRss)}  max=${mb(maxRss)}  final=${mb(finalRss)}`
  )
  if (footprintValues.length > 0) {
    const minFp = Math.min(...footprintValues)
    const maxFp = Math.max(...footprintValues)
    const finalFp = footprintValues[footprintValues.length - 1]
    console.log(
      `  Footprint: min=${mb(minFp)}  max=${mb(maxFp)}  final=${mb(finalFp)}`
    )
  }
  console.log(
    `  VSZ:       min=${mb(minVsz)}  max=${mb(maxVsz)}  final=${mb(finalVsz)}`
  )
  console.log(`  Samples: ${dataRows.length}`)
  console.log(`\nFull data: ${OUTFILE}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
