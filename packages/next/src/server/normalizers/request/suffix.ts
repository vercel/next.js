import type { Normalizer } from '../normalizer'

export class SuffixPathnameNormalizer implements Normalizer {
  constructor(private readonly suffix: string) {}

  public match(pathname: string) {
    // If the pathname doesn't end in the suffix, we don't match.
    if (!pathname.endsWith(this.suffix)) return false

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    return pathname.substring(0, pathname.length - this.suffix.length)
  }
}
