module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 226:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var platform = __webpack_require__(87).platform();
var spawnSync = __webpack_require__(129).spawnSync;
var readdirSync = __webpack_require__(747).readdirSync;

var GLIBC = 'glibc';
var MUSL = 'musl';

var spawnOptions = {
  encoding: 'utf8',
  env: process.env
};

if (!spawnSync) {
  spawnSync = function () {
    return { status: 126, stdout: '', stderr: '' };
  };
}

function contains (needle) {
  return function (haystack) {
    return haystack.indexOf(needle) !== -1;
  };
}

function versionFromMuslLdd (out) {
  return out.split(/[\r\n]+/)[1].trim().split(/\s/)[1];
}

function safeReaddirSync (path) {
  try {
    return readdirSync(path);
  } catch (e) {}
  return [];
}

var family = '';
var version = '';
var method = '';

if (platform === 'linux') {
  // Try getconf
  var glibc = spawnSync('getconf', ['GNU_LIBC_VERSION'], spawnOptions);
  if (glibc.status === 0) {
    family = GLIBC;
    version = glibc.stdout.trim().split(' ')[1];
    method = 'getconf';
  } else {
    // Try ldd
    var ldd = spawnSync('ldd', ['--version'], spawnOptions);
    if (ldd.status === 0 && ldd.stdout.indexOf(MUSL) !== -1) {
      family = MUSL;
      version = versionFromMuslLdd(ldd.stdout);
      method = 'ldd';
    } else if (ldd.status === 1 && ldd.stderr.indexOf(MUSL) !== -1) {
      family = MUSL;
      version = versionFromMuslLdd(ldd.stderr);
      method = 'ldd';
    } else {
      // Try filesystem (family only)
      var lib = safeReaddirSync('/lib');
      if (lib.some(contains('-linux-gnu'))) {
        family = GLIBC;
        method = 'filesystem';
      } else if (lib.some(contains('libc.musl-'))) {
        family = MUSL;
        method = 'filesystem';
      } else if (lib.some(contains('ld-musl-'))) {
        family = MUSL;
        method = 'filesystem';
      } else {
        var usrSbin = safeReaddirSync('/usr/sbin');
        if (usrSbin.some(contains('glibc'))) {
          family = GLIBC;
          method = 'filesystem';
        }
      }
    }
  }
}

var isNonGlibcLinux = (family !== '' && family !== GLIBC);

module.exports = {
  GLIBC: GLIBC,
  MUSL: MUSL,
  family: family,
  version: version,
  method: method,
  isNonGlibcLinux: isNonGlibcLinux
};


/***/ }),

/***/ 65:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

if (process.fiberLib) {
	module.exports = process.fiberLib;
} else {
	var fs = __webpack_require__(747), path = __webpack_require__(622), detectLibc = __webpack_require__(226);

	// Seed random numbers [gh-82]
	Math.random();

	// Look for binary for this platform
	var modPath = path.join(__dirname, 'bin', process.platform+ '-'+ process.arch+ '-'+ process.versions.modules+
		((process.platform === 'linux') ? '-'+ detectLibc.family : ''), 'fibers');
	try {
		// Pull in fibers implementation
		process.fiberLib = module.exports = require(modPath).Fiber;
	} catch (ex) {
		// No binary!
		console.error(
			'## There is an issue with `node-fibers` ##\n'+
			'`'+ modPath+ '.node` is missing.\n\n'+
			'Try running this to fix the issue: '+ process.execPath+ ' '+ __dirname.replace(' ', '\\ ')+ '/build'
		);
		console.error(ex.stack || ex.message || ex);
		throw new Error('Missing binary. See message above.');
	}

	setupAsyncHacks(module.exports);
}

function setupAsyncHacks(Fiber) {
	// Older (or newer?) versions of node may not support this API
	try {
		var aw = process.binding('async_wrap');
		var getAsyncIdStackSize;

		if (aw.asyncIdStackSize instanceof Function) {
			getAsyncIdStackSize = aw.asyncIdStackSize;
		} else if (aw.constants.kStackLength !== undefined) {
			getAsyncIdStackSize = function(kStackLength) {
				return function() {
					return aw.async_hook_fields[kStackLength];
				};
			}(aw.constants.kStackLength);
		} else {
			throw new Error('Couldn\'t figure out how to get async stack size');
		}

		var popAsyncContext = aw.popAsyncContext || aw.popAsyncIds;
		var pushAsyncContext = aw.pushAsyncContext || aw.pushAsyncIds;
		if (!popAsyncContext || !pushAsyncContext) {
			throw new Error('Push/pop do not exist');
		}

		var kExecutionAsyncId;
		if (aw.constants.kExecutionAsyncId === undefined) {
			kExecutionAsyncId = aw.constants.kCurrentAsyncId;
		} else {
			kExecutionAsyncId = aw.constants.kExecutionAsyncId;
		}
		var kTriggerAsyncId;
		if (aw.constants.kTriggerAsyncId === undefined) {
			kTriggerAsyncId = aw.constants.kCurrentTriggerId;
		} else {
			kTriggerAsyncId = aw.constants.kTriggerAsyncId;
		}

		var asyncIds = aw.async_id_fields || aw.async_uid_fields;

		function getAndClearStack() {
			var ii = getAsyncIdStackSize();
			var stack = new Array(ii);
			for (; ii > 0; --ii) {
				var asyncId = asyncIds[kExecutionAsyncId];
				stack[ii - 1] = {
					asyncId: asyncId,
					triggerId: asyncIds[kTriggerAsyncId],
				};
				popAsyncContext(asyncId);
			}
			return stack;
		}

		function restoreStack(stack) {
			for (var ii = 0; ii < stack.length; ++ii) {
				pushAsyncContext(stack[ii].asyncId, stack[ii].triggerId);
			}
		}

		function wrapFunction(fn) {
			return function() {
				var stack = getAndClearStack();
				try {
					return fn.apply(this, arguments);
				} finally {
					restoreStack(stack);
				}
			}
		}

		// Monkey patch methods which may long jump
		Fiber.yield = wrapFunction(Fiber.yield);
		Fiber.prototype.run = wrapFunction(Fiber.prototype.run);
		Fiber.prototype.throwInto = wrapFunction(Fiber.prototype.throwInto);

	} catch (err) {
		return;
	}
}


/***/ }),

/***/ 129:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");;

/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");;

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
/******/ 	return __webpack_require__(65);
/******/ })()
;