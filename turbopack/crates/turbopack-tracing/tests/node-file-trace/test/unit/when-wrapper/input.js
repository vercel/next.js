;(function (define) {
  'use strict'
  define(function (require) {
    require('./dep.js')
  })
})(
  typeof define === 'function' && define.amd
    ? define
    : function (factory) {
        module.exports = factory(require)
      }
)
