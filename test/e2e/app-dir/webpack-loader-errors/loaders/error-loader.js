const { createError } = require('./create-error')
module.exports = function errorLoader(source) {
  const callback = this.async()
  setTimeout(() => {
    callback(createError('An error thrown by error-loader'))
  }, 0)
}
