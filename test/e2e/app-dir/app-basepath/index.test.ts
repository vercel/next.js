import { createNextDescribe } from 'e2e-utils'
import { retry } from 'next-test-utils'

createNextDescribe(
  'app dir - basepath',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      sass: 'latest',
    },
  },
  ({ next }) => {
    it('should successfully hard navigate from pages -> app', async () => {
      const browser = await next.browser('/base/pages-path')
      await browser.elementByCss('#to-another').click()
      await browser.waitForElementByCss('#page-2')
    })

    it('should support `basePath`', async () => {
      const html = await next.render('/base')
      expect(html).toContain('<h1>Test Page</h1>')
    })

    it('should support Link with basePath prefixed', async () => {
      const browser = await next.browser('/base')
      expect(
        await browser
          .elementByCss('a[href="/base/another"]')
          .click()
          .waitForElementByCss('#page-2')
          .text()
      ).toBe(`Page 2`)
    })

    it('should prefix metadata og image with basePath', async () => {
      const $ = await next.render$('/base/another')
      const ogImageHref = $('meta[property="og:image"]').attr('content')

      expect(ogImageHref).toContain('/base/another/opengraph-image.png')
    })

    it('should prefix redirect() with basePath', async () => {
      const browser = await next.browser('/base/redirect')
      await retry(async () => {
        expect(await browser.url()).toBe(`${next.url}/base/another`)
      })
    })

    it('should render usePathname without the basePath', async () => {
      const pathnames = ['/use-pathname', '/use-pathname-another']
      const validatorPromises = pathnames.map(async (pathname) => {
        const $ = await next.render$('/base' + pathname)
        expect($('#pathname').data('pathname')).toBe(pathname)
      })
      await Promise.all(validatorPromises)
    })

    it('should handle redirect in dynamic in suspense boundary routes with basePath', async () => {
      const browser = await next.browser('/base/dynamic/source')
      await retry(async () => {
        expect(await browser.url()).toBe(`${next.url}/base/dynamic/dest`)
        expect(await browser.elementByCss('p').text()).toBe(`id:dest`)
      })
    })
  }
)
