import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'

describe('prerender-header', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('sends a single prerender header for a static HTML response', async () => {
    for (let request = 0; request < 2; request++) {
      const response = await next.fetch('/')
      await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get('x-nextjs-prerender')).toBe('1')
    }
  })

  it('sends a single prerender header for a static RSC response', async () => {
    for (let request = 0; request < 2; request++) {
      const response = await next.fetch('/', { headers: { RSC: '1' } })
      await response.text()
      expect(response.status).toBe(200)
      expect(response.headers.get('x-nextjs-prerender')).toBe('1')
    }
  })

  it('preserves configured links alongside font preloads', async () => {
    const response = await next.fetch('/preloads')
    const $ = load(await response.text())
    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain(
      '<https://example.com>; rel="preconnect"'
    )
    // Cache Components hoists font preloads into the cached Link header;
    // otherwise they are emitted in the HTML.
    const fontPreloads = $('link[rel="preload"][as="font"]')
      .map((_, link) => $(link).attr('href'))
      .get()
    expect([response.headers.get('link'), ...fontPreloads].join(', ')).toMatch(
      /\.woff2/
    )
  })
})
