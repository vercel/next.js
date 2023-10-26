import type { Normalizer } from '../normalizer'

import { RSC_PREFETCH_SUFFIX } from '../../../../lib/constants'
import { SuffixPathnameNormalizer } from './suffix'

export class PrefetchRSCPathnameNormalizer implements Normalizer {
  private readonly suffix = new SuffixPathnameNormalizer(RSC_PREFETCH_SUFFIX)

  constructor(private readonly hasAppDir: boolean) {}

  public match(pathname: string) {
    // If there's no app directory, we don't match.
    if (!this.hasAppDir) return false

    return this.suffix.match(pathname)
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If there's no app directory, we don't need to normalize.
    if (!this.hasAppDir) return pathname

    return this.suffix.normalize(pathname, matched)
  }
}
