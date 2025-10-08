import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('no-double-tailwind-execution', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      '@tailwindcss/postcss': '^4',
      tailwindcss: '^4',
    },
    env: {
      DEBUG: 'tailwindcss',
      ...process.env,
    },
  })

  if (skipped) {
    return
  }

  it('should run tailwind only once initially and per change', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    if (isNextDev) {
      const filePath = 'app/page.tsx'
      const origContent = await next.readFile(filePath)
      let getOutput = next.getCliOutputFromHere()
      await next.patchFile(
        filePath,
        origContent.replace('hello world', 'hello hmr'),
        async () => {
          await retry(async () => {
            expect(await browser.elementByCss('p').text()).toBe('hello hmr')
            let tailwindProcessingCount = [
              ...getOutput().matchAll(
                /\[@tailwindcss\/postcss\] app\/globals.css/g
              ),
            ].length
            expect(tailwindProcessingCount).toBe(1)
          })
        }
      )
    }
    let tailwindProcessingCount = [
      ...next.cliOutput.matchAll(/\[@tailwindcss\/postcss\] app\/globals.css/g),
    ].length
    if (isNextDev) {
      expect(tailwindProcessingCount).toBe(3) // dev: initial + hmr + hmr (revert)
    } else {
      expect(tailwindProcessingCount).toBe(1) // build
    }
  })
})
