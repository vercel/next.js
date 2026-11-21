module.exports = function (source) {
  if (!this.resourcePath.includes('server.emit')) return source
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/server-extra.txt`, 'extra-rule-content')
  this.emitFile(`${outputPath}/server.overwrite`, 'last-rule')
  return source
}
