import { createNextDescribe } from 'e2e-utils'
import { getRequestMeta } from './app/helpers'

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

              const meta = getRequestMeta(res.headers)
              expect(meta).not.toBeNull()
              expect(meta.method).toEqual(method)
            }
          )
        }
      )
    })

    it('responds with 405 (Method Not Allowed) when method is not implemented', async () => {
      const res = await next.fetch('/basic/head', { method: 'POST' })

      expect(res.ok).toBeFalse()
      expect(res.status).toBe(405)
      expect(await res.text()).toBeEmpty()
    })

    it('automatically implements HEAD on routes with GET already implemented', async () => {
      const res = await next.fetch('/basic/head', { method: 'HEAD' })

      expect(res.ok).toBeTrue()
      expect(await res.text()).toBeEmpty()
    })

    it('automatically implements OPTIONS on routes', async () => {
      const res = await next.fetch('/basic/options', { method: 'OPTIONS' })

      expect(res.ok).toBeTrue()
      expect(res.status).toEqual(204)
      expect(await res.text()).toBeEmpty()

      const allow = res.headers.get('allow')
      expect(allow).toEqual('DELETE, GET, POST')
    })
  }
)
