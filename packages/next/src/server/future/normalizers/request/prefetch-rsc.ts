import type { PathnameNormalizer } from './pathname-normalizer'

import { RSC_PREFETCH_SUFFIX } from '../../../../lib/constants'
import { SuffixPathnameNormalizer } from './suffix'

export class PrefetchRSCPathnameNormalizer
  extends SuffixPathnameNormalizer
  implements PathnameNormalizer
{
  constructor() {
    super(RSC_PREFETCH_SUFFIX)
  }
}
