module.exports = function () {
  const { outputPath, turbopackOnlyMaps } = this.getOptions()
  const code = 'console.log("mapped-asset");\n'
  this.emitFile(
    `${outputPath}/mapped-asset.js`,
    code,
    {
      version: 3,
      sources: ['original.js'],
      sourcesContent: ['console.log("original-asset");\n'],
      names: [],
      mappings: 'AAAA',
    },
    {
      sourceFilename: 'original.js',
      immutable: true,
      custom: { value: 'metadata' },
    }
  )
  this.emitFile(
    `${outputPath}/original-name.js`,
    code,
    'original-name-source.js'
  )
  this.emitFile(`${outputPath}/mapped-styles.css`, 'body { color: red; }', {
    version: 3,
    sources: ['original.css'],
    sourcesContent: ['body { color: red; }'],
    names: [],
    mappings: 'AAAA',
  })
  // Webpack's production minifier fails on invalid maps, so only Turbopack gets them.
  if (turbopackOnlyMaps) {
    this.emitFile(`${outputPath}/invalid-map.js`, code, {
      version: 3,
      sources: ['invalid-original.js'],
      names: [],
      mappings: '!!!!',
    })
  }
  return 'export default "mapped-files"'
}
