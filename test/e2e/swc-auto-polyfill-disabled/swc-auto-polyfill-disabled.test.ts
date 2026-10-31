import { nextTestSetup } from 'e2e-utils'
import { listClientChunks, retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

describe('swc-auto-polyfill-disabled', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page correctly without swcEnvOptions', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      const text = await browser.elementByCss('#result').text()
      expect(text).toBe('a_b_c')
    })
  })

  if (!isNextDev && !isNextDeploy) {
    it('should not include replaceAll polyfill in non-framework chunks', async () => {
      const jsFiles = (
        await listClientChunks(path.join(next.testDir, next.distDir))
      ).filter((f) => f.endsWith('.js'))

      for (const file of jsFiles) {
        const content = fs.readFileSync(
          path.join(next.testDir, next.distDir, file),
          'utf-8'
        )
        // Skip the built-in polyfill-nomodule chunk (contains core-js license URL)
        if (content.includes('core-js/blob/')) continue

        // Without swcEnvOptions, no replaceAll polyfill should be injected
        expect(content).not.toMatch(/replaceAll[:]\s*function/)
      }
    })
  }
})
