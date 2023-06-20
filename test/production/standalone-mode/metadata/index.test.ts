import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'standalone mode - metadata routes',
  {
    files: __dirname,
  },
  ({ next }) => {
    beforeAll(async () => {
      // Hide source files to make sure route.js can read files from source
      // in order to hit the prerender cache
      await next.renameFolder('app', 'app_hidden')
    })

    it('should work', async () => {
      const faviconRes = await next.fetch('/favicon.ico')
      const iconRes = await next.fetch('/icon.svg')
      expect(faviconRes.status).toBe(200)
      expect(iconRes.status).toBe(200)
    })
  }
)
