// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.
const path = require('path')
const mod = require('module')
const originalRequire = mod.prototype.require
const resolveFilename = mod._resolveFilename

const { hookPropertyMap } = require('./import-overrides')
const { PHASE_PRODUCTION_BUILD } = require('../shared/lib/constants')

mod._resolveFilename = function (
  originalResolveFilename,
  requestMap,
  request,
  parent,
  isMain,
  options
) {
  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved

  return originalResolveFilename.call(mod, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)

// This is a hack to make sure that if a user requires a Next.js module that wasn't bundled
// that needs to point to the rendering runtime version, it will point to the correct one.
// This can happen on `pages` when a user requires a dependency that uses next/image for example.
mod.prototype.require = function (request) {
  if (
    (process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD ||
      process.env.NEXT_IS_EXPORT_WORKER) &&
    request.endsWith('.shared-runtime')
  ) {
    return originalRequire.call(
      this,
      `next/dist/server/future/route-modules/pages/vendored/contexts/${path.basename(
        request,
        '.shared-runtime'
      )}`
    )
  }

  return originalRequire.call(this, request)
}
