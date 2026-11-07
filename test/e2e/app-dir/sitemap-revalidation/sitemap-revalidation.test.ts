import { load } from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression coverage for https://github.com/nextjs/adapter-vercel/issues/150.
// Keep these behavioral checks enabled in deploy mode as well as next start.
describe('sitemap-revalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const taggedSitemap = '/sitemap-revalidation/tagged/sitemap.xml'

  async function readLastModified(pathname: string) {
    const response = await next.fetch(pathname)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/xml')

    const $ = load(await response.text(), { xmlMode: true })
    expect($('urlset > url')).toHaveLength(1)
    expect($('urlset > url > loc').text()).toContain(
      'https://example.com/sitemap-revalidation'
    )

    const lastModified = $('urlset > url > lastmod').text()
    expect(new Date(lastModified).toISOString()).toBe(lastModified)
    return lastModified
  }

  async function readPlainGeneratedAt() {
    const response = await next.fetch('/plain')
    expect(response.status).toBe(200)
    const { generatedAt } = await response.json()
    expect(new Date(generatedAt).toISOString()).toBe(generatedAt)
    return generatedAt as string
  }

  it('serves generated sitemaps', async () => {
    await readLastModified('/sitemap.xml')
    await readLastModified(taggedSitemap)
  })

  // Development regenerates on every request, so it cannot verify ISR.
  // @force-gate !dev
  describe('revalidation', () => {
    it('regenerates a sitemap and a regular route handler after their revalidation interval', async () => {
      const initialSitemap = await readLastModified('/sitemap.xml')
      const initialPlain = await readPlainGeneratedAt()

      // Poll through stale-while-revalidate without depending on cache headers
      // or an exact boundary between the stale response and regeneration.
      await retry(async () => {
        expect(await readLastModified('/sitemap.xml')).not.toBe(initialSitemap)
        expect(await readPlainGeneratedAt()).not.toBe(initialPlain)
      }, 60000)
    })

    it('regenerates a sitemap after revalidateTag', async () => {
      const initial = await readLastModified(taggedSitemap)
      expect(await readLastModified(taggedSitemap)).toBe(initial)

      const response = await next.fetch('/revalidate?type=tag', {
        method: 'POST',
      })
      expect(response.status).toBe(204)

      // This route and its data have no time-based expiry, so a changed value
      // proves that tag invalidation reached the cached sitemap response.
      await retry(async () => {
        expect(await readLastModified(taggedSitemap)).not.toBe(initial)
      }, 60000)
    })

    it('regenerates a sitemap after revalidatePath', async () => {
      const initial = await readLastModified(taggedSitemap)
      expect(await readLastModified(taggedSitemap)).toBe(initial)

      const response = await next.fetch('/revalidate?type=path', {
        method: 'POST',
      })
      expect(response.status).toBe(204)

      await retry(async () => {
        expect(await readLastModified(taggedSitemap)).not.toBe(initial)
      }, 60000)
    })
  })
})
