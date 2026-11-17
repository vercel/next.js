module.exports = function (source) {
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/route.txt`, source)
  return 'export default "route"'
}
