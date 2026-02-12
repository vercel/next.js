import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
  RSC_HEADER,
} from 'next/dist/client/components/app-router-headers'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('segment cache - export const unstable_staleTime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev || isCacheComponentsEnabled) {
    test('skipped', () => {})
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

  it('does not apply unstable_staleTime when route-tree prefetch short-circuits', async () => {
    const response = await next.fetch('/stale-5-minutes', {
      headers: {
        [RSC_HEADER]: '1',
        [NEXT_ROUTER_PREFETCH_HEADER]: '1',
        [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: '/_tree',
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get(NEXT_ROUTER_STALE_TIME_HEADER)).toBeNull()

    const prefetchResponse = await response.text()
    expect(prefetchResponse).not.toContain(
      'Page with unstable_staleTime = 300 (5 minutes)'
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
            '`unstable_staleTime` is only supported in page files (`page.js`, `page.jsx`, `page.ts`, `page.tsx`). You are using it in a layout file. Move this export to the corresponding page file or remove it from the layout.'
          )
        })
      }
    )
  })
})

describe('unstable_staleTime - cacheComponents', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should allow unstable_staleTime when cacheComponents is enabled', async () => {
    await next.patchFile(
      'next.config.js',
      outdent`
        module.exports = {
          cacheComponents: true,
        }
      `,
      async () => {
        await next.start()

        if (isNextDev) {
          // In dev mode, trigger compilation and ensure the route is served.
          await next.fetch('/stale-5-minutes')
          expect(next.cliOutput).not.toContain(
            'cannot use `export const unstable_staleTime = ...` when `cacheComponents` is enabled.'
          )
          expect(next.cliOutput).not.toContain(
            '"unstable_staleTime" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
          )
        } else {
          const pageMeta = JSON.parse(
            await next.readFile('.next/server/app/stale-5-minutes.meta')
          )
          expect(pageMeta.headers['x-nextjs-stale-time']).toBe('300')
        }

        const response = await next.fetch('/stale-5-minutes')
        expect(response.status).toBe(200)
      }
    )
  })
})
