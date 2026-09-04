import { nextTestSetup } from 'e2e-utils'

describe('swcPlugins', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely expects a local build failure instead of a successful deployment.
  // @force-gate !deploy
  describe('supports swcPlugins', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@swc/plugin-react-remove-properties': '13.0.0',
      },
    })

    it('basic case', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello World')
      expect(html).not.toContain('data-custom-attribute')
    })
  })
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely expects a local build failure instead of a successful deployment.
  // @force-gate !deploy
  // @force-gate dev
  describe('incompatible plugin version', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@swc/plugin-react-remove-properties': '7.0.2',
      },
    })

    it('shows a redbox in dev', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Failed to execute SWC plugin",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/layout.js
         Error: Failed to execute SWC plugin
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
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely expects a local build failure instead of a successful deployment.
  // @force-gate !deploy
  // @force-gate dev
  describe('invalid plugin name', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
module.exports = {
  experimental: {
    swcPlugins: [['@swc/plugin-nonexistent', {}]],
  },
}`,
      },
    })

    it('shows a redbox in dev', async () => {
      const browser = await next.browser('/')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Module not found: Can't resolve '@swc/plugin-nonexistent'",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./
         Error: Module not found: Can't resolve '@swc/plugin-nonexistent'
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
