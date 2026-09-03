// Helper for next-mdx-plugin-resolution.test.ts.
//
// Runs in a real Node process (not jest) so that Node's own module resolver is
// used. jest's resolver shims `require.resolve` and reports MODULE_NOT_FOUND
// instead of Node's ERR_PACKAGE_PATH_NOT_EXPORTED, which would mask the exact
// failure this fixture reproduces (https://github.com/vercel/next.js/issues/73757).
//
// Exercises the real mdx-js-loader against an import-only ESM package whose
// plugin is exposed as a named export, and prints a JSON result line.
const path = require('path')

const { importPluginForPath } = require(
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'next-mdx',
    'mdx-js-loader.js'
  )
)

const fixtureRoot = __dirname
const pluginEntry = path.join(
  fixtureRoot,
  'node_modules',
  'esm-only-plugin',
  'index.js'
)

// Stub for webpack's `this.getResolve(...)`: returns the ESM entry path,
// honouring the "import" condition like the real resolver does.
const resolve = async () => pluginEntry

;(async () => {
  const result = {
    withResolver: null,
    withResolverName: null,
    withoutResolverCode: null,
  }

  const plugin = await importPluginForPath(
    'esm-only-plugin',
    fixtureRoot,
    resolve
  )
  result.withResolver = typeof plugin
  result.withResolverName = typeof plugin === 'function' ? plugin.name : null

  try {
    await importPluginForPath('esm-only-plugin', fixtureRoot, undefined)
  } catch (err) {
    result.withoutResolverCode = err.code
  }

  process.stdout.write('RESULT:' + JSON.stringify(result))
})().catch((err) => {
  process.stdout.write('ERROR:' + (err && err.stack ? err.stack : String(err)))
  process.exit(1)
})
