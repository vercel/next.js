import { nextTestSetup } from 'e2e-utils'

describe('experimental-lightningcss-features', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { lightningcss: '^1.23.0' },
    // Chrome 123 supports light-dark() natively — using it here proves that
    // the `include` flag forces transpilation regardless of browser support.
    packageJson: {
      browserslist: ['chrome 123'],
    },
  })

  /** Collect all CSS reachable from a page (inline <style> + linked .css). */
  async function collectPageCss(path: string): Promise<string> {
    const html = await (await next.fetch(path)).text()
    let css = ''
    // Inline <style> blocks
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      css += m[1]
    }
    // External <link> stylesheets (href may contain query strings like ?dpl=...)
    for (const m of html.matchAll(
      /<link[^>]*href="([^"]*\.css[^"]*?)"[^>]*>/g
    )) {
      const res = await next.fetch(m[1])
      if (res.ok) css += await res.text()
    }
    return css
  }

  it('should transpile light-dark() when included in lightningCssFeatures', async () => {
    const html = await next.render('/')
    expect(html).toContain('Hello')

    // lightningcss transpiles light-dark(a, b) into fallback custom
    // properties: var(--lightningcss-light, a) var(--lightningcss-dark, b).
    const css = await collectPageCss('/')
    expect(css).not.toContain('light-dark(')
    expect(css).toContain('--lightningcss-light')
    expect(css).toContain('--lightningcss-dark')
  })
})
