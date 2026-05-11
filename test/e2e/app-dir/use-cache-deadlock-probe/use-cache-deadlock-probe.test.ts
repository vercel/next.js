import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

function expectedTimeoutErrorMessage(route: string) {
  return `Route "${route}": filling a "use cache" entry exceeded \`experimental.useCacheTimeout\` during prerender. This usually means request-scoped data (such as \`params\`, \`searchParams\`, or \`cookies()\`) or an unresolved promise was awaited inside the cached function. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout`
}

function expectedDeadlockMessage(route: string) {
  return `Route "${route}": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout`
}

const timeoutErrorMessageFragment =
  'filling a "use cache" entry exceeded `experimental.useCacheTimeout`'

const deadlockErrorMessageFragment =
  'filling a "use cache" entry is stuck on shared state from the outer render scope'

describe('use-cache-deadlock-probe', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    // Probe behavior is dev-only; skip the production server start, but
    // let dev mode auto-start.
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (!isNextDev) {
    it('is a dev-only suite', () => {})
    return
  }

  describe('when a "use cache" fill hangs in the static stage due to module-scope state', () => {
    it('should show a module-scope deadlock error early', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/static')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1225",
         "description": "Route "/static": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/static/page.tsx (6:1) @ getCachedData
       > 6 | async function getCachedData(): Promise<string> {
           | ^",
         "stack": [
           "getCachedData app/static/page.tsx (6:1)",
           "Cached app/static/page.tsx (18:24)",
           "Page app/static/page.tsx (32:10)",
         ],
       }
      `)

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).toContain(
        `Error: ${expectedDeadlockMessage('/static')}`
      )
    })
  })

  describe('when a "use cache" fill hangs in the runtime stage due to module-scope state', () => {
    it('should show a module-scope deadlock error early', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/runtime')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1225",
         "description": "Route "/runtime": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/runtime/page.tsx (8:1) @ getCachedData
       >  8 | async function getCachedData(): Promise<string> {
            | ^",
         "stack": [
           "getCachedData app/runtime/page.tsx (8:1)",
           "Cached app/runtime/page.tsx (20:24)",
           "Page app/runtime/page.tsx (42:7)",
         ],
       }
      `)

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).toContain(
        `Error: ${expectedDeadlockMessage('/runtime')}`
      )
    })
  })

  describe('when navigating to the static page', () => {
    it('should show a deadlock error toast early', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/static"]').click()

      await retry(() => {
        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).toContain(
          `Error: ${expectedDeadlockMessage('/static')}`
        )
      }, 30_000)

      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "code": "E1225",
         "description": "Route "/static": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/static/page.tsx (6:1) @ getCachedData
       > 6 | async function getCachedData(): Promise<string> {
           | ^",
         "stack": [
           "getCachedData app/static/page.tsx (6:1)",
           "Cached app/static/page.tsx (18:24)",
           "Page app/static/page.tsx (32:10)",
         ],
       }
      `)
    })
  })

  describe('when navigating to the runtime page', () => {
    it('should show a deadlock error toast early', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/runtime"]').click()

      await retry(() => {
        const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

        expect(cliOutput).toContain(
          `Error: ${expectedDeadlockMessage('/runtime')}`
        )
      }, 30_000)

      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "code": "E1225",
         "description": "Route "/runtime": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/runtime/page.tsx (8:1) @ getCachedData
       >  8 | async function getCachedData(): Promise<string> {
            | ^",
         "stack": [
           "getCachedData app/runtime/page.tsx (8:1)",
           "Cached app/runtime/page.tsx (20:24)",
           "Page app/runtime/page.tsx (42:7)",
         ],
       }
      `)
    })
  })

  describe('when a "use cache" performs long-running I/O in the dynamic stage', () => {
    it('should not time out and should not report a deadlock', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/dynamic')

      await expect(browser.elementByCss('#cached').text()).resolves.toBe(
        'cached'
      )

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).not.toContain(timeoutErrorMessageFragment)
      expect(cliOutput).not.toContain(deadlockErrorMessageFragment)
    })
  })

  describe('when a "use cache" fill hangs unrelated to module scope', () => {
    it('should fall back to the regular cache-fill timeout error', async () => {
      const outputIndex = next.cliOutput.length
      // The page genuinely hangs for the full 25s `useCacheTimeout` before
      // surfacing the redbox; `waitUntil: 'commit'` avoids racing Playwright's
      // 30s default `page.goto` timeout.
      const browser = await next.browser('/also-hangs', { waitUntil: 'commit' })

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1222",
         "description": "Route "/also-hangs": filling a "use cache" entry exceeded \`experimental.useCacheTimeout\` during prerender. This usually means request-scoped data (such as \`params\`, \`searchParams\`, or \`cookies()\`) or an unresolved promise was awaited inside the cached function. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/also-hangs/page.tsx (5:1) @ getCachedData
       > 5 | async function getCachedData(): Promise<string> {
           | ^",
         "stack": [
           "getCachedData app/also-hangs/page.tsx (5:1)",
           "Cached app/also-hangs/page.tsx (15:24)",
           "Page app/also-hangs/page.tsx (23:10)",
         ],
       }
      `)

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).toContain(
        `Error: ${expectedTimeoutErrorMessage('/also-hangs')}`
      )
      expect(cliOutput).not.toContain(deadlockErrorMessageFragment)
    })
  })

  describe('when a chunk is emitted during the probe and the fill eventually settles', () => {
    it('should not report a deadlock', async () => {
      const outputIndex = next.cliOutput.length
      // `Quick` resolves at ~11s (during the probe's window), `Slow`
      // settles the fill at ~14s. The fill aborts the probe scheduler
      // before the rescheduled idle timer can fire a second probe; the
      // first probe's verdict is suppressed by the mid-probe recovery
      // check (or, equivalently, by the abort that fires when the fill
      // settles). No deadlock should be attributed to a slow-but-working
      // cache.
      const browser = await next.browser('/recovery')

      await expect(browser.elementByCss('#slow').text()).resolves.toBe('slow')
      await expect(browser.elementByCss('#quick').text()).resolves.toBe('quick')

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).not.toContain(deadlockErrorMessageFragment)
      expect(cliOutput).not.toContain(timeoutErrorMessageFragment)
    })
  })

  describe('when a chunk is emitted during the probe and the fill stays stuck', () => {
    it('should suppress the first probe and report the deadlock from the rescheduled probe', async () => {
      const outputIndex = next.cliOutput.length
      // `Quick` emits a chunk at ~11s, suppressing the first probe's
      // verdict via mid-probe recovery. The fill never settles (`Stuck`
      // is deadlocked), so the scheduler reschedules another probe ~10s
      // after that chunk; the second probe sees no chunks during its
      // own window and correctly reports the deadlock.
      const browser = await next.browser('/recovery-stuck', {
        waitUntil: 'commit',
      })

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1225",
         "description": "Route "/recovery-stuck": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/recovery-stuck/page.tsx (24:1) @ getCachedData
       > 24 | async function getCachedData() {
            | ^",
         "stack": [
           "getCachedData app/recovery-stuck/page.tsx (24:1)",
           "Cached app/recovery-stuck/page.tsx (41:18)",
           "Page app/recovery-stuck/page.tsx (49:10)",
         ],
       }
      `)

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).toContain(
        `Error: ${expectedDeadlockMessage('/recovery-stuck')}`
      )
      expect(cliOutput).not.toContain(timeoutErrorMessageFragment)
    })
  })

  describe('when a private "use cache" body reads cookies and hits a module-scope deadlock', () => {
    it('should still report a deadlock — proves cookies are forwarded into the probe', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/private-cookies')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1225",
         "description": "Route "/private-cookies": filling a "use cache" entry is stuck on shared state from the outer render scope. The same function completed in isolation, which usually means a module-scoped value (for example a top-level Map used to dedupe fetches) is joining a promise created outside the cache. "use cache" already dedupes calls with the same arguments within and across requests, so remove the surrounding dedupe layer. Learn more: https://nextjs.org/docs/app/api-reference/directives/use-cache#build-hangs-cache-timeout",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "app/private-cookies/page.tsx (20:1) @ getCachedData
       > 20 | async function getCachedData(): Promise<string> {
            | ^",
         "stack": [
           "getCachedData app/private-cookies/page.tsx (20:1)",
           "Cached app/private-cookies/page.tsx (35:24)",
           "Page app/private-cookies/page.tsx (55:7)",
         ],
       }
      `)

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      expect(cliOutput).toContain(
        `Error: ${expectedDeadlockMessage('/private-cookies')}`
      )
    })
  })
})
