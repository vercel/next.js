// Export names that are awkward for a mangling table: names that collide with
// `Object.prototype` members, and names that are already short enough to be kept.

export const toString = 'toString-value'
export const valueOf = 'valueOf-value'
export const constructor = 'constructor-value'
export const __proto__ = 'proto-value'
export const a = 'single char'
export const $1 = 'double char'
export const __1 = '3 chars'
export const aVeryLongExportNameIndeed = 'long'

export const exportsInfo = {
  toString: __webpack_exports_info__.toString,
  valueOf: __webpack_exports_info__.valueOf,
  a: __webpack_exports_info__.a,
  $1: __webpack_exports_info__.$1,
  __1: __webpack_exports_info__.__1,
  aVeryLongExportNameIndeed: __webpack_exports_info__.aVeryLongExportNameIndeed,
}
