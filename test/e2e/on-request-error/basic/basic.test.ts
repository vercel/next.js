import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('on-request-error - basic', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: {
      __NEXT_EXPERIMENTAL_INSTRUMENTATION: '1',
    },
  })

  if (skipped) {
    return
  }

  const outputLogPath = 'output-log.json'

  async function getOutputLogJson() {
    if (!(await next.hasFile(outputLogPath))) {
      return {}
    }
    const content = await next.readFile(outputLogPath)
    return JSON.parse(content)
  }

  async function validateErrorRecord({
    name,
    url,
    renderSource,
    isMiddleware = false,
  }: {
    name: string
    url: string
    renderSource?: string
    isMiddleware?: boolean
  }) {
    await retry(async () => {
      const recordLogs = next.cliOutput
        .split('\n')
        .filter((log) => log.includes('[instrumentation] write-log'))
      const expectedLog = recordLogs.find((log) => log.includes(name))
      expect(expectedLog).toBeDefined()
    }, 5000)

    const json = await getOutputLogJson()
    const record = json[name]

    expect(record).toBeDefined()
    const { payload, count } = record
    expect(payload.message).toBe(name)
    expect(count).toBe(1)

    validateRequestByName({
      payload: payload,
      url,
      isMiddleware,
      renderSource,
    })
  }

  function validateRequestByName({
    payload,
    url,
    renderSource,
    isMiddleware = false,
  }: {
    payload: any
    url: string
    renderSource?: string
    isMiddleware: boolean
  }) {
    const { request } = payload
    if (isMiddleware) {
      // For middleware, the URL is absolute url with host
      expect(request.url).toMatch(/^http:\/\//)
      expect(request.url).toMatch(url)
    } else {
      expect(request.url).toBe(url)
    }

    if (renderSource) {
      expect(payload.context.renderSource).toBe(renderSource)
    }

    expect(request.method).toBe('GET')
    expect(request.headers['accept']).toBe('*/*')
  }

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  describe('app router', () => {
    it('should catch server component page error in node runtime', async () => {
      await next.fetch('/server-page')
      await validateErrorRecord({
        name: 'server-page-node-error',
        url: '/server-page',
        renderSource: 'react-server-components',
      })
    })

    it('should catch server component page error in edge runtime', async () => {
      await next.fetch('/server-page/edge')
      await validateErrorRecord({
        name: 'server-page-edge-error',
        url: '/server-page/edge',
        renderSource: 'react-server-components',
      })
    })

    it('should catch client component page error in node runtime', async () => {
      await next.fetch('/client-page')
      await validateErrorRecord({
        name: 'client-page-node-error',
        url: '/client-page',
        renderSource: 'server-rendering',
      })
    })

    it('should catch client component page error in edge runtime', async () => {
      await next.fetch('/client-page/edge')
      await validateErrorRecord({
        name: 'client-page-edge-error',
        url: '/client-page/edge',
        renderSource: 'server-rendering',
      })
    })

    it('should catch app routes error in node runtime', async () => {
      await next.fetch('/app-route')
      await validateErrorRecord({
        name: 'route-node-error',
        url: '/app-route',
      })
    })

    it('should catch app routes error in edge runtime', async () => {
      await next.fetch('/app-route/edge')
      await validateErrorRecord({
        name: 'route-edge-error',
        url: '/app-route/edge',
      })
    })
  })

  describe('pages router', () => {
    it('should catch pages router page error in node runtime', async () => {
      await next.fetch('/page')
      await validateErrorRecord({
        name: 'pages-page-node-error',
        url: '/page',
      })
    })

    it('should catch pages router page error in edge runtime', async () => {
      await next.fetch('/page/edge')
      await validateErrorRecord({
        name: 'pages-page-edge-error',
        url: '/page/edge',
      })
    })

    it('should catch pages router api error in node runtime', async () => {
      await next.fetch('/api/pages-route')
      await validateErrorRecord({
        name: 'api-node-error',
        url: '/api/pages-route',
      })
    })

    it('should catch pages router api error in edge runtime', async () => {
      await next.fetch('/api/pages-route/edge')
      await validateErrorRecord({
        name: 'api-edge-error',
        url: '/api/pages-route/edge',
      })
    })
  })

  describe('middleware', () => {
    it('should catch middleware error', async () => {
      await next.fetch('/middleware-error')
      await validateErrorRecord({
        name: 'middleware-error',
        url: '/middleware-error',
        isMiddleware: true,
      })
    })
  })
})
