import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Unoptimized Image Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  function runTests(url: string) {
    it(`should not optimize any image (${url})`, async () => {
      const browser = await next.browser(url)
      expect(
        await browser.elementById('internal-image').getAttribute('src')
      ).toMatch(/\/test.png(\?dpl=.*)?/)
      expect(
        await browser.elementById('static-image').getAttribute('src')
      ).toMatch(/test(.*)jpg/)
      expect(
        await browser.elementById('external-image').getAttribute('src')
      ).toBe('https://image-optimization-test.vercel.app/test.jpg')
      expect(
        await browser.elementById('eager-image').getAttribute('src')
      ).toMatch(/\/test.webp(\?dpl=.*)?/)

      expect(
        await browser.elementById('internal-image').getAttribute('srcset')
      ).toBeNull()
      expect(
        await browser.elementById('static-image').getAttribute('srcset')
      ).toBeNull()
      expect(
        await browser.elementById('external-image').getAttribute('srcset')
      ).toBeNull()
      expect(
        await browser.elementById('eager-image').getAttribute('srcset')
      ).toBeNull()

      await browser.eval(
        `document.getElementById("internal-image").scrollIntoView({behavior: "smooth"})`
      )
      await browser.eval(
        `document.getElementById("static-image").scrollIntoView({behavior: "smooth"})`
      )
      await browser.eval(
        `document.getElementById("external-image").scrollIntoView({behavior: "smooth"})`
      )
      await browser.eval(
        `document.getElementById("eager-image").scrollIntoView({behavior: "smooth"})`
      )

      await retry(async () => {
        const currentSrc = await browser.eval(
          `document.getElementById("external-image").currentSrc`
        )
        expect(currentSrc).toBe(
          'https://image-optimization-test.vercel.app/test.jpg'
        )
      })

      expect(
        await browser.elementById('internal-image').getAttribute('src')
      ).toMatch(/\/test.png(\?dpl=.*)?/)
      expect(
        await browser.elementById('static-image').getAttribute('src')
      ).toMatch(/test(.*)jpg/)
      expect(
        await browser.elementById('external-image').getAttribute('src')
      ).toBe('https://image-optimization-test.vercel.app/test.jpg')
      expect(
        await browser.elementById('eager-image').getAttribute('src')
      ).toMatch(/\/test.webp(\?dpl=.*)?/)

      expect(
        await browser.elementById('internal-image').getAttribute('srcset')
      ).toBeNull()
      expect(
        await browser.elementById('static-image').getAttribute('srcset')
      ).toBeNull()
      expect(
        await browser.elementById('external-image').getAttribute('srcset')
      ).toBeNull()
      expect(
        await browser.elementById('eager-image').getAttribute('srcset')
      ).toBeNull()
    })
  }

  describe('component', () => {
    runTests('/')
  })

  describe('getImageProps', () => {
    runTests('/get-img-props')
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
          qualities: [75],
          sizes: [
            640, 750, 828, 1080, 1200, 1920, 2048, 3840, 32, 48, 64, 96, 128,
            256, 384,
          ],
          unoptimized: true,
          customCacheHandler: false,
        },
      })
    })
  }
})
