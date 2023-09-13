import { FileReader, FileReaderOptions } from '../file-reader'
import { isFileInDirectory } from './is-file-in-directory'

/**
 * Mock implementation of the `FileReader` interface for testing purposes.
 */
export class MockFileReader implements FileReader {
  private files: ReadonlyArray<string>

  /**
   * Constructs a new instance of the `MockFileReader` with the specified files.
   * @param files An optional array of file paths to be used for reading.
   */
  constructor(files: ReadonlyArray<string> = []) {
    // Sort the files array for efficient matching
    this.files = [...files].sort()
  }

  /**
   * Implementation of the `read` method that provides a mock file reading behavior.
   * @param dir The directory to read files from.
   * @param options The FileReaderOptions object, including the 'recursive' flag.
   * @returns An async generator that yields file paths matching the directory and options.
   */
  public async *read(
    dir: string,
    options: FileReaderOptions
  ): AsyncGenerator<string, undefined, undefined> {
    for (const file of this.files) {
      if (!isFileInDirectory(file, dir, options.recursive)) continue

      yield file
    }
  }
}
