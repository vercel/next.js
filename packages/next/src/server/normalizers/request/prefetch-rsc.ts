import type { PathnameNormalizer } from './pathname-normalizer'

import { RSC_PREFETCH_SUFFIX } from '../../../lib/constants'
import { SuffixPathnameNormalizer } from './suffix'

export class PrefetchRSCPathnameNormalizer
  extends SuffixPathnameNormalizer
  implements PathnameNormalizer
{
  constructor() {
    super(RSC_PREFETCH_SUFFIX)
  }

  public match(pathname: string): boolean {
    if (pathname === '/__index' + RSC_PREFETCH_SUFFIX) {
      return true
    }

    return super.match(pathname)
  }

  public normalize(pathname: string, matched?: boolean): string {
    if (pathname === '/__index' + RSC_PREFETCH_SUFFIX) {
      return '/'
    }

    return super.normalize(pathname, matched)
  }
}
