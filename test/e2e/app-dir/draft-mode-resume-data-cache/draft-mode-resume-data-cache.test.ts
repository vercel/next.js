import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'
import { createRouterAct } from 'router-act'

// @force-gate prefetching
describe('draft-mode-resume-data-cache', () => {
  const { next, isNextStart } = nextTestSetup({ files: __dirname })

  async function createBrowser(
    pathname: string,
    isDraftModeEnabled: boolean,
    disableJavaScript = false
  ) {
    let page: Playwright.Page
    const browser = await next.browser(
      `/draft?enabled=${isDraftModeEnabled ? '1' : '0'}&redirectTo=${encodeURIComponent(pathname)}`,
      {
        disableJavaScript,
        async beforePageLoad(browserPage: Playwright.Page) {
          page = browserPage
        },
      }
    )
    return {
      browser,
      page: page!,
      act: createRouterAct(page!, { includeAppShellRequests: true }),
    }
  }

  it('renders fresh draft documents without cache miss warnings and preserves values for requests without draft mode', async () => {
    const initialDocument = await next.render$('/article/a')
    const initialLayoutValue = initialDocument('#layout-content').text()
    const initialPageValue = initialDocument('#page-content').text()
    const outputIndex = next.cliOutput.length
    const { browser } = await createBrowser('/article/a', true)

    expect(await browser.elementById('current-mode').text()).toBe('DRAFT')
    const draftLayout = await browser.elementById('layout-content').text()
    const draftPage = await browser.elementById('page-content').text()
    expect(draftLayout).toStartWith('draft:layout:')
    expect(draftPage).toStartWith('draft:article:a:')

    await browser.refresh()
    expect(await browser.elementById('layout-content').text()).not.toBe(
      draftLayout
    )
    expect(await browser.elementById('page-content').text()).not.toBe(draftPage)

    const documentWithoutDraftMode = await next.render$('/article/a')
    expect(documentWithoutDraftMode('#current-mode').text()).toBe('PUBLISHED')
    expect(documentWithoutDraftMode('#layout-content').text()).toBe(
      initialLayoutValue
    )
    expect(documentWithoutDraftMode('#page-content').text()).toBe(
      initialPageValue
    )
    if (isNextStart) {
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        'Unexpected cache miss after cache warming phase'
      )
    }
  })

  it('requests fresh draft data when navigating to another page and returning', async () => {
    const { browser, act } = await createBrowser('/article/a', true)
    const initialValue = await browser.elementById('page-content').text()

    await act(
      async () => {
        await browser.elementByCss('a[href="/article/b"]').click()
      },
      { includes: 'DRAFT' }
    )
    expect(await browser.elementById('page-content').text()).toStartWith(
      'draft:article:b:'
    )

    await act(
      async () => {
        await browser.elementByCss('a[href="/article/a"]').click()
      },
      { includes: 'DRAFT' }
    )
    const returnedValue = await browser.elementById('page-content').text()
    expect(returnedValue).toStartWith('draft:article:a:')
    expect(returnedValue).not.toBe(initialValue)
  })

  it('renders draft data after an action enables draft mode and normal data after it disables draft mode', async () => {
    const { browser, act } = await createBrowser('/article/a', false)
    const publishedValue = await browser.elementById('page-content').text()
    expect(publishedValue).toStartWith('published:article:a:')

    await act(
      async () => {
        await browser.elementById('enable-draft').click()
      },
      { includes: 'DRAFT' }
    )
    expect(await browser.elementById('current-mode').text()).toBe('DRAFT')
    expect(await browser.elementById('page-content').text()).toStartWith(
      'draft:article:a:'
    )

    await act(
      async () => {
        await browser.elementById('disable-draft').click()
      },
      { includes: 'PUBLISHED' }
    )
    expect(await browser.elementById('current-mode').text()).toBe('PUBLISHED')
    expect(await browser.elementById('page-content').text()).toStartWith(
      'published:article:a:'
    )
  })

  it('renders fresh draft data after a progressively enhanced action enables draft mode', async () => {
    const { browser, page } = await createBrowser('/article/a', false, true)
    expect(await browser.elementById('page-content').text()).toStartWith(
      'published:article:a:'
    )

    const pendingResponse = page.waitForResponse(
      (response) => response.request().method() === 'POST'
    )
    await browser.elementById('enable-draft').click()
    const response = await pendingResponse
    expect(response.status()).toBe(200)
    const renderedPage = load(await response.text())
    expect(renderedPage('#page-content').text()).toStartWith('draft:article:a:')
    expect(renderedPage('#current-mode').text()).toBe('DRAFT')
  })
})
