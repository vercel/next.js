import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Disable fallback polyfills', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import { useEffect } from 'react'
          import crypto from 'crypto'

          export default function Page() {
            useEffect(() => {
              crypto;
            }, [])
            return <p>hello world</p>
          } 
        `,
      },
      dependencies: {},
    })
    await next.stop()
  })
  afterAll(() => next.destroy())

  it('Fallback polyfills added by default', async () => {
    const firstLoadJSSize = Number(
      next.cliOutput.match(/○ \/\s{38}(\d*) kB\s{10}(?<firstLoad>\d*) kB/)
        .groups.firstLoad
    )
    expect(firstLoadJSSize).not.toBeLessThan(200)
  })

  it('Build should fail, when fallback polyfilling is disabled', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: {
          fallbackNodePolyfills: false
        }
      }`
    )

    await expect(next.start()).rejects.toThrow(/next build failed/)
  })
})
