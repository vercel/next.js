import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

// Tests Babel, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'swc warnings by default',
  () => {
    const { next } = nextTestSetup({
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

    it('should have warning', async () => {
      await renderViaHTTP(next.url, '/')
      expect(next.cliOutput).toContain(
        'Disabled SWC as replacement for Babel because of custom Babel configuration'
      )
    })
  }
)

// Tests Babel, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'can force swc',
  () => {
    const { next } = nextTestSetup({
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

    it('should not have warning', async () => {
      await renderViaHTTP(next.url, '/')
      expect(next.cliOutput).not.toContain(
        'Disabled SWC as replacement for Babel because of custom Babel configuration'
      )
    })
  }
)
