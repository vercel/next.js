import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'route-page-manifest-bug',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    it('should work when requesting route handler after page', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('#page-title').text()).toBe(
        'Page that would break'
      )
      await browser.eval('window.location.href = "/abc"')
      await check(
        () => browser.eval('document.body.textContent'),
        '{"url":"https://www.example.com"}'
      )
      await browser.refresh()
      await check(
        () => browser.eval('document.body.textContent'),
        '{"url":"https://www.example.com"}'
      )
      await browser.refresh()
      await check(
        () => browser.eval('document.body.textContent'),
        '{"url":"https://www.example.com"}'
      )
      await browser.refresh()
      await check(
        () => browser.eval('document.body.textContent'),
        '{"url":"https://www.example.com"}'
      )

      await browser.back()
      expect(await browser.waitForElementByCss('#page-title').text()).toBe(
        'Page that would break'
      )
      await browser.refresh()
      expect(await browser.waitForElementByCss('#page-title').text()).toBe(
        'Page that would break'
      )
      await browser.refresh()
      expect(await browser.waitForElementByCss('#page-title').text()).toBe(
        'Page that would break'
      )
    })
  }
)
