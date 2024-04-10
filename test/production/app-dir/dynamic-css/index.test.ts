import { createNextDescribe } from 'e2e-utils'
import { retry } from 'next-test-utils'

createNextDescribe(
  'app dir - dynamic css',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should preload css of dynamic component during SSR', async () => {
      const $ = await next.render$('/ssr')
      const cssLinks = $('link[rel="stylesheet"]')
      expect(cssLinks.attr('href')).toContain('.css')
    })

    it('should only apply corresponding css for page loaded that /ssr', async () => {
      const browser = await next.browser('/ssr')
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('.text')).color`
          )
        ).toBe('rgb(255, 0, 0)')
        // Default border width, which is not effected by bar.css that is not loaded in /ssr
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('.text')).borderWidth`
          )
        ).toBe('0px')
      })
    })

    it('should only apply corresponding css for page loaded that /another', async () => {
      const browser = await next.browser('/another')
      await retry(async () => {
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('.text')).color`
          )
        ).not.toBe('rgb(255, 0, 0)')
        // Default border width, which is not effected by bar.css that is not loaded in /ssr
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('.text')).borderWidth`
          )
        ).toBe('1px')
      })
    })
  }
)
