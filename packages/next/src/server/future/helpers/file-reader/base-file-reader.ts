import type { FileReader, FileReaderOptions } from './file-reader'

import { recursiveReadDir } from '../../../../lib/recursive-readdir'

/**
 * Reads all the files in the directory and its subdirectories following any
 * symbolic links and returns a sorted list of the files.
 */
export class BaseRecursiveFileReader implements FileReader {
  public async read(
    dir: string,
    { recursive }: FileReaderOptions
  ): Promise<ReadonlyArray<string>> {
    return recursiveReadDir(dir, {
      // Do not sort the pathnames, the current implementation does not handle
      // this correctly.
      // FIXME: (wyattjoh) address sorting issue
      sortFilenames: false,

      // We want absolute pathnames because we're going to be comparing them
      // with other absolute pathnames.
      relativeFilenames: false,

      // Only go to a depth of 1 if we're not recursive.
      maxDepth: recursive ? Infinity : 1,
    })
  }
}
