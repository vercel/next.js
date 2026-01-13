/* eslint-disable no-extend-native */

/**
 * String.prototype.trimStart / trimEnd polyfill
 *
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
