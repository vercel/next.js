import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

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

  function filterNavigationCommitLogs(logs: Array<{ message: string }>) {
    const result = []
    for (const log of logs) {
      if (log.message.startsWith('[Router Transition Commit]')) {
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

    it('reports correlated lifecycle events and route information', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        expect(
          (await getTransitionEvents(browser)).map((event) => event.phase)
        ).toEqual(['start', 'commit', 'settled'])
      })

      const [start, commit, settled] = await getTransitionEvents(browser)
      expect(start.url).toBe('/some-page')
      expect(start.navigateType).toBe('push')
      expect(typeof start.event.id).toBe('string')
      expect(start.event.timestamp).toBeGreaterThan(0)
      expect(start.event.fromRoutes).toEqual(['/'])
      expect(start.event.prefetchIntent).toBe('full')
      expect(commit.event.routes).toEqual(['/some-page'])
      if (isNextDev) {
        expect(commit.event.prefetch).toBe('miss')
      } else {
        expect(['hit-route', 'hit-shell', 'miss']).toContain(
          commit.event.prefetch
        )
      }
      expect(commit.event.id).toBe(start.event.id)
      expect(settled.event.id).toBe(start.event.id)
      expect(commit.event.timestamp).toBeGreaterThanOrEqual(
        start.event.timestamp
      )
      expect(settled.event.timestamp).toBeGreaterThanOrEqual(
        commit.event.timestamp
      )
    })

    it('reports a null prefetch intent for programmatic navigation', async () => {
      const browser = await next.browser('/')

      await browser.elementById('push-some-page').click()
      await browser.elementById('some-page')

      const [start] = await getTransitionEvents(browser)
      expect(start.phase).toBe('start')
      expect(start.url).toBe('/some-page')
      expect(start.navigateType).toBe('push')
      expect(start.event.prefetchIntent).toBe(null)
    })

    it('uses route patterns and puts the primary source route first', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/blog/hello"]').click()
      await browser.elementById('blog-post')
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser))
          .filter((e) => e.phase === 'start')
          .at(-1).event.fromRoutes
      ).toEqual(['/blog/[slug]'])

      await browser.elementByCss('a[href="/dashboard"]').click()
      await browser.elementById('dashboard')
      await browser.elementById('analytics')
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser))
          .filter((e) => e.phase === 'start')
          .at(-1).event.fromRoutes
      ).toEqual(['/dashboard', '/dashboard/@analytics'])
    })

    it('omits route groups from fromRoutes', async () => {
      const browser = await next.browser('/about')

      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser))
          .filter((e) => e.phase === 'start')
          .at(-1).event.fromRoutes
      ).toEqual(['/about'])
    })

    it('reports intercepted route patterns in fromRoutes', async () => {
      const browser = await next.browser('/gallery')

      await browser.elementByCss('a[href="/gallery/photos/1"]').click()
      await browser.elementById('photo-modal')

      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser))
          .filter((e) => e.phase === 'start')
          .at(-1).event.fromRoutes
      ).toEqual(['/gallery', '/gallery/@modal/(.)photos/[id]'])
    })

    it('uses route patterns and puts the primary destination route first', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/blog/hello"]').click()
      await browser.elementById('blog-post')
      await retry(async () => {
        expect(
          (await getTransitionEvents(browser)).some(
            (event) => event.phase === 'commit'
          )
        ).toBe(true)
      })
      expect(
        (await getTransitionEvents(browser))
          .filter((event) => event.phase === 'commit')
          .at(-1).event.routes
      ).toEqual(['/blog/[slug]'])

      await browser.elementByCss('a[href="/dashboard"]').click()
      await browser.elementById('dashboard')
      await browser.elementById('analytics')
      await retry(async () => {
        expect(
          (await getTransitionEvents(browser))
            .filter((event) => event.phase === 'commit')
            .at(-1).event.routes
        ).toEqual(['/dashboard', '/dashboard/@analytics'])
      })
    })

    it('commits the shell before the response settles', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementById('slow-shell')

      await retry(async () => {
        expect(
          (await getTransitionEvents(browser)).some(
            (event) => event.phase === 'commit'
          )
        ).toBe(true)
      })
      if (!process.env.IS_WEBPACK_TEST) {
        expect(
          (await getTransitionEvents(browser)).some(
            (event) => event.phase === 'settled'
          )
        ).toBe(false)
      }

      await browser.elementById('slow-content')
      await retry(async () => {
        expect(
          (await getTransitionEvents(browser)).map((event) => event.phase)
        ).toEqual(['start', 'commit', 'settled'])
      })
    })

    it('aborts a transition when it is superseded', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/slow"]').click()
      await retry(async () => {
        expect((await getTransitionEvents(browser))[0].phase).toBe('start')
      })

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await retry(async () => {
        expect((await getTransitionEvents(browser)).at(-1).phase).toBe(
          'settled'
        )
      })

      const events = await getTransitionEvents(browser)
      const firstId = events[0].event.id
      const firstTerminalEvent = events.find(
        (event) =>
          event.event.id === firstId &&
          (event.phase === 'abort' || event.phase === 'settled')
      )
      expect(firstTerminalEvent.phase).toBe('abort')
      expect(firstTerminalEvent.event.reason).toBe('superseded')
    })

    it('does not emit transition events for a hash-only navigation', async () => {
      const browser = await next.browser('/')

      // A hash-only navigation (in-page anchor) only scrolls — it is not a
      // route transition and must not produce any lifecycle events.
      await browser.elementById('push-hash').click()
      await retry(async () => {
        expect(await browser.eval('location.hash')).toBe('#section')
      })
      expect(await getTransitionEvents(browser)).toEqual([])

      // A subsequent real navigation still instruments, proving the hooks are
      // installed and the empty result above is the hash-skip, not a dead hook.
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await retry(async () => {
        expect(
          (await getTransitionEvents(browser)).map((e) => e.phase)
        ).toEqual(['start', 'commit', 'settled'])
      })
    })
  })

  describe('router transition route mismatch', () => {
    const { next, isNextDev: isDevMode } = nextTestSetup({
      files: path.join(__dirname, 'mismatch'),
    })

    // Prod-only: dev never prefetches, so the navigation takes the unknown-route
    // path and never produces a tree mismatch.
    if (isDevMode) {
      it('is disabled in development', () => {})
      return
    }

    async function getTransitionEvents(browser) {
      return browser.eval(`window.__ROUTER_TRANSITION_EVENTS`)
    }

    it('emits a route-mismatch event when a navigation rewrites to a different route', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Reveal the link so it prefetches page A.
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/dynamic-page/a?mismatch-rewrite=./b"]'
      )
      await act(async () => await toggle.click(), {
        includes: 'Loading a...',
      })

      // Clicking navigates to the prefetched route A, but the proxy rewrites the
      // navigation request to route B. The client detects the mismatch and
      // recovers by rendering route B.
      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/dynamic-page/a?mismatch-rewrite=./b"]'
        )
        await link.click()
      }, [{ includes: 'Dynamic page b' }])
      await browser.elementById('dynamic-page-content-b')

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const mismatch = events.find((e) => e.phase === 'route-mismatch')
      expect(start).toBeDefined()
      expect(mismatch).toBeDefined()
      // The mismatch is correlated to the originating transition...
      expect(mismatch.event.id).toBe(start.event.id)
      // ...and is a milestone, not a terminal event, so its timestamp falls
      // after the start.
      expect(mismatch.event.timestamp).toBeGreaterThanOrEqual(
        start.event.timestamp
      )
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

      expect(filterNavigationCommitLogs(await browser.log())).toEqual([
        '[Router Transition Commit] [push] /some-page a',
        '[Router Transition Commit] [push] /some-page b',
        '[Router Transition Commit] [push] /some-page user',
        '[Router Transition Commit] [push] / a',
        '[Router Transition Commit] [push] / b',
        '[Router Transition Commit] [push] / user',
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
