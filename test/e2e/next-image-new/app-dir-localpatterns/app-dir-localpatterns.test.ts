import { nextTestSetup, isNextDev, type Playwright } from 'e2e-utils'
import {
  getRedboxHeader,
  waitForNoRedbox,
  waitForRedbox,
} from 'next-test-utils'

describe('Image localPatterns config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  async function getSrc(browser: Playwright, id: string) {
    const src = await browser.elementById(id).getAttribute('src')
    if (src) {
      const url = new URL(src, next.url)
      return url.href.slice(url.origin.length)
    }
  }

  it('should load matching images', async () => {
    const browser = await next.browser('/')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }
    const ids = ['nested-assets', 'static-img']
    const urls = await Promise.all(ids.map((id) => getSrc(browser, id)))
    const responses = await Promise.all(urls.map((url) => next.fetch(url)))
    const statuses = responses.map((res) => res.status)
    expect(statuses).toStrictEqual([200, 200])
  })

  it.each([
    'does-not-exist',
    'nested-assets-query',
    'nested-blocked',
    'top-level',
  ])('should block unmatched image %s', async (id: string) => {
    const page = '/' + id
    const browser = await next.browser(page)
    if (isNextDev) {
      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(
        /Invalid src prop (.+) on `next\/image` does not match `images.localPatterns` configured/g
      )
    } else {
      const url = await getSrc(browser, id)
      const res = await next.fetch(url)
      expect(res.status).toBe(400)
    }
  })

  if (!isNextDev) {
    it('should build correct images-manifest.json', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/images-manifest.json')
      )
      expect(manifest).toEqual({
        version: 1,
        images: {
          contentDispositionType: 'attachment',
          contentSecurityPolicy:
            "script-src 'none'; frame-src 'none'; sandbox;",
          dangerouslyAllowLocalIP: false,
          dangerouslyAllowSVG: false,
          deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
          disableStaticImages: false,
          domains: [],
          formats: ['image/webp'],
          imageSizes: [32, 48, 64, 96, 128, 256, 384],
          loader: 'default',
          loaderFile: '',
          remotePatterns: [],
          localPatterns: [
            {
              pathname:
                '^(?:\\/assets(?:\\/(?!\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)|$))$',
              search: '',
            },
            {
              pathname:
                '^(?:\\/_next\\/static\\/media(?:\\/(?!\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)|$))$',
              search: '',
            },
            {
              pathname:
                '^(?:\\/_next\\/static\\/immutable\\/media(?:\\/(?!\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)|$))$',
              search: '',
            },
          ],
          maximumRedirects: 3,
          maximumResponseBody: 50000000,
          minimumCacheTTL: 14400,
          path: '/_next/image',
          qualities: [75],
          sizes: [
            640, 750, 828, 1080, 1200, 1920, 2048, 3840, 32, 48, 64, 96, 128,
            256, 384,
          ],
          unoptimized: false,
          customCacheHandler: false,
        },
      })
    })
  }
})
