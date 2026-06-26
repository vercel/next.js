!(function (e) {
  'object' == typeof exports && 'undefined' != typeof module
    ? (module.exports = e())
    : 'function' == typeof define && define.amd
      ? define([], e)
      : (('undefined' != typeof window
          ? window
          : 'undefined' != typeof global
            ? global
            : 'undefined' != typeof self
              ? self
              : this
        ).ytSearch = e())
})(function () {
  return (function r(l, u, o) {
    function s(t, e) {
      if (!u[t]) {
        if (!l[t]) {
          var i = 'function' == typeof require && require
          if (!e && i) return i(t, !0)
          if (c) return c(t, !0)
          var n = new Error("Cannot find module '" + t + "'")
          throw ((n.code = 'MODULE_NOT_FOUND'), n)
        }
        var a = (u[t] = {
          exports: {},
        })
        l[t][0].call(
          a.exports,
          function (e) {
            return s(l[t][1][e] || e)
          },
          a,
          a.exports,
          r,
          l,
          u,
          o
        )
      }
      return u[t].exports
    }
    for (
      var c = 'function' == typeof require && require, e = 0;
      e < o.length;
      e++
    )
      s(o[e])
    return s
  })(
    {
      1: [
        function (s, e, t) {
          'use strict'
          var ee = s('acorn')
        },
        {
          acorn: void 0,
        },
      ],
    },
    {},
    [1]
  )(1)
})
