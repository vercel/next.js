import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('on-request-error - dynamic-routes', () => {
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

  async function getErrorRecord({ errorMessage }: { errorMessage: string }) {
    // Assert the instrumentation is called
    await retry(async () => {
      const recordLogs = next.cliOutput
        .split('\n')
        .filter((log) => log.includes('[instrumentation] write-log'))
      const expectedLog = recordLogs.find((log) => log.includes(errorMessage))
      expect(expectedLog).toBeDefined()
    }, 5000)

    const json = await getOutputLogJson()
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
        errorMessage: 'server-dynamic-page-node-error?apple=dope',
      })
      expect(record).toMatchObject({
        payload: {
          message: 'server-dynamic-page-node-error?apple=dope',
          context: {
            routePath: '/app-page/dynamic/[id]',
          },
        },
      })
    })

    it('should catch app router dynamic routes error with search params', async () => {
      await next.fetch('/app-route/dynamic/123?apple=dope')
      const record = await getErrorRecord({
        errorMessage: 'server-dynamic-route-node-error?apple=dope',
      })
      expect(record).toMatchObject({
        payload: {
          message: 'server-dynamic-route-node-error?apple=dope',
          context: {
            routePath: '/app-route/dynamic/[id]',
          },
        },
      })
    })

    it('should catch client component page error in node runtime', async () => {
      await next.fetch('/app-page/suspense')
      const record = await getErrorRecord({
        errorMessage: 'server-suspense-page-node-error',
      })

      expect(record).toMatchObject({
        payload: {
          message: 'server-suspense-page-node-error',
          context: {
            routePath: '/app-page/suspense',
          },
        },
      })
    })
  })
})
