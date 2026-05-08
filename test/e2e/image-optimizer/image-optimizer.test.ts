import { join } from 'path'
import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { check } from 'next-test-utils'
import { cleanImagesDir, expectWidth, fsToJson } from './util'

function toQueryString(query: Record<string, any>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v))
  }
  return params.toString()
}

const largeSize = 1080

describe('Image Optimizer', () => {
  describe('config checks', () => {
    const { next, skipped } = nextTestSetup({
      files: join(__dirname, 'app'),
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    const configChecks: Array<{
      name: string
      config: string
      expected: string | string[]
    }> = [
      {
        name: 'should error when domains length exceeds 50',
        config: JSON.stringify({
          images: { domains: new Array(51).fill('google.com') },
        }),
        expected:
          'Array must contain at most 50 element(s) at "images.domains"',
      },
      {
        name: 'should error when localPatterns length exceeds 25',
        config: JSON.stringify({
          images: {
            localPatterns: Array.from({ length: 26 }).map(() => ({
              pathname: '/foo/**',
            })),
          },
        }),
        expected:
          'Array must contain at most 25 element(s) at "images.localPatterns"',
      },
      {
        name: 'should error when localPatterns has invalid prop',
        config: JSON.stringify({
          images: {
            localPatterns: [{ pathname: '/foo/**', foo: 'bar' }],
          },
        }),
        expected: `Unrecognized key(s) in object: 'foo' at "images.localPatterns[0]"`,
      },
      {
        name: 'should error when remotePatterns length exceeds 50',
        config: JSON.stringify({
          images: {
            remotePatterns: Array.from({ length: 51 }).map(() => ({
              hostname: 'example.com',
            })),
          },
        }),
        expected:
          'Array must contain at most 50 element(s) at "images.remotePatterns"',
      },
      {
        name: 'should error when remotePatterns has invalid prop',
        config: JSON.stringify({
          images: {
            remotePatterns: [{ hostname: 'example.com', foo: 'bar' }],
          },
        }),
        expected: `Unrecognized key(s) in object: 'foo' at "images.remotePatterns[0]"`,
      },
      {
        name: 'should error when remotePatterns is missing hostname',
        config: JSON.stringify({
          images: { remotePatterns: [{ protocol: 'https' }] },
        }),
        expected: `"images.remotePatterns[0].hostname" is missing, expected string`,
      },
      {
        name: 'should error when sizes length exceeds 25',
        config: JSON.stringify({
          images: { deviceSizes: new Array(51).fill(1024) },
        }),
        expected:
          'Array must contain at most 25 element(s) at "images.deviceSizes"',
      },
      {
        name: 'should error when deviceSizes contains invalid widths',
        config: JSON.stringify({
          images: { deviceSizes: [0, 12000, 64, 128, 256] },
        }),
        expected: [
          'Number must be greater than or equal to 1 at "images.deviceSizes[0]"',
          'Number must be less than or equal to 10000 at "images.deviceSizes[1]"',
        ],
      },
      {
        name: 'should error when imageSizes contains invalid widths',
        config: JSON.stringify({
          images: { imageSizes: [0, 16, 64, 12000] },
        }),
        expected: [
          'Number must be greater than or equal to 1 at "images.imageSizes[0]"',
          'Number must be less than or equal to 10000 at "images.imageSizes[3]"',
        ],
      },
      {
        name: 'should error when qualities length exceeds 20',
        config: JSON.stringify({
          images: {
            qualities: [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
              20, 21,
            ],
          },
        }),
        expected:
          'Array must contain at most 20 element(s) at "images.qualities"',
      },
      {
        name: 'should error when qualities array has a value thats not an integer',
        config: JSON.stringify({
          images: { qualities: [1, 2, 3, 9.9] },
        }),
        expected: 'Expected integer, received float at "images.qualities[3]"',
      },
      {
        name: 'should error when qualities array is empty',
        config: JSON.stringify({
          images: { qualities: [] },
        }),
        expected:
          'Array must contain at least 1 element(s) at "images.qualities"',
      },
      {
        name: 'should error when loader contains invalid value',
        config: JSON.stringify({
          images: { loader: 'notreal' },
        }),
        expected: `Expected 'default' | 'imgix' | 'cloudinary' | 'akamai' | 'custom', received 'notreal' at "images.loader"`,
      },
      {
        name: 'should error when images.formats contains invalid values',
        config: JSON.stringify({
          images: { formats: ['image/avif', 'jpeg'] },
        }),
        expected: `Expected 'image/avif' | 'image/webp', received 'jpeg' at "images.formats[1]"`,
      },
      {
        name: 'should error when images.loader is assigned but images.path is not',
        config: JSON.stringify({
          images: { loader: 'imgix' },
        }),
        expected:
          'Specified images.loader property (imgix) also requires images.path property to be assigned to a URL prefix.',
      },
      {
        name: 'should error when images.loader and images.loaderFile are both assigned',
        config: JSON.stringify({
          images: {
            loader: 'imgix',
            path: 'https://example.com',
            loaderFile: './dummy.js',
          },
        }),
        expected:
          'Specified images.loader property (imgix) cannot be used with images.loaderFile property. Please set images.loader to "custom".',
      },
      {
        name: 'should error when images.loaderFile does not exist',
        config: JSON.stringify({
          images: { loaderFile: './fakefile.js' },
        }),
        expected: 'Specified images.loaderFile does not exist at',
      },
      {
        name: 'should error when images.dangerouslyAllowSVG is not a boolean',
        config: JSON.stringify({
          images: { dangerouslyAllowSVG: 'foo' },
        }),
        expected:
          'Expected boolean, received string at "images.dangerouslyAllowSVG"',
      },
      {
        name: 'should error when images.contentSecurityPolicy is not a string',
        config: JSON.stringify({
          images: { contentSecurityPolicy: 1 },
        }),
        expected:
          'Expected string, received number at "images.contentSecurityPolicy"',
      },
      {
        name: 'should error when assetPrefix is provided but is invalid',
        config: JSON.stringify({
          assetPrefix: 'httpbad',
          images: { formats: ['image/webp'] },
        }),
        expected: [
          'Invalid assetPrefix provided. Original error:',
          'Invalid URL',
        ],
      },
      {
        name: 'should error when images.remotePatterns is invalid',
        config: JSON.stringify({
          images: { remotePatterns: 'testing' },
        }),
        expected: 'Expected array, received string at "images.remotePatterns"',
      },
      {
        name: 'should error when images.remotePatterns URL has invalid protocol',
        config: `{ images: { remotePatterns: [new URL('file://example.com/**')] } }`,
        expected:
          'Specified images.remotePatterns must have protocol "http" or "https" received "file"',
      },
      {
        name: 'should error when images.contentDispositionType is not valid',
        config: JSON.stringify({
          images: { contentDispositionType: 'nope' },
        }),
        expected: `Expected 'inline' | 'attachment', received 'nope' at "images.contentDispositionType"`,
      },
      {
        name: 'should error when images.minimumCacheTTL is not valid',
        config: JSON.stringify({
          images: { minimumCacheTTL: -1 },
        }),
        expected:
          'Number must be greater than or equal to 0 at "images.minimumCacheTTL"',
      },
      {
        name: 'should error when images.unoptimized is not a boolean',
        config: JSON.stringify({
          images: { unoptimized: 'yup' },
        }),
        expected: 'Expected boolean, received string at "images.unoptimized"',
      },
    ]

    for (const { name, config, expected } of configChecks) {
      it(name, async () => {
        const outputBefore = next.cliOutput.length
        await next.patchFile('next.config.js', `module.exports = ${config}`)
        await next.build()
        const newOutput = next.cliOutput.slice(outputBefore)
        const expectations = Array.isArray(expected) ? expected : [expected]
        for (const exp of expectations) {
          expect(newOutput).toContain(exp)
        }
        await next.patchFile(
          'next.config.js',
          '// prettier-ignore\nmodule.exports = {}'
        )
      })
    }
  })
  describe('Server support for trailingSlash in next.config.js', () => {
    const { next, skipped } = nextTestSetup({
      files: join(__dirname, 'app'),
      nextConfig: {
        trailingSlash: true,
        images: {
          imageSizes: [8, 16, 32, 48, 64, 96, 128, 256, 384],
          qualities: [70, 75],
        },
      },
      skipDeployment: true,
    })
    if (skipped) return

    it('should return successful response for original loader', async () => {
      const query = { url: '/test.png', w: 8, q: 70 }
      const res = await next.fetch(`/_next/image/?${toQueryString(query)}`)
      expect(res.status).toBe(200)
    })
  })
  ;(isNextStart ? describe : describe.skip)(
    'Server support for headers in next.config.js',
    () => {
      const size = 96
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'app'),
        skipDeployment: true,
      })
      if (skipped) return

      beforeAll(async () => {
        await next.patchFile(
          'next.config.js',
          `module.exports = {
        async headers() {
          return [
            {
              source: '/test.png',
              headers: [
                {
                  key: 'Cache-Control',
                  value: 'public, max-age=14400, must-revalidate',
                },
              ],
            },
          ]
        },
      }`
        )
      })
      afterAll(async () => {
        await next.patchFile(
          'next.config.js',
          '// prettier-ignore\nmodule.exports = { /* replaceme */ }'
        )
      })

      it('should set max-age header', async () => {
        const query = { url: '/test.png', w: size, q: 75 }
        const opts = { headers: { accept: 'image/webp' } }
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(200)
        expect(res.headers.get('Cache-Control')).toBe(
          'public, max-age=14400, must-revalidate'
        )
        expect(res.headers.get('Content-Disposition')).toBe(
          'attachment; filename="test.webp"'
        )

        const imagesDir = join(next.testDir, '.next', 'cache', 'images')
        await check(async () => {
          const files = await fsToJson(imagesDir)
          let found = false
          const maxAge = '14400'
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
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(200)
        expect(res.headers.get('Cache-Control')).toBe(
          'public, max-age=14400, must-revalidate'
        )
        expect(res.headers.get('Content-Disposition')).toBe(
          'attachment; filename="test.webp"'
        )
      })
    }
  )
  ;(isNextDev ? describe : describe.skip)(
    'dev support next.config.js cloudinary loader',
    () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'app'),
        nextConfig: {
          images: {
            loader: 'cloudinary',
            path: 'https://example.com/act123/',
          },
        },
        skipDeployment: true,
      })
      if (skipped) return

      it('should 404 when loader is not default', async () => {
        const size = 384
        const query = { w: size, q: 90, url: '/test.svg' }
        const opts = { headers: { accept: 'image/webp' } }
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(404)
      })
    }
  )
  ;(isNextDev ? describe : describe.skip)(
    'images.unoptimized in next.config.js',
    () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'app'),
        nextConfig: {
          images: { unoptimized: true },
        },
        skipDeployment: true,
      })
      if (skipped) return

      it('should 404 when unoptimized', async () => {
        const size = 384
        const query = { w: size, q: 75, url: '/test.jpg' }
        const opts = { headers: { accept: 'image/webp' } }
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(404)
      })
    }
  )
  ;(isNextDev ? describe : describe.skip)(
    'experimental.imgOptMaxInputPixels in next.config.js',
    () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'app'),
        nextConfig: {
          experimental: { imgOptMaxInputPixels: 100 },
        },
        skipDeployment: true,
      })
      if (skipped) return

      it('should fallback to source image when input exceeds imgOptMaxInputPixels', async () => {
        const size = 256
        const query = { w: size, q: 75, url: '/test.jpg' }
        const opts = { headers: { accept: 'image/webp' } }
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('image/jpeg')
      })
    }
  )
  ;(isNextStart ? describe : describe.skip)(
    'External rewrite support with for serving static content in images',
    () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'app'),
        nextConfig: {
          async rewrites() {
            return [
              {
                source: '/:base(next-js)/:rest*',
                destination:
                  'https://assets.vercel.com/image/upload/v1538361091/repositories/:base/:rest*',
              },
            ]
          },
        },
        skipDeployment: true,
      })
      if (skipped) return

      it('should return response when image is served from an external rewrite', async () => {
        const imagesDir = join(next.testDir, '.next', 'cache', 'images')
        await cleanImagesDir(imagesDir)

        const query = { url: '/next-js/next-js-bg.png', w: 64, q: 75 }
        const opts = { headers: { accept: 'image/webp' } }
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(200)
        expect(res.headers.get('Content-Type')).toBe('image/webp')
        expect(res.headers.get('Cache-Control')).toBe(
          'public, max-age=31536000, must-revalidate'
        )
        expect(res.headers.get('Vary')).toBe('Accept')
        expect(res.headers.get('Content-Disposition')).toBe(
          'attachment; filename="next-js-bg.webp"'
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
  ;(isNextDev ? describe : describe.skip)(
    'dev support for dynamic blur placeholder',
    () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'app'),
        nextConfig: {
          images: {
            deviceSizes: [largeSize],
            imageSizes: [],
          },
        },
        skipDeployment: true,
      })
      if (skipped) return

      it('should support width 8 per BLUR_IMG_SIZE with next dev', async () => {
        const query = { url: '/test.png', w: 8, q: 70 }
        const opts = { headers: { accept: 'image/webp' } }
        const res = await next.fetch(
          `/_next/image?${toQueryString(query)}`,
          opts
        )
        expect(res.status).toBe(200)
        await expectWidth(res, 320)
      })
    }
  )
})
