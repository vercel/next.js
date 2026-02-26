import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'
import { outdent } from 'outdent'

describe('segment cache - export const unstable_staleTime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped', () => {})
    return
  }

  it('overrides the default staleTimes.static value during prefetching', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Static page with unstable_staleTime = 360'

    // Prefetch static page with unstable_staleTime=360 (6 minutes)
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/static-stale-6-minutes"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-6-minutes"]')
      },
      { includes: pageContent }
    )

    // Hide link
    await toggleLink.click()

    // Advance 5 minutes + 1ms - past default staleTimes.static (300s),
    // within page unstable_staleTime (360s)
    await page.clock.fastForward(5 * 60 * 1000 + 1)

    // Should NOT refetch page content - page's unstable_staleTime=360
    // hasn't elapsed.
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-6-minutes"]')
      },
      { includes: pageContent, block: 'reject' }
    )

    // Hide link
    await toggleLink.click()

    // Advance to 6 minutes + 1ms total - past unstable_staleTime=360
    await page.clock.fastForward(6 * 60 * 1000 - (5 * 60 * 1000 + 1) + 1)

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-6-minutes"]')
      },
      { includes: pageContent }
    )
  })

  it('overrides the default staleTimes.dynamic value when navigating back via link', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Dynamic page with unstable_staleTime = 300'

    // Navigate to dynamic page with unstable_staleTime=300 (5 minutes)
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent }
    )

    // Navigate back to home using a link in the page.
    await browser.elementByCss('#back-to-home').click()
    await browser.elementByCss(
      'input[data-link-accordion="/dynamic-stale-5-minutes"]'
    )

    // Advance 31 seconds - past default staleTimes.dynamic (0s), within page unstable_staleTime (300s)
    await page.clock.fastForward(31 * 1000)

    // Navigation should NOT refetch - page's unstable_staleTime=300 hasn't elapsed
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
        .click()
      await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
    }, 'no-requests')

    // Navigate back to home using a link in the page.
    await browser.elementByCss('#back-to-home').click()
    await browser.elementByCss(
      'input[data-link-accordion="/dynamic-stale-5-minutes"]'
    )

    // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent }
    )
  })

  it('overrides the default staleTimes.dynamic value when navigating back via browser back', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Dynamic page with unstable_staleTime = 300'

    // Navigate to dynamic page with unstable_staleTime=300 (5 minutes)
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent }
    )

    // Advance 31 seconds - past default staleTimes.dynamic (0s), within page unstable_staleTime (300s)
    await browser.back()
    await page.clock.fastForward(31 * 1000)

    // Navigation should NOT refetch - page's unstable_staleTime=300 hasn't elapsed
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
        .click()
      await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
    }, 'no-requests')

    // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
    await browser.back()
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent }
    )
  })
})

describe('build-time validations', () => {
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
