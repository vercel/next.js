import { absolutePathToPage } from '../../../shared/lib/page-path/absolute-path-to-page'
import { Normalizer } from './normalizer'

/**
 * Normalizes a given filename so that it's relative to the provided directory.
 * It will also strip the extension (if provided) and the trailing `/index`.
 */
export class AbsoluteFilenameNormalizer implements Normalizer {
  /**
   *
   * @param dir the directory for which the files should be made relative to
   * @param pageExtensions the extensions the file could have
   * @param keepIndex when `true` the trailing `/index` is _not_ removed
   */
  constructor(
    private readonly dir: string,
    private readonly pageExtensions: ReadonlyArray<string>,
    private readonly pagesType: 'pages' | 'app' | 'root'
  ) {}

  public normalize(filename: string): string {
    return absolutePathToPage(filename, {
      pageExtensions: this.pageExtensions,
      keepIndex: false,
      dir: this.dir,
      pagesType: this.pagesType,
    })
  }
}
