import { nextTestSetup } from 'e2e-utils'

describe('Custom routes i18n with index redirect', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Assertions don't apply to deploy mode (output differs vs. local Next.js server).
    skipDeployment: true,
  })
  if (skipped) return

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
          const parsed = new URL(res.headers.get('location'))
          expect(parsed.pathname).toBe(dest)
          expect(parsed.search).toBe('')
        } else {
          expect(res.headers.get('location')).toBe(dest)
        }
      }
    }
  })
})
