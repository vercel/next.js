// Timed browser measurement for the e2e bench. Runs on the measurement VM
// (and locally for development) against an already-running production
// server. No CDP tracing — tracing perturbs timing; this pass collects
// cheap counters only, so its numbers are comparable across arms:
//
//   browser-load : ttfb, fcp, dcl, load, hydrated (bench:hydrated mark),
//                  scriptMs/taskMs (CDP Performance.getMetrics), heapMb
//   browser-nav  : client-side navigation via window.next.router.push,
//                  wall time to pathname+paint settle, scriptMs/taskMs
//                  deltas (Flight parse + render cost in the browser)
//
// A fixed CPU throttle amplifies JS cost differences over scheduling
// noise; localhost keeps the network out of the signal. One browser
// process serves all iterations; each iteration gets a fresh context
// (cold cache, fresh renderer) so arms stay symmetric.
//
// Usage: node vm-browser-bench.mjs --base-url=http://127.0.0.1:3730 \
//   --routes=/blog,/dashboard --iterations=10 --warmup=2 \
//   --cpu-throttle=4 --tree=/vercel/sandbox/next-base --json-out=/tmp/b.json

import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const args = new Map(
  process.argv
    .slice(2)
    .map((a) => a.match(/^--([^=]+)(?:=(.*))?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2] ?? 'true'])
)
const BASE_URL = args.get('base-url') ?? 'http://127.0.0.1:3000'
const ROUTES = (args.get('routes') ?? '/').split(',')
const ITERATIONS = Number(args.get('iterations') ?? '10')
const WARMUP = Number(args.get('warmup') ?? '2')
const THROTTLE = Number(args.get('cpu-throttle') ?? '4')
const TREE = args.get('tree') ?? process.cwd()
const JSON_OUT = args.get('json-out')
const HYDRATE_TIMEOUT_MS = 30_000

const require_ = createRequire(path.join(TREE, 'package.json'))
const { chromium } = require_('playwright')

function median(values) {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function metricsMap(res) {
  const out = new Map()
  for (const m of res.metrics) out.set(m.name, m.value)
  return out
}

// Wait until the page's cumulative task time stops moving, then return the
// final counter snapshot. A fixed read point (load, hydration mark, rAF)
// under-counts work the page schedules later — streamed Suspense hydration
// and lazily initialized Flight chunks land exactly there, and an arm that
// defers work past a fixed read point would look artificially cheap. The
// wait itself runs no in-page JS (CDP counters + wall-clock sleeps), so it
// doesn't perturb what it measures.
const SETTLE_WINDOW_MS = 250
// Two consecutive quiet windows: a single one would declare quiescence
// during any scheduling gap longer than the window itself.
const SETTLE_QUIET_WINDOWS = 2
const SETTLE_EPS_MS = 0.5
const SETTLE_TIMEOUT_MS = 10_000

async function settledMetrics(page, cdp) {
  let prev = metricsMap(await cdp.send('Performance.getMetrics'))
  const start = Date.now()
  let quiet = 0
  for (;;) {
    await new Promise((r) => setTimeout(r, SETTLE_WINDOW_MS))
    const cur = metricsMap(await cdp.send('Performance.getMetrics'))
    const deltaMs = (cur.get('TaskDuration') - prev.get('TaskDuration')) * 1000
    prev = cur
    quiet = deltaMs < SETTLE_EPS_MS ? quiet + 1 : 0
    if (quiet >= SETTLE_QUIET_WINDOWS) return cur
    if (Date.now() - start > SETTLE_TIMEOUT_MS) return cur
  }
}

async function measureRoute(browser, route, navTarget) {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    if (THROTTLE > 1) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
    }

    await page.goto(BASE_URL + route, {
      waitUntil: 'load',
      timeout: HYDRATE_TIMEOUT_MS,
    })
    // Hydration settles after the load event; the mark is emitted from a
    // useEffect on the shell.
    await page.waitForFunction(
      () => performance.getEntriesByName('bench:hydrated', 'mark').length > 0,
      null,
      { timeout: HYDRATE_TIMEOUT_MS }
    )
    const timings = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      const fcp = performance
        .getEntriesByType('paint')
        .find((e) => e.name === 'first-contentful-paint')
      const hydrated = performance.getEntriesByName('bench:hydrated', 'mark')[0]
      return {
        ttfbMs: nav ? nav.responseStart : null,
        dclMs: nav ? nav.domContentLoadedEventEnd : null,
        loadMs: nav ? nav.loadEventEnd : null,
        fcpMs: fcp ? fcp.startTime : null,
        hydratedMs: hydrated ? hydrated.startTime : null,
      }
    })
    const loadMetrics = await settledMetrics(page, cdp)
    // Post-GC heap is retained memory; without the collection the reading
    // is whatever allocation phase the page happened to be in.
    let heapMb = null
    try {
      await cdp.send('HeapProfiler.collectGarbage')
      const afterGc = metricsMap(await cdp.send('Performance.getMetrics'))
      heapMb = afterGc.get('JSHeapUsedSize') / 1048576
    } catch {
      heapMb = loadMetrics.get('JSHeapUsedSize') / 1048576
    }
    const load = {
      ...timings,
      // hydratedMs counts from navigationStart, so it includes server time;
      // the ttfb-relative variant isolates the client's share and doesn't
      // let a server-side latency shift masquerade as a hydration change.
      hydrateClientMs:
        timings.hydratedMs !== null && timings.ttfbMs !== null
          ? timings.hydratedMs - timings.ttfbMs
          : null,
      scriptMs: loadMetrics.get('ScriptDuration') * 1000,
      taskMs: loadMetrics.get('TaskDuration') * 1000,
      heapMb,
    }

    // Client-side navigation. window.next.router is the App Router's
    // programmatic handle; if this build doesn't expose it, report no nav
    // rather than a fabricated one.
    let nav = null
    const hasRouter = await page.evaluate(
      () => !!(window.next && window.next.router && window.next.router.push)
    )
    if (hasRouter && navTarget) {
      // The in-page 5ms poll below adds a small constant to the deltas; it
      // is identical in both arms (a noise floor, not a bias).
      const before = metricsMap(await cdp.send('Performance.getMetrics'))
      const navMs = await page.evaluate(async (target) => {
        const start = performance.now()
        window.next.router.push(target)
        while (location.pathname !== target) {
          if (performance.now() - start > 20000) return null
          await new Promise((r) => setTimeout(r, 5))
        }
        // Settle paint after the route content commits. Content streaming
        // in later is caught by the counter settle below — this wall
        // measurement is time-to-committed-route.
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        )
        return performance.now() - start
      }, navTarget)
      if (navMs !== null) {
        const after = await settledMetrics(page, cdp)
        nav = {
          navMs,
          scriptMs:
            (after.get('ScriptDuration') - before.get('ScriptDuration')) * 1000,
          taskMs:
            (after.get('TaskDuration') - before.get('TaskDuration')) * 1000,
        }
      }
    }
    return { load, nav }
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium
    .launch({ headless: true })
    .catch(() => chromium.launch({ headless: true, chromiumSandbox: false }))
  const results = []
  try {
    for (let i = 0; i < ROUTES.length; i++) {
      const route = ROUTES[i]
      // Navigate to the next route in the list so every route pair gets
      // exercised and the target differs from the origin.
      const navTarget =
        ROUTES.length > 1 ? ROUTES[(i + 1) % ROUTES.length] : null
      const loadSamples = []
      const navSamples = []
      for (let iter = 0; iter < WARMUP + ITERATIONS; iter++) {
        const sample = await measureRoute(browser, route, navTarget)
        if (iter < WARMUP) continue
        loadSamples.push(sample.load)
        if (sample.nav) navSamples.push(sample.nav)
      }
      const summarize = (samples) => {
        const keys = Object.keys(samples[0] ?? {})
        const out = {}
        for (const k of keys) {
          const vals = samples.map((s) => s[k]).filter((v) => v !== null)
          if (vals.length > 0) out[k] = median(vals)
        }
        return out
      }
      results.push({
        route,
        iterations: loadSamples.length,
        load: summarize(loadSamples),
        nav: navSamples.length > 0 ? summarize(navSamples) : null,
        navSamples: navSamples.length,
      })
      console.error(
        `[browser] ${route}: hydrated=${results.at(-1).load.hydratedMs?.toFixed(0)}ms ` +
          `script=${results.at(-1).load.scriptMs?.toFixed(0)}ms ` +
          `nav=${results.at(-1).nav ? results.at(-1).nav.navMs.toFixed(0) + 'ms' : 'n/a'}`
      )
    }
  } finally {
    await browser.close()
  }
  const payload = JSON.stringify({ throttle: THROTTLE, results }, null, 1)
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, payload)
  else console.log(payload)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
