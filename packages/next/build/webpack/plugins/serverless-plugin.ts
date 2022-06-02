import { webpack } from 'next/dist/compiled/webpack/webpack'

/**
 * Makes sure there are no dynamic chunks when the target is serverless
 * The dynamic chunks are integrated back into their parent chunk
 * This is to make sure there is a single render bundle instead of that bundle importing dynamic chunks
 */

export class ServerlessPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('ServerlessPlugin', (compilation) => {
      const hook = compilation.hooks.optimizeChunks

      hook.tap('ServerlessPlugin', (chunks) => {
        for (const chunk of chunks) {
          // If chunk is not an entry point skip them
          // @ts-ignore TODO: Remove ignore when webpack 5 is stable
          if (compilation.chunkGraph.getNumberOfEntryModules(chunk) === 0) {
            continue
          }

          // Async chunks are usages of import() for example
          const dynamicChunks = chunk.getAllAsyncChunks()
          for (const dynamicChunk of dynamicChunks) {
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            for (const module of compilation.chunkGraph.getChunkModulesIterable(
              dynamicChunk
            )) {
              // Add module back into the entry chunk
              // @ts-ignore TODO: Remove ignore when webpack 5 is stable
              if (!compilation.chunkGraph.isModuleInChunk(module, chunk)) {
                // @ts-ignore TODO: Remove ignore when webpack 5 is stable
                compilation.chunkGraph.connectChunkAndModule(chunk, module)
              }
            }
          }
        }
      })
    })
  }
}
