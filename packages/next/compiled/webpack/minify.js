module.exports =
/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 149:
/***/ (function(module, exports, __nccwpck_require__) {

/* module decorator */ module = __nccwpck_require__.nmd(module);


const {
  minify: terserMinify
} = __nccwpck_require__(775);
/** @typedef {import("source-map").RawSourceMap} RawSourceMap */

/** @typedef {import("./index.js").ExtractCommentsOptions} ExtractCommentsOptions */

/** @typedef {import("./index.js").CustomMinifyFunction} CustomMinifyFunction */

/** @typedef {import("terser").MinifyOptions} TerserMinifyOptions */

/** @typedef {import("terser").MinifyOutput} MinifyOutput */

/** @typedef {import("terser").FormatOptions} FormatOptions */

/** @typedef {import("terser").MangleOptions} MangleOptions */

/** @typedef {import("./index.js").ExtractCommentsFunction} ExtractCommentsFunction */

/** @typedef {import("./index.js").ExtractCommentsCondition} ExtractCommentsCondition */

/**
 * @typedef {Object.<any, any>} CustomMinifyOptions
 */

/**
 * @typedef {Object} InternalMinifyOptions
 * @property {string} name
 * @property {string} input
 * @property {RawSourceMap} [inputSourceMap]
 * @property {ExtractCommentsOptions} extractComments
 * @property {CustomMinifyFunction} [minify]
 * @property {TerserMinifyOptions | CustomMinifyOptions} minifyOptions
 */

/**
 * @typedef {Array<string>} ExtractedComments
 */

/**
 * @typedef {Promise<MinifyOutput & { extractedComments?: ExtractedComments}>} InternalMinifyResult
 */

/**
 * @typedef {TerserMinifyOptions & { sourceMap: undefined } & ({ output: FormatOptions & { beautify: boolean } } | { format: FormatOptions & { beautify: boolean } })} NormalizedTerserMinifyOptions
 */

/**
 * @param {TerserMinifyOptions} [terserOptions={}]
 * @returns {NormalizedTerserMinifyOptions}
 */


function buildTerserOptions(terserOptions = {}) {
  // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
  return { ...terserOptions,
    compress: typeof terserOptions.compress === "boolean" ? terserOptions.compress : { ...terserOptions.compress
    },
    // ecma: terserOptions.ecma,
    // ie8: terserOptions.ie8,
    // keep_classnames: terserOptions.keep_classnames,
    // keep_fnames: terserOptions.keep_fnames,
    mangle: terserOptions.mangle == null ? true : typeof terserOptions.mangle === "boolean" ? terserOptions.mangle : { ...terserOptions.mangle
    },
    // module: terserOptions.module,
    // nameCache: { ...terserOptions.toplevel },
    // the `output` option is deprecated
    ...(terserOptions.format ? {
      format: {
        beautify: false,
        ...terserOptions.format
      }
    } : {
      output: {
        beautify: false,
        ...terserOptions.output
      }
    }),
    parse: { ...terserOptions.parse
    },
    // safari10: terserOptions.safari10,
    // Ignoring sourceMap from options
    // eslint-disable-next-line no-undefined
    sourceMap: undefined // toplevel: terserOptions.toplevel

  };
}
/**
 * @param {any} value
 * @returns {boolean}
 */


function isObject(value) {
  const type = typeof value;
  return value != null && (type === "object" || type === "function");
}
/**
 * @param {ExtractCommentsOptions} extractComments
 * @param {NormalizedTerserMinifyOptions} terserOptions
 * @param {ExtractedComments} extractedComments
 * @returns {ExtractCommentsFunction}
 */


function buildComments(extractComments, terserOptions, extractedComments) {
  /** @type {{ [index: string]: ExtractCommentsCondition }} */
  const condition = {};
  let comments;

  if (terserOptions.format) {
    ({
      comments
    } = terserOptions.format);
  } else if (terserOptions.output) {
    ({
      comments
    } = terserOptions.output);
  }

  condition.preserve = typeof comments !== "undefined" ? comments : false;

  if (typeof extractComments === "boolean" && extractComments) {
    condition.extract = "some";
  } else if (typeof extractComments === "string" || extractComments instanceof RegExp) {
    condition.extract = extractComments;
  } else if (typeof extractComments === "function") {
    condition.extract = extractComments;
  } else if (extractComments && isObject(extractComments)) {
    condition.extract = typeof extractComments.condition === "boolean" && extractComments.condition ? "some" : typeof extractComments.condition !== "undefined" ? extractComments.condition : "some";
  } else {
    // No extract
    // Preserve using "commentsOpts" or "some"
    condition.preserve = typeof comments !== "undefined" ? comments : "some";
    condition.extract = false;
  } // Ensure that both conditions are functions


  ["preserve", "extract"].forEach(key => {
    /** @type {undefined | string} */
    let regexStr;
    /** @type {undefined | RegExp} */

    let regex;

    switch (typeof condition[key]) {
      case "boolean":
        condition[key] = condition[key] ? () => true : () => false;
        break;

      case "function":
        break;

      case "string":
        if (condition[key] === "all") {
          condition[key] = () => true;

          break;
        }

        if (condition[key] === "some") {
          condition[key] =
          /** @type {ExtractCommentsFunction} */
          (astNode, comment) => (comment.type === "comment2" || comment.type === "comment1") && /@preserve|@lic|@cc_on|^\**!/i.test(comment.value);

          break;
        }

        regexStr =
        /** @type {string} */
        condition[key];

        condition[key] =
        /** @type {ExtractCommentsFunction} */
        (astNode, comment) => new RegExp(
        /** @type {string} */
        regexStr).test(comment.value);

        break;

      default:
        regex =
        /** @type {RegExp} */
        condition[key];

        condition[key] =
        /** @type {ExtractCommentsFunction} */
        (astNode, comment) =>
        /** @type {RegExp} */
        regex.test(comment.value);

    }
  }); // Redefine the comments function to extract and preserve
  // comments according to the two conditions

  return (astNode, comment) => {
    if (
    /** @type {{ extract: ExtractCommentsFunction }} */
    condition.extract(astNode, comment)) {
      const commentText = comment.type === "comment2" ? `/*${comment.value}*/` : `//${comment.value}`; // Don't include duplicate comments

      if (!extractedComments.includes(commentText)) {
        extractedComments.push(commentText);
      }
    }

    return (
      /** @type {{ preserve: ExtractCommentsFunction }} */
      condition.preserve(astNode, comment)
    );
  };
}
/**
 * @param {InternalMinifyOptions} options
 * @returns {InternalMinifyResult}
 */


async function minify(options) {
  const {
    name,
    input,
    inputSourceMap,
    minify: minifyFn,
    minifyOptions
  } = options;

  if (minifyFn) {
    return minifyFn({
      [name]: input
    }, inputSourceMap, minifyOptions);
  } // Copy terser options


  const terserOptions = buildTerserOptions(minifyOptions); // Let terser generate a SourceMap

  if (inputSourceMap) {
    // @ts-ignore
    terserOptions.sourceMap = {
      asObject: true
    };
  }
  /** @type {ExtractedComments} */


  const extractedComments = [];
  const {
    extractComments
  } = options;

  if (terserOptions.output) {
    terserOptions.output.comments = buildComments(extractComments, terserOptions, extractedComments);
  } else if (terserOptions.format) {
    terserOptions.format.comments = buildComments(extractComments, terserOptions, extractedComments);
  }

  const result = await terserMinify({
    [name]: input
  }, terserOptions);
  return { ...result,
    extractedComments
  };
}
/**
 * @param {string} options
 * @returns {InternalMinifyResult}
 */


function transform(options) {
  // 'use strict' => this === undefined (Clean Scope)
  // Safer for possible security issues, albeit not critical at all here
  // eslint-disable-next-line no-param-reassign
  const evaluatedOptions =
  /** @type {InternalMinifyOptions} */
  // eslint-disable-next-line no-new-func
  new Function("exports", "require", "module", "__filename", "__dirname", `'use strict'\nreturn ${options}`)(exports, require, module, __filename, __dirname);
  return minify(evaluatedOptions);
}

module.exports.minify = minify;
module.exports.transform = transform;

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
/******/ 	return __nccwpck_require__(149);
/******/ })()
;