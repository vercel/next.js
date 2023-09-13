import type { FileReader, FileReaderOptions } from './file-reader'

import fs from 'fs/promises'
import path from 'path'

/**
 * Reads all the files in the directory and its subdirectories following any
 * symbolic links and returns a sorted list of the files.
 */
export class BaseRecursiveFileReader implements FileReader {
  public async read(
    rootDirectory: string,
    { recursive }: FileReaderOptions
  ): Promise<ReadonlyArray<string>> {
    const filenames: string[] = []

    // The queue of directories to scan.
    let directories: string[] = [rootDirectory]
    let links: string[] = []

    // While there are directories to scan...
    while (directories.length > 0) {
      const results = await Promise.all(
        directories.map(async (directory) => {
          const result: {
            directories: string[]
            filenames: string[]
            links: string[]
          } = { directories: [], filenames: [], links: [] }

          // Read the directory.
          const files = await fs.opendir(directory)

          // Add all the files to the queue or yield them.
          for await (const file of files) {
            const filename = path.join(directory, file.name)

            if (file.isDirectory()) {
              result.directories.push(filename)
            } else if (file.isSymbolicLink()) {
              result.links.push(filename)
            } else {
              result.filenames.push(filename)
            }
          }

          return result
        })
      )

      directories = []

      for (const result of results) {
        // Add all the files to the list of filenames.
        filenames.push(...result.filenames)

        // Add all the directories to the queue.
        directories.push(...result.directories)

        // Add all the links to the queue.
        links.push(...result.links)
      }

      // Resolve all the links (if any).
      if (links.length > 0) {
        const resolved = await Promise.all(
          links.map(async (filename) => {
            try {
              return await fs.stat(filename)
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
          const filename = links[i]

          if (stats.isDirectory()) {
            directories.push(filename)
          } else {
            filenames.push(filename)
          }
        }

        links = []

        // If the read operation is not recursive, we're done.
        if (!recursive) break
      }
    }

    return filenames
  }
}
