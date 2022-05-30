import { createNext } from 'e2e-utils'
import { check, renderViaHTTP } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('watch-config-file', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        'next.config.js': `
          const nextConfig = {
            reactStrictMode: true,
          }
        
          module.exports = nextConfig        
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should restart the server on config change', async () => {
    const html = await renderViaHTTP(next.url, '/rewrite')
    expect(html).toContain('This page could not be found')

    await next.patchFile(
      'next.config.js',
      `
      const nextConfig = {
        reactStrictMode: true,
        async rewrites() {
          return [
            {
              source: '/rewrite',
              destination: '/',
            },
          ]
        },
      }
      module.exports = nextConfig`
    )

    await check(
      () => next.cliOutput,
      /Found a change in next.config.js. Restarting the server./
    )

    await check(() => renderViaHTTP(next.url, '/rewrite'), /hello world/)
  })
})
