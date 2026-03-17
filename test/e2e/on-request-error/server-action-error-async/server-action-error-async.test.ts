import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getOutputLogJson } from '../_testing/utils'

// Verifies that when onRequestError returns a Promise, the framework
// registers it with after()/waitUntil so async error reporting completes
// reliably in serverless environments.
//
// The instrumentation injects a mock waitUntil via @next/request-context
// (same pattern as test/e2e/app-dir/next-after-app) and returns the
// fetch promise from onRequestError. If the fix in
// create-error-handler.tsx is working, after() will call waitUntil with
// that promise, producing a "[test] waitUntil called" log line.
//
// Without the fix, the promise is silently discarded and waitUntil is
// never called.
describe('on-request-error - async instrumentation with waitUntil', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  const outputLogPath = 'output-log.json'

  beforeAll(async () => {
    await next.patchFile(outputLogPath, '{}')
  })

  it('should register onRequestError promise with waitUntil via after()', async () => {
    const browser = await next.browser('/form-error')
    await browser.elementByCss('button').click()

    // Verify that waitUntil was called — this proves after() was invoked
    // with the promise returned by onRequestError
    await retry(async () => {
      const logs = next.cliOutput
      expect(logs).toContain('[test] waitUntil called')
    }, 5000)

    // Also verify the error was actually reported (the fetch completed)
    await retry(async () => {
      const recordLogLines = next.cliOutput
        .split('\n')
        .filter((log) => log.includes('[instrumentation] write-log'))

      expect(recordLogLines).toEqual(
        expect.arrayContaining([
          expect.stringContaining('[server-action-async]:form'),
        ])
      )
    }, 5000)

    const json = await getOutputLogJson(next, outputLogPath)
    const record = json['[server-action-async]:form']

    expect(record).toMatchObject({
      payload: {
        message: '[server-action-async]:form',
        request: {
          path: '/form-error',
          method: 'POST',
        },
        context: {
          routerKind: 'App Router',
          routeType: 'action',
          renderSource: 'react-server-components-payload',
        },
      },
      count: 1,
    })
  })
})
