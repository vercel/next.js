/* eslint-disable no-extend-native */

/**
 * Symbol.prototype.description polyfill
 *
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
