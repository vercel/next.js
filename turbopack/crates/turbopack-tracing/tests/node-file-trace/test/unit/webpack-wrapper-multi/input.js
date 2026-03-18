;(function () {
  var exports = {}
  exports.id = 405
  exports.ids = [405]
  exports.modules = {
    /***/ 474: /***/ function (
      __unused_webpack_module,
      __webpack_exports__,
      __webpack_require__
    ) {
      'use strict'
      __webpack_require__.r(__webpack_exports__)
      /* harmony export */ __webpack_require__.d(__webpack_exports__, {
        /* harmony export */ default: function () {
          return /* binding */ _
        },
        /* harmony export */ getServerSideProps: function () {
          return /* binding */ getServerSideProps
        },
        /* harmony export */
      })
      /* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__ =
        __webpack_require__(282)
      /* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0___default =
        /*#__PURE__*/ __webpack_require__.n(
          react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__
        )
      /* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1__ =
        __webpack_require__(747)
      /* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1___default =
        /*#__PURE__*/ __webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_1__)
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2__ =
        __webpack_require__(622)
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_2___default =
        /*#__PURE__*/ __webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_2__)

      function _({ text }) {
        return /*#__PURE__*/ (0,
        react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxs)('div', {
          children: [
            /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(
              'h1',
              {
                children: 'next-webpack-5-fs-bug',
              }
            ),
            /*#__PURE__*/ react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx(
              'p',
              {
                children: text,
              }
            ),
          ],
        })
      }
      function getServerSideProps() {
        const text = (0, fs__WEBPACK_IMPORTED_MODULE_1__.readFileSync)(
          path__WEBPACK_IMPORTED_MODULE_2___default().resolve(
            __dirname,
            'asset.txt'
          ),
          {
            encoding: 'utf-8',
          }
        )
        return {
          props: {
            text,
          },
        }
      }

      /***/
    },

    /***/ 747: /***/ function (module) {
      'use strict'
      module.exports = require('fs')

      /***/
    },

    /***/ 622: /***/ function (module) {
      'use strict'
      module.exports = require('path')

      /***/
    },

    /***/ 282: /***/ function (module) {
      'use strict'
      module.exports = none

      /***/
    },
  }
  // load runtime
  var __webpack_require__ = require('../webpack-runtime.js')
  __webpack_require__.C(exports)
  var __webpack_exec__ = function (moduleId) {
    return __webpack_require__((__webpack_require__.s = moduleId))
  }
  var __webpack_exports__ = __webpack_exec__(474)
  module.exports = __webpack_exports__
})()
