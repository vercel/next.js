/**
 * @jest-environment jsdom
 */

// Tests for the Pages Router route loader (packages/next/src/client/route-loader.ts).
//
// Regression tests for: https://github.com/vercel/next.js/issues/102030
//
// The core bug: a navigation that joins an in-flight *prefetch* call
// (`loadRoute(route, true)`) would remain pending indefinitely if the prefetch
// timed out.  After the prefetch cleaned up its map entry and threw, the shared
// `future` promise it had stored was never settled, leaving every other caller
// that received that same promise object stuck forever.
//
// The fix stores a `reject` handle alongside `resolve` in the Future, rejects
// the shared promise when the generator fails, and in `loadRoute` detects when
// the in-flight entry belongs to a prefetch so that a navigation caller can
// retry independently rather than inheriting the prefetch's pending promise.

/* eslint-env jest */

// The route-loader reads `self`, `window`, `document`, and
// `navigator` at module-require time and at call time.  jsdom provides most of
// these; we just need to wire `self` → `window` before the first import.
Object.defineProperty(globalThis, 'self', {
  value: globalThis.window,
  writable: true,
})

// The timeout inside resolvePromiseWithTimeout relies on requestIdleCallback
// which jsdom does not implement.  Provide a minimal shim so it falls back to
// setTimeout (the same behaviour as the prod path in lib/promise.ts).
if (!window.requestIdleCallback) {
  // @ts-ignore -- jsdom does not expose this type
  window.requestIdleCallback = (cb: IdleRequestCallback): number => {
    return window.setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => 50,
      })
    }, 1)
  }
}

// Use fake timers so we can fast-forward the 3.8 s prefetch budget without
// waiting for real wall-clock time.
jest.useFakeTimers()

// Re-require each test so the internal module-level Maps are fresh.
function freshLoader() {
  jest.resetModules()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRouteLoader } = require('../../packages/next/src/client/route-loader') as typeof import('../../packages/next/src/client/route-loader')
  return createRouteLoader('')
}

// Helper: advance fake timers and flush microtasks between ticks so promise
// chains that resolve inside timer callbacks make progress.
// Uses jest.advanceTimersByTimeAsync which properly interleaves microtasks.
async function advanceTime(ms: number) {
  await jest.advanceTimersByTimeAsync(ms)
}

// Helper: wait until a script element whose src contains `srcFragment` appears
// in the document, then return it.  Polls up to `maxMs` by advancing fake time
// in small increments.
async function waitForScript(
  srcFragment: string,
  maxMs = 500
): Promise<Element> {
  for (let elapsed = 0; elapsed < maxMs; elapsed += 10) {
    const el = document.querySelector(`script[src*="${srcFragment}"]`)
    if (el) return el
    await advanceTime(10)
  }
  throw new Error(`No <script src*="${srcFragment}"> in document after ${maxMs}ms`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe('route-loader', () => {
  beforeEach(() => {
    // Reset the build-manifest global each test to avoid cross-test pollution.
    // @ts-ignore
    delete window.__BUILD_MANIFEST
    // @ts-ignore
    delete window.__BUILD_MANIFEST_CB
    jest.clearAllTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  // ── 1 ──────────────────────────────────────────────────────────────────────
  it('resolves when prefetch and navigation both succeed', async () => {
    window.__BUILD_MANIFEST = { '/page-1': ['static/chunks/page-1.js'] }
    const loader = freshLoader()

    const prefetchProm = loader.loadRoute('/page-1', true)
    loader.onEntrypoint('/page-1', () => ({ default: () => null }))

    // Wait for the script element to appear in the DOM before firing load.
    const script = await waitForScript('page-1.js')
    script.dispatchEvent(new Event('load'))

    await advanceTime(50)

    const prefetchResult = await prefetchProm
    expect('component' in prefetchResult).toBe(true)

    const navResult = await loader.loadRoute('/page-1')
    expect('component' in navResult).toBe(true)
  })

  // ── 2 ──────────────────────────────────────────────────────────────────────
  it('shares the in-flight promise between a prefetch and an early navigation', async () => {
    window.__BUILD_MANIFEST = { '/page-2': ['static/chunks/page-2.js'] }
    const loader = freshLoader()

    const prefetchProm = loader.loadRoute('/page-2', true)
    // Navigation joins the in-flight prefetch before the chunk arrives.
    const navProm = loader.loadRoute('/page-2')

    loader.onEntrypoint('/page-2', () => ({ default: () => null }))

    const script = await waitForScript('page-2.js')
    script.dispatchEvent(new Event('load'))

    await advanceTime(50)

    const [prefetchResult, navResult] = await Promise.all([prefetchProm, navProm])
    expect('component' in prefetchResult).toBe(true)
    expect('component' in navResult).toBe(true)
  })

  // ── 3 & 4 ──────────────────────────────────────────────────────────────────
  it('settles a navigation that joined a timed-out prefetch (core regression test)', async () => {
    // This is the exact scenario from issue #102030:
    //   1. loadRoute(route, true)   -- prefetch starts
    //   2. loadRoute(route)         -- navigation joins the in-flight entry
    //   3. prefetch times out (3.8 s) -- entry deleted, error thrown
    //   4. navigation should retry independently and eventually settle

    window.__BUILD_MANIFEST = { '/page-3': ['static/chunks/page-3.js'] }
    const loader = freshLoader()

    let prefetchError: Error | undefined
    loader.loadRoute('/page-3', true).catch((e: Error) => {
      prefetchError = e
    })

    // Navigation joins while prefetch is still in flight.
    let navSettled = false
    let navResult:
      | import('../../packages/next/src/client/route-loader').RouteLoaderEntry
      | undefined
    const navProm = loader.loadRoute('/page-3').then((r) => {
      navSettled = true
      navResult = r
    })

    // Advance past the 3.8 s budget so the prefetch times out.
    // requestIdleCallback adds ~1 ms, then setTimeout 3800 ms.
    await advanceTime(3802)

    expect(prefetchError).toBeDefined()
    expect(prefetchError!.message).toMatch('Route did not complete loading')

    // The navigation must NOT still be pending — it should have retried.
    // Let the chunk arrive so the retry can complete.
    loader.onEntrypoint('/page-3', () => ({ default: () => null }))

    const script = await waitForScript('page-3.js')
    script.dispatchEvent(new Event('load'))

    await advanceTime(50)
    await navProm

    expect(navSettled).toBe(true)
    expect(navResult && 'component' in navResult).toBe(true)
  })

  // ── 5 ──────────────────────────────────────────────────────────────────────
  it('handles multiple navigation callers joining the same timed-out prefetch', async () => {
    window.__BUILD_MANIFEST = { '/page-5': ['static/chunks/page-5.js'] }
    const loader = freshLoader()

    loader.loadRoute('/page-5', true).catch(() => {})

    // Two concurrent navigation calls join the in-flight prefetch.
    const nav1 = loader.loadRoute('/page-5')
    const nav2 = loader.loadRoute('/page-5')

    // Prefetch times out.
    await advanceTime(3802)

    // Chunk arrives; both retried navigations should resolve.
    loader.onEntrypoint('/page-5', () => ({ default: () => null }))

    const script = await waitForScript('page-5.js')
    script.dispatchEvent(new Event('load'))

    await advanceTime(50)

    const [r1, r2] = await Promise.all([nav1, nav2])
    expect('component' in r1).toBe(true)
    expect('component' in r2).toBe(true)
  })

  // ── 6 ──────────────────────────────────────────────────────────────────────
  it('rejects a prefetch-only call that times out (no navigation pending)', async () => {
    window.__BUILD_MANIFEST = { '/page-6': ['static/chunks/page-6.js'] }
    const loader = freshLoader()

    let rejected = false
    let rejectionMsg = ''
    loader.loadRoute('/page-6', true).catch((e: Error) => {
      rejected = true
      rejectionMsg = e.message
    })

    await advanceTime(3802)

    expect(rejected).toBe(true)
    expect(rejectionMsg).toMatch('Route did not complete loading')
  })

  // ── 7 ──────────────────────────────────────────────────────────────────────
  it('allows a fresh navigation after a timed-out prefetch (cleanup test)', async () => {
    window.__BUILD_MANIFEST = { '/page-7': ['static/chunks/page-7.js'] }
    const loader = freshLoader()

    loader.loadRoute('/page-7', true).catch(() => {})

    // Let the prefetch time out and clean up the routes map entry.
    await advanceTime(3802)

    // Fresh navigation after the failed prefetch.
    const freshNav = loader.loadRoute('/page-7')

    loader.onEntrypoint('/page-7', () => ({ default: () => null }))

    const script = await waitForScript('page-7.js')
    script.dispatchEvent(new Event('load'))

    await advanceTime(50)

    const result = await freshNav
    expect('component' in result).toBe(true)
  })

  // ── 8 ──────────────────────────────────────────────────────────────────────
  it('settles navigation with an error when chunk never arrives (no pending forever)', async () => {
    // The chunk is never appended to the document and onEntrypoint is never
    // called.  After two timeout cycles the navigation must settle with an
    // error rather than remain pending.

    window.__BUILD_MANIFEST = { '/page-8': ['static/chunks/page-8.js'] }
    const loader = freshLoader()

    loader.loadRoute('/page-8', true).catch(() => {})

    // Navigation joins while prefetch is in-flight.
    const navProm = loader.loadRoute('/page-8')

    // First timeout: prefetch rejects, navigation retries.
    await advanceTime(3802)

    // Second timeout: the retried navigation also times out.
    // Give an extra advance so the retry's resolvePromiseWithTimeout fires.
    await advanceTime(3802)

    // `loadRoute` without `prefetch=true` catches errors and returns them as
    // `{ error }` instead of throwing, so the navigation promise must resolve
    // (not reject) with an error object.
    const result = await navProm
    expect('error' in result).toBe(true)
    if ('error' in result && result.error instanceof Error) {
      expect(result.error.message).toMatch('Route did not complete loading')
    }
  })

  // ── 9 ──────────────────────────────────────────────────────────────────────
  it('does not leave unhandled promise rejections when no one watches the future', async () => {
    // A prefetch that times out must not trigger an UnhandledPromiseRejection.
    // The fix attaches `.catch(() => {})` to the internal shared future.

    window.__BUILD_MANIFEST = { '/page-9': ['static/chunks/page-9.js'] }
    const loader = freshLoader()

    // Fire-and-forget prefetch — no `.catch()` attached.
    loader.loadRoute('/page-9', true)

    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)

    await advanceTime(3802)
    // One more tick to let the event loop surface any unhandled rejections.
    await advanceTime(0)

    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
