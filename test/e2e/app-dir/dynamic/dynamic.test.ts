import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - next/dynamic',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should handle ssr: false in pages when appDir is enabled', async () => {
      const $ = await next.render$('/legacy/no-ssr')
      expect($.html()).not.toContain('navigator')

      const browser = await next.browser('/legacy/no-ssr')
      expect(
        await browser.waitForElementByCss('#pure-client').text()
      ).toContain('navigator')
    })

    it('should handle next/dynamic in SSR correctly', async () => {
      const $ = await next.render$('/dynamic')
      // filter out the script
      const selector = 'body div'
      const serverContent = $(selector).text()
      // should load chunks generated via async import correctly with React.lazy
      expect(serverContent).toContain('next-dynamic lazy')
      // should support `dynamic` in both server and client components
      expect(serverContent).toContain('next-dynamic dynamic on server')
      expect(serverContent).toContain('next-dynamic dynamic on client')
      expect(serverContent).toContain('next-dynamic server import client')
      expect(serverContent).not.toContain(
        'next-dynamic dynamic no ssr on client'
      )

      expect(serverContent).not.toContain(
        'next-dynamic dynamic no ssr on server'
      )

      // client component under server component with ssr: false will not be rendered either in flight or SSR
      expect($.html()).not.toContain('client component under sever no ssr')
    })

    it('should handle next/dynamic in hydration correctly', async () => {
      const selector = 'body div'
      const browser = await next.browser('/dynamic')
      const clientContent = await browser.elementByCss(selector).text()
      expect(clientContent).toContain('next-dynamic dynamic no ssr on server')
      expect(clientContent).toContain('client component under sever no ssr')
      await browser.waitForElementByCss('#css-text-dynamic-no-ssr-client')

      expect(
        await browser.elementByCss('#css-text-dynamic-no-ssr-client').text()
      ).toBe('next-dynamic dynamic no ssr on client:suffix')
    })
  }
)
