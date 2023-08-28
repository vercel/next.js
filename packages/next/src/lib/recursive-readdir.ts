import type { Dirent } from 'fs'

import fs from 'fs/promises'
import path from 'path'

type Filter = (pathname: string) => boolean

/**
 *
 * @param dir the directory to read
 * @param pathnameFilter filter to ignore files with absolute pathnames, false to ignore
 * @param ignoreFilter filter to ignore files and directories with absolute pathnames, false to ignore
 * @param ignorePartFilter filter to ignore files and directories with the pathname part, false to ignore
 * @param sortPathnames whether to sort the results, true by default
 * @param relativePathnames whether to return relative pathnames, true by default
 * @returns
 */
export async function recursiveReadDir(
  dir: string,
  pathnameFilter?: Filter,
  ignoreFilter?: Filter,
  ignorePartFilter?: Filter,
  sortPathnames: boolean = true,
  relativePathnames: boolean = true
): Promise<string[]> {
  // The list of pathnames to return.
  const pathnames: string[] = []

  /**
   * Pushes the pathname to the list of pathnames and coerces it to be relative
   * if requested.
   */
  const push = relativePathnames
    ? (pathname: string) => {
        pathnames.push(pathname.replace(dir, ''))
      }
    : (pathname: string) => {
        pathnames.push(pathname)
      }

  // The queue of directories to scan.
  let directories: string[] = [dir]

  while (directories.length > 0) {
    // Load all the files in each directory at the same time.
    const results = await Promise.all(
      directories.map(async (directory) => {
        let files: Dirent[]
        try {
          files = await fs.readdir(directory, { withFileTypes: true })
        } catch (err: any) {
          // This can only happen when the underlying directory was removed. If
          // anything other than this error occurs, re-throw it.
          if (err.code !== 'ENOENT') throw err

          // The error occurred, so abandon reading this directory.
          files = []
        }

        return { directory, files }
      })
    )

    // Empty the directories, we'll fill it later if some of the files are
    // directories.
    directories = []

    // Keep track of any symbolic links we find, we'll resolve them later.
    const links = []

    // For each result of directory scans...
    for (const { files, directory } of results) {
      // And for each file in it...
      for (const file of files) {
        // If enabled, ignore the file if it matches the ignore filter.
        if (ignorePartFilter && ignorePartFilter(file.name)) {
          continue
        }

        // Handle each file.
        const absolutePathname = path.join(directory, file.name)

        // If enabled, ignore the file if it matches the ignore filter.
        if (ignoreFilter && ignoreFilter(absolutePathname)) {
          continue
        }

        // If the file is a directory, then add it to the list of directories,
        // they'll be scanned on a later pass.
        if (file.isDirectory()) {
          directories.push(absolutePathname)
        } else if (file.isSymbolicLink()) {
          links.push(absolutePathname)
        } else if (!pathnameFilter || pathnameFilter(absolutePathname)) {
          push(absolutePathname)
        }
      }
    }

    // Resolve all the symbolic links we found if any.
    if (links.length > 0) {
      const resolved = await Promise.all(
        links.map(async (absolutePathname) => {
          try {
            return await fs.stat(absolutePathname)
          } catch (err: any) {
            // This can only happen when the underlying link was removed. If
            // anything other than this error occurs, re-throw it.
            if (err.code !== 'ENOENT') throw err

            // The error occurred, so abandon reading this directory.
            return null
          }
        })
      )

      for (let i = 0; i < links.length; i++) {
        const stats = resolved[i]

        // If the link was removed, then skip it.
        if (!stats) continue

        // We would have already ignored the file if it matched the ignore
        // filter, so we don't need to check it again.
        const absolutePathname = links[i]

        if (stats.isDirectory()) {
          directories.push(absolutePathname)
        } else if (!pathnameFilter || pathnameFilter(absolutePathname)) {
          push(absolutePathname)
        }
      }
    }
  }

  // Sort the pathnames in place if requested.
  if (sortPathnames) {
    pathnames.sort()
  }

  return pathnames
}
