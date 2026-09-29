import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { randomUUID } from 'node:crypto'

describe('on-request-error - dynamic-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    captureRuntimeLogs: true,
  })

  async function getErrorRecord(path: string, errorMessage: string) {
    const url = new URL(path, next.url)
    url.searchParams.set('requestId', randomUUID())
    const requestPath = url.pathname + url.search
    await next.fetch(requestPath)

    const record = await retry(() => {
      const records = [
        ...next.cliOutput.matchAll(/<request-error>(.*?)<\/request-error>/g),
      ].map((match) => JSON.parse(match[1]))
      const payload = records.find(
        (entry) =>
          entry.message === errorMessage && entry.request.path === requestPath
      )
      expect(payload).toBeDefined()
      return { payload }
    }, 30_000)

    return { record, requestPath }
  }

  describe('app router', () => {
    it('should catch app router dynamic page error with search params', async () => {
      const { record, requestPath } = await getErrorRecord(
        '/app-page/dynamic/123?apple=dope',
        'server-dynamic-page-node-error'
      )
      expect(record).toMatchObject({
        payload: {
          message: 'server-dynamic-page-node-error',
          request: {
            path: requestPath,
          },
          context: {
            routerKind: 'App Router',
            routeType: 'render',
            routePath: '/app-page/dynamic/[id]',
          },
        },
      })
    })

    it('should catch app router dynamic routes error with search params', async () => {
      const { record, requestPath } = await getErrorRecord(
        '/app-route/dynamic/123?apple=dope',
        'server-dynamic-route-node-error'
      )
      expect(record).toMatchObject({
        payload: {
          message: 'server-dynamic-route-node-error',
          request: {
            path: requestPath,
          },
          context: {
            routerKind: 'App Router',
            routeType: 'route',
            routePath: '/app-route/dynamic/[id]',
          },
        },
      })
    })

    it('should catch suspense rendering page error in node runtime', async () => {
      const { record, requestPath } = await getErrorRecord(
        '/app-page/suspense',
        'server-suspense-page-node-error'
      )

      expect(record).toMatchObject({
        payload: {
          message: 'server-suspense-page-node-error',
          request: {
            path: requestPath,
          },
          context: {
            routerKind: 'App Router',
            routeType: 'render',
            routePath: '/app-page/suspense',
          },
        },
      })
    })
  })

  describe('pages router', () => {
    it('should catch pages router dynamic page error with search params', async () => {
      const { record, requestPath } = await getErrorRecord(
        '/pages-page/dynamic/123?apple=dope',
        'pages-page-node-error'
      )

      expect(record).toMatchObject({
        payload: {
          message: 'pages-page-node-error',
          request: {
            path: requestPath,
          },
          context: {
            routerKind: 'Pages Router',
            routeType: 'render',
            routePath: '/pages-page/dynamic/[id]',
          },
        },
      })
    })

    it('should catch pages router dynamic API route error with search params', async () => {
      const { record, requestPath } = await getErrorRecord(
        '/api/dynamic/123?apple=dope',
        'pages-api-node-error'
      )

      expect(record).toMatchObject({
        payload: {
          message: 'pages-api-node-error',
          request: {
            path: requestPath,
          },
          context: {
            routerKind: 'Pages Router',
            routeType: 'route',
            routePath: '/api/dynamic/[id]',
          },
        },
      })
    })
  })
})
