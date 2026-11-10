module.exports = function slowLoader(source) {
  const callback = this.async()
  setTimeout(() => callback(null, source), 1000)
}
