import { createNextDescribe } from 'e2e-utils'
import {
  withRequestMeta,
  getRequestMeta,
  cookieWithRequestMeta,
} from './helpers'

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
          it.each(['/basic/endpoint', '/basic/vercel/endpoint'])(
            'responds correctly on %s',
            async (path) => {
              const res = await next.fetch(path, { method })

              expect(res.status).toEqual(200)
              expect(await res.text()).toContain('hello, world')

              const meta = getRequestMeta(res.headers)
              expect(meta.method).toEqual(method)
            }
          )
        }
      )

      describe('route groups', () => {
        it('routes to the correct handler', async () => {
          const res = await next.fetch('/basic/endpoint/nested')

          expect(res.status).toEqual(200)
          const meta = getRequestMeta(res.headers)
          expect(meta.pathname).toEqual('/basic/endpoint/nested')
        })
      })
    })

    describe('context', () => {
      it('provides params to routes with dynamic parameters', async () => {
        const res = await next.fetch('/basic/vercel/endpoint')

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.params).toEqual({ tenantID: 'vercel' })
      })

      it('provides params to routes with catch-all routes', async () => {
        const res = await next.fetch('/basic/vercel/some/other/resource')

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.params).toEqual({
          tenantID: 'vercel',
          resource: ['some', 'other', 'resource'],
        })
      })

      it('does not provide params to routes without dynamic parameters', async () => {
        const res = await next.fetch('/basic/endpoint')

        expect(res.ok).toBeTrue()

        const meta = getRequestMeta(res.headers)
        expect(meta.params).toEqual(null)
      })
    })

    describe('hooks', () => {
      describe('headers', () => {
        it('gets the correct values', async () => {
          const res = await next.fetch('/hooks/headers', {
            headers: withRequestMeta({ ping: 'pong' }),
          })

          expect(res.status).toEqual(200)

          const meta = getRequestMeta(res.headers)
          expect(meta.ping).toEqual('pong')
        })
      })

      describe('cookies', () => {
        it('gets the correct values', async () => {
          const res = await next.fetch('/hooks/cookies', {
            headers: cookieWithRequestMeta({ ping: 'pong' }),
          })

          expect(res.status).toEqual(200)

          const meta = getRequestMeta(res.headers)
          expect(meta.ping).toEqual('pong')
        })
      })

      describe('redirect', () => {
        it('can respond correctly', async () => {
          const res = await next.fetch('/hooks/redirect', {
            // "Manually" perform the redirect, we want to inspect the
            // redirection response, so don't actually follow it.
            redirect: 'manual',
          })

          expect(res.status).toEqual(302)
          expect(res.headers.get('location')).toEqual('https://nextjs.org/')
          expect(await res.text()).toBeEmpty()
        })
      })

      describe('notFound', () => {
        it('can respond correctly', async () => {
          const res = await next.fetch('/hooks/not-found')

          expect(res.status).toEqual(404)
          expect(await res.text()).toBeEmpty()
        })
      })
    })

    describe('error conditions', () => {
      it('responds with 400 (Bad Request) when the requested method is not a valid HTTP method', async () => {
        const res = await next.fetch('/status/405', { method: 'HEADER' })

        expect(res.status).toEqual(400)
        expect(await res.text()).toBeEmpty()
      })

      it('responds with 405 (Method Not Allowed) when method is not implemented', async () => {
        const res = await next.fetch('/status/405', { method: 'POST' })

        expect(res.status).toEqual(405)
        expect(await res.text()).toBeEmpty()
      })

      it('responds with 500 (Internal Server Error) when the handler throws an error', async () => {
        const res = await next.fetch('/status/500')

        expect(res.status).toEqual(500)
        expect(await res.text()).toBeEmpty()
      })
    })

    describe('automatic implementations', () => {
      it('implements HEAD on routes with GET already implemented', async () => {
        const res = await next.fetch('/methods/head', { method: 'HEAD' })

        expect(res.status).toEqual(200)
        expect(await res.text()).toBeEmpty()
      })

      it('implements OPTIONS on routes', async () => {
        const res = await next.fetch('/methods/options', { method: 'OPTIONS' })

        expect(res.status).toEqual(204)
        expect(await res.text()).toBeEmpty()

        expect(res.headers.get('allow')).toEqual(
          'DELETE, GET, HEAD, OPTIONS, POST'
        )
      })
    })
  }
)
