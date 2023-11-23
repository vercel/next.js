import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'edge-route-rewrite',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('it should support a rewrite to an edge route', async () => {
      const result = await next.render('/one/example')
      expect(result).toContain('Hello from /app/two/example/route.ts')
    })

    it('it should support a rewrite to a dynamic edge route', async () => {
      const result = await next.render('/dynamic-test/foo')
      expect(result).toContain(
        'Hello from /app/dynamic/[slug]/route.ts. Slug: foo'
      )
    })
  }
)
