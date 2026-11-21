/* eslint-disable no-extend-native */

/**
 * Array.prototype.flat / flatMap polyfill
 *
 * Available in:
 * Edge: never
 * Firefox: 62
 * Chrome: 69
 * Safari: 12
 *
 * https://caniuse.com/array-flat
 *
 * Copied from https://gist.github.com/developit/50364079cf0390a73e745e513fa912d9
 * Licensed Apache-2.0
 */
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
