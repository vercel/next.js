import type { ManifestKey, Manifests } from '../manifests'
import type { ManifestLoader } from './manifest-loader'

/**
 * A loader for a manifest (or manifests) that is just a wrapped around an
 * object of manifests.
 */
export class MapManifestLoader<M extends Manifests>
  implements ManifestLoader<M>
{
  constructor(private readonly manifests: M) {}

  public load<K extends ManifestKey<M>>(name: K): M[K] {
    const manifest = this.manifests[name]
    if (!manifest) {
      throw new Error(`Unable to find manifest ${name}`)
    }

    return manifest
  }
}
