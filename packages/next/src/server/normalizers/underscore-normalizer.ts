import type { Page, Route } from '../../shared/lib/route-types'
import type { Normalizer } from './normalizer'

/**
 * UnderscoreNormalizer replaces all instances of %5F with _. It preserves a
 * Page/Route representation, but does not certify extra cache opacity. The
 * string overload also supports non-routing path/filename normalization.
 */
export class UnderscoreNormalizer implements Normalizer {
  public normalize(pathname: Page): Page
  public normalize(pathname: Route): Route
  public normalize(pathname: string): string
  public normalize(pathname: string): string {
    return pathname.replace(/%5F/g, '_')
  }
}
