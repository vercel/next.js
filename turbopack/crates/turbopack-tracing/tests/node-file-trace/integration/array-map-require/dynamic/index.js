const fs = require('fs')

const FILES = ['../lib/a.js', '../lib/b.js'].map(function (file) {
  return require.resolve(file)
})

new Function(
  'module',
  (function () {
    var code = FILES.map(function (file) {
      return fs.readFileSync(file, 'utf8')
    })
    code.push('module.exports = evaluate;')
    return code.join('\n\n')
  })()
)(module)
