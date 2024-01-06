import { denormalizePagePath } from '../../../../shared/lib/page-path/denormalize-page-path'
import type { PathnameNormalizer } from './pathname-normalizer'

import { PrefixPathnameNormalizer } from './prefix'

const prefix = '/_next/postponed/resume'

export class PostponedPathnameNormalizer
  extends PrefixPathnameNormalizer
  implements PathnameNormalizer
{
  constructor() {
    super(prefix)
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    // Remove the prefix.
    pathname = super.normalize(pathname, true)

    return denormalizePagePath(pathname)
  }
}
