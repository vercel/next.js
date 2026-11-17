module.exports = function (source) {
  const { outputPath = 'static/media' } = this.getOptions()
  this.emitFile(`${outputPath}/css.txt`, 'css-emitted-content')
  return source
}
