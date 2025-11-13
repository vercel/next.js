import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from '../../../lib/next-test-utils'

const cacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('use-cache-errors', () => {
  const { next, isRspack, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should not show a false-positive compiler error about a misplaced "use cache" directive', async () => {
    // This is a regression test to ensure that an injected React Refresh
    // statement (`var _s = __turbopack_context__.k.signature`) does not
    // interfere with our "use cache" directive misplacement detection.
    const browser = await next.browser('/')
    await waitForNoRedbox(browser)
  })

  it('should show a runtime error when calling the incorrectly used cache function', async () => {
    const browser = await next.browser('/')
    await browser.elementById('action-button').click()
    if (isRspack) {
      // TODO: the source is missing and the stack leaks rspack internals
      await expect(browser).toDisplayRedbox(`
       {
         "description": "Attempted to call useStuff() from the server but useStuff is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.",
         "environmentLabel": "Cache",
         "label": "Runtime Error",
         "source": null,
         "stack": [
           "<FIXME-file-protocol>",
           "useCachedStuff about:/Cache/webpack-internal:///(action-browser)/app/module-with-use-cache.ts (25:68)",
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
           "useCachedStuff app/module-with-use-cache.ts (16:18)",
           "Page app/page.tsx (22:10)",
         ],
       }
      `)
    }
  })

  it('should not leak generated internal cache function names in call stacks', async () => {
    const browser = await next.browser('/anonymous')

    if (cacheComponentsEnabled) {
      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "kaputt!",
           "environmentLabel": "Prerender",
           "label": "Runtime Error",
           "source": "app/anonymous/page.tsx (4:11) @ <anonymous>
         > 4 |     throw new Error('kaputt!')
             |           ^",
           "stack": [
             "<anonymous> app/anonymous/page.tsx (4:11)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "kaputt!",
           "environmentLabel": "Cache",
           "label": "Runtime Error",
           "source": "app/anonymous/page.tsx (4:11) @ eval
         > 4 |     throw new Error('kaputt!')
             |           ^",
           "stack": [
             "eval app/anonymous/page.tsx (4:11)",
           ],
         }
        `)
      }
    } else {
      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "kaputt!",
           "environmentLabel": "Cache",
           "label": "Runtime Error",
           "source": "app/anonymous/page.tsx (4:11) @ <anonymous>
         > 4 |     throw new Error('kaputt!')
             |           ^",
           "stack": [
             "<anonymous> app/anonymous/page.tsx (4:11)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "kaputt!",
           "environmentLabel": "Cache",
           "label": "Runtime Error",
           "source": "app/anonymous/page.tsx (4:11) @ eval
         > 4 |     throw new Error('kaputt!')
             |           ^",
           "stack": [
             "eval app/anonymous/page.tsx (4:11)",
           ],
         }
        `)
      }
    }
  })
})
