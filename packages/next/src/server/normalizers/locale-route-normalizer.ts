import type { Route } from '../../shared/lib/route-types'
import type { I18NProvider } from '../lib/i18n-provider'
import type { Normalizer } from './normalizer'

/**
 * Normalizes the pathname by removing the locale prefix if any.
 */
export class LocaleRouteNormalizer implements Normalizer<Route, Route> {
  constructor(private readonly provider: I18NProvider) {}

  /**
   * Normalizes the pathname by removing the locale prefix if any.
   *
   * @param pathname The pathname to normalize.
   * @returns The pathname without the locale prefix (if any).
   */
  public normalize(pathname: Route): Route {
    const match = this.provider.analyze(pathname)
    return match.pathname
  }
}
