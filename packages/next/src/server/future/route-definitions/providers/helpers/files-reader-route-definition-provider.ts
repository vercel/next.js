import type {
  FileReader,
  FileReaderOptions,
} from '../../../helpers/file-reader/file-reader'
import type { RouteDefinition } from '../../route-definition'

import { BaseRouteDefinitionProvider } from './base-route-definition-provider'

export abstract class FileReaderRouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition
> extends BaseRouteDefinitionProvider<D, ReadonlyArray<string>> {
  /**
   * @param dir the directory to read the files from
   * @param fileReader the file reader to use to read the files
   * @param fileReaderOptions the options to pass to the file reader
   */
  constructor(
    protected readonly dir: string,
    private readonly fileReader: FileReader,
    private readonly fileReaderOptions: FileReaderOptions = { recursive: true }
  ) {
    super()
  }

  protected abstract filterFilename(filename: string): boolean

  /**
   * Compares the left and right filenames. If they are completely equal (same)
   * then `true` is returned, otherwise `false`.
   */
  protected compare(
    left: ReadonlyArray<string>,
    right: ReadonlyArray<string>
  ): boolean {
    if (left.length !== right.length) return false

    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false
    }

    return true
  }

  /**
   * Loads the filenames from the reader.
   */
  protected async load(): Promise<ReadonlyArray<string>> {
    // Load all the files in the directory.
    const files = await this.fileReader.read(this.dir, this.fileReaderOptions)

    // Filter the files.
    return files.filter((filename) => this.filterFilename(filename))
  }
}
