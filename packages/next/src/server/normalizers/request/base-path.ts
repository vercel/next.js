import type { PathnameNormalizer } from './pathname-normalizer'

import { PrefixPathnameNormalizer } from './prefix'

export class BasePathPathnameNormalizer
  extends PrefixPathnameNormalizer
  implements PathnameNormalizer
{
  constructor(basePath: string) {
    if (!basePath || basePath === '/') {
      throw new Error('Invariant: basePath must be set and cannot be "/"')
    }

    super(basePath)
  }
}
