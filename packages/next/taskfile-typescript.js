'use strict'
try {
  const ts = require('typescript')
  const extname = require('path').extname
  const config = require('./tsconfig.json')

  module.exports = function (task) {
    task.plugin('typescript', { every: true }, function * (file, options) {
      const {stripExtension} = options
      const opts = {
        fileName: file.base,
        compilerOptions: {
          ...config.compilerOptions,
          ...options,
          stripExtension: undefined // since it's an option of the typescript taskr plugin
        }
      }

      const ext = extname(file.base)
      // For example files without an extension don't have to be rewritten
      if (ext) {
        // Replace `.ts` with `.js`
        const extRegex = new RegExp(ext.replace('.', '\\.') + '$', 'i')
        file.base = file.base.replace(extRegex, stripExtension ? '' : '.js')
      }

      // compile output
      const result = ts.transpileModule(file.data.toString(), opts)

      if (opts.compilerOptions.sourceMap && result.sourceMapText) {
        // add sourcemap to `files` array
        this._.files.push({
          dir: file.dir,
          base: `${file.base}.map`,
          data: Buffer.from(JSON.stringify(result.sourceMapText), 'utf8')
        })
      }

      // Workaround for noop.js loading
      if (file.base === 'next-dev.js') result.outputText = result.outputText.replace('// REPLACE_NOOP_IMPORT', `import('./noop');`)

      // update file's data
      file.data = Buffer.from(result.outputText.replace(/process\.env\.__NEXT_VERSION/, `"${require('./package.json').version}"`), 'utf8')
    })
  }
} catch (err) {
  console.error(err)
}
