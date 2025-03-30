/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('nextjs APIs in after()', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true, // reading runtime logs is not supported in deploy tests
  })

  if (skipped) return

  let currentCliOutputIndex = 0

  const ignorePreviousLogs = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  const getLogs = () => {
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  beforeEach(() => {
    ignorePreviousLogs()
  })

  let buildLogs: string
  beforeAll(async () => {
    if (!isNextDev) {
      await next.build()
      buildLogs = next.cliOutput
    } else {
      buildLogs = '(no build logs in dev)'
    }
    await next.start()
  })

  describe('request APIs inside after()', () => {
    // TODO(after): test unawaited calls, like this
    //
    // export default function Page() {
    //   const promise = headers()
    //   after(async () => {
    //     const headerStore = await promise
    //   })
    //   return null
    // }

    it('cannot be called in a dynamic page', async () => {
      const path = '/request-apis/page-dynamic'
      await next.render(path)
      await retry(() => {
        const logs = getLogs()

        expect(logs).not.toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(
          `[${path}] headers(): error: Error: Route ${path} used "headers" inside "after(...)". This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] nested headers(): ok`)
        expect(logs).toContain(
          `[${path}] nested headers(): error: Error: Route ${path} used "headers" inside "after(...)". This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(
          `[${path}] cookies(): error: Error: Route ${path} used "cookies" inside "after(...)". This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] nested cookies(): ok`)
        expect(logs).toContain(
          `[${path}] nested cookies(): error: Error: Route ${path} used "cookies" inside "after(...)". This is not supported.`
        )

        expect(logs).not.toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(
          `[${path}] connection(): error: Error: Route ${path} used "connection" inside "after(...)".`
        )

        expect(logs).not.toContain(`[${path}] nested connection(): ok`)
        expect(logs).toContain(
          `[${path}] nested connection(): error: Error: Route ${path} used "connection" inside "after(...)".`
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
        await next.render(path)
        await retry(() => {
          const logs = isNextDev ? getLogs() : buildLogs // in `next start` the error was logged at build time

          expect(logs).not.toContain(`[${path}] headers(): ok`)
          expect(logs).toContain(
            `[${path}] headers(): error: Error: Route ${path} used "headers" inside "after(...)". This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] nested headers(): ok`)
          expect(logs).toContain(
            `[${path}] nested headers(): error: Error: Route ${path} used "headers" inside "after(...)". This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] cookies(): ok`)
          expect(logs).toContain(
            `[${path}] cookies(): error: Error: Route ${path} used "cookies" inside "after(...)". This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] nested cookies(): ok`)
          expect(logs).toContain(
            `[${path}] nested cookies(): error: Error: Route ${path} used "cookies" inside "after(...)". This is not supported.`
          )

          expect(logs).not.toContain(`[${path}] connection(): ok`)
          expect(logs).toContain(
            `[${path}] connection(): error: Error: Route ${path} used "connection" inside "after(...)".`
          )

          expect(logs).not.toContain(`[${path}] nested connection(): ok`)
          expect(logs).toContain(
            `[${path}] nested connection(): error: Error: Route ${path} used "connection" inside "after(...)".`
          )
        })
      })
    })

    it('can be called in a server action', async () => {
      const path = '/request-apis/server-action'
      const browser = await next.browser(path)
      await browser.elementByCss('button[type="submit"]').click()
      await retry(() => {
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
      await next.render(path)
      await retry(() => {
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
      await next.render(path)
      await retry(() => {
        const logs = isNextDev ? getLogs() : buildLogs // in `next start` the error was logged at build time
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
      await next.render(path)
      await retry(() => {
        const logs = isNextDev ? getLogs() : buildLogs // in `next start` the error was logged at build time

        expect(logs).not.toContain(`[${path}] headers(): ok`)
        expect(logs).toContain(
          `[${path}] headers(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers\`.`
        )

        expect(logs).not.toContain(`[${path}] nested headers(): ok`)
        expect(logs).toContain(
          `[${path}] nested headers(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers\`.`
        )

        expect(logs).not.toContain(`[${path}] cookies(): ok`)
        expect(logs).toContain(
          `[${path}] cookies(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`.`
        )

        expect(logs).not.toContain(`[${path}] nested cookies(): ok`)
        expect(logs).toContain(
          `[${path}] nested cookies(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies\`.`
        )

        expect(logs).not.toContain(`[${path}] connection(): ok`)
        expect(logs).toContain(
          `[${path}] connection(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection\`.`
        )

        expect(logs).not.toContain(`[${path}] nested connection(): ok`)
        expect(logs).toContain(
          `[${path}] nested connection(): error: Error: Route ${path} with \`dynamic = "error"\` couldn't be rendered statically because it used \`connection\`.`
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
      await next.render(path)
      await retry(() => {
        // in `next start`, static routes log the error at build time
        const logs = isDynamic || isNextDev ? getLogs() : buildLogs
        expect(logs).toContain(`[${path}] draft.isEnabled: false`)
        expect(logs).toContain(
          `Route ${path} used "draftMode().enable()" inside \`after\``
        )
        expect(logs).toContain(
          `Route ${path} used "draftMode().disable()" inside \`after\``
        )
      })
    })

    it('server action', async () => {
      const path = '/draft-mode/server-action'
      const browser = await next.browser(path)
      await browser.elementByCss('button[type="submit"]').click()
      await retry(() => {
        const logs = getLogs()
        expect(logs).toContain(`[${path}] draft.isEnabled: false`)
        expect(logs).toContain(
          `Route ${path} used "draftMode().enable()" inside \`after\``
        )
        expect(logs).toContain(
          `Route ${path} used "draftMode().disable()" inside \`after\``
        )
      })
    })
  })
})
