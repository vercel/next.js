import type { FileReader, FileReaderOptions } from '../file-reader'

import path from 'path'
import { isFileInDirectory } from './is-file-in-directory'

/**
 * Mock implementation of the `FileReader` interface for testing purposes.
 */
export class MockFileReader implements FileReader {
  /**
   * Constructs a new instance of the `MockFileReader` with the specified files.
   * @param files An optional array of file paths to be used for reading.
   * @param pathSeparator The path separator to use, defaults to posix.
   */
  constructor(
    private readonly files: ReadonlyArray<string> = [],
    private readonly pathSeparator: string = path.posix.sep
  ) {}

  /**
   * Implementation of the `read` method that provides a mock file reading behavior.
   * @param dir The directory to read files from.
   * @param options The FileReaderOptions object, including the 'recursive' flag.
   * @returns An async generator that yields file paths matching the directory and options.
   */
  public read(
    dir: string,
    options: FileReaderOptions
  ): Promise<ReadonlyArray<string>> {
    return Promise.resolve(
      this.files.filter((file) => {
        return isFileInDirectory(
          file,
          dir,
          options.recursive,
          this.pathSeparator
        )
      })
    )
  }
}
