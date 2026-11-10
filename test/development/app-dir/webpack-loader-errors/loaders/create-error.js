const fs = require('fs')

// These helpers create errors and invoke the loader callback inside a
// setTimeout so that the resulting stack trace does NOT contain the
// loader file path — only this helper file.  This lets the Turbopack
// "(from …)" annotation fire (it's conditional on the loader path
// not already being in the stack).

module.exports.callbackWithError = function callbackWithError(
  callback,
  message
) {
  setTimeout(() => {
    callback(new Error(message))
  }, 0)
}

module.exports.callbackWithFsError = function callbackWithFsError(callback) {
  setTimeout(() => {
    try {
      fs.readFileSync('/does/not/exist/file.txt')
    } catch (err) {
      callback(err)
    }
  }, 0)
}
