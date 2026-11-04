module.exports = function (source) {
  this.callback(null, `// Generated code\n\n\n${source}`, {
    version: 3,
    sources: [this.resourcePath],
    sourcesContent: [source],
    names: [],
    mappings: ';;;AAAA;AACA',
  })
}
