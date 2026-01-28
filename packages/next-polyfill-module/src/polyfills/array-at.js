/* eslint-disable no-extend-native */

/**
 * Array.prototype.at polyfill
 *
 * Available in:
 * Internet Explorer: never
 * Edge: 92
 * Firefox: 90
 * Chrome: 92
 * Safari: 15.4
 *
 * https://caniuse.com/mdn-javascript_builtins_array_at
 *
 * Modified from TC39 at proposal polyfill: https://github.com/tc39/proposal-relative-indexing-method#polyfill
 */
if (!Array.prototype.at) {
  Array.prototype.at = function at(n) {
    let i = Math.trunc(n) || 0

    if (i < 0) i += this.length

    if (i < 0 || i >= this.length) return undefined

    return this[i]
  }
}
