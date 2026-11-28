import { nextTestSetup } from 'e2e-utils'

describe('css-compound-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should not emit a stylesheet twice when the layout and page share it', async () => {
    const html = await next.render('/')

    const hrefs = Array.from(
      html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
      (match) => match[1]
    )

    // `pageExtensions: ['page.tsx']` means the layout is `layout.page.tsx`. If
    // its convention name is read as `layout.page` instead of `layout`, the CSS
    // it shares with the page is no longer deduplicated to the layout and both
    // entries emit it.
    expect(hrefs.length).toBeGreaterThan(0)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })
})
