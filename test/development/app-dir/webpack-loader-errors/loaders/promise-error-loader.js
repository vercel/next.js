module.exports = function promiseErrorLoader(source) {
  Promise.reject(new Error('An error thrown by promise-error-loader'))
  return source
}
