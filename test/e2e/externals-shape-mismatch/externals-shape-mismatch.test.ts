import { nextTestSetup } from 'e2e-utils'

// Regression test for a Turbopack server-externalization bug.
//
// `dual-pkg` is externalized via `serverExternalPackages` and has two shapes
// selected by its `exports` map:
//   - the modern ESM shape (`./modern/index.mjs`, reached via the `module`
//     condition) re-exports `useMessageFormatter` from a `./private/*` submodule.
//   - the old, flat CommonJS shape (`./flat.js`, the `main`/`default` entry) has
//     no `useMessageFormatter` export.
//
// Turbopack resolves the externalized import against the modern shape (it honors
// the `module` condition), so the build succeeds. At runtime Node.js loads the
// package via its own conditions (no `module`), landing on the flat shape, where
// `useMessageFormatter` is missing — rendering throws
// "useMessageFormatter is not a function".
//
// This mirrors the real-world failure where geist pulled in @react-aria/i18n: the
// bundler externalized against the modern module shape but the flat build was
// loaded on disk. This is specific to Turbopack's externalization.
;(!process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'externals-shape-mismatch',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: require('./package.json').dependencies,
    })

    it('externalizes the package shape that Node.js actually loads at runtime', async () => {
      const $ = await next.render$('/')
      expect($('#message').text()).toBe('message-from-modern-v2')
    })
  }
)
