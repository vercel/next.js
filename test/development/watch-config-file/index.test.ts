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
      skipStart: true,
    })
  })
  afterAll(() => next.destroy())

  it('should output config file change', async () => {
    // next dev test-dir
    await next.start(true)

    await next.patchFile(
      'next.config.js',
      `
      /** changed **/  
      const nextConfig = {
        reactStrictMode: true,
      }
      module.exports = nextConfig`
    )

    await check(
      () => next.cliOutput,
      /Found a change in next.config.js. Restart the server to see the changes in effect./
    )
  })
})
