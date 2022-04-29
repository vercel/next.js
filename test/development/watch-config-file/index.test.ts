import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { waitFor } from 'next-test-utils'

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

    await waitFor(6000) // wait for cli output.

    expect(next.cliOutput).toContain(
      `Found a change in next.config.js. Restart the server to see the changes in effect.`
    )
  })
})
