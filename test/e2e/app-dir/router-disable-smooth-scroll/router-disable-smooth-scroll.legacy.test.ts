import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router smooth scroll optimization (legacy)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname + '/fixtures/legacy',
    nextConfig: {
      experimental: {
        optimizeRouterScrolling: false,
      },
    },
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

  it('should work with smooth scroll CSS and warn in development', async () => {
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
      expect(text).toBe('Legacy Page 2')
    })

    await waitForScrollToComplete(browser, 0)

    // In legacy mode, all smooth scroll usage should warn in dev mode
    await retry(async () => {
      const logs = await browser.log()
      const hasWarning = logs.some((log) =>
        log.message.includes(
          'Detected `scroll-behavior: smooth` on the `<html>` element. In a future version'
        )
      )

      if (isNextDev) {
        expect(hasWarning).toBe(true)
      } else {
        expect(hasWarning).toBe(false)
      }
    })
  })
})

describe('router smooth scroll optimization (legacy with data attribute)', () => {
  const { next, isNextDev: _isNextDev } = nextTestSetup({
    files: __dirname + '/fixtures/legacy-with-data',
    nextConfig: {
      experimental: {
        optimizeRouterScrolling: false,
      },
    },
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

  it('should not warn when data attribute is present even in legacy mode', async () => {
    const browser = await next.browser('/page1')

    // Verify both CSS and data attribute are present
    const scrollBehavior = await browser.eval(
      'getComputedStyle(document.documentElement).scrollBehavior'
    )
    expect(scrollBehavior).toBe('smooth')

    const hasDataAttribute = await browser.eval(
      'document.documentElement.dataset.scrollBehavior === "smooth"'
    )
    expect(hasDataAttribute).toBe(true)

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
      expect(text).toBe('Legacy Page 2')
    })

    await waitForScrollToComplete(browser, 0)

    // Both legacy and optimized modes respect the data attribute for warnings
    // The difference is in when style manipulation occurs, not when warnings appear
    await retry(async () => {
      const logs = await browser.log()
      const hasWarning = logs.some((log) =>
        log.message.includes(
          'Detected `scroll-behavior: smooth` on the `<html>` element. In a future version'
        )
      )

      // No warning should appear when data attribute is present
      expect(hasWarning).toBe(false)
    })
  })
})
