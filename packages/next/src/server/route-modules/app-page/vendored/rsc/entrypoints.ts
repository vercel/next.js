import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactCompilerRuntime from 'react/compiler-runtime'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg:
    | 'react-server-dom-turbopack/server.edge'
    | 'react-server-dom-turbopack/server.node'
    | 'react-server-dom-turbopack/static.edge'
    | 'react-server-dom-webpack/server.edge'
    | 'react-server-dom-webpack/server.node'
    | 'react-server-dom-webpack/static.edge'
) {
  if (process.env.NODE_ENV === 'development') {
    const altType = type === 'Turbopack' ? 'Webpack' : 'Turbopack'
    const altPkg = pkg.replace(new RegExp(type, 'gi'), altType.toLowerCase())

    return new Proxy(
      {},
      {
        get(_, prop: string) {
          throw new Error(
            `Expected to use ${type} bindings (${pkg}) for React but the current process is referencing '${prop}' from the ${altType} bindings (${altPkg}). This is likely a bug in our integration of the Next.js server runtime.`
          )
        },
      }
    )
  }
}

let ReactServerDOMTurbopackServerEdge, ReactServerDOMWebpackServerEdge
let ReactServerDOMTurbopackServerNode, ReactServerDOMWebpackServerNode
let ReactServerDOMTurbopackStaticEdge, ReactServerDOMWebpackStaticEdge

if (process.env.TURBOPACK) {
  ReactServerDOMTurbopackServerEdge =
    // @ts-expect-error -- TODO: Add types
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-turbopack/server.edge') as typeof import('react-server-dom-turbopack/server.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServerEdge = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/server.edge'
    )
  }
  ReactServerDOMTurbopackServerNode =
    // @ts-expect-error -- TODO: Add types
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-turbopack/server.node') as typeof import('react-server-dom-turbopack/server.node')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServerNode = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/server.node'
    )
  }
  ReactServerDOMTurbopackStaticEdge =
    // @ts-expect-error -- TODO: Add types
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-turbopack/static.edge') as typeof import('react-server-dom-turbopack/static.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackStaticEdge = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/static.edge'
    )
  }
} else {
  ReactServerDOMWebpackServerEdge =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/server.edge') as typeof import('react-server-dom-webpack/server.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServerEdge = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/server.edge'
    )
  }
  ReactServerDOMWebpackServerNode =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/server.node') as typeof import('react-server-dom-webpack/server.node')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServerNode = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/server.node'
    )
  }
  ReactServerDOMWebpackStaticEdge =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/static.edge') as typeof import('react-server-dom-webpack/static.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackStaticEdge = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/static.edge'
    )
  }
}

export {
  React,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
  ReactCompilerRuntime,
  ReactDOM,
  ReactServerDOMWebpackServerEdge,
  ReactServerDOMTurbopackServerEdge,
  ReactServerDOMWebpackServerNode,
  ReactServerDOMTurbopackServerNode,
  ReactServerDOMWebpackStaticEdge,
  ReactServerDOMTurbopackStaticEdge,
}
