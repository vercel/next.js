import type { Response } from 'node-fetch'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-hmr', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Server HMR is a Turbopack-only feature, only available in dev mode
  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  describe('module preservation', () => {
    itTurbopackDev(
      'does not re-evaluate an unmodified module when page module changes',
      async () => {
        const browser = await next.browser('/module-preservation')

        // Wait for initial render with module timestamp
        await retry(async () => {
          const text = await browser.elementByCss('#module-eval-time').text()
          expect(text).toMatch(/Module Evaluated At: \d+/)
        })

        // Capture the initial module evaluation timestamp
        const initialModuleEvalTime = await browser
          .elementByCss('#module-eval-time')
          .text()

        // Make a change to the page that doesn't affect the unmodified module
        await next.patchFile('app/module-preservation/page.tsx', (content) =>
          content.replace('hello world', 'hello universe')
        )

        // Wait for HMR to apply and verify the page updated
        await retry(async () => {
          const text = await browser.elementByCss('#greeting').text()
          expect(text).toBe('hello universe')
        })

        // The unmodified module should NOT have been re-evaluated (same timestamp)
        const newModuleEvalTime = await browser
          .elementByCss('#module-eval-time')
          .text()
        expect(newModuleEvalTime).toBe(initialModuleEvalTime)
      }
    )

    itTurbopackDev(
      're-evaluates a module when the module itself changes',
      async () => {
        const browser = await next.browser('/module-preservation')

        // Wait for initial render
        await retry(async () => {
          const text = await browser.elementByCss('#module-eval-time').text()
          expect(text).toMatch(/Module Evaluated At: \d+/)
        })

        // Capture the initial module evaluation timestamp
        const initialModuleEvalTime = await browser
          .elementByCss('#module-eval-time')
          .text()

        // Make a change to the module itself to trigger re-evaluation
        await next.patchFile('app/unmodified-module.ts', (content) =>
          content.replace('_hmrTrigger = 0', '_hmrTrigger = 1')
        )

        // Wait for HMR to apply - the module should be re-evaluated
        // and the timestamp should change
        await retry(async () => {
          // Refresh to trigger re-evaluation of changed modules
          await browser.refresh()
          const newModuleEvalTime = await browser
            .elementByCss('#module-eval-time')
            .text()
          expect(newModuleEvalTime).not.toBe(initialModuleEvalTime)
        })
      }
    )
  })

  describe('child module accept', () => {
    itTurbopackDev(
      'allows child modules to accept hot updates using module.hot.accept',
      async () => {
        const browser = await next.browser('/child-accept')

        // Wait for initial render
        await retry(async () => {
          const text = await browser.elementByCss('#message').text()
          expect(text).toBe('Initial message')
        })

        const initialEvalTime = await browser.elementByCss('#eval-time').text()
        expect(initialEvalTime).toMatch(/Module evaluated at: \d+/)

        // Make a change to the child module
        // The child module calls module.hot.accept(), which allows it to
        // accept updates. While pages auto-accept at the top level in server HMR,
        // this test verifies that module.hot.accept() is available and functional
        // in non-page, user-authored child modules.
        await next.patchFile('app/child-module.ts', (content) =>
          content.replace('Initial message', 'Updated message')
        )

        // Wait for HMR to apply - the child module should accept the update
        await retry(async () => {
          const text = await browser.elementByCss('#message').text()
          expect(text).toBe('Updated message')
        })

        // The module should have been re-evaluated (new timestamp)
        const newEvalTime = await browser.elementByCss('#eval-time').text()
        expect(newEvalTime).not.toBe(initialEvalTime)

        // Apply another update to verify the module continues to accept updates
        await next.patchFile('app/child-module.ts', (content) =>
          content.replace('Updated message', 'Second update')
        )

        await retry(async () => {
          const text = await browser.elementByCss('#message').text()
          expect(text).toBe('Second update')
        })
      }
    )
  })

  describe('source maps', () => {
    itTurbopackDev(
      "stack frames from eval'd HMR modules point to original source locations",
      async () => {
        await next.fetch('/sourcemaps').catch(() => {})

        await next.patchFile('app/sourcemaps/page.tsx', (content) =>
          content.replace('hmr-trigger: 0', 'hmr-trigger: 1')
        )

        const outputLengthBeforeFetch = next.cliOutput.length
        await next.fetch('/sourcemaps').catch(() => {})

        await retry(async () => {
          expect(next.cliOutput.slice(outputLengthBeforeFetch)).toContain(
            'hmr-sourcemap-test-error'
          )
        })

        const outputAfterHmr = next.cliOutput.slice(outputLengthBeforeFetch)

        // Without proper sourcemaps, the stack frame doesn't include the accurate file number
        expect(outputAfterHmr).toMatch(/page\.tsx:4:9/)
      }
    )
  })

  describe('route handler hmr', () => {
    function getText(res: Response) {
      return res.ok
        ? res.text()
        : Promise.reject(
            new Error('Failed to fetch route handler: ' + res.status)
          )
    }

    it('reflects route handler changes on fetch/refresh', async () => {
      const initial = await next.fetch('/api/hello').then(getText)
      expect(initial).toBe('version: 0')

      await next.patchFile('app/api/hello/route.ts', (content) =>
        content.replace('version: 0', 'version: 1')
      )

      await retry(async () => {
        const updated = await next.fetch('/api/hello').then(getText)
        expect(updated).toBe('version: 1')
      })
    })

    itTurbopackDev(
      'does not re-evaluate an unmodified dependency when route changes',
      async () => {
        const initial = await next
          .fetch('/api/with-dep')
          .then((res) => res.json())
        expect(initial.routeVersion).toBe('v1')
        const initialDepEvaluatedAt = initial.depEvaluatedAt

        // Change only the route module, not the dependency
        await next.patchFile('app/api/with-dep/route.ts', (content) =>
          content.replace("'v1'", "'v2'")
        )

        await retry(async () => {
          const updated = await next
            .fetch('/api/with-dep')
            .then((res) => res.json())

          // The route change should be reflected in the response
          expect(updated.routeVersion).toBe('v2')

          // The unmodified dependency should NOT have been re-evaluated
          expect(updated.depEvaluatedAt).toBe(initialDepEvaluatedAt)
        })
      }
    )
  })
})
