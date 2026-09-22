import * as fs from 'node:fs'
import * as path from 'node:path'
import isError from './is-error'
import { recursiveDeleteSyncWithAsyncRetries } from './recursive-delete'

/** Marks a directory as owned by Next.js. */
export const DIST_DIR_MARKER = '.next-build-dir'

/** Markers written by Next.js versions predating {@link DIST_DIR_MARKER}. */
const LEGACY_DIST_DIR_MARKERS: ReadonlyArray<string> = [
  'BUILD_ID',
  'trace',
  'trace-build',
]

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
        `Please confirm it is correct. A distDir should be empty, absent, or ` +
        `created by Next.js:\n\n` +
        `  distDir: ${distDir}\n\n` +
        `Read more: https://nextjs.org/docs/messages/invalid-dist-dir`
    )
    this.name = 'UnrecognizedDistDirError'
  }
}

/** Whether `descendant` is strictly inside `ancestor`. */
// TODO: Account for symlinks when validating containment.
function isStrictlyInside(ancestor: string, descendant: string): boolean {
  const relative = path.relative(path.resolve(ancestor), descendant)
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  )
}

/** Throws unless `distDir` is inside the application or workspace. */
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
 * Throws unless `distDir` is absent, empty, or owned by Next.js. Call before
 * anything writes into the directory.
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

  if (entries.length !== 0) {
    throw new UnrecognizedDistDirError(resolvedDistDir)
  }
}

/**
 * Cleans `distDir`, writes an ownership marker, and retains specified entries.
 * `distDir` must already have passed {@code verifyDistDir}.
 */
export async function cleanDistDir(
  distDir: string,
  retain: Iterable<string>
): Promise<void> {
  await fs.promises.mkdir(distDir, { recursive: true })
  await fs.promises.writeFile(path.join(distDir, DIST_DIR_MARKER), '')

  const retained = new Set(retain)
  retained.add(DIST_DIR_MARKER)
  await recursiveDeleteSyncWithAsyncRetries(distDir, retained)
}
