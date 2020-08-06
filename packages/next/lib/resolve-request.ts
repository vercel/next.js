import resolve from 'next/dist/compiled/resolve/index.js'
import path from 'path'

export function resolveRequest(req: string, issuer: string): string {
  // The `resolve` package is prebuilt through ncc, which prevents
  // PnP from being able to inject itself into it. To circumvent
  // this, we simply use PnP directly when available.
  if (process.versions.pnp) {
    const { resolveRequest: pnpResolveRequest } = require(`pnpapi`)
    return pnpResolveRequest(req, issuer, { considerBuiltins: false })
  } else {
    const basedir =
      issuer.endsWith(path.posix.sep) || issuer.endsWith(path.win32.sep)
        ? issuer
        : path.dirname(issuer)
    return resolve.sync(req, { basedir })
  }
}
