import * as fs from 'node:fs'
import * as path from 'node:path'
import isError from './is-error'
import { recursiveDeleteSyncWithAsyncRetries } from './recursive-delete'

/**
 * Terminology, because "project" is ambiguous in a monorepo. For an app at
 * `<repo>/web/site`:
 *
 * - **application directory** (`dir` elsewhere): `<repo>/web/site`, holding
 *   `next.config.js`.
 * - **workspace root** (`rootDir` / `repoRoot` elsewhere): `<repo>`.
 *
 * `distDir` resolves relative to the application directory but may point
 * anywhere in the workspace: an Nx-style monorepo builds `apps/web` into
 * `../.next`.
 */

/**
 * An empty file Next.js writes into `distDir` to mark the directory as its
 * own. Cleaning is destructive and recursive, so we require this evidence
 * before deleting anything.
 */
export const DIST_DIR_MARKER = '.next-build-dir'

/**
 * Entries that show a directory was created by a Next.js version predating
 * {@link DIST_DIR_MARKER}, so an existing `.next` is not rejected on upgrade.
 * Every entry must be a name only Next.js creates.
 */
const LEGACY_DIST_DIR_MARKERS: ReadonlyArray<string> = [
  'BUILD_ID',
  'trace',
  'trace-build',
  'cache',
  'dev',
  'diagnostics',
  // Not `package.json`: every JS project has one, so accepting it would let
  // `distDir: '.'` delete an application's own source.
  // Not `lock`: `experimental.lockDistDir` writes it on startup, so accepting
  // it would make every directory look like ours.
]

/** Files that can be present in an otherwise-empty directory. */
const PLACEHOLDER_ENTRIES: ReadonlySet<string> = new Set([
  '.gitkeep',
  '.keep',
  '.gitignore',
  '.DS_Store',
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
      `The configured distDir does not appear to have been created by Next.js. ` +
        `Please confirm it is correct. A distDir should be empty, missing, or ` +
        `created by Next.js:\n\n` +
        `  distDir: ${distDir}\n\n` +
        `Read more: https://nextjs.org/docs/messages/invalid-dist-dir`
    )
    this.name = 'UnrecognizedDistDirError'
  }
}

/** Whether `descendant` is strictly inside `ancestor`. */
function isStrictlyInside(ancestor: string, descendant: string): boolean {
  const relative = path.relative(path.resolve(ancestor), descendant)
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  )
}

/**
 * Throws unless `distDir` resolves strictly inside the application directory
 * or the workspace root.
 *
 * This is the primary defense against a `distDir` that would destroy user
 * data, and the only one that catches a directory legitimately holding a
 * `package.json`. Either boundary is enough, so a `workspaceRoot` unrelated to
 * `appDir` — as `outputFileTracingRoot` may be — cannot reject a valid
 * `distDir`.
 *
 * Runs during config validation, so it applies to every command.
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
 * Throws unless the contents of `distDir` are safe to recursively delete: the
 * directory must be missing, empty, or carry a marker showing Next.js created
 * it.
 *
 * Call this before acquiring the `distDir` lock, which would otherwise make
 * any directory look owned.
 */
export function verifyDistDir(distDir: string): void {
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

  // An empty distDir is safe. `.gitkeep` and friends are how an empty build
  // directory gets committed, so they still count as empty.
  const isEmpty = entries.every((entry) => PLACEHOLDER_ENTRIES.has(entry))
  if (!isEmpty) {
    throw new UnrecognizedDistDirError(resolvedDistDir)
  }
}

/**
 * Deletes the contents of `distDir` and marks it as owned by Next.js, so a
 * run interrupted partway still leaves a directory we can clean next time.
 *
 * `distDir` must already have passed {@link verifyDistDir}. The two are
 * separate calls because `experimental.lockDistDir` writes into `distDir`
 * between them, and that write would otherwise make any directory look owned.
 *
 * @param retain Entries to keep, relative to `distDir`. Which ones survive
 * differs per caller, so each passes its own set.
 */
export async function cleanDistDir(
  distDir: string,
  retain: Iterable<string>
): Promise<void> {
  await recursiveDeleteSyncWithAsyncRetries(distDir, new Set(retain))

  await fs.promises.mkdir(distDir, { recursive: true })
  await fs.promises.writeFile(path.join(distDir, DIST_DIR_MARKER), '')
}
