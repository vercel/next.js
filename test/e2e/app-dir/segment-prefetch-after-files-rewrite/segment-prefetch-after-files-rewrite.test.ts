import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

const basePath = '/base'

// A user afterFiles catch-all rewrite (`/:slug` -> `/rewritten/:slug`) must not
// break the router's prefetches. Prefetching a link to a page that exists, or
// to a path the rewrite serves, must not produce a failed router request.
// `createRouterAct` fails the test on any 4xx or 5xx router response.
describe('segment-prefetch-after-files-rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function startBrowser() {
    let act: ReturnType<typeof createRouterAct> | undefined
    const browser = await next.browser(basePath, {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page, { includeAppShellRequests: true })
      },
    })
    if (act === undefined) {
      throw new Error('Router act was not initialized')
    }
    return { browser, act }
  }

  it.each([
    { pathname: '/dynamic-page', page: 'Per-request page' },
    { pathname: '/unknown', page: 'Rewrite target' },
  ])('renders $pathname on a direct visit', async ({ pathname, page }) => {
    const $ = await next.render$(`${basePath}${pathname}`)
    expect($('#page').text()).toBe(page)
  })

  async function prefetchAndNavigate(
    href: string,
    {
      page,
      includes,
      content,
    }: { page: string; includes: string; content: string }
  ) {
    const { browser, act } = await startBrowser()

    // Reveal the link, which prefetches it.
    await act(async () => {
      await browser.elementByCss(`input[data-link-accordion="${href}"]`).click()
    })

    await act(
      async () => {
        await browser.elementByCss(`a[href="${basePath}${href}"]`).click()
      },
      { includes }
    )

    expect(await browser.elementById('page').text()).toBe(page)
    expect(await browser.elementById('content').text()).toBe(content)
  }

  // @force-gate prefetching
  it('prefetches and then navigates to a page rendered per request', async () => {
    await prefetchAndNavigate('/dynamic-page', {
      page: 'Per-request page',
      includes: 'Per-request content',
      content: 'Per-request content',
    })
  })

  // @force-gate prefetching
  it('prefetches and then navigates to a path served by the rewrite', async () => {
    await prefetchAndNavigate('/unknown', {
      page: 'Rewrite target',
      // The slug is a separate text node in the RSC payload.
      includes: 'Rewrite target content',
      content: 'Rewrite target content: unknown',
    })
  })
})
