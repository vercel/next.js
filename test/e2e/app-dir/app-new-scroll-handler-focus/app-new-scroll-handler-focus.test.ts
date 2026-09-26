import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Typing into an input that pushes `?q=` per keystroke should keep focus. On a
// dynamic page focus was lost after the first character; a static page is fine.
describe('app-new-scroll-handler-focus', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Use the page keyboard, not element.type() (which re-focuses and hides the
  // bug). If focus is lost, the second key never lands and the URL stays `q=a`.
  async function typeTwoKeysBothMustLand(path: string, testId: string) {
    const browser = await next.browser(path)
    const activeTestId = () =>
      browser.eval(() => document.activeElement?.getAttribute('data-testid'))

    // Focus explicitly — autoFocus timing isn't reliable across bundlers.
    await browser.elementByCss(`[data-testid="${testId}"]`).click()
    await retry(async () => {
      expect(await activeTestId()).toBe(testId)
    })

    await browser.keydown('a')
    await browser.keyup('a')
    await retry(async () => {
      expect(await browser.url()).toContain('q=a')
    })

    await browser.keydown('b')
    await browser.keyup('b')
    await retry(async () => {
      expect(await browser.url()).toContain('q=ab')
    })
    await retry(async () => {
      expect(await activeTestId()).toBe(testId)
    })
  }

  it('dynamic page: keeps focus across search-param keystrokes (all modes)', async () => {
    await typeTwoKeysBothMustLand('/', 'search-input')
  })

  // Static pages are immune; only assertable outside dev (dev renders dynamically).
  if (!isNextDev) {
    it('static page: unaffected by the new scroll handler (start/deploy only)', async () => {
      await typeTwoKeysBothMustLand('/static', 'static-search-input')
    })
  }

  // The navigation should still scroll to top while keeping focus.
  it('dynamic page: still scrolls to top on a search-param nav, focus preserved', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('[data-testid="search-input"]').click()
    await retry(async () => {
      expect(
        await browser.eval(() =>
          document.activeElement?.getAttribute('data-testid')
        )
      ).toBe('search-input')
    })
    await browser.eval(() => window.scrollTo(0, 800))
    await retry(async () => {
      expect(await browser.eval(() => window.scrollY)).toBeGreaterThan(400)
    })

    await browser.keydown('a')
    await browser.keyup('a')
    await retry(async () => {
      expect(await browser.url()).toContain('q=a')
    })

    await retry(async () => {
      expect(await browser.eval(() => window.scrollY)).toBe(0)
    })
    expect(
      await browser.eval(() =>
        document.activeElement?.getAttribute('data-testid')
      )
    ).toBe('search-input')
  })

  // Focus is left alone, so a route+search change keeps focus on an input that
  // survives in a parent layout.
  it('route + search change keeps focus (all modes)', async () => {
    const browser = await next.browser('/combo')
    const activeTestId = () =>
      browser.eval(() => document.activeElement?.getAttribute('data-testid'))

    await browser.elementByCss('[data-testid="combo-input"]').click()
    await retry(async () => {
      expect(await activeTestId()).toBe('combo-input')
    })

    await browser.keydown('a')
    await browser.keyup('a')
    await retry(async () => {
      expect(await browser.url()).toContain('/combo/next?q=a')
    })

    // The layout input survives the navigation and keeps focus.
    expect(
      await browser.eval(
        () => !!document.querySelector('[data-testid="combo-input"]')
      )
    ).toBe(true)
    expect(await activeTestId()).toBe('combo-input')
  })
})
