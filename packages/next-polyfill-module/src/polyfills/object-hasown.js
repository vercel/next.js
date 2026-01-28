/**
 * Object.hasOwn polyfill
 *
 * Available in:
 * Internet Explorer: never
 * Edge: 93
 * Firefox: 92
 * Chrome: 93
 * Safari: 15.4
 *
 * https://caniuse.com/mdn-javascript_builtins_object_hasown
 *
 * Modified from https://github.com/tc39/proposal-accessible-object-hasownproperty/blob/main/polyfill.js
 */
if (!Object.hasOwn) {
  Object.hasOwn = function (object, property) {
    if (object == null) {
      throw new TypeError('Cannot convert undefined or null to object')
    }
    return Object.prototype.hasOwnProperty.call(Object(object), property)
  }
}
