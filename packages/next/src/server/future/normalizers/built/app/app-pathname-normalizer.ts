import { normalizeAppPath } from '../../../../../shared/lib/router/utils/app-paths'
import { Normalizers } from '../../normalizers'
import { wrapNormalizerFn } from '../../wrap-normalizer-fn'
import { UnderscoreNormalizer } from '../../underscore-normalizer'
import type { Normalizer } from '../../normalizer'

export class AppPathnameNormalizer extends Normalizers {
  constructor() {
    super([
      // The pathname to match should have the trailing `/page` and other route
      // group information stripped from it.
      wrapNormalizerFn(normalizeAppPath),
      // The page should have the `%5F` characters replaced with `_` characters.
      new UnderscoreNormalizer(),
    ])
  }

  public normalize(page: string): string {
    return super.normalize(page)
  }
}

export class DevAppPathnameNormalizer extends Normalizers {
  constructor(pageNormalizer: Normalizer) {
    super([
      // This should normalize the filename to a page.
      pageNormalizer,
      // Normalize the app page to a pathname.
      new AppPathnameNormalizer(),
    ])
  }

  public normalize(filename: string): string {
    return super.normalize(filename)
  }
}
