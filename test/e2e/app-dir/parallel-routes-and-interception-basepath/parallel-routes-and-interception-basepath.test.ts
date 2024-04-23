import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-routes-and-interception-basepath',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should show parallel intercepted slot with basepath', async () => {
      const browser = await next.browser('/base')
      await browser.elementByCss('#link-to-nested').click()
      const homePage = await browser.elementByCss('#home-page').text()
      const slot = await browser.elementByCss('#nested-page-slot').text()
      expect(homePage).toBe('Home page')
      expect(slot).toBe('Nested Page Slot')
    })
    it('should show normal route via direct link with basepath when parallel intercepted slot exist', async () => {
      const browser = await next.browser('/base/nested')
      const nestedPageFull = await browser
        .elementByCss('#nested-page-full')
        .text()
      expect(nestedPageFull).toBe('Nested Page Full')
    })
  }
)
