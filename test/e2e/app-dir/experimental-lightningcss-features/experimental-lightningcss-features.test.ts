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

describe('experimental-lightningcss-features', () => {
  describe('include', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: { lightningcss: '^1.23.0' },
      // Chrome 123 supports light-dark() natively — using it here proves that
      // the `include` flag forces transpilation regardless of browser support.
      packageJson: {
        browserslist: ['chrome 123'],
      },
      nextConfig: {
        experimental: {
          useLightningcss: true,
          lightningCssFeatures: {
            include: ['light-dark'],
          },
        },
      },
    })

    it('should transpile light-dark() when included in lightningCssFeatures', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello')

      // lightningcss transpiles light-dark(a, b) into fallback custom
      // properties: var(--lightningcss-light, a) var(--lightningcss-dark, b).
      const css = await collectPageCss(next, '/')
      expect(css).not.toContain('light-dark(')
      expect(css).toContain('--lightningcss-light')
      expect(css).toContain('--lightningcss-dark')
    })
  })

  describe('exclude', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: { lightningcss: '^1.23.0' },
      // Chrome 100 does NOT support light-dark() natively, so lightningcss would
      // normally transpile it. Using `exclude: ['light-dark']` should prevent that.
      packageJson: {
        browserslist: ['chrome 100'],
      },
      nextConfig: {
        experimental: {
          useLightningcss: true,
          lightningCssFeatures: {
            exclude: ['light-dark'],
          },
        },
      },
    })

    it('should preserve light-dark() when excluded from lightningCssFeatures', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello')

      // With `exclude: ['light-dark']`, lightningcss should NOT transpile
      // light-dark() — the raw function should remain in the output.
      const css = await collectPageCss(next, '/')
      expect(css).toContain('light-dark(')
      expect(css).not.toContain('--lightningcss-light')
      expect(css).not.toContain('--lightningcss-dark')
    })
  })

  describe('lightningCss.features precedence', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      dependencies: { lightningcss: '^1.23.0' },
      // Chrome 100 does NOT support light-dark() natively.
      packageJson: {
        browserslist: ['chrome 100'],
      },
      nextConfig: {
        experimental: {
          useLightningcss: true,
          // Legacy config says: do NOT transpile light-dark().
          lightningCssFeatures: {
            exclude: ['light-dark'],
          },
          // New passthrough says: DO transpile it. This must win.
          lightningCss: {
            features: {
              include: ['light-dark'],
            },
          },
        },
      },
    })

    it('lets lightningCss.features override lightningCssFeatures', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello')

      const css = await collectPageCss(next, '/')
      if (isTurbopack) {
        // `lightningCss.features.include` wins over `lightningCssFeatures.exclude`,
        // so light-dark() is transpiled.
        expect(css).not.toContain('light-dark(')
        expect(css).toContain('--lightningcss-light')
      } else {
        // Webpack ignores `experimental.lightningCss`, so `lightningCssFeatures`
        // (exclude) applies and light-dark() is preserved.
        expect(css).toContain('light-dark(')
      }
    })
  })
})
