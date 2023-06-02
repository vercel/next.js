import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir similar pages paths',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should not have conflicts for similar pattern page paths between app and pages', async () => {
      // pages/page and app/page
      const res1 = await next.fetch('/')
      expect(res1.status).toBe(200)
      expect(await res1.text()).toContain('(app/page.js)')

      const res2 = await next.fetch('/page')
      expect(res2.status).toBe(200)
      expect(await res2.text()).toContain('(pages/page.js)')
    })
  }
)
