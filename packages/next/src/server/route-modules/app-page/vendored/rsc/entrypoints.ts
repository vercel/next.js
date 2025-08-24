import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactCompilerRuntime from 'react/compiler-runtime'

function getAltProxyForBindingsDEV(
  type: 'Turbopack' | 'Webpack',
  pkg:
    | 'react-server-dom-turbopack/server'
    | 'react-server-dom-turbopack/static'
    | 'react-server-dom-webpack/server'
    | 'react-server-dom-webpack/static'
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

let ReactServerDOMTurbopackServer, ReactServerDOMWebpackServer
let ReactServerDOMTurbopackStatic, ReactServerDOMWebpackStatic

if (process.env.TURBOPACK) {
  ReactServerDOMTurbopackServer =
    // @ts-expect-error -- TODO: Add types
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-turbopack/server') as typeof import('react-server-dom-turbopack/server')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackServer = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/server'
    )
  }
  ReactServerDOMTurbopackStatic =
    // @ts-expect-error -- TODO: Add types
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-turbopack/static') as typeof import('react-server-dom-turbopack/static')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMWebpackStatic = getAltProxyForBindingsDEV(
      'Turbopack',
      'react-server-dom-turbopack/static'
    )
  }
} else {
  ReactServerDOMWebpackServer =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/server') as typeof import('react-server-dom-webpack/server')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackServer = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/server'
    )
  }
  ReactServerDOMWebpackStatic =
    // eslint-disable-next-line import/no-extraneous-dependencies
    require('react-server-dom-webpack/static') as typeof import('react-server-dom-webpack/static')
  if (process.env.NODE_ENV === 'development') {
    ReactServerDOMTurbopackStatic = getAltProxyForBindingsDEV(
      'Webpack',
      'react-server-dom-webpack/static'
    )
  }
}

export {
  React,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
  ReactCompilerRuntime,
  ReactDOM,
  ReactServerDOMTurbopackServer,
  ReactServerDOMTurbopackStatic,
  ReactServerDOMWebpackServer,
  ReactServerDOMWebpackStatic,
}
