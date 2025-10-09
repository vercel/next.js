module.exports = /******/ (function (modules) {
  // webpackBootstrap
  /******/ // The module cache
  /******/ var installedModules = {}
  /******/
  /******/ // object to store loaded chunks
  /******/ // "0" means "already loaded"
  /******/ var installedChunks = {
    /******/ 25: 0,
    /******/ 0: 0,
    /******/ 1: 0,
    /******/
  }
  /******/
  /******/ // The require function
  /******/ function __webpack_require__(moduleId) {
    /******/
    /******/ // Check if module is in cache
    /******/ if (installedModules[moduleId]) {
      /******/ return installedModules[moduleId].exports
      /******/
    }
    /******/ // Create a new module (and put it into the cache)
    /******/ var module = (installedModules[moduleId] = {
      /******/ i: moduleId,
      /******/ l: false,
      /******/ exports: {},
      /******/
    })
    /******/
    /******/ // Execute the module function
    /******/ var threw = true
    /******/ try {
      /******/ modules[moduleId].call(
        module.exports,
        module,
        module.exports,
        __webpack_require__
      )
      /******/ threw = false
      /******/
    } finally {
      /******/ if (threw) delete installedModules[moduleId]
      /******/
    }
    /******/
    /******/ // Flag the module as loaded
    /******/ module.l = true
    /******/
    /******/ // Return the exports of the module
    /******/ return module.exports
    /******/
  }
  /******/
  /******/
  /******/ // expose the modules object (__webpack_modules__)
  /******/ __webpack_require__.m = modules
  /******/
  /******/ // expose the module cache
  /******/ __webpack_require__.c = installedModules
  /******/
  /******/ // define getter function for harmony exports
  /******/ __webpack_require__.d = function (exports, name, getter) {
    /******/ if (!__webpack_require__.o(exports, name)) {
      /******/ Object.defineProperty(exports, name, {
        enumerable: true,
        get: getter,
      })
      /******/
    }
    /******/
  }
  /******/
  /******/ // define __esModule on exports
  /******/ __webpack_require__.r = function (exports) {
    /******/ if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
      /******/ Object.defineProperty(exports, Symbol.toStringTag, {
        value: 'Module',
      })
      /******/
    }
    /******/ Object.defineProperty(exports, '__esModule', { value: true })
    /******/
  }
  /******/
  /******/ // create a fake namespace object
  /******/ // mode & 1: value is a module id, require it
  /******/ // mode & 2: merge all properties of value into the ns
  /******/ // mode & 4: return value when already ns object
  /******/ // mode & 8|1: behave like require
  /******/ __webpack_require__.t = function (value, mode) {
    /******/ if (mode & 1) value = __webpack_require__(value)
    /******/ if (mode & 8) return value
    /******/ if (
      mode & 4 &&
      typeof value === 'object' &&
      value &&
      value.__esModule
    )
      return value
    /******/ var ns = Object.create(null)
    /******/ __webpack_require__.r(ns)
    /******/ Object.defineProperty(ns, 'default', {
      enumerable: true,
      value: value,
    })
    /******/ if (mode & 2 && typeof value != 'string')
      for (var key in value)
        __webpack_require__.d(
          ns,
          key,
          function (key) {
            return value[key]
          }.bind(null, key)
        )
    /******/ return ns
    /******/
  }
  /******/
  /******/ // getDefaultExport function for compatibility with non-harmony modules
  /******/ __webpack_require__.n = function (module) {
    /******/ var getter =
      module && module.__esModule
        ? /******/ function getDefault() {
            return module['default']
          }
        : /******/ function getModuleExports() {
            return module
          }
    /******/ __webpack_require__.d(getter, 'a', getter)
    /******/ return getter
    /******/
  }
  /******/
  /******/ // Object.prototype.hasOwnProperty.call
  /******/ __webpack_require__.o = function (object, property) {
    return Object.prototype.hasOwnProperty.call(object, property)
  }
  /******/
  /******/ // __webpack_public_path__
  /******/ __webpack_require__.p = ''
  /******/
  /******/ // uncaught error handler for webpack runtime
  /******/ __webpack_require__.oe = function (err) {
    /******/ process.nextTick(function () {
      /******/ throw err // catch this error by using import().catch()
      /******/
    })
    /******/
  }
  /******/
  /******/
  /******/ // Load entry module and return exports
  /******/ return __webpack_require__((__webpack_require__.s = 'I2pE'))
  /******/
})(
  /************************************************************************/
  /******/ {
    /***/ '+/F5': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/api-utils')

      /***/
    },

    /***/ '/CXo': /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'a',
        function () {
          return getJsonPreviewProps
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'b',
        function () {
          return readJsonFile
        }
      )
      /* harmony import */ var _readFile__WEBPACK_IMPORTED_MODULE_0__ =
        __webpack_require__('N8VE')
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ =
        __webpack_require__('oyvS')
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default =
        /*#__PURE__*/ __webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__)
      /* harmony import */ var next_tinacms_github__WEBPACK_IMPORTED_MODULE_2__ =
        __webpack_require__('jNMD')
      /* harmony import */ var next_tinacms_github__WEBPACK_IMPORTED_MODULE_2___default =
        /*#__PURE__*/ __webpack_require__.n(
          next_tinacms_github__WEBPACK_IMPORTED_MODULE_2__
        )
      function ownKeys(object, enumerableOnly) {
        var keys = Object.keys(object)
        if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(object)
          if (enumerableOnly)
            symbols = symbols.filter(function (sym) {
              return Object.getOwnPropertyDescriptor(object, sym).enumerable
            })
          keys.push.apply(keys, symbols)
        }
        return keys
      }

      function _objectSpread(target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i] != null ? arguments[i] : {}
          if (i % 2) {
            ownKeys(Object(source), true).forEach(function (key) {
              _defineProperty(target, key, source[key])
            })
          } else if (Object.getOwnPropertyDescriptors) {
            Object.defineProperties(
              target,
              Object.getOwnPropertyDescriptors(source)
            )
          } else {
            ownKeys(Object(source)).forEach(function (key) {
              Object.defineProperty(
                target,
                key,
                Object.getOwnPropertyDescriptor(source, key)
              )
            })
          }
        }
        return target
      }

      function _defineProperty(obj, key, value) {
        if (key in obj) {
          Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        } else {
          obj[key] = value
        }
        return obj
      }

      const getJsonPreviewProps = async (
        fileRelativePath,
        preview,
        previewData
      ) => {
        if (preview) {
          return Object(
            next_tinacms_github__WEBPACK_IMPORTED_MODULE_2__[
              'getGithubPreviewProps'
            ]
          )(
            _objectSpread(
              _objectSpread({}, previewData),
              {},
              {
                fileRelativePath: fileRelativePath,
                parse:
                  next_tinacms_github__WEBPACK_IMPORTED_MODULE_2__['parseJson'],
              }
            )
          )
        }

        const data = await readJsonFile(fileRelativePath)
        return {
          props: {
            error: null,
            preview: false,
            file: {
              fileRelativePath: fileRelativePath,
              data,
            },
          },
        }
      }
      const readJsonFile = async (filePath) => {
        const data = await Object(
          _readFile__WEBPACK_IMPORTED_MODULE_0__[/* readFile */ 'a']
        )(path__WEBPACK_IMPORTED_MODULE_1___default.a.resolve(`${filePath}`))
        return JSON.parse(data)
      }

      /***/
    },

    /***/ '/a9y': /***/ function (module, exports, __webpack_require__) {
      'use strict'

      var _interopRequireDefault = __webpack_require__('AroE')

      exports.__esModule = true
      exports.default = void 0

      var _react = _interopRequireDefault(__webpack_require__('cDcd'))

      var _head = _interopRequireDefault(__webpack_require__('UlpK'))

      const statusCodes = {
        400: 'Bad Request',
        404: 'This page could not be found',
        405: 'Method Not Allowed',
        500: 'Internal Server Error',
      }

      function _getInitialProps({ res, err }) {
        const statusCode =
          res && res.statusCode ? res.statusCode : err ? err.statusCode : 404
        return {
          statusCode,
        }
      }
      /**
       * `Error` component used for handling errors.
       */

      class Error extends _react.default.Component {
        render() {
          const { statusCode } = this.props
          const title =
            this.props.title ||
            statusCodes[statusCode] ||
            'An unexpected error has occurred'
          return /*#__PURE__*/ _react.default.createElement(
            'div',
            {
              style: styles.error,
            },
            /*#__PURE__*/ _react.default.createElement(
              _head.default,
              null,
              /*#__PURE__*/ _react.default.createElement(
                'title',
                null,
                statusCode,
                ': ',
                title
              )
            ),
            /*#__PURE__*/ _react.default.createElement(
              'div',
              null,
              /*#__PURE__*/ _react.default.createElement('style', {
                dangerouslySetInnerHTML: {
                  __html: 'body { margin: 0 }',
                },
              }),
              statusCode
                ? /*#__PURE__*/ _react.default.createElement(
                    'h1',
                    {
                      style: styles.h1,
                    },
                    statusCode
                  )
                : null,
              /*#__PURE__*/ _react.default.createElement(
                'div',
                {
                  style: styles.desc,
                },
                /*#__PURE__*/ _react.default.createElement(
                  'h2',
                  {
                    style: styles.h2,
                  },
                  title,
                  '.'
                )
              )
            )
          )
        }
      }

      exports.default = Error
      Error.displayName = 'ErrorPage'
      Error.getInitialProps = _getInitialProps
      Error.origGetInitialProps = _getInitialProps
      const styles = {
        error: {
          color: '#000',
          background: '#fff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, Roboto, "Segoe UI", "Fira Sans", Avenir, "Helvetica Neue", "Lucida Grande", sans-serif',
          height: '100vh',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        },
        desc: {
          display: 'inline-block',
          textAlign: 'left',
          lineHeight: '49px',
          height: '49px',
          verticalAlign: 'middle',
        },
        h1: {
          display: 'inline-block',
          borderRight: '1px solid rgba(0, 0, 0,.3)',
          margin: 0,
          marginRight: '20px',
          padding: '10px 23px 10px 0',
          fontSize: '24px',
          fontWeight: 500,
          verticalAlign: 'top',
        },
        h2: {
          fontSize: '14px',
          fontWeight: 'normal',
          lineHeight: 'inherit',
          margin: 0,
          padding: 0,
        },
      }

      /***/
    },

    /***/ '/y8f': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/router')

      /***/
    },

    /***/ '01KS': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/lib/path-match')

      /***/
    },

    /***/ '0mNJ': /***/ function (module, exports) {
      /* WEBPACK VAR INJECTION */ ;(function (__dirname) {
        module.exports = (function (r, e) {
          'use strict'
          var n = {}
          function __webpack_require__(e) {
            if (n[e]) {
              return n[e].exports
            }
            var t = (n[e] = { i: e, l: false, exports: {} })
            r[e].call(t.exports, t, t.exports, __webpack_require__)
            t.l = true
            return t.exports
          }
          __webpack_require__.ab = __dirname + '/'
          function startup() {
            return __webpack_require__(148)
          }
          return startup()
        })({
          148: function (r) {
            'use strict'
            var e = function (r) {
              var e = r.ignoreProcessEnv ? {} : process.env
              var n = function (t) {
                var s = t.match(/(.?\${?(?:[a-zA-Z0-9_]+)?}?)/g) || []
                return s.reduce(function (t, s) {
                  var a = /(.?)\${?([a-zA-Z0-9_]+)?}?/g.exec(s)
                  var u = a[1]
                  var _, o
                  if (u === '\\') {
                    o = a[0]
                    _ = o.replace('\\$', '$')
                  } else {
                    var i = a[2]
                    o = a[0].substring(u.length)
                    _ = e.hasOwnProperty(i) ? e[i] : r.parsed[i] || ''
                    _ = n(_)
                  }
                  return t.replace(o, _)
                }, t)
              }
              for (var t in r.parsed) {
                var s = e.hasOwnProperty(t) ? e[t] : r.parsed[t]
                r.parsed[t] = n(s)
              }
              for (var a in r.parsed) {
                e[a] = r.parsed[a]
              }
              return r
            }
            r.exports = e
          },
        })
        /* WEBPACK VAR INJECTION */
      }).call(this, '/')

      /***/
    },

    /***/ '10NG': /***/ function (module, exports, __webpack_require__) {
      /* WEBPACK VAR INJECTION */ ;(function (__dirname) {
        module.exports = (function (n, r) {
          'use strict'
          var t = {}
          function __webpack_require__(r) {
            if (t[r]) {
              return t[r].exports
            }
            var c = (t[r] = { i: r, l: false, exports: {} })
            n[r].call(c.exports, c, c.exports, __webpack_require__)
            c.l = true
            return c.exports
          }
          __webpack_require__.ab = __dirname + '/'
          function startup() {
            return __webpack_require__(548)
          }
          return startup()
        })({
          548: function (n, r, t) {
            const c = t(747)
            const s = t(622)
            function log(n) {
              console.log(`[dotenv][DEBUG] ${n}`)
            }
            const o = '\n'
            const f = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/
            const p = /\\n/g
            const e = /\n|\r|\r\n/
            function parse(n, r) {
              const t = Boolean(r && r.debug)
              const c = {}
              n.toString()
                .split(e)
                .forEach(function (n, r) {
                  const s = n.match(f)
                  if (s != null) {
                    const n = s[1]
                    let r = s[2] || ''
                    const t = r.length - 1
                    const f = r[0] === '"' && r[t] === '"'
                    const e = r[0] === "'" && r[t] === "'"
                    if (e || f) {
                      r = r.substring(1, t)
                      if (f) {
                        r = r.replace(p, o)
                      }
                    } else {
                      r = r.trim()
                    }
                    c[n] = r
                  } else if (t) {
                    log(
                      `did not match key and value when parsing line ${r + 1}: ${n}`
                    )
                  }
                })
              return c
            }
            function config(n) {
              let r = s.resolve(process.cwd(), '.env')
              let t = 'utf8'
              let o = false
              if (n) {
                if (n.path != null) {
                  r = n.path
                }
                if (n.encoding != null) {
                  t = n.encoding
                }
                if (n.debug != null) {
                  o = true
                }
              }
              try {
                const n = parse(c.readFileSync(r, { encoding: t }), {
                  debug: o,
                })
                Object.keys(n).forEach(function (r) {
                  if (!Object.prototype.hasOwnProperty.call(process.env, r)) {
                    process.env[r] = n[r]
                  } else if (o) {
                    log(
                      `"${r}" is already defined in \`process.env\` and will not be overwritten`
                    )
                  }
                })
                return { parsed: n }
              } catch (n) {
                return { error: n }
              }
            }
            n.exports.config = config
            n.exports.parse = parse
          },
          622: function (n) {
            n.exports = __webpack_require__('oyvS')
          },
          747: function (n) {
            n.exports = __webpack_require__('mw/K')
          },
        })
        /* WEBPACK VAR INJECTION */
      }).call(this, '/')

      /***/
    },

    /***/ '1yX1': /***/ function (module, exports, __webpack_require__) {
      'use strict'
      exports.__esModule = true
      exports.wait = wait
      exports.error = error
      exports.warn = warn
      exports.ready = ready
      exports.info = info
      exports.event = event
      var _chalk = _interopRequireDefault(__webpack_require__('49VC'))
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : { default: obj }
      }
      const prefixes = {
        wait: _chalk.default.cyan('wait') + '  -',
        error: _chalk.default.red('error') + ' -',
        warn: _chalk.default.yellow('warn') + '  -',
        ready: _chalk.default.green('ready') + ' -',
        info: _chalk.default.cyan('info') + '  -',
        event: _chalk.default.magenta('event') + ' -',
      }
      function wait(...message) {
        console.log(prefixes.wait, ...message)
      }
      function error(...message) {
        console.log(prefixes.error, ...message)
      }
      function warn(...message) {
        console.log(prefixes.warn, ...message)
      }
      function ready(...message) {
        console.log(prefixes.ready, ...message)
      }
      function info(...message) {
        console.log(prefixes.info, ...message)
      }
      function event(...message) {
        console.log(prefixes.event, ...message)
      }
      //# sourceMappingURL=log.js.map

      /***/
    },

    /***/ '2+G7': /***/ function (module, exports) {
      module.exports = require('styled-jsx/server')

      /***/
    },

    /***/ '49VC': /***/ function (module, exports, __webpack_require__) {
      /* WEBPACK VAR INJECTION */ ;(function (__dirname) {
        module.exports = (function (r, e) {
          'use strict'
          var n = {}
          function __webpack_require__(e) {
            if (n[e]) {
              return n[e].exports
            }
            var t = (n[e] = { i: e, l: false, exports: {} })
            r[e].call(t.exports, t, t.exports, __webpack_require__)
            t.l = true
            return t.exports
          }
          __webpack_require__.ab = __dirname + '/'
          function startup() {
            return __webpack_require__(313)
          }
          e(__webpack_require__)
          return startup()
        })(
          {
            83: function (r, e, n) {
              var t = n(161)
              var a = n(840)
              var o = {}
              var i = Object.keys(t)
              function wrapRaw(r) {
                var e = function (e) {
                  if (e === undefined || e === null) {
                    return e
                  }
                  if (arguments.length > 1) {
                    e = Array.prototype.slice.call(arguments)
                  }
                  return r(e)
                }
                if ('conversion' in r) {
                  e.conversion = r.conversion
                }
                return e
              }
              function wrapRounded(r) {
                var e = function (e) {
                  if (e === undefined || e === null) {
                    return e
                  }
                  if (arguments.length > 1) {
                    e = Array.prototype.slice.call(arguments)
                  }
                  var n = r(e)
                  if (typeof n === 'object') {
                    for (var t = n.length, a = 0; a < t; a++) {
                      n[a] = Math.round(n[a])
                    }
                  }
                  return n
                }
                if ('conversion' in r) {
                  e.conversion = r.conversion
                }
                return e
              }
              i.forEach(function (r) {
                o[r] = {}
                Object.defineProperty(o[r], 'channels', {
                  value: t[r].channels,
                })
                Object.defineProperty(o[r], 'labels', { value: t[r].labels })
                var e = a(r)
                var n = Object.keys(e)
                n.forEach(function (n) {
                  var t = e[n]
                  o[r][n] = wrapRounded(t)
                  o[r][n].raw = wrapRaw(t)
                })
              })
              r.exports = o
            },
            87: function (r) {
              r.exports = __webpack_require__('jle/')
            },
            149: function (r) {
              r.exports = __webpack_require__('V8Zh')
            },
            161: function (r, e, n) {
              var t = n(694)
              var a = {}
              for (var o in t) {
                if (t.hasOwnProperty(o)) {
                  a[t[o]] = o
                }
              }
              var i = (r.exports = {
                rgb: { channels: 3, labels: 'rgb' },
                hsl: { channels: 3, labels: 'hsl' },
                hsv: { channels: 3, labels: 'hsv' },
                hwb: { channels: 3, labels: 'hwb' },
                cmyk: { channels: 4, labels: 'cmyk' },
                xyz: { channels: 3, labels: 'xyz' },
                lab: { channels: 3, labels: 'lab' },
                lch: { channels: 3, labels: 'lch' },
                hex: { channels: 1, labels: ['hex'] },
                keyword: { channels: 1, labels: ['keyword'] },
                ansi16: { channels: 1, labels: ['ansi16'] },
                ansi256: { channels: 1, labels: ['ansi256'] },
                hcg: { channels: 3, labels: ['h', 'c', 'g'] },
                apple: { channels: 3, labels: ['r16', 'g16', 'b16'] },
                gray: { channels: 1, labels: ['gray'] },
              })
              for (var l in i) {
                if (i.hasOwnProperty(l)) {
                  if (!('channels' in i[l])) {
                    throw new Error('missing channels property: ' + l)
                  }
                  if (!('labels' in i[l])) {
                    throw new Error('missing channel labels property: ' + l)
                  }
                  if (i[l].labels.length !== i[l].channels) {
                    throw new Error('channel and label counts mismatch: ' + l)
                  }
                  var s = i[l].channels
                  var c = i[l].labels
                  delete i[l].channels
                  delete i[l].labels
                  Object.defineProperty(i[l], 'channels', { value: s })
                  Object.defineProperty(i[l], 'labels', { value: c })
                }
              }
              i.rgb.hsl = function (r) {
                var e = r[0] / 255
                var n = r[1] / 255
                var t = r[2] / 255
                var a = Math.min(e, n, t)
                var o = Math.max(e, n, t)
                var i = o - a
                var l
                var s
                var c
                if (o === a) {
                  l = 0
                } else if (e === o) {
                  l = (n - t) / i
                } else if (n === o) {
                  l = 2 + (t - e) / i
                } else if (t === o) {
                  l = 4 + (e - n) / i
                }
                l = Math.min(l * 60, 360)
                if (l < 0) {
                  l += 360
                }
                c = (a + o) / 2
                if (o === a) {
                  s = 0
                } else if (c <= 0.5) {
                  s = i / (o + a)
                } else {
                  s = i / (2 - o - a)
                }
                return [l, s * 100, c * 100]
              }
              i.rgb.hsv = function (r) {
                var e
                var n
                var t
                var a
                var o
                var i = r[0] / 255
                var l = r[1] / 255
                var s = r[2] / 255
                var c = Math.max(i, l, s)
                var u = c - Math.min(i, l, s)
                var v = function (r) {
                  return (c - r) / 6 / u + 1 / 2
                }
                if (u === 0) {
                  a = o = 0
                } else {
                  o = u / c
                  e = v(i)
                  n = v(l)
                  t = v(s)
                  if (i === c) {
                    a = t - n
                  } else if (l === c) {
                    a = 1 / 3 + e - t
                  } else if (s === c) {
                    a = 2 / 3 + n - e
                  }
                  if (a < 0) {
                    a += 1
                  } else if (a > 1) {
                    a -= 1
                  }
                }
                return [a * 360, o * 100, c * 100]
              }
              i.rgb.hwb = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                var a = i.rgb.hsl(r)[0]
                var o = (1 / 255) * Math.min(e, Math.min(n, t))
                t = 1 - (1 / 255) * Math.max(e, Math.max(n, t))
                return [a, o * 100, t * 100]
              }
              i.rgb.cmyk = function (r) {
                var e = r[0] / 255
                var n = r[1] / 255
                var t = r[2] / 255
                var a
                var o
                var i
                var l
                l = Math.min(1 - e, 1 - n, 1 - t)
                a = (1 - e - l) / (1 - l) || 0
                o = (1 - n - l) / (1 - l) || 0
                i = (1 - t - l) / (1 - l) || 0
                return [a * 100, o * 100, i * 100, l * 100]
              }
              function comparativeDistance(r, e) {
                return (
                  Math.pow(r[0] - e[0], 2) +
                  Math.pow(r[1] - e[1], 2) +
                  Math.pow(r[2] - e[2], 2)
                )
              }
              i.rgb.keyword = function (r) {
                var e = a[r]
                if (e) {
                  return e
                }
                var n = Infinity
                var o
                for (var i in t) {
                  if (t.hasOwnProperty(i)) {
                    var l = t[i]
                    var s = comparativeDistance(r, l)
                    if (s < n) {
                      n = s
                      o = i
                    }
                  }
                }
                return o
              }
              i.keyword.rgb = function (r) {
                return t[r]
              }
              i.rgb.xyz = function (r) {
                var e = r[0] / 255
                var n = r[1] / 255
                var t = r[2] / 255
                e = e > 0.04045 ? Math.pow((e + 0.055) / 1.055, 2.4) : e / 12.92
                n = n > 0.04045 ? Math.pow((n + 0.055) / 1.055, 2.4) : n / 12.92
                t = t > 0.04045 ? Math.pow((t + 0.055) / 1.055, 2.4) : t / 12.92
                var a = e * 0.4124 + n * 0.3576 + t * 0.1805
                var o = e * 0.2126 + n * 0.7152 + t * 0.0722
                var i = e * 0.0193 + n * 0.1192 + t * 0.9505
                return [a * 100, o * 100, i * 100]
              }
              i.rgb.lab = function (r) {
                var e = i.rgb.xyz(r)
                var n = e[0]
                var t = e[1]
                var a = e[2]
                var o
                var l
                var s
                n /= 95.047
                t /= 100
                a /= 108.883
                n = n > 0.008856 ? Math.pow(n, 1 / 3) : 7.787 * n + 16 / 116
                t = t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116
                a = a > 0.008856 ? Math.pow(a, 1 / 3) : 7.787 * a + 16 / 116
                o = 116 * t - 16
                l = 500 * (n - t)
                s = 200 * (t - a)
                return [o, l, s]
              }
              i.hsl.rgb = function (r) {
                var e = r[0] / 360
                var n = r[1] / 100
                var t = r[2] / 100
                var a
                var o
                var i
                var l
                var s
                if (n === 0) {
                  s = t * 255
                  return [s, s, s]
                }
                if (t < 0.5) {
                  o = t * (1 + n)
                } else {
                  o = t + n - t * n
                }
                a = 2 * t - o
                l = [0, 0, 0]
                for (var c = 0; c < 3; c++) {
                  i = e + (1 / 3) * -(c - 1)
                  if (i < 0) {
                    i++
                  }
                  if (i > 1) {
                    i--
                  }
                  if (6 * i < 1) {
                    s = a + (o - a) * 6 * i
                  } else if (2 * i < 1) {
                    s = o
                  } else if (3 * i < 2) {
                    s = a + (o - a) * (2 / 3 - i) * 6
                  } else {
                    s = a
                  }
                  l[c] = s * 255
                }
                return l
              }
              i.hsl.hsv = function (r) {
                var e = r[0]
                var n = r[1] / 100
                var t = r[2] / 100
                var a = n
                var o = Math.max(t, 0.01)
                var i
                var l
                t *= 2
                n *= t <= 1 ? t : 2 - t
                a *= o <= 1 ? o : 2 - o
                l = (t + n) / 2
                i = t === 0 ? (2 * a) / (o + a) : (2 * n) / (t + n)
                return [e, i * 100, l * 100]
              }
              i.hsv.rgb = function (r) {
                var e = r[0] / 60
                var n = r[1] / 100
                var t = r[2] / 100
                var a = Math.floor(e) % 6
                var o = e - Math.floor(e)
                var i = 255 * t * (1 - n)
                var l = 255 * t * (1 - n * o)
                var s = 255 * t * (1 - n * (1 - o))
                t *= 255
                switch (a) {
                  case 0:
                    return [t, s, i]
                  case 1:
                    return [l, t, i]
                  case 2:
                    return [i, t, s]
                  case 3:
                    return [i, l, t]
                  case 4:
                    return [s, i, t]
                  case 5:
                    return [t, i, l]
                }
              }
              i.hsv.hsl = function (r) {
                var e = r[0]
                var n = r[1] / 100
                var t = r[2] / 100
                var a = Math.max(t, 0.01)
                var o
                var i
                var l
                l = (2 - n) * t
                o = (2 - n) * a
                i = n * a
                i /= o <= 1 ? o : 2 - o
                i = i || 0
                l /= 2
                return [e, i * 100, l * 100]
              }
              i.hwb.rgb = function (r) {
                var e = r[0] / 360
                var n = r[1] / 100
                var t = r[2] / 100
                var a = n + t
                var o
                var i
                var l
                var s
                if (a > 1) {
                  n /= a
                  t /= a
                }
                o = Math.floor(6 * e)
                i = 1 - t
                l = 6 * e - o
                if ((o & 1) !== 0) {
                  l = 1 - l
                }
                s = n + l * (i - n)
                var c
                var u
                var v
                switch (o) {
                  default:
                  case 6:
                  case 0:
                    c = i
                    u = s
                    v = n
                    break
                  case 1:
                    c = s
                    u = i
                    v = n
                    break
                  case 2:
                    c = n
                    u = i
                    v = s
                    break
                  case 3:
                    c = n
                    u = s
                    v = i
                    break
                  case 4:
                    c = s
                    u = n
                    v = i
                    break
                  case 5:
                    c = i
                    u = n
                    v = s
                    break
                }
                return [c * 255, u * 255, v * 255]
              }
              i.cmyk.rgb = function (r) {
                var e = r[0] / 100
                var n = r[1] / 100
                var t = r[2] / 100
                var a = r[3] / 100
                var o
                var i
                var l
                o = 1 - Math.min(1, e * (1 - a) + a)
                i = 1 - Math.min(1, n * (1 - a) + a)
                l = 1 - Math.min(1, t * (1 - a) + a)
                return [o * 255, i * 255, l * 255]
              }
              i.xyz.rgb = function (r) {
                var e = r[0] / 100
                var n = r[1] / 100
                var t = r[2] / 100
                var a
                var o
                var i
                a = e * 3.2406 + n * -1.5372 + t * -0.4986
                o = e * -0.9689 + n * 1.8758 + t * 0.0415
                i = e * 0.0557 + n * -0.204 + t * 1.057
                a =
                  a > 0.0031308
                    ? 1.055 * Math.pow(a, 1 / 2.4) - 0.055
                    : a * 12.92
                o =
                  o > 0.0031308
                    ? 1.055 * Math.pow(o, 1 / 2.4) - 0.055
                    : o * 12.92
                i =
                  i > 0.0031308
                    ? 1.055 * Math.pow(i, 1 / 2.4) - 0.055
                    : i * 12.92
                a = Math.min(Math.max(0, a), 1)
                o = Math.min(Math.max(0, o), 1)
                i = Math.min(Math.max(0, i), 1)
                return [a * 255, o * 255, i * 255]
              }
              i.xyz.lab = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                var a
                var o
                var i
                e /= 95.047
                n /= 100
                t /= 108.883
                e = e > 0.008856 ? Math.pow(e, 1 / 3) : 7.787 * e + 16 / 116
                n = n > 0.008856 ? Math.pow(n, 1 / 3) : 7.787 * n + 16 / 116
                t = t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116
                a = 116 * n - 16
                o = 500 * (e - n)
                i = 200 * (n - t)
                return [a, o, i]
              }
              i.lab.xyz = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                var a
                var o
                var i
                o = (e + 16) / 116
                a = n / 500 + o
                i = o - t / 200
                var l = Math.pow(o, 3)
                var s = Math.pow(a, 3)
                var c = Math.pow(i, 3)
                o = l > 0.008856 ? l : (o - 16 / 116) / 7.787
                a = s > 0.008856 ? s : (a - 16 / 116) / 7.787
                i = c > 0.008856 ? c : (i - 16 / 116) / 7.787
                a *= 95.047
                o *= 100
                i *= 108.883
                return [a, o, i]
              }
              i.lab.lch = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                var a
                var o
                var i
                a = Math.atan2(t, n)
                o = (a * 360) / 2 / Math.PI
                if (o < 0) {
                  o += 360
                }
                i = Math.sqrt(n * n + t * t)
                return [e, i, o]
              }
              i.lch.lab = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                var a
                var o
                var i
                i = (t / 360) * 2 * Math.PI
                a = n * Math.cos(i)
                o = n * Math.sin(i)
                return [e, a, o]
              }
              i.rgb.ansi16 = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                var a = 1 in arguments ? arguments[1] : i.rgb.hsv(r)[2]
                a = Math.round(a / 50)
                if (a === 0) {
                  return 30
                }
                var o =
                  30 +
                  ((Math.round(t / 255) << 2) |
                    (Math.round(n / 255) << 1) |
                    Math.round(e / 255))
                if (a === 2) {
                  o += 60
                }
                return o
              }
              i.hsv.ansi16 = function (r) {
                return i.rgb.ansi16(i.hsv.rgb(r), r[2])
              }
              i.rgb.ansi256 = function (r) {
                var e = r[0]
                var n = r[1]
                var t = r[2]
                if (e === n && n === t) {
                  if (e < 8) {
                    return 16
                  }
                  if (e > 248) {
                    return 231
                  }
                  return Math.round(((e - 8) / 247) * 24) + 232
                }
                var a =
                  16 +
                  36 * Math.round((e / 255) * 5) +
                  6 * Math.round((n / 255) * 5) +
                  Math.round((t / 255) * 5)
                return a
              }
              i.ansi16.rgb = function (r) {
                var e = r % 10
                if (e === 0 || e === 7) {
                  if (r > 50) {
                    e += 3.5
                  }
                  e = (e / 10.5) * 255
                  return [e, e, e]
                }
                var n = (~~(r > 50) + 1) * 0.5
                var t = (e & 1) * n * 255
                var a = ((e >> 1) & 1) * n * 255
                var o = ((e >> 2) & 1) * n * 255
                return [t, a, o]
              }
              i.ansi256.rgb = function (r) {
                if (r >= 232) {
                  var e = (r - 232) * 10 + 8
                  return [e, e, e]
                }
                r -= 16
                var n
                var t = (Math.floor(r / 36) / 5) * 255
                var a = (Math.floor((n = r % 36) / 6) / 5) * 255
                var o = ((n % 6) / 5) * 255
                return [t, a, o]
              }
              i.rgb.hex = function (r) {
                var e =
                  ((Math.round(r[0]) & 255) << 16) +
                  ((Math.round(r[1]) & 255) << 8) +
                  (Math.round(r[2]) & 255)
                var n = e.toString(16).toUpperCase()
                return '000000'.substring(n.length) + n
              }
              i.hex.rgb = function (r) {
                var e = r.toString(16).match(/[a-f0-9]{6}|[a-f0-9]{3}/i)
                if (!e) {
                  return [0, 0, 0]
                }
                var n = e[0]
                if (e[0].length === 3) {
                  n = n
                    .split('')
                    .map(function (r) {
                      return r + r
                    })
                    .join('')
                }
                var t = parseInt(n, 16)
                var a = (t >> 16) & 255
                var o = (t >> 8) & 255
                var i = t & 255
                return [a, o, i]
              }
              i.rgb.hcg = function (r) {
                var e = r[0] / 255
                var n = r[1] / 255
                var t = r[2] / 255
                var a = Math.max(Math.max(e, n), t)
                var o = Math.min(Math.min(e, n), t)
                var i = a - o
                var l
                var s
                if (i < 1) {
                  l = o / (1 - i)
                } else {
                  l = 0
                }
                if (i <= 0) {
                  s = 0
                } else if (a === e) {
                  s = ((n - t) / i) % 6
                } else if (a === n) {
                  s = 2 + (t - e) / i
                } else {
                  s = 4 + (e - n) / i + 4
                }
                s /= 6
                s %= 1
                return [s * 360, i * 100, l * 100]
              }
              i.hsl.hcg = function (r) {
                var e = r[1] / 100
                var n = r[2] / 100
                var t = 1
                var a = 0
                if (n < 0.5) {
                  t = 2 * e * n
                } else {
                  t = 2 * e * (1 - n)
                }
                if (t < 1) {
                  a = (n - 0.5 * t) / (1 - t)
                }
                return [r[0], t * 100, a * 100]
              }
              i.hsv.hcg = function (r) {
                var e = r[1] / 100
                var n = r[2] / 100
                var t = e * n
                var a = 0
                if (t < 1) {
                  a = (n - t) / (1 - t)
                }
                return [r[0], t * 100, a * 100]
              }
              i.hcg.rgb = function (r) {
                var e = r[0] / 360
                var n = r[1] / 100
                var t = r[2] / 100
                if (n === 0) {
                  return [t * 255, t * 255, t * 255]
                }
                var a = [0, 0, 0]
                var o = (e % 1) * 6
                var i = o % 1
                var l = 1 - i
                var s = 0
                switch (Math.floor(o)) {
                  case 0:
                    a[0] = 1
                    a[1] = i
                    a[2] = 0
                    break
                  case 1:
                    a[0] = l
                    a[1] = 1
                    a[2] = 0
                    break
                  case 2:
                    a[0] = 0
                    a[1] = 1
                    a[2] = i
                    break
                  case 3:
                    a[0] = 0
                    a[1] = l
                    a[2] = 1
                    break
                  case 4:
                    a[0] = i
                    a[1] = 0
                    a[2] = 1
                    break
                  default:
                    a[0] = 1
                    a[1] = 0
                    a[2] = l
                }
                s = (1 - n) * t
                return [
                  (n * a[0] + s) * 255,
                  (n * a[1] + s) * 255,
                  (n * a[2] + s) * 255,
                ]
              }
              i.hcg.hsv = function (r) {
                var e = r[1] / 100
                var n = r[2] / 100
                var t = e + n * (1 - e)
                var a = 0
                if (t > 0) {
                  a = e / t
                }
                return [r[0], a * 100, t * 100]
              }
              i.hcg.hsl = function (r) {
                var e = r[1] / 100
                var n = r[2] / 100
                var t = n * (1 - e) + 0.5 * e
                var a = 0
                if (t > 0 && t < 0.5) {
                  a = e / (2 * t)
                } else if (t >= 0.5 && t < 1) {
                  a = e / (2 * (1 - t))
                }
                return [r[0], a * 100, t * 100]
              }
              i.hcg.hwb = function (r) {
                var e = r[1] / 100
                var n = r[2] / 100
                var t = e + n * (1 - e)
                return [r[0], (t - e) * 100, (1 - t) * 100]
              }
              i.hwb.hcg = function (r) {
                var e = r[1] / 100
                var n = r[2] / 100
                var t = 1 - n
                var a = t - e
                var o = 0
                if (a < 1) {
                  o = (t - a) / (1 - a)
                }
                return [r[0], a * 100, o * 100]
              }
              i.apple.rgb = function (r) {
                return [
                  (r[0] / 65535) * 255,
                  (r[1] / 65535) * 255,
                  (r[2] / 65535) * 255,
                ]
              }
              i.rgb.apple = function (r) {
                return [
                  (r[0] / 255) * 65535,
                  (r[1] / 255) * 65535,
                  (r[2] / 255) * 65535,
                ]
              }
              i.gray.rgb = function (r) {
                return [
                  (r[0] / 100) * 255,
                  (r[0] / 100) * 255,
                  (r[0] / 100) * 255,
                ]
              }
              i.gray.hsl = i.gray.hsv = function (r) {
                return [0, 0, r[0]]
              }
              i.gray.hwb = function (r) {
                return [0, 100, r[0]]
              }
              i.gray.cmyk = function (r) {
                return [0, 0, 0, r[0]]
              }
              i.gray.lab = function (r) {
                return [r[0], 0, 0]
              }
              i.gray.hex = function (r) {
                var e = Math.round((r[0] / 100) * 255) & 255
                var n = (e << 16) + (e << 8) + e
                var t = n.toString(16).toUpperCase()
                return '000000'.substring(t.length) + t
              }
              i.rgb.gray = function (r) {
                var e = (r[0] + r[1] + r[2]) / 3
                return [(e / 255) * 100]
              }
            },
            285: function (r, e, n) {
              'use strict'
              r = n.nmd(r)
              const t = n(83)
              const a = (r, e) =>
                function () {
                  const n = r.apply(t, arguments)
                  return `[${n + e}m`
                }
              const o = (r, e) =>
                function () {
                  const n = r.apply(t, arguments)
                  return `[${38 + e};5;${n}m`
                }
              const i = (r, e) =>
                function () {
                  const n = r.apply(t, arguments)
                  return `[${38 + e};2;${n[0]};${n[1]};${n[2]}m`
                }
              function assembleStyles() {
                const r = new Map()
                const e = {
                  modifier: {
                    reset: [0, 0],
                    bold: [1, 22],
                    dim: [2, 22],
                    italic: [3, 23],
                    underline: [4, 24],
                    inverse: [7, 27],
                    hidden: [8, 28],
                    strikethrough: [9, 29],
                  },
                  color: {
                    black: [30, 39],
                    red: [31, 39],
                    green: [32, 39],
                    yellow: [33, 39],
                    blue: [34, 39],
                    magenta: [35, 39],
                    cyan: [36, 39],
                    white: [37, 39],
                    gray: [90, 39],
                    redBright: [91, 39],
                    greenBright: [92, 39],
                    yellowBright: [93, 39],
                    blueBright: [94, 39],
                    magentaBright: [95, 39],
                    cyanBright: [96, 39],
                    whiteBright: [97, 39],
                  },
                  bgColor: {
                    bgBlack: [40, 49],
                    bgRed: [41, 49],
                    bgGreen: [42, 49],
                    bgYellow: [43, 49],
                    bgBlue: [44, 49],
                    bgMagenta: [45, 49],
                    bgCyan: [46, 49],
                    bgWhite: [47, 49],
                    bgBlackBright: [100, 49],
                    bgRedBright: [101, 49],
                    bgGreenBright: [102, 49],
                    bgYellowBright: [103, 49],
                    bgBlueBright: [104, 49],
                    bgMagentaBright: [105, 49],
                    bgCyanBright: [106, 49],
                    bgWhiteBright: [107, 49],
                  },
                }
                e.color.grey = e.color.gray
                for (const n of Object.keys(e)) {
                  const t = e[n]
                  for (const n of Object.keys(t)) {
                    const a = t[n]
                    e[n] = { open: `[${a[0]}m`, close: `[${a[1]}m` }
                    t[n] = e[n]
                    r.set(a[0], a[1])
                  }
                  Object.defineProperty(e, n, { value: t, enumerable: false })
                  Object.defineProperty(e, 'codes', {
                    value: r,
                    enumerable: false,
                  })
                }
                const n = (r) => r
                const l = (r, e, n) => [r, e, n]
                e.color.close = '[39m'
                e.bgColor.close = '[49m'
                e.color.ansi = { ansi: a(n, 0) }
                e.color.ansi256 = { ansi256: o(n, 0) }
                e.color.ansi16m = { rgb: i(l, 0) }
                e.bgColor.ansi = { ansi: a(n, 10) }
                e.bgColor.ansi256 = { ansi256: o(n, 10) }
                e.bgColor.ansi16m = { rgb: i(l, 10) }
                for (let r of Object.keys(t)) {
                  if (typeof t[r] !== 'object') {
                    continue
                  }
                  const n = t[r]
                  if (r === 'ansi16') {
                    r = 'ansi'
                  }
                  if ('ansi16' in n) {
                    e.color.ansi[r] = a(n.ansi16, 0)
                    e.bgColor.ansi[r] = a(n.ansi16, 10)
                  }
                  if ('ansi256' in n) {
                    e.color.ansi256[r] = o(n.ansi256, 0)
                    e.bgColor.ansi256[r] = o(n.ansi256, 10)
                  }
                  if ('rgb' in n) {
                    e.color.ansi16m[r] = i(n.rgb, 0)
                    e.bgColor.ansi16m[r] = i(n.rgb, 10)
                  }
                }
                return e
              }
              Object.defineProperty(r, 'exports', {
                enumerable: true,
                get: assembleStyles,
              })
            },
            313: function (r, e, n) {
              'use strict'
              const t = n(149)
              const a = n(285)
              const o = n(933).stdout
              const i = n(341)
              const l =
                process.platform === 'win32' &&
                !(process.env.TERM || '').toLowerCase().startsWith('xterm')
              const s = ['ansi', 'ansi', 'ansi256', 'ansi16m']
              const c = new Set(['gray'])
              const u = Object.create(null)
              function applyOptions(r, e) {
                e = e || {}
                const n = o ? o.level : 0
                r.level = e.level === undefined ? n : e.level
                r.enabled = 'enabled' in e ? e.enabled : r.level > 0
              }
              function Chalk(r) {
                if (!this || !(this instanceof Chalk) || this.template) {
                  const e = {}
                  applyOptions(e, r)
                  e.template = function () {
                    const r = [].slice.call(arguments)
                    return chalkTag.apply(null, [e.template].concat(r))
                  }
                  Object.setPrototypeOf(e, Chalk.prototype)
                  Object.setPrototypeOf(e.template, e)
                  e.template.constructor = Chalk
                  return e.template
                }
                applyOptions(this, r)
              }
              if (l) {
                a.blue.open = '[94m'
              }
              for (const r of Object.keys(a)) {
                a[r].closeRe = new RegExp(t(a[r].close), 'g')
                u[r] = {
                  get() {
                    const e = a[r]
                    return build.call(
                      this,
                      this._styles ? this._styles.concat(e) : [e],
                      this._empty,
                      r
                    )
                  },
                }
              }
              u.visible = {
                get() {
                  return build.call(this, this._styles || [], true, 'visible')
                },
              }
              a.color.closeRe = new RegExp(t(a.color.close), 'g')
              for (const r of Object.keys(a.color.ansi)) {
                if (c.has(r)) {
                  continue
                }
                u[r] = {
                  get() {
                    const e = this.level
                    return function () {
                      const n = a.color[s[e]][r].apply(null, arguments)
                      const t = {
                        open: n,
                        close: a.color.close,
                        closeRe: a.color.closeRe,
                      }
                      return build.call(
                        this,
                        this._styles ? this._styles.concat(t) : [t],
                        this._empty,
                        r
                      )
                    }
                  },
                }
              }
              a.bgColor.closeRe = new RegExp(t(a.bgColor.close), 'g')
              for (const r of Object.keys(a.bgColor.ansi)) {
                if (c.has(r)) {
                  continue
                }
                const e = 'bg' + r[0].toUpperCase() + r.slice(1)
                u[e] = {
                  get() {
                    const e = this.level
                    return function () {
                      const n = a.bgColor[s[e]][r].apply(null, arguments)
                      const t = {
                        open: n,
                        close: a.bgColor.close,
                        closeRe: a.bgColor.closeRe,
                      }
                      return build.call(
                        this,
                        this._styles ? this._styles.concat(t) : [t],
                        this._empty,
                        r
                      )
                    }
                  },
                }
              }
              const v = Object.defineProperties(() => {}, u)
              function build(r, e, n) {
                const t = function () {
                  return applyStyle.apply(t, arguments)
                }
                t._styles = r
                t._empty = e
                const a = this
                Object.defineProperty(t, 'level', {
                  enumerable: true,
                  get() {
                    return a.level
                  },
                  set(r) {
                    a.level = r
                  },
                })
                Object.defineProperty(t, 'enabled', {
                  enumerable: true,
                  get() {
                    return a.enabled
                  },
                  set(r) {
                    a.enabled = r
                  },
                })
                t.hasGrey = this.hasGrey || n === 'gray' || n === 'grey'
                t.__proto__ = v
                return t
              }
              function applyStyle() {
                const r = arguments
                const e = r.length
                let n = String(arguments[0])
                if (e === 0) {
                  return ''
                }
                if (e > 1) {
                  for (let t = 1; t < e; t++) {
                    n += ' ' + r[t]
                  }
                }
                if (!this.enabled || this.level <= 0 || !n) {
                  return this._empty ? '' : n
                }
                const t = a.dim.open
                if (l && this.hasGrey) {
                  a.dim.open = ''
                }
                for (const r of this._styles.slice().reverse()) {
                  n = r.open + n.replace(r.closeRe, r.open) + r.close
                  n = n.replace(/\r?\n/g, `${r.close}$&${r.open}`)
                }
                a.dim.open = t
                return n
              }
              function chalkTag(r, e) {
                if (!Array.isArray(e)) {
                  return [].slice.call(arguments, 1).join(' ')
                }
                const n = [].slice.call(arguments, 2)
                const t = [e.raw[0]]
                for (let r = 1; r < e.length; r++) {
                  t.push(String(n[r - 1]).replace(/[{}\\]/g, '\\$&'))
                  t.push(String(e.raw[r]))
                }
                return i(r, t.join(''))
              }
              Object.defineProperties(Chalk.prototype, u)
              r.exports = Chalk()
              r.exports.supportsColor = o
              r.exports.default = r.exports
            },
            341: function (r) {
              'use strict'
              const e =
                /(?:\\(u[a-f\d]{4}|x[a-f\d]{2}|.))|(?:\{(~)?(\w+(?:\([^)]*\))?(?:\.\w+(?:\([^)]*\))?)*)(?:[ \t]|(?=\r?\n)))|(\})|((?:.|[\r\n\f])+?)/gi
              const n = /(?:^|\.)(\w+)(?:\(([^)]*)\))?/g
              const t = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/
              const a = /\\(u[a-f\d]{4}|x[a-f\d]{2}|.)|([^\\])/gi
              const o = new Map([
                ['n', '\n'],
                ['r', '\r'],
                ['t', '\t'],
                ['b', '\b'],
                ['f', '\f'],
                ['v', '\v'],
                ['0', '\0'],
                ['\\', '\\'],
                ['e', ''],
                ['a', ''],
              ])
              function unescape(r) {
                if (
                  (r[0] === 'u' && r.length === 5) ||
                  (r[0] === 'x' && r.length === 3)
                ) {
                  return String.fromCharCode(parseInt(r.slice(1), 16))
                }
                return o.get(r) || r
              }
              function parseArguments(r, e) {
                const n = []
                const o = e.trim().split(/\s*,\s*/g)
                let i
                for (const e of o) {
                  if (!isNaN(e)) {
                    n.push(Number(e))
                  } else if ((i = e.match(t))) {
                    n.push(i[2].replace(a, (r, e, n) => (e ? unescape(e) : n)))
                  } else {
                    throw new Error(
                      `Invalid Chalk template style argument: ${e} (in style '${r}')`
                    )
                  }
                }
                return n
              }
              function parseStyle(r) {
                n.lastIndex = 0
                const e = []
                let t
                while ((t = n.exec(r)) !== null) {
                  const r = t[1]
                  if (t[2]) {
                    const n = parseArguments(r, t[2])
                    e.push([r].concat(n))
                  } else {
                    e.push([r])
                  }
                }
                return e
              }
              function buildStyle(r, e) {
                const n = {}
                for (const r of e) {
                  for (const e of r.styles) {
                    n[e[0]] = r.inverse ? null : e.slice(1)
                  }
                }
                let t = r
                for (const r of Object.keys(n)) {
                  if (Array.isArray(n[r])) {
                    if (!(r in t)) {
                      throw new Error(`Unknown Chalk style: ${r}`)
                    }
                    if (n[r].length > 0) {
                      t = t[r].apply(t, n[r])
                    } else {
                      t = t[r]
                    }
                  }
                }
                return t
              }
              r.exports = (r, n) => {
                const t = []
                const a = []
                let o = []
                n.replace(e, (e, n, i, l, s, c) => {
                  if (n) {
                    o.push(unescape(n))
                  } else if (l) {
                    const e = o.join('')
                    o = []
                    a.push(t.length === 0 ? e : buildStyle(r, t)(e))
                    t.push({ inverse: i, styles: parseStyle(l) })
                  } else if (s) {
                    if (t.length === 0) {
                      throw new Error(
                        'Found extraneous } in Chalk template literal'
                      )
                    }
                    a.push(buildStyle(r, t)(o.join('')))
                    o = []
                    t.pop()
                  } else {
                    o.push(c)
                  }
                })
                a.push(o.join(''))
                if (t.length > 0) {
                  const r = `Chalk template literal is missing ${t.length} closing bracket${t.length === 1 ? '' : 's'} (\`}\`)`
                  throw new Error(r)
                }
                return a.join('')
              }
            },
            694: function (r) {
              'use strict'
              r.exports = {
                aliceblue: [240, 248, 255],
                antiquewhite: [250, 235, 215],
                aqua: [0, 255, 255],
                aquamarine: [127, 255, 212],
                azure: [240, 255, 255],
                beige: [245, 245, 220],
                bisque: [255, 228, 196],
                black: [0, 0, 0],
                blanchedalmond: [255, 235, 205],
                blue: [0, 0, 255],
                blueviolet: [138, 43, 226],
                brown: [165, 42, 42],
                burlywood: [222, 184, 135],
                cadetblue: [95, 158, 160],
                chartreuse: [127, 255, 0],
                chocolate: [210, 105, 30],
                coral: [255, 127, 80],
                cornflowerblue: [100, 149, 237],
                cornsilk: [255, 248, 220],
                crimson: [220, 20, 60],
                cyan: [0, 255, 255],
                darkblue: [0, 0, 139],
                darkcyan: [0, 139, 139],
                darkgoldenrod: [184, 134, 11],
                darkgray: [169, 169, 169],
                darkgreen: [0, 100, 0],
                darkgrey: [169, 169, 169],
                darkkhaki: [189, 183, 107],
                darkmagenta: [139, 0, 139],
                darkolivegreen: [85, 107, 47],
                darkorange: [255, 140, 0],
                darkorchid: [153, 50, 204],
                darkred: [139, 0, 0],
                darksalmon: [233, 150, 122],
                darkseagreen: [143, 188, 143],
                darkslateblue: [72, 61, 139],
                darkslategray: [47, 79, 79],
                darkslategrey: [47, 79, 79],
                darkturquoise: [0, 206, 209],
                darkviolet: [148, 0, 211],
                deeppink: [255, 20, 147],
                deepskyblue: [0, 191, 255],
                dimgray: [105, 105, 105],
                dimgrey: [105, 105, 105],
                dodgerblue: [30, 144, 255],
                firebrick: [178, 34, 34],
                floralwhite: [255, 250, 240],
                forestgreen: [34, 139, 34],
                fuchsia: [255, 0, 255],
                gainsboro: [220, 220, 220],
                ghostwhite: [248, 248, 255],
                gold: [255, 215, 0],
                goldenrod: [218, 165, 32],
                gray: [128, 128, 128],
                green: [0, 128, 0],
                greenyellow: [173, 255, 47],
                grey: [128, 128, 128],
                honeydew: [240, 255, 240],
                hotpink: [255, 105, 180],
                indianred: [205, 92, 92],
                indigo: [75, 0, 130],
                ivory: [255, 255, 240],
                khaki: [240, 230, 140],
                lavender: [230, 230, 250],
                lavenderblush: [255, 240, 245],
                lawngreen: [124, 252, 0],
                lemonchiffon: [255, 250, 205],
                lightblue: [173, 216, 230],
                lightcoral: [240, 128, 128],
                lightcyan: [224, 255, 255],
                lightgoldenrodyellow: [250, 250, 210],
                lightgray: [211, 211, 211],
                lightgreen: [144, 238, 144],
                lightgrey: [211, 211, 211],
                lightpink: [255, 182, 193],
                lightsalmon: [255, 160, 122],
                lightseagreen: [32, 178, 170],
                lightskyblue: [135, 206, 250],
                lightslategray: [119, 136, 153],
                lightslategrey: [119, 136, 153],
                lightsteelblue: [176, 196, 222],
                lightyellow: [255, 255, 224],
                lime: [0, 255, 0],
                limegreen: [50, 205, 50],
                linen: [250, 240, 230],
                magenta: [255, 0, 255],
                maroon: [128, 0, 0],
                mediumaquamarine: [102, 205, 170],
                mediumblue: [0, 0, 205],
                mediumorchid: [186, 85, 211],
                mediumpurple: [147, 112, 219],
                mediumseagreen: [60, 179, 113],
                mediumslateblue: [123, 104, 238],
                mediumspringgreen: [0, 250, 154],
                mediumturquoise: [72, 209, 204],
                mediumvioletred: [199, 21, 133],
                midnightblue: [25, 25, 112],
                mintcream: [245, 255, 250],
                mistyrose: [255, 228, 225],
                moccasin: [255, 228, 181],
                navajowhite: [255, 222, 173],
                navy: [0, 0, 128],
                oldlace: [253, 245, 230],
                olive: [128, 128, 0],
                olivedrab: [107, 142, 35],
                orange: [255, 165, 0],
                orangered: [255, 69, 0],
                orchid: [218, 112, 214],
                palegoldenrod: [238, 232, 170],
                palegreen: [152, 251, 152],
                paleturquoise: [175, 238, 238],
                palevioletred: [219, 112, 147],
                papayawhip: [255, 239, 213],
                peachpuff: [255, 218, 185],
                peru: [205, 133, 63],
                pink: [255, 192, 203],
                plum: [221, 160, 221],
                powderblue: [176, 224, 230],
                purple: [128, 0, 128],
                rebeccapurple: [102, 51, 153],
                red: [255, 0, 0],
                rosybrown: [188, 143, 143],
                royalblue: [65, 105, 225],
                saddlebrown: [139, 69, 19],
                salmon: [250, 128, 114],
                sandybrown: [244, 164, 96],
                seagreen: [46, 139, 87],
                seashell: [255, 245, 238],
                sienna: [160, 82, 45],
                silver: [192, 192, 192],
                skyblue: [135, 206, 235],
                slateblue: [106, 90, 205],
                slategray: [112, 128, 144],
                slategrey: [112, 128, 144],
                snow: [255, 250, 250],
                springgreen: [0, 255, 127],
                steelblue: [70, 130, 180],
                tan: [210, 180, 140],
                teal: [0, 128, 128],
                thistle: [216, 191, 216],
                tomato: [255, 99, 71],
                turquoise: [64, 224, 208],
                violet: [238, 130, 238],
                wheat: [245, 222, 179],
                white: [255, 255, 255],
                whitesmoke: [245, 245, 245],
                yellow: [255, 255, 0],
                yellowgreen: [154, 205, 50],
              }
            },
            804: function (r) {
              'use strict'
              r.exports = (r, e) => {
                e = e || process.argv
                const n = r.startsWith('-') ? '' : r.length === 1 ? '-' : '--'
                const t = e.indexOf(n + r)
                const a = e.indexOf('--')
                return t !== -1 && (a === -1 ? true : t < a)
              }
            },
            840: function (r, e, n) {
              var t = n(161)
              function buildGraph() {
                var r = {}
                var e = Object.keys(t)
                for (var n = e.length, a = 0; a < n; a++) {
                  r[e[a]] = { distance: -1, parent: null }
                }
                return r
              }
              function deriveBFS(r) {
                var e = buildGraph()
                var n = [r]
                e[r].distance = 0
                while (n.length) {
                  var a = n.pop()
                  var o = Object.keys(t[a])
                  for (var i = o.length, l = 0; l < i; l++) {
                    var s = o[l]
                    var c = e[s]
                    if (c.distance === -1) {
                      c.distance = e[a].distance + 1
                      c.parent = a
                      n.unshift(s)
                    }
                  }
                }
                return e
              }
              function link(r, e) {
                return function (n) {
                  return e(r(n))
                }
              }
              function wrapConversion(r, e) {
                var n = [e[r].parent, r]
                var a = t[e[r].parent][r]
                var o = e[r].parent
                while (e[o].parent) {
                  n.unshift(e[o].parent)
                  a = link(t[e[o].parent][o], a)
                  o = e[o].parent
                }
                a.conversion = n
                return a
              }
              r.exports = function (r) {
                var e = deriveBFS(r)
                var n = {}
                var t = Object.keys(e)
                for (var a = t.length, o = 0; o < a; o++) {
                  var i = t[o]
                  var l = e[i]
                  if (l.parent === null) {
                    continue
                  }
                  n[i] = wrapConversion(i, e)
                }
                return n
              }
            },
            933: function (r, e, n) {
              'use strict'
              const t = n(87)
              const a = n(804)
              const o = process.env
              let i
              if (a('no-color') || a('no-colors') || a('color=false')) {
                i = false
              } else if (
                a('color') ||
                a('colors') ||
                a('color=true') ||
                a('color=always')
              ) {
                i = true
              }
              if ('FORCE_COLOR' in o) {
                i =
                  o.FORCE_COLOR.length === 0 ||
                  parseInt(o.FORCE_COLOR, 10) !== 0
              }
              function translateLevel(r) {
                if (r === 0) {
                  return false
                }
                return {
                  level: r,
                  hasBasic: true,
                  has256: r >= 2,
                  has16m: r >= 3,
                }
              }
              function supportsColor(r) {
                if (i === false) {
                  return 0
                }
                if (a('color=16m') || a('color=full') || a('color=truecolor')) {
                  return 3
                }
                if (a('color=256')) {
                  return 2
                }
                if (r && !r.isTTY && i !== true) {
                  return 0
                }
                const e = i ? 1 : 0
                if (process.platform === 'win32') {
                  const r = t.release().split('.')
                  if (
                    Number(process.versions.node.split('.')[0]) >= 8 &&
                    Number(r[0]) >= 10 &&
                    Number(r[2]) >= 10586
                  ) {
                    return Number(r[2]) >= 14931 ? 3 : 2
                  }
                  return 1
                }
                if ('CI' in o) {
                  if (
                    ['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI'].some(
                      (r) => r in o
                    ) ||
                    o.CI_NAME === 'codeship'
                  ) {
                    return 1
                  }
                  return e
                }
                if ('TEAMCITY_VERSION' in o) {
                  return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(
                    o.TEAMCITY_VERSION
                  )
                    ? 1
                    : 0
                }
                if (o.COLORTERM === 'truecolor') {
                  return 3
                }
                if ('TERM_PROGRAM' in o) {
                  const r = parseInt(
                    (o.TERM_PROGRAM_VERSION || '').split('.')[0],
                    10
                  )
                  switch (o.TERM_PROGRAM) {
                    case 'iTerm.app':
                      return r >= 3 ? 3 : 2
                    case 'Apple_Terminal':
                      return 2
                  }
                }
                if (/-256(color)?$/i.test(o.TERM)) {
                  return 2
                }
                if (
                  /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(
                    o.TERM
                  )
                ) {
                  return 1
                }
                if ('COLORTERM' in o) {
                  return 1
                }
                if (o.TERM === 'dumb') {
                  return e
                }
                return e
              }
              function getSupportLevel(r) {
                const e = supportsColor(r)
                return translateLevel(e)
              }
              r.exports = {
                supportsColor: getSupportLevel,
                stdout: getSupportLevel(process.stdout),
                stderr: getSupportLevel(process.stderr),
              }
            },
          },
          function (r) {
            'use strict'
            !(function () {
              r.nmd = function (r) {
                r.paths = []
                if (!r.children) r.children = []
                Object.defineProperty(r, 'loaded', {
                  enumerable: true,
                  get: function () {
                    return r.l
                  },
                })
                Object.defineProperty(r, 'id', {
                  enumerable: true,
                  get: function () {
                    return r.i
                  },
                })
                return r
              }
            })()
          }
        )
        /* WEBPACK VAR INJECTION */
      }).call(this, '/')

      /***/
    },

    /***/ '4VNc': /***/ function (module, exports, __webpack_require__) {
      'use strict'
      exports.__esModule = true
      exports.processEnv = processEnv
      exports.loadEnvConfig = loadEnvConfig
      var _fs = _interopRequireDefault(__webpack_require__('mw/K'))
      var _path = _interopRequireDefault(__webpack_require__('oyvS'))
      var log = _interopRequireWildcard(__webpack_require__('1yX1'))
      var _dotenvExpand = _interopRequireDefault(__webpack_require__('0mNJ'))
      var _dotenv = _interopRequireDefault(__webpack_require__('10NG'))
      function _getRequireWildcardCache() {
        if (typeof WeakMap !== 'function') return null
        var cache = new WeakMap()
        _getRequireWildcardCache = function () {
          return cache
        }
        return cache
      }
      function _interopRequireWildcard(obj) {
        if (obj && obj.__esModule) {
          return obj
        }
        if (
          obj === null ||
          (typeof obj !== 'object' && typeof obj !== 'function')
        ) {
          return { default: obj }
        }
        var cache = _getRequireWildcardCache()
        if (cache && cache.has(obj)) {
          return cache.get(obj)
        }
        var newObj = {}
        var hasPropertyDescriptor =
          Object.defineProperty && Object.getOwnPropertyDescriptor
        for (var key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor
              ? Object.getOwnPropertyDescriptor(obj, key)
              : null
            if (desc && (desc.get || desc.set)) {
              Object.defineProperty(newObj, key, desc)
            } else {
              newObj[key] = obj[key]
            }
          }
        }
        newObj.default = obj
        if (cache) {
          cache.set(obj, newObj)
        }
        return newObj
      }
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : { default: obj }
      }
      let combinedEnv = undefined
      let cachedLoadedEnvFiles = []
      function processEnv(loadedEnvFiles, dir) {
        // don't reload env if we already have since this breaks escaped
        // environment values e.g. \$ENV_FILE_KEY
        if (
          combinedEnv ||
          process.env.__NEXT_PROCESSED_ENV ||
          !loadedEnvFiles.length
        ) {
          return process.env
        } // flag that we processed the environment values in case a serverless
        // function is re-used or we are running in `next start` mode
        process.env.__NEXT_PROCESSED_ENV = 'true'
        for (const envFile of loadedEnvFiles) {
          try {
            let result = {}
            result.parsed = _dotenv.default.parse(envFile.contents)
            result = (0, _dotenvExpand.default)(result)
            if (result.parsed) {
              log.info(
                `Loaded env from ${_path.default.join(dir || '', envFile.path)}`
              )
            }
            Object.assign(process.env, result.parsed)
          } catch (err) {
            log.error(
              `Failed to load env from ${_path.default.join(dir || '', envFile.path)}`,
              err
            )
          }
        }
        return process.env
      }
      function loadEnvConfig(dir, dev) {
        // don't reload env if we already have since this breaks escaped
        // environment values e.g. \$ENV_FILE_KEY
        if (combinedEnv)
          return { combinedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
        const isTest = 'production' === 'test'
        const mode = isTest ? 'test' : dev ? 'development' : 'production'
        const dotenvFiles = [
          `.env.${mode}.local`, // Don't include `.env.local` for `test` environment
          // since normally you expect tests to produce the same
          // results for everyone
          mode !== 'test' && `.env.local`,
          `.env.${mode}`,
          '.env',
        ].filter(Boolean)
        for (const envFile of dotenvFiles) {
          // only load .env if the user provided has an env config file
          const dotEnvPath = _path.default.join(dir, envFile)
          try {
            const stats = _fs.default.statSync(dotEnvPath) // make sure to only attempt to read files
            if (!stats.isFile()) {
              continue
            }
            const contents = _fs.default.readFileSync(dotEnvPath, 'utf8')
            cachedLoadedEnvFiles.push({ path: envFile, contents })
          } catch (err) {
            if (err.code !== 'ENOENT') {
              log.error(`Failed to load env from ${envFile}`, err)
            }
          }
        }
        combinedEnv = processEnv(cachedLoadedEnvFiles, dir)
        return { combinedEnv, loadedEnvFiles: cachedLoadedEnvFiles }
      }
      //# sourceMappingURL=load-env-config.js.map

      /***/
    },

    /***/ '4lsC': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/send-payload')

      /***/
    },

    /***/ '51W3': /***/ function (module) {
      module.exports = JSON.parse(
        '{"title":"TinaCMS","sidebarTitle":"TinaCMS","seoDefaultTitle":"Build real-time editing into your site.","description":"Tina is an open-source site editing toolkit for React-based frameworks — Gatsby & Next.js.","siteUrl":"https://tinacms.org","roadmapUrl":"https://github.com/tinacms/tinacms/blob/master/ROADMAP.md","licenseUrl":"https://github.com/tinacms/tinacms/blob/master/LICENSE","keywords":"nextjs, react, cms, next","social":{"twitterHandle":"@tina_cms","twitter":"https://twitter.com/tina_cms","github":"https://github.com/tinacms/tinacms","forum":"https://community.tinacms.org/","slack":"https://join.slack.com/t/tinacms/shared_invite/enQtNzgxNDY1OTA3ODI3LTNkNWEwYjQyYTA2ZDZjZGQ2YmI5Y2ZlOWVmMjlkYmYxMzVmNjM0YTk2MWM2MTIzMmMxMDg3NWIxN2EzOWQ0NDM"}}'
      )

      /***/
    },

    /***/ '67Bq': /***/ function (module) {
      module.exports = JSON.parse(
        '{"react-tinacms-date":[{"id":"dwe+","file":"static/chunks/90e253d2.837521d6e524714beadf.js"},{"id":"2NuI","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"3GBV","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"3Q4a","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"LQTb","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"N/yf","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"OlFg","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"XAXW","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"fhzG","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"fkjU","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"lT4e","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"rE7N","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"t33a","file":"static/chunks/39.5b981b2f552458f959cf.js"},{"id":"vTPy","file":"static/chunks/39.5b981b2f552458f959cf.js"}],"react-tinacms-editor":[{"id":"VrN/","file":"static/chunks/f65a48b9.0c2183cdce73b14efff6.js"},{"id":"t21p","file":"static/chunks/c660bb88.5b95f2f2bc14f46233f7.js"},{"id":"V2qZ","file":"static/chunks/1606726a.b8957708a490d99afa5c.js"},{"id":"+80P","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"+V57","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"/f6Q","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"1M3H","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"1dGX","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"1nBO","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"2KYT","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"2l+C","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"31bW","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"4fNk","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"53Xb","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"5Mrk","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"6A5J","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"9/5/","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"ABBN","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"AGgm","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"B1jb","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"CK61","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"CWsV","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"CXva","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"CsC6","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"GYWy","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"GZ5e","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"GhYw","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"HKru","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"I/Hh","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"IIUr","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"KOyK","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"MEpN","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"NAgD","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Q+CF","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"QjYF","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Qo0+","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"RKh7","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"SINd","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"SpRm","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Sz5L","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"T8I8","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"TCYN","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"TLR5","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"UxO+","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Vb5C","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Vlv/","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Vwaf","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"W1Rp","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"X71X","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"Zl/q","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"b9EY","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"bgCn","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"cTMM","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"dpam","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"fKCf","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"fMI+","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"fZFN","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"fwbU","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"g0+v","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"g40J","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"gNPE","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"hyZr","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"ijE+","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"jzd5","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"kiyR","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"ky0j","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"mG1W","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"mSF0","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"nBLk","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"oSSR","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"p7ys","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"qRUV","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"rzDG","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"sRdV","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"tZ4i","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"u0qK","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"usqY","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"vWgF","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"vys+","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"wtjL","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"xGQ6","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"y8fO","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"yKnv","file":"static/chunks/15.c418fababbd9004121e9.js"},{"id":"zQ/W","file":"static/chunks/15.c418fababbd9004121e9.js"}]}'
      )

      /***/
    },

    /***/ '8Bbg': /***/ function (module, exports, __webpack_require__) {
      module.exports = __webpack_require__('B5Ud')

      /***/
    },

    /***/ '8cZr': /***/ function (module, exports, __webpack_require__) {
      module.exports = __webpack_require__('VDXt')

      /***/
    },

    /***/ '8xkj': /***/ function (module, exports) {
      module.exports = require('querystring')

      /***/
    },

    /***/ '9wzx': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/lib/router/utils/get-route-from-asset-path')

      /***/
    },

    /***/ AXZJ: /***/ function (module, exports, __webpack_require__) {
      'use strict'
      exports.__esModule = true
      exports.htmlEscapeJsonString = htmlEscapeJsonString // This utility is based on https://github.com/zertosh/htmlescape
      // License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE
      const ESCAPE_LOOKUP = {
        '&': '\\u0026',
        '>': '\\u003e',
        '<': '\\u003c',
        '\u2028': '\\u2028',
        '\u2029': '\\u2029',
      }
      const ESCAPE_REGEX = /[&><\u2028\u2029]/g
      function htmlEscapeJsonString(str) {
        return str.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match])
      }
      //# sourceMappingURL=htmlescape.js.map

      /***/
    },

    /***/ AroE: /***/ function (module, exports) {
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule
          ? obj
          : {
              default: obj,
            }
      }

      module.exports = _interopRequireDefault

      /***/
    },

    /***/ B5Ud: /***/ function (module, exports, __webpack_require__) {
      'use strict'

      var _interopRequireDefault = __webpack_require__('AroE')

      exports.__esModule = true
      exports.Container = Container
      exports.createUrl = createUrl
      exports.default = void 0

      var _react = _interopRequireDefault(__webpack_require__('cDcd'))

      var _utils = __webpack_require__('kYf9')

      exports.AppInitialProps = _utils.AppInitialProps
      exports.NextWebVitalsMetric = _utils.NextWebVitalsMetric
      /**
       * `App` component is used for initialize of pages. It allows for overwriting and full control of the `page` initialization.
       * This allows for keeping state between navigation, custom error handling, injecting additional data.
       */

      async function appGetInitialProps({ Component, ctx }) {
        const pageProps = await (0, _utils.loadGetInitialProps)(Component, ctx)
        return {
          pageProps,
        }
      }

      class App extends _react.default.Component {
        // Kept here for backwards compatibility.
        // When someone ended App they could call `super.componentDidCatch`.
        // @deprecated This method is no longer needed. Errors are caught at the top level
        componentDidCatch(error, _errorInfo) {
          throw error
        }

        render() {
          const { router, Component, pageProps, __N_SSG, __N_SSP } = this.props
          return /*#__PURE__*/ _react.default.createElement(
            Component,
            Object.assign(
              {},
              pageProps, // we don't add the legacy URL prop if it's using non-legacy
              // methods like getStaticProps and getServerSideProps
              !(__N_SSG || __N_SSP)
                ? {
                    url: createUrl(router),
                  }
                : {}
            )
          )
        }
      }

      exports.default = App
      App.origGetInitialProps = appGetInitialProps
      App.getInitialProps = appGetInitialProps
      let warnContainer
      let warnUrl

      if (false) {
      } // @deprecated noop for now until removal

      function Container(p) {
        if (false) {
        }
        return p.children
      }

      function createUrl(router) {
        // This is to make sure we don't references the router object at call time
        const { pathname, asPath, query } = router
        return {
          get query() {
            if (false) {
            }
            return query
          },

          get pathname() {
            if (false) {
            }
            return pathname
          },

          get asPath() {
            if (false) {
            }
            return asPath
          },

          back: () => {
            if (false) {
            }
            router.back()
          },
          push: (url, as) => {
            if (false) {
            }
            return router.push(url, as)
          },
          pushTo: (href, as) => {
            if (false) {
            }
            const pushRoute = as ? href : ''
            const pushUrl = as || href
            return router.push(pushRoute, pushUrl)
          },
          replace: (url, as) => {
            if (false) {
            }
            return router.replace(url, as)
          },
          replaceTo: (href, as) => {
            if (false) {
            }
            const replaceRoute = as ? href : ''
            const replaceUrl = as || href
            return router.replace(replaceRoute, replaceUrl)
          },
        }
      }

      /***/
    },

    /***/ Bf2M: /***/ function (module, exports) {
      module.exports = require('react-tinacms-github')

      /***/
    },

    /***/ Dtiu: /***/ function (module, exports) {
      module.exports = require('styled-components')

      /***/
    },

    /***/ GX0O: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      __webpack_require__.r(__webpack_exports__)

      /* harmony default export */ __webpack_exports__['default'] = function (
        ctx
      ) {
        return Promise.all([])
      }

      /***/
    },

    /***/ I2pE: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      __webpack_require__.r(__webpack_exports__)
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'unstable_getStaticParams',
        function () {
          return unstable_getStaticParams
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'getStaticProps',
        function () {
          return getStaticProps
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'getStaticPaths',
        function () {
          return getStaticPaths
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'getServerSideProps',
        function () {
          return getServerSideProps
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'unstable_getStaticProps',
        function () {
          return unstable_getStaticProps
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'unstable_getStaticPaths',
        function () {
          return unstable_getStaticPaths
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'unstable_getServerProps',
        function () {
          return unstable_getServerProps
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'config',
        function () {
          return config
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        '_app',
        function () {
          return _app
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'renderReqToHTML',
        function () {
          return renderReqToHTML
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'render',
        function () {
          return render
        }
      )
      /* harmony import */ var next_plugin_loader_middleware_on_init_server___WEBPACK_IMPORTED_MODULE_0__ =
        __webpack_require__('GX0O')
      /* harmony import */ var next_plugin_loader_middleware_on_error_server___WEBPACK_IMPORTED_MODULE_1__ =
        __webpack_require__('KqAr')
      /* harmony import */ var next_dist_next_server_server_node_polyfill_fetch__WEBPACK_IMPORTED_MODULE_2__ =
        __webpack_require__('mctB')
      /* harmony import */ var next_dist_next_server_server_node_polyfill_fetch__WEBPACK_IMPORTED_MODULE_2___default =
        /*#__PURE__*/ __webpack_require__.n(
          next_dist_next_server_server_node_polyfill_fetch__WEBPACK_IMPORTED_MODULE_2__
        )

      const { isResSent } = __webpack_require__('U8mc')

      const { processEnv } = __webpack_require__('4VNc')
      processEnv([])

      const { parse } = __webpack_require__('bzos')
      const { parse: parseQs } = __webpack_require__('8xkj')
      const { renderToHTML } = __webpack_require__('KK5V')
      const { tryGetPreviewData } = __webpack_require__('+/F5')
      const { sendHTML } = __webpack_require__('ef3A')
      const { sendPayload } = __webpack_require__('4lsC')
      const buildManifest = __webpack_require__('LZ9C')
      const reactLoadableManifest = __webpack_require__('67Bq')
      const Document = __webpack_require__('Y7Z2').default
      const Error = __webpack_require__('/a9y').default
      const App = __webpack_require__('cha2').default

      const { rewrites } = __webpack_require__('Skye')
      const { pathToRegexp, default: pathMatch } = __webpack_require__('01KS')

      const ComponentInfo = __webpack_require__('VOFc')

      const Component = ComponentInfo.default
      /* harmony default export */ __webpack_exports__['default'] = Component
      const unstable_getStaticParams =
        ComponentInfo['unstable_getStaticParam' + 's']
      const getStaticProps = ComponentInfo['getStaticProp' + 's']
      const getStaticPaths = ComponentInfo['getStaticPath' + 's']
      const getServerSideProps = ComponentInfo['getServerSideProp' + 's']

      // kept for detecting legacy exports
      const unstable_getStaticProps =
        ComponentInfo['unstable_getStaticProp' + 's']
      const unstable_getStaticPaths =
        ComponentInfo['unstable_getStaticPath' + 's']
      const unstable_getServerProps =
        ComponentInfo['unstable_getServerProp' + 's']

      const getCustomRouteMatcher = pathMatch(true)
      const { prepareDestination } = __webpack_require__('/y8f')

      function handleRewrites(parsedUrl) {
        for (const rewrite of rewrites) {
          const matcher = getCustomRouteMatcher(rewrite.source)
          const params = matcher(parsedUrl.pathname)

          if (params) {
            const { parsedDestination } = prepareDestination(
              rewrite.destination,
              params,
              parsedUrl.query,
              true,
              ''
            )

            Object.assign(parsedUrl.query, parsedDestination.query, params)
            delete parsedDestination.query

            Object.assign(parsedUrl, parsedDestination)

            if (parsedUrl.pathname === '/test') {
              break
            }
          }
        }

        return parsedUrl
      }

      const config = ComponentInfo['confi' + 'g'] || {}
      const _app = App
      async function renderReqToHTML(
        req,
        res,
        renderMode,
        _renderOpts,
        _params
      ) {
        const fromExport = renderMode === 'export' || renderMode === true

        const options = {
          App,
          Document,
          buildManifest,
          getStaticProps,
          getServerSideProps,
          getStaticPaths,
          reactLoadableManifest,
          canonicalBase: '',
          buildId: 'xXPgpxsbhoEyVP2leRiec',
          assetPrefix: '',
          previewProps: {
            previewModeId: '9e0f19a11fe1be22878bdb16da136d9e',
            previewModeSigningKey:
              'f4732bbebc3bb13f710fc4a705ddf400b4f0492f7acbe2eae58dd9f8f48d7d35',
            previewModeEncryptionKey:
              '1298fba605851d3ff7d23ca2bfbaed2628253a1e071ad0835984c3f04acad4c3',
          },
          env: process.env,
          basePath: '',
          ..._renderOpts,
        }
        let _nextData = false
        let parsedUrl

        try {
          // We need to trust the dynamic route params from the proxy
          // to ensure we are using the correct values
          const trustQuery = !getStaticProps && req.headers['x-vercel-id']
          const parsedUrl = handleRewrites(parse(req.url, true))

          if (parsedUrl.pathname.match(/_next\/data/)) {
            const { default: getRouteFromAssetPath } =
              __webpack_require__('9wzx')
            _nextData = true
            parsedUrl.pathname = getRouteFromAssetPath(
              parsedUrl.pathname.replace(
                new RegExp('/_next/data/xXPgpxsbhoEyVP2leRiec/'),
                '/'
              ),
              '.json'
            )
          }

          const renderOpts = Object.assign(
            {
              Component,
              pageConfig: config,
              nextExport: fromExport,
              isDataReq: _nextData,
            },
            options
          )

          const params = {}
          const nowParams = null
          // make sure to set renderOpts to the correct params e.g. _params
          // if provided from worker or params if we're parsing them here
          renderOpts.params = _params || params

          const isFallback = parsedUrl.query.__nextFallback

          const previewData = tryGetPreviewData(req, res, options.previewProps)
          const isPreviewMode = previewData !== false

          let result = await renderToHTML(
            req,
            res,
            '/test',
            Object.assign(
              {},
              getStaticProps ? {} : parsedUrl.query,
              nowParams ? nowParams : params,
              _params,
              isFallback ? { __nextFallback: 'true' } : {}
            ),
            renderOpts
          )

          if (!renderMode) {
            if (_nextData || getStaticProps || getServerSideProps) {
              sendPayload(
                req,
                res,
                _nextData ? JSON.stringify(renderOpts.pageData) : result,
                _nextData ? 'json' : 'html',
                true,
                {
                  private: isPreviewMode,
                  stateful: !!getServerSideProps,
                  revalidate: renderOpts.revalidate,
                }
              )
              return null
            }
          } else if (isPreviewMode) {
            res.setHeader(
              'Cache-Control',
              'private, no-cache, no-store, max-age=0, must-revalidate'
            )
          }

          if (renderMode) return { html: result, renderOpts }
          return result
        } catch (err) {
          if (!parsedUrl) {
            parsedUrl = parse(req.url, true)
          }

          if (err.code === 'ENOENT') {
            res.statusCode = 404
          } else if (err.code === 'DECODE_FAILED') {
            // TODO: better error?
            res.statusCode = 400
          } else {
            console.error('Unhandled error during request:', err)

            // Backwards compat (call getInitialProps in custom error):
            try {
              await renderToHTML(
                req,
                res,
                '/_error',
                parsedUrl.query,
                Object.assign({}, options, {
                  getStaticProps: undefined,
                  getStaticPaths: undefined,
                  getServerSideProps: undefined,
                  Component: Error,
                  err: err,
                  // Short-circuit rendering:
                  isDataReq: true,
                })
              )
            } catch (underErrorErr) {
              console.error(
                'Failed call /_error subroutine, continuing to crash function:',
                underErrorErr
              )
            }

            // Throw the error to crash the serverless function
            if (isResSent(res)) {
              console.error('!!! WARNING !!!')
              console.error(
                'Your function crashed, but closed the response before allowing the function to exit.\n' +
                  'This may cause unexpected behavior for the next request.'
              )
              console.error('!!! WARNING !!!')
            }
            throw err
          }

          const result = await renderToHTML(
            req,
            res,
            '/_error',
            parsedUrl.query,
            Object.assign({}, options, {
              getStaticProps: undefined,
              getStaticPaths: undefined,
              getServerSideProps: undefined,
              Component: Error,
              err: res.statusCode === 404 ? undefined : err,
            })
          )
          return result
        }
      }
      async function render(req, res) {
        try {
          await Object(
            next_plugin_loader_middleware_on_init_server___WEBPACK_IMPORTED_MODULE_0__[
              'default'
            ]
          )()
          const html = await renderReqToHTML(req, res)
          if (html) {
            sendHTML(req, res, html, { generateEtags: true })
          }
        } catch (err) {
          console.error(err)
          await Object(
            next_plugin_loader_middleware_on_error_server___WEBPACK_IMPORTED_MODULE_1__[
              'default'
            ]
          )(err)
          // Throw the error to crash the serverless function
          throw err
        }
      }

      /***/
    },

    /***/ KK5V: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/render')

      /***/
    },

    /***/ KqAr: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      __webpack_require__.r(__webpack_exports__)

      /* harmony default export */ __webpack_exports__['default'] = function (
        ctx
      ) {
        return Promise.all([])
      }

      /***/
    },

    /***/ LZ9C: /***/ function (module) {
      module.exports = JSON.parse(
        '{"polyfillFiles":["static/chunks/polyfills-44e7deebf1b266dcf675.js"],"devFiles":[],"lowPriorityFiles":["static/xXPgpxsbhoEyVP2leRiec/_buildManifest.js","static/xXPgpxsbhoEyVP2leRiec/_ssgManifest.js"],"pages":{"/":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/index-0350bccc3946992232ac.js"],"/_app":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/css/5e476a366bed88f8b9f3.css","static/chunks/pages/_app-2081a31b0a6e8b7db882.js"],"/_error":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/pages/_error-7277dcbf0c0b576c1e3e.js"],"/blog":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/blog-5c7c385199e0b0959acd.js"],"/blog/[slug]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/blog/[slug]-ee9cb4b02c47c8d4bef9.js"],"/blog/page/[page_index]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/blog/page/[page_index]-d68d02f9d083d8bf2d1a.js"],"/community":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/community-38f4d61f7ca67529fe66.js"],"/docs":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/docs-c9d3626996e04659c268.js"],"/docs/[...slug]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/docs/[...slug]-bdc94a519e1a467006bb.js"],"/enterprise":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/enterprise-14dc9228780e1ce74192.js"],"/github/authorizing":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/pages/github/authorizing-e1ff90682736baea1a04.js"],"/guides":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/guides-9b1cc78b2eaf806e17d3.js"],"/guides/[category]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/pages/guides/[category]-d2d1a6c24b3783a6fa41.js"],"/guides/[category]/[guide]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/pages/guides/[category]/[guide]-27af636987a9e3218796.js"],"/guides/[category]/[guide]/[step]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/guides/[category]/[guide]/[step]-f77bd391f3f96eebe2ce.js"],"/packages":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/packages-2a722e6df3ec71761e18.js"],"/packages/[slug]":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/pages/packages/[slug]-ce28f90819ea44484e6e.js"],"/rss.xml":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/pages/rss.xml-cfed46631da8a5671a30.js"],"/study":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/9f96d65d.94eaa061f5101393e8b9.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/f65a48b9.0c2183cdce73b14efff6.js","static/chunks/c660bb88.5b95f2f2bc14f46233f7.js","static/chunks/1606726a.b8957708a490d99afa5c.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/639450e8358faed403e05bd668fc2025839c0e75.9d96b4889c26ea3f419b.js","static/chunks/32e0182ed7b54628a0a44a157e49374d7c7bd4ce.103d3eb568f7b84c9a1c.js","static/chunks/ac68861718235a2888c83e092b5d7c5b38ad32c3.a4a2a1a3f86651749432.js","static/chunks/a86a4545d8ddf745cee364476b36481a32008394.a40c8bd2a3999dd2274f.js","static/chunks/cddb7223a4c886108c505f61c2f46f1fe5225407.d24285df362f530361cb.js","static/chunks/2229e39afb097a6fcb24228cd3bb782f7896cef4.0e3682cba91611b19854.js","static/chunks/e407d73b61faf5a0b6b1ef72bef0f5760151a773.3253f417e0fae387167e.js","static/chunks/15.c418fababbd9004121e9.js","static/chunks/pages/study-19fd7fc84181629929cb.js"],"/test":["static/chunks/main-e0150adb3182a3fe8176.js","static/chunks/webpack-9b006fe6ea0a8f66dad3.js","static/chunks/framework.1b5fae6dde8a26be77ac.js","static/chunks/bee240a3.10c4afc3b077b2c1abd6.js","static/chunks/cf9921a6eda31d205431ef5b8c0f59d3dfc7d8e1.b8c2224ffd0e70bc1f9c.js","static/chunks/pages/test-cd299461f54649fd8d4f.js"]}}'
      )

      /***/
    },

    /***/ N8VE: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'a',
        function () {
          return readFile
        }
      )
      var fs = __webpack_require__('mw/K')

      const readFile = async (filePath) => {
        return new Promise((resolve, reject) => {
          fs.readFile(filePath, 'utf8', function (err, data) {
            if (err) {
              reject(err)
            }

            resolve(data)
          })
        })
      }

      /***/
    },

    /***/ OsmD: /***/ function (module, exports) {
      module.exports = require('react-tinacms-date')

      /***/
    },

    /***/ SVlN: /***/ function (module, exports) {
      module.exports = require('@tinacms/styles')

      /***/
    },

    /***/ Skye: /***/ function (module) {
      module.exports = JSON.parse(
        '{"version":3,"pages404":true,"basePath":"","redirects":[{"source":"/:path+/","destination":"/:path+","statusCode":308,"regex":"^(?:/((?:[^/]+?)(?:/(?:[^/]+?))*))/$"}],"rewrites":[],"headers":[],"dynamicRoutes":[{"page":"/blog/page/[page_index]","regex":"^/blog/page/([^/]+?)(?:/)?$","routeKeys":{"page_index":"page_index"},"namedRegex":"^/blog/page/(?<page_index>[^/]+?)(?:/)?$"},{"page":"/blog/[slug]","regex":"^/blog/([^/]+?)(?:/)?$","routeKeys":{"slug":"slug"},"namedRegex":"^/blog/(?<slug>[^/]+?)(?:/)?$"},{"page":"/docs/[...slug]","regex":"^/docs/(.+?)(?:/)?$","routeKeys":{"slug":"slug"},"namedRegex":"^/docs/(?<slug>.+?)(?:/)?$"},{"page":"/guides/[category]","regex":"^/guides/([^/]+?)(?:/)?$","routeKeys":{"category":"category"},"namedRegex":"^/guides/(?<category>[^/]+?)(?:/)?$"},{"page":"/guides/[category]/[guide]","regex":"^/guides/([^/]+?)/([^/]+?)(?:/)?$","routeKeys":{"category":"category","guide":"guide"},"namedRegex":"^/guides/(?<category>[^/]+?)/(?<guide>[^/]+?)(?:/)?$"},{"page":"/guides/[category]/[guide]/[step]","regex":"^/guides/([^/]+?)/([^/]+?)/([^/]+?)(?:/)?$","routeKeys":{"category":"category","guide":"guide","step":"step"},"namedRegex":"^/guides/(?<category>[^/]+?)/(?<guide>[^/]+?)/(?<step>[^/]+?)(?:/)?$"},{"page":"/packages/[slug]","regex":"^/packages/([^/]+?)(?:/)?$","routeKeys":{"slug":"slug"},"namedRegex":"^/packages/(?<slug>[^/]+?)(?:/)?$"}]}'
      )

      /***/
    },

    /***/ U8mc: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/lib/utils')

      /***/
    },

    /***/ UJjI: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/lib/constants.js')

      /***/
    },

    /***/ UlpK: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/lib/head.js')

      /***/
    },

    /***/ V8Zh: /***/ function (module, exports) {
      /* WEBPACK VAR INJECTION */ ;(function (__dirname) {
        module.exports = (function (r, e) {
          'use strict'
          var t = {}
          function __webpack_require__(e) {
            if (t[e]) {
              return t[e].exports
            }
            var _ = (t[e] = { i: e, l: false, exports: {} })
            r[e].call(_.exports, _, _.exports, __webpack_require__)
            _.l = true
            return _.exports
          }
          __webpack_require__.ab = __dirname + '/'
          function startup() {
            return __webpack_require__(766)
          }
          return startup()
        })({
          766: function (r) {
            'use strict'
            const e = /[|\\{}()[\]^$+*?.-]/g
            r.exports = (r) => {
              if (typeof r !== 'string') {
                throw new TypeError('Expected a string')
              }
              return r.replace(e, '\\$&')
            }
          },
        })
        /* WEBPACK VAR INJECTION */
      }).call(this, '/')

      /***/
    },

    /***/ VDXt: /***/ function (module, exports, __webpack_require__) {
      'use strict'

      exports.__esModule = true
      exports.Html = Html
      exports.Main = Main
      exports.NextScript = exports.Head = exports.default = void 0

      var _propTypes = _interopRequireDefault(__webpack_require__('rf6O'))

      var _react = _interopRequireWildcard(__webpack_require__('cDcd'))

      var _server = _interopRequireDefault(__webpack_require__('2+G7'))

      var _constants = __webpack_require__('UJjI')

      var _documentContext = __webpack_require__('nMq/')

      var _utils = __webpack_require__('kYf9')

      exports.DocumentContext = _utils.DocumentContext
      exports.DocumentInitialProps = _utils.DocumentInitialProps
      exports.DocumentProps = _utils.DocumentProps

      var _utils2 = __webpack_require__('ri/Y')

      var _htmlescape = __webpack_require__('AXZJ')

      function _interopRequireDefault(obj) {
        return obj && obj.__esModule
          ? obj
          : {
              default: obj,
            }
      }

      function _getRequireWildcardCache() {
        if (typeof WeakMap !== 'function') return null
        var cache = new WeakMap()

        _getRequireWildcardCache = function () {
          return cache
        }

        return cache
      }

      function _interopRequireWildcard(obj) {
        if (obj && obj.__esModule) {
          return obj
        }

        if (
          obj === null ||
          (typeof obj !== 'object' && typeof obj !== 'function')
        ) {
          return {
            default: obj,
          }
        }

        var cache = _getRequireWildcardCache()

        if (cache && cache.has(obj)) {
          return cache.get(obj)
        }

        var newObj = {}
        var hasPropertyDescriptor =
          Object.defineProperty && Object.getOwnPropertyDescriptor

        for (var key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            var desc = hasPropertyDescriptor
              ? Object.getOwnPropertyDescriptor(obj, key)
              : null

            if (desc && (desc.get || desc.set)) {
              Object.defineProperty(newObj, key, desc)
            } else {
              newObj[key] = obj[key]
            }
          }
        }

        newObj.default = obj

        if (cache) {
          cache.set(obj, newObj)
        }

        return newObj
      }

      function dedupe(bundles) {
        const files = new Set()
        const kept = []

        for (const bundle of bundles) {
          if (files.has(bundle.file)) continue
          files.add(bundle.file)
          kept.push(bundle)
        }

        return kept
      }

      function getOptionalModernScriptVariant(path) {
        if (false) {
        }

        return path
      }
      /**
       * `Document` component handles the initial `document` markup and renders only on the server side.
       * Commonly used for implementing server side rendering for `css-in-js` libraries.
       */

      class Document extends _react.Component {
        /**
         * `getInitialProps` hook returns the context object with the addition of `renderPage`.
         * `renderPage` callback executes `React` rendering logic synchronously to support server-rendering wrappers
         */
        static async getInitialProps(ctx) {
          const enhanceApp = (App) => {
            return (props) =>
              /*#__PURE__*/ _react.default.createElement(App, props)
          }

          const { html, head } = await ctx.renderPage({
            enhanceApp,
          })
          const styles = [...(0, _server.default)()]
          return {
            html,
            head,
            styles,
          }
        }

        static renderDocument(DocumentComponent, props) {
          return /*#__PURE__*/ _react.default.createElement(
            _documentContext.DocumentContext.Provider,
            {
              value: {
                _documentProps: props,
                // In dev we invalidate the cache by appending a timestamp to the resource URL.
                // This is a workaround to fix https://github.com/vercel/next.js/issues/5860
                // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
                _devOnlyInvalidateCacheQueryString: false ? undefined : '',
              },
            },
            /*#__PURE__*/ _react.default.createElement(DocumentComponent, props)
          )
        }

        render() {
          return /*#__PURE__*/ _react.default.createElement(
            Html,
            null,
            /*#__PURE__*/ _react.default.createElement(Head, null),
            /*#__PURE__*/ _react.default.createElement(
              'body',
              null,
              /*#__PURE__*/ _react.default.createElement(Main, null),
              /*#__PURE__*/ _react.default.createElement(NextScript, null)
            )
          )
        }
      }

      exports.default = Document
      Document.headTagsMiddleware = false ? undefined : () => []

      function Html(props) {
        return /*#__PURE__*/ _react.default.createElement(
          'html',
          Object.assign({}, props)
        )
      }

      class Head extends _react.Component {
        constructor(...args) {
          super(...args)
          this.context = void 0
        }

        getCssLinks() {
          const { assetPrefix, files } = this.context._documentProps
          const { _devOnlyInvalidateCacheQueryString } = this.context
          const cssFiles =
            files && files.length ? files.filter((f) => f.endsWith('.css')) : []
          const cssLinkElements = []
          cssFiles.forEach((file) => {
            cssLinkElements.push(
              /*#__PURE__*/ _react.default.createElement('link', {
                key: `${file}-preload`,
                nonce: this.props.nonce,
                rel: 'preload',
                href: `${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`,
                as: 'style',
                crossOrigin: this.props.crossOrigin || undefined,
              }),
              /*#__PURE__*/ _react.default.createElement('link', {
                key: file,
                nonce: this.props.nonce,
                rel: 'stylesheet',
                href: `${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`,
                crossOrigin: this.props.crossOrigin || undefined,
              })
            )
          })
          return cssLinkElements.length === 0 ? null : cssLinkElements
        }

        getPreloadDynamicChunks() {
          const { dynamicImports, assetPrefix } = this.context._documentProps
          const { _devOnlyInvalidateCacheQueryString } = this.context
          return dedupe(dynamicImports)
            .map((bundle) => {
              // `dynamicImports` will contain both `.js` and `.module.js` when the
              // feature is enabled. This clause will filter down to the modern
              // variants only.
              if (
                !bundle.file.endsWith(getOptionalModernScriptVariant('.js'))
              ) {
                return null
              }

              return /*#__PURE__*/ _react.default.createElement('link', {
                rel: 'preload',
                key: bundle.file,
                href: `${assetPrefix}/_next/${encodeURI(bundle.file)}${_devOnlyInvalidateCacheQueryString}`,
                as: 'script',
                nonce: this.props.nonce,
                crossOrigin: this.props.crossOrigin || undefined,
              })
            }) // Filter out nulled scripts
            .filter(Boolean)
        }

        getPreloadMainLinks() {
          const { assetPrefix, files } = this.context._documentProps
          const { _devOnlyInvalidateCacheQueryString } = this.context
          const preloadFiles =
            files && files.length
              ? files.filter((file) => {
                  // `dynamicImports` will contain both `.js` and `.module.js` when
                  // the feature is enabled. This clause will filter down to the
                  // modern variants only.
                  return file.endsWith(getOptionalModernScriptVariant('.js'))
                })
              : []
          return !preloadFiles.length
            ? null
            : preloadFiles.map((file) =>
                /*#__PURE__*/ _react.default.createElement('link', {
                  key: file,
                  nonce: this.props.nonce,
                  rel: 'preload',
                  href: `${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`,
                  as: 'script',
                  crossOrigin: this.props.crossOrigin || undefined,
                })
              )
        }

        render() {
          const {
            styles,
            canonicalBase,
            __NEXT_DATA__,
            dangerousAsPath,
            headTags,
            unstable_runtimeJS,
          } = this.context._documentProps
          const disableRuntimeJS = unstable_runtimeJS === false
          let { head } = this.context._documentProps
          let children = this.props.children // show a warning if Head contains <title> (only in development)

          const curStyles = Array.isArray(styles) ? styles : []

          return /*#__PURE__*/ _react.default.createElement(
            'head',
            this.props,
            this.context._documentProps.isDevelopment &&
              /*#__PURE__*/ _react.default.createElement(
                _react.default.Fragment,
                null,
                /*#__PURE__*/ _react.default.createElement('style', {
                  'data-next-hide-fouc': true,
                  dangerouslySetInnerHTML: {
                    __html: `body{display:none}`,
                  },
                }),
                /*#__PURE__*/ _react.default.createElement(
                  'noscript',
                  {
                    'data-next-hide-fouc': true,
                  },
                  /*#__PURE__*/ _react.default.createElement('style', {
                    dangerouslySetInnerHTML: {
                      __html: `body{display:block}`,
                    },
                  })
                )
              ),
            children,
            head,
            /*#__PURE__*/ _react.default.createElement('meta', {
              name: 'next-head-count',
              content: _react.default.Children.count(head || []).toString(),
            }),
            /*#__PURE__*/ _react.default.createElement(
              _react.default.Fragment,
              null,
              this.getCssLinks(),
              !disableRuntimeJS && this.getPreloadDynamicChunks(),
              !disableRuntimeJS && this.getPreloadMainLinks(),
              this.context._documentProps.isDevelopment &&
                /*#__PURE__*/
                // this element is used to mount development styles so the
                // ordering matches production
                // (by default, style-loader injects at the bottom of <head />)
                _react.default.createElement('noscript', {
                  id: '__next_css__DO_NOT_USE__',
                }),
              styles || null
            ),
            _react.default.createElement(
              _react.default.Fragment,
              {},
              ...(headTags || [])
            )
          )
        }
      }

      exports.Head = Head
      Head.contextType = _documentContext.DocumentContext
      Head.propTypes = {
        nonce: _propTypes.default.string,
        crossOrigin: _propTypes.default.string,
      }

      function Main() {
        const { html } = (0, _react.useContext)(
          _documentContext.DocumentContext
        )._documentProps

        return /*#__PURE__*/ _react.default.createElement('div', {
          id: '__next',
          dangerouslySetInnerHTML: {
            __html: html,
          },
        })
      }

      class NextScript extends _react.Component {
        constructor(...args) {
          super(...args)
          this.context = void 0
        }

        getDynamicChunks() {
          const { dynamicImports, assetPrefix, files, isDevelopment } =
            this.context._documentProps
          const { _devOnlyInvalidateCacheQueryString } = this.context
          return dedupe(dynamicImports).map((bundle) => {
            let modernProps = {}

            if (false) {
            }

            if (!bundle.file.endsWith('.js') || files.includes(bundle.file))
              return null
            return /*#__PURE__*/ _react.default.createElement(
              'script',
              Object.assign(
                {
                  async: !isDevelopment,
                  key: bundle.file,
                  src: `${assetPrefix}/_next/${encodeURI(bundle.file)}${_devOnlyInvalidateCacheQueryString}`,
                  nonce: this.props.nonce,
                  crossOrigin: this.props.crossOrigin || undefined,
                },
                modernProps
              )
            )
          })
        }

        getScripts() {
          var _buildManifest$lowPri

          const { assetPrefix, files, buildManifest, isDevelopment } =
            this.context._documentProps
          const { _devOnlyInvalidateCacheQueryString } = this.context
          const normalScripts =
            files === null || files === void 0
              ? void 0
              : files.filter((file) => file.endsWith('.js'))
          const lowPriorityScripts =
            (_buildManifest$lowPri = buildManifest.lowPriorityFiles) === null ||
            _buildManifest$lowPri === void 0
              ? void 0
              : _buildManifest$lowPri.filter((file) => file.endsWith('.js'))
          return [...normalScripts, ...lowPriorityScripts].map((file) => {
            let modernProps = {}

            if (false) {
            }

            return /*#__PURE__*/ _react.default.createElement(
              'script',
              Object.assign(
                {
                  key: file,
                  src: `${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`,
                  nonce: this.props.nonce,
                  async: !isDevelopment,
                  crossOrigin: this.props.crossOrigin || undefined,
                },
                modernProps
              )
            )
          })
        }

        getPolyfillScripts() {
          // polyfills.js has to be rendered as nomodule without async
          // It also has to be the first script to load
          const { assetPrefix, buildManifest } = this.context._documentProps
          const { _devOnlyInvalidateCacheQueryString } = this.context
          return buildManifest.polyfillFiles
            .filter(
              (polyfill) =>
                polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
            )
            .map((polyfill) =>
              /*#__PURE__*/ _react.default.createElement('script', {
                key: polyfill,
                nonce: this.props.nonce,
                crossOrigin: this.props.crossOrigin || undefined,
                noModule: true,
                src: `${assetPrefix}/_next/${polyfill}${_devOnlyInvalidateCacheQueryString}`,
              })
            )
        }

        static getInlineScriptSource(documentProps) {
          const { __NEXT_DATA__ } = documentProps

          try {
            const data = JSON.stringify(__NEXT_DATA__)
            return (0, _htmlescape.htmlEscapeJsonString)(data)
          } catch (err) {
            if (err.message.indexOf('circular structure')) {
              throw new Error(
                `Circular structure in "getInitialProps" result of page "${__NEXT_DATA__.page}". https://err.sh/vercel/next.js/circular-structure`
              )
            }

            throw err
          }
        }

        render() {
          const { assetPrefix, buildManifest, unstable_runtimeJS } =
            this.context._documentProps
          const disableRuntimeJS = unstable_runtimeJS === false
          const { _devOnlyInvalidateCacheQueryString } = this.context

          if (false) {
          }

          return /*#__PURE__*/ _react.default.createElement(
            _react.default.Fragment,
            null,
            !disableRuntimeJS && buildManifest.devFiles
              ? buildManifest.devFiles.map((file) =>
                  /*#__PURE__*/ _react.default.createElement('script', {
                    key: file,
                    src: `${assetPrefix}/_next/${encodeURI(file)}${_devOnlyInvalidateCacheQueryString}`,
                    nonce: this.props.nonce,
                    crossOrigin: this.props.crossOrigin || undefined,
                  })
                )
              : null,
            disableRuntimeJS
              ? null
              : /*#__PURE__*/ _react.default.createElement('script', {
                  id: '__NEXT_DATA__',
                  type: 'application/json',
                  nonce: this.props.nonce,
                  crossOrigin: this.props.crossOrigin || undefined,
                  dangerouslySetInnerHTML: {
                    __html: NextScript.getInlineScriptSource(
                      this.context._documentProps
                    ),
                  },
                }),
            false ? /*#__PURE__*/ undefined : null,
            !disableRuntimeJS && this.getPolyfillScripts(),
            disableRuntimeJS ? null : this.getDynamicChunks(),
            disableRuntimeJS ? null : this.getScripts()
          )
        }
      }

      exports.NextScript = NextScript
      NextScript.contextType = _documentContext.DocumentContext
      NextScript.propTypes = {
        nonce: _propTypes.default.string,
        crossOrigin: _propTypes.default.string,
      }
      NextScript.safariNomoduleFix =
        '!function(){var e=document,t=e.createElement("script");if(!("noModule"in t)&&"onbeforeload"in t){var n=!1;e.addEventListener("beforeload",function(e){if(e.target===t)n=!0;else if(!e.target.hasAttribute("nomodule")||!n)return;e.preventDefault()},!0),t.type="module",t.src=".",e.head.appendChild(t),t.remove()}}();'

      /***/
    },

    /***/ VOFc: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      __webpack_require__.r(__webpack_exports__)
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'default',
        function () {
          return TestPage
        }
      )
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'getStaticProps',
        function () {
          return getStaticProps
        }
      )
      /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ =
        __webpack_require__('cDcd')
      /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default =
        /*#__PURE__*/ __webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__)
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1__ =
        __webpack_require__('oyvS')
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_1___default =
        /*#__PURE__*/ __webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_1__)
      /* harmony import */ var utils_getJsonPreviewProps__WEBPACK_IMPORTED_MODULE_2__ =
        __webpack_require__('/CXo')
      /* harmony import */ var tinacms__WEBPACK_IMPORTED_MODULE_3__ =
        __webpack_require__('gGCB')
      /* harmony import */ var tinacms__WEBPACK_IMPORTED_MODULE_3___default =
        /*#__PURE__*/ __webpack_require__.n(
          tinacms__WEBPACK_IMPORTED_MODULE_3__
        )
      /* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_4__ =
        __webpack_require__('mw/K')
      /* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_4___default =
        /*#__PURE__*/ __webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_4__)

      var __jsx = react__WEBPACK_IMPORTED_MODULE_0___default.a.createElement

      function TestPage({ guidesIndex, packagesIndex }) {
        const cms = Object(tinacms__WEBPACK_IMPORTED_MODULE_3__['useCMS'])()
        return __jsx(
          'div',
          null,
          __jsx('span', null, 'CMS is ', cms.enabled ? 'Enabled' : 'Disabled'),
          __jsx('hr', null),
          __jsx(
            'button',
            {
              onClick: () => {
                fetch('/api/preview-test').then(() => window.location.reload())
              },
            },
            'Enter preview mode'
          ),
          __jsx('hr', null),
          __jsx(
            'button',
            {
              onClick: () => {
                fetch('/api/reset-preview').then(() => window.location.reload())
              },
            },
            'Exit preview mode'
          ),
          __jsx('hr', null),
          __jsx('pre', null, JSON.stringify(guidesIndex)),
          __jsx('pre', null, JSON.stringify(packagesIndex))
        )
      }
      const getStaticProps = async ({ preview }) => {
        const guides = path__WEBPACK_IMPORTED_MODULE_1___default.a.resolve(
          process.cwd(),
          './content/guides/index.md'
        )
        const pkgs = path__WEBPACK_IMPORTED_MODULE_1___default.a.resolve(
          process.cwd(),
          './content/packages.json'
        )
        return {
          props: {
            withoutGithub: true,
            preview: !!preview,
            guidesIndex:
              await fs__WEBPACK_IMPORTED_MODULE_4___default.a.readFileSync(
                guides,
                'utf8'
              ),
            packagesIndex: await Object(
              utils_getJsonPreviewProps__WEBPACK_IMPORTED_MODULE_2__[
                /* readJsonFile */ 'b'
              ]
            )(pkgs),
          },
        }
      }

      /***/
    },

    /***/ Y7Z2: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      __webpack_require__.r(__webpack_exports__)
      /* harmony export (binding) */ __webpack_require__.d(
        __webpack_exports__,
        'default',
        function () {
          return MyDocument
        }
      )
      /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ =
        __webpack_require__('cDcd')
      /* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0___default =
        /*#__PURE__*/ __webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_0__)
      /* harmony import */ var next_document__WEBPACK_IMPORTED_MODULE_1__ =
        __webpack_require__('8cZr')
      /* harmony import */ var next_document__WEBPACK_IMPORTED_MODULE_1___default =
        /*#__PURE__*/ __webpack_require__.n(
          next_document__WEBPACK_IMPORTED_MODULE_1__
        )
      /* harmony import */ var styled_components__WEBPACK_IMPORTED_MODULE_2__ =
        __webpack_require__('Dtiu')
      /* harmony import */ var styled_components__WEBPACK_IMPORTED_MODULE_2___default =
        /*#__PURE__*/ __webpack_require__.n(
          styled_components__WEBPACK_IMPORTED_MODULE_2__
        )

      var __jsx = react__WEBPACK_IMPORTED_MODULE_0___default.a.createElement

      function ownKeys(object, enumerableOnly) {
        var keys = Object.keys(object)
        if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(object)
          if (enumerableOnly)
            symbols = symbols.filter(function (sym) {
              return Object.getOwnPropertyDescriptor(object, sym).enumerable
            })
          keys.push.apply(keys, symbols)
        }
        return keys
      }

      function _objectSpread(target) {
        for (var i = 1; i < arguments.length; i++) {
          var source = arguments[i] != null ? arguments[i] : {}
          if (i % 2) {
            ownKeys(Object(source), true).forEach(function (key) {
              _defineProperty(target, key, source[key])
            })
          } else if (Object.getOwnPropertyDescriptors) {
            Object.defineProperties(
              target,
              Object.getOwnPropertyDescriptors(source)
            )
          } else {
            ownKeys(Object(source)).forEach(function (key) {
              Object.defineProperty(
                target,
                key,
                Object.getOwnPropertyDescriptor(source, key)
              )
            })
          }
        }
        return target
      }

      function _defineProperty(obj, key, value) {
        if (key in obj) {
          Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        } else {
          obj[key] = value
        }
        return obj
      }

      class MyDocument extends next_document__WEBPACK_IMPORTED_MODULE_1___default.a {
        static async getInitialProps(ctx) {
          const sheet = new styled_components__WEBPACK_IMPORTED_MODULE_2__[
            'ServerStyleSheet'
          ]()
          const originalRenderPage = ctx.renderPage

          try {
            ctx.renderPage = () =>
              originalRenderPage({
                enhanceApp: (App) => (props) =>
                  sheet.collectStyles(__jsx(App, props)),
              })

            const initialProps =
              await next_document__WEBPACK_IMPORTED_MODULE_1___default.a.getInitialProps(
                ctx
              )
            return _objectSpread(
              _objectSpread({}, initialProps),
              {},
              {
                styles: __jsx(
                  react__WEBPACK_IMPORTED_MODULE_0___default.a.Fragment,
                  null,
                  initialProps.styles,
                  sheet.getStyleElement()
                ),
              }
            )
          } finally {
            sheet.seal()
          }
        }
      }

      /***/
    },

    /***/ bzos: /***/ function (module, exports) {
      module.exports = require('url')

      /***/
    },

    /***/ cDcd: /***/ function (module, exports) {
      module.exports = require('react')

      /***/
    },

    /***/ cha2: /***/ function (
      module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      // ESM COMPAT FLAG
      __webpack_require__.r(__webpack_exports__)

      // EXTERNAL MODULE: external "react"
      var external_react_ = __webpack_require__('cDcd')
      var external_react_default =
        /*#__PURE__*/ __webpack_require__.n(external_react_)

      // EXTERNAL MODULE: ./node_modules/next/app.js
      var app = __webpack_require__('8Bbg')
      var app_default = /*#__PURE__*/ __webpack_require__.n(app)

      // EXTERNAL MODULE: external "next/head"
      var head_ = __webpack_require__('xnum')
      var head_default = /*#__PURE__*/ __webpack_require__.n(head_)

      // EXTERNAL MODULE: external "tinacms"
      var external_tinacms_ = __webpack_require__('gGCB')

      // EXTERNAL MODULE: external "next-seo"
      var external_next_seo_ = __webpack_require__('efsx')

      // EXTERNAL MODULE: ./content/siteConfig.json
      var siteConfig = __webpack_require__('51W3')

      // EXTERNAL MODULE: external "react-gtm-module"
      var external_react_gtm_module_ = __webpack_require__('hI02')
      var external_react_gtm_module_default =
        /*#__PURE__*/ __webpack_require__.n(external_react_gtm_module_)

      // EXTERNAL MODULE: external "@tinacms/styles"
      var styles_ = __webpack_require__('SVlN')

      // CONCATENATED MODULE: ./utils/plugins/browser-storage-api/BrowserStorageApi.ts
      function _defineProperty(obj, key, value) {
        if (key in obj) {
          Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        } else {
          obj[key] = value
        }
        return obj
      }

      class BrowserStorageApi {
        // should work with window.localStorage or window.sessionStorage
        constructor(storage, namespace = null) {
          _defineProperty(this, 'data', {})

          _defineProperty(this, 'timeout', null)

          _defineProperty(this, 'namespace', void 0)

          _defineProperty(this, 'storage', void 0)

          if (!namespace) {
            this.namespace = `tina-local-storage:${window.location.hostname}`
          } else {
            this.namespace = namespace
          }

          this.storage = storage
          const persistedData = this.storage.getItem(this.namespace)

          if (persistedData) {
            this.data = JSON.parse(persistedData)
          }
        }

        save(id, content) {
          this.data[id] = content
          this.debouncePersist()
        }

        load(id) {
          return this.data[id]
        }

        clear(id) {
          delete this.data[id]
          this.debouncePersist()
        }

        debouncePersist() {
          this.timeout && clearTimeout(this.timeout)
          this.timeout = setTimeout(this.persist.bind(this), 1000)
        }

        persist() {
          this.storage.setItem(this.namespace, JSON.stringify(this.data))
        }
      }
      // EXTERNAL MODULE: external "react-tinacms-github"
      var external_react_tinacms_github_ = __webpack_require__('Bf2M')

      // EXTERNAL MODULE: external "styled-components"
      var external_styled_components_ = __webpack_require__('Dtiu')

      // CONCATENATED MODULE: ./components/styles/GlobalStyle.tsx

      const CssReset = Object(external_styled_components_['css'])([
        'html,body,p,ol,ul,li,dl,dt,dd,blockquote,figure,fieldset,legend,textarea,pre,iframe,hr,h1,h2,h3,h4,h5,h6{margin:0;padding:0;}ul{list-style:none;}button,input,select,textarea{margin:0;}html{box-sizing:border-box;}*,*:before,*:after{box-sizing:inherit;}img,video{height:auto;max-width:100%;}iframe{border:0;}table{border-collapse:collapse;border-spacing:0;}td,th{padding:0;text-align:left;}',
      ])
      const GlobalStyle = external_react_default.a
        .memo(external_styled_components_['createGlobalStyle']`
  ${CssReset}

  html {
    font-size: 81.25%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
      "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
      "Helvetica Neue", sans-serif;
    line-height: 1.6;
    width: 100%;
    overflow-x: hidden;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
    -webkit-font-smooth: 'antialiased';
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;

    @media (min-width: 450px) {
      font-size: 87.5%;
    }

    @media (min-width: 685px) {
      font-size: 100%;
    }

    /* Color */
    --color-primary: #EC4815;
    --color-primary-dark: #CE411D;
    --color-secondary: #302454;
    --color-secondary-dark: #241748;
    --color-seafoam: #E6FAF8;
    --color-seafoam-dark: #B4F4E0;
    --color-light: #FAFAFA;
    --color-light-dark: #E9E9EC;
    --color-grey: #595959;
    --color-grey-dark: #404040;

    /* Layout */
    --breakpoint-small: 400px;
    --breakpoint-medium: 800px;
    --breakpoint-large: 1200px;

    /* Typography */
    --font-tuner: 'tuner-regular', -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
      "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
      "Helvetica Neue", sans-serif;

    * {
      box-sizing: inherit;
      font-variant-numeric: inherit;
      font-family: inherit;
      line-height: inherit;
      font-size: 100%;
      font-weight: normal;
      scrollbar-width: thin;
      scrollbar-color: #E1DDEC var(--color-light);
      
      &::-webkit-scrollbar {
        width: 9px;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
        border-left: 1px solid var(--color-light-dark);
        border-right: 1px solid var(--color-light-dark);
      }
      &::-webkit-scrollbar-thumb {
        background-color: #E1DDEC;
        border-radius: 0;
        border: none;
      }
    }
  }
`)
      // EXTERNAL MODULE: ./components/styles/fontImports.css
      var fontImports = __webpack_require__('uPDU')

      // EXTERNAL MODULE: external "path"
      var external_path_ = __webpack_require__('oyvS')
      var external_path_default =
        /*#__PURE__*/ __webpack_require__.n(external_path_)

      // CONCATENATED MODULE: ./pages/_app.tsx
      var __jsx = external_react_default.a.createElement

      // the following line will cause all content files to be available in a serverless context

      external_path_default.a.resolve('./content/')

      const MainLayout = ({ Component, pageProps }) => {
        const tinaConfig = {
          enabled: pageProps.preview,
          toolbar: pageProps.preview,
          apis: {
            github: new external_react_tinacms_github_['GithubClient']({
              proxy: '/api/proxy-github',
              authCallbackRoute: '/api/create-github-access-token',
              clientId: process.env.GITHUB_CLIENT_ID,
              baseRepoFullName: process.env.BASE_REPO_FULL_NAME,
            }),
            storage: false ? undefined : {},
          },
        }
        const cms = external_react_default.a.useMemo(
          () => new external_tinacms_['TinaCMS'](tinaConfig),
          []
        )
        Object(external_react_['useEffect'])(() => {
          Promise.resolve(/* import() */)
            .then(__webpack_require__.t.bind(null, 'OsmD', 7))
            .then(({ DateFieldPlugin }) => {
              cms.plugins.add(DateFieldPlugin)
            })
        }, [pageProps.preview])

        const enterEditMode = async () => {
          const token = localStorage.getItem('tinacms-github-token') || null
          const headers = new Headers()

          if (token) {
            headers.append('Authorization', 'Bearer ' + token)
          }

          const response = await fetch(`/api/preview`, {
            headers,
          })
          const data = await response.json()

          if (response.status === 200) {
            window.location.reload()
          } else {
            throw new Error(data.message)
          }
        }

        const exitEditMode = () => {
          fetch(`/api/reset-preview`).then(() => {
            window.location.reload()
          })
        }

        const loadFonts = useShouldLoadFont(cms)
        return __jsx(
          external_tinacms_['TinaProvider'],
          {
            cms: cms,
            styled: false,
          },
          __jsx(styles_['GlobalStyles'], null),
          loadFonts && __jsx(styles_['FontLoader'], null),
          __jsx(
            external_tinacms_['ModalProvider'],
            null,
            __jsx(
              MaybeGithubProvider,
              {
                useGithub: !pageProps.withoutGithub,
                onLogin: enterEditMode,
                onLogout: exitEditMode,
                error: pageProps.error,
              },
              __jsx(external_next_seo_['DefaultSeo'], {
                title: siteConfig.seoDefaultTitle,
                titleTemplate: '%s | ' + siteConfig.title,
                description: siteConfig.description,
                openGraph: {
                  type: 'website',
                  locale: 'en_CA',
                  url: siteConfig.siteUrl,
                  site_name: siteConfig.title,
                  images: [
                    {
                      url: 'https://tinacms.org/img/tina-twitter-share.png',
                      width: 1200,
                      height: 628,
                      alt: `TinaCMS`,
                    },
                  ],
                },
                twitter: {
                  handle: siteConfig.social.twitterHandle,
                  site: siteConfig.social.twitterHandle,
                  cardType: 'summary_large_image',
                },
              }),
              __jsx(
                head_default.a,
                null,
                __jsx('link', {
                  rel: 'shortcut icon',
                  href: '/favicon/favicon.ico',
                }),
                __jsx('meta', {
                  name: 'theme-color',
                  content: '#E6FAF8',
                })
              ),
              __jsx(GlobalStyle, null),
              __jsx(Component, pageProps)
            )
          )
        )
      }

      const MaybeGithubProvider = ({
        useGithub,
        enterEditMode,
        exitEditMode,
        error,
        children,
      }) => {
        if (useGithub) {
          return __jsx(
            external_react_tinacms_github_['TinacmsGithubProvider'],
            {
              onLogin: enterEditMode,
              onLogout: exitEditMode,
              error: error,
            },
            children
          )
        }

        return children
      }

      function useShouldLoadFont(cms) {
        const [enabled, setEnabled] = external_react_default.a.useState(
          cms.enabled
        )
        external_react_default.a.useEffect(() => {
          if (cms.enabled) return
          return cms.events.subscribe('cms:enable', () => {
            setEnabled(true)
          })
        }, [])
        return enabled
      }

      class _app_Site extends app_default.a {
        componentDidMount() {
          if (true) {
            external_react_gtm_module_default.a.initialize({
              gtmId: process.env.GTM_ID,
            })
          }
        }

        render() {
          const { Component, pageProps } = this.props
          return __jsx(MainLayout, {
            Component: Component,
            pageProps: pageProps,
          })
        }
      }

      /* harmony default export */ var _app = (__webpack_exports__['default'] =
        _app_Site)

      /***/
    },

    /***/ ef3A: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/send-html')

      /***/
    },

    /***/ efsx: /***/ function (module, exports) {
      module.exports = require('next-seo')

      /***/
    },

    /***/ gGCB: /***/ function (module, exports) {
      module.exports = require('tinacms')

      /***/
    },

    /***/ hI02: /***/ function (module, exports) {
      module.exports = require('react-gtm-module')

      /***/
    },

    /***/ jNMD: /***/ function (module, exports) {
      module.exports = require('next-tinacms-github')

      /***/
    },

    /***/ 'jle/': /***/ function (module, exports) {
      module.exports = require('os')

      /***/
    },

    /***/ kYf9: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/lib/utils.js')

      /***/
    },

    /***/ mctB: /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/node-polyfill-fetch')

      /***/
    },

    /***/ 'mw/K': /***/ function (module, exports) {
      module.exports = require('fs')

      /***/
    },

    /***/ 'nMq/': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/lib/document-context.js')

      /***/
    },

    /***/ oyvS: /***/ function (module, exports) {
      module.exports = require('path')

      /***/
    },

    /***/ rf6O: /***/ function (module, exports) {
      module.exports = require('prop-types')

      /***/
    },

    /***/ 'ri/Y': /***/ function (module, exports) {
      module.exports = require('next/dist/next-server/server/utils.js')

      /***/
    },

    /***/ uPDU: /***/ function (module, exports) {
      /***/
    },

    /***/ xnum: /***/ function (module, exports) {
      module.exports = require('next/head')

      /***/
    },

    /******/
  }
)
