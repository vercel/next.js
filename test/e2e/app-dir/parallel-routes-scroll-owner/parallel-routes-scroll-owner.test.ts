import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe.each([false, true])(
  'parallel-routes-empty-fragment-scroll (appNewScrollHandler: %s)',
  (appNewScrollHandler) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: {
          appNewScrollHandler,
        },
      },
    })

    it('preserves scroll when an empty intercepted modal is the only changed slot', async () => {
      const browser = await next.browser('/modal')

      await browser.eval('window.scrollTo(0, 1200)')
      const initialScroll = await browser.eval('window.scrollY')
      expect(initialScroll).toBeGreaterThan(0)

      await browser.elementByCss('#open-empty-modal').click()
      await retry(async () => {
        expect(await browser.url()).toBe(`${next.url}/modal/open`)
      })

      await browser.eval(
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
      )
      expect(await browser.eval('window.scrollY')).toBe(initialScroll)
    })

    it('does not blur focus when the empty slot cannot handle scroll', async () => {
      const browser = await next.browser('/modal')

      await browser.eval(`
          window.scrollTo(0, 1200)
          document.getElementById('focus-target').focus({ preventScroll: true })
          document.getElementById('open-empty-modal').click()
        `)
      await retry(async () => {
        expect(await browser.url()).toBe(`${next.url}/modal/open`)
      })

      expect(await browser.eval('document.activeElement.id')).toBe(
        'focus-target'
      )
    })
  }
)
