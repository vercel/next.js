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
    var da = './this.program'
    function ea(a, b) {
      throw b
    }
    var fa = '',
      ha,
      ia,
      ja,
      ka
    fa = __dirname + '/'
    ha = function (a) {
      ja || (ja = require('fs'))
      ka || (ka = require('path'))
      a = ka.normalize(a)
      return ja.readFileSync(a, null)
    }
    ia = function (a) {
      a = ha(a)
      a.buffer || (a = new Uint8Array(a))
      a.buffer || u('Assertion failed: undefined')
      return a
    }
    ea = function (a) {
      process.exit(a)
    }
    f.inspect = function () {
      return '[Emscripten Module object]'
    }
    var ma = f.print || console.log.bind(console),
      v = f.printErr || console.warn.bind(console)
    for (t in r) r.hasOwnProperty(t) && (f[t] = r[t])
    r = null
    f.thisProgram && (da = f.thisProgram)
    f.quit && (ea = f.quit)
    var w
    f.wasmBinary && (w = f.wasmBinary)
    var noExitRuntime
    f.noExitRuntime && (noExitRuntime = f.noExitRuntime)
    'object' !== typeof WebAssembly && u('no native wasm support detected')
    var A,
      na = !1,
      oa = new TextDecoder('utf8')
    function pa(a, b, c) {
      var d = B
      if (0 < c) {
        c = b + c - 1
        for (var e = 0; e < a.length; ++e) {
          var g = a.charCodeAt(e)
          if (55296 <= g && 57343 >= g) {
            var m = a.charCodeAt(++e)
            g = (65536 + ((g & 1023) << 10)) | (m & 1023)
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
    var qa = new TextDecoder('utf-16le')
    function ra(a, b) {
      var c = a >> 1
      for (b = c + b / 2; !(c >= b) && C[c]; ) ++c
      return qa.decode(B.subarray(a, c << 1))
    }
    function sa(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (2 > c) return 0
      c -= 2
      var d = b
      c = c < 2 * a.length ? c / 2 : a.length
      for (var e = 0; e < c; ++e) (D[b >> 1] = a.charCodeAt(e)), (b += 2)
      D[b >> 1] = 0
      return b - d
    }
    function ta(a) {
      return 2 * a.length
    }
    function ua(a, b) {
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
    function va(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (4 > c) return 0
      var d = b
      c = d + c - 4
      for (var e = 0; e < a.length; ++e) {
        var g = a.charCodeAt(e)
        if (55296 <= g && 57343 >= g) {
          var m = a.charCodeAt(++e)
          g = (65536 + ((g & 1023) << 10)) | (m & 1023)
        }
        F[b >> 2] = g
        b += 4
        if (b + 4 > c) break
      }
      F[b >> 2] = 0
      return b - d
    }
    function wa(a) {
      for (var b = 0, c = 0; c < a.length; ++c) {
        var d = a.charCodeAt(c)
        55296 <= d && 57343 >= d && ++c
        b += 4
      }
      return b
    }
    var G, H, B, D, C, F, I, xa, ya
    function za(a) {
      G = a
      f.HEAP8 = H = new Int8Array(a)
      f.HEAP16 = D = new Int16Array(a)
      f.HEAP32 = F = new Int32Array(a)
      f.HEAPU8 = B = new Uint8Array(a)
      f.HEAPU16 = C = new Uint16Array(a)
      f.HEAPU32 = I = new Uint32Array(a)
      f.HEAPF32 = xa = new Float32Array(a)
      f.HEAPF64 = ya = new Float64Array(a)
    }
    var Aa = f.INITIAL_MEMORY || 16777216
    f.wasmMemory
      ? (A = f.wasmMemory)
      : (A = new WebAssembly.Memory({ initial: Aa / 65536, maximum: 32768 }))
    A && (G = A.buffer)
    Aa = G.byteLength
    za(G)
    var J,
      Ba = [],
      Ca = [],
      Da = [],
      Ea = []
    function Fa() {
      var a = f.preRun.shift()
      Ba.unshift(a)
    }
    var K = 0,
      Ga = null,
      L = null
    f.preloadedImages = {}
    f.preloadedAudios = {}
    function u(a) {
      if (f.onAbort) f.onAbort(a)
      v(a)
      na = !0
      a = new WebAssembly.RuntimeError(
        'abort(' + a + '). Build with -s ASSERTIONS=1 for more info.'
      )
      ba(a)
      throw a
    }
    function Ha() {
      var a = M
      return String.prototype.startsWith
        ? a.startsWith('data:application/octet-stream;base64,')
        : 0 === a.indexOf('data:application/octet-stream;base64,')
    }
    var M = 'mozjpeg_node_enc.wasm'
    if (!Ha()) {
      var Ia = M
      M = f.locateFile ? f.locateFile(Ia, fa) : fa + Ia
    }
    function Ja() {
      try {
        if (w) return new Uint8Array(w)
        if (ia) return ia(M)
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
          var c = b.R
          'number' === typeof c
            ? void 0 === b.L
              ? J.get(c)()
              : J.get(c)(b.L)
            : c(void 0 === b.L ? null : b.L)
        }
      }
    }
    var O = {}
    function Ka(a) {
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
    function La(a) {
      if (void 0 === a) return '_unknown'
      a = a.replace(/[^a-zA-Z0-9_]/g, '$')
      var b = a.charCodeAt(0)
      return 48 <= b && 57 >= b ? '_' + a : a
    }
    function Ma(a, b) {
      a = La(a)
      return new Function(
        'body',
        'return function ' +
          a +
          '() {\n    "use strict";    return body.apply(this, arguments);\n};\n'
      )(b)
    }
    function Na(a) {
      var b = Error,
        c = Ma(a, function (d) {
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
    var Oa = void 0
    function Pa(a, b, c) {
      function d(h) {
        h = c(h)
        if (h.length !== a.length)
          throw new Oa('Mismatched type converter count')
        for (var k = 0; k < a.length; ++k) U(a[k], h[k])
      }
      a.forEach(function (h) {
        S[h] = b
      })
      var e = Array(b.length),
        g = [],
        m = 0
      b.forEach(function (h, k) {
        R.hasOwnProperty(h)
          ? (e[k] = R[h])
          : (g.push(h),
            Q.hasOwnProperty(h) || (Q[h] = []),
            Q[h].push(function () {
              e[k] = R[h]
              ++m
              m === g.length && d(e)
            }))
      })
      0 === g.length && d(e)
    }
    function Qa(a) {
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
    var Ra = void 0
    function V(a) {
      for (var b = ''; B[a]; ) b += Ra[B[a++]]
      return b
    }
    var Sa = void 0
    function W(a) {
      throw new Sa(a)
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
        if (c.V) return
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
    var Ta = [],
      X = [{}, { value: void 0 }, { value: null }, { value: !0 }, { value: !1 }]
    function Ua(a) {
      4 < a && 0 === --X[a].M && ((X[a] = void 0), Ta.push(a))
    }
    function Va(a) {
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
          var b = Ta.length ? Ta.pop() : X.length
          X[b] = { M: 1, value: a }
          return b
      }
    }
    function Wa(a) {
      if (null === a) return 'null'
      var b = typeof a
      return 'object' === b || 'array' === b || 'function' === b
        ? a.toString()
        : '' + a
    }
    function Xa(a, b) {
      switch (b) {
        case 2:
          return function (c) {
            return this.fromWireType(xa[c >> 2])
          }
        case 3:
          return function (c) {
            return this.fromWireType(ya[c >> 3])
          }
        default:
          throw new TypeError('Unknown float type: ' + a)
      }
    }
    function Ya(a) {
      var b = Function
      if (!(b instanceof Function))
        throw new TypeError(
          'new_ called with constructor type ' +
            typeof b +
            ' which is not a function'
        )
      var c = Ma(b.name || 'unknownFunctionName', function () {})
      c.prototype = b.prototype
      c = new c()
      a = b.apply(c, a)
      return a instanceof Object ? a : c
    }
    function Za(a, b) {
      var c = f
      if (void 0 === c[a].J) {
        var d = c[a]
        c[a] = function () {
          c[a].J.hasOwnProperty(arguments.length) ||
            W(
              "Function '" +
                b +
                "' called with an invalid number of arguments (" +
                arguments.length +
                ') - expects one of (' +
                c[a].J +
                ')!'
            )
          return c[a].J[arguments.length].apply(this, arguments)
        }
        c[a].J = []
        c[a].J[d.O] = d
      }
    }
    function $a(a, b, c) {
      f.hasOwnProperty(a)
        ? ((void 0 === c || (void 0 !== f[a].J && void 0 !== f[a].J[c])) &&
            W("Cannot register public name '" + a + "' twice"),
          Za(a, a),
          f.hasOwnProperty(c) &&
            W(
              'Cannot register multiple overloads of a function with the same number of arguments (' +
                c +
                ')!'
            ),
          (f[a].J[c] = b))
        : ((f[a] = b), void 0 !== c && (f[a].ba = c))
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
    function Y(a, b) {
      a = V(a)
      var c = -1 != a.indexOf('j') ? bb(a, b) : J.get(b)
      'function' !== typeof c &&
        W('unknown function pointer with signature ' + a + ': ' + b)
      return c
    }
    var cb = void 0
    function db(a) {
      a = eb(a)
      var b = V(a)
      Z(a)
      return b
    }
    function fb(a, b) {
      function c(g) {
        e[g] || R[g] || (S[g] ? S[g].forEach(c) : (d.push(g), (e[g] = !0)))
      }
      var d = [],
        e = {}
      b.forEach(c)
      throw new cb(a + ': ' + d.map(db).join([', ']))
    }
    function gb(a, b, c) {
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
    var hb = {}
    function ib() {
      return 'object' === typeof globalThis
        ? globalThis
        : Function('return this')()
    }
    function jb(a, b) {
      var c = R[a]
      void 0 === c && W(b + ' has unknown type ' + db(a))
      return c
    }
    var kb = {},
      lb = {}
    function mb() {
      if (!nb) {
        var a = {
            USER: 'web_user',
            LOGNAME: 'web_user',
            PATH: '/',
            PWD: '/',
            HOME: '/home/web_user',
            LANG:
              (
                ('object' === typeof navigator &&
                  navigator.languages &&
                  navigator.languages[0]) ||
                'C'
              ).replace('-', '_') + '.UTF-8',
            _: da || './this.program',
          },
          b
        for (b in lb) a[b] = lb[b]
        var c = []
        for (b in a) c.push(b + '=' + a[b])
        nb = c
      }
      return nb
    }
    var nb,
      ob = [null, [], []]
    Oa = f.InternalError = Na('InternalError')
    for (var pb = Array(256), qb = 0; 256 > qb; ++qb)
      pb[qb] = String.fromCharCode(qb)
    Ra = pb
    Sa = f.BindingError = Na('BindingError')
    f.count_emval_handles = function () {
      for (var a = 0, b = 5; b < X.length; ++b) void 0 !== X[b] && ++a
      return a
    }
    f.get_first_emval = function () {
      for (var a = 5; a < X.length; ++a) if (void 0 !== X[a]) return X[a]
      return null
    }
    cb = f.UnboundTypeError = Na('UnboundTypeError')
    Ca.push({
      R: function () {
        rb()
      },
    })
    var tb = {
      B: function () {},
      n: function (a) {
        var b = O[a]
        delete O[a]
        var c = b.W,
          d = b.X,
          e = b.N,
          g = e
            .map(function (m) {
              return m.U
            })
            .concat(
              e.map(function (m) {
                return m.Z
              })
            )
        Pa([a], g, function (m) {
          var h = {}
          e.forEach(function (k, n) {
            var l = m[n],
              p = k.S,
              x = k.T,
              y = m[n + e.length],
              q = k.Y,
              ca = k.$
            h[k.P] = {
              read: function (z) {
                return l.fromWireType(p(x, z))
              },
              write: function (z, E) {
                var T = []
                q(ca, z, y.toWireType(T, E))
                Ka(T)
              },
            }
          })
          return [
            {
              name: b.name,
              fromWireType: function (k) {
                var n = {},
                  l
                for (l in h) n[l] = h[l].read(k)
                d(k)
                return n
              },
              toWireType: function (k, n) {
                for (var l in h)
                  if (!(l in n))
                    throw new TypeError('Missing field:  "' + l + '"')
                var p = c()
                for (l in h) h[l].write(p, n[l])
                null !== k && k.push(d, p)
                return p
              },
              argPackAdvance: 8,
              readValueFromPointer: P,
              K: d,
            },
          ]
        })
      },
      y: function (a, b, c, d, e) {
        var g = Qa(c)
        b = V(b)
        U(a, {
          name: b,
          fromWireType: function (m) {
            return !!m
          },
          toWireType: function (m, h) {
            return h ? d : e
          },
          argPackAdvance: 8,
          readValueFromPointer: function (m) {
            if (1 === c) var h = H
            else if (2 === c) h = D
            else if (4 === c) h = F
            else throw new TypeError('Unknown boolean type size: ' + b)
            return this.fromWireType(h[m >> g])
          },
          K: null,
        })
      },
      x: function (a, b) {
        b = V(b)
        U(a, {
          name: b,
          fromWireType: function (c) {
            var d = X[c].value
            Ua(c)
            return d
          },
          toWireType: function (c, d) {
            return Va(d)
          },
          argPackAdvance: 8,
          readValueFromPointer: P,
          K: null,
        })
      },
      k: function (a, b, c) {
        c = Qa(c)
        b = V(b)
        U(a, {
          name: b,
          fromWireType: function (d) {
            return d
          },
          toWireType: function (d, e) {
            if ('number' !== typeof e && 'boolean' !== typeof e)
              throw new TypeError(
                'Cannot convert "' + Wa(e) + '" to ' + this.name
              )
            return e
          },
          argPackAdvance: 8,
          readValueFromPointer: Xa(b, c),
          K: null,
        })
      },
      g: function (a, b, c, d, e, g) {
        var m = ab(b, c)
        a = V(a)
        e = Y(d, e)
        $a(
          a,
          function () {
            fb('Cannot call ' + a + ' due to unbound types', m)
          },
          b - 1
        )
        Pa([], m, function (h) {
          var k = [h[0], null].concat(h.slice(1)),
            n = (h = a),
            l = e,
            p = k.length
          2 > p &&
            W(
              "argTypes array size mismatch! Must at least get return value and 'this' types!"
            )
          for (var x = null !== k[1] && !1, y = !1, q = 1; q < k.length; ++q)
            if (null !== k[q] && void 0 === k[q].K) {
              y = !0
              break
            }
          var ca = 'void' !== k[0].name,
            z = '',
            E = ''
          for (q = 0; q < p - 2; ++q)
            (z += (0 !== q ? ', ' : '') + 'arg' + q),
              (E += (0 !== q ? ', ' : '') + 'arg' + q + 'Wired')
          n =
            'return function ' +
            La(n) +
            '(' +
            z +
            ') {\nif (arguments.length !== ' +
            (p - 2) +
            ") {\nthrowBindingError('function " +
            n +
            " called with ' + arguments.length + ' arguments, expected " +
            (p - 2) +
            " args!');\n}\n"
          y && (n += 'var destructors = [];\n')
          var T = y ? 'destructors' : 'null'
          z =
            'throwBindingError invoker fn runDestructors retType classParam'.split(
              ' '
            )
          l = [W, l, g, Ka, k[0], k[1]]
          x &&
            (n += 'var thisWired = classParam.toWireType(' + T + ', this);\n')
          for (q = 0; q < p - 2; ++q)
            (n +=
              'var arg' +
              q +
              'Wired = argType' +
              q +
              '.toWireType(' +
              T +
              ', arg' +
              q +
              '); // ' +
              k[q + 2].name +
              '\n'),
              z.push('argType' + q),
              l.push(k[q + 2])
          x && (E = 'thisWired' + (0 < E.length ? ', ' : '') + E)
          n +=
            (ca ? 'var rv = ' : '') +
            'invoker(fn' +
            (0 < E.length ? ', ' : '') +
            E +
            ');\n'
          if (y) n += 'runDestructors(destructors);\n'
          else
            for (q = x ? 1 : 2; q < k.length; ++q)
              (p = 1 === q ? 'thisWired' : 'arg' + (q - 2) + 'Wired'),
                null !== k[q].K &&
                  ((n += p + '_dtor(' + p + '); // ' + k[q].name + '\n'),
                  z.push(p + '_dtor'),
                  l.push(k[q].K))
          ca && (n += 'var ret = retType.fromWireType(rv);\nreturn ret;\n')
          z.push(n + '}\n')
          k = Ya(z).apply(null, l)
          q = b - 1
          if (!f.hasOwnProperty(h))
            throw new Oa('Replacing nonexistant public symbol')
          void 0 !== f[h].J && void 0 !== q
            ? (f[h].J[q] = k)
            : ((f[h] = k), (f[h].O = q))
          return []
        })
      },
      d: function (a, b, c, d, e) {
        function g(n) {
          return n
        }
        b = V(b)
        ;-1 === e && (e = 4294967295)
        var m = Qa(c)
        if (0 === d) {
          var h = 32 - 8 * c
          g = function (n) {
            return (n << h) >>> h
          }
        }
        var k = -1 != b.indexOf('unsigned')
        U(a, {
          name: b,
          fromWireType: g,
          toWireType: function (n, l) {
            if ('number' !== typeof l && 'boolean' !== typeof l)
              throw new TypeError(
                'Cannot convert "' + Wa(l) + '" to ' + this.name
              )
            if (l < d || l > e)
              throw new TypeError(
                'Passing a number "' +
                  Wa(l) +
                  '" from JS side to C/C++ side to an argument of type "' +
                  b +
                  '", which is outside the valid range [' +
                  d +
                  ', ' +
                  e +
                  ']!'
              )
            return k ? l >>> 0 : l | 0
          },
          argPackAdvance: 8,
          readValueFromPointer: gb(b, m, 0 !== d),
          K: null,
        })
      },
      c: function (a, b, c) {
        function d(g) {
          g >>= 2
          var m = I
          return new e(G, m[g + 1], m[g])
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
          { V: !0 }
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
              for (var g = d + 4, m = 0; m <= e; ++m) {
                var h = d + 4 + m
                if (m == e || 0 == B[h]) {
                  if (g) {
                    for (var k = g + (h - g), n = g; !(n >= k) && B[n]; ) ++n
                    g = oa.decode(B.subarray(g, n))
                  } else g = ''
                  if (void 0 === l) var l = g
                  else (l += String.fromCharCode(0)), (l += g)
                  g = h + 1
                }
              }
            else {
              l = Array(e)
              for (m = 0; m < e; ++m) l[m] = String.fromCharCode(B[d + 4 + m])
              l = l.join('')
            }
            Z(d)
            return l
          },
          toWireType: function (d, e) {
            e instanceof ArrayBuffer && (e = new Uint8Array(e))
            var g = 'string' === typeof e
            g ||
              e instanceof Uint8Array ||
              e instanceof Uint8ClampedArray ||
              e instanceof Int8Array ||
              W('Cannot pass non-string to std::string')
            var m = (
                c && g
                  ? function () {
                      for (var n = 0, l = 0; l < e.length; ++l) {
                        var p = e.charCodeAt(l)
                        55296 <= p &&
                          57343 >= p &&
                          (p =
                            (65536 + ((p & 1023) << 10)) |
                            (e.charCodeAt(++l) & 1023))
                        127 >= p
                          ? ++n
                          : (n = 2047 >= p ? n + 2 : 65535 >= p ? n + 3 : n + 4)
                      }
                      return n
                    }
                  : function () {
                      return e.length
                    }
              )(),
              h = sb(4 + m + 1)
            I[h >> 2] = m
            if (c && g) pa(e, h + 4, m + 1)
            else if (g)
              for (g = 0; g < m; ++g) {
                var k = e.charCodeAt(g)
                255 < k &&
                  (Z(h),
                  W('String has UTF-16 code units that do not fit in 8 bits'))
                B[h + 4 + g] = k
              }
            else for (g = 0; g < m; ++g) B[h + 4 + g] = e[g]
            null !== d && d.push(Z, h)
            return h
          },
          argPackAdvance: 8,
          readValueFromPointer: P,
          K: function (d) {
            Z(d)
          },
        })
      },
      f: function (a, b, c) {
        c = V(c)
        if (2 === b) {
          var d = ra
          var e = sa
          var g = ta
          var m = function () {
            return C
          }
          var h = 1
        } else
          4 === b &&
            ((d = ua),
            (e = va),
            (g = wa),
            (m = function () {
              return I
            }),
            (h = 2))
        U(a, {
          name: c,
          fromWireType: function (k) {
            for (var n = I[k >> 2], l = m(), p, x = k + 4, y = 0; y <= n; ++y) {
              var q = k + 4 + y * b
              if (y == n || 0 == l[q >> h])
                (x = d(x, q - x)),
                  void 0 === p
                    ? (p = x)
                    : ((p += String.fromCharCode(0)), (p += x)),
                  (x = q + b)
            }
            Z(k)
            return p
          },
          toWireType: function (k, n) {
            'string' !== typeof n &&
              W('Cannot pass non-string to C++ string type ' + c)
            var l = g(n),
              p = sb(4 + l + b)
            I[p >> 2] = l >> h
            e(n, p + 4, l + b)
            null !== k && k.push(Z, p)
            return p
          },
          argPackAdvance: 8,
          readValueFromPointer: P,
          K: function (k) {
            Z(k)
          },
        })
      },
      o: function (a, b, c, d, e, g) {
        O[a] = { name: V(b), W: Y(c, d), X: Y(e, g), N: [] }
      },
      b: function (a, b, c, d, e, g, m, h, k, n) {
        O[a].N.push({ P: V(b), U: c, S: Y(d, e), T: g, Z: m, Y: Y(h, k), $: n })
      },
      z: function (a, b) {
        b = V(b)
        U(a, {
          aa: !0,
          name: b,
          argPackAdvance: 0,
          fromWireType: function () {},
          toWireType: function () {},
        })
      },
      h: Ua,
      v: function (a) {
        if (0 === a) return Va(ib())
        var b = hb[a]
        a = void 0 === b ? V(a) : b
        return Va(ib()[a])
      },
      m: function (a) {
        4 < a && (X[a].M += 1)
      },
      p: function (a, b, c, d) {
        a || W('Cannot use deleted val. handle = ' + a)
        a = X[a].value
        var e = kb[b]
        if (!e) {
          e = ''
          for (var g = 0; g < b; ++g) e += (0 !== g ? ', ' : '') + 'arg' + g
          var m =
            'return function emval_allocator_' +
            b +
            '(constructor, argTypes, args) {\n'
          for (g = 0; g < b; ++g)
            m +=
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
            m +
              ('var obj = new constructor(' +
                e +
                ');\nreturn __emval_register(obj);\n}\n')
          )(jb, f, Va)
          kb[b] = e
        }
        return e(a, c, d)
      },
      i: function () {
        u()
      },
      s: function (a, b, c) {
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
              za(A.buffer)
              var e = 1
              break a
            } catch (g) {}
            e = void 0
          }
          if (e) return !0
        }
        return !1
      },
      t: function (a, b) {
        var c = 0
        mb().forEach(function (d, e) {
          var g = b + c
          e = F[(a + 4 * e) >> 2] = g
          for (g = 0; g < d.length; ++g) H[e++ >> 0] = d.charCodeAt(g)
          H[e >> 0] = 0
          c += d.length + 1
        })
        return 0
      },
      u: function (a, b) {
        var c = mb()
        F[a >> 2] = c.length
        var d = 0
        c.forEach(function (e) {
          d += e.length + 1
        })
        F[b >> 2] = d
        return 0
      },
      A: function (a) {
        if (!noExitRuntime) {
          if (f.onExit) f.onExit(a)
          na = !0
        }
        ea(a, new la(a))
      },
      w: function () {
        return 0
      },
      q: function () {},
      j: function (a, b, c, d) {
        for (var e = 0, g = 0; g < c; g++) {
          for (
            var m = F[(b + 8 * g) >> 2], h = F[(b + (8 * g + 4)) >> 2], k = 0;
            k < h;
            k++
          ) {
            var n = B[m + k],
              l = ob[a]
            if (0 === n || 10 === n) {
              n = 1 === a ? ma : v
              var p
              for (p = 0; l[p] && !(NaN <= p); ) ++p
              p = oa.decode(
                l.subarray ? l.subarray(0, p) : new Uint8Array(l.slice(0, p))
              )
              n(p)
              l.length = 0
            } else l.push(n)
          }
          e += h
        }
        F[d >> 2] = e
        return 0
      },
      a: A,
      r: function () {},
    }
    ;(function () {
      function a(e) {
        f.asm = e.exports
        J = f.asm.C
        K--
        f.monitorRunDependencies && f.monitorRunDependencies(K)
        0 == K &&
          (null !== Ga && (clearInterval(Ga), (Ga = null)),
          L && ((e = L), (L = null), e()))
      }
      function b(e) {
        a(e.instance)
      }
      function c(e) {
        return Promise.resolve()
          .then(Ja)
          .then(function (g) {
            return WebAssembly.instantiate(g, d)
          })
          .then(e, function (g) {
            v('failed to asynchronously prepare wasm: ' + g)
            u(g)
          })
      }
      var d = { a: tb }
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
        return w ||
          'function' !== typeof WebAssembly.instantiateStreaming ||
          Ha() ||
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
    var rb = (f.___wasm_call_ctors = function () {
        return (rb = f.___wasm_call_ctors = f.asm.D).apply(null, arguments)
      }),
      sb = (f._malloc = function () {
        return (sb = f._malloc = f.asm.E).apply(null, arguments)
      }),
      Z = (f._free = function () {
        return (Z = f._free = f.asm.F).apply(null, arguments)
      }),
      eb = (f.___getTypeName = function () {
        return (eb = f.___getTypeName = f.asm.G).apply(null, arguments)
      })
    f.___embind_register_native_and_builtin_types = function () {
      return (f.___embind_register_native_and_builtin_types = f.asm.H).apply(
        null,
        arguments
      )
    }
    f.dynCall_jiji = function () {
      return (f.dynCall_jiji = f.asm.I).apply(null, arguments)
    }
    var ub
    function la(a) {
      this.name = 'ExitStatus'
      this.message = 'Program terminated with exit(' + a + ')'
      this.status = a
    }
    L = function vb() {
      ub || wb()
      ub || (L = vb)
    }
    function wb() {
      function a() {
        if (!ub && ((ub = !0), (f.calledRun = !0), !na)) {
          N(Ca)
          N(Da)
          aa(f)
          if (f.onRuntimeInitialized) f.onRuntimeInitialized()
          if (f.postRun)
            for (
              'function' == typeof f.postRun && (f.postRun = [f.postRun]);
              f.postRun.length;

            ) {
              var b = f.postRun.shift()
              Ea.unshift(b)
            }
          N(Ea)
        }
      }
      if (!(0 < K)) {
        if (f.preRun)
          for (
            'function' == typeof f.preRun && (f.preRun = [f.preRun]);
            f.preRun.length;

          )
            Fa()
        N(Ba)
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
    f.run = wb
    if (f.preInit)
      for (
        'function' == typeof f.preInit && (f.preInit = [f.preInit]);
        0 < f.preInit.length;

      )
        f.preInit.pop()()
    noExitRuntime = !0
    wb()

    return Module.ready
  }
})()
export default Module
