import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from '../../../lib/next-test-utils'

describe('use-cache-errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })
  const isRspack = Boolean(process.env.NEXT_RSPACK)

  it('should not show a false-positive compiler error about a misplaced "use cache" directive', async () => {
    // This is a regression test to ensure that an injected React Refresh
    // statement (`var _s = __turbopack_context__.k.signature`) does not
    // interfere with our "use cache" directive misplacement detection.
    const browser = await next.browser('/')
    await assertNoRedbox(browser)
  })

  it('should show a runtime error when calling the incorrectly used cache function', async () => {
    const browser = await next.browser('/')
    await browser.elementById('action-button').click()

    if (isTurbopack) {
      // TODO(veil): The wrong stack frame is used for the source snippet.
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Attempted to call useStuff() from the server but useStuff is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/page.tsx (22:10) @ Page
       > 22 |   return <OtherClientComponent getCachedStuff={useCachedStuff} />
            |          ^",
         "stack": [
           "<FIXME-file-protocol>",
           "<FIXME-file-protocol>",
           "Page app/page.tsx (22:10)",
         ],
       }
      `)
    } else if (isRspack) {
      // TODO: the source is missing and the stack leaks rspack internals
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Attempted to call useStuff() from the server but useStuff is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": null,
         "stack": [
           "<FIXME-file-protocol>",
           "useCachedStuff rsc:/Cache/webpack-internal:///(action-browser)/app/module-with-use-cache.ts (25:68)",
           "Page ./app/page.tsx",
         ],
       }
      `)
    } else {
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Attempted to call useStuff() from the server but useStuff is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": "app/module-with-use-cache.ts (16:18) @ useCachedStuff
       > 16 |   return useStuff()
            |                  ^",
         "stack": [
           "<FIXME-file-protocol>",
           "useCachedStuff app/module-with-use-cache.ts (16:18)",
           "Page app/page.tsx (22:10)",
         ],
       }
      `)
    }
  })
})
