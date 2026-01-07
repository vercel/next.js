import { nextTestSetup } from 'e2e-utils'
import { check, waitFor, retry } from 'next-test-utils'
import { Readable } from 'stream'

import {
  withRequestMeta,
  getRequestMeta,
  cookieWithRequestMeta,
} from './helpers'

const basePath = process.env.BASE_PATH ?? ''

describe('app-custom-routes', () => {
  const { next, isNextDeploy, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    dependencies: {
      // pin with repo's version of node-fetch
      '@types/node-fetch': '2.6.1',
    },
  })

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
      expect(
        JSON.parse(await next.render(basePath + '/api/hello.json'))
      ).toEqual({
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
      expect(JSON.parse(await next.render(basePath + '/api/dynamic'))).toEqual({
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
      expect(JSON.parse(await next.render(basePath + path))).toEqual({
        params: { slug: path.split('/', 3)[2] },
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
      const data = JSON.parse(await next.render(basePath + path))
      expect(data).toEqual({
        params: { slug: path.split('/', 3)[2] },
        now: expect.any(Number),
      })

      await check(async () => {
        expect(data).not.toEqual(JSON.parse(await next.render(basePath + path)))
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
            const res = await next.fetch(basePath + path, { method })

            expect(res.status).toEqual(200)
            expect(await res.text()).toContain('hello, world')

            const meta = getRequestMeta(res.headers)
            expect(meta.method).toEqual(method)
          }
        )
      }
    )

    describe.each(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'])(
      'abort via a %s request',
      (method) => {
        it.each(['/basic/endpoint', '/basic/vercel/endpoint'])(
          'aborts without error on %s',
          async (path) => {
            const outputIdx = next.cliOutput.length
            const controller = new AbortController()

            const resProm = next
              .fetch(basePath + path, {
                method,
                signal: controller.signal,
              })
              .catch((err) => err)

            setTimeout(() => {
              controller.abort()
            }, 10)

            await resProm

            for (let i = 0; i < 3; i++) {
              await waitFor(1000)
              const trimmedOutput = next.cliOutput.substring(outputIdx)
              expect(trimmedOutput).not.toContain('Error')
              expect(trimmedOutput).not.toContain(
                'should not be disturbed or locked'
              )
            }
          }
        )
      }
    )

    describe('route groups', () => {
      it('routes to the correct handler', async () => {
        const res = await next.fetch(basePath + '/basic/endpoint/nested')

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.pathname).toEqual('/basic/endpoint/nested')
      })
    })

    describe('request', () => {
      it('can read query parameters', async () => {
        const res = await next.fetch(basePath + '/advanced/query?ping=pong')

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.ping).toEqual('pong')
      })

      it('can read query parameters (edge)', async () => {
        const res = await next.fetch(
          basePath + '/edge/advanced/query?ping=pong'
        )

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.ping).toEqual('pong')
      })
    })

    describe('response', () => {
      // TODO-APP: re-enable when rewrites are supported again
      it.skip('supports the NextResponse.rewrite() helper', async () => {
        const res = await next.fetch(basePath + '/hooks/rewrite')

        expect(res.status).toEqual(200)

        // This is running in the edge runtime, so we expect not to see this
        // header.
        expect(res.headers.has('x-middleware-rewrite')).toBeFalse()
        expect(await res.text()).toContain('hello, world')
      })

      it('supports the NextResponse.redirect() helper', async () => {
        const res = await next.fetch(basePath + '/hooks/redirect/response', {
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
        const res = await next.fetch(basePath + '/hooks/json', {
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
    if (!isNextDeploy) {
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

        const res = await next.fetch(basePath + '/advanced/body/streaming', {
          method: 'POST',
          body: stream,
        })

        expect(res.status).toEqual(200)
        expect(await res.text()).toEqual(body.join('\n') + '\n')
      })
    }

    it('can handle handle a streaming request and streaming response (edge)', async () => {
      const body = new Array(10).fill(JSON.stringify({ ping: 'pong' }))
      let index = 0
      const stream = new Readable({
        read() {
          if (index >= body.length) return this.push(null)

          this.push(body[index] + '\n')
          index++
        },
      })

      const res = await next.fetch(basePath + '/edge/advanced/body/streaming', {
        method: 'POST',
        body: stream,
      })

      expect(res.status).toEqual(200)
      expect(await res.text()).toEqual(body.join('\n') + '\n')
    })

    it('can read a JSON encoded body', async () => {
      const body = { ping: 'pong' }
      const res = await next.fetch(basePath + '/advanced/body/json', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      expect(res.status).toEqual(200)
      const meta = getRequestMeta(res.headers)
      expect(meta.body).toEqual(body)
    })

    it('can read a JSON encoded body (edge)', async () => {
      const body = { ping: 'pong' }
      const res = await next.fetch(basePath + '/edge/advanced/body/json', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      expect(res.status).toEqual(200)
      const meta = getRequestMeta(res.headers)
      expect(meta.body).toEqual(body)
    })

    it('can read a JSON encoded body for DELETE requests', async () => {
      const body = { name: 'foo' }
      const res = await next.fetch(basePath + '/advanced/body/json', {
        method: 'DELETE',
        body: JSON.stringify(body),
      })

      expect(res.status).toEqual(200)
      expect(await res.text()).toEqual('delete foo')
    })

    it('can read a JSON encoded body for OPTIONS requests', async () => {
      const body = { name: 'bar' }
      const res = await next.fetch(basePath + '/advanced/body/json', {
        method: 'OPTIONS',
        body: JSON.stringify(body),
      })

      expect(res.status).toEqual(200)
      expect(await res.text()).toEqual('options bar')
    })

    // we can't stream a body to a function currently only stream response
    if (!isNextDeploy) {
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
        const res = await next.fetch(basePath + '/advanced/body/json', {
          method: 'POST',
          body: stream,
        })

        expect(res.status).toEqual(200)
        const meta = getRequestMeta(res.headers)
        expect(meta.body).toEqual(body)
      })
    }

    it('can read a streamed JSON encoded body (edge)', async () => {
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
      const res = await next.fetch(basePath + '/edge/advanced/body/json', {
        method: 'POST',
        body: stream,
      })

      expect(res.status).toEqual(200)
      const meta = getRequestMeta(res.headers)
      expect(meta.body).toEqual(body)
    })

    it('can read the text body', async () => {
      const body = 'hello, world'
      const res = await next.fetch(basePath + '/advanced/body/text', {
        method: 'POST',
        body,
      })

      expect(res.status).toEqual(200)
      const meta = getRequestMeta(res.headers)
      expect(meta.body).toEqual(body)
    })

    it('can read the text body (edge)', async () => {
      const body = 'hello, world'
      const res = await next.fetch(basePath + '/edge/advanced/body/text', {
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
      const res = await next.fetch(basePath + '/basic/vercel/endpoint')

      expect(res.status).toEqual(200)
      const meta = getRequestMeta(res.headers)
      expect(meta.params).toEqual({ tenantID: 'vercel' })
    })

    it('provides params to routes with catch-all routes', async () => {
      const res = await next.fetch(
        basePath + '/basic/vercel/some/other/resource'
      )

      expect(res.status).toEqual(200)
      const meta = getRequestMeta(res.headers)
      expect(meta.params).toEqual({
        tenantID: 'vercel',
        resource: ['some', 'other', 'resource'],
      })
    })

    it('does not provide params to routes without dynamic parameters', async () => {
      const res = await next.fetch(basePath + '/basic/endpoint')

      expect(res.ok).toBeTrue()

      const meta = getRequestMeta(res.headers)
      expect(meta.params).toEqual(null)
    })
  })

  describe('hooks', () => {
    describe('headers', () => {
      it('gets the correct values', async () => {
        const res = await next.fetch(basePath + '/hooks/headers', {
          headers: withRequestMeta({ ping: 'pong' }),
        })

        expect(res.status).toEqual(200)

        const meta = getRequestMeta(res.headers)
        expect(meta.ping).toEqual('pong')
      })
    })

    describe('cookies', () => {
      it('gets the correct values', async () => {
        const res = await next.fetch(basePath + '/hooks/cookies', {
          headers: cookieWithRequestMeta({ ping: 'pong' }),
        })

        expect(res.status).toEqual(200)

        const meta = getRequestMeta(res.headers)
        expect(meta.ping).toEqual('pong')
      })
    })

    describe('req.cookies', () => {
      it('gets the correct values', async () => {
        const res = await next.fetch(basePath + '/hooks/cookies/req', {
          headers: cookieWithRequestMeta({ ping: 'pong' }),
        })

        expect(res.status).toEqual(200)

        const meta = getRequestMeta(res.headers)
        expect(meta.ping).toEqual('pong')
      })
    })

    describe('(await cookies()).has()', () => {
      it('gets the correct values', async () => {
        const res = await next.fetch(basePath + '/hooks/cookies/has')

        expect(res.status).toEqual(200)

        expect(await res.json()).toEqual({ hasCookie: true })
      })
    })

    describe('redirect', () => {
      it('can respond correctly', async () => {
        const res = await next.fetch(basePath + '/hooks/redirect', {
          // "Manually" perform the redirect, we want to inspect the
          // redirection response, so don't actually follow it.
          redirect: 'manual',
        })

        expect(res.status).toEqual(307)
        expect(res.headers.get('location')).toEqual('https://nextjs.org/')
        expect(await res.text()).toBeEmpty()
      })
    })

    describe('permanentRedirect', () => {
      it('can respond correctly', async () => {
        const res = await next.fetch(basePath + '/hooks/permanent-redirect', {
          // "Manually" perform the redirect, we want to inspect the
          // redirection response, so don't actually follow it.
          redirect: 'manual',
        })

        expect(res.status).toEqual(308)
        expect(res.headers.get('location')).toEqual('https://nextjs.org/')
        expect(await res.text()).toBeEmpty()
      })
    })

    describe('notFound', () => {
      it('can respond correctly in nodejs', async () => {
        const res = await next.fetch(basePath + '/hooks/not-found')

        expect(res.status).toEqual(404)
        expect(await res.text()).toBeEmpty()
      })

      it('can respond correctly in edge', async () => {
        const res = await next.fetch(basePath + '/hooks/not-found/edge')

        expect(res.status).toEqual(404)
        expect(await res.text()).toBeEmpty()
      })
    })
  })

  describe('error conditions', () => {
    it('responds with 400 (Bad Request) when the requested method is not a valid HTTP method', async () => {
      const res = await next.fetch(basePath + '/status/405', {
        method: 'HEADER',
      })

      expect(res.status).toEqual(400)
      expect(await res.text()).toBeEmpty()
    })

    it('responds with 405 (Method Not Allowed) when method is not implemented', async () => {
      const res = await next.fetch(basePath + '/status/405', {
        method: 'POST',
      })

      expect(res.status).toEqual(405)
      expect(await res.text()).toBeEmpty()
    })

    it('responds with 500 (Internal Server Error) when the handler throws an error', async () => {
      const res = await next.fetch(basePath + '/status/500')

      expect(res.status).toEqual(500)
      expect(await res.text()).toBeEmpty()
    })

    it('responds with 500 (Internal Server Error) when the handler calls NextResponse.next()', async () => {
      const error =
        'https://nextjs.org/docs/messages/next-response-next-in-app-route-handler'

      // Precondition. We shouldn't have seen this before. This ensures we're
      // testing that the specific route throws this error in the console.
      expect(next.cliOutput).not.toContain(error)

      const res = await next.fetch(basePath + '/status/500/next')

      expect(res.status).toEqual(500)
      expect(await res.text()).toBeEmpty()

      if (!isNextDeploy) {
        await check(() => {
          expect(next.cliOutput).toContain(error)
          return 'yes'
        }, 'yes')
      }
    })
  })

  describe('automatic implementations', () => {
    it('implements HEAD on routes with GET already implemented', async () => {
      const res = await next.fetch(basePath + '/methods/head', {
        method: 'HEAD',
      })

      expect(res.status).toEqual(200)
      expect(await res.text()).toBeEmpty()
    })

    it('implements OPTIONS on routes', async () => {
      const res = await next.fetch(basePath + '/methods/options', {
        method: 'OPTIONS',
      })

      expect(res.status).toEqual(204)
      expect(await res.text()).toBeEmpty()

      expect(res.headers.get('allow')).toEqual('OPTIONS, POST')
    })
  })

  describe('edge functions', () => {
    it('returns response using edge runtime', async () => {
      const res = await next.fetch(basePath + '/edge')

      expect(res.status).toEqual(200)
      expect(await res.text()).toContain('hello, world')
    })

    it('returns a response when headers are accessed', async () => {
      const meta = { ping: 'pong' }
      const res = await next.fetch(basePath + '/edge/headers', {
        headers: withRequestMeta(meta),
      })

      expect(res.status).toEqual(200)
      expect(await res.json()).toEqual(meta)
    })
  })

  describe('dynamic = "force-static"', () => {
    it('strips search, headers, and domain from request', async () => {
      const res = await next.fetch(basePath + '/dynamic?query=true', {
        headers: {
          accept: 'application/json',
          cookie: 'session=true',
        },
      })

      const url = 'http://localhost:3000/dynamic'

      expect(res.status).toEqual(200)
      expect(await res.json()).toEqual({
        nextUrl: {
          href: url,
          search: '',
          searchParams: null,
          clone: url,
        },
        req: {
          url,
          headers: null,
        },
        headers: null,
        cookies: null,
      })
    })
  })

  describe('customized metadata routes', () => {
    it('should work if conflict with metadata routes convention', async () => {
      const res = await next.fetch(basePath + '/robots.txt')

      expect(res.status).toEqual(200)
      expect(await res.text()).toBe(
        'User-agent: *\nAllow: /\n\nSitemap: https://www.example.com/sitemap.xml'
      )
    })
  })

  if (isNextDev) {
    describe('invalid exports', () => {
      beforeAll(async () => {
        await next.patchFile(
          'app/default/route.ts',
          `\
        export { GET as default } from '../../handlers/hello'
        `
        )
      })
      afterAll(async () => {
        await next.deleteFile('app/default/route.ts')
      })
      it('should print an error when exporting a default handler in dev', async () => {
        await check(async () => {
          const res = await next.fetch(basePath + '/default')

          // Ensure we get a 405 (Method Not Allowed) response when there is no
          // exported handler for the GET method.
          expect(res.status).toEqual(405)
          expect(next.cliOutput).toMatch(
            /Detected default export in '.+\/route\.ts'\. Export a named export for each HTTP method instead\./
          )
          expect(next.cliOutput).toMatch(
            /No HTTP methods exported in '.+\/route\.ts'\. Export a named export for each HTTP method\./
          )
          return 'yes'
        }, 'yes')
      })
    })
  }

  // This test is skipped in deploy mode because `next.cliOutput` will only contain build-time logs.
  if (!isNextDeploy) {
    describe('no response returned', () => {
      it('should print an error when no response is returned', async () => {
        await next.fetch(basePath + '/no-response', { method: 'POST' })
        await retry(() => {
          expect(next.cliOutput).toMatch(
            /No response is returned from route handler '.+\/route\.ts'\. Ensure you return a `Response` or a `NextResponse` in all branches of your handler\./
          )
        })
      })
    })
  }

  describe('no bundle error', () => {
    it('should not print bundling warning about React', async () => {
      const cliOutput = next.cliOutput
      expect(cliOutput).not.toContain('Attempted import error')
    })
  })
})
