import { SERVER_DIRECTORY } from '../../../../../shared/lib/constants'
import path from '../../../../../shared/lib/isomorphic/path'
import { Manifest, ManifestLoader } from './manifest-loader'

export class NodeManifestLoader implements ManifestLoader {
  constructor(private readonly distDir: string) {}

  static require(id: string) {
    try {
      return require(id)
    } catch (err: any) {
      // If a manifest can't be found, we should gracefully fail by returning
      // null.
      if (err.code === 'MODULE_NOT_FOUND') {
        return null
      }

      throw err
    }
  }

  public load(name: string): Manifest | null {
    return NodeManifestLoader.require(
      path.join(this.distDir, SERVER_DIRECTORY, name)
    )
  }
}
