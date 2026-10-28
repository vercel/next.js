const path = require('path')

module.exports = function () {
  const { outputPath } = this.getOptions()
  this.emitFile(`${outputPath}/same-map.js`, 'console.log("same");\n', {
    version: 3,
    sources: [path.basename(this.resourcePath)],
    sourcesContent: ['console.log("same");\n'],
    names: [],
    mappings: 'AAAA',
  })
  return 'export default "map"'
}
