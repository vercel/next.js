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

// Absolute paths of filesystems outside the project root, keyed by filesystem
// name and parsed on first use. The host sets `TURBOPACK_ADDITIONAL_ROOTS` to a
// JSON object of names to paths only when the sources are on disk, so that it
// isn't part of the build output.
let additionalRoots: Record<string, string | undefined> | undefined

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

/**
 * Returns an absolute `file://` URL for the given module path, which is
 * relative to the project root or the named `root`.
 *
 * Uses `url.pathToFileURL` so that the resulting URL is a valid file URI on
 * all platforms (forward slashes on Windows, drive letters handled
 * correctly, path segments URL-encoded).
 *
 * When the location of `root` is unknown (e.g. in a deployment, where the
 * sources don't exist), this returns a placeholder URL instead.
 */
function resolveFileUrl(modulePath?: string, root?: string): string {
  if (root === undefined) {
    return require('url').pathToFileURL(resolveAbsolutePath(modulePath)).href
  }
  additionalRoots ??= JSON.parse(
    process.env.TURBOPACK_ADDITIONAL_ROOTS ?? '{}'
  ) as Record<string, string | undefined>
  const rootPath = additionalRoots[root]
  if (rootPath === undefined) {
    return placeholderFileUrl(modulePath, root)
  }
  return require('url').pathToFileURL(path.join(rootPath, modulePath ?? ''))
    .href
}
Context.prototype.F = resolveFileUrl
