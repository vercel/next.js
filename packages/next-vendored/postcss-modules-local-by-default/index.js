;(() => {
  var e = {
    441: (e) => {
      'use strict'
      /*! https://mths.be/cssesc v3.0.0 by @mathias */ var t = {}
      var r = t.hasOwnProperty
      var n = function merge(e, t) {
        if (!e) {
          return t
        }
        var n = {}
        for (var s in t) {
          n[s] = r.call(e, s) ? e[s] : t[s]
        }
        return n
      }
      var s = /[ -,\.\/:-@\[-\^`\{-~]/
      var i = /[ -,\.\/:-@\[\]\^`\{-~]/
      var o = /['"\\]/
      var a = /(^|\\+)?(\\[A-F0-9]{1,6})\x20(?![a-fA-F0-9\x20])/g
      var u = function cssesc(e, t) {
        t = n(t, cssesc.options)
        if (t.quotes != 'single' && t.quotes != 'double') {
          t.quotes = 'single'
        }
        var r = t.quotes == 'double' ? '"' : "'"
        var o = t.isIdentifier
        var u = e.charAt(0)
        var c = ''
        var l = 0
        var f = e.length
        while (l < f) {
          var p = e.charAt(l++)
          var d = p.charCodeAt()
          var h = void 0
          if (d < 32 || d > 126) {
            if (d >= 55296 && d <= 56319 && l < f) {
              var v = e.charCodeAt(l++)
              if ((v & 64512) == 56320) {
                d = ((d & 1023) << 10) + (v & 1023) + 65536
              } else {
                l--
              }
            }
            h = '\\' + d.toString(16).toUpperCase() + ' '
          } else {
            if (t.escapeEverything) {
              if (s.test(p)) {
                h = '\\' + p
              } else {
                h = '\\' + d.toString(16).toUpperCase() + ' '
              }
            } else if (/[\t\n\f\r\x0B]/.test(p)) {
              h = '\\' + d.toString(16).toUpperCase() + ' '
            } else if (
              p == '\\' ||
              (!o && ((p == '"' && r == p) || (p == "'" && r == p))) ||
              (o && i.test(p))
            ) {
              h = '\\' + p
            } else {
              h = p
            }
          }
          c += h
        }
        if (o) {
          if (/^-[-\d]/.test(c)) {
            c = '\\-' + c.slice(1)
          } else if (/\d/.test(u)) {
            c = '\\3' + u + ' ' + c.slice(1)
          }
        }
        c = c.replace(a, function (e, t, r) {
          if (t && t.length % 2) {
            return e
          }
          return (t || '') + r
        })
        if (!o && t.wrap) {
          return r + c + r
        }
        return c
      }
      u.options = {
        escapeEverything: false,
        isIdentifier: false,
        quotes: 'single',
        wrap: false,
      }
      u.version = '3.0.0'
      e.exports = u
    },
    858: (e) => {
      const createImports = (e, t, r = 'rule') =>
        Object.keys(e).map((n) => {
          const s = e[n]
          const i = Object.keys(s).map((e) =>
            t.decl({ prop: e, value: s[e], raws: { before: '\n  ' } })
          )
          const o = i.length > 0
          const a =
            r === 'rule'
              ? t.rule({
                  selector: `:import('${n}')`,
                  raws: { after: o ? '\n' : '' },
                })
              : t.atRule({
                  name: 'icss-import',
                  params: `'${n}'`,
                  raws: { after: o ? '\n' : '' },
                })
          if (o) {
            a.append(i)
          }
          return a
        })
      const createExports = (e, t, r = 'rule') => {
        const n = Object.keys(e).map((r) =>
          t.decl({ prop: r, value: e[r], raws: { before: '\n  ' } })
        )
        if (n.length === 0) {
          return []
        }
        const s =
          r === 'rule'
            ? t.rule({ selector: `:export`, raws: { after: '\n' } })
            : t.atRule({ name: 'icss-export', raws: { after: '\n' } })
        s.append(n)
        return [s]
      }
      const createICSSRules = (e, t, r, n) => [
        ...createImports(e, r, n),
        ...createExports(t, r, n),
      ]
      e.exports = createICSSRules
    },
    233: (e) => {
      const t = /^:import\(("[^"]*"|'[^']*'|[^"']+)\)$/
      const r = /^("[^"]*"|'[^']*'|[^"']+)$/
      const getDeclsObject = (e) => {
        const t = {}
        e.walkDecls((e) => {
          const r = e.raws.before ? e.raws.before.trim() : ''
          t[r + e.prop] = e.value
        })
        return t
      }
      const extractICSS = (e, n = true, s = 'auto') => {
        const i = {}
        const o = {}
        function addImports(e, t) {
          const r = t.replace(/'|"/g, '')
          i[r] = Object.assign(i[r] || {}, getDeclsObject(e))
          if (n) {
            e.remove()
          }
        }
        function addExports(e) {
          Object.assign(o, getDeclsObject(e))
          if (n) {
            e.remove()
          }
        }
        e.each((e) => {
          if (e.type === 'rule' && s !== 'at-rule') {
            if (e.selector.slice(0, 7) === ':import') {
              const r = t.exec(e.selector)
              if (r) {
                addImports(e, r[1])
              }
            }
            if (e.selector === ':export') {
              addExports(e)
            }
          }
          if (e.type === 'atrule' && s !== 'rule') {
            if (e.name === 'icss-import') {
              const t = r.exec(e.params)
              if (t) {
                addImports(e, t[1])
              }
            }
            if (e.name === 'icss-export') {
              addExports(e)
            }
          }
        })
        return { icssImports: i, icssExports: o }
      }
      e.exports = extractICSS
    },
    48: (e, t, r) => {
      const n = r(63)
      const s = r(849)
      const i = r(233)
      const o = r(858)
      e.exports = {
        replaceValueSymbols: n,
        replaceSymbols: s,
        extractICSS: i,
        createICSSRules: o,
      }
    },
    849: (e, t, r) => {
      const n = r(63)
      const replaceSymbols = (e, t) => {
        e.walk((e) => {
          if (e.type === 'decl' && e.value) {
            e.value = n(e.value.toString(), t)
          } else if (e.type === 'rule' && e.selector) {
            e.selector = n(e.selector.toString(), t)
          } else if (e.type === 'atrule' && e.params) {
            e.params = n(e.params.toString(), t)
          }
        })
      }
      e.exports = replaceSymbols
    },
    63: (e) => {
      const t = /[$]?[\w-]+/g
      const replaceValueSymbols = (e, r) => {
        let n
        while ((n = t.exec(e))) {
          const s = r[n[0]]
          if (s) {
            e = e.slice(0, n.index) + s + e.slice(t.lastIndex)
            t.lastIndex -= n[0].length - s.length
          }
        }
        return e
      }
      e.exports = replaceValueSymbols
    },
    35: (e, t, r) => {
      'use strict'
      const n = r(235)
      const s = r(697)
      const { extractICSS: i } = r(48)
      const isSpacing = (e) => e.type === 'combinator' && e.value === ' '
      function normalizeNodeArray(e) {
        const t = []
        e.forEach((e) => {
          if (Array.isArray(e)) {
            normalizeNodeArray(e).forEach((e) => {
              t.push(e)
            })
          } else if (e) {
            t.push(e)
          }
        })
        if (t.length > 0 && isSpacing(t[t.length - 1])) {
          t.pop()
        }
        return t
      }
      function localizeNode(e, t, r) {
        const transform = (e, t) => {
          if (t.ignoreNextSpacing && !isSpacing(e)) {
            throw new Error('Missing whitespace after ' + t.ignoreNextSpacing)
          }
          if (t.enforceNoSpacing && isSpacing(e)) {
            throw new Error('Missing whitespace before ' + t.enforceNoSpacing)
          }
          let s
          switch (e.type) {
            case 'root': {
              let r
              t.hasPureGlobals = false
              s = e.nodes.map((n) => {
                const s = {
                  global: t.global,
                  lastWasSpacing: true,
                  hasLocals: false,
                  explicit: false,
                }
                n = transform(n, s)
                if (typeof r === 'undefined') {
                  r = s.global
                } else if (r !== s.global) {
                  throw new Error(
                    'Inconsistent rule global/local result in rule "' +
                      e +
                      '" (multiple selectors must result in the same mode for the rule)'
                  )
                }
                if (!s.hasLocals) {
                  t.hasPureGlobals = true
                }
                return n
              })
              t.global = r
              e.nodes = normalizeNodeArray(s)
              break
            }
            case 'selector': {
              s = e.map((e) => transform(e, t))
              e = e.clone()
              e.nodes = normalizeNodeArray(s)
              break
            }
            case 'combinator': {
              if (isSpacing(e)) {
                if (t.ignoreNextSpacing) {
                  t.ignoreNextSpacing = false
                  t.lastWasSpacing = false
                  t.enforceNoSpacing = false
                  return null
                }
                t.lastWasSpacing = true
                return e
              }
              break
            }
            case 'pseudo': {
              let r
              const i = !!e.length
              const o = e.value === ':local' || e.value === ':global'
              const a = e.value === ':import' || e.value === ':export'
              if (a) {
                t.hasLocals = true
              } else if (i) {
                if (o) {
                  if (e.nodes.length === 0) {
                    throw new Error(`${e.value}() can't be empty`)
                  }
                  if (t.inside) {
                    throw new Error(
                      `A ${e.value} is not allowed inside of a ${t.inside}(...)`
                    )
                  }
                  r = {
                    global: e.value === ':global',
                    inside: e.value,
                    hasLocals: false,
                    explicit: true,
                  }
                  s = e
                    .map((e) => transform(e, r))
                    .reduce((e, t) => e.concat(t.nodes), [])
                  if (s.length) {
                    const { before: t, after: r } = e.spaces
                    const n = s[0]
                    const i = s[s.length - 1]
                    n.spaces = { before: t, after: n.spaces.after }
                    i.spaces = { before: i.spaces.before, after: r }
                  }
                  e = s
                  break
                } else {
                  r = {
                    global: t.global,
                    inside: t.inside,
                    lastWasSpacing: true,
                    hasLocals: false,
                    explicit: t.explicit,
                  }
                  s = e.map((e) => {
                    const t = { ...r, enforceNoSpacing: false }
                    const n = transform(e, t)
                    r.global = t.global
                    r.hasLocals = t.hasLocals
                    return n
                  })
                  e = e.clone()
                  e.nodes = normalizeNodeArray(s)
                  if (r.hasLocals) {
                    t.hasLocals = true
                  }
                }
                break
              } else if (o) {
                if (t.inside) {
                  throw new Error(
                    `A ${e.value} is not allowed inside of a ${t.inside}(...)`
                  )
                }
                const r = !!e.spaces.before
                t.ignoreNextSpacing = t.lastWasSpacing ? e.value : false
                t.enforceNoSpacing = t.lastWasSpacing ? false : e.value
                t.global = e.value === ':global'
                t.explicit = true
                return r ? n.combinator({ value: ' ' }) : null
              }
              break
            }
            case 'id':
            case 'class': {
              if (!e.value) {
                throw new Error('Invalid class or id selector syntax')
              }
              if (t.global) {
                break
              }
              const s = r.has(e.value)
              const i = s && t.explicit
              if (!s || i) {
                const r = e.clone()
                r.spaces = { before: '', after: '' }
                e = n.pseudo({ value: ':local', nodes: [r], spaces: e.spaces })
                t.hasLocals = true
              }
              break
            }
            case 'nesting': {
              if (e.value === '&') {
                t.hasLocals = true
              }
            }
          }
          t.lastWasSpacing = false
          t.ignoreNextSpacing = false
          t.enforceNoSpacing = false
          return e
        }
        const s = { global: t === 'global', hasPureGlobals: false }
        s.selector = n((e) => {
          transform(e, s)
        }).processSync(e, { updateSelector: false, lossless: true })
        return s
      }
      function localizeDeclNode(e, t) {
        switch (e.type) {
          case 'word':
            if (t.localizeNextItem) {
              if (!t.localAliasMap.has(e.value)) {
                e.value = ':local(' + e.value + ')'
                t.localizeNextItem = false
              }
            }
            break
          case 'function':
            if (
              t.options &&
              t.options.rewriteUrl &&
              e.value.toLowerCase() === 'url'
            ) {
              e.nodes.map((e) => {
                if (e.type !== 'string' && e.type !== 'word') {
                  return
                }
                let r = t.options.rewriteUrl(t.global, e.value)
                switch (e.type) {
                  case 'string':
                    if (e.quote === "'") {
                      r = r.replace(/(\\)/g, '\\$1').replace(/'/g, "\\'")
                    }
                    if (e.quote === '"') {
                      r = r.replace(/(\\)/g, '\\$1').replace(/"/g, '\\"')
                    }
                    break
                  case 'word':
                    r = r.replace(/("|'|\)|\\)/g, '\\$1')
                    break
                }
                e.value = r
              })
            }
            break
        }
        return e
      }
      const o = [
        'none',
        'inherit',
        'initial',
        'revert',
        'revert-layer',
        'unset',
      ]
      function localizeDeclarationValues(e, t, r) {
        const n = s(t.value)
        n.walk((t, n, s) => {
          if (
            t.type === 'function' &&
            (t.value.toLowerCase() === 'var' || t.value.toLowerCase() === 'env')
          ) {
            return false
          }
          if (t.type === 'word' && o.includes(t.value.toLowerCase())) {
            return
          }
          const i = {
            options: r.options,
            global: r.global,
            localizeNextItem: e && !r.global,
            localAliasMap: r.localAliasMap,
          }
          s[n] = localizeDeclNode(t, i)
        })
        t.value = n.toString()
      }
      function localizeDeclaration(e, t) {
        const r = /animation$/i.test(e.prop)
        if (r) {
          const r =
            /^-?([a-z\u0080-\uFFFF_]|(\\[^\r\n\f])|-(?![0-9]))((\\[^\r\n\f])|[a-z\u0080-\uFFFF_0-9-])*$/i
          const n = {
            $normal: 1,
            $reverse: 1,
            $alternate: 1,
            '$alternate-reverse': 1,
            $forwards: 1,
            $backwards: 1,
            $both: 1,
            $infinite: 1,
            $paused: 1,
            $running: 1,
            $ease: 1,
            '$ease-in': 1,
            '$ease-out': 1,
            '$ease-in-out': 1,
            $linear: 1,
            '$step-end': 1,
            '$step-start': 1,
            $none: Infinity,
            $initial: Infinity,
            $inherit: Infinity,
            $unset: Infinity,
            $revert: Infinity,
            '$revert-layer': Infinity,
          }
          let i = {}
          const o = s(e.value).walk((e) => {
            if (e.type === 'div') {
              i = {}
              return
            } else if (e.type === 'function') {
              return false
            } else if (e.type !== 'word') {
              return
            }
            const s = e.type === 'word' ? e.value.toLowerCase() : null
            let o = false
            if (s && r.test(s)) {
              if ('$' + s in n) {
                i['$' + s] = '$' + s in i ? i['$' + s] + 1 : 0
                o = i['$' + s] >= n['$' + s]
              } else {
                o = true
              }
            }
            const a = {
              options: t.options,
              global: t.global,
              localizeNextItem: o && !t.global,
              localAliasMap: t.localAliasMap,
            }
            return localizeDeclNode(e, a)
          })
          e.value = o.toString()
          return
        }
        const n = /animation(-name)?$/i.test(e.prop)
        if (n) {
          return localizeDeclarationValues(true, e, t)
        }
        const i = /url\(/i.test(e.value)
        if (i) {
          return localizeDeclarationValues(false, e, t)
        }
      }
      e.exports = (e = {}) => {
        if (
          e &&
          e.mode &&
          e.mode !== 'global' &&
          e.mode !== 'local' &&
          e.mode !== 'pure'
        ) {
          throw new Error(
            'options.mode must be either "global", "local" or "pure" (default "local")'
          )
        }
        const t = e && e.mode === 'pure'
        const r = e && e.mode === 'global'
        return {
          postcssPlugin: 'postcss-modules-local-by-default',
          prepare() {
            const n = new Map()
            return {
              Once(s) {
                const { icssImports: o } = i(s, false)
                Object.keys(o).forEach((e) => {
                  Object.keys(o[e]).forEach((t) => {
                    n.set(t, o[e][t])
                  })
                })
                s.walkAtRules((s) => {
                  if (/keyframes$/i.test(s.name)) {
                    const i = /^\s*:global\s*\((.+)\)\s*$/.exec(s.params)
                    const o = /^\s*:local\s*\((.+)\)\s*$/.exec(s.params)
                    let a = r
                    if (i) {
                      if (t) {
                        throw s.error(
                          '@keyframes :global(...) is not allowed in pure mode'
                        )
                      }
                      s.params = i[1]
                      a = true
                    } else if (o) {
                      s.params = o[0]
                      a = false
                    } else if (s.params && !r && !n.has(s.params)) {
                      s.params = ':local(' + s.params + ')'
                    }
                    s.walkDecls((t) => {
                      localizeDeclaration(t, {
                        localAliasMap: n,
                        options: e,
                        global: a,
                      })
                    })
                  } else if (/scope$/i.test(s.name)) {
                    s.params = s.params
                      .split('to')
                      .map((r) => {
                        const i = r.trim().slice(1, -1).trim()
                        const o = localizeNode(i, e.mode, n)
                        o.options = e
                        o.localAliasMap = n
                        if (t && o.hasPureGlobals) {
                          throw s.error(
                            'Selector in at-rule"' +
                              i +
                              '" is not pure ' +
                              '(pure selectors must contain at least one local class or id)'
                          )
                        }
                        return `(${o.selector})`
                      })
                      .join(' to ')
                    s.nodes.forEach((t) => {
                      if (t.type === 'decl') {
                        localizeDeclaration(t, {
                          localAliasMap: n,
                          options: e,
                          global: r,
                        })
                      }
                    })
                  } else if (s.nodes) {
                    s.nodes.forEach((t) => {
                      if (t.type === 'decl') {
                        localizeDeclaration(t, {
                          localAliasMap: n,
                          options: e,
                          global: r,
                        })
                      }
                    })
                  }
                })
                s.walkRules((r) => {
                  if (
                    r.parent &&
                    r.parent.type === 'atrule' &&
                    /keyframes$/i.test(r.parent.name)
                  ) {
                    return
                  }
                  const s = localizeNode(r, e.mode, n)
                  s.options = e
                  s.localAliasMap = n
                  if (t && s.hasPureGlobals) {
                    throw r.error(
                      'Selector "' +
                        r.selector +
                        '" is not pure ' +
                        '(pure selectors must contain at least one local class or id)'
                    )
                  }
                  r.selector = s.selector
                  if (r.nodes) {
                    r.nodes.forEach((e) => localizeDeclaration(e, s))
                  }
                })
              },
            }
          },
        }
      }
      e.exports.postcss = true
    },
    235: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(528))
      var s = _interopRequireWildcard(r(110))
      function _getRequireWildcardCache() {
        if (typeof WeakMap !== 'function') return null
        var e = new WeakMap()
        _getRequireWildcardCache = function _getRequireWildcardCache() {
          return e
        }
        return e
      }
      function _interopRequireWildcard(e) {
        if (e && e.__esModule) {
          return e
        }
        if (e === null || (typeof e !== 'object' && typeof e !== 'function')) {
          return { default: e }
        }
        var t = _getRequireWildcardCache()
        if (t && t.has(e)) {
          return t.get(e)
        }
        var r = {}
        var n = Object.defineProperty && Object.getOwnPropertyDescriptor
        for (var s in e) {
          if (Object.prototype.hasOwnProperty.call(e, s)) {
            var i = n ? Object.getOwnPropertyDescriptor(e, s) : null
            if (i && (i.get || i.set)) {
              Object.defineProperty(r, s, i)
            } else {
              r[s] = e[s]
            }
          }
        }
        r['default'] = e
        if (t) {
          t.set(e, r)
        }
        return r
      }
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      var i = function parser(e) {
        return new n['default'](e)
      }
      Object.assign(i, s)
      delete i.__esModule
      var o = i
      t['default'] = o
      e.exports = t.default
    },
    305: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(422))
      var s = _interopRequireDefault(r(13))
      var i = _interopRequireDefault(r(870))
      var o = _interopRequireDefault(r(47))
      var a = _interopRequireDefault(r(393))
      var u = _interopRequireDefault(r(443))
      var c = _interopRequireDefault(r(435))
      var l = _interopRequireDefault(r(326))
      var f = _interopRequireWildcard(r(248))
      var p = _interopRequireDefault(r(165))
      var d = _interopRequireDefault(r(537))
      var h = _interopRequireDefault(r(60))
      var v = _interopRequireDefault(r(173))
      var _ = _interopRequireWildcard(r(133))
      var g = _interopRequireWildcard(r(553))
      var y = _interopRequireWildcard(r(600))
      var b = r(513)
      var S, m
      function _getRequireWildcardCache() {
        if (typeof WeakMap !== 'function') return null
        var e = new WeakMap()
        _getRequireWildcardCache = function _getRequireWildcardCache() {
          return e
        }
        return e
      }
      function _interopRequireWildcard(e) {
        if (e && e.__esModule) {
          return e
        }
        if (e === null || (typeof e !== 'object' && typeof e !== 'function')) {
          return { default: e }
        }
        var t = _getRequireWildcardCache()
        if (t && t.has(e)) {
          return t.get(e)
        }
        var r = {}
        var n = Object.defineProperty && Object.getOwnPropertyDescriptor
        for (var s in e) {
          if (Object.prototype.hasOwnProperty.call(e, s)) {
            var i = n ? Object.getOwnPropertyDescriptor(e, s) : null
            if (i && (i.get || i.set)) {
              Object.defineProperty(r, s, i)
            } else {
              r[s] = e[s]
            }
          }
        }
        r['default'] = e
        if (t) {
          t.set(e, r)
        }
        return r
      }
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      var w =
        ((S = {}),
        (S[g.space] = true),
        (S[g.cr] = true),
        (S[g.feed] = true),
        (S[g.newline] = true),
        (S[g.tab] = true),
        S)
      var k = Object.assign({}, w, ((m = {}), (m[g.comment] = true), m))
      function tokenStart(e) {
        return { line: e[_.FIELDS.START_LINE], column: e[_.FIELDS.START_COL] }
      }
      function tokenEnd(e) {
        return { line: e[_.FIELDS.END_LINE], column: e[_.FIELDS.END_COL] }
      }
      function getSource(e, t, r, n) {
        return { start: { line: e, column: t }, end: { line: r, column: n } }
      }
      function getTokenSource(e) {
        return getSource(
          e[_.FIELDS.START_LINE],
          e[_.FIELDS.START_COL],
          e[_.FIELDS.END_LINE],
          e[_.FIELDS.END_COL]
        )
      }
      function getTokenSourceSpan(e, t) {
        if (!e) {
          return undefined
        }
        return getSource(
          e[_.FIELDS.START_LINE],
          e[_.FIELDS.START_COL],
          t[_.FIELDS.END_LINE],
          t[_.FIELDS.END_COL]
        )
      }
      function unescapeProp(e, t) {
        var r = e[t]
        if (typeof r !== 'string') {
          return
        }
        if (r.indexOf('\\') !== -1) {
          ;(0, b.ensureObject)(e, 'raws')
          e[t] = (0, b.unesc)(r)
          if (e.raws[t] === undefined) {
            e.raws[t] = r
          }
        }
        return e
      }
      function indexesOf(e, t) {
        var r = -1
        var n = []
        while ((r = e.indexOf(t, r + 1)) !== -1) {
          n.push(r)
        }
        return n
      }
      function uniqs() {
        var e = Array.prototype.concat.apply([], arguments)
        return e.filter(function (t, r) {
          return r === e.indexOf(t)
        })
      }
      var T = (function () {
        function Parser(e, t) {
          if (t === void 0) {
            t = {}
          }
          this.rule = e
          this.options = Object.assign({ lossy: false, safe: false }, t)
          this.position = 0
          this.css =
            typeof this.rule === 'string' ? this.rule : this.rule.selector
          this.tokens = (0, _['default'])({
            css: this.css,
            error: this._errorGenerator(),
            safe: this.options.safe,
          })
          var r = getTokenSourceSpan(
            this.tokens[0],
            this.tokens[this.tokens.length - 1]
          )
          this.root = new n['default']({ source: r })
          this.root.errorGenerator = this._errorGenerator()
          var i = new s['default']({
            source: { start: { line: 1, column: 1 } },
          })
          this.root.append(i)
          this.current = i
          this.loop()
        }
        var e = Parser.prototype
        e._errorGenerator = function _errorGenerator() {
          var e = this
          return function (t, r) {
            if (typeof e.rule === 'string') {
              return new Error(t)
            }
            return e.rule.error(t, r)
          }
        }
        e.attribute = function attribute() {
          var e = []
          var t = this.currToken
          this.position++
          while (
            this.position < this.tokens.length &&
            this.currToken[_.FIELDS.TYPE] !== g.closeSquare
          ) {
            e.push(this.currToken)
            this.position++
          }
          if (this.currToken[_.FIELDS.TYPE] !== g.closeSquare) {
            return this.expected(
              'closing square bracket',
              this.currToken[_.FIELDS.START_POS]
            )
          }
          var r = e.length
          var n = {
            source: getSource(t[1], t[2], this.currToken[3], this.currToken[4]),
            sourceIndex: t[_.FIELDS.START_POS],
          }
          if (r === 1 && !~[g.word].indexOf(e[0][_.FIELDS.TYPE])) {
            return this.expected('attribute', e[0][_.FIELDS.START_POS])
          }
          var s = 0
          var i = ''
          var o = ''
          var a = null
          var u = false
          while (s < r) {
            var c = e[s]
            var l = this.content(c)
            var p = e[s + 1]
            switch (c[_.FIELDS.TYPE]) {
              case g.space:
                u = true
                if (this.options.lossy) {
                  break
                }
                if (a) {
                  ;(0, b.ensureObject)(n, 'spaces', a)
                  var d = n.spaces[a].after || ''
                  n.spaces[a].after = d + l
                  var h =
                    (0, b.getProp)(n, 'raws', 'spaces', a, 'after') || null
                  if (h) {
                    n.raws.spaces[a].after = h + l
                  }
                } else {
                  i = i + l
                  o = o + l
                }
                break
              case g.asterisk:
                if (p[_.FIELDS.TYPE] === g.equals) {
                  n.operator = l
                  a = 'operator'
                } else if ((!n.namespace || (a === 'namespace' && !u)) && p) {
                  if (i) {
                    ;(0, b.ensureObject)(n, 'spaces', 'attribute')
                    n.spaces.attribute.before = i
                    i = ''
                  }
                  if (o) {
                    ;(0, b.ensureObject)(n, 'raws', 'spaces', 'attribute')
                    n.raws.spaces.attribute.before = i
                    o = ''
                  }
                  n.namespace = (n.namespace || '') + l
                  var v = (0, b.getProp)(n, 'raws', 'namespace') || null
                  if (v) {
                    n.raws.namespace += l
                  }
                  a = 'namespace'
                }
                u = false
                break
              case g.dollar:
                if (a === 'value') {
                  var y = (0, b.getProp)(n, 'raws', 'value')
                  n.value += '$'
                  if (y) {
                    n.raws.value = y + '$'
                  }
                  break
                }
              case g.caret:
                if (p[_.FIELDS.TYPE] === g.equals) {
                  n.operator = l
                  a = 'operator'
                }
                u = false
                break
              case g.combinator:
                if (l === '~' && p[_.FIELDS.TYPE] === g.equals) {
                  n.operator = l
                  a = 'operator'
                }
                if (l !== '|') {
                  u = false
                  break
                }
                if (p[_.FIELDS.TYPE] === g.equals) {
                  n.operator = l
                  a = 'operator'
                } else if (!n.namespace && !n.attribute) {
                  n.namespace = true
                }
                u = false
                break
              case g.word:
                if (
                  p &&
                  this.content(p) === '|' &&
                  e[s + 2] &&
                  e[s + 2][_.FIELDS.TYPE] !== g.equals &&
                  !n.operator &&
                  !n.namespace
                ) {
                  n.namespace = l
                  a = 'namespace'
                } else if (!n.attribute || (a === 'attribute' && !u)) {
                  if (i) {
                    ;(0, b.ensureObject)(n, 'spaces', 'attribute')
                    n.spaces.attribute.before = i
                    i = ''
                  }
                  if (o) {
                    ;(0, b.ensureObject)(n, 'raws', 'spaces', 'attribute')
                    n.raws.spaces.attribute.before = o
                    o = ''
                  }
                  n.attribute = (n.attribute || '') + l
                  var S = (0, b.getProp)(n, 'raws', 'attribute') || null
                  if (S) {
                    n.raws.attribute += l
                  }
                  a = 'attribute'
                } else if (
                  (!n.value && n.value !== '') ||
                  (a === 'value' && !(u || n.quoteMark))
                ) {
                  var m = (0, b.unesc)(l)
                  var w = (0, b.getProp)(n, 'raws', 'value') || ''
                  var k = n.value || ''
                  n.value = k + m
                  n.quoteMark = null
                  if (m !== l || w) {
                    ;(0, b.ensureObject)(n, 'raws')
                    n.raws.value = (w || k) + l
                  }
                  a = 'value'
                } else {
                  var T = l === 'i' || l === 'I'
                  if ((n.value || n.value === '') && (n.quoteMark || u)) {
                    n.insensitive = T
                    if (!T || l === 'I') {
                      ;(0, b.ensureObject)(n, 'raws')
                      n.raws.insensitiveFlag = l
                    }
                    a = 'insensitive'
                    if (i) {
                      ;(0, b.ensureObject)(n, 'spaces', 'insensitive')
                      n.spaces.insensitive.before = i
                      i = ''
                    }
                    if (o) {
                      ;(0, b.ensureObject)(n, 'raws', 'spaces', 'insensitive')
                      n.raws.spaces.insensitive.before = o
                      o = ''
                    }
                  } else if (n.value || n.value === '') {
                    a = 'value'
                    n.value += l
                    if (n.raws.value) {
                      n.raws.value += l
                    }
                  }
                }
                u = false
                break
              case g.str:
                if (!n.attribute || !n.operator) {
                  return this.error(
                    'Expected an attribute followed by an operator preceding the string.',
                    { index: c[_.FIELDS.START_POS] }
                  )
                }
                var O = (0, f.unescapeValue)(l),
                  P = O.unescaped,
                  E = O.quoteMark
                n.value = P
                n.quoteMark = E
                a = 'value'
                ;(0, b.ensureObject)(n, 'raws')
                n.raws.value = l
                u = false
                break
              case g.equals:
                if (!n.attribute) {
                  return this.expected('attribute', c[_.FIELDS.START_POS], l)
                }
                if (n.value) {
                  return this.error(
                    'Unexpected "=" found; an operator was already defined.',
                    { index: c[_.FIELDS.START_POS] }
                  )
                }
                n.operator = n.operator ? n.operator + l : l
                a = 'operator'
                u = false
                break
              case g.comment:
                if (a) {
                  if (
                    u ||
                    (p && p[_.FIELDS.TYPE] === g.space) ||
                    a === 'insensitive'
                  ) {
                    var I = (0, b.getProp)(n, 'spaces', a, 'after') || ''
                    var A = (0, b.getProp)(n, 'raws', 'spaces', a, 'after') || I
                    ;(0, b.ensureObject)(n, 'raws', 'spaces', a)
                    n.raws.spaces[a].after = A + l
                  } else {
                    var x = n[a] || ''
                    var D = (0, b.getProp)(n, 'raws', a) || x
                    ;(0, b.ensureObject)(n, 'raws')
                    n.raws[a] = D + l
                  }
                } else {
                  o = o + l
                }
                break
              default:
                return this.error('Unexpected "' + l + '" found.', {
                  index: c[_.FIELDS.START_POS],
                })
            }
            s++
          }
          unescapeProp(n, 'attribute')
          unescapeProp(n, 'namespace')
          this.newNode(new f['default'](n))
          this.position++
        }
        e.parseWhitespaceEquivalentTokens =
          function parseWhitespaceEquivalentTokens(e) {
            if (e < 0) {
              e = this.tokens.length
            }
            var t = this.position
            var r = []
            var n = ''
            var s = undefined
            do {
              if (w[this.currToken[_.FIELDS.TYPE]]) {
                if (!this.options.lossy) {
                  n += this.content()
                }
              } else if (this.currToken[_.FIELDS.TYPE] === g.comment) {
                var i = {}
                if (n) {
                  i.before = n
                  n = ''
                }
                s = new o['default']({
                  value: this.content(),
                  source: getTokenSource(this.currToken),
                  sourceIndex: this.currToken[_.FIELDS.START_POS],
                  spaces: i,
                })
                r.push(s)
              }
            } while (++this.position < e)
            if (n) {
              if (s) {
                s.spaces.after = n
              } else if (!this.options.lossy) {
                var a = this.tokens[t]
                var u = this.tokens[this.position - 1]
                r.push(
                  new c['default']({
                    value: '',
                    source: getSource(
                      a[_.FIELDS.START_LINE],
                      a[_.FIELDS.START_COL],
                      u[_.FIELDS.END_LINE],
                      u[_.FIELDS.END_COL]
                    ),
                    sourceIndex: a[_.FIELDS.START_POS],
                    spaces: { before: n, after: '' },
                  })
                )
              }
            }
            return r
          }
        e.convertWhitespaceNodesToSpace =
          function convertWhitespaceNodesToSpace(e, t) {
            var r = this
            if (t === void 0) {
              t = false
            }
            var n = ''
            var s = ''
            e.forEach(function (e) {
              var i = r.lossySpace(e.spaces.before, t)
              var o = r.lossySpace(e.rawSpaceBefore, t)
              n += i + r.lossySpace(e.spaces.after, t && i.length === 0)
              s +=
                i + e.value + r.lossySpace(e.rawSpaceAfter, t && o.length === 0)
            })
            if (s === n) {
              s = undefined
            }
            var i = { space: n, rawSpace: s }
            return i
          }
        e.isNamedCombinator = function isNamedCombinator(e) {
          if (e === void 0) {
            e = this.position
          }
          return (
            this.tokens[e + 0] &&
            this.tokens[e + 0][_.FIELDS.TYPE] === g.slash &&
            this.tokens[e + 1] &&
            this.tokens[e + 1][_.FIELDS.TYPE] === g.word &&
            this.tokens[e + 2] &&
            this.tokens[e + 2][_.FIELDS.TYPE] === g.slash
          )
        }
        e.namedCombinator = function namedCombinator() {
          if (this.isNamedCombinator()) {
            var e = this.content(this.tokens[this.position + 1])
            var t = (0, b.unesc)(e).toLowerCase()
            var r = {}
            if (t !== e) {
              r.value = '/' + e + '/'
            }
            var n = new d['default']({
              value: '/' + t + '/',
              source: getSource(
                this.currToken[_.FIELDS.START_LINE],
                this.currToken[_.FIELDS.START_COL],
                this.tokens[this.position + 2][_.FIELDS.END_LINE],
                this.tokens[this.position + 2][_.FIELDS.END_COL]
              ),
              sourceIndex: this.currToken[_.FIELDS.START_POS],
              raws: r,
            })
            this.position = this.position + 3
            return n
          } else {
            this.unexpected()
          }
        }
        e.combinator = function combinator() {
          var e = this
          if (this.content() === '|') {
            return this.namespace()
          }
          var t = this.locateNextMeaningfulToken(this.position)
          if (t < 0 || this.tokens[t][_.FIELDS.TYPE] === g.comma) {
            var r = this.parseWhitespaceEquivalentTokens(t)
            if (r.length > 0) {
              var n = this.current.last
              if (n) {
                var s = this.convertWhitespaceNodesToSpace(r),
                  i = s.space,
                  o = s.rawSpace
                if (o !== undefined) {
                  n.rawSpaceAfter += o
                }
                n.spaces.after += i
              } else {
                r.forEach(function (t) {
                  return e.newNode(t)
                })
              }
            }
            return
          }
          var a = this.currToken
          var u = undefined
          if (t > this.position) {
            u = this.parseWhitespaceEquivalentTokens(t)
          }
          var c
          if (this.isNamedCombinator()) {
            c = this.namedCombinator()
          } else if (this.currToken[_.FIELDS.TYPE] === g.combinator) {
            c = new d['default']({
              value: this.content(),
              source: getTokenSource(this.currToken),
              sourceIndex: this.currToken[_.FIELDS.START_POS],
            })
            this.position++
          } else if (w[this.currToken[_.FIELDS.TYPE]]) {
          } else if (!u) {
            this.unexpected()
          }
          if (c) {
            if (u) {
              var l = this.convertWhitespaceNodesToSpace(u),
                f = l.space,
                p = l.rawSpace
              c.spaces.before = f
              c.rawSpaceBefore = p
            }
          } else {
            var h = this.convertWhitespaceNodesToSpace(u, true),
              v = h.space,
              y = h.rawSpace
            if (!y) {
              y = v
            }
            var b = {}
            var S = { spaces: {} }
            if (v.endsWith(' ') && y.endsWith(' ')) {
              b.before = v.slice(0, v.length - 1)
              S.spaces.before = y.slice(0, y.length - 1)
            } else if (v.startsWith(' ') && y.startsWith(' ')) {
              b.after = v.slice(1)
              S.spaces.after = y.slice(1)
            } else {
              S.value = y
            }
            c = new d['default']({
              value: ' ',
              source: getTokenSourceSpan(a, this.tokens[this.position - 1]),
              sourceIndex: a[_.FIELDS.START_POS],
              spaces: b,
              raws: S,
            })
          }
          if (this.currToken && this.currToken[_.FIELDS.TYPE] === g.space) {
            c.spaces.after = this.optionalSpace(this.content())
            this.position++
          }
          return this.newNode(c)
        }
        e.comma = function comma() {
          if (this.position === this.tokens.length - 1) {
            this.root.trailingComma = true
            this.position++
            return
          }
          this.current._inferEndPosition()
          var e = new s['default']({
            source: { start: tokenStart(this.tokens[this.position + 1]) },
          })
          this.current.parent.append(e)
          this.current = e
          this.position++
        }
        e.comment = function comment() {
          var e = this.currToken
          this.newNode(
            new o['default']({
              value: this.content(),
              source: getTokenSource(e),
              sourceIndex: e[_.FIELDS.START_POS],
            })
          )
          this.position++
        }
        e.error = function error(e, t) {
          throw this.root.error(e, t)
        }
        e.missingBackslash = function missingBackslash() {
          return this.error('Expected a backslash preceding the semicolon.', {
            index: this.currToken[_.FIELDS.START_POS],
          })
        }
        e.missingParenthesis = function missingParenthesis() {
          return this.expected(
            'opening parenthesis',
            this.currToken[_.FIELDS.START_POS]
          )
        }
        e.missingSquareBracket = function missingSquareBracket() {
          return this.expected(
            'opening square bracket',
            this.currToken[_.FIELDS.START_POS]
          )
        }
        e.unexpected = function unexpected() {
          return this.error(
            "Unexpected '" +
              this.content() +
              "'. Escaping special characters with \\ may help.",
            this.currToken[_.FIELDS.START_POS]
          )
        }
        e.namespace = function namespace() {
          var e = (this.prevToken && this.content(this.prevToken)) || true
          if (this.nextToken[_.FIELDS.TYPE] === g.word) {
            this.position++
            return this.word(e)
          } else if (this.nextToken[_.FIELDS.TYPE] === g.asterisk) {
            this.position++
            return this.universal(e)
          }
        }
        e.nesting = function nesting() {
          if (this.nextToken) {
            var e = this.content(this.nextToken)
            if (e === '|') {
              this.position++
              return
            }
          }
          var t = this.currToken
          this.newNode(
            new h['default']({
              value: this.content(),
              source: getTokenSource(t),
              sourceIndex: t[_.FIELDS.START_POS],
            })
          )
          this.position++
        }
        e.parentheses = function parentheses() {
          var e = this.current.last
          var t = 1
          this.position++
          if (e && e.type === y.PSEUDO) {
            var r = new s['default']({
              source: { start: tokenStart(this.tokens[this.position - 1]) },
            })
            var n = this.current
            e.append(r)
            this.current = r
            while (this.position < this.tokens.length && t) {
              if (this.currToken[_.FIELDS.TYPE] === g.openParenthesis) {
                t++
              }
              if (this.currToken[_.FIELDS.TYPE] === g.closeParenthesis) {
                t--
              }
              if (t) {
                this.parse()
              } else {
                this.current.source.end = tokenEnd(this.currToken)
                this.current.parent.source.end = tokenEnd(this.currToken)
                this.position++
              }
            }
            this.current = n
          } else {
            var i = this.currToken
            var o = '('
            var a
            while (this.position < this.tokens.length && t) {
              if (this.currToken[_.FIELDS.TYPE] === g.openParenthesis) {
                t++
              }
              if (this.currToken[_.FIELDS.TYPE] === g.closeParenthesis) {
                t--
              }
              a = this.currToken
              o += this.parseParenthesisToken(this.currToken)
              this.position++
            }
            if (e) {
              e.appendToPropertyAndEscape('value', o, o)
            } else {
              this.newNode(
                new c['default']({
                  value: o,
                  source: getSource(
                    i[_.FIELDS.START_LINE],
                    i[_.FIELDS.START_COL],
                    a[_.FIELDS.END_LINE],
                    a[_.FIELDS.END_COL]
                  ),
                  sourceIndex: i[_.FIELDS.START_POS],
                })
              )
            }
          }
          if (t) {
            return this.expected(
              'closing parenthesis',
              this.currToken[_.FIELDS.START_POS]
            )
          }
        }
        e.pseudo = function pseudo() {
          var e = this
          var t = ''
          var r = this.currToken
          while (this.currToken && this.currToken[_.FIELDS.TYPE] === g.colon) {
            t += this.content()
            this.position++
          }
          if (!this.currToken) {
            return this.expected(
              ['pseudo-class', 'pseudo-element'],
              this.position - 1
            )
          }
          if (this.currToken[_.FIELDS.TYPE] === g.word) {
            this.splitWord(false, function (n, s) {
              t += n
              e.newNode(
                new l['default']({
                  value: t,
                  source: getTokenSourceSpan(r, e.currToken),
                  sourceIndex: r[_.FIELDS.START_POS],
                })
              )
              if (
                s > 1 &&
                e.nextToken &&
                e.nextToken[_.FIELDS.TYPE] === g.openParenthesis
              ) {
                e.error('Misplaced parenthesis.', {
                  index: e.nextToken[_.FIELDS.START_POS],
                })
              }
            })
          } else {
            return this.expected(
              ['pseudo-class', 'pseudo-element'],
              this.currToken[_.FIELDS.START_POS]
            )
          }
        }
        e.space = function space() {
          var e = this.content()
          if (
            this.position === 0 ||
            this.prevToken[_.FIELDS.TYPE] === g.comma ||
            this.prevToken[_.FIELDS.TYPE] === g.openParenthesis ||
            this.current.nodes.every(function (e) {
              return e.type === 'comment'
            })
          ) {
            this.spaces = this.optionalSpace(e)
            this.position++
          } else if (
            this.position === this.tokens.length - 1 ||
            this.nextToken[_.FIELDS.TYPE] === g.comma ||
            this.nextToken[_.FIELDS.TYPE] === g.closeParenthesis
          ) {
            this.current.last.spaces.after = this.optionalSpace(e)
            this.position++
          } else {
            this.combinator()
          }
        }
        e.string = function string() {
          var e = this.currToken
          this.newNode(
            new c['default']({
              value: this.content(),
              source: getTokenSource(e),
              sourceIndex: e[_.FIELDS.START_POS],
            })
          )
          this.position++
        }
        e.universal = function universal(e) {
          var t = this.nextToken
          if (t && this.content(t) === '|') {
            this.position++
            return this.namespace()
          }
          var r = this.currToken
          this.newNode(
            new p['default']({
              value: this.content(),
              source: getTokenSource(r),
              sourceIndex: r[_.FIELDS.START_POS],
            }),
            e
          )
          this.position++
        }
        e.splitWord = function splitWord(e, t) {
          var r = this
          var n = this.nextToken
          var s = this.content()
          while (
            n &&
            ~[g.dollar, g.caret, g.equals, g.word].indexOf(n[_.FIELDS.TYPE])
          ) {
            this.position++
            var o = this.content()
            s += o
            if (o.lastIndexOf('\\') === o.length - 1) {
              var c = this.nextToken
              if (c && c[_.FIELDS.TYPE] === g.space) {
                s += this.requiredSpace(this.content(c))
                this.position++
              }
            }
            n = this.nextToken
          }
          var l = indexesOf(s, '.').filter(function (e) {
            var t = s[e - 1] === '\\'
            var r = /^\d+\.\d+%$/.test(s)
            return !t && !r
          })
          var f = indexesOf(s, '#').filter(function (e) {
            return s[e - 1] !== '\\'
          })
          var p = indexesOf(s, '#{')
          if (p.length) {
            f = f.filter(function (e) {
              return !~p.indexOf(e)
            })
          }
          var d = (0, v['default'])(uniqs([0].concat(l, f)))
          d.forEach(function (n, o) {
            var c = d[o + 1] || s.length
            var p = s.slice(n, c)
            if (o === 0 && t) {
              return t.call(r, p, d.length)
            }
            var h
            var v = r.currToken
            var g = v[_.FIELDS.START_POS] + d[o]
            var y = getSource(v[1], v[2] + n, v[3], v[2] + (c - 1))
            if (~l.indexOf(n)) {
              var b = { value: p.slice(1), source: y, sourceIndex: g }
              h = new i['default'](unescapeProp(b, 'value'))
            } else if (~f.indexOf(n)) {
              var S = { value: p.slice(1), source: y, sourceIndex: g }
              h = new a['default'](unescapeProp(S, 'value'))
            } else {
              var m = { value: p, source: y, sourceIndex: g }
              unescapeProp(m, 'value')
              h = new u['default'](m)
            }
            r.newNode(h, e)
            e = null
          })
          this.position++
        }
        e.word = function word(e) {
          var t = this.nextToken
          if (t && this.content(t) === '|') {
            this.position++
            return this.namespace()
          }
          return this.splitWord(e)
        }
        e.loop = function loop() {
          while (this.position < this.tokens.length) {
            this.parse(true)
          }
          this.current._inferEndPosition()
          return this.root
        }
        e.parse = function parse(e) {
          switch (this.currToken[_.FIELDS.TYPE]) {
            case g.space:
              this.space()
              break
            case g.comment:
              this.comment()
              break
            case g.openParenthesis:
              this.parentheses()
              break
            case g.closeParenthesis:
              if (e) {
                this.missingParenthesis()
              }
              break
            case g.openSquare:
              this.attribute()
              break
            case g.dollar:
            case g.caret:
            case g.equals:
            case g.word:
              this.word()
              break
            case g.colon:
              this.pseudo()
              break
            case g.comma:
              this.comma()
              break
            case g.asterisk:
              this.universal()
              break
            case g.ampersand:
              this.nesting()
              break
            case g.slash:
            case g.combinator:
              this.combinator()
              break
            case g.str:
              this.string()
              break
            case g.closeSquare:
              this.missingSquareBracket()
            case g.semicolon:
              this.missingBackslash()
            default:
              this.unexpected()
          }
        }
        e.expected = function expected(e, t, r) {
          if (Array.isArray(e)) {
            var n = e.pop()
            e = e.join(', ') + ' or ' + n
          }
          var s = /^[aeiou]/.test(e[0]) ? 'an' : 'a'
          if (!r) {
            return this.error('Expected ' + s + ' ' + e + '.', { index: t })
          }
          return this.error(
            'Expected ' + s + ' ' + e + ', found "' + r + '" instead.',
            { index: t }
          )
        }
        e.requiredSpace = function requiredSpace(e) {
          return this.options.lossy ? ' ' : e
        }
        e.optionalSpace = function optionalSpace(e) {
          return this.options.lossy ? '' : e
        }
        e.lossySpace = function lossySpace(e, t) {
          if (this.options.lossy) {
            return t ? ' ' : ''
          } else {
            return e
          }
        }
        e.parseParenthesisToken = function parseParenthesisToken(e) {
          var t = this.content(e)
          if (e[_.FIELDS.TYPE] === g.space) {
            return this.requiredSpace(t)
          } else {
            return t
          }
        }
        e.newNode = function newNode(e, t) {
          if (t) {
            if (/^ +$/.test(t)) {
              if (!this.options.lossy) {
                this.spaces = (this.spaces || '') + t
              }
              t = true
            }
            e.namespace = t
            unescapeProp(e, 'namespace')
          }
          if (this.spaces) {
            e.spaces.before = this.spaces
            this.spaces = ''
          }
          return this.current.append(e)
        }
        e.content = function content(e) {
          if (e === void 0) {
            e = this.currToken
          }
          return this.css.slice(e[_.FIELDS.START_POS], e[_.FIELDS.END_POS])
        }
        e.locateNextMeaningfulToken = function locateNextMeaningfulToken(e) {
          if (e === void 0) {
            e = this.position + 1
          }
          var t = e
          while (t < this.tokens.length) {
            if (k[this.tokens[t][_.FIELDS.TYPE]]) {
              t++
              continue
            } else {
              return t
            }
          }
          return -1
        }
        _createClass(Parser, [
          {
            key: 'currToken',
            get: function get() {
              return this.tokens[this.position]
            },
          },
          {
            key: 'nextToken',
            get: function get() {
              return this.tokens[this.position + 1]
            },
          },
          {
            key: 'prevToken',
            get: function get() {
              return this.tokens[this.position - 1]
            },
          },
        ])
        return Parser
      })()
      t['default'] = T
      e.exports = t.default
    },
    528: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(305))
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      var s = (function () {
        function Processor(e, t) {
          this.func = e || function noop() {}
          this.funcRes = null
          this.options = t
        }
        var e = Processor.prototype
        e._shouldUpdateSelector = function _shouldUpdateSelector(e, t) {
          if (t === void 0) {
            t = {}
          }
          var r = Object.assign({}, this.options, t)
          if (r.updateSelector === false) {
            return false
          } else {
            return typeof e !== 'string'
          }
        }
        e._isLossy = function _isLossy(e) {
          if (e === void 0) {
            e = {}
          }
          var t = Object.assign({}, this.options, e)
          if (t.lossless === false) {
            return true
          } else {
            return false
          }
        }
        e._root = function _root(e, t) {
          if (t === void 0) {
            t = {}
          }
          var r = new n['default'](e, this._parseOptions(t))
          return r.root
        }
        e._parseOptions = function _parseOptions(e) {
          return { lossy: this._isLossy(e) }
        }
        e._run = function _run(e, t) {
          var r = this
          if (t === void 0) {
            t = {}
          }
          return new Promise(function (n, s) {
            try {
              var i = r._root(e, t)
              Promise.resolve(r.func(i))
                .then(function (n) {
                  var s = undefined
                  if (r._shouldUpdateSelector(e, t)) {
                    s = i.toString()
                    e.selector = s
                  }
                  return { transform: n, root: i, string: s }
                })
                .then(n, s)
            } catch (e) {
              s(e)
              return
            }
          })
        }
        e._runSync = function _runSync(e, t) {
          if (t === void 0) {
            t = {}
          }
          var r = this._root(e, t)
          var n = this.func(r)
          if (n && typeof n.then === 'function') {
            throw new Error(
              'Selector processor returned a promise to a synchronous call.'
            )
          }
          var s = undefined
          if (t.updateSelector && typeof e !== 'string') {
            s = r.toString()
            e.selector = s
          }
          return { transform: n, root: r, string: s }
        }
        e.ast = function ast(e, t) {
          return this._run(e, t).then(function (e) {
            return e.root
          })
        }
        e.astSync = function astSync(e, t) {
          return this._runSync(e, t).root
        }
        e.transform = function transform(e, t) {
          return this._run(e, t).then(function (e) {
            return e.transform
          })
        }
        e.transformSync = function transformSync(e, t) {
          return this._runSync(e, t).transform
        }
        e.process = function process(e, t) {
          return this._run(e, t).then(function (e) {
            return e.string || e.root.toString()
          })
        }
        e.processSync = function processSync(e, t) {
          var r = this._runSync(e, t)
          return r.string || r.root.toString()
        }
        return Processor
      })()
      t['default'] = s
      e.exports = t.default
    },
    248: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t.unescapeValue = unescapeValue
      t['default'] = void 0
      var n = _interopRequireDefault(r(441))
      var s = _interopRequireDefault(r(590))
      var i = _interopRequireDefault(r(999))
      var o = r(600)
      var a
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var u = r(124)
      var c = /^('|")([^]*)\1$/
      var l = u(function () {},
      'Assigning an attribute a value containing characters that might need to be escaped is deprecated. ' + 'Call attribute.setValue() instead.')
      var f = u(function () {},
      'Assigning attr.quoted is deprecated and has no effect. Assign to attr.quoteMark instead.')
      var p = u(function () {},
      'Constructing an Attribute selector with a value without specifying quoteMark is deprecated. Note: The value should be unescaped now.')
      function unescapeValue(e) {
        var t = false
        var r = null
        var n = e
        var i = n.match(c)
        if (i) {
          r = i[1]
          n = i[2]
        }
        n = (0, s['default'])(n)
        if (n !== e) {
          t = true
        }
        return { deprecatedUsage: t, unescaped: n, quoteMark: r }
      }
      function handleDeprecatedContructorOpts(e) {
        if (e.quoteMark !== undefined) {
          return e
        }
        if (e.value === undefined) {
          return e
        }
        p()
        var t = unescapeValue(e.value),
          r = t.quoteMark,
          n = t.unescaped
        if (!e.raws) {
          e.raws = {}
        }
        if (e.raws.value === undefined) {
          e.raws.value = e.value
        }
        e.value = n
        e.quoteMark = r
        return e
      }
      var d = (function (e) {
        _inheritsLoose(Attribute, e)
        function Attribute(t) {
          var r
          if (t === void 0) {
            t = {}
          }
          r = e.call(this, handleDeprecatedContructorOpts(t)) || this
          r.type = o.ATTRIBUTE
          r.raws = r.raws || {}
          Object.defineProperty(r.raws, 'unquoted', {
            get: u(function () {
              return r.value
            }, 'attr.raws.unquoted is deprecated. Call attr.value instead.'),
            set: u(function () {
              return r.value
            }, 'Setting attr.raws.unquoted is deprecated and has no effect. attr.value is unescaped by default now.'),
          })
          r._constructed = true
          return r
        }
        var t = Attribute.prototype
        t.getQuotedValue = function getQuotedValue(e) {
          if (e === void 0) {
            e = {}
          }
          var t = this._determineQuoteMark(e)
          var r = h[t]
          var s = (0, n['default'])(this._value, r)
          return s
        }
        t._determineQuoteMark = function _determineQuoteMark(e) {
          return e.smart ? this.smartQuoteMark(e) : this.preferredQuoteMark(e)
        }
        t.setValue = function setValue(e, t) {
          if (t === void 0) {
            t = {}
          }
          this._value = e
          this._quoteMark = this._determineQuoteMark(t)
          this._syncRawValue()
        }
        t.smartQuoteMark = function smartQuoteMark(e) {
          var t = this.value
          var r = t.replace(/[^']/g, '').length
          var s = t.replace(/[^"]/g, '').length
          if (r + s === 0) {
            var i = (0, n['default'])(t, { isIdentifier: true })
            if (i === t) {
              return Attribute.NO_QUOTE
            } else {
              var o = this.preferredQuoteMark(e)
              if (o === Attribute.NO_QUOTE) {
                var a = this.quoteMark || e.quoteMark || Attribute.DOUBLE_QUOTE
                var u = h[a]
                var c = (0, n['default'])(t, u)
                if (c.length < i.length) {
                  return a
                }
              }
              return o
            }
          } else if (s === r) {
            return this.preferredQuoteMark(e)
          } else if (s < r) {
            return Attribute.DOUBLE_QUOTE
          } else {
            return Attribute.SINGLE_QUOTE
          }
        }
        t.preferredQuoteMark = function preferredQuoteMark(e) {
          var t = e.preferCurrentQuoteMark ? this.quoteMark : e.quoteMark
          if (t === undefined) {
            t = e.preferCurrentQuoteMark ? e.quoteMark : this.quoteMark
          }
          if (t === undefined) {
            t = Attribute.DOUBLE_QUOTE
          }
          return t
        }
        t._syncRawValue = function _syncRawValue() {
          var e = (0, n['default'])(this._value, h[this.quoteMark])
          if (e === this._value) {
            if (this.raws) {
              delete this.raws.value
            }
          } else {
            this.raws.value = e
          }
        }
        t._handleEscapes = function _handleEscapes(e, t) {
          if (this._constructed) {
            var r = (0, n['default'])(t, { isIdentifier: true })
            if (r !== t) {
              this.raws[e] = r
            } else {
              delete this.raws[e]
            }
          }
        }
        t._spacesFor = function _spacesFor(e) {
          var t = { before: '', after: '' }
          var r = this.spaces[e] || {}
          var n = (this.raws.spaces && this.raws.spaces[e]) || {}
          return Object.assign(t, r, n)
        }
        t._stringFor = function _stringFor(e, t, r) {
          if (t === void 0) {
            t = e
          }
          if (r === void 0) {
            r = defaultAttrConcat
          }
          var n = this._spacesFor(t)
          return r(this.stringifyProperty(e), n)
        }
        t.offsetOf = function offsetOf(e) {
          var t = 1
          var r = this._spacesFor('attribute')
          t += r.before.length
          if (e === 'namespace' || e === 'ns') {
            return this.namespace ? t : -1
          }
          if (e === 'attributeNS') {
            return t
          }
          t += this.namespaceString.length
          if (this.namespace) {
            t += 1
          }
          if (e === 'attribute') {
            return t
          }
          t += this.stringifyProperty('attribute').length
          t += r.after.length
          var n = this._spacesFor('operator')
          t += n.before.length
          var s = this.stringifyProperty('operator')
          if (e === 'operator') {
            return s ? t : -1
          }
          t += s.length
          t += n.after.length
          var i = this._spacesFor('value')
          t += i.before.length
          var o = this.stringifyProperty('value')
          if (e === 'value') {
            return o ? t : -1
          }
          t += o.length
          t += i.after.length
          var a = this._spacesFor('insensitive')
          t += a.before.length
          if (e === 'insensitive') {
            return this.insensitive ? t : -1
          }
          return -1
        }
        t.toString = function toString() {
          var e = this
          var t = [this.rawSpaceBefore, '[']
          t.push(this._stringFor('qualifiedAttribute', 'attribute'))
          if (this.operator && (this.value || this.value === '')) {
            t.push(this._stringFor('operator'))
            t.push(this._stringFor('value'))
            t.push(
              this._stringFor(
                'insensitiveFlag',
                'insensitive',
                function (t, r) {
                  if (
                    t.length > 0 &&
                    !e.quoted &&
                    r.before.length === 0 &&
                    !(e.spaces.value && e.spaces.value.after)
                  ) {
                    r.before = ' '
                  }
                  return defaultAttrConcat(t, r)
                }
              )
            )
          }
          t.push(']')
          t.push(this.rawSpaceAfter)
          return t.join('')
        }
        _createClass(Attribute, [
          {
            key: 'quoted',
            get: function get() {
              var e = this.quoteMark
              return e === "'" || e === '"'
            },
            set: function set(e) {
              f()
            },
          },
          {
            key: 'quoteMark',
            get: function get() {
              return this._quoteMark
            },
            set: function set(e) {
              if (!this._constructed) {
                this._quoteMark = e
                return
              }
              if (this._quoteMark !== e) {
                this._quoteMark = e
                this._syncRawValue()
              }
            },
          },
          {
            key: 'qualifiedAttribute',
            get: function get() {
              return this.qualifiedName(this.raws.attribute || this.attribute)
            },
          },
          {
            key: 'insensitiveFlag',
            get: function get() {
              return this.insensitive ? 'i' : ''
            },
          },
          {
            key: 'value',
            get: function get() {
              return this._value
            },
            set: function set(e) {
              if (this._constructed) {
                var t = unescapeValue(e),
                  r = t.deprecatedUsage,
                  n = t.unescaped,
                  s = t.quoteMark
                if (r) {
                  l()
                }
                if (n === this._value && s === this._quoteMark) {
                  return
                }
                this._value = n
                this._quoteMark = s
                this._syncRawValue()
              } else {
                this._value = e
              }
            },
          },
          {
            key: 'insensitive',
            get: function get() {
              return this._insensitive
            },
            set: function set(e) {
              if (!e) {
                this._insensitive = false
                if (
                  this.raws &&
                  (this.raws.insensitiveFlag === 'I' ||
                    this.raws.insensitiveFlag === 'i')
                ) {
                  this.raws.insensitiveFlag = undefined
                }
              }
              this._insensitive = e
            },
          },
          {
            key: 'attribute',
            get: function get() {
              return this._attribute
            },
            set: function set(e) {
              this._handleEscapes('attribute', e)
              this._attribute = e
            },
          },
        ])
        return Attribute
      })(i['default'])
      t['default'] = d
      d.NO_QUOTE = null
      d.SINGLE_QUOTE = "'"
      d.DOUBLE_QUOTE = '"'
      var h =
        ((a = {
          "'": { quotes: 'single', wrap: true },
          '"': { quotes: 'double', wrap: true },
        }),
        (a[null] = { isIdentifier: true }),
        a)
      function defaultAttrConcat(e, t) {
        return '' + t.before + e + t.after
      }
    },
    870: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(441))
      var s = r(513)
      var i = _interopRequireDefault(r(373))
      var o = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var a = (function (e) {
        _inheritsLoose(ClassName, e)
        function ClassName(t) {
          var r
          r = e.call(this, t) || this
          r.type = o.CLASS
          r._constructed = true
          return r
        }
        var t = ClassName.prototype
        t.valueToString = function valueToString() {
          return '.' + e.prototype.valueToString.call(this)
        }
        _createClass(ClassName, [
          {
            key: 'value',
            get: function get() {
              return this._value
            },
            set: function set(e) {
              if (this._constructed) {
                var t = (0, n['default'])(e, { isIdentifier: true })
                if (t !== e) {
                  ;(0, s.ensureObject)(this, 'raws')
                  this.raws.value = t
                } else if (this.raws) {
                  delete this.raws.value
                }
              }
              this._value = e
            },
          },
        ])
        return ClassName
      })(i['default'])
      t['default'] = a
      e.exports = t.default
    },
    537: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(373))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Combinator, e)
        function Combinator(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.COMBINATOR
          return r
        }
        return Combinator
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    47: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(373))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Comment, e)
        function Comment(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.COMMENT
          return r
        }
        return Comment
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    734: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t.universal =
        t.tag =
        t.string =
        t.selector =
        t.root =
        t.pseudo =
        t.nesting =
        t.id =
        t.comment =
        t.combinator =
        t.className =
        t.attribute =
          void 0
      var n = _interopRequireDefault(r(248))
      var s = _interopRequireDefault(r(870))
      var i = _interopRequireDefault(r(537))
      var o = _interopRequireDefault(r(47))
      var a = _interopRequireDefault(r(393))
      var u = _interopRequireDefault(r(60))
      var c = _interopRequireDefault(r(326))
      var l = _interopRequireDefault(r(422))
      var f = _interopRequireDefault(r(13))
      var p = _interopRequireDefault(r(435))
      var d = _interopRequireDefault(r(443))
      var h = _interopRequireDefault(r(165))
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      var v = function attribute(e) {
        return new n['default'](e)
      }
      t.attribute = v
      var _ = function className(e) {
        return new s['default'](e)
      }
      t.className = _
      var g = function combinator(e) {
        return new i['default'](e)
      }
      t.combinator = g
      var y = function comment(e) {
        return new o['default'](e)
      }
      t.comment = y
      var b = function id(e) {
        return new a['default'](e)
      }
      t.id = b
      var S = function nesting(e) {
        return new u['default'](e)
      }
      t.nesting = S
      var m = function pseudo(e) {
        return new c['default'](e)
      }
      t.pseudo = m
      var w = function root(e) {
        return new l['default'](e)
      }
      t.root = w
      var k = function selector(e) {
        return new f['default'](e)
      }
      t.selector = k
      var T = function string(e) {
        return new p['default'](e)
      }
      t.string = T
      var O = function tag(e) {
        return new d['default'](e)
      }
      t.tag = O
      var P = function universal(e) {
        return new h['default'](e)
      }
      t.universal = P
    },
    675: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(373))
      var s = _interopRequireWildcard(r(600))
      function _getRequireWildcardCache() {
        if (typeof WeakMap !== 'function') return null
        var e = new WeakMap()
        _getRequireWildcardCache = function _getRequireWildcardCache() {
          return e
        }
        return e
      }
      function _interopRequireWildcard(e) {
        if (e && e.__esModule) {
          return e
        }
        if (e === null || (typeof e !== 'object' && typeof e !== 'function')) {
          return { default: e }
        }
        var t = _getRequireWildcardCache()
        if (t && t.has(e)) {
          return t.get(e)
        }
        var r = {}
        var n = Object.defineProperty && Object.getOwnPropertyDescriptor
        for (var s in e) {
          if (Object.prototype.hasOwnProperty.call(e, s)) {
            var i = n ? Object.getOwnPropertyDescriptor(e, s) : null
            if (i && (i.get || i.set)) {
              Object.defineProperty(r, s, i)
            } else {
              r[s] = e[s]
            }
          }
        }
        r['default'] = e
        if (t) {
          t.set(e, r)
        }
        return r
      }
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _createForOfIteratorHelperLoose(e, t) {
        var r
        if (typeof Symbol === 'undefined' || e[Symbol.iterator] == null) {
          if (
            Array.isArray(e) ||
            (r = _unsupportedIterableToArray(e)) ||
            (t && e && typeof e.length === 'number')
          ) {
            if (r) e = r
            var n = 0
            return function () {
              if (n >= e.length) return { done: true }
              return { done: false, value: e[n++] }
            }
          }
          throw new TypeError(
            'Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
          )
        }
        r = e[Symbol.iterator]()
        return r.next.bind(r)
      }
      function _unsupportedIterableToArray(e, t) {
        if (!e) return
        if (typeof e === 'string') return _arrayLikeToArray(e, t)
        var r = Object.prototype.toString.call(e).slice(8, -1)
        if (r === 'Object' && e.constructor) r = e.constructor.name
        if (r === 'Map' || r === 'Set') return Array.from(e)
        if (
          r === 'Arguments' ||
          /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(r)
        )
          return _arrayLikeToArray(e, t)
      }
      function _arrayLikeToArray(e, t) {
        if (t == null || t > e.length) t = e.length
        for (var r = 0, n = new Array(t); r < t; r++) {
          n[r] = e[r]
        }
        return n
      }
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Container, e)
        function Container(t) {
          var r
          r = e.call(this, t) || this
          if (!r.nodes) {
            r.nodes = []
          }
          return r
        }
        var t = Container.prototype
        t.append = function append(e) {
          e.parent = this
          this.nodes.push(e)
          return this
        }
        t.prepend = function prepend(e) {
          e.parent = this
          this.nodes.unshift(e)
          return this
        }
        t.at = function at(e) {
          return this.nodes[e]
        }
        t.index = function index(e) {
          if (typeof e === 'number') {
            return e
          }
          return this.nodes.indexOf(e)
        }
        t.removeChild = function removeChild(e) {
          e = this.index(e)
          this.at(e).parent = undefined
          this.nodes.splice(e, 1)
          var t
          for (var r in this.indexes) {
            t = this.indexes[r]
            if (t >= e) {
              this.indexes[r] = t - 1
            }
          }
          return this
        }
        t.removeAll = function removeAll() {
          for (
            var e = _createForOfIteratorHelperLoose(this.nodes), t;
            !(t = e()).done;

          ) {
            var r = t.value
            r.parent = undefined
          }
          this.nodes = []
          return this
        }
        t.empty = function empty() {
          return this.removeAll()
        }
        t.insertAfter = function insertAfter(e, t) {
          t.parent = this
          var r = this.index(e)
          this.nodes.splice(r + 1, 0, t)
          t.parent = this
          var n
          for (var s in this.indexes) {
            n = this.indexes[s]
            if (r <= n) {
              this.indexes[s] = n + 1
            }
          }
          return this
        }
        t.insertBefore = function insertBefore(e, t) {
          t.parent = this
          var r = this.index(e)
          this.nodes.splice(r, 0, t)
          t.parent = this
          var n
          for (var s in this.indexes) {
            n = this.indexes[s]
            if (n <= r) {
              this.indexes[s] = n + 1
            }
          }
          return this
        }
        t._findChildAtPosition = function _findChildAtPosition(e, t) {
          var r = undefined
          this.each(function (n) {
            if (n.atPosition) {
              var s = n.atPosition(e, t)
              if (s) {
                r = s
                return false
              }
            } else if (n.isAtPosition(e, t)) {
              r = n
              return false
            }
          })
          return r
        }
        t.atPosition = function atPosition(e, t) {
          if (this.isAtPosition(e, t)) {
            return this._findChildAtPosition(e, t) || this
          } else {
            return undefined
          }
        }
        t._inferEndPosition = function _inferEndPosition() {
          if (this.last && this.last.source && this.last.source.end) {
            this.source = this.source || {}
            this.source.end = this.source.end || {}
            Object.assign(this.source.end, this.last.source.end)
          }
        }
        t.each = function each(e) {
          if (!this.lastEach) {
            this.lastEach = 0
          }
          if (!this.indexes) {
            this.indexes = {}
          }
          this.lastEach++
          var t = this.lastEach
          this.indexes[t] = 0
          if (!this.length) {
            return undefined
          }
          var r, n
          while (this.indexes[t] < this.length) {
            r = this.indexes[t]
            n = e(this.at(r), r)
            if (n === false) {
              break
            }
            this.indexes[t] += 1
          }
          delete this.indexes[t]
          if (n === false) {
            return false
          }
        }
        t.walk = function walk(e) {
          return this.each(function (t, r) {
            var n = e(t, r)
            if (n !== false && t.length) {
              n = t.walk(e)
            }
            if (n === false) {
              return false
            }
          })
        }
        t.walkAttributes = function walkAttributes(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.ATTRIBUTE) {
              return e.call(t, r)
            }
          })
        }
        t.walkClasses = function walkClasses(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.CLASS) {
              return e.call(t, r)
            }
          })
        }
        t.walkCombinators = function walkCombinators(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.COMBINATOR) {
              return e.call(t, r)
            }
          })
        }
        t.walkComments = function walkComments(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.COMMENT) {
              return e.call(t, r)
            }
          })
        }
        t.walkIds = function walkIds(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.ID) {
              return e.call(t, r)
            }
          })
        }
        t.walkNesting = function walkNesting(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.NESTING) {
              return e.call(t, r)
            }
          })
        }
        t.walkPseudos = function walkPseudos(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.PSEUDO) {
              return e.call(t, r)
            }
          })
        }
        t.walkTags = function walkTags(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.TAG) {
              return e.call(t, r)
            }
          })
        }
        t.walkUniversals = function walkUniversals(e) {
          var t = this
          return this.walk(function (r) {
            if (r.type === s.UNIVERSAL) {
              return e.call(t, r)
            }
          })
        }
        t.split = function split(e) {
          var t = this
          var r = []
          return this.reduce(function (n, s, i) {
            var o = e.call(t, s)
            r.push(s)
            if (o) {
              n.push(r)
              r = []
            } else if (i === t.length - 1) {
              n.push(r)
            }
            return n
          }, [])
        }
        t.map = function map(e) {
          return this.nodes.map(e)
        }
        t.reduce = function reduce(e, t) {
          return this.nodes.reduce(e, t)
        }
        t.every = function every(e) {
          return this.nodes.every(e)
        }
        t.some = function some(e) {
          return this.nodes.some(e)
        }
        t.filter = function filter(e) {
          return this.nodes.filter(e)
        }
        t.sort = function sort(e) {
          return this.nodes.sort(e)
        }
        t.toString = function toString() {
          return this.map(String).join('')
        }
        _createClass(Container, [
          {
            key: 'first',
            get: function get() {
              return this.at(0)
            },
          },
          {
            key: 'last',
            get: function get() {
              return this.at(this.length - 1)
            },
          },
          {
            key: 'length',
            get: function get() {
              return this.nodes.length
            },
          },
        ])
        return Container
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    493: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t.isNode = isNode
      t.isPseudoElement = isPseudoElement
      t.isPseudoClass = isPseudoClass
      t.isContainer = isContainer
      t.isNamespace = isNamespace
      t.isUniversal =
        t.isTag =
        t.isString =
        t.isSelector =
        t.isRoot =
        t.isPseudo =
        t.isNesting =
        t.isIdentifier =
        t.isComment =
        t.isCombinator =
        t.isClassName =
        t.isAttribute =
          void 0
      var n = r(600)
      var s
      var i =
        ((s = {}),
        (s[n.ATTRIBUTE] = true),
        (s[n.CLASS] = true),
        (s[n.COMBINATOR] = true),
        (s[n.COMMENT] = true),
        (s[n.ID] = true),
        (s[n.NESTING] = true),
        (s[n.PSEUDO] = true),
        (s[n.ROOT] = true),
        (s[n.SELECTOR] = true),
        (s[n.STRING] = true),
        (s[n.TAG] = true),
        (s[n.UNIVERSAL] = true),
        s)
      function isNode(e) {
        return typeof e === 'object' && i[e.type]
      }
      function isNodeType(e, t) {
        return isNode(t) && t.type === e
      }
      var o = isNodeType.bind(null, n.ATTRIBUTE)
      t.isAttribute = o
      var a = isNodeType.bind(null, n.CLASS)
      t.isClassName = a
      var u = isNodeType.bind(null, n.COMBINATOR)
      t.isCombinator = u
      var c = isNodeType.bind(null, n.COMMENT)
      t.isComment = c
      var l = isNodeType.bind(null, n.ID)
      t.isIdentifier = l
      var f = isNodeType.bind(null, n.NESTING)
      t.isNesting = f
      var p = isNodeType.bind(null, n.PSEUDO)
      t.isPseudo = p
      var d = isNodeType.bind(null, n.ROOT)
      t.isRoot = d
      var h = isNodeType.bind(null, n.SELECTOR)
      t.isSelector = h
      var v = isNodeType.bind(null, n.STRING)
      t.isString = v
      var _ = isNodeType.bind(null, n.TAG)
      t.isTag = _
      var g = isNodeType.bind(null, n.UNIVERSAL)
      t.isUniversal = g
      function isPseudoElement(e) {
        return (
          p(e) &&
          e.value &&
          (e.value.startsWith('::') ||
            e.value.toLowerCase() === ':before' ||
            e.value.toLowerCase() === ':after' ||
            e.value.toLowerCase() === ':first-letter' ||
            e.value.toLowerCase() === ':first-line')
        )
      }
      function isPseudoClass(e) {
        return p(e) && !isPseudoElement(e)
      }
      function isContainer(e) {
        return !!(isNode(e) && e.walk)
      }
      function isNamespace(e) {
        return o(e) || _(e)
      }
    },
    393: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(373))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(ID, e)
        function ID(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.ID
          return r
        }
        var t = ID.prototype
        t.valueToString = function valueToString() {
          return '#' + e.prototype.valueToString.call(this)
        }
        return ID
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    110: (e, t, r) => {
      'use strict'
      t.__esModule = true
      var n = r(600)
      Object.keys(n).forEach(function (e) {
        if (e === 'default' || e === '__esModule') return
        if (e in t && t[e] === n[e]) return
        t[e] = n[e]
      })
      var s = r(734)
      Object.keys(s).forEach(function (e) {
        if (e === 'default' || e === '__esModule') return
        if (e in t && t[e] === s[e]) return
        t[e] = s[e]
      })
      var i = r(493)
      Object.keys(i).forEach(function (e) {
        if (e === 'default' || e === '__esModule') return
        if (e in t && t[e] === i[e]) return
        t[e] = i[e]
      })
    },
    999: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(441))
      var s = r(513)
      var i = _interopRequireDefault(r(373))
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var o = (function (e) {
        _inheritsLoose(Namespace, e)
        function Namespace() {
          return e.apply(this, arguments) || this
        }
        var t = Namespace.prototype
        t.qualifiedName = function qualifiedName(e) {
          if (this.namespace) {
            return this.namespaceString + '|' + e
          } else {
            return e
          }
        }
        t.valueToString = function valueToString() {
          return this.qualifiedName(e.prototype.valueToString.call(this))
        }
        _createClass(Namespace, [
          {
            key: 'namespace',
            get: function get() {
              return this._namespace
            },
            set: function set(e) {
              if (e === true || e === '*' || e === '&') {
                this._namespace = e
                if (this.raws) {
                  delete this.raws.namespace
                }
                return
              }
              var t = (0, n['default'])(e, { isIdentifier: true })
              this._namespace = e
              if (t !== e) {
                ;(0, s.ensureObject)(this, 'raws')
                this.raws.namespace = t
              } else if (this.raws) {
                delete this.raws.namespace
              }
            },
          },
          {
            key: 'ns',
            get: function get() {
              return this._namespace
            },
            set: function set(e) {
              this.namespace = e
            },
          },
          {
            key: 'namespaceString',
            get: function get() {
              if (this.namespace) {
                var e = this.stringifyProperty('namespace')
                if (e === true) {
                  return ''
                } else {
                  return e
                }
              } else {
                return ''
              }
            },
          },
        ])
        return Namespace
      })(i['default'])
      t['default'] = o
      e.exports = t.default
    },
    60: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(373))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Nesting, e)
        function Nesting(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.NESTING
          r.value = '&'
          return r
        }
        return Nesting
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    373: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = r(513)
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      var s = function cloneNode(e, t) {
        if (typeof e !== 'object' || e === null) {
          return e
        }
        var r = new e.constructor()
        for (var n in e) {
          if (!e.hasOwnProperty(n)) {
            continue
          }
          var s = e[n]
          var i = typeof s
          if (n === 'parent' && i === 'object') {
            if (t) {
              r[n] = t
            }
          } else if (s instanceof Array) {
            r[n] = s.map(function (e) {
              return cloneNode(e, r)
            })
          } else {
            r[n] = cloneNode(s, r)
          }
        }
        return r
      }
      var i = (function () {
        function Node(e) {
          if (e === void 0) {
            e = {}
          }
          Object.assign(this, e)
          this.spaces = this.spaces || {}
          this.spaces.before = this.spaces.before || ''
          this.spaces.after = this.spaces.after || ''
        }
        var e = Node.prototype
        e.remove = function remove() {
          if (this.parent) {
            this.parent.removeChild(this)
          }
          this.parent = undefined
          return this
        }
        e.replaceWith = function replaceWith() {
          if (this.parent) {
            for (var e in arguments) {
              this.parent.insertBefore(this, arguments[e])
            }
            this.remove()
          }
          return this
        }
        e.next = function next() {
          return this.parent.at(this.parent.index(this) + 1)
        }
        e.prev = function prev() {
          return this.parent.at(this.parent.index(this) - 1)
        }
        e.clone = function clone(e) {
          if (e === void 0) {
            e = {}
          }
          var t = s(this)
          for (var r in e) {
            t[r] = e[r]
          }
          return t
        }
        e.appendToPropertyAndEscape = function appendToPropertyAndEscape(
          e,
          t,
          r
        ) {
          if (!this.raws) {
            this.raws = {}
          }
          var n = this[e]
          var s = this.raws[e]
          this[e] = n + t
          if (s || r !== t) {
            this.raws[e] = (s || n) + r
          } else {
            delete this.raws[e]
          }
        }
        e.setPropertyAndEscape = function setPropertyAndEscape(e, t, r) {
          if (!this.raws) {
            this.raws = {}
          }
          this[e] = t
          this.raws[e] = r
        }
        e.setPropertyWithoutEscape = function setPropertyWithoutEscape(e, t) {
          this[e] = t
          if (this.raws) {
            delete this.raws[e]
          }
        }
        e.isAtPosition = function isAtPosition(e, t) {
          if (this.source && this.source.start && this.source.end) {
            if (this.source.start.line > e) {
              return false
            }
            if (this.source.end.line < e) {
              return false
            }
            if (this.source.start.line === e && this.source.start.column > t) {
              return false
            }
            if (this.source.end.line === e && this.source.end.column < t) {
              return false
            }
            return true
          }
          return undefined
        }
        e.stringifyProperty = function stringifyProperty(e) {
          return (this.raws && this.raws[e]) || this[e]
        }
        e.valueToString = function valueToString() {
          return String(this.stringifyProperty('value'))
        }
        e.toString = function toString() {
          return [
            this.rawSpaceBefore,
            this.valueToString(),
            this.rawSpaceAfter,
          ].join('')
        }
        _createClass(Node, [
          {
            key: 'rawSpaceBefore',
            get: function get() {
              var e = this.raws && this.raws.spaces && this.raws.spaces.before
              if (e === undefined) {
                e = this.spaces && this.spaces.before
              }
              return e || ''
            },
            set: function set(e) {
              ;(0, n.ensureObject)(this, 'raws', 'spaces')
              this.raws.spaces.before = e
            },
          },
          {
            key: 'rawSpaceAfter',
            get: function get() {
              var e = this.raws && this.raws.spaces && this.raws.spaces.after
              if (e === undefined) {
                e = this.spaces.after
              }
              return e || ''
            },
            set: function set(e) {
              ;(0, n.ensureObject)(this, 'raws', 'spaces')
              this.raws.spaces.after = e
            },
          },
        ])
        return Node
      })()
      t['default'] = i
      e.exports = t.default
    },
    326: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(675))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Pseudo, e)
        function Pseudo(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.PSEUDO
          return r
        }
        var t = Pseudo.prototype
        t.toString = function toString() {
          var e = this.length ? '(' + this.map(String).join(',') + ')' : ''
          return [
            this.rawSpaceBefore,
            this.stringifyProperty('value'),
            e,
            this.rawSpaceAfter,
          ].join('')
        }
        return Pseudo
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    422: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(675))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _defineProperties(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r]
          n.enumerable = n.enumerable || false
          n.configurable = true
          if ('value' in n) n.writable = true
          Object.defineProperty(e, n.key, n)
        }
      }
      function _createClass(e, t, r) {
        if (t) _defineProperties(e.prototype, t)
        if (r) _defineProperties(e, r)
        return e
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Root, e)
        function Root(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.ROOT
          return r
        }
        var t = Root.prototype
        t.toString = function toString() {
          var e = this.reduce(function (e, t) {
            e.push(String(t))
            return e
          }, []).join(',')
          return this.trailingComma ? e + ',' : e
        }
        t.error = function error(e, t) {
          if (this._error) {
            return this._error(e, t)
          } else {
            return new Error(e)
          }
        }
        _createClass(Root, [
          {
            key: 'errorGenerator',
            set: function set(e) {
              this._error = e
            },
          },
        ])
        return Root
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    13: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(675))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Selector, e)
        function Selector(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.SELECTOR
          return r
        }
        return Selector
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    435: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(373))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(String, e)
        function String(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.STRING
          return r
        }
        return String
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    443: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(999))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Tag, e)
        function Tag(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.TAG
          return r
        }
        return Tag
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    600: (e, t) => {
      'use strict'
      t.__esModule = true
      t.UNIVERSAL =
        t.ATTRIBUTE =
        t.CLASS =
        t.COMBINATOR =
        t.COMMENT =
        t.ID =
        t.NESTING =
        t.PSEUDO =
        t.ROOT =
        t.SELECTOR =
        t.STRING =
        t.TAG =
          void 0
      var r = 'tag'
      t.TAG = r
      var n = 'string'
      t.STRING = n
      var s = 'selector'
      t.SELECTOR = s
      var i = 'root'
      t.ROOT = i
      var o = 'pseudo'
      t.PSEUDO = o
      var a = 'nesting'
      t.NESTING = a
      var u = 'id'
      t.ID = u
      var c = 'comment'
      t.COMMENT = c
      var l = 'combinator'
      t.COMBINATOR = l
      var f = 'class'
      t.CLASS = f
      var p = 'attribute'
      t.ATTRIBUTE = p
      var d = 'universal'
      t.UNIVERSAL = d
    },
    165: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = void 0
      var n = _interopRequireDefault(r(999))
      var s = r(600)
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
      function _inheritsLoose(e, t) {
        e.prototype = Object.create(t.prototype)
        e.prototype.constructor = e
        _setPrototypeOf(e, t)
      }
      function _setPrototypeOf(e, t) {
        _setPrototypeOf =
          Object.setPrototypeOf ||
          function _setPrototypeOf(e, t) {
            e.__proto__ = t
            return e
          }
        return _setPrototypeOf(e, t)
      }
      var i = (function (e) {
        _inheritsLoose(Universal, e)
        function Universal(t) {
          var r
          r = e.call(this, t) || this
          r.type = s.UNIVERSAL
          r.value = '*'
          return r
        }
        return Universal
      })(n['default'])
      t['default'] = i
      e.exports = t.default
    },
    173: (e, t) => {
      'use strict'
      t.__esModule = true
      t['default'] = sortAscending
      function sortAscending(e) {
        return e.sort(function (e, t) {
          return e - t
        })
      }
      e.exports = t.default
    },
    553: (e, t) => {
      'use strict'
      t.__esModule = true
      t.combinator =
        t.word =
        t.comment =
        t.str =
        t.tab =
        t.newline =
        t.feed =
        t.cr =
        t.backslash =
        t.bang =
        t.slash =
        t.doubleQuote =
        t.singleQuote =
        t.space =
        t.greaterThan =
        t.pipe =
        t.equals =
        t.plus =
        t.caret =
        t.tilde =
        t.dollar =
        t.closeSquare =
        t.openSquare =
        t.closeParenthesis =
        t.openParenthesis =
        t.semicolon =
        t.colon =
        t.comma =
        t.at =
        t.asterisk =
        t.ampersand =
          void 0
      var r = 38
      t.ampersand = r
      var n = 42
      t.asterisk = n
      var s = 64
      t.at = s
      var i = 44
      t.comma = i
      var o = 58
      t.colon = o
      var a = 59
      t.semicolon = a
      var u = 40
      t.openParenthesis = u
      var c = 41
      t.closeParenthesis = c
      var l = 91
      t.openSquare = l
      var f = 93
      t.closeSquare = f
      var p = 36
      t.dollar = p
      var d = 126
      t.tilde = d
      var h = 94
      t.caret = h
      var v = 43
      t.plus = v
      var _ = 61
      t.equals = _
      var g = 124
      t.pipe = g
      var y = 62
      t.greaterThan = y
      var b = 32
      t.space = b
      var S = 39
      t.singleQuote = S
      var m = 34
      t.doubleQuote = m
      var w = 47
      t.slash = w
      var k = 33
      t.bang = k
      var T = 92
      t.backslash = T
      var O = 13
      t.cr = O
      var P = 12
      t.feed = P
      var E = 10
      t.newline = E
      var I = 9
      t.tab = I
      var A = S
      t.str = A
      var x = -1
      t.comment = x
      var D = -2
      t.word = D
      var C = -3
      t.combinator = C
    },
    133: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t['default'] = tokenize
      t.FIELDS = void 0
      var n = _interopRequireWildcard(r(553))
      var s, i
      function _getRequireWildcardCache() {
        if (typeof WeakMap !== 'function') return null
        var e = new WeakMap()
        _getRequireWildcardCache = function _getRequireWildcardCache() {
          return e
        }
        return e
      }
      function _interopRequireWildcard(e) {
        if (e && e.__esModule) {
          return e
        }
        if (e === null || (typeof e !== 'object' && typeof e !== 'function')) {
          return { default: e }
        }
        var t = _getRequireWildcardCache()
        if (t && t.has(e)) {
          return t.get(e)
        }
        var r = {}
        var n = Object.defineProperty && Object.getOwnPropertyDescriptor
        for (var s in e) {
          if (Object.prototype.hasOwnProperty.call(e, s)) {
            var i = n ? Object.getOwnPropertyDescriptor(e, s) : null
            if (i && (i.get || i.set)) {
              Object.defineProperty(r, s, i)
            } else {
              r[s] = e[s]
            }
          }
        }
        r['default'] = e
        if (t) {
          t.set(e, r)
        }
        return r
      }
      var o =
        ((s = {}),
        (s[n.tab] = true),
        (s[n.newline] = true),
        (s[n.cr] = true),
        (s[n.feed] = true),
        s)
      var a =
        ((i = {}),
        (i[n.space] = true),
        (i[n.tab] = true),
        (i[n.newline] = true),
        (i[n.cr] = true),
        (i[n.feed] = true),
        (i[n.ampersand] = true),
        (i[n.asterisk] = true),
        (i[n.bang] = true),
        (i[n.comma] = true),
        (i[n.colon] = true),
        (i[n.semicolon] = true),
        (i[n.openParenthesis] = true),
        (i[n.closeParenthesis] = true),
        (i[n.openSquare] = true),
        (i[n.closeSquare] = true),
        (i[n.singleQuote] = true),
        (i[n.doubleQuote] = true),
        (i[n.plus] = true),
        (i[n.pipe] = true),
        (i[n.tilde] = true),
        (i[n.greaterThan] = true),
        (i[n.equals] = true),
        (i[n.dollar] = true),
        (i[n.caret] = true),
        (i[n.slash] = true),
        i)
      var u = {}
      var c = '0123456789abcdefABCDEF'
      for (var l = 0; l < c.length; l++) {
        u[c.charCodeAt(l)] = true
      }
      function consumeWord(e, t) {
        var r = t
        var s
        do {
          s = e.charCodeAt(r)
          if (a[s]) {
            return r - 1
          } else if (s === n.backslash) {
            r = consumeEscape(e, r) + 1
          } else {
            r++
          }
        } while (r < e.length)
        return r - 1
      }
      function consumeEscape(e, t) {
        var r = t
        var s = e.charCodeAt(r + 1)
        if (o[s]) {
        } else if (u[s]) {
          var i = 0
          do {
            r++
            i++
            s = e.charCodeAt(r + 1)
          } while (u[s] && i < 6)
          if (i < 6 && s === n.space) {
            r++
          }
        } else {
          r++
        }
        return r
      }
      var f = {
        TYPE: 0,
        START_LINE: 1,
        START_COL: 2,
        END_LINE: 3,
        END_COL: 4,
        START_POS: 5,
        END_POS: 6,
      }
      t.FIELDS = f
      function tokenize(e) {
        var t = []
        var r = e.css.valueOf()
        var s = r,
          i = s.length
        var o = -1
        var a = 1
        var u = 0
        var c = 0
        var l, f, p, d, h, v, _, g, y, b, S, m, w
        function unclosed(t, n) {
          if (e.safe) {
            r += n
            y = r.length - 1
          } else {
            throw e.error('Unclosed ' + t, a, u - o, u)
          }
        }
        while (u < i) {
          l = r.charCodeAt(u)
          if (l === n.newline) {
            o = u
            a += 1
          }
          switch (l) {
            case n.space:
            case n.tab:
            case n.newline:
            case n.cr:
            case n.feed:
              y = u
              do {
                y += 1
                l = r.charCodeAt(y)
                if (l === n.newline) {
                  o = y
                  a += 1
                }
              } while (
                l === n.space ||
                l === n.newline ||
                l === n.tab ||
                l === n.cr ||
                l === n.feed
              )
              w = n.space
              d = a
              p = y - o - 1
              c = y
              break
            case n.plus:
            case n.greaterThan:
            case n.tilde:
            case n.pipe:
              y = u
              do {
                y += 1
                l = r.charCodeAt(y)
              } while (
                l === n.plus ||
                l === n.greaterThan ||
                l === n.tilde ||
                l === n.pipe
              )
              w = n.combinator
              d = a
              p = u - o
              c = y
              break
            case n.asterisk:
            case n.ampersand:
            case n.bang:
            case n.comma:
            case n.equals:
            case n.dollar:
            case n.caret:
            case n.openSquare:
            case n.closeSquare:
            case n.colon:
            case n.semicolon:
            case n.openParenthesis:
            case n.closeParenthesis:
              y = u
              w = l
              d = a
              p = u - o
              c = y + 1
              break
            case n.singleQuote:
            case n.doubleQuote:
              m = l === n.singleQuote ? "'" : '"'
              y = u
              do {
                h = false
                y = r.indexOf(m, y + 1)
                if (y === -1) {
                  unclosed('quote', m)
                }
                v = y
                while (r.charCodeAt(v - 1) === n.backslash) {
                  v -= 1
                  h = !h
                }
              } while (h)
              w = n.str
              d = a
              p = u - o
              c = y + 1
              break
            default:
              if (l === n.slash && r.charCodeAt(u + 1) === n.asterisk) {
                y = r.indexOf('*/', u + 2) + 1
                if (y === 0) {
                  unclosed('comment', '*/')
                }
                f = r.slice(u, y + 1)
                g = f.split('\n')
                _ = g.length - 1
                if (_ > 0) {
                  b = a + _
                  S = y - g[_].length
                } else {
                  b = a
                  S = o
                }
                w = n.comment
                a = b
                d = b
                p = y - S
              } else if (l === n.slash) {
                y = u
                w = l
                d = a
                p = u - o
                c = y + 1
              } else {
                y = consumeWord(r, u)
                w = n.word
                d = a
                p = y - o
              }
              c = y + 1
              break
          }
          t.push([w, a, u - o, d, p, u, c])
          if (S) {
            o = S
            S = null
          }
          u = c
        }
        return t
      }
    },
    684: (e, t) => {
      'use strict'
      t.__esModule = true
      t['default'] = ensureObject
      function ensureObject(e) {
        for (
          var t = arguments.length, r = new Array(t > 1 ? t - 1 : 0), n = 1;
          n < t;
          n++
        ) {
          r[n - 1] = arguments[n]
        }
        while (r.length > 0) {
          var s = r.shift()
          if (!e[s]) {
            e[s] = {}
          }
          e = e[s]
        }
      }
      e.exports = t.default
    },
    976: (e, t) => {
      'use strict'
      t.__esModule = true
      t['default'] = getProp
      function getProp(e) {
        for (
          var t = arguments.length, r = new Array(t > 1 ? t - 1 : 0), n = 1;
          n < t;
          n++
        ) {
          r[n - 1] = arguments[n]
        }
        while (r.length > 0) {
          var s = r.shift()
          if (!e[s]) {
            return undefined
          }
          e = e[s]
        }
        return e
      }
      e.exports = t.default
    },
    513: (e, t, r) => {
      'use strict'
      t.__esModule = true
      t.stripComments = t.ensureObject = t.getProp = t.unesc = void 0
      var n = _interopRequireDefault(r(590))
      t.unesc = n['default']
      var s = _interopRequireDefault(r(976))
      t.getProp = s['default']
      var i = _interopRequireDefault(r(684))
      t.ensureObject = i['default']
      var o = _interopRequireDefault(r(453))
      t.stripComments = o['default']
      function _interopRequireDefault(e) {
        return e && e.__esModule ? e : { default: e }
      }
    },
    453: (e, t) => {
      'use strict'
      t.__esModule = true
      t['default'] = stripComments
      function stripComments(e) {
        var t = ''
        var r = e.indexOf('/*')
        var n = 0
        while (r >= 0) {
          t = t + e.slice(n, r)
          var s = e.indexOf('*/', r + 2)
          if (s < 0) {
            return t
          }
          n = s + 2
          r = e.indexOf('/*', n)
        }
        t = t + e.slice(n)
        return t
      }
      e.exports = t.default
    },
    590: (e, t) => {
      'use strict'
      t.__esModule = true
      t['default'] = unesc
      function gobbleHex(e) {
        var t = e.toLowerCase()
        var r = ''
        var n = false
        for (var s = 0; s < 6 && t[s] !== undefined; s++) {
          var i = t.charCodeAt(s)
          var o = (i >= 97 && i <= 102) || (i >= 48 && i <= 57)
          n = i === 32
          if (!o) {
            break
          }
          r += t[s]
        }
        if (r.length === 0) {
          return undefined
        }
        var a = parseInt(r, 16)
        var u = a >= 55296 && a <= 57343
        if (u || a === 0 || a > 1114111) {
          return ['�', r.length + (n ? 1 : 0)]
        }
        return [String.fromCodePoint(a), r.length + (n ? 1 : 0)]
      }
      var r = /\\/
      function unesc(e) {
        var t = r.test(e)
        if (!t) {
          return e
        }
        var n = ''
        for (var s = 0; s < e.length; s++) {
          if (e[s] === '\\') {
            var i = gobbleHex(e.slice(s + 1, s + 7))
            if (i !== undefined) {
              n += i[0]
              s += i[1]
              continue
            }
            if (e[s + 1] === '\\') {
              n += '\\'
              s++
              continue
            }
            if (e.length === s + 1) {
              n += e[s]
            }
            continue
          }
          n += e[s]
        }
        return n
      }
      e.exports = t.default
    },
    697: (e, t, r) => {
      var n = r(257)
      var s = r(961)
      var i = r(256)
      function ValueParser(e) {
        if (this instanceof ValueParser) {
          this.nodes = n(e)
          return this
        }
        return new ValueParser(e)
      }
      ValueParser.prototype.toString = function () {
        return Array.isArray(this.nodes) ? i(this.nodes) : ''
      }
      ValueParser.prototype.walk = function (e, t) {
        s(this.nodes, e, t)
        return this
      }
      ValueParser.unit = r(68)
      ValueParser.walk = s
      ValueParser.stringify = i
      e.exports = ValueParser
    },
    257: (e) => {
      var t = '('.charCodeAt(0)
      var r = ')'.charCodeAt(0)
      var n = "'".charCodeAt(0)
      var s = '"'.charCodeAt(0)
      var i = '\\'.charCodeAt(0)
      var o = '/'.charCodeAt(0)
      var a = ','.charCodeAt(0)
      var u = ':'.charCodeAt(0)
      var c = '*'.charCodeAt(0)
      var l = 'u'.charCodeAt(0)
      var f = 'U'.charCodeAt(0)
      var p = '+'.charCodeAt(0)
      var d = /^[a-f0-9?-]+$/i
      e.exports = function (e) {
        var h = []
        var v = e
        var _, g, y, b, S, m, w, k
        var T = 0
        var O = v.charCodeAt(T)
        var P = v.length
        var E = [{ nodes: h }]
        var I = 0
        var A
        var x = ''
        var D = ''
        var C = ''
        while (T < P) {
          if (O <= 32) {
            _ = T
            do {
              _ += 1
              O = v.charCodeAt(_)
            } while (O <= 32)
            b = v.slice(T, _)
            y = h[h.length - 1]
            if (O === r && I) {
              C = b
            } else if (y && y.type === 'div') {
              y.after = b
              y.sourceEndIndex += b.length
            } else if (
              O === a ||
              O === u ||
              (O === o &&
                v.charCodeAt(_ + 1) !== c &&
                (!A || (A && A.type === 'function' && A.value !== 'calc')))
            ) {
              D = b
            } else {
              h.push({
                type: 'space',
                sourceIndex: T,
                sourceEndIndex: _,
                value: b,
              })
            }
            T = _
          } else if (O === n || O === s) {
            _ = T
            g = O === n ? "'" : '"'
            b = { type: 'string', sourceIndex: T, quote: g }
            do {
              S = false
              _ = v.indexOf(g, _ + 1)
              if (~_) {
                m = _
                while (v.charCodeAt(m - 1) === i) {
                  m -= 1
                  S = !S
                }
              } else {
                v += g
                _ = v.length - 1
                b.unclosed = true
              }
            } while (S)
            b.value = v.slice(T + 1, _)
            b.sourceEndIndex = b.unclosed ? _ : _ + 1
            h.push(b)
            T = _ + 1
            O = v.charCodeAt(T)
          } else if (O === o && v.charCodeAt(T + 1) === c) {
            _ = v.indexOf('*/', T)
            b = { type: 'comment', sourceIndex: T, sourceEndIndex: _ + 2 }
            if (_ === -1) {
              b.unclosed = true
              _ = v.length
              b.sourceEndIndex = _
            }
            b.value = v.slice(T + 2, _)
            h.push(b)
            T = _ + 2
            O = v.charCodeAt(T)
          } else if (
            (O === o || O === c) &&
            A &&
            A.type === 'function' &&
            A.value === 'calc'
          ) {
            b = v[T]
            h.push({
              type: 'word',
              sourceIndex: T - D.length,
              sourceEndIndex: T + b.length,
              value: b,
            })
            T += 1
            O = v.charCodeAt(T)
          } else if (O === o || O === a || O === u) {
            b = v[T]
            h.push({
              type: 'div',
              sourceIndex: T - D.length,
              sourceEndIndex: T + b.length,
              value: b,
              before: D,
              after: '',
            })
            D = ''
            T += 1
            O = v.charCodeAt(T)
          } else if (t === O) {
            _ = T
            do {
              _ += 1
              O = v.charCodeAt(_)
            } while (O <= 32)
            k = T
            b = {
              type: 'function',
              sourceIndex: T - x.length,
              value: x,
              before: v.slice(k + 1, _),
            }
            T = _
            if (x === 'url' && O !== n && O !== s) {
              _ -= 1
              do {
                S = false
                _ = v.indexOf(')', _ + 1)
                if (~_) {
                  m = _
                  while (v.charCodeAt(m - 1) === i) {
                    m -= 1
                    S = !S
                  }
                } else {
                  v += ')'
                  _ = v.length - 1
                  b.unclosed = true
                }
              } while (S)
              w = _
              do {
                w -= 1
                O = v.charCodeAt(w)
              } while (O <= 32)
              if (k < w) {
                if (T !== w + 1) {
                  b.nodes = [
                    {
                      type: 'word',
                      sourceIndex: T,
                      sourceEndIndex: w + 1,
                      value: v.slice(T, w + 1),
                    },
                  ]
                } else {
                  b.nodes = []
                }
                if (b.unclosed && w + 1 !== _) {
                  b.after = ''
                  b.nodes.push({
                    type: 'space',
                    sourceIndex: w + 1,
                    sourceEndIndex: _,
                    value: v.slice(w + 1, _),
                  })
                } else {
                  b.after = v.slice(w + 1, _)
                  b.sourceEndIndex = _
                }
              } else {
                b.after = ''
                b.nodes = []
              }
              T = _ + 1
              b.sourceEndIndex = b.unclosed ? _ : T
              O = v.charCodeAt(T)
              h.push(b)
            } else {
              I += 1
              b.after = ''
              b.sourceEndIndex = T + 1
              h.push(b)
              E.push(b)
              h = b.nodes = []
              A = b
            }
            x = ''
          } else if (r === O && I) {
            T += 1
            O = v.charCodeAt(T)
            A.after = C
            A.sourceEndIndex += C.length
            C = ''
            I -= 1
            E[E.length - 1].sourceEndIndex = T
            E.pop()
            A = E[I]
            h = A.nodes
          } else {
            _ = T
            do {
              if (O === i) {
                _ += 1
              }
              _ += 1
              O = v.charCodeAt(_)
            } while (
              _ < P &&
              !(
                O <= 32 ||
                O === n ||
                O === s ||
                O === a ||
                O === u ||
                O === o ||
                O === t ||
                (O === c && A && A.type === 'function' && A.value === 'calc') ||
                (O === o && A.type === 'function' && A.value === 'calc') ||
                (O === r && I)
              )
            )
            b = v.slice(T, _)
            if (t === O) {
              x = b
            } else if (
              (l === b.charCodeAt(0) || f === b.charCodeAt(0)) &&
              p === b.charCodeAt(1) &&
              d.test(b.slice(2))
            ) {
              h.push({
                type: 'unicode-range',
                sourceIndex: T,
                sourceEndIndex: _,
                value: b,
              })
            } else {
              h.push({
                type: 'word',
                sourceIndex: T,
                sourceEndIndex: _,
                value: b,
              })
            }
            T = _
          }
        }
        for (T = E.length - 1; T; T -= 1) {
          E[T].unclosed = true
          E[T].sourceEndIndex = v.length
        }
        return E[0].nodes
      }
    },
    256: (e) => {
      function stringifyNode(e, t) {
        var r = e.type
        var n = e.value
        var s
        var i
        if (t && (i = t(e)) !== undefined) {
          return i
        } else if (r === 'word' || r === 'space') {
          return n
        } else if (r === 'string') {
          s = e.quote || ''
          return s + n + (e.unclosed ? '' : s)
        } else if (r === 'comment') {
          return '/*' + n + (e.unclosed ? '' : '*/')
        } else if (r === 'div') {
          return (e.before || '') + n + (e.after || '')
        } else if (Array.isArray(e.nodes)) {
          s = stringify(e.nodes, t)
          if (r !== 'function') {
            return s
          }
          return (
            n +
            '(' +
            (e.before || '') +
            s +
            (e.after || '') +
            (e.unclosed ? '' : ')')
          )
        }
        return n
      }
      function stringify(e, t) {
        var r, n
        if (Array.isArray(e)) {
          r = ''
          for (n = e.length - 1; ~n; n -= 1) {
            r = stringifyNode(e[n], t) + r
          }
          return r
        }
        return stringifyNode(e, t)
      }
      e.exports = stringify
    },
    68: (e) => {
      var t = '-'.charCodeAt(0)
      var r = '+'.charCodeAt(0)
      var n = '.'.charCodeAt(0)
      var s = 'e'.charCodeAt(0)
      var i = 'E'.charCodeAt(0)
      function likeNumber(e) {
        var s = e.charCodeAt(0)
        var i
        if (s === r || s === t) {
          i = e.charCodeAt(1)
          if (i >= 48 && i <= 57) {
            return true
          }
          var o = e.charCodeAt(2)
          if (i === n && o >= 48 && o <= 57) {
            return true
          }
          return false
        }
        if (s === n) {
          i = e.charCodeAt(1)
          if (i >= 48 && i <= 57) {
            return true
          }
          return false
        }
        if (s >= 48 && s <= 57) {
          return true
        }
        return false
      }
      e.exports = function (e) {
        var o = 0
        var a = e.length
        var u
        var c
        var l
        if (a === 0 || !likeNumber(e)) {
          return false
        }
        u = e.charCodeAt(o)
        if (u === r || u === t) {
          o++
        }
        while (o < a) {
          u = e.charCodeAt(o)
          if (u < 48 || u > 57) {
            break
          }
          o += 1
        }
        u = e.charCodeAt(o)
        c = e.charCodeAt(o + 1)
        if (u === n && c >= 48 && c <= 57) {
          o += 2
          while (o < a) {
            u = e.charCodeAt(o)
            if (u < 48 || u > 57) {
              break
            }
            o += 1
          }
        }
        u = e.charCodeAt(o)
        c = e.charCodeAt(o + 1)
        l = e.charCodeAt(o + 2)
        if (
          (u === s || u === i) &&
          ((c >= 48 && c <= 57) || ((c === r || c === t) && l >= 48 && l <= 57))
        ) {
          o += c === r || c === t ? 3 : 2
          while (o < a) {
            u = e.charCodeAt(o)
            if (u < 48 || u > 57) {
              break
            }
            o += 1
          }
        }
        return { number: e.slice(0, o), unit: e.slice(o) }
      }
    },
    961: (e) => {
      e.exports = function walk(e, t, r) {
        var n, s, i, o
        for (n = 0, s = e.length; n < s; n += 1) {
          i = e[n]
          if (!r) {
            o = t(i, n, e)
          }
          if (o !== false && i.type === 'function' && Array.isArray(i.nodes)) {
            walk(i.nodes, t, r)
          }
          if (r) {
            t(i, n, e)
          }
        }
      }
    },
    124: (e, t, r) => {
      e.exports = r(837).deprecate
    },
    837: (e) => {
      'use strict'
      e.exports = require('util')
    },
  }
  var t = {}
  function __nccwpck_require__(r) {
    var n = t[r]
    if (n !== undefined) {
      return n.exports
    }
    var s = (t[r] = { exports: {} })
    var i = true
    try {
      e[r](s, s.exports, __nccwpck_require__)
      i = false
    } finally {
      if (i) delete t[r]
    }
    return s.exports
  }
  if (typeof __nccwpck_require__ !== 'undefined')
    __nccwpck_require__.ab = __dirname + '/'
  var r = __nccwpck_require__(35)
  module.exports = r
})()
