import type { FileReader } from './file-reader'

import { recursiveReadDir } from '../../../../../../lib/recursive-readdir'

type Filter = (pathname: string) => boolean

/**
 * Reads all the files in the directory and its subdirectories following any
 * symbolic links.
 */
export class DefaultFileReader implements FileReader {
  /**
   * Filter to ignore files with absolute pathnames. If undefined, no files are
   * ignored.
   */
  private readonly pathnameFilter: Filter | undefined

  /**
   * Filter to ignore files and directories with absolute pathnames. If
   * undefined, no files are ignored.
   */
  private readonly ignoreFilter: Filter | undefined

  /**
   * Filter to ignore files and directories with the pathname part. If
   * undefined, no files are ignored.
   */
  private readonly ignorePartFilter: Filter | undefined

  /**
   * Creates a new file reader.
   *
   * @param pathnameFilter filter to ignore files with absolute pathnames, false to ignore
   * @param ignoreFilter filter to ignore files and directories with absolute pathnames, false to ignore
   * @param ignorePartFilter filter to ignore files and directories with the pathname part, false to ignore
   */
  constructor(
    pathnameFilter?: Filter,
    ignoreFilter?: Filter,
    ignorePartFilter?: Filter
  ) {
    this.pathnameFilter = pathnameFilter
    this.ignoreFilter = ignoreFilter
    this.ignorePartFilter = ignorePartFilter
  }

  /**
   * Reads all the files in the directory and its subdirectories following any
   * symbolic links.
   *
   * @param dir the directory to read
   * @returns a promise that resolves to the list of files
   */
  public async read(dir: string): Promise<ReadonlyArray<string>> {
    return recursiveReadDir(
      dir,
      this.pathnameFilter,
      this.ignoreFilter,
      this.ignorePartFilter,
      // We don't need to sort the results because we're not depending on the
      // order of the results.
      false,
      // We want absolute pathnames because we're going to be comparing them
      // with other absolute pathnames.
      false
    )
  }
}
