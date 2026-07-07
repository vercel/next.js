import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { listClientChunks, retry } from 'next-test-utils'

describe('turbopack-chunk-names-disabled', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should load the dynamically imported module', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#widget').text()).toBe(
        'my widget loaded'
      )
    })
  })

  if (isTurbopack) {
    it('should not apply the chunk name magic comment when the flag is not enabled', async () => {
      if (isNextDev) {
        const browser = await next.browser('/')
        await retry(async () => {
          expect(await browser.elementByCss('#widget').text()).toBe(
            'my widget loaded'
          )
        })

        const urls: string[] = await browser.eval(
          `performance.getEntriesByType('resource').map((entry) => entry.name)`
        )
        expect(urls.some((url) => url.includes('my-widget'))).toBe(false)
      } else {
        const chunks = await listClientChunks(path.join(next.testDir, '.next'))
        expect(chunks.some((chunk) => chunk.includes('my-widget'))).toBe(false)
      }
    })
  }
})
