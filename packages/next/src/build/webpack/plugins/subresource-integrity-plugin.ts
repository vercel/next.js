import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import crypto from 'crypto'
import { SUBRESOURCE_INTEGRITY_MANIFEST } from '../../../shared/lib/constants'

const PLUGIN_NAME = 'SubresourceIntegrityPlugin'

export type SubresourceIntegrityAlgorithm = 'sha256' | 'sha384' | 'sha512'

export class SubresourceIntegrityPlugin {
  constructor(private readonly algorithm: SubresourceIntegrityAlgorithm) {}

  public apply(compiler: webpack.Compiler) {
    compiler.hooks.make.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.afterOptimizeAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
        },
        () => {
          // Collect all the assets.
          let files = new Set<string>()
          for (const asset of compilation.getAssets()) {
            files.add(asset.name)
          }

          // For each file, deduped, calculate the file hash.
          const hashes: Record<string, string> = {}
          for (const file of files.values()) {
            // Get the buffer for the asset.
            const asset = compilation.getAsset(file)
            if (!asset) {
              throw new Error(`could not get asset: ${file}`)
            }

            // Get the buffer for the asset.
            const buffer = asset.source.buffer()

            // Create the hash for the content.
            const hash = crypto
              .createHash(this.algorithm)
              .update(buffer)
              .digest()
              .toString('base64')

            hashes[file] = `${this.algorithm}-${hash}`
          }

          const json = JSON.stringify(hashes, null, 2)
          const file = 'server/' + SUBRESOURCE_INTEGRITY_MANIFEST
          compilation.emitAsset(
            file + '.js',
            new sources.RawSource(
              `self.__SUBRESOURCE_INTEGRITY_MANIFEST=${JSON.stringify(json)}`
              // Work around webpack 4 type of RawSource being used
              // TODO: use webpack 5 type by default
            ) as unknown as webpack.sources.RawSource
          )
          compilation.emitAsset(
            file + '.json',
            new sources.RawSource(
              json
              // Work around webpack 4 type of RawSource being used
              // TODO: use webpack 5 type by default
            ) as unknown as webpack.sources.RawSource
          )
        }
      )
    })
  }
}
