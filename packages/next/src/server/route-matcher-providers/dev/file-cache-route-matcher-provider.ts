import type { RouteMatcher } from '../../route-matchers/route-matcher'
import { CachedRouteMatcherProvider } from '../helpers/cached-route-matcher-provider'
import type { FileReader } from './helpers/file-reader/file-reader'

/**
 * This will memoize the matchers when the file contents are the same.
 */
export abstract class FileCacheRouteMatcherProvider<
  M extends RouteMatcher = RouteMatcher,
> extends CachedRouteMatcherProvider<M, ReadonlyArray<string>> {
  constructor(dir: string, reader: FileReader) {
    super({
      load: async () => reader.read(dir),
      compare: (left, right) => {
        if (left.length !== right.length) return false

        // Assuming the file traversal order is deterministic...
        for (let i = 0; i < left.length; i++) {
          if (left[i] !== right[i]) return false
        }

        return true
      },
    })
  }
}
