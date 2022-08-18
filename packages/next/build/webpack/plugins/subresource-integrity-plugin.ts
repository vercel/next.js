import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import crypto from 'crypto'
import { SUBRESOURCE_INTEGRITY_MANIFEST } from '../../../shared/lib/constants'

const PLUGIN_NAME = 'SubresourceIntegrityPlugin'

export type SubresourceIntegrityAlgorithm = 'sha256' | 'sha384' | 'sha512'

export class SubresourceIntegrityPlugin {
  constructor(private readonly algorithm: SubresourceIntegrityAlgorithm) {}

  public apply(compiler: any) {
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation: any) => {
      compilation.hooks.afterOptimizeAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        (assets: any) => this.createAsset(assets, compilation)
      )
    })
  }

  private createAsset(assets: any, compilation: webpack.Compilation) {
    // Collect all the entrypoint files.
    let files = new Set<string>()
    for (const entrypoint of compilation.entrypoints.values()) {
      const iterator = entrypoint?.getFiles()
      if (!iterator) {
        continue
      }

      for (const file of iterator) {
        files.add(file)
      }
    }

    // For each file, deduped, calculate the file hash.
    const hashes: Record<string, string> = {}
    for (const file of files.values()) {
      // Get the buffer for the asset.
      const content = assets[file].buffer()

      // Create the hash for the content.
      const hash = crypto
        .createHash(this.algorithm)
        .update(content)
        .digest()
        .toString('base64')

      hashes[file] = `${this.algorithm}-${hash}`
    }

    const json = JSON.stringify(hashes, null, 2)
    assets[SUBRESOURCE_INTEGRITY_MANIFEST] = new sources.RawSource(json)
  }
}
