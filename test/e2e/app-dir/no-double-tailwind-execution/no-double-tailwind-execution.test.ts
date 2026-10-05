import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('no-double-tailwind-execution', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@tailwindcss/postcss': '^4',
      tailwindcss: '^4',
    },
    env: {
      DEBUG: 'tailwindcss',
      ...process.env,
    },
  })

  it('should run tailwind only once initially and per change', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    function getTailwindProcessingCount() {
      return [
        ...next.cliOutput.matchAll(
          /\[@tailwindcss\/postcss\] app\/globals.css/g
        ),
      ].length
    }

    expect(getTailwindProcessingCount()).toBe(1) // initial

    if (isNextDev) {
      await next.patchFile(
        'app/page.tsx',
        (content) => content.replace('hello world', 'hello hmr'),
        async () => {
          await retry(async () => {
            expect(await browser.elementByCss('p').text()).toBe('hello hmr')
            expect(getTailwindProcessingCount()).toBe(2) // dev: initial + hmr
          })
        }
      )
      // Wait for the patchFile revert to get processed
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('hello world')
      })
    }

    if (isNextDev) {
      expect(getTailwindProcessingCount()).toBe(3) // dev: initial + hmr + hmr (revert)
    } else {
      expect(getTailwindProcessingCount()).toBe(1) // build
    }
  })
})
