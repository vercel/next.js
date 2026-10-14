import type { Page } from '../../../../shared/lib/route-types'
import { Normalizers } from '../../normalizers'
import type { Normalizer } from '../../normalizer'
import { PrefixingNormalizer } from '../../prefixing-normalizer'
import { normalizePagePath } from '../../../../shared/lib/page-path/normalize-page-path'
import { UnderscoreNormalizer } from '../../underscore-normalizer'

export class AppBundlePathNormalizer extends PrefixingNormalizer {
  constructor() {
    super('app')
  }

  public normalize(page: Page): string {
    return super.normalize(normalizePagePath(page))
  }
}

export class DevAppBundlePathNormalizer extends Normalizers {
  constructor(pageNormalizer: Normalizer<string, Page>, isTurbopack: boolean) {
    const normalizers: Normalizer[] = [
      // This should normalize the filename to a page.
      pageNormalizer,
      // Normalize the app page to a bundle path.
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
