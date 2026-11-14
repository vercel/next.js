const fs = require('node:fs')
const path = require('node:path')

module.exports = function () {
  const sources = ['tokens.less', 'theme.module.less'].map((name) =>
    path.join(this.context, name)
  )
  for (const source of sources) this.addDependency(source)

  // Model a preprocessor expanding an import and moving the main rule to line 4.
  this.callback(
    null,
    '.importedBefore {\n  color: rgb(10, 20, 30);\n}\n.box {\n  color: red;\n}\n',
    {
      version: 3,
      sources,
      sourcesContent: sources.map((source) => fs.readFileSync(source, 'utf8')),
      names: [],
      mappings: 'AACA;;;ACAA',
    }
  )
}
