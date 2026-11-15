import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('on-request-error - basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const outputLogPath = 'output-log.json'

  async function validateErrorRecord({
    errorMessage,
    url,
    renderSource,
    requestHeaders,
  }: {
    errorMessage: string
    url: string
    renderSource: string | undefined
    requestHeaders?: Record<string, string>
  }) {
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

    const { payload } = record
    const { request } = payload

    expect(request.path).toBe(url)
    expect(record).toMatchObject({
      count: 1,
      payload: {
        message: errorMessage,
        request: {
          method: 'GET',
          headers: { accept: '*/*', ...requestHeaders },
        },
        ...(renderSource ? { context: { renderSource } } : undefined),
      },
    })
  }

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  describe('app router', () => {
    it('should catch server component page error in node runtime', async () => {
      await next.fetch('/server-page?source=node', {
        headers: { 'x-instrumentation-test': 'node' },
      })
      await validateErrorRecord({
        errorMessage: 'server-page-node-error',
        url: '/server-page?source=node',
        renderSource: 'react-server-components',
        requestHeaders: { 'x-instrumentation-test': 'node' },
      })
    })

    it('should catch server component page error in edge runtime', async () => {
      await next.fetch('/server-page/edge?source=edge', {
        headers: { 'x-instrumentation-test': 'edge' },
      })
      await validateErrorRecord({
        errorMessage: 'server-page-edge-error',
        url: '/server-page/edge?source=edge',
        renderSource: 'react-server-components',
        requestHeaders: { 'x-instrumentation-test': 'edge' },
      })
    })

    it('should catch client component page error in node runtime', async () => {
      await next.fetch('/client-page')
      await validateErrorRecord({
        errorMessage: 'client-page-node-error',
        url: '/client-page',
        renderSource: 'server-rendering',
      })
    })

    it('should catch client component page error in edge runtime', async () => {
      await next.fetch('/client-page/edge')

      await validateErrorRecord({
        errorMessage: 'client-page-edge-error',
        url: '/client-page/edge',
        renderSource: 'server-rendering',
      })
    })

    it('should catch app routes error in node runtime', async () => {
      await next.fetch('/app-route')

      await validateErrorRecord({
        errorMessage: 'route-node-error',
        url: '/app-route',
        renderSource: undefined,
      })
    })

    it('should catch app routes error in edge runtime', async () => {
      await next.fetch('/app-route/edge')
      await validateErrorRecord({
        errorMessage: 'route-edge-error',
        url: '/app-route/edge',
        renderSource: undefined,
      })
    })
  })

  describe('pages router', () => {
    it('should catch pages router page error in node runtime', async () => {
      await next.fetch('/page')
      await validateErrorRecord({
        errorMessage: 'pages-page-node-error',
        url: '/page',
        renderSource: undefined,
      })
    })

    it('should catch pages router page error in edge runtime', async () => {
      await next.fetch('/page/edge')
      await validateErrorRecord({
        errorMessage: 'pages-page-edge-error',
        url: '/page/edge',
        renderSource: undefined,
      })
    })

    it('should catch pages router api error in node runtime', async () => {
      await next.fetch('/api/pages-route')
      await validateErrorRecord({
        errorMessage: 'api-node-error',
        url: '/api/pages-route',
        renderSource: undefined,
      })
    })

    it('should catch pages router api error in edge runtime', async () => {
      await next.fetch('/api/pages-route/edge')
      await validateErrorRecord({
        errorMessage: 'api-edge-error',
        url: '/api/pages-route/edge',
        renderSource: undefined,
      })
    })
  })

  describe('middleware', () => {
    it('should catch middleware error', async () => {
      await next.fetch('/middleware-error')
      await validateErrorRecord({
        errorMessage: 'middleware-error',
        url: '/middleware-error',
        renderSource: undefined,
      })
    })
  })
})
