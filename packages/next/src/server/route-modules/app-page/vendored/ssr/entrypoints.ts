import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactCompilerRuntime from 'react/compiler-runtime'

import * as ReactDOMServer from 'react-dom/server'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg: 'react-server-dom-turbopack/client' | 'react-server-dom-webpack/client'
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

let ReactServerDOMTurbopackClient, ReactServerDOMWebpackClient
if (process.env.TURBOPACK) {
  ReactServerDOMTurbopackClient =
    // @ts-expect-error -- TODO: Add types
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-turbopack/client') as typeof import('react-server-dom-turbopack/client')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackClient = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/client'
    )
  }
} else {
  ReactServerDOMWebpackClient =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/client') as typeof import('react-server-dom-webpack/client')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackClient = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/client'
    )
  }
}

export {
  React,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
  ReactCompilerRuntime,
  ReactDOM,
  ReactDOMServer,
  ReactServerDOMTurbopackClient,
  ReactServerDOMWebpackClient,
}
