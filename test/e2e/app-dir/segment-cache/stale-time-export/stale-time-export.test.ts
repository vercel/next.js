import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('segment cache - export const unstable_staleTime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev || isCacheComponentsEnabled) {
    test('skipped in development', () => {})
    return
  }

  it('overrides global staleTimes config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Page with unstable_staleTime = 300'

    // Prefetch page with unstable_staleTime=300 (5 minutes)
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/stale-5-minutes"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      { includes: pageContent }
    )

    // Hide link
    await toggleLink.click()

    // Advance 31 seconds - past global staleTimes (30s), within page unstable_staleTime (300s)
    await page.clock.fastForward(31 * 1000)

    /*
        Should NOT refetch the content - page's unstable_staleTime=300 hasn't elapsed.

        Note there may be another tree prefetch, since that's controlled separately. So
        we just assert that the actual content of the page is not refetched.
      */
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      { includes: pageContent, block: 'reject' }
    )

    // Hide link
    await toggleLink.click()

    // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      { includes: pageContent }
    )
  })

  // TODO: Test for caching unstable_staleTime on navigation without prefetch
  //
  // Currently, navigation responses (without prefetch) cache the route tree
  // but not the segment data. The route tree cache entry is found on subsequent
  // navigations, but since segment data isn't cached, a server request is still
  // made. Fully implementing this feature requires writing segment data to the
  // segment cache during navigation, which is a more significant change.
  //
  // The unstable_staleTime segment config works correctly for prefetched routes.
})

describe('unstable_staleTime - layout build error', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error when unstable_staleTime is used in a layout', async () => {
    await next.patchFile(
      'app/layout.tsx',
      outdent`
        export const unstable_staleTime = 60

        export default function RootLayout({
          children,
        }: {
          children: React.ReactNode
        }) {
          return (
            <html lang="en">
              <body>{children}</body>
            </html>
          )
        }
      `,
      async () => {
        try {
          await next.start()
        } catch {
          // we expect the build/start to fail
        }

        if (isNextDev) {
          // In dev mode, we need to trigger the compilation by visiting the page
          await next.fetch('/')
        }

        await retry(async () => {
          expect(next.cliOutput).toContain(
            "`unstable_staleTime` is only supported in pages, but you're using it in a layout. Please remove it."
          )
        })
      }
    )
  })
})

describe('unstable_staleTime - cacheComponents build error', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error when unstable_staleTime is used with cacheComponents', async () => {
    await next.patchFile(
      'next.config.js',
      outdent`
        module.exports = {
          cacheComponents: true,
        }
      `,
      async () => {
        try {
          await next.start()
        } catch {
          // we expect the build/start to fail
        }

        if (isNextDev) {
          // In dev mode, we need to trigger the compilation by visiting a page
          // with unstable_staleTime
          await next.fetch('/stale-5-minutes')
        }

        await retry(async () => {
          if (isTurbopack) {
            expect(next.cliOutput).toContain(
              '"unstable_staleTime" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
            )
          } else {
            expect(next.cliOutput).toContain(
              'cannot use `export const unstable_staleTime = ...` when `cacheComponents` is enabled.'
            )
          }
        })
      }
    )
  })
})
