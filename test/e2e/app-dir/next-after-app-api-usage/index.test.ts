/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { randomUUID } from 'node:crypto'
import { REQUEST_API_NAMES } from './app/request-apis-in-promise/common'

describe('nextjs APIs in after()', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    captureRuntimeLogs: true,
  })

  let requestId: string
  let currentCliOutputIndex = 0
  const getLogs = () => parseLogs(next.cliOutput, requestId)

  beforeEach(() => {
    requestId = randomUUID()
    currentCliOutputIndex = next.cliOutput.length
  })

  // Build output has no request ID. Runtime output is matched to the request
  // that triggered it, rather than to its asynchronous arrival position.
  function parseLogs(output: string, id?: string) {
    return [...output.matchAll(/<after-results>(.*?)<\/after-results>/g)]
      .map((match) => JSON.parse(match[1]))
      .filter((entry) => entry.requestId === id)
      .flatMap((entry) => entry.messages)
      .join('\n')
  }

  const retryLogs = (callback: () => void | string) => retry(callback, 30_000)

  let buildLogs: string
  const getStaticLogs = () =>
    isNextDev
      ? parseLogs(next.cliOutput.slice(currentCliOutputIndex))
      : buildLogs
  beforeAll(async () => {
    if (isNextDeploy) {
      await next.start()
      buildLogs = parseLogs(next.cliOutput)
      return
    }
    if (!isNextDev) {
      await next.build()
      buildLogs = parseLogs(next.cliOutput)
    } else {
      buildLogs = '(no build logs in dev)'
    }
    await next.start({ skipBuild: true })
  })

  describe('request APIs inside after()', () => {
    it('cannot be called in a dynamic page', async () => {
      const path = '/request-apis/page-dynamic'
      await next.render(`${path}?requestId=${requestId}`)
      await retryLogs(() => {
        const logs = getLogs()

        expect(logs).not.toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(
          `[${path}] headers(): error: Error: Route ${path} used \`headers()\` inside \`after()\` while rendering. This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(
          `[${path}] cookies(): error: Error: Route ${path} used \`cookies()\` inside \`after()\` while rendering. This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(
          `[${path}] connection(): error: Error: Route ${path} used \`connection()\` inside \`after()\` while rendering.`
        )
      })
      await retryLogs(() => {
        const logs = getLogs()

        expect(logs).not.toContain(`[${path}] nested headers(): ok`)
        expect(logs).toContain(
          `[${path}] nested headers(): error: Error: Route ${path} used \`headers()\` inside \`after()\` while rendering. This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] nested cookies(): ok`)
        expect(logs).toContain(
          `[${path}] nested cookies(): error: Error: Route ${path} used \`cookies()\` inside \`after()\` while rendering. This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] nested connection(): ok`)
        expect(logs).toContain(
          `[${path}] nested connection(): error: Error: Route ${path} used \`connection()\` inside \`after()\` while rendering.`
        )
      })
    })

    describe('cannot be called in a prerendered page', () => {
      it.each([
        {
          title: 'with `dynamic = "error"`',
          path: '/request-apis/page-dynamic-error',
        },
        {
          title: 'with `dynamic = "force-static"`',
          path: '/request-apis/page-force-static',
        },
      ])('$title', async ({ path }) => {
        await next.render(`${path}?requestId=${requestId}`)
        await retryLogs(() => {
          const logs = getStaticLogs() // in `next start` the error was logged at build time

          expect(logs).not.toContain(`[${path}] headers(): ok`)
          expect(logs).toContain(
            `[${path}] headers(): error: Error: Route ${path} used \`headers()\` inside \`after()\` while rendering. This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] cookies(): ok`)
          expect(logs).toContain(
            `[${path}] cookies(): error: Error: Route ${path} used \`cookies()\` inside \`after()\` while rendering. This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] connection(): ok`)
          expect(logs).toContain(
            `[${path}] connection(): error: Error: Route ${path} used \`connection()\` inside \`after()\` while rendering.`
          )
        })
        await retryLogs(() => {
          const logs = getStaticLogs() // in `next start` the error was logged at build time

          expect(logs).not.toContain(`[${path}] nested headers(): ok`)
          expect(logs).toContain(
            `[${path}] nested headers(): error: Error: Route ${path} used \`headers()\` inside \`after()\` while rendering. This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] nested cookies(): ok`)
          expect(logs).toContain(
            `[${path}] nested cookies(): error: Error: Route ${path} used \`cookies()\` inside \`after()\` while rendering. This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] nested connection(): ok`)
          expect(logs).toContain(
            `[${path}] nested connection(): error: Error: Route ${path} used \`connection()\` inside \`after()\` while rendering.`
          )
        })
      })
    })

    it('can be called in a server action', async () => {
      const path = '/request-apis/server-action'
      const browser = await next.browser(`${path}?requestId=${requestId}`)
      await browser.elementByCss('button[type="submit"]').click()
      await retryLogs(() => {
        const logs = getLogs()
        expect(logs).toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(`[${path}] nested headers(): ok`)

        expect(logs).toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(`[${path}] nested cookies(): ok`)

        expect(logs).toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(`[${path}] nested connection(): ok`)
      })
    })

    it('can be called in a dynamic route handler', async () => {
      const path = '/request-apis/route-handler-dynamic'
      await next.render(`${path}?requestId=${requestId}`)
      await retryLogs(() => {
        const logs = getLogs()
        expect(logs).toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(`[${path}] nested headers(): ok`)

        expect(logs).toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(`[${path}] nested cookies(): ok`)

        expect(logs).toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(`[${path}] nested connection(): ok`)
      })
    })

    it('can be called in a prerendered route handler with `dynamic = "force-static"`', async () => {
      const path = '/request-apis/route-handler-force-static'
      await next.render(`${path}?requestId=${requestId}`)
      await retryLogs(() => {
        const logs = getStaticLogs() // in `next start` the error was logged at build time
        expect(logs).toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(`[${path}] nested headers(): ok`)

        expect(logs).toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(`[${path}] nested cookies(): ok`)

        expect(logs).toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(`[${path}] nested connection(): ok`)
      })
    })

    it('can be called in a prerendered route handler with `dynamic = "error" (but throw, because dynamic should error)`', async () => {
      const path = '/request-apis/route-handler-dynamic-error'
      await next.render(`${path}?requestId=${requestId}`)
      await retryLogs(() => {
        const logs = getStaticLogs() // in `next start` the error was logged at build time

        expect(logs).not.toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(
          `[${path}] headers(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers()\`.`
        )

        expect(logs).not.toContain(`[${path}] nested headers(): ok`)
        expect(logs).toContain(
          `[${path}] nested headers(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers()\`.`
        )

        expect(logs).not.toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(
          `[${path}] cookies(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies()\`.`
        )

        expect(logs).not.toContain(`[${path}] nested cookies(): ok`)
        expect(logs).toContain(
          `[${path}] nested cookies(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies()\`.`
        )

        expect(logs).not.toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(
          `[${path}] connection(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection()\`.`
        )

        expect(logs).not.toContain(`[${path}] nested connection(): ok`)
        expect(logs).toContain(
          `[${path}] nested connection(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection()\`.`
        )
      })
    })
  })

  describe('draftMode status is readable, but cannot be changed', () => {
    it.each([
      {
        title: 'dynamic page',
        path: '/draft-mode/page-dynamic',
        isDynamic: true,
      },
      {
        title: 'static page',
        path: '/draft-mode/page-static',
        isDynamic: false,
      },
      {
        title: 'dynamic route handler',
        path: '/draft-mode/route-handler-dynamic',
        isDynamic: true,
      },
      {
        title: 'static route handler',
        path: '/draft-mode/route-handler-static',
        isDynamic: false,
      },
    ])('$title', async ({ path, isDynamic }) => {
      await next.render(`${path}?requestId=${requestId}`)
      await retryLogs(() => {
        // in `next start`, static routes log the error at build time
        const logs = isDynamic ? getLogs() : getStaticLogs()
        expect(logs).toContain(`[${path}] draft.isEnabled: false`)
        expect(logs).toContain(
          `Route ${path} used "draftMode().enable()" inside \`after()\``
        )
        expect(logs).toContain(
          `Route ${path} used "draftMode().disable()" inside \`after()\``
        )
      })
    })

    it('server action', async () => {
      const path = '/draft-mode/server-action'
      const browser = await next.browser(`${path}?requestId=${requestId}`)
      await browser.elementByCss('button[type="submit"]').click()
      await retryLogs(() => {
        const logs = getLogs()
        expect(logs).toContain(`[${path}] draft.isEnabled: false`)
        expect(logs).toContain(
          `Route ${path} used "draftMode().enable()" inside \`after()\``
        )
        expect(logs).toContain(
          `Route ${path} used "draftMode().disable()" inside \`after()\``
        )
      })
    })
  })

  describe('async APIs in promises passed to after', () => {
    describe('in route handlers', () => {
      it.each(REQUEST_API_NAMES)(
        'does not error - %s',
        async (apiName: string) => {
          await next.fetch(
            `/request-apis-in-promise/route-handler?api=${apiName}&requestId=${requestId}`
          )

          const cliOutput = await retryLogs(() => {
            const cliOutput = getLogs()
            expect(cliOutput).toContain(`route :: ${apiName} :: finished`)
            return cliOutput
          })

          expect(cliOutput).toContain(`route :: ${apiName} :: promise :: ok`)
          expect(cliOutput).not.toContain(
            `route :: ${apiName} :: promise :: error`
          )

          expect(cliOutput).toContain(
            `route :: ${apiName} :: nested after :: ok`
          )
          expect(cliOutput).not.toContain(
            `route :: ${apiName} :: nested after :: error`
          )
        }
      )
    })

    describe('in server actions', () => {
      it.each(REQUEST_API_NAMES)(
        'does not error - %s',
        async (apiName: string) => {
          const browser = await next.browser(
            `/request-apis-in-promise/server-action?requestId=${requestId}`
          )

          await browser
            .elementByCss(
              `form[data-api-name="${apiName}"] button[type="submit"]`
            )
            .click()

          const cliOutput = await retryLogs(() => {
            const cliOutput = getLogs()
            expect(cliOutput).toContain(`action :: ${apiName} :: finished`)
            return cliOutput
          })

          expect(cliOutput).toContain(`action :: ${apiName} :: promise :: ok`)
          expect(cliOutput).not.toContain(
            `action :: ${apiName} :: promise :: error`
          )

          expect(cliOutput).toContain(
            `action :: ${apiName} :: nested after :: ok`
          )
          expect(cliOutput).not.toContain(
            `action :: ${apiName} :: nested after :: error`
          )
        }
      )
    })

    describe('in renders', () => {
      it.each(REQUEST_API_NAMES)(
        'throws an error - %s',
        async (apiName: string) => {
          const route = `/request-apis-in-promise/render`
          const path = `${route}?apiName=${apiName}&requestId=${requestId}`

          await next.fetch(path)

          const cliOutput = await retryLogs(() => {
            const cliOutput = getLogs()
            expect(cliOutput).toContain(`render :: ${apiName} :: finished`)
            return cliOutput
          })
          const message = `Error: Route ${route} used \`${apiName}()\` inside \`after()\` while rendering.`

          expect(cliOutput).toContain(
            `render :: ${apiName} :: promise :: error: ${message}`
          )
          expect(cliOutput).not.toContain(
            `render :: ${apiName} :: promise :: ok`
          )

          expect(cliOutput).toContain(
            `render :: ${apiName} :: nested after :: error: ${message}`
          )
          expect(cliOutput).not.toContain(
            `render :: ${apiName} :: nested after :: ok`
          )
        }
      )
    })

    describe('in renders after server actions', () => {
      it.each(REQUEST_API_NAMES)(
        'throws an error - %s',
        async (apiName: string) => {
          const route = '/request-apis-in-promise/render-after-action'
          const browser = await next.browser(`${route}?requestId=${requestId}`)
          // Clear cookies after every run
          await using _ = defer(() => browser.deleteCookies())

          // Sanity check: we should not be running any of the APIs now,
          // only when a server action causes a rerender
          expect(await browser.elementById('after-state').text()).toBe('idle')

          await browser
            .elementByCss(
              `form[data-api-name="${apiName}"] button[type="submit"]`
            )
            .click()

          const cliOutput = await retryLogs(() => {
            const cliOutput = getLogs()
            expect(cliOutput).toContain(
              `render after action :: ${apiName} :: finished`
            )
            return cliOutput
          })
          const message = `Error: Route ${route} used \`${apiName}()\` inside \`after()\` while rendering.`

          expect(cliOutput).toContain(
            `render after action :: ${apiName} :: promise :: error: ${message}`
          )
          expect(cliOutput).not.toContain(
            `render after action :: ${apiName} :: promise :: ok`
          )

          expect(cliOutput).toContain(
            `render after action :: ${apiName} :: nested after :: error: ${message}`
          )
          expect(cliOutput).not.toContain(
            `render after action :: ${apiName} :: nested after :: ok`
          )
        }
      )
    })
  })
})

function defer(callback: () => void | Promise<void>): AsyncDisposable {
  return {
    [Symbol.asyncDispose]: async () => {
      return callback()
    },
  }
}
