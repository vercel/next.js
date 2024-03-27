import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir parallel-routes-static',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should static generate parallel routes', async () => {
      expect(await next.hasFile('.next/server/app/nested/foo.html')).toBe(true)
      expect(await next.hasFile('.next/server/app/nested/foo.meta')).toBe(true)
      expect(await next.hasFile('.next/server/app/nested/foo.rsc')).toBe(true)

      expect(await next.hasFile('.next/server/app/nested/bar.html')).toBe(true)
      expect(await next.hasFile('.next/server/app/nested/bar.meta')).toBe(true)
      expect(await next.hasFile('.next/server/app/nested/bar.rsc')).toBe(true)
    })
  }
)
