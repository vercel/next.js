import { Normalizer } from './normalizer'

/**
 * UnderscoreNormalizer replaces all instances of %40 with @.
 */
export class AtNormalizer implements Normalizer {
  public normalize(pathname: string): string {
    return pathname.replace(/%40/g, '@')
  }
}
