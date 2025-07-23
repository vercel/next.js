import { nextTestSetup } from 'e2e-utils'

describe('dynamic-import with CSP nonce', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should include nonce in preload link tags for dynamic imports', async () => {
    const browser = await next.browser('/')

    // Check that the dynamic component renders
    expect(await browser.elementByCss('button').text()).toBe('Dynamic Button')

    // Check that preload link tags have the nonce attribute
    const preloadLinks = await browser.elementsByCss(
      'link[rel="preload"][as="script"]'
    )

    // There should be at least one preload link for the dynamic import
    expect(preloadLinks.length).toBeGreaterThan(0)

    // Check that each preload link has the nonce attribute
    for (const link of preloadLinks) {
      const nonce = await link.getAttribute('nonce')
      expect(nonce).toBeTruthy()
      expect(nonce).toBe('test-nonce-123')
    }
  })

  it('should not have CSP violations in browser console', async () => {
    const browser = await next.browser('/')

    // Wait for the page to fully load
    await browser.waitForElementByCss('button')

    // Check for CSP violations in the console
    const logs = await browser.log()
    const cspViolations = logs.filter(
      (log) =>
        log.message.includes('Content Security Policy') ||
        log.message.includes('CSP') ||
        log.source === 'security'
    )

    expect(cspViolations).toEqual([])
  })
})
