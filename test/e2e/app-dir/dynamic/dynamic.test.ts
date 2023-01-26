import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - next/dynamic',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle ssr: false in pages when appDir is enabled', async () => {
      const $ = await next.render$('/no-ssr')
      expect($.html()).not.toContain('navigator')

      const browser = await next.browser('/no-ssr')
      expect(
        await browser.waitForElementByCss('#pure-client').text()
      ).toContain('navigator')
    })
  }
)
