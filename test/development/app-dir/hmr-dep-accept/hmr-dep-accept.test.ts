import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('hmr-dep-accept', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Dependency accept/decline requires Turbopack dev mode
  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  describe('dependency accept', () => {
    itTurbopackDev(
      'parent accepts child dependency update without re-evaluating',
      async () => {
        const browser = await next.browser('/dep-accept')

        // Wait for initial render and hydration (eval time only appears after useEffect)
        await retry(async () => {
          const text = await browser.elementByCss('#dep-value').text()
          expect(text).toBe('initial')
        })
        await retry(async () => {
          const text = await browser.elementByCss('#parent-eval-time').text()
          expect(text).toMatch(/Parent Evaluated At: \d+/)
        })

        // Capture the parent evaluation timestamp
        const parentEvalTime = await browser
          .elementByCss('#parent-eval-time')
          .text()

        // Verify initial accept call count
        const initialCallCount = await browser
          .elementByCss('#accept-call-count')
          .text()
        expect(initialCallCount).toBe('Accept Calls: 0')

        // Patch the dependency to change its exported value
        await next.patchFile('app/dep-accept/dep.ts', (content) =>
          content.replace("'initial'", "'updated'")
        )

        // Wait for the accept callback to fire and update the UI
        await retry(async () => {
          const text = await browser.elementByCss('#dep-value').text()
          expect(text).toBe('updated')
        })

        // The accept callback should have been called
        await retry(async () => {
          const callCount = await browser
            .elementByCss('#accept-call-count')
            .text()
          expect(callCount).toBe('Accept Calls: 1')
        })

        // The parent module should NOT have been re-evaluated
        const newParentEvalTime = await browser
          .elementByCss('#parent-eval-time')
          .text()
        expect(newParentEvalTime).toBe(parentEvalTime)
      }
    )
  })
})
