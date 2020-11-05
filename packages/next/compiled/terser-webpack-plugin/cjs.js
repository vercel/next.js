module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 7404:
/***/ ((module) => {

"use strict";


const pTry = (fn, ...arguments_) => new Promise(resolve => {
	resolve(fn(...arguments_));
});

module.exports = pTry;
// TODO: remove this in the next major version
module.exports.default = pTry;


/***/ }),

/***/ 8139:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

module.exports = __webpack_require__(6417).randomBytes


/***/ }),

/***/ 6393:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
Copyright (c) 2014, Yahoo! Inc. All rights reserved.
Copyrights licensed under the New BSD License.
See the accompanying LICENSE file for terms.
*/



var randomBytes = __webpack_require__(8139);

// Generate an internal UID to make the regexp pattern harder to guess.
var UID_LENGTH          = 16;
var UID                 = generateUID();
var PLACE_HOLDER_REGEXP = new RegExp('(\\\\)?"@__(F|R|D|M|S|U|I|B)-' + UID + '-(\\d+)__@"', 'g');

var IS_NATIVE_CODE_REGEXP = /\{\s*\[native code\]\s*\}/g;
var IS_PURE_FUNCTION = /function.*?\(/;
var IS_ARROW_FUNCTION = /.*?=>.*?/;
var UNSAFE_CHARS_REGEXP   = /[<>\/\u2028\u2029]/g;

var RESERVED_SYMBOLS = ['*', 'async'];

// Mapping of unsafe HTML and invalid JavaScript line terminator chars to their
// Unicode char counterparts which are safe to use in JavaScript strings.
var ESCAPED_CHARS = {
    '<'     : '\\u003C',
    '>'     : '\\u003E',
    '/'     : '\\u002F',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029'
};

function escapeUnsafeChars(unsafeChar) {
    return ESCAPED_CHARS[unsafeChar];
}

function generateUID() {
    var bytes = randomBytes(UID_LENGTH);
    var result = '';
    for(var i=0; i<UID_LENGTH; ++i) {
        result += bytes[i].toString(16);
    }
    return result;
}

function deleteFunctions(obj){
    var functionKeys = [];
    for (var key in obj) {
        if (typeof obj[key] === "function") {
            functionKeys.push(key);
        }
    }
    for (var i = 0; i < functionKeys.length; i++) {
        delete obj[functionKeys[i]];
    }
}

module.exports = function serialize(obj, options) {
    options || (options = {});

    // Backwards-compatibility for `space` as the second argument.
    if (typeof options === 'number' || typeof options === 'string') {
        options = {space: options};
    }

    var functions = [];
    var regexps   = [];
    var dates     = [];
    var maps      = [];
    var sets      = [];
    var undefs    = [];
    var infinities= [];
    var bigInts = [];

    // Returns placeholders for functions and regexps (identified by index)
    // which are later replaced by their string representation.
    function replacer(key, value) {

        // For nested function
        if(options.ignoreFunction){
            deleteFunctions(value);
        }

        if (!value && value !== undefined) {
            return value;
        }

        // If the value is an object w/ a toJSON method, toJSON is called before
        // the replacer runs, so we use this[key] to get the non-toJSONed value.
        var origValue = this[key];
        var type = typeof origValue;

        if (type === 'object') {
            if(origValue instanceof RegExp) {
                return '@__R-' + UID + '-' + (regexps.push(origValue) - 1) + '__@';
            }

            if(origValue instanceof Date) {
                return '@__D-' + UID + '-' + (dates.push(origValue) - 1) + '__@';
            }

            if(origValue instanceof Map) {
                return '@__M-' + UID + '-' + (maps.push(origValue) - 1) + '__@';
            }

            if(origValue instanceof Set) {
                return '@__S-' + UID + '-' + (sets.push(origValue) - 1) + '__@';
            }
        }

        if (type === 'function') {
            return '@__F-' + UID + '-' + (functions.push(origValue) - 1) + '__@';
        }

        if (type === 'undefined') {
            return '@__U-' + UID + '-' + (undefs.push(origValue) - 1) + '__@';
        }

        if (type === 'number' && !isNaN(origValue) && !isFinite(origValue)) {
            return '@__I-' + UID + '-' + (infinities.push(origValue) - 1) + '__@';
        }

        if (type === 'bigint') {
            return '@__B-' + UID + '-' + (bigInts.push(origValue) - 1) + '__@';
        }

        return value;
    }

    function serializeFunc(fn) {
      var serializedFn = fn.toString();
      if (IS_NATIVE_CODE_REGEXP.test(serializedFn)) {
          throw new TypeError('Serializing native function: ' + fn.name);
      }

      // pure functions, example: {key: function() {}}
      if(IS_PURE_FUNCTION.test(serializedFn)) {
          return serializedFn;
      }

      // arrow functions, example: arg1 => arg1+5
      if(IS_ARROW_FUNCTION.test(serializedFn)) {
          return serializedFn;
      }

      var argsStartsAt = serializedFn.indexOf('(');
      var def = serializedFn.substr(0, argsStartsAt)
        .trim()
        .split(' ')
        .filter(function(val) { return val.length > 0 });

      var nonReservedSymbols = def.filter(function(val) {
        return RESERVED_SYMBOLS.indexOf(val) === -1
      });

      // enhanced literal objects, example: {key() {}}
      if(nonReservedSymbols.length > 0) {
          return (def.indexOf('async') > -1 ? 'async ' : '') + 'function'
            + (def.join('').indexOf('*') > -1 ? '*' : '')
            + serializedFn.substr(argsStartsAt);
      }

      // arrow functions
      return serializedFn;
    }

    // Check if the parameter is function
    if (options.ignoreFunction && typeof obj === "function") {
        obj = undefined;
    }
    // Protects against `JSON.stringify()` returning `undefined`, by serializing
    // to the literal string: "undefined".
    if (obj === undefined) {
        return String(obj);
    }

    var str;

    // Creates a JSON string representation of the value.
    // NOTE: Node 0.12 goes into slow mode with extra JSON.stringify() args.
    if (options.isJSON && !options.space) {
        str = JSON.stringify(obj);
    } else {
        str = JSON.stringify(obj, options.isJSON ? null : replacer, options.space);
    }

    // Protects against `JSON.stringify()` returning `undefined`, by serializing
    // to the literal string: "undefined".
    if (typeof str !== 'string') {
        return String(str);
    }

    // Replace unsafe HTML and invalid JavaScript line terminator chars with
    // their safe Unicode char counterpart. This _must_ happen before the
    // regexps and functions are serialized and added back to the string.
    if (options.unsafe !== true) {
        str = str.replace(UNSAFE_CHARS_REGEXP, escapeUnsafeChars);
    }

    if (functions.length === 0 && regexps.length === 0 && dates.length === 0 && maps.length === 0 && sets.length === 0 && undefs.length === 0 && infinities.length === 0 && bigInts.length === 0) {
        return str;
    }

    // Replaces all occurrences of function, regexp, date, map and set placeholders in the
    // JSON string with their string representations. If the original value can
    // not be found, then `undefined` is used.
    return str.replace(PLACE_HOLDER_REGEXP, function (match, backSlash, type, valueIndex) {
        // The placeholder may not be preceded by a backslash. This is to prevent
        // replacing things like `"a\"@__R-<UID>-0__@"` and thus outputting
        // invalid JS.
        if (backSlash) {
            return match;
        }

        if (type === 'D') {
            return "new Date(\"" + dates[valueIndex].toISOString() + "\")";
        }

        if (type === 'R') {
            return "new RegExp(" + serialize(regexps[valueIndex].source) + ", \"" + regexps[valueIndex].flags + "\")";
        }

        if (type === 'M') {
            return "new Map(" + serialize(Array.from(maps[valueIndex].entries()), options) + ")";
        }

        if (type === 'S') {
            return "new Set(" + serialize(Array.from(sets[valueIndex].values()), options) + ")";
        }

        if (type === 'U') {
            return 'undefined'
        }

        if (type === 'I') {
            return infinities[valueIndex];
        }

        if (type === 'B') {
            return "BigInt(\"" + bigInts[valueIndex] + "\")";
        }

        var fn = functions[valueIndex];

        return serializeFunc(fn);
    });
}


/***/ }),

/***/ 8151:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class AsyncParallelBailHookCodeFactory extends HookCodeFactory {
	content({ onError, onResult, onDone }) {
		let code = "";
		code += `var _results = new Array(${this.options.taps.length});\n`;
		code += "var _checkDone = () => {\n";
		code += "for(var i = 0; i < _results.length; i++) {\n";
		code += "var item = _results[i];\n";
		code += "if(item === undefined) return false;\n";
		code += "if(item.result !== undefined) {\n";
		code += onResult("item.result");
		code += "return true;\n";
		code += "}\n";
		code += "if(item.error) {\n";
		code += onError("item.error");
		code += "return true;\n";
		code += "}\n";
		code += "}\n";
		code += "return false;\n";
		code += "}\n";
		code += this.callTapsParallel({
			onError: (i, err, done, doneBreak) => {
				let code = "";
				code += `if(${i} < _results.length && ((_results.length = ${i +
					1}), (_results[${i}] = { error: ${err} }), _checkDone())) {\n`;
				code += doneBreak(true);
				code += "} else {\n";
				code += done();
				code += "}\n";
				return code;
			},
			onResult: (i, result, done, doneBreak) => {
				let code = "";
				code += `if(${i} < _results.length && (${result} !== undefined && (_results.length = ${i +
					1}), (_results[${i}] = { result: ${result} }), _checkDone())) {\n`;
				code += doneBreak(true);
				code += "} else {\n";
				code += done();
				code += "}\n";
				return code;
			},
			onTap: (i, run, done, doneBreak) => {
				let code = "";
				if (i > 0) {
					code += `if(${i} >= _results.length) {\n`;
					code += done();
					code += "} else {\n";
				}
				code += run();
				if (i > 0) code += "}\n";
				return code;
			},
			onDone
		});
		return code;
	}
}

const factory = new AsyncParallelBailHookCodeFactory();

class AsyncParallelBailHook extends Hook {
	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

Object.defineProperties(AsyncParallelBailHook.prototype, {
	_call: { value: undefined, configurable: true, writable: true }
});

module.exports = AsyncParallelBailHook;


/***/ }),

/***/ 1684:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class AsyncParallelHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone }) {
		return this.callTapsParallel({
			onError: (i, err, done, doneBreak) => onError(err) + doneBreak(true),
			onDone
		});
	}
}

const factory = new AsyncParallelHookCodeFactory();

class AsyncParallelHook extends Hook {
	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

Object.defineProperties(AsyncParallelHook.prototype, {
	_call: { value: undefined, configurable: true, writable: true }
});

module.exports = AsyncParallelHook;


/***/ }),

/***/ 5734:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class AsyncSeriesBailHookCodeFactory extends HookCodeFactory {
	content({ onError, onResult, resultReturns, onDone }) {
		return this.callTapsSeries({
			onError: (i, err, next, doneBreak) => onError(err) + doneBreak(true),
			onResult: (i, result, next) =>
				`if(${result} !== undefined) {\n${onResult(
					result
				)};\n} else {\n${next()}}\n`,
			resultReturns,
			onDone
		});
	}
}

const factory = new AsyncSeriesBailHookCodeFactory();

class AsyncSeriesBailHook extends Hook {
	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

Object.defineProperties(AsyncSeriesBailHook.prototype, {
	_call: { value: undefined, configurable: true, writable: true }
});

module.exports = AsyncSeriesBailHook;


/***/ }),

/***/ 6496:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class AsyncSeriesHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone }) {
		return this.callTapsSeries({
			onError: (i, err, next, doneBreak) => onError(err) + doneBreak(true),
			onDone
		});
	}
}

const factory = new AsyncSeriesHookCodeFactory();

class AsyncSeriesHook extends Hook {
	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

Object.defineProperties(AsyncSeriesHook.prototype, {
	_call: { value: undefined, configurable: true, writable: true }
});

module.exports = AsyncSeriesHook;


/***/ }),

/***/ 8118:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class AsyncSeriesWaterfallHookCodeFactory extends HookCodeFactory {
	content({ onError, onResult, onDone }) {
		return this.callTapsSeries({
			onError: (i, err, next, doneBreak) => onError(err) + doneBreak(true),
			onResult: (i, result, next) => {
				let code = "";
				code += `if(${result} !== undefined) {\n`;
				code += `${this._args[0]} = ${result};\n`;
				code += `}\n`;
				code += next();
				return code;
			},
			onDone: () => onResult(this._args[0])
		});
	}
}

const factory = new AsyncSeriesWaterfallHookCodeFactory();

class AsyncSeriesWaterfallHook extends Hook {
	constructor(args) {
		super(args);
		if (args.length < 1)
			throw new Error("Waterfall hooks must have at least one argument");
	}

	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

Object.defineProperties(AsyncSeriesWaterfallHook.prototype, {
	_call: { value: undefined, configurable: true, writable: true }
});

module.exports = AsyncSeriesWaterfallHook;


/***/ }),

/***/ 1468:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


class Hook {
	constructor(args) {
		if (!Array.isArray(args)) args = [];
		this._args = args;
		this.taps = [];
		this.interceptors = [];
		this.call = this._call;
		this.promise = this._promise;
		this.callAsync = this._callAsync;
		this._x = undefined;
	}

	compile(options) {
		throw new Error("Abstract: should be overriden");
	}

	_createCall(type) {
		return this.compile({
			taps: this.taps,
			interceptors: this.interceptors,
			args: this._args,
			type: type
		});
	}

	tap(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tap(options: Object, fn: function)"
			);
		options = Object.assign({ type: "sync", fn: fn }, options);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tap");
		options = this._runRegisterInterceptors(options);
		this._insert(options);
	}

	tapAsync(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tapAsync(options: Object, fn: function)"
			);
		options = Object.assign({ type: "async", fn: fn }, options);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tapAsync");
		options = this._runRegisterInterceptors(options);
		this._insert(options);
	}

	tapPromise(options, fn) {
		if (typeof options === "string") options = { name: options };
		if (typeof options !== "object" || options === null)
			throw new Error(
				"Invalid arguments to tapPromise(options: Object, fn: function)"
			);
		options = Object.assign({ type: "promise", fn: fn }, options);
		if (typeof options.name !== "string" || options.name === "")
			throw new Error("Missing name for tapPromise");
		options = this._runRegisterInterceptors(options);
		this._insert(options);
	}

	_runRegisterInterceptors(options) {
		for (const interceptor of this.interceptors) {
			if (interceptor.register) {
				const newOptions = interceptor.register(options);
				if (newOptions !== undefined) options = newOptions;
			}
		}
		return options;
	}

	withOptions(options) {
		const mergeOptions = opt =>
			Object.assign({}, options, typeof opt === "string" ? { name: opt } : opt);

		// Prevent creating endless prototype chains
		options = Object.assign({}, options, this._withOptions);
		const base = this._withOptionsBase || this;
		const newHook = Object.create(base);

		(newHook.tapAsync = (opt, fn) => base.tapAsync(mergeOptions(opt), fn)),
			(newHook.tap = (opt, fn) => base.tap(mergeOptions(opt), fn));
		newHook.tapPromise = (opt, fn) => base.tapPromise(mergeOptions(opt), fn);
		newHook._withOptions = options;
		newHook._withOptionsBase = base;
		return newHook;
	}

	isUsed() {
		return this.taps.length > 0 || this.interceptors.length > 0;
	}

	intercept(interceptor) {
		this._resetCompilation();
		this.interceptors.push(Object.assign({}, interceptor));
		if (interceptor.register) {
			for (let i = 0; i < this.taps.length; i++)
				this.taps[i] = interceptor.register(this.taps[i]);
		}
	}

	_resetCompilation() {
		this.call = this._call;
		this.callAsync = this._callAsync;
		this.promise = this._promise;
	}

	_insert(item) {
		this._resetCompilation();
		let before;
		if (typeof item.before === "string") before = new Set([item.before]);
		else if (Array.isArray(item.before)) {
			before = new Set(item.before);
		}
		let stage = 0;
		if (typeof item.stage === "number") stage = item.stage;
		let i = this.taps.length;
		while (i > 0) {
			i--;
			const x = this.taps[i];
			this.taps[i + 1] = x;
			const xStage = x.stage || 0;
			if (before) {
				if (before.has(x.name)) {
					before.delete(x.name);
					continue;
				}
				if (before.size > 0) {
					continue;
				}
			}
			if (xStage > stage) {
				continue;
			}
			i++;
			break;
		}
		this.taps[i] = item;
	}
}

function createCompileDelegate(name, type) {
	return function lazyCompileHook(...args) {
		this[name] = this._createCall(type);
		return this[name](...args);
	};
}

Object.defineProperties(Hook.prototype, {
	_call: {
		value: createCompileDelegate("call", "sync"),
		configurable: true,
		writable: true
	},
	_promise: {
		value: createCompileDelegate("promise", "promise"),
		configurable: true,
		writable: true
	},
	_callAsync: {
		value: createCompileDelegate("callAsync", "async"),
		configurable: true,
		writable: true
	}
});

module.exports = Hook;


/***/ }),

/***/ 6443:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


class HookCodeFactory {
	constructor(config) {
		this.config = config;
		this.options = undefined;
		this._args = undefined;
	}

	create(options) {
		this.init(options);
		let fn;
		switch (this.options.type) {
			case "sync":
				fn = new Function(
					this.args(),
					'"use strict";\n' +
						this.header() +
						this.content({
							onError: err => `throw ${err};\n`,
							onResult: result => `return ${result};\n`,
							resultReturns: true,
							onDone: () => "",
							rethrowIfPossible: true
						})
				);
				break;
			case "async":
				fn = new Function(
					this.args({
						after: "_callback"
					}),
					'"use strict";\n' +
						this.header() +
						this.content({
							onError: err => `_callback(${err});\n`,
							onResult: result => `_callback(null, ${result});\n`,
							onDone: () => "_callback();\n"
						})
				);
				break;
			case "promise":
				let errorHelperUsed = false;
				const content = this.content({
					onError: err => {
						errorHelperUsed = true;
						return `_error(${err});\n`;
					},
					onResult: result => `_resolve(${result});\n`,
					onDone: () => "_resolve();\n"
				});
				let code = "";
				code += '"use strict";\n';
				code += "return new Promise((_resolve, _reject) => {\n";
				if (errorHelperUsed) {
					code += "var _sync = true;\n";
					code += "function _error(_err) {\n";
					code += "if(_sync)\n";
					code += "_resolve(Promise.resolve().then(() => { throw _err; }));\n";
					code += "else\n";
					code += "_reject(_err);\n";
					code += "};\n";
				}
				code += this.header();
				code += content;
				if (errorHelperUsed) {
					code += "_sync = false;\n";
				}
				code += "});\n";
				fn = new Function(this.args(), code);
				break;
		}
		this.deinit();
		return fn;
	}

	setup(instance, options) {
		instance._x = options.taps.map(t => t.fn);
	}

	/**
	 * @param {{ type: "sync" | "promise" | "async", taps: Array<Tap>, interceptors: Array<Interceptor> }} options
	 */
	init(options) {
		this.options = options;
		this._args = options.args.slice();
	}

	deinit() {
		this.options = undefined;
		this._args = undefined;
	}

	header() {
		let code = "";
		if (this.needContext()) {
			code += "var _context = {};\n";
		} else {
			code += "var _context;\n";
		}
		code += "var _x = this._x;\n";
		if (this.options.interceptors.length > 0) {
			code += "var _taps = this.taps;\n";
			code += "var _interceptors = this.interceptors;\n";
		}
		for (let i = 0; i < this.options.interceptors.length; i++) {
			const interceptor = this.options.interceptors[i];
			if (interceptor.call) {
				code += `${this.getInterceptor(i)}.call(${this.args({
					before: interceptor.context ? "_context" : undefined
				})});\n`;
			}
		}
		return code;
	}

	needContext() {
		for (const tap of this.options.taps) if (tap.context) return true;
		return false;
	}

	callTap(tapIndex, { onError, onResult, onDone, rethrowIfPossible }) {
		let code = "";
		let hasTapCached = false;
		for (let i = 0; i < this.options.interceptors.length; i++) {
			const interceptor = this.options.interceptors[i];
			if (interceptor.tap) {
				if (!hasTapCached) {
					code += `var _tap${tapIndex} = ${this.getTap(tapIndex)};\n`;
					hasTapCached = true;
				}
				code += `${this.getInterceptor(i)}.tap(${
					interceptor.context ? "_context, " : ""
				}_tap${tapIndex});\n`;
			}
		}
		code += `var _fn${tapIndex} = ${this.getTapFn(tapIndex)};\n`;
		const tap = this.options.taps[tapIndex];
		switch (tap.type) {
			case "sync":
				if (!rethrowIfPossible) {
					code += `var _hasError${tapIndex} = false;\n`;
					code += "try {\n";
				}
				if (onResult) {
					code += `var _result${tapIndex} = _fn${tapIndex}(${this.args({
						before: tap.context ? "_context" : undefined
					})});\n`;
				} else {
					code += `_fn${tapIndex}(${this.args({
						before: tap.context ? "_context" : undefined
					})});\n`;
				}
				if (!rethrowIfPossible) {
					code += "} catch(_err) {\n";
					code += `_hasError${tapIndex} = true;\n`;
					code += onError("_err");
					code += "}\n";
					code += `if(!_hasError${tapIndex}) {\n`;
				}
				if (onResult) {
					code += onResult(`_result${tapIndex}`);
				}
				if (onDone) {
					code += onDone();
				}
				if (!rethrowIfPossible) {
					code += "}\n";
				}
				break;
			case "async":
				let cbCode = "";
				if (onResult) cbCode += `(_err${tapIndex}, _result${tapIndex}) => {\n`;
				else cbCode += `_err${tapIndex} => {\n`;
				cbCode += `if(_err${tapIndex}) {\n`;
				cbCode += onError(`_err${tapIndex}`);
				cbCode += "} else {\n";
				if (onResult) {
					cbCode += onResult(`_result${tapIndex}`);
				}
				if (onDone) {
					cbCode += onDone();
				}
				cbCode += "}\n";
				cbCode += "}";
				code += `_fn${tapIndex}(${this.args({
					before: tap.context ? "_context" : undefined,
					after: cbCode
				})});\n`;
				break;
			case "promise":
				code += `var _hasResult${tapIndex} = false;\n`;
				code += `var _promise${tapIndex} = _fn${tapIndex}(${this.args({
					before: tap.context ? "_context" : undefined
				})});\n`;
				code += `if (!_promise${tapIndex} || !_promise${tapIndex}.then)\n`;
				code += `  throw new Error('Tap function (tapPromise) did not return promise (returned ' + _promise${tapIndex} + ')');\n`;
				code += `_promise${tapIndex}.then(_result${tapIndex} => {\n`;
				code += `_hasResult${tapIndex} = true;\n`;
				if (onResult) {
					code += onResult(`_result${tapIndex}`);
				}
				if (onDone) {
					code += onDone();
				}
				code += `}, _err${tapIndex} => {\n`;
				code += `if(_hasResult${tapIndex}) throw _err${tapIndex};\n`;
				code += onError(`_err${tapIndex}`);
				code += "});\n";
				break;
		}
		return code;
	}

	callTapsSeries({
		onError,
		onResult,
		resultReturns,
		onDone,
		doneReturns,
		rethrowIfPossible
	}) {
		if (this.options.taps.length === 0) return onDone();
		const firstAsync = this.options.taps.findIndex(t => t.type !== "sync");
		const somethingReturns = resultReturns || doneReturns || false;
		let code = "";
		let current = onDone;
		for (let j = this.options.taps.length - 1; j >= 0; j--) {
			const i = j;
			const unroll = current !== onDone && this.options.taps[i].type !== "sync";
			if (unroll) {
				code += `function _next${i}() {\n`;
				code += current();
				code += `}\n`;
				current = () => `${somethingReturns ? "return " : ""}_next${i}();\n`;
			}
			const done = current;
			const doneBreak = skipDone => {
				if (skipDone) return "";
				return onDone();
			};
			const content = this.callTap(i, {
				onError: error => onError(i, error, done, doneBreak),
				onResult:
					onResult &&
					(result => {
						return onResult(i, result, done, doneBreak);
					}),
				onDone: !onResult && done,
				rethrowIfPossible:
					rethrowIfPossible && (firstAsync < 0 || i < firstAsync)
			});
			current = () => content;
		}
		code += current();
		return code;
	}

	callTapsLooping({ onError, onDone, rethrowIfPossible }) {
		if (this.options.taps.length === 0) return onDone();
		const syncOnly = this.options.taps.every(t => t.type === "sync");
		let code = "";
		if (!syncOnly) {
			code += "var _looper = () => {\n";
			code += "var _loopAsync = false;\n";
		}
		code += "var _loop;\n";
		code += "do {\n";
		code += "_loop = false;\n";
		for (let i = 0; i < this.options.interceptors.length; i++) {
			const interceptor = this.options.interceptors[i];
			if (interceptor.loop) {
				code += `${this.getInterceptor(i)}.loop(${this.args({
					before: interceptor.context ? "_context" : undefined
				})});\n`;
			}
		}
		code += this.callTapsSeries({
			onError,
			onResult: (i, result, next, doneBreak) => {
				let code = "";
				code += `if(${result} !== undefined) {\n`;
				code += "_loop = true;\n";
				if (!syncOnly) code += "if(_loopAsync) _looper();\n";
				code += doneBreak(true);
				code += `} else {\n`;
				code += next();
				code += `}\n`;
				return code;
			},
			onDone:
				onDone &&
				(() => {
					let code = "";
					code += "if(!_loop) {\n";
					code += onDone();
					code += "}\n";
					return code;
				}),
			rethrowIfPossible: rethrowIfPossible && syncOnly
		});
		code += "} while(_loop);\n";
		if (!syncOnly) {
			code += "_loopAsync = true;\n";
			code += "};\n";
			code += "_looper();\n";
		}
		return code;
	}

	callTapsParallel({
		onError,
		onResult,
		onDone,
		rethrowIfPossible,
		onTap = (i, run) => run()
	}) {
		if (this.options.taps.length <= 1) {
			return this.callTapsSeries({
				onError,
				onResult,
				onDone,
				rethrowIfPossible
			});
		}
		let code = "";
		code += "do {\n";
		code += `var _counter = ${this.options.taps.length};\n`;
		if (onDone) {
			code += "var _done = () => {\n";
			code += onDone();
			code += "};\n";
		}
		for (let i = 0; i < this.options.taps.length; i++) {
			const done = () => {
				if (onDone) return "if(--_counter === 0) _done();\n";
				else return "--_counter;";
			};
			const doneBreak = skipDone => {
				if (skipDone || !onDone) return "_counter = 0;\n";
				else return "_counter = 0;\n_done();\n";
			};
			code += "if(_counter <= 0) break;\n";
			code += onTap(
				i,
				() =>
					this.callTap(i, {
						onError: error => {
							let code = "";
							code += "if(_counter > 0) {\n";
							code += onError(i, error, done, doneBreak);
							code += "}\n";
							return code;
						},
						onResult:
							onResult &&
							(result => {
								let code = "";
								code += "if(_counter > 0) {\n";
								code += onResult(i, result, done, doneBreak);
								code += "}\n";
								return code;
							}),
						onDone:
							!onResult &&
							(() => {
								return done();
							}),
						rethrowIfPossible
					}),
				done,
				doneBreak
			);
		}
		code += "} while(false);\n";
		return code;
	}

	args({ before, after } = {}) {
		let allArgs = this._args;
		if (before) allArgs = [before].concat(allArgs);
		if (after) allArgs = allArgs.concat(after);
		if (allArgs.length === 0) {
			return "";
		} else {
			return allArgs.join(", ");
		}
	}

	getTapFn(idx) {
		return `_x[${idx}]`;
	}

	getTap(idx) {
		return `_taps[${idx}]`;
	}

	getInterceptor(idx) {
		return `_interceptors[${idx}]`;
	}
}

module.exports = HookCodeFactory;


/***/ }),

/***/ 7079:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


class HookMap {
	constructor(factory) {
		this._map = new Map();
		this._factory = factory;
		this._interceptors = [];
	}

	get(key) {
		return this._map.get(key);
	}

	for(key) {
		const hook = this.get(key);
		if (hook !== undefined) {
			return hook;
		}
		let newHook = this._factory(key);
		const interceptors = this._interceptors;
		for (let i = 0; i < interceptors.length; i++) {
			newHook = interceptors[i].factory(key, newHook);
		}
		this._map.set(key, newHook);
		return newHook;
	}

	intercept(interceptor) {
		this._interceptors.push(
			Object.assign(
				{
					factory: (key, hook) => hook
				},
				interceptor
			)
		);
	}

	tap(key, options, fn) {
		return this.for(key).tap(options, fn);
	}

	tapAsync(key, options, fn) {
		return this.for(key).tapAsync(options, fn);
	}

	tapPromise(key, options, fn) {
		return this.for(key).tapPromise(options, fn);
	}
}

module.exports = HookMap;


/***/ }),

/***/ 3103:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);

class MultiHook {
	constructor(hooks) {
		this.hooks = hooks;
	}

	tap(options, fn) {
		for (const hook of this.hooks) {
			hook.tap(options, fn);
		}
	}

	tapAsync(options, fn) {
		for (const hook of this.hooks) {
			hook.tapAsync(options, fn);
		}
	}

	tapPromise(options, fn) {
		for (const hook of this.hooks) {
			hook.tapPromise(options, fn);
		}
	}

	isUsed() {
		for (const hook of this.hooks) {
			if (hook.isUsed()) return true;
		}
		return false;
	}

	intercept(interceptor) {
		for (const hook of this.hooks) {
			hook.intercept(interceptor);
		}
	}

	withOptions(options) {
		return new MultiHook(this.hooks.map(h => h.withOptions(options)));
	}
}

module.exports = MultiHook;


/***/ }),

/***/ 1626:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class SyncBailHookCodeFactory extends HookCodeFactory {
	content({ onError, onResult, resultReturns, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onResult: (i, result, next) =>
				`if(${result} !== undefined) {\n${onResult(
					result
				)};\n} else {\n${next()}}\n`,
			resultReturns,
			onDone,
			rethrowIfPossible
		});
	}
}

const factory = new SyncBailHookCodeFactory();

class SyncBailHook extends Hook {
	tapAsync() {
		throw new Error("tapAsync is not supported on a SyncBailHook");
	}

	tapPromise() {
		throw new Error("tapPromise is not supported on a SyncBailHook");
	}

	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

module.exports = SyncBailHook;


/***/ }),

/***/ 9689:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class SyncHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}

const factory = new SyncHookCodeFactory();

class SyncHook extends Hook {
	tapAsync() {
		throw new Error("tapAsync is not supported on a SyncHook");
	}

	tapPromise() {
		throw new Error("tapPromise is not supported on a SyncHook");
	}

	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

module.exports = SyncHook;


/***/ }),

/***/ 179:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class SyncLoopHookCodeFactory extends HookCodeFactory {
	content({ onError, onDone, rethrowIfPossible }) {
		return this.callTapsLooping({
			onError: (i, err) => onError(err),
			onDone,
			rethrowIfPossible
		});
	}
}

const factory = new SyncLoopHookCodeFactory();

class SyncLoopHook extends Hook {
	tapAsync() {
		throw new Error("tapAsync is not supported on a SyncLoopHook");
	}

	tapPromise() {
		throw new Error("tapPromise is not supported on a SyncLoopHook");
	}

	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

module.exports = SyncLoopHook;


/***/ }),

/***/ 6093:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Hook = __webpack_require__(1468);
const HookCodeFactory = __webpack_require__(6443);

class SyncWaterfallHookCodeFactory extends HookCodeFactory {
	content({ onError, onResult, resultReturns, rethrowIfPossible }) {
		return this.callTapsSeries({
			onError: (i, err) => onError(err),
			onResult: (i, result, next) => {
				let code = "";
				code += `if(${result} !== undefined) {\n`;
				code += `${this._args[0]} = ${result};\n`;
				code += `}\n`;
				code += next();
				return code;
			},
			onDone: () => onResult(this._args[0]),
			doneReturns: resultReturns,
			rethrowIfPossible
		});
	}
}

const factory = new SyncWaterfallHookCodeFactory();

class SyncWaterfallHook extends Hook {
	constructor(args) {
		super(args);
		if (args.length < 1)
			throw new Error("Waterfall hooks must have at least one argument");
	}

	tapAsync() {
		throw new Error("tapAsync is not supported on a SyncWaterfallHook");
	}

	tapPromise() {
		throw new Error("tapPromise is not supported on a SyncWaterfallHook");
	}

	compile(options) {
		factory.setup(this, options);
		return factory.create(options);
	}
}

module.exports = SyncWaterfallHook;


/***/ }),

/***/ 1354:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const util = __webpack_require__(1669);
const SyncBailHook = __webpack_require__(1626);

function Tapable() {
	this._pluginCompat = new SyncBailHook(["options"]);
	this._pluginCompat.tap(
		{
			name: "Tapable camelCase",
			stage: 100
		},
		options => {
			options.names.add(
				options.name.replace(/[- ]([a-z])/g, (str, ch) => ch.toUpperCase())
			);
		}
	);
	this._pluginCompat.tap(
		{
			name: "Tapable this.hooks",
			stage: 200
		},
		options => {
			let hook;
			for (const name of options.names) {
				hook = this.hooks[name];
				if (hook !== undefined) {
					break;
				}
			}
			if (hook !== undefined) {
				const tapOpt = {
					name: options.fn.name || "unnamed compat plugin",
					stage: options.stage || 0
				};
				if (options.async) hook.tapAsync(tapOpt, options.fn);
				else hook.tap(tapOpt, options.fn);
				return true;
			}
		}
	);
}
module.exports = Tapable;

Tapable.addCompatLayer = function addCompatLayer(instance) {
	Tapable.call(instance);
	instance.plugin = Tapable.prototype.plugin;
	instance.apply = Tapable.prototype.apply;
};

Tapable.prototype.plugin = util.deprecate(function plugin(name, fn) {
	if (Array.isArray(name)) {
		name.forEach(function(name) {
			this.plugin(name, fn);
		}, this);
		return;
	}
	const result = this._pluginCompat.call({
		name: name,
		fn: fn,
		names: new Set([name])
	});
	if (!result) {
		throw new Error(
			`Plugin could not be registered at '${name}'. Hook was not found.\n` +
				"BREAKING CHANGE: There need to exist a hook at 'this.hooks'. " +
				"To create a compatibility layer for this hook, hook into 'this._pluginCompat'."
		);
	}
}, "Tapable.plugin is deprecated. Use new API on `.hooks` instead");

Tapable.prototype.apply = util.deprecate(function apply() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].apply(this);
	}
}, "Tapable.apply is deprecated. Call apply on the plugin directly instead");


/***/ }),

/***/ 1242:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


exports.__esModule = true;
exports.Tapable = __webpack_require__(1354);
exports.SyncHook = __webpack_require__(9689);
exports.SyncBailHook = __webpack_require__(1626);
exports.SyncWaterfallHook = __webpack_require__(6093);
exports.SyncLoopHook = __webpack_require__(179);
exports.AsyncParallelHook = __webpack_require__(1684);
exports.AsyncParallelBailHook = __webpack_require__(8151);
exports.AsyncSeriesHook = __webpack_require__(6496);
exports.AsyncSeriesBailHook = __webpack_require__(5734);
exports.AsyncSeriesWaterfallHook = __webpack_require__(8118);
exports.HookMap = __webpack_require__(7079);
exports.MultiHook = __webpack_require__(3103);


/***/ }),

/***/ 1890:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";
var __webpack_unused_export__;


__webpack_unused_export__ = ({
  value: true
});
exports.Z = void 0;

var _os = _interopRequireDefault(__webpack_require__(2087));

var _cacache = _interopRequireDefault(__webpack_require__(6801));

var _findCacheDir = _interopRequireDefault(__webpack_require__(1844));

var _serializeJavascript = _interopRequireDefault(__webpack_require__(6393));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Webpack4Cache {
  constructor(compilation, options) {
    this.cacheDir = options.cache === true ? Webpack4Cache.getCacheDirectory() : options.cache;
  }

  static getCacheDirectory() {
    return (0, _findCacheDir.default)({
      name: 'terser-webpack-plugin'
    }) || _os.default.tmpdir();
  }

  isEnabled() {
    return Boolean(this.cacheDir);
  }

  async get(task) {
    // eslint-disable-next-line no-param-reassign
    task.cacheIdent = task.cacheIdent || (0, _serializeJavascript.default)(task.cacheKeys);
    const {
      data
    } = await _cacache.default.get(this.cacheDir, task.cacheIdent);
    return JSON.parse(data);
  }

  async store(task, data) {
    return _cacache.default.put(this.cacheDir, task.cacheIdent, JSON.stringify(data));
  }

}

exports.Z = Webpack4Cache;

/***/ }),

/***/ 655:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
var __webpack_unused_export__;


__webpack_unused_export__ = ({
  value: true
});
exports.Z = void 0;

class Cache {
  // eslint-disable-next-line no-unused-vars
  constructor(compilation, ignored) {
    this.cache = compilation.getCache('TerserWebpackPlugin');
  } // eslint-disable-next-line class-methods-use-this


  isEnabled() {
    return true;
  }

  async get(task) {
    // eslint-disable-next-line no-param-reassign
    task.cacheIdent = task.cacheIdent || `${task.name}`; // eslint-disable-next-line no-param-reassign

    task.cacheETag = task.cacheETag || this.cache.getLazyHashedEtag(task.assetSource);
    return this.cache.getPromise(task.cacheIdent, task.cacheETag);
  }

  async store(task, data) {
    return this.cache.storePromise(task.cacheIdent, task.cacheETag, data);
  }

}

exports.Z = Cache;

/***/ }),

/***/ 5245:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const plugin = __webpack_require__(8299);

module.exports = plugin.default;

/***/ }),

/***/ 8299:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.default = void 0;

var _path = _interopRequireDefault(__webpack_require__(5622));

var _os = _interopRequireDefault(__webpack_require__(2087));

var _sourceMap = __webpack_require__(6241);

var _webpackSources = __webpack_require__(3745);

var _RequestShortener = _interopRequireDefault(__webpack_require__(1432));

var _webpack = __webpack_require__(4078);

var _schemaUtils = _interopRequireDefault(__webpack_require__(3225));

var _serializeJavascript = _interopRequireDefault(__webpack_require__(6393));

var _package = _interopRequireDefault(__webpack_require__(7861));

var _pLimit = _interopRequireDefault(__webpack_require__(1690));

var _jestWorker = _interopRequireDefault(__webpack_require__(9733));

var _options = _interopRequireDefault(__webpack_require__(1840));

var _minify = __webpack_require__(328);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class TerserPlugin {
  constructor(options = {}) {
    (0, _schemaUtils.default)(_options.default, options, {
      name: 'Terser Plugin',
      baseDataPath: 'options'
    });
    const {
      minify,
      terserOptions = {},
      test = /\.m?js(\?.*)?$/i,
      extractComments = true,
      sourceMap,
      cache = true,
      cacheKeys = defaultCacheKeys => defaultCacheKeys,
      parallel = true,
      include,
      exclude
    } = options;
    this.options = {
      test,
      extractComments,
      sourceMap,
      cache,
      cacheKeys,
      parallel,
      include,
      exclude,
      minify,
      terserOptions
    };
  }

  static isSourceMap(input) {
    // All required options for `new SourceMapConsumer(...options)`
    // https://github.com/mozilla/source-map#new-sourcemapconsumerrawsourcemap
    return Boolean(input && input.version && input.sources && Array.isArray(input.sources) && typeof input.mappings === 'string');
  }

  static buildError(error, file, sourceMap, requestShortener) {
    if (error.line) {
      const original = sourceMap && sourceMap.originalPositionFor({
        line: error.line,
        column: error.col
      });

      if (original && original.source && requestShortener) {
        return new Error(`${file} from Terser\n${error.message} [${requestShortener.shorten(original.source)}:${original.line},${original.column}][${file}:${error.line},${error.col}]${error.stack ? `\n${error.stack.split('\n').slice(1).join('\n')}` : ''}`);
      }

      return new Error(`${file} from Terser\n${error.message} [${file}:${error.line},${error.col}]${error.stack ? `\n${error.stack.split('\n').slice(1).join('\n')}` : ''}`);
    }

    if (error.stack) {
      return new Error(`${file} from Terser\n${error.stack}`);
    }

    return new Error(`${file} from Terser\n${error.message}`);
  }

  static isWebpack4() {
    return _webpack.version[0] === '4';
  }

  static getAvailableNumberOfCores(parallel) {
    // In some cases cpus() returns undefined
    // https://github.com/nodejs/node/issues/19022
    const cpus = _os.default.cpus() || {
      length: 1
    };
    return parallel === true ? cpus.length - 1 : Math.min(Number(parallel) || 0, cpus.length - 1);
  } // eslint-disable-next-line consistent-return


  static getAsset(compilation, name) {
    // New API
    if (compilation.getAsset) {
      return compilation.getAsset(name);
    }

    if (compilation.assets[name]) {
      return {
        name,
        source: compilation.assets[name],
        info: {}
      };
    }
  }

  static emitAsset(compilation, name, source, assetInfo) {
    // New API
    if (compilation.emitAsset) {
      compilation.emitAsset(name, source, assetInfo);
    } // eslint-disable-next-line no-param-reassign


    compilation.assets[name] = source;
  }

  static updateAsset(compilation, name, newSource, assetInfo) {
    // New API
    if (compilation.updateAsset) {
      compilation.updateAsset(name, newSource, assetInfo);
    } // eslint-disable-next-line no-param-reassign


    compilation.assets[name] = newSource;
  }

  *taskGenerator(compiler, compilation, allExtractedComments, name) {
    const {
      info,
      source: assetSource
    } = TerserPlugin.getAsset(compilation, name); // Skip double minimize assets from child compilation

    if (info.minimized) {
      yield false;
    }

    let input;
    let inputSourceMap; // TODO refactor after drop webpack@4, webpack@5 always has `sourceAndMap` on sources

    if (this.options.sourceMap && assetSource.sourceAndMap) {
      const {
        source,
        map
      } = assetSource.sourceAndMap();
      input = source;

      if (map) {
        if (TerserPlugin.isSourceMap(map)) {
          inputSourceMap = map;
        } else {
          inputSourceMap = map;
          compilation.warnings.push(new Error(`${name} contains invalid source map`));
        }
      }
    } else {
      input = assetSource.source();
      inputSourceMap = null;
    }

    if (Buffer.isBuffer(input)) {
      input = input.toString();
    } // Handling comment extraction


    let commentsFilename = false;

    if (this.options.extractComments) {
      commentsFilename = this.options.extractComments.filename || '[file].LICENSE.txt[query]';
      let query = '';
      let filename = name;
      const querySplit = filename.indexOf('?');

      if (querySplit >= 0) {
        query = filename.substr(querySplit);
        filename = filename.substr(0, querySplit);
      }

      const lastSlashIndex = filename.lastIndexOf('/');
      const basename = lastSlashIndex === -1 ? filename : filename.substr(lastSlashIndex + 1);
      const data = {
        filename,
        basename,
        query
      };
      commentsFilename = compilation.getPath(commentsFilename, data);
    }

    const callback = taskResult => {
      let {
        code
      } = taskResult;
      const {
        error,
        map
      } = taskResult;
      const {
        extractedComments
      } = taskResult;
      let sourceMap = null;

      if (error && inputSourceMap && TerserPlugin.isSourceMap(inputSourceMap)) {
        sourceMap = new _sourceMap.SourceMapConsumer(inputSourceMap);
      } // Handling results
      // Error case: add errors, and go to next file


      if (error) {
        compilation.errors.push(TerserPlugin.buildError(error, name, sourceMap, new _RequestShortener.default(compiler.context)));
        return;
      }

      const hasExtractedComments = commentsFilename && extractedComments && extractedComments.length > 0;
      const hasBannerForExtractedComments = this.options.extractComments.banner !== false;
      let outputSource;
      let shebang;

      if (hasExtractedComments && hasBannerForExtractedComments && code.startsWith('#!')) {
        const firstNewlinePosition = code.indexOf('\n');
        shebang = code.substring(0, firstNewlinePosition);
        code = code.substring(firstNewlinePosition + 1);
      }

      if (map) {
        outputSource = new _webpackSources.SourceMapSource(code, name, map, input, inputSourceMap, true);
      } else {
        outputSource = new _webpackSources.RawSource(code);
      }

      const assetInfo = { ...info,
        minimized: true
      }; // Write extracted comments to commentsFilename

      if (hasExtractedComments) {
        let banner;
        assetInfo.related = {
          license: commentsFilename
        }; // Add a banner to the original file

        if (hasBannerForExtractedComments) {
          banner = this.options.extractComments.banner || `For license information please see ${_path.default.relative(_path.default.dirname(name), commentsFilename).replace(/\\/g, '/')}`;

          if (typeof banner === 'function') {
            banner = banner(commentsFilename);
          }

          if (banner) {
            outputSource = new _webpackSources.ConcatSource(shebang ? `${shebang}\n` : '', `/*! ${banner} */\n`, outputSource);
          }
        }

        if (!allExtractedComments[commentsFilename]) {
          // eslint-disable-next-line no-param-reassign
          allExtractedComments[commentsFilename] = new Set();
        }

        extractedComments.forEach(comment => {
          // Avoid re-adding banner
          // Developers can use different banner for different names, but this setting should be avoided, it is not safe
          if (banner && comment === `/*! ${banner} */`) {
            return;
          }

          allExtractedComments[commentsFilename].add(comment);
        }); // Extracted comments from child compilation

        const previousExtractedComments = TerserPlugin.getAsset(compilation, commentsFilename);

        if (previousExtractedComments) {
          const previousExtractedCommentsSource = previousExtractedComments.source.source(); // Restore original comments and re-add them

          previousExtractedCommentsSource.replace(/\n$/, '').split('\n\n').forEach(comment => {
            allExtractedComments[commentsFilename].add(comment);
          });
        }
      }

      TerserPlugin.updateAsset(compilation, name, outputSource, assetInfo);
    };

    const task = {
      name,
      input,
      inputSourceMap,
      commentsFilename,
      extractComments: this.options.extractComments,
      terserOptions: this.options.terserOptions,
      minify: this.options.minify,
      callback
    };

    if (TerserPlugin.isWebpack4()) {
      const {
        outputOptions: {
          hashSalt,
          hashDigest,
          hashDigestLength,
          hashFunction
        }
      } = compilation;

      const hash = _webpack.util.createHash(hashFunction);

      if (hashSalt) {
        hash.update(hashSalt);
      }

      hash.update(input);
      const digest = hash.digest(hashDigest);

      if (this.options.cache) {
        const defaultCacheKeys = {
          terser: _package.default.version,
          // eslint-disable-next-line global-require
          'terser-webpack-plugin': __webpack_require__(9122)/* .version */ .i8,
          'terser-webpack-plugin-options': this.options,
          nodeVersion: process.version,
          name,
          contentHash: digest.substr(0, hashDigestLength)
        };
        task.cacheKeys = this.options.cacheKeys(defaultCacheKeys, name);
      }
    } else {
      // For webpack@5 cache
      task.assetSource = assetSource;
    }

    yield task;
  }

  async runTasks(assetNames, getTaskForAsset, cache) {
    const availableNumberOfCores = TerserPlugin.getAvailableNumberOfCores(this.options.parallel);
    let concurrency = Infinity;
    let worker;

    if (availableNumberOfCores > 0) {
      // Do not create unnecessary workers when the number of files is less than the available cores, it saves memory
      const numWorkers = Math.min(assetNames.length, availableNumberOfCores);
      concurrency = numWorkers;
      worker = new _jestWorker.default(__webpack_require__.ab + "minify.js", {
        numWorkers
      }); // https://github.com/facebook/jest/issues/8872#issuecomment-524822081

      const workerStdout = worker.getStdout();

      if (workerStdout) {
        workerStdout.on('data', chunk => {
          return process.stdout.write(chunk);
        });
      }

      const workerStderr = worker.getStderr();

      if (workerStderr) {
        workerStderr.on('data', chunk => {
          return process.stderr.write(chunk);
        });
      }
    }

    const limit = (0, _pLimit.default)(concurrency);
    const scheduledTasks = [];

    for (const assetName of assetNames) {
      const enqueue = async task => {
        let taskResult;

        try {
          taskResult = await (worker ? worker.transform((0, _serializeJavascript.default)(task)) : (0, _minify.minify)(task));
        } catch (error) {
          taskResult = {
            error
          };
        }

        if (cache.isEnabled() && !taskResult.error) {
          await cache.store(task, taskResult);
        }

        task.callback(taskResult);
        return taskResult;
      };

      scheduledTasks.push(limit(async () => {
        const task = getTaskForAsset(assetName).next().value;

        if (!task) {
          // Something went wrong, for example the `cacheKeys` option throw an error
          return Promise.resolve();
        }

        if (cache.isEnabled()) {
          let taskResult;

          try {
            taskResult = await cache.get(task);
          } catch (ignoreError) {
            return enqueue(task);
          } // Webpack@5 return `undefined` when cache is not found


          if (!taskResult) {
            return enqueue(task);
          }

          task.callback(taskResult);
          return Promise.resolve();
        }

        return enqueue(task);
      }));
    }

    await Promise.all(scheduledTasks);

    if (worker) {
      await worker.end();
    }
  }

  apply(compiler) {
    const {
      devtool,
      output,
      plugins
    } = compiler.options;
    this.options.sourceMap = typeof this.options.sourceMap === 'undefined' ? devtool && !devtool.includes('eval') && !devtool.includes('cheap') && (devtool.includes('source-map') || // Todo remove when `webpack@4` support will be dropped
    devtool.includes('sourcemap')) || plugins && plugins.some(plugin => plugin instanceof _webpack.SourceMapDevToolPlugin && plugin.options && plugin.options.columns) : Boolean(this.options.sourceMap);

    if (typeof this.options.terserOptions.module === 'undefined' && typeof output.module !== 'undefined') {
      this.options.terserOptions.module = output.module;
    }

    if (typeof this.options.terserOptions.ecma === 'undefined' && typeof output.ecmaVersion !== 'undefined') {
      this.options.terserOptions.ecma = output.ecmaVersion;
    }

    const matchObject = _webpack.ModuleFilenameHelpers.matchObject.bind( // eslint-disable-next-line no-undefined
    undefined, this.options);

    const optimizeFn = async (compilation, chunksOrAssets) => {
      let assetNames;

      if (TerserPlugin.isWebpack4()) {
        assetNames = [].concat(Array.from(compilation.additionalChunkAssets || [])).concat(Array.from(chunksOrAssets).reduce((acc, chunk) => acc.concat(Array.from(chunk.files || [])), [])).concat(Object.keys(compilation.assets)).filter((file, index, assets) => assets.indexOf(file) === index).filter(file => matchObject(file));
      } else {
        assetNames = [].concat(Object.keys(chunksOrAssets)).filter(file => matchObject(file));
      }

      if (assetNames.length === 0) {
        return Promise.resolve();
      }

      const allExtractedComments = {};
      const getTaskForAsset = this.taskGenerator.bind(this, compiler, compilation, allExtractedComments);
      const CacheEngine = TerserPlugin.isWebpack4() ? // eslint-disable-next-line global-require
      __webpack_require__(1890)/* .default */ .Z : // eslint-disable-next-line global-require
      __webpack_require__(655)/* .default */ .Z;
      const cache = new CacheEngine(compilation, {
        cache: this.options.cache
      });
      await this.runTasks(assetNames, getTaskForAsset, cache);
      Object.keys(allExtractedComments).forEach(commentsFilename => {
        const extractedComments = Array.from(allExtractedComments[commentsFilename]).sort().join('\n\n');
        TerserPlugin.emitAsset(compilation, commentsFilename, new _webpackSources.RawSource(`${extractedComments}\n`));
      });
      return Promise.resolve();
    };

    const pluginName = this.constructor.name;
    compiler.hooks.compilation.tap(pluginName, compilation => {
      if (this.options.sourceMap) {
        compilation.hooks.buildModule.tap(pluginName, moduleArg => {
          // to get detailed location info about errors
          // eslint-disable-next-line no-param-reassign
          moduleArg.useSourceMap = true;
        });
      }

      if (TerserPlugin.isWebpack4()) {
        const {
          mainTemplate,
          chunkTemplate
        } = compilation;
        const data = (0, _serializeJavascript.default)({
          terser: _package.default.version,
          terserOptions: this.options.terserOptions
        }); // Regenerate `contenthash` for minified assets

        for (const template of [mainTemplate, chunkTemplate]) {
          template.hooks.hashForChunk.tap(pluginName, hash => {
            hash.update('TerserPlugin');
            hash.update(data);
          });
        }

        compilation.hooks.optimizeChunkAssets.tapPromise(pluginName, optimizeFn.bind(this, compilation));
      } else {
        // eslint-disable-next-line global-require
        const Compilation = __webpack_require__(6587);

        const hooks = _webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(compilation);

        const data = (0, _serializeJavascript.default)({
          terser: _package.default.version,
          terserOptions: this.options.terserOptions
        });
        hooks.chunkHash.tap(pluginName, (chunk, hash) => {
          hash.update('TerserPlugin');
          hash.update(data);
        });
        compilation.hooks.processAssets.tapPromise({
          name: pluginName,
          stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE
        }, optimizeFn.bind(this, compilation));
        compilation.hooks.statsPrinter.tap(pluginName, stats => {
          stats.hooks.print.for('asset.info.minimized').tap('terser-webpack-plugin', (minimized, {
            green,
            formatFlag
          }) => // eslint-disable-next-line no-undefined
          minimized ? green(formatFlag('minimized')) : undefined);
        });
      }
    });
  }

}

var _default = TerserPlugin;
exports.default = _default;

/***/ }),

/***/ 328:
/***/ ((module, exports, __webpack_require__) => {

"use strict";
/* module decorator */ module = __webpack_require__.nmd(module);


const {
  minify: terserMinify
} = __webpack_require__(4775);

const buildTerserOptions = ({
  ecma,
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
  parse: { ...parse
  },
  compress: typeof compress === 'boolean' ? compress : { ...compress
  },
  // eslint-disable-next-line no-nested-ternary
  mangle: mangle == null ? true : typeof mangle === 'boolean' ? mangle : { ...mangle
  },
  output: {
    beautify: false,
    ...output
  },
  // Ignoring sourceMap from options
  sourceMap: null,
  ecma,
  keep_classnames,
  keep_fnames,
  ie8,
  module,
  nameCache,
  safari10,
  toplevel
});

function isObject(value) {
  const type = typeof value;
  return value != null && (type === 'object' || type === 'function');
}

const buildComments = (options, terserOptions, extractedComments) => {
  const condition = {};
  const commentsOpts = terserOptions.output.comments;
  const {
    extractComments
  } = options;
  condition.preserve = typeof commentsOpts !== 'undefined' ? commentsOpts : false;

  if (typeof extractComments === 'boolean' && extractComments) {
    condition.extract = 'some';
  } else if (typeof extractComments === 'string' || extractComments instanceof RegExp) {
    condition.extract = extractComments;
  } else if (typeof extractComments === 'function') {
    condition.extract = extractComments;
  } else if (isObject(extractComments)) {
    condition.extract = typeof extractComments.condition === 'boolean' && extractComments.condition ? 'some' : typeof extractComments.condition !== 'undefined' ? extractComments.condition : 'some';
  } else {
    // No extract
    // Preserve using "commentsOpts" or "some"
    condition.preserve = typeof commentsOpts !== 'undefined' ? commentsOpts : 'some';
    condition.extract = false;
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
            return (comment.type === 'comment2' || comment.type === 'comment1') && /@preserve|@lic|@cc_on|^\**!/i.test(comment.value);
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

async function minify(options) {
  const {
    name,
    input,
    inputSourceMap,
    minify: minifyFn
  } = options;

  if (minifyFn) {
    return minifyFn({
      [name]: input
    }, inputSourceMap);
  } // Copy terser options


  const terserOptions = buildTerserOptions(options.terserOptions); // Let terser generate a SourceMap

  if (inputSourceMap) {
    terserOptions.sourceMap = {
      asObject: true
    };
  }

  const extractedComments = [];
  terserOptions.output.comments = buildComments(options, terserOptions, extractedComments);
  const result = await terserMinify({
    [name]: input
  }, terserOptions);
  return { ...result,
    extractedComments
  };
}

function transform(options) {
  // 'use strict' => this === undefined (Clean Scope)
  // Safer for possible security issues, albeit not critical at all here
  // eslint-disable-next-line no-new-func, no-param-reassign
  options = new Function('exports', 'require', 'module', '__filename', '__dirname', `'use strict'\nreturn ${options}`)(exports, require, module, __filename, __dirname);
  return minify(options);
}

module.exports.minify = minify;
module.exports.transform = transform;

/***/ }),

/***/ 1690:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

const pTry = __webpack_require__(7404);

const pLimit = concurrency => {
	if (!((Number.isInteger(concurrency) || concurrency === Infinity) && concurrency > 0)) {
		throw new TypeError('Expected `concurrency` to be a number from 1 and up');
	}

	const queue = [];
	let activeCount = 0;

	const next = () => {
		activeCount--;

		if (queue.length > 0) {
			queue.shift()();
		}
	};

	const run = async (fn, resolve, ...args) => {
		activeCount++;

		// TODO: Get rid of `pTry`. It's not needed anymore.
		const result = pTry(fn, ...args);

		resolve(result);

		try {
			await result;
		} catch {}

		next();
	};

	const enqueue = (fn, resolve, ...args) => {
		queue.push(run.bind(null, fn, resolve, ...args));

		(async () => {
			// This function needs to wait until the next microtask before comparing
			// `activeCount` to `concurrency`, because `activeCount` is updated asynchronously
			// when the run function is dequeued and called. The comparison in the if-statement
			// needs to happen asynchronously as well to get an up-to-date value for `activeCount`.
			await Promise.resolve();

			if (activeCount < concurrency && queue.length > 0) {
				queue.shift()();
			}
		})();
	};

	const generator = (fn, ...args) => new Promise(resolve => enqueue(fn, resolve, ...args));
	Object.defineProperties(generator, {
		activeCount: {
			get: () => activeCount
		},
		pendingCount: {
			get: () => queue.length
		},
		clearQueue: {
			value: () => {
				queue.length = 0;
			}
		}
	});

	return generator;
};

module.exports = pLimit;


/***/ }),

/***/ 1112:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const WebpackError = __webpack_require__(1891);
const CURRENT_METHOD_REGEXP = /at ([a-zA-Z0-9_.]*)/;

/**
 * @param {string=} method method name
 * @returns {string} message
 */
function createMessage(method) {
	return `Abstract method${method ? " " + method : ""}. Must be overridden.`;
}

/**
 * @constructor
 */
function Message() {
	this.stack = undefined;
	Error.captureStackTrace(this);
	/** @type {RegExpMatchArray} */
	const match = this.stack.split("\n")[3].match(CURRENT_METHOD_REGEXP);

	this.message = match && match[1] ? createMessage(match[1]) : createMessage();
}

/**
 * Error for abstract method
 * @example
 * class FooClass {
 *     abstractMethod() {
 *         throw new AbstractMethodError(); // error message: Abstract method FooClass.abstractMethod. Must be overriden.
 *     }
 * }
 *
 */
class AbstractMethodError extends WebpackError {
	constructor() {
		super(new Message().message);
		this.name = "AbstractMethodError";
	}
}

module.exports = AbstractMethodError;


/***/ }),

/***/ 7794:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Sean Larkin @thelarkinn
*/


const WebpackError = __webpack_require__(1891);

/** @typedef {import("./Module")} Module */

class AsyncDependencyToInitialChunkError extends WebpackError {
	/**
	 * Creates an instance of AsyncDependencyToInitialChunkError.
	 * @param {string} chunkName Name of Chunk
	 * @param {Module} module module tied to dependency
	 * @param {TODO} loc location of dependency
	 */
	constructor(chunkName, module, loc) {
		super(
			`It's not allowed to load an initial chunk on demand. The chunk name "${chunkName}" is already used by an entrypoint.`
		);

		this.name = "AsyncDependencyToInitialChunkError";
		this.module = module;
		this.loc = loc;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = AsyncDependencyToInitialChunkError;


/***/ }),

/***/ 4029:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
MIT License http://www.opensource.org/licenses/mit-license.php
Author Tobias Koppers @sokra
*/


const util = __webpack_require__(1669);
const SortableSet = __webpack_require__(3875);
const intersect = __webpack_require__(4791)/* .intersect */ .w;
const GraphHelpers = __webpack_require__(3445);
const Entrypoint = __webpack_require__(8865);
let debugId = 1000;
const ERR_CHUNK_ENTRY = "Chunk.entry was removed. Use hasRuntime()";
const ERR_CHUNK_INITIAL =
	"Chunk.initial was removed. Use canBeInitial/isOnlyInitial()";

/** @typedef {import("./Module")} Module */
/** @typedef {import("./ChunkGroup")} ChunkGroup */
/** @typedef {import("./ModuleReason")} ModuleReason */
/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./util/createHash").Hash} Hash */

/**
 *  @typedef {Object} WithId an object who has an id property *
 *  @property {string | number} id the id of the object
 */

/**
 * Compare two Modules based on their ids for sorting
 * @param {Module} a module
 * @param {Module} b module
 * @returns {-1|0|1} sort value
 */

// TODO use @callback
/** @typedef {(a: Module, b: Module) => -1|0|1} ModuleSortPredicate */
/** @typedef {(m: Module) => boolean} ModuleFilterPredicate */
/** @typedef {(c: Chunk) => boolean} ChunkFilterPredicate */

const sortModuleById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

/**
 * Compare two ChunkGroups based on their ids for sorting
 * @param {ChunkGroup} a chunk group
 * @param {ChunkGroup} b chunk group
 * @returns {-1|0|1} sort value
 */
const sortChunkGroupById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

/**
 * Compare two Identifiables , based on their ids for sorting
 * @param {Module} a first object with ident fn
 * @param {Module} b second object with ident fn
 * @returns {-1|0|1} The order number of the sort
 */
const sortByIdentifier = (a, b) => {
	if (a.identifier() > b.identifier()) return 1;
	if (a.identifier() < b.identifier()) return -1;
	return 0;
};

/**
 * @returns {string} a concatenation of module identifiers sorted
 * @param {SortableSet} set to pull module identifiers from
 */
const getModulesIdent = set => {
	set.sort();
	let str = "";
	for (const m of set) {
		str += m.identifier() + "#";
	}
	return str;
};

/**
 * @template T
 * @param {SortableSet<T>} set the sortable set to convert to array
 * @returns {Array<T>} the array returned from Array.from(set)
 */
const getArray = set => Array.from(set);

/**
 * @param {SortableSet<Module>} set the sortable Set to get the count/size of
 * @returns {number} the size of the modules
 */
const getModulesSize = set => {
	let size = 0;
	for (const module of set) {
		size += module.size();
	}
	return size;
};

/**
 * A Chunk is a unit of encapsulation for Modules.
 * Chunks are "rendered" into bundles that get emitted when the build completes.
 */
class Chunk {
	/**
	 * @param {string=} name of chunk being created, is optional (for subclasses)
	 */
	constructor(name) {
		/** @type {number | null} */
		this.id = null;
		/** @type {number[] | null} */
		this.ids = null;
		/** @type {number} */
		this.debugId = debugId++;
		/** @type {string} */
		this.name = name;
		/** @type {boolean} */
		this.preventIntegration = false;
		/** @type {Module=} */
		this.entryModule = undefined;
		/** @private @type {SortableSet<Module>} */
		this._modules = new SortableSet(undefined, sortByIdentifier);
		/** @type {string?} */
		this.filenameTemplate = undefined;
		/** @private @type {SortableSet<ChunkGroup>} */
		this._groups = new SortableSet(undefined, sortChunkGroupById);
		/** @type {string[]} */
		this.files = [];
		/** @type {boolean} */
		this.rendered = false;
		/** @type {string=} */
		this.hash = undefined;
		/** @type {Object} */
		this.contentHash = Object.create(null);
		/** @type {string=} */
		this.renderedHash = undefined;
		/** @type {string=} */
		this.chunkReason = undefined;
		/** @type {boolean} */
		this.extraAsync = false;
		this.removedModules = undefined;
	}

	/**
	 * @deprecated Chunk.entry has been deprecated. Please use .hasRuntime() instead
	 * @returns {never} Throws an error trying to access this property
	 */
	get entry() {
		throw new Error(ERR_CHUNK_ENTRY);
	}

	/**
	 * @deprecated .entry has been deprecated. Please use .hasRuntime() instead
	 * @param {never} data The data that was attempting to be set
	 * @returns {never} Throws an error trying to access this property
	 */
	set entry(data) {
		throw new Error(ERR_CHUNK_ENTRY);
	}

	/**
	 * @deprecated Chunk.initial was removed. Use canBeInitial/isOnlyInitial()
	 * @returns {never} Throws an error trying to access this property
	 */
	get initial() {
		throw new Error(ERR_CHUNK_INITIAL);
	}

	/**
	 * @deprecated Chunk.initial was removed. Use canBeInitial/isOnlyInitial()
	 * @param {never} data The data attempting to be set
	 * @returns {never} Throws an error trying to access this property
	 */
	set initial(data) {
		throw new Error(ERR_CHUNK_INITIAL);
	}

	/**
	 * @returns {boolean} whether or not the Chunk will have a runtime
	 */
	hasRuntime() {
		for (const chunkGroup of this._groups) {
			if (
				chunkGroup.isInitial() &&
				chunkGroup instanceof Entrypoint &&
				chunkGroup.getRuntimeChunk() === this
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @returns {boolean} whether or not this chunk can be an initial chunk
	 */
	canBeInitial() {
		for (const chunkGroup of this._groups) {
			if (chunkGroup.isInitial()) return true;
		}
		return false;
	}

	/**
	 * @returns {boolean} whether this chunk can only be an initial chunk
	 */
	isOnlyInitial() {
		if (this._groups.size <= 0) return false;
		for (const chunkGroup of this._groups) {
			if (!chunkGroup.isInitial()) return false;
		}
		return true;
	}

	/**
	 * @returns {boolean} if this chunk contains the entry module
	 */
	hasEntryModule() {
		return !!this.entryModule;
	}

	/**
	 * @param {Module} module the module that will be added to this chunk.
	 * @returns {boolean} returns true if the chunk doesn't have the module and it was added
	 */
	addModule(module) {
		if (!this._modules.has(module)) {
			this._modules.add(module);
			return true;
		}
		return false;
	}

	/**
	 * @param {Module} module the module that will be removed from this chunk
	 * @returns {boolean} returns true if chunk exists and is successfully deleted
	 */
	removeModule(module) {
		if (this._modules.delete(module)) {
			module.removeChunk(this);
			return true;
		}
		return false;
	}

	/**
	 * @param {Module[]} modules the new modules to be set
	 * @returns {void} set new modules to this chunk and return nothing
	 */
	setModules(modules) {
		this._modules = new SortableSet(modules, sortByIdentifier);
	}

	/**
	 * @returns {number} the amount of modules in chunk
	 */
	getNumberOfModules() {
		return this._modules.size;
	}

	/**
	 * @returns {SortableSet} return the modules SortableSet for this chunk
	 */
	get modulesIterable() {
		return this._modules;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup the chunk is being added
	 * @returns {boolean} returns true if chunk is not apart of chunkGroup and is added successfully
	 */
	addGroup(chunkGroup) {
		if (this._groups.has(chunkGroup)) return false;
		this._groups.add(chunkGroup);
		return true;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup the chunk is being removed from
	 * @returns {boolean} returns true if chunk does exist in chunkGroup and is removed
	 */
	removeGroup(chunkGroup) {
		if (!this._groups.has(chunkGroup)) return false;
		this._groups.delete(chunkGroup);
		return true;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup to check
	 * @returns {boolean} returns true if chunk has chunkGroup reference and exists in chunkGroup
	 */
	isInGroup(chunkGroup) {
		return this._groups.has(chunkGroup);
	}

	/**
	 * @returns {number} the amount of groups said chunk is in
	 */
	getNumberOfGroups() {
		return this._groups.size;
	}

	/**
	 * @returns {SortableSet<ChunkGroup>} the chunkGroups that said chunk is referenced in
	 */
	get groupsIterable() {
		return this._groups;
	}

	/**
	 * @param {Chunk} otherChunk the chunk to compare itself with
	 * @returns {-1|0|1} this is a comparitor function like sort and returns -1, 0, or 1 based on sort order
	 */
	compareTo(otherChunk) {
		if (this.name && !otherChunk.name) return -1;
		if (!this.name && otherChunk.name) return 1;
		if (this.name < otherChunk.name) return -1;
		if (this.name > otherChunk.name) return 1;
		if (this._modules.size > otherChunk._modules.size) return -1;
		if (this._modules.size < otherChunk._modules.size) return 1;
		this._modules.sort();
		otherChunk._modules.sort();
		const a = this._modules[Symbol.iterator]();
		const b = otherChunk._modules[Symbol.iterator]();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const aItem = a.next();
			if (aItem.done) return 0;
			const bItem = b.next();
			const aModuleIdentifier = aItem.value.identifier();
			const bModuleIdentifier = bItem.value.identifier();
			if (aModuleIdentifier < bModuleIdentifier) return -1;
			if (aModuleIdentifier > bModuleIdentifier) return 1;
		}
	}

	/**
	 * @param {Module} module Module to check
	 * @returns {boolean} returns true if module does exist in this chunk
	 */
	containsModule(module) {
		return this._modules.has(module);
	}

	/**
	 * @returns {Module[]} an array of modules (do not modify)
	 */
	getModules() {
		return this._modules.getFromCache(getArray);
	}

	getModulesIdent() {
		return this._modules.getFromUnorderedCache(getModulesIdent);
	}

	/**
	 * @param {string=} reason reason why chunk is removed
	 * @returns {void}
	 */
	remove(reason) {
		// cleanup modules
		// Array.from is used here to create a clone, because removeChunk modifies this._modules
		for (const module of Array.from(this._modules)) {
			module.removeChunk(this);
		}
		for (const chunkGroup of this._groups) {
			chunkGroup.removeChunk(this);
		}
	}

	/**
	 *
	 * @param {Module} module module to move
	 * @param {Chunk} otherChunk other chunk to move it to
	 * @returns {void}
	 */
	moveModule(module, otherChunk) {
		GraphHelpers.disconnectChunkAndModule(this, module);
		GraphHelpers.connectChunkAndModule(otherChunk, module);
		module.rewriteChunkInReasons(this, [otherChunk]);
	}

	/**
	 *
	 * @param {Chunk} otherChunk the chunk to integrate with
	 * @param {string} reason reason why the module is being integrated
	 * @returns {boolean} returns true or false if integration succeeds or fails
	 */
	integrate(otherChunk, reason) {
		if (!this.canBeIntegrated(otherChunk)) {
			return false;
		}

		// Pick a new name for the integrated chunk
		if (this.name && otherChunk.name) {
			if (this.hasEntryModule() === otherChunk.hasEntryModule()) {
				// When both chunks have entry modules or none have one, use
				// shortest name
				if (this.name.length !== otherChunk.name.length) {
					this.name =
						this.name.length < otherChunk.name.length
							? this.name
							: otherChunk.name;
				} else {
					this.name = this.name < otherChunk.name ? this.name : otherChunk.name;
				}
			} else if (otherChunk.hasEntryModule()) {
				// Pick the name of the chunk with the entry module
				this.name = otherChunk.name;
			}
		} else if (otherChunk.name) {
			this.name = otherChunk.name;
		}

		// Array.from is used here to create a clone, because moveModule modifies otherChunk._modules
		for (const module of Array.from(otherChunk._modules)) {
			otherChunk.moveModule(module, this);
		}
		otherChunk._modules.clear();

		if (otherChunk.entryModule) {
			this.entryModule = otherChunk.entryModule;
		}

		for (const chunkGroup of otherChunk._groups) {
			chunkGroup.replaceChunk(otherChunk, this);
			this.addGroup(chunkGroup);
		}
		otherChunk._groups.clear();

		return true;
	}

	/**
	 * @param {Chunk} newChunk the new chunk that will be split out of the current chunk
	 * @returns {void}
	 */
	split(newChunk) {
		for (const chunkGroup of this._groups) {
			chunkGroup.insertChunk(newChunk, this);
			newChunk.addGroup(chunkGroup);
		}
	}

	isEmpty() {
		return this._modules.size === 0;
	}

	updateHash(hash) {
		hash.update(`${this.id} `);
		hash.update(this.ids ? this.ids.join(",") : "");
		hash.update(`${this.name || ""} `);
		for (const m of this._modules) {
			hash.update(m.hash);
		}
	}

	canBeIntegrated(otherChunk) {
		if (this.preventIntegration || otherChunk.preventIntegration) {
			return false;
		}

		/**
		 * @param {Chunk} a chunk
		 * @param {Chunk} b chunk
		 * @returns {boolean} true, if a is always available when b is reached
		 */
		const isAvailable = (a, b) => {
			const queue = new Set(b.groupsIterable);
			for (const chunkGroup of queue) {
				if (a.isInGroup(chunkGroup)) continue;
				if (chunkGroup.isInitial()) return false;
				for (const parent of chunkGroup.parentsIterable) {
					queue.add(parent);
				}
			}
			return true;
		};

		const selfHasRuntime = this.hasRuntime();
		const otherChunkHasRuntime = otherChunk.hasRuntime();

		if (selfHasRuntime !== otherChunkHasRuntime) {
			if (selfHasRuntime) {
				return isAvailable(this, otherChunk);
			} else if (otherChunkHasRuntime) {
				return isAvailable(otherChunk, this);
			} else {
				return false;
			}
		}

		if (this.hasEntryModule() || otherChunk.hasEntryModule()) {
			return false;
		}

		return true;
	}

	/**
	 *
	 * @param {number} size the size
	 * @param {Object} options the options passed in
	 * @returns {number} the multiplier returned
	 */
	addMultiplierAndOverhead(size, options) {
		const overhead =
			typeof options.chunkOverhead === "number" ? options.chunkOverhead : 10000;
		const multiplicator = this.canBeInitial()
			? options.entryChunkMultiplicator || 10
			: 1;

		return size * multiplicator + overhead;
	}

	/**
	 * @returns {number} the size of all modules
	 */
	modulesSize() {
		return this._modules.getFromUnorderedCache(getModulesSize);
	}

	/**
	 * @param {Object} options the size display options
	 * @returns {number} the chunk size
	 */
	size(options = {}) {
		return this.addMultiplierAndOverhead(this.modulesSize(), options);
	}

	/**
	 * @param {Chunk} otherChunk the other chunk
	 * @param {TODO} options the options for this function
	 * @returns {number | false} the size, or false if it can't be integrated
	 */
	integratedSize(otherChunk, options) {
		// Chunk if it's possible to integrate this chunk
		if (!this.canBeIntegrated(otherChunk)) {
			return false;
		}

		let integratedModulesSize = this.modulesSize();
		// only count modules that do not exist in this chunk!
		for (const otherModule of otherChunk._modules) {
			if (!this._modules.has(otherModule)) {
				integratedModulesSize += otherModule.size();
			}
		}

		return this.addMultiplierAndOverhead(integratedModulesSize, options);
	}

	/**
	 * @param {function(Module, Module): -1|0|1=} sortByFn a predicate function used to sort modules
	 * @returns {void}
	 */
	sortModules(sortByFn) {
		this._modules.sortWith(sortByFn || sortModuleById);
	}

	sortItems() {
		this.sortModules();
	}

	/**
	 * @returns {Set<Chunk>} a set of all the async chunks
	 */
	getAllAsyncChunks() {
		const queue = new Set();
		const chunks = new Set();

		const initialChunks = intersect(
			Array.from(this.groupsIterable, g => new Set(g.chunks))
		);

		for (const chunkGroup of this.groupsIterable) {
			for (const child of chunkGroup.childrenIterable) {
				queue.add(child);
			}
		}

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) {
				if (!initialChunks.has(chunk)) {
					chunks.add(chunk);
				}
			}
			for (const child of chunkGroup.childrenIterable) {
				queue.add(child);
			}
		}

		return chunks;
	}

	/**
	 * @typedef {Object} ChunkMaps
	 * @property {Record<string|number, string>} hash
	 * @property {Record<string|number, Record<string, string>>} contentHash
	 * @property {Record<string|number, string>} name
	 */

	/**
	 * @param {boolean} realHash should the full hash or the rendered hash be used
	 * @returns {ChunkMaps} the chunk map information
	 */
	getChunkMaps(realHash) {
		/** @type {Record<string|number, string>} */
		const chunkHashMap = Object.create(null);
		/** @type {Record<string|number, Record<string, string>>} */
		const chunkContentHashMap = Object.create(null);
		/** @type {Record<string|number, string>} */
		const chunkNameMap = Object.create(null);

		for (const chunk of this.getAllAsyncChunks()) {
			chunkHashMap[chunk.id] = realHash ? chunk.hash : chunk.renderedHash;
			for (const key of Object.keys(chunk.contentHash)) {
				if (!chunkContentHashMap[key]) {
					chunkContentHashMap[key] = Object.create(null);
				}
				chunkContentHashMap[key][chunk.id] = chunk.contentHash[key];
			}
			if (chunk.name) {
				chunkNameMap[chunk.id] = chunk.name;
			}
		}

		return {
			hash: chunkHashMap,
			contentHash: chunkContentHashMap,
			name: chunkNameMap
		};
	}

	/**
	 * @returns {Record<string, Set<TODO>[]>} a record object of names to lists of child ids(?)
	 */
	getChildIdsByOrders() {
		const lists = new Map();
		for (const group of this.groupsIterable) {
			if (group.chunks[group.chunks.length - 1] === this) {
				for (const childGroup of group.childrenIterable) {
					// TODO webpack 5 remove this check for options
					if (typeof childGroup.options === "object") {
						for (const key of Object.keys(childGroup.options)) {
							if (key.endsWith("Order")) {
								const name = key.substr(0, key.length - "Order".length);
								let list = lists.get(name);
								if (list === undefined) lists.set(name, (list = []));
								list.push({
									order: childGroup.options[key],
									group: childGroup
								});
							}
						}
					}
				}
			}
		}
		const result = Object.create(null);
		for (const [name, list] of lists) {
			list.sort((a, b) => {
				const cmp = b.order - a.order;
				if (cmp !== 0) return cmp;
				// TODO webpack 5 remove this check of compareTo
				if (a.group.compareTo) {
					return a.group.compareTo(b.group);
				}
				return 0;
			});
			result[name] = Array.from(
				list.reduce((set, item) => {
					for (const chunk of item.group.chunks) {
						set.add(chunk.id);
					}
					return set;
				}, new Set())
			);
		}
		return result;
	}

	getChildIdsByOrdersMap(includeDirectChildren) {
		const chunkMaps = Object.create(null);

		const addChildIdsByOrdersToMap = chunk => {
			const data = chunk.getChildIdsByOrders();
			for (const key of Object.keys(data)) {
				let chunkMap = chunkMaps[key];
				if (chunkMap === undefined) {
					chunkMaps[key] = chunkMap = Object.create(null);
				}
				chunkMap[chunk.id] = data[key];
			}
		};

		if (includeDirectChildren) {
			const chunks = new Set();
			for (const chunkGroup of this.groupsIterable) {
				for (const chunk of chunkGroup.chunks) {
					chunks.add(chunk);
				}
			}
			for (const chunk of chunks) {
				addChildIdsByOrdersToMap(chunk);
			}
		}

		for (const chunk of this.getAllAsyncChunks()) {
			addChildIdsByOrdersToMap(chunk);
		}

		return chunkMaps;
	}

	/**
	 * @typedef {Object} ChunkModuleMaps
	 * @property {Record<string|number, (string|number)[]>} id
	 * @property {Record<string|number, string>} hash
	 */

	/**
	 * @param {ModuleFilterPredicate} filterFn function used to filter modules
	 * @returns {ChunkModuleMaps} module map information
	 */
	getChunkModuleMaps(filterFn) {
		/** @type {Record<string|number, (string|number)[]>} */
		const chunkModuleIdMap = Object.create(null);
		/** @type {Record<string|number, string>} */
		const chunkModuleHashMap = Object.create(null);

		for (const chunk of this.getAllAsyncChunks()) {
			/** @type {(string|number)[]} */
			let array;
			for (const module of chunk.modulesIterable) {
				if (filterFn(module)) {
					if (array === undefined) {
						array = [];
						chunkModuleIdMap[chunk.id] = array;
					}
					array.push(module.id);
					chunkModuleHashMap[module.id] = module.renderedHash;
				}
			}
			if (array !== undefined) {
				array.sort();
			}
		}

		return {
			id: chunkModuleIdMap,
			hash: chunkModuleHashMap
		};
	}

	/**
	 *
	 * @param {function(Module): boolean} filterFn predicate function used to filter modules
	 * @param {function(Chunk): boolean} filterChunkFn predicate function used to filter chunks
	 * @returns {boolean} return true if module exists in graph
	 */
	hasModuleInGraph(filterFn, filterChunkFn) {
		const queue = new Set(this.groupsIterable);
		const chunksProcessed = new Set();

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) {
				if (!chunksProcessed.has(chunk)) {
					chunksProcessed.add(chunk);
					if (!filterChunkFn || filterChunkFn(chunk)) {
						for (const module of chunk.modulesIterable) {
							if (filterFn(module)) {
								return true;
							}
						}
					}
				}
			}
			for (const child of chunkGroup.childrenIterable) {
				queue.add(child);
			}
		}
		return false;
	}

	toString() {
		return `Chunk[${Array.from(this._modules).join()}]`;
	}
}

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "forEachModule", {
	configurable: false,
	value: util.deprecate(
		/**
		 * @deprecated
		 * @this {Chunk}
		 * @typedef {function(any, any, Set<any>): void} ForEachModuleCallback
		 * @param {ForEachModuleCallback} fn Callback function
		 * @returns {void}
		 */
		function(fn) {
			this._modules.forEach(fn);
		},
		"Chunk.forEachModule: Use for(const module of chunk.modulesIterable) instead"
	)
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "mapModules", {
	configurable: false,
	value: util.deprecate(
		/**
		 * @deprecated
		 * @this {Chunk}
		 * @typedef {function(any, number): any} MapModulesCallback
		 * @param {MapModulesCallback} fn Callback function
		 * @returns {TODO[]} result of mapped modules
		 */
		function(fn) {
			return Array.from(this._modules, fn);
		},
		"Chunk.mapModules: Use Array.from(chunk.modulesIterable, fn) instead"
	)
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "chunks", {
	configurable: false,
	get() {
		throw new Error("Chunk.chunks: Use ChunkGroup.getChildren() instead");
	},
	set() {
		throw new Error("Chunk.chunks: Use ChunkGroup.add/removeChild() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "parents", {
	configurable: false,
	get() {
		throw new Error("Chunk.parents: Use ChunkGroup.getParents() instead");
	},
	set() {
		throw new Error("Chunk.parents: Use ChunkGroup.add/removeParent() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "blocks", {
	configurable: false,
	get() {
		throw new Error("Chunk.blocks: Use ChunkGroup.getBlocks() instead");
	},
	set() {
		throw new Error("Chunk.blocks: Use ChunkGroup.add/removeBlock() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "entrypoints", {
	configurable: false,
	get() {
		throw new Error(
			"Chunk.entrypoints: Use Chunks.groupsIterable and filter by instanceof Entrypoint instead"
		);
	},
	set() {
		throw new Error("Chunk.entrypoints: Use Chunks.addGroup instead");
	}
});

module.exports = Chunk;


/***/ }),

/***/ 583:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const SortableSet = __webpack_require__(3875);
const compareLocations = __webpack_require__(2536);

/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./Module")} Module */
/** @typedef {import("./ModuleReason")} ModuleReason */

/** @typedef {{module: Module, loc: TODO, request: string}} OriginRecord */
/** @typedef {string|{name: string}} ChunkGroupOptions */

let debugId = 5000;

/**
 * @template T
 * @param {SortableSet<T>} set set to convert to array.
 * @returns {T[]} the array format of existing set
 */
const getArray = set => Array.from(set);

/**
 * A convenience method used to sort chunks based on their id's
 * @param {ChunkGroup} a first sorting comparator
 * @param {ChunkGroup} b second sorting comparator
 * @returns {1|0|-1} a sorting index to determine order
 */
const sortById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

/**
 * @param {OriginRecord} a the first comparator in sort
 * @param {OriginRecord} b the second comparator in sort
 * @returns {1|-1|0} returns sorting order as index
 */
const sortOrigin = (a, b) => {
	const aIdent = a.module ? a.module.identifier() : "";
	const bIdent = b.module ? b.module.identifier() : "";
	if (aIdent < bIdent) return -1;
	if (aIdent > bIdent) return 1;
	return compareLocations(a.loc, b.loc);
};

class ChunkGroup {
	/**
	 * Creates an instance of ChunkGroup.
	 * @param {ChunkGroupOptions=} options chunk group options passed to chunkGroup
	 */
	constructor(options) {
		if (typeof options === "string") {
			options = { name: options };
		} else if (!options) {
			options = { name: undefined };
		}
		/** @type {number} */
		this.groupDebugId = debugId++;
		this.options = options;
		/** @type {SortableSet<ChunkGroup>} */
		this._children = new SortableSet(undefined, sortById);
		this._parents = new SortableSet(undefined, sortById);
		this._blocks = new SortableSet();
		/** @type {Chunk[]} */
		this.chunks = [];
		/** @type {OriginRecord[]} */
		this.origins = [];
		/** Indices in top-down order */
		/** @private @type {Map<Module, number>} */
		this._moduleIndices = new Map();
		/** Indices in bottom-up order */
		/** @private @type {Map<Module, number>} */
		this._moduleIndices2 = new Map();
	}

	/**
	 * when a new chunk is added to a chunkGroup, addingOptions will occur.
	 * @param {ChunkGroupOptions} options the chunkGroup options passed to addOptions
	 * @returns {void}
	 */
	addOptions(options) {
		for (const key of Object.keys(options)) {
			if (this.options[key] === undefined) {
				this.options[key] = options[key];
			} else if (this.options[key] !== options[key]) {
				if (key.endsWith("Order")) {
					this.options[key] = Math.max(this.options[key], options[key]);
				} else {
					throw new Error(
						`ChunkGroup.addOptions: No option merge strategy for ${key}`
					);
				}
			}
		}
	}

	/**
	 * returns the name of current ChunkGroup
	 * @returns {string|undefined} returns the ChunkGroup name
	 */
	get name() {
		return this.options.name;
	}

	/**
	 * sets a new name for current ChunkGroup
	 * @param {string} value the new name for ChunkGroup
	 * @returns {void}
	 */
	set name(value) {
		this.options.name = value;
	}

	/**
	 * get a uniqueId for ChunkGroup, made up of its member Chunk debugId's
	 * @returns {string} a unique concatenation of chunk debugId's
	 */
	get debugId() {
		return Array.from(this.chunks, x => x.debugId).join("+");
	}

	/**
	 * get a unique id for ChunkGroup, made up of its member Chunk id's
	 * @returns {string} a unique concatenation of chunk ids
	 */
	get id() {
		return Array.from(this.chunks, x => x.id).join("+");
	}

	/**
	 * Performs an unshift of a specific chunk
	 * @param {Chunk} chunk chunk being unshifted
	 * @returns {boolean} returns true if attempted chunk shift is accepted
	 */
	unshiftChunk(chunk) {
		const oldIdx = this.chunks.indexOf(chunk);
		if (oldIdx > 0) {
			this.chunks.splice(oldIdx, 1);
			this.chunks.unshift(chunk);
		} else if (oldIdx < 0) {
			this.chunks.unshift(chunk);
			return true;
		}
		return false;
	}

	/**
	 * inserts a chunk before another existing chunk in group
	 * @param {Chunk} chunk Chunk being inserted
	 * @param {Chunk} before Placeholder/target chunk marking new chunk insertion point
	 * @returns {boolean} return true if insertion was successful
	 */
	insertChunk(chunk, before) {
		const oldIdx = this.chunks.indexOf(chunk);
		const idx = this.chunks.indexOf(before);
		if (idx < 0) {
			throw new Error("before chunk not found");
		}
		if (oldIdx >= 0 && oldIdx > idx) {
			this.chunks.splice(oldIdx, 1);
			this.chunks.splice(idx, 0, chunk);
		} else if (oldIdx < 0) {
			this.chunks.splice(idx, 0, chunk);
			return true;
		}
		return false;
	}

	/**
	 * add a chunk into ChunkGroup. Is pushed on or prepended
	 * @param {Chunk} chunk chunk being pushed into ChunkGroupS
	 * @returns {boolean} returns true if chunk addition was successful.
	 */
	pushChunk(chunk) {
		const oldIdx = this.chunks.indexOf(chunk);
		if (oldIdx >= 0) {
			return false;
		}
		this.chunks.push(chunk);
		return true;
	}

	/**
	 * @param {Chunk} oldChunk chunk to be replaced
	 * @param {Chunk} newChunk New chunk that will be replaced with
	 * @returns {boolean} returns true if the replacement was successful
	 */
	replaceChunk(oldChunk, newChunk) {
		const oldIdx = this.chunks.indexOf(oldChunk);
		if (oldIdx < 0) return false;
		const newIdx = this.chunks.indexOf(newChunk);
		if (newIdx < 0) {
			this.chunks[oldIdx] = newChunk;
			return true;
		}
		if (newIdx < oldIdx) {
			this.chunks.splice(oldIdx, 1);
			return true;
		} else if (newIdx !== oldIdx) {
			this.chunks[oldIdx] = newChunk;
			this.chunks.splice(newIdx, 1);
			return true;
		}
	}

	removeChunk(chunk) {
		const idx = this.chunks.indexOf(chunk);
		if (idx >= 0) {
			this.chunks.splice(idx, 1);
			return true;
		}
		return false;
	}

	isInitial() {
		return false;
	}

	addChild(chunk) {
		if (this._children.has(chunk)) {
			return false;
		}
		this._children.add(chunk);
		return true;
	}

	getChildren() {
		return this._children.getFromCache(getArray);
	}

	getNumberOfChildren() {
		return this._children.size;
	}

	get childrenIterable() {
		return this._children;
	}

	removeChild(chunk) {
		if (!this._children.has(chunk)) {
			return false;
		}

		this._children.delete(chunk);
		chunk.removeParent(this);
		return true;
	}

	addParent(parentChunk) {
		if (!this._parents.has(parentChunk)) {
			this._parents.add(parentChunk);
			return true;
		}
		return false;
	}

	getParents() {
		return this._parents.getFromCache(getArray);
	}

	setParents(newParents) {
		this._parents.clear();
		for (const p of newParents) {
			this._parents.add(p);
		}
	}

	getNumberOfParents() {
		return this._parents.size;
	}

	hasParent(parent) {
		return this._parents.has(parent);
	}

	get parentsIterable() {
		return this._parents;
	}

	removeParent(chunk) {
		if (this._parents.delete(chunk)) {
			chunk.removeChunk(this);
			return true;
		}
		return false;
	}

	/**
	 * @returns {Array} - an array containing the blocks
	 */
	getBlocks() {
		return this._blocks.getFromCache(getArray);
	}

	getNumberOfBlocks() {
		return this._blocks.size;
	}

	hasBlock(block) {
		return this._blocks.has(block);
	}

	get blocksIterable() {
		return this._blocks;
	}

	addBlock(block) {
		if (!this._blocks.has(block)) {
			this._blocks.add(block);
			return true;
		}
		return false;
	}

	addOrigin(module, loc, request) {
		this.origins.push({
			module,
			loc,
			request
		});
	}

	containsModule(module) {
		for (const chunk of this.chunks) {
			if (chunk.containsModule(module)) return true;
		}
		return false;
	}

	getFiles() {
		const files = new Set();

		for (const chunk of this.chunks) {
			for (const file of chunk.files) {
				files.add(file);
			}
		}

		return Array.from(files);
	}

	/**
	 * @param {string=} reason reason for removing ChunkGroup
	 * @returns {void}
	 */
	remove(reason) {
		// cleanup parents
		for (const parentChunkGroup of this._parents) {
			// remove this chunk from its parents
			parentChunkGroup._children.delete(this);

			// cleanup "sub chunks"
			for (const chunkGroup of this._children) {
				/**
				 * remove this chunk as "intermediary" and connect
				 * it "sub chunks" and parents directly
				 */
				// add parent to each "sub chunk"
				chunkGroup.addParent(parentChunkGroup);
				// add "sub chunk" to parent
				parentChunkGroup.addChild(chunkGroup);
			}
		}

		/**
		 * we need to iterate again over the children
		 * to remove this from the child's parents.
		 * This can not be done in the above loop
		 * as it is not guaranteed that `this._parents` contains anything.
		 */
		for (const chunkGroup of this._children) {
			// remove this as parent of every "sub chunk"
			chunkGroup._parents.delete(this);
		}

		// cleanup blocks
		for (const block of this._blocks) {
			block.chunkGroup = null;
		}

		// remove chunks
		for (const chunk of this.chunks) {
			chunk.removeGroup(this);
		}
	}

	sortItems() {
		this.origins.sort(sortOrigin);
		this._parents.sort();
		this._children.sort();
	}

	/**
	 * Sorting predicate which allows current ChunkGroup to be compared against another.
	 * Sorting values are based off of number of chunks in ChunkGroup.
	 *
	 * @param {ChunkGroup} otherGroup the chunkGroup to compare this against
	 * @returns {-1|0|1} sort position for comparison
	 */
	compareTo(otherGroup) {
		if (this.chunks.length > otherGroup.chunks.length) return -1;
		if (this.chunks.length < otherGroup.chunks.length) return 1;
		const a = this.chunks[Symbol.iterator]();
		const b = otherGroup.chunks[Symbol.iterator]();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const aItem = a.next();
			const bItem = b.next();
			if (aItem.done) return 0;
			const cmp = aItem.value.compareTo(bItem.value);
			if (cmp !== 0) return cmp;
		}
	}

	getChildrenByOrders() {
		const lists = new Map();
		for (const childGroup of this._children) {
			// TODO webpack 5 remove this check for options
			if (typeof childGroup.options === "object") {
				for (const key of Object.keys(childGroup.options)) {
					if (key.endsWith("Order")) {
						const name = key.substr(0, key.length - "Order".length);
						let list = lists.get(name);
						if (list === undefined) {
							lists.set(name, (list = []));
						}
						list.push({
							order: childGroup.options[key],
							group: childGroup
						});
					}
				}
			}
		}
		const result = Object.create(null);
		for (const [name, list] of lists) {
			list.sort((a, b) => {
				const cmp = b.order - a.order;
				if (cmp !== 0) return cmp;
				// TODO webpack 5 remove this check of compareTo
				if (a.group.compareTo) {
					return a.group.compareTo(b.group);
				}
				return 0;
			});
			result[name] = list.map(i => i.group);
		}
		return result;
	}

	/**
	 * Sets the top-down index of a module in this ChunkGroup
	 * @param {Module} module module for which the index should be set
	 * @param {number} index the index of the module
	 * @returns {void}
	 */
	setModuleIndex(module, index) {
		this._moduleIndices.set(module, index);
	}

	/**
	 * Gets the top-down index of a module in this ChunkGroup
	 * @param {Module} module the module
	 * @returns {number} index
	 */
	getModuleIndex(module) {
		return this._moduleIndices.get(module);
	}

	/**
	 * Sets the bottom-up index of a module in this ChunkGroup
	 * @param {Module} module module for which the index should be set
	 * @param {number} index the index of the module
	 * @returns {void}
	 */
	setModuleIndex2(module, index) {
		this._moduleIndices2.set(module, index);
	}

	/**
	 * Gets the bottom-up index of a module in this ChunkGroup
	 * @param {Module} module the module
	 * @returns {number} index
	 */
	getModuleIndex2(module) {
		return this._moduleIndices2.get(module);
	}

	checkConstraints() {
		const chunk = this;
		for (const child of chunk._children) {
			if (!child._parents.has(chunk)) {
				throw new Error(
					`checkConstraints: child missing parent ${chunk.debugId} -> ${child.debugId}`
				);
			}
		}
		for (const parentChunk of chunk._parents) {
			if (!parentChunk._children.has(chunk)) {
				throw new Error(
					`checkConstraints: parent missing child ${parentChunk.debugId} <- ${chunk.debugId}`
				);
			}
		}
	}
}

module.exports = ChunkGroup;


/***/ }),

/***/ 8455:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __webpack_require__(1891);

/** @typedef {import("./Chunk")} Chunk */

class ChunkRenderError extends WebpackError {
	/**
	 * Create a new ChunkRenderError
	 * @param {Chunk} chunk A chunk
	 * @param {string} file Related file
	 * @param {Error} error Original error
	 */
	constructor(chunk, file, error) {
		super();

		this.name = "ChunkRenderError";
		this.error = error;
		this.message = error.message;
		this.details = error.stack;
		this.file = file;
		this.chunk = chunk;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ChunkRenderError;


/***/ }),

/***/ 1863:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const { Tapable, SyncWaterfallHook, SyncHook } = __webpack_require__(1242);

/** @typedef {import("./ModuleTemplate")} ModuleTemplate */
/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./Module")} Module} */
/** @typedef {import("./Dependency").DependencyTemplate} DependencyTemplate} */
/** @typedef {import("./util/createHash").Hash} Hash} */

/**
 * @typedef {Object} RenderManifestOptions
 * @property {Chunk} chunk the chunk used to render
 * @property {string} hash
 * @property {string} fullHash
 * @property {TODO} outputOptions
 * @property {{javascript: ModuleTemplate, webassembly: ModuleTemplate}} moduleTemplates
 * @property {Map<TODO, TODO>} dependencyTemplates
 */

module.exports = class ChunkTemplate extends Tapable {
	constructor(outputOptions) {
		super();
		this.outputOptions = outputOptions || {};
		this.hooks = {
			/** @type {SyncWaterfallHook<TODO[], RenderManifestOptions>} */
			renderManifest: new SyncWaterfallHook(["result", "options"]),
			modules: new SyncWaterfallHook([
				"source",
				"chunk",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			render: new SyncWaterfallHook([
				"source",
				"chunk",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			renderWithEntry: new SyncWaterfallHook(["source", "chunk"]),
			hash: new SyncHook(["hash"]),
			hashForChunk: new SyncHook(["hash", "chunk"])
		};
	}

	/**
	 *
	 * @param {RenderManifestOptions} options render manifest options
	 * @returns {TODO[]} returns render manifest
	 */
	getRenderManifest(options) {
		const result = [];

		this.hooks.renderManifest.call(result, options);

		return result;
	}

	/**
	 * Updates hash with information from this template
	 * @param {Hash} hash the hash to update
	 * @returns {void}
	 */
	updateHash(hash) {
		hash.update("ChunkTemplate");
		hash.update("2");
		this.hooks.hash.call(hash);
	}

	/**
	 * TODO webpack 5: remove moduleTemplate and dependencyTemplates
	 * Updates hash with chunk-specific information from this template
	 * @param {Hash} hash the hash to update
	 * @param {Chunk} chunk the chunk
	 * @param {ModuleTemplate} moduleTemplate ModuleTemplate instance for render
	 * @param {Map<Function, DependencyTemplate>} dependencyTemplates dependency templates
	 * @returns {void}
	 */
	updateHashForChunk(hash, chunk, moduleTemplate, dependencyTemplates) {
		this.updateHash(hash);
		this.hooks.hashForChunk.call(hash, chunk);
	}
};


/***/ }),

/***/ 6587:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
	*/


const asyncLib = __webpack_require__(6386);
const util = __webpack_require__(1669);
const { CachedSource } = __webpack_require__(3745);
const {
	Tapable,
	SyncHook,
	SyncBailHook,
	SyncWaterfallHook,
	AsyncSeriesHook
} = __webpack_require__(1242);
const EntryModuleNotFoundError = __webpack_require__(1295);
const ModuleNotFoundError = __webpack_require__(8927);
const ModuleDependencyWarning = __webpack_require__(8533);
const ModuleDependencyError = __webpack_require__(2337);
const ChunkGroup = __webpack_require__(583);
const Chunk = __webpack_require__(4029);
const Entrypoint = __webpack_require__(8865);
const MainTemplate = __webpack_require__(24);
const ChunkTemplate = __webpack_require__(1863);
const HotUpdateChunkTemplate = __webpack_require__(8008);
const ModuleTemplate = __webpack_require__(3732);
const RuntimeTemplate = __webpack_require__(9753);
const ChunkRenderError = __webpack_require__(8455);
const Stats = __webpack_require__(5096);
const Semaphore = __webpack_require__(4796);
const createHash = __webpack_require__(7442);
const SortableSet = __webpack_require__(3875);
const GraphHelpers = __webpack_require__(3445);
const ModuleDependency = __webpack_require__(6002);
const compareLocations = __webpack_require__(2536);
const { Logger, LogType } = __webpack_require__(7225);
const ErrorHelpers = __webpack_require__(6007);
const buildChunkGraph = __webpack_require__(6043);
const WebpackError = __webpack_require__(1891);

/** @typedef {import("./Module")} Module */
/** @typedef {import("./Compiler")} Compiler */
/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./DependenciesBlockVariable")} DependenciesBlockVariable */
/** @typedef {import("./dependencies/SingleEntryDependency")} SingleEntryDependency */
/** @typedef {import("./dependencies/MultiEntryDependency")} MultiEntryDependency */
/** @typedef {import("./dependencies/DllEntryDependency")} DllEntryDependency */
/** @typedef {import("./dependencies/DependencyReference")} DependencyReference */
/** @typedef {import("./DependenciesBlock")} DependenciesBlock */
/** @typedef {import("./AsyncDependenciesBlock")} AsyncDependenciesBlock */
/** @typedef {import("./Dependency")} Dependency */
/** @typedef {import("./Dependency").DependencyLocation} DependencyLocation */
/** @typedef {import("./Dependency").DependencyTemplate} DependencyTemplate */
/** @typedef {import("./util/createHash").Hash} Hash */

// TODO use @callback
/** @typedef {{[assetName: string]: Source}} CompilationAssets */
/** @typedef {(err: Error|null, result?: Module) => void } ModuleCallback */
/** @typedef {(err?: Error|null, result?: Module) => void } ModuleChainCallback */
/** @typedef {(module: Module) => void} OnModuleCallback */
/** @typedef {(err?: Error|null) => void} Callback */
/** @typedef {(d: Dependency) => any} DepBlockVarDependenciesCallback */
/** @typedef {new (...args: any[]) => Dependency} DepConstructor */
/** @typedef {{apply: () => void}} Plugin */

/**
 * @typedef {Object} ModuleFactoryCreateDataContextInfo
 * @property {string} issuer
 * @property {string} compiler
 */

/**
 * @typedef {Object} ModuleFactoryCreateData
 * @property {ModuleFactoryCreateDataContextInfo} contextInfo
 * @property {any=} resolveOptions
 * @property {string} context
 * @property {Dependency[]} dependencies
 */

/**
 * @typedef {Object} ModuleFactory
 * @property {(data: ModuleFactoryCreateData, callback: ModuleCallback) => any} create
 */

/**
 * @typedef {Object} SortedDependency
 * @property {ModuleFactory} factory
 * @property {Dependency[]} dependencies
 */

/**
 * @typedef {Object} DependenciesBlockLike
 * @property {Dependency[]} dependencies
 * @property {AsyncDependenciesBlock[]} blocks
 * @property {DependenciesBlockVariable[]} variables
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} type
 * @property {any[]} args
 * @property {number} time
 * @property {string[]=} trace
 */

/**
 * @typedef {Object} AssetInfo
 * @property {boolean=} immutable true, if the asset can be long term cached forever (contains a hash)
 * @property {number=} size size in bytes, only set after asset has been emitted
 * @property {boolean=} development true, when asset is only used for development and doesn't count towards user-facing assets
 * @property {boolean=} hotModuleReplacement true, when asset ships data for updating an existing application (HMR)
 */

/**
 * @typedef {Object} Asset
 * @property {string} name the filename of the asset
 * @property {Source} source source of the asset
 * @property {AssetInfo} info info about the asset
 */

/**
 * @param {Chunk} a first chunk to sort by id
 * @param {Chunk} b second chunk to sort by id
 * @returns {-1|0|1} sort value
 */
const byId = (a, b) => {
	if (typeof a.id !== typeof b.id) {
		return typeof a.id < typeof b.id ? -1 : 1;
	}
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	return 0;
};

/**
 * @param {Module} a first module to sort by
 * @param {Module} b second module to sort by
 * @returns {-1|0|1} sort value
 */
const byIdOrIdentifier = (a, b) => {
	if (typeof a.id !== typeof b.id) {
		return typeof a.id < typeof b.id ? -1 : 1;
	}
	if (a.id < b.id) return -1;
	if (a.id > b.id) return 1;
	const identA = a.identifier();
	const identB = b.identifier();
	if (identA < identB) return -1;
	if (identA > identB) return 1;
	return 0;
};

/**
 * @param {Module} a first module to sort by
 * @param {Module} b second module to sort by
 * @returns {-1|0|1} sort value
 */
const byIndexOrIdentifier = (a, b) => {
	if (a.index < b.index) return -1;
	if (a.index > b.index) return 1;
	const identA = a.identifier();
	const identB = b.identifier();
	if (identA < identB) return -1;
	if (identA > identB) return 1;
	return 0;
};

/**
 * @param {Compilation} a first compilation to sort by
 * @param {Compilation} b second compilation to sort by
 * @returns {-1|0|1} sort value
 */
const byNameOrHash = (a, b) => {
	if (a.name < b.name) return -1;
	if (a.name > b.name) return 1;
	if (a.fullHash < b.fullHash) return -1;
	if (a.fullHash > b.fullHash) return 1;
	return 0;
};

/**
 * @param {DependenciesBlockVariable[]} variables DepBlock Variables to iterate over
 * @param {DepBlockVarDependenciesCallback} fn callback to apply on iterated elements
 * @returns {void}
 */
const iterationBlockVariable = (variables, fn) => {
	for (
		let indexVariable = 0;
		indexVariable < variables.length;
		indexVariable++
	) {
		const varDep = variables[indexVariable].dependencies;
		for (let indexVDep = 0; indexVDep < varDep.length; indexVDep++) {
			fn(varDep[indexVDep]);
		}
	}
};

/**
 * @template T
 * @param {T[]} arr array of elements to iterate over
 * @param {function(T): void} fn callback applied to each element
 * @returns {void}
 */
const iterationOfArrayCallback = (arr, fn) => {
	for (let index = 0; index < arr.length; index++) {
		fn(arr[index]);
	}
};

/**
 * @template T
 * @param {Set<T>} set set to add items to
 * @param {Set<T>} otherSet set to add items from
 * @returns {void}
 */
const addAllToSet = (set, otherSet) => {
	for (const item of otherSet) {
		set.add(item);
	}
};

/**
 * @param {Source} a a source
 * @param {Source} b another source
 * @returns {boolean} true, when both sources are equal
 */
const isSourceEqual = (a, b) => {
	if (a === b) return true;
	// TODO webpack 5: check .buffer() instead, it's called anyway during emit
	/** @type {Buffer|string} */
	let aSource = a.source();
	/** @type {Buffer|string} */
	let bSource = b.source();
	if (aSource === bSource) return true;
	if (typeof aSource === "string" && typeof bSource === "string") return false;
	if (!Buffer.isBuffer(aSource)) aSource = Buffer.from(aSource, "utf-8");
	if (!Buffer.isBuffer(bSource)) bSource = Buffer.from(bSource, "utf-8");
	return aSource.equals(bSource);
};

class Compilation extends Tapable {
	/**
	 * Creates an instance of Compilation.
	 * @param {Compiler} compiler the compiler which created the compilation
	 */
	constructor(compiler) {
		super();
		this.hooks = {
			/** @type {SyncHook<Module>} */
			buildModule: new SyncHook(["module"]),
			/** @type {SyncHook<Module>} */
			rebuildModule: new SyncHook(["module"]),
			/** @type {SyncHook<Module, Error>} */
			failedModule: new SyncHook(["module", "error"]),
			/** @type {SyncHook<Module>} */
			succeedModule: new SyncHook(["module"]),

			/** @type {SyncHook<Dependency, string>} */
			addEntry: new SyncHook(["entry", "name"]),
			/** @type {SyncHook<Dependency, string, Error>} */
			failedEntry: new SyncHook(["entry", "name", "error"]),
			/** @type {SyncHook<Dependency, string, Module>} */
			succeedEntry: new SyncHook(["entry", "name", "module"]),

			/** @type {SyncWaterfallHook<DependencyReference, Dependency, Module>} */
			dependencyReference: new SyncWaterfallHook([
				"dependencyReference",
				"dependency",
				"module"
			]),

			/** @type {AsyncSeriesHook<Module[]>} */
			finishModules: new AsyncSeriesHook(["modules"]),
			/** @type {SyncHook<Module>} */
			finishRebuildingModule: new SyncHook(["module"]),
			/** @type {SyncHook} */
			unseal: new SyncHook([]),
			/** @type {SyncHook} */
			seal: new SyncHook([]),

			/** @type {SyncHook} */
			beforeChunks: new SyncHook([]),
			/** @type {SyncHook<Chunk[]>} */
			afterChunks: new SyncHook(["chunks"]),

			/** @type {SyncBailHook<Module[]>} */
			optimizeDependenciesBasic: new SyncBailHook(["modules"]),
			/** @type {SyncBailHook<Module[]>} */
			optimizeDependencies: new SyncBailHook(["modules"]),
			/** @type {SyncBailHook<Module[]>} */
			optimizeDependenciesAdvanced: new SyncBailHook(["modules"]),
			/** @type {SyncBailHook<Module[]>} */
			afterOptimizeDependencies: new SyncHook(["modules"]),

			/** @type {SyncHook} */
			optimize: new SyncHook([]),
			/** @type {SyncBailHook<Module[]>} */
			optimizeModulesBasic: new SyncBailHook(["modules"]),
			/** @type {SyncBailHook<Module[]>} */
			optimizeModules: new SyncBailHook(["modules"]),
			/** @type {SyncBailHook<Module[]>} */
			optimizeModulesAdvanced: new SyncBailHook(["modules"]),
			/** @type {SyncHook<Module[]>} */
			afterOptimizeModules: new SyncHook(["modules"]),

			/** @type {SyncBailHook<Chunk[], ChunkGroup[]>} */
			optimizeChunksBasic: new SyncBailHook(["chunks", "chunkGroups"]),
			/** @type {SyncBailHook<Chunk[], ChunkGroup[]>} */
			optimizeChunks: new SyncBailHook(["chunks", "chunkGroups"]),
			/** @type {SyncBailHook<Chunk[], ChunkGroup[]>} */
			optimizeChunksAdvanced: new SyncBailHook(["chunks", "chunkGroups"]),
			/** @type {SyncHook<Chunk[], ChunkGroup[]>} */
			afterOptimizeChunks: new SyncHook(["chunks", "chunkGroups"]),

			/** @type {AsyncSeriesHook<Chunk[], Module[]>} */
			optimizeTree: new AsyncSeriesHook(["chunks", "modules"]),
			/** @type {SyncHook<Chunk[], Module[]>} */
			afterOptimizeTree: new SyncHook(["chunks", "modules"]),

			/** @type {SyncBailHook<Chunk[], Module[]>} */
			optimizeChunkModulesBasic: new SyncBailHook(["chunks", "modules"]),
			/** @type {SyncBailHook<Chunk[], Module[]>} */
			optimizeChunkModules: new SyncBailHook(["chunks", "modules"]),
			/** @type {SyncBailHook<Chunk[], Module[]>} */
			optimizeChunkModulesAdvanced: new SyncBailHook(["chunks", "modules"]),
			/** @type {SyncHook<Chunk[], Module[]>} */
			afterOptimizeChunkModules: new SyncHook(["chunks", "modules"]),
			/** @type {SyncBailHook} */
			shouldRecord: new SyncBailHook([]),

			/** @type {SyncHook<Module[], any>} */
			reviveModules: new SyncHook(["modules", "records"]),
			/** @type {SyncHook<Module[]>} */
			optimizeModuleOrder: new SyncHook(["modules"]),
			/** @type {SyncHook<Module[]>} */
			advancedOptimizeModuleOrder: new SyncHook(["modules"]),
			/** @type {SyncHook<Module[]>} */
			beforeModuleIds: new SyncHook(["modules"]),
			/** @type {SyncHook<Module[]>} */
			moduleIds: new SyncHook(["modules"]),
			/** @type {SyncHook<Module[]>} */
			optimizeModuleIds: new SyncHook(["modules"]),
			/** @type {SyncHook<Module[]>} */
			afterOptimizeModuleIds: new SyncHook(["modules"]),

			/** @type {SyncHook<Chunk[], any>} */
			reviveChunks: new SyncHook(["chunks", "records"]),
			/** @type {SyncHook<Chunk[]>} */
			optimizeChunkOrder: new SyncHook(["chunks"]),
			/** @type {SyncHook<Chunk[]>} */
			beforeChunkIds: new SyncHook(["chunks"]),
			/** @type {SyncHook<Chunk[]>} */
			optimizeChunkIds: new SyncHook(["chunks"]),
			/** @type {SyncHook<Chunk[]>} */
			afterOptimizeChunkIds: new SyncHook(["chunks"]),

			/** @type {SyncHook<Module[], any>} */
			recordModules: new SyncHook(["modules", "records"]),
			/** @type {SyncHook<Chunk[], any>} */
			recordChunks: new SyncHook(["chunks", "records"]),

			/** @type {SyncHook} */
			beforeHash: new SyncHook([]),
			/** @type {SyncHook<Chunk>} */
			contentHash: new SyncHook(["chunk"]),
			/** @type {SyncHook} */
			afterHash: new SyncHook([]),
			/** @type {SyncHook<any>} */
			recordHash: new SyncHook(["records"]),
			/** @type {SyncHook<Compilation, any>} */
			record: new SyncHook(["compilation", "records"]),

			/** @type {SyncHook} */
			beforeModuleAssets: new SyncHook([]),
			/** @type {SyncBailHook} */
			shouldGenerateChunkAssets: new SyncBailHook([]),
			/** @type {SyncHook} */
			beforeChunkAssets: new SyncHook([]),
			/** @type {SyncHook<Chunk[]>} */
			additionalChunkAssets: new SyncHook(["chunks"]),

			/** @type {AsyncSeriesHook} */
			additionalAssets: new AsyncSeriesHook([]),
			/** @type {AsyncSeriesHook<Chunk[]>} */
			optimizeChunkAssets: new AsyncSeriesHook(["chunks"]),
			/** @type {SyncHook<Chunk[]>} */
			afterOptimizeChunkAssets: new SyncHook(["chunks"]),
			/** @type {AsyncSeriesHook<CompilationAssets>} */
			optimizeAssets: new AsyncSeriesHook(["assets"]),
			/** @type {SyncHook<CompilationAssets>} */
			afterOptimizeAssets: new SyncHook(["assets"]),

			/** @type {SyncBailHook} */
			needAdditionalSeal: new SyncBailHook([]),
			/** @type {AsyncSeriesHook} */
			afterSeal: new AsyncSeriesHook([]),

			/** @type {SyncHook<Chunk, Hash>} */
			chunkHash: new SyncHook(["chunk", "chunkHash"]),
			/** @type {SyncHook<Module, string>} */
			moduleAsset: new SyncHook(["module", "filename"]),
			/** @type {SyncHook<Chunk, string>} */
			chunkAsset: new SyncHook(["chunk", "filename"]),

			/** @type {SyncWaterfallHook<string, TODO>} */
			assetPath: new SyncWaterfallHook(["filename", "data"]), // TODO MainTemplate

			/** @type {SyncBailHook} */
			needAdditionalPass: new SyncBailHook([]),

			/** @type {SyncHook<Compiler, string, number>} */
			childCompiler: new SyncHook([
				"childCompiler",
				"compilerName",
				"compilerIndex"
			]),

			/** @type {SyncBailHook<string, LogEntry>} */
			log: new SyncBailHook(["origin", "logEntry"]),

			// TODO the following hooks are weirdly located here
			// TODO move them for webpack 5
			/** @type {SyncHook<object, Module>} */
			normalModuleLoader: new SyncHook(["loaderContext", "module"]),

			/** @type {SyncBailHook<Chunk[]>} */
			optimizeExtractedChunksBasic: new SyncBailHook(["chunks"]),
			/** @type {SyncBailHook<Chunk[]>} */
			optimizeExtractedChunks: new SyncBailHook(["chunks"]),
			/** @type {SyncBailHook<Chunk[]>} */
			optimizeExtractedChunksAdvanced: new SyncBailHook(["chunks"]),
			/** @type {SyncHook<Chunk[]>} */
			afterOptimizeExtractedChunks: new SyncHook(["chunks"])
		};
		this._pluginCompat.tap("Compilation", options => {
			switch (options.name) {
				case "optimize-tree":
				case "additional-assets":
				case "optimize-chunk-assets":
				case "optimize-assets":
				case "after-seal":
					options.async = true;
					break;
			}
		});
		/** @type {string=} */
		this.name = undefined;
		/** @type {Compiler} */
		this.compiler = compiler;
		this.resolverFactory = compiler.resolverFactory;
		this.inputFileSystem = compiler.inputFileSystem;
		this.requestShortener = compiler.requestShortener;

		const options = compiler.options;
		this.options = options;
		this.outputOptions = options && options.output;
		/** @type {boolean=} */
		this.bail = options && options.bail;
		this.profile = options && options.profile;
		this.performance = options && options.performance;

		this.mainTemplate = new MainTemplate(this.outputOptions);
		this.chunkTemplate = new ChunkTemplate(this.outputOptions);
		this.hotUpdateChunkTemplate = new HotUpdateChunkTemplate(
			this.outputOptions
		);
		this.runtimeTemplate = new RuntimeTemplate(
			this.outputOptions,
			this.requestShortener
		);
		this.moduleTemplates = {
			javascript: new ModuleTemplate(this.runtimeTemplate, "javascript"),
			webassembly: new ModuleTemplate(this.runtimeTemplate, "webassembly")
		};

		this.semaphore = new Semaphore(options.parallelism || 100);

		this.entries = [];
		/** @private @type {{name: string, request: string, module: Module}[]} */
		this._preparedEntrypoints = [];
		/** @type {Map<string, Entrypoint>} */
		this.entrypoints = new Map();
		/** @type {Chunk[]} */
		this.chunks = [];
		/** @type {ChunkGroup[]} */
		this.chunkGroups = [];
		/** @type {Map<string, ChunkGroup>} */
		this.namedChunkGroups = new Map();
		/** @type {Map<string, Chunk>} */
		this.namedChunks = new Map();
		/** @type {Module[]} */
		this.modules = [];
		/** @private @type {Map<string, Module>} */
		this._modules = new Map();
		this.cache = null;
		this.records = null;
		/** @type {string[]} */
		this.additionalChunkAssets = [];
		/** @type {CompilationAssets} */
		this.assets = {};
		/** @type {Map<string, AssetInfo>} */
		this.assetsInfo = new Map();
		/** @type {WebpackError[]} */
		this.errors = [];
		/** @type {WebpackError[]} */
		this.warnings = [];
		/** @type {Compilation[]} */
		this.children = [];
		/** @type {Map<string, LogEntry[]>} */
		this.logging = new Map();
		/** @type {Map<DepConstructor, ModuleFactory>} */
		this.dependencyFactories = new Map();
		/** @type {Map<DepConstructor, DependencyTemplate>} */
		this.dependencyTemplates = new Map();
		// TODO refactor this in webpack 5 to a custom DependencyTemplates class with a hash property
		// @ts-ignore
		this.dependencyTemplates.set("hash", "");
		this.childrenCounters = {};
		/** @type {Set<number|string>} */
		this.usedChunkIds = null;
		/** @type {Set<number>} */
		this.usedModuleIds = null;
		/** @type {Map<string, number>=} */
		this.fileTimestamps = undefined;
		/** @type {Map<string, number>=} */
		this.contextTimestamps = undefined;
		/** @type {Set<string>=} */
		this.compilationDependencies = undefined;
		/** @private @type {Map<Module, Callback[]>} */
		this._buildingModules = new Map();
		/** @private @type {Map<Module, Callback[]>} */
		this._rebuildingModules = new Map();
		/** @type {Set<string>} */
		this.emittedAssets = new Set();
	}

	getStats() {
		return new Stats(this);
	}

	/**
	 * @param {string | (function(): string)} name name of the logger, or function called once to get the logger name
	 * @returns {Logger} a logger with that name
	 */
	getLogger(name) {
		if (!name) {
			throw new TypeError("Compilation.getLogger(name) called without a name");
		}
		/** @type {LogEntry[] | undefined} */
		let logEntries;
		return new Logger((type, args) => {
			if (typeof name === "function") {
				name = name();
				if (!name) {
					throw new TypeError(
						"Compilation.getLogger(name) called with a function not returning a name"
					);
				}
			}
			let trace;
			switch (type) {
				case LogType.warn:
				case LogType.error:
				case LogType.trace:
					trace = ErrorHelpers.cutOffLoaderExecution(new Error("Trace").stack)
						.split("\n")
						.slice(3);
					break;
			}
			/** @type {LogEntry} */
			const logEntry = {
				time: Date.now(),
				type,
				args,
				trace
			};
			if (this.hooks.log.call(name, logEntry) === undefined) {
				if (logEntry.type === LogType.profileEnd) {
					// eslint-disable-next-line node/no-unsupported-features/node-builtins
					if (typeof console.profileEnd === "function") {
						// eslint-disable-next-line node/no-unsupported-features/node-builtins
						console.profileEnd(`[${name}] ${logEntry.args[0]}`);
					}
				}
				if (logEntries === undefined) {
					logEntries = this.logging.get(name);
					if (logEntries === undefined) {
						logEntries = [];
						this.logging.set(name, logEntries);
					}
				}
				logEntries.push(logEntry);
				if (logEntry.type === LogType.profile) {
					// eslint-disable-next-line node/no-unsupported-features/node-builtins
					if (typeof console.profile === "function") {
						// eslint-disable-next-line node/no-unsupported-features/node-builtins
						console.profile(`[${name}] ${logEntry.args[0]}`);
					}
				}
			}
		});
	}

	/**
	 * @typedef {Object} AddModuleResult
	 * @property {Module} module the added or existing module
	 * @property {boolean} issuer was this the first request for this module
	 * @property {boolean} build should the module be build
	 * @property {boolean} dependencies should dependencies be walked
	 */

	/**
	 * @param {Module} module module to be added that was created
	 * @param {any=} cacheGroup cacheGroup it is apart of
	 * @returns {AddModuleResult} returns meta about whether or not the module had built
	 * had an issuer, or any dependnecies
	 */
	addModule(module, cacheGroup) {
		const identifier = module.identifier();
		const alreadyAddedModule = this._modules.get(identifier);
		if (alreadyAddedModule) {
			return {
				module: alreadyAddedModule,
				issuer: false,
				build: false,
				dependencies: false
			};
		}
		const cacheName = (cacheGroup || "m") + identifier;
		if (this.cache && this.cache[cacheName]) {
			const cacheModule = this.cache[cacheName];

			if (typeof cacheModule.updateCacheModule === "function") {
				cacheModule.updateCacheModule(module);
			}

			let rebuild = true;
			if (this.fileTimestamps && this.contextTimestamps) {
				rebuild = cacheModule.needRebuild(
					this.fileTimestamps,
					this.contextTimestamps
				);
			}

			if (!rebuild) {
				cacheModule.disconnect();
				this._modules.set(identifier, cacheModule);
				this.modules.push(cacheModule);
				for (const err of cacheModule.errors) {
					this.errors.push(err);
				}
				for (const err of cacheModule.warnings) {
					this.warnings.push(err);
				}
				return {
					module: cacheModule,
					issuer: true,
					build: false,
					dependencies: true
				};
			}
			cacheModule.unbuild();
			module = cacheModule;
		}
		this._modules.set(identifier, module);
		if (this.cache) {
			this.cache[cacheName] = module;
		}
		this.modules.push(module);
		return {
			module: module,
			issuer: true,
			build: true,
			dependencies: true
		};
	}

	/**
	 * Fetches a module from a compilation by its identifier
	 * @param {Module} module the module provided
	 * @returns {Module} the module requested
	 */
	getModule(module) {
		const identifier = module.identifier();
		return this._modules.get(identifier);
	}

	/**
	 * Attempts to search for a module by its identifier
	 * @param {string} identifier identifier (usually path) for module
	 * @returns {Module|undefined} attempt to search for module and return it, else undefined
	 */
	findModule(identifier) {
		return this._modules.get(identifier);
	}

	/**
	 * @param {Module} module module with its callback list
	 * @param {Callback} callback the callback function
	 * @returns {void}
	 */
	waitForBuildingFinished(module, callback) {
		let callbackList = this._buildingModules.get(module);
		if (callbackList) {
			callbackList.push(() => callback());
		} else {
			process.nextTick(callback);
		}
	}

	/**
	 * Builds the module object
	 *
	 * @param {Module} module module to be built
	 * @param {boolean} optional optional flag
	 * @param {Module=} origin origin module this module build was requested from
	 * @param {Dependency[]=} dependencies optional dependencies from the module to be built
	 * @param {TODO} thisCallback the callback
	 * @returns {TODO} returns the callback function with results
	 */
	buildModule(module, optional, origin, dependencies, thisCallback) {
		let callbackList = this._buildingModules.get(module);
		if (callbackList) {
			callbackList.push(thisCallback);
			return;
		}
		this._buildingModules.set(module, (callbackList = [thisCallback]));

		const callback = err => {
			this._buildingModules.delete(module);
			for (const cb of callbackList) {
				cb(err);
			}
		};

		this.hooks.buildModule.call(module);
		module.build(
			this.options,
			this,
			this.resolverFactory.get("normal", module.resolveOptions),
			this.inputFileSystem,
			error => {
				const errors = module.errors;
				for (let indexError = 0; indexError < errors.length; indexError++) {
					const err = errors[indexError];
					err.origin = origin;
					err.dependencies = dependencies;
					if (optional) {
						this.warnings.push(err);
					} else {
						this.errors.push(err);
					}
				}

				const warnings = module.warnings;
				for (
					let indexWarning = 0;
					indexWarning < warnings.length;
					indexWarning++
				) {
					const war = warnings[indexWarning];
					war.origin = origin;
					war.dependencies = dependencies;
					this.warnings.push(war);
				}
				const originalMap = module.dependencies.reduce((map, v, i) => {
					map.set(v, i);
					return map;
				}, new Map());
				module.dependencies.sort((a, b) => {
					const cmp = compareLocations(a.loc, b.loc);
					if (cmp) return cmp;
					return originalMap.get(a) - originalMap.get(b);
				});
				if (error) {
					this.hooks.failedModule.call(module, error);
					return callback(error);
				}
				this.hooks.succeedModule.call(module);
				return callback();
			}
		);
	}

	/**
	 * @param {Module} module to be processed for deps
	 * @param {ModuleCallback} callback callback to be triggered
	 * @returns {void}
	 */
	processModuleDependencies(module, callback) {
		const dependencies = new Map();

		const addDependency = dep => {
			const resourceIdent = dep.getResourceIdentifier();
			if (resourceIdent) {
				const factory = this.dependencyFactories.get(dep.constructor);
				if (factory === undefined) {
					throw new Error(
						`No module factory available for dependency type: ${dep.constructor.name}`
					);
				}
				let innerMap = dependencies.get(factory);
				if (innerMap === undefined) {
					dependencies.set(factory, (innerMap = new Map()));
				}
				let list = innerMap.get(resourceIdent);
				if (list === undefined) innerMap.set(resourceIdent, (list = []));
				list.push(dep);
			}
		};

		const addDependenciesBlock = block => {
			if (block.dependencies) {
				iterationOfArrayCallback(block.dependencies, addDependency);
			}
			if (block.blocks) {
				iterationOfArrayCallback(block.blocks, addDependenciesBlock);
			}
			if (block.variables) {
				iterationBlockVariable(block.variables, addDependency);
			}
		};

		try {
			addDependenciesBlock(module);
		} catch (e) {
			callback(e);
		}

		const sortedDependencies = [];

		for (const pair1 of dependencies) {
			for (const pair2 of pair1[1]) {
				sortedDependencies.push({
					factory: pair1[0],
					dependencies: pair2[1]
				});
			}
		}

		this.addModuleDependencies(
			module,
			sortedDependencies,
			this.bail,
			null,
			true,
			callback
		);
	}

	/**
	 * @param {Module} module module to add deps to
	 * @param {SortedDependency[]} dependencies set of sorted dependencies to iterate through
	 * @param {(boolean|null)=} bail whether to bail or not
	 * @param {TODO} cacheGroup optional cacheGroup
	 * @param {boolean} recursive whether it is recursive traversal
	 * @param {function} callback callback for when dependencies are finished being added
	 * @returns {void}
	 */
	addModuleDependencies(
		module,
		dependencies,
		bail,
		cacheGroup,
		recursive,
		callback
	) {
		const start = this.profile && Date.now();
		const currentProfile = this.profile && {};

		asyncLib.forEach(
			dependencies,
			(item, callback) => {
				const dependencies = item.dependencies;

				const errorAndCallback = err => {
					err.origin = module;
					err.dependencies = dependencies;
					this.errors.push(err);
					if (bail) {
						callback(err);
					} else {
						callback();
					}
				};
				const warningAndCallback = err => {
					err.origin = module;
					this.warnings.push(err);
					callback();
				};

				const semaphore = this.semaphore;
				semaphore.acquire(() => {
					const factory = item.factory;
					factory.create(
						{
							contextInfo: {
								issuer: module.nameForCondition && module.nameForCondition(),
								compiler: this.compiler.name
							},
							resolveOptions: module.resolveOptions,
							context: module.context,
							dependencies: dependencies
						},
						(err, dependentModule) => {
							let afterFactory;

							const isOptional = () => {
								return dependencies.every(d => d.optional);
							};

							const errorOrWarningAndCallback = err => {
								if (isOptional()) {
									return warningAndCallback(err);
								} else {
									return errorAndCallback(err);
								}
							};

							if (err) {
								semaphore.release();
								return errorOrWarningAndCallback(
									new ModuleNotFoundError(module, err)
								);
							}
							if (!dependentModule) {
								semaphore.release();
								return process.nextTick(callback);
							}
							if (currentProfile) {
								afterFactory = Date.now();
								currentProfile.factory = afterFactory - start;
							}

							const iterationDependencies = depend => {
								for (let index = 0; index < depend.length; index++) {
									const dep = depend[index];
									dep.module = dependentModule;
									dependentModule.addReason(module, dep);
								}
							};

							const addModuleResult = this.addModule(
								dependentModule,
								cacheGroup
							);
							dependentModule = addModuleResult.module;
							iterationDependencies(dependencies);

							const afterBuild = () => {
								if (recursive && addModuleResult.dependencies) {
									this.processModuleDependencies(dependentModule, callback);
								} else {
									return callback();
								}
							};

							if (addModuleResult.issuer) {
								if (currentProfile) {
									dependentModule.profile = currentProfile;
								}

								dependentModule.issuer = module;
							} else {
								if (this.profile) {
									if (module.profile) {
										const time = Date.now() - start;
										if (
											!module.profile.dependencies ||
											time > module.profile.dependencies
										) {
											module.profile.dependencies = time;
										}
									}
								}
							}

							if (addModuleResult.build) {
								this.buildModule(
									dependentModule,
									isOptional(),
									module,
									dependencies,
									err => {
										if (err) {
											semaphore.release();
											return errorOrWarningAndCallback(err);
										}

										if (currentProfile) {
											const afterBuilding = Date.now();
											currentProfile.building = afterBuilding - afterFactory;
										}

										semaphore.release();
										afterBuild();
									}
								);
							} else {
								semaphore.release();
								this.waitForBuildingFinished(dependentModule, afterBuild);
							}
						}
					);
				});
			},
			err => {
				// In V8, the Error objects keep a reference to the functions on the stack. These warnings &
				// errors are created inside closures that keep a reference to the Compilation, so errors are
				// leaking the Compilation object.

				if (err) {
					// eslint-disable-next-line no-self-assign
					err.stack = err.stack;
					return callback(err);
				}

				return process.nextTick(callback);
			}
		);
	}

	/**
	 *
	 * @param {string} context context string path
	 * @param {Dependency} dependency dependency used to create Module chain
	 * @param {OnModuleCallback} onModule function invoked on modules creation
	 * @param {ModuleChainCallback} callback callback for when module chain is complete
	 * @returns {void} will throw if dependency instance is not a valid Dependency
	 */
	_addModuleChain(context, dependency, onModule, callback) {
		const start = this.profile && Date.now();
		const currentProfile = this.profile && {};

		const errorAndCallback = this.bail
			? err => {
					callback(err);
			  }
			: err => {
					err.dependencies = [dependency];
					this.errors.push(err);
					callback();
			  };

		if (
			typeof dependency !== "object" ||
			dependency === null ||
			!dependency.constructor
		) {
			throw new Error("Parameter 'dependency' must be a Dependency");
		}
		const Dep = /** @type {DepConstructor} */ (dependency.constructor);
		const moduleFactory = this.dependencyFactories.get(Dep);
		if (!moduleFactory) {
			throw new Error(
				`No dependency factory available for this dependency type: ${dependency.constructor.name}`
			);
		}

		this.semaphore.acquire(() => {
			moduleFactory.create(
				{
					contextInfo: {
						issuer: "",
						compiler: this.compiler.name
					},
					context: context,
					dependencies: [dependency]
				},
				(err, module) => {
					if (err) {
						this.semaphore.release();
						return errorAndCallback(new EntryModuleNotFoundError(err));
					}

					let afterFactory;

					if (currentProfile) {
						afterFactory = Date.now();
						currentProfile.factory = afterFactory - start;
					}

					const addModuleResult = this.addModule(module);
					module = addModuleResult.module;

					onModule(module);

					dependency.module = module;
					module.addReason(null, dependency);

					const afterBuild = () => {
						if (addModuleResult.dependencies) {
							this.processModuleDependencies(module, err => {
								if (err) return callback(err);
								callback(null, module);
							});
						} else {
							return callback(null, module);
						}
					};

					if (addModuleResult.issuer) {
						if (currentProfile) {
							module.profile = currentProfile;
						}
					}

					if (addModuleResult.build) {
						this.buildModule(module, false, null, null, err => {
							if (err) {
								this.semaphore.release();
								return errorAndCallback(err);
							}

							if (currentProfile) {
								const afterBuilding = Date.now();
								currentProfile.building = afterBuilding - afterFactory;
							}

							this.semaphore.release();
							afterBuild();
						});
					} else {
						this.semaphore.release();
						this.waitForBuildingFinished(module, afterBuild);
					}
				}
			);
		});
	}

	/**
	 *
	 * @param {string} context context path for entry
	 * @param {Dependency} entry entry dependency being created
	 * @param {string} name name of entry
	 * @param {ModuleCallback} callback callback function
	 * @returns {void} returns
	 */
	addEntry(context, entry, name, callback) {
		this.hooks.addEntry.call(entry, name);

		const slot = {
			name: name,
			// TODO webpack 5 remove `request`
			request: null,
			module: null
		};

		if (entry instanceof ModuleDependency) {
			slot.request = entry.request;
		}

		// TODO webpack 5: merge modules instead when multiple entry modules are supported
		const idx = this._preparedEntrypoints.findIndex(slot => slot.name === name);
		if (idx >= 0) {
			// Overwrite existing entrypoint
			this._preparedEntrypoints[idx] = slot;
		} else {
			this._preparedEntrypoints.push(slot);
		}
		this._addModuleChain(
			context,
			entry,
			module => {
				this.entries.push(module);
			},
			(err, module) => {
				if (err) {
					this.hooks.failedEntry.call(entry, name, err);
					return callback(err);
				}

				if (module) {
					slot.module = module;
				} else {
					const idx = this._preparedEntrypoints.indexOf(slot);
					if (idx >= 0) {
						this._preparedEntrypoints.splice(idx, 1);
					}
				}
				this.hooks.succeedEntry.call(entry, name, module);
				return callback(null, module);
			}
		);
	}

	/**
	 * @param {string} context context path string
	 * @param {Dependency} dependency dep used to create module
	 * @param {ModuleCallback} callback module callback sending module up a level
	 * @returns {void}
	 */
	prefetch(context, dependency, callback) {
		this._addModuleChain(
			context,
			dependency,
			module => {
				module.prefetched = true;
			},
			callback
		);
	}

	/**
	 * @param {Module} module module to be rebuilt
	 * @param {Callback} thisCallback callback when module finishes rebuilding
	 * @returns {void}
	 */
	rebuildModule(module, thisCallback) {
		let callbackList = this._rebuildingModules.get(module);
		if (callbackList) {
			callbackList.push(thisCallback);
			return;
		}
		this._rebuildingModules.set(module, (callbackList = [thisCallback]));

		const callback = err => {
			this._rebuildingModules.delete(module);
			for (const cb of callbackList) {
				cb(err);
			}
		};

		this.hooks.rebuildModule.call(module);
		const oldDependencies = module.dependencies.slice();
		const oldVariables = module.variables.slice();
		const oldBlocks = module.blocks.slice();
		module.unbuild();
		this.buildModule(module, false, module, null, err => {
			if (err) {
				this.hooks.finishRebuildingModule.call(module);
				return callback(err);
			}

			this.processModuleDependencies(module, err => {
				if (err) return callback(err);
				this.removeReasonsOfDependencyBlock(module, {
					dependencies: oldDependencies,
					variables: oldVariables,
					blocks: oldBlocks
				});
				this.hooks.finishRebuildingModule.call(module);
				callback();
			});
		});
	}

	finish(callback) {
		const modules = this.modules;
		this.hooks.finishModules.callAsync(modules, err => {
			if (err) return callback(err);

			for (let index = 0; index < modules.length; index++) {
				const module = modules[index];
				this.reportDependencyErrorsAndWarnings(module, [module]);
			}

			callback();
		});
	}

	unseal() {
		this.hooks.unseal.call();
		this.chunks.length = 0;
		this.chunkGroups.length = 0;
		this.namedChunks.clear();
		this.namedChunkGroups.clear();
		this.additionalChunkAssets.length = 0;
		this.assets = {};
		this.assetsInfo.clear();
		for (const module of this.modules) {
			module.unseal();
		}
	}

	/**
	 * @param {Callback} callback signals when the seal method is finishes
	 * @returns {void}
	 */
	seal(callback) {
		this.hooks.seal.call();

		while (
			this.hooks.optimizeDependenciesBasic.call(this.modules) ||
			this.hooks.optimizeDependencies.call(this.modules) ||
			this.hooks.optimizeDependenciesAdvanced.call(this.modules)
		) {
			/* empty */
		}
		this.hooks.afterOptimizeDependencies.call(this.modules);

		this.hooks.beforeChunks.call();
		for (const preparedEntrypoint of this._preparedEntrypoints) {
			const module = preparedEntrypoint.module;
			const name = preparedEntrypoint.name;
			const chunk = this.addChunk(name);
			const entrypoint = new Entrypoint(name);
			entrypoint.setRuntimeChunk(chunk);
			entrypoint.addOrigin(null, name, preparedEntrypoint.request);
			this.namedChunkGroups.set(name, entrypoint);
			this.entrypoints.set(name, entrypoint);
			this.chunkGroups.push(entrypoint);

			GraphHelpers.connectChunkGroupAndChunk(entrypoint, chunk);
			GraphHelpers.connectChunkAndModule(chunk, module);

			chunk.entryModule = module;
			chunk.name = name;

			this.assignDepth(module);
		}
		buildChunkGraph(
			this,
			/** @type {Entrypoint[]} */ (this.chunkGroups.slice())
		);
		this.sortModules(this.modules);
		this.hooks.afterChunks.call(this.chunks);

		this.hooks.optimize.call();

		while (
			this.hooks.optimizeModulesBasic.call(this.modules) ||
			this.hooks.optimizeModules.call(this.modules) ||
			this.hooks.optimizeModulesAdvanced.call(this.modules)
		) {
			/* empty */
		}
		this.hooks.afterOptimizeModules.call(this.modules);

		while (
			this.hooks.optimizeChunksBasic.call(this.chunks, this.chunkGroups) ||
			this.hooks.optimizeChunks.call(this.chunks, this.chunkGroups) ||
			this.hooks.optimizeChunksAdvanced.call(this.chunks, this.chunkGroups)
		) {
			/* empty */
		}
		this.hooks.afterOptimizeChunks.call(this.chunks, this.chunkGroups);

		this.hooks.optimizeTree.callAsync(this.chunks, this.modules, err => {
			if (err) {
				return callback(err);
			}

			this.hooks.afterOptimizeTree.call(this.chunks, this.modules);

			while (
				this.hooks.optimizeChunkModulesBasic.call(this.chunks, this.modules) ||
				this.hooks.optimizeChunkModules.call(this.chunks, this.modules) ||
				this.hooks.optimizeChunkModulesAdvanced.call(this.chunks, this.modules)
			) {
				/* empty */
			}
			this.hooks.afterOptimizeChunkModules.call(this.chunks, this.modules);

			const shouldRecord = this.hooks.shouldRecord.call() !== false;

			this.hooks.reviveModules.call(this.modules, this.records);
			this.hooks.optimizeModuleOrder.call(this.modules);
			this.hooks.advancedOptimizeModuleOrder.call(this.modules);
			this.hooks.beforeModuleIds.call(this.modules);
			this.hooks.moduleIds.call(this.modules);
			this.applyModuleIds();
			this.hooks.optimizeModuleIds.call(this.modules);
			this.hooks.afterOptimizeModuleIds.call(this.modules);

			this.sortItemsWithModuleIds();

			this.hooks.reviveChunks.call(this.chunks, this.records);
			this.hooks.optimizeChunkOrder.call(this.chunks);
			this.hooks.beforeChunkIds.call(this.chunks);
			this.applyChunkIds();
			this.hooks.optimizeChunkIds.call(this.chunks);
			this.hooks.afterOptimizeChunkIds.call(this.chunks);

			this.sortItemsWithChunkIds();

			if (shouldRecord) {
				this.hooks.recordModules.call(this.modules, this.records);
				this.hooks.recordChunks.call(this.chunks, this.records);
			}

			this.hooks.beforeHash.call();
			this.createHash();
			this.hooks.afterHash.call();

			if (shouldRecord) {
				this.hooks.recordHash.call(this.records);
			}

			this.hooks.beforeModuleAssets.call();
			this.createModuleAssets();
			if (this.hooks.shouldGenerateChunkAssets.call() !== false) {
				this.hooks.beforeChunkAssets.call();
				this.createChunkAssets();
			}
			this.hooks.additionalChunkAssets.call(this.chunks);
			this.summarizeDependencies();
			if (shouldRecord) {
				this.hooks.record.call(this, this.records);
			}

			this.hooks.additionalAssets.callAsync(err => {
				if (err) {
					return callback(err);
				}
				this.hooks.optimizeChunkAssets.callAsync(this.chunks, err => {
					if (err) {
						return callback(err);
					}
					this.hooks.afterOptimizeChunkAssets.call(this.chunks);
					this.hooks.optimizeAssets.callAsync(this.assets, err => {
						if (err) {
							return callback(err);
						}
						this.hooks.afterOptimizeAssets.call(this.assets);
						if (this.hooks.needAdditionalSeal.call()) {
							this.unseal();
							return this.seal(callback);
						}
						return this.hooks.afterSeal.callAsync(callback);
					});
				});
			});
		});
	}

	/**
	 * @param {Module[]} modules the modules array on compilation to perform the sort for
	 * @returns {void}
	 */
	sortModules(modules) {
		// TODO webpack 5: this should only be enabled when `moduleIds: "natural"`
		// TODO move it into a plugin (NaturalModuleIdsPlugin) and use this in WebpackOptionsApply
		// TODO remove this method
		modules.sort(byIndexOrIdentifier);
	}

	/**
	 * @param {Module} module moulde to report from
	 * @param {DependenciesBlock[]} blocks blocks to report from
	 * @returns {void}
	 */
	reportDependencyErrorsAndWarnings(module, blocks) {
		for (let indexBlock = 0; indexBlock < blocks.length; indexBlock++) {
			const block = blocks[indexBlock];
			const dependencies = block.dependencies;

			for (let indexDep = 0; indexDep < dependencies.length; indexDep++) {
				const d = dependencies[indexDep];

				const warnings = d.getWarnings();
				if (warnings) {
					for (let indexWar = 0; indexWar < warnings.length; indexWar++) {
						const w = warnings[indexWar];

						const warning = new ModuleDependencyWarning(module, w, d.loc);
						this.warnings.push(warning);
					}
				}
				const errors = d.getErrors();
				if (errors) {
					for (let indexErr = 0; indexErr < errors.length; indexErr++) {
						const e = errors[indexErr];

						const error = new ModuleDependencyError(module, e, d.loc);
						this.errors.push(error);
					}
				}
			}

			this.reportDependencyErrorsAndWarnings(module, block.blocks);
		}
	}

	/**
	 * @param {TODO} groupOptions options for the chunk group
	 * @param {Module} module the module the references the chunk group
	 * @param {DependencyLocation} loc the location from with the chunk group is referenced (inside of module)
	 * @param {string} request the request from which the the chunk group is referenced
	 * @returns {ChunkGroup} the new or existing chunk group
	 */
	addChunkInGroup(groupOptions, module, loc, request) {
		if (typeof groupOptions === "string") {
			groupOptions = { name: groupOptions };
		}
		const name = groupOptions.name;
		if (name) {
			const chunkGroup = this.namedChunkGroups.get(name);
			if (chunkGroup !== undefined) {
				chunkGroup.addOptions(groupOptions);
				if (module) {
					chunkGroup.addOrigin(module, loc, request);
				}
				return chunkGroup;
			}
		}
		const chunkGroup = new ChunkGroup(groupOptions);
		if (module) chunkGroup.addOrigin(module, loc, request);
		const chunk = this.addChunk(name);

		GraphHelpers.connectChunkGroupAndChunk(chunkGroup, chunk);

		this.chunkGroups.push(chunkGroup);
		if (name) {
			this.namedChunkGroups.set(name, chunkGroup);
		}
		return chunkGroup;
	}

	/**
	 * This method first looks to see if a name is provided for a new chunk,
	 * and first looks to see if any named chunks already exist and reuse that chunk instead.
	 *
	 * @param {string=} name optional chunk name to be provided
	 * @returns {Chunk} create a chunk (invoked during seal event)
	 */
	addChunk(name) {
		if (name) {
			const chunk = this.namedChunks.get(name);
			if (chunk !== undefined) {
				return chunk;
			}
		}
		const chunk = new Chunk(name);
		this.chunks.push(chunk);
		if (name) {
			this.namedChunks.set(name, chunk);
		}
		return chunk;
	}

	/**
	 * @param {Module} module module to assign depth
	 * @returns {void}
	 */
	assignDepth(module) {
		const queue = new Set([module]);
		let depth;

		module.depth = 0;

		/**
		 * @param {Module} module module for processeing
		 * @returns {void}
		 */
		const enqueueJob = module => {
			const d = module.depth;
			if (typeof d === "number" && d <= depth) return;
			queue.add(module);
			module.depth = depth;
		};

		/**
		 * @param {Dependency} dependency dependency to assign depth to
		 * @returns {void}
		 */
		const assignDepthToDependency = dependency => {
			if (dependency.module) {
				enqueueJob(dependency.module);
			}
		};

		/**
		 * @param {DependenciesBlock} block block to assign depth to
		 * @returns {void}
		 */
		const assignDepthToDependencyBlock = block => {
			if (block.variables) {
				iterationBlockVariable(block.variables, assignDepthToDependency);
			}

			if (block.dependencies) {
				iterationOfArrayCallback(block.dependencies, assignDepthToDependency);
			}

			if (block.blocks) {
				iterationOfArrayCallback(block.blocks, assignDepthToDependencyBlock);
			}
		};

		for (module of queue) {
			queue.delete(module);
			depth = module.depth;

			depth++;
			assignDepthToDependencyBlock(module);
		}
	}

	/**
	 * @param {Module} module the module containing the dependency
	 * @param {Dependency} dependency the dependency
	 * @returns {DependencyReference} a reference for the dependency
	 */
	getDependencyReference(module, dependency) {
		// TODO remove dep.getReference existence check in webpack 5
		if (typeof dependency.getReference !== "function") return null;
		const ref = dependency.getReference();
		if (!ref) return null;
		return this.hooks.dependencyReference.call(ref, dependency, module);
	}

	/**
	 *
	 * @param {Module} module module relationship for removal
	 * @param {DependenciesBlockLike} block //TODO: good description
	 * @returns {void}
	 */
	removeReasonsOfDependencyBlock(module, block) {
		const iteratorDependency = d => {
			if (!d.module) {
				return;
			}
			if (d.module.removeReason(module, d)) {
				for (const chunk of d.module.chunksIterable) {
					this.patchChunksAfterReasonRemoval(d.module, chunk);
				}
			}
		};

		if (block.blocks) {
			iterationOfArrayCallback(block.blocks, block =>
				this.removeReasonsOfDependencyBlock(module, block)
			);
		}

		if (block.dependencies) {
			iterationOfArrayCallback(block.dependencies, iteratorDependency);
		}

		if (block.variables) {
			iterationBlockVariable(block.variables, iteratorDependency);
		}
	}

	/**
	 * @param {Module} module module to patch tie
	 * @param {Chunk} chunk chunk to patch tie
	 * @returns {void}
	 */
	patchChunksAfterReasonRemoval(module, chunk) {
		if (!module.hasReasons()) {
			this.removeReasonsOfDependencyBlock(module, module);
		}
		if (!module.hasReasonForChunk(chunk)) {
			if (module.removeChunk(chunk)) {
				this.removeChunkFromDependencies(module, chunk);
			}
		}
	}

	/**
	 *
	 * @param {DependenciesBlock} block block tie for Chunk
	 * @param {Chunk} chunk chunk to remove from dep
	 * @returns {void}
	 */
	removeChunkFromDependencies(block, chunk) {
		const iteratorDependency = d => {
			if (!d.module) {
				return;
			}
			this.patchChunksAfterReasonRemoval(d.module, chunk);
		};

		const blocks = block.blocks;
		for (let indexBlock = 0; indexBlock < blocks.length; indexBlock++) {
			const asyncBlock = blocks[indexBlock];
			// Grab all chunks from the first Block's AsyncDepBlock
			const chunks = asyncBlock.chunkGroup.chunks;
			// For each chunk in chunkGroup
			for (let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
				const iteratedChunk = chunks[indexChunk];
				asyncBlock.chunkGroup.removeChunk(iteratedChunk);
				asyncBlock.chunkGroup.removeParent(iteratedChunk);
				// Recurse
				this.removeChunkFromDependencies(block, iteratedChunk);
			}
		}

		if (block.dependencies) {
			iterationOfArrayCallback(block.dependencies, iteratorDependency);
		}

		if (block.variables) {
			iterationBlockVariable(block.variables, iteratorDependency);
		}
	}

	applyModuleIds() {
		const unusedIds = [];
		let nextFreeModuleId = 0;
		const usedIds = new Set();
		if (this.usedModuleIds) {
			for (const id of this.usedModuleIds) {
				usedIds.add(id);
			}
		}

		const modules1 = this.modules;
		for (let indexModule1 = 0; indexModule1 < modules1.length; indexModule1++) {
			const module1 = modules1[indexModule1];
			if (module1.id !== null) {
				usedIds.add(module1.id);
			}
		}

		if (usedIds.size > 0) {
			let usedIdMax = -1;
			for (const usedIdKey of usedIds) {
				if (typeof usedIdKey !== "number") {
					continue;
				}

				usedIdMax = Math.max(usedIdMax, usedIdKey);
			}

			let lengthFreeModules = (nextFreeModuleId = usedIdMax + 1);

			while (lengthFreeModules--) {
				if (!usedIds.has(lengthFreeModules)) {
					unusedIds.push(lengthFreeModules);
				}
			}
		}

		const modules2 = this.modules;
		for (let indexModule2 = 0; indexModule2 < modules2.length; indexModule2++) {
			const module2 = modules2[indexModule2];
			if (module2.id === null) {
				if (unusedIds.length > 0) {
					module2.id = unusedIds.pop();
				} else {
					module2.id = nextFreeModuleId++;
				}
			}
		}
	}

	applyChunkIds() {
		/** @type {Set<number>} */
		const usedIds = new Set();

		// Get used ids from usedChunkIds property (i. e. from records)
		if (this.usedChunkIds) {
			for (const id of this.usedChunkIds) {
				if (typeof id !== "number") {
					continue;
				}

				usedIds.add(id);
			}
		}

		// Get used ids from existing chunks
		const chunks = this.chunks;
		for (let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			const chunk = chunks[indexChunk];
			const usedIdValue = chunk.id;

			if (typeof usedIdValue !== "number") {
				continue;
			}

			usedIds.add(usedIdValue);
		}

		// Calculate maximum assigned chunk id
		let nextFreeChunkId = -1;
		for (const id of usedIds) {
			nextFreeChunkId = Math.max(nextFreeChunkId, id);
		}
		nextFreeChunkId++;

		// Determine free chunk ids from 0 to maximum
		/** @type {number[]} */
		const unusedIds = [];
		if (nextFreeChunkId > 0) {
			let index = nextFreeChunkId;
			while (index--) {
				if (!usedIds.has(index)) {
					unusedIds.push(index);
				}
			}
		}

		// Assign ids to chunk which has no id
		for (let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			const chunk = chunks[indexChunk];
			if (chunk.id === null) {
				if (unusedIds.length > 0) {
					chunk.id = unusedIds.pop();
				} else {
					chunk.id = nextFreeChunkId++;
				}
			}
			if (!chunk.ids) {
				chunk.ids = [chunk.id];
			}
		}
	}

	sortItemsWithModuleIds() {
		this.modules.sort(byIdOrIdentifier);

		const modules = this.modules;
		for (let indexModule = 0; indexModule < modules.length; indexModule++) {
			modules[indexModule].sortItems(false);
		}

		const chunks = this.chunks;
		for (let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			chunks[indexChunk].sortItems();
		}

		chunks.sort((a, b) => a.compareTo(b));
	}

	sortItemsWithChunkIds() {
		for (const chunkGroup of this.chunkGroups) {
			chunkGroup.sortItems();
		}

		this.chunks.sort(byId);

		for (
			let indexModule = 0;
			indexModule < this.modules.length;
			indexModule++
		) {
			this.modules[indexModule].sortItems(true);
		}

		const chunks = this.chunks;
		for (let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			chunks[indexChunk].sortItems();
		}

		/**
		 * Used to sort errors and warnings in compilation. this.warnings, and
		 * this.errors contribute to the compilation hash and therefore should be
		 * updated whenever other references (having a chunk id) are sorted. This preserves the hash
		 * integrity
		 *
		 * @param {WebpackError} a first WebpackError instance (including subclasses)
		 * @param {WebpackError} b second WebpackError instance (including subclasses)
		 * @returns {-1|0|1} sort order index
		 */
		const byMessage = (a, b) => {
			const ma = `${a.message}`;
			const mb = `${b.message}`;
			if (ma < mb) return -1;
			if (mb < ma) return 1;
			return 0;
		};

		this.errors.sort(byMessage);
		this.warnings.sort(byMessage);
		this.children.sort(byNameOrHash);
	}

	summarizeDependencies() {
		this.fileDependencies = new SortableSet(this.compilationDependencies);
		this.contextDependencies = new SortableSet();
		this.missingDependencies = new SortableSet();

		for (
			let indexChildren = 0;
			indexChildren < this.children.length;
			indexChildren++
		) {
			const child = this.children[indexChildren];

			addAllToSet(this.fileDependencies, child.fileDependencies);
			addAllToSet(this.contextDependencies, child.contextDependencies);
			addAllToSet(this.missingDependencies, child.missingDependencies);
		}

		for (
			let indexModule = 0;
			indexModule < this.modules.length;
			indexModule++
		) {
			const module = this.modules[indexModule];

			if (module.buildInfo.fileDependencies) {
				addAllToSet(this.fileDependencies, module.buildInfo.fileDependencies);
			}
			if (module.buildInfo.contextDependencies) {
				addAllToSet(
					this.contextDependencies,
					module.buildInfo.contextDependencies
				);
			}
		}
		for (const error of this.errors) {
			if (
				typeof error.missing === "object" &&
				error.missing &&
				error.missing[Symbol.iterator]
			) {
				addAllToSet(this.missingDependencies, error.missing);
			}
		}
		this.fileDependencies.sort();
		this.contextDependencies.sort();
		this.missingDependencies.sort();
	}

	createHash() {
		const outputOptions = this.outputOptions;
		const hashFunction = outputOptions.hashFunction;
		const hashDigest = outputOptions.hashDigest;
		const hashDigestLength = outputOptions.hashDigestLength;
		const hash = createHash(hashFunction);
		if (outputOptions.hashSalt) {
			hash.update(outputOptions.hashSalt);
		}
		this.mainTemplate.updateHash(hash);
		this.chunkTemplate.updateHash(hash);
		for (const key of Object.keys(this.moduleTemplates).sort()) {
			this.moduleTemplates[key].updateHash(hash);
		}
		for (const child of this.children) {
			hash.update(child.hash);
		}
		for (const warning of this.warnings) {
			hash.update(`${warning.message}`);
		}
		for (const error of this.errors) {
			hash.update(`${error.message}`);
		}
		const modules = this.modules;
		for (let i = 0; i < modules.length; i++) {
			const module = modules[i];
			const moduleHash = createHash(hashFunction);
			module.updateHash(moduleHash);
			module.hash = /** @type {string} */ (moduleHash.digest(hashDigest));
			module.renderedHash = module.hash.substr(0, hashDigestLength);
		}
		// clone needed as sort below is inplace mutation
		const chunks = this.chunks.slice();
		/**
		 * sort here will bring all "falsy" values to the beginning
		 * this is needed as the "hasRuntime()" chunks are dependent on the
		 * hashes of the non-runtime chunks.
		 */
		chunks.sort((a, b) => {
			const aEntry = a.hasRuntime();
			const bEntry = b.hasRuntime();
			if (aEntry && !bEntry) return 1;
			if (!aEntry && bEntry) return -1;
			return byId(a, b);
		});
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			const chunkHash = createHash(hashFunction);
			try {
				if (outputOptions.hashSalt) {
					chunkHash.update(outputOptions.hashSalt);
				}
				chunk.updateHash(chunkHash);
				const template = chunk.hasRuntime()
					? this.mainTemplate
					: this.chunkTemplate;
				template.updateHashForChunk(
					chunkHash,
					chunk,
					this.moduleTemplates.javascript,
					this.dependencyTemplates
				);
				this.hooks.chunkHash.call(chunk, chunkHash);
				chunk.hash = /** @type {string} */ (chunkHash.digest(hashDigest));
				hash.update(chunk.hash);
				chunk.renderedHash = chunk.hash.substr(0, hashDigestLength);
				this.hooks.contentHash.call(chunk);
			} catch (err) {
				this.errors.push(new ChunkRenderError(chunk, "", err));
			}
		}
		this.fullHash = /** @type {string} */ (hash.digest(hashDigest));
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	/**
	 * @param {string} update extra information
	 * @returns {void}
	 */
	modifyHash(update) {
		const outputOptions = this.outputOptions;
		const hashFunction = outputOptions.hashFunction;
		const hashDigest = outputOptions.hashDigest;
		const hashDigestLength = outputOptions.hashDigestLength;
		const hash = createHash(hashFunction);
		hash.update(this.fullHash);
		hash.update(update);
		this.fullHash = /** @type {string} */ (hash.digest(hashDigest));
		this.hash = this.fullHash.substr(0, hashDigestLength);
	}

	/**
	 * @param {string} file file name
	 * @param {Source} source asset source
	 * @param {AssetInfo} assetInfo extra asset information
	 * @returns {void}
	 */
	emitAsset(file, source, assetInfo = {}) {
		if (this.assets[file]) {
			if (!isSourceEqual(this.assets[file], source)) {
				// TODO webpack 5: make this an error instead
				this.warnings.push(
					new WebpackError(
						`Conflict: Multiple assets emit different content to the same filename ${file}`
					)
				);
				this.assets[file] = source;
				this.assetsInfo.set(file, assetInfo);
				return;
			}
			const oldInfo = this.assetsInfo.get(file);
			this.assetsInfo.set(file, Object.assign({}, oldInfo, assetInfo));
			return;
		}
		this.assets[file] = source;
		this.assetsInfo.set(file, assetInfo);
	}

	/**
	 * @param {string} file file name
	 * @param {Source | function(Source): Source} newSourceOrFunction new asset source or function converting old to new
	 * @param {AssetInfo | function(AssetInfo | undefined): AssetInfo} assetInfoUpdateOrFunction new asset info or function converting old to new
	 */
	updateAsset(
		file,
		newSourceOrFunction,
		assetInfoUpdateOrFunction = undefined
	) {
		if (!this.assets[file]) {
			throw new Error(
				`Called Compilation.updateAsset for not existing filename ${file}`
			);
		}
		if (typeof newSourceOrFunction === "function") {
			this.assets[file] = newSourceOrFunction(this.assets[file]);
		} else {
			this.assets[file] = newSourceOrFunction;
		}
		if (assetInfoUpdateOrFunction !== undefined) {
			const oldInfo = this.assetsInfo.get(file);
			if (typeof assetInfoUpdateOrFunction === "function") {
				this.assetsInfo.set(file, assetInfoUpdateOrFunction(oldInfo || {}));
			} else {
				this.assetsInfo.set(
					file,
					Object.assign({}, oldInfo, assetInfoUpdateOrFunction)
				);
			}
		}
	}

	getAssets() {
		/** @type {Asset[]} */
		const array = [];
		for (const assetName of Object.keys(this.assets)) {
			if (Object.prototype.hasOwnProperty.call(this.assets, assetName)) {
				array.push({
					name: assetName,
					source: this.assets[assetName],
					info: this.assetsInfo.get(assetName) || {}
				});
			}
		}
		return array;
	}

	/**
	 * @param {string} name the name of the asset
	 * @returns {Asset | undefined} the asset or undefined when not found
	 */
	getAsset(name) {
		if (!Object.prototype.hasOwnProperty.call(this.assets, name))
			return undefined;
		return {
			name,
			source: this.assets[name],
			info: this.assetsInfo.get(name) || {}
		};
	}

	createModuleAssets() {
		for (let i = 0; i < this.modules.length; i++) {
			const module = this.modules[i];
			if (module.buildInfo.assets) {
				const assetsInfo = module.buildInfo.assetsInfo;
				for (const assetName of Object.keys(module.buildInfo.assets)) {
					const fileName = this.getPath(assetName);
					this.emitAsset(
						fileName,
						module.buildInfo.assets[assetName],
						assetsInfo ? assetsInfo.get(assetName) : undefined
					);
					this.hooks.moduleAsset.call(module, fileName);
				}
			}
		}
	}

	createChunkAssets() {
		const outputOptions = this.outputOptions;
		const cachedSourceMap = new Map();
		/** @type {Map<string, {hash: string, source: Source, chunk: Chunk}>} */
		const alreadyWrittenFiles = new Map();
		for (let i = 0; i < this.chunks.length; i++) {
			const chunk = this.chunks[i];
			chunk.files = [];
			let source;
			let file;
			let filenameTemplate;
			try {
				const template = chunk.hasRuntime()
					? this.mainTemplate
					: this.chunkTemplate;
				const manifest = template.getRenderManifest({
					chunk,
					hash: this.hash,
					fullHash: this.fullHash,
					outputOptions,
					moduleTemplates: this.moduleTemplates,
					dependencyTemplates: this.dependencyTemplates
				}); // [{ render(), filenameTemplate, pathOptions, identifier, hash }]
				for (const fileManifest of manifest) {
					const cacheName = fileManifest.identifier;
					const usedHash = fileManifest.hash;
					filenameTemplate = fileManifest.filenameTemplate;
					const pathAndInfo = this.getPathWithInfo(
						filenameTemplate,
						fileManifest.pathOptions
					);
					file = pathAndInfo.path;
					const assetInfo = pathAndInfo.info;

					// check if the same filename was already written by another chunk
					const alreadyWritten = alreadyWrittenFiles.get(file);
					if (alreadyWritten !== undefined) {
						if (alreadyWritten.hash === usedHash) {
							if (this.cache) {
								this.cache[cacheName] = {
									hash: usedHash,
									source: alreadyWritten.source
								};
							}
							chunk.files.push(file);
							this.hooks.chunkAsset.call(chunk, file);
							continue;
						} else {
							throw new Error(
								`Conflict: Multiple chunks emit assets to the same filename ${file}` +
									` (chunks ${alreadyWritten.chunk.id} and ${chunk.id})`
							);
						}
					}
					if (
						this.cache &&
						this.cache[cacheName] &&
						this.cache[cacheName].hash === usedHash
					) {
						source = this.cache[cacheName].source;
					} else {
						source = fileManifest.render();
						// Ensure that source is a cached source to avoid additional cost because of repeated access
						if (!(source instanceof CachedSource)) {
							const cacheEntry = cachedSourceMap.get(source);
							if (cacheEntry) {
								source = cacheEntry;
							} else {
								const cachedSource = new CachedSource(source);
								cachedSourceMap.set(source, cachedSource);
								source = cachedSource;
							}
						}
						if (this.cache) {
							this.cache[cacheName] = {
								hash: usedHash,
								source
							};
						}
					}
					this.emitAsset(file, source, assetInfo);
					chunk.files.push(file);
					this.hooks.chunkAsset.call(chunk, file);
					alreadyWrittenFiles.set(file, {
						hash: usedHash,
						source,
						chunk
					});
				}
			} catch (err) {
				this.errors.push(
					new ChunkRenderError(chunk, file || filenameTemplate, err)
				);
			}
		}
	}

	/**
	 * @param {string} filename used to get asset path with hash
	 * @param {TODO=} data // TODO: figure out this param type
	 * @returns {string} interpolated path
	 */
	getPath(filename, data) {
		data = data || {};
		data.hash = data.hash || this.hash;
		return this.mainTemplate.getAssetPath(filename, data);
	}

	/**
	 * @param {string} filename used to get asset path with hash
	 * @param {TODO=} data // TODO: figure out this param type
	 * @returns {{ path: string, info: AssetInfo }} interpolated path and asset info
	 */
	getPathWithInfo(filename, data) {
		data = data || {};
		data.hash = data.hash || this.hash;
		return this.mainTemplate.getAssetPathWithInfo(filename, data);
	}

	/**
	 * This function allows you to run another instance of webpack inside of webpack however as
	 * a child with different settings and configurations (if desired) applied. It copies all hooks, plugins
	 * from parent (or top level compiler) and creates a child Compilation
	 *
	 * @param {string} name name of the child compiler
	 * @param {TODO} outputOptions // Need to convert config schema to types for this
	 * @param {Plugin[]} plugins webpack plugins that will be applied
	 * @returns {Compiler} creates a child Compiler instance
	 */
	createChildCompiler(name, outputOptions, plugins) {
		const idx = this.childrenCounters[name] || 0;
		this.childrenCounters[name] = idx + 1;
		return this.compiler.createChildCompiler(
			this,
			name,
			idx,
			outputOptions,
			plugins
		);
	}

	checkConstraints() {
		/** @type {Set<number|string>} */
		const usedIds = new Set();

		const modules = this.modules;
		for (let indexModule = 0; indexModule < modules.length; indexModule++) {
			const moduleId = modules[indexModule].id;
			if (moduleId === null) continue;
			if (usedIds.has(moduleId)) {
				throw new Error(`checkConstraints: duplicate module id ${moduleId}`);
			}
			usedIds.add(moduleId);
		}

		const chunks = this.chunks;
		for (let indexChunk = 0; indexChunk < chunks.length; indexChunk++) {
			const chunk = chunks[indexChunk];
			if (chunks.indexOf(chunk) !== indexChunk) {
				throw new Error(
					`checkConstraints: duplicate chunk in compilation ${chunk.debugId}`
				);
			}
		}

		for (const chunkGroup of this.chunkGroups) {
			chunkGroup.checkConstraints();
		}
	}
}

// TODO remove in webpack 5
Compilation.prototype.applyPlugins = util.deprecate(
	/**
	 * @deprecated
	 * @param {string} name Name
	 * @param {any[]} args Other arguments
	 * @returns {void}
	 * @this {Compilation}
	 */
	function(name, ...args) {
		this.hooks[
			name.replace(/[- ]([a-z])/g, match => match[1].toUpperCase())
		].call(...args);
	},
	"Compilation.applyPlugins is deprecated. Use new API on `.hooks` instead"
);

// TODO remove in webpack 5
Object.defineProperty(Compilation.prototype, "moduleTemplate", {
	configurable: false,
	get: util.deprecate(
		/**
		 * @deprecated
		 * @this {Compilation}
		 * @returns {TODO} module template
		 */
		function() {
			return this.moduleTemplates.javascript;
		},
		"Compilation.moduleTemplate: Use Compilation.moduleTemplates.javascript instead"
	),
	set: util.deprecate(
		/**
		 * @deprecated
		 * @param {ModuleTemplate} value Template value
		 * @this {Compilation}
		 * @returns {void}
		 */
		function(value) {
			this.moduleTemplates.javascript = value;
		},
		"Compilation.moduleTemplate: Use Compilation.moduleTemplates.javascript instead."
	)
});

module.exports = Compilation;


/***/ }),

/***/ 9821:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const util = __webpack_require__(1669);
const compareLocations = __webpack_require__(2536);
const DependencyReference = __webpack_require__(9440);

/** @typedef {import("./Module")} Module */
/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./RuntimeTemplate")} RuntimeTemplate */

/**
 * @typedef {Object} DependencyTemplate
 * @property {function(Dependency, Source, RuntimeTemplate, Map<Function, DependencyTemplate>): void} apply
 */

/** @typedef {Object} SourcePosition
 *  @property {number} line
 *  @property {number=} column
 */

/** @typedef {Object} RealDependencyLocation
 *  @property {SourcePosition} start
 *  @property {SourcePosition=} end
 *  @property {number=} index
 */

/** @typedef {Object} SynteticDependencyLocation
 *  @property {string} name
 *  @property {number=} index
 */

/** @typedef {SynteticDependencyLocation|RealDependencyLocation} DependencyLocation */

class Dependency {
	constructor() {
		/** @type {Module|null} */
		this.module = null;
		// TODO remove in webpack 5
		/** @type {boolean} */
		this.weak = false;
		/** @type {boolean} */
		this.optional = false;
		/** @type {DependencyLocation} */
		this.loc = undefined;
	}

	getResourceIdentifier() {
		return null;
	}

	// Returns the referenced module and export
	getReference() {
		if (!this.module) return null;
		return new DependencyReference(this.module, true, this.weak);
	}

	// Returns the exported names
	getExports() {
		return null;
	}

	getWarnings() {
		return null;
	}

	getErrors() {
		return null;
	}

	updateHash(hash) {
		hash.update((this.module && this.module.id) + "");
	}

	disconnect() {
		this.module = null;
	}
}

// TODO remove in webpack 5
Dependency.compare = util.deprecate(
	(a, b) => compareLocations(a.loc, b.loc),
	"Dependency.compare is deprecated and will be removed in the next major version"
);

module.exports = Dependency;


/***/ }),

/***/ 1295:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __webpack_require__(1891);

class EntryModuleNotFoundError extends WebpackError {
	constructor(err) {
		super("Entry module not found: " + err);

		this.name = "EntryModuleNotFoundError";
		this.details = err.details;
		this.error = err;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = EntryModuleNotFoundError;


/***/ }),

/***/ 8865:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const ChunkGroup = __webpack_require__(583);

/** @typedef {import("./Chunk")} Chunk */

/**
 * Entrypoint serves as an encapsulation primitive for chunks that are
 * a part of a single ChunkGroup. They represent all bundles that need to be loaded for a
 * single instance of a page. Multi-page application architectures will typically yield multiple Entrypoint objects
 * inside of the compilation, whereas a Single Page App may only contain one with many lazy-loaded chunks.
 */
class Entrypoint extends ChunkGroup {
	/**
	 * Creates an instance of Entrypoint.
	 * @param {string} name the name of the entrypoint
	 */
	constructor(name) {
		super(name);
		/** @type {Chunk=} */
		this.runtimeChunk = undefined;
	}

	/**
	 * isInitial will always return true for Entrypoint ChunkGroup.
	 * @returns {true} returns true as all entrypoints are initial ChunkGroups
	 */
	isInitial() {
		return true;
	}

	/**
	 * Sets the runtimeChunk for an entrypoint.
	 * @param {Chunk} chunk the chunk being set as the runtime chunk.
	 * @returns {void}
	 */
	setRuntimeChunk(chunk) {
		this.runtimeChunk = chunk;
	}

	/**
	 * Fetches the chunk reference containing the webpack bootstrap code
	 * @returns {Chunk} returns the runtime chunk or first chunk in `this.chunks`
	 */
	getRuntimeChunk() {
		return this.runtimeChunk || this.chunks[0];
	}

	/**
	 * @param {Chunk} oldChunk chunk to be replaced
	 * @param {Chunk} newChunk New chunk that will be replaced with
	 * @returns {boolean} returns true if the replacement was successful
	 */
	replaceChunk(oldChunk, newChunk) {
		if (this.runtimeChunk === oldChunk) this.runtimeChunk = newChunk;
		return super.replaceChunk(oldChunk, newChunk);
	}
}

module.exports = Entrypoint;


/***/ }),

/***/ 6007:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const loaderFlag = "LOADER_EXECUTION";

const webpackOptionsFlag = "WEBPACK_OPTIONS";

exports.cutOffByFlag = (stack, flag) => {
	stack = stack.split("\n");
	for (let i = 0; i < stack.length; i++) {
		if (stack[i].includes(flag)) {
			stack.length = i;
		}
	}
	return stack.join("\n");
};

exports.cutOffLoaderExecution = stack =>
	exports.cutOffByFlag(stack, loaderFlag);

exports.cutOffWebpackOptions = stack =>
	exports.cutOffByFlag(stack, webpackOptionsFlag);

exports.cutOffMultilineMessage = (stack, message) => {
	stack = stack.split("\n");
	message = message.split("\n");

	return stack
		.reduce(
			(acc, line, idx) =>
				line.includes(message[idx]) ? acc : acc.concat(line),
			[]
		)
		.join("\n");
};

exports.cutOffMessage = (stack, message) => {
	const nextLine = stack.indexOf("\n");
	if (nextLine === -1) {
		return stack === message ? "" : stack;
	} else {
		const firstLine = stack.substr(0, nextLine);
		return firstLine === message ? stack.substr(nextLine + 1) : stack;
	}
};

exports.cleanUp = (stack, message) => {
	stack = exports.cutOffLoaderExecution(stack);
	stack = exports.cutOffMessage(stack, message);
	return stack;
};

exports.cleanUpWebpackOptions = (stack, message) => {
	stack = exports.cutOffWebpackOptions(stack);
	stack = exports.cutOffMultilineMessage(stack, message);
	return stack;
};


/***/ }),

/***/ 3445:
/***/ ((__unused_webpack_module, exports) => {

/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./ChunkGroup")} ChunkGroup */
/** @typedef {import("./Module")} Module */
/** @typedef {import("./DependenciesBlock")} DependenciesBlock */
/** @typedef {import("./AsyncDependenciesBlock")} AsyncDependenciesBlock */

/**
 * @param {ChunkGroup} chunkGroup the ChunkGroup to connect
 * @param {Chunk} chunk chunk to tie to ChunkGroup
 * @returns {void}
 */
const connectChunkGroupAndChunk = (chunkGroup, chunk) => {
	if (chunkGroup.pushChunk(chunk)) {
		chunk.addGroup(chunkGroup);
	}
};

/**
 * @param {ChunkGroup} parent parent ChunkGroup to connect
 * @param {ChunkGroup} child child ChunkGroup to connect
 * @returns {void}
 */
const connectChunkGroupParentAndChild = (parent, child) => {
	if (parent.addChild(child)) {
		child.addParent(parent);
	}
};

/**
 * @param {Chunk} chunk Chunk to connect to Module
 * @param {Module} module Module to connect to Chunk
 * @returns {void}
 */
const connectChunkAndModule = (chunk, module) => {
	if (module.addChunk(chunk)) {
		chunk.addModule(module);
	}
};

/**
 * @param {Chunk} chunk Chunk being disconnected
 * @param {Module} module Module being disconnected
 * @returns {void}
 */
const disconnectChunkAndModule = (chunk, module) => {
	chunk.removeModule(module);
	module.removeChunk(chunk);
};

/**
 * @param {AsyncDependenciesBlock} depBlock DepBlock being tied to ChunkGroup
 * @param {ChunkGroup} chunkGroup ChunkGroup being tied to DepBlock
 * @returns {void}
 */
const connectDependenciesBlockAndChunkGroup = (depBlock, chunkGroup) => {
	if (chunkGroup.addBlock(depBlock)) {
		depBlock.chunkGroup = chunkGroup;
	}
};

exports.connectChunkGroupAndChunk = connectChunkGroupAndChunk;
exports.connectChunkGroupParentAndChild = connectChunkGroupParentAndChild;
exports.connectChunkAndModule = connectChunkAndModule;
exports.disconnectChunkAndModule = disconnectChunkAndModule;
exports.connectDependenciesBlockAndChunkGroup = connectDependenciesBlockAndChunkGroup;


/***/ }),

/***/ 6346:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Chunk = __webpack_require__(4029);

class HotUpdateChunk extends Chunk {
	constructor() {
		super();
		/** @type {(string|number)[]} */
		this.removedModules = undefined;
	}
}

module.exports = HotUpdateChunk;


/***/ }),

/***/ 8008:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Template = __webpack_require__(3720);
const HotUpdateChunk = __webpack_require__(6346);
const { Tapable, SyncWaterfallHook, SyncHook } = __webpack_require__(1242);

module.exports = class HotUpdateChunkTemplate extends Tapable {
	constructor(outputOptions) {
		super();
		this.outputOptions = outputOptions || {};
		this.hooks = {
			modules: new SyncWaterfallHook([
				"source",
				"modules",
				"removedModules",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			render: new SyncWaterfallHook([
				"source",
				"modules",
				"removedModules",
				"hash",
				"id",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			hash: new SyncHook(["hash"])
		};
	}

	render(
		id,
		modules,
		removedModules,
		hash,
		moduleTemplate,
		dependencyTemplates
	) {
		const hotUpdateChunk = new HotUpdateChunk();
		hotUpdateChunk.id = id;
		hotUpdateChunk.setModules(modules);
		hotUpdateChunk.removedModules = removedModules;
		const modulesSource = Template.renderChunkModules(
			hotUpdateChunk,
			m => typeof m.source === "function",
			moduleTemplate,
			dependencyTemplates
		);
		const core = this.hooks.modules.call(
			modulesSource,
			modules,
			removedModules,
			moduleTemplate,
			dependencyTemplates
		);
		const source = this.hooks.render.call(
			core,
			modules,
			removedModules,
			hash,
			id,
			moduleTemplate,
			dependencyTemplates
		);
		return source;
	}

	updateHash(hash) {
		hash.update("HotUpdateChunkTemplate");
		hash.update("1");
		this.hooks.hash.call(hash);
	}
};


/***/ }),

/***/ 24:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const {
	ConcatSource,
	OriginalSource,
	PrefixSource,
	RawSource
} = __webpack_require__(3745);
const {
	Tapable,
	SyncWaterfallHook,
	SyncHook,
	SyncBailHook
} = __webpack_require__(1242);
const Template = __webpack_require__(3720);

/** @typedef {import("webpack-sources").ConcatSource} ConcatSource */
/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./ModuleTemplate")} ModuleTemplate */
/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./Module")} Module} */
/** @typedef {import("./util/createHash").Hash} Hash} */
/** @typedef {import("./Dependency").DependencyTemplate} DependencyTemplate} */

/**
 * @typedef {Object} RenderManifestOptions
 * @property {Chunk} chunk the chunk used to render
 * @property {string} hash
 * @property {string} fullHash
 * @property {TODO} outputOptions
 * @property {{javascript: ModuleTemplate, webassembly: ModuleTemplate}} moduleTemplates
 * @property {Map<TODO, TODO>} dependencyTemplates
 */

// require function shortcuts:
// __webpack_require__.s = the module id of the entry point
// __webpack_require__.c = the module cache
// __webpack_require__.m = the module functions
// __webpack_require__.p = the bundle public path
// __webpack_require__.i = the identity function used for harmony imports
// __webpack_require__.e = the chunk ensure function
// __webpack_require__.d = the exported property define getter function
// __webpack_require__.o = Object.prototype.hasOwnProperty.call
// __webpack_require__.r = define compatibility on export
// __webpack_require__.t = create a fake namespace object
// __webpack_require__.n = compatibility get default export
// __webpack_require__.h = the webpack hash
// __webpack_require__.w = an object containing all installed WebAssembly.Instance export objects keyed by module id
// __webpack_require__.oe = the uncaught error handler for the webpack runtime
// __webpack_require__.nc = the script nonce

module.exports = class MainTemplate extends Tapable {
	/**
	 *
	 * @param {TODO=} outputOptions output options for the MainTemplate
	 */
	constructor(outputOptions) {
		super();
		/** @type {TODO?} */
		this.outputOptions = outputOptions || {};
		this.hooks = {
			/** @type {SyncWaterfallHook<TODO[], RenderManifestOptions>} */
			renderManifest: new SyncWaterfallHook(["result", "options"]),
			modules: new SyncWaterfallHook([
				"modules",
				"chunk",
				"hash",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			moduleObj: new SyncWaterfallHook([
				"source",
				"chunk",
				"hash",
				"moduleIdExpression"
			]),
			requireEnsure: new SyncWaterfallHook([
				"source",
				"chunk",
				"hash",
				"chunkIdExpression"
			]),
			bootstrap: new SyncWaterfallHook([
				"source",
				"chunk",
				"hash",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			localVars: new SyncWaterfallHook(["source", "chunk", "hash"]),
			require: new SyncWaterfallHook(["source", "chunk", "hash"]),
			requireExtensions: new SyncWaterfallHook(["source", "chunk", "hash"]),
			/** @type {SyncWaterfallHook<string, Chunk, string>} */
			beforeStartup: new SyncWaterfallHook(["source", "chunk", "hash"]),
			/** @type {SyncWaterfallHook<string, Chunk, string>} */
			startup: new SyncWaterfallHook(["source", "chunk", "hash"]),
			/** @type {SyncWaterfallHook<string, Chunk, string>} */
			afterStartup: new SyncWaterfallHook(["source", "chunk", "hash"]),
			render: new SyncWaterfallHook([
				"source",
				"chunk",
				"hash",
				"moduleTemplate",
				"dependencyTemplates"
			]),
			renderWithEntry: new SyncWaterfallHook(["source", "chunk", "hash"]),
			moduleRequire: new SyncWaterfallHook([
				"source",
				"chunk",
				"hash",
				"moduleIdExpression"
			]),
			addModule: new SyncWaterfallHook([
				"source",
				"chunk",
				"hash",
				"moduleIdExpression",
				"moduleExpression"
			]),
			currentHash: new SyncWaterfallHook(["source", "requestedLength"]),
			assetPath: new SyncWaterfallHook(["path", "options", "assetInfo"]),
			hash: new SyncHook(["hash"]),
			hashForChunk: new SyncHook(["hash", "chunk"]),
			globalHashPaths: new SyncWaterfallHook(["paths"]),
			globalHash: new SyncBailHook(["chunk", "paths"]),

			// TODO this should be moved somewhere else
			// It's weird here
			hotBootstrap: new SyncWaterfallHook(["source", "chunk", "hash"])
		};
		this.hooks.startup.tap("MainTemplate", (source, chunk, hash) => {
			/** @type {string[]} */
			const buf = [];
			if (chunk.entryModule) {
				buf.push("// Load entry module and return exports");
				buf.push(
					`return ${this.renderRequireFunctionForModule(
						hash,
						chunk,
						JSON.stringify(chunk.entryModule.id)
					)}(${this.requireFn}.s = ${JSON.stringify(chunk.entryModule.id)});`
				);
			}
			return Template.asString(buf);
		});
		this.hooks.render.tap(
			"MainTemplate",
			(bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) => {
				const source = new ConcatSource();
				source.add("/******/ (function(modules) { // webpackBootstrap\n");
				source.add(new PrefixSource("/******/", bootstrapSource));
				source.add("/******/ })\n");
				source.add(
					"/************************************************************************/\n"
				);
				source.add("/******/ (");
				source.add(
					this.hooks.modules.call(
						new RawSource(""),
						chunk,
						hash,
						moduleTemplate,
						dependencyTemplates
					)
				);
				source.add(")");
				return source;
			}
		);
		this.hooks.localVars.tap("MainTemplate", (source, chunk, hash) => {
			return Template.asString([
				source,
				"// The module cache",
				"var installedModules = {};"
			]);
		});
		this.hooks.require.tap("MainTemplate", (source, chunk, hash) => {
			return Template.asString([
				source,
				"// Check if module is in cache",
				"if(installedModules[moduleId]) {",
				Template.indent("return installedModules[moduleId].exports;"),
				"}",
				"// Create a new module (and put it into the cache)",
				"var module = installedModules[moduleId] = {",
				Template.indent(this.hooks.moduleObj.call("", chunk, hash, "moduleId")),
				"};",
				"",
				Template.asString(
					outputOptions.strictModuleExceptionHandling
						? [
								"// Execute the module function",
								"var threw = true;",
								"try {",
								Template.indent([
									`modules[moduleId].call(module.exports, module, module.exports, ${this.renderRequireFunctionForModule(
										hash,
										chunk,
										"moduleId"
									)});`,
									"threw = false;"
								]),
								"} finally {",
								Template.indent([
									"if(threw) delete installedModules[moduleId];"
								]),
								"}"
						  ]
						: [
								"// Execute the module function",
								`modules[moduleId].call(module.exports, module, module.exports, ${this.renderRequireFunctionForModule(
									hash,
									chunk,
									"moduleId"
								)});`
						  ]
				),
				"",
				"// Flag the module as loaded",
				"module.l = true;",
				"",
				"// Return the exports of the module",
				"return module.exports;"
			]);
		});
		this.hooks.moduleObj.tap(
			"MainTemplate",
			(source, chunk, hash, varModuleId) => {
				return Template.asString(["i: moduleId,", "l: false,", "exports: {}"]);
			}
		);
		this.hooks.requireExtensions.tap("MainTemplate", (source, chunk, hash) => {
			const buf = [];
			const chunkMaps = chunk.getChunkMaps();
			// Check if there are non initial chunks which need to be imported using require-ensure
			if (Object.keys(chunkMaps.hash).length) {
				buf.push("// This file contains only the entry chunk.");
				buf.push("// The chunk loading function for additional chunks");
				buf.push(`${this.requireFn}.e = function requireEnsure(chunkId) {`);
				buf.push(Template.indent("var promises = [];"));
				buf.push(
					Template.indent(
						this.hooks.requireEnsure.call("", chunk, hash, "chunkId")
					)
				);
				buf.push(Template.indent("return Promise.all(promises);"));
				buf.push("};");
			} else if (
				chunk.hasModuleInGraph(m =>
					m.blocks.some(b => b.chunkGroup && b.chunkGroup.chunks.length > 0)
				)
			) {
				// There async blocks in the graph, so we need to add an empty requireEnsure
				// function anyway. This can happen with multiple entrypoints.
				buf.push("// The chunk loading function for additional chunks");
				buf.push("// Since all referenced chunks are already included");
				buf.push("// in this file, this function is empty here.");
				buf.push(`${this.requireFn}.e = function requireEnsure() {`);
				buf.push(Template.indent("return Promise.resolve();"));
				buf.push("};");
			}
			buf.push("");
			buf.push("// expose the modules object (__webpack_modules__)");
			buf.push(`${this.requireFn}.m = modules;`);

			buf.push("");
			buf.push("// expose the module cache");
			buf.push(`${this.requireFn}.c = installedModules;`);

			buf.push("");
			buf.push("// define getter function for harmony exports");
			buf.push(`${this.requireFn}.d = function(exports, name, getter) {`);
			buf.push(
				Template.indent([
					`if(!${this.requireFn}.o(exports, name)) {`,
					Template.indent([
						"Object.defineProperty(exports, name, { enumerable: true, get: getter });"
					]),
					"}"
				])
			);
			buf.push("};");

			buf.push("");
			buf.push("// define __esModule on exports");
			buf.push(`${this.requireFn}.r = function(exports) {`);
			buf.push(
				Template.indent([
					"if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {",
					Template.indent([
						"Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });"
					]),
					"}",
					"Object.defineProperty(exports, '__esModule', { value: true });"
				])
			);
			buf.push("};");

			buf.push("");
			buf.push("// create a fake namespace object");
			buf.push("// mode & 1: value is a module id, require it");
			buf.push("// mode & 2: merge all properties of value into the ns");
			buf.push("// mode & 4: return value when already ns object");
			buf.push("// mode & 8|1: behave like require");
			buf.push(`${this.requireFn}.t = function(value, mode) {`);
			buf.push(
				Template.indent([
					`if(mode & 1) value = ${this.requireFn}(value);`,
					`if(mode & 8) return value;`,
					"if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;",
					"var ns = Object.create(null);",
					`${this.requireFn}.r(ns);`,
					"Object.defineProperty(ns, 'default', { enumerable: true, value: value });",
					"if(mode & 2 && typeof value != 'string') for(var key in value) " +
						`${this.requireFn}.d(ns, key, function(key) { ` +
						"return value[key]; " +
						"}.bind(null, key));",
					"return ns;"
				])
			);
			buf.push("};");

			buf.push("");
			buf.push(
				"// getDefaultExport function for compatibility with non-harmony modules"
			);
			buf.push(this.requireFn + ".n = function(module) {");
			buf.push(
				Template.indent([
					"var getter = module && module.__esModule ?",
					Template.indent([
						"function getDefault() { return module['default']; } :",
						"function getModuleExports() { return module; };"
					]),
					`${this.requireFn}.d(getter, 'a', getter);`,
					"return getter;"
				])
			);
			buf.push("};");

			buf.push("");
			buf.push("// Object.prototype.hasOwnProperty.call");
			buf.push(
				`${this.requireFn}.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };`
			);

			const publicPath = this.getPublicPath({
				hash: hash
			});
			buf.push("");
			buf.push("// __webpack_public_path__");
			buf.push(`${this.requireFn}.p = ${JSON.stringify(publicPath)};`);
			return Template.asString(buf);
		});

		this.requireFn = "__webpack_require__";
	}

	/**
	 *
	 * @param {RenderManifestOptions} options render manifest options
	 * @returns {TODO[]} returns render manifest
	 */
	getRenderManifest(options) {
		const result = [];

		this.hooks.renderManifest.call(result, options);

		return result;
	}

	/**
	 * TODO webpack 5: remove moduleTemplate and dependencyTemplates
	 * @param {string} hash hash to be used for render call
	 * @param {Chunk} chunk Chunk instance
	 * @param {ModuleTemplate} moduleTemplate ModuleTemplate instance for render
	 * @param {Map<Function, DependencyTemplate>} dependencyTemplates dependency templates
	 * @returns {string[]} the generated source of the bootstrap code
	 */
	renderBootstrap(hash, chunk, moduleTemplate, dependencyTemplates) {
		const buf = [];
		buf.push(
			this.hooks.bootstrap.call(
				"",
				chunk,
				hash,
				moduleTemplate,
				dependencyTemplates
			)
		);
		buf.push(this.hooks.localVars.call("", chunk, hash));
		buf.push("");
		buf.push("// The require function");
		buf.push(`function ${this.requireFn}(moduleId) {`);
		buf.push(Template.indent(this.hooks.require.call("", chunk, hash)));
		buf.push("}");
		buf.push("");
		buf.push(
			Template.asString(this.hooks.requireExtensions.call("", chunk, hash))
		);
		buf.push("");
		buf.push(Template.asString(this.hooks.beforeStartup.call("", chunk, hash)));
		const afterStartupCode = Template.asString(
			this.hooks.afterStartup.call("", chunk, hash)
		);
		if (afterStartupCode) {
			// TODO webpack 5: this is a bit hacky to avoid a breaking change
			// change it to a better way
			buf.push("var startupResult = (function() {");
		}
		buf.push(Template.asString(this.hooks.startup.call("", chunk, hash)));
		if (afterStartupCode) {
			buf.push("})();");
			buf.push(afterStartupCode);
			buf.push("return startupResult;");
		}
		return buf;
	}

	/**
	 * @param {string} hash hash to be used for render call
	 * @param {Chunk} chunk Chunk instance
	 * @param {ModuleTemplate} moduleTemplate ModuleTemplate instance for render
	 * @param {Map<Function, DependencyTemplate>} dependencyTemplates dependency templates
	 * @returns {ConcatSource} the newly generated source from rendering
	 */
	render(hash, chunk, moduleTemplate, dependencyTemplates) {
		const buf = this.renderBootstrap(
			hash,
			chunk,
			moduleTemplate,
			dependencyTemplates
		);
		let source = this.hooks.render.call(
			new OriginalSource(
				Template.prefix(buf, " \t") + "\n",
				"webpack/bootstrap"
			),
			chunk,
			hash,
			moduleTemplate,
			dependencyTemplates
		);
		if (chunk.hasEntryModule()) {
			source = this.hooks.renderWithEntry.call(source, chunk, hash);
		}
		if (!source) {
			throw new Error(
				"Compiler error: MainTemplate plugin 'render' should return something"
			);
		}
		chunk.rendered = true;
		return new ConcatSource(source, ";");
	}

	/**
	 *
	 * @param {string} hash hash for render fn
	 * @param {Chunk} chunk Chunk instance for require
	 * @param {(number|string)=} varModuleId module id
	 * @returns {TODO} the moduleRequire hook call return signature
	 */
	renderRequireFunctionForModule(hash, chunk, varModuleId) {
		return this.hooks.moduleRequire.call(
			this.requireFn,
			chunk,
			hash,
			varModuleId
		);
	}

	/**
	 *
	 * @param {string} hash hash for render add fn
	 * @param {Chunk} chunk Chunk instance for require add fn
	 * @param {(string|number)=} varModuleId module id
	 * @param {Module} varModule Module instance
	 * @returns {TODO} renderAddModule call
	 */
	renderAddModule(hash, chunk, varModuleId, varModule) {
		return this.hooks.addModule.call(
			`modules[${varModuleId}] = ${varModule};`,
			chunk,
			hash,
			varModuleId,
			varModule
		);
	}

	/**
	 *
	 * @param {string} hash string hash
	 * @param {number=} length length
	 * @returns {string} call hook return
	 */
	renderCurrentHashCode(hash, length) {
		length = length || Infinity;
		return this.hooks.currentHash.call(
			JSON.stringify(hash.substr(0, length)),
			length
		);
	}

	/**
	 *
	 * @param {object} options get public path options
	 * @returns {string} hook call
	 */
	getPublicPath(options) {
		return this.hooks.assetPath.call(
			this.outputOptions.publicPath || "",
			options
		);
	}

	getAssetPath(path, options) {
		return this.hooks.assetPath.call(path, options);
	}

	getAssetPathWithInfo(path, options) {
		const assetInfo = {};
		// TODO webpack 5: refactor assetPath hook to receive { path, info } object
		const newPath = this.hooks.assetPath.call(path, options, assetInfo);
		return { path: newPath, info: assetInfo };
	}

	/**
	 * Updates hash with information from this template
	 * @param {Hash} hash the hash to update
	 * @returns {void}
	 */
	updateHash(hash) {
		hash.update("maintemplate");
		hash.update("3");
		this.hooks.hash.call(hash);
	}

	/**
	 * TODO webpack 5: remove moduleTemplate and dependencyTemplates
	 * Updates hash with chunk-specific information from this template
	 * @param {Hash} hash the hash to update
	 * @param {Chunk} chunk the chunk
	 * @param {ModuleTemplate} moduleTemplate ModuleTemplate instance for render
	 * @param {Map<Function, DependencyTemplate>} dependencyTemplates dependency templates
	 * @returns {void}
	 */
	updateHashForChunk(hash, chunk, moduleTemplate, dependencyTemplates) {
		this.updateHash(hash);
		this.hooks.hashForChunk.call(hash, chunk);
		for (const line of this.renderBootstrap(
			"0000",
			chunk,
			moduleTemplate,
			dependencyTemplates
		)) {
			hash.update(line);
		}
	}

	useChunkHash(chunk) {
		const paths = this.hooks.globalHashPaths.call([]);
		return !this.hooks.globalHash.call(chunk, paths);
	}
};


/***/ }),

/***/ 2337:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __webpack_require__(1891);

/** @typedef {import("./Module")} Module */

class ModuleDependencyError extends WebpackError {
	/**
	 * Creates an instance of ModuleDependencyError.
	 * @param {Module} module module tied to dependency
	 * @param {Error} err error thrown
	 * @param {TODO} loc location of dependency
	 */
	constructor(module, err, loc) {
		super(err.message);

		this.name = "ModuleDependencyError";
		this.details = err.stack
			.split("\n")
			.slice(1)
			.join("\n");
		this.module = module;
		this.loc = loc;
		this.error = err;
		this.origin = module.issuer;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ModuleDependencyError;


/***/ }),

/***/ 8533:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __webpack_require__(1891);

module.exports = class ModuleDependencyWarning extends WebpackError {
	constructor(module, err, loc) {
		super(err.message);

		this.name = "ModuleDependencyWarning";
		this.details = err.stack
			.split("\n")
			.slice(1)
			.join("\n");
		this.module = module;
		this.loc = loc;
		this.error = err;
		this.origin = module.issuer;

		Error.captureStackTrace(this, this.constructor);
	}
};


/***/ }),

/***/ 8927:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __webpack_require__(1891);

class ModuleNotFoundError extends WebpackError {
	constructor(module, err) {
		super("Module not found: " + err);

		this.name = "ModuleNotFoundError";
		this.details = err.details;
		this.missing = err.missing;
		this.module = module;
		this.error = err;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ModuleNotFoundError;


/***/ }),

/***/ 3732:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const { Tapable, SyncWaterfallHook, SyncHook } = __webpack_require__(1242);

/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./Module")} Module */

module.exports = class ModuleTemplate extends Tapable {
	constructor(runtimeTemplate, type) {
		super();
		this.runtimeTemplate = runtimeTemplate;
		this.type = type;
		this.hooks = {
			content: new SyncWaterfallHook([
				"source",
				"module",
				"options",
				"dependencyTemplates"
			]),
			module: new SyncWaterfallHook([
				"source",
				"module",
				"options",
				"dependencyTemplates"
			]),
			render: new SyncWaterfallHook([
				"source",
				"module",
				"options",
				"dependencyTemplates"
			]),
			package: new SyncWaterfallHook([
				"source",
				"module",
				"options",
				"dependencyTemplates"
			]),
			hash: new SyncHook(["hash"])
		};
	}

	/**
	 * @param {Module} module the module
	 * @param {TODO} dependencyTemplates templates for dependencies
	 * @param {TODO} options render options
	 * @returns {Source} the source
	 */
	render(module, dependencyTemplates, options) {
		try {
			const moduleSource = module.source(
				dependencyTemplates,
				this.runtimeTemplate,
				this.type
			);
			const moduleSourcePostContent = this.hooks.content.call(
				moduleSource,
				module,
				options,
				dependencyTemplates
			);
			const moduleSourcePostModule = this.hooks.module.call(
				moduleSourcePostContent,
				module,
				options,
				dependencyTemplates
			);
			const moduleSourcePostRender = this.hooks.render.call(
				moduleSourcePostModule,
				module,
				options,
				dependencyTemplates
			);
			return this.hooks.package.call(
				moduleSourcePostRender,
				module,
				options,
				dependencyTemplates
			);
		} catch (e) {
			e.message = `${module.identifier()}\n${e.message}`;
			throw e;
		}
	}

	updateHash(hash) {
		hash.update("1");
		this.hooks.hash.call(hash);
	}
};


/***/ }),

/***/ 2372:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const path = __webpack_require__(5622);
const NORMALIZE_SLASH_DIRECTION_REGEXP = /\\/g;
const PATH_CHARS_REGEXP = /[-[\]{}()*+?.,\\^$|#\s]/g;
const SEPARATOR_REGEXP = /[/\\]$/;
const FRONT_OR_BACK_BANG_REGEXP = /^!|!$/g;
const INDEX_JS_REGEXP = /\/index.js(!|\?|\(query\))/g;
const MATCH_RESOURCE_REGEXP = /!=!/;

const normalizeBackSlashDirection = request => {
	return request.replace(NORMALIZE_SLASH_DIRECTION_REGEXP, "/");
};

const createRegExpForPath = path => {
	const regexpTypePartial = path.replace(PATH_CHARS_REGEXP, "\\$&");
	return new RegExp(`(^|!)${regexpTypePartial}`, "g");
};

class RequestShortener {
	constructor(directory) {
		directory = normalizeBackSlashDirection(directory);
		if (SEPARATOR_REGEXP.test(directory)) {
			directory = directory.substr(0, directory.length - 1);
		}

		if (directory) {
			this.currentDirectoryRegExp = createRegExpForPath(directory);
		}

		const dirname = path.dirname(directory);
		const endsWithSeparator = SEPARATOR_REGEXP.test(dirname);
		const parentDirectory = endsWithSeparator
			? dirname.substr(0, dirname.length - 1)
			: dirname;
		if (parentDirectory && parentDirectory !== directory) {
			this.parentDirectoryRegExp = createRegExpForPath(`${parentDirectory}/`);
		}

		if (__dirname.length >= 2) {
			const buildins = normalizeBackSlashDirection(path.join(__dirname, ".."));
			const buildinsAsModule =
				this.currentDirectoryRegExp &&
				this.currentDirectoryRegExp.test(buildins);
			this.buildinsAsModule = buildinsAsModule;
			this.buildinsRegExp = createRegExpForPath(buildins);
		}

		this.cache = new Map();
	}

	shorten(request) {
		if (!request) return request;
		const cacheEntry = this.cache.get(request);
		if (cacheEntry !== undefined) {
			return cacheEntry;
		}
		let result = normalizeBackSlashDirection(request);
		if (this.buildinsAsModule && this.buildinsRegExp) {
			result = result.replace(this.buildinsRegExp, "!(webpack)");
		}
		if (this.currentDirectoryRegExp) {
			result = result.replace(this.currentDirectoryRegExp, "!.");
		}
		if (this.parentDirectoryRegExp) {
			result = result.replace(this.parentDirectoryRegExp, "!../");
		}
		if (!this.buildinsAsModule && this.buildinsRegExp) {
			result = result.replace(this.buildinsRegExp, "!(webpack)");
		}
		result = result.replace(INDEX_JS_REGEXP, "$1");
		result = result.replace(FRONT_OR_BACK_BANG_REGEXP, "");
		result = result.replace(MATCH_RESOURCE_REGEXP, " = ");
		this.cache.set(request, result);
		return result;
	}
}

module.exports = RequestShortener;


/***/ }),

/***/ 9753:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Template = __webpack_require__(3720);

/** @typedef {import("./Module")} Module */

module.exports = class RuntimeTemplate {
	constructor(outputOptions, requestShortener) {
		this.outputOptions = outputOptions || {};
		this.requestShortener = requestShortener;
	}

	/**
	 * Add a comment
	 * @param {object} options Information content of the comment
	 * @param {string=} options.request request string used originally
	 * @param {string=} options.chunkName name of the chunk referenced
	 * @param {string=} options.chunkReason reason information of the chunk
	 * @param {string=} options.message additional message
	 * @param {string=} options.exportName name of the export
	 * @returns {string} comment
	 */
	comment({ request, chunkName, chunkReason, message, exportName }) {
		let content;
		if (this.outputOptions.pathinfo) {
			content = [message, request, chunkName, chunkReason]
				.filter(Boolean)
				.map(item => this.requestShortener.shorten(item))
				.join(" | ");
		} else {
			content = [message, chunkName, chunkReason]
				.filter(Boolean)
				.map(item => this.requestShortener.shorten(item))
				.join(" | ");
		}
		if (!content) return "";
		if (this.outputOptions.pathinfo) {
			return Template.toComment(content) + " ";
		} else {
			return Template.toNormalComment(content) + " ";
		}
	}

	throwMissingModuleErrorFunction({ request }) {
		const err = `Cannot find module '${request}'`;
		return `function webpackMissingModule() { var e = new Error(${JSON.stringify(
			err
		)}); e.code = 'MODULE_NOT_FOUND'; throw e; }`;
	}

	missingModule({ request }) {
		return `!(${this.throwMissingModuleErrorFunction({ request })}())`;
	}

	missingModuleStatement({ request }) {
		return `${this.missingModule({ request })};\n`;
	}

	missingModulePromise({ request }) {
		return `Promise.resolve().then(${this.throwMissingModuleErrorFunction({
			request
		})})`;
	}

	moduleId({ module, request }) {
		if (!module) {
			return this.missingModule({
				request
			});
		}
		if (module.id === null) {
			throw new Error(
				`RuntimeTemplate.moduleId(): Module ${module.identifier()} has no id. This should not happen.`
			);
		}
		return `${this.comment({ request })}${JSON.stringify(module.id)}`;
	}

	moduleRaw({ module, request }) {
		if (!module) {
			return this.missingModule({
				request
			});
		}
		return `__webpack_require__(${this.moduleId({ module, request })})`;
	}

	moduleExports({ module, request }) {
		return this.moduleRaw({
			module,
			request
		});
	}

	moduleNamespace({ module, request, strict }) {
		if (!module) {
			return this.missingModule({
				request
			});
		}
		const moduleId = this.moduleId({
			module,
			request
		});
		const exportsType = module.buildMeta && module.buildMeta.exportsType;
		if (exportsType === "namespace") {
			const rawModule = this.moduleRaw({
				module,
				request
			});
			return rawModule;
		} else if (exportsType === "named") {
			return `__webpack_require__.t(${moduleId}, 3)`;
		} else if (strict) {
			return `__webpack_require__.t(${moduleId}, 1)`;
		} else {
			return `__webpack_require__.t(${moduleId}, 7)`;
		}
	}

	moduleNamespacePromise({ block, module, request, message, strict, weak }) {
		if (!module) {
			return this.missingModulePromise({
				request
			});
		}
		if (module.id === null) {
			throw new Error(
				`RuntimeTemplate.moduleNamespacePromise(): Module ${module.identifier()} has no id. This should not happen.`
			);
		}
		const promise = this.blockPromise({
			block,
			message
		});

		let getModuleFunction;
		let idExpr = JSON.stringify(module.id);
		const comment = this.comment({
			request
		});
		let header = "";
		if (weak) {
			if (idExpr.length > 8) {
				// 'var x="nnnnnn";x,"+x+",x' vs '"nnnnnn",nnnnnn,"nnnnnn"'
				header += `var id = ${idExpr}; `;
				idExpr = "id";
			}
			header += `if(!__webpack_require__.m[${idExpr}]) { var e = new Error("Module '" + ${idExpr} + "' is not available (weak dependency)"); e.code = 'MODULE_NOT_FOUND'; throw e; } `;
		}
		const moduleId = this.moduleId({
			module,
			request
		});
		const exportsType = module.buildMeta && module.buildMeta.exportsType;
		if (exportsType === "namespace") {
			if (header) {
				const rawModule = this.moduleRaw({
					module,
					request
				});
				getModuleFunction = `function() { ${header}return ${rawModule}; }`;
			} else {
				getModuleFunction = `__webpack_require__.bind(null, ${comment}${idExpr})`;
			}
		} else if (exportsType === "named") {
			if (header) {
				getModuleFunction = `function() { ${header}return __webpack_require__.t(${moduleId}, 3); }`;
			} else {
				getModuleFunction = `__webpack_require__.t.bind(null, ${comment}${idExpr}, 3)`;
			}
		} else if (strict) {
			if (header) {
				getModuleFunction = `function() { ${header}return __webpack_require__.t(${moduleId}, 1); }`;
			} else {
				getModuleFunction = `__webpack_require__.t.bind(null, ${comment}${idExpr}, 1)`;
			}
		} else {
			if (header) {
				getModuleFunction = `function() { ${header}return __webpack_require__.t(${moduleId}, 7); }`;
			} else {
				getModuleFunction = `__webpack_require__.t.bind(null, ${comment}${idExpr}, 7)`;
			}
		}

		return `${promise || "Promise.resolve()"}.then(${getModuleFunction})`;
	}

	/**
	 *
	 * @param {Object} options options object
	 * @param {boolean=} options.update whether a new variable should be created or the existing one updated
	 * @param {Module} options.module the module
	 * @param {string} options.request the request that should be printed as comment
	 * @param {string} options.importVar name of the import variable
	 * @param {Module} options.originModule module in which the statement is emitted
	 * @returns {string} the import statement
	 */
	importStatement({ update, module, request, importVar, originModule }) {
		if (!module) {
			return this.missingModuleStatement({
				request
			});
		}
		const moduleId = this.moduleId({
			module,
			request
		});
		const optDeclaration = update ? "" : "var ";

		const exportsType = module.buildMeta && module.buildMeta.exportsType;
		let content = `/* harmony import */ ${optDeclaration}${importVar} = __webpack_require__(${moduleId});\n`;

		if (!exportsType && !originModule.buildMeta.strictHarmonyModule) {
			content += `/* harmony import */ ${optDeclaration}${importVar}_default = /*#__PURE__*/__webpack_require__.n(${importVar});\n`;
		}
		if (exportsType === "named") {
			if (Array.isArray(module.buildMeta.providedExports)) {
				content += `${optDeclaration}${importVar}_namespace = /*#__PURE__*/__webpack_require__.t(${moduleId}, 1);\n`;
			} else {
				content += `${optDeclaration}${importVar}_namespace = /*#__PURE__*/__webpack_require__.t(${moduleId});\n`;
			}
		}
		return content;
	}

	exportFromImport({
		module,
		request,
		exportName,
		originModule,
		asiSafe,
		isCall,
		callContext,
		importVar
	}) {
		if (!module) {
			return this.missingModule({
				request
			});
		}
		const exportsType = module.buildMeta && module.buildMeta.exportsType;

		if (!exportsType) {
			if (exportName === "default") {
				if (!originModule.buildMeta.strictHarmonyModule) {
					if (isCall) {
						return `${importVar}_default()`;
					} else if (asiSafe) {
						return `(${importVar}_default())`;
					} else {
						return `${importVar}_default.a`;
					}
				} else {
					return importVar;
				}
			} else if (originModule.buildMeta.strictHarmonyModule) {
				if (exportName) {
					return "/* non-default import from non-esm module */undefined";
				} else {
					return `/*#__PURE__*/__webpack_require__.t(${importVar})`;
				}
			}
		}

		if (exportsType === "named") {
			if (exportName === "default") {
				return importVar;
			} else if (!exportName) {
				return `${importVar}_namespace`;
			}
		}

		if (exportName) {
			const used = module.isUsed(exportName);
			if (!used) {
				const comment = Template.toNormalComment(`unused export ${exportName}`);
				return `${comment} undefined`;
			}
			const comment =
				used !== exportName ? Template.toNormalComment(exportName) + " " : "";
			const access = `${importVar}[${comment}${JSON.stringify(used)}]`;
			if (isCall) {
				if (callContext === false && asiSafe) {
					return `(0,${access})`;
				} else if (callContext === false) {
					return `Object(${access})`;
				}
			}
			return access;
		} else {
			return importVar;
		}
	}

	blockPromise({ block, message }) {
		if (!block || !block.chunkGroup || block.chunkGroup.chunks.length === 0) {
			const comment = this.comment({
				message
			});
			return `Promise.resolve(${comment.trim()})`;
		}
		const chunks = block.chunkGroup.chunks.filter(
			chunk => !chunk.hasRuntime() && chunk.id !== null
		);
		const comment = this.comment({
			message,
			chunkName: block.chunkName,
			chunkReason: block.chunkReason
		});
		if (chunks.length === 1) {
			const chunkId = JSON.stringify(chunks[0].id);
			return `__webpack_require__.e(${comment}${chunkId})`;
		} else if (chunks.length > 0) {
			const requireChunkId = chunk =>
				`__webpack_require__.e(${JSON.stringify(chunk.id)})`;
			return `Promise.all(${comment.trim()}[${chunks
				.map(requireChunkId)
				.join(", ")}])`;
		} else {
			return `Promise.resolve(${comment.trim()})`;
		}
	}

	onError() {
		return "__webpack_require__.oe";
	}

	defineEsModuleFlagStatement({ exportsArgument }) {
		return `__webpack_require__.r(${exportsArgument});\n`;
	}
};


/***/ }),

/***/ 3963:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Sean Larkin @thelarkinn
*/


const SizeFormatHelpers = exports;

SizeFormatHelpers.formatSize = size => {
	if (typeof size !== "number" || Number.isNaN(size) === true) {
		return "unknown size";
	}

	if (size <= 0) {
		return "0 bytes";
	}

	const abbreviations = ["bytes", "KiB", "MiB", "GiB"];
	const index = Math.floor(Math.log(size) / Math.log(1024));

	return `${+(size / Math.pow(1024, index)).toPrecision(3)} ${
		abbreviations[index]
	}`;
};


/***/ }),

/***/ 5096:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const RequestShortener = __webpack_require__(2372);
const SizeFormatHelpers = __webpack_require__(3963);
const formatLocation = __webpack_require__(7929);
const identifierUtils = __webpack_require__(8540);
const compareLocations = __webpack_require__(2536);
const { LogType } = __webpack_require__(7225);

const optionsOrFallback = (...args) => {
	let optionValues = [];
	optionValues.push(...args);
	return optionValues.find(optionValue => optionValue !== undefined);
};

const compareId = (a, b) => {
	if (typeof a !== typeof b) {
		return typeof a < typeof b ? -1 : 1;
	}
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
};

class Stats {
	constructor(compilation) {
		this.compilation = compilation;
		this.hash = compilation.hash;
		this.startTime = undefined;
		this.endTime = undefined;
	}

	static filterWarnings(warnings, warningsFilter) {
		// we dont have anything to filter so all warnings can be shown
		if (!warningsFilter) {
			return warnings;
		}

		// create a chain of filters
		// if they return "true" a warning should be suppressed
		const normalizedWarningsFilters = [].concat(warningsFilter).map(filter => {
			if (typeof filter === "string") {
				return warning => warning.includes(filter);
			}

			if (filter instanceof RegExp) {
				return warning => filter.test(warning);
			}

			if (typeof filter === "function") {
				return filter;
			}

			throw new Error(
				`Can only filter warnings with Strings or RegExps. (Given: ${filter})`
			);
		});
		return warnings.filter(warning => {
			return !normalizedWarningsFilters.some(check => check(warning));
		});
	}

	formatFilePath(filePath) {
		const OPTIONS_REGEXP = /^(\s|\S)*!/;
		return filePath.includes("!")
			? `${filePath.replace(OPTIONS_REGEXP, "")} (${filePath})`
			: `${filePath}`;
	}

	hasWarnings() {
		return (
			this.compilation.warnings.length > 0 ||
			this.compilation.children.some(child => child.getStats().hasWarnings())
		);
	}

	hasErrors() {
		return (
			this.compilation.errors.length > 0 ||
			this.compilation.children.some(child => child.getStats().hasErrors())
		);
	}

	// remove a prefixed "!" that can be specified to reverse sort order
	normalizeFieldKey(field) {
		if (field[0] === "!") {
			return field.substr(1);
		}
		return field;
	}

	// if a field is prefixed by a "!" reverse sort order
	sortOrderRegular(field) {
		if (field[0] === "!") {
			return false;
		}
		return true;
	}

	toJson(options, forToString) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}

		const optionOrLocalFallback = (v, def) =>
			v !== undefined ? v : options.all !== undefined ? options.all : def;

		const testAgainstGivenOption = item => {
			if (typeof item === "string") {
				const regExp = new RegExp(
					`[\\\\/]${item.replace(
						// eslint-disable-next-line no-useless-escape
						/[-[\]{}()*+?.\\^$|]/g,
						"\\$&"
					)}([\\\\/]|$|!|\\?)`
				);
				return ident => regExp.test(ident);
			}
			if (item && typeof item === "object" && typeof item.test === "function") {
				return ident => item.test(ident);
			}
			if (typeof item === "function") {
				return item;
			}
			if (typeof item === "boolean") {
				return () => item;
			}
		};

		const compilation = this.compilation;
		const context = optionsOrFallback(
			options.context,
			compilation.compiler.context
		);
		const requestShortener =
			compilation.compiler.context === context
				? compilation.requestShortener
				: new RequestShortener(context);
		const showPerformance = optionOrLocalFallback(options.performance, true);
		const showHash = optionOrLocalFallback(options.hash, true);
		const showEnv = optionOrLocalFallback(options.env, false);
		const showVersion = optionOrLocalFallback(options.version, true);
		const showTimings = optionOrLocalFallback(options.timings, true);
		const showBuiltAt = optionOrLocalFallback(options.builtAt, true);
		const showAssets = optionOrLocalFallback(options.assets, true);
		const showEntrypoints = optionOrLocalFallback(options.entrypoints, true);
		const showChunkGroups = optionOrLocalFallback(
			options.chunkGroups,
			!forToString
		);
		const showChunks = optionOrLocalFallback(options.chunks, !forToString);
		const showChunkModules = optionOrLocalFallback(options.chunkModules, true);
		const showChunkOrigins = optionOrLocalFallback(
			options.chunkOrigins,
			!forToString
		);
		const showModules = optionOrLocalFallback(options.modules, true);
		const showNestedModules = optionOrLocalFallback(
			options.nestedModules,
			true
		);
		const showModuleAssets = optionOrLocalFallback(
			options.moduleAssets,
			!forToString
		);
		const showDepth = optionOrLocalFallback(options.depth, !forToString);
		const showCachedModules = optionOrLocalFallback(options.cached, true);
		const showCachedAssets = optionOrLocalFallback(options.cachedAssets, true);
		const showReasons = optionOrLocalFallback(options.reasons, !forToString);
		const showUsedExports = optionOrLocalFallback(
			options.usedExports,
			!forToString
		);
		const showProvidedExports = optionOrLocalFallback(
			options.providedExports,
			!forToString
		);
		const showOptimizationBailout = optionOrLocalFallback(
			options.optimizationBailout,
			!forToString
		);
		const showChildren = optionOrLocalFallback(options.children, true);
		const showSource = optionOrLocalFallback(options.source, !forToString);
		const showModuleTrace = optionOrLocalFallback(options.moduleTrace, true);
		const showErrors = optionOrLocalFallback(options.errors, true);
		const showErrorDetails = optionOrLocalFallback(
			options.errorDetails,
			!forToString
		);
		const showWarnings = optionOrLocalFallback(options.warnings, true);
		const warningsFilter = optionsOrFallback(options.warningsFilter, null);
		const showPublicPath = optionOrLocalFallback(
			options.publicPath,
			!forToString
		);
		const showLogging = optionOrLocalFallback(
			options.logging,
			forToString ? "info" : true
		);
		const showLoggingTrace = optionOrLocalFallback(
			options.loggingTrace,
			!forToString
		);
		const loggingDebug = []
			.concat(optionsOrFallback(options.loggingDebug, []))
			.map(testAgainstGivenOption);

		const excludeModules = []
			.concat(optionsOrFallback(options.excludeModules, options.exclude, []))
			.map(testAgainstGivenOption);
		const excludeAssets = []
			.concat(optionsOrFallback(options.excludeAssets, []))
			.map(testAgainstGivenOption);
		const maxModules = optionsOrFallback(
			options.maxModules,
			forToString ? 15 : Infinity
		);
		const sortModules = optionsOrFallback(options.modulesSort, "id");
		const sortChunks = optionsOrFallback(options.chunksSort, "id");
		const sortAssets = optionsOrFallback(options.assetsSort, "");
		const showOutputPath = optionOrLocalFallback(
			options.outputPath,
			!forToString
		);

		if (!showCachedModules) {
			excludeModules.push((ident, module) => !module.built);
		}

		const createModuleFilter = () => {
			let i = 0;
			return module => {
				if (excludeModules.length > 0) {
					const ident = requestShortener.shorten(module.resource);
					const excluded = excludeModules.some(fn => fn(ident, module));
					if (excluded) return false;
				}
				const result = i < maxModules;
				i++;
				return result;
			};
		};

		const createAssetFilter = () => {
			return asset => {
				if (excludeAssets.length > 0) {
					const ident = asset.name;
					const excluded = excludeAssets.some(fn => fn(ident, asset));
					if (excluded) return false;
				}
				return showCachedAssets || asset.emitted;
			};
		};

		const sortByFieldAndOrder = (fieldKey, a, b) => {
			if (a[fieldKey] === null && b[fieldKey] === null) return 0;
			if (a[fieldKey] === null) return 1;
			if (b[fieldKey] === null) return -1;
			if (a[fieldKey] === b[fieldKey]) return 0;
			if (typeof a[fieldKey] !== typeof b[fieldKey])
				return typeof a[fieldKey] < typeof b[fieldKey] ? -1 : 1;
			return a[fieldKey] < b[fieldKey] ? -1 : 1;
		};

		const sortByField = (field, originalArray) => {
			const originalMap = originalArray.reduce((map, v, i) => {
				map.set(v, i);
				return map;
			}, new Map());
			return (a, b) => {
				if (field) {
					const fieldKey = this.normalizeFieldKey(field);

					// if a field is prefixed with a "!" the sort is reversed!
					const sortIsRegular = this.sortOrderRegular(field);

					const cmp = sortByFieldAndOrder(
						fieldKey,
						sortIsRegular ? a : b,
						sortIsRegular ? b : a
					);
					if (cmp) return cmp;
				}
				return originalMap.get(a) - originalMap.get(b);
			};
		};

		const formatError = e => {
			let text = "";
			if (typeof e === "string") {
				e = { message: e };
			}
			if (e.chunk) {
				text += `chunk ${e.chunk.name || e.chunk.id}${
					e.chunk.hasRuntime()
						? " [entry]"
						: e.chunk.canBeInitial()
						? " [initial]"
						: ""
				}\n`;
			}
			if (e.file) {
				text += `${e.file}\n`;
			}
			if (
				e.module &&
				e.module.readableIdentifier &&
				typeof e.module.readableIdentifier === "function"
			) {
				text += this.formatFilePath(
					e.module.readableIdentifier(requestShortener)
				);
				if (typeof e.loc === "object") {
					const locInfo = formatLocation(e.loc);
					if (locInfo) text += ` ${locInfo}`;
				}
				text += "\n";
			}
			text += e.message;
			if (showErrorDetails && e.details) {
				text += `\n${e.details}`;
			}
			if (showErrorDetails && e.missing) {
				text += e.missing.map(item => `\n[${item}]`).join("");
			}
			if (showModuleTrace && e.origin) {
				text += `\n @ ${this.formatFilePath(
					e.origin.readableIdentifier(requestShortener)
				)}`;
				if (typeof e.originLoc === "object") {
					const locInfo = formatLocation(e.originLoc);
					if (locInfo) text += ` ${locInfo}`;
				}
				if (e.dependencies) {
					for (const dep of e.dependencies) {
						if (!dep.loc) continue;
						if (typeof dep.loc === "string") continue;
						const locInfo = formatLocation(dep.loc);
						if (!locInfo) continue;
						text += ` ${locInfo}`;
					}
				}
				let current = e.origin;
				while (current.issuer) {
					current = current.issuer;
					text += `\n @ ${current.readableIdentifier(requestShortener)}`;
				}
			}
			return text;
		};

		const obj = {
			errors: compilation.errors.map(formatError),
			warnings: Stats.filterWarnings(
				compilation.warnings.map(formatError),
				warningsFilter
			)
		};

		//We just hint other renderers since actually omitting
		//errors/warnings from the JSON would be kind of weird.
		Object.defineProperty(obj, "_showWarnings", {
			value: showWarnings,
			enumerable: false
		});
		Object.defineProperty(obj, "_showErrors", {
			value: showErrors,
			enumerable: false
		});

		if (showVersion) {
			obj.version = __webpack_require__(1618)/* .version */ .i8;
		}

		if (showHash) obj.hash = this.hash;
		if (showTimings && this.startTime && this.endTime) {
			obj.time = this.endTime - this.startTime;
		}

		if (showBuiltAt && this.endTime) {
			obj.builtAt = this.endTime;
		}

		if (showEnv && options._env) {
			obj.env = options._env;
		}

		if (compilation.needAdditionalPass) {
			obj.needAdditionalPass = true;
		}
		if (showPublicPath) {
			obj.publicPath = this.compilation.mainTemplate.getPublicPath({
				hash: this.compilation.hash
			});
		}
		if (showOutputPath) {
			obj.outputPath = this.compilation.mainTemplate.outputOptions.path;
		}
		if (showAssets) {
			const assetsByFile = {};
			const compilationAssets = compilation
				.getAssets()
				.sort((a, b) => (a.name < b.name ? -1 : 1));
			obj.assetsByChunkName = {};
			obj.assets = compilationAssets
				.map(({ name, source, info }) => {
					const obj = {
						name,
						size: source.size(),
						chunks: [],
						chunkNames: [],
						info,
						// TODO webpack 5: remove .emitted
						emitted: source.emitted || compilation.emittedAssets.has(name)
					};

					if (showPerformance) {
						obj.isOverSizeLimit = source.isOverSizeLimit;
					}

					assetsByFile[name] = obj;
					return obj;
				})
				.filter(createAssetFilter());
			obj.filteredAssets = compilationAssets.length - obj.assets.length;

			for (const chunk of compilation.chunks) {
				for (const asset of chunk.files) {
					if (assetsByFile[asset]) {
						for (const id of chunk.ids) {
							assetsByFile[asset].chunks.push(id);
						}
						if (chunk.name) {
							assetsByFile[asset].chunkNames.push(chunk.name);
							if (obj.assetsByChunkName[chunk.name]) {
								obj.assetsByChunkName[chunk.name] = []
									.concat(obj.assetsByChunkName[chunk.name])
									.concat([asset]);
							} else {
								obj.assetsByChunkName[chunk.name] = asset;
							}
						}
					}
				}
			}
			obj.assets.sort(sortByField(sortAssets, obj.assets));
		}

		const fnChunkGroup = groupMap => {
			const obj = {};
			for (const keyValuePair of groupMap) {
				const name = keyValuePair[0];
				const cg = keyValuePair[1];
				const children = cg.getChildrenByOrders();
				obj[name] = {
					chunks: cg.chunks.map(c => c.id),
					assets: cg.chunks.reduce(
						(array, c) => array.concat(c.files || []),
						[]
					),
					children: Object.keys(children).reduce((obj, key) => {
						const groups = children[key];
						obj[key] = groups.map(group => ({
							name: group.name,
							chunks: group.chunks.map(c => c.id),
							assets: group.chunks.reduce(
								(array, c) => array.concat(c.files || []),
								[]
							)
						}));
						return obj;
					}, Object.create(null)),
					childAssets: Object.keys(children).reduce((obj, key) => {
						const groups = children[key];
						obj[key] = Array.from(
							groups.reduce((set, group) => {
								for (const chunk of group.chunks) {
									for (const asset of chunk.files) {
										set.add(asset);
									}
								}
								return set;
							}, new Set())
						);
						return obj;
					}, Object.create(null))
				};
				if (showPerformance) {
					obj[name].isOverSizeLimit = cg.isOverSizeLimit;
				}
			}

			return obj;
		};

		if (showEntrypoints) {
			obj.entrypoints = fnChunkGroup(compilation.entrypoints);
		}

		if (showChunkGroups) {
			obj.namedChunkGroups = fnChunkGroup(compilation.namedChunkGroups);
		}

		const fnModule = module => {
			const path = [];
			let current = module;
			while (current.issuer) {
				path.push((current = current.issuer));
			}
			path.reverse();
			const obj = {
				id: module.id,
				identifier: module.identifier(),
				name: module.readableIdentifier(requestShortener),
				index: module.index,
				index2: module.index2,
				size: module.size(),
				cacheable: module.buildInfo.cacheable,
				built: !!module.built,
				optional: module.optional,
				prefetched: module.prefetched,
				chunks: Array.from(module.chunksIterable, chunk => chunk.id),
				issuer: module.issuer && module.issuer.identifier(),
				issuerId: module.issuer && module.issuer.id,
				issuerName:
					module.issuer && module.issuer.readableIdentifier(requestShortener),
				issuerPath:
					module.issuer &&
					path.map(module => ({
						id: module.id,
						identifier: module.identifier(),
						name: module.readableIdentifier(requestShortener),
						profile: module.profile
					})),
				profile: module.profile,
				failed: !!module.error,
				errors: module.errors ? module.errors.length : 0,
				warnings: module.warnings ? module.warnings.length : 0
			};
			if (showModuleAssets) {
				obj.assets = Object.keys(module.buildInfo.assets || {});
			}
			if (showReasons) {
				obj.reasons = module.reasons
					.sort((a, b) => {
						if (a.module && !b.module) return -1;
						if (!a.module && b.module) return 1;
						if (a.module && b.module) {
							const cmp = compareId(a.module.id, b.module.id);
							if (cmp) return cmp;
						}
						if (a.dependency && !b.dependency) return -1;
						if (!a.dependency && b.dependency) return 1;
						if (a.dependency && b.dependency) {
							const cmp = compareLocations(a.dependency.loc, b.dependency.loc);
							if (cmp) return cmp;
							if (a.dependency.type < b.dependency.type) return -1;
							if (a.dependency.type > b.dependency.type) return 1;
						}
						return 0;
					})
					.map(reason => {
						const obj = {
							moduleId: reason.module ? reason.module.id : null,
							moduleIdentifier: reason.module
								? reason.module.identifier()
								: null,
							module: reason.module
								? reason.module.readableIdentifier(requestShortener)
								: null,
							moduleName: reason.module
								? reason.module.readableIdentifier(requestShortener)
								: null,
							type: reason.dependency ? reason.dependency.type : null,
							explanation: reason.explanation,
							userRequest: reason.dependency
								? reason.dependency.userRequest
								: null
						};
						if (reason.dependency) {
							const locInfo = formatLocation(reason.dependency.loc);
							if (locInfo) {
								obj.loc = locInfo;
							}
						}
						return obj;
					});
			}
			if (showUsedExports) {
				if (module.used === true) {
					obj.usedExports = module.usedExports;
				} else if (module.used === false) {
					obj.usedExports = false;
				}
			}
			if (showProvidedExports) {
				obj.providedExports = Array.isArray(module.buildMeta.providedExports)
					? module.buildMeta.providedExports
					: null;
			}
			if (showOptimizationBailout) {
				obj.optimizationBailout = module.optimizationBailout.map(item => {
					if (typeof item === "function") return item(requestShortener);
					return item;
				});
			}
			if (showDepth) {
				obj.depth = module.depth;
			}
			if (showNestedModules) {
				if (module.modules) {
					const modules = module.modules;
					obj.modules = modules
						.sort(sortByField("depth", modules))
						.filter(createModuleFilter())
						.map(fnModule);
					obj.filteredModules = modules.length - obj.modules.length;
					obj.modules.sort(sortByField(sortModules, obj.modules));
				}
			}
			if (showSource && module._source) {
				obj.source = module._source.source();
			}
			return obj;
		};
		if (showChunks) {
			obj.chunks = compilation.chunks.map(chunk => {
				const parents = new Set();
				const children = new Set();
				const siblings = new Set();
				const childIdByOrder = chunk.getChildIdsByOrders();
				for (const chunkGroup of chunk.groupsIterable) {
					for (const parentGroup of chunkGroup.parentsIterable) {
						for (const chunk of parentGroup.chunks) {
							parents.add(chunk.id);
						}
					}
					for (const childGroup of chunkGroup.childrenIterable) {
						for (const chunk of childGroup.chunks) {
							children.add(chunk.id);
						}
					}
					for (const sibling of chunkGroup.chunks) {
						if (sibling !== chunk) siblings.add(sibling.id);
					}
				}
				const obj = {
					id: chunk.id,
					rendered: chunk.rendered,
					initial: chunk.canBeInitial(),
					entry: chunk.hasRuntime(),
					recorded: chunk.recorded,
					reason: chunk.chunkReason,
					size: chunk.modulesSize(),
					names: chunk.name ? [chunk.name] : [],
					files: chunk.files.slice(),
					hash: chunk.renderedHash,
					siblings: Array.from(siblings).sort(compareId),
					parents: Array.from(parents).sort(compareId),
					children: Array.from(children).sort(compareId),
					childrenByOrder: childIdByOrder
				};
				if (showChunkModules) {
					const modules = chunk.getModules();
					obj.modules = modules
						.slice()
						.sort(sortByField("depth", modules))
						.filter(createModuleFilter())
						.map(fnModule);
					obj.filteredModules = chunk.getNumberOfModules() - obj.modules.length;
					obj.modules.sort(sortByField(sortModules, obj.modules));
				}
				if (showChunkOrigins) {
					obj.origins = Array.from(chunk.groupsIterable, g => g.origins)
						.reduce((a, b) => a.concat(b), [])
						.map(origin => ({
							moduleId: origin.module ? origin.module.id : undefined,
							module: origin.module ? origin.module.identifier() : "",
							moduleIdentifier: origin.module ? origin.module.identifier() : "",
							moduleName: origin.module
								? origin.module.readableIdentifier(requestShortener)
								: "",
							loc: formatLocation(origin.loc),
							request: origin.request,
							reasons: origin.reasons || []
						}))
						.sort((a, b) => {
							const cmp1 = compareId(a.moduleId, b.moduleId);
							if (cmp1) return cmp1;
							const cmp2 = compareId(a.loc, b.loc);
							if (cmp2) return cmp2;
							const cmp3 = compareId(a.request, b.request);
							if (cmp3) return cmp3;
							return 0;
						});
				}
				return obj;
			});
			obj.chunks.sort(sortByField(sortChunks, obj.chunks));
		}
		if (showModules) {
			obj.modules = compilation.modules
				.slice()
				.sort(sortByField("depth", compilation.modules))
				.filter(createModuleFilter())
				.map(fnModule);
			obj.filteredModules = compilation.modules.length - obj.modules.length;
			obj.modules.sort(sortByField(sortModules, obj.modules));
		}
		if (showLogging) {
			const util = __webpack_require__(1669);
			obj.logging = {};
			let acceptedTypes;
			let collapsedGroups = false;
			switch (showLogging) {
				case "none":
					acceptedTypes = new Set([]);
					break;
				case "error":
					acceptedTypes = new Set([LogType.error]);
					break;
				case "warn":
					acceptedTypes = new Set([LogType.error, LogType.warn]);
					break;
				case "info":
					acceptedTypes = new Set([LogType.error, LogType.warn, LogType.info]);
					break;
				case true:
				case "log":
					acceptedTypes = new Set([
						LogType.error,
						LogType.warn,
						LogType.info,
						LogType.log,
						LogType.group,
						LogType.groupEnd,
						LogType.groupCollapsed,
						LogType.clear
					]);
					break;
				case "verbose":
					acceptedTypes = new Set([
						LogType.error,
						LogType.warn,
						LogType.info,
						LogType.log,
						LogType.group,
						LogType.groupEnd,
						LogType.groupCollapsed,
						LogType.profile,
						LogType.profileEnd,
						LogType.time,
						LogType.status,
						LogType.clear
					]);
					collapsedGroups = true;
					break;
			}
			for (const [origin, logEntries] of compilation.logging) {
				const debugMode = loggingDebug.some(fn => fn(origin));
				let collapseCounter = 0;
				let processedLogEntries = logEntries;
				if (!debugMode) {
					processedLogEntries = processedLogEntries.filter(entry => {
						if (!acceptedTypes.has(entry.type)) return false;
						if (!collapsedGroups) {
							switch (entry.type) {
								case LogType.groupCollapsed:
									collapseCounter++;
									return collapseCounter === 1;
								case LogType.group:
									if (collapseCounter > 0) collapseCounter++;
									return collapseCounter === 0;
								case LogType.groupEnd:
									if (collapseCounter > 0) {
										collapseCounter--;
										return false;
									}
									return true;
								default:
									return collapseCounter === 0;
							}
						}
						return true;
					});
				}
				processedLogEntries = processedLogEntries.map(entry => {
					let message = undefined;
					if (entry.type === LogType.time) {
						message = `${entry.args[0]}: ${entry.args[1] * 1000 +
							entry.args[2] / 1000000}ms`;
					} else if (entry.args && entry.args.length > 0) {
						message = util.format(entry.args[0], ...entry.args.slice(1));
					}
					return {
						type:
							(debugMode || collapsedGroups) &&
							entry.type === LogType.groupCollapsed
								? LogType.group
								: entry.type,
						message,
						trace: showLoggingTrace && entry.trace ? entry.trace : undefined
					};
				});
				let name = identifierUtils
					.makePathsRelative(context, origin, compilation.cache)
					.replace(/\|/g, " ");
				if (name in obj.logging) {
					let i = 1;
					while (`${name}#${i}` in obj.logging) {
						i++;
					}
					name = `${name}#${i}`;
				}
				obj.logging[name] = {
					entries: processedLogEntries,
					filteredEntries: logEntries.length - processedLogEntries.length,
					debug: debugMode
				};
			}
		}
		if (showChildren) {
			obj.children = compilation.children.map((child, idx) => {
				const childOptions = Stats.getChildOptions(options, idx);
				const obj = new Stats(child).toJson(childOptions, forToString);
				delete obj.hash;
				delete obj.version;
				if (child.name) {
					obj.name = identifierUtils.makePathsRelative(
						context,
						child.name,
						compilation.cache
					);
				}
				return obj;
			});
		}

		return obj;
	}

	toString(options) {
		if (typeof options === "boolean" || typeof options === "string") {
			options = Stats.presetToOptions(options);
		} else if (!options) {
			options = {};
		}

		const useColors = optionsOrFallback(options.colors, false);

		const obj = this.toJson(options, true);

		return Stats.jsonToString(obj, useColors);
	}

	static jsonToString(obj, useColors) {
		const buf = [];

		const defaultColors = {
			bold: "\u001b[1m",
			yellow: "\u001b[1m\u001b[33m",
			red: "\u001b[1m\u001b[31m",
			green: "\u001b[1m\u001b[32m",
			cyan: "\u001b[1m\u001b[36m",
			magenta: "\u001b[1m\u001b[35m"
		};

		const colors = Object.keys(defaultColors).reduce(
			(obj, color) => {
				obj[color] = str => {
					if (useColors) {
						buf.push(
							useColors === true || useColors[color] === undefined
								? defaultColors[color]
								: useColors[color]
						);
					}
					buf.push(str);
					if (useColors) {
						buf.push("\u001b[39m\u001b[22m");
					}
				};
				return obj;
			},
			{
				normal: str => buf.push(str)
			}
		);

		const coloredTime = time => {
			let times = [800, 400, 200, 100];
			if (obj.time) {
				times = [obj.time / 2, obj.time / 4, obj.time / 8, obj.time / 16];
			}
			if (time < times[3]) colors.normal(`${time}ms`);
			else if (time < times[2]) colors.bold(`${time}ms`);
			else if (time < times[1]) colors.green(`${time}ms`);
			else if (time < times[0]) colors.yellow(`${time}ms`);
			else colors.red(`${time}ms`);
		};

		const newline = () => buf.push("\n");

		const getText = (arr, row, col) => {
			return arr[row][col].value;
		};

		const table = (array, align, splitter) => {
			const rows = array.length;
			const cols = array[0].length;
			const colSizes = new Array(cols);
			for (let col = 0; col < cols; col++) {
				colSizes[col] = 0;
			}
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const value = `${getText(array, row, col)}`;
					if (value.length > colSizes[col]) {
						colSizes[col] = value.length;
					}
				}
			}
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const format = array[row][col].color;
					const value = `${getText(array, row, col)}`;
					let l = value.length;
					if (align[col] === "l") {
						format(value);
					}
					for (; l < colSizes[col] && col !== cols - 1; l++) {
						colors.normal(" ");
					}
					if (align[col] === "r") {
						format(value);
					}
					if (col + 1 < cols && colSizes[col] !== 0) {
						colors.normal(splitter || "  ");
					}
				}
				newline();
			}
		};

		const getAssetColor = (asset, defaultColor) => {
			if (asset.isOverSizeLimit) {
				return colors.yellow;
			}

			return defaultColor;
		};

		if (obj.hash) {
			colors.normal("Hash: ");
			colors.bold(obj.hash);
			newline();
		}
		if (obj.version) {
			colors.normal("Version: webpack ");
			colors.bold(obj.version);
			newline();
		}
		if (typeof obj.time === "number") {
			colors.normal("Time: ");
			colors.bold(obj.time);
			colors.normal("ms");
			newline();
		}
		if (typeof obj.builtAt === "number") {
			const builtAtDate = new Date(obj.builtAt);
			let timeZone = undefined;

			try {
				builtAtDate.toLocaleTimeString();
			} catch (err) {
				// Force UTC if runtime timezone is unsupported
				timeZone = "UTC";
			}

			colors.normal("Built at: ");
			colors.normal(
				builtAtDate.toLocaleDateString(undefined, {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
					timeZone
				})
			);
			colors.normal(" ");
			colors.bold(builtAtDate.toLocaleTimeString(undefined, { timeZone }));
			newline();
		}
		if (obj.env) {
			colors.normal("Environment (--env): ");
			colors.bold(JSON.stringify(obj.env, null, 2));
			newline();
		}
		if (obj.publicPath) {
			colors.normal("PublicPath: ");
			colors.bold(obj.publicPath);
			newline();
		}

		if (obj.assets && obj.assets.length > 0) {
			const t = [
				[
					{
						value: "Asset",
						color: colors.bold
					},
					{
						value: "Size",
						color: colors.bold
					},
					{
						value: "Chunks",
						color: colors.bold
					},
					{
						value: "",
						color: colors.bold
					},
					{
						value: "",
						color: colors.bold
					},
					{
						value: "Chunk Names",
						color: colors.bold
					}
				]
			];
			for (const asset of obj.assets) {
				t.push([
					{
						value: asset.name,
						color: getAssetColor(asset, colors.green)
					},
					{
						value: SizeFormatHelpers.formatSize(asset.size),
						color: getAssetColor(asset, colors.normal)
					},
					{
						value: asset.chunks.join(", "),
						color: colors.bold
					},
					{
						value: [
							asset.emitted && "[emitted]",
							asset.info.immutable && "[immutable]",
							asset.info.development && "[dev]",
							asset.info.hotModuleReplacement && "[hmr]"
						]
							.filter(Boolean)
							.join(" "),
						color: colors.green
					},
					{
						value: asset.isOverSizeLimit ? "[big]" : "",
						color: getAssetColor(asset, colors.normal)
					},
					{
						value: asset.chunkNames.join(", "),
						color: colors.normal
					}
				]);
			}
			table(t, "rrrlll");
		}
		if (obj.filteredAssets > 0) {
			colors.normal(" ");
			if (obj.assets.length > 0) colors.normal("+ ");
			colors.normal(obj.filteredAssets);
			if (obj.assets.length > 0) colors.normal(" hidden");
			colors.normal(obj.filteredAssets !== 1 ? " assets" : " asset");
			newline();
		}

		const processChunkGroups = (namedGroups, prefix) => {
			for (const name of Object.keys(namedGroups)) {
				const cg = namedGroups[name];
				colors.normal(`${prefix} `);
				colors.bold(name);
				if (cg.isOverSizeLimit) {
					colors.normal(" ");
					colors.yellow("[big]");
				}
				colors.normal(" =");
				for (const asset of cg.assets) {
					colors.normal(" ");
					colors.green(asset);
				}
				for (const name of Object.keys(cg.childAssets)) {
					const assets = cg.childAssets[name];
					if (assets && assets.length > 0) {
						colors.normal(" ");
						colors.magenta(`(${name}:`);
						for (const asset of assets) {
							colors.normal(" ");
							colors.green(asset);
						}
						colors.magenta(")");
					}
				}
				newline();
			}
		};

		if (obj.entrypoints) {
			processChunkGroups(obj.entrypoints, "Entrypoint");
		}

		if (obj.namedChunkGroups) {
			let outputChunkGroups = obj.namedChunkGroups;
			if (obj.entrypoints) {
				outputChunkGroups = Object.keys(outputChunkGroups)
					.filter(name => !obj.entrypoints[name])
					.reduce((result, name) => {
						result[name] = obj.namedChunkGroups[name];
						return result;
					}, {});
			}
			processChunkGroups(outputChunkGroups, "Chunk Group");
		}

		const modulesByIdentifier = {};
		if (obj.modules) {
			for (const module of obj.modules) {
				modulesByIdentifier[`$${module.identifier}`] = module;
			}
		} else if (obj.chunks) {
			for (const chunk of obj.chunks) {
				if (chunk.modules) {
					for (const module of chunk.modules) {
						modulesByIdentifier[`$${module.identifier}`] = module;
					}
				}
			}
		}

		const processModuleAttributes = module => {
			colors.normal(" ");
			colors.normal(SizeFormatHelpers.formatSize(module.size));
			if (module.chunks) {
				for (const chunk of module.chunks) {
					colors.normal(" {");
					colors.yellow(chunk);
					colors.normal("}");
				}
			}
			if (typeof module.depth === "number") {
				colors.normal(` [depth ${module.depth}]`);
			}
			if (module.cacheable === false) {
				colors.red(" [not cacheable]");
			}
			if (module.optional) {
				colors.yellow(" [optional]");
			}
			if (module.built) {
				colors.green(" [built]");
			}
			if (module.assets && module.assets.length) {
				colors.magenta(
					` [${module.assets.length} asset${
						module.assets.length === 1 ? "" : "s"
					}]`
				);
			}
			if (module.prefetched) {
				colors.magenta(" [prefetched]");
			}
			if (module.failed) colors.red(" [failed]");
			if (module.warnings) {
				colors.yellow(
					` [${module.warnings} warning${module.warnings === 1 ? "" : "s"}]`
				);
			}
			if (module.errors) {
				colors.red(
					` [${module.errors} error${module.errors === 1 ? "" : "s"}]`
				);
			}
		};

		const processModuleContent = (module, prefix) => {
			if (Array.isArray(module.providedExports)) {
				colors.normal(prefix);
				if (module.providedExports.length === 0) {
					colors.cyan("[no exports]");
				} else {
					colors.cyan(`[exports: ${module.providedExports.join(", ")}]`);
				}
				newline();
			}
			if (module.usedExports !== undefined) {
				if (module.usedExports !== true) {
					colors.normal(prefix);
					if (module.usedExports === null) {
						colors.cyan("[used exports unknown]");
					} else if (module.usedExports === false) {
						colors.cyan("[no exports used]");
					} else if (
						Array.isArray(module.usedExports) &&
						module.usedExports.length === 0
					) {
						colors.cyan("[no exports used]");
					} else if (Array.isArray(module.usedExports)) {
						const providedExportsCount = Array.isArray(module.providedExports)
							? module.providedExports.length
							: null;
						if (
							providedExportsCount !== null &&
							providedExportsCount === module.usedExports.length
						) {
							colors.cyan("[all exports used]");
						} else {
							colors.cyan(
								`[only some exports used: ${module.usedExports.join(", ")}]`
							);
						}
					}
					newline();
				}
			}
			if (Array.isArray(module.optimizationBailout)) {
				for (const item of module.optimizationBailout) {
					colors.normal(prefix);
					colors.yellow(item);
					newline();
				}
			}
			if (module.reasons) {
				for (const reason of module.reasons) {
					colors.normal(prefix);
					if (reason.type) {
						colors.normal(reason.type);
						colors.normal(" ");
					}
					if (reason.userRequest) {
						colors.cyan(reason.userRequest);
						colors.normal(" ");
					}
					if (reason.moduleId !== null) {
						colors.normal("[");
						colors.normal(reason.moduleId);
						colors.normal("]");
					}
					if (reason.module && reason.module !== reason.moduleId) {
						colors.normal(" ");
						colors.magenta(reason.module);
					}
					if (reason.loc) {
						colors.normal(" ");
						colors.normal(reason.loc);
					}
					if (reason.explanation) {
						colors.normal(" ");
						colors.cyan(reason.explanation);
					}
					newline();
				}
			}
			if (module.profile) {
				colors.normal(prefix);
				let sum = 0;
				if (module.issuerPath) {
					for (const m of module.issuerPath) {
						colors.normal("[");
						colors.normal(m.id);
						colors.normal("] ");
						if (m.profile) {
							const time = (m.profile.factory || 0) + (m.profile.building || 0);
							coloredTime(time);
							sum += time;
							colors.normal(" ");
						}
						colors.normal("-> ");
					}
				}
				for (const key of Object.keys(module.profile)) {
					colors.normal(`${key}:`);
					const time = module.profile[key];
					coloredTime(time);
					colors.normal(" ");
					sum += time;
				}
				colors.normal("= ");
				coloredTime(sum);
				newline();
			}
			if (module.modules) {
				processModulesList(module, prefix + "| ");
			}
		};

		const processModulesList = (obj, prefix) => {
			if (obj.modules) {
				let maxModuleId = 0;
				for (const module of obj.modules) {
					if (typeof module.id === "number") {
						if (maxModuleId < module.id) maxModuleId = module.id;
					}
				}
				let contentPrefix = prefix + "    ";
				if (maxModuleId >= 10) contentPrefix += " ";
				if (maxModuleId >= 100) contentPrefix += " ";
				if (maxModuleId >= 1000) contentPrefix += " ";
				for (const module of obj.modules) {
					colors.normal(prefix);
					const name = module.name || module.identifier;
					if (typeof module.id === "string" || typeof module.id === "number") {
						if (typeof module.id === "number") {
							if (module.id < 1000 && maxModuleId >= 1000) colors.normal(" ");
							if (module.id < 100 && maxModuleId >= 100) colors.normal(" ");
							if (module.id < 10 && maxModuleId >= 10) colors.normal(" ");
						} else {
							if (maxModuleId >= 1000) colors.normal(" ");
							if (maxModuleId >= 100) colors.normal(" ");
							if (maxModuleId >= 10) colors.normal(" ");
						}
						if (name !== module.id) {
							colors.normal("[");
							colors.normal(module.id);
							colors.normal("]");
							colors.normal(" ");
						} else {
							colors.normal("[");
							colors.bold(module.id);
							colors.normal("]");
						}
					}
					if (name !== module.id) {
						colors.bold(name);
					}
					processModuleAttributes(module);
					newline();
					processModuleContent(module, contentPrefix);
				}
				if (obj.filteredModules > 0) {
					colors.normal(prefix);
					colors.normal("   ");
					if (obj.modules.length > 0) colors.normal(" + ");
					colors.normal(obj.filteredModules);
					if (obj.modules.length > 0) colors.normal(" hidden");
					colors.normal(obj.filteredModules !== 1 ? " modules" : " module");
					newline();
				}
			}
		};

		if (obj.chunks) {
			for (const chunk of obj.chunks) {
				colors.normal("chunk ");
				if (chunk.id < 1000) colors.normal(" ");
				if (chunk.id < 100) colors.normal(" ");
				if (chunk.id < 10) colors.normal(" ");
				colors.normal("{");
				colors.yellow(chunk.id);
				colors.normal("} ");
				colors.green(chunk.files.join(", "));
				if (chunk.names && chunk.names.length > 0) {
					colors.normal(" (");
					colors.normal(chunk.names.join(", "));
					colors.normal(")");
				}
				colors.normal(" ");
				colors.normal(SizeFormatHelpers.formatSize(chunk.size));
				for (const id of chunk.parents) {
					colors.normal(" <{");
					colors.yellow(id);
					colors.normal("}>");
				}
				for (const id of chunk.siblings) {
					colors.normal(" ={");
					colors.yellow(id);
					colors.normal("}=");
				}
				for (const id of chunk.children) {
					colors.normal(" >{");
					colors.yellow(id);
					colors.normal("}<");
				}
				if (chunk.childrenByOrder) {
					for (const name of Object.keys(chunk.childrenByOrder)) {
						const children = chunk.childrenByOrder[name];
						colors.normal(" ");
						colors.magenta(`(${name}:`);
						for (const id of children) {
							colors.normal(" {");
							colors.yellow(id);
							colors.normal("}");
						}
						colors.magenta(")");
					}
				}
				if (chunk.entry) {
					colors.yellow(" [entry]");
				} else if (chunk.initial) {
					colors.yellow(" [initial]");
				}
				if (chunk.rendered) {
					colors.green(" [rendered]");
				}
				if (chunk.recorded) {
					colors.green(" [recorded]");
				}
				if (chunk.reason) {
					colors.yellow(` ${chunk.reason}`);
				}
				newline();
				if (chunk.origins) {
					for (const origin of chunk.origins) {
						colors.normal("    > ");
						if (origin.reasons && origin.reasons.length) {
							colors.yellow(origin.reasons.join(" "));
							colors.normal(" ");
						}
						if (origin.request) {
							colors.normal(origin.request);
							colors.normal(" ");
						}
						if (origin.module) {
							colors.normal("[");
							colors.normal(origin.moduleId);
							colors.normal("] ");
							const module = modulesByIdentifier[`$${origin.module}`];
							if (module) {
								colors.bold(module.name);
								colors.normal(" ");
							}
						}
						if (origin.loc) {
							colors.normal(origin.loc);
						}
						newline();
					}
				}
				processModulesList(chunk, " ");
			}
		}

		processModulesList(obj, "");

		if (obj.logging) {
			for (const origin of Object.keys(obj.logging)) {
				const logData = obj.logging[origin];
				if (logData.entries.length > 0) {
					newline();
					if (logData.debug) {
						colors.red("DEBUG ");
					}
					colors.bold("LOG from " + origin);
					newline();
					let indent = "";
					for (const entry of logData.entries) {
						let color = colors.normal;
						let prefix = "    ";
						switch (entry.type) {
							case LogType.clear:
								colors.normal(`${indent}-------`);
								newline();
								continue;
							case LogType.error:
								color = colors.red;
								prefix = "<e> ";
								break;
							case LogType.warn:
								color = colors.yellow;
								prefix = "<w> ";
								break;
							case LogType.info:
								color = colors.green;
								prefix = "<i> ";
								break;
							case LogType.log:
								color = colors.bold;
								break;
							case LogType.trace:
							case LogType.debug:
								color = colors.normal;
								break;
							case LogType.status:
								color = colors.magenta;
								prefix = "<s> ";
								break;
							case LogType.profile:
								color = colors.magenta;
								prefix = "<p> ";
								break;
							case LogType.profileEnd:
								color = colors.magenta;
								prefix = "</p> ";
								break;
							case LogType.time:
								color = colors.magenta;
								prefix = "<t> ";
								break;
							case LogType.group:
								color = colors.cyan;
								prefix = "<-> ";
								break;
							case LogType.groupCollapsed:
								color = colors.cyan;
								prefix = "<+> ";
								break;
							case LogType.groupEnd:
								if (indent.length >= 2)
									indent = indent.slice(0, indent.length - 2);
								continue;
						}
						if (entry.message) {
							for (const line of entry.message.split("\n")) {
								colors.normal(`${indent}${prefix}`);
								color(line);
								newline();
							}
						}
						if (entry.trace) {
							for (const line of entry.trace) {
								colors.normal(`${indent}| ${line}`);
								newline();
							}
						}
						switch (entry.type) {
							case LogType.group:
								indent += "  ";
								break;
						}
					}
					if (logData.filteredEntries) {
						colors.normal(`+ ${logData.filteredEntries} hidden lines`);
						newline();
					}
				}
			}
		}

		if (obj._showWarnings && obj.warnings) {
			for (const warning of obj.warnings) {
				newline();
				colors.yellow(`WARNING in ${warning}`);
				newline();
			}
		}
		if (obj._showErrors && obj.errors) {
			for (const error of obj.errors) {
				newline();
				colors.red(`ERROR in ${error}`);
				newline();
			}
		}
		if (obj.children) {
			for (const child of obj.children) {
				const childString = Stats.jsonToString(child, useColors);
				if (childString) {
					if (child.name) {
						colors.normal("Child ");
						colors.bold(child.name);
						colors.normal(":");
					} else {
						colors.normal("Child");
					}
					newline();
					buf.push("    ");
					buf.push(childString.replace(/\n/g, "\n    "));
					newline();
				}
			}
		}
		if (obj.needAdditionalPass) {
			colors.yellow(
				"Compilation needs an additional pass and will compile again."
			);
		}

		while (buf[buf.length - 1] === "\n") {
			buf.pop();
		}
		return buf.join("");
	}

	static presetToOptions(name) {
		// Accepted values: none, errors-only, minimal, normal, detailed, verbose
		// Any other falsy value will behave as 'none', truthy values as 'normal'
		const pn =
			(typeof name === "string" && name.toLowerCase()) || name || "none";
		switch (pn) {
			case "none":
				return {
					all: false
				};
			case "verbose":
				return {
					entrypoints: true,
					chunkGroups: true,
					modules: false,
					chunks: true,
					chunkModules: true,
					chunkOrigins: true,
					depth: true,
					env: true,
					reasons: true,
					usedExports: true,
					providedExports: true,
					optimizationBailout: true,
					errorDetails: true,
					publicPath: true,
					logging: "verbose",
					exclude: false,
					maxModules: Infinity
				};
			case "detailed":
				return {
					entrypoints: true,
					chunkGroups: true,
					chunks: true,
					chunkModules: false,
					chunkOrigins: true,
					depth: true,
					usedExports: true,
					providedExports: true,
					optimizationBailout: true,
					errorDetails: true,
					publicPath: true,
					logging: true,
					exclude: false,
					maxModules: Infinity
				};
			case "minimal":
				return {
					all: false,
					modules: true,
					maxModules: 0,
					errors: true,
					warnings: true,
					logging: "warn"
				};
			case "errors-only":
				return {
					all: false,
					errors: true,
					moduleTrace: true,
					logging: "error"
				};
			case "errors-warnings":
				return {
					all: false,
					errors: true,
					warnings: true,
					logging: "warn"
				};
			default:
				return {};
		}
	}

	static getChildOptions(options, idx) {
		let innerOptions;
		if (Array.isArray(options.children)) {
			if (idx < options.children.length) {
				innerOptions = options.children[idx];
			}
		} else if (typeof options.children === "object" && options.children) {
			innerOptions = options.children;
		}
		if (typeof innerOptions === "boolean" || typeof innerOptions === "string") {
			innerOptions = Stats.presetToOptions(innerOptions);
		}
		if (!innerOptions) {
			return options;
		}
		const childOptions = Object.assign({}, options);
		delete childOptions.children; // do not inherit children
		return Object.assign(childOptions, innerOptions);
	}
}

module.exports = Stats;


/***/ }),

/***/ 3720:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/** @typedef {import("./Module")} Module */
/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./ModuleTemplate")} ModuleTemplate */
/** @typedef {import("webpack-sources").ConcatSource} ConcatSource */

const { ConcatSource } = __webpack_require__(3745);
const HotUpdateChunk = __webpack_require__(6346);

const START_LOWERCASE_ALPHABET_CODE = "a".charCodeAt(0);
const START_UPPERCASE_ALPHABET_CODE = "A".charCodeAt(0);
const DELTA_A_TO_Z = "z".charCodeAt(0) - START_LOWERCASE_ALPHABET_CODE + 1;
const FUNCTION_CONTENT_REGEX = /^function\s?\(\)\s?\{\r?\n?|\r?\n?\}$/g;
const INDENT_MULTILINE_REGEX = /^\t/gm;
const LINE_SEPARATOR_REGEX = /\r?\n/g;
const IDENTIFIER_NAME_REPLACE_REGEX = /^([^a-zA-Z$_])/;
const IDENTIFIER_ALPHA_NUMERIC_NAME_REPLACE_REGEX = /[^a-zA-Z0-9$]+/g;
const COMMENT_END_REGEX = /\*\//g;
const PATH_NAME_NORMALIZE_REPLACE_REGEX = /[^a-zA-Z0-9_!§$()=\-^°]+/g;
const MATCH_PADDED_HYPHENS_REPLACE_REGEX = /^-|-$/g;

/** @typedef {import("webpack-sources").Source} Source */

/**
 * @typedef {Object} HasId
 * @property {number | string} id
 */

/**
 * @typedef {function(Module, number): boolean} ModuleFilterPredicate
 */

/**
 * @param {HasId} a first id object to be sorted
 * @param {HasId} b second id object to be sorted against
 * @returns {-1|0|1} the sort value
 */
const stringifyIdSortPredicate = (a, b) => {
	const aId = a.id + "";
	const bId = b.id + "";
	if (aId < bId) return -1;
	if (aId > bId) return 1;
	return 0;
};

class Template {
	/**
	 *
	 * @param {Function} fn a runtime function (.runtime.js) "template"
	 * @returns {string} the updated and normalized function string
	 */
	static getFunctionContent(fn) {
		return fn
			.toString()
			.replace(FUNCTION_CONTENT_REGEX, "")
			.replace(INDENT_MULTILINE_REGEX, "")
			.replace(LINE_SEPARATOR_REGEX, "\n");
	}

	/**
	 * @param {string} str the string converted to identifier
	 * @returns {string} created identifier
	 */
	static toIdentifier(str) {
		if (typeof str !== "string") return "";
		return str
			.replace(IDENTIFIER_NAME_REPLACE_REGEX, "_$1")
			.replace(IDENTIFIER_ALPHA_NUMERIC_NAME_REPLACE_REGEX, "_");
	}
	/**
	 *
	 * @param {string} str string to be converted to commented in bundle code
	 * @returns {string} returns a commented version of string
	 */
	static toComment(str) {
		if (!str) return "";
		return `/*! ${str.replace(COMMENT_END_REGEX, "* /")} */`;
	}

	/**
	 *
	 * @param {string} str string to be converted to "normal comment"
	 * @returns {string} returns a commented version of string
	 */
	static toNormalComment(str) {
		if (!str) return "";
		return `/* ${str.replace(COMMENT_END_REGEX, "* /")} */`;
	}

	/**
	 * @param {string} str string path to be normalized
	 * @returns {string} normalized bundle-safe path
	 */
	static toPath(str) {
		if (typeof str !== "string") return "";
		return str
			.replace(PATH_NAME_NORMALIZE_REPLACE_REGEX, "-")
			.replace(MATCH_PADDED_HYPHENS_REPLACE_REGEX, "");
	}

	// map number to a single character a-z, A-Z or <_ + number> if number is too big
	/**
	 *
	 * @param {number} n number to convert to ident
	 * @returns {string} returns single character ident
	 */
	static numberToIdentifer(n) {
		// lower case
		if (n < DELTA_A_TO_Z) {
			return String.fromCharCode(START_LOWERCASE_ALPHABET_CODE + n);
		}

		// upper case
		if (n < DELTA_A_TO_Z * 2) {
			return String.fromCharCode(
				START_UPPERCASE_ALPHABET_CODE + n - DELTA_A_TO_Z
			);
		}

		// use multiple letters
		return (
			Template.numberToIdentifer(n % (2 * DELTA_A_TO_Z)) +
			Template.numberToIdentifer(Math.floor(n / (2 * DELTA_A_TO_Z)))
		);
	}

	/**
	 *
	 * @param {string | string[]} s string to convert to identity
	 * @returns {string} converted identity
	 */
	static indent(s) {
		if (Array.isArray(s)) {
			return s.map(Template.indent).join("\n");
		} else {
			const str = s.trimRight();
			if (!str) return "";
			const ind = str[0] === "\n" ? "" : "\t";
			return ind + str.replace(/\n([^\n])/g, "\n\t$1");
		}
	}

	/**
	 *
	 * @param {string|string[]} s string to create prefix for
	 * @param {string} prefix prefix to compose
	 * @returns {string} returns new prefix string
	 */
	static prefix(s, prefix) {
		const str = Template.asString(s).trim();
		if (!str) return "";
		const ind = str[0] === "\n" ? "" : prefix;
		return ind + str.replace(/\n([^\n])/g, "\n" + prefix + "$1");
	}

	/**
	 *
	 * @param {string|string[]} str string or string collection
	 * @returns {string} returns a single string from array
	 */
	static asString(str) {
		if (Array.isArray(str)) {
			return str.join("\n");
		}
		return str;
	}

	/**
	 * @typedef {Object} WithId
	 * @property {string|number} id
	 */

	/**
	 * @param {WithId[]} modules a collection of modules to get array bounds for
	 * @returns {[number, number] | false} returns the upper and lower array bounds
	 * or false if not every module has a number based id
	 */
	static getModulesArrayBounds(modules) {
		let maxId = -Infinity;
		let minId = Infinity;
		for (const module of modules) {
			if (typeof module.id !== "number") return false;
			if (maxId < module.id) maxId = /** @type {number} */ (module.id);
			if (minId > module.id) minId = /** @type {number} */ (module.id);
		}
		if (minId < 16 + ("" + minId).length) {
			// add minId x ',' instead of 'Array(minId).concat(…)'
			minId = 0;
		}
		const objectOverhead = modules
			.map(module => (module.id + "").length + 2)
			.reduce((a, b) => a + b, -1);
		const arrayOverhead =
			minId === 0 ? maxId : 16 + ("" + minId).length + maxId;
		return arrayOverhead < objectOverhead ? [minId, maxId] : false;
	}

	/**
	 * @param {Chunk} chunk chunk whose modules will be rendered
	 * @param {ModuleFilterPredicate} filterFn function used to filter modules from chunk to render
	 * @param {ModuleTemplate} moduleTemplate ModuleTemplate instance used to render modules
	 * @param {TODO | TODO[]} dependencyTemplates templates needed for each module to render dependencies
	 * @param {string=} prefix applying prefix strings
	 * @returns {ConcatSource} rendered chunk modules in a Source object
	 */
	static renderChunkModules(
		chunk,
		filterFn,
		moduleTemplate,
		dependencyTemplates,
		prefix = ""
	) {
		const source = new ConcatSource();
		const modules = chunk.getModules().filter(filterFn);
		let removedModules;
		if (chunk instanceof HotUpdateChunk) {
			removedModules = chunk.removedModules;
		}
		if (
			modules.length === 0 &&
			(!removedModules || removedModules.length === 0)
		) {
			source.add("[]");
			return source;
		}
		/** @type {{id: string|number, source: Source|string}[]} */
		const allModules = modules.map(module => {
			return {
				id: module.id,
				source: moduleTemplate.render(module, dependencyTemplates, {
					chunk
				})
			};
		});
		if (removedModules && removedModules.length > 0) {
			for (const id of removedModules) {
				allModules.push({
					id,
					source: "false"
				});
			}
		}
		const bounds = Template.getModulesArrayBounds(allModules);
		if (bounds) {
			// Render a spare array
			const minId = bounds[0];
			const maxId = bounds[1];
			if (minId !== 0) {
				source.add(`Array(${minId}).concat(`);
			}
			source.add("[\n");
			/** @type {Map<string|number, {id: string|number, source: Source|string}>} */
			const modules = new Map();
			for (const module of allModules) {
				modules.set(module.id, module);
			}
			for (let idx = minId; idx <= maxId; idx++) {
				const module = modules.get(idx);
				if (idx !== minId) {
					source.add(",\n");
				}
				source.add(`/* ${idx} */`);
				if (module) {
					source.add("\n");
					source.add(module.source);
				}
			}
			source.add("\n" + prefix + "]");
			if (minId !== 0) {
				source.add(")");
			}
		} else {
			// Render an object
			source.add("{\n");
			allModules.sort(stringifyIdSortPredicate).forEach((module, idx) => {
				if (idx !== 0) {
					source.add(",\n");
				}
				source.add(`\n/***/ ${JSON.stringify(module.id)}:\n`);
				source.add(module.source);
			});
			source.add(`\n\n${prefix}}`);
		}
		return source;
	}
}

module.exports = Template;


/***/ }),

/***/ 1891:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Jarid Margolin @jaridmargolin
*/


const inspect = __webpack_require__(1669).inspect.custom;

class WebpackError extends Error {
	/**
	 * Creates an instance of WebpackError.
	 * @param {string=} message error message
	 */
	constructor(message) {
		super(message);

		this.details = undefined;
		this.missing = undefined;
		this.origin = undefined;
		this.dependencies = undefined;
		this.module = undefined;

		Error.captureStackTrace(this, this.constructor);
	}

	[inspect]() {
		return this.stack + (this.details ? `\n${this.details}` : "");
	}
}

module.exports = WebpackError;


/***/ }),

/***/ 6043:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/



const AsyncDependencyToInitialChunkError = __webpack_require__(7794);
const GraphHelpers = __webpack_require__(3445);

/** @typedef {import("./AsyncDependenciesBlock")} AsyncDependenciesBlock */
/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./ChunkGroup")} ChunkGroup */
/** @typedef {import("./Compilation")} Compilation */
/** @typedef {import("./DependenciesBlock")} DependenciesBlock */
/** @typedef {import("./Dependency")} Dependency */
/** @typedef {import("./Entrypoint")} Entrypoint */
/** @typedef {import("./Module")} Module */

/**
 * @typedef {Object} QueueItem
 * @property {number} action
 * @property {DependenciesBlock} block
 * @property {Module} module
 * @property {Chunk} chunk
 * @property {ChunkGroup} chunkGroup
 */

/**
 * @typedef {Object} ChunkGroupInfo
 * @property {ChunkGroup} chunkGroup the chunk group
 * @property {Set<Module>} minAvailableModules current minimal set of modules available at this point
 * @property {boolean} minAvailableModulesOwned true, if minAvailableModules is owned and can be modified
 * @property {Set<Module>[]} availableModulesToBeMerged enqueued updates to the minimal set of available modules
 * @property {QueueItem[]} skippedItems queue items that were skipped because module is already available in parent chunks (need to reconsider when minAvailableModules is shrinking)
 * @property {Set<Module>} resultingAvailableModules set of modules available including modules from this chunk group
 * @property {Set<ChunkGroup>} children set of children chunk groups, that will be revisited when availableModules shrink
 */

/**
 * @typedef {Object} ChunkGroupDep
 * @property {AsyncDependenciesBlock} block referencing block
 * @property {ChunkGroup} chunkGroup referenced chunk group
 */

/**
 * @template T
 * @param {Set<T>} a first set
 * @param {Set<T>} b second set
 * @returns {number} cmp
 */
const bySetSize = (a, b) => {
	return b.size - a.size;
};

/**
 * Extracts simplified info from the modules and their dependencies
 * @param {Compilation} compilation the compilation
 * @returns {Map<DependenciesBlock, { modules: Iterable<Module>, blocks: AsyncDependenciesBlock[]}>} the mapping block to modules and inner blocks
 */
const extraceBlockInfoMap = compilation => {
	/** @type {Map<DependenciesBlock, { modules: Iterable<Module>, blocks: AsyncDependenciesBlock[]}>} */
	const blockInfoMap = new Map();

	/**
	 * @param {Dependency} d dependency to iterate over
	 * @returns {void}
	 */
	const iteratorDependency = d => {
		// We skip Dependencies without Reference
		const ref = compilation.getDependencyReference(currentModule, d);
		if (!ref) {
			return;
		}
		// We skip Dependencies without Module pointer
		const refModule = ref.module;
		if (!refModule) {
			return;
		}
		// We skip weak Dependencies
		if (ref.weak) {
			return;
		}

		blockInfoModules.add(refModule);
	};

	/**
	 * @param {AsyncDependenciesBlock} b blocks to prepare
	 * @returns {void}
	 */
	const iteratorBlockPrepare = b => {
		blockInfoBlocks.push(b);
		blockQueue.push(b);
	};

	/** @type {Module} */
	let currentModule;
	/** @type {DependenciesBlock} */
	let block;
	/** @type {DependenciesBlock[]} */
	let blockQueue;
	/** @type {Set<Module>} */
	let blockInfoModules;
	/** @type {AsyncDependenciesBlock[]} */
	let blockInfoBlocks;

	for (const module of compilation.modules) {
		blockQueue = [module];
		currentModule = module;
		while (blockQueue.length > 0) {
			block = blockQueue.pop();
			blockInfoModules = new Set();
			blockInfoBlocks = [];

			if (block.variables) {
				for (const variable of block.variables) {
					for (const dep of variable.dependencies) iteratorDependency(dep);
				}
			}

			if (block.dependencies) {
				for (const dep of block.dependencies) iteratorDependency(dep);
			}

			if (block.blocks) {
				for (const b of block.blocks) iteratorBlockPrepare(b);
			}

			const blockInfo = {
				modules: blockInfoModules,
				blocks: blockInfoBlocks
			};
			blockInfoMap.set(block, blockInfo);
		}
	}

	return blockInfoMap;
};

/**
 *
 * @param {Compilation} compilation the compilation
 * @param {Entrypoint[]} inputChunkGroups input groups
 * @param {Map<ChunkGroup, ChunkGroupInfo>} chunkGroupInfoMap mapping from chunk group to available modules
 * @param {Map<ChunkGroup, ChunkGroupDep[]>} chunkDependencies dependencies for chunk groups
 * @param {Set<DependenciesBlock>} blocksWithNestedBlocks flag for blocks that have nested blocks
 * @param {Set<ChunkGroup>} allCreatedChunkGroups filled with all chunk groups that are created here
 */
const visitModules = (
	compilation,
	inputChunkGroups,
	chunkGroupInfoMap,
	chunkDependencies,
	blocksWithNestedBlocks,
	allCreatedChunkGroups
) => {
	const logger = compilation.getLogger("webpack.buildChunkGraph.visitModules");
	const { namedChunkGroups } = compilation;

	logger.time("prepare");
	const blockInfoMap = extraceBlockInfoMap(compilation);

	/** @type {Map<ChunkGroup, { index: number, index2: number }>} */
	const chunkGroupCounters = new Map();
	for (const chunkGroup of inputChunkGroups) {
		chunkGroupCounters.set(chunkGroup, {
			index: 0,
			index2: 0
		});
	}

	let nextFreeModuleIndex = 0;
	let nextFreeModuleIndex2 = 0;

	/** @type {Map<DependenciesBlock, ChunkGroup>} */
	const blockChunkGroups = new Map();

	const ADD_AND_ENTER_MODULE = 0;
	const ENTER_MODULE = 1;
	const PROCESS_BLOCK = 2;
	const LEAVE_MODULE = 3;

	/**
	 * @param {QueueItem[]} queue the queue array (will be mutated)
	 * @param {ChunkGroup} chunkGroup chunk group
	 * @returns {QueueItem[]} the queue array again
	 */
	const reduceChunkGroupToQueueItem = (queue, chunkGroup) => {
		for (const chunk of chunkGroup.chunks) {
			const module = chunk.entryModule;
			queue.push({
				action: ENTER_MODULE,
				block: module,
				module,
				chunk,
				chunkGroup
			});
		}
		chunkGroupInfoMap.set(chunkGroup, {
			chunkGroup,
			minAvailableModules: new Set(),
			minAvailableModulesOwned: true,
			availableModulesToBeMerged: [],
			skippedItems: [],
			resultingAvailableModules: undefined,
			children: undefined
		});
		return queue;
	};

	// Start with the provided modules/chunks
	/** @type {QueueItem[]} */
	let queue = inputChunkGroups
		.reduce(reduceChunkGroupToQueueItem, [])
		.reverse();
	/** @type {Map<ChunkGroup, Set<ChunkGroup>>} */
	const queueConnect = new Map();
	/** @type {Set<ChunkGroupInfo>} */
	const outdatedChunkGroupInfo = new Set();
	/** @type {QueueItem[]} */
	let queueDelayed = [];

	logger.timeEnd("prepare");

	/** @type {Module} */
	let module;
	/** @type {Chunk} */
	let chunk;
	/** @type {ChunkGroup} */
	let chunkGroup;
	/** @type {DependenciesBlock} */
	let block;
	/** @type {Set<Module>} */
	let minAvailableModules;
	/** @type {QueueItem[]} */
	let skippedItems;

	// For each async Block in graph
	/**
	 * @param {AsyncDependenciesBlock} b iterating over each Async DepBlock
	 * @returns {void}
	 */
	const iteratorBlock = b => {
		// 1. We create a chunk for this Block
		// but only once (blockChunkGroups map)
		let c = blockChunkGroups.get(b);
		if (c === undefined) {
			c = namedChunkGroups.get(b.chunkName);
			if (c && c.isInitial()) {
				compilation.errors.push(
					new AsyncDependencyToInitialChunkError(b.chunkName, module, b.loc)
				);
				c = chunkGroup;
			} else {
				c = compilation.addChunkInGroup(
					b.groupOptions || b.chunkName,
					module,
					b.loc,
					b.request
				);
				chunkGroupCounters.set(c, { index: 0, index2: 0 });
				blockChunkGroups.set(b, c);
				allCreatedChunkGroups.add(c);
			}
		} else {
			// TODO webpack 5 remove addOptions check
			if (c.addOptions) c.addOptions(b.groupOptions);
			c.addOrigin(module, b.loc, b.request);
		}

		// 2. We store the Block+Chunk mapping as dependency for the chunk
		let deps = chunkDependencies.get(chunkGroup);
		if (!deps) chunkDependencies.set(chunkGroup, (deps = []));
		deps.push({
			block: b,
			chunkGroup: c
		});

		// 3. We create/update the chunk group info
		let connectList = queueConnect.get(chunkGroup);
		if (connectList === undefined) {
			connectList = new Set();
			queueConnect.set(chunkGroup, connectList);
		}
		connectList.add(c);

		// 4. We enqueue the DependenciesBlock for traversal
		queueDelayed.push({
			action: PROCESS_BLOCK,
			block: b,
			module: module,
			chunk: c.chunks[0],
			chunkGroup: c
		});
	};

	// Iterative traversal of the Module graph
	// Recursive would be simpler to write but could result in Stack Overflows
	while (queue.length) {
		logger.time("visiting");
		while (queue.length) {
			const queueItem = queue.pop();
			module = queueItem.module;
			block = queueItem.block;
			chunk = queueItem.chunk;
			if (chunkGroup !== queueItem.chunkGroup) {
				chunkGroup = queueItem.chunkGroup;
				const chunkGroupInfo = chunkGroupInfoMap.get(chunkGroup);
				minAvailableModules = chunkGroupInfo.minAvailableModules;
				skippedItems = chunkGroupInfo.skippedItems;
			}

			switch (queueItem.action) {
				case ADD_AND_ENTER_MODULE: {
					if (minAvailableModules.has(module)) {
						// already in parent chunks
						// skip it for now, but enqueue for rechecking when minAvailableModules shrinks
						skippedItems.push(queueItem);
						break;
					}
					// We connect Module and Chunk when not already done
					if (chunk.addModule(module)) {
						module.addChunk(chunk);
					} else {
						// already connected, skip it
						break;
					}
				}
				// fallthrough
				case ENTER_MODULE: {
					if (chunkGroup !== undefined) {
						const index = chunkGroup.getModuleIndex(module);
						if (index === undefined) {
							chunkGroup.setModuleIndex(
								module,
								chunkGroupCounters.get(chunkGroup).index++
							);
						}
					}

					if (module.index === null) {
						module.index = nextFreeModuleIndex++;
					}

					queue.push({
						action: LEAVE_MODULE,
						block,
						module,
						chunk,
						chunkGroup
					});
				}
				// fallthrough
				case PROCESS_BLOCK: {
					// get prepared block info
					const blockInfo = blockInfoMap.get(block);

					// Buffer items because order need to be reverse to get indicies correct
					const skipBuffer = [];
					const queueBuffer = [];
					// Traverse all referenced modules
					for (const refModule of blockInfo.modules) {
						if (chunk.containsModule(refModule)) {
							// skip early if already connected
							continue;
						}
						if (minAvailableModules.has(refModule)) {
							// already in parent chunks, skip it for now
							skipBuffer.push({
								action: ADD_AND_ENTER_MODULE,
								block: refModule,
								module: refModule,
								chunk,
								chunkGroup
							});
							continue;
						}
						// enqueue the add and enter to enter in the correct order
						// this is relevant with circular dependencies
						queueBuffer.push({
							action: ADD_AND_ENTER_MODULE,
							block: refModule,
							module: refModule,
							chunk,
							chunkGroup
						});
					}
					// Add buffered items in reversed order
					for (let i = skipBuffer.length - 1; i >= 0; i--) {
						skippedItems.push(skipBuffer[i]);
					}
					for (let i = queueBuffer.length - 1; i >= 0; i--) {
						queue.push(queueBuffer[i]);
					}

					// Traverse all Blocks
					for (const block of blockInfo.blocks) iteratorBlock(block);

					if (blockInfo.blocks.length > 0 && module !== block) {
						blocksWithNestedBlocks.add(block);
					}
					break;
				}
				case LEAVE_MODULE: {
					if (chunkGroup !== undefined) {
						const index = chunkGroup.getModuleIndex2(module);
						if (index === undefined) {
							chunkGroup.setModuleIndex2(
								module,
								chunkGroupCounters.get(chunkGroup).index2++
							);
						}
					}

					if (module.index2 === null) {
						module.index2 = nextFreeModuleIndex2++;
					}
					break;
				}
			}
		}
		logger.timeEnd("visiting");

		while (queueConnect.size > 0) {
			logger.time("calculating available modules");

			// Figure out new parents for chunk groups
			// to get new available modules for these children
			for (const [chunkGroup, targets] of queueConnect) {
				const info = chunkGroupInfoMap.get(chunkGroup);
				let minAvailableModules = info.minAvailableModules;

				// 1. Create a new Set of available modules at this points
				const resultingAvailableModules = new Set(minAvailableModules);
				for (const chunk of chunkGroup.chunks) {
					for (const m of chunk.modulesIterable) {
						resultingAvailableModules.add(m);
					}
				}
				info.resultingAvailableModules = resultingAvailableModules;
				if (info.children === undefined) {
					info.children = targets;
				} else {
					for (const target of targets) {
						info.children.add(target);
					}
				}

				// 2. Update chunk group info
				for (const target of targets) {
					let chunkGroupInfo = chunkGroupInfoMap.get(target);
					if (chunkGroupInfo === undefined) {
						chunkGroupInfo = {
							chunkGroup: target,
							minAvailableModules: undefined,
							minAvailableModulesOwned: undefined,
							availableModulesToBeMerged: [],
							skippedItems: [],
							resultingAvailableModules: undefined,
							children: undefined
						};
						chunkGroupInfoMap.set(target, chunkGroupInfo);
					}
					chunkGroupInfo.availableModulesToBeMerged.push(
						resultingAvailableModules
					);
					outdatedChunkGroupInfo.add(chunkGroupInfo);
				}
			}
			queueConnect.clear();
			logger.timeEnd("calculating available modules");

			if (outdatedChunkGroupInfo.size > 0) {
				logger.time("merging available modules");
				// Execute the merge
				for (const info of outdatedChunkGroupInfo) {
					const availableModulesToBeMerged = info.availableModulesToBeMerged;
					let cachedMinAvailableModules = info.minAvailableModules;

					// 1. Get minimal available modules
					// It doesn't make sense to traverse a chunk again with more available modules.
					// This step calculates the minimal available modules and skips traversal when
					// the list didn't shrink.
					if (availableModulesToBeMerged.length > 1) {
						availableModulesToBeMerged.sort(bySetSize);
					}
					let changed = false;
					for (const availableModules of availableModulesToBeMerged) {
						if (cachedMinAvailableModules === undefined) {
							cachedMinAvailableModules = availableModules;
							info.minAvailableModules = cachedMinAvailableModules;
							info.minAvailableModulesOwned = false;
							changed = true;
						} else {
							if (info.minAvailableModulesOwned) {
								// We own it and can modify it
								for (const m of cachedMinAvailableModules) {
									if (!availableModules.has(m)) {
										cachedMinAvailableModules.delete(m);
										changed = true;
									}
								}
							} else {
								for (const m of cachedMinAvailableModules) {
									if (!availableModules.has(m)) {
										// cachedMinAvailableModules need to be modified
										// but we don't own it
										// construct a new Set as intersection of cachedMinAvailableModules and availableModules
										/** @type {Set<Module>} */
										const newSet = new Set();
										const iterator = cachedMinAvailableModules[
											Symbol.iterator
										]();
										/** @type {IteratorResult<Module>} */
										let it;
										while (!(it = iterator.next()).done) {
											const module = it.value;
											if (module === m) break;
											newSet.add(module);
										}
										while (!(it = iterator.next()).done) {
											const module = it.value;
											if (availableModules.has(module)) {
												newSet.add(module);
											}
										}
										cachedMinAvailableModules = newSet;
										info.minAvailableModulesOwned = true;
										info.minAvailableModules = newSet;

										// Update the cache from the first queue
										// if the chunkGroup is currently cached
										if (chunkGroup === info.chunkGroup) {
											minAvailableModules = cachedMinAvailableModules;
										}

										changed = true;
										break;
									}
								}
							}
						}
					}
					availableModulesToBeMerged.length = 0;
					if (!changed) continue;

					// 2. Reconsider skipped items
					for (const queueItem of info.skippedItems) {
						queue.push(queueItem);
					}
					info.skippedItems.length = 0;

					// 3. Reconsider children chunk groups
					if (info.children !== undefined) {
						const chunkGroup = info.chunkGroup;
						for (const c of info.children) {
							let connectList = queueConnect.get(chunkGroup);
							if (connectList === undefined) {
								connectList = new Set();
								queueConnect.set(chunkGroup, connectList);
							}
							connectList.add(c);
						}
					}
				}
				outdatedChunkGroupInfo.clear();
				logger.timeEnd("merging available modules");
			}
		}

		// Run queueDelayed when all items of the queue are processed
		// This is important to get the global indicing correct
		// Async blocks should be processed after all sync blocks are processed
		if (queue.length === 0) {
			const tempQueue = queue;
			queue = queueDelayed.reverse();
			queueDelayed = tempQueue;
		}
	}
};

/**
 *
 * @param {Set<DependenciesBlock>} blocksWithNestedBlocks flag for blocks that have nested blocks
 * @param {Map<ChunkGroup, ChunkGroupDep[]>} chunkDependencies dependencies for chunk groups
 * @param {Map<ChunkGroup, ChunkGroupInfo>} chunkGroupInfoMap mapping from chunk group to available modules
 */
const connectChunkGroups = (
	blocksWithNestedBlocks,
	chunkDependencies,
	chunkGroupInfoMap
) => {
	/** @type {Set<Module>} */
	let resultingAvailableModules;

	/**
	 * Helper function to check if all modules of a chunk are available
	 *
	 * @param {ChunkGroup} chunkGroup the chunkGroup to scan
	 * @param {Set<Module>} availableModules the comparitor set
	 * @returns {boolean} return true if all modules of a chunk are available
	 */
	const areModulesAvailable = (chunkGroup, availableModules) => {
		for (const chunk of chunkGroup.chunks) {
			for (const module of chunk.modulesIterable) {
				if (!availableModules.has(module)) return false;
			}
		}
		return true;
	};

	// For each edge in the basic chunk graph
	/**
	 * @param {ChunkGroupDep} dep the dependency used for filtering
	 * @returns {boolean} used to filter "edges" (aka Dependencies) that were pointing
	 * to modules that are already available. Also filters circular dependencies in the chunks graph
	 */
	const filterFn = dep => {
		const depChunkGroup = dep.chunkGroup;
		// TODO is this needed?
		if (blocksWithNestedBlocks.has(dep.block)) return true;
		if (areModulesAvailable(depChunkGroup, resultingAvailableModules)) {
			return false; // break all modules are already available
		}
		return true;
	};

	// For all deps, check if chunk groups need to be connected
	for (const [chunkGroup, deps] of chunkDependencies) {
		if (deps.length === 0) continue;

		// 1. Get info from chunk group info map
		const info = chunkGroupInfoMap.get(chunkGroup);
		resultingAvailableModules = info.resultingAvailableModules;

		// 2. Foreach edge
		for (let i = 0; i < deps.length; i++) {
			const dep = deps[i];

			// Filter inline, rather than creating a new array from `.filter()`
			// TODO check if inlining filterFn makes sense here
			if (!filterFn(dep)) {
				continue;
			}
			const depChunkGroup = dep.chunkGroup;
			const depBlock = dep.block;

			// 5. Connect block with chunk
			GraphHelpers.connectDependenciesBlockAndChunkGroup(
				depBlock,
				depChunkGroup
			);

			// 6. Connect chunk with parent
			GraphHelpers.connectChunkGroupParentAndChild(chunkGroup, depChunkGroup);
		}
	}
};

/**
 * Remove all unconnected chunk groups
 * @param {Compilation} compilation the compilation
 * @param {Iterable<ChunkGroup>} allCreatedChunkGroups all chunk groups that where created before
 */
const cleanupUnconnectedGroups = (compilation, allCreatedChunkGroups) => {
	for (const chunkGroup of allCreatedChunkGroups) {
		if (chunkGroup.getNumberOfParents() === 0) {
			for (const chunk of chunkGroup.chunks) {
				const idx = compilation.chunks.indexOf(chunk);
				if (idx >= 0) compilation.chunks.splice(idx, 1);
				chunk.remove("unconnected");
			}
			chunkGroup.remove("unconnected");
		}
	}
};

/**
 * This method creates the Chunk graph from the Module graph
 * @param {Compilation} compilation the compilation
 * @param {Entrypoint[]} inputChunkGroups chunk groups which are processed
 * @returns {void}
 */
const buildChunkGraph = (compilation, inputChunkGroups) => {
	// SHARED STATE

	/** @type {Map<ChunkGroup, ChunkGroupDep[]>} */
	const chunkDependencies = new Map();

	/** @type {Set<ChunkGroup>} */
	const allCreatedChunkGroups = new Set();

	/** @type {Map<ChunkGroup, ChunkGroupInfo>} */
	const chunkGroupInfoMap = new Map();

	/** @type {Set<DependenciesBlock>} */
	const blocksWithNestedBlocks = new Set();

	// PART ONE

	visitModules(
		compilation,
		inputChunkGroups,
		chunkGroupInfoMap,
		chunkDependencies,
		blocksWithNestedBlocks,
		allCreatedChunkGroups
	);

	// PART TWO

	connectChunkGroups(
		blocksWithNestedBlocks,
		chunkDependencies,
		chunkGroupInfoMap
	);

	// Cleaup work

	cleanupUnconnectedGroups(compilation, allCreatedChunkGroups);
};

module.exports = buildChunkGraph;


/***/ }),

/***/ 2536:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


/** @typedef {import("./Dependency").DependencyLocation} DependencyLocation */

// TODO webpack 5 remove string type from a and b
/**
 * Compare two locations
 * @param {string|DependencyLocation} a A location node
 * @param {string|DependencyLocation} b A location node
 * @returns {-1|0|1} sorting comparator value
 */
module.exports = (a, b) => {
	if (typeof a === "string") {
		if (typeof b === "string") {
			if (a < b) return -1;
			if (a > b) return 1;
			return 0;
		} else if (typeof b === "object") {
			return 1;
		} else {
			return 0;
		}
	} else if (typeof a === "object") {
		if (typeof b === "string") {
			return -1;
		} else if (typeof b === "object") {
			if ("start" in a && "start" in b) {
				const ap = a.start;
				const bp = b.start;
				if (ap.line < bp.line) return -1;
				if (ap.line > bp.line) return 1;
				if (ap.column < bp.column) return -1;
				if (ap.column > bp.column) return 1;
			}
			if ("name" in a && "name" in b) {
				if (a.name < b.name) return -1;
				if (a.name > b.name) return 1;
			}
			if ("index" in a && "index" in b) {
				if (a.index < b.index) return -1;
				if (a.index > b.index) return 1;
			}
			return 0;
		} else {
			return 0;
		}
	}
};


/***/ }),

/***/ 9440:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Florent Cailhol @ooflorent
*/


/** @typedef {import("../Module")} Module */

class DependencyReference {
	// TODO webpack 5: module must be dynamic, you must pass a function returning a module
	// This is needed to remove the hack in ConcatenatedModule
	// The problem is that the `module` in Dependency could be replaced i. e. because of Scope Hoisting
	/**
	 *
	 * @param {Module} module the referenced module
	 * @param {string[] | boolean} importedNames imported named from the module
	 * @param {boolean=} weak if this is a weak reference
	 * @param {number} order the order information or NaN if don't care
	 */
	constructor(module, importedNames, weak = false, order = NaN) {
		// TODO webpack 5: make it a getter
		this.module = module;
		// true: full object
		// false: only sideeffects/no export
		// array of strings: the exports with this names
		this.importedNames = importedNames;
		this.weak = !!weak;
		this.order = order;
	}

	/**
	 * @param {DependencyReference[]} array an array (will be modified)
	 * @returns {DependencyReference[]} the array again
	 */
	static sort(array) {
		/** @type {WeakMap<DependencyReference, number>} */
		const originalOrder = new WeakMap();
		let i = 0;
		for (const ref of array) {
			originalOrder.set(ref, i++);
		}
		return array.sort((a, b) => {
			const aOrder = a.order;
			const bOrder = b.order;
			if (isNaN(aOrder)) {
				if (!isNaN(bOrder)) {
					return 1;
				}
			} else {
				if (isNaN(bOrder)) {
					return -1;
				}
				if (aOrder !== bOrder) {
					return aOrder - bOrder;
				}
			}
			const aOrg = originalOrder.get(a);
			const bOrg = originalOrder.get(b);
			return aOrg - bOrg;
		});
	}
}

module.exports = DependencyReference;


/***/ }),

/***/ 6002:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

const Dependency = __webpack_require__(9821);

class ModuleDependency extends Dependency {
	/**
	 * @param {string} request request path which needs resolving
	 */
	constructor(request) {
		super();
		this.request = request;
		this.userRequest = request;
	}

	getResourceIdentifier() {
		return `module${this.request}`;
	}
}

module.exports = ModuleDependency;


/***/ }),

/***/ 7929:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/



/** @typedef {import("./Dependency").DependencyLocation} DependencyLocation */
/** @typedef {import("./Dependency").SourcePosition} SourcePosition */

// TODO webpack 5: pos must be SourcePosition
/**
 * @param {SourcePosition|DependencyLocation|string} pos position
 * @returns {string} formatted position
 */
const formatPosition = pos => {
	if (pos === null) return "";
	// TODO webpack 5: Simplify this
	if (typeof pos === "string") return pos;
	if (typeof pos === "number") return `${pos}`;
	if (typeof pos === "object") {
		if ("line" in pos && "column" in pos) {
			return `${pos.line}:${pos.column}`;
		} else if ("line" in pos) {
			return `${pos.line}:?`;
		} else if ("index" in pos) {
			// TODO webpack 5 remove this case
			return `+${pos.index}`;
		} else {
			return "";
		}
	}
	return "";
};

// TODO webpack 5: loc must be DependencyLocation
/**
 * @param {DependencyLocation|SourcePosition|string} loc location
 * @returns {string} formatted location
 */
const formatLocation = loc => {
	if (loc === null) return "";
	// TODO webpack 5: Simplify this
	if (typeof loc === "string") return loc;
	if (typeof loc === "number") return `${loc}`;
	if (typeof loc === "object") {
		if ("start" in loc && loc.start && "end" in loc && loc.end) {
			if (
				typeof loc.start === "object" &&
				typeof loc.start.line === "number" &&
				typeof loc.end === "object" &&
				typeof loc.end.line === "number" &&
				typeof loc.end.column === "number" &&
				loc.start.line === loc.end.line
			) {
				return `${formatPosition(loc.start)}-${loc.end.column}`;
			} else {
				return `${formatPosition(loc.start)}-${formatPosition(loc.end)}`;
			}
		}
		if ("start" in loc && loc.start) {
			return formatPosition(loc.start);
		}
		if ("name" in loc && "index" in loc) {
			return `${loc.name}[${loc.index}]`;
		}
		if ("name" in loc) {
			return loc.name;
		}
		return formatPosition(loc);
	}
	return "";
};

module.exports = formatLocation;


/***/ }),

/***/ 7225:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Tobias Koppers @sokra
 */



const LogType = Object.freeze({
	error: /** @type {"error"} */ ("error"), // message, c style arguments
	warn: /** @type {"warn"} */ ("warn"), // message, c style arguments
	info: /** @type {"info"} */ ("info"), // message, c style arguments
	log: /** @type {"log"} */ ("log"), // message, c style arguments
	debug: /** @type {"debug"} */ ("debug"), // message, c style arguments

	trace: /** @type {"trace"} */ ("trace"), // no arguments

	group: /** @type {"group"} */ ("group"), // [label]
	groupCollapsed: /** @type {"groupCollapsed"} */ ("groupCollapsed"), // [label]
	groupEnd: /** @type {"groupEnd"} */ ("groupEnd"), // [label]

	profile: /** @type {"profile"} */ ("profile"), // [profileName]
	profileEnd: /** @type {"profileEnd"} */ ("profileEnd"), // [profileName]

	time: /** @type {"time"} */ ("time"), // name, time as [seconds, nanoseconds]

	clear: /** @type {"clear"} */ ("clear"), // no arguments
	status: /** @type {"status"} */ ("status") // message, arguments
});

exports.LogType = LogType;

/** @typedef {typeof LogType[keyof typeof LogType]} LogTypeEnum */

const LOG_SYMBOL = Symbol("webpack logger raw log method");
const TIMERS_SYMBOL = Symbol("webpack logger times");

class WebpackLogger {
	/**
	 * @param {function(LogTypeEnum, any[]=): void} log log function
	 */
	constructor(log) {
		this[LOG_SYMBOL] = log;
	}

	error(...args) {
		this[LOG_SYMBOL](LogType.error, args);
	}

	warn(...args) {
		this[LOG_SYMBOL](LogType.warn, args);
	}

	info(...args) {
		this[LOG_SYMBOL](LogType.info, args);
	}

	log(...args) {
		this[LOG_SYMBOL](LogType.log, args);
	}

	debug(...args) {
		this[LOG_SYMBOL](LogType.debug, args);
	}

	assert(assertion, ...args) {
		if (!assertion) {
			this[LOG_SYMBOL](LogType.error, args);
		}
	}

	trace() {
		this[LOG_SYMBOL](LogType.trace, ["Trace"]);
	}

	clear() {
		this[LOG_SYMBOL](LogType.clear);
	}

	status(...args) {
		this[LOG_SYMBOL](LogType.status, args);
	}

	group(...args) {
		this[LOG_SYMBOL](LogType.group, args);
	}

	groupCollapsed(...args) {
		this[LOG_SYMBOL](LogType.groupCollapsed, args);
	}

	groupEnd(...args) {
		this[LOG_SYMBOL](LogType.groupEnd, args);
	}

	profile(label) {
		this[LOG_SYMBOL](LogType.profile, [label]);
	}

	profileEnd(label) {
		this[LOG_SYMBOL](LogType.profileEnd, [label]);
	}

	time(label) {
		this[TIMERS_SYMBOL] = this[TIMERS_SYMBOL] || new Map();
		this[TIMERS_SYMBOL].set(label, process.hrtime());
	}

	timeLog(label) {
		const prev = this[TIMERS_SYMBOL] && this[TIMERS_SYMBOL].get(label);
		if (!prev) {
			throw new Error(`No such label '${label}' for WebpackLogger.timeLog()`);
		}
		const time = process.hrtime(prev);
		this[LOG_SYMBOL](LogType.time, [label, ...time]);
	}

	timeEnd(label) {
		const prev = this[TIMERS_SYMBOL] && this[TIMERS_SYMBOL].get(label);
		if (!prev) {
			throw new Error(`No such label '${label}' for WebpackLogger.timeEnd()`);
		}
		const time = process.hrtime(prev);
		this[TIMERS_SYMBOL].delete(label);
		this[LOG_SYMBOL](LogType.time, [label, ...time]);
	}
}

exports.Logger = WebpackLogger;


/***/ }),

/***/ 4796:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


class Semaphore {
	/**
	 * Creates an instance of Semaphore.
	 *
	 * @param {number} available the amount available number of "tasks"
	 * in the Semaphore
	 */
	constructor(available) {
		this.available = available;
		/** @type {(function(): void)[]} */
		this.waiters = [];
		/** @private */
		this._continue = this._continue.bind(this);
	}

	/**
	 * @param {function(): void} callback function block to capture and run
	 * @returns {void}
	 */
	acquire(callback) {
		if (this.available > 0) {
			this.available--;
			callback();
		} else {
			this.waiters.push(callback);
		}
	}

	release() {
		this.available++;
		if (this.waiters.length > 0) {
			process.nextTick(this._continue);
		}
	}

	_continue() {
		if (this.available > 0) {
			if (this.waiters.length > 0) {
				this.available--;
				const callback = this.waiters.pop();
				callback();
			}
		}
	}
}

module.exports = Semaphore;


/***/ }),

/***/ 4791:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
var __webpack_unused_export__;


/**
 * intersect creates Set containing the intersection of elements between all sets
 * @param {Set[]} sets an array of sets being checked for shared elements
 * @returns {Set<TODO>} returns a new Set containing the intersecting items
 */
const intersect = sets => {
	if (sets.length === 0) return new Set();
	if (sets.length === 1) return new Set(sets[0]);
	let minSize = Infinity;
	let minIndex = -1;
	for (let i = 0; i < sets.length; i++) {
		const size = sets[i].size;
		if (size < minSize) {
			minIndex = i;
			minSize = size;
		}
	}
	const current = new Set(sets[minIndex]);
	for (let i = 0; i < sets.length; i++) {
		if (i === minIndex) continue;
		const set = sets[i];
		for (const item of current) {
			if (!set.has(item)) {
				current.delete(item);
			}
		}
	}
	return current;
};

/**
 * Checks if a set is the subset of another set
 * @param {Set<TODO>} bigSet a Set which contains the original elements to compare against
 * @param {Set<TODO>} smallSet the set whos elements might be contained inside of bigSet
 * @returns {boolean} returns true if smallSet contains all elements inside of the bigSet
 */
const isSubset = (bigSet, smallSet) => {
	if (bigSet.size < smallSet.size) return false;
	for (const item of smallSet) {
		if (!bigSet.has(item)) return false;
	}
	return true;
};

exports.w = intersect;
__webpack_unused_export__ = isSubset;


/***/ }),

/***/ 3875:
/***/ ((module) => {

"use strict";


/**
 * A subset of Set that offers sorting functionality
 * @template T item type in set
 * @extends {Set<T>}
 */
class SortableSet extends Set {
	/**
	 * Create a new sortable set
	 * @param {Iterable<T>=} initialIterable The initial iterable value
	 * @typedef {function(T, T): number} SortFunction
	 * @param {SortFunction=} defaultSort Default sorting function
	 */
	constructor(initialIterable, defaultSort) {
		super(initialIterable);
		/** @private @type {function(T, T): number}} */
		this._sortFn = defaultSort;
		/** @private @type {function(T, T): number} | null} */
		this._lastActiveSortFn = null;
		/** @private @type {Map<Function, T[]> | undefined} */
		this._cache = undefined;
		/** @private @type {Map<Function, T[]|string|number> | undefined} */
		this._cacheOrderIndependent = undefined;
	}

	/**
	 * @param {T} value value to add to set
	 * @returns {this} returns itself
	 */
	add(value) {
		this._lastActiveSortFn = null;
		this._invalidateCache();
		this._invalidateOrderedCache();
		super.add(value);
		return this;
	}

	/**
	 * @param {T} value value to delete
	 * @returns {boolean} true if value existed in set, false otherwise
	 */
	delete(value) {
		this._invalidateCache();
		this._invalidateOrderedCache();
		return super.delete(value);
	}

	/**
	 * @returns {void}
	 */
	clear() {
		this._invalidateCache();
		this._invalidateOrderedCache();
		return super.clear();
	}

	/**
	 * Sort with a comparer function
	 * @param {SortFunction} sortFn Sorting comparer function
	 * @returns {void}
	 */
	sortWith(sortFn) {
		if (this.size <= 1 || sortFn === this._lastActiveSortFn) {
			// already sorted - nothing to do
			return;
		}

		const sortedArray = Array.from(this).sort(sortFn);
		super.clear();
		for (let i = 0; i < sortedArray.length; i += 1) {
			super.add(sortedArray[i]);
		}
		this._lastActiveSortFn = sortFn;
		this._invalidateCache();
	}

	sort() {
		this.sortWith(this._sortFn);
	}

	/**
	 * Get data from cache
	 * @param {function(SortableSet<T>): T[]} fn function to calculate value
	 * @returns {T[]} returns result of fn(this), cached until set changes
	 */
	getFromCache(fn) {
		if (this._cache === undefined) {
			this._cache = new Map();
		} else {
			const data = this._cache.get(fn);
			if (data !== undefined) {
				return data;
			}
		}
		const newData = fn(this);
		this._cache.set(fn, newData);
		return newData;
	}

	/**
	 * @param {function(SortableSet<T>): string|number|T[]} fn function to calculate value
	 * @returns {any} returns result of fn(this), cached until set changes
	 */
	getFromUnorderedCache(fn) {
		if (this._cacheOrderIndependent === undefined) {
			this._cacheOrderIndependent = new Map();
		} else {
			const data = this._cacheOrderIndependent.get(fn);
			if (data !== undefined) {
				return data;
			}
		}
		const newData = fn(this);
		this._cacheOrderIndependent.set(fn, newData);
		return newData;
	}

	/**
	 * @private
	 * @returns {void}
	 */
	_invalidateCache() {
		if (this._cache !== undefined) {
			this._cache.clear();
		}
	}

	/**
	 * @private
	 * @returns {void}
	 */
	_invalidateOrderedCache() {
		if (this._cacheOrderIndependent !== undefined) {
			this._cacheOrderIndependent.clear();
		}
	}
}

module.exports = SortableSet;


/***/ }),

/***/ 7442:
/***/ ((module, exports, __webpack_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const AbstractMethodError = __webpack_require__(1112);

const BULK_SIZE = 1000;

class Hash {
	/**
	 * Update hash {@link https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding}
	 * @param {string|Buffer} data data
	 * @param {string=} inputEncoding data encoding
	 * @returns {this} updated hash
	 */
	update(data, inputEncoding) {
		throw new AbstractMethodError();
	}

	/**
	 * Calculates the digest {@link https://nodejs.org/api/crypto.html#crypto_hash_digest_encoding}
	 * @param {string=} encoding encoding of the return value
	 * @returns {string|Buffer} digest
	 */
	digest(encoding) {
		throw new AbstractMethodError();
	}
}

exports.Hash = Hash;
/** @typedef {typeof Hash} HashConstructor */

class BulkUpdateDecorator extends Hash {
	/**
	 * @param {Hash} hash hash
	 */
	constructor(hash) {
		super();
		this.hash = hash;
		this.buffer = "";
	}

	/**
	 * Update hash {@link https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding}
	 * @param {string|Buffer} data data
	 * @param {string=} inputEncoding data encoding
	 * @returns {this} updated hash
	 */
	update(data, inputEncoding) {
		if (
			inputEncoding !== undefined ||
			typeof data !== "string" ||
			data.length > BULK_SIZE
		) {
			if (this.buffer.length > 0) {
				this.hash.update(this.buffer);
				this.buffer = "";
			}
			this.hash.update(data, inputEncoding);
		} else {
			this.buffer += data;
			if (this.buffer.length > BULK_SIZE) {
				this.hash.update(this.buffer);
				this.buffer = "";
			}
		}
		return this;
	}

	/**
	 * Calculates the digest {@link https://nodejs.org/api/crypto.html#crypto_hash_digest_encoding}
	 * @param {string=} encoding encoding of the return value
	 * @returns {string|Buffer} digest
	 */
	digest(encoding) {
		if (this.buffer.length > 0) {
			this.hash.update(this.buffer);
		}
		var digestResult = this.hash.digest(encoding);
		return typeof digestResult === "string"
			? digestResult
			: digestResult.toString();
	}
}

/**
 * istanbul ignore next
 */
class DebugHash extends Hash {
	constructor() {
		super();
		this.string = "";
	}

	/**
	 * Update hash {@link https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding}
	 * @param {string|Buffer} data data
	 * @param {string=} inputEncoding data encoding
	 * @returns {this} updated hash
	 */
	update(data, inputEncoding) {
		if (typeof data !== "string") data = data.toString("utf-8");
		this.string += data;
		return this;
	}

	/**
	 * Calculates the digest {@link https://nodejs.org/api/crypto.html#crypto_hash_digest_encoding}
	 * @param {string=} encoding encoding of the return value
	 * @returns {string|Buffer} digest
	 */
	digest(encoding) {
		return this.string.replace(/[^a-z0-9]+/gi, m =>
			Buffer.from(m).toString("hex")
		);
	}
}

/**
 * Creates a hash by name or function
 * @param {string | HashConstructor} algorithm the algorithm name or a constructor creating a hash
 * @returns {Hash} the hash
 */
module.exports = algorithm => {
	if (typeof algorithm === "function") {
		return new BulkUpdateDecorator(new algorithm());
	}
	switch (algorithm) {
		// TODO add non-cryptographic algorithm here
		case "debug":
			return new DebugHash();
		default:
			return new BulkUpdateDecorator(__webpack_require__(6417).createHash(algorithm));
	}
};


/***/ }),

/***/ 8540:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

const path = __webpack_require__(5622);

/**
 * @param {string} context context for relative path
 * @param {string} relativePath path
 * @returns {string} absolute path
 */
const requestToAbsolute = (context, relativePath) => {
	if (relativePath.startsWith("./") || relativePath.startsWith("../"))
		return path.join(context, relativePath);
	return relativePath;
};

/**
 * @typedef {Object} MakeRelativePathsCache
 * @property {Map<string, Map<string, string>>=} relativePaths
 */

/**
 *
 * @param {string} maybeAbsolutePath path to check
 * @returns {boolean} returns true if path is "Absolute Path"-like
 */
const looksLikeAbsolutePath = maybeAbsolutePath => {
	if (/^\/.*\/$/.test(maybeAbsolutePath)) {
		// this 'path' is actually a regexp generated by dynamic requires.
		// Don't treat it as an absolute path.
		return false;
	}
	return /^(?:[a-z]:\\|\/)/i.test(maybeAbsolutePath);
};

/**
 *
 * @param {string} p path to normalize
 * @returns {string} normalized version of path
 */
const normalizePathSeparator = p => p.replace(/\\/g, "/");

/**
 *
 * @param {string} context context for relative path
 * @param {string} identifier identifier for path
 * @returns {string} a converted relative path
 */
const _makePathsRelative = (context, identifier) => {
	return identifier
		.split(/([|! ])/)
		.map(str =>
			looksLikeAbsolutePath(str)
				? normalizePathSeparator(path.relative(context, str))
				: str
		)
		.join("");
};

/**
 *
 * @param {string} context context used to create relative path
 * @param {string} identifier identifier used to create relative path
 * @param {MakeRelativePathsCache=} cache the cache object being set
 * @returns {string} the returned relative path
 */
exports.makePathsRelative = (context, identifier, cache) => {
	if (!cache) return _makePathsRelative(context, identifier);

	const relativePaths =
		cache.relativePaths || (cache.relativePaths = new Map());

	let cachedResult;
	let contextCache = relativePaths.get(context);
	if (contextCache === undefined) {
		relativePaths.set(context, (contextCache = new Map()));
	} else {
		cachedResult = contextCache.get(identifier);
	}

	if (cachedResult !== undefined) {
		return cachedResult;
	} else {
		const relativePath = _makePathsRelative(context, identifier);
		contextCache.set(identifier, relativePath);
		return relativePath;
	}
};

/**
 * @param {string} context absolute context path
 * @param {string} request any request string may containing absolute paths, query string, etc.
 * @returns {string} a new request string avoiding absolute paths when possible
 */
exports.contextify = (context, request) => {
	return request
		.split("!")
		.map(r => {
			const splitPath = r.split("?", 2);
			if (/^[a-zA-Z]:\\/.test(splitPath[0])) {
				splitPath[0] = path.win32.relative(context, splitPath[0]);
				if (!/^[a-zA-Z]:\\/.test(splitPath[0])) {
					splitPath[0] = splitPath[0].replace(/\\/g, "/");
				}
			}
			if (/^\//.test(splitPath[0])) {
				splitPath[0] = path.posix.relative(context, splitPath[0]);
			}
			if (!/^(\.\.\/|\/|[a-zA-Z]:\\)/.test(splitPath[0])) {
				splitPath[0] = "./" + splitPath[0];
			}
			return splitPath.join("?");
		})
		.join("!");
};

/**
 * @param {string} context absolute context path
 * @param {string} request any request string
 * @returns {string} a new request string using absolute paths when possible
 */
const _absolutify = (context, request) => {
	return request
		.split("!")
		.map(r => requestToAbsolute(context, r))
		.join("!");
};

exports.absolutify = _absolutify;


/***/ }),

/***/ 1840:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"definitions\":{\"Rule\":{\"description\":\"Filtering rule as regex or string.\",\"anyOf\":[{\"instanceof\":\"RegExp\",\"tsType\":\"RegExp\"},{\"type\":\"string\",\"minLength\":1}]},\"Rules\":{\"description\":\"Filtering rules.\",\"anyOf\":[{\"type\":\"array\",\"items\":{\"description\":\"A rule condition.\",\"oneOf\":[{\"$ref\":\"#/definitions/Rule\"}]}},{\"$ref\":\"#/definitions/Rule\"}]}},\"title\":\"TerserPluginOptions\",\"type\":\"object\",\"additionalProperties\":false,\"properties\":{\"test\":{\"description\":\"Include all modules that pass test assertion.\",\"oneOf\":[{\"$ref\":\"#/definitions/Rules\"}]},\"include\":{\"description\":\"Include all modules matching any of these conditions.\",\"oneOf\":[{\"$ref\":\"#/definitions/Rules\"}]},\"exclude\":{\"description\":\"Exclude all modules matching any of these conditions.\",\"oneOf\":[{\"$ref\":\"#/definitions/Rules\"}]},\"cache\":{\"description\":\"Enable file caching. Ignored in webpack 5, for webpack 5 please use https://webpack.js.org/configuration/other-options/#cache.\",\"anyOf\":[{\"type\":\"boolean\"},{\"type\":\"string\"}]},\"cacheKeys\":{\"description\":\"Allows you to override default cache keys. Ignored in webpack 5, for webpack 5 please use https://webpack.js.org/configuration/other-options/#cache.\",\"instanceof\":\"Function\"},\"parallel\":{\"description\":\"Use multi-process parallel running to improve the build speed.\",\"anyOf\":[{\"type\":\"boolean\"},{\"type\":\"integer\"}]},\"sourceMap\":{\"description\":\"Enables/Disables generation of source maps.\",\"type\":\"boolean\"},\"minify\":{\"description\":\"Allows you to override default minify function.\",\"instanceof\":\"Function\"},\"terserOptions\":{\"description\":\"Options for `terser`.\",\"additionalProperties\":true,\"type\":\"object\"},\"extractComments\":{\"description\":\"Whether comments shall be extracted to a separate file.\",\"anyOf\":[{\"type\":\"boolean\"},{\"type\":\"string\"},{\"instanceof\":\"RegExp\"},{\"instanceof\":\"Function\"},{\"additionalProperties\":false,\"properties\":{\"condition\":{\"anyOf\":[{\"type\":\"boolean\"},{\"type\":\"string\"},{\"instanceof\":\"RegExp\"},{\"instanceof\":\"Function\"}]},\"filename\":{\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"Function\"}]},\"banner\":{\"anyOf\":[{\"type\":\"boolean\"},{\"type\":\"string\"},{\"instanceof\":\"Function\"}]}},\"type\":\"object\"}]}}}");

/***/ }),

/***/ 9122:
/***/ ((module) => {

"use strict";
module.exports = {"i8":"4.1.0"};

/***/ }),

/***/ 7861:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"name\":\"terser\",\"description\":\"JavaScript parser, mangler/compressor and beautifier toolkit for ES6+\",\"homepage\":\"https://terser.org\",\"author\":\"Mihai Bazon <mihai.bazon@gmail.com> (http://lisperator.net/)\",\"license\":\"BSD-2-Clause\",\"version\":\"5.1.0\",\"engines\":{\"node\":\">=6.0.0\"},\"maintainers\":[\"Fábio Santos <fabiosantosart@gmail.com>\"],\"repository\":\"https://github.com/terser/terser\",\"main\":\"dist/bundle.min.js\",\"type\":\"module\",\"exports\":{\".\":{\"import\":\"./main.js\",\"require\":\"./dist/bundle.min.js\"},\"./package\":{\"default\":\"./package.json\"},\"./package.json\":{\"default\":\"./package.json\"}},\"types\":\"tools/terser.d.ts\",\"bin\":{\"terser\":\"bin/terser\"},\"files\":[\"bin\",\"dist\",\"lib\",\"tools\",\"LICENSE\",\"README.md\",\"CHANGELOG.md\",\"PATRONS.md\",\"main.js\"],\"dependencies\":{\"commander\":\"^2.20.0\",\"source-map\":\"~0.6.1\",\"source-map-support\":\"~0.5.12\"},\"devDependencies\":{\"@ls-lint/ls-lint\":\"^1.9.2\",\"acorn\":\"^7.4.0\",\"astring\":\"^1.4.1\",\"eslint\":\"^7.0.0\",\"eslump\":\"^2.0.0\",\"esm\":\"^3.2.25\",\"mocha\":\"^8.0.0\",\"pre-commit\":\"^1.2.2\",\"rimraf\":\"^3.0.0\",\"rollup\":\"2.0.6\",\"semver\":\"^7.1.3\"},\"scripts\":{\"test\":\"node test/compress.js && mocha test/mocha\",\"test:compress\":\"node test/compress.js\",\"test:mocha\":\"mocha test/mocha\",\"lint\":\"eslint lib\",\"lint-fix\":\"eslint --fix lib\",\"ls-lint\":\"ls-lint\",\"build\":\"rimraf dist/bundle* && rollup --config --silent\",\"prepare\":\"npm run build\",\"postversion\":\"echo 'Remember to update the changelog!'\"},\"keywords\":[\"uglify\",\"terser\",\"uglify-es\",\"uglify-js\",\"minify\",\"minifier\",\"javascript\",\"ecmascript\",\"es5\",\"es6\",\"es7\",\"es8\",\"es2015\",\"es2016\",\"es2017\",\"async\",\"await\"],\"eslintConfig\":{\"parserOptions\":{\"sourceType\":\"module\",\"ecmaVersion\":\"2020\"},\"env\":{\"node\":true,\"browser\":true,\"es2020\":true},\"globals\":{\"describe\":false,\"it\":false,\"require\":false,\"global\":false,\"process\":false},\"rules\":{\"brace-style\":[\"error\",\"1tbs\",{\"allowSingleLine\":true}],\"quotes\":[\"error\",\"double\",\"avoid-escape\"],\"no-debugger\":\"error\",\"no-undef\":\"error\",\"no-unused-vars\":[\"error\",{\"varsIgnorePattern\":\"^_$\"}],\"no-tabs\":\"error\",\"semi\":[\"error\",\"always\"],\"no-extra-semi\":\"error\",\"no-irregular-whitespace\":\"error\",\"space-before-blocks\":[\"error\",\"always\"]}},\"pre-commit\":[\"lint-fix\",\"ls-lint\",\"test\"]}");

/***/ }),

/***/ 1618:
/***/ ((module) => {

"use strict";
module.exports = {"i8":"4.44.1"};

/***/ }),

/***/ 6417:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");;

/***/ }),

/***/ 9733:
/***/ ((module) => {

"use strict";
module.exports = require("jest-worker");;

/***/ }),

/***/ 6801:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/cacache");;

/***/ }),

/***/ 1844:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/find-cache-dir");;

/***/ }),

/***/ 6386:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/neo-async");;

/***/ }),

/***/ 3225:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/schema-utils");;

/***/ }),

/***/ 6241:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/source-map");;

/***/ }),

/***/ 4775:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/terser");;

/***/ }),

/***/ 2087:
/***/ ((module) => {

"use strict";
module.exports = require("os");;

/***/ }),

/***/ 5622:
/***/ ((module) => {

"use strict";
module.exports = require("path");;

/***/ }),

/***/ 1669:
/***/ ((module) => {

"use strict";
module.exports = require("util");;

/***/ }),

/***/ 4078:
/***/ ((module) => {

"use strict";
module.exports = require("webpack");;

/***/ }),

/***/ 3745:
/***/ ((module) => {

"use strict";
module.exports = require("webpack-sources");;

/***/ }),

/***/ 1432:
/***/ ((module) => {

"use strict";
module.exports = require("webpack/lib/RequestShortener");;

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
/******/ 			id: moduleId,
/******/ 			loaded: false,
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
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__webpack_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(5245);
/******/ })()
;