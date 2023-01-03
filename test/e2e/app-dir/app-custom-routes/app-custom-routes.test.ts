import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-custom-routes',
  {
    files: __dirname,
  },
  ({ next, isNextDev }) => {
    // TODO: handle next development server case
    if (isNextDev) return

    describe('basic fetch request with a response', () => {
      describe.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])(
        'made via a %s request',
        (method) => {
          it.each(['/basic/hello', '/basic/vercel/hello'])(
            'responds correctly on %s',
            async (path) => {
              const res = await next.fetch(path, { method })

              expect(res.ok).toBeTrue()
              expect(await res.text()).toContain('hello, world')
            }
          )
        }
      )
    })

    it('automatically implements HEAD on routes with GET already implemented', async () => {
      const res = await next.fetch('/basic/hello', { method: 'HEAD' })

      expect(res.ok).toBeTrue()
      expect(await res.text()).toBeEmpty()
      expect(res.headers.get('x-nextjs-requested-method')).toBe('HEAD')
    })
  }
)
