import type { PathnameNormalizer } from './pathname-normalizer'

const prefix = '/_next/postponed/resume'

export class PostponedPathnameNormalizer implements PathnameNormalizer {
  constructor(private readonly ppr: boolean | undefined) {}

  public match(pathname: string) {
    // If PPR isn't enabled, we don't match.
    if (!this.ppr) return false

    // If the pathname doesn't start with the prefix, we don't match.
    if (!pathname.startsWith(prefix)) return false

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If PPR isn't enabled, we don't need to normalize.
    if (!this.ppr) return pathname

    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    // Remove the prefix.
    pathname = pathname.substring(prefix.length) || '/'

    // If the pathname is equal to `/index`, we normalize it to `/`.
    if (pathname === '/index') return '/'

    return pathname
  }
}
