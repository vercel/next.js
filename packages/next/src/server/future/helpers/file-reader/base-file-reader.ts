import type { FileReader, FileReaderOptions } from './file-reader'

import { recursiveReadDir } from '../../../../lib/recursive-readdir'

/**
 * Reads all the files in the directory and its subdirectories following any
 * symbolic links and returns a sorted list of the files.
 */
export class BaseFileReader implements FileReader {
  private static shared?: BaseFileReader

  /**
   * Finds or creates the shared file reader.
   *
   * @returns the shared file reader
   */
  public static findOrCreateShared() {
    if (!BaseFileReader.shared) {
      BaseFileReader.shared = new BaseFileReader()
    }

    return BaseFileReader.shared
  }

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

      // We don't want to throw if the directory doesn't exist, we'll handle
      // that ourselves.
      throwOnMissing: false,
    })
  }
}
