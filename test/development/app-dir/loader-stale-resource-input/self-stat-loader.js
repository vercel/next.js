// Exposes the modification time of the resource itself, read through
// `this.fs.stat`. Metadata-only changes to the resource (e.g. `touch`) must
// still re-run this loader.
module.exports = function selfStatLoader() {
  const callback = this.async()
  this.fs.stat(this.resourcePath, (err, stats) => {
    if (err) return callback(err)
    callback(null, `export default ${JSON.stringify(stats.mtimeMs)}`)
  })
}
