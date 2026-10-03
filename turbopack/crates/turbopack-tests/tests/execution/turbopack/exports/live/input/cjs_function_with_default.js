// A CommonJS module whose exports object is a function and which also has an own `default` key.
// Without `__esModule`, the ESM `default` import is the function itself, so interop replaces the
// `default` getter with the function as a plain value, in place, before `afterDefault`.
module.exports = function cjsFunction() {
  return 'cjsFunction'
}
module.exports.default = 'defaultProperty'
module.exports.afterDefault = 'afterDefault'
