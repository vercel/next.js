import { nextTestSetup } from 'e2e-utils'

// Regression test for a Turbopack server-externalization bug.
//
// `button-pkg` is an ESM package that is externalized via `serverExternalPackages`.
// Because it is ESM, Turbopack loads it at runtime with `import()` (its
// `externalImport` helper), so Node's *strict* ESM resolver walks its transitive
// re-exports. `button-pkg` imports a named export from `i18n-pkg`, whose ESM entry
// (`index.mjs`) re-exports it from a relative CommonJS submodule:
//
//   export { useMessageFormatter } from './private/useMessageFormatter.js'
//
// That submodule defines the export via a Parcel-style
// `$parcel$export(module.exports, "useMessageFormatter", ...)` helper, which Node's
// CommonJS named-export detection (cjs-module-lexer) cannot statically see. So at
// runtime the external load fails with:
//
//   Failed to load external module button-pkg-<hash>: SyntaxError: The requested
//   module './private/useMessageFormatter.js' does not provide an export named
//   'useMessageFormatter'
//
// This mirrors the real-world failure where geist pulled in @react-aria/button,
// which imports @react-aria/i18n (a Parcel build with exactly this shape). A
// bundler that bundles the package (webpack) resolves the CJS re-export leniently
// and tolerates it; Turbopack's ESM externalization does not.
;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'externals-esm-cjs-reexport',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: require('./package.json').dependencies,
    })

    it('loads an ESM-externalized package that re-exports from a CommonJS submodule', async () => {
      const $ = await next.render$('/')
      expect($('#message').text()).toBe('message-from-i18n-pkg')
    })
  }
)
