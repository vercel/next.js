// Next.js needs to use module.resolve to generate paths to modules it includes,
// but those paths need to be relative to something so that they're portable
// across directories and machines.
//
// This function returns paths relative to the top-level 'node_modules'
// directory found in the path. If none is found, returns the complete path.

import { sep } from 'path'

const RELATIVE_START = `node_modules${sep}`

// Pass in the module's `require` object since it's module-specific.
export default (moduleRequire) => (path) => {
  // package.json removed because babel-runtime is resolved as
  // "babel-runtime/package"
  const absolutePath = moduleRequire.resolve(path)
    .replace(/[\\/]package\.json$/, '')

  const relativeStartIndex = absolutePath.indexOf(RELATIVE_START)

  if (relativeStartIndex === -1) {
    return absolutePath
  }

  return absolutePath.substring(relativeStartIndex + RELATIVE_START.length)
}
