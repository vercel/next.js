import type { Dirent } from 'fs'

import fs from 'fs/promises'
import path from 'path'

type Filter = (pathname: string) => boolean

type Result = {
  directories: string[]
  files: string[]
  links: string[]
}

/**
 *
 * @param rootDirectory the directory to read
 * @param pathnameFilter filter to ignore files with absolute pathnames, false to ignore
 * @param ignoreFilter filter to ignore files and directories with absolute pathnames, false to ignore
 * @param ignorePartFilter filter to ignore files and directories with the pathname part, false to ignore
 * @param sortPathnames whether to sort the results, true by default
 * @param relativePathnames whether to return relative pathnames, true by default
 * @returns
 */
export async function recursiveReadDir(
  rootDirectory: string,
  pathnameFilter?: Filter,
  ignoreFilter?: Filter,
  ignorePartFilter?: Filter,
  sortPathnames: boolean = true,
  relativePathnames: boolean = true
): Promise<string[]> {
  // The list of pathnames to return.
  const pathnames: string[] = []

  /**
   * Coerces the pathname to be relative if requested.
   */
  const coerce = relativePathnames
    ? (pathname: string) => pathname.replace(rootDirectory, '')
    : (pathname: string) => pathname

  // The queue of directories to scan.
  let directories: string[] = [rootDirectory]

  while (directories.length > 0) {
    // Load all the files in each directory at the same time.
    const results = await Promise.all(
      directories.map(async (directory) => {
        const result: Result = { directories: [], files: [], links: [] }

        try {
          const dir = await fs.opendir(directory, {
            // Buffer up to 100 files at a time for the iterator.
            bufferSize: 100,
          })
          for await (const file of dir) {
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
              result.directories.push(absolutePathname)
            } else if (file.isSymbolicLink()) {
              result.links.push(absolutePathname)
            } else if (!pathnameFilter || pathnameFilter(absolutePathname)) {
              result.files.push(coerce(absolutePathname))
            }
          }
        } catch (err: any) {
          // This can only happen when the underlying directory was removed. If
          // anything other than this error occurs, re-throw it.
          // if (err.code !== 'ENOENT') throw err
          if (err.code !== 'ENOENT' || directory === rootDirectory) throw err

          // The error occurred, so abandon reading this directory.
          return { directories: [], files: [], links: [] }
        }

        return result
      })
    )

    // Empty the directories, we'll fill it later if some of the files are
    // directories.
    directories = []

    // Keep track of any symbolic links we find, we'll resolve them later.
    const links = []

    // For each result of directory scans...
    for (const result of results) {
      // Add any directories to the list of directories to scan.
      directories.push(...result.directories)

      // Add any symbolic links to the list of symbolic links to resolve.
      links.push(...result.links)

      // Add any file pathnames to the list of pathnames.
      pathnames.push(...result.files)
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
          pathnames.push(coerce(absolutePathname))
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
