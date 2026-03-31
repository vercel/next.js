import type { Normalizer } from './normalizer'

/**
 * UnderscoreNormalizer replaces all instances of %5F with _.
 */
export class UnderscoreNormalizer implements Normalizer {
  public normalize(pathname: string): string {
    return pathname.replace(/%5F/g, '_')
  }
}
