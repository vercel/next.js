import { nextTestSetup } from 'e2e-utils'

describe('turbopack-postcss-multiple-configs', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    // Per-directory PostCSS config resolution is a Turbopack-only feature
    // (turbopackLocalPostcssConfig). Webpack does not support this feature and
    // does not accept function-valued PostCSS plugins, so skip non-Turbopack runs.
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  if (!isTurbopack) {
    it('should only run with Turbopack', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()
  })

  const DIRS = 5
  const FILES_PER_DIR = 3

  // Verifies that per-directory postcss.config.js files are resolved correctly
  // when experimental.turbopackLocalPostcssConfig is enabled. Each of the 5
  // style directories has its own PostCSS config that transforms `color: red`
  // to `color: green`. The root postcss.config.js is a no-op, so if only the
  // root config were used, the CSS would still contain red.

  it('should render all elements with CSS module classes applied', async () => {
    const $ = await next.render$('/')

    for (let dir = 1; dir <= DIRS; dir++) {
      for (let file = 1; file <= FILES_PER_DIR; file++) {
        const padded = String(file).padStart(2, '0')
        const id = `dir${dir}-file${padded}`
        const el = $(`#${id}`)
        expect(el.length).toBe(1)
        expect(el.text().trim()).toBe(`dir${dir} file${padded}`)
        expect(el.attr('class')).toBeTruthy()
      }
    }
  })

  it('should apply per-directory PostCSS transforms (color: red → green)', async () => {
    const cssContent = await collectCss(next)

    // The per-directory PostCSS plugins transform `color: red` to `color: green`.
    // If per-directory resolution works, CSS contains green and no red.
    expect(cssContent).toContain('green')
    expect(cssContent).not.toMatch(/color\s*:\s*red/)
  })
})

/** Collect all CSS from the page: inline <style> tags + linked .css files. */
async function collectCss(next: any): Promise<string> {
  const html = await next.render('/')
  const parts: string[] = []

  // Inline <style> content
  const styleMatches = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
  if (styleMatches) {
    parts.push(...styleMatches)
  }

  // Linked CSS files
  const hrefMatches = html.match(/href="([^"]*\.css[^"]*)"/gi)
  if (hrefMatches) {
    for (const match of hrefMatches) {
      const href = match.match(/href="([^"]+)"/)?.[1]
      if (href) {
        const res = await next.fetch(href)
        if (res.ok) {
          parts.push(await res.text())
        }
      }
    }
  }

  return parts.join('\n')
}
