import { Normalizers } from '../../normalizers'
import type { Normalizer } from '../../normalizer'
import { PrefixingNormalizer } from '../../prefixing-normalizer'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { UnderscoreNormalizer } from '../../underscore-normalizer'

export class AppBundlePathNormalizer extends PrefixingNormalizer {
  constructor() {
    super('app')
  }

  public normalize(page: string): string {
    return super.normalize(normalizePagePath(page))
  }
}

export class DevAppBundlePathNormalizer extends Normalizers {
  constructor(pageNormalizer: Normalizer, isTurbopack: boolean) {
    const normalizers = [
      // This should normalize the filename to a page.
      pageNormalizer,
      // Normalize the app page to a pathname.
      new AppBundlePathNormalizer(),
    ]

    // %5F to _ replacement should only happen with Turbopack.
    if (isTurbopack) {
      normalizers.unshift(new UnderscoreNormalizer())
    }
    super(normalizers)
  }

  public normalize(filename: string): string {
    return super.normalize(filename)
  }
}
