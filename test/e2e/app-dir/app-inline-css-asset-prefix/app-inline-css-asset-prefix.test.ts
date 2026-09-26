import { nextTestSetup } from 'e2e-utils'
import type cheerio from 'cheerio'

const ASSET_PREFIX = 'https://example.vercel.sh'

function getInlinedStyleUrls($: ReturnType<typeof cheerio.load>) {
  const styleContent = $('style')
    .toArray()
    .map((el) => $(el).html())
    .join('\n')

  const urls: string[] = []
  for (const match of styleContent.matchAll(/url\(([^)]+)\)/g)) {
    urls.push(match[1].replace(/['"]/g, ''))
  }
  return urls
}

describe('app dir - css - experimental inline css with assetPrefix', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // CSS is only inlined in production builds.
  ;(isNextDev ? describe.skip : describe)('Production only', () => {
    it('should inline css into a style tag', async () => {
      const $ = await next.render$('/')

      expect($('style').length).toBeGreaterThan(0)
      expect($('link[rel="stylesheet"]').length).toBe(0)
    })

    it('should prefix inlined url() references with assetPrefix', async () => {
      const $ = await next.render$('/')

      const urls = getInlinedStyleUrls($)
      const fontUrls = urls.filter((url) => url.includes('.woff2'))

      // One from next/font/local and one from the @font-face in global.css.
      expect(fontUrls.length).toBeGreaterThanOrEqual(2)

      for (const url of fontUrls) {
        expect(url).toMatch(
          new RegExp(
            `^${ASSET_PREFIX}/_next/static/(immutable/)?media/[^/]+\\.woff2`
          )
        )
      }
    })

    it('should use the same url for the font preload and the inlined @font-face', async () => {
      const $ = await next.render$('/')

      const preloadHrefs = $('link[rel="preload"][as="font"]')
        .toArray()
        .map((el) => $(el).attr('href'))
      expect(preloadHrefs.length).toBeGreaterThan(0)

      const inlinedUrls = getInlinedStyleUrls($)
      for (const href of preloadHrefs) {
        expect(href).toMatch(new RegExp(`^${ASSET_PREFIX}/_next/`))
        expect(inlinedUrls).toContain(href)
      }
    })
  })
})
