import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'

import * as Log from '../../build/output/log'

/**
 * Removes the route types a previous `next dev` session wrote to
 * `{distDirRoot}/dev/types`.
 *
 * tsconfig includes both `{distDirRoot}/types` and `{distDirRoot}/dev/types` to avoid
 * config churn between dev and build. Once `next dev` has stopped, its types are
 * no longer updated, so after a route is moved or deleted they reference files
 * that no longer exist and fail type checking (e.g. a `tsc` run after
 * `next typegen`, or the TypeScript CLI type check of `next build`). `next dev`
 * regenerates them on startup, so removing them loses nothing.
 *
 * The types of a running `next dev` server are kept up to date by that server,
 * so they are left in place. Running servers are detected through the dev
 * lockfile (`experimental.lockDistDir`). The lock is held while removing the
 * types, so a `next dev` starting concurrently waits instead of writing types
 * that are then removed. Without a lockfile (`lockDistDir` disabled, or WASM
 * bindings, which can't lock) a running server can't be detected and the types
 * are removed regardless; that server writes them again on the next change.
 *
 * Must be called after the SWC bindings are loaded.
 */
export async function removeStaleDevTypes({
  distDirRoot,
  lockDistDir,
}: {
  /** The absolute configured `distDir`, before `next dev` appends `dev`. */
  distDirRoot: string
  lockDistDir: boolean
}): Promise<void> {
  const devDistDir = path.join(distDirRoot, 'dev')
  const devTypesDir = path.join(devDistDir, 'types')
  if (!existsSync(devTypesDir)) {
    return
  }

  let lockfile: import('../../build/lockfile').Lockfile | undefined
  try {
    if (lockDistDir) {
      // Lazily required: the lockfile loads the SWC bindings module.
      const { Lockfile } =
        require('../../build/lockfile') as typeof import('../../build/lockfile')
      // Uses the same lockfile as `next dev` (see `setup-dev-bundler.ts`).
      lockfile = Lockfile.tryAcquire(path.join(devDistDir, 'lock'), true)
      if (lockfile === undefined) {
        // A running `next dev` server owns these types.
        return
      }
    }

    await rm(devTypesDir, { recursive: true, force: true })
  } catch (err) {
    // Stale dev types only affect type checking, so failing to remove them must
    // not fail the command.
    Log.warn(
      `Failed to remove stale development types in ${devTypesDir}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  } finally {
    await lockfile?.unlock().catch(() => {
      // The operating system releases the lock when the process exits.
    })
  }
}
