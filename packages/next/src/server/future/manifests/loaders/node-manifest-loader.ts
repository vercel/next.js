import type { ManifestKey, Manifests } from '../manifests'
import type { ManifestLoader } from './manifest-loader'

import path from 'path'

export class NodeManifestLoader implements ManifestLoader<Manifests> {
  constructor(private readonly dir: string) {}

  public load<K extends ManifestKey<Manifests>>(name: K): Manifests[K] {
    // Load the manifest from the file system
    return require(path.join(this.dir, name))
  }
}
