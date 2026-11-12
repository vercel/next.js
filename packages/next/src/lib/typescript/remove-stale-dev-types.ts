import { existsSync } from 'fs'
import { rm } from 'fs/promises'
import path from 'path'

import * as Log from '../../build/output/log'

/**
 * Optimistically removes the types managed by `next dev`
 * (`{distDirRoot}/dev/types`), unless we can tell that a `next dev` session is
 * running.
 *
 * We do this because tsconfig includes both sets of types, and without
 * `next dev` running its types become stale. The types of `next build` and
 * `next dev` merge, so just deleting the dev types works.
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

  let lockfile
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
      }. This may lead to unexpected type checking errors.`
    )
  } finally {
    await lockfile?.unlock()
  }
}
