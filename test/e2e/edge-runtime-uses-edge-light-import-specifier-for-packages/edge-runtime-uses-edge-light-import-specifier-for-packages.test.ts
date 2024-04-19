import { createNextDescribe } from 'e2e-utils'
import { shouldRunTurboDevTest } from '../../lib/next-test-utils'

createNextDescribe(
  'edge-runtime uses edge-light import specifier for packages',
  {
    files: __dirname,
    packageJson: {
      scripts: {
        build: 'next build',
        dev: `next ${shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'}`,
        start: 'next start',
      },
    },
    installCommand: 'pnpm i',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    buildCommand: 'pnpm build',
    skipDeployment: true,
  },
  ({ next }) => {
    // In case you need to test the response object
    it('pages/api endpoints import the correct module', async () => {
      const res = await next.fetch('/api/edge')
      const html = await res.json()
      expect(html).toEqual({
        // edge-light is only supported in `exports` and `imports` but webpack also adds the top level `edge-light` key incorrectly.
        edgeLightPackage: process.env.TURBOPACK ? 'import' : 'edge-light',
        edgeLightPackageExports: 'edge-light',
      })
    })

    it('pages import the correct module', async () => {
      const $ = await next.render$('/')
      const text = JSON.parse($('pre#result').text())
      expect(text).toEqual({
        // edge-light is only supported in `exports` and `imports` but webpack also adds the top level `edge-light` key incorrectly.
        edgeLightPackage: process.env.TURBOPACK ? 'import' : 'edge-light',
        edgeLightPackageExports: 'edge-light',
      })
    })

    it('app-dir imports the correct module', async () => {
      const $ = await next.render$('/app-dir')
      const text = JSON.parse($('pre#result').text())
      expect(text).toEqual({
        // edge-light is only supported in `exports` and `imports` but webpack also adds the top level `edge-light` key incorrectly.
        edgeLightPackage: process.env.TURBOPACK ? 'import' : 'edge-light',
        edgeLightPackageExports: 'edge-light',
      })
    })
  }
)
