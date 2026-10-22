import { nextTestSetup } from 'e2e-utils'

// Deploy mode exclusion: Vercel serves this i18n index redirect from its routing layer
// with a "Redirecting..." body instead of the destination path.
// @force-gate !vercel
describe('Custom routes i18n with index redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respond to default locale redirects correctly for index redirect', async () => {
    for (const [path, dest] of [
      ['/', '/destination'],
      ['/en', '/destination'],
      ['/fr', '/fr/destination'],
    ]) {
      const res = await next.fetch(path, {
        redirect: 'manual',
      })

      expect(res.status).toBe(dest ? 307 : 404)

      if (dest) {
        const text = await res.text()
        expect(text).toEqual(dest)
        if (dest.startsWith('/')) {
          const parsed = new URL(res.headers.get('location'), res.url)
          expect(parsed.pathname).toBe(dest)
          expect(parsed.search).toBe('')
        } else {
          expect(res.headers.get('location')).toBe(dest)
        }
      }
    }
  })
})
