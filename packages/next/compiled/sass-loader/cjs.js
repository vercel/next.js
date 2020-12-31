module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 613:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"type\":\"object\",\"properties\":{\"implementation\":{\"description\":\"The implementation of the sass to be used (https://github.com/webpack-contrib/sass-loader#implementation).\",\"type\":\"object\"},\"sassOptions\":{\"description\":\"Options for `node-sass` or `sass` (`Dart Sass`) implementation. (https://github.com/webpack-contrib/sass-loader#implementation).\",\"anyOf\":[{\"type\":\"object\",\"additionalProperties\":true},{\"instanceof\":\"Function\"}]},\"additionalData\":{\"description\":\"Prepends/Appends `Sass`/`SCSS` code before the actual entry file (https://github.com/webpack-contrib/sass-loader#additionaldata).\",\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"Function\"}]},\"sourceMap\":{\"description\":\"Enables/Disables generation of source maps (https://github.com/webpack-contrib/sass-loader#sourcemap).\",\"type\":\"boolean\"},\"webpackImporter\":{\"description\":\"Enables/Disables default `webpack` importer (https://github.com/webpack-contrib/sass-loader#webpackimporter).\",\"type\":\"boolean\"}},\"additionalProperties\":false}");

/***/ }),

/***/ 911:
/***/ ((module) => {

function webpackEmptyContext(req) {
	var e = new Error("Cannot find module '" + req + "'");
	e.code = 'MODULE_NOT_FOUND';
	throw e;
}
webpackEmptyContext.keys = () => [];
webpackEmptyContext.resolve = webpackEmptyContext;
webpackEmptyContext.id = 911;
module.exports = webpackEmptyContext;

/***/ }),

/***/ 241:
/***/ ((__unused_webpack_module, exports) => {

function set(obj, key, val) {
	if (typeof val.value === 'object') val.value = klona(val.value);
	if (!val.enumerable || val.get || val.set || !val.configurable || !val.writable || key === '__proto__') {
		Object.defineProperty(obj, key, val);
	} else obj[key] = val.value;
}

function klona(x) {
	if (typeof x !== 'object') return x;

	var i=0, k, list, tmp, str=Object.prototype.toString.call(x);

	if (str === '[object Object]') {
		tmp = Object.create(x.__proto__ || null);
	} else if (str === '[object Array]') {
		tmp = Array(x.length);
	} else if (str === '[object Set]') {
		tmp = new Set;
		x.forEach(function (val) {
			tmp.add(klona(val));
		});
	} else if (str === '[object Map]') {
		tmp = new Map;
		x.forEach(function (val, key) {
			tmp.set(klona(key), klona(val));
		});
	} else if (str === '[object Date]') {
		tmp = new Date(+x);
	} else if (str === '[object RegExp]') {
		tmp = new RegExp(x.source, x.flags);
	} else if (str === '[object DataView]') {
		tmp = new x.constructor( klona(x.buffer) );
	} else if (str === '[object ArrayBuffer]') {
		tmp = x.slice(0);
	} else if (str.slice(-6) === 'Array]') {
		// ArrayBuffer.isView(x)
		// ~> `new` bcuz `Buffer.slice` => ref
		tmp = new x.constructor(x);
	}

	if (tmp) {
		for (list=Object.getOwnPropertySymbols(x); i < list.length; i++) {
			set(tmp, list[i], Object.getOwnPropertyDescriptor(x, list[i]));
		}

		for (i=0, list=Object.getOwnPropertyNames(x); i < list.length; i++) {
			if (Object.hasOwnProperty.call(tmp, k=list[i]) && tmp[k] === x[k]) continue;
			set(tmp, k, Object.getOwnPropertyDescriptor(x, k));
		}
	}

	return tmp || x;
}

exports.klona = klona;

/***/ }),

/***/ 76:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.default = void 0;

class SassError extends Error {
  constructor(sassError) {
    super();
    this.name = 'SassError';
    this.originalSassError = sassError;
    this.loc = {
      line: sassError.line,
      column: sassError.column
    }; // Keep original error if `sassError.formatted` is unavailable

    this.message = `${this.name}: ${this.originalSassError.message}`;

    if (this.originalSassError.formatted) {
      this.message = `${this.name}: ${this.originalSassError.formatted.replace(/^Error: /, '')}`; // Instruct webpack to hide the JS stack from the console.
      // Usually you're only interested in the SASS stack in this case.

      this.hideStack = true;
      Error.captureStackTrace(this, this.constructor);
    }
  }

}

var _default = SassError;
exports.default = _default;

/***/ }),

/***/ 52:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const loader = __webpack_require__(252);

module.exports = loader.default;

/***/ }),

/***/ 252:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.default = void 0;

var _path = _interopRequireDefault(__webpack_require__(622));

var _schemaUtils = __webpack_require__(712);

var _loaderUtils = __webpack_require__(710);

var _options = _interopRequireDefault(__webpack_require__(613));

var _utils = __webpack_require__(409);

var _SassError = _interopRequireDefault(__webpack_require__(76));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * The sass-loader makes node-sass and dart-sass available to webpack modules.
 *
 * @this {object}
 * @param {string} content
 */
function loader(content) {
  const options = (0, _loaderUtils.getOptions)(this);
  (0, _schemaUtils.validate)(_options.default, options, {
    name: 'Sass Loader',
    baseDataPath: 'options'
  });
  const implementation = (0, _utils.getSassImplementation)(options.implementation);
  const useSourceMap = typeof options.sourceMap === 'boolean' ? options.sourceMap : this.sourceMap;
  const sassOptions = (0, _utils.getSassOptions)(this, options, content, implementation, useSourceMap);
  const shouldUseWebpackImporter = typeof options.webpackImporter === 'boolean' ? options.webpackImporter : true;

  if (shouldUseWebpackImporter) {
    const {
      includePaths
    } = sassOptions;
    sassOptions.importer.push((0, _utils.getWebpackImporter)(this, implementation, includePaths));
  }

  const callback = this.async();
  const render = (0, _utils.getRenderFunctionFromSassImplementation)(implementation);
  render(sassOptions, (error, result) => {
    if (error) {
      // There are situations when the `file` property do not exist
      if (error.file) {
        // `node-sass` returns POSIX paths
        this.addDependency(_path.default.normalize(error.file));
      }

      callback(new _SassError.default(error));
      return;
    }

    let map = result.map ? JSON.parse(result.map) : null; // Modify source paths only for webpack, otherwise we do nothing

    if (map && useSourceMap) {
      map = (0, _utils.normalizeSourceMap)(map, this.rootContext);
    }

    result.stats.includedFiles.forEach(includedFile => {
      this.addDependency(_path.default.normalize(includedFile));
    });
    callback(null, result.css.toString(), map);
  });
}

var _default = loader;
exports.default = _default;

/***/ }),

/***/ 409:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.getSassImplementation = getSassImplementation;
exports.getSassOptions = getSassOptions;
exports.getWebpackResolver = getWebpackResolver;
exports.getWebpackImporter = getWebpackImporter;
exports.getRenderFunctionFromSassImplementation = getRenderFunctionFromSassImplementation;
exports.normalizeSourceMap = normalizeSourceMap;

var _url = _interopRequireDefault(__webpack_require__(835));

var _path = _interopRequireDefault(__webpack_require__(622));

var _semver = _interopRequireDefault(__webpack_require__(519));

var _full = __webpack_require__(241);

var _loaderUtils = __webpack_require__(710);

var _neoAsync = _interopRequireDefault(__webpack_require__(386));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function getDefaultSassImplementation() {
  let sassImplPkg = 'sass';

  try {
    require.resolve('sass');
  } catch (error) {
    try {
      require.resolve('node-sass');

      sassImplPkg = 'node-sass';
    } catch (ignoreError) {
      sassImplPkg = 'sass';
    }
  } // eslint-disable-next-line import/no-dynamic-require, global-require


  return require(sassImplPkg);
}
/**
 * @public
 * This function is not Webpack-specific and can be used by tools wishing to
 * mimic `sass-loader`'s behaviour, so its signature should not be changed.
 */


function getSassImplementation(implementation) {
  let resolvedImplementation = implementation;

  if (!resolvedImplementation) {
    // eslint-disable-next-line no-param-reassign
    resolvedImplementation = getDefaultSassImplementation();
  }

  const {
    info
  } = resolvedImplementation;

  if (!info) {
    throw new Error('Unknown Sass implementation.');
  }

  const infoParts = info.split('\t');

  if (infoParts.length < 2) {
    throw new Error(`Unknown Sass implementation "${info}".`);
  }

  const [implementationName, version] = infoParts;

  if (implementationName === 'dart-sass') {
    if (!_semver.default.satisfies(version, '^1.3.0')) {
      throw new Error(`Dart Sass version ${version} is incompatible with ^1.3.0.`);
    }

    return resolvedImplementation;
  } else if (implementationName === 'node-sass') {
    if (!_semver.default.satisfies(version, '^4.0.0 || ^5.0.0')) {
      throw new Error(`Node Sass version ${version} is incompatible with ^4.0.0 || ^5.0.0.`);
    }

    return resolvedImplementation;
  }

  throw new Error(`Unknown Sass implementation "${implementationName}".`);
}

function isProductionLikeMode(loaderContext) {
  return loaderContext.mode === 'production' || !loaderContext.mode;
}

function proxyCustomImporters(importers, loaderContext) {
  return [].concat(importers).map(importer => {
    return function proxyImporter(...args) {
      this.webpackLoaderContext = loaderContext;
      return importer.apply(this, args);
    };
  });
}
/**
 * Derives the sass options from the loader context and normalizes its values with sane defaults.
 *
 * @param {object} loaderContext
 * @param {object} loaderOptions
 * @param {string} content
 * @param {object} implementation
 * @param {boolean} useSourceMap
 * @returns {Object}
 */


function getSassOptions(loaderContext, loaderOptions, content, implementation, useSourceMap) {
  const options = (0, _full.klona)(loaderOptions.sassOptions ? typeof loaderOptions.sassOptions === 'function' ? loaderOptions.sassOptions(loaderContext) || {} : loaderOptions.sassOptions : {});
  const isDartSass = implementation.info.includes('dart-sass');

  if (isDartSass) {
    const shouldTryToResolveFibers = !options.fiber && options.fiber !== false;

    if (shouldTryToResolveFibers) {
      let fibers;

      try {
        fibers = require.resolve('fibers');
      } catch (_error) {// Nothing
      }

      if (fibers) {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        options.fiber = require(fibers);
      }
    } else if (options.fiber === false) {
      // Don't pass the `fiber` option for `sass` (`Dart Sass`)
      delete options.fiber;
    }
  } else {
    // Don't pass the `fiber` option for `node-sass`
    delete options.fiber;
  }

  options.file = loaderContext.resourcePath;
  options.data = loaderOptions.additionalData ? typeof loaderOptions.additionalData === 'function' ? loaderOptions.additionalData(content, loaderContext) : `${loaderOptions.additionalData}\n${content}` : content; // opt.outputStyle

  if (!options.outputStyle && isProductionLikeMode(loaderContext)) {
    options.outputStyle = 'compressed';
  }

  if (useSourceMap) {
    // Deliberately overriding the sourceMap option here.
    // node-sass won't produce source maps if the data option is used and options.sourceMap is not a string.
    // In case it is a string, options.sourceMap should be a path where the source map is written.
    // But since we're using the data option, the source map will not actually be written, but
    // all paths in sourceMap.sources will be relative to that path.
    // Pretty complicated... :(
    options.sourceMap = true;
    options.outFile = _path.default.join(loaderContext.rootContext, 'style.css.map');
    options.sourceMapContents = true;
    options.omitSourceMapUrl = true;
    options.sourceMapEmbed = false;
  }

  const {
    resourcePath
  } = loaderContext;

  const ext = _path.default.extname(resourcePath); // If we are compiling sass and indentedSyntax isn't set, automatically set it.


  if (ext && ext.toLowerCase() === '.sass' && typeof options.indentedSyntax === 'undefined') {
    options.indentedSyntax = true;
  } else {
    options.indentedSyntax = Boolean(options.indentedSyntax);
  } // Allow passing custom importers to `sass`/`node-sass`. Accepts `Function` or an array of `Function`s.


  options.importer = options.importer ? proxyCustomImporters(Array.isArray(options.importer) ? options.importer : [options.importer], loaderContext) : [];
  options.includePaths = [].concat(process.cwd()).concat(options.includePaths || []).concat(process.env.SASS_PATH ? process.env.SASS_PATH.split(process.platform === 'win32' ? ';' : ':') : []);
  return options;
} // Examples:
// - ~package
// - ~package/
// - ~@org
// - ~@org/
// - ~@org/package
// - ~@org/package/


const isModuleImport = /^~([^/]+|[^/]+\/|@[^/]+[/][^/]+|@[^/]+\/?|@[^/]+[/][^/]+\/)$/;
/**
 * When `sass`/`node-sass` tries to resolve an import, it uses a special algorithm.
 * Since the `sass-loader` uses webpack to resolve the modules, we need to simulate that algorithm.
 * This function returns an array of import paths to try.
 * The last entry in the array is always the original url to enable straight-forward webpack.config aliases.
 *
 * We don't need emulate `dart-sass` "It's not clear which file to import." errors (when "file.ext" and "_file.ext" files are present simultaneously in the same directory).
 * This reduces performance and `dart-sass` always do it on own side.
 *
 * @param {string} url
 * @param {boolean} forWebpackResolver
 * @param {string} rootContext
 * @returns {Array<string>}
 */

function getPossibleRequests( // eslint-disable-next-line no-shadow
url, forWebpackResolver = false, rootContext = false) {
  const request = (0, _loaderUtils.urlToRequest)(url, // Maybe it is server-relative URLs
  forWebpackResolver && rootContext); // In case there is module request, send this to webpack resolver

  if (forWebpackResolver && isModuleImport.test(url)) {
    return [...new Set([request, url])];
  } // Keep in mind: ext can also be something like '.datepicker' when the true extension is omitted and the filename contains a dot.
  // @see https://github.com/webpack-contrib/sass-loader/issues/167


  const ext = _path.default.extname(request).toLowerCase(); // Because @import is also defined in CSS, Sass needs a way of compiling plain CSS @imports without trying to import the files at compile time.
  // To accomplish this, and to ensure SCSS is as much of a superset of CSS as possible, Sass will compile any @imports with the following characteristics to plain CSS imports:
  //  - imports where the URL ends with .css.
  //  - imports where the URL begins http:// or https://.
  //  - imports where the URL is written as a url().
  //  - imports that have media queries.
  //
  // The `node-sass` package sends `@import` ending on `.css` to importer, it is bug, so we skip resolve


  if (ext === '.css') {
    return [];
  }

  const dirname = _path.default.dirname(request);

  const basename = _path.default.basename(request);

  return [...new Set([`${dirname}/_${basename}`, request].concat(forWebpackResolver ? [`${_path.default.dirname(url)}/_${basename}`, url] : []))];
}

function promiseResolve(callbackResolve) {
  return (context, request) => new Promise((resolve, reject) => {
    callbackResolve(context, request, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

const IS_SPECIAL_MODULE_IMPORT = /^~[^/]+$/; // `[drive_letter]:\` + `\\[server]\[sharename]\`

const IS_NATIVE_WIN32_PATH = /^[a-z]:[/\\]|^\\\\/i;
/**
 * @public
 * Create the resolve function used in the custom Sass importer.
 *
 * Can be used by external tools to mimic how `sass-loader` works, for example
 * in a Jest transform. Such usages will want to wrap `resolve.create` from
 * [`enhanced-resolve`]{@link https://github.com/webpack/enhanced-resolve} to
 * pass as the `resolverFactory` argument.
 *
 * @param {Function} resolverFactory - A factory function for creating a Webpack
 *   resolver.
 * @param {Object} implementation - The imported Sass implementation, both
 *   `sass` (Dart Sass) and `node-sass` are supported.
 * @param {string[]} [includePaths] - The list of include paths passed to Sass.
 * @param {boolean} [rootContext] - The configured Webpack root context.
 *
 * @throws If a compatible Sass implementation cannot be found.
 */

function getWebpackResolver(resolverFactory, implementation, includePaths = [], rootContext = false) {
  async function startResolving(resolutionMap) {
    if (resolutionMap.length === 0) {
      return Promise.reject();
    }

    const [{
      possibleRequests
    }] = resolutionMap;

    if (possibleRequests.length === 0) {
      return Promise.reject();
    }

    const [{
      resolve,
      context
    }] = resolutionMap;

    try {
      return await resolve(context, possibleRequests[0]);
    } catch (_ignoreError) {
      const [, ...tailResult] = possibleRequests;

      if (tailResult.length === 0) {
        const [, ...tailResolutionMap] = resolutionMap;
        return startResolving(tailResolutionMap);
      } // eslint-disable-next-line no-param-reassign


      resolutionMap[0].possibleRequests = tailResult;
      return startResolving(resolutionMap);
    }
  }

  const isDartSass = implementation.info.includes('dart-sass');
  const sassResolve = promiseResolve(resolverFactory({
    alias: [],
    aliasFields: [],
    conditionNames: [],
    descriptionFiles: [],
    extensions: ['.sass', '.scss', '.css'],
    exportsFields: [],
    mainFields: [],
    mainFiles: ['_index', 'index'],
    modules: [],
    restrictions: [/\.((sa|sc|c)ss)$/i]
  }));
  const webpackResolve = promiseResolve(resolverFactory({
    conditionNames: ['sass', 'style'],
    mainFields: ['sass', 'style', 'main', '...'],
    mainFiles: ['_index', 'index', '...'],
    extensions: ['.sass', '.scss', '.css'],
    restrictions: [/\.((sa|sc|c)ss)$/i]
  }));
  return (context, request) => {
    const originalRequest = request;
    const isFileScheme = originalRequest.slice(0, 5).toLowerCase() === 'file:';

    if (isFileScheme) {
      try {
        // eslint-disable-next-line no-param-reassign
        request = _url.default.fileURLToPath(originalRequest);
      } catch (ignoreError) {
        // eslint-disable-next-line no-param-reassign
        request = request.slice(7);
      }
    }

    let resolutionMap = [];
    const needEmulateSassResolver = // `sass` doesn't support module import
    !IS_SPECIAL_MODULE_IMPORT.test(request) && // We need improve absolute paths handling.
    // Absolute paths should be resolved:
    // - Server-relative URLs - `<context>/path/to/file.ext` (where `<context>` is root context)
    // - Absolute path - `/full/path/to/file.ext` or `C:\\full\path\to\file.ext`
    !isFileScheme && !originalRequest.startsWith('/') && !IS_NATIVE_WIN32_PATH.test(originalRequest);

    if (includePaths.length > 0 && needEmulateSassResolver) {
      // The order of import precedence is as follows:
      //
      // 1. Filesystem imports relative to the base file.
      // 2. Custom importer imports.
      // 3. Filesystem imports relative to the working directory.
      // 4. Filesystem imports relative to an `includePaths` path.
      // 5. Filesystem imports relative to a `SASS_PATH` path.
      //
      // Because `sass`/`node-sass` run custom importers before `3`, `4` and `5` points, we need to emulate this behavior to avoid wrong resolution.
      const sassPossibleRequests = getPossibleRequests(request); // `node-sass` calls our importer before `1. Filesystem imports relative to the base file.`, so we need emulate this too

      if (!isDartSass) {
        resolutionMap = resolutionMap.concat({
          resolve: sassResolve,
          context: _path.default.dirname(context),
          possibleRequests: sassPossibleRequests
        });
      }

      resolutionMap = resolutionMap.concat( // eslint-disable-next-line no-shadow
      includePaths.map(context => ({
        resolve: sassResolve,
        context,
        possibleRequests: sassPossibleRequests
      })));
    }

    const webpackPossibleRequests = getPossibleRequests(request, true, rootContext);
    resolutionMap = resolutionMap.concat({
      resolve: webpackResolve,
      context: _path.default.dirname(context),
      possibleRequests: webpackPossibleRequests
    });
    return startResolving(resolutionMap);
  };
}

const matchCss = /\.css$/i;

function getWebpackImporter(loaderContext, implementation, includePaths) {
  const resolve = getWebpackResolver(loaderContext.getResolve, implementation, includePaths, loaderContext.rootContext);
  return (originalUrl, prev, done) => {
    resolve(prev, originalUrl).then(result => {
      // Add the result as dependency.
      // Although we're also using stats.includedFiles, this might come in handy when an error occurs.
      // In this case, we don't get stats.includedFiles from node-sass/sass.
      loaderContext.addDependency(_path.default.normalize(result)); // By removing the CSS file extension, we trigger node-sass to include the CSS file instead of just linking it.

      done({
        file: result.replace(matchCss, '')
      });
    }) // Catch all resolving errors, return the original file and pass responsibility back to other custom importers
    .catch(() => {
      done({
        file: originalUrl
      });
    });
  };
}

let nodeSassJobQueue = null;
/**
 * Verifies that the implementation and version of Sass is supported by this loader.
 *
 * @param {Object} implementation
 * @returns {Function}
 */

function getRenderFunctionFromSassImplementation(implementation) {
  const isDartSass = implementation.info.includes('dart-sass');

  if (isDartSass) {
    return implementation.render.bind(implementation);
  } // There is an issue with node-sass when async custom importers are used
  // See https://github.com/sass/node-sass/issues/857#issuecomment-93594360
  // We need to use a job queue to make sure that one thread is always available to the UV lib


  if (nodeSassJobQueue === null) {
    const threadPoolSize = Number(process.env.UV_THREADPOOL_SIZE || 4);
    nodeSassJobQueue = _neoAsync.default.queue(implementation.render.bind(implementation), threadPoolSize - 1);
  }

  return nodeSassJobQueue.push.bind(nodeSassJobQueue);
}

const ABSOLUTE_SCHEME = /^[A-Za-z0-9+\-.]+:/;

function getURLType(source) {
  if (source[0] === '/') {
    if (source[1] === '/') {
      return 'scheme-relative';
    }

    return 'path-absolute';
  }

  if (IS_NATIVE_WIN32_PATH.test(source)) {
    return 'path-absolute';
  }

  return ABSOLUTE_SCHEME.test(source) ? 'absolute' : 'path-relative';
}

function normalizeSourceMap(map, rootContext) {
  const newMap = map; // result.map.file is an optional property that provides the output filename.
  // Since we don't know the final filename in the webpack build chain yet, it makes no sense to have it.
  // eslint-disable-next-line no-param-reassign

  delete newMap.file; // eslint-disable-next-line no-param-reassign

  newMap.sourceRoot = ''; // node-sass returns POSIX paths, that's why we need to transform them back to native paths.
  // This fixes an error on windows where the source-map module cannot resolve the source maps.
  // @see https://github.com/webpack-contrib/sass-loader/issues/366#issuecomment-279460722
  // eslint-disable-next-line no-param-reassign

  newMap.sources = newMap.sources.map(source => {
    const sourceType = getURLType(source); // Do no touch `scheme-relative`, `path-absolute` and `absolute` types

    if (sourceType === 'path-relative') {
      return _path.default.resolve(rootContext, _path.default.normalize(source));
    }

    return source;
  });
  return newMap;
}

/***/ }),

/***/ 710:
/***/ ((module) => {

"use strict";
module.exports = require("loader-utils");;

/***/ }),

/***/ 386:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/neo-async");;

/***/ }),

/***/ 519:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/semver");;

/***/ }),

/***/ 622:
/***/ ((module) => {

"use strict";
module.exports = require("path");;

/***/ }),

/***/ 261:
/***/ ((module) => {

"use strict";
module.exports = require("sass");;

/***/ }),

/***/ 712:
/***/ ((module) => {

"use strict";
module.exports = require("schema-utils3");;

/***/ }),

/***/ 835:
/***/ ((module) => {

"use strict";
module.exports = require("url");;

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
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop)
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__webpack_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(52);
/******/ })()
;