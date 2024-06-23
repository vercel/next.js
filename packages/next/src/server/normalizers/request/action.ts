import type { PathnameNormalizer } from './pathname-normalizer'

import { ACTION_SUFFIX } from '../../../lib/constants'
import { SuffixPathnameNormalizer } from './suffix'

export class ActionPathnameNormalizer
  extends SuffixPathnameNormalizer
  implements PathnameNormalizer
{
  constructor() {
    super(ACTION_SUFFIX)
  }
}
