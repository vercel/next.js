module.exports = function noStackErrorLoader(source) {
  const err = new Error('An error without stack from no-stack-error-loader')
  err.stack = undefined
  throw err
}
