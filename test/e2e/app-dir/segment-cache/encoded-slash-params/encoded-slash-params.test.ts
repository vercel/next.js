import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

/**
 * When a dynamic param contains a percent-encoded forward slash (`%2F`), the
 * client double-encodes the URL part when deriving its segment cache key, while
 * the server encodes the decoded value once. The resulting segment mismatch
 * causes the navigation reducer to invalidate the entire route cache, so any
 * later prefetch for the same URL re-fetches the route tree
 * (`next-router-segment-prefetch: /_tree`).
 *
 * The fixture is intentionally fully dynamic (no `generateStaticParams`): a
 * statically prerendered file is served from the CDN without the `%2F`
 * round-trip the bug depends on.
 */
describe('segment cache - encoded slash params', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('prefetching is disabled in dev mode', () => {})
    return
  }

  describe.each([
    { label: 'unencoded param', href: '/foo' },
    { label: 'encoded slash in param', href: '/foo%2Fbar' },
  ])('$label', ({ href }) => {
    it('back navigation does not refetch the route tree', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      // Reveal the link — wait for the prefetch to settle.
      await act(async () => {
        const toggle = await browser.elementByCss(
          `input[data-link-accordion="${href}"]`
        )
        await toggle.click()
      })

      // Click through. The prefetched data should satisfy this nav.
      const link = await browser.elementByCss(`a[href="${href}"]`)
      await act(async () => {
        await link.click()
      })
      await browser.elementByCss('[data-slug-page]')

      // Browser back to the home page, then ensure the link is revealed. The
      // route tree cache already has an entry for the URL — the re-prefetch on
      // Link mount must not fire any requests. With the encoded-slash bug, the
      // cache lookup misses and a `next-router-segment-prefetch: /_tree`
      // request goes out.
      await act(async () => {
        await browser.back()
        await browser.elementById('hub')

        // BFCache restoration of `useState` is browser-dependent. If the Link
        // isn't in the DOM (checkbox unchecked), click the toggle to reveal it.
        const linkSelector = `a[href="${href}"]`
        if (!(await browser.hasElementByCssSelector(linkSelector))) {
          const toggle = await browser.elementByCss(
            `input[data-link-accordion="${href}"]`
          )
          await toggle.click()
        }

        await browser.elementByCss(linkSelector)
      }, 'no-requests')
    })
  })
})
