/* eslint-env jest */

import {
  assertHasRedbox,
  assertNoRedbox,
  fetchViaHTTP,
  findPort,
  getImagesManifest,
  getRedboxHeader,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort: number
let app: Awaited<ReturnType<typeof launchApp>>

async function getSrc(
  browser: Awaited<ReturnType<typeof webdriver>>,
  id: string
) {
  const src = await browser.elementById(id).getAttribute('src')
  if (src) {
    const url = new URL(src, `http://localhost:${appPort}`)
    return url.href.slice(url.origin.length)
  }
}

function runTests(mode: 'dev' | 'server') {
  it('should load img when quality is undefined', async () => {
    const browser = await webdriver(appPort, '/')
    if (mode === 'dev') {
      await assertNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-undefined')
    const res = await fetchViaHTTP(appPort, url)
    expect(res.status).toStrictEqual(200)
    expect(url).toContain('&q=69') // default to closest to 75
  })

  it('should load img when quality 42', async () => {
    const browser = await webdriver(appPort, '/')
    if (mode === 'dev') {
      await assertNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-42')
    const res = await fetchViaHTTP(appPort, url)
    expect(res.status).toStrictEqual(200)
  })

  it('should load img when quality 69', async () => {
    const browser = await webdriver(appPort, '/')
    if (mode === 'dev') {
      await assertNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-69')
    const res = await fetchViaHTTP(appPort, url)
    expect(res.status).toStrictEqual(200)
  })

  it('should load img when quality 88', async () => {
    const browser = await webdriver(appPort, '/')
    if (mode === 'dev') {
      await assertNoRedbox(browser)
    }
    const url = await getSrc(browser, 'q-88')
    const res = await fetchViaHTTP(appPort, url)
    expect(res.status).toStrictEqual(200)
  })

  it('should fail to load img when quality is 100', async () => {
    const page = '/invalid-quality'
    const browser = await webdriver(appPort, page)
    if (mode === 'dev') {
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(
        /Invalid quality prop (.+) on `next\/image` does not match `images.qualities` configured/g
      )
    } else {
      const url = await getSrc(browser, 'q-100')
      const res = await fetchViaHTTP(appPort, url)
      expect(res.status).toBe(400)
    }
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
          dangerouslyAllowSVG: false,
          deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
          disableStaticImages: false,
          domains: [],
          formats: ['image/webp'],
          imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
          loader: 'default',
          loaderFile: '',
          remotePatterns: [],
          localPatterns: undefined,
          minimumCacheTTL: 60,
          path: '/_next/image',
          qualities: [42, 69, 88],
          sizes: [
            640, 750, 828, 1080, 1200, 1920, 2048, 3840, 16, 32, 48, 64, 96,
            128, 256, 384,
          ],
          unoptimized: false,
        },
      })
    })
  }
}

describe('Image localPatterns config', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('dev')
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('server')
    }
  )
})
