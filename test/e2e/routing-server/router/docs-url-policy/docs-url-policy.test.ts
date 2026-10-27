import { nextTestSetup } from 'e2e-utils'

// R14: trailingSlash.mdx defines the default removal, opt-in addition and
// exceptions for a file extension or a path beneath .well-known/.
for (const trailingSlash of [false, true]) {
  describe(`documented trailing slash policy=${trailingSlash}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: { cacheComponents: false, trailingSlash },
    })

    for (const path of ['/about', '/folder.v1/about']) {
      it(`[R14] canonicalizes the page ${path} and preserves its query`, async () => {
        const source = trailingSlash ? path : `${path}/`
        const destination = trailingSlash ? `${path}/` : path
        const response = await next.fetch(`${source}?tag=first&tag=second`, {
          redirect: 'manual',
        })
        expect(response.status).toBe(308)
        const location = new URL(response.headers.get('location')!, next.url)
        expect(location.pathname).toBe(destination)
        expect(location.searchParams.getAll('tag')).toEqual(['first', 'second'])
        const canonical = await next.fetch(destination, { redirect: 'manual' })
        expect(canonical.status).toBe(200)
        expect(canonical.headers.get('location')).toBeNull()
        expect(await canonical.text()).toContain('page destination')
      })
    }

    for (const [path, content] of [
      ['/manual.txt', 'Public manual'],
      ['/.well-known/acme/challenge', 'Extensionless well-known challenge'],
      ['/.well-known/subfolder/config.json', 'well-known configuration'],
    ]) {
      it(`[R14] serves ${path} without appending a slash`, async () => {
        const response = await next.fetch(path, { redirect: 'manual' })
        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(await response.text()).toContain(content)
      })
    }

    it('[R14] removes a slash after a static file extension', async () => {
      const response = await next.fetch('/manual.txt/', { redirect: 'manual' })
      expect(response.status).toBe(308)
      expect(
        new URL(response.headers.get('location')!, next.url).pathname
      ).toBe('/manual.txt')
    })
  })
}

for (const trailingSlash of [false, true]) {
  describe(`skip trailing slash redirect with policy=${trailingSlash}`, () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        cacheComponents: false,
        trailingSlash,
        skipTrailingSlashRedirect: true,
      },
    })

    it('[R14/R17] serves both page forms when automatic redirects are disabled', async () => {
      for (const path of ['/about', '/about/']) {
        const response = await next.fetch(path, { redirect: 'manual' })
        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(await response.text()).toContain('page destination')
      }
    })
  })
}
