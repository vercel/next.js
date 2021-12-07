module.exports =
/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 668:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

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
		urlBase.startsWith("https") ? __nccwpck_require__(211) : __nccwpck_require__(605)
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


/***/ }),

/***/ 605:
/***/ (function(module) {

module.exports = require("http");;

/***/ }),

/***/ 211:
/***/ (function(module) {

module.exports = require("https");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(__webpack_module_cache__[moduleId]) {
/******/ 			return __webpack_module_cache__[moduleId].exports;
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
/******/ 	__nccwpck_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __nccwpck_require__(668);
/******/ })()
;