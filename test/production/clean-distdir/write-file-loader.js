const fs = require('fs')
const path = require('path')

// Like some tools do, writes a file into the distDir while compiling.
module.exports = function writeFileLoader(source) {
  const distDir = path.join(path.dirname(this.resourcePath), '.next')
  fs.mkdirSync(distDir, { recursive: true })
  fs.writeFileSync(path.join(distDir, 'loader-output.txt'), 'from a loader')
  return source
}
