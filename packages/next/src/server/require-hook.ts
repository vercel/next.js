// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

import { RouteKind } from './future/route-kind'

const { dirname } = require('path')
const mod = require('module')
const resolveFilename = mod._resolveFilename
const hookPropertyMap = new Map()
const { nextRenderAsyncStorage } =
  require('./async-storage/next-render-async-storage') as typeof import('./async-storage/next-render-async-storage')

const resolve = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.resolve
  : require.resolve

export const defaultOverrides = {
  'styled-jsx': dirname(resolve('styled-jsx/package.json')),
  'styled-jsx/style': resolve('styled-jsx/style'),
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
} as Record<string, string>

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
} as Record<string, string>

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

mod._resolveFilename = function (
  originalResolveFilename: typeof resolveFilename,
  requestMap: Map<string, string>,
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  const { routeKind, experimentalReact } =
    nextRenderAsyncStorage.getStore?.() || {}

  let resolved = undefined as undefined | string

  if (routeKind === RouteKind.APP_PAGE) {
    resolved = experimentalReact
      ? experimentalOverrides[request]
      : baseOverrides[request]

    if (resolved) {
      resolved = resolve(resolved)
    }
  }

  resolved = resolved || requestMap.get(request)

  return originalResolveFilename.call(
    mod,
    resolved || request,
    parent,
    isMain,
    options
  )
  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)
