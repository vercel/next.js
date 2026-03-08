const fs = require('fs')

module.exports.createError = function createError(message) {
  return new Error(message)
}

module.exports.createFsError = function createFsError() {
  try {
    fs.readFileSync('/does/not/exist/file.txt')
  } catch (err) {
    return err
  }
}
