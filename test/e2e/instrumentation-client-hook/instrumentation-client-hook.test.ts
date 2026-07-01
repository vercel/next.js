import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('Instrumentation Client Hook', () => {
  describe.each([
    {
      name: 'With src folder',
      appDir: 'app-with-src',
      shouldLog: false,
    },
    {
      name: 'App Router',
      appDir: 'app-router',
      shouldLog: true,
    },
    {
      name: 'Pages Router',
      appDir: 'pages-router',
      shouldLog: false,
    },
  ])('$name', ({ name, appDir, shouldLog }) => {
    describe(name, () => {
      const { next, isNextDev } = nextTestSetup({
        files: path.join(__dirname, appDir),
      })

      it(`should execute instrumentation-client from ${name.toLowerCase()} before hydration`, async () => {
        const browser = await next.browser('/')

        const instrumentationTime = await browser.eval(
          `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
        )
        const hydrationTime = await browser.eval(`window.__NEXT_HYDRATED_AT`)

        expect(instrumentationTime).toBeDefined()
        expect(hydrationTime).toBeDefined()
        expect(instrumentationTime).toBeLessThan(hydrationTime)
        expect(
          (await browser.log()).some((log) =>
            log.message.startsWith(
              '[Client Instrumentation Hook] Slow execution detected'
            )
          )
        ).toBe(isNextDev && shouldLog)
      })
    })
  })

  function filterNavigationStartLogs(logs: Array<{ message: string }>) {
    const result = []
    for (const log of logs) {
      if (log.message.startsWith('[Router Transition Start]')) {
        result.push(log.message)
      }
    }
    return result
  }

  describe('onRouterTransitionStart', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'app-router'),
    })

    it('onRouterTransitionStart fires at the start of a navigation', async () => {
      const browser = await next.browser('/')

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      const linkToHome = await browser.elementByCss('a[href="/"]')
      await linkToHome.click()
      await browser.elementById('home')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page',
        '[Router Transition Start] [push] /',
      ])
    })

    it('onRouterTransitionStart fires at the start of a back/forward navigation', async () => {
      const browser = await next.browser('/')

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      await browser.back()
      await browser.elementById('home')

      await browser.forward()
      await browser.elementById('some-page')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page',
        '[Router Transition Start] [traverse] /',
        '[Router Transition Start] [traverse] /some-page',
      ])
    })

    it('preserves the legacy two-argument start hook without the experimental flag', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      expect(
        await browser.eval(`
          window.__ROUTER_TRANSITION_EVENTS.map((event) => ({
            phase: event.phase,
            hasEvent: event.event != null,
          }))
        `)
      ).toEqual([{ phase: 'start', hasEvent: false }])
    })
  })

  describe('router transition lifecycle', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'app-router'),
      nextConfig: {
        experimental: {
          instrumentationClientRouterTransitionEvents: true,
        },
      },
    })

    async function getTransitionEvents(browser) {
      return browser.eval(`window.__ROUTER_TRANSITION_EVENTS`)
    }

    it('reports a fromTree descriptor on start (no prefetchIntent)', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      const [start] = await getTransitionEvents(browser)
      expect(start.phase).toBe('start')
      expect(start.url).toBe('/some-page')
      expect(start.navigateType).toBe('push')
      expect(typeof start.event.id).toBe('string')
      expect(start.event.timestamp).toBeGreaterThan(0)
      // fromTree describes the route we navigated away from (the home page).
      expect(start.event.fromTree.routeTemplates).toEqual(['/'])
      expect(start.event.fromTree.renderedPathname).toBe('/')
      expect(start.event.fromTree.params).toEqual([])
      expect(start.event.fromTree.searchParams).toEqual({})
      // prefetchIntent / fromRoutes were removed from the event.
      expect('prefetchIntent' in start.event).toBe(false)
      expect('fromRoutes' in start.event).toBe(false)
    })

    it('reports a commit with toTree and the same id as its start', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      expect(commit.navigateType).toBe('push')
      expect(commit.event.id).toBe(start.event.id)
      expect(commit.event.timestamp).toBeGreaterThanOrEqual(
        start.event.timestamp
      )
      expect(commit.event.toTree.routeTemplates).toEqual(['/some-page'])
      expect(commit.event.toTree.renderedPathname).toBe('/some-page')
    })

    it('reports a hit when restoring a cached route', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await browser.back()
      await browser.elementById('home')
      // Going forward restores /some-page from the BFCache, so there is a fully
      // rendered shell to navigate into.
      await browser.forward()
      await browser.elementById('some-page')

      await retry(async () => {
        const commit = (await getTransitionEvents(browser))
          .filter((e) => e.phase === 'commit' && e.url === '/some-page')
          .at(-1)
        expect(commit?.event.outcome).toBe('hit')
      })
    })

    it('reports a miss when nothing is prefetched for the route', async () => {
      const browser = await next.browser('/')

      await browser.elementById('push-no-prefetch').click()
      await browser.elementById('no-prefetch')

      await retry(async () => {
        const commit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.url === '/no-prefetch'
        )
        expect(commit?.event.outcome).toBe('miss')
      })
    })

    it('aborts an in-flight transition superseded before it commits', async () => {
      const browser = await next.browser('/')

      await browser.elementById('abort-double-push').click()
      await browser.elementById('dashboard')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'abort')).toBe(true)
      })

      const events = await getTransitionEvents(browser)
      const commit = events.find((e) => e.phase === 'commit')
      const abort = events.find((e) => e.phase === 'abort')
      // The later navigation (/dashboard) commits; the earlier (/some-page) is
      // aborted, attributed to the commit that superseded it.
      expect(commit.url).toBe('/dashboard')
      expect(abort.url).toBe('/some-page')
      expect(abort.event.cause).toBe(commit.event.id)
    })

    it('emits matching trees for a hash-only navigation', async () => {
      const browser = await next.browser('/')

      await browser.elementById('push-hash').click()

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      // A hash-only navigation doesn't change the route, so the route identity
      // (everything but the hash-bearing canonicalUrl) is unchanged — that's
      // what consumers group by.
      expect(commit.event.toTree.routeTemplates).toEqual(
        start.event.fromTree.routeTemplates
      )
      expect(commit.event.toTree.renderedPathname).toBe(
        start.event.fromTree.renderedPathname
      )
      expect(commit.event.toTree.params).toEqual(start.event.fromTree.params)
      expect(commit.event.toTree.searchParams).toEqual(
        start.event.fromTree.searchParams
      )
    })

    it('reports a traverse navigation on back/forward', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await browser.back()
      await browser.elementById('home')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(
          events.some(
            (e) => e.phase === 'commit' && e.navigateType === 'traverse'
          )
        ).toBe(true)
      })

      const traverseCommit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit' && e.navigateType === 'traverse'
      )
      expect(traverseCommit.event.toTree.routeTemplates).toEqual(['/'])
    })

    it('renders dynamic segments as positional holes with positional params', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/blog/hello"]').click()
      await browser.elementById('blog-post')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      expect(commit.event.toTree.routeTemplates).toEqual(['/blog/:1'])
      expect(commit.event.toTree.params).toEqual(['hello'])
      expect(commit.event.toTree.renderedPathname).toBe('/blog/hello')
    })

    it('omits route groups from route templates', async () => {
      const browser = await next.browser('/about')

      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      const start = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'start'
      )
      // The (marketing) group folder is not part of the route template.
      expect(start.event.fromTree.routeTemplates).toEqual(['/about'])
    })

    it('includes parallel slots and reports the post-rewrite pathname for intercepted routes', async () => {
      const browser = await next.browser('/gallery')

      await browser.elementByCss('a[href="/gallery/photos/1"]').click()
      await browser.elementById('photo-modal')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      // The intercepted modal keeps the gallery as the rendered (primary) route
      // even though the browser URL is /gallery/photos/1.
      expect(commit.event.toTree.renderedPathname).toBe('/gallery')
      expect(commit.event.toTree.routeTemplates).toEqual([
        '/gallery',
        '/gallery/@modal/(.)photos/:1',
      ])
    })

    it('runs commit exactly once per navigation', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })
      const events = await getTransitionEvents(browser)
      expect(events.filter((e) => e.phase === 'start')).toHaveLength(1)
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })
  })

  describe.each([
    {
      name: 'default',
      packageJson: {},
    },
    {
      name: 'with type:module',
      packageJson: { type: 'module' },
    },
  ])('instrumentationClientInject $name', ({ packageJson }) => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'inject'),
      packageJson,
    })

    it('runs each injected module before the user instrumentation-client and before hydration, in array order', async () => {
      const browser = await next.browser('/')

      const order = await browser.eval(`window.__INJECT_ORDER`)
      expect(order).toEqual(['side-effect', 'late-hook', 'a', 'b', 'user'])

      const moduleA = await browser.eval(`window.__INJECT_A_EXECUTED_AT`)
      const moduleB = await browser.eval(`window.__INJECT_B_EXECUTED_AT`)
      const userTime = await browser.eval(
        `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
      )
      const hydrationTime = await browser.eval(`window.__NEXT_HYDRATED_AT`)

      expect(moduleA).toBeDefined()
      expect(moduleB).toBeDefined()
      expect(userTime).toBeDefined()
      expect(hydrationTime).toBeDefined()

      expect(moduleA).toBeLessThanOrEqual(moduleB)
      expect(moduleB).toBeLessThanOrEqual(userTime)
      expect(userTime).toBeLessThan(hydrationTime)
    })

    it('surfaces onRouterTransitionStart from every injected module', async () => {
      const browser = await next.browser('/')
      await browser.eval(`window.__INSTALL_LATE_INSTRUMENTATION_HOOK()`)

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      const linkToHome = await browser.elementByCss('a[href="/"]')
      await linkToHome.click()
      await browser.elementById('home')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page late-hook',
        '[Router Transition Start] [push] /some-page a',
        '[Router Transition Start] [push] /some-page b',
        '[Router Transition Start] [push] /some-page user',
        '[Router Transition Start] [push] / late-hook',
        '[Router Transition Start] [push] / a',
        '[Router Transition Start] [push] / b',
        '[Router Transition Start] [push] / user',
      ])
    })

    it('isolates hook errors between injected modules', async () => {
      const browser = await next.browser('/')

      await browser.eval(`window.__INSTALL_LATE_INSTRUMENTATION_HOOK()`)
      await browser.eval(`window.__THROW_INJECT_A = true`)
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      const logs = await browser.log()
      expect(filterNavigationStartLogs(logs)).toEqual([
        '[Router Transition Start] [push] /some-page late-hook',
        '[Router Transition Start] [push] /some-page a',
        '[Router Transition Start] [push] /some-page b',
        '[Router Transition Start] [push] /some-page user',
      ])
      expect(
        logs.filter((log) =>
          log.message.includes(
            'An instrumentation-client router transition hook failed'
          )
        )
      ).toHaveLength(1)
    })
  })

  if (isNextDev) {
    describe('HMR in development mode', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'app-router'),
      })

      it('should reload instrumentation-client when modified', async () => {
        const browser = await next.browser('/')
        const initialTime = await browser.eval(
          `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
        )
        expect(initialTime).toBeDefined()

        // Modify the instrumentation-client.ts file
        const instrumentationPath = 'instrumentation-client.ts'

        const originalContent = await next.readFile(instrumentationPath)

        await next.patchFile(
          instrumentationPath,
          `
          window.__INSTRUMENTATION_CLIENT_EXECUTED_AT = Date.now();
          window.__INSTRUMENTATION_CLIENT_UPDATED = true;
          `
        )

        await retry(async () => {
          // Check if the updated instrumentation client was executed
          const updatedFlag = await browser.eval(
            `window.__INSTRUMENTATION_CLIENT_UPDATED`
          )
          expect(updatedFlag).toBe(true)

          // Verify new execution time
          const newTime = await browser.eval(
            `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
          )
          expect(newTime).toBeDefined()
          expect(newTime).toBeGreaterThan(initialTime)
        })

        // Restore the original file
        await next.patchFile(instrumentationPath, originalContent)
      })
    })
  }
})
