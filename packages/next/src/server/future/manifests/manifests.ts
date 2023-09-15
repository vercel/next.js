import type { MiddlewareManifest } from '../../../build/webpack/plugins/middleware-plugin'
import type { PagesManifest } from '../../../build/webpack/plugins/pages-manifest-plugin'
import type {
  APP_PATHS_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
} from '../../../shared/lib/constants'

/**
 * The manifests that are available to load for Next.js.
 */
export type Manifests = {
  [PAGES_MANIFEST]: PagesManifest
  [APP_PATHS_MANIFEST]: PagesManifest
  [MIDDLEWARE_MANIFEST]: MiddlewareManifest
}

/**
 * The keys within a manifest.
 */
export type ManifestKey<M extends Partial<Manifests>> = string & keyof M

/**
 * The Pages manifest file that contains the mapping of pages to their
 * bundles within the `pages/` directory.
 */
export type PagesManifests = Pick<Manifests, typeof PAGES_MANIFEST>

/**
 * The middleware manifest file that contains the mapping of middleware
 * to their bundles along with details on the middleware. This applies to all
 * edge functions as well.
 */
export type MiddlewareManifests = Pick<Manifests, typeof MIDDLEWARE_MANIFEST>

/**
 * The app paths manifest file that contains the mapping of app routes to their
 * bundles within the `app/` directory.
 */
export type AppPathManifests = Pick<Manifests, typeof APP_PATHS_MANIFEST>
