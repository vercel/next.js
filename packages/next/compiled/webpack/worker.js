module.exports =
/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 787:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {



Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.default = void 0;

var _terser = __nccwpck_require__(775);

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const buildTerserOptions = ({
  ecma,
  warnings,
  parse = {},
  compress = {},
  mangle,
  module,
  output,
  toplevel,
  nameCache,
  ie8,

  /* eslint-disable camelcase */
  keep_classnames,
  keep_fnames,

  /* eslint-enable camelcase */
  safari10
} = {}) => ({
  ecma,
  warnings,
  parse: _objectSpread({}, parse),
  compress: typeof compress === 'boolean' ? compress : _objectSpread({}, compress),
  // eslint-disable-next-line no-nested-ternary
  mangle: mangle == null ? true : typeof mangle === 'boolean' ? mangle : _objectSpread({}, mangle),
  output: _objectSpread({
    shebang: true,
    comments: false,
    beautify: false,
    semicolons: true
  }, output),
  module,
  // Ignoring sourceMap from options
  sourceMap: null,
  toplevel,
  nameCache,
  ie8,
  keep_classnames,
  keep_fnames,
  safari10
});

const buildComments = (options, terserOptions, extractedComments) => {
  const condition = {};
  const commentsOpts = terserOptions.output.comments; // Use /^\**!|@preserve|@license|@cc_on/i RegExp

  if (typeof options.extractComments === 'boolean') {
    condition.preserve = commentsOpts;
    condition.extract = /^\**!|@preserve|@license|@cc_on/i;
  } else if (typeof options.extractComments === 'string' || options.extractComments instanceof RegExp) {
    // extractComments specifies the extract condition and commentsOpts specifies the preserve condition
    condition.preserve = commentsOpts;
    condition.extract = options.extractComments;
  } else if (typeof options.extractComments === 'function') {
    condition.preserve = commentsOpts;
    condition.extract = options.extractComments;
  } else if (Object.prototype.hasOwnProperty.call(options.extractComments, 'condition')) {
    // Extract condition is given in extractComments.condition
    condition.preserve = commentsOpts;
    condition.extract = options.extractComments.condition;
  } else {
    // No extract condition is given. Extract comments that match commentsOpts instead of preserving them
    condition.preserve = false;
    condition.extract = commentsOpts;
  } // Ensure that both conditions are functions


  ['preserve', 'extract'].forEach(key => {
    let regexStr;
    let regex;

    switch (typeof condition[key]) {
      case 'boolean':
        condition[key] = condition[key] ? () => true : () => false;
        break;

      case 'function':
        break;

      case 'string':
        if (condition[key] === 'all') {
          condition[key] = () => true;

          break;
        }

        if (condition[key] === 'some') {
          condition[key] = (astNode, comment) => {
            return comment.type === 'comment2' && /^\**!|@preserve|@license|@cc_on/i.test(comment.value);
          };

          break;
        }

        regexStr = condition[key];

        condition[key] = (astNode, comment) => {
          return new RegExp(regexStr).test(comment.value);
        };

        break;

      default:
        regex = condition[key];

        condition[key] = (astNode, comment) => regex.test(comment.value);

    }
  }); // Redefine the comments function to extract and preserve
  // comments according to the two conditions

  return (astNode, comment) => {
    if (condition.extract(astNode, comment)) {
      const commentText = comment.type === 'comment2' ? `/*${comment.value}*/` : `//${comment.value}`; // Don't include duplicate comments

      if (!extractedComments.includes(commentText)) {
        extractedComments.push(commentText);
      }
    }

    return condition.preserve(astNode, comment);
  };
};

const minify = options => {
  const {
    file,
    input,
    inputSourceMap,
    extractComments,
    minify: minifyFn
  } = options;

  if (minifyFn) {
    return minifyFn({
      [file]: input
    }, inputSourceMap);
  } // Copy terser options


  const terserOptions = buildTerserOptions(options.terserOptions); // Let terser generate a SourceMap

  if (inputSourceMap) {
    terserOptions.sourceMap = true;
  }

  const extractedComments = [];

  if (extractComments) {
    terserOptions.output.comments = buildComments(options, terserOptions, extractedComments);
  }

  const {
    error,
    map,
    code,
    warnings
  } = (0, _terser.minify)({
    [file]: input
  }, terserOptions);
  return {
    error,
    map,
    code,
    warnings,
    extractedComments
  };
};

var _default = minify;
exports.default = _default;

/***/ }),

/***/ 359:
/***/ (function(module, exports, __nccwpck_require__) {

/* module decorator */ module = __nccwpck_require__.nmd(module);


var _minify = _interopRequireDefault(__nccwpck_require__(787));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = (options, callback) => {
  try {
    // 'use strict' => this === undefined (Clean Scope)
    // Safer for possible security issues, albeit not critical at all here
    // eslint-disable-next-line no-new-func, no-param-reassign
    options = new Function('exports', 'require', 'module', '__filename', '__dirname', `'use strict'\nreturn ${options}`)(exports, require, module, __filename, __dirname);
    callback(null, (0, _minify.default)(options));
  } catch (errors) {
    callback(errors);
  }
};

/***/ }),

/***/ 775:
/***/ (function(module) {

module.exports = require("next/dist/compiled/terser");;

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
/******/ 			id: moduleId,
/******/ 			loaded: false,
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
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	!function() {
/******/ 		__nccwpck_require__.nmd = function(module) {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	}();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__nccwpck_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __nccwpck_require__(359);
/******/ })()
;