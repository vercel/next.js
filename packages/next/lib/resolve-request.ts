import resolve from 'next/dist/compiled/resolve/index.js'
import path from 'path'

export interface ResolvedModule {
  /**
   * The first path on disk which the module resolves to, equivalent to running Node.js with
   * `--preserve-symlinks`.
   */
  originalPath: string
  /**
   * The resolved module on disk, after following symbolic links. This emulates Node.js's default
   * module resolution behavior.
   */
  resolvedPath: string
}

export function resolveRequest(req: string, issuer: string): ResolvedModule {
  // The `resolve` package is prebuilt through ncc, which prevents
  // PnP from being able to inject itself into it. To circumvent
  // this, we simply use PnP directly when available.
  if (process.versions.pnp) {
    const { resolveRequest: pnpResolveRequest } = require(`pnpapi`)
    const modulePath = pnpResolveRequest(req, issuer, {
      considerBuiltins: false,
    })
    return {
      originalPath: modulePath,
      resolvedPath: modulePath,
    }
  } else {
    const basedir =
      issuer.endsWith(path.posix.sep) || issuer.endsWith(path.win32.sep)
        ? issuer
        : path.dirname(issuer)

    const originalPath = resolve.sync(req, {
      basedir,
      preserveSymlinks: true,
    })
    const resolvedPath = resolve.sync(req, {
      basedir,
      // Node.js's built-in module resolution resolves symbolic links by default,
      // however the `resolve@1` package does not. By passing `preserveSymlinks: false`, we override
      // resolve@1's default of `true` so that Node.js's default behaviour is emulated.
      preserveSymlinks: false,
    })

    return {
      originalPath,
      resolvedPath,
    }
  }
}
