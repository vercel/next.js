const { createFsError } = require('./create-error')
module.exports = function fsErrorLoader(source) {
  const callback = this.async()
  setTimeout(() => {
    callback(createFsError())
  }, 0)
}
