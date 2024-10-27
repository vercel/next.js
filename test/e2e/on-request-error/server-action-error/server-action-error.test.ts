import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

describe('on-request-error - server-action-error', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const outputLogPath = 'output-log.json'

  async function validateErrorRecord({
    errorMessage,
    url,
  }: {
    errorMessage: string
    url: string
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

    // Assert error is recorded in the output log
    expect(record).toMatchObject({
      payload: {
        message: errorMessage,
        request: {
          path: url,
          method: 'POST',
          headers: expect.objectContaining({
            accept: 'text/x-component',
          }),
        },
        context: {
          routerKind: 'App Router',
          routeType: 'action',
          renderSource: 'react-server-components-payload',
        },
      },
      count: 1,
    })
  }

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  it('should catch server action error in listener callback in nodejs runtime', async () => {
    const browser = await next.browser('/client/callback')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      errorMessage: '[server-action]:callback',
      url: '/client/callback',
    })
  })

  it('should catch server action error in listener callback in edge runtime', async () => {
    const browser = await next.browser('/client/callback/edge')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      errorMessage: '[server-action]:callback:edge',
      url: '/client/callback/edge',
    })
  })

  it('should catch the server action form error in nodejs runtime', async () => {
    const browser = await next.browser('/form-error')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      errorMessage: '[server-action]:form',
      url: '/form-error',
    })
  })

  it('should catch the server action form error in edge runtime', async () => {
    const browser = await next.browser('/form-error/edge')
    await browser.elementByCss('button').click()

    await validateErrorRecord({
      errorMessage: '[server-action]:form:edge',
      url: '/form-error/edge',
    })
  })
})
