import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('i18n-static-files rewrites', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() {
            return null
          }
        `,
        'public/file.txt': 'hello from file.txt',
      },
      dependencies: {},
      nextConfig: {
        i18n: {
          locales: ['en', 'sv'],
          defaultLocale: 'en',
        },
        async rewrites() {
          return {
            beforeFiles: [
              {
                source: '/file',
                destination: '/file.txt',
              },
              {
                source: '/path-matching/:path',
                destination: '/:path',
              },
              {
                source: '/wildcard-path-matching/:path*',
                destination: '/:path*',
              },
            ],
          }
        },
      },
    })
  })
  afterAll(() => next.destroy())

  test.each`
    path                                  | locale
    ${'/file'}                            | ${''}
    ${'/file'}                            | ${'/en'}
    ${'/file'}                            | ${'/sv'}
    ${'/path-matching/file.txt'}          | ${''}
    ${'/path-matching/file.txt'}          | ${'/en'}
    ${'/path-matching/file.txt'}          | ${'/sv'}
    ${'/wildcard-path-matching/file.txt'} | ${''}
    ${'/wildcard-path-matching/file.txt'} | ${'/en'}
    ${'/wildcard-path-matching/file.txt'} | ${'/sv'}
  `(
    'should rewrite "$path" to static file, locale: "$locale"',
    async ({ path, locale }) => {
      const res = await renderViaHTTP(next.url, `${locale}${path}`)
      expect(res).toContain('hello from file.txt')
    }
  )
})
