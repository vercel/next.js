import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir similar pages paths',
  {
    files: __dirname,
    // TODO: enable development test
    skipDeployment: true,
  },
  ({ next }) => {
    it('should redirect route when requesting it directly', async () => {
      const res1 = await next.fetch('/')
      expect(res1.status).toBe(200)
      expect(await res1.text()).toContain('(app/page.js)')

      const res2 = await next.fetch('/page')
      expect(res2.status).toBe(200)
      expect(await res2.text()).toContain('(pages/page.js)')
    })
  }
)
