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
      compilation.plugin('optimize-chunk-assets', (chunks, callback) => {
        const concat = new ConcatSource()

        this.input.forEach((name) => {
          const asset = compilation.assets[name]
          if (!asset) return

          concat.add(asset)

          // We keep existing assets since that helps when analyzing the bundle
        })

        compilation.assets[this.output] = concat

        callback()
      })
    })
  }
}
