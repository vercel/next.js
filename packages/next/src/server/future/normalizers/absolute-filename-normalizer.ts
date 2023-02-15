import path from '../../../shared/lib/isomorphic/path'
import { ensureLeadingSlash } from '../../../shared/lib/page-path/ensure-leading-slash'
import { normalizePathSep } from '../../../shared/lib/page-path/normalize-path-sep'
import { removePagePathTail } from '../../../shared/lib/page-path/remove-page-path-tail'
import { Normalizer } from './normalizer'

/**
 * Normalizes a given filename so that it's relative to the provided directory.
 * It will also strip the extension (if provided) and the trailing `/index`.
 */
export class AbsoluteFilenameNormalizer implements Normalizer {
  /**
   *
   * @param dir the directory for which the files should be made relative to
   * @param extensions the extensions the file could have
   * @param keepIndex when `true` the trailing `/index` is _not_ removed
   */
  constructor(
    private readonly dir: string,
    private readonly extensions: ReadonlyArray<string>
  ) {}

  public normalize(pathname: string): string {
    return removePagePathTail(
      normalizePathSep(ensureLeadingSlash(path.relative(this.dir, pathname))),
      {
        extensions: this.extensions,
        keepIndex: false,
      }
    )
  }
}
