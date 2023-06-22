// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.

const { dirname } = require('path')
const mod = require('module')
const resolveFilename = mod._resolveFilename
const hookPropertyMap = new Map()

let aliasedPrebundledReact = false

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
  ['zod', dirname(require.resolve('zod/package.json'))],
])

// Override built-in React packages if necessary
function overrideReact() {
  if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT) {
    aliasedPrebundledReact = true

    // Require these modules with static paths to make sure they are tracked by
    // NFT when building the app in standalone mode, as we are now conditionally
    // aliasing them it's tricky to track them in build time.
    if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === 'experimental') {
      addHookAliases([
        ['react', require.resolve(`next/dist/compiled/react-experimental`)],
        [
          'react/jsx-runtime',
          require.resolve(`next/dist/compiled/react-experimental/jsx-runtime`),
        ],
        [
          'react/jsx-dev-runtime',
          require.resolve(
            `next/dist/compiled/react-experimental/jsx-dev-runtime`
          ),
        ],
        [
          'react-dom',
          require.resolve(
            `next/dist/compiled/react-dom-experimental/server-rendering-stub`
          ),
        ],
        [
          'react/package.json',
          require.resolve(`next/dist/compiled/react-experimental/package.json`),
        ],
        [
          'react-dom/package.json',
          require.resolve(
            `next/dist/compiled/react-dom-experimental/package.json`
          ),
        ],
        [
          'react-dom/client',
          require.resolve(`next/dist/compiled/react-dom-experimental/client`),
        ],
        [
          'react-dom/server',
          require.resolve(`next/dist/compiled/react-dom-experimental/server`),
        ],
        [
          'react-dom/server.browser',
          require.resolve(
            `next/dist/compiled/react-dom-experimental/server.browser`
          ),
        ],
        [
          'react-dom/server.edge',
          require.resolve(
            `next/dist/compiled/react-dom-experimental/server.edge`
          ),
        ],
        [
          'react-server-dom-webpack/client',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack-experimental/client`
          ),
        ],
        [
          'react-server-dom-webpack/client.edge',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack-experimental/client.edge`
          ),
        ],
        [
          'react-server-dom-webpack/server.edge',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack-experimental/server.edge`
          ),
        ],
        [
          'react-server-dom-webpack/server.node',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack-experimental/server.node`
          ),
        ],
      ])
    } else {
      addHookAliases([
        ['react', require.resolve(`next/dist/compiled/react`)],
        [
          'react/package.json',
          require.resolve(`next/dist/compiled/react/package.json`),
        ],
        [
          'react/jsx-runtime',
          require.resolve(`next/dist/compiled/react/jsx-runtime`),
        ],
        [
          'react/jsx-dev-runtime',
          require.resolve(`next/dist/compiled/react/jsx-dev-runtime`),
        ],
        [
          'react-dom',
          require.resolve(`next/dist/compiled/react-dom/server-rendering-stub`),
        ],
        [
          'react-dom/package.json',
          require.resolve(`next/dist/compiled/react-dom/package.json`),
        ],
        [
          'react-dom/client',
          require.resolve(`next/dist/compiled/react-dom/client`),
        ],
        [
          'react-dom/server',
          require.resolve(`next/dist/compiled/react-dom/server`),
        ],
        [
          'react-dom/server.browser',
          require.resolve(`next/dist/compiled/react-dom/server.browser`),
        ],
        [
          'react-dom/server.edge',
          require.resolve(`next/dist/compiled/react-dom/server.edge`),
        ],
        [
          'react-server-dom-webpack/client',
          require.resolve(`next/dist/compiled/react-server-dom-webpack/client`),
        ],
        [
          'react-server-dom-webpack/client.edge',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack/client.edge`
          ),
        ],
        [
          'react-server-dom-webpack/server.edge',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack/server.edge`
          ),
        ],
        [
          'react-server-dom-webpack/server.node',
          require.resolve(
            `next/dist/compiled/react-server-dom-webpack/server.node`
          ),
        ],
      ])
    }
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
  if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT && !aliasedPrebundledReact) {
    // In case the environment variable is set after the module is loaded.
    overrideReact()
  }

  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved
  return originalResolveFilename.call(mod, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)
