import { Compiler } from 'webpack'
import webpack from 'webpack'
const isWebpack5 = parseInt(webpack.version!) === 5

let ChunkGraph = isWebpack5
  ? require('webpack/lib/ChunkGraph')
  : require('webpack/lib/GraphHelpers')

/**
 * Makes sure there are no dynamic chunks when the target is serverless
 * The dynamic chunks are integrated back into their parent chunk
 * This is to make sure there is a single render bundle instead of that bundle importing dynamic chunks
 */

export class ServerlessPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('ServerlessPlugin', (compilation) => {
      const hook = isWebpack5
        ? compilation.hooks.optimizeChunks
        : compilation.hooks.optimizeChunksBasic

      hook.tap('ServerlessPlugin', (chunks) => {
        chunks.forEach((chunk) => {
          // If chunk is not an entry point skip them
          if (chunk.hasEntryModule()) {
            const dynamicChunks = chunk.getAllAsyncChunks()
            if (dynamicChunks.size !== 0) {
              for (const dynamicChunk of dynamicChunks) {
                for (const module of dynamicChunk.modulesIterable) {
                  let chunkGraph = ChunkGraph
                  if (isWebpack5) {
                    chunkGraph = ChunkGraph.getChunkGraphForChunk(chunk)
                    if (chunkGraph.isModuleInChunk(module, chunk)) return false
                  }
                  chunkGraph.connectChunkAndModule(chunk, module)
                }
              }
            }
          }
        })
      })
    })
  }
}
