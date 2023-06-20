import { Normalizers } from '../../normalizers'
import { Normalizer } from '../../normalizer'
import { PrefixingNormalizer } from '../../prefixing-normalizer'

export class AppBundlePathNormalizer extends PrefixingNormalizer {
  constructor() {
    super('app')
  }

  public normalize(page: string): string {
    return super.normalize(page)
  }
}

export class DevAppBundlePathNormalizer extends Normalizers {
  constructor(pageNormalizer: Normalizer) {
    super([
      // This should normalize the filename to a page.
      pageNormalizer,
      // Normalize the app page to a pathname.
      new AppBundlePathNormalizer(),
    ])
  }

  public normalize(filename: string): string {
    return super.normalize(filename)
  }
}
