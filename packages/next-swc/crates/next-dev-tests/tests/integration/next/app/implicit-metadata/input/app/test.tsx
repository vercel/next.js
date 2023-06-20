'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

export default function Test() {
  useTestHarness(() => {
    it('should have the correct link tags', () => {
      let links = Array.from(document.querySelectorAll('link'))
      expect(
        links.map((l) => ({
          href: l.getAttribute('href'),
          rel: l.getAttribute('rel'),
          sizes: l.getAttribute('sizes'),
        }))
      ).toEqual([
        expect.objectContaining({
          rel: 'manifest',
          href: expect.stringMatching(/^\/_next\/static\/.+\.webmanifest$/),
          sizes: null,
        }),
        expect.objectContaining({
          rel: 'icon',
          href: expect.stringMatching(/^\/_next\/static\/.+\.ico$/),
          sizes: '48x48',
        }),
        expect.objectContaining({
          rel: 'icon',
          href: expect.stringMatching(/^\/_next\/static\/.+\.png$/),
          sizes: '32x32',
        }),
        expect.objectContaining({
          rel: 'icon',
          href: expect.stringMatching(/^\/_next\/static\/.+\.png$/),
          sizes: '64x64',
        }),
        expect.objectContaining({
          rel: 'apple-touch-icon',
          href: expect.stringMatching(/^\/_next\/static\/.+\.png$/),
          sizes: '114x114',
        }),
      ])
    })

    it('should have the correct meta tags', () => {
      const meta = Array.from(document.querySelectorAll('meta'))
      const metaObject = Object.fromEntries(
        meta
          .filter((l) => l.getAttribute('property'))
          .map((l) => [l.getAttribute('property'), l.getAttribute('content')])
      )
      expect(metaObject).toEqual({
        'og:image': expect.stringMatching(/^.+\/_next\/static\/.+\.png$/),
        'og:image:width': '114',
        'og:image:height': '114',
        'og:image:alt': 'This is an alt text.',
      })
    })

    it('should provide a robots.txt', async () => {
      const res = await fetch('/robots.txt')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('User-Agent: *\nDisallow:\n')
    })

    it('should provide a sitemap.xml', async () => {
      const res = await fetch('/sitemap.xml')
      expect(res.status).toBe(200)
      expect(await res.text()).toBe(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://vercel.com/</loc>
    <lastmod>2023-03-06T18:04:14.008Z</lastmod>
  </url>
</urlset>
`
      )
    })

    it('should provide a favicon.ico', async () => {
      const res = await fetch('/favicon.ico')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/x-icon')
    })
  })
}
