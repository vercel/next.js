import * as React from 'next/dist/compiled/react'
import * as ReactDOM from 'next/dist/compiled/react-dom'
import * as ReactJsxDevRuntime from 'next/dist/compiled/react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'next/dist/compiled/react/jsx-runtime'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg:
    | 'next/dist/compiled/react-server-dom-turbopack/server.edge'
    | 'next/dist/compiled/react-server-dom-turbopack/server.node'
    | 'next/dist/compiled/react-server-dom-webpack/server.edge'
    | 'next/dist/compiled/react-server-dom-webpack/server.node'
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
  ReactServerDOMTurbopackServerEdge = require('next/dist/compiled/react-server-dom-turbopack/server.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServerEdge = getAltProxyForBindingsDEV(
      'Turbopack',
      'next/dist/compiled/react-server-dom-turbopack/server.edge'
    )
  }
  ReactServerDOMTurbopackServerNode = require('next/dist/compiled/react-server-dom-turbopack/server.node')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServerNode = getAltProxyForBindingsDEV(
      'Turbopack',
      'next/dist/compiled/react-server-dom-turbopack/server.node'
    )
  }
} else {
  ReactServerDOMWebpackServerEdge = require('next/dist/compiled/react-server-dom-webpack/server.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServerEdge = getAltProxyForBindingsDEV(
      'Webpack',
      'next/dist/compiled/react-server-dom-webpack/server.edge'
    )
  }
  ReactServerDOMWebpackServerNode = require('next/dist/compiled/react-server-dom-webpack/server.node')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServerNode = getAltProxyForBindingsDEV(
      'Webpack',
      'next/dist/compiled/react-server-dom-webpack/server.node'
    )
  }
}

if (ReactDOM.version === undefined) {
  // FIXME: ReactDOM's 'react-server' entrypoint is missing `.version`,
  // which makes our tests fail when it's used, so this is an ugly workaround
  // (but should be safe because these are always kept in sync anyway)
  // @ts-expect-error
  ReactDOM.version = React.version
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
