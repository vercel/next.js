const { callbackWithError } = require('./create-error')
module.exports = function errorLoader(source) {
  callbackWithError(this.async(), 'An error thrown by error-loader')
}
