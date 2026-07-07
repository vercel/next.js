import { nextTestSetup, isNextDev, type Playwright } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('Image qualities config', () => {
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

  it('should load img when quality is undefined', async () => {
    const browser = await next.browser('/')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-undefined')
    const res = await next.fetch(url)
    expect(res.status).toStrictEqual(200)
    expect(url).toContain('&q=69')
  })

  it('should load img when quality 42', async () => {
    const browser = await next.browser('/')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-42')
    const res = await next.fetch(url)
    expect(res.status).toStrictEqual(200)
  })

  it('should load img when quality 69', async () => {
    const browser = await next.browser('/')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-69')
    const res = await next.fetch(url)
    expect(res.status).toStrictEqual(200)
  })

  it('should load img when quality 88', async () => {
    const browser = await next.browser('/')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-88')
    const res = await next.fetch(url)
    expect(res.status).toStrictEqual(200)
  })

  it('should coerce quality 100 to closest matching of 88', async () => {
    const page = '/invalid-quality'
    const browser = await next.browser(page)
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-100')
    expect(url).toContain('&q=88')
    const res = await next.fetch(url)
    expect(res.status).toBe(200)
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
                '^(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$))(?:(?:(?!(?:^|\\/)\\.{1,2}(?:\\/|$)).)*?)\\/?)$',
              search: '',
            },
          ],
          maximumRedirects: 3,
          maximumResponseBody: 50000000,
          minimumCacheTTL: 14400,
          path: '/_next/image',
          qualities: [42, 69, 88],
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
