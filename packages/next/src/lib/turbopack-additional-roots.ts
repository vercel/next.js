import fs from 'fs'
import { updateInitialEnv } from '@next/env'
import type { ExperimentalConfig } from '../server/config-shared'

/**
 * Lets the Turbopack runtime resolve `import.meta.url` in modules from
 * `experimental.turbopackAdditionalRoots` to their source locations. Only call
 * this when running against the project's sources, not from relocated output
 * such as a standalone server, where the runtime falls back to placeholder URLs.
 */
export function setTurbopackAdditionalRootsEnv(
  additionalRoots: ExperimentalConfig['turbopackAdditionalRoots']
): void {
  const roots: Record<string, string> = {}
  for (const [key, root] of Object.entries(additionalRoots ?? {})) {
    try {
      // Matches `crates/next-api/src/additional_roots.rs`, which names each
      // root's filesystem `@${key}` and resolves relative paths from the
      // current working directory.
      roots[`@${key}`] = fs.realpathSync(root.path)
    } catch {
      // No modules can come from a root that doesn't exist.
    }
  }
  if (Object.keys(roots).length === 0) {
    return
  }

  // Child processes inherit this, and the OS limits the size of environment
  // variables. Windows is the most restrictive, at 32,767 characters per
  // variable. A handful of absolute paths is far below that, so we don't expect
  // to hit it.
  const value = JSON.stringify(roots)
  process.env.TURBOPACK_ADDITIONAL_ROOTS = value
  // Survive `process.env` being reset to its initial state, such as when `.env`
  // files are reloaded.
  updateInitialEnv({ TURBOPACK_ADDITIONAL_ROOTS: value })
}
