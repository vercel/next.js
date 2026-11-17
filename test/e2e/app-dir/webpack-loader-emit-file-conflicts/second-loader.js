module.exports = function (source) {
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/shared.txt`, source)
  return 'export default "second"'
}
