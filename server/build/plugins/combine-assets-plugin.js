import { ConcatSource } from 'webpack-sources'

// This plugin combines a set of assets into a single asset
// This should be only used with text assets,
// otherwise the result is unpredictable.
export default class CombineAssetsPlugin {
  constructor ({ input, output }) {
    this.input = input
    this.output = output
  }

  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('after-optimize-chunk-assets', (chunks) => {
        const concat = new ConcatSource()

        this.input.forEach((name) => {
          const asset = compilation.assets[name]
          if (!asset) return

          concat.add(asset)
          // We keep existing assets since that helps when analyzing the bundle
        })

        compilation.additionalChunkAssets.push(this.output)
        compilation.assets[this.output] = concat

        // Register the combined file as an output of the associated chunks
        // chunks.forEach((chunk) => {
          

        //   chunk.files.forEach((file) => {
        //     if(!this.input.includes(file)) {
        //       return
        //     }

        //     const index = chunk.files.indexOf(file)
        //     chunk.files.splice(index, 1)
        //   })

        //   if(chunk.files.length === 0) {
        //     const index = compilation.chunks.indexOf(chunk)
        //     compilation.chunks.splice(index, 1)
        //   }
          
        //   chunk.files.reduce((prev, file) => prev || this.input.includes(file), false)
        // })
      })
    })
  }
}
