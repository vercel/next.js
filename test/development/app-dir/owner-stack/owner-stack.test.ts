import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

// These stacks are not sourcemapped and therefore not ignore-listed.
// Feel free to update internal frames in assertions.
function normalizeBrowserConsoleStackTrace(trace: unknown) {
  if (typeof trace !== 'string') {
    return trace
  }
  return (
    trace
      // Removes React's internals i.e. incomplete ignore-listing
      .split(
        /at (react-stack-bottom-frame|Object\.react_stack_bottom_frame).*/m
      )[0]
      // Remove the location `()` part in every line of stack trace;
      .replace(/\(.*\)/g, '')
      // Remove the leading spaces in every line of stack trace;
      .replace(/^\s+/gm, '')
      .trim()
  )
}

describe('app-dir - owner-stack', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should log stitched error for browser uncaught errors', async () => {
    let errorStack: string | undefined
    const browser = await next.browser('/browser/uncaught', {
      beforePageLoad: (page) => {
        page.on('pageerror', (error: unknown) => {
          errorStack = (error as any).stack
        })
      },
    })

    if (!isTurbopack) {
      // Wait for Redbox to settle.
      // TODO: Don't reload when landing on a faulty page.
      // The issue may be that we receive an HMR update at all on landing.
      // This is flaky. Sometimes we miss that the reload happened.
      await retry(
        async () => {
          const logs = await browser.log()
          expect(logs).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message:
                  '[Fast Refresh] performing full reload because your application had an unrecoverable error',
              }),
            ])
          )
        },
        1000,
        200
      ).catch(() => {})
    }

    await expect(browser).toDisplayRedbox(`
     {
       "description": "browser error",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/browser/uncaught/page.js (5:11) @ useThrowError
     > 5 |     throw new Error('browser error')
         |           ^",
       "stack": [
         "useThrowError app/browser/uncaught/page.js (5:11)",
         "useErrorHook app/browser/uncaught/page.js (10:3)",
         "Page app/browser/uncaught/page.js (14:3)",
       ],
     }
    `)

    expect(normalizeBrowserConsoleStackTrace(errorStack))
      .toMatchInlineSnapshot(`
     "Error: browser error
     at useThrowError 
     at useErrorHook 
     at Page"
    `)
  })

  it('should log stitched error for browser caught errors', async () => {
    const browser = await next.browser('/browser/caught')

    await assertNoRedbox(browser)

    const logs = await browser.log()
    const errorLog = logs.find((log) => {
      return log.message.includes('Error: browser error')
    }).message

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "browser error",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/browser/caught/page.js (34:11) @ useThrowError
     > 34 |     throw new Error('browser error')
          |           ^",
       "stack": [
         "useThrowError app/browser/caught/page.js (34:11)",
         "useErrorHook app/browser/caught/page.js (39:3)",
         "Thrower app/browser/caught/page.js (29:3)",
         "Inner app/browser/caught/page.js (23:7)",
         "Page app/browser/caught/page.js (43:10)",
       ],
     }
    `)

    expect(normalizeBrowserConsoleStackTrace(errorLog)).toMatchInlineSnapshot(`
     "%o
     %s Error: browser error
     at useThrowError 
     at useErrorHook 
     at Thrower"
    `)
  })

  it('should log stitched error for SSR errors', async () => {
    let errorStack: string | undefined
    const browser = await next.browser('/ssr', {
      beforePageLoad: (page) => {
        page.on('pageerror', (error: unknown) => {
          errorStack = (error as any).stack
        })
      },
    })

    await expect(browser).toDisplayRedbox(`
     {
       "description": "ssr error",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": "app/ssr/page.js (4:9) @ useThrowError
     > 4 |   throw new Error('ssr error')
         |         ^",
       "stack": [
         "useThrowError app/ssr/page.js (4:9)",
         "useErrorHook app/ssr/page.js (8:3)",
         "Page app/ssr/page.js (12:3)",
       ],
     }
    `)

    expect(normalizeBrowserConsoleStackTrace(errorStack))
      .toMatchInlineSnapshot(`
     "Error: ssr error
     at useThrowError 
     at useErrorHook 
     at Page"
    `)
  })

  it('should capture unhandled promise rejections', async () => {
    const browser = await next.browser('/browser/reject-promise')

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "string in rejected promise",
       "environmentLabel": null,
       "label": "Runtime Error",
       "source": null,
       "stack": [],
     }
    `)
  })
})
