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
  retry,
  waitFor,
} from 'next-test-utils'
import { join } from 'path'
import { cleanImagesDir, expectWidth, fsToJson } from './util'

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
        'Array must contain at most 50 element(s) at "images.domains"'
      )
    })

    it('should error when remotePatterns length exceeds 50', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            remotePatterns: Array.from({ length: 51 }).map((_) => ({
              hostname: 'example.com',
            })),
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
        'Array must contain at most 50 element(s) at "images.remotePatterns"'
      )
    })

    it('should error when remotePatterns has invalid prop', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            remotePatterns: [{ hostname: 'example.com', foo: 'bar' }],
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
        `Unrecognized key(s) in object: 'foo' at "images.remotePatterns[0]"`
      )
    })

    it('should error when remotePatterns is missing hostname', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            remotePatterns: [{ protocol: 'https' }],
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
        `"images.remotePatterns[0].hostname" is missing, expected string`
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
        `Array must contain at most 25 element(s) at "images.deviceSizes"`
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
        'Number must be greater than or equal to 1 at "images.deviceSizes[0]"'
      )
      expect(stderr).toContain(
        'Number must be less than or equal to 10000 at "images.deviceSizes[1]"'
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
        'Number must be greater than or equal to 1 at "images.imageSizes[0]"'
      )
      expect(stderr).toContain(
        'Number must be less than or equal to 10000 at "images.imageSizes[3]"'
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
        `Expected 'default' | 'imgix' | 'cloudinary' | 'akamai' | 'custom', received 'notreal' at "images.loader"`
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
        `Expected 'image/avif' | 'image/webp', received 'jpeg' at "images.formats[1]"`
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

    it('should error when images.loader and images.loaderFile are both assigned', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            loader: 'imgix',
            path: 'https://example.com',
            loaderFile: './dummy.js',
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
        `Specified images.loader property (imgix) cannot be used with images.loaderFile property. Please set images.loader to "custom".`
      )
    })

    it('should error when images.loaderFile does not exist', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            loaderFile: './fakefile.js',
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

      expect(stderr).toContain(`Specified images.loaderFile does not exist at`)
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
        `Expected boolean, received string at "images.dangerouslyAllowSVG"`
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
        `Expected string, received number at "images.contentSecurityPolicy"`
      )
    })

    it('should error when assetPrefix is provided but is invalid', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          assetPrefix: 'httpbad',
          images: {
            formats: ['image/webp'],
          },
        })
      )
      try {
        let stderr = ''

        app = await launchApp(appDir, await findPort(), {
          onStderr(msg) {
            stderr += msg || ''
          },
        })

        await retry(() => {
          expect(stderr).toContain(
            `Invalid assetPrefix provided. Original error: TypeError [ERR_INVALID_URL]: Invalid URL`
          )
        })
      } finally {
        await killApp(app).catch(() => {})
        await nextConfig.restore()
      }
    })

    it('should error when images.remotePatterns is invalid', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            remotePatterns: 'testing',
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
        `Expected array, received string at "images.remotePatterns"`
      )
    })

    it('should error when images.contentDispositionType is not valid', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            contentDispositionType: 'nope',
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
        `Expected 'inline' | 'attachment', received 'nope' at "images.contentDispositionType"`
      )
    })

    it('should error when images.minimumCacheTTL is not valid', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            minimumCacheTTL: -1,
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
        `Number must be greater than or equal to 0 at "images.minimumCacheTTL"`
      )
    })

    it('should error when images.unoptimized is not a boolean', async () => {
      await nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            unoptimized: 'yup',
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
        `Expected boolean, received string at "images.unoptimized"`
      )
    })
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
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
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
            `public, max-age=86400, must-revalidate`
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
                Object.keys(files[dir]).some((file) =>
                  file.includes(`${maxAge}.`)
                )
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
            `public, max-age=60, must-revalidate`
          )
          expect(res.headers.get('Content-Disposition')).toBe(
            `inline; filename="test.webp"`
          )
        })
      }
    )
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

  describe('images.unoptimized in next.config.js', () => {
    let app
    let appPort

    beforeAll(async () => {
      nextConfig.replace(
        '{ /* replaceme */ }',
        JSON.stringify({
          images: {
            unoptimized: true,
          },
        })
      )
      await cleanImagesDir({ imagesDir })
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      nextConfig.restore()
    })
    it('should 404 when unoptimized', async () => {
      const size = 384 // defaults defined in server/config.ts
      const query = { w: size, q: 75, url: '/test.jpg' }
      const opts = { headers: { accept: 'image/webp' } }
      const res = await fetchViaHTTP(appPort, '/_next/image', query, opts)
      expect(res.status).toBe(404)
    })
  })

  describe('External rewrite support with for serving static content in images', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
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
            `public, max-age=31536000, must-revalidate`
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
                Object.keys(files[dir]).some((file) =>
                  file.includes(`${maxAge}.`)
                )
              ) {
                found = true
              }
            })
            return found ? 'success' : 'failed'
          }, 'success')
          await expectWidth(res, 64)
        })
      }
    )
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
      await expectWidth(res, 320)
    })
  })
})
