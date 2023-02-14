import path from 'path'
import { Normalizer } from './normalizer'

export class PrefixingNormalizer implements Normalizer {
  constructor(private readonly prefix: string) {}

  public normalize(pathname: string): string {
    return path.posix.join(this.prefix, pathname)
  }
}
