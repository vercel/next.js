import type { ManifestKey, Manifests } from '../manifests'
import type { ManifestLoader } from './manifest-loader'

import { wait } from '../../../../lib/wait'

export class DevManifestLoader<M extends Partial<Manifests> = Manifests>
  implements ManifestLoader<M>
{
  constructor(
    private readonly loader: ManifestLoader<M>,
    private readonly maxRetries: number = 3,
    private readonly retryDelay: number = 100
  ) {}

  public async load<K extends ManifestKey<M>>(name: K): Promise<M[K]> {
    let error: unknown

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Try to load the manifest...
        const manifest = await this.loader.load(name)
        if (manifest) return manifest
      } catch (err) {
        // It failed, so let's save the error and retry...
        error = err
      }

      await wait(this.retryDelay)
    }

    throw error
  }
}
