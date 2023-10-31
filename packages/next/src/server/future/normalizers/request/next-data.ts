import type { Normalizer } from '../normalizer'

export class NextDataPathnameNormalizer implements Normalizer {
  private readonly prefix: string
  constructor(buildID: string) {
    if (!buildID) {
      throw new Error('Invariant: buildID is required')
    }

    this.prefix = `/_next/data/${buildID}`
  }

  public match(pathname: string) {
    // If the pathname doesn't start with the prefix, we don't match.
    if (!pathname.startsWith(`${this.prefix}/`)) return false

    // If the pathname ends with `.json`, we don't match.
    if (!pathname.endsWith('.json')) return false

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    // Remove the prefix and the `.json` extension.
    pathname = pathname.substring(
      this.prefix.length,
      pathname.length - '.json'.length
    )

    // If the pathname is `/index`, we normalize it to `/`.
    if (pathname === '/index') {
      return '/'
    }

    return pathname
  }
}
