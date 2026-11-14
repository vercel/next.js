import { nextTestSetup } from 'e2e-utils'

describe('Turbopack autoExport minification', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    // This test is specifically for Turbopack minification
    skipDeployment: true,
  })

  // This test is only relevant in development mode with Turbopack
  if (!isNextDev) {
    it('skipped - only runs in development', () => {})
    return
  }

  it('should not throw ReferenceError for __NEXT_DATA__.autoExport', async () => {
    const browser = await next.browser('/')

    // Wait for page to load
    await browser.waitForElementByCss('#test-content')

    // Check that the page rendered correctly
    const text = await browser.elementByCss('#test-content').text()
    expect(text).toBe('Page loaded successfully')

    // Get any console errors
    const logs = await browser.log('browser')
    const errors = logs.filter(
      (log: { level: string; message: string }) =>
        log.level === 'SEVERE' || log.message.includes('ReferenceError')
    )

    // Ensure no ReferenceError for _self___NEXT_DATA___autoExport
    const autoExportError = errors.find((e: { message: string }) =>
      e.message.includes('_self___NEXT_DATA___autoExport')
    )

    expect(autoExportError).toBeUndefined()
  })

  it('should correctly access __NEXT_DATA__.autoExport value', async () => {
    const browser = await next.browser('/')

    // Wait for page to load
    await browser.waitForElementByCss('#test-content')

    // Execute script to check if __NEXT_DATA__.autoExport is accessible
    const autoExportValue = await browser.eval(
      'typeof window.__NEXT_DATA__.autoExport'
    )

    // autoExport should be either boolean or undefined, not cause an error
    expect(['boolean', 'undefined']).toContain(autoExportValue)
  })

  it('should render PathnameContextProviderAdapter without errors', async () => {
    const browser = await next.browser('/dynamic/test-param')

    // Wait for page to load - this tests a dynamic route which uses isAutoExport
    await browser.waitForElementByCss('#dynamic-content')

    const text = await browser.elementByCss('#dynamic-content').text()
    expect(text).toContain('test-param')

    // Check for errors
    const logs = await browser.log('browser')
    const errors = logs.filter(
      (log: { level: string; message: string }) =>
        log.level === 'SEVERE' ||
        log.message.includes('ReferenceError') ||
        log.message.includes('is not defined')
    )

    // Should have no errors
    expect(errors.length).toBe(0)
  })
})
