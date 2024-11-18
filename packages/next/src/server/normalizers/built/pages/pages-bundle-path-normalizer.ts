import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import type { Normalizer } from '../../normalizer'
import { Normalizers } from '../../normalizers'
import { PrefixingNormalizer } from '../../prefixing-normalizer'
import { wrapNormalizerFn } from '../../wrap-normalizer-fn'

export class PagesBundlePathNormalizer extends Normalizers {
  constructor() {
    super([
      // The bundle path should have the trailing `/index` stripped from
      // it.
      wrapNormalizerFn(normalizePagePath),
      // The page should prefixed with `pages/`.
      new PrefixingNormalizer('pages'),
    ])
  }

  public normalize(page: string): string {
    return super.normalize(page)
  }
}

export class DevPagesBundlePathNormalizer extends Normalizers {
  constructor(pagesNormalizer: Normalizer) {
    super([
      // This should normalize the filename to a page.
      pagesNormalizer,
      // Normalize the app page to a pathname.
      new PagesBundlePathNormalizer(),
    ])
  }

  public normalize(filename: string): string {
    return super.normalize(filename)
  }
}
