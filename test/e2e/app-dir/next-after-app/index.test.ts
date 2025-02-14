import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createProxyServer } from 'next/experimental/testmode/proxy'
import { outdent } from 'outdent'
import { createSandbox } from '../../../lib/development-sandbox'
import * as Log from './utils/log'

const runtimes = ['nodejs', 'edge']

describe.each(runtimes)('after() in %s runtime', (runtimeValue) => {
  const { next, isNextDeploy, skipped, isTurbopack } = nextTestSetup({
    files: __dirname,
    // `patchFile` and reading runtime logs are not supported in a deployed environment
    skipDeployment: true,
  })

  if (skipped) return
  const pathPrefix = '/' + runtimeValue

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

  it('runs in dynamic pages', async () => {
    const response = await next.fetch(pathPrefix + '/123/dynamic')
    expect(response.status).toBe(200)
    await retry(() => {
      expect(getLogs()).toContainEqual({ source: '[layout] /[id]' })
      expect(getLogs()).toContainEqual({
        source: '[page] /[id]/dynamic',
        value: '123',
        assertions: {
          'cache() works in after()': true,
        },
      })
    })
  })

  it('runs in dynamic route handlers', async () => {
    const res = await next.fetch(pathPrefix + '/route')
    expect(res.status).toBe(200)
    await retry(() => {
      expect(getLogs()).toContainEqual({ source: '[route handler] /route' })
    })
  })

  it('runs in server actions', async () => {
    const browser = await next.browser(pathPrefix + '/123/with-action')
    expect(getLogs()).toContainEqual({
      source: '[layout] /[id]',
    })
    await browser.elementByCss('button[type="submit"]').click()

    await retry(() => {
      expect(getLogs()).toContainEqual({
        source: '[action] /[id]/with-action',
        value: '123',
        assertions: {
          // cache() does not currently work in actions, and after() shouldn't affect that
          'cache() works in after()': false,
        },
      })
    })
    // TODO: server seems to close before the response fully returns?
  })

  it('runs callbacks from nested after calls', async () => {
    await next.browser(pathPrefix + '/nested-after')

    await retry(() => {
      for (const id of [1, 2, 3]) {
        expect(getLogs()).toContainEqual({
          source: `[page] /nested-after (after #${id})`,
          assertions: {
            'cache() works in after()': true,
          },
        })
      }
    })
  })

  describe('interrupted RSC renders', () => {
    // This is currently broken with Turbopack.
    // https://github.com/vercel/next.js/pull/75989

    ;(isTurbopack ? it.skip : it)(
      'runs callbacks if redirect() was called',
      async () => {
        await next.browser(pathPrefix + '/interrupted/calls-redirect')

        await retry(() => {
          expect(getLogs()).toContainEqual({
            source: '[page] /interrupted/calls-redirect',
          })
          expect(getLogs()).toContainEqual({
            source: '[page] /interrupted/redirect-target',
          })
        })
      }
    )

    it('runs callbacks if notFound() was called', async () => {
      await next.browser(pathPrefix + '/interrupted/calls-not-found')
      expect(getLogs()).toContainEqual({
        source: '[page] /interrupted/calls-not-found',
      })
    })

    it('runs callbacks if a user error was thrown in the RSC render', async () => {
      await next.browser(pathPrefix + '/interrupted/throws-error')
      expect(getLogs()).toContainEqual({
        source: '[page] /interrupted/throws-error',
      })
    })
  })

  it('runs in middleware', async () => {
    const requestId = `${Date.now()}`
    const res = await next.fetch(
      pathPrefix + `/middleware/redirect-source?requestId=${requestId}`,
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

  if (!isNextDeploy) {
    it('only runs callbacks after the response is fully sent', async () => {
      const pageStartedFetching = promiseWithResolvers<void>()
      pageStartedFetching.promise.catch(() => {})
      const shouldSendResponse = promiseWithResolvers<void>()
      shouldSendResponse.promise.catch(() => {})

      const abort = (error: Error) => {
        pageStartedFetching.reject(
          new Error('pageStartedFetching was aborted', { cause: error })
        )
        shouldSendResponse.reject(
          new Error('shouldSendResponse was aborted', {
            cause: error,
          })
        )
      }

      const proxyServer = await createProxyServer({
        async onFetch(_, request) {
          if (request.url === 'https://example.test/delayed-request') {
            pageStartedFetching.resolve()
            await shouldSendResponse.promise
            return new Response('')
          }
        },
      })

      try {
        const pendingReq = next
          .fetch(pathPrefix + '/delay', {
            headers: { 'Next-Test-Proxy-Port': String(proxyServer.port) },
          })
          .then(
            async (res) => {
              if (res.status !== 200) {
                const err = new Error(
                  `Got non-200 response (${res.status}) for ${res.url}, aborting`
                )
                abort(err)
                throw err
              }
              return res
            },
            (err) => {
              abort(err)
              throw err
            }
          )

        await Promise.race([
          pageStartedFetching.promise,
          pendingReq, // if the page throws before it starts fetching, we want to catch that
          timeoutPromise(
            10_000,
            'Timeout while waiting for the page to call fetch'
          ),
        ])

        // we blocked the request from completing, so there should be no logs yet,
        // because after() shouldn't run callbacks until the request is finished.
        expect(getLogs()).not.toContainEqual({
          source: '[page] /delay (Page)',
        })
        expect(getLogs()).not.toContainEqual({
          source: '[page] /delay (Inner)',
        })

        shouldSendResponse.resolve()
        await pendingReq.then((res) => res.text())

        // the request is finished, so after() should run, and the logs should appear now.
        await retry(() => {
          expect(getLogs()).toContainEqual({
            source: '[page] /delay (Page)',
          })
          expect(getLogs()).toContainEqual({
            source: '[page] /delay (Inner)',
          })
        })
      } finally {
        proxyServer.close()
      }
    })
  }

  it('runs in generateMetadata()', async () => {
    await next.browser(pathPrefix + '/123/with-metadata')
    expect(getLogs()).toContainEqual({
      source: '[metadata] /[id]/with-metadata',
      value: '123',
    })
  })

  it('does not allow modifying cookies in a callback', async () => {
    const EXPECTED_ERROR =
      /An error occurred in a function passed to `after\(\)`: .+?: Cookies can only be modified in a Server Action or Route Handler\./

    const browser = await next.browser(pathPrefix + '/123/setting-cookies')
    // after() from render
    expect(next.cliOutput).toMatch(EXPECTED_ERROR)

    const cookie1 = await browser.elementById('cookie').text()
    expect(cookie1).toEqual('Cookie: null')

    const cliOutputIndex = next.cliOutput.length
    try {
      await browser.elementByCss('button[type="submit"]').click()

      await retry(async () => {
        const cookie1 = await browser.elementById('cookie').text()
        expect(cookie1).toEqual('Cookie: "action"')
        const newLogs = next.cliOutput.slice(cliOutputIndex)
        // // after() from action
        expect(newLogs).toMatch(EXPECTED_ERROR)
      })
    } finally {
      await browser.eval('document.cookie = "testCookie=;path=/;max-age=-1"')
    }
  })

  describe('uses waitUntil from request context if available', () => {
    it.each([
      {
        name: 'in a page',
        path: '/provided-request-context/page',
        expectedLog: { source: '[page] /provided-request-context/page' },
      },
      {
        name: 'in a route handler',
        path: '/provided-request-context/route',
        expectedLog: {
          source: '[route handler] /provided-request-context/route',
        },
      },
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

      await next.browser(pathPrefix + path)
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

function promiseWithResolvers<T>() {
  let resolve: (value: T) => void = undefined!
  let reject: (error: unknown) => void = undefined!
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { promise, resolve, reject }
}

function timeoutPromise(duration: number, message = 'Timeout') {
  return new Promise<never>((_, reject) =>
    AbortSignal.timeout(duration).addEventListener('abort', () =>
      reject(new Error(message))
    )
  )
}
