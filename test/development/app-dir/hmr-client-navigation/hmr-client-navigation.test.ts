import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

// Edits to client components that only the destination of a client-side
// navigation uses must be applied with Fast Refresh. The destination's HMR
// chunk list is not part of the HTML that was loaded initially, so it has to
// be loaded and subscribed to as part of the navigation.
describe('hmr-client-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    patchFileDelay: 500,
  })

  type Browser = Awaited<ReturnType<typeof next.browser>>

  async function openBrowser(url: string) {
    let page!: Playwright.Page
    const browser = await next.browser(url, {
      beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
      },
    })
    return { browser, act: createRouterAct(page) }
  }

  // Returns an identifier of the current document. It changes on a full page
  // load, so it is used to assert that navigations and edits are soft.
  function getTimeOrigin(browser: Browser): Promise<number> {
    return browser.eval('performance.timeOrigin')
  }

  async function navigate(
    browser: Browser,
    act: ReturnType<typeof createRouterAct>,
    href: string
  ) {
    await act(async () => {
      await browser.elementByCss(`input[data-link-accordion="${href}"]`).click()
      await browser.elementByCss(`a[href="${href}"]`).click()
    })
  }

  async function expectEditApplied({
    browser,
    selector,
    filePath,
    text,
  }: {
    browser: Browser
    selector: string
    filePath: string
    text: string
  }) {
    await retry(async () => {
      expect(await browser.elementByCss(selector).text()).toBe(text)
    })

    const originalContent = await next.readFile(filePath)
    try {
      await next.patchFile(
        filePath,
        originalContent.replace(`>${text}<`, `>${text} edited<`)
      )

      await retry(async () => {
        expect(await browser.elementByCss(selector).text()).toBe(
          `${text} edited`
        )
      })
    } finally {
      await next.patchFile(filePath, originalContent)
    }
  }

  it('should apply edits to a client page after a client-side navigation', async () => {
    const { browser, act } = await openBrowser('/')
    const timeOrigin = await getTimeOrigin(browser)

    await navigate(browser, act, '/client-page')
    await expectEditApplied({
      browser,
      selector: '#client-page',
      filePath: join('app', 'client-page', 'page.tsx'),
      text: 'client page',
    })

    // Neither the navigation nor the edit may load a new document.
    expect(await getTimeOrigin(browser)).toEqual(timeOrigin)
  })

  it('should apply edits to a client component of a server page after a client-side navigation', async () => {
    const { browser, act } = await openBrowser('/')
    const timeOrigin = await getTimeOrigin(browser)

    await navigate(browser, act, '/server-page')
    await expectEditApplied({
      browser,
      selector: '#server-page-client-component',
      filePath: join('app', 'server-page', 'client-component.tsx'),
      text: 'client component',
    })

    // Neither the navigation nor the edit may load a new document.
    expect(await getTimeOrigin(browser)).toEqual(timeOrigin)
  })

  it('should apply edits to a client page that was loaded directly', async () => {
    const { browser } = await openBrowser('/client-page')
    const timeOrigin = await getTimeOrigin(browser)

    await expectEditApplied({
      browser,
      selector: '#client-page',
      filePath: join('app', 'client-page', 'page.tsx'),
      text: 'client page',
    })

    // The edit may not load a new document.
    expect(await getTimeOrigin(browser)).toEqual(timeOrigin)
  })
})
