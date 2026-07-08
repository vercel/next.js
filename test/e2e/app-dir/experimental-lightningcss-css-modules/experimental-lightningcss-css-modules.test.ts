import { nextTestSetup } from 'e2e-utils'

/** Collect all CSS reachable from a page (inline <style> + linked .css). */
async function collectPageCss(
  next: ReturnType<typeof nextTestSetup>['next'],
  path: string
): Promise<string> {
  const html = await (await next.fetch(path)).text()
  let css = ''
  // Inline <style> blocks
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    css += m[1]
  }
  // External <link> stylesheets (href may contain query strings like ?dpl=...)
  for (const m of html.matchAll(/<link[^>]*href="([^"]*\.css[^"]*?)"[^>]*>/g)) {
    const res = await next.fetch(m[1])
    if (res.ok) css += await res.text()
  }
  return css
}

describe('experimental-lightningcss-css-modules', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    dependencies: { lightningcss: '^1.23.0' },
    nextConfig: {
      experimental: {
        useLightningcss: true,
        lightningCss: {
          cssModules: {
            // Non-default pattern so we can tell it apart from the built-in
            // `[name]__[hash]__[local]` pattern.
            pattern: '[local]__custom__[hash]',
          },
        },
      },
    },
  })

  it('applies the custom CSS-modules class-name pattern', async () => {
    const $ = await next.render$('/')
    const className = $('#box').attr('class')

    // The class is always applied and present in the emitted CSS.
    expect(className).toBeTruthy()
    const css = await collectPageCss(next, '/')
    expect(css).toContain(className)

    if (isTurbopack) {
      // `experimental.lightningCss.cssModules.pattern` is honored by Turbopack.
      // `[local]__custom__[hash]` renders the `.box` class as e.g.
      // `box__custom__<hash>`.
      expect(className).toMatch(/^box__custom__[^\s]+$/)
      expect(css).toContain('.box__custom__')
    }
    // Webpack does not (yet) honor `experimental.lightningCss`; it keeps its own
    // class-name pattern, so we only assert the generic behavior above.
  })
})
