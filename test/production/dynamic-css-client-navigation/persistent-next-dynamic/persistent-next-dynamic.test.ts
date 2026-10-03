import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic-css-client-navigation persistent next/dynamic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Reads the style directly: once its CSS is removed, the empty box has no
  // size, so visibility-based element helpers would time out instead.
  const getPersistentBoxColor = (browser: Playwright) =>
    browser.eval(
      `getComputedStyle(document.getElementById('persistent-box')).backgroundColor`
    )

  it.each(['edge', 'nodejs'])(
    'should keep CSS shared by a page and a next/dynamic component in _app after client navigation at runtime %s',
    async (runtime) => {
      const browser = await next.browser(`/${runtime}`)
      expect(await getPersistentBoxColor(browser)).toBe('rgb(255, 0, 0)')

      await browser.elementByCss('#to-other').click()
      await browser.waitForElementByCss('#other')
      await retry(async () => {
        expect(await getPersistentBoxColor(browser)).toBe('rgb(255, 0, 0)')
      })

      await browser.elementByCss(`#to-${runtime}`).click()
      await browser.waitForElementByCss('#home')
      await retry(async () => {
        expect(await getPersistentBoxColor(browser)).toBe('rgb(255, 0, 0)')
      })
    }
  )
})
