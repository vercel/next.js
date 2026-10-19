import { nextTestSetup, isNextDev } from 'e2e-utils'
;(isNextDev ? describe.skip : describe)('i18n-beforefiles-rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const locales = ['en', 'fr']

  const autoStaticRoutes = [
    { pathname: '', content: 'index' },
    { pathname: '/home/a', content: 'Home A' },
    { pathname: '/home/b', content: 'Home B' },
    { pathname: '/dynamic/static', content: 'static route' },
    { pathname: '/dynamic/first', content: 'dynamic route' },
    { pathname: '/team/slug', content: '/[teamId]/[slug]' },
  ]

  it('should serve locale-prefixed auto-static pages', async () => {
    for (const { pathname, content } of autoStaticRoutes) {
      for (const locale of locales) {
        const url = `/${locale}${pathname}`
        const res = await next.fetch(url)
        const html = await res.text()

        expect({ url, status: res.status }).toEqual({ url, status: 200 })
        expect(html).toContain(content)
      }
    }
  })

  it.each(['', '/en', '/fr'])(
    'should 404 for %s/rewrite-before-files',
    async (localePrefix) => {
      // beforeFiles rewrites /rewrite-before-files to /somewhere.
      // /somewhere does not match any page, so this should 404.
      // Before the fix, orphan dynamic HTML output could incorrectly match.
      const res = await next.fetch(`${localePrefix}/rewrite-before-files`)
      expect(res.status).toBe(404)
    }
  )
})
