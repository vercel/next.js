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

        // Creates a new asset holding the concatted source
        compilation.assets[this.output] = concat
      })
    })
  }
}
