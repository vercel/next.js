module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 0:
/***/ ((module) => {



const STRIP_FILENAME_RE = /^[^:]+: /;

const format = err => {
  if (err instanceof SyntaxError) {
    err.name = "SyntaxError";
    err.message = err.message.replace(STRIP_FILENAME_RE, "");
    err.hideStack = true;
  } else if (err instanceof TypeError) {
    err.name = null;
    err.message = err.message.replace(STRIP_FILENAME_RE, "");
    err.hideStack = true;
  }

  return err;
};

class LoaderError extends Error {
  constructor(err) {
    super();
    const {
      name,
      message,
      codeFrame,
      hideStack
    } = format(err);
    this.name = "BabelLoaderError";
    this.message = `${name ? `${name}: ` : ""}${message}\n\n${codeFrame}\n`;
    this.hideStack = hideStack;
    Error.captureStackTrace(this, this.constructor);
  }

}

module.exports = LoaderError;

/***/ }),

/***/ 420:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

/**
 * Filesystem Cache
 *
 * Given a file and a transform function, cache the result into files
 * or retrieve the previously cached files if the given file is already known.
 *
 * @see https://github.com/babel/babel-loader/issues/34
 * @see https://github.com/babel/babel-loader/pull/41
 */
const fs = __webpack_require__(747);

const os = __webpack_require__(87);

const path = __webpack_require__(622);

const zlib = __webpack_require__(761);

const crypto = __webpack_require__(417);

const mkdirpOrig = __webpack_require__(327);

const findCacheDir = __webpack_require__(844);

const promisify = __webpack_require__(677);

const transform = __webpack_require__(850); // Lazily instantiated when needed


let defaultCacheDirectory = null;
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);
const mkdirp = promisify(mkdirpOrig);
/**
 * Read the contents from the compressed file.
 *
 * @async
 * @params {String} filename
 */

const read =
/*#__PURE__*/
function () {
  var _ref = _asyncToGenerator(function* (filename, compress) {
    const data = yield readFile(filename + (compress ? ".gz" : ""));
    const content = compress ? yield gunzip(data) : data;
    return JSON.parse(content.toString());
  });

  return function read(_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();
/**
 * Write contents into a compressed file.
 *
 * @async
 * @params {String} filename
 * @params {String} result
 */


const write =
/*#__PURE__*/
function () {
  var _ref2 = _asyncToGenerator(function* (filename, compress, result) {
    const content = JSON.stringify(result);
    const data = compress ? yield gzip(content) : content;
    return yield writeFile(filename + (compress ? ".gz" : ""), data);
  });

  return function write(_x3, _x4, _x5) {
    return _ref2.apply(this, arguments);
  };
}();
/**
 * Build the filename for the cached file
 *
 * @params {String} source  File source code
 * @params {Object} options Options used
 *
 * @return {String}
 */


const filename = function (source, identifier, options) {
  const hash = crypto.createHash("md4");
  const contents = JSON.stringify({
    source,
    options,
    identifier
  });
  hash.update(contents);
  return hash.digest("hex") + ".json";
};
/**
 * Handle the cache
 *
 * @params {String} directory
 * @params {Object} params
 */


const handleCache =
/*#__PURE__*/
function () {
  var _ref3 = _asyncToGenerator(function* (directory, params) {
    const {
      source,
      options = {},
      cacheIdentifier,
      cacheDirectory,
      cacheCompression
    } = params;
    const file = path.join(directory, filename(source, cacheIdentifier, options));

    try {
      // No errors mean that the file was previously cached
      // we just need to return it
      return yield read(file, cacheCompression);
    } catch (err) {}

    const fallback = typeof cacheDirectory !== "string" && directory !== os.tmpdir(); // Make sure the directory exists.

    try {
      yield mkdirp(directory);
    } catch (err) {
      if (fallback) {
        return handleCache(os.tmpdir(), params);
      }

      throw err;
    } // Otherwise just transform the file
    // return it to the user asap and write it in cache


    const result = yield transform(source, options);

    try {
      yield write(file, cacheCompression, result);
    } catch (err) {
      if (fallback) {
        // Fallback to tmpdir if node_modules folder not writable
        return handleCache(os.tmpdir(), params);
      }

      throw err;
    }

    return result;
  });

  return function handleCache(_x6, _x7) {
    return _ref3.apply(this, arguments);
  };
}();
/**
 * Retrieve file from cache, or create a new one for future reads
 *
 * @async
 * @param  {Object}   params
 * @param  {String}   params.directory  Directory to store cached files
 * @param  {String}   params.identifier Unique identifier to bust cache
 * @param  {String}   params.source   Original contents of the file to be cached
 * @param  {Object}   params.options  Options to be given to the transform fn
 * @param  {Function} params.transform  Function that will transform the
 *                                      original file and whose result will be
 *                                      cached
 *
 * @example
 *
 *   cache({
 *     directory: '.tmp/cache',
 *     identifier: 'babel-loader-cachefile',
 *     cacheCompression: false,
 *     source: *source code from file*,
 *     options: {
 *       experimental: true,
 *       runtime: true
 *     },
 *     transform: function(source, options) {
 *       var content = *do what you need with the source*
 *       return content;
 *     }
 *   }, function(err, result) {
 *
 *   });
 */


module.exports =
/*#__PURE__*/
function () {
  var _ref4 = _asyncToGenerator(function* (params) {
    let directory;

    if (typeof params.cacheDirectory === "string") {
      directory = params.cacheDirectory;
    } else {
      if (defaultCacheDirectory === null) {
        defaultCacheDirectory = findCacheDir({
          name: "babel-loader"
        }) || os.tmpdir();
      }

      directory = defaultCacheDirectory;
    }

    return yield handleCache(directory, params);
  });

  return function (_x8) {
    return _ref4.apply(this, arguments);
  };
}();

/***/ }),

/***/ 826:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

let babel;

try {
  babel = __webpack_require__(195);
} catch (err) {
  if (err.code === "MODULE_NOT_FOUND") {
    err.message += "\n babel-loader@8 requires Babel 7.x (the package '@babel/core'). " + "If you'd like to use Babel 6.x ('babel-core'), you should install 'babel-loader@7'.";
  }

  throw err;
} // Since we've got the reverse bridge package at @babel/core@6.x, give
// people useful feedback if they try to use it alongside babel-loader.


if (/^6\./.test(babel.version)) {
  throw new Error("\n babel-loader@8 will not work with the '@babel/core@6' bridge package. " + "If you want to use Babel 6.x, install 'babel-loader@7'.");
}

const {
  version
} = __webpack_require__(38);

const cache = __webpack_require__(420);

const transform = __webpack_require__(850);

const injectCaller = __webpack_require__(159);

const schema = __webpack_require__(434);

const {
  isAbsolute
} = __webpack_require__(622);

const loaderUtils = __webpack_require__(710);

const validateOptions = __webpack_require__(225);

function subscribe(subscriber, metadata, context) {
  if (context[subscriber]) {
    context[subscriber](metadata);
  }
}

module.exports = makeLoader();
module.exports.custom = makeLoader;

function makeLoader(callback) {
  const overrides = callback ? callback(babel) : undefined;
  return function (source, inputSourceMap) {
    // Make the loader async
    const callback = this.async();
    loader.call(this, source, inputSourceMap, overrides).then(args => callback(null, ...args), err => callback(err));
  };
}

function loader(_x, _x2, _x3) {
  return _loader.apply(this, arguments);
}

function _loader() {
  _loader = _asyncToGenerator(function* (source, inputSourceMap, overrides) {
    const filename = this.resourcePath;
    let loaderOptions = loaderUtils.getOptions(this) || {};
    validateOptions(schema, loaderOptions, {
      name: "Babel loader"
    });

    if (loaderOptions.customize != null) {
      if (typeof loaderOptions.customize !== "string") {
        throw new Error("Customized loaders must be implemented as standalone modules.");
      }

      if (!isAbsolute(loaderOptions.customize)) {
        throw new Error("Customized loaders must be passed as absolute paths, since " + "babel-loader has no way to know what they would be relative to.");
      }

      if (overrides) {
        throw new Error("babel-loader's 'customize' option is not available when already " + "using a customized babel-loader wrapper.");
      }

      let override = require(loaderOptions.customize);

      if (override.__esModule) override = override.default;

      if (typeof override !== "function") {
        throw new Error("Custom overrides must be functions.");
      }

      overrides = override(babel);
    }

    let customOptions;

    if (overrides && overrides.customOptions) {
      const result = yield overrides.customOptions.call(this, loaderOptions, {
        source,
        map: inputSourceMap
      });
      customOptions = result.custom;
      loaderOptions = result.loader;
    } // Deprecation handling


    if ("forceEnv" in loaderOptions) {
      console.warn("The option `forceEnv` has been removed in favor of `envName` in Babel 7.");
    }

    if (typeof loaderOptions.babelrc === "string") {
      console.warn("The option `babelrc` should not be set to a string anymore in the babel-loader config. " + "Please update your configuration and set `babelrc` to true or false.\n" + "If you want to specify a specific babel config file to inherit config from " + "please use the `extends` option.\nFor more information about this options see " + "https://babeljs.io/docs/core-packages/#options");
    } // Standardize on 'sourceMaps' as the key passed through to Webpack, so that
    // users may safely use either one alongside our default use of
    // 'this.sourceMap' below without getting error about conflicting aliases.


    if (Object.prototype.hasOwnProperty.call(loaderOptions, "sourceMap") && !Object.prototype.hasOwnProperty.call(loaderOptions, "sourceMaps")) {
      loaderOptions = Object.assign({}, loaderOptions, {
        sourceMaps: loaderOptions.sourceMap
      });
      delete loaderOptions.sourceMap;
    }

    const programmaticOptions = Object.assign({}, loaderOptions, {
      filename,
      inputSourceMap: inputSourceMap || undefined,
      // Set the default sourcemap behavior based on Webpack's mapping flag,
      // but allow users to override if they want.
      sourceMaps: loaderOptions.sourceMaps === undefined ? this.sourceMap : loaderOptions.sourceMaps,
      // Ensure that Webpack will get a full absolute path in the sourcemap
      // so that it can properly map the module back to its internal cached
      // modules.
      sourceFileName: filename
    }); // Remove loader related options

    delete programmaticOptions.customize;
    delete programmaticOptions.cacheDirectory;
    delete programmaticOptions.cacheIdentifier;
    delete programmaticOptions.cacheCompression;
    delete programmaticOptions.metadataSubscribers;

    if (!babel.loadPartialConfig) {
      throw new Error(`babel-loader ^8.0.0-beta.3 requires @babel/core@7.0.0-beta.41, but ` + `you appear to be using "${babel.version}". Either update your ` + `@babel/core version, or pin you babel-loader version to 8.0.0-beta.2`);
    }

    const config = babel.loadPartialConfig(injectCaller(programmaticOptions, this.target));

    if (config) {
      let options = config.options;

      if (overrides && overrides.config) {
        options = yield overrides.config.call(this, config, {
          source,
          map: inputSourceMap,
          customOptions
        });
      }

      if (options.sourceMaps === "inline") {
        // Babel has this weird behavior where if you set "inline", we
        // inline the sourcemap, and set 'result.map = null'. This results
        // in bad behavior from Babel since the maps get put into the code,
        // which Webpack does not expect, and because the map we return to
        // Webpack is null, which is also bad. To avoid that, we override the
        // behavior here so "inline" just behaves like 'true'.
        options.sourceMaps = true;
      }

      const {
        cacheDirectory = null,
        cacheIdentifier = JSON.stringify({
          options,
          "@babel/core": transform.version,
          "@babel/loader": version
        }),
        cacheCompression = true,
        metadataSubscribers = []
      } = loaderOptions;
      let result;

      if (cacheDirectory) {
        result = yield cache({
          source,
          options,
          transform,
          cacheDirectory,
          cacheIdentifier,
          cacheCompression
        });
      } else {
        result = yield transform(source, options);
      } // TODO: Babel should really provide the full list of config files that
      // were used so that this can also handle files loaded with 'extends'.


      if (typeof config.babelrc === "string") {
        this.addDependency(config.babelrc);
      }

      if (result) {
        if (overrides && overrides.result) {
          result = yield overrides.result.call(this, result, {
            source,
            map: inputSourceMap,
            customOptions,
            config,
            options
          });
        }

        const {
          code,
          map,
          metadata
        } = result;
        metadataSubscribers.forEach(subscriber => {
          subscribe(subscriber, metadata, this);
        });
        return [code, map];
      }
    } // If the file was ignored, pass through the original content.


    return [source, inputSourceMap];
  });
  return _loader.apply(this, arguments);
}

/***/ }),

/***/ 159:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



const babel = __webpack_require__(195);

module.exports = function injectCaller(opts, target) {
  if (!supportsCallerOption()) return opts;
  return Object.assign({}, opts, {
    caller: Object.assign({
      name: "babel-loader",
      // Provide plugins with insight into webpack target.
      // https://github.com/babel/babel-loader/issues/787
      target,
      // Webpack >= 2 supports ESM and dynamic import.
      supportsStaticESM: true,
      supportsDynamicImport: true,
      // Webpack 5 supports TLA behind a flag. We enable it by default
      // for Babel, and then webpack will throw an error if the experimental
      // flag isn't enabled.
      supportsTopLevelAwait: true
    }, opts.caller)
  });
}; // TODO: We can remove this eventually, I'm just adding it so that people have
// a little time to migrate to the newer RCs of @babel/core without getting
// hard-to-diagnose errors about unknown 'caller' options.


let supportsCallerOptionFlag = undefined;

function supportsCallerOption() {
  if (supportsCallerOptionFlag === undefined) {
    try {
      // Rather than try to match the Babel version, we just see if it throws
      // when passed a 'caller' flag, and use that to decide if it is supported.
      babel.loadPartialConfig({
        caller: undefined,
        babelrc: false,
        configFile: false
      });
      supportsCallerOptionFlag = true;
    } catch (err) {
      supportsCallerOptionFlag = false;
    }
  }

  return supportsCallerOptionFlag;
}

/***/ }),

/***/ 850:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {



function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

const babel = __webpack_require__(195);

const promisify = __webpack_require__(677);

const LoaderError = __webpack_require__(0);

const transform = promisify(babel.transform);

module.exports =
/*#__PURE__*/
function () {
  var _ref = _asyncToGenerator(function* (source, options) {
    let result;

    try {
      result = yield transform(source, options);
    } catch (err) {
      throw err.message && err.codeFrame ? new LoaderError(err) : err;
    }

    if (!result) return null; // We don't return the full result here because some entries are not
    // really serializable. For a full list of properties see here:
    // https://github.com/babel/babel/blob/master/packages/babel-core/src/transformation/index.js
    // For discussion on this topic see here:
    // https://github.com/babel/babel-loader/pull/629

    const {
      ast,
      code,
      map,
      metadata,
      sourceType
    } = result;

    if (map && (!map.sourcesContent || !map.sourcesContent.length)) {
      map.sourcesContent = [source];
    }

    return {
      ast,
      code,
      map,
      metadata,
      sourceType
    };
  });

  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
}();

module.exports.version = babel.version;

/***/ }),

/***/ 677:
/***/ ((module) => {



const processFn = (fn, options) => function (...args) {
	const P = options.promiseModule;

	return new P((resolve, reject) => {
		if (options.multiArgs) {
			args.push((...result) => {
				if (options.errorFirst) {
					if (result[0]) {
						reject(result);
					} else {
						result.shift();
						resolve(result);
					}
				} else {
					resolve(result);
				}
			});
		} else if (options.errorFirst) {
			args.push((error, result) => {
				if (error) {
					reject(error);
				} else {
					resolve(result);
				}
			});
		} else {
			args.push(resolve);
		}

		fn.apply(this, args);
	});
};

module.exports = (input, options) => {
	options = Object.assign({
		exclude: [/.+(Sync|Stream)$/],
		errorFirst: true,
		promiseModule: Promise
	}, options);

	const objType = typeof input;
	if (!(input !== null && (objType === 'object' || objType === 'function'))) {
		throw new TypeError(`Expected \`input\` to be a \`Function\` or \`Object\`, got \`${input === null ? 'null' : objType}\``);
	}

	const filter = key => {
		const match = pattern => typeof pattern === 'string' ? key === pattern : pattern.test(key);
		return options.include ? options.include.some(match) : !options.exclude.some(match);
	};

	let ret;
	if (objType === 'function') {
		ret = function (...args) {
			return options.excludeMain ? input(...args) : processFn(input, options).apply(this, args);
		};
	} else {
		ret = Object.create(Object.getPrototypeOf(input));
	}

	for (const key in input) { // eslint-disable-line guard-for-in
		const property = input[key];
		ret[key] = typeof property === 'function' && filter(key) ? processFn(property, options) : property;
	}

	return ret;
};


/***/ }),

/***/ 434:
/***/ ((module) => {

module.exports = JSON.parse("{\"type\":\"object\",\"properties\":{\"cacheDirectory\":{\"oneOf\":[{\"type\":\"boolean\"},{\"type\":\"string\"}],\"default\":false},\"cacheIdentifier\":{\"type\":\"string\"},\"cacheCompression\":{\"type\":\"boolean\",\"default\":true},\"customize\":{\"type\":\"string\",\"default\":null}},\"additionalProperties\":true}");

/***/ }),

/***/ 38:
/***/ ((module) => {

module.exports = JSON.parse("{\"name\":\"babel-loader\",\"version\":\"8.1.0\",\"description\":\"babel module loader for webpack\",\"files\":[\"lib\"],\"main\":\"lib/index.js\",\"engines\":{\"node\":\">= 6.9\"},\"dependencies\":{\"find-cache-dir\":\"^2.1.0\",\"loader-utils\":\"^1.4.0\",\"mkdirp\":\"^0.5.3\",\"pify\":\"^4.0.1\",\"schema-utils\":\"^2.6.5\"},\"peerDependencies\":{\"@babel/core\":\"^7.0.0\",\"webpack\":\">=2\"},\"devDependencies\":{\"@babel/cli\":\"^7.2.0\",\"@babel/core\":\"^7.2.0\",\"@babel/preset-env\":\"^7.2.0\",\"ava\":\"^2.4.0\",\"babel-eslint\":\"^10.0.1\",\"babel-plugin-istanbul\":\"^5.1.0\",\"babel-plugin-react-intl\":\"^4.1.19\",\"cross-env\":\"^6.0.0\",\"eslint\":\"^6.5.1\",\"eslint-config-babel\":\"^9.0.0\",\"eslint-config-prettier\":\"^6.3.0\",\"eslint-plugin-flowtype\":\"^4.3.0\",\"eslint-plugin-prettier\":\"^3.0.0\",\"husky\":\"^3.0.7\",\"lint-staged\":\"^9.4.1\",\"nyc\":\"^14.1.1\",\"prettier\":\"^1.15.3\",\"react\":\"^16.0.0\",\"react-intl\":\"^3.3.2\",\"react-intl-webpack-plugin\":\"^0.3.0\",\"rimraf\":\"^3.0.0\",\"webpack\":\"^4.0.0\"},\"scripts\":{\"clean\":\"rimraf lib/\",\"build\":\"babel src/ --out-dir lib/ --copy-files\",\"format\":\"prettier --write --trailing-comma all 'src/**/*.js' 'test/**/*.test.js' 'test/helpers/*.js' && prettier --write --trailing-comma es5 'scripts/*.js'\",\"lint\":\"eslint src test\",\"precommit\":\"lint-staged\",\"prepublish\":\"yarn run clean && yarn run build\",\"preversion\":\"yarn run test\",\"test\":\"yarn run lint && cross-env BABEL_ENV=test yarn run build && yarn run test-only\",\"test-only\":\"nyc ava\"},\"repository\":{\"type\":\"git\",\"url\":\"https://github.com/babel/babel-loader.git\"},\"keywords\":[\"webpack\",\"loader\",\"babel\",\"es6\",\"transpiler\",\"module\"],\"author\":\"Luis Couto <hello@luiscouto.pt>\",\"license\":\"MIT\",\"bugs\":{\"url\":\"https://github.com/babel/babel-loader/issues\"},\"homepage\":\"https://github.com/babel/babel-loader\",\"nyc\":{\"all\":true,\"include\":[\"src/**/*.js\"],\"reporter\":[\"text\",\"json\"],\"sourceMap\":false,\"instrument\":false},\"ava\":{\"files\":[\"test/**/*.test.js\",\"!test/fixtures/**/*\",\"!test/helpers/**/*\"],\"helpers\":[\"**/helpers/**/*\"],\"sources\":[\"src/**/*.js\"]},\"lint-staged\":{\"scripts/*.js\":[\"prettier --trailing-comma es5 --write\",\"git add\"],\"src/**/*.js\":[\"prettier --trailing-comma all --write\",\"git add\"],\"test/**/*.test.js\":[\"prettier --trailing-comma all --write\",\"git add\"],\"test/helpers/*.js\":[\"prettier --trailing-comma all --write\",\"git add\"],\"package.json\":[\"node ./scripts/yarn-install.js\",\"git add yarn.lock\"]}}");

/***/ }),

/***/ 417:
/***/ ((module) => {

module.exports = require("crypto");;

/***/ }),

/***/ 747:
/***/ ((module) => {

module.exports = require("fs");;

/***/ }),

/***/ 710:
/***/ ((module) => {

module.exports = require("loader-utils");;

/***/ }),

/***/ 195:
/***/ ((module) => {

module.exports = require("next/dist/compiled/babel/core");;

/***/ }),

/***/ 844:
/***/ ((module) => {

module.exports = require("next/dist/compiled/find-cache-dir");;

/***/ }),

/***/ 327:
/***/ ((module) => {

module.exports = require("next/dist/compiled/mkdirp");;

/***/ }),

/***/ 225:
/***/ ((module) => {

module.exports = require("next/dist/compiled/schema-utils");;

/***/ }),

/***/ 87:
/***/ ((module) => {

module.exports = require("os");;

/***/ }),

/***/ 622:
/***/ ((module) => {

module.exports = require("path");;

/***/ }),

/***/ 761:
/***/ ((module) => {

module.exports = require("zlib");;

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
/******/ 	return __webpack_require__(826);
/******/ })()
;