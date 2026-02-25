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

  it('overrides the global staleTimes.static config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Page with unstable_staleTime static=300'

    // Prefetch page with unstable_staleTime { static: 300 } (5 minutes)
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/static-5-minutes"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-5-minutes"]')
      },
      { includes: pageContent }
    )

    // Hide link
    await toggleLink.click()

    // Advance 31 seconds - past global staleTimes (30s), within page static staleTime (300s)
    await page.clock.fastForward(31 * 1000)

    /*
      Should NOT refetch the content - page's static staleTime=300 hasn't elapsed.

      Note there may be another tree prefetch, since that's controlled separately. So
      we just assert that the actual content of the page is not refetched.
    */
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-5-minutes"]')
      },
      { includes: pageContent, block: 'reject' }
    )

    // Hide link
    await toggleLink.click()

    // Advance to 5 minutes + 1ms total - past static staleTime=300
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - static staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-5-minutes"]')
      },
      { includes: pageContent }
    )
  })

  it.only('overrides the global staleTimes.dynamic config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Page with unstable_staleTime dynamic=300'

    // Navigate to the dynamic page. Dynamic content is not included in the
    // prefetch, so it's fetched during the navigation.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-5-minutes"]').click()
      },
      { includes: pageContent }
    )

    await browser.back()

    // Advance 31 seconds - past the global staleTimes.dynamic (30s), but
    // within the page's dynamic staleTime (300s). Navigating again should
    // reuse the cached data without a new request.
    await page.clock.fastForward(31 * 1000)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-5-minutes"]').click()
      },
      { includes: pageContent, block: 'reject' }
    )

    // await browser.back()

    // // Advance to 5 minutes + 1ms total - past the page's dynamic staleTime
    // // of 300s. This time the data is stale, so we should issue a new request.
    // await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // await act(
    //   async () => {
    //     const link = await browser.elementByCss('a[href="/dynamic-5-minutes"]')
    //     await link.click()
    //   },
    //   { includes: pageContent }
    // )
  })
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
        export const unstable_staleTime = { static: 60 }

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
