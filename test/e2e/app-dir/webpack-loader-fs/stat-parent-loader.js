const fs = require('fs')

// Directory stat dependencies would mask tracking the wrong target when a file is replaced.
module.exports = async function () {
  const stat = (p) =>
    new Promise((resolve, reject) => {
      this.fs.stat(p, (err, stats) => (err ? reject(err) : resolve(stats)))
    })
  const relativePath = 'app/path/to/symlink/../stat-parent-target.bin'
  const absolutePath = `${this.rootContext}/${relativePath}`
  const absolute = await stat(absolutePath)
  const relative = await stat(relativePath)
  const buffer = await stat(Buffer.from(absolutePath))
  return `module.exports = ${JSON.stringify({
    parentSize: absolute.size,
    relativeParentSize: relative.size,
    bufferParentSize: buffer.size,
    parentMatchesNode: absolute.size === fs.statSync(absolutePath).size,
  })}`
}
