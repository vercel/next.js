import type { Normalizer } from './normalizer'

import { Normalizers } from './normalizers'
import { wrapNormalizerFn } from './wrap-normalizer-fn'
import { ensureLeadingSlash } from '../../../shared/lib/page-path/ensure-leading-slash'
import { removeTrailingSlash } from '../../../shared/lib/router/utils/remove-trailing-slash'
import { MatchOptions } from '../route-matchers/managers/route-matcher-manager'

export type NormalizedMatchOptions = {
  readonly pathname: string
  readonly options: Readonly<MatchOptions>
}

export class MatchOptionsNormalizer
  implements Normalizer<NormalizedMatchOptions>
{
  private static pathname = new Normalizers([
    wrapNormalizerFn(ensureLeadingSlash),
    wrapNormalizerFn(removeTrailingSlash),
  ])

  public normalize({
    pathname,
    options,
  }: NormalizedMatchOptions): NormalizedMatchOptions {
    // Ensure that any trailing slashes are removed as well as adding a leading
    // slash if it doesn't have one.
    pathname = MatchOptionsNormalizer.pathname.normalize(pathname)

    // If the locale information is available on the options, then we need to
    // normalize the pathname for matching as well.
    let { i18n } = options
    if (i18n) {
      i18n = {
        ...i18n,
        pathname: MatchOptionsNormalizer.pathname.normalize(i18n.pathname),
      }
    }

    // Create a new options object so we don't mutate the original.
    options = { ...options, i18n }

    return { pathname, options }
  }
}
