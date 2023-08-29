import path from '../../../shared/lib/isomorphic/path'
import { Normalizer } from './normalizer'

export type PathPrefixInfo = {
  /**
   * The pathname without the prefix.
   */
  pathname: string

  /**
   * True if the pathname had the prefix.
   */
  hadPrefix: boolean
}

export class PathPrefixNormalizer implements Normalizer {
  constructor(public readonly prefix: string) {}

  public analyze(pathname: string): PathPrefixInfo {
    const hadPrefix =
      pathname === this.prefix || pathname.startsWith(this.prefix + '/')

    return {
      pathname: hadPrefix
        ? pathname.slice(this.prefix.length) || '/'
        : pathname,
      hadPrefix: hadPrefix,
    }
  }

  public normalize(pathname: string): string {
    const { pathname: normalized } = this.analyze(pathname)
    return normalized
  }

  public denormalize(pathname: string): string {
    if (pathname === '/') {
      return this.prefix
    }

    return path.posix.join(this.prefix, pathname)
  }
}
