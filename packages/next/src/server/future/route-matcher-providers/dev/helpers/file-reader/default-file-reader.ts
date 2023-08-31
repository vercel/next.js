import type { FileReader } from './file-reader'

import {
  RecursiveReadDirOptions,
  recursiveReadDir,
} from '../../../../../../lib/recursive-readdir'

export type DefaultFileReaderOptions = Pick<
  RecursiveReadDirOptions,
  'pathnameFilter' | 'ignoreFilter' | 'ignorePartFilter'
>

/**
 * Reads all the files in the directory and its subdirectories following any
 * symbolic links and returns a sorted list of the files.
 */
export class DefaultFileReader implements FileReader {
  /**
   * Filter to ignore files with absolute pathnames. If undefined, no files are
   * ignored.
   */
  private readonly options: Readonly<DefaultFileReaderOptions>

  /**
   * Creates a new file reader.
   *
   * @param pathnameFilter filter to ignore files with absolute pathnames, false to ignore
   * @param ignoreFilter filter to ignore files and directories with absolute pathnames, false to ignore
   * @param ignorePartFilter filter to ignore files and directories with the pathname part, false to ignore
   */
  constructor(options: Readonly<DefaultFileReaderOptions>) {
    this.options = options
  }

  /**
   * Reads all the files in the directory and its subdirectories following any
   * symbolic links.
   *
   * @param dir the directory to read
   * @returns a promise that resolves to the list of files
   */
  public async read(dir: string): Promise<ReadonlyArray<string>> {
    return recursiveReadDir(dir, {
      pathnameFilter: this.options.pathnameFilter,
      ignoreFilter: this.options.ignoreFilter,
      ignorePartFilter: this.options.ignorePartFilter,

      // We want to sort the pathnames so that we can compare them with other
      // pathnames.
      sortPathnames: true,

      // We want absolute pathnames because we're going to be comparing them
      // with other absolute pathnames.
      relativePathnames: false,
    })
  }
}
