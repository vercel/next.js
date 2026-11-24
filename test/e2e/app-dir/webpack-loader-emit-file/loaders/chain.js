const path = require('path')

module.exports = function (source) {
  const name = path.basename(this.resourcePath, '.emit')
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/${name}.chain`, 'chain-content')
  return source
}
