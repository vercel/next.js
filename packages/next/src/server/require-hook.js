// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.
const mod = require('module')
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
  if (request === 'from-require' || request === 'from-import') {
    console.log('require-hook', request)
  }
  // In case the environment variable is set after the module is loaded.
  overrideReact()

  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved

  return originalResolveFilename.call(mod, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)
