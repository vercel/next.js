import type { ManifestKey, Manifests } from '../manifests'

/**
 * A loader for a manifest (or manifests).
 */
export interface ManifestLoader<M extends Partial<Manifests>> {
  load<K extends ManifestKey<M>>(name: K): PromiseLike<M[K]> | M[K]
}
