import { nextTestSetup } from 'e2e-utils'
import { listClientChunks, retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

describe('swc-auto-polyfill', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'core-js': '3.38.1',
    },
  })

  it('should render the page correctly with swcEnvOptions enabled', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      const text = await browser.elementByCss('#result').text()
      expect(text).toBe('a_b_c')
    })
  })

  if (!isNextDev && !isNextDeploy) {
    it('should include core-js polyfill in a chunk with user code', async () => {
      const jsFiles = (
        await listClientChunks(path.join(next.testDir, next.distDir))
      ).filter((f) => f.endsWith('.js'))

      // Find a chunk that contains BOTH the user code (a-b-c / a_b_c) AND
      // core-js polyfill artifacts. This proves SWC's usage-mode polyfill
      // injection is working: the user's page.tsx pulled in core-js modules
      // for String.prototype.replaceAll.
      let found = false
      for (const file of jsFiles) {
        const content = fs.readFileSync(
          path.join(next.testDir, next.distDir, file),
          'utf-8'
        )
        const hasUserCode =
          content.includes('a-b-c') || content.includes('a_b_c')
        const hasPolyfill =
          content.includes('replaceAll:function') ||
          content.includes('replaceAll: function')

        if (hasUserCode && hasPolyfill) {
          found = true
          break
        }
      }

      expect(found).toBe(true)
    })
  }
})
