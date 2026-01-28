/**
 * Object.fromEntries polyfill
 *
 * Available in:
 * Edge: never
 * Firefox: 63
 * Chrome: 73
 * Safari: 12.1
 *
 * https://caniuse.com/mdn-javascript_builtins_object_fromentries
 *
 * Modified from https://github.com/tc39/proposal-object-from-entries/blob/main/polyfill.js
 * Modified from https://github.com/feross/fromentries/blob/29b52a850bb3a47c390937631c2638edf3443942/index.js
 * License MIT
 */
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
