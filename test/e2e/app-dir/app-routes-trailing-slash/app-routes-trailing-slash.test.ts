import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-routes-trailing-slash',
  {
    files: __dirname,
  },
  ({ next }) => {
    it.each(['edge', 'node'])(
      'should handle trailing slash for %s runtime',
      async (runtime) => {
        let res = await next.fetch(`/runtime/${runtime}`, {
          redirect: 'manual',
        })

        expect(res.status).toEqual(308)
        expect(res.headers.get('location')).toEndWith(`/runtime/${runtime}/`)

        res = await next.fetch(`/runtime/${runtime}/`, {
          redirect: 'manual',
        })

        expect(res.status).toEqual(200)
        await expect(res.json()).resolves.toEqual({
          url: `/runtime/${runtime}/`,
          nextUrl: `/runtime/${runtime}/`,
        })
      }
    )
  }
)
