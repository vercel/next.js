import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('Instrumentation Client Hook', () => {
  const testCases = [
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
  ]

  testCases.forEach(({ name, appDir, shouldLog }) => {
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
  })

  describe('instrumentationClientInject', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'inject'),
    })

    it('runs each injected entry before the user instrumentation-client and before hydration, in array order', async () => {
      const browser = await next.browser('/')

      const order = await browser.eval(`window.__INJECT_ORDER`)
      expect(order).toEqual(['a', 'b', 'user'])

      const injectA = await browser.eval(`window.__INJECT_A_EXECUTED_AT`)
      const injectB = await browser.eval(`window.__INJECT_B_EXECUTED_AT`)
      const userTime = await browser.eval(
        `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
      )
      const hydrationTime = await browser.eval(`window.__NEXT_HYDRATED_AT`)

      expect(injectA).toBeDefined()
      expect(injectB).toBeDefined()
      expect(userTime).toBeDefined()
      expect(hydrationTime).toBeDefined()

      expect(injectA).toBeLessThanOrEqual(injectB)
      expect(injectB).toBeLessThanOrEqual(userTime)
      expect(userTime).toBeLessThan(hydrationTime)
    })

    it('still surfaces onRouterTransitionStart from the user instrumentation-client when injects are configured', async () => {
      const browser = await next.browser('/')

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      const linkToHome = await browser.elementByCss('a[href="/"]')
      await linkToHome.click()
      await browser.elementById('home')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page a',
        '[Router Transition Start] [push] /some-page b',
        '[Router Transition Start] [push] /some-page user',
        '[Router Transition Start] [push] / a',
        '[Router Transition Start] [push] / b',
        '[Router Transition Start] [push] / user',
      ])
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
