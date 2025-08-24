import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('swcPlugins', () => {
  describe('supports swcPlugins', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      dependencies: {
        '@swc/plugin-react-remove-properties': '7.0.2',
      },
    })
    if (skipped) return

    it('basic case', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello World')
      expect(html).not.toContain('data-custom-attribute')
    })
  })
  ;(isNextDev ? describe : describe.skip)('invalid plugin name', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      overrideFiles: {
        'next.config.js': `
module.exports = {
  experimental: {
    swcPlugins: [['@swc/plugin-nonexistent', {}]],
  },
}`,
      },
    })
    if (skipped) return

    it('shows a redbox in dev', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Module not found: Can't resolve '@swc/plugin-nonexistent'",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./
         Module not found: Can't resolve '@swc/plugin-nonexistent'
         https://nextjs.org/docs/messages/module-not-found",
           "stack": [],
         }
        `)
      } else {
        // TODO missing proper error with Webpack
        await expect(browser).toDisplayRedbox(
          `"Expected Redbox but found no visible one."`
        )
      }
    })
  })
})
