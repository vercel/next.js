/*! iFrame Resizer (iframeSizer.min.js ) - v4.2.11 - 2020-06-02
 *  Desc: Force cross domain iframes to size to content.
 *  Requires: iframeResizer.contentWindow.min.js to be loaded into the target frame.
 *  Copyright: (c) 2020 David J. Bradshaw - dave@bradshaw.net
 *  License: MIT
 */
!(function (e) {
  if ('undefined' != typeof window) {
    var n,
      i = 0,
      t = !1,
      o = !1,
      r = 'message'.length,
      a = '[iFrameSizer]',
      s = a.length,
      d = null,
      c = window.requestAnimationFrame,
      u = { max: 1, scroll: 1, bodyScroll: 1, documentElementScroll: 1 },
      f = {},
      l = null,
      m = {
        autoResize: !0,
        bodyBackground: null,
        bodyMargin: null,
        bodyMarginV1: 8,
        bodyPadding: null,
        checkOrigin: !0,
        inPageLinks: !1,
        enablePublicMethods: !0,
        heightCalculationMethod: 'bodyOffset',
        id: 'iFrameResizer',
        interval: 32,
        log: !1,
        maxHeight: 1 / 0,
        maxWidth: 1 / 0,
        minHeight: 0,
        minWidth: 0,
        resizeFrom: 'parent',
        scrolling: !1,
        sizeHeight: !0,
        sizeWidth: !1,
        warningTimeout: 5e3,
        tolerance: 0,
        widthCalculationMethod: 'scroll',
        onClose: function () {
          return !0
        },
        onClosed: function () {},
        onInit: function () {},
        onMessage: function () {
          I('onMessage function not defined')
        },
        onResized: function () {},
        onScroll: function () {
          return !0
        },
      },
      g = {}
    window.jQuery &&
      ((n = window.jQuery).fn
        ? n.fn.iFrameResize ||
          (n.fn.iFrameResize = function (e) {
            return this.filter('iframe')
              .each(function (n, i) {
                H(i, e)
              })
              .end()
          })
        : v('', 'Unable to bind to jQuery, it is not fully loaded.')),
      'function' == typeof define && define.amd
        ? define([], B)
        : 'object' == typeof module &&
          'object' == typeof module.exports &&
          (module.exports = B()),
      (window.iFrameResize = window.iFrameResize || B())
  }
  function h() {
    return (
      window.MutationObserver ||
      window.WebKitMutationObserver ||
      window.MozMutationObserver
    )
  }
  function w(e, n, i) {
    e.addEventListener(n, i, !1)
  }
  function p(e, n, i) {
    e.removeEventListener(n, i, !1)
  }
  function b(e) {
    return f[e] ? f[e].log : t
  }
  function y(e, n) {
    x('log', e, n, b(e))
  }
  function v(e, n) {
    x('info', e, n, b(e))
  }
  function I(e, n) {
    x('warn', e, n, !0)
  }
  function x(e, n, i, t) {
    !0 === t &&
      'object' == typeof window.console &&
      console[e](
        (function (e) {
          return (
            a +
            '[' +
            (function (e) {
              var n = 'Host page: ' + e
              return (
                window.top !== window.self &&
                  (n =
                    window.parentIFrame && window.parentIFrame.getId
                      ? window.parentIFrame.getId() + ': ' + e
                      : 'Nested host page: ' + e),
                n
              )
            })(e) +
            ']'
          )
        })(n),
        i
      )
  }
  function F(e) {
    function n() {
      i('Height'),
        i('Width'),
        C(
          function () {
            W(B), R(L), m('onResized', B)
          },
          B,
          'init'
        )
    }
    function i(e) {
      var n = Number(f[L]['max' + e]),
        i = Number(f[L]['min' + e]),
        t = e.toLowerCase(),
        o = Number(B[t])
      y(L, 'Checking ' + t + ' is in range ' + i + '-' + n),
        o < i && ((o = i), y(L, 'Set ' + t + ' to min value')),
        n < o && ((o = n), y(L, 'Set ' + t + ' to max value')),
        (B[t] = '' + o)
    }
    function t(e) {
      return A.substr(A.indexOf(':') + r + e)
    }
    function o(e, n) {
      !(function (e, n, i) {
        g[i] ||
          (g[i] = setTimeout(function () {
            ;(g[i] = null), e()
          }, 32))
      })(
        function () {
          N(
            'Send Page Info',
            'pageInfo:' +
              (function () {
                var e = document.body.getBoundingClientRect(),
                  n = B.iframe.getBoundingClientRect()
                return JSON.stringify({
                  iframeHeight: n.height,
                  iframeWidth: n.width,
                  clientHeight: Math.max(
                    document.documentElement.clientHeight,
                    window.innerHeight || 0
                  ),
                  clientWidth: Math.max(
                    document.documentElement.clientWidth,
                    window.innerWidth || 0
                  ),
                  offsetTop: parseInt(n.top - e.top, 10),
                  offsetLeft: parseInt(n.left - e.left, 10),
                  scrollTop: window.pageYOffset,
                  scrollLeft: window.pageXOffset,
                  documentHeight: document.documentElement.clientHeight,
                  documentWidth: document.documentElement.clientWidth,
                  windowHeight: window.innerHeight,
                  windowWidth: window.innerWidth,
                })
              })(),
            e,
            n
          )
        },
        0,
        n
      )
    }
    function c(e) {
      var n = e.getBoundingClientRect()
      return (
        O(L),
        {
          x: Math.floor(Number(n.left) + Number(d.x)),
          y: Math.floor(Number(n.top) + Number(d.y)),
        }
      )
    }
    function u(e) {
      var n = e ? c(B.iframe) : { x: 0, y: 0 },
        i = { x: Number(B.width) + n.x, y: Number(B.height) + n.y }
      y(
        L,
        'Reposition requested from iFrame (offset x:' + n.x + ' y:' + n.y + ')'
      ),
        window.top !== window.self
          ? window.parentIFrame
            ? window.parentIFrame['scrollTo' + (e ? 'Offset' : '')](i.x, i.y)
            : I(
                L,
                'Unable to scroll to requested position, window.parentIFrame not found'
              )
          : ((d = i), l(), y(L, '--'))
    }
    function l() {
      !1 !== m('onScroll', d) ? R(L) : T()
    }
    function m(e, n) {
      return M(L, e, n)
    }
    var h,
      b,
      x,
      F,
      k,
      H,
      j,
      P,
      A = e.data,
      B = {},
      L = null
    '[iFrameResizerChild]Ready' === A
      ? (function () {
          for (var e in f) N('iFrame requested init', S(e), f[e].iframe, e)
        })()
      : a === ('' + A).substr(0, s) && A.substr(s).split(':')[0] in f
      ? ((H = (k = A.substr(s).split(':'))[1] ? parseInt(k[1], 10) : 0),
        (j = f[k[0]] && f[k[0]].iframe),
        (P = getComputedStyle(j)),
        (B = {
          iframe: j,
          id: k[0],
          height:
            H +
            (function (e) {
              return 'border-box' !== e.boxSizing
                ? 0
                : (e.paddingTop ? parseInt(e.paddingTop, 10) : 0) +
                    (e.paddingBottom ? parseInt(e.paddingBottom, 10) : 0)
            })(P) +
            (function (e) {
              return 'border-box' !== e.boxSizing
                ? 0
                : (e.borderTopWidth ? parseInt(e.borderTopWidth, 10) : 0) +
                    (e.borderBottomWidth
                      ? parseInt(e.borderBottomWidth, 10)
                      : 0)
            })(P),
          width: k[2],
          type: k[3],
        }),
        (L = B.id),
        f[L] && (f[L].loaded = !0),
        (F = B.type in { true: 1, false: 1, undefined: 1 }) &&
          y(L, 'Ignoring init message from meta parent page'),
        !F &&
          ((x = !0),
          f[(b = L)] ||
            ((x = !1),
            I(B.type + ' No settings for ' + b + '. Message was: ' + A)),
          x) &&
          (y(L, 'Received: ' + A),
          (h = !0),
          null === B.iframe &&
            (I(L, 'IFrame (' + B.id + ') not found'), (h = !1)),
          h &&
            (function () {
              var n,
                i = e.origin,
                t = f[L] && f[L].checkOrigin
              if (
                t &&
                '' + i != 'null' &&
                !(t.constructor === Array
                  ? (function () {
                      var e = 0,
                        n = !1
                      for (
                        y(
                          L,
                          'Checking connection is from allowed list of origins: ' +
                            t
                        );
                        e < t.length;
                        e++
                      )
                        if (t[e] === i) {
                          n = !0
                          break
                        }
                      return n
                    })()
                  : ((n = f[L] && f[L].remoteHost),
                    y(L, 'Checking connection is from: ' + n),
                    i === n))
              )
                throw new Error(
                  'Unexpected message received from: ' +
                    i +
                    ' for ' +
                    B.iframe.id +
                    '. Message was: ' +
                    e.data +
                    '. This error can be disabled by setting the checkOrigin: false option or by providing of array of trusted domains.'
                )
              return !0
            })() &&
            (function () {
              switch (
                (f[L] && f[L].firstRun && f[L] && (f[L].firstRun = !1), B.type)
              ) {
                case 'close':
                  z(B.iframe)
                  break
                case 'message':
                  !(function (e) {
                    y(
                      L,
                      'onMessage passed: {iframe: ' +
                        B.iframe.id +
                        ', message: ' +
                        e +
                        '}'
                    ),
                      m('onMessage', {
                        iframe: B.iframe,
                        message: JSON.parse(e),
                      }),
                      y(L, '--')
                  })(t(6))
                  break
                case 'autoResize':
                  f[L].autoResize = JSON.parse(t(9))
                  break
                case 'scrollTo':
                  u(!1)
                  break
                case 'scrollToOffset':
                  u(!0)
                  break
                case 'pageInfo':
                  o(f[L] && f[L].iframe, L),
                    (function () {
                      function e(e, t) {
                        function r() {
                          f[i] ? o(f[i].iframe, i) : n()
                        }
                        ;['scroll', 'resize'].forEach(function (n) {
                          y(i, e + n + ' listener for sendPageInfo'),
                            t(window, n, r)
                        })
                      }
                      function n() {
                        e('Remove ', p)
                      }
                      var i = L
                      e('Add ', w), f[i] && (f[i].stopPageInfo = n)
                    })()
                  break
                case 'pageInfoStop':
                  f[L] &&
                    f[L].stopPageInfo &&
                    (f[L].stopPageInfo(), delete f[L].stopPageInfo)
                  break
                case 'inPageLink':
                  !(function (e) {
                    var n,
                      i = e.split('#')[1] || '',
                      t = decodeURIComponent(i),
                      o =
                        document.getElementById(t) ||
                        document.getElementsByName(t)[0]
                    o
                      ? ((n = c(o)),
                        y(
                          L,
                          'Moving to in page link (#' +
                            i +
                            ') at x: ' +
                            n.x +
                            ' y: ' +
                            n.y
                        ),
                        (d = { x: n.x, y: n.y }),
                        l(),
                        y(L, '--'))
                      : window.top !== window.self
                      ? window.parentIFrame
                        ? window.parentIFrame.moveToAnchor(i)
                        : y(
                            L,
                            'In page link #' +
                              i +
                              ' not found and window.parentIFrame not found'
                          )
                      : y(L, 'In page link #' + i + ' not found')
                  })(t(9))
                  break
                case 'reset':
                  E(B)
                  break
                case 'init':
                  n(), m('onInit', B.iframe)
                  break
                default:
                  n()
              }
            })()))
      : v(L, 'Ignored: ' + A)
  }
  function M(e, n, i) {
    var t = null,
      o = null
    if (f[e]) {
      if ('function' != typeof (t = f[e][n]))
        throw new TypeError(n + ' on iFrame[' + e + '] is not a function')
      o = t(i)
    }
    return o
  }
  function k(e) {
    var n = e.id
    delete f[n]
  }
  function z(e) {
    var n = e.id
    if (!1 !== M(n, 'onClose', n)) {
      y(n, 'Removing iFrame: ' + n)
      try {
        e.parentNode && e.parentNode.removeChild(e)
      } catch (e) {
        I(e)
      }
      M(n, 'onClosed', n), y(n, '--'), k(e)
    } else y(n, 'Close iframe cancelled by onClose event')
  }
  function O(n) {
    null === d &&
      y(
        n,
        'Get page position: ' +
          (d = {
            x:
              window.pageXOffset !== e
                ? window.pageXOffset
                : document.documentElement.scrollLeft,
            y:
              window.pageYOffset !== e
                ? window.pageYOffset
                : document.documentElement.scrollTop,
          }).x +
          ',' +
          d.y
      )
  }
  function R(e) {
    null !== d &&
      (window.scrollTo(d.x, d.y),
      y(e, 'Set page position: ' + d.x + ',' + d.y),
      T())
  }
  function T() {
    d = null
  }
  function E(e) {
    y(
      e.id,
      'Size reset requested by ' + ('init' === e.type ? 'host page' : 'iFrame')
    ),
      O(e.id),
      C(
        function () {
          W(e), N('reset', 'reset', e.iframe, e.id)
        },
        e,
        'reset'
      )
  }
  function W(e) {
    function n(n) {
      !(function (n) {
        e.id
          ? ((e.iframe.style[n] = e[n] + 'px'),
            y(e.id, 'IFrame (' + i + ') ' + n + ' set to ' + e[n] + 'px'))
          : y('undefined', 'messageData id not set')
      })(n),
        (function (n) {
          o ||
            '0' !== e[n] ||
            ((o = !0),
            y(i, 'Hidden iFrame detected, creating visibility listener'),
            (function () {
              function e() {
                Object.keys(f).forEach(function (e) {
                  !(function (e) {
                    function n(n) {
                      return '0px' === (f[e] && f[e].iframe.style[n])
                    }
                    f[e] &&
                      null !== f[e].iframe.offsetParent &&
                      (n('height') || n('width')) &&
                      N('Visibility change', 'resize', f[e].iframe, e)
                  })(e)
                })
              }
              function n(n) {
                y(
                  'window',
                  'Mutation observed: ' + n[0].target + ' ' + n[0].type
                ),
                  j(e, 16)
              }
              var i,
                t = h()
              t &&
                ((i = document.querySelector('body')),
                new t(n).observe(i, {
                  attributes: !0,
                  attributeOldValue: !1,
                  characterData: !0,
                  characterDataOldValue: !1,
                  childList: !0,
                  subtree: !0,
                }))
            })())
        })(n)
    }
    var i = e.iframe.id
    f[i] && (f[i].sizeHeight && n('height'), f[i].sizeWidth && n('width'))
  }
  function C(e, n, i) {
    i !== n.type && c && !window.jasmine
      ? (y(n.id, 'Requesting animation frame'), c(e))
      : e()
  }
  function N(e, n, i, t, o) {
    var r,
      s = !1
    ;(t = t || i.id),
      f[t] &&
        (i && 'contentWindow' in i && null !== i.contentWindow
          ? ((r = f[t] && f[t].targetOrigin),
            y(
              t,
              '[' +
                e +
                '] Sending msg to iframe[' +
                t +
                '] (' +
                n +
                ') targetOrigin: ' +
                r
            ),
            i.contentWindow.postMessage(a + n, r))
          : I(t, '[' + e + '] IFrame(' + t + ') not found'),
        o &&
          f[t] &&
          f[t].warningTimeout &&
          (f[t].msgTimeout = setTimeout(function () {
            !f[t] ||
              f[t].loaded ||
              s ||
              ((s = !0),
              I(
                t,
                'IFrame has not responded within ' +
                  f[t].warningTimeout / 1e3 +
                  ' seconds. Check iFrameResizer.contentWindow.js has been loaded in iFrame. This message can be ignored if everything is working, or you can set the warningTimeout option to a higher value or zero to suppress this warning.'
              ))
          }, f[t].warningTimeout)))
  }
  function S(e) {
    return (
      e +
      ':' +
      f[e].bodyMarginV1 +
      ':' +
      f[e].sizeWidth +
      ':' +
      f[e].log +
      ':' +
      f[e].interval +
      ':' +
      f[e].enablePublicMethods +
      ':' +
      f[e].autoResize +
      ':' +
      f[e].bodyMargin +
      ':' +
      f[e].heightCalculationMethod +
      ':' +
      f[e].bodyBackground +
      ':' +
      f[e].bodyPadding +
      ':' +
      f[e].tolerance +
      ':' +
      f[e].inPageLinks +
      ':' +
      f[e].resizeFrom +
      ':' +
      f[e].widthCalculationMethod
    )
  }
  function H(n, o) {
    var r,
      a,
      s,
      d,
      c,
      l,
      g =
        ('' === (a = n.id) &&
          ((n.id =
            ((r = (o && o.id) || m.id + i++),
            null !== document.getElementById(r) && (r += i++),
            (a = r))),
          (t = (o || {}).log),
          y(a, 'Added missing iframe ID: ' + a + ' (' + n.src + ')')),
        a)
    function p(e) {
      1 / 0 !== f[g][e] &&
        0 !== f[g][e] &&
        ((n.style[e] = f[g][e] + 'px'),
        y(g, 'Set ' + e + ' = ' + f[g][e] + 'px'))
    }
    function b(e) {
      if (f[g]['min' + e] > f[g]['max' + e])
        throw new Error(
          'Value for min' + e + ' can not be greater than max' + e
        )
    }
    g in f && 'iFrameResizer' in n
      ? I(g, 'Ignored iFrame, already setup.')
      : ((l = (l = o) || {}),
        (f[g] = {
          firstRun: !0,
          iframe: n,
          remoteHost: n.src && n.src.split('/').slice(0, 3).join('/'),
        }),
        (function (e) {
          if ('object' != typeof l)
            throw new TypeError('Options is not an object')
        })(),
        Object.keys(l).forEach(function (e) {
          var n = e.split('Callback')
          if (2 === n.length) {
            var i = 'on' + n[0].charAt(0).toUpperCase() + n[0].slice(1)
            ;(this[i] = this[e]),
              delete this[e],
              I(
                g,
                "Deprecated: '" +
                  e +
                  "' has been renamed '" +
                  i +
                  "'. The old method will be removed in the next major version."
              )
          }
        }, l),
        (function (e) {
          for (var n in m)
            Object.prototype.hasOwnProperty.call(m, n) &&
              (f[g][n] = Object.prototype.hasOwnProperty.call(e, n)
                ? e[n]
                : m[n])
        })(l),
        f[g] &&
          (f[g].targetOrigin =
            !0 === f[g].checkOrigin
              ? (function (e) {
                  return '' === e ||
                    null !== e.match(/^(about:blank|javascript:|file:\/\/)/)
                    ? '*'
                    : e
                })(f[g].remoteHost)
              : '*'),
        (function () {
          switch (
            (y(
              g,
              'IFrame scrolling ' +
                (f[g] && f[g].scrolling ? 'enabled' : 'disabled') +
                ' for ' +
                g
            ),
            (n.style.overflow =
              !1 === (f[g] && f[g].scrolling) ? 'hidden' : 'auto'),
            f[g] && f[g].scrolling)
          ) {
            case 'omit':
              break
            case !0:
              n.scrolling = 'yes'
              break
            case !1:
              n.scrolling = 'no'
              break
            default:
              n.scrolling = f[g] ? f[g].scrolling : 'no'
          }
        })(),
        b('Height'),
        b('Width'),
        p('maxHeight'),
        p('minHeight'),
        p('maxWidth'),
        p('minWidth'),
        ('number' != typeof (f[g] && f[g].bodyMargin) &&
          '0' !== (f[g] && f[g].bodyMargin)) ||
          ((f[g].bodyMarginV1 = f[g].bodyMargin),
          (f[g].bodyMargin = f[g].bodyMargin + 'px')),
        (s = S(g)),
        (c = h()) &&
          ((d = c),
          n.parentNode &&
            new d(function (e) {
              e.forEach(function (e) {
                Array.prototype.slice
                  .call(e.removedNodes)
                  .forEach(function (e) {
                    e === n && z(n)
                  })
              })
            }).observe(n.parentNode, { childList: !0 })),
        w(n, 'load', function () {
          var i, t
          N('iFrame.onload', s, n, e, !0),
            (i = f[g] && f[g].firstRun),
            (t = f[g] && f[g].heightCalculationMethod in u),
            !i && t && E({ iframe: n, height: 0, width: 0, type: 'init' })
        }),
        N('init', s, n, e, !0),
        f[g] &&
          (f[g].iframe.iFrameResizer = {
            close: z.bind(null, f[g].iframe),
            removeListeners: k.bind(null, f[g].iframe),
            resize: N.bind(null, 'Window resize', 'resize', f[g].iframe),
            moveToAnchor: function (e) {
              N('Move to anchor', 'moveToAnchor:' + e, f[g].iframe, g)
            },
            sendMessage: function (e) {
              N(
                'Send Message',
                'message:' + (e = JSON.stringify(e)),
                f[g].iframe,
                g
              )
            },
          }))
  }
  function j(e, n) {
    null === l &&
      (l = setTimeout(function () {
        ;(l = null), e()
      }, n))
  }
  function P() {
    'hidden' !== document.visibilityState &&
      (y('document', 'Trigger event: Visiblity change'),
      j(function () {
        A('Tab Visable', 'resize')
      }, 16))
  }
  function A(e, n) {
    Object.keys(f).forEach(function (i) {
      !(function (e) {
        return (
          f[e] &&
          'parent' === f[e].resizeFrom &&
          f[e].autoResize &&
          !f[e].firstRun
        )
      })(i) || N(e, n, f[i].iframe, i)
    })
  }
  function B() {
    function n(e, n) {
      n &&
        ((function () {
          if (!n.tagName)
            throw new TypeError('Object is not a valid DOM element')
          if ('IFRAME' !== n.tagName.toUpperCase())
            throw new TypeError(
              'Expected <IFRAME> tag, found <' + n.tagName + '>'
            )
        })(),
        H(n, e),
        i.push(n))
    }
    var i
    return (
      (function () {
        var e,
          n = ['moz', 'webkit', 'o', 'ms']
        for (e = 0; e < n.length && !c; e += 1)
          c = window[n[e] + 'RequestAnimationFrame']
        c
          ? (c = c.bind(window))
          : y('setup', 'RequestAnimationFrame not supported')
      })(),
      w(window, 'message', F),
      w(window, 'resize', function () {
        var e
        y('window', 'Trigger event: ' + (e = 'resize')),
          j(function () {
            A('Window ' + e, 'resize')
          }, 16)
      }),
      w(document, 'visibilitychange', P),
      w(document, '-webkit-visibilitychange', P),
      function (t, o) {
        switch (
          ((i = []),
          (function (e) {
            e &&
              e.enablePublicMethods &&
              I(
                'enablePublicMethods option has been removed, public methods are now always available in the iFrame'
              )
          })(t),
          typeof o)
        ) {
          case 'undefined':
          case 'string':
            Array.prototype.forEach.call(
              document.querySelectorAll(o || 'iframe'),
              n.bind(e, t)
            )
            break
          case 'object':
            n(t, o)
            break
          default:
            throw new TypeError('Unexpected data type (' + typeof o + ')')
        }
        return i
      }
    )
  }
})()
