import { createNext } from 'e2e-utils'
import { check } from 'next-test-utils'
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

  it('should output config file change', async () => {
    let i = 1

    await next.patchFile(
      'next.config.js',
      `
          /** changed - ${i} **/  
          const nextConfig = {
            reactStrictMode: true,
            async redirects() {
                return [
                  {
                    source: '/about',
                    destination: '/',
                    permanent: true,
                  },
                ]
              },
          }
          module.exports = nextConfig`
    )

    await check(
      async () => next.cliOutput,
      /Found a change in next\.config\.js\. Restarting the server to apply changes\./
    )

    await check(() => next.fetch('/about').then((res) => res.status), 200)
  })
})
