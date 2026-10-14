import type { Page, Route } from '../../shared/lib/route-types'
import type { PAGE_TYPES } from '../../lib/page-types'
import { absolutePathToPage } from '../../shared/lib/page-path/absolute-path-to-page'
import type { Normalizer } from './normalizer'

/**
 * Normalizes a given filename so that it's relative to the provided directory.
 * It will also strip the extension (if provided) and the trailing `/index`.
 */
// Pages-router filename discovery can produce either the page identifier or
// the identical URL route representation; app filename discovery produces Page.
export class AbsoluteFilenameNormalizer<Output extends Page | Route = Page>
  implements Normalizer<string, Output>
{
  /**
   *
   * @param dir the directory for which the files should be made relative to
   * @param extensions the extensions the file could have
   * @param keepIndex when `true` the trailing `/index` is _not_ removed
   */
  constructor(
    private readonly dir: string,
    private readonly extensions: ReadonlyArray<string>,
    private readonly pagesType: PAGE_TYPES
  ) {}

  public normalize(filename: string): Output {
    return absolutePathToPage(filename, {
      extensions: this.extensions,
      keepIndex: false,
      dir: this.dir,
      pagesType: this.pagesType,
    }) as string as Output
  }
}
