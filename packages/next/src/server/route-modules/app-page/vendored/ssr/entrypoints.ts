import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactCompilerRuntime from 'react/compiler-runtime'

// eslint-disable-next-line import/no-extraneous-dependencies
import * as ReactDOMServerEdge from 'react-dom/server.edge'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg:
    | 'react-server-dom-turbopack/client.edge'
    | 'react-server-dom-webpack/client.edge'
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
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMTurbopackClientEdge = require('react-server-dom-turbopack/client.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackClientEdge = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/client.edge'
    )
  }
} else {
  // eslint-disable-next-line import/no-extraneous-dependencies
  ReactServerDOMWebpackClientEdge = require('react-server-dom-webpack/client.edge')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackClientEdge = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/client.edge'
    )
  }
}

export {
  React,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
  ReactCompilerRuntime,
  ReactDOM,
  ReactDOMServerEdge,
  ReactServerDOMTurbopackClientEdge,
  ReactServerDOMWebpackClientEdge,
}
