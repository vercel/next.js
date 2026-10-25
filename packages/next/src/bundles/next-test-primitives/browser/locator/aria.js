/* eslint-disable no-shadow, no-unused-expressions, no-control-regex -- Preserve the pinned pure upstream implementation. */
// Pure declaration fork from @vitest/browser 5.0.4; MIT license in LICENSE.
// Published dist/locators-BHr21v4S.js and dist/expect-element.js pure DOM closure.
// Controller bindings and side effects are omitted; pure initialization is retained.
import {
  V as a,
  B as o,
  P as s,
  Nt as c,
  Ht as l,
  Ut as u,
  Zt as d,
  Qt as f,
  qt as ee,
  Jt as te,
  Yt as ne,
  Xt as re,
  Gt as ie,
  Kt as ae,
  Bt as oe,
  Vt as se,
  R as ce,
  kt as p,
  fn as h,
  pn as g,
} from './locators.js'
function M(e) {
  return Me(e)
    ? `"` +
        e.replace(/[\\"\x00-\x1f\x7f-\x9f]/g, (e) => {
          switch (e) {
            case `\\`:
              return `\\\\`
            case `"`:
              return `\\"`
            case `\b`:
              return `\\b`
            case `\f`:
              return `\\f`
            case `
`:
              return `\\n`
            case `\r`:
              return `\\r`
            case `	`:
              return `\\t`
            default:
              return `\\x` + e.charCodeAt(0).toString(16).padStart(2, `0`)
          }
        }) +
        `"`
    : e
}
function Me(e) {
  return !!(
    e.length === 0 ||
    /^\s|\s$/.test(e) ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(e) ||
    /^-/.test(e) ||
    /[\n:](\s|$)/.test(e) ||
    /\s#/.test(e) ||
    /[\n\r]/.test(e) ||
    /^[&*\],?!>|@"'#%]/.test(e) ||
    /[{}`]/.test(e) ||
    /^\[/.test(e) ||
    !isNaN(Number(e)) ||
    [`y`, `n`, `yes`, `no`, `true`, `false`, `on`, `off`, `null`].includes(
      e.toLowerCase()
    )
  )
}
const N = { visible: !0, inline: !1 }
function Ne(e) {
  let t = new Set(),
    n = {
      role: `fragment`,
      name: ``,
      children: [],
      props: {},
      box: N,
      receivesPointerEvents: !0,
    },
    r = (n, r, o) => {
      if (t.has(r)) return
      if ((t.add(r), r.nodeType === Node.TEXT_NODE && r.nodeValue)) {
        if (!o) return
        let e = r.nodeValue
        n.role !== `textbox` && e && n.children.push(r.nodeValue || ``)
        return
      }
      if (r.nodeType !== Node.ELEMENT_NODE) return
      let s = r,
        c = !a(s)
      if (!c) return
      let l = []
      if (s.hasAttribute(`aria-owns`)) {
        let t = s.getAttribute(`aria-owns`).split(/\s+/)
        for (let n of t) {
          let t = e.ownerDocument.getElementById(n)
          t && l.push(t)
        }
      }
      let u = Pe(s)
      ;(u && n.children.push(u), i(u || n, s, l, c))
    }
  function i(e, t, n, i) {
    let a =
      (ce(t)?.display || `inline`) !== `inline` || t.nodeName === `BR`
        ? ` `
        : ``
    ;(a && e.children.push(a), e.children.push(p(t, `::before`)))
    let o = t.nodeName === `SLOT` ? t.assignedNodes() : []
    if (o.length) for (let t of o) r(e, t, i)
    else {
      for (let n = t.firstChild; n; n = n.nextSibling)
        n.assignedSlot || r(e, n, i)
      if (t.shadowRoot)
        for (let n = t.shadowRoot.firstChild; n; n = n.nextSibling) r(e, n, i)
    }
    for (let t of n) r(e, t, i)
    if (
      (e.children.push(p(t, `::after`)),
      a && e.children.push(a),
      e.children.length === 1 && e.name === e.children[0] && (e.children = []),
      e.role === `link` && t.hasAttribute(`href`))
    ) {
      let n = t.getAttribute(`href`)
      e.props.url = n
    }
    if (
      e.role === `textbox` &&
      t.hasAttribute(`placeholder`) &&
      t.getAttribute(`placeholder`) !== e.name
    ) {
      let n = t.getAttribute(`placeholder`)
      e.props.placeholder = n
    }
  }
  h()
  try {
    r(n, e, !0)
  } finally {
    g()
  }
  return (Fe(n), n)
}
function Pe(e) {
  let t = o(e) ?? null
  if (!t || t === `presentation` || t === `none`) return null
  let n = {
    role: t,
    name: s(c(e, !1) || ``),
    children: [],
    props: {},
    box: N,
    receivesPointerEvents: !0,
  }
  if (
    (l.includes(t) && (n.checked = u(e)),
    d.includes(t) && (n.disabled = f(e) || void 0),
    ee.includes(t))
  ) {
    let t = te(e)
    n.expanded = t === `none` ? void 0 : t
  }
  return (
    ne.includes(t) && (n.level = re(e)),
    ie.includes(t) && (n.pressed = ae(e)),
    oe.includes(t) && (n.selected = se(e)),
    (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) &&
      e.type !== `checkbox` &&
      e.type !== `radio` &&
      e.type !== `file` &&
      (n.children = [e.value]),
    n
  )
}
function Fe(e) {
  let t = (e, t) => {
      if (!e.length) return
      let n = s(e.join(``))
      ;(n && t.push(n), (e.length = 0))
    },
    n = (e) => {
      let r = [],
        i = []
      for (let a of e.children || [])
        typeof a == `string` ? i.push(a) : (t(i, r), n(a), r.push(a))
      ;(t(i, r),
        (e.children = r.length ? r : []),
        e.children.length === 1 &&
          e.children[0] === e.name &&
          (e.children = []))
    }
  n(e)
}
function P(e, t) {
  let n = ``
  return (
    e.level && (n += ` [level=${e.level}]`),
    e.checked === !0 && (n += ` [checked]`),
    e.checked === `mixed` && (n += ` [checked=mixed]`),
    e.disabled && (n += ` [disabled]`),
    e.expanded === !0 && (n += ` [expanded]`),
    e.expanded,
    e.pressed === !0 && (n += ` [pressed]`),
    e.pressed === `mixed` && (n += ` [pressed=mixed]`),
    e.selected && (n += ` [selected]`),
    n
  )
}
function Ie(e) {
  let t = e.role
  return (
    e.name && e.name.length <= 900 && (t += ` ${JSON.stringify(e.name)}`),
    (t += P(e)),
    t
  )
}
function F(e, t, n) {
  let r = Ie(e),
    i = Object.keys(e.props).length > 0,
    a =
      e.children.length === 1 && typeof e.children[0] == `string` && !i
        ? e.children[0]
        : void 0
  if (!e.children.length && !i) n.push(`${t}- ${r}`)
  else if (a !== void 0) n.push(`${t}- ${r}: ${M(a)}`)
  else {
    n.push(`${t}- ${r}:`)
    for (let [r, i] of Object.entries(e.props)) n.push(`${t}  - /${r}: ${M(i)}`)
    for (let r of e.children)
      typeof r == `string`
        ? r && n.push(`${t}  - text: ${M(r)}`)
        : F(r, `${t}  `, n)
  }
}
function Le(e) {
  let t = [],
    n = e.role === `fragment` ? e.children : [e]
  for (let e of n)
    typeof e == `string` ? e && t.push(`- text: ${M(e)}`) : F(e, ``, t)
  return t.join(`
`)
}
export { Ne as generateAriaTree, Le as renderAriaTree }
