import { nextTestSetup } from 'e2e-utils'

describe('middleware-sitemap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not be affected by middleware if sitemap.xml is excluded from the matcher', async () => {
    let html = await next.render('/')
    expect(html).toContain('redirected')

    // Confirm that /sitemap.xml is also redirected.
    html = await next.render('/sitemap.xml')
    expect(html).toContain('redirected')

    await next.patchFile('middleware.ts', (content) => {
      return content.replace('REPLACE_TO_SITEMAP', 'sitemap.xml')
    })

    await next.stop()
    await next.start()

    html = await next.render('/sitemap.xml')
    expect(html).not.toContain('redirected')
    expect(html).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(html).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    )
  })
})
