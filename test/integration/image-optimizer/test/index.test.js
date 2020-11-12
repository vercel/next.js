/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import isAnimated from 'next/dist/compiled/is-animated'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  nextBuild,
  nextStart,
  File,
  waitFor,
} from 'next-test-utils'
import sharp from 'sharp'

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
      output[file] = 'file'
    }
  }
  return output
}

async function expectWidth(res, w) {
  const buffer = await res.buffer()
  const meta = await sharp(buffer).metadata()
  expect(meta.width).toBe(w)
}

function runTests({ w, isDev, domains }) {
  it('should return home page', async () => {
    const res = await fetchViaHTTP(appPort, '/', null, {})
    expect(await res.text()).toMatch(/Image Optimizer Home/m)
  })

  it('should maintain animated gif', async () => {
    const query = { w, q: 90, url: '/animated.gif' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/gif')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    expect(isAnimated(await res.buffer())).toBe(true)
  })

  it('should maintain animated png', async () => {
    const query = { w, q: 90, url: '/animated.png' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    expect(isAnimated(await res.buffer())).toBe(true)
  })

  it('should maintain animated webp', async () => {
    const query = { w, q: 90, url: '/animated.webp' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/webp')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    expect(isAnimated(await res.buffer())).toBe(true)
  })

  it('should maintain vector svg', async () => {
    const query = { w, q: 90, url: '/test.svg' }
    const opts = { headers: { accept: 'image/webp' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('image/svg+xml')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url and png accept header', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/png' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url with invalid accept header as png', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url with invalid accept header as gif', async () => {
    const query = { url: '/test.gif', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/gif')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url with invalid accept header as tiff', async () => {
    const query = { url: '/test.tiff', w, q: 80 }
    const opts = { headers: { accept: 'image/invalid' } }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/tiff')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, w)
  })

  it('should resize relative url and Chrome accept header as webp', async () => {
    const query = { url: '/test.png', w, q: 80 }
    const opts = {
      headers: { accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
    }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=0, must-revalidate'
      )
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
  })

  it('should set 304 status without body when etag matches if-none-match', async () => {
    const query = { url: '/test.jpg', w, q: 80 }
    const opts1 = { headers: { accept: 'image/webp' } }

    const res1 = await fetchViaHTTP(appPort, '/_next/image', query, opts1)
    expect(res1.status).toBe(200)
    expect(res1.headers.get('Content-Type')).toBe('image/webp')
    expect(res1.headers.get('Cache-Control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    const etag = res1.headers.get('Etag')
    expect(etag).toBeTruthy()
    await expectWidth(res1, w)

    const opts2 = { headers: { accept: 'image/webp', 'if-none-match': etag } }
    const res2 = await fetchViaHTTP(appPort, '/_next/image', query, opts2)
    expect(res2.status).toBe(304)
    expect(res2.headers.get('Content-Type')).toBeFalsy()
    expect(res2.headers.get('Etag')).toBe(etag)
    expect((await res2.buffer()).length).toBe(0)

    const query3 = { url: '/test.jpg', w, q: 25 }
    const res3 = await fetchViaHTTP(appPort, '/_next/image', query3, opts2)
    expect(res3.status).toBe(200)
    expect(res3.headers.get('Content-Type')).toBe('image/webp')
    expect(res3.headers.get('Cache-Control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
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
    expect(res.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(res.headers.get('etag')).toBeTruthy()
    await expectWidth(res, 400)
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
        'Specified images.loader should be one of (default, imgix, cloudinary, akamai), received invalid value (notreal)'
      )
    })
  })

  // domains for testing
  const domains = ['localhost', 'example.com']

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
})
