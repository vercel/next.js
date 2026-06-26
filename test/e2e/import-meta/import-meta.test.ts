import { nextTestSetup } from 'e2e-utils'

describe('import-meta', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  describe('import.meta.url', () => {
    it('should work on the server', async () => {
      const $ = await next.render$('/')
      const testData = $('#test-data').text()
      const data = JSON.parse(testData)

      if (isTurbopack) {
        expect(data.url).toStartWith('file:///')
        expect(data.url).toEndWith('/pages/index.tsx')
      } else {
        expect(data.url).toStartWith('file:///')
        expect(data.url).toEndWith('/pages/index.tsx')
      }
    })

    it('should work in browser', async () => {
      const browser = await next.browser('/')
      const testData = await browser.elementByCss('#test-data').text()
      const data = JSON.parse(testData)

      if (isTurbopack) {
        expect(data.url).toBe('file:///ROOT/pages/index.tsx')
      } else {
        expect(data.url).toStartWith('file:///')
        expect(data.url).toEndWith('/pages/index.tsx')
      }
    })
  })
})
