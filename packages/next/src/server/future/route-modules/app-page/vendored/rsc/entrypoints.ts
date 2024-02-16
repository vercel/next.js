import * as React from 'react'
import * as ReactDOM from 'react-dom/server-rendering-stub'
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'react/jsx-runtime'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg:
    | 'react-server-dom-turbopack/server.edge'
    | 'react-server-dom-turbopack/server.node'
    | 'react-server-dom-webpack/server.edge'
    | 'react-server-dom-webpack/server.node'
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

if (process.env.TURBOPACK) {
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMTurbopackServerEdge = require('react-server-dom-turbopack/server.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServerEdge = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/server.edge'
    )
  }
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMTurbopackServerNode = require('react-server-dom-turbopack/server.node')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServerNode = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/server.node'
    )
  }
} else {
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMWebpackServerEdge = require('react-server-dom-webpack/server.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServerEdge = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/server.edge'
    )
  }
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMWebpackServerNode = require('react-server-dom-webpack/server.node')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServerNode = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/server.node'
    )
  }
}

export {
  React,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
  ReactDOM,
  ReactServerDOMWebpackServerEdge,
  ReactServerDOMTurbopackServerEdge,
  ReactServerDOMWebpackServerNode,
  ReactServerDOMTurbopackServerNode,
}
