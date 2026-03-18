module.exports = async function myLoader(source) {
  console.log(`Run my-timestamp-loader on ${this.resourcePath}`)
  if (this._compiler && this._compiler.__extra_delay) {
    if (!this._compilation.__extra_delay) {
      this._compilation.__extra_delay = true
      // Make webpack consider the build as large change which makes it filesystem cache it sooner
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
  return source.replace(/Timestamp/g, `Timestamp = ${Date.now()}`)
}
