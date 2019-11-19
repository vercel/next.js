module.exports = function(source) {
  this.emitWarning(
    new Error('This is an expected warning added by warning-loader.js')
  )
  return source
}
