import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('revalidatePath with rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    buildArgs: [
      '--debug-build-paths',
      isCacheComponentsEnabled
        ? '!app/legacy/**/*'
        : '!app/cache-components/**/*',
    ],
  })

  describe('static page', () => {
    it('should revalidate a static page that was rewritten', async () => {
      const browser = await next.browser('/static')
      const initialRandomData = await browser.elementById('random-data').text()

      expect(initialRandomData).toBeTruthy()

      // Verify the data is cached after refresh
      await browser.refresh()
      const refreshedRandomData = await browser
        .elementById('random-data')
        .text()
      expect(refreshedRandomData).toBe(initialRandomData)

      // Trigger revalidation via route handler
      const revalidateRes = await next.fetch('/api/revalidate?path=/static')
      expect(revalidateRes.status).toBe(200)

      // Verify the data changed after revalidation
      await retry(async () => {
        await browser.refresh()
        const randomData = await browser.elementById('random-data').text()
        expect(randomData).not.toBe(initialRandomData)
      })
    })
  })

  describe('dynamic page', () => {
    it('should revalidate a dynamic page that was rewritten', async () => {
      const browser = await next.browser('/dynamic')
      const initialRandomData = await browser.elementById('random-data').text()

      expect(initialRandomData).toBeTruthy()

      // Verify the data is cached after refresh
      await browser.refresh()
      const refreshedRandomData = await browser
        .elementById('random-data')
        .text()
      expect(refreshedRandomData).toBe(initialRandomData)

      // Trigger revalidation via route handler
      const revalidateRes = await next.fetch('/api/revalidate?path=/dynamic')
      expect(revalidateRes.status).toBe(200)

      // Verify the data changed after revalidation
      await retry(async () => {
        await browser.refresh()
        const randomData = await browser.elementById('random-data').text()
        expect(randomData).not.toBe(initialRandomData)
      })
    })
  })
})
