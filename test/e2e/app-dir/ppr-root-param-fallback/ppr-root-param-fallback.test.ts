import { nextTestSetup } from 'e2e-utils'

describe('ppr-root-param-fallback', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('should skip in dev mode', () => {})
    return
  }

  it('should have use-cache content in fallback shells for all pregenerated locales', async () => {
    // Setup: The app has a [locale] param with generateStaticParams returning
    // ['en', 'fr'], and a nested /[locale]/blog/[slug] route. The layout uses
    // a 'use cache' function to fetch locale-specific translations.
    //
    // This test ensures that we generate fallback shells with the correct locale
    // filled in for all pregenerated locales.

    for (const locale of ['en', 'fr']) {
      // next.render$ doesn't stream, so we get just the shell content
      const $ = await next.render$(`/${locale}/blog/new-post`)

      // The shell should have the locale-header with cached content,
      // NOT the locale-loading Suspense fallback
      expect($('#locale-header').length).toBe(1)
      expect($('#locale-header').text()).toContain(`Locale: ${locale}`)
      expect($('#translations').text()).toContain(`Home (${locale})`)

      // The Suspense fallback should NOT be in the shell
      expect($('#locale-loading').length).toBe(0)
    }
  })

  it('should serve a fallback shell for non-pregenerated root param values', async () => {
    // Setup: The app only pregenerates locales ['en', 'fr']
    //
    // When visiting a non-prerendered root param, we should still serve a fallback shell
    // and resume with the missing data.

    // Check the raw HTML response - it should contain the loading fallback,
    // proving we got a streamed fallback shell (not a blocking render)
    const $ = await next.render$('/de/blog/new-post')
    expect($('#blog-loading').length).toBe(1)
    expect($('#blog-loading').text()).toBe('Loading article...')

    // Use the browser to verify the final state after streaming/hydration
    const browser = await next.browser('/de/blog/new-post')

    // The loading state should be gone after streaming completes
    const loadingElements = await browser.elementsByCss('#blog-loading')
    expect(loadingElements.length).toBe(0)

    // The final content should be present with the correct locale and slug
    const content = await browser.waitForElementByCss('#blog-content').text()
    expect(content).toContain('de')
    expect(content).toContain('new-post')
  })
})
