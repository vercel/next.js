import { Compiler } from 'webpack'
import { SourceMapSource, RawSource } from 'webpack-sources'
import GraphHelpers from 'webpack/lib/GraphHelpers'

/**
 * Makes sure there are no dynamic chunks when the target is serverless
 * The dynamic chunks are integrated back into their parent chunk
 * This is to make sure there is a single render bundle instead of that bundle importing dynamic chunks
 */

const NEXT_REPLACE_BUILD_ID = '__NEXT_REPLACE__BUILD_ID__'

export class ServerlessPlugin {
  private buildId: string
  private sourceMap: boolean

  constructor(buildId: string, { sourceMap = false } = {}) {
    this.buildId = buildId
    this.sourceMap = sourceMap
  }

  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('ServerlessPlugin', compilation => {
      compilation.hooks.optimizeChunksBasic.tap('ServerlessPlugin', chunks => {
        chunks.forEach(chunk => {
          // If chunk is not an entry point skip them
          if (chunk.hasEntryModule()) {
            const dynamicChunks = chunk.getAllAsyncChunks()
            if (dynamicChunks.size !== 0) {
              for (const dynamicChunk of dynamicChunks) {
                for (const module of dynamicChunk.modulesIterable) {
                  GraphHelpers.connectChunkAndModule(chunk, module)
                }
              }
            }
          }
        })

        compilation.hooks.afterOptimizeChunkAssets.tap(
          'ServerlessPlugin',
          chunks => {
            chunks
              .reduce(
                (acc, chunk) => acc.concat(chunk.files || []),
                [] as any[]
              )
              .forEach(file => {
                const asset = compilation.assets[file]

                let input
                let inputSourceMap

                if (this.sourceMap) {
                  if (asset.sourceAndMap) {
                    const sourceAndMap = asset.sourceAndMap()
                    inputSourceMap = sourceAndMap.map
                    input = sourceAndMap.source
                  } else {
                    inputSourceMap = asset.map()
                    input = asset.source()
                  }
                } else {
                  input = asset.source()
                }

                const output = input.replace(NEXT_REPLACE_BUILD_ID, this.buildId)
                
                if (this.sourceMap && inputSourceMap) {
                  compilation.assets[file] = new SourceMapSource(
                    output,
                    file,
                    inputSourceMap
                  )
                } else {
                  compilation.assets[file] = new RawSource(output)
                }
              })
          }
        )
      })
    })
  }
}
