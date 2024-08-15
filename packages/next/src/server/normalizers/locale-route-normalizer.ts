import type { I18NProvider } from '../lib/i18n-provider'
import type { Normalizer } from './normalizer'

/**
 * Normalizes the pathname by removing the locale prefix if any.
 */
export class LocaleRouteNormalizer implements Normalizer {
  constructor(private readonly provider: I18NProvider) {}

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
