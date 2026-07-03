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

// experimental.lightningCssModules is only supported by Turbopack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'lightningcss-css-modules',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        experimental: {
          lightningCssModules: {
            pattern: 'nxt-[hash]-[local]',
            animation: false,
          },
        },
      },
    })

    it('should apply the custom naming pattern to CSS Module classes', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello')

      // The class on the element and in the stylesheet should follow
      // `nxt-[hash]-[local]` instead of the default `[name]__[hash]__[local]`.
      expect(html).toMatch(/class="nxt-[a-zA-Z0-9_-]+-item"/)

      const css = await collectPageCss(next, '/')
      expect(css).toMatch(/\.nxt-[a-zA-Z0-9_-]+-item/)
    })

    it('should not scope @keyframes names when animation is disabled', async () => {
      const css = await collectPageCss(next, '/')

      // With `animation: false`, the keyframes name keeps its authored name
      // instead of being renamed with the scoping pattern.
      expect(css).toContain('@keyframes fade')
      expect(css).not.toMatch(/@keyframes nxt-/)
    })
  }
)
