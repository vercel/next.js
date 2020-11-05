module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 809:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



const loader = __webpack_require__(184);

module.exports = loader.default;
module.exports.raw = loader.raw;

/***/ }),

/***/ 184:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.default = loader;
exports.raw = void 0;

var _path = _interopRequireDefault(__webpack_require__(622));

var _loaderUtils = _interopRequireDefault(__webpack_require__(710));

var _schemaUtils = _interopRequireDefault(__webpack_require__(225));

var _options = _interopRequireDefault(__webpack_require__(764));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function loader(content) {
  const options = _loaderUtils.default.getOptions(this);

  (0, _schemaUtils.default)(_options.default, options, {
    name: 'File Loader',
    baseDataPath: 'options'
  });
  const context = options.context || this.rootContext;

  const url = _loaderUtils.default.interpolateName(this, options.name || '[contenthash].[ext]', {
    context,
    content,
    regExp: options.regExp
  });

  let outputPath = url;

  if (options.outputPath) {
    if (typeof options.outputPath === 'function') {
      outputPath = options.outputPath(url, this.resourcePath, context);
    } else {
      outputPath = _path.default.posix.join(options.outputPath, url);
    }
  }

  let publicPath = `__webpack_public_path__ + ${JSON.stringify(outputPath)}`;

  if (options.publicPath) {
    if (typeof options.publicPath === 'function') {
      publicPath = options.publicPath(url, this.resourcePath, context);
    } else {
      publicPath = `${options.publicPath.endsWith('/') ? options.publicPath : `${options.publicPath}/`}${url}`;
    }

    publicPath = JSON.stringify(publicPath);
  }

  if (options.postTransformPublicPath) {
    publicPath = options.postTransformPublicPath(publicPath);
  }

  if (typeof options.emitFile === 'undefined' || options.emitFile) {
    this.emitFile(outputPath, content);
  }

  const esModule = typeof options.esModule !== 'undefined' ? options.esModule : true;
  return `${esModule ? 'export default' : 'module.exports ='} ${publicPath};`;
}

const raw = true;
exports.raw = raw;

/***/ }),

/***/ 764:
/***/ ((module) => {

module.exports = JSON.parse("{\"additionalProperties\":true,\"properties\":{\"name\":{\"description\":\"The filename template for the target file(s) (https://github.com/webpack-contrib/file-loader#name).\",\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"Function\"}]},\"outputPath\":{\"description\":\"A filesystem path where the target file(s) will be placed (https://github.com/webpack-contrib/file-loader#outputpath).\",\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"Function\"}]},\"publicPath\":{\"description\":\"A custom public path for the target file(s) (https://github.com/webpack-contrib/file-loader#publicpath).\",\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"Function\"}]},\"postTransformPublicPath\":{\"description\":\"A custom transformation function for post-processing the publicPath (https://github.com/webpack-contrib/file-loader#posttransformpublicpath).\",\"instanceof\":\"Function\"},\"context\":{\"description\":\"A custom file context (https://github.com/webpack-contrib/file-loader#context).\",\"type\":\"string\"},\"emitFile\":{\"description\":\"Enables/Disables emit files (https://github.com/webpack-contrib/file-loader#emitfile).\",\"type\":\"boolean\"},\"regExp\":{\"description\":\"A Regular Expression to one or many parts of the target file path. The capture groups can be reused in the name property using [N] placeholder (https://github.com/webpack-contrib/file-loader#regexp).\",\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"RegExp\"}]},\"esModule\":{\"description\":\"By default, file-loader generates JS modules that use the ES modules syntax.\",\"type\":\"boolean\"}},\"type\":\"object\"}");

/***/ }),

/***/ 710:
/***/ ((module) => {

module.exports = require("loader-utils");;

/***/ }),

/***/ 225:
/***/ ((module) => {

module.exports = require("next/dist/compiled/schema-utils");;

/***/ }),

/***/ 622:
/***/ ((module) => {

module.exports = require("path");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
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
/******/ 			__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
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
/******/ 	__webpack_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(809);
/******/ })()
;