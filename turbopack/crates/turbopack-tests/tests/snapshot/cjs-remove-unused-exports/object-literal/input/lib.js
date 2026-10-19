// Hand-written / transpiled CJS: named exports declared as a whole-object
// `module.exports = { … }` literal. An unused data property keeps its value's
// side effects in place via `...(void …)`; an unused shorthand (a plain ident
// read) is removed outright.
const usedShort = 'used-short'
const unusedShort = 'unused-short'
module.exports = {
  used: 'used-value',
  unused: 'unused-value',
  usedShort,
  unusedShort,
  usedFn: function () {
    return 'used-fn'
  },
  unusedFn: function () {
    return 'unused-fn'
  },
}
