import { RSC_SUFFIX } from '../../../../lib/constants'
import type { Normalizer } from '../normalizer'

export class RSCPathnameNormalizer implements Normalizer {
  constructor(private readonly hasAppDir: boolean) {}

  public match(pathname: string) {
    // If there's no app directory, we don't match.
    if (!this.hasAppDir) return false

    // If the pathname doesn't end in `.rsc`, we don't match.
    if (!pathname.endsWith(RSC_SUFFIX)) return false

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If there's no app directory, we don't need to normalize.
    if (!this.hasAppDir) return pathname

    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    return pathname.substring(0, pathname.length - 4)
  }
}
