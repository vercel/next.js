/*
  Highlight.js 10.2.0 (da7d149b)
  License: BSD-3-Clause
  Copyright (c) 2006-2020, Ivan Sagalaev
*/
var hljs = (function () {
  'use strict'
  function e(n) {
    Object.freeze(n)
    var t = 'function' == typeof n
    return (
      Object.getOwnPropertyNames(n).forEach(function (r) {
        !Object.hasOwnProperty.call(n, r) ||
          null === n[r] ||
          ('object' != typeof n[r] && 'function' != typeof n[r]) ||
          (t && ('caller' === r || 'callee' === r || 'arguments' === r)) ||
          Object.isFrozen(n[r]) ||
          e(n[r])
      }),
      n
    )
  }
  class n {
    constructor(e) {
      void 0 === e.data && (e.data = {}), (this.data = e.data)
    }
    ignoreMatch() {
      this.ignore = !0
    }
  }
  function t(e) {
    return e
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
  }
  function r(e, ...n) {
    var t = {}
    for (const n in e) t[n] = e[n]
    return (
      n.forEach(function (e) {
        for (const n in e) t[n] = e[n]
      }),
      t
    )
  }
  function a(e) {
    return e.nodeName.toLowerCase()
  }
  var i = Object.freeze({
    __proto__: null,
    escapeHTML: t,
    inherit: r,
    nodeStream: function (e) {
      var n = []
      return (
        (function e(t, r) {
          for (var i = t.firstChild; i; i = i.nextSibling)
            3 === i.nodeType
              ? (r += i.nodeValue.length)
              : 1 === i.nodeType &&
                (n.push({ event: 'start', offset: r, node: i }),
                (r = e(i, r)),
                a(i).match(/br|hr|img|input/) ||
                  n.push({ event: 'stop', offset: r, node: i }))
          return r
        })(e, 0),
        n
      )
    },
    mergeStreams: function (e, n, r) {
      var i = 0,
        s = '',
        o = []
      function l() {
        return e.length && n.length
          ? e[0].offset !== n[0].offset
            ? e[0].offset < n[0].offset
              ? e
              : n
            : 'start' === n[0].event
            ? e
            : n
          : e.length
          ? e
          : n
      }
      function c(e) {
        s +=
          '<' +
          a(e) +
          [].map
            .call(e.attributes, function (e) {
              return ' ' + e.nodeName + '="' + t(e.value) + '"'
            })
            .join('') +
          '>'
      }
      function u(e) {
        s += '</' + a(e) + '>'
      }
      function g(e) {
        ;('start' === e.event ? c : u)(e.node)
      }
      for (; e.length || n.length; ) {
        var d = l()
        if (
          ((s += t(r.substring(i, d[0].offset))), (i = d[0].offset), d === e)
        ) {
          o.reverse().forEach(u)
          do {
            g(d.splice(0, 1)[0]), (d = l())
          } while (d === e && d.length && d[0].offset === i)
          o.reverse().forEach(c)
        } else
          'start' === d[0].event ? o.push(d[0].node) : o.pop(),
            g(d.splice(0, 1)[0])
      }
      return s + t(r.substr(i))
    },
  })
  const s = '</span>',
    o = (e) => !!e.kind
  class l {
    constructor(e, n) {
      ;(this.buffer = ''), (this.classPrefix = n.classPrefix), e.walk(this)
    }
    addText(e) {
      this.buffer += t(e)
    }
    openNode(e) {
      if (!o(e)) return
      let n = e.kind
      e.sublanguage || (n = `${this.classPrefix}${n}`), this.span(n)
    }
    closeNode(e) {
      o(e) && (this.buffer += s)
    }
    value() {
      return this.buffer
    }
    span(e) {
      this.buffer += `<span class="${e}">`
    }
  }
  class c {
    constructor() {
      ;(this.rootNode = { children: [] }), (this.stack = [this.rootNode])
    }
    get top() {
      return this.stack[this.stack.length - 1]
    }
    get root() {
      return this.rootNode
    }
    add(e) {
      this.top.children.push(e)
    }
    openNode(e) {
      const n = { kind: e, children: [] }
      this.add(n), this.stack.push(n)
    }
    closeNode() {
      if (this.stack.length > 1) return this.stack.pop()
    }
    closeAllNodes() {
      for (; this.closeNode(); );
    }
    toJSON() {
      return JSON.stringify(this.rootNode, null, 4)
    }
    walk(e) {
      return this.constructor._walk(e, this.rootNode)
    }
    static _walk(e, n) {
      return (
        'string' == typeof n
          ? e.addText(n)
          : n.children &&
            (e.openNode(n),
            n.children.forEach((n) => this._walk(e, n)),
            e.closeNode(n)),
        e
      )
    }
    static _collapse(e) {
      'string' != typeof e &&
        e.children &&
        (e.children.every((e) => 'string' == typeof e)
          ? (e.children = [e.children.join('')])
          : e.children.forEach((e) => {
              c._collapse(e)
            }))
    }
  }
  class u extends c {
    constructor(e) {
      super(), (this.options = e)
    }
    addKeyword(e, n) {
      '' !== e && (this.openNode(n), this.addText(e), this.closeNode())
    }
    addText(e) {
      '' !== e && this.add(e)
    }
    addSublanguage(e, n) {
      const t = e.root
      ;(t.kind = n), (t.sublanguage = !0), this.add(t)
    }
    toHTML() {
      return new l(this, this.options).value()
    }
    finalize() {
      return !0
    }
  }
  function g(e) {
    return e ? ('string' == typeof e ? e : e.source) : null
  }
  const d =
      '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)',
    h = { begin: '\\\\[\\s\\S]', relevance: 0 },
    f = {
      className: 'string',
      begin: "'",
      end: "'",
      illegal: '\\n',
      contains: [h],
    },
    p = {
      className: 'string',
      begin: '"',
      end: '"',
      illegal: '\\n',
      contains: [h],
    },
    m = {
      begin:
        /\b(a|an|the|are|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|they|like|more)\b/,
    },
    b = function (e, n, t = {}) {
      var a = r({ className: 'comment', begin: e, end: n, contains: [] }, t)
      return (
        a.contains.push(m),
        a.contains.push({
          className: 'doctag',
          begin: '(?:TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):',
          relevance: 0,
        }),
        a
      )
    },
    v = b('//', '$'),
    x = b('/\\*', '\\*/'),
    E = b('#', '$')
  var _ = Object.freeze({
      __proto__: null,
      IDENT_RE: '[a-zA-Z]\\w*',
      UNDERSCORE_IDENT_RE: '[a-zA-Z_]\\w*',
      NUMBER_RE: '\\b\\d+(\\.\\d+)?',
      C_NUMBER_RE: d,
      BINARY_NUMBER_RE: '\\b(0b[01]+)',
      RE_STARTERS_RE:
        '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~',
      SHEBANG: (e = {}) => {
        const n = /^#![ ]*\//
        return (
          e.binary &&
            (e.begin = (function (...e) {
              return e.map((e) => g(e)).join('')
            })(n, /.*\b/, e.binary, /\b.*/)),
          r(
            {
              className: 'meta',
              begin: n,
              end: /$/,
              relevance: 0,
              'on:begin': (e, n) => {
                0 !== e.index && n.ignoreMatch()
              },
            },
            e
          )
        )
      },
      BACKSLASH_ESCAPE: h,
      APOS_STRING_MODE: f,
      QUOTE_STRING_MODE: p,
      PHRASAL_WORDS_MODE: m,
      COMMENT: b,
      C_LINE_COMMENT_MODE: v,
      C_BLOCK_COMMENT_MODE: x,
      HASH_COMMENT_MODE: E,
      NUMBER_MODE: {
        className: 'number',
        begin: '\\b\\d+(\\.\\d+)?',
        relevance: 0,
      },
      C_NUMBER_MODE: { className: 'number', begin: d, relevance: 0 },
      BINARY_NUMBER_MODE: {
        className: 'number',
        begin: '\\b(0b[01]+)',
        relevance: 0,
      },
      CSS_NUMBER_MODE: {
        className: 'number',
        begin:
          '\\b\\d+(\\.\\d+)?(%|em|ex|ch|rem|vw|vh|vmin|vmax|cm|mm|in|pt|pc|px|deg|grad|rad|turn|s|ms|Hz|kHz|dpi|dpcm|dppx)?',
        relevance: 0,
      },
      REGEXP_MODE: {
        begin: /(?=\/[^/\n]*\/)/,
        contains: [
          {
            className: 'regexp',
            begin: /\//,
            end: /\/[gimuy]*/,
            illegal: /\n/,
            contains: [
              h,
              { begin: /\[/, end: /\]/, relevance: 0, contains: [h] },
            ],
          },
        ],
      },
      TITLE_MODE: { className: 'title', begin: '[a-zA-Z]\\w*', relevance: 0 },
      UNDERSCORE_TITLE_MODE: {
        className: 'title',
        begin: '[a-zA-Z_]\\w*',
        relevance: 0,
      },
      METHOD_GUARD: { begin: '\\.\\s*[a-zA-Z_]\\w*', relevance: 0 },
      END_SAME_AS_BEGIN: function (e) {
        return Object.assign(e, {
          'on:begin': (e, n) => {
            n.data._beginMatch = e[1]
          },
          'on:end': (e, n) => {
            n.data._beginMatch !== e[1] && n.ignoreMatch()
          },
        })
      },
    }),
    w = 'of and for in not or if then'.split(' ')
  function N(e, n) {
    return n
      ? +n
      : (function (e) {
          return w.includes(e.toLowerCase())
        })(e)
      ? 0
      : 1
  }
  const y = {
      props: ['language', 'code', 'autodetect'],
      data: function () {
        return { detectedLanguage: '', unknownLanguage: !1 }
      },
      computed: {
        className() {
          return this.unknownLanguage ? '' : 'hljs ' + this.detectedLanguage
        },
        highlighted() {
          if (!this.autoDetect && !hljs.getLanguage(this.language))
            return (
              console.warn(
                `The language "${this.language}" you specified could not be found.`
              ),
              (this.unknownLanguage = !0),
              t(this.code)
            )
          let e
          return (
            this.autoDetect
              ? ((e = hljs.highlightAuto(this.code)),
                (this.detectedLanguage = e.language))
              : ((e = hljs.highlight(
                  this.language,
                  this.code,
                  this.ignoreIllegals
                )),
                (this.detectectLanguage = this.language)),
            e.value
          )
        },
        autoDetect() {
          return !(this.language && ((e = this.autodetect), !e && '' !== e))
          var e
        },
        ignoreIllegals: () => !0,
      },
      render(e) {
        return e('pre', {}, [
          e('code', {
            class: this.className,
            domProps: { innerHTML: this.highlighted },
          }),
        ])
      },
    },
    R = {
      install(e) {
        e.component('highlightjs', y)
      },
    },
    k = t,
    O = r,
    { nodeStream: M, mergeStreams: L } = i,
    T = Symbol('nomatch')
  return (function (t) {
    var a = [],
      i = Object.create(null),
      s = Object.create(null),
      o = [],
      l = !0,
      c = /(^(<[^>]+>|\t|)+|\n)/gm,
      d =
        "Could not find the language '{}', did you forget to load/include a language module?"
    const h = { disableAutodetect: !0, name: 'Plain text', contains: [] }
    var f = {
      noHighlightRe: /^(no-?highlight)$/i,
      languageDetectRe: /\blang(?:uage)?-([\w-]+)\b/i,
      classPrefix: 'hljs-',
      tabReplace: null,
      useBR: !1,
      languages: null,
      __emitter: u,
    }
    function p(e) {
      return f.noHighlightRe.test(e)
    }
    function m(e, n, t, r) {
      var a = { code: n, language: e }
      S('before:highlight', a)
      var i = a.result ? a.result : b(a.language, a.code, t, r)
      return (i.code = a.code), S('after:highlight', i), i
    }
    function b(e, t, a, s) {
      var o = t
      function c(e, n) {
        var t = E.case_insensitive ? n[0].toLowerCase() : n[0]
        return (
          Object.prototype.hasOwnProperty.call(e.keywords, t) && e.keywords[t]
        )
      }
      function u() {
        null != R.subLanguage
          ? (function () {
              if ('' !== L) {
                var e = null
                if ('string' == typeof R.subLanguage) {
                  if (!i[R.subLanguage]) return void M.addText(L)
                  ;(e = b(R.subLanguage, L, !0, O[R.subLanguage])),
                    (O[R.subLanguage] = e.top)
                } else e = v(L, R.subLanguage.length ? R.subLanguage : null)
                R.relevance > 0 && (j += e.relevance),
                  M.addSublanguage(e.emitter, e.language)
              }
            })()
          : (function () {
              if (!R.keywords) return void M.addText(L)
              let e = 0
              R.keywordPatternRe.lastIndex = 0
              let n = R.keywordPatternRe.exec(L),
                t = ''
              for (; n; ) {
                t += L.substring(e, n.index)
                const r = c(R, n)
                if (r) {
                  const [e, a] = r
                  M.addText(t), (t = ''), (j += a), M.addKeyword(n[0], e)
                } else t += n[0]
                ;(e = R.keywordPatternRe.lastIndex),
                  (n = R.keywordPatternRe.exec(L))
              }
              ;(t += L.substr(e)), M.addText(t)
            })(),
          (L = '')
      }
      function h(e) {
        return (
          e.className && M.openNode(e.className),
          (R = Object.create(e, { parent: { value: R } }))
        )
      }
      function p(e) {
        return 0 === R.matcher.regexIndex ? ((L += e[0]), 1) : ((I = !0), 0)
      }
      var m = {}
      function x(t, r) {
        var i = r && r[0]
        if (((L += t), null == i)) return u(), 0
        if (
          'begin' === m.type &&
          'end' === r.type &&
          m.index === r.index &&
          '' === i
        ) {
          if (((L += o.slice(r.index, r.index + 1)), !l)) {
            const n = Error('0 width match regex')
            throw ((n.languageName = e), (n.badRule = m.rule), n)
          }
          return 1
        }
        if (((m = r), 'begin' === r.type))
          return (function (e) {
            var t = e[0],
              r = e.rule
            const a = new n(r),
              i = [r.__beforeBegin, r['on:begin']]
            for (const n of i) if (n && (n(e, a), a.ignore)) return p(t)
            return (
              r &&
                r.endSameAsBegin &&
                (r.endRe = RegExp(
                  t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
                  'm'
                )),
              r.skip
                ? (L += t)
                : (r.excludeBegin && (L += t),
                  u(),
                  r.returnBegin || r.excludeBegin || (L = t)),
              h(r),
              r.returnBegin ? 0 : t.length
            )
          })(r)
        if ('illegal' === r.type && !a) {
          const e = Error(
            'Illegal lexeme "' +
              i +
              '" for mode "' +
              (R.className || '<unnamed>') +
              '"'
          )
          throw ((e.mode = R), e)
        }
        if ('end' === r.type) {
          var s = (function (e) {
            var t = e[0],
              r = o.substr(e.index),
              a = (function e(t, r, a) {
                let i = (function (e, n) {
                  var t = e && e.exec(n)
                  return t && 0 === t.index
                })(t.endRe, a)
                if (i) {
                  if (t['on:end']) {
                    const e = new n(t)
                    t['on:end'](r, e), e.ignore && (i = !1)
                  }
                  if (i) {
                    for (; t.endsParent && t.parent; ) t = t.parent
                    return t
                  }
                }
                if (t.endsWithParent) return e(t.parent, r, a)
              })(R, e, r)
            if (!a) return T
            var i = R
            i.skip
              ? (L += t)
              : (i.returnEnd || i.excludeEnd || (L += t),
                u(),
                i.excludeEnd && (L = t))
            do {
              R.className && M.closeNode(),
                R.skip || R.subLanguage || (j += R.relevance),
                (R = R.parent)
            } while (R !== a.parent)
            return (
              a.starts &&
                (a.endSameAsBegin && (a.starts.endRe = a.endRe), h(a.starts)),
              i.returnEnd ? 0 : t.length
            )
          })(r)
          if (s !== T) return s
        }
        if ('illegal' === r.type && '' === i) return 1
        if (S > 1e5 && S > 3 * r.index)
          throw Error(
            'potential infinite loop, way more iterations than matches'
          )
        return (L += i), i.length
      }
      var E = y(e)
      if (!E)
        throw (
          (console.error(d.replace('{}', e)),
          Error('Unknown language: "' + e + '"'))
        )
      var _ = (function (e) {
          function n(n, t) {
            return RegExp(
              g(n),
              'm' + (e.case_insensitive ? 'i' : '') + (t ? 'g' : '')
            )
          }
          class t {
            constructor() {
              ;(this.matchIndexes = {}),
                (this.regexes = []),
                (this.matchAt = 1),
                (this.position = 0)
            }
            addRule(e, n) {
              ;(n.position = this.position++),
                (this.matchIndexes[this.matchAt] = n),
                this.regexes.push([n, e]),
                (this.matchAt +=
                  (function (e) {
                    return RegExp(e.toString() + '|').exec('').length - 1
                  })(e) + 1)
            }
            compile() {
              0 === this.regexes.length && (this.exec = () => null)
              const e = this.regexes.map((e) => e[1])
              ;(this.matcherRe = n(
                (function (e, n = '|') {
                  for (
                    var t = /\[(?:[^\\\]]|\\.)*\]|\(\??|\\([1-9][0-9]*)|\\./,
                      r = 0,
                      a = '',
                      i = 0;
                    i < e.length;
                    i++
                  ) {
                    var s = (r += 1),
                      o = g(e[i])
                    for (i > 0 && (a += n), a += '('; o.length > 0; ) {
                      var l = t.exec(o)
                      if (null == l) {
                        a += o
                        break
                      }
                      ;(a += o.substring(0, l.index)),
                        (o = o.substring(l.index + l[0].length)),
                        '\\' === l[0][0] && l[1]
                          ? (a += '\\' + (+l[1] + s))
                          : ((a += l[0]), '(' === l[0] && r++)
                    }
                    a += ')'
                  }
                  return a
                })(e),
                !0
              )),
                (this.lastIndex = 0)
            }
            exec(e) {
              this.matcherRe.lastIndex = this.lastIndex
              const n = this.matcherRe.exec(e)
              if (!n) return null
              const t = n.findIndex((e, n) => n > 0 && void 0 !== e),
                r = this.matchIndexes[t]
              return n.splice(0, t), Object.assign(n, r)
            }
          }
          class a {
            constructor() {
              ;(this.rules = []),
                (this.multiRegexes = []),
                (this.count = 0),
                (this.lastIndex = 0),
                (this.regexIndex = 0)
            }
            getMatcher(e) {
              if (this.multiRegexes[e]) return this.multiRegexes[e]
              const n = new t()
              return (
                this.rules.slice(e).forEach(([e, t]) => n.addRule(e, t)),
                n.compile(),
                (this.multiRegexes[e] = n),
                n
              )
            }
            resumingScanAtSamePosition() {
              return 0 != this.regexIndex
            }
            considerAll() {
              this.regexIndex = 0
            }
            addRule(e, n) {
              this.rules.push([e, n]), 'begin' === n.type && this.count++
            }
            exec(e) {
              const n = this.getMatcher(this.regexIndex)
              n.lastIndex = this.lastIndex
              const t = n.exec(e)
              return (
                t &&
                  ((this.regexIndex += t.position + 1),
                  this.regexIndex === this.count && (this.regexIndex = 0)),
                t
              )
            }
          }
          function i(e, n) {
            const t = e.input[e.index - 1],
              r = e.input[e.index + e[0].length]
            ;('.' !== t && '.' !== r) || n.ignoreMatch()
          }
          if (e.contains && e.contains.includes('self'))
            throw Error(
              'ERR: contains `self` is not supported at the top-level of a language.  See documentation.'
            )
          return (function t(s, o) {
            const l = s
            if (s.compiled) return l
            ;(s.compiled = !0),
              (s.__beforeBegin = null),
              (s.keywords = s.keywords || s.beginKeywords)
            let c = null
            if (
              ('object' == typeof s.keywords &&
                ((c = s.keywords.$pattern), delete s.keywords.$pattern),
              s.keywords &&
                (s.keywords = (function (e, n) {
                  var t = {}
                  return (
                    'string' == typeof e
                      ? r('keyword', e)
                      : Object.keys(e).forEach(function (n) {
                          r(n, e[n])
                        }),
                    t
                  )
                  function r(e, r) {
                    n && (r = r.toLowerCase()),
                      r.split(' ').forEach(function (n) {
                        var r = n.split('|')
                        t[r[0]] = [e, N(r[0], r[1])]
                      })
                  }
                })(s.keywords, e.case_insensitive)),
              s.lexemes && c)
            )
              throw Error(
                'ERR: Prefer `keywords.$pattern` to `mode.lexemes`, BOTH are not allowed. (see mode reference) '
              )
            return (
              (l.keywordPatternRe = n(s.lexemes || c || /\w+/, !0)),
              o &&
                (s.beginKeywords &&
                  ((s.begin =
                    '\\b(' +
                    s.beginKeywords.split(' ').join('|') +
                    ')(?=\\b|\\s)'),
                  (s.__beforeBegin = i)),
                s.begin || (s.begin = /\B|\b/),
                (l.beginRe = n(s.begin)),
                s.endSameAsBegin && (s.end = s.begin),
                s.end || s.endsWithParent || (s.end = /\B|\b/),
                s.end && (l.endRe = n(s.end)),
                (l.terminator_end = g(s.end) || ''),
                s.endsWithParent &&
                  o.terminator_end &&
                  (l.terminator_end += (s.end ? '|' : '') + o.terminator_end)),
              s.illegal && (l.illegalRe = n(s.illegal)),
              void 0 === s.relevance && (s.relevance = 1),
              s.contains || (s.contains = []),
              (s.contains = [].concat(
                ...s.contains.map(function (e) {
                  return (function (e) {
                    return (
                      e.variants &&
                        !e.cached_variants &&
                        (e.cached_variants = e.variants.map(function (n) {
                          return r(e, { variants: null }, n)
                        })),
                      e.cached_variants
                        ? e.cached_variants
                        : (function e(n) {
                            return !!n && (n.endsWithParent || e(n.starts))
                          })(e)
                        ? r(e, { starts: e.starts ? r(e.starts) : null })
                        : Object.isFrozen(e)
                        ? r(e)
                        : e
                    )
                  })('self' === e ? s : e)
                })
              )),
              s.contains.forEach(function (e) {
                t(e, l)
              }),
              s.starts && t(s.starts, o),
              (l.matcher = (function (e) {
                const n = new a()
                return (
                  e.contains.forEach((e) =>
                    n.addRule(e.begin, { rule: e, type: 'begin' })
                  ),
                  e.terminator_end &&
                    n.addRule(e.terminator_end, { type: 'end' }),
                  e.illegal && n.addRule(e.illegal, { type: 'illegal' }),
                  n
                )
              })(l)),
              l
            )
          })(e)
        })(E),
        w = '',
        R = s || _,
        O = {},
        M = new f.__emitter(f)
      !(function () {
        for (var e = [], n = R; n !== E; n = n.parent)
          n.className && e.unshift(n.className)
        e.forEach((e) => M.openNode(e))
      })()
      var L = '',
        j = 0,
        A = 0,
        S = 0,
        I = !1
      try {
        for (R.matcher.considerAll(); ; ) {
          S++,
            I ? (I = !1) : ((R.matcher.lastIndex = A), R.matcher.considerAll())
          const e = R.matcher.exec(o)
          if (!e && R.matcher.resumingScanAtSamePosition()) {
            ;(L += o[A]), (A += 1)
            continue
          }
          if (!e) break
          const n = x(o.substring(A, e.index), e)
          A = e.index + n
        }
        return (
          x(o.substr(A)),
          M.closeAllNodes(),
          M.finalize(),
          (w = M.toHTML()),
          {
            relevance: j,
            value: w,
            language: e,
            illegal: !1,
            emitter: M,
            top: R,
          }
        )
      } catch (n) {
        if (n.message && n.message.includes('Illegal'))
          return {
            illegal: !0,
            illegalBy: {
              msg: n.message,
              context: o.slice(A - 100, A + 100),
              mode: n.mode,
            },
            sofar: w,
            relevance: 0,
            value: k(o),
            emitter: M,
          }
        if (l)
          return {
            illegal: !1,
            relevance: 0,
            value: k(o),
            emitter: M,
            language: e,
            top: R,
            errorRaised: n,
          }
        throw n
      }
    }
    function v(e, n) {
      n = n || f.languages || Object.keys(i)
      var t = (function (e) {
          const n = {
            relevance: 0,
            emitter: new f.__emitter(f),
            value: k(e),
            illegal: !1,
            top: h,
          }
          return n.emitter.addText(e), n
        })(e),
        r = t
      return (
        n
          .filter(y)
          .filter(A)
          .forEach(function (n) {
            var a = b(n, e, !1)
            ;(a.language = n),
              a.relevance > r.relevance && (r = a),
              a.relevance > t.relevance && ((r = t), (t = a))
          }),
        r.language && (t.second_best = r),
        t
      )
    }
    function x(e) {
      return f.tabReplace || f.useBR
        ? e.replace(c, (e) =>
            '\n' === e
              ? f.useBR
                ? '<br>'
                : e
              : f.tabReplace
              ? e.replace(/\t/g, f.tabReplace)
              : e
          )
        : e
    }
    function E(e) {
      let n = null
      const t = (function (e) {
        var n = e.className + ' '
        n += e.parentNode ? e.parentNode.className : ''
        const t = f.languageDetectRe.exec(n)
        if (t) {
          var r = y(t[1])
          return (
            r ||
              (console.warn(d.replace('{}', t[1])),
              console.warn(
                'Falling back to no-highlight mode for this block.',
                e
              )),
            r ? t[1] : 'no-highlight'
          )
        }
        return n.split(/\s+/).find((e) => p(e) || y(e))
      })(e)
      if (p(t)) return
      S('before:highlightBlock', { block: e, language: t }),
        f.useBR
          ? ((n = document.createElement('div')).innerHTML = e.innerHTML
              .replace(/\n/g, '')
              .replace(/<br[ /]*>/g, '\n'))
          : (n = e)
      const r = n.textContent,
        a = t ? m(t, r, !0) : v(r),
        i = M(n)
      if (i.length) {
        const e = document.createElement('div')
        ;(e.innerHTML = a.value), (a.value = L(i, M(e), r))
      }
      ;(a.value = x(a.value)),
        S('after:highlightBlock', { block: e, result: a }),
        (e.innerHTML = a.value),
        (e.className = (function (e, n, t) {
          var r = n ? s[n] : t,
            a = [e.trim()]
          return (
            e.match(/\bhljs\b/) || a.push('hljs'),
            e.includes(r) || a.push(r),
            a.join(' ').trim()
          )
        })(e.className, t, a.language)),
        (e.result = {
          language: a.language,
          re: a.relevance,
          relavance: a.relevance,
        }),
        a.second_best &&
          (e.second_best = {
            language: a.second_best.language,
            re: a.second_best.relevance,
            relavance: a.second_best.relevance,
          })
    }
    const w = () => {
      if (!w.called) {
        w.called = !0
        var e = document.querySelectorAll('pre code')
        a.forEach.call(e, E)
      }
    }
    function y(e) {
      return (e = (e || '').toLowerCase()), i[e] || i[s[e]]
    }
    function j(e, { languageName: n }) {
      'string' == typeof e && (e = [e]),
        e.forEach((e) => {
          s[e] = n
        })
    }
    function A(e) {
      var n = y(e)
      return n && !n.disableAutodetect
    }
    function S(e, n) {
      var t = e
      o.forEach(function (e) {
        e[t] && e[t](n)
      })
    }
    Object.assign(t, {
      highlight: m,
      highlightAuto: v,
      fixMarkup: function (e) {
        return (
          console.warn(
            'fixMarkup is deprecated and will be removed entirely in v11.0'
          ),
          console.warn(
            'Please see https://github.com/highlightjs/highlight.js/issues/2534'
          ),
          x(e)
        )
      },
      highlightBlock: E,
      configure: function (e) {
        f = O(f, e)
      },
      initHighlighting: w,
      initHighlightingOnLoad: function () {
        window.addEventListener('DOMContentLoaded', w, !1)
      },
      registerLanguage: function (e, n) {
        var r = null
        try {
          r = n(t)
        } catch (n) {
          if (
            (console.error(
              "Language definition for '{}' could not be registered.".replace(
                '{}',
                e
              )
            ),
            !l)
          )
            throw n
          console.error(n), (r = h)
        }
        r.name || (r.name = e),
          (i[e] = r),
          (r.rawDefinition = n.bind(null, t)),
          r.aliases && j(r.aliases, { languageName: e })
      },
      listLanguages: function () {
        return Object.keys(i)
      },
      getLanguage: y,
      registerAliases: j,
      requireLanguage: function (e) {
        var n = y(e)
        if (n) return n
        throw Error(
          "The '{}' language is required, but not loaded.".replace('{}', e)
        )
      },
      autoDetection: A,
      inherit: O,
      addPlugin: function (e) {
        o.push(e)
      },
      vuePlugin: R,
    }),
      (t.debugMode = function () {
        l = !1
      }),
      (t.safeMode = function () {
        l = !0
      }),
      (t.versionString = '10.2.0')
    for (const n in _) 'object' == typeof _[n] && e(_[n])
    return Object.assign(t, _), t
  })({})
})()
'object' == typeof exports &&
  'undefined' != typeof module &&
  (module.exports = hljs)
hljs.registerLanguage(
  'python',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          keyword:
            'and elif is global as in if from raise for except finally print import pass return exec else break not with class assert yield try while continue del or def lambda async await nonlocal|10',
          built_in: 'Ellipsis NotImplemented',
          literal: 'False None True',
        },
        a = { className: 'meta', begin: /^(>>>|\.\.\.) / },
        i = {
          className: 'subst',
          begin: /\{/,
          end: /\}/,
          keywords: n,
          illegal: /#/,
        },
        s = { begin: /\{\{/, relevance: 0 },
        r = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE],
          variants: [
            {
              begin: /(u|b)?r?'''/,
              end: /'''/,
              contains: [e.BACKSLASH_ESCAPE, a],
              relevance: 10,
            },
            {
              begin: /(u|b)?r?"""/,
              end: /"""/,
              contains: [e.BACKSLASH_ESCAPE, a],
              relevance: 10,
            },
            {
              begin: /(fr|rf|f)'''/,
              end: /'''/,
              contains: [e.BACKSLASH_ESCAPE, a, s, i],
            },
            {
              begin: /(fr|rf|f)"""/,
              end: /"""/,
              contains: [e.BACKSLASH_ESCAPE, a, s, i],
            },
            { begin: /(u|r|ur)'/, end: /'/, relevance: 10 },
            { begin: /(u|r|ur)"/, end: /"/, relevance: 10 },
            { begin: /(b|br)'/, end: /'/ },
            { begin: /(b|br)"/, end: /"/ },
            {
              begin: /(fr|rf|f)'/,
              end: /'/,
              contains: [e.BACKSLASH_ESCAPE, s, i],
            },
            {
              begin: /(fr|rf|f)"/,
              end: /"/,
              contains: [e.BACKSLASH_ESCAPE, s, i],
            },
            e.APOS_STRING_MODE,
            e.QUOTE_STRING_MODE,
          ],
        },
        l = {
          className: 'number',
          relevance: 0,
          variants: [
            { begin: e.BINARY_NUMBER_RE + '[lLjJ]?' },
            { begin: '\\b(0o[0-7]+)[lLjJ]?' },
            { begin: e.C_NUMBER_RE + '[lLjJ]?' },
          ],
        },
        t = {
          className: 'params',
          variants: [
            { begin: /\(\s*\)/, skip: !0, className: null },
            {
              begin: /\(/,
              end: /\)/,
              excludeBegin: !0,
              excludeEnd: !0,
              contains: ['self', a, l, r, e.HASH_COMMENT_MODE],
            },
          ],
        }
      return (
        (i.contains = [r, l, a]),
        {
          name: 'Python',
          aliases: ['py', 'gyp', 'ipython'],
          keywords: n,
          illegal: /(<\/|->|\?)|=>/,
          contains: [
            a,
            l,
            { beginKeywords: 'if', relevance: 0 },
            r,
            e.HASH_COMMENT_MODE,
            {
              variants: [
                { className: 'function', beginKeywords: 'def' },
                { className: 'class', beginKeywords: 'class' },
              ],
              end: /:/,
              illegal: /[${=;\n,]/,
              contains: [
                e.UNDERSCORE_TITLE_MODE,
                t,
                { begin: /->/, endsWithParent: !0, keywords: 'None' },
              ],
            },
            { className: 'meta', begin: /^[\t ]*@/, end: /$/ },
            { begin: /\b(print|exec)\(/ },
          ],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'python-repl',
  (function () {
    'use strict'
    return function (n) {
      return {
        aliases: ['pycon'],
        contains: [
          {
            className: 'meta',
            starts: { end: / |$/, starts: { end: '$', subLanguage: 'python' } },
            variants: [
              { begin: /^>>>(?=[ ]|$)/ },
              { begin: /^\.\.\.(?=[ ]|$)/ },
            ],
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'c-like',
  (function () {
    'use strict'
    return function (e) {
      function t(e) {
        return '(?:' + e + ')?'
      }
      var n =
          '(decltype\\(auto\\)|' +
          t('[a-zA-Z_]\\w*::') +
          '[a-zA-Z_]\\w*' +
          t('<.*?>') +
          ')',
        r = { className: 'keyword', begin: '\\b[a-z\\d_]*_t\\b' },
        a = {
          className: 'string',
          variants: [
            {
              begin: '(u8?|U|L)?"',
              end: '"',
              illegal: '\\n',
              contains: [e.BACKSLASH_ESCAPE],
            },
            {
              begin:
                "(u8?|U|L)?'(\\\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4,8}|[0-7]{3}|\\S)|.)",
              end: "'",
              illegal: '.',
            },
            e.END_SAME_AS_BEGIN({
              begin: /(?:u8?|U|L)?R"([^()\\ ]{0,16})\(/,
              end: /\)([^()\\ ]{0,16})"/,
            }),
          ],
        },
        i = {
          className: 'number',
          variants: [
            { begin: "\\b(0b[01']+)" },
            {
              begin:
                "(-?)\\b([\\d']+(\\.[\\d']*)?|\\.[\\d']+)(u|U|l|L|ul|UL|f|F|b|B)",
            },
            {
              begin:
                "(-?)(\\b0[xX][a-fA-F0-9']+|(\\b[\\d']+(\\.[\\d']*)?|\\.[\\d']+)([eE][-+]?[\\d']+)?)",
            },
          ],
          relevance: 0,
        },
        s = {
          className: 'meta',
          begin: /#\s*[a-z]+\b/,
          end: /$/,
          keywords: {
            'meta-keyword':
              'if else elif endif define undef warning error line pragma _Pragma ifdef ifndef include',
          },
          contains: [
            { begin: /\\\n/, relevance: 0 },
            e.inherit(a, { className: 'meta-string' }),
            {
              className: 'meta-string',
              begin: /<.*?>/,
              end: /$/,
              illegal: '\\n',
            },
            e.C_LINE_COMMENT_MODE,
            e.C_BLOCK_COMMENT_MODE,
          ],
        },
        o = {
          className: 'title',
          begin: t('[a-zA-Z_]\\w*::') + e.IDENT_RE,
          relevance: 0,
        },
        c = t('[a-zA-Z_]\\w*::') + e.IDENT_RE + '\\s*\\(',
        l = {
          keyword:
            'int float while private char char8_t char16_t char32_t catch import module export virtual operator sizeof dynamic_cast|10 typedef const_cast|10 const for static_cast|10 union namespace unsigned long volatile static protected bool template mutable if public friend do goto auto void enum else break extern using asm case typeid wchar_t short reinterpret_cast|10 default double register explicit signed typename try this switch continue inline delete alignas alignof constexpr consteval constinit decltype concept co_await co_return co_yield requires noexcept static_assert thread_local restrict final override atomic_bool atomic_char atomic_schar atomic_uchar atomic_short atomic_ushort atomic_int atomic_uint atomic_long atomic_ulong atomic_llong atomic_ullong new throw return and and_eq bitand bitor compl not not_eq or or_eq xor xor_eq',
          built_in:
            'std string wstring cin cout cerr clog stdin stdout stderr stringstream istringstream ostringstream auto_ptr deque list queue stack vector map set pair bitset multiset multimap unordered_set unordered_map unordered_multiset unordered_multimap priority_queue make_pair array shared_ptr abort terminate abs acos asin atan2 atan calloc ceil cosh cos exit exp fabs floor fmod fprintf fputs free frexp fscanf future isalnum isalpha iscntrl isdigit isgraph islower isprint ispunct isspace isupper isxdigit tolower toupper labs ldexp log10 log malloc realloc memchr memcmp memcpy memset modf pow printf putchar puts scanf sinh sin snprintf sprintf sqrt sscanf strcat strchr strcmp strcpy strcspn strlen strncat strncmp strncpy strpbrk strrchr strspn strstr tanh tan vfprintf vprintf vsprintf endl initializer_list unique_ptr _Bool complex _Complex imaginary _Imaginary',
          literal: 'true false nullptr NULL',
        },
        d = [r, e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE, i, a],
        _ = {
          variants: [
            { begin: /=/, end: /;/ },
            { begin: /\(/, end: /\)/ },
            { beginKeywords: 'new throw return else', end: /;/ },
          ],
          keywords: l,
          contains: d.concat([
            {
              begin: /\(/,
              end: /\)/,
              keywords: l,
              contains: d.concat(['self']),
              relevance: 0,
            },
          ]),
          relevance: 0,
        },
        u = {
          className: 'function',
          begin: '(' + n + '[\\*&\\s]+)+' + c,
          returnBegin: !0,
          end: /[{;=]/,
          excludeEnd: !0,
          keywords: l,
          illegal: /[^\w\s\*&:<>]/,
          contains: [
            { begin: 'decltype\\(auto\\)', keywords: l, relevance: 0 },
            { begin: c, returnBegin: !0, contains: [o], relevance: 0 },
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              keywords: l,
              relevance: 0,
              contains: [
                e.C_LINE_COMMENT_MODE,
                e.C_BLOCK_COMMENT_MODE,
                a,
                i,
                r,
                {
                  begin: /\(/,
                  end: /\)/,
                  keywords: l,
                  relevance: 0,
                  contains: [
                    'self',
                    e.C_LINE_COMMENT_MODE,
                    e.C_BLOCK_COMMENT_MODE,
                    a,
                    i,
                    r,
                  ],
                },
              ],
            },
            r,
            e.C_LINE_COMMENT_MODE,
            e.C_BLOCK_COMMENT_MODE,
            s,
          ],
        }
      return {
        aliases: ['c', 'cc', 'h', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx'],
        keywords: l,
        disableAutodetect: !0,
        illegal: '</',
        contains: [].concat(_, u, d, [
          s,
          {
            begin:
              '\\b(deque|list|queue|priority_queue|pair|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<',
            end: '>',
            keywords: l,
            contains: ['self', r],
          },
          { begin: e.IDENT_RE + '::', keywords: l },
          {
            className: 'class',
            beginKeywords: 'class struct',
            end: /[{;:]/,
            contains: [
              { begin: /</, end: />/, contains: ['self'] },
              e.TITLE_MODE,
            ],
          },
        ]),
        exports: { preprocessor: s, strings: a, keywords: l },
      }
    }
  })()
)
hljs.registerLanguage(
  'pgsql',
  (function () {
    'use strict'
    return function (E) {
      var T = E.COMMENT('--', '$'),
        N = '\\$([a-zA-Z_]?|[a-zA-Z_][a-zA-Z_0-9]*)\\$',
        A =
          'BIGINT INT8 BIGSERIAL SERIAL8 BIT VARYING VARBIT BOOLEAN BOOL BOX BYTEA CHARACTER CHAR VARCHAR CIDR CIRCLE DATE DOUBLE PRECISION FLOAT8 FLOAT INET INTEGER INT INT4 INTERVAL JSON JSONB LINE LSEG|10 MACADDR MACADDR8 MONEY NUMERIC DEC DECIMAL PATH POINT POLYGON REAL FLOAT4 SMALLINT INT2 SMALLSERIAL|10 SERIAL2|10 SERIAL|10 SERIAL4|10 TEXT TIME ZONE TIMETZ|10 TIMESTAMP TIMESTAMPTZ|10 TSQUERY|10 TSVECTOR|10 TXID_SNAPSHOT|10 UUID XML NATIONAL NCHAR INT4RANGE|10 INT8RANGE|10 NUMRANGE|10 TSRANGE|10 TSTZRANGE|10 DATERANGE|10 ANYELEMENT ANYARRAY ANYNONARRAY ANYENUM ANYRANGE CSTRING INTERNAL RECORD PG_DDL_COMMAND VOID UNKNOWN OPAQUE REFCURSOR NAME OID REGPROC|10 REGPROCEDURE|10 REGOPER|10 REGOPERATOR|10 REGCLASS|10 REGTYPE|10 REGROLE|10 REGNAMESPACE|10 REGCONFIG|10 REGDICTIONARY|10 ',
        R = A.trim()
          .split(' ')
          .map(function (E) {
            return E.split('|')[0]
          })
          .join('|'),
        I =
          'ARRAY_AGG AVG BIT_AND BIT_OR BOOL_AND BOOL_OR COUNT EVERY JSON_AGG JSONB_AGG JSON_OBJECT_AGG JSONB_OBJECT_AGG MAX MIN MODE STRING_AGG SUM XMLAGG CORR COVAR_POP COVAR_SAMP REGR_AVGX REGR_AVGY REGR_COUNT REGR_INTERCEPT REGR_R2 REGR_SLOPE REGR_SXX REGR_SXY REGR_SYY STDDEV STDDEV_POP STDDEV_SAMP VARIANCE VAR_POP VAR_SAMP PERCENTILE_CONT PERCENTILE_DISC ROW_NUMBER RANK DENSE_RANK PERCENT_RANK CUME_DIST NTILE LAG LEAD FIRST_VALUE LAST_VALUE NTH_VALUE NUM_NONNULLS NUM_NULLS ABS CBRT CEIL CEILING DEGREES DIV EXP FLOOR LN LOG MOD PI POWER RADIANS ROUND SCALE SIGN SQRT TRUNC WIDTH_BUCKET RANDOM SETSEED ACOS ACOSD ASIN ASIND ATAN ATAND ATAN2 ATAN2D COS COSD COT COTD SIN SIND TAN TAND BIT_LENGTH CHAR_LENGTH CHARACTER_LENGTH LOWER OCTET_LENGTH OVERLAY POSITION SUBSTRING TREAT TRIM UPPER ASCII BTRIM CHR CONCAT CONCAT_WS CONVERT CONVERT_FROM CONVERT_TO DECODE ENCODE INITCAP LEFT LENGTH LPAD LTRIM MD5 PARSE_IDENT PG_CLIENT_ENCODING QUOTE_IDENT|10 QUOTE_LITERAL|10 QUOTE_NULLABLE|10 REGEXP_MATCH REGEXP_MATCHES REGEXP_REPLACE REGEXP_SPLIT_TO_ARRAY REGEXP_SPLIT_TO_TABLE REPEAT REPLACE REVERSE RIGHT RPAD RTRIM SPLIT_PART STRPOS SUBSTR TO_ASCII TO_HEX TRANSLATE OCTET_LENGTH GET_BIT GET_BYTE SET_BIT SET_BYTE TO_CHAR TO_DATE TO_NUMBER TO_TIMESTAMP AGE CLOCK_TIMESTAMP|10 DATE_PART DATE_TRUNC ISFINITE JUSTIFY_DAYS JUSTIFY_HOURS JUSTIFY_INTERVAL MAKE_DATE MAKE_INTERVAL|10 MAKE_TIME MAKE_TIMESTAMP|10 MAKE_TIMESTAMPTZ|10 NOW STATEMENT_TIMESTAMP|10 TIMEOFDAY TRANSACTION_TIMESTAMP|10 ENUM_FIRST ENUM_LAST ENUM_RANGE AREA CENTER DIAMETER HEIGHT ISCLOSED ISOPEN NPOINTS PCLOSE POPEN RADIUS WIDTH BOX BOUND_BOX CIRCLE LINE LSEG PATH POLYGON ABBREV BROADCAST HOST HOSTMASK MASKLEN NETMASK NETWORK SET_MASKLEN TEXT INET_SAME_FAMILY INET_MERGE MACADDR8_SET7BIT ARRAY_TO_TSVECTOR GET_CURRENT_TS_CONFIG NUMNODE PLAINTO_TSQUERY PHRASETO_TSQUERY WEBSEARCH_TO_TSQUERY QUERYTREE SETWEIGHT STRIP TO_TSQUERY TO_TSVECTOR JSON_TO_TSVECTOR JSONB_TO_TSVECTOR TS_DELETE TS_FILTER TS_HEADLINE TS_RANK TS_RANK_CD TS_REWRITE TSQUERY_PHRASE TSVECTOR_TO_ARRAY TSVECTOR_UPDATE_TRIGGER TSVECTOR_UPDATE_TRIGGER_COLUMN XMLCOMMENT XMLCONCAT XMLELEMENT XMLFOREST XMLPI XMLROOT XMLEXISTS XML_IS_WELL_FORMED XML_IS_WELL_FORMED_DOCUMENT XML_IS_WELL_FORMED_CONTENT XPATH XPATH_EXISTS XMLTABLE XMLNAMESPACES TABLE_TO_XML TABLE_TO_XMLSCHEMA TABLE_TO_XML_AND_XMLSCHEMA QUERY_TO_XML QUERY_TO_XMLSCHEMA QUERY_TO_XML_AND_XMLSCHEMA CURSOR_TO_XML CURSOR_TO_XMLSCHEMA SCHEMA_TO_XML SCHEMA_TO_XMLSCHEMA SCHEMA_TO_XML_AND_XMLSCHEMA DATABASE_TO_XML DATABASE_TO_XMLSCHEMA DATABASE_TO_XML_AND_XMLSCHEMA XMLATTRIBUTES TO_JSON TO_JSONB ARRAY_TO_JSON ROW_TO_JSON JSON_BUILD_ARRAY JSONB_BUILD_ARRAY JSON_BUILD_OBJECT JSONB_BUILD_OBJECT JSON_OBJECT JSONB_OBJECT JSON_ARRAY_LENGTH JSONB_ARRAY_LENGTH JSON_EACH JSONB_EACH JSON_EACH_TEXT JSONB_EACH_TEXT JSON_EXTRACT_PATH JSONB_EXTRACT_PATH JSON_OBJECT_KEYS JSONB_OBJECT_KEYS JSON_POPULATE_RECORD JSONB_POPULATE_RECORD JSON_POPULATE_RECORDSET JSONB_POPULATE_RECORDSET JSON_ARRAY_ELEMENTS JSONB_ARRAY_ELEMENTS JSON_ARRAY_ELEMENTS_TEXT JSONB_ARRAY_ELEMENTS_TEXT JSON_TYPEOF JSONB_TYPEOF JSON_TO_RECORD JSONB_TO_RECORD JSON_TO_RECORDSET JSONB_TO_RECORDSET JSON_STRIP_NULLS JSONB_STRIP_NULLS JSONB_SET JSONB_INSERT JSONB_PRETTY CURRVAL LASTVAL NEXTVAL SETVAL COALESCE NULLIF GREATEST LEAST ARRAY_APPEND ARRAY_CAT ARRAY_NDIMS ARRAY_DIMS ARRAY_FILL ARRAY_LENGTH ARRAY_LOWER ARRAY_POSITION ARRAY_POSITIONS ARRAY_PREPEND ARRAY_REMOVE ARRAY_REPLACE ARRAY_TO_STRING ARRAY_UPPER CARDINALITY STRING_TO_ARRAY UNNEST ISEMPTY LOWER_INC UPPER_INC LOWER_INF UPPER_INF RANGE_MERGE GENERATE_SERIES GENERATE_SUBSCRIPTS CURRENT_DATABASE CURRENT_QUERY CURRENT_SCHEMA|10 CURRENT_SCHEMAS|10 INET_CLIENT_ADDR INET_CLIENT_PORT INET_SERVER_ADDR INET_SERVER_PORT ROW_SECURITY_ACTIVE FORMAT_TYPE TO_REGCLASS TO_REGPROC TO_REGPROCEDURE TO_REGOPER TO_REGOPERATOR TO_REGTYPE TO_REGNAMESPACE TO_REGROLE COL_DESCRIPTION OBJ_DESCRIPTION SHOBJ_DESCRIPTION TXID_CURRENT TXID_CURRENT_IF_ASSIGNED TXID_CURRENT_SNAPSHOT TXID_SNAPSHOT_XIP TXID_SNAPSHOT_XMAX TXID_SNAPSHOT_XMIN TXID_VISIBLE_IN_SNAPSHOT TXID_STATUS CURRENT_SETTING SET_CONFIG BRIN_SUMMARIZE_NEW_VALUES BRIN_SUMMARIZE_RANGE BRIN_DESUMMARIZE_RANGE GIN_CLEAN_PENDING_LIST SUPPRESS_REDUNDANT_UPDATES_TRIGGER LO_FROM_BYTEA LO_PUT LO_GET LO_CREAT LO_CREATE LO_UNLINK LO_IMPORT LO_EXPORT LOREAD LOWRITE GROUPING CAST'
            .split(' ')
            .map(function (E) {
              return E.split('|')[0]
            })
            .join('|')
      return {
        name: 'PostgreSQL',
        aliases: ['postgres', 'postgresql'],
        case_insensitive: !0,
        keywords: {
          keyword:
            'ABORT ALTER ANALYZE BEGIN CALL CHECKPOINT|10 CLOSE CLUSTER COMMENT COMMIT COPY CREATE DEALLOCATE DECLARE DELETE DISCARD DO DROP END EXECUTE EXPLAIN FETCH GRANT IMPORT INSERT LISTEN LOAD LOCK MOVE NOTIFY PREPARE REASSIGN|10 REFRESH REINDEX RELEASE RESET REVOKE ROLLBACK SAVEPOINT SECURITY SELECT SET SHOW START TRUNCATE UNLISTEN|10 UPDATE VACUUM|10 VALUES AGGREGATE COLLATION CONVERSION|10 DATABASE DEFAULT PRIVILEGES DOMAIN TRIGGER EXTENSION FOREIGN WRAPPER|10 TABLE FUNCTION GROUP LANGUAGE LARGE OBJECT MATERIALIZED VIEW OPERATOR CLASS FAMILY POLICY PUBLICATION|10 ROLE RULE SCHEMA SEQUENCE SERVER STATISTICS SUBSCRIPTION SYSTEM TABLESPACE CONFIGURATION DICTIONARY PARSER TEMPLATE TYPE USER MAPPING PREPARED ACCESS METHOD CAST AS TRANSFORM TRANSACTION OWNED TO INTO SESSION AUTHORIZATION INDEX PROCEDURE ASSERTION ALL ANALYSE AND ANY ARRAY ASC ASYMMETRIC|10 BOTH CASE CHECK COLLATE COLUMN CONCURRENTLY|10 CONSTRAINT CROSS DEFERRABLE RANGE DESC DISTINCT ELSE EXCEPT FOR FREEZE|10 FROM FULL HAVING ILIKE IN INITIALLY INNER INTERSECT IS ISNULL JOIN LATERAL LEADING LIKE LIMIT NATURAL NOT NOTNULL NULL OFFSET ON ONLY OR ORDER OUTER OVERLAPS PLACING PRIMARY REFERENCES RETURNING SIMILAR SOME SYMMETRIC TABLESAMPLE THEN TRAILING UNION UNIQUE USING VARIADIC|10 VERBOSE WHEN WHERE WINDOW WITH BY RETURNS INOUT OUT SETOF|10 IF STRICT CURRENT CONTINUE OWNER LOCATION OVER PARTITION WITHIN BETWEEN ESCAPE EXTERNAL INVOKER DEFINER WORK RENAME VERSION CONNECTION CONNECT TABLES TEMP TEMPORARY FUNCTIONS SEQUENCES TYPES SCHEMAS OPTION CASCADE RESTRICT ADD ADMIN EXISTS VALID VALIDATE ENABLE DISABLE REPLICA|10 ALWAYS PASSING COLUMNS PATH REF VALUE OVERRIDING IMMUTABLE STABLE VOLATILE BEFORE AFTER EACH ROW PROCEDURAL ROUTINE NO HANDLER VALIDATOR OPTIONS STORAGE OIDS|10 WITHOUT INHERIT DEPENDS CALLED INPUT LEAKPROOF|10 COST ROWS NOWAIT SEARCH UNTIL ENCRYPTED|10 PASSWORD CONFLICT|10 INSTEAD INHERITS CHARACTERISTICS WRITE CURSOR ALSO STATEMENT SHARE EXCLUSIVE INLINE ISOLATION REPEATABLE READ COMMITTED SERIALIZABLE UNCOMMITTED LOCAL GLOBAL SQL PROCEDURES RECURSIVE SNAPSHOT ROLLUP CUBE TRUSTED|10 INCLUDE FOLLOWING PRECEDING UNBOUNDED RANGE GROUPS UNENCRYPTED|10 SYSID FORMAT DELIMITER HEADER QUOTE ENCODING FILTER OFF FORCE_QUOTE FORCE_NOT_NULL FORCE_NULL COSTS BUFFERS TIMING SUMMARY DISABLE_PAGE_SKIPPING RESTART CYCLE GENERATED IDENTITY DEFERRED IMMEDIATE LEVEL LOGGED UNLOGGED OF NOTHING NONE EXCLUDE ATTRIBUTE USAGE ROUTINES TRUE FALSE NAN INFINITY ALIAS BEGIN CONSTANT DECLARE END EXCEPTION RETURN PERFORM|10 RAISE GET DIAGNOSTICS STACKED|10 FOREACH LOOP ELSIF EXIT WHILE REVERSE SLICE DEBUG LOG INFO NOTICE WARNING ASSERT OPEN SUPERUSER NOSUPERUSER CREATEDB NOCREATEDB CREATEROLE NOCREATEROLE INHERIT NOINHERIT LOGIN NOLOGIN REPLICATION NOREPLICATION BYPASSRLS NOBYPASSRLS ',
          built_in:
            'CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER CURRENT_CATALOG|10 CURRENT_DATE LOCALTIME LOCALTIMESTAMP CURRENT_ROLE|10 CURRENT_SCHEMA|10 SESSION_USER PUBLIC FOUND NEW OLD TG_NAME|10 TG_WHEN|10 TG_LEVEL|10 TG_OP|10 TG_RELID|10 TG_RELNAME|10 TG_TABLE_NAME|10 TG_TABLE_SCHEMA|10 TG_NARGS|10 TG_ARGV|10 TG_EVENT|10 TG_TAG|10 ROW_COUNT RESULT_OID|10 PG_CONTEXT|10 RETURNED_SQLSTATE COLUMN_NAME CONSTRAINT_NAME PG_DATATYPE_NAME|10 MESSAGE_TEXT TABLE_NAME SCHEMA_NAME PG_EXCEPTION_DETAIL|10 PG_EXCEPTION_HINT|10 PG_EXCEPTION_CONTEXT|10 SQLSTATE SQLERRM|10 SUCCESSFUL_COMPLETION WARNING DYNAMIC_RESULT_SETS_RETURNED IMPLICIT_ZERO_BIT_PADDING NULL_VALUE_ELIMINATED_IN_SET_FUNCTION PRIVILEGE_NOT_GRANTED PRIVILEGE_NOT_REVOKED STRING_DATA_RIGHT_TRUNCATION DEPRECATED_FEATURE NO_DATA NO_ADDITIONAL_DYNAMIC_RESULT_SETS_RETURNED SQL_STATEMENT_NOT_YET_COMPLETE CONNECTION_EXCEPTION CONNECTION_DOES_NOT_EXIST CONNECTION_FAILURE SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION SQLSERVER_REJECTED_ESTABLISHMENT_OF_SQLCONNECTION TRANSACTION_RESOLUTION_UNKNOWN PROTOCOL_VIOLATION TRIGGERED_ACTION_EXCEPTION FEATURE_NOT_SUPPORTED INVALID_TRANSACTION_INITIATION LOCATOR_EXCEPTION INVALID_LOCATOR_SPECIFICATION INVALID_GRANTOR INVALID_GRANT_OPERATION INVALID_ROLE_SPECIFICATION DIAGNOSTICS_EXCEPTION STACKED_DIAGNOSTICS_ACCESSED_WITHOUT_ACTIVE_HANDLER CASE_NOT_FOUND CARDINALITY_VIOLATION DATA_EXCEPTION ARRAY_SUBSCRIPT_ERROR CHARACTER_NOT_IN_REPERTOIRE DATETIME_FIELD_OVERFLOW DIVISION_BY_ZERO ERROR_IN_ASSIGNMENT ESCAPE_CHARACTER_CONFLICT INDICATOR_OVERFLOW INTERVAL_FIELD_OVERFLOW INVALID_ARGUMENT_FOR_LOGARITHM INVALID_ARGUMENT_FOR_NTILE_FUNCTION INVALID_ARGUMENT_FOR_NTH_VALUE_FUNCTION INVALID_ARGUMENT_FOR_POWER_FUNCTION INVALID_ARGUMENT_FOR_WIDTH_BUCKET_FUNCTION INVALID_CHARACTER_VALUE_FOR_CAST INVALID_DATETIME_FORMAT INVALID_ESCAPE_CHARACTER INVALID_ESCAPE_OCTET INVALID_ESCAPE_SEQUENCE NONSTANDARD_USE_OF_ESCAPE_CHARACTER INVALID_INDICATOR_PARAMETER_VALUE INVALID_PARAMETER_VALUE INVALID_REGULAR_EXPRESSION INVALID_ROW_COUNT_IN_LIMIT_CLAUSE INVALID_ROW_COUNT_IN_RESULT_OFFSET_CLAUSE INVALID_TABLESAMPLE_ARGUMENT INVALID_TABLESAMPLE_REPEAT INVALID_TIME_ZONE_DISPLACEMENT_VALUE INVALID_USE_OF_ESCAPE_CHARACTER MOST_SPECIFIC_TYPE_MISMATCH NULL_VALUE_NOT_ALLOWED NULL_VALUE_NO_INDICATOR_PARAMETER NUMERIC_VALUE_OUT_OF_RANGE SEQUENCE_GENERATOR_LIMIT_EXCEEDED STRING_DATA_LENGTH_MISMATCH STRING_DATA_RIGHT_TRUNCATION SUBSTRING_ERROR TRIM_ERROR UNTERMINATED_C_STRING ZERO_LENGTH_CHARACTER_STRING FLOATING_POINT_EXCEPTION INVALID_TEXT_REPRESENTATION INVALID_BINARY_REPRESENTATION BAD_COPY_FILE_FORMAT UNTRANSLATABLE_CHARACTER NOT_AN_XML_DOCUMENT INVALID_XML_DOCUMENT INVALID_XML_CONTENT INVALID_XML_COMMENT INVALID_XML_PROCESSING_INSTRUCTION INTEGRITY_CONSTRAINT_VIOLATION RESTRICT_VIOLATION NOT_NULL_VIOLATION FOREIGN_KEY_VIOLATION UNIQUE_VIOLATION CHECK_VIOLATION EXCLUSION_VIOLATION INVALID_CURSOR_STATE INVALID_TRANSACTION_STATE ACTIVE_SQL_TRANSACTION BRANCH_TRANSACTION_ALREADY_ACTIVE HELD_CURSOR_REQUIRES_SAME_ISOLATION_LEVEL INAPPROPRIATE_ACCESS_MODE_FOR_BRANCH_TRANSACTION INAPPROPRIATE_ISOLATION_LEVEL_FOR_BRANCH_TRANSACTION NO_ACTIVE_SQL_TRANSACTION_FOR_BRANCH_TRANSACTION READ_ONLY_SQL_TRANSACTION SCHEMA_AND_DATA_STATEMENT_MIXING_NOT_SUPPORTED NO_ACTIVE_SQL_TRANSACTION IN_FAILED_SQL_TRANSACTION IDLE_IN_TRANSACTION_SESSION_TIMEOUT INVALID_SQL_STATEMENT_NAME TRIGGERED_DATA_CHANGE_VIOLATION INVALID_AUTHORIZATION_SPECIFICATION INVALID_PASSWORD DEPENDENT_PRIVILEGE_DESCRIPTORS_STILL_EXIST DEPENDENT_OBJECTS_STILL_EXIST INVALID_TRANSACTION_TERMINATION SQL_ROUTINE_EXCEPTION FUNCTION_EXECUTED_NO_RETURN_STATEMENT MODIFYING_SQL_DATA_NOT_PERMITTED PROHIBITED_SQL_STATEMENT_ATTEMPTED READING_SQL_DATA_NOT_PERMITTED INVALID_CURSOR_NAME EXTERNAL_ROUTINE_EXCEPTION CONTAINING_SQL_NOT_PERMITTED MODIFYING_SQL_DATA_NOT_PERMITTED PROHIBITED_SQL_STATEMENT_ATTEMPTED READING_SQL_DATA_NOT_PERMITTED EXTERNAL_ROUTINE_INVOCATION_EXCEPTION INVALID_SQLSTATE_RETURNED NULL_VALUE_NOT_ALLOWED TRIGGER_PROTOCOL_VIOLATED SRF_PROTOCOL_VIOLATED EVENT_TRIGGER_PROTOCOL_VIOLATED SAVEPOINT_EXCEPTION INVALID_SAVEPOINT_SPECIFICATION INVALID_CATALOG_NAME INVALID_SCHEMA_NAME TRANSACTION_ROLLBACK TRANSACTION_INTEGRITY_CONSTRAINT_VIOLATION SERIALIZATION_FAILURE STATEMENT_COMPLETION_UNKNOWN DEADLOCK_DETECTED SYNTAX_ERROR_OR_ACCESS_RULE_VIOLATION SYNTAX_ERROR INSUFFICIENT_PRIVILEGE CANNOT_COERCE GROUPING_ERROR WINDOWING_ERROR INVALID_RECURSION INVALID_FOREIGN_KEY INVALID_NAME NAME_TOO_LONG RESERVED_NAME DATATYPE_MISMATCH INDETERMINATE_DATATYPE COLLATION_MISMATCH INDETERMINATE_COLLATION WRONG_OBJECT_TYPE GENERATED_ALWAYS UNDEFINED_COLUMN UNDEFINED_FUNCTION UNDEFINED_TABLE UNDEFINED_PARAMETER UNDEFINED_OBJECT DUPLICATE_COLUMN DUPLICATE_CURSOR DUPLICATE_DATABASE DUPLICATE_FUNCTION DUPLICATE_PREPARED_STATEMENT DUPLICATE_SCHEMA DUPLICATE_TABLE DUPLICATE_ALIAS DUPLICATE_OBJECT AMBIGUOUS_COLUMN AMBIGUOUS_FUNCTION AMBIGUOUS_PARAMETER AMBIGUOUS_ALIAS INVALID_COLUMN_REFERENCE INVALID_COLUMN_DEFINITION INVALID_CURSOR_DEFINITION INVALID_DATABASE_DEFINITION INVALID_FUNCTION_DEFINITION INVALID_PREPARED_STATEMENT_DEFINITION INVALID_SCHEMA_DEFINITION INVALID_TABLE_DEFINITION INVALID_OBJECT_DEFINITION WITH_CHECK_OPTION_VIOLATION INSUFFICIENT_RESOURCES DISK_FULL OUT_OF_MEMORY TOO_MANY_CONNECTIONS CONFIGURATION_LIMIT_EXCEEDED PROGRAM_LIMIT_EXCEEDED STATEMENT_TOO_COMPLEX TOO_MANY_COLUMNS TOO_MANY_ARGUMENTS OBJECT_NOT_IN_PREREQUISITE_STATE OBJECT_IN_USE CANT_CHANGE_RUNTIME_PARAM LOCK_NOT_AVAILABLE OPERATOR_INTERVENTION QUERY_CANCELED ADMIN_SHUTDOWN CRASH_SHUTDOWN CANNOT_CONNECT_NOW DATABASE_DROPPED SYSTEM_ERROR IO_ERROR UNDEFINED_FILE DUPLICATE_FILE SNAPSHOT_TOO_OLD CONFIG_FILE_ERROR LOCK_FILE_EXISTS FDW_ERROR FDW_COLUMN_NAME_NOT_FOUND FDW_DYNAMIC_PARAMETER_VALUE_NEEDED FDW_FUNCTION_SEQUENCE_ERROR FDW_INCONSISTENT_DESCRIPTOR_INFORMATION FDW_INVALID_ATTRIBUTE_VALUE FDW_INVALID_COLUMN_NAME FDW_INVALID_COLUMN_NUMBER FDW_INVALID_DATA_TYPE FDW_INVALID_DATA_TYPE_DESCRIPTORS FDW_INVALID_DESCRIPTOR_FIELD_IDENTIFIER FDW_INVALID_HANDLE FDW_INVALID_OPTION_INDEX FDW_INVALID_OPTION_NAME FDW_INVALID_STRING_LENGTH_OR_BUFFER_LENGTH FDW_INVALID_STRING_FORMAT FDW_INVALID_USE_OF_NULL_POINTER FDW_TOO_MANY_HANDLES FDW_OUT_OF_MEMORY FDW_NO_SCHEMAS FDW_OPTION_NAME_NOT_FOUND FDW_REPLY_HANDLE FDW_SCHEMA_NOT_FOUND FDW_TABLE_NOT_FOUND FDW_UNABLE_TO_CREATE_EXECUTION FDW_UNABLE_TO_CREATE_REPLY FDW_UNABLE_TO_ESTABLISH_CONNECTION PLPGSQL_ERROR RAISE_EXCEPTION NO_DATA_FOUND TOO_MANY_ROWS ASSERT_FAILURE INTERNAL_ERROR DATA_CORRUPTED INDEX_CORRUPTED ',
        },
        illegal: /:==|\W\s*\(\*|(^|\s)\$[a-z]|{{|[a-z]:\s*$|\.\.\.|TO:|DO:/,
        contains: [
          {
            className: 'keyword',
            variants: [
              { begin: /\bTEXT\s*SEARCH\b/ },
              { begin: /\b(PRIMARY|FOREIGN|FOR(\s+NO)?)\s+KEY\b/ },
              { begin: /\bPARALLEL\s+(UNSAFE|RESTRICTED|SAFE)\b/ },
              { begin: /\bSTORAGE\s+(PLAIN|EXTERNAL|EXTENDED|MAIN)\b/ },
              { begin: /\bMATCH\s+(FULL|PARTIAL|SIMPLE)\b/ },
              { begin: /\bNULLS\s+(FIRST|LAST)\b/ },
              { begin: /\bEVENT\s+TRIGGER\b/ },
              { begin: /\b(MAPPING|OR)\s+REPLACE\b/ },
              { begin: /\b(FROM|TO)\s+(PROGRAM|STDIN|STDOUT)\b/ },
              { begin: /\b(SHARE|EXCLUSIVE)\s+MODE\b/ },
              { begin: /\b(LEFT|RIGHT)\s+(OUTER\s+)?JOIN\b/ },
              {
                begin:
                  /\b(FETCH|MOVE)\s+(NEXT|PRIOR|FIRST|LAST|ABSOLUTE|RELATIVE|FORWARD|BACKWARD)\b/,
              },
              { begin: /\bPRESERVE\s+ROWS\b/ },
              { begin: /\bDISCARD\s+PLANS\b/ },
              { begin: /\bREFERENCING\s+(OLD|NEW)\b/ },
              { begin: /\bSKIP\s+LOCKED\b/ },
              { begin: /\bGROUPING\s+SETS\b/ },
              {
                begin:
                  /\b(BINARY|INSENSITIVE|SCROLL|NO\s+SCROLL)\s+(CURSOR|FOR)\b/,
              },
              { begin: /\b(WITH|WITHOUT)\s+HOLD\b/ },
              { begin: /\bWITH\s+(CASCADED|LOCAL)\s+CHECK\s+OPTION\b/ },
              { begin: /\bEXCLUDE\s+(TIES|NO\s+OTHERS)\b/ },
              { begin: /\bFORMAT\s+(TEXT|XML|JSON|YAML)\b/ },
              { begin: /\bSET\s+((SESSION|LOCAL)\s+)?NAMES\b/ },
              { begin: /\bIS\s+(NOT\s+)?UNKNOWN\b/ },
              { begin: /\bSECURITY\s+LABEL\b/ },
              { begin: /\bSTANDALONE\s+(YES|NO|NO\s+VALUE)\b/ },
              { begin: /\bWITH\s+(NO\s+)?DATA\b/ },
              { begin: /\b(FOREIGN|SET)\s+DATA\b/ },
              { begin: /\bSET\s+(CATALOG|CONSTRAINTS)\b/ },
              { begin: /\b(WITH|FOR)\s+ORDINALITY\b/ },
              { begin: /\bIS\s+(NOT\s+)?DOCUMENT\b/ },
              { begin: /\bXML\s+OPTION\s+(DOCUMENT|CONTENT)\b/ },
              { begin: /\b(STRIP|PRESERVE)\s+WHITESPACE\b/ },
              { begin: /\bNO\s+(ACTION|MAXVALUE|MINVALUE)\b/ },
              { begin: /\bPARTITION\s+BY\s+(RANGE|LIST|HASH)\b/ },
              { begin: /\bAT\s+TIME\s+ZONE\b/ },
              { begin: /\bGRANTED\s+BY\b/ },
              { begin: /\bRETURN\s+(QUERY|NEXT)\b/ },
              { begin: /\b(ATTACH|DETACH)\s+PARTITION\b/ },
              { begin: /\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/ },
              {
                begin:
                  /\b(INCLUDING|EXCLUDING)\s+(COMMENTS|CONSTRAINTS|DEFAULTS|IDENTITY|INDEXES|STATISTICS|STORAGE|ALL)\b/,
              },
              {
                begin:
                  /\bAS\s+(ASSIGNMENT|IMPLICIT|PERMISSIVE|RESTRICTIVE|ENUM|RANGE)\b/,
              },
            ],
          },
          { begin: /\b(FORMAT|FAMILY|VERSION)\s*\(/ },
          { begin: /\bINCLUDE\s*\(/, keywords: 'INCLUDE' },
          { begin: /\bRANGE(?!\s*(BETWEEN|UNBOUNDED|CURRENT|[-0-9]+))/ },
          {
            begin:
              /\b(VERSION|OWNER|TEMPLATE|TABLESPACE|CONNECTION\s+LIMIT|PROCEDURE|RESTRICT|JOIN|PARSER|COPY|START|END|COLLATION|INPUT|ANALYZE|STORAGE|LIKE|DEFAULT|DELIMITER|ENCODING|COLUMN|CONSTRAINT|TABLE|SCHEMA)\s*=/,
          },
          { begin: /\b(PG_\w+?|HAS_[A-Z_]+_PRIVILEGE)\b/, relevance: 10 },
          {
            begin: /\bEXTRACT\s*\(/,
            end: /\bFROM\b/,
            returnEnd: !0,
            keywords: {
              type: 'CENTURY DAY DECADE DOW DOY EPOCH HOUR ISODOW ISOYEAR MICROSECONDS MILLENNIUM MILLISECONDS MINUTE MONTH QUARTER SECOND TIMEZONE TIMEZONE_HOUR TIMEZONE_MINUTE WEEK YEAR',
            },
          },
          {
            begin: /\b(XMLELEMENT|XMLPI)\s*\(\s*NAME/,
            keywords: { keyword: 'NAME' },
          },
          {
            begin: /\b(XMLPARSE|XMLSERIALIZE)\s*\(\s*(DOCUMENT|CONTENT)/,
            keywords: { keyword: 'DOCUMENT CONTENT' },
          },
          {
            beginKeywords: 'CACHE INCREMENT MAXVALUE MINVALUE',
            end: E.C_NUMBER_RE,
            returnEnd: !0,
            keywords: 'BY CACHE INCREMENT MAXVALUE MINVALUE',
          },
          { className: 'type', begin: /\b(WITH|WITHOUT)\s+TIME\s+ZONE\b/ },
          {
            className: 'type',
            begin:
              /\bINTERVAL\s+(YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)(\s+TO\s+(MONTH|HOUR|MINUTE|SECOND))?\b/,
          },
          {
            begin:
              /\bRETURNS\s+(LANGUAGE_HANDLER|TRIGGER|EVENT_TRIGGER|FDW_HANDLER|INDEX_AM_HANDLER|TSM_HANDLER)\b/,
            keywords: {
              keyword: 'RETURNS',
              type: 'LANGUAGE_HANDLER TRIGGER EVENT_TRIGGER FDW_HANDLER INDEX_AM_HANDLER TSM_HANDLER',
            },
          },
          { begin: '\\b(' + I + ')\\s*\\(' },
          { begin: '\\.(' + R + ')\\b' },
          {
            begin: '\\b(' + R + ')\\s+PATH\\b',
            keywords: { keyword: 'PATH', type: A.replace('PATH ', '') },
          },
          { className: 'type', begin: '\\b(' + R + ')\\b' },
          {
            className: 'string',
            begin: "'",
            end: "'",
            contains: [{ begin: "''" }],
          },
          {
            className: 'string',
            begin: "(e|E|u&|U&)'",
            end: "'",
            contains: [{ begin: '\\\\.' }],
            relevance: 10,
          },
          E.END_SAME_AS_BEGIN({
            begin: N,
            end: N,
            contains: [
              {
                subLanguage: [
                  'pgsql',
                  'perl',
                  'python',
                  'tcl',
                  'r',
                  'lua',
                  'java',
                  'php',
                  'ruby',
                  'bash',
                  'scheme',
                  'xml',
                  'json',
                ],
                endsWithParent: !0,
              },
            ],
          }),
          { begin: '"', end: '"', contains: [{ begin: '""' }] },
          E.C_NUMBER_MODE,
          E.C_BLOCK_COMMENT_MODE,
          T,
          {
            className: 'meta',
            variants: [
              { begin: '%(ROW)?TYPE', relevance: 10 },
              { begin: '\\$\\d+' },
              { begin: '^#\\w', end: '$' },
            ],
          },
          {
            className: 'symbol',
            begin: '<<\\s*[a-zA-Z_][a-zA-Z_0-9$]*\\s*>>',
            relevance: 10,
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'less',
  (function () {
    'use strict'
    return function (e) {
      var n = '([\\w-]+|@{[\\w-]+})',
        a = [],
        s = [],
        t = function (e) {
          return { className: 'string', begin: '~?' + e + '.*?' + e }
        },
        r = function (e, n, a) {
          return { className: e, begin: n, relevance: a }
        },
        i = { begin: '\\(', end: '\\)', contains: s, relevance: 0 }
      s.push(
        e.C_LINE_COMMENT_MODE,
        e.C_BLOCK_COMMENT_MODE,
        t("'"),
        t('"'),
        e.CSS_NUMBER_MODE,
        {
          begin: '(url|data-uri)\\(',
          starts: { className: 'string', end: '[\\)\\n]', excludeEnd: !0 },
        },
        r('number', '#[0-9A-Fa-f]+\\b'),
        i,
        r('variable', '@@?[\\w-]+', 10),
        r('variable', '@{[\\w-]+}'),
        r('built_in', '~?`[^`]*?`'),
        {
          className: 'attribute',
          begin: '[\\w-]+\\s*:',
          end: ':',
          returnBegin: !0,
          excludeEnd: !0,
        },
        { className: 'meta', begin: '!important' }
      )
      var c = s.concat({ begin: '{', end: '}', contains: a }),
        l = {
          beginKeywords: 'when',
          endsWithParent: !0,
          contains: [{ beginKeywords: 'and not' }].concat(s),
        },
        o = {
          begin: n + '\\s*:',
          returnBegin: !0,
          end: '[;}]',
          relevance: 0,
          contains: [
            {
              className: 'attribute',
              begin: n,
              end: ':',
              excludeEnd: !0,
              starts: {
                endsWithParent: !0,
                illegal: '[<=$]',
                relevance: 0,
                contains: s,
              },
            },
          ],
        },
        g = {
          className: 'keyword',
          begin:
            '@(import|media|charset|font-face|(-[a-z]+-)?keyframes|supports|document|namespace|page|viewport|host)\\b',
          starts: { end: '[;{}]', returnEnd: !0, contains: s, relevance: 0 },
        },
        d = {
          className: 'variable',
          variants: [
            { begin: '@[\\w-]+\\s*:', relevance: 15 },
            { begin: '@[\\w-]+' },
          ],
          starts: { end: '[;}]', returnEnd: !0, contains: c },
        },
        b = {
          variants: [
            { begin: '[\\.#:&\\[>]', end: '[;{}]' },
            { begin: n, end: '{' },
          ],
          returnBegin: !0,
          returnEnd: !0,
          illegal: '[<=\'$"]',
          relevance: 0,
          contains: [
            e.C_LINE_COMMENT_MODE,
            e.C_BLOCK_COMMENT_MODE,
            l,
            r('keyword', 'all\\b'),
            r('variable', '@{[\\w-]+}'),
            r('selector-tag', n + '%?', 0),
            r('selector-id', '#' + n),
            r('selector-class', '\\.' + n, 0),
            r('selector-tag', '&', 0),
            { className: 'selector-attr', begin: '\\[', end: '\\]' },
            {
              className: 'selector-pseudo',
              begin: /:(:)?[a-zA-Z0-9\_\-\+\(\)"'.]+/,
            },
            { begin: '\\(', end: '\\)', contains: c },
            { begin: '!important' },
          ],
        }
      return (
        a.push(e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE, g, d, o, b),
        {
          name: 'Less',
          case_insensitive: !0,
          illegal: '[=>\'/<($"]',
          contains: a,
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'c',
  (function () {
    'use strict'
    return function (e) {
      var n = e.requireLanguage('c-like').rawDefinition()
      return (n.name = 'C'), (n.aliases = ['c', 'h']), n
    }
  })()
)
hljs.registerLanguage(
  'kotlin',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          keyword:
            'abstract as val var vararg get set class object open private protected public noinline crossinline dynamic final enum if else do while for when throw try catch finally import package is in fun override companion reified inline lateinit init interface annotation data sealed internal infix operator out by constructor super tailrec where const inner suspend typealias external expect actual',
          built_in:
            'Byte Short Char Int Long Boolean Float Double Void Unit Nothing',
          literal: 'true false null',
        },
        a = { className: 'symbol', begin: e.UNDERSCORE_IDENT_RE + '@' },
        i = {
          className: 'subst',
          begin: '\\${',
          end: '}',
          contains: [e.C_NUMBER_MODE],
        },
        s = { className: 'variable', begin: '\\$' + e.UNDERSCORE_IDENT_RE },
        t = {
          className: 'string',
          variants: [
            { begin: '"""', end: '"""(?=[^"])', contains: [s, i] },
            {
              begin: "'",
              end: "'",
              illegal: /\n/,
              contains: [e.BACKSLASH_ESCAPE],
            },
            {
              begin: '"',
              end: '"',
              illegal: /\n/,
              contains: [e.BACKSLASH_ESCAPE, s, i],
            },
          ],
        }
      i.contains.push(t)
      var r = {
          className: 'meta',
          begin:
            '@(?:file|property|field|get|set|receiver|param|setparam|delegate)\\s*:(?:\\s*' +
            e.UNDERSCORE_IDENT_RE +
            ')?',
        },
        l = {
          className: 'meta',
          begin: '@' + e.UNDERSCORE_IDENT_RE,
          contains: [
            {
              begin: /\(/,
              end: /\)/,
              contains: [e.inherit(t, { className: 'meta-string' })],
            },
          ],
        },
        c = e.COMMENT('/\\*', '\\*/', { contains: [e.C_BLOCK_COMMENT_MODE] }),
        o = {
          variants: [
            { className: 'type', begin: e.UNDERSCORE_IDENT_RE },
            { begin: /\(/, end: /\)/, contains: [] },
          ],
        },
        d = o
      return (
        (d.variants[1].contains = [o]),
        (o.variants[1].contains = [d]),
        {
          name: 'Kotlin',
          aliases: ['kt'],
          keywords: n,
          contains: [
            e.COMMENT('/\\*\\*', '\\*/', {
              relevance: 0,
              contains: [{ className: 'doctag', begin: '@[A-Za-z]+' }],
            }),
            e.C_LINE_COMMENT_MODE,
            c,
            {
              className: 'keyword',
              begin: /\b(break|continue|return|this)\b/,
              starts: { contains: [{ className: 'symbol', begin: /@\w+/ }] },
            },
            a,
            r,
            l,
            {
              className: 'function',
              beginKeywords: 'fun',
              end: '[(]|$',
              returnBegin: !0,
              excludeEnd: !0,
              keywords: n,
              illegal: /fun\s+(<.*>)?[^\s\(]+(\s+[^\s\(]+)\s*=/,
              relevance: 5,
              contains: [
                {
                  begin: e.UNDERSCORE_IDENT_RE + '\\s*\\(',
                  returnBegin: !0,
                  relevance: 0,
                  contains: [e.UNDERSCORE_TITLE_MODE],
                },
                {
                  className: 'type',
                  begin: /</,
                  end: />/,
                  keywords: 'reified',
                  relevance: 0,
                },
                {
                  className: 'params',
                  begin: /\(/,
                  end: /\)/,
                  endsParent: !0,
                  keywords: n,
                  relevance: 0,
                  contains: [
                    {
                      begin: /:/,
                      end: /[=,\/]/,
                      endsWithParent: !0,
                      contains: [o, e.C_LINE_COMMENT_MODE, c],
                      relevance: 0,
                    },
                    e.C_LINE_COMMENT_MODE,
                    c,
                    r,
                    l,
                    t,
                    e.C_NUMBER_MODE,
                  ],
                },
                c,
              ],
            },
            {
              className: 'class',
              beginKeywords: 'class interface trait',
              end: /[:\{(]|$/,
              excludeEnd: !0,
              illegal: 'extends implements',
              contains: [
                {
                  beginKeywords:
                    'public protected internal private constructor',
                },
                e.UNDERSCORE_TITLE_MODE,
                {
                  className: 'type',
                  begin: /</,
                  end: />/,
                  excludeBegin: !0,
                  excludeEnd: !0,
                  relevance: 0,
                },
                {
                  className: 'type',
                  begin: /[,:]\s*/,
                  end: /[<\(,]|$/,
                  excludeBegin: !0,
                  returnEnd: !0,
                },
                r,
                l,
              ],
            },
            t,
            {
              className: 'meta',
              begin: '^#!/usr/bin/env',
              end: '$',
              illegal: '\n',
            },
            {
              className: 'number',
              begin:
                '\\b(0[bB]([01]+[01_]+[01]+|[01]+)|0[xX]([a-fA-F0-9]+[a-fA-F0-9_]+[a-fA-F0-9]+|[a-fA-F0-9]+)|(([\\d]+[\\d_]+[\\d]+|[\\d]+)(\\.([\\d]+[\\d_]+[\\d]+|[\\d]+))?|\\.([\\d]+[\\d_]+[\\d]+|[\\d]+))([eE][-+]?\\d+)?)[lLfF]?',
              relevance: 0,
            },
          ],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'ini',
  (function () {
    'use strict'
    function e(e) {
      return e ? ('string' == typeof e ? e : e.source) : null
    }
    function n(...n) {
      return n.map((n) => e(n)).join('')
    }
    return function (a) {
      var s = {
          className: 'number',
          relevance: 0,
          variants: [
            { begin: /([\+\-]+)?[\d]+_[\d_]+/ },
            { begin: a.NUMBER_RE },
          ],
        },
        i = a.COMMENT()
      i.variants = [
        { begin: /;/, end: /$/ },
        { begin: /#/, end: /$/ },
      ]
      var t = {
          className: 'variable',
          variants: [{ begin: /\$[\w\d"][\w\d_]*/ }, { begin: /\$\{(.*?)}/ }],
        },
        r = { className: 'literal', begin: /\bon|off|true|false|yes|no\b/ },
        l = {
          className: 'string',
          contains: [a.BACKSLASH_ESCAPE],
          variants: [
            { begin: "'''", end: "'''", relevance: 10 },
            { begin: '"""', end: '"""', relevance: 10 },
            { begin: '"', end: '"' },
            { begin: "'", end: "'" },
          ],
        },
        c = {
          begin: /\[/,
          end: /\]/,
          contains: [i, r, t, l, s, 'self'],
          relevance: 0,
        },
        g =
          '(' +
          [/[A-Za-z0-9_-]+/, /"(\\"|[^"])*"/, /'[^']*'/]
            .map((n) => e(n))
            .join('|') +
          ')'
      return {
        name: 'TOML, also INI',
        aliases: ['toml'],
        case_insensitive: !0,
        illegal: /\S/,
        contains: [
          i,
          { className: 'section', begin: /\[+/, end: /\]+/ },
          {
            begin: n(
              g,
              '(\\s*\\.\\s*',
              g,
              ')*',
              n('(?=', /\s*=\s*[^#\s]/, ')')
            ),
            className: 'attr',
            starts: { end: /$/, contains: [i, c, r, t, l, s] },
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'r',
  (function () {
    'use strict'
    return function (e) {
      var n = '([a-zA-Z]|\\.[a-zA-Z.])[a-zA-Z0-9._]*'
      return {
        name: 'R',
        contains: [
          e.HASH_COMMENT_MODE,
          {
            begin: n,
            keywords: {
              $pattern: n,
              keyword:
                'function if in break next repeat else for return switch while try tryCatch stop warning require library attach detach source setMethod setGeneric setGroupGeneric setClass ...',
              literal:
                'NULL NA TRUE FALSE T F Inf NaN NA_integer_|10 NA_real_|10 NA_character_|10 NA_complex_|10',
            },
            relevance: 0,
          },
          {
            className: 'number',
            begin: '0[xX][0-9a-fA-F]+[Li]?\\b',
            relevance: 0,
          },
          {
            className: 'number',
            begin: '\\d+(?:[eE][+\\-]?\\d*)?L\\b',
            relevance: 0,
          },
          {
            className: 'number',
            begin: '\\d+\\.(?!\\d)(?:i\\b)?',
            relevance: 0,
          },
          {
            className: 'number',
            begin: '\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d*)?i?\\b',
            relevance: 0,
          },
          {
            className: 'number',
            begin: '\\.\\d+(?:[eE][+\\-]?\\d*)?i?\\b',
            relevance: 0,
          },
          { begin: '`', end: '`', relevance: 0 },
          {
            className: 'string',
            contains: [e.BACKSLASH_ESCAPE],
            variants: [
              { begin: '"', end: '"' },
              { begin: "'", end: "'" },
            ],
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'xml',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          className: 'symbol',
          begin: '&[a-z]+;|&#[0-9]+;|&#x[a-f0-9]+;',
        },
        a = {
          begin: '\\s',
          contains: [
            {
              className: 'meta-keyword',
              begin: '#?[a-z_][a-z1-9_-]+',
              illegal: '\\n',
            },
          ],
        },
        s = e.inherit(a, { begin: '\\(', end: '\\)' }),
        t = e.inherit(e.APOS_STRING_MODE, { className: 'meta-string' }),
        i = e.inherit(e.QUOTE_STRING_MODE, { className: 'meta-string' }),
        c = {
          endsWithParent: !0,
          illegal: /</,
          relevance: 0,
          contains: [
            { className: 'attr', begin: '[A-Za-z0-9\\._:-]+', relevance: 0 },
            {
              begin: /=\s*/,
              relevance: 0,
              contains: [
                {
                  className: 'string',
                  endsParent: !0,
                  variants: [
                    { begin: /"/, end: /"/, contains: [n] },
                    { begin: /'/, end: /'/, contains: [n] },
                    { begin: /[^\s"'=<>`]+/ },
                  ],
                },
              ],
            },
          ],
        }
      return {
        name: 'HTML, XML',
        aliases: [
          'html',
          'xhtml',
          'rss',
          'atom',
          'xjb',
          'xsd',
          'xsl',
          'plist',
          'wsf',
          'svg',
        ],
        case_insensitive: !0,
        contains: [
          {
            className: 'meta',
            begin: '<![a-z]',
            end: '>',
            relevance: 10,
            contains: [
              a,
              i,
              t,
              s,
              {
                begin: '\\[',
                end: '\\]',
                contains: [
                  {
                    className: 'meta',
                    begin: '<![a-z]',
                    end: '>',
                    contains: [a, s, i, t],
                  },
                ],
              },
            ],
          },
          e.COMMENT('\x3c!--', '--\x3e', { relevance: 10 }),
          { begin: '<\\!\\[CDATA\\[', end: '\\]\\]>', relevance: 10 },
          n,
          { className: 'meta', begin: /<\?xml/, end: /\?>/, relevance: 10 },
          {
            className: 'tag',
            begin: '<style(?=\\s|>)',
            end: '>',
            keywords: { name: 'style' },
            contains: [c],
            starts: {
              end: '</style>',
              returnEnd: !0,
              subLanguage: ['css', 'xml'],
            },
          },
          {
            className: 'tag',
            begin: '<script(?=\\s|>)',
            end: '>',
            keywords: { name: 'script' },
            contains: [c],
            starts: {
              end: '</script>',
              returnEnd: !0,
              subLanguage: ['javascript', 'handlebars', 'xml'],
            },
          },
          {
            className: 'tag',
            begin: '</?',
            end: '/?>',
            contains: [
              { className: 'name', begin: /[^\/><\s]+/, relevance: 0 },
              c,
            ],
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'php',
  (function () {
    'use strict'
    return function (e) {
      var r = { begin: '\\$+[a-zA-Z_-ÿ][a-zA-Z0-9_-ÿ]*' },
        t = {
          className: 'meta',
          variants: [
            { begin: /<\?php/, relevance: 10 },
            { begin: /<\?[=]?/ },
            { begin: /\?>/ },
          ],
        },
        a = {
          className: 'subst',
          variants: [{ begin: /\$\w+/ }, { begin: /\{\$/, end: /\}/ }],
        },
        n = e.inherit(e.APOS_STRING_MODE, { illegal: null }),
        i = e.inherit(e.QUOTE_STRING_MODE, {
          illegal: null,
          contains: e.QUOTE_STRING_MODE.contains.concat(a),
        }),
        o = e.END_SAME_AS_BEGIN({
          begin: /<<<[ \t]*(\w+)\n/,
          end: /[ \t]*(\w+)\b/,
          contains: e.QUOTE_STRING_MODE.contains.concat(a),
        }),
        l = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE, t],
          variants: [
            e.inherit(n, { begin: "b'", end: "'" }),
            e.inherit(i, { begin: 'b"', end: '"' }),
            i,
            n,
            o,
          ],
        },
        s = { variants: [e.BINARY_NUMBER_MODE, e.C_NUMBER_MODE] },
        c = {
          keyword:
            '__CLASS__ __DIR__ __FILE__ __FUNCTION__ __LINE__ __METHOD__ __NAMESPACE__ __TRAIT__ die echo exit include include_once print require require_once array abstract and as binary bool boolean break callable case catch class clone const continue declare default do double else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval extends final finally float for foreach from global goto if implements instanceof insteadof int integer interface isset iterable list new object or private protected public real return string switch throw trait try unset use var void while xor yield',
          literal: 'false null true',
          built_in:
            'Error|0 AppendIterator ArgumentCountError ArithmeticError ArrayIterator ArrayObject AssertionError BadFunctionCallException BadMethodCallException CachingIterator CallbackFilterIterator CompileError Countable DirectoryIterator DivisionByZeroError DomainException EmptyIterator ErrorException Exception FilesystemIterator FilterIterator GlobIterator InfiniteIterator InvalidArgumentException IteratorIterator LengthException LimitIterator LogicException MultipleIterator NoRewindIterator OutOfBoundsException OutOfRangeException OuterIterator OverflowException ParentIterator ParseError RangeException RecursiveArrayIterator RecursiveCachingIterator RecursiveCallbackFilterIterator RecursiveDirectoryIterator RecursiveFilterIterator RecursiveIterator RecursiveIteratorIterator RecursiveRegexIterator RecursiveTreeIterator RegexIterator RuntimeException SeekableIterator SplDoublyLinkedList SplFileInfo SplFileObject SplFixedArray SplHeap SplMaxHeap SplMinHeap SplObjectStorage SplObserver SplObserver SplPriorityQueue SplQueue SplStack SplSubject SplSubject SplTempFileObject TypeError UnderflowException UnexpectedValueException ArrayAccess Closure Generator Iterator IteratorAggregate Serializable Throwable Traversable WeakReference Directory __PHP_Incomplete_Class parent php_user_filter self static stdClass',
        }
      return {
        aliases: ['php', 'php3', 'php4', 'php5', 'php6', 'php7'],
        case_insensitive: !0,
        keywords: c,
        contains: [
          e.HASH_COMMENT_MODE,
          e.COMMENT('//', '$', { contains: [t] }),
          e.COMMENT('/\\*', '\\*/', {
            contains: [{ className: 'doctag', begin: '@[A-Za-z]+' }],
          }),
          e.COMMENT('__halt_compiler.+?;', !1, {
            endsWithParent: !0,
            keywords: '__halt_compiler',
          }),
          t,
          { className: 'keyword', begin: /\$this\b/ },
          r,
          { begin: /(::|->)+[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/ },
          {
            className: 'function',
            beginKeywords: 'fn function',
            end: /[;{]/,
            excludeEnd: !0,
            illegal: '[$%\\[]',
            contains: [
              e.UNDERSCORE_TITLE_MODE,
              {
                className: 'params',
                begin: '\\(',
                end: '\\)',
                excludeBegin: !0,
                excludeEnd: !0,
                keywords: c,
                contains: ['self', r, e.C_BLOCK_COMMENT_MODE, l, s],
              },
            ],
          },
          {
            className: 'class',
            beginKeywords: 'class interface',
            end: '{',
            excludeEnd: !0,
            illegal: /[:\(\$"]/,
            contains: [
              { beginKeywords: 'extends implements' },
              e.UNDERSCORE_TITLE_MODE,
            ],
          },
          {
            beginKeywords: 'namespace',
            end: ';',
            illegal: /[\.']/,
            contains: [e.UNDERSCORE_TITLE_MODE],
          },
          {
            beginKeywords: 'use',
            end: ';',
            contains: [e.UNDERSCORE_TITLE_MODE],
          },
          { begin: '=>' },
          l,
          s,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'php-template',
  (function () {
    'use strict'
    return function (n) {
      return {
        name: 'PHP template',
        subLanguage: 'xml',
        contains: [
          {
            begin: /<\?(php|=)?/,
            end: /\?>/,
            subLanguage: 'php',
            contains: [
              { begin: '/\\*', end: '\\*/', skip: !0 },
              { begin: 'b"', end: '"', skip: !0 },
              { begin: "b'", end: "'", skip: !0 },
              n.inherit(n.APOS_STRING_MODE, {
                illegal: null,
                className: null,
                contains: null,
                skip: !0,
              }),
              n.inherit(n.QUOTE_STRING_MODE, {
                illegal: null,
                className: null,
                contains: null,
                skip: !0,
              }),
            ],
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'bash',
  (function () {
    'use strict'
    return function (e) {
      const s = {}
      Object.assign(s, {
        className: 'variable',
        variants: [
          { begin: /\$[\w\d#@][\w\d_]*/ },
          {
            begin: /\$\{/,
            end: /\}/,
            contains: [{ begin: /:-/, contains: [s] }],
          },
        ],
      })
      const t = {
          className: 'subst',
          begin: /\$\(/,
          end: /\)/,
          contains: [e.BACKSLASH_ESCAPE],
        },
        n = {
          className: 'string',
          begin: /"/,
          end: /"/,
          contains: [e.BACKSLASH_ESCAPE, s, t],
        }
      t.contains.push(n)
      const a = {
          begin: /\$\(\(/,
          end: /\)\)/,
          contains: [
            { begin: /\d+#[0-9a-f]+/, className: 'number' },
            e.NUMBER_MODE,
            s,
          ],
        },
        i = e.SHEBANG({
          binary: '(fish|bash|zsh|sh|csh|ksh|tcsh|dash|scsh)',
          relevance: 10,
        }),
        c = {
          className: 'function',
          begin: /\w[\w\d_]*\s*\(\s*\)\s*\{/,
          returnBegin: !0,
          contains: [e.inherit(e.TITLE_MODE, { begin: /\w[\w\d_]*/ })],
          relevance: 0,
        }
      return {
        name: 'Bash',
        aliases: ['sh', 'zsh'],
        keywords: {
          $pattern: /\b-?[a-z\._-]+\b/,
          keyword:
            'if then else elif fi for while in do done case esac function',
          literal: 'true false',
          built_in:
            'break cd continue eval exec exit export getopts hash pwd readonly return shift test times trap umask unset alias bind builtin caller command declare echo enable help let local logout mapfile printf read readarray source type typeset ulimit unalias set shopt autoload bg bindkey bye cap chdir clone comparguments compcall compctl compdescribe compfiles compgroups compquote comptags comptry compvalues dirs disable disown echotc echoti emulate fc fg float functions getcap getln history integer jobs kill limit log noglob popd print pushd pushln rehash sched setcap setopt stat suspend ttyctl unfunction unhash unlimit unsetopt vared wait whence where which zcompile zformat zftp zle zmodload zparseopts zprof zpty zregexparse zsocket zstyle ztcp',
          _: '-ne -eq -lt -gt -f -d -e -s -l -a',
        },
        contains: [
          i,
          e.SHEBANG(),
          c,
          a,
          e.HASH_COMMENT_MODE,
          n,
          { className: '', begin: /\\"/ },
          { className: 'string', begin: /'/, end: /'/ },
          s,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'go',
  (function () {
    'use strict'
    return function (e) {
      var n = {
        keyword:
          'break default func interface select case map struct chan else goto package switch const fallthrough if range type continue for import return var go defer bool byte complex64 complex128 float32 float64 int8 int16 int32 int64 string uint8 uint16 uint32 uint64 int uint uintptr rune',
        literal: 'true false iota nil',
        built_in:
          'append cap close complex copy imag len make new panic print println real recover delete',
      }
      return {
        name: 'Go',
        aliases: ['golang'],
        keywords: n,
        illegal: '</',
        contains: [
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          {
            className: 'string',
            variants: [
              e.QUOTE_STRING_MODE,
              e.APOS_STRING_MODE,
              { begin: '`', end: '`' },
            ],
          },
          {
            className: 'number',
            variants: [
              { begin: e.C_NUMBER_RE + '[i]', relevance: 1 },
              e.C_NUMBER_MODE,
            ],
          },
          { begin: /:=/ },
          {
            className: 'function',
            beginKeywords: 'func',
            end: '\\s*(\\{|$)',
            excludeEnd: !0,
            contains: [
              e.TITLE_MODE,
              {
                className: 'params',
                begin: /\(/,
                end: /\)/,
                keywords: n,
                illegal: /["']/,
              },
            ],
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'cpp',
  (function () {
    'use strict'
    return function (e) {
      var i = e.requireLanguage('c-like').rawDefinition()
      return (
        (i.disableAutodetect = !1),
        (i.name = 'C++'),
        (i.aliases = ['cc', 'c++', 'h++', 'hpp', 'hh', 'hxx', 'cxx']),
        i
      )
    }
  })()
)
hljs.registerLanguage(
  'perl',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          $pattern: /[\w.]+/,
          keyword:
            'getpwent getservent quotemeta msgrcv scalar kill dbmclose undef lc ma syswrite tr send umask sysopen shmwrite vec qx utime local oct semctl localtime readpipe do return format read sprintf dbmopen pop getpgrp not getpwnam rewinddir qq fileno qw endprotoent wait sethostent bless s|0 opendir continue each sleep endgrent shutdown dump chomp connect getsockname die socketpair close flock exists index shmget sub for endpwent redo lstat msgctl setpgrp abs exit select print ref gethostbyaddr unshift fcntl syscall goto getnetbyaddr join gmtime symlink semget splice x|0 getpeername recv log setsockopt cos last reverse gethostbyname getgrnam study formline endhostent times chop length gethostent getnetent pack getprotoent getservbyname rand mkdir pos chmod y|0 substr endnetent printf next open msgsnd readdir use unlink getsockopt getpriority rindex wantarray hex system getservbyport endservent int chr untie rmdir prototype tell listen fork shmread ucfirst setprotoent else sysseek link getgrgid shmctl waitpid unpack getnetbyname reset chdir grep split require caller lcfirst until warn while values shift telldir getpwuid my getprotobynumber delete and sort uc defined srand accept package seekdir getprotobyname semop our rename seek if q|0 chroot sysread setpwent no crypt getc chown sqrt write setnetent setpriority foreach tie sin msgget map stat getlogin unless elsif truncate exec keys glob tied closedir ioctl socket readlink eval xor readline binmode setservent eof ord bind alarm pipe atan2 getgrent exp time push setgrent gt lt or ne m|0 break given say state when',
        },
        t = { className: 'subst', begin: '[$@]\\{', end: '\\}', keywords: n },
        s = { begin: '->{', end: '}' },
        r = {
          variants: [
            { begin: /\$\d/ },
            { begin: /[\$%@](\^\w\b|#\w+(::\w+)*|{\w+}|\w+(::\w*)*)/ },
            { begin: /[\$%@][^\s\w{]/, relevance: 0 },
          ],
        },
        i = [e.BACKSLASH_ESCAPE, t, r],
        a = [
          r,
          e.HASH_COMMENT_MODE,
          e.COMMENT('^\\=\\w', '\\=cut', { endsWithParent: !0 }),
          s,
          {
            className: 'string',
            contains: i,
            variants: [
              { begin: 'q[qwxr]?\\s*\\(', end: '\\)', relevance: 5 },
              { begin: 'q[qwxr]?\\s*\\[', end: '\\]', relevance: 5 },
              { begin: 'q[qwxr]?\\s*\\{', end: '\\}', relevance: 5 },
              { begin: 'q[qwxr]?\\s*\\|', end: '\\|', relevance: 5 },
              { begin: 'q[qwxr]?\\s*\\<', end: '\\>', relevance: 5 },
              { begin: 'qw\\s+q', end: 'q', relevance: 5 },
              { begin: "'", end: "'", contains: [e.BACKSLASH_ESCAPE] },
              { begin: '"', end: '"' },
              { begin: '`', end: '`', contains: [e.BACKSLASH_ESCAPE] },
              { begin: '{\\w+}', contains: [], relevance: 0 },
              { begin: '-?\\w+\\s*\\=\\>', contains: [], relevance: 0 },
            ],
          },
          {
            className: 'number',
            begin:
              '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b',
            relevance: 0,
          },
          {
            begin:
              '(\\/\\/|' +
              e.RE_STARTERS_RE +
              '|\\b(split|return|print|reverse|grep)\\b)\\s*',
            keywords: 'split return print reverse grep',
            relevance: 0,
            contains: [
              e.HASH_COMMENT_MODE,
              {
                className: 'regexp',
                begin: '(s|tr|y)/(\\\\.|[^/])*/(\\\\.|[^/])*/[a-z]*',
                relevance: 10,
              },
              {
                className: 'regexp',
                begin: '(m|qr)?/',
                end: '/[a-z]*',
                contains: [e.BACKSLASH_ESCAPE],
                relevance: 0,
              },
            ],
          },
          {
            className: 'function',
            beginKeywords: 'sub',
            end: '(\\s*\\(.*?\\))?[;{]',
            excludeEnd: !0,
            relevance: 5,
            contains: [e.TITLE_MODE],
          },
          { begin: '-\\w\\b', relevance: 0 },
          {
            begin: '^__DATA__$',
            end: '^__END__$',
            subLanguage: 'mojolicious',
            contains: [{ begin: '^@@.*', end: '$', className: 'comment' }],
          },
        ]
      return (
        (t.contains = a),
        (s.contains = a),
        { name: 'Perl', aliases: ['pl', 'pm'], keywords: n, contains: a }
      )
    }
  })()
)
hljs.registerLanguage(
  'markdown',
  (function () {
    'use strict'
    return function (n) {
      const e = { begin: '<', end: '>', subLanguage: 'xml', relevance: 0 },
        a = {
          begin: '\\[.+?\\][\\(\\[].*?[\\)\\]]',
          returnBegin: !0,
          contains: [
            {
              className: 'string',
              begin: '\\[',
              end: '\\]',
              excludeBegin: !0,
              returnEnd: !0,
              relevance: 0,
            },
            {
              className: 'link',
              begin: '\\]\\(',
              end: '\\)',
              excludeBegin: !0,
              excludeEnd: !0,
            },
            {
              className: 'symbol',
              begin: '\\]\\[',
              end: '\\]',
              excludeBegin: !0,
              excludeEnd: !0,
            },
          ],
          relevance: 10,
        },
        i = {
          className: 'strong',
          contains: [],
          variants: [
            { begin: /_{2}/, end: /_{2}/ },
            { begin: /\*{2}/, end: /\*{2}/ },
          ],
        },
        s = {
          className: 'emphasis',
          contains: [],
          variants: [
            { begin: /\*(?!\*)/, end: /\*/ },
            { begin: /_(?!_)/, end: /_/, relevance: 0 },
          ],
        }
      i.contains.push(s), s.contains.push(i)
      var c = [e, a]
      return (
        (i.contains = i.contains.concat(c)),
        (s.contains = s.contains.concat(c)),
        {
          name: 'Markdown',
          aliases: ['md', 'mkdown', 'mkd'],
          contains: [
            {
              className: 'section',
              variants: [
                { begin: '^#{1,6}', end: '$', contains: (c = c.concat(i, s)) },
                {
                  begin: '(?=^.+?\\n[=-]{2,}$)',
                  contains: [
                    { begin: '^[=-]*$' },
                    { begin: '^', end: '\\n', contains: c },
                  ],
                },
              ],
            },
            e,
            {
              className: 'bullet',
              begin: '^[ \t]*([*+-]|(\\d+\\.))(?=\\s+)',
              end: '\\s+',
              excludeEnd: !0,
            },
            i,
            s,
            { className: 'quote', begin: '^>\\s+', contains: c, end: '$' },
            {
              className: 'code',
              variants: [
                { begin: '(`{3,})(.|\\n)*?\\1`*[ ]*' },
                { begin: '(~{3,})(.|\\n)*?\\1~*[ ]*' },
                { begin: '```', end: '```+[ ]*$' },
                { begin: '~~~', end: '~~~+[ ]*$' },
                { begin: '`.+?`' },
                {
                  begin: '(?=^( {4}|\\t))',
                  contains: [{ begin: '^( {4}|\\t)', end: '(\\n)$' }],
                  relevance: 0,
                },
              ],
            },
            { begin: '^[-\\*]{3,}', end: '$' },
            a,
            {
              begin: /^\[[^\n]+\]:/,
              returnBegin: !0,
              contains: [
                {
                  className: 'symbol',
                  begin: /\[/,
                  end: /\]/,
                  excludeBegin: !0,
                  excludeEnd: !0,
                },
                {
                  className: 'link',
                  begin: /:\s*/,
                  end: /$/,
                  excludeBegin: !0,
                },
              ],
            },
          ],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'makefile',
  (function () {
    'use strict'
    return function (e) {
      var i = {
          className: 'variable',
          variants: [
            {
              begin: '\\$\\(' + e.UNDERSCORE_IDENT_RE + '\\)',
              contains: [e.BACKSLASH_ESCAPE],
            },
            { begin: /\$[@%<?\^\+\*]/ },
          ],
        },
        n = {
          className: 'string',
          begin: /"/,
          end: /"/,
          contains: [e.BACKSLASH_ESCAPE, i],
        },
        a = {
          className: 'variable',
          begin: /\$\([\w-]+\s/,
          end: /\)/,
          keywords: {
            built_in:
              'subst patsubst strip findstring filter filter-out sort word wordlist firstword lastword dir notdir suffix basename addsuffix addprefix join wildcard realpath abspath error warning shell origin flavor foreach if or and call eval file value',
          },
          contains: [i],
        },
        r = { begin: '^' + e.UNDERSCORE_IDENT_RE + '\\s*(?=[:+?]?=)' },
        s = { className: 'section', begin: /^[^\s]+:/, end: /$/, contains: [i] }
      return {
        name: 'Makefile',
        aliases: ['mk', 'mak'],
        keywords: {
          $pattern: /[\w-]+/,
          keyword:
            'define endef undefine ifdef ifndef ifeq ifneq else endif include -include sinclude override export unexport private vpath',
        },
        contains: [
          e.HASH_COMMENT_MODE,
          i,
          n,
          a,
          r,
          {
            className: 'meta',
            begin: /^\.PHONY:/,
            end: /$/,
            keywords: { $pattern: /[\.\w]+/, 'meta-keyword': '.PHONY' },
          },
          s,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'dart',
  (function () {
    'use strict'
    return function (e) {
      const n = {
          className: 'subst',
          variants: [{ begin: '\\$[A-Za-z0-9_]+' }],
        },
        t = {
          className: 'subst',
          variants: [{ begin: '\\${', end: '}' }],
          keywords: 'true false null this is new super',
        },
        a = {
          className: 'string',
          variants: [
            { begin: "r'''", end: "'''" },
            { begin: 'r"""', end: '"""' },
            { begin: "r'", end: "'", illegal: '\\n' },
            { begin: 'r"', end: '"', illegal: '\\n' },
            { begin: "'''", end: "'''", contains: [e.BACKSLASH_ESCAPE, n, t] },
            { begin: '"""', end: '"""', contains: [e.BACKSLASH_ESCAPE, n, t] },
            {
              begin: "'",
              end: "'",
              illegal: '\\n',
              contains: [e.BACKSLASH_ESCAPE, n, t],
            },
            {
              begin: '"',
              end: '"',
              illegal: '\\n',
              contains: [e.BACKSLASH_ESCAPE, n, t],
            },
          ],
        }
      t.contains = [e.C_NUMBER_MODE, a]
      const i = [
          'Comparable',
          'DateTime',
          'Duration',
          'Function',
          'Iterable',
          'Iterator',
          'List',
          'Map',
          'Match',
          'Object',
          'Pattern',
          'RegExp',
          'Set',
          'Stopwatch',
          'String',
          'StringBuffer',
          'StringSink',
          'Symbol',
          'Type',
          'Uri',
          'bool',
          'double',
          'int',
          'num',
          'Element',
          'ElementList',
        ],
        r = i.map((e) => `${e}?`)
      return {
        name: 'Dart',
        keywords: {
          keyword:
            'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in inferface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield',
          built_in: i
            .concat(r)
            .concat([
              'Never',
              'Null',
              'dynamic',
              'print',
              'document',
              'querySelector',
              'querySelectorAll',
              'window',
            ])
            .join(' '),
          $pattern: /[A-Za-z][A-Za-z0-9_]*\??/,
        },
        contains: [
          a,
          e.COMMENT('/\\*\\*', '\\*/', {
            subLanguage: 'markdown',
            relevance: 0,
          }),
          e.COMMENT('///+\\s*', '$', {
            contains: [
              { subLanguage: 'markdown', begin: '.', end: '$', relevance: 0 },
            ],
          }),
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          {
            className: 'class',
            beginKeywords: 'class interface',
            end: '{',
            excludeEnd: !0,
            contains: [
              { beginKeywords: 'extends implements' },
              e.UNDERSCORE_TITLE_MODE,
            ],
          },
          e.C_NUMBER_MODE,
          { className: 'meta', begin: '@[A-Za-z]+' },
          { begin: '=>' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'json',
  (function () {
    'use strict'
    return function (n) {
      var e = { literal: 'true false null' },
        i = [n.C_LINE_COMMENT_MODE, n.C_BLOCK_COMMENT_MODE],
        t = [n.QUOTE_STRING_MODE, n.C_NUMBER_MODE],
        a = {
          end: ',',
          endsWithParent: !0,
          excludeEnd: !0,
          contains: t,
          keywords: e,
        },
        l = {
          begin: '{',
          end: '}',
          contains: [
            {
              className: 'attr',
              begin: /"/,
              end: /"/,
              contains: [n.BACKSLASH_ESCAPE],
              illegal: '\\n',
            },
            n.inherit(a, { begin: /:/ }),
          ].concat(i),
          illegal: '\\S',
        },
        s = {
          begin: '\\[',
          end: '\\]',
          contains: [n.inherit(a)],
          illegal: '\\S',
        }
      return (
        t.push(l, s),
        i.forEach(function (n) {
          t.push(n)
        }),
        { name: 'JSON', contains: t, keywords: e, illegal: '\\S' }
      )
    }
  })()
)
hljs.registerLanguage(
  'css',
  (function () {
    'use strict'
    return function (e) {
      var n = {
        begin: /(?:[A-Z\_\.\-]+|--[a-zA-Z0-9_-]+)\s*:/,
        returnBegin: !0,
        end: ';',
        endsWithParent: !0,
        contains: [
          {
            className: 'attribute',
            begin: /\S/,
            end: ':',
            excludeEnd: !0,
            starts: {
              endsWithParent: !0,
              excludeEnd: !0,
              contains: [
                {
                  begin: /[\w-]+\(/,
                  returnBegin: !0,
                  contains: [
                    { className: 'built_in', begin: /[\w-]+/ },
                    {
                      begin: /\(/,
                      end: /\)/,
                      contains: [
                        e.APOS_STRING_MODE,
                        e.QUOTE_STRING_MODE,
                        e.CSS_NUMBER_MODE,
                      ],
                    },
                  ],
                },
                e.CSS_NUMBER_MODE,
                e.QUOTE_STRING_MODE,
                e.APOS_STRING_MODE,
                e.C_BLOCK_COMMENT_MODE,
                { className: 'number', begin: '#[0-9A-Fa-f]+' },
                { className: 'meta', begin: '!important' },
              ],
            },
          },
        ],
      }
      return {
        name: 'CSS',
        case_insensitive: !0,
        illegal: /[=\/|'\$]/,
        contains: [
          e.C_BLOCK_COMMENT_MODE,
          { className: 'selector-id', begin: /#[A-Za-z0-9_-]+/ },
          { className: 'selector-class', begin: /\.[A-Za-z0-9_-]+/ },
          {
            className: 'selector-attr',
            begin: /\[/,
            end: /\]/,
            illegal: '$',
            contains: [e.APOS_STRING_MODE, e.QUOTE_STRING_MODE],
          },
          {
            className: 'selector-pseudo',
            begin: /:(:)?[a-zA-Z0-9\_\-\+\(\)"'.]+/,
          },
          {
            begin: '@(page|font-face)',
            lexemes: '@[a-z-]+',
            keywords: '@page @font-face',
          },
          {
            begin: '@',
            end: '[{;]',
            illegal: /:/,
            returnBegin: !0,
            contains: [
              { className: 'keyword', begin: /@\-?\w[\w]*(\-\w+)*/ },
              {
                begin: /\s/,
                endsWithParent: !0,
                excludeEnd: !0,
                relevance: 0,
                keywords: 'and or not only',
                contains: [
                  { begin: /[a-z-]+:/, className: 'attribute' },
                  e.APOS_STRING_MODE,
                  e.QUOTE_STRING_MODE,
                  e.CSS_NUMBER_MODE,
                ],
              },
            ],
          },
          {
            className: 'selector-tag',
            begin: '[a-zA-Z-][a-zA-Z0-9_-]*',
            relevance: 0,
          },
          {
            begin: '{',
            end: '}',
            illegal: /\S/,
            contains: [e.C_BLOCK_COMMENT_MODE, n],
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'diff',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'Diff',
        aliases: ['patch'],
        contains: [
          {
            className: 'meta',
            relevance: 10,
            variants: [
              { begin: /^@@ +\-\d+,\d+ +\+\d+,\d+ +@@$/ },
              { begin: /^\*\*\* +\d+,\d+ +\*\*\*\*$/ },
              { begin: /^\-\-\- +\d+,\d+ +\-\-\-\-$/ },
            ],
          },
          {
            className: 'comment',
            variants: [
              { begin: /Index: /, end: /$/ },
              { begin: /={3,}/, end: /$/ },
              { begin: /^\-{3}/, end: /$/ },
              { begin: /^\*{3} /, end: /$/ },
              { begin: /^\+{3}/, end: /$/ },
              { begin: /^\*{15}$/ },
            ],
          },
          { className: 'addition', begin: '^\\+', end: '$' },
          { className: 'deletion', begin: '^\\-', end: '$' },
          { className: 'addition', begin: '^\\!', end: '$' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'http',
  (function () {
    'use strict'
    return function (e) {
      var n = 'HTTP/[0-9\\.]+'
      return {
        name: 'HTTP',
        aliases: ['https'],
        illegal: '\\S',
        contains: [
          {
            begin: '^' + n,
            end: '$',
            contains: [{ className: 'number', begin: '\\b\\d{3}\\b' }],
          },
          {
            begin: '^[A-Z]+ (.*?) ' + n + '$',
            returnBegin: !0,
            end: '$',
            contains: [
              {
                className: 'string',
                begin: ' ',
                end: ' ',
                excludeBegin: !0,
                excludeEnd: !0,
              },
              { begin: n },
              { className: 'keyword', begin: '[A-Z]+' },
            ],
          },
          {
            className: 'attribute',
            begin: '^\\w',
            end: ': ',
            excludeEnd: !0,
            illegal: '\\n|\\s|=',
            starts: { end: '$', relevance: 0 },
          },
          { begin: '\\n\\n', starts: { subLanguage: [], endsWithParent: !0 } },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'objectivec',
  (function () {
    'use strict'
    return function (e) {
      var n = /[a-zA-Z@][a-zA-Z0-9_]*/,
        _ = {
          $pattern: n,
          keyword: '@interface @class @protocol @implementation',
        }
      return {
        name: 'Objective-C',
        aliases: ['mm', 'objc', 'obj-c'],
        keywords: {
          $pattern: n,
          keyword:
            'int float while char export sizeof typedef const struct for union unsigned long volatile static bool mutable if do return goto void enum else break extern asm case short default double register explicit signed typename this switch continue wchar_t inline readonly assign readwrite self @synchronized id typeof nonatomic super unichar IBOutlet IBAction strong weak copy in out inout bycopy byref oneway __strong __weak __block __autoreleasing @private @protected @public @try @property @end @throw @catch @finally @autoreleasepool @synthesize @dynamic @selector @optional @required @encode @package @import @defs @compatibility_alias __bridge __bridge_transfer __bridge_retained __bridge_retain __covariant __contravariant __kindof _Nonnull _Nullable _Null_unspecified __FUNCTION__ __PRETTY_FUNCTION__ __attribute__ getter setter retain unsafe_unretained nonnull nullable null_unspecified null_resettable class instancetype NS_DESIGNATED_INITIALIZER NS_UNAVAILABLE NS_REQUIRES_SUPER NS_RETURNS_INNER_POINTER NS_INLINE NS_AVAILABLE NS_DEPRECATED NS_ENUM NS_OPTIONS NS_SWIFT_UNAVAILABLE NS_ASSUME_NONNULL_BEGIN NS_ASSUME_NONNULL_END NS_REFINED_FOR_SWIFT NS_SWIFT_NAME NS_SWIFT_NOTHROW NS_DURING NS_HANDLER NS_ENDHANDLER NS_VALUERETURN NS_VOIDRETURN',
          literal: 'false true FALSE TRUE nil YES NO NULL',
          built_in:
            'BOOL dispatch_once_t dispatch_queue_t dispatch_sync dispatch_async dispatch_once',
        },
        illegal: '</',
        contains: [
          {
            className: 'built_in',
            begin:
              '\\b(AV|CA|CF|CG|CI|CL|CM|CN|CT|MK|MP|MTK|MTL|NS|SCN|SK|UI|WK|XC)\\w+',
          },
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          e.C_NUMBER_MODE,
          e.QUOTE_STRING_MODE,
          e.APOS_STRING_MODE,
          {
            className: 'string',
            variants: [
              {
                begin: '@"',
                end: '"',
                illegal: '\\n',
                contains: [e.BACKSLASH_ESCAPE],
              },
            ],
          },
          {
            className: 'meta',
            begin: /#\s*[a-z]+\b/,
            end: /$/,
            keywords: {
              'meta-keyword':
                'if else elif endif define undef warning error line pragma ifdef ifndef include',
            },
            contains: [
              { begin: /\\\n/, relevance: 0 },
              e.inherit(e.QUOTE_STRING_MODE, { className: 'meta-string' }),
              {
                className: 'meta-string',
                begin: /<.*?>/,
                end: /$/,
                illegal: '\\n',
              },
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
            ],
          },
          {
            className: 'class',
            begin: '(' + _.keyword.split(' ').join('|') + ')\\b',
            end: '({|$)',
            excludeEnd: !0,
            keywords: _,
            contains: [e.UNDERSCORE_TITLE_MODE],
          },
          { begin: '\\.' + e.UNDERSCORE_IDENT_RE, relevance: 0 },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'apache',
  (function () {
    'use strict'
    return function (e) {
      var n = {
        className: 'number',
        begin: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?',
      }
      return {
        name: 'Apache config',
        aliases: ['apacheconf'],
        case_insensitive: !0,
        contains: [
          e.HASH_COMMENT_MODE,
          {
            className: 'section',
            begin: '</?',
            end: '>',
            contains: [
              n,
              { className: 'number', begin: ':\\d{1,5}' },
              e.inherit(e.QUOTE_STRING_MODE, { relevance: 0 }),
            ],
          },
          {
            className: 'attribute',
            begin: /\w+/,
            relevance: 0,
            keywords: {
              nomarkup:
                'order deny allow setenv rewriterule rewriteengine rewritecond documentroot sethandler errordocument loadmodule options header listen serverroot servername',
            },
            starts: {
              end: /$/,
              relevance: 0,
              keywords: { literal: 'on off all deny allow' },
              contains: [
                { className: 'meta', begin: '\\s\\[', end: '\\]$' },
                {
                  className: 'variable',
                  begin: '[\\$%]\\{',
                  end: '\\}',
                  contains: [
                    'self',
                    { className: 'number', begin: '[\\$%]\\d+' },
                  ],
                },
                n,
                { className: 'number', begin: '\\d+' },
                e.QUOTE_STRING_MODE,
              ],
            },
          },
        ],
        illegal: /\S/,
      }
    }
  })()
)
hljs.registerLanguage(
  'coffeescript',
  (function () {
    'use strict'
    const e = [
        'as',
        'in',
        'of',
        'if',
        'for',
        'while',
        'finally',
        'var',
        'new',
        'function',
        'do',
        'return',
        'void',
        'else',
        'break',
        'catch',
        'instanceof',
        'with',
        'throw',
        'case',
        'default',
        'try',
        'switch',
        'continue',
        'typeof',
        'delete',
        'let',
        'yield',
        'const',
        'class',
        'debugger',
        'async',
        'await',
        'static',
        'import',
        'from',
        'export',
        'extends',
      ],
      n = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'],
      a = [].concat(
        [
          'setInterval',
          'setTimeout',
          'clearInterval',
          'clearTimeout',
          'require',
          'exports',
          'eval',
          'isFinite',
          'isNaN',
          'parseFloat',
          'parseInt',
          'decodeURI',
          'decodeURIComponent',
          'encodeURI',
          'encodeURIComponent',
          'escape',
          'unescape',
        ],
        [
          'arguments',
          'this',
          'super',
          'console',
          'window',
          'document',
          'localStorage',
          'module',
          'global',
        ],
        [
          'Intl',
          'DataView',
          'Number',
          'Math',
          'Date',
          'String',
          'RegExp',
          'Object',
          'Function',
          'Boolean',
          'Error',
          'Symbol',
          'Set',
          'Map',
          'WeakSet',
          'WeakMap',
          'Proxy',
          'Reflect',
          'JSON',
          'Promise',
          'Float64Array',
          'Int16Array',
          'Int32Array',
          'Int8Array',
          'Uint16Array',
          'Uint32Array',
          'Float32Array',
          'Array',
          'Uint8Array',
          'Uint8ClampedArray',
          'ArrayBuffer',
        ],
        [
          'EvalError',
          'InternalError',
          'RangeError',
          'ReferenceError',
          'SyntaxError',
          'TypeError',
          'URIError',
        ]
      )
    return function (r) {
      var t = {
          keyword: e
            .concat([
              'then',
              'unless',
              'until',
              'loop',
              'by',
              'when',
              'and',
              'or',
              'is',
              'isnt',
              'not',
            ])
            .filter(
              (
                (e) => (n) =>
                  !e.includes(n)
              )(['var', 'const', 'let', 'function', 'static'])
            )
            .join(' '),
          literal: n.concat(['yes', 'no', 'on', 'off']).join(' '),
          built_in: a.concat(['npm', 'print']).join(' '),
        },
        i = '[A-Za-z$_][0-9A-Za-z$_]*',
        s = { className: 'subst', begin: /#\{/, end: /}/, keywords: t },
        o = [
          r.BINARY_NUMBER_MODE,
          r.inherit(r.C_NUMBER_MODE, {
            starts: { end: '(\\s*/)?', relevance: 0 },
          }),
          {
            className: 'string',
            variants: [
              { begin: /'''/, end: /'''/, contains: [r.BACKSLASH_ESCAPE] },
              { begin: /'/, end: /'/, contains: [r.BACKSLASH_ESCAPE] },
              { begin: /"""/, end: /"""/, contains: [r.BACKSLASH_ESCAPE, s] },
              { begin: /"/, end: /"/, contains: [r.BACKSLASH_ESCAPE, s] },
            ],
          },
          {
            className: 'regexp',
            variants: [
              { begin: '///', end: '///', contains: [s, r.HASH_COMMENT_MODE] },
              { begin: '//[gim]{0,3}(?=\\W)', relevance: 0 },
              { begin: /\/(?![ *]).*?(?![\\]).\/[gim]{0,3}(?=\W)/ },
            ],
          },
          { begin: '@' + i },
          {
            subLanguage: 'javascript',
            excludeBegin: !0,
            excludeEnd: !0,
            variants: [
              { begin: '```', end: '```' },
              { begin: '`', end: '`' },
            ],
          },
        ]
      s.contains = o
      var c = r.inherit(r.TITLE_MODE, { begin: i }),
        l = {
          className: 'params',
          begin: '\\([^\\(]',
          returnBegin: !0,
          contains: [
            {
              begin: /\(/,
              end: /\)/,
              keywords: t,
              contains: ['self'].concat(o),
            },
          ],
        }
      return {
        name: 'CoffeeScript',
        aliases: ['coffee', 'cson', 'iced'],
        keywords: t,
        illegal: /\/\*/,
        contains: o.concat([
          r.COMMENT('###', '###'),
          r.HASH_COMMENT_MODE,
          {
            className: 'function',
            begin: '^\\s*' + i + '\\s*=\\s*(\\(.*\\))?\\s*\\B[-=]>',
            end: '[-=]>',
            returnBegin: !0,
            contains: [c, l],
          },
          {
            begin: /[:\(,=]\s*/,
            relevance: 0,
            contains: [
              {
                className: 'function',
                begin: '(\\(.*\\))?\\s*\\B[-=]>',
                end: '[-=]>',
                returnBegin: !0,
                contains: [l],
              },
            ],
          },
          {
            className: 'class',
            beginKeywords: 'class',
            end: '$',
            illegal: /[:="\[\]]/,
            contains: [
              {
                beginKeywords: 'extends',
                endsWithParent: !0,
                illegal: /[:="\[\]]/,
                contains: [c],
              },
              c,
            ],
          },
          {
            begin: i + ':',
            end: ':',
            returnBegin: !0,
            returnEnd: !0,
            relevance: 0,
          },
        ]),
      }
    }
  })()
)
hljs.registerLanguage(
  'ruby',
  (function () {
    'use strict'
    return function (e) {
      var n =
          '[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?',
        a = {
          keyword:
            'and then defined module in return redo if BEGIN retry end for self when next until do begin unless END rescue else break undef not super class case require yield alias while ensure elsif or include attr_reader attr_writer attr_accessor',
          literal: 'true false nil',
        },
        s = { className: 'doctag', begin: '@[A-Za-z]+' },
        i = { begin: '#<', end: '>' },
        r = [
          e.COMMENT('#', '$', { contains: [s] }),
          e.COMMENT('^\\=begin', '^\\=end', { contains: [s], relevance: 10 }),
          e.COMMENT('^__END__', '\\n$'),
        ],
        c = { className: 'subst', begin: '#\\{', end: '}', keywords: a },
        t = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE, c],
          variants: [
            { begin: /'/, end: /'/ },
            { begin: /"/, end: /"/ },
            { begin: /`/, end: /`/ },
            { begin: '%[qQwWx]?\\(', end: '\\)' },
            { begin: '%[qQwWx]?\\[', end: '\\]' },
            { begin: '%[qQwWx]?{', end: '}' },
            { begin: '%[qQwWx]?<', end: '>' },
            { begin: '%[qQwWx]?/', end: '/' },
            { begin: '%[qQwWx]?%', end: '%' },
            { begin: '%[qQwWx]?-', end: '-' },
            { begin: '%[qQwWx]?\\|', end: '\\|' },
            {
              begin:
                /\B\?(\\\d{1,3}|\\x[A-Fa-f0-9]{1,2}|\\u[A-Fa-f0-9]{4}|\\?\S)\b/,
            },
            {
              begin: /<<[-~]?'?(\w+)(?:.|\n)*?\n\s*\1\b/,
              returnBegin: !0,
              contains: [
                { begin: /<<[-~]?'?/ },
                e.END_SAME_AS_BEGIN({
                  begin: /(\w+)/,
                  end: /(\w+)/,
                  contains: [e.BACKSLASH_ESCAPE, c],
                }),
              ],
            },
          ],
        },
        b = {
          className: 'params',
          begin: '\\(',
          end: '\\)',
          endsParent: !0,
          keywords: a,
        },
        d = [
          t,
          i,
          {
            className: 'class',
            beginKeywords: 'class module',
            end: '$|;',
            illegal: /=/,
            contains: [
              e.inherit(e.TITLE_MODE, {
                begin: '[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?',
              }),
              {
                begin: '<\\s*',
                contains: [{ begin: '(' + e.IDENT_RE + '::)?' + e.IDENT_RE }],
              },
            ].concat(r),
          },
          {
            className: 'function',
            beginKeywords: 'def',
            end: '$|;',
            contains: [e.inherit(e.TITLE_MODE, { begin: n }), b].concat(r),
          },
          { begin: e.IDENT_RE + '::' },
          {
            className: 'symbol',
            begin: e.UNDERSCORE_IDENT_RE + '(\\!|\\?)?:',
            relevance: 0,
          },
          {
            className: 'symbol',
            begin: ':(?!\\s)',
            contains: [t, { begin: n }],
            relevance: 0,
          },
          {
            className: 'number',
            begin:
              '(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b',
            relevance: 0,
          },
          { begin: '(\\$\\W)|((\\$|\\@\\@?)(\\w+))' },
          { className: 'params', begin: /\|/, end: /\|/, keywords: a },
          {
            begin: '(' + e.RE_STARTERS_RE + '|unless)\\s*',
            keywords: 'unless',
            contains: [
              i,
              {
                className: 'regexp',
                contains: [e.BACKSLASH_ESCAPE, c],
                illegal: /\n/,
                variants: [
                  { begin: '/', end: '/[a-z]*' },
                  { begin: '%r{', end: '}[a-z]*' },
                  { begin: '%r\\(', end: '\\)[a-z]*' },
                  { begin: '%r!', end: '![a-z]*' },
                  { begin: '%r\\[', end: '\\][a-z]*' },
                ],
              },
            ].concat(r),
            relevance: 0,
          },
        ].concat(r)
      ;(c.contains = d), (b.contains = d)
      var g = [
        { begin: /^\s*=>/, starts: { end: '$', contains: d } },
        {
          className: 'meta',
          begin:
            '^([>?]>|[\\w#]+\\(\\w+\\):\\d+:\\d+>|(\\w+-)?\\d+\\.\\d+\\.\\d(p\\d+)?[^>]+>)',
          starts: { end: '$', contains: d },
        },
      ]
      return {
        name: 'Ruby',
        aliases: ['rb', 'gemspec', 'podspec', 'thor', 'irb'],
        keywords: a,
        illegal: /\/\*/,
        contains: r.concat(g).concat(d),
      }
    }
  })()
)
hljs.registerLanguage(
  'csharp',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          keyword:
            'abstract as base bool break byte case catch char checked const continue decimal default delegate do double enum event explicit extern finally fixed float for foreach goto if implicit in init int interface internal is lock long object operator out override params private protected public readonly ref sbyte sealed short sizeof stackalloc static string struct switch this try typeof uint ulong unchecked unsafe ushort using virtual void volatile while add alias ascending async await by descending dynamic equals from get global group into join let nameof on orderby partial remove select set value var when where yield',
          literal: 'null false true',
        },
        i = e.inherit(e.TITLE_MODE, { begin: '[a-zA-Z](\\.?\\w)*' }),
        a = {
          className: 'number',
          variants: [
            { begin: "\\b(0b[01']+)" },
            {
              begin:
                "(-?)\\b([\\d']+(\\.[\\d']*)?|\\.[\\d']+)(u|U|l|L|ul|UL|f|F|b|B)",
            },
            {
              begin:
                "(-?)(\\b0[xX][a-fA-F0-9']+|(\\b[\\d']+(\\.[\\d']*)?|\\.[\\d']+)([eE][-+]?[\\d']+)?)",
            },
          ],
          relevance: 0,
        },
        s = {
          className: 'string',
          begin: '@"',
          end: '"',
          contains: [{ begin: '""' }],
        },
        t = e.inherit(s, { illegal: /\n/ }),
        l = { className: 'subst', begin: '{', end: '}', keywords: n },
        r = e.inherit(l, { illegal: /\n/ }),
        c = {
          className: 'string',
          begin: /\$"/,
          end: '"',
          illegal: /\n/,
          contains: [{ begin: '{{' }, { begin: '}}' }, e.BACKSLASH_ESCAPE, r],
        },
        o = {
          className: 'string',
          begin: /\$@"/,
          end: '"',
          contains: [{ begin: '{{' }, { begin: '}}' }, { begin: '""' }, l],
        },
        g = e.inherit(o, {
          illegal: /\n/,
          contains: [{ begin: '{{' }, { begin: '}}' }, { begin: '""' }, r],
        })
      ;(l.contains = [
        o,
        c,
        s,
        e.APOS_STRING_MODE,
        e.QUOTE_STRING_MODE,
        a,
        e.C_BLOCK_COMMENT_MODE,
      ]),
        (r.contains = [
          g,
          c,
          t,
          e.APOS_STRING_MODE,
          e.QUOTE_STRING_MODE,
          a,
          e.inherit(e.C_BLOCK_COMMENT_MODE, { illegal: /\n/ }),
        ])
      var d = { variants: [o, c, s, e.APOS_STRING_MODE, e.QUOTE_STRING_MODE] },
        E = {
          begin: '<',
          end: '>',
          contains: [{ beginKeywords: 'in out' }, i],
        },
        _ =
          e.IDENT_RE +
          '(<' +
          e.IDENT_RE +
          '(\\s*,\\s*' +
          e.IDENT_RE +
          ')*>)?(\\[\\])?',
        b = { begin: '@' + e.IDENT_RE, relevance: 0 }
      return {
        name: 'C#',
        aliases: ['cs', 'c#'],
        keywords: n,
        illegal: /::/,
        contains: [
          e.COMMENT('///', '$', {
            returnBegin: !0,
            contains: [
              {
                className: 'doctag',
                variants: [
                  { begin: '///', relevance: 0 },
                  { begin: '\x3c!--|--\x3e' },
                  { begin: '</?', end: '>' },
                ],
              },
            ],
          }),
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          {
            className: 'meta',
            begin: '#',
            end: '$',
            keywords: {
              'meta-keyword':
                'if else elif endif define undef warning error line region endregion pragma checksum',
            },
          },
          d,
          a,
          {
            beginKeywords: 'class interface',
            end: /[{;=]/,
            illegal: /[^\s:,]/,
            contains: [
              { beginKeywords: 'where class' },
              i,
              E,
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
            ],
          },
          {
            beginKeywords: 'namespace',
            end: /[{;=]/,
            illegal: /[^\s:]/,
            contains: [i, e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE],
          },
          {
            beginKeywords: 'record',
            end: /[{;=]/,
            illegal: /[^\s:]/,
            contains: [i, E, e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE],
          },
          {
            className: 'meta',
            begin: '^\\s*\\[',
            excludeBegin: !0,
            end: '\\]',
            excludeEnd: !0,
            contains: [{ className: 'meta-string', begin: /"/, end: /"/ }],
          },
          { beginKeywords: 'new return throw await else', relevance: 0 },
          {
            className: 'function',
            begin: '(' + _ + '\\s+)+' + e.IDENT_RE + '\\s*(\\<.+\\>)?\\s*\\(',
            returnBegin: !0,
            end: /\s*[{;=]/,
            excludeEnd: !0,
            keywords: n,
            contains: [
              {
                begin: e.IDENT_RE + '\\s*(\\<.+\\>)?\\s*\\(',
                returnBegin: !0,
                contains: [e.TITLE_MODE, E],
                relevance: 0,
              },
              {
                className: 'params',
                begin: /\(/,
                end: /\)/,
                excludeBegin: !0,
                excludeEnd: !0,
                keywords: n,
                relevance: 0,
                contains: [d, a, e.C_BLOCK_COMMENT_MODE],
              },
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
            ],
          },
          b,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'scss',
  (function () {
    'use strict'
    return function (e) {
      var t = {
          className: 'variable',
          begin: '(\\$[a-zA-Z-][a-zA-Z0-9_-]*)\\b',
        },
        i = { className: 'number', begin: '#[0-9A-Fa-f]+' }
      return (
        e.CSS_NUMBER_MODE,
        e.QUOTE_STRING_MODE,
        e.APOS_STRING_MODE,
        e.C_BLOCK_COMMENT_MODE,
        {
          name: 'SCSS',
          case_insensitive: !0,
          illegal: "[=/|']",
          contains: [
            e.C_LINE_COMMENT_MODE,
            e.C_BLOCK_COMMENT_MODE,
            {
              className: 'selector-id',
              begin: '\\#[A-Za-z0-9_-]+',
              relevance: 0,
            },
            {
              className: 'selector-class',
              begin: '\\.[A-Za-z0-9_-]+',
              relevance: 0,
            },
            {
              className: 'selector-attr',
              begin: '\\[',
              end: '\\]',
              illegal: '$',
            },
            {
              className: 'selector-tag',
              begin:
                '\\b(a|abbr|acronym|address|area|article|aside|audio|b|base|big|blockquote|body|br|button|canvas|caption|cite|code|col|colgroup|command|datalist|dd|del|details|dfn|div|dl|dt|em|embed|fieldset|figcaption|figure|footer|form|frame|frameset|(h[1-6])|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|keygen|label|legend|li|link|map|mark|meta|meter|nav|noframes|noscript|object|ol|optgroup|option|output|p|param|pre|progress|q|rp|rt|ruby|samp|script|section|select|small|span|strike|strong|style|sub|sup|table|tbody|td|textarea|tfoot|th|thead|time|title|tr|tt|ul|var|video)\\b',
              relevance: 0,
            },
            {
              className: 'selector-pseudo',
              begin:
                ':(visited|valid|root|right|required|read-write|read-only|out-range|optional|only-of-type|only-child|nth-of-type|nth-last-of-type|nth-last-child|nth-child|not|link|left|last-of-type|last-child|lang|invalid|indeterminate|in-range|hover|focus|first-of-type|first-line|first-letter|first-child|first|enabled|empty|disabled|default|checked|before|after|active)',
            },
            {
              className: 'selector-pseudo',
              begin:
                '::(after|before|choices|first-letter|first-line|repeat-index|repeat-item|selection|value)',
            },
            t,
            {
              className: 'attribute',
              begin:
                '\\b(src|z-index|word-wrap|word-spacing|word-break|width|widows|white-space|visibility|vertical-align|unicode-bidi|transition-timing-function|transition-property|transition-duration|transition-delay|transition|transform-style|transform-origin|transform|top|text-underline-position|text-transform|text-shadow|text-rendering|text-overflow|text-indent|text-decoration-style|text-decoration-line|text-decoration-color|text-decoration|text-align-last|text-align|tab-size|table-layout|right|resize|quotes|position|pointer-events|perspective-origin|perspective|page-break-inside|page-break-before|page-break-after|padding-top|padding-right|padding-left|padding-bottom|padding|overflow-y|overflow-x|overflow-wrap|overflow|outline-width|outline-style|outline-offset|outline-color|outline|orphans|order|opacity|object-position|object-fit|normal|none|nav-up|nav-right|nav-left|nav-index|nav-down|min-width|min-height|max-width|max-height|mask|marks|margin-top|margin-right|margin-left|margin-bottom|margin|list-style-type|list-style-position|list-style-image|list-style|line-height|letter-spacing|left|justify-content|initial|inherit|ime-mode|image-orientation|image-resolution|image-rendering|icon|hyphens|height|font-weight|font-variant-ligatures|font-variant|font-style|font-stretch|font-size-adjust|font-size|font-language-override|font-kerning|font-feature-settings|font-family|font|float|flex-wrap|flex-shrink|flex-grow|flex-flow|flex-direction|flex-basis|flex|filter|empty-cells|display|direction|cursor|counter-reset|counter-increment|content|column-width|column-span|column-rule-width|column-rule-style|column-rule-color|column-rule|column-gap|column-fill|column-count|columns|color|clip-path|clip|clear|caption-side|break-inside|break-before|break-after|box-sizing|box-shadow|box-decoration-break|bottom|border-width|border-top-width|border-top-style|border-top-right-radius|border-top-left-radius|border-top-color|border-top|border-style|border-spacing|border-right-width|border-right-style|border-right-color|border-right|border-radius|border-left-width|border-left-style|border-left-color|border-left|border-image-width|border-image-source|border-image-slice|border-image-repeat|border-image-outset|border-image|border-color|border-collapse|border-bottom-width|border-bottom-style|border-bottom-right-radius|border-bottom-left-radius|border-bottom-color|border-bottom|border|background-size|background-repeat|background-position|background-origin|background-image|background-color|background-clip|background-attachment|background-blend-mode|background|backface-visibility|auto|animation-timing-function|animation-play-state|animation-name|animation-iteration-count|animation-fill-mode|animation-duration|animation-direction|animation-delay|animation|align-self|align-items|align-content)\\b',
              illegal: '[^\\s]',
            },
            {
              begin:
                '\\b(whitespace|wait|w-resize|visible|vertical-text|vertical-ideographic|uppercase|upper-roman|upper-alpha|underline|transparent|top|thin|thick|text|text-top|text-bottom|tb-rl|table-header-group|table-footer-group|sw-resize|super|strict|static|square|solid|small-caps|separate|se-resize|scroll|s-resize|rtl|row-resize|ridge|right|repeat|repeat-y|repeat-x|relative|progress|pointer|overline|outside|outset|oblique|nowrap|not-allowed|normal|none|nw-resize|no-repeat|no-drop|newspaper|ne-resize|n-resize|move|middle|medium|ltr|lr-tb|lowercase|lower-roman|lower-alpha|loose|list-item|line|line-through|line-edge|lighter|left|keep-all|justify|italic|inter-word|inter-ideograph|inside|inset|inline|inline-block|inherit|inactive|ideograph-space|ideograph-parenthesis|ideograph-numeric|ideograph-alpha|horizontal|hidden|help|hand|groove|fixed|ellipsis|e-resize|double|dotted|distribute|distribute-space|distribute-letter|distribute-all-lines|disc|disabled|default|decimal|dashed|crosshair|collapse|col-resize|circle|char|center|capitalize|break-word|break-all|bottom|both|bolder|bold|block|bidi-override|below|baseline|auto|always|all-scroll|absolute|table|table-cell)\\b',
            },
            {
              begin: ':',
              end: ';',
              contains: [
                t,
                i,
                e.CSS_NUMBER_MODE,
                e.QUOTE_STRING_MODE,
                e.APOS_STRING_MODE,
                { className: 'meta', begin: '!important' },
              ],
            },
            {
              begin: '@(page|font-face)',
              lexemes: '@[a-z-]+',
              keywords: '@page @font-face',
            },
            {
              begin: '@',
              end: '[{;]',
              returnBegin: !0,
              keywords: 'and or not only',
              contains: [
                { begin: '@[a-z-]+', className: 'keyword' },
                t,
                e.QUOTE_STRING_MODE,
                e.APOS_STRING_MODE,
                i,
                e.CSS_NUMBER_MODE,
              ],
            },
          ],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'swift',
  (function () {
    'use strict'
    return function (e) {
      var i = {
          keyword:
            '#available #colorLiteral #column #else #elseif #endif #file #fileLiteral #function #if #imageLiteral #line #selector #sourceLocation _ __COLUMN__ __FILE__ __FUNCTION__ __LINE__ Any as as! as? associatedtype associativity break case catch class continue convenience default defer deinit didSet do dynamic dynamicType else enum extension fallthrough false fileprivate final for func get guard if import in indirect infix init inout internal is lazy left let mutating nil none nonmutating open operator optional override postfix precedence prefix private protocol Protocol public repeat required rethrows return right self Self set static struct subscript super switch throw throws true try try! try? Type typealias unowned var weak where while willSet',
          literal: 'true false nil',
          built_in:
            'abs advance alignof alignofValue anyGenerator assert assertionFailure bridgeFromObjectiveC bridgeFromObjectiveCUnconditional bridgeToObjectiveC bridgeToObjectiveCUnconditional c compactMap contains count countElements countLeadingZeros debugPrint debugPrintln distance dropFirst dropLast dump encodeBitsAsWords enumerate equal fatalError filter find getBridgedObjectiveCType getVaList indices insertionSort isBridgedToObjectiveC isBridgedVerbatimToObjectiveC isUniquelyReferenced isUniquelyReferencedNonObjC join lazy lexicographicalCompare map max maxElement min minElement numericCast overlaps partition posix precondition preconditionFailure print println quickSort readLine reduce reflect reinterpretCast reverse roundUpToAlignment sizeof sizeofValue sort split startsWith stride strideof strideofValue swap toString transcode underestimateCount unsafeAddressOf unsafeBitCast unsafeDowncast unsafeUnwrap unsafeReflect withExtendedLifetime withObjectAtPlusZero withUnsafePointer withUnsafePointerToObject withUnsafeMutablePointer withUnsafeMutablePointers withUnsafePointer withUnsafePointers withVaList zip',
        },
        n = e.COMMENT('/\\*', '\\*/', { contains: ['self'] }),
        t = {
          className: 'subst',
          begin: /\\\(/,
          end: '\\)',
          keywords: i,
          contains: [],
        },
        a = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE, t],
          variants: [
            { begin: /"""/, end: /"""/ },
            { begin: /"/, end: /"/ },
          ],
        },
        r = {
          className: 'number',
          begin:
            '\\b([\\d_]+(\\.[\\deE_]+)?|0x[a-fA-F0-9_]+(\\.[a-fA-F0-9p_]+)?|0b[01_]+|0o[0-7_]+)\\b',
          relevance: 0,
        }
      return (
        (t.contains = [r]),
        {
          name: 'Swift',
          keywords: i,
          contains: [
            a,
            e.C_LINE_COMMENT_MODE,
            n,
            { className: 'type', begin: "\\b[A-Z][\\wÀ-ʸ']*[!?]" },
            { className: 'type', begin: "\\b[A-Z][\\wÀ-ʸ']*", relevance: 0 },
            r,
            {
              className: 'function',
              beginKeywords: 'func',
              end: '{',
              excludeEnd: !0,
              contains: [
                e.inherit(e.TITLE_MODE, { begin: /[A-Za-z$_][0-9A-Za-z$_]*/ }),
                { begin: /</, end: />/ },
                {
                  className: 'params',
                  begin: /\(/,
                  end: /\)/,
                  endsParent: !0,
                  keywords: i,
                  contains: [
                    'self',
                    r,
                    a,
                    e.C_BLOCK_COMMENT_MODE,
                    { begin: ':' },
                  ],
                  illegal: /["']/,
                },
              ],
              illegal: /\[|%/,
            },
            {
              className: 'class',
              beginKeywords: 'struct protocol class extension enum',
              keywords: i,
              end: '\\{',
              excludeEnd: !0,
              contains: [
                e.inherit(e.TITLE_MODE, {
                  begin: /[A-Za-z$_][\u00C0-\u02B80-9A-Za-z$_]*/,
                }),
              ],
            },
            {
              className: 'meta',
              begin:
                '(@discardableResult|@warn_unused_result|@exported|@lazy|@noescape|@NSCopying|@NSManaged|@objc|@objcMembers|@convention|@required|@noreturn|@IBAction|@IBDesignable|@IBInspectable|@IBOutlet|@infix|@prefix|@postfix|@autoclosure|@testable|@available|@nonobjc|@NSApplicationMain|@UIApplicationMain|@dynamicMemberLookup|@propertyWrapper)\\b',
            },
            {
              beginKeywords: 'import',
              end: /$/,
              contains: [e.C_LINE_COMMENT_MODE, n],
            },
          ],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'java',
  (function () {
    'use strict'
    function e(e) {
      return e ? ('string' == typeof e ? e : e.source) : null
    }
    function n(e) {
      return a('(', e, ')?')
    }
    function a(...n) {
      return n.map((n) => e(n)).join('')
    }
    function s(...n) {
      return '(' + n.map((n) => e(n)).join('|') + ')'
    }
    return function (e) {
      var t =
          'false synchronized int abstract float private char boolean var static null if const for true while long strictfp finally protected import native final void enum else break transient catch instanceof byte super volatile case assert short package default double public try this switch continue throws protected public private module requires exports do',
        i = {
          className: 'meta',
          begin: '@[À-ʸa-zA-Z_$][À-ʸa-zA-Z_$0-9]*',
          contains: [{ begin: /\(/, end: /\)/, contains: ['self'] }],
        },
        r = (e) => a('[', e, ']+([', e, '_]*[', e, ']+)?'),
        c = {
          className: 'number',
          variants: [
            { begin: `\\b(0[bB]${r('01')})[lL]?` },
            { begin: `\\b(0${r('0-7')})[dDfFlL]?` },
            {
              begin: a(
                /\b0[xX]/,
                s(
                  a(r('a-fA-F0-9'), /\./, r('a-fA-F0-9')),
                  a(r('a-fA-F0-9'), /\.?/),
                  a(/\./, r('a-fA-F0-9'))
                ),
                /([pP][+-]?(\d+))?/,
                /[fFdDlL]?/
              ),
            },
            {
              begin: a(
                /\b/,
                s(a(/\d*\./, r('\\d')), r('\\d')),
                /[eE][+-]?[\d]+[dDfF]?/
              ),
            },
            { begin: a(/\b/, r(/\d/), n(/\.?/), n(r(/\d/)), /[dDfFlL]?/) },
          ],
          relevance: 0,
        }
      return {
        name: 'Java',
        aliases: ['jsp'],
        keywords: t,
        illegal: /<\/|#/,
        contains: [
          e.COMMENT('/\\*\\*', '\\*/', {
            relevance: 0,
            contains: [
              { begin: /\w+@/, relevance: 0 },
              { className: 'doctag', begin: '@[A-Za-z]+' },
            ],
          }),
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          e.APOS_STRING_MODE,
          e.QUOTE_STRING_MODE,
          {
            className: 'class',
            beginKeywords: 'class interface enum',
            end: /[{;=]/,
            excludeEnd: !0,
            keywords: 'class interface enum',
            illegal: /[:"\[\]]/,
            contains: [
              { beginKeywords: 'extends implements' },
              e.UNDERSCORE_TITLE_MODE,
            ],
          },
          { beginKeywords: 'new throw return else', relevance: 0 },
          {
            className: 'function',
            begin:
              '([À-ʸa-zA-Z_$][À-ʸa-zA-Z_$0-9]*(<[À-ʸa-zA-Z_$][À-ʸa-zA-Z_$0-9]*(\\s*,\\s*[À-ʸa-zA-Z_$][À-ʸa-zA-Z_$0-9]*)*>)?\\s+)+' +
              e.UNDERSCORE_IDENT_RE +
              '\\s*\\(',
            returnBegin: !0,
            end: /[{;=]/,
            excludeEnd: !0,
            keywords: t,
            contains: [
              {
                begin: e.UNDERSCORE_IDENT_RE + '\\s*\\(',
                returnBegin: !0,
                relevance: 0,
                contains: [e.UNDERSCORE_TITLE_MODE],
              },
              {
                className: 'params',
                begin: /\(/,
                end: /\)/,
                keywords: t,
                relevance: 0,
                contains: [
                  i,
                  e.APOS_STRING_MODE,
                  e.QUOTE_STRING_MODE,
                  e.C_NUMBER_MODE,
                  e.C_BLOCK_COMMENT_MODE,
                ],
              },
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
            ],
          },
          c,
          i,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'javascript',
  (function () {
    'use strict'
    const e = [
        'as',
        'in',
        'of',
        'if',
        'for',
        'while',
        'finally',
        'var',
        'new',
        'function',
        'do',
        'return',
        'void',
        'else',
        'break',
        'catch',
        'instanceof',
        'with',
        'throw',
        'case',
        'default',
        'try',
        'switch',
        'continue',
        'typeof',
        'delete',
        'let',
        'yield',
        'const',
        'class',
        'debugger',
        'async',
        'await',
        'static',
        'import',
        'from',
        'export',
        'extends',
      ],
      n = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'],
      a = [].concat(
        [
          'setInterval',
          'setTimeout',
          'clearInterval',
          'clearTimeout',
          'require',
          'exports',
          'eval',
          'isFinite',
          'isNaN',
          'parseFloat',
          'parseInt',
          'decodeURI',
          'decodeURIComponent',
          'encodeURI',
          'encodeURIComponent',
          'escape',
          'unescape',
        ],
        [
          'arguments',
          'this',
          'super',
          'console',
          'window',
          'document',
          'localStorage',
          'module',
          'global',
        ],
        [
          'Intl',
          'DataView',
          'Number',
          'Math',
          'Date',
          'String',
          'RegExp',
          'Object',
          'Function',
          'Boolean',
          'Error',
          'Symbol',
          'Set',
          'Map',
          'WeakSet',
          'WeakMap',
          'Proxy',
          'Reflect',
          'JSON',
          'Promise',
          'Float64Array',
          'Int16Array',
          'Int32Array',
          'Int8Array',
          'Uint16Array',
          'Uint32Array',
          'Float32Array',
          'Array',
          'Uint8Array',
          'Uint8ClampedArray',
          'ArrayBuffer',
        ],
        [
          'EvalError',
          'InternalError',
          'RangeError',
          'ReferenceError',
          'SyntaxError',
          'TypeError',
          'URIError',
        ]
      )
    function s(e) {
      return r('(?=', e, ')')
    }
    function r(...e) {
      return e
        .map((e) =>
          (function (e) {
            return e ? ('string' == typeof e ? e : e.source) : null
          })(e)
        )
        .join('')
    }
    return function (t) {
      var i = '[A-Za-z$_][0-9A-Za-z$_]*',
        c = { begin: /<[A-Za-z0-9\\._:-]+/, end: /\/[A-Za-z0-9\\._:-]+>|\/>/ },
        o = {
          $pattern: '[A-Za-z$_][0-9A-Za-z$_]*',
          keyword: e.join(' '),
          literal: n.join(' '),
          built_in: a.join(' '),
        },
        l = {
          className: 'number',
          variants: [
            { begin: '\\b(0[bB][01]+)n?' },
            { begin: '\\b(0[oO][0-7]+)n?' },
            { begin: t.C_NUMBER_RE + 'n?' },
          ],
          relevance: 0,
        },
        E = {
          className: 'subst',
          begin: '\\$\\{',
          end: '\\}',
          keywords: o,
          contains: [],
        },
        d = {
          begin: 'html`',
          end: '',
          starts: {
            end: '`',
            returnEnd: !1,
            contains: [t.BACKSLASH_ESCAPE, E],
            subLanguage: 'xml',
          },
        },
        g = {
          begin: 'css`',
          end: '',
          starts: {
            end: '`',
            returnEnd: !1,
            contains: [t.BACKSLASH_ESCAPE, E],
            subLanguage: 'css',
          },
        },
        u = {
          className: 'string',
          begin: '`',
          end: '`',
          contains: [t.BACKSLASH_ESCAPE, E],
        }
      E.contains = [
        t.APOS_STRING_MODE,
        t.QUOTE_STRING_MODE,
        d,
        g,
        u,
        l,
        t.REGEXP_MODE,
      ]
      var b = E.contains.concat([
          {
            begin: /\(/,
            end: /\)/,
            contains: ['self'].concat(E.contains, [
              t.C_BLOCK_COMMENT_MODE,
              t.C_LINE_COMMENT_MODE,
            ]),
          },
          t.C_BLOCK_COMMENT_MODE,
          t.C_LINE_COMMENT_MODE,
        ]),
        _ = {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          excludeBegin: !0,
          excludeEnd: !0,
          contains: b,
        }
      return {
        name: 'JavaScript',
        aliases: ['js', 'jsx', 'mjs', 'cjs'],
        keywords: o,
        contains: [
          t.SHEBANG({ binary: 'node', relevance: 5 }),
          {
            className: 'meta',
            relevance: 10,
            begin: /^\s*['"]use (strict|asm)['"]/,
          },
          t.APOS_STRING_MODE,
          t.QUOTE_STRING_MODE,
          d,
          g,
          u,
          t.C_LINE_COMMENT_MODE,
          t.COMMENT('/\\*\\*', '\\*/', {
            relevance: 0,
            contains: [
              {
                className: 'doctag',
                begin: '@[A-Za-z]+',
                contains: [
                  { className: 'type', begin: '\\{', end: '\\}', relevance: 0 },
                  {
                    className: 'variable',
                    begin: i + '(?=\\s*(-)|$)',
                    endsParent: !0,
                    relevance: 0,
                  },
                  { begin: /(?=[^\n])\s/, relevance: 0 },
                ],
              },
            ],
          }),
          t.C_BLOCK_COMMENT_MODE,
          l,
          {
            begin: r(
              /[{,\n]\s*/,
              s(r(/(((\/\/.*$)|(\/\*(.|\n)*\*\/))\s*)*/, i + '\\s*:'))
            ),
            relevance: 0,
            contains: [
              { className: 'attr', begin: i + s('\\s*:'), relevance: 0 },
            ],
          },
          {
            begin: '(' + t.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
            keywords: 'return throw case',
            contains: [
              t.C_LINE_COMMENT_MODE,
              t.C_BLOCK_COMMENT_MODE,
              t.REGEXP_MODE,
              {
                className: 'function',
                begin:
                  '(\\([^(]*(\\([^(]*(\\([^(]*\\))?\\))?\\)|' +
                  t.UNDERSCORE_IDENT_RE +
                  ')\\s*=>',
                returnBegin: !0,
                end: '\\s*=>',
                contains: [
                  {
                    className: 'params',
                    variants: [
                      { begin: t.UNDERSCORE_IDENT_RE },
                      { className: null, begin: /\(\s*\)/, skip: !0 },
                      {
                        begin: /\(/,
                        end: /\)/,
                        excludeBegin: !0,
                        excludeEnd: !0,
                        keywords: o,
                        contains: b,
                      },
                    ],
                  },
                ],
              },
              { begin: /,/, relevance: 0 },
              { className: '', begin: /\s/, end: /\s*/, skip: !0 },
              {
                variants: [
                  { begin: '<>', end: '</>' },
                  { begin: c.begin, end: c.end },
                ],
                subLanguage: 'xml',
                contains: [
                  { begin: c.begin, end: c.end, skip: !0, contains: ['self'] },
                ],
              },
            ],
            relevance: 0,
          },
          {
            className: 'function',
            beginKeywords: 'function',
            end: /\{/,
            excludeEnd: !0,
            contains: [t.inherit(t.TITLE_MODE, { begin: i }), _],
            illegal: /\[|%/,
          },
          { begin: /\$[(.]/ },
          t.METHOD_GUARD,
          {
            className: 'class',
            beginKeywords: 'class',
            end: /[{;=]/,
            excludeEnd: !0,
            illegal: /[:"\[\]]/,
            contains: [{ beginKeywords: 'extends' }, t.UNDERSCORE_TITLE_MODE],
          },
          { beginKeywords: 'constructor', end: /\{/, excludeEnd: !0 },
          {
            begin: '(get|set)\\s+(?=' + i + '\\()',
            end: /{/,
            keywords: 'get set',
            contains: [
              t.inherit(t.TITLE_MODE, { begin: i }),
              { begin: /\(\)/ },
              _,
            ],
          },
        ],
        illegal: /#(?!!)/,
      }
    }
  })()
)
hljs.registerLanguage(
  'typescript',
  (function () {
    'use strict'
    const e = [
        'as',
        'in',
        'of',
        'if',
        'for',
        'while',
        'finally',
        'var',
        'new',
        'function',
        'do',
        'return',
        'void',
        'else',
        'break',
        'catch',
        'instanceof',
        'with',
        'throw',
        'case',
        'default',
        'try',
        'switch',
        'continue',
        'typeof',
        'delete',
        'let',
        'yield',
        'const',
        'class',
        'debugger',
        'async',
        'await',
        'static',
        'import',
        'from',
        'export',
        'extends',
      ],
      n = ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity'],
      a = [].concat(
        [
          'setInterval',
          'setTimeout',
          'clearInterval',
          'clearTimeout',
          'require',
          'exports',
          'eval',
          'isFinite',
          'isNaN',
          'parseFloat',
          'parseInt',
          'decodeURI',
          'decodeURIComponent',
          'encodeURI',
          'encodeURIComponent',
          'escape',
          'unescape',
        ],
        [
          'arguments',
          'this',
          'super',
          'console',
          'window',
          'document',
          'localStorage',
          'module',
          'global',
        ],
        [
          'Intl',
          'DataView',
          'Number',
          'Math',
          'Date',
          'String',
          'RegExp',
          'Object',
          'Function',
          'Boolean',
          'Error',
          'Symbol',
          'Set',
          'Map',
          'WeakSet',
          'WeakMap',
          'Proxy',
          'Reflect',
          'JSON',
          'Promise',
          'Float64Array',
          'Int16Array',
          'Int32Array',
          'Int8Array',
          'Uint16Array',
          'Uint32Array',
          'Float32Array',
          'Array',
          'Uint8Array',
          'Uint8ClampedArray',
          'ArrayBuffer',
        ],
        [
          'EvalError',
          'InternalError',
          'RangeError',
          'ReferenceError',
          'SyntaxError',
          'TypeError',
          'URIError',
        ]
      )
    return function (r) {
      var t = {
          $pattern: '[A-Za-z$_][0-9A-Za-z$_]*',
          keyword: e
            .concat([
              'type',
              'namespace',
              'typedef',
              'interface',
              'public',
              'private',
              'protected',
              'implements',
              'declare',
              'abstract',
              'readonly',
            ])
            .join(' '),
          literal: n.join(' '),
          built_in: a
            .concat([
              'any',
              'void',
              'number',
              'boolean',
              'string',
              'object',
              'never',
              'enum',
            ])
            .join(' '),
        },
        s = { className: 'meta', begin: '@[A-Za-z$_][0-9A-Za-z$_]*' },
        i = {
          className: 'number',
          variants: [
            { begin: '\\b(0[bB][01]+)n?' },
            { begin: '\\b(0[oO][0-7]+)n?' },
            { begin: r.C_NUMBER_RE + 'n?' },
          ],
          relevance: 0,
        },
        o = {
          className: 'subst',
          begin: '\\$\\{',
          end: '\\}',
          keywords: t,
          contains: [],
        },
        c = {
          begin: 'html`',
          end: '',
          starts: {
            end: '`',
            returnEnd: !1,
            contains: [r.BACKSLASH_ESCAPE, o],
            subLanguage: 'xml',
          },
        },
        l = {
          begin: 'css`',
          end: '',
          starts: {
            end: '`',
            returnEnd: !1,
            contains: [r.BACKSLASH_ESCAPE, o],
            subLanguage: 'css',
          },
        },
        E = {
          className: 'string',
          begin: '`',
          end: '`',
          contains: [r.BACKSLASH_ESCAPE, o],
        }
      o.contains = [
        r.APOS_STRING_MODE,
        r.QUOTE_STRING_MODE,
        c,
        l,
        E,
        i,
        r.REGEXP_MODE,
      ]
      var d = {
          begin: '\\(',
          end: /\)/,
          keywords: t,
          contains: [
            'self',
            r.QUOTE_STRING_MODE,
            r.APOS_STRING_MODE,
            r.NUMBER_MODE,
          ],
        },
        u = {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          excludeBegin: !0,
          excludeEnd: !0,
          keywords: t,
          contains: [r.C_LINE_COMMENT_MODE, r.C_BLOCK_COMMENT_MODE, s, d],
        }
      return {
        name: 'TypeScript',
        aliases: ['ts'],
        keywords: t,
        contains: [
          r.SHEBANG(),
          { className: 'meta', begin: /^\s*['"]use strict['"]/ },
          r.APOS_STRING_MODE,
          r.QUOTE_STRING_MODE,
          c,
          l,
          E,
          r.C_LINE_COMMENT_MODE,
          r.C_BLOCK_COMMENT_MODE,
          i,
          {
            begin: '(' + r.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
            keywords: 'return throw case',
            contains: [
              r.C_LINE_COMMENT_MODE,
              r.C_BLOCK_COMMENT_MODE,
              r.REGEXP_MODE,
              {
                className: 'function',
                begin:
                  '(\\([^(]*(\\([^(]*(\\([^(]*\\))?\\))?\\)|' +
                  r.UNDERSCORE_IDENT_RE +
                  ')\\s*=>',
                returnBegin: !0,
                end: '\\s*=>',
                contains: [
                  {
                    className: 'params',
                    variants: [
                      { begin: r.UNDERSCORE_IDENT_RE },
                      { className: null, begin: /\(\s*\)/, skip: !0 },
                      {
                        begin: /\(/,
                        end: /\)/,
                        excludeBegin: !0,
                        excludeEnd: !0,
                        keywords: t,
                        contains: d.contains,
                      },
                    ],
                  },
                ],
              },
            ],
            relevance: 0,
          },
          {
            className: 'function',
            beginKeywords: 'function',
            end: /[\{;]/,
            excludeEnd: !0,
            keywords: t,
            contains: [
              'self',
              r.inherit(r.TITLE_MODE, { begin: '[A-Za-z$_][0-9A-Za-z$_]*' }),
              u,
            ],
            illegal: /%/,
            relevance: 0,
          },
          {
            beginKeywords: 'constructor',
            end: /[\{;]/,
            excludeEnd: !0,
            contains: ['self', u],
          },
          { begin: /module\./, keywords: { built_in: 'module' }, relevance: 0 },
          { beginKeywords: 'module', end: /\{/, excludeEnd: !0 },
          {
            beginKeywords: 'interface',
            end: /\{/,
            excludeEnd: !0,
            keywords: 'interface extends',
          },
          { begin: /\$[(.]/ },
          { begin: '\\.' + r.IDENT_RE, relevance: 0 },
          s,
          d,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'rust',
  (function () {
    'use strict'
    return function (e) {
      var n = '([ui](8|16|32|64|128|size)|f(32|64))?',
        t =
          'drop i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 str char bool Box Option Result String Vec Copy Send Sized Sync Drop Fn FnMut FnOnce ToOwned Clone Debug PartialEq PartialOrd Eq Ord AsRef AsMut Into From Default Iterator Extend IntoIterator DoubleEndedIterator ExactSizeIterator SliceConcatExt ToString assert! assert_eq! bitflags! bytes! cfg! col! concat! concat_idents! debug_assert! debug_assert_eq! env! panic! file! format! format_args! include_bin! include_str! line! local_data_key! module_path! option_env! print! println! select! stringify! try! unimplemented! unreachable! vec! write! writeln! macro_rules! assert_ne! debug_assert_ne!'
      return {
        name: 'Rust',
        aliases: ['rs'],
        keywords: {
          $pattern: e.IDENT_RE + '!?',
          keyword:
            'abstract as async await become box break const continue crate do dyn else enum extern false final fn for if impl in let loop macro match mod move mut override priv pub ref return self Self static struct super trait true try type typeof unsafe unsized use virtual where while yield',
          literal: 'true false Some None Ok Err',
          built_in: t,
        },
        illegal: '</',
        contains: [
          e.C_LINE_COMMENT_MODE,
          e.COMMENT('/\\*', '\\*/', { contains: ['self'] }),
          e.inherit(e.QUOTE_STRING_MODE, { begin: /b?"/, illegal: null }),
          {
            className: 'string',
            variants: [
              { begin: /r(#*)"(.|\n)*?"\1(?!#)/ },
              { begin: /b?'\\?(x\w{2}|u\w{4}|U\w{8}|.)'/ },
            ],
          },
          { className: 'symbol', begin: /'[a-zA-Z_][a-zA-Z0-9_]*/ },
          {
            className: 'number',
            variants: [
              { begin: '\\b0b([01_]+)' + n },
              { begin: '\\b0o([0-7_]+)' + n },
              { begin: '\\b0x([A-Fa-f0-9_]+)' + n },
              { begin: '\\b(\\d[\\d_]*(\\.[0-9_]+)?([eE][+-]?[0-9_]+)?)' + n },
            ],
            relevance: 0,
          },
          {
            className: 'function',
            beginKeywords: 'fn',
            end: '(\\(|<)',
            excludeEnd: !0,
            contains: [e.UNDERSCORE_TITLE_MODE],
          },
          {
            className: 'meta',
            begin: '#\\!?\\[',
            end: '\\]',
            contains: [{ className: 'meta-string', begin: /"/, end: /"/ }],
          },
          {
            className: 'class',
            beginKeywords: 'type',
            end: ';',
            contains: [e.inherit(e.UNDERSCORE_TITLE_MODE, { endsParent: !0 })],
            illegal: '\\S',
          },
          {
            className: 'class',
            beginKeywords: 'trait enum struct union',
            end: '{',
            contains: [e.inherit(e.UNDERSCORE_TITLE_MODE, { endsParent: !0 })],
            illegal: '[\\w\\d]',
          },
          { begin: e.IDENT_RE + '::', keywords: { built_in: t } },
          { begin: '->' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'nginx',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          className: 'variable',
          variants: [
            { begin: /\$\d+/ },
            { begin: /\$\{/, end: /}/ },
            { begin: '[\\$\\@]' + e.UNDERSCORE_IDENT_RE },
          ],
        },
        a = {
          endsWithParent: !0,
          keywords: {
            $pattern: '[a-z/_]+',
            literal:
              'on off yes no true false none blocked debug info notice warn error crit select break last permanent redirect kqueue rtsig epoll poll /dev/poll',
          },
          relevance: 0,
          illegal: '=>',
          contains: [
            e.HASH_COMMENT_MODE,
            {
              className: 'string',
              contains: [e.BACKSLASH_ESCAPE, n],
              variants: [
                { begin: /"/, end: /"/ },
                { begin: /'/, end: /'/ },
              ],
            },
            {
              begin: '([a-z]+):/',
              end: '\\s',
              endsWithParent: !0,
              excludeEnd: !0,
              contains: [n],
            },
            {
              className: 'regexp',
              contains: [e.BACKSLASH_ESCAPE, n],
              variants: [
                { begin: '\\s\\^', end: '\\s|{|;', returnEnd: !0 },
                { begin: '~\\*?\\s+', end: '\\s|{|;', returnEnd: !0 },
                { begin: '\\*(\\.[a-z\\-]+)+' },
                { begin: '([a-z\\-]+\\.)+\\*' },
              ],
            },
            {
              className: 'number',
              begin:
                '\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(:\\d{1,5})?\\b',
            },
            {
              className: 'number',
              begin: '\\b\\d+[kKmMgGdshdwy]*\\b',
              relevance: 0,
            },
            n,
          ],
        }
      return {
        name: 'Nginx config',
        aliases: ['nginxconf'],
        contains: [
          e.HASH_COMMENT_MODE,
          {
            begin: e.UNDERSCORE_IDENT_RE + '\\s+{',
            returnBegin: !0,
            end: '{',
            contains: [{ className: 'section', begin: e.UNDERSCORE_IDENT_RE }],
            relevance: 0,
          },
          {
            begin: e.UNDERSCORE_IDENT_RE + '\\s',
            end: ';|{',
            returnBegin: !0,
            contains: [
              {
                className: 'attribute',
                begin: e.UNDERSCORE_IDENT_RE,
                starts: a,
              },
            ],
            relevance: 0,
          },
        ],
        illegal: '[^\\s\\}]',
      }
    }
  })()
)
hljs.registerLanguage(
  'yaml',
  (function () {
    'use strict'
    return function (e) {
      var n = 'true false yes no null',
        a = "[\\w#;/?:@&=+$,.~*\\'()[\\]]+",
        s = {
          className: 'string',
          relevance: 0,
          variants: [
            { begin: /'/, end: /'/ },
            { begin: /"/, end: /"/ },
            { begin: /\S+/ },
          ],
          contains: [
            e.BACKSLASH_ESCAPE,
            {
              className: 'template-variable',
              variants: [
                { begin: '{{', end: '}}' },
                { begin: '%{', end: '}' },
              ],
            },
          ],
        },
        i = e.inherit(s, {
          variants: [
            { begin: /'/, end: /'/ },
            { begin: /"/, end: /"/ },
            { begin: /[^\s,{}[\]]+/ },
          ],
        }),
        l = {
          end: ',',
          endsWithParent: !0,
          excludeEnd: !0,
          contains: [],
          keywords: n,
          relevance: 0,
        },
        t = {
          begin: '{',
          end: '}',
          contains: [l],
          illegal: '\\n',
          relevance: 0,
        },
        g = {
          begin: '\\[',
          end: '\\]',
          contains: [l],
          illegal: '\\n',
          relevance: 0,
        },
        b = [
          {
            className: 'attr',
            variants: [
              { begin: '\\w[\\w :\\/.-]*:(?=[ \t]|$)' },
              { begin: '"\\w[\\w :\\/.-]*":(?=[ \t]|$)' },
              { begin: "'\\w[\\w :\\/.-]*':(?=[ \t]|$)" },
            ],
          },
          { className: 'meta', begin: '^---s*$', relevance: 10 },
          {
            className: 'string',
            begin: '[\\|>]([0-9]?[+-])?[ ]*\\n( *)[\\S ]+\\n(\\2[\\S ]+\\n?)*',
          },
          {
            begin: '<%[%=-]?',
            end: '[%-]?%>',
            subLanguage: 'ruby',
            excludeBegin: !0,
            excludeEnd: !0,
            relevance: 0,
          },
          { className: 'type', begin: '!\\w+!' + a },
          { className: 'type', begin: '!<' + a + '>' },
          { className: 'type', begin: '!' + a },
          { className: 'type', begin: '!!' + a },
          { className: 'meta', begin: '&' + e.UNDERSCORE_IDENT_RE + '$' },
          { className: 'meta', begin: '\\*' + e.UNDERSCORE_IDENT_RE + '$' },
          { className: 'bullet', begin: '\\-(?=[ ]|$)', relevance: 0 },
          e.HASH_COMMENT_MODE,
          { beginKeywords: n, keywords: { literal: n } },
          {
            className: 'number',
            begin:
              '\\b[0-9]{4}(-[0-9][0-9]){0,2}([Tt \\t][0-9][0-9]?(:[0-9][0-9]){2})?(\\.[0-9]*)?([ \\t])*(Z|[-+][0-9][0-9]?(:[0-9][0-9])?)?\\b',
          },
          { className: 'number', begin: e.C_NUMBER_RE + '\\b' },
          t,
          g,
          s,
        ],
        c = [...b]
      return (
        c.pop(),
        c.push(i),
        (l.contains = c),
        {
          name: 'YAML',
          case_insensitive: !0,
          aliases: ['yml', 'YAML'],
          contains: b,
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'sql',
  (function () {
    'use strict'
    return function (e) {
      var t = e.COMMENT('--', '$')
      return {
        name: 'SQL',
        case_insensitive: !0,
        illegal: /[<>{}*]/,
        contains: [
          {
            beginKeywords:
              'begin end start commit rollback savepoint lock alter create drop rename call delete do handler insert load replace select truncate update set show pragma grant merge describe use explain help declare prepare execute deallocate release unlock purge reset change stop analyze cache flush optimize repair kill install uninstall checksum restore check backup revoke comment values with',
            end: /;/,
            endsWithParent: !0,
            keywords: {
              $pattern: /[\w\.]+/,
              keyword:
                'as abort abs absolute acc acce accep accept access accessed accessible account acos action activate add addtime admin administer advanced advise aes_decrypt aes_encrypt after agent aggregate ali alia alias all allocate allow alter always analyze ancillary and anti any anydata anydataset anyschema anytype apply archive archived archivelog are as asc ascii asin assembly assertion associate asynchronous at atan atn2 attr attri attrib attribu attribut attribute attributes audit authenticated authentication authid authors auto autoallocate autodblink autoextend automatic availability avg backup badfile basicfile before begin beginning benchmark between bfile bfile_base big bigfile bin binary_double binary_float binlog bit_and bit_count bit_length bit_or bit_xor bitmap blob_base block blocksize body both bound bucket buffer_cache buffer_pool build bulk by byte byteordermark bytes cache caching call calling cancel capacity cascade cascaded case cast catalog category ceil ceiling chain change changed char_base char_length character_length characters characterset charindex charset charsetform charsetid check checksum checksum_agg child choose chr chunk class cleanup clear client clob clob_base clone close cluster_id cluster_probability cluster_set clustering coalesce coercibility col collate collation collect colu colum column column_value columns columns_updated comment commit compact compatibility compiled complete composite_limit compound compress compute concat concat_ws concurrent confirm conn connec connect connect_by_iscycle connect_by_isleaf connect_by_root connect_time connection consider consistent constant constraint constraints constructor container content contents context contributors controlfile conv convert convert_tz corr corr_k corr_s corresponding corruption cos cost count count_big counted covar_pop covar_samp cpu_per_call cpu_per_session crc32 create creation critical cross cube cume_dist curdate current current_date current_time current_timestamp current_user cursor curtime customdatum cycle data database databases datafile datafiles datalength date_add date_cache date_format date_sub dateadd datediff datefromparts datename datepart datetime2fromparts day day_to_second dayname dayofmonth dayofweek dayofyear days db_role_change dbtimezone ddl deallocate declare decode decompose decrement decrypt deduplicate def defa defau defaul default defaults deferred defi defin define degrees delayed delegate delete delete_all delimited demand dense_rank depth dequeue des_decrypt des_encrypt des_key_file desc descr descri describ describe descriptor deterministic diagnostics difference dimension direct_load directory disable disable_all disallow disassociate discardfile disconnect diskgroup distinct distinctrow distribute distributed div do document domain dotnet double downgrade drop dumpfile duplicate duration each edition editionable editions element ellipsis else elsif elt empty enable enable_all enclosed encode encoding encrypt end end-exec endian enforced engine engines enqueue enterprise entityescaping eomonth error errors escaped evalname evaluate event eventdata events except exception exceptions exchange exclude excluding execu execut execute exempt exists exit exp expire explain explode export export_set extended extent external external_1 external_2 externally extract failed failed_login_attempts failover failure far fast feature_set feature_value fetch field fields file file_name_convert filesystem_like_logging final finish first first_value fixed flash_cache flashback floor flush following follows for forall force foreign form forma format found found_rows freelist freelists freepools fresh from from_base64 from_days ftp full function general generated get get_format get_lock getdate getutcdate global global_name globally go goto grant grants greatest group group_concat group_id grouping grouping_id groups gtid_subtract guarantee guard handler hash hashkeys having hea head headi headin heading heap help hex hierarchy high high_priority hosts hour hours http id ident_current ident_incr ident_seed identified identity idle_time if ifnull ignore iif ilike ilm immediate import in include including increment index indexes indexing indextype indicator indices inet6_aton inet6_ntoa inet_aton inet_ntoa infile initial initialized initially initrans inmemory inner innodb input insert install instance instantiable instr interface interleaved intersect into invalidate invisible is is_free_lock is_ipv4 is_ipv4_compat is_not is_not_null is_used_lock isdate isnull isolation iterate java join json json_exists keep keep_duplicates key keys kill language large last last_day last_insert_id last_value lateral lax lcase lead leading least leaves left len lenght length less level levels library like like2 like4 likec limit lines link list listagg little ln load load_file lob lobs local localtime localtimestamp locate locator lock locked log log10 log2 logfile logfiles logging logical logical_reads_per_call logoff logon logs long loop low low_priority lower lpad lrtrim ltrim main make_set makedate maketime managed management manual map mapping mask master master_pos_wait match matched materialized max maxextents maximize maxinstances maxlen maxlogfiles maxloghistory maxlogmembers maxsize maxtrans md5 measures median medium member memcompress memory merge microsecond mid migration min minextents minimum mining minus minute minutes minvalue missing mod mode model modification modify module monitoring month months mount move movement multiset mutex name name_const names nan national native natural nav nchar nclob nested never new newline next nextval no no_write_to_binlog noarchivelog noaudit nobadfile nocheck nocompress nocopy nocycle nodelay nodiscardfile noentityescaping noguarantee nokeep nologfile nomapping nomaxvalue nominimize nominvalue nomonitoring none noneditionable nonschema noorder nopr nopro noprom nopromp noprompt norely noresetlogs noreverse normal norowdependencies noschemacheck noswitch not nothing notice notnull notrim novalidate now nowait nth_value nullif nulls num numb numbe nvarchar nvarchar2 object ocicoll ocidate ocidatetime ociduration ociinterval ociloblocator ocinumber ociref ocirefcursor ocirowid ocistring ocitype oct octet_length of off offline offset oid oidindex old on online only opaque open operations operator optimal optimize option optionally or oracle oracle_date oradata ord ordaudio orddicom orddoc order ordimage ordinality ordvideo organization orlany orlvary out outer outfile outline output over overflow overriding package pad parallel parallel_enable parameters parent parse partial partition partitions pascal passing password password_grace_time password_lock_time password_reuse_max password_reuse_time password_verify_function patch path patindex pctincrease pctthreshold pctused pctversion percent percent_rank percentile_cont percentile_disc performance period period_add period_diff permanent physical pi pipe pipelined pivot pluggable plugin policy position post_transaction pow power pragma prebuilt precedes preceding precision prediction prediction_cost prediction_details prediction_probability prediction_set prepare present preserve prior priority private private_sga privileges procedural procedure procedure_analyze processlist profiles project prompt protection public publishingservername purge quarter query quick quiesce quota quotename radians raise rand range rank raw read reads readsize rebuild record records recover recovery recursive recycle redo reduced ref reference referenced references referencing refresh regexp_like register regr_avgx regr_avgy regr_count regr_intercept regr_r2 regr_slope regr_sxx regr_sxy reject rekey relational relative relaylog release release_lock relies_on relocate rely rem remainder rename repair repeat replace replicate replication required reset resetlogs resize resource respect restore restricted result result_cache resumable resume retention return returning returns reuse reverse revoke right rlike role roles rollback rolling rollup round row row_count rowdependencies rowid rownum rows rtrim rules safe salt sample save savepoint sb1 sb2 sb4 scan schema schemacheck scn scope scroll sdo_georaster sdo_topo_geometry search sec_to_time second seconds section securefile security seed segment select self semi sequence sequential serializable server servererror session session_user sessions_per_user set sets settings sha sha1 sha2 share shared shared_pool short show shrink shutdown si_averagecolor si_colorhistogram si_featurelist si_positionalcolor si_stillimage si_texture siblings sid sign sin size size_t sizes skip slave sleep smalldatetimefromparts smallfile snapshot some soname sort soundex source space sparse spfile split sql sql_big_result sql_buffer_result sql_cache sql_calc_found_rows sql_small_result sql_variant_property sqlcode sqldata sqlerror sqlname sqlstate sqrt square standalone standby start starting startup statement static statistics stats_binomial_test stats_crosstab stats_ks_test stats_mode stats_mw_test stats_one_way_anova stats_t_test_ stats_t_test_indep stats_t_test_one stats_t_test_paired stats_wsr_test status std stddev stddev_pop stddev_samp stdev stop storage store stored str str_to_date straight_join strcmp strict string struct stuff style subdate subpartition subpartitions substitutable substr substring subtime subtring_index subtype success sum suspend switch switchoffset switchover sync synchronous synonym sys sys_xmlagg sysasm sysaux sysdate sysdatetimeoffset sysdba sysoper system system_user sysutcdatetime table tables tablespace tablesample tan tdo template temporary terminated tertiary_weights test than then thread through tier ties time time_format time_zone timediff timefromparts timeout timestamp timestampadd timestampdiff timezone_abbr timezone_minute timezone_region to to_base64 to_date to_days to_seconds todatetimeoffset trace tracking transaction transactional translate translation treat trigger trigger_nestlevel triggers trim truncate try_cast try_convert try_parse type ub1 ub2 ub4 ucase unarchived unbounded uncompress under undo unhex unicode uniform uninstall union unique unix_timestamp unknown unlimited unlock unnest unpivot unrecoverable unsafe unsigned until untrusted unusable unused update updated upgrade upped upper upsert url urowid usable usage use use_stored_outlines user user_data user_resources users using utc_date utc_timestamp uuid uuid_short validate validate_password_strength validation valist value values var var_samp varcharc vari varia variab variabl variable variables variance varp varraw varrawc varray verify version versions view virtual visible void wait wallet warning warnings week weekday weekofyear wellformed when whene whenev wheneve whenever where while whitespace window with within without work wrapped xdb xml xmlagg xmlattributes xmlcast xmlcolattval xmlelement xmlexists xmlforest xmlindex xmlnamespaces xmlpi xmlquery xmlroot xmlschema xmlserialize xmltable xmltype xor year year_to_month years yearweek',
              literal: 'true false null unknown',
              built_in:
                'array bigint binary bit blob bool boolean char character date dec decimal float int int8 integer interval number numeric real record serial serial8 smallint text time timestamp tinyint varchar varchar2 varying void',
            },
            contains: [
              {
                className: 'string',
                begin: "'",
                end: "'",
                contains: [{ begin: "''" }],
              },
              {
                className: 'string',
                begin: '"',
                end: '"',
                contains: [{ begin: '""' }],
              },
              { className: 'string', begin: '`', end: '`' },
              e.C_NUMBER_MODE,
              e.C_BLOCK_COMMENT_MODE,
              t,
              e.HASH_COMMENT_MODE,
            ],
          },
          e.C_BLOCK_COMMENT_MODE,
          t,
          e.HASH_COMMENT_MODE,
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'solidity',
  (() => {
    'use strict'
    function e() {
      try {
        return !0
      } catch (e) {
        return !1
      }
    }
    var a =
      /-?(\b0[xX]([a-fA-F0-9]_?)*[a-fA-F0-9]|(\b[1-9](_?\d)*(\.((\d_?)*\d)?)?|\.\d(_?\d)*)([eE][-+]?\d(_?\d)*)?|\b0)(?!\w|\$)/
    e() && (a = a.source.replace(/\\b/g, '(?<!\\$)\\b'))
    var s = { className: 'number', begin: a, relevance: 0 },
      n = {
        keyword:
          'assembly let function if switch case default for leave break continue u256 jump jumpi stop return revert selfdestruct invalid',
        built_in:
          'add sub mul div sdiv mod smod exp not lt gt slt sgt eq iszero and or xor byte shl shr sar addmod mulmod signextend keccak256 pc pop dup1 dup2 dup3 dup4 dup5 dup6 dup7 dup8 dup9 dup10 dup11 dup12 dup13 dup14 dup15 dup16 swap1 swap2 swap3 swap4 swap5 swap6 swap7 swap8 swap9 swap10 swap11 swap12 swap13 swap14 swap15 swap16 mload mstore mstore8 sload sstore msize gas address balance selfbalance caller callvalue calldataload calldatasize calldatacopy codesize codecopy extcodesize extcodecopy returndatasize returndatacopy extcodehash create create2 call callcode delegatecall staticcall log0 log1 log2 log3 log4 chainid origin gasprice basefee blockhash coinbase timestamp number difficulty gaslimit',
        literal: 'true false',
      },
      i = {
        className: 'string',
        begin: /\bhex'(([0-9a-fA-F]{2}_?)*[0-9a-fA-F]{2})?'/,
      },
      t = {
        className: 'string',
        begin: /\bhex"(([0-9a-fA-F]{2}_?)*[0-9a-fA-F]{2})?"/,
      }
    function r(e) {
      return e.inherit(e.APOS_STRING_MODE, { begin: /(\bunicode)?'/ })
    }
    function l(e) {
      return e.inherit(e.QUOTE_STRING_MODE, { begin: /(\bunicode)?"/ })
    }
    var o = {
      SOL_ASSEMBLY_KEYWORDS: n,
      baseAssembly: (e) => {
        var a = r(e),
          o = l(e),
          c = /[A-Za-z_$][A-Za-z_$0-9.]*/,
          d = e.inherit(e.TITLE_MODE, {
            begin: /[A-Za-z$_][0-9A-Za-z$_]*/,
            lexemes: c,
            keywords: n,
          }),
          u = {
            className: 'params',
            begin: /\(/,
            end: /\)/,
            excludeBegin: !0,
            excludeEnd: !0,
            lexemes: c,
            keywords: n,
            contains: [e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE, a, o, s],
          },
          _ = {
            className: 'operator',
            begin: /:=|->/,
          }
        return {
          keywords: n,
          lexemes: c,
          contains: [
            a,
            o,
            i,
            t,
            e.C_LINE_COMMENT_MODE,
            e.C_BLOCK_COMMENT_MODE,
            s,
            _,
            {
              className: 'function',
              lexemes: c,
              beginKeywords: 'function',
              end: '{',
              excludeEnd: !0,
              contains: [
                d,
                u,
                e.C_LINE_COMMENT_MODE,
                e.C_BLOCK_COMMENT_MODE,
                _,
              ],
            },
          ],
        }
      },
      solAposStringMode: r,
      solQuoteStringMode: l,
      HEX_APOS_STRING_MODE: i,
      HEX_QUOTE_STRING_MODE: t,
      SOL_NUMBER: s,
      isNegativeLookbehindAvailable: e,
    }
    const {
      baseAssembly: c,
      solAposStringMode: d,
      solQuoteStringMode: u,
      HEX_APOS_STRING_MODE: _,
      HEX_QUOTE_STRING_MODE: m,
      SOL_NUMBER: b,
      isNegativeLookbehindAvailable: E,
    } = o
    return (e) => {
      for (var a = d(e), s = u(e), n = [], i = 0; i < 32; i++) n[i] = i + 1
      var t = n.map((e) => 8 * e),
        r = []
      for (i = 0; i <= 80; i++) r[i] = i
      var l = n.map((e) => 'bytes' + e).join(' ') + ' ',
        o = t.map((e) => 'uint' + e).join(' ') + ' ',
        g = t.map((e) => 'int' + e).join(' ') + ' ',
        M = [].concat.apply(
          [],
          t.map((e) => r.map((a) => e + 'x' + a))
        ),
        p = {
          keyword:
            'var bool string int uint ' +
            g +
            o +
            'byte bytes ' +
            l +
            'fixed ufixed ' +
            M.map((e) => 'fixed' + e).join(' ') +
            ' ' +
            M.map((e) => 'ufixed' + e).join(' ') +
            ' enum struct mapping address new delete if else for while continue break return throw emit try catch revert unchecked _ function modifier event constructor fallback receive error virtual override constant immutable anonymous indexed storage memory calldata external public internal payable pure view private returns import from as using pragma contract interface library is abstract type assembly',
          literal:
            'true false wei gwei szabo finney ether seconds minutes hours days weeks years',
          built_in:
            'self this super selfdestruct suicide now msg block tx abi blockhash gasleft assert require Error Panic sha3 sha256 keccak256 ripemd160 ecrecover addmod mulmod log0 log1 log2 log3 log4',
        },
        O = { className: 'operator', begin: /[+\-!~*\/%<>&^|=]/ },
        C = /[A-Za-z_$][A-Za-z_$0-9]*/,
        N = {
          className: 'params',
          begin: /\(/,
          end: /\)/,
          excludeBegin: !0,
          excludeEnd: !0,
          lexemes: C,
          keywords: p,
          contains: [
            e.C_LINE_COMMENT_MODE,
            e.C_BLOCK_COMMENT_MODE,
            a,
            s,
            b,
            'self',
          ],
        },
        f = {
          begin: /\.\s*/,
          end: /[^A-Za-z0-9$_\.]/,
          excludeBegin: !0,
          excludeEnd: !0,
          keywords: {
            built_in:
              'gas value selector address length push pop send transfer call callcode delegatecall staticcall balance code codehash wrap unwrap name creationCode runtimeCode interfaceId min max',
          },
          relevance: 2,
        },
        y = e.inherit(e.TITLE_MODE, {
          begin: /[A-Za-z$_][0-9A-Za-z$_]*/,
          lexemes: C,
          keywords: p,
        }),
        w = {
          className: 'built_in',
          begin: (E() ? '(?<!\\$)\\b' : '\\b') + '(gas|value|salt)(?=:)',
        }
      function x(e, a) {
        return {
          begin: (E() ? '(?<!\\$)\\b' : '\\b') + e + '\\.\\s*',
          end: /[^A-Za-z0-9$_\.]/,
          excludeBegin: !1,
          excludeEnd: !0,
          lexemes: C,
          keywords: { built_in: e + ' ' + a },
          contains: [f],
          relevance: 10,
        }
      }
      var h = c(e),
        v = e.inherit(h, {
          contains: h.contains.concat([
            {
              begin: /\./,
              end: /[^A-Za-z0-9$.]/,
              excludeBegin: !0,
              excludeEnd: !0,
              keywords: { built_in: 'slot offset length address selector' },
              relevance: 2,
            },
            {
              begin: /_/,
              end: /[^A-Za-z0-9$.]/,
              excludeBegin: !0,
              excludeEnd: !0,
              keywords: { built_in: 'slot offset' },
              relevance: 2,
            },
          ]),
        })
      return {
        aliases: ['sol'],
        keywords: p,
        lexemes: C,
        contains: [
          a,
          s,
          _,
          m,
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          b,
          w,
          O,
          {
            className: 'function',
            lexemes: C,
            beginKeywords:
              'function modifier event constructor fallback receive error',
            end: /[{;]/,
            excludeEnd: !0,
            contains: [y, N, w, e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE],
            illegal: /%/,
          },
          x('msg', 'gas value data sender sig'),
          x(
            'block',
            'blockhash coinbase difficulty gaslimit basefee number timestamp chainid'
          ),
          x('tx', 'gasprice origin'),
          x(
            'abi',
            'decode encode encodePacked encodeWithSelector encodeWithSignature'
          ),
          x('bytes', 'concat'),
          f,
          {
            className: 'class',
            lexemes: C,
            beginKeywords: 'contract interface library',
            end: '{',
            excludeEnd: !0,
            illegal: /[:"\[\]]/,
            contains: [
              { beginKeywords: 'is', lexemes: C },
              y,
              N,
              w,
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
            ],
          },
          {
            lexemes: C,
            beginKeywords: 'struct enum',
            end: '{',
            excludeEnd: !0,
            illegal: /[:"\[\]]/,
            contains: [y, e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE],
          },
          {
            beginKeywords: 'import',
            end: ';',
            lexemes: C,
            keywords: 'import from as',
            contains: [
              y,
              a,
              s,
              _,
              m,
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
              O,
            ],
          },
          {
            beginKeywords: 'using',
            end: ';',
            lexemes: C,
            keywords: 'using for',
            contains: [y, e.C_LINE_COMMENT_MODE, e.C_BLOCK_COMMENT_MODE, O],
          },
          {
            className: 'meta',
            beginKeywords: 'pragma',
            end: ';',
            lexemes: C,
            keywords: {
              keyword: 'pragma solidity experimental abicoder',
              built_in: 'ABIEncoderV2 SMTChecker v1 v2',
            },
            contains: [
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
              e.inherit(a, {
                className: 'meta-string',
              }),
              e.inherit(s, { className: 'meta-string' }),
            ],
          },
          {
            beginKeywords: 'assembly',
            end: /\b\B/,
            contains: [
              e.C_LINE_COMMENT_MODE,
              e.C_BLOCK_COMMENT_MODE,
              e.inherit(v, {
                begin: '{',
                end: '}',
                endsParent: !0,
                contains: v.contains.concat([
                  e.inherit(v, {
                    begin: '{',
                    end: '}',
                    contains: v.contains.concat(['self']),
                  }),
                ]),
              }),
            ],
          },
        ],
        illegal: /#/,
      }
    }
  })()
)
hljs.registerLanguage(
  'clojure',
  (function () {
    'use strict'
    return function (e) {
      var t = "[a-zA-Z_\\-!.?+*=<>&#'][a-zA-Z_\\-!.?+*=<>&#'0-9/;:]*",
        n =
          'def defonce defprotocol defstruct defmulti defmethod defn- defn defmacro deftype defrecord',
        r = {
          $pattern: t,
          'builtin-name':
            n +
            ' cond apply if-not if-let if not not= = < > <= >= == + / * - rem quot neg? pos? delay? symbol? keyword? true? false? integer? empty? coll? list? set? ifn? fn? associative? sequential? sorted? counted? reversible? number? decimal? class? distinct? isa? float? rational? reduced? ratio? odd? even? char? seq? vector? string? map? nil? contains? zero? instance? not-every? not-any? libspec? -> ->> .. . inc compare do dotimes mapcat take remove take-while drop letfn drop-last take-last drop-while while intern condp case reduced cycle split-at split-with repeat replicate iterate range merge zipmap declare line-seq sort comparator sort-by dorun doall nthnext nthrest partition eval doseq await await-for let agent atom send send-off release-pending-sends add-watch mapv filterv remove-watch agent-error restart-agent set-error-handler error-handler set-error-mode! error-mode shutdown-agents quote var fn loop recur throw try monitor-enter monitor-exit macroexpand macroexpand-1 for dosync and or when when-not when-let comp juxt partial sequence memoize constantly complement identity assert peek pop doto proxy first rest cons cast coll last butlast sigs reify second ffirst fnext nfirst nnext meta with-meta ns in-ns create-ns import refer keys select-keys vals key val rseq name namespace promise into transient persistent! conj! assoc! dissoc! pop! disj! use class type num float double short byte boolean bigint biginteger bigdec print-method print-dup throw-if printf format load compile get-in update-in pr pr-on newline flush read slurp read-line subvec with-open memfn time re-find re-groups rand-int rand mod locking assert-valid-fdecl alias resolve ref deref refset swap! reset! set-validator! compare-and-set! alter-meta! reset-meta! commute get-validator alter ref-set ref-history-count ref-min-history ref-max-history ensure sync io! new next conj set! to-array future future-call into-array aset gen-class reduce map filter find empty hash-map hash-set sorted-map sorted-map-by sorted-set sorted-set-by vec vector seq flatten reverse assoc dissoc list disj get union difference intersection extend extend-type extend-protocol int nth delay count concat chunk chunk-buffer chunk-append chunk-first chunk-rest max min dec unchecked-inc-int unchecked-inc unchecked-dec-inc unchecked-dec unchecked-negate unchecked-add-int unchecked-add unchecked-subtract-int unchecked-subtract chunk-next chunk-cons chunked-seq? prn vary-meta lazy-seq spread list* str find-keyword keyword symbol gensym force rationalize',
        },
        a = { begin: t, relevance: 0 },
        s = { className: 'number', begin: '[-+]?\\d+(\\.\\d+)?', relevance: 0 },
        o = e.inherit(e.QUOTE_STRING_MODE, { illegal: null }),
        i = e.COMMENT(';', '$', { relevance: 0 }),
        c = { className: 'literal', begin: /\b(true|false|nil)\b/ },
        d = { begin: '[\\[\\{]', end: '[\\]\\}]' },
        l = { className: 'comment', begin: '\\^' + t },
        m = e.COMMENT('\\^\\{', '\\}'),
        u = { className: 'symbol', begin: '[:]{1,2}' + t },
        p = { begin: '\\(', end: '\\)' },
        f = { endsWithParent: !0, relevance: 0 },
        h = { keywords: r, className: 'name', begin: t, starts: f },
        y = [p, o, l, m, i, u, d, s, c, a],
        g = {
          beginKeywords: n,
          lexemes: t,
          end: '(\\[|\\#|\\d|"|:|\\{|\\)|\\(|$)',
          contains: [
            {
              className: 'title',
              begin: t,
              relevance: 0,
              excludeEnd: !0,
              endsParent: !0,
            },
          ].concat(y),
        }
      return (
        (p.contains = [e.COMMENT('comment', ''), g, h, f]),
        (f.contains = y),
        (d.contains = y),
        (m.contains = [d]),
        {
          name: 'Clojure',
          aliases: ['clj'],
          illegal: /\S/,
          contains: [p, o, l, m, i, u, d, s, c],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'elm',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          variants: [
            e.COMMENT('--', '$'),
            e.COMMENT('{-', '-}', { contains: ['self'] }),
          ],
        },
        i = { className: 'type', begin: "\\b[A-Z][\\w']*", relevance: 0 },
        s = {
          begin: '\\(',
          end: '\\)',
          illegal: '"',
          contains: [
            {
              className: 'type',
              begin: '\\b[A-Z][\\w]*(\\((\\.\\.|,|\\w+)\\))?',
            },
            n,
          ],
        }
      return {
        name: 'Elm',
        keywords:
          'let in if then else case of where module import exposing type alias as infix infixl infixr port effect command subscription',
        contains: [
          {
            beginKeywords: 'port effect module',
            end: 'exposing',
            keywords: 'port effect module where command subscription exposing',
            contains: [s, n],
            illegal: '\\W\\.|;',
          },
          {
            begin: 'import',
            end: '$',
            keywords: 'import as exposing',
            contains: [s, n],
            illegal: '\\W\\.|;',
          },
          {
            begin: 'type',
            end: '$',
            keywords: 'type alias',
            contains: [i, s, { begin: '{', end: '}', contains: s.contains }, n],
          },
          {
            beginKeywords: 'infix infixl infixr',
            end: '$',
            contains: [e.C_NUMBER_MODE, n],
          },
          { begin: 'port', end: '$', keywords: 'port', contains: [n] },
          { className: 'string', begin: "'\\\\?.", end: "'", illegal: '.' },
          e.QUOTE_STRING_MODE,
          e.C_NUMBER_MODE,
          i,
          e.inherit(e.TITLE_MODE, { begin: "^[_a-z][\\w']*" }),
          n,
          { begin: '->|<-' },
        ],
        illegal: /;/,
      }
    }
  })()
)
hljs.registerLanguage(
  'scala',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          className: 'subst',
          variants: [
            { begin: '\\$[A-Za-z0-9_]+' },
            { begin: '\\${', end: '}' },
          ],
        },
        a = {
          className: 'string',
          variants: [
            {
              begin: '"',
              end: '"',
              illegal: '\\n',
              contains: [e.BACKSLASH_ESCAPE],
            },
            { begin: '"""', end: '"""', relevance: 10 },
            {
              begin: '[a-z]+"',
              end: '"',
              illegal: '\\n',
              contains: [e.BACKSLASH_ESCAPE, n],
            },
            {
              className: 'string',
              begin: '[a-z]+"""',
              end: '"""',
              contains: [n],
              relevance: 10,
            },
          ],
        },
        s = { className: 'type', begin: '\\b[A-Z][A-Za-z0-9_]*', relevance: 0 },
        t = {
          className: 'title',
          begin:
            /[^0-9\n\t "'(),.`{}\[\]:;][^\n\t "'(),.`{}\[\]:;]+|[^0-9\n\t "'(),.`{}\[\]:;=]/,
          relevance: 0,
        },
        i = {
          className: 'class',
          beginKeywords: 'class object trait type',
          end: /[:={\[\n;]/,
          excludeEnd: !0,
          contains: [
            { beginKeywords: 'extends with', relevance: 10 },
            {
              begin: /\[/,
              end: /\]/,
              excludeBegin: !0,
              excludeEnd: !0,
              relevance: 0,
              contains: [s],
            },
            {
              className: 'params',
              begin: /\(/,
              end: /\)/,
              excludeBegin: !0,
              excludeEnd: !0,
              relevance: 0,
              contains: [s],
            },
            t,
          ],
        },
        l = {
          className: 'function',
          beginKeywords: 'def',
          end: /[:={\[(\n;]/,
          excludeEnd: !0,
          contains: [t],
        }
      return {
        name: 'Scala',
        keywords: {
          literal: 'true false null',
          keyword:
            'type yield lazy override def with val var sealed abstract private trait object if forSome for while throw finally protected extends import final return else break new catch super class case package default try this match continue throws implicit',
        },
        contains: [
          e.C_LINE_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          a,
          { className: 'symbol', begin: "'\\w[\\w\\d_]*(?!')" },
          s,
          l,
          i,
          e.C_NUMBER_MODE,
          { className: 'meta', begin: '@[A-Za-z]+' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'haskell',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          variants: [
            e.COMMENT('--', '$'),
            e.COMMENT('{-', '-}', { contains: ['self'] }),
          ],
        },
        i = { className: 'meta', begin: '{-#', end: '#-}' },
        a = { className: 'meta', begin: '^#', end: '$' },
        s = { className: 'type', begin: "\\b[A-Z][\\w']*", relevance: 0 },
        l = {
          begin: '\\(',
          end: '\\)',
          illegal: '"',
          contains: [
            i,
            a,
            {
              className: 'type',
              begin: '\\b[A-Z][\\w]*(\\((\\.\\.|,|\\w+)\\))?',
            },
            e.inherit(e.TITLE_MODE, { begin: "[_a-z][\\w']*" }),
            n,
          ],
        }
      return {
        name: 'Haskell',
        aliases: ['hs'],
        keywords:
          'let in if then else case of where do module import hiding qualified type data newtype deriving class instance as default infix infixl infixr foreign export ccall stdcall cplusplus jvm dotnet safe unsafe family forall mdo proc rec',
        contains: [
          {
            beginKeywords: 'module',
            end: 'where',
            keywords: 'module where',
            contains: [l, n],
            illegal: '\\W\\.|;',
          },
          {
            begin: '\\bimport\\b',
            end: '$',
            keywords: 'import qualified as hiding',
            contains: [l, n],
            illegal: '\\W\\.|;',
          },
          {
            className: 'class',
            begin: '^(\\s*)?(class|instance)\\b',
            end: 'where',
            keywords: 'class family instance where',
            contains: [s, l, n],
          },
          {
            className: 'class',
            begin: '\\b(data|(new)?type)\\b',
            end: '$',
            keywords: 'data family type newtype deriving',
            contains: [
              i,
              s,
              l,
              { begin: '{', end: '}', contains: l.contains },
              n,
            ],
          },
          { beginKeywords: 'default', end: '$', contains: [s, l, n] },
          {
            beginKeywords: 'infix infixl infixr',
            end: '$',
            contains: [e.C_NUMBER_MODE, n],
          },
          {
            begin: '\\bforeign\\b',
            end: '$',
            keywords:
              'foreign import export ccall stdcall cplusplus jvm dotnet safe unsafe',
            contains: [s, e.QUOTE_STRING_MODE, n],
          },
          {
            className: 'meta',
            begin: '#!\\/usr\\/bin\\/env runhaskell',
            end: '$',
          },
          i,
          a,
          e.QUOTE_STRING_MODE,
          e.C_NUMBER_MODE,
          s,
          e.inherit(e.TITLE_MODE, { begin: "^[_a-z][\\w']*" }),
          n,
          { begin: '->|<-' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'graphql',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'GraphQL',
        aliases: ['gql'],
        keywords: {
          keyword:
            'query mutation subscription|10 input schema implements type interface union scalar fragment|10 enum on ...',
          variable: 'true false null',
        },
        contains: [
          hljs.HASH_COMMENT_MODE,
          hljs.QUOTE_STRING_MODE,
          hljs.NUMBER_MODE,
          {
            className: 'punctuation',
            begin: /[.]{3}/,
            end: '\\W',
            relavance: 0,
          },
          { className: 'variable', begin: /\$/, end: '\\W', excludeEnd: !0 },
          { className: 'meta', begin: /@\w+/, end: '\\W', excludeEnd: !0 },
          {
            className: 'symbol',
            begin: /[_A-Za-z][_0-9A-Za-z]*(?=:)/,
            end: '\\W',
            relavance: 0,
          },
        ],
        illegal: /[;<']|BEGIN/,
      }
    }
  })()
)
hljs.registerLanguage(
  'rego',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'rego',
        aliases: ['rego'],
        keywords: {
          keyword: 'as default else import not null package set some with',
          variable: 'true false',
        },
        contains: [
          hljs.HASH_COMMENT_MODE,
          hljs.QUOTE_STRING_MODE,
          hljs.NUMBER_MODE,
          {
            className: 'punctuation',
            begin: /[,;.\[\]{}()]/,
            end: '\\W',
            relavance: 0,
          },
          {
            className: 'variable',
            begin: /\b\w+\b(?=\s*\.)/,
            end: '\\W',
            excludeEnd: !0,
          },
        ],
        illegal: /[<']/,
      }
    }
  })()
)
hljs.registerLanguage(
  'julia',
  (function () {
    'use strict'
    return function (e) {
      var r = '[A-Za-z_\\u00A1-\\uFFFF][A-Za-z_0-9\\u00A1-\\uFFFF]*',
        t = {
          $pattern: r,
          keyword:
            'in isa where baremodule begin break catch ccall const continue do else elseif end export false finally for function global if import importall let local macro module quote return true try using while type immutable abstract bitstype typealias ',
          literal:
            'true false ARGS C_NULL DevNull ENDIAN_BOM ENV I Inf Inf16 Inf32 Inf64 InsertionSort JULIA_HOME LOAD_PATH MergeSort NaN NaN16 NaN32 NaN64 PROGRAM_FILE QuickSort RoundDown RoundFromZero RoundNearest RoundNearestTiesAway RoundNearestTiesUp RoundToZero RoundUp STDERR STDIN STDOUT VERSION catalan e|0 eu|0 eulergamma golden im nothing pi γ π φ ',
          built_in:
            'ANY AbstractArray AbstractChannel AbstractFloat AbstractMatrix AbstractRNG AbstractSerializer AbstractSet AbstractSparseArray AbstractSparseMatrix AbstractSparseVector AbstractString AbstractUnitRange AbstractVecOrMat AbstractVector Any ArgumentError Array AssertionError Associative Base64DecodePipe Base64EncodePipe Bidiagonal BigFloat BigInt BitArray BitMatrix BitVector Bool BoundsError BufferStream CachingPool CapturedException CartesianIndex CartesianRange Cchar Cdouble Cfloat Channel Char Cint Cintmax_t Clong Clonglong ClusterManager Cmd CodeInfo Colon Complex Complex128 Complex32 Complex64 CompositeException Condition ConjArray ConjMatrix ConjVector Cptrdiff_t Cshort Csize_t Cssize_t Cstring Cuchar Cuint Cuintmax_t Culong Culonglong Cushort Cwchar_t Cwstring DataType Date DateFormat DateTime DenseArray DenseMatrix DenseVecOrMat DenseVector Diagonal Dict DimensionMismatch Dims DirectIndexString Display DivideError DomainError EOFError EachLine Enum Enumerate ErrorException Exception ExponentialBackOff Expr Factorization FileMonitor Float16 Float32 Float64 Function Future GlobalRef GotoNode HTML Hermitian IO IOBuffer IOContext IOStream IPAddr IPv4 IPv6 IndexCartesian IndexLinear IndexStyle InexactError InitError Int Int128 Int16 Int32 Int64 Int8 IntSet Integer InterruptException InvalidStateException Irrational KeyError LabelNode LinSpace LineNumberNode LoadError LowerTriangular MIME Matrix MersenneTwister Method MethodError MethodTable Module NTuple NewvarNode NullException Nullable Number ObjectIdDict OrdinalRange OutOfMemoryError OverflowError Pair ParseError PartialQuickSort PermutedDimsArray Pipe PollingFileWatcher ProcessExitedException Ptr QuoteNode RandomDevice Range RangeIndex Rational RawFD ReadOnlyMemoryError Real ReentrantLock Ref Regex RegexMatch RemoteChannel RemoteException RevString RoundingMode RowVector SSAValue SegmentationFault SerializationState Set SharedArray SharedMatrix SharedVector Signed SimpleVector Slot SlotNumber SparseMatrixCSC SparseVector StackFrame StackOverflowError StackTrace StepRange StepRangeLen StridedArray StridedMatrix StridedVecOrMat StridedVector String SubArray SubString SymTridiagonal Symbol Symmetric SystemError TCPSocket Task Text TextDisplay Timer Tridiagonal Tuple Type TypeError TypeMapEntry TypeMapLevel TypeName TypeVar TypedSlot UDPSocket UInt UInt128 UInt16 UInt32 UInt64 UInt8 UndefRefError UndefVarError UnicodeError UniformScaling Union UnionAll UnitRange Unsigned UpperTriangular Val Vararg VecElement VecOrMat Vector VersionNumber Void WeakKeyDict WeakRef WorkerConfig WorkerPool ',
        },
        a = { keywords: t, illegal: /<\// },
        n = { className: 'subst', begin: /\$\(/, end: /\)/, keywords: t },
        o = { className: 'variable', begin: '\\$' + r },
        i = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE, n, o],
          variants: [
            { begin: /\w*"""/, end: /"""\w*/, relevance: 10 },
            { begin: /\w*"/, end: /"\w*/ },
          ],
        },
        l = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE, n, o],
          begin: '`',
          end: '`',
        },
        s = { className: 'meta', begin: '@' + r }
      return (
        (a.name = 'Julia'),
        (a.contains = [
          {
            className: 'number',
            begin:
              /(\b0x[\d_]*(\.[\d_]*)?|0x\.\d[\d_]*)p[-+]?\d+|\b0[box][a-fA-F0-9][a-fA-F0-9_]*|(\b\d[\d_]*(\.[\d_]*)?|\.\d[\d_]*)([eEfF][-+]?\d+)?/,
            relevance: 0,
          },
          { className: 'string', begin: /'(.|\\[xXuU][a-zA-Z0-9]+)'/ },
          i,
          l,
          s,
          {
            className: 'comment',
            variants: [
              { begin: '#=', end: '=#', relevance: 10 },
              { begin: '#', end: '$' },
            ],
          },
          e.HASH_COMMENT_MODE,
          {
            className: 'keyword',
            begin:
              '\\b(((abstract|primitive)\\s+)type|(mutable\\s+)?struct)\\b',
          },
          { begin: /<:/ },
        ]),
        (n.contains = a.contains),
        a
      )
    }
  })()
)
hljs.registerLanguage(
  'nix',
  (function () {
    'use strict'
    return function (e) {
      var n = {
          keyword: 'rec with let in inherit assert if else then',
          literal: 'true false or and null',
          built_in:
            'import abort baseNameOf dirOf isNull builtins map removeAttrs throw toString derivation',
        },
        i = { className: 'subst', begin: /\$\{/, end: /}/, keywords: n },
        t = {
          className: 'string',
          contains: [i],
          variants: [
            { begin: "''", end: "''" },
            { begin: '"', end: '"' },
          ],
        },
        s = [
          e.NUMBER_MODE,
          e.HASH_COMMENT_MODE,
          e.C_BLOCK_COMMENT_MODE,
          t,
          {
            begin: /[a-zA-Z0-9-_]+(\s*=)/,
            returnBegin: !0,
            relevance: 0,
            contains: [{ className: 'attr', begin: /\S+/ }],
          },
        ]
      return (
        (i.contains = s),
        { name: 'Nix', aliases: ['nixos'], keywords: n, contains: s }
      )
    }
  })()
)
hljs.registerLanguage(
  'erb',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'ERB',
        subLanguage: 'xml',
        contains: [
          e.COMMENT('<%#', '%>'),
          {
            begin: '<%[%=-]?',
            end: '[%-]?%>',
            subLanguage: 'ruby',
            excludeBegin: !0,
            excludeEnd: !0,
          },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'haml',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'HAML',
        case_insensitive: !0,
        contains: [
          {
            className: 'meta',
            begin:
              '^!!!( (5|1\\.1|Strict|Frameset|Basic|Mobile|RDFa|XML\\b.*))?$',
            relevance: 10,
          },
          e.COMMENT('^\\s*(!=#|=#|-#|/).*$', !1, { relevance: 0 }),
          {
            begin: '^\\s*(-|=|!=)(?!#)',
            starts: { end: '\\n', subLanguage: 'ruby' },
          },
          {
            className: 'tag',
            begin: '^\\s*%',
            contains: [
              { className: 'selector-tag', begin: '\\w+' },
              { className: 'selector-id', begin: '#[\\w-]+' },
              { className: 'selector-class', begin: '\\.[\\w-]+' },
              {
                begin: '{\\s*',
                end: '\\s*}',
                contains: [
                  {
                    begin: ':\\w+\\s*=>',
                    end: ',\\s+',
                    returnBegin: !0,
                    endsWithParent: !0,
                    contains: [
                      { className: 'attr', begin: ':\\w+' },
                      e.APOS_STRING_MODE,
                      e.QUOTE_STRING_MODE,
                      { begin: '\\w+', relevance: 0 },
                    ],
                  },
                ],
              },
              {
                begin: '\\(\\s*',
                end: '\\s*\\)',
                excludeEnd: !0,
                contains: [
                  {
                    begin: '\\w+\\s*=',
                    end: '\\s+',
                    returnBegin: !0,
                    endsWithParent: !0,
                    contains: [
                      { className: 'attr', begin: '\\w+', relevance: 0 },
                      e.APOS_STRING_MODE,
                      e.QUOTE_STRING_MODE,
                      { begin: '\\w+', relevance: 0 },
                    ],
                  },
                ],
              },
            ],
          },
          { begin: '^\\s*[=~]\\s*' },
          { begin: '#{', starts: { end: '}', subLanguage: 'ruby' } },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'excel',
  (function () {
    'use strict'
    return function (E) {
      return {
        name: 'Excel formulae',
        aliases: ['xlsx', 'xls'],
        case_insensitive: !0,
        keywords: {
          $pattern: /[a-zA-Z][\w\.]*/,
          built_in:
            'ABS ACCRINT ACCRINTM ACOS ACOSH ACOT ACOTH AGGREGATE ADDRESS AMORDEGRC AMORLINC AND ARABIC AREAS ASC ASIN ASINH ATAN ATAN2 ATANH AVEDEV AVERAGE AVERAGEA AVERAGEIF AVERAGEIFS BAHTTEXT BASE BESSELI BESSELJ BESSELK BESSELY BETADIST BETA.DIST BETAINV BETA.INV BIN2DEC BIN2HEX BIN2OCT BINOMDIST BINOM.DIST BINOM.DIST.RANGE BINOM.INV BITAND BITLSHIFT BITOR BITRSHIFT BITXOR CALL CEILING CEILING.MATH CEILING.PRECISE CELL CHAR CHIDIST CHIINV CHITEST CHISQ.DIST CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT CHISQ.TEST CHOOSE CLEAN CODE COLUMN COLUMNS COMBIN COMBINA COMPLEX CONCAT CONCATENATE CONFIDENCE CONFIDENCE.NORM CONFIDENCE.T CONVERT CORREL COS COSH COT COTH COUNT COUNTA COUNTBLANK COUNTIF COUNTIFS COUPDAYBS COUPDAYS COUPDAYSNC COUPNCD COUPNUM COUPPCD COVAR COVARIANCE.P COVARIANCE.S CRITBINOM CSC CSCH CUBEKPIMEMBER CUBEMEMBER CUBEMEMBERPROPERTY CUBERANKEDMEMBER CUBESET CUBESETCOUNT CUBEVALUE CUMIPMT CUMPRINC DATE DATEDIF DATEVALUE DAVERAGE DAY DAYS DAYS360 DB DBCS DCOUNT DCOUNTA DDB DEC2BIN DEC2HEX DEC2OCT DECIMAL DEGREES DELTA DEVSQ DGET DISC DMAX DMIN DOLLAR DOLLARDE DOLLARFR DPRODUCT DSTDEV DSTDEVP DSUM DURATION DVAR DVARP EDATE EFFECT ENCODEURL EOMONTH ERF ERF.PRECISE ERFC ERFC.PRECISE ERROR.TYPE EUROCONVERT EVEN EXACT EXP EXPON.DIST EXPONDIST FACT FACTDOUBLE FALSE|0 F.DIST FDIST F.DIST.RT FILTERXML FIND FINDB F.INV F.INV.RT FINV FISHER FISHERINV FIXED FLOOR FLOOR.MATH FLOOR.PRECISE FORECAST FORECAST.ETS FORECAST.ETS.CONFINT FORECAST.ETS.SEASONALITY FORECAST.ETS.STAT FORECAST.LINEAR FORMULATEXT FREQUENCY F.TEST FTEST FV FVSCHEDULE GAMMA GAMMA.DIST GAMMADIST GAMMA.INV GAMMAINV GAMMALN GAMMALN.PRECISE GAUSS GCD GEOMEAN GESTEP GETPIVOTDATA GROWTH HARMEAN HEX2BIN HEX2DEC HEX2OCT HLOOKUP HOUR HYPERLINK HYPGEOM.DIST HYPGEOMDIST IF IFERROR IFNA IFS IMABS IMAGINARY IMARGUMENT IMCONJUGATE IMCOS IMCOSH IMCOT IMCSC IMCSCH IMDIV IMEXP IMLN IMLOG10 IMLOG2 IMPOWER IMPRODUCT IMREAL IMSEC IMSECH IMSIN IMSINH IMSQRT IMSUB IMSUM IMTAN INDEX INDIRECT INFO INT INTERCEPT INTRATE IPMT IRR ISBLANK ISERR ISERROR ISEVEN ISFORMULA ISLOGICAL ISNA ISNONTEXT ISNUMBER ISODD ISREF ISTEXT ISO.CEILING ISOWEEKNUM ISPMT JIS KURT LARGE LCM LEFT LEFTB LEN LENB LINEST LN LOG LOG10 LOGEST LOGINV LOGNORM.DIST LOGNORMDIST LOGNORM.INV LOOKUP LOWER MATCH MAX MAXA MAXIFS MDETERM MDURATION MEDIAN MID MIDBs MIN MINIFS MINA MINUTE MINVERSE MIRR MMULT MOD MODE MODE.MULT MODE.SNGL MONTH MROUND MULTINOMIAL MUNIT N NA NEGBINOM.DIST NEGBINOMDIST NETWORKDAYS NETWORKDAYS.INTL NOMINAL NORM.DIST NORMDIST NORMINV NORM.INV NORM.S.DIST NORMSDIST NORM.S.INV NORMSINV NOT NOW NPER NPV NUMBERVALUE OCT2BIN OCT2DEC OCT2HEX ODD ODDFPRICE ODDFYIELD ODDLPRICE ODDLYIELD OFFSET OR PDURATION PEARSON PERCENTILE.EXC PERCENTILE.INC PERCENTILE PERCENTRANK.EXC PERCENTRANK.INC PERCENTRANK PERMUT PERMUTATIONA PHI PHONETIC PI PMT POISSON.DIST POISSON POWER PPMT PRICE PRICEDISC PRICEMAT PROB PRODUCT PROPER PV QUARTILE QUARTILE.EXC QUARTILE.INC QUOTIENT RADIANS RAND RANDBETWEEN RANK.AVG RANK.EQ RANK RATE RECEIVED REGISTER.ID REPLACE REPLACEB REPT RIGHT RIGHTB ROMAN ROUND ROUNDDOWN ROUNDUP ROW ROWS RRI RSQ RTD SEARCH SEARCHB SEC SECH SECOND SERIESSUM SHEET SHEETS SIGN SIN SINH SKEW SKEW.P SLN SLOPE SMALL SQL.REQUEST SQRT SQRTPI STANDARDIZE STDEV STDEV.P STDEV.S STDEVA STDEVP STDEVPA STEYX SUBSTITUTE SUBTOTAL SUM SUMIF SUMIFS SUMPRODUCT SUMSQ SUMX2MY2 SUMX2PY2 SUMXMY2 SWITCH SYD T TAN TANH TBILLEQ TBILLPRICE TBILLYIELD T.DIST T.DIST.2T T.DIST.RT TDIST TEXT TEXTJOIN TIME TIMEVALUE T.INV T.INV.2T TINV TODAY TRANSPOSE TREND TRIM TRIMMEAN TRUE|0 TRUNC T.TEST TTEST TYPE UNICHAR UNICODE UPPER VALUE VAR VAR.P VAR.S VARA VARP VARPA VDB VLOOKUP WEBSERVICE WEEKDAY WEEKNUM WEIBULL WEIBULL.DIST WORKDAY WORKDAY.INTL XIRR XNPV XOR YEAR YEARFRAC YIELD YIELDDISC YIELDMAT Z.TEST ZTEST',
        },
        contains: [
          {
            begin: /^=/,
            end: /[^=]/,
            returnEnd: !0,
            illegal: /=/,
            relevance: 10,
          },
          {
            className: 'symbol',
            begin: /\b[A-Z]{1,2}\d+\b/,
            end: /[^\d]/,
            excludeEnd: !0,
            relevance: 0,
          },
          {
            className: 'symbol',
            begin: /[A-Z]{0,2}\d*:[A-Z]{0,2}\d*/,
            relevance: 0,
          },
          E.BACKSLASH_ESCAPE,
          E.QUOTE_STRING_MODE,
          { className: 'number', begin: E.NUMBER_RE + '(%)?', relevance: 0 },
          E.COMMENT(/\bN\(/, /\)/, {
            excludeBegin: !0,
            excludeEnd: !0,
            illegal: /\n/,
          }),
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'basic',
  (function () {
    'use strict'
    return function (E) {
      return {
        name: 'BASIC',
        case_insensitive: !0,
        illegal: '^.',
        keywords: {
          $pattern: '[a-zA-Z][a-zA-Z0-9_$%!#]*',
          keyword:
            'ABS ASC AND ATN AUTO|0 BEEP BLOAD|10 BSAVE|10 CALL CALLS CDBL CHAIN CHDIR CHR$|10 CINT CIRCLE CLEAR CLOSE CLS COLOR COM COMMON CONT COS CSNG CSRLIN CVD CVI CVS DATA DATE$ DEFDBL DEFINT DEFSNG DEFSTR DEF|0 SEG USR DELETE DIM DRAW EDIT END ENVIRON ENVIRON$ EOF EQV ERASE ERDEV ERDEV$ ERL ERR ERROR EXP FIELD FILES FIX FOR|0 FRE GET GOSUB|10 GOTO HEX$ IF THEN ELSE|0 INKEY$ INP INPUT INPUT# INPUT$ INSTR IMP INT IOCTL IOCTL$ KEY ON OFF LIST KILL LEFT$ LEN LET LINE LLIST LOAD LOC LOCATE LOF LOG LPRINT USING LSET MERGE MID$ MKDIR MKD$ MKI$ MKS$ MOD NAME NEW NEXT NOISE NOT OCT$ ON OR PEN PLAY STRIG OPEN OPTION BASE OUT PAINT PALETTE PCOPY PEEK PMAP POINT POKE POS PRINT PRINT] PSET PRESET PUT RANDOMIZE READ REM RENUM RESET|0 RESTORE RESUME RETURN|0 RIGHT$ RMDIR RND RSET RUN SAVE SCREEN SGN SHELL SIN SOUND SPACE$ SPC SQR STEP STICK STOP STR$ STRING$ SWAP SYSTEM TAB TAN TIME$ TIMER TROFF TRON TO USR VAL VARPTR VARPTR$ VIEW WAIT WHILE WEND WIDTH WINDOW WRITE XOR',
        },
        contains: [
          E.QUOTE_STRING_MODE,
          E.COMMENT('REM', '$', { relevance: 10 }),
          E.COMMENT("'", '$', { relevance: 0 }),
          { className: 'symbol', begin: '^[0-9]+ ', relevance: 10 },
          {
            className: 'number',
            begin: '\\b([0-9]+[0-9edED.]*[#!]?)',
            relevance: 0,
          },
          { className: 'number', begin: '(&[hH][0-9a-fA-F]{1,4})' },
          { className: 'number', begin: '(&[oO][0-7]{1,6})' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'purebasic',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'PureBASIC',
        aliases: ['pb', 'pbi'],
        keywords:
          'Align And Array As Break CallDebugger Case CompilerCase CompilerDefault CompilerElse CompilerElseIf CompilerEndIf CompilerEndSelect CompilerError CompilerIf CompilerSelect CompilerWarning Continue Data DataSection Debug DebugLevel Declare DeclareC DeclareCDLL DeclareDLL DeclareModule Default Define Dim DisableASM DisableDebugger DisableExplicit Else ElseIf EnableASM EnableDebugger EnableExplicit End EndDataSection EndDeclareModule EndEnumeration EndIf EndImport EndInterface EndMacro EndModule EndProcedure EndSelect EndStructure EndStructureUnion EndWith Enumeration EnumerationBinary Extends FakeReturn For ForEach ForEver Global Gosub Goto If Import ImportC IncludeBinary IncludeFile IncludePath Interface List Macro MacroExpandedCount Map Module NewList NewMap Next Not Or Procedure ProcedureC ProcedureCDLL ProcedureDLL ProcedureReturn Protected Prototype PrototypeC ReDim Read Repeat Restore Return Runtime Select Shared Static Step Structure StructureUnion Swap Threaded To UndefineMacro Until Until  UnuseModule UseModule Wend While With XIncludeFile XOr',
        contains: [
          e.COMMENT(';', '$', { relevance: 0 }),
          {
            className: 'function',
            begin: '\\b(Procedure|Declare)(C|CDLL|DLL)?\\b',
            end: '\\(',
            excludeEnd: !0,
            returnBegin: !0,
            contains: [
              {
                className: 'keyword',
                begin: '(Procedure|Declare)(C|CDLL|DLL)?',
                excludeEnd: !0,
              },
              { className: 'type', begin: '\\.\\w*' },
              e.UNDERSCORE_TITLE_MODE,
            ],
          },
          { className: 'string', begin: '(~)?"', end: '"', illegal: '\\n' },
          { className: 'symbol', begin: '#[a-zA-Z_]\\w*\\$?' },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'lisp',
  (function () {
    'use strict'
    return function (e) {
      var n =
          '[a-zA-Z_\\-\\+\\*\\/\\<\\=\\>\\&\\#][a-zA-Z0-9_\\-\\+\\*\\/\\<\\=\\>\\&\\#!]*',
        i =
          '(\\-|\\+)?\\d+(\\.\\d+|\\/\\d+)?((d|e|f|l|s|D|E|F|L|S)(\\+|\\-)?\\d+)?',
        a = { className: 'literal', begin: '\\b(t{1}|nil)\\b' },
        s = {
          className: 'number',
          variants: [
            { begin: i, relevance: 0 },
            { begin: '#(b|B)[0-1]+(/[0-1]+)?' },
            { begin: '#(o|O)[0-7]+(/[0-7]+)?' },
            { begin: '#(x|X)[0-9a-fA-F]+(/[0-9a-fA-F]+)?' },
            { begin: '#(c|C)\\(' + i + ' +' + i, end: '\\)' },
          ],
        },
        b = e.inherit(e.QUOTE_STRING_MODE, { illegal: null }),
        g = e.COMMENT(';', '$', { relevance: 0 }),
        l = { begin: '\\*', end: '\\*' },
        t = { className: 'symbol', begin: '[:&]' + n },
        r = { begin: n, relevance: 0 },
        c = {
          contains: [
            s,
            b,
            l,
            t,
            { begin: '\\(', end: '\\)', contains: ['self', a, b, s, r] },
            r,
          ],
          variants: [
            { begin: "['`]\\(", end: '\\)' },
            { begin: '\\(quote ', end: '\\)', keywords: { name: 'quote' } },
            { begin: "'\\|[^]*?\\|" },
          ],
        },
        d = {
          variants: [
            { begin: "'" + n },
            { begin: "#'" + n + '(::' + n + ')*' },
          ],
        },
        o = { begin: '\\(\\s*', end: '\\)' },
        u = { endsWithParent: !0, relevance: 0 }
      return (
        (o.contains = [
          {
            className: 'name',
            variants: [{ begin: n }, { begin: '\\|[^]*?\\|' }],
          },
          u,
        ]),
        (u.contains = [c, d, o, a, s, b, g, l, t, { begin: '\\|[^]*?\\|' }, r]),
        {
          name: 'Lisp',
          illegal: /\S/,
          contains: [s, e.SHEBANG(), a, b, g, c, d, o, r],
        }
      )
    }
  })()
)
hljs.registerLanguage(
  'dockerfile',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'Dockerfile',
        aliases: ['docker'],
        case_insensitive: !0,
        keywords: 'from maintainer expose env arg user onbuild stopsignal',
        contains: [
          e.HASH_COMMENT_MODE,
          e.APOS_STRING_MODE,
          e.QUOTE_STRING_MODE,
          e.NUMBER_MODE,
          {
            beginKeywords:
              'run cmd entrypoint volume add copy workdir label healthcheck shell',
            starts: { end: /[^\\]$/, subLanguage: 'bash' },
          },
        ],
        illegal: '</',
      }
    }
  })()
)
hljs.registerLanguage(
  'erlang',
  (function () {
    'use strict'
    return function (e) {
      var n = "[a-z'][a-zA-Z0-9_']*",
        r = '(' + n + ':' + n + '|' + n + ')',
        a = {
          keyword:
            'after and andalso|10 band begin bnot bor bsl bzr bxor case catch cond div end fun if let not of orelse|10 query receive rem try when xor',
          literal: 'false true',
        },
        i = e.COMMENT('%', '$'),
        c = {
          className: 'number',
          begin:
            '\\b(\\d+(_\\d+)*#[a-fA-F0-9]+(_[a-fA-F0-9]+)*|\\d+(_\\d+)*(\\.\\d+(_\\d+)*)?([eE][-+]?\\d+)?)',
          relevance: 0,
        },
        s = { begin: 'fun\\s+' + n + '/\\d+' },
        t = {
          begin: r + '\\(',
          end: '\\)',
          returnBegin: !0,
          relevance: 0,
          contains: [
            { begin: r, relevance: 0 },
            {
              begin: '\\(',
              end: '\\)',
              endsWithParent: !0,
              returnEnd: !0,
              relevance: 0,
            },
          ],
        },
        d = { begin: '{', end: '}', relevance: 0 },
        o = { begin: '\\b_([A-Z][A-Za-z0-9_]*)?', relevance: 0 },
        l = { begin: '[A-Z][a-zA-Z0-9_]*', relevance: 0 },
        b = {
          begin: '#' + e.UNDERSCORE_IDENT_RE,
          relevance: 0,
          returnBegin: !0,
          contains: [
            { begin: '#' + e.UNDERSCORE_IDENT_RE, relevance: 0 },
            { begin: '{', end: '}', relevance: 0 },
          ],
        },
        g = {
          beginKeywords: 'fun receive if try case',
          end: 'end',
          keywords: a,
        }
      g.contains = [
        i,
        s,
        e.inherit(e.APOS_STRING_MODE, { className: '' }),
        g,
        t,
        e.QUOTE_STRING_MODE,
        c,
        d,
        o,
        l,
        b,
      ]
      var u = [i, s, g, t, e.QUOTE_STRING_MODE, c, d, o, l, b]
      ;(t.contains[1].contains = u),
        (d.contains = u),
        (b.contains[1].contains = u)
      var E = { className: 'params', begin: '\\(', end: '\\)', contains: u }
      return {
        name: 'Erlang',
        aliases: ['erl'],
        keywords: a,
        illegal: '(</|\\*=|\\+=|-=|/\\*|\\*/|\\(\\*|\\*\\))',
        contains: [
          {
            className: 'function',
            begin: '^' + n + '\\s*\\(',
            end: '->',
            returnBegin: !0,
            illegal: '\\(|#|//|/\\*|\\\\|:|;',
            contains: [E, e.inherit(e.TITLE_MODE, { begin: n })],
            starts: { end: ';|\\.', keywords: a, contains: u },
          },
          i,
          {
            begin: '^-',
            end: '\\.',
            relevance: 0,
            excludeEnd: !0,
            returnBegin: !0,
            keywords: {
              $pattern: '-' + e.IDENT_RE,
              keyword:
                '-module -record -undef -export -ifdef -ifndef -author -copyright -doc -vsn -import -include -include_lib -compile -define -else -endif -file -behaviour -behavior -spec',
            },
            contains: [E],
          },
          c,
          e.QUOTE_STRING_MODE,
          b,
          o,
          l,
          d,
          { begin: /\.$/ },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'elixir',
  (function () {
    'use strict'
    return function (e) {
      var n = '[a-zA-Z_][a-zA-Z0-9_.]*(\\!|\\?)?',
        i = {
          $pattern: n,
          keyword:
            'and false then defined module in return redo retry end for true self when next until do begin unless nil break not case cond alias while ensure or include use alias fn quote require import with|0',
        },
        a = { className: 'subst', begin: '#\\{', end: '}', keywords: i },
        s = {
          className: 'number',
          begin:
            '(\\b0o[0-7_]+)|(\\b0b[01_]+)|(\\b0x[0-9a-fA-F_]+)|(-?\\b[1-9][0-9_]*(.[0-9_]+([eE][-+]?[0-9]+)?)?)',
          relevance: 0,
        },
        b = {
          className: 'string',
          begin: '~[a-z](?=[/|([{<"\'])',
          contains: [
            {
              endsParent: !0,
              contains: [
                {
                  contains: [e.BACKSLASH_ESCAPE, a],
                  variants: [
                    { begin: /"/, end: /"/ },
                    { begin: /'/, end: /'/ },
                    { begin: /\//, end: /\// },
                    { begin: /\|/, end: /\|/ },
                    { begin: /\(/, end: /\)/ },
                    { begin: /\[/, end: /\]/ },
                    { begin: /\{/, end: /\}/ },
                    { begin: /</, end: />/ },
                  ],
                },
              ],
            },
          ],
        },
        d = {
          className: 'string',
          contains: [e.BACKSLASH_ESCAPE, a],
          variants: [
            { begin: /"""/, end: /"""/ },
            { begin: /'''/, end: /'''/ },
            { begin: /~S"""/, end: /"""/, contains: [] },
            { begin: /~S"/, end: /"/, contains: [] },
            { begin: /~S'''/, end: /'''/, contains: [] },
            { begin: /~S'/, end: /'/, contains: [] },
            { begin: /'/, end: /'/ },
            { begin: /"/, end: /"/ },
          ],
        },
        r = {
          className: 'function',
          beginKeywords: 'def defp defmacro',
          end: /\B\b/,
          contains: [e.inherit(e.TITLE_MODE, { begin: n, endsParent: !0 })],
        },
        g = e.inherit(r, {
          className: 'class',
          beginKeywords: 'defimpl defmodule defprotocol defrecord',
          end: /\bdo\b|$|;/,
        }),
        t = [
          d,
          {
            className: 'string',
            begin: '~[A-Z](?=[/|([{<"\'])',
            contains: [
              { begin: /"/, end: /"/ },
              { begin: /'/, end: /'/ },
              { begin: /\//, end: /\// },
              { begin: /\|/, end: /\|/ },
              { begin: /\(/, end: /\)/ },
              { begin: /\[/, end: /\]/ },
              { begin: /\{/, end: /\}/ },
              { begin: /\</, end: /\>/ },
            ],
          },
          b,
          e.HASH_COMMENT_MODE,
          g,
          r,
          { begin: '::' },
          {
            className: 'symbol',
            begin: ':(?![\\s:])',
            contains: [
              d,
              {
                begin:
                  '[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?',
              },
            ],
            relevance: 0,
          },
          { className: 'symbol', begin: n + ':(?!:)', relevance: 0 },
          s,
          { className: 'variable', begin: '(\\$\\W)|((\\$|\\@\\@?)(\\w+))' },
          { begin: '->' },
          {
            begin: '(' + e.RE_STARTERS_RE + ')\\s*',
            contains: [
              e.HASH_COMMENT_MODE,
              { begin: /\/: (?=\d+\s*[,\]])/, relevance: 0, contains: [s] },
              {
                className: 'regexp',
                illegal: '\\n',
                contains: [e.BACKSLASH_ESCAPE, a],
                variants: [
                  { begin: '/', end: '/[a-z]*' },
                  { begin: '%r\\[', end: '\\][a-z]*' },
                ],
              },
            ],
            relevance: 0,
          },
        ]
      return (a.contains = t), { name: 'Elixir', keywords: i, contains: t }
    }
  })()
)
hljs.registerLanguage(
  'ocaml',
  (function () {
    'use strict'
    return function (e) {
      return {
        name: 'OCaml',
        aliases: ['ml'],
        keywords: {
          $pattern: '[a-z_]\\w*!?',
          keyword:
            'and as assert asr begin class constraint do done downto else end exception external for fun function functor if in include inherit! inherit initializer land lazy let lor lsl lsr lxor match method!|10 method mod module mutable new object of open! open or private rec sig struct then to try type val! val virtual when while with parser value',
          built_in:
            'array bool bytes char exn|5 float int int32 int64 list lazy_t|5 nativeint|5 string unit in_channel out_channel ref',
          literal: 'true false',
        },
        illegal: /\/\/|>>/,
        contains: [
          {
            className: 'literal',
            begin: '\\[(\\|\\|)?\\]|\\(\\)',
            relevance: 0,
          },
          e.COMMENT('\\(\\*', '\\*\\)', { contains: ['self'] }),
          { className: 'symbol', begin: "'[A-Za-z_](?!')[\\w']*" },
          { className: 'type', begin: "`[A-Z][\\w']*" },
          { className: 'type', begin: "\\b[A-Z][\\w']*", relevance: 0 },
          { begin: "[a-z_]\\w*'[\\w']*", relevance: 0 },
          e.inherit(e.APOS_STRING_MODE, { className: 'string', relevance: 0 }),
          e.inherit(e.QUOTE_STRING_MODE, { illegal: null }),
          {
            className: 'number',
            begin:
              '\\b(0[xX][a-fA-F0-9_]+[Lln]?|0[oO][0-7_]+[Lln]?|0[bB][01_]+[Lln]?|[0-9][0-9_]*([Lln]|(\\.[0-9_]*)?([eE][-+]?[0-9_]+)?)?)',
            relevance: 0,
          },
          { begin: /[-=]>/ },
        ],
      }
    }
  })()
)
hljs.registerLanguage(
  'abap',
  (() => {
    'use strict'
    return (E) => ({
      name: 'ABAP',
      case_insensitive: !0,
      aliases: ['sap-abap', 'abap'],
      keywords: {
        keyword:
          'ABBREVIATED ABS ABSTRACT ABSTRACTFINAL ACCEPT ACCEPTING ACCORDING ACOS ACTUAL ADD|0 ADD-CORRESPONDING ADDITIONS ADJACENT AFTER|0 ALIASES ALL|0 ALLOCATE ANALYZER AND|0 APPEND APPENDING AS|0 ASCENDING DESCENDING ASIN ASSIGN ASSIGNING ATAN ATTRIBUTE AUTHORITY-CHECK AVG|0 BACK|0 BACKGOUND BEFORE BETWEEN BINARY BIT BLANK|0 BLOCK BREAK-POINT BUFFER BY|0 BYPASSING BYTE|0 BYTECHARACTER CALL|0 CASTING CEIL|0 CENTERED CHANGE CHANGING CHARACTER CHECK CHECKBOX CLASS-DATA CLASS-EVENTS CLASS-METHODS CLEANUP CLEAR|0 CLASS ENDCLASS CLIENT CLOCK|0 CLOSE|0 COL_BACKGROUND COL_HEADING COL_NORMAL COL_TOTAL COLLECT|0 COLOR|0 COLUMN COMMENT COMMIT COMMON COMMUNICATION COMPARING COMPONENT COMPONENTS COMPUTE CONCATENATE CONDENSE CONSTANTS CONTEXT CONTEXTS CONTINUE|0 CONTROL CONTROLS CONVERSION CONVERT COS COSH COUNT|0 COUNTRY COUNTY CREATE CURRENCY CURRENT CURSOR CUSTOMER-FUNCTION DATA DATABASE DATASET DATE DEALLOCATE DECIMALS DEFAULT DEFERRED DEFINE DEFINING DEFINITION DELETE DELETING DEMAND DESCENDING DESCRIBE DESTINATION DIALOG DIRECTORY DISTANCE DISTINCT DIVIDE DIVIDE-CORRESPONDING DUPLICATE DUPLICATES DURING DYNAMIC EDIT EDITOR-CALL ELSE ELSEIF ENCODING ENDING ENDON ENTRIES ERRORS EVENT EVENTS EXCEPTION EXCEPTIONS EXCEPTION-TABLE EXCLUDE EXCLUDING EXIT EXIT-COMMAND EXPORT EXPORTING EXTENDED EXTENSION EXTRACT FETCH FIELD FIELD-GROUPS FIELDSNO FIELD-SYMBOLS FILTER FINAL FIND|0 FIRST FLOOR FOR|0 FORMAT FORWARDBACKWARD FOUND FRAC FRAME FREE|0 FRIENDS FROM FUNCTION-POOL GET|0 GIVING GROUP HANDLER HASHED HAVING HEADER HEADING HELP-ID HIDE|0 HIGHLOW HOLD|0 HOTSPOT ICON IGNORING IMMEDIATELY IMPLEMENTATION IMPORT IMPORTING IN INCLUDE|0 INCREMENT INDEX|0 INDEX-LINE INHERITING INIT INITIAL INITIALIZATION INNER INNERLEFT INSERT INSTANCES INTENSIFIED INTERFACES INTERVALS INTO INVERTED-DATE IS|0 ITAB JOIN KEEPING KEY|0 KEYS KIND LANGUAGE LAST|0 LEADING LEAVE LEFT LEFT-JUSTIFIED LEFTRIGHT LEFTRIGHTCIRCULAR LEGACY LENGTH LIKE LINE LINE-COUNT LINES LINE-SELECTION LINE-SIZE LIST LIST-PROCESSING LOAD LOAD-OF-PROGRAM LOCAL LOCALE LOG LOG10 LOWER MARGIN MARK MASK MATCH MAX MAXIMUM MEMORY|0 MESSAGE MESSAGE-ID MESSAGES METHODS MIN MOD MODE MODEIN MODIF MODIFIER MODIFY MOVE MOVE-CORRESPONDING MULTIPLY MULTIPLY-CORRESPONDING NEW|0 NEW-LINE NEW-PAGE NEXT|0 NODES NODETABLE NO-DISPLAY NO-GAP NO-GAPS NO-HEADINGWITH-HEADING NO-SCROLLING NO-SCROLLINGSCROLLING NOT|0 NO-TITLE WITH-TITLE NO-ZERO NP NS NUMBER OBJECT|0 OBLIGATORY OCCURENCE OCCURENCES OCCURS OF|0 OFF|0 OFFSET ON|0 ONLY|0 OPEN OPTION OPTIONAL OR|0 ORDER OTHERS|0 OUTER OUTPUT-LENGTH OVERLAY PACK PACKAGE PAGE PAGELAST PAGEOF PAGEPAGE PAGES PARAMETER PARAMETERS PARAMETER-TABLE PART PERFORM PERFORMING PFN PF-STATUS PLACES POS_HIGH POS_LOW POSITION POSITIONS PRIMARY PRINT PRINT-CONTROL PRIVATE PROCESS PROGRAM PROPERTY PROTECTED PUBLIC PUSHBUTTON PUT QUICKINFO RADIOBUTTON RAISE|0 RAISING RANGE RANGES READ RECEIVE RECEIVING REDEFINITION REF REFERENCE REFRESH REJECT RENAMING REPLACE REPLACEMENT REPORT RESERVE RESET RESOLUTION RESULTS RETURN|0 RETURNING RIGHT RIGHT-JUSTIFIED ROLLBACK ROWS RUN SCAN SCREEN SCREEN-GROUP1 SCREEN-GROUP2 SCREEN-GROUP3 SCREEN-GROUP4 SCREEN-GROUP5 SCREEN-INPUT SCREEN-INTENSIFIED SCROLL SCROLL-BOUNDARY SEARCH SECTION SELECT SELECTION SELECTIONS SELECTION-SCREEN SELECTION-SET SELECTION-TABLE SELECT-OPTIONS SEND|0 SEPARATED SET|0 SHARED SHIFT SIGN SIN SINGLE SINGLEDISTINCT SINH SIZE|0 SKIP SORT|0 SORTABLE SPECIFIED SPLIT SQL|0 SQRT STABLE STAMP STANDARD|0 START|0 STARTING STATICS STEP-LOOP STOP STRLEN STRUCTURE|0 SUBMIT SUBTRACT SUBTRACT-CORRESPONDING SUFFIX SUM SUPPLY SUPPRESS SYMBOLS SYSTEM-EXCEPTIONS TABLE|0 TABLENAME TABLES TABLEVIEW TAN TANH TASK TEXT THEN|0 TIME|0 TIMES TITLE TITLEBAR TO TOPIC TOP-OF-PAGE TRAILING TRANSACTION TRANSFER TRANSLATE TRUNC TYPE TYPELIKE TYPE-POOL TYPE-POOLS TYPES ULINE UNION UNIQUE UNIT UNTIL|0 UP|0 UPDATE|0 UPPER UPPERLOWER USER-COMMAND USING VALUE|0 VALUES VARY VARYING VERSION VIA WAIT WHEN WHERE WINDOW WITH|0 WORK|0 WRITE|0 XSTRLEN ZONECA CN CO CP CS EQ GE GT LE LT NA NESTART-OF-SELECTION START-OF-PAGE END-OF-PAGE END-OF-SELECTION AT ENDAT',
        literal: 'abap_true abap_false',
        built_in:
          'DO FORM IF LOOP MODULE START-OF_FILE DEFINE WHILE BEGIN ENDDO ENDFORM|10 ENDIF ENDLOOP ENDMODULE END-OF_FILE END-OF-DEFINITION ENDWHILE END METHOD ENDMETHOD|10 CHAIN ENDCHAIN CASE ENDCASE FUNCTION ENDFUNCTION ELSEIF ELSE TRY ENDTRY|10 CATCH ',
      },
      contains: [
        E.APOS_STRING_MODE,
        E.NUMBER_MODE,
        { className: 'comment', begin: '^[*]', relevance: 0, end: '\n' },
        { className: 'comment', begin: '\b*"', relevance: 0, end: '\n' },
      ],
    })
  })()
)
hljs.registerLanguage(
  'fsharp',
  (function () {
    'use strict'
    return function (e) {
      var n = {
        begin: '<',
        end: '>',
        contains: [e.inherit(e.TITLE_MODE, { begin: /'[a-zA-Z0-9_]+/ })],
      }
      return {
        name: 'F#',
        aliases: ['fs'],
        keywords:
          'abstract and as assert base begin class default delegate do done downcast downto elif else end exception extern false finally for fun function global if in inherit inline interface internal lazy let match member module mutable namespace new null of open or override private public rec return sig static struct then to true try type upcast use val void when while with yield',
        illegal: /\/\*/,
        contains: [
          { className: 'keyword', begin: /\b(yield|return|let|do)!/ },
          {
            className: 'string',
            begin: '@"',
            end: '"',
            contains: [{ begin: '""' }],
          },
          { className: 'string', begin: '"""', end: '"""' },
          e.COMMENT('\\(\\*', '\\*\\)'),
          {
            className: 'class',
            beginKeywords: 'type',
            end: '\\(|=|$',
            excludeEnd: !0,
            contains: [e.UNDERSCORE_TITLE_MODE, n],
          },
          { className: 'meta', begin: '\\[<', end: '>\\]', relevance: 10 },
          {
            className: 'symbol',
            begin: "\\B('[A-Za-z])\\b",
            contains: [e.BACKSLASH_ESCAPE],
          },
          e.C_LINE_COMMENT_MODE,
          e.inherit(e.QUOTE_STRING_MODE, { illegal: null }),
          e.C_NUMBER_MODE,
        ],
      }
    }
  })()
)
!(function () {
  'use strict'
  hljs.registerLanguage('svelte', function (e) {
    return {
      subLanguage: 'xml',
      contains: [
        e.COMMENT('\x3c!--', '--\x3e', { relevance: 10 }),
        {
          begin: /^(\s*)(<script(\s*context="module")?>)/gm,
          end: /^(\s*)(<\/script>)/gm,
          subLanguage: 'javascript',
          excludeBegin: !0,
          excludeEnd: !0,
          contains: [
            { begin: /^(\s*)(\$:)/gm, end: /(\s*)/gm, className: 'keyword' },
          ],
        },
        {
          begin: /^(\s*)(<style.*>)/gm,
          end: /^(\s*)(<\/style>)/gm,
          subLanguage: 'css',
          excludeBegin: !0,
          excludeEnd: !0,
        },
        {
          begin: /\{/gm,
          end: /\}/gm,
          subLanguage: 'javascript',
          contains: [
            { begin: /[\{]/, end: /[\}]/, skip: !0 },
            {
              begin: /([#:\/@])(if|else|each|await|then|catch|debug|html)/gm,
              className: 'keyword',
              relevance: 10,
            },
          ],
        },
      ],
    }
  })
})()
