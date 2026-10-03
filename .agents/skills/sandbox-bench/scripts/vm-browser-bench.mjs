// Timed browser measurement for the e2e bench. Runs on the measurement VM
// (and locally for development) against an already-running production
// server. No CDP tracing — tracing perturbs timing; this pass collects
// cheap counters and buffered PerformanceObserver entries only, so its
// numbers are comparable across arms:
//
//   browser-load : ttfb, fcp, lcp, dcl, load, hydrated (bench:hydrated
//                  mark), hydrateClient (hydrated - ttfb), blocking
//                  (long-task time over 50ms up to the hydration mark),
//                  scriptMs/taskMs (CDP counters at quiescence), heapMb
//                  (after a forced GC — retained, not transient)
//   browser-nav  : client-side navigation via window.next.router.push:
//                  navMs (wall to URL commit), navSettledMs (wall to last
//                  DOM mutation), scriptMs/taskMs deltas (Flight parse +
//                  render cost in the browser)
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
const NAV_TIMEOUT_MS = 20_000

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
//
// Pages with steady background activity (intervals, animations) never
// settle; after the timeout the current counters are returned with
// settled=false and the caller reports the sample as unsettled — a
// windowed read at a fixed offset, comparable across arms but no longer a
// total.
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
    if (quiet >= SETTLE_QUIET_WINDOWS) return { metrics: cur, settled: true }
    if (Date.now() - start > SETTLE_TIMEOUT_MS)
      return { metrics: cur, settled: false }
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
    // Milestones come from buffered observers, so registering after the
    // fact still sees entries from the start of the navigation. LCP and
    // long tasks need PerformanceObserver — they are not in the regular
    // entry buffer — with a short drain wait for entry delivery.
    const timings = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const nav = performance.getEntriesByType('navigation')[0]
          const fcp = performance
            .getEntriesByType('paint')
            .find((e) => e.name === 'first-contentful-paint')
          const hydrated = performance.getEntriesByName(
            'bench:hydrated',
            'mark'
          )[0]
          let lcpMs = null
          const lcpObs = new PerformanceObserver((list) => {
            const entries = list.getEntries()
            if (entries.length > 0)
              lcpMs = entries[entries.length - 1].startTime
          })
          try {
            lcpObs.observe({ type: 'largest-contentful-paint', buffered: true })
          } catch {}
          // Total blocking time up to the hydration mark: the over-50ms
          // share of long tasks, the standard TBT construction with the
          // hydration mark as the interactivity anchor.
          let blockingMs = 0
          const ltObs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (hydrated && e.startTime > hydrated.startTime) continue
              blockingMs += Math.max(0, e.duration - 50)
            }
          })
          try {
            ltObs.observe({ type: 'longtask', buffered: true })
          } catch {}
          setTimeout(() => {
            lcpObs.disconnect()
            ltObs.disconnect()
            resolve({
              ttfbMs: nav ? nav.responseStart : null,
              dclMs: nav ? nav.domContentLoadedEventEnd : null,
              loadMs: nav ? nav.loadEventEnd : null,
              fcpMs: fcp ? fcp.startTime : null,
              lcpMs,
              hydratedMs: hydrated ? hydrated.startTime : null,
              blockingMs,
            })
          }, 100)
        })
    )
    const loadSettle = await settledMetrics(page, cdp)
    const loadMetrics = loadSettle.metrics
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
    let navUnsettled = false
    const hasRouter = await page.evaluate(
      () => !!(window.next && window.next.router && window.next.router.push)
    )
    if (hasRouter && navTarget) {
      // A MutationObserver stamps the time of the last DOM change, so the
      // content-settled wall time comes from the page's own clock instead
      // of a polling loop. Its callback only runs when the router commits
      // actual DOM work; between commits it costs nothing.
      await page.evaluate(() => {
        window.__benchNav = { start: null, lastMutation: null }
        const observer = new MutationObserver(() => {
          window.__benchNav.lastMutation = performance.now()
        })
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
      })
      const before = metricsMap(await cdp.send('Performance.getMetrics'))
      await page.evaluate((target) => {
        window.__benchNav.start = performance.now()
        window.next.router.push(target)
      }, navTarget)
      // URL commit detection runs over CDP (no in-page polling): playwright
      // observes same-document navigations through page events.
      const committed = await page
        .waitForURL((url) => url.pathname === navTarget, {
          timeout: NAV_TIMEOUT_MS,
        })
        .then(() => true)
        .catch(() => false)
      if (committed) {
        const commitMs = await page.evaluate(
          () => performance.now() - window.__benchNav.start
        )
        // DOM-settled wall time: wait until the last mutation stamp goes
        // stale, then read it. The stale checks are sparse evaluates
        // (~4/s), not a busy loop.
        let navSettledMs = null
        const deadline = Date.now() + SETTLE_TIMEOUT_MS
        for (;;) {
          const s = await page.evaluate(() => ({
            start: window.__benchNav.start,
            last: window.__benchNav.lastMutation,
            now: performance.now(),
          }))
          if (s.last !== null && s.now - s.last > 2 * SETTLE_WINDOW_MS) {
            navSettledMs = s.last - s.start
            break
          }
          if (Date.now() > deadline) break
          await new Promise((r) => setTimeout(r, SETTLE_WINDOW_MS))
        }
        const afterSettle = await settledMetrics(page, cdp)
        navUnsettled = !afterSettle.settled || navSettledMs === null
        const after = afterSettle.metrics
        nav = {
          navMs: commitMs,
          navSettledMs,
          scriptMs:
            (after.get('ScriptDuration') - before.get('ScriptDuration')) * 1000,
          taskMs:
            (after.get('TaskDuration') - before.get('TaskDuration')) * 1000,
        }
      }
    }
    return { load, nav, unsettled: !loadSettle.settled || navUnsettled }
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
      let unsettled = 0
      for (let iter = 0; iter < WARMUP + ITERATIONS; iter++) {
        const sample = await measureRoute(browser, route, navTarget)
        if (iter < WARMUP) continue
        if (sample.unsettled) unsettled++
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
        unsettled,
      })
      if (unsettled > 0) {
        console.error(
          `[browser] WARNING ${route}: ${unsettled}/${loadSamples.length} samples never quiesced — counters are windowed reads, not totals`
        )
      }
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
