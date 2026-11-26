const fs = require('fs')
const path = require('path')

// Records each run so the test can check how often a module was processed.
module.exports = function (source) {
  fs.appendFileSync(
    path.join(__dirname, 'loader-runs.log'),
    path.basename(this.resourcePath) + '\n'
  )
  return source
}
