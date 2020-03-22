import { Compiler } from 'webpack'
import { connectChunkAndModule } from 'webpack/lib/GraphHelpers'
const webpack5Experiential = parseInt(require('webpack').version) === 5

/**
 * Makes sure there are no dynamic chunks when the target is serverless
 * The dynamic chunks are integrated back into their parent chunk
 * This is to make sure there is a single render bundle instead of that bundle importing dynamic chunks
 */

export class ServerlessPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('ServerlessPlugin', compilation => {
      const optimizeHook = webpack5Experiential
        ? compilation.hooks.optimizeChunks
        : compilation.hooks.optimizeChunksBasic

      optimizeHook.tap('ServerlessPlugin', chunks => {
        chunks.forEach(chunk => {
          // If chunk is not an entry point skip them
          if (chunk.hasEntryModule()) {
            const dynamicChunks = chunk.getAllAsyncChunks()
            if (dynamicChunks.size !== 0) {
              for (const dynamicChunk of dynamicChunks) {
                for (const module of dynamicChunk.modulesIterable) {
                  connectChunkAndModule(chunk, module)
                }
              }
            }
          }
        })
      })
    })
  }
}
