import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('navigation hooks with { ssr: false }', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render null in the initial HTML and resolve after hydration', async () => {
    // Check that the prerendered HTML contains "null" for all three hooks
    const html = await next.render('/test-slug')
    expect(html).toContain('<span id="pathname">null</span>')
    expect(html).toContain('<span id="segment">null</span>')
    expect(html).toContain('<span id="segments">null</span>')

    // After hydration the hooks should resolve to real values
    const browser = await next.browser('/test-slug')
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/test-slug')
      expect(await browser.elementByCss('#segment').text()).toBe('test-slug')
      expect(await browser.elementByCss('#segments').text()).toBe(
        '["test-slug"]'
      )
    })
  })

  it('should not require a Suspense boundary on a dynamic route', async () => {
    // The page should render without errors (no "Missing Suspense boundary")
    const browser = await next.browser('/another-slug')
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe(
        '/another-slug'
      )
      expect(await browser.elementByCss('#segment').text()).toBe('another-slug')
    })
  })

  it('should resolve on the home page (static route)', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/')
      // Root layout with no child segment returns null for useSelectedLayoutSegment
      expect(await browser.elementByCss('#segment').text()).toBe('null')
      expect(await browser.elementByCss('#segments').text()).toBe('[]')
    })
  })
})
