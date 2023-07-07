// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.

const { dirname } = require('path')
const mod = require('module')
const resolveFilename = mod._resolveFilename
const hookPropertyMap = new Map()

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

// Add default aliases
addHookAliases([
  // Use `require.resolve` explicitly to make them statically analyzable
  // styled-jsx needs to be resolved as the external dependency.
  ['styled-jsx', dirname(require.resolve('styled-jsx/package.json'))],
  ['styled-jsx/style', require.resolve('styled-jsx/style')],
])

function mapReactRequest(request: string) {
  if (
    process.env.__NEXT_PRIVATE_PREBUNDLED_REACT &&
    /^(react|react-dom|react-server-dom-webpack)\/?/.test(request)
  ) {
    const [packageName] = request.split('/')
    let packagePath = request.slice(packageName.length) // eg: /server

    if (request === 'react-dom') {
      packagePath = '/server-rendering-stub'
    }

    const aliasedPackage =
      process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === 'experimental'
        ? `${packageName}-experimental`
        : packageName
    const mapped = `next/dist/compiled/${aliasedPackage}${packagePath}`

    // Cache the resolved request for future lookups
    hookPropertyMap.set(request, mapped)

    return mapped
  }
  return null
}

mod._resolveFilename = function (
  originalResolveFilename: typeof resolveFilename,
  requestMap: Map<string, string>,
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  const hookResolved = requestMap.get(request)

  if (hookResolved) request = hookResolved
  else {
    const mappedReactRequest = mapReactRequest(request)
    if (mappedReactRequest) request = mappedReactRequest
  }

  return originalResolveFilename.call(mod, request, parent, isMain, options)
  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)
