import type { FileReader } from '../../helpers/file-reader/file-reader'
import type { RouteDefinition } from '../../route-definitions/route-definition'

import { DefaultRouteDefinitionProvider } from '../default-route-definition-provider'

export abstract class DevRouteDefinitionProvider<
  D extends RouteDefinition = RouteDefinition
> extends DefaultRouteDefinitionProvider<D> {
  constructor(
    /**
     * The directory to read the files from.
     */
    private readonly dir: string,

    /**
     * The reader to use to read the files.
     */
    private readonly reader: FileReader
  ) {
    super()
  }

  /**
   * Transforms the filenames into definitions.
   *
   * @param filenames The filenames to transform.
   */
  protected abstract transform(
    filenames: ReadonlyArray<string>
  ): Promise<ReadonlyArray<D>> | ReadonlyArray<D>

  /**
   * Provides the definitions, implementing the abstract method from the base
   * class.
   *
   * @returns The definitions.
   */
  protected async provide(): Promise<ReadonlyArray<D>> {
    // Load all the files in the directory.
    const files = await this.reader.read(this.dir)

    // Transform the files into definitions.
    return this.transform(files)
  }
}
