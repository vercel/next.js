const fs = require('fs')
const path = require('path')

exports.readDefaultParam = function readDefaultParam(
  filePath = path.join(
    process.cwd(),
    'data',
    'static-from-ext-default-param.txt'
  )
) {
  return fs.readFileSync(filePath, 'utf8')
}
