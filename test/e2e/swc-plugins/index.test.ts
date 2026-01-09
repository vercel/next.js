import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('swcPlugins', () => {
  describe('supports swcPlugins', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      dependencies: {
        '@swc/plugin-react-remove-properties': '11.1.0',
      },
    })
    if (skipped) return

    it('basic case', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello World')
      expect(html).not.toContain('data-custom-attribute')
    })
  })
  ;(isNextDev ? describe : describe.skip)('incompatible plugin version', () => {
    const { next, skipped, isTurbopack } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      dependencies: {
        '@swc/plugin-react-remove-properties': '7.0.2',
      },
    })
    if (skipped) return

    it('shows a redbox in dev', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Failed to execute SWC plugin",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/layout.js
         Failed to execute SWC plugin
         An unexpected error occurred when executing an SWC EcmaScript transform plugin.
         This might be due to a version mismatch between the plugin and Next.js. https://plugins.swc.rs/ can help you find the correct plugin version to use.
         Failed to execute @swc/plugin-react-remove-properties
         Caused by:
             0: failed to deserialize \`swc_common::plugin::diagnostics::PluginCorePkgDiagnostics\`
             1: Mismatch { name: "array", found: 48 }",
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

    // eslint-disable-next-line jest/no-identical-title
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
