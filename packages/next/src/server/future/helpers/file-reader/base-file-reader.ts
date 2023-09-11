import type { FileReader, FileReaderOptions } from './file-reader'

import fs from 'fs/promises'
import path from 'path'
import { recursiveReadDir } from '../../../../lib/recursive-readdir'

/**
 * Reads all the files in the directory and its subdirectories following any
 * symbolic links and returns a sorted list of the files.
 */
export class BaseRecursiveFileReader implements FileReader {
  public async read(
    dir: string,
    options: FileReaderOptions
  ): Promise<ReadonlyArray<string>> {
    if (options.recursive) {
      return recursiveReadDir(dir, {
        // FIXME: Currently the implementation relies on the OS sort of these files, this will be addressed in a future PR.
        sortPathnames: false,

        // We want absolute pathnames because we're going to be comparing them
        // with other absolute pathnames.
        relativePathnames: false,
      })
    }

    const filenames = new Array<string>()

    const links = new Array<string>()
    const files = await fs.readdir(dir, { withFileTypes: true })
    for (const file of files) {
      // Skip directories, this isn't a recursive read.
      if (file.isDirectory()) {
        continue
      }

      // If the symbolic link is a file, we should include it, so add it to the
      // list of link so we can resolve them.
      if (file.isSymbolicLink()) {
        links.push(path.join(dir, file.name))
        continue
      }

      // If the file isn't a file, then skip it.
      if (!file.isFile()) {
        continue
      }

      // Add the file to the list of filenames.
      filenames.push(path.join(dir, file.name))
    }

    // Resolve all the links (if any).
    if (links.length > 0) {
      const resolved = await Promise.all(
        links.map(async (link) => {
          try {
            return await fs.stat(link)
          } catch (err: any) {
            // This can only happen when the underlying link was removed. If
            // anything other than this error occurs, re-throw it.
            if (err.code !== 'ENOENT') throw err

            // The error occurred, so abandon reading this directory.
            return null
          }
        })
      )

      // Add any of the links that were resolved to the list of filenames.
      for (let i = 0; i < links.length; i++) {
        const link = links[i]
        const stat = resolved[i]

        // If the file couldn't be resolved, then skip it.
        if (!stat) continue

        // If the link wasn't a file, then skip it.
        if (!stat.isFile()) continue

        // Add the file to the list of filenames.
        filenames.push(link)
      }
    }

    return filenames
  }
}
