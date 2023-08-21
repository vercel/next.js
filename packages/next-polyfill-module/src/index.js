/* eslint-disable no-extend-native, no-sequences */

// Contains polyfills for methods missing after browser version(s):
// Edge 16, Firefox 60, Chrome 61, Safari 10.1

/**
 * Available in:
 * Edge: never
 * Firefox: 61
 * Chrome: 66
 * Safari: 12
 *
 * https://caniuse.com/mdn-javascript_builtins_string_trimstart
 * https://caniuse.com/mdn-javascript_builtins_string_trimend
 */
if (!('trimStart' in String.prototype)) {
  String.prototype.trimStart = String.prototype.trimLeft
}
if (!('trimEnd' in String.prototype)) {
  String.prototype.trimEnd = String.prototype.trimRight
}

/**
 * Available in:
 * Edge: never
 * Firefox: 63
 * Chrome: 70
 * Safari: 12.1
 *
 * https://caniuse.com/mdn-javascript_builtins_symbol_description
 */
if (!('description' in Symbol.prototype)) {
  Object.defineProperty(Symbol.prototype, 'description', {
    configurable: true,
    get: function get() {
      var m = /\((.*)\)/.exec(this.toString())
      return m ? m[1] : undefined
    },
  })
}

/**
 * Available in:
 * Edge: never
 * Firefox: 62
 * Chrome: 69
 * Safari: 12
 *
 * https://caniuse.com/array-flat
 */
// Copied from https://gist.github.com/developit/50364079cf0390a73e745e513fa912d9
// Licensed Apache-2.0
if (!Array.prototype.flat) {
  Array.prototype.flat = function flat(d, c) {
    return (
      (c = this.concat.apply([], this)),
      d > 1 && c.some(Array.isArray) ? c.flat(d - 1) : c
    )
  }
  Array.prototype.flatMap = function (c, a) {
    return this.map(c, a).flat()
  }
}

/**
 * Available in:
 * Edge: 18
 * Firefox: 58
 * Chrome: 63
 * Safari: 11.1
 *
 * https://caniuse.com/promise-finally
 */
// Modified from https://gist.github.com/developit/e96097d9b657f2a2f3e588ffde433437
// Licensed Apache-2.0
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

/**
 * Available in:
 * Edge: never
 * Firefox: 63
 * Chrome: 73
 * Safari: 12.1
 *
 * https://caniuse.com/mdn-javascript_builtins_object_fromentries
 */
// Modified from https://github.com/tc39/proposal-object-from-entries/blob/main/polyfill.js
// Modified from https://github.com/feross/fromentries/blob/29b52a850bb3a47c390937631c2638edf3443942/index.js
// License MIT
if (!Object.fromEntries) {
  Object.fromEntries = function (iterable) {
    // Assume the input is either an iterable object or an array-like object
    return Array.from(iterable).reduce(function (obj, entry) {
      // https://github.com/tc39/proposal-object-from-entries/blob/e4837799c1586a07c101570b27997497e5290c22/polyfill.js#L9-L10
      // contract is that entry has "0" and "1" keys, not that it is an array or iterable.
      obj[entry[0]] = entry[1]
      return obj
    }, {})
  }
}

/**
 * Available in:
 * Internet Explorer: never
 * Edge: 92
 * Firefox: 90
 * Chrome: 92
 * Safari: 15.4
 *
 * https://caniuse.com/mdn-javascript_builtins_array_at
 */
// Modified from TC39 at proposal polyfill: https://github.com/tc39/proposal-relative-indexing-method#polyfill
if (!Array.prototype.at) {
  Array.prototype.at = function at(n) {
    let i = Math.trunc(n) || 0

    if (i < 0) i += this.length

    if (i < 0 || i >= this.length) return undefined

    return this[i]
  }
}
