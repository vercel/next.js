module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 318:
/***/ ((module) => {

function stringify (value, space) {
  return JSON.stringify(value, replacer, space)
}

function parse (text) {
  return JSON.parse(text, reviver)
}

function replacer (key, value) {
  if (isBufferLike(value)) {
    if (isArray(value.data)) {
      if (value.data.length > 0) {
        value.data = 'base64:' + Buffer.from(value.data).toString('base64')
      } else {
        value.data = ''
      }
    }
  }
  return value
}

function reviver (key, value) {
  if (isBufferLike(value)) {
    if (isArray(value.data)) {
      return Buffer.from(value.data)
    } else if (isString(value.data)) {
      if (value.data.startsWith('base64:')) {
        return Buffer.from(value.data.slice('base64:'.length), 'base64')
      }
      // Assume that the string is UTF-8 encoded (or empty).
      return Buffer.from(value.data)
    }
  }
  return value
}

function isBufferLike (x) {
  return (
    isObject(x) && x.type === 'Buffer' && (isArray(x.data) || isString(x.data))
  )
}

function isArray (x) {
  return Array.isArray(x)
}

function isString (x) {
  return typeof x === 'string'
}

function isObject (x) {
  return typeof x === 'object' && x !== null
}

module.exports = {
  stringify,
  parse,
  replacer,
  reviver
}


/***/ }),

/***/ 474:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


module.exports = __webpack_require__(38);

/***/ }),

/***/ 38:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.default = loader;
exports.pitch = pitch;
exports.raw = void 0;

/* eslint-disable
  import/order
*/
const fs = __webpack_require__(747);

const os = __webpack_require__(87);

const path = __webpack_require__(622);

const async = __webpack_require__(386);

const crypto = __webpack_require__(417);

const mkdirp = __webpack_require__(327);

const findCacheDir = __webpack_require__(844);

const BJSON = __webpack_require__(318);

const {
  getOptions
} = __webpack_require__(710);

const validateOptions = __webpack_require__(225);

const pkg = __webpack_require__(612);

const env = process.env.NODE_ENV || 'development';

const schema = __webpack_require__(819);

const defaults = {
  cacheContext: '',
  cacheDirectory: findCacheDir({
    name: 'cache-loader'
  }) || os.tmpdir(),
  cacheIdentifier: `cache-loader:${pkg.version} ${env}`,
  cacheKey,
  compare,
  precision: 0,
  read,
  readOnly: false,
  write
};

function pathWithCacheContext(cacheContext, originalPath) {
  if (!cacheContext) {
    return originalPath;
  }

  if (originalPath.includes(cacheContext)) {
    return originalPath.split('!').map(subPath => path.relative(cacheContext, subPath)).join('!');
  }

  return originalPath.split('!').map(subPath => path.resolve(cacheContext, subPath)).join('!');
}

function roundMs(mtime, precision) {
  return Math.floor(mtime / precision) * precision;
} // NOTE: We should only apply `pathWithCacheContext` transformations
// right before writing. Every other internal steps with the paths
// should be accomplish over absolute paths. Otherwise we have the risk
// to break watchpack -> chokidar watch logic  over webpack@4 --watch


function loader(...args) {
  const options = Object.assign({}, defaults, getOptions(this));
  validateOptions(schema, options, {
    name: 'Cache Loader',
    baseDataPath: 'options'
  });
  const {
    readOnly,
    write: writeFn
  } = options; // In case we are under a readOnly mode on cache-loader
  // we don't want to write or update any cache file

  if (readOnly) {
    this.callback(null, ...args);
    return;
  }

  const callback = this.async();
  const {
    data
  } = this;
  const dependencies = this.getDependencies().concat(this.loaders.map(l => l.path));
  const contextDependencies = this.getContextDependencies(); // Should the file get cached?

  let cache = true; // this.fs can be undefined
  // e.g when using the thread-loader
  // fallback to the fs module

  const FS = this.fs || fs;

  const toDepDetails = (dep, mapCallback) => {
    FS.stat(dep, (err, stats) => {
      if (err) {
        mapCallback(err);
        return;
      }

      const mtime = stats.mtime.getTime();

      if (mtime / 1000 >= Math.floor(data.startTime / 1000)) {
        // Don't trust mtime.
        // File was changed while compiling
        // or it could be an inaccurate filesystem.
        cache = false;
      }

      mapCallback(null, {
        path: pathWithCacheContext(options.cacheContext, dep),
        mtime
      });
    });
  };

  async.parallel([cb => async.mapLimit(dependencies, 20, toDepDetails, cb), cb => async.mapLimit(contextDependencies, 20, toDepDetails, cb)], (err, taskResults) => {
    if (err) {
      callback(null, ...args);
      return;
    }

    if (!cache) {
      callback(null, ...args);
      return;
    }

    const [deps, contextDeps] = taskResults;
    writeFn(data.cacheKey, {
      remainingRequest: pathWithCacheContext(options.cacheContext, data.remainingRequest),
      dependencies: deps,
      contextDependencies: contextDeps,
      result: args
    }, () => {
      // ignore errors here
      callback(null, ...args);
    });
  });
} // NOTE: We should apply `pathWithCacheContext` transformations
// right after reading. Every other internal steps with the paths
// should be accomplish over absolute paths. Otherwise we have the risk
// to break watchpack -> chokidar watch logic  over webpack@4 --watch


function pitch(remainingRequest, prevRequest, dataInput) {
  const options = Object.assign({}, defaults, getOptions(this));
  validateOptions(schema, options, {
    name: 'Cache Loader (Pitch)',
    baseDataPath: 'options'
  });
  const {
    cacheContext,
    cacheKey: cacheKeyFn,
    compare: compareFn,
    read: readFn,
    readOnly,
    precision
  } = options;
  const callback = this.async();
  const data = dataInput;
  data.remainingRequest = remainingRequest;
  data.cacheKey = cacheKeyFn(options, data.remainingRequest);
  readFn(data.cacheKey, (readErr, cacheData) => {
    if (readErr) {
      callback();
      return;
    } // We need to patch every path within data on cache with the cacheContext,
    // or it would cause problems when watching


    if (pathWithCacheContext(options.cacheContext, cacheData.remainingRequest) !== data.remainingRequest) {
      // in case of a hash conflict
      callback();
      return;
    }

    const FS = this.fs || fs;
    async.each(cacheData.dependencies.concat(cacheData.contextDependencies), (dep, eachCallback) => {
      // Applying reverse path transformation, in case they are relatives, when
      // reading from cache
      const contextDep = { ...dep,
        path: pathWithCacheContext(options.cacheContext, dep.path)
      };
      FS.stat(contextDep.path, (statErr, stats) => {
        if (statErr) {
          eachCallback(statErr);
          return;
        } // When we are under a readOnly config on cache-loader
        // we don't want to emit any other error than a
        // file stat error


        if (readOnly) {
          eachCallback();
          return;
        }

        const compStats = stats;
        const compDep = contextDep;

        if (precision > 1) {
          ['atime', 'mtime', 'ctime', 'birthtime'].forEach(key => {
            const msKey = `${key}Ms`;
            const ms = roundMs(stats[msKey], precision);
            compStats[msKey] = ms;
            compStats[key] = new Date(ms);
          });
          compDep.mtime = roundMs(dep.mtime, precision);
        } // If the compare function returns false
        // we not read from cache


        if (compareFn(compStats, compDep) !== true) {
          eachCallback(true);
          return;
        }

        eachCallback();
      });
    }, err => {
      if (err) {
        data.startTime = Date.now();
        callback();
        return;
      }

      cacheData.dependencies.forEach(dep => this.addDependency(pathWithCacheContext(cacheContext, dep.path)));
      cacheData.contextDependencies.forEach(dep => this.addContextDependency(pathWithCacheContext(cacheContext, dep.path)));
      callback(null, ...cacheData.result);
    });
  });
}

function digest(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

const directories = new Set();

function write(key, data, callback) {
  const dirname = path.dirname(key);
  const content = BJSON.stringify(data);

  if (directories.has(dirname)) {
    // for performance skip creating directory
    fs.writeFile(key, content, 'utf-8', callback);
  } else {
    mkdirp(dirname, mkdirErr => {
      if (mkdirErr) {
        callback(mkdirErr);
        return;
      }

      directories.add(dirname);
      fs.writeFile(key, content, 'utf-8', callback);
    });
  }
}

function read(key, callback) {
  fs.readFile(key, 'utf-8', (err, content) => {
    if (err) {
      callback(err);
      return;
    }

    try {
      const data = BJSON.parse(content);
      callback(null, data);
    } catch (e) {
      callback(e);
    }
  });
}

function cacheKey(options, request) {
  const {
    cacheIdentifier,
    cacheDirectory
  } = options;
  const hash = digest(`${cacheIdentifier}\n${request}`);
  return path.join(cacheDirectory, `${hash}.json`);
}

function compare(stats, dep) {
  return stats.mtime.getTime() === dep.mtime;
}

const raw = true;
exports.raw = raw;

/***/ }),

/***/ 819:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"type\":\"object\",\"properties\":{\"cacheContext\":{\"description\":\"The default cache context in order to generate the cache relatively to a path. By default it will use absolute paths.\",\"type\":\"string\"},\"cacheKey\":{\"description\":\"Allows you to override default cache key generator.\",\"instanceof\":\"Function\"},\"cacheIdentifier\":{\"description\":\"Provide a cache directory where cache items should be stored (used for default read/write implementation).\",\"type\":\"string\"},\"cacheDirectory\":{\"description\":\"Provide an invalidation identifier which is used to generate the hashes. You can use it for extra dependencies of loaders (used for default read/write implementation).\",\"type\":\"string\"},\"compare\":{\"description\":\"Allows you to override default comparison function between the cached dependency and the one is being read. Return true to use the cached resource.\",\"instanceof\":\"Function\"},\"precision\":{\"description\":\"Round mtime by this number of milliseconds both for stats and deps before passing those params to the comparing function.\",\"type\":\"number\"},\"read\":{\"description\":\"Allows you to override default read cache data from file.\",\"instanceof\":\"Function\"},\"readOnly\":{\"description\":\"Allows you to override default value and make the cache read only (useful for some environments where you don't want the cache to be updated, only read from it).\",\"type\":\"boolean\"},\"write\":{\"description\":\"Allows you to override default write cache data to file (e.g. Redis, memcached).\",\"instanceof\":\"Function\"}},\"additionalProperties\":false}");

/***/ }),

/***/ 612:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"name\":\"cache-loader\",\"version\":\"4.1.0\",\"description\":\"Caches the result of following loaders on disk.\",\"license\":\"MIT\",\"repository\":\"webpack-contrib/cache-loader\",\"author\":\"Tobias Koppers @sokra\",\"homepage\":\"https://github.com/webpack-contrib/cache-loader\",\"bugs\":\"https://github.com/webpack-contrib/cache-loader/issues\",\"main\":\"dist/cjs.js\",\"engines\":{\"node\":\">= 8.9.0\"},\"scripts\":{\"start\":\"npm run build -- -w\",\"prebuild\":\"npm run clean\",\"build\":\"cross-env NODE_ENV=production babel src -d dist --ignore \\\"src/**/*.test.js\\\" --copy-files\",\"clean\":\"del-cli dist\",\"commitlint\":\"commitlint --from=master\",\"lint:prettier\":\"prettier \\\"{**/*,*}.{js,json,md,yml,css}\\\" --list-different\",\"lint:js\":\"eslint --cache src test\",\"lint\":\"npm-run-all -l -p \\\"lint:**\\\"\",\"prepare\":\"npm run build\",\"release\":\"standard-version\",\"security\":\"npm audit\",\"test:only\":\"cross-env NODE_ENV=test jest\",\"test:watch\":\"cross-env NODE_ENV=test jest --watch\",\"test:coverage\":\"cross-env NODE_ENV=test jest --collectCoverageFrom=\\\"src/**/*.js\\\" --coverage\",\"pretest\":\"npm run lint\",\"test\":\"cross-env NODE_ENV=test npm run test:coverage\",\"defaults\":\"webpack-defaults\"},\"files\":[\"dist\"],\"peerDependencies\":{\"webpack\":\"^4.0.0\"},\"dependencies\":{\"buffer-json\":\"^2.0.0\",\"find-cache-dir\":\"^3.0.0\",\"loader-utils\":\"^1.2.3\",\"mkdirp\":\"^0.5.1\",\"neo-async\":\"^2.6.1\",\"schema-utils\":\"^2.0.0\"},\"devDependencies\":{\"@babel/cli\":\"^7.5.5\",\"@babel/core\":\"^7.5.5\",\"@babel/preset-env\":\"^7.5.5\",\"@commitlint/cli\":\"^8.1.0\",\"@commitlint/config-conventional\":\"^8.1.0\",\"@webpack-contrib/defaults\":\"^5.0.2\",\"@webpack-contrib/eslint-config-webpack\":\"^3.0.0\",\"babel-jest\":\"^24.8.0\",\"babel-loader\":\"^8.0.6\",\"commitlint-azure-pipelines-cli\":\"^1.0.2\",\"cross-env\":\"^5.2.0\",\"del\":\"^5.0.0\",\"del-cli\":\"^2.0.0\",\"eslint\":\"^6.0.1\",\"eslint-config-prettier\":\"^6.0.0\",\"eslint-plugin-import\":\"^2.18.0\",\"file-loader\":\"^4.1.0\",\"husky\":\"^3.0.0\",\"jest\":\"^24.8.0\",\"jest-junit\":\"^6.4.0\",\"lint-staged\":\"^9.2.0\",\"memory-fs\":\"^0.4.1\",\"normalize-path\":\"^3.0.0\",\"npm-run-all\":\"^4.1.5\",\"prettier\":\"^1.18.2\",\"standard-version\":\"^6.0.1\",\"uuid\":\"^3.3.2\",\"webpack\":\"^4.36.1\",\"webpack-cli\":\"^3.3.6\"},\"keywords\":[\"webpack\"]}");

/***/ }),

/***/ 417:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");;

/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");;

/***/ }),

/***/ 710:
/***/ ((module) => {

"use strict";
module.exports = require("loader-utils");;

/***/ }),

/***/ 844:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/find-cache-dir");;

/***/ }),

/***/ 327:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/mkdirp");;

/***/ }),

/***/ 386:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/neo-async");;

/***/ }),

/***/ 225:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/schema-utils");;

/***/ }),

/***/ 87:
/***/ ((module) => {

"use strict";
module.exports = require("os");;

/***/ }),

/***/ 622:
/***/ ((module) => {

"use strict";
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
/******/ 	return __webpack_require__(474);
/******/ })()
;