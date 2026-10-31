const { callbackWithFsError } = require('./create-error')
module.exports = function fsErrorLoader(source) {
  callbackWithFsError(this.async())
}
