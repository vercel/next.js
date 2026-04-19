import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router smooth scroll optimization', () => {
  const { next } = nextTestSetup({
    files: __dirname + '/fixtures/optimized',
  })

  const getTopScroll = async (browser: any) =>
    await browser.eval('document.documentElement.scrollTop')

  const waitForScrollToComplete = async (browser: any, expectedY: number) => {
    await retry(async () => {
      const top = await getTopScroll(browser)
      expect(top).toBe(expectedY)
    })
  }

  const scrollTo = async (browser: any, y: number) => {
    await browser.eval(`window.scrollTo(0, ${y})`)
    // Add a small delay for scroll to complete
    await browser.eval('new Promise(resolve => setTimeout(resolve, 100))')
    await waitForScrollToComplete(browser, y)
  }

  it('should work with smooth scroll CSS and data attribute without warning', async () => {
    const browser = await next.browser('/page1')

    await scrollTo(browser, 1000)
    expect(await getTopScroll(browser)).toBe(1000)

    // Wait for page to be rendered
    await browser.waitForElementByCss('#to-page2')

    // Click navigation and wait for new page to load
    await browser.elementByCss('#to-page2').click()

    // Wait for the new page to load completely
    await browser.waitForElementByCss('h1')
    await retry(async () => {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Optimized Page 2')
    })

    await waitForScrollToComplete(browser, 0)

    // Assert no warning appears in optimized case
    await retry(async () => {
      const logs = await browser.log()
      expect(
        logs.some((log) =>
          log.message.includes(
            'Detected `scroll-behavior: smooth` on the `<html>` element.'
          )
        )
      ).toBe(false)
    })
  })
})

describe('router smooth scroll optimization (optimized early exit)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname + '/fixtures/optimized-no-data',
  })

  const getTopScroll = async (browser: any) =>
    await browser.eval('document.documentElement.scrollTop')

  const waitForScrollToComplete = async (browser: any, expectedY: number) => {
    await retry(async () => {
      const top = await getTopScroll(browser)
      expect(top).toBe(expectedY)
    })
  }

  const scrollTo = async (browser: any, y: number) => {
    await browser.eval(`window.scrollTo(0, ${y})`)
    // Add a small delay for scroll to complete
    await browser.eval('new Promise(resolve => setTimeout(resolve, 100))')
    await waitForScrollToComplete(browser, y)
  }

  it('should warn in dev when CSS smooth scroll detected but no data attribute', async () => {
    const browser = await next.browser('/page1')

    // Verify CSS smooth scrolling is present
    const scrollBehavior = await browser.eval(
      'getComputedStyle(document.documentElement).scrollBehavior'
    )
    expect(scrollBehavior).toBe('smooth')

    // Verify no data attribute
    const hasDataAttribute = await browser.eval(
      'document.documentElement.dataset.scrollBehavior === "smooth"'
    )
    expect(hasDataAttribute).toBe(false)

    await scrollTo(browser, 1000)
    expect(await getTopScroll(browser)).toBe(1000)

    // Wait for page to be rendered
    await browser.waitForElementByCss('#to-page2')

    // Click navigation and wait for new page to load
    await browser.elementByCss('#to-page2').click()

    // Wait for the new page to load completely
    await browser.waitForElementByCss('h1')
    await retry(async () => {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Optimized Page 2')
    })

    await waitForScrollToComplete(browser, 0)

    const shouldWarn = isNextDev
    await retry(async () => {
      const logs = await browser.log()
      expect(
        logs.some((log) =>
          log.message.includes(
            'Detected `scroll-behavior: smooth` on the `<html>` element.'
          )
        )
      ).toBe(shouldWarn)
    })
  })
})
