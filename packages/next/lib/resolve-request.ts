import resolve from 'next/dist/compiled/resolve/index.js'
import path from 'path'

export function resolveRequest(req: string, issuer: string): string {
  // The `resolve` package is prebuilt through ncc, which prevents
  // PnP from being able to inject itself into it. To circumvent
  // this, we simply use PnP directly when available.
  if (process.versions.pnp) {
    const { resolveRequest: pnpResolveRequest } = require(`pnpapi`)
    return pnpResolveRequest(req, issuer, { considerBuiltins: false })
  } else if (process?.env?.npm_config_user_agent?.startsWith('pnpm/')) {
    // fixes webpack builds when using pnpm by switching to the default node resolution algorithm
    // see: preserveSymlinks
    // from : https://www.npmjs.com/package/resolve
    //  - Note: this property is currently true by default but it will be changed to false in the next major
    //           version because Node's resolution algorithm does not preserve symlinks by default.
    const basedir =
      issuer.endsWith(path.posix.sep) || issuer.endsWith(path.win32.sep)
        ? issuer
        : path.dirname(issuer)
    return resolve.sync(req, { basedir, preserveSymlinks: false })
  } else {
    const basedir =
      issuer.endsWith(path.posix.sep) || issuer.endsWith(path.win32.sep)
        ? issuer
        : path.dirname(issuer)
    return resolve.sync(req, { basedir })
  }
}
