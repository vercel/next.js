export type FileReaderOptions = {
  recursive: boolean
}

export interface FileReader {
  /**
   * Reads the directory contents recursively.
   *
   * @param dir directory to read recursively from
   */
  read(
    dir: string,
    options: FileReaderOptions
  ): Promise<ReadonlyArray<string>> | PromiseLike<ReadonlyArray<string>>
}
