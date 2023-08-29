import { Normalizer } from './normalizer'

/**
 * Normalizes trailing slashes in the URL by adding a trailing slash if it's
 * missing.
 */
export class TrailingSlashNormalizer implements Normalizer {
  public normalize(pathname: string): string {
    if (pathname === '/' || pathname.endsWith('/')) {
      return pathname
    }

    return pathname + '/'
  }
}
