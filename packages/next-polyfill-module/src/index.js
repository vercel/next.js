/* eslint-disable no-extend-native */

// Contains polyfills for methods missing after browser version(s):
// Edge 111, Firefox 111, Chrome 111, Safari 16.4

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

/**
 * Available in:
 * Internet Explorer: never
 * Edge: 93
 * Firefox: 92
 * Chrome: 93
 * Safari: 15.4
 *
 * https://caniuse.com/mdn-javascript_builtins_object_hasown
 */
// Modifiled from https://github.com/tc39/proposal-accessible-object-hasownproperty/blob/main/polyfill.js
if (!Object.hasOwn) {
  Object.hasOwn = function (object, property) {
    if (object == null) {
      throw new TypeError('Cannot convert undefined or null to object')
    }
    return Object.prototype.hasOwnProperty.call(Object(object), property)
  }
}

/**
 * Available in:
 * Edge: 120
 * Firefox: 115
 * Chrome: 120
 * Safari: 17.0
 *
 * https://caniuse.com/mdn-api_url_canparse_static
 */
// Modified from https://github.com/zloirock/core-js/blob/master/packages/core-js/modules/web.url.can-parse.js
if (!('canParse' in URL)) {
  URL.canParse = function (url, base) {
    try {
      return !!new URL(url, base)
    } catch {
      return false
    }
  }
}
