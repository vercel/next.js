import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Image Component No IntersectionObserver test', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('SSR Lazy Loading Tests', () => {
    it('should automatically load images if observer does not exist', async () => {
      const browser = await next.browser('/no-observer')

      await retry(async () => {
        const result = await browser.eval('IntersectionObserver')
        expect(result).toBeNull()
      })

      expect(
        await browser.elementById('lazy-no-observer').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000'
      )
      expect(
        await browser.elementById('lazy-no-observer').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000 2x'
      )
    })
  })

  describe('Client-side Lazy Loading Tests', () => {
    it('should automatically load images if observer does not exist', async () => {
      const browser = await next.browser('/')

      await retry(async () => {
        const result = await browser.eval('IntersectionObserver')
        expect(result).toBeNull()
      })

      await browser.waitForElementByCss('#link-no-observer').click()

      await retry(async () => {
        expect(
          await browser.elementById('lazy-no-observer').getAttribute('src')
        ).toBe(
          'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000'
        )
        expect(
          await browser.elementById('lazy-no-observer').getAttribute('srcset')
        ).toBe(
          'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000 2x'
        )
      })
    })
  })
})
