const fs = require('fs')
const path = require('path')

module.exports = function () {
  fs.writeFileSync(
    path.join(this.rootContext, 'sentinel-transformed'),
    'compiled'
  )
  return 'export default "sentinel"'
}
