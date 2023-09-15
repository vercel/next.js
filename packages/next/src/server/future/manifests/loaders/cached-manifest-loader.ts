import type { ManifestKey, Manifests } from '../manifests'
import type { ManifestLoader } from './manifest-loader'

/**
 * A cached manifest loader that will cache the manifest after it has been
 * loaded once. This prevents the manifest from being loaded multiple times
 * during a single request, or the underlying loader from being called
 * multiple times.
 */
export class CachedManifestLoader<M extends Partial<Manifests> = Manifests>
  implements ManifestLoader<M>
{
  private readonly cache = new Map<string, M[ManifestKey<M>]>()

  constructor(private readonly loader: ManifestLoader<M>) {}

  public async load<K extends ManifestKey<M>>(name: K): Promise<M[K]> {
    const cached = await this.cache.get(name)
    if (cached) return cached as M[K]

    const manifest = this.loader.load(name)
    this.cache.set(name, manifest as M[K])

    return manifest
  }
}
