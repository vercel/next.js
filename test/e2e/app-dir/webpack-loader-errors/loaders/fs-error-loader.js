const fs = require('fs')

module.exports = function fsErrorLoader(source) {
  fs.readFileSync('/does/not/exist/file.txt')
}
