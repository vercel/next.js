import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

const basePath = '/base'

function withBasePath(pathname: string) {
  return pathname === '/' ? basePath : `${basePath}${pathname}`
}

// The fixed-path pages below have no separate `.rsc` function output. Their
// RSC requests reach the page function through internal routing entries. A
// user afterFiles catch-all rewrite (`/:slug` -> `/rewritten/:slug`) competes
// with those entries and must not capture them. This suite is deploy-active,
// so it also covers how a deployment adapter handles those entries.
describe('adapter-rsc-after-files-rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function startBrowser(pathname: string) {
    let act: ReturnType<typeof createRouterAct> | undefined
    const browser = await next.browser(withBasePath(pathname), {
      beforePageLoad(page: Playwright.Page) {
        act = createRouterAct(page, { includeAppShellRequests: true })
      },
    })
    if (act === undefined) {
      throw new Error('Router act was not initialized')
    }
    await browser.eval('window.__testDocument = "retained"')
    return { browser, act }
  }

  async function navigate(
    { browser, act }: Awaited<ReturnType<typeof startBrowser>>,
    href: string,
    includes?: string
  ) {
    const scope = async () => {
      await browser.elementByCss(`input[data-link-accordion="${href}"]`).click()
      await browser.elementByCss(`a[href="${withBasePath(href)}"]`).click()
    }
    if (includes === undefined) {
      await act(scope)
    } else {
      await act(scope, { includes })
    }
  }

  async function expectPage(
    { browser }: Awaited<ReturnType<typeof startBrowser>>,
    {
      pathname,
      page,
      content,
    }: { pathname: string; page: string; content: string }
  ) {
    expect(await browser.elementById('page').text()).toBe(page)
    expect(await browser.elementById('content').text()).toBe(content)
    // The logical pathname excludes the base path. The URL keeps it.
    expect(await browser.elementById('pathname').text()).toBe(pathname)
    expect(new URL(await browser.url()).pathname).toBe(withBasePath(pathname))
    // A client navigation keeps the document. A full reload would not.
    expect(await browser.eval('window.__testDocument')).toBe('retained')
  }

  it.each([
    { pathname: '/', page: 'Root page' },
    { pathname: '/dynamic-page', page: 'Per-request page' },
    { pathname: '/static-page', page: 'Prerendered page' },
    { pathname: '/unknown', page: 'Rewrite target' },
  ])('renders $pathname on a direct visit', async ({ pathname, page }) => {
    const $ = await next.render$(withBasePath(pathname))
    expect($('#page').text()).toBe(page)
  })

  it('navigates to a fixed-path page rendered per request', async () => {
    const session = await startBrowser('/')
    await navigate(session, '/dynamic-page', 'Per-request content')
    await expectPage(session, {
      pathname: '/dynamic-page',
      page: 'Per-request page',
      content: 'Per-request content',
    })
  })

  it('navigates to a prerendered fixed-path page', async () => {
    const session = await startBrowser('/')
    // Both the prefetch and the navigation may carry the prerendered content,
    // depending on the mode, so assert on the rendered page instead.
    await navigate(session, '/static-page')
    await expectPage(session, {
      pathname: '/static-page',
      page: 'Prerendered page',
      content: 'Prerendered content',
    })
  })

  it('navigates to the root page', async () => {
    const session = await startBrowser('/dynamic-page')
    await navigate(session, '/', 'Root request content')
    await expectPage(session, {
      pathname: '/',
      page: 'Root page',
      content: 'Root request content',
    })
  })

  it('serves a path without a page through the rewrite', async () => {
    const session = await startBrowser('/')
    await navigate(session, '/unknown', 'Rewrite target content')
    await expectPage(session, {
      pathname: '/unknown',
      page: 'Rewrite target',
      content: 'Rewrite target content: unknown',
    })
  })

  // @force-gate prefetching
  it('prefetches and then navigates to a page rendered per request', async () => {
    const session = await startBrowser('/')
    const { browser, act } = session
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-page"]')
        .click()
    })
    await act(
      async () => {
        await browser
          .elementByCss(`a[href="${withBasePath('/dynamic-page')}"]`)
          .click()
      },
      { includes: 'Per-request content' }
    )
    await expectPage(session, {
      pathname: '/dynamic-page',
      page: 'Per-request page',
      content: 'Per-request content',
    })
  })
})
