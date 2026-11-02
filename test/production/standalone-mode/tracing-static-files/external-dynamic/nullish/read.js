const fs = require('fs')
const path = require('path')

exports.readNullishFallback = function readNullishFallback(dynamicPath) {
  return fs.readFileSync(
    dynamicPath ??
      path.join(process.cwd(), 'data', 'static-from-ext-nullish.txt'),
    'utf8'
  )
}
