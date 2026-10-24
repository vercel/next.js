import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('unstable_useRelativeHref - trailingSlash: true', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function relativeHrefLink(
    browser: Playwright,
    wrapperId: string,
    target: string
  ) {
    return browser.elementByCss(`#${wrapperId} [data-target="${target}"]`)
  }

  async function getRelativeHref(
    browser: Playwright,
    wrapperId: string,
    target: string
  ): Promise<string> {
    return relativeHrefLink(browser, wrapperId, target).text()
  }

  // With trailingSlash: true, the URL ends in '/', so relative resolution
  // keeps the final segment: every result shifts one level compared to the
  // default config.

  it('returns "./" for the root route on the root page', async () => {
    const browser = await next.browser('/')
    expect(await getRelativeHref(browser, 'home-page-hrefs', '/')).toBe('./')
  })

  it('shifts results one level on a page with a dynamic segment', async () => {
    const browser = await next.browser('/chat/123/')
    // The own route becomes pure './' traversal (no param value spelled out),
    // so it stays static even when [id] is request-time-only.
    expect(
      await getRelativeHref(browser, 'chat-page-hrefs', '/chat/[id]')
    ).toBe('./')
    expect(await getRelativeHref(browser, 'chat-page-hrefs', '/chat')).toBe(
      '../'
    )
    expect(await getRelativeHref(browser, 'chat-page-hrefs', '/')).toBe(
      '../../'
    )
    // A non-root-relative target is returned verbatim — trailing-slash
    // normalization doesn't apply to it.
    expect(
      await getRelativeHref(
        browser,
        'chat-page-hrefs',
        'https://example.com/docs'
      )
    ).toBe('https://example.com/docs')

    // Clicking the ancestor link resolves against the trailing-slash URL and
    // lands on the chat index page.
    await relativeHrefLink(browser, 'chat-page-hrefs', '/chat').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/chat/')
      expect(await browser.elementByCss('#chat-index-page').text()).toBe(
        'Chat index'
      )
    })
  })

  it('shifts results one level on a nested page', async () => {
    const browser = await next.browser('/chat/123/settings/')
    expect(
      await getRelativeHref(browser, 'settings-page-hrefs', '/chat/[id]')
    ).toBe('../')
    // Own route: pure traversal, free of the param value.
    expect(
      await getRelativeHref(
        browser,
        'settings-page-hrefs',
        '/chat/[id]/settings'
      )
    ).toBe('./')
    expect(await getRelativeHref(browser, 'settings-page-hrefs', '/chat')).toBe(
      '../../'
    )
    expect(await getRelativeHref(browser, 'settings-page-hrefs', '/')).toBe(
      '../../../'
    )

    // Clicking the parent-route link navigates to the current chat's page.
    await relativeHrefLink(browser, 'settings-page-hrefs', '/chat/[id]').click()
    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/chat/123/')
      expect(await browser.elementByCss('#chat-page-id').text()).toBe('123')
    })
  })
})
