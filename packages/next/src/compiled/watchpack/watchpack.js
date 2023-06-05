/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 660:
/***/ ((module) => {

module.exports = function (glob, opts) {
  if (typeof glob !== 'string') {
    throw new TypeError('Expected a string');
  }

  var str = String(glob);

  // The regexp we are building, as a string.
  var reStr = "";

  // Whether we are matching so called "extended" globs (like bash) and should
  // support single character matching, matching ranges of characters, group
  // matching, etc.
  var extended = opts ? !!opts.extended : false;

  // When globstar is _false_ (default), '/foo/*' is translated a regexp like
  // '^\/foo\/.*$' which will match any string beginning with '/foo/'
  // When globstar is _true_, '/foo/*' is translated to regexp like
  // '^\/foo\/[^/]*$' which will match any string beginning with '/foo/' BUT
  // which does not have a '/' to the right of it.
  // E.g. with '/foo/*' these will match: '/foo/bar', '/foo/bar.txt' but
  // these will not '/foo/bar/baz', '/foo/bar/baz.txt'
  // Lastely, when globstar is _true_, '/foo/**' is equivelant to '/foo/*' when
  // globstar is _false_
  var globstar = opts ? !!opts.globstar : false;

  // If we are doing extended matching, this boolean is true when we are inside
  // a group (eg {*.html,*.js}), and false otherwise.
  var inGroup = false;

  // RegExp flags (eg "i" ) to pass in to RegExp constructor.
  var flags = opts && typeof( opts.flags ) === "string" ? opts.flags : "";

  var c;
  for (var i = 0, len = str.length; i < len; i++) {
    c = str[i];

    switch (c) {
    case "/":
    case "$":
    case "^":
    case "+":
    case ".":
    case "(":
    case ")":
    case "=":
    case "!":
    case "|":
      reStr += "\\" + c;
      break;

    case "?":
      if (extended) {
        reStr += ".";
	    break;
      }

    case "[":
    case "]":
      if (extended) {
        reStr += c;
	    break;
      }

    case "{":
      if (extended) {
        inGroup = true;
	    reStr += "(";
	    break;
      }

    case "}":
      if (extended) {
        inGroup = false;
	    reStr += ")";
	    break;
      }

    case ",":
      if (inGroup) {
        reStr += "|";
	    break;
      }
      reStr += "\\" + c;
      break;

    case "*":
      // Move over all consecutive "*"'s.
      // Also store the previous and next characters
      var prevChar = str[i - 1];
      var starCount = 1;
      while(str[i + 1] === "*") {
        starCount++;
        i++;
      }
      var nextChar = str[i + 1];

      if (!globstar) {
        // globstar is disabled, so treat any number of "*" as one
        reStr += ".*";
      } else {
        // globstar is enabled, so determine if this is a globstar segment
        var isGlobstar = starCount > 1                      // multiple "*"'s
          && (prevChar === "/" || prevChar === undefined)   // from the start of the segment
          && (nextChar === "/" || nextChar === undefined)   // to the end of the segment

        if (isGlobstar) {
          // it's a globstar, so match zero or more path segments
          reStr += "((?:[^/]*(?:\/|$))*)";
          i++; // move over the "/"
        } else {
          // it's not a globstar, so only match one path segment
          reStr += "([^/]*)";
        }
      }
      break;

    default:
      reStr += c;
    }
  }

  // When regexp 'g' flag is specified don't
  // constrain the regular expression with ^ & $
  if (!flags || !~flags.indexOf('g')) {
    reStr = "^" + reStr + "$";
  }

  return new RegExp(reStr, flags);
};


/***/ }),

/***/ 444:
/***/ ((module) => {

"use strict";


module.exports = clone

var getPrototypeOf = Object.getPrototypeOf || function (obj) {
  return obj.__proto__
}

function clone (obj) {
  if (obj === null || typeof obj !== 'object')
    return obj

  if (obj instanceof Object)
    var copy = { __proto__: getPrototypeOf(obj) }
  else
    var copy = Object.create(null)

  Object.getOwnPropertyNames(obj).forEach(function (key) {
    Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key))
  })

  return copy
}


/***/ }),

/***/ 165:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var fs = __nccwpck_require__(147)
var polyfills = __nccwpck_require__(986)
var legacy = __nccwpck_require__(78)
var clone = __nccwpck_require__(444)

var util = __nccwpck_require__(837)

/* istanbul ignore next - node 0.x polyfill */
var gracefulQueue
var previousSymbol

/* istanbul ignore else - node 0.x polyfill */
if (typeof Symbol === 'function' && typeof Symbol.for === 'function') {
  gracefulQueue = Symbol.for('graceful-fs.queue')
  // This is used in testing by future versions
  previousSymbol = Symbol.for('graceful-fs.previous')
} else {
  gracefulQueue = '___graceful-fs.queue'
  previousSymbol = '___graceful-fs.previous'
}

function noop () {}

function publishQueue(context, queue) {
  Object.defineProperty(context, gracefulQueue, {
    get: function() {
      return queue
    }
  })
}

var debug = noop
if (util.debuglog)
  debug = util.debuglog('gfs4')
else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ''))
  debug = function() {
    var m = util.format.apply(util, arguments)
    m = 'GFS4: ' + m.split(/\n/).join('\nGFS4: ')
    console.error(m)
  }

// Once time initialization
if (!fs[gracefulQueue]) {
  // This queue can be shared by multiple loaded instances
  var queue = global[gracefulQueue] || []
  publishQueue(fs, queue)

  // Patch fs.close/closeSync to shared queue version, because we need
  // to retry() whenever a close happens *anywhere* in the program.
  // This is essential when multiple graceful-fs instances are
  // in play at the same time.
  fs.close = (function (fs$close) {
    function close (fd, cb) {
      return fs$close.call(fs, fd, function (err) {
        // This function uses the graceful-fs shared queue
        if (!err) {
          resetQueue()
        }

        if (typeof cb === 'function')
          cb.apply(this, arguments)
      })
    }

    Object.defineProperty(close, previousSymbol, {
      value: fs$close
    })
    return close
  })(fs.close)

  fs.closeSync = (function (fs$closeSync) {
    function closeSync (fd) {
      // This function uses the graceful-fs shared queue
      fs$closeSync.apply(fs, arguments)
      resetQueue()
    }

    Object.defineProperty(closeSync, previousSymbol, {
      value: fs$closeSync
    })
    return closeSync
  })(fs.closeSync)

  if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || '')) {
    process.on('exit', function() {
      debug(fs[gracefulQueue])
      __nccwpck_require__(491).equal(fs[gracefulQueue].length, 0)
    })
  }
}

if (!global[gracefulQueue]) {
  publishQueue(global, fs[gracefulQueue]);
}

module.exports = patch(clone(fs))
if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs.__patched) {
    module.exports = patch(fs)
    fs.__patched = true;
}

function patch (fs) {
  // Everything that references the open() function needs to be in here
  polyfills(fs)
  fs.gracefulify = patch

  fs.createReadStream = createReadStream
  fs.createWriteStream = createWriteStream
  var fs$readFile = fs.readFile
  fs.readFile = readFile
  function readFile (path, options, cb) {
    if (typeof options === 'function')
      cb = options, options = null

    return go$readFile(path, options, cb)

    function go$readFile (path, options, cb, startTime) {
      return fs$readFile(path, options, function (err) {
        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
          enqueue([go$readFile, [path, options, cb], err, startTime || Date.now(), Date.now()])
        else {
          if (typeof cb === 'function')
            cb.apply(this, arguments)
        }
      })
    }
  }

  var fs$writeFile = fs.writeFile
  fs.writeFile = writeFile
  function writeFile (path, data, options, cb) {
    if (typeof options === 'function')
      cb = options, options = null

    return go$writeFile(path, data, options, cb)

    function go$writeFile (path, data, options, cb, startTime) {
      return fs$writeFile(path, data, options, function (err) {
        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
          enqueue([go$writeFile, [path, data, options, cb], err, startTime || Date.now(), Date.now()])
        else {
          if (typeof cb === 'function')
            cb.apply(this, arguments)
        }
      })
    }
  }

  var fs$appendFile = fs.appendFile
  if (fs$appendFile)
    fs.appendFile = appendFile
  function appendFile (path, data, options, cb) {
    if (typeof options === 'function')
      cb = options, options = null

    return go$appendFile(path, data, options, cb)

    function go$appendFile (path, data, options, cb, startTime) {
      return fs$appendFile(path, data, options, function (err) {
        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
          enqueue([go$appendFile, [path, data, options, cb], err, startTime || Date.now(), Date.now()])
        else {
          if (typeof cb === 'function')
            cb.apply(this, arguments)
        }
      })
    }
  }

  var fs$copyFile = fs.copyFile
  if (fs$copyFile)
    fs.copyFile = copyFile
  function copyFile (src, dest, flags, cb) {
    if (typeof flags === 'function') {
      cb = flags
      flags = 0
    }
    return go$copyFile(src, dest, flags, cb)

    function go$copyFile (src, dest, flags, cb, startTime) {
      return fs$copyFile(src, dest, flags, function (err) {
        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
          enqueue([go$copyFile, [src, dest, flags, cb], err, startTime || Date.now(), Date.now()])
        else {
          if (typeof cb === 'function')
            cb.apply(this, arguments)
        }
      })
    }
  }

  var fs$readdir = fs.readdir
  fs.readdir = readdir
  var noReaddirOptionVersions = /^v[0-5]\./
  function readdir (path, options, cb) {
    if (typeof options === 'function')
      cb = options, options = null

    var go$readdir = noReaddirOptionVersions.test(process.version)
      ? function go$readdir (path, options, cb, startTime) {
        return fs$readdir(path, fs$readdirCallback(
          path, options, cb, startTime
        ))
      }
      : function go$readdir (path, options, cb, startTime) {
        return fs$readdir(path, options, fs$readdirCallback(
          path, options, cb, startTime
        ))
      }

    return go$readdir(path, options, cb)

    function fs$readdirCallback (path, options, cb, startTime) {
      return function (err, files) {
        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
          enqueue([
            go$readdir,
            [path, options, cb],
            err,
            startTime || Date.now(),
            Date.now()
          ])
        else {
          if (files && files.sort)
            files.sort()

          if (typeof cb === 'function')
            cb.call(this, err, files)
        }
      }
    }
  }

  if (process.version.substr(0, 4) === 'v0.8') {
    var legStreams = legacy(fs)
    ReadStream = legStreams.ReadStream
    WriteStream = legStreams.WriteStream
  }

  var fs$ReadStream = fs.ReadStream
  if (fs$ReadStream) {
    ReadStream.prototype = Object.create(fs$ReadStream.prototype)
    ReadStream.prototype.open = ReadStream$open
  }

  var fs$WriteStream = fs.WriteStream
  if (fs$WriteStream) {
    WriteStream.prototype = Object.create(fs$WriteStream.prototype)
    WriteStream.prototype.open = WriteStream$open
  }

  Object.defineProperty(fs, 'ReadStream', {
    get: function () {
      return ReadStream
    },
    set: function (val) {
      ReadStream = val
    },
    enumerable: true,
    configurable: true
  })
  Object.defineProperty(fs, 'WriteStream', {
    get: function () {
      return WriteStream
    },
    set: function (val) {
      WriteStream = val
    },
    enumerable: true,
    configurable: true
  })

  // legacy names
  var FileReadStream = ReadStream
  Object.defineProperty(fs, 'FileReadStream', {
    get: function () {
      return FileReadStream
    },
    set: function (val) {
      FileReadStream = val
    },
    enumerable: true,
    configurable: true
  })
  var FileWriteStream = WriteStream
  Object.defineProperty(fs, 'FileWriteStream', {
    get: function () {
      return FileWriteStream
    },
    set: function (val) {
      FileWriteStream = val
    },
    enumerable: true,
    configurable: true
  })

  function ReadStream (path, options) {
    if (this instanceof ReadStream)
      return fs$ReadStream.apply(this, arguments), this
    else
      return ReadStream.apply(Object.create(ReadStream.prototype), arguments)
  }

  function ReadStream$open () {
    var that = this
    open(that.path, that.flags, that.mode, function (err, fd) {
      if (err) {
        if (that.autoClose)
          that.destroy()

        that.emit('error', err)
      } else {
        that.fd = fd
        that.emit('open', fd)
        that.read()
      }
    })
  }

  function WriteStream (path, options) {
    if (this instanceof WriteStream)
      return fs$WriteStream.apply(this, arguments), this
    else
      return WriteStream.apply(Object.create(WriteStream.prototype), arguments)
  }

  function WriteStream$open () {
    var that = this
    open(that.path, that.flags, that.mode, function (err, fd) {
      if (err) {
        that.destroy()
        that.emit('error', err)
      } else {
        that.fd = fd
        that.emit('open', fd)
      }
    })
  }

  function createReadStream (path, options) {
    return new fs.ReadStream(path, options)
  }

  function createWriteStream (path, options) {
    return new fs.WriteStream(path, options)
  }

  var fs$open = fs.open
  fs.open = open
  function open (path, flags, mode, cb) {
    if (typeof mode === 'function')
      cb = mode, mode = null

    return go$open(path, flags, mode, cb)

    function go$open (path, flags, mode, cb, startTime) {
      return fs$open(path, flags, mode, function (err, fd) {
        if (err && (err.code === 'EMFILE' || err.code === 'ENFILE'))
          enqueue([go$open, [path, flags, mode, cb], err, startTime || Date.now(), Date.now()])
        else {
          if (typeof cb === 'function')
            cb.apply(this, arguments)
        }
      })
    }
  }

  return fs
}

function enqueue (elem) {
  debug('ENQUEUE', elem[0].name, elem[1])
  fs[gracefulQueue].push(elem)
  retry()
}

// keep track of the timeout between retry() calls
var retryTimer

// reset the startTime and lastTime to now
// this resets the start of the 60 second overall timeout as well as the
// delay between attempts so that we'll retry these jobs sooner
function resetQueue () {
  var now = Date.now()
  for (var i = 0; i < fs[gracefulQueue].length; ++i) {
    // entries that are only a length of 2 are from an older version, don't
    // bother modifying those since they'll be retried anyway.
    if (fs[gracefulQueue][i].length > 2) {
      fs[gracefulQueue][i][3] = now // startTime
      fs[gracefulQueue][i][4] = now // lastTime
    }
  }
  // call retry to make sure we're actively processing the queue
  retry()
}

function retry () {
  // clear the timer and remove it to help prevent unintended concurrency
  clearTimeout(retryTimer)
  retryTimer = undefined

  if (fs[gracefulQueue].length === 0)
    return

  var elem = fs[gracefulQueue].shift()
  var fn = elem[0]
  var args = elem[1]
  // these items may be unset if they were added by an older graceful-fs
  var err = elem[2]
  var startTime = elem[3]
  var lastTime = elem[4]

  // if we don't have a startTime we have no way of knowing if we've waited
  // long enough, so go ahead and retry this item now
  if (startTime === undefined) {
    debug('RETRY', fn.name, args)
    fn.apply(null, args)
  } else if (Date.now() - startTime >= 60000) {
    // it's been more than 60 seconds total, bail now
    debug('TIMEOUT', fn.name, args)
    var cb = args.pop()
    if (typeof cb === 'function')
      cb.call(null, err)
  } else {
    // the amount of time between the last attempt and right now
    var sinceAttempt = Date.now() - lastTime
    // the amount of time between when we first tried, and when we last tried
    // rounded up to at least 1
    var sinceStart = Math.max(lastTime - startTime, 1)
    // backoff. wait longer than the total time we've been retrying, but only
    // up to a maximum of 100ms
    var desiredDelay = Math.min(sinceStart * 1.2, 100)
    // it's been long enough since the last retry, do it again
    if (sinceAttempt >= desiredDelay) {
      debug('RETRY', fn.name, args)
      fn.apply(null, args.concat([startTime]))
    } else {
      // if we can't do this job yet, push it to the end of the queue
      // and let the next iteration check again
      fs[gracefulQueue].push(elem)
    }
  }

  // schedule our next run if one isn't already scheduled
  if (retryTimer === undefined) {
    retryTimer = setTimeout(retry, 0)
  }
}


/***/ }),

/***/ 78:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var Stream = (__nccwpck_require__(781).Stream)

module.exports = legacy

function legacy (fs) {
  return {
    ReadStream: ReadStream,
    WriteStream: WriteStream
  }

  function ReadStream (path, options) {
    if (!(this instanceof ReadStream)) return new ReadStream(path, options);

    Stream.call(this);

    var self = this;

    this.path = path;
    this.fd = null;
    this.readable = true;
    this.paused = false;

    this.flags = 'r';
    this.mode = 438; /*=0666*/
    this.bufferSize = 64 * 1024;

    options = options || {};

    // Mixin options into this
    var keys = Object.keys(options);
    for (var index = 0, length = keys.length; index < length; index++) {
      var key = keys[index];
      this[key] = options[key];
    }

    if (this.encoding) this.setEncoding(this.encoding);

    if (this.start !== undefined) {
      if ('number' !== typeof this.start) {
        throw TypeError('start must be a Number');
      }
      if (this.end === undefined) {
        this.end = Infinity;
      } else if ('number' !== typeof this.end) {
        throw TypeError('end must be a Number');
      }

      if (this.start > this.end) {
        throw new Error('start must be <= end');
      }

      this.pos = this.start;
    }

    if (this.fd !== null) {
      process.nextTick(function() {
        self._read();
      });
      return;
    }

    fs.open(this.path, this.flags, this.mode, function (err, fd) {
      if (err) {
        self.emit('error', err);
        self.readable = false;
        return;
      }

      self.fd = fd;
      self.emit('open', fd);
      self._read();
    })
  }

  function WriteStream (path, options) {
    if (!(this instanceof WriteStream)) return new WriteStream(path, options);

    Stream.call(this);

    this.path = path;
    this.fd = null;
    this.writable = true;

    this.flags = 'w';
    this.encoding = 'binary';
    this.mode = 438; /*=0666*/
    this.bytesWritten = 0;

    options = options || {};

    // Mixin options into this
    var keys = Object.keys(options);
    for (var index = 0, length = keys.length; index < length; index++) {
      var key = keys[index];
      this[key] = options[key];
    }

    if (this.start !== undefined) {
      if ('number' !== typeof this.start) {
        throw TypeError('start must be a Number');
      }
      if (this.start < 0) {
        throw new Error('start must be >= zero');
      }

      this.pos = this.start;
    }

    this.busy = false;
    this._queue = [];

    if (this.fd === null) {
      this._open = fs.open;
      this._queue.push([this._open, this.path, this.flags, this.mode, undefined]);
      this.flush();
    }
  }
}


/***/ }),

/***/ 986:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var constants = __nccwpck_require__(57)

var origCwd = process.cwd
var cwd = null

var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform

process.cwd = function() {
  if (!cwd)
    cwd = origCwd.call(process)
  return cwd
}
try {
  process.cwd()
} catch (er) {}

// This check is needed until node.js 12 is required
if (typeof process.chdir === 'function') {
  var chdir = process.chdir
  process.chdir = function (d) {
    cwd = null
    chdir.call(process, d)
  }
  if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir)
}

module.exports = patch

function patch (fs) {
  // (re-)implement some things that are known busted or missing.

  // lchmod, broken prior to 0.6.2
  // back-port the fix here.
  if (constants.hasOwnProperty('O_SYMLINK') &&
      process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
    patchLchmod(fs)
  }

  // lutimes implementation, or no-op
  if (!fs.lutimes) {
    patchLutimes(fs)
  }

  // https://github.com/isaacs/node-graceful-fs/issues/4
  // Chown should not fail on einval or eperm if non-root.
  // It should not fail on enosys ever, as this just indicates
  // that a fs doesn't support the intended operation.

  fs.chown = chownFix(fs.chown)
  fs.fchown = chownFix(fs.fchown)
  fs.lchown = chownFix(fs.lchown)

  fs.chmod = chmodFix(fs.chmod)
  fs.fchmod = chmodFix(fs.fchmod)
  fs.lchmod = chmodFix(fs.lchmod)

  fs.chownSync = chownFixSync(fs.chownSync)
  fs.fchownSync = chownFixSync(fs.fchownSync)
  fs.lchownSync = chownFixSync(fs.lchownSync)

  fs.chmodSync = chmodFixSync(fs.chmodSync)
  fs.fchmodSync = chmodFixSync(fs.fchmodSync)
  fs.lchmodSync = chmodFixSync(fs.lchmodSync)

  fs.stat = statFix(fs.stat)
  fs.fstat = statFix(fs.fstat)
  fs.lstat = statFix(fs.lstat)

  fs.statSync = statFixSync(fs.statSync)
  fs.fstatSync = statFixSync(fs.fstatSync)
  fs.lstatSync = statFixSync(fs.lstatSync)

  // if lchmod/lchown do not exist, then make them no-ops
  if (fs.chmod && !fs.lchmod) {
    fs.lchmod = function (path, mode, cb) {
      if (cb) process.nextTick(cb)
    }
    fs.lchmodSync = function () {}
  }
  if (fs.chown && !fs.lchown) {
    fs.lchown = function (path, uid, gid, cb) {
      if (cb) process.nextTick(cb)
    }
    fs.lchownSync = function () {}
  }

  // on Windows, A/V software can lock the directory, causing this
  // to fail with an EACCES or EPERM if the directory contains newly
  // created files.  Try again on failure, for up to 60 seconds.

  // Set the timeout this long because some Windows Anti-Virus, such as Parity
  // bit9, may lock files for up to a minute, causing npm package install
  // failures. Also, take care to yield the scheduler. Windows scheduling gives
  // CPU to a busy looping process, which can cause the program causing the lock
  // contention to be starved of CPU by node, so the contention doesn't resolve.
  if (platform === "win32") {
    fs.rename = typeof fs.rename !== 'function' ? fs.rename
    : (function (fs$rename) {
      function rename (from, to, cb) {
        var start = Date.now()
        var backoff = 0;
        fs$rename(from, to, function CB (er) {
          if (er
              && (er.code === "EACCES" || er.code === "EPERM")
              && Date.now() - start < 60000) {
            setTimeout(function() {
              fs.stat(to, function (stater, st) {
                if (stater && stater.code === "ENOENT")
                  fs$rename(from, to, CB);
                else
                  cb(er)
              })
            }, backoff)
            if (backoff < 100)
              backoff += 10;
            return;
          }
          if (cb) cb(er)
        })
      }
      if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename)
      return rename
    })(fs.rename)
  }

  // if read() returns EAGAIN, then just try it again.
  fs.read = typeof fs.read !== 'function' ? fs.read
  : (function (fs$read) {
    function read (fd, buffer, offset, length, position, callback_) {
      var callback
      if (callback_ && typeof callback_ === 'function') {
        var eagCounter = 0
        callback = function (er, _, __) {
          if (er && er.code === 'EAGAIN' && eagCounter < 10) {
            eagCounter ++
            return fs$read.call(fs, fd, buffer, offset, length, position, callback)
          }
          callback_.apply(this, arguments)
        }
      }
      return fs$read.call(fs, fd, buffer, offset, length, position, callback)
    }

    // This ensures `util.promisify` works as it does for native `fs.read`.
    if (Object.setPrototypeOf) Object.setPrototypeOf(read, fs$read)
    return read
  })(fs.read)

  fs.readSync = typeof fs.readSync !== 'function' ? fs.readSync
  : (function (fs$readSync) { return function (fd, buffer, offset, length, position) {
    var eagCounter = 0
    while (true) {
      try {
        return fs$readSync.call(fs, fd, buffer, offset, length, position)
      } catch (er) {
        if (er.code === 'EAGAIN' && eagCounter < 10) {
          eagCounter ++
          continue
        }
        throw er
      }
    }
  }})(fs.readSync)

  function patchLchmod (fs) {
    fs.lchmod = function (path, mode, callback) {
      fs.open( path
             , constants.O_WRONLY | constants.O_SYMLINK
             , mode
             , function (err, fd) {
        if (err) {
          if (callback) callback(err)
          return
        }
        // prefer to return the chmod error, if one occurs,
        // but still try to close, and report closing errors if they occur.
        fs.fchmod(fd, mode, function (err) {
          fs.close(fd, function(err2) {
            if (callback) callback(err || err2)
          })
        })
      })
    }

    fs.lchmodSync = function (path, mode) {
      var fd = fs.openSync(path, constants.O_WRONLY | constants.O_SYMLINK, mode)

      // prefer to return the chmod error, if one occurs,
      // but still try to close, and report closing errors if they occur.
      var threw = true
      var ret
      try {
        ret = fs.fchmodSync(fd, mode)
        threw = false
      } finally {
        if (threw) {
          try {
            fs.closeSync(fd)
          } catch (er) {}
        } else {
          fs.closeSync(fd)
        }
      }
      return ret
    }
  }

  function patchLutimes (fs) {
    if (constants.hasOwnProperty("O_SYMLINK") && fs.futimes) {
      fs.lutimes = function (path, at, mt, cb) {
        fs.open(path, constants.O_SYMLINK, function (er, fd) {
          if (er) {
            if (cb) cb(er)
            return
          }
          fs.futimes(fd, at, mt, function (er) {
            fs.close(fd, function (er2) {
              if (cb) cb(er || er2)
            })
          })
        })
      }

      fs.lutimesSync = function (path, at, mt) {
        var fd = fs.openSync(path, constants.O_SYMLINK)
        var ret
        var threw = true
        try {
          ret = fs.futimesSync(fd, at, mt)
          threw = false
        } finally {
          if (threw) {
            try {
              fs.closeSync(fd)
            } catch (er) {}
          } else {
            fs.closeSync(fd)
          }
        }
        return ret
      }

    } else if (fs.futimes) {
      fs.lutimes = function (_a, _b, _c, cb) { if (cb) process.nextTick(cb) }
      fs.lutimesSync = function () {}
    }
  }

  function chmodFix (orig) {
    if (!orig) return orig
    return function (target, mode, cb) {
      return orig.call(fs, target, mode, function (er) {
        if (chownErOk(er)) er = null
        if (cb) cb.apply(this, arguments)
      })
    }
  }

  function chmodFixSync (orig) {
    if (!orig) return orig
    return function (target, mode) {
      try {
        return orig.call(fs, target, mode)
      } catch (er) {
        if (!chownErOk(er)) throw er
      }
    }
  }


  function chownFix (orig) {
    if (!orig) return orig
    return function (target, uid, gid, cb) {
      return orig.call(fs, target, uid, gid, function (er) {
        if (chownErOk(er)) er = null
        if (cb) cb.apply(this, arguments)
      })
    }
  }

  function chownFixSync (orig) {
    if (!orig) return orig
    return function (target, uid, gid) {
      try {
        return orig.call(fs, target, uid, gid)
      } catch (er) {
        if (!chownErOk(er)) throw er
      }
    }
  }

  function statFix (orig) {
    if (!orig) return orig
    // Older versions of Node erroneously returned signed integers for
    // uid + gid.
    return function (target, options, cb) {
      if (typeof options === 'function') {
        cb = options
        options = null
      }
      function callback (er, stats) {
        if (stats) {
          if (stats.uid < 0) stats.uid += 0x100000000
          if (stats.gid < 0) stats.gid += 0x100000000
        }
        if (cb) cb.apply(this, arguments)
      }
      return options ? orig.call(fs, target, options, callback)
        : orig.call(fs, target, callback)
    }
  }

  function statFixSync (orig) {
    if (!orig) return orig
    // Older versions of Node erroneously returned signed integers for
    // uid + gid.
    return function (target, options) {
      var stats = options ? orig.call(fs, target, options)
        : orig.call(fs, target)
      if (stats) {
        if (stats.uid < 0) stats.uid += 0x100000000
        if (stats.gid < 0) stats.gid += 0x100000000
      }
      return stats;
    }
  }

  // ENOSYS means that the fs doesn't support the op. Just ignore
  // that, because it doesn't matter.
  //
  // if there's no getuid, or if getuid() is something other
  // than 0, and the error is EINVAL or EPERM, then just ignore
  // it.
  //
  // This specific case is a silent failure in cp, install, tar,
  // and most other unix tools that manage permissions.
  //
  // When running as root, or if other types of errors are
  // encountered, then it's strict.
  function chownErOk (er) {
    if (!er)
      return true

    if (er.code === "ENOSYS")
      return true

    var nonroot = !process.getuid || process.getuid() !== 0
    if (nonroot) {
      if (er.code === "EINVAL" || er.code === "EPERM")
        return true
    }

    return false
  }
}


/***/ }),

/***/ 377:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const EventEmitter = (__nccwpck_require__(361).EventEmitter);
const fs = __nccwpck_require__(165);
const path = __nccwpck_require__(17);

const watchEventSource = __nccwpck_require__(384);

const EXISTANCE_ONLY_TIME_ENTRY = Object.freeze({});

let FS_ACCURACY = 2000;

const IS_OSX = (__nccwpck_require__(37).platform)() === "darwin";
const WATCHPACK_POLLING = process.env.WATCHPACK_POLLING;
const FORCE_POLLING =
	`${+WATCHPACK_POLLING}` === WATCHPACK_POLLING
		? +WATCHPACK_POLLING
		: !!WATCHPACK_POLLING && WATCHPACK_POLLING !== "false";

function withoutCase(str) {
	return str.toLowerCase();
}

function needCalls(times, callback) {
	return function() {
		if (--times === 0) {
			return callback();
		}
	};
}

class Watcher extends EventEmitter {
	constructor(directoryWatcher, filePath, startTime) {
		super();
		this.directoryWatcher = directoryWatcher;
		this.path = filePath;
		this.startTime = startTime && +startTime;
	}

	checkStartTime(mtime, initial) {
		const startTime = this.startTime;
		if (typeof startTime !== "number") return !initial;
		return startTime <= mtime;
	}

	close() {
		this.emit("closed");
	}
}

class DirectoryWatcher extends EventEmitter {
	constructor(watcherManager, directoryPath, options) {
		super();
		if (FORCE_POLLING) {
			options.poll = FORCE_POLLING;
		}
		this.watcherManager = watcherManager;
		this.options = options;
		this.path = directoryPath;
		// safeTime is the point in time after which reading is safe to be unchanged
		// timestamp is a value that should be compared with another timestamp (mtime)
		/** @type {Map<string, { safeTime: number, timestamp: number }} */
		this.files = new Map();
		/** @type {Map<string, number>} */
		this.filesWithoutCase = new Map();
		this.directories = new Map();
		this.lastWatchEvent = 0;
		this.initialScan = true;
		this.ignored = options.ignored || (() => false);
		this.nestedWatching = false;
		this.polledWatching =
			typeof options.poll === "number"
				? options.poll
				: options.poll
				? 5007
				: false;
		this.timeout = undefined;
		this.initialScanRemoved = new Set();
		this.initialScanFinished = undefined;
		/** @type {Map<string, Set<Watcher>>} */
		this.watchers = new Map();
		this.parentWatcher = null;
		this.refs = 0;
		this._activeEvents = new Map();
		this.closed = false;
		this.scanning = false;
		this.scanAgain = false;
		this.scanAgainInitial = false;

		this.createWatcher();
		this.doScan(true);
	}

	createWatcher() {
		try {
			if (this.polledWatching) {
				this.watcher = {
					close: () => {
						if (this.timeout) {
							clearTimeout(this.timeout);
							this.timeout = undefined;
						}
					}
				};
			} else {
				if (IS_OSX) {
					this.watchInParentDirectory();
				}
				this.watcher = watchEventSource.watch(this.path);
				this.watcher.on("change", this.onWatchEvent.bind(this));
				this.watcher.on("error", this.onWatcherError.bind(this));
			}
		} catch (err) {
			this.onWatcherError(err);
		}
	}

	forEachWatcher(path, fn) {
		const watchers = this.watchers.get(withoutCase(path));
		if (watchers !== undefined) {
			for (const w of watchers) {
				fn(w);
			}
		}
	}

	setMissing(itemPath, initial, type) {
		if (this.initialScan) {
			this.initialScanRemoved.add(itemPath);
		}

		const oldDirectory = this.directories.get(itemPath);
		if (oldDirectory) {
			if (this.nestedWatching) oldDirectory.close();
			this.directories.delete(itemPath);

			this.forEachWatcher(itemPath, w => w.emit("remove", type));
			if (!initial) {
				this.forEachWatcher(this.path, w =>
					w.emit("change", itemPath, null, type, initial)
				);
			}
		}

		const oldFile = this.files.get(itemPath);
		if (oldFile) {
			this.files.delete(itemPath);
			const key = withoutCase(itemPath);
			const count = this.filesWithoutCase.get(key) - 1;
			if (count <= 0) {
				this.filesWithoutCase.delete(key);
				this.forEachWatcher(itemPath, w => w.emit("remove", type));
			} else {
				this.filesWithoutCase.set(key, count);
			}

			if (!initial) {
				this.forEachWatcher(this.path, w =>
					w.emit("change", itemPath, null, type, initial)
				);
			}
		}
	}

	setFileTime(filePath, mtime, initial, ignoreWhenEqual, type) {
		const now = Date.now();

		if (this.ignored(filePath)) return;

		const old = this.files.get(filePath);

		let safeTime, accuracy;
		if (initial) {
			safeTime = Math.min(now, mtime) + FS_ACCURACY;
			accuracy = FS_ACCURACY;
		} else {
			safeTime = now;
			accuracy = 0;

			if (old && old.timestamp === mtime && mtime + FS_ACCURACY < now) {
				// We are sure that mtime is untouched
				// This can be caused by some file attribute change
				// e. g. when access time has been changed
				// but the file content is untouched
				return;
			}
		}

		if (ignoreWhenEqual && old && old.timestamp === mtime) return;

		this.files.set(filePath, {
			safeTime,
			accuracy,
			timestamp: mtime
		});

		if (!old) {
			const key = withoutCase(filePath);
			const count = this.filesWithoutCase.get(key);
			this.filesWithoutCase.set(key, (count || 0) + 1);
			if (count !== undefined) {
				// There is already a file with case-insensitive-equal name
				// On a case-insensitive filesystem we may miss the renaming
				// when only casing is changed.
				// To be sure that our information is correct
				// we trigger a rescan here
				this.doScan(false);
			}

			this.forEachWatcher(filePath, w => {
				if (!initial || w.checkStartTime(safeTime, initial)) {
					w.emit("change", mtime, type);
				}
			});
		} else if (!initial) {
			this.forEachWatcher(filePath, w => w.emit("change", mtime, type));
		}
		this.forEachWatcher(this.path, w => {
			if (!initial || w.checkStartTime(safeTime, initial)) {
				w.emit("change", filePath, safeTime, type, initial);
			}
		});
	}

	setDirectory(directoryPath, birthtime, initial, type) {
		if (this.ignored(directoryPath)) return;
		if (directoryPath === this.path) {
			if (!initial) {
				this.forEachWatcher(this.path, w =>
					w.emit("change", directoryPath, birthtime, type, initial)
				);
			}
		} else {
			const old = this.directories.get(directoryPath);
			if (!old) {
				const now = Date.now();

				if (this.nestedWatching) {
					this.createNestedWatcher(directoryPath);
				} else {
					this.directories.set(directoryPath, true);
				}

				let safeTime;
				if (initial) {
					safeTime = Math.min(now, birthtime) + FS_ACCURACY;
				} else {
					safeTime = now;
				}

				this.forEachWatcher(directoryPath, w => {
					if (!initial || w.checkStartTime(safeTime, false)) {
						w.emit("change", birthtime, type);
					}
				});
				this.forEachWatcher(this.path, w => {
					if (!initial || w.checkStartTime(safeTime, initial)) {
						w.emit("change", directoryPath, safeTime, type, initial);
					}
				});
			}
		}
	}

	createNestedWatcher(directoryPath) {
		const watcher = this.watcherManager.watchDirectory(directoryPath, 1);
		watcher.on("change", (filePath, mtime, type, initial) => {
			this.forEachWatcher(this.path, w => {
				if (!initial || w.checkStartTime(mtime, initial)) {
					w.emit("change", filePath, mtime, type, initial);
				}
			});
		});
		this.directories.set(directoryPath, watcher);
	}

	setNestedWatching(flag) {
		if (this.nestedWatching !== !!flag) {
			this.nestedWatching = !!flag;
			if (this.nestedWatching) {
				for (const directory of this.directories.keys()) {
					this.createNestedWatcher(directory);
				}
			} else {
				for (const [directory, watcher] of this.directories) {
					watcher.close();
					this.directories.set(directory, true);
				}
			}
		}
	}

	watch(filePath, startTime) {
		const key = withoutCase(filePath);
		let watchers = this.watchers.get(key);
		if (watchers === undefined) {
			watchers = new Set();
			this.watchers.set(key, watchers);
		}
		this.refs++;
		const watcher = new Watcher(this, filePath, startTime);
		watcher.on("closed", () => {
			if (--this.refs <= 0) {
				this.close();
				return;
			}
			watchers.delete(watcher);
			if (watchers.size === 0) {
				this.watchers.delete(key);
				if (this.path === filePath) this.setNestedWatching(false);
			}
		});
		watchers.add(watcher);
		let safeTime;
		if (filePath === this.path) {
			this.setNestedWatching(true);
			safeTime = this.lastWatchEvent;
			for (const entry of this.files.values()) {
				fixupEntryAccuracy(entry);
				safeTime = Math.max(safeTime, entry.safeTime);
			}
		} else {
			const entry = this.files.get(filePath);
			if (entry) {
				fixupEntryAccuracy(entry);
				safeTime = entry.safeTime;
			} else {
				safeTime = 0;
			}
		}
		if (safeTime) {
			if (safeTime >= startTime) {
				process.nextTick(() => {
					if (this.closed) return;
					if (filePath === this.path) {
						watcher.emit(
							"change",
							filePath,
							safeTime,
							"watch (outdated on attach)",
							true
						);
					} else {
						watcher.emit(
							"change",
							safeTime,
							"watch (outdated on attach)",
							true
						);
					}
				});
			}
		} else if (this.initialScan) {
			if (this.initialScanRemoved.has(filePath)) {
				process.nextTick(() => {
					if (this.closed) return;
					watcher.emit("remove");
				});
			}
		} else if (
			!this.directories.has(filePath) &&
			watcher.checkStartTime(this.initialScanFinished, false)
		) {
			process.nextTick(() => {
				if (this.closed) return;
				watcher.emit("initial-missing", "watch (missing on attach)");
			});
		}
		return watcher;
	}

	onWatchEvent(eventType, filename) {
		if (this.closed) return;
		if (!filename) {
			// In some cases no filename is provided
			// This seem to happen on windows
			// So some event happened but we don't know which file is affected
			// We have to do a full scan of the directory
			this.doScan(false);
			return;
		}

		const filePath = path.join(this.path, filename);
		if (this.ignored(filePath)) return;

		if (this._activeEvents.get(filename) === undefined) {
			this._activeEvents.set(filename, false);
			const checkStats = () => {
				if (this.closed) return;
				this._activeEvents.set(filename, false);
				fs.lstat(filePath, (err, stats) => {
					if (this.closed) return;
					if (this._activeEvents.get(filename) === true) {
						process.nextTick(checkStats);
						return;
					}
					this._activeEvents.delete(filename);
					// ENOENT happens when the file/directory doesn't exist
					// EPERM happens when the containing directory doesn't exist
					if (err) {
						if (
							err.code !== "ENOENT" &&
							err.code !== "EPERM" &&
							err.code !== "EBUSY"
						) {
							this.onStatsError(err);
						} else {
							if (filename === path.basename(this.path)) {
								// This may indicate that the directory itself was removed
								if (!fs.existsSync(this.path)) {
									this.onDirectoryRemoved("stat failed");
								}
							}
						}
					}
					this.lastWatchEvent = Date.now();
					if (!stats) {
						this.setMissing(filePath, false, eventType);
					} else if (stats.isDirectory()) {
						this.setDirectory(
							filePath,
							+stats.birthtime || 1,
							false,
							eventType
						);
					} else if (stats.isFile() || stats.isSymbolicLink()) {
						if (stats.mtime) {
							ensureFsAccuracy(stats.mtime);
						}
						this.setFileTime(
							filePath,
							+stats.mtime || +stats.ctime || 1,
							false,
							false,
							eventType
						);
					}
				});
			};
			process.nextTick(checkStats);
		} else {
			this._activeEvents.set(filename, true);
		}
	}

	onWatcherError(err) {
		if (this.closed) return;
		if (err) {
			if (err.code !== "EPERM" && err.code !== "ENOENT") {
				console.error("Watchpack Error (watcher): " + err);
			}
			this.onDirectoryRemoved("watch error");
		}
	}

	onStatsError(err) {
		if (err) {
			console.error("Watchpack Error (stats): " + err);
		}
	}

	onScanError(err) {
		if (err) {
			console.error("Watchpack Error (initial scan): " + err);
		}
		this.onScanFinished();
	}

	onScanFinished() {
		if (this.polledWatching) {
			this.timeout = setTimeout(() => {
				if (this.closed) return;
				this.doScan(false);
			}, this.polledWatching);
		}
	}

	onDirectoryRemoved(reason) {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
		this.watchInParentDirectory();
		const type = `directory-removed (${reason})`;
		for (const directory of this.directories.keys()) {
			this.setMissing(directory, null, type);
		}
		for (const file of this.files.keys()) {
			this.setMissing(file, null, type);
		}
	}

	watchInParentDirectory() {
		if (!this.parentWatcher) {
			const parentDir = path.dirname(this.path);
			// avoid watching in the root directory
			// removing directories in the root directory is not supported
			if (path.dirname(parentDir) === parentDir) return;

			this.parentWatcher = this.watcherManager.watchFile(this.path, 1);
			this.parentWatcher.on("change", (mtime, type) => {
				if (this.closed) return;

				// On non-osx platforms we don't need this watcher to detect
				// directory removal, as an EPERM error indicates that
				if ((!IS_OSX || this.polledWatching) && this.parentWatcher) {
					this.parentWatcher.close();
					this.parentWatcher = null;
				}
				// Try to create the watcher when parent directory is found
				if (!this.watcher) {
					this.createWatcher();
					this.doScan(false);

					// directory was created so we emit an event
					this.forEachWatcher(this.path, w =>
						w.emit("change", this.path, mtime, type, false)
					);
				}
			});
			this.parentWatcher.on("remove", () => {
				this.onDirectoryRemoved("parent directory removed");
			});
		}
	}

	doScan(initial) {
		if (this.scanning) {
			if (this.scanAgain) {
				if (!initial) this.scanAgainInitial = false;
			} else {
				this.scanAgain = true;
				this.scanAgainInitial = initial;
			}
			return;
		}
		this.scanning = true;
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
		process.nextTick(() => {
			if (this.closed) return;
			fs.readdir(this.path, (err, items) => {
				if (this.closed) return;
				if (err) {
					if (err.code === "ENOENT" || err.code === "EPERM") {
						this.onDirectoryRemoved("scan readdir failed");
					} else {
						this.onScanError(err);
					}
					this.initialScan = false;
					this.initialScanFinished = Date.now();
					if (initial) {
						for (const watchers of this.watchers.values()) {
							for (const watcher of watchers) {
								if (watcher.checkStartTime(this.initialScanFinished, false)) {
									watcher.emit(
										"initial-missing",
										"scan (parent directory missing in initial scan)"
									);
								}
							}
						}
					}
					if (this.scanAgain) {
						this.scanAgain = false;
						this.doScan(this.scanAgainInitial);
					} else {
						this.scanning = false;
					}
					return;
				}
				const itemPaths = new Set(
					items.map(item => path.join(this.path, item.normalize("NFC")))
				);
				for (const file of this.files.keys()) {
					if (!itemPaths.has(file)) {
						this.setMissing(file, initial, "scan (missing)");
					}
				}
				for (const directory of this.directories.keys()) {
					if (!itemPaths.has(directory)) {
						this.setMissing(directory, initial, "scan (missing)");
					}
				}
				if (this.scanAgain) {
					// Early repeat of scan
					this.scanAgain = false;
					this.doScan(initial);
					return;
				}
				const itemFinished = needCalls(itemPaths.size + 1, () => {
					if (this.closed) return;
					this.initialScan = false;
					this.initialScanRemoved = null;
					this.initialScanFinished = Date.now();
					if (initial) {
						const missingWatchers = new Map(this.watchers);
						missingWatchers.delete(withoutCase(this.path));
						for (const item of itemPaths) {
							missingWatchers.delete(withoutCase(item));
						}
						for (const watchers of missingWatchers.values()) {
							for (const watcher of watchers) {
								if (watcher.checkStartTime(this.initialScanFinished, false)) {
									watcher.emit(
										"initial-missing",
										"scan (missing in initial scan)"
									);
								}
							}
						}
					}
					if (this.scanAgain) {
						this.scanAgain = false;
						this.doScan(this.scanAgainInitial);
					} else {
						this.scanning = false;
						this.onScanFinished();
					}
				});
				for (const itemPath of itemPaths) {
					fs.lstat(itemPath, (err2, stats) => {
						if (this.closed) return;
						if (err2) {
							if (
								err2.code === "ENOENT" ||
								err2.code === "EPERM" ||
								err2.code === "EACCES" ||
								err2.code === "EBUSY"
							) {
								this.setMissing(itemPath, initial, "scan (" + err2.code + ")");
							} else {
								this.onScanError(err2);
							}
							itemFinished();
							return;
						}
						if (stats.isFile() || stats.isSymbolicLink()) {
							if (stats.mtime) {
								ensureFsAccuracy(stats.mtime);
							}
							this.setFileTime(
								itemPath,
								+stats.mtime || +stats.ctime || 1,
								initial,
								true,
								"scan (file)"
							);
						} else if (stats.isDirectory()) {
							if (!initial || !this.directories.has(itemPath))
								this.setDirectory(
									itemPath,
									+stats.birthtime || 1,
									initial,
									"scan (dir)"
								);
						}
						itemFinished();
					});
				}
				itemFinished();
			});
		});
	}

	getTimes() {
		const obj = Object.create(null);
		let safeTime = this.lastWatchEvent;
		for (const [file, entry] of this.files) {
			fixupEntryAccuracy(entry);
			safeTime = Math.max(safeTime, entry.safeTime);
			obj[file] = Math.max(entry.safeTime, entry.timestamp);
		}
		if (this.nestedWatching) {
			for (const w of this.directories.values()) {
				const times = w.directoryWatcher.getTimes();
				for (const file of Object.keys(times)) {
					const time = times[file];
					safeTime = Math.max(safeTime, time);
					obj[file] = time;
				}
			}
			obj[this.path] = safeTime;
		}
		if (!this.initialScan) {
			for (const watchers of this.watchers.values()) {
				for (const watcher of watchers) {
					const path = watcher.path;
					if (!Object.prototype.hasOwnProperty.call(obj, path)) {
						obj[path] = null;
					}
				}
			}
		}
		return obj;
	}

	collectTimeInfoEntries(fileTimestamps, directoryTimestamps) {
		let safeTime = this.lastWatchEvent;
		for (const [file, entry] of this.files) {
			fixupEntryAccuracy(entry);
			safeTime = Math.max(safeTime, entry.safeTime);
			fileTimestamps.set(file, entry);
		}
		if (this.nestedWatching) {
			for (const w of this.directories.values()) {
				safeTime = Math.max(
					safeTime,
					w.directoryWatcher.collectTimeInfoEntries(
						fileTimestamps,
						directoryTimestamps
					)
				);
			}
			fileTimestamps.set(this.path, EXISTANCE_ONLY_TIME_ENTRY);
			directoryTimestamps.set(this.path, {
				safeTime
			});
		} else {
			for (const dir of this.directories.keys()) {
				// No additional info about this directory
				// but maybe another DirectoryWatcher has info
				fileTimestamps.set(dir, EXISTANCE_ONLY_TIME_ENTRY);
				if (!directoryTimestamps.has(dir))
					directoryTimestamps.set(dir, EXISTANCE_ONLY_TIME_ENTRY);
			}
			fileTimestamps.set(this.path, EXISTANCE_ONLY_TIME_ENTRY);
			directoryTimestamps.set(this.path, EXISTANCE_ONLY_TIME_ENTRY);
		}
		if (!this.initialScan) {
			for (const watchers of this.watchers.values()) {
				for (const watcher of watchers) {
					const path = watcher.path;
					if (!fileTimestamps.has(path)) {
						fileTimestamps.set(path, null);
					}
				}
			}
		}
		return safeTime;
	}

	close() {
		this.closed = true;
		this.initialScan = false;
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
		if (this.nestedWatching) {
			for (const w of this.directories.values()) {
				w.close();
			}
			this.directories.clear();
		}
		if (this.parentWatcher) {
			this.parentWatcher.close();
			this.parentWatcher = null;
		}
		this.emit("closed");
	}
}

module.exports = DirectoryWatcher;
module.exports.EXISTANCE_ONLY_TIME_ENTRY = EXISTANCE_ONLY_TIME_ENTRY;

function fixupEntryAccuracy(entry) {
	if (entry.accuracy > FS_ACCURACY) {
		entry.safeTime = entry.safeTime - entry.accuracy + FS_ACCURACY;
		entry.accuracy = FS_ACCURACY;
	}
}

function ensureFsAccuracy(mtime) {
	if (!mtime) return;
	if (FS_ACCURACY > 1 && mtime % 1 !== 0) FS_ACCURACY = 1;
	else if (FS_ACCURACY > 10 && mtime % 10 !== 0) FS_ACCURACY = 10;
	else if (FS_ACCURACY > 100 && mtime % 100 !== 0) FS_ACCURACY = 100;
	else if (FS_ACCURACY > 1000 && mtime % 1000 !== 0) FS_ACCURACY = 1000;
}


/***/ }),

/***/ 73:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const fs = __nccwpck_require__(147);
const path = __nccwpck_require__(17);

// macOS, Linux, and Windows all rely on these errors
const EXPECTED_ERRORS = new Set(["EINVAL", "ENOENT"]);

// On Windows there is also this error in some cases
if (process.platform === "win32") EXPECTED_ERRORS.add("UNKNOWN");

class LinkResolver {
	constructor() {
		this.cache = new Map();
	}

	/**
	 * @param {string} file path to file or directory
	 * @returns {string[]} array of file and all symlinks contributed in the resolving process (first item is the resolved file)
	 */
	resolve(file) {
		const cacheEntry = this.cache.get(file);
		if (cacheEntry !== undefined) {
			return cacheEntry;
		}
		const parent = path.dirname(file);
		if (parent === file) {
			// At root of filesystem there can't be a link
			const result = Object.freeze([file]);
			this.cache.set(file, result);
			return result;
		}
		// resolve the parent directory to find links there and get the real path
		const parentResolved = this.resolve(parent);
		let realFile = file;

		// is the parent directory really somewhere else?
		if (parentResolved[0] !== parent) {
			// get the real location of file
			const basename = path.basename(file);
			realFile = path.resolve(parentResolved[0], basename);
		}
		// try to read the link content
		try {
			const linkContent = fs.readlinkSync(realFile);

			// resolve the link content relative to the parent directory
			const resolvedLink = path.resolve(parentResolved[0], linkContent);

			// recursive resolve the link content for more links in the structure
			const linkResolved = this.resolve(resolvedLink);

			// merge parent and link resolve results
			let result;
			if (linkResolved.length > 1 && parentResolved.length > 1) {
				// when both contain links we need to duplicate them with a Set
				const resultSet = new Set(linkResolved);
				// add the link
				resultSet.add(realFile);
				// add all symlinks of the parent
				for (let i = 1; i < parentResolved.length; i++) {
					resultSet.add(parentResolved[i]);
				}
				result = Object.freeze(Array.from(resultSet));
			} else if (parentResolved.length > 1) {
				// we have links in the parent but not for the link content location
				result = parentResolved.slice();
				result[0] = linkResolved[0];
				// add the link
				result.push(realFile);
				Object.freeze(result);
			} else if (linkResolved.length > 1) {
				// we can return the link content location result
				result = linkResolved.slice();
				// add the link
				result.push(realFile);
				Object.freeze(result);
			} else {
				// neither link content location nor parent have links
				// this link is the only link here
				result = Object.freeze([
					// the resolve real location
					linkResolved[0],
					// add the link
					realFile
				]);
			}
			this.cache.set(file, result);
			return result;
		} catch (e) {
			if (!EXPECTED_ERRORS.has(e.code)) {
				throw e;
			}
			// no link
			const result = parentResolved.slice();
			result[0] = realFile;
			Object.freeze(result);
			this.cache.set(file, result);
			return result;
		}
	}
}
module.exports = LinkResolver;


/***/ }),

/***/ 653:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const path = __nccwpck_require__(17);
const DirectoryWatcher = __nccwpck_require__(377);

class WatcherManager {
	constructor(options) {
		this.options = options;
		this.directoryWatchers = new Map();
	}

	getDirectoryWatcher(directory) {
		const watcher = this.directoryWatchers.get(directory);
		if (watcher === undefined) {
			const newWatcher = new DirectoryWatcher(this, directory, this.options);
			this.directoryWatchers.set(directory, newWatcher);
			newWatcher.on("closed", () => {
				this.directoryWatchers.delete(directory);
			});
			return newWatcher;
		}
		return watcher;
	}

	watchFile(p, startTime) {
		const directory = path.dirname(p);
		if (directory === p) return null;
		return this.getDirectoryWatcher(directory).watch(p, startTime);
	}

	watchDirectory(directory, startTime) {
		return this.getDirectoryWatcher(directory).watch(directory, startTime);
	}
}

const watcherManagers = new WeakMap();
/**
 * @param {object} options options
 * @returns {WatcherManager} the watcher manager
 */
module.exports = options => {
	const watcherManager = watcherManagers.get(options);
	if (watcherManager !== undefined) return watcherManager;
	const newWatcherManager = new WatcherManager(options);
	watcherManagers.set(options, newWatcherManager);
	return newWatcherManager;
};
module.exports.WatcherManager = WatcherManager;


/***/ }),

/***/ 535:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const path = __nccwpck_require__(17);

/**
 * @template T
 * @typedef {Object} TreeNode
 * @property {string} filePath
 * @property {TreeNode} parent
 * @property {TreeNode[]} children
 * @property {number} entries
 * @property {boolean} active
 * @property {T[] | T | undefined} value
 */

/**
 * @template T
 * @param {Map<string, T[] | T} plan
 * @param {number} limit
 * @returns {Map<string, Map<T, string>>} the new plan
 */
module.exports = (plan, limit) => {
	const treeMap = new Map();
	// Convert to tree
	for (const [filePath, value] of plan) {
		treeMap.set(filePath, {
			filePath,
			parent: undefined,
			children: undefined,
			entries: 1,
			active: true,
			value
		});
	}
	let currentCount = treeMap.size;
	// Create parents and calculate sum of entries
	for (const node of treeMap.values()) {
		const parentPath = path.dirname(node.filePath);
		if (parentPath !== node.filePath) {
			let parent = treeMap.get(parentPath);
			if (parent === undefined) {
				parent = {
					filePath: parentPath,
					parent: undefined,
					children: [node],
					entries: node.entries,
					active: false,
					value: undefined
				};
				treeMap.set(parentPath, parent);
				node.parent = parent;
			} else {
				node.parent = parent;
				if (parent.children === undefined) {
					parent.children = [node];
				} else {
					parent.children.push(node);
				}
				do {
					parent.entries += node.entries;
					parent = parent.parent;
				} while (parent);
			}
		}
	}
	// Reduce until limit reached
	while (currentCount > limit) {
		// Select node that helps reaching the limit most effectively without overmerging
		const overLimit = currentCount - limit;
		let bestNode = undefined;
		let bestCost = Infinity;
		for (const node of treeMap.values()) {
			if (node.entries <= 1 || !node.children || !node.parent) continue;
			if (node.children.length === 0) continue;
			if (node.children.length === 1 && !node.value) continue;
			// Try to select the node with has just a bit more entries than we need to reduce
			// When just a bit more is over 30% over the limit,
			// also consider just a bit less entries then we need to reduce
			const cost =
				node.entries - 1 >= overLimit
					? node.entries - 1 - overLimit
					: overLimit - node.entries + 1 + limit * 0.3;
			if (cost < bestCost) {
				bestNode = node;
				bestCost = cost;
			}
		}
		if (!bestNode) break;
		// Merge all children
		const reduction = bestNode.entries - 1;
		bestNode.active = true;
		bestNode.entries = 1;
		currentCount -= reduction;
		let parent = bestNode.parent;
		while (parent) {
			parent.entries -= reduction;
			parent = parent.parent;
		}
		const queue = new Set(bestNode.children);
		for (const node of queue) {
			node.active = false;
			node.entries = 0;
			if (node.children) {
				for (const child of node.children) queue.add(child);
			}
		}
	}
	// Write down new plan
	const newPlan = new Map();
	for (const rootNode of treeMap.values()) {
		if (!rootNode.active) continue;
		const map = new Map();
		const queue = new Set([rootNode]);
		for (const node of queue) {
			if (node.active && node !== rootNode) continue;
			if (node.value) {
				if (Array.isArray(node.value)) {
					for (const item of node.value) {
						map.set(item, node.filePath);
					}
				} else {
					map.set(node.value, node.filePath);
				}
			}
			if (node.children) {
				for (const child of node.children) {
					queue.add(child);
				}
			}
		}
		newPlan.set(rootNode.filePath, map);
	}
	return newPlan;
};


/***/ }),

/***/ 384:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const fs = __nccwpck_require__(147);
const path = __nccwpck_require__(17);
const { EventEmitter } = __nccwpck_require__(361);
const reducePlan = __nccwpck_require__(535);

const IS_OSX = (__nccwpck_require__(37).platform)() === "darwin";
const IS_WIN = (__nccwpck_require__(37).platform)() === "win32";
const SUPPORTS_RECURSIVE_WATCHING = IS_OSX || IS_WIN;

const watcherLimit =
	+process.env.WATCHPACK_WATCHER_LIMIT || (IS_OSX ? 2000 : 10000);

const recursiveWatcherLogging = !!process.env
	.WATCHPACK_RECURSIVE_WATCHER_LOGGING;

let isBatch = false;
let watcherCount = 0;

/** @type {Map<Watcher, string>} */
const pendingWatchers = new Map();

/** @type {Map<string, RecursiveWatcher>} */
const recursiveWatchers = new Map();

/** @type {Map<string, DirectWatcher>} */
const directWatchers = new Map();

/** @type {Map<Watcher, RecursiveWatcher | DirectWatcher>} */
const underlyingWatcher = new Map();

class DirectWatcher {
	constructor(filePath) {
		this.filePath = filePath;
		this.watchers = new Set();
		this.watcher = undefined;
		try {
			const watcher = fs.watch(filePath);
			this.watcher = watcher;
			watcher.on("change", (type, filename) => {
				for (const w of this.watchers) {
					w.emit("change", type, filename);
				}
			});
			watcher.on("error", error => {
				for (const w of this.watchers) {
					w.emit("error", error);
				}
			});
		} catch (err) {
			process.nextTick(() => {
				for (const w of this.watchers) {
					w.emit("error", err);
				}
			});
		}
		watcherCount++;
	}

	add(watcher) {
		underlyingWatcher.set(watcher, this);
		this.watchers.add(watcher);
	}

	remove(watcher) {
		this.watchers.delete(watcher);
		if (this.watchers.size === 0) {
			directWatchers.delete(this.filePath);
			watcherCount--;
			if (this.watcher) this.watcher.close();
		}
	}

	getWatchers() {
		return this.watchers;
	}
}

class RecursiveWatcher {
	constructor(rootPath) {
		this.rootPath = rootPath;
		/** @type {Map<Watcher, string>} */
		this.mapWatcherToPath = new Map();
		/** @type {Map<string, Set<Watcher>>} */
		this.mapPathToWatchers = new Map();
		this.watcher = undefined;
		try {
			const watcher = fs.watch(rootPath, {
				recursive: true
			});
			this.watcher = watcher;
			watcher.on("change", (type, filename) => {
				if (!filename) {
					if (recursiveWatcherLogging) {
						process.stderr.write(
							`[watchpack] dispatch ${type} event in recursive watcher (${
								this.rootPath
							}) to all watchers\n`
						);
					}
					for (const w of this.mapWatcherToPath.keys()) {
						w.emit("change", type);
					}
				} else {
					const dir = path.dirname(filename);
					const watchers = this.mapPathToWatchers.get(dir);
					if (recursiveWatcherLogging) {
						process.stderr.write(
							`[watchpack] dispatch ${type} event in recursive watcher (${
								this.rootPath
							}) for '${filename}' to ${
								watchers ? watchers.size : 0
							} watchers\n`
						);
					}
					if (watchers === undefined) return;
					for (const w of watchers) {
						w.emit("change", type, path.basename(filename));
					}
				}
			});
			watcher.on("error", error => {
				for (const w of this.mapWatcherToPath.keys()) {
					w.emit("error", error);
				}
			});
		} catch (err) {
			process.nextTick(() => {
				for (const w of this.mapWatcherToPath.keys()) {
					w.emit("error", err);
				}
			});
		}
		watcherCount++;
		if (recursiveWatcherLogging) {
			process.stderr.write(
				`[watchpack] created recursive watcher at ${rootPath}\n`
			);
		}
	}

	add(filePath, watcher) {
		underlyingWatcher.set(watcher, this);
		const subpath = filePath.slice(this.rootPath.length + 1) || ".";
		this.mapWatcherToPath.set(watcher, subpath);
		const set = this.mapPathToWatchers.get(subpath);
		if (set === undefined) {
			const newSet = new Set();
			newSet.add(watcher);
			this.mapPathToWatchers.set(subpath, newSet);
		} else {
			set.add(watcher);
		}
	}

	remove(watcher) {
		const subpath = this.mapWatcherToPath.get(watcher);
		if (!subpath) return;
		this.mapWatcherToPath.delete(watcher);
		const set = this.mapPathToWatchers.get(subpath);
		set.delete(watcher);
		if (set.size === 0) {
			this.mapPathToWatchers.delete(subpath);
		}
		if (this.mapWatcherToPath.size === 0) {
			recursiveWatchers.delete(this.rootPath);
			watcherCount--;
			if (this.watcher) this.watcher.close();
			if (recursiveWatcherLogging) {
				process.stderr.write(
					`[watchpack] closed recursive watcher at ${this.rootPath}\n`
				);
			}
		}
	}

	getWatchers() {
		return this.mapWatcherToPath;
	}
}

class Watcher extends EventEmitter {
	close() {
		if (pendingWatchers.has(this)) {
			pendingWatchers.delete(this);
			return;
		}
		const watcher = underlyingWatcher.get(this);
		watcher.remove(this);
		underlyingWatcher.delete(this);
	}
}

const createDirectWatcher = filePath => {
	const existing = directWatchers.get(filePath);
	if (existing !== undefined) return existing;
	const w = new DirectWatcher(filePath);
	directWatchers.set(filePath, w);
	return w;
};

const createRecursiveWatcher = rootPath => {
	const existing = recursiveWatchers.get(rootPath);
	if (existing !== undefined) return existing;
	const w = new RecursiveWatcher(rootPath);
	recursiveWatchers.set(rootPath, w);
	return w;
};

const execute = () => {
	/** @type {Map<string, Watcher[] | Watcher>} */
	const map = new Map();
	const addWatcher = (watcher, filePath) => {
		const entry = map.get(filePath);
		if (entry === undefined) {
			map.set(filePath, watcher);
		} else if (Array.isArray(entry)) {
			entry.push(watcher);
		} else {
			map.set(filePath, [entry, watcher]);
		}
	};
	for (const [watcher, filePath] of pendingWatchers) {
		addWatcher(watcher, filePath);
	}
	pendingWatchers.clear();

	// Fast case when we are not reaching the limit
	if (!SUPPORTS_RECURSIVE_WATCHING || watcherLimit - watcherCount >= map.size) {
		// Create watchers for all entries in the map
		for (const [filePath, entry] of map) {
			const w = createDirectWatcher(filePath);
			if (Array.isArray(entry)) {
				for (const item of entry) w.add(item);
			} else {
				w.add(entry);
			}
		}
		return;
	}

	// Reconsider existing watchers to improving watch plan
	for (const watcher of recursiveWatchers.values()) {
		for (const [w, subpath] of watcher.getWatchers()) {
			addWatcher(w, path.join(watcher.rootPath, subpath));
		}
	}
	for (const watcher of directWatchers.values()) {
		for (const w of watcher.getWatchers()) {
			addWatcher(w, watcher.filePath);
		}
	}

	// Merge map entries to keep watcher limit
	// Create a 10% buffer to be able to enter fast case more often
	const plan = reducePlan(map, watcherLimit * 0.9);

	// Update watchers for all entries in the map
	for (const [filePath, entry] of plan) {
		if (entry.size === 1) {
			for (const [watcher, filePath] of entry) {
				const w = createDirectWatcher(filePath);
				const old = underlyingWatcher.get(watcher);
				if (old === w) continue;
				w.add(watcher);
				if (old !== undefined) old.remove(watcher);
			}
		} else {
			const filePaths = new Set(entry.values());
			if (filePaths.size > 1) {
				const w = createRecursiveWatcher(filePath);
				for (const [watcher, watcherPath] of entry) {
					const old = underlyingWatcher.get(watcher);
					if (old === w) continue;
					w.add(watcherPath, watcher);
					if (old !== undefined) old.remove(watcher);
				}
			} else {
				for (const filePath of filePaths) {
					const w = createDirectWatcher(filePath);
					for (const watcher of entry.keys()) {
						const old = underlyingWatcher.get(watcher);
						if (old === w) continue;
						w.add(watcher);
						if (old !== undefined) old.remove(watcher);
					}
				}
			}
		}
	}
};

exports.watch = filePath => {
	const watcher = new Watcher();
	// Find an existing watcher
	const directWatcher = directWatchers.get(filePath);
	if (directWatcher !== undefined) {
		directWatcher.add(watcher);
		return watcher;
	}
	let current = filePath;
	for (;;) {
		const recursiveWatcher = recursiveWatchers.get(current);
		if (recursiveWatcher !== undefined) {
			recursiveWatcher.add(filePath, watcher);
			return watcher;
		}
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	// Queue up watcher for creation
	pendingWatchers.set(watcher, filePath);
	if (!isBatch) execute();
	return watcher;
};

exports.batch = fn => {
	isBatch = true;
	try {
		fn();
	} finally {
		isBatch = false;
		execute();
	}
};

exports.getNumberOfWatchers = () => {
	return watcherCount;
};


/***/ }),

/***/ 747:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const getWatcherManager = __nccwpck_require__(653);
const LinkResolver = __nccwpck_require__(73);
const EventEmitter = (__nccwpck_require__(361).EventEmitter);
const globToRegExp = __nccwpck_require__(660);
const watchEventSource = __nccwpck_require__(384);

const EMPTY_ARRAY = [];
const EMPTY_OPTIONS = {};

function addWatchersToSet(watchers, set) {
	for (const ww of watchers) {
		const w = ww.watcher;
		if (!set.has(w.directoryWatcher)) {
			set.add(w.directoryWatcher);
		}
	}
}

const stringToRegexp = ignored => {
	const source = globToRegExp(ignored, { globstar: true, extended: true })
		.source;
	const matchingStart = source.slice(0, source.length - 1) + "(?:$|\\/)";
	return matchingStart;
};

const ignoredToFunction = ignored => {
	if (Array.isArray(ignored)) {
		const regexp = new RegExp(ignored.map(i => stringToRegexp(i)).join("|"));
		return x => regexp.test(x.replace(/\\/g, "/"));
	} else if (typeof ignored === "string") {
		const regexp = new RegExp(stringToRegexp(ignored));
		return x => regexp.test(x.replace(/\\/g, "/"));
	} else if (ignored instanceof RegExp) {
		return x => ignored.test(x.replace(/\\/g, "/"));
	} else if (ignored instanceof Function) {
		return ignored;
	} else if (ignored) {
		throw new Error(`Invalid option for 'ignored': ${ignored}`);
	} else {
		return () => false;
	}
};

const normalizeOptions = options => {
	return {
		followSymlinks: !!options.followSymlinks,
		ignored: ignoredToFunction(options.ignored),
		poll: options.poll
	};
};

const normalizeCache = new WeakMap();
const cachedNormalizeOptions = options => {
	const cacheEntry = normalizeCache.get(options);
	if (cacheEntry !== undefined) return cacheEntry;
	const normalized = normalizeOptions(options);
	normalizeCache.set(options, normalized);
	return normalized;
};

class WatchpackFileWatcher {
	constructor(watchpack, watcher, files) {
		this.files = Array.isArray(files) ? files : [files];
		this.watcher = watcher;
		watcher.on("initial-missing", type => {
			for (const file of this.files) {
				if (!watchpack._missing.has(file))
					watchpack._onRemove(file, file, type);
			}
		});
		watcher.on("change", (mtime, type) => {
			for (const file of this.files) {
				watchpack._onChange(file, mtime, file, type);
			}
		});
		watcher.on("remove", type => {
			for (const file of this.files) {
				watchpack._onRemove(file, file, type);
			}
		});
	}

	update(files) {
		if (!Array.isArray(files)) {
			if (this.files.length !== 1) {
				this.files = [files];
			} else if (this.files[0] !== files) {
				this.files[0] = files;
			}
		} else {
			this.files = files;
		}
	}

	close() {
		this.watcher.close();
	}
}

class WatchpackDirectoryWatcher {
	constructor(watchpack, watcher, directories) {
		this.directories = Array.isArray(directories) ? directories : [directories];
		this.watcher = watcher;
		watcher.on("initial-missing", type => {
			for (const item of this.directories) {
				watchpack._onRemove(item, item, type);
			}
		});
		watcher.on("change", (file, mtime, type) => {
			for (const item of this.directories) {
				watchpack._onChange(item, mtime, file, type);
			}
		});
		watcher.on("remove", type => {
			for (const item of this.directories) {
				watchpack._onRemove(item, item, type);
			}
		});
	}

	update(directories) {
		if (!Array.isArray(directories)) {
			if (this.directories.length !== 1) {
				this.directories = [directories];
			} else if (this.directories[0] !== directories) {
				this.directories[0] = directories;
			}
		} else {
			this.directories = directories;
		}
	}

	close() {
		this.watcher.close();
	}
}

class Watchpack extends EventEmitter {
	constructor(options) {
		super();
		if (!options) options = EMPTY_OPTIONS;
		this.options = options;
		this.aggregateTimeout =
			typeof options.aggregateTimeout === "number"
				? options.aggregateTimeout
				: 200;
		this.watcherOptions = cachedNormalizeOptions(options);
		this.watcherManager = getWatcherManager(this.watcherOptions);
		this.fileWatchers = new Map();
		this.directoryWatchers = new Map();
		this._missing = new Set();
		this.startTime = undefined;
		this.paused = false;
		this.aggregatedChanges = new Set();
		this.aggregatedRemovals = new Set();
		this.aggregateTimer = undefined;
		this._onTimeout = this._onTimeout.bind(this);
	}

	watch(arg1, arg2, arg3) {
		let files, directories, missing, startTime;
		if (!arg2) {
			({
				files = EMPTY_ARRAY,
				directories = EMPTY_ARRAY,
				missing = EMPTY_ARRAY,
				startTime
			} = arg1);
		} else {
			files = arg1;
			directories = arg2;
			missing = EMPTY_ARRAY;
			startTime = arg3;
		}
		this.paused = false;
		const fileWatchers = this.fileWatchers;
		const directoryWatchers = this.directoryWatchers;
		const ignored = this.watcherOptions.ignored;
		const filter = path => !ignored(path);
		const addToMap = (map, key, item) => {
			const list = map.get(key);
			if (list === undefined) {
				map.set(key, item);
			} else if (Array.isArray(list)) {
				list.push(item);
			} else {
				map.set(key, [list, item]);
			}
		};
		const fileWatchersNeeded = new Map();
		const directoryWatchersNeeded = new Map();
		const missingFiles = new Set();
		if (this.watcherOptions.followSymlinks) {
			const resolver = new LinkResolver();
			for (const file of files) {
				if (filter(file)) {
					for (const innerFile of resolver.resolve(file)) {
						if (file === innerFile || filter(innerFile)) {
							addToMap(fileWatchersNeeded, innerFile, file);
						}
					}
				}
			}
			for (const file of missing) {
				if (filter(file)) {
					for (const innerFile of resolver.resolve(file)) {
						if (file === innerFile || filter(innerFile)) {
							missingFiles.add(file);
							addToMap(fileWatchersNeeded, innerFile, file);
						}
					}
				}
			}
			for (const dir of directories) {
				if (filter(dir)) {
					let first = true;
					for (const innerItem of resolver.resolve(dir)) {
						if (filter(innerItem)) {
							addToMap(
								first ? directoryWatchersNeeded : fileWatchersNeeded,
								innerItem,
								dir
							);
						}
						first = false;
					}
				}
			}
		} else {
			for (const file of files) {
				if (filter(file)) {
					addToMap(fileWatchersNeeded, file, file);
				}
			}
			for (const file of missing) {
				if (filter(file)) {
					missingFiles.add(file);
					addToMap(fileWatchersNeeded, file, file);
				}
			}
			for (const dir of directories) {
				if (filter(dir)) {
					addToMap(directoryWatchersNeeded, dir, dir);
				}
			}
		}
		// Close unneeded old watchers
		// and update existing watchers
		for (const [key, w] of fileWatchers) {
			const needed = fileWatchersNeeded.get(key);
			if (needed === undefined) {
				w.close();
				fileWatchers.delete(key);
			} else {
				w.update(needed);
				fileWatchersNeeded.delete(key);
			}
		}
		for (const [key, w] of directoryWatchers) {
			const needed = directoryWatchersNeeded.get(key);
			if (needed === undefined) {
				w.close();
				directoryWatchers.delete(key);
			} else {
				w.update(needed);
				directoryWatchersNeeded.delete(key);
			}
		}
		// Create new watchers and install handlers on these watchers
		watchEventSource.batch(() => {
			for (const [key, files] of fileWatchersNeeded) {
				const watcher = this.watcherManager.watchFile(key, startTime);
				if (watcher) {
					fileWatchers.set(key, new WatchpackFileWatcher(this, watcher, files));
				}
			}
			for (const [key, directories] of directoryWatchersNeeded) {
				const watcher = this.watcherManager.watchDirectory(key, startTime);
				if (watcher) {
					directoryWatchers.set(
						key,
						new WatchpackDirectoryWatcher(this, watcher, directories)
					);
				}
			}
		});
		this._missing = missingFiles;
		this.startTime = startTime;
	}

	close() {
		this.paused = true;
		if (this.aggregateTimer) clearTimeout(this.aggregateTimer);
		for (const w of this.fileWatchers.values()) w.close();
		for (const w of this.directoryWatchers.values()) w.close();
		this.fileWatchers.clear();
		this.directoryWatchers.clear();
	}

	pause() {
		this.paused = true;
		if (this.aggregateTimer) clearTimeout(this.aggregateTimer);
	}

	getTimes() {
		const directoryWatchers = new Set();
		addWatchersToSet(this.fileWatchers.values(), directoryWatchers);
		addWatchersToSet(this.directoryWatchers.values(), directoryWatchers);
		const obj = Object.create(null);
		for (const w of directoryWatchers) {
			const times = w.getTimes();
			for (const file of Object.keys(times)) obj[file] = times[file];
		}
		return obj;
	}

	getTimeInfoEntries() {
		const map = new Map();
		this.collectTimeInfoEntries(map, map);
		return map;
	}

	collectTimeInfoEntries(fileTimestamps, directoryTimestamps) {
		const allWatchers = new Set();
		addWatchersToSet(this.fileWatchers.values(), allWatchers);
		addWatchersToSet(this.directoryWatchers.values(), allWatchers);
		const safeTime = { value: 0 };
		for (const w of allWatchers) {
			w.collectTimeInfoEntries(fileTimestamps, directoryTimestamps, safeTime);
		}
	}

	getAggregated() {
		if (this.aggregateTimer) {
			clearTimeout(this.aggregateTimer);
			this.aggregateTimer = undefined;
		}
		const changes = this.aggregatedChanges;
		const removals = this.aggregatedRemovals;
		this.aggregatedChanges = new Set();
		this.aggregatedRemovals = new Set();
		return { changes, removals };
	}

	_onChange(item, mtime, file, type) {
		file = file || item;
		if (!this.paused) {
			this.emit("change", file, mtime, type);
			if (this.aggregateTimer) clearTimeout(this.aggregateTimer);
			this.aggregateTimer = setTimeout(this._onTimeout, this.aggregateTimeout);
		}
		this.aggregatedRemovals.delete(item);
		this.aggregatedChanges.add(item);
	}

	_onRemove(item, file, type) {
		file = file || item;
		if (!this.paused) {
			this.emit("remove", file, type);
			if (this.aggregateTimer) clearTimeout(this.aggregateTimer);
			this.aggregateTimer = setTimeout(this._onTimeout, this.aggregateTimeout);
		}
		this.aggregatedChanges.delete(item);
		this.aggregatedRemovals.add(item);
	}

	_onTimeout() {
		this.aggregateTimer = undefined;
		const changes = this.aggregatedChanges;
		const removals = this.aggregatedRemovals;
		this.aggregatedChanges = new Set();
		this.aggregatedRemovals = new Set();
		this.emit("aggregated", changes, removals);
	}
}

module.exports = Watchpack;


/***/ }),

/***/ 491:
/***/ ((module) => {

"use strict";
module.exports = require("assert");

/***/ }),

/***/ 57:
/***/ ((module) => {

"use strict";
module.exports = require("constants");

/***/ }),

/***/ 361:
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 37:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 781:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ 837:
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
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
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(747);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;