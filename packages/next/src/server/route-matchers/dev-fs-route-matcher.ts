import { Normalizer } from '../normalizers/normalizer'
import { RouteKind } from '../route-kind'
import { FileReader } from './file-reader/file-reader'
import { DefaultFileReader } from './file-reader/default-file-reader'
import { RouteDefinition, RouteMatcher } from './route-matcher'

type FilterFn = (filename: string) => boolean

interface Options<K extends RouteKind> {
  /**
   * The directory to load the files from.
   */
  dir: string

  /**
   * The filter to include the files matched by this matcher.
   */
  filter: FilterFn

  /**
   * The normalizer that transforms the absolute filename to page.
   */
  pageNormalizer: Normalizer

  /**
   * The normalizer that transforms the absolute filename to a request pathname.
   */
  pathnameNormalizer: Normalizer

  /**
   * The normalizer that transforms the absolute filename to a bundle path.
   */
  bundlePathNormalizer: Normalizer

  /**
   * The kind of route definitions to emit.
   */
  kind: K

  /**
   * The reader implementation that provides the files from the directory.
   * Defaults to a reader which uses the filesystem.
   */
  reader?: FileReader
}

export class DevFSRouteMatcher<K extends RouteKind> implements RouteMatcher<K> {
  private readonly dir: string
  private readonly filter: FilterFn
  private readonly pageNormalizer: Normalizer
  private readonly pathnameNormalizer: Normalizer
  private readonly bundlePathNormalizer: Normalizer
  private readonly kind: K
  private readonly reader: FileReader

  constructor({
    dir,
    filter,
    pageNormalizer,
    pathnameNormalizer,
    bundlePathNormalizer,
    kind,
    reader = new DefaultFileReader(),
  }: Options<K>) {
    this.dir = dir
    this.filter = filter
    this.pageNormalizer = pageNormalizer
    this.pathnameNormalizer = pathnameNormalizer
    this.bundlePathNormalizer = bundlePathNormalizer
    this.kind = kind
    this.reader = reader
  }

  public async routes(): Promise<ReadonlyArray<RouteDefinition<K>>> {
    // Read the files in the directory...
    let files: ReadonlyArray<string>

    try {
      files = await this.reader.read(this.dir)
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // This can only happen when the underlying directory was removed.
        return []
      }

      throw err
    }

    return (
      files
        // Filter the files by the provided filter...
        .filter(this.filter)
        .reduce<Array<RouteDefinition<K>>>((routes, filename) => {
          // Normalize the filename into a pathname.
          const pathname = this.pathnameNormalizer.normalize(filename)

          // If the route was already added, then don't add it again.
          if (routes.find((r) => r.pathname === pathname)) return routes

          routes.push({
            kind: this.kind,
            filename,
            pathname,
            page: this.pageNormalizer.normalize(filename),
            bundlePath: this.bundlePathNormalizer.normalize(filename),
          })

          return routes
        }, [])
    )
  }
}
