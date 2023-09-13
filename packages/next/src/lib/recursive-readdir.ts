import fs from 'fs/promises'
import path from 'path'

type Filter = (pathname: string) => boolean

type Result = {
  directories: string[]
  filenames: string[]
  links: string[]
}

export type RecursiveReadDirOptions = {
  /**
   * Filter to ignore files with absolute pathnames, false to ignore.
   */
  filenameFilter?: Filter

  /**
   * Filter to ignore files and directories with absolute pathnames, false to
   * ignore.
   */
  ignoreFilter?: Filter

  /**
   * Filter to ignore files and directories with the pathname part, false to
   * ignore.
   */
  ignorePartFilter?: Filter

  /**
   * Whether to sort the results, true by default.
   */
  sortFilenames?: boolean

  /**
   * Whether to return relative pathnames, true by default.
   */
  relativeFilenames?: boolean

  /**
   * If provided, the maximum depth to recurse into the directory. Otherwise
   * recurse indefinitely.
   */
  maxDepth?: number
}

/**
 * Recursively reads a directory and returns the list of pathnames.
 *
 * @param rootDirectory the directory to read
 * @param options options to control the behavior of the recursive read
 * @returns the list of pathnames
 */
export async function recursiveReadDir(
  rootDirectory: string,
  options: RecursiveReadDirOptions = {}
): Promise<string[]> {
  // Grab our options.
  const {
    filenameFilter,
    ignoreFilter,
    ignorePartFilter,
    sortFilenames = true,
    relativeFilenames = true,
    maxDepth = Infinity,
  } = options

  // The list of pathnames to return.
  const filenames: string[] = []

  /**
   * Coerces the pathname to be relative if requested.
   */
  const coerce = relativeFilenames
    ? (pathname: string) => pathname.replace(rootDirectory, '')
    : (pathname: string) => pathname

  // The queue of directories to scan.
  let directories: string[] = [rootDirectory]

  let depth = 0

  while (directories.length > 0) {
    // Load all the files in each directory at the same time.
    const results = await Promise.all(
      directories.map(async (directory) => {
        const result: Result = { directories: [], filenames: [], links: [] }

        try {
          const dir = await fs.opendir(directory)
          for await (const file of dir) {
            // If enabled, ignore the file if it matches the ignore filter.
            if (ignorePartFilter && ignorePartFilter(file.name)) {
              continue
            }

            // Handle each file.
            const filename = path.join(directory, file.name)

            // If enabled, ignore the file if it matches the ignore filter.
            if (ignoreFilter && ignoreFilter(filename)) {
              continue
            }

            // If the file is a directory, then add it to the list of directories,
            // they'll be scanned on a later pass.
            if (file.isDirectory()) {
              result.directories.push(filename)
            } else if (file.isSymbolicLink()) {
              result.links.push(filename)
            } else if (!filenameFilter || filenameFilter(filename)) {
              result.filenames.push(coerce(filename))
            }
          }
        } catch (err: any) {
          // This can only happen when the underlying directory was removed. If
          // anything other than this error occurs, re-throw it.
          // if (err.code !== 'ENOENT') throw err
          if (err.code !== 'ENOENT' || directory === rootDirectory) throw err

          // The error occurred, so abandon reading this directory.
          return null
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
      // If the directory was removed, then skip it.
      if (!result) continue

      // Add any directories to the list of directories to scan.
      directories.push(...result.directories)

      // Add any symbolic links to the list of symbolic links to resolve.
      links.push(...result.links)

      // Add any file pathnames to the list of pathnames.
      filenames.push(...result.filenames)
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
        } else if (!filenameFilter || filenameFilter(absolutePathname)) {
          filenames.push(coerce(absolutePathname))
        }
      }
    }

    // Increment the depth.
    depth++

    // If we've reached the maximum depth, then stop recursing.
    if (depth >= maxDepth) break
  }

  // Sort the pathnames in place if requested.
  if (sortFilenames) {
    filenames.sort()
  }

  return filenames
}
