import { createNextDescribe } from 'e2e-utils'
import webdriver from 'next-webdriver'

createNextDescribe(
  'i18n with middleware',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that need a full browser
    it('should work using browser', async () => {
      let browser
      try {
        browser = await webdriver(next.url, '/nl/a')
        expect(await browser.elementByCss('p').text()).toBe('nl')
        await browser.elementByCss('a').click()
        expect(await browser.url()).toEndWith('/nl/b')
        expect(await browser.elementByCss('p').text()).toBe('nl')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  }
)
