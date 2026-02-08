module.exports = function timeoutErrorLoader(source) {
  const callback = this.async()
  setTimeout(() => {
    throw new Error('An error thrown by timeout-error-loader')
  }, 0)
  callback(null, source)
}
