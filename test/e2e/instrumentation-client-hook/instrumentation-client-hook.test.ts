import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('Instrumentation Client Hook', () => {
  const testCases = [
    {
      name: 'With src folder',
      appDir: 'app-with-src',
    },
    {
      name: 'App Router',
      appDir: 'app-router',
    },
    {
      name: 'Pages Router',
      appDir: 'pages-router',
    },
  ]

  testCases.forEach(({ name, appDir }) => {
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
            log.message.startsWith('[Client Instrumentation Hook]')
          )
        ).toBe(isNextDev)
      })
    })
  })

  describe('HMR in development mode', () => {
    const { next, isNextDev } = nextTestSetup({
      files: path.join(__dirname, 'app-router'),
    })

    if (isNextDev) {
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
    } else {
      // Add a dummy test when not in dev mode
      it('skips tests in non-dev mode', () => {
        console.log(
          'Skipping instrumentation-client-hook tests in non-dev mode'
        )
      })
    }
  })
})
