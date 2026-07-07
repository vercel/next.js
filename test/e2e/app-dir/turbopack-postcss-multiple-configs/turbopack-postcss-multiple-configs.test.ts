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

  // Each directory's postcss.config.js passes a unique color option to the
  // shared plugin, which replaces `color: red` with the given color.
  // In production mode the CSS minifier may shorten named colors to hex
  // (e.g. blue → #00f), so we match on patterns that cover both forms.
  const DIR_COLORS: Record<number, string | RegExp> = {
    1: /blue|#00f/,
    2: /purple|#800080/,
    3: /orange|#ffa500/,
    4: /cyan|#0ff/,
    5: /magenta|#f0f/,
  }

  const DIRS = 5
  const FILES_PER_DIR = 3

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

  it('should apply per-directory PostCSS transforms with distinct colors', async () => {
    const cssContent = await collectCss(next)

    // Each directory's PostCSS config passes a unique color option.
    // Verify every expected color appears in the output.
    for (const [, pattern] of Object.entries(DIR_COLORS)) {
      expect(cssContent).toMatch(pattern)
    }

    // No original `color: red` should remain — all were transformed.
    expect(cssContent).not.toMatch(/color\s*:\s*red/)

    // The old hardcoded green should NOT appear, proving options are used.
    expect(cssContent).not.toMatch(/green|#0f0|#008000/)
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
