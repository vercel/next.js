/**
 * Test for parallel routes script execution fix
 * Ensures that inline scripts from server components execute properly
 * on 404/not-found pages when parallel routes are present.
 * 
 * Related to issue: https://github.com/vercel/next.js/issues/82456
 */

import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-script-execution', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should execute inline scripts from server components on 404 pages with parallel routes', async () => {
    const browser = await next.browser('/test')
    
    // Navigate to working page and verify script executed
    await browser.waitForElementByCss('[data-testid="check-button"]')
    await browser.click('[data-testid="check-button"]')
    
    const workingPageResult = await browser.elementByCss('[data-testid="locale-result"]').text()
    expect(workingPageResult).toContain('react-aria.i18n.locale') 
    expect(workingPageResult).toContain('en')
    
    // Navigate to 404 page and verify script still executes
    await browser.get(browser.url.replace('/test', '/404-page-that-does-not-exist'))
    await browser.waitForElementByCss('[data-testid="check-button"]')
    await browser.click('[data-testid="check-button"]')
    
    const notFoundPageResult = await browser.elementByCss('[data-testid="locale-result"]').text()
    expect(notFoundPageResult).toContain('react-aria.i18n.locale')
    expect(notFoundPageResult).toContain('en') // Should NOT be undefined
    expect(notFoundPageResult).not.toContain('undefined')
  })

  it('should not render scripts multiple times when parallel routes are present', async () => {
    const browser = await next.browser('/404-page-that-does-not-exist')
    
    // Check that there's only one instance of our locale script
    const scriptElements = await browser.eval(() => {
      const scripts = Array.from(document.querySelectorAll('script'))
      return scripts.filter(s => 
        s.textContent && s.textContent.includes("Symbol.for('react-aria.i18n.locale')")
      ).length
    })
    
    // There should be exactly one script setting the locale, not duplicated
    expect(scriptElements).toBe(1)
  })

  it('should preserve HTTPAccessFallbackBoundary functionality', async () => {
    const browser = await next.browser('/404-page-that-does-not-exist')
    
    // Verify we get the custom not-found page
    const notFoundText = await browser.elementByCss('h1').text()
    expect(notFoundText).toBe('Not Found')
    
    // Verify parallel route content is still rendered
    const parallelRouteText = await browser.elementByCss('[data-testid="parallel-route"]').text()
    expect(parallelRouteText).toContain('Hello from parallel route')
  })
})
