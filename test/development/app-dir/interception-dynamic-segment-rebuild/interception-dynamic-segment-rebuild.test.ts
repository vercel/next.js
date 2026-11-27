import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'
import type { Page, Response } from 'playwright'

describe('interception-dynamic-segment-rebuild', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The `x-nextjs-rewritten-path` header of every client router (RSC) response
  // the browser itself receives for `/list/1`.
  const rewrittenPaths: string[] = []

  function recordRewrittenPaths(page: Page) {
    page.on('response', (response: Response) => {
      const url = new URL(response.url())
      if (
        url.pathname === '/list/1' &&
        response.request().headers()['rsc'] === '1'
      ) {
        rewrittenPaths.push(response.headers()['x-nextjs-rewritten-path'] ?? '')
      }
    })
  }

  async function openBrowser() {
    const browser = await next.browser('/list', {
      beforePageLoad: recordRewrittenPaths,
    })
    return { browser, rewrittenPaths }
  }

  async function clickFromList(browser: Playwright, linkId: string) {
    // `loadPage` opens a new page, so the response listener is attached again.
    await browser.loadPage(new URL('/list', next.url).href, {
      beforePageLoad: recordRewrittenPaths,
    })
    await browser.waitForElementByCss(`#${linkId}`)
    await browser.elementByCss(`#${linkId}`).click()
  }

  async function expectInterceptedItem(
    browser: Playwright,
    rewrittenPaths: string[]
  ) {
    rewrittenPaths.length = 0
    await clickFromList(browser, 'link-1')
    await retry(async () => {
      expect(await browser.elementByCss('#modal').text()).toBe('Modal item: 1')
      expect(await browser.eval('document.title')).toBe('Modal metadata: 1')
    })
    expect(rewrittenPaths.length).toBeGreaterThan(0)
    for (const rewrittenPath of rewrittenPaths) {
      expect(rewrittenPath).toBe('/list/(.)1')
    }
  }

  async function expectUserRewrites(browser: Playwright) {
    const $ = await next.render$('/user-rewrite')
    expect($('#full-page').text()).toBe('Full page item: 2')

    // The browser sends `Next-Url: /list` on this soft navigation, so the
    // user's `Next-Url` rewrite (to `/list/3`) applies, followed by the
    // generated interception rewrite.
    await clickFromList(browser, 'link-next-url-rewrite')
    await retry(async () => {
      expect(await browser.elementByCss('#modal').text()).toBe('Modal item: 3')
    })
  }

  it('should not prefix intercepted dynamic params with interception markers after rebuilds', async () => {
    const { browser, rewrittenPaths } = await openBrowser()
    await expectInterceptedItem(browser, rewrittenPaths)
    await expectUserRewrites(browser)

    const listPage = await next.readFile('app/list/page.tsx')

    // Every source change re-runs the dev server's route discovery. The
    // generated interception rewrites must be replaced, not appended, or each
    // extra copy adds another `(.)` marker to the intercepted param.
    for (let edit = 1; edit <= 3; edit++) {
      await next.patchFile(
        'app/list/page.tsx',
        `${listPage}\n// edit ${edit}\n`
      )

      await expectInterceptedItem(browser, rewrittenPaths)
      await expectUserRewrites(browser)
    }

    // A direct load still renders the full page.
    const $ = await next.render$('/list/1')
    expect($('#full-page').text()).toBe('Full page item: 1')
  })

  it('should stop intercepting after the intercepting route is removed', async () => {
    const interceptingPage = 'app/list/@modal/(.)[id]/page.tsx'
    const interceptingPageContent = await next.readFile(interceptingPage)
    const { browser, rewrittenPaths } = await openBrowser()

    try {
      await next.deleteFile(interceptingPage)

      // Without the intercepting route, a stale interception rewrite would
      // still rewrite `/list/1` to `/list/(.)1`, which matches no page.
      await retry(async () => {
        await clickFromList(browser, 'link-1')
        expect(await browser.elementByCss('#full-page').text()).toBe(
          'Full page item: 1'
        )
      })
    } finally {
      await next.patchFile(interceptingPage, interceptingPageContent)
    }

    await retry(async () => {
      await expectInterceptedItem(browser, rewrittenPaths)
    })
    await expectUserRewrites(browser)
  })
})
