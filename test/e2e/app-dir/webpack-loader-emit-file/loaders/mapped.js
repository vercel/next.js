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
  for (const [name, sourceRoot, sources] of [
    ['url', 'https://example.com/src', ['/original.js']],
    ['filesystem', 'sources', ['/original.js']],
    ['relative', 'sources', ['original.js']],
  ]) {
    this.emitFile(`${outputPath}/root-${name}.js`, code, {
      version: 3,
      sourceRoot,
      sources,
      sourcesContent: ['root-original'],
      names: [],
      mappings: 'AAAA',
    })
  }
  // Webpack's production minifier fails on index and invalid maps, so only Turbopack gets them.
  if (turbopackOnlyMaps) {
    this.emitFile(`${outputPath}/indexed-map.js`, code, {
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: {
            version: 3,
            sources: ['indexed-original.js'],
            sourcesContent: ['indexed-original'],
            names: [],
            mappings: 'AAAA',
          },
        },
      ],
    })
    this.emitFile(`${outputPath}/invalid-map.js`, code, {
      version: 3,
      sources: ['invalid-original.js'],
      names: [],
      mappings: '!!!!',
    })
  }
  return 'export default "mapped-files"'
}
