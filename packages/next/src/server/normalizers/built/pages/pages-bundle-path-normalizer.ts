import type { Page } from '../../../../shared/lib/route-types'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import type { Normalizer } from '../../normalizer'
import { Normalizers } from '../../normalizers'
import { PrefixingNormalizer } from '../../prefixing-normalizer'
import { wrapNormalizerFn } from '../../wrap-normalizer-fn'

export class PagesBundlePathNormalizer extends Normalizers<Page, string> {
  constructor() {
    super([
      // Convert the page identifier to its file counterpart.
      wrapNormalizerFn(normalizePagePath),
      // The page should prefixed with `pages/`.
      new PrefixingNormalizer('pages'),
    ])
  }

  public normalize(page: Page): string {
    return super.normalize(page)
  }
}

export class DevPagesBundlePathNormalizer extends Normalizers {
  constructor(pagesNormalizer: Normalizer<string, Page>) {
    super([
      // This should normalize the filename to a page.
      pagesNormalizer,
      // Convert the Pages module identifier to its bundle path.
      new PagesBundlePathNormalizer(),
    ])
  }

  public normalize(filename: string): string {
    return super.normalize(filename)
  }
}
