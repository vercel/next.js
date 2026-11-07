import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic() with parent Suspense boundary', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should use parent Suspense fallback instead of rendering empty content', async () => {
    const browser = await next.browser('/')

    // The dynamic component should eventually load
    await retry(async () => {
      const text = await browser.elementByCss('#dynamic-content').text()
      expect(text).toBe('loaded')
    })

    // Static content should always be visible (no flicker)
    const header = await browser.elementByCss('#static-content').text()
    expect(header).toBe('header')
  })

  it('should show parent fallback during loading, not empty content', async () => {
    const html = await next.render('/')

    // During SSR with ssr:false, the parent Suspense fallback should be used
    // instead of rendering empty content that causes layout flicker.
    // Either the parent fallback is shown or the content has loaded.
    const hasParentFallback = html.includes('parent loading...')
    const hasContent = html.includes('loaded')
    expect(hasParentFallback || hasContent).toBe(true)

    // The static content should NOT appear without the dynamic content
    // (that would be the flicker bug - showing partial layout)
    if (!hasContent) {
      expect(html).not.toContain('header')
    }
  })
})
