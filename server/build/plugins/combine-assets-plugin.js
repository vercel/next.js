import Concat from 'concat-with-sourcemaps'

// This plugin combines a set of assets into a single asset
// This should be only used with text assets,
// otherwise the result is unpredictable.
export default class CombineAssetsPlugin {
  constructor ({ input, output }) {
    this.input = input
    this.output = output
  }

  apply (compiler) {
    compiler.plugin('after-compile', (compilation, callback) => {
      const concat = new Concat(true, this.output, '\n')

      this.input.forEach((name) => {
        const asset = compilation.assets[name]
        const sourceMap = compilation.assets[`${name}.map`]
        if (!asset) return

        concat.add(name, asset.source(), sourceMap && sourceMap.source())

        // We keep existing assets since that helps when analyzing the bundle
      })

      concat.add(null, `//# sourceMappingURL=${this.output}.map\n`)

      compilation.assets[this.output] = {
        size: () => concat.content.length,
        source: () => concat.content
      }
      compilation.assets[`${this.output}.map`] = {
        size: () => concat.sourceMap.length,
        source: () => concat.sourceMap
      }

      callback()
    })
  }
}
