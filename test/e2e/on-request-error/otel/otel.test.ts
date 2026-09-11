import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

// This suite changes fixture source or configuration with next.patchFile().
// Deployment mode cannot modify the deployed application.
// @force-gate !deploy
describe('on-request-error - otel', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      dependencies: {
        '@vercel/otel': '^1.13.0',
      },
    },
  })

  const outputLogPath = 'output-log.json'

  async function validateErrorRecord({
    errorMessage,
    url,
    renderSource,
  }: {
    errorMessage: string
    url: string
    renderSource: string | undefined
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
        request: { method: 'GET', headers: { accept: '*/*' } },
        ...(renderSource ? { context: { renderSource } } : undefined),
      },
    })
  }

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  describe('app router', () => {
    it('should catch server component page error in node runtime', async () => {
      await next.fetch('/server-page')
      await validateErrorRecord({
        errorMessage: 'server-page-node-error',
        url: '/server-page',
        renderSource: 'react-server-components',
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
  })
})
