/* eslint-disable */
import { TextDecoder } from '../text-decoder'

var Module = (function () {
  // var _scriptDir = import.meta.url

  return function (Module) {
    Module = Module || {}

    var f
    f || (f = typeof Module !== 'undefined' ? Module : {})
    var aa, ba
    f.ready = new Promise(function (a, b) {
      aa = a
      ba = b
    })
    var r = {},
      t
    for (t in f) f.hasOwnProperty(t) && (r[t] = f[t])
    var ca = '',
      ea,
      fa,
      ha,
      ia
    ca = __dirname + '/'
    ea = function (a) {
      ha || (ha = require('fs'))
      ia || (ia = require('path'))
      a = ia.normalize(a)
      return ha.readFileSync(a, null)
    }
    fa = function (a) {
      a = ea(a)
      a.buffer || (a = new Uint8Array(a))
      a.buffer || u('Assertion failed: undefined')
      return a
    }
    f.inspect = function () {
      return '[Emscripten Module object]'
    }
    f.print || console.log.bind(console)
    var v = f.printErr || console.warn.bind(console)
    for (t in r) r.hasOwnProperty(t) && (f[t] = r[t])
    r = null
    var z
    f.wasmBinary && (z = f.wasmBinary)
    var noExitRuntime
    f.noExitRuntime && (noExitRuntime = f.noExitRuntime)
    'object' !== typeof WebAssembly && u('no native wasm support detected')
    var A,
      ja = !1,
      ka = new TextDecoder('utf8')
    function la(a, b, c) {
      var d = B
      if (0 < c) {
        c = b + c - 1
        for (var e = 0; e < a.length; ++e) {
          var g = a.charCodeAt(e)
          if (55296 <= g && 57343 >= g) {
            var l = a.charCodeAt(++e)
            g = (65536 + ((g & 1023) << 10)) | (l & 1023)
          }
          if (127 >= g) {
            if (b >= c) break
            d[b++] = g
          } else {
            if (2047 >= g) {
              if (b + 1 >= c) break
              d[b++] = 192 | (g >> 6)
            } else {
              if (65535 >= g) {
                if (b + 2 >= c) break
                d[b++] = 224 | (g >> 12)
              } else {
                if (b + 3 >= c) break
                d[b++] = 240 | (g >> 18)
                d[b++] = 128 | ((g >> 12) & 63)
              }
              d[b++] = 128 | ((g >> 6) & 63)
            }
            d[b++] = 128 | (g & 63)
          }
        }
        d[b] = 0
      }
    }
    var ma = new TextDecoder('utf-16le')
    function na(a, b) {
      var c = a >> 1
      for (b = c + b / 2; !(c >= b) && C[c]; ) ++c
      return ma.decode(B.subarray(a, c << 1))
    }
    function oa(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (2 > c) return 0
      c -= 2
      var d = b
      c = c < 2 * a.length ? c / 2 : a.length
      for (var e = 0; e < c; ++e) (D[b >> 1] = a.charCodeAt(e)), (b += 2)
      D[b >> 1] = 0
      return b - d
    }
    function pa(a) {
      return 2 * a.length
    }
    function qa(a, b) {
      for (var c = 0, d = ''; !(c >= b / 4); ) {
        var e = F[(a + 4 * c) >> 2]
        if (0 == e) break
        ++c
        65536 <= e
          ? ((e -= 65536),
            (d += String.fromCharCode(55296 | (e >> 10), 56320 | (e & 1023))))
          : (d += String.fromCharCode(e))
      }
      return d
    }
    function ra(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (4 > c) return 0
      var d = b
      c = d + c - 4
      for (var e = 0; e < a.length; ++e) {
        var g = a.charCodeAt(e)
        if (55296 <= g && 57343 >= g) {
          var l = a.charCodeAt(++e)
          g = (65536 + ((g & 1023) << 10)) | (l & 1023)
        }
        F[b >> 2] = g
        b += 4
        if (b + 4 > c) break
      }
      F[b >> 2] = 0
      return b - d
    }
    function sa(a) {
      for (var b = 0, c = 0; c < a.length; ++c) {
        var d = a.charCodeAt(c)
        55296 <= d && 57343 >= d && ++c
        b += 4
      }
      return b
    }
    var G, H, B, D, C, F, I, ta, ua
    function va(a) {
      G = a
      f.HEAP8 = H = new Int8Array(a)
      f.HEAP16 = D = new Int16Array(a)
      f.HEAP32 = F = new Int32Array(a)
      f.HEAPU8 = B = new Uint8Array(a)
      f.HEAPU16 = C = new Uint16Array(a)
      f.HEAPU32 = I = new Uint32Array(a)
      f.HEAPF32 = ta = new Float32Array(a)
      f.HEAPF64 = ua = new Float64Array(a)
    }
    var wa = f.INITIAL_MEMORY || 16777216
    f.wasmMemory
      ? (A = f.wasmMemory)
      : (A = new WebAssembly.Memory({ initial: wa / 65536, maximum: 32768 }))
    A && (G = A.buffer)
    wa = G.byteLength
    va(G)
    var J,
      xa = [],
      ya = [],
      za = [],
      Aa = []
    function Ba() {
      var a = f.preRun.shift()
      xa.unshift(a)
    }
    var K = 0,
      Ca = null,
      L = null
    f.preloadedImages = {}
    f.preloadedAudios = {}
    function u(a) {
      if (f.onAbort) f.onAbort(a)
      v(a)
      ja = !0
      a = new WebAssembly.RuntimeError(
        'abort(' + a + '). Build with -s ASSERTIONS=1 for more info.'
      )
      ba(a)
      throw a
    }
    function Da() {
      var a = M
      return String.prototype.startsWith
        ? a.startsWith('data:application/octet-stream;base64,')
        : 0 === a.indexOf('data:application/octet-stream;base64,')
    }
    var M = 'webp_node_enc.wasm'
    if (!Da()) {
      var Ea = M
      M = f.locateFile ? f.locateFile(Ea, ca) : ca + Ea
    }
    function Fa() {
      try {
        if (z) return new Uint8Array(z)
        if (fa) return fa(M)
        throw 'both async and sync fetching of the wasm failed'
      } catch (a) {
        u(a)
      }
    }
    function N(a) {
      for (; 0 < a.length; ) {
        var b = a.shift()
        if ('function' == typeof b) b(f)
        else {
          var c = b.L
          'number' === typeof c
            ? void 0 === b.G
              ? J.get(c)()
              : J.get(c)(b.G)
            : c(void 0 === b.G ? null : b.G)
        }
      }
    }
    var O = {}
    function Ga(a) {
      for (; a.length; ) {
        var b = a.pop()
        a.pop()(b)
      }
    }
    function P(a) {
      return this.fromWireType(I[a >> 2])
    }
    var Q = {},
      R = {},
      S = {}
    function Ha(a) {
      if (void 0 === a) return '_unknown'
      a = a.replace(/[^a-zA-Z0-9_]/g, '$')
      var b = a.charCodeAt(0)
      return 48 <= b && 57 >= b ? '_' + a : a
    }
    function Ia(a, b) {
      a = Ha(a)
      return new Function(
        'body',
        'return function ' +
          a +
          '() {\n    "use strict";    return body.apply(this, arguments);\n};\n'
      )(b)
    }
    function Ja(a) {
      var b = Error,
        c = Ia(a, function (d) {
          this.name = a
          this.message = d
          d = Error(d).stack
          void 0 !== d &&
            (this.stack =
              this.toString() + '\n' + d.replace(/^Error(:[^\n]*)?\n/, ''))
        })
      c.prototype = Object.create(b.prototype)
      c.prototype.constructor = c
      c.prototype.toString = function () {
        return void 0 === this.message
          ? this.name
          : this.name + ': ' + this.message
      }
      return c
    }
    var Ka = void 0
    function La(a, b, c) {
      function d(h) {
        h = c(h)
        if (h.length !== a.length)
          throw new Ka('Mismatched type converter count')
        for (var k = 0; k < a.length; ++k) U(a[k], h[k])
      }
      a.forEach(function (h) {
        S[h] = b
      })
      var e = Array(b.length),
        g = [],
        l = 0
      b.forEach(function (h, k) {
        R.hasOwnProperty(h)
          ? (e[k] = R[h])
          : (g.push(h),
            Q.hasOwnProperty(h) || (Q[h] = []),
            Q[h].push(function () {
              e[k] = R[h]
              ++l
              l === g.length && d(e)
            }))
      })
      0 === g.length && d(e)
    }
    function Ma(a) {
      switch (a) {
        case 1:
          return 0
        case 2:
          return 1
        case 4:
          return 2
        case 8:
          return 3
        default:
          throw new TypeError('Unknown type size: ' + a)
      }
    }
    var Na = void 0
    function V(a) {
      for (var b = ''; B[a]; ) b += Na[B[a++]]
      return b
    }
    var Oa = void 0
    function W(a) {
      throw new Oa(a)
    }
    function U(a, b, c) {
      c = c || {}
      if (!('argPackAdvance' in b))
        throw new TypeError(
          'registerType registeredInstance requires argPackAdvance'
        )
      var d = b.name
      a || W('type "' + d + '" must have a positive integer typeid pointer')
      if (R.hasOwnProperty(a)) {
        if (c.P) return
        W("Cannot register type '" + d + "' twice")
      }
      R[a] = b
      delete S[a]
      Q.hasOwnProperty(a) &&
        ((b = Q[a]),
        delete Q[a],
        b.forEach(function (e) {
          e()
        }))
    }
    var Pa = [],
      X = [{}, { value: void 0 }, { value: null }, { value: !0 }, { value: !1 }]
    function Qa(a) {
      4 < a && 0 === --X[a].H && ((X[a] = void 0), Pa.push(a))
    }
    function Ra(a) {
      switch (a) {
        case void 0:
          return 1
        case null:
          return 2
        case !0:
          return 3
        case !1:
          return 4
        default:
          var b = Pa.length ? Pa.pop() : X.length
          X[b] = { H: 1, value: a }
          return b
      }
    }
    function Sa(a, b) {
      var c = f
      if (void 0 === c[a].F) {
        var d = c[a]
        c[a] = function () {
          c[a].F.hasOwnProperty(arguments.length) ||
            W(
              "Function '" +
                b +
                "' called with an invalid number of arguments (" +
                arguments.length +
                ') - expects one of (' +
                c[a].F +
                ')!'
            )
          return c[a].F[arguments.length].apply(this, arguments)
        }
        c[a].F = []
        c[a].F[d.J] = d
      }
    }
    function Ta(a, b, c) {
      f.hasOwnProperty(a)
        ? ((void 0 === c || (void 0 !== f[a].F && void 0 !== f[a].F[c])) &&
            W("Cannot register public name '" + a + "' twice"),
          Sa(a, a),
          f.hasOwnProperty(c) &&
            W(
              'Cannot register multiple overloads of a function with the same number of arguments (' +
                c +
                ')!'
            ),
          (f[a].F[c] = b))
        : ((f[a] = b), void 0 !== c && (f[a].X = c))
    }
    function Ua(a, b, c) {
      switch (b) {
        case 0:
          return function (d) {
            return this.fromWireType((c ? H : B)[d])
          }
        case 1:
          return function (d) {
            return this.fromWireType((c ? D : C)[d >> 1])
          }
        case 2:
          return function (d) {
            return this.fromWireType((c ? F : I)[d >> 2])
          }
        default:
          throw new TypeError('Unknown integer type: ' + a)
      }
    }
    function Va(a) {
      a = Wa(a)
      var b = V(a)
      Y(a)
      return b
    }
    function Xa(a, b) {
      var c = R[a]
      void 0 === c && W(b + ' has unknown type ' + Va(a))
      return c
    }
    function Ya(a) {
      if (null === a) return 'null'
      var b = typeof a
      return 'object' === b || 'array' === b || 'function' === b
        ? a.toString()
        : '' + a
    }
    function Za(a, b) {
      switch (b) {
        case 2:
          return function (c) {
            return this.fromWireType(ta[c >> 2])
          }
        case 3:
          return function (c) {
            return this.fromWireType(ua[c >> 3])
          }
        default:
          throw new TypeError('Unknown float type: ' + a)
      }
    }
    function $a(a) {
      var b = Function
      if (!(b instanceof Function))
        throw new TypeError(
          'new_ called with constructor type ' +
            typeof b +
            ' which is not a function'
        )
      var c = Ia(b.name || 'unknownFunctionName', function () {})
      c.prototype = b.prototype
      c = new c()
      a = b.apply(c, a)
      return a instanceof Object ? a : c
    }
    function ab(a, b) {
      for (var c = [], d = 0; d < a; d++) c.push(F[(b >> 2) + d])
      return c
    }
    function bb(a, b) {
      0 <= a.indexOf('j') ||
        u('Assertion failed: getDynCaller should only be called with i64 sigs')
      var c = []
      return function () {
        c.length = arguments.length
        for (var d = 0; d < arguments.length; d++) c[d] = arguments[d]
        var e
        ;-1 != a.indexOf('j')
          ? (e =
              c && c.length
                ? f['dynCall_' + a].apply(null, [b].concat(c))
                : f['dynCall_' + a].call(null, b))
          : (e = J.get(b).apply(null, c))
        return e
      }
    }
    function Z(a, b) {
      a = V(a)
      var c = -1 != a.indexOf('j') ? bb(a, b) : J.get(b)
      'function' !== typeof c &&
        W('unknown function pointer with signature ' + a + ': ' + b)
      return c
    }
    var cb = void 0
    function db(a, b) {
      function c(g) {
        e[g] || R[g] || (S[g] ? S[g].forEach(c) : (d.push(g), (e[g] = !0)))
      }
      var d = [],
        e = {}
      b.forEach(c)
      throw new cb(a + ': ' + d.map(Va).join([', ']))
    }
    function eb(a, b, c) {
      switch (b) {
        case 0:
          return c
            ? function (d) {
                return H[d]
              }
            : function (d) {
                return B[d]
              }
        case 1:
          return c
            ? function (d) {
                return D[d >> 1]
              }
            : function (d) {
                return C[d >> 1]
              }
        case 2:
          return c
            ? function (d) {
                return F[d >> 2]
              }
            : function (d) {
                return I[d >> 2]
              }
        default:
          throw new TypeError('Unknown integer type: ' + a)
      }
    }
    var fb = {}
    function gb() {
      return 'object' === typeof globalThis
        ? globalThis
        : Function('return this')()
    }
    var hb = {}
    Ka = f.InternalError = Ja('InternalError')
    for (var ib = Array(256), jb = 0; 256 > jb; ++jb)
      ib[jb] = String.fromCharCode(jb)
    Na = ib
    Oa = f.BindingError = Ja('BindingError')
    f.count_emval_handles = function () {
      for (var a = 0, b = 5; b < X.length; ++b) void 0 !== X[b] && ++a
      return a
    }
    f.get_first_emval = function () {
      for (var a = 5; a < X.length; ++a) if (void 0 !== X[a]) return X[a]
      return null
    }
    cb = f.UnboundTypeError = Ja('UnboundTypeError')
    ya.push({
      L: function () {
        kb()
      },
    })
    var mb = {
      w: function () {},
      m: function (a) {
        var b = O[a]
        delete O[a]
        var c = b.R,
          d = b.S,
          e = b.I,
          g = e
            .map(function (l) {
              return l.O
            })
            .concat(
              e.map(function (l) {
                return l.U
              })
            )
        La([a], g, function (l) {
          var h = {}
          e.forEach(function (k, m) {
            var n = l[m],
              q = k.M,
              w = k.N,
              x = l[m + e.length],
              p = k.T,
              da = k.V
            h[k.K] = {
              read: function (y) {
                return n.fromWireType(q(w, y))
              },
              write: function (y, E) {
                var T = []
                p(da, y, x.toWireType(T, E))
                Ga(T)
              },
            }
          })
          return [
            {
              name: b.name,
              fromWireType: function (k) {
                var m = {},
                  n
                for (n in h) m[n] = h[n].read(k)
                d(k)
                return m
              },
              toWireType: function (k, m) {
                for (var n in h)
                  if (!(n in m))
                    throw new TypeError('Missing field:  "' + n + '"')
                var q = c()
                for (n in h) h[n].write(q, m[n])
                null !== k && k.push(d, q)
                return q
              },
              argPackAdvance: 8,
              readValueFromPointer: P,
              D: d,
            },
          ]
        })
      },
      s: function (a, b, c, d, e) {
        var g = Ma(c)
        b = V(b)
        U(a, {
          name: b,
          fromWireType: function (l) {
            return !!l
          },
          toWireType: function (l, h) {
            return h ? d : e
          },
          argPackAdvance: 8,
          readValueFromPointer: function (l) {
            if (1 === c) var h = H
            else if (2 === c) h = D
            else if (4 === c) h = F
            else throw new TypeError('Unknown boolean type size: ' + b)
            return this.fromWireType(h[l >> g])
          },
          D: null,
        })
      },
      r: function (a, b) {
        b = V(b)
        U(a, {
          name: b,
          fromWireType: function (c) {
            var d = X[c].value
            Qa(c)
            return d
          },
          toWireType: function (c, d) {
            return Ra(d)
          },
          argPackAdvance: 8,
          readValueFromPointer: P,
          D: null,
        })
      },
      o: function (a, b, c, d) {
        function e() {}
        c = Ma(c)
        b = V(b)
        e.values = {}
        U(a, {
          name: b,
          constructor: e,
          fromWireType: function (g) {
            return this.constructor.values[g]
          },
          toWireType: function (g, l) {
            return l.value
          },
          argPackAdvance: 8,
          readValueFromPointer: Ua(b, c, d),
          D: null,
        })
        Ta(b, e)
      },
      f: function (a, b, c) {
        var d = Xa(a, 'enum')
        b = V(b)
        a = d.constructor
        d = Object.create(d.constructor.prototype, {
          value: { value: c },
          constructor: { value: Ia(d.name + '_' + b, function () {}) },
        })
        a.values[c] = d
        a[b] = d
      },
      k: function (a, b, c) {
        c = Ma(c)
        b = V(b)
        U(a, {
          name: b,
          fromWireType: function (d) {
            return d
          },
          toWireType: function (d, e) {
            if ('number' !== typeof e && 'boolean' !== typeof e)
              throw new TypeError(
                'Cannot convert "' + Ya(e) + '" to ' + this.name
              )
            return e
          },
          argPackAdvance: 8,
          readValueFromPointer: Za(b, c),
          D: null,
        })
      },
      i: function (a, b, c, d, e, g) {
        var l = ab(b, c)
        a = V(a)
        e = Z(d, e)
        Ta(
          a,
          function () {
            db('Cannot call ' + a + ' due to unbound types', l)
          },
          b - 1
        )
        La([], l, function (h) {
          var k = [h[0], null].concat(h.slice(1)),
            m = (h = a),
            n = e,
            q = k.length
          2 > q &&
            W(
              "argTypes array size mismatch! Must at least get return value and 'this' types!"
            )
          for (var w = null !== k[1] && !1, x = !1, p = 1; p < k.length; ++p)
            if (null !== k[p] && void 0 === k[p].D) {
              x = !0
              break
            }
          var da = 'void' !== k[0].name,
            y = '',
            E = ''
          for (p = 0; p < q - 2; ++p)
            (y += (0 !== p ? ', ' : '') + 'arg' + p),
              (E += (0 !== p ? ', ' : '') + 'arg' + p + 'Wired')
          m =
            'return function ' +
            Ha(m) +
            '(' +
            y +
            ') {\nif (arguments.length !== ' +
            (q - 2) +
            ") {\nthrowBindingError('function " +
            m +
            " called with ' + arguments.length + ' arguments, expected " +
            (q - 2) +
            " args!');\n}\n"
          x && (m += 'var destructors = [];\n')
          var T = x ? 'destructors' : 'null'
          y =
            'throwBindingError invoker fn runDestructors retType classParam'.split(
              ' '
            )
          n = [W, n, g, Ga, k[0], k[1]]
          w &&
            (m += 'var thisWired = classParam.toWireType(' + T + ', this);\n')
          for (p = 0; p < q - 2; ++p)
            (m +=
              'var arg' +
              p +
              'Wired = argType' +
              p +
              '.toWireType(' +
              T +
              ', arg' +
              p +
              '); // ' +
              k[p + 2].name +
              '\n'),
              y.push('argType' + p),
              n.push(k[p + 2])
          w && (E = 'thisWired' + (0 < E.length ? ', ' : '') + E)
          m +=
            (da ? 'var rv = ' : '') +
            'invoker(fn' +
            (0 < E.length ? ', ' : '') +
            E +
            ');\n'
          if (x) m += 'runDestructors(destructors);\n'
          else
            for (p = w ? 1 : 2; p < k.length; ++p)
              (q = 1 === p ? 'thisWired' : 'arg' + (p - 2) + 'Wired'),
                null !== k[p].D &&
                  ((m += q + '_dtor(' + q + '); // ' + k[p].name + '\n'),
                  y.push(q + '_dtor'),
                  n.push(k[p].D))
          da && (m += 'var ret = retType.fromWireType(rv);\nreturn ret;\n')
          y.push(m + '}\n')
          k = $a(y).apply(null, n)
          p = b - 1
          if (!f.hasOwnProperty(h))
            throw new Ka('Replacing nonexistant public symbol')
          void 0 !== f[h].F && void 0 !== p
            ? (f[h].F[p] = k)
            : ((f[h] = k), (f[h].J = p))
          return []
        })
      },
      d: function (a, b, c, d, e) {
        function g(m) {
          return m
        }
        b = V(b)
        ;-1 === e && (e = 4294967295)
        var l = Ma(c)
        if (0 === d) {
          var h = 32 - 8 * c
          g = function (m) {
            return (m << h) >>> h
          }
        }
        var k = -1 != b.indexOf('unsigned')
        U(a, {
          name: b,
          fromWireType: g,
          toWireType: function (m, n) {
            if ('number' !== typeof n && 'boolean' !== typeof n)
              throw new TypeError(
                'Cannot convert "' + Ya(n) + '" to ' + this.name
              )
            if (n < d || n > e)
              throw new TypeError(
                'Passing a number "' +
                  Ya(n) +
                  '" from JS side to C/C++ side to an argument of type "' +
                  b +
                  '", which is outside the valid range [' +
                  d +
                  ', ' +
                  e +
                  ']!'
              )
            return k ? n >>> 0 : n | 0
          },
          argPackAdvance: 8,
          readValueFromPointer: eb(b, l, 0 !== d),
          D: null,
        })
      },
      c: function (a, b, c) {
        function d(g) {
          g >>= 2
          var l = I
          return new e(G, l[g + 1], l[g])
        }
        var e = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
        ][b]
        c = V(c)
        U(
          a,
          {
            name: c,
            fromWireType: d,
            argPackAdvance: 8,
            readValueFromPointer: d,
          },
          { P: !0 }
        )
      },
      l: function (a, b) {
        b = V(b)
        var c = 'std::string' === b
        U(a, {
          name: b,
          fromWireType: function (d) {
            var e = I[d >> 2]
            if (c)
              for (var g = d + 4, l = 0; l <= e; ++l) {
                var h = d + 4 + l
                if (l == e || 0 == B[h]) {
                  if (g) {
                    for (var k = g + (h - g), m = g; !(m >= k) && B[m]; ) ++m
                    g = ka.decode(B.subarray(g, m))
                  } else g = ''
                  if (void 0 === n) var n = g
                  else (n += String.fromCharCode(0)), (n += g)
                  g = h + 1
                }
              }
            else {
              n = Array(e)
              for (l = 0; l < e; ++l) n[l] = String.fromCharCode(B[d + 4 + l])
              n = n.join('')
            }
            Y(d)
            return n
          },
          toWireType: function (d, e) {
            e instanceof ArrayBuffer && (e = new Uint8Array(e))
            var g = 'string' === typeof e
            g ||
              e instanceof Uint8Array ||
              e instanceof Uint8ClampedArray ||
              e instanceof Int8Array ||
              W('Cannot pass non-string to std::string')
            var l = (
                c && g
                  ? function () {
                      for (var m = 0, n = 0; n < e.length; ++n) {
                        var q = e.charCodeAt(n)
                        55296 <= q &&
                          57343 >= q &&
                          (q =
                            (65536 + ((q & 1023) << 10)) |
                            (e.charCodeAt(++n) & 1023))
                        127 >= q
                          ? ++m
                          : (m = 2047 >= q ? m + 2 : 65535 >= q ? m + 3 : m + 4)
                      }
                      return m
                    }
                  : function () {
                      return e.length
                    }
              )(),
              h = lb(4 + l + 1)
            I[h >> 2] = l
            if (c && g) la(e, h + 4, l + 1)
            else if (g)
              for (g = 0; g < l; ++g) {
                var k = e.charCodeAt(g)
                255 < k &&
                  (Y(h),
                  W('String has UTF-16 code units that do not fit in 8 bits'))
                B[h + 4 + g] = k
              }
            else for (g = 0; g < l; ++g) B[h + 4 + g] = e[g]
            null !== d && d.push(Y, h)
            return h
          },
          argPackAdvance: 8,
          readValueFromPointer: P,
          D: function (d) {
            Y(d)
          },
        })
      },
      h: function (a, b, c) {
        c = V(c)
        if (2 === b) {
          var d = na
          var e = oa
          var g = pa
          var l = function () {
            return C
          }
          var h = 1
        } else
          4 === b &&
            ((d = qa),
            (e = ra),
            (g = sa),
            (l = function () {
              return I
            }),
            (h = 2))
        U(a, {
          name: c,
          fromWireType: function (k) {
            for (var m = I[k >> 2], n = l(), q, w = k + 4, x = 0; x <= m; ++x) {
              var p = k + 4 + x * b
              if (x == m || 0 == n[p >> h])
                (w = d(w, p - w)),
                  void 0 === q
                    ? (q = w)
                    : ((q += String.fromCharCode(0)), (q += w)),
                  (w = p + b)
            }
            Y(k)
            return q
          },
          toWireType: function (k, m) {
            'string' !== typeof m &&
              W('Cannot pass non-string to C++ string type ' + c)
            var n = g(m),
              q = lb(4 + n + b)
            I[q >> 2] = n >> h
            e(m, q + 4, n + b)
            null !== k && k.push(Y, q)
            return q
          },
          argPackAdvance: 8,
          readValueFromPointer: P,
          D: function (k) {
            Y(k)
          },
        })
      },
      n: function (a, b, c, d, e, g) {
        O[a] = { name: V(b), R: Z(c, d), S: Z(e, g), I: [] }
      },
      b: function (a, b, c, d, e, g, l, h, k, m) {
        O[a].I.push({ K: V(b), O: c, M: Z(d, e), N: g, U: l, T: Z(h, k), V: m })
      },
      t: function (a, b) {
        b = V(b)
        U(a, {
          W: !0,
          name: b,
          argPackAdvance: 0,
          fromWireType: function () {},
          toWireType: function () {},
        })
      },
      g: Qa,
      v: function (a) {
        if (0 === a) return Ra(gb())
        var b = fb[a]
        a = void 0 === b ? V(a) : b
        return Ra(gb()[a])
      },
      u: function (a) {
        4 < a && (X[a].H += 1)
      },
      p: function (a, b, c, d) {
        a || W('Cannot use deleted val. handle = ' + a)
        a = X[a].value
        var e = hb[b]
        if (!e) {
          e = ''
          for (var g = 0; g < b; ++g) e += (0 !== g ? ', ' : '') + 'arg' + g
          var l =
            'return function emval_allocator_' +
            b +
            '(constructor, argTypes, args) {\n'
          for (g = 0; g < b; ++g)
            l +=
              'var argType' +
              g +
              " = requireRegisteredType(Module['HEAP32'][(argTypes >>> 2) + " +
              g +
              '], "parameter ' +
              g +
              '");\nvar arg' +
              g +
              ' = argType' +
              g +
              '.readValueFromPointer(args);\nargs += argType' +
              g +
              "['argPackAdvance'];\n"
          e = new Function(
            'requireRegisteredType',
            'Module',
            '__emval_register',
            l +
              ('var obj = new constructor(' +
                e +
                ');\nreturn __emval_register(obj);\n}\n')
          )(Xa, f, Ra)
          hb[b] = e
        }
        return e(a, c, d)
      },
      j: function () {
        u()
      },
      q: function (a, b, c) {
        B.copyWithin(a, b, b + c)
      },
      e: function (a) {
        a >>>= 0
        var b = B.length
        if (2147483648 < a) return !1
        for (var c = 1; 4 >= c; c *= 2) {
          var d = b * (1 + 0.2 / c)
          d = Math.min(d, a + 100663296)
          d = Math.max(16777216, a, d)
          0 < d % 65536 && (d += 65536 - (d % 65536))
          a: {
            try {
              A.grow((Math.min(2147483648, d) - G.byteLength + 65535) >>> 16)
              va(A.buffer)
              var e = 1
              break a
            } catch (g) {}
            e = void 0
          }
          if (e) return !0
        }
        return !1
      },
      a: A,
    }
    ;(function () {
      function a(e) {
        f.asm = e.exports
        J = f.asm.x
        K--
        f.monitorRunDependencies && f.monitorRunDependencies(K)
        0 == K &&
          (null !== Ca && (clearInterval(Ca), (Ca = null)),
          L && ((e = L), (L = null), e()))
      }
      function b(e) {
        a(e.instance)
      }
      function c(e) {
        return Promise.resolve()
          .then(Fa)
          .then(function (g) {
            return WebAssembly.instantiate(g, d)
          })
          .then(e, function (g) {
            v('failed to asynchronously prepare wasm: ' + g)
            u(g)
          })
      }
      var d = { a: mb }
      K++
      f.monitorRunDependencies && f.monitorRunDependencies(K)
      if (f.instantiateWasm)
        try {
          return f.instantiateWasm(d, a)
        } catch (e) {
          return (
            v('Module.instantiateWasm callback failed with error: ' + e), !1
          )
        }
      ;(function () {
        return z ||
          'function' !== typeof WebAssembly.instantiateStreaming ||
          Da() ||
          'function' !== typeof fetch
          ? c(b)
          : fetch(M, { credentials: 'same-origin' }).then(function (e) {
              return WebAssembly.instantiateStreaming(e, d).then(
                b,
                function (g) {
                  v('wasm streaming compile failed: ' + g)
                  v('falling back to ArrayBuffer instantiation')
                  return c(b)
                }
              )
            })
      })().catch(ba)
      return {}
    })()
    var kb = (f.___wasm_call_ctors = function () {
        return (kb = f.___wasm_call_ctors = f.asm.y).apply(null, arguments)
      }),
      lb = (f._malloc = function () {
        return (lb = f._malloc = f.asm.z).apply(null, arguments)
      }),
      Y = (f._free = function () {
        return (Y = f._free = f.asm.A).apply(null, arguments)
      }),
      Wa = (f.___getTypeName = function () {
        return (Wa = f.___getTypeName = f.asm.B).apply(null, arguments)
      })
    f.___embind_register_native_and_builtin_types = function () {
      return (f.___embind_register_native_and_builtin_types = f.asm.C).apply(
        null,
        arguments
      )
    }
    var nb
    L = function ob() {
      nb || pb()
      nb || (L = ob)
    }
    function pb() {
      function a() {
        if (!nb && ((nb = !0), (f.calledRun = !0), !ja)) {
          N(ya)
          N(za)
          aa(f)
          if (f.onRuntimeInitialized) f.onRuntimeInitialized()
          if (f.postRun)
            for (
              'function' == typeof f.postRun && (f.postRun = [f.postRun]);
              f.postRun.length;

            ) {
              var b = f.postRun.shift()
              Aa.unshift(b)
            }
          N(Aa)
        }
      }
      if (!(0 < K)) {
        if (f.preRun)
          for (
            'function' == typeof f.preRun && (f.preRun = [f.preRun]);
            f.preRun.length;

          )
            Ba()
        N(xa)
        0 < K ||
          (f.setStatus
            ? (f.setStatus('Running...'),
              setTimeout(function () {
                setTimeout(function () {
                  f.setStatus('')
                }, 1)
                a()
              }, 1))
            : a())
      }
    }
    f.run = pb
    if (f.preInit)
      for (
        'function' == typeof f.preInit && (f.preInit = [f.preInit]);
        0 < f.preInit.length;

      )
        f.preInit.pop()()
    noExitRuntime = !0
    pb()

    return Module.ready
  }
})()
export default Module
