const { SourceMap } = require('node:module')
const path = require('node:path')

module.exports = function (source, map) {
  if (map === null) {
    throw new Error('An absent source map must be undefined, not null')
  }
  let location = null
  if (map) {
    const entry = new SourceMap(map).findEntry(4, 0)
    location = {
      source: path.basename(entry.originalSource),
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
      content: map.sourcesContent[0].split('\n')[entry.originalLine],
    }
  }
  this.callback(
    null,
    source.replace("'INPUT_MAP'", JSON.stringify(location)),
    map
  )
}
