const fs = require('fs')

exports.readBareDynamic = function readBareDynamic(dynamicPath) {
  try {
    return fs.readFileSync(dynamicPath, 'utf8')
  } catch {
    return undefined
  }
}
