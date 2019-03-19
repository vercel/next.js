import GraphHelpers from 'webpack/lib/GraphHelpers'
import { Compiler, Plugin } from 'webpack'

export class StyleMergePlugin implements Plugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('StyleMergePlugin', compilation => {
      compilation.hooks.afterOptimizeChunks.tap('StyleMergePlugin', chunks => {
        const stylesChunk = chunks.find(chunk => chunk.name === 'styles')
        const mainChunk = chunks.find(chunk => chunk.name === 'static/runtime/main.js')

        if(stylesChunk && mainChunk) {
          for (const mod of stylesChunk.modulesIterable) {
            GraphHelpers.connectChunkAndModule(mainChunk, mod)
          }
          stylesChunk.remove('empty')
        }
      })
    })
  }
}
