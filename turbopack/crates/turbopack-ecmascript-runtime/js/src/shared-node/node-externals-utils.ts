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

/**
 * Translates an absolute path back to the `/ROOT/<path>` form the bundler uses for project
 * paths. `root` is the path of the root (see `resolveAbsolutePath`) in that form, without the
 * `/ROOT/` prefix.
 *
 * Requests with a dynamic part that are built from `__dirname` or `__filename` (e.g.
 * `path.join(__dirname, name)`) are absolute paths at runtime, while the keys of their module
 * context are in the `/ROOT/<path>` form. Other requests are returned unchanged.
 */
function toProjectPath(request: string, root: string): string {
  if (
    typeof request !== 'string' ||
    request.startsWith('/ROOT/') ||
    !path.isAbsolute(request)
  ) {
    return request
  }
  const relativePath = path.relative(ABSOLUTE_ROOT, request)
  if (path.isAbsolute(relativePath)) {
    // e.g. on another drive on Windows
    return request
  }
  const projectPath = path.posix.join(
    root,
    relativePath.split(path.sep).join('/')
  )
  if (projectPath === '..' || projectPath.startsWith('../')) {
    // outside of the project
    return request
  }
  return `/ROOT/${projectPath}`
}
Context.prototype.p = toProjectPath

/**
 * Returns an absolute `file://` URL for the given module path, which is
 * relative to the project root or the named `root`.
 *
 * Uses `url.pathToFileURL` so that the resulting URL is a valid file URI on
 * all platforms (forward slashes on Windows, drive letters handled
 * correctly, path segments URL-encoded).
 *
 * The location of a named `root` isn't known at runtime (the output may have
 * been moved away from the sources), so this returns a placeholder URL for it.
 */
function resolveFileUrl(modulePath: string, root?: string): string {
  if (root !== undefined) {
    return placeholderFileUrl(modulePath, root)
  }
  return require('url').pathToFileURL(resolveAbsolutePath(modulePath)).href
}
Context.prototype.F = resolveFileUrl
