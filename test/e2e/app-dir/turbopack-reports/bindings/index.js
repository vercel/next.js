// A minimal stand-in for the `bindings` npm package, reproducing only the part
// both bundlers model: locate the calling package's root by walking up for a
// `package.json`, then load the compiled binary from `build/Release`.
//
// Neither bundler evaluates this file. `@vercel/nft` maps the `bindings`
// specifier to its own bundled copy, and Turbopack maps it to
// `WellKnownFunctionKind::NodeBindings`; both then resolve the binary's path
// themselves. `build/Release/<name>` is node-gyp's default output location and
// is on both of their candidate lists, so this agrees with what they trace.

const fs = require('fs')
const path = require('path')

function getCallerFile() {
  const { prepareStackTrace } = Error
  try {
    Error.prepareStackTrace = (_error, stack) => stack
    for (const frame of new Error().stack) {
      const fileName = frame.getFileName()
      if (typeof fileName === 'string' && fileName !== __filename) {
        return fileName
      }
    }
  } finally {
    Error.prepareStackTrace = prepareStackTrace
  }
  throw new Error('bindings: could not determine the calling file')
}

function getPackageRoot(file) {
  let dir = path.dirname(file)
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir)
    if (parent === dir) {
      throw new Error(`bindings: found no package.json above ${file}`)
    }
    dir = parent
  }
  return dir
}

module.exports = function bindings(name) {
  const binary = path.join(
    getPackageRoot(getCallerFile()),
    'build',
    'Release',
    name
  )

  if (!fs.existsSync(binary)) {
    throw new Error(
      `bindings: ${binary} does not exist. The fixture addon is compiled by ` +
        `node-gyp during install, which requires the package to be listed in ` +
        `the test's pnpm.onlyBuiltDependencies.`
    )
  }

  // Deliberately not wrapped. A non-context-aware addon fails on this line with
  // Node's own `ERR_DLOPEN_FAILED` / "Module did not self-register", and the
  // worker-thread tests assert on that message.
  return require(binary)
}
