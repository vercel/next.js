/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, hasRedbox, retry } from 'next-test-utils'
import { createProxyServer } from 'next/experimental/testmode/proxy'
import { sandbox } from '../../../lib/development-sandbox'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as Log from './utils/log'
import * as LogCLI from './utils/log-cli'

describe('unstable_after()', () => {
  const logFileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logs-'))
  const logFile = path.join(logFileDir, 'logs.jsonl')

  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    env: {
      PERSISTENT_LOG_FILE: logFile,
    },
  })

  const getLogs = () => Log.readPersistentLog(logFile)
  beforeEach(() => Log.clearPersistentLog(logFile))

  it('runs in dynamic pages', async () => {
    await next.render('/123/dynamic')
    await retry(() => {
      expect(getLogs()).toContainEqual({ source: '[layout] /[id]' })
      expect(getLogs()).toContainEqual({
        source: '[page] /[id]/dynamic',
        value: '123',
        assertions: {
          'cache() works in after()': true,
          'headers() works in after()': true,
        },
      })
    })
  })

  it('runs in dynamic route handlers', async () => {
    const res = await next.fetch('/route')
    expect(res.status).toBe(200)
    await retry(() => {
      expect(getLogs()).toContainEqual({ source: '[route handler] /route' })
    })
  })

  it('runs in server actions', async () => {
    const browser = await next.browser('/123/with-action')
    expect(getLogs()).toContainEqual({
      source: '[layout] /[id]',
    })
    await browser.elementByCss('button[type="submit"]').click()

    await retry(() => {
      expect(getLogs()).toContainEqual({
        source: '[action] /[id]/with-action',
        value: '123',
        assertions: {
          'cache() works in after()': true,
          'headers() works in after()': true,
        },
      })
    })
    // TODO: server seems to close before the response fully returns?
  })

  it('is a no-op with `dynamic = "force-static"`', async () => {
    const res = await next.fetch('/static')
    expect(res.status).toBe(200)
    expect(getLogs()).toHaveLength(0)
  })

  if (isNextDev) {
    it('errors at compile time with `dynamic = "error"`', async () => {
      const filePath = 'app/static/page.js'
      const origContent = await next.readFile(filePath)

      try {
        await next.patchFile(filePath, (contents) =>
          contents.replace(
            `export const dynamic = 'force-static'`,
            `export const dynamic = 'error'`
          )
        )
        const browser = await next.browser('/static')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxDescription(browser)).toContain(
          'Route /static with `dynamic = "error"` couldn\'t be rendered statically because it used `unstable_after`'
        )
        expect(getLogs()).toHaveLength(0)
      } finally {
        await next.patchFile(filePath, origContent)
      }
    })
  }

  describe('interrupted RSC renders', () => {
    it('runs callbacks if redirect() was called', async () => {
      await next.browser('/interrupted/calls-redirect')
      expect(getLogs()).toContainEqual({
        source: '[page] /interrupted/calls-redirect',
      })
      expect(getLogs()).toContainEqual({
        source: '[page] /interrupted/redirect-target',
      })
    })

    it('runs callbacks if notFound() was called', async () => {
      await next.browser('/interrupted/calls-not-found')
      expect(getLogs()).toContainEqual({
        source: '[page] /interrupted/calls-not-found',
      })
    })

    it('runs callbacks if a user error was thrown in the RSC render', async () => {
      await next.browser('/interrupted/throws-error')
      expect(getLogs()).toContainEqual({
        source: '[page] /interrupted/throws-error',
      })
    })
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
    const cliLogs = LogCLI.readCliLogs(next.cliOutput)
    await retry(() => {
      expect(cliLogs).toContainEqual({
        source: '[middleware] /middleware/redirect-source',
        requestId,
        cookies: { testCookie: 'testValue' },
      })
    })
  })

  if (!isNextDeploy) {
    it('only runs callbacks after the response is fully sent', async () => {
      const pageStartedFetching = promiseWithResolvers<void>()
      const shouldSendResponse = promiseWithResolvers<void>()
      const abort = (error: Error) => {
        pageStartedFetching.reject(error)
        shouldSendResponse.reject(error)
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
        const pendingReq = next.fetch('/delay', {
          headers: { 'Next-Test-Proxy-Port': String(proxyServer.port) },
        })

        pendingReq.then(
          async (res) => {
            if (res.status !== 200) {
              const msg = `Got non-200 response (${res.status}), aborting`
              console.error(msg + '\n', await res.text())
              abort(new Error(msg))
            }
          },
          (err) => {
            abort(err)
          }
        )

        await Promise.race([
          pageStartedFetching.promise,
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
    await next.browser('/123/with-metadata')
    expect(getLogs()).toContainEqual({
      source: '[metadata] /[id]/with-metadata',
      value: '123',
    })
  })

  if (isNextDev) {
    describe('invalid usages', () => {
      it('errors at compile time when used in a client module', async () => {
        const { session, cleanup } = await sandbox(
          next,
          new Map([
            [
              'app/invalid-in-client/page.js',
              (await next.readFile('app/invalid-in-client/page.js')).replace(
                `// 'use client'`,
                `'use client'`
              ),
            ],
          ]),
          '/invalid-in-client'
        )
        try {
          expect(await session.getRedboxSource(true)).toMatch(
            /You're importing a component that needs "?next\/server"?\. That only works in a Server Component but one of its parents is marked with "use client", so it's a Client Component\./
          )
          expect(getLogs()).toHaveLength(0)
        } finally {
          await cleanup()
        }
      })

      describe('errors at compile time when used in pages dir', () => {
        it.each([
          {
            path: '/pages-dir/invalid-in-gssp',
            file: 'pages-dir/invalid-in-gssp.js',
          },
          {
            path: '/pages-dir/123/invalid-in-gsp',
            file: 'pages-dir/[id]/invalid-in-gsp.js',
          },
          {
            path: '/pages-dir/invalid-in-page',
            file: 'pages-dir/invalid-in-page.js',
          },
        ])('$file', async ({ path, file }) => {
          const { session, cleanup } = await sandbox(
            next,
            new Map([[`pages/${file}`, await next.readFile(`_pages/${file}`)]]),
            path
          )

          try {
            expect(await session.getRedboxSource(true)).toMatch(
              /You're importing a component that needs "?next\/server"?\. That only works in a Server Component which is not supported in the pages\/ directory\./
            )
            expect(getLogs()).toHaveLength(0)
          } finally {
            await cleanup()
          }
        })
      })
    })
  }

  it.todo('does not allow modifying cookies')
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
