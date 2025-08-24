import { nextTestSetup } from 'e2e-utils'

describe('middleware-sitemap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be affected by middleware for sitemap.xml if there is no matcher', async () => {
    let html = await next.render('/')
    expect(html).toContain('redirected')

    html = await next.render('/sitemap.xml')
    expect(html).toContain('redirected')
  })
})
