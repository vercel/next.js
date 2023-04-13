// sync injects a hook for webpack and webpack/... requires to use the internal ncc webpack version
// this is in order for userland plugins to attach to the same webpack instance as next.js
// the individual compiled modules are as defined for the compilation in bundles/webpack/packages/*

// This module will only be loaded once per process.

const mod = require('module')
const resolveFilename = mod._resolveFilename
const hookPropertyMap = new Map()

let overridedReact = false

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

// Add default aliases
addHookAliases([
  // Use `require.resolve` explicitly to make them statically analyzable
  // styled-jsx needs to be resolved as the external dependency.
  ['styled-jsx', require.resolve('styled-jsx')],
  ['styled-jsx/style', require.resolve('styled-jsx/style')],
  ['styled-jsx/style', require.resolve('styled-jsx/style')],
  ['server-only', require.resolve('next/dist/compiled/server-only')],
  ['client-only', require.resolve('next/dist/compiled/client-only')],
])

// Override built-in React packages if necessary
function overrideReact() {
  if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT) {
    overridedReact = true

    const channelSuffix =
      process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === 'experimental'
        ? '-experimental'
        : ''

    addHookAliases([
      ['react', require.resolve(`next/dist/compiled/react${channelSuffix}`)],
      [
        'react/jsx-runtime',
        require.resolve(`next/dist/compiled/react${channelSuffix}/jsx-runtime`),
      ],
      [
        'react/jsx-dev-runtime',
        require.resolve(
          `next/dist/compiled/react${channelSuffix}/jsx-dev-runtime`
        ),
      ],
      [
        'react-dom',
        require.resolve(
          `next/dist/compiled/react-dom${channelSuffix}/server-rendering-stub`
        ),
      ],
      [
        'react-dom/client',
        require.resolve(`next/dist/compiled/react-dom${channelSuffix}/client`),
      ],
      [
        'react-dom/server',
        require.resolve(`next/dist/compiled/react-dom${channelSuffix}/server`),
      ],
      [
        'react-dom/server.browser',
        require.resolve(
          `next/dist/compiled/react-dom${channelSuffix}/server.browser`
        ),
      ],
    ])
  } else {
    addHookAliases([
      ['react/jsx-runtime', require.resolve(`react/jsx-runtime`)],
      ['react/jsx-dev-runtime', require.resolve(`react/jsx-dev-runtime`)],
    ])
  }
}
overrideReact()

mod._resolveFilename = function (
  originalResolveFilename: typeof resolveFilename,
  requestMap: Map<string, string>,
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT && !overridedReact) {
    // In case the environment variable is set after the module is loaded.
    overrideReact()
  }

  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved
  return originalResolveFilename.call(mod, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)
