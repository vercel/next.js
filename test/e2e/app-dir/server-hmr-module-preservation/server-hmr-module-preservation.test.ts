import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-hmr-module-preservation', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    startArgs: ['--experimental-server-fast-refresh'],
  })

  // Server HMR is a Turbopack-only feature, only available in dev mode
  const itTurbopackDev = isTurbopack && isNextDev ? it : it.skip

  itTurbopackDev(
    'should preserve unmodified module when page module changes',
    async () => {
      const browser = await next.browser('/')

      // Wait for initial render with module timestamp
      await retry(async () => {
        const text = await browser.elementByCss('#module-eval-time').text()
        expect(text).toMatch(/Module Evaluated At: \d+/)
      })

      // Capture the initial module evaluation timestamp
      const initialModuleEvalTime = await browser
        .elementByCss('#module-eval-time')
        .text()

      // Mark where we are in CLI output
      const cliOutputBeforePatch = next.cliOutput.length

      // Make a change to the page that doesn't affect the unmodified module
      await next.patchFile('app/page.tsx', (content) =>
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

      // Also verify via CLI output that unmodified module wasn't re-evaluated
      const cliOutputAfterPatch = next.cliOutput.slice(cliOutputBeforePatch)
      expect(cliOutputAfterPatch).not.toContain('[Module] evaluated')
    }
  )

  itTurbopackDev(
    'should re-evaluate module when the module itself changes',
    async () => {
      const browser = await next.browser('/')

      // Wait for initial render
      await retry(async () => {
        const text = await browser.elementByCss('#module-eval-time').text()
        expect(text).toMatch(/Module Evaluated At: \d+/)
      })

      // Capture the initial module evaluation timestamp
      const initialModuleEvalTime = await browser
        .elementByCss('#module-eval-time')
        .text()

      // Mark CLI output position
      const cliOutputBeforePatch = next.cliOutput.length

      // Make a change to the unmodified module itself
      await next.patchFile('app/unmodified-module.ts', (content) =>
        content.replace(
          "console.log('[Module] evaluated')",
          "console.log('[Module] RE-evaluated')"
        )
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

      // Verify via CLI output that module was re-evaluated
      const cliOutputAfterPatch = next.cliOutput.slice(cliOutputBeforePatch)
      expect(cliOutputAfterPatch).toContain('[Module] RE-evaluated')
    }
  )
})
