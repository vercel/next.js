module.exports = function () {
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/shared.js`, 'console.log("shared");', {
    version: 3,
    sources: ['original.js'],
    sourcesContent: ['original'],
    names: [],
    mappings: 'AAAA',
  })
  return 'export default "mapped-value"'
}
