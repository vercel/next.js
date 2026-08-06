;(function (factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    var v = factory(require, exports)
    if (v !== undefined) module.exports = v
  } else if (typeof define === 'function' && define.amd) {
    define([
      'require',
      'exports',
      './impl/format',
      './impl/edit',
      './impl/scanner',
      './impl/parser',
    ], factory)
  }
})(function (require, exports) {
  require('./dep.js')
})
