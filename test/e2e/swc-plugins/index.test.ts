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

      // TODO update messages
      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Module not found: Can't resolve 'next/dist/esm/build/templates/helpers'",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "<FIXME-nextjs-internal-source>
         Module not found: Can't resolve 'next/dist/esm/build/templates/helpers'
         failed to analyze ecmascript module '[project]/node_modules/.pnpm/next@file+..+next-repo-2bf56e024dbccc85257a8c308492f2375d690b206153b02d3bea2029707d4c38+packa_tacnzof7rtmb5bwqa7bdnfcdbq/node_modules/next/dist/esm/build/templates/helpers.js [ssr] (ecmascript)'
         Caused by:
         - failed to parse [project]/node_modules/.pnpm/next@file+..+next-repo-2bf56e024dbccc85257a8c308492f2375d690b206153b02d3bea2029707d4c38+packa_tacnzof7rtmb5bwqa7bdnfcdbq/node_modules/next/dist/esm/build/templates/helpers.js
         - Transforming and/or parsing of [project]/node_modules/.pnpm/next@file+..+next-repo-2bf56e024dbccc85257a8c308492f2375d690b206153b02d3bea2029707d4c38+packa_tacnzof7rtmb5bwqa7bdnfcdbq/node_modules/next/dist/esm/build/templates/helpers.js failed
         - failed to deserialize \`swc_common::plugin::diagnostics::PluginCorePkgDiagnostics\`
         - Mismatch { name: "array", found: 48 }
         Debug info:
         - Execution of <ModuleAssetContext as AssetContext>::process_resolve_result failed
         - Execution of <ModuleAssetContext as AssetContext>::process failed
         - Execution of *EcmascriptExports::split_locals_and_reexports failed
         - Execution of <EcmascriptModuleAsset as EcmascriptChunkPlaceable>::get_exports failed
         - Execution of analyze_ecmascript_module failed
         - failed to analyze ecmascript module '[project]/node_modules/.pnpm/next@file+..+next-repo-2bf56e024dbccc85257a8c308492f2375d690b206153b02d3bea2029707d4c38+packa_tacnzof7rtmb5bwqa7bdnfcdbq/node_modules/next/dist/esm/build/templates/helpers.js [ssr] (ecmascript)'
         - Execution of <EcmascriptModuleAsset as EcmascriptParsable>::failsafe_parse failed
         - Execution of parse failed
         - failed to parse [project]/node_modules/.pnpm/next@file+..+next-repo-2bf56e024dbccc85257a8c308492f2375d690b206153b02d3bea2029707d4c38+packa_tacnzof7rtmb5bwqa7bdnfcdbq/node_modules/next/dist/esm/build/templates/helpers.js
         - Transforming and/or parsing of [project]/node_modules/.pnpm/next@file+..+next-repo-2bf56e024dbccc85257a8c308492f2375d690b206153b02d3bea2029707d4c38+packa_tacnzof7rtmb5bwqa7bdnfcdbq/node_modules/next/dist/esm/build/templates/helpers.js failed
         - failed to deserialize \`swc_common::plugin::diagnostics::PluginCorePkgDiagnostics\`
         - Mismatch { name: "array", found: 48 }
         Import map: aliased to module 'next' with subpath '/dist/esm/build/templates/helpers' inside of [project]/
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
