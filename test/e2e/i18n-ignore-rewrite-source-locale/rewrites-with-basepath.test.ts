import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'
import path from 'path'
import fs from 'fs-extra'

const locales = ['', '/en', '/sv', '/nl']

describe('i18n-ignore-rewrite-source-locale with basepath', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/hello.js': `
        export default function handler(req, res) {
          res.send('hello from api')
        }`,
        'public/file.txt': 'hello from file.txt',
      },
      dependencies: {},
      nextConfig: {
        basePath: '/basepath',
        i18n: {
          locales: ['en', 'sv', 'nl'],
          defaultLocale: 'en',
        },
        async rewrites() {
          return {
            beforeFiles: [
              {
                source: '/:locale/rewrite-files/:path*',
                destination: '/:path*',
                locale: false,
              },
              {
                source: '/:locale/rewrite-api/:path*',
                destination: '/api/:path*',
                locale: false,
              },
            ],
            afterFiles: [],
            fallback: [],
          }
        },
      },
    })
  })
  afterAll(() => next.destroy())

  test.each(locales)(
    'get public file by skipping locale in rewrite, locale: %s',
    async (locale) => {
      const res = await renderViaHTTP(
        next.url,
        `/basepath${locale}/rewrite-files/file.txt`
      )
      expect(res).toContain('hello from file.txt')
    }
  )

  test.each(locales)(
    'call api by skipping locale in rewrite, locale: %s',
    async (locale) => {
      const res = await renderViaHTTP(
        next.url,
        `/basepath${locale}/rewrite-api/hello`
      )
      expect(res).toContain('hello from api')
    }
  )

  // build artifacts aren't available on deploy
  if (!(global as any).isNextDeploy) {
    // chunks are not written to disk with TURBOPACK
    ;(process.env.TURBOPACK ? it.skip.each : it.each)(locales)(
      'get _next/static/ files by skipping locale in rewrite, locale: %s',
      async (locale) => {
        const chunks = (
          await fs.readdir(path.join(next.testDir, '.next', 'static', 'chunks'))
        ).filter((f) => f.endsWith('.js'))

        await Promise.all(
          chunks.map(async (file) => {
            const res = await fetchViaHTTP(
              next.url,
              `/basepath${locale}/rewrite-files/_next/static/chunks/${file}`
            )
            // eslint-disable-next-line jest/no-standalone-expect
            expect(res.status).toBe(200)
          })
        )
      }
    )
  }
})
