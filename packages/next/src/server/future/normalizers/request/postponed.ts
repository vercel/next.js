import type { Normalizer } from '../normalizer'

export class PostponedPathnameNormalizer implements Normalizer {
  constructor(private readonly ppr: boolean | undefined) {}

  public match(pathname: string) {
    // If PPR isn't enabled, we don't match.
    if (!this.ppr) return false

    // If the pathname doesn't start with the prefix, we don't match.
    if (!pathname.startsWith('/_next/postponed')) return false

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If PPR isn't enabled, we don't need to normalize.
    if (!this.ppr) return pathname

    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    // Remove the prefix.
    pathname = pathname.substring('/_next/postponed'.length) || '/'

    // If the pathname is equal to `/index`, we normalize it to `/`.
    if (pathname === '/index') return '/'

    return pathname
  }
}
