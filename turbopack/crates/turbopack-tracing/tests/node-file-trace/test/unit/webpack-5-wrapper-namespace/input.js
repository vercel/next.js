;(function () {
  var exports = {}
  exports.id = 223
  exports.ids = [223]
  exports.modules = {
    /***/ 0: /***/ function (module, exports, __webpack_require__) {
      module.exports = __webpack_require__('PicC')

      /***/
    },

    /***/ PicC: /***/ function (
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
          return handler
        }
      )
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_0__ = require('path')
      /* harmony import */ var path__WEBPACK_IMPORTED_MODULE_0___default =
        /*#__PURE__*/ __webpack_require__.n(path__WEBPACK_IMPORTED_MODULE_0__)
      /* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1__ = require('fs')
      /* harmony import */ var fs__WEBPACK_IMPORTED_MODULE_1___default =
        /*#__PURE__*/ __webpack_require__.n(fs__WEBPACK_IMPORTED_MODULE_1__)

      f(__webpack_require__('oyvS'))

      function handler(req, res) {
        const dictionaryPath = path__WEBPACK_IMPORTED_MODULE_0___default().join(
          process.cwd(),
          'assets',
          'dictionary.json'
        )
        const content = fs__WEBPACK_IMPORTED_MODULE_1___default().readFileSync(
          dictionaryPath,
          'utf-8'
        )
        res.json(content)
      }

      /***/
    },

    /***/ 'mw/K': /***/ function (module, exports) {
      module.exports = require('fs')

      /***/
    },

    /***/ oyvS: /***/ function (module, exports) {
      module.exports = require('path')

      /***/
    },

    /******/
  }

  // load runtime
  var __webpack_require__ = require('../../webpack-runtime.js')
  __webpack_require__.C(exports)
  var __webpack_exec__ = function (moduleId) {
    return __webpack_require__((__webpack_require__.s = moduleId))
  }
  var __webpack_exports__ = __webpack_exec__(277)
  module.exports = __webpack_exports__
})()
