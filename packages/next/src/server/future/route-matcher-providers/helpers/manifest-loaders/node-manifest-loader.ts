import { SERVER_DIRECTORY } from '../../../../../shared/lib/constants'
import path from '../../../../../shared/lib/isomorphic/path'
import type { Manifest, ManifestLoader } from './manifest-loader'

export class NodeManifestLoader implements ManifestLoader {
  constructor(private readonly distDir: string) {}

  static require(id: string) {
    try {
      return require(id)
    } catch {
      return null
    }
  }

  public load(name: string): Manifest | null {
    return NodeManifestLoader.require(
      path.join(this.distDir, SERVER_DIRECTORY, name)
    )
  }
}
