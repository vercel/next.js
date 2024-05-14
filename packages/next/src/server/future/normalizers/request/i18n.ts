import type { I18NProvider } from '../../helpers/i18n-provider'
import type { PathnameNormalizer } from './pathname-normalizer'

/**
 * Normalizes the pathname by removing the locale prefix if any.
 */
export class I18nPathnameNormalizer implements PathnameNormalizer {
  constructor(private readonly provider: I18NProvider) {}

  /**
   * Returns true if the pathname has a locale prefix.
   *
   * @param pathname The pathname to test.
   * @returns True if the pathname has a locale prefix.
   */
  public match(pathname: string): boolean {
    return this.provider.analyze(pathname).pathname !== pathname
  }

  /**
   * Normalizes the pathname by removing the locale prefix if any.
   *
   * @param pathname The pathname to normalize.
   * @returns The pathname without the locale prefix (if any).
   */
  public normalize(pathname: string): string {
    const match = this.provider.analyze(pathname)
    return match.pathname
  }
}
