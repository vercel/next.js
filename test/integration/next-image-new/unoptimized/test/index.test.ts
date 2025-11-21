/* eslint-env jest */

import { join } from 'path'
import {
  check,
  findPort,
  getImagesManifest,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
let appPort
let app

function runTests(url: string, mode: 'dev' | 'server') {
  it('should not optimize any image', async () => {
    const browser = await webdriver(appPort, url)
    expect(
      await browser.elementById('internal-image').getAttribute('src')
    ).toBe('/test.png')
    expect(
      await browser.elementById('static-image').getAttribute('src')
    ).toMatch(/test(.*)jpg/)
    expect(
      await browser.elementById('external-image').getAttribute('src')
    ).toBe('https://image-optimization-test.vercel.app/test.jpg')
    expect(await browser.elementById('eager-image').getAttribute('src')).toBe(
      '/test.webp'
    )

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

    await check(
      () =>
        browser.eval(`document.getElementById("external-image").currentSrc`),
      'https://image-optimization-test.vercel.app/test.jpg'
    )

    expect(
      await browser.elementById('internal-image').getAttribute('src')
    ).toBe('/test.png')
    expect(
      await browser.elementById('static-image').getAttribute('src')
    ).toMatch(/test(.*)jpg/)
    expect(
      await browser.elementById('external-image').getAttribute('src')
    ).toBe('https://image-optimization-test.vercel.app/test.jpg')
    expect(await browser.elementById('eager-image').getAttribute('src')).toBe(
      '/test.webp'
    )

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

  if (mode === 'server') {
    it('should build correct images-manifest.json', async () => {
      const manifest = getImagesManifest(appDir)
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
          minimumCacheTTL: 14400,
          path: '/_next/image',
          qualities: [75],
          sizes: [
            640, 750, 828, 1080, 1200, 1920, 2048, 3840, 32, 48, 64, 96, 128,
            256, 384,
          ],
          unoptimized: true,
        },
      })
    })
  }
}

describe('Unoptimized Image Tests', () => {
  describe('development mode - component', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests('/', 'dev')
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode - component',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('/', 'server')
    }
  )
  describe('development mode - getImageProps', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests('/get-img-props', 'dev')
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode - getImageProps',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('/get-img-props', 'server')
    }
  )
})
