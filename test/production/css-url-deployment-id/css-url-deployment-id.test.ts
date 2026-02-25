import { nextTestSetup } from 'e2e-utils'

describe('css-url-deployment-id', () => {
  const deploymentId = 'test-deployment-id'

  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: { sass: '1.54.0' },
  })

  it('should include dpl query in CSS url() references for images and fonts', async () => {
    const $ = await next.render$('/')

    // Collect all CSS file URLs from link tags
    const cssUrls: string[] = []
    const links = Array.from($('link'))
    for (const link of links) {
      const href = link.attribs.href
      if (href && href.includes('.css')) {
        cssUrls.push(href)
      }
    }

    // Also check for inline styles that may contain CSS
    const styles = Array.from($('style'))

    // Fetch all CSS files and collect their contents
    let allCssContent = ''
    for (const cssUrl of cssUrls) {
      const res = await next.fetch(cssUrl)
      const cssText = await res.text()
      allCssContent += cssText + '\n'
    }

    // Also collect inline style content
    for (const style of styles) {
      const children = style.children
      if (children && children.length > 0) {
        for (const child of children) {
          if ('data' in child) {
            allCssContent += child.data + '\n'
          }
        }
      }
    }

    // Extract all url() references from the CSS
    const urlMatches = allCssContent.match(/url\([^)]+\)/g) || []

    // Filter to only asset URLs (images and fonts), excluding data URIs
    const assetUrls = urlMatches.filter(
      (u) =>
        !u.includes('data:') && (u.includes('.png') || u.includes('.woff2'))
    )

    expect(assetUrls.length).toBeGreaterThanOrEqual(1)

    for (const assetUrl of assetUrls) {
      expect(assetUrl).toContain('dpl=' + deploymentId)
    }
  })

  it('should include dpl query in CSS module url() references', async () => {
    const $ = await next.render$('/')

    const cssUrls: string[] = []
    const links = Array.from($('link'))
    for (const link of links) {
      const href = link.attribs.href
      if (href && href.includes('.css')) {
        cssUrls.push(href)
      }
    }

    const styles = Array.from($('style'))

    let allCssContent = ''
    for (const cssUrl of cssUrls) {
      const res = await next.fetch(cssUrl)
      const cssText = await res.text()
      allCssContent += cssText + '\n'
    }

    for (const style of styles) {
      const children = style.children
      if (children && children.length > 0) {
        for (const child of children) {
          if ('data' in child) {
            allCssContent += child.data + '\n'
          }
        }
      }
    }

    // Find image references from CSS modules (page.module.css)
    const imageUrls = allCssContent.match(/url\([^)]+\.png[^)]*\)/g) || []
    expect(imageUrls.length).toBeGreaterThanOrEqual(1)

    for (const imageUrl of imageUrls) {
      expect(imageUrl).toContain('dpl=' + deploymentId)
    }

    // Find font references from CSS modules
    const fontUrls = allCssContent.match(/url\([^)]+\.woff2[^)]*\)/g) || []
    expect(fontUrls.length).toBeGreaterThanOrEqual(1)

    for (const fontUrl of fontUrls) {
      expect(fontUrl).toContain('dpl=' + deploymentId)
    }
  })
})
