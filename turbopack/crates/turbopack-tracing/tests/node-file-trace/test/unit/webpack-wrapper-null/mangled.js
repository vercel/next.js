module.exports = (function (t) {
  var e = {}

  function r(n) {
    if (e[n]) return e[n].exports
    var o = (e[n] = {
      i: n,
      l: !1,
      exports: {},
    })
    return (t[n].call(o.exports, o, o.exports, r), (o.l = !0), o.exports)
  }
  return (
    (r.m = t),
    (r.c = e),
    (r.d = function (t, e, n) {
      r.o(t, e) ||
        Object.defineProperty(t, e, {
          enumerable: !0,
          get: n,
        })
    }),
    (r.r = function (t) {
      ;('undefined' != typeof Symbol &&
        Symbol.toStringTag &&
        Object.defineProperty(t, Symbol.toStringTag, {
          value: 'Module',
        }),
        Object.defineProperty(t, '__esModule', {
          value: !0,
        }))
    }),
    (r.t = function (t, e) {
      if ((1 & e && (t = r(t)), 8 & e)) return t
      if (4 & e && 'object' == typeof t && t && t.__esModule) return t
      var n = Object.create(null)
      if (
        (r.r(n),
        Object.defineProperty(n, 'default', {
          enumerable: !0,
          value: t,
        }),
        2 & e && 'string' != typeof t)
      )
        for (var o in t)
          r.d(
            n,
            o,
            function (e) {
              return t[e]
            }.bind(null, o)
          )
      return n
    }),
    (r.n = function (t) {
      var e =
        t && t.__esModule
          ? function () {
              return t.default
            }
          : function () {
              return t
            }
      return (r.d(e, 'a', e), e)
    }),
    (r.o = function (t, e) {
      return Object.prototype.hasOwnProperty.call(t, e)
    }),
    (r.p = ''),
    r((r.s = 5))
  )
})([
  function (t, e, r) {
    function n(t) {
      return (n =
        'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
          ? function (t) {
              return typeof t
            }
          : function (t) {
              return t &&
                'function' == typeof Symbol &&
                t.constructor === Symbol &&
                t !== Symbol.prototype
                ? 'symbol'
                : typeof t
            })(t)
    }
    var o = r(1),
      u = Object.seal(['string', 'number'])
    t.exports = function () {
      for (var t = arguments.length, e = new Array(t), r = 0; r < t; r++)
        e[r] = arguments[r]
      var i = {
        recursive: !0,
        resolve: !0,
        clean: !1,
      }

      function f() {
        var t =
            arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : '',
          r = arguments.length > 1 ? arguments[1] : void 0
        if ('string' != typeof t)
          throw new TypeError(
            'paraphrase expects first argument to be a string, got a '
              .concat(n(t), ' (')
              .concat(t, ')')
          )
        if (!r) return t
        for (
          var c = arguments.length, l = new Array(c > 2 ? c - 2 : 0), y = 2;
          y < c;
          y++
        )
          l[y - 2] = arguments[y]

        function a(t, e) {
          var c = i.resolve ? o(r, e.trim()) : r[e.trim()]
          return u.includes(n(c)) ? c : i.clean ? '' : t
        }
        u.includes(n(r)) && (r = [r].concat(l))
        var p = e.reduce(function (t, e) {
          return t.replace(e, a)
        }, t)
        return i.recursive && t !== p ? f.apply(void 0, [p, r].concat(l)) : p
      }
      return (
        e.length && c(e[e.length - 1]) && Object.assign(i, e.pop()),
        (f.patterns = e),
        f
      )
    }
    var c = function (t) {
      return '[object Object]' === ''.concat(t)
    }
  },
  function (t, e, r) {
    'use strict'

    function n(t) {
      return (n =
        'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
          ? function (t) {
              return typeof t
            }
          : function (t) {
              return t &&
                'function' == typeof Symbol &&
                t.constructor === Symbol &&
                t !== Symbol.prototype
                ? 'symbol'
                : typeof t
            })(t)
    }

    function o(t) {
      return (o =
        'function' == typeof Symbol && 'symbol' === n(Symbol.iterator)
          ? function (t) {
              return n(t)
            }
          : function (t) {
              return t &&
                'function' == typeof Symbol &&
                t.constructor === Symbol &&
                t !== Symbol.prototype
                ? 'symbol'
                : n(t)
            })(t)
    }
    t.exports = function (t) {
      var e =
        arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : ''
      return e.split('.').reduce(function (t, e) {
        return 'object' === o(t) ? t[e] : t
      }, t)
    }
  },
  ,
  ,
  ,
  function (t, e, r) {
    t.exports = r(0)(/%{([^{}]*)}/gm)
  },
])
