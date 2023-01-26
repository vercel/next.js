// sync injects a hook for webpack and webpack/... requires to use the internal ncc webpack version
// this is in order for userland plugins to attach to the same webpack instance as next.js
// the individual compiled modules are as defined for the compilation in bundles/webpack/packages/*

const hookPropertyMap = new Map()

let initialized = false
function setupResolve() {
  if (initialized) {
    return
  }
  initialized = true
  const mod = require('module')
  const resolveFilename = mod._resolveFilename
  mod._resolveFilename = function (
    request: string,
    parent: any,
    isMain: boolean,
    options: any
  ) {
    const hookResolved = hookPropertyMap.get(request)
    if (hookResolved) request = hookResolved
    return resolveFilename.call(mod, request, parent, isMain, options)
  }
}

export function setRequireOverrides(aliases: [string, string][]) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

export function loadRequireHook(aliases: [string, string][] = []) {
  const defaultAliases = [
    ...aliases,
    // Use `require.resolve` explicitly to make them statically analyzable
    // styled-jsx needs to be resolved as the external dependency.
    ['styled-jsx', require.resolve('styled-jsx')],
    ['styled-jsx/style', require.resolve('styled-jsx/style')],
    ['styled-jsx/style', require.resolve('styled-jsx/style')],
    ['server-only', require.resolve('next/dist/compiled/server-only')],
    ['client-only', require.resolve('next/dist/compiled/client-only')],
  ] as [string, string][]

  setRequireOverrides(defaultAliases)

  setupResolve()
}

export function overrideBuiltInReactPackages() {
  setRequireOverrides([
    ['react', require.resolve('next/dist/compiled/react')],
    [
      'react/jsx-runtime',
      require.resolve('next/dist/compiled/react/jsx-runtime'),
    ],
    [
      'react/jsx-dev-runtime',
      require.resolve('next/dist/compiled/react/jsx-dev-runtime'),
    ],
    [
      'react-dom',
      require.resolve('next/dist/compiled/react-dom/server-rendering-stub'),
    ],
    [
      'react-dom/client',
      require.resolve('next/dist/compiled/react-dom/client'),
    ],
    [
      'react-dom/server',
      require.resolve('next/dist/compiled/react-dom/server'),
    ],
    [
      'react-dom/server.browser',
      require.resolve('next/dist/compiled/react-dom/server.browser'),
    ],
  ])
}
