import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { openRedbox, retry } from 'next-test-utils'

// Deploy mode has no local build/generate output to inspect.
// @force-gate !deploy
describe('short-lived-cache diagnostics', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: !isNextDev })
  beforeAll(async () => {
    if (isNextStart) {
      const result = await next.build({
        args: ['--experimental-build-mode', 'compile'],
      })
      if (result.exitCode !== 0) throw new Error(result.cliOutput)
    }
  })
  const routes = [
    'static-expire',
    'static-revalidate',
    'static-stale',
    'instant-expire',
    'instant-revalidate',
    'instant-stale',
    'runtime-shell/instant-stale',
    'static-metadata',
    'static-viewport',
    'metadata',
    'viewport',
  ]
  for (const route of routes) {
    it(`validates cacheLife for /${route}`, async () => {
      let output: string
      if (isNextDev) {
        const start = next.cliOutput.length
        const browser = await next.browser(`/${route}`)
        if (
          route === 'runtime-shell/instant-stale' &&
          process.env.__NEXT_PARTIAL_PREFETCHING === 'false'
        ) {
          await retry(async () => {
            expect(await browser.elementByCss('body').text()).toContain(
              'Short stale'
            )
          })
          expect(next.cliOutput.slice(start)).not.toContain(
            'Next.js encountered'
          )
          return
        }
        await retry(() => {
          expect(next.cliOutput.slice(start)).toContain(
            'Next.js encountered a short-lived cache'
          )
        })
        output = next.cliOutput.slice(start)
        if (route === 'static-expire') {
          await openRedbox(browser)
          const guidance = await browser
            .elementByCss('[data-nextjs-instant-guidance]')
            .text()
          expect(guidance).toContain('Increase the cache lifetime')
          expect(guidance).not.toContain('Cache the data access')
        }
      } else {
        const result = await next.build({
          args: [
            '--experimental-build-mode',
            'generate',
            '--debug-build-paths',
            `app/${route}/page.tsx`,
          ],
        })
        // Short stale (30..299) is valid for prerendering; the App Shell
        // restriction is checked by Instant Validation in development.
        if (route === 'runtime-shell/instant-stale') {
          expect(result.exitCode).toBe(0)
          return
        }
        expect(result.exitCode).toBe(1)
        output = result.cliOutput
      }
      if (isNextDev) {
        expect(output).toContain('300 seconds (five minutes)')
        expect(output).toContain('cacheLife')
        expect(output).toContain('Next.js encountered a short-lived cache')
        expect(output).toContain(
          `https://nextjs.org/docs/messages/${route.startsWith('static-') ? 'static-short-lived-cache' : 'short-lived-cache'}#${route.endsWith('metadata') ? 'metadata' : route.endsWith('viewport') ? 'viewport' : 'route-content'}`
        )
        expect(output).not.toContain('Next.js encountered URL data')
        expect(output).not.toContain('Cache the data access with')
      } else {
        expect(output).toContain(
          '  - [cache] For uncached data or short-lived caches: cache the '
        )
        expect(output).not.toContain('300 seconds (five minutes)')
        expect(output).not.toContain('For short-lived cached data: see')
      }
    })
  }
  for (const route of ['static-valid', 'static-unused', 'suspended-expire']) {
    it(`allows /${route}`, async () => {
      if (isNextDev) {
        const start = next.cliOutput.length
        const browser = await next.browser(`/${route}`)
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe(
            route.startsWith('static-') ? 'Valid' : 'Short expire'
          )
        })
        expect(next.cliOutput.slice(start)).not.toContain('Next.js encountered')
      } else {
        const result = await next.build({
          args: [
            '--experimental-build-mode',
            'generate',
            '--debug-build-paths',
            `app/${route}/page.tsx`,
          ],
        })
        expect(result.exitCode).toBe(0)
      }
    })
  }
  // @force-gate dev
  it('classifies a short-stale cache on a client navigation', async () => {
    const browser = await next.browser('/')
    const start = next.cliOutput.length
    await browser.elementByCss('a').click()
    if (process.env.__NEXT_PARTIAL_PREFETCHING === 'false') {
      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          'Short stale'
        )
      })
      expect(next.cliOutput.slice(start)).not.toContain('Next.js encountered')
    } else {
      await retry(() => {
        expect(next.cliOutput.slice(start)).toContain(
          'Next.js encountered a short-lived cache'
        )
      })
      expect(next.cliOutput.slice(start)).not.toContain(
        'Next.js encountered URL data'
      )
    }
  })
  // This assertion inspects development validation output.
  // @force-gate dev
  it('keeps an unrelated uncached hole classified as uncached', async () => {
    const start = next.cliOutput.length
    await next.browser('/mixed')
    await retry(() => {
      expect(next.cliOutput.slice(start)).toContain(
        'Next.js encountered uncached data'
      )
    })
    expect(next.cliOutput.slice(start)).not.toContain(
      'Next.js encountered a short-lived cache'
    )
  })
})
