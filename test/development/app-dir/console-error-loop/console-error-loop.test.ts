import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/88234
// DevTools console.error interceptor should not cause infinite error loops
describe('console-error-loop', () => {
  const { next } = nextTestSetup({ files: __dirname })

  // This test reproduces the bug from issue #88234
  // When an internal error occurs in the console.error handler (like the
  // _interop_require_wildcard bug), it should NOT cause an infinite loop
  it('should not cause infinite loop when console.error handler throws internally', async () => {
    const browser = await next.browser('/internal-error')

    // Wait for page to be interactive
    await browser.waitForElementByCss('#trigger-internal-error')

    // Trigger the error that causes internal failure
    await browser.elementByCss('#trigger-internal-error').click()

    // Wait for potential infinite loop to manifest
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Get the final error count - if there's an infinite loop, this would be huge
    const errorCount = await browser.eval('window.__finalErrorCount || 0')

    // The error count should be small (just the initial error + internal error log)
    // If there's an infinite loop, this would be in the hundreds or thousands
    // This is the key assertion - it should FAIL if the bug exists
    expect(errorCount).toBeLessThan(10)
  })

  it('should not cause infinite console.error loop when logging errors', async () => {
    const browser = await next.browser('/')

    // Wait for page to be interactive
    await browser.waitForElementByCss('#trigger-error')

    // Clear any existing logs
    await browser.eval('window.__errorCount = 0')

    // Click button to trigger console.error
    await browser.elementByCss('#trigger-error').click()

    // Wait a bit for any potential infinite loop to manifest
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the error count
    const errorCount = await browser.eval('window.__errorCount')

    // The error should only be logged once (or a small number of times),
    // not infinitely. If there's an infinite loop, the count would be very high.
    expect(errorCount).toBeLessThan(10)

    // Also verify the original error was logged
    const logs = await browser.log()
    const errorLogs = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes('Test error for console loop check')
    )

    // Should have at least one error log
    expect(errorLogs.length).toBeGreaterThan(0)

    // But not too many (infinite loop would cause many more)
    expect(errorLogs.length).toBeLessThan(10)
  })

  it('should not cause infinite loop when console.error receives non-Error objects', async () => {
    const browser = await next.browser('/non-error-object')

    // Wait for page to be interactive
    await browser.waitForElementByCss('#trigger-string-error')

    // Trigger various types of console.error calls
    await browser.elementByCss('#trigger-string-error').click()
    await new Promise((resolve) => setTimeout(resolve, 500))

    await browser.elementByCss('#trigger-object-error').click()
    await new Promise((resolve) => setTimeout(resolve, 500))

    await browser.elementByCss('#trigger-null-error').click()
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Wait for any potential infinite loop
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the error count
    const errorCount = await browser.eval('window.__errorCount')

    // Should have only 3 errors (one for each click), not an infinite amount
    expect(errorCount).toBeLessThanOrEqual(10)
  })

  it('should not cause infinite loop when console.error is called rapidly', async () => {
    const browser = await next.browser('/rapid-errors')

    // Wait for page to be interactive
    await browser.waitForElementByCss('#trigger-rapid-errors')

    // Reset counter
    await browser.eval('window.__errorCount = 0')

    // Click button to trigger rapid console.errors
    await browser.elementByCss('#trigger-rapid-errors').click()

    // Wait for the rapid errors to complete and any potential loop to manifest
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Get the error count
    const errorCount = await browser.eval('window.__errorCount')

    // We trigger 10 rapid errors, so we expect around 10
    // If there's an infinite loop, the count would be much higher
    expect(errorCount).toBeGreaterThanOrEqual(10)
    expect(errorCount).toBeLessThan(50) // Allow some margin but catch infinite loops
  })

  it('should handle console.error during suspense without infinite loop', async () => {
    const browser = await next.browser('/suspense-error')

    // Wait for the suspense content to load
    await retry(async () => {
      const text = await browser.elementByCss('#content').text()
      expect(text).toBe('Loaded')
    })

    // Check that there's no excessive error logging
    const logs = await browser.log()
    const errorLogs = logs.filter((log) => log.source === 'error')

    // Suspense might log some errors, but should not be infinite
    expect(errorLogs.length).toBeLessThan(20)
  })

  // This test checks the actual Next.js DevTools console.error handler
  // for infinite loops when processing complex/malformed arguments
  it('should not cause infinite loop in DevTools handler with complex error args', async () => {
    const browser = await next.browser('/devtools-error')

    // Wait for test setup
    await retry(async () => {
      const ready = await browser.eval('window.__testReady')
      expect(ready).toBe(true)
    })

    // Trigger complex error that goes through DevTools handler
    await browser.elementByCss('#trigger-complex').click()
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Trigger malformed args
    await browser.elementByCss('#trigger-malformed').click()
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Check for infinite loop detection
    const infiniteLoopDetected = await browser.eval(
      'window.__infiniteLoopDetected'
    )
    const errorCount = await browser.eval('window.__errorCallCount')

    // Should not have detected infinite loop
    expect(infiniteLoopDetected).toBe(false)

    // Error count should be reasonable (we triggered ~6 console.errors)
    // If there's an infinite loop, this would be > 100
    expect(errorCount).toBeLessThan(50)
    expect(errorCount).toBeGreaterThan(0) // Should have some errors logged
  })
})
