import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

// Regression repro for a React DOM preload-then-render race that causes
// a layout-level `<Suspense>` to paint its fallback during navigation,
// even though the destination route's stylesheets were preloaded via
// `ReactDOM.preload(href, { as: 'style' })` and their bytes are in the
// browser cache.
//
// Why this is in the Next.js test suite (vs filed upstream in React):
// the bug fires in production traffic for any route whose stylesheets
// are preloaded via the `L` (preload) opcode pipeline rather than the
// `S` (preinit) opcode pipeline. Next.js's prefetch instrumentation
// emits `L` opcodes for destination-route CSS during the source page's
// render, so this is the production trigger.
//
// The test is marked `it.failing` because it asserts the EXPECTED
// (post-fix) behavior. It currently passes because the assertions
// fail — i.e. the bug is firing. When the bug is fixed in either
// React DOM or Next.js, this test will start failing (because the
// assertions will pass), at which point the maintainer should remove
// the `.failing` modifier to convert this into a regression guard.
//
// Source-level trace, in
// `next/src/compiled/react-dom/cjs/react-dom-client.production.js`:
//
//   On `/` mount, `<Home>` calls `ReactDOM.preload(href, {as:'style'})`
//   for each destination stylesheet → `preload` (line 16619):
//     1. `preloadPropsMap.has(key)` → false
//     2. `preloadPropsMap.set(key, props)`        ← (A) the troublesome write
//     3. `<link rel="preload" as="style">` appended to <head>
//
//   On click /logs, render reaches `<link rel="stylesheet" precedence>`
//   inside the fresh `/logs/layout.tsx` Suspense (= `shellBoundary`):
//
//     `getResource` (line 16786):
//        `styles.get(key)` → null
//        create new resource `state = { loading: 0, preload: null }`
//        `styles.set(key, resource)`
//        `querySelector(link[rel="stylesheet"]…)` → null
//        `preloadPropsMap.has(key)` → TRUE         ← short-circuits (B)
//          ↓
//        `preloadStylesheet` is NEVER CALLED. Without it, the matching
//        `<link rel="preload">` from (A) is never consulted, so
//        `state.loading` stays at 0.
//
//     `completeWork` case 26 → `preloadResourceAndSuspendIfNeeded`
//       (line 12695-12707):
//        `(state.loading & 4) === 0` ✓ → `flags |= 16777216`
//        `!preloadResource(resource)` ((loading & 3) === 0) ✓
//        `shouldRemainOnPreviousScreen()` (transition lane,
//          `shellBoundary` set) → false
//        → throw `SuspenseyCommitException`
//
//   Wide Suspense catches → fallback commits → empty-shell paint.
//
// The test asserts three independent signals:
//
//   1. `<link rel="preload" as="style">` is in <head> for each
//      stylesheet href before click, and `<link rel="stylesheet">`
//      for the same href is NOT (otherwise the bug wouldn't fire —
//      `getResource` would find the stylesheet via line 16835 and set
//      `state.loading = 5`).
//   2. `__FALLBACK_MOUNTED` stays false after click — i.e., no
//      empty-shell paint.
//   3. No SuspenseComponent fiber catches `SuspenseyCommitException`
//      (no `flags & 16384` with empty `updateQueue`).
describe('ReactDOM.preload then <link rel="stylesheet" precedence> race', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  // Custom DevTools hook injected before any page script. React DOM's
  // module-load-time check at `react-dom-client.production.js:18170`
  // calls `inject(internals)`, after which `onCommitFiberRoot` fires
  // for every commit.
  const HOOK_SCRIPT = `
    (function () {
      const captures = []
      window.__SUSPENSEY_FIBER_CAPTURES = captures
      window.__SUSPENSEY_RESET = function () { captures.length = 0 }

      const SUSPENSE_TAG = 13
      const DID_CAPTURE = 16384

      function walk(fiber, accum) {
        if (!fiber) return
        if (fiber.tag === SUSPENSE_TAG) {
          const flags = fiber.flags | 0
          const uq = fiber.updateQueue
          let queueSize = 0
          let queueIsNull = uq == null
          if (uq && typeof uq.size === 'number') queueSize = uq.size
          accum.push({
            flags,
            didCapture: (flags & DID_CAPTURE) !== 0,
            queueSize,
            queueIsNull,
          })
        }
        walk(fiber.child, accum)
        walk(fiber.sibling, accum)
      }

      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        renderers: new Map(),
        inject(internals) {
          const id = this.renderers.size + 1
          this.renderers.set(id, internals)
          return id
        },
        onCommitFiberRoot(_id, root) {
          try {
            const accum = []
            walk(root.current, accum)
            captures.push({ t: performance.now(), suspenseFibers: accum })
          } catch (e) {
            // swallow
          }
        },
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
      }
    })()
  `

  const STYLESHEET_HREFS = [
    '/test-style-a.css',
    '/test-style-b.css',
    '/test-style-c.css',
  ]

  type Fiber = {
    flags: number
    didCapture: boolean
    queueSize: number
    queueIsNull: boolean
  }
  type Capture = { t: number; suspenseFibers: Fiber[] }

  function hasSuspenseyCommitCatch(captures: Capture[]): boolean {
    return captures.some((c) =>
      c.suspenseFibers.some(
        (f) => f.didCapture && (f.queueIsNull || f.queueSize === 0)
      )
    )
  }

  // Marked `.failing`: asserts post-fix expected behavior. Currently
  // passes because the bug fires. Will fail when the bug is fixed —
  // at which point remove `.failing`.
  it.failing(
    'navigation to a route with preloaded stylesheets does not paint the layout Suspense fallback',
    async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        async beforePageLoad(p: Playwright.Page) {
          page = p
          await p.addInitScript(HOOK_SCRIPT)
        },
      })
      await browser.waitForElementByCss('#home')

      // Wait until `<Home>`'s `useEffect` has fired and all three
      // `<link rel="preload" as="style">` elements are in <head>.
      // This is the precondition for the bug: `preloadPropsMap` is
      // populated for each href, and the matching preload `<link>`
      // is in the document with bytes downloading or already cached.
      await page!.waitForFunction(
        (hrefs) =>
          hrefs.every(
            (h) =>
              !!document.head.querySelector(
                `link[rel="preload"][as="style"][href="${h}"]`
              )
          ),
        STYLESHEET_HREFS
      )

      // Signal 1: preloads ARE in head, and stylesheets are NOT.
      const preloadsBeforeClick = await page!.evaluate(
        (hrefs) =>
          hrefs.map((h) => ({
            href: h,
            preloadPresent: !!document.head.querySelector(
              `link[rel="preload"][as="style"][href="${h}"]`
            ),
            stylesheetPresent: !!document.head.querySelector(
              `link[rel="stylesheet"][href="${h}"]`
            ),
          })),
        STYLESHEET_HREFS
      )
      for (const r of preloadsBeforeClick) {
        expect(r.preloadPresent).toBe(true)
        expect(r.stylesheetPresent).toBe(false)
      }

      // Reset the fallback tripwire and the fiber captures so that
      // observations from initial-load hydration don't leak in.
      await page!.evaluate(() => {
        ;(window as any).__FALLBACK_MOUNTED = false
        ;(window as any).__FALLBACK_MOUNTED_AT = undefined
        ;(window as any).__SUSPENSEY_RESET()
      })
      const clickT = await page!.evaluate(() => performance.now())

      await browser.elementById('link-logs').click()
      await browser.waitForElementByCss('#content')
      await page!.waitForTimeout(1500)

      const fallbackMounted = await page!.evaluate(
        () => !!(window as any).__FALLBACK_MOUNTED
      )

      const all = await page!.evaluate<Capture[]>(
        () => (window as any).__SUSPENSEY_FIBER_CAPTURES
      )
      const captures = all.filter((c) => c.t >= clickT - 5)

      // Signal 2 (post-fix expected): the layout-level Suspense
      // fallback was NOT committed — i.e., the destination tree
      // committed in one shot using the cached preload bytes.
      // Currently fails because the bug fires.
      expect(fallbackMounted).toBe(false)

      // Signal 3 (post-fix expected): no SuspenseComponent caught
      // `SuspenseyCommitException`. Currently fails because the bug
      // fires.
      expect(hasSuspenseyCommitCatch(captures)).toBe(false)
    }
  )
})
