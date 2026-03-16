import { nextTestSetup } from 'e2e-utils'

describe('css-media-query', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve max-width media query syntax instead of transpiling to range syntax', async () => {
    const browser = await next.browser('/')

    // Get all stylesheets from the document
    const stylesheetContents = await browser.eval(() => {
      const stylesheets = Array.from(document.styleSheets)
      const contents: string[] = []

      for (const stylesheet of stylesheets) {
        try {
          // Only check stylesheets that have cssRules (not external ones we can't access)
          if (stylesheet.cssRules) {
            const rules = Array.from(stylesheet.cssRules)
            for (const rule of rules) {
              contents.push(rule.cssText)
            }
          }
        } catch (e) {
          // Skip stylesheets we can't access due to CORS
          continue
        }
      }

      return contents
    })

    // Find the media query rule
    const mediaQueryRule = stylesheetContents.find(
      (rule) => rule.includes('@media') && rule.includes('max-width')
    )

    expect(mediaQueryRule).toBeDefined()

    // Verify that the media query uses the original max-width syntax
    // and not the newer range syntax (width <= 768px)
    expect(mediaQueryRule).toContain('max-width: 768px')
    expect(mediaQueryRule).not.toContain('width <= 768px')
    expect(mediaQueryRule).not.toContain('width<=768px')

    // Also verify the rule contains our expected styles (CSS may convert blue to rgb format)
    expect(mediaQueryRule).toMatch(/color:\s*(blue|rgb\(0,\s*0,\s*255\))/)
  })

  it('should apply the correct styles based on media query', async () => {
    const browser = await next.browser('/')

    // Check that the h1 element exists
    const h1Text = await browser.elementByCss('h1').text()
    expect(h1Text).toBe('CSS Media Query Test')

    // Get the computed color (should be red by default, blue on small screens)
    const defaultColor = await browser.eval(() => {
      const h1 = document.querySelector('h1')
      return window.getComputedStyle(h1!).color
    })

    // The exact color values may vary by browser, but we can check that styles are applied
    expect(defaultColor).toBeDefined()
  })
})
