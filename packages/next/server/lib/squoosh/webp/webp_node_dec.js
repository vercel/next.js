/* eslint-disable */
import { TextDecoder } from '../text-decoder'

var Module = (function () {
  // var _scriptDir = import.meta.url

  return function (Module) {
    Module = Module || {}

    var e
    e || (e = typeof Module !== 'undefined' ? Module : {})
    var aa, r
    e.ready = new Promise(function (a, b) {
      aa = a
      r = b
    })
    var t = {},
      u
    for (u in e) e.hasOwnProperty(u) && (t[u] = e[u])
    var v = '',
      ba,
      ca,
      da,
      ea
    v = __dirname + '/'
    ba = function (a) {
      da || (da = require('fs'))
      ea || (ea = require('path'))
      a = ea.normalize(a)
      return da.readFileSync(a, null)
    }
    ca = function (a) {
      a = ba(a)
      a.buffer || (a = new Uint8Array(a))
      a.buffer || x('Assertion failed: undefined')
      return a
    }
    e.inspect = function () {
      return '[Emscripten Module object]'
    }
    e.print || console.log.bind(console)
    var y = e.printErr || console.warn.bind(console)
    for (u in t) t.hasOwnProperty(u) && (e[u] = t[u])
    t = null
    var z
    e.wasmBinary && (z = e.wasmBinary)
    var noExitRuntime
    e.noExitRuntime && (noExitRuntime = e.noExitRuntime)
    'object' !== typeof WebAssembly && x('no native wasm support detected')
    var B,
      fa = !1,
      ha = new TextDecoder('utf8')
    function ia(a, b, c) {
      var d = C
      if (0 < c) {
        c = b + c - 1
        for (var f = 0; f < a.length; ++f) {
          var g = a.charCodeAt(f)
          if (55296 <= g && 57343 >= g) {
            var l = a.charCodeAt(++f)
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
    var ja = new TextDecoder('utf-16le')
    function ka(a, b) {
      var c = a >> 1
      for (b = c + b / 2; !(c >= b) && D[c]; ) ++c
      return ja.decode(C.subarray(a, c << 1))
    }
    function la(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (2 > c) return 0
      c -= 2
      var d = b
      c = c < 2 * a.length ? c / 2 : a.length
      for (var f = 0; f < c; ++f) (E[b >> 1] = a.charCodeAt(f)), (b += 2)
      E[b >> 1] = 0
      return b - d
    }
    function ma(a) {
      return 2 * a.length
    }
    function na(a, b) {
      for (var c = 0, d = ''; !(c >= b / 4); ) {
        var f = F[(a + 4 * c) >> 2]
        if (0 == f) break
        ++c
        65536 <= f
          ? ((f -= 65536),
            (d += String.fromCharCode(55296 | (f >> 10), 56320 | (f & 1023))))
          : (d += String.fromCharCode(f))
      }
      return d
    }
    function oa(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (4 > c) return 0
      var d = b
      c = d + c - 4
      for (var f = 0; f < a.length; ++f) {
        var g = a.charCodeAt(f)
        if (55296 <= g && 57343 >= g) {
          var l = a.charCodeAt(++f)
          g = (65536 + ((g & 1023) << 10)) | (l & 1023)
        }
        F[b >> 2] = g
        b += 4
        if (b + 4 > c) break
      }
      F[b >> 2] = 0
      return b - d
    }
    function pa(a) {
      for (var b = 0, c = 0; c < a.length; ++c) {
        var d = a.charCodeAt(c)
        55296 <= d && 57343 >= d && ++c
        b += 4
      }
      return b
    }
    var G, qa, C, E, D, F, I, ra, sa
    function ta(a) {
      G = a
      e.HEAP8 = qa = new Int8Array(a)
      e.HEAP16 = E = new Int16Array(a)
      e.HEAP32 = F = new Int32Array(a)
      e.HEAPU8 = C = new Uint8Array(a)
      e.HEAPU16 = D = new Uint16Array(a)
      e.HEAPU32 = I = new Uint32Array(a)
      e.HEAPF32 = ra = new Float32Array(a)
      e.HEAPF64 = sa = new Float64Array(a)
    }
    var ua = e.INITIAL_MEMORY || 16777216
    e.wasmMemory
      ? (B = e.wasmMemory)
      : (B = new WebAssembly.Memory({ initial: ua / 65536, maximum: 32768 }))
    B && (G = B.buffer)
    ua = G.byteLength
    ta(G)
    var J,
      va = [],
      wa = [],
      xa = [],
      ya = []
    function za() {
      var a = e.preRun.shift()
      va.unshift(a)
    }
    var L = 0,
      Aa = null,
      M = null
    e.preloadedImages = {}
    e.preloadedAudios = {}
    function x(a) {
      if (e.onAbort) e.onAbort(a)
      y(a)
      fa = !0
      a = new WebAssembly.RuntimeError(
        'abort(' + a + '). Build with -s ASSERTIONS=1 for more info.'
      )
      r(a)
      throw a
    }
    function Ba() {
      var a = N
      return String.prototype.startsWith
        ? a.startsWith('data:application/octet-stream;base64,')
        : 0 === a.indexOf('data:application/octet-stream;base64,')
    }
    var N = 'webp_node_dec.wasm'
    if (!Ba()) {
      var Ca = N
      N = e.locateFile ? e.locateFile(Ca, v) : v + Ca
    }
    function Da() {
      try {
        if (z) return new Uint8Array(z)
        if (ca) return ca(N)
        throw 'both async and sync fetching of the wasm failed'
      } catch (a) {
        x(a)
      }
    }
    function O(a) {
      for (; 0 < a.length; ) {
        var b = a.shift()
        if ('function' == typeof b) b(e)
        else {
          var c = b.G
          'number' === typeof c
            ? void 0 === b.C
              ? J.get(c)()
              : J.get(c)(b.C)
            : c(void 0 === b.C ? null : b.C)
        }
      }
    }
    function Ea(a) {
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
    var Fa = void 0
    function P(a) {
      for (var b = ''; C[a]; ) b += Fa[C[a++]]
      return b
    }
    var Q = {},
      R = {},
      S = {}
    function Ga(a) {
      if (void 0 === a) return '_unknown'
      a = a.replace(/[^a-zA-Z0-9_]/g, '$')
      var b = a.charCodeAt(0)
      return 48 <= b && 57 >= b ? '_' + a : a
    }
    function Ha(a, b) {
      a = Ga(a)
      return new Function(
        'body',
        'return function ' +
          a +
          '() {\n    "use strict";    return body.apply(this, arguments);\n};\n'
      )(b)
    }
    function Ia(a) {
      var b = Error,
        c = Ha(a, function (d) {
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
    var Ja = void 0
    function T(a) {
      throw new Ja(a)
    }
    var Ka = void 0
    function La(a, b) {
      function c(h) {
        h = b(h)
        if (h.length !== d.length)
          throw new Ka('Mismatched type converter count')
        for (var k = 0; k < d.length; ++k) U(d[k], h[k])
      }
      var d = []
      d.forEach(function (h) {
        S[h] = a
      })
      var f = Array(a.length),
        g = [],
        l = 0
      a.forEach(function (h, k) {
        R.hasOwnProperty(h)
          ? (f[k] = R[h])
          : (g.push(h),
            Q.hasOwnProperty(h) || (Q[h] = []),
            Q[h].push(function () {
              f[k] = R[h]
              ++l
              l === g.length && c(f)
            }))
      })
      0 === g.length && c(f)
    }
    function U(a, b, c) {
      c = c || {}
      if (!('argPackAdvance' in b))
        throw new TypeError(
          'registerType registeredInstance requires argPackAdvance'
        )
      var d = b.name
      a || T('type "' + d + '" must have a positive integer typeid pointer')
      if (R.hasOwnProperty(a)) {
        if (c.H) return
        T("Cannot register type '" + d + "' twice")
      }
      R[a] = b
      delete S[a]
      Q.hasOwnProperty(a) &&
        ((b = Q[a]),
        delete Q[a],
        b.forEach(function (f) {
          f()
        }))
    }
    var Oa = [],
      V = [{}, { value: void 0 }, { value: null }, { value: !0 }, { value: !1 }]
    function Pa(a) {
      4 < a && 0 === --V[a].D && ((V[a] = void 0), Oa.push(a))
    }
    function W(a) {
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
          var b = Oa.length ? Oa.pop() : V.length
          V[b] = { D: 1, value: a }
          return b
      }
    }
    function Qa(a) {
      return this.fromWireType(I[a >> 2])
    }
    function Ra(a) {
      if (null === a) return 'null'
      var b = typeof a
      return 'object' === b || 'array' === b || 'function' === b
        ? a.toString()
        : '' + a
    }
    function Sa(a, b) {
      switch (b) {
        case 2:
          return function (c) {
            return this.fromWireType(ra[c >> 2])
          }
        case 3:
          return function (c) {
            return this.fromWireType(sa[c >> 3])
          }
        default:
          throw new TypeError('Unknown float type: ' + a)
      }
    }
    function Ta(a) {
      var b = Function
      if (!(b instanceof Function))
        throw new TypeError(
          'new_ called with constructor type ' +
            typeof b +
            ' which is not a function'
        )
      var c = Ha(b.name || 'unknownFunctionName', function () {})
      c.prototype = b.prototype
      c = new c()
      a = b.apply(c, a)
      return a instanceof Object ? a : c
    }
    function Ua(a) {
      for (; a.length; ) {
        var b = a.pop()
        a.pop()(b)
      }
    }
    function Va(a, b) {
      var c = e
      if (void 0 === c[a].A) {
        var d = c[a]
        c[a] = function () {
          c[a].A.hasOwnProperty(arguments.length) ||
            T(
              "Function '" +
                b +
                "' called with an invalid number of arguments (" +
                arguments.length +
                ') - expects one of (' +
                c[a].A +
                ')!'
            )
          return c[a].A[arguments.length].apply(this, arguments)
        }
        c[a].A = []
        c[a].A[d.F] = d
      }
    }
    function Wa(a, b, c) {
      e.hasOwnProperty(a)
        ? ((void 0 === c || (void 0 !== e[a].A && void 0 !== e[a].A[c])) &&
            T("Cannot register public name '" + a + "' twice"),
          Va(a, a),
          e.hasOwnProperty(c) &&
            T(
              'Cannot register multiple overloads of a function with the same number of arguments (' +
                c +
                ')!'
            ),
          (e[a].A[c] = b))
        : ((e[a] = b), void 0 !== c && (e[a].J = c))
    }
    function Xa(a, b) {
      for (var c = [], d = 0; d < a; d++) c.push(F[(b >> 2) + d])
      return c
    }
    function Ya(a, b) {
      0 <= a.indexOf('j') ||
        x('Assertion failed: getDynCaller should only be called with i64 sigs')
      var c = []
      return function () {
        c.length = arguments.length
        for (var d = 0; d < arguments.length; d++) c[d] = arguments[d]
        var f
        ;-1 != a.indexOf('j')
          ? (f =
              c && c.length
                ? e['dynCall_' + a].apply(null, [b].concat(c))
                : e['dynCall_' + a].call(null, b))
          : (f = J.get(b).apply(null, c))
        return f
      }
    }
    function Za(a, b) {
      a = P(a)
      var c = -1 != a.indexOf('j') ? Ya(a, b) : J.get(b)
      'function' !== typeof c &&
        T('unknown function pointer with signature ' + a + ': ' + b)
      return c
    }
    var $a = void 0
    function ab(a) {
      a = bb(a)
      var b = P(a)
      X(a)
      return b
    }
    function cb(a, b) {
      function c(g) {
        f[g] || R[g] || (S[g] ? S[g].forEach(c) : (d.push(g), (f[g] = !0)))
      }
      var d = [],
        f = {}
      b.forEach(c)
      throw new $a(a + ': ' + d.map(ab).join([', ']))
    }
    function db(a, b, c) {
      switch (b) {
        case 0:
          return c
            ? function (d) {
                return qa[d]
              }
            : function (d) {
                return C[d]
              }
        case 1:
          return c
            ? function (d) {
                return E[d >> 1]
              }
            : function (d) {
                return D[d >> 1]
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
    var eb = {}
    function fb() {
      return 'object' === typeof globalThis
        ? globalThis
        : Function('return this')()
    }
    function gb(a, b) {
      var c = R[a]
      void 0 === c && T(b + ' has unknown type ' + ab(a))
      return c
    }
    for (var hb = {}, ib = Array(256), Y = 0; 256 > Y; ++Y)
      ib[Y] = String.fromCharCode(Y)
    Fa = ib
    Ja = e.BindingError = Ia('BindingError')
    Ka = e.InternalError = Ia('InternalError')
    e.count_emval_handles = function () {
      for (var a = 0, b = 5; b < V.length; ++b) void 0 !== V[b] && ++a
      return a
    }
    e.get_first_emval = function () {
      for (var a = 5; a < V.length; ++a) if (void 0 !== V[a]) return V[a]
      return null
    }
    $a = e.UnboundTypeError = Ia('UnboundTypeError')
    wa.push({
      G: function () {
        jb()
      },
    })
    var lb = {
      g: function () {},
      o: function (a, b, c, d, f) {
        var g = Ea(c)
        b = P(b)
        U(a, {
          name: b,
          fromWireType: function (l) {
            return !!l
          },
          toWireType: function (l, h) {
            return h ? d : f
          },
          argPackAdvance: 8,
          readValueFromPointer: function (l) {
            if (1 === c) var h = qa
            else if (2 === c) h = E
            else if (4 === c) h = F
            else throw new TypeError('Unknown boolean type size: ' + b)
            return this.fromWireType(h[l >> g])
          },
          B: null,
        })
      },
      r: function (a, b) {
        b = P(b)
        U(a, {
          name: b,
          fromWireType: function (c) {
            var d = V[c].value
            Pa(c)
            return d
          },
          toWireType: function (c, d) {
            return W(d)
          },
          argPackAdvance: 8,
          readValueFromPointer: Qa,
          B: null,
        })
      },
      n: function (a, b, c) {
        c = Ea(c)
        b = P(b)
        U(a, {
          name: b,
          fromWireType: function (d) {
            return d
          },
          toWireType: function (d, f) {
            if ('number' !== typeof f && 'boolean' !== typeof f)
              throw new TypeError(
                'Cannot convert "' + Ra(f) + '" to ' + this.name
              )
            return f
          },
          argPackAdvance: 8,
          readValueFromPointer: Sa(b, c),
          B: null,
        })
      },
      j: function (a, b, c, d, f, g) {
        var l = Xa(b, c)
        a = P(a)
        f = Za(d, f)
        Wa(
          a,
          function () {
            cb('Cannot call ' + a + ' due to unbound types', l)
          },
          b - 1
        )
        La(l, function (h) {
          var k = [h[0], null].concat(h.slice(1)),
            n = (h = a),
            p = f,
            q = k.length
          2 > q &&
            T(
              "argTypes array size mismatch! Must at least get return value and 'this' types!"
            )
          for (var w = null !== k[1] && !1, A = !1, m = 1; m < k.length; ++m)
            if (null !== k[m] && void 0 === k[m].B) {
              A = !0
              break
            }
          var Ma = 'void' !== k[0].name,
            H = '',
            K = ''
          for (m = 0; m < q - 2; ++m)
            (H += (0 !== m ? ', ' : '') + 'arg' + m),
              (K += (0 !== m ? ', ' : '') + 'arg' + m + 'Wired')
          n =
            'return function ' +
            Ga(n) +
            '(' +
            H +
            ') {\nif (arguments.length !== ' +
            (q - 2) +
            ") {\nthrowBindingError('function " +
            n +
            " called with ' + arguments.length + ' arguments, expected " +
            (q - 2) +
            " args!');\n}\n"
          A && (n += 'var destructors = [];\n')
          var Na = A ? 'destructors' : 'null'
          H =
            'throwBindingError invoker fn runDestructors retType classParam'.split(
              ' '
            )
          p = [T, p, g, Ua, k[0], k[1]]
          w &&
            (n += 'var thisWired = classParam.toWireType(' + Na + ', this);\n')
          for (m = 0; m < q - 2; ++m)
            (n +=
              'var arg' +
              m +
              'Wired = argType' +
              m +
              '.toWireType(' +
              Na +
              ', arg' +
              m +
              '); // ' +
              k[m + 2].name +
              '\n'),
              H.push('argType' + m),
              p.push(k[m + 2])
          w && (K = 'thisWired' + (0 < K.length ? ', ' : '') + K)
          n +=
            (Ma ? 'var rv = ' : '') +
            'invoker(fn' +
            (0 < K.length ? ', ' : '') +
            K +
            ');\n'
          if (A) n += 'runDestructors(destructors);\n'
          else
            for (m = w ? 1 : 2; m < k.length; ++m)
              (q = 1 === m ? 'thisWired' : 'arg' + (m - 2) + 'Wired'),
                null !== k[m].B &&
                  ((n += q + '_dtor(' + q + '); // ' + k[m].name + '\n'),
                  H.push(q + '_dtor'),
                  p.push(k[m].B))
          Ma && (n += 'var ret = retType.fromWireType(rv);\nreturn ret;\n')
          H.push(n + '}\n')
          k = Ta(H).apply(null, p)
          m = b - 1
          if (!e.hasOwnProperty(h))
            throw new Ka('Replacing nonexistant public symbol')
          void 0 !== e[h].A && void 0 !== m
            ? (e[h].A[m] = k)
            : ((e[h] = k), (e[h].F = m))
          return []
        })
      },
      c: function (a, b, c, d, f) {
        function g(n) {
          return n
        }
        b = P(b)
        ;-1 === f && (f = 4294967295)
        var l = Ea(c)
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
          toWireType: function (n, p) {
            if ('number' !== typeof p && 'boolean' !== typeof p)
              throw new TypeError(
                'Cannot convert "' + Ra(p) + '" to ' + this.name
              )
            if (p < d || p > f)
              throw new TypeError(
                'Passing a number "' +
                  Ra(p) +
                  '" from JS side to C/C++ side to an argument of type "' +
                  b +
                  '", which is outside the valid range [' +
                  d +
                  ', ' +
                  f +
                  ']!'
              )
            return k ? p >>> 0 : p | 0
          },
          argPackAdvance: 8,
          readValueFromPointer: db(b, l, 0 !== d),
          B: null,
        })
      },
      b: function (a, b, c) {
        function d(g) {
          g >>= 2
          var l = I
          return new f(G, l[g + 1], l[g])
        }
        var f = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
        ][b]
        c = P(c)
        U(
          a,
          {
            name: c,
            fromWireType: d,
            argPackAdvance: 8,
            readValueFromPointer: d,
          },
          { H: !0 }
        )
      },
      i: function (a, b) {
        b = P(b)
        var c = 'std::string' === b
        U(a, {
          name: b,
          fromWireType: function (d) {
            var f = I[d >> 2]
            if (c)
              for (var g = d + 4, l = 0; l <= f; ++l) {
                var h = d + 4 + l
                if (l == f || 0 == C[h]) {
                  if (g) {
                    for (var k = g + (h - g), n = g; !(n >= k) && C[n]; ) ++n
                    g = ha.decode(C.subarray(g, n))
                  } else g = ''
                  if (void 0 === p) var p = g
                  else (p += String.fromCharCode(0)), (p += g)
                  g = h + 1
                }
              }
            else {
              p = Array(f)
              for (l = 0; l < f; ++l) p[l] = String.fromCharCode(C[d + 4 + l])
              p = p.join('')
            }
            X(d)
            return p
          },
          toWireType: function (d, f) {
            f instanceof ArrayBuffer && (f = new Uint8Array(f))
            var g = 'string' === typeof f
            g ||
              f instanceof Uint8Array ||
              f instanceof Uint8ClampedArray ||
              f instanceof Int8Array ||
              T('Cannot pass non-string to std::string')
            var l = (
                c && g
                  ? function () {
                      for (var n = 0, p = 0; p < f.length; ++p) {
                        var q = f.charCodeAt(p)
                        55296 <= q &&
                          57343 >= q &&
                          (q =
                            (65536 + ((q & 1023) << 10)) |
                            (f.charCodeAt(++p) & 1023))
                        127 >= q
                          ? ++n
                          : (n = 2047 >= q ? n + 2 : 65535 >= q ? n + 3 : n + 4)
                      }
                      return n
                    }
                  : function () {
                      return f.length
                    }
              )(),
              h = kb(4 + l + 1)
            I[h >> 2] = l
            if (c && g) ia(f, h + 4, l + 1)
            else if (g)
              for (g = 0; g < l; ++g) {
                var k = f.charCodeAt(g)
                255 < k &&
                  (X(h),
                  T('String has UTF-16 code units that do not fit in 8 bits'))
                C[h + 4 + g] = k
              }
            else for (g = 0; g < l; ++g) C[h + 4 + g] = f[g]
            null !== d && d.push(X, h)
            return h
          },
          argPackAdvance: 8,
          readValueFromPointer: Qa,
          B: function (d) {
            X(d)
          },
        })
      },
      h: function (a, b, c) {
        c = P(c)
        if (2 === b) {
          var d = ka
          var f = la
          var g = ma
          var l = function () {
            return D
          }
          var h = 1
        } else
          4 === b &&
            ((d = na),
            (f = oa),
            (g = pa),
            (l = function () {
              return I
            }),
            (h = 2))
        U(a, {
          name: c,
          fromWireType: function (k) {
            for (var n = I[k >> 2], p = l(), q, w = k + 4, A = 0; A <= n; ++A) {
              var m = k + 4 + A * b
              if (A == n || 0 == p[m >> h])
                (w = d(w, m - w)),
                  void 0 === q
                    ? (q = w)
                    : ((q += String.fromCharCode(0)), (q += w)),
                  (w = m + b)
            }
            X(k)
            return q
          },
          toWireType: function (k, n) {
            'string' !== typeof n &&
              T('Cannot pass non-string to C++ string type ' + c)
            var p = g(n),
              q = kb(4 + p + b)
            I[q >> 2] = p >> h
            f(n, q + 4, p + b)
            null !== k && k.push(X, q)
            return q
          },
          argPackAdvance: 8,
          readValueFromPointer: Qa,
          B: function (k) {
            X(k)
          },
        })
      },
      p: function (a, b) {
        b = P(b)
        U(a, {
          I: !0,
          name: b,
          argPackAdvance: 0,
          fromWireType: function () {},
          toWireType: function () {},
        })
      },
      e: Pa,
      f: function (a) {
        if (0 === a) return W(fb())
        var b = eb[a]
        a = void 0 === b ? P(a) : b
        return W(fb()[a])
      },
      k: function (a) {
        4 < a && (V[a].D += 1)
      },
      l: function (a, b, c, d) {
        a || T('Cannot use deleted val. handle = ' + a)
        a = V[a].value
        var f = hb[b]
        if (!f) {
          f = ''
          for (var g = 0; g < b; ++g) f += (0 !== g ? ', ' : '') + 'arg' + g
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
          f = new Function(
            'requireRegisteredType',
            'Module',
            '__emval_register',
            l +
              ('var obj = new constructor(' +
                f +
                ');\nreturn __emval_register(obj);\n}\n')
          )(gb, e, W)
          hb[b] = f
        }
        return f(a, c, d)
      },
      m: function () {
        x()
      },
      q: function (a, b, c) {
        C.copyWithin(a, b, b + c)
      },
      d: function (a) {
        a >>>= 0
        var b = C.length
        if (2147483648 < a) return !1
        for (var c = 1; 4 >= c; c *= 2) {
          var d = b * (1 + 0.2 / c)
          d = Math.min(d, a + 100663296)
          d = Math.max(16777216, a, d)
          0 < d % 65536 && (d += 65536 - (d % 65536))
          a: {
            try {
              B.grow((Math.min(2147483648, d) - G.byteLength + 65535) >>> 16)
              ta(B.buffer)
              var f = 1
              break a
            } catch (g) {}
            f = void 0
          }
          if (f) return !0
        }
        return !1
      },
      a: B,
    }
    ;(function () {
      function a(f) {
        e.asm = f.exports
        J = e.asm.s
        L--
        e.monitorRunDependencies && e.monitorRunDependencies(L)
        0 == L &&
          (null !== Aa && (clearInterval(Aa), (Aa = null)),
          M && ((f = M), (M = null), f()))
      }
      function b(f) {
        a(f.instance)
      }
      function c(f) {
        return Promise.resolve()
          .then(Da)
          .then(function (g) {
            return WebAssembly.instantiate(g, d)
          })
          .then(f, function (g) {
            y('failed to asynchronously prepare wasm: ' + g)
            x(g)
          })
      }
      var d = { a: lb }
      L++
      e.monitorRunDependencies && e.monitorRunDependencies(L)
      if (e.instantiateWasm)
        try {
          return e.instantiateWasm(d, a)
        } catch (f) {
          return (
            y('Module.instantiateWasm callback failed with error: ' + f), !1
          )
        }
      ;(function () {
        return z ||
          'function' !== typeof WebAssembly.instantiateStreaming ||
          Ba() ||
          'function' !== typeof fetch
          ? c(b)
          : fetch(N, { credentials: 'same-origin' }).then(function (f) {
              return WebAssembly.instantiateStreaming(f, d).then(
                b,
                function (g) {
                  y('wasm streaming compile failed: ' + g)
                  y('falling back to ArrayBuffer instantiation')
                  return c(b)
                }
              )
            })
      })().catch(r)
      return {}
    })()
    var jb = (e.___wasm_call_ctors = function () {
        return (jb = e.___wasm_call_ctors = e.asm.t).apply(null, arguments)
      }),
      kb = (e._malloc = function () {
        return (kb = e._malloc = e.asm.u).apply(null, arguments)
      }),
      X = (e._free = function () {
        return (X = e._free = e.asm.v).apply(null, arguments)
      }),
      bb = (e.___getTypeName = function () {
        return (bb = e.___getTypeName = e.asm.w).apply(null, arguments)
      })
    e.___embind_register_native_and_builtin_types = function () {
      return (e.___embind_register_native_and_builtin_types = e.asm.x).apply(
        null,
        arguments
      )
    }
    var Z
    M = function mb() {
      Z || nb()
      Z || (M = mb)
    }
    function nb() {
      function a() {
        if (!Z && ((Z = !0), (e.calledRun = !0), !fa)) {
          O(wa)
          O(xa)
          aa(e)
          if (e.onRuntimeInitialized) e.onRuntimeInitialized()
          if (e.postRun)
            for (
              'function' == typeof e.postRun && (e.postRun = [e.postRun]);
              e.postRun.length;

            ) {
              var b = e.postRun.shift()
              ya.unshift(b)
            }
          O(ya)
        }
      }
      if (!(0 < L)) {
        if (e.preRun)
          for (
            'function' == typeof e.preRun && (e.preRun = [e.preRun]);
            e.preRun.length;

          )
            za()
        O(va)
        0 < L ||
          (e.setStatus
            ? (e.setStatus('Running...'),
              setTimeout(function () {
                setTimeout(function () {
                  e.setStatus('')
                }, 1)
                a()
              }, 1))
            : a())
      }
    }
    e.run = nb
    if (e.preInit)
      for (
        'function' == typeof e.preInit && (e.preInit = [e.preInit]);
        0 < e.preInit.length;

      )
        e.preInit.pop()()
    noExitRuntime = !0
    nb()

    return Module.ready
  }
})()
export default Module
