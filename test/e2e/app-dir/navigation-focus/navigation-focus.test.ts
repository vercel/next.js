import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const enableNewScrollHandler =
  process.env.__NEXT_EXPERIMENTAL_APP_NEW_SCROLL_HANDLER === 'true'

describe('navigation-focus', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('navigation to an interactive segment', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/interactive-segment"]').click()

    await retry(async () => {
      // Good debug info is a moving target. Use Playwright traces to find out
      // what was focused if this fails
      if (enableNewScrollHandler) {
        expect(await browser.eval(() => document.activeElement.localName)).toBe(
          'body'
        )
      } else {
        expect(
          await browser.eval(() =>
            document.activeElement.getAttribute('data-testid')
          )
        ).toBe('segment-container')
      }
    })
  })

  it('navigation to a scrollable segment', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/scrollable-segment"]').click()

    await retry(async () => {
      if (enableNewScrollHandler) {
        expect(await browser.eval(() => document.activeElement.localName)).toBe(
          'body'
        )
      } else {
        expect(
          await browser.eval(() =>
            document.activeElement.getAttribute('data-testid')
          )
        ).toBe('segment-container')
      }
    })
  })

  it('navigation to a segment with a focusable descendant', async () => {
    const browser = await next.browser('/')
    await browser
      .elementByCss('a[href="/segment-with-focusable-descendant"]')
      .click()

    await retry(async () => {
      if (enableNewScrollHandler) {
        // Focus goes to the focusable descendant, not the segment itself
        expect(await browser.eval(() => document.activeElement.localName)).toBe(
          'body'
        )
      } else {
        // Focus stays on the original link
        expect(
          await browser.eval(() => document.activeElement.getAttribute('href'))
        ).toBe('/segment-with-focusable-descendant')
      }
    })
  })

  it('navigation to a fragment within a page', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/uri-fragments#section-2"]').click()

    await retry(async () => {
      if (enableNewScrollHandler) {
        expect(await browser.eval(() => document.activeElement.localName)).toBe(
          'body'
        )
      } else {
        // Focus stays on the anchor unlike native behavior
        expect(
          await browser.eval(() => document.activeElement.getAttribute('href'))
        ).toEqual('/uri-fragments#section-2')
      }
    })
    // Fragment URI not targetted unlike native behavior
    expect(await browser.locator(':target').isVisible()).toEqual(false)
  })

  it('navigation within a page to fragments', async () => {
    const browser = await next.browser('/uri-fragments')
    await browser.elementByCss('a[href="#section-1"]').click()

    await retry(async () => {
      if (enableNewScrollHandler) {
        expect(await browser.eval(() => document.activeElement.localName)).toBe(
          'body'
        )
      } else {
        // Focus stays on the anchor unlike native behavior
        expect(
          await browser.eval(() => document.activeElement.getAttribute('href'))
        ).toEqual('#section-1')
      }
    })
    // Fragment URI not targetted unlike native behavior
    expect(await browser.locator(':target').isVisible()).toEqual(false)
  })
})
