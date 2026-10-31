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

  describe('router transition start context', () => {
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

    it('reports transition metadata, source routes, and prefetch intent', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      const [start] = await getTransitionEvents(browser)
      expect(start.phase).toBe('start')
      expect(start.url).toBe('/some-page')
      expect(start.navigateType).toBe('push')
      expect(typeof start.event.id).toBe('string')
      expect(start.event.timestamp).toBeGreaterThan(0)
      expect(start.event.fromRoutes).toEqual(['/'])
      expect(start.event.prefetchIntent).toBe('full')
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
        (await getTransitionEvents(browser)).at(-1).event.fromRoutes
      ).toEqual(['/blog/[slug]'])

      await browser.elementByCss('a[href="/dashboard"]').click()
      await browser.elementById('dashboard')
      await browser.elementById('analytics')
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser)).at(-1).event.fromRoutes
      ).toEqual(['/dashboard', '/dashboard/@analytics'])
    })

    it('omits route groups from fromRoutes', async () => {
      const browser = await next.browser('/about')

      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser)).at(-1).event.fromRoutes
      ).toEqual(['/about'])
    })

    it('reports intercepted route patterns in fromRoutes', async () => {
      const browser = await next.browser('/gallery')

      await browser.elementByCss('a[href="/gallery/photos/1"]').click()
      await browser.elementById('photo-modal')

      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      expect(
        (await getTransitionEvents(browser)).at(-1).event.fromRoutes
      ).toEqual(['/gallery', '/gallery/@modal/(.)photos/[id]'])
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
