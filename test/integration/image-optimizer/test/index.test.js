/* eslint-env jest */
import fs from 'fs-extra'
import sizeOf from 'image-size'
import {
  fetchViaHTTP,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import isAnimated from 'next/dist/compiled/is-animated'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const imagesDir = join(appDir, '.next', 'cache', 'images')
const nextConfig = new File(join(appDir, 'next.config.js'))
const largeSize = 1080 // defaults defined in server/config.ts
let appPort
let app

async function fsToJson(dir, output = {}) {
  const files = await fs.readdir(dir)
  for (let file of files) {
    const fsPath = join(dir, file)
    const stat = await fs.stat(fsPath)
    if (stat.isDirectory()) {
      output[file] = {}
      await fsToJson(fsPath, output[file])
    } else {
      output[file] = stat.mtime.toISOString()
    }
  }
  return output
}

async function expectWidth(res, w) {
  const buffer = await res.buffer()
  const d = sizeOf(buffer)
  expect(d.width).toBe(w)
}

function runTests({ w, isDev, domains = [], ttl }) {
  it('should return home page', async () => {
    const res = await fetchViaHTTP(appPort, '/', null, {})
    expect(await res.text()).toMatch(/Image Optimizer Home/m)
  })

  it('should maintain animated gif', async () => {
    const query = { w, q: 90, url: '/animated.gif' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/gif')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(isAnimated(await res.buffer())).toBe(true)
  })

  it('should maintain animated png', async () => {
    const query = { w, q: 90, url: '/animated.png' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(isAnimated(await res.buffer())).toBe(true)
  })

  it('should maintain animated webp', async () => {
    const query = { w, q: 90, url: '/animated.webp' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    expect(isAnimated(await res.buffer())).toBe(true)
  })

  it('should maintain vector svg', async () => {
    const query = { w, q: 90, url: '/test.svg' }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    // SVG is compressible so will have accept-encoding set from
    // compression
    expect(res.headers.get('Vary')).toMatch(/^Accept(,|$)/)
    expect(res.headers.get('etag')).toBeTruthy()
    const actual = await res.text()
    const expected = await fs.readFile(
      join(__dirname, '..', 'public', 'test.svg'),
      'utf8'
    )
    expect(actual).toMatch(expected)
  })

  it('should maintain ico format', async () => {
    const query = { w, q: 90, url: '/test.ico' }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/x-icon')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toMatch(/^Accept(,|$)/)
    expect(res.headers.get('etag')).toBeTruthy()
    const actual = await res.text()
    const expected = await fs.readFile(
      join(__dirname, '..', 'public', 'test.ico'),
      'utf8'
    )
    expect(actual).toMatch(expected)
  })

  it('should maintain jpg format for old Safari', async () => {
    const accept =
      'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5'
    const query = { w, q: 90, url: '/test.jpg' }
    const opts = { headers: { accept } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
  })

  it('should maintain png format for old Safari', async () => {
    const accept =
      'image/png,image/svg+xml,image/*;q=0.8,video/*;q=0.8,*/*;q=0.5'
    const query = { w, q: 75, url: '/test.png' }
    const opts = { headers: { accept } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
  })

  it('should fail when url is missing', async () => {
    const query = { w, q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is required`)
  })

  it('should fail when w is missing', async () => {
    const query = { url: '/test.png', q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"w" parameter (width) is required`)
  })

  it('should fail when q is missing', async () => {
    const query = { url: '/test.png', w }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"q" parameter (quality) is required`)
  })

  it('should fail when q is greater than 100', async () => {
    const query = { url: '/test.png', w, q: 101 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be a number between 1 and 100`
    )
  })

  it('should fail when q is less than 1', async () => {
    const query = { url: '/test.png', w, q: 0 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be a number between 1 and 100`
    )
  })

  it('should fail when w is 0 or less', async () => {
    const query = { url: '/test.png', w: 0, q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) must be a number greater than 0`
    )
  })

  it('should fail when w is not a number', async () => {
    const query = { url: '/test.png', w: 'foo', q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) must be a number greater than 0`
    )
  })

  it('should fail when q is not a number', async () => {
    const query = { url: '/test.png', w, q: 'foo' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"q" parameter (quality) must be a number between 1 and 100`
    )
  })

  it('should fail when domain is not defined in next.config.js', async () => {
    const url = `http://vercel.com/button`
    const query = { url, w, q: 100 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is not allowed`)
  })

  it('should fail when width is not in next.config.js', async () => {
    const query = { url: '/test.png', w: 1000, q: 100 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(
      `"w" parameter (width) of 1000 is not allowed`
    )
  })

  it('should resize relative url and webp Firefox accept header', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/webp,*/*' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url and png accept header', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/png' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url with invalid accept header as png', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url with invalid accept header as gif', async () => {
    const query = { url: '/test.gif', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/gif')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    // FIXME: await expectWidth(res, w)
  })

  it('should resize relative url with invalid accept header as tiff', async () => {
    const query = { url: '/test.tiff', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/tiff')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    // FIXME: await expectWidth(res, w)
  })

  it('should resize relative url and Chrome accept header as webp', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = {
      headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
    }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  if (domains.includes('localhost')) {
    it('should resize absolute url from localhost', async () => {
      const url = `http://localhost:${appPort}/test.png`
      const query = { url, w, q: 80 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=0, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('etag')).toBeTruthy()
      await expectWidth(res, w)
    })

    it('should automatically detect image type when content-type is octet-stream', async () => {
      const url =
        'https://image-optimization-test.vercel.app/png-as-octet-stream'
      const resOrig = await fetch(url)
      expect(resOrig.status).toBe(200)
      expect(resOrig.headers.get('Content-Type')).toBe(
        'application/octet-stream'
      )
      const query = { url, w, q: 80 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=0, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('etag')).toBeTruthy()
      await expectWidth(res, w)
    })
  }

  it('should fail when url has file protocol', async () => {
    const url = `file://localhost:${appPort}/test.png`
    const query = { url, w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is invalid`)
  })

  it('should fail when url has ftp protocol', async () => {
    const url = `ftp://localhost:${appPort}/test.png`
    const query = { url, w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe(`"url" parameter is invalid`)
  })

  if (domains.includes('localhost')) {
    it('should fail when url fails to load an image', async () => {
      const url = `http://localhost:${appPort}/not-an-image`
      const query = { w, url, q: 100 }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
      expect(res.status).toBe(404)
      expect(await res.text()).toBe(
        `"url" parameter is valid but upstream response is invalid`
      )
    })
  }

  it('should use cached image file when parameters are the same', async () => {
    await fs.remove(imagesDir)

    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/webp')
    const json1 = await fsToJson(imagesDir)
    expect(Object.keys(json1).length).toBe(1)

    const res2 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res2.status).toBe(200)
    expect(res2.headers.get('Content-Type')).toBe('image/webp')
    const json2 = await fsToJson(imagesDir)
    expect(json2).toStrictEqual(json1)

    if (ttl) {
      // Wait until expired so we can confirm image is regenerated
      await waitFor(ttl * 1000)
      const res3 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res3.status).toBe(200)
      expect(res3.headers.get('Content-Type')).toBe('image/webp')
      const json3 = await fsToJson(imagesDir)
      expect(json3).not.toStrictEqual(json1)
      expect(Object.keys(json3).length).toBe(1)
    }
  })

  it('should use cached image file when parameters are the same for svg', async () => {
    await fs.remove(imagesDir)

    const query = { url: '/test.svg', w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/svg+xml')
    const json1 = await fsToJson(imagesDir)
    expect(Object.keys(json1).length).toBe(1)

    const res2 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res2.status).toBe(200)
    expect(res2.headers.get('Content-Type')).toBe('image/svg+xml')
    const json2 = await fsToJson(imagesDir)
    expect(json2).toStrictEqual(json1)
  })

  it('should use cached image file when parameters are the same for animated gif', async () => {
    await fs.remove(imagesDir)

    const query = { url: '/animated.gif', w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/gif')
    const json1 = await fsToJson(imagesDir)
    expect(Object.keys(json1).length).toBe(1)

    const res2 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res2.status).toBe(200)
    expect(res2.headers.get('Content-Type')).toBe('image/gif')
    const json2 = await fsToJson(imagesDir)
    expect(json2).toStrictEqual(json1)
  })

  it('should set 304 status without body when etag matches if-none-match', async () => {
    const query = { url: '/test.jpg', w, q: 80 }
    const opts1 = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(appPort, '/_next/image', query, opts1)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/webp')
    expect(res1.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res1.headers.get('Vary')).toBe('Accept')
    const etag = res1.headers.get('Etag')
    expect(etag).toBeTruthy()
    await expectWidth(res1, w)

    const opts2 = { headers: { accept: 'image/webp', 'if-none-match': etag } }
    const res2 = await fetchViaHTTP(appPort, '/_next/image', query, opts2)
    expect(res2.status).toBe(304)
    expect(res2.headers.get('Content-Type')).toBeFalsy()
    expect(res2.headers.get('Etag')).toBe(etag)
    expect(res2.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res2.headers.get('Vary')).toBe('Accept')
    expect((await res2.buffer()).length).toBe(0)

    const query3 = { url: '/test.jpg', w, q: 25 }
    const res3 = await fetchViaHTTP(appPort, '/_next/image', query3, opts2)
    expect(res3.status).toBe(200)
    expect(res3.headers.get('Content-Type')).toBe('image/webp')
    expect(res3.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res3.headers.get('Vary')).toBe('Accept')
    expect(res3.headers.get('Etag')).toBeTruthy()
    expect(res3.headers.get('Etag')).not.toBe(etag)
    await expectWidth(res3, w)
  })

  it('should proxy-pass unsupported image types and should not cache file', async () => {
    const json1 = await fsToJson(imagesDir)
    expect(json1).toBeTruthy()

    const query = { url: '/test.bmp', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/bmp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    // bmp is compressible so will have accept-encoding set from
    // compression
    expect(res.headers.get('Vary')).toMatch(/^Accept(,|$)/)
    expect(res.headers.get('etag')).toBeTruthy()

    const json2 = await fsToJson(imagesDir)
    expect(json2).toStrictEqual(json1)
  })

  it('should not resize if requested width is larger than original source image', async () => {
    const query = { url: '/test.jpg', w: largeSize, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, 400)
  })

  it('should not change the color type of a png', async () => {
    // https://github.com/vercel/next.js/issues/22929
    // A grayscaled PNG with transparent pixels.
    const query = { url: '/grayscale.png', w: largeSize, q: 80 }
    const opts = { headers: { accept: 'image/png' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe(
      `public, max-age=0, must-revalidate`
    )
    expect(res.headers.get('Vary')).toBe('Accept')

    const png = await res.buffer()

    // Read the color type byte (offset 9 + magic number 16).
    // http://www.libpng.org/pub/png/spec/1.2/PNG-Chunks.html
    const colorType = png.readUIntBE(25, 1)
    expect(colorType).toBe(4)
  })

  it('should set cache-control to immutable for static images', async () => {
    if (!isDev) {
      const query = {
        url:
          '/_next/static/image/public/test.480a01e5ea850d0231aec0fa94bd23a0.jpg',
        w,
        q: 100,
      }
      const opts = { headers: { accept: 'image/webp' } }

      const res1 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res1.status).toBe(200)
      expect(res1.headers.get('Cache-Control')).toBe(
        'public, max-age=315360000, immutable'
      )
      expect(res1.headers.get('Vary')).toBe('Accept')
      await expectWidth(res1, w)

      // Ensure subsequent request also has immutable header
      const res2 = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res2.status).toBe(200)
      expect(res2.headers.get('Cache-Control')).toBe(
        'public, max-age=315360000, immutable'
      )
      expect(res2.headers.get('Vary')).toBe('Accept')
      await expectWidth(res2, w)
    }
  })

  it("should error if the resource isn't a valid image", async () => {
    const query = { url: '/test.txt', w, q: 80 }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("The requested resource isn't a valid image.")
  })

  it('should handle concurrent requests', async () => {
    await fs.remove(imagesDir)
    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/webp,*/*' } }
    const [res1, res2] = await Promise.all([
      fetchViaHTTP(appPort, '/_next/image', query, opts),
      fetchViaHTTP(appPort, '/_next/image', query, opts),
    ])
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/webp')
    expect(res2.headers.get('Content-Type')).toBe('image/webp')
    await expectWidth(res1, w)
    await expectWidth(res2, w)

    const json1 = await fsToJson(imagesDir)
    expect(Object.keys(json1).length).toBe(1)
  })
}

describe('Image Optimizer', () => {
  describe('config checks', () => {
    it('should error when domains length exceeds 50', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            domains: new Array(51).fill('google.com'),
          },
        })
      )
      let stderr = ''

      app = await launchApp(appDir, await findPort(), {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await waitFor(1000)
      await killApp(app).catch(() => {})
      await nextConfig.restore()

      expect(stderr).toContain(
        'Specified images.domains exceeds length of 50, received length (51), please reduce the length of the array to continue'
      )
    })

    it('should error when sizes length exceeds 25', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            deviceSizes: new Array(51).fill(1024),
          },
        })
      )
      let stderr = ''

      app = await launchApp(appDir, await findPort(), {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await waitFor(1000)
      await killApp(app).catch(() => {})
      await nextConfig.restore()

      expect(stderr).toContain(
        'Specified images.deviceSizes exceeds length of 25, received length (51), please reduce the length of the array to continue'
      )
    })

    it('should error when deviceSizes contains invalid widths', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            deviceSizes: [0, 12000, 64, 128, 256],
          },
        })
      )
      let stderr = ''

      app = await launchApp(appDir, await findPort(), {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await waitFor(1000)
      await killApp(app).catch(() => {})
      await nextConfig.restore()

      expect(stderr).toContain(
        'Specified images.deviceSizes should be an Array of numbers that are between 1 and 10000, received invalid values (0, 12000)'
      )
    })

    it('should error when imageSizes contains invalid widths', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            imageSizes: [0, 16, 64, 12000],
          },
        })
      )
      let stderr = ''

      app = await launchApp(appDir, await findPort(), {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await waitFor(1000)
      await killApp(app).catch(() => {})
      await nextConfig.restore()

      expect(stderr).toContain(
        'Specified images.imageSizes should be an Array of numbers that are between 1 and 10000, received invalid values (0, 12000)'
      )
    })

    it('should error when loader contains invalid value', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            loader: 'notreal',
          },
        })
      )
      let stderr = ''

      app = await launchApp(appDir, await findPort(), {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
      await waitFor(1000)
      await killApp(app).catch(() => {})
      await nextConfig.restore()

      expect(stderr).toContain(
        'Specified images.loader should be one of (default, imgix, cloudinary, akamai, custom), received invalid value (notreal)'
      )
    })

    it('should error when loader=custom but loader prop is undefined', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            loader: 'custom',
          },
        })
      )
      let output = ''
      const appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          output += msg || ''
        },
        onStdout(msg) {
          output += msg || ''
        },
      })
      await renderViaHTTP(appPort, '/', {})
      await killApp(app).catch(() => {})
      await nextConfig.restore()
      expect(output).toMatch(
        /Error: Image with src "(.+)" is missing "loader" prop/
      )
    })
  })

  // domains for testing
  const domains = [
    'localhost',
    'example.com',
    'assets.vercel.com',
    'image-optimization-test.vercel.app',
  ]

  describe('dev support w/o next.config.js', () => {
    const size = 384 // defaults defined in server/config.ts
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(imagesDir)
    })

    runTests({ w: size, isDev: true, domains: [] })
  })

  describe('dev support with next.config.js', () => {
    const size = 64
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          deviceSizes: [largeSize],
          imageSizes: [size],
          domains,
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    runTests({ w: size, isDev: true, domains })
  })

  describe('Server support w/o next.config.js', () => {
    const size = 384 // defaults defined in server/config.ts
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(imagesDir)
    })

    runTests({ w: size, isDev: false, domains: [] })
  })

  describe('Server support with next.config.js', () => {
    const size = 128
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          deviceSizes: [size, largeSize],
          domains,
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    runTests({ w: size, isDev: false, domains })
  })

  describe('Server support for minimumCacheTTL in next.config.js', () => {
    const size = 96 // defaults defined in server/config.ts
    const ttl = 5 // super low ttl in seconds
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          minimumCacheTTL: ttl,
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    runTests({ w: size, isDev: false, ttl })
  })

  describe('Server support for headers in next.config.js', () => {
    const size = 96 // defaults defined in server/config.ts
    beforeAll(async () => {
      nextConfig.replace(
        '{ /* replaceme */ }',
        `{
        async headers() {
          return [
            {
              source: '/test.png',
              headers: [
                {
                  key: 'Cache-Control',
                  value: 'public, max-age=86400, must-revalidate',
                },
              ],
            },
          ]
        },
      }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    it('should set max-age header from upstream when matching next.config.js', async () => {
      const query = { url: '/test.png', w: size, q: 75 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=86400, must-revalidate`
      )
    })

    it('should not set max-age header when not matching next.config.js', async () => {
      const query = { url: '/test.jpg', w: size, q: 75 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=0, must-revalidate`
      )
    })
  })

  describe('Serverless support with next.config.js', () => {
    const size = 256
    beforeAll(async () => {
      const json = JSON.stringify({
        target: 'experimental-serverless-trace',
        images: {
          deviceSizes: [size, largeSize],
          domains,
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    runTests({ w: size, isDev: false, domains })
  })

  describe('dev support next.config.js cloudinary loader', () => {
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          loader: 'cloudinary',
          path: 'https://example.com/act123/',
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })
    it('should 404 when loader is not default', async () => {
      const size = 384 // defaults defined in server/config.ts
      const query = { w: size, q: 90, url: '/test.svg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(404)
    })
  })

  describe('External rewrite support with for serving static content in images', () => {
    beforeAll(async () => {
      const newConfig = `{
        async rewrites() {
          return [
            {
              source: '/:base(next-js)/:rest*',
              destination: 'https://assets.vercel.com/image/upload/v1538361091/repositories/:base/:rest*',
            },
          ]
        },
      }`
      nextConfig.replace('{ /* replaceme */ }', newConfig)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    it('should return response when image is served from an external rewrite', async () => {
      const query = { url: '/next-js/next-js-bg.png', w: 64, q: 75 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=31536000, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      await expectWidth(res, 64)
    })
  })

  describe('dev support for dynamic blur placeholder', () => {
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          deviceSizes: [largeSize],
          imageSizes: [],
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(imagesDir)
    })

    it('should support width 8 per BLUR_IMG_SIZE with next dev', async () => {
      const query = { url: '/test.png', w: 8, q: 70 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      await expectWidth(res, 8)
    })
  })
})
