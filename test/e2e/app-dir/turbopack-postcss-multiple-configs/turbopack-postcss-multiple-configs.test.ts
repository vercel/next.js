import { nextTestSetup } from 'e2e-utils'

describe('turbopack-postcss-multiple-configs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // 5 directories × 20 CSS modules = 100 total CSS files, each with its own
  // postcss.config.js. Initial compilation through PostCSS can be slow.
  it('should render all 100 elements from 5 directories with PostCSS-processed CSS modules', async () => {
    const $ = await next.render$('/')

    // Verify that all 100 elements from 5 directories × 20 files are rendered
    for (let dir = 1; dir <= 5; dir++) {
      for (let file = 1; file <= 20; file++) {
        const padded = String(file).padStart(2, '0')
        const id = `dir${dir}-file${padded}`
        const el = $(`#${id}`)
        expect(el.length).toBe(1)
        expect(el.text().trim()).toBe(`dir${dir} file${padded}`)
        // Each element should have a CSS module class assigned (hashed class name)
        expect(el.attr('class')).toBeTruthy()
      }
    }
  }, 360_000)

  it('should have PostCSS plugin transforms applied to CSS from all directories', async () => {
    const html = await next.render('/')

    // The PostCSS plugin transforms `color: red` to `color: green`.
    // After PostCSS processing, the served CSS should contain green, not red.

    // Collect all CSS content from inline styles and linked stylesheets
    let cssContent = ''

    // Extract inline <style> content
    const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    if (styleMatches) {
      cssContent += styleMatches.join('\n')
    }

    // Extract and fetch linked CSS URLs
    const hrefMatches = html.match(/href="([^"]*\.css[^"]*)"/gi)
    if (hrefMatches) {
      for (const match of hrefMatches) {
        const href = match.match(/href="([^"]+)"/)?.[1]
        if (href) {
          const cssRes = await next.fetch(href)
          if (cssRes.ok) {
            cssContent += await cssRes.text()
          }
        }
      }
    }

    // Verify PostCSS transformation: color should be green, not red
    expect(cssContent).toContain('green')
    // Ensure the original `color: red` was transformed
    const redColorPattern = /color\s*:\s*red/
    expect(cssContent).not.toMatch(redColorPattern)
  }, 360_000)
})
