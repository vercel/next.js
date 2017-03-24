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
      let newSource = ''
      this.input.forEach((name) => {
        newSource += `${compilation.assets[name].source()}\n`
        delete compilation.assets[name]
      })

      compilation.assets[this.output] = {
        source: () => newSource,
        size: () => newSource.length
      }

      callback()
    })
  }
}
