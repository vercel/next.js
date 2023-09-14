const { dirname } = require('path') as typeof import('path')

let resolve: typeof require.resolve = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.resolve
  : require.resolve

let nextPaths: undefined | { paths: string[] | undefined } = undefined

if (!process.env.NEXT_MINIMAL) {
  nextPaths = {
    paths: resolve.paths('next/package.json') || undefined,
  }
}
export const hookPropertyMap = new Map()

export const defaultOverrides = {
  'styled-jsx': process.env.NEXT_MINIMAL
    ? dirname(resolve('styled-jsx/package.json'))
    : dirname(resolve('styled-jsx/package.json', nextPaths)),
  'styled-jsx/style': process.env.NEXT_MINIMAL
    ? resolve('styled-jsx/style')
    : resolve('styled-jsx/style', nextPaths),
}

// export const baseOverrides = {
//   react: 'next/dist/compiled/react',
//   'react/package.json': 'next/dist/compiled/react/package.json',
//   'react/jsx-runtime': 'next/dist/compiled/react/jsx-runtime',
//   'react/jsx-dev-runtime': 'next/dist/compiled/react/jsx-dev-runtime',
//   'react-dom': 'next/dist/compiled/react-dom/server-rendering-stub',
//   'react-dom/package.json': 'next/dist/compiled/react-dom/package.json',
//   'react-dom/client': 'next/dist/compiled/react-dom/client',
//   'react-dom/server': 'next/dist/compiled/react-dom/server',
//   'react-dom/server.browser': 'next/dist/compiled/react-dom/server.browser',
//   'react-dom/server.edge': 'next/dist/compiled/react-dom/server.edge',
//   'react-server-dom-webpack/client':
//     'next/dist/compiled/react-server-dom-webpack/client',
//   'react-server-dom-webpack/client.edge':
//     'next/dist/compiled/react-server-dom-webpack/client.edge',
//   'react-server-dom-webpack/server.edge':
//     'next/dist/compiled/react-server-dom-webpack/server.edge',
//   'react-server-dom-webpack/server.node':
//     'next/dist/compiled/react-server-dom-webpack/server.node',
// }

// export const experimentalOverrides = {
//   react: 'next/dist/compiled/react-experimental',
//   'react/jsx-runtime': 'next/dist/compiled/react-experimental/jsx-runtime',
//   'react/jsx-dev-runtime':
//     'next/dist/compiled/react-experimental/jsx-dev-runtime',
//   'react-dom':
//     'next/dist/compiled/react-dom-experimental/server-rendering-stub',
//   'react/package.json': 'next/dist/compiled/react-experimental/package.json',
//   'react-dom/package.json':
//     'next/dist/compiled/react-dom-experimental/package.json',
//   'react-dom/client': 'next/dist/compiled/react-dom-experimental/client',
//   'react-dom/server': 'next/dist/compiled/react-dom-experimental/server',
//   'react-dom/server.browser':
//     'next/dist/compiled/react-dom-experimental/server.browser',
//   'react-dom/server.edge':
//     'next/dist/compiled/react-dom-experimental/server.edge',
//   'react-server-dom-webpack/client':
//     'next/dist/compiled/react-server-dom-webpack-experimental/client',
//   'react-server-dom-webpack/client.edge':
//     'next/dist/compiled/react-server-dom-webpack-experimental/client.edge',
//   'react-server-dom-webpack/server.edge':
//     'next/dist/compiled/react-server-dom-webpack-experimental/server.edge',
//   'react-server-dom-webpack/server.node':
//     'next/dist/compiled/react-server-dom-webpack-experimental/server.node',
// }

// let aliasedPrebundledReact = false

const toResolveMap = (map: Record<string, string>): [string, string][] =>
  Object.entries(map).map(([key, value]) => [key, resolve(value, nextPaths)])

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

addHookAliases(toResolveMap(defaultOverrides))

// // Override built-in React packages if necessary
// export function overrideReact() {
//   if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT && !aliasedPrebundledReact) {
//     aliasedPrebundledReact = true

//     // Require these modules with static paths to make sure they are tracked by
//     // NFT when building the app in standalone mode, as we are now conditionally
//     // aliasing them it's tricky to track them in build time.
//     if (process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === 'experimental') {
//       addHookAliases(toResolveMap(experimentalOverrides))
//     } else {
//       addHookAliases(toResolveMap(baseOverrides))
//     }
//   }
// }
// overrideReact()
