import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

// Tests Babel, not needed for Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'swc warnings by default',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
          '.babelrc': `
          {
            "presets": ["next/babel"]
          }
        `,
        },
        dependencies: {},
      })
    })
    afterAll(() => next.destroy())

    it('should have warning', async () => {
      await renderViaHTTP(next.url, '/')
      expect(next.cliOutput).toContain(
        'Disabled SWC as replacement for Babel because of custom Babel configuration'
      )
    })
  }
)

describe('can force swc', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      nextConfig: {
        experimental: {
          forceSwcTransforms: true,
        },
      },
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
        '.babelrc': `
          {
            "presets": ["next/babel"]
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should not have warning', async () => {
    await renderViaHTTP(next.url, '/')
    expect(next.cliOutput).not.toContain(
      'Disabled SWC as replacement for Babel because of custom Babel configuration'
    )
  })
})
