import type { Normalizer } from '../normalizer'

export class PrefixPathnameNormalizer implements Normalizer {
  constructor(private readonly prefix: string) {
    if (prefix.endsWith('/')) {
      throw new Error(
        `PrefixPathnameNormalizer: prefix "${prefix}" should not end with a slash`
      )
    }
  }

  public match(pathname: string) {
    // If the pathname doesn't start with the prefix, we don't match.
    if (pathname !== this.prefix && !pathname.startsWith(this.prefix + '/')) {
      return false
    }

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    if (pathname.length === this.prefix.length) {
      return '/'
    }

    return pathname.substring(this.prefix.length)
  }
}
