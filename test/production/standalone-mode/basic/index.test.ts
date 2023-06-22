import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'standalone mode - metadata routes',
  {
    files: __dirname,
    dependencies: {
      swr: 'latest',
    },
  },
  ({ next }) => {
    beforeAll(async () => {
      // Hide source files to make sure route.js can read files from source
      // in order to hit the prerender cache
      await next.renameFolder('app', 'app_hidden')
    })

    it('should handle metadata icons correctly', async () => {
      const faviconRes = await next.fetch('/favicon.ico')
      const iconRes = await next.fetch('/icon.svg')
      expect(faviconRes.status).toBe(200)
      expect(iconRes.status).toBe(200)
    })

    it('should handle correctly not-found.js', async () => {
      const res = await next.fetch('/not-found/does-not-exist')
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toContain('app-not-found')
    })

    it('should handle private _next unmatched route correctly', async () => {
      const res = await next.fetch('/_next/does-not-exist')
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toContain('app-not-found')
    })

    it('should handle pages rendering correctly', async () => {
      const browser = await next.browser('/hello')
      expect(await browser.elementByCss('#content').text()).toBe('hello-bar')
    })
  }
)
