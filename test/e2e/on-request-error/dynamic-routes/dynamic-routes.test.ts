import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

describe('on-request-error - dynamic-routes', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const outputLogPath = 'output-log.json'

  async function getErrorRecord({ errorMessage }: { errorMessage: string }) {
    // Assert the instrumentation is called
    await retry(async () => {
      const recordLogLines = next.cliOutput
        .split('\n')
        .filter((log) => log.includes('[instrumentation] write-log'))
      expect(recordLogLines).toEqual(
        expect.arrayContaining([expect.stringContaining(errorMessage)])
      )
      // TODO: remove custom duration in case we increase the default.
    }, 5000)

    const json = await getOutputLogJson(next, outputLogPath)
    const record = json[errorMessage]

    return record
  }

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  describe('app router', () => {
    it('should catch app router dynamic page error with search params', async () => {
      await next.fetch('/app-page/dynamic/123?apple=dope')
      const record = await getErrorRecord({
        errorMessage: 'server-dynamic-page-node-error',
      })
      expect(record).toMatchObject({
        payload: {
          message: 'server-dynamic-page-node-error',
          request: {
            path: '/app-page/dynamic/123?apple=dope',
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
      await next.fetch('/app-route/dynamic/123?apple=dope')
      const record = await getErrorRecord({
        errorMessage: 'server-dynamic-route-node-error',
      })
      expect(record).toMatchObject({
        payload: {
          message: 'server-dynamic-route-node-error',
          request: {
            path: '/app-route/dynamic/123?apple=dope',
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
      await next.fetch('/app-page/suspense')
      const record = await getErrorRecord({
        errorMessage: 'server-suspense-page-node-error',
      })

      expect(record).toMatchObject({
        payload: {
          message: 'server-suspense-page-node-error',
          request: {
            path: '/app-page/suspense',
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
      await next.fetch('/pages-page/dynamic/123?apple=dope')
      const record = await getErrorRecord({
        errorMessage: 'pages-page-node-error',
      })

      expect(record).toMatchObject({
        payload: {
          message: 'pages-page-node-error',
          request: {
            path: '/pages-page/dynamic/123?apple=dope',
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
      await next.fetch('/api/dynamic/123?apple=dope')
      const record = await getErrorRecord({
        errorMessage: 'pages-api-node-error',
      })

      expect(record).toMatchObject({
        payload: {
          message: 'pages-api-node-error',
          request: {
            path: '/api/dynamic/123?apple=dope',
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
