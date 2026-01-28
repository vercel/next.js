/* eslint-disable no-extend-native */

/**
 * Promise.prototype.finally polyfill
 *
 * Available in:
 * Edge: 18
 * Firefox: 58
 * Chrome: 63
 * Safari: 11.1
 *
 * https://caniuse.com/promise-finally
 *
 * Modified from https://gist.github.com/developit/e96097d9b657f2a2f3e588ffde433437
 * Licensed Apache-2.0
 */
if (!Promise.prototype.finally) {
  Promise.prototype.finally = function (callback) {
    if (typeof callback !== 'function') {
      return this.then(callback, callback)
    }

    var P = this.constructor || Promise
    return this.then(
      function (value) {
        return P.resolve(callback()).then(function () {
          return value
        })
      },
      function (err) {
        return P.resolve(callback()).then(function () {
          throw err
        })
      }
    )
  }
}
