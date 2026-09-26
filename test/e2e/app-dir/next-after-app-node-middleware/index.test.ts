import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'
import { createSandbox } from '../../../lib/development-sandbox'
import * as Log from './utils/log'

describe('after() in nodejs middleware', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // `patchFile` and reading runtime logs are not supported in a deployed environment
    skipDeployment: true,
  })

  if (skipped) return

  let currentCliOutputIndex = 0

  const ignorePreviousLogs = () => {
    currentCliOutputIndex = next.cliOutput.length
  }
  const resetLogIsolation = () => {
    currentCliOutputIndex = 0
  }

  const getLogs = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return Log.readCliLogs(next.cliOutput.slice(currentCliOutputIndex))
  }

  beforeEach(() => {
    ignorePreviousLogs()
  })

  it('runs in middleware', async () => {
    const requestId = `${Date.now()}`
    const res = await next.fetch(
      `/middleware/redirect-source?requestId=${requestId}`,
      {
        redirect: 'follow',
        headers: {
          cookie: 'testCookie=testValue',
        },
      }
    )

    expect(res.status).toBe(200)
    await retry(() => {
      expect(getLogs()).toContainEqual({
        source: '[middleware] /middleware/redirect-source',
        requestId,
        cookies: { testCookie: 'testValue' },
      })
    })
  })

  describe('uses waitUntil from request context if available', () => {
    it.each([
      {
        name: 'in middleware',
        path: '/provided-request-context/middleware',
        expectedLog: {
          source: '[middleware] /provided-request-context/middleware',
        },
      },
    ])('$name', async ({ path, expectedLog }) => {
      resetLogIsolation() // sandbox resets `next.cliOutput` to empty
      await using _sandbox = await createSandbox(
        next,
        new Map([
          [
            // this needs to be injected as early as possible, before the server tries to read the context
            // (which may be even before we load the page component in dev mode)
            'instrumentation.js',
            outdent`
            import { injectRequestContext } from './utils/provided-request-context'
            export function register() {
             if (process.env.NEXT_RUNTIME === 'edge') {
               // these tests only run 'next dev/start', and for edge things,
               // instrumentation runs *again* inside the sandbox.
               // we don't want that, because the sandbox wouldn't have access to globals from outside
               // and thus wouldn't normally see the request context
               return;
             }
              injectRequestContext();
            }
          `,
          ],
        ])
      )

      await next.browser(path)
      await retry(() => {
        const logs = getLogs()
        expect(logs).toContainEqual(
          'waitUntil from "@next/request-context" was called'
        )
        expect(logs).toContainEqual(expectedLog)
      })
    })
  })
})
