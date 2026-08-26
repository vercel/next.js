import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache prefetching in dev mode', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('should skip for webpack (turbopackPrefetchInDev is Turbopack-only)', () => {})
    return
  }

  it('prefetches and navigates correctly in dev mode', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Step 1: Reveal the link to trigger a viewport prefetch.
    // In dev mode the server returns a route-tree response (not full page
    // content), but we still expect at least one RSC request to be issued.
    await act!(async () => {
      const checkbox = await browser.elementByCss(
        'input[data-link-accordion="/page-b"]'
      )
      await checkbox.click()
    })

    // Step 2: Click the link. The navigation will fetch the page content.
    await act!(async () => {
      const link = await browser.elementByCss('a[href="/page-b"]')
      await link.click()
    })

    // Step 3: Verify the page content is correct.
    const heading = await browser.elementById('page-b-heading').text()
    expect(heading).toBe('Page B Content')

    const layout = await browser.elementById('page-b-layout').text()
    expect(layout).toContain('Page B Layout')
  })

  it('navigation after editing a prefetched page shows updated content', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Step 1: Reveal the link to trigger a viewport prefetch.
    // In dev mode the prefetch only caches the route tree — not page content —
    // so editing source files before navigating should always show fresh output.
    await act!(async () => {
      const checkbox = await browser.elementByCss(
        'input[data-link-accordion="/page-b"]'
      )
      await checkbox.click()
    })

    // Step 2: Edit page B's layout and page component on disk.
    await next.patchFile('app/page-b/layout.tsx', (content) =>
      content.replace('Page B Layout', 'Updated Page B Layout')
    )
    await next.patchFile('app/page-b/page.tsx', (content) =>
      content.replace('Page B Content', 'Updated Page B Content')
    )

    try {
      // Step 3: Navigate to page B. The navigation issues a fresh render
      // request, so the response must reflect the edited files.
      await act!(async () => {
        const link = await browser.elementByCss('a[href="/page-b"]')
        await link.click()
      })

      // Step 4: Verify the updated content — not stale prefetch data.
      // retry() accommodates the time Turbopack needs to recompile the edits.
      await retry(
        async () => {
          const heading = await browser.elementById('page-b-heading').text()
          expect(heading).toBe('Updated Page B Content')

          const layout = await browser.elementById('page-b-layout').text()
          expect(layout).toContain('Updated Page B Layout')
        },
        30_000,
        500
      )
    } finally {
      // Restore the original files.
      await next.patchFile('app/page-b/layout.tsx', (content) =>
        content.replace('Updated Page B Layout', 'Page B Layout')
      )
      await next.patchFile('app/page-b/page.tsx', (content) =>
        content.replace('Updated Page B Content', 'Page B Content')
      )
    }
  })
})
