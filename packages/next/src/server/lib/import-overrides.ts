import { dirname } from 'path'

export const hookPropertyMap = new Map()

// these must use require.resolve to be statically analyzable
export const defaultOverrides = {
  'styled-jsx': dirname(require.resolve('styled-jsx/package.json')),
  'styled-jsx/style': require.resolve('styled-jsx/style'),
}

export const baseOverrides = {
  react: 'next/dist/compiled/react',
  'react/package.json': 'next/dist/compiled/react/package.json',
  'react/jsx-runtime': 'next/dist/compiled/react/jsx-runtime',
  'react/jsx-dev-runtime': 'next/dist/compiled/react/jsx-dev-runtime',
  'react-dom': 'next/dist/compiled/react-dom/server-rendering-stub',
  'react-dom/package.json': 'next/dist/compiled/react-dom/package.json',
  'react-dom/client': 'next/dist/compiled/react-dom/client',
  'react-dom/server': 'next/dist/compiled/react-dom/server',
  'react-dom/server.browser': 'next/dist/compiled/react-dom/server.browser',
  'react-dom/server.edge': 'next/dist/compiled/react-dom/server.edge',
  'react-server-dom-webpack/client':
    'next/dist/compiled/react-server-dom-webpack/client',
  'react-server-dom-webpack/client.edge':
    'next/dist/compiled/react-server-dom-webpack/client.edge',
  'react-server-dom-webpack/server.edge':
    'next/dist/compiled/react-server-dom-webpack/server.edge',
  'react-server-dom-webpack/server.node':
    'next/dist/compiled/react-server-dom-webpack/server.node',
}

export const experimentalOverrides = {
  react: 'next/dist/compiled/react-experimental',
  'react/jsx-runtime': 'next/dist/compiled/react-experimental/jsx-runtime',
  'react/jsx-dev-runtime':
    'next/dist/compiled/react-experimental/jsx-dev-runtime',
  'react-dom':
    'next/dist/compiled/react-dom-experimental/server-rendering-stub',
  'react/package.json': 'next/dist/compiled/react-experimental/package.json',
  'react-dom/package.json':
    'next/dist/compiled/react-dom-experimental/package.json',
  'react-dom/client': 'next/dist/compiled/react-dom-experimental/client',
  'react-dom/server': 'next/dist/compiled/react-dom-experimental/server',
  'react-dom/server.browser':
    'next/dist/compiled/react-dom-experimental/server.browser',
  'react-dom/server.edge':
    'next/dist/compiled/react-dom-experimental/server.edge',
  'react-server-dom-webpack/client':
    'next/dist/compiled/react-server-dom-webpack-experimental/client',
  'react-server-dom-webpack/client.edge':
    'next/dist/compiled/react-server-dom-webpack-experimental/client.edge',
  'react-server-dom-webpack/server.edge':
    'next/dist/compiled/react-server-dom-webpack-experimental/server.edge',
  'react-server-dom-webpack/server.node':
    'next/dist/compiled/react-server-dom-webpack-experimental/server.node',
}

let aliasedPrebundledReact = false

const resolve = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.resolve
  : require.resolve

const toResolveMap = (map: Record<string, string>): [string, string][] =>
  Object.entries(map).map(([key, value]) => [key, resolve(value)])

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

// Add default aliases
addHookAliases(toResolveMap(defaultOverrides))

// Override built-in React packages if necessary
export function overrideReact() {
  if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT && !aliasedPrebundledReact) {
    aliasedPrebundledReact = true
    console.log('aliased react to', process.env.__NEXT_PRIVATE_PREBUNDLED_REACT)

    // Require these modules with static paths to make sure they are tracked by
    // NFT when building the app in standalone mode, as we are now conditionally
    // aliasing them it's tricky to track them in build time.
    if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === 'experimental') {
      addHookAliases(toResolveMap(experimentalOverrides))
    } else {
      addHookAliases(toResolveMap(baseOverrides))
    }
  }
}
overrideReact()
