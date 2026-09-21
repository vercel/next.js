import * as fs from 'node:fs'
import * as path from 'node:path'
import isError from './is-error'
import { recursiveDeleteSyncWithAsyncRetries } from './recursive-delete'

/**
 * Terminology, because "project" is ambiguous in a monorepo and is avoided
 * throughout this file. For a Next.js app at `<repo>/web/site`:
 *
 * - **application directory** (`dir` elsewhere in the codebase): `<repo>/web/site`,
 *   the directory holding `next.config.js`. This is what `next build <path>`
 *   names, and what the docs usually mean by "project root".
 * - **workspace root** (`rootDir` / `repoRoot` elsewhere): `<repo>`, found by
 *   walking up to a workspace marker or lockfile, and overridable via
 *   `turbopack.root` / `outputFileTracingRoot`.
 *
 * `distDir` is resolved relative to the application directory, but may point
 * anywhere within the workspace — an Nx-style monorepo builds `apps/web` into
 * `../.next`.
 */

/**
 * A file Next.js writes into `distDir` to mark the directory as its own.
 *
 * Cleaning `distDir` is destructive and recursive, so before deleting we
 * require evidence that the directory is ours. This marker is that evidence:
 * a previous run created it, so the contents are build output rather than
 * something the user put there.
 */
export const DIST_DIR_MARKER = '.next-build-dir'

const DIST_DIR_MARKER_CONTENTS = `This directory is managed by Next.js.

Its contents are deleted on every build and dev session. Do not put anything
here that you want to keep, and do not point 'distDir' at a directory that
holds files of your own.

https://nextjs.org/docs/app/api-reference/config/next-config-js/distDir
`

/**
 * Entries that show a directory was created by a Next.js version predating
 * {@link DIST_DIR_MARKER}, so an existing `.next` is not rejected on upgrade.
 *
 * Every entry must be one only Next.js creates. Two names are deliberately
 * absent:
 *
 * - `package.json`: Next.js writes one into `distDir`, but so does every
 *   JavaScript project. Accepting it would let `distDir: '.'` delete an
 *   application's own source.
 * - `lock`: `experimental.lockDistDir` writes it into `distDir` on startup, so
 *   accepting it would make every directory look like ours. Callers must
 *   verify before acquiring that lock.
 */
const LEGACY_DIST_DIR_MARKERS: ReadonlyArray<string> = [
  'BUILD_ID',
  'trace',
  'trace-build',
  'cache',
  'dev',
  'diagnostics',
]

/**
 * Entries ignored when deciding whether a directory is "empty". These come
 * from other tooling and are not user data, so they should not block cleaning
 * an otherwise-empty directory.
 */
const IGNORED_ENTRIES: ReadonlySet<string> = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitkeep',
  '.gitignore',
  '.keep',
])

export class DistDirOutsideWorkspaceError extends Error {
  constructor(distDir: string, appDir: string, workspaceRoot: string) {
    super(
      `The configured distDir should be inside of the application directory ` +
        `or the workspace containing it:\n\n` +
        `  distDir:        ${distDir}\n` +
        `  application:    ${appDir}\n` +
        `  workspace root: ${workspaceRoot}\n\n` +
        `Read more: https://nextjs.org/docs/messages/invalid-dist-dir`
    )
    this.name = 'DistDirOutsideWorkspaceError'
  }
}

export class UnrecognizedDistDirError extends Error {
  constructor(distDir: string) {
    super(
      `The configured distDir is not empty and is missing the '${DIST_DIR_MARKER}' ` +
        `file that Next.js writes into the directories it owns:\n\n` +
        `  distDir: ${distDir}\n\n` +
        `Read more: https://nextjs.org/docs/messages/invalid-dist-dir`
    )
    this.name = 'UnrecognizedDistDirError'
  }
}

/** Whether `descendant` is strictly inside `ancestor`. */
function isStrictlyInside(ancestor: string, descendant: string): boolean {
  // Comparing against the separator-terminated ancestor also rejects
  // `descendant` being `ancestor` itself, and siblings sharing a name prefix.
  return descendant.startsWith(path.resolve(ancestor) + path.sep)
}

/**
 * Throws unless `distDir` resolves strictly inside the application directory
 * or the workspace root.
 *
 * This is the primary defense against a `distDir` that would destroy user
 * data, and the only one that catches a directory legitimately holding a
 * `package.json` — the application directory itself, or a workspace root.
 *
 * Both boundaries are accepted because `distDir` may legitimately sit outside
 * the application: an Nx-style monorepo builds `apps/web` into `../.next`.
 * Either one being satisfied is enough, so a `workspaceRoot` that is unrelated
 * to `appDir` — as `outputFileTracingRoot` may be — cannot reject an otherwise
 * valid `distDir`.
 *
 * This runs during config validation, so it applies to every command rather
 * than only those that clean.
 *
 * @param distDir Absolute path to the resolved `distDir`.
 */
export function verifyDistDirIsInsideWorkspace(
  distDir: string,
  appDir: string,
  workspaceRoot: string
): void {
  const resolvedDistDir = path.resolve(distDir)

  if (
    isStrictlyInside(appDir, resolvedDistDir) ||
    isStrictlyInside(workspaceRoot, resolvedDistDir)
  ) {
    return
  }

  throw new DistDirOutsideWorkspaceError(
    resolvedDistDir,
    path.resolve(appDir),
    path.resolve(workspaceRoot)
  )
}

/**
 * Throws unless the contents of `distDir` are safe to recursively delete:
 * the directory must be empty, missing, or carry a marker showing Next.js
 * created it.
 *
 * {@link verifyDistDirIsInsideWorkspace} is enforced separately, during config
 * validation.
 *
 * Call this before acquiring the `distDir` lock, which would otherwise make
 * any directory look owned.
 */
export function verifyDistDirOwnership(distDir: string): void {
  const resolvedDistDir = path.resolve(distDir)

  let entries: string[]
  try {
    entries = fs.readdirSync(resolvedDistDir)
  } catch (err) {
    // A missing directory is trivially safe: there is nothing to delete.
    if (isError(err) && err.code === 'ENOENT') {
      return
    }
    throw err
  }

  const isOwned = entries.some(
    (entry) =>
      entry === DIST_DIR_MARKER || LEGACY_DIST_DIR_MARKERS.includes(entry)
  )
  if (isOwned) {
    return
  }

  // Empty, or holding only incidental files.
  const isEmpty = entries.every((entry) => IGNORED_ENTRIES.has(entry))
  if (isEmpty) {
    return
  }

  throw new UnrecognizedDistDirError(resolvedDistDir)
}

/**
 * Deletes the contents of `distDir` and marks it as owned by Next.js.
 *
 * {@link DIST_DIR_MARKER} is always retained, and written back immediately
 * afterwards, so a run interrupted partway still leaves a directory that can
 * be cleaned next time.
 *
 * `distDir` must already have passed {@link verifyDistDirOwnership}. The two
 * are separate calls because `experimental.lockDistDir` writes into `distDir`
 * between them, and that write would otherwise make any directory look owned.
 *
 * @param retain Entries to keep, as paths relative to `distDir`. Which ones
 * survive a clean differs per caller, so each passes its own set.
 */
export async function cleanDistDir(
  distDir: string,
  retain: Iterable<string>
): Promise<void> {
  await recursiveDeleteSyncWithAsyncRetries(
    distDir,
    new Set([DIST_DIR_MARKER, ...retain])
  )

  await fs.promises.mkdir(distDir, { recursive: true })
  await fs.promises.writeFile(
    path.join(distDir, DIST_DIR_MARKER),
    DIST_DIR_MARKER_CONTENTS
  )
}
