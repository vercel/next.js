import { createNextDescribe } from 'e2e-utils'
import { shouldRunTurboDevTest } from '../../lib/next-test-utils'

createNextDescribe(
  'edge-runtime uses edge-light import specifier for packages',
  {
    files: __dirname,
    packageJson: {
      scripts: {
        setup: 'cp -r ./node_modules_bak/* ./node_modules',
        build: 'yarn setup && next build',
        dev: `yarn setup && next ${
          shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
        }`,
        start: 'next start',
      },
    },
    installCommand: 'yarn',
    startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
    buildCommand: 'yarn build',
    skipDeployment: true,
  },
  ({ next }) => {
    // In case you need to test the response object
    it('pages/api endpoints import the correct module', async () => {
      const res = await next.fetch('/api/edge')
      const html = await res.json()
      expect(html).toEqual({
        edgeLightPackage: 'edge-light',
        edgeLightPackageExports: 'edge-light',
      })
    })

    it('pages import the correct module', async () => {
      const $ = await next.render$('/')
      const text = JSON.parse($('pre#result').text())
      expect(text).toEqual({
        edgeLightPackage: 'edge-light',
        edgeLightPackageExports: 'edge-light',
      })
    })

    it('app-dir imports the correct module', async () => {
      const $ = await next.render$('/app-dir')
      const text = JSON.parse($('pre#result').text())
      expect(text).toEqual({
        edgeLightPackage: 'edge-light',
        edgeLightPackageExports: 'edge-light',
      })
    })
  }
)
