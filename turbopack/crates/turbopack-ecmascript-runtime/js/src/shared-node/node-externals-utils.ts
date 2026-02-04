/* eslint-disable @typescript-eslint/no-unused-vars */

declare var RUNTIME_PUBLIC_PATH: string
declare var RELATIVE_ROOT_PATH: string
declare var ASSET_PREFIX: string

const path = require('path')

const relativePathToRuntimeRoot = path.relative(RUNTIME_PUBLIC_PATH, '.')
// Compute the relative path to the `distDir`.
const relativePathToDistRoot = path.join(
  relativePathToRuntimeRoot,
  RELATIVE_ROOT_PATH
)
const RUNTIME_ROOT = path.resolve(__filename, relativePathToRuntimeRoot)
// Compute the absolute path to the root, by stripping distDir from the absolute path to this file.
const ABSOLUTE_ROOT = path.resolve(__filename, relativePathToDistRoot)

/**
 * Returns an absolute path to the given module path.
 * Module path should be relative, either path to a file or a directory.
 *
 * This fn allows to calculate an absolute path for some global static values, such as
 * `__dirname` or `import.meta.url` that Turbopack will not embeds in compile time.
 * See ImportMetaBinding::code_generation for the usage.
 */
function resolveAbsolutePath(modulePath?: string): string {
  if (modulePath) {
    return path.join(ABSOLUTE_ROOT, modulePath)
  }
  return ABSOLUTE_ROOT
}
Context.prototype.P = resolveAbsolutePath
