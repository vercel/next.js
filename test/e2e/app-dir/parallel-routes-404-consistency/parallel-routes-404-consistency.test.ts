import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-404-consistency', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show 404 on direct navigation to nonexistent route', async () => {
    const browser = await next.browser('/does-not-exist')

    await retry(async () => {
      const text = await browser.elementByCss('body').text()
      expect(text).toContain('404 Not Found')
    })
  })

  it('should show 404 on client-side navigation to nonexistent route', async () => {
    const browser = await next.browser('/page-a')

    // Verify we are on page-a
    await retry(async () => {
      const text = await browser.elementById('children').text()
      expect(text).toContain('Page A Content')
    })

    // Verify breadcrumb shows Page A
    await retry(async () => {
      const text = await browser.elementById('breadcrumb').text()
      expect(text).toContain('Breadcrumb: Page A')
    })

    // Click the link to a nonexistent page
    await browser.elementByCss('#link-to-nonexistent').click()

    // After client-side navigation to a nonexistent route, we should see
    // the 404 page, not stale content from Page A.
    // BUG #79352: The catch-all @breadcrumb slot matches /does-not-exist,
    // so the response is 200 and the children slot falls back to
    // __DEFAULT__, causing reuseActiveSegmentInDefaultSlot() to reuse
    // the stale Page A content instead of showing a 404.
    await retry(async () => {
      const bodyText = await browser.elementByCss('body').text()
      expect(bodyText).toContain('404 Not Found')
      expect(bodyText).not.toContain('Page A Content')
    })
  })
})
