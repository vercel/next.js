/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 685:
/***/ (function(module) {

module.exports = require("http");

/***/ }),

/***/ 687:
/***/ (function(module) {

module.exports = require("https");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
!function() {
var exports = __webpack_exports__;
var __resourceQuery = "";
/* global __resourceQuery */



var urlBase = decodeURIComponent(__resourceQuery.slice(1));
exports.keepAlive = function (options) {
	var data = options.data;
	var onError = options.onError;
	var active = options.active;
	var module = options.module;
	var response;
	var request = (
		urlBase.startsWith("https") ? __nccwpck_require__(687) : __nccwpck_require__(685)
	).request(
		urlBase + data,
		{
			agent: false,
			headers: { accept: "text/event-stream" }
		},
		function (res) {
			response = res;
			response.on("error", errorHandler);
			if (!active && !module.hot) {
				console.log(
					"Hot Module Replacement is not enabled. Waiting for process restart..."
				);
			}
		}
	);
	function errorHandler(err) {
		err.message =
			"Problem communicating active modules to the server: " + err.message;
		onError(err);
	}
	request.on("error", errorHandler);
	request.end();
	return function () {
		response.destroy();
	};
};

}();
module.exports = __webpack_exports__;
/******/ })()
;