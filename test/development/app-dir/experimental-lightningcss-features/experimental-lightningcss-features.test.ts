import { nextTestSetup } from 'e2e-utils'

describe('experimental-lightningcss-features', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { lightningcss: '^1.23.0' },
    // Use a modern browser that supports light-dark() natively, to prove
    // that the `include` flag forces transpilation regardless of browser support.
    packageJson: {
      browserslist: ['chrome 123'],
    },
  })

  it('should transpile light-dark() when included in lightningCssFeatures', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello')

    // lightningcss transpiles light-dark() into var(--lightningcss-light, ...)
    // and var(--lightningcss-dark, ...) fallback patterns.
    // The original light-dark() syntax should NOT appear in the output CSS.
    const cssFiles = await next.fetch('/')
    const fullHtml = await cssFiles.text()

    // Find all CSS link/style tags and fetch their content
    const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/g
    const linkTagRegex = /<link[^>]*href="([^"]*\.css[^"]*)"[^>]*>/g

    let allCss = ''

    // Extract inline styles
    let match
    while ((match = styleTagRegex.exec(fullHtml)) !== null) {
      allCss += match[1]
    }

    // Fetch external CSS files
    const linkMatches = []
    while ((match = linkTagRegex.exec(fullHtml)) !== null) {
      linkMatches.push(match[1])
    }
    for (const cssHref of linkMatches) {
      const cssRes = await next.fetch(cssHref)
      if (cssRes.ok) {
        allCss += await cssRes.text()
      }
    }

    // The light-dark() function should have been transpiled
    expect(allCss).not.toContain('light-dark(')
    // lightningcss uses --lightningcss-light and --lightningcss-dark custom properties
    expect(allCss).toContain('--lightningcss-light')
    expect(allCss).toContain('--lightningcss-dark')
  })
})
