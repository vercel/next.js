import { createNextDescribe } from 'e2e-utils'
import {
  withRequestMeta,
  getRequestMeta,
  cookieWithRequestMeta,
} from './helpers'
import { Readable } from 'stream'
import { check } from 'next-test-utils'

createNextDescribe(
  'app-custom-routes',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextStart }) => {
    describe('works with api prefix correctly', () => {
      it('statically generates correctly with no dynamic usage', async () => {
        if (isNextStart) {
          expect(
            await next.readFile('.next/server/app/api/hello.json.body')
          ).toBeTruthy()
          expect(
            await next.readFile('.next/server/app/api/hello.json.meta')
          ).toBeTruthy()
        }
        expect(JSON.parse(await next.render('/api/hello.json'))).toEqual({
          pathname: '/api/hello.json',
        })
      })

      it('does not statically generate with dynamic usage', async () => {
        if (isNextStart) {
          expect(
            await next
              .readFile('.next/server/app/api/dynamic.body')
              .catch(() => '')
          ).toBeFalsy()
          expect(
            await next
              .readFile('.next/server/app/api/dynamic.meta')
              .catch(() => '')
          ).toBeFalsy()
        }
        expect(JSON.parse(await next.render('/api/dynamic'))).toEqual({
          pathname: '/api/dynamic',
          query: {},
        })
      })
    })

    describe('works with generateStaticParams correctly', () => {
      it.each([
        '/static/first/data.json',
        '/static/second/data.json',
        '/static/three/data.json',
      ])('responds correctly on %s', async (path) => {
        expect(JSON.parse(await next.render(path))).toEqual({
          params: { slug: path.split('/')[2] },
          now: expect.any(Number),
        })
        if (isNextStart) {
          await check(async () => {
            expect(
              await next.readFile(`.next/server/app/${path}.body`)
            ).toBeTruthy()
            expect(
              await next.readFile(`.next/server/app/${path}.meta`)
            ).toBeTruthy()
            return 'success'
          }, 'success')
        }
      })

      it.each([
        '/revalidate-1/first/data.json',
        '/revalidate-1/second/data.json',
        '/revalidate-1/three/data.json',
      ])('revalidates correctly on %s', async (path) => {
        const data = JSON.parse(await next.render(path))
        expect(data).toEqual({
          params: { slug: path.split('/')[2] },
          now: expect.any(Number),
        })

        await check(async () => {
          expect(data).not.toEqual(JSON.parse(await next.render(path)))
          return 'success'
        }, 'success')

        if (isNextStart) {
          await check(async () => {
            expect(
              await next.readFile(`.next/server/app/${path}.body`)
            ).toBeTruthy()
            expect(
              await next.readFile(`.next/server/app/${path}.meta`)
            ).toBeTruthy()
            return 'success'
          }, 'success')
        }
      })
    })

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

      describe('request', () => {
        it('can read query parameters', async () => {
          const res = await next.fetch('/advanced/query?ping=pong')

          expect(res.status).toEqual(200)
          const meta = getRequestMeta(res.headers)
          expect(meta.ping).toEqual('pong')
        })
      })

      describe('response', () => {
        // TODO-APP: re-enable when rewrites are supported again
        it.skip('supports the NextResponse.rewrite() helper', async () => {
          const res = await next.fetch('/hooks/rewrite')

          expect(res.status).toEqual(200)

          // This is running in the edge runtime, so we expect not to see this
          // header.
          expect(res.headers.has('x-middleware-rewrite')).toBeFalse()
          expect(await res.text()).toContain('hello, world')
        })

        it('supports the NextResponse.redirect() helper', async () => {
          const res = await next.fetch('/hooks/redirect/response', {
            // "Manually" perform the redirect, we want to inspect the
            // redirection response, so don't actually follow it.
            redirect: 'manual',
          })

          expect(res.status).toEqual(307)
          expect(res.headers.get('location')).toEqual('https://nextjs.org/')
          expect(await res.text()).toBeEmpty()
        })

        it('supports the NextResponse.json() helper', async () => {
          const meta = { ping: 'pong' }
          const res = await next.fetch('/hooks/json', {
            headers: withRequestMeta(meta),
          })

          expect(res.status).toEqual(200)
          expect(res.headers.get('content-type')).toEqual('application/json')
          expect(await res.json()).toEqual(meta)
        })
      })
    })

    describe('body', () => {
      // we can't stream a body to a function currently only stream response
      if (!(global as any).isNextDeploy) {
        it('can handle handle a streaming request and streaming response', async () => {
          const body = new Array(10).fill(JSON.stringify({ ping: 'pong' }))
          let index = 0
          const stream = new Readable({
            read() {
              if (index >= body.length) return this.push(null)

              this.push(body[index] + '\n')
              index++
            },
          })

          const res = await next.fetch('/advanced/body/streaming', {
            method: 'POST',
            body: stream,
          })

          expect(res.status).toEqual(200)
          expect(await res.text()).toEqual(body.join('\n') + '\n')
        })
      }

      it('can read a JSON encoded body', async () => {
        const body = { ping: 'pong' }
        const res = await next.fetch('/advanced/body/json', {
          method: 'POST',
          body: JSON.stringify(body),
        })

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.body).toEqual(body)
      })

      // we can't stream a body to a function currently only stream response
      if (!(global as any).isNextDeploy) {
        it('can read a streamed JSON encoded body', async () => {
          const body = { ping: 'pong' }
          const encoded = JSON.stringify(body)
          let index = 0
          const stream = new Readable({
            async read() {
              if (index >= encoded.length) return this.push(null)

              this.push(encoded[index])
              index++
            },
          })
          const res = await next.fetch('/advanced/body/json', {
            method: 'POST',
            body: stream,
          })

          expect(res.status).toEqual(200)
          const meta = getRequestMeta(res.headers)
          expect(meta.body).toEqual(body)
        })
      }

      it('can read the text body', async () => {
        const body = 'hello, world'
        const res = await next.fetch('/advanced/body/text', {
          method: 'POST',
          body,
        })

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.body).toEqual(body)
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

      it('responds with 500 (Internal Server Error) when the handler calls NextResponse.next()', async () => {
        const error =
          'https://nextjs.org/docs/messages/next-response-next-in-app-route-handler'

        // Precondition. We shouldn't have seen this before. This ensures we're
        // testing that the specific route throws this error in the console.
        expect(next.cliOutput).not.toContain(error)

        const res = await next.fetch('/status/500/next')

        expect(res.status).toEqual(500)
        expect(await res.text()).toBeEmpty()

        if (!(global as any).isNextDeploy) {
          await check(() => {
            expect(next.cliOutput).toContain(error)
            return 'yes'
          }, 'yes')
        }
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

    describe('edge functions', () => {
      it('returns response using edge runtime', async () => {
        const res = await next.fetch('/edge')

        expect(res.status).toEqual(200)
        expect(await res.text()).toContain('hello, world')
      })
    })

    if (isNextDev) {
      describe('lowercase exports', () => {
        it.each([
          ['get'],
          ['head'],
          ['options'],
          ['post'],
          ['put'],
          ['delete'],
          ['patch'],
        ])(
          'should print an error when using lowercase %p in dev',
          async (method: string) => {
            await next.fetch('/lowercase/' + method)

            await check(() => {
              expect(next.cliOutput).toContain(
                `Detected lowercase method '${method}' in`
              )
              expect(next.cliOutput).toContain(
                `Export the uppercase '${method.toUpperCase()}' method name to fix this error.`
              )
              expect(next.cliOutput).toMatch(
                /Detected lowercase method '.+' in '.+\/route\.ts'\. Export the uppercase '.+' method name to fix this error\./
              )
              return 'yes'
            }, 'yes')
          }
        )
      })
    }
  }
)
