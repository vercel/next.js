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

  it('Polyfills are added by default', async () => {
    const firstLoadJSSize = Number(
      next.cliOutput.match(/○ \/\s{38}(\d*) kB\s{10}(?<firstLoad>\d*) kB/)
        .groups.firstLoad
    )
    expect(firstLoadJSSize).not.toBeLessThan(200)
  })

  it('When Polyfilling is disabled, build should fail', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: {
          fallbackOldPolyfills: false
        }
      }`
    )

    await next.setup()
    expect(next.cliOutput).toContain("Module not found: Can't resolve 'crypto'")
  })
})
