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
    var ba = './this.program'
    function ca(a, b) {
      throw b
    }
    var da = '',
      ea,
      fa,
      ha,
      ia
    da = __dirname + '/'
    ea = function (a) {
      ha || (ha = require('fs'))
      ia || (ia = require('path'))
      a = ia.normalize(a)
      return ha.readFileSync(a, null)
    }
    fa = function (a) {
      a = ea(a)
      a.buffer || (a = new Uint8Array(a))
      a.buffer || v('Assertion failed: undefined')
      return a
    }
    ca = function (a) {
      process.exit(a)
    }
    e.inspect = function () {
      return '[Emscripten Module object]'
    }
    var ka = e.print || console.log.bind(console),
      w = e.printErr || console.warn.bind(console)
    for (u in t) t.hasOwnProperty(u) && (e[u] = t[u])
    t = null
    e.thisProgram && (ba = e.thisProgram)
    e.quit && (ca = e.quit)
    var y
    e.wasmBinary && (y = e.wasmBinary)
    var noExitRuntime
    e.noExitRuntime && (noExitRuntime = e.noExitRuntime)
    'object' !== typeof WebAssembly && v('no native wasm support detected')
    var z,
      la = !1,
      ma = new TextDecoder('utf8')
    function na(a, b, c) {
      var d = A
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
    var oa = new TextDecoder('utf-16le')
    function pa(a, b) {
      var c = a >> 1
      for (b = c + b / 2; !(c >= b) && C[c]; ) ++c
      return oa.decode(A.subarray(a, c << 1))
    }
    function qa(a, b, c) {
      void 0 === c && (c = 2147483647)
      if (2 > c) return 0
      c -= 2
      var d = b
      c = c < 2 * a.length ? c / 2 : a.length
      for (var f = 0; f < c; ++f) (D[b >> 1] = a.charCodeAt(f)), (b += 2)
      D[b >> 1] = 0
      return b - d
    }
    function ra(a) {
      return 2 * a.length
    }
    function sa(a, b) {
      for (var c = 0, d = ''; !(c >= b / 4); ) {
        var f = E[(a + 4 * c) >> 2]
        if (0 == f) break
        ++c
        65536 <= f
          ? ((f -= 65536),
            (d += String.fromCharCode(55296 | (f >> 10), 56320 | (f & 1023))))
          : (d += String.fromCharCode(f))
      }
      return d
    }
    function ta(a, b, c) {
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
        E[b >> 2] = g
        b += 4
        if (b + 4 > c) break
      }
      E[b >> 2] = 0
      return b - d
    }
    function ua(a) {
      for (var b = 0, c = 0; c < a.length; ++c) {
        var d = a.charCodeAt(c)
        55296 <= d && 57343 >= d && ++c
        b += 4
      }
      return b
    }
    var F, G, A, D, C, E, I, va, wa
    function xa(a) {
      F = a
      e.HEAP8 = G = new Int8Array(a)
      e.HEAP16 = D = new Int16Array(a)
      e.HEAP32 = E = new Int32Array(a)
      e.HEAPU8 = A = new Uint8Array(a)
      e.HEAPU16 = C = new Uint16Array(a)
      e.HEAPU32 = I = new Uint32Array(a)
      e.HEAPF32 = va = new Float32Array(a)
      e.HEAPF64 = wa = new Float64Array(a)
    }
    var ya = e.INITIAL_MEMORY || 16777216
    e.wasmMemory
      ? (z = e.wasmMemory)
      : (z = new WebAssembly.Memory({ initial: ya / 65536, maximum: 32768 }))
    z && (F = z.buffer)
    ya = F.byteLength
    xa(F)
    var J,
      za = [],
      Aa = [],
      Ba = [],
      Ca = []
    function Da() {
      var a = e.preRun.shift()
      za.unshift(a)
    }
    var K = 0,
      Ea = null,
      M = null
    e.preloadedImages = {}
    e.preloadedAudios = {}
    function v(a) {
      if (e.onAbort) e.onAbort(a)
      w(a)
      la = !0
      a = new WebAssembly.RuntimeError(
        'abort(' + a + '). Build with -s ASSERTIONS=1 for more info.'
      )
      r(a)
      throw a
    }
    function Fa() {
      var a = N
      return String.prototype.startsWith
        ? a.startsWith('data:application/octet-stream;base64,')
        : 0 === a.indexOf('data:application/octet-stream;base64,')
    }
    var N = 'mozjpeg_node_dec.wasm'
    if (!Fa()) {
      var Ga = N
      N = e.locateFile ? e.locateFile(Ga, da) : da + Ga
    }
    function Ha() {
      try {
        if (y) return new Uint8Array(y)
        if (fa) return fa(N)
        throw 'both async and sync fetching of the wasm failed'
      } catch (a) {
        v(a)
      }
    }
    function O(a) {
      for (; 0 < a.length; ) {
        var b = a.shift()
        if ('function' == typeof b) b(e)
        else {
          var c = b.L
          'number' === typeof c
            ? void 0 === b.I
              ? J.get(c)()
              : J.get(c)(b.I)
            : c(void 0 === b.I ? null : b.I)
        }
      }
    }
    function Ia(a) {
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
    var Ja = void 0
    function P(a) {
      for (var b = ''; A[a]; ) b += Ja[A[a++]]
      return b
    }
    var Q = {},
      R = {},
      S = {}
    function Ka(a) {
      if (void 0 === a) return '_unknown'
      a = a.replace(/[^a-zA-Z0-9_]/g, '$')
      var b = a.charCodeAt(0)
      return 48 <= b && 57 >= b ? '_' + a : a
    }
    function La(a, b) {
      a = Ka(a)
      return new Function(
        'body',
        'return function ' +
          a +
          '() {\n    "use strict";    return body.apply(this, arguments);\n};\n'
      )(b)
    }
    function Ma(a) {
      var b = Error,
        c = La(a, function (d) {
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
    var Na = void 0
    function T(a) {
      throw new Na(a)
    }
    var Oa = void 0
    function Pa(a, b) {
      function c(h) {
        h = b(h)
        if (h.length !== d.length)
          throw new Oa('Mismatched type converter count')
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
        if (c.M) return
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
    var Qa = [],
      V = [{}, { value: void 0 }, { value: null }, { value: !0 }, { value: !1 }]
    function Ra(a) {
      4 < a && 0 === --V[a].J && ((V[a] = void 0), Qa.push(a))
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
          var b = Qa.length ? Qa.pop() : V.length
          V[b] = { J: 1, value: a }
          return b
      }
    }
    function Sa(a) {
      return this.fromWireType(I[a >> 2])
    }
    function Va(a) {
      if (null === a) return 'null'
      var b = typeof a
      return 'object' === b || 'array' === b || 'function' === b
        ? a.toString()
        : '' + a
    }
    function Wa(a, b) {
      switch (b) {
        case 2:
          return function (c) {
            return this.fromWireType(va[c >> 2])
          }
        case 3:
          return function (c) {
            return this.fromWireType(wa[c >> 3])
          }
        default:
          throw new TypeError('Unknown float type: ' + a)
      }
    }
    function Xa(a) {
      var b = Function
      if (!(b instanceof Function))
        throw new TypeError(
          'new_ called with constructor type ' +
            typeof b +
            ' which is not a function'
        )
      var c = La(b.name || 'unknownFunctionName', function () {})
      c.prototype = b.prototype
      c = new c()
      a = b.apply(c, a)
      return a instanceof Object ? a : c
    }
    function Ya(a) {
      for (; a.length; ) {
        var b = a.pop()
        a.pop()(b)
      }
    }
    function Za(a, b) {
      var c = e
      if (void 0 === c[a].G) {
        var d = c[a]
        c[a] = function () {
          c[a].G.hasOwnProperty(arguments.length) ||
            T(
              "Function '" +
                b +
                "' called with an invalid number of arguments (" +
                arguments.length +
                ') - expects one of (' +
                c[a].G +
                ')!'
            )
          return c[a].G[arguments.length].apply(this, arguments)
        }
        c[a].G = []
        c[a].G[d.K] = d
      }
    }
    function $a(a, b, c) {
      e.hasOwnProperty(a)
        ? ((void 0 === c || (void 0 !== e[a].G && void 0 !== e[a].G[c])) &&
            T("Cannot register public name '" + a + "' twice"),
          Za(a, a),
          e.hasOwnProperty(c) &&
            T(
              'Cannot register multiple overloads of a function with the same number of arguments (' +
                c +
                ')!'
            ),
          (e[a].G[c] = b))
        : ((e[a] = b), void 0 !== c && (e[a].O = c))
    }
    function ab(a, b) {
      for (var c = [], d = 0; d < a; d++) c.push(E[(b >> 2) + d])
      return c
    }
    function bb(a, b) {
      0 <= a.indexOf('j') ||
        v('Assertion failed: getDynCaller should only be called with i64 sigs')
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
    function cb(a, b) {
      a = P(a)
      var c = -1 != a.indexOf('j') ? bb(a, b) : J.get(b)
      'function' !== typeof c &&
        T('unknown function pointer with signature ' + a + ': ' + b)
      return c
    }
    var db = void 0
    function eb(a) {
      a = fb(a)
      var b = P(a)
      X(a)
      return b
    }
    function gb(a, b) {
      function c(g) {
        f[g] || R[g] || (S[g] ? S[g].forEach(c) : (d.push(g), (f[g] = !0)))
      }
      var d = [],
        f = {}
      b.forEach(c)
      throw new db(a + ': ' + d.map(eb).join([', ']))
    }
    function hb(a, b, c) {
      switch (b) {
        case 0:
          return c
            ? function (d) {
                return G[d]
              }
            : function (d) {
                return A[d]
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
                return E[d >> 2]
              }
            : function (d) {
                return I[d >> 2]
              }
        default:
          throw new TypeError('Unknown integer type: ' + a)
      }
    }
    var ib = {}
    function jb() {
      return 'object' === typeof globalThis
        ? globalThis
        : Function('return this')()
    }
    function kb(a, b) {
      var c = R[a]
      void 0 === c && T(b + ' has unknown type ' + eb(a))
      return c
    }
    var lb = {},
      mb = {}
    function nb() {
      if (!ob) {
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
            _: ba || './this.program',
          },
          b
        for (b in mb) a[b] = mb[b]
        var c = []
        for (b in a) c.push(b + '=' + a[b])
        ob = c
      }
      return ob
    }
    for (var ob, pb = [null, [], []], qb = Array(256), Y = 0; 256 > Y; ++Y)
      qb[Y] = String.fromCharCode(Y)
    Ja = qb
    Na = e.BindingError = Ma('BindingError')
    Oa = e.InternalError = Ma('InternalError')
    e.count_emval_handles = function () {
      for (var a = 0, b = 5; b < V.length; ++b) void 0 !== V[b] && ++a
      return a
    }
    e.get_first_emval = function () {
      for (var a = 5; a < V.length; ++a) if (void 0 !== V[a]) return V[a]
      return null
    }
    db = e.UnboundTypeError = Ma('UnboundTypeError')
    Aa.push({
      L: function () {
        rb()
      },
    })
    var tb = {
      g: function () {},
      o: function (a, b, c, d, f) {
        var g = Ia(c)
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
            if (1 === c) var h = G
            else if (2 === c) h = D
            else if (4 === c) h = E
            else throw new TypeError('Unknown boolean type size: ' + b)
            return this.fromWireType(h[l >> g])
          },
          H: null,
        })
      },
      x: function (a, b) {
        b = P(b)
        U(a, {
          name: b,
          fromWireType: function (c) {
            var d = V[c].value
            Ra(c)
            return d
          },
          toWireType: function (c, d) {
            return W(d)
          },
          argPackAdvance: 8,
          readValueFromPointer: Sa,
          H: null,
        })
      },
      n: function (a, b, c) {
        c = Ia(c)
        b = P(b)
        U(a, {
          name: b,
          fromWireType: function (d) {
            return d
          },
          toWireType: function (d, f) {
            if ('number' !== typeof f && 'boolean' !== typeof f)
              throw new TypeError(
                'Cannot convert "' + Va(f) + '" to ' + this.name
              )
            return f
          },
          argPackAdvance: 8,
          readValueFromPointer: Wa(b, c),
          H: null,
        })
      },
      q: function (a, b, c, d, f, g) {
        var l = ab(b, c)
        a = P(a)
        f = cb(d, f)
        $a(
          a,
          function () {
            gb('Cannot call ' + a + ' due to unbound types', l)
          },
          b - 1
        )
        Pa(l, function (h) {
          var k = [h[0], null].concat(h.slice(1)),
            m = (h = a),
            n = f,
            p = k.length
          2 > p &&
            T(
              "argTypes array size mismatch! Must at least get return value and 'this' types!"
            )
          for (var x = null !== k[1] && !1, B = !1, q = 1; q < k.length; ++q)
            if (null !== k[q] && void 0 === k[q].H) {
              B = !0
              break
            }
          var Ta = 'void' !== k[0].name,
            H = '',
            L = ''
          for (q = 0; q < p - 2; ++q)
            (H += (0 !== q ? ', ' : '') + 'arg' + q),
              (L += (0 !== q ? ', ' : '') + 'arg' + q + 'Wired')
          m =
            'return function ' +
            Ka(m) +
            '(' +
            H +
            ') {\nif (arguments.length !== ' +
            (p - 2) +
            ") {\nthrowBindingError('function " +
            m +
            " called with ' + arguments.length + ' arguments, expected " +
            (p - 2) +
            " args!');\n}\n"
          B && (m += 'var destructors = [];\n')
          var Ua = B ? 'destructors' : 'null'
          H =
            'throwBindingError invoker fn runDestructors retType classParam'.split(
              ' '
            )
          n = [T, n, g, Ya, k[0], k[1]]
          x &&
            (m += 'var thisWired = classParam.toWireType(' + Ua + ', this);\n')
          for (q = 0; q < p - 2; ++q)
            (m +=
              'var arg' +
              q +
              'Wired = argType' +
              q +
              '.toWireType(' +
              Ua +
              ', arg' +
              q +
              '); // ' +
              k[q + 2].name +
              '\n'),
              H.push('argType' + q),
              n.push(k[q + 2])
          x && (L = 'thisWired' + (0 < L.length ? ', ' : '') + L)
          m +=
            (Ta ? 'var rv = ' : '') +
            'invoker(fn' +
            (0 < L.length ? ', ' : '') +
            L +
            ');\n'
          if (B) m += 'runDestructors(destructors);\n'
          else
            for (q = x ? 1 : 2; q < k.length; ++q)
              (p = 1 === q ? 'thisWired' : 'arg' + (q - 2) + 'Wired'),
                null !== k[q].H &&
                  ((m += p + '_dtor(' + p + '); // ' + k[q].name + '\n'),
                  H.push(p + '_dtor'),
                  n.push(k[q].H))
          Ta && (m += 'var ret = retType.fromWireType(rv);\nreturn ret;\n')
          H.push(m + '}\n')
          k = Xa(H).apply(null, n)
          q = b - 1
          if (!e.hasOwnProperty(h))
            throw new Oa('Replacing nonexistant public symbol')
          void 0 !== e[h].G && void 0 !== q
            ? (e[h].G[q] = k)
            : ((e[h] = k), (e[h].K = q))
          return []
        })
      },
      c: function (a, b, c, d, f) {
        function g(m) {
          return m
        }
        b = P(b)
        ;-1 === f && (f = 4294967295)
        var l = Ia(c)
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
                'Cannot convert "' + Va(n) + '" to ' + this.name
              )
            if (n < d || n > f)
              throw new TypeError(
                'Passing a number "' +
                  Va(n) +
                  '" from JS side to C/C++ side to an argument of type "' +
                  b +
                  '", which is outside the valid range [' +
                  d +
                  ', ' +
                  f +
                  ']!'
              )
            return k ? n >>> 0 : n | 0
          },
          argPackAdvance: 8,
          readValueFromPointer: hb(b, l, 0 !== d),
          H: null,
        })
      },
      b: function (a, b, c) {
        function d(g) {
          g >>= 2
          var l = I
          return new f(F, l[g + 1], l[g])
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
          { M: !0 }
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
                if (l == f || 0 == A[h]) {
                  if (g) {
                    for (var k = g + (h - g), m = g; !(m >= k) && A[m]; ) ++m
                    g = ma.decode(A.subarray(g, m))
                  } else g = ''
                  if (void 0 === n) var n = g
                  else (n += String.fromCharCode(0)), (n += g)
                  g = h + 1
                }
              }
            else {
              n = Array(f)
              for (l = 0; l < f; ++l) n[l] = String.fromCharCode(A[d + 4 + l])
              n = n.join('')
            }
            X(d)
            return n
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
                      for (var m = 0, n = 0; n < f.length; ++n) {
                        var p = f.charCodeAt(n)
                        55296 <= p &&
                          57343 >= p &&
                          (p =
                            (65536 + ((p & 1023) << 10)) |
                            (f.charCodeAt(++n) & 1023))
                        127 >= p
                          ? ++m
                          : (m = 2047 >= p ? m + 2 : 65535 >= p ? m + 3 : m + 4)
                      }
                      return m
                    }
                  : function () {
                      return f.length
                    }
              )(),
              h = sb(4 + l + 1)
            I[h >> 2] = l
            if (c && g) na(f, h + 4, l + 1)
            else if (g)
              for (g = 0; g < l; ++g) {
                var k = f.charCodeAt(g)
                255 < k &&
                  (X(h),
                  T('String has UTF-16 code units that do not fit in 8 bits'))
                A[h + 4 + g] = k
              }
            else for (g = 0; g < l; ++g) A[h + 4 + g] = f[g]
            null !== d && d.push(X, h)
            return h
          },
          argPackAdvance: 8,
          readValueFromPointer: Sa,
          H: function (d) {
            X(d)
          },
        })
      },
      h: function (a, b, c) {
        c = P(c)
        if (2 === b) {
          var d = pa
          var f = qa
          var g = ra
          var l = function () {
            return C
          }
          var h = 1
        } else
          4 === b &&
            ((d = sa),
            (f = ta),
            (g = ua),
            (l = function () {
              return I
            }),
            (h = 2))
        U(a, {
          name: c,
          fromWireType: function (k) {
            for (var m = I[k >> 2], n = l(), p, x = k + 4, B = 0; B <= m; ++B) {
              var q = k + 4 + B * b
              if (B == m || 0 == n[q >> h])
                (x = d(x, q - x)),
                  void 0 === p
                    ? (p = x)
                    : ((p += String.fromCharCode(0)), (p += x)),
                  (x = q + b)
            }
            X(k)
            return p
          },
          toWireType: function (k, m) {
            'string' !== typeof m &&
              T('Cannot pass non-string to C++ string type ' + c)
            var n = g(m),
              p = sb(4 + n + b)
            I[p >> 2] = n >> h
            f(m, p + 4, n + b)
            null !== k && k.push(X, p)
            return p
          },
          argPackAdvance: 8,
          readValueFromPointer: Sa,
          H: function (k) {
            X(k)
          },
        })
      },
      p: function (a, b) {
        b = P(b)
        U(a, {
          N: !0,
          name: b,
          argPackAdvance: 0,
          fromWireType: function () {},
          toWireType: function () {},
        })
      },
      e: Ra,
      f: function (a) {
        if (0 === a) return W(jb())
        var b = ib[a]
        a = void 0 === b ? P(a) : b
        return W(jb()[a])
      },
      j: function (a) {
        4 < a && (V[a].J += 1)
      },
      k: function (a, b, c, d) {
        a || T('Cannot use deleted val. handle = ' + a)
        a = V[a].value
        var f = lb[b]
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
          )(kb, e, W)
          lb[b] = f
        }
        return f(a, c, d)
      },
      l: function () {
        v()
      },
      t: function (a, b, c) {
        A.copyWithin(a, b, b + c)
      },
      d: function (a) {
        a >>>= 0
        var b = A.length
        if (2147483648 < a) return !1
        for (var c = 1; 4 >= c; c *= 2) {
          var d = b * (1 + 0.2 / c)
          d = Math.min(d, a + 100663296)
          d = Math.max(16777216, a, d)
          0 < d % 65536 && (d += 65536 - (d % 65536))
          a: {
            try {
              z.grow((Math.min(2147483648, d) - F.byteLength + 65535) >>> 16)
              xa(z.buffer)
              var f = 1
              break a
            } catch (g) {}
            f = void 0
          }
          if (f) return !0
        }
        return !1
      },
      u: function (a, b) {
        var c = 0
        nb().forEach(function (d, f) {
          var g = b + c
          f = E[(a + 4 * f) >> 2] = g
          for (g = 0; g < d.length; ++g) G[f++ >> 0] = d.charCodeAt(g)
          G[f >> 0] = 0
          c += d.length + 1
        })
        return 0
      },
      v: function (a, b) {
        var c = nb()
        E[a >> 2] = c.length
        var d = 0
        c.forEach(function (f) {
          d += f.length + 1
        })
        E[b >> 2] = d
        return 0
      },
      y: function (a) {
        if (!noExitRuntime) {
          if (e.onExit) e.onExit(a)
          la = !0
        }
        ca(a, new ja(a))
      },
      w: function () {
        return 0
      },
      r: function () {},
      m: function (a, b, c, d) {
        for (var f = 0, g = 0; g < c; g++) {
          for (
            var l = E[(b + 8 * g) >> 2], h = E[(b + (8 * g + 4)) >> 2], k = 0;
            k < h;
            k++
          ) {
            var m = A[l + k],
              n = pb[a]
            if (0 === m || 10 === m) {
              m = 1 === a ? ka : w
              var p
              for (p = 0; n[p] && !(NaN <= p); ) ++p
              p = ma.decode(
                n.subarray ? n.subarray(0, p) : new Uint8Array(n.slice(0, p))
              )
              m(p)
              n.length = 0
            } else n.push(m)
          }
          f += h
        }
        E[d >> 2] = f
        return 0
      },
      a: z,
      s: function () {},
    }
    ;(function () {
      function a(f) {
        e.asm = f.exports
        J = e.asm.z
        K--
        e.monitorRunDependencies && e.monitorRunDependencies(K)
        0 == K &&
          (null !== Ea && (clearInterval(Ea), (Ea = null)),
          M && ((f = M), (M = null), f()))
      }
      function b(f) {
        a(f.instance)
      }
      function c(f) {
        return Promise.resolve()
          .then(Ha)
          .then(function (g) {
            return WebAssembly.instantiate(g, d)
          })
          .then(f, function (g) {
            w('failed to asynchronously prepare wasm: ' + g)
            v(g)
          })
      }
      var d = { a: tb }
      K++
      e.monitorRunDependencies && e.monitorRunDependencies(K)
      if (e.instantiateWasm)
        try {
          return e.instantiateWasm(d, a)
        } catch (f) {
          return (
            w('Module.instantiateWasm callback failed with error: ' + f), !1
          )
        }
      ;(function () {
        return y ||
          'function' !== typeof WebAssembly.instantiateStreaming ||
          Fa() ||
          'function' !== typeof fetch
          ? c(b)
          : fetch(N, { credentials: 'same-origin' }).then(function (f) {
              return WebAssembly.instantiateStreaming(f, d).then(
                b,
                function (g) {
                  w('wasm streaming compile failed: ' + g)
                  w('falling back to ArrayBuffer instantiation')
                  return c(b)
                }
              )
            })
      })().catch(r)
      return {}
    })()
    var rb = (e.___wasm_call_ctors = function () {
        return (rb = e.___wasm_call_ctors = e.asm.A).apply(null, arguments)
      }),
      sb = (e._malloc = function () {
        return (sb = e._malloc = e.asm.B).apply(null, arguments)
      }),
      X = (e._free = function () {
        return (X = e._free = e.asm.C).apply(null, arguments)
      }),
      fb = (e.___getTypeName = function () {
        return (fb = e.___getTypeName = e.asm.D).apply(null, arguments)
      })
    e.___embind_register_native_and_builtin_types = function () {
      return (e.___embind_register_native_and_builtin_types = e.asm.E).apply(
        null,
        arguments
      )
    }
    e.dynCall_jiji = function () {
      return (e.dynCall_jiji = e.asm.F).apply(null, arguments)
    }
    var Z
    function ja(a) {
      this.name = 'ExitStatus'
      this.message = 'Program terminated with exit(' + a + ')'
      this.status = a
    }
    M = function ub() {
      Z || vb()
      Z || (M = ub)
    }
    function vb() {
      function a() {
        if (!Z && ((Z = !0), (e.calledRun = !0), !la)) {
          O(Aa)
          O(Ba)
          aa(e)
          if (e.onRuntimeInitialized) e.onRuntimeInitialized()
          if (e.postRun)
            for (
              'function' == typeof e.postRun && (e.postRun = [e.postRun]);
              e.postRun.length;

            ) {
              var b = e.postRun.shift()
              Ca.unshift(b)
            }
          O(Ca)
        }
      }
      if (!(0 < K)) {
        if (e.preRun)
          for (
            'function' == typeof e.preRun && (e.preRun = [e.preRun]);
            e.preRun.length;

          )
            Da()
        O(za)
        0 < K ||
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
    e.run = vb
    if (e.preInit)
      for (
        'function' == typeof e.preInit && (e.preInit = [e.preInit]);
        0 < e.preInit.length;

      )
        e.preInit.pop()()
    noExitRuntime = !0
    vb()

    return Module.ready
  }
})()
export default Module
