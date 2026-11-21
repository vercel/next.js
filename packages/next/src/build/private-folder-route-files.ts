import fs from 'fs/promises'
import path from 'path'
import origDebug from 'next/dist/compiled/debug'
import * as Log from './output/log'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'

const debug = origDebug('next:private-folder-routes')

const PRIVATE_FOLDERS_DOCS_URL =
  'https://nextjs.org/docs/app/getting-started/project-structure#private-folders'

// Bounds for the best-effort scan, so that large private trees (e.g. generated
// assets) can't noticeably slow down route discovery.
const MAX_SCANNED_DIRECTORIES = 1_000
// Number of directory levels scanned below each private entry, e.g. depth 0 is
// `app/_foo`, depth 1 is `app/_foo/[slug]`.
const MAX_DEPTH = 4
const READDIR_CONCURRENCY = 64

/**
 * Collects `page.*` / `route.*` files inside the given private folders (app
 * directory entries prefixed with `_`), which are opted out of routing.
 *
 * This only feeds an advisory warning, so it is best effort: symbolic links
 * are not followed (avoiding cycles), unreadable entries are skipped,
 * `node_modules` and dot-folders are skipped, and the scan is bounded by
 * `MAX_DEPTH` and `MAX_SCANNED_DIRECTORIES`. Hitting a bound is only reported
 * as a debug log.
 *
 * @param privateEntries absolute paths of `_`-prefixed app directory entries
 * @returns absolute paths of the page/route files, sorted
 */
export async function collectPrivateFolderRouteFiles(
  privateEntries: string[],
  validFileMatcher: { isAppPageOrRouteFile: (filePath: string) => boolean }
): Promise<string[]> {
  const files: string[] = []
  const directories: Array<{ directory: string; depth: number }> = []
  const stats = { skippedTooDeep: 0 }

  await Promise.all(
    privateEntries.map(async (entry) => {
      try {
        if ((await fs.lstat(entry)).isDirectory()) {
          directories.push({ directory: entry, depth: 0 })
        }
      } catch {}
    })
  )

  let scannedDirectories = 0
  while (
    directories.length > 0 &&
    scannedDirectories < MAX_SCANNED_DIRECTORIES
  ) {
    const batch = directories.splice(
      0,
      Math.min(
        READDIR_CONCURRENCY,
        MAX_SCANNED_DIRECTORIES - scannedDirectories
      )
    )
    scannedDirectories += batch.length
    await Promise.all(
      batch.map(async ({ directory, depth }) => {
        let dirents
        try {
          dirents = await fs.readdir(directory, { withFileTypes: true })
        } catch {
          return
        }
        for (const dirent of dirents) {
          const absolutePath = path.join(directory, dirent.name)
          if (dirent.isDirectory()) {
            if (dirent.name === 'node_modules' || dirent.name.startsWith('.')) {
              continue
            }
            if (depth + 1 > MAX_DEPTH) {
              stats.skippedTooDeep++
              continue
            }
            directories.push({ directory: absolutePath, depth: depth + 1 })
          } else if (
            dirent.isFile() &&
            validFileMatcher.isAppPageOrRouteFile(absolutePath)
          ) {
            files.push(absolutePath)
          }
        }
      })
    )
  }

  if (directories.length > 0) {
    debug(
      `stopped after scanning ${scannedDirectories} private directories, ${directories.length} not scanned`
    )
  }
  if (stats.skippedTooDeep > 0) {
    debug(
      `skipped ${stats.skippedTooDeep} private directories deeper than ${MAX_DEPTH} levels`
    )
  }

  return files.sort()
}

/**
 * Warns about `page.*` / `route.*` files that are not routed because they are
 * located inside a private folder (a folder prefixed with `_`). This can be an
 * intentional opt-out, but it is easy to hit by accident (e.g. when migrating
 * a `/_foo` route), so we point at the `%5F` escape.
 *
 * @param dir the project directory, used to print relative paths
 * @param filePaths absolute paths of the page/route files
 */
export function warnAboutPrivateFolderRouteFiles(
  dir: string,
  filePaths: Iterable<string>
): void {
  const relativePaths = Array.from(filePaths, (filePath) =>
    normalizePathSep(path.relative(dir, filePath))
  ).sort()
  if (relativePaths.length === 0) return

  Log.warn(
    `Folders prefixed with "_" are private and excluded from routing, so the following ${
      relativePaths.length === 1 ? 'file is' : 'files are'
    } not served as routes:\n` +
      relativePaths.map((p) => `  - ${p}`).join('\n') +
      `\nIf this is intentional, no action is needed. If a URL segment should start with an underscore, prefix the folder with "%5F" instead (e.g. "_folder" → "%5Ffolder").` +
      `\nLearn more: ${PRIVATE_FOLDERS_DOCS_URL}`
  )
}
