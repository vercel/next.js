import * as React from 'next/dist/compiled/react'
import * as ReactDOM from 'next/dist/compiled/react-dom/server-rendering-stub'
import * as ReactJsxDevRuntime from 'next/dist/compiled/react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'next/dist/compiled/react/jsx-runtime'
import * as ReactDOMServerEdge from 'next/dist/compiled/react-dom/server.edge'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg:
    | 'next/dist/compiled/react-server-dom-turbopack/client.edge'
    | 'next/dist/compiled/react-server-dom-webpack/client.edge'
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

let ReactServerDOMTurbopackClientEdge, ReactServerDOMWebpackClientEdge
if (process.env.TURBOPACK) {
  ReactServerDOMTurbopackClientEdge = require('next/dist/compiled/react-server-dom-turbopack/client.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackClientEdge = getAltProxyForBindingsDEV(
      'Turbopack',
      'next/dist/compiled/react-server-dom-turbopack/client.edge'
    )
  }
} else {
  ReactServerDOMWebpackClientEdge = require('next/dist/compiled/react-server-dom-webpack/client.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackClientEdge = getAltProxyForBindingsDEV(
      'Webpack',
      'next/dist/compiled/react-server-dom-webpack/client.edge'
    )
  }
}

export {
  React,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
  ReactDOM,
  ReactDOMServerEdge,
  ReactServerDOMTurbopackClientEdge,
  ReactServerDOMWebpackClientEdge,
}
