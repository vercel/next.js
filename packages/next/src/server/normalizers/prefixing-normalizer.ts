import path from '../../shared/lib/isomorphic/path'
import type { Normalizer } from './normalizer'

export class PrefixingNormalizer implements Normalizer {
  private readonly prefix: string

  constructor(...prefixes: ReadonlyArray<string>) {
    this.prefix = path.posix.join(...prefixes)
  }

  public normalize(pathname: string): string {
    return path.posix.join(this.prefix, pathname)
  }
}
