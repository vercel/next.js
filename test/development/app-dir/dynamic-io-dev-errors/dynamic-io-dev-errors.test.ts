import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, hasErrorToast, retry } from 'next-test-utils'
import { createSandbox } from 'development-sandbox'
import { outdent } from 'outdent'

describe('Dynamic IO Dev Errors', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  const isNewOverlay =
    process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY !== 'false'

  it('should show a red box error on the SSR render', async () => {
    const browser = await next.browser('/error')

    if (isNewOverlay) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/error/page.tsx (2:23) @ Page
       > 2 |   const random = Math.random()
           |                       ^",
         "stack": [
           "Page app/error/page.tsx (2:23)",
           "JSON.parse <anonymous> (0:0)",
           "<unknown> <anonymous> (0:0)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "[ Server ] Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/error/page.tsx (2:23) @ Page
       > 2 |   const random = Math.random()
           |                       ^",
         "stack": [
           "Page app/error/page.tsx (2:23)",
           "JSON.parse <anonymous> (0:0)",
           "<unknown> <anonymous> (0:0)",
         ],
       }
      `)
    }
  })

  it('should show a red box error on client navigations', async () => {
    const browser = await next.browser('/no-error')

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(false)
    })

    await browser.elementByCss("[href='/error']").click()

    if (isNewOverlay) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": "app/error/page.tsx (2:23) @ Page
       > 2 |   const random = Math.random()
           |                       ^",
         "stack": [
           "Page app/error/page.tsx (2:23)",
           "JSON.parse <anonymous> (0:0)",
           "<unknown> <anonymous> (0:0)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "[ Server ] Error: Route "/error" used \`Math.random()\` outside of \`"use cache"\` and without explicitly calling \`await connection()\` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random",
         "environmentLabel": null,
         "label": "Console Error",
         "source": "app/error/page.tsx (2:23) @ Page
       > 2 |   const random = Math.random()
           |                       ^",
         "stack": [
           "Page app/error/page.tsx (2:23)",
           "JSON.parse <anonymous> (0:0)",
           "<unknown> <anonymous> (0:0)",
         ],
       }
      `)
    }
  })

  it('should not log unhandled rejections for persistently thrown top-level errors', async () => {
    const cliOutputLength = next.cliOutput.length
    const res = await next.fetch('/top-level-error')
    expect(res.status).toBe(500)

    await retry(() => {
      const cliOutput = stripAnsi(next.cliOutput.slice(cliOutputLength))
      expect(cliOutput).toContain('GET /top-level-error 500')
    })

    expect(next.cliOutput.slice(cliOutputLength)).not.toContain(
      'unhandledRejection'
    )
  })

  // NOTE: when update this snapshot, use `pnpm build` in packages/next to avoid next source code get mapped to source.
  it('should display error when component accessed data without suspense boundary', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/no-accessed-data')

    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'Error: Route "/no-accessed-data"'
      )
    })

    expect(stripAnsi(next.cliOutput.slice(outputIndex))).toContain(
      `\nError: Route "/no-accessed-data": ` +
        `A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. ` +
        `We don't have the exact line number added to error messages yet but you can see which component in the stack below. ` +
        `See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense` +
        '\n    at Page [Server] (<anonymous>)' +
        (isTurbopack
          ? '\n    at main (<anonymous>)' +
            '\n    at body (<anonymous>)' +
            '\n    at html (<anonymous>)' +
            '\n    at Root [Server] (<anonymous>)' +
            // Just need some string to assert that this is the whole stack
            '\n GET /no-accessed-data 200'
          : // TODO(veil): Should be ignore-listed (see https://linear.app/vercel/issue/NDX-464/next-internals-not-ignore-listed-in-terminal-in-webpack#comment-1164a36a)
            '\n    at InnerLayoutRouter (..')
    )

    if (isNewOverlay) {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "Error: Route "/no-accessed-data": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": "Server",
         "label": "Console Error",
         "source": undefined,
         "stack": [
           "Page [Server] <anonymous> (2:1)",
           "main <anonymous> (2:1)",
           "body <anonymous> (2:1)",
           "html <anonymous> (2:1)",
           "Root [Server] <anonymous> (2:1)",
           "JSON.parse <anonymous> (0:0)",
           "<unknown> <anonymous> (0:0)",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayCollapsedRedbox(`
       {
         "count": 1,
         "description": "[ Server ] Error: Route "/no-accessed-data": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. We don't have the exact line number added to error messages yet but you can see which component in the stack below. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense",
         "environmentLabel": null,
         "label": "Console Error",
         "source": undefined,
         "stack": [
           "Page [Server] <anonymous> (2:1)",
           "main <anonymous> (2:1)",
           "body <anonymous> (2:1)",
           "html <anonymous> (2:1)",
           "Root [Server] <anonymous> (2:1)",
           "JSON.parse <anonymous> (0:0)",
           "<unknown> <anonymous> (0:0)",
         ],
       }
      `)
    }
  })

  it('should clear segment errors after correcting them', async () => {
    await using sandbox = await createSandbox(
      next,
      new Map([
        [
          'app/page.tsx',
          outdent`
          export const revalidate = 10
          export default function Page() {
            return (
              <div>Hello World</div>
            );
          }
        `,
        ],
      ])
    )
    const { browser, session } = sandbox
    if (isTurbopack) {
      if (isNewOverlay) {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Failed to compile",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/page.tsx (1:14)
         Ecmascript file had an error
         > 1 | export const revalidate = 10
             |              ^^^^^^^^^^",
           "stack": [],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "count": 1,
           "description": "Failed to compile",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/page.tsx:1:14
         Ecmascript file had an error
         > 1 | export const revalidate = 10
             |              ^^^^^^^^^^",
           "stack": [],
         }
        `)
      }
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "count": 1,
         "description": "Failed to compile",
         "environmentLabel": null,
         "label": "Build Error",
         "source": "./app/page.tsx
       Error:   x Route segment config "revalidate" is not compatible with \`nextConfig.experimental.dynamicIO\`. Please remove it.
          ,-[1:1]
        1 | export const revalidate = 10
          :              ^^^^^^^^^^
        2 | export default function Page() {
        3 |   return (
        4 |     <div>Hello World</div>
          \`----",
         "stack": [],
       }
      `)
    }

    await session.patch(
      'app/page.tsx',
      outdent`
      export default function Page() {
        return (
          <div>Hello World</div>
        );
      }
    `
    )

    await assertNoRedbox(browser)
  })
})
