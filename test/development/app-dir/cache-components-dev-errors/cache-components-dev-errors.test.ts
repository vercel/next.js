import stripAnsi from 'strip-ansi'
import { nextTestSetup } from 'e2e-utils'
import {
  waitForNoRedbox,
  waitForNoErrorToast,
  hasErrorToast,
  retry,
} from 'next-test-utils'
import { outdent } from 'outdent'

describe('Cache Components Dev Errors', () => {
  const { isTurbopack, next, isRspack } = nextTestSetup({
    files: __dirname,
  })

  it('should show a red box error on the SSR render', async () => {
    const browser = await next.browser('/error')

    // TODO(veil): The "Page <anonymous>" frame should be omitted.
    // Interestingly, it only appears on initial load, and not when
    // soft-navigating to the page (see test below).
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1295",
       "description": "Next.js encountered the unstable value Math.random() while prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/error/page.tsx (2:23) @ Page
     > 2 |   const random = Math.random()
         |                       ^",
       "stack": [
         "Page app/error/page.tsx (2:23)",
         "Page <anonymous>",
       ],
     }
    `)
  })

  it('should not show a red box error on client navigations', async () => {
    const browser = await next.browser('/no-error')

    await retry(async () => {
      expect(await hasErrorToast(browser)).toBe(false)
    })

    await browser.elementByCss("[href='/error']").click()
    await waitForNoErrorToast(browser)

    await browser.loadPage(`${next.url}/error`)

    // TODO: React should not include the anon stack in the Owner Stack.
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1295",
       "description": "Next.js encountered the unstable value Math.random() while prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/error/page.tsx (2:23) @ Page
     > 2 |   const random = Math.random()
         |                       ^",
       "stack": [
         "Page app/error/page.tsx (2:23)",
         "Page <anonymous>",
       ],
     }
    `)
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
      'https://nextjs.org/docs/messages/blocking-prerender-dynamic'
    )

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "code": "E1318",
       "description": "Next.js encountered uncached data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/no-accessed-data/page.js (2:9) @ Page
     > 2 |   await new Promise((r) => setTimeout(r, 200))
         |         ^",
       "stack": [
         "Page app/no-accessed-data/page.js (2:9)",
       ],
     }
    `)
  })

  it('should clear segment errors after correcting them', async () => {
    let browser: any
    await next.patchFile(
      'app/page.tsx',
      outdent`
      export const revalidate = 10
      export default function Page() {
        return (
          <div>Hello World</div>
        );
      }
    `,
      async () => {
        browser = await next.browser('/')
        if (isTurbopack) {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "Route segment config "revalidate" is not compatible with \`nextConfig.cacheComponents\`. Please remove it.",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "./app/page.tsx (1:14)
           Route segment config "revalidate" is not compatible with \`nextConfig.cacheComponents\`. Please remove it.
           > 1 | export const revalidate = 10
               |              ^^^^^^^^^^",
             "stack": [],
           }
          `)
        } else if (isRspack) {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "  ╰─▶   × Error:   x Route segment config "revalidate" is not compatible with \`nextConfig.cacheComponents\`. Please remove it.",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "./app/page.tsx
             ╰─▶   × Error:   x Route segment config "revalidate" is not compatible with \`nextConfig.cacheComponents\`. Please remove it.
                   │    ,-[1:1]
                   │  1 | export const revalidate = 10
                   │    :              ^^^^^^^^^^
                   │  2 | export default function Page() {
                   │  3 |   return (
                   │  4 |     <div>Hello World</div>
                   │    \`----
                   │",
             "stack": [],
           }
          `)
        } else {
          await expect(browser).toDisplayRedbox(`
           {
             "description": "  x Route segment config "revalidate" is not compatible with \`nextConfig.cacheComponents\`. Please remove it.",
             "environmentLabel": null,
             "label": "Build Error",
             "source": "./app/page.tsx
           Error:   x Route segment config "revalidate" is not compatible with \`nextConfig.cacheComponents\`. Please remove it.
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
      }
    )

    await waitForNoRedbox(browser)
  })
})
