import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

/**
 * Regression test for https://github.com/vercel/next.js/issues/86060
 *
 * This issue reports an error:
 * "Failed to execute 'measure' on 'Performance': '​SlugPage' cannot have a negative time stamp"
 *
 * The error occurs in development mode with Turbopack when:
 * - Navigating to a 404 page
 * - When notFound() is called in a dynamic route
 * - After HMR updates on not-found pages
 *
 * The error originates from React's performance tracking in
 * react-server-dom-turbopack-client.browser.development.js where
 * performance.measure() is called with timestamps that can become negative
 * due to timing issues.
 *
 * The issue is intermittent and more likely to occur:
 * - On WSL (Windows Subsystem for Linux)
 * - With rapid HMR updates
 * - When not-found.tsx is in the same dynamic directory as the page calling notFound()
 */
describe('not-found-performance-measure', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // This test reproduces https://github.com/vercel/next.js/issues/86060
  // The error "Failed to execute 'measure' on 'Performance': '​SlugPage' cannot have a negative time stamp"
  // occurs in development mode with Turbopack when navigating to a 404 page or when notFound() is called.
  it('should not throw performance.measure error when notFound() is called in dynamic route', async () => {
    const browser = await next.browser('/trigger-not-found')

    // Wait for the not-found page to render
    await retry(async () => {
      const element = await browser.elementByCss('#slug-not-found')
      expect(await element.text()).toBe('Slug Not Found')
    })

    // Check for the specific error in browser console
    const logs = await browser.log()
    const performanceMeasureErrors = logs.filter(
      (log) =>
        log.source === 'error' && log.message.includes('negative time stamp')
    )

    expect(performanceMeasureErrors).toEqual([])
  })

  it('should not throw performance.measure error after HMR on dynamic route not-found page', async () => {
    // Navigate to a route that triggers notFound()
    const browser = await next.browser('/trigger-not-found')

    await retry(async () => {
      const element = await browser.elementByCss('#slug-not-found')
      expect(await element.text()).toBe('Slug Not Found')
    })

    // Make a change to the not-found file to trigger HMR
    const originalContent = await next.readFile('app/[slug]/not-found.tsx')
    await next.patchFile(
      'app/[slug]/not-found.tsx',
      originalContent.replace('Slug Not Found', 'Slug Not Found Updated')
    )

    // Wait for HMR to complete
    await retry(async () => {
      const element = await browser.elementByCss('#slug-not-found')
      expect(await element.text()).toBe('Slug Not Found Updated')
    })

    // Restore original content
    await next.patchFile('app/[slug]/not-found.tsx', originalContent)

    // Check for the specific error in browser console
    const logs = await browser.log()
    const performanceMeasureErrors = logs.filter(
      (log) =>
        log.source === 'error' && log.message.includes('negative time stamp')
    )

    expect(performanceMeasureErrors).toEqual([])
  })

  it('should not throw performance.measure error when navigating between pages and triggering notFound()', async () => {
    // Start at home page
    const browser = await next.browser('/')

    await retry(async () => {
      const element = await browser.elementByCss('#home')
      expect(await element.text()).toBe('Home Page')
    })

    // Navigate to a route that triggers notFound()
    await browser.eval('window.location.href = "/trigger-not-found"')

    await retry(async () => {
      const element = await browser.elementByCss('#slug-not-found')
      expect(await element.text()).toBe('Slug Not Found')
    })

    // Check for the specific error in browser console
    const logs = await browser.log()
    const performanceMeasureErrors = logs.filter(
      (log) =>
        log.source === 'error' && log.message.includes('negative time stamp')
    )

    expect(performanceMeasureErrors).toEqual([])
  })

  it('should not throw performance.measure error with rapid HMR updates on not-found page', async () => {
    // Navigate to a route that triggers notFound()
    const browser = await next.browser('/trigger-not-found')

    await retry(async () => {
      const element = await browser.elementByCss('#slug-not-found')
      expect(await element.text()).toBe('Slug Not Found')
    })

    const originalContent = await next.readFile('app/[slug]/not-found.tsx')

    // Perform multiple rapid HMR updates to try to trigger timing issues
    for (let i = 0; i < 5; i++) {
      await next.patchFile(
        'app/[slug]/not-found.tsx',
        originalContent.replace('Slug Not Found', `Slug Not Found ${i}`)
      )

      await retry(async () => {
        const element = await browser.elementByCss('#slug-not-found')
        expect(await element.text()).toBe(`Slug Not Found ${i}`)
      })
    }

    // Restore original content
    await next.patchFile('app/[slug]/not-found.tsx', originalContent)

    // Check for the specific error in browser console
    const logs = await browser.log()
    const performanceMeasureErrors = logs.filter(
      (log) =>
        log.source === 'error' && log.message.includes('negative time stamp')
    )

    expect(performanceMeasureErrors).toEqual([])
  })

  it('should not throw performance.measure error when rapidly navigating to notFound routes', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const element = await browser.elementByCss('#home')
      expect(await element.text()).toBe('Home Page')
    })

    // Rapidly navigate between home and not-found routes
    for (let i = 0; i < 5; i++) {
      await browser.eval('window.location.href = "/trigger-not-found"')

      await retry(async () => {
        const element = await browser.elementByCss('#slug-not-found')
        expect(await element.text()).toBe('Slug Not Found')
      })

      await browser.eval('window.location.href = "/"')

      await retry(async () => {
        const element = await browser.elementByCss('#home')
        expect(await element.text()).toBe('Home Page')
      })
    }

    // Check for the specific error in browser console
    const logs = await browser.log()
    const performanceMeasureErrors = logs.filter(
      (log) =>
        log.source === 'error' && log.message.includes('negative time stamp')
    )

    expect(performanceMeasureErrors).toEqual([])
  })
})
