import { createNext } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

describe('i18n API support', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/hello.js': `
          export default function handler(req, res) { 
            res.end('hello world')
          } 
        `,
        'pages/api/blog/[slug].js': `
          export default function handler(req, res) {
            res.end('blog/[slug]')
          }
        `,
      },
      nextConfig: {
        i18n: {
          locales: ['en', 'fr'],
          defaultLocale: 'en',
        },
        async rewrites() {
          return {
            beforeFiles: [],
            afterFiles: [],
            fallback: [
              {
                source: '/api/:path*',
                destination: 'https://example.vercel.sh/',
              },
            ],
          }
        },
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should respond to normal API request', async () => {
    const res = await fetchViaHTTP(next.url, '/api/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello world')
  })

  it('should respond to normal dynamic API request', async () => {
    const res = await fetchViaHTTP(next.url, '/api/blog/first')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('blog/[slug]')
  })

  // TODO: re-enable after this is fixed to match on Vercel
  if (!(global as any).isNextDeploy) {
    it('should fallback rewrite non-matching API request', async () => {
      const paths = [
        '/fr/api/hello',
        '/en/api/blog/first',
        '/en/api/non-existent',
        '/api/non-existent',
      ]

      for (const path of paths) {
        const res = await fetchViaHTTP(next.url, path)
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('Example Domain')
      }
    })
  }
})
