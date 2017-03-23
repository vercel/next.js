export default class CombineAssetsPlugin {
  apply (compiler) {
    compiler.plugin('after-compile', (compilation, callback) => {
      const input = [
        'commons.js',
        'main.js'
      ]
      const output = 'app.js'

      let newSource = ''
      input.forEach((name) => {
        newSource += `${compilation.assets[name].source()}\n`
        delete compilation.assets[name]
      })

      compilation.assets[output] = {
        source: () => newSource,
        size: () => newSource.length
      }

      callback()
    })
  }
}
