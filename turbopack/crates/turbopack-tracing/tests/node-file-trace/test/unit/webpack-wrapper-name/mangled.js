;(function () {
  var exports = {}
  exports.id = 405
  exports.ids = [405]
  exports.modules = {
    /***/ 912: /***/ function () {
      /*!
       * fullpage.js Fading Effect Extension 0.1.2 for fullPage.js v3
       * https://github.com/alvarotrigo/fullPage.js
       *
       * @license This code has been bought from www.alvarotrigo.com/fullPage/extensions/ and it is not free to use or distribute.
       * Copyright (C) 2016 alvarotrigo.com - A project by Alvaro Trigo
       */

      /* eslint-disable */
      window.fp_fadingEffectExtension = function () {
        var n,
          o,
          a,
          l,
          e = this,
          r = window.fp_utils,
          s = window.fullpage_api,
          c = r.$,
          t = s.getFullpageData(),
          f = t.options,
          d = t.internals,
          i = f.scrollingSpeed,
          u = '.fullpage-wrapper',
          p = '.active',
          m = '.fp-section',
          v = m + p,
          g = '.fp-slide',
          w = '.fp-slidesContainer',
          E = g + p,
          h = 'fp-fading-animations',
          y = '#' + h,
          S = 'fp-fading-sheet',
          T = '#' + S

        function x(e) {
          e.detail ? ((l = !1), C()) : ((l = a.autoScrolling), N())
        }

        function O() {
          var e
          ;((e = c(u)[0]).addEventListener('afterResponsive', x),
            e.addEventListener('destroy', C))
          var t = f.scrollOverflowHandler
          ;((f.scrollOverflowHandler = null),
            (a = r.deepExtend({}, f)),
            (l = a.autoScrolling),
            (f.scrollOverflowHandler = t),
            (a.scrollOverflowHandler = t),
            (f.scrollBar = !1),
            b('sections') && s.setAutoScrolling(!0))
          var n = b('slides') ? L(g) : '',
            i = b('sections') ? L(m) : ''
          ;(f.fadingEffect && A(S, i + n),
            d.removeAnimation(c(w)),
            clearTimeout(o),
            (o = setTimeout(B, 300)))
        }

        function b(e) {
          return !0 === f.fadingEffect || f.fadingEffect === e
        }

        function A(e, t) {
          if (!c('#' + e).length) {
            var n = document.head || document.getElementsByTagName('head')[0]
            r.appendTo(
              ((i = e),
              (o = t),
              ((a = document.createElement('style')).type = 'text/css'),
              (a.id = i),
              a.styleSheet
                ? (a.styleSheet.cssText = o)
                : a.appendChild(document.createTextNode(o)),
              a),
              n
            )
          }

          var i, o, a
        }

        function B() {
          n = 'all ' + i + 'ms ' + f.easingcss3
          var e = b('slides') ? H(g) : '',
            t = b('sections') ? H(m) : ''
          A(h, e + t)
        }

        function H(e) {
          return e + '{-webkit-transition: ' + n + ';transition: ' + n + ';}'
        }

        function L(e) {
          return (
            (e === g
              ? '.fp-slidesContainer {width: 100% !important;transform: none!important;}'
              : '') +
            e +
            '{width: 100% !important;position: absolute !important;left: 0;top: 0;visibility: hidden;opacity: 0;}' +
            e +
            '.active{visibility: visible;opacity: 1;z-index: 1}'
          )
        }

        function C() {
          if ((r.remove(c(y)), _())) {
            var e = c(E, c(v)[0])[0],
              t = c(w, c(v)[0])
            ;(d.removeAnimation(t),
              r.remove(c(T)),
              (f.scrollBar = a.scrollBar),
              s.setAutoScrolling(l),
              null != e && d.silentLandscapeScroll(e))
          }
        }

        function _() {
          return c(T).length
        }

        function N() {
          ;((f.fadingEffect = a.fadingEffect),
            _() || (O(), window.scrollTo(0, 0), d.silentScroll(0)))
        }

        ;((e.update = function (e) {
          ;(r.remove(c(y)), (i = e), B())
        }),
          (e.turnOn = N),
          (e.turnOff = C),
          (e.apply = O),
          (e.c = d.c))
        var k = e['common'.charAt(0)]
        return (
          'complete' === document.readyState && k('fadingEffect'),
          window.addEventListener('load', function () {
            k('fadingEffect')
          }),
          e
        )
      }

      /***/
    },
  }
  // load runtime
  var __webpack_require__ = require('../webpack-runtime.js')
  __webpack_require__.C(exports)
  var __webpack_exec__ = function (moduleId) {
    return __webpack_require__((__webpack_require__.s = moduleId))
  }
  var __webpack_exports__ = __webpack_exec__(3178)
  module.exports = __webpack_exports__
})()
