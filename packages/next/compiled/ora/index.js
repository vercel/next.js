module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 420:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var clone = __webpack_require__(321);

module.exports = function(options, defaults) {
  options = options || {};

  Object.keys(defaults).forEach(function(key) {
    if (typeof options[key] === 'undefined') {
      options[key] = clone(defaults[key]);
    }
  });

  return options;
};

/***/ }),

/***/ 321:
/***/ ((module) => {

var clone = (function() {
'use strict';

/**
 * Clones (copies) an Object using deep copying.
 *
 * This function supports circular references by default, but if you are certain
 * there are no circular references in your object, you can save some CPU time
 * by calling clone(obj, false).
 *
 * Caution: if `circular` is false and `parent` contains circular references,
 * your program may enter an infinite loop and crash.
 *
 * @param `parent` - the object to be cloned
 * @param `circular` - set to true if the object to be cloned may contain
 *    circular references. (optional - true by default)
 * @param `depth` - set to a number if the object is only to be cloned to
 *    a particular depth. (optional - defaults to Infinity)
 * @param `prototype` - sets the prototype to be used when cloning an object.
 *    (optional - defaults to parent prototype).
*/
function clone(parent, circular, depth, prototype) {
  var filter;
  if (typeof circular === 'object') {
    depth = circular.depth;
    prototype = circular.prototype;
    filter = circular.filter;
    circular = circular.circular
  }
  // maintain two arrays for circular references, where corresponding parents
  // and children have the same index
  var allParents = [];
  var allChildren = [];

  var useBuffer = typeof Buffer != 'undefined';

  if (typeof circular == 'undefined')
    circular = true;

  if (typeof depth == 'undefined')
    depth = Infinity;

  // recurse this function so we don't reset allParents and allChildren
  function _clone(parent, depth) {
    // cloning null always returns null
    if (parent === null)
      return null;

    if (depth == 0)
      return parent;

    var child;
    var proto;
    if (typeof parent != 'object') {
      return parent;
    }

    if (clone.__isArray(parent)) {
      child = [];
    } else if (clone.__isRegExp(parent)) {
      child = new RegExp(parent.source, __getRegExpFlags(parent));
      if (parent.lastIndex) child.lastIndex = parent.lastIndex;
    } else if (clone.__isDate(parent)) {
      child = new Date(parent.getTime());
    } else if (useBuffer && Buffer.isBuffer(parent)) {
      if (Buffer.allocUnsafe) {
        // Node.js >= 4.5.0
        child = Buffer.allocUnsafe(parent.length);
      } else {
        // Older Node.js versions
        child = new Buffer(parent.length);
      }
      parent.copy(child);
      return child;
    } else {
      if (typeof prototype == 'undefined') {
        proto = Object.getPrototypeOf(parent);
        child = Object.create(proto);
      }
      else {
        child = Object.create(prototype);
        proto = prototype;
      }
    }

    if (circular) {
      var index = allParents.indexOf(parent);

      if (index != -1) {
        return allChildren[index];
      }
      allParents.push(parent);
      allChildren.push(child);
    }

    for (var i in parent) {
      var attrs;
      if (proto) {
        attrs = Object.getOwnPropertyDescriptor(proto, i);
      }

      if (attrs && attrs.set == null) {
        continue;
      }
      child[i] = _clone(parent[i], depth - 1);
    }

    return child;
  }

  return _clone(parent, depth);
}

/**
 * Simple flat clone using prototype, accepts only objects, usefull for property
 * override on FLAT configuration object (no nested props).
 *
 * USE WITH CAUTION! This may not behave as you wish if you do not know how this
 * works.
 */
clone.clonePrototype = function clonePrototype(parent) {
  if (parent === null)
    return null;

  var c = function () {};
  c.prototype = parent;
  return new c();
};

// private utility functions

function __objToStr(o) {
  return Object.prototype.toString.call(o);
};
clone.__objToStr = __objToStr;

function __isDate(o) {
  return typeof o === 'object' && __objToStr(o) === '[object Date]';
};
clone.__isDate = __isDate;

function __isArray(o) {
  return typeof o === 'object' && __objToStr(o) === '[object Array]';
};
clone.__isArray = __isArray;

function __isRegExp(o) {
  return typeof o === 'object' && __objToStr(o) === '[object RegExp]';
};
clone.__isRegExp = __isRegExp;

function __getRegExpFlags(re) {
  var flags = '';
  if (re.global) flags += 'g';
  if (re.ignoreCase) flags += 'i';
  if (re.multiline) flags += 'm';
  return flags;
};
clone.__getRegExpFlags = __getRegExpFlags;

return clone;
})();

if ( true && module.exports) {
  module.exports = clone;
}


/***/ }),

/***/ 890:
/***/ ((module) => {

"use strict";


module.exports = ({stream = process.stdout} = {}) => {
	return Boolean(
		stream && stream.isTTY &&
		process.env.TERM !== 'dumb' &&
		!('CI' in process.env)
	);
};


/***/ }),

/***/ 203:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

const chalk = __webpack_require__(736);

const isSupported = process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color';

const main = {
	info: chalk.blue('ℹ'),
	success: chalk.green('✔'),
	warning: chalk.yellow('⚠'),
	error: chalk.red('✖')
};

const fallbacks = {
	info: chalk.blue('i'),
	success: chalk.green('√'),
	warning: chalk.yellow('‼'),
	error: chalk.red('×')
};

module.exports = isSupported ? main : fallbacks;


/***/ }),

/***/ 481:
/***/ ((module) => {

"use strict";


const mimicFn = (to, from) => {
	for (const prop of Reflect.ownKeys(from)) {
		Object.defineProperty(to, prop, Object.getOwnPropertyDescriptor(from, prop));
	}

	return to;
};

module.exports = mimicFn;
// TODO: Remove this for the next major release
module.exports.default = mimicFn;


/***/ }),

/***/ 471:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var Stream = __webpack_require__(413)

module.exports = MuteStream

// var out = new MuteStream(process.stdout)
// argument auto-pipes
function MuteStream (opts) {
  Stream.apply(this)
  opts = opts || {}
  this.writable = this.readable = true
  this.muted = false
  this.on('pipe', this._onpipe)
  this.replace = opts.replace

  // For readline-type situations
  // This much at the start of a line being redrawn after a ctrl char
  // is seen (such as backspace) won't be redrawn as the replacement
  this._prompt = opts.prompt || null
  this._hadControl = false
}

MuteStream.prototype = Object.create(Stream.prototype)

Object.defineProperty(MuteStream.prototype, 'constructor', {
  value: MuteStream,
  enumerable: false
})

MuteStream.prototype.mute = function () {
  this.muted = true
}

MuteStream.prototype.unmute = function () {
  this.muted = false
}

Object.defineProperty(MuteStream.prototype, '_onpipe', {
  value: onPipe,
  enumerable: false,
  writable: true,
  configurable: true
})

function onPipe (src) {
  this._src = src
}

Object.defineProperty(MuteStream.prototype, 'isTTY', {
  get: getIsTTY,
  set: setIsTTY,
  enumerable: true,
  configurable: true
})

function getIsTTY () {
  return( (this._dest) ? this._dest.isTTY
        : (this._src) ? this._src.isTTY
        : false
        )
}

// basically just get replace the getter/setter with a regular value
function setIsTTY (isTTY) {
  Object.defineProperty(this, 'isTTY', {
    value: isTTY,
    enumerable: true,
    writable: true,
    configurable: true
  })
}

Object.defineProperty(MuteStream.prototype, 'rows', {
  get: function () {
    return( this._dest ? this._dest.rows
          : this._src ? this._src.rows
          : undefined )
  }, enumerable: true, configurable: true })

Object.defineProperty(MuteStream.prototype, 'columns', {
  get: function () {
    return( this._dest ? this._dest.columns
          : this._src ? this._src.columns
          : undefined )
  }, enumerable: true, configurable: true })


MuteStream.prototype.pipe = function (dest, options) {
  this._dest = dest
  return Stream.prototype.pipe.call(this, dest, options)
}

MuteStream.prototype.pause = function () {
  if (this._src) return this._src.pause()
}

MuteStream.prototype.resume = function () {
  if (this._src) return this._src.resume()
}

MuteStream.prototype.write = function (c) {
  if (this.muted) {
    if (!this.replace) return true
    if (c.match(/^\u001b/)) {
      if(c.indexOf(this._prompt) === 0) {
        c = c.substr(this._prompt.length);
        c = c.replace(/./g, this.replace);
        c = this._prompt + c;
      }
      this._hadControl = true
      return this.emit('data', c)
    } else {
      if (this._prompt && this._hadControl &&
          c.indexOf(this._prompt) === 0) {
        this._hadControl = false
        this.emit('data', this._prompt)
        c = c.substr(this._prompt.length)
      }
      c = c.toString().replace(/./g, this.replace)
    }
  }
  this.emit('data', c)
}

MuteStream.prototype.end = function (c) {
  if (this.muted) {
    if (c && this.replace) {
      c = c.toString().replace(/./g, this.replace)
    } else {
      c = null
    }
  }
  if (c) this.emit('data', c)
  this.emit('end')
}

function proxy (fn) { return function () {
  var d = this._dest
  var s = this._src
  if (d && d[fn]) d[fn].apply(d, arguments)
  if (s && s[fn]) s[fn].apply(s, arguments)
}}

MuteStream.prototype.destroy = proxy('destroy')
MuteStream.prototype.destroySoon = proxy('destroySoon')
MuteStream.prototype.close = proxy('close')


/***/ }),

/***/ 462:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

const mimicFn = __webpack_require__(481);

const calledFunctions = new WeakMap();

const oneTime = (fn, options = {}) => {
	if (typeof fn !== 'function') {
		throw new TypeError('Expected a function');
	}

	let ret;
	let isCalled = false;
	let callCount = 0;
	const functionName = fn.displayName || fn.name || '<anonymous>';

	const onetime = function (...args) {
		calledFunctions.set(onetime, ++callCount);

		if (isCalled) {
			if (options.throw === true) {
				throw new Error(`Function \`${functionName}\` can only be called once`);
			}

			return ret;
		}

		isCalled = true;
		ret = fn.apply(this, args);
		fn = null;

		return ret;
	};

	mimicFn(onetime, fn);
	calledFunctions.set(onetime, callCount);

	return onetime;
};

module.exports = oneTime;
// TODO: Remove this for the next major release
module.exports.default = oneTime;

module.exports.callCount = fn => {
	if (!calledFunctions.has(fn)) {
		throw new Error(`The given function \`${fn.name}\` is not wrapped by the \`onetime\` package`);
	}

	return calledFunctions.get(fn);
};


/***/ }),

/***/ 28:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

// Note: since nyc uses this module to output coverage, any lines
// that are in the direct sync flow of nyc's outputCoverage are
// ignored, since we can never get coverage for them.
var assert = __webpack_require__(357)
var signals = __webpack_require__(19)

var EE = __webpack_require__(614)
/* istanbul ignore if */
if (typeof EE !== 'function') {
  EE = EE.EventEmitter
}

var emitter
if (process.__signal_exit_emitter__) {
  emitter = process.__signal_exit_emitter__
} else {
  emitter = process.__signal_exit_emitter__ = new EE()
  emitter.count = 0
  emitter.emitted = {}
}

// Because this emitter is a global, we have to check to see if a
// previous version of this library failed to enable infinite listeners.
// I know what you're about to say.  But literally everything about
// signal-exit is a compromise with evil.  Get used to it.
if (!emitter.infinite) {
  emitter.setMaxListeners(Infinity)
  emitter.infinite = true
}

module.exports = function (cb, opts) {
  assert.equal(typeof cb, 'function', 'a callback must be provided for exit handler')

  if (loaded === false) {
    load()
  }

  var ev = 'exit'
  if (opts && opts.alwaysLast) {
    ev = 'afterexit'
  }

  var remove = function () {
    emitter.removeListener(ev, cb)
    if (emitter.listeners('exit').length === 0 &&
        emitter.listeners('afterexit').length === 0) {
      unload()
    }
  }
  emitter.on(ev, cb)

  return remove
}

module.exports.unload = unload
function unload () {
  if (!loaded) {
    return
  }
  loaded = false

  signals.forEach(function (sig) {
    try {
      process.removeListener(sig, sigListeners[sig])
    } catch (er) {}
  })
  process.emit = originalProcessEmit
  process.reallyExit = originalProcessReallyExit
  emitter.count -= 1
}

function emit (event, code, signal) {
  if (emitter.emitted[event]) {
    return
  }
  emitter.emitted[event] = true
  emitter.emit(event, code, signal)
}

// { <signal>: <listener fn>, ... }
var sigListeners = {}
signals.forEach(function (sig) {
  sigListeners[sig] = function listener () {
    // If there are no other listeners, an exit is coming!
    // Simplest way: remove us and then re-send the signal.
    // We know that this will kill the process, so we can
    // safely emit now.
    var listeners = process.listeners(sig)
    if (listeners.length === emitter.count) {
      unload()
      emit('exit', null, sig)
      /* istanbul ignore next */
      emit('afterexit', null, sig)
      /* istanbul ignore next */
      process.kill(process.pid, sig)
    }
  }
})

module.exports.signals = function () {
  return signals
}

module.exports.load = load

var loaded = false

function load () {
  if (loaded) {
    return
  }
  loaded = true

  // This is the number of onSignalExit's that are in play.
  // It's important so that we can count the correct number of
  // listeners on signals, and don't wait for the other one to
  // handle it instead of us.
  emitter.count += 1

  signals = signals.filter(function (sig) {
    try {
      process.on(sig, sigListeners[sig])
      return true
    } catch (er) {
      return false
    }
  })

  process.emit = processEmit
  process.reallyExit = processReallyExit
}

var originalProcessReallyExit = process.reallyExit
function processReallyExit (code) {
  process.exitCode = code || 0
  emit('exit', process.exitCode, null)
  /* istanbul ignore next */
  emit('afterexit', process.exitCode, null)
  /* istanbul ignore next */
  originalProcessReallyExit.call(process, process.exitCode)
}

var originalProcessEmit = process.emit
function processEmit (ev, arg) {
  if (ev === 'exit') {
    if (arg !== undefined) {
      process.exitCode = arg
    }
    var ret = originalProcessEmit.apply(this, arguments)
    emit('exit', process.exitCode, null)
    /* istanbul ignore next */
    emit('afterexit', process.exitCode, null)
    return ret
  } else {
    return originalProcessEmit.apply(this, arguments)
  }
}


/***/ }),

/***/ 19:
/***/ ((module) => {

// This is not the set of all possible signals.
//
// It IS, however, the set of all signals that trigger
// an exit on either Linux or BSD systems.  Linux is a
// superset of the signal names supported on BSD, and
// the unknown signals just fail to register, so we can
// catch that easily enough.
//
// Don't bother with SIGKILL.  It's uncatchable, which
// means that we can't fire any callbacks anyway.
//
// If a user does happen to register a handler on a non-
// fatal signal like SIGWINCH or something, and then
// exit, it'll end up firing `process.emit('exit')`, so
// the handler will be fired anyway.
//
// SIGBUS, SIGFPE, SIGSEGV and SIGILL, when not raised
// artificially, inherently leave the process in a
// state from which it is not safe to try and enter JS
// listeners.
module.exports = [
  'SIGABRT',
  'SIGALRM',
  'SIGHUP',
  'SIGINT',
  'SIGTERM'
]

if (process.platform !== 'win32') {
  module.exports.push(
    'SIGVTALRM',
    'SIGXCPU',
    'SIGXFSZ',
    'SIGUSR2',
    'SIGTRAP',
    'SIGSYS',
    'SIGQUIT',
    'SIGIOT'
    // should detect profiler and enable/disable accordingly.
    // see #21
    // 'SIGPROF'
  )
}

if (process.platform === 'linux') {
  module.exports.push(
    'SIGIO',
    'SIGPOLL',
    'SIGPWR',
    'SIGSTKFLT',
    'SIGUNUSED'
  )
}


/***/ }),

/***/ 523:
/***/ ((module) => {

module.exports = [
    [ 0x0300, 0x036F ], [ 0x0483, 0x0486 ], [ 0x0488, 0x0489 ],
    [ 0x0591, 0x05BD ], [ 0x05BF, 0x05BF ], [ 0x05C1, 0x05C2 ],
    [ 0x05C4, 0x05C5 ], [ 0x05C7, 0x05C7 ], [ 0x0600, 0x0603 ],
    [ 0x0610, 0x0615 ], [ 0x064B, 0x065E ], [ 0x0670, 0x0670 ],
    [ 0x06D6, 0x06E4 ], [ 0x06E7, 0x06E8 ], [ 0x06EA, 0x06ED ],
    [ 0x070F, 0x070F ], [ 0x0711, 0x0711 ], [ 0x0730, 0x074A ],
    [ 0x07A6, 0x07B0 ], [ 0x07EB, 0x07F3 ], [ 0x0901, 0x0902 ],
    [ 0x093C, 0x093C ], [ 0x0941, 0x0948 ], [ 0x094D, 0x094D ],
    [ 0x0951, 0x0954 ], [ 0x0962, 0x0963 ], [ 0x0981, 0x0981 ],
    [ 0x09BC, 0x09BC ], [ 0x09C1, 0x09C4 ], [ 0x09CD, 0x09CD ],
    [ 0x09E2, 0x09E3 ], [ 0x0A01, 0x0A02 ], [ 0x0A3C, 0x0A3C ],
    [ 0x0A41, 0x0A42 ], [ 0x0A47, 0x0A48 ], [ 0x0A4B, 0x0A4D ],
    [ 0x0A70, 0x0A71 ], [ 0x0A81, 0x0A82 ], [ 0x0ABC, 0x0ABC ],
    [ 0x0AC1, 0x0AC5 ], [ 0x0AC7, 0x0AC8 ], [ 0x0ACD, 0x0ACD ],
    [ 0x0AE2, 0x0AE3 ], [ 0x0B01, 0x0B01 ], [ 0x0B3C, 0x0B3C ],
    [ 0x0B3F, 0x0B3F ], [ 0x0B41, 0x0B43 ], [ 0x0B4D, 0x0B4D ],
    [ 0x0B56, 0x0B56 ], [ 0x0B82, 0x0B82 ], [ 0x0BC0, 0x0BC0 ],
    [ 0x0BCD, 0x0BCD ], [ 0x0C3E, 0x0C40 ], [ 0x0C46, 0x0C48 ],
    [ 0x0C4A, 0x0C4D ], [ 0x0C55, 0x0C56 ], [ 0x0CBC, 0x0CBC ],
    [ 0x0CBF, 0x0CBF ], [ 0x0CC6, 0x0CC6 ], [ 0x0CCC, 0x0CCD ],
    [ 0x0CE2, 0x0CE3 ], [ 0x0D41, 0x0D43 ], [ 0x0D4D, 0x0D4D ],
    [ 0x0DCA, 0x0DCA ], [ 0x0DD2, 0x0DD4 ], [ 0x0DD6, 0x0DD6 ],
    [ 0x0E31, 0x0E31 ], [ 0x0E34, 0x0E3A ], [ 0x0E47, 0x0E4E ],
    [ 0x0EB1, 0x0EB1 ], [ 0x0EB4, 0x0EB9 ], [ 0x0EBB, 0x0EBC ],
    [ 0x0EC8, 0x0ECD ], [ 0x0F18, 0x0F19 ], [ 0x0F35, 0x0F35 ],
    [ 0x0F37, 0x0F37 ], [ 0x0F39, 0x0F39 ], [ 0x0F71, 0x0F7E ],
    [ 0x0F80, 0x0F84 ], [ 0x0F86, 0x0F87 ], [ 0x0F90, 0x0F97 ],
    [ 0x0F99, 0x0FBC ], [ 0x0FC6, 0x0FC6 ], [ 0x102D, 0x1030 ],
    [ 0x1032, 0x1032 ], [ 0x1036, 0x1037 ], [ 0x1039, 0x1039 ],
    [ 0x1058, 0x1059 ], [ 0x1160, 0x11FF ], [ 0x135F, 0x135F ],
    [ 0x1712, 0x1714 ], [ 0x1732, 0x1734 ], [ 0x1752, 0x1753 ],
    [ 0x1772, 0x1773 ], [ 0x17B4, 0x17B5 ], [ 0x17B7, 0x17BD ],
    [ 0x17C6, 0x17C6 ], [ 0x17C9, 0x17D3 ], [ 0x17DD, 0x17DD ],
    [ 0x180B, 0x180D ], [ 0x18A9, 0x18A9 ], [ 0x1920, 0x1922 ],
    [ 0x1927, 0x1928 ], [ 0x1932, 0x1932 ], [ 0x1939, 0x193B ],
    [ 0x1A17, 0x1A18 ], [ 0x1B00, 0x1B03 ], [ 0x1B34, 0x1B34 ],
    [ 0x1B36, 0x1B3A ], [ 0x1B3C, 0x1B3C ], [ 0x1B42, 0x1B42 ],
    [ 0x1B6B, 0x1B73 ], [ 0x1DC0, 0x1DCA ], [ 0x1DFE, 0x1DFF ],
    [ 0x200B, 0x200F ], [ 0x202A, 0x202E ], [ 0x2060, 0x2063 ],
    [ 0x206A, 0x206F ], [ 0x20D0, 0x20EF ], [ 0x302A, 0x302F ],
    [ 0x3099, 0x309A ], [ 0xA806, 0xA806 ], [ 0xA80B, 0xA80B ],
    [ 0xA825, 0xA826 ], [ 0xFB1E, 0xFB1E ], [ 0xFE00, 0xFE0F ],
    [ 0xFE20, 0xFE23 ], [ 0xFEFF, 0xFEFF ], [ 0xFFF9, 0xFFFB ],
    [ 0x10A01, 0x10A03 ], [ 0x10A05, 0x10A06 ], [ 0x10A0C, 0x10A0F ],
    [ 0x10A38, 0x10A3A ], [ 0x10A3F, 0x10A3F ], [ 0x1D167, 0x1D169 ],
    [ 0x1D173, 0x1D182 ], [ 0x1D185, 0x1D18B ], [ 0x1D1AA, 0x1D1AD ],
    [ 0x1D242, 0x1D244 ], [ 0xE0001, 0xE0001 ], [ 0xE0020, 0xE007F ],
    [ 0xE0100, 0xE01EF ]
]


/***/ }),

/***/ 205:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var defaults = __webpack_require__(420)
var combining = __webpack_require__(523)

var DEFAULTS = {
  nul: 0,
  control: 0
}

module.exports = function wcwidth(str) {
  return wcswidth(str, DEFAULTS)
}

module.exports.config = function(opts) {
  opts = defaults(opts || {}, DEFAULTS)
  return function wcwidth(str) {
    return wcswidth(str, opts)
  }
}

/*
 *  The following functions define the column width of an ISO 10646
 *  character as follows:
 *  - The null character (U+0000) has a column width of 0.
 *  - Other C0/C1 control characters and DEL will lead to a return value
 *    of -1.
 *  - Non-spacing and enclosing combining characters (general category
 *    code Mn or Me in the
 *    Unicode database) have a column width of 0.
 *  - SOFT HYPHEN (U+00AD) has a column width of 1.
 *  - Other format characters (general category code Cf in the Unicode
 *    database) and ZERO WIDTH
 *    SPACE (U+200B) have a column width of 0.
 *  - Hangul Jamo medial vowels and final consonants (U+1160-U+11FF)
 *    have a column width of 0.
 *  - Spacing characters in the East Asian Wide (W) or East Asian
 *    Full-width (F) category as
 *    defined in Unicode Technical Report #11 have a column width of 2.
 *  - All remaining characters (including all printable ISO 8859-1 and
 *    WGL4 characters, Unicode control characters, etc.) have a column
 *    width of 1.
 *  This implementation assumes that characters are encoded in ISO 10646.
*/

function wcswidth(str, opts) {
  if (typeof str !== 'string') return wcwidth(str, opts)

  var s = 0
  for (var i = 0; i < str.length; i++) {
    var n = wcwidth(str.charCodeAt(i), opts)
    if (n < 0) return -1
    s += n
  }

  return s
}

function wcwidth(ucs, opts) {
  // test for 8-bit control characters
  if (ucs === 0) return opts.nul
  if (ucs < 32 || (ucs >= 0x7f && ucs < 0xa0)) return opts.control

  // binary search in table of non-spacing characters
  if (bisearch(ucs)) return 0

  // if we arrive here, ucs is not a combining or C0/C1 control character
  return 1 +
      (ucs >= 0x1100 &&
       (ucs <= 0x115f ||                       // Hangul Jamo init. consonants
        ucs == 0x2329 || ucs == 0x232a ||
        (ucs >= 0x2e80 && ucs <= 0xa4cf &&
         ucs != 0x303f) ||                     // CJK ... Yi
        (ucs >= 0xac00 && ucs <= 0xd7a3) ||    // Hangul Syllables
        (ucs >= 0xf900 && ucs <= 0xfaff) ||    // CJK Compatibility Ideographs
        (ucs >= 0xfe10 && ucs <= 0xfe19) ||    // Vertical forms
        (ucs >= 0xfe30 && ucs <= 0xfe6f) ||    // CJK Compatibility Forms
        (ucs >= 0xff00 && ucs <= 0xff60) ||    // Fullwidth Forms
        (ucs >= 0xffe0 && ucs <= 0xffe6) ||
        (ucs >= 0x20000 && ucs <= 0x2fffd) ||
        (ucs >= 0x30000 && ucs <= 0x3fffd)));
}

function bisearch(ucs) {
  var min = 0
  var max = combining.length - 1
  var mid

  if (ucs < combining[0][0] || ucs > combining[max][1]) return false

  while (max >= min) {
    mid = Math.floor((min + max) / 2)
    if (ucs > combining[mid][1]) min = mid + 1
    else if (ucs < combining[mid][0]) max = mid - 1
    else return true
  }

  return false
}


/***/ }),

/***/ 938:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {

"use strict";

const restoreCursor = __webpack_require__(841);

let isHidden = false;

exports.show = (writableStream = process.stderr) => {
	if (!writableStream.isTTY) {
		return;
	}

	isHidden = false;
	writableStream.write('\u001B[?25h');
};

exports.hide = (writableStream = process.stderr) => {
	if (!writableStream.isTTY) {
		return;
	}

	restoreCursor();
	isHidden = true;
	writableStream.write('\u001B[?25l');
};

exports.toggle = (force, writableStream) => {
	if (force !== undefined) {
		isHidden = force;
	}

	if (isHidden) {
		exports.show(writableStream);
	} else {
		exports.hide(writableStream);
	}
};


/***/ }),

/***/ 419:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const spinners = Object.assign({}, __webpack_require__(615));

module.exports = spinners;
// TODO: Remove this for the next major release
module.exports.default = spinners;


/***/ }),

/***/ 244:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

const readline = __webpack_require__(58);
const chalk = __webpack_require__(736);
const cliCursor = __webpack_require__(938);
const cliSpinners = __webpack_require__(419);
const logSymbols = __webpack_require__(203);
const stripAnsi = __webpack_require__(148);
const wcwidth = __webpack_require__(205);
const isInteractive = __webpack_require__(890);
const MuteStream = __webpack_require__(471);

const TEXT = Symbol('text');
const PREFIX_TEXT = Symbol('prefixText');

const ASCII_ETX_CODE = 0x03; // Ctrl+C emits this code

class StdinDiscarder {
	constructor() {
		this.requests = 0;

		this.mutedStream = new MuteStream();
		this.mutedStream.pipe(process.stdout);
		this.mutedStream.mute();

		const self = this;
		this.ourEmit = function (event, data, ...args) {
			const {stdin} = process;
			if (self.requests > 0 || stdin.emit === self.ourEmit) {
				if (event === 'keypress') { // Fixes readline behavior
					return;
				}

				if (event === 'data' && data.includes(ASCII_ETX_CODE)) {
					process.emit('SIGINT');
				}

				Reflect.apply(self.oldEmit, this, [event, data, ...args]);
			} else {
				Reflect.apply(process.stdin.emit, this, [event, data, ...args]);
			}
		};
	}

	start() {
		this.requests++;

		if (this.requests === 1) {
			this.realStart();
		}
	}

	stop() {
		if (this.requests <= 0) {
			throw new Error('`stop` called more times than `start`');
		}

		this.requests--;

		if (this.requests === 0) {
			this.realStop();
		}
	}

	realStart() {
		// No known way to make it work reliably on Windows
		if (process.platform === 'win32') {
			return;
		}

		this.rl = readline.createInterface({
			input: process.stdin,
			output: this.mutedStream
		});

		this.rl.on('SIGINT', () => {
			if (process.listenerCount('SIGINT') === 0) {
				process.emit('SIGINT');
			} else {
				this.rl.close();
				process.kill(process.pid, 'SIGINT');
			}
		});
	}

	realStop() {
		if (process.platform === 'win32') {
			return;
		}

		this.rl.close();
		this.rl = undefined;
	}
}

const stdinDiscarder = new StdinDiscarder();

class Ora {
	constructor(options) {
		if (typeof options === 'string') {
			options = {
				text: options
			};
		}

		this.options = {
			text: '',
			color: 'cyan',
			stream: process.stderr,
			discardStdin: true,
			...options
		};

		this.spinner = this.options.spinner;

		this.color = this.options.color;
		this.hideCursor = this.options.hideCursor !== false;
		this.interval = this.options.interval || this.spinner.interval || 100;
		this.stream = this.options.stream;
		this.id = undefined;
		this.isEnabled = typeof this.options.isEnabled === 'boolean' ? this.options.isEnabled : isInteractive({stream: this.stream});

		// Set *after* `this.stream`
		this.text = this.options.text;
		this.prefixText = this.options.prefixText;
		this.linesToClear = 0;
		this.indent = this.options.indent;
		this.discardStdin = this.options.discardStdin;
		this.isDiscardingStdin = false;
	}

	get indent() {
		return this._indent;
	}

	set indent(indent = 0) {
		if (!(indent >= 0 && Number.isInteger(indent))) {
			throw new Error('The `indent` option must be an integer from 0 and up');
		}

		this._indent = indent;
	}

	_updateInterval(interval) {
		if (interval !== undefined) {
			this.interval = interval;
		}
	}

	get spinner() {
		return this._spinner;
	}

	set spinner(spinner) {
		this.frameIndex = 0;

		if (typeof spinner === 'object') {
			if (spinner.frames === undefined) {
				throw new Error('The given spinner must have a `frames` property');
			}

			this._spinner = spinner;
		} else if (process.platform === 'win32') {
			this._spinner = cliSpinners.line;
		} else if (spinner === undefined) {
			// Set default spinner
			this._spinner = cliSpinners.dots;
		} else if (cliSpinners[spinner]) {
			this._spinner = cliSpinners[spinner];
		} else {
			throw new Error(`There is no built-in spinner named '${spinner}'. See https://github.com/sindresorhus/cli-spinners/blob/master/spinners.json for a full list.`);
		}

		this._updateInterval(this._spinner.interval);
	}

	get text() {
		return this[TEXT];
	}

	get prefixText() {
		return this[PREFIX_TEXT];
	}

	get isSpinning() {
		return this.id !== undefined;
	}

	updateLineCount() {
		const columns = this.stream.columns || 80;
		const fullPrefixText = (typeof this[PREFIX_TEXT] === 'string') ? this[PREFIX_TEXT] + '-' : '';
		this.lineCount = stripAnsi(fullPrefixText + '--' + this[TEXT]).split('\n').reduce((count, line) => {
			return count + Math.max(1, Math.ceil(wcwidth(line) / columns));
		}, 0);
	}

	set text(value) {
		this[TEXT] = value;
		this.updateLineCount();
	}

	set prefixText(value) {
		this[PREFIX_TEXT] = value;
		this.updateLineCount();
	}

	frame() {
		const {frames} = this.spinner;
		let frame = frames[this.frameIndex];

		if (this.color) {
			frame = chalk[this.color](frame);
		}

		this.frameIndex = ++this.frameIndex % frames.length;
		const fullPrefixText = (typeof this.prefixText === 'string' && this.prefixText !== '') ? this.prefixText + ' ' : '';
		const fullText = typeof this.text === 'string' ? ' ' + this.text : '';

		return fullPrefixText + frame + fullText;
	}

	clear() {
		if (!this.isEnabled || !this.stream.isTTY) {
			return this;
		}

		for (let i = 0; i < this.linesToClear; i++) {
			if (i > 0) {
				this.stream.moveCursor(0, -1);
			}

			this.stream.clearLine();
			this.stream.cursorTo(this.indent);
		}

		this.linesToClear = 0;

		return this;
	}

	render() {
		this.clear();
		this.stream.write(this.frame());
		this.linesToClear = this.lineCount;

		return this;
	}

	start(text) {
		if (text) {
			this.text = text;
		}

		if (!this.isEnabled) {
			if (this.text) {
				this.stream.write(`- ${this.text}\n`);
			}

			return this;
		}

		if (this.isSpinning) {
			return this;
		}

		if (this.hideCursor) {
			cliCursor.hide(this.stream);
		}

		if (this.discardStdin && process.stdin.isTTY) {
			this.isDiscardingStdin = true;
			stdinDiscarder.start();
		}

		this.render();
		this.id = setInterval(this.render.bind(this), this.interval);

		return this;
	}

	stop() {
		if (!this.isEnabled) {
			return this;
		}

		clearInterval(this.id);
		this.id = undefined;
		this.frameIndex = 0;
		this.clear();
		if (this.hideCursor) {
			cliCursor.show(this.stream);
		}

		if (this.discardStdin && process.stdin.isTTY && this.isDiscardingStdin) {
			stdinDiscarder.stop();
			this.isDiscardingStdin = false;
		}

		return this;
	}

	succeed(text) {
		return this.stopAndPersist({symbol: logSymbols.success, text});
	}

	fail(text) {
		return this.stopAndPersist({symbol: logSymbols.error, text});
	}

	warn(text) {
		return this.stopAndPersist({symbol: logSymbols.warning, text});
	}

	info(text) {
		return this.stopAndPersist({symbol: logSymbols.info, text});
	}

	stopAndPersist(options = {}) {
		const prefixText = options.prefixText || this.prefixText;
		const fullPrefixText = (typeof prefixText === 'string' && prefixText !== '') ? prefixText + ' ' : '';
		const text = options.text || this.text;
		const fullText = (typeof text === 'string') ? ' ' + text : '';

		this.stop();
		this.stream.write(`${fullPrefixText}${options.symbol || ' '}${fullText}\n`);

		return this;
	}
}

const oraFactory = function (options) {
	return new Ora(options);
};

module.exports = oraFactory;

module.exports.promise = (action, options) => {
	// eslint-disable-next-line promise/prefer-await-to-then
	if (typeof action.then !== 'function') {
		throw new TypeError('Parameter `action` must be a Promise');
	}

	const spinner = new Ora(options);
	spinner.start();

	(async () => {
		try {
			await action;
			spinner.succeed();
		} catch (_) {
			spinner.fail();
		}
	})();

	return spinner;
};


/***/ }),

/***/ 841:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";

const onetime = __webpack_require__(462);
const signalExit = __webpack_require__(28);

module.exports = onetime(() => {
	signalExit(() => {
		process.stderr.write('\u001B[?25h');
	}, {alwaysLast: true});
});


/***/ }),

/***/ 615:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"dots\":{\"interval\":80,\"frames\":[\"⠋\",\"⠙\",\"⠹\",\"⠸\",\"⠼\",\"⠴\",\"⠦\",\"⠧\",\"⠇\",\"⠏\"]},\"dots2\":{\"interval\":80,\"frames\":[\"⣾\",\"⣽\",\"⣻\",\"⢿\",\"⡿\",\"⣟\",\"⣯\",\"⣷\"]},\"dots3\":{\"interval\":80,\"frames\":[\"⠋\",\"⠙\",\"⠚\",\"⠞\",\"⠖\",\"⠦\",\"⠴\",\"⠲\",\"⠳\",\"⠓\"]},\"dots4\":{\"interval\":80,\"frames\":[\"⠄\",\"⠆\",\"⠇\",\"⠋\",\"⠙\",\"⠸\",\"⠰\",\"⠠\",\"⠰\",\"⠸\",\"⠙\",\"⠋\",\"⠇\",\"⠆\"]},\"dots5\":{\"interval\":80,\"frames\":[\"⠋\",\"⠙\",\"⠚\",\"⠒\",\"⠂\",\"⠂\",\"⠒\",\"⠲\",\"⠴\",\"⠦\",\"⠖\",\"⠒\",\"⠐\",\"⠐\",\"⠒\",\"⠓\",\"⠋\"]},\"dots6\":{\"interval\":80,\"frames\":[\"⠁\",\"⠉\",\"⠙\",\"⠚\",\"⠒\",\"⠂\",\"⠂\",\"⠒\",\"⠲\",\"⠴\",\"⠤\",\"⠄\",\"⠄\",\"⠤\",\"⠴\",\"⠲\",\"⠒\",\"⠂\",\"⠂\",\"⠒\",\"⠚\",\"⠙\",\"⠉\",\"⠁\"]},\"dots7\":{\"interval\":80,\"frames\":[\"⠈\",\"⠉\",\"⠋\",\"⠓\",\"⠒\",\"⠐\",\"⠐\",\"⠒\",\"⠖\",\"⠦\",\"⠤\",\"⠠\",\"⠠\",\"⠤\",\"⠦\",\"⠖\",\"⠒\",\"⠐\",\"⠐\",\"⠒\",\"⠓\",\"⠋\",\"⠉\",\"⠈\"]},\"dots8\":{\"interval\":80,\"frames\":[\"⠁\",\"⠁\",\"⠉\",\"⠙\",\"⠚\",\"⠒\",\"⠂\",\"⠂\",\"⠒\",\"⠲\",\"⠴\",\"⠤\",\"⠄\",\"⠄\",\"⠤\",\"⠠\",\"⠠\",\"⠤\",\"⠦\",\"⠖\",\"⠒\",\"⠐\",\"⠐\",\"⠒\",\"⠓\",\"⠋\",\"⠉\",\"⠈\",\"⠈\"]},\"dots9\":{\"interval\":80,\"frames\":[\"⢹\",\"⢺\",\"⢼\",\"⣸\",\"⣇\",\"⡧\",\"⡗\",\"⡏\"]},\"dots10\":{\"interval\":80,\"frames\":[\"⢄\",\"⢂\",\"⢁\",\"⡁\",\"⡈\",\"⡐\",\"⡠\"]},\"dots11\":{\"interval\":100,\"frames\":[\"⠁\",\"⠂\",\"⠄\",\"⡀\",\"⢀\",\"⠠\",\"⠐\",\"⠈\"]},\"dots12\":{\"interval\":80,\"frames\":[\"⢀⠀\",\"⡀⠀\",\"⠄⠀\",\"⢂⠀\",\"⡂⠀\",\"⠅⠀\",\"⢃⠀\",\"⡃⠀\",\"⠍⠀\",\"⢋⠀\",\"⡋⠀\",\"⠍⠁\",\"⢋⠁\",\"⡋⠁\",\"⠍⠉\",\"⠋⠉\",\"⠋⠉\",\"⠉⠙\",\"⠉⠙\",\"⠉⠩\",\"⠈⢙\",\"⠈⡙\",\"⢈⠩\",\"⡀⢙\",\"⠄⡙\",\"⢂⠩\",\"⡂⢘\",\"⠅⡘\",\"⢃⠨\",\"⡃⢐\",\"⠍⡐\",\"⢋⠠\",\"⡋⢀\",\"⠍⡁\",\"⢋⠁\",\"⡋⠁\",\"⠍⠉\",\"⠋⠉\",\"⠋⠉\",\"⠉⠙\",\"⠉⠙\",\"⠉⠩\",\"⠈⢙\",\"⠈⡙\",\"⠈⠩\",\"⠀⢙\",\"⠀⡙\",\"⠀⠩\",\"⠀⢘\",\"⠀⡘\",\"⠀⠨\",\"⠀⢐\",\"⠀⡐\",\"⠀⠠\",\"⠀⢀\",\"⠀⡀\"]},\"dots8Bit\":{\"interval\":80,\"frames\":[\"⠀\",\"⠁\",\"⠂\",\"⠃\",\"⠄\",\"⠅\",\"⠆\",\"⠇\",\"⡀\",\"⡁\",\"⡂\",\"⡃\",\"⡄\",\"⡅\",\"⡆\",\"⡇\",\"⠈\",\"⠉\",\"⠊\",\"⠋\",\"⠌\",\"⠍\",\"⠎\",\"⠏\",\"⡈\",\"⡉\",\"⡊\",\"⡋\",\"⡌\",\"⡍\",\"⡎\",\"⡏\",\"⠐\",\"⠑\",\"⠒\",\"⠓\",\"⠔\",\"⠕\",\"⠖\",\"⠗\",\"⡐\",\"⡑\",\"⡒\",\"⡓\",\"⡔\",\"⡕\",\"⡖\",\"⡗\",\"⠘\",\"⠙\",\"⠚\",\"⠛\",\"⠜\",\"⠝\",\"⠞\",\"⠟\",\"⡘\",\"⡙\",\"⡚\",\"⡛\",\"⡜\",\"⡝\",\"⡞\",\"⡟\",\"⠠\",\"⠡\",\"⠢\",\"⠣\",\"⠤\",\"⠥\",\"⠦\",\"⠧\",\"⡠\",\"⡡\",\"⡢\",\"⡣\",\"⡤\",\"⡥\",\"⡦\",\"⡧\",\"⠨\",\"⠩\",\"⠪\",\"⠫\",\"⠬\",\"⠭\",\"⠮\",\"⠯\",\"⡨\",\"⡩\",\"⡪\",\"⡫\",\"⡬\",\"⡭\",\"⡮\",\"⡯\",\"⠰\",\"⠱\",\"⠲\",\"⠳\",\"⠴\",\"⠵\",\"⠶\",\"⠷\",\"⡰\",\"⡱\",\"⡲\",\"⡳\",\"⡴\",\"⡵\",\"⡶\",\"⡷\",\"⠸\",\"⠹\",\"⠺\",\"⠻\",\"⠼\",\"⠽\",\"⠾\",\"⠿\",\"⡸\",\"⡹\",\"⡺\",\"⡻\",\"⡼\",\"⡽\",\"⡾\",\"⡿\",\"⢀\",\"⢁\",\"⢂\",\"⢃\",\"⢄\",\"⢅\",\"⢆\",\"⢇\",\"⣀\",\"⣁\",\"⣂\",\"⣃\",\"⣄\",\"⣅\",\"⣆\",\"⣇\",\"⢈\",\"⢉\",\"⢊\",\"⢋\",\"⢌\",\"⢍\",\"⢎\",\"⢏\",\"⣈\",\"⣉\",\"⣊\",\"⣋\",\"⣌\",\"⣍\",\"⣎\",\"⣏\",\"⢐\",\"⢑\",\"⢒\",\"⢓\",\"⢔\",\"⢕\",\"⢖\",\"⢗\",\"⣐\",\"⣑\",\"⣒\",\"⣓\",\"⣔\",\"⣕\",\"⣖\",\"⣗\",\"⢘\",\"⢙\",\"⢚\",\"⢛\",\"⢜\",\"⢝\",\"⢞\",\"⢟\",\"⣘\",\"⣙\",\"⣚\",\"⣛\",\"⣜\",\"⣝\",\"⣞\",\"⣟\",\"⢠\",\"⢡\",\"⢢\",\"⢣\",\"⢤\",\"⢥\",\"⢦\",\"⢧\",\"⣠\",\"⣡\",\"⣢\",\"⣣\",\"⣤\",\"⣥\",\"⣦\",\"⣧\",\"⢨\",\"⢩\",\"⢪\",\"⢫\",\"⢬\",\"⢭\",\"⢮\",\"⢯\",\"⣨\",\"⣩\",\"⣪\",\"⣫\",\"⣬\",\"⣭\",\"⣮\",\"⣯\",\"⢰\",\"⢱\",\"⢲\",\"⢳\",\"⢴\",\"⢵\",\"⢶\",\"⢷\",\"⣰\",\"⣱\",\"⣲\",\"⣳\",\"⣴\",\"⣵\",\"⣶\",\"⣷\",\"⢸\",\"⢹\",\"⢺\",\"⢻\",\"⢼\",\"⢽\",\"⢾\",\"⢿\",\"⣸\",\"⣹\",\"⣺\",\"⣻\",\"⣼\",\"⣽\",\"⣾\",\"⣿\"]},\"line\":{\"interval\":130,\"frames\":[\"-\",\"\\\\\",\"|\",\"/\"]},\"line2\":{\"interval\":100,\"frames\":[\"⠂\",\"-\",\"–\",\"—\",\"–\",\"-\"]},\"pipe\":{\"interval\":100,\"frames\":[\"┤\",\"┘\",\"┴\",\"└\",\"├\",\"┌\",\"┬\",\"┐\"]},\"simpleDots\":{\"interval\":400,\"frames\":[\".  \",\".. \",\"...\",\"   \"]},\"simpleDotsScrolling\":{\"interval\":200,\"frames\":[\".  \",\".. \",\"...\",\" ..\",\"  .\",\"   \"]},\"star\":{\"interval\":70,\"frames\":[\"✶\",\"✸\",\"✹\",\"✺\",\"✹\",\"✷\"]},\"star2\":{\"interval\":80,\"frames\":[\"+\",\"x\",\"*\"]},\"flip\":{\"interval\":70,\"frames\":[\"_\",\"_\",\"_\",\"-\",\"`\",\"`\",\"'\",\"´\",\"-\",\"_\",\"_\",\"_\"]},\"hamburger\":{\"interval\":100,\"frames\":[\"☱\",\"☲\",\"☴\"]},\"growVertical\":{\"interval\":120,\"frames\":[\"▁\",\"▃\",\"▄\",\"▅\",\"▆\",\"▇\",\"▆\",\"▅\",\"▄\",\"▃\"]},\"growHorizontal\":{\"interval\":120,\"frames\":[\"▏\",\"▎\",\"▍\",\"▌\",\"▋\",\"▊\",\"▉\",\"▊\",\"▋\",\"▌\",\"▍\",\"▎\"]},\"balloon\":{\"interval\":140,\"frames\":[\" \",\".\",\"o\",\"O\",\"@\",\"*\",\" \"]},\"balloon2\":{\"interval\":120,\"frames\":[\".\",\"o\",\"O\",\"°\",\"O\",\"o\",\".\"]},\"noise\":{\"interval\":100,\"frames\":[\"▓\",\"▒\",\"░\"]},\"bounce\":{\"interval\":120,\"frames\":[\"⠁\",\"⠂\",\"⠄\",\"⠂\"]},\"boxBounce\":{\"interval\":120,\"frames\":[\"▖\",\"▘\",\"▝\",\"▗\"]},\"boxBounce2\":{\"interval\":100,\"frames\":[\"▌\",\"▀\",\"▐\",\"▄\"]},\"triangle\":{\"interval\":50,\"frames\":[\"◢\",\"◣\",\"◤\",\"◥\"]},\"arc\":{\"interval\":100,\"frames\":[\"◜\",\"◠\",\"◝\",\"◞\",\"◡\",\"◟\"]},\"circle\":{\"interval\":120,\"frames\":[\"◡\",\"⊙\",\"◠\"]},\"squareCorners\":{\"interval\":180,\"frames\":[\"◰\",\"◳\",\"◲\",\"◱\"]},\"circleQuarters\":{\"interval\":120,\"frames\":[\"◴\",\"◷\",\"◶\",\"◵\"]},\"circleHalves\":{\"interval\":50,\"frames\":[\"◐\",\"◓\",\"◑\",\"◒\"]},\"squish\":{\"interval\":100,\"frames\":[\"╫\",\"╪\"]},\"toggle\":{\"interval\":250,\"frames\":[\"⊶\",\"⊷\"]},\"toggle2\":{\"interval\":80,\"frames\":[\"▫\",\"▪\"]},\"toggle3\":{\"interval\":120,\"frames\":[\"□\",\"■\"]},\"toggle4\":{\"interval\":100,\"frames\":[\"■\",\"□\",\"▪\",\"▫\"]},\"toggle5\":{\"interval\":100,\"frames\":[\"▮\",\"▯\"]},\"toggle6\":{\"interval\":300,\"frames\":[\"ဝ\",\"၀\"]},\"toggle7\":{\"interval\":80,\"frames\":[\"⦾\",\"⦿\"]},\"toggle8\":{\"interval\":100,\"frames\":[\"◍\",\"◌\"]},\"toggle9\":{\"interval\":100,\"frames\":[\"◉\",\"◎\"]},\"toggle10\":{\"interval\":100,\"frames\":[\"㊂\",\"㊀\",\"㊁\"]},\"toggle11\":{\"interval\":50,\"frames\":[\"⧇\",\"⧆\"]},\"toggle12\":{\"interval\":120,\"frames\":[\"☗\",\"☖\"]},\"toggle13\":{\"interval\":80,\"frames\":[\"=\",\"*\",\"-\"]},\"arrow\":{\"interval\":100,\"frames\":[\"←\",\"↖\",\"↑\",\"↗\",\"→\",\"↘\",\"↓\",\"↙\"]},\"arrow2\":{\"interval\":80,\"frames\":[\"⬆️ \",\"↗️ \",\"➡️ \",\"↘️ \",\"⬇️ \",\"↙️ \",\"⬅️ \",\"↖️ \"]},\"arrow3\":{\"interval\":120,\"frames\":[\"▹▹▹▹▹\",\"▸▹▹▹▹\",\"▹▸▹▹▹\",\"▹▹▸▹▹\",\"▹▹▹▸▹\",\"▹▹▹▹▸\"]},\"bouncingBar\":{\"interval\":80,\"frames\":[\"[    ]\",\"[=   ]\",\"[==  ]\",\"[=== ]\",\"[ ===]\",\"[  ==]\",\"[   =]\",\"[    ]\",\"[   =]\",\"[  ==]\",\"[ ===]\",\"[====]\",\"[=== ]\",\"[==  ]\",\"[=   ]\"]},\"bouncingBall\":{\"interval\":80,\"frames\":[\"( ●    )\",\"(  ●   )\",\"(   ●  )\",\"(    ● )\",\"(     ●)\",\"(    ● )\",\"(   ●  )\",\"(  ●   )\",\"( ●    )\",\"(●     )\"]},\"smiley\":{\"interval\":200,\"frames\":[\"😄 \",\"😝 \"]},\"monkey\":{\"interval\":300,\"frames\":[\"🙈 \",\"🙈 \",\"🙉 \",\"🙊 \"]},\"hearts\":{\"interval\":100,\"frames\":[\"💛 \",\"💙 \",\"💜 \",\"💚 \",\"❤️ \"]},\"clock\":{\"interval\":100,\"frames\":[\"🕛 \",\"🕐 \",\"🕑 \",\"🕒 \",\"🕓 \",\"🕔 \",\"🕕 \",\"🕖 \",\"🕗 \",\"🕘 \",\"🕙 \",\"🕚 \"]},\"earth\":{\"interval\":180,\"frames\":[\"🌍 \",\"🌎 \",\"🌏 \"]},\"moon\":{\"interval\":80,\"frames\":[\"🌑 \",\"🌒 \",\"🌓 \",\"🌔 \",\"🌕 \",\"🌖 \",\"🌗 \",\"🌘 \"]},\"runner\":{\"interval\":140,\"frames\":[\"🚶 \",\"🏃 \"]},\"pong\":{\"interval\":80,\"frames\":[\"▐⠂       ▌\",\"▐⠈       ▌\",\"▐ ⠂      ▌\",\"▐ ⠠      ▌\",\"▐  ⡀     ▌\",\"▐  ⠠     ▌\",\"▐   ⠂    ▌\",\"▐   ⠈    ▌\",\"▐    ⠂   ▌\",\"▐    ⠠   ▌\",\"▐     ⡀  ▌\",\"▐     ⠠  ▌\",\"▐      ⠂ ▌\",\"▐      ⠈ ▌\",\"▐       ⠂▌\",\"▐       ⠠▌\",\"▐       ⡀▌\",\"▐      ⠠ ▌\",\"▐      ⠂ ▌\",\"▐     ⠈  ▌\",\"▐     ⠂  ▌\",\"▐    ⠠   ▌\",\"▐    ⡀   ▌\",\"▐   ⠠    ▌\",\"▐   ⠂    ▌\",\"▐  ⠈     ▌\",\"▐  ⠂     ▌\",\"▐ ⠠      ▌\",\"▐ ⡀      ▌\",\"▐⠠       ▌\"]},\"shark\":{\"interval\":120,\"frames\":[\"▐|\\\\____________▌\",\"▐_|\\\\___________▌\",\"▐__|\\\\__________▌\",\"▐___|\\\\_________▌\",\"▐____|\\\\________▌\",\"▐_____|\\\\_______▌\",\"▐______|\\\\______▌\",\"▐_______|\\\\_____▌\",\"▐________|\\\\____▌\",\"▐_________|\\\\___▌\",\"▐__________|\\\\__▌\",\"▐___________|\\\\_▌\",\"▐____________|\\\\▌\",\"▐____________/|▌\",\"▐___________/|_▌\",\"▐__________/|__▌\",\"▐_________/|___▌\",\"▐________/|____▌\",\"▐_______/|_____▌\",\"▐______/|______▌\",\"▐_____/|_______▌\",\"▐____/|________▌\",\"▐___/|_________▌\",\"▐__/|__________▌\",\"▐_/|___________▌\",\"▐/|____________▌\"]},\"dqpb\":{\"interval\":100,\"frames\":[\"d\",\"q\",\"p\",\"b\"]},\"weather\":{\"interval\":100,\"frames\":[\"☀️ \",\"☀️ \",\"☀️ \",\"🌤 \",\"⛅️ \",\"🌥 \",\"☁️ \",\"🌧 \",\"🌨 \",\"🌧 \",\"🌨 \",\"🌧 \",\"🌨 \",\"⛈ \",\"🌨 \",\"🌧 \",\"🌨 \",\"☁️ \",\"🌥 \",\"⛅️ \",\"🌤 \",\"☀️ \",\"☀️ \"]},\"christmas\":{\"interval\":400,\"frames\":[\"🌲\",\"🎄\"]},\"grenade\":{\"interval\":80,\"frames\":[\"،   \",\"′   \",\" ´ \",\" ‾ \",\"  ⸌\",\"  ⸊\",\"  |\",\"  ⁎\",\"  ⁕\",\" ෴ \",\"  ⁓\",\"   \",\"   \",\"   \"]},\"point\":{\"interval\":125,\"frames\":[\"∙∙∙\",\"●∙∙\",\"∙●∙\",\"∙∙●\",\"∙∙∙\"]},\"layer\":{\"interval\":150,\"frames\":[\"-\",\"=\",\"≡\"]},\"betaWave\":{\"interval\":80,\"frames\":[\"ρββββββ\",\"βρβββββ\",\"ββρββββ\",\"βββρβββ\",\"ββββρββ\",\"βββββρβ\",\"ββββββρ\"]}}");

/***/ }),

/***/ 357:
/***/ ((module) => {

"use strict";
module.exports = require("assert");;

/***/ }),

/***/ 614:
/***/ ((module) => {

"use strict";
module.exports = require("events");;

/***/ }),

/***/ 736:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/chalk");;

/***/ }),

/***/ 148:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/strip-ansi");;

/***/ }),

/***/ 58:
/***/ ((module) => {

"use strict";
module.exports = require("readline");;

/***/ }),

/***/ 413:
/***/ ((module) => {

"use strict";
module.exports = require("stream");;

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
/******/ 	return __webpack_require__(244);
/******/ })()
;