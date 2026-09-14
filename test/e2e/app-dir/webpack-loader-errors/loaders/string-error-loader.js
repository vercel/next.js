module.exports = function stringErrorLoader(source) {
  // Intentionally throwing a string (not an Error object) to test string error handling
  // eslint-disable-next-line no-throw-literal
  throw 'A string error thrown by string-error-loader'
}
