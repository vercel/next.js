import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('on-request-error - server-action-error', () => {
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
    renderType,
    isMiddleware = false,
  }: {
    name: string
    url: string
    renderSource: string | undefined
    renderType: string | undefined
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
      payload,
      url,
      isMiddleware,
      renderSource,
      renderType,
    })
  }

  function validateRequestByName({
    payload,
    url,
    renderSource,
    renderType,
    isMiddleware = false,
  }: {
    payload: any
    url: string
    renderSource: string | undefined
    renderType: string | undefined
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

    expect(payload.context.renderSource).toBe(renderSource)
    expect(payload.context.routeType).toBe(renderType)

    expect(request.method).toBe('POST')
    expect(request.headers['accept']).toBe('text/x-component')
  }

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  it('should catch server action error in listener callback in nodejs runtime', async () => {
    const browser = await next.browser('/client/callback')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      name: '[server-action]:callback',
      url: '/client/callback',
      renderSource: 'react-server-components-payload',
      renderType: 'action',
    })
  })

  it('should catch server action error in listener callback in edge runtime', async () => {
    const browser = await next.browser('/client/callback/edge')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      name: '[server-action]:callback:edge',
      url: '/client/callback/edge',
      renderSource: 'react-server-components-payload',
      renderType: 'action',
    })
  })

  it('should catch the server action form error in nodejs runtime', async () => {
    const browser = await next.browser('/form-error')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      name: '[server-action]:form',
      url: '/form-error',
      renderSource: 'react-server-components-payload',
      renderType: 'action',
    })
  })

  it('should catch the server action form error in edge runtime', async () => {
    const browser = await next.browser('/form-error/edge')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      name: '[server-action]:form:edge',
      url: '/form-error/edge',
      renderSource: 'react-server-components-payload',
      renderType: 'action',
    })
  })
})
