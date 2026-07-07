import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/**
 * Name of the directory at the project root where profiling output (CPU
 * profiles and Turbopack traces) is written when profiling is enabled (see the
 * `--experimental-cpu-prof` and `--internal-trace` CLI flags). It is a
 * fixed-name sibling of `distDir`, not configurable.
 *
 * Keep this in sync with `DIST_PROFILES_DIR_NAME` in
 * `crates/next-core/src/next_config.rs`.
 */
export const PROFILES_DIR_NAME = '.next-profiles'

const GITIGNORE_CONTENTS = `# Created automatically by Next.js. Profiling output should not be committed.
*
`

/**
 * Create the `.next-profiles` directory under `dir` and return its absolute
 * path. This is the single place that creates the directory — the Rust trace
 * writer relies on it already existing.
 *
 * Also writes a `.gitignore` containing `*` (if one isn't already there) so the
 * potentially large profiling output is excluded from git and gitignore-aware
 * tools (Tailwind, Turborepo, ...) skip the subtree instead of reading it and
 * hanging/OOMing.
 */
export function ensureProfilesDir(dir: string): string {
  const profilesDir = join(dir, PROFILES_DIR_NAME)
  mkdirSync(profilesDir, { recursive: true })
  const gitignorePath = join(profilesDir, '.gitignore')
  if (!existsSync(gitignorePath)) {
    try {
      writeFileSync(gitignorePath, GITIGNORE_CONTENTS)
    } catch {
      // A missing .gitignore must not abort a profiling run.
    }
  }
  return profilesDir
}
