export interface FileReader {
  /**
   * Reads the directory contents recursively.
   *
   * @param dir directory to read recursively from
   */
  read(dir: string): Promise<ReadonlyArray<string>> | ReadonlyArray<string>
}
