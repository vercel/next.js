import type { Normalizer } from '../normalizer'

export class BasePathPathnameNormalizer implements Normalizer {
  private readonly basePath?: string
  constructor(basePath: string) {
    // A basePath of `/` is not a basePath.
    if (!basePath || basePath === '/') return

    this.basePath = basePath
  }

  public match(pathname: string) {
    // If there's no basePath, we don't match.
    if (!this.basePath) return false

    // If the pathname doesn't start with the basePath, we don't match.
    if (pathname !== this.basePath && !pathname.startsWith(this.basePath + '/'))
      return false

    return true
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If there's no basePath, we don't need to normalize.
    if (!this.basePath) return pathname

    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    return pathname.substring(this.basePath.length)
  }
}
