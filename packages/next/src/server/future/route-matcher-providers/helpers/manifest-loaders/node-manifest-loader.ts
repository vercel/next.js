import path from 'path'
import { SERVER_DIRECTORY } from '../../../../../shared/lib/constants'
import { Manifest, ManifestLoader } from './manifest-loader'

export class NodeManifestLoader implements ManifestLoader {
  constructor(private readonly distDir: string) {}

  public async load(name: string): Promise<Manifest | null> {
    try {
      return await require(path.join(this.distDir, SERVER_DIRECTORY, name))
    } catch (err: any) {
      // If a manifest can't be found, we should gracefully fail by returning
      // null.
      if (err.code === 'MODULE_NOT_FOUND') {
        return null
      }

      throw err
    }
  }
}
