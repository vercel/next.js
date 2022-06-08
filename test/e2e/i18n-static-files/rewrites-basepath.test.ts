import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('i18n-static-files rewrites with basepath', () => {
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
        basePath: '/basepath',
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

              {
                source: '/en/file2',
                destination: '/file.txt',
                locale: false,
              },
              {
                source: '/sv/file2',
                destination: '/file.txt',
                locale: false,
              },
              {
                source: '/en/path-matching2/:path',
                destination: '/:path',
                locale: false,
              },
              {
                source: '/sv/path-matching2/:path',
                destination: '/:path',
                locale: false,
              },
              {
                source: '/en/wildcard-path-matching2/:path*',
                destination: '/en/:path*',
                locale: false,
              },
              {
                source: '/sv/wildcard-path-matching2/:path*',
                destination: '/sv/:path*',
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
    'should rewrite "$locale$path" to static file',
    async ({ path, locale }) => {
      const res = await renderViaHTTP(next.url, `/basepath${locale}${path}`)
      expect(res).toContain('hello from file.txt')
    }
  )

  test.each`
    path                                   | locale
    ${'/file2'}                            | ${''}
    ${'/file2'}                            | ${'/en'}
    ${'/file2'}                            | ${'/sv'}
    ${'/path-matching2/file.txt'}          | ${''}
    ${'/path-matching2/file.txt'}          | ${'/en'}
    ${'/path-matching2/file.txt'}          | ${'/sv'}
    ${'/wildcard-path-matching2/file.txt'} | ${''}
    ${'/wildcard-path-matching2/file.txt'} | ${'/en'}
    ${'/wildcard-path-matching2/file.txt'} | ${'/sv'}
  `(
    'should rewrite "$locale$path" to static file when rewrite locale is false',
    async ({ path, locale }) => {
      const res = await renderViaHTTP(next.url, `/basepath${locale}${path}`)
      expect(res).toContain('hello from file.txt')
    }
  )
})
