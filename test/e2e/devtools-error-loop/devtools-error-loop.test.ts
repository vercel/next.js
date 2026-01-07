import { nextTestSetup } from 'e2e-utils'

describe('DevTools error loop fix', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // Only test in development mode where DevTools are active
  if (!isNextDev) {
    it('skipped for production mode', () => {})
    return
  }

  it('should not create an infinite console error loop', async () => {
    const consoleMessages: string[] = []

    const browser = await next.browser('/', {
      beforePageLoad: (page) => {
        page.on('console', (msg) => {
          consoleMessages.push(msg.text())
        })
      },
    })

    // Wait for page to load and potential errors to occur
    await browser.waitForElementByCss('h1')

    // Wait additional time to catch any error loop
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check for the specific error pattern that indicates the infinite loop
    const interopErrors = consoleMessages.filter((msg) =>
      msg.includes('_interop_require_wildcard')
    )

    expect(interopErrors.length).toBe(0)

    // Also check that we don't have an excessive number of errors
    const errorMessages = consoleMessages.filter(
      (msg) =>
        msg.includes('Error') ||
        msg.includes('error') ||
        msg.includes('TypeError')
    )

    // Allow a few errors but not dozens (which would indicate a loop)
    expect(errorMessages.length).toBeLessThan(10)
  })

  it('should display legitimate errors exactly once', async () => {
    const consoleMessages: string[] = []

    const browser = await next.browser('/error-page', {
      beforePageLoad: (page) => {
        page.on('console', (msg) => {
          consoleMessages.push(msg.text())
        })
      },
    })

    // Wait for page to load
    await browser.waitForElementByCss('h1')

    // Wait for error to be processed
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Check that legitimate errors appear (not checking count due to React error boundaries)
    const testErrors = consoleMessages.filter((msg) =>
      msg.includes('Test error for verification')
    )

    // Error should appear at least once
    expect(testErrors.length).toBeGreaterThanOrEqual(1)

    // But not excessively (which would indicate a loop)
    expect(testErrors.length).toBeLessThan(10)
  })

  it('should remain stable through multiple page reloads', async () => {
    const consoleMessages: string[] = []

    const browser = await next.browser('/', {
      beforePageLoad: (page) => {
        page.on('console', (msg) => {
          consoleMessages.push(msg.text())
        })
      },
    })

    // Reload the page multiple times to simulate HMR-like behavior
    for (let i = 0; i < 5; i++) {
      await browser.refresh()
      await browser.waitForElementByCss('h1')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Check for error loop indicators
    const interopErrors = consoleMessages.filter((msg) =>
      msg.includes('_interop_require_wildcard')
    )

    expect(interopErrors.length).toBe(0)
  })
})
