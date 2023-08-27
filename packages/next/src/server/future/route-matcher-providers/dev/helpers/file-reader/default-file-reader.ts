import type { FileReader } from './file-reader'
import type { Dirent } from 'fs'

import fs from 'fs/promises'
import path from 'path'

export class DefaultFileReader implements FileReader {
  public async read(dir: string): Promise<ReadonlyArray<string>> {
    const pathnames: string[] = []

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
          // Handle each file.
          const pathname = path.join(directory, file.name)

          // If the file is a directory, then add it to the list of directories,
          // they'll be scanned on a later pass.
          if (file.isDirectory()) {
            directories.push(pathname)
          } else if (file.isSymbolicLink()) {
            links.push(pathname)
          } else {
            pathnames.push(pathname)
          }
        }
      }

      // Resolve all the symbolic links we found if any.
      if (links.length > 0) {
        const resolved = await Promise.all(
          links.map(async (pathname) => {
            const stats = await fs.stat(pathname)
            return stats
          })
        )

        for (let i = 0; i < links.length; i++) {
          const pathname = links[i]
          const stats = resolved[i]

          if (stats.isDirectory()) {
            directories.push(pathname)
          } else {
            pathnames.push(pathname)
          }
        }
      }
    }

    return pathnames
  }
}
