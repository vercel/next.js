import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache prefetching in dev mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('hover over a link triggers a prefetch', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Hovering over the link should trigger a prefetch request.
    // In dev mode, the response includes the freshly-compiled page B content.
    await act!(
      async () => {
        const link = await browser.elementByCss('a[href="/page-b"]')
        await link.hover()
      },
      { includes: 'Page B Content' }
    )
  })

  it('navigating after editing a prefetched page shows updated content', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Step 1: Hover to trigger a prefetch for page B and wait for it to complete.
    await act!(
      async () => {
        const link = await browser.elementByCss('a[href="/page-b"]')
        await link.hover()
      },
      { includes: 'Page B Content' }
    )

    // Step 2: Edit page B's layout and page component on disk.
    await next.patchFile('app/page-b/layout.tsx', (content) =>
      content.replace('Page B Layout', 'Updated Page B Layout')
    )
    await next.patchFile('app/page-b/page.tsx', (content) =>
      content.replace('Page B Content', 'Updated Page B Content')
    )

    try {
      // Step 3: Navigate to page B by clicking the link.
      await act!(async () => {
        const link = await browser.elementByCss('a[href="/page-b"]')
        await link.click()
      })

      // Step 4: Verify the updated content is shown — not the stale prefetch data.
      // Use retry() because dev mode needs time to compile the updated files.
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
