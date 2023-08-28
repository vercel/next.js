import type { FileReader } from './file-reader'

import { recursiveReadDir } from '../../../../../../lib/recursive-readdir'

type FilterInput = ((pathname: string) => boolean) | RegExp

type Filter = (pathname: string) => boolean

function createFilter(input?: FilterInput): Filter | undefined {
  if (typeof input === 'undefined') return
  if (typeof input === 'function') return input

  return (pathname) => input.test(pathname)
}

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
    pathnameFilter?: FilterInput,
    ignoreFilter?: FilterInput,
    ignorePartFilter?: FilterInput
  ) {
    this.pathnameFilter = createFilter(pathnameFilter)
    this.ignoreFilter = createFilter(ignoreFilter)
    this.ignorePartFilter = createFilter(ignorePartFilter)
  }

  /**
   * Reads all the files in the directory and its subdirectories following any
   * symbolic links.
   *
   * @param dir directory to read
   * @param pathnameFilter filter to ignore files with absolute pathnames, false to ignore
   * @param ignoreFilter filter to ignore files and directories with absolute pathnames, false to ignore
   * @param ignorePartFilter filter to ignore files and directories with the pathname part, false to ignore
   */
  public static read(
    dir: string,
    pathnameFilter?: FilterInput,
    ignoreFilter?: FilterInput,
    ignorePartFilter?: FilterInput
  ): Promise<ReadonlyArray<string>> {
    const reader = new DefaultFileReader(
      pathnameFilter,
      ignoreFilter,
      ignorePartFilter
    )

    return reader.read(dir)
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
      this.ignorePartFilter
    )
  }
}
