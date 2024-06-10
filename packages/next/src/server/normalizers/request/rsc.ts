import type { PathnameNormalizer } from './pathname-normalizer'

import { RSC_SUFFIX } from '../../../lib/constants'
import { SuffixPathnameNormalizer } from './suffix'

export class RSCPathnameNormalizer
  extends SuffixPathnameNormalizer
  implements PathnameNormalizer
{
  constructor() {
    super(RSC_SUFFIX)
  }
}
