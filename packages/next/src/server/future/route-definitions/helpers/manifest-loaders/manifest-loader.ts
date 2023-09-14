import type { MiddlewareManifest } from '../../../../../build/webpack/plugins/middleware-plugin'
import type { PagesManifest } from '../../../../../build/webpack/plugins/pages-manifest-plugin'
import type {
  APP_PATHS_MANIFEST,
  MIDDLEWARE_MANIFEST,
  PAGES_MANIFEST,
} from '../../../../../shared/lib/constants'

export interface ManifestsLoader<M> {
  load<K extends keyof M>(name: K): M[K] | null
}

export interface ManifestLoader<N, M> {
  load(name: N): M | null
}

export type PagesManifestLoader = ManifestLoader<
  typeof PAGES_MANIFEST,
  PagesManifest
>

export type MiddlewareManifestLoader = ManifestLoader<
  typeof MIDDLEWARE_MANIFEST,
  MiddlewareManifest
>

export type AppPathsManifestLoader = ManifestLoader<
  typeof APP_PATHS_MANIFEST,
  PagesManifest
>
