import resolve from 'next/dist/compiled/resolve/index.js'
import path from 'path'
const webpack5Experiential = parseInt(require('webpack').version) === 5

export function resolveRequest(req: string, issuer: string) {
  if (webpack5Experiential) {
    // pnpapi and resolution is part of Webpack 5, no need for custom functions
    const resolver = require('enhanced-resolve')
    // parameters are reversed.
    return resolver.sync(issuer, req)
  }

  // The `resolve` package is prebuilt through ncc, which prevents
  // PnP from being able to inject itself into it. To circumvent
  // this, we simply use PnP directly when available.
  if (process.versions.pnp) {
    const { resolveRequest } = require(`pnpapi`)
    return resolveRequest(req, issuer, { considerBuiltins: false })
  } else {
    const basedir =
      issuer.endsWith(path.posix.sep) || issuer.endsWith(path.win32.sep)
        ? issuer
        : path.dirname(issuer)
    return resolve.sync(req, { basedir })
  }
}
