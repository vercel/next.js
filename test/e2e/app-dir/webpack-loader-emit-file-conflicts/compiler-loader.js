module.exports = function (source) {
  const { outputPath } = this.getOptions()
  const content = source.includes('per-compiler') ? String(this.target) : 'same'
  this.emitFile(`${outputPath}/compiler.txt`, content)
  return 'export default "compiler"'
}
