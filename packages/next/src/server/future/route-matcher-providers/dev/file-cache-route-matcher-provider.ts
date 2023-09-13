import type { FileReader } from '../../helpers/file-reader/file-reader'

import { RouteMatcher } from '../../route-matchers/route-matcher'
import { CachedRouteMatcherProvider } from '../helpers/cached-route-matcher-provider'

/**
 * This will memoize the matchers when the file contents are the same.
 */
export abstract class FileCacheRouteMatcherProvider<
  M extends RouteMatcher = RouteMatcher
> extends CachedRouteMatcherProvider<M, ReadonlyArray<string>> {
  constructor(
    private readonly dir: string,
    private readonly reader: FileReader,
    private readonly recursive: boolean
  ) {
    super()
  }

  protected abstract filter(filename: string): boolean

  protected async load(): Promise<ReadonlyArray<string>> {
    const files = []

    // Iterate over the files, if the file is a match, then add it to the list.
    for await (const file of this.reader.read(this.dir, {
      recursive: this.recursive,
    })) {
      if (!this.filter(file)) continue

      files.push(file)
    }

    return files
  }

  protected compare(left: ReadonlyArray<string>, right: ReadonlyArray<string>) {
    if (left.length !== right.length) return false

    // Assuming the file traversal order is deterministic...
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false
    }

    return true
  }
}
