// Shifts the module down by a few lines and returns a source map (without a `file` field) that
// maps each line back to the original.
const addedLines = 3

module.exports = function (source) {
  const lineCount = source.split('\n').length
  const mappings =
    ';'.repeat(addedLines) +
    ['AAAA', ...Array(lineCount - 1).fill('AACA')].join(';')
  this.callback(null, '\n'.repeat(addedLines) + source, {
    version: 3,
    sources: [this.resourcePath],
    sourcesContent: [source],
    names: [],
    mappings,
  })
}
