/* eslint-disable no-shadow, no-unused-expressions, eqeqeq, no-func-assign, no-throw-literal, no-sequences, no-useless-escape, no-loop-func -- Preserve the pinned pure upstream implementation. */
// Pure declaration fork from @vitest/browser 5.0.4; MIT license in LICENSE.
// Published dist/locators-BHr21v4S.js and dist/expect-element.js pure DOM closure.
// Controller bindings and side effects are omitted; pure initialization is retained.
function s() {
  return window.__vitest_browser_runner__
}
function h(e) {
  '@babel/helpers - typeof'
  return (
    (h =
      typeof Symbol == `function` && typeof Symbol.iterator == `symbol`
        ? function (e) {
            return typeof e
          }
        : function (e) {
            return e &&
              typeof Symbol == `function` &&
              e.constructor === Symbol &&
              e !== Symbol.prototype
              ? `symbol`
              : typeof e
          }),
    h(e)
  )
}
function g(e, t) {
  if (h(e) != `object` || !e) return e
  var n = e[Symbol.toPrimitive]
  if (n !== void 0) {
    var r = n.call(e, t)
    if (h(r) != `object`) return r
    throw TypeError(`@@toPrimitive must return a primitive value.`)
  }
  return (t === `string` ? String : Number)(e)
}
function _(e) {
  var t = g(e, `string`)
  return h(t) == `symbol` ? t : t + ``
}
function v(e, t, n) {
  return (
    (t = _(t)) in e
      ? Object.defineProperty(e, t, {
          value: n,
          enumerable: !0,
          configurable: !0,
          writable: !0,
        })
      : (e[t] = n),
    e
  )
}
const y = function (e, t, n) {
  return e >= t && e <= n
}
function b(e) {
  return y(e, 48, 57)
}
function ee(e) {
  return b(e) || y(e, 65, 70) || y(e, 97, 102)
}
function te(e) {
  return y(e, 65, 90)
}
function ne(e) {
  return y(e, 97, 122)
}
function x(e) {
  return te(e) || ne(e)
}
function re(e) {
  return e >= 128
}
function ie(e) {
  return x(e) || re(e) || e === 95
}
function ae(e) {
  return ie(e) || b(e) || e === 45
}
function oe(e) {
  return y(e, 0, 8) || e === 11 || y(e, 14, 31) || e === 127
}
function se(e) {
  return e === 10
}
function S(e) {
  return se(e) || e === 9 || e === 32
}
var ce = class extends Error {
  constructor(e) {
    ;(super(e), (this.name = `InvalidCharacterError`))
  }
}
function le(e) {
  let t = []
  for (let n = 0; n < e.length; n++) {
    let r = e.charCodeAt(n)
    if (
      (r === 13 && e.charCodeAt(n + 1) === 10 && ((r = 10), n++),
      (r === 13 || r === 12) && (r = 10),
      r === 0 && (r = 65533),
      y(r, 55296, 56319) && y(e.charCodeAt(n + 1), 56320, 57343))
    ) {
      let t = r - 55296,
        i = e.charCodeAt(n + 1) - 56320
      ;((r = 2 ** 16 + t * 1024 + i), n++)
    }
    t.push(r)
  }
  return t
}
function C(e) {
  if (e <= 65535) return String.fromCharCode(e)
  e -= 2 ** 16
  let t = Math.floor(e / 1024) + 55296,
    n = (e % 1024) + 56320
  return String.fromCharCode(t) + String.fromCharCode(n)
}
function ue(e) {
  let t = le(e),
    n = -1,
    r = [],
    i,
    a = function (e) {
      return e >= t.length ? -1 : t[e]
    },
    o = function (e) {
      if ((e === void 0 && (e = 1), e > 3))
        throw `Spec Error: no more than three codepoints of lookahead.`
      return a(n + e)
    },
    s = function (e) {
      return (e === void 0 && (e = 1), (n += e), (i = a(n)), !0)
    },
    c = function () {
      return (--n, !0)
    },
    l = function (e) {
      return (e === void 0 && (e = i), e === -1)
    },
    u = function () {
      if ((d(), s(), S(i))) {
        for (; S(o()); ) s()
        return new pe()
      }
      if (i === 34) return m()
      if (i === 35) {
        if (ae(o()) || _(o(1), o(2))) {
          let e = new Fe(``)
          return (y(o(1), o(2), o(3)) && (e.type = `id`), (e.value = re()), e)
        }
        return new E(i)
      }
      return i === 36
        ? o() === 61
          ? (s(), new Oe())
          : new E(i)
        : i === 39
          ? m()
          : i === 40
            ? new Ce()
            : i === 41
              ? new we()
              : i === 42
                ? o() === 61
                  ? (s(), new ke())
                  : new E(i)
                : i === 43
                  ? x()
                    ? (c(), f())
                    : new E(i)
                  : i === 44
                    ? new ve()
                    : i === 45
                      ? x()
                        ? (c(), f())
                        : o(1) === 45 && o(2) === 62
                          ? (s(2), new he())
                          : te()
                            ? (c(), p())
                            : new E(i)
                      : i === 46
                        ? x()
                          ? (c(), f())
                          : new E(i)
                        : i === 58
                          ? new ge()
                          : i === 59
                            ? new _e()
                            : i === 60
                              ? o(1) === 33 && o(2) === 45 && o(3) === 45
                                ? (s(3), new me())
                                : new E(i)
                              : i === 64
                                ? y(o(1), o(2), o(3))
                                  ? new Pe(re())
                                  : new E(i)
                                : i === 91
                                  ? new xe()
                                  : i === 92
                                    ? v()
                                      ? (c(), p())
                                      : new E(i)
                                    : i === 93
                                      ? new Se()
                                      : i === 94
                                        ? o() === 61
                                          ? (s(), new De())
                                          : new E(i)
                                        : i === 123
                                          ? new ye()
                                          : i === 124
                                            ? o() === 61
                                              ? (s(), new Ee())
                                              : o() === 124
                                                ? (s(), new Ae())
                                                : new E(i)
                                            : i === 125
                                              ? new be()
                                              : i === 126
                                                ? o() === 61
                                                  ? (s(), new Te())
                                                  : new E(i)
                                                : b(i)
                                                  ? (c(), f())
                                                  : ie(i)
                                                    ? (c(), p())
                                                    : l()
                                                      ? new je()
                                                      : new E(i)
    },
    d = function () {
      for (; o(1) === 47 && o(2) === 42; )
        for (s(2); ; ) {
          if ((s(), i === 42 && o() === 47)) {
            s()
            break
          }
          if (l()) return
        }
    },
    f = function () {
      let e = ce()
      if (y(o(1), o(2), o(3))) {
        let t = new Be()
        return (
          (t.value = e.value),
          (t.repr = e.repr),
          (t.type = e.type),
          (t.unit = re()),
          t
        )
      }
      if (o() === 37) {
        s()
        let t = new ze()
        return ((t.value = e.value), (t.repr = e.repr), t)
      }
      {
        let t = new Re()
        return ((t.value = e.value), (t.repr = e.repr), (t.type = e.type), t)
      }
    },
    p = function () {
      let e = re()
      if (e.toLowerCase() === `url` && o() === 40) {
        for (s(); S(o(1)) && S(o(2)); ) s()
        return o() === 34 ||
          o() === 39 ||
          (S(o()) && (o(2) === 34 || o(2) === 39))
          ? new Ne(e)
          : h()
      }
      return o() === 40 ? (s(), new Ne(e)) : new Me(e)
    },
    m = function (e) {
      e === void 0 && (e = i)
      let t = ``
      for (; s(); )
        if (i === e || l()) return new Ie(t)
        else if (se(i)) return (c(), new de())
        else i === 92 ? l(o()) || (se(o()) ? s() : (t += C(g()))) : (t += C(i))
      throw Error(`Internal error`)
    },
    h = function () {
      let e = new Le(``)
      for (; S(o()); ) s()
      if (l(o())) return e
      for (; s(); )
        if (i === 41 || l()) return e
        else if (S(i)) {
          for (; S(o()); ) s()
          return o() === 41 || l(o()) ? (s(), e) : (w(), new fe())
        } else if (i === 34 || i === 39 || i === 40 || oe(i))
          return (w(), new fe())
        else if (i === 92) {
          if (v()) e.value += C(g())
          else return (w(), new fe())
        } else e.value += C(i)
      throw Error(`Internal error`)
    },
    g = function () {
      if ((s(), ee(i))) {
        let e = [i]
        for (let t = 0; t < 5 && ee(o()); t++) (s(), e.push(i))
        S(o()) && s()
        let t = Number.parseInt(
          e.map((e) => String.fromCharCode(e)).join(``),
          16
        )
        return (t > 1114111 && (t = 65533), t)
      }
      return l() ? 65533 : i
    },
    _ = function (e, t) {
      return !(e !== 92 || se(t))
    },
    v = function () {
      return _(i, o())
    },
    y = function (e, t, n) {
      return e === 45
        ? ie(t) || t === 45 || _(t, n)
        : ie(e)
          ? !0
          : e === 92 && _(e, t)
    },
    te = function () {
      return y(i, o(1), o(2))
    },
    ne = function (e, t, n) {
      return e === 43 || e === 45
        ? !!(b(t) || (t === 46 && b(n)))
        : e === 46
          ? !!b(t)
          : !!b(e)
    },
    x = function () {
      return ne(i, o(1), o(2))
    },
    re = function () {
      let e = ``
      for (; s(); )
        if (ae(i)) e += C(i)
        else if (v()) e += C(g())
        else return (c(), e)
      throw Error(`Internal parse error`)
    },
    ce = function () {
      let e = ``,
        t = `integer`
      for ((o() === 43 || o() === 45) && (s(), (e += C(i))); b(o()); )
        (s(), (e += C(i)))
      if (o(1) === 46 && b(o(2)))
        for (s(), e += C(i), s(), e += C(i), t = `number`; b(o()); )
          (s(), (e += C(i)))
      let n = o(1),
        r = o(2),
        a = o(3)
      if ((n === 69 || n === 101) && b(r))
        for (s(), e += C(i), s(), e += C(i), t = `number`; b(o()); )
          (s(), (e += C(i)))
      else if ((n === 69 || n === 101) && (r === 43 || r === 45) && b(a))
        for (
          s(), e += C(i), s(), e += C(i), s(), e += C(i), t = `number`;
          b(o());

        )
          (s(), (e += C(i)))
      let c = ue(e)
      return { type: t, value: c, repr: e }
    },
    ue = function (e) {
      return +e
    },
    w = function () {
      for (; s(); )
        if (i === 41 || l()) return
        else v() && g()
    },
    T = 0
  for (; !l(o()); )
    if ((r.push(u()), T++, T > t.length * 2))
      throw Error(`I'm infinite-looping!`)
  return r
}
var w = class {
  constructor() {
    ;(v(this, `tokenType`, ``), v(this, `value`, void 0))
  }
  toJSON() {
    return { token: this.tokenType }
  }
  toString() {
    return this.tokenType
  }
  toSource() {
    return `${this}`
  }
}
var de = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `BADSTRING`))
  }
}
var fe = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `BADURL`))
  }
}
var pe = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `WHITESPACE`))
  }
  toString() {
    return `WS`
  }
  toSource() {
    return ` `
  }
}
var me = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `CDO`))
  }
  toSource() {
    return `<!--`
  }
}
var he = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `CDC`))
  }
  toSource() {
    return `-->`
  }
}
var ge = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `:`))
  }
}
var _e = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `;`))
  }
}
var ve = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `,`))
  }
}
var T = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `value`, ``), v(this, `mirror`, ``))
  }
}
var ye = class extends T {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `{`),
      (this.value = `{`),
      (this.mirror = `}`))
  }
}
var be = class extends T {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `}`),
      (this.value = `}`),
      (this.mirror = `{`))
  }
}
var xe = class extends T {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `[`),
      (this.value = `[`),
      (this.mirror = `]`))
  }
}
var Se = class extends T {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `]`),
      (this.value = `]`),
      (this.mirror = `[`))
  }
}
var Ce = class extends T {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `(`),
      (this.value = `(`),
      (this.mirror = `)`))
  }
}
var we = class extends T {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `)`),
      (this.value = `)`),
      (this.mirror = `(`))
  }
}
var Te = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `~=`))
  }
}
var Ee = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `|=`))
  }
}
var De = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `^=`))
  }
}
var Oe = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `$=`))
  }
}
var ke = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `*=`))
  }
}
var Ae = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `||`))
  }
}
var je = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `tokenType`, `EOF`))
  }
  toSource() {
    return ``
  }
}
var E = class extends w {
  constructor(e) {
    ;(super(),
      v(this, `tokenType`, `DELIM`),
      v(this, `value`, ``),
      (this.value = C(e)))
  }
  toString() {
    return `DELIM(${this.value})`
  }
  toJSON() {
    let e = this.constructor.prototype.constructor.prototype.toJSON.call(this)
    return ((e.value = this.value), e)
  }
  toSource() {
    return this.value === `\\`
      ? `\\
`
      : this.value
  }
}
var D = class extends w {
  constructor(...e) {
    ;(super(...e), v(this, `value`, ``))
  }
  ASCIIMatch(e) {
    return this.value.toLowerCase() === e.toLowerCase()
  }
  toJSON() {
    let e = this.constructor.prototype.constructor.prototype.toJSON.call(this)
    return ((e.value = this.value), e)
  }
}
var Me = class extends D {
  constructor(e) {
    ;(super(), v(this, `tokenType`, `IDENT`), (this.value = e))
  }
  toString() {
    return `IDENT(${this.value})`
  }
  toSource() {
    return O(this.value)
  }
}
var Ne = class extends D {
  constructor(e) {
    ;(super(),
      v(this, `tokenType`, `FUNCTION`),
      v(this, `mirror`, void 0),
      (this.value = e),
      (this.mirror = `)`))
  }
  toString() {
    return `FUNCTION(${this.value})`
  }
  toSource() {
    return `${O(this.value)}(`
  }
}
var Pe = class extends D {
  constructor(e) {
    ;(super(), v(this, `tokenType`, `AT-KEYWORD`), (this.value = e))
  }
  toString() {
    return `AT(${this.value})`
  }
  toSource() {
    return `@${O(this.value)}`
  }
}
var Fe = class extends D {
  constructor(e) {
    ;(super(),
      v(this, `tokenType`, `HASH`),
      v(this, `type`, void 0),
      (this.value = e),
      (this.type = `unrestricted`))
  }
  toString() {
    return `HASH(${this.value})`
  }
  toJSON() {
    let e = this.constructor.prototype.constructor.prototype.toJSON.call(this)
    return ((e.value = this.value), (e.type = this.type), e)
  }
  toSource() {
    return this.type === `id` ? `#${O(this.value)}` : `#${Ve(this.value)}`
  }
}
var Ie = class extends D {
  constructor(e) {
    ;(super(), v(this, `tokenType`, `STRING`), (this.value = e))
  }
  toString() {
    return `"${He(this.value)}"`
  }
}
var Le = class extends D {
  constructor(e) {
    ;(super(), v(this, `tokenType`, `URL`), (this.value = e))
  }
  toString() {
    return `URL(${this.value})`
  }
  toSource() {
    return `url("${He(this.value)}")`
  }
}
var Re = class extends w {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `NUMBER`),
      v(this, `type`, void 0),
      v(this, `repr`, void 0),
      (this.type = `integer`),
      (this.repr = ``))
  }
  toString() {
    return this.type === `integer`
      ? `INT(${this.value})`
      : `NUMBER(${this.value})`
  }
  toJSON() {
    let e = super.toJSON()
    return (
      (e.value = this.value),
      (e.type = this.type),
      (e.repr = this.repr),
      e
    )
  }
  toSource() {
    return this.repr
  }
}
var ze = class extends w {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `PERCENTAGE`),
      v(this, `repr`, void 0),
      (this.repr = ``))
  }
  toString() {
    return `PERCENTAGE(${this.value})`
  }
  toJSON() {
    let e = this.constructor.prototype.constructor.prototype.toJSON.call(this)
    return ((e.value = this.value), (e.repr = this.repr), e)
  }
  toSource() {
    return `${this.repr}%`
  }
}
var Be = class extends w {
  constructor() {
    ;(super(),
      v(this, `tokenType`, `DIMENSION`),
      v(this, `type`, void 0),
      v(this, `repr`, void 0),
      v(this, `unit`, void 0),
      (this.type = `integer`),
      (this.repr = ``),
      (this.unit = ``))
  }
  toString() {
    return `DIM(${this.value},${this.unit})`
  }
  toJSON() {
    let e = this.constructor.prototype.constructor.prototype.toJSON.call(this)
    return (
      (e.value = this.value),
      (e.type = this.type),
      (e.repr = this.repr),
      (e.unit = this.unit),
      e
    )
  }
  toSource() {
    let e = this.repr,
      t = O(this.unit)
    return (
      t[0].toLowerCase() === `e` &&
        (t[1] === `-` || y(t.charCodeAt(1), 48, 57)) &&
        (t = `\\65 ${t.slice(1, t.length)}`),
      e + t
    )
  }
}
function O(e) {
  e = `${e}`
  let t = ``,
    n = e.charCodeAt(0)
  for (let r = 0; r < e.length; r++) {
    let i = e.charCodeAt(r)
    if (i === 0) throw new ce(`Invalid character: the input contains U+0000.`)
    y(i, 1, 31) ||
    i === 127 ||
    (r === 0 && y(i, 48, 57)) ||
    (r === 1 && y(i, 48, 57) && n === 45)
      ? (t += `\\${i.toString(16)} `)
      : i >= 128 ||
          i === 45 ||
          i === 95 ||
          y(i, 48, 57) ||
          y(i, 65, 90) ||
          y(i, 97, 122)
        ? (t += e[r])
        : (t += `\\${e[r]}`)
  }
  return t
}
function Ve(e) {
  e = `${e}`
  let t = ``
  for (let n = 0; n < e.length; n++) {
    let r = e.charCodeAt(n)
    if (r === 0) throw new ce(`Invalid character: the input contains U+0000.`)
    r >= 128 ||
    r === 45 ||
    r === 95 ||
    y(r, 48, 57) ||
    y(r, 65, 90) ||
    y(r, 97, 122)
      ? (t += e[n])
      : (t += `\\${r.toString(16)} `)
  }
  return t
}
function He(e) {
  e = `${e}`
  let t = ``
  for (let n = 0; n < e.length; n++) {
    let r = e.charCodeAt(n)
    if (r === 0) throw new ce(`Invalid character: the input contains U+0000.`)
    y(r, 1, 31) || r === 127
      ? (t += `\\${r.toString(16)} `)
      : (t += r === 34 || r === 92 ? `\\${e[n]}` : e[n])
  }
  return t
}
var k = class extends Error {}
function Ue(e, t) {
  let n
  try {
    ;((n = ue(e)), n[n.length - 1] instanceof je || n.push(new je()))
  } catch (t) {
    let n = `${t.message} while parsing selector "${e}"`,
      r = (t.stack || ``).indexOf(t.message)
    throw (
      r !== -1 &&
        (t.stack =
          t.stack.substring(0, r) +
          n +
          t.stack.substring(r + t.message.length)),
      (t.message = n),
      t
    )
  }
  let r = n.find(
    (e) =>
      e instanceof Pe ||
      e instanceof de ||
      e instanceof fe ||
      e instanceof Ae ||
      e instanceof me ||
      e instanceof he ||
      e instanceof _e ||
      e instanceof ye ||
      e instanceof be ||
      e instanceof Le ||
      e instanceof ze
  )
  if (r)
    throw new k(
      `Unsupported token "${r.toSource()}" while parsing selector "${e}"`
    )
  let i = 0,
    a = new Set()
  function o() {
    return new k(
      `Unexpected token "${n[i].toSource()}" while parsing selector "${e}"`
    )
  }
  function s() {
    for (; n[i] instanceof pe; ) i++
  }
  function c(e = i) {
    return n[e] instanceof Me
  }
  function l(e = i) {
    return n[e] instanceof Ie
  }
  function u(e = i) {
    return n[e] instanceof Re
  }
  function d(e = i) {
    return n[e] instanceof ve
  }
  function f(e = i) {
    return n[e] instanceof Ce
  }
  function p(e = i) {
    return n[e] instanceof we
  }
  function m(e = i) {
    return n[e] instanceof Ne
  }
  function h(e = i) {
    return n[e] instanceof E && n[e].value === `*`
  }
  function g(e = i) {
    return n[e] instanceof je
  }
  function _(e = i) {
    return n[e] instanceof E && [`>`, `+`, `~`].includes(n[e].value)
  }
  function v(e = i) {
    return d(e) || p(e) || g(e) || _(e) || n[e] instanceof pe
  }
  function y() {
    let e = [b()]
    for (; s(), d(); ) (i++, e.push(b()))
    return e
  }
  function b() {
    return (s(), u() || l() ? n[i++].value : ee())
  }
  function ee() {
    let e = { simples: [] }
    for (
      s(),
        _()
          ? e.simples.push({
              selector: { functions: [{ name: `scope`, args: [] }] },
              combinator: ``,
            })
          : e.simples.push({ selector: te(), combinator: `` });
      ;

    ) {
      if ((s(), _()))
        ((e.simples[e.simples.length - 1].combinator = n[i++].value), s())
      else if (v()) break
      e.simples.push({ combinator: ``, selector: te() })
    }
    return e
  }
  function te() {
    let e = ``,
      r = []
    for (; !v(); )
      if (c() || h()) e += n[i++].toSource()
      else if (n[i] instanceof Fe) e += n[i++].toSource()
      else if (n[i] instanceof E && n[i].value === `.`) {
        if ((i++, c())) e += `.${n[i++].toSource()}`
        else throw o()
      } else if (n[i] instanceof ge) {
        if ((i++, c())) {
          if (!t.has(n[i].value.toLowerCase())) e += `:${n[i++].toSource()}`
          else {
            let e = n[i++].value.toLowerCase()
            ;(r.push({ name: e, args: [] }), a.add(e))
          }
        } else if (m()) {
          let c = n[i++].value.toLowerCase()
          if (
            (t.has(c)
              ? (r.push({ name: c, args: y() }), a.add(c))
              : (e += `:${c}(${ne()})`),
            s(),
            !p())
          )
            throw o()
          i++
        } else throw o()
      } else if (n[i] instanceof xe) {
        for (e += `[`, i++; !(n[i] instanceof Se) && !g(); )
          e += n[i++].toSource()
        if (!(n[i] instanceof Se)) throw o()
        ;((e += `]`), i++)
      } else throw o()
    if (!e && !r.length) throw o()
    return { css: e || void 0, functions: r }
  }
  function ne() {
    let e = ``,
      t = 1
    for (; !g() && ((f() || m()) && t++, p() && t--, t); )
      e += n[i++].toSource()
    return e
  }
  let x = y()
  if (!g()) throw o()
  if (x.some((e) => typeof e != `object` || !(`simples` in e)))
    throw new k(`Error while parsing selector "${e}"`)
  return { selector: x, names: Array.from(a) }
}
const We = new Set([
  `internal:has`,
  `internal:has-not`,
  `internal:and`,
  `internal:or`,
  `internal:chain`,
  `left-of`,
  `right-of`,
  `above`,
  `below`,
  `near`,
])
const Ge = new Set([`left-of`, `right-of`, `above`, `below`, `near`])
const Ke = new Set([
  `not`,
  `is`,
  `where`,
  `has`,
  `scope`,
  `light`,
  `visible`,
  `text`,
  `text-matches`,
  `text-is`,
  `has-text`,
  `above`,
  `below`,
  `right-of`,
  `left-of`,
  `near`,
  `nth-match`,
])
function qe(e) {
  let t = Xe(e),
    n = []
  for (let e of t.parts) {
    if (e.name === `css` || e.name === `css:light`) {
      e.name === `css:light` && (e.body = `:light(${e.body})`)
      let t = Ue(e.body, Ke)
      n.push({ name: `css`, body: t.selector, source: e.body })
      continue
    }
    if (We.has(e.name)) {
      let t, r
      try {
        let n = JSON.parse(`[${e.body}]`)
        if (
          !Array.isArray(n) ||
          n.length < 1 ||
          n.length > 2 ||
          typeof n[0] != `string`
        )
          throw new k(`Malformed selector: ${e.name}=${e.body}`)
        if (((t = n[0]), n.length === 2)) {
          if (typeof n[1] != `number` || !Ge.has(e.name))
            throw new k(`Malformed selector: ${e.name}=${e.body}`)
          r = n[1]
        }
      } catch {
        throw new k(`Malformed selector: ${e.name}=${e.body}`)
      }
      let i = {
          name: e.name,
          source: e.body,
          body: { parsed: qe(t), distance: r },
        },
        a = [...i.body.parsed.parts]
          .reverse()
          .find(
            (e) => e.name === `internal:control` && e.body === `enter-frame`
          ),
        o = a ? i.body.parsed.parts.indexOf(a) : -1
      ;(o !== -1 &&
        Je(i.body.parsed.parts.slice(0, o + 1), n.slice(0, o + 1)) &&
        i.body.parsed.parts.splice(0, o + 1),
        n.push(i))
      continue
    }
    n.push({ ...e, source: e.body })
  }
  if (We.has(n[0].name)) throw new k(`"${n[0].name}" selector cannot be first`)
  return { capture: t.capture, parts: n }
}
function Je(e, t) {
  return A({ parts: e }) === A({ parts: t })
}
function A(e, t) {
  return typeof e == `string`
    ? e
    : e.parts
        .map((n, r) => {
          let i = !0
          !t &&
            r !== e.capture &&
            (n.name === `css` ||
              (n.name === `xpath` && n.source.startsWith(`//`)) ||
              n.source.startsWith(`..`)) &&
            (i = !1)
          let a = i ? `${n.name}=` : ``
          return `${r === e.capture ? `*` : ``}${a}${n.source}`
        })
        .join(` >> `)
}
function Ye(e, t) {
  let n = (e, r) => {
    for (let i of e.parts) (t(i, r), We.has(i.name) && n(i.body.parsed, !0))
  }
  n(e, !1)
}
function Xe(e) {
  let t = 0,
    n,
    r = 0,
    i = { parts: [] },
    a = () => {
      let n = e.substring(r, t).trim(),
        a = n.indexOf(`=`),
        o,
        s
      a !== -1 &&
      n
        .substring(0, a)
        .trim()
        .match(/^[\w\-+:*]+$/)
        ? ((o = n.substring(0, a).trim()), (s = n.substring(a + 1)))
        : (n.length > 1 && n[0] === `"` && n[n.length - 1] === `"`) ||
            (n.length > 1 && n[0] === `'` && n[n.length - 1] === `'`)
          ? ((o = `text`), (s = n))
          : /^\(*\/\//.test(n) || n.startsWith(`..`)
            ? ((o = `xpath`), (s = n))
            : ((o = `css`), (s = n))
      let c = !1
      if (
        (o[0] === `*` && ((c = !0), (o = o.substring(1))),
        i.parts.push({ name: o, body: s }),
        c)
      ) {
        if (i.capture !== void 0)
          throw new k(`Only one of the selectors can capture using * modifier`)
        i.capture = i.parts.length - 1
      }
    }
  if (!e.includes(`>>`)) return ((t = e.length), a(), i)
  let o = () => {
    let n = e.substring(r, t).match(/^\s*text\s*=(.*)$/)
    return !!n && !!n[1]
  }
  for (; t < e.length; ) {
    let i = e[t]
    i === `\\` && t + 1 < e.length
      ? (t += 2)
      : i === n
        ? ((n = void 0), t++)
        : !n && (i === `"` || i === `'` || i === '`') && !o()
          ? ((n = i), t++)
          : !n && i === `>` && e[t + 1] === `>`
            ? (a(), (t += 2), (r = t))
            : t++
  }
  return (a(), i)
}
function j(e, t) {
  let n = 0,
    r = e.length === 0,
    i = () => e[n] || ``,
    a = () => {
      let t = i()
      return (++n, (r = n >= e.length), t)
    },
    o = (t) => {
      throw r
        ? new k(`Unexpected end of selector while parsing selector \`${e}\``)
        : new k(
            `Error while parsing selector \`${e}\` - unexpected symbol "${i()}" at position ${n}${t ? ` during ${t}` : ``}`
          )
    }
  function s() {
    for (; !r && /\s/.test(i()); ) a()
  }
  function c(e) {
    return (
      e >= `` ||
      (e >= `0` && e <= `9`) ||
      (e >= `A` && e <= `Z`) ||
      (e >= `a` && e <= `z`) ||
      (e >= `0` && e <= `9`) ||
      e === `_` ||
      e === `-`
    )
  }
  function l() {
    let e = ``
    for (s(); !r && c(i()); ) e += a()
    return e
  }
  function u(e) {
    let t = a()
    for (t !== e && o(`parsing quoted string`); !r && i() !== e; )
      (i() === `\\` && a(), (t += a()))
    return (i() !== e && o(`parsing quoted string`), (t += a()), t)
  }
  function d() {
    a() !== `/` && o(`parsing regular expression`)
    let t = ``,
      n = !1
    for (; !r; ) {
      if (i() === `\\`) ((t += a()), r && o(`parsing regular expression`))
      else if (n && i() === `]`) n = !1
      else if (!n && i() === `[`) n = !0
      else if (!n && i() === `/`) break
      t += a()
    }
    a() !== `/` && o(`parsing regular expression`)
    let s = ``
    for (; !r && i().match(/[dgimsuy]/); ) s += a()
    try {
      return new RegExp(t, s)
    } catch (t) {
      throw new k(`Error while parsing selector \`${e}\`: ${t.message}`)
    }
  }
  function f() {
    let e = ``
    return (
      s(),
      (e = i() === `'` || i() === `"` ? u(i()).slice(1, -1) : l()),
      e || o(`parsing property path`),
      e
    )
  }
  function p() {
    s()
    let e = ``
    return (
      r || (e += a()),
      !r && e !== `=` && (e += a()),
      [`=`, `*=`, `^=`, `$=`, `|=`, `~=`].includes(e) || o(`parsing operator`),
      e
    )
  }
  function m() {
    a()
    let t = []
    for (t.push(f()), s(); i() === `.`; ) (a(), t.push(f()), s())
    if (i() === `]`)
      return (
        a(),
        {
          name: t.join(`.`),
          jsonPath: t,
          op: `<truthy>`,
          value: null,
          caseSensitive: !1,
        }
      )
    let n = p(),
      l,
      m = !0
    if ((s(), i() === `/`)) {
      if (n !== `=`)
        throw new k(
          `Error while parsing selector \`${e}\` - cannot use ${n} in attribute with regular expression`
        )
      l = d()
    } else if (i() === `'` || i() === `"`)
      ((l = u(i()).slice(1, -1)),
        s(),
        i() === `i` || i() === `I`
          ? ((m = !1), a())
          : (i() === `s` || i() === `S`) && ((m = !0), a()))
    else {
      for (l = ``; !r && (c(i()) || i() === `+` || i() === `.`); ) l += a()
      l === `true` ? (l = !0) : l === `false` && (l = !1)
    }
    if (
      (s(),
      i() !== `]` && o(`parsing attribute value`),
      a(),
      n !== `=` && typeof l != `string`)
    )
      throw new k(
        `Error while parsing selector \`${e}\` - cannot use ${n} in attribute with non-string matching value - ${l}`
      )
    return { name: t.join(`.`), jsonPath: t, op: n, value: l, caseSensitive: m }
  }
  let h = { name: ``, attributes: [] }
  for (h.name = l(), s(); i() === `[`; ) (h.attributes.push(m()), s())
  if ((r || o(void 0), !h.name && !h.attributes.length))
    throw new k(
      `Error while parsing selector \`${e}\` - selector cannot be empty`
    )
  return h
}
function Ze(e, t = `'`) {
  let n = JSON.stringify(e),
    r = n.substring(1, n.length - 1).replace(/\\"/g, `"`)
  if (t === `'`) return t + r.replace(/'/g, `\\'`) + t
  if (t === `"`) return t + r.replace(/"/g, `\\"`) + t
  if (t === '`') return t + r.replace(/`/g, '`') + t
  throw Error(`Invalid escape char`)
}
function M(e) {
  let t = ``
  for (let n = 0; n < e.length; n++) t += Qe(e, n)
  return t
}
function N(e) {
  return `"${M(e).replace(/\\ /g, ` `)}"`
}
function Qe(e, t) {
  let n = e.charCodeAt(t)
  return n === 0
    ? `�`
    : (n >= 1 && n <= 31) ||
        (n >= 48 && n <= 57 && (t === 0 || (t === 1 && e.charCodeAt(0) === 45)))
      ? `\\${n.toString(16)} `
      : t === 0 && n === 45 && e.length === 1
        ? `\\${e.charAt(t)}`
        : n >= 128 ||
            n === 45 ||
            n === 95 ||
            (n >= 48 && n <= 57) ||
            (n >= 65 && n <= 90) ||
            (n >= 97 && n <= 122)
          ? e.charAt(t)
          : `\\${e.charAt(t)}`
}
function P(e) {
  return e
    .replace(/[\u200b\u00ad]/g, ``)
    .trim()
    .replace(/\s+/g, ` `)
}
function $e(e) {
  return e.replace(/(^|[^\\])(\\\\)*\\(['"`])/g, `$1$2$3`)
}
function et(e) {
  return e.unicode || e.unicodeSets
    ? String(e)
    : String(e)
        .replace(/(^|[^\\])(\\\\)*(["'`])/g, `$1$2\\$3`)
        .replace(/>>/g, `\\>\\>`)
}
function F(e, t) {
  return typeof e == `string` ? `${JSON.stringify(e)}${t ? `s` : `i`}` : et(e)
}
function I(e, t) {
  return typeof e == `string`
    ? `"${e.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`)}"${t ? `s` : `i`}`
    : et(e)
}
function tt(e, t, n = ``) {
  if (e.length <= t) return e
  let r = [...e]
  return r.length > t ? r.slice(0, t - n.length).join(``) + n : r.join(``)
}
function nt(e, t) {
  return tt(e, t, `…`)
}
function rt(e) {
  return e.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`)
}
function L(e) {
  if (e.parentElement) return e.parentElement
  if (e.parentNode && e.parentNode.nodeType === 11 && e.parentNode.host)
    return e.parentNode.host
}
function it(e) {
  let t = e
  for (; t.parentNode; ) t = t.parentNode
  if (t.nodeType === 11 || t.nodeType === 9) return t
}
function at(e) {
  for (; e.parentElement; ) e = e.parentElement
  return L(e)
}
function ot(e, t) {
  for (; e; ) {
    let n = e.closest(t)
    if (n) return n
    e = at(e)
  }
}
function R(e, t) {
  return e.ownerDocument && e.ownerDocument.defaultView
    ? e.ownerDocument.defaultView.getComputedStyle(e, t)
    : void 0
}
function st(e, t) {
  if (((t ??= R(e)), !t)) return !0
  if (Element.prototype.checkVisibility && Q.options.browser !== `webkit`) {
    if (!e.checkVisibility()) return !1
  } else {
    let t = e.closest(`details,summary`)
    if (t !== e && t?.nodeName === `DETAILS` && !t.open) return !1
  }
  return t.visibility === `visible`
}
function ct(e) {
  let t = R(e)
  if (!t) return !0
  if (t.display === `contents`) {
    for (let t = e.firstChild; t; t = t.nextSibling)
      if ((t.nodeType === 1 && ct(t)) || (t.nodeType === 3 && lt(t))) return !0
    return !1
  }
  if (!st(e, t)) return !1
  let n = e.getBoundingClientRect()
  return n.width > 0 && n.height > 0
}
function lt(e) {
  let t = e.ownerDocument.createRange()
  t.selectNode(e)
  let n = t.getBoundingClientRect()
  return n.width > 0 && n.height > 0
}
function z(e) {
  return e instanceof HTMLFormElement ? `FORM` : e.tagName.toUpperCase()
}
function ut(e) {
  return e.hasAttribute(`aria-label`) || e.hasAttribute(`aria-labelledby`)
}
const dt = `article:not([role]), aside:not([role]), main:not([role]), nav:not([role]), section:not([role]), [role=article], [role=complementary], [role=main], [role=navigation], [role=region]`
const ft = new Map([
  [`aria-atomic`, void 0],
  [`aria-busy`, void 0],
  [`aria-controls`, void 0],
  [`aria-current`, void 0],
  [`aria-describedby`, void 0],
  [`aria-details`, void 0],
  [`aria-dropeffect`, void 0],
  [`aria-flowto`, void 0],
  [`aria-grabbed`, void 0],
  [`aria-hidden`, void 0],
  [`aria-keyshortcuts`, void 0],
  [
    `aria-label`,
    new Set([
      `caption`,
      `code`,
      `deletion`,
      `emphasis`,
      `generic`,
      `insertion`,
      `paragraph`,
      `presentation`,
      `strong`,
      `subscript`,
      `superscript`,
    ]),
  ],
  [
    `aria-labelledby`,
    new Set([
      `caption`,
      `code`,
      `deletion`,
      `emphasis`,
      `generic`,
      `insertion`,
      `paragraph`,
      `presentation`,
      `strong`,
      `subscript`,
      `superscript`,
    ]),
  ],
  [`aria-live`, void 0],
  [`aria-owns`, void 0],
  [`aria-relevant`, void 0],
  [`aria-roledescription`, new Set([`generic`])],
])
function pt(e, t) {
  return [...ft].some(([n, r]) => !r?.has(t || ``) && e.hasAttribute(n))
}
function mt(e) {
  return !Number.isNaN(Number(String(e.getAttribute(`tabindex`))))
}
function ht(e) {
  return !$t(e) && (gt(e) || mt(e))
}
function gt(e) {
  let t = z(e)
  return [`BUTTON`, `DETAILS`, `SELECT`, `TEXTAREA`].includes(t)
    ? !0
    : t === `A` || t === `AREA`
      ? e.hasAttribute(`href`)
      : t === `INPUT` && !e.hidden
}
const _t = {
  A: (e) => (e.hasAttribute(`href`) ? `link` : null),
  AREA: (e) => (e.hasAttribute(`href`) ? `link` : null),
  ARTICLE: () => `article`,
  ASIDE: () => `complementary`,
  BLOCKQUOTE: () => `blockquote`,
  BUTTON: () => `button`,
  CAPTION: () => `caption`,
  CODE: () => `code`,
  DATALIST: () => `listbox`,
  DD: () => `definition`,
  DEL: () => `deletion`,
  DETAILS: () => `group`,
  DFN: () => `term`,
  DIALOG: () => `dialog`,
  DT: () => `term`,
  EM: () => `emphasis`,
  FIELDSET: () => `group`,
  FIGURE: () => `figure`,
  FOOTER: (e) => (ot(e, dt) ? null : `contentinfo`),
  FORM: (e) => (ut(e) ? `form` : null),
  H1: () => `heading`,
  H2: () => `heading`,
  H3: () => `heading`,
  H4: () => `heading`,
  H5: () => `heading`,
  H6: () => `heading`,
  HEADER: (e) => (ot(e, dt) ? null : `banner`),
  HR: () => `separator`,
  HTML: () => `document`,
  IMG: (e) =>
    e.getAttribute(`alt`) === `` && !e.getAttribute(`title`) && !pt(e) && !mt(e)
      ? `presentation`
      : `img`,
  INPUT: (e) => {
    let t = e.type.toLowerCase()
    if (t === `search`) return e.hasAttribute(`list`) ? `combobox` : `searchbox`
    if ([`email`, `tel`, `text`, `url`, ``].includes(t)) {
      let t = H(e, e.getAttribute(`list`))[0]
      return t && z(t) === `DATALIST` ? `combobox` : `textbox`
    }
    return t === `hidden`
      ? ``
      : t === `file`
        ? `button`
        : {
            button: `button`,
            checkbox: `checkbox`,
            image: `button`,
            number: `spinbutton`,
            radio: `radio`,
            range: `slider`,
            reset: `button`,
            submit: `button`,
          }[t] || `textbox`
  },
  INS: () => `insertion`,
  LI: () => `listitem`,
  MAIN: () => `main`,
  MARK: () => `mark`,
  MATH: () => `math`,
  MENU: () => `list`,
  METER: () => `meter`,
  NAV: () => `navigation`,
  OL: () => `list`,
  OPTGROUP: () => `group`,
  OPTION: () => `option`,
  OUTPUT: () => `status`,
  P: () => `paragraph`,
  PROGRESS: () => `progressbar`,
  SECTION: (e) => (ut(e) ? `region` : null),
  SELECT: (e) =>
    e.hasAttribute(`multiple`) || e.size > 1 ? `listbox` : `combobox`,
  STRONG: () => `strong`,
  SUB: () => `subscript`,
  SUP: () => `superscript`,
  SVG: () => `img`,
  TABLE: () => `table`,
  TBODY: () => `rowgroup`,
  TD: (e) => {
    let t = ot(e, `table`),
      n = t ? Ct(t) : ``
    return n === `grid` || n === `treegrid` ? `gridcell` : `cell`
  },
  TEXTAREA: () => `textbox`,
  TFOOT: () => `rowgroup`,
  TH: (e) => {
    if (e.getAttribute(`scope`) === `col`) return `columnheader`
    if (e.getAttribute(`scope`) === `row`) return `rowheader`
    let t = ot(e, `table`),
      n = t ? Ct(t) : ``
    return n === `grid` || n === `treegrid` ? `gridcell` : `cell`
  },
  THEAD: () => `rowgroup`,
  TIME: () => `time`,
  TR: () => `row`,
  UL: () => `list`,
}
const vt = {
  DD: [`DL`, `DIV`],
  DIV: [`DL`],
  DT: [`DL`, `DIV`],
  LI: [`OL`, `UL`],
  TBODY: [`TABLE`],
  TD: [`TR`],
  TFOOT: [`TABLE`],
  TH: [`TR`],
  THEAD: [`TABLE`],
  TR: [`THEAD`, `TBODY`, `TFOOT`, `TABLE`],
}
function yt(e) {
  let t = _t[z(e)]?.call(_t, e) || ``
  if (!t) return null
  let n = e
  for (; n; ) {
    let e = L(n),
      t = vt[z(n)]
    if (!t || !e || !t.includes(z(e))) break
    let r = Ct(e)
    if ((r === `none` || r === `presentation`) && !wt(e, r)) return r
    n = e
  }
  return t
}
const bt =
  `alert.alertdialog.application.article.banner.blockquote.button.caption.cell.checkbox.code.columnheader.combobox.command.complementary.composite.contentinfo.definition.deletion.dialog.directory.document.emphasis.feed.figure.form.generic.grid.gridcell.group.heading.img.input.insertion.landmark.link.list.listbox.listitem.log.main.marquee.math.meter.menu.menubar.menuitem.menuitemcheckbox.menuitemradio.navigation.none.note.option.paragraph.presentation.progressbar.radio.radiogroup.range.region.roletype.row.rowgroup.rowheader.scrollbar.search.searchbox.section.sectionhead.select.separator.slider.spinbutton.status.strong.structure.subscript.superscript.switch.tab.table.tablist.tabpanel.term.textbox.time.timer.toolbar.tooltip.tree.treegrid.treeitem.widget.window`.split(
    `.`
  )
const xt = [
  `command`,
  `composite`,
  `input`,
  `landmark`,
  `range`,
  `roletype`,
  `section`,
  `sectionhead`,
  `select`,
  `structure`,
  `widget`,
  `window`,
]
const St = bt.filter((e) => !xt.includes(e))
function Ct(e) {
  return (
    (e.getAttribute(`role`) || ``)
      .split(` `)
      .map((e) => e.trim())
      .find((e) => St.includes(e)) || null
  )
}
function wt(e, t) {
  return pt(e, t) || ht(e)
}
function B(e) {
  let t = Ct(e)
  if (!t) return yt(e)
  if (t === `none` || t === `presentation`) {
    let t = yt(e)
    if (wt(e, t)) return t
  }
  return t
}
function Tt(e) {
  return e === null ? void 0 : e.toLowerCase() === `true`
}
function Et(e) {
  return [`STYLE`, `SCRIPT`, `NOSCRIPT`, `TEMPLATE`].includes(z(e))
}
function V(e) {
  if (Et(e)) return !0
  let t = R(e),
    n = e.nodeName === `SLOT`
  if (t?.display === `contents` && !n) {
    for (let t = e.firstChild; t; t = t.nextSibling)
      if ((t.nodeType === 1 && !V(t)) || (t.nodeType === 3 && lt(t))) return !1
    return !0
  }
  return (
    (!(e.nodeName === `OPTION` && e.closest(`select`)) && !n && !st(e, t)) ||
    Dt(e)
  )
}
function Dt(e) {
  let t = cn?.get(e)
  if (t === void 0) {
    if (
      ((t = !1),
      e.parentElement &&
        e.parentElement.shadowRoot &&
        !e.assignedSlot &&
        (t = !0),
      !t)
    ) {
      let n = R(e)
      t = !n || n.display === `none` || Tt(e.getAttribute(`aria-hidden`)) === !0
    }
    if (!t) {
      let n = L(e)
      n && (t = Dt(n))
    }
    cn?.set(e, t)
  }
  return t
}
function H(e, t) {
  if (!t) return []
  let n = it(e)
  if (!n) return []
  try {
    let e = t.split(` `).filter((e) => !!e),
      r = new Set()
    for (let t of e) {
      let e = n.querySelector(`#${CSS.escape(t)}`)
      e && r.add(e)
    }
    return [...r]
  } catch {
    return []
  }
}
function U(e) {
  return e.trim()
}
function W(e) {
  return e
    .split(`\xA0`)
    .map((e) =>
      e
        .replace(
          /\r\n/g,
          `
`
        )
        .replace(/[\u200b\u00ad]/g, ``)
        .replace(/\s\s*/g, ` `)
    )
    .join(`\xA0`)
    .trim()
}
function Ot(e, t) {
  let n = [...e.querySelectorAll(t)]
  for (let r of H(e, e.getAttribute(`aria-owns`)))
    (r.matches(t) && n.push(r), n.push(...r.querySelectorAll(t)))
  return n
}
function kt(e, t) {
  let n = t === `::before` ? ln : un
  if (n?.has(e)) return n?.get(e) || ``
  let r = At(R(e, t))
  return (n && n.set(e, r), r)
}
function At(e) {
  if (!e) return ``
  let t = e.content
  if (
    (t[0] === `'` && t[t.length - 1] === `'`) ||
    (t[0] === `"` && t[t.length - 1] === `"`)
  ) {
    let n = t.substring(1, t.length - 1)
    return (e.display || `inline`) === `inline` ? n : ` ${n} `
  }
  return ``
}
function jt(e) {
  let t = e.getAttribute(`aria-labelledby`)
  return t === null ? null : H(e, t)
}
function Mt(e, t) {
  let n = [
      `button`,
      `cell`,
      `checkbox`,
      `columnheader`,
      `gridcell`,
      `heading`,
      `link`,
      `menuitem`,
      `menuitemcheckbox`,
      `menuitemradio`,
      `option`,
      `radio`,
      `row`,
      `rowheader`,
      `switch`,
      `tab`,
      `tooltip`,
      `treeitem`,
    ].includes(e),
    r =
      t &&
      [
        ``,
        `caption`,
        `code`,
        `contentinfo`,
        `definition`,
        `deletion`,
        `emphasis`,
        `insertion`,
        `list`,
        `listitem`,
        `mark`,
        `none`,
        `paragraph`,
        `presentation`,
        `region`,
        `row`,
        `rowgroup`,
        `section`,
        `strong`,
        `subscript`,
        `superscript`,
        `table`,
        `term`,
        `time`,
      ].includes(e)
  return n || r
}
function Nt(e, t) {
  let n = t ? an : rn,
    r = n?.get(e)
  return (
    r === void 0 &&
      ((r = ``),
      [
        `caption`,
        `code`,
        `definition`,
        `deletion`,
        `emphasis`,
        `generic`,
        `insertion`,
        `mark`,
        `paragraph`,
        `presentation`,
        `strong`,
        `subscript`,
        `suggestion`,
        `superscript`,
        `term`,
        `time`,
      ].includes(B(e) || ``) ||
        (r = W(
          G(e, {
            includeHidden: t,
            visitedElements: new Set(),
            embeddedInDescribedBy: void 0,
            embeddedInLabelledBy: void 0,
            embeddedInLabel: void 0,
            embeddedInNativeTextAlternative: void 0,
            embeddedInTargetElement: `self`,
          })
        )),
      n?.set(e, r)),
    r
  )
}
function G(e, t) {
  if (t.visitedElements.has(e)) return ``
  let n = {
    ...t,
    embeddedInTargetElement:
      t.embeddedInTargetElement === `self`
        ? `descendant`
        : t.embeddedInTargetElement,
  }
  if (!t.includeHidden) {
    let n =
      !!t.embeddedInLabelledBy?.hidden ||
      !!t.embeddedInDescribedBy?.hidden ||
      !!t.embeddedInNativeTextAlternative?.hidden ||
      !!t.embeddedInLabel?.hidden
    if (Et(e) || (!n && V(e))) return (t.visitedElements.add(e), ``)
  }
  let r = jt(e)
  if (!t.embeddedInLabelledBy) {
    let e = (r || [])
      .map((e) =>
        G(e, {
          ...t,
          embeddedInLabelledBy: { element: e, hidden: V(e) },
          embeddedInDescribedBy: void 0,
          embeddedInTargetElement: void 0,
          embeddedInLabel: void 0,
          embeddedInNativeTextAlternative: void 0,
        })
      )
      .join(` `)
    if (e) return e
  }
  let i = B(e) || ``,
    a = z(e)
  if (
    t.embeddedInLabel ||
    t.embeddedInLabelledBy ||
    t.embeddedInTargetElement === `descendant`
  ) {
    let o = [...(e.labels || [])].includes(e),
      s = (r || []).includes(e)
    if (!o && !s) {
      if (i === `textbox`)
        return (
          t.visitedElements.add(e),
          a === `INPUT` || a === `TEXTAREA` ? e.value : e.textContent || ``
        )
      if ([`combobox`, `listbox`].includes(i)) {
        t.visitedElements.add(e)
        let r
        if (a === `SELECT`)
          ((r = [...e.selectedOptions]),
            !r.length && e.options.length && r.push(e.options[0]))
        else {
          let t =
            i === `combobox` ? Ot(e, `*`).find((e) => B(e) === `listbox`) : e
          r = t
            ? Ot(t, `[aria-selected="true"]`).filter((e) => B(e) === `option`)
            : []
        }
        return !r.length && a === `INPUT`
          ? e.value
          : r.map((e) => G(e, n)).join(` `)
      }
      if (
        [`progressbar`, `scrollbar`, `slider`, `spinbutton`, `meter`].includes(
          i
        )
      )
        return (
          t.visitedElements.add(e),
          e.hasAttribute(`aria-valuetext`)
            ? e.getAttribute(`aria-valuetext`) || ``
            : e.hasAttribute(`aria-valuenow`)
              ? e.getAttribute(`aria-valuenow`) || ``
              : e.getAttribute(`value`) || ``
        )
      if ([`menu`].includes(i)) return (t.visitedElements.add(e), ``)
    }
  }
  let o = e.getAttribute(`aria-label`) || ``
  if (U(o)) return (t.visitedElements.add(e), o)
  if (![`presentation`, `none`].includes(i)) {
    if (a === `INPUT` && [`button`, `submit`, `reset`].includes(e.type)) {
      t.visitedElements.add(e)
      let n = e.value || ``
      return U(n)
        ? n
        : e.type === `submit`
          ? `Submit`
          : e.type === `reset`
            ? `Reset`
            : e.getAttribute(`title`) || ``
    }
    if (a === `INPUT` && e.type === `image`) {
      t.visitedElements.add(e)
      let n = e.labels || []
      if (n.length && !t.embeddedInLabelledBy) return nn(n, t)
      let r = e.getAttribute(`alt`) || ``
      if (U(r)) return r
      let i = e.getAttribute(`title`) || ``
      return U(i) ? i : `Submit`
    }
    if (!r && a === `BUTTON`) {
      t.visitedElements.add(e)
      let n = e.labels || []
      if (n.length) return nn(n, t)
    }
    if (!r && a === `OUTPUT`) {
      t.visitedElements.add(e)
      let n = e.labels || []
      return n.length ? nn(n, t) : e.getAttribute(`title`) || ``
    }
    if (!r && (a === `TEXTAREA` || a === `SELECT` || a === `INPUT`)) {
      t.visitedElements.add(e)
      let n = e.labels || []
      if (n.length) return nn(n, t)
      let r =
          (a === `INPUT` &&
            [`text`, `password`, `search`, `tel`, `email`, `url`].includes(
              e.type
            )) ||
          a === `TEXTAREA`,
        i = e.getAttribute(`placeholder`) || ``,
        o = e.getAttribute(`title`) || ``
      return !r || o ? o : i
    }
    if (!r && a === `FIELDSET`) {
      t.visitedElements.add(e)
      for (let t = e.firstElementChild; t; t = t.nextElementSibling)
        if (z(t) === `LEGEND`)
          return G(t, {
            ...n,
            embeddedInNativeTextAlternative: { element: t, hidden: V(t) },
          })
      return e.getAttribute(`title`) || ``
    }
    if (!r && a === `FIGURE`) {
      t.visitedElements.add(e)
      for (let t = e.firstElementChild; t; t = t.nextElementSibling)
        if (z(t) === `FIGCAPTION`)
          return G(t, {
            ...n,
            embeddedInNativeTextAlternative: { element: t, hidden: V(t) },
          })
      return e.getAttribute(`title`) || ``
    }
    if (a === `IMG`) {
      t.visitedElements.add(e)
      let n = e.getAttribute(`alt`) || ``
      return U(n) ? n : e.getAttribute(`title`) || ``
    }
    if (a === `TABLE`) {
      t.visitedElements.add(e)
      for (let t = e.firstElementChild; t; t = t.nextElementSibling)
        if (z(t) === `CAPTION`)
          return G(t, {
            ...n,
            embeddedInNativeTextAlternative: { element: t, hidden: V(t) },
          })
      let r = e.getAttribute(`summary`) || ``
      if (r) return r
    }
    if (a === `AREA`) {
      t.visitedElements.add(e)
      let n = e.getAttribute(`alt`) || ``
      return U(n) ? n : e.getAttribute(`title`) || ``
    }
    if (a === `SVG` || e.ownerSVGElement) {
      t.visitedElements.add(e)
      for (let t = e.firstElementChild; t; t = t.nextElementSibling)
        if (z(t) === `TITLE` && t.ownerSVGElement)
          return G(t, {
            ...n,
            embeddedInLabelledBy: { element: t, hidden: V(t) },
          })
    }
    if (e.ownerSVGElement && a === `A`) {
      let n = e.getAttribute(`xlink:title`) || ``
      if (U(n)) return (t.visitedElements.add(e), n)
    }
  }
  let s = a === `SUMMARY` && ![`presentation`, `none`].includes(i)
  if (
    Mt(i, t.embeddedInTargetElement === `descendant`) ||
    s ||
    t.embeddedInLabelledBy ||
    t.embeddedInDescribedBy ||
    t.embeddedInLabel ||
    t.embeddedInNativeTextAlternative
  ) {
    t.visitedElements.add(e)
    let r = zt(e, n)
    if (t.embeddedInTargetElement === `self` ? U(r) : r) return r
  }
  if (![`presentation`, `none`].includes(i) || a === `IFRAME`) {
    t.visitedElements.add(e)
    let n = e.getAttribute(`title`) || ``
    if (U(n)) return n
  }
  return (t.visitedElements.add(e), ``)
}
function zt(e, t) {
  let n = [],
    r = (e, r) => {
      if (!(r && e.assignedSlot)) {
        if (e.nodeType === 1) {
          let r = R(e)?.display || `inline`,
            i = G(e, t)
          ;((r !== `inline` || e.nodeName === `BR`) && (i = ` ` + i + ` `),
            n.push(i))
        } else e.nodeType === 3 && n.push(e.textContent || ``)
      }
    }
  n.push(kt(e, `::before`))
  let i = e.nodeName === `SLOT` ? e.assignedNodes() : []
  if (i.length) for (let e of i) r(e, !1)
  else {
    for (let t = e.firstChild; t; t = t.nextSibling) r(t, !0)
    if (e.shadowRoot)
      for (let t = e.shadowRoot.firstChild; t; t = t.nextSibling) r(t, !0)
    for (let t of H(e, e.getAttribute(`aria-owns`))) r(t, !0)
  }
  return (n.push(kt(e, `::after`)), n.join(``))
}
const Bt = [
  `gridcell`,
  `option`,
  `row`,
  `tab`,
  `rowheader`,
  `columnheader`,
  `treeitem`,
]
function Vt(e) {
  return z(e) === `OPTION`
    ? e.selected
    : Bt.includes(B(e) || ``)
      ? Tt(e.getAttribute(`aria-selected`)) === !0
      : !1
}
const Ht = [
  `checkbox`,
  `menuitemcheckbox`,
  `option`,
  `radio`,
  `switch`,
  `menuitemradio`,
  `treeitem`,
]
function Ut(e) {
  let t = Wt(e)
  return t !== `error` && t
}
function Wt(e, t) {
  let n = z(e)
  if (n === `INPUT` && e.indeterminate) return `mixed`
  if (n === `INPUT` && [`checkbox`, `radio`].includes(e.type)) return e.checked
  if (Ht.includes(B(e) || ``)) {
    let t = e.getAttribute(`aria-checked`)
    return t === `true` || (t === `mixed` && `mixed`)
  }
  return `error`
}
const Gt = [`button`]
function Kt(e) {
  if (Gt.includes(B(e) || ``)) {
    let t = e.getAttribute(`aria-pressed`)
    if (t === `true`) return !0
    if (t === `mixed`) return `mixed`
  }
  return !1
}
const qt = [
  `application`,
  `button`,
  `checkbox`,
  `combobox`,
  `gridcell`,
  `link`,
  `listbox`,
  `menuitem`,
  `row`,
  `rowheader`,
  `tab`,
  `treeitem`,
  `columnheader`,
  `menuitemcheckbox`,
  `menuitemradio`,
  `rowheader`,
  `switch`,
]
function Jt(e) {
  if (z(e) === `DETAILS`) return e.open
  if (qt.includes(B(e) || ``)) {
    let t = e.getAttribute(`aria-expanded`)
    return t === null ? `none` : t === `true`
  }
  return `none`
}
const Yt = [`heading`, `listitem`, `row`, `treeitem`]
function Xt(e) {
  let t = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }[z(e)]
  if (t) return t
  if (Yt.includes(B(e) || ``)) {
    let t = e.getAttribute(`aria-level`),
      n = t === null ? NaN : Number(t)
    if (Number.isInteger(n) && n >= 1) return n
  }
  return 0
}
const Zt =
  `application.button.composite.gridcell.group.input.link.menuitem.scrollbar.separator.tab.checkbox.columnheader.combobox.grid.listbox.menu.menubar.menuitemcheckbox.menuitemradio.option.radio.radiogroup.row.rowheader.searchbox.select.slider.spinbutton.switch.tablist.textbox.toolbar.tree.treegrid.treeitem`.split(
    `.`
  )
function Qt(e) {
  return $t(e) || tn(e)
}
function $t(e) {
  return (
    [`BUTTON`, `INPUT`, `SELECT`, `TEXTAREA`, `OPTION`, `OPTGROUP`].includes(
      e.tagName
    ) &&
    (e.hasAttribute(`disabled`) || en(e))
  )
}
function en(e) {
  let t = e?.closest(`FIELDSET[DISABLED]`)
  if (!t) return !1
  let n = t.querySelector(`:scope > LEGEND`)
  return !n || !n.contains(e)
}
function tn(e) {
  if (!e) return !1
  if (Zt.includes(B(e) || ``)) {
    let t = (e.getAttribute(`aria-disabled`) || ``).toLowerCase()
    if (t === `true`) return !0
    if (t === `false`) return !1
  }
  return tn(L(e))
}
function nn(e, t) {
  return [...e]
    .map((e) =>
      G(e, {
        ...t,
        embeddedInLabel: { element: e, hidden: V(e) },
        embeddedInNativeTextAlternative: void 0,
        embeddedInLabelledBy: void 0,
        embeddedInDescribedBy: void 0,
        embeddedInTargetElement: void 0,
      })
    )
    .filter((e) => !!e)
    .join(` `)
}
let rn
let an
let on
let sn
let cn
let ln
let un
let dn = 0
function fn() {
  ;(++dn,
    (rn ??= new Map()),
    (an ??= new Map()),
    (sn ??= new Map()),
    (on ??= new Map()),
    (cn ??= new Map()),
    (ln ??= new Map()),
    (un ??= new Map()))
}
function pn() {
  --dn ||
    ((rn = void 0),
    (an = void 0),
    (sn = void 0),
    (on = void 0),
    (cn = void 0),
    (ln = void 0),
    (un = void 0))
}
function mn(e, t) {
  let n = typeof e == `string` && !t.caseSensitive ? e.toUpperCase() : e,
    r =
      typeof t.value == `string` && !t.caseSensitive
        ? t.value.toUpperCase()
        : t.value
  return t.op === `<truthy>`
    ? !!n
    : t.op === `=`
      ? r instanceof RegExp
        ? typeof n == `string` && !!n.match(r)
        : n === r
      : typeof n != `string` || typeof r != `string`
        ? !1
        : t.op === `*=`
          ? n.includes(r)
          : t.op === `^=`
            ? n.startsWith(r)
            : t.op === `$=`
              ? n.endsWith(r)
              : t.op === `|=`
                ? n === r || n.startsWith(`${r}-`)
                : t.op === `~=` && n.split(` `).includes(r)
}
function hn(e) {
  let t = e.ownerDocument
  return (
    e.nodeName === `SCRIPT` ||
    e.nodeName === `NOSCRIPT` ||
    e.nodeName === `STYLE` ||
    (t.head && t.head.contains(e))
  )
}
function K(e, t) {
  let n = e.get(t)
  if (n === void 0) {
    if (((n = { full: ``, normalized: ``, immediate: [] }), !hn(t))) {
      let r = ``
      if (
        t instanceof HTMLInputElement &&
        (t.type === `submit` || t.type === `button`)
      )
        n = { full: t.value, normalized: P(t.value), immediate: [t.value] }
      else {
        for (let i = t.firstChild; i; i = i.nextSibling)
          i.nodeType === Node.TEXT_NODE
            ? ((n.full += i.nodeValue || ``), (r += i.nodeValue || ``))
            : (r && n.immediate.push(r),
              (r = ``),
              i.nodeType === Node.ELEMENT_NODE && (n.full += K(e, i).full))
        ;(r && n.immediate.push(r),
          t.shadowRoot && (n.full += K(e, t.shadowRoot).full),
          n.full && (n.normalized = P(n.full)))
      }
    }
    e.set(t, n)
  }
  return n
}
function gn(e, t, n) {
  if (hn(t) || !n(K(e, t))) return `none`
  for (let r = t.firstChild; r; r = r.nextSibling)
    if (r.nodeType === Node.ELEMENT_NODE && n(K(e, r))) return `selfAndChildren`
  return t.shadowRoot && n(K(e, t.shadowRoot)) ? `selfAndChildren` : `self`
}
function _n(e, t) {
  let n = jt(t)
  if (n) return n.map((t) => K(e, t))
  let r = t.getAttribute(`aria-label`)
  if (r !== null && r.trim())
    return [{ full: r, normalized: P(r), immediate: [r] }]
  let i = t.nodeName === `INPUT` && t.type !== `hidden`
  if (
    [`BUTTON`, `METER`, `OUTPUT`, `PROGRESS`, `SELECT`, `TEXTAREA`].includes(
      t.nodeName
    ) ||
    i
  ) {
    let n = t.labels
    if (n) return [...n].map((t) => K(e, t))
  }
  return []
}
const vn = [
  `selected`,
  `checked`,
  `pressed`,
  `expanded`,
  `level`,
  `disabled`,
  `name`,
  `include-hidden`,
]
vn.sort()
function yn(e, t, n) {
  if (!t.includes(n))
    throw Error(
      `"${e}" attribute is only supported for roles: ${t
        .slice()
        .sort()
        .map((e) => `"${e}"`)
        .join(`, `)}`
    )
}
function q(e, t) {
  if (e.op !== `<truthy>` && !t.includes(e.value))
    throw Error(
      `"${e.name}" must be one of ${t.map((e) => JSON.stringify(e)).join(`, `)}`
    )
}
function J(e, t) {
  if (!t.includes(e.op))
    throw Error(`"${e.name}" does not support "${e.op}" matcher`)
}
function bn(e, t) {
  let n = { role: t }
  for (let r of e)
    switch (r.name) {
      case `checked`:
        ;(yn(r.name, Ht, t),
          q(r, [!0, !1, `mixed`]),
          J(r, [`<truthy>`, `=`]),
          (n.checked = r.op === `<truthy>` || r.value))
        break
      case `pressed`:
        ;(yn(r.name, Gt, t),
          q(r, [!0, !1, `mixed`]),
          J(r, [`<truthy>`, `=`]),
          (n.pressed = r.op === `<truthy>` || r.value))
        break
      case `selected`:
        ;(yn(r.name, Bt, t),
          q(r, [!0, !1]),
          J(r, [`<truthy>`, `=`]),
          (n.selected = r.op === `<truthy>` || r.value))
        break
      case `expanded`:
        ;(yn(r.name, qt, t),
          q(r, [!0, !1]),
          J(r, [`<truthy>`, `=`]),
          (n.expanded = r.op === `<truthy>` || r.value))
        break
      case `level`:
        if (
          (yn(r.name, Yt, t),
          typeof r.value == `string` && (r.value = +r.value),
          r.op !== `=` || typeof r.value != `number` || Number.isNaN(r.value))
        )
          throw Error(`"level" attribute must be compared to a number`)
        n.level = r.value
        break
      case `disabled`:
        ;(q(r, [!0, !1]),
          J(r, [`<truthy>`, `=`]),
          (n.disabled = r.op === `<truthy>` || r.value))
        break
      case `name`:
        if (r.op === `<truthy>`)
          throw Error(`"name" attribute must have a value`)
        if (typeof r.value != `string` && !(r.value instanceof RegExp))
          throw TypeError(
            `"name" attribute must be a string or a regular expression`
          )
        ;((n.name = r.value), (n.nameOp = r.op), (n.exact = r.caseSensitive))
        break
      case `include-hidden`:
        ;(q(r, [!0, !1]),
          J(r, [`<truthy>`, `=`]),
          (n.includeHidden = r.op === `<truthy>` || r.value))
        break
      default:
        throw Error(
          `Unknown attribute "${r.name}", must be one of ${vn.map((e) => `"${e}"`).join(`, `)}.`
        )
    }
  return n
}
function xn(e, t, n) {
  let r = [],
    i = (e) => {
      if (
        B(e) === t.role &&
        (t.selected === void 0 || Vt(e) === t.selected) &&
        (t.checked === void 0 || Ut(e) === t.checked) &&
        (t.pressed === void 0 || Kt(e) === t.pressed) &&
        (t.expanded === void 0 || Jt(e) === t.expanded) &&
        (t.level === void 0 || Xt(e) === t.level) &&
        (t.disabled === void 0 || Qt(e) === t.disabled) &&
        (t.includeHidden || !V(e))
      ) {
        if (t.name !== void 0) {
          let r = P(Nt(e, !!t.includeHidden))
          if (
            (typeof t.name == `string` && (t.name = P(t.name)),
            n && !t.exact && t.nameOp === `=` && (t.nameOp = `*=`),
            !mn(r, {
              op: t.nameOp || `=`,
              value: t.name,
              caseSensitive: !!t.exact,
            }))
          )
            return
        }
        r.push(e)
      }
    },
    a = (e) => {
      let t = []
      e.shadowRoot && t.push(e.shadowRoot)
      for (let n of e.querySelectorAll(`*`))
        (i(n), n.shadowRoot && t.push(n.shadowRoot))
      t.forEach(a)
    }
  return (a(e), r)
}
function Sn(e) {
  return {
    queryAll: (t, n) => {
      let r = j(n),
        i = r.name.toLowerCase()
      if (!i) throw Error(`Role must not be empty`)
      let a = bn(r.attributes, i)
      fn()
      try {
        return xn(t, a, e)
      } finally {
        pn()
      }
    },
  }
}
function Cn(e, t, n = !1) {
  return wn(e, t, n)[0]
}
function wn(e, t, n = !1, r = 20, i) {
  try {
    return Y(new Dn[e](i), qe(t), n, r)
  } catch {
    return [t]
  }
}
function Y(e, t, n = !1, r = 20) {
  let i = [...t.parts]
  for (let e = 0; e < i.length - 1; e++)
    if (
      i[e].name === `nth` &&
      i[e + 1].name === `internal:control` &&
      i[e + 1].body === `enter-frame`
    ) {
      let [t] = i.splice(e, 1)
      i.splice(e + 1, 0, t)
    }
  let a = [],
    o = n ? `frame-locator` : `page`
  for (let t = 0; t < i.length; t++) {
    let n = i[t],
      s = o
    if (((o = `locator`), n.name === `nth`)) {
      n.body === `0`
        ? a.push([
            e.generateLocator(s, `first`, ``),
            e.generateLocator(s, `nth`, `0`),
          ])
        : n.body === `-1`
          ? a.push([
              e.generateLocator(s, `last`, ``),
              e.generateLocator(s, `nth`, `-1`),
            ])
          : a.push([e.generateLocator(s, `nth`, n.body)])
      continue
    }
    if (n.name === `internal:text`) {
      let { exact: t, text: r } = En(n.body)
      a.push([e.generateLocator(s, `text`, r, { exact: t })])
      continue
    }
    if (n.name === `internal:has-text`) {
      let { exact: t, text: r } = En(n.body)
      if (!t) {
        a.push([e.generateLocator(s, `has-text`, r, { exact: t })])
        continue
      }
    }
    if (n.name === `internal:has-not-text`) {
      let { exact: t, text: r } = En(n.body)
      if (!t) {
        a.push([e.generateLocator(s, `has-not-text`, r, { exact: t })])
        continue
      }
    }
    if (n.name === `internal:has`) {
      let t = Y(e, n.body.parsed, !1, r)
      a.push(t.map((t) => e.generateLocator(s, `has`, t)))
      continue
    }
    if (n.name === `internal:has-not`) {
      let t = Y(e, n.body.parsed, !1, r)
      a.push(t.map((t) => e.generateLocator(s, `hasNot`, t)))
      continue
    }
    if (n.name === `internal:and`) {
      let t = Y(e, n.body.parsed, !1, r)
      a.push(t.map((t) => e.generateLocator(s, `and`, t)))
      continue
    }
    if (n.name === `internal:or`) {
      let t = Y(e, n.body.parsed, !1, r)
      a.push(t.map((t) => e.generateLocator(s, `or`, t)))
      continue
    }
    if (n.name === `internal:chain`) {
      let t = Y(e, n.body.parsed, !1, r)
      a.push(t.map((t) => e.generateLocator(s, `chain`, t)))
      continue
    }
    if (n.name === `internal:label`) {
      let { exact: t, text: r } = En(n.body)
      a.push([e.generateLocator(s, `label`, r, { exact: t })])
      continue
    }
    if (n.name === `internal:role`) {
      let t = j(n.body),
        r = { attrs: [] }
      for (let e of t.attributes)
        e.name === `name`
          ? ((r.exact = e.caseSensitive), (r.name = e.value))
          : (e.name === `level` &&
              typeof e.value == `string` &&
              (e.value = +e.value),
            r.attrs.push({
              name: e.name === `include-hidden` ? `includeHidden` : e.name,
              value: e.value,
            }))
      a.push([e.generateLocator(s, `role`, t.name, r)])
      continue
    }
    if (n.name === `internal:testid`) {
      let { value: t } = j(n.body).attributes[0]
      a.push([e.generateLocator(s, `test-id`, t)])
      continue
    }
    if (n.name === `internal:attr`) {
      let { name: t, value: r, caseSensitive: i } = j(n.body).attributes[0],
        o = r,
        c = !!i
      if (t === `placeholder`) {
        a.push([e.generateLocator(s, `placeholder`, o, { exact: c })])
        continue
      }
      if (t === `alt`) {
        a.push([e.generateLocator(s, `alt`, o, { exact: c })])
        continue
      }
      if (t === `title`) {
        a.push([e.generateLocator(s, `title`, o, { exact: c })])
        continue
      }
    }
    let c = `default`,
      l = i[t + 1]
    l &&
      l.name === `internal:control` &&
      l.body === `enter-frame` &&
      ((c = `frame`), (o = `frame-locator`), t++)
    let u = A({ parts: [n] }),
      d = e.generateLocator(s, c, u)
    if (
      c === 'default' &&
      l &&
      [`internal:has-text`, `internal:has-not-text`].includes(l.name)
    ) {
      let { exact: n, text: r } = En(l.body)
      if (!n) {
        let i = e.generateLocator(
            `locator`,
            l.name === `internal:has-text` ? `has-text` : `has-not-text`,
            r,
            { exact: n }
          ),
          o = {}
        l.name === `internal:has-text` ? (o.hasText = r) : (o.hasNotText = r)
        let c = e.generateLocator(s, `default`, u, o)
        ;(a.push([e.chainLocators([d, i]), c]), t++)
        continue
      }
    }
    let f
    if ([`xpath`, `css`].includes(n.name)) {
      let t = A({ parts: [n] }, !0)
      f = e.generateLocator(s, c, t)
    }
    a.push([d, f].filter(Boolean))
  }
  return Tn(e, a, r)
}
function Tn(e, t, n) {
  let r = t.map(() => ``),
    i = [],
    a = (o) => {
      if (o === t.length) return (i.push(e.chainLocators(r)), r.length < n)
      for (let e of t[o]) if (((r[o] = e), !a(o + 1))) return !1
      return !0
    }
  return (a(0), i)
}
function En(e) {
  let t = !1,
    n = e.match(/^\/(.*)\/([igm]*)$/)
  return n
    ? { text: new RegExp(n[1], n[2]) }
    : (e.endsWith(`"`)
        ? ((e = JSON.parse(e)), (t = !0))
        : e.endsWith(`"s`)
          ? ((e = JSON.parse(e.substring(0, e.length - 1))), (t = !0))
          : e.endsWith(`"i`) &&
            ((e = JSON.parse(e.substring(0, e.length - 1))), (t = !1)),
      { exact: t, text: e })
}
const Dn = {
  javascript: class {
    constructor(e) {
      this.preferredQuote = e
    }
    generateLocator(e, t, n, r = {}) {
      switch (t) {
        case `default`:
          return r.hasText === void 0
            ? r.hasNotText === void 0
              ? `locator(${this.quote(n)})`
              : `locator(${this.quote(n)}, { hasNotText: ${this.toHasText(r.hasNotText)} })`
            : `locator(${this.quote(n)}, { hasText: ${this.toHasText(r.hasText)} })`
        case `frame`:
          return `frameLocator(${this.quote(n)})`
        case `nth`:
          return `nth(${n})`
        case `first`:
          return `first()`
        case `last`:
          return `last()`
        case `role`: {
          let e = []
          On(r.name)
            ? e.push(`name: ${this.regexToSourceString(r.name)}`)
            : typeof r.name == `string` &&
              (e.push(`name: ${this.quote(r.name)}`),
              r.exact != null &&
                Q.options.exact !== r.exact &&
                e.push(`exact: ${r.exact}`))
          for (let { name: t, value: n } of r.attrs)
            e.push(`${t}: ${typeof n == `string` ? this.quote(n) : n}`)
          let t = e.length ? `, { ${e.join(`, `)} }` : ``
          return `getByRole(${this.quote(n)}${t})`
        }
        case `has-text`:
          return `filter({ hasText: ${this.toHasText(n)} })`
        case `has-not-text`:
          return `filter({ hasNotText: ${this.toHasText(n)} })`
        case `has`:
          return `filter({ has: ${n} })`
        case `hasNot`:
          return `filter({ hasNot: ${n} })`
        case `and`:
          return `and(${n})`
        case `or`:
          return `or(${n})`
        case `chain`:
          return `locator(${n})`
        case `test-id`: {
          let e = this.toTestIdValue(n)
          return e.startsWith(`'__vitest_`) && e.endsWith(`__'`)
            ? `page`
            : `getByTestId(${e})`
        }
        case `text`:
          return this.toCallWithExact(`getByText`, n, !!r.exact)
        case `alt`:
          return this.toCallWithExact(`getByAltText`, n, !!r.exact)
        case `placeholder`:
          return this.toCallWithExact(`getByPlaceholder`, n, !!r.exact)
        case `label`:
          return this.toCallWithExact(`getByLabel`, n, !!r.exact)
        case `title`:
          return this.toCallWithExact(`getByTitle`, n, !!r.exact)
        default:
          throw Error(`Unknown selector kind ${t}`)
      }
    }
    chainLocators(e) {
      return e.join(`.`)
    }
    regexToSourceString(e) {
      return $e(String(e))
    }
    toCallWithExact(e, t, n) {
      return On(t)
        ? `${e}(${this.regexToSourceString(t)})`
        : n != null && Q.options.exact !== n
          ? `${e}(${this.quote(t)}, { exact: ${n} })`
          : `${e}(${this.quote(t)})`
    }
    toHasText(e) {
      return On(e) ? this.regexToSourceString(e) : this.quote(e)
    }
    toTestIdValue(e) {
      return On(e) ? this.regexToSourceString(e) : this.quote(e)
    }
    quote(e) {
      return Ze(e, this.preferredQuote ?? `'`)
    }
  },
}
function On(e) {
  return e instanceof RegExp
}
const kn = new Map()
const An = new Map()
const jn = 1e4
function Mn(e, t, n) {
  ;(e._evaluator.begin(), fn())
  try {
    return Bn(Pn(e, t, n) || Rn(e, t, n))
  } finally {
    ;(kn.clear(), An.clear(), pn(), e._evaluator.end())
  }
}
function Nn(e) {
  return e.filter((e) => e[0].selector[0] !== `/`)
}
function Pn(e, t, n) {
  if (t.ownerDocument.documentElement === t)
    return [{ engine: `css`, selector: `html`, score: 1 }]
  let r = (r, a) => {
      let o = r === t,
        s = a ? In(e, r, r === t) : []
      r !== t && (s = Nn(s))
      let c = Fn(e, r, n).map((e) => [e]),
        l = Vn(e, t.ownerDocument, r, [...s, ...c], o)
      s = Nn(s)
      let u = (t) => {
        let n = a && !t.length,
          s = [...t, ...c].filter((e) => !l || X(e) < X(l)),
          u = s[0]
        if (u)
          for (let t = L(r); t; t = L(t)) {
            let a = i(t, n)
            if (!a || (l && X([...a, ...u]) >= X(l))) continue
            if (((u = Vn(e, t, r, s, o)), !u)) return
            let c = [...a, ...u]
            ;(!l || X(c) < X(l)) && (l = c)
          }
      }
      return (u(s), r === t && s.length && u([]), l)
    },
    i = (e, t) => {
      let n = t ? kn : An,
        i = n.get(e)
      return (i === void 0 && ((i = r(e, t)), n.set(e, i)), i)
    }
  return r(t, !n.noText)
}
function Fn(e, t, n) {
  let r = []
  for (let e of [`data-testid`, `data-test-id`, `data-test`])
    e !== n.testIdAttributeName &&
      t.getAttribute(e) &&
      r.push({
        engine: `css`,
        selector: `[${e}=${N(t.getAttribute(e))}]`,
        score: 2,
      })
  if (!n.noCSSId) {
    let e = t.getAttribute(`id`)
    e && !Hn(e) && r.push({ engine: `css`, selector: Ln(e), score: 500 })
  }
  if (
    (r.push({
      engine: `css`,
      selector: M(t.nodeName.toLowerCase()),
      score: 530,
    }),
    t.nodeName === `IFRAME`)
  ) {
    for (let e of [`name`, `title`])
      t.getAttribute(e) &&
        r.push({
          engine: `css`,
          selector: `${M(t.nodeName.toLowerCase())}[${e}=${N(t.getAttribute(e))}]`,
          score: 10,
        })
    return (
      t.getAttribute(n.testIdAttributeName) &&
        r.push({
          engine: `css`,
          selector: `[${n.testIdAttributeName}=${N(t.getAttribute(n.testIdAttributeName))}]`,
          score: 1,
        }),
      zn([r]),
      r
    )
  }
  if (
    (t.getAttribute(n.testIdAttributeName) &&
      r.push({
        engine: `internal:testid`,
        selector: `[${n.testIdAttributeName}=${I(t.getAttribute(n.testIdAttributeName), !0)}]`,
        score: 1,
      }),
    t.nodeName === `INPUT` || t.nodeName === `TEXTAREA`)
  ) {
    let e = t
    if (e.placeholder) {
      r.push({
        engine: `internal:attr`,
        selector: `[placeholder=${I(e.placeholder, !0)}]`,
        score: 105,
      })
      for (let t of Z(e.placeholder))
        r.push({
          engine: `internal:attr`,
          selector: `[placeholder=${I(t.text, !1)}]`,
          score: 100 - t.scoreBouns,
        })
    }
  }
  let i = _n(e._evaluator._cacheText, t)
  for (let e of i) {
    let t = e.normalized
    r.push({ engine: `internal:label`, selector: F(t, !0), score: 125 })
    for (let e of Z(t))
      r.push({
        engine: `internal:label`,
        selector: F(e.text, !1),
        score: 120 - e.scoreBouns,
      })
  }
  let a = B(t)
  return (
    a &&
      ![`none`, `presentation`].includes(a) &&
      r.push({ engine: `internal:role`, selector: a, score: 510 }),
    t.getAttribute(`name`) &&
      [
        `BUTTON`,
        `FORM`,
        `FIELDSET`,
        `FRAME`,
        `IFRAME`,
        `INPUT`,
        `KEYGEN`,
        `OBJECT`,
        `OUTPUT`,
        `SELECT`,
        `TEXTAREA`,
        `MAP`,
        `META`,
        `PARAM`,
      ].includes(t.nodeName) &&
      r.push({
        engine: `css`,
        selector: `${M(t.nodeName.toLowerCase())}[name=${N(t.getAttribute(`name`))}]`,
        score: 520,
      }),
    [`INPUT`, `TEXTAREA`].includes(t.nodeName) &&
      t.getAttribute(`type`) !== `hidden` &&
      t.getAttribute(`type`) &&
      r.push({
        engine: `css`,
        selector: `${M(t.nodeName.toLowerCase())}[type=${N(t.getAttribute(`type`))}]`,
        score: 520,
      }),
    [`INPUT`, `TEXTAREA`, `SELECT`].includes(t.nodeName) &&
      t.getAttribute(`type`) !== `hidden` &&
      r.push({
        engine: `css`,
        selector: M(t.nodeName.toLowerCase()),
        score: 521,
      }),
    zn([r]),
    r
  )
}
function In(e, t, n) {
  if (t.nodeName === `SELECT`) return []
  let r = [],
    i = t.getAttribute(`title`)
  if (i) {
    r.push([
      { engine: `internal:attr`, selector: `[title=${I(i, !0)}]`, score: 205 },
    ])
    for (let e of Z(i))
      r.push([
        {
          engine: `internal:attr`,
          selector: `[title=${I(e.text, !1)}]`,
          score: 200 - e.scoreBouns,
        },
      ])
  }
  let a = t.getAttribute(`alt`)
  if (a && [`APPLET`, `AREA`, `IMG`, `INPUT`].includes(t.nodeName)) {
    r.push([
      { engine: `internal:attr`, selector: `[alt=${I(a, !0)}]`, score: 165 },
    ])
    for (let e of Z(a))
      r.push([
        {
          engine: `internal:attr`,
          selector: `[alt=${I(e.text, !1)}]`,
          score: 160 - e.scoreBouns,
        },
      ])
  }
  let o = K(e._evaluator._cacheText, t).normalized
  if (o) {
    let e = Z(o)
    if (n) {
      o.length <= 80 &&
        r.push([{ engine: `internal:text`, selector: F(o, !0), score: 185 }])
      for (let t of e)
        r.push([
          {
            engine: `internal:text`,
            selector: F(t.text, !1),
            score: 180 - t.scoreBouns,
          },
        ])
    }
    let i = { engine: `css`, selector: M(t.nodeName.toLowerCase()), score: 530 }
    for (let t of e)
      r.push([
        i,
        {
          engine: `internal:has-text`,
          selector: F(t.text, !1),
          score: 180 - t.scoreBouns,
        },
      ])
    if (o.length <= 80) {
      let e = RegExp(`^${rt(o)}$`)
      r.push([
        i,
        { engine: `internal:has-text`, selector: F(e, !1), score: 250 },
      ])
    }
  }
  let s = B(t)
  if (s && ![`none`, `presentation`].includes(s)) {
    let e = Nt(t, !1)
    if (e) {
      r.push([
        {
          engine: `internal:role`,
          selector: `${s}[name=${I(e, !0)}]`,
          score: 145,
        },
      ])
      for (let t of Z(e))
        r.push([
          {
            engine: `internal:role`,
            selector: `${s}[name=${I(t.text, !1)}]`,
            score: 140 - t.scoreBouns,
          },
        ])
    }
  }
  return (zn(r), r)
}
function Ln(e) {
  return /^[a-z][\w\-]+$/i.test(e) ? `#${e}` : `[id="${M(e)}"]`
}
function Rn(e, t, n) {
  let r = t.ownerDocument,
    i = []
  function a(n) {
    let a = i.slice()
    n && a.unshift(n)
    let o = a.join(` > `),
      s = e.parseSelector(o)
    return e.querySelector(s, r, !1) === t ? o : void 0
  }
  function o(n) {
    let i = { engine: `css`, selector: n, score: 1e7 },
      a = e.parseSelector(n),
      o = e.querySelectorAll(a, r)
    return o.length === 1
      ? [i]
      : [i, { engine: `nth`, selector: String(o.indexOf(t)), score: jn }]
  }
  for (let e = t; e && e !== r; e = L(e)) {
    let t = e.nodeName.toLowerCase(),
      r = ``
    if (e.id && !n.noCSSId) {
      let t = Ln(e.id),
        n = a(t)
      if (n) return o(n)
      r = t
    }
    let s = e.parentNode,
      c = [...e.classList]
    for (let e = 0; e < c.length; ++e) {
      let t = `.${M(c.slice(0, e + 1).join(`.`))}`,
        n = a(t)
      if (n) return o(n)
      !r && s && s.querySelectorAll(t).length === 1 && (r = t)
    }
    if (s) {
      let n = [...s.children],
        i =
          n.filter((e) => e.nodeName.toLowerCase() === t).indexOf(e) === 0
            ? M(t)
            : `${M(t)}:nth-child(${1 + n.indexOf(e)})`,
        c = a(i)
      if (c) return o(c)
      r ||= i
    } else r ||= M(t)
    i.unshift(r)
  }
  return o(a())
}
function zn(e) {
  for (let t of e)
    for (let e of t)
      e.score > 50 &&
        e.score < 300 &&
        (e.score += Math.min(10, (e.selector.length / 10) | 0))
}
function Bn(e) {
  let t = [],
    n = ``
  for (let { engine: r, selector: i } of e)
    (t.length &&
      (n !== `css` || r !== `css` || i.startsWith(`:nth-match(`)) &&
      t.push(`>>`),
      (n = r),
      r === `css` ? t.push(i) : t.push(`${r}=${i}`))
  return t.join(` `)
}
function X(e) {
  let t = 0
  for (let n = 0; n < e.length; n++) t += e[n].score * (e.length - n)
  return t
}
function Vn(e, t, n, r, i) {
  let a = r.map((e) => ({ tokens: e, score: X(e) }))
  a.sort((e, t) => e.score - t.score)
  let o = null
  for (let { tokens: r } of a) {
    let a = e.parseSelector(Bn(r)),
      s = e.querySelectorAll(a, t)
    if (s[0] === n && s.length === 1) return r
    let c = s.indexOf(n)
    if (!i || o || c === -1 || s.length > 5) continue
    let l = { engine: `nth`, selector: String(c), score: jn }
    o = [...r, l]
  }
  return o
}
function Hn(e) {
  let t,
    n = 0
  for (let r = 0; r < e.length; ++r) {
    let i = e[r],
      a
    if (i !== `-` && i !== `_`) {
      if (
        ((a =
          i >= `a` && i <= `z`
            ? `lower`
            : i >= `A` && i <= `Z`
              ? `upper`
              : i >= `0` && i <= `9`
                ? `digit`
                : `other`),
        a === `lower` && t === `upper`)
      ) {
        t = a
        continue
      }
      ;(t && t !== a && ++n, (t = a))
    }
  }
  return n >= e.length / 4
}
function Un(e, t) {
  if (e.length <= t) return e
  e = e.substring(0, t)
  let n = e.match(/^(.*)\b(.+)$/)
  return n ? n[1].trimEnd() : ``
}
function Z(e) {
  let t = []
  {
    let n = e.match(/^([\d.,]+)[^.,\w]/),
      r = n ? n[1].length : 0
    if (r) {
      let n = Un(e.substring(r).trimStart(), 80)
      t.push({ text: n, scoreBouns: n.length <= 30 ? 2 : 1 })
    }
  }
  {
    let n = e.match(/[^.,\w]([\d.,]+)$/),
      r = n ? n[1].length : 0
    if (r) {
      let n = Un(e.substring(0, e.length - r).trimEnd(), 80)
      t.push({ text: n, scoreBouns: n.length <= 30 ? 2 : 1 })
    }
  }
  return (
    e.length <= 30
      ? t.push({ text: e, scoreBouns: 0 })
      : (t.push({ text: Un(e, 80), scoreBouns: 0 }),
        t.push({ text: Un(e, 30), scoreBouns: 1 })),
    (t = t.filter((e) => e.text)),
    t.length || t.push({ text: e.substring(0, 80), scoreBouns: 0 }),
    t
  )
}
function Wn(e, t, n) {
  let r = e.left - t.right
  if (!(r < 0 || (n !== void 0 && r > n)))
    return r + Math.max(t.bottom - e.bottom, 0) + Math.max(e.top - t.top, 0)
}
function Gn(e, t, n) {
  let r = t.left - e.right
  if (!(r < 0 || (n !== void 0 && r > n)))
    return r + Math.max(t.bottom - e.bottom, 0) + Math.max(e.top - t.top, 0)
}
function Kn(e, t, n) {
  let r = t.top - e.bottom
  if (!(r < 0 || (n !== void 0 && r > n)))
    return r + Math.max(e.left - t.left, 0) + Math.max(t.right - e.right, 0)
}
function qn(e, t, n) {
  let r = e.top - t.bottom
  if (!(r < 0 || (n !== void 0 && r > n)))
    return r + Math.max(e.left - t.left, 0) + Math.max(t.right - e.right, 0)
}
function Jn(e, t, n) {
  let r = n === void 0 ? 50 : n,
    i = 0
  return (
    e.left - t.right >= 0 && (i += e.left - t.right),
    t.left - e.right >= 0 && (i += t.left - e.right),
    t.top - e.bottom >= 0 && (i += t.top - e.bottom),
    e.top - t.bottom >= 0 && (i += e.top - t.bottom),
    i > r ? void 0 : i
  )
}
const Yn = [`left-of`, `right-of`, `above`, `below`, `near`]
function Xn(e, t, n, r) {
  let i = t.getBoundingClientRect(),
    a = { 'left-of': Gn, 'right-of': Wn, above: Kn, below: qn, near: Jn }[e],
    o
  for (let e of n) {
    if (e === t) continue
    let n = a(i, e.getBoundingClientRect(), r)
    n !== void 0 && (o === void 0 || n < o) && (o = n)
  }
  return o
}
var Zn = class {
  constructor(e) {
    ;(v(this, `_engines`, new Map()),
      v(this, `_cacheQueryCSS`, new Map()),
      v(this, `_cacheMatches`, new Map()),
      v(this, `_cacheQuery`, new Map()),
      v(this, `_cacheMatchesSimple`, new Map()),
      v(this, `_cacheMatchesParents`, new Map()),
      v(this, `_cacheCallMatches`, new Map()),
      v(this, `_cacheCallQuery`, new Map()),
      v(this, `_cacheQuerySimple`, new Map()),
      v(this, `_cacheText`, new Map()),
      v(this, `_scoreMap`, void 0),
      v(this, `_retainCacheCounter`, 0))
    for (let [t, n] of e) this._engines.set(t, n)
    ;(this._engines.set(`not`, tr),
      this._engines.set(`is`, Qn),
      this._engines.set(`where`, Qn),
      this._engines.set(`has`, $n),
      this._engines.set(`scope`, er),
      this._engines.set(`light`, nr),
      this._engines.set(`visible`, rr),
      this._engines.set(`text`, ir),
      this._engines.set(`text-is`, ar),
      this._engines.set(`text-matches`, or),
      this._engines.set(`has-text`, sr),
      this._engines.set(`right-of`, cr(`right-of`)),
      this._engines.set(`left-of`, cr(`left-of`)),
      this._engines.set(`above`, cr(`above`)),
      this._engines.set(`below`, cr(`below`)),
      this._engines.set(`near`, cr(`near`)),
      this._engines.set(`nth-match`, lr))
    let t = [...this._engines.keys()]
    t.sort()
    let n = [...Ke]
    if ((n.sort(), t.join(`|`) !== n.join(`|`)))
      throw Error(
        `Please keep customCSSNames in sync with evaluator engines: ${t.join(`|`)} vs ${n.join(`|`)}`
      )
  }
  begin() {
    ++this._retainCacheCounter
  }
  end() {
    ;(--this._retainCacheCounter,
      this._retainCacheCounter ||
        (this._cacheQueryCSS.clear(),
        this._cacheMatches.clear(),
        this._cacheQuery.clear(),
        this._cacheMatchesSimple.clear(),
        this._cacheMatchesParents.clear(),
        this._cacheCallMatches.clear(),
        this._cacheCallQuery.clear(),
        this._cacheQuerySimple.clear(),
        this._cacheText.clear()))
  }
  _cached(e, t, n, r) {
    e.has(t) || e.set(t, [])
    let i = e.get(t),
      a = i.find((e) => n.every((t, n) => e.rest[n] === t))
    if (a) return a.result
    let o = r()
    return (i.push({ rest: n, result: o }), o)
  }
  _checkSelector(e) {
    if (
      !(
        typeof e == `object` &&
        e &&
        (Array.isArray(e) || (`simples` in e && e.simples.length))
      )
    )
      throw Error(`Malformed selector "${e}"`)
    return e
  }
  matches(e, t, n) {
    let r = this._checkSelector(t)
    this.begin()
    try {
      return this._cached(
        this._cacheMatches,
        e,
        [r, n.scope, n.pierceShadow, n.originalScope],
        () =>
          Array.isArray(r)
            ? this._matchesEngine(Qn, e, r, n)
            : (this._hasScopeClause(r) &&
                (n = this._expandContextForScopeMatching(n)),
              this._matchesSimple(
                e,
                r.simples[r.simples.length - 1].selector,
                n
              )
                ? this._matchesParents(e, r, r.simples.length - 2, n)
                : !1)
      )
    } finally {
      this.end()
    }
  }
  query(e, t) {
    let n = this._checkSelector(t)
    this.begin()
    try {
      return this._cached(
        this._cacheQuery,
        n,
        [e.scope, e.pierceShadow, e.originalScope],
        () => {
          if (Array.isArray(n)) return this._queryEngine(Qn, e, n)
          this._hasScopeClause(n) &&
            (e = this._expandContextForScopeMatching(e))
          let t = this._scoreMap
          this._scoreMap = new Map()
          let r = this._querySimple(e, n.simples[n.simples.length - 1].selector)
          return (
            (r = r.filter((t) =>
              this._matchesParents(t, n, n.simples.length - 2, e)
            )),
            this._scoreMap.size &&
              r.sort((e, t) => {
                let n = this._scoreMap.get(e),
                  r = this._scoreMap.get(t)
                return n === r
                  ? 0
                  : n === void 0
                    ? 1
                    : r === void 0
                      ? -1
                      : n - r
              }),
            (this._scoreMap = t),
            r
          )
        }
      )
    } finally {
      this.end()
    }
  }
  _markScore(e, t) {
    this._scoreMap && this._scoreMap.set(e, t)
  }
  _hasScopeClause(e) {
    return e.simples.some((e) =>
      e.selector.functions.some((e) => e.name === `scope`)
    )
  }
  _expandContextForScopeMatching(e) {
    if (e.scope.nodeType !== 1) return e
    let t = L(e.scope)
    return t ? { ...e, scope: t, originalScope: e.originalScope || e.scope } : e
  }
  _matchesSimple(e, t, n) {
    return this._cached(
      this._cacheMatchesSimple,
      e,
      [t, n.scope, n.pierceShadow, n.originalScope],
      () => {
        if (e === n.scope || (t.css && !this._matchesCSS(e, t.css))) return !1
        for (let r of t.functions)
          if (!this._matchesEngine(this._getEngine(r.name), e, r.args, n))
            return !1
        return !0
      }
    )
  }
  _querySimple(e, t) {
    return t.functions.length
      ? this._cached(
          this._cacheQuerySimple,
          t,
          [e.scope, e.pierceShadow, e.originalScope],
          () => {
            let n = t.css,
              r = t.functions
            n === `*` && r.length && (n = void 0)
            let i,
              a = -1
            n === void 0
              ? ((a = r.findIndex(
                  (e) => this._getEngine(e.name).query !== void 0
                )),
                a === -1 && (a = 0),
                (i = this._queryEngine(
                  this._getEngine(r[a].name),
                  e,
                  r[a].args
                )))
              : (i = this._queryCSS(e, n))
            for (let t = 0; t < r.length; t++) {
              if (t === a) continue
              let n = this._getEngine(r[t].name)
              n.matches !== void 0 &&
                (i = i.filter((i) => this._matchesEngine(n, i, r[t].args, e)))
            }
            for (let t = 0; t < r.length; t++) {
              if (t === a) continue
              let n = this._getEngine(r[t].name)
              n.matches === void 0 &&
                (i = i.filter((i) => this._matchesEngine(n, i, r[t].args, e)))
            }
            return i
          }
        )
      : this._queryCSS(e, t.css || `*`)
  }
  _matchesParents(e, t, n, r) {
    return (
      n < 0 ||
      this._cached(
        this._cacheMatchesParents,
        e,
        [t, n, r.scope, r.pierceShadow, r.originalScope],
        () => {
          let { selector: i, combinator: a } = t.simples[n]
          if (a === `>`) {
            let a = ur(e, r)
            return !a || !this._matchesSimple(a, i, r)
              ? !1
              : this._matchesParents(a, t, n - 1, r)
          }
          if (a === `+`) {
            let a = dr(e, r)
            return !a || !this._matchesSimple(a, i, r)
              ? !1
              : this._matchesParents(a, t, n - 1, r)
          }
          if (a === ``) {
            let a = ur(e, r)
            for (; a; ) {
              if (this._matchesSimple(a, i, r)) {
                if (this._matchesParents(a, t, n - 1, r)) return !0
                if (t.simples[n - 1].combinator === ``) break
              }
              a = ur(a, r)
            }
            return !1
          }
          if (a === `~`) {
            let a = dr(e, r)
            for (; a; ) {
              if (this._matchesSimple(a, i, r)) {
                if (this._matchesParents(a, t, n - 1, r)) return !0
                if (t.simples[n - 1].combinator === `~`) break
              }
              a = dr(a, r)
            }
            return !1
          }
          if (a === `>=`) {
            let a = e
            for (; a; ) {
              if (this._matchesSimple(a, i, r)) {
                if (this._matchesParents(a, t, n - 1, r)) return !0
                if (t.simples[n - 1].combinator === ``) break
              }
              a = ur(a, r)
            }
            return !1
          }
          throw Error(`Unsupported combinator "${a}"`)
        }
      )
    )
  }
  _matchesEngine(e, t, n, r) {
    if (e.matches) return this._callMatches(e, t, n, r)
    if (e.query) return this._callQuery(e, n, r).includes(t)
    throw Error(`Selector engine should implement "matches" or "query"`)
  }
  _queryEngine(e, t, n) {
    if (e.query) return this._callQuery(e, n, t)
    if (e.matches)
      return this._queryCSS(t, `*`).filter((r) => this._callMatches(e, r, n, t))
    throw Error(`Selector engine should implement "matches" or "query"`)
  }
  _callMatches(e, t, n, r) {
    return this._cached(
      this._cacheCallMatches,
      t,
      [e, r.scope, r.pierceShadow, r.originalScope, ...n],
      () => e.matches(t, n, r, this)
    )
  }
  _callQuery(e, t, n) {
    return this._cached(
      this._cacheCallQuery,
      e,
      [n.scope, n.pierceShadow, n.originalScope, ...t],
      () => e.query(n, t, this)
    )
  }
  _matchesCSS(e, t) {
    return e.matches(t)
  }
  _queryCSS(e, t) {
    return this._cached(
      this._cacheQueryCSS,
      t,
      [e.scope, e.pierceShadow, e.originalScope],
      () => {
        let n = []
        function r(i) {
          if (((n = n.concat([...i.querySelectorAll(t)])), e.pierceShadow)) {
            i.shadowRoot && r(i.shadowRoot)
            for (let e of i.querySelectorAll(`*`))
              e.shadowRoot && r(e.shadowRoot)
          }
        }
        return (r(e.scope), n)
      }
    )
  }
  _getEngine(e) {
    let t = this._engines.get(e)
    if (!t) throw Error(`Unknown selector engine "${e}"`)
    return t
  }
}
const Qn = {
  matches(e, t, n, r) {
    if (t.length === 0)
      throw Error(`"is" engine expects non-empty selector list`)
    return t.some((t) => r.matches(e, t, n))
  },
  query(e, t, n) {
    if (t.length === 0)
      throw Error(`"is" engine expects non-empty selector list`)
    let r = []
    for (let i of t) r = r.concat(n.query(e, i))
    return t.length === 1 ? r : fr(r)
  },
}
const $n = {
  matches(e, t, n, r) {
    if (t.length === 0)
      throw Error(`"has" engine expects non-empty selector list`)
    return r.query({ ...n, scope: e }, t).length > 0
  },
}
const er = {
  matches(e, t, n, r) {
    if (t.length !== 0) throw Error(`"scope" engine expects no arguments`)
    let i = n.originalScope || n.scope
    return i.nodeType === 9 ? e === i.documentElement : e === i
  },
  query(e, t, n) {
    if (t.length !== 0) throw Error(`"scope" engine expects no arguments`)
    let r = e.originalScope || e.scope
    if (r.nodeType === 9) {
      let e = r.documentElement
      return e ? [e] : []
    }
    return r.nodeType === 1 ? [r] : []
  },
}
const tr = {
  matches(e, t, n, r) {
    if (t.length === 0)
      throw Error(`"not" engine expects non-empty selector list`)
    return !r.matches(e, t, n)
  },
}
const nr = {
  query(e, t, n) {
    return n.query({ ...e, pierceShadow: !1 }, t)
  },
  matches(e, t, n, r) {
    return r.matches(e, t, { ...n, pierceShadow: !1 })
  },
}
const rr = {
  matches(e, t, n, r) {
    if (t.length) throw Error(`"visible" engine expects no arguments`)
    return ct(e)
  },
}
const ir = {
  matches(e, t, n, r) {
    if (t.length !== 1 || typeof t[0] != `string`)
      throw Error(`"text" engine expects a single string`)
    let i = P(t[0]).toLowerCase()
    return (
      gn(r._cacheText, e, (e) => e.normalized.toLowerCase().includes(i)) ===
      `self`
    )
  },
}
const ar = {
  matches(e, t, n, r) {
    if (t.length !== 1 || typeof t[0] != `string`)
      throw Error(`"text-is" engine expects a single string`)
    let i = P(t[0])
    return (
      gn(
        r._cacheText,
        e,
        (e) =>
          (!i && !e.immediate.length) || e.immediate.some((e) => P(e) === i)
      ) !== `none`
    )
  },
}
const or = {
  matches(e, t, n, r) {
    if (
      t.length === 0 ||
      typeof t[0] != `string` ||
      t.length > 2 ||
      (t.length === 2 && typeof t[1] != `string`)
    )
      throw Error(
        `"text-matches" engine expects a regexp body and optional regexp flags`
      )
    let i = new RegExp(t[0], t.length === 2 ? t[1] : void 0)
    return gn(r._cacheText, e, (e) => i.test(e.full)) === `self`
  },
}
const sr = {
  matches(e, t, n, r) {
    if (t.length !== 1 || typeof t[0] != `string`)
      throw Error(`"has-text" engine expects a single string`)
    if (hn(e)) return !1
    let i = P(t[0]).toLowerCase()
    return ((e) => e.normalized.toLowerCase().includes(i))(K(r._cacheText, e))
  },
}
function cr(e) {
  return {
    matches(t, n, r, i) {
      let a =
          n.length && typeof n[n.length - 1] == `number`
            ? n[n.length - 1]
            : void 0,
        o = a === void 0 ? n : n.slice(0, n.length - 1)
      if (n.length < 1 + (a === void 0 ? 0 : 1))
        throw Error(
          `"${e}" engine expects a selector list and optional maximum distance in pixels`
        )
      let s = Xn(e, t, i.query(r, o), a)
      return s !== void 0 && (i._markScore(t, s), !0)
    },
  }
}
const lr = {
  query(e, t, n) {
    let r = t[t.length - 1]
    if (t.length < 2)
      throw Error(
        `"nth-match" engine expects non-empty selector list and an index argument`
      )
    if (typeof r != `number` || r < 1)
      throw Error(
        `"nth-match" engine expects a one-based index as the last argument`
      )
    let i = Qn.query(e, t.slice(0, t.length - 1), n)
    return (r--, r < i.length ? [i[r]] : [])
  },
}
function ur(e, t) {
  if (e !== t.scope) return t.pierceShadow ? L(e) : e.parentElement || void 0
}
function dr(e, t) {
  if (e !== t.scope) return e.previousElementSibling || void 0
}
function fr(e) {
  let t = new Map(),
    n = [],
    r = []
  function i(e) {
    let r = t.get(e)
    if (r) return r
    let a = L(e)
    return (
      a ? i(a).children.push(e) : n.push(e),
      (r = { children: [], taken: !1 }),
      t.set(e, r),
      r
    )
  }
  for (let t of e) i(t).taken = !0
  function a(e) {
    let n = t.get(e)
    if ((n.taken && r.push(e), n.children.length > 1)) {
      let t = new Set(n.children)
      n.children = []
      let r = e.firstElementChild
      for (; r && n.children.length < t.size; )
        (t.has(r) && n.children.push(r), (r = r.nextElementSibling))
      for (
        r = e.shadowRoot ? e.shadowRoot.firstElementChild : null;
        r && n.children.length < t.size;

      )
        (t.has(r) && n.children.push(r), (r = r.nextElementSibling))
    }
    n.children.forEach(a)
  }
  return (n.forEach(a), r)
}
function pr(e, t, n) {
  return `internal:attr=[${e}=${I(t, n?.exact ?? Q.options.exact)}]`
}
function mr(e, t) {
  return `internal:testid=[${e}=${I(t, !0)}]`
}
function hr(e, t) {
  return `internal:label=${F(e, t?.exact ?? Q.options.exact)}`
}
function gr(e, t) {
  return pr(`alt`, e, t)
}
function _r(e, t) {
  return pr(`title`, e, t)
}
function vr(e, t) {
  return pr(`placeholder`, e, t)
}
function yr(e, t) {
  return `internal:text=${F(e, t?.exact ?? Q.options.exact)}`
}
function br(e, t = {}) {
  let n = []
  return (
    t.checked !== void 0 && n.push([`checked`, String(t.checked)]),
    t.disabled !== void 0 && n.push([`disabled`, String(t.disabled)]),
    t.selected !== void 0 && n.push([`selected`, String(t.selected)]),
    t.expanded !== void 0 && n.push([`expanded`, String(t.expanded)]),
    t.includeHidden !== void 0 &&
      n.push([`include-hidden`, String(t.includeHidden)]),
    t.level !== void 0 && n.push([`level`, String(t.level)]),
    t.name !== void 0 &&
      n.push([`name`, I(t.name, t.exact ?? Q.options.exact)]),
    t.pressed !== void 0 && n.push([`pressed`, String(t.pressed)]),
    `internal:role=${e}${n.map(([e, t]) => `[${e}=${t}]`).join(``)}`
  )
}
var Q = class e {
  static create(t) {
    return (Object.assign(e.options, t), (e.singleton ||= new e()))
  }
  constructor() {
    ;(v(this, `_engines`, void 0),
      v(this, `_evaluator`, void 0),
      (this._evaluator = new Zn(new Map())),
      (this._engines = new Map()),
      this._engines.set(`xpath`, Er),
      this._engines.set(`xpath:light`, Er),
      this._engines.set(`role`, Sn(!1)),
      this._engines.set(`text`, this._createTextEngine(!0, !1)),
      this._engines.set(`text:light`, this._createTextEngine(!1, !1)),
      this._engines.set(`id`, this._createAttributeEngine(`id`, !0)),
      this._engines.set(`id:light`, this._createAttributeEngine(`id`, !1)),
      this._engines.set(
        `data-testid`,
        this._createAttributeEngine(`data-testid`, !0)
      ),
      this._engines.set(
        `data-testid:light`,
        this._createAttributeEngine(`data-testid`, !1)
      ),
      this._engines.set(
        `data-test-id`,
        this._createAttributeEngine(`data-test-id`, !0)
      ),
      this._engines.set(
        `data-test-id:light`,
        this._createAttributeEngine(`data-test-id`, !1)
      ),
      this._engines.set(
        `data-test`,
        this._createAttributeEngine(`data-test`, !0)
      ),
      this._engines.set(
        `data-test:light`,
        this._createAttributeEngine(`data-test`, !1)
      ),
      this._engines.set(`css`, this._createCSSEngine()),
      this._engines.set(`nth`, { queryAll: () => [] }),
      this._engines.set(`visible`, this._createVisibleEngine()),
      this._engines.set(`internal:control`, this._createControlEngine()),
      this._engines.set(`internal:has`, this._createHasEngine()),
      this._engines.set(`internal:has-not`, this._createHasNotEngine()),
      this._engines.set(`internal:and`, { queryAll: () => [] }),
      this._engines.set(`internal:or`, { queryAll: () => [] }),
      this._engines.set(`internal:chain`, this._createInternalChainEngine()),
      this._engines.set(`internal:label`, this._createInternalLabelEngine()),
      this._engines.set(`internal:text`, this._createTextEngine(!0, !0)),
      this._engines.set(
        `internal:has-text`,
        this._createInternalHasTextEngine()
      ),
      this._engines.set(
        `internal:has-not-text`,
        this._createInternalHasNotTextEngine()
      ),
      this._engines.set(`internal:attr`, this._createNamedAttributeEngine()),
      this._engines.set(`internal:testid`, this._createNamedAttributeEngine()),
      this._engines.set(`internal:role`, Sn(!0)))
  }
  queryLocatorSelector(e, t = document.documentElement, n = !0) {
    return this.querySelector(this.parseSelector(e), t, n)
  }
  queryLocatorSelectorAll(e, t = document.documentElement) {
    return this.querySelectorAll(this.parseSelector(e), t)
  }
  querySelector(e, t, n = !0) {
    let r = this.querySelectorAll(e, t)
    if (n && r.length > 1) throw this.strictModeViolationError(e, r)
    return r[0] || null
  }
  queryAllByRole(e, t, n = document.documentElement) {
    let r = this.parseSelector(br(e, t))
    return this.querySelectorAll(r, n)
  }
  queryAllByLabelText(e, t, n = document.documentElement) {
    let r = this.parseSelector(hr(e, t))
    return this.querySelectorAll(r, n)
  }
  queryAllByTestId(t, n = document.documentElement) {
    let r = this.parseSelector(mr(e.options.testIdAttribute, t))
    return this.querySelectorAll(r, n)
  }
  queryAllByText(e, t, n = document.documentElement) {
    let r = this.parseSelector(yr(e, t))
    return this.querySelectorAll(r, n)
  }
  queryAllByTitle(e, t, n = document.documentElement) {
    let r = this.parseSelector(_r(e, t))
    return this.querySelectorAll(r, n)
  }
  queryAllByPlaceholder(e, t, n = document.documentElement) {
    let r = this.parseSelector(vr(e, t))
    return this.querySelectorAll(r, n)
  }
  queryAllByAltText(e, t, n = document.documentElement) {
    let r = this.parseSelector(gr(e, t))
    return this.querySelectorAll(r, n)
  }
  queryByRole(e, t, n = document.documentElement) {
    let r = this.parseSelector(br(e, t))
    return this.querySelector(r, n, !1)
  }
  queryByLabelText(e, t, n = document.documentElement) {
    let r = this.parseSelector(hr(e, t))
    return this.querySelector(r, n, !1)
  }
  queryByTestId(t, n = document.documentElement) {
    let r = this.parseSelector(mr(e.options.testIdAttribute, t))
    return this.querySelector(r, n, !1)
  }
  queryByText(e, t, n = document.documentElement) {
    let r = this.parseSelector(yr(e, t))
    return this.querySelector(r, n, !1)
  }
  queryByTitle(e, t, n = document.documentElement) {
    let r = this.parseSelector(_r(e, t))
    return this.querySelector(r, n, !1)
  }
  queryByPlaceholder(e, t, n = document.documentElement) {
    let r = this.parseSelector(vr(e, t))
    return this.querySelector(r, n, !1)
  }
  queryByAltText(e, t, n = document.documentElement) {
    let r = this.parseSelector(gr(e, t))
    return this.querySelector(r, n, !1)
  }
  strictModeViolationError(e, t) {
    let n = t.slice(0, 10).map((e) => ({
        preview: this.previewNode(e),
        selector: this.generateSelectorSimple(e),
      })),
      r = n.map(
        (e, t) =>
          `\n    ${t + 1}) ${e.preview} aka ${Cn(`javascript`, e.selector)}`
      )
    return (
      n.length < t.length &&
        r.push(`
    ...`),
      this.createStacklessError(
        `strict mode violation: ${Cn(`javascript`, A(e))} resolved to ${t.length} elements:${r.join(``)}\n`
      )
    )
  }
  generateSelectorSimple(t, n) {
    return Mn(this, t, { ...n, testIdAttributeName: e.options.testIdAttribute })
  }
  parseSelector(e) {
    let t = qe(e)
    return (
      Ye(t, (t) => {
        if (!this._engines.has(t.name))
          throw this.createStacklessError(
            `Unknown engine "${t.name}" while parsing selector ${e}`
          )
      }),
      t
    )
  }
  previewNode(e) {
    if (e.nodeType === Node.TEXT_NODE) return xr(`#text=${e.nodeValue || ``}`)
    if (e.nodeType !== Node.ELEMENT_NODE)
      return xr(`<${e.nodeName.toLowerCase()} />`)
    let t = e,
      n = []
    for (let e = 0; e < t.attributes.length; e++) {
      let { name: r, value: i } = t.attributes[e]
      r !== `style` &&
        (!i && Sr.has(r) ? n.push(` ${r}`) : n.push(` ${r}="${i}"`))
    }
    n.sort((e, t) => e.length - t.length)
    let r = nt(n.join(``), 500)
    if (Cr.has(t.nodeName)) return xr(`<${t.nodeName.toLowerCase()}${r}/>`)
    let i = t.childNodes,
      a = !1
    if (i.length <= 5) {
      a = !0
      for (let e = 0; e < i.length; e++) a &&= i[e].nodeType === Node.TEXT_NODE
    }
    let o = a ? t.textContent || `` : i.length ? `…` : ``
    return xr(
      `<${t.nodeName.toLowerCase()}${r}>${nt(o, 50)}</${t.nodeName.toLowerCase()}>`
    )
  }
  querySelectorAll(e, t) {
    if (e.capture !== void 0) {
      if (e.parts.some((e) => e.name === `nth`))
        throw this.createStacklessError(
          `Can't query n-th element in a request with the capture.`
        )
      let n = { parts: e.parts.slice(0, e.capture + 1) }
      if (e.capture < e.parts.length - 1) {
        let t = { parts: e.parts.slice(e.capture + 1) },
          r = { name: `internal:has`, body: { parsed: t }, source: A(t) }
        n.parts.push(r)
      }
      return this.querySelectorAll(n, t)
    }
    if (!t.querySelectorAll)
      throw this.createStacklessError(`Node is not queryable.`)
    if (e.capture !== void 0)
      throw this.createStacklessError(
        `Internal error: there should not be a capture in the selector.`
      )
    if (
      t.nodeType === 11 &&
      e.parts.length === 1 &&
      e.parts[0].name === `css` &&
      e.parts[0].source === `:scope`
    )
      return [t]
    this._evaluator.begin()
    try {
      let n = new Set([t])
      for (let r of e.parts)
        if (r.name === `nth`) n = this._queryNth(n, r)
        else if (r.name === `internal:and`) {
          let e = this.querySelectorAll(r.body.parsed, t)
          n = new Set(e.filter((e) => n.has(e)))
        } else if (r.name === `internal:or`) {
          let e = this.querySelectorAll(r.body.parsed, t)
          n = new Set(fr(new Set([...n, ...e])))
        } else if (Yn.includes(r.name)) n = this._queryLayoutSelector(n, r, t)
        else {
          let e = new Set()
          for (let t of n) {
            let n = this._queryEngineAll(r, t)
            for (let t of n) e.add(t)
          }
          n = e
        }
      return [...n]
    } finally {
      this._evaluator.end()
    }
  }
  _queryEngineAll(e, t) {
    let n = this._engines.get(e.name).queryAll(t, e.body)
    for (let e of n)
      if (!(`nodeName` in e))
        throw this.createStacklessError(
          `Expected a Node but got ${Object.prototype.toString.call(e)}`
        )
    return n
  }
  _queryNth(e, t) {
    let n = [...e],
      r = +t.body
    return (r === -1 && (r = n.length - 1), new Set(n.slice(r, r + 1)))
  }
  _queryLayoutSelector(e, t, n) {
    let r = t.name,
      i = t.body,
      a = [],
      o = this.querySelectorAll(i.parsed, n)
    for (let t of e) {
      let e = Xn(r, t, o, i.distance)
      e !== void 0 && a.push({ element: t, score: e })
    }
    return (
      a.sort((e, t) => e.score - t.score),
      new Set(a.map((e) => e.element))
    )
  }
  createStacklessError(t) {
    if (e.options.browser === `firefox`) {
      let e = Error(`Error: ${t}`)
      return ((e.stack = ``), e)
    }
    let n = Error(t)
    return (delete n.stack, n)
  }
  _createTextEngine(e, t) {
    return {
      queryAll: (n, r) => {
        let { matcher: i, kind: a } = Tr(r, t),
          o = [],
          s = null,
          c = (e) => {
            if (a === `lax` && s && s.contains(e)) return !1
            let n = gn(this._evaluator._cacheText, e, i)
            ;(n === `none` && (s = e),
              (n === `self` ||
                (n === `selfAndChildren` && a === `strict` && !t)) &&
                o.push(e))
          }
        n.nodeType === Node.ELEMENT_NODE && c(n)
        let l = this._evaluator._queryCSS({ scope: n, pierceShadow: e }, `*`)
        for (let e of l) c(e)
        return o
      },
    }
  }
  _createAttributeEngine(e, t) {
    let n = (t) => [
      {
        simples: [
          {
            selector: { css: `[${e}=${JSON.stringify(t)}]`, functions: [] },
            combinator: ``,
          },
        ],
      },
    ]
    return {
      queryAll: (e, r) =>
        this._evaluator.query({ scope: e, pierceShadow: t }, n(r)),
    }
  }
  _createCSSEngine() {
    return {
      queryAll: (e, t) =>
        this._evaluator.query({ scope: e, pierceShadow: !0 }, t),
    }
  }
  _createNamedAttributeEngine() {
    return {
      queryAll: (e, t) => {
        let n = j(t)
        if (n.name || n.attributes.length !== 1)
          throw Error(`Malformed attribute selector: ${t}`)
        let { name: r, value: i, caseSensitive: a } = n.attributes[0],
          o = a ? null : i.toLowerCase(),
          s
        return (
          (s =
            i instanceof RegExp
              ? (e) => !!e.match(i)
              : a
                ? (e) => e === i
                : (e) => e.toLowerCase().includes(o)),
          this._evaluator
            ._queryCSS({ scope: e, pierceShadow: !0 }, `[${r}]`)
            .filter((e) => s(e.getAttribute(r)))
        )
      },
    }
  }
  _createVisibleEngine() {
    return {
      queryAll: (e, t) => (e.nodeType === 1 && ct(e) === !!t ? [e] : []),
    }
  }
  _createControlEngine() {
    return {
      queryAll: (e, t) => {
        if (t === `enter-frame` && e instanceof HTMLIFrameElement) {
          let t = e.contentDocument?.documentElement
          return t ? [t] : []
        }
        return []
      },
    }
  }
  _createHasEngine() {
    return {
      queryAll: (e, t) =>
        e.nodeType === 1 && this.querySelector(t.parsed, e, !1) ? [e] : [],
    }
  }
  _createHasNotEngine() {
    return {
      queryAll: (e, t) =>
        e.nodeType === 1
          ? this.querySelector(t.parsed, e, !1)
            ? []
            : [e]
          : [],
    }
  }
  _createInternalChainEngine() {
    return { queryAll: (e, t) => this.querySelectorAll(t.parsed, e) }
  }
  _createInternalLabelEngine() {
    return {
      queryAll: (e, t) => {
        let { matcher: n } = Tr(t, !0)
        return this._evaluator
          ._queryCSS({ scope: e, pierceShadow: !0 }, `*`)
          .filter((e) => _n(this._evaluator._cacheText, e).some((e) => n(e)))
      },
    }
  }
  _createInternalHasTextEngine() {
    return {
      queryAll: (e, t) => {
        if (e.nodeType !== 1) return []
        let n = e,
          r = K(this._evaluator._cacheText, n),
          { matcher: i } = Tr(t, !0)
        return i(r) ? [n] : []
      },
    }
  }
  _createInternalHasNotTextEngine() {
    return {
      queryAll: (e, t) => {
        if (e.nodeType !== 1) return []
        let n = e,
          r = K(this._evaluator._cacheText, n),
          { matcher: i } = Tr(t, !0)
        return i(r) ? [] : [n]
      },
    }
  }
}
v(Q, `options`, {
  testIdAttribute: `data-testid`,
  browser: `chromium`,
  exact: !1,
})
v(Q, `singleton`, null)
function xr(e) {
  return e.replace(/\n/g, `↵`).replace(/\t/g, `⇆`)
}
const Sr = new Set([`checked`, `selected`, `disabled`, `readonly`, `multiple`])
const Cr = new Set([
  `AREA`,
  `BASE`,
  `BR`,
  `COL`,
  `COMMAND`,
  `EMBED`,
  `HR`,
  `IMG`,
  `INPUT`,
  `KEYGEN`,
  `LINK`,
  `MENUITEM`,
  `META`,
  `PARAM`,
  `SOURCE`,
  `TRACK`,
  `WBR`,
])
function wr(e) {
  if (((e = e.substring(1, e.length - 1)), !e.includes(`\\`))) return e
  let t = [],
    n = 0
  for (; n < e.length; )
    (e[n] === `\\` && n + 1 < e.length && n++, t.push(e[n++]))
  return t.join(``)
}
function Tr(e, t) {
  if (e[0] === `/` && e.lastIndexOf(`/`) > 0) {
    let t = e.lastIndexOf(`/`),
      n = new RegExp(e.substring(1, t), e.substring(t + 1))
    return { matcher: (e) => n.test(e.full), kind: `regex` }
  }
  let n = t ? JSON.parse.bind(JSON) : wr,
    r = !1
  return (
    e.length > 1 && e[0] === `"` && e[e.length - 1] === `"`
      ? ((e = n(e)), (r = !0))
      : t &&
          e.length > 1 &&
          e[0] === `"` &&
          e[e.length - 2] === `"` &&
          e[e.length - 1] === `i`
        ? ((e = n(e.substring(0, e.length - 1))), (r = !1))
        : t &&
            e.length > 1 &&
            e[0] === `"` &&
            e[e.length - 2] === `"` &&
            e[e.length - 1] === `s`
          ? ((e = n(e.substring(0, e.length - 1))), (r = !0))
          : e.length > 1 &&
            e[0] === `'` &&
            e[e.length - 1] === `'` &&
            ((e = n(e)), (r = !0)),
    (e = P(e)),
    r
      ? t
        ? { kind: `strict`, matcher: (t) => t.normalized === e }
        : {
            matcher: (t) =>
              (!e && !t.immediate.length) ||
              t.immediate.some((t) => P(t) === e),
            kind: `strict`,
          }
      : ((e = e.toLowerCase()),
        { kind: `lax`, matcher: (t) => t.normalized.toLowerCase().includes(e) })
  )
}
const Er = {
  queryAll(e, t) {
    t.startsWith(`/`) && e.nodeType !== Node.DOCUMENT_NODE && (t = `.${t}`)
    let n = [],
      r = e.ownerDocument || e
    if (!r) return n
    let i = r.evaluate(t, e, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE)
    for (let e = i.iterateNext(); e; e = i.iterateNext())
      e.nodeType === Node.ELEMENT_NODE && n.push(e)
    return n
  },
}
function Mr(e) {
  return e
    .split(``)
    .map((e) => {
      let t = e.charCodeAt(0)
      return e === ` ` ||
        e === `#` ||
        e === `.` ||
        e === `:` ||
        e === `[` ||
        e === `]` ||
        e === `>` ||
        e === `+` ||
        e === `~` ||
        e === `\\`
        ? `\\${e}`
        : t >= 65536
          ? `\\${t.toString(16).toUpperCase().padStart(6, `0`)} `
          : t < 32 || t === 127 || t >= 128
            ? `\\${t.toString(16).toUpperCase().padStart(2, `0`)} `
            : e
    })
    .join(``)
}
function Nr(e) {
  let t = [],
    n,
    r = !1
  for (; (n = Pr(e)); ) {
    n.shadowRoot && (r = !0)
    let i = e.tagName
    if (e.id) t.push(`#${Mr(e.id)}`)
    else if (!e.nextElementSibling && !e.previousElementSibling)
      t.push(i.toLowerCase())
    else {
      let r = 0,
        a = 0,
        o = 0
      for (let t of n.children)
        (r++, t.tagName === i && a++, t === e && (o = r))
      a > 1
        ? t.push(`${i.toLowerCase()}:nth-child(${o})`)
        : t.push(i.toLowerCase())
    }
    e = n
  }
  return `${s().provider === `webdriverio` && r ? `>>>` : ``}${t.reverse().join(` > `)}`
}
function Pr(e) {
  let t = e.parentNode
  return t instanceof ShadowRoot ? t.host : t
}
export {
  Q as SelectorEngine,
  Cn as asLocator,
  br as getByRoleSelector,
  gr as getByAltTextSelector,
  hr as getByLabelSelector,
  vr as getByPlaceholderSelector,
  mr as getByTestIdSelector,
  yr as getByTextSelector,
  _r as getByTitleSelector,
  Nr as convertElementToCssSelector,
  V,
  B,
  P,
  Nt,
  Ht,
  Ut,
  Zt,
  Qt,
  qt,
  Jt,
  Yt,
  Xt,
  Gt,
  Kt,
  Bt,
  Vt,
  R,
  kt,
  fn,
  pn,
}
