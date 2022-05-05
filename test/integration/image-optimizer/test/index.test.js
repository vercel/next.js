/* eslint-env jest */
import {
  check,
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
import { join } from 'path'
import { cleanImagesDir, expectWidth, fsToJson, runTests } from './util'

const appDir = join(__dirname, '../app')
const imagesDir = join(appDir, '.next', 'cache', 'images')
const nextConfig = new File(join(appDir, 'next.config.js'))
const largeSize = 1080 // defaults defined in server/config.ts

describe('Image Optimizer', () => {
  describe('config checks', () => {
    let app

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

    it('should error when remotePatterns length exceeds 50', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          experimental: {
            images: {
              remotePatterns: Array.from({ length: 51 }).map((_) => ({
                hostname: 'example.com',
              })),
            },
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
        'Specified images.remotePatterns exceeds length of 50, received length (51), please reduce the length of the array to continue'
      )
    })

    it('should error when remotePatterns has invalid prop', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          experimental: {
            images: {
              remotePatterns: [{ hostname: 'example.com', foo: 'bar' }],
            },
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
        'Invalid images.remotePatterns values:\n{"hostname":"example.com","foo":"bar"}'
      )
    })

    it('should error when remotePatterns is missing hostname', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          experimental: {
            images: {
              remotePatterns: [{ protocol: 'https' }],
            },
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
        'Invalid images.remotePatterns values:\n{"protocol":"https"}'
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

    it('should error when images.formats contains invalid values', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            formats: ['image/avif', 'jpeg'],
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
        `Specified images.formats should be an Array of mime type strings, received invalid values (jpeg)`
      )
    })

    it('should error when images.loader is assigned but images.path is not', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            loader: 'imgix',
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
        `Specified images.loader property (imgix) also requires images.path property to be assigned to a URL prefix.`
      )
    })

    it('should error when images.dangerouslyAllowSVG is not a boolean', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            dangerouslyAllowSVG: 'foo',
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
        `Specified images.dangerouslyAllowSVG should be a boolean`
      )
    })

    it('should error when images.contentSecurityPolicy is not a string', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            contentSecurityPolicy: 1,
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
        `Specified images.contentSecurityPolicy should be a string`
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

  // Reduce to 5 seconds so tests dont dont need to
  // wait too long before testing stale responses.
  const minimumCacheTTL = 5

  describe('Server support for minimumCacheTTL in next.config.js', () => {
    const size = 96 // defaults defined in server/config.ts
    const dangerouslyAllowSVG = true
    const ctx = {
      w: size,
      isDev: false,
      domains,
      minimumCacheTTL,
      dangerouslyAllowSVG,
      imagesDir,
      appDir,
    }
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          domains,
          minimumCacheTTL,
          dangerouslyAllowSVG,
        },
      })
      ctx.nextOutput = ''
      nextConfig.replace('{ /* replaceme */ }', json)
      await nextBuild(appDir)
      await cleanImagesDir({ imagesDir })
      ctx.appPort = await findPort()
      ctx.app = await nextStart(appDir, ctx.appPort, {
        onStderr(msg) {
          ctx.nextOutput += msg
        },
      })
    })
    afterAll(async () => {
      await killApp(ctx.app)
      nextConfig.restore()
    })

    runTests(ctx)
  })

  describe('Server support for trailingSlash in next.config.js', () => {
    let app
    let appPort
    beforeAll(async () => {
      nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          trailingSlash: true,
        })
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    it('should return successful response for original loader', async () => {
      let res
      const query = { url: '/test.png', w: 8, q: 70 }
      res = await fetchViaHTTP(appPort, '/_next/image/', query)
      expect(res.status).toBe(200)
    })
  })

  describe('Server support for headers in next.config.js', () => {
    const size = 96 // defaults defined in server/config.ts
    let app
    let appPort

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
      await cleanImagesDir({ imagesDir })
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    it('should set max-age header', async () => {
      const query = { url: '/test.png', w: size, q: 75 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=0, must-revalidate`
      )
      expect(res.headers.get('Content-Disposition')).toBe(
        `inline; filename="test.webp"`
      )

      await check(async () => {
        const files = await fsToJson(imagesDir)

        let found = false
        const maxAge = '86400'

        Object.keys(files).forEach((dir) => {
          if (
            Object.keys(files[dir]).some((file) => file.includes(`${maxAge}.`))
          ) {
            found = true
          }
        })
        return found ? 'success' : 'failed'
      }, 'success')
    })

    it('should not set max-age header when not matching next.config.js', async () => {
      const query = { url: '/test.jpg', w: size, q: 75 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=0, must-revalidate`
      )
      expect(res.headers.get('Content-Disposition')).toBe(
        `inline; filename="test.webp"`
      )
    })
  })

  describe('dev support next.config.js cloudinary loader', () => {
    let app
    let appPort

    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          loader: 'cloudinary',
          path: 'https://example.com/act123/',
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      await cleanImagesDir({ imagesDir })
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
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
    let app
    let appPort

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
      await cleanImagesDir({ imagesDir })
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })

    it('should return response when image is served from an external rewrite', async () => {
      await cleanImagesDir({ imagesDir })

      const query = { url: '/next-js/next-js-bg.png', w: 64, q: 75 }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('image/webp')
      expect(res.headers.get('Cache-Control')).toBe(
        `public, max-age=0, must-revalidate`
      )
      expect(res.headers.get('Vary')).toBe('Accept')
      expect(res.headers.get('Content-Disposition')).toBe(
        `inline; filename="next-js-bg.webp"`
      )

      await check(async () => {
        const files = await fsToJson(imagesDir)

        let found = false
        const maxAge = '31536000'

        Object.keys(files).forEach((dir) => {
          if (
            Object.keys(files[dir]).some((file) => file.includes(`${maxAge}.`))
          ) {
            found = true
          }
        })
        return found ? 'success' : 'failed'
      }, 'success')
      await expectWidth(res, 64)
    })
  })

  describe('dev support for dynamic blur placeholder', () => {
    let app
    let appPort
    beforeAll(async () => {
      const json = JSON.stringify({
        images: {
          deviceSizes: [largeSize],
          imageSizes: [],
        },
      })
      nextConfig.replace('{ /* replaceme */ }', json)
      await cleanImagesDir({ imagesDir })
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
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
