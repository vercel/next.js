module.exports = function (content) {
  const { outputPath, kind } = this.getOptions()
  this.emitFile(`${outputPath}/${kind}-sidecar.txt`, `sidecar-${kind}`)
  return content
}
