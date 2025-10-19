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
  it('should load matching images', async () => {
    const browser = await webdriver(appPort, '/')
    if (mode === 'dev') {
      await assertNoRedbox(browser)
    }
    const ids = ['nested-assets', 'static-img']
    const urls = await Promise.all(ids.map((id) => getSrc(browser, id)))
    const responses = await Promise.all(
      urls.map((url) => fetchViaHTTP(appPort, url))
    )
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
    const browser = await webdriver(appPort, page)
    if (mode === 'dev') {
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(
        /Invalid src prop (.+) on `next\/image` does not match `images.localPatterns` configured/g
      )
    } else {
      const url = await getSrc(browser, id)
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
          ],
          maximumRedirects: 3,
          minimumCacheTTL: 14400,
          path: '/_next/image',
          qualities: [75],
          sizes: [
            640, 750, 828, 1080, 1200, 1920, 2048, 3840, 32, 48, 64, 96, 128,
            256, 384,
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
