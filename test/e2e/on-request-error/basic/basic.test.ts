import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('on-request-error - basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const outputLogPath = 'output-log.json'

  async function getOutputLogJson() {
    if (!(await next.hasFile(outputLogPath))) {
      return {}
    }
    const content = await next.readFile(outputLogPath)
    return JSON.parse(content)
  }

  async function validateErrorRecord(
    name: string,
    url: string,
    isMiddleware: boolean = false
  ) {
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

    validateRequestByName(payload.request, url, isMiddleware)
  }

  function validateRequestByName(
    request: any,
    url: string,
    isMiddleware: boolean = false
  ) {
    if (isMiddleware) {
      // For middleware, the URL is absolute url with host
      expect(request.url).toMatch(/^http:\/\//)
      expect(request.url).toMatch(url)
    } else {
      expect(request.url).toBe(url)
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
      await validateErrorRecord('server-page-node-error', '/server-page')
    })

    it('should catch server component page error in edge runtime', async () => {
      await next.fetch('/server-page/edge')
      await validateErrorRecord('server-page-edge-error', '/server-page/edge')
    })

    it('should catch client component page error in node runtime', async () => {
      await next.fetch('/client-page')
      await validateErrorRecord('client-page-node-error', '/client-page')
    })

    it('should catch client component page error in edge runtime', async () => {
      await next.fetch('/client-page/edge')
      await validateErrorRecord('client-page-edge-error', '/client-page/edge')
    })

    it('should catch app routes error in node runtime', async () => {
      await next.fetch('/app-route')
      await validateErrorRecord('route-node-error', '/app-route')
    })

    it('should catch app routes error in edge runtime', async () => {
      await next.fetch('/app-route/edge')
      await validateErrorRecord('route-edge-error', '/app-route/edge')
    })
  })

  describe('pages router', () => {
    it('should catch pages router page error in node runtime', async () => {
      await next.fetch('/page')
      await validateErrorRecord('pages-page-node-error', '/page')
    })

    it('should catch pages router page error in edge runtime', async () => {
      await next.fetch('/page/edge')
      await validateErrorRecord('pages-page-edge-error', '/page/edge')
    })

    it('should catch pages router api error in node runtime', async () => {
      await next.fetch('/api/pages-route')
      await validateErrorRecord('api-node-error', '/api/pages-route')
    })

    it('should catch pages router api error in edge runtime', async () => {
      await next.fetch('/api/pages-route/edge')
      await validateErrorRecord('api-edge-error', '/api/pages-route/edge')
    })
  })

  describe('middleware', () => {
    it('should catch middleware error', async () => {
      await next.fetch('/middleware-error')
      await validateErrorRecord('middleware-error', '/middleware-error', true)
    })
  })
})
