import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('i18n-static-files', () => {
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
      },
    })
  })
  afterAll(() => next.destroy())

  test.each(['', '/en', '/sv'])(
    'should get static file, locale: %s',
    async (locale) => {
      const res = await renderViaHTTP(next.url, `${locale}/file.txt`)
      expect(res).toContain('hello from file.txt')
    }
  )
})
