"use strict";
(() => {
  var exports = {};
  exports.id = 829;
  exports.ids = [829];
  exports.modules = {
    /***/ 5166: /***/ (
      __unused_webpack_module,
      __webpack_exports__,
      __webpack_require__
    ) => {
      // ESM COMPAT FLAG
      __webpack_require__.r(__webpack_exports__);

      // EXPORTS
      __webpack_require__.d(__webpack_exports__, {
        default: () => /* binding */ handler,
      }); // CONCATENATED MODULE: external "fs/promises"

      const promises_namespaceObject = require("fs/promises"); // CONCATENATED MODULE: ./pages/api/users.ts
      // Fake users data
      const users = [
        {
          id: 1,
        },
        {
          id: 2,
        },
        {
          id: 3,
        },
      ];
      async function handler(_req, res) {
        const hello = await (0, promises_namespaceObject.readFile)(
          "./hello.txt",
          "utf-8"
        );
        // Get data from your database
        res.status(200).json({
          users,
          hello,
        });
      }

      /***/
    },
  };
  // load runtime
  var __webpack_require__ = require("../../webpack-api-runtime.js");
  __webpack_require__.C(exports);
  var __webpack_exec__ = (moduleId) =>
    __webpack_require__((__webpack_require__.s = moduleId));
  var __webpack_exports__ = __webpack_exec__(5166);
  module.exports = __webpack_exports__;
})();
