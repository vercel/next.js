// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.
const path = require('path')
const mod = require('module')
const originalRequire = mod.prototype.require
const resolveFilename = mod._resolveFilename

const { overrideReact, hookPropertyMap } = require('./import-overrides')

mod._resolveFilename = function (
  originalResolveFilename,
  requestMap,
  request,
  parent,
  isMain,
  options
) {
  // In case the environment variable is set after the module is loaded.
  overrideReact()

  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved

  return originalResolveFilename.call(mod, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)

// This is a hack to make sure that if a user requires a Next.js module that wasn't bundled
// that needs to point to the rendering runtime version, it will point to the correct one.
// This can happen on `pages` when a user requires a dependency that uses next/image for example.
// This is only needed in production as in development we fallback to the external version.
if (process.env.NODE_ENV !== 'development' && !process.env.TURBOPACK) {
  mod.prototype.require = function (request) {
    if (request.endsWith('.shared-runtime')) {
      const isAppRequire = process.env.__NEXT_PRIVATE_RUNTIME_TYPE === 'app'
      const currentRuntime = `${
        isAppRequire
          ? 'next/dist/compiled/next-server/app-page.runtime'
          : 'next/dist/compiled/next-server/pages.runtime'
      }.prod`
      const base = path.basename(request, '.shared-runtime')
      const camelized = base.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
      const instance = originalRequire.call(this, currentRuntime)
      return instance.default.sharedModules[camelized]
    }
    return originalRequire.call(this, request)
  }
}
