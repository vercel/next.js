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
      // This is triggered after uglify and other optimizers have ran.
      compilation.plugin('after-optimize-chunk-assets', (chunks) => {
        const concat = new ConcatSource()

        this.input.forEach((name) => {
          const asset = compilation.assets[name]
          if (!asset) return

          // We add each matched asset from this.input to a new bundle
          concat.add(asset)
          // The original assets are kept because they show up when analyzing the bundle using webpack-bundle-analyzer
          // See https://github.com/zeit/next.js/tree/canary/examples/with-webpack-bundle-analyzer
        })

        // Creates a new asset holding the concatted source
        compilation.assets[this.output] = concat
      })
    })
  }
}
