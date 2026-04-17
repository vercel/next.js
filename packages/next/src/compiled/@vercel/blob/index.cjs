/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 2935:
/***/ ((module) => {

/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

module.exports = function isBuffer (obj) {
  return obj != null && obj.constructor != null &&
    typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}


/***/ }),

/***/ 8576:
/***/ ((module) => {

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  isNodeProcess: () => isNodeProcess
});
module.exports = __toCommonJS(src_exports);
function isNodeProcess() {
  if (typeof navigator !== "undefined" && navigator.product === "ReactNative") {
    return true;
  }
  if (typeof process !== "undefined") {
    const type = process.type;
    if (type === "renderer" || type === "worker") {
      return false;
    }
    return !!(process.versions && process.versions.node);
  }
  return false;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (0);
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 766:
/***/ ((module) => {

function throttle(function_, wait) {
	if (typeof function_ !== 'function') {
		throw new TypeError(`Expected the first argument to be a \`function\`, got \`${typeof function_}\`.`);
	}

	// TODO: Add `wait` validation too in the next major version.

	let timeoutId;
	let lastCallTime = 0;

	return function throttled(...arguments_) { // eslint-disable-line func-names
		clearTimeout(timeoutId);

		const now = Date.now();
		const timeSinceLastCall = now - lastCallTime;
		const delayForNextCall = wait - timeSinceLastCall;

		if (delayForNextCall <= 0) {
			lastCallTime = now;
			function_.apply(this, arguments_);
		} else {
			timeoutId = setTimeout(() => {
				lastCallTime = Date.now();
				function_.apply(this, arguments_);
			}, delayForNextCall);
		}
	};
}

module.exports = throttle;


/***/ }),

/***/ 2614:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Client = __nccwpck_require__(4885)
const Dispatcher = __nccwpck_require__(3701)
const Pool = __nccwpck_require__(1076)
const BalancedPool = __nccwpck_require__(1475)
const Agent = __nccwpck_require__(6705)
const ProxyAgent = __nccwpck_require__(9752)
const EnvHttpProxyAgent = __nccwpck_require__(3479)
const RetryAgent = __nccwpck_require__(5162)
const errors = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { InvalidArgumentError } = errors
const api = __nccwpck_require__(4004)
const buildConnector = __nccwpck_require__(334)
const MockClient = __nccwpck_require__(2916)
const MockAgent = __nccwpck_require__(832)
const MockPool = __nccwpck_require__(2870)
const mockErrors = __nccwpck_require__(3025)
const RetryHandler = __nccwpck_require__(5733)
const { getGlobalDispatcher, setGlobalDispatcher } = __nccwpck_require__(415)
const DecoratorHandler = __nccwpck_require__(2790)
const RedirectHandler = __nccwpck_require__(5025)
const createRedirectInterceptor = __nccwpck_require__(5292)

Object.assign(Dispatcher.prototype, api)

module.exports.Dispatcher = Dispatcher
module.exports.Client = Client
module.exports.Pool = Pool
module.exports.BalancedPool = BalancedPool
module.exports.Agent = Agent
module.exports.ProxyAgent = ProxyAgent
module.exports.EnvHttpProxyAgent = EnvHttpProxyAgent
module.exports.RetryAgent = RetryAgent
module.exports.RetryHandler = RetryHandler

module.exports.DecoratorHandler = DecoratorHandler
module.exports.RedirectHandler = RedirectHandler
module.exports.createRedirectInterceptor = createRedirectInterceptor
module.exports.interceptors = {
  redirect: __nccwpck_require__(2842),
  retry: __nccwpck_require__(1356),
  dump: __nccwpck_require__(1021),
  dns: __nccwpck_require__(1810)
}

module.exports.buildConnector = buildConnector
module.exports.errors = errors
module.exports.util = {
  parseHeaders: util.parseHeaders,
  headerNameToString: util.headerNameToString
}

function makeDispatcher (fn) {
  return (url, opts, handler) => {
    if (typeof opts === 'function') {
      handler = opts
      opts = null
    }

    if (!url || (typeof url !== 'string' && typeof url !== 'object' && !(url instanceof URL))) {
      throw new InvalidArgumentError('invalid url')
    }

    if (opts != null && typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts && opts.path != null) {
      if (typeof opts.path !== 'string') {
        throw new InvalidArgumentError('invalid opts.path')
      }

      let path = opts.path
      if (!opts.path.startsWith('/')) {
        path = `/${path}`
      }

      url = new URL(util.parseOrigin(url).origin + path)
    } else {
      if (!opts) {
        opts = typeof url === 'object' ? url : {}
      }

      url = util.parseURL(url)
    }

    const { agent, dispatcher = getGlobalDispatcher() } = opts

    if (agent) {
      throw new InvalidArgumentError('unsupported opts.agent. Did you mean opts.client?')
    }

    return fn.call(dispatcher, {
      ...opts,
      origin: url.origin,
      path: url.search ? `${url.pathname}${url.search}` : url.pathname,
      method: opts.method || (opts.body ? 'PUT' : 'GET')
    }, handler)
  }
}

module.exports.setGlobalDispatcher = setGlobalDispatcher
module.exports.getGlobalDispatcher = getGlobalDispatcher

const fetchImpl = (__nccwpck_require__(7935).fetch)
module.exports.fetch = async function fetch (init, options = undefined) {
  try {
    return await fetchImpl(init, options)
  } catch (err) {
    if (err && typeof err === 'object') {
      Error.captureStackTrace(err)
    }

    throw err
  }
}
module.exports.Headers = __nccwpck_require__(1401).Headers
module.exports.Response = __nccwpck_require__(6120).Response
module.exports.Request = __nccwpck_require__(9884).Request
module.exports.FormData = __nccwpck_require__(2744).FormData
module.exports.File = globalThis.File ?? (__nccwpck_require__(2254).File)
module.exports.FileReader = __nccwpck_require__(2524).FileReader

const { setGlobalOrigin, getGlobalOrigin } = __nccwpck_require__(5954)

module.exports.setGlobalOrigin = setGlobalOrigin
module.exports.getGlobalOrigin = getGlobalOrigin

const { CacheStorage } = __nccwpck_require__(3706)
const { kConstruct } = __nccwpck_require__(5707)

// Cache & CacheStorage are tightly coupled with fetch. Even if it may run
// in an older version of Node, it doesn't have any use without fetch.
module.exports.caches = new CacheStorage(kConstruct)

const { deleteCookie, getCookies, getSetCookies, setCookie } = __nccwpck_require__(4418)

module.exports.deleteCookie = deleteCookie
module.exports.getCookies = getCookies
module.exports.getSetCookies = getSetCookies
module.exports.setCookie = setCookie

const { parseMIMEType, serializeAMimeType } = __nccwpck_require__(5253)

module.exports.parseMIMEType = parseMIMEType
module.exports.serializeAMimeType = serializeAMimeType

const { CloseEvent, ErrorEvent, MessageEvent } = __nccwpck_require__(1225)
module.exports.WebSocket = __nccwpck_require__(3419).WebSocket
module.exports.CloseEvent = CloseEvent
module.exports.ErrorEvent = ErrorEvent
module.exports.MessageEvent = MessageEvent

module.exports.request = makeDispatcher(api.request)
module.exports.stream = makeDispatcher(api.stream)
module.exports.pipeline = makeDispatcher(api.pipeline)
module.exports.connect = makeDispatcher(api.connect)
module.exports.upgrade = makeDispatcher(api.upgrade)

module.exports.MockClient = MockClient
module.exports.MockPool = MockPool
module.exports.MockAgent = MockAgent
module.exports.mockErrors = mockErrors

const { EventSource } = __nccwpck_require__(9008)

module.exports.EventSource = EventSource


/***/ }),

/***/ 849:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { addAbortListener } = __nccwpck_require__(9099)
const { RequestAbortedError } = __nccwpck_require__(8642)

const kListener = Symbol('kListener')
const kSignal = Symbol('kSignal')

function abort (self) {
  if (self.abort) {
    self.abort(self[kSignal]?.reason)
  } else {
    self.reason = self[kSignal]?.reason ?? new RequestAbortedError()
  }
  removeSignal(self)
}

function addSignal (self, signal) {
  self.reason = null

  self[kSignal] = null
  self[kListener] = null

  if (!signal) {
    return
  }

  if (signal.aborted) {
    abort(self)
    return
  }

  self[kSignal] = signal
  self[kListener] = () => {
    abort(self)
  }

  addAbortListener(self[kSignal], self[kListener])
}

function removeSignal (self) {
  if (!self[kSignal]) {
    return
  }

  if ('removeEventListener' in self[kSignal]) {
    self[kSignal].removeEventListener('abort', self[kListener])
  } else {
    self[kSignal].removeListener('abort', self[kListener])
  }

  self[kSignal] = null
  self[kListener] = null
}

module.exports = {
  addSignal,
  removeSignal
}


/***/ }),

/***/ 8579:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)
const { AsyncResource } = __nccwpck_require__(2761)
const { InvalidArgumentError, SocketError } = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { addSignal, removeSignal } = __nccwpck_require__(849)

class ConnectHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    const { signal, opaque, responseHeaders } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    super('UNDICI_CONNECT')

    this.opaque = opaque || null
    this.responseHeaders = responseHeaders || null
    this.callback = callback
    this.abort = null

    addSignal(this, signal)
  }

  onConnect (abort, context) {
    if (this.reason) {
      abort(this.reason)
      return
    }

    assert(this.callback)

    this.abort = abort
    this.context = context
  }

  onHeaders () {
    throw new SocketError('bad connect', null)
  }

  onUpgrade (statusCode, rawHeaders, socket) {
    const { callback, opaque, context } = this

    removeSignal(this)

    this.callback = null

    let headers = rawHeaders
    // Indicates is an HTTP2Session
    if (headers != null) {
      headers = this.responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)
    }

    this.runInAsyncScope(callback, null, null, {
      statusCode,
      headers,
      socket,
      opaque,
      context
    })
  }

  onError (err) {
    const { callback, opaque } = this

    removeSignal(this)

    if (callback) {
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }
  }
}

function connect (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      connect.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  try {
    const connectHandler = new ConnectHandler(opts, callback)
    this.dispatch({ ...opts, method: 'CONNECT' }, connectHandler)
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts?.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = connect


/***/ }),

/***/ 7370:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  Readable,
  Duplex,
  PassThrough
} = __nccwpck_require__(4492)
const {
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError
} = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { AsyncResource } = __nccwpck_require__(2761)
const { addSignal, removeSignal } = __nccwpck_require__(849)
const assert = __nccwpck_require__(8061)

const kResume = Symbol('resume')

class PipelineRequest extends Readable {
  constructor () {
    super({ autoDestroy: true })

    this[kResume] = null
  }

  _read () {
    const { [kResume]: resume } = this

    if (resume) {
      this[kResume] = null
      resume()
    }
  }

  _destroy (err, callback) {
    this._read()

    callback(err)
  }
}

class PipelineResponse extends Readable {
  constructor (resume) {
    super({ autoDestroy: true })
    this[kResume] = resume
  }

  _read () {
    this[kResume]()
  }

  _destroy (err, callback) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    callback(err)
  }
}

class PipelineHandler extends AsyncResource {
  constructor (opts, handler) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof handler !== 'function') {
      throw new InvalidArgumentError('invalid handler')
    }

    const { signal, method, opaque, onInfo, responseHeaders } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    if (method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    if (onInfo && typeof onInfo !== 'function') {
      throw new InvalidArgumentError('invalid onInfo callback')
    }

    super('UNDICI_PIPELINE')

    this.opaque = opaque || null
    this.responseHeaders = responseHeaders || null
    this.handler = handler
    this.abort = null
    this.context = null
    this.onInfo = onInfo || null

    this.req = new PipelineRequest().on('error', util.nop)

    this.ret = new Duplex({
      readableObjectMode: opts.objectMode,
      autoDestroy: true,
      read: () => {
        const { body } = this

        if (body?.resume) {
          body.resume()
        }
      },
      write: (chunk, encoding, callback) => {
        const { req } = this

        if (req.push(chunk, encoding) || req._readableState.destroyed) {
          callback()
        } else {
          req[kResume] = callback
        }
      },
      destroy: (err, callback) => {
        const { body, req, res, ret, abort } = this

        if (!err && !ret._readableState.endEmitted) {
          err = new RequestAbortedError()
        }

        if (abort && err) {
          abort()
        }

        util.destroy(body, err)
        util.destroy(req, err)
        util.destroy(res, err)

        removeSignal(this)

        callback(err)
      }
    }).on('prefinish', () => {
      const { req } = this

      // Node < 15 does not call _final in same tick.
      req.push(null)
    })

    this.res = null

    addSignal(this, signal)
  }

  onConnect (abort, context) {
    const { ret, res } = this

    if (this.reason) {
      abort(this.reason)
      return
    }

    assert(!res, 'pipeline cannot be retried')
    assert(!ret.destroyed)

    this.abort = abort
    this.context = context
  }

  onHeaders (statusCode, rawHeaders, resume) {
    const { opaque, handler, context } = this

    if (statusCode < 200) {
      if (this.onInfo) {
        const headers = this.responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)
        this.onInfo({ statusCode, headers })
      }
      return
    }

    this.res = new PipelineResponse(resume)

    let body
    try {
      this.handler = null
      const headers = this.responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)
      body = this.runInAsyncScope(handler, null, {
        statusCode,
        headers,
        opaque,
        body: this.res,
        context
      })
    } catch (err) {
      this.res.on('error', util.nop)
      throw err
    }

    if (!body || typeof body.on !== 'function') {
      throw new InvalidReturnValueError('expected Readable')
    }

    body
      .on('data', (chunk) => {
        const { ret, body } = this

        if (!ret.push(chunk) && body.pause) {
          body.pause()
        }
      })
      .on('error', (err) => {
        const { ret } = this

        util.destroy(ret, err)
      })
      .on('end', () => {
        const { ret } = this

        ret.push(null)
      })
      .on('close', () => {
        const { ret } = this

        if (!ret._readableState.ended) {
          util.destroy(ret, new RequestAbortedError())
        }
      })

    this.body = body
  }

  onData (chunk) {
    const { res } = this
    return res.push(chunk)
  }

  onComplete (trailers) {
    const { res } = this
    res.push(null)
  }

  onError (err) {
    const { ret } = this
    this.handler = null
    util.destroy(ret, err)
  }
}

function pipeline (opts, handler) {
  try {
    const pipelineHandler = new PipelineHandler(opts, handler)
    this.dispatch({ ...opts, body: pipelineHandler.req }, pipelineHandler)
    return pipelineHandler.ret
  } catch (err) {
    return new PassThrough().destroy(err)
  }
}

module.exports = pipeline


/***/ }),

/***/ 6105:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)
const { Readable } = __nccwpck_require__(3064)
const { InvalidArgumentError, RequestAbortedError } = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { getResolveErrorBodyCallback } = __nccwpck_require__(1915)
const { AsyncResource } = __nccwpck_require__(2761)

class RequestHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, method, opaque, body, onInfo, responseHeaders, throwOnError, highWaterMark } = opts

    try {
      if (typeof callback !== 'function') {
        throw new InvalidArgumentError('invalid callback')
      }

      if (highWaterMark && (typeof highWaterMark !== 'number' || highWaterMark < 0)) {
        throw new InvalidArgumentError('invalid highWaterMark')
      }

      if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
        throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
      }

      if (method === 'CONNECT') {
        throw new InvalidArgumentError('invalid method')
      }

      if (onInfo && typeof onInfo !== 'function') {
        throw new InvalidArgumentError('invalid onInfo callback')
      }

      super('UNDICI_REQUEST')
    } catch (err) {
      if (util.isStream(body)) {
        util.destroy(body.on('error', util.nop), err)
      }
      throw err
    }

    this.method = method
    this.responseHeaders = responseHeaders || null
    this.opaque = opaque || null
    this.callback = callback
    this.res = null
    this.abort = null
    this.body = body
    this.trailers = {}
    this.context = null
    this.onInfo = onInfo || null
    this.throwOnError = throwOnError
    this.highWaterMark = highWaterMark
    this.signal = signal
    this.reason = null
    this.removeAbortListener = null

    if (util.isStream(body)) {
      body.on('error', (err) => {
        this.onError(err)
      })
    }

    if (this.signal) {
      if (this.signal.aborted) {
        this.reason = this.signal.reason ?? new RequestAbortedError()
      } else {
        this.removeAbortListener = util.addAbortListener(this.signal, () => {
          this.reason = this.signal.reason ?? new RequestAbortedError()
          if (this.res) {
            util.destroy(this.res.on('error', util.nop), this.reason)
          } else if (this.abort) {
            this.abort(this.reason)
          }

          if (this.removeAbortListener) {
            this.res?.off('close', this.removeAbortListener)
            this.removeAbortListener()
            this.removeAbortListener = null
          }
        })
      }
    }
  }

  onConnect (abort, context) {
    if (this.reason) {
      abort(this.reason)
      return
    }

    assert(this.callback)

    this.abort = abort
    this.context = context
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const { callback, opaque, abort, context, responseHeaders, highWaterMark } = this

    const headers = responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)

    if (statusCode < 200) {
      if (this.onInfo) {
        this.onInfo({ statusCode, headers })
      }
      return
    }

    const parsedHeaders = responseHeaders === 'raw' ? util.parseHeaders(rawHeaders) : headers
    const contentType = parsedHeaders['content-type']
    const contentLength = parsedHeaders['content-length']
    const res = new Readable({
      resume,
      abort,
      contentType,
      contentLength: this.method !== 'HEAD' && contentLength
        ? Number(contentLength)
        : null,
      highWaterMark
    })

    if (this.removeAbortListener) {
      res.on('close', this.removeAbortListener)
    }

    this.callback = null
    this.res = res
    if (callback !== null) {
      if (this.throwOnError && statusCode >= 400) {
        this.runInAsyncScope(getResolveErrorBodyCallback, null,
          { callback, body: res, contentType, statusCode, statusMessage, headers }
        )
      } else {
        this.runInAsyncScope(callback, null, null, {
          statusCode,
          headers,
          trailers: this.trailers,
          opaque,
          body: res,
          context
        })
      }
    }
  }

  onData (chunk) {
    return this.res.push(chunk)
  }

  onComplete (trailers) {
    util.parseHeaders(trailers, this.trailers)
    this.res.push(null)
  }

  onError (err) {
    const { res, callback, body, opaque } = this

    if (callback) {
      // TODO: Does this need queueMicrotask?
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }

    if (res) {
      this.res = null
      // Ensure all queued handlers are invoked before destroying res.
      queueMicrotask(() => {
        util.destroy(res, err)
      })
    }

    if (body) {
      this.body = null
      util.destroy(body, err)
    }

    if (this.removeAbortListener) {
      res?.off('close', this.removeAbortListener)
      this.removeAbortListener()
      this.removeAbortListener = null
    }
  }
}

function request (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      request.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  try {
    this.dispatch(opts, new RequestHandler(opts, callback))
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts?.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = request
module.exports.RequestHandler = RequestHandler


/***/ }),

/***/ 7642:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)
const { finished, PassThrough } = __nccwpck_require__(4492)
const { InvalidArgumentError, InvalidReturnValueError } = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { getResolveErrorBodyCallback } = __nccwpck_require__(1915)
const { AsyncResource } = __nccwpck_require__(2761)
const { addSignal, removeSignal } = __nccwpck_require__(849)

class StreamHandler extends AsyncResource {
  constructor (opts, factory, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    const { signal, method, opaque, body, onInfo, responseHeaders, throwOnError } = opts

    try {
      if (typeof callback !== 'function') {
        throw new InvalidArgumentError('invalid callback')
      }

      if (typeof factory !== 'function') {
        throw new InvalidArgumentError('invalid factory')
      }

      if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
        throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
      }

      if (method === 'CONNECT') {
        throw new InvalidArgumentError('invalid method')
      }

      if (onInfo && typeof onInfo !== 'function') {
        throw new InvalidArgumentError('invalid onInfo callback')
      }

      super('UNDICI_STREAM')
    } catch (err) {
      if (util.isStream(body)) {
        util.destroy(body.on('error', util.nop), err)
      }
      throw err
    }

    this.responseHeaders = responseHeaders || null
    this.opaque = opaque || null
    this.factory = factory
    this.callback = callback
    this.res = null
    this.abort = null
    this.context = null
    this.trailers = null
    this.body = body
    this.onInfo = onInfo || null
    this.throwOnError = throwOnError || false

    if (util.isStream(body)) {
      body.on('error', (err) => {
        this.onError(err)
      })
    }

    addSignal(this, signal)
  }

  onConnect (abort, context) {
    if (this.reason) {
      abort(this.reason)
      return
    }

    assert(this.callback)

    this.abort = abort
    this.context = context
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const { factory, opaque, context, callback, responseHeaders } = this

    const headers = responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)

    if (statusCode < 200) {
      if (this.onInfo) {
        this.onInfo({ statusCode, headers })
      }
      return
    }

    this.factory = null

    let res

    if (this.throwOnError && statusCode >= 400) {
      const parsedHeaders = responseHeaders === 'raw' ? util.parseHeaders(rawHeaders) : headers
      const contentType = parsedHeaders['content-type']
      res = new PassThrough()

      this.callback = null
      this.runInAsyncScope(getResolveErrorBodyCallback, null,
        { callback, body: res, contentType, statusCode, statusMessage, headers }
      )
    } else {
      if (factory === null) {
        return
      }

      res = this.runInAsyncScope(factory, null, {
        statusCode,
        headers,
        opaque,
        context
      })

      if (
        !res ||
        typeof res.write !== 'function' ||
        typeof res.end !== 'function' ||
        typeof res.on !== 'function'
      ) {
        throw new InvalidReturnValueError('expected Writable')
      }

      // TODO: Avoid finished. It registers an unnecessary amount of listeners.
      finished(res, { readable: false }, (err) => {
        const { callback, res, opaque, trailers, abort } = this

        this.res = null
        if (err || !res.readable) {
          util.destroy(res, err)
        }

        this.callback = null
        this.runInAsyncScope(callback, null, err || null, { opaque, trailers })

        if (err) {
          abort()
        }
      })
    }

    res.on('drain', resume)

    this.res = res

    const needDrain = res.writableNeedDrain !== undefined
      ? res.writableNeedDrain
      : res._writableState?.needDrain

    return needDrain !== true
  }

  onData (chunk) {
    const { res } = this

    return res ? res.write(chunk) : true
  }

  onComplete (trailers) {
    const { res } = this

    removeSignal(this)

    if (!res) {
      return
    }

    this.trailers = util.parseHeaders(trailers)

    res.end()
  }

  onError (err) {
    const { res, callback, opaque, body } = this

    removeSignal(this)

    this.factory = null

    if (res) {
      this.res = null
      util.destroy(res, err)
    } else if (callback) {
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }

    if (body) {
      this.body = null
      util.destroy(body, err)
    }
  }
}

function stream (opts, factory, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      stream.call(this, opts, factory, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  try {
    this.dispatch(opts, new StreamHandler(opts, factory, callback))
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts?.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = stream


/***/ }),

/***/ 9976:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { InvalidArgumentError, SocketError } = __nccwpck_require__(8642)
const { AsyncResource } = __nccwpck_require__(2761)
const util = __nccwpck_require__(9099)
const { addSignal, removeSignal } = __nccwpck_require__(849)
const assert = __nccwpck_require__(8061)

class UpgradeHandler extends AsyncResource {
  constructor (opts, callback) {
    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    const { signal, opaque, responseHeaders } = opts

    if (signal && typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
      throw new InvalidArgumentError('signal must be an EventEmitter or EventTarget')
    }

    super('UNDICI_UPGRADE')

    this.responseHeaders = responseHeaders || null
    this.opaque = opaque || null
    this.callback = callback
    this.abort = null
    this.context = null

    addSignal(this, signal)
  }

  onConnect (abort, context) {
    if (this.reason) {
      abort(this.reason)
      return
    }

    assert(this.callback)

    this.abort = abort
    this.context = null
  }

  onHeaders () {
    throw new SocketError('bad upgrade', null)
  }

  onUpgrade (statusCode, rawHeaders, socket) {
    assert(statusCode === 101)

    const { callback, opaque, context } = this

    removeSignal(this)

    this.callback = null
    const headers = this.responseHeaders === 'raw' ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders)
    this.runInAsyncScope(callback, null, null, {
      headers,
      socket,
      opaque,
      context
    })
  }

  onError (err) {
    const { callback, opaque } = this

    removeSignal(this)

    if (callback) {
      this.callback = null
      queueMicrotask(() => {
        this.runInAsyncScope(callback, null, err, { opaque })
      })
    }
  }
}

function upgrade (opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      upgrade.call(this, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  try {
    const upgradeHandler = new UpgradeHandler(opts, callback)
    this.dispatch({
      ...opts,
      method: opts.method || 'GET',
      upgrade: opts.protocol || 'Websocket'
    }, upgradeHandler)
  } catch (err) {
    if (typeof callback !== 'function') {
      throw err
    }
    const opaque = opts?.opaque
    queueMicrotask(() => callback(err, { opaque }))
  }
}

module.exports = upgrade


/***/ }),

/***/ 4004:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


module.exports.request = __nccwpck_require__(6105)
module.exports.stream = __nccwpck_require__(7642)
module.exports.pipeline = __nccwpck_require__(7370)
module.exports.upgrade = __nccwpck_require__(9976)
module.exports.connect = __nccwpck_require__(8579)


/***/ }),

/***/ 3064:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// Ported from https://github.com/nodejs/undici/pull/907



const assert = __nccwpck_require__(8061)
const { Readable } = __nccwpck_require__(4492)
const { RequestAbortedError, NotSupportedError, InvalidArgumentError, AbortError } = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { ReadableStreamFrom } = __nccwpck_require__(9099)

const kConsume = Symbol('kConsume')
const kReading = Symbol('kReading')
const kBody = Symbol('kBody')
const kAbort = Symbol('kAbort')
const kContentType = Symbol('kContentType')
const kContentLength = Symbol('kContentLength')

const noop = () => {}

class BodyReadable extends Readable {
  constructor ({
    resume,
    abort,
    contentType = '',
    contentLength,
    highWaterMark = 64 * 1024 // Same as nodejs fs streams.
  }) {
    super({
      autoDestroy: true,
      read: resume,
      highWaterMark
    })

    this._readableState.dataEmitted = false

    this[kAbort] = abort
    this[kConsume] = null
    this[kBody] = null
    this[kContentType] = contentType
    this[kContentLength] = contentLength

    // Is stream being consumed through Readable API?
    // This is an optimization so that we avoid checking
    // for 'data' and 'readable' listeners in the hot path
    // inside push().
    this[kReading] = false
  }

  destroy (err) {
    if (!err && !this._readableState.endEmitted) {
      err = new RequestAbortedError()
    }

    if (err) {
      this[kAbort]()
    }

    return super.destroy(err)
  }

  _destroy (err, callback) {
    // Workaround for Node "bug". If the stream is destroyed in same
    // tick as it is created, then a user who is waiting for a
    // promise (i.e micro tick) for installing a 'error' listener will
    // never get a chance and will always encounter an unhandled exception.
    if (!this[kReading]) {
      setImmediate(() => {
        callback(err)
      })
    } else {
      callback(err)
    }
  }

  on (ev, ...args) {
    if (ev === 'data' || ev === 'readable') {
      this[kReading] = true
    }
    return super.on(ev, ...args)
  }

  addListener (ev, ...args) {
    return this.on(ev, ...args)
  }

  off (ev, ...args) {
    const ret = super.off(ev, ...args)
    if (ev === 'data' || ev === 'readable') {
      this[kReading] = (
        this.listenerCount('data') > 0 ||
        this.listenerCount('readable') > 0
      )
    }
    return ret
  }

  removeListener (ev, ...args) {
    return this.off(ev, ...args)
  }

  push (chunk) {
    if (this[kConsume] && chunk !== null) {
      consumePush(this[kConsume], chunk)
      return this[kReading] ? super.push(chunk) : true
    }
    return super.push(chunk)
  }

  // https://fetch.spec.whatwg.org/#dom-body-text
  async text () {
    return consume(this, 'text')
  }

  // https://fetch.spec.whatwg.org/#dom-body-json
  async json () {
    return consume(this, 'json')
  }

  // https://fetch.spec.whatwg.org/#dom-body-blob
  async blob () {
    return consume(this, 'blob')
  }

  // https://fetch.spec.whatwg.org/#dom-body-bytes
  async bytes () {
    return consume(this, 'bytes')
  }

  // https://fetch.spec.whatwg.org/#dom-body-arraybuffer
  async arrayBuffer () {
    return consume(this, 'arrayBuffer')
  }

  // https://fetch.spec.whatwg.org/#dom-body-formdata
  async formData () {
    // TODO: Implement.
    throw new NotSupportedError()
  }

  // https://fetch.spec.whatwg.org/#dom-body-bodyused
  get bodyUsed () {
    return util.isDisturbed(this)
  }

  // https://fetch.spec.whatwg.org/#dom-body-body
  get body () {
    if (!this[kBody]) {
      this[kBody] = ReadableStreamFrom(this)
      if (this[kConsume]) {
        // TODO: Is this the best way to force a lock?
        this[kBody].getReader() // Ensure stream is locked.
        assert(this[kBody].locked)
      }
    }
    return this[kBody]
  }

  async dump (opts) {
    let limit = Number.isFinite(opts?.limit) ? opts.limit : 128 * 1024
    const signal = opts?.signal

    if (signal != null && (typeof signal !== 'object' || !('aborted' in signal))) {
      throw new InvalidArgumentError('signal must be an AbortSignal')
    }

    signal?.throwIfAborted()

    if (this._readableState.closeEmitted) {
      return null
    }

    return await new Promise((resolve, reject) => {
      if (this[kContentLength] > limit) {
        this.destroy(new AbortError())
      }

      const onAbort = () => {
        this.destroy(signal.reason ?? new AbortError())
      }
      signal?.addEventListener('abort', onAbort)

      this
        .on('close', function () {
          signal?.removeEventListener('abort', onAbort)
          if (signal?.aborted) {
            reject(signal.reason ?? new AbortError())
          } else {
            resolve(null)
          }
        })
        .on('error', noop)
        .on('data', function (chunk) {
          limit -= chunk.length
          if (limit <= 0) {
            this.destroy()
          }
        })
        .resume()
    })
  }
}

// https://streams.spec.whatwg.org/#readablestream-locked
function isLocked (self) {
  // Consume is an implicit lock.
  return (self[kBody] && self[kBody].locked === true) || self[kConsume]
}

// https://fetch.spec.whatwg.org/#body-unusable
function isUnusable (self) {
  return util.isDisturbed(self) || isLocked(self)
}

async function consume (stream, type) {
  assert(!stream[kConsume])

  return new Promise((resolve, reject) => {
    if (isUnusable(stream)) {
      const rState = stream._readableState
      if (rState.destroyed && rState.closeEmitted === false) {
        stream
          .on('error', err => {
            reject(err)
          })
          .on('close', () => {
            reject(new TypeError('unusable'))
          })
      } else {
        reject(rState.errored ?? new TypeError('unusable'))
      }
    } else {
      queueMicrotask(() => {
        stream[kConsume] = {
          type,
          stream,
          resolve,
          reject,
          length: 0,
          body: []
        }

        stream
          .on('error', function (err) {
            consumeFinish(this[kConsume], err)
          })
          .on('close', function () {
            if (this[kConsume].body !== null) {
              consumeFinish(this[kConsume], new RequestAbortedError())
            }
          })

        consumeStart(stream[kConsume])
      })
    }
  })
}

function consumeStart (consume) {
  if (consume.body === null) {
    return
  }

  const { _readableState: state } = consume.stream

  if (state.bufferIndex) {
    const start = state.bufferIndex
    const end = state.buffer.length
    for (let n = start; n < end; n++) {
      consumePush(consume, state.buffer[n])
    }
  } else {
    for (const chunk of state.buffer) {
      consumePush(consume, chunk)
    }
  }

  if (state.endEmitted) {
    consumeEnd(this[kConsume])
  } else {
    consume.stream.on('end', function () {
      consumeEnd(this[kConsume])
    })
  }

  consume.stream.resume()

  while (consume.stream.read() != null) {
    // Loop
  }
}

/**
 * @param {Buffer[]} chunks
 * @param {number} length
 */
function chunksDecode (chunks, length) {
  if (chunks.length === 0 || length === 0) {
    return ''
  }
  const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length)
  const bufferLength = buffer.length

  // Skip BOM.
  const start =
    bufferLength > 2 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
      ? 3
      : 0
  return buffer.utf8Slice(start, bufferLength)
}

/**
 * @param {Buffer[]} chunks
 * @param {number} length
 * @returns {Uint8Array}
 */
function chunksConcat (chunks, length) {
  if (chunks.length === 0 || length === 0) {
    return new Uint8Array(0)
  }
  if (chunks.length === 1) {
    // fast-path
    return new Uint8Array(chunks[0])
  }
  const buffer = new Uint8Array(Buffer.allocUnsafeSlow(length).buffer)

  let offset = 0
  for (let i = 0; i < chunks.length; ++i) {
    const chunk = chunks[i]
    buffer.set(chunk, offset)
    offset += chunk.length
  }

  return buffer
}

function consumeEnd (consume) {
  const { type, body, resolve, stream, length } = consume

  try {
    if (type === 'text') {
      resolve(chunksDecode(body, length))
    } else if (type === 'json') {
      resolve(JSON.parse(chunksDecode(body, length)))
    } else if (type === 'arrayBuffer') {
      resolve(chunksConcat(body, length).buffer)
    } else if (type === 'blob') {
      resolve(new Blob(body, { type: stream[kContentType] }))
    } else if (type === 'bytes') {
      resolve(chunksConcat(body, length))
    }

    consumeFinish(consume)
  } catch (err) {
    stream.destroy(err)
  }
}

function consumePush (consume, chunk) {
  consume.length += chunk.length
  consume.body.push(chunk)
}

function consumeFinish (consume, err) {
  if (consume.body === null) {
    return
  }

  if (err) {
    consume.reject(err)
  } else {
    consume.resolve()
  }

  consume.type = null
  consume.stream = null
  consume.resolve = null
  consume.reject = null
  consume.length = 0
  consume.body = null
}

module.exports = { Readable: BodyReadable, chunksDecode }


/***/ }),

/***/ 1915:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const assert = __nccwpck_require__(8061)
const {
  ResponseStatusCodeError
} = __nccwpck_require__(8642)

const { chunksDecode } = __nccwpck_require__(3064)
const CHUNK_LIMIT = 128 * 1024

async function getResolveErrorBodyCallback ({ callback, body, contentType, statusCode, statusMessage, headers }) {
  assert(body)

  let chunks = []
  let length = 0

  try {
    for await (const chunk of body) {
      chunks.push(chunk)
      length += chunk.length
      if (length > CHUNK_LIMIT) {
        chunks = []
        length = 0
        break
      }
    }
  } catch {
    chunks = []
    length = 0
    // Do nothing....
  }

  const message = `Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`

  if (statusCode === 204 || !contentType || !length) {
    queueMicrotask(() => callback(new ResponseStatusCodeError(message, statusCode, headers)))
    return
  }

  const stackTraceLimit = Error.stackTraceLimit
  Error.stackTraceLimit = 0
  let payload

  try {
    if (isContentTypeApplicationJson(contentType)) {
      payload = JSON.parse(chunksDecode(chunks, length))
    } else if (isContentTypeText(contentType)) {
      payload = chunksDecode(chunks, length)
    }
  } catch {
    // process in a callback to avoid throwing in the microtask queue
  } finally {
    Error.stackTraceLimit = stackTraceLimit
  }
  queueMicrotask(() => callback(new ResponseStatusCodeError(message, statusCode, headers, payload)))
}

const isContentTypeApplicationJson = (contentType) => {
  return (
    contentType.length > 15 &&
    contentType[11] === '/' &&
    contentType[0] === 'a' &&
    contentType[1] === 'p' &&
    contentType[2] === 'p' &&
    contentType[3] === 'l' &&
    contentType[4] === 'i' &&
    contentType[5] === 'c' &&
    contentType[6] === 'a' &&
    contentType[7] === 't' &&
    contentType[8] === 'i' &&
    contentType[9] === 'o' &&
    contentType[10] === 'n' &&
    contentType[12] === 'j' &&
    contentType[13] === 's' &&
    contentType[14] === 'o' &&
    contentType[15] === 'n'
  )
}

const isContentTypeText = (contentType) => {
  return (
    contentType.length > 4 &&
    contentType[4] === '/' &&
    contentType[0] === 't' &&
    contentType[1] === 'e' &&
    contentType[2] === 'x' &&
    contentType[3] === 't'
  )
}

module.exports = {
  getResolveErrorBodyCallback,
  isContentTypeApplicationJson,
  isContentTypeText
}


/***/ }),

/***/ 334:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const net = __nccwpck_require__(7503)
const assert = __nccwpck_require__(8061)
const util = __nccwpck_require__(9099)
const { InvalidArgumentError, ConnectTimeoutError } = __nccwpck_require__(8642)
const timers = __nccwpck_require__(5219)

function noop () {}

let tls // include tls conditionally since it is not always available

// TODO: session re-use does not wait for the first
// connection to resolve the session and might therefore
// resolve the same servername multiple times even when
// re-use is enabled.

let SessionCache
// FIXME: remove workaround when the Node bug is fixed
// https://github.com/nodejs/node/issues/49344#issuecomment-1741776308
if (global.FinalizationRegistry && !(process.env.NODE_V8_COVERAGE || process.env.UNDICI_NO_FG)) {
  SessionCache = class WeakSessionCache {
    constructor (maxCachedSessions) {
      this._maxCachedSessions = maxCachedSessions
      this._sessionCache = new Map()
      this._sessionRegistry = new global.FinalizationRegistry((key) => {
        if (this._sessionCache.size < this._maxCachedSessions) {
          return
        }

        const ref = this._sessionCache.get(key)
        if (ref !== undefined && ref.deref() === undefined) {
          this._sessionCache.delete(key)
        }
      })
    }

    get (sessionKey) {
      const ref = this._sessionCache.get(sessionKey)
      return ref ? ref.deref() : null
    }

    set (sessionKey, session) {
      if (this._maxCachedSessions === 0) {
        return
      }

      this._sessionCache.set(sessionKey, new WeakRef(session))
      this._sessionRegistry.register(session, sessionKey)
    }
  }
} else {
  SessionCache = class SimpleSessionCache {
    constructor (maxCachedSessions) {
      this._maxCachedSessions = maxCachedSessions
      this._sessionCache = new Map()
    }

    get (sessionKey) {
      return this._sessionCache.get(sessionKey)
    }

    set (sessionKey, session) {
      if (this._maxCachedSessions === 0) {
        return
      }

      if (this._sessionCache.size >= this._maxCachedSessions) {
        // remove the oldest session
        const { value: oldestKey } = this._sessionCache.keys().next()
        this._sessionCache.delete(oldestKey)
      }

      this._sessionCache.set(sessionKey, session)
    }
  }
}

function buildConnector ({ allowH2, maxCachedSessions, socketPath, timeout, session: customSession, ...opts }) {
  if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
    throw new InvalidArgumentError('maxCachedSessions must be a positive integer or zero')
  }

  const options = { path: socketPath, ...opts }
  const sessionCache = new SessionCache(maxCachedSessions == null ? 100 : maxCachedSessions)
  timeout = timeout == null ? 10e3 : timeout
  allowH2 = allowH2 != null ? allowH2 : false
  return function connect ({ hostname, host, protocol, port, servername, localAddress, httpSocket }, callback) {
    let socket
    if (protocol === 'https:') {
      if (!tls) {
        tls = __nccwpck_require__(1764)
      }
      servername = servername || options.servername || util.getServerName(host) || null

      const sessionKey = servername || hostname
      assert(sessionKey)

      const session = customSession || sessionCache.get(sessionKey) || null

      port = port || 443

      socket = tls.connect({
        highWaterMark: 16384, // TLS in node can't have bigger HWM anyway...
        ...options,
        servername,
        session,
        localAddress,
        // TODO(HTTP/2): Add support for h2c
        ALPNProtocols: allowH2 ? ['http/1.1', 'h2'] : ['http/1.1'],
        socket: httpSocket, // upgrade socket connection
        port,
        host: hostname
      })

      socket
        .on('session', function (session) {
          // TODO (fix): Can a session become invalid once established? Don't think so?
          sessionCache.set(sessionKey, session)
        })
    } else {
      assert(!httpSocket, 'httpSocket can only be sent on TLS update')

      port = port || 80

      socket = net.connect({
        highWaterMark: 64 * 1024, // Same as nodejs fs streams.
        ...options,
        localAddress,
        port,
        host: hostname
      })
    }

    // Set TCP keep alive options on the socket here instead of in connect() for the case of assigning the socket
    if (options.keepAlive == null || options.keepAlive) {
      const keepAliveInitialDelay = options.keepAliveInitialDelay === undefined ? 60e3 : options.keepAliveInitialDelay
      socket.setKeepAlive(true, keepAliveInitialDelay)
    }

    const clearConnectTimeout = setupConnectTimeout(new WeakRef(socket), { timeout, hostname, port })

    socket
      .setNoDelay(true)
      .once(protocol === 'https:' ? 'secureConnect' : 'connect', function () {
        queueMicrotask(clearConnectTimeout)

        if (callback) {
          const cb = callback
          callback = null
          cb(null, this)
        }
      })
      .on('error', function (err) {
        queueMicrotask(clearConnectTimeout)

        if (callback) {
          const cb = callback
          callback = null
          cb(err)
        }
      })

    return socket
  }
}

/**
 * @param {WeakRef<net.Socket>} socketWeakRef
 * @param {object} opts
 * @param {number} opts.timeout
 * @param {string} opts.hostname
 * @param {number} opts.port
 * @returns {() => void}
 */
const setupConnectTimeout = process.platform === 'win32'
  ? (socketWeakRef, opts) => {
      if (!opts.timeout) {
        return noop
      }

      let s1 = null
      let s2 = null
      const fastTimer = timers.setFastTimeout(() => {
      // setImmediate is added to make sure that we prioritize socket error events over timeouts
        s1 = setImmediate(() => {
        // Windows needs an extra setImmediate probably due to implementation differences in the socket logic
          s2 = setImmediate(() => onConnectTimeout(socketWeakRef.deref(), opts))
        })
      }, opts.timeout)
      return () => {
        timers.clearFastTimeout(fastTimer)
        clearImmediate(s1)
        clearImmediate(s2)
      }
    }
  : (socketWeakRef, opts) => {
      if (!opts.timeout) {
        return noop
      }

      let s1 = null
      const fastTimer = timers.setFastTimeout(() => {
      // setImmediate is added to make sure that we prioritize socket error events over timeouts
        s1 = setImmediate(() => {
          onConnectTimeout(socketWeakRef.deref(), opts)
        })
      }, opts.timeout)
      return () => {
        timers.clearFastTimeout(fastTimer)
        clearImmediate(s1)
      }
    }

/**
 * @param {net.Socket} socket
 * @param {object} opts
 * @param {number} opts.timeout
 * @param {string} opts.hostname
 * @param {number} opts.port
 */
function onConnectTimeout (socket, opts) {
  // The socket could be already garbage collected
  if (socket == null) {
    return
  }

  let message = 'Connect Timeout Error'
  if (Array.isArray(socket.autoSelectFamilyAttemptedAddresses)) {
    message += ` (attempted addresses: ${socket.autoSelectFamilyAttemptedAddresses.join(', ')},`
  } else {
    message += ` (attempted address: ${opts.hostname}:${opts.port},`
  }

  message += ` timeout: ${opts.timeout}ms)`

  util.destroy(socket, new ConnectTimeoutError(message))
}

module.exports = buildConnector


/***/ }),

/***/ 2671:
/***/ ((module) => {

"use strict";


/** @type {Record<string, string | undefined>} */
const headerNameLowerCasedRecord = {}

// https://developer.mozilla.org/docs/Web/HTTP/Headers
const wellknownHeaderNames = [
  'Accept',
  'Accept-Encoding',
  'Accept-Language',
  'Accept-Ranges',
  'Access-Control-Allow-Credentials',
  'Access-Control-Allow-Headers',
  'Access-Control-Allow-Methods',
  'Access-Control-Allow-Origin',
  'Access-Control-Expose-Headers',
  'Access-Control-Max-Age',
  'Access-Control-Request-Headers',
  'Access-Control-Request-Method',
  'Age',
  'Allow',
  'Alt-Svc',
  'Alt-Used',
  'Authorization',
  'Cache-Control',
  'Clear-Site-Data',
  'Connection',
  'Content-Disposition',
  'Content-Encoding',
  'Content-Language',
  'Content-Length',
  'Content-Location',
  'Content-Range',
  'Content-Security-Policy',
  'Content-Security-Policy-Report-Only',
  'Content-Type',
  'Cookie',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
  'Date',
  'Device-Memory',
  'Downlink',
  'ECT',
  'ETag',
  'Expect',
  'Expect-CT',
  'Expires',
  'Forwarded',
  'From',
  'Host',
  'If-Match',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'If-Unmodified-Since',
  'Keep-Alive',
  'Last-Modified',
  'Link',
  'Location',
  'Max-Forwards',
  'Origin',
  'Permissions-Policy',
  'Pragma',
  'Proxy-Authenticate',
  'Proxy-Authorization',
  'RTT',
  'Range',
  'Referer',
  'Referrer-Policy',
  'Refresh',
  'Retry-After',
  'Sec-WebSocket-Accept',
  'Sec-WebSocket-Extensions',
  'Sec-WebSocket-Key',
  'Sec-WebSocket-Protocol',
  'Sec-WebSocket-Version',
  'Server',
  'Server-Timing',
  'Service-Worker-Allowed',
  'Service-Worker-Navigation-Preload',
  'Set-Cookie',
  'SourceMap',
  'Strict-Transport-Security',
  'Supports-Loading-Mode',
  'TE',
  'Timing-Allow-Origin',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'Upgrade-Insecure-Requests',
  'User-Agent',
  'Vary',
  'Via',
  'WWW-Authenticate',
  'X-Content-Type-Options',
  'X-DNS-Prefetch-Control',
  'X-Frame-Options',
  'X-Permitted-Cross-Domain-Policies',
  'X-Powered-By',
  'X-Requested-With',
  'X-XSS-Protection'
]

for (let i = 0; i < wellknownHeaderNames.length; ++i) {
  const key = wellknownHeaderNames[i]
  const lowerCasedKey = key.toLowerCase()
  headerNameLowerCasedRecord[key] = headerNameLowerCasedRecord[lowerCasedKey] =
    lowerCasedKey
}

// Note: object prototypes should not be able to be referenced. e.g. `Object#hasOwnProperty`.
Object.setPrototypeOf(headerNameLowerCasedRecord, null)

module.exports = {
  wellknownHeaderNames,
  headerNameLowerCasedRecord
}


/***/ }),

/***/ 7055:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const diagnosticsChannel = __nccwpck_require__(5714)
const util = __nccwpck_require__(7261)

const undiciDebugLog = util.debuglog('undici')
const fetchDebuglog = util.debuglog('fetch')
const websocketDebuglog = util.debuglog('websocket')
let isClientSet = false
const channels = {
  // Client
  beforeConnect: diagnosticsChannel.channel('undici:client:beforeConnect'),
  connected: diagnosticsChannel.channel('undici:client:connected'),
  connectError: diagnosticsChannel.channel('undici:client:connectError'),
  sendHeaders: diagnosticsChannel.channel('undici:client:sendHeaders'),
  // Request
  create: diagnosticsChannel.channel('undici:request:create'),
  bodySent: diagnosticsChannel.channel('undici:request:bodySent'),
  headers: diagnosticsChannel.channel('undici:request:headers'),
  trailers: diagnosticsChannel.channel('undici:request:trailers'),
  error: diagnosticsChannel.channel('undici:request:error'),
  // WebSocket
  open: diagnosticsChannel.channel('undici:websocket:open'),
  close: diagnosticsChannel.channel('undici:websocket:close'),
  socketError: diagnosticsChannel.channel('undici:websocket:socket_error'),
  ping: diagnosticsChannel.channel('undici:websocket:ping'),
  pong: diagnosticsChannel.channel('undici:websocket:pong')
}

if (undiciDebugLog.enabled || fetchDebuglog.enabled) {
  const debuglog = fetchDebuglog.enabled ? fetchDebuglog : undiciDebugLog

  // Track all Client events
  diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(evt => {
    const {
      connectParams: { version, protocol, port, host }
    } = evt
    debuglog(
      'connecting to %s using %s%s',
      `${host}${port ? `:${port}` : ''}`,
      protocol,
      version
    )
  })

  diagnosticsChannel.channel('undici:client:connected').subscribe(evt => {
    const {
      connectParams: { version, protocol, port, host }
    } = evt
    debuglog(
      'connected to %s using %s%s',
      `${host}${port ? `:${port}` : ''}`,
      protocol,
      version
    )
  })

  diagnosticsChannel.channel('undici:client:connectError').subscribe(evt => {
    const {
      connectParams: { version, protocol, port, host },
      error
    } = evt
    debuglog(
      'connection to %s using %s%s errored - %s',
      `${host}${port ? `:${port}` : ''}`,
      protocol,
      version,
      error.message
    )
  })

  diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(evt => {
    const {
      request: { method, path, origin }
    } = evt
    debuglog('sending request to %s %s/%s', method, origin, path)
  })

  // Track Request events
  diagnosticsChannel.channel('undici:request:headers').subscribe(evt => {
    const {
      request: { method, path, origin },
      response: { statusCode }
    } = evt
    debuglog(
      'received response to %s %s/%s - HTTP %d',
      method,
      origin,
      path,
      statusCode
    )
  })

  diagnosticsChannel.channel('undici:request:trailers').subscribe(evt => {
    const {
      request: { method, path, origin }
    } = evt
    debuglog('trailers received from %s %s/%s', method, origin, path)
  })

  diagnosticsChannel.channel('undici:request:error').subscribe(evt => {
    const {
      request: { method, path, origin },
      error
    } = evt
    debuglog(
      'request to %s %s/%s errored - %s',
      method,
      origin,
      path,
      error.message
    )
  })

  isClientSet = true
}

if (websocketDebuglog.enabled) {
  if (!isClientSet) {
    const debuglog = undiciDebugLog.enabled ? undiciDebugLog : websocketDebuglog
    diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(evt => {
      const {
        connectParams: { version, protocol, port, host }
      } = evt
      debuglog(
        'connecting to %s%s using %s%s',
        host,
        port ? `:${port}` : '',
        protocol,
        version
      )
    })

    diagnosticsChannel.channel('undici:client:connected').subscribe(evt => {
      const {
        connectParams: { version, protocol, port, host }
      } = evt
      debuglog(
        'connected to %s%s using %s%s',
        host,
        port ? `:${port}` : '',
        protocol,
        version
      )
    })

    diagnosticsChannel.channel('undici:client:connectError').subscribe(evt => {
      const {
        connectParams: { version, protocol, port, host },
        error
      } = evt
      debuglog(
        'connection to %s%s using %s%s errored - %s',
        host,
        port ? `:${port}` : '',
        protocol,
        version,
        error.message
      )
    })

    diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(evt => {
      const {
        request: { method, path, origin }
      } = evt
      debuglog('sending request to %s %s/%s', method, origin, path)
    })
  }

  // Track all WebSocket events
  diagnosticsChannel.channel('undici:websocket:open').subscribe(evt => {
    const {
      address: { address, port }
    } = evt
    websocketDebuglog('connection opened %s%s', address, port ? `:${port}` : '')
  })

  diagnosticsChannel.channel('undici:websocket:close').subscribe(evt => {
    const { websocket, code, reason } = evt
    websocketDebuglog(
      'closed connection to %s - %s %s',
      websocket.url,
      code,
      reason
    )
  })

  diagnosticsChannel.channel('undici:websocket:socket_error').subscribe(err => {
    websocketDebuglog('connection errored - %s', err.message)
  })

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(evt => {
    websocketDebuglog('ping received')
  })

  diagnosticsChannel.channel('undici:websocket:pong').subscribe(evt => {
    websocketDebuglog('pong received')
  })
}

module.exports = {
  channels
}


/***/ }),

/***/ 8642:
/***/ ((module) => {

"use strict";


const kUndiciError = Symbol.for('undici.error.UND_ERR')
class UndiciError extends Error {
  constructor (message) {
    super(message)
    this.name = 'UndiciError'
    this.code = 'UND_ERR'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kUndiciError] === true
  }

  [kUndiciError] = true
}

const kConnectTimeoutError = Symbol.for('undici.error.UND_ERR_CONNECT_TIMEOUT')
class ConnectTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'ConnectTimeoutError'
    this.message = message || 'Connect Timeout Error'
    this.code = 'UND_ERR_CONNECT_TIMEOUT'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kConnectTimeoutError] === true
  }

  [kConnectTimeoutError] = true
}

const kHeadersTimeoutError = Symbol.for('undici.error.UND_ERR_HEADERS_TIMEOUT')
class HeadersTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'HeadersTimeoutError'
    this.message = message || 'Headers Timeout Error'
    this.code = 'UND_ERR_HEADERS_TIMEOUT'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kHeadersTimeoutError] === true
  }

  [kHeadersTimeoutError] = true
}

const kHeadersOverflowError = Symbol.for('undici.error.UND_ERR_HEADERS_OVERFLOW')
class HeadersOverflowError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'HeadersOverflowError'
    this.message = message || 'Headers Overflow Error'
    this.code = 'UND_ERR_HEADERS_OVERFLOW'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kHeadersOverflowError] === true
  }

  [kHeadersOverflowError] = true
}

const kBodyTimeoutError = Symbol.for('undici.error.UND_ERR_BODY_TIMEOUT')
class BodyTimeoutError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'BodyTimeoutError'
    this.message = message || 'Body Timeout Error'
    this.code = 'UND_ERR_BODY_TIMEOUT'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kBodyTimeoutError] === true
  }

  [kBodyTimeoutError] = true
}

const kResponseStatusCodeError = Symbol.for('undici.error.UND_ERR_RESPONSE_STATUS_CODE')
class ResponseStatusCodeError extends UndiciError {
  constructor (message, statusCode, headers, body) {
    super(message)
    this.name = 'ResponseStatusCodeError'
    this.message = message || 'Response Status Code Error'
    this.code = 'UND_ERR_RESPONSE_STATUS_CODE'
    this.body = body
    this.status = statusCode
    this.statusCode = statusCode
    this.headers = headers
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kResponseStatusCodeError] === true
  }

  [kResponseStatusCodeError] = true
}

const kInvalidArgumentError = Symbol.for('undici.error.UND_ERR_INVALID_ARG')
class InvalidArgumentError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'InvalidArgumentError'
    this.message = message || 'Invalid Argument Error'
    this.code = 'UND_ERR_INVALID_ARG'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kInvalidArgumentError] === true
  }

  [kInvalidArgumentError] = true
}

const kInvalidReturnValueError = Symbol.for('undici.error.UND_ERR_INVALID_RETURN_VALUE')
class InvalidReturnValueError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'InvalidReturnValueError'
    this.message = message || 'Invalid Return Value Error'
    this.code = 'UND_ERR_INVALID_RETURN_VALUE'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kInvalidReturnValueError] === true
  }

  [kInvalidReturnValueError] = true
}

const kAbortError = Symbol.for('undici.error.UND_ERR_ABORT')
class AbortError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'AbortError'
    this.message = message || 'The operation was aborted'
    this.code = 'UND_ERR_ABORT'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kAbortError] === true
  }

  [kAbortError] = true
}

const kRequestAbortedError = Symbol.for('undici.error.UND_ERR_ABORTED')
class RequestAbortedError extends AbortError {
  constructor (message) {
    super(message)
    this.name = 'AbortError'
    this.message = message || 'Request aborted'
    this.code = 'UND_ERR_ABORTED'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kRequestAbortedError] === true
  }

  [kRequestAbortedError] = true
}

const kInformationalError = Symbol.for('undici.error.UND_ERR_INFO')
class InformationalError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'InformationalError'
    this.message = message || 'Request information'
    this.code = 'UND_ERR_INFO'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kInformationalError] === true
  }

  [kInformationalError] = true
}

const kRequestContentLengthMismatchError = Symbol.for('undici.error.UND_ERR_REQ_CONTENT_LENGTH_MISMATCH')
class RequestContentLengthMismatchError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'RequestContentLengthMismatchError'
    this.message = message || 'Request body length does not match content-length header'
    this.code = 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kRequestContentLengthMismatchError] === true
  }

  [kRequestContentLengthMismatchError] = true
}

const kResponseContentLengthMismatchError = Symbol.for('undici.error.UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
class ResponseContentLengthMismatchError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'ResponseContentLengthMismatchError'
    this.message = message || 'Response body length does not match content-length header'
    this.code = 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kResponseContentLengthMismatchError] === true
  }

  [kResponseContentLengthMismatchError] = true
}

const kClientDestroyedError = Symbol.for('undici.error.UND_ERR_DESTROYED')
class ClientDestroyedError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'ClientDestroyedError'
    this.message = message || 'The client is destroyed'
    this.code = 'UND_ERR_DESTROYED'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kClientDestroyedError] === true
  }

  [kClientDestroyedError] = true
}

const kClientClosedError = Symbol.for('undici.error.UND_ERR_CLOSED')
class ClientClosedError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'ClientClosedError'
    this.message = message || 'The client is closed'
    this.code = 'UND_ERR_CLOSED'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kClientClosedError] === true
  }

  [kClientClosedError] = true
}

const kSocketError = Symbol.for('undici.error.UND_ERR_SOCKET')
class SocketError extends UndiciError {
  constructor (message, socket) {
    super(message)
    this.name = 'SocketError'
    this.message = message || 'Socket error'
    this.code = 'UND_ERR_SOCKET'
    this.socket = socket
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kSocketError] === true
  }

  [kSocketError] = true
}

const kNotSupportedError = Symbol.for('undici.error.UND_ERR_NOT_SUPPORTED')
class NotSupportedError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'NotSupportedError'
    this.message = message || 'Not supported error'
    this.code = 'UND_ERR_NOT_SUPPORTED'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kNotSupportedError] === true
  }

  [kNotSupportedError] = true
}

const kBalancedPoolMissingUpstreamError = Symbol.for('undici.error.UND_ERR_BPL_MISSING_UPSTREAM')
class BalancedPoolMissingUpstreamError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'MissingUpstreamError'
    this.message = message || 'No upstream has been added to the BalancedPool'
    this.code = 'UND_ERR_BPL_MISSING_UPSTREAM'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kBalancedPoolMissingUpstreamError] === true
  }

  [kBalancedPoolMissingUpstreamError] = true
}

const kHTTPParserError = Symbol.for('undici.error.UND_ERR_HTTP_PARSER')
class HTTPParserError extends Error {
  constructor (message, code, data) {
    super(message)
    this.name = 'HTTPParserError'
    this.code = code ? `HPE_${code}` : undefined
    this.data = data ? data.toString() : undefined
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kHTTPParserError] === true
  }

  [kHTTPParserError] = true
}

const kResponseExceededMaxSizeError = Symbol.for('undici.error.UND_ERR_RES_EXCEEDED_MAX_SIZE')
class ResponseExceededMaxSizeError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'ResponseExceededMaxSizeError'
    this.message = message || 'Response content exceeded max size'
    this.code = 'UND_ERR_RES_EXCEEDED_MAX_SIZE'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kResponseExceededMaxSizeError] === true
  }

  [kResponseExceededMaxSizeError] = true
}

const kRequestRetryError = Symbol.for('undici.error.UND_ERR_REQ_RETRY')
class RequestRetryError extends UndiciError {
  constructor (message, code, { headers, data }) {
    super(message)
    this.name = 'RequestRetryError'
    this.message = message || 'Request retry error'
    this.code = 'UND_ERR_REQ_RETRY'
    this.statusCode = code
    this.data = data
    this.headers = headers
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kRequestRetryError] === true
  }

  [kRequestRetryError] = true
}

const kResponseError = Symbol.for('undici.error.UND_ERR_RESPONSE')
class ResponseError extends UndiciError {
  constructor (message, code, { headers, data }) {
    super(message)
    this.name = 'ResponseError'
    this.message = message || 'Response error'
    this.code = 'UND_ERR_RESPONSE'
    this.statusCode = code
    this.data = data
    this.headers = headers
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kResponseError] === true
  }

  [kResponseError] = true
}

const kSecureProxyConnectionError = Symbol.for('undici.error.UND_ERR_PRX_TLS')
class SecureProxyConnectionError extends UndiciError {
  constructor (cause, message, options) {
    super(message, { cause, ...(options ?? {}) })
    this.name = 'SecureProxyConnectionError'
    this.message = message || 'Secure Proxy Connection failed'
    this.code = 'UND_ERR_PRX_TLS'
    this.cause = cause
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kSecureProxyConnectionError] === true
  }

  [kSecureProxyConnectionError] = true
}

const kMessageSizeExceededError = Symbol.for('undici.error.UND_ERR_WS_MESSAGE_SIZE_EXCEEDED')
class MessageSizeExceededError extends UndiciError {
  constructor (message) {
    super(message)
    this.name = 'MessageSizeExceededError'
    this.message = message || 'Max decompressed message size exceeded'
    this.code = 'UND_ERR_WS_MESSAGE_SIZE_EXCEEDED'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kMessageSizeExceededError] === true
  }

  get [kMessageSizeExceededError] () {
    return true
  }
}

module.exports = {
  AbortError,
  HTTPParserError,
  UndiciError,
  HeadersTimeoutError,
  HeadersOverflowError,
  BodyTimeoutError,
  RequestContentLengthMismatchError,
  ConnectTimeoutError,
  ResponseStatusCodeError,
  InvalidArgumentError,
  InvalidReturnValueError,
  RequestAbortedError,
  ClientDestroyedError,
  ClientClosedError,
  InformationalError,
  SocketError,
  NotSupportedError,
  ResponseContentLengthMismatchError,
  BalancedPoolMissingUpstreamError,
  ResponseExceededMaxSizeError,
  RequestRetryError,
  ResponseError,
  SecureProxyConnectionError,
  MessageSizeExceededError
}


/***/ }),

/***/ 21:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  InvalidArgumentError,
  NotSupportedError
} = __nccwpck_require__(8642)
const assert = __nccwpck_require__(8061)
const {
  isValidHTTPToken,
  isValidHeaderValue,
  isStream,
  destroy,
  isBuffer,
  isFormDataLike,
  isIterable,
  isBlobLike,
  buildURL,
  validateHandler,
  getServerName,
  normalizedMethodRecords
} = __nccwpck_require__(9099)
const { channels } = __nccwpck_require__(7055)
const { headerNameLowerCasedRecord } = __nccwpck_require__(2671)

// Verifies that a given path is valid does not contain control chars \x00 to \x20
const invalidPathRegex = /[^\u0021-\u00ff]/

const kHandler = Symbol('handler')

class Request {
  constructor (origin, {
    path,
    method,
    body,
    headers,
    query,
    idempotent,
    blocking,
    upgrade,
    headersTimeout,
    bodyTimeout,
    reset,
    throwOnError,
    expectContinue,
    servername
  }, handler) {
    if (typeof path !== 'string') {
      throw new InvalidArgumentError('path must be a string')
    } else if (
      path[0] !== '/' &&
      !(path.startsWith('http://') || path.startsWith('https://')) &&
      method !== 'CONNECT'
    ) {
      throw new InvalidArgumentError('path must be an absolute URL or start with a slash')
    } else if (invalidPathRegex.test(path)) {
      throw new InvalidArgumentError('invalid request path')
    }

    if (typeof method !== 'string') {
      throw new InvalidArgumentError('method must be a string')
    } else if (normalizedMethodRecords[method] === undefined && !isValidHTTPToken(method)) {
      throw new InvalidArgumentError('invalid request method')
    }

    if (upgrade && typeof upgrade !== 'string') {
      throw new InvalidArgumentError('upgrade must be a string')
    }

    if (upgrade && !isValidHeaderValue(upgrade)) {
      throw new InvalidArgumentError('invalid upgrade header')
    }

    if (headersTimeout != null && (!Number.isFinite(headersTimeout) || headersTimeout < 0)) {
      throw new InvalidArgumentError('invalid headersTimeout')
    }

    if (bodyTimeout != null && (!Number.isFinite(bodyTimeout) || bodyTimeout < 0)) {
      throw new InvalidArgumentError('invalid bodyTimeout')
    }

    if (reset != null && typeof reset !== 'boolean') {
      throw new InvalidArgumentError('invalid reset')
    }

    if (expectContinue != null && typeof expectContinue !== 'boolean') {
      throw new InvalidArgumentError('invalid expectContinue')
    }

    this.headersTimeout = headersTimeout

    this.bodyTimeout = bodyTimeout

    this.throwOnError = throwOnError === true

    this.method = method

    this.abort = null

    if (body == null) {
      this.body = null
    } else if (isStream(body)) {
      this.body = body

      const rState = this.body._readableState
      if (!rState || !rState.autoDestroy) {
        this.endHandler = function autoDestroy () {
          destroy(this)
        }
        this.body.on('end', this.endHandler)
      }

      this.errorHandler = err => {
        if (this.abort) {
          this.abort(err)
        } else {
          this.error = err
        }
      }
      this.body.on('error', this.errorHandler)
    } else if (isBuffer(body)) {
      this.body = body.byteLength ? body : null
    } else if (ArrayBuffer.isView(body)) {
      this.body = body.buffer.byteLength ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null
    } else if (body instanceof ArrayBuffer) {
      this.body = body.byteLength ? Buffer.from(body) : null
    } else if (typeof body === 'string') {
      this.body = body.length ? Buffer.from(body) : null
    } else if (isFormDataLike(body) || isIterable(body) || isBlobLike(body)) {
      this.body = body
    } else {
      throw new InvalidArgumentError('body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable')
    }

    this.completed = false

    this.aborted = false

    this.upgrade = upgrade || null

    this.path = query ? buildURL(path, query) : path

    this.origin = origin

    this.idempotent = idempotent == null
      ? method === 'HEAD' || method === 'GET'
      : idempotent

    this.blocking = blocking == null ? false : blocking

    this.reset = reset == null ? null : reset

    this.host = null

    this.contentLength = null

    this.contentType = null

    this.headers = []

    // Only for H2
    this.expectContinue = expectContinue != null ? expectContinue : false

    if (Array.isArray(headers)) {
      if (headers.length % 2 !== 0) {
        throw new InvalidArgumentError('headers array must be even')
      }
      for (let i = 0; i < headers.length; i += 2) {
        processHeader(this, headers[i], headers[i + 1])
      }
    } else if (headers && typeof headers === 'object') {
      if (headers[Symbol.iterator]) {
        for (const header of headers) {
          if (!Array.isArray(header) || header.length !== 2) {
            throw new InvalidArgumentError('headers must be in key-value pair format')
          }
          processHeader(this, header[0], header[1])
        }
      } else {
        const keys = Object.keys(headers)
        for (let i = 0; i < keys.length; ++i) {
          processHeader(this, keys[i], headers[keys[i]])
        }
      }
    } else if (headers != null) {
      throw new InvalidArgumentError('headers must be an object or an array')
    }

    validateHandler(handler, method, upgrade)

    this.servername = servername || getServerName(this.host)

    this[kHandler] = handler

    if (channels.create.hasSubscribers) {
      channels.create.publish({ request: this })
    }
  }

  onBodySent (chunk) {
    if (this[kHandler].onBodySent) {
      try {
        return this[kHandler].onBodySent(chunk)
      } catch (err) {
        this.abort(err)
      }
    }
  }

  onRequestSent () {
    if (channels.bodySent.hasSubscribers) {
      channels.bodySent.publish({ request: this })
    }

    if (this[kHandler].onRequestSent) {
      try {
        return this[kHandler].onRequestSent()
      } catch (err) {
        this.abort(err)
      }
    }
  }

  onConnect (abort) {
    assert(!this.aborted)
    assert(!this.completed)

    if (this.error) {
      abort(this.error)
    } else {
      this.abort = abort
      return this[kHandler].onConnect(abort)
    }
  }

  onResponseStarted () {
    return this[kHandler].onResponseStarted?.()
  }

  onHeaders (statusCode, headers, resume, statusText) {
    assert(!this.aborted)
    assert(!this.completed)

    if (channels.headers.hasSubscribers) {
      channels.headers.publish({ request: this, response: { statusCode, headers, statusText } })
    }

    try {
      return this[kHandler].onHeaders(statusCode, headers, resume, statusText)
    } catch (err) {
      this.abort(err)
    }
  }

  onData (chunk) {
    assert(!this.aborted)
    assert(!this.completed)

    try {
      return this[kHandler].onData(chunk)
    } catch (err) {
      this.abort(err)
      return false
    }
  }

  onUpgrade (statusCode, headers, socket) {
    assert(!this.aborted)
    assert(!this.completed)

    return this[kHandler].onUpgrade(statusCode, headers, socket)
  }

  onComplete (trailers) {
    this.onFinally()

    assert(!this.aborted)

    this.completed = true
    if (channels.trailers.hasSubscribers) {
      channels.trailers.publish({ request: this, trailers })
    }

    try {
      return this[kHandler].onComplete(trailers)
    } catch (err) {
      // TODO (fix): This might be a bad idea?
      this.onError(err)
    }
  }

  onError (error) {
    this.onFinally()

    if (channels.error.hasSubscribers) {
      channels.error.publish({ request: this, error })
    }

    if (this.aborted) {
      return
    }
    this.aborted = true

    return this[kHandler].onError(error)
  }

  onFinally () {
    if (this.errorHandler) {
      this.body.off('error', this.errorHandler)
      this.errorHandler = null
    }

    if (this.endHandler) {
      this.body.off('end', this.endHandler)
      this.endHandler = null
    }
  }

  addHeader (key, value) {
    processHeader(this, key, value)
    return this
  }
}

function processHeader (request, key, val) {
  if (val && (typeof val === 'object' && !Array.isArray(val))) {
    throw new InvalidArgumentError(`invalid ${key} header`)
  } else if (val === undefined) {
    return
  }

  let headerName = headerNameLowerCasedRecord[key]

  if (headerName === undefined) {
    headerName = key.toLowerCase()
    if (headerNameLowerCasedRecord[headerName] === undefined && !isValidHTTPToken(headerName)) {
      throw new InvalidArgumentError('invalid header key')
    }
  }

  if (Array.isArray(val)) {
    const arr = []
    for (let i = 0; i < val.length; i++) {
      if (typeof val[i] === 'string') {
        if (!isValidHeaderValue(val[i])) {
          throw new InvalidArgumentError(`invalid ${key} header`)
        }
        arr.push(val[i])
      } else if (val[i] === null) {
        arr.push('')
      } else if (typeof val[i] === 'object') {
        throw new InvalidArgumentError(`invalid ${key} header`)
      } else {
        arr.push(`${val[i]}`)
      }
    }
    val = arr
  } else if (typeof val === 'string') {
    if (!isValidHeaderValue(val)) {
      throw new InvalidArgumentError(`invalid ${key} header`)
    }
  } else if (val === null) {
    val = ''
  } else {
    val = `${val}`
  }

  if (headerName === 'host') {
    if (request.host !== null) {
      throw new InvalidArgumentError('duplicate host header')
    }
    if (typeof val !== 'string') {
      throw new InvalidArgumentError('invalid host header')
    }
    // Consumed by Client
    request.host = val
  } else if (headerName === 'content-length') {
    if (request.contentLength !== null) {
      throw new InvalidArgumentError('duplicate content-length header')
    }
    request.contentLength = parseInt(val, 10)
    if (!Number.isFinite(request.contentLength)) {
      throw new InvalidArgumentError('invalid content-length header')
    }
  } else if (request.contentType === null && headerName === 'content-type') {
    request.contentType = val
    request.headers.push(key, val)
  } else if (headerName === 'transfer-encoding' || headerName === 'keep-alive' || headerName === 'upgrade') {
    throw new InvalidArgumentError(`invalid ${headerName} header`)
  } else if (headerName === 'connection') {
    const value = typeof val === 'string' ? val.toLowerCase() : null
    if (value !== 'close' && value !== 'keep-alive') {
      throw new InvalidArgumentError('invalid connection header')
    }

    if (value === 'close') {
      request.reset = true
    }
  } else if (headerName === 'expect') {
    throw new NotSupportedError('expect header not supported')
  } else {
    request.headers.push(key, val)
  }
}

module.exports = Request


/***/ }),

/***/ 46:
/***/ ((module) => {

module.exports = {
  kClose: Symbol('close'),
  kDestroy: Symbol('destroy'),
  kDispatch: Symbol('dispatch'),
  kUrl: Symbol('url'),
  kWriting: Symbol('writing'),
  kResuming: Symbol('resuming'),
  kQueue: Symbol('queue'),
  kConnect: Symbol('connect'),
  kConnecting: Symbol('connecting'),
  kKeepAliveDefaultTimeout: Symbol('default keep alive timeout'),
  kKeepAliveMaxTimeout: Symbol('max keep alive timeout'),
  kKeepAliveTimeoutThreshold: Symbol('keep alive timeout threshold'),
  kKeepAliveTimeoutValue: Symbol('keep alive timeout'),
  kKeepAlive: Symbol('keep alive'),
  kHeadersTimeout: Symbol('headers timeout'),
  kBodyTimeout: Symbol('body timeout'),
  kServerName: Symbol('server name'),
  kLocalAddress: Symbol('local address'),
  kHost: Symbol('host'),
  kNoRef: Symbol('no ref'),
  kBodyUsed: Symbol('used'),
  kBody: Symbol('abstracted request body'),
  kRunning: Symbol('running'),
  kBlocking: Symbol('blocking'),
  kPending: Symbol('pending'),
  kSize: Symbol('size'),
  kBusy: Symbol('busy'),
  kQueued: Symbol('queued'),
  kFree: Symbol('free'),
  kConnected: Symbol('connected'),
  kClosed: Symbol('closed'),
  kNeedDrain: Symbol('need drain'),
  kReset: Symbol('reset'),
  kDestroyed: Symbol.for('nodejs.stream.destroyed'),
  kResume: Symbol('resume'),
  kOnError: Symbol('on error'),
  kMaxHeadersSize: Symbol('max headers size'),
  kRunningIdx: Symbol('running index'),
  kPendingIdx: Symbol('pending index'),
  kError: Symbol('error'),
  kClients: Symbol('clients'),
  kClient: Symbol('client'),
  kParser: Symbol('parser'),
  kOnDestroyed: Symbol('destroy callbacks'),
  kPipelining: Symbol('pipelining'),
  kSocket: Symbol('socket'),
  kHostHeader: Symbol('host header'),
  kConnector: Symbol('connector'),
  kStrictContentLength: Symbol('strict content length'),
  kMaxRedirections: Symbol('maxRedirections'),
  kMaxRequests: Symbol('maxRequestsPerClient'),
  kProxy: Symbol('proxy agent options'),
  kCounter: Symbol('socket request counter'),
  kInterceptors: Symbol('dispatch interceptors'),
  kMaxResponseSize: Symbol('max response size'),
  kHTTP2Session: Symbol('http2Session'),
  kHTTP2SessionState: Symbol('http2Session state'),
  kRetryHandlerDefaultRetry: Symbol('retry agent default retry'),
  kConstruct: Symbol('constructable'),
  kListeners: Symbol('listeners'),
  kHTTPContext: Symbol('http context'),
  kMaxConcurrentStreams: Symbol('max concurrent streams'),
  kNoProxyAgent: Symbol('no proxy agent'),
  kHttpProxyAgent: Symbol('http proxy agent'),
  kHttpsProxyAgent: Symbol('https proxy agent')
}


/***/ }),

/***/ 4141:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  wellknownHeaderNames,
  headerNameLowerCasedRecord
} = __nccwpck_require__(2671)

class TstNode {
  /** @type {any} */
  value = null
  /** @type {null | TstNode} */
  left = null
  /** @type {null | TstNode} */
  middle = null
  /** @type {null | TstNode} */
  right = null
  /** @type {number} */
  code
  /**
   * @param {string} key
   * @param {any} value
   * @param {number} index
   */
  constructor (key, value, index) {
    if (index === undefined || index >= key.length) {
      throw new TypeError('Unreachable')
    }
    const code = this.code = key.charCodeAt(index)
    // check code is ascii string
    if (code > 0x7F) {
      throw new TypeError('key must be ascii string')
    }
    if (key.length !== ++index) {
      this.middle = new TstNode(key, value, index)
    } else {
      this.value = value
    }
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  add (key, value) {
    const length = key.length
    if (length === 0) {
      throw new TypeError('Unreachable')
    }
    let index = 0
    let node = this
    while (true) {
      const code = key.charCodeAt(index)
      // check code is ascii string
      if (code > 0x7F) {
        throw new TypeError('key must be ascii string')
      }
      if (node.code === code) {
        if (length === ++index) {
          node.value = value
          break
        } else if (node.middle !== null) {
          node = node.middle
        } else {
          node.middle = new TstNode(key, value, index)
          break
        }
      } else if (node.code < code) {
        if (node.left !== null) {
          node = node.left
        } else {
          node.left = new TstNode(key, value, index)
          break
        }
      } else if (node.right !== null) {
        node = node.right
      } else {
        node.right = new TstNode(key, value, index)
        break
      }
    }
  }

  /**
   * @param {Uint8Array} key
   * @return {TstNode | null}
   */
  search (key) {
    const keylength = key.length
    let index = 0
    let node = this
    while (node !== null && index < keylength) {
      let code = key[index]
      // A-Z
      // First check if it is bigger than 0x5a.
      // Lowercase letters have higher char codes than uppercase ones.
      // Also we assume that headers will mostly contain lowercase characters.
      if (code <= 0x5a && code >= 0x41) {
        // Lowercase for uppercase.
        code |= 32
      }
      while (node !== null) {
        if (code === node.code) {
          if (keylength === ++index) {
            // Returns Node since it is the last key.
            return node
          }
          node = node.middle
          break
        }
        node = node.code < code ? node.left : node.right
      }
    }
    return null
  }
}

class TernarySearchTree {
  /** @type {TstNode | null} */
  node = null

  /**
   * @param {string} key
   * @param {any} value
   * */
  insert (key, value) {
    if (this.node === null) {
      this.node = new TstNode(key, value, 0)
    } else {
      this.node.add(key, value)
    }
  }

  /**
   * @param {Uint8Array} key
   * @return {any}
   */
  lookup (key) {
    return this.node?.search(key)?.value ?? null
  }
}

const tree = new TernarySearchTree()

for (let i = 0; i < wellknownHeaderNames.length; ++i) {
  const key = headerNameLowerCasedRecord[wellknownHeaderNames[i]]
  tree.insert(key, key)
}

module.exports = {
  TernarySearchTree,
  tree
}


/***/ }),

/***/ 9099:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)
const { kDestroyed, kBodyUsed, kListeners, kBody } = __nccwpck_require__(46)
const { IncomingMessage } = __nccwpck_require__(8849)
const stream = __nccwpck_require__(4492)
const net = __nccwpck_require__(7503)
const { Blob } = __nccwpck_require__(2254)
const nodeUtil = __nccwpck_require__(7261)
const { stringify } = __nccwpck_require__(9630)
const { EventEmitter: EE } = __nccwpck_require__(5673)
const { InvalidArgumentError } = __nccwpck_require__(8642)
const { headerNameLowerCasedRecord } = __nccwpck_require__(2671)
const { tree } = __nccwpck_require__(4141)

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(v => Number(v))

class BodyAsyncIterable {
  constructor (body) {
    this[kBody] = body
    this[kBodyUsed] = false
  }

  async * [Symbol.asyncIterator] () {
    assert(!this[kBodyUsed], 'disturbed')
    this[kBodyUsed] = true
    yield * this[kBody]
  }
}

function wrapRequestBody (body) {
  if (isStream(body)) {
    // TODO (fix): Provide some way for the user to cache the file to e.g. /tmp
    // so that it can be dispatched again?
    // TODO (fix): Do we need 100-expect support to provide a way to do this properly?
    if (bodyLength(body) === 0) {
      body
        .on('data', function () {
          assert(false)
        })
    }

    if (typeof body.readableDidRead !== 'boolean') {
      body[kBodyUsed] = false
      EE.prototype.on.call(body, 'data', function () {
        this[kBodyUsed] = true
      })
    }

    return body
  } else if (body && typeof body.pipeTo === 'function') {
    // TODO (fix): We can't access ReadableStream internal state
    // to determine whether or not it has been disturbed. This is just
    // a workaround.
    return new BodyAsyncIterable(body)
  } else if (
    body &&
    typeof body !== 'string' &&
    !ArrayBuffer.isView(body) &&
    isIterable(body)
  ) {
    // TODO: Should we allow re-using iterable if !this.opts.idempotent
    // or through some other flag?
    return new BodyAsyncIterable(body)
  } else {
    return body
  }
}

function nop () {}

function isStream (obj) {
  return obj && typeof obj === 'object' && typeof obj.pipe === 'function' && typeof obj.on === 'function'
}

// based on https://github.com/node-fetch/fetch-blob/blob/8ab587d34080de94140b54f07168451e7d0b655e/index.js#L229-L241 (MIT License)
function isBlobLike (object) {
  if (object === null) {
    return false
  } else if (object instanceof Blob) {
    return true
  } else if (typeof object !== 'object') {
    return false
  } else {
    const sTag = object[Symbol.toStringTag]

    return (sTag === 'Blob' || sTag === 'File') && (
      ('stream' in object && typeof object.stream === 'function') ||
      ('arrayBuffer' in object && typeof object.arrayBuffer === 'function')
    )
  }
}

function buildURL (url, queryParams) {
  if (url.includes('?') || url.includes('#')) {
    throw new Error('Query params cannot be passed when url already contains "?" or "#".')
  }

  const stringified = stringify(queryParams)

  if (stringified) {
    url += '?' + stringified
  }

  return url
}

function isValidPort (port) {
  const value = parseInt(port, 10)
  return (
    value === Number(port) &&
    value >= 0 &&
    value <= 65535
  )
}

function isHttpOrHttpsPrefixed (value) {
  return (
    value != null &&
    value[0] === 'h' &&
    value[1] === 't' &&
    value[2] === 't' &&
    value[3] === 'p' &&
    (
      value[4] === ':' ||
      (
        value[4] === 's' &&
        value[5] === ':'
      )
    )
  )
}

function parseURL (url) {
  if (typeof url === 'string') {
    url = new URL(url)

    if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
      throw new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.')
    }

    return url
  }

  if (!url || typeof url !== 'object') {
    throw new InvalidArgumentError('Invalid URL: The URL argument must be a non-null object.')
  }

  if (!(url instanceof URL)) {
    if (url.port != null && url.port !== '' && isValidPort(url.port) === false) {
      throw new InvalidArgumentError('Invalid URL: port must be a valid integer or a string representation of an integer.')
    }

    if (url.path != null && typeof url.path !== 'string') {
      throw new InvalidArgumentError('Invalid URL path: the path must be a string or null/undefined.')
    }

    if (url.pathname != null && typeof url.pathname !== 'string') {
      throw new InvalidArgumentError('Invalid URL pathname: the pathname must be a string or null/undefined.')
    }

    if (url.hostname != null && typeof url.hostname !== 'string') {
      throw new InvalidArgumentError('Invalid URL hostname: the hostname must be a string or null/undefined.')
    }

    if (url.origin != null && typeof url.origin !== 'string') {
      throw new InvalidArgumentError('Invalid URL origin: the origin must be a string or null/undefined.')
    }

    if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
      throw new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.')
    }

    const port = url.port != null
      ? url.port
      : (url.protocol === 'https:' ? 443 : 80)
    let origin = url.origin != null
      ? url.origin
      : `${url.protocol || ''}//${url.hostname || ''}:${port}`
    let path = url.path != null
      ? url.path
      : `${url.pathname || ''}${url.search || ''}`

    if (origin[origin.length - 1] === '/') {
      origin = origin.slice(0, origin.length - 1)
    }

    if (path && path[0] !== '/') {
      path = `/${path}`
    }
    // new URL(path, origin) is unsafe when `path` contains an absolute URL
    // From https://developer.mozilla.org/en-US/docs/Web/API/URL/URL:
    // If first parameter is a relative URL, second param is required, and will be used as the base URL.
    // If first parameter is an absolute URL, a given second param will be ignored.
    return new URL(`${origin}${path}`)
  }

  if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
    throw new InvalidArgumentError('Invalid URL protocol: the URL must start with `http:` or `https:`.')
  }

  return url
}

function parseOrigin (url) {
  url = parseURL(url)

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new InvalidArgumentError('invalid url')
  }

  return url
}

function getHostname (host) {
  if (host[0] === '[') {
    const idx = host.indexOf(']')

    assert(idx !== -1)
    return host.substring(1, idx)
  }

  const idx = host.indexOf(':')
  if (idx === -1) return host

  return host.substring(0, idx)
}

// IP addresses are not valid server names per RFC6066
// > Currently, the only server names supported are DNS hostnames
function getServerName (host) {
  if (!host) {
    return null
  }

  assert(typeof host === 'string')

  const servername = getHostname(host)
  if (net.isIP(servername)) {
    return ''
  }

  return servername
}

function deepClone (obj) {
  return JSON.parse(JSON.stringify(obj))
}

function isAsyncIterable (obj) {
  return !!(obj != null && typeof obj[Symbol.asyncIterator] === 'function')
}

function isIterable (obj) {
  return !!(obj != null && (typeof obj[Symbol.iterator] === 'function' || typeof obj[Symbol.asyncIterator] === 'function'))
}

function bodyLength (body) {
  if (body == null) {
    return 0
  } else if (isStream(body)) {
    const state = body._readableState
    return state && state.objectMode === false && state.ended === true && Number.isFinite(state.length)
      ? state.length
      : null
  } else if (isBlobLike(body)) {
    return body.size != null ? body.size : null
  } else if (isBuffer(body)) {
    return body.byteLength
  }

  return null
}

function isDestroyed (body) {
  return body && !!(body.destroyed || body[kDestroyed] || (stream.isDestroyed?.(body)))
}

function destroy (stream, err) {
  if (stream == null || !isStream(stream) || isDestroyed(stream)) {
    return
  }

  if (typeof stream.destroy === 'function') {
    if (Object.getPrototypeOf(stream).constructor === IncomingMessage) {
      // See: https://github.com/nodejs/node/pull/38505/files
      stream.socket = null
    }

    stream.destroy(err)
  } else if (err) {
    queueMicrotask(() => {
      stream.emit('error', err)
    })
  }

  if (stream.destroyed !== true) {
    stream[kDestroyed] = true
  }
}

const KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/
function parseKeepAliveTimeout (val) {
  const m = val.toString().match(KEEPALIVE_TIMEOUT_EXPR)
  return m ? parseInt(m[1], 10) * 1000 : null
}

/**
 * Retrieves a header name and returns its lowercase value.
 * @param {string | Buffer} value Header name
 * @returns {string}
 */
function headerNameToString (value) {
  return typeof value === 'string'
    ? headerNameLowerCasedRecord[value] ?? value.toLowerCase()
    : tree.lookup(value) ?? value.toString('latin1').toLowerCase()
}

/**
 * Receive the buffer as a string and return its lowercase value.
 * @param {Buffer} value Header name
 * @returns {string}
 */
function bufferToLowerCasedHeaderName (value) {
  return tree.lookup(value) ?? value.toString('latin1').toLowerCase()
}

/**
 * @param {Record<string, string | string[]> | (Buffer | string | (Buffer | string)[])[]} headers
 * @param {Record<string, string | string[]>} [obj]
 * @returns {Record<string, string | string[]>}
 */
function parseHeaders (headers, obj) {
  if (obj === undefined) obj = {}
  for (let i = 0; i < headers.length; i += 2) {
    const key = headerNameToString(headers[i])
    let val = obj[key]

    if (val) {
      if (typeof val === 'string') {
        val = [val]
        obj[key] = val
      }
      val.push(headers[i + 1].toString('utf8'))
    } else {
      const headersValue = headers[i + 1]
      if (typeof headersValue === 'string') {
        obj[key] = headersValue
      } else {
        obj[key] = Array.isArray(headersValue) ? headersValue.map(x => x.toString('utf8')) : headersValue.toString('utf8')
      }
    }
  }

  // See https://github.com/nodejs/node/pull/46528
  if ('content-length' in obj && 'content-disposition' in obj) {
    obj['content-disposition'] = Buffer.from(obj['content-disposition']).toString('latin1')
  }

  return obj
}

function parseRawHeaders (headers) {
  const len = headers.length
  const ret = new Array(len)

  let hasContentLength = false
  let contentDispositionIdx = -1
  let key
  let val
  let kLen = 0

  for (let n = 0; n < headers.length; n += 2) {
    key = headers[n]
    val = headers[n + 1]

    typeof key !== 'string' && (key = key.toString())
    typeof val !== 'string' && (val = val.toString('utf8'))

    kLen = key.length
    if (kLen === 14 && key[7] === '-' && (key === 'content-length' || key.toLowerCase() === 'content-length')) {
      hasContentLength = true
    } else if (kLen === 19 && key[7] === '-' && (key === 'content-disposition' || key.toLowerCase() === 'content-disposition')) {
      contentDispositionIdx = n + 1
    }
    ret[n] = key
    ret[n + 1] = val
  }

  // See https://github.com/nodejs/node/pull/46528
  if (hasContentLength && contentDispositionIdx !== -1) {
    ret[contentDispositionIdx] = Buffer.from(ret[contentDispositionIdx]).toString('latin1')
  }

  return ret
}

function isBuffer (buffer) {
  // See, https://github.com/mcollina/undici/pull/319
  return buffer instanceof Uint8Array || Buffer.isBuffer(buffer)
}

function validateHandler (handler, method, upgrade) {
  if (!handler || typeof handler !== 'object') {
    throw new InvalidArgumentError('handler must be an object')
  }

  if (typeof handler.onConnect !== 'function') {
    throw new InvalidArgumentError('invalid onConnect method')
  }

  if (typeof handler.onError !== 'function') {
    throw new InvalidArgumentError('invalid onError method')
  }

  if (typeof handler.onBodySent !== 'function' && handler.onBodySent !== undefined) {
    throw new InvalidArgumentError('invalid onBodySent method')
  }

  if (upgrade || method === 'CONNECT') {
    if (typeof handler.onUpgrade !== 'function') {
      throw new InvalidArgumentError('invalid onUpgrade method')
    }
  } else {
    if (typeof handler.onHeaders !== 'function') {
      throw new InvalidArgumentError('invalid onHeaders method')
    }

    if (typeof handler.onData !== 'function') {
      throw new InvalidArgumentError('invalid onData method')
    }

    if (typeof handler.onComplete !== 'function') {
      throw new InvalidArgumentError('invalid onComplete method')
    }
  }
}

// A body is disturbed if it has been read from and it cannot
// be re-used without losing state or data.
function isDisturbed (body) {
  // TODO (fix): Why is body[kBodyUsed] needed?
  return !!(body && (stream.isDisturbed(body) || body[kBodyUsed]))
}

function isErrored (body) {
  return !!(body && stream.isErrored(body))
}

function isReadable (body) {
  return !!(body && stream.isReadable(body))
}

function getSocketInfo (socket) {
  return {
    localAddress: socket.localAddress,
    localPort: socket.localPort,
    remoteAddress: socket.remoteAddress,
    remotePort: socket.remotePort,
    remoteFamily: socket.remoteFamily,
    timeout: socket.timeout,
    bytesWritten: socket.bytesWritten,
    bytesRead: socket.bytesRead
  }
}

/** @type {globalThis['ReadableStream']} */
function ReadableStreamFrom (iterable) {
  // We cannot use ReadableStream.from here because it does not return a byte stream.

  let iterator
  return new ReadableStream(
    {
      async start () {
        iterator = iterable[Symbol.asyncIterator]()
      },
      async pull (controller) {
        const { done, value } = await iterator.next()
        if (done) {
          queueMicrotask(() => {
            controller.close()
            controller.byobRequest?.respond(0)
          })
        } else {
          const buf = Buffer.isBuffer(value) ? value : Buffer.from(value)
          if (buf.byteLength) {
            controller.enqueue(new Uint8Array(buf))
          }
        }
        return controller.desiredSize > 0
      },
      async cancel (reason) {
        await iterator.return()
      },
      type: 'bytes'
    }
  )
}

// The chunk should be a FormData instance and contains
// all the required methods.
function isFormDataLike (object) {
  return (
    object &&
    typeof object === 'object' &&
    typeof object.append === 'function' &&
    typeof object.delete === 'function' &&
    typeof object.get === 'function' &&
    typeof object.getAll === 'function' &&
    typeof object.has === 'function' &&
    typeof object.set === 'function' &&
    object[Symbol.toStringTag] === 'FormData'
  )
}

function addAbortListener (signal, listener) {
  if ('addEventListener' in signal) {
    signal.addEventListener('abort', listener, { once: true })
    return () => signal.removeEventListener('abort', listener)
  }
  signal.addListener('abort', listener)
  return () => signal.removeListener('abort', listener)
}

const hasToWellFormed = typeof String.prototype.toWellFormed === 'function'
const hasIsWellFormed = typeof String.prototype.isWellFormed === 'function'

/**
 * @param {string} val
 */
function toUSVString (val) {
  return hasToWellFormed ? `${val}`.toWellFormed() : nodeUtil.toUSVString(val)
}

/**
 * @param {string} val
 */
// TODO: move this to webidl
function isUSVString (val) {
  return hasIsWellFormed ? `${val}`.isWellFormed() : toUSVString(val) === `${val}`
}

/**
 * @see https://tools.ietf.org/html/rfc7230#section-3.2.6
 * @param {number} c
 */
function isTokenCharCode (c) {
  switch (c) {
    case 0x22:
    case 0x28:
    case 0x29:
    case 0x2c:
    case 0x2f:
    case 0x3a:
    case 0x3b:
    case 0x3c:
    case 0x3d:
    case 0x3e:
    case 0x3f:
    case 0x40:
    case 0x5b:
    case 0x5c:
    case 0x5d:
    case 0x7b:
    case 0x7d:
      // DQUOTE and "(),/:;<=>?@[\]{}"
      return false
    default:
      // VCHAR %x21-7E
      return c >= 0x21 && c <= 0x7e
  }
}

/**
 * @param {string} characters
 */
function isValidHTTPToken (characters) {
  if (characters.length === 0) {
    return false
  }
  for (let i = 0; i < characters.length; ++i) {
    if (!isTokenCharCode(characters.charCodeAt(i))) {
      return false
    }
  }
  return true
}

// headerCharRegex have been lifted from
// https://github.com/nodejs/node/blob/main/lib/_http_common.js

/**
 * Matches if val contains an invalid field-vchar
 *  field-value    = *( field-content / obs-fold )
 *  field-content  = field-vchar [ 1*( SP / HTAB ) field-vchar ]
 *  field-vchar    = VCHAR / obs-text
 */
const headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/

/**
 * @param {string} characters
 */
function isValidHeaderValue (characters) {
  return !headerCharRegex.test(characters)
}

// Parsed accordingly to RFC 9110
// https://www.rfc-editor.org/rfc/rfc9110#field.content-range
function parseRangeHeader (range) {
  if (range == null || range === '') return { start: 0, end: null, size: null }

  const m = range ? range.match(/^bytes (\d+)-(\d+)\/(\d+)?$/) : null
  return m
    ? {
        start: parseInt(m[1]),
        end: m[2] ? parseInt(m[2]) : null,
        size: m[3] ? parseInt(m[3]) : null
      }
    : null
}

function addListener (obj, name, listener) {
  const listeners = (obj[kListeners] ??= [])
  listeners.push([name, listener])
  obj.on(name, listener)
  return obj
}

function removeAllListeners (obj) {
  for (const [name, listener] of obj[kListeners] ?? []) {
    obj.removeListener(name, listener)
  }
  obj[kListeners] = null
}

function errorRequest (client, request, err) {
  try {
    request.onError(err)
    assert(request.aborted)
  } catch (err) {
    client.emit('error', err)
  }
}

const kEnumerableProperty = Object.create(null)
kEnumerableProperty.enumerable = true

const normalizedMethodRecordsBase = {
  delete: 'DELETE',
  DELETE: 'DELETE',
  get: 'GET',
  GET: 'GET',
  head: 'HEAD',
  HEAD: 'HEAD',
  options: 'OPTIONS',
  OPTIONS: 'OPTIONS',
  post: 'POST',
  POST: 'POST',
  put: 'PUT',
  PUT: 'PUT'
}

const normalizedMethodRecords = {
  ...normalizedMethodRecordsBase,
  patch: 'patch',
  PATCH: 'PATCH'
}

// Note: object prototypes should not be able to be referenced. e.g. `Object#hasOwnProperty`.
Object.setPrototypeOf(normalizedMethodRecordsBase, null)
Object.setPrototypeOf(normalizedMethodRecords, null)

module.exports = {
  kEnumerableProperty,
  nop,
  isDisturbed,
  isErrored,
  isReadable,
  toUSVString,
  isUSVString,
  isBlobLike,
  parseOrigin,
  parseURL,
  getServerName,
  isStream,
  isIterable,
  isAsyncIterable,
  isDestroyed,
  headerNameToString,
  bufferToLowerCasedHeaderName,
  addListener,
  removeAllListeners,
  errorRequest,
  parseRawHeaders,
  parseHeaders,
  parseKeepAliveTimeout,
  destroy,
  bodyLength,
  deepClone,
  ReadableStreamFrom,
  isBuffer,
  validateHandler,
  getSocketInfo,
  isFormDataLike,
  buildURL,
  addAbortListener,
  isValidHTTPToken,
  isValidHeaderValue,
  isTokenCharCode,
  parseRangeHeader,
  normalizedMethodRecordsBase,
  normalizedMethodRecords,
  isValidPort,
  isHttpOrHttpsPrefixed,
  nodeMajor,
  nodeMinor,
  safeHTTPMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'],
  wrapRequestBody
}


/***/ }),

/***/ 6705:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { InvalidArgumentError } = __nccwpck_require__(8642)
const { kClients, kRunning, kClose, kDestroy, kDispatch, kInterceptors } = __nccwpck_require__(46)
const DispatcherBase = __nccwpck_require__(6414)
const Pool = __nccwpck_require__(1076)
const Client = __nccwpck_require__(4885)
const util = __nccwpck_require__(9099)
const createRedirectInterceptor = __nccwpck_require__(5292)

const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kOnConnectionError = Symbol('onConnectionError')
const kMaxRedirections = Symbol('maxRedirections')
const kOnDrain = Symbol('onDrain')
const kFactory = Symbol('factory')
const kOptions = Symbol('options')

function defaultFactory (origin, opts) {
  return opts && opts.connections === 1
    ? new Client(origin, opts)
    : new Pool(origin, opts)
}

class Agent extends DispatcherBase {
  constructor ({ factory = defaultFactory, maxRedirections = 0, connect, ...options } = {}) {
    super()

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    if (connect != null && typeof connect !== 'function' && typeof connect !== 'object') {
      throw new InvalidArgumentError('connect must be a function or an object')
    }

    if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
      throw new InvalidArgumentError('maxRedirections must be a positive number')
    }

    if (connect && typeof connect !== 'function') {
      connect = { ...connect }
    }

    this[kInterceptors] = options.interceptors?.Agent && Array.isArray(options.interceptors.Agent)
      ? options.interceptors.Agent
      : [createRedirectInterceptor({ maxRedirections })]

    this[kOptions] = { ...util.deepClone(options), connect }
    this[kOptions].interceptors = options.interceptors
      ? { ...options.interceptors }
      : undefined
    this[kMaxRedirections] = maxRedirections
    this[kFactory] = factory
    this[kClients] = new Map()

    this[kOnDrain] = (origin, targets) => {
      this.emit('drain', origin, [this, ...targets])
    }

    this[kOnConnect] = (origin, targets) => {
      this.emit('connect', origin, [this, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      this.emit('disconnect', origin, [this, ...targets], err)
    }

    this[kOnConnectionError] = (origin, targets, err) => {
      this.emit('connectionError', origin, [this, ...targets], err)
    }
  }

  get [kRunning] () {
    let ret = 0
    for (const client of this[kClients].values()) {
      ret += client[kRunning]
    }
    return ret
  }

  [kDispatch] (opts, handler) {
    let key
    if (opts.origin && (typeof opts.origin === 'string' || opts.origin instanceof URL)) {
      key = String(opts.origin)
    } else {
      throw new InvalidArgumentError('opts.origin must be a non-empty string or URL.')
    }

    let dispatcher = this[kClients].get(key)

    if (!dispatcher) {
      dispatcher = this[kFactory](opts.origin, this[kOptions])
        .on('drain', this[kOnDrain])
        .on('connect', this[kOnConnect])
        .on('disconnect', this[kOnDisconnect])
        .on('connectionError', this[kOnConnectionError])

      // This introduces a tiny memory leak, as dispatchers are never removed from the map.
      // TODO(mcollina): remove te timer when the client/pool do not have any more
      // active connections.
      this[kClients].set(key, dispatcher)
    }

    return dispatcher.dispatch(opts, handler)
  }

  async [kClose] () {
    const closePromises = []
    for (const client of this[kClients].values()) {
      closePromises.push(client.close())
    }
    this[kClients].clear()

    await Promise.all(closePromises)
  }

  async [kDestroy] (err) {
    const destroyPromises = []
    for (const client of this[kClients].values()) {
      destroyPromises.push(client.destroy(err))
    }
    this[kClients].clear()

    await Promise.all(destroyPromises)
  }
}

module.exports = Agent


/***/ }),

/***/ 1475:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  BalancedPoolMissingUpstreamError,
  InvalidArgumentError
} = __nccwpck_require__(8642)
const {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kRemoveClient,
  kGetDispatcher
} = __nccwpck_require__(1556)
const Pool = __nccwpck_require__(1076)
const { kUrl, kInterceptors } = __nccwpck_require__(46)
const { parseOrigin } = __nccwpck_require__(9099)
const kFactory = Symbol('factory')

const kOptions = Symbol('options')
const kGreatestCommonDivisor = Symbol('kGreatestCommonDivisor')
const kCurrentWeight = Symbol('kCurrentWeight')
const kIndex = Symbol('kIndex')
const kWeight = Symbol('kWeight')
const kMaxWeightPerServer = Symbol('kMaxWeightPerServer')
const kErrorPenalty = Symbol('kErrorPenalty')

/**
 * Calculate the greatest common divisor of two numbers by
 * using the Euclidean algorithm.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function getGreatestCommonDivisor (a, b) {
  if (a === 0) return b

  while (b !== 0) {
    const t = b
    b = a % b
    a = t
  }
  return a
}

function defaultFactory (origin, opts) {
  return new Pool(origin, opts)
}

class BalancedPool extends PoolBase {
  constructor (upstreams = [], { factory = defaultFactory, ...opts } = {}) {
    super()

    this[kOptions] = opts
    this[kIndex] = -1
    this[kCurrentWeight] = 0

    this[kMaxWeightPerServer] = this[kOptions].maxWeightPerServer || 100
    this[kErrorPenalty] = this[kOptions].errorPenalty || 15

    if (!Array.isArray(upstreams)) {
      upstreams = [upstreams]
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    this[kInterceptors] = opts.interceptors?.BalancedPool && Array.isArray(opts.interceptors.BalancedPool)
      ? opts.interceptors.BalancedPool
      : []
    this[kFactory] = factory

    for (const upstream of upstreams) {
      this.addUpstream(upstream)
    }
    this._updateBalancedPoolStats()
  }

  addUpstream (upstream) {
    const upstreamOrigin = parseOrigin(upstream).origin

    if (this[kClients].find((pool) => (
      pool[kUrl].origin === upstreamOrigin &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))) {
      return this
    }
    const pool = this[kFactory](upstreamOrigin, Object.assign({}, this[kOptions]))

    this[kAddClient](pool)
    pool.on('connect', () => {
      pool[kWeight] = Math.min(this[kMaxWeightPerServer], pool[kWeight] + this[kErrorPenalty])
    })

    pool.on('connectionError', () => {
      pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty])
      this._updateBalancedPoolStats()
    })

    pool.on('disconnect', (...args) => {
      const err = args[2]
      if (err && err.code === 'UND_ERR_SOCKET') {
        // decrease the weight of the pool.
        pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty])
        this._updateBalancedPoolStats()
      }
    })

    for (const client of this[kClients]) {
      client[kWeight] = this[kMaxWeightPerServer]
    }

    this._updateBalancedPoolStats()

    return this
  }

  _updateBalancedPoolStats () {
    let result = 0
    for (let i = 0; i < this[kClients].length; i++) {
      result = getGreatestCommonDivisor(this[kClients][i][kWeight], result)
    }

    this[kGreatestCommonDivisor] = result
  }

  removeUpstream (upstream) {
    const upstreamOrigin = parseOrigin(upstream).origin

    const pool = this[kClients].find((pool) => (
      pool[kUrl].origin === upstreamOrigin &&
      pool.closed !== true &&
      pool.destroyed !== true
    ))

    if (pool) {
      this[kRemoveClient](pool)
    }

    return this
  }

  get upstreams () {
    return this[kClients]
      .filter(dispatcher => dispatcher.closed !== true && dispatcher.destroyed !== true)
      .map((p) => p[kUrl].origin)
  }

  [kGetDispatcher] () {
    // We validate that pools is greater than 0,
    // otherwise we would have to wait until an upstream
    // is added, which might never happen.
    if (this[kClients].length === 0) {
      throw new BalancedPoolMissingUpstreamError()
    }

    const dispatcher = this[kClients].find(dispatcher => (
      !dispatcher[kNeedDrain] &&
      dispatcher.closed !== true &&
      dispatcher.destroyed !== true
    ))

    if (!dispatcher) {
      return
    }

    const allClientsBusy = this[kClients].map(pool => pool[kNeedDrain]).reduce((a, b) => a && b, true)

    if (allClientsBusy) {
      return
    }

    let counter = 0

    let maxWeightIndex = this[kClients].findIndex(pool => !pool[kNeedDrain])

    while (counter++ < this[kClients].length) {
      this[kIndex] = (this[kIndex] + 1) % this[kClients].length
      const pool = this[kClients][this[kIndex]]

      // find pool index with the largest weight
      if (pool[kWeight] > this[kClients][maxWeightIndex][kWeight] && !pool[kNeedDrain]) {
        maxWeightIndex = this[kIndex]
      }

      // decrease the current weight every `this[kClients].length`.
      if (this[kIndex] === 0) {
        // Set the current weight to the next lower weight.
        this[kCurrentWeight] = this[kCurrentWeight] - this[kGreatestCommonDivisor]

        if (this[kCurrentWeight] <= 0) {
          this[kCurrentWeight] = this[kMaxWeightPerServer]
        }
      }
      if (pool[kWeight] >= this[kCurrentWeight] && (!pool[kNeedDrain])) {
        return pool
      }
    }

    this[kCurrentWeight] = this[kClients][maxWeightIndex][kWeight]
    this[kIndex] = maxWeightIndex
    return this[kClients][maxWeightIndex]
  }
}

module.exports = BalancedPool


/***/ }),

/***/ 9216:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


/* global WebAssembly */

const assert = __nccwpck_require__(8061)
const util = __nccwpck_require__(9099)
const { channels } = __nccwpck_require__(7055)
const timers = __nccwpck_require__(5219)
const {
  RequestContentLengthMismatchError,
  ResponseContentLengthMismatchError,
  RequestAbortedError,
  HeadersTimeoutError,
  HeadersOverflowError,
  SocketError,
  InformationalError,
  BodyTimeoutError,
  HTTPParserError,
  ResponseExceededMaxSizeError
} = __nccwpck_require__(8642)
const {
  kUrl,
  kReset,
  kClient,
  kParser,
  kBlocking,
  kRunning,
  kPending,
  kSize,
  kWriting,
  kQueue,
  kNoRef,
  kKeepAliveDefaultTimeout,
  kHostHeader,
  kPendingIdx,
  kRunningIdx,
  kError,
  kPipelining,
  kSocket,
  kKeepAliveTimeoutValue,
  kMaxHeadersSize,
  kKeepAliveMaxTimeout,
  kKeepAliveTimeoutThreshold,
  kHeadersTimeout,
  kBodyTimeout,
  kStrictContentLength,
  kMaxRequests,
  kCounter,
  kMaxResponseSize,
  kOnError,
  kResume,
  kHTTPContext
} = __nccwpck_require__(46)

const constants = __nccwpck_require__(9632)
const EMPTY_BUF = Buffer.alloc(0)
const FastBuffer = Buffer[Symbol.species]
const addListener = util.addListener
const removeAllListeners = util.removeAllListeners

let extractBody

async function lazyllhttp () {
  const llhttpWasmData = process.env.JEST_WORKER_ID ? __nccwpck_require__(1565) : undefined

  let mod
  try {
    mod = await WebAssembly.compile(__nccwpck_require__(532))
  } catch (e) {
    /* istanbul ignore next */

    // We could check if the error was caused by the simd option not
    // being enabled, but the occurring of this other error
    // * https://github.com/emscripten-core/emscripten/issues/11495
    // got me to remove that check to avoid breaking Node 12.
    mod = await WebAssembly.compile(llhttpWasmData || __nccwpck_require__(1565))
  }

  return await WebAssembly.instantiate(mod, {
    env: {
      /* eslint-disable camelcase */

      wasm_on_url: (p, at, len) => {
        /* istanbul ignore next */
        return 0
      },
      wasm_on_status: (p, at, len) => {
        assert(currentParser.ptr === p)
        const start = at - currentBufferPtr + currentBufferRef.byteOffset
        return currentParser.onStatus(new FastBuffer(currentBufferRef.buffer, start, len)) || 0
      },
      wasm_on_message_begin: (p) => {
        assert(currentParser.ptr === p)
        return currentParser.onMessageBegin() || 0
      },
      wasm_on_header_field: (p, at, len) => {
        assert(currentParser.ptr === p)
        const start = at - currentBufferPtr + currentBufferRef.byteOffset
        return currentParser.onHeaderField(new FastBuffer(currentBufferRef.buffer, start, len)) || 0
      },
      wasm_on_header_value: (p, at, len) => {
        assert(currentParser.ptr === p)
        const start = at - currentBufferPtr + currentBufferRef.byteOffset
        return currentParser.onHeaderValue(new FastBuffer(currentBufferRef.buffer, start, len)) || 0
      },
      wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
        assert(currentParser.ptr === p)
        return currentParser.onHeadersComplete(statusCode, Boolean(upgrade), Boolean(shouldKeepAlive)) || 0
      },
      wasm_on_body: (p, at, len) => {
        assert(currentParser.ptr === p)
        const start = at - currentBufferPtr + currentBufferRef.byteOffset
        return currentParser.onBody(new FastBuffer(currentBufferRef.buffer, start, len)) || 0
      },
      wasm_on_message_complete: (p) => {
        assert(currentParser.ptr === p)
        return currentParser.onMessageComplete() || 0
      }

      /* eslint-enable camelcase */
    }
  })
}

let llhttpInstance = null
let llhttpPromise = lazyllhttp()
llhttpPromise.catch()

let currentParser = null
let currentBufferRef = null
let currentBufferSize = 0
let currentBufferPtr = null

const USE_NATIVE_TIMER = 0
const USE_FAST_TIMER = 1

// Use fast timers for headers and body to take eventual event loop
// latency into account.
const TIMEOUT_HEADERS = 2 | USE_FAST_TIMER
const TIMEOUT_BODY = 4 | USE_FAST_TIMER

// Use native timers to ignore event loop latency for keep-alive
// handling.
const TIMEOUT_KEEP_ALIVE = 8 | USE_NATIVE_TIMER

class Parser {
  constructor (client, socket, { exports }) {
    assert(Number.isFinite(client[kMaxHeadersSize]) && client[kMaxHeadersSize] > 0)

    this.llhttp = exports
    this.ptr = this.llhttp.llhttp_alloc(constants.TYPE.RESPONSE)
    this.client = client
    this.socket = socket
    this.timeout = null
    this.timeoutValue = null
    this.timeoutType = null
    this.statusCode = null
    this.statusText = ''
    this.upgrade = false
    this.headers = []
    this.headersSize = 0
    this.headersMaxSize = client[kMaxHeadersSize]
    this.shouldKeepAlive = false
    this.paused = false
    this.resume = this.resume.bind(this)

    this.bytesRead = 0

    this.keepAlive = ''
    this.contentLength = ''
    this.connection = ''
    this.maxResponseSize = client[kMaxResponseSize]
  }

  setTimeout (delay, type) {
    // If the existing timer and the new timer are of different timer type
    // (fast or native) or have different delay, we need to clear the existing
    // timer and set a new one.
    if (
      delay !== this.timeoutValue ||
      (type & USE_FAST_TIMER) ^ (this.timeoutType & USE_FAST_TIMER)
    ) {
      // If a timeout is already set, clear it with clearTimeout of the fast
      // timer implementation, as it can clear fast and native timers.
      if (this.timeout) {
        timers.clearTimeout(this.timeout)
        this.timeout = null
      }

      if (delay) {
        if (type & USE_FAST_TIMER) {
          this.timeout = timers.setFastTimeout(onParserTimeout, delay, new WeakRef(this))
        } else {
          this.timeout = setTimeout(onParserTimeout, delay, new WeakRef(this))
          this.timeout.unref()
        }
      }

      this.timeoutValue = delay
    } else if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    this.timeoutType = type
  }

  resume () {
    if (this.socket.destroyed || !this.paused) {
      return
    }

    assert(this.ptr != null)
    assert(currentParser == null)

    this.llhttp.llhttp_resume(this.ptr)

    assert(this.timeoutType === TIMEOUT_BODY)
    if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    this.paused = false
    this.execute(this.socket.read() || EMPTY_BUF) // Flush parser.
    this.readMore()
  }

  readMore () {
    while (!this.paused && this.ptr) {
      const chunk = this.socket.read()
      if (chunk === null) {
        break
      }
      this.execute(chunk)
    }
  }

  execute (data) {
    assert(this.ptr != null)
    assert(currentParser == null)
    assert(!this.paused)

    const { socket, llhttp } = this

    if (data.length > currentBufferSize) {
      if (currentBufferPtr) {
        llhttp.free(currentBufferPtr)
      }
      currentBufferSize = Math.ceil(data.length / 4096) * 4096
      currentBufferPtr = llhttp.malloc(currentBufferSize)
    }

    new Uint8Array(llhttp.memory.buffer, currentBufferPtr, currentBufferSize).set(data)

    // Call `execute` on the wasm parser.
    // We pass the `llhttp_parser` pointer address, the pointer address of buffer view data,
    // and finally the length of bytes to parse.
    // The return value is an error code or `constants.ERROR.OK`.
    try {
      let ret

      try {
        currentBufferRef = data
        currentParser = this
        ret = llhttp.llhttp_execute(this.ptr, currentBufferPtr, data.length)
        /* eslint-disable-next-line no-useless-catch */
      } catch (err) {
        /* istanbul ignore next: difficult to make a test case for */
        throw err
      } finally {
        currentParser = null
        currentBufferRef = null
      }

      const offset = llhttp.llhttp_get_error_pos(this.ptr) - currentBufferPtr

      if (ret === constants.ERROR.PAUSED_UPGRADE) {
        this.onUpgrade(data.slice(offset))
      } else if (ret === constants.ERROR.PAUSED) {
        this.paused = true
        socket.unshift(data.slice(offset))
      } else if (ret !== constants.ERROR.OK) {
        const ptr = llhttp.llhttp_get_error_reason(this.ptr)
        let message = ''
        /* istanbul ignore else: difficult to make a test case for */
        if (ptr) {
          const len = new Uint8Array(llhttp.memory.buffer, ptr).indexOf(0)
          message =
            'Response does not match the HTTP/1.1 protocol (' +
            Buffer.from(llhttp.memory.buffer, ptr, len).toString() +
            ')'
        }
        throw new HTTPParserError(message, constants.ERROR[ret], data.slice(offset))
      }
    } catch (err) {
      util.destroy(socket, err)
    }
  }

  destroy () {
    assert(this.ptr != null)
    assert(currentParser == null)

    this.llhttp.llhttp_free(this.ptr)
    this.ptr = null

    this.timeout && timers.clearTimeout(this.timeout)
    this.timeout = null
    this.timeoutValue = null
    this.timeoutType = null

    this.paused = false
  }

  onStatus (buf) {
    this.statusText = buf.toString()
  }

  onMessageBegin () {
    const { socket, client } = this

    /* istanbul ignore next: difficult to make a test case for */
    if (socket.destroyed) {
      return -1
    }

    const request = client[kQueue][client[kRunningIdx]]
    if (!request) {
      return -1
    }
    request.onResponseStarted()
  }

  onHeaderField (buf) {
    const len = this.headers.length

    if ((len & 1) === 0) {
      this.headers.push(buf)
    } else {
      this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf])
    }

    this.trackHeader(buf.length)
  }

  onHeaderValue (buf) {
    let len = this.headers.length

    if ((len & 1) === 1) {
      this.headers.push(buf)
      len += 1
    } else {
      this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf])
    }

    const key = this.headers[len - 2]
    if (key.length === 10) {
      const headerName = util.bufferToLowerCasedHeaderName(key)
      if (headerName === 'keep-alive') {
        this.keepAlive += buf.toString()
      } else if (headerName === 'connection') {
        this.connection += buf.toString()
      }
    } else if (key.length === 14 && util.bufferToLowerCasedHeaderName(key) === 'content-length') {
      this.contentLength += buf.toString()
    }

    this.trackHeader(buf.length)
  }

  trackHeader (len) {
    this.headersSize += len
    if (this.headersSize >= this.headersMaxSize) {
      util.destroy(this.socket, new HeadersOverflowError())
    }
  }

  onUpgrade (head) {
    const { upgrade, client, socket, headers, statusCode } = this

    assert(upgrade)
    assert(client[kSocket] === socket)
    assert(!socket.destroyed)
    assert(!this.paused)
    assert((headers.length & 1) === 0)

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)
    assert(request.upgrade || request.method === 'CONNECT')

    this.statusCode = null
    this.statusText = ''
    this.shouldKeepAlive = null

    this.headers = []
    this.headersSize = 0

    socket.unshift(head)

    socket[kParser].destroy()
    socket[kParser] = null

    socket[kClient] = null
    socket[kError] = null

    removeAllListeners(socket)

    client[kSocket] = null
    client[kHTTPContext] = null // TODO (fix): This is hacky...
    client[kQueue][client[kRunningIdx]++] = null
    client.emit('disconnect', client[kUrl], [client], new InformationalError('upgrade'))

    try {
      request.onUpgrade(statusCode, headers, socket)
    } catch (err) {
      util.destroy(socket, err)
    }

    client[kResume]()
  }

  onHeadersComplete (statusCode, upgrade, shouldKeepAlive) {
    const { client, socket, headers, statusText } = this

    /* istanbul ignore next: difficult to make a test case for */
    if (socket.destroyed) {
      return -1
    }

    const request = client[kQueue][client[kRunningIdx]]

    /* istanbul ignore next: difficult to make a test case for */
    if (!request) {
      return -1
    }

    assert(!this.upgrade)
    assert(this.statusCode < 200)

    if (statusCode === 100) {
      util.destroy(socket, new SocketError('bad response', util.getSocketInfo(socket)))
      return -1
    }

    /* this can only happen if server is misbehaving */
    if (upgrade && !request.upgrade) {
      util.destroy(socket, new SocketError('bad upgrade', util.getSocketInfo(socket)))
      return -1
    }

    assert(this.timeoutType === TIMEOUT_HEADERS)

    this.statusCode = statusCode
    this.shouldKeepAlive = (
      shouldKeepAlive ||
      // Override llhttp value which does not allow keepAlive for HEAD.
      (request.method === 'HEAD' && !socket[kReset] && this.connection.toLowerCase() === 'keep-alive')
    )

    if (this.statusCode >= 200) {
      const bodyTimeout = request.bodyTimeout != null
        ? request.bodyTimeout
        : client[kBodyTimeout]
      this.setTimeout(bodyTimeout, TIMEOUT_BODY)
    } else if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    if (request.method === 'CONNECT') {
      assert(client[kRunning] === 1)
      this.upgrade = true
      return 2
    }

    if (upgrade) {
      assert(client[kRunning] === 1)
      this.upgrade = true
      return 2
    }

    assert((this.headers.length & 1) === 0)
    this.headers = []
    this.headersSize = 0

    if (this.shouldKeepAlive && client[kPipelining]) {
      const keepAliveTimeout = this.keepAlive ? util.parseKeepAliveTimeout(this.keepAlive) : null

      if (keepAliveTimeout != null) {
        const timeout = Math.min(
          keepAliveTimeout - client[kKeepAliveTimeoutThreshold],
          client[kKeepAliveMaxTimeout]
        )
        if (timeout <= 0) {
          socket[kReset] = true
        } else {
          client[kKeepAliveTimeoutValue] = timeout
        }
      } else {
        client[kKeepAliveTimeoutValue] = client[kKeepAliveDefaultTimeout]
      }
    } else {
      // Stop more requests from being dispatched.
      socket[kReset] = true
    }

    const pause = request.onHeaders(statusCode, headers, this.resume, statusText) === false

    if (request.aborted) {
      return -1
    }

    if (request.method === 'HEAD') {
      return 1
    }

    if (statusCode < 200) {
      return 1
    }

    if (socket[kBlocking]) {
      socket[kBlocking] = false
      client[kResume]()
    }

    return pause ? constants.ERROR.PAUSED : 0
  }

  onBody (buf) {
    const { client, socket, statusCode, maxResponseSize } = this

    if (socket.destroyed) {
      return -1
    }

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)

    assert(this.timeoutType === TIMEOUT_BODY)
    if (this.timeout) {
      // istanbul ignore else: only for jest
      if (this.timeout.refresh) {
        this.timeout.refresh()
      }
    }

    assert(statusCode >= 200)

    if (maxResponseSize > -1 && this.bytesRead + buf.length > maxResponseSize) {
      util.destroy(socket, new ResponseExceededMaxSizeError())
      return -1
    }

    this.bytesRead += buf.length

    if (request.onData(buf) === false) {
      return constants.ERROR.PAUSED
    }
  }

  onMessageComplete () {
    const { client, socket, statusCode, upgrade, headers, contentLength, bytesRead, shouldKeepAlive } = this

    if (socket.destroyed && (!statusCode || shouldKeepAlive)) {
      return -1
    }

    if (upgrade) {
      return
    }

    assert(statusCode >= 100)
    assert((this.headers.length & 1) === 0)

    const request = client[kQueue][client[kRunningIdx]]
    assert(request)

    this.statusCode = null
    this.statusText = ''
    this.bytesRead = 0
    this.contentLength = ''
    this.keepAlive = ''
    this.connection = ''

    this.headers = []
    this.headersSize = 0

    if (statusCode < 200) {
      return
    }

    /* istanbul ignore next: should be handled by llhttp? */
    if (request.method !== 'HEAD' && contentLength && bytesRead !== parseInt(contentLength, 10)) {
      util.destroy(socket, new ResponseContentLengthMismatchError())
      return -1
    }

    request.onComplete(headers)

    client[kQueue][client[kRunningIdx]++] = null

    if (socket[kWriting]) {
      assert(client[kRunning] === 0)
      // Response completed before request.
      util.destroy(socket, new InformationalError('reset'))
      return constants.ERROR.PAUSED
    } else if (!shouldKeepAlive) {
      util.destroy(socket, new InformationalError('reset'))
      return constants.ERROR.PAUSED
    } else if (socket[kReset] && client[kRunning] === 0) {
      // Destroy socket once all requests have completed.
      // The request at the tail of the pipeline is the one
      // that requested reset and no further requests should
      // have been queued since then.
      util.destroy(socket, new InformationalError('reset'))
      return constants.ERROR.PAUSED
    } else if (client[kPipelining] == null || client[kPipelining] === 1) {
      // We must wait a full event loop cycle to reuse this socket to make sure
      // that non-spec compliant servers are not closing the connection even if they
      // said they won't.
      setImmediate(() => client[kResume]())
    } else {
      client[kResume]()
    }
  }
}

function onParserTimeout (parser) {
  const { socket, timeoutType, client, paused } = parser.deref()

  /* istanbul ignore else */
  if (timeoutType === TIMEOUT_HEADERS) {
    if (!socket[kWriting] || socket.writableNeedDrain || client[kRunning] > 1) {
      assert(!paused, 'cannot be paused while waiting for headers')
      util.destroy(socket, new HeadersTimeoutError())
    }
  } else if (timeoutType === TIMEOUT_BODY) {
    if (!paused) {
      util.destroy(socket, new BodyTimeoutError())
    }
  } else if (timeoutType === TIMEOUT_KEEP_ALIVE) {
    assert(client[kRunning] === 0 && client[kKeepAliveTimeoutValue])
    util.destroy(socket, new InformationalError('socket idle timeout'))
  }
}

async function connectH1 (client, socket) {
  client[kSocket] = socket

  if (!llhttpInstance) {
    llhttpInstance = await llhttpPromise
    llhttpPromise = null
  }

  socket[kNoRef] = false
  socket[kWriting] = false
  socket[kReset] = false
  socket[kBlocking] = false
  socket[kParser] = new Parser(client, socket, llhttpInstance)

  addListener(socket, 'error', function (err) {
    assert(err.code !== 'ERR_TLS_CERT_ALTNAME_INVALID')

    const parser = this[kParser]

    // On Mac OS, we get an ECONNRESET even if there is a full body to be forwarded
    // to the user.
    if (err.code === 'ECONNRESET' && parser.statusCode && !parser.shouldKeepAlive) {
      // We treat all incoming data so for as a valid response.
      parser.onMessageComplete()
      return
    }

    this[kError] = err

    this[kClient][kOnError](err)
  })
  addListener(socket, 'readable', function () {
    const parser = this[kParser]

    if (parser) {
      parser.readMore()
    }
  })
  addListener(socket, 'end', function () {
    const parser = this[kParser]

    if (parser.statusCode && !parser.shouldKeepAlive) {
      // We treat all incoming data so far as a valid response.
      parser.onMessageComplete()
      return
    }

    util.destroy(this, new SocketError('other side closed', util.getSocketInfo(this)))
  })
  addListener(socket, 'close', function () {
    const client = this[kClient]
    const parser = this[kParser]

    if (parser) {
      if (!this[kError] && parser.statusCode && !parser.shouldKeepAlive) {
        // We treat all incoming data so far as a valid response.
        parser.onMessageComplete()
      }

      this[kParser].destroy()
      this[kParser] = null
    }

    const err = this[kError] || new SocketError('closed', util.getSocketInfo(this))

    client[kSocket] = null
    client[kHTTPContext] = null // TODO (fix): This is hacky...

    if (client.destroyed) {
      assert(client[kPending] === 0)

      // Fail entire queue.
      const requests = client[kQueue].splice(client[kRunningIdx])
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i]
        util.errorRequest(client, request, err)
      }
    } else if (client[kRunning] > 0 && err.code !== 'UND_ERR_INFO') {
      // Fail head of pipeline.
      const request = client[kQueue][client[kRunningIdx]]
      client[kQueue][client[kRunningIdx]++] = null

      util.errorRequest(client, request, err)
    }

    client[kPendingIdx] = client[kRunningIdx]

    assert(client[kRunning] === 0)

    client.emit('disconnect', client[kUrl], [client], err)

    client[kResume]()
  })

  let closed = false
  socket.on('close', () => {
    closed = true
  })

  return {
    version: 'h1',
    defaultPipelining: 1,
    write (...args) {
      return writeH1(client, ...args)
    },
    resume () {
      resumeH1(client)
    },
    destroy (err, callback) {
      if (closed) {
        queueMicrotask(callback)
      } else {
        socket.destroy(err).on('close', callback)
      }
    },
    get destroyed () {
      return socket.destroyed
    },
    busy (request) {
      if (socket[kWriting] || socket[kReset] || socket[kBlocking]) {
        return true
      }

      if (request) {
        if (client[kRunning] > 0 && !request.idempotent) {
          // Non-idempotent request cannot be retried.
          // Ensure that no other requests are inflight and
          // could cause failure.
          return true
        }

        if (client[kRunning] > 0 && (request.upgrade || request.method === 'CONNECT')) {
          // Don't dispatch an upgrade until all preceding requests have completed.
          // A misbehaving server might upgrade the connection before all pipelined
          // request has completed.
          return true
        }

        if (client[kRunning] > 0 && util.bodyLength(request.body) !== 0 &&
          (util.isStream(request.body) || util.isAsyncIterable(request.body) || util.isFormDataLike(request.body))) {
          // Request with stream or iterator body can error while other requests
          // are inflight and indirectly error those as well.
          // Ensure this doesn't happen by waiting for inflight
          // to complete before dispatching.

          // Request with stream or iterator body cannot be retried.
          // Ensure that no other requests are inflight and
          // could cause failure.
          return true
        }
      }

      return false
    }
  }
}

function resumeH1 (client) {
  const socket = client[kSocket]

  if (socket && !socket.destroyed) {
    if (client[kSize] === 0) {
      if (!socket[kNoRef] && socket.unref) {
        socket.unref()
        socket[kNoRef] = true
      }
    } else if (socket[kNoRef] && socket.ref) {
      socket.ref()
      socket[kNoRef] = false
    }

    if (client[kSize] === 0) {
      if (socket[kParser].timeoutType !== TIMEOUT_KEEP_ALIVE) {
        socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_KEEP_ALIVE)
      }
    } else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
      if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
        const request = client[kQueue][client[kRunningIdx]]
        const headersTimeout = request.headersTimeout != null
          ? request.headersTimeout
          : client[kHeadersTimeout]
        socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS)
      }
    }
  }
}

// https://www.rfc-editor.org/rfc/rfc7230#section-3.3.2
function shouldSendContentLength (method) {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'TRACE' && method !== 'CONNECT'
}

function writeH1 (client, request) {
  const { method, path, host, upgrade, blocking, reset } = request

  let { body, headers, contentLength } = request

  // https://tools.ietf.org/html/rfc7231#section-4.3.1
  // https://tools.ietf.org/html/rfc7231#section-4.3.2
  // https://tools.ietf.org/html/rfc7231#section-4.3.5

  // Sending a payload body on a request that does not
  // expect it can cause undefined behavior on some
  // servers and corrupt connection state. Do not
  // re-use the connection for further requests.

  const expectsPayload = (
    method === 'PUT' ||
    method === 'POST' ||
    method === 'PATCH' ||
    method === 'QUERY' ||
    method === 'PROPFIND' ||
    method === 'PROPPATCH'
  )

  if (util.isFormDataLike(body)) {
    if (!extractBody) {
      extractBody = (__nccwpck_require__(2585).extractBody)
    }

    const [bodyStream, contentType] = extractBody(body)
    if (request.contentType == null) {
      headers.push('content-type', contentType)
    }
    body = bodyStream.stream
    contentLength = bodyStream.length
  } else if (util.isBlobLike(body) && request.contentType == null && body.type) {
    headers.push('content-type', body.type)
  }

  if (body && typeof body.read === 'function') {
    // Try to read EOF in order to get length.
    body.read(0)
  }

  const bodyLength = util.bodyLength(body)

  contentLength = bodyLength ?? contentLength

  if (contentLength === null) {
    contentLength = request.contentLength
  }

  if (contentLength === 0 && !expectsPayload) {
    // https://tools.ietf.org/html/rfc7230#section-3.3.2
    // A user agent SHOULD NOT send a Content-Length header field when
    // the request message does not contain a payload body and the method
    // semantics do not anticipate such a body.

    contentLength = null
  }

  // https://github.com/nodejs/undici/issues/2046
  // A user agent may send a Content-Length header with 0 value, this should be allowed.
  if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength !== null && request.contentLength !== contentLength) {
    if (client[kStrictContentLength]) {
      util.errorRequest(client, request, new RequestContentLengthMismatchError())
      return false
    }

    process.emitWarning(new RequestContentLengthMismatchError())
  }

  const socket = client[kSocket]

  const abort = (err) => {
    if (request.aborted || request.completed) {
      return
    }

    util.errorRequest(client, request, err || new RequestAbortedError())

    util.destroy(body)
    util.destroy(socket, new InformationalError('aborted'))
  }

  try {
    request.onConnect(abort)
  } catch (err) {
    util.errorRequest(client, request, err)
  }

  if (request.aborted) {
    return false
  }

  if (method === 'HEAD') {
    // https://github.com/mcollina/undici/issues/258
    // Close after a HEAD request to interop with misbehaving servers
    // that may send a body in the response.

    socket[kReset] = true
  }

  if (upgrade || method === 'CONNECT') {
    // On CONNECT or upgrade, block pipeline from dispatching further
    // requests on this connection.

    socket[kReset] = true
  }

  if (reset != null) {
    socket[kReset] = reset
  }

  if (client[kMaxRequests] && socket[kCounter]++ >= client[kMaxRequests]) {
    socket[kReset] = true
  }

  if (blocking) {
    socket[kBlocking] = true
  }

  let header = `${method} ${path} HTTP/1.1\r\n`

  if (typeof host === 'string') {
    header += `host: ${host}\r\n`
  } else {
    header += client[kHostHeader]
  }

  if (upgrade) {
    header += `connection: upgrade\r\nupgrade: ${upgrade}\r\n`
  } else if (client[kPipelining] && !socket[kReset]) {
    header += 'connection: keep-alive\r\n'
  } else {
    header += 'connection: close\r\n'
  }

  if (Array.isArray(headers)) {
    for (let n = 0; n < headers.length; n += 2) {
      const key = headers[n + 0]
      const val = headers[n + 1]

      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          header += `${key}: ${val[i]}\r\n`
        }
      } else {
        header += `${key}: ${val}\r\n`
      }
    }
  }

  if (channels.sendHeaders.hasSubscribers) {
    channels.sendHeaders.publish({ request, headers: header, socket })
  }

  /* istanbul ignore else: assertion */
  if (!body || bodyLength === 0) {
    writeBuffer(abort, null, client, request, socket, contentLength, header, expectsPayload)
  } else if (util.isBuffer(body)) {
    writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload)
  } else if (util.isBlobLike(body)) {
    if (typeof body.stream === 'function') {
      writeIterable(abort, body.stream(), client, request, socket, contentLength, header, expectsPayload)
    } else {
      writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload)
    }
  } else if (util.isStream(body)) {
    writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload)
  } else if (util.isIterable(body)) {
    writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload)
  } else {
    assert(false)
  }

  return true
}

function writeStream (abort, body, client, request, socket, contentLength, header, expectsPayload) {
  assert(contentLength !== 0 || client[kRunning] === 0, 'stream body cannot be pipelined')

  let finished = false

  const writer = new AsyncWriter({ abort, socket, request, contentLength, client, expectsPayload, header })

  const onData = function (chunk) {
    if (finished) {
      return
    }

    try {
      if (!writer.write(chunk) && this.pause) {
        this.pause()
      }
    } catch (err) {
      util.destroy(this, err)
    }
  }
  const onDrain = function () {
    if (finished) {
      return
    }

    if (body.resume) {
      body.resume()
    }
  }
  const onClose = function () {
    // 'close' might be emitted *before* 'error' for
    // broken streams. Wait a tick to avoid this case.
    queueMicrotask(() => {
      // It's only safe to remove 'error' listener after
      // 'close'.
      body.removeListener('error', onFinished)
    })

    if (!finished) {
      const err = new RequestAbortedError()
      queueMicrotask(() => onFinished(err))
    }
  }
  const onFinished = function (err) {
    if (finished) {
      return
    }

    finished = true

    assert(socket.destroyed || (socket[kWriting] && client[kRunning] <= 1))

    socket
      .off('drain', onDrain)
      .off('error', onFinished)

    body
      .removeListener('data', onData)
      .removeListener('end', onFinished)
      .removeListener('close', onClose)

    if (!err) {
      try {
        writer.end()
      } catch (er) {
        err = er
      }
    }

    writer.destroy(err)

    if (err && (err.code !== 'UND_ERR_INFO' || err.message !== 'reset')) {
      util.destroy(body, err)
    } else {
      util.destroy(body)
    }
  }

  body
    .on('data', onData)
    .on('end', onFinished)
    .on('error', onFinished)
    .on('close', onClose)

  if (body.resume) {
    body.resume()
  }

  socket
    .on('drain', onDrain)
    .on('error', onFinished)

  if (body.errorEmitted ?? body.errored) {
    setImmediate(() => onFinished(body.errored))
  } else if (body.endEmitted ?? body.readableEnded) {
    setImmediate(() => onFinished(null))
  }

  if (body.closeEmitted ?? body.closed) {
    setImmediate(onClose)
  }
}

function writeBuffer (abort, body, client, request, socket, contentLength, header, expectsPayload) {
  try {
    if (!body) {
      if (contentLength === 0) {
        socket.write(`${header}content-length: 0\r\n\r\n`, 'latin1')
      } else {
        assert(contentLength === null, 'no body must not have content length')
        socket.write(`${header}\r\n`, 'latin1')
      }
    } else if (util.isBuffer(body)) {
      assert(contentLength === body.byteLength, 'buffer body must have content length')

      socket.cork()
      socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, 'latin1')
      socket.write(body)
      socket.uncork()
      request.onBodySent(body)

      if (!expectsPayload && request.reset !== false) {
        socket[kReset] = true
      }
    }
    request.onRequestSent()

    client[kResume]()
  } catch (err) {
    abort(err)
  }
}

async function writeBlob (abort, body, client, request, socket, contentLength, header, expectsPayload) {
  assert(contentLength === body.size, 'blob body must have content length')

  try {
    if (contentLength != null && contentLength !== body.size) {
      throw new RequestContentLengthMismatchError()
    }

    const buffer = Buffer.from(await body.arrayBuffer())

    socket.cork()
    socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, 'latin1')
    socket.write(buffer)
    socket.uncork()

    request.onBodySent(buffer)
    request.onRequestSent()

    if (!expectsPayload && request.reset !== false) {
      socket[kReset] = true
    }

    client[kResume]()
  } catch (err) {
    abort(err)
  }
}

async function writeIterable (abort, body, client, request, socket, contentLength, header, expectsPayload) {
  assert(contentLength !== 0 || client[kRunning] === 0, 'iterator body cannot be pipelined')

  let callback = null
  function onDrain () {
    if (callback) {
      const cb = callback
      callback = null
      cb()
    }
  }

  const waitForDrain = () => new Promise((resolve, reject) => {
    assert(callback === null)

    if (socket[kError]) {
      reject(socket[kError])
    } else {
      callback = resolve
    }
  })

  socket
    .on('close', onDrain)
    .on('drain', onDrain)

  const writer = new AsyncWriter({ abort, socket, request, contentLength, client, expectsPayload, header })
  try {
    // It's up to the user to somehow abort the async iterable.
    for await (const chunk of body) {
      if (socket[kError]) {
        throw socket[kError]
      }

      if (!writer.write(chunk)) {
        await waitForDrain()
      }
    }

    writer.end()
  } catch (err) {
    writer.destroy(err)
  } finally {
    socket
      .off('close', onDrain)
      .off('drain', onDrain)
  }
}

class AsyncWriter {
  constructor ({ abort, socket, request, contentLength, client, expectsPayload, header }) {
    this.socket = socket
    this.request = request
    this.contentLength = contentLength
    this.client = client
    this.bytesWritten = 0
    this.expectsPayload = expectsPayload
    this.header = header
    this.abort = abort

    socket[kWriting] = true
  }

  write (chunk) {
    const { socket, request, contentLength, client, bytesWritten, expectsPayload, header } = this

    if (socket[kError]) {
      throw socket[kError]
    }

    if (socket.destroyed) {
      return false
    }

    const len = Buffer.byteLength(chunk)
    if (!len) {
      return true
    }

    // We should defer writing chunks.
    if (contentLength !== null && bytesWritten + len > contentLength) {
      if (client[kStrictContentLength]) {
        throw new RequestContentLengthMismatchError()
      }

      process.emitWarning(new RequestContentLengthMismatchError())
    }

    socket.cork()

    if (bytesWritten === 0) {
      if (!expectsPayload && request.reset !== false) {
        socket[kReset] = true
      }

      if (contentLength === null) {
        socket.write(`${header}transfer-encoding: chunked\r\n`, 'latin1')
      } else {
        socket.write(`${header}content-length: ${contentLength}\r\n\r\n`, 'latin1')
      }
    }

    if (contentLength === null) {
      socket.write(`\r\n${len.toString(16)}\r\n`, 'latin1')
    }

    this.bytesWritten += len

    const ret = socket.write(chunk)

    socket.uncork()

    request.onBodySent(chunk)

    if (!ret) {
      if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
        // istanbul ignore else: only for jest
        if (socket[kParser].timeout.refresh) {
          socket[kParser].timeout.refresh()
        }
      }
    }

    return ret
  }

  end () {
    const { socket, contentLength, client, bytesWritten, expectsPayload, header, request } = this
    request.onRequestSent()

    socket[kWriting] = false

    if (socket[kError]) {
      throw socket[kError]
    }

    if (socket.destroyed) {
      return
    }

    if (bytesWritten === 0) {
      if (expectsPayload) {
        // https://tools.ietf.org/html/rfc7230#section-3.3.2
        // A user agent SHOULD send a Content-Length in a request message when
        // no Transfer-Encoding is sent and the request method defines a meaning
        // for an enclosed payload body.

        socket.write(`${header}content-length: 0\r\n\r\n`, 'latin1')
      } else {
        socket.write(`${header}\r\n`, 'latin1')
      }
    } else if (contentLength === null) {
      socket.write('\r\n0\r\n\r\n', 'latin1')
    }

    if (contentLength !== null && bytesWritten !== contentLength) {
      if (client[kStrictContentLength]) {
        throw new RequestContentLengthMismatchError()
      } else {
        process.emitWarning(new RequestContentLengthMismatchError())
      }
    }

    if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
      // istanbul ignore else: only for jest
      if (socket[kParser].timeout.refresh) {
        socket[kParser].timeout.refresh()
      }
    }

    client[kResume]()
  }

  destroy (err) {
    const { socket, client, abort } = this

    socket[kWriting] = false

    if (err) {
      assert(client[kRunning] <= 1, 'pipeline should only contain this request')
      abort(err)
    }
  }
}

module.exports = connectH1


/***/ }),

/***/ 8184:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)
const { pipeline } = __nccwpck_require__(4492)
const util = __nccwpck_require__(9099)
const {
  RequestContentLengthMismatchError,
  RequestAbortedError,
  SocketError,
  InformationalError
} = __nccwpck_require__(8642)
const {
  kUrl,
  kReset,
  kClient,
  kRunning,
  kPending,
  kQueue,
  kPendingIdx,
  kRunningIdx,
  kError,
  kSocket,
  kStrictContentLength,
  kOnError,
  kMaxConcurrentStreams,
  kHTTP2Session,
  kResume,
  kSize,
  kHTTPContext
} = __nccwpck_require__(46)

const kOpenStreams = Symbol('open streams')

let extractBody

// Experimental
let h2ExperimentalWarned = false

/** @type {import('http2')} */
let http2
try {
  http2 = __nccwpck_require__(2725)
} catch {
  // @ts-ignore
  http2 = { constants: {} }
}

const {
  constants: {
    HTTP2_HEADER_AUTHORITY,
    HTTP2_HEADER_METHOD,
    HTTP2_HEADER_PATH,
    HTTP2_HEADER_SCHEME,
    HTTP2_HEADER_CONTENT_LENGTH,
    HTTP2_HEADER_EXPECT,
    HTTP2_HEADER_STATUS
  }
} = http2

function parseH2Headers (headers) {
  const result = []

  for (const [name, value] of Object.entries(headers)) {
    // h2 may concat the header value by array
    // e.g. Set-Cookie
    if (Array.isArray(value)) {
      for (const subvalue of value) {
        // we need to provide each header value of header name
        // because the headers handler expect name-value pair
        result.push(Buffer.from(name), Buffer.from(subvalue))
      }
    } else {
      result.push(Buffer.from(name), Buffer.from(value))
    }
  }

  return result
}

async function connectH2 (client, socket) {
  client[kSocket] = socket

  if (!h2ExperimentalWarned) {
    h2ExperimentalWarned = true
    process.emitWarning('H2 support is experimental, expect them to change at any time.', {
      code: 'UNDICI-H2'
    })
  }

  const session = http2.connect(client[kUrl], {
    createConnection: () => socket,
    peerMaxConcurrentStreams: client[kMaxConcurrentStreams]
  })

  session[kOpenStreams] = 0
  session[kClient] = client
  session[kSocket] = socket

  util.addListener(session, 'error', onHttp2SessionError)
  util.addListener(session, 'frameError', onHttp2FrameError)
  util.addListener(session, 'end', onHttp2SessionEnd)
  util.addListener(session, 'goaway', onHTTP2GoAway)
  util.addListener(session, 'close', function () {
    const { [kClient]: client } = this
    const { [kSocket]: socket } = client

    const err = this[kSocket][kError] || this[kError] || new SocketError('closed', util.getSocketInfo(socket))

    client[kHTTP2Session] = null

    if (client.destroyed) {
      assert(client[kPending] === 0)

      // Fail entire queue.
      const requests = client[kQueue].splice(client[kRunningIdx])
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i]
        util.errorRequest(client, request, err)
      }
    }
  })

  session.unref()

  client[kHTTP2Session] = session
  socket[kHTTP2Session] = session

  util.addListener(socket, 'error', function (err) {
    assert(err.code !== 'ERR_TLS_CERT_ALTNAME_INVALID')

    this[kError] = err

    this[kClient][kOnError](err)
  })

  util.addListener(socket, 'end', function () {
    util.destroy(this, new SocketError('other side closed', util.getSocketInfo(this)))
  })

  util.addListener(socket, 'close', function () {
    const err = this[kError] || new SocketError('closed', util.getSocketInfo(this))

    client[kSocket] = null

    if (this[kHTTP2Session] != null) {
      this[kHTTP2Session].destroy(err)
    }

    client[kPendingIdx] = client[kRunningIdx]

    assert(client[kRunning] === 0)

    client.emit('disconnect', client[kUrl], [client], err)

    client[kResume]()
  })

  let closed = false
  socket.on('close', () => {
    closed = true
  })

  return {
    version: 'h2',
    defaultPipelining: Infinity,
    write (...args) {
      return writeH2(client, ...args)
    },
    resume () {
      resumeH2(client)
    },
    destroy (err, callback) {
      if (closed) {
        queueMicrotask(callback)
      } else {
        // Destroying the socket will trigger the session close
        socket.destroy(err).on('close', callback)
      }
    },
    get destroyed () {
      return socket.destroyed
    },
    busy () {
      return false
    }
  }
}

function resumeH2 (client) {
  const socket = client[kSocket]

  if (socket?.destroyed === false) {
    if (client[kSize] === 0 && client[kMaxConcurrentStreams] === 0) {
      socket.unref()
      client[kHTTP2Session].unref()
    } else {
      socket.ref()
      client[kHTTP2Session].ref()
    }
  }
}

function onHttp2SessionError (err) {
  assert(err.code !== 'ERR_TLS_CERT_ALTNAME_INVALID')

  this[kSocket][kError] = err
  this[kClient][kOnError](err)
}

function onHttp2FrameError (type, code, id) {
  if (id === 0) {
    const err = new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`)
    this[kSocket][kError] = err
    this[kClient][kOnError](err)
  }
}

function onHttp2SessionEnd () {
  const err = new SocketError('other side closed', util.getSocketInfo(this[kSocket]))
  this.destroy(err)
  util.destroy(this[kSocket], err)
}

/**
 * This is the root cause of #3011
 * We need to handle GOAWAY frames properly, and trigger the session close
 * along with the socket right away
 */
function onHTTP2GoAway (code) {
  // We cannot recover, so best to close the session and the socket
  const err = this[kError] || new SocketError(`HTTP/2: "GOAWAY" frame received with code ${code}`, util.getSocketInfo(this))
  const client = this[kClient]

  client[kSocket] = null
  client[kHTTPContext] = null

  if (this[kHTTP2Session] != null) {
    this[kHTTP2Session].destroy(err)
    this[kHTTP2Session] = null
  }

  util.destroy(this[kSocket], err)

  // Fail head of pipeline.
  if (client[kRunningIdx] < client[kQueue].length) {
    const request = client[kQueue][client[kRunningIdx]]
    client[kQueue][client[kRunningIdx]++] = null
    util.errorRequest(client, request, err)
    client[kPendingIdx] = client[kRunningIdx]
  }

  assert(client[kRunning] === 0)

  client.emit('disconnect', client[kUrl], [client], err)

  client[kResume]()
}

// https://www.rfc-editor.org/rfc/rfc7230#section-3.3.2
function shouldSendContentLength (method) {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && method !== 'TRACE' && method !== 'CONNECT'
}

function writeH2 (client, request) {
  const session = client[kHTTP2Session]
  const { method, path, host, upgrade, expectContinue, signal, headers: reqHeaders } = request
  let { body } = request

  if (upgrade) {
    util.errorRequest(client, request, new Error('Upgrade not supported for H2'))
    return false
  }

  const headers = {}
  for (let n = 0; n < reqHeaders.length; n += 2) {
    const key = reqHeaders[n + 0]
    const val = reqHeaders[n + 1]

    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        if (headers[key]) {
          headers[key] += `,${val[i]}`
        } else {
          headers[key] = val[i]
        }
      }
    } else {
      headers[key] = val
    }
  }

  /** @type {import('node:http2').ClientHttp2Stream} */
  let stream

  const { hostname, port } = client[kUrl]

  headers[HTTP2_HEADER_AUTHORITY] = host || `${hostname}${port ? `:${port}` : ''}`
  headers[HTTP2_HEADER_METHOD] = method

  const abort = (err) => {
    if (request.aborted || request.completed) {
      return
    }

    err = err || new RequestAbortedError()

    util.errorRequest(client, request, err)

    if (stream != null) {
      util.destroy(stream, err)
    }

    // We do not destroy the socket as we can continue using the session
    // the stream get's destroyed and the session remains to create new streams
    util.destroy(body, err)
    client[kQueue][client[kRunningIdx]++] = null
    client[kResume]()
  }

  try {
    // We are already connected, streams are pending.
    // We can call on connect, and wait for abort
    request.onConnect(abort)
  } catch (err) {
    util.errorRequest(client, request, err)
  }

  if (request.aborted) {
    return false
  }

  if (method === 'CONNECT') {
    session.ref()
    // We are already connected, streams are pending, first request
    // will create a new stream. We trigger a request to create the stream and wait until
    // `ready` event is triggered
    // We disabled endStream to allow the user to write to the stream
    stream = session.request(headers, { endStream: false, signal })

    if (stream.id && !stream.pending) {
      request.onUpgrade(null, null, stream)
      ++session[kOpenStreams]
      client[kQueue][client[kRunningIdx]++] = null
    } else {
      stream.once('ready', () => {
        request.onUpgrade(null, null, stream)
        ++session[kOpenStreams]
        client[kQueue][client[kRunningIdx]++] = null
      })
    }

    stream.once('close', () => {
      session[kOpenStreams] -= 1
      if (session[kOpenStreams] === 0) session.unref()
    })

    return true
  }

  // https://tools.ietf.org/html/rfc7540#section-8.3
  // :path and :scheme headers must be omitted when sending CONNECT

  headers[HTTP2_HEADER_PATH] = path
  headers[HTTP2_HEADER_SCHEME] = 'https'

  // https://tools.ietf.org/html/rfc7231#section-4.3.1
  // https://tools.ietf.org/html/rfc7231#section-4.3.2
  // https://tools.ietf.org/html/rfc7231#section-4.3.5

  // Sending a payload body on a request that does not
  // expect it can cause undefined behavior on some
  // servers and corrupt connection state. Do not
  // re-use the connection for further requests.

  const expectsPayload = (
    method === 'PUT' ||
    method === 'POST' ||
    method === 'PATCH'
  )

  if (body && typeof body.read === 'function') {
    // Try to read EOF in order to get length.
    body.read(0)
  }

  let contentLength = util.bodyLength(body)

  if (util.isFormDataLike(body)) {
    extractBody ??= (__nccwpck_require__(2585).extractBody)

    const [bodyStream, contentType] = extractBody(body)
    headers['content-type'] = contentType

    body = bodyStream.stream
    contentLength = bodyStream.length
  }

  if (contentLength == null) {
    contentLength = request.contentLength
  }

  if (contentLength === 0 || !expectsPayload) {
    // https://tools.ietf.org/html/rfc7230#section-3.3.2
    // A user agent SHOULD NOT send a Content-Length header field when
    // the request message does not contain a payload body and the method
    // semantics do not anticipate such a body.

    contentLength = null
  }

  // https://github.com/nodejs/undici/issues/2046
  // A user agent may send a Content-Length header with 0 value, this should be allowed.
  if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength != null && request.contentLength !== contentLength) {
    if (client[kStrictContentLength]) {
      util.errorRequest(client, request, new RequestContentLengthMismatchError())
      return false
    }

    process.emitWarning(new RequestContentLengthMismatchError())
  }

  if (contentLength != null) {
    assert(body, 'no body must not have content length')
    headers[HTTP2_HEADER_CONTENT_LENGTH] = `${contentLength}`
  }

  session.ref()

  const shouldEndStream = method === 'GET' || method === 'HEAD' || body === null
  if (expectContinue) {
    headers[HTTP2_HEADER_EXPECT] = '100-continue'
    stream = session.request(headers, { endStream: shouldEndStream, signal })

    stream.once('continue', writeBodyH2)
  } else {
    stream = session.request(headers, {
      endStream: shouldEndStream,
      signal
    })
    writeBodyH2()
  }

  // Increment counter as we have new streams open
  ++session[kOpenStreams]

  stream.once('response', headers => {
    const { [HTTP2_HEADER_STATUS]: statusCode, ...realHeaders } = headers
    request.onResponseStarted()

    // Due to the stream nature, it is possible we face a race condition
    // where the stream has been assigned, but the request has been aborted
    // the request remains in-flight and headers hasn't been received yet
    // for those scenarios, best effort is to destroy the stream immediately
    // as there's no value to keep it open.
    if (request.aborted) {
      const err = new RequestAbortedError()
      util.errorRequest(client, request, err)
      util.destroy(stream, err)
      return
    }

    if (request.onHeaders(Number(statusCode), parseH2Headers(realHeaders), stream.resume.bind(stream), '') === false) {
      stream.pause()
    }

    stream.on('data', (chunk) => {
      if (request.onData(chunk) === false) {
        stream.pause()
      }
    })
  })

  stream.once('end', () => {
    // When state is null, it means we haven't consumed body and the stream still do not have
    // a state.
    // Present specially when using pipeline or stream
    if (stream.state?.state == null || stream.state.state < 6) {
      request.onComplete([])
    }

    if (session[kOpenStreams] === 0) {
      // Stream is closed or half-closed-remote (6), decrement counter and cleanup
      // It does not have sense to continue working with the stream as we do not
      // have yet RST_STREAM support on client-side

      session.unref()
    }

    abort(new InformationalError('HTTP/2: stream half-closed (remote)'))
    client[kQueue][client[kRunningIdx]++] = null
    client[kPendingIdx] = client[kRunningIdx]
    client[kResume]()
  })

  stream.once('close', () => {
    session[kOpenStreams] -= 1
    if (session[kOpenStreams] === 0) {
      session.unref()
    }
  })

  stream.once('error', function (err) {
    abort(err)
  })

  stream.once('frameError', (type, code) => {
    abort(new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`))
  })

  // stream.on('aborted', () => {
  //   // TODO(HTTP/2): Support aborted
  // })

  // stream.on('timeout', () => {
  //   // TODO(HTTP/2): Support timeout
  // })

  // stream.on('push', headers => {
  //   // TODO(HTTP/2): Support push
  // })

  // stream.on('trailers', headers => {
  //   // TODO(HTTP/2): Support trailers
  // })

  return true

  function writeBodyH2 () {
    /* istanbul ignore else: assertion */
    if (!body || contentLength === 0) {
      writeBuffer(
        abort,
        stream,
        null,
        client,
        request,
        client[kSocket],
        contentLength,
        expectsPayload
      )
    } else if (util.isBuffer(body)) {
      writeBuffer(
        abort,
        stream,
        body,
        client,
        request,
        client[kSocket],
        contentLength,
        expectsPayload
      )
    } else if (util.isBlobLike(body)) {
      if (typeof body.stream === 'function') {
        writeIterable(
          abort,
          stream,
          body.stream(),
          client,
          request,
          client[kSocket],
          contentLength,
          expectsPayload
        )
      } else {
        writeBlob(
          abort,
          stream,
          body,
          client,
          request,
          client[kSocket],
          contentLength,
          expectsPayload
        )
      }
    } else if (util.isStream(body)) {
      writeStream(
        abort,
        client[kSocket],
        expectsPayload,
        stream,
        body,
        client,
        request,
        contentLength
      )
    } else if (util.isIterable(body)) {
      writeIterable(
        abort,
        stream,
        body,
        client,
        request,
        client[kSocket],
        contentLength,
        expectsPayload
      )
    } else {
      assert(false)
    }
  }
}

function writeBuffer (abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
  try {
    if (body != null && util.isBuffer(body)) {
      assert(contentLength === body.byteLength, 'buffer body must have content length')
      h2stream.cork()
      h2stream.write(body)
      h2stream.uncork()
      h2stream.end()

      request.onBodySent(body)
    }

    if (!expectsPayload) {
      socket[kReset] = true
    }

    request.onRequestSent()
    client[kResume]()
  } catch (error) {
    abort(error)
  }
}

function writeStream (abort, socket, expectsPayload, h2stream, body, client, request, contentLength) {
  assert(contentLength !== 0 || client[kRunning] === 0, 'stream body cannot be pipelined')

  // For HTTP/2, is enough to pipe the stream
  const pipe = pipeline(
    body,
    h2stream,
    (err) => {
      if (err) {
        util.destroy(pipe, err)
        abort(err)
      } else {
        util.removeAllListeners(pipe)
        request.onRequestSent()

        if (!expectsPayload) {
          socket[kReset] = true
        }

        client[kResume]()
      }
    }
  )

  util.addListener(pipe, 'data', onPipeData)

  function onPipeData (chunk) {
    request.onBodySent(chunk)
  }
}

async function writeBlob (abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
  assert(contentLength === body.size, 'blob body must have content length')

  try {
    if (contentLength != null && contentLength !== body.size) {
      throw new RequestContentLengthMismatchError()
    }

    const buffer = Buffer.from(await body.arrayBuffer())

    h2stream.cork()
    h2stream.write(buffer)
    h2stream.uncork()
    h2stream.end()

    request.onBodySent(buffer)
    request.onRequestSent()

    if (!expectsPayload) {
      socket[kReset] = true
    }

    client[kResume]()
  } catch (err) {
    abort(err)
  }
}

async function writeIterable (abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
  assert(contentLength !== 0 || client[kRunning] === 0, 'iterator body cannot be pipelined')

  let callback = null
  function onDrain () {
    if (callback) {
      const cb = callback
      callback = null
      cb()
    }
  }

  const waitForDrain = () => new Promise((resolve, reject) => {
    assert(callback === null)

    if (socket[kError]) {
      reject(socket[kError])
    } else {
      callback = resolve
    }
  })

  h2stream
    .on('close', onDrain)
    .on('drain', onDrain)

  try {
    // It's up to the user to somehow abort the async iterable.
    for await (const chunk of body) {
      if (socket[kError]) {
        throw socket[kError]
      }

      const res = h2stream.write(chunk)
      request.onBodySent(chunk)
      if (!res) {
        await waitForDrain()
      }
    }

    h2stream.end()

    request.onRequestSent()

    if (!expectsPayload) {
      socket[kReset] = true
    }

    client[kResume]()
  } catch (err) {
    abort(err)
  } finally {
    h2stream
      .off('close', onDrain)
      .off('drain', onDrain)
  }
}

module.exports = connectH2


/***/ }),

/***/ 4885:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// @ts-check



const assert = __nccwpck_require__(8061)
const net = __nccwpck_require__(7503)
const http = __nccwpck_require__(8849)
const util = __nccwpck_require__(9099)
const { channels } = __nccwpck_require__(7055)
const Request = __nccwpck_require__(21)
const DispatcherBase = __nccwpck_require__(6414)
const {
  InvalidArgumentError,
  InformationalError,
  ClientDestroyedError
} = __nccwpck_require__(8642)
const buildConnector = __nccwpck_require__(334)
const {
  kUrl,
  kServerName,
  kClient,
  kBusy,
  kConnect,
  kResuming,
  kRunning,
  kPending,
  kSize,
  kQueue,
  kConnected,
  kConnecting,
  kNeedDrain,
  kKeepAliveDefaultTimeout,
  kHostHeader,
  kPendingIdx,
  kRunningIdx,
  kError,
  kPipelining,
  kKeepAliveTimeoutValue,
  kMaxHeadersSize,
  kKeepAliveMaxTimeout,
  kKeepAliveTimeoutThreshold,
  kHeadersTimeout,
  kBodyTimeout,
  kStrictContentLength,
  kConnector,
  kMaxRedirections,
  kMaxRequests,
  kCounter,
  kClose,
  kDestroy,
  kDispatch,
  kInterceptors,
  kLocalAddress,
  kMaxResponseSize,
  kOnError,
  kHTTPContext,
  kMaxConcurrentStreams,
  kResume
} = __nccwpck_require__(46)
const connectH1 = __nccwpck_require__(9216)
const connectH2 = __nccwpck_require__(8184)
let deprecatedInterceptorWarned = false

const kClosedResolve = Symbol('kClosedResolve')

const noop = () => {}

function getPipelining (client) {
  return client[kPipelining] ?? client[kHTTPContext]?.defaultPipelining ?? 1
}

/**
 * @type {import('../../types/client.js').default}
 */
class Client extends DispatcherBase {
  /**
   *
   * @param {string|URL} url
   * @param {import('../../types/client.js').Client.Options} options
   */
  constructor (url, {
    interceptors,
    maxHeaderSize,
    headersTimeout,
    socketTimeout,
    requestTimeout,
    connectTimeout,
    bodyTimeout,
    idleTimeout,
    keepAlive,
    keepAliveTimeout,
    maxKeepAliveTimeout,
    keepAliveMaxTimeout,
    keepAliveTimeoutThreshold,
    socketPath,
    pipelining,
    tls,
    strictContentLength,
    maxCachedSessions,
    maxRedirections,
    connect,
    maxRequestsPerClient,
    localAddress,
    maxResponseSize,
    autoSelectFamily,
    autoSelectFamilyAttemptTimeout,
    // h2
    maxConcurrentStreams,
    allowH2
  } = {}) {
    super()

    if (keepAlive !== undefined) {
      throw new InvalidArgumentError('unsupported keepAlive, use pipelining=0 instead')
    }

    if (socketTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported socketTimeout, use headersTimeout & bodyTimeout instead')
    }

    if (requestTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported requestTimeout, use headersTimeout & bodyTimeout instead')
    }

    if (idleTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported idleTimeout, use keepAliveTimeout instead')
    }

    if (maxKeepAliveTimeout !== undefined) {
      throw new InvalidArgumentError('unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead')
    }

    if (maxHeaderSize != null && !Number.isFinite(maxHeaderSize)) {
      throw new InvalidArgumentError('invalid maxHeaderSize')
    }

    if (socketPath != null && typeof socketPath !== 'string') {
      throw new InvalidArgumentError('invalid socketPath')
    }

    if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) {
      throw new InvalidArgumentError('invalid connectTimeout')
    }

    if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) {
      throw new InvalidArgumentError('invalid keepAliveTimeout')
    }

    if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) {
      throw new InvalidArgumentError('invalid keepAliveMaxTimeout')
    }

    if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
      throw new InvalidArgumentError('invalid keepAliveTimeoutThreshold')
    }

    if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
      throw new InvalidArgumentError('headersTimeout must be a positive integer or zero')
    }

    if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
      throw new InvalidArgumentError('bodyTimeout must be a positive integer or zero')
    }

    if (connect != null && typeof connect !== 'function' && typeof connect !== 'object') {
      throw new InvalidArgumentError('connect must be a function or an object')
    }

    if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
      throw new InvalidArgumentError('maxRedirections must be a positive number')
    }

    if (maxRequestsPerClient != null && (!Number.isInteger(maxRequestsPerClient) || maxRequestsPerClient < 0)) {
      throw new InvalidArgumentError('maxRequestsPerClient must be a positive number')
    }

    if (localAddress != null && (typeof localAddress !== 'string' || net.isIP(localAddress) === 0)) {
      throw new InvalidArgumentError('localAddress must be valid string IP address')
    }

    if (maxResponseSize != null && (!Number.isInteger(maxResponseSize) || maxResponseSize < -1)) {
      throw new InvalidArgumentError('maxResponseSize must be a positive number')
    }

    if (
      autoSelectFamilyAttemptTimeout != null &&
      (!Number.isInteger(autoSelectFamilyAttemptTimeout) || autoSelectFamilyAttemptTimeout < -1)
    ) {
      throw new InvalidArgumentError('autoSelectFamilyAttemptTimeout must be a positive number')
    }

    // h2
    if (allowH2 != null && typeof allowH2 !== 'boolean') {
      throw new InvalidArgumentError('allowH2 must be a valid boolean value')
    }

    if (maxConcurrentStreams != null && (typeof maxConcurrentStreams !== 'number' || maxConcurrentStreams < 1)) {
      throw new InvalidArgumentError('maxConcurrentStreams must be a positive integer, greater than 0')
    }

    if (typeof connect !== 'function') {
      connect = buildConnector({
        ...tls,
        maxCachedSessions,
        allowH2,
        socketPath,
        timeout: connectTimeout,
        ...(autoSelectFamily ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : undefined),
        ...connect
      })
    }

    if (interceptors?.Client && Array.isArray(interceptors.Client)) {
      this[kInterceptors] = interceptors.Client
      if (!deprecatedInterceptorWarned) {
        deprecatedInterceptorWarned = true
        process.emitWarning('Client.Options#interceptor is deprecated. Use Dispatcher#compose instead.', {
          code: 'UNDICI-CLIENT-INTERCEPTOR-DEPRECATED'
        })
      }
    } else {
      this[kInterceptors] = [createRedirectInterceptor({ maxRedirections })]
    }

    this[kUrl] = util.parseOrigin(url)
    this[kConnector] = connect
    this[kPipelining] = pipelining != null ? pipelining : 1
    this[kMaxHeadersSize] = maxHeaderSize || http.maxHeaderSize
    this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout
    this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 600e3 : keepAliveMaxTimeout
    this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 2e3 : keepAliveTimeoutThreshold
    this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout]
    this[kServerName] = null
    this[kLocalAddress] = localAddress != null ? localAddress : null
    this[kResuming] = 0 // 0, idle, 1, scheduled, 2 resuming
    this[kNeedDrain] = 0 // 0, idle, 1, scheduled, 2 resuming
    this[kHostHeader] = `host: ${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ''}\r\n`
    this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 300e3
    this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 300e3
    this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength
    this[kMaxRedirections] = maxRedirections
    this[kMaxRequests] = maxRequestsPerClient
    this[kClosedResolve] = null
    this[kMaxResponseSize] = maxResponseSize > -1 ? maxResponseSize : -1
    this[kMaxConcurrentStreams] = maxConcurrentStreams != null ? maxConcurrentStreams : 100 // Max peerConcurrentStreams for a Node h2 server
    this[kHTTPContext] = null

    // kQueue is built up of 3 sections separated by
    // the kRunningIdx and kPendingIdx indices.
    // |   complete   |   running   |   pending   |
    //                ^ kRunningIdx ^ kPendingIdx ^ kQueue.length
    // kRunningIdx points to the first running element.
    // kPendingIdx points to the first pending element.
    // This implements a fast queue with an amortized
    // time of O(1).

    this[kQueue] = []
    this[kRunningIdx] = 0
    this[kPendingIdx] = 0

    this[kResume] = (sync) => resume(this, sync)
    this[kOnError] = (err) => onError(this, err)
  }

  get pipelining () {
    return this[kPipelining]
  }

  set pipelining (value) {
    this[kPipelining] = value
    this[kResume](true)
  }

  get [kPending] () {
    return this[kQueue].length - this[kPendingIdx]
  }

  get [kRunning] () {
    return this[kPendingIdx] - this[kRunningIdx]
  }

  get [kSize] () {
    return this[kQueue].length - this[kRunningIdx]
  }

  get [kConnected] () {
    return !!this[kHTTPContext] && !this[kConnecting] && !this[kHTTPContext].destroyed
  }

  get [kBusy] () {
    return Boolean(
      this[kHTTPContext]?.busy(null) ||
      (this[kSize] >= (getPipelining(this) || 1)) ||
      this[kPending] > 0
    )
  }

  /* istanbul ignore: only used for test */
  [kConnect] (cb) {
    connect(this)
    this.once('connect', cb)
  }

  [kDispatch] (opts, handler) {
    const origin = opts.origin || this[kUrl].origin
    const request = new Request(origin, opts, handler)

    this[kQueue].push(request)
    if (this[kResuming]) {
      // Do nothing.
    } else if (util.bodyLength(request.body) == null && util.isIterable(request.body)) {
      // Wait a tick in case stream/iterator is ended in the same tick.
      this[kResuming] = 1
      queueMicrotask(() => resume(this))
    } else {
      this[kResume](true)
    }

    if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) {
      this[kNeedDrain] = 2
    }

    return this[kNeedDrain] < 2
  }

  async [kClose] () {
    // TODO: for H2 we need to gracefully flush the remaining enqueued
    // request and close each stream.
    return new Promise((resolve) => {
      if (this[kSize]) {
        this[kClosedResolve] = resolve
      } else {
        resolve(null)
      }
    })
  }

  async [kDestroy] (err) {
    return new Promise((resolve) => {
      const requests = this[kQueue].splice(this[kPendingIdx])
      for (let i = 0; i < requests.length; i++) {
        const request = requests[i]
        util.errorRequest(this, request, err)
      }

      const callback = () => {
        if (this[kClosedResolve]) {
          // TODO (fix): Should we error here with ClientDestroyedError?
          this[kClosedResolve]()
          this[kClosedResolve] = null
        }
        resolve(null)
      }

      if (this[kHTTPContext]) {
        this[kHTTPContext].destroy(err, callback)
        this[kHTTPContext] = null
      } else {
        queueMicrotask(callback)
      }

      this[kResume]()
    })
  }
}

const createRedirectInterceptor = __nccwpck_require__(5292)

function onError (client, err) {
  if (
    client[kRunning] === 0 &&
    err.code !== 'UND_ERR_INFO' &&
    err.code !== 'UND_ERR_SOCKET'
  ) {
    // Error is not caused by running request and not a recoverable
    // socket error.

    assert(client[kPendingIdx] === client[kRunningIdx])

    const requests = client[kQueue].splice(client[kRunningIdx])

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i]
      util.errorRequest(client, request, err)
    }
    assert(client[kSize] === 0)
  }
}

/**
 * @param {Client} client
 * @returns
 */
async function connect (client) {
  assert(!client[kConnecting])
  assert(!client[kHTTPContext])

  let { host, hostname, protocol, port } = client[kUrl]

  // Resolve ipv6
  if (hostname[0] === '[') {
    const idx = hostname.indexOf(']')

    assert(idx !== -1)
    const ip = hostname.substring(1, idx)

    assert(net.isIP(ip))
    hostname = ip
  }

  client[kConnecting] = true

  if (channels.beforeConnect.hasSubscribers) {
    channels.beforeConnect.publish({
      connectParams: {
        host,
        hostname,
        protocol,
        port,
        version: client[kHTTPContext]?.version,
        servername: client[kServerName],
        localAddress: client[kLocalAddress]
      },
      connector: client[kConnector]
    })
  }

  try {
    const socket = await new Promise((resolve, reject) => {
      client[kConnector]({
        host,
        hostname,
        protocol,
        port,
        servername: client[kServerName],
        localAddress: client[kLocalAddress]
      }, (err, socket) => {
        if (err) {
          reject(err)
        } else {
          resolve(socket)
        }
      })
    })

    if (client.destroyed) {
      util.destroy(socket.on('error', noop), new ClientDestroyedError())
      return
    }

    assert(socket)

    try {
      client[kHTTPContext] = socket.alpnProtocol === 'h2'
        ? await connectH2(client, socket)
        : await connectH1(client, socket)
    } catch (err) {
      socket.destroy().on('error', noop)
      throw err
    }

    client[kConnecting] = false

    socket[kCounter] = 0
    socket[kMaxRequests] = client[kMaxRequests]
    socket[kClient] = client
    socket[kError] = null

    if (channels.connected.hasSubscribers) {
      channels.connected.publish({
        connectParams: {
          host,
          hostname,
          protocol,
          port,
          version: client[kHTTPContext]?.version,
          servername: client[kServerName],
          localAddress: client[kLocalAddress]
        },
        connector: client[kConnector],
        socket
      })
    }
    client.emit('connect', client[kUrl], [client])
  } catch (err) {
    if (client.destroyed) {
      return
    }

    client[kConnecting] = false

    if (channels.connectError.hasSubscribers) {
      channels.connectError.publish({
        connectParams: {
          host,
          hostname,
          protocol,
          port,
          version: client[kHTTPContext]?.version,
          servername: client[kServerName],
          localAddress: client[kLocalAddress]
        },
        connector: client[kConnector],
        error: err
      })
    }

    if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
      assert(client[kRunning] === 0)
      while (client[kPending] > 0 && client[kQueue][client[kPendingIdx]].servername === client[kServerName]) {
        const request = client[kQueue][client[kPendingIdx]++]
        util.errorRequest(client, request, err)
      }
    } else {
      onError(client, err)
    }

    client.emit('connectionError', client[kUrl], [client], err)
  }

  client[kResume]()
}

function emitDrain (client) {
  client[kNeedDrain] = 0
  client.emit('drain', client[kUrl], [client])
}

function resume (client, sync) {
  if (client[kResuming] === 2) {
    return
  }

  client[kResuming] = 2

  _resume(client, sync)
  client[kResuming] = 0

  if (client[kRunningIdx] > 256) {
    client[kQueue].splice(0, client[kRunningIdx])
    client[kPendingIdx] -= client[kRunningIdx]
    client[kRunningIdx] = 0
  }
}

function _resume (client, sync) {
  while (true) {
    if (client.destroyed) {
      assert(client[kPending] === 0)
      return
    }

    if (client[kClosedResolve] && !client[kSize]) {
      client[kClosedResolve]()
      client[kClosedResolve] = null
      return
    }

    if (client[kHTTPContext]) {
      client[kHTTPContext].resume()
    }

    if (client[kBusy]) {
      client[kNeedDrain] = 2
    } else if (client[kNeedDrain] === 2) {
      if (sync) {
        client[kNeedDrain] = 1
        queueMicrotask(() => emitDrain(client))
      } else {
        emitDrain(client)
      }
      continue
    }

    if (client[kPending] === 0) {
      return
    }

    if (client[kRunning] >= (getPipelining(client) || 1)) {
      return
    }

    const request = client[kQueue][client[kPendingIdx]]

    if (client[kUrl].protocol === 'https:' && client[kServerName] !== request.servername) {
      if (client[kRunning] > 0) {
        return
      }

      client[kServerName] = request.servername
      client[kHTTPContext]?.destroy(new InformationalError('servername changed'), () => {
        client[kHTTPContext] = null
        resume(client)
      })
    }

    if (client[kConnecting]) {
      return
    }

    if (!client[kHTTPContext]) {
      connect(client)
      return
    }

    if (client[kHTTPContext].destroyed) {
      return
    }

    if (client[kHTTPContext].busy(request)) {
      return
    }

    if (!request.aborted && client[kHTTPContext].write(request)) {
      client[kPendingIdx]++
    } else {
      client[kQueue].splice(client[kPendingIdx], 1)
    }
  }
}

module.exports = Client


/***/ }),

/***/ 6414:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Dispatcher = __nccwpck_require__(3701)
const {
  ClientDestroyedError,
  ClientClosedError,
  InvalidArgumentError
} = __nccwpck_require__(8642)
const { kDestroy, kClose, kClosed, kDestroyed, kDispatch, kInterceptors } = __nccwpck_require__(46)

const kOnDestroyed = Symbol('onDestroyed')
const kOnClosed = Symbol('onClosed')
const kInterceptedDispatch = Symbol('Intercepted Dispatch')

class DispatcherBase extends Dispatcher {
  constructor () {
    super()

    this[kDestroyed] = false
    this[kOnDestroyed] = null
    this[kClosed] = false
    this[kOnClosed] = []
  }

  get destroyed () {
    return this[kDestroyed]
  }

  get closed () {
    return this[kClosed]
  }

  get interceptors () {
    return this[kInterceptors]
  }

  set interceptors (newInterceptors) {
    if (newInterceptors) {
      for (let i = newInterceptors.length - 1; i >= 0; i--) {
        const interceptor = this[kInterceptors][i]
        if (typeof interceptor !== 'function') {
          throw new InvalidArgumentError('interceptor must be an function')
        }
      }
    }

    this[kInterceptors] = newInterceptors
  }

  close (callback) {
    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.close((err, data) => {
          return err ? reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    if (this[kDestroyed]) {
      queueMicrotask(() => callback(new ClientDestroyedError(), null))
      return
    }

    if (this[kClosed]) {
      if (this[kOnClosed]) {
        this[kOnClosed].push(callback)
      } else {
        queueMicrotask(() => callback(null, null))
      }
      return
    }

    this[kClosed] = true
    this[kOnClosed].push(callback)

    const onClosed = () => {
      const callbacks = this[kOnClosed]
      this[kOnClosed] = null
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i](null, null)
      }
    }

    // Should not error.
    this[kClose]()
      .then(() => this.destroy())
      .then(() => {
        queueMicrotask(onClosed)
      })
  }

  destroy (err, callback) {
    if (typeof err === 'function') {
      callback = err
      err = null
    }

    if (callback === undefined) {
      return new Promise((resolve, reject) => {
        this.destroy(err, (err, data) => {
          return err ? /* istanbul ignore next: should never error */ reject(err) : resolve(data)
        })
      })
    }

    if (typeof callback !== 'function') {
      throw new InvalidArgumentError('invalid callback')
    }

    if (this[kDestroyed]) {
      if (this[kOnDestroyed]) {
        this[kOnDestroyed].push(callback)
      } else {
        queueMicrotask(() => callback(null, null))
      }
      return
    }

    if (!err) {
      err = new ClientDestroyedError()
    }

    this[kDestroyed] = true
    this[kOnDestroyed] = this[kOnDestroyed] || []
    this[kOnDestroyed].push(callback)

    const onDestroyed = () => {
      const callbacks = this[kOnDestroyed]
      this[kOnDestroyed] = null
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i](null, null)
      }
    }

    // Should not error.
    this[kDestroy](err).then(() => {
      queueMicrotask(onDestroyed)
    })
  }

  [kInterceptedDispatch] (opts, handler) {
    if (!this[kInterceptors] || this[kInterceptors].length === 0) {
      this[kInterceptedDispatch] = this[kDispatch]
      return this[kDispatch](opts, handler)
    }

    let dispatch = this[kDispatch].bind(this)
    for (let i = this[kInterceptors].length - 1; i >= 0; i--) {
      dispatch = this[kInterceptors][i](dispatch)
    }
    this[kInterceptedDispatch] = dispatch
    return dispatch(opts, handler)
  }

  dispatch (opts, handler) {
    if (!handler || typeof handler !== 'object') {
      throw new InvalidArgumentError('handler must be an object')
    }

    try {
      if (!opts || typeof opts !== 'object') {
        throw new InvalidArgumentError('opts must be an object.')
      }

      if (this[kDestroyed] || this[kOnDestroyed]) {
        throw new ClientDestroyedError()
      }

      if (this[kClosed]) {
        throw new ClientClosedError()
      }

      return this[kInterceptedDispatch](opts, handler)
    } catch (err) {
      if (typeof handler.onError !== 'function') {
        throw new InvalidArgumentError('invalid onError method')
      }

      handler.onError(err)

      return false
    }
  }
}

module.exports = DispatcherBase


/***/ }),

/***/ 3701:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const EventEmitter = __nccwpck_require__(5673)

class Dispatcher extends EventEmitter {
  dispatch () {
    throw new Error('not implemented')
  }

  close () {
    throw new Error('not implemented')
  }

  destroy () {
    throw new Error('not implemented')
  }

  compose (...args) {
    // So we handle [interceptor1, interceptor2] or interceptor1, interceptor2, ...
    const interceptors = Array.isArray(args[0]) ? args[0] : args
    let dispatch = this.dispatch.bind(this)

    for (const interceptor of interceptors) {
      if (interceptor == null) {
        continue
      }

      if (typeof interceptor !== 'function') {
        throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`)
      }

      dispatch = interceptor(dispatch)

      if (dispatch == null || typeof dispatch !== 'function' || dispatch.length !== 2) {
        throw new TypeError('invalid interceptor')
      }
    }

    return new ComposedDispatcher(this, dispatch)
  }
}

class ComposedDispatcher extends Dispatcher {
  #dispatcher = null
  #dispatch = null

  constructor (dispatcher, dispatch) {
    super()
    this.#dispatcher = dispatcher
    this.#dispatch = dispatch
  }

  dispatch (...args) {
    this.#dispatch(...args)
  }

  close (...args) {
    return this.#dispatcher.close(...args)
  }

  destroy (...args) {
    return this.#dispatcher.destroy(...args)
  }
}

module.exports = Dispatcher


/***/ }),

/***/ 3479:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const DispatcherBase = __nccwpck_require__(6414)
const { kClose, kDestroy, kClosed, kDestroyed, kDispatch, kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent } = __nccwpck_require__(46)
const ProxyAgent = __nccwpck_require__(9752)
const Agent = __nccwpck_require__(6705)

const DEFAULT_PORTS = {
  'http:': 80,
  'https:': 443
}

let experimentalWarned = false

class EnvHttpProxyAgent extends DispatcherBase {
  #noProxyValue = null
  #noProxyEntries = null
  #opts = null

  constructor (opts = {}) {
    super()
    this.#opts = opts

    if (!experimentalWarned) {
      experimentalWarned = true
      process.emitWarning('EnvHttpProxyAgent is experimental, expect them to change at any time.', {
        code: 'UNDICI-EHPA'
      })
    }

    const { httpProxy, httpsProxy, noProxy, ...agentOpts } = opts

    this[kNoProxyAgent] = new Agent(agentOpts)

    const HTTP_PROXY = httpProxy ?? process.env.http_proxy ?? process.env.HTTP_PROXY
    if (HTTP_PROXY) {
      this[kHttpProxyAgent] = new ProxyAgent({ ...agentOpts, uri: HTTP_PROXY })
    } else {
      this[kHttpProxyAgent] = this[kNoProxyAgent]
    }

    const HTTPS_PROXY = httpsProxy ?? process.env.https_proxy ?? process.env.HTTPS_PROXY
    if (HTTPS_PROXY) {
      this[kHttpsProxyAgent] = new ProxyAgent({ ...agentOpts, uri: HTTPS_PROXY })
    } else {
      this[kHttpsProxyAgent] = this[kHttpProxyAgent]
    }

    this.#parseNoProxy()
  }

  [kDispatch] (opts, handler) {
    const url = new URL(opts.origin)
    const agent = this.#getProxyAgentForUrl(url)
    return agent.dispatch(opts, handler)
  }

  async [kClose] () {
    await this[kNoProxyAgent].close()
    if (!this[kHttpProxyAgent][kClosed]) {
      await this[kHttpProxyAgent].close()
    }
    if (!this[kHttpsProxyAgent][kClosed]) {
      await this[kHttpsProxyAgent].close()
    }
  }

  async [kDestroy] (err) {
    await this[kNoProxyAgent].destroy(err)
    if (!this[kHttpProxyAgent][kDestroyed]) {
      await this[kHttpProxyAgent].destroy(err)
    }
    if (!this[kHttpsProxyAgent][kDestroyed]) {
      await this[kHttpsProxyAgent].destroy(err)
    }
  }

  #getProxyAgentForUrl (url) {
    let { protocol, host: hostname, port } = url

    // Stripping ports in this way instead of using parsedUrl.hostname to make
    // sure that the brackets around IPv6 addresses are kept.
    hostname = hostname.replace(/:\d*$/, '').toLowerCase()
    port = Number.parseInt(port, 10) || DEFAULT_PORTS[protocol] || 0
    if (!this.#shouldProxy(hostname, port)) {
      return this[kNoProxyAgent]
    }
    if (protocol === 'https:') {
      return this[kHttpsProxyAgent]
    }
    return this[kHttpProxyAgent]
  }

  #shouldProxy (hostname, port) {
    if (this.#noProxyChanged) {
      this.#parseNoProxy()
    }

    if (this.#noProxyEntries.length === 0) {
      return true // Always proxy if NO_PROXY is not set or empty.
    }
    if (this.#noProxyValue === '*') {
      return false // Never proxy if wildcard is set.
    }

    for (let i = 0; i < this.#noProxyEntries.length; i++) {
      const entry = this.#noProxyEntries[i]
      if (entry.port && entry.port !== port) {
        continue // Skip if ports don't match.
      }
      if (!/^[.*]/.test(entry.hostname)) {
        // No wildcards, so don't proxy only if there is not an exact match.
        if (hostname === entry.hostname) {
          return false
        }
      } else {
        // Don't proxy if the hostname ends with the no_proxy host.
        if (hostname.endsWith(entry.hostname.replace(/^\*/, ''))) {
          return false
        }
      }
    }

    return true
  }

  #parseNoProxy () {
    const noProxyValue = this.#opts.noProxy ?? this.#noProxyEnv
    const noProxySplit = noProxyValue.split(/[,\s]/)
    const noProxyEntries = []

    for (let i = 0; i < noProxySplit.length; i++) {
      const entry = noProxySplit[i]
      if (!entry) {
        continue
      }
      const parsed = entry.match(/^(.+):(\d+)$/)
      noProxyEntries.push({
        hostname: (parsed ? parsed[1] : entry).toLowerCase(),
        port: parsed ? Number.parseInt(parsed[2], 10) : 0
      })
    }

    this.#noProxyValue = noProxyValue
    this.#noProxyEntries = noProxyEntries
  }

  get #noProxyChanged () {
    if (this.#opts.noProxy !== undefined) {
      return false
    }
    return this.#noProxyValue !== this.#noProxyEnv
  }

  get #noProxyEnv () {
    return process.env.no_proxy ?? process.env.NO_PROXY ?? ''
  }
}

module.exports = EnvHttpProxyAgent


/***/ }),

/***/ 3039:
/***/ ((module) => {

"use strict";
/* eslint-disable */



// Extracted from node/lib/internal/fixed_queue.js

// Currently optimal queue size, tested on V8 6.0 - 6.6. Must be power of two.
const kSize = 2048;
const kMask = kSize - 1;

// The FixedQueue is implemented as a singly-linked list of fixed-size
// circular buffers. It looks something like this:
//
//  head                                                       tail
//    |                                                          |
//    v                                                          v
// +-----------+ <-----\       +-----------+ <------\         +-----------+
// |  [null]   |        \----- |   next    |         \------- |   next    |
// +-----------+               +-----------+                  +-----------+
// |   item    | <-- bottom    |   item    | <-- bottom       |  [empty]  |
// |   item    |               |   item    |                  |  [empty]  |
// |   item    |               |   item    |                  |  [empty]  |
// |   item    |               |   item    |                  |  [empty]  |
// |   item    |               |   item    |       bottom --> |   item    |
// |   item    |               |   item    |                  |   item    |
// |    ...    |               |    ...    |                  |    ...    |
// |   item    |               |   item    |                  |   item    |
// |   item    |               |   item    |                  |   item    |
// |  [empty]  | <-- top       |   item    |                  |   item    |
// |  [empty]  |               |   item    |                  |   item    |
// |  [empty]  |               |  [empty]  | <-- top  top --> |  [empty]  |
// +-----------+               +-----------+                  +-----------+
//
// Or, if there is only one circular buffer, it looks something
// like either of these:
//
//  head   tail                                 head   tail
//    |     |                                     |     |
//    v     v                                     v     v
// +-----------+                               +-----------+
// |  [null]   |                               |  [null]   |
// +-----------+                               +-----------+
// |  [empty]  |                               |   item    |
// |  [empty]  |                               |   item    |
// |   item    | <-- bottom            top --> |  [empty]  |
// |   item    |                               |  [empty]  |
// |  [empty]  | <-- top            bottom --> |   item    |
// |  [empty]  |                               |   item    |
// +-----------+                               +-----------+
//
// Adding a value means moving `top` forward by one, removing means
// moving `bottom` forward by one. After reaching the end, the queue
// wraps around.
//
// When `top === bottom` the current queue is empty and when
// `top + 1 === bottom` it's full. This wastes a single space of storage
// but allows much quicker checks.

class FixedCircularBuffer {
  constructor() {
    this.bottom = 0;
    this.top = 0;
    this.list = new Array(kSize);
    this.next = null;
  }

  isEmpty() {
    return this.top === this.bottom;
  }

  isFull() {
    return ((this.top + 1) & kMask) === this.bottom;
  }

  push(data) {
    this.list[this.top] = data;
    this.top = (this.top + 1) & kMask;
  }

  shift() {
    const nextItem = this.list[this.bottom];
    if (nextItem === undefined)
      return null;
    this.list[this.bottom] = undefined;
    this.bottom = (this.bottom + 1) & kMask;
    return nextItem;
  }
}

module.exports = class FixedQueue {
  constructor() {
    this.head = this.tail = new FixedCircularBuffer();
  }

  isEmpty() {
    return this.head.isEmpty();
  }

  push(data) {
    if (this.head.isFull()) {
      // Head is full: Creates a new queue, sets the old queue's `.next` to it,
      // and sets it as the new main queue.
      this.head = this.head.next = new FixedCircularBuffer();
    }
    this.head.push(data);
  }

  shift() {
    const tail = this.tail;
    const next = tail.shift();
    if (tail.isEmpty() && tail.next !== null) {
      // If there is another queue, it forms the new tail.
      this.tail = tail.next;
    }
    return next;
  }
};


/***/ }),

/***/ 1556:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const DispatcherBase = __nccwpck_require__(6414)
const FixedQueue = __nccwpck_require__(3039)
const { kConnected, kSize, kRunning, kPending, kQueued, kBusy, kFree, kUrl, kClose, kDestroy, kDispatch } = __nccwpck_require__(46)
const PoolStats = __nccwpck_require__(419)

const kClients = Symbol('clients')
const kNeedDrain = Symbol('needDrain')
const kQueue = Symbol('queue')
const kClosedResolve = Symbol('closed resolve')
const kOnDrain = Symbol('onDrain')
const kOnConnect = Symbol('onConnect')
const kOnDisconnect = Symbol('onDisconnect')
const kOnConnectionError = Symbol('onConnectionError')
const kGetDispatcher = Symbol('get dispatcher')
const kAddClient = Symbol('add client')
const kRemoveClient = Symbol('remove client')
const kStats = Symbol('stats')

class PoolBase extends DispatcherBase {
  constructor () {
    super()

    this[kQueue] = new FixedQueue()
    this[kClients] = []
    this[kQueued] = 0

    const pool = this

    this[kOnDrain] = function onDrain (origin, targets) {
      const queue = pool[kQueue]

      let needDrain = false

      while (!needDrain) {
        const item = queue.shift()
        if (!item) {
          break
        }
        pool[kQueued]--
        needDrain = !this.dispatch(item.opts, item.handler)
      }

      this[kNeedDrain] = needDrain

      if (!this[kNeedDrain] && pool[kNeedDrain]) {
        pool[kNeedDrain] = false
        pool.emit('drain', origin, [pool, ...targets])
      }

      if (pool[kClosedResolve] && queue.isEmpty()) {
        Promise
          .all(pool[kClients].map(c => c.close()))
          .then(pool[kClosedResolve])
      }
    }

    this[kOnConnect] = (origin, targets) => {
      pool.emit('connect', origin, [pool, ...targets])
    }

    this[kOnDisconnect] = (origin, targets, err) => {
      pool.emit('disconnect', origin, [pool, ...targets], err)
    }

    this[kOnConnectionError] = (origin, targets, err) => {
      pool.emit('connectionError', origin, [pool, ...targets], err)
    }

    this[kStats] = new PoolStats(this)
  }

  get [kBusy] () {
    return this[kNeedDrain]
  }

  get [kConnected] () {
    return this[kClients].filter(client => client[kConnected]).length
  }

  get [kFree] () {
    return this[kClients].filter(client => client[kConnected] && !client[kNeedDrain]).length
  }

  get [kPending] () {
    let ret = this[kQueued]
    for (const { [kPending]: pending } of this[kClients]) {
      ret += pending
    }
    return ret
  }

  get [kRunning] () {
    let ret = 0
    for (const { [kRunning]: running } of this[kClients]) {
      ret += running
    }
    return ret
  }

  get [kSize] () {
    let ret = this[kQueued]
    for (const { [kSize]: size } of this[kClients]) {
      ret += size
    }
    return ret
  }

  get stats () {
    return this[kStats]
  }

  async [kClose] () {
    if (this[kQueue].isEmpty()) {
      await Promise.all(this[kClients].map(c => c.close()))
    } else {
      await new Promise((resolve) => {
        this[kClosedResolve] = resolve
      })
    }
  }

  async [kDestroy] (err) {
    while (true) {
      const item = this[kQueue].shift()
      if (!item) {
        break
      }
      item.handler.onError(err)
    }

    await Promise.all(this[kClients].map(c => c.destroy(err)))
  }

  [kDispatch] (opts, handler) {
    const dispatcher = this[kGetDispatcher]()

    if (!dispatcher) {
      this[kNeedDrain] = true
      this[kQueue].push({ opts, handler })
      this[kQueued]++
    } else if (!dispatcher.dispatch(opts, handler)) {
      dispatcher[kNeedDrain] = true
      this[kNeedDrain] = !this[kGetDispatcher]()
    }

    return !this[kNeedDrain]
  }

  [kAddClient] (client) {
    client
      .on('drain', this[kOnDrain])
      .on('connect', this[kOnConnect])
      .on('disconnect', this[kOnDisconnect])
      .on('connectionError', this[kOnConnectionError])

    this[kClients].push(client)

    if (this[kNeedDrain]) {
      queueMicrotask(() => {
        if (this[kNeedDrain]) {
          this[kOnDrain](client[kUrl], [this, client])
        }
      })
    }

    return this
  }

  [kRemoveClient] (client) {
    client.close(() => {
      const idx = this[kClients].indexOf(client)
      if (idx !== -1) {
        this[kClients].splice(idx, 1)
      }
    })

    this[kNeedDrain] = this[kClients].some(dispatcher => (
      !dispatcher[kNeedDrain] &&
      dispatcher.closed !== true &&
      dispatcher.destroyed !== true
    ))
  }
}

module.exports = {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kRemoveClient,
  kGetDispatcher
}


/***/ }),

/***/ 419:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const { kFree, kConnected, kPending, kQueued, kRunning, kSize } = __nccwpck_require__(46)
const kPool = Symbol('pool')

class PoolStats {
  constructor (pool) {
    this[kPool] = pool
  }

  get connected () {
    return this[kPool][kConnected]
  }

  get free () {
    return this[kPool][kFree]
  }

  get pending () {
    return this[kPool][kPending]
  }

  get queued () {
    return this[kPool][kQueued]
  }

  get running () {
    return this[kPool][kRunning]
  }

  get size () {
    return this[kPool][kSize]
  }
}

module.exports = PoolStats


/***/ }),

/***/ 1076:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  PoolBase,
  kClients,
  kNeedDrain,
  kAddClient,
  kGetDispatcher
} = __nccwpck_require__(1556)
const Client = __nccwpck_require__(4885)
const {
  InvalidArgumentError
} = __nccwpck_require__(8642)
const util = __nccwpck_require__(9099)
const { kUrl, kInterceptors } = __nccwpck_require__(46)
const buildConnector = __nccwpck_require__(334)

const kOptions = Symbol('options')
const kConnections = Symbol('connections')
const kFactory = Symbol('factory')

function defaultFactory (origin, opts) {
  return new Client(origin, opts)
}

class Pool extends PoolBase {
  constructor (origin, {
    connections,
    factory = defaultFactory,
    connect,
    connectTimeout,
    tls,
    maxCachedSessions,
    socketPath,
    autoSelectFamily,
    autoSelectFamilyAttemptTimeout,
    allowH2,
    ...options
  } = {}) {
    super()

    if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
      throw new InvalidArgumentError('invalid connections')
    }

    if (typeof factory !== 'function') {
      throw new InvalidArgumentError('factory must be a function.')
    }

    if (connect != null && typeof connect !== 'function' && typeof connect !== 'object') {
      throw new InvalidArgumentError('connect must be a function or an object')
    }

    if (typeof connect !== 'function') {
      connect = buildConnector({
        ...tls,
        maxCachedSessions,
        allowH2,
        socketPath,
        timeout: connectTimeout,
        ...(autoSelectFamily ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : undefined),
        ...connect
      })
    }

    this[kInterceptors] = options.interceptors?.Pool && Array.isArray(options.interceptors.Pool)
      ? options.interceptors.Pool
      : []
    this[kConnections] = connections || null
    this[kUrl] = util.parseOrigin(origin)
    this[kOptions] = { ...util.deepClone(options), connect, allowH2 }
    this[kOptions].interceptors = options.interceptors
      ? { ...options.interceptors }
      : undefined
    this[kFactory] = factory

    this.on('connectionError', (origin, targets, error) => {
      // If a connection error occurs, we remove the client from the pool,
      // and emit a connectionError event. They will not be re-used.
      // Fixes https://github.com/nodejs/undici/issues/3895
      for (const target of targets) {
        // Do not use kRemoveClient here, as it will close the client,
        // but the client cannot be closed in this state.
        const idx = this[kClients].indexOf(target)
        if (idx !== -1) {
          this[kClients].splice(idx, 1)
        }
      }
    })
  }

  [kGetDispatcher] () {
    for (const client of this[kClients]) {
      if (!client[kNeedDrain]) {
        return client
      }
    }

    if (!this[kConnections] || this[kClients].length < this[kConnections]) {
      const dispatcher = this[kFactory](this[kUrl], this[kOptions])
      this[kAddClient](dispatcher)
      return dispatcher
    }
  }
}

module.exports = Pool


/***/ }),

/***/ 9752:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { kProxy, kClose, kDestroy, kDispatch, kInterceptors } = __nccwpck_require__(46)
const { URL } = __nccwpck_require__(1041)
const Agent = __nccwpck_require__(6705)
const Pool = __nccwpck_require__(1076)
const DispatcherBase = __nccwpck_require__(6414)
const { InvalidArgumentError, RequestAbortedError, SecureProxyConnectionError } = __nccwpck_require__(8642)
const buildConnector = __nccwpck_require__(334)
const Client = __nccwpck_require__(4885)

const kAgent = Symbol('proxy agent')
const kClient = Symbol('proxy client')
const kProxyHeaders = Symbol('proxy headers')
const kRequestTls = Symbol('request tls settings')
const kProxyTls = Symbol('proxy tls settings')
const kConnectEndpoint = Symbol('connect endpoint function')
const kTunnelProxy = Symbol('tunnel proxy')

function defaultProtocolPort (protocol) {
  return protocol === 'https:' ? 443 : 80
}

function defaultFactory (origin, opts) {
  return new Pool(origin, opts)
}

const noop = () => {}

function defaultAgentFactory (origin, opts) {
  if (opts.connections === 1) {
    return new Client(origin, opts)
  }
  return new Pool(origin, opts)
}

class Http1ProxyWrapper extends DispatcherBase {
  #client

  constructor (proxyUrl, { headers = {}, connect, factory }) {
    super()
    if (!proxyUrl) {
      throw new InvalidArgumentError('Proxy URL is mandatory')
    }

    this[kProxyHeaders] = headers
    if (factory) {
      this.#client = factory(proxyUrl, { connect })
    } else {
      this.#client = new Client(proxyUrl, { connect })
    }
  }

  [kDispatch] (opts, handler) {
    const onHeaders = handler.onHeaders
    handler.onHeaders = function (statusCode, data, resume) {
      if (statusCode === 407) {
        if (typeof handler.onError === 'function') {
          handler.onError(new InvalidArgumentError('Proxy Authentication Required (407)'))
        }
        return
      }
      if (onHeaders) onHeaders.call(this, statusCode, data, resume)
    }

    // Rewrite request as an HTTP1 Proxy request, without tunneling.
    const {
      origin,
      path = '/',
      headers = {}
    } = opts

    opts.path = origin + path

    if (!('host' in headers) && !('Host' in headers)) {
      const { host } = new URL(origin)
      headers.host = host
    }
    opts.headers = { ...this[kProxyHeaders], ...headers }

    return this.#client[kDispatch](opts, handler)
  }

  async [kClose] () {
    return this.#client.close()
  }

  async [kDestroy] (err) {
    return this.#client.destroy(err)
  }
}

class ProxyAgent extends DispatcherBase {
  constructor (opts) {
    super()

    if (!opts || (typeof opts === 'object' && !(opts instanceof URL) && !opts.uri)) {
      throw new InvalidArgumentError('Proxy uri is mandatory')
    }

    const { clientFactory = defaultFactory } = opts
    if (typeof clientFactory !== 'function') {
      throw new InvalidArgumentError('Proxy opts.clientFactory must be a function.')
    }

    const { proxyTunnel = true } = opts

    const url = this.#getUrl(opts)
    const { href, origin, port, protocol, username, password, hostname: proxyHostname } = url

    this[kProxy] = { uri: href, protocol }
    this[kInterceptors] = opts.interceptors?.ProxyAgent && Array.isArray(opts.interceptors.ProxyAgent)
      ? opts.interceptors.ProxyAgent
      : []
    this[kRequestTls] = opts.requestTls
    this[kProxyTls] = opts.proxyTls
    this[kProxyHeaders] = opts.headers || {}
    this[kTunnelProxy] = proxyTunnel

    if (opts.auth && opts.token) {
      throw new InvalidArgumentError('opts.auth cannot be used in combination with opts.token')
    } else if (opts.auth) {
      /* @deprecated in favour of opts.token */
      this[kProxyHeaders]['proxy-authorization'] = `Basic ${opts.auth}`
    } else if (opts.token) {
      this[kProxyHeaders]['proxy-authorization'] = opts.token
    } else if (username && password) {
      this[kProxyHeaders]['proxy-authorization'] = `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString('base64')}`
    }

    const connect = buildConnector({ ...opts.proxyTls })
    this[kConnectEndpoint] = buildConnector({ ...opts.requestTls })

    const agentFactory = opts.factory || defaultAgentFactory
    const factory = (origin, options) => {
      const { protocol } = new URL(origin)
      if (!this[kTunnelProxy] && protocol === 'http:' && this[kProxy].protocol === 'http:') {
        return new Http1ProxyWrapper(this[kProxy].uri, {
          headers: this[kProxyHeaders],
          connect,
          factory: agentFactory
        })
      }
      return agentFactory(origin, options)
    }
    this[kClient] = clientFactory(url, { connect })
    this[kAgent] = new Agent({
      ...opts,
      factory,
      connect: async (opts, callback) => {
        let requestedPath = opts.host
        if (!opts.port) {
          requestedPath += `:${defaultProtocolPort(opts.protocol)}`
        }
        try {
          const { socket, statusCode } = await this[kClient].connect({
            origin,
            port,
            path: requestedPath,
            signal: opts.signal,
            headers: {
              ...this[kProxyHeaders],
              host: opts.host
            },
            servername: this[kProxyTls]?.servername || proxyHostname
          })
          if (statusCode !== 200) {
            socket.on('error', noop).destroy()
            callback(new RequestAbortedError(`Proxy response (${statusCode}) !== 200 when HTTP Tunneling`))
          }
          if (opts.protocol !== 'https:') {
            callback(null, socket)
            return
          }
          let servername
          if (this[kRequestTls]) {
            servername = this[kRequestTls].servername
          } else {
            servername = opts.servername
          }
          this[kConnectEndpoint]({ ...opts, servername, httpSocket: socket }, callback)
        } catch (err) {
          if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            // Throw a custom error to avoid loop in client.js#connect
            callback(new SecureProxyConnectionError(err))
          } else {
            callback(err)
          }
        }
      }
    })
  }

  dispatch (opts, handler) {
    const headers = buildHeaders(opts.headers)
    throwIfProxyAuthIsSent(headers)

    if (headers && !('host' in headers) && !('Host' in headers)) {
      const { host } = new URL(opts.origin)
      headers.host = host
    }

    return this[kAgent].dispatch(
      {
        ...opts,
        headers
      },
      handler
    )
  }

  /**
   * @param {import('../types/proxy-agent').ProxyAgent.Options | string | URL} opts
   * @returns {URL}
   */
  #getUrl (opts) {
    if (typeof opts === 'string') {
      return new URL(opts)
    } else if (opts instanceof URL) {
      return opts
    } else {
      return new URL(opts.uri)
    }
  }

  async [kClose] () {
    await this[kAgent].close()
    await this[kClient].close()
  }

  async [kDestroy] () {
    await this[kAgent].destroy()
    await this[kClient].destroy()
  }
}

/**
 * @param {string[] | Record<string, string>} headers
 * @returns {Record<string, string>}
 */
function buildHeaders (headers) {
  // When using undici.fetch, the headers list is stored
  // as an array.
  if (Array.isArray(headers)) {
    /** @type {Record<string, string>} */
    const headersPair = {}

    for (let i = 0; i < headers.length; i += 2) {
      headersPair[headers[i]] = headers[i + 1]
    }

    return headersPair
  }

  return headers
}

/**
 * @param {Record<string, string>} headers
 *
 * Previous versions of ProxyAgent suggests the Proxy-Authorization in request headers
 * Nevertheless, it was changed and to avoid a security vulnerability by end users
 * this check was created.
 * It should be removed in the next major version for performance reasons
 */
function throwIfProxyAuthIsSent (headers) {
  const existProxyAuth = headers && Object.keys(headers)
    .find((key) => key.toLowerCase() === 'proxy-authorization')
  if (existProxyAuth) {
    throw new InvalidArgumentError('Proxy-Authorization should be sent in ProxyAgent constructor')
  }
}

module.exports = ProxyAgent


/***/ }),

/***/ 5162:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const Dispatcher = __nccwpck_require__(3701)
const RetryHandler = __nccwpck_require__(5733)

class RetryAgent extends Dispatcher {
  #agent = null
  #options = null
  constructor (agent, options = {}) {
    super(options)
    this.#agent = agent
    this.#options = options
  }

  dispatch (opts, handler) {
    const retry = new RetryHandler({
      ...opts,
      retryOptions: this.#options
    }, {
      dispatch: this.#agent.dispatch.bind(this.#agent),
      handler
    })
    return this.#agent.dispatch(opts, retry)
  }

  close () {
    return this.#agent.close()
  }

  destroy () {
    return this.#agent.destroy()
  }
}

module.exports = RetryAgent


/***/ }),

/***/ 415:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


// We include a version number for the Dispatcher API. In case of breaking changes,
// this version number must be increased to avoid conflicts.
const globalDispatcher = Symbol.for('undici.globalDispatcher.1')
const { InvalidArgumentError } = __nccwpck_require__(8642)
const Agent = __nccwpck_require__(6705)

if (getGlobalDispatcher() === undefined) {
  setGlobalDispatcher(new Agent())
}

function setGlobalDispatcher (agent) {
  if (!agent || typeof agent.dispatch !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  Object.defineProperty(globalThis, globalDispatcher, {
    value: agent,
    writable: true,
    enumerable: false,
    configurable: false
  })
}

function getGlobalDispatcher () {
  return globalThis[globalDispatcher]
}

module.exports = {
  setGlobalDispatcher,
  getGlobalDispatcher
}


/***/ }),

/***/ 2790:
/***/ ((module) => {

"use strict";


module.exports = class DecoratorHandler {
  #handler

  constructor (handler) {
    if (typeof handler !== 'object' || handler === null) {
      throw new TypeError('handler must be an object')
    }
    this.#handler = handler
  }

  onConnect (...args) {
    return this.#handler.onConnect?.(...args)
  }

  onError (...args) {
    return this.#handler.onError?.(...args)
  }

  onUpgrade (...args) {
    return this.#handler.onUpgrade?.(...args)
  }

  onResponseStarted (...args) {
    return this.#handler.onResponseStarted?.(...args)
  }

  onHeaders (...args) {
    return this.#handler.onHeaders?.(...args)
  }

  onData (...args) {
    return this.#handler.onData?.(...args)
  }

  onComplete (...args) {
    return this.#handler.onComplete?.(...args)
  }

  onBodySent (...args) {
    return this.#handler.onBodySent?.(...args)
  }
}


/***/ }),

/***/ 5025:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const util = __nccwpck_require__(9099)
const { kBodyUsed } = __nccwpck_require__(46)
const assert = __nccwpck_require__(8061)
const { InvalidArgumentError } = __nccwpck_require__(8642)
const EE = __nccwpck_require__(5673)

const redirectableStatusCodes = [300, 301, 302, 303, 307, 308]

const kBody = Symbol('body')

class BodyAsyncIterable {
  constructor (body) {
    this[kBody] = body
    this[kBodyUsed] = false
  }

  async * [Symbol.asyncIterator] () {
    assert(!this[kBodyUsed], 'disturbed')
    this[kBodyUsed] = true
    yield * this[kBody]
  }
}

class RedirectHandler {
  constructor (dispatch, maxRedirections, opts, handler) {
    if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
      throw new InvalidArgumentError('maxRedirections must be a positive number')
    }

    util.validateHandler(handler, opts.method, opts.upgrade)

    this.dispatch = dispatch
    this.location = null
    this.abort = null
    this.opts = { ...opts, maxRedirections: 0 } // opts must be a copy
    this.maxRedirections = maxRedirections
    this.handler = handler
    this.history = []
    this.redirectionLimitReached = false

    if (util.isStream(this.opts.body)) {
      // TODO (fix): Provide some way for the user to cache the file to e.g. /tmp
      // so that it can be dispatched again?
      // TODO (fix): Do we need 100-expect support to provide a way to do this properly?
      if (util.bodyLength(this.opts.body) === 0) {
        this.opts.body
          .on('data', function () {
            assert(false)
          })
      }

      if (typeof this.opts.body.readableDidRead !== 'boolean') {
        this.opts.body[kBodyUsed] = false
        EE.prototype.on.call(this.opts.body, 'data', function () {
          this[kBodyUsed] = true
        })
      }
    } else if (this.opts.body && typeof this.opts.body.pipeTo === 'function') {
      // TODO (fix): We can't access ReadableStream internal state
      // to determine whether or not it has been disturbed. This is just
      // a workaround.
      this.opts.body = new BodyAsyncIterable(this.opts.body)
    } else if (
      this.opts.body &&
      typeof this.opts.body !== 'string' &&
      !ArrayBuffer.isView(this.opts.body) &&
      util.isIterable(this.opts.body)
    ) {
      // TODO: Should we allow re-using iterable if !this.opts.idempotent
      // or through some other flag?
      this.opts.body = new BodyAsyncIterable(this.opts.body)
    }
  }

  onConnect (abort) {
    this.abort = abort
    this.handler.onConnect(abort, { history: this.history })
  }

  onUpgrade (statusCode, headers, socket) {
    this.handler.onUpgrade(statusCode, headers, socket)
  }

  onError (error) {
    this.handler.onError(error)
  }

  onHeaders (statusCode, headers, resume, statusText) {
    this.location = this.history.length >= this.maxRedirections || util.isDisturbed(this.opts.body)
      ? null
      : parseLocation(statusCode, headers)

    if (this.opts.throwOnMaxRedirect && this.history.length >= this.maxRedirections) {
      if (this.request) {
        this.request.abort(new Error('max redirects'))
      }

      this.redirectionLimitReached = true
      this.abort(new Error('max redirects'))
      return
    }

    if (this.opts.origin) {
      this.history.push(new URL(this.opts.path, this.opts.origin))
    }

    if (!this.location) {
      return this.handler.onHeaders(statusCode, headers, resume, statusText)
    }

    const { origin, pathname, search } = util.parseURL(new URL(this.location, this.opts.origin && new URL(this.opts.path, this.opts.origin)))
    const path = search ? `${pathname}${search}` : pathname

    // Remove headers referring to the original URL.
    // By default it is Host only, unless it's a 303 (see below), which removes also all Content-* headers.
    // https://tools.ietf.org/html/rfc7231#section-6.4
    this.opts.headers = cleanRequestHeaders(this.opts.headers, statusCode === 303, this.opts.origin !== origin)
    this.opts.path = path
    this.opts.origin = origin
    this.opts.maxRedirections = 0
    this.opts.query = null

    // https://tools.ietf.org/html/rfc7231#section-6.4.4
    // In case of HTTP 303, always replace method to be either HEAD or GET
    if (statusCode === 303 && this.opts.method !== 'HEAD') {
      this.opts.method = 'GET'
      this.opts.body = null
    }
  }

  onData (chunk) {
    if (this.location) {
      /*
        https://tools.ietf.org/html/rfc7231#section-6.4

        TLDR: undici always ignores 3xx response bodies.

        Redirection is used to serve the requested resource from another URL, so it is assumes that
        no body is generated (and thus can be ignored). Even though generating a body is not prohibited.

        For status 301, 302, 303, 307 and 308 (the latter from RFC 7238), the specs mention that the body usually
        (which means it's optional and not mandated) contain just an hyperlink to the value of
        the Location response header, so the body can be ignored safely.

        For status 300, which is "Multiple Choices", the spec mentions both generating a Location
        response header AND a response body with the other possible location to follow.
        Since the spec explicitly chooses not to specify a format for such body and leave it to
        servers and browsers implementors, we ignore the body as there is no specified way to eventually parse it.
      */
    } else {
      return this.handler.onData(chunk)
    }
  }

  onComplete (trailers) {
    if (this.location) {
      /*
        https://tools.ietf.org/html/rfc7231#section-6.4

        TLDR: undici always ignores 3xx response trailers as they are not expected in case of redirections
        and neither are useful if present.

        See comment on onData method above for more detailed information.
      */

      this.location = null
      this.abort = null

      this.dispatch(this.opts, this)
    } else {
      this.handler.onComplete(trailers)
    }
  }

  onBodySent (chunk) {
    if (this.handler.onBodySent) {
      this.handler.onBodySent(chunk)
    }
  }
}

function parseLocation (statusCode, headers) {
  if (redirectableStatusCodes.indexOf(statusCode) === -1) {
    return null
  }

  for (let i = 0; i < headers.length; i += 2) {
    if (headers[i].length === 8 && util.headerNameToString(headers[i]) === 'location') {
      return headers[i + 1]
    }
  }
}

// https://tools.ietf.org/html/rfc7231#section-6.4.4
function shouldRemoveHeader (header, removeContent, unknownOrigin) {
  if (header.length === 4) {
    return util.headerNameToString(header) === 'host'
  }
  if (removeContent && util.headerNameToString(header).startsWith('content-')) {
    return true
  }
  if (unknownOrigin && (header.length === 13 || header.length === 6 || header.length === 19)) {
    const name = util.headerNameToString(header)
    return name === 'authorization' || name === 'cookie' || name === 'proxy-authorization'
  }
  return false
}

// https://tools.ietf.org/html/rfc7231#section-6.4
function cleanRequestHeaders (headers, removeContent, unknownOrigin) {
  const ret = []
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      if (!shouldRemoveHeader(headers[i], removeContent, unknownOrigin)) {
        ret.push(headers[i], headers[i + 1])
      }
    }
  } else if (headers && typeof headers === 'object') {
    for (const key of Object.keys(headers)) {
      if (!shouldRemoveHeader(key, removeContent, unknownOrigin)) {
        ret.push(key, headers[key])
      }
    }
  } else {
    assert(headers == null, 'headers must be an object or an array')
  }
  return ret
}

module.exports = RedirectHandler


/***/ }),

/***/ 5733:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const assert = __nccwpck_require__(8061)

const { kRetryHandlerDefaultRetry } = __nccwpck_require__(46)
const { RequestRetryError } = __nccwpck_require__(8642)
const {
  isDisturbed,
  parseHeaders,
  parseRangeHeader,
  wrapRequestBody
} = __nccwpck_require__(9099)

function calculateRetryAfterHeader (retryAfter) {
  const current = Date.now()
  return new Date(retryAfter).getTime() - current
}

class RetryHandler {
  constructor (opts, handlers) {
    const { retryOptions, ...dispatchOpts } = opts
    const {
      // Retry scoped
      retry: retryFn,
      maxRetries,
      maxTimeout,
      minTimeout,
      timeoutFactor,
      // Response scoped
      methods,
      errorCodes,
      retryAfter,
      statusCodes
    } = retryOptions ?? {}

    this.dispatch = handlers.dispatch
    this.handler = handlers.handler
    this.opts = { ...dispatchOpts, body: wrapRequestBody(opts.body) }
    this.abort = null
    this.aborted = false
    this.retryOpts = {
      retry: retryFn ?? RetryHandler[kRetryHandlerDefaultRetry],
      retryAfter: retryAfter ?? true,
      maxTimeout: maxTimeout ?? 30 * 1000, // 30s,
      minTimeout: minTimeout ?? 500, // .5s
      timeoutFactor: timeoutFactor ?? 2,
      maxRetries: maxRetries ?? 5,
      // What errors we should retry
      methods: methods ?? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE'],
      // Indicates which errors to retry
      statusCodes: statusCodes ?? [500, 502, 503, 504, 429],
      // List of errors to retry
      errorCodes: errorCodes ?? [
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'ENETDOWN',
        'ENETUNREACH',
        'EHOSTDOWN',
        'EHOSTUNREACH',
        'EPIPE',
        'UND_ERR_SOCKET'
      ]
    }

    this.retryCount = 0
    this.retryCountCheckpoint = 0
    this.start = 0
    this.end = null
    this.etag = null
    this.resume = null

    // Handle possible onConnect duplication
    this.handler.onConnect(reason => {
      this.aborted = true
      if (this.abort) {
        this.abort(reason)
      } else {
        this.reason = reason
      }
    })
  }

  onRequestSent () {
    if (this.handler.onRequestSent) {
      this.handler.onRequestSent()
    }
  }

  onUpgrade (statusCode, headers, socket) {
    if (this.handler.onUpgrade) {
      this.handler.onUpgrade(statusCode, headers, socket)
    }
  }

  onConnect (abort) {
    if (this.aborted) {
      abort(this.reason)
    } else {
      this.abort = abort
    }
  }

  onBodySent (chunk) {
    if (this.handler.onBodySent) return this.handler.onBodySent(chunk)
  }

  static [kRetryHandlerDefaultRetry] (err, { state, opts }, cb) {
    const { statusCode, code, headers } = err
    const { method, retryOptions } = opts
    const {
      maxRetries,
      minTimeout,
      maxTimeout,
      timeoutFactor,
      statusCodes,
      errorCodes,
      methods
    } = retryOptions
    const { counter } = state

    // Any code that is not a Undici's originated and allowed to retry
    if (code && code !== 'UND_ERR_REQ_RETRY' && !errorCodes.includes(code)) {
      cb(err)
      return
    }

    // If a set of method are provided and the current method is not in the list
    if (Array.isArray(methods) && !methods.includes(method)) {
      cb(err)
      return
    }

    // If a set of status code are provided and the current status code is not in the list
    if (
      statusCode != null &&
      Array.isArray(statusCodes) &&
      !statusCodes.includes(statusCode)
    ) {
      cb(err)
      return
    }

    // If we reached the max number of retries
    if (counter > maxRetries) {
      cb(err)
      return
    }

    let retryAfterHeader = headers?.['retry-after']
    if (retryAfterHeader) {
      retryAfterHeader = Number(retryAfterHeader)
      retryAfterHeader = Number.isNaN(retryAfterHeader)
        ? calculateRetryAfterHeader(retryAfterHeader)
        : retryAfterHeader * 1e3 // Retry-After is in seconds
    }

    const retryTimeout =
      retryAfterHeader > 0
        ? Math.min(retryAfterHeader, maxTimeout)
        : Math.min(minTimeout * timeoutFactor ** (counter - 1), maxTimeout)

    setTimeout(() => cb(null), retryTimeout)
  }

  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const headers = parseHeaders(rawHeaders)

    this.retryCount += 1

    if (statusCode >= 300) {
      if (this.retryOpts.statusCodes.includes(statusCode) === false) {
        return this.handler.onHeaders(
          statusCode,
          rawHeaders,
          resume,
          statusMessage
        )
      } else {
        this.abort(
          new RequestRetryError('Request failed', statusCode, {
            headers,
            data: {
              count: this.retryCount
            }
          })
        )
        return false
      }
    }

    // Checkpoint for resume from where we left it
    if (this.resume != null) {
      this.resume = null

      // Only Partial Content 206 supposed to provide Content-Range,
      // any other status code that partially consumed the payload
      // should not be retry because it would result in downstream
      // wrongly concatanete multiple responses.
      if (statusCode !== 206 && (this.start > 0 || statusCode !== 200)) {
        this.abort(
          new RequestRetryError('server does not support the range header and the payload was partially consumed', statusCode, {
            headers,
            data: { count: this.retryCount }
          })
        )
        return false
      }

      const contentRange = parseRangeHeader(headers['content-range'])
      // If no content range
      if (!contentRange) {
        this.abort(
          new RequestRetryError('Content-Range mismatch', statusCode, {
            headers,
            data: { count: this.retryCount }
          })
        )
        return false
      }

      // Let's start with a weak etag check
      if (this.etag != null && this.etag !== headers.etag) {
        this.abort(
          new RequestRetryError('ETag mismatch', statusCode, {
            headers,
            data: { count: this.retryCount }
          })
        )
        return false
      }

      const { start, size, end = size - 1 } = contentRange

      assert(this.start === start, 'content-range mismatch')
      assert(this.end == null || this.end === end, 'content-range mismatch')

      this.resume = resume
      return true
    }

    if (this.end == null) {
      if (statusCode === 206) {
        // First time we receive 206
        const range = parseRangeHeader(headers['content-range'])

        if (range == null) {
          return this.handler.onHeaders(
            statusCode,
            rawHeaders,
            resume,
            statusMessage
          )
        }

        const { start, size, end = size - 1 } = range
        assert(
          start != null && Number.isFinite(start),
          'content-range mismatch'
        )
        assert(end != null && Number.isFinite(end), 'invalid content-length')

        this.start = start
        this.end = end
      }

      // We make our best to checkpoint the body for further range headers
      if (this.end == null) {
        const contentLength = headers['content-length']
        this.end = contentLength != null ? Number(contentLength) - 1 : null
      }

      assert(Number.isFinite(this.start))
      assert(
        this.end == null || Number.isFinite(this.end),
        'invalid content-length'
      )

      this.resume = resume
      this.etag = headers.etag != null ? headers.etag : null

      // Weak etags are not useful for comparison nor cache
      // for instance not safe to assume if the response is byte-per-byte
      // equal
      if (this.etag != null && this.etag.startsWith('W/')) {
        this.etag = null
      }

      return this.handler.onHeaders(
        statusCode,
        rawHeaders,
        resume,
        statusMessage
      )
    }

    const err = new RequestRetryError('Request failed', statusCode, {
      headers,
      data: { count: this.retryCount }
    })

    this.abort(err)

    return false
  }

  onData (chunk) {
    this.start += chunk.length

    return this.handler.onData(chunk)
  }

  onComplete (rawTrailers) {
    this.retryCount = 0
    return this.handler.onComplete(rawTrailers)
  }

  onError (err) {
    if (this.aborted || isDisturbed(this.opts.body)) {
      return this.handler.onError(err)
    }

    // We reconcile in case of a mix between network errors
    // and server error response
    if (this.retryCount - this.retryCountCheckpoint > 0) {
      // We count the difference between the last checkpoint and the current retry count
      this.retryCount =
        this.retryCountCheckpoint +
        (this.retryCount - this.retryCountCheckpoint)
    } else {
      this.retryCount += 1
    }

    this.retryOpts.retry(
      err,
      {
        state: { counter: this.retryCount },
        opts: { retryOptions: this.retryOpts, ...this.opts }
      },
      onRetry.bind(this)
    )

    function onRetry (err) {
      if (err != null || this.aborted || isDisturbed(this.opts.body)) {
        return this.handler.onError(err)
      }

      if (this.start !== 0) {
        const headers = { range: `bytes=${this.start}-${this.end ?? ''}` }

        // Weak etag check - weak etags will make comparison algorithms never match
        if (this.etag != null) {
          headers['if-match'] = this.etag
        }

        this.opts = {
          ...this.opts,
          headers: {
            ...this.opts.headers,
            ...headers
          }
        }
      }

      try {
        this.retryCountCheckpoint = this.retryCount
        this.dispatch(this.opts, this)
      } catch (err) {
        this.handler.onError(err)
      }
    }
  }
}

module.exports = RetryHandler


/***/ }),

/***/ 1810:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const { isIP } = __nccwpck_require__(7503)
const { lookup } = __nccwpck_require__(604)
const DecoratorHandler = __nccwpck_require__(2790)
const { InvalidArgumentError, InformationalError } = __nccwpck_require__(8642)
const maxInt = Math.pow(2, 31) - 1

class DNSInstance {
  #maxTTL = 0
  #maxItems = 0
  #records = new Map()
  dualStack = true
  affinity = null
  lookup = null
  pick = null

  constructor (opts) {
    this.#maxTTL = opts.maxTTL
    this.#maxItems = opts.maxItems
    this.dualStack = opts.dualStack
    this.affinity = opts.affinity
    this.lookup = opts.lookup ?? this.#defaultLookup
    this.pick = opts.pick ?? this.#defaultPick
  }

  get full () {
    return this.#records.size === this.#maxItems
  }

  runLookup (origin, opts, cb) {
    const ips = this.#records.get(origin.hostname)

    // If full, we just return the origin
    if (ips == null && this.full) {
      cb(null, origin.origin)
      return
    }

    const newOpts = {
      affinity: this.affinity,
      dualStack: this.dualStack,
      lookup: this.lookup,
      pick: this.pick,
      ...opts.dns,
      maxTTL: this.#maxTTL,
      maxItems: this.#maxItems
    }

    // If no IPs we lookup
    if (ips == null) {
      this.lookup(origin, newOpts, (err, addresses) => {
        if (err || addresses == null || addresses.length === 0) {
          cb(err ?? new InformationalError('No DNS entries found'))
          return
        }

        this.setRecords(origin, addresses)
        const records = this.#records.get(origin.hostname)

        const ip = this.pick(
          origin,
          records,
          newOpts.affinity
        )

        let port
        if (typeof ip.port === 'number') {
          port = `:${ip.port}`
        } else if (origin.port !== '') {
          port = `:${origin.port}`
        } else {
          port = ''
        }

        cb(
          null,
          `${origin.protocol}//${
            ip.family === 6 ? `[${ip.address}]` : ip.address
          }${port}`
        )
      })
    } else {
      // If there's IPs we pick
      const ip = this.pick(
        origin,
        ips,
        newOpts.affinity
      )

      // If no IPs we lookup - deleting old records
      if (ip == null) {
        this.#records.delete(origin.hostname)
        this.runLookup(origin, opts, cb)
        return
      }

      let port
      if (typeof ip.port === 'number') {
        port = `:${ip.port}`
      } else if (origin.port !== '') {
        port = `:${origin.port}`
      } else {
        port = ''
      }

      cb(
        null,
        `${origin.protocol}//${
          ip.family === 6 ? `[${ip.address}]` : ip.address
        }${port}`
      )
    }
  }

  #defaultLookup (origin, opts, cb) {
    lookup(
      origin.hostname,
      {
        all: true,
        family: this.dualStack === false ? this.affinity : 0,
        order: 'ipv4first'
      },
      (err, addresses) => {
        if (err) {
          return cb(err)
        }

        const results = new Map()

        for (const addr of addresses) {
          // On linux we found duplicates, we attempt to remove them with
          // the latest record
          results.set(`${addr.address}:${addr.family}`, addr)
        }

        cb(null, results.values())
      }
    )
  }

  #defaultPick (origin, hostnameRecords, affinity) {
    let ip = null
    const { records, offset } = hostnameRecords

    let family
    if (this.dualStack) {
      if (affinity == null) {
        // Balance between ip families
        if (offset == null || offset === maxInt) {
          hostnameRecords.offset = 0
          affinity = 4
        } else {
          hostnameRecords.offset++
          affinity = (hostnameRecords.offset & 1) === 1 ? 6 : 4
        }
      }

      if (records[affinity] != null && records[affinity].ips.length > 0) {
        family = records[affinity]
      } else {
        family = records[affinity === 4 ? 6 : 4]
      }
    } else {
      family = records[affinity]
    }

    // If no IPs we return null
    if (family == null || family.ips.length === 0) {
      return ip
    }

    if (family.offset == null || family.offset === maxInt) {
      family.offset = 0
    } else {
      family.offset++
    }

    const position = family.offset % family.ips.length
    ip = family.ips[position] ?? null

    if (ip == null) {
      return ip
    }

    if (Date.now() - ip.timestamp > ip.ttl) { // record TTL is already in ms
      // We delete expired records
      // It is possible that they have different TTL, so we manage them individually
      family.ips.splice(position, 1)
      return this.pick(origin, hostnameRecords, affinity)
    }

    return ip
  }

  setRecords (origin, addresses) {
    const timestamp = Date.now()
    const records = { records: { 4: null, 6: null } }
    for (const record of addresses) {
      record.timestamp = timestamp
      if (typeof record.ttl === 'number') {
        // The record TTL is expected to be in ms
        record.ttl = Math.min(record.ttl, this.#maxTTL)
      } else {
        record.ttl = this.#maxTTL
      }

      const familyRecords = records.records[record.family] ?? { ips: [] }

      familyRecords.ips.push(record)
      records.records[record.family] = familyRecords
    }

    this.#records.set(origin.hostname, records)
  }

  getHandler (meta, opts) {
    return new DNSDispatchHandler(this, meta, opts)
  }
}

class DNSDispatchHandler extends DecoratorHandler {
  #state = null
  #opts = null
  #dispatch = null
  #handler = null
  #origin = null

  constructor (state, { origin, handler, dispatch }, opts) {
    super(handler)
    this.#origin = origin
    this.#handler = handler
    this.#opts = { ...opts }
    this.#state = state
    this.#dispatch = dispatch
  }

  onError (err) {
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ECONNREFUSED': {
        if (this.#state.dualStack) {
          // We delete the record and retry
          this.#state.runLookup(this.#origin, this.#opts, (err, newOrigin) => {
            if (err) {
              return this.#handler.onError(err)
            }

            const dispatchOpts = {
              ...this.#opts,
              origin: newOrigin
            }

            this.#dispatch(dispatchOpts, this)
          })

          // if dual-stack disabled, we error out
          return
        }

        this.#handler.onError(err)
        return
      }
      case 'ENOTFOUND':
        this.#state.deleteRecord(this.#origin)
      // eslint-disable-next-line no-fallthrough
      default:
        this.#handler.onError(err)
        break
    }
  }
}

module.exports = interceptorOpts => {
  if (
    interceptorOpts?.maxTTL != null &&
    (typeof interceptorOpts?.maxTTL !== 'number' || interceptorOpts?.maxTTL < 0)
  ) {
    throw new InvalidArgumentError('Invalid maxTTL. Must be a positive number')
  }

  if (
    interceptorOpts?.maxItems != null &&
    (typeof interceptorOpts?.maxItems !== 'number' ||
      interceptorOpts?.maxItems < 1)
  ) {
    throw new InvalidArgumentError(
      'Invalid maxItems. Must be a positive number and greater than zero'
    )
  }

  if (
    interceptorOpts?.affinity != null &&
    interceptorOpts?.affinity !== 4 &&
    interceptorOpts?.affinity !== 6
  ) {
    throw new InvalidArgumentError('Invalid affinity. Must be either 4 or 6')
  }

  if (
    interceptorOpts?.dualStack != null &&
    typeof interceptorOpts?.dualStack !== 'boolean'
  ) {
    throw new InvalidArgumentError('Invalid dualStack. Must be a boolean')
  }

  if (
    interceptorOpts?.lookup != null &&
    typeof interceptorOpts?.lookup !== 'function'
  ) {
    throw new InvalidArgumentError('Invalid lookup. Must be a function')
  }

  if (
    interceptorOpts?.pick != null &&
    typeof interceptorOpts?.pick !== 'function'
  ) {
    throw new InvalidArgumentError('Invalid pick. Must be a function')
  }

  const dualStack = interceptorOpts?.dualStack ?? true
  let affinity
  if (dualStack) {
    affinity = interceptorOpts?.affinity ?? null
  } else {
    affinity = interceptorOpts?.affinity ?? 4
  }

  const opts = {
    maxTTL: interceptorOpts?.maxTTL ?? 10e3, // Expressed in ms
    lookup: interceptorOpts?.lookup ?? null,
    pick: interceptorOpts?.pick ?? null,
    dualStack,
    affinity,
    maxItems: interceptorOpts?.maxItems ?? Infinity
  }

  const instance = new DNSInstance(opts)

  return dispatch => {
    return function dnsInterceptor (origDispatchOpts, handler) {
      const origin =
        origDispatchOpts.origin.constructor === URL
          ? origDispatchOpts.origin
          : new URL(origDispatchOpts.origin)

      if (isIP(origin.hostname) !== 0) {
        return dispatch(origDispatchOpts, handler)
      }

      instance.runLookup(origin, origDispatchOpts, (err, newOrigin) => {
        if (err) {
          return handler.onError(err)
        }

        let dispatchOpts = null
        dispatchOpts = {
          ...origDispatchOpts,
          servername: origin.hostname, // For SNI on TLS
          origin: newOrigin,
          headers: {
            host: origin.hostname,
            ...origDispatchOpts.headers
          }
        }

        dispatch(
          dispatchOpts,
          instance.getHandler({ origin, dispatch, handler }, origDispatchOpts)
        )
      })

      return true
    }
  }
}


/***/ }),

/***/ 1021:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const util = __nccwpck_require__(9099)
const { InvalidArgumentError, RequestAbortedError } = __nccwpck_require__(8642)
const DecoratorHandler = __nccwpck_require__(2790)

class DumpHandler extends DecoratorHandler {
  #maxSize = 1024 * 1024
  #abort = null
  #dumped = false
  #aborted = false
  #size = 0
  #reason = null
  #handler = null

  constructor ({ maxSize }, handler) {
    super(handler)

    if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) {
      throw new InvalidArgumentError('maxSize must be a number greater than 0')
    }

    this.#maxSize = maxSize ?? this.#maxSize
    this.#handler = handler
  }

  onConnect (abort) {
    this.#abort = abort

    this.#handler.onConnect(this.#customAbort.bind(this))
  }

  #customAbort (reason) {
    this.#aborted = true
    this.#reason = reason
  }

  // TODO: will require adjustment after new hooks are out
  onHeaders (statusCode, rawHeaders, resume, statusMessage) {
    const headers = util.parseHeaders(rawHeaders)
    const contentLength = headers['content-length']

    if (contentLength != null && contentLength > this.#maxSize) {
      throw new RequestAbortedError(
        `Response size (${contentLength}) larger than maxSize (${
          this.#maxSize
        })`
      )
    }

    if (this.#aborted) {
      return true
    }

    return this.#handler.onHeaders(
      statusCode,
      rawHeaders,
      resume,
      statusMessage
    )
  }

  onError (err) {
    if (this.#dumped) {
      return
    }

    err = this.#reason ?? err

    this.#handler.onError(err)
  }

  onData (chunk) {
    this.#size = this.#size + chunk.length

    if (this.#size >= this.#maxSize) {
      this.#dumped = true

      if (this.#aborted) {
        this.#handler.onError(this.#reason)
      } else {
        this.#handler.onComplete([])
      }
    }

    return true
  }

  onComplete (trailers) {
    if (this.#dumped) {
      return
    }

    if (this.#aborted) {
      this.#handler.onError(this.reason)
      return
    }

    this.#handler.onComplete(trailers)
  }
}

function createDumpInterceptor (
  { maxSize: defaultMaxSize } = {
    maxSize: 1024 * 1024
  }
) {
  return dispatch => {
    return function Intercept (opts, handler) {
      const { dumpMaxSize = defaultMaxSize } =
        opts

      const dumpHandler = new DumpHandler(
        { maxSize: dumpMaxSize },
        handler
      )

      return dispatch(opts, dumpHandler)
    }
  }
}

module.exports = createDumpInterceptor


/***/ }),

/***/ 5292:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const RedirectHandler = __nccwpck_require__(5025)

function createRedirectInterceptor ({ maxRedirections: defaultMaxRedirections }) {
  return (dispatch) => {
    return function Intercept (opts, handler) {
      const { maxRedirections = defaultMaxRedirections } = opts

      if (!maxRedirections) {
        return dispatch(opts, handler)
      }

      const redirectHandler = new RedirectHandler(dispatch, maxRedirections, opts, handler)
      opts = { ...opts, maxRedirections: 0 } // Stop sub dispatcher from also redirecting.
      return dispatch(opts, redirectHandler)
    }
  }
}

module.exports = createRedirectInterceptor


/***/ }),

/***/ 2842:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const RedirectHandler = __nccwpck_require__(5025)

module.exports = opts => {
  const globalMaxRedirections = opts?.maxRedirections
  return dispatch => {
    return function redirectInterceptor (opts, handler) {
      const { maxRedirections = globalMaxRedirections, ...baseOpts } = opts

      if (!maxRedirections) {
        return dispatch(opts, handler)
      }

      const redirectHandler = new RedirectHandler(
        dispatch,
        maxRedirections,
        opts,
        handler
      )

      return dispatch(baseOpts, redirectHandler)
    }
  }
}


/***/ }),

/***/ 1356:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const RetryHandler = __nccwpck_require__(5733)

module.exports = globalOpts => {
  return dispatch => {
    return function retryInterceptor (opts, handler) {
      return dispatch(
        opts,
        new RetryHandler(
          { ...opts, retryOptions: { ...globalOpts, ...opts.retryOptions } },
          {
            handler,
            dispatch
          }
        )
      )
    }
  }
}


/***/ }),

/***/ 9632:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SPECIAL_HEADERS = exports.HEADER_STATE = exports.MINOR = exports.MAJOR = exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS = exports.TOKEN = exports.STRICT_TOKEN = exports.HEX = exports.URL_CHAR = exports.STRICT_URL_CHAR = exports.USERINFO_CHARS = exports.MARK = exports.ALPHANUM = exports.NUM = exports.HEX_MAP = exports.NUM_MAP = exports.ALPHA = exports.FINISH = exports.H_METHOD_MAP = exports.METHOD_MAP = exports.METHODS_RTSP = exports.METHODS_ICE = exports.METHODS_HTTP = exports.METHODS = exports.LENIENT_FLAGS = exports.FLAGS = exports.TYPE = exports.ERROR = void 0;
const utils_1 = __nccwpck_require__(1211);
// C headers
var ERROR;
(function (ERROR) {
    ERROR[ERROR["OK"] = 0] = "OK";
    ERROR[ERROR["INTERNAL"] = 1] = "INTERNAL";
    ERROR[ERROR["STRICT"] = 2] = "STRICT";
    ERROR[ERROR["LF_EXPECTED"] = 3] = "LF_EXPECTED";
    ERROR[ERROR["UNEXPECTED_CONTENT_LENGTH"] = 4] = "UNEXPECTED_CONTENT_LENGTH";
    ERROR[ERROR["CLOSED_CONNECTION"] = 5] = "CLOSED_CONNECTION";
    ERROR[ERROR["INVALID_METHOD"] = 6] = "INVALID_METHOD";
    ERROR[ERROR["INVALID_URL"] = 7] = "INVALID_URL";
    ERROR[ERROR["INVALID_CONSTANT"] = 8] = "INVALID_CONSTANT";
    ERROR[ERROR["INVALID_VERSION"] = 9] = "INVALID_VERSION";
    ERROR[ERROR["INVALID_HEADER_TOKEN"] = 10] = "INVALID_HEADER_TOKEN";
    ERROR[ERROR["INVALID_CONTENT_LENGTH"] = 11] = "INVALID_CONTENT_LENGTH";
    ERROR[ERROR["INVALID_CHUNK_SIZE"] = 12] = "INVALID_CHUNK_SIZE";
    ERROR[ERROR["INVALID_STATUS"] = 13] = "INVALID_STATUS";
    ERROR[ERROR["INVALID_EOF_STATE"] = 14] = "INVALID_EOF_STATE";
    ERROR[ERROR["INVALID_TRANSFER_ENCODING"] = 15] = "INVALID_TRANSFER_ENCODING";
    ERROR[ERROR["CB_MESSAGE_BEGIN"] = 16] = "CB_MESSAGE_BEGIN";
    ERROR[ERROR["CB_HEADERS_COMPLETE"] = 17] = "CB_HEADERS_COMPLETE";
    ERROR[ERROR["CB_MESSAGE_COMPLETE"] = 18] = "CB_MESSAGE_COMPLETE";
    ERROR[ERROR["CB_CHUNK_HEADER"] = 19] = "CB_CHUNK_HEADER";
    ERROR[ERROR["CB_CHUNK_COMPLETE"] = 20] = "CB_CHUNK_COMPLETE";
    ERROR[ERROR["PAUSED"] = 21] = "PAUSED";
    ERROR[ERROR["PAUSED_UPGRADE"] = 22] = "PAUSED_UPGRADE";
    ERROR[ERROR["PAUSED_H2_UPGRADE"] = 23] = "PAUSED_H2_UPGRADE";
    ERROR[ERROR["USER"] = 24] = "USER";
})(ERROR = exports.ERROR || (exports.ERROR = {}));
var TYPE;
(function (TYPE) {
    TYPE[TYPE["BOTH"] = 0] = "BOTH";
    TYPE[TYPE["REQUEST"] = 1] = "REQUEST";
    TYPE[TYPE["RESPONSE"] = 2] = "RESPONSE";
})(TYPE = exports.TYPE || (exports.TYPE = {}));
var FLAGS;
(function (FLAGS) {
    FLAGS[FLAGS["CONNECTION_KEEP_ALIVE"] = 1] = "CONNECTION_KEEP_ALIVE";
    FLAGS[FLAGS["CONNECTION_CLOSE"] = 2] = "CONNECTION_CLOSE";
    FLAGS[FLAGS["CONNECTION_UPGRADE"] = 4] = "CONNECTION_UPGRADE";
    FLAGS[FLAGS["CHUNKED"] = 8] = "CHUNKED";
    FLAGS[FLAGS["UPGRADE"] = 16] = "UPGRADE";
    FLAGS[FLAGS["CONTENT_LENGTH"] = 32] = "CONTENT_LENGTH";
    FLAGS[FLAGS["SKIPBODY"] = 64] = "SKIPBODY";
    FLAGS[FLAGS["TRAILING"] = 128] = "TRAILING";
    // 1 << 8 is unused
    FLAGS[FLAGS["TRANSFER_ENCODING"] = 512] = "TRANSFER_ENCODING";
})(FLAGS = exports.FLAGS || (exports.FLAGS = {}));
var LENIENT_FLAGS;
(function (LENIENT_FLAGS) {
    LENIENT_FLAGS[LENIENT_FLAGS["HEADERS"] = 1] = "HEADERS";
    LENIENT_FLAGS[LENIENT_FLAGS["CHUNKED_LENGTH"] = 2] = "CHUNKED_LENGTH";
    LENIENT_FLAGS[LENIENT_FLAGS["KEEP_ALIVE"] = 4] = "KEEP_ALIVE";
})(LENIENT_FLAGS = exports.LENIENT_FLAGS || (exports.LENIENT_FLAGS = {}));
var METHODS;
(function (METHODS) {
    METHODS[METHODS["DELETE"] = 0] = "DELETE";
    METHODS[METHODS["GET"] = 1] = "GET";
    METHODS[METHODS["HEAD"] = 2] = "HEAD";
    METHODS[METHODS["POST"] = 3] = "POST";
    METHODS[METHODS["PUT"] = 4] = "PUT";
    /* pathological */
    METHODS[METHODS["CONNECT"] = 5] = "CONNECT";
    METHODS[METHODS["OPTIONS"] = 6] = "OPTIONS";
    METHODS[METHODS["TRACE"] = 7] = "TRACE";
    /* WebDAV */
    METHODS[METHODS["COPY"] = 8] = "COPY";
    METHODS[METHODS["LOCK"] = 9] = "LOCK";
    METHODS[METHODS["MKCOL"] = 10] = "MKCOL";
    METHODS[METHODS["MOVE"] = 11] = "MOVE";
    METHODS[METHODS["PROPFIND"] = 12] = "PROPFIND";
    METHODS[METHODS["PROPPATCH"] = 13] = "PROPPATCH";
    METHODS[METHODS["SEARCH"] = 14] = "SEARCH";
    METHODS[METHODS["UNLOCK"] = 15] = "UNLOCK";
    METHODS[METHODS["BIND"] = 16] = "BIND";
    METHODS[METHODS["REBIND"] = 17] = "REBIND";
    METHODS[METHODS["UNBIND"] = 18] = "UNBIND";
    METHODS[METHODS["ACL"] = 19] = "ACL";
    /* subversion */
    METHODS[METHODS["REPORT"] = 20] = "REPORT";
    METHODS[METHODS["MKACTIVITY"] = 21] = "MKACTIVITY";
    METHODS[METHODS["CHECKOUT"] = 22] = "CHECKOUT";
    METHODS[METHODS["MERGE"] = 23] = "MERGE";
    /* upnp */
    METHODS[METHODS["M-SEARCH"] = 24] = "M-SEARCH";
    METHODS[METHODS["NOTIFY"] = 25] = "NOTIFY";
    METHODS[METHODS["SUBSCRIBE"] = 26] = "SUBSCRIBE";
    METHODS[METHODS["UNSUBSCRIBE"] = 27] = "UNSUBSCRIBE";
    /* RFC-5789 */
    METHODS[METHODS["PATCH"] = 28] = "PATCH";
    METHODS[METHODS["PURGE"] = 29] = "PURGE";
    /* CalDAV */
    METHODS[METHODS["MKCALENDAR"] = 30] = "MKCALENDAR";
    /* RFC-2068, section 19.6.1.2 */
    METHODS[METHODS["LINK"] = 31] = "LINK";
    METHODS[METHODS["UNLINK"] = 32] = "UNLINK";
    /* icecast */
    METHODS[METHODS["SOURCE"] = 33] = "SOURCE";
    /* RFC-7540, section 11.6 */
    METHODS[METHODS["PRI"] = 34] = "PRI";
    /* RFC-2326 RTSP */
    METHODS[METHODS["DESCRIBE"] = 35] = "DESCRIBE";
    METHODS[METHODS["ANNOUNCE"] = 36] = "ANNOUNCE";
    METHODS[METHODS["SETUP"] = 37] = "SETUP";
    METHODS[METHODS["PLAY"] = 38] = "PLAY";
    METHODS[METHODS["PAUSE"] = 39] = "PAUSE";
    METHODS[METHODS["TEARDOWN"] = 40] = "TEARDOWN";
    METHODS[METHODS["GET_PARAMETER"] = 41] = "GET_PARAMETER";
    METHODS[METHODS["SET_PARAMETER"] = 42] = "SET_PARAMETER";
    METHODS[METHODS["REDIRECT"] = 43] = "REDIRECT";
    METHODS[METHODS["RECORD"] = 44] = "RECORD";
    /* RAOP */
    METHODS[METHODS["FLUSH"] = 45] = "FLUSH";
})(METHODS = exports.METHODS || (exports.METHODS = {}));
exports.METHODS_HTTP = [
    METHODS.DELETE,
    METHODS.GET,
    METHODS.HEAD,
    METHODS.POST,
    METHODS.PUT,
    METHODS.CONNECT,
    METHODS.OPTIONS,
    METHODS.TRACE,
    METHODS.COPY,
    METHODS.LOCK,
    METHODS.MKCOL,
    METHODS.MOVE,
    METHODS.PROPFIND,
    METHODS.PROPPATCH,
    METHODS.SEARCH,
    METHODS.UNLOCK,
    METHODS.BIND,
    METHODS.REBIND,
    METHODS.UNBIND,
    METHODS.ACL,
    METHODS.REPORT,
    METHODS.MKACTIVITY,
    METHODS.CHECKOUT,
    METHODS.MERGE,
    METHODS['M-SEARCH'],
    METHODS.NOTIFY,
    METHODS.SUBSCRIBE,
    METHODS.UNSUBSCRIBE,
    METHODS.PATCH,
    METHODS.PURGE,
    METHODS.MKCALENDAR,
    METHODS.LINK,
    METHODS.UNLINK,
    METHODS.PRI,
    // TODO(indutny): should we allow it with HTTP?
    METHODS.SOURCE,
];
exports.METHODS_ICE = [
    METHODS.SOURCE,
];
exports.METHODS_RTSP = [
    METHODS.OPTIONS,
    METHODS.DESCRIBE,
    METHODS.ANNOUNCE,
    METHODS.SETUP,
    METHODS.PLAY,
    METHODS.PAUSE,
    METHODS.TEARDOWN,
    METHODS.GET_PARAMETER,
    METHODS.SET_PARAMETER,
    METHODS.REDIRECT,
    METHODS.RECORD,
    METHODS.FLUSH,
    // For AirPlay
    METHODS.GET,
    METHODS.POST,
];
exports.METHOD_MAP = utils_1.enumToMap(METHODS);
exports.H_METHOD_MAP = {};
Object.keys(exports.METHOD_MAP).forEach((key) => {
    if (/^H/.test(key)) {
        exports.H_METHOD_MAP[key] = exports.METHOD_MAP[key];
    }
});
var FINISH;
(function (FINISH) {
    FINISH[FINISH["SAFE"] = 0] = "SAFE";
    FINISH[FINISH["SAFE_WITH_CB"] = 1] = "SAFE_WITH_CB";
    FINISH[FINISH["UNSAFE"] = 2] = "UNSAFE";
})(FINISH = exports.FINISH || (exports.FINISH = {}));
exports.ALPHA = [];
for (let i = 'A'.charCodeAt(0); i <= 'Z'.charCodeAt(0); i++) {
    // Upper case
    exports.ALPHA.push(String.fromCharCode(i));
    // Lower case
    exports.ALPHA.push(String.fromCharCode(i + 0x20));
}
exports.NUM_MAP = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4,
    5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
};
exports.HEX_MAP = {
    0: 0, 1: 1, 2: 2, 3: 3, 4: 4,
    5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
    A: 0XA, B: 0XB, C: 0XC, D: 0XD, E: 0XE, F: 0XF,
    a: 0xa, b: 0xb, c: 0xc, d: 0xd, e: 0xe, f: 0xf,
};
exports.NUM = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
];
exports.ALPHANUM = exports.ALPHA.concat(exports.NUM);
exports.MARK = ['-', '_', '.', '!', '~', '*', '\'', '(', ')'];
exports.USERINFO_CHARS = exports.ALPHANUM
    .concat(exports.MARK)
    .concat(['%', ';', ':', '&', '=', '+', '$', ',']);
// TODO(indutny): use RFC
exports.STRICT_URL_CHAR = [
    '!', '"', '$', '%', '&', '\'',
    '(', ')', '*', '+', ',', '-', '.', '/',
    ':', ';', '<', '=', '>',
    '@', '[', '\\', ']', '^', '_',
    '`',
    '{', '|', '}', '~',
].concat(exports.ALPHANUM);
exports.URL_CHAR = exports.STRICT_URL_CHAR
    .concat(['\t', '\f']);
// All characters with 0x80 bit set to 1
for (let i = 0x80; i <= 0xff; i++) {
    exports.URL_CHAR.push(i);
}
exports.HEX = exports.NUM.concat(['a', 'b', 'c', 'd', 'e', 'f', 'A', 'B', 'C', 'D', 'E', 'F']);
/* Tokens as defined by rfc 2616. Also lowercases them.
 *        token       = 1*<any CHAR except CTLs or separators>
 *     separators     = "(" | ")" | "<" | ">" | "@"
 *                    | "," | ";" | ":" | "\" | <">
 *                    | "/" | "[" | "]" | "?" | "="
 *                    | "{" | "}" | SP | HT
 */
exports.STRICT_TOKEN = [
    '!', '#', '$', '%', '&', '\'',
    '*', '+', '-', '.',
    '^', '_', '`',
    '|', '~',
].concat(exports.ALPHANUM);
exports.TOKEN = exports.STRICT_TOKEN.concat([' ']);
/*
 * Verify that a char is a valid visible (printable) US-ASCII
 * character or %x80-FF
 */
exports.HEADER_CHARS = ['\t'];
for (let i = 32; i <= 255; i++) {
    if (i !== 127) {
        exports.HEADER_CHARS.push(i);
    }
}
// ',' = \x44
exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS.filter((c) => c !== 44);
exports.MAJOR = exports.NUM_MAP;
exports.MINOR = exports.MAJOR;
var HEADER_STATE;
(function (HEADER_STATE) {
    HEADER_STATE[HEADER_STATE["GENERAL"] = 0] = "GENERAL";
    HEADER_STATE[HEADER_STATE["CONNECTION"] = 1] = "CONNECTION";
    HEADER_STATE[HEADER_STATE["CONTENT_LENGTH"] = 2] = "CONTENT_LENGTH";
    HEADER_STATE[HEADER_STATE["TRANSFER_ENCODING"] = 3] = "TRANSFER_ENCODING";
    HEADER_STATE[HEADER_STATE["UPGRADE"] = 4] = "UPGRADE";
    HEADER_STATE[HEADER_STATE["CONNECTION_KEEP_ALIVE"] = 5] = "CONNECTION_KEEP_ALIVE";
    HEADER_STATE[HEADER_STATE["CONNECTION_CLOSE"] = 6] = "CONNECTION_CLOSE";
    HEADER_STATE[HEADER_STATE["CONNECTION_UPGRADE"] = 7] = "CONNECTION_UPGRADE";
    HEADER_STATE[HEADER_STATE["TRANSFER_ENCODING_CHUNKED"] = 8] = "TRANSFER_ENCODING_CHUNKED";
})(HEADER_STATE = exports.HEADER_STATE || (exports.HEADER_STATE = {}));
exports.SPECIAL_HEADERS = {
    'connection': HEADER_STATE.CONNECTION,
    'content-length': HEADER_STATE.CONTENT_LENGTH,
    'proxy-connection': HEADER_STATE.CONNECTION,
    'transfer-encoding': HEADER_STATE.TRANSFER_ENCODING,
    'upgrade': HEADER_STATE.UPGRADE,
};
//# sourceMappingURL=constants.js.map

/***/ }),

/***/ 1565:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Buffer } = __nccwpck_require__(2254)

module.exports = Buffer.from('AGFzbQEAAAABJwdgAX8Bf2ADf39/AX9gAX8AYAJ/fwBgBH9/f38Bf2AAAGADf39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQAEA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAy0sBQYAAAIAAAAAAAACAQIAAgICAAADAAAAAAMDAwMBAQEBAQEBAQEAAAIAAAAEBQFwARISBQMBAAIGCAF/AUGA1AQLB9EFIgZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAIGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAJGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQAvDGxsaHR0cF9hbGxvYwALBm1hbGxvYwAxC2xsaHR0cF9mcmVlAAwEZnJlZQAMD2xsaHR0cF9nZXRfdHlwZQANFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAOFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAPEWxsaHR0cF9nZXRfbWV0aG9kABAWbGxodHRwX2dldF9zdGF0dXNfY29kZQAREmxsaHR0cF9nZXRfdXBncmFkZQASDGxsaHR0cF9yZXNldAATDmxsaHR0cF9leGVjdXRlABQUbGxodHRwX3NldHRpbmdzX2luaXQAFQ1sbGh0dHBfZmluaXNoABYMbGxodHRwX3BhdXNlABcNbGxodHRwX3Jlc3VtZQAYG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAZEGxsaHR0cF9nZXRfZXJybm8AGhdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAbF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uABwUbGxodHRwX2dldF9lcnJvcl9wb3MAHRFsbGh0dHBfZXJybm9fbmFtZQAeEmxsaHR0cF9tZXRob2RfbmFtZQAfEmxsaHR0cF9zdGF0dXNfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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PgtBhwEMPQtBiAEMPAtBiQEMOwtBigEMOgtBiwEMOQtBjAEMOAtBjQEMNwtBjgEMNgtBjwEMNQtBkAEMNAtBkQEMMwtBkgEMMgtBkwEMMQtBlAEMMAtBlQEMLwtBlgEMLgtBlwEMLQtBmAEMLAtBmQEMKwtBmgEMKgtBmwEMKQtBnAEMKAtBnQEMJwtBngEMJgtBnwEMJQtBoAEMJAtBoQEMIwtBogEMIgtBowEMIQtBpAEMIAtBpQEMHwtBpgEMHgtBpwEMHQtBqAEMHAtBqQEMGwtBqgEMGgtBqwEMGQtBrAEMGAtBrQEMFwtBrgEMFgtBAQwVC0GvAQwUC0GwAQwTC0GxAQwSC0GzAQwRC0GyAQwQC0G0AQwPC0G1AQwOC0G2AQwNC0G3AQwMC0G4AQwLC0G5AQwKC0G6AQwJC0G7AQwIC0HGAQwHC0G8AQwGC0G9AQwFC0G+AQwEC0G/AQwDC0HAAQwCC0HCAQwBC0HBAQshAwNAAkACQAJAAkACQAJAAkACQAJAIAICfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgAgJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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iQEhAwykAgtBASABLQAAQd8ARw1nGiABQQFqIQEMXgtBigEhAyABIARGDaICIAIoAgAiACAEIAFraiEFIAEgAGtBAWohBgNAIAEtAAAgAEGMzwBqLQAARw1kIABBAUYN+gEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMogILQYsBIQMgASAERg2hAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGOzwBqLQAARw1kIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyiAgsgAkEANgIAIAZBAWohAUECDGULQYwBIQMgASAERg2gAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHwzwBqLQAARw1jIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyhAgsgAkEANgIAIAZBAWohAUEfDGQLQY0BIQMgASAERg2fAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHyzwBqLQAARw1iIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAygAgsgAkEANgIAIAZBAWohAUEJDGMLIAEgBEYEQEGOASEDDJ8CCwJAAkAgAS0AAEHJAGsOBwBiYmJiYgFiCyABQQFqIQFB+AAhAwyGAgsgAUEBaiEBQfkAIQMMhQILQY8BIQMgASAERg2dAiACKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEGRzwBqLQAARw1gIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyeAgsgAkEANgIAIAZBAWohAUEYDGELQZABIQMgASAERg2cAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGXzwBqLQAARw1fIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAydAgsgAkEANgIAIAZBAWohAUEXDGALQZEBIQMgASAERg2bAiACKAIAIgAgBCABa2ohBSABIABrQQZqIQYCQANAIAEtAAAgAEGazwBqLQAARw1eIABBBkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAycAgsgAkEANgIAIAZBAWohAUEV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JSIARQ0RIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMtAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0gIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMswELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0iIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMsgELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0OIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMsQELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0dIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMsAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0fIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMrwELIABBP0cNASABQQFqCyEBQQUhAwyUAQtBACEDIAJBADYCHCACIAE2AhQgAkH9EjYCECACQQc2AgwMrAELIAJBADYCHCACIAE2AhQgAkHcCDYCECACQQc2AgxBACEDDKsBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNByACQeUANgIcIAIgATYCFCACIAA2AgxBACEDDKoBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNFiACQdMANgIcIAIgATYCFCACIAA2AgxBACEDDKkBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNGCACQdIANgIcIAIgATYCFCACIAA2AgxBACEDDKgBCyACQQA2AhwgAiABNgIUIAJBxgo2AhAgAkEHNgIMQQAhAwynAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQMgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwymAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRIgAkHTADYCHCACIAE2AhQgAiAANgIMQQAhAwylAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRQgAkHSADYCHCACIAE2AhQgAiAANgIMQQAhAwykAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQAgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwyjAQtB1QAhAwyJAQsgAEEVRwRAIAJBADYCHCACIAE2AhQgAkG5DTYCECACQRo2AgxB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AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABB5ABrDvQDY2IAAWFhYWFhYQIDBAVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhBgcICQoLDA0OD2FhYWFhEGFhYWFhYWFhYWFhEWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYRITFBUWFxgZGhthYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2YTc4OTphYWFhYWFhYTthYWE8YWFhYT0+P2FhYWFhYWFhQGFhQWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYUJDREVGR0hJSktMTU5PUFFSU2FhYWFhYWFhVFVWV1hZWlthXF1hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFeYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhX2BhC0HhJw8LQaQhDwtByywPC0H+MQ8LQcAkDwtBqyQPC0GNKA8LQeImDwtBgDAPC0G5Lw8LQdckDwtB7x8PC0HhHw8LQfofDwtB8iAPC0GoLw8LQa4yDwtBiDAPC0HsJw8LQYIiDwtBjh0PC0HQLg8LQcojDwtBxTIPC0HfHA8LQdIcDwtBxCAPC0HXIA8LQaIfDwtB7S4PC0GrMA8LQdQlDwtBzC4PC0H6Lg8LQfwrDwtB0jAPC0HxHQ8LQbsgDwtB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CABB3AgLii1JbnZhbGlkIGNoYXIgaW4gdXJsIHF1ZXJ5AFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fYm9keQBDb250ZW50LUxlbmd0aCBvdmVyZmxvdwBDaHVuayBzaXplIG92ZXJmbG93AFJlc3BvbnNlIG92ZXJmbG93AEludmFsaWQgbWV0aG9kIGZvciBIVFRQL3gueCByZXF1ZXN0AEludmFsaWQgbWV0aG9kIGZvciBSVFNQL3gueCByZXF1ZXN0AEV4cGVjdGVkIFNPVVJDRSBtZXRob2QgZm9yIElDRS94LnggcmVxdWVzdABJbnZhbGlkIGNoYXIgaW4gdXJsIGZyYWdtZW50IHN0YXJ0AEV4cGVjdGVkIGRvdABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3N0YXR1cwBJbnZhbGlkIHJlc3BvbnNlIHN0YXR1cwBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBleHRlbnNpb25zAFVzZXIgY2FsbGJhY2sgZXJyb3IAYG9uX3Jlc2V0YCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfaGVhZGVyYCBjYWxsYmFjayBlcnJvcgBgb25fbWVzc2FnZV9iZWdpbmAgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2V4dGVuc2lvbl92YWx1ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3N0YXR1c19jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3ZlcnNpb25fY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl91cmxfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX2hlYWRlcl92YWx1ZV9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX21lc3NhZ2VfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXRob2RfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9oZWFkZXJfZmllbGRfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19leHRlbnNpb25fbmFtZWAgY2FsbGJhY2sgZXJyb3IAVW5leHBlY3RlZCBjaGFyIGluIHVybCBzZXJ2ZXIASW52YWxpZCBoZWFkZXIgdmFsdWUgY2hhcgBJbnZhbGlkIGhlYWRlciBmaWVsZCBjaGFyAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fdmVyc2lvbgBJbnZhbGlkIG1pbm9yIHZlcnNpb24ASW52YWxpZCBtYWpvciB2ZXJzaW9uAEV4cGVjdGVkIHNwYWNlIGFmdGVyIHZlcnNpb24ARXhwZWN0ZWQgQ1JMRiBhZnRlciB2ZXJzaW9uAEludmFsaWQgSFRUUCB2ZXJzaW9uAEludmFsaWQgaGVhZGVyIHRva2VuAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fdXJsAEludmFsaWQgY2hhcmFjdGVycyBpbiB1cmwAVW5leHBlY3RlZCBzdGFydCBjaGFyIGluIHVybABEb3VibGUgQCBpbiB1cmwARW1wdHkgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyYWN0ZXIgaW4gQ29udGVudC1MZW5ndGgARHVwbGljYXRlIENvbnRlbnQtTGVuZ3RoAEludmFsaWQgY2hhciBpbiB1cmwgcGF0aABDb250ZW50LUxlbmd0aCBjYW4ndCBiZSBwcmVzZW50IHdpdGggVHJhbnNmZXItRW5jb2RpbmcASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgc2l6ZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl92YWx1ZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2NodW5rX2V4dGVuc2lvbl92YWx1ZQBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBleHRlbnNpb25zIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgTEYgYWZ0ZXIgaGVhZGVyIHZhbHVlAEludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYCBoZWFkZXIgdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBxdW90ZSB2YWx1ZQBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBleHRlbnNpb25zIHF1b3RlZCB2YWx1ZQBQYXVzZWQgYnkgb25faGVhZGVyc19jb21wbGV0ZQBJbnZhbGlkIEVPRiBzdGF0ZQBvbl9yZXNldCBwYXVzZQBvbl9jaHVua19oZWFkZXIgcGF1c2UAb25fbWVzc2FnZV9iZWdpbiBwYXVzZQBvbl9jaHVua19leHRlbnNpb25fdmFsdWUgcGF1c2UAb25fc3RhdHVzX2NvbXBsZXRlIHBhdXNlAG9uX3ZlcnNpb25fY29tcGxldGUgcGF1c2UAb25fdXJsX2NvbXBsZXRlIHBhdXNlAG9uX2NodW5rX2NvbXBsZXRlIHBhdXNlAG9uX2hlYWRlcl92YWx1ZV9jb21wbGV0ZSBwYXVzZQBvbl9tZXNzYWdlX2NvbXBsZXRlIHBhdXNlAG9uX21ldGhvZF9jb21wbGV0ZSBwYXVzZQBvbl9oZWFkZXJfZmllbGRfY29tcGxldGUgcGF1c2UAb25fY2h1bmtfZXh0ZW5zaW9uX25hbWUgcGF1c2UAVW5leHBlY3RlZCBzcGFjZSBhZnRlciBzdGFydCBsaW5lAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fY2h1bmtfZXh0ZW5zaW9uX25hbWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBuYW1lAFBhdXNlIG9uIENPTk5FQ1QvVXBncmFkZQBQYXVzZSBvbiBQUkkvVXBncmFkZQBFeHBlY3RlZCBIVFRQLzIgQ29ubmVjdGlvbiBQcmVmYWNlAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fbWV0aG9kAEV4cGVjdGVkIHNwYWNlIGFmdGVyIG1ldGhvZABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl9maWVsZABQYXVzZWQASW52YWxpZCB3b3JkIGVuY291bnRlcmVkAEludmFsaWQgbWV0aG9kIGVuY291bnRlcmVkAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2NoZW1hAFJlcXVlc3QgaGFzIGludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYABTV0lUQ0hfUFJPWFkAVVNFX1BST1hZAE1LQUNUSVZJVFkAVU5QUk9DRVNTQUJMRV9FTlRJVFkAQ09QWQBNT1ZFRF9QRVJNQU5FTlRMWQBUT09fRUFSTFkATk9USUZZAEZBSUxFRF9ERVBFTkRFTkNZAEJBRF9HQVRFV0FZAFBMQVkAUFVUAENIRUNLT1VUAEdBVEVXQVlfVElNRU9VVABSRVFVRVNUX1RJTUVPVVQATkVUV09SS19DT05ORUNUX1RJTUVPVVQAQ09OTkVDVElPTl9USU1FT1VUAExPR0lOX1RJTUVPVVQATkVUV09SS19SRUFEX1RJTUVPVVQAUE9TVABNSVNESVJFQ1RFRF9SRVFVRVNUAENMSUVOVF9DTE9TRURfUkVRVUVTVABDTElFTlRfQ0xPU0VEX0xPQURfQkFMQU5DRURfUkVRVUVTVABCQURfUkVRVUVTVABIVFRQX1JFUVVFU1RfU0VOVF9UT19IVFRQU19QT1JUAFJFUE9SVABJTV9BX1RFQVBPVABSRVNFVF9DT05URU5UAE5PX0NPTlRFTlQAUEFSVElBTF9DT05URU5UAEhQRV9JTlZBTElEX0NPTlNUQU5UAEhQRV9DQl9SRVNFVABHRVQASFBFX1NUUklDVABDT05GTElDVABURU1QT1JBUllfUkVESVJFQ1QAUEVSTUFORU5UX1JFRElSRUNUAENPTk5FQ1QATVVMVElfU1RBVFVTAEhQRV9JTlZBTElEX1NUQVRVUwBUT09fTUFOWV9SRVFVRVNUUwBFQVJMWV9ISU5UUwBVTkFWQUlMQUJMRV9GT1JfTEVHQUxfUkVBU09OUwBPUFRJT05TAFNXSVRDSElOR19QUk9UT0NPTFMAVkFSSUFOVF9BTFNPX05FR09USUFURVMATVVMVElQTEVfQ0hPSUNFUwBJTlRFUk5BTF9TRVJWRVJfRVJST1IAV0VCX1NFUlZFUl9VTktOT1dOX0VSUk9SAFJBSUxHVU5fRVJST1IASURFTlRJVFlfUFJPVklERVJfQVVUSEVOVElDQVRJT05fRVJST1IAU1NMX0NFUlRJRklDQVRFX0VSUk9SAElOVkFMSURfWF9GT1JXQVJERURfRk9SAFNFVF9QQVJBTUVURVIAR0VUX1BBUkFNRVRFUgBIUEVfVVNFUgBTRUVfT1RIRVIASFBFX0NCX0NIVU5LX0hFQURFUgBNS0NBTEVOREFSAFNFVFVQAFdFQl9TRVJWRVJfSVNfRE9XTgBURUFSRE9XTgBIUEVfQ0xPU0VEX0NPTk5FQ1RJT04ASEVVUklTVElDX0VYUElSQVRJT04ARElTQ09OTkVDVEVEX09QRVJBVElPTgBOT05fQVVUSE9SSVRBVElWRV9JTkZPUk1BVElPTgBIUEVfSU5WQUxJRF9WRVJTSU9OAEhQRV9DQl9NRVNTQUdFX0JFR0lOAFNJVEVfSVNfRlJPWkVOAEhQRV9JTlZBTElEX0hFQURFUl9UT0tFTgBJTlZBTElEX1RPS0VOAEZPUkJJRERFTgBFTkhBTkNFX1lPVVJfQ0FMTQBIUEVfSU5WQUxJRF9VUkwAQkxPQ0tFRF9CWV9QQVJFTlRBTF9DT05UUk9MAE1LQ09MAEFDTABIUEVfSU5URVJOQUwAUkVRVUVTVF9IRUFERVJfRklFTERTX1RPT19MQVJHRV9VTk9GRklDSUFMAEhQRV9PSwBVTkxJTksAVU5MT0NLAFBSSQBSRVRSWV9XSVRIAEhQRV9JTlZBTElEX0NPTlRFTlRfTEVOR1RIAEhQRV9VTkVYUEVDVEVEX0NPTlRFTlRfTEVOR1RIAEZMVVNIAFBST1BQQVRDSABNLVNFQVJDSABVUklfVE9PX0xPTkcAUFJPQ0VTU0lORwBNSVNDRUxMQU5FT1VTX1BFUlNJU1RFTlRfV0FSTklORwBNSVNDRUxMQU5FT1VTX1dBUk5JTkcASFBFX0lOVkFMSURfVFJBTlNGRVJfRU5DT0RJTkcARXhwZWN0ZWQgQ1JMRgBIUEVfSU5WQUxJRF9DSFVOS19TSVpFAE1PVkUAQ09OVElOVUUASFBFX0NCX1NUQVRVU19DT01QTEVURQBIUEVfQ0JfSEVBREVSU19DT01QTEVURQBIUEVfQ0JfVkVSU0lPTl9DT01QTEVURQBIUEVfQ0JfVVJMX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19DT01QTEVURQBIUEVfQ0JfSEVBREVSX1ZBTFVFX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19FWFRFTlNJT05fVkFMVUVfQ09NUExFVEUASFBFX0NCX0NIVU5LX0VYVEVOU0lPTl9OQU1FX0NPTVBMRVRFAEhQRV9DQl9NRVNTQUdFX0NPTVBMRVRFAEhQRV9DQl9NRVRIT0RfQ09NUExFVEUASFBFX0NCX0hFQURFUl9GSUVMRF9DT01QTEVURQBERUxFVEUASFBFX0lOVkFMSURfRU9GX1NUQVRFAElOVkFMSURfU1NMX0NFUlRJRklDQVRFAFBBVVNFAE5PX1JFU1BPTlNFAFVOU1VQUE9SVEVEX01FRElBX1RZUEUAR09ORQBOT1RfQUNDRVBUQUJMRQBTRVJWSUNFX1VOQVZBSUxBQkxFAFJBTkdFX05PVF9TQVRJU0ZJQUJMRQBPUklHSU5fSVNfVU5SRUFDSEFCTEUAUkVTUE9OU0VfSVNfU1RBTEUAUFVSR0UATUVSR0UAUkVRVUVTVF9IRUFERVJfRklFTERTX1RPT19MQVJHRQBSRVFVRVNUX0hFQURFUl9UT09fTEFSR0UAUEFZTE9BRF9UT09fTEFSR0UASU5TVUZGSUNJRU5UX1NUT1JBR0UASFBFX1BBVVNFRF9VUEdSQURFAEhQRV9QQVVTRURfSDJfVVBHUkFERQBTT1VSQ0UAQU5OT1VOQ0UAVFJBQ0UASFBFX1VORVhQRUNURURfU1BBQ0UAREVTQ1JJQkUAVU5TVUJTQ1JJQkUAUkVDT1JEAEhQRV9JTlZBTElEX01FVEhPRABOT1RfRk9VTkQAUFJPUEZJTkQAVU5CSU5EAFJFQklORABVTkFVVEhPUklaRUQATUVUSE9EX05PVF9BTExPV0VEAEhUVFBfVkVSU0lPTl9OT1RfU1VQUE9SVEVEAEFMUkVBRFlfUkVQT1JURUQAQUNDRVBURUQATk9UX0lNUExFTUVOVEVEAExPT1BfREVURUNURUQASFBFX0NSX0VYUEVDVEVEAEhQRV9MRl9FWFBFQ1RFRABDUkVBVEVEAElNX1VTRUQASFBFX1BBVVNFRABUSU1FT1VUX09DQ1VSRUQAUEFZTUVOVF9SRVFVSVJFRABQUkVDT05ESVRJT05fUkVRVUlSRUQAUFJPWFlfQVVUSEVOVElDQVRJT05fUkVRVUlSRUQATkVUV09SS19BVVRIRU5USUNBVElPTl9SRVFVSVJFRABMRU5HVEhfUkVRVUlSRUQAU1NMX0NFUlRJRklDQVRFX1JFUVVJUkVEAFVQR1JBREVfUkVRVUlSRUQAUEFHRV9FWFBJUkVEAFBSRUNPTkRJVElPTl9GQUlMRUQARVhQRUNUQVRJT05fRkFJTEVEAFJFVkFMSURBVElPTl9GQUlMRUQAU1NMX0hBTkRTSEFLRV9GQUlMRUQATE9DS0VEAFRSQU5TRk9STUFUSU9OX0FQUExJRUQATk9UX01PRElGSUVEAE5PVF9FWFRFTkRFRABCQU5EV0lEVEhfTElNSVRfRVhDRUVERUQAU0lURV9JU19PVkVSTE9BREVEAEhFQUQARXhwZWN0ZWQgSFRUUC8AAF4TAAAmEwAAMBAAAPAXAACdEwAAFRIAADkXAADwEgAAChAAAHUSAACtEgAAghMAAE8UAAB/EAAAoBUAACMUAACJEgAAixQAAE0VAADUEQAAzxQAABAYAADJFgAA3BYAAMERAADgFwAAuxQAAHQUAAB8FQAA5RQAAAgXAAAfEAAAZRUAAKMUAAAoFQAAAhUAAJkVAAAsEAAAixkAAE8PAADUDgAAahAAAM4QAAACFwAAiQ4AAG4TAAAcEwAAZhQAAFYXAADBEwAAzRMAAGwTAABoFwAAZhcAAF8XAAAiEwAAzg8AAGkOAADYDgAAYxYAAMsTAACqDgAAKBcAACYXAADFEwAAXRYAAOgRAABnEwAAZRMAAPIWAABzEwAAHRcAAPkWAADzEQAAzw4AAM4VAAAMEgAAsxEAAKURAABhEAAAMhcAALsTAEH5NQsBAQBBkDYL4AEBAQIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB/TcLAQEAQZE4C14CAwICAgICAAACAgACAgACAgICAgICAgICAAQAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgACAEH9OQsBAQBBkToLXgIAAgICAgIAAAICAAICAAICAgICAgICAgIAAwAEAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgACAAIAQfA7Cw1sb3NlZWVwLWFsaXZlAEGJPAsBAQBBoDwL4AEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBBiT4LAQEAQaA+C+cBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQFjaHVua2VkAEGwwAALXwEBAAEBAQEBAAABAQABAQABAQEBAQEBAQEBAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQABAEGQwgALIWVjdGlvbmVudC1sZW5ndGhvbnJveHktY29ubmVjdGlvbgBBwMIACy1yYW5zZmVyLWVuY29kaW5ncGdyYWRlDQoNCg0KU00NCg0KVFRQL0NFL1RTUC8AQfnCAAsFAQIAAQMAQZDDAAvgAQQBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAEH5xAALBQECAAEDAEGQxQAL4AEEAQEFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB+cYACwQBAAABAEGRxwAL3wEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAEH6yAALBAEAAAIAQZDJAAtfAwQAAAQEBAQEBAQEBAQEBQQEBAQEBAQEBAQEBAAEAAYHBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQABAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQAQfrKAAsEAQAAAQBBkMsACwEBAEGqywALQQIAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAEH6zAALBAEAAAEAQZDNAAsBAQBBms0ACwYCAAAAAAIAQbHNAAs6AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBB8M4AC5YBTk9VTkNFRUNLT1VUTkVDVEVURUNSSUJFTFVTSEVURUFEU0VBUkNIUkdFQ1RJVklUWUxFTkRBUlZFT1RJRllQVElPTlNDSFNFQVlTVEFUQ0hHRU9SRElSRUNUT1JUUkNIUEFSQU1FVEVSVVJDRUJTQ1JJQkVBUkRPV05BQ0VJTkROS0NLVUJTQ1JJQkVIVFRQL0FEVFAv', 'base64')


/***/ }),

/***/ 532:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Buffer } = __nccwpck_require__(2254)

module.exports = Buffer.from('AGFzbQEAAAABJwdgAX8Bf2ADf39/AX9gAX8AYAJ/fwBgBH9/f38Bf2AAAGADf39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQAEA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAy0sBQYAAAIAAAAAAAACAQIAAgICAAADAAAAAAMDAwMBAQEBAQEBAQEAAAIAAAAEBQFwARISBQMBAAIGCAF/AUGA1AQLB9EFIgZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAIGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAJGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQAvDGxsaHR0cF9hbGxvYwALBm1hbGxvYwAxC2xsaHR0cF9mcmVlAAwEZnJlZQAMD2xsaHR0cF9nZXRfdHlwZQANFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAOFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAPEWxsaHR0cF9nZXRfbWV0aG9kABAWbGxodHRwX2dldF9zdGF0dXNfY29kZQAREmxsaHR0cF9nZXRfdXBncmFkZQASDGxsaHR0cF9yZXNldAATDmxsaHR0cF9leGVjdXRlABQUbGxodHRwX3NldHRpbmdzX2luaXQAFQ1sbGh0dHBfZmluaXNoABYMbGxodHRwX3BhdXNlABcNbGxodHRwX3Jlc3VtZQAYG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAZEGxsaHR0cF9nZXRfZXJybm8AGhdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAbF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uABwUbGxodHRwX2dldF9lcnJvcl9wb3MAHRFsbGh0dHBfZXJybm9fbmFtZQAeEmxsaHR0cF9tZXRob2RfbmFtZQAfEmxsaHR0cF9zdGF0dXNfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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PgtBhwEMPQtBiAEMPAtBiQEMOwtBigEMOgtBiwEMOQtBjAEMOAtBjQEMNwtBjgEMNgtBjwEMNQtBkAEMNAtBkQEMMwtBkgEMMgtBkwEMMQtBlAEMMAtBlQEMLwtBlgEMLgtBlwEMLQtBmAEMLAtBmQEMKwtBmgEMKgtBmwEMKQtBnAEMKAtBnQEMJwtBngEMJgtBnwEMJQtBoAEMJAtBoQEMIwtBogEMIgtBowEMIQtBpAEMIAtBpQEMHwtBpgEMHgtBpwEMHQtBqAEMHAtBqQEMGwtBqgEMGgtBqwEMGQtBrAEMGAtBrQEMFwtBrgEMFgtBAQwVC0GvAQwUC0GwAQwTC0GxAQwSC0GzAQwRC0GyAQwQC0G0AQwPC0G1AQwOC0G2AQwNC0G3AQwMC0G4AQwLC0G5AQwKC0G6AQwJC0G7AQwIC0HGAQwHC0G8AQwGC0G9AQwFC0G+AQwEC0G/AQwDC0HAAQwCC0HCAQwBC0HBAQshAwNAAkACQAJAAkACQAJAAkACQAJAIAICfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgAgJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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iQEhAwykAgtBASABLQAAQd8ARw1nGiABQQFqIQEMXgtBigEhAyABIARGDaICIAIoAgAiACAEIAFraiEFIAEgAGtBAWohBgNAIAEtAAAgAEGMzwBqLQAARw1kIABBAUYN+gEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMogILQYsBIQMgASAERg2hAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGOzwBqLQAARw1kIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyiAgsgAkEANgIAIAZBAWohAUECDGULQYwBIQMgASAERg2gAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHwzwBqLQAARw1jIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyhAgsgAkEANgIAIAZBAWohAUEfDGQLQY0BIQMgASAERg2fAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHyzwBqLQAARw1iIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAygAgsgAkEANgIAIAZBAWohAUEJDGMLIAEgBEYEQEGOASEDDJ8CCwJAAkAgAS0AAEHJAGsOBwBiYmJiYgFiCyABQQFqIQFB+AAhAwyGAgsgAUEBaiEBQfkAIQMMhQILQY8BIQMgASAERg2dAiACKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEGRzwBqLQAARw1gIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyeAgsgAkEANgIAIAZBAWohAUEYDGELQZABIQMgASAERg2cAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGXzwBqLQAARw1fIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAydAgsgAkEANgIAIAZBAWohAUEXDGALQZEBIQMgASAERg2bAiACKAIAIgAgBCABa2ohBSABIABrQQZqIQYCQANAIAEtAAAgAEGazwBqLQAARw1eIABBBkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAycAgsgAkEANgIAIAZBAWohAUEVDF8LQZIBIQMgASAERg2aAiACKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEGhzwBqLQAARw1dIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAybAgsgAkEANgIAIAZBAWohAUEeDF4LIAEgBEYEQEGTASEDDJoCCyABLQAAQcwARw1bIAFBAWohAUEKDF0LIAEgBEYEQEGUASEDDJkCCwJAAkAgAS0AAEHBAGsODwBcXFxcXFxcXFxcXFxcAVwLIAFBAWohAUH+ACEDDIACCyABQQFqIQFB/wAhAwz/AQsgASAERgRAQZUBIQMMmAILAkACQCABLQAAQcEAaw4DAFsBWwsgAUEBaiEBQf0AIQMM/wELIAFBAWohAUGAASEDDP4BC0GWASEDIAEgBEYNlgIgAigCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABBp88Aai0AAEcNWSAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMlwILIAJBADYCACAGQQFqIQFBCwxaCyABIARGBEBBlwEhAwyWAgsCQAJAAkACQCABLQAAQS1rDiMAW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1sBW1tbW1sCW1tbA1sLIAFBAWohAUH7ACEDDP8BCyABQQFqIQFB/AAhAwz+AQsgAUEBaiEBQYEBIQMM/QELIAFBAWohAUGCASEDDPwBC0GYASEDIAEgBEYNlAIgAigCACIAIAQgAWtqIQUgASAAa0EEaiEGAkADQCABLQAAIABBqc8Aai0AAEcNVyAAQQRGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMlQILIAJBADYCACAGQQFqIQFBGQxYC0GZASEDIAEgBEYNkwIgAigCACIAIAQgAWtqIQUgASAAa0EFaiEGAkADQCABLQAAIABBrs8Aai0AAEcNViAAQQVGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMlAILIAJBADYCACAGQQFqIQFBBgxXC0GaASEDIAEgBEYNkgIgAigCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABBtM8Aai0AAEcNVSAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMkwILIAJBADYCACAGQQFqIQFBHAxWC0GbASEDIAEgBEYNkQIgAigCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABBts8Aai0AAEcNVCAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMkgILIAJBADYCACAGQQFqIQFBJwxVCyABIARGBEBBnAEhAwyRAgsCQAJAIAEtAABB1ABrDgIAAVQLIAFBAWohAUGGASEDDPgBCyABQQFqIQFBhwEhAwz3AQtBnQEhAyABIARGDY8CIAIoAgAiACAEIAFraiEFIAEgAGtBAWohBgJAA0AgAS0AACAAQbjPAGotAABHDVIgAEEBRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAiAFNgIADJACCyACQQA2AgAgBkEBaiEBQSYMUwtBngEhAyABIARGDY4CIAIoAgAiACAEIAFraiEFIAEgAGtBAWohBgJAA0AgAS0AACAAQbrPAGotAABHDVEgAEEBRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAiAFNgIADI8CCyACQQA2AgAgBkEBaiEBQQMMUgtBnwEhAyABIARGDY0CIAIoAgAiACAEIAFraiEFIAEgAGtBAmohBgJAA0AgAS0AACAAQe3PAGotAABHDVAgAEECRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAiAFNgIADI4CCyACQQA2AgAgBkEBaiEBQQwMUQtBoAEhAyABIARGDYwCIAIoAgAiACAEIAFraiEFIAEgAGtBA2ohBgJAA0AgAS0AACAAQbzPAGotAABHDU8gAEEDRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAiAFNgIADI0CCyACQQA2AgAgBkEBaiEBQQ0MUAsgASAERgRAQaEBIQMMjAILAkACQCABLQAAQcYAaw4LAE9PT09PT09PTwFPCyABQQFqIQFBiwEhAwzzAQsgAUEBaiEBQYwBIQMM8gELIAEgBEYEQEGiASEDDIsCCyABLQAAQdAARw1MIAFBAWohAQxGCyABIARGBEBBowEhAwyKAgsCQAJAIAEtAABByQBrDgcBTU1NTU0ATQsgAUEBaiEBQY4BIQMM8QELIAFBAWohAUEiDE0LQaQBIQMgASAERg2IAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHAzwBqLQAARw1LIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyJAgsgAkEANgIAIAZBAWohAUEdDEwLIAEgBEYEQEGlASEDDIgCCwJAAkAgAS0AAEHSAGsOAwBLAUsLIAFBAWohAUGQASEDDO8BCyABQQFqIQFBBAxLCyABIARGBEBBpgEhAwyHAgsCQAJAAkACQAJAIAEtAABBwQBrDhUATU1NTU1NTU1NTQFNTQJNTQNNTQRNCyABQQFqIQFBiAEhAwzxAQsgAUEBaiEBQYkBIQMM8AELIAFBAWohAUGKASEDDO8BCyABQQFqIQFBjwEhAwzuAQsgAUEBaiEBQZEBIQMM7QELQacBIQMgASAERg2FAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEHtzwBqLQAARw1IIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyGAgsgAkEANgIAIAZBAWohAUERDEkLQagBIQMgASAERg2EAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEHCzwBqLQAARw1HIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyFAgsgAkEANgIAIAZBAWohAUEsDEgLQakBIQMgASAERg2DAiACKAIAIgAgBCABa2ohBSABIABrQQRqIQYCQANAIAEtAAAgAEHFzwBqLQAARw1GIABBBEYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyEAgsgAkEANgIAIAZBAWohAUErDEcLQaoBIQMgASAERg2CAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEHKzwBqLQAARw1FIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyDAgsgAkEANgIAIAZBAWohAUEUDEYLIAEgBEYEQEGrASEDDIICCwJAAkACQAJAIAEtAABBwgBrDg8AAQJHR0dHR0dHR0dHRwNHCyABQQFqIQFBkwEhAwzrAQsgAUEBaiEBQZQBIQMM6gELIAFBAWohAUGVASEDDOkBCyABQQFqIQFBlgEhAwzoAQsgASAERgRAQawBIQMMgQILIAEtAABBxQBHDUIgAUEBaiEBDD0LQa0BIQMgASAERg3/ASACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEHNzwBqLQAARw1CIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyAAgsgAkEANgIAIAZBAWohAUEODEMLIAEgBEYEQEGuASEDDP8BCyABLQAAQdAARw1AIAFBAWohAUElDEILQa8BIQMgASAERg39ASACKAIAIgAgBCABa2ohBSABIABrQQhqIQYCQANAIAEtAAAgAEHQzwBqLQAARw1AIABBCEYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAz+AQsgAkEANgIAIAZBAWohAUEqDEELIAEgBEYEQEGwASEDDP0BCwJAAkAgAS0AAEHVAGsOCwBAQEBAQEBAQEABQAsgAUEBaiEBQZoBIQMM5AELIAFBAWohAUGbASEDDOMBCyABIARGBEBBsQEhAwz8AQsCQAJAIAEtAABBwQBrDhQAPz8/Pz8/Pz8/Pz8/Pz8/Pz8/AT8LIAFBAWohAUGZASEDDOMBCyABQQFqIQFBnAEhAwziAQtBsgEhAyABIARGDfoBIAIoAgAiACAEIAFraiEFIAEgAGtBA2ohBgJAA0AgAS0AACAAQdnPAGotAABHDT0gAEEDRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAiAFNgIADPsBCyACQQA2AgAgBkEBaiEBQSEMPgtBswEhAyABIARGDfkBIAIoAgAiACAEIAFraiEFIAEgAGtBBmohBgJAA0AgAS0AACAAQd3PAGotAABHDTwgAEEGRg0BIABBAWohACAEIAFBAWoiAUcNAAsgAiAFNgIADPoBCyACQQA2AgAgBkEBaiEBQRoMPQsgASAERgRAQbQBIQMM+QELAkACQAJAIAEtAABBxQBrDhEAPT09PT09PT09AT09PT09Aj0LIAFBAWohAUGdASEDDOEBCyABQQFqIQFBngEhAwzgAQsgAUEBaiEBQZ8BIQMM3wELQbUBIQMgASAERg33ASACKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEHkzwBqLQAARw06IABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAz4AQsgAkEANgIAIAZBAWohAUEoDDsLQbYBIQMgASAERg32ASACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEHqzwBqLQAARw05IABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAz3AQsgAkEANgIAIAZBAWohAUEHDDoLIAEgBEYEQEG3ASEDDPYBCwJAAkAgAS0AAEHFAGsODgA5OTk5OTk5OTk5OTkBOQsgAUEBaiEBQaEBIQMM3QELIAFBAWohAUGiASEDDNwBC0G4ASEDIAEgBEYN9AEgAigCACIAIAQgAWtqIQUgASAAa0ECaiEGAkADQCABLQAAIABB7c8Aai0AAEcNNyAAQQJGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAM9QELIAJBADYCACAGQQFqIQFBEgw4C0G5ASEDIAEgBEYN8wEgAigCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABB8M8Aai0AAEcNNiAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAM9AELIAJBADYCACAGQQFqIQFBIAw3C0G6ASEDIAEgBEYN8gEgAigCACIAIAQgAWtqIQUgASAAa0EBaiEGAkADQCABLQAAIABB8s8Aai0AAEcNNSAAQQFGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAM8wELIAJBADYCACAGQQFqIQFBDww2CyABIARGBEBBuwEhAwzyAQsCQAJAIAEtAABByQBrDgcANTU1NTUBNQsgAUEBaiEBQaUBIQMM2QELIAFBAWohAUGmASEDDNgBC0G8ASEDIAEgBEYN8AEgAigCACIAIAQgAWtqIQUgASAAa0EHaiEGAkADQCABLQAAIABB9M8Aai0AAEcNMyAAQQdGDQEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAM8QELIAJBADYCACAGQQFqIQFBGww0CyABIARGBEBBvQEhAwzwAQsCQAJAAkAgAS0AAEHCAGsOEgA0NDQ0NDQ0NDQBNDQ0NDQ0AjQLIAFBAWohAUGkASEDDNgBCyABQQFqIQFBpwEhAwzXAQsgAUEBaiEBQagBIQMM1gELIAEgBEYEQEG+ASEDDO8BCyABLQAAQc4ARw0wIAFBAWohAQwsCyABIARGBEBBvwEhAwzuAQsCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCABLQAAQcEAaw4VAAECAz8EBQY/Pz8HCAkKCz8MDQ4PPwsgAUEBaiEBQegAIQMM4wELIAFBAWohAUHpACEDDOIBCyABQQFqIQFB7gAhAwzhAQsgAUEBaiEBQfIAIQMM4AELIAFBAWohAUHzACEDDN8BCyABQQFqIQFB9gAhAwzeAQsgAUEBaiEBQfcAIQMM3QELIAFBAWohAUH6ACEDDNwBCyABQQFqIQFBgwEhAwzbAQsgAUEBaiEBQYQBIQMM2gELIAFBAWohAUGFASEDDNkBCyABQQFqIQFBkgEhAwzYAQsgAUEBaiEBQZgBIQMM1wELIAFBAWohAUGgASEDDNYBCyABQQFqIQFBowEhAwzVAQsgAUEBaiEBQaoBIQMM1AELIAEgBEcEQCACQRA2AgggAiABNgIEQasBIQMM1AELQcABIQMM7AELQQAhAAJAIAIoAjgiA0UNACADKAI0IgNFDQAgAiADEQAAIQALIABFDV4gAEEVRw0HIAJB0QA2AhwgAiABNgIUIAJBsBc2AhAgAkEVNgIMQQAhAwzrAQsgAUEBaiABIARHDQgaQcIBIQMM6gELA0ACQCABLQAAQQprDgQIAAALAAsgBCABQQFqIgFHDQALQcMBIQMM6QELIAEgBEcEQCACQRE2AgggAiABNgIEQQEhAwzQAQtBxAEhAwzoAQsgASAERgRAQcUBIQMM6AELAkACQCABLQAAQQprDgQBKCgAKAsgAUEBagwJCyABQQFqDAULIAEgBEYEQEHGASEDDOcBCwJAAkAgAS0AAEEKaw4XAQsLAQsLCwsLCwsLCwsLCwsLCwsLCwALCyABQQFqIQELQbABIQMMzQELIAEgBEYEQEHIASEDDOYBCyABLQAAQSBHDQkgAkEAOwEyIAFBAWohAUGzASEDDMwBCwNAIAEhAAJAIAEgBEcEQCABLQAAQTBrQf8BcSIDQQpJDQEMJwtBxwEhAwzmAQsCQCACLwEyIgFBmTNLDQAgAiABQQpsIgU7ATIgBUH+/wNxIANB//8Dc0sNACAAQQFqIQEgAiADIAVqIgM7ATIgA0H//wNxQegHSQ0BCwtBACEDIAJBADYCHCACQcEJNgIQIAJBDTYCDCACIABBAWo2AhQM5AELIAJBADYCHCACIAE2AhQgAkHwDDYCECACQRs2AgxBACEDDOMBCyACKAIEIQAgAkEANgIEIAIgACABECYiAA0BIAFBAWoLIQFBrQEhAwzIAQsgAkHBATYCHCACIAA2AgwgAiABQQFqNgIUQQAhAwzgAQsgAigCBCEAIAJBADYCBCACIAAgARAmIgANASABQQFqCyEBQa4BIQMMxQELIAJBwgE2AhwgAiAANgIMIAIgAUEBajYCFEEAIQMM3QELIAJBADYCHCACIAE2AhQgAkGXCzYCECACQQ02AgxBACEDDNwBCyACQQA2AhwgAiABNgIUIAJB4xA2AhAgAkEJNgIMQQAhAwzbAQsgAkECOgAoDKwBC0EAIQMgAkEANgIcIAJBrws2AhAgAkECNgIMIAIgAUEBajYCFAzZAQtBAiEDDL8BC0ENIQMMvgELQSYhAwy9AQtBFSEDDLwBC0EWIQMMuwELQRghAwy6AQtBHCEDDLkBC0EdIQMMuAELQSAhAwy3AQtBISEDDLYBC0EjIQMMtQELQcYAIQMMtAELQS4hAwyzAQtBPSEDDLIBC0HLACEDDLEBC0HOACEDDLABC0HYACEDDK8BC0HZACEDDK4BC0HbACEDDK0BC0HxACEDDKwBC0H0ACEDDKsBC0GNASEDDKoBC0GXASEDDKkBC0GpASEDDKgBC0GvASEDDKcBC0GxASEDDKYBCyACQQA2AgALQQAhAyACQQA2AhwgAiABNgIUIAJB8Rs2AhAgAkEGNgIMDL0BCyACQQA2AgAgBkEBaiEBQSQLOgApIAIoAgQhACACQQA2AgQgAiAAIAEQJyIARQRAQeUAIQMMowELIAJB+QA2AhwgAiABNgIUIAIgADYCDEEAIQMMuwELIABBFUcEQCACQQA2AhwgAiABNgIUIAJBzA42AhAgAkEgNgIMQQAhAwy7AQsgAkH4ADYCHCACIAE2AhQgAkHKGDYCECACQRU2AgxBACEDDLoBCyACQQA2AhwgAiABNgIUIAJBjhs2AhAgAkEGNgIMQQAhAwy5AQsgAkEANgIcIAIgATYCFCACQf4RNgIQIAJBBzYCDEEAIQMMuAELIAJBADYCHCACIAE2AhQgAkGMHDYCECACQQc2AgxBACEDDLcBCyACQQA2AhwgAiABNgIUIAJBww82AhAgAkEHNgIMQQAhAwy2AQsgAkEANgIcIAIgATYCFCACQcMPNgIQIAJBBzYCDEEAIQMMtQELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0RIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMtAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0gIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMswELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0iIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMsgELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0OIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMsQELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0dIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMsAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0fIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMrwELIABBP0cNASABQQFqCyEBQQUhAwyUAQtBACEDIAJBADYCHCACIAE2AhQgAkH9EjYCECACQQc2AgwMrAELIAJBADYCHCACIAE2AhQgAkHcCDYCECACQQc2AgxBACEDDKsBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNByACQeUANgIcIAIgATYCFCACIAA2AgxBACEDDKoBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNFiACQdMANgIcIAIgATYCFCACIAA2AgxBACEDDKkBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNGCACQdIANgIcIAIgATYCFCACIAA2AgxBACEDDKgBCyACQQA2AhwgAiABNgIUIAJBxgo2AhAgAkEHNgIMQQAhAwynAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQMgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwymAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRIgAkHTADYCHCACIAE2AhQgAiAANgIMQQAhAwylAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRQgAkHSADYCHCACIAE2AhQgAiAANgIMQQAhAwykAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQAgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwyjAQtB1QAhAwyJAQsgAEEVRwRAIAJBADYCHCACIAE2AhQgAkG5DTYCECACQRo2AgxB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AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABB5ABrDvQDY2IAAWFhYWFhYQIDBAVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhBgcICQoLDA0OD2FhYWFhEGFhYWFhYWFhYWFhEWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYRITFBUWFxgZGhthYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2YTc4OTphYWFhYWFhYTthYWE8YWFhYT0+P2FhYWFhYWFhQGFhQWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYUJDREVGR0hJSktMTU5PUFFSU2FhYWFhYWFhVFVWV1hZWlthXF1hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFeYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhX2BhC0HhJw8LQaQhDwtByywPC0H+MQ8LQcAkDwtBqyQPC0GNKA8LQeImDwtBgDAPC0G5Lw8LQdckDwtB7x8PC0HhHw8LQfofDwtB8iAPC0GoLw8LQa4yDwtBiDAPC0HsJw8LQYIiDwtBjh0PC0HQLg8LQcojDwtBxTIPC0HfHA8LQdIcDwtBxCAPC0HXIA8LQaIfDwtB7S4PC0GrMA8LQdQlDwtBzC4PC0H6Lg8LQfwrDwtB0jAPC0HxHQ8LQbsgDwtB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AAADAEGUCAsFBAAAAAUAQaQICwkGAAAABwAAAAgAQdwIC4otSW52YWxpZCBjaGFyIGluIHVybCBxdWVyeQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2JvZHkAQ29udGVudC1MZW5ndGggb3ZlcmZsb3cAQ2h1bmsgc2l6ZSBvdmVyZmxvdwBSZXNwb25zZSBvdmVyZmxvdwBJbnZhbGlkIG1ldGhvZCBmb3IgSFRUUC94LnggcmVxdWVzdABJbnZhbGlkIG1ldGhvZCBmb3IgUlRTUC94LnggcmVxdWVzdABFeHBlY3RlZCBTT1VSQ0UgbWV0aG9kIGZvciBJQ0UveC54IHJlcXVlc3QASW52YWxpZCBjaGFyIGluIHVybCBmcmFnbWVudCBzdGFydABFeHBlY3RlZCBkb3QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9zdGF0dXMASW52YWxpZCByZXNwb25zZSBzdGF0dXMASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucwBVc2VyIGNhbGxiYWNrIGVycm9yAGBvbl9yZXNldGAgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2hlYWRlcmAgY2FsbGJhY2sgZXJyb3IAYG9uX21lc3NhZ2VfYmVnaW5gIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19leHRlbnNpb25fdmFsdWVgIGNhbGxiYWNrIGVycm9yAGBvbl9zdGF0dXNfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl92ZXJzaW9uX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fdXJsX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9oZWFkZXJfdmFsdWVfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fbWV0aG9kX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25faGVhZGVyX2ZpZWxkX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfZXh0ZW5zaW9uX25hbWVgIGNhbGxiYWNrIGVycm9yAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2VydmVyAEludmFsaWQgaGVhZGVyIHZhbHVlIGNoYXIASW52YWxpZCBoZWFkZXIgZmllbGQgY2hhcgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3ZlcnNpb24ASW52YWxpZCBtaW5vciB2ZXJzaW9uAEludmFsaWQgbWFqb3IgdmVyc2lvbgBFeHBlY3RlZCBzcGFjZSBhZnRlciB2ZXJzaW9uAEV4cGVjdGVkIENSTEYgYWZ0ZXIgdmVyc2lvbgBJbnZhbGlkIEhUVFAgdmVyc2lvbgBJbnZhbGlkIGhlYWRlciB0b2tlbgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3VybABJbnZhbGlkIGNoYXJhY3RlcnMgaW4gdXJsAFVuZXhwZWN0ZWQgc3RhcnQgY2hhciBpbiB1cmwARG91YmxlIEAgaW4gdXJsAEVtcHR5IENvbnRlbnQtTGVuZ3RoAEludmFsaWQgY2hhcmFjdGVyIGluIENvbnRlbnQtTGVuZ3RoAER1cGxpY2F0ZSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXIgaW4gdXJsIHBhdGgAQ29udGVudC1MZW5ndGggY2FuJ3QgYmUgcHJlc2VudCB3aXRoIFRyYW5zZmVyLUVuY29kaW5nAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHNpemUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfdmFsdWUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9jaHVua19leHRlbnNpb25fdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyB2YWx1ZQBNaXNzaW5nIGV4cGVjdGVkIExGIGFmdGVyIGhlYWRlciB2YWx1ZQBJbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AgaGVhZGVyIHZhbHVlAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMgcXVvdGUgdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBxdW90ZWQgdmFsdWUAUGF1c2VkIGJ5IG9uX2hlYWRlcnNfY29tcGxldGUASW52YWxpZCBFT0Ygc3RhdGUAb25fcmVzZXQgcGF1c2UAb25fY2h1bmtfaGVhZGVyIHBhdXNlAG9uX21lc3NhZ2VfYmVnaW4gcGF1c2UAb25fY2h1bmtfZXh0ZW5zaW9uX3ZhbHVlIHBhdXNlAG9uX3N0YXR1c19jb21wbGV0ZSBwYXVzZQBvbl92ZXJzaW9uX2NvbXBsZXRlIHBhdXNlAG9uX3VybF9jb21wbGV0ZSBwYXVzZQBvbl9jaHVua19jb21wbGV0ZSBwYXVzZQBvbl9oZWFkZXJfdmFsdWVfY29tcGxldGUgcGF1c2UAb25fbWVzc2FnZV9jb21wbGV0ZSBwYXVzZQBvbl9tZXRob2RfY29tcGxldGUgcGF1c2UAb25faGVhZGVyX2ZpZWxkX2NvbXBsZXRlIHBhdXNlAG9uX2NodW5rX2V4dGVuc2lvbl9uYW1lIHBhdXNlAFVuZXhwZWN0ZWQgc3BhY2UgYWZ0ZXIgc3RhcnQgbGluZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2NodW5rX2V4dGVuc2lvbl9uYW1lAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMgbmFtZQBQYXVzZSBvbiBDT05ORUNUL1VwZ3JhZGUAUGF1c2Ugb24gUFJJL1VwZ3JhZGUARXhwZWN0ZWQgSFRUUC8yIENvbm5lY3Rpb24gUHJlZmFjZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX21ldGhvZABFeHBlY3RlZCBzcGFjZSBhZnRlciBtZXRob2QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfZmllbGQAUGF1c2VkAEludmFsaWQgd29yZCBlbmNvdW50ZXJlZABJbnZhbGlkIG1ldGhvZCBlbmNvdW50ZXJlZABVbmV4cGVjdGVkIGNoYXIgaW4gdXJsIHNjaGVtYQBSZXF1ZXN0IGhhcyBpbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AAU1dJVENIX1BST1hZAFVTRV9QUk9YWQBNS0FDVElWSVRZAFVOUFJPQ0VTU0FCTEVfRU5USVRZAENPUFkATU9WRURfUEVSTUFORU5UTFkAVE9PX0VBUkxZAE5PVElGWQBGQUlMRURfREVQRU5ERU5DWQBCQURfR0FURVdBWQBQTEFZAFBVVABDSEVDS09VVABHQVRFV0FZX1RJTUVPVVQAUkVRVUVTVF9USU1FT1VUAE5FVFdPUktfQ09OTkVDVF9USU1FT1VUAENPTk5FQ1RJT05fVElNRU9VVABMT0dJTl9USU1FT1VUAE5FVFdPUktfUkVBRF9USU1FT1VUAFBPU1QATUlTRElSRUNURURfUkVRVUVTVABDTElFTlRfQ0xPU0VEX1JFUVVFU1QAQ0xJRU5UX0NMT1NFRF9MT0FEX0JBTEFOQ0VEX1JFUVVFU1QAQkFEX1JFUVVFU1QASFRUUF9SRVFVRVNUX1NFTlRfVE9fSFRUUFNfUE9SVABSRVBPUlQASU1fQV9URUFQT1QAUkVTRVRfQ09OVEVOVABOT19DT05URU5UAFBBUlRJQUxfQ09OVEVOVABIUEVfSU5WQUxJRF9DT05TVEFOVABIUEVfQ0JfUkVTRVQAR0VUAEhQRV9TVFJJQ1QAQ09ORkxJQ1QAVEVNUE9SQVJZX1JFRElSRUNUAFBFUk1BTkVOVF9SRURJUkVDVABDT05ORUNUAE1VTFRJX1NUQVRVUwBIUEVfSU5WQUxJRF9TVEFUVVMAVE9PX01BTllfUkVRVUVTVFMARUFSTFlfSElOVFMAVU5BVkFJTEFCTEVfRk9SX0xFR0FMX1JFQVNPTlMAT1BUSU9OUwBTV0lUQ0hJTkdfUFJPVE9DT0xTAFZBUklBTlRfQUxTT19ORUdPVElBVEVTAE1VTFRJUExFX0NIT0lDRVMASU5URVJOQUxfU0VSVkVSX0VSUk9SAFdFQl9TRVJWRVJfVU5LTk9XTl9FUlJPUgBSQUlMR1VOX0VSUk9SAElERU5USVRZX1BST1ZJREVSX0FVVEhFTlRJQ0FUSU9OX0VSUk9SAFNTTF9DRVJUSUZJQ0FURV9FUlJPUgBJTlZBTElEX1hfRk9SV0FSREVEX0ZPUgBTRVRfUEFSQU1FVEVSAEdFVF9QQVJBTUVURVIASFBFX1VTRVIAU0VFX09USEVSAEhQRV9DQl9DSFVOS19IRUFERVIATUtDQUxFTkRBUgBTRVRVUABXRUJfU0VSVkVSX0lTX0RPV04AVEVBUkRPV04ASFBFX0NMT1NFRF9DT05ORUNUSU9OAEhFVVJJU1RJQ19FWFBJUkFUSU9OAERJU0NPTk5FQ1RFRF9PUEVSQVRJT04ATk9OX0FVVEhPUklUQVRJVkVfSU5GT1JNQVRJT04ASFBFX0lOVkFMSURfVkVSU0lPTgBIUEVfQ0JfTUVTU0FHRV9CRUdJTgBTSVRFX0lTX0ZST1pFTgBIUEVfSU5WQUxJRF9IRUFERVJfVE9LRU4ASU5WQUxJRF9UT0tFTgBGT1JCSURERU4ARU5IQU5DRV9ZT1VSX0NBTE0ASFBFX0lOVkFMSURfVVJMAEJMT0NLRURfQllfUEFSRU5UQUxfQ09OVFJPTABNS0NPTABBQ0wASFBFX0lOVEVSTkFMAFJFUVVFU1RfSEVBREVSX0ZJRUxEU19UT09fTEFSR0VfVU5PRkZJQ0lBTABIUEVfT0sAVU5MSU5LAFVOTE9DSwBQUkkAUkVUUllfV0lUSABIUEVfSU5WQUxJRF9DT05URU5UX0xFTkdUSABIUEVfVU5FWFBFQ1RFRF9DT05URU5UX0xFTkdUSABGTFVTSABQUk9QUEFUQ0gATS1TRUFSQ0gAVVJJX1RPT19MT05HAFBST0NFU1NJTkcATUlTQ0VMTEFORU9VU19QRVJTSVNURU5UX1dBUk5JTkcATUlTQ0VMTEFORU9VU19XQVJOSU5HAEhQRV9JTlZBTElEX1RSQU5TRkVSX0VOQ09ESU5HAEV4cGVjdGVkIENSTEYASFBFX0lOVkFMSURfQ0hVTktfU0laRQBNT1ZFAENPTlRJTlVFAEhQRV9DQl9TVEFUVVNfQ09NUExFVEUASFBFX0NCX0hFQURFUlNfQ09NUExFVEUASFBFX0NCX1ZFUlNJT05fQ09NUExFVEUASFBFX0NCX1VSTF9DT01QTEVURQBIUEVfQ0JfQ0hVTktfQ09NUExFVEUASFBFX0NCX0hFQURFUl9WQUxVRV9DT01QTEVURQBIUEVfQ0JfQ0hVTktfRVhURU5TSU9OX1ZBTFVFX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19FWFRFTlNJT05fTkFNRV9DT01QTEVURQBIUEVfQ0JfTUVTU0FHRV9DT01QTEVURQBIUEVfQ0JfTUVUSE9EX0NPTVBMRVRFAEhQRV9DQl9IRUFERVJfRklFTERfQ09NUExFVEUAREVMRVRFAEhQRV9JTlZBTElEX0VPRl9TVEFURQBJTlZBTElEX1NTTF9DRVJUSUZJQ0FURQBQQVVTRQBOT19SRVNQT05TRQBVTlNVUFBPUlRFRF9NRURJQV9UWVBFAEdPTkUATk9UX0FDQ0VQVEFCTEUAU0VSVklDRV9VTkFWQUlMQUJMRQBSQU5HRV9OT1RfU0FUSVNGSUFCTEUAT1JJR0lOX0lTX1VOUkVBQ0hBQkxFAFJFU1BPTlNFX0lTX1NUQUxFAFBVUkdFAE1FUkdFAFJFUVVFU1RfSEVBREVSX0ZJRUxEU19UT09fTEFSR0UAUkVRVUVTVF9IRUFERVJfVE9PX0xBUkdFAFBBWUxPQURfVE9PX0xBUkdFAElOU1VGRklDSUVOVF9TVE9SQUdFAEhQRV9QQVVTRURfVVBHUkFERQBIUEVfUEFVU0VEX0gyX1VQR1JBREUAU09VUkNFAEFOTk9VTkNFAFRSQUNFAEhQRV9VTkVYUEVDVEVEX1NQQUNFAERFU0NSSUJFAFVOU1VCU0NSSUJFAFJFQ09SRABIUEVfSU5WQUxJRF9NRVRIT0QATk9UX0ZPVU5EAFBST1BGSU5EAFVOQklORABSRUJJTkQAVU5BVVRIT1JJWkVEAE1FVEhPRF9OT1RfQUxMT1dFRABIVFRQX1ZFUlNJT05fTk9UX1NVUFBPUlRFRABBTFJFQURZX1JFUE9SVEVEAEFDQ0VQVEVEAE5PVF9JTVBMRU1FTlRFRABMT09QX0RFVEVDVEVEAEhQRV9DUl9FWFBFQ1RFRABIUEVfTEZfRVhQRUNURUQAQ1JFQVRFRABJTV9VU0VEAEhQRV9QQVVTRUQAVElNRU9VVF9PQ0NVUkVEAFBBWU1FTlRfUkVRVUlSRUQAUFJFQ09ORElUSU9OX1JFUVVJUkVEAFBST1hZX0FVVEhFTlRJQ0FUSU9OX1JFUVVJUkVEAE5FVFdPUktfQVVUSEVOVElDQVRJT05fUkVRVUlSRUQATEVOR1RIX1JFUVVJUkVEAFNTTF9DRVJUSUZJQ0FURV9SRVFVSVJFRABVUEdSQURFX1JFUVVJUkVEAFBBR0VfRVhQSVJFRABQUkVDT05ESVRJT05fRkFJTEVEAEVYUEVDVEFUSU9OX0ZBSUxFRABSRVZBTElEQVRJT05fRkFJTEVEAFNTTF9IQU5EU0hBS0VfRkFJTEVEAExPQ0tFRABUUkFOU0ZPUk1BVElPTl9BUFBMSUVEAE5PVF9NT0RJRklFRABOT1RfRVhURU5ERUQAQkFORFdJRFRIX0xJTUlUX0VYQ0VFREVEAFNJVEVfSVNfT1ZFUkxPQURFRABIRUFEAEV4cGVjdGVkIEhUVFAvAABeEwAAJhMAADAQAADwFwAAnRMAABUSAAA5FwAA8BIAAAoQAAB1EgAArRIAAIITAABPFAAAfxAAAKAVAAAjFAAAiRIAAIsUAABNFQAA1BEAAM8UAAAQGAAAyRYAANwWAADBEQAA4BcAALsUAAB0FAAAfBUAAOUUAAAIFwAAHxAAAGUVAACjFAAAKBUAAAIVAACZFQAALBAAAIsZAABPDwAA1A4AAGoQAADOEAAAAhcAAIkOAABuEwAAHBMAAGYUAABWFwAAwRMAAM0TAABsEwAAaBcAAGYXAABfFwAAIhMAAM4PAABpDgAA2A4AAGMWAADLEwAAqg4AACgXAAAmFwAAxRMAAF0WAADoEQAAZxMAAGUTAADyFgAAcxMAAB0XAAD5FgAA8xEAAM8OAADOFQAADBIAALMRAAClEQAAYRAAADIXAAC7EwBB+TULAQEAQZA2C+ABAQECAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAQf03CwEBAEGROAteAgMCAgICAgAAAgIAAgIAAgICAgICAgICAgAEAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAIAAgBB/TkLAQEAQZE6C14CAAICAgICAAACAgACAgACAgICAgICAgICAAMABAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgACAEHwOwsNbG9zZWVlcC1hbGl2ZQBBiTwLAQEAQaA8C+ABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAQYk+CwEBAEGgPgvnAQEBAQEBAQEBAQEBAQIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBY2h1bmtlZABBsMAAC18BAQABAQEBAQAAAQEAAQEAAQEBAQEBAQEBAQAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQBBkMIACyFlY3Rpb25lbnQtbGVuZ3Rob25yb3h5LWNvbm5lY3Rpb24AQcDCAAstcmFuc2Zlci1lbmNvZGluZ3BncmFkZQ0KDQoNClNNDQoNClRUUC9DRS9UU1AvAEH5wgALBQECAAEDAEGQwwAL4AEEAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB+cQACwUBAgABAwBBkMUAC+ABBAEBBQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAQfnGAAsEAQAAAQBBkccAC98BAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB+sgACwQBAAACAEGQyQALXwMEAAAEBAQEBAQEBAQEBAUEBAQEBAQEBAQEBAQABAAGBwQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEAEH6ygALBAEAAAEAQZDLAAsBAQBBqssAC0ECAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBB+swACwQBAAABAEGQzQALAQEAQZrNAAsGAgAAAAACAEGxzQALOgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAQfDOAAuWAU5PVU5DRUVDS09VVE5FQ1RFVEVDUklCRUxVU0hFVEVBRFNFQVJDSFJHRUNUSVZJVFlMRU5EQVJWRU9USUZZUFRJT05TQ0hTRUFZU1RBVENIR0VPUkRJUkVDVE9SVFJDSFBBUkFNRVRFUlVSQ0VCU0NSSUJFQVJET1dOQUNFSU5ETktDS1VCU0NSSUJFSFRUUC9BRFRQLw==', 'base64')


/***/ }),

/***/ 1211:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.enumToMap = void 0;
function enumToMap(obj) {
    const res = {};
    Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (typeof value === 'number') {
            res[key] = value;
        }
    });
    return res;
}
exports.enumToMap = enumToMap;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 832:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { kClients } = __nccwpck_require__(46)
const Agent = __nccwpck_require__(6705)
const {
  kAgent,
  kMockAgentSet,
  kMockAgentGet,
  kDispatches,
  kIsMockActive,
  kNetConnect,
  kGetNetConnect,
  kOptions,
  kFactory
} = __nccwpck_require__(5119)
const MockClient = __nccwpck_require__(2916)
const MockPool = __nccwpck_require__(2870)
const { matchValue, buildMockOptions } = __nccwpck_require__(5869)
const { InvalidArgumentError, UndiciError } = __nccwpck_require__(8642)
const Dispatcher = __nccwpck_require__(3701)
const Pluralizer = __nccwpck_require__(7103)
const PendingInterceptorsFormatter = __nccwpck_require__(7561)

class MockAgent extends Dispatcher {
  constructor (opts) {
    super(opts)

    this[kNetConnect] = true
    this[kIsMockActive] = true

    // Instantiate Agent and encapsulate
    if ((opts?.agent && typeof opts.agent.dispatch !== 'function')) {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }
    const agent = opts?.agent ? opts.agent : new Agent(opts)
    this[kAgent] = agent

    this[kClients] = agent[kClients]
    this[kOptions] = buildMockOptions(opts)
  }

  get (origin) {
    let dispatcher = this[kMockAgentGet](origin)

    if (!dispatcher) {
      dispatcher = this[kFactory](origin)
      this[kMockAgentSet](origin, dispatcher)
    }
    return dispatcher
  }

  dispatch (opts, handler) {
    // Call MockAgent.get to perform additional setup before dispatching as normal
    this.get(opts.origin)
    return this[kAgent].dispatch(opts, handler)
  }

  async close () {
    await this[kAgent].close()
    this[kClients].clear()
  }

  deactivate () {
    this[kIsMockActive] = false
  }

  activate () {
    this[kIsMockActive] = true
  }

  enableNetConnect (matcher) {
    if (typeof matcher === 'string' || typeof matcher === 'function' || matcher instanceof RegExp) {
      if (Array.isArray(this[kNetConnect])) {
        this[kNetConnect].push(matcher)
      } else {
        this[kNetConnect] = [matcher]
      }
    } else if (typeof matcher === 'undefined') {
      this[kNetConnect] = true
    } else {
      throw new InvalidArgumentError('Unsupported matcher. Must be one of String|Function|RegExp.')
    }
  }

  disableNetConnect () {
    this[kNetConnect] = false
  }

  // This is required to bypass issues caused by using global symbols - see:
  // https://github.com/nodejs/undici/issues/1447
  get isMockActive () {
    return this[kIsMockActive]
  }

  [kMockAgentSet] (origin, dispatcher) {
    this[kClients].set(origin, dispatcher)
  }

  [kFactory] (origin) {
    const mockOptions = Object.assign({ agent: this }, this[kOptions])
    return this[kOptions] && this[kOptions].connections === 1
      ? new MockClient(origin, mockOptions)
      : new MockPool(origin, mockOptions)
  }

  [kMockAgentGet] (origin) {
    // First check if we can immediately find it
    const client = this[kClients].get(origin)
    if (client) {
      return client
    }

    // If the origin is not a string create a dummy parent pool and return to user
    if (typeof origin !== 'string') {
      const dispatcher = this[kFactory]('http://localhost:9999')
      this[kMockAgentSet](origin, dispatcher)
      return dispatcher
    }

    // If we match, create a pool and assign the same dispatches
    for (const [keyMatcher, nonExplicitDispatcher] of Array.from(this[kClients])) {
      if (nonExplicitDispatcher && typeof keyMatcher !== 'string' && matchValue(keyMatcher, origin)) {
        const dispatcher = this[kFactory](origin)
        this[kMockAgentSet](origin, dispatcher)
        dispatcher[kDispatches] = nonExplicitDispatcher[kDispatches]
        return dispatcher
      }
    }
  }

  [kGetNetConnect] () {
    return this[kNetConnect]
  }

  pendingInterceptors () {
    const mockAgentClients = this[kClients]

    return Array.from(mockAgentClients.entries())
      .flatMap(([origin, scope]) => scope[kDispatches].map(dispatch => ({ ...dispatch, origin })))
      .filter(({ pending }) => pending)
  }

  assertNoPendingInterceptors ({ pendingInterceptorsFormatter = new PendingInterceptorsFormatter() } = {}) {
    const pending = this.pendingInterceptors()

    if (pending.length === 0) {
      return
    }

    const pluralizer = new Pluralizer('interceptor', 'interceptors').pluralize(pending.length)

    throw new UndiciError(`
${pluralizer.count} ${pluralizer.noun} ${pluralizer.is} pending:

${pendingInterceptorsFormatter.format(pending)}
`.trim())
  }
}

module.exports = MockAgent


/***/ }),

/***/ 2916:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { promisify } = __nccwpck_require__(7261)
const Client = __nccwpck_require__(4885)
const { buildMockDispatch } = __nccwpck_require__(5869)
const {
  kDispatches,
  kMockAgent,
  kClose,
  kOriginalClose,
  kOrigin,
  kOriginalDispatch,
  kConnected
} = __nccwpck_require__(5119)
const { MockInterceptor } = __nccwpck_require__(2269)
const Symbols = __nccwpck_require__(46)
const { InvalidArgumentError } = __nccwpck_require__(8642)

/**
 * MockClient provides an API that extends the Client to influence the mockDispatches.
 */
class MockClient extends Client {
  constructor (origin, opts) {
    super(origin, opts)

    if (!opts || !opts.agent || typeof opts.agent.dispatch !== 'function') {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }

    this[kMockAgent] = opts.agent
    this[kOrigin] = origin
    this[kDispatches] = []
    this[kConnected] = 1
    this[kOriginalDispatch] = this.dispatch
    this[kOriginalClose] = this.close.bind(this)

    this.dispatch = buildMockDispatch.call(this)
    this.close = this[kClose]
  }

  get [Symbols.kConnected] () {
    return this[kConnected]
  }

  /**
   * Sets up the base interceptor for mocking replies from undici.
   */
  intercept (opts) {
    return new MockInterceptor(opts, this[kDispatches])
  }

  async [kClose] () {
    await promisify(this[kOriginalClose])()
    this[kConnected] = 0
    this[kMockAgent][Symbols.kClients].delete(this[kOrigin])
  }
}

module.exports = MockClient


/***/ }),

/***/ 3025:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { UndiciError } = __nccwpck_require__(8642)

const kMockNotMatchedError = Symbol.for('undici.error.UND_MOCK_ERR_MOCK_NOT_MATCHED')

/**
 * The request does not match any registered mock dispatches.
 */
class MockNotMatchedError extends UndiciError {
  constructor (message) {
    super(message)
    Error.captureStackTrace(this, MockNotMatchedError)
    this.name = 'MockNotMatchedError'
    this.message = message || 'The request does not match any registered mock dispatches'
    this.code = 'UND_MOCK_ERR_MOCK_NOT_MATCHED'
  }

  static [Symbol.hasInstance] (instance) {
    return instance && instance[kMockNotMatchedError] === true
  }

  [kMockNotMatchedError] = true
}

module.exports = {
  MockNotMatchedError
}


/***/ }),

/***/ 2269:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { getResponseData, buildKey, addMockDispatch } = __nccwpck_require__(5869)
const {
  kDispatches,
  kDispatchKey,
  kDefaultHeaders,
  kDefaultTrailers,
  kContentLength,
  kMockDispatch
} = __nccwpck_require__(5119)
const { InvalidArgumentError } = __nccwpck_require__(8642)
const { buildURL } = __nccwpck_require__(9099)

/**
 * Defines the scope API for an interceptor reply
 */
class MockScope {
  constructor (mockDispatch) {
    this[kMockDispatch] = mockDispatch
  }

  /**
   * Delay a reply by a set amount in ms.
   */
  delay (waitInMs) {
    if (typeof waitInMs !== 'number' || !Number.isInteger(waitInMs) || waitInMs <= 0) {
      throw new InvalidArgumentError('waitInMs must be a valid integer > 0')
    }

    this[kMockDispatch].delay = waitInMs
    return this
  }

  /**
   * For a defined reply, never mark as consumed.
   */
  persist () {
    this[kMockDispatch].persist = true
    return this
  }

  /**
   * Allow one to define a reply for a set amount of matching requests.
   */
  times (repeatTimes) {
    if (typeof repeatTimes !== 'number' || !Number.isInteger(repeatTimes) || repeatTimes <= 0) {
      throw new InvalidArgumentError('repeatTimes must be a valid integer > 0')
    }

    this[kMockDispatch].times = repeatTimes
    return this
  }
}

/**
 * Defines an interceptor for a Mock
 */
class MockInterceptor {
  constructor (opts, mockDispatches) {
    if (typeof opts !== 'object') {
      throw new InvalidArgumentError('opts must be an object')
    }
    if (typeof opts.path === 'undefined') {
      throw new InvalidArgumentError('opts.path must be defined')
    }
    if (typeof opts.method === 'undefined') {
      opts.method = 'GET'
    }
    // See https://github.com/nodejs/undici/issues/1245
    // As per RFC 3986, clients are not supposed to send URI
    // fragments to servers when they retrieve a document,
    if (typeof opts.path === 'string') {
      if (opts.query) {
        opts.path = buildURL(opts.path, opts.query)
      } else {
        // Matches https://github.com/nodejs/undici/blob/main/lib/web/fetch/index.js#L1811
        const parsedURL = new URL(opts.path, 'data://')
        opts.path = parsedURL.pathname + parsedURL.search
      }
    }
    if (typeof opts.method === 'string') {
      opts.method = opts.method.toUpperCase()
    }

    this[kDispatchKey] = buildKey(opts)
    this[kDispatches] = mockDispatches
    this[kDefaultHeaders] = {}
    this[kDefaultTrailers] = {}
    this[kContentLength] = false
  }

  createMockScopeDispatchData ({ statusCode, data, responseOptions }) {
    const responseData = getResponseData(data)
    const contentLength = this[kContentLength] ? { 'content-length': responseData.length } : {}
    const headers = { ...this[kDefaultHeaders], ...contentLength, ...responseOptions.headers }
    const trailers = { ...this[kDefaultTrailers], ...responseOptions.trailers }

    return { statusCode, data, headers, trailers }
  }

  validateReplyParameters (replyParameters) {
    if (typeof replyParameters.statusCode === 'undefined') {
      throw new InvalidArgumentError('statusCode must be defined')
    }
    if (typeof replyParameters.responseOptions !== 'object' || replyParameters.responseOptions === null) {
      throw new InvalidArgumentError('responseOptions must be an object')
    }
  }

  /**
   * Mock an undici request with a defined reply.
   */
  reply (replyOptionsCallbackOrStatusCode) {
    // Values of reply aren't available right now as they
    // can only be available when the reply callback is invoked.
    if (typeof replyOptionsCallbackOrStatusCode === 'function') {
      // We'll first wrap the provided callback in another function,
      // this function will properly resolve the data from the callback
      // when invoked.
      const wrappedDefaultsCallback = (opts) => {
        // Our reply options callback contains the parameter for statusCode, data and options.
        const resolvedData = replyOptionsCallbackOrStatusCode(opts)

        // Check if it is in the right format
        if (typeof resolvedData !== 'object' || resolvedData === null) {
          throw new InvalidArgumentError('reply options callback must return an object')
        }

        const replyParameters = { data: '', responseOptions: {}, ...resolvedData }
        this.validateReplyParameters(replyParameters)
        // Since the values can be obtained immediately we return them
        // from this higher order function that will be resolved later.
        return {
          ...this.createMockScopeDispatchData(replyParameters)
        }
      }

      // Add usual dispatch data, but this time set the data parameter to function that will eventually provide data.
      const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], wrappedDefaultsCallback)
      return new MockScope(newMockDispatch)
    }

    // We can have either one or three parameters, if we get here,
    // we should have 1-3 parameters. So we spread the arguments of
    // this function to obtain the parameters, since replyData will always
    // just be the statusCode.
    const replyParameters = {
      statusCode: replyOptionsCallbackOrStatusCode,
      data: arguments[1] === undefined ? '' : arguments[1],
      responseOptions: arguments[2] === undefined ? {} : arguments[2]
    }
    this.validateReplyParameters(replyParameters)

    // Send in-already provided data like usual
    const dispatchData = this.createMockScopeDispatchData(replyParameters)
    const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], dispatchData)
    return new MockScope(newMockDispatch)
  }

  /**
   * Mock an undici request with a defined error.
   */
  replyWithError (error) {
    if (typeof error === 'undefined') {
      throw new InvalidArgumentError('error must be defined')
    }

    const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], { error })
    return new MockScope(newMockDispatch)
  }

  /**
   * Set default reply headers on the interceptor for subsequent replies
   */
  defaultReplyHeaders (headers) {
    if (typeof headers === 'undefined') {
      throw new InvalidArgumentError('headers must be defined')
    }

    this[kDefaultHeaders] = headers
    return this
  }

  /**
   * Set default reply trailers on the interceptor for subsequent replies
   */
  defaultReplyTrailers (trailers) {
    if (typeof trailers === 'undefined') {
      throw new InvalidArgumentError('trailers must be defined')
    }

    this[kDefaultTrailers] = trailers
    return this
  }

  /**
   * Set reply content length header for replies on the interceptor
   */
  replyContentLength () {
    this[kContentLength] = true
    return this
  }
}

module.exports.MockInterceptor = MockInterceptor
module.exports.MockScope = MockScope


/***/ }),

/***/ 2870:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { promisify } = __nccwpck_require__(7261)
const Pool = __nccwpck_require__(1076)
const { buildMockDispatch } = __nccwpck_require__(5869)
const {
  kDispatches,
  kMockAgent,
  kClose,
  kOriginalClose,
  kOrigin,
  kOriginalDispatch,
  kConnected
} = __nccwpck_require__(5119)
const { MockInterceptor } = __nccwpck_require__(2269)
const Symbols = __nccwpck_require__(46)
const { InvalidArgumentError } = __nccwpck_require__(8642)

/**
 * MockPool provides an API that extends the Pool to influence the mockDispatches.
 */
class MockPool extends Pool {
  constructor (origin, opts) {
    super(origin, opts)

    if (!opts || !opts.agent || typeof opts.agent.dispatch !== 'function') {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }

    this[kMockAgent] = opts.agent
    this[kOrigin] = origin
    this[kDispatches] = []
    this[kConnected] = 1
    this[kOriginalDispatch] = this.dispatch
    this[kOriginalClose] = this.close.bind(this)

    this.dispatch = buildMockDispatch.call(this)
    this.close = this[kClose]
  }

  get [Symbols.kConnected] () {
    return this[kConnected]
  }

  /**
   * Sets up the base interceptor for mocking replies from undici.
   */
  intercept (opts) {
    return new MockInterceptor(opts, this[kDispatches])
  }

  async [kClose] () {
    await promisify(this[kOriginalClose])()
    this[kConnected] = 0
    this[kMockAgent][Symbols.kClients].delete(this[kOrigin])
  }
}

module.exports = MockPool


/***/ }),

/***/ 5119:
/***/ ((module) => {

"use strict";


module.exports = {
  kAgent: Symbol('agent'),
  kOptions: Symbol('options'),
  kFactory: Symbol('factory'),
  kDispatches: Symbol('dispatches'),
  kDispatchKey: Symbol('dispatch key'),
  kDefaultHeaders: Symbol('default headers'),
  kDefaultTrailers: Symbol('default trailers'),
  kContentLength: Symbol('content length'),
  kMockAgent: Symbol('mock agent'),
  kMockAgentSet: Symbol('mock agent set'),
  kMockAgentGet: Symbol('mock agent get'),
  kMockDispatch: Symbol('mock dispatch'),
  kClose: Symbol('close'),
  kOriginalClose: Symbol('original agent close'),
  kOrigin: Symbol('origin'),
  kIsMockActive: Symbol('is mock active'),
  kNetConnect: Symbol('net connect'),
  kGetNetConnect: Symbol('get net connect'),
  kConnected: Symbol('connected')
}


/***/ }),

/***/ 5869:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { MockNotMatchedError } = __nccwpck_require__(3025)
const {
  kDispatches,
  kMockAgent,
  kOriginalDispatch,
  kOrigin,
  kGetNetConnect
} = __nccwpck_require__(5119)
const { buildURL } = __nccwpck_require__(9099)
const { STATUS_CODES } = __nccwpck_require__(8849)
const {
  types: {
    isPromise
  }
} = __nccwpck_require__(7261)

function matchValue (match, value) {
  if (typeof match === 'string') {
    return match === value
  }
  if (match instanceof RegExp) {
    return match.test(value)
  }
  if (typeof match === 'function') {
    return match(value) === true
  }
  return false
}

function lowerCaseEntries (headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([headerName, headerValue]) => {
      return [headerName.toLocaleLowerCase(), headerValue]
    })
  )
}

/**
 * @param {import('../../index').Headers|string[]|Record<string, string>} headers
 * @param {string} key
 */
function getHeaderByName (headers, key) {
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      if (headers[i].toLocaleLowerCase() === key.toLocaleLowerCase()) {
        return headers[i + 1]
      }
    }

    return undefined
  } else if (typeof headers.get === 'function') {
    return headers.get(key)
  } else {
    return lowerCaseEntries(headers)[key.toLocaleLowerCase()]
  }
}

/** @param {string[]} headers */
function buildHeadersFromArray (headers) { // fetch HeadersList
  const clone = headers.slice()
  const entries = []
  for (let index = 0; index < clone.length; index += 2) {
    entries.push([clone[index], clone[index + 1]])
  }
  return Object.fromEntries(entries)
}

function matchHeaders (mockDispatch, headers) {
  if (typeof mockDispatch.headers === 'function') {
    if (Array.isArray(headers)) { // fetch HeadersList
      headers = buildHeadersFromArray(headers)
    }
    return mockDispatch.headers(headers ? lowerCaseEntries(headers) : {})
  }
  if (typeof mockDispatch.headers === 'undefined') {
    return true
  }
  if (typeof headers !== 'object' || typeof mockDispatch.headers !== 'object') {
    return false
  }

  for (const [matchHeaderName, matchHeaderValue] of Object.entries(mockDispatch.headers)) {
    const headerValue = getHeaderByName(headers, matchHeaderName)

    if (!matchValue(matchHeaderValue, headerValue)) {
      return false
    }
  }
  return true
}

function safeUrl (path) {
  if (typeof path !== 'string') {
    return path
  }

  const pathSegments = path.split('?')

  if (pathSegments.length !== 2) {
    return path
  }

  const qp = new URLSearchParams(pathSegments.pop())
  qp.sort()
  return [...pathSegments, qp.toString()].join('?')
}

function matchKey (mockDispatch, { path, method, body, headers }) {
  const pathMatch = matchValue(mockDispatch.path, path)
  const methodMatch = matchValue(mockDispatch.method, method)
  const bodyMatch = typeof mockDispatch.body !== 'undefined' ? matchValue(mockDispatch.body, body) : true
  const headersMatch = matchHeaders(mockDispatch, headers)
  return pathMatch && methodMatch && bodyMatch && headersMatch
}

function getResponseData (data) {
  if (Buffer.isBuffer(data)) {
    return data
  } else if (data instanceof Uint8Array) {
    return data
  } else if (data instanceof ArrayBuffer) {
    return data
  } else if (typeof data === 'object') {
    return JSON.stringify(data)
  } else {
    return data.toString()
  }
}

function getMockDispatch (mockDispatches, key) {
  const basePath = key.query ? buildURL(key.path, key.query) : key.path
  const resolvedPath = typeof basePath === 'string' ? safeUrl(basePath) : basePath

  // Match path
  let matchedMockDispatches = mockDispatches.filter(({ consumed }) => !consumed).filter(({ path }) => matchValue(safeUrl(path), resolvedPath))
  if (matchedMockDispatches.length === 0) {
    throw new MockNotMatchedError(`Mock dispatch not matched for path '${resolvedPath}'`)
  }

  // Match method
  matchedMockDispatches = matchedMockDispatches.filter(({ method }) => matchValue(method, key.method))
  if (matchedMockDispatches.length === 0) {
    throw new MockNotMatchedError(`Mock dispatch not matched for method '${key.method}' on path '${resolvedPath}'`)
  }

  // Match body
  matchedMockDispatches = matchedMockDispatches.filter(({ body }) => typeof body !== 'undefined' ? matchValue(body, key.body) : true)
  if (matchedMockDispatches.length === 0) {
    throw new MockNotMatchedError(`Mock dispatch not matched for body '${key.body}' on path '${resolvedPath}'`)
  }

  // Match headers
  matchedMockDispatches = matchedMockDispatches.filter((mockDispatch) => matchHeaders(mockDispatch, key.headers))
  if (matchedMockDispatches.length === 0) {
    const headers = typeof key.headers === 'object' ? JSON.stringify(key.headers) : key.headers
    throw new MockNotMatchedError(`Mock dispatch not matched for headers '${headers}' on path '${resolvedPath}'`)
  }

  return matchedMockDispatches[0]
}

function addMockDispatch (mockDispatches, key, data) {
  const baseData = { timesInvoked: 0, times: 1, persist: false, consumed: false }
  const replyData = typeof data === 'function' ? { callback: data } : { ...data }
  const newMockDispatch = { ...baseData, ...key, pending: true, data: { error: null, ...replyData } }
  mockDispatches.push(newMockDispatch)
  return newMockDispatch
}

function deleteMockDispatch (mockDispatches, key) {
  const index = mockDispatches.findIndex(dispatch => {
    if (!dispatch.consumed) {
      return false
    }
    return matchKey(dispatch, key)
  })
  if (index !== -1) {
    mockDispatches.splice(index, 1)
  }
}

function buildKey (opts) {
  const { path, method, body, headers, query } = opts
  return {
    path,
    method,
    body,
    headers,
    query
  }
}

function generateKeyValues (data) {
  const keys = Object.keys(data)
  const result = []
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i]
    const value = data[key]
    const name = Buffer.from(`${key}`)
    if (Array.isArray(value)) {
      for (let j = 0; j < value.length; ++j) {
        result.push(name, Buffer.from(`${value[j]}`))
      }
    } else {
      result.push(name, Buffer.from(`${value}`))
    }
  }
  return result
}

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
 * @param {number} statusCode
 */
function getStatusText (statusCode) {
  return STATUS_CODES[statusCode] || 'unknown'
}

async function getResponse (body) {
  const buffers = []
  for await (const data of body) {
    buffers.push(data)
  }
  return Buffer.concat(buffers).toString('utf8')
}

/**
 * Mock dispatch function used to simulate undici dispatches
 */
function mockDispatch (opts, handler) {
  // Get mock dispatch from built key
  const key = buildKey(opts)
  const mockDispatch = getMockDispatch(this[kDispatches], key)

  mockDispatch.timesInvoked++

  // Here's where we resolve a callback if a callback is present for the dispatch data.
  if (mockDispatch.data.callback) {
    mockDispatch.data = { ...mockDispatch.data, ...mockDispatch.data.callback(opts) }
  }

  // Parse mockDispatch data
  const { data: { statusCode, data, headers, trailers, error }, delay, persist } = mockDispatch
  const { timesInvoked, times } = mockDispatch

  // If it's used up and not persistent, mark as consumed
  mockDispatch.consumed = !persist && timesInvoked >= times
  mockDispatch.pending = timesInvoked < times

  // If specified, trigger dispatch error
  if (error !== null) {
    deleteMockDispatch(this[kDispatches], key)
    handler.onError(error)
    return true
  }

  // Handle the request with a delay if necessary
  if (typeof delay === 'number' && delay > 0) {
    setTimeout(() => {
      handleReply(this[kDispatches])
    }, delay)
  } else {
    handleReply(this[kDispatches])
  }

  function handleReply (mockDispatches, _data = data) {
    // fetch's HeadersList is a 1D string array
    const optsHeaders = Array.isArray(opts.headers)
      ? buildHeadersFromArray(opts.headers)
      : opts.headers
    const body = typeof _data === 'function'
      ? _data({ ...opts, headers: optsHeaders })
      : _data

    // util.types.isPromise is likely needed for jest.
    if (isPromise(body)) {
      // If handleReply is asynchronous, throwing an error
      // in the callback will reject the promise, rather than
      // synchronously throw the error, which breaks some tests.
      // Rather, we wait for the callback to resolve if it is a
      // promise, and then re-run handleReply with the new body.
      body.then((newData) => handleReply(mockDispatches, newData))
      return
    }

    const responseData = getResponseData(body)
    const responseHeaders = generateKeyValues(headers)
    const responseTrailers = generateKeyValues(trailers)

    handler.onConnect?.(err => handler.onError(err), null)
    handler.onHeaders?.(statusCode, responseHeaders, resume, getStatusText(statusCode))
    handler.onData?.(Buffer.from(responseData))
    handler.onComplete?.(responseTrailers)
    deleteMockDispatch(mockDispatches, key)
  }

  function resume () {}

  return true
}

function buildMockDispatch () {
  const agent = this[kMockAgent]
  const origin = this[kOrigin]
  const originalDispatch = this[kOriginalDispatch]

  return function dispatch (opts, handler) {
    if (agent.isMockActive) {
      try {
        mockDispatch.call(this, opts, handler)
      } catch (error) {
        if (error instanceof MockNotMatchedError) {
          const netConnect = agent[kGetNetConnect]()
          if (netConnect === false) {
            throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect disabled)`)
          }
          if (checkNetConnect(netConnect, origin)) {
            originalDispatch.call(this, opts, handler)
          } else {
            throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect is not enabled for this origin)`)
          }
        } else {
          throw error
        }
      }
    } else {
      originalDispatch.call(this, opts, handler)
    }
  }
}

function checkNetConnect (netConnect, origin) {
  const url = new URL(origin)
  if (netConnect === true) {
    return true
  } else if (Array.isArray(netConnect) && netConnect.some((matcher) => matchValue(matcher, url.host))) {
    return true
  }
  return false
}

function buildMockOptions (opts) {
  if (opts) {
    const { agent, ...mockOptions } = opts
    return mockOptions
  }
}

module.exports = {
  getResponseData,
  getMockDispatch,
  addMockDispatch,
  deleteMockDispatch,
  buildKey,
  generateKeyValues,
  matchValue,
  getResponse,
  getStatusText,
  mockDispatch,
  buildMockDispatch,
  checkNetConnect,
  buildMockOptions,
  getHeaderByName,
  buildHeadersFromArray
}


/***/ }),

/***/ 7561:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Transform } = __nccwpck_require__(4492)
const { Console } = __nccwpck_require__(27)

const PERSISTENT = process.versions.icu ? '✅' : 'Y '
const NOT_PERSISTENT = process.versions.icu ? '❌' : 'N '

/**
 * Gets the output of `console.table(…)` as a string.
 */
module.exports = class PendingInterceptorsFormatter {
  constructor ({ disableColors } = {}) {
    this.transform = new Transform({
      transform (chunk, _enc, cb) {
        cb(null, chunk)
      }
    })

    this.logger = new Console({
      stdout: this.transform,
      inspectOptions: {
        colors: !disableColors && !process.env.CI
      }
    })
  }

  format (pendingInterceptors) {
    const withPrettyHeaders = pendingInterceptors.map(
      ({ method, path, data: { statusCode }, persist, times, timesInvoked, origin }) => ({
        Method: method,
        Origin: origin,
        Path: path,
        'Status code': statusCode,
        Persistent: persist ? PERSISTENT : NOT_PERSISTENT,
        Invocations: timesInvoked,
        Remaining: persist ? Infinity : times - timesInvoked
      }))

    this.logger.table(withPrettyHeaders)
    return this.transform.read().toString()
  }
}


/***/ }),

/***/ 7103:
/***/ ((module) => {

"use strict";


const singulars = {
  pronoun: 'it',
  is: 'is',
  was: 'was',
  this: 'this'
}

const plurals = {
  pronoun: 'they',
  is: 'are',
  was: 'were',
  this: 'these'
}

module.exports = class Pluralizer {
  constructor (singular, plural) {
    this.singular = singular
    this.plural = plural
  }

  pluralize (count) {
    const one = count === 1
    const keys = one ? singulars : plurals
    const noun = one ? this.singular : this.plural
    return { ...keys, count, noun }
  }
}


/***/ }),

/***/ 5219:
/***/ ((module) => {

"use strict";


/**
 * This module offers an optimized timer implementation designed for scenarios
 * where high precision is not critical.
 *
 * The timer achieves faster performance by using a low-resolution approach,
 * with an accuracy target of within 500ms. This makes it particularly useful
 * for timers with delays of 1 second or more, where exact timing is less
 * crucial.
 *
 * It's important to note that Node.js timers are inherently imprecise, as
 * delays can occur due to the event loop being blocked by other operations.
 * Consequently, timers may trigger later than their scheduled time.
 */

/**
 * The fastNow variable contains the internal fast timer clock value.
 *
 * @type {number}
 */
let fastNow = 0

/**
 * RESOLUTION_MS represents the target resolution time in milliseconds.
 *
 * @type {number}
 * @default 1000
 */
const RESOLUTION_MS = 1e3

/**
 * TICK_MS defines the desired interval in milliseconds between each tick.
 * The target value is set to half the resolution time, minus 1 ms, to account
 * for potential event loop overhead.
 *
 * @type {number}
 * @default 499
 */
const TICK_MS = (RESOLUTION_MS >> 1) - 1

/**
 * fastNowTimeout is a Node.js timer used to manage and process
 * the FastTimers stored in the `fastTimers` array.
 *
 * @type {NodeJS.Timeout}
 */
let fastNowTimeout

/**
 * The kFastTimer symbol is used to identify FastTimer instances.
 *
 * @type {Symbol}
 */
const kFastTimer = Symbol('kFastTimer')

/**
 * The fastTimers array contains all active FastTimers.
 *
 * @type {FastTimer[]}
 */
const fastTimers = []

/**
 * These constants represent the various states of a FastTimer.
 */

/**
 * The `NOT_IN_LIST` constant indicates that the FastTimer is not included
 * in the `fastTimers` array. Timers with this status will not be processed
 * during the next tick by the `onTick` function.
 *
 * A FastTimer can be re-added to the `fastTimers` array by invoking the
 * `refresh` method on the FastTimer instance.
 *
 * @type {-2}
 */
const NOT_IN_LIST = -2

/**
 * The `TO_BE_CLEARED` constant indicates that the FastTimer is scheduled
 * for removal from the `fastTimers` array. A FastTimer in this state will
 * be removed in the next tick by the `onTick` function and will no longer
 * be processed.
 *
 * This status is also set when the `clear` method is called on the FastTimer instance.
 *
 * @type {-1}
 */
const TO_BE_CLEARED = -1

/**
 * The `PENDING` constant signifies that the FastTimer is awaiting processing
 * in the next tick by the `onTick` function. Timers with this status will have
 * their `_idleStart` value set and their status updated to `ACTIVE` in the next tick.
 *
 * @type {0}
 */
const PENDING = 0

/**
 * The `ACTIVE` constant indicates that the FastTimer is active and waiting
 * for its timer to expire. During the next tick, the `onTick` function will
 * check if the timer has expired, and if so, it will execute the associated callback.
 *
 * @type {1}
 */
const ACTIVE = 1

/**
 * The onTick function processes the fastTimers array.
 *
 * @returns {void}
 */
function onTick () {
  /**
   * Increment the fastNow value by the TICK_MS value, despite the actual time
   * that has passed since the last tick. This approach ensures independence
   * from the system clock and delays caused by a blocked event loop.
   *
   * @type {number}
   */
  fastNow += TICK_MS

  /**
   * The `idx` variable is used to iterate over the `fastTimers` array.
   * Expired timers are removed by replacing them with the last element in the array.
   * Consequently, `idx` is only incremented when the current element is not removed.
   *
   * @type {number}
   */
  let idx = 0

  /**
   * The len variable will contain the length of the fastTimers array
   * and will be decremented when a FastTimer should be removed from the
   * fastTimers array.
   *
   * @type {number}
   */
  let len = fastTimers.length

  while (idx < len) {
    /**
     * @type {FastTimer}
     */
    const timer = fastTimers[idx]

    // If the timer is in the ACTIVE state and the timer has expired, it will
    // be processed in the next tick.
    if (timer._state === PENDING) {
      // Set the _idleStart value to the fastNow value minus the TICK_MS value
      // to account for the time the timer was in the PENDING state.
      timer._idleStart = fastNow - TICK_MS
      timer._state = ACTIVE
    } else if (
      timer._state === ACTIVE &&
      fastNow >= timer._idleStart + timer._idleTimeout
    ) {
      timer._state = TO_BE_CLEARED
      timer._idleStart = -1
      timer._onTimeout(timer._timerArg)
    }

    if (timer._state === TO_BE_CLEARED) {
      timer._state = NOT_IN_LIST

      // Move the last element to the current index and decrement len if it is
      // not the only element in the array.
      if (--len !== 0) {
        fastTimers[idx] = fastTimers[len]
      }
    } else {
      ++idx
    }
  }

  // Set the length of the fastTimers array to the new length and thus
  // removing the excess FastTimers elements from the array.
  fastTimers.length = len

  // If there are still active FastTimers in the array, refresh the Timer.
  // If there are no active FastTimers, the timer will be refreshed again
  // when a new FastTimer is instantiated.
  if (fastTimers.length !== 0) {
    refreshTimeout()
  }
}

function refreshTimeout () {
  // If the fastNowTimeout is already set, refresh it.
  if (fastNowTimeout) {
    fastNowTimeout.refresh()
  // fastNowTimeout is not instantiated yet, create a new Timer.
  } else {
    clearTimeout(fastNowTimeout)
    fastNowTimeout = setTimeout(onTick, TICK_MS)

    // If the Timer has an unref method, call it to allow the process to exit if
    // there are no other active handles.
    if (fastNowTimeout.unref) {
      fastNowTimeout.unref()
    }
  }
}

/**
 * The `FastTimer` class is a data structure designed to store and manage
 * timer information.
 */
class FastTimer {
  [kFastTimer] = true

  /**
   * The state of the timer, which can be one of the following:
   * - NOT_IN_LIST (-2)
   * - TO_BE_CLEARED (-1)
   * - PENDING (0)
   * - ACTIVE (1)
   *
   * @type {-2|-1|0|1}
   * @private
   */
  _state = NOT_IN_LIST

  /**
   * The number of milliseconds to wait before calling the callback.
   *
   * @type {number}
   * @private
   */
  _idleTimeout = -1

  /**
   * The time in milliseconds when the timer was started. This value is used to
   * calculate when the timer should expire.
   *
   * @type {number}
   * @default -1
   * @private
   */
  _idleStart = -1

  /**
   * The function to be executed when the timer expires.
   * @type {Function}
   * @private
   */
  _onTimeout

  /**
   * The argument to be passed to the callback when the timer expires.
   *
   * @type {*}
   * @private
   */
  _timerArg

  /**
   * @constructor
   * @param {Function} callback A function to be executed after the timer
   * expires.
   * @param {number} delay The time, in milliseconds that the timer should wait
   * before the specified function or code is executed.
   * @param {*} arg
   */
  constructor (callback, delay, arg) {
    this._onTimeout = callback
    this._idleTimeout = delay
    this._timerArg = arg

    this.refresh()
  }

  /**
   * Sets the timer's start time to the current time, and reschedules the timer
   * to call its callback at the previously specified duration adjusted to the
   * current time.
   * Using this on a timer that has already called its callback will reactivate
   * the timer.
   *
   * @returns {void}
   */
  refresh () {
    // In the special case that the timer is not in the list of active timers,
    // add it back to the array to be processed in the next tick by the onTick
    // function.
    if (this._state === NOT_IN_LIST) {
      fastTimers.push(this)
    }

    // If the timer is the only active timer, refresh the fastNowTimeout for
    // better resolution.
    if (!fastNowTimeout || fastTimers.length === 1) {
      refreshTimeout()
    }

    // Setting the state to PENDING will cause the timer to be reset in the
    // next tick by the onTick function.
    this._state = PENDING
  }

  /**
   * The `clear` method cancels the timer, preventing it from executing.
   *
   * @returns {void}
   * @private
   */
  clear () {
    // Set the state to TO_BE_CLEARED to mark the timer for removal in the next
    // tick by the onTick function.
    this._state = TO_BE_CLEARED

    // Reset the _idleStart value to -1 to indicate that the timer is no longer
    // active.
    this._idleStart = -1
  }
}

/**
 * This module exports a setTimeout and clearTimeout function that can be
 * used as a drop-in replacement for the native functions.
 */
module.exports = {
  /**
   * The setTimeout() method sets a timer which executes a function once the
   * timer expires.
   * @param {Function} callback A function to be executed after the timer
   * expires.
   * @param {number} delay The time, in milliseconds that the timer should
   * wait before the specified function or code is executed.
   * @param {*} [arg] An optional argument to be passed to the callback function
   * when the timer expires.
   * @returns {NodeJS.Timeout|FastTimer}
   */
  setTimeout (callback, delay, arg) {
    // If the delay is less than or equal to the RESOLUTION_MS value return a
    // native Node.js Timer instance.
    return delay <= RESOLUTION_MS
      ? setTimeout(callback, delay, arg)
      : new FastTimer(callback, delay, arg)
  },
  /**
   * The clearTimeout method cancels an instantiated Timer previously created
   * by calling setTimeout.
   *
   * @param {NodeJS.Timeout|FastTimer} timeout
   */
  clearTimeout (timeout) {
    // If the timeout is a FastTimer, call its own clear method.
    if (timeout[kFastTimer]) {
      /**
       * @type {FastTimer}
       */
      timeout.clear()
      // Otherwise it is an instance of a native NodeJS.Timeout, so call the
      // Node.js native clearTimeout function.
    } else {
      clearTimeout(timeout)
    }
  },
  /**
   * The setFastTimeout() method sets a fastTimer which executes a function once
   * the timer expires.
   * @param {Function} callback A function to be executed after the timer
   * expires.
   * @param {number} delay The time, in milliseconds that the timer should
   * wait before the specified function or code is executed.
   * @param {*} [arg] An optional argument to be passed to the callback function
   * when the timer expires.
   * @returns {FastTimer}
   */
  setFastTimeout (callback, delay, arg) {
    return new FastTimer(callback, delay, arg)
  },
  /**
   * The clearTimeout method cancels an instantiated FastTimer previously
   * created by calling setFastTimeout.
   *
   * @param {FastTimer} timeout
   */
  clearFastTimeout (timeout) {
    timeout.clear()
  },
  /**
   * The now method returns the value of the internal fast timer clock.
   *
   * @returns {number}
   */
  now () {
    return fastNow
  },
  /**
   * Trigger the onTick function to process the fastTimers array.
   * Exported for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   * @param {number} [delay=0] The delay in milliseconds to add to the now value.
   */
  tick (delay = 0) {
    fastNow += delay - RESOLUTION_MS + 1
    onTick()
    onTick()
  },
  /**
   * Reset FastTimers.
   * Exported for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   */
  reset () {
    fastNow = 0
    fastTimers.length = 0
    clearTimeout(fastNowTimeout)
    fastNowTimeout = null
  },
  /**
   * Exporting for testing purposes only.
   * Marking as deprecated to discourage any use outside of testing.
   * @deprecated
   */
  kFastTimer
}


/***/ }),

/***/ 2509:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { kConstruct } = __nccwpck_require__(5707)
const { urlEquals, getFieldValues } = __nccwpck_require__(4808)
const { kEnumerableProperty, isDisturbed } = __nccwpck_require__(9099)
const { webidl } = __nccwpck_require__(9346)
const { Response, cloneResponse, fromInnerResponse } = __nccwpck_require__(6120)
const { Request, fromInnerRequest } = __nccwpck_require__(9884)
const { kState } = __nccwpck_require__(1937)
const { fetching } = __nccwpck_require__(7935)
const { urlIsHttpHttpsScheme, createDeferredPromise, readAllBytes } = __nccwpck_require__(8185)
const assert = __nccwpck_require__(8061)

/**
 * @see https://w3c.github.io/ServiceWorker/#dfn-cache-batch-operation
 * @typedef {Object} CacheBatchOperation
 * @property {'delete' | 'put'} type
 * @property {any} request
 * @property {any} response
 * @property {import('../../types/cache').CacheQueryOptions} options
 */

/**
 * @see https://w3c.github.io/ServiceWorker/#dfn-request-response-list
 * @typedef {[any, any][]} requestResponseList
 */

class Cache {
  /**
   * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-request-response-list
   * @type {requestResponseList}
   */
  #relevantRequestResponseList

  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }

    webidl.util.markAsUncloneable(this)
    this.#relevantRequestResponseList = arguments[1]
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.match'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    request = webidl.converters.RequestInfo(request, prefix, 'request')
    options = webidl.converters.CacheQueryOptions(options, prefix, 'options')

    const p = this.#internalMatchAll(request, options, 1)

    if (p.length === 0) {
      return
    }

    return p[0]
  }

  async matchAll (request = undefined, options = {}) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.matchAll'
    if (request !== undefined) request = webidl.converters.RequestInfo(request, prefix, 'request')
    options = webidl.converters.CacheQueryOptions(options, prefix, 'options')

    return this.#internalMatchAll(request, options)
  }

  async add (request) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.add'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    request = webidl.converters.RequestInfo(request, prefix, 'request')

    // 1.
    const requests = [request]

    // 2.
    const responseArrayPromise = this.addAll(requests)

    // 3.
    return await responseArrayPromise
  }

  async addAll (requests) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.addAll'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    // 1.
    const responsePromises = []

    // 2.
    const requestList = []

    // 3.
    for (let request of requests) {
      if (request === undefined) {
        throw webidl.errors.conversionFailed({
          prefix,
          argument: 'Argument 1',
          types: ['undefined is not allowed']
        })
      }

      request = webidl.converters.RequestInfo(request)

      if (typeof request === 'string') {
        continue
      }

      // 3.1
      const r = request[kState]

      // 3.2
      if (!urlIsHttpHttpsScheme(r.url) || r.method !== 'GET') {
        throw webidl.errors.exception({
          header: prefix,
          message: 'Expected http/s scheme when method is not GET.'
        })
      }
    }

    // 4.
    /** @type {ReturnType<typeof fetching>[]} */
    const fetchControllers = []

    // 5.
    for (const request of requests) {
      // 5.1
      const r = new Request(request)[kState]

      // 5.2
      if (!urlIsHttpHttpsScheme(r.url)) {
        throw webidl.errors.exception({
          header: prefix,
          message: 'Expected http/s scheme.'
        })
      }

      // 5.4
      r.initiator = 'fetch'
      r.destination = 'subresource'

      // 5.5
      requestList.push(r)

      // 5.6
      const responsePromise = createDeferredPromise()

      // 5.7
      fetchControllers.push(fetching({
        request: r,
        processResponse (response) {
          // 1.
          if (response.type === 'error' || response.status === 206 || response.status < 200 || response.status > 299) {
            responsePromise.reject(webidl.errors.exception({
              header: 'Cache.addAll',
              message: 'Received an invalid status code or the request failed.'
            }))
          } else if (response.headersList.contains('vary')) { // 2.
            // 2.1
            const fieldValues = getFieldValues(response.headersList.get('vary'))

            // 2.2
            for (const fieldValue of fieldValues) {
              // 2.2.1
              if (fieldValue === '*') {
                responsePromise.reject(webidl.errors.exception({
                  header: 'Cache.addAll',
                  message: 'invalid vary field value'
                }))

                for (const controller of fetchControllers) {
                  controller.abort()
                }

                return
              }
            }
          }
        },
        processResponseEndOfBody (response) {
          // 1.
          if (response.aborted) {
            responsePromise.reject(new DOMException('aborted', 'AbortError'))
            return
          }

          // 2.
          responsePromise.resolve(response)
        }
      }))

      // 5.8
      responsePromises.push(responsePromise.promise)
    }

    // 6.
    const p = Promise.all(responsePromises)

    // 7.
    const responses = await p

    // 7.1
    const operations = []

    // 7.2
    let index = 0

    // 7.3
    for (const response of responses) {
      // 7.3.1
      /** @type {CacheBatchOperation} */
      const operation = {
        type: 'put', // 7.3.2
        request: requestList[index], // 7.3.3
        response // 7.3.4
      }

      operations.push(operation) // 7.3.5

      index++ // 7.3.6
    }

    // 7.5
    const cacheJobPromise = createDeferredPromise()

    // 7.6.1
    let errorData = null

    // 7.6.2
    try {
      this.#batchCacheOperations(operations)
    } catch (e) {
      errorData = e
    }

    // 7.6.3
    queueMicrotask(() => {
      // 7.6.3.1
      if (errorData === null) {
        cacheJobPromise.resolve(undefined)
      } else {
        // 7.6.3.2
        cacheJobPromise.reject(errorData)
      }
    })

    // 7.7
    return cacheJobPromise.promise
  }

  async put (request, response) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.put'
    webidl.argumentLengthCheck(arguments, 2, prefix)

    request = webidl.converters.RequestInfo(request, prefix, 'request')
    response = webidl.converters.Response(response, prefix, 'response')

    // 1.
    let innerRequest = null

    // 2.
    if (request instanceof Request) {
      innerRequest = request[kState]
    } else { // 3.
      innerRequest = new Request(request)[kState]
    }

    // 4.
    if (!urlIsHttpHttpsScheme(innerRequest.url) || innerRequest.method !== 'GET') {
      throw webidl.errors.exception({
        header: prefix,
        message: 'Expected an http/s scheme when method is not GET'
      })
    }

    // 5.
    const innerResponse = response[kState]

    // 6.
    if (innerResponse.status === 206) {
      throw webidl.errors.exception({
        header: prefix,
        message: 'Got 206 status'
      })
    }

    // 7.
    if (innerResponse.headersList.contains('vary')) {
      // 7.1.
      const fieldValues = getFieldValues(innerResponse.headersList.get('vary'))

      // 7.2.
      for (const fieldValue of fieldValues) {
        // 7.2.1
        if (fieldValue === '*') {
          throw webidl.errors.exception({
            header: prefix,
            message: 'Got * vary field value'
          })
        }
      }
    }

    // 8.
    if (innerResponse.body && (isDisturbed(innerResponse.body.stream) || innerResponse.body.stream.locked)) {
      throw webidl.errors.exception({
        header: prefix,
        message: 'Response body is locked or disturbed'
      })
    }

    // 9.
    const clonedResponse = cloneResponse(innerResponse)

    // 10.
    const bodyReadPromise = createDeferredPromise()

    // 11.
    if (innerResponse.body != null) {
      // 11.1
      const stream = innerResponse.body.stream

      // 11.2
      const reader = stream.getReader()

      // 11.3
      readAllBytes(reader).then(bodyReadPromise.resolve, bodyReadPromise.reject)
    } else {
      bodyReadPromise.resolve(undefined)
    }

    // 12.
    /** @type {CacheBatchOperation[]} */
    const operations = []

    // 13.
    /** @type {CacheBatchOperation} */
    const operation = {
      type: 'put', // 14.
      request: innerRequest, // 15.
      response: clonedResponse // 16.
    }

    // 17.
    operations.push(operation)

    // 19.
    const bytes = await bodyReadPromise.promise

    if (clonedResponse.body != null) {
      clonedResponse.body.source = bytes
    }

    // 19.1
    const cacheJobPromise = createDeferredPromise()

    // 19.2.1
    let errorData = null

    // 19.2.2
    try {
      this.#batchCacheOperations(operations)
    } catch (e) {
      errorData = e
    }

    // 19.2.3
    queueMicrotask(() => {
      // 19.2.3.1
      if (errorData === null) {
        cacheJobPromise.resolve()
      } else { // 19.2.3.2
        cacheJobPromise.reject(errorData)
      }
    })

    return cacheJobPromise.promise
  }

  async delete (request, options = {}) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.delete'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    request = webidl.converters.RequestInfo(request, prefix, 'request')
    options = webidl.converters.CacheQueryOptions(options, prefix, 'options')

    /**
     * @type {Request}
     */
    let r = null

    if (request instanceof Request) {
      r = request[kState]

      if (r.method !== 'GET' && !options.ignoreMethod) {
        return false
      }
    } else {
      assert(typeof request === 'string')

      r = new Request(request)[kState]
    }

    /** @type {CacheBatchOperation[]} */
    const operations = []

    /** @type {CacheBatchOperation} */
    const operation = {
      type: 'delete',
      request: r,
      options
    }

    operations.push(operation)

    const cacheJobPromise = createDeferredPromise()

    let errorData = null
    let requestResponses

    try {
      requestResponses = this.#batchCacheOperations(operations)
    } catch (e) {
      errorData = e
    }

    queueMicrotask(() => {
      if (errorData === null) {
        cacheJobPromise.resolve(!!requestResponses?.length)
      } else {
        cacheJobPromise.reject(errorData)
      }
    })

    return cacheJobPromise.promise
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#dom-cache-keys
   * @param {any} request
   * @param {import('../../types/cache').CacheQueryOptions} options
   * @returns {Promise<readonly Request[]>}
   */
  async keys (request = undefined, options = {}) {
    webidl.brandCheck(this, Cache)

    const prefix = 'Cache.keys'

    if (request !== undefined) request = webidl.converters.RequestInfo(request, prefix, 'request')
    options = webidl.converters.CacheQueryOptions(options, prefix, 'options')

    // 1.
    let r = null

    // 2.
    if (request !== undefined) {
      // 2.1
      if (request instanceof Request) {
        // 2.1.1
        r = request[kState]

        // 2.1.2
        if (r.method !== 'GET' && !options.ignoreMethod) {
          return []
        }
      } else if (typeof request === 'string') { // 2.2
        r = new Request(request)[kState]
      }
    }

    // 4.
    const promise = createDeferredPromise()

    // 5.
    // 5.1
    const requests = []

    // 5.2
    if (request === undefined) {
      // 5.2.1
      for (const requestResponse of this.#relevantRequestResponseList) {
        // 5.2.1.1
        requests.push(requestResponse[0])
      }
    } else { // 5.3
      // 5.3.1
      const requestResponses = this.#queryCache(r, options)

      // 5.3.2
      for (const requestResponse of requestResponses) {
        // 5.3.2.1
        requests.push(requestResponse[0])
      }
    }

    // 5.4
    queueMicrotask(() => {
      // 5.4.1
      const requestList = []

      // 5.4.2
      for (const request of requests) {
        const requestObject = fromInnerRequest(
          request,
          new AbortController().signal,
          'immutable'
        )
        // 5.4.2.1
        requestList.push(requestObject)
      }

      // 5.4.3
      promise.resolve(Object.freeze(requestList))
    })

    return promise.promise
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#batch-cache-operations-algorithm
   * @param {CacheBatchOperation[]} operations
   * @returns {requestResponseList}
   */
  #batchCacheOperations (operations) {
    // 1.
    const cache = this.#relevantRequestResponseList

    // 2.
    const backupCache = [...cache]

    // 3.
    const addedItems = []

    // 4.1
    const resultList = []

    try {
      // 4.2
      for (const operation of operations) {
        // 4.2.1
        if (operation.type !== 'delete' && operation.type !== 'put') {
          throw webidl.errors.exception({
            header: 'Cache.#batchCacheOperations',
            message: 'operation type does not match "delete" or "put"'
          })
        }

        // 4.2.2
        if (operation.type === 'delete' && operation.response != null) {
          throw webidl.errors.exception({
            header: 'Cache.#batchCacheOperations',
            message: 'delete operation should not have an associated response'
          })
        }

        // 4.2.3
        if (this.#queryCache(operation.request, operation.options, addedItems).length) {
          throw new DOMException('???', 'InvalidStateError')
        }

        // 4.2.4
        let requestResponses

        // 4.2.5
        if (operation.type === 'delete') {
          // 4.2.5.1
          requestResponses = this.#queryCache(operation.request, operation.options)

          // TODO: the spec is wrong, this is needed to pass WPTs
          if (requestResponses.length === 0) {
            return []
          }

          // 4.2.5.2
          for (const requestResponse of requestResponses) {
            const idx = cache.indexOf(requestResponse)
            assert(idx !== -1)

            // 4.2.5.2.1
            cache.splice(idx, 1)
          }
        } else if (operation.type === 'put') { // 4.2.6
          // 4.2.6.1
          if (operation.response == null) {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'put operation should have an associated response'
            })
          }

          // 4.2.6.2
          const r = operation.request

          // 4.2.6.3
          if (!urlIsHttpHttpsScheme(r.url)) {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'expected http or https scheme'
            })
          }

          // 4.2.6.4
          if (r.method !== 'GET') {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'not get method'
            })
          }

          // 4.2.6.5
          if (operation.options != null) {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'options must not be defined'
            })
          }

          // 4.2.6.6
          requestResponses = this.#queryCache(operation.request)

          // 4.2.6.7
          for (const requestResponse of requestResponses) {
            const idx = cache.indexOf(requestResponse)
            assert(idx !== -1)

            // 4.2.6.7.1
            cache.splice(idx, 1)
          }

          // 4.2.6.8
          cache.push([operation.request, operation.response])

          // 4.2.6.10
          addedItems.push([operation.request, operation.response])
        }

        // 4.2.7
        resultList.push([operation.request, operation.response])
      }

      // 4.3
      return resultList
    } catch (e) { // 5.
      // 5.1
      this.#relevantRequestResponseList.length = 0

      // 5.2
      this.#relevantRequestResponseList = backupCache

      // 5.3
      throw e
    }
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#query-cache
   * @param {any} requestQuery
   * @param {import('../../types/cache').CacheQueryOptions} options
   * @param {requestResponseList} targetStorage
   * @returns {requestResponseList}
   */
  #queryCache (requestQuery, options, targetStorage) {
    /** @type {requestResponseList} */
    const resultList = []

    const storage = targetStorage ?? this.#relevantRequestResponseList

    for (const requestResponse of storage) {
      const [cachedRequest, cachedResponse] = requestResponse
      if (this.#requestMatchesCachedItem(requestQuery, cachedRequest, cachedResponse, options)) {
        resultList.push(requestResponse)
      }
    }

    return resultList
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#request-matches-cached-item-algorithm
   * @param {any} requestQuery
   * @param {any} request
   * @param {any | null} response
   * @param {import('../../types/cache').CacheQueryOptions | undefined} options
   * @returns {boolean}
   */
  #requestMatchesCachedItem (requestQuery, request, response = null, options) {
    // if (options?.ignoreMethod === false && request.method === 'GET') {
    //   return false
    // }

    const queryURL = new URL(requestQuery.url)

    const cachedURL = new URL(request.url)

    if (options?.ignoreSearch) {
      cachedURL.search = ''

      queryURL.search = ''
    }

    if (!urlEquals(queryURL, cachedURL, true)) {
      return false
    }

    if (
      response == null ||
      options?.ignoreVary ||
      !response.headersList.contains('vary')
    ) {
      return true
    }

    const fieldValues = getFieldValues(response.headersList.get('vary'))

    for (const fieldValue of fieldValues) {
      if (fieldValue === '*') {
        return false
      }

      const requestValue = request.headersList.get(fieldValue)
      const queryValue = requestQuery.headersList.get(fieldValue)

      // If one has the header and the other doesn't, or one has
      // a different value than the other, return false
      if (requestValue !== queryValue) {
        return false
      }
    }

    return true
  }

  #internalMatchAll (request, options, maxResponses = Infinity) {
    // 1.
    let r = null

    // 2.
    if (request !== undefined) {
      if (request instanceof Request) {
        // 2.1.1
        r = request[kState]

        // 2.1.2
        if (r.method !== 'GET' && !options.ignoreMethod) {
          return []
        }
      } else if (typeof request === 'string') {
        // 2.2.1
        r = new Request(request)[kState]
      }
    }

    // 5.
    // 5.1
    const responses = []

    // 5.2
    if (request === undefined) {
      // 5.2.1
      for (const requestResponse of this.#relevantRequestResponseList) {
        responses.push(requestResponse[1])
      }
    } else { // 5.3
      // 5.3.1
      const requestResponses = this.#queryCache(r, options)

      // 5.3.2
      for (const requestResponse of requestResponses) {
        responses.push(requestResponse[1])
      }
    }

    // 5.4
    // We don't implement CORs so we don't need to loop over the responses, yay!

    // 5.5.1
    const responseList = []

    // 5.5.2
    for (const response of responses) {
      // 5.5.2.1
      const responseObject = fromInnerResponse(response, 'immutable')

      responseList.push(responseObject.clone())

      if (responseList.length >= maxResponses) {
        break
      }
    }

    // 6.
    return Object.freeze(responseList)
  }
}

Object.defineProperties(Cache.prototype, {
  [Symbol.toStringTag]: {
    value: 'Cache',
    configurable: true
  },
  match: kEnumerableProperty,
  matchAll: kEnumerableProperty,
  add: kEnumerableProperty,
  addAll: kEnumerableProperty,
  put: kEnumerableProperty,
  delete: kEnumerableProperty,
  keys: kEnumerableProperty
})

const cacheQueryOptionConverters = [
  {
    key: 'ignoreSearch',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'ignoreMethod',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'ignoreVary',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  }
]

webidl.converters.CacheQueryOptions = webidl.dictionaryConverter(cacheQueryOptionConverters)

webidl.converters.MultiCacheQueryOptions = webidl.dictionaryConverter([
  ...cacheQueryOptionConverters,
  {
    key: 'cacheName',
    converter: webidl.converters.DOMString
  }
])

webidl.converters.Response = webidl.interfaceConverter(Response)

webidl.converters['sequence<RequestInfo>'] = webidl.sequenceConverter(
  webidl.converters.RequestInfo
)

module.exports = {
  Cache
}


/***/ }),

/***/ 3706:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { kConstruct } = __nccwpck_require__(5707)
const { Cache } = __nccwpck_require__(2509)
const { webidl } = __nccwpck_require__(9346)
const { kEnumerableProperty } = __nccwpck_require__(9099)

class CacheStorage {
  /**
   * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-name-to-cache-map
   * @type {Map<string, import('./cache').requestResponseList}
   */
  #caches = new Map()

  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }

    webidl.util.markAsUncloneable(this)
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, 'CacheStorage.match')

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.MultiCacheQueryOptions(options)

    // 1.
    if (options.cacheName != null) {
      // 1.1.1.1
      if (this.#caches.has(options.cacheName)) {
        // 1.1.1.1.1
        const cacheList = this.#caches.get(options.cacheName)
        const cache = new Cache(kConstruct, cacheList)

        return await cache.match(request, options)
      }
    } else { // 2.
      // 2.2
      for (const cacheList of this.#caches.values()) {
        const cache = new Cache(kConstruct, cacheList)

        // 2.2.1.2
        const response = await cache.match(request, options)

        if (response !== undefined) {
          return response
        }
      }
    }
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-has
   * @param {string} cacheName
   * @returns {Promise<boolean>}
   */
  async has (cacheName) {
    webidl.brandCheck(this, CacheStorage)

    const prefix = 'CacheStorage.has'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    cacheName = webidl.converters.DOMString(cacheName, prefix, 'cacheName')

    // 2.1.1
    // 2.2
    return this.#caches.has(cacheName)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#dom-cachestorage-open
   * @param {string} cacheName
   * @returns {Promise<Cache>}
   */
  async open (cacheName) {
    webidl.brandCheck(this, CacheStorage)

    const prefix = 'CacheStorage.open'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    cacheName = webidl.converters.DOMString(cacheName, prefix, 'cacheName')

    // 2.1
    if (this.#caches.has(cacheName)) {
      // await caches.open('v1') !== await caches.open('v1')

      // 2.1.1
      const cache = this.#caches.get(cacheName)

      // 2.1.1.1
      return new Cache(kConstruct, cache)
    }

    // 2.2
    const cache = []

    // 2.3
    this.#caches.set(cacheName, cache)

    // 2.4
    return new Cache(kConstruct, cache)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-delete
   * @param {string} cacheName
   * @returns {Promise<boolean>}
   */
  async delete (cacheName) {
    webidl.brandCheck(this, CacheStorage)

    const prefix = 'CacheStorage.delete'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    cacheName = webidl.converters.DOMString(cacheName, prefix, 'cacheName')

    return this.#caches.delete(cacheName)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#cache-storage-keys
   * @returns {Promise<string[]>}
   */
  async keys () {
    webidl.brandCheck(this, CacheStorage)

    // 2.1
    const keys = this.#caches.keys()

    // 2.2
    return [...keys]
  }
}

Object.defineProperties(CacheStorage.prototype, {
  [Symbol.toStringTag]: {
    value: 'CacheStorage',
    configurable: true
  },
  match: kEnumerableProperty,
  has: kEnumerableProperty,
  open: kEnumerableProperty,
  delete: kEnumerableProperty,
  keys: kEnumerableProperty
})

module.exports = {
  CacheStorage
}


/***/ }),

/***/ 5707:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


module.exports = {
  kConstruct: (__nccwpck_require__(46).kConstruct)
}


/***/ }),

/***/ 4808:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)
const { URLSerializer } = __nccwpck_require__(5253)
const { isValidHeaderName } = __nccwpck_require__(8185)

/**
 * @see https://url.spec.whatwg.org/#concept-url-equals
 * @param {URL} A
 * @param {URL} B
 * @param {boolean | undefined} excludeFragment
 * @returns {boolean}
 */
function urlEquals (A, B, excludeFragment = false) {
  const serializedA = URLSerializer(A, excludeFragment)

  const serializedB = URLSerializer(B, excludeFragment)

  return serializedA === serializedB
}

/**
 * @see https://github.com/chromium/chromium/blob/694d20d134cb553d8d89e5500b9148012b1ba299/content/browser/cache_storage/cache_storage_cache.cc#L260-L262
 * @param {string} header
 */
function getFieldValues (header) {
  assert(header !== null)

  const values = []

  for (let value of header.split(',')) {
    value = value.trim()

    if (isValidHeaderName(value)) {
      values.push(value)
    }
  }

  return values
}

module.exports = {
  urlEquals,
  getFieldValues
}


/***/ }),

/***/ 4740:
/***/ ((module) => {

"use strict";


// https://wicg.github.io/cookie-store/#cookie-maximum-attribute-value-size
const maxAttributeValueSize = 1024

// https://wicg.github.io/cookie-store/#cookie-maximum-name-value-pair-size
const maxNameValuePairSize = 4096

module.exports = {
  maxAttributeValueSize,
  maxNameValuePairSize
}


/***/ }),

/***/ 4418:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { parseSetCookie } = __nccwpck_require__(8844)
const { stringify } = __nccwpck_require__(6372)
const { webidl } = __nccwpck_require__(9346)
const { Headers } = __nccwpck_require__(1401)

/**
 * @typedef {Object} Cookie
 * @property {string} name
 * @property {string} value
 * @property {Date|number|undefined} expires
 * @property {number|undefined} maxAge
 * @property {string|undefined} domain
 * @property {string|undefined} path
 * @property {boolean|undefined} secure
 * @property {boolean|undefined} httpOnly
 * @property {'Strict'|'Lax'|'None'} sameSite
 * @property {string[]} unparsed
 */

/**
 * @param {Headers} headers
 * @returns {Record<string, string>}
 */
function getCookies (headers) {
  webidl.argumentLengthCheck(arguments, 1, 'getCookies')

  webidl.brandCheck(headers, Headers, { strict: false })

  const cookie = headers.get('cookie')
  const out = {}

  if (!cookie) {
    return out
  }

  for (const piece of cookie.split(';')) {
    const [name, ...value] = piece.split('=')

    out[name.trim()] = value.join('=')
  }

  return out
}

/**
 * @param {Headers} headers
 * @param {string} name
 * @param {{ path?: string, domain?: string }|undefined} attributes
 * @returns {void}
 */
function deleteCookie (headers, name, attributes) {
  webidl.brandCheck(headers, Headers, { strict: false })

  const prefix = 'deleteCookie'
  webidl.argumentLengthCheck(arguments, 2, prefix)

  name = webidl.converters.DOMString(name, prefix, 'name')
  attributes = webidl.converters.DeleteCookieAttributes(attributes)

  // Matches behavior of
  // https://github.com/denoland/deno_std/blob/63827b16330b82489a04614027c33b7904e08be5/http/cookie.ts#L278
  setCookie(headers, {
    name,
    value: '',
    expires: new Date(0),
    ...attributes
  })
}

/**
 * @param {Headers} headers
 * @returns {Cookie[]}
 */
function getSetCookies (headers) {
  webidl.argumentLengthCheck(arguments, 1, 'getSetCookies')

  webidl.brandCheck(headers, Headers, { strict: false })

  const cookies = headers.getSetCookie()

  if (!cookies) {
    return []
  }

  return cookies.map((pair) => parseSetCookie(pair))
}

/**
 * @param {Headers} headers
 * @param {Cookie} cookie
 * @returns {void}
 */
function setCookie (headers, cookie) {
  webidl.argumentLengthCheck(arguments, 2, 'setCookie')

  webidl.brandCheck(headers, Headers, { strict: false })

  cookie = webidl.converters.Cookie(cookie)

  const str = stringify(cookie)

  if (str) {
    headers.append('Set-Cookie', str)
  }
}

webidl.converters.DeleteCookieAttributes = webidl.dictionaryConverter([
  {
    converter: webidl.nullableConverter(webidl.converters.DOMString),
    key: 'path',
    defaultValue: () => null
  },
  {
    converter: webidl.nullableConverter(webidl.converters.DOMString),
    key: 'domain',
    defaultValue: () => null
  }
])

webidl.converters.Cookie = webidl.dictionaryConverter([
  {
    converter: webidl.converters.DOMString,
    key: 'name'
  },
  {
    converter: webidl.converters.DOMString,
    key: 'value'
  },
  {
    converter: webidl.nullableConverter((value) => {
      if (typeof value === 'number') {
        return webidl.converters['unsigned long long'](value)
      }

      return new Date(value)
    }),
    key: 'expires',
    defaultValue: () => null
  },
  {
    converter: webidl.nullableConverter(webidl.converters['long long']),
    key: 'maxAge',
    defaultValue: () => null
  },
  {
    converter: webidl.nullableConverter(webidl.converters.DOMString),
    key: 'domain',
    defaultValue: () => null
  },
  {
    converter: webidl.nullableConverter(webidl.converters.DOMString),
    key: 'path',
    defaultValue: () => null
  },
  {
    converter: webidl.nullableConverter(webidl.converters.boolean),
    key: 'secure',
    defaultValue: () => null
  },
  {
    converter: webidl.nullableConverter(webidl.converters.boolean),
    key: 'httpOnly',
    defaultValue: () => null
  },
  {
    converter: webidl.converters.USVString,
    key: 'sameSite',
    allowedValues: ['Strict', 'Lax', 'None']
  },
  {
    converter: webidl.sequenceConverter(webidl.converters.DOMString),
    key: 'unparsed',
    defaultValue: () => new Array(0)
  }
])

module.exports = {
  getCookies,
  deleteCookie,
  getSetCookies,
  setCookie
}


/***/ }),

/***/ 8844:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { maxNameValuePairSize, maxAttributeValueSize } = __nccwpck_require__(4740)
const { isCTLExcludingHtab } = __nccwpck_require__(6372)
const { collectASequenceOfCodePointsFast } = __nccwpck_require__(5253)
const assert = __nccwpck_require__(8061)

/**
 * @description Parses the field-value attributes of a set-cookie header string.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4
 * @param {string} header
 * @returns if the header is invalid, null will be returned
 */
function parseSetCookie (header) {
  // 1. If the set-cookie-string contains a %x00-08 / %x0A-1F / %x7F
  //    character (CTL characters excluding HTAB): Abort these steps and
  //    ignore the set-cookie-string entirely.
  if (isCTLExcludingHtab(header)) {
    return null
  }

  let nameValuePair = ''
  let unparsedAttributes = ''
  let name = ''
  let value = ''

  // 2. If the set-cookie-string contains a %x3B (";") character:
  if (header.includes(';')) {
    // 1. The name-value-pair string consists of the characters up to,
    //    but not including, the first %x3B (";"), and the unparsed-
    //    attributes consist of the remainder of the set-cookie-string
    //    (including the %x3B (";") in question).
    const position = { position: 0 }

    nameValuePair = collectASequenceOfCodePointsFast(';', header, position)
    unparsedAttributes = header.slice(position.position)
  } else {
    // Otherwise:

    // 1. The name-value-pair string consists of all the characters
    //    contained in the set-cookie-string, and the unparsed-
    //    attributes is the empty string.
    nameValuePair = header
  }

  // 3. If the name-value-pair string lacks a %x3D ("=") character, then
  //    the name string is empty, and the value string is the value of
  //    name-value-pair.
  if (!nameValuePair.includes('=')) {
    value = nameValuePair
  } else {
    //    Otherwise, the name string consists of the characters up to, but
    //    not including, the first %x3D ("=") character, and the (possibly
    //    empty) value string consists of the characters after the first
    //    %x3D ("=") character.
    const position = { position: 0 }
    name = collectASequenceOfCodePointsFast(
      '=',
      nameValuePair,
      position
    )
    value = nameValuePair.slice(position.position + 1)
  }

  // 4. Remove any leading or trailing WSP characters from the name
  //    string and the value string.
  name = name.trim()
  value = value.trim()

  // 5. If the sum of the lengths of the name string and the value string
  //    is more than 4096 octets, abort these steps and ignore the set-
  //    cookie-string entirely.
  if (name.length + value.length > maxNameValuePairSize) {
    return null
  }

  // 6. The cookie-name is the name string, and the cookie-value is the
  //    value string.
  return {
    name, value, ...parseUnparsedAttributes(unparsedAttributes)
  }
}

/**
 * Parses the remaining attributes of a set-cookie header
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4
 * @param {string} unparsedAttributes
 * @param {[Object.<string, unknown>]={}} cookieAttributeList
 */
function parseUnparsedAttributes (unparsedAttributes, cookieAttributeList = {}) {
  // 1. If the unparsed-attributes string is empty, skip the rest of
  //    these steps.
  if (unparsedAttributes.length === 0) {
    return cookieAttributeList
  }

  // 2. Discard the first character of the unparsed-attributes (which
  //    will be a %x3B (";") character).
  assert(unparsedAttributes[0] === ';')
  unparsedAttributes = unparsedAttributes.slice(1)

  let cookieAv = ''

  // 3. If the remaining unparsed-attributes contains a %x3B (";")
  //    character:
  if (unparsedAttributes.includes(';')) {
    // 1. Consume the characters of the unparsed-attributes up to, but
    //    not including, the first %x3B (";") character.
    cookieAv = collectASequenceOfCodePointsFast(
      ';',
      unparsedAttributes,
      { position: 0 }
    )
    unparsedAttributes = unparsedAttributes.slice(cookieAv.length)
  } else {
    // Otherwise:

    // 1. Consume the remainder of the unparsed-attributes.
    cookieAv = unparsedAttributes
    unparsedAttributes = ''
  }

  // Let the cookie-av string be the characters consumed in this step.

  let attributeName = ''
  let attributeValue = ''

  // 4. If the cookie-av string contains a %x3D ("=") character:
  if (cookieAv.includes('=')) {
    // 1. The (possibly empty) attribute-name string consists of the
    //    characters up to, but not including, the first %x3D ("=")
    //    character, and the (possibly empty) attribute-value string
    //    consists of the characters after the first %x3D ("=")
    //    character.
    const position = { position: 0 }

    attributeName = collectASequenceOfCodePointsFast(
      '=',
      cookieAv,
      position
    )
    attributeValue = cookieAv.slice(position.position + 1)
  } else {
    // Otherwise:

    // 1. The attribute-name string consists of the entire cookie-av
    //    string, and the attribute-value string is empty.
    attributeName = cookieAv
  }

  // 5. Remove any leading or trailing WSP characters from the attribute-
  //    name string and the attribute-value string.
  attributeName = attributeName.trim()
  attributeValue = attributeValue.trim()

  // 6. If the attribute-value is longer than 1024 octets, ignore the
  //    cookie-av string and return to Step 1 of this algorithm.
  if (attributeValue.length > maxAttributeValueSize) {
    return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList)
  }

  // 7. Process the attribute-name and attribute-value according to the
  //    requirements in the following subsections.  (Notice that
  //    attributes with unrecognized attribute-names are ignored.)
  const attributeNameLowercase = attributeName.toLowerCase()

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.1
  // If the attribute-name case-insensitively matches the string
  // "Expires", the user agent MUST process the cookie-av as follows.
  if (attributeNameLowercase === 'expires') {
    // 1. Let the expiry-time be the result of parsing the attribute-value
    //    as cookie-date (see Section 5.1.1).
    const expiryTime = new Date(attributeValue)

    // 2. If the attribute-value failed to parse as a cookie date, ignore
    //    the cookie-av.

    cookieAttributeList.expires = expiryTime
  } else if (attributeNameLowercase === 'max-age') {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.2
    // If the attribute-name case-insensitively matches the string "Max-
    // Age", the user agent MUST process the cookie-av as follows.

    // 1. If the first character of the attribute-value is not a DIGIT or a
    //    "-" character, ignore the cookie-av.
    const charCode = attributeValue.charCodeAt(0)

    if ((charCode < 48 || charCode > 57) && attributeValue[0] !== '-') {
      return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList)
    }

    // 2. If the remainder of attribute-value contains a non-DIGIT
    //    character, ignore the cookie-av.
    if (!/^\d+$/.test(attributeValue)) {
      return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList)
    }

    // 3. Let delta-seconds be the attribute-value converted to an integer.
    const deltaSeconds = Number(attributeValue)

    // 4. Let cookie-age-limit be the maximum age of the cookie (which
    //    SHOULD be 400 days or less, see Section 4.1.2.2).

    // 5. Set delta-seconds to the smaller of its present value and cookie-
    //    age-limit.
    // deltaSeconds = Math.min(deltaSeconds * 1000, maxExpiresMs)

    // 6. If delta-seconds is less than or equal to zero (0), let expiry-
    //    time be the earliest representable date and time.  Otherwise, let
    //    the expiry-time be the current date and time plus delta-seconds
    //    seconds.
    // const expiryTime = deltaSeconds <= 0 ? Date.now() : Date.now() + deltaSeconds

    // 7. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of Max-Age and an attribute-value of expiry-time.
    cookieAttributeList.maxAge = deltaSeconds
  } else if (attributeNameLowercase === 'domain') {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.3
    // If the attribute-name case-insensitively matches the string "Domain",
    // the user agent MUST process the cookie-av as follows.

    // 1. Let cookie-domain be the attribute-value.
    let cookieDomain = attributeValue

    // 2. If cookie-domain starts with %x2E ("."), let cookie-domain be
    //    cookie-domain without its leading %x2E (".").
    if (cookieDomain[0] === '.') {
      cookieDomain = cookieDomain.slice(1)
    }

    // 3. Convert the cookie-domain to lower case.
    cookieDomain = cookieDomain.toLowerCase()

    // 4. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of Domain and an attribute-value of cookie-domain.
    cookieAttributeList.domain = cookieDomain
  } else if (attributeNameLowercase === 'path') {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.4
    // If the attribute-name case-insensitively matches the string "Path",
    // the user agent MUST process the cookie-av as follows.

    // 1. If the attribute-value is empty or if the first character of the
    //    attribute-value is not %x2F ("/"):
    let cookiePath = ''
    if (attributeValue.length === 0 || attributeValue[0] !== '/') {
      // 1. Let cookie-path be the default-path.
      cookiePath = '/'
    } else {
      // Otherwise:

      // 1. Let cookie-path be the attribute-value.
      cookiePath = attributeValue
    }

    // 2. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of Path and an attribute-value of cookie-path.
    cookieAttributeList.path = cookiePath
  } else if (attributeNameLowercase === 'secure') {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.5
    // If the attribute-name case-insensitively matches the string "Secure",
    // the user agent MUST append an attribute to the cookie-attribute-list
    // with an attribute-name of Secure and an empty attribute-value.

    cookieAttributeList.secure = true
  } else if (attributeNameLowercase === 'httponly') {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.6
    // If the attribute-name case-insensitively matches the string
    // "HttpOnly", the user agent MUST append an attribute to the cookie-
    // attribute-list with an attribute-name of HttpOnly and an empty
    // attribute-value.

    cookieAttributeList.httpOnly = true
  } else if (attributeNameLowercase === 'samesite') {
    // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.7
    // If the attribute-name case-insensitively matches the string
    // "SameSite", the user agent MUST process the cookie-av as follows:

    // 1. Let enforcement be "Default".
    let enforcement = 'Default'

    const attributeValueLowercase = attributeValue.toLowerCase()
    // 2. If cookie-av's attribute-value is a case-insensitive match for
    //    "None", set enforcement to "None".
    if (attributeValueLowercase.includes('none')) {
      enforcement = 'None'
    }

    // 3. If cookie-av's attribute-value is a case-insensitive match for
    //    "Strict", set enforcement to "Strict".
    if (attributeValueLowercase.includes('strict')) {
      enforcement = 'Strict'
    }

    // 4. If cookie-av's attribute-value is a case-insensitive match for
    //    "Lax", set enforcement to "Lax".
    if (attributeValueLowercase.includes('lax')) {
      enforcement = 'Lax'
    }

    // 5. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of "SameSite" and an attribute-value of
    //    enforcement.
    cookieAttributeList.sameSite = enforcement
  } else {
    cookieAttributeList.unparsed ??= []

    cookieAttributeList.unparsed.push(`${attributeName}=${attributeValue}`)
  }

  // 8. Return to Step 1 of this algorithm.
  return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList)
}

module.exports = {
  parseSetCookie,
  parseUnparsedAttributes
}


/***/ }),

/***/ 6372:
/***/ ((module) => {

"use strict";


/**
 * @param {string} value
 * @returns {boolean}
 */
function isCTLExcludingHtab (value) {
  for (let i = 0; i < value.length; ++i) {
    const code = value.charCodeAt(i)

    if (
      (code >= 0x00 && code <= 0x08) ||
      (code >= 0x0A && code <= 0x1F) ||
      code === 0x7F
    ) {
      return true
    }
  }
  return false
}

/**
 CHAR           = <any US-ASCII character (octets 0 - 127)>
 token          = 1*<any CHAR except CTLs or separators>
 separators     = "(" | ")" | "<" | ">" | "@"
                | "," | ";" | ":" | "\" | <">
                | "/" | "[" | "]" | "?" | "="
                | "{" | "}" | SP | HT
 * @param {string} name
 */
function validateCookieName (name) {
  for (let i = 0; i < name.length; ++i) {
    const code = name.charCodeAt(i)

    if (
      code < 0x21 || // exclude CTLs (0-31), SP and HT
      code > 0x7E || // exclude non-ascii and DEL
      code === 0x22 || // "
      code === 0x28 || // (
      code === 0x29 || // )
      code === 0x3C || // <
      code === 0x3E || // >
      code === 0x40 || // @
      code === 0x2C || // ,
      code === 0x3B || // ;
      code === 0x3A || // :
      code === 0x5C || // \
      code === 0x2F || // /
      code === 0x5B || // [
      code === 0x5D || // ]
      code === 0x3F || // ?
      code === 0x3D || // =
      code === 0x7B || // {
      code === 0x7D // }
    ) {
      throw new Error('Invalid cookie name')
    }
  }
}

/**
 cookie-value      = *cookie-octet / ( DQUOTE *cookie-octet DQUOTE )
 cookie-octet      = %x21 / %x23-2B / %x2D-3A / %x3C-5B / %x5D-7E
                       ; US-ASCII characters excluding CTLs,
                       ; whitespace DQUOTE, comma, semicolon,
                       ; and backslash
 * @param {string} value
 */
function validateCookieValue (value) {
  let len = value.length
  let i = 0

  // if the value is wrapped in DQUOTE
  if (value[0] === '"') {
    if (len === 1 || value[len - 1] !== '"') {
      throw new Error('Invalid cookie value')
    }
    --len
    ++i
  }

  while (i < len) {
    const code = value.charCodeAt(i++)

    if (
      code < 0x21 || // exclude CTLs (0-31)
      code > 0x7E || // non-ascii and DEL (127)
      code === 0x22 || // "
      code === 0x2C || // ,
      code === 0x3B || // ;
      code === 0x5C // \
    ) {
      throw new Error('Invalid cookie value')
    }
  }
}

/**
 * path-value        = <any CHAR except CTLs or ";">
 * @param {string} path
 */
function validateCookiePath (path) {
  for (let i = 0; i < path.length; ++i) {
    const code = path.charCodeAt(i)

    if (
      code < 0x20 || // exclude CTLs (0-31)
      code === 0x7F || // DEL
      code === 0x3B // ;
    ) {
      throw new Error('Invalid cookie path')
    }
  }
}

/**
 * I have no idea why these values aren't allowed to be honest,
 * but Deno tests these. - Khafra
 * @param {string} domain
 */
function validateCookieDomain (domain) {
  if (
    domain.startsWith('-') ||
    domain.endsWith('.') ||
    domain.endsWith('-')
  ) {
    throw new Error('Invalid cookie domain')
  }
}

const IMFDays = [
  'Sun', 'Mon', 'Tue', 'Wed',
  'Thu', 'Fri', 'Sat'
]

const IMFMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const IMFPaddedNumbers = Array(61).fill(0).map((_, i) => i.toString().padStart(2, '0'))

/**
 * @see https://www.rfc-editor.org/rfc/rfc7231#section-7.1.1.1
 * @param {number|Date} date
  IMF-fixdate  = day-name "," SP date1 SP time-of-day SP GMT
  ; fixed length/zone/capitalization subset of the format
  ; see Section 3.3 of [RFC5322]

  day-name     = %x4D.6F.6E ; "Mon", case-sensitive
              / %x54.75.65 ; "Tue", case-sensitive
              / %x57.65.64 ; "Wed", case-sensitive
              / %x54.68.75 ; "Thu", case-sensitive
              / %x46.72.69 ; "Fri", case-sensitive
              / %x53.61.74 ; "Sat", case-sensitive
              / %x53.75.6E ; "Sun", case-sensitive
  date1        = day SP month SP year
                  ; e.g., 02 Jun 1982

  day          = 2DIGIT
  month        = %x4A.61.6E ; "Jan", case-sensitive
              / %x46.65.62 ; "Feb", case-sensitive
              / %x4D.61.72 ; "Mar", case-sensitive
              / %x41.70.72 ; "Apr", case-sensitive
              / %x4D.61.79 ; "May", case-sensitive
              / %x4A.75.6E ; "Jun", case-sensitive
              / %x4A.75.6C ; "Jul", case-sensitive
              / %x41.75.67 ; "Aug", case-sensitive
              / %x53.65.70 ; "Sep", case-sensitive
              / %x4F.63.74 ; "Oct", case-sensitive
              / %x4E.6F.76 ; "Nov", case-sensitive
              / %x44.65.63 ; "Dec", case-sensitive
  year         = 4DIGIT

  GMT          = %x47.4D.54 ; "GMT", case-sensitive

  time-of-day  = hour ":" minute ":" second
              ; 00:00:00 - 23:59:60 (leap second)

  hour         = 2DIGIT
  minute       = 2DIGIT
  second       = 2DIGIT
 */
function toIMFDate (date) {
  if (typeof date === 'number') {
    date = new Date(date)
  }

  return `${IMFDays[date.getUTCDay()]}, ${IMFPaddedNumbers[date.getUTCDate()]} ${IMFMonths[date.getUTCMonth()]} ${date.getUTCFullYear()} ${IMFPaddedNumbers[date.getUTCHours()]}:${IMFPaddedNumbers[date.getUTCMinutes()]}:${IMFPaddedNumbers[date.getUTCSeconds()]} GMT`
}

/**
 max-age-av        = "Max-Age=" non-zero-digit *DIGIT
                       ; In practice, both expires-av and max-age-av
                       ; are limited to dates representable by the
                       ; user agent.
 * @param {number} maxAge
 */
function validateCookieMaxAge (maxAge) {
  if (maxAge < 0) {
    throw new Error('Invalid cookie max-age')
  }
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc6265#section-4.1.1
 * @param {import('./index').Cookie} cookie
 */
function stringify (cookie) {
  if (cookie.name.length === 0) {
    return null
  }

  validateCookieName(cookie.name)
  validateCookieValue(cookie.value)

  const out = [`${cookie.name}=${cookie.value}`]

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-cookie-prefixes-00#section-3.1
  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-cookie-prefixes-00#section-3.2
  if (cookie.name.startsWith('__Secure-')) {
    cookie.secure = true
  }

  if (cookie.name.startsWith('__Host-')) {
    cookie.secure = true
    cookie.domain = null
    cookie.path = '/'
  }

  if (cookie.secure) {
    out.push('Secure')
  }

  if (cookie.httpOnly) {
    out.push('HttpOnly')
  }

  if (typeof cookie.maxAge === 'number') {
    validateCookieMaxAge(cookie.maxAge)
    out.push(`Max-Age=${cookie.maxAge}`)
  }

  if (cookie.domain) {
    validateCookieDomain(cookie.domain)
    out.push(`Domain=${cookie.domain}`)
  }

  if (cookie.path) {
    validateCookiePath(cookie.path)
    out.push(`Path=${cookie.path}`)
  }

  if (cookie.expires && cookie.expires.toString() !== 'Invalid Date') {
    out.push(`Expires=${toIMFDate(cookie.expires)}`)
  }

  if (cookie.sameSite) {
    out.push(`SameSite=${cookie.sameSite}`)
  }

  for (const part of cookie.unparsed) {
    if (!part.includes('=')) {
      throw new Error('Invalid unparsed')
    }

    const [key, ...value] = part.split('=')

    out.push(`${key.trim()}=${value.join('=')}`)
  }

  return out.join('; ')
}

module.exports = {
  isCTLExcludingHtab,
  validateCookieName,
  validateCookiePath,
  validateCookieValue,
  toIMFDate,
  stringify
}


/***/ }),

/***/ 8258:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

const { Transform } = __nccwpck_require__(4492)
const { isASCIINumber, isValidLastEventId } = __nccwpck_require__(3069)

/**
 * @type {number[]} BOM
 */
const BOM = [0xEF, 0xBB, 0xBF]
/**
 * @type {10} LF
 */
const LF = 0x0A
/**
 * @type {13} CR
 */
const CR = 0x0D
/**
 * @type {58} COLON
 */
const COLON = 0x3A
/**
 * @type {32} SPACE
 */
const SPACE = 0x20

/**
 * @typedef {object} EventSourceStreamEvent
 * @type {object}
 * @property {string} [event] The event type.
 * @property {string} [data] The data of the message.
 * @property {string} [id] A unique ID for the event.
 * @property {string} [retry] The reconnection time, in milliseconds.
 */

/**
 * @typedef eventSourceSettings
 * @type {object}
 * @property {string} lastEventId The last event ID received from the server.
 * @property {string} origin The origin of the event source.
 * @property {number} reconnectionTime The reconnection time, in milliseconds.
 */

class EventSourceStream extends Transform {
  /**
   * @type {eventSourceSettings}
   */
  state = null

  /**
   * Leading byte-order-mark check.
   * @type {boolean}
   */
  checkBOM = true

  /**
   * @type {boolean}
   */
  crlfCheck = false

  /**
   * @type {boolean}
   */
  eventEndCheck = false

  /**
   * @type {Buffer}
   */
  buffer = null

  pos = 0

  event = {
    data: undefined,
    event: undefined,
    id: undefined,
    retry: undefined
  }

  /**
   * @param {object} options
   * @param {eventSourceSettings} options.eventSourceSettings
   * @param {Function} [options.push]
   */
  constructor (options = {}) {
    // Enable object mode as EventSourceStream emits objects of shape
    // EventSourceStreamEvent
    options.readableObjectMode = true

    super(options)

    this.state = options.eventSourceSettings || {}
    if (options.push) {
      this.push = options.push
    }
  }

  /**
   * @param {Buffer} chunk
   * @param {string} _encoding
   * @param {Function} callback
   * @returns {void}
   */
  _transform (chunk, _encoding, callback) {
    if (chunk.length === 0) {
      callback()
      return
    }

    // Cache the chunk in the buffer, as the data might not be complete while
    // processing it
    // TODO: Investigate if there is a more performant way to handle
    // incoming chunks
    // see: https://github.com/nodejs/undici/issues/2630
    if (this.buffer) {
      this.buffer = Buffer.concat([this.buffer, chunk])
    } else {
      this.buffer = chunk
    }

    // Strip leading byte-order-mark if we opened the stream and started
    // the processing of the incoming data
    if (this.checkBOM) {
      switch (this.buffer.length) {
        case 1:
          // Check if the first byte is the same as the first byte of the BOM
          if (this.buffer[0] === BOM[0]) {
            // If it is, we need to wait for more data
            callback()
            return
          }
          // Set the checkBOM flag to false as we don't need to check for the
          // BOM anymore
          this.checkBOM = false

          // The buffer only contains one byte so we need to wait for more data
          callback()
          return
        case 2:
          // Check if the first two bytes are the same as the first two bytes
          // of the BOM
          if (
            this.buffer[0] === BOM[0] &&
            this.buffer[1] === BOM[1]
          ) {
            // If it is, we need to wait for more data, because the third byte
            // is needed to determine if it is the BOM or not
            callback()
            return
          }

          // Set the checkBOM flag to false as we don't need to check for the
          // BOM anymore
          this.checkBOM = false
          break
        case 3:
          // Check if the first three bytes are the same as the first three
          // bytes of the BOM
          if (
            this.buffer[0] === BOM[0] &&
            this.buffer[1] === BOM[1] &&
            this.buffer[2] === BOM[2]
          ) {
            // If it is, we can drop the buffered data, as it is only the BOM
            this.buffer = Buffer.alloc(0)
            // Set the checkBOM flag to false as we don't need to check for the
            // BOM anymore
            this.checkBOM = false

            // Await more data
            callback()
            return
          }
          // If it is not the BOM, we can start processing the data
          this.checkBOM = false
          break
        default:
          // The buffer is longer than 3 bytes, so we can drop the BOM if it is
          // present
          if (
            this.buffer[0] === BOM[0] &&
            this.buffer[1] === BOM[1] &&
            this.buffer[2] === BOM[2]
          ) {
            // Remove the BOM from the buffer
            this.buffer = this.buffer.subarray(3)
          }

          // Set the checkBOM flag to false as we don't need to check for the
          this.checkBOM = false
          break
      }
    }

    while (this.pos < this.buffer.length) {
      // If the previous line ended with an end-of-line, we need to check
      // if the next character is also an end-of-line.
      if (this.eventEndCheck) {
        // If the the current character is an end-of-line, then the event
        // is finished and we can process it

        // If the previous line ended with a carriage return, we need to
        // check if the current character is a line feed and remove it
        // from the buffer.
        if (this.crlfCheck) {
          // If the current character is a line feed, we can remove it
          // from the buffer and reset the crlfCheck flag
          if (this.buffer[this.pos] === LF) {
            this.buffer = this.buffer.subarray(this.pos + 1)
            this.pos = 0
            this.crlfCheck = false

            // It is possible that the line feed is not the end of the
            // event. We need to check if the next character is an
            // end-of-line character to determine if the event is
            // finished. We simply continue the loop to check the next
            // character.

            // As we removed the line feed from the buffer and set the
            // crlfCheck flag to false, we basically don't make any
            // distinction between a line feed and a carriage return.
            continue
          }
          this.crlfCheck = false
        }

        if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
          // If the current character is a carriage return, we need to
          // set the crlfCheck flag to true, as we need to check if the
          // next character is a line feed so we can remove it from the
          // buffer
          if (this.buffer[this.pos] === CR) {
            this.crlfCheck = true
          }

          this.buffer = this.buffer.subarray(this.pos + 1)
          this.pos = 0
          if (
            this.event.data !== undefined || this.event.event || this.event.id || this.event.retry) {
            this.processEvent(this.event)
          }
          this.clearEvent()
          continue
        }
        // If the current character is not an end-of-line, then the event
        // is not finished and we have to reset the eventEndCheck flag
        this.eventEndCheck = false
        continue
      }

      // If the current character is an end-of-line, we can process the
      // line
      if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
        // If the current character is a carriage return, we need to
        // set the crlfCheck flag to true, as we need to check if the
        // next character is a line feed
        if (this.buffer[this.pos] === CR) {
          this.crlfCheck = true
        }

        // In any case, we can process the line as we reached an
        // end-of-line character
        this.parseLine(this.buffer.subarray(0, this.pos), this.event)

        // Remove the processed line from the buffer
        this.buffer = this.buffer.subarray(this.pos + 1)
        // Reset the position as we removed the processed line from the buffer
        this.pos = 0
        // A line was processed and this could be the end of the event. We need
        // to check if the next line is empty to determine if the event is
        // finished.
        this.eventEndCheck = true
        continue
      }

      this.pos++
    }

    callback()
  }

  /**
   * @param {Buffer} line
   * @param {EventStreamEvent} event
   */
  parseLine (line, event) {
    // If the line is empty (a blank line)
    // Dispatch the event, as defined below.
    // This will be handled in the _transform method
    if (line.length === 0) {
      return
    }

    // If the line starts with a U+003A COLON character (:)
    // Ignore the line.
    const colonPosition = line.indexOf(COLON)
    if (colonPosition === 0) {
      return
    }

    let field = ''
    let value = ''

    // If the line contains a U+003A COLON character (:)
    if (colonPosition !== -1) {
      // Collect the characters on the line before the first U+003A COLON
      // character (:), and let field be that string.
      // TODO: Investigate if there is a more performant way to extract the
      // field
      // see: https://github.com/nodejs/undici/issues/2630
      field = line.subarray(0, colonPosition).toString('utf8')

      // Collect the characters on the line after the first U+003A COLON
      // character (:), and let value be that string.
      // If value starts with a U+0020 SPACE character, remove it from value.
      let valueStart = colonPosition + 1
      if (line[valueStart] === SPACE) {
        ++valueStart
      }
      // TODO: Investigate if there is a more performant way to extract the
      // value
      // see: https://github.com/nodejs/undici/issues/2630
      value = line.subarray(valueStart).toString('utf8')

      // Otherwise, the string is not empty but does not contain a U+003A COLON
      // character (:)
    } else {
      // Process the field using the steps described below, using the whole
      // line as the field name, and the empty string as the field value.
      field = line.toString('utf8')
      value = ''
    }

    // Modify the event with the field name and value. The value is also
    // decoded as UTF-8
    switch (field) {
      case 'data':
        if (event[field] === undefined) {
          event[field] = value
        } else {
          event[field] += `\n${value}`
        }
        break
      case 'retry':
        if (isASCIINumber(value)) {
          event[field] = value
        }
        break
      case 'id':
        if (isValidLastEventId(value)) {
          event[field] = value
        }
        break
      case 'event':
        if (value.length > 0) {
          event[field] = value
        }
        break
    }
  }

  /**
   * @param {EventSourceStreamEvent} event
   */
  processEvent (event) {
    if (event.retry && isASCIINumber(event.retry)) {
      this.state.reconnectionTime = parseInt(event.retry, 10)
    }

    if (event.id && isValidLastEventId(event.id)) {
      this.state.lastEventId = event.id
    }

    // only dispatch event, when data is provided
    if (event.data !== undefined) {
      this.push({
        type: event.event || 'message',
        options: {
          data: event.data,
          lastEventId: this.state.lastEventId,
          origin: this.state.origin
        }
      })
    }
  }

  clearEvent () {
    this.event = {
      data: undefined,
      event: undefined,
      id: undefined,
      retry: undefined
    }
  }
}

module.exports = {
  EventSourceStream
}


/***/ }),

/***/ 9008:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { pipeline } = __nccwpck_require__(4492)
const { fetching } = __nccwpck_require__(7935)
const { makeRequest } = __nccwpck_require__(9884)
const { webidl } = __nccwpck_require__(9346)
const { EventSourceStream } = __nccwpck_require__(8258)
const { parseMIMEType } = __nccwpck_require__(5253)
const { createFastMessageEvent } = __nccwpck_require__(1225)
const { isNetworkError } = __nccwpck_require__(6120)
const { delay } = __nccwpck_require__(3069)
const { kEnumerableProperty } = __nccwpck_require__(9099)
const { environmentSettingsObject } = __nccwpck_require__(8185)

let experimentalWarned = false

/**
 * A reconnection time, in milliseconds. This must initially be an implementation-defined value,
 * probably in the region of a few seconds.
 *
 * In Comparison:
 * - Chrome uses 3000ms.
 * - Deno uses 5000ms.
 *
 * @type {3000}
 */
const defaultReconnectionTime = 3000

/**
 * The readyState attribute represents the state of the connection.
 * @enum
 * @readonly
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#dom-eventsource-readystate-dev
 */

/**
 * The connection has not yet been established, or it was closed and the user
 * agent is reconnecting.
 * @type {0}
 */
const CONNECTING = 0

/**
 * The user agent has an open connection and is dispatching events as it
 * receives them.
 * @type {1}
 */
const OPEN = 1

/**
 * The connection is not open, and the user agent is not trying to reconnect.
 * @type {2}
 */
const CLOSED = 2

/**
 * Requests for the element will have their mode set to "cors" and their credentials mode set to "same-origin".
 * @type {'anonymous'}
 */
const ANONYMOUS = 'anonymous'

/**
 * Requests for the element will have their mode set to "cors" and their credentials mode set to "include".
 * @type {'use-credentials'}
 */
const USE_CREDENTIALS = 'use-credentials'

/**
 * The EventSource interface is used to receive server-sent events. It
 * connects to a server over HTTP and receives events in text/event-stream
 * format without closing the connection.
 * @extends {EventTarget}
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events
 * @api public
 */
class EventSource extends EventTarget {
  #events = {
    open: null,
    error: null,
    message: null
  }

  #url = null
  #withCredentials = false

  #readyState = CONNECTING

  #request = null
  #controller = null

  #dispatcher

  /**
   * @type {import('./eventsource-stream').eventSourceSettings}
   */
  #state

  /**
   * Creates a new EventSource object.
   * @param {string} url
   * @param {EventSourceInit} [eventSourceInitDict]
   * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface
   */
  constructor (url, eventSourceInitDict = {}) {
    // 1. Let ev be a new EventSource object.
    super()

    webidl.util.markAsUncloneable(this)

    const prefix = 'EventSource constructor'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    if (!experimentalWarned) {
      experimentalWarned = true
      process.emitWarning('EventSource is experimental, expect them to change at any time.', {
        code: 'UNDICI-ES'
      })
    }

    url = webidl.converters.USVString(url, prefix, 'url')
    eventSourceInitDict = webidl.converters.EventSourceInitDict(eventSourceInitDict, prefix, 'eventSourceInitDict')

    this.#dispatcher = eventSourceInitDict.dispatcher
    this.#state = {
      lastEventId: '',
      reconnectionTime: defaultReconnectionTime
    }

    // 2. Let settings be ev's relevant settings object.
    // https://html.spec.whatwg.org/multipage/webappapis.html#environment-settings-object
    const settings = environmentSettingsObject

    let urlRecord

    try {
      // 3. Let urlRecord be the result of encoding-parsing a URL given url, relative to settings.
      urlRecord = new URL(url, settings.settingsObject.baseUrl)
      this.#state.origin = urlRecord.origin
    } catch (e) {
      // 4. If urlRecord is failure, then throw a "SyntaxError" DOMException.
      throw new DOMException(e, 'SyntaxError')
    }

    // 5. Set ev's url to urlRecord.
    this.#url = urlRecord.href

    // 6. Let corsAttributeState be Anonymous.
    let corsAttributeState = ANONYMOUS

    // 7. If the value of eventSourceInitDict's withCredentials member is true,
    // then set corsAttributeState to Use Credentials and set ev's
    // withCredentials attribute to true.
    if (eventSourceInitDict.withCredentials) {
      corsAttributeState = USE_CREDENTIALS
      this.#withCredentials = true
    }

    // 8. Let request be the result of creating a potential-CORS request given
    // urlRecord, the empty string, and corsAttributeState.
    const initRequest = {
      redirect: 'follow',
      keepalive: true,
      // @see https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes
      mode: 'cors',
      credentials: corsAttributeState === 'anonymous'
        ? 'same-origin'
        : 'omit',
      referrer: 'no-referrer'
    }

    // 9. Set request's client to settings.
    initRequest.client = environmentSettingsObject.settingsObject

    // 10. User agents may set (`Accept`, `text/event-stream`) in request's header list.
    initRequest.headersList = [['accept', { name: 'accept', value: 'text/event-stream' }]]

    // 11. Set request's cache mode to "no-store".
    initRequest.cache = 'no-store'

    // 12. Set request's initiator type to "other".
    initRequest.initiator = 'other'

    initRequest.urlList = [new URL(this.#url)]

    // 13. Set ev's request to request.
    this.#request = makeRequest(initRequest)

    this.#connect()
  }

  /**
   * Returns the state of this EventSource object's connection. It can have the
   * values described below.
   * @returns {0|1|2}
   * @readonly
   */
  get readyState () {
    return this.#readyState
  }

  /**
   * Returns the URL providing the event stream.
   * @readonly
   * @returns {string}
   */
  get url () {
    return this.#url
  }

  /**
   * Returns a boolean indicating whether the EventSource object was
   * instantiated with CORS credentials set (true), or not (false, the default).
   */
  get withCredentials () {
    return this.#withCredentials
  }

  #connect () {
    if (this.#readyState === CLOSED) return

    this.#readyState = CONNECTING

    const fetchParams = {
      request: this.#request,
      dispatcher: this.#dispatcher
    }

    // 14. Let processEventSourceEndOfBody given response res be the following step: if res is not a network error, then reestablish the connection.
    const processEventSourceEndOfBody = (response) => {
      if (isNetworkError(response)) {
        this.dispatchEvent(new Event('error'))
        this.close()
      }

      this.#reconnect()
    }

    // 15. Fetch request, with processResponseEndOfBody set to processEventSourceEndOfBody...
    fetchParams.processResponseEndOfBody = processEventSourceEndOfBody

    // and processResponse set to the following steps given response res:
    fetchParams.processResponse = (response) => {
      // 1. If res is an aborted network error, then fail the connection.

      if (isNetworkError(response)) {
        // 1. When a user agent is to fail the connection, the user agent
        // must queue a task which, if the readyState attribute is set to a
        // value other than CLOSED, sets the readyState attribute to CLOSED
        // and fires an event named error at the EventSource object. Once the
        // user agent has failed the connection, it does not attempt to
        // reconnect.
        if (response.aborted) {
          this.close()
          this.dispatchEvent(new Event('error'))
          return
          // 2. Otherwise, if res is a network error, then reestablish the
          // connection, unless the user agent knows that to be futile, in
          // which case the user agent may fail the connection.
        } else {
          this.#reconnect()
          return
        }
      }

      // 3. Otherwise, if res's status is not 200, or if res's `Content-Type`
      // is not `text/event-stream`, then fail the connection.
      const contentType = response.headersList.get('content-type', true)
      const mimeType = contentType !== null ? parseMIMEType(contentType) : 'failure'
      const contentTypeValid = mimeType !== 'failure' && mimeType.essence === 'text/event-stream'
      if (
        response.status !== 200 ||
        contentTypeValid === false
      ) {
        this.close()
        this.dispatchEvent(new Event('error'))
        return
      }

      // 4. Otherwise, announce the connection and interpret res's body
      // line by line.

      // When a user agent is to announce the connection, the user agent
      // must queue a task which, if the readyState attribute is set to a
      // value other than CLOSED, sets the readyState attribute to OPEN
      // and fires an event named open at the EventSource object.
      // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model
      this.#readyState = OPEN
      this.dispatchEvent(new Event('open'))

      // If redirected to a different origin, set the origin to the new origin.
      this.#state.origin = response.urlList[response.urlList.length - 1].origin

      const eventSourceStream = new EventSourceStream({
        eventSourceSettings: this.#state,
        push: (event) => {
          this.dispatchEvent(createFastMessageEvent(
            event.type,
            event.options
          ))
        }
      })

      pipeline(response.body.stream,
        eventSourceStream,
        (error) => {
          if (
            error?.aborted === false
          ) {
            this.close()
            this.dispatchEvent(new Event('error'))
          }
        })
    }

    this.#controller = fetching(fetchParams)
  }

  /**
   * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model
   * @returns {Promise<void>}
   */
  async #reconnect () {
    // When a user agent is to reestablish the connection, the user agent must
    // run the following steps. These steps are run in parallel, not as part of
    // a task. (The tasks that it queues, of course, are run like normal tasks
    // and not themselves in parallel.)

    // 1. Queue a task to run the following steps:

    //   1. If the readyState attribute is set to CLOSED, abort the task.
    if (this.#readyState === CLOSED) return

    //   2. Set the readyState attribute to CONNECTING.
    this.#readyState = CONNECTING

    //   3. Fire an event named error at the EventSource object.
    this.dispatchEvent(new Event('error'))

    // 2. Wait a delay equal to the reconnection time of the event source.
    await delay(this.#state.reconnectionTime)

    // 5. Queue a task to run the following steps:

    //   1. If the EventSource object's readyState attribute is not set to
    //      CONNECTING, then return.
    if (this.#readyState !== CONNECTING) return

    //   2. Let request be the EventSource object's request.
    //   3. If the EventSource object's last event ID string is not the empty
    //      string, then:
    //      1. Let lastEventIDValue be the EventSource object's last event ID
    //         string, encoded as UTF-8.
    //      2. Set (`Last-Event-ID`, lastEventIDValue) in request's header
    //         list.
    if (this.#state.lastEventId.length) {
      this.#request.headersList.set('last-event-id', this.#state.lastEventId, true)
    }

    //   4. Fetch request and process the response obtained in this fashion, if any, as described earlier in this section.
    this.#connect()
  }

  /**
   * Closes the connection, if any, and sets the readyState attribute to
   * CLOSED.
   */
  close () {
    webidl.brandCheck(this, EventSource)

    if (this.#readyState === CLOSED) return
    this.#readyState = CLOSED
    this.#controller.abort()
    this.#request = null
  }

  get onopen () {
    return this.#events.open
  }

  set onopen (fn) {
    if (this.#events.open) {
      this.removeEventListener('open', this.#events.open)
    }

    if (typeof fn === 'function') {
      this.#events.open = fn
      this.addEventListener('open', fn)
    } else {
      this.#events.open = null
    }
  }

  get onmessage () {
    return this.#events.message
  }

  set onmessage (fn) {
    if (this.#events.message) {
      this.removeEventListener('message', this.#events.message)
    }

    if (typeof fn === 'function') {
      this.#events.message = fn
      this.addEventListener('message', fn)
    } else {
      this.#events.message = null
    }
  }

  get onerror () {
    return this.#events.error
  }

  set onerror (fn) {
    if (this.#events.error) {
      this.removeEventListener('error', this.#events.error)
    }

    if (typeof fn === 'function') {
      this.#events.error = fn
      this.addEventListener('error', fn)
    } else {
      this.#events.error = null
    }
  }
}

const constantsPropertyDescriptors = {
  CONNECTING: {
    __proto__: null,
    configurable: false,
    enumerable: true,
    value: CONNECTING,
    writable: false
  },
  OPEN: {
    __proto__: null,
    configurable: false,
    enumerable: true,
    value: OPEN,
    writable: false
  },
  CLOSED: {
    __proto__: null,
    configurable: false,
    enumerable: true,
    value: CLOSED,
    writable: false
  }
}

Object.defineProperties(EventSource, constantsPropertyDescriptors)
Object.defineProperties(EventSource.prototype, constantsPropertyDescriptors)

Object.defineProperties(EventSource.prototype, {
  close: kEnumerableProperty,
  onerror: kEnumerableProperty,
  onmessage: kEnumerableProperty,
  onopen: kEnumerableProperty,
  readyState: kEnumerableProperty,
  url: kEnumerableProperty,
  withCredentials: kEnumerableProperty
})

webidl.converters.EventSourceInitDict = webidl.dictionaryConverter([
  {
    key: 'withCredentials',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'dispatcher', // undici only
    converter: webidl.converters.any
  }
])

module.exports = {
  EventSource,
  defaultReconnectionTime
}


/***/ }),

/***/ 3069:
/***/ ((module) => {

"use strict";


/**
 * Checks if the given value is a valid LastEventId.
 * @param {string} value
 * @returns {boolean}
 */
function isValidLastEventId (value) {
  // LastEventId should not contain U+0000 NULL
  return value.indexOf('\u0000') === -1
}

/**
 * Checks if the given value is a base 10 digit.
 * @param {string} value
 * @returns {boolean}
 */
function isASCIINumber (value) {
  if (value.length === 0) return false
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 0x30 || value.charCodeAt(i) > 0x39) return false
  }
  return true
}

// https://github.com/nodejs/undici/issues/2664
function delay (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref()
  })
}

module.exports = {
  isValidLastEventId,
  isASCIINumber,
  delay
}


/***/ }),

/***/ 2585:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const util = __nccwpck_require__(9099)
const {
  ReadableStreamFrom,
  isBlobLike,
  isReadableStreamLike,
  readableStreamClose,
  createDeferredPromise,
  fullyReadBody,
  extractMimeType,
  utf8DecodeBytes
} = __nccwpck_require__(8185)
const { FormData } = __nccwpck_require__(2744)
const { kState } = __nccwpck_require__(1937)
const { webidl } = __nccwpck_require__(9346)
const { Blob } = __nccwpck_require__(2254)
const assert = __nccwpck_require__(8061)
const { isErrored, isDisturbed } = __nccwpck_require__(4492)
const { isArrayBuffer } = __nccwpck_require__(3746)
const { serializeAMimeType } = __nccwpck_require__(5253)
const { multipartFormDataParser } = __nccwpck_require__(4593)
let random

try {
  const crypto = __nccwpck_require__(6005)
  random = (max) => crypto.randomInt(0, max)
} catch {
  random = (max) => Math.floor(Math.random(max))
}

const textEncoder = new TextEncoder()
function noop () {}

const hasFinalizationRegistry = globalThis.FinalizationRegistry && process.version.indexOf('v18') !== 0
let streamRegistry

if (hasFinalizationRegistry) {
  streamRegistry = new FinalizationRegistry((weakRef) => {
    const stream = weakRef.deref()
    if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
      stream.cancel('Response object has been garbage collected').catch(noop)
    }
  })
}

// https://fetch.spec.whatwg.org/#concept-bodyinit-extract
function extractBody (object, keepalive = false) {
  // 1. Let stream be null.
  let stream = null

  // 2. If object is a ReadableStream object, then set stream to object.
  if (object instanceof ReadableStream) {
    stream = object
  } else if (isBlobLike(object)) {
    // 3. Otherwise, if object is a Blob object, set stream to the
    //    result of running object’s get stream.
    stream = object.stream()
  } else {
    // 4. Otherwise, set stream to a new ReadableStream object, and set
    //    up stream with byte reading support.
    stream = new ReadableStream({
      async pull (controller) {
        const buffer = typeof source === 'string' ? textEncoder.encode(source) : source

        if (buffer.byteLength) {
          controller.enqueue(buffer)
        }

        queueMicrotask(() => readableStreamClose(controller))
      },
      start () {},
      type: 'bytes'
    })
  }

  // 5. Assert: stream is a ReadableStream object.
  assert(isReadableStreamLike(stream))

  // 6. Let action be null.
  let action = null

  // 7. Let source be null.
  let source = null

  // 8. Let length be null.
  let length = null

  // 9. Let type be null.
  let type = null

  // 10. Switch on object:
  if (typeof object === 'string') {
    // Set source to the UTF-8 encoding of object.
    // Note: setting source to a Uint8Array here breaks some mocking assumptions.
    source = object

    // Set type to `text/plain;charset=UTF-8`.
    type = 'text/plain;charset=UTF-8'
  } else if (object instanceof URLSearchParams) {
    // URLSearchParams

    // spec says to run application/x-www-form-urlencoded on body.list
    // this is implemented in Node.js as apart of an URLSearchParams instance toString method
    // See: https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L490
    // and https://github.com/nodejs/node/blob/e46c680bf2b211bbd52cf959ca17ee98c7f657f5/lib/internal/url.js#L1100

    // Set source to the result of running the application/x-www-form-urlencoded serializer with object’s list.
    source = object.toString()

    // Set type to `application/x-www-form-urlencoded;charset=UTF-8`.
    type = 'application/x-www-form-urlencoded;charset=UTF-8'
  } else if (isArrayBuffer(object)) {
    // BufferSource/ArrayBuffer

    // Set source to a copy of the bytes held by object.
    source = new Uint8Array(object.slice())
  } else if (ArrayBuffer.isView(object)) {
    // BufferSource/ArrayBufferView

    // Set source to a copy of the bytes held by object.
    source = new Uint8Array(object.buffer.slice(object.byteOffset, object.byteOffset + object.byteLength))
  } else if (util.isFormDataLike(object)) {
    const boundary = `----formdata-undici-0${`${random(1e11)}`.padStart(11, '0')}`
    const prefix = `--${boundary}\r\nContent-Disposition: form-data`

    /*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> */
    const escape = (str) =>
      str.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22')
    const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, '\r\n')

    // Set action to this step: run the multipart/form-data
    // encoding algorithm, with object’s entry list and UTF-8.
    // - This ensures that the body is immutable and can't be changed afterwords
    // - That the content-length is calculated in advance.
    // - And that all parts are pre-encoded and ready to be sent.

    const blobParts = []
    const rn = new Uint8Array([13, 10]) // '\r\n'
    length = 0
    let hasUnknownSizeValue = false

    for (const [name, value] of object) {
      if (typeof value === 'string') {
        const chunk = textEncoder.encode(prefix +
          `; name="${escape(normalizeLinefeeds(name))}"` +
          `\r\n\r\n${normalizeLinefeeds(value)}\r\n`)
        blobParts.push(chunk)
        length += chunk.byteLength
      } else {
        const chunk = textEncoder.encode(`${prefix}; name="${escape(normalizeLinefeeds(name))}"` +
          (value.name ? `; filename="${escape(value.name)}"` : '') + '\r\n' +
          `Content-Type: ${
            value.type || 'application/octet-stream'
          }\r\n\r\n`)
        blobParts.push(chunk, value, rn)
        if (typeof value.size === 'number') {
          length += chunk.byteLength + value.size + rn.byteLength
        } else {
          hasUnknownSizeValue = true
        }
      }
    }

    // CRLF is appended to the body to function with legacy servers and match other implementations.
    // https://github.com/curl/curl/blob/3434c6b46e682452973972e8313613dfa58cd690/lib/mime.c#L1029-L1030
    // https://github.com/form-data/form-data/issues/63
    const chunk = textEncoder.encode(`--${boundary}--\r\n`)
    blobParts.push(chunk)
    length += chunk.byteLength
    if (hasUnknownSizeValue) {
      length = null
    }

    // Set source to object.
    source = object

    action = async function * () {
      for (const part of blobParts) {
        if (part.stream) {
          yield * part.stream()
        } else {
          yield part
        }
      }
    }

    // Set type to `multipart/form-data; boundary=`,
    // followed by the multipart/form-data boundary string generated
    // by the multipart/form-data encoding algorithm.
    type = `multipart/form-data; boundary=${boundary}`
  } else if (isBlobLike(object)) {
    // Blob

    // Set source to object.
    source = object

    // Set length to object’s size.
    length = object.size

    // If object’s type attribute is not the empty byte sequence, set
    // type to its value.
    if (object.type) {
      type = object.type
    }
  } else if (typeof object[Symbol.asyncIterator] === 'function') {
    // If keepalive is true, then throw a TypeError.
    if (keepalive) {
      throw new TypeError('keepalive')
    }

    // If object is disturbed or locked, then throw a TypeError.
    if (util.isDisturbed(object) || object.locked) {
      throw new TypeError(
        'Response body object should not be disturbed or locked'
      )
    }

    stream =
      object instanceof ReadableStream ? object : ReadableStreamFrom(object)
  }

  // 11. If source is a byte sequence, then set action to a
  // step that returns source and length to source’s length.
  if (typeof source === 'string' || util.isBuffer(source)) {
    length = Buffer.byteLength(source)
  }

  // 12. If action is non-null, then run these steps in in parallel:
  if (action != null) {
    // Run action.
    let iterator
    stream = new ReadableStream({
      async start () {
        iterator = action(object)[Symbol.asyncIterator]()
      },
      async pull (controller) {
        const { value, done } = await iterator.next()
        if (done) {
          // When running action is done, close stream.
          queueMicrotask(() => {
            controller.close()
            controller.byobRequest?.respond(0)
          })
        } else {
          // Whenever one or more bytes are available and stream is not errored,
          // enqueue a Uint8Array wrapping an ArrayBuffer containing the available
          // bytes into stream.
          if (!isErrored(stream)) {
            const buffer = new Uint8Array(value)
            if (buffer.byteLength) {
              controller.enqueue(buffer)
            }
          }
        }
        return controller.desiredSize > 0
      },
      async cancel (reason) {
        await iterator.return()
      },
      type: 'bytes'
    })
  }

  // 13. Let body be a body whose stream is stream, source is source,
  // and length is length.
  const body = { stream, source, length }

  // 14. Return (body, type).
  return [body, type]
}

// https://fetch.spec.whatwg.org/#bodyinit-safely-extract
function safelyExtractBody (object, keepalive = false) {
  // To safely extract a body and a `Content-Type` value from
  // a byte sequence or BodyInit object object, run these steps:

  // 1. If object is a ReadableStream object, then:
  if (object instanceof ReadableStream) {
    // Assert: object is neither disturbed nor locked.
    // istanbul ignore next
    assert(!util.isDisturbed(object), 'The body has already been consumed.')
    // istanbul ignore next
    assert(!object.locked, 'The stream is locked.')
  }

  // 2. Return the results of extracting object.
  return extractBody(object, keepalive)
}

function cloneBody (instance, body) {
  // To clone a body body, run these steps:

  // https://fetch.spec.whatwg.org/#concept-body-clone

  // 1. Let « out1, out2 » be the result of teeing body’s stream.
  const [out1, out2] = body.stream.tee()

  // 2. Set body’s stream to out1.
  body.stream = out1

  // 3. Return a body whose stream is out2 and other members are copied from body.
  return {
    stream: out2,
    length: body.length,
    source: body.source
  }
}

function throwIfAborted (state) {
  if (state.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

function bodyMixinMethods (instance) {
  const methods = {
    blob () {
      // The blob() method steps are to return the result of
      // running consume body with this and the following step
      // given a byte sequence bytes: return a Blob whose
      // contents are bytes and whose type attribute is this’s
      // MIME type.
      return consumeBody(this, (bytes) => {
        let mimeType = bodyMimeType(this)

        if (mimeType === null) {
          mimeType = ''
        } else if (mimeType) {
          mimeType = serializeAMimeType(mimeType)
        }

        // Return a Blob whose contents are bytes and type attribute
        // is mimeType.
        return new Blob([bytes], { type: mimeType })
      }, instance)
    },

    arrayBuffer () {
      // The arrayBuffer() method steps are to return the result
      // of running consume body with this and the following step
      // given a byte sequence bytes: return a new ArrayBuffer
      // whose contents are bytes.
      return consumeBody(this, (bytes) => {
        return new Uint8Array(bytes).buffer
      }, instance)
    },

    text () {
      // The text() method steps are to return the result of running
      // consume body with this and UTF-8 decode.
      return consumeBody(this, utf8DecodeBytes, instance)
    },

    json () {
      // The json() method steps are to return the result of running
      // consume body with this and parse JSON from bytes.
      return consumeBody(this, parseJSONFromBytes, instance)
    },

    formData () {
      // The formData() method steps are to return the result of running
      // consume body with this and the following step given a byte sequence bytes:
      return consumeBody(this, (value) => {
        // 1. Let mimeType be the result of get the MIME type with this.
        const mimeType = bodyMimeType(this)

        // 2. If mimeType is non-null, then switch on mimeType’s essence and run
        //    the corresponding steps:
        if (mimeType !== null) {
          switch (mimeType.essence) {
            case 'multipart/form-data': {
              // 1. ... [long step]
              const parsed = multipartFormDataParser(value, mimeType)

              // 2. If that fails for some reason, then throw a TypeError.
              if (parsed === 'failure') {
                throw new TypeError('Failed to parse body as FormData.')
              }

              // 3. Return a new FormData object, appending each entry,
              //    resulting from the parsing operation, to its entry list.
              const fd = new FormData()
              fd[kState] = parsed

              return fd
            }
            case 'application/x-www-form-urlencoded': {
              // 1. Let entries be the result of parsing bytes.
              const entries = new URLSearchParams(value.toString())

              // 2. If entries is failure, then throw a TypeError.

              // 3. Return a new FormData object whose entry list is entries.
              const fd = new FormData()

              for (const [name, value] of entries) {
                fd.append(name, value)
              }

              return fd
            }
          }
        }

        // 3. Throw a TypeError.
        throw new TypeError(
          'Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".'
        )
      }, instance)
    },

    bytes () {
      // The bytes() method steps are to return the result of running consume body
      // with this and the following step given a byte sequence bytes: return the
      // result of creating a Uint8Array from bytes in this’s relevant realm.
      return consumeBody(this, (bytes) => {
        return new Uint8Array(bytes)
      }, instance)
    }
  }

  return methods
}

function mixinBody (prototype) {
  Object.assign(prototype.prototype, bodyMixinMethods(prototype))
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-body-consume-body
 * @param {Response|Request} object
 * @param {(value: unknown) => unknown} convertBytesToJSValue
 * @param {Response|Request} instance
 */
async function consumeBody (object, convertBytesToJSValue, instance) {
  webidl.brandCheck(object, instance)

  // 1. If object is unusable, then return a promise rejected
  //    with a TypeError.
  if (bodyUnusable(object)) {
    throw new TypeError('Body is unusable: Body has already been read')
  }

  throwIfAborted(object[kState])

  // 2. Let promise be a new promise.
  const promise = createDeferredPromise()

  // 3. Let errorSteps given error be to reject promise with error.
  const errorSteps = (error) => promise.reject(error)

  // 4. Let successSteps given a byte sequence data be to resolve
  //    promise with the result of running convertBytesToJSValue
  //    with data. If that threw an exception, then run errorSteps
  //    with that exception.
  const successSteps = (data) => {
    try {
      promise.resolve(convertBytesToJSValue(data))
    } catch (e) {
      errorSteps(e)
    }
  }

  // 5. If object’s body is null, then run successSteps with an
  //    empty byte sequence.
  if (object[kState].body == null) {
    successSteps(Buffer.allocUnsafe(0))
    return promise.promise
  }

  // 6. Otherwise, fully read object’s body given successSteps,
  //    errorSteps, and object’s relevant global object.
  await fullyReadBody(object[kState].body, successSteps, errorSteps)

  // 7. Return promise.
  return promise.promise
}

// https://fetch.spec.whatwg.org/#body-unusable
function bodyUnusable (object) {
  const body = object[kState].body

  // An object including the Body interface mixin is
  // said to be unusable if its body is non-null and
  // its body’s stream is disturbed or locked.
  return body != null && (body.stream.locked || util.isDisturbed(body.stream))
}

/**
 * @see https://infra.spec.whatwg.org/#parse-json-bytes-to-a-javascript-value
 * @param {Uint8Array} bytes
 */
function parseJSONFromBytes (bytes) {
  return JSON.parse(utf8DecodeBytes(bytes))
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-body-mime-type
 * @param {import('./response').Response|import('./request').Request} requestOrResponse
 */
function bodyMimeType (requestOrResponse) {
  // 1. Let headers be null.
  // 2. If requestOrResponse is a Request object, then set headers to requestOrResponse’s request’s header list.
  // 3. Otherwise, set headers to requestOrResponse’s response’s header list.
  /** @type {import('./headers').HeadersList} */
  const headers = requestOrResponse[kState].headersList

  // 4. Let mimeType be the result of extracting a MIME type from headers.
  const mimeType = extractMimeType(headers)

  // 5. If mimeType is failure, then return null.
  if (mimeType === 'failure') {
    return null
  }

  // 6. Return mimeType.
  return mimeType
}

module.exports = {
  extractBody,
  safelyExtractBody,
  cloneBody,
  mixinBody,
  streamRegistry,
  hasFinalizationRegistry,
  bodyUnusable
}


/***/ }),

/***/ 6564:
/***/ ((module) => {

"use strict";


const corsSafeListedMethods = /** @type {const} */ (['GET', 'HEAD', 'POST'])
const corsSafeListedMethodsSet = new Set(corsSafeListedMethods)

const nullBodyStatus = /** @type {const} */ ([101, 204, 205, 304])

const redirectStatus = /** @type {const} */ ([301, 302, 303, 307, 308])
const redirectStatusSet = new Set(redirectStatus)

/**
 * @see https://fetch.spec.whatwg.org/#block-bad-port
 */
const badPorts = /** @type {const} */ ([
  '1', '7', '9', '11', '13', '15', '17', '19', '20', '21', '22', '23', '25', '37', '42', '43', '53', '69', '77', '79',
  '87', '95', '101', '102', '103', '104', '109', '110', '111', '113', '115', '117', '119', '123', '135', '137',
  '139', '143', '161', '179', '389', '427', '465', '512', '513', '514', '515', '526', '530', '531', '532',
  '540', '548', '554', '556', '563', '587', '601', '636', '989', '990', '993', '995', '1719', '1720', '1723',
  '2049', '3659', '4045', '4190', '5060', '5061', '6000', '6566', '6665', '6666', '6667', '6668', '6669', '6679',
  '6697', '10080'
])
const badPortsSet = new Set(badPorts)

/**
 * @see https://w3c.github.io/webappsec-referrer-policy/#referrer-policies
 */
const referrerPolicy = /** @type {const} */ ([
  '',
  'no-referrer',
  'no-referrer-when-downgrade',
  'same-origin',
  'origin',
  'strict-origin',
  'origin-when-cross-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url'
])
const referrerPolicySet = new Set(referrerPolicy)

const requestRedirect = /** @type {const} */ (['follow', 'manual', 'error'])

const safeMethods = /** @type {const} */ (['GET', 'HEAD', 'OPTIONS', 'TRACE'])
const safeMethodsSet = new Set(safeMethods)

const requestMode = /** @type {const} */ (['navigate', 'same-origin', 'no-cors', 'cors'])

const requestCredentials = /** @type {const} */ (['omit', 'same-origin', 'include'])

const requestCache = /** @type {const} */ ([
  'default',
  'no-store',
  'reload',
  'no-cache',
  'force-cache',
  'only-if-cached'
])

/**
 * @see https://fetch.spec.whatwg.org/#request-body-header-name
 */
const requestBodyHeader = /** @type {const} */ ([
  'content-encoding',
  'content-language',
  'content-location',
  'content-type',
  // See https://github.com/nodejs/undici/issues/2021
  // 'Content-Length' is a forbidden header name, which is typically
  // removed in the Headers implementation. However, undici doesn't
  // filter out headers, so we add it here.
  'content-length'
])

/**
 * @see https://fetch.spec.whatwg.org/#enumdef-requestduplex
 */
const requestDuplex = /** @type {const} */ ([
  'half'
])

/**
 * @see http://fetch.spec.whatwg.org/#forbidden-method
 */
const forbiddenMethods = /** @type {const} */ (['CONNECT', 'TRACE', 'TRACK'])
const forbiddenMethodsSet = new Set(forbiddenMethods)

const subresource = /** @type {const} */ ([
  'audio',
  'audioworklet',
  'font',
  'image',
  'manifest',
  'paintworklet',
  'script',
  'style',
  'track',
  'video',
  'xslt',
  ''
])
const subresourceSet = new Set(subresource)

module.exports = {
  subresource,
  forbiddenMethods,
  requestBodyHeader,
  referrerPolicy,
  requestRedirect,
  requestMode,
  requestCredentials,
  requestCache,
  redirectStatus,
  corsSafeListedMethods,
  nullBodyStatus,
  safeMethods,
  badPorts,
  requestDuplex,
  subresourceSet,
  badPortsSet,
  redirectStatusSet,
  corsSafeListedMethodsSet,
  safeMethodsSet,
  forbiddenMethodsSet,
  referrerPolicySet
}


/***/ }),

/***/ 5253:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const assert = __nccwpck_require__(8061)

const encoder = new TextEncoder()

/**
 * @see https://mimesniff.spec.whatwg.org/#http-token-code-point
 */
const HTTP_TOKEN_CODEPOINTS = /^[!#$%&'*+\-.^_|~A-Za-z0-9]+$/
const HTTP_WHITESPACE_REGEX = /[\u000A\u000D\u0009\u0020]/ // eslint-disable-line
const ASCII_WHITESPACE_REPLACE_REGEX = /[\u0009\u000A\u000C\u000D\u0020]/g // eslint-disable-line
/**
 * @see https://mimesniff.spec.whatwg.org/#http-quoted-string-token-code-point
 */
const HTTP_QUOTED_STRING_TOKENS = /^[\u0009\u0020-\u007E\u0080-\u00FF]+$/ // eslint-disable-line

// https://fetch.spec.whatwg.org/#data-url-processor
/** @param {URL} dataURL */
function dataURLProcessor (dataURL) {
  // 1. Assert: dataURL’s scheme is "data".
  assert(dataURL.protocol === 'data:')

  // 2. Let input be the result of running the URL
  // serializer on dataURL with exclude fragment
  // set to true.
  let input = URLSerializer(dataURL, true)

  // 3. Remove the leading "data:" string from input.
  input = input.slice(5)

  // 4. Let position point at the start of input.
  const position = { position: 0 }

  // 5. Let mimeType be the result of collecting a
  // sequence of code points that are not equal
  // to U+002C (,), given position.
  let mimeType = collectASequenceOfCodePointsFast(
    ',',
    input,
    position
  )

  // 6. Strip leading and trailing ASCII whitespace
  // from mimeType.
  // Undici implementation note: we need to store the
  // length because if the mimetype has spaces removed,
  // the wrong amount will be sliced from the input in
  // step #9
  const mimeTypeLength = mimeType.length
  mimeType = removeASCIIWhitespace(mimeType, true, true)

  // 7. If position is past the end of input, then
  // return failure
  if (position.position >= input.length) {
    return 'failure'
  }

  // 8. Advance position by 1.
  position.position++

  // 9. Let encodedBody be the remainder of input.
  const encodedBody = input.slice(mimeTypeLength + 1)

  // 10. Let body be the percent-decoding of encodedBody.
  let body = stringPercentDecode(encodedBody)

  // 11. If mimeType ends with U+003B (;), followed by
  // zero or more U+0020 SPACE, followed by an ASCII
  // case-insensitive match for "base64", then:
  if (/;(\u0020){0,}base64$/i.test(mimeType)) {
    // 1. Let stringBody be the isomorphic decode of body.
    const stringBody = isomorphicDecode(body)

    // 2. Set body to the forgiving-base64 decode of
    // stringBody.
    body = forgivingBase64(stringBody)

    // 3. If body is failure, then return failure.
    if (body === 'failure') {
      return 'failure'
    }

    // 4. Remove the last 6 code points from mimeType.
    mimeType = mimeType.slice(0, -6)

    // 5. Remove trailing U+0020 SPACE code points from mimeType,
    // if any.
    mimeType = mimeType.replace(/(\u0020)+$/, '')

    // 6. Remove the last U+003B (;) code point from mimeType.
    mimeType = mimeType.slice(0, -1)
  }

  // 12. If mimeType starts with U+003B (;), then prepend
  // "text/plain" to mimeType.
  if (mimeType.startsWith(';')) {
    mimeType = 'text/plain' + mimeType
  }

  // 13. Let mimeTypeRecord be the result of parsing
  // mimeType.
  let mimeTypeRecord = parseMIMEType(mimeType)

  // 14. If mimeTypeRecord is failure, then set
  // mimeTypeRecord to text/plain;charset=US-ASCII.
  if (mimeTypeRecord === 'failure') {
    mimeTypeRecord = parseMIMEType('text/plain;charset=US-ASCII')
  }

  // 15. Return a new data: URL struct whose MIME
  // type is mimeTypeRecord and body is body.
  // https://fetch.spec.whatwg.org/#data-url-struct
  return { mimeType: mimeTypeRecord, body }
}

// https://url.spec.whatwg.org/#concept-url-serializer
/**
 * @param {URL} url
 * @param {boolean} excludeFragment
 */
function URLSerializer (url, excludeFragment = false) {
  if (!excludeFragment) {
    return url.href
  }

  const href = url.href
  const hashLength = url.hash.length

  const serialized = hashLength === 0 ? href : href.substring(0, href.length - hashLength)

  if (!hashLength && href.endsWith('#')) {
    return serialized.slice(0, -1)
  }

  return serialized
}

// https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points
/**
 * @param {(char: string) => boolean} condition
 * @param {string} input
 * @param {{ position: number }} position
 */
function collectASequenceOfCodePoints (condition, input, position) {
  // 1. Let result be the empty string.
  let result = ''

  // 2. While position doesn’t point past the end of input and the
  // code point at position within input meets the condition condition:
  while (position.position < input.length && condition(input[position.position])) {
    // 1. Append that code point to the end of result.
    result += input[position.position]

    // 2. Advance position by 1.
    position.position++
  }

  // 3. Return result.
  return result
}

/**
 * A faster collectASequenceOfCodePoints that only works when comparing a single character.
 * @param {string} char
 * @param {string} input
 * @param {{ position: number }} position
 */
function collectASequenceOfCodePointsFast (char, input, position) {
  const idx = input.indexOf(char, position.position)
  const start = position.position

  if (idx === -1) {
    position.position = input.length
    return input.slice(start)
  }

  position.position = idx
  return input.slice(start, position.position)
}

// https://url.spec.whatwg.org/#string-percent-decode
/** @param {string} input */
function stringPercentDecode (input) {
  // 1. Let bytes be the UTF-8 encoding of input.
  const bytes = encoder.encode(input)

  // 2. Return the percent-decoding of bytes.
  return percentDecode(bytes)
}

/**
 * @param {number} byte
 */
function isHexCharByte (byte) {
  // 0-9 A-F a-f
  return (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x46) || (byte >= 0x61 && byte <= 0x66)
}

/**
 * @param {number} byte
 */
function hexByteToNumber (byte) {
  return (
    // 0-9
    byte >= 0x30 && byte <= 0x39
      ? (byte - 48)
    // Convert to uppercase
    // ((byte & 0xDF) - 65) + 10
      : ((byte & 0xDF) - 55)
  )
}

// https://url.spec.whatwg.org/#percent-decode
/** @param {Uint8Array} input */
function percentDecode (input) {
  const length = input.length
  // 1. Let output be an empty byte sequence.
  /** @type {Uint8Array} */
  const output = new Uint8Array(length)
  let j = 0
  // 2. For each byte byte in input:
  for (let i = 0; i < length; ++i) {
    const byte = input[i]

    // 1. If byte is not 0x25 (%), then append byte to output.
    if (byte !== 0x25) {
      output[j++] = byte

    // 2. Otherwise, if byte is 0x25 (%) and the next two bytes
    // after byte in input are not in the ranges
    // 0x30 (0) to 0x39 (9), 0x41 (A) to 0x46 (F),
    // and 0x61 (a) to 0x66 (f), all inclusive, append byte
    // to output.
    } else if (
      byte === 0x25 &&
      !(isHexCharByte(input[i + 1]) && isHexCharByte(input[i + 2]))
    ) {
      output[j++] = 0x25

    // 3. Otherwise:
    } else {
      // 1. Let bytePoint be the two bytes after byte in input,
      // decoded, and then interpreted as hexadecimal number.
      // 2. Append a byte whose value is bytePoint to output.
      output[j++] = (hexByteToNumber(input[i + 1]) << 4) | hexByteToNumber(input[i + 2])

      // 3. Skip the next two bytes in input.
      i += 2
    }
  }

  // 3. Return output.
  return length === j ? output : output.subarray(0, j)
}

// https://mimesniff.spec.whatwg.org/#parse-a-mime-type
/** @param {string} input */
function parseMIMEType (input) {
  // 1. Remove any leading and trailing HTTP whitespace
  // from input.
  input = removeHTTPWhitespace(input, true, true)

  // 2. Let position be a position variable for input,
  // initially pointing at the start of input.
  const position = { position: 0 }

  // 3. Let type be the result of collecting a sequence
  // of code points that are not U+002F (/) from
  // input, given position.
  const type = collectASequenceOfCodePointsFast(
    '/',
    input,
    position
  )

  // 4. If type is the empty string or does not solely
  // contain HTTP token code points, then return failure.
  // https://mimesniff.spec.whatwg.org/#http-token-code-point
  if (type.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(type)) {
    return 'failure'
  }

  // 5. If position is past the end of input, then return
  // failure
  if (position.position > input.length) {
    return 'failure'
  }

  // 6. Advance position by 1. (This skips past U+002F (/).)
  position.position++

  // 7. Let subtype be the result of collecting a sequence of
  // code points that are not U+003B (;) from input, given
  // position.
  let subtype = collectASequenceOfCodePointsFast(
    ';',
    input,
    position
  )

  // 8. Remove any trailing HTTP whitespace from subtype.
  subtype = removeHTTPWhitespace(subtype, false, true)

  // 9. If subtype is the empty string or does not solely
  // contain HTTP token code points, then return failure.
  if (subtype.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(subtype)) {
    return 'failure'
  }

  const typeLowercase = type.toLowerCase()
  const subtypeLowercase = subtype.toLowerCase()

  // 10. Let mimeType be a new MIME type record whose type
  // is type, in ASCII lowercase, and subtype is subtype,
  // in ASCII lowercase.
  // https://mimesniff.spec.whatwg.org/#mime-type
  const mimeType = {
    type: typeLowercase,
    subtype: subtypeLowercase,
    /** @type {Map<string, string>} */
    parameters: new Map(),
    // https://mimesniff.spec.whatwg.org/#mime-type-essence
    essence: `${typeLowercase}/${subtypeLowercase}`
  }

  // 11. While position is not past the end of input:
  while (position.position < input.length) {
    // 1. Advance position by 1. (This skips past U+003B (;).)
    position.position++

    // 2. Collect a sequence of code points that are HTTP
    // whitespace from input given position.
    collectASequenceOfCodePoints(
      // https://fetch.spec.whatwg.org/#http-whitespace
      char => HTTP_WHITESPACE_REGEX.test(char),
      input,
      position
    )

    // 3. Let parameterName be the result of collecting a
    // sequence of code points that are not U+003B (;)
    // or U+003D (=) from input, given position.
    let parameterName = collectASequenceOfCodePoints(
      (char) => char !== ';' && char !== '=',
      input,
      position
    )

    // 4. Set parameterName to parameterName, in ASCII
    // lowercase.
    parameterName = parameterName.toLowerCase()

    // 5. If position is not past the end of input, then:
    if (position.position < input.length) {
      // 1. If the code point at position within input is
      // U+003B (;), then continue.
      if (input[position.position] === ';') {
        continue
      }

      // 2. Advance position by 1. (This skips past U+003D (=).)
      position.position++
    }

    // 6. If position is past the end of input, then break.
    if (position.position > input.length) {
      break
    }

    // 7. Let parameterValue be null.
    let parameterValue = null

    // 8. If the code point at position within input is
    // U+0022 ("), then:
    if (input[position.position] === '"') {
      // 1. Set parameterValue to the result of collecting
      // an HTTP quoted string from input, given position
      // and the extract-value flag.
      parameterValue = collectAnHTTPQuotedString(input, position, true)

      // 2. Collect a sequence of code points that are not
      // U+003B (;) from input, given position.
      collectASequenceOfCodePointsFast(
        ';',
        input,
        position
      )

    // 9. Otherwise:
    } else {
      // 1. Set parameterValue to the result of collecting
      // a sequence of code points that are not U+003B (;)
      // from input, given position.
      parameterValue = collectASequenceOfCodePointsFast(
        ';',
        input,
        position
      )

      // 2. Remove any trailing HTTP whitespace from parameterValue.
      parameterValue = removeHTTPWhitespace(parameterValue, false, true)

      // 3. If parameterValue is the empty string, then continue.
      if (parameterValue.length === 0) {
        continue
      }
    }

    // 10. If all of the following are true
    // - parameterName is not the empty string
    // - parameterName solely contains HTTP token code points
    // - parameterValue solely contains HTTP quoted-string token code points
    // - mimeType’s parameters[parameterName] does not exist
    // then set mimeType’s parameters[parameterName] to parameterValue.
    if (
      parameterName.length !== 0 &&
      HTTP_TOKEN_CODEPOINTS.test(parameterName) &&
      (parameterValue.length === 0 || HTTP_QUOTED_STRING_TOKENS.test(parameterValue)) &&
      !mimeType.parameters.has(parameterName)
    ) {
      mimeType.parameters.set(parameterName, parameterValue)
    }
  }

  // 12. Return mimeType.
  return mimeType
}

// https://infra.spec.whatwg.org/#forgiving-base64-decode
/** @param {string} data */
function forgivingBase64 (data) {
  // 1. Remove all ASCII whitespace from data.
  data = data.replace(ASCII_WHITESPACE_REPLACE_REGEX, '')  // eslint-disable-line

  let dataLength = data.length
  // 2. If data’s code point length divides by 4 leaving
  // no remainder, then:
  if (dataLength % 4 === 0) {
    // 1. If data ends with one or two U+003D (=) code points,
    // then remove them from data.
    if (data.charCodeAt(dataLength - 1) === 0x003D) {
      --dataLength
      if (data.charCodeAt(dataLength - 1) === 0x003D) {
        --dataLength
      }
    }
  }

  // 3. If data’s code point length divides by 4 leaving
  // a remainder of 1, then return failure.
  if (dataLength % 4 === 1) {
    return 'failure'
  }

  // 4. If data contains a code point that is not one of
  //  U+002B (+)
  //  U+002F (/)
  //  ASCII alphanumeric
  // then return failure.
  if (/[^+/0-9A-Za-z]/.test(data.length === dataLength ? data : data.substring(0, dataLength))) {
    return 'failure'
  }

  const buffer = Buffer.from(data, 'base64')
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

// https://fetch.spec.whatwg.org/#collect-an-http-quoted-string
// tests: https://fetch.spec.whatwg.org/#example-http-quoted-string
/**
 * @param {string} input
 * @param {{ position: number }} position
 * @param {boolean?} extractValue
 */
function collectAnHTTPQuotedString (input, position, extractValue) {
  // 1. Let positionStart be position.
  const positionStart = position.position

  // 2. Let value be the empty string.
  let value = ''

  // 3. Assert: the code point at position within input
  // is U+0022 (").
  assert(input[position.position] === '"')

  // 4. Advance position by 1.
  position.position++

  // 5. While true:
  while (true) {
    // 1. Append the result of collecting a sequence of code points
    // that are not U+0022 (") or U+005C (\) from input, given
    // position, to value.
    value += collectASequenceOfCodePoints(
      (char) => char !== '"' && char !== '\\',
      input,
      position
    )

    // 2. If position is past the end of input, then break.
    if (position.position >= input.length) {
      break
    }

    // 3. Let quoteOrBackslash be the code point at position within
    // input.
    const quoteOrBackslash = input[position.position]

    // 4. Advance position by 1.
    position.position++

    // 5. If quoteOrBackslash is U+005C (\), then:
    if (quoteOrBackslash === '\\') {
      // 1. If position is past the end of input, then append
      // U+005C (\) to value and break.
      if (position.position >= input.length) {
        value += '\\'
        break
      }

      // 2. Append the code point at position within input to value.
      value += input[position.position]

      // 3. Advance position by 1.
      position.position++

    // 6. Otherwise:
    } else {
      // 1. Assert: quoteOrBackslash is U+0022 (").
      assert(quoteOrBackslash === '"')

      // 2. Break.
      break
    }
  }

  // 6. If the extract-value flag is set, then return value.
  if (extractValue) {
    return value
  }

  // 7. Return the code points from positionStart to position,
  // inclusive, within input.
  return input.slice(positionStart, position.position)
}

/**
 * @see https://mimesniff.spec.whatwg.org/#serialize-a-mime-type
 */
function serializeAMimeType (mimeType) {
  assert(mimeType !== 'failure')
  const { parameters, essence } = mimeType

  // 1. Let serialization be the concatenation of mimeType’s
  //    type, U+002F (/), and mimeType’s subtype.
  let serialization = essence

  // 2. For each name → value of mimeType’s parameters:
  for (let [name, value] of parameters.entries()) {
    // 1. Append U+003B (;) to serialization.
    serialization += ';'

    // 2. Append name to serialization.
    serialization += name

    // 3. Append U+003D (=) to serialization.
    serialization += '='

    // 4. If value does not solely contain HTTP token code
    //    points or value is the empty string, then:
    if (!HTTP_TOKEN_CODEPOINTS.test(value)) {
      // 1. Precede each occurrence of U+0022 (") or
      //    U+005C (\) in value with U+005C (\).
      value = value.replace(/(\\|")/g, '\\$1')

      // 2. Prepend U+0022 (") to value.
      value = '"' + value

      // 3. Append U+0022 (") to value.
      value += '"'
    }

    // 5. Append value to serialization.
    serialization += value
  }

  // 3. Return serialization.
  return serialization
}

/**
 * @see https://fetch.spec.whatwg.org/#http-whitespace
 * @param {number} char
 */
function isHTTPWhiteSpace (char) {
  // "\r\n\t "
  return char === 0x00d || char === 0x00a || char === 0x009 || char === 0x020
}

/**
 * @see https://fetch.spec.whatwg.org/#http-whitespace
 * @param {string} str
 * @param {boolean} [leading=true]
 * @param {boolean} [trailing=true]
 */
function removeHTTPWhitespace (str, leading = true, trailing = true) {
  return removeChars(str, leading, trailing, isHTTPWhiteSpace)
}

/**
 * @see https://infra.spec.whatwg.org/#ascii-whitespace
 * @param {number} char
 */
function isASCIIWhitespace (char) {
  // "\r\n\t\f "
  return char === 0x00d || char === 0x00a || char === 0x009 || char === 0x00c || char === 0x020
}

/**
 * @see https://infra.spec.whatwg.org/#strip-leading-and-trailing-ascii-whitespace
 * @param {string} str
 * @param {boolean} [leading=true]
 * @param {boolean} [trailing=true]
 */
function removeASCIIWhitespace (str, leading = true, trailing = true) {
  return removeChars(str, leading, trailing, isASCIIWhitespace)
}

/**
 * @param {string} str
 * @param {boolean} leading
 * @param {boolean} trailing
 * @param {(charCode: number) => boolean} predicate
 * @returns
 */
function removeChars (str, leading, trailing, predicate) {
  let lead = 0
  let trail = str.length - 1

  if (leading) {
    while (lead < str.length && predicate(str.charCodeAt(lead))) lead++
  }

  if (trailing) {
    while (trail > 0 && predicate(str.charCodeAt(trail))) trail--
  }

  return lead === 0 && trail === str.length - 1 ? str : str.slice(lead, trail + 1)
}

/**
 * @see https://infra.spec.whatwg.org/#isomorphic-decode
 * @param {Uint8Array} input
 * @returns {string}
 */
function isomorphicDecode (input) {
  // 1. To isomorphic decode a byte sequence input, return a string whose code point
  //    length is equal to input’s length and whose code points have the same values
  //    as the values of input’s bytes, in the same order.
  const length = input.length
  if ((2 << 15) - 1 > length) {
    return String.fromCharCode.apply(null, input)
  }
  let result = ''; let i = 0
  let addition = (2 << 15) - 1
  while (i < length) {
    if (i + addition > length) {
      addition = length - i
    }
    result += String.fromCharCode.apply(null, input.subarray(i, i += addition))
  }
  return result
}

/**
 * @see https://mimesniff.spec.whatwg.org/#minimize-a-supported-mime-type
 * @param {Exclude<ReturnType<typeof parseMIMEType>, 'failure'>} mimeType
 */
function minimizeSupportedMimeType (mimeType) {
  switch (mimeType.essence) {
    case 'application/ecmascript':
    case 'application/javascript':
    case 'application/x-ecmascript':
    case 'application/x-javascript':
    case 'text/ecmascript':
    case 'text/javascript':
    case 'text/javascript1.0':
    case 'text/javascript1.1':
    case 'text/javascript1.2':
    case 'text/javascript1.3':
    case 'text/javascript1.4':
    case 'text/javascript1.5':
    case 'text/jscript':
    case 'text/livescript':
    case 'text/x-ecmascript':
    case 'text/x-javascript':
      // 1. If mimeType is a JavaScript MIME type, then return "text/javascript".
      return 'text/javascript'
    case 'application/json':
    case 'text/json':
      // 2. If mimeType is a JSON MIME type, then return "application/json".
      return 'application/json'
    case 'image/svg+xml':
      // 3. If mimeType’s essence is "image/svg+xml", then return "image/svg+xml".
      return 'image/svg+xml'
    case 'text/xml':
    case 'application/xml':
      // 4. If mimeType is an XML MIME type, then return "application/xml".
      return 'application/xml'
  }

  // 2. If mimeType is a JSON MIME type, then return "application/json".
  if (mimeType.subtype.endsWith('+json')) {
    return 'application/json'
  }

  // 4. If mimeType is an XML MIME type, then return "application/xml".
  if (mimeType.subtype.endsWith('+xml')) {
    return 'application/xml'
  }

  // 5. If mimeType is supported by the user agent, then return mimeType’s essence.
  // Technically, node doesn't support any mimetypes.

  // 6. Return the empty string.
  return ''
}

module.exports = {
  dataURLProcessor,
  URLSerializer,
  collectASequenceOfCodePoints,
  collectASequenceOfCodePointsFast,
  stringPercentDecode,
  parseMIMEType,
  collectAnHTTPQuotedString,
  serializeAMimeType,
  removeChars,
  removeHTTPWhitespace,
  minimizeSupportedMimeType,
  HTTP_TOKEN_CODEPOINTS,
  isomorphicDecode
}


/***/ }),

/***/ 3076:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { kConnected, kSize } = __nccwpck_require__(46)

class CompatWeakRef {
  constructor (value) {
    this.value = value
  }

  deref () {
    return this.value[kConnected] === 0 && this.value[kSize] === 0
      ? undefined
      : this.value
  }
}

class CompatFinalizer {
  constructor (finalizer) {
    this.finalizer = finalizer
  }

  register (dispatcher, key) {
    if (dispatcher.on) {
      dispatcher.on('disconnect', () => {
        if (dispatcher[kConnected] === 0 && dispatcher[kSize] === 0) {
          this.finalizer(key)
        }
      })
    }
  }

  unregister (key) {}
}

module.exports = function () {
  // FIXME: remove workaround when the Node bug is backported to v18
  // https://github.com/nodejs/node/issues/49344#issuecomment-1741776308
  if (process.env.NODE_V8_COVERAGE && process.version.startsWith('v18')) {
    process._rawDebug('Using compatibility WeakRef and FinalizationRegistry')
    return {
      WeakRef: CompatWeakRef,
      FinalizationRegistry: CompatFinalizer
    }
  }
  return { WeakRef, FinalizationRegistry }
}


/***/ }),

/***/ 78:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Blob, File } = __nccwpck_require__(2254)
const { kState } = __nccwpck_require__(1937)
const { webidl } = __nccwpck_require__(9346)

// TODO(@KhafraDev): remove
class FileLike {
  constructor (blobLike, fileName, options = {}) {
    // TODO: argument idl type check

    // The File constructor is invoked with two or three parameters, depending
    // on whether the optional dictionary parameter is used. When the File()
    // constructor is invoked, user agents must run the following steps:

    // 1. Let bytes be the result of processing blob parts given fileBits and
    // options.

    // 2. Let n be the fileName argument to the constructor.
    const n = fileName

    // 3. Process FilePropertyBag dictionary argument by running the following
    // substeps:

    //    1. If the type member is provided and is not the empty string, let t
    //    be set to the type dictionary member. If t contains any characters
    //    outside the range U+0020 to U+007E, then set t to the empty string
    //    and return from these substeps.
    //    TODO
    const t = options.type

    //    2. Convert every character in t to ASCII lowercase.
    //    TODO

    //    3. If the lastModified member is provided, let d be set to the
    //    lastModified dictionary member. If it is not provided, set d to the
    //    current date and time represented as the number of milliseconds since
    //    the Unix Epoch (which is the equivalent of Date.now() [ECMA-262]).
    const d = options.lastModified ?? Date.now()

    // 4. Return a new File object F such that:
    // F refers to the bytes byte sequence.
    // F.size is set to the number of total bytes in bytes.
    // F.name is set to n.
    // F.type is set to t.
    // F.lastModified is set to d.

    this[kState] = {
      blobLike,
      name: n,
      type: t,
      lastModified: d
    }
  }

  stream (...args) {
    webidl.brandCheck(this, FileLike)

    return this[kState].blobLike.stream(...args)
  }

  arrayBuffer (...args) {
    webidl.brandCheck(this, FileLike)

    return this[kState].blobLike.arrayBuffer(...args)
  }

  slice (...args) {
    webidl.brandCheck(this, FileLike)

    return this[kState].blobLike.slice(...args)
  }

  text (...args) {
    webidl.brandCheck(this, FileLike)

    return this[kState].blobLike.text(...args)
  }

  get size () {
    webidl.brandCheck(this, FileLike)

    return this[kState].blobLike.size
  }

  get type () {
    webidl.brandCheck(this, FileLike)

    return this[kState].blobLike.type
  }

  get name () {
    webidl.brandCheck(this, FileLike)

    return this[kState].name
  }

  get lastModified () {
    webidl.brandCheck(this, FileLike)

    return this[kState].lastModified
  }

  get [Symbol.toStringTag] () {
    return 'File'
  }
}

webidl.converters.Blob = webidl.interfaceConverter(Blob)

// If this function is moved to ./util.js, some tools (such as
// rollup) will warn about circular dependencies. See:
// https://github.com/nodejs/undici/issues/1629
function isFileLike (object) {
  return (
    (object instanceof File) ||
    (
      object &&
      (typeof object.stream === 'function' ||
      typeof object.arrayBuffer === 'function') &&
      object[Symbol.toStringTag] === 'File'
    )
  )
}

module.exports = { FileLike, isFileLike }


/***/ }),

/***/ 4593:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { isUSVString, bufferToLowerCasedHeaderName } = __nccwpck_require__(9099)
const { utf8DecodeBytes } = __nccwpck_require__(8185)
const { HTTP_TOKEN_CODEPOINTS, isomorphicDecode } = __nccwpck_require__(5253)
const { isFileLike } = __nccwpck_require__(78)
const { makeEntry } = __nccwpck_require__(2744)
const assert = __nccwpck_require__(8061)
const { File: NodeFile } = __nccwpck_require__(2254)

const File = globalThis.File ?? NodeFile

const formDataNameBuffer = Buffer.from('form-data; name="')
const filenameBuffer = Buffer.from('; filename')
const dd = Buffer.from('--')
const ddcrlf = Buffer.from('--\r\n')

/**
 * @param {string} chars
 */
function isAsciiString (chars) {
  for (let i = 0; i < chars.length; ++i) {
    if ((chars.charCodeAt(i) & ~0x7F) !== 0) {
      return false
    }
  }
  return true
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#multipart-form-data-boundary
 * @param {string} boundary
 */
function validateBoundary (boundary) {
  const length = boundary.length

  // - its length is greater or equal to 27 and lesser or equal to 70, and
  if (length < 27 || length > 70) {
    return false
  }

  // - it is composed by bytes in the ranges 0x30 to 0x39, 0x41 to 0x5A, or
  //   0x61 to 0x7A, inclusive (ASCII alphanumeric), or which are 0x27 ('),
  //   0x2D (-) or 0x5F (_).
  for (let i = 0; i < length; ++i) {
    const cp = boundary.charCodeAt(i)

    if (!(
      (cp >= 0x30 && cp <= 0x39) ||
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) ||
      cp === 0x27 ||
      cp === 0x2d ||
      cp === 0x5f
    )) {
      return false
    }
  }

  return true
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#multipart-form-data-parser
 * @param {Buffer} input
 * @param {ReturnType<import('./data-url')['parseMIMEType']>} mimeType
 */
function multipartFormDataParser (input, mimeType) {
  // 1. Assert: mimeType’s essence is "multipart/form-data".
  assert(mimeType !== 'failure' && mimeType.essence === 'multipart/form-data')

  const boundaryString = mimeType.parameters.get('boundary')

  // 2. If mimeType’s parameters["boundary"] does not exist, return failure.
  //    Otherwise, let boundary be the result of UTF-8 decoding mimeType’s
  //    parameters["boundary"].
  if (boundaryString === undefined) {
    return 'failure'
  }

  const boundary = Buffer.from(`--${boundaryString}`, 'utf8')

  // 3. Let entry list be an empty entry list.
  const entryList = []

  // 4. Let position be a pointer to a byte in input, initially pointing at
  //    the first byte.
  const position = { position: 0 }

  // Note: undici addition, allows leading and trailing CRLFs.
  while (input[position.position] === 0x0d && input[position.position + 1] === 0x0a) {
    position.position += 2
  }

  let trailing = input.length

  while (input[trailing - 1] === 0x0a && input[trailing - 2] === 0x0d) {
    trailing -= 2
  }

  if (trailing !== input.length) {
    input = input.subarray(0, trailing)
  }

  // 5. While true:
  while (true) {
    // 5.1. If position points to a sequence of bytes starting with 0x2D 0x2D
    //      (`--`) followed by boundary, advance position by 2 + the length of
    //      boundary. Otherwise, return failure.
    // Note: boundary is padded with 2 dashes already, no need to add 2.
    if (input.subarray(position.position, position.position + boundary.length).equals(boundary)) {
      position.position += boundary.length
    } else {
      return 'failure'
    }

    // 5.2. If position points to the sequence of bytes 0x2D 0x2D 0x0D 0x0A
    //      (`--` followed by CR LF) followed by the end of input, return entry list.
    // Note: a body does NOT need to end with CRLF. It can end with --.
    if (
      (position.position === input.length - 2 && bufferStartsWith(input, dd, position)) ||
      (position.position === input.length - 4 && bufferStartsWith(input, ddcrlf, position))
    ) {
      return entryList
    }

    // 5.3. If position does not point to a sequence of bytes starting with 0x0D
    //      0x0A (CR LF), return failure.
    if (input[position.position] !== 0x0d || input[position.position + 1] !== 0x0a) {
      return 'failure'
    }

    // 5.4. Advance position by 2. (This skips past the newline.)
    position.position += 2

    // 5.5. Let name, filename and contentType be the result of parsing
    //      multipart/form-data headers on input and position, if the result
    //      is not failure. Otherwise, return failure.
    const result = parseMultipartFormDataHeaders(input, position)

    if (result === 'failure') {
      return 'failure'
    }

    let { name, filename, contentType, encoding } = result

    // 5.6. Advance position by 2. (This skips past the empty line that marks
    //      the end of the headers.)
    position.position += 2

    // 5.7. Let body be the empty byte sequence.
    let body

    // 5.8. Body loop: While position is not past the end of input:
    // TODO: the steps here are completely wrong
    {
      const boundaryIndex = input.indexOf(boundary.subarray(2), position.position)

      if (boundaryIndex === -1) {
        return 'failure'
      }

      body = input.subarray(position.position, boundaryIndex - 4)

      position.position += body.length

      // Note: position must be advanced by the body's length before being
      // decoded, otherwise the parsing will fail.
      if (encoding === 'base64') {
        body = Buffer.from(body.toString(), 'base64')
      }
    }

    // 5.9. If position does not point to a sequence of bytes starting with
    //      0x0D 0x0A (CR LF), return failure. Otherwise, advance position by 2.
    if (input[position.position] !== 0x0d || input[position.position + 1] !== 0x0a) {
      return 'failure'
    } else {
      position.position += 2
    }

    // 5.10. If filename is not null:
    let value

    if (filename !== null) {
      // 5.10.1. If contentType is null, set contentType to "text/plain".
      contentType ??= 'text/plain'

      // 5.10.2. If contentType is not an ASCII string, set contentType to the empty string.

      // Note: `buffer.isAscii` can be used at zero-cost, but converting a string to a buffer is a high overhead.
      // Content-Type is a relatively small string, so it is faster to use `String#charCodeAt`.
      if (!isAsciiString(contentType)) {
        contentType = ''
      }

      // 5.10.3. Let value be a new File object with name filename, type contentType, and body body.
      value = new File([body], filename, { type: contentType })
    } else {
      // 5.11. Otherwise:

      // 5.11.1. Let value be the UTF-8 decoding without BOM of body.
      value = utf8DecodeBytes(Buffer.from(body))
    }

    // 5.12. Assert: name is a scalar value string and value is either a scalar value string or a File object.
    assert(isUSVString(name))
    assert((typeof value === 'string' && isUSVString(value)) || isFileLike(value))

    // 5.13. Create an entry with name and value, and append it to entry list.
    entryList.push(makeEntry(name, value, filename))
  }
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#parse-multipart-form-data-headers
 * @param {Buffer} input
 * @param {{ position: number }} position
 */
function parseMultipartFormDataHeaders (input, position) {
  // 1. Let name, filename and contentType be null.
  let name = null
  let filename = null
  let contentType = null
  let encoding = null

  // 2. While true:
  while (true) {
    // 2.1. If position points to a sequence of bytes starting with 0x0D 0x0A (CR LF):
    if (input[position.position] === 0x0d && input[position.position + 1] === 0x0a) {
      // 2.1.1. If name is null, return failure.
      if (name === null) {
        return 'failure'
      }

      // 2.1.2. Return name, filename and contentType.
      return { name, filename, contentType, encoding }
    }

    // 2.2. Let header name be the result of collecting a sequence of bytes that are
    //      not 0x0A (LF), 0x0D (CR) or 0x3A (:), given position.
    let headerName = collectASequenceOfBytes(
      (char) => char !== 0x0a && char !== 0x0d && char !== 0x3a,
      input,
      position
    )

    // 2.3. Remove any HTTP tab or space bytes from the start or end of header name.
    headerName = removeChars(headerName, true, true, (char) => char === 0x9 || char === 0x20)

    // 2.4. If header name does not match the field-name token production, return failure.
    if (!HTTP_TOKEN_CODEPOINTS.test(headerName.toString())) {
      return 'failure'
    }

    // 2.5. If the byte at position is not 0x3A (:), return failure.
    if (input[position.position] !== 0x3a) {
      return 'failure'
    }

    // 2.6. Advance position by 1.
    position.position++

    // 2.7. Collect a sequence of bytes that are HTTP tab or space bytes given position.
    //      (Do nothing with those bytes.)
    collectASequenceOfBytes(
      (char) => char === 0x20 || char === 0x09,
      input,
      position
    )

    // 2.8. Byte-lowercase header name and switch on the result:
    switch (bufferToLowerCasedHeaderName(headerName)) {
      case 'content-disposition': {
        // 1. Set name and filename to null.
        name = filename = null

        // 2. If position does not point to a sequence of bytes starting with
        //    `form-data; name="`, return failure.
        if (!bufferStartsWith(input, formDataNameBuffer, position)) {
          return 'failure'
        }

        // 3. Advance position so it points at the byte after the next 0x22 (")
        //    byte (the one in the sequence of bytes matched above).
        position.position += 17

        // 4. Set name to the result of parsing a multipart/form-data name given
        //    input and position, if the result is not failure. Otherwise, return
        //    failure.
        name = parseMultipartFormDataName(input, position)

        if (name === null) {
          return 'failure'
        }

        // 5. If position points to a sequence of bytes starting with `; filename="`:
        if (bufferStartsWith(input, filenameBuffer, position)) {
          // Note: undici also handles filename*
          let check = position.position + filenameBuffer.length

          if (input[check] === 0x2a) {
            position.position += 1
            check += 1
          }

          if (input[check] !== 0x3d || input[check + 1] !== 0x22) { // ="
            return 'failure'
          }

          // 1. Advance position so it points at the byte after the next 0x22 (") byte
          //    (the one in the sequence of bytes matched above).
          position.position += 12

          // 2. Set filename to the result of parsing a multipart/form-data name given
          //    input and position, if the result is not failure. Otherwise, return failure.
          filename = parseMultipartFormDataName(input, position)

          if (filename === null) {
            return 'failure'
          }
        }

        break
      }
      case 'content-type': {
        // 1. Let header value be the result of collecting a sequence of bytes that are
        //    not 0x0A (LF) or 0x0D (CR), given position.
        let headerValue = collectASequenceOfBytes(
          (char) => char !== 0x0a && char !== 0x0d,
          input,
          position
        )

        // 2. Remove any HTTP tab or space bytes from the end of header value.
        headerValue = removeChars(headerValue, false, true, (char) => char === 0x9 || char === 0x20)

        // 3. Set contentType to the isomorphic decoding of header value.
        contentType = isomorphicDecode(headerValue)

        break
      }
      case 'content-transfer-encoding': {
        let headerValue = collectASequenceOfBytes(
          (char) => char !== 0x0a && char !== 0x0d,
          input,
          position
        )

        headerValue = removeChars(headerValue, false, true, (char) => char === 0x9 || char === 0x20)

        encoding = isomorphicDecode(headerValue)

        break
      }
      default: {
        // Collect a sequence of bytes that are not 0x0A (LF) or 0x0D (CR), given position.
        // (Do nothing with those bytes.)
        collectASequenceOfBytes(
          (char) => char !== 0x0a && char !== 0x0d,
          input,
          position
        )
      }
    }

    // 2.9. If position does not point to a sequence of bytes starting with 0x0D 0x0A
    //      (CR LF), return failure. Otherwise, advance position by 2 (past the newline).
    if (input[position.position] !== 0x0d && input[position.position + 1] !== 0x0a) {
      return 'failure'
    } else {
      position.position += 2
    }
  }
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#parse-a-multipart-form-data-name
 * @param {Buffer} input
 * @param {{ position: number }} position
 */
function parseMultipartFormDataName (input, position) {
  // 1. Assert: The byte at (position - 1) is 0x22 (").
  assert(input[position.position - 1] === 0x22)

  // 2. Let name be the result of collecting a sequence of bytes that are not 0x0A (LF), 0x0D (CR) or 0x22 ("), given position.
  /** @type {string | Buffer} */
  let name = collectASequenceOfBytes(
    (char) => char !== 0x0a && char !== 0x0d && char !== 0x22,
    input,
    position
  )

  // 3. If the byte at position is not 0x22 ("), return failure. Otherwise, advance position by 1.
  if (input[position.position] !== 0x22) {
    return null // name could be 'failure'
  } else {
    position.position++
  }

  // 4. Replace any occurrence of the following subsequences in name with the given byte:
  // - `%0A`: 0x0A (LF)
  // - `%0D`: 0x0D (CR)
  // - `%22`: 0x22 (")
  name = new TextDecoder().decode(name)
    .replace(/%0A/ig, '\n')
    .replace(/%0D/ig, '\r')
    .replace(/%22/g, '"')

  // 5. Return the UTF-8 decoding without BOM of name.
  return name
}

/**
 * @param {(char: number) => boolean} condition
 * @param {Buffer} input
 * @param {{ position: number }} position
 */
function collectASequenceOfBytes (condition, input, position) {
  let start = position.position

  while (start < input.length && condition(input[start])) {
    ++start
  }

  return input.subarray(position.position, (position.position = start))
}

/**
 * @param {Buffer} buf
 * @param {boolean} leading
 * @param {boolean} trailing
 * @param {(charCode: number) => boolean} predicate
 * @returns {Buffer}
 */
function removeChars (buf, leading, trailing, predicate) {
  let lead = 0
  let trail = buf.length - 1

  if (leading) {
    while (lead < buf.length && predicate(buf[lead])) lead++
  }

  if (trailing) {
    while (trail > 0 && predicate(buf[trail])) trail--
  }

  return lead === 0 && trail === buf.length - 1 ? buf : buf.subarray(lead, trail + 1)
}

/**
 * Checks if {@param buffer} starts with {@param start}
 * @param {Buffer} buffer
 * @param {Buffer} start
 * @param {{ position: number }} position
 */
function bufferStartsWith (buffer, start, position) {
  if (buffer.length < start.length) {
    return false
  }

  for (let i = 0; i < start.length; i++) {
    if (start[i] !== buffer[position.position + i]) {
      return false
    }
  }

  return true
}

module.exports = {
  multipartFormDataParser,
  validateBoundary
}


/***/ }),

/***/ 2744:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { isBlobLike, iteratorMixin } = __nccwpck_require__(8185)
const { kState } = __nccwpck_require__(1937)
const { kEnumerableProperty } = __nccwpck_require__(9099)
const { FileLike, isFileLike } = __nccwpck_require__(78)
const { webidl } = __nccwpck_require__(9346)
const { File: NativeFile } = __nccwpck_require__(2254)
const nodeUtil = __nccwpck_require__(7261)

/** @type {globalThis['File']} */
const File = globalThis.File ?? NativeFile

// https://xhr.spec.whatwg.org/#formdata
class FormData {
  constructor (form) {
    webidl.util.markAsUncloneable(this)

    if (form !== undefined) {
      throw webidl.errors.conversionFailed({
        prefix: 'FormData constructor',
        argument: 'Argument 1',
        types: ['undefined']
      })
    }

    this[kState] = []
  }

  append (name, value, filename = undefined) {
    webidl.brandCheck(this, FormData)

    const prefix = 'FormData.append'
    webidl.argumentLengthCheck(arguments, 2, prefix)

    if (arguments.length === 3 && !isBlobLike(value)) {
      throw new TypeError(
        "Failed to execute 'append' on 'FormData': parameter 2 is not of type 'Blob'"
      )
    }

    // 1. Let value be value if given; otherwise blobValue.

    name = webidl.converters.USVString(name, prefix, 'name')
    value = isBlobLike(value)
      ? webidl.converters.Blob(value, prefix, 'value', { strict: false })
      : webidl.converters.USVString(value, prefix, 'value')
    filename = arguments.length === 3
      ? webidl.converters.USVString(filename, prefix, 'filename')
      : undefined

    // 2. Let entry be the result of creating an entry with
    // name, value, and filename if given.
    const entry = makeEntry(name, value, filename)

    // 3. Append entry to this’s entry list.
    this[kState].push(entry)
  }

  delete (name) {
    webidl.brandCheck(this, FormData)

    const prefix = 'FormData.delete'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    name = webidl.converters.USVString(name, prefix, 'name')

    // The delete(name) method steps are to remove all entries whose name
    // is name from this’s entry list.
    this[kState] = this[kState].filter(entry => entry.name !== name)
  }

  get (name) {
    webidl.brandCheck(this, FormData)

    const prefix = 'FormData.get'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    name = webidl.converters.USVString(name, prefix, 'name')

    // 1. If there is no entry whose name is name in this’s entry list,
    // then return null.
    const idx = this[kState].findIndex((entry) => entry.name === name)
    if (idx === -1) {
      return null
    }

    // 2. Return the value of the first entry whose name is name from
    // this’s entry list.
    return this[kState][idx].value
  }

  getAll (name) {
    webidl.brandCheck(this, FormData)

    const prefix = 'FormData.getAll'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    name = webidl.converters.USVString(name, prefix, 'name')

    // 1. If there is no entry whose name is name in this’s entry list,
    // then return the empty list.
    // 2. Return the values of all entries whose name is name, in order,
    // from this’s entry list.
    return this[kState]
      .filter((entry) => entry.name === name)
      .map((entry) => entry.value)
  }

  has (name) {
    webidl.brandCheck(this, FormData)

    const prefix = 'FormData.has'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    name = webidl.converters.USVString(name, prefix, 'name')

    // The has(name) method steps are to return true if there is an entry
    // whose name is name in this’s entry list; otherwise false.
    return this[kState].findIndex((entry) => entry.name === name) !== -1
  }

  set (name, value, filename = undefined) {
    webidl.brandCheck(this, FormData)

    const prefix = 'FormData.set'
    webidl.argumentLengthCheck(arguments, 2, prefix)

    if (arguments.length === 3 && !isBlobLike(value)) {
      throw new TypeError(
        "Failed to execute 'set' on 'FormData': parameter 2 is not of type 'Blob'"
      )
    }

    // The set(name, value) and set(name, blobValue, filename) method steps
    // are:

    // 1. Let value be value if given; otherwise blobValue.

    name = webidl.converters.USVString(name, prefix, 'name')
    value = isBlobLike(value)
      ? webidl.converters.Blob(value, prefix, 'name', { strict: false })
      : webidl.converters.USVString(value, prefix, 'name')
    filename = arguments.length === 3
      ? webidl.converters.USVString(filename, prefix, 'name')
      : undefined

    // 2. Let entry be the result of creating an entry with name, value, and
    // filename if given.
    const entry = makeEntry(name, value, filename)

    // 3. If there are entries in this’s entry list whose name is name, then
    // replace the first such entry with entry and remove the others.
    const idx = this[kState].findIndex((entry) => entry.name === name)
    if (idx !== -1) {
      this[kState] = [
        ...this[kState].slice(0, idx),
        entry,
        ...this[kState].slice(idx + 1).filter((entry) => entry.name !== name)
      ]
    } else {
      // 4. Otherwise, append entry to this’s entry list.
      this[kState].push(entry)
    }
  }

  [nodeUtil.inspect.custom] (depth, options) {
    const state = this[kState].reduce((a, b) => {
      if (a[b.name]) {
        if (Array.isArray(a[b.name])) {
          a[b.name].push(b.value)
        } else {
          a[b.name] = [a[b.name], b.value]
        }
      } else {
        a[b.name] = b.value
      }

      return a
    }, { __proto__: null })

    options.depth ??= depth
    options.colors ??= true

    const output = nodeUtil.formatWithOptions(options, state)

    // remove [Object null prototype]
    return `FormData ${output.slice(output.indexOf(']') + 2)}`
  }
}

iteratorMixin('FormData', FormData, kState, 'name', 'value')

Object.defineProperties(FormData.prototype, {
  append: kEnumerableProperty,
  delete: kEnumerableProperty,
  get: kEnumerableProperty,
  getAll: kEnumerableProperty,
  has: kEnumerableProperty,
  set: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'FormData',
    configurable: true
  }
})

/**
 * @see https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#create-an-entry
 * @param {string} name
 * @param {string|Blob} value
 * @param {?string} filename
 * @returns
 */
function makeEntry (name, value, filename) {
  // 1. Set name to the result of converting name into a scalar value string.
  // Note: This operation was done by the webidl converter USVString.

  // 2. If value is a string, then set value to the result of converting
  //    value into a scalar value string.
  if (typeof value === 'string') {
    // Note: This operation was done by the webidl converter USVString.
  } else {
    // 3. Otherwise:

    // 1. If value is not a File object, then set value to a new File object,
    //    representing the same bytes, whose name attribute value is "blob"
    if (!isFileLike(value)) {
      value = value instanceof Blob
        ? new File([value], 'blob', { type: value.type })
        : new FileLike(value, 'blob', { type: value.type })
    }

    // 2. If filename is given, then set value to a new File object,
    //    representing the same bytes, whose name attribute is filename.
    if (filename !== undefined) {
      /** @type {FilePropertyBag} */
      const options = {
        type: value.type,
        lastModified: value.lastModified
      }

      value = value instanceof NativeFile
        ? new File([value], filename, options)
        : new FileLike(value, filename, options)
    }
  }

  // 4. Return an entry whose name is name and whose value is value.
  return { name, value }
}

module.exports = { FormData, makeEntry }


/***/ }),

/***/ 5954:
/***/ ((module) => {

"use strict";


// In case of breaking changes, increase the version
// number to avoid conflicts.
const globalOrigin = Symbol.for('undici.globalOrigin.1')

function getGlobalOrigin () {
  return globalThis[globalOrigin]
}

function setGlobalOrigin (newOrigin) {
  if (newOrigin === undefined) {
    Object.defineProperty(globalThis, globalOrigin, {
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: false
    })

    return
  }

  const parsedURL = new URL(newOrigin)

  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new TypeError(`Only http & https urls are allowed, received ${parsedURL.protocol}`)
  }

  Object.defineProperty(globalThis, globalOrigin, {
    value: parsedURL,
    writable: true,
    enumerable: false,
    configurable: false
  })
}

module.exports = {
  getGlobalOrigin,
  setGlobalOrigin
}


/***/ }),

/***/ 1401:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// https://github.com/Ethan-Arrowood/undici-fetch



const { kConstruct } = __nccwpck_require__(46)
const { kEnumerableProperty } = __nccwpck_require__(9099)
const {
  iteratorMixin,
  isValidHeaderName,
  isValidHeaderValue
} = __nccwpck_require__(8185)
const { webidl } = __nccwpck_require__(9346)
const assert = __nccwpck_require__(8061)
const util = __nccwpck_require__(7261)

const kHeadersMap = Symbol('headers map')
const kHeadersSortedMap = Symbol('headers map sorted')

/**
 * @param {number} code
 */
function isHTTPWhiteSpaceCharCode (code) {
  return code === 0x00a || code === 0x00d || code === 0x009 || code === 0x020
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-header-value-normalize
 * @param {string} potentialValue
 */
function headerValueNormalize (potentialValue) {
  //  To normalize a byte sequence potentialValue, remove
  //  any leading and trailing HTTP whitespace bytes from
  //  potentialValue.
  let i = 0; let j = potentialValue.length

  while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(j - 1))) --j
  while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(i))) ++i

  return i === 0 && j === potentialValue.length ? potentialValue : potentialValue.substring(i, j)
}

function fill (headers, object) {
  // To fill a Headers object headers with a given object object, run these steps:

  // 1. If object is a sequence, then for each header in object:
  // Note: webidl conversion to array has already been done.
  if (Array.isArray(object)) {
    for (let i = 0; i < object.length; ++i) {
      const header = object[i]
      // 1. If header does not contain exactly two items, then throw a TypeError.
      if (header.length !== 2) {
        throw webidl.errors.exception({
          header: 'Headers constructor',
          message: `expected name/value pair to be length 2, found ${header.length}.`
        })
      }

      // 2. Append (header’s first item, header’s second item) to headers.
      appendHeader(headers, header[0], header[1])
    }
  } else if (typeof object === 'object' && object !== null) {
    // Note: null should throw

    // 2. Otherwise, object is a record, then for each key → value in object,
    //    append (key, value) to headers
    const keys = Object.keys(object)
    for (let i = 0; i < keys.length; ++i) {
      appendHeader(headers, keys[i], object[keys[i]])
    }
  } else {
    throw webidl.errors.conversionFailed({
      prefix: 'Headers constructor',
      argument: 'Argument 1',
      types: ['sequence<sequence<ByteString>>', 'record<ByteString, ByteString>']
    })
  }
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-headers-append
 */
function appendHeader (headers, name, value) {
  // 1. Normalize value.
  value = headerValueNormalize(value)

  // 2. If name is not a header name or value is not a
  //    header value, then throw a TypeError.
  if (!isValidHeaderName(name)) {
    throw webidl.errors.invalidArgument({
      prefix: 'Headers.append',
      value: name,
      type: 'header name'
    })
  } else if (!isValidHeaderValue(value)) {
    throw webidl.errors.invalidArgument({
      prefix: 'Headers.append',
      value,
      type: 'header value'
    })
  }

  // 3. If headers’s guard is "immutable", then throw a TypeError.
  // 4. Otherwise, if headers’s guard is "request" and name is a
  //    forbidden header name, return.
  // 5. Otherwise, if headers’s guard is "request-no-cors":
  //    TODO
  // Note: undici does not implement forbidden header names
  if (getHeadersGuard(headers) === 'immutable') {
    throw new TypeError('immutable')
  }

  // 6. Otherwise, if headers’s guard is "response" and name is a
  //    forbidden response-header name, return.

  // 7. Append (name, value) to headers’s header list.
  return getHeadersList(headers).append(name, value, false)

  // 8. If headers’s guard is "request-no-cors", then remove
  //    privileged no-CORS request headers from headers
}

function compareHeaderName (a, b) {
  return a[0] < b[0] ? -1 : 1
}

class HeadersList {
  /** @type {[string, string][]|null} */
  cookies = null

  constructor (init) {
    if (init instanceof HeadersList) {
      this[kHeadersMap] = new Map(init[kHeadersMap])
      this[kHeadersSortedMap] = init[kHeadersSortedMap]
      this.cookies = init.cookies === null ? null : [...init.cookies]
    } else {
      this[kHeadersMap] = new Map(init)
      this[kHeadersSortedMap] = null
    }
  }

  /**
   * @see https://fetch.spec.whatwg.org/#header-list-contains
   * @param {string} name
   * @param {boolean} isLowerCase
   */
  contains (name, isLowerCase) {
    // A header list list contains a header name name if list
    // contains a header whose name is a byte-case-insensitive
    // match for name.

    return this[kHeadersMap].has(isLowerCase ? name : name.toLowerCase())
  }

  clear () {
    this[kHeadersMap].clear()
    this[kHeadersSortedMap] = null
    this.cookies = null
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-append
   * @param {string} name
   * @param {string} value
   * @param {boolean} isLowerCase
   */
  append (name, value, isLowerCase) {
    this[kHeadersSortedMap] = null

    // 1. If list contains name, then set name to the first such
    //    header’s name.
    const lowercaseName = isLowerCase ? name : name.toLowerCase()
    const exists = this[kHeadersMap].get(lowercaseName)

    // 2. Append (name, value) to list.
    if (exists) {
      const delimiter = lowercaseName === 'cookie' ? '; ' : ', '
      this[kHeadersMap].set(lowercaseName, {
        name: exists.name,
        value: `${exists.value}${delimiter}${value}`
      })
    } else {
      this[kHeadersMap].set(lowercaseName, { name, value })
    }

    if (lowercaseName === 'set-cookie') {
      (this.cookies ??= []).push(value)
    }
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-set
   * @param {string} name
   * @param {string} value
   * @param {boolean} isLowerCase
   */
  set (name, value, isLowerCase) {
    this[kHeadersSortedMap] = null
    const lowercaseName = isLowerCase ? name : name.toLowerCase()

    if (lowercaseName === 'set-cookie') {
      this.cookies = [value]
    }

    // 1. If list contains name, then set the value of
    //    the first such header to value and remove the
    //    others.
    // 2. Otherwise, append header (name, value) to list.
    this[kHeadersMap].set(lowercaseName, { name, value })
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-delete
   * @param {string} name
   * @param {boolean} isLowerCase
   */
  delete (name, isLowerCase) {
    this[kHeadersSortedMap] = null
    if (!isLowerCase) name = name.toLowerCase()

    if (name === 'set-cookie') {
      this.cookies = null
    }

    this[kHeadersMap].delete(name)
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-get
   * @param {string} name
   * @param {boolean} isLowerCase
   * @returns {string | null}
   */
  get (name, isLowerCase) {
    // 1. If list does not contain name, then return null.
    // 2. Return the values of all headers in list whose name
    //    is a byte-case-insensitive match for name,
    //    separated from each other by 0x2C 0x20, in order.
    return this[kHeadersMap].get(isLowerCase ? name : name.toLowerCase())?.value ?? null
  }

  * [Symbol.iterator] () {
    // use the lowercased name
    for (const { 0: name, 1: { value } } of this[kHeadersMap]) {
      yield [name, value]
    }
  }

  get entries () {
    const headers = {}

    if (this[kHeadersMap].size !== 0) {
      for (const { name, value } of this[kHeadersMap].values()) {
        headers[name] = value
      }
    }

    return headers
  }

  rawValues () {
    return this[kHeadersMap].values()
  }

  get entriesList () {
    const headers = []

    if (this[kHeadersMap].size !== 0) {
      for (const { 0: lowerName, 1: { name, value } } of this[kHeadersMap]) {
        if (lowerName === 'set-cookie') {
          for (const cookie of this.cookies) {
            headers.push([name, cookie])
          }
        } else {
          headers.push([name, value])
        }
      }
    }

    return headers
  }

  // https://fetch.spec.whatwg.org/#convert-header-names-to-a-sorted-lowercase-set
  toSortedArray () {
    const size = this[kHeadersMap].size
    const array = new Array(size)
    // In most cases, you will use the fast-path.
    // fast-path: Use binary insertion sort for small arrays.
    if (size <= 32) {
      if (size === 0) {
        // If empty, it is an empty array. To avoid the first index assignment.
        return array
      }
      // Improve performance by unrolling loop and avoiding double-loop.
      // Double-loop-less version of the binary insertion sort.
      const iterator = this[kHeadersMap][Symbol.iterator]()
      const firstValue = iterator.next().value
      // set [name, value] to first index.
      array[0] = [firstValue[0], firstValue[1].value]
      // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
      // 3.2.2. Assert: value is non-null.
      assert(firstValue[1].value !== null)
      for (
        let i = 1, j = 0, right = 0, left = 0, pivot = 0, x, value;
        i < size;
        ++i
      ) {
        // get next value
        value = iterator.next().value
        // set [name, value] to current index.
        x = array[i] = [value[0], value[1].value]
        // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
        // 3.2.2. Assert: value is non-null.
        assert(x[1] !== null)
        left = 0
        right = i
        // binary search
        while (left < right) {
          // middle index
          pivot = left + ((right - left) >> 1)
          // compare header name
          if (array[pivot][0] <= x[0]) {
            left = pivot + 1
          } else {
            right = pivot
          }
        }
        if (i !== pivot) {
          j = i
          while (j > left) {
            array[j] = array[--j]
          }
          array[left] = x
        }
      }
      /* c8 ignore next 4 */
      if (!iterator.next().done) {
        // This is for debugging and will never be called.
        throw new TypeError('Unreachable')
      }
      return array
    } else {
      // This case would be a rare occurrence.
      // slow-path: fallback
      let i = 0
      for (const { 0: name, 1: { value } } of this[kHeadersMap]) {
        array[i++] = [name, value]
        // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
        // 3.2.2. Assert: value is non-null.
        assert(value !== null)
      }
      return array.sort(compareHeaderName)
    }
  }
}

// https://fetch.spec.whatwg.org/#headers-class
class Headers {
  #guard
  #headersList

  constructor (init = undefined) {
    webidl.util.markAsUncloneable(this)

    if (init === kConstruct) {
      return
    }

    this.#headersList = new HeadersList()

    // The new Headers(init) constructor steps are:

    // 1. Set this’s guard to "none".
    this.#guard = 'none'

    // 2. If init is given, then fill this with init.
    if (init !== undefined) {
      init = webidl.converters.HeadersInit(init, 'Headers contructor', 'init')
      fill(this, init)
    }
  }

  // https://fetch.spec.whatwg.org/#dom-headers-append
  append (name, value) {
    webidl.brandCheck(this, Headers)

    webidl.argumentLengthCheck(arguments, 2, 'Headers.append')

    const prefix = 'Headers.append'
    name = webidl.converters.ByteString(name, prefix, 'name')
    value = webidl.converters.ByteString(value, prefix, 'value')

    return appendHeader(this, name, value)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-delete
  delete (name) {
    webidl.brandCheck(this, Headers)

    webidl.argumentLengthCheck(arguments, 1, 'Headers.delete')

    const prefix = 'Headers.delete'
    name = webidl.converters.ByteString(name, prefix, 'name')

    // 1. If name is not a header name, then throw a TypeError.
    if (!isValidHeaderName(name)) {
      throw webidl.errors.invalidArgument({
        prefix: 'Headers.delete',
        value: name,
        type: 'header name'
      })
    }

    // 2. If this’s guard is "immutable", then throw a TypeError.
    // 3. Otherwise, if this’s guard is "request" and name is a
    //    forbidden header name, return.
    // 4. Otherwise, if this’s guard is "request-no-cors", name
    //    is not a no-CORS-safelisted request-header name, and
    //    name is not a privileged no-CORS request-header name,
    //    return.
    // 5. Otherwise, if this’s guard is "response" and name is
    //    a forbidden response-header name, return.
    // Note: undici does not implement forbidden header names
    if (this.#guard === 'immutable') {
      throw new TypeError('immutable')
    }

    // 6. If this’s header list does not contain name, then
    //    return.
    if (!this.#headersList.contains(name, false)) {
      return
    }

    // 7. Delete name from this’s header list.
    // 8. If this’s guard is "request-no-cors", then remove
    //    privileged no-CORS request headers from this.
    this.#headersList.delete(name, false)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-get
  get (name) {
    webidl.brandCheck(this, Headers)

    webidl.argumentLengthCheck(arguments, 1, 'Headers.get')

    const prefix = 'Headers.get'
    name = webidl.converters.ByteString(name, prefix, 'name')

    // 1. If name is not a header name, then throw a TypeError.
    if (!isValidHeaderName(name)) {
      throw webidl.errors.invalidArgument({
        prefix,
        value: name,
        type: 'header name'
      })
    }

    // 2. Return the result of getting name from this’s header
    //    list.
    return this.#headersList.get(name, false)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-has
  has (name) {
    webidl.brandCheck(this, Headers)

    webidl.argumentLengthCheck(arguments, 1, 'Headers.has')

    const prefix = 'Headers.has'
    name = webidl.converters.ByteString(name, prefix, 'name')

    // 1. If name is not a header name, then throw a TypeError.
    if (!isValidHeaderName(name)) {
      throw webidl.errors.invalidArgument({
        prefix,
        value: name,
        type: 'header name'
      })
    }

    // 2. Return true if this’s header list contains name;
    //    otherwise false.
    return this.#headersList.contains(name, false)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-set
  set (name, value) {
    webidl.brandCheck(this, Headers)

    webidl.argumentLengthCheck(arguments, 2, 'Headers.set')

    const prefix = 'Headers.set'
    name = webidl.converters.ByteString(name, prefix, 'name')
    value = webidl.converters.ByteString(value, prefix, 'value')

    // 1. Normalize value.
    value = headerValueNormalize(value)

    // 2. If name is not a header name or value is not a
    //    header value, then throw a TypeError.
    if (!isValidHeaderName(name)) {
      throw webidl.errors.invalidArgument({
        prefix,
        value: name,
        type: 'header name'
      })
    } else if (!isValidHeaderValue(value)) {
      throw webidl.errors.invalidArgument({
        prefix,
        value,
        type: 'header value'
      })
    }

    // 3. If this’s guard is "immutable", then throw a TypeError.
    // 4. Otherwise, if this’s guard is "request" and name is a
    //    forbidden header name, return.
    // 5. Otherwise, if this’s guard is "request-no-cors" and
    //    name/value is not a no-CORS-safelisted request-header,
    //    return.
    // 6. Otherwise, if this’s guard is "response" and name is a
    //    forbidden response-header name, return.
    // Note: undici does not implement forbidden header names
    if (this.#guard === 'immutable') {
      throw new TypeError('immutable')
    }

    // 7. Set (name, value) in this’s header list.
    // 8. If this’s guard is "request-no-cors", then remove
    //    privileged no-CORS request headers from this
    this.#headersList.set(name, value, false)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-getsetcookie
  getSetCookie () {
    webidl.brandCheck(this, Headers)

    // 1. If this’s header list does not contain `Set-Cookie`, then return « ».
    // 2. Return the values of all headers in this’s header list whose name is
    //    a byte-case-insensitive match for `Set-Cookie`, in order.

    const list = this.#headersList.cookies

    if (list) {
      return [...list]
    }

    return []
  }

  // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
  get [kHeadersSortedMap] () {
    if (this.#headersList[kHeadersSortedMap]) {
      return this.#headersList[kHeadersSortedMap]
    }

    // 1. Let headers be an empty list of headers with the key being the name
    //    and value the value.
    const headers = []

    // 2. Let names be the result of convert header names to a sorted-lowercase
    //    set with all the names of the headers in list.
    const names = this.#headersList.toSortedArray()

    const cookies = this.#headersList.cookies

    // fast-path
    if (cookies === null || cookies.length === 1) {
      // Note: The non-null assertion of value has already been done by `HeadersList#toSortedArray`
      return (this.#headersList[kHeadersSortedMap] = names)
    }

    // 3. For each name of names:
    for (let i = 0; i < names.length; ++i) {
      const { 0: name, 1: value } = names[i]
      // 1. If name is `set-cookie`, then:
      if (name === 'set-cookie') {
        // 1. Let values be a list of all values of headers in list whose name
        //    is a byte-case-insensitive match for name, in order.

        // 2. For each value of values:
        // 1. Append (name, value) to headers.
        for (let j = 0; j < cookies.length; ++j) {
          headers.push([name, cookies[j]])
        }
      } else {
        // 2. Otherwise:

        // 1. Let value be the result of getting name from list.

        // 2. Assert: value is non-null.
        // Note: This operation was done by `HeadersList#toSortedArray`.

        // 3. Append (name, value) to headers.
        headers.push([name, value])
      }
    }

    // 4. Return headers.
    return (this.#headersList[kHeadersSortedMap] = headers)
  }

  [util.inspect.custom] (depth, options) {
    options.depth ??= depth

    return `Headers ${util.formatWithOptions(options, this.#headersList.entries)}`
  }

  static getHeadersGuard (o) {
    return o.#guard
  }

  static setHeadersGuard (o, guard) {
    o.#guard = guard
  }

  static getHeadersList (o) {
    return o.#headersList
  }

  static setHeadersList (o, list) {
    o.#headersList = list
  }
}

const { getHeadersGuard, setHeadersGuard, getHeadersList, setHeadersList } = Headers
Reflect.deleteProperty(Headers, 'getHeadersGuard')
Reflect.deleteProperty(Headers, 'setHeadersGuard')
Reflect.deleteProperty(Headers, 'getHeadersList')
Reflect.deleteProperty(Headers, 'setHeadersList')

iteratorMixin('Headers', Headers, kHeadersSortedMap, 0, 1)

Object.defineProperties(Headers.prototype, {
  append: kEnumerableProperty,
  delete: kEnumerableProperty,
  get: kEnumerableProperty,
  has: kEnumerableProperty,
  set: kEnumerableProperty,
  getSetCookie: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'Headers',
    configurable: true
  },
  [util.inspect.custom]: {
    enumerable: false
  }
})

webidl.converters.HeadersInit = function (V, prefix, argument) {
  if (webidl.util.Type(V) === 'Object') {
    const iterator = Reflect.get(V, Symbol.iterator)

    // A work-around to ensure we send the properly-cased Headers when V is a Headers object.
    // Read https://github.com/nodejs/undici/pull/3159#issuecomment-2075537226 before touching, please.
    if (!util.types.isProxy(V) && iterator === Headers.prototype.entries) { // Headers object
      try {
        return getHeadersList(V).entriesList
      } catch {
        // fall-through
      }
    }

    if (typeof iterator === 'function') {
      return webidl.converters['sequence<sequence<ByteString>>'](V, prefix, argument, iterator.bind(V))
    }

    return webidl.converters['record<ByteString, ByteString>'](V, prefix, argument)
  }

  throw webidl.errors.conversionFailed({
    prefix: 'Headers constructor',
    argument: 'Argument 1',
    types: ['sequence<sequence<ByteString>>', 'record<ByteString, ByteString>']
  })
}

module.exports = {
  fill,
  // for test.
  compareHeaderName,
  Headers,
  HeadersList,
  getHeadersGuard,
  setHeadersGuard,
  setHeadersList,
  getHeadersList
}


/***/ }),

/***/ 7935:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
// https://github.com/Ethan-Arrowood/undici-fetch



const {
  makeNetworkError,
  makeAppropriateNetworkError,
  filterResponse,
  makeResponse,
  fromInnerResponse
} = __nccwpck_require__(6120)
const { HeadersList } = __nccwpck_require__(1401)
const { Request, cloneRequest } = __nccwpck_require__(9884)
const zlib = __nccwpck_require__(5628)
const {
  bytesMatch,
  makePolicyContainer,
  clonePolicyContainer,
  requestBadPort,
  TAOCheck,
  appendRequestOriginHeader,
  responseLocationURL,
  requestCurrentURL,
  setRequestReferrerPolicyOnRedirect,
  tryUpgradeRequestToAPotentiallyTrustworthyURL,
  createOpaqueTimingInfo,
  appendFetchMetadata,
  corsCheck,
  crossOriginResourcePolicyCheck,
  determineRequestsReferrer,
  coarsenedSharedCurrentTime,
  createDeferredPromise,
  isBlobLike,
  sameOrigin,
  isCancelled,
  isAborted,
  isErrorLike,
  fullyReadBody,
  readableStreamClose,
  isomorphicEncode,
  urlIsLocal,
  urlIsHttpHttpsScheme,
  urlHasHttpsScheme,
  clampAndCoarsenConnectionTimingInfo,
  simpleRangeHeaderValue,
  buildContentRange,
  createInflate,
  extractMimeType
} = __nccwpck_require__(8185)
const { kState, kDispatcher } = __nccwpck_require__(1937)
const assert = __nccwpck_require__(8061)
const { safelyExtractBody, extractBody } = __nccwpck_require__(2585)
const {
  redirectStatusSet,
  nullBodyStatus,
  safeMethodsSet,
  requestBodyHeader,
  subresourceSet
} = __nccwpck_require__(6564)
const EE = __nccwpck_require__(5673)
const { Readable, pipeline, finished } = __nccwpck_require__(4492)
const { addAbortListener, isErrored, isReadable, bufferToLowerCasedHeaderName } = __nccwpck_require__(9099)
const { dataURLProcessor, serializeAMimeType, minimizeSupportedMimeType } = __nccwpck_require__(5253)
const { getGlobalDispatcher } = __nccwpck_require__(415)
const { webidl } = __nccwpck_require__(9346)
const { STATUS_CODES } = __nccwpck_require__(8849)
const GET_OR_HEAD = ['GET', 'HEAD']

const defaultUserAgent = typeof __UNDICI_IS_NODE__ !== 'undefined' || typeof esbuildDetection !== 'undefined'
  ? 'node'
  : 'undici'

/** @type {import('buffer').resolveObjectURL} */
let resolveObjectURL

class Fetch extends EE {
  constructor (dispatcher) {
    super()

    this.dispatcher = dispatcher
    this.connection = null
    this.dump = false
    this.state = 'ongoing'
  }

  terminate (reason) {
    if (this.state !== 'ongoing') {
      return
    }

    this.state = 'terminated'
    this.connection?.destroy(reason)
    this.emit('terminated', reason)
  }

  // https://fetch.spec.whatwg.org/#fetch-controller-abort
  abort (error) {
    if (this.state !== 'ongoing') {
      return
    }

    // 1. Set controller’s state to "aborted".
    this.state = 'aborted'

    // 2. Let fallbackError be an "AbortError" DOMException.
    // 3. Set error to fallbackError if it is not given.
    if (!error) {
      error = new DOMException('The operation was aborted.', 'AbortError')
    }

    // 4. Let serializedError be StructuredSerialize(error).
    //    If that threw an exception, catch it, and let
    //    serializedError be StructuredSerialize(fallbackError).

    // 5. Set controller’s serialized abort reason to serializedError.
    this.serializedAbortReason = error

    this.connection?.destroy(error)
    this.emit('terminated', error)
  }
}

function handleFetchDone (response) {
  finalizeAndReportTiming(response, 'fetch')
}

// https://fetch.spec.whatwg.org/#fetch-method
function fetch (input, init = undefined) {
  webidl.argumentLengthCheck(arguments, 1, 'globalThis.fetch')

  // 1. Let p be a new promise.
  let p = createDeferredPromise()

  // 2. Let requestObject be the result of invoking the initial value of
  // Request as constructor with input and init as arguments. If this throws
  // an exception, reject p with it and return p.
  let requestObject

  try {
    requestObject = new Request(input, init)
  } catch (e) {
    p.reject(e)
    return p.promise
  }

  // 3. Let request be requestObject’s request.
  const request = requestObject[kState]

  // 4. If requestObject’s signal’s aborted flag is set, then:
  if (requestObject.signal.aborted) {
    // 1. Abort the fetch() call with p, request, null, and
    //    requestObject’s signal’s abort reason.
    abortFetch(p, request, null, requestObject.signal.reason)

    // 2. Return p.
    return p.promise
  }

  // 5. Let globalObject be request’s client’s global object.
  const globalObject = request.client.globalObject

  // 6. If globalObject is a ServiceWorkerGlobalScope object, then set
  // request’s service-workers mode to "none".
  if (globalObject?.constructor?.name === 'ServiceWorkerGlobalScope') {
    request.serviceWorkers = 'none'
  }

  // 7. Let responseObject be null.
  let responseObject = null

  // 8. Let relevantRealm be this’s relevant Realm.

  // 9. Let locallyAborted be false.
  let locallyAborted = false

  // 10. Let controller be null.
  let controller = null

  // 11. Add the following abort steps to requestObject’s signal:
  addAbortListener(
    requestObject.signal,
    () => {
      // 1. Set locallyAborted to true.
      locallyAborted = true

      // 2. Assert: controller is non-null.
      assert(controller != null)

      // 3. Abort controller with requestObject’s signal’s abort reason.
      controller.abort(requestObject.signal.reason)

      const realResponse = responseObject?.deref()

      // 4. Abort the fetch() call with p, request, responseObject,
      //    and requestObject’s signal’s abort reason.
      abortFetch(p, request, realResponse, requestObject.signal.reason)
    }
  )

  // 12. Let handleFetchDone given response response be to finalize and
  // report timing with response, globalObject, and "fetch".
  // see function handleFetchDone

  // 13. Set controller to the result of calling fetch given request,
  // with processResponseEndOfBody set to handleFetchDone, and processResponse
  // given response being these substeps:

  const processResponse = (response) => {
    // 1. If locallyAborted is true, terminate these substeps.
    if (locallyAborted) {
      return
    }

    // 2. If response’s aborted flag is set, then:
    if (response.aborted) {
      // 1. Let deserializedError be the result of deserialize a serialized
      //    abort reason given controller’s serialized abort reason and
      //    relevantRealm.

      // 2. Abort the fetch() call with p, request, responseObject, and
      //    deserializedError.

      abortFetch(p, request, responseObject, controller.serializedAbortReason)
      return
    }

    // 3. If response is a network error, then reject p with a TypeError
    // and terminate these substeps.
    if (response.type === 'error') {
      p.reject(new TypeError('fetch failed', { cause: response.error }))
      return
    }

    // 4. Set responseObject to the result of creating a Response object,
    // given response, "immutable", and relevantRealm.
    responseObject = new WeakRef(fromInnerResponse(response, 'immutable'))

    // 5. Resolve p with responseObject.
    p.resolve(responseObject.deref())
    p = null
  }

  controller = fetching({
    request,
    processResponseEndOfBody: handleFetchDone,
    processResponse,
    dispatcher: requestObject[kDispatcher] // undici
  })

  // 14. Return p.
  return p.promise
}

// https://fetch.spec.whatwg.org/#finalize-and-report-timing
function finalizeAndReportTiming (response, initiatorType = 'other') {
  // 1. If response is an aborted network error, then return.
  if (response.type === 'error' && response.aborted) {
    return
  }

  // 2. If response’s URL list is null or empty, then return.
  if (!response.urlList?.length) {
    return
  }

  // 3. Let originalURL be response’s URL list[0].
  const originalURL = response.urlList[0]

  // 4. Let timingInfo be response’s timing info.
  let timingInfo = response.timingInfo

  // 5. Let cacheState be response’s cache state.
  let cacheState = response.cacheState

  // 6. If originalURL’s scheme is not an HTTP(S) scheme, then return.
  if (!urlIsHttpHttpsScheme(originalURL)) {
    return
  }

  // 7. If timingInfo is null, then return.
  if (timingInfo === null) {
    return
  }

  // 8. If response’s timing allow passed flag is not set, then:
  if (!response.timingAllowPassed) {
    //  1. Set timingInfo to a the result of creating an opaque timing info for timingInfo.
    timingInfo = createOpaqueTimingInfo({
      startTime: timingInfo.startTime
    })

    //  2. Set cacheState to the empty string.
    cacheState = ''
  }

  // 9. Set timingInfo’s end time to the coarsened shared current time
  // given global’s relevant settings object’s cross-origin isolated
  // capability.
  // TODO: given global’s relevant settings object’s cross-origin isolated
  // capability?
  timingInfo.endTime = coarsenedSharedCurrentTime()

  // 10. Set response’s timing info to timingInfo.
  response.timingInfo = timingInfo

  // 11. Mark resource timing for timingInfo, originalURL, initiatorType,
  // global, and cacheState.
  markResourceTiming(
    timingInfo,
    originalURL.href,
    initiatorType,
    globalThis,
    cacheState
  )
}

// https://w3c.github.io/resource-timing/#dfn-mark-resource-timing
const markResourceTiming = performance.markResourceTiming

// https://fetch.spec.whatwg.org/#abort-fetch
function abortFetch (p, request, responseObject, error) {
  // 1. Reject promise with error.
  if (p) {
    // We might have already resolved the promise at this stage
    p.reject(error)
  }

  // 2. If request’s body is not null and is readable, then cancel request’s
  // body with error.
  if (request.body != null && isReadable(request.body?.stream)) {
    request.body.stream.cancel(error).catch((err) => {
      if (err.code === 'ERR_INVALID_STATE') {
        // Node bug?
        return
      }
      throw err
    })
  }

  // 3. If responseObject is null, then return.
  if (responseObject == null) {
    return
  }

  // 4. Let response be responseObject’s response.
  const response = responseObject[kState]

  // 5. If response’s body is not null and is readable, then error response’s
  // body with error.
  if (response.body != null && isReadable(response.body?.stream)) {
    response.body.stream.cancel(error).catch((err) => {
      if (err.code === 'ERR_INVALID_STATE') {
        // Node bug?
        return
      }
      throw err
    })
  }
}

// https://fetch.spec.whatwg.org/#fetching
function fetching ({
  request,
  processRequestBodyChunkLength,
  processRequestEndOfBody,
  processResponse,
  processResponseEndOfBody,
  processResponseConsumeBody,
  useParallelQueue = false,
  dispatcher = getGlobalDispatcher() // undici
}) {
  // Ensure that the dispatcher is set accordingly
  assert(dispatcher)

  // 1. Let taskDestination be null.
  let taskDestination = null

  // 2. Let crossOriginIsolatedCapability be false.
  let crossOriginIsolatedCapability = false

  // 3. If request’s client is non-null, then:
  if (request.client != null) {
    // 1. Set taskDestination to request’s client’s global object.
    taskDestination = request.client.globalObject

    // 2. Set crossOriginIsolatedCapability to request’s client’s cross-origin
    // isolated capability.
    crossOriginIsolatedCapability =
      request.client.crossOriginIsolatedCapability
  }

  // 4. If useParallelQueue is true, then set taskDestination to the result of
  // starting a new parallel queue.
  // TODO

  // 5. Let timingInfo be a new fetch timing info whose start time and
  // post-redirect start time are the coarsened shared current time given
  // crossOriginIsolatedCapability.
  const currentTime = coarsenedSharedCurrentTime(crossOriginIsolatedCapability)
  const timingInfo = createOpaqueTimingInfo({
    startTime: currentTime
  })

  // 6. Let fetchParams be a new fetch params whose
  // request is request,
  // timing info is timingInfo,
  // process request body chunk length is processRequestBodyChunkLength,
  // process request end-of-body is processRequestEndOfBody,
  // process response is processResponse,
  // process response consume body is processResponseConsumeBody,
  // process response end-of-body is processResponseEndOfBody,
  // task destination is taskDestination,
  // and cross-origin isolated capability is crossOriginIsolatedCapability.
  const fetchParams = {
    controller: new Fetch(dispatcher),
    request,
    timingInfo,
    processRequestBodyChunkLength,
    processRequestEndOfBody,
    processResponse,
    processResponseConsumeBody,
    processResponseEndOfBody,
    taskDestination,
    crossOriginIsolatedCapability
  }

  // 7. If request’s body is a byte sequence, then set request’s body to
  //    request’s body as a body.
  // NOTE: Since fetching is only called from fetch, body should already be
  // extracted.
  assert(!request.body || request.body.stream)

  // 8. If request’s window is "client", then set request’s window to request’s
  // client, if request’s client’s global object is a Window object; otherwise
  // "no-window".
  if (request.window === 'client') {
    // TODO: What if request.client is null?
    request.window =
      request.client?.globalObject?.constructor?.name === 'Window'
        ? request.client
        : 'no-window'
  }

  // 9. If request’s origin is "client", then set request’s origin to request’s
  // client’s origin.
  if (request.origin === 'client') {
    request.origin = request.client.origin
  }

  // 10. If all of the following conditions are true:
  // TODO

  // 11. If request’s policy container is "client", then:
  if (request.policyContainer === 'client') {
    // 1. If request’s client is non-null, then set request’s policy
    // container to a clone of request’s client’s policy container. [HTML]
    if (request.client != null) {
      request.policyContainer = clonePolicyContainer(
        request.client.policyContainer
      )
    } else {
      // 2. Otherwise, set request’s policy container to a new policy
      // container.
      request.policyContainer = makePolicyContainer()
    }
  }

  // 12. If request’s header list does not contain `Accept`, then:
  if (!request.headersList.contains('accept', true)) {
    // 1. Let value be `*/*`.
    const value = '*/*'

    // 2. A user agent should set value to the first matching statement, if
    // any, switching on request’s destination:
    // "document"
    // "frame"
    // "iframe"
    // `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`
    // "image"
    // `image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5`
    // "style"
    // `text/css,*/*;q=0.1`
    // TODO

    // 3. Append `Accept`/value to request’s header list.
    request.headersList.append('accept', value, true)
  }

  // 13. If request’s header list does not contain `Accept-Language`, then
  // user agents should append `Accept-Language`/an appropriate value to
  // request’s header list.
  if (!request.headersList.contains('accept-language', true)) {
    request.headersList.append('accept-language', '*', true)
  }

  // 14. If request’s priority is null, then use request’s initiator and
  // destination appropriately in setting request’s priority to a
  // user-agent-defined object.
  if (request.priority === null) {
    // TODO
  }

  // 15. If request is a subresource request, then:
  if (subresourceSet.has(request.destination)) {
    // TODO
  }

  // 16. Run main fetch given fetchParams.
  mainFetch(fetchParams)
    .catch(err => {
      fetchParams.controller.terminate(err)
    })

  // 17. Return fetchParam's controller
  return fetchParams.controller
}

// https://fetch.spec.whatwg.org/#concept-main-fetch
async function mainFetch (fetchParams, recursive = false) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let response be null.
  let response = null

  // 3. If request’s local-URLs-only flag is set and request’s current URL is
  // not local, then set response to a network error.
  if (request.localURLsOnly && !urlIsLocal(requestCurrentURL(request))) {
    response = makeNetworkError('local URLs only')
  }

  // 4. Run report Content Security Policy violations for request.
  // TODO

  // 5. Upgrade request to a potentially trustworthy URL, if appropriate.
  tryUpgradeRequestToAPotentiallyTrustworthyURL(request)

  // 6. If should request be blocked due to a bad port, should fetching request
  // be blocked as mixed content, or should request be blocked by Content
  // Security Policy returns blocked, then set response to a network error.
  if (requestBadPort(request) === 'blocked') {
    response = makeNetworkError('bad port')
  }
  // TODO: should fetching request be blocked as mixed content?
  // TODO: should request be blocked by Content Security Policy?

  // 7. If request’s referrer policy is the empty string, then set request’s
  // referrer policy to request’s policy container’s referrer policy.
  if (request.referrerPolicy === '') {
    request.referrerPolicy = request.policyContainer.referrerPolicy
  }

  // 8. If request’s referrer is not "no-referrer", then set request’s
  // referrer to the result of invoking determine request’s referrer.
  if (request.referrer !== 'no-referrer') {
    request.referrer = determineRequestsReferrer(request)
  }

  // 9. Set request’s current URL’s scheme to "https" if all of the following
  // conditions are true:
  // - request’s current URL’s scheme is "http"
  // - request’s current URL’s host is a domain
  // - Matching request’s current URL’s host per Known HSTS Host Domain Name
  //   Matching results in either a superdomain match with an asserted
  //   includeSubDomains directive or a congruent match (with or without an
  //   asserted includeSubDomains directive). [HSTS]
  // TODO

  // 10. If recursive is false, then run the remaining steps in parallel.
  // TODO

  // 11. If response is null, then set response to the result of running
  // the steps corresponding to the first matching statement:
  if (response === null) {
    response = await (async () => {
      const currentURL = requestCurrentURL(request)

      if (
        // - request’s current URL’s origin is same origin with request’s origin,
        //   and request’s response tainting is "basic"
        (sameOrigin(currentURL, request.url) && request.responseTainting === 'basic') ||
        // request’s current URL’s scheme is "data"
        (currentURL.protocol === 'data:') ||
        // - request’s mode is "navigate" or "websocket"
        (request.mode === 'navigate' || request.mode === 'websocket')
      ) {
        // 1. Set request’s response tainting to "basic".
        request.responseTainting = 'basic'

        // 2. Return the result of running scheme fetch given fetchParams.
        return await schemeFetch(fetchParams)
      }

      // request’s mode is "same-origin"
      if (request.mode === 'same-origin') {
        // 1. Return a network error.
        return makeNetworkError('request mode cannot be "same-origin"')
      }

      // request’s mode is "no-cors"
      if (request.mode === 'no-cors') {
        // 1. If request’s redirect mode is not "follow", then return a network
        // error.
        if (request.redirect !== 'follow') {
          return makeNetworkError(
            'redirect mode cannot be "follow" for "no-cors" request'
          )
        }

        // 2. Set request’s response tainting to "opaque".
        request.responseTainting = 'opaque'

        // 3. Return the result of running scheme fetch given fetchParams.
        return await schemeFetch(fetchParams)
      }

      // request’s current URL’s scheme is not an HTTP(S) scheme
      if (!urlIsHttpHttpsScheme(requestCurrentURL(request))) {
        // Return a network error.
        return makeNetworkError('URL scheme must be a HTTP(S) scheme')
      }

      // - request’s use-CORS-preflight flag is set
      // - request’s unsafe-request flag is set and either request’s method is
      //   not a CORS-safelisted method or CORS-unsafe request-header names with
      //   request’s header list is not empty
      //    1. Set request’s response tainting to "cors".
      //    2. Let corsWithPreflightResponse be the result of running HTTP fetch
      //    given fetchParams and true.
      //    3. If corsWithPreflightResponse is a network error, then clear cache
      //    entries using request.
      //    4. Return corsWithPreflightResponse.
      // TODO

      // Otherwise
      //    1. Set request’s response tainting to "cors".
      request.responseTainting = 'cors'

      //    2. Return the result of running HTTP fetch given fetchParams.
      return await httpFetch(fetchParams)
    })()
  }

  // 12. If recursive is true, then return response.
  if (recursive) {
    return response
  }

  // 13. If response is not a network error and response is not a filtered
  // response, then:
  if (response.status !== 0 && !response.internalResponse) {
    // If request’s response tainting is "cors", then:
    if (request.responseTainting === 'cors') {
      // 1. Let headerNames be the result of extracting header list values
      // given `Access-Control-Expose-Headers` and response’s header list.
      // TODO
      // 2. If request’s credentials mode is not "include" and headerNames
      // contains `*`, then set response’s CORS-exposed header-name list to
      // all unique header names in response’s header list.
      // TODO
      // 3. Otherwise, if headerNames is not null or failure, then set
      // response’s CORS-exposed header-name list to headerNames.
      // TODO
    }

    // Set response to the following filtered response with response as its
    // internal response, depending on request’s response tainting:
    if (request.responseTainting === 'basic') {
      response = filterResponse(response, 'basic')
    } else if (request.responseTainting === 'cors') {
      response = filterResponse(response, 'cors')
    } else if (request.responseTainting === 'opaque') {
      response = filterResponse(response, 'opaque')
    } else {
      assert(false)
    }
  }

  // 14. Let internalResponse be response, if response is a network error,
  // and response’s internal response otherwise.
  let internalResponse =
    response.status === 0 ? response : response.internalResponse

  // 15. If internalResponse’s URL list is empty, then set it to a clone of
  // request’s URL list.
  if (internalResponse.urlList.length === 0) {
    internalResponse.urlList.push(...request.urlList)
  }

  // 16. If request’s timing allow failed flag is unset, then set
  // internalResponse’s timing allow passed flag.
  if (!request.timingAllowFailed) {
    response.timingAllowPassed = true
  }

  // 17. If response is not a network error and any of the following returns
  // blocked
  // - should internalResponse to request be blocked as mixed content
  // - should internalResponse to request be blocked by Content Security Policy
  // - should internalResponse to request be blocked due to its MIME type
  // - should internalResponse to request be blocked due to nosniff
  // TODO

  // 18. If response’s type is "opaque", internalResponse’s status is 206,
  // internalResponse’s range-requested flag is set, and request’s header
  // list does not contain `Range`, then set response and internalResponse
  // to a network error.
  if (
    response.type === 'opaque' &&
    internalResponse.status === 206 &&
    internalResponse.rangeRequested &&
    !request.headers.contains('range', true)
  ) {
    response = internalResponse = makeNetworkError()
  }

  // 19. If response is not a network error and either request’s method is
  // `HEAD` or `CONNECT`, or internalResponse’s status is a null body status,
  // set internalResponse’s body to null and disregard any enqueuing toward
  // it (if any).
  if (
    response.status !== 0 &&
    (request.method === 'HEAD' ||
      request.method === 'CONNECT' ||
      nullBodyStatus.includes(internalResponse.status))
  ) {
    internalResponse.body = null
    fetchParams.controller.dump = true
  }

  // 20. If request’s integrity metadata is not the empty string, then:
  if (request.integrity) {
    // 1. Let processBodyError be this step: run fetch finale given fetchParams
    // and a network error.
    const processBodyError = (reason) =>
      fetchFinale(fetchParams, makeNetworkError(reason))

    // 2. If request’s response tainting is "opaque", or response’s body is null,
    // then run processBodyError and abort these steps.
    if (request.responseTainting === 'opaque' || response.body == null) {
      processBodyError(response.error)
      return
    }

    // 3. Let processBody given bytes be these steps:
    const processBody = (bytes) => {
      // 1. If bytes do not match request’s integrity metadata,
      // then run processBodyError and abort these steps. [SRI]
      if (!bytesMatch(bytes, request.integrity)) {
        processBodyError('integrity mismatch')
        return
      }

      // 2. Set response’s body to bytes as a body.
      response.body = safelyExtractBody(bytes)[0]

      // 3. Run fetch finale given fetchParams and response.
      fetchFinale(fetchParams, response)
    }

    // 4. Fully read response’s body given processBody and processBodyError.
    await fullyReadBody(response.body, processBody, processBodyError)
  } else {
    // 21. Otherwise, run fetch finale given fetchParams and response.
    fetchFinale(fetchParams, response)
  }
}

// https://fetch.spec.whatwg.org/#concept-scheme-fetch
// given a fetch params fetchParams
function schemeFetch (fetchParams) {
  // Note: since the connection is destroyed on redirect, which sets fetchParams to a
  // cancelled state, we do not want this condition to trigger *unless* there have been
  // no redirects. See https://github.com/nodejs/undici/issues/1776
  // 1. If fetchParams is canceled, then return the appropriate network error for fetchParams.
  if (isCancelled(fetchParams) && fetchParams.request.redirectCount === 0) {
    return Promise.resolve(makeAppropriateNetworkError(fetchParams))
  }

  // 2. Let request be fetchParams’s request.
  const { request } = fetchParams

  const { protocol: scheme } = requestCurrentURL(request)

  // 3. Switch on request’s current URL’s scheme and run the associated steps:
  switch (scheme) {
    case 'about:': {
      // If request’s current URL’s path is the string "blank", then return a new response
      // whose status message is `OK`, header list is « (`Content-Type`, `text/html;charset=utf-8`) »,
      // and body is the empty byte sequence as a body.

      // Otherwise, return a network error.
      return Promise.resolve(makeNetworkError('about scheme is not supported'))
    }
    case 'blob:': {
      if (!resolveObjectURL) {
        resolveObjectURL = (__nccwpck_require__(2254).resolveObjectURL)
      }

      // 1. Let blobURLEntry be request’s current URL’s blob URL entry.
      const blobURLEntry = requestCurrentURL(request)

      // https://github.com/web-platform-tests/wpt/blob/7b0ebaccc62b566a1965396e5be7bb2bc06f841f/FileAPI/url/resources/fetch-tests.js#L52-L56
      // Buffer.resolveObjectURL does not ignore URL queries.
      if (blobURLEntry.search.length !== 0) {
        return Promise.resolve(makeNetworkError('NetworkError when attempting to fetch resource.'))
      }

      const blob = resolveObjectURL(blobURLEntry.toString())

      // 2. If request’s method is not `GET`, blobURLEntry is null, or blobURLEntry’s
      //    object is not a Blob object, then return a network error.
      if (request.method !== 'GET' || !isBlobLike(blob)) {
        return Promise.resolve(makeNetworkError('invalid method'))
      }

      // 3. Let blob be blobURLEntry’s object.
      // Note: done above

      // 4. Let response be a new response.
      const response = makeResponse()

      // 5. Let fullLength be blob’s size.
      const fullLength = blob.size

      // 6. Let serializedFullLength be fullLength, serialized and isomorphic encoded.
      const serializedFullLength = isomorphicEncode(`${fullLength}`)

      // 7. Let type be blob’s type.
      const type = blob.type

      // 8. If request’s header list does not contain `Range`:
      // 9. Otherwise:
      if (!request.headersList.contains('range', true)) {
        // 1. Let bodyWithType be the result of safely extracting blob.
        // Note: in the FileAPI a blob "object" is a Blob *or* a MediaSource.
        // In node, this can only ever be a Blob. Therefore we can safely
        // use extractBody directly.
        const bodyWithType = extractBody(blob)

        // 2. Set response’s status message to `OK`.
        response.statusText = 'OK'

        // 3. Set response’s body to bodyWithType’s body.
        response.body = bodyWithType[0]

        // 4. Set response’s header list to « (`Content-Length`, serializedFullLength), (`Content-Type`, type) ».
        response.headersList.set('content-length', serializedFullLength, true)
        response.headersList.set('content-type', type, true)
      } else {
        // 1. Set response’s range-requested flag.
        response.rangeRequested = true

        // 2. Let rangeHeader be the result of getting `Range` from request’s header list.
        const rangeHeader = request.headersList.get('range', true)

        // 3. Let rangeValue be the result of parsing a single range header value given rangeHeader and true.
        const rangeValue = simpleRangeHeaderValue(rangeHeader, true)

        // 4. If rangeValue is failure, then return a network error.
        if (rangeValue === 'failure') {
          return Promise.resolve(makeNetworkError('failed to fetch the data URL'))
        }

        // 5. Let (rangeStart, rangeEnd) be rangeValue.
        let { rangeStartValue: rangeStart, rangeEndValue: rangeEnd } = rangeValue

        // 6. If rangeStart is null:
        // 7. Otherwise:
        if (rangeStart === null) {
          // 1. Set rangeStart to fullLength − rangeEnd.
          rangeStart = fullLength - rangeEnd

          // 2. Set rangeEnd to rangeStart + rangeEnd − 1.
          rangeEnd = rangeStart + rangeEnd - 1
        } else {
          // 1. If rangeStart is greater than or equal to fullLength, then return a network error.
          if (rangeStart >= fullLength) {
            return Promise.resolve(makeNetworkError('Range start is greater than the blob\'s size.'))
          }

          // 2. If rangeEnd is null or rangeEnd is greater than or equal to fullLength, then set
          //    rangeEnd to fullLength − 1.
          if (rangeEnd === null || rangeEnd >= fullLength) {
            rangeEnd = fullLength - 1
          }
        }

        // 8. Let slicedBlob be the result of invoking slice blob given blob, rangeStart,
        //    rangeEnd + 1, and type.
        const slicedBlob = blob.slice(rangeStart, rangeEnd, type)

        // 9. Let slicedBodyWithType be the result of safely extracting slicedBlob.
        // Note: same reason as mentioned above as to why we use extractBody
        const slicedBodyWithType = extractBody(slicedBlob)

        // 10. Set response’s body to slicedBodyWithType’s body.
        response.body = slicedBodyWithType[0]

        // 11. Let serializedSlicedLength be slicedBlob’s size, serialized and isomorphic encoded.
        const serializedSlicedLength = isomorphicEncode(`${slicedBlob.size}`)

        // 12. Let contentRange be the result of invoking build a content range given rangeStart,
        //     rangeEnd, and fullLength.
        const contentRange = buildContentRange(rangeStart, rangeEnd, fullLength)

        // 13. Set response’s status to 206.
        response.status = 206

        // 14. Set response’s status message to `Partial Content`.
        response.statusText = 'Partial Content'

        // 15. Set response’s header list to « (`Content-Length`, serializedSlicedLength),
        //     (`Content-Type`, type), (`Content-Range`, contentRange) ».
        response.headersList.set('content-length', serializedSlicedLength, true)
        response.headersList.set('content-type', type, true)
        response.headersList.set('content-range', contentRange, true)
      }

      // 10. Return response.
      return Promise.resolve(response)
    }
    case 'data:': {
      // 1. Let dataURLStruct be the result of running the
      //    data: URL processor on request’s current URL.
      const currentURL = requestCurrentURL(request)
      const dataURLStruct = dataURLProcessor(currentURL)

      // 2. If dataURLStruct is failure, then return a
      //    network error.
      if (dataURLStruct === 'failure') {
        return Promise.resolve(makeNetworkError('failed to fetch the data URL'))
      }

      // 3. Let mimeType be dataURLStruct’s MIME type, serialized.
      const mimeType = serializeAMimeType(dataURLStruct.mimeType)

      // 4. Return a response whose status message is `OK`,
      //    header list is « (`Content-Type`, mimeType) »,
      //    and body is dataURLStruct’s body as a body.
      return Promise.resolve(makeResponse({
        statusText: 'OK',
        headersList: [
          ['content-type', { name: 'Content-Type', value: mimeType }]
        ],
        body: safelyExtractBody(dataURLStruct.body)[0]
      }))
    }
    case 'file:': {
      // For now, unfortunate as it is, file URLs are left as an exercise for the reader.
      // When in doubt, return a network error.
      return Promise.resolve(makeNetworkError('not implemented... yet...'))
    }
    case 'http:':
    case 'https:': {
      // Return the result of running HTTP fetch given fetchParams.

      return httpFetch(fetchParams)
        .catch((err) => makeNetworkError(err))
    }
    default: {
      return Promise.resolve(makeNetworkError('unknown scheme'))
    }
  }
}

// https://fetch.spec.whatwg.org/#finalize-response
function finalizeResponse (fetchParams, response) {
  // 1. Set fetchParams’s request’s done flag.
  fetchParams.request.done = true

  // 2, If fetchParams’s process response done is not null, then queue a fetch
  // task to run fetchParams’s process response done given response, with
  // fetchParams’s task destination.
  if (fetchParams.processResponseDone != null) {
    queueMicrotask(() => fetchParams.processResponseDone(response))
  }
}

// https://fetch.spec.whatwg.org/#fetch-finale
function fetchFinale (fetchParams, response) {
  // 1. Let timingInfo be fetchParams’s timing info.
  let timingInfo = fetchParams.timingInfo

  // 2. If response is not a network error and fetchParams’s request’s client is a secure context,
  //    then set timingInfo’s server-timing headers to the result of getting, decoding, and splitting
  //    `Server-Timing` from response’s internal response’s header list.
  // TODO

  // 3. Let processResponseEndOfBody be the following steps:
  const processResponseEndOfBody = () => {
    // 1. Let unsafeEndTime be the unsafe shared current time.
    const unsafeEndTime = Date.now() // ?

    // 2. If fetchParams’s request’s destination is "document", then set fetchParams’s controller’s
    //    full timing info to fetchParams’s timing info.
    if (fetchParams.request.destination === 'document') {
      fetchParams.controller.fullTimingInfo = timingInfo
    }

    // 3. Set fetchParams’s controller’s report timing steps to the following steps given a global object global:
    fetchParams.controller.reportTimingSteps = () => {
      // 1. If fetchParams’s request’s URL’s scheme is not an HTTP(S) scheme, then return.
      if (fetchParams.request.url.protocol !== 'https:') {
        return
      }

      // 2. Set timingInfo’s end time to the relative high resolution time given unsafeEndTime and global.
      timingInfo.endTime = unsafeEndTime

      // 3. Let cacheState be response’s cache state.
      let cacheState = response.cacheState

      // 4. Let bodyInfo be response’s body info.
      const bodyInfo = response.bodyInfo

      // 5. If response’s timing allow passed flag is not set, then set timingInfo to the result of creating an
      //    opaque timing info for timingInfo and set cacheState to the empty string.
      if (!response.timingAllowPassed) {
        timingInfo = createOpaqueTimingInfo(timingInfo)

        cacheState = ''
      }

      // 6. Let responseStatus be 0.
      let responseStatus = 0

      // 7. If fetchParams’s request’s mode is not "navigate" or response’s has-cross-origin-redirects is false:
      if (fetchParams.request.mode !== 'navigator' || !response.hasCrossOriginRedirects) {
        // 1. Set responseStatus to response’s status.
        responseStatus = response.status

        // 2. Let mimeType be the result of extracting a MIME type from response’s header list.
        const mimeType = extractMimeType(response.headersList)

        // 3. If mimeType is not failure, then set bodyInfo’s content type to the result of minimizing a supported MIME type given mimeType.
        if (mimeType !== 'failure') {
          bodyInfo.contentType = minimizeSupportedMimeType(mimeType)
        }
      }

      // 8. If fetchParams’s request’s initiator type is non-null, then mark resource timing given timingInfo,
      //    fetchParams’s request’s URL, fetchParams’s request’s initiator type, global, cacheState, bodyInfo,
      //    and responseStatus.
      if (fetchParams.request.initiatorType != null) {
        // TODO: update markresourcetiming
        markResourceTiming(timingInfo, fetchParams.request.url.href, fetchParams.request.initiatorType, globalThis, cacheState, bodyInfo, responseStatus)
      }
    }

    // 4. Let processResponseEndOfBodyTask be the following steps:
    const processResponseEndOfBodyTask = () => {
      // 1. Set fetchParams’s request’s done flag.
      fetchParams.request.done = true

      // 2. If fetchParams’s process response end-of-body is non-null, then run fetchParams’s process
      //    response end-of-body given response.
      if (fetchParams.processResponseEndOfBody != null) {
        queueMicrotask(() => fetchParams.processResponseEndOfBody(response))
      }

      // 3. If fetchParams’s request’s initiator type is non-null and fetchParams’s request’s client’s
      //    global object is fetchParams’s task destination, then run fetchParams’s controller’s report
      //    timing steps given fetchParams’s request’s client’s global object.
      if (fetchParams.request.initiatorType != null) {
        fetchParams.controller.reportTimingSteps()
      }
    }

    // 5. Queue a fetch task to run processResponseEndOfBodyTask with fetchParams’s task destination
    queueMicrotask(() => processResponseEndOfBodyTask())
  }

  // 4. If fetchParams’s process response is non-null, then queue a fetch task to run fetchParams’s
  //    process response given response, with fetchParams’s task destination.
  if (fetchParams.processResponse != null) {
    queueMicrotask(() => {
      fetchParams.processResponse(response)
      fetchParams.processResponse = null
    })
  }

  // 5. Let internalResponse be response, if response is a network error; otherwise response’s internal response.
  const internalResponse = response.type === 'error' ? response : (response.internalResponse ?? response)

  // 6. If internalResponse’s body is null, then run processResponseEndOfBody.
  // 7. Otherwise:
  if (internalResponse.body == null) {
    processResponseEndOfBody()
  } else {
    // mcollina: all the following steps of the specs are skipped.
    // The internal transform stream is not needed.
    // See https://github.com/nodejs/undici/pull/3093#issuecomment-2050198541

    // 1. Let transformStream be a new TransformStream.
    // 2. Let identityTransformAlgorithm be an algorithm which, given chunk, enqueues chunk in transformStream.
    // 3. Set up transformStream with transformAlgorithm set to identityTransformAlgorithm and flushAlgorithm
    //    set to processResponseEndOfBody.
    // 4. Set internalResponse’s body’s stream to the result of internalResponse’s body’s stream piped through transformStream.

    finished(internalResponse.body.stream, () => {
      processResponseEndOfBody()
    })
  }
}

// https://fetch.spec.whatwg.org/#http-fetch
async function httpFetch (fetchParams) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let response be null.
  let response = null

  // 3. Let actualResponse be null.
  let actualResponse = null

  // 4. Let timingInfo be fetchParams’s timing info.
  const timingInfo = fetchParams.timingInfo

  // 5. If request’s service-workers mode is "all", then:
  if (request.serviceWorkers === 'all') {
    // TODO
  }

  // 6. If response is null, then:
  if (response === null) {
    // 1. If makeCORSPreflight is true and one of these conditions is true:
    // TODO

    // 2. If request’s redirect mode is "follow", then set request’s
    // service-workers mode to "none".
    if (request.redirect === 'follow') {
      request.serviceWorkers = 'none'
    }

    // 3. Set response and actualResponse to the result of running
    // HTTP-network-or-cache fetch given fetchParams.
    actualResponse = response = await httpNetworkOrCacheFetch(fetchParams)

    // 4. If request’s response tainting is "cors" and a CORS check
    // for request and response returns failure, then return a network error.
    if (
      request.responseTainting === 'cors' &&
      corsCheck(request, response) === 'failure'
    ) {
      return makeNetworkError('cors failure')
    }

    // 5. If the TAO check for request and response returns failure, then set
    // request’s timing allow failed flag.
    if (TAOCheck(request, response) === 'failure') {
      request.timingAllowFailed = true
    }
  }

  // 7. If either request’s response tainting or response’s type
  // is "opaque", and the cross-origin resource policy check with
  // request’s origin, request’s client, request’s destination,
  // and actualResponse returns blocked, then return a network error.
  if (
    (request.responseTainting === 'opaque' || response.type === 'opaque') &&
    crossOriginResourcePolicyCheck(
      request.origin,
      request.client,
      request.destination,
      actualResponse
    ) === 'blocked'
  ) {
    return makeNetworkError('blocked')
  }

  // 8. If actualResponse’s status is a redirect status, then:
  if (redirectStatusSet.has(actualResponse.status)) {
    // 1. If actualResponse’s status is not 303, request’s body is not null,
    // and the connection uses HTTP/2, then user agents may, and are even
    // encouraged to, transmit an RST_STREAM frame.
    // See, https://github.com/whatwg/fetch/issues/1288
    if (request.redirect !== 'manual') {
      fetchParams.controller.connection.destroy(undefined, false)
    }

    // 2. Switch on request’s redirect mode:
    if (request.redirect === 'error') {
      // Set response to a network error.
      response = makeNetworkError('unexpected redirect')
    } else if (request.redirect === 'manual') {
      // Set response to an opaque-redirect filtered response whose internal
      // response is actualResponse.
      // NOTE(spec): On the web this would return an `opaqueredirect` response,
      // but that doesn't make sense server side.
      // See https://github.com/nodejs/undici/issues/1193.
      response = actualResponse
    } else if (request.redirect === 'follow') {
      // Set response to the result of running HTTP-redirect fetch given
      // fetchParams and response.
      response = await httpRedirectFetch(fetchParams, response)
    } else {
      assert(false)
    }
  }

  // 9. Set response’s timing info to timingInfo.
  response.timingInfo = timingInfo

  // 10. Return response.
  return response
}

// https://fetch.spec.whatwg.org/#http-redirect-fetch
function httpRedirectFetch (fetchParams, response) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let actualResponse be response, if response is not a filtered response,
  // and response’s internal response otherwise.
  const actualResponse = response.internalResponse
    ? response.internalResponse
    : response

  // 3. Let locationURL be actualResponse’s location URL given request’s current
  // URL’s fragment.
  let locationURL

  try {
    locationURL = responseLocationURL(
      actualResponse,
      requestCurrentURL(request).hash
    )

    // 4. If locationURL is null, then return response.
    if (locationURL == null) {
      return response
    }
  } catch (err) {
    // 5. If locationURL is failure, then return a network error.
    return Promise.resolve(makeNetworkError(err))
  }

  // 6. If locationURL’s scheme is not an HTTP(S) scheme, then return a network
  // error.
  if (!urlIsHttpHttpsScheme(locationURL)) {
    return Promise.resolve(makeNetworkError('URL scheme must be a HTTP(S) scheme'))
  }

  // 7. If request’s redirect count is 20, then return a network error.
  if (request.redirectCount === 20) {
    return Promise.resolve(makeNetworkError('redirect count exceeded'))
  }

  // 8. Increase request’s redirect count by 1.
  request.redirectCount += 1

  // 9. If request’s mode is "cors", locationURL includes credentials, and
  // request’s origin is not same origin with locationURL’s origin, then return
  //  a network error.
  if (
    request.mode === 'cors' &&
    (locationURL.username || locationURL.password) &&
    !sameOrigin(request, locationURL)
  ) {
    return Promise.resolve(makeNetworkError('cross origin not allowed for request mode "cors"'))
  }

  // 10. If request’s response tainting is "cors" and locationURL includes
  // credentials, then return a network error.
  if (
    request.responseTainting === 'cors' &&
    (locationURL.username || locationURL.password)
  ) {
    return Promise.resolve(makeNetworkError(
      'URL cannot contain credentials for request mode "cors"'
    ))
  }

  // 11. If actualResponse’s status is not 303, request’s body is non-null,
  // and request’s body’s source is null, then return a network error.
  if (
    actualResponse.status !== 303 &&
    request.body != null &&
    request.body.source == null
  ) {
    return Promise.resolve(makeNetworkError())
  }

  // 12. If one of the following is true
  // - actualResponse’s status is 301 or 302 and request’s method is `POST`
  // - actualResponse’s status is 303 and request’s method is not `GET` or `HEAD`
  if (
    ([301, 302].includes(actualResponse.status) && request.method === 'POST') ||
    (actualResponse.status === 303 &&
      !GET_OR_HEAD.includes(request.method))
  ) {
    // then:
    // 1. Set request’s method to `GET` and request’s body to null.
    request.method = 'GET'
    request.body = null

    // 2. For each headerName of request-body-header name, delete headerName from
    // request’s header list.
    for (const headerName of requestBodyHeader) {
      request.headersList.delete(headerName)
    }
  }

  // 13. If request’s current URL’s origin is not same origin with locationURL’s
  //     origin, then for each headerName of CORS non-wildcard request-header name,
  //     delete headerName from request’s header list.
  if (!sameOrigin(requestCurrentURL(request), locationURL)) {
    // https://fetch.spec.whatwg.org/#cors-non-wildcard-request-header-name
    request.headersList.delete('authorization', true)

    // https://fetch.spec.whatwg.org/#authentication-entries
    request.headersList.delete('proxy-authorization', true)

    // "Cookie" and "Host" are forbidden request-headers, which undici doesn't implement.
    request.headersList.delete('cookie', true)
    request.headersList.delete('host', true)
  }

  // 14. If request’s body is non-null, then set request’s body to the first return
  // value of safely extracting request’s body’s source.
  if (request.body != null) {
    assert(request.body.source != null)
    request.body = safelyExtractBody(request.body.source)[0]
  }

  // 15. Let timingInfo be fetchParams’s timing info.
  const timingInfo = fetchParams.timingInfo

  // 16. Set timingInfo’s redirect end time and post-redirect start time to the
  // coarsened shared current time given fetchParams’s cross-origin isolated
  // capability.
  timingInfo.redirectEndTime = timingInfo.postRedirectStartTime =
    coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability)

  // 17. If timingInfo’s redirect start time is 0, then set timingInfo’s
  //  redirect start time to timingInfo’s start time.
  if (timingInfo.redirectStartTime === 0) {
    timingInfo.redirectStartTime = timingInfo.startTime
  }

  // 18. Append locationURL to request’s URL list.
  request.urlList.push(locationURL)

  // 19. Invoke set request’s referrer policy on redirect on request and
  // actualResponse.
  setRequestReferrerPolicyOnRedirect(request, actualResponse)

  // 20. Return the result of running main fetch given fetchParams and true.
  return mainFetch(fetchParams, true)
}

// https://fetch.spec.whatwg.org/#http-network-or-cache-fetch
async function httpNetworkOrCacheFetch (
  fetchParams,
  isAuthenticationFetch = false,
  isNewConnectionFetch = false
) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let httpFetchParams be null.
  let httpFetchParams = null

  // 3. Let httpRequest be null.
  let httpRequest = null

  // 4. Let response be null.
  let response = null

  // 5. Let storedResponse be null.
  // TODO: cache

  // 6. Let httpCache be null.
  const httpCache = null

  // 7. Let the revalidatingFlag be unset.
  const revalidatingFlag = false

  // 8. Run these steps, but abort when the ongoing fetch is terminated:

  //    1. If request’s window is "no-window" and request’s redirect mode is
  //    "error", then set httpFetchParams to fetchParams and httpRequest to
  //    request.
  if (request.window === 'no-window' && request.redirect === 'error') {
    httpFetchParams = fetchParams
    httpRequest = request
  } else {
    // Otherwise:

    // 1. Set httpRequest to a clone of request.
    httpRequest = cloneRequest(request)

    // 2. Set httpFetchParams to a copy of fetchParams.
    httpFetchParams = { ...fetchParams }

    // 3. Set httpFetchParams’s request to httpRequest.
    httpFetchParams.request = httpRequest
  }

  //    3. Let includeCredentials be true if one of
  const includeCredentials =
    request.credentials === 'include' ||
    (request.credentials === 'same-origin' &&
      request.responseTainting === 'basic')

  //    4. Let contentLength be httpRequest’s body’s length, if httpRequest’s
  //    body is non-null; otherwise null.
  const contentLength = httpRequest.body ? httpRequest.body.length : null

  //    5. Let contentLengthHeaderValue be null.
  let contentLengthHeaderValue = null

  //    6. If httpRequest’s body is null and httpRequest’s method is `POST` or
  //    `PUT`, then set contentLengthHeaderValue to `0`.
  if (
    httpRequest.body == null &&
    ['POST', 'PUT'].includes(httpRequest.method)
  ) {
    contentLengthHeaderValue = '0'
  }

  //    7. If contentLength is non-null, then set contentLengthHeaderValue to
  //    contentLength, serialized and isomorphic encoded.
  if (contentLength != null) {
    contentLengthHeaderValue = isomorphicEncode(`${contentLength}`)
  }

  //    8. If contentLengthHeaderValue is non-null, then append
  //    `Content-Length`/contentLengthHeaderValue to httpRequest’s header
  //    list.
  if (contentLengthHeaderValue != null) {
    httpRequest.headersList.append('content-length', contentLengthHeaderValue, true)
  }

  //    9. If contentLengthHeaderValue is non-null, then append (`Content-Length`,
  //    contentLengthHeaderValue) to httpRequest’s header list.

  //    10. If contentLength is non-null and httpRequest’s keepalive is true,
  //    then:
  if (contentLength != null && httpRequest.keepalive) {
    // NOTE: keepalive is a noop outside of browser context.
  }

  //    11. If httpRequest’s referrer is a URL, then append
  //    `Referer`/httpRequest’s referrer, serialized and isomorphic encoded,
  //     to httpRequest’s header list.
  if (httpRequest.referrer instanceof URL) {
    httpRequest.headersList.append('referer', isomorphicEncode(httpRequest.referrer.href), true)
  }

  //    12. Append a request `Origin` header for httpRequest.
  appendRequestOriginHeader(httpRequest)

  //    13. Append the Fetch metadata headers for httpRequest. [FETCH-METADATA]
  appendFetchMetadata(httpRequest)

  //    14. If httpRequest’s header list does not contain `User-Agent`, then
  //    user agents should append `User-Agent`/default `User-Agent` value to
  //    httpRequest’s header list.
  if (!httpRequest.headersList.contains('user-agent', true)) {
    httpRequest.headersList.append('user-agent', defaultUserAgent)
  }

  //    15. If httpRequest’s cache mode is "default" and httpRequest’s header
  //    list contains `If-Modified-Since`, `If-None-Match`,
  //    `If-Unmodified-Since`, `If-Match`, or `If-Range`, then set
  //    httpRequest’s cache mode to "no-store".
  if (
    httpRequest.cache === 'default' &&
    (httpRequest.headersList.contains('if-modified-since', true) ||
      httpRequest.headersList.contains('if-none-match', true) ||
      httpRequest.headersList.contains('if-unmodified-since', true) ||
      httpRequest.headersList.contains('if-match', true) ||
      httpRequest.headersList.contains('if-range', true))
  ) {
    httpRequest.cache = 'no-store'
  }

  //    16. If httpRequest’s cache mode is "no-cache", httpRequest’s prevent
  //    no-cache cache-control header modification flag is unset, and
  //    httpRequest’s header list does not contain `Cache-Control`, then append
  //    `Cache-Control`/`max-age=0` to httpRequest’s header list.
  if (
    httpRequest.cache === 'no-cache' &&
    !httpRequest.preventNoCacheCacheControlHeaderModification &&
    !httpRequest.headersList.contains('cache-control', true)
  ) {
    httpRequest.headersList.append('cache-control', 'max-age=0', true)
  }

  //    17. If httpRequest’s cache mode is "no-store" or "reload", then:
  if (httpRequest.cache === 'no-store' || httpRequest.cache === 'reload') {
    // 1. If httpRequest’s header list does not contain `Pragma`, then append
    // `Pragma`/`no-cache` to httpRequest’s header list.
    if (!httpRequest.headersList.contains('pragma', true)) {
      httpRequest.headersList.append('pragma', 'no-cache', true)
    }

    // 2. If httpRequest’s header list does not contain `Cache-Control`,
    // then append `Cache-Control`/`no-cache` to httpRequest’s header list.
    if (!httpRequest.headersList.contains('cache-control', true)) {
      httpRequest.headersList.append('cache-control', 'no-cache', true)
    }
  }

  //    18. If httpRequest’s header list contains `Range`, then append
  //    `Accept-Encoding`/`identity` to httpRequest’s header list.
  if (httpRequest.headersList.contains('range', true)) {
    httpRequest.headersList.append('accept-encoding', 'identity', true)
  }

  //    19. Modify httpRequest’s header list per HTTP. Do not append a given
  //    header if httpRequest’s header list contains that header’s name.
  //    TODO: https://github.com/whatwg/fetch/issues/1285#issuecomment-896560129
  if (!httpRequest.headersList.contains('accept-encoding', true)) {
    if (urlHasHttpsScheme(requestCurrentURL(httpRequest))) {
      httpRequest.headersList.append('accept-encoding', 'br, gzip, deflate', true)
    } else {
      httpRequest.headersList.append('accept-encoding', 'gzip, deflate', true)
    }
  }

  httpRequest.headersList.delete('host', true)

  //    20. If includeCredentials is true, then:
  if (includeCredentials) {
    // 1. If the user agent is not configured to block cookies for httpRequest
    // (see section 7 of [COOKIES]), then:
    // TODO: credentials
    // 2. If httpRequest’s header list does not contain `Authorization`, then:
    // TODO: credentials
  }

  //    21. If there’s a proxy-authentication entry, use it as appropriate.
  //    TODO: proxy-authentication

  //    22. Set httpCache to the result of determining the HTTP cache
  //    partition, given httpRequest.
  //    TODO: cache

  //    23. If httpCache is null, then set httpRequest’s cache mode to
  //    "no-store".
  if (httpCache == null) {
    httpRequest.cache = 'no-store'
  }

  //    24. If httpRequest’s cache mode is neither "no-store" nor "reload",
  //    then:
  if (httpRequest.cache !== 'no-store' && httpRequest.cache !== 'reload') {
    // TODO: cache
  }

  // 9. If aborted, then return the appropriate network error for fetchParams.
  // TODO

  // 10. If response is null, then:
  if (response == null) {
    // 1. If httpRequest’s cache mode is "only-if-cached", then return a
    // network error.
    if (httpRequest.cache === 'only-if-cached') {
      return makeNetworkError('only if cached')
    }

    // 2. Let forwardResponse be the result of running HTTP-network fetch
    // given httpFetchParams, includeCredentials, and isNewConnectionFetch.
    const forwardResponse = await httpNetworkFetch(
      httpFetchParams,
      includeCredentials,
      isNewConnectionFetch
    )

    // 3. If httpRequest’s method is unsafe and forwardResponse’s status is
    // in the range 200 to 399, inclusive, invalidate appropriate stored
    // responses in httpCache, as per the "Invalidation" chapter of HTTP
    // Caching, and set storedResponse to null. [HTTP-CACHING]
    if (
      !safeMethodsSet.has(httpRequest.method) &&
      forwardResponse.status >= 200 &&
      forwardResponse.status <= 399
    ) {
      // TODO: cache
    }

    // 4. If the revalidatingFlag is set and forwardResponse’s status is 304,
    // then:
    if (revalidatingFlag && forwardResponse.status === 304) {
      // TODO: cache
    }

    // 5. If response is null, then:
    if (response == null) {
      // 1. Set response to forwardResponse.
      response = forwardResponse

      // 2. Store httpRequest and forwardResponse in httpCache, as per the
      // "Storing Responses in Caches" chapter of HTTP Caching. [HTTP-CACHING]
      // TODO: cache
    }
  }

  // 11. Set response’s URL list to a clone of httpRequest’s URL list.
  response.urlList = [...httpRequest.urlList]

  // 12. If httpRequest’s header list contains `Range`, then set response’s
  // range-requested flag.
  if (httpRequest.headersList.contains('range', true)) {
    response.rangeRequested = true
  }

  // 13. Set response’s request-includes-credentials to includeCredentials.
  response.requestIncludesCredentials = includeCredentials

  // 14. If response’s status is 401, httpRequest’s response tainting is not
  // "cors", includeCredentials is true, and request’s window is an environment
  // settings object, then:
  // TODO

  // 15. If response’s status is 407, then:
  if (response.status === 407) {
    // 1. If request’s window is "no-window", then return a network error.
    if (request.window === 'no-window') {
      return makeNetworkError()
    }

    // 2. ???

    // 3. If fetchParams is canceled, then return the appropriate network error for fetchParams.
    if (isCancelled(fetchParams)) {
      return makeAppropriateNetworkError(fetchParams)
    }

    // 4. Prompt the end user as appropriate in request’s window and store
    // the result as a proxy-authentication entry. [HTTP-AUTH]
    // TODO: Invoke some kind of callback?

    // 5. Set response to the result of running HTTP-network-or-cache fetch given
    // fetchParams.
    // TODO
    return makeNetworkError('proxy authentication required')
  }

  // 16. If all of the following are true
  if (
    // response’s status is 421
    response.status === 421 &&
    // isNewConnectionFetch is false
    !isNewConnectionFetch &&
    // request’s body is null, or request’s body is non-null and request’s body’s source is non-null
    (request.body == null || request.body.source != null)
  ) {
    // then:

    // 1. If fetchParams is canceled, then return the appropriate network error for fetchParams.
    if (isCancelled(fetchParams)) {
      return makeAppropriateNetworkError(fetchParams)
    }

    // 2. Set response to the result of running HTTP-network-or-cache
    // fetch given fetchParams, isAuthenticationFetch, and true.

    // TODO (spec): The spec doesn't specify this but we need to cancel
    // the active response before we can start a new one.
    // https://github.com/whatwg/fetch/issues/1293
    fetchParams.controller.connection.destroy()

    response = await httpNetworkOrCacheFetch(
      fetchParams,
      isAuthenticationFetch,
      true
    )
  }

  // 17. If isAuthenticationFetch is true, then create an authentication entry
  if (isAuthenticationFetch) {
    // TODO
  }

  // 18. Return response.
  return response
}

// https://fetch.spec.whatwg.org/#http-network-fetch
async function httpNetworkFetch (
  fetchParams,
  includeCredentials = false,
  forceNewConnection = false
) {
  assert(!fetchParams.controller.connection || fetchParams.controller.connection.destroyed)

  fetchParams.controller.connection = {
    abort: null,
    destroyed: false,
    destroy (err, abort = true) {
      if (!this.destroyed) {
        this.destroyed = true
        if (abort) {
          this.abort?.(err ?? new DOMException('The operation was aborted.', 'AbortError'))
        }
      }
    }
  }

  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let response be null.
  let response = null

  // 3. Let timingInfo be fetchParams’s timing info.
  const timingInfo = fetchParams.timingInfo

  // 4. Let httpCache be the result of determining the HTTP cache partition,
  // given request.
  // TODO: cache
  const httpCache = null

  // 5. If httpCache is null, then set request’s cache mode to "no-store".
  if (httpCache == null) {
    request.cache = 'no-store'
  }

  // 6. Let networkPartitionKey be the result of determining the network
  // partition key given request.
  // TODO

  // 7. Let newConnection be "yes" if forceNewConnection is true; otherwise
  // "no".
  const newConnection = forceNewConnection ? 'yes' : 'no' // eslint-disable-line no-unused-vars

  // 8. Switch on request’s mode:
  if (request.mode === 'websocket') {
    // Let connection be the result of obtaining a WebSocket connection,
    // given request’s current URL.
    // TODO
  } else {
    // Let connection be the result of obtaining a connection, given
    // networkPartitionKey, request’s current URL’s origin,
    // includeCredentials, and forceNewConnection.
    // TODO
  }

  // 9. Run these steps, but abort when the ongoing fetch is terminated:

  //    1. If connection is failure, then return a network error.

  //    2. Set timingInfo’s final connection timing info to the result of
  //    calling clamp and coarsen connection timing info with connection’s
  //    timing info, timingInfo’s post-redirect start time, and fetchParams’s
  //    cross-origin isolated capability.

  //    3. If connection is not an HTTP/2 connection, request’s body is non-null,
  //    and request’s body’s source is null, then append (`Transfer-Encoding`,
  //    `chunked`) to request’s header list.

  //    4. Set timingInfo’s final network-request start time to the coarsened
  //    shared current time given fetchParams’s cross-origin isolated
  //    capability.

  //    5. Set response to the result of making an HTTP request over connection
  //    using request with the following caveats:

  //        - Follow the relevant requirements from HTTP. [HTTP] [HTTP-SEMANTICS]
  //        [HTTP-COND] [HTTP-CACHING] [HTTP-AUTH]

  //        - If request’s body is non-null, and request’s body’s source is null,
  //        then the user agent may have a buffer of up to 64 kibibytes and store
  //        a part of request’s body in that buffer. If the user agent reads from
  //        request’s body beyond that buffer’s size and the user agent needs to
  //        resend request, then instead return a network error.

  //        - Set timingInfo’s final network-response start time to the coarsened
  //        shared current time given fetchParams’s cross-origin isolated capability,
  //        immediately after the user agent’s HTTP parser receives the first byte
  //        of the response (e.g., frame header bytes for HTTP/2 or response status
  //        line for HTTP/1.x).

  //        - Wait until all the headers are transmitted.

  //        - Any responses whose status is in the range 100 to 199, inclusive,
  //        and is not 101, are to be ignored, except for the purposes of setting
  //        timingInfo’s final network-response start time above.

  //    - If request’s header list contains `Transfer-Encoding`/`chunked` and
  //    response is transferred via HTTP/1.0 or older, then return a network
  //    error.

  //    - If the HTTP request results in a TLS client certificate dialog, then:

  //        1. If request’s window is an environment settings object, make the
  //        dialog available in request’s window.

  //        2. Otherwise, return a network error.

  // To transmit request’s body body, run these steps:
  let requestBody = null
  // 1. If body is null and fetchParams’s process request end-of-body is
  // non-null, then queue a fetch task given fetchParams’s process request
  // end-of-body and fetchParams’s task destination.
  if (request.body == null && fetchParams.processRequestEndOfBody) {
    queueMicrotask(() => fetchParams.processRequestEndOfBody())
  } else if (request.body != null) {
    // 2. Otherwise, if body is non-null:

    //    1. Let processBodyChunk given bytes be these steps:
    const processBodyChunk = async function * (bytes) {
      // 1. If the ongoing fetch is terminated, then abort these steps.
      if (isCancelled(fetchParams)) {
        return
      }

      // 2. Run this step in parallel: transmit bytes.
      yield bytes

      // 3. If fetchParams’s process request body is non-null, then run
      // fetchParams’s process request body given bytes’s length.
      fetchParams.processRequestBodyChunkLength?.(bytes.byteLength)
    }

    // 2. Let processEndOfBody be these steps:
    const processEndOfBody = () => {
      // 1. If fetchParams is canceled, then abort these steps.
      if (isCancelled(fetchParams)) {
        return
      }

      // 2. If fetchParams’s process request end-of-body is non-null,
      // then run fetchParams’s process request end-of-body.
      if (fetchParams.processRequestEndOfBody) {
        fetchParams.processRequestEndOfBody()
      }
    }

    // 3. Let processBodyError given e be these steps:
    const processBodyError = (e) => {
      // 1. If fetchParams is canceled, then abort these steps.
      if (isCancelled(fetchParams)) {
        return
      }

      // 2. If e is an "AbortError" DOMException, then abort fetchParams’s controller.
      if (e.name === 'AbortError') {
        fetchParams.controller.abort()
      } else {
        fetchParams.controller.terminate(e)
      }
    }

    // 4. Incrementally read request’s body given processBodyChunk, processEndOfBody,
    // processBodyError, and fetchParams’s task destination.
    requestBody = (async function * () {
      try {
        for await (const bytes of request.body.stream) {
          yield * processBodyChunk(bytes)
        }
        processEndOfBody()
      } catch (err) {
        processBodyError(err)
      }
    })()
  }

  try {
    // socket is only provided for websockets
    const { body, status, statusText, headersList, socket } = await dispatch({ body: requestBody })

    if (socket) {
      response = makeResponse({ status, statusText, headersList, socket })
    } else {
      const iterator = body[Symbol.asyncIterator]()
      fetchParams.controller.next = () => iterator.next()

      response = makeResponse({ status, statusText, headersList })
    }
  } catch (err) {
    // 10. If aborted, then:
    if (err.name === 'AbortError') {
      // 1. If connection uses HTTP/2, then transmit an RST_STREAM frame.
      fetchParams.controller.connection.destroy()

      // 2. Return the appropriate network error for fetchParams.
      return makeAppropriateNetworkError(fetchParams, err)
    }

    return makeNetworkError(err)
  }

  // 11. Let pullAlgorithm be an action that resumes the ongoing fetch
  // if it is suspended.
  const pullAlgorithm = async () => {
    await fetchParams.controller.resume()
  }

  // 12. Let cancelAlgorithm be an algorithm that aborts fetchParams’s
  // controller with reason, given reason.
  const cancelAlgorithm = (reason) => {
    // If the aborted fetch was already terminated, then we do not
    // need to do anything.
    if (!isCancelled(fetchParams)) {
      fetchParams.controller.abort(reason)
    }
  }

  // 13. Let highWaterMark be a non-negative, non-NaN number, chosen by
  // the user agent.
  // TODO

  // 14. Let sizeAlgorithm be an algorithm that accepts a chunk object
  // and returns a non-negative, non-NaN, non-infinite number, chosen by the user agent.
  // TODO

  // 15. Let stream be a new ReadableStream.
  // 16. Set up stream with byte reading support with pullAlgorithm set to pullAlgorithm,
  //     cancelAlgorithm set to cancelAlgorithm.
  const stream = new ReadableStream(
    {
      async start (controller) {
        fetchParams.controller.controller = controller
      },
      async pull (controller) {
        await pullAlgorithm(controller)
      },
      async cancel (reason) {
        await cancelAlgorithm(reason)
      },
      type: 'bytes'
    }
  )

  // 17. Run these steps, but abort when the ongoing fetch is terminated:

  //    1. Set response’s body to a new body whose stream is stream.
  response.body = { stream, source: null, length: null }

  //    2. If response is not a network error and request’s cache mode is
  //    not "no-store", then update response in httpCache for request.
  //    TODO

  //    3. If includeCredentials is true and the user agent is not configured
  //    to block cookies for request (see section 7 of [COOKIES]), then run the
  //    "set-cookie-string" parsing algorithm (see section 5.2 of [COOKIES]) on
  //    the value of each header whose name is a byte-case-insensitive match for
  //    `Set-Cookie` in response’s header list, if any, and request’s current URL.
  //    TODO

  // 18. If aborted, then:
  // TODO

  // 19. Run these steps in parallel:

  //    1. Run these steps, but abort when fetchParams is canceled:
  fetchParams.controller.onAborted = onAborted
  fetchParams.controller.on('terminated', onAborted)
  fetchParams.controller.resume = async () => {
    // 1. While true
    while (true) {
      // 1-3. See onData...

      // 4. Set bytes to the result of handling content codings given
      // codings and bytes.
      let bytes
      let isFailure
      try {
        const { done, value } = await fetchParams.controller.next()

        if (isAborted(fetchParams)) {
          break
        }

        bytes = done ? undefined : value
      } catch (err) {
        if (fetchParams.controller.ended && !timingInfo.encodedBodySize) {
          // zlib doesn't like empty streams.
          bytes = undefined
        } else {
          bytes = err

          // err may be propagated from the result of calling readablestream.cancel,
          // which might not be an error. https://github.com/nodejs/undici/issues/2009
          isFailure = true
        }
      }

      if (bytes === undefined) {
        // 2. Otherwise, if the bytes transmission for response’s message
        // body is done normally and stream is readable, then close
        // stream, finalize response for fetchParams and response, and
        // abort these in-parallel steps.
        readableStreamClose(fetchParams.controller.controller)

        finalizeResponse(fetchParams, response)

        return
      }

      // 5. Increase timingInfo’s decoded body size by bytes’s length.
      timingInfo.decodedBodySize += bytes?.byteLength ?? 0

      // 6. If bytes is failure, then terminate fetchParams’s controller.
      if (isFailure) {
        fetchParams.controller.terminate(bytes)
        return
      }

      // 7. Enqueue a Uint8Array wrapping an ArrayBuffer containing bytes
      // into stream.
      const buffer = new Uint8Array(bytes)
      if (buffer.byteLength) {
        fetchParams.controller.controller.enqueue(buffer)
      }

      // 8. If stream is errored, then terminate the ongoing fetch.
      if (isErrored(stream)) {
        fetchParams.controller.terminate()
        return
      }

      // 9. If stream doesn’t need more data ask the user agent to suspend
      // the ongoing fetch.
      if (fetchParams.controller.controller.desiredSize <= 0) {
        return
      }
    }
  }

  //    2. If aborted, then:
  function onAborted (reason) {
    // 2. If fetchParams is aborted, then:
    if (isAborted(fetchParams)) {
      // 1. Set response’s aborted flag.
      response.aborted = true

      // 2. If stream is readable, then error stream with the result of
      //    deserialize a serialized abort reason given fetchParams’s
      //    controller’s serialized abort reason and an
      //    implementation-defined realm.
      if (isReadable(stream)) {
        fetchParams.controller.controller.error(
          fetchParams.controller.serializedAbortReason
        )
      }
    } else {
      // 3. Otherwise, if stream is readable, error stream with a TypeError.
      if (isReadable(stream)) {
        fetchParams.controller.controller.error(new TypeError('terminated', {
          cause: isErrorLike(reason) ? reason : undefined
        }))
      }
    }

    // 4. If connection uses HTTP/2, then transmit an RST_STREAM frame.
    // 5. Otherwise, the user agent should close connection unless it would be bad for performance to do so.
    fetchParams.controller.connection.destroy()
  }

  // 20. Return response.
  return response

  function dispatch ({ body }) {
    const url = requestCurrentURL(request)
    /** @type {import('../..').Agent} */
    const agent = fetchParams.controller.dispatcher

    return new Promise((resolve, reject) => agent.dispatch(
      {
        path: url.pathname + url.search,
        origin: url.origin,
        method: request.method,
        body: agent.isMockActive ? request.body && (request.body.source || request.body.stream) : body,
        headers: request.headersList.entries,
        maxRedirections: 0,
        upgrade: request.mode === 'websocket' ? 'websocket' : undefined
      },
      {
        body: null,
        abort: null,

        onConnect (abort) {
          // TODO (fix): Do we need connection here?
          const { connection } = fetchParams.controller

          // Set timingInfo’s final connection timing info to the result of calling clamp and coarsen
          // connection timing info with connection’s timing info, timingInfo’s post-redirect start
          // time, and fetchParams’s cross-origin isolated capability.
          // TODO: implement connection timing
          timingInfo.finalConnectionTimingInfo = clampAndCoarsenConnectionTimingInfo(undefined, timingInfo.postRedirectStartTime, fetchParams.crossOriginIsolatedCapability)

          if (connection.destroyed) {
            abort(new DOMException('The operation was aborted.', 'AbortError'))
          } else {
            fetchParams.controller.on('terminated', abort)
            this.abort = connection.abort = abort
          }

          // Set timingInfo’s final network-request start time to the coarsened shared current time given
          // fetchParams’s cross-origin isolated capability.
          timingInfo.finalNetworkRequestStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability)
        },

        onResponseStarted () {
          // Set timingInfo’s final network-response start time to the coarsened shared current
          // time given fetchParams’s cross-origin isolated capability, immediately after the
          // user agent’s HTTP parser receives the first byte of the response (e.g., frame header
          // bytes for HTTP/2 or response status line for HTTP/1.x).
          timingInfo.finalNetworkResponseStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability)
        },

        onHeaders (status, rawHeaders, resume, statusText) {
          if (status < 200) {
            return
          }

          let location = ''

          const headersList = new HeadersList()

          for (let i = 0; i < rawHeaders.length; i += 2) {
            headersList.append(bufferToLowerCasedHeaderName(rawHeaders[i]), rawHeaders[i + 1].toString('latin1'), true)
          }
          location = headersList.get('location', true)

          this.body = new Readable({ read: resume })

          const decoders = []

          const willFollow = location && request.redirect === 'follow' &&
            redirectStatusSet.has(status)

          // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding
          if (request.method !== 'HEAD' && request.method !== 'CONNECT' && !nullBodyStatus.includes(status) && !willFollow) {
            // https://www.rfc-editor.org/rfc/rfc7231#section-3.1.2.1
            const contentEncoding = headersList.get('content-encoding', true)
            // "All content-coding values are case-insensitive..."
            /** @type {string[]} */
            const codings = contentEncoding ? contentEncoding.toLowerCase().split(',') : []

            // Limit the number of content-encodings to prevent resource exhaustion.
            // CVE fix similar to urllib3 (GHSA-gm62-xv2j-4w53) and curl (CVE-2022-32206).
            const maxContentEncodings = 5
            if (codings.length > maxContentEncodings) {
              reject(new Error(`too many content-encodings in response: ${codings.length}, maximum allowed is ${maxContentEncodings}`))
              return true
            }

            for (let i = codings.length - 1; i >= 0; --i) {
              const coding = codings[i].trim()
              // https://www.rfc-editor.org/rfc/rfc9112.html#section-7.2
              if (coding === 'x-gzip' || coding === 'gzip') {
                decoders.push(zlib.createGunzip({
                  // Be less strict when decoding compressed responses, since sometimes
                  // servers send slightly invalid responses that are still accepted
                  // by common browsers.
                  // Always using Z_SYNC_FLUSH is what cURL does.
                  flush: zlib.constants.Z_SYNC_FLUSH,
                  finishFlush: zlib.constants.Z_SYNC_FLUSH
                }))
              } else if (coding === 'deflate') {
                decoders.push(createInflate({
                  flush: zlib.constants.Z_SYNC_FLUSH,
                  finishFlush: zlib.constants.Z_SYNC_FLUSH
                }))
              } else if (coding === 'br') {
                decoders.push(zlib.createBrotliDecompress({
                  flush: zlib.constants.BROTLI_OPERATION_FLUSH,
                  finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH
                }))
              } else {
                decoders.length = 0
                break
              }
            }
          }

          const onError = this.onError.bind(this)

          resolve({
            status,
            statusText,
            headersList,
            body: decoders.length
              ? pipeline(this.body, ...decoders, (err) => {
                if (err) {
                  this.onError(err)
                }
              }).on('error', onError)
              : this.body.on('error', onError)
          })

          return true
        },

        onData (chunk) {
          if (fetchParams.controller.dump) {
            return
          }

          // 1. If one or more bytes have been transmitted from response’s
          // message body, then:

          //  1. Let bytes be the transmitted bytes.
          const bytes = chunk

          //  2. Let codings be the result of extracting header list values
          //  given `Content-Encoding` and response’s header list.
          //  See pullAlgorithm.

          //  3. Increase timingInfo’s encoded body size by bytes’s length.
          timingInfo.encodedBodySize += bytes.byteLength

          //  4. See pullAlgorithm...

          return this.body.push(bytes)
        },

        onComplete () {
          if (this.abort) {
            fetchParams.controller.off('terminated', this.abort)
          }

          if (fetchParams.controller.onAborted) {
            fetchParams.controller.off('terminated', fetchParams.controller.onAborted)
          }

          fetchParams.controller.ended = true

          this.body.push(null)
        },

        onError (error) {
          if (this.abort) {
            fetchParams.controller.off('terminated', this.abort)
          }

          this.body?.destroy(error)

          fetchParams.controller.terminate(error)

          reject(error)
        },

        onUpgrade (status, rawHeaders, socket) {
          if (status !== 101) {
            return
          }

          const headersList = new HeadersList()

          for (let i = 0; i < rawHeaders.length; i += 2) {
            headersList.append(bufferToLowerCasedHeaderName(rawHeaders[i]), rawHeaders[i + 1].toString('latin1'), true)
          }

          resolve({
            status,
            statusText: STATUS_CODES[status],
            headersList,
            socket
          })

          return true
        }
      }
    ))
  }
}

module.exports = {
  fetch,
  Fetch,
  fetching,
  finalizeAndReportTiming
}


/***/ }),

/***/ 9884:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/* globals AbortController */



const { extractBody, mixinBody, cloneBody, bodyUnusable } = __nccwpck_require__(2585)
const { Headers, fill: fillHeaders, HeadersList, setHeadersGuard, getHeadersGuard, setHeadersList, getHeadersList } = __nccwpck_require__(1401)
const { FinalizationRegistry } = __nccwpck_require__(3076)()
const util = __nccwpck_require__(9099)
const nodeUtil = __nccwpck_require__(7261)
const {
  isValidHTTPToken,
  sameOrigin,
  environmentSettingsObject
} = __nccwpck_require__(8185)
const {
  forbiddenMethodsSet,
  corsSafeListedMethodsSet,
  referrerPolicy,
  requestRedirect,
  requestMode,
  requestCredentials,
  requestCache,
  requestDuplex
} = __nccwpck_require__(6564)
const { kEnumerableProperty, normalizedMethodRecordsBase, normalizedMethodRecords } = util
const { kHeaders, kSignal, kState, kDispatcher } = __nccwpck_require__(1937)
const { webidl } = __nccwpck_require__(9346)
const { URLSerializer } = __nccwpck_require__(5253)
const { kConstruct } = __nccwpck_require__(46)
const assert = __nccwpck_require__(8061)
const { getMaxListeners, setMaxListeners, getEventListeners, defaultMaxListeners } = __nccwpck_require__(5673)

const kAbortController = Symbol('abortController')

const requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
  signal.removeEventListener('abort', abort)
})

const dependentControllerMap = new WeakMap()

function buildAbort (acRef) {
  return abort

  function abort () {
    const ac = acRef.deref()
    if (ac !== undefined) {
      // Currently, there is a problem with FinalizationRegistry.
      // https://github.com/nodejs/node/issues/49344
      // https://github.com/nodejs/node/issues/47748
      // In the case of abort, the first step is to unregister from it.
      // If the controller can refer to it, it is still registered.
      // It will be removed in the future.
      requestFinalizer.unregister(abort)

      // Unsubscribe a listener.
      // FinalizationRegistry will no longer be called, so this must be done.
      this.removeEventListener('abort', abort)

      ac.abort(this.reason)

      const controllerList = dependentControllerMap.get(ac.signal)

      if (controllerList !== undefined) {
        if (controllerList.size !== 0) {
          for (const ref of controllerList) {
            const ctrl = ref.deref()
            if (ctrl !== undefined) {
              ctrl.abort(this.reason)
            }
          }
          controllerList.clear()
        }
        dependentControllerMap.delete(ac.signal)
      }
    }
  }
}

let patchMethodWarning = false

// https://fetch.spec.whatwg.org/#request-class
class Request {
  // https://fetch.spec.whatwg.org/#dom-request
  constructor (input, init = {}) {
    webidl.util.markAsUncloneable(this)
    if (input === kConstruct) {
      return
    }

    const prefix = 'Request constructor'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    input = webidl.converters.RequestInfo(input, prefix, 'input')
    init = webidl.converters.RequestInit(init, prefix, 'init')

    // 1. Let request be null.
    let request = null

    // 2. Let fallbackMode be null.
    let fallbackMode = null

    // 3. Let baseURL be this’s relevant settings object’s API base URL.
    const baseUrl = environmentSettingsObject.settingsObject.baseUrl

    // 4. Let signal be null.
    let signal = null

    // 5. If input is a string, then:
    if (typeof input === 'string') {
      this[kDispatcher] = init.dispatcher

      // 1. Let parsedURL be the result of parsing input with baseURL.
      // 2. If parsedURL is failure, then throw a TypeError.
      let parsedURL
      try {
        parsedURL = new URL(input, baseUrl)
      } catch (err) {
        throw new TypeError('Failed to parse URL from ' + input, { cause: err })
      }

      // 3. If parsedURL includes credentials, then throw a TypeError.
      if (parsedURL.username || parsedURL.password) {
        throw new TypeError(
          'Request cannot be constructed from a URL that includes credentials: ' +
            input
        )
      }

      // 4. Set request to a new request whose URL is parsedURL.
      request = makeRequest({ urlList: [parsedURL] })

      // 5. Set fallbackMode to "cors".
      fallbackMode = 'cors'
    } else {
      this[kDispatcher] = init.dispatcher || input[kDispatcher]

      // 6. Otherwise:

      // 7. Assert: input is a Request object.
      assert(input instanceof Request)

      // 8. Set request to input’s request.
      request = input[kState]

      // 9. Set signal to input’s signal.
      signal = input[kSignal]
    }

    // 7. Let origin be this’s relevant settings object’s origin.
    const origin = environmentSettingsObject.settingsObject.origin

    // 8. Let window be "client".
    let window = 'client'

    // 9. If request’s window is an environment settings object and its origin
    // is same origin with origin, then set window to request’s window.
    if (
      request.window?.constructor?.name === 'EnvironmentSettingsObject' &&
      sameOrigin(request.window, origin)
    ) {
      window = request.window
    }

    // 10. If init["window"] exists and is non-null, then throw a TypeError.
    if (init.window != null) {
      throw new TypeError(`'window' option '${window}' must be null`)
    }

    // 11. If init["window"] exists, then set window to "no-window".
    if ('window' in init) {
      window = 'no-window'
    }

    // 12. Set request to a new request with the following properties:
    request = makeRequest({
      // URL request’s URL.
      // undici implementation note: this is set as the first item in request's urlList in makeRequest
      // method request’s method.
      method: request.method,
      // header list A copy of request’s header list.
      // undici implementation note: headersList is cloned in makeRequest
      headersList: request.headersList,
      // unsafe-request flag Set.
      unsafeRequest: request.unsafeRequest,
      // client This’s relevant settings object.
      client: environmentSettingsObject.settingsObject,
      // window window.
      window,
      // priority request’s priority.
      priority: request.priority,
      // origin request’s origin. The propagation of the origin is only significant for navigation requests
      // being handled by a service worker. In this scenario a request can have an origin that is different
      // from the current client.
      origin: request.origin,
      // referrer request’s referrer.
      referrer: request.referrer,
      // referrer policy request’s referrer policy.
      referrerPolicy: request.referrerPolicy,
      // mode request’s mode.
      mode: request.mode,
      // credentials mode request’s credentials mode.
      credentials: request.credentials,
      // cache mode request’s cache mode.
      cache: request.cache,
      // redirect mode request’s redirect mode.
      redirect: request.redirect,
      // integrity metadata request’s integrity metadata.
      integrity: request.integrity,
      // keepalive request’s keepalive.
      keepalive: request.keepalive,
      // reload-navigation flag request’s reload-navigation flag.
      reloadNavigation: request.reloadNavigation,
      // history-navigation flag request’s history-navigation flag.
      historyNavigation: request.historyNavigation,
      // URL list A clone of request’s URL list.
      urlList: [...request.urlList]
    })

    const initHasKey = Object.keys(init).length !== 0

    // 13. If init is not empty, then:
    if (initHasKey) {
      // 1. If request’s mode is "navigate", then set it to "same-origin".
      if (request.mode === 'navigate') {
        request.mode = 'same-origin'
      }

      // 2. Unset request’s reload-navigation flag.
      request.reloadNavigation = false

      // 3. Unset request’s history-navigation flag.
      request.historyNavigation = false

      // 4. Set request’s origin to "client".
      request.origin = 'client'

      // 5. Set request’s referrer to "client"
      request.referrer = 'client'

      // 6. Set request’s referrer policy to the empty string.
      request.referrerPolicy = ''

      // 7. Set request’s URL to request’s current URL.
      request.url = request.urlList[request.urlList.length - 1]

      // 8. Set request’s URL list to « request’s URL ».
      request.urlList = [request.url]
    }

    // 14. If init["referrer"] exists, then:
    if (init.referrer !== undefined) {
      // 1. Let referrer be init["referrer"].
      const referrer = init.referrer

      // 2. If referrer is the empty string, then set request’s referrer to "no-referrer".
      if (referrer === '') {
        request.referrer = 'no-referrer'
      } else {
        // 1. Let parsedReferrer be the result of parsing referrer with
        // baseURL.
        // 2. If parsedReferrer is failure, then throw a TypeError.
        let parsedReferrer
        try {
          parsedReferrer = new URL(referrer, baseUrl)
        } catch (err) {
          throw new TypeError(`Referrer "${referrer}" is not a valid URL.`, { cause: err })
        }

        // 3. If one of the following is true
        // - parsedReferrer’s scheme is "about" and path is the string "client"
        // - parsedReferrer’s origin is not same origin with origin
        // then set request’s referrer to "client".
        if (
          (parsedReferrer.protocol === 'about:' && parsedReferrer.hostname === 'client') ||
          (origin && !sameOrigin(parsedReferrer, environmentSettingsObject.settingsObject.baseUrl))
        ) {
          request.referrer = 'client'
        } else {
          // 4. Otherwise, set request’s referrer to parsedReferrer.
          request.referrer = parsedReferrer
        }
      }
    }

    // 15. If init["referrerPolicy"] exists, then set request’s referrer policy
    // to it.
    if (init.referrerPolicy !== undefined) {
      request.referrerPolicy = init.referrerPolicy
    }

    // 16. Let mode be init["mode"] if it exists, and fallbackMode otherwise.
    let mode
    if (init.mode !== undefined) {
      mode = init.mode
    } else {
      mode = fallbackMode
    }

    // 17. If mode is "navigate", then throw a TypeError.
    if (mode === 'navigate') {
      throw webidl.errors.exception({
        header: 'Request constructor',
        message: 'invalid request mode navigate.'
      })
    }

    // 18. If mode is non-null, set request’s mode to mode.
    if (mode != null) {
      request.mode = mode
    }

    // 19. If init["credentials"] exists, then set request’s credentials mode
    // to it.
    if (init.credentials !== undefined) {
      request.credentials = init.credentials
    }

    // 18. If init["cache"] exists, then set request’s cache mode to it.
    if (init.cache !== undefined) {
      request.cache = init.cache
    }

    // 21. If request’s cache mode is "only-if-cached" and request’s mode is
    // not "same-origin", then throw a TypeError.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
      throw new TypeError(
        "'only-if-cached' can be set only with 'same-origin' mode"
      )
    }

    // 22. If init["redirect"] exists, then set request’s redirect mode to it.
    if (init.redirect !== undefined) {
      request.redirect = init.redirect
    }

    // 23. If init["integrity"] exists, then set request’s integrity metadata to it.
    if (init.integrity != null) {
      request.integrity = String(init.integrity)
    }

    // 24. If init["keepalive"] exists, then set request’s keepalive to it.
    if (init.keepalive !== undefined) {
      request.keepalive = Boolean(init.keepalive)
    }

    // 25. If init["method"] exists, then:
    if (init.method !== undefined) {
      // 1. Let method be init["method"].
      let method = init.method

      const mayBeNormalized = normalizedMethodRecords[method]

      if (mayBeNormalized !== undefined) {
        // Note: Bypass validation DELETE, GET, HEAD, OPTIONS, POST, PUT, PATCH and these lowercase ones
        request.method = mayBeNormalized
      } else {
        // 2. If method is not a method or method is a forbidden method, then
        // throw a TypeError.
        if (!isValidHTTPToken(method)) {
          throw new TypeError(`'${method}' is not a valid HTTP method.`)
        }

        const upperCase = method.toUpperCase()

        if (forbiddenMethodsSet.has(upperCase)) {
          throw new TypeError(`'${method}' HTTP method is unsupported.`)
        }

        // 3. Normalize method.
        // https://fetch.spec.whatwg.org/#concept-method-normalize
        // Note: must be in uppercase
        method = normalizedMethodRecordsBase[upperCase] ?? method

        // 4. Set request’s method to method.
        request.method = method
      }

      if (!patchMethodWarning && request.method === 'patch') {
        process.emitWarning('Using `patch` is highly likely to result in a `405 Method Not Allowed`. `PATCH` is much more likely to succeed.', {
          code: 'UNDICI-FETCH-patch'
        })

        patchMethodWarning = true
      }
    }

    // 26. If init["signal"] exists, then set signal to it.
    if (init.signal !== undefined) {
      signal = init.signal
    }

    // 27. Set this’s request to request.
    this[kState] = request

    // 28. Set this’s signal to a new AbortSignal object with this’s relevant
    // Realm.
    // TODO: could this be simplified with AbortSignal.any
    // (https://dom.spec.whatwg.org/#dom-abortsignal-any)
    const ac = new AbortController()
    this[kSignal] = ac.signal

    // 29. If signal is not null, then make this’s signal follow signal.
    if (signal != null) {
      if (
        !signal ||
        typeof signal.aborted !== 'boolean' ||
        typeof signal.addEventListener !== 'function'
      ) {
        throw new TypeError(
          "Failed to construct 'Request': member signal is not of type AbortSignal."
        )
      }

      if (signal.aborted) {
        ac.abort(signal.reason)
      } else {
        // Keep a strong ref to ac while request object
        // is alive. This is needed to prevent AbortController
        // from being prematurely garbage collected.
        // See, https://github.com/nodejs/undici/issues/1926.
        this[kAbortController] = ac

        const acRef = new WeakRef(ac)
        const abort = buildAbort(acRef)

        // Third-party AbortControllers may not work with these.
        // See, https://github.com/nodejs/undici/pull/1910#issuecomment-1464495619.
        try {
          // If the max amount of listeners is equal to the default, increase it
          // This is only available in node >= v19.9.0
          if (typeof getMaxListeners === 'function' && getMaxListeners(signal) === defaultMaxListeners) {
            setMaxListeners(1500, signal)
          } else if (getEventListeners(signal, 'abort').length >= defaultMaxListeners) {
            setMaxListeners(1500, signal)
          }
        } catch {}

        util.addAbortListener(signal, abort)
        // The third argument must be a registry key to be unregistered.
        // Without it, you cannot unregister.
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry
        // abort is used as the unregister key. (because it is unique)
        requestFinalizer.register(ac, { signal, abort }, abort)
      }
    }

    // 30. Set this’s headers to a new Headers object with this’s relevant
    // Realm, whose header list is request’s header list and guard is
    // "request".
    this[kHeaders] = new Headers(kConstruct)
    setHeadersList(this[kHeaders], request.headersList)
    setHeadersGuard(this[kHeaders], 'request')

    // 31. If this’s request’s mode is "no-cors", then:
    if (mode === 'no-cors') {
      // 1. If this’s request’s method is not a CORS-safelisted method,
      // then throw a TypeError.
      if (!corsSafeListedMethodsSet.has(request.method)) {
        throw new TypeError(
          `'${request.method} is unsupported in no-cors mode.`
        )
      }

      // 2. Set this’s headers’s guard to "request-no-cors".
      setHeadersGuard(this[kHeaders], 'request-no-cors')
    }

    // 32. If init is not empty, then:
    if (initHasKey) {
      /** @type {HeadersList} */
      const headersList = getHeadersList(this[kHeaders])
      // 1. Let headers be a copy of this’s headers and its associated header
      // list.
      // 2. If init["headers"] exists, then set headers to init["headers"].
      const headers = init.headers !== undefined ? init.headers : new HeadersList(headersList)

      // 3. Empty this’s headers’s header list.
      headersList.clear()

      // 4. If headers is a Headers object, then for each header in its header
      // list, append header’s name/header’s value to this’s headers.
      if (headers instanceof HeadersList) {
        for (const { name, value } of headers.rawValues()) {
          headersList.append(name, value, false)
        }
        // Note: Copy the `set-cookie` meta-data.
        headersList.cookies = headers.cookies
      } else {
        // 5. Otherwise, fill this’s headers with headers.
        fillHeaders(this[kHeaders], headers)
      }
    }

    // 33. Let inputBody be input’s request’s body if input is a Request
    // object; otherwise null.
    const inputBody = input instanceof Request ? input[kState].body : null

    // 34. If either init["body"] exists and is non-null or inputBody is
    // non-null, and request’s method is `GET` or `HEAD`, then throw a
    // TypeError.
    if (
      (init.body != null || inputBody != null) &&
      (request.method === 'GET' || request.method === 'HEAD')
    ) {
      throw new TypeError('Request with GET/HEAD method cannot have body.')
    }

    // 35. Let initBody be null.
    let initBody = null

    // 36. If init["body"] exists and is non-null, then:
    if (init.body != null) {
      // 1. Let Content-Type be null.
      // 2. Set initBody and Content-Type to the result of extracting
      // init["body"], with keepalive set to request’s keepalive.
      const [extractedBody, contentType] = extractBody(
        init.body,
        request.keepalive
      )
      initBody = extractedBody

      // 3, If Content-Type is non-null and this’s headers’s header list does
      // not contain `Content-Type`, then append `Content-Type`/Content-Type to
      // this’s headers.
      if (contentType && !getHeadersList(this[kHeaders]).contains('content-type', true)) {
        this[kHeaders].append('content-type', contentType)
      }
    }

    // 37. Let inputOrInitBody be initBody if it is non-null; otherwise
    // inputBody.
    const inputOrInitBody = initBody ?? inputBody

    // 38. If inputOrInitBody is non-null and inputOrInitBody’s source is
    // null, then:
    if (inputOrInitBody != null && inputOrInitBody.source == null) {
      // 1. If initBody is non-null and init["duplex"] does not exist,
      //    then throw a TypeError.
      if (initBody != null && init.duplex == null) {
        throw new TypeError('RequestInit: duplex option is required when sending a body.')
      }

      // 2. If this’s request’s mode is neither "same-origin" nor "cors",
      // then throw a TypeError.
      if (request.mode !== 'same-origin' && request.mode !== 'cors') {
        throw new TypeError(
          'If request is made from ReadableStream, mode should be "same-origin" or "cors"'
        )
      }

      // 3. Set this’s request’s use-CORS-preflight flag.
      request.useCORSPreflightFlag = true
    }

    // 39. Let finalBody be inputOrInitBody.
    let finalBody = inputOrInitBody

    // 40. If initBody is null and inputBody is non-null, then:
    if (initBody == null && inputBody != null) {
      // 1. If input is unusable, then throw a TypeError.
      if (bodyUnusable(input)) {
        throw new TypeError(
          'Cannot construct a Request with a Request object that has already been used.'
        )
      }

      // 2. Set finalBody to the result of creating a proxy for inputBody.
      // https://streams.spec.whatwg.org/#readablestream-create-a-proxy
      const identityTransform = new TransformStream()
      inputBody.stream.pipeThrough(identityTransform)
      finalBody = {
        source: inputBody.source,
        length: inputBody.length,
        stream: identityTransform.readable
      }
    }

    // 41. Set this’s request’s body to finalBody.
    this[kState].body = finalBody
  }

  // Returns request’s HTTP method, which is "GET" by default.
  get method () {
    webidl.brandCheck(this, Request)

    // The method getter steps are to return this’s request’s method.
    return this[kState].method
  }

  // Returns the URL of request as a string.
  get url () {
    webidl.brandCheck(this, Request)

    // The url getter steps are to return this’s request’s URL, serialized.
    return URLSerializer(this[kState].url)
  }

  // Returns a Headers object consisting of the headers associated with request.
  // Note that headers added in the network layer by the user agent will not
  // be accounted for in this object, e.g., the "Host" header.
  get headers () {
    webidl.brandCheck(this, Request)

    // The headers getter steps are to return this’s headers.
    return this[kHeaders]
  }

  // Returns the kind of resource requested by request, e.g., "document"
  // or "script".
  get destination () {
    webidl.brandCheck(this, Request)

    // The destination getter are to return this’s request’s destination.
    return this[kState].destination
  }

  // Returns the referrer of request. Its value can be a same-origin URL if
  // explicitly set in init, the empty string to indicate no referrer, and
  // "about:client" when defaulting to the global’s default. This is used
  // during fetching to determine the value of the `Referer` header of the
  // request being made.
  get referrer () {
    webidl.brandCheck(this, Request)

    // 1. If this’s request’s referrer is "no-referrer", then return the
    // empty string.
    if (this[kState].referrer === 'no-referrer') {
      return ''
    }

    // 2. If this’s request’s referrer is "client", then return
    // "about:client".
    if (this[kState].referrer === 'client') {
      return 'about:client'
    }

    // Return this’s request’s referrer, serialized.
    return this[kState].referrer.toString()
  }

  // Returns the referrer policy associated with request.
  // This is used during fetching to compute the value of the request’s
  // referrer.
  get referrerPolicy () {
    webidl.brandCheck(this, Request)

    // The referrerPolicy getter steps are to return this’s request’s referrer policy.
    return this[kState].referrerPolicy
  }

  // Returns the mode associated with request, which is a string indicating
  // whether the request will use CORS, or will be restricted to same-origin
  // URLs.
  get mode () {
    webidl.brandCheck(this, Request)

    // The mode getter steps are to return this’s request’s mode.
    return this[kState].mode
  }

  // Returns the credentials mode associated with request,
  // which is a string indicating whether credentials will be sent with the
  // request always, never, or only when sent to a same-origin URL.
  get credentials () {
    // The credentials getter steps are to return this’s request’s credentials mode.
    return this[kState].credentials
  }

  // Returns the cache mode associated with request,
  // which is a string indicating how the request will
  // interact with the browser’s cache when fetching.
  get cache () {
    webidl.brandCheck(this, Request)

    // The cache getter steps are to return this’s request’s cache mode.
    return this[kState].cache
  }

  // Returns the redirect mode associated with request,
  // which is a string indicating how redirects for the
  // request will be handled during fetching. A request
  // will follow redirects by default.
  get redirect () {
    webidl.brandCheck(this, Request)

    // The redirect getter steps are to return this’s request’s redirect mode.
    return this[kState].redirect
  }

  // Returns request’s subresource integrity metadata, which is a
  // cryptographic hash of the resource being fetched. Its value
  // consists of multiple hashes separated by whitespace. [SRI]
  get integrity () {
    webidl.brandCheck(this, Request)

    // The integrity getter steps are to return this’s request’s integrity
    // metadata.
    return this[kState].integrity
  }

  // Returns a boolean indicating whether or not request can outlive the
  // global in which it was created.
  get keepalive () {
    webidl.brandCheck(this, Request)

    // The keepalive getter steps are to return this’s request’s keepalive.
    return this[kState].keepalive
  }

  // Returns a boolean indicating whether or not request is for a reload
  // navigation.
  get isReloadNavigation () {
    webidl.brandCheck(this, Request)

    // The isReloadNavigation getter steps are to return true if this’s
    // request’s reload-navigation flag is set; otherwise false.
    return this[kState].reloadNavigation
  }

  // Returns a boolean indicating whether or not request is for a history
  // navigation (a.k.a. back-forward navigation).
  get isHistoryNavigation () {
    webidl.brandCheck(this, Request)

    // The isHistoryNavigation getter steps are to return true if this’s request’s
    // history-navigation flag is set; otherwise false.
    return this[kState].historyNavigation
  }

  // Returns the signal associated with request, which is an AbortSignal
  // object indicating whether or not request has been aborted, and its
  // abort event handler.
  get signal () {
    webidl.brandCheck(this, Request)

    // The signal getter steps are to return this’s signal.
    return this[kSignal]
  }

  get body () {
    webidl.brandCheck(this, Request)

    return this[kState].body ? this[kState].body.stream : null
  }

  get bodyUsed () {
    webidl.brandCheck(this, Request)

    return !!this[kState].body && util.isDisturbed(this[kState].body.stream)
  }

  get duplex () {
    webidl.brandCheck(this, Request)

    return 'half'
  }

  // Returns a clone of request.
  clone () {
    webidl.brandCheck(this, Request)

    // 1. If this is unusable, then throw a TypeError.
    if (bodyUnusable(this)) {
      throw new TypeError('unusable')
    }

    // 2. Let clonedRequest be the result of cloning this’s request.
    const clonedRequest = cloneRequest(this[kState])

    // 3. Let clonedRequestObject be the result of creating a Request object,
    // given clonedRequest, this’s headers’s guard, and this’s relevant Realm.
    // 4. Make clonedRequestObject’s signal follow this’s signal.
    const ac = new AbortController()
    if (this.signal.aborted) {
      ac.abort(this.signal.reason)
    } else {
      let list = dependentControllerMap.get(this.signal)
      if (list === undefined) {
        list = new Set()
        dependentControllerMap.set(this.signal, list)
      }
      const acRef = new WeakRef(ac)
      list.add(acRef)
      util.addAbortListener(
        ac.signal,
        buildAbort(acRef)
      )
    }

    // 4. Return clonedRequestObject.
    return fromInnerRequest(clonedRequest, ac.signal, getHeadersGuard(this[kHeaders]))
  }

  [nodeUtil.inspect.custom] (depth, options) {
    if (options.depth === null) {
      options.depth = 2
    }

    options.colors ??= true

    const properties = {
      method: this.method,
      url: this.url,
      headers: this.headers,
      destination: this.destination,
      referrer: this.referrer,
      referrerPolicy: this.referrerPolicy,
      mode: this.mode,
      credentials: this.credentials,
      cache: this.cache,
      redirect: this.redirect,
      integrity: this.integrity,
      keepalive: this.keepalive,
      isReloadNavigation: this.isReloadNavigation,
      isHistoryNavigation: this.isHistoryNavigation,
      signal: this.signal
    }

    return `Request ${nodeUtil.formatWithOptions(options, properties)}`
  }
}

mixinBody(Request)

// https://fetch.spec.whatwg.org/#requests
function makeRequest (init) {
  return {
    method: init.method ?? 'GET',
    localURLsOnly: init.localURLsOnly ?? false,
    unsafeRequest: init.unsafeRequest ?? false,
    body: init.body ?? null,
    client: init.client ?? null,
    reservedClient: init.reservedClient ?? null,
    replacesClientId: init.replacesClientId ?? '',
    window: init.window ?? 'client',
    keepalive: init.keepalive ?? false,
    serviceWorkers: init.serviceWorkers ?? 'all',
    initiator: init.initiator ?? '',
    destination: init.destination ?? '',
    priority: init.priority ?? null,
    origin: init.origin ?? 'client',
    policyContainer: init.policyContainer ?? 'client',
    referrer: init.referrer ?? 'client',
    referrerPolicy: init.referrerPolicy ?? '',
    mode: init.mode ?? 'no-cors',
    useCORSPreflightFlag: init.useCORSPreflightFlag ?? false,
    credentials: init.credentials ?? 'same-origin',
    useCredentials: init.useCredentials ?? false,
    cache: init.cache ?? 'default',
    redirect: init.redirect ?? 'follow',
    integrity: init.integrity ?? '',
    cryptoGraphicsNonceMetadata: init.cryptoGraphicsNonceMetadata ?? '',
    parserMetadata: init.parserMetadata ?? '',
    reloadNavigation: init.reloadNavigation ?? false,
    historyNavigation: init.historyNavigation ?? false,
    userActivation: init.userActivation ?? false,
    taintedOrigin: init.taintedOrigin ?? false,
    redirectCount: init.redirectCount ?? 0,
    responseTainting: init.responseTainting ?? 'basic',
    preventNoCacheCacheControlHeaderModification: init.preventNoCacheCacheControlHeaderModification ?? false,
    done: init.done ?? false,
    timingAllowFailed: init.timingAllowFailed ?? false,
    urlList: init.urlList,
    url: init.urlList[0],
    headersList: init.headersList
      ? new HeadersList(init.headersList)
      : new HeadersList()
  }
}

// https://fetch.spec.whatwg.org/#concept-request-clone
function cloneRequest (request) {
  // To clone a request request, run these steps:

  // 1. Let newRequest be a copy of request, except for its body.
  const newRequest = makeRequest({ ...request, body: null })

  // 2. If request’s body is non-null, set newRequest’s body to the
  // result of cloning request’s body.
  if (request.body != null) {
    newRequest.body = cloneBody(newRequest, request.body)
  }

  // 3. Return newRequest.
  return newRequest
}

/**
 * @see https://fetch.spec.whatwg.org/#request-create
 * @param {any} innerRequest
 * @param {AbortSignal} signal
 * @param {'request' | 'immutable' | 'request-no-cors' | 'response' | 'none'} guard
 * @returns {Request}
 */
function fromInnerRequest (innerRequest, signal, guard) {
  const request = new Request(kConstruct)
  request[kState] = innerRequest
  request[kSignal] = signal
  request[kHeaders] = new Headers(kConstruct)
  setHeadersList(request[kHeaders], innerRequest.headersList)
  setHeadersGuard(request[kHeaders], guard)
  return request
}

Object.defineProperties(Request.prototype, {
  method: kEnumerableProperty,
  url: kEnumerableProperty,
  headers: kEnumerableProperty,
  redirect: kEnumerableProperty,
  clone: kEnumerableProperty,
  signal: kEnumerableProperty,
  duplex: kEnumerableProperty,
  destination: kEnumerableProperty,
  body: kEnumerableProperty,
  bodyUsed: kEnumerableProperty,
  isHistoryNavigation: kEnumerableProperty,
  isReloadNavigation: kEnumerableProperty,
  keepalive: kEnumerableProperty,
  integrity: kEnumerableProperty,
  cache: kEnumerableProperty,
  credentials: kEnumerableProperty,
  attribute: kEnumerableProperty,
  referrerPolicy: kEnumerableProperty,
  referrer: kEnumerableProperty,
  mode: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'Request',
    configurable: true
  }
})

webidl.converters.Request = webidl.interfaceConverter(
  Request
)

// https://fetch.spec.whatwg.org/#requestinfo
webidl.converters.RequestInfo = function (V, prefix, argument) {
  if (typeof V === 'string') {
    return webidl.converters.USVString(V, prefix, argument)
  }

  if (V instanceof Request) {
    return webidl.converters.Request(V, prefix, argument)
  }

  return webidl.converters.USVString(V, prefix, argument)
}

webidl.converters.AbortSignal = webidl.interfaceConverter(
  AbortSignal
)

// https://fetch.spec.whatwg.org/#requestinit
webidl.converters.RequestInit = webidl.dictionaryConverter([
  {
    key: 'method',
    converter: webidl.converters.ByteString
  },
  {
    key: 'headers',
    converter: webidl.converters.HeadersInit
  },
  {
    key: 'body',
    converter: webidl.nullableConverter(
      webidl.converters.BodyInit
    )
  },
  {
    key: 'referrer',
    converter: webidl.converters.USVString
  },
  {
    key: 'referrerPolicy',
    converter: webidl.converters.DOMString,
    // https://w3c.github.io/webappsec-referrer-policy/#referrer-policy
    allowedValues: referrerPolicy
  },
  {
    key: 'mode',
    converter: webidl.converters.DOMString,
    // https://fetch.spec.whatwg.org/#concept-request-mode
    allowedValues: requestMode
  },
  {
    key: 'credentials',
    converter: webidl.converters.DOMString,
    // https://fetch.spec.whatwg.org/#requestcredentials
    allowedValues: requestCredentials
  },
  {
    key: 'cache',
    converter: webidl.converters.DOMString,
    // https://fetch.spec.whatwg.org/#requestcache
    allowedValues: requestCache
  },
  {
    key: 'redirect',
    converter: webidl.converters.DOMString,
    // https://fetch.spec.whatwg.org/#requestredirect
    allowedValues: requestRedirect
  },
  {
    key: 'integrity',
    converter: webidl.converters.DOMString
  },
  {
    key: 'keepalive',
    converter: webidl.converters.boolean
  },
  {
    key: 'signal',
    converter: webidl.nullableConverter(
      (signal) => webidl.converters.AbortSignal(
        signal,
        'RequestInit',
        'signal',
        { strict: false }
      )
    )
  },
  {
    key: 'window',
    converter: webidl.converters.any
  },
  {
    key: 'duplex',
    converter: webidl.converters.DOMString,
    allowedValues: requestDuplex
  },
  {
    key: 'dispatcher', // undici specific option
    converter: webidl.converters.any
  }
])

module.exports = { Request, makeRequest, fromInnerRequest, cloneRequest }


/***/ }),

/***/ 6120:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Headers, HeadersList, fill, getHeadersGuard, setHeadersGuard, setHeadersList } = __nccwpck_require__(1401)
const { extractBody, cloneBody, mixinBody, hasFinalizationRegistry, streamRegistry, bodyUnusable } = __nccwpck_require__(2585)
const util = __nccwpck_require__(9099)
const nodeUtil = __nccwpck_require__(7261)
const { kEnumerableProperty } = util
const {
  isValidReasonPhrase,
  isCancelled,
  isAborted,
  isBlobLike,
  serializeJavascriptValueToJSONString,
  isErrorLike,
  isomorphicEncode,
  environmentSettingsObject: relevantRealm
} = __nccwpck_require__(8185)
const {
  redirectStatusSet,
  nullBodyStatus
} = __nccwpck_require__(6564)
const { kState, kHeaders } = __nccwpck_require__(1937)
const { webidl } = __nccwpck_require__(9346)
const { FormData } = __nccwpck_require__(2744)
const { URLSerializer } = __nccwpck_require__(5253)
const { kConstruct } = __nccwpck_require__(46)
const assert = __nccwpck_require__(8061)
const { types } = __nccwpck_require__(7261)

const textEncoder = new TextEncoder('utf-8')

// https://fetch.spec.whatwg.org/#response-class
class Response {
  // Creates network error Response.
  static error () {
    // The static error() method steps are to return the result of creating a
    // Response object, given a new network error, "immutable", and this’s
    // relevant Realm.
    const responseObject = fromInnerResponse(makeNetworkError(), 'immutable')

    return responseObject
  }

  // https://fetch.spec.whatwg.org/#dom-response-json
  static json (data, init = {}) {
    webidl.argumentLengthCheck(arguments, 1, 'Response.json')

    if (init !== null) {
      init = webidl.converters.ResponseInit(init)
    }

    // 1. Let bytes the result of running serialize a JavaScript value to JSON bytes on data.
    const bytes = textEncoder.encode(
      serializeJavascriptValueToJSONString(data)
    )

    // 2. Let body be the result of extracting bytes.
    const body = extractBody(bytes)

    // 3. Let responseObject be the result of creating a Response object, given a new response,
    //    "response", and this’s relevant Realm.
    const responseObject = fromInnerResponse(makeResponse({}), 'response')

    // 4. Perform initialize a response given responseObject, init, and (body, "application/json").
    initializeResponse(responseObject, init, { body: body[0], type: 'application/json' })

    // 5. Return responseObject.
    return responseObject
  }

  // Creates a redirect Response that redirects to url with status status.
  static redirect (url, status = 302) {
    webidl.argumentLengthCheck(arguments, 1, 'Response.redirect')

    url = webidl.converters.USVString(url)
    status = webidl.converters['unsigned short'](status)

    // 1. Let parsedURL be the result of parsing url with current settings
    // object’s API base URL.
    // 2. If parsedURL is failure, then throw a TypeError.
    // TODO: base-URL?
    let parsedURL
    try {
      parsedURL = new URL(url, relevantRealm.settingsObject.baseUrl)
    } catch (err) {
      throw new TypeError(`Failed to parse URL from ${url}`, { cause: err })
    }

    // 3. If status is not a redirect status, then throw a RangeError.
    if (!redirectStatusSet.has(status)) {
      throw new RangeError(`Invalid status code ${status}`)
    }

    // 4. Let responseObject be the result of creating a Response object,
    // given a new response, "immutable", and this’s relevant Realm.
    const responseObject = fromInnerResponse(makeResponse({}), 'immutable')

    // 5. Set responseObject’s response’s status to status.
    responseObject[kState].status = status

    // 6. Let value be parsedURL, serialized and isomorphic encoded.
    const value = isomorphicEncode(URLSerializer(parsedURL))

    // 7. Append `Location`/value to responseObject’s response’s header list.
    responseObject[kState].headersList.append('location', value, true)

    // 8. Return responseObject.
    return responseObject
  }

  // https://fetch.spec.whatwg.org/#dom-response
  constructor (body = null, init = {}) {
    webidl.util.markAsUncloneable(this)
    if (body === kConstruct) {
      return
    }

    if (body !== null) {
      body = webidl.converters.BodyInit(body)
    }

    init = webidl.converters.ResponseInit(init)

    // 1. Set this’s response to a new response.
    this[kState] = makeResponse({})

    // 2. Set this’s headers to a new Headers object with this’s relevant
    // Realm, whose header list is this’s response’s header list and guard
    // is "response".
    this[kHeaders] = new Headers(kConstruct)
    setHeadersGuard(this[kHeaders], 'response')
    setHeadersList(this[kHeaders], this[kState].headersList)

    // 3. Let bodyWithType be null.
    let bodyWithType = null

    // 4. If body is non-null, then set bodyWithType to the result of extracting body.
    if (body != null) {
      const [extractedBody, type] = extractBody(body)
      bodyWithType = { body: extractedBody, type }
    }

    // 5. Perform initialize a response given this, init, and bodyWithType.
    initializeResponse(this, init, bodyWithType)
  }

  // Returns response’s type, e.g., "cors".
  get type () {
    webidl.brandCheck(this, Response)

    // The type getter steps are to return this’s response’s type.
    return this[kState].type
  }

  // Returns response’s URL, if it has one; otherwise the empty string.
  get url () {
    webidl.brandCheck(this, Response)

    const urlList = this[kState].urlList

    // The url getter steps are to return the empty string if this’s
    // response’s URL is null; otherwise this’s response’s URL,
    // serialized with exclude fragment set to true.
    const url = urlList[urlList.length - 1] ?? null

    if (url === null) {
      return ''
    }

    return URLSerializer(url, true)
  }

  // Returns whether response was obtained through a redirect.
  get redirected () {
    webidl.brandCheck(this, Response)

    // The redirected getter steps are to return true if this’s response’s URL
    // list has more than one item; otherwise false.
    return this[kState].urlList.length > 1
  }

  // Returns response’s status.
  get status () {
    webidl.brandCheck(this, Response)

    // The status getter steps are to return this’s response’s status.
    return this[kState].status
  }

  // Returns whether response’s status is an ok status.
  get ok () {
    webidl.brandCheck(this, Response)

    // The ok getter steps are to return true if this’s response’s status is an
    // ok status; otherwise false.
    return this[kState].status >= 200 && this[kState].status <= 299
  }

  // Returns response’s status message.
  get statusText () {
    webidl.brandCheck(this, Response)

    // The statusText getter steps are to return this’s response’s status
    // message.
    return this[kState].statusText
  }

  // Returns response’s headers as Headers.
  get headers () {
    webidl.brandCheck(this, Response)

    // The headers getter steps are to return this’s headers.
    return this[kHeaders]
  }

  get body () {
    webidl.brandCheck(this, Response)

    return this[kState].body ? this[kState].body.stream : null
  }

  get bodyUsed () {
    webidl.brandCheck(this, Response)

    return !!this[kState].body && util.isDisturbed(this[kState].body.stream)
  }

  // Returns a clone of response.
  clone () {
    webidl.brandCheck(this, Response)

    // 1. If this is unusable, then throw a TypeError.
    if (bodyUnusable(this)) {
      throw webidl.errors.exception({
        header: 'Response.clone',
        message: 'Body has already been consumed.'
      })
    }

    // 2. Let clonedResponse be the result of cloning this’s response.
    const clonedResponse = cloneResponse(this[kState])

    // Note: To re-register because of a new stream.
    if (hasFinalizationRegistry && this[kState].body?.stream) {
      streamRegistry.register(this, new WeakRef(this[kState].body.stream))
    }

    // 3. Return the result of creating a Response object, given
    // clonedResponse, this’s headers’s guard, and this’s relevant Realm.
    return fromInnerResponse(clonedResponse, getHeadersGuard(this[kHeaders]))
  }

  [nodeUtil.inspect.custom] (depth, options) {
    if (options.depth === null) {
      options.depth = 2
    }

    options.colors ??= true

    const properties = {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      body: this.body,
      bodyUsed: this.bodyUsed,
      ok: this.ok,
      redirected: this.redirected,
      type: this.type,
      url: this.url
    }

    return `Response ${nodeUtil.formatWithOptions(options, properties)}`
  }
}

mixinBody(Response)

Object.defineProperties(Response.prototype, {
  type: kEnumerableProperty,
  url: kEnumerableProperty,
  status: kEnumerableProperty,
  ok: kEnumerableProperty,
  redirected: kEnumerableProperty,
  statusText: kEnumerableProperty,
  headers: kEnumerableProperty,
  clone: kEnumerableProperty,
  body: kEnumerableProperty,
  bodyUsed: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'Response',
    configurable: true
  }
})

Object.defineProperties(Response, {
  json: kEnumerableProperty,
  redirect: kEnumerableProperty,
  error: kEnumerableProperty
})

// https://fetch.spec.whatwg.org/#concept-response-clone
function cloneResponse (response) {
  // To clone a response response, run these steps:

  // 1. If response is a filtered response, then return a new identical
  // filtered response whose internal response is a clone of response’s
  // internal response.
  if (response.internalResponse) {
    return filterResponse(
      cloneResponse(response.internalResponse),
      response.type
    )
  }

  // 2. Let newResponse be a copy of response, except for its body.
  const newResponse = makeResponse({ ...response, body: null })

  // 3. If response’s body is non-null, then set newResponse’s body to the
  // result of cloning response’s body.
  if (response.body != null) {
    newResponse.body = cloneBody(newResponse, response.body)
  }

  // 4. Return newResponse.
  return newResponse
}

function makeResponse (init) {
  return {
    aborted: false,
    rangeRequested: false,
    timingAllowPassed: false,
    requestIncludesCredentials: false,
    type: 'default',
    status: 200,
    timingInfo: null,
    cacheState: '',
    statusText: '',
    ...init,
    headersList: init?.headersList
      ? new HeadersList(init?.headersList)
      : new HeadersList(),
    urlList: init?.urlList ? [...init.urlList] : []
  }
}

function makeNetworkError (reason) {
  const isError = isErrorLike(reason)
  return makeResponse({
    type: 'error',
    status: 0,
    error: isError
      ? reason
      : new Error(reason ? String(reason) : reason),
    aborted: reason && reason.name === 'AbortError'
  })
}

// @see https://fetch.spec.whatwg.org/#concept-network-error
function isNetworkError (response) {
  return (
    // A network error is a response whose type is "error",
    response.type === 'error' &&
    // status is 0
    response.status === 0
  )
}

function makeFilteredResponse (response, state) {
  state = {
    internalResponse: response,
    ...state
  }

  return new Proxy(response, {
    get (target, p) {
      return p in state ? state[p] : target[p]
    },
    set (target, p, value) {
      assert(!(p in state))
      target[p] = value
      return true
    }
  })
}

// https://fetch.spec.whatwg.org/#concept-filtered-response
function filterResponse (response, type) {
  // Set response to the following filtered response with response as its
  // internal response, depending on request’s response tainting:
  if (type === 'basic') {
    // A basic filtered response is a filtered response whose type is "basic"
    // and header list excludes any headers in internal response’s header list
    // whose name is a forbidden response-header name.

    // Note: undici does not implement forbidden response-header names
    return makeFilteredResponse(response, {
      type: 'basic',
      headersList: response.headersList
    })
  } else if (type === 'cors') {
    // A CORS filtered response is a filtered response whose type is "cors"
    // and header list excludes any headers in internal response’s header
    // list whose name is not a CORS-safelisted response-header name, given
    // internal response’s CORS-exposed header-name list.

    // Note: undici does not implement CORS-safelisted response-header names
    return makeFilteredResponse(response, {
      type: 'cors',
      headersList: response.headersList
    })
  } else if (type === 'opaque') {
    // An opaque filtered response is a filtered response whose type is
    // "opaque", URL list is the empty list, status is 0, status message
    // is the empty byte sequence, header list is empty, and body is null.

    return makeFilteredResponse(response, {
      type: 'opaque',
      urlList: Object.freeze([]),
      status: 0,
      statusText: '',
      body: null
    })
  } else if (type === 'opaqueredirect') {
    // An opaque-redirect filtered response is a filtered response whose type
    // is "opaqueredirect", status is 0, status message is the empty byte
    // sequence, header list is empty, and body is null.

    return makeFilteredResponse(response, {
      type: 'opaqueredirect',
      status: 0,
      statusText: '',
      headersList: [],
      body: null
    })
  } else {
    assert(false)
  }
}

// https://fetch.spec.whatwg.org/#appropriate-network-error
function makeAppropriateNetworkError (fetchParams, err = null) {
  // 1. Assert: fetchParams is canceled.
  assert(isCancelled(fetchParams))

  // 2. Return an aborted network error if fetchParams is aborted;
  // otherwise return a network error.
  return isAborted(fetchParams)
    ? makeNetworkError(Object.assign(new DOMException('The operation was aborted.', 'AbortError'), { cause: err }))
    : makeNetworkError(Object.assign(new DOMException('Request was cancelled.'), { cause: err }))
}

// https://whatpr.org/fetch/1392.html#initialize-a-response
function initializeResponse (response, init, body) {
  // 1. If init["status"] is not in the range 200 to 599, inclusive, then
  //    throw a RangeError.
  if (init.status !== null && (init.status < 200 || init.status > 599)) {
    throw new RangeError('init["status"] must be in the range of 200 to 599, inclusive.')
  }

  // 2. If init["statusText"] does not match the reason-phrase token production,
  //    then throw a TypeError.
  if ('statusText' in init && init.statusText != null) {
    // See, https://datatracker.ietf.org/doc/html/rfc7230#section-3.1.2:
    //   reason-phrase  = *( HTAB / SP / VCHAR / obs-text )
    if (!isValidReasonPhrase(String(init.statusText))) {
      throw new TypeError('Invalid statusText')
    }
  }

  // 3. Set response’s response’s status to init["status"].
  if ('status' in init && init.status != null) {
    response[kState].status = init.status
  }

  // 4. Set response’s response’s status message to init["statusText"].
  if ('statusText' in init && init.statusText != null) {
    response[kState].statusText = init.statusText
  }

  // 5. If init["headers"] exists, then fill response’s headers with init["headers"].
  if ('headers' in init && init.headers != null) {
    fill(response[kHeaders], init.headers)
  }

  // 6. If body was given, then:
  if (body) {
    // 1. If response's status is a null body status, then throw a TypeError.
    if (nullBodyStatus.includes(response.status)) {
      throw webidl.errors.exception({
        header: 'Response constructor',
        message: `Invalid response status code ${response.status}`
      })
    }

    // 2. Set response's body to body's body.
    response[kState].body = body.body

    // 3. If body's type is non-null and response's header list does not contain
    //    `Content-Type`, then append (`Content-Type`, body's type) to response's header list.
    if (body.type != null && !response[kState].headersList.contains('content-type', true)) {
      response[kState].headersList.append('content-type', body.type, true)
    }
  }
}

/**
 * @see https://fetch.spec.whatwg.org/#response-create
 * @param {any} innerResponse
 * @param {'request' | 'immutable' | 'request-no-cors' | 'response' | 'none'} guard
 * @returns {Response}
 */
function fromInnerResponse (innerResponse, guard) {
  const response = new Response(kConstruct)
  response[kState] = innerResponse
  response[kHeaders] = new Headers(kConstruct)
  setHeadersList(response[kHeaders], innerResponse.headersList)
  setHeadersGuard(response[kHeaders], guard)

  if (hasFinalizationRegistry && innerResponse.body?.stream) {
    // If the target (response) is reclaimed, the cleanup callback may be called at some point with
    // the held value provided for it (innerResponse.body.stream). The held value can be any value:
    // a primitive or an object, even undefined. If the held value is an object, the registry keeps
    // a strong reference to it (so it can pass it to the cleanup callback later). Reworded from
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry
    streamRegistry.register(response, new WeakRef(innerResponse.body.stream))
  }

  return response
}

webidl.converters.ReadableStream = webidl.interfaceConverter(
  ReadableStream
)

webidl.converters.FormData = webidl.interfaceConverter(
  FormData
)

webidl.converters.URLSearchParams = webidl.interfaceConverter(
  URLSearchParams
)

// https://fetch.spec.whatwg.org/#typedefdef-xmlhttprequestbodyinit
webidl.converters.XMLHttpRequestBodyInit = function (V, prefix, name) {
  if (typeof V === 'string') {
    return webidl.converters.USVString(V, prefix, name)
  }

  if (isBlobLike(V)) {
    return webidl.converters.Blob(V, prefix, name, { strict: false })
  }

  if (ArrayBuffer.isView(V) || types.isArrayBuffer(V)) {
    return webidl.converters.BufferSource(V, prefix, name)
  }

  if (util.isFormDataLike(V)) {
    return webidl.converters.FormData(V, prefix, name, { strict: false })
  }

  if (V instanceof URLSearchParams) {
    return webidl.converters.URLSearchParams(V, prefix, name)
  }

  return webidl.converters.DOMString(V, prefix, name)
}

// https://fetch.spec.whatwg.org/#bodyinit
webidl.converters.BodyInit = function (V, prefix, argument) {
  if (V instanceof ReadableStream) {
    return webidl.converters.ReadableStream(V, prefix, argument)
  }

  // Note: the spec doesn't include async iterables,
  // this is an undici extension.
  if (V?.[Symbol.asyncIterator]) {
    return V
  }

  return webidl.converters.XMLHttpRequestBodyInit(V, prefix, argument)
}

webidl.converters.ResponseInit = webidl.dictionaryConverter([
  {
    key: 'status',
    converter: webidl.converters['unsigned short'],
    defaultValue: () => 200
  },
  {
    key: 'statusText',
    converter: webidl.converters.ByteString,
    defaultValue: () => ''
  },
  {
    key: 'headers',
    converter: webidl.converters.HeadersInit
  }
])

module.exports = {
  isNetworkError,
  makeNetworkError,
  makeResponse,
  makeAppropriateNetworkError,
  filterResponse,
  Response,
  cloneResponse,
  fromInnerResponse
}


/***/ }),

/***/ 1937:
/***/ ((module) => {

"use strict";


module.exports = {
  kUrl: Symbol('url'),
  kHeaders: Symbol('headers'),
  kSignal: Symbol('signal'),
  kState: Symbol('state'),
  kDispatcher: Symbol('dispatcher')
}


/***/ }),

/***/ 8185:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Transform } = __nccwpck_require__(4492)
const zlib = __nccwpck_require__(5628)
const { redirectStatusSet, referrerPolicySet: referrerPolicyTokens, badPortsSet } = __nccwpck_require__(6564)
const { getGlobalOrigin } = __nccwpck_require__(5954)
const { collectASequenceOfCodePoints, collectAnHTTPQuotedString, removeChars, parseMIMEType } = __nccwpck_require__(5253)
const { performance } = __nccwpck_require__(8846)
const { isBlobLike, ReadableStreamFrom, isValidHTTPToken, normalizedMethodRecordsBase } = __nccwpck_require__(9099)
const assert = __nccwpck_require__(8061)
const { isUint8Array } = __nccwpck_require__(3746)
const { webidl } = __nccwpck_require__(9346)

let supportedHashes = []

// https://nodejs.org/api/crypto.html#determining-if-crypto-support-is-unavailable
/** @type {import('crypto')} */
let crypto
try {
  crypto = __nccwpck_require__(6005)
  const possibleRelevantHashes = ['sha256', 'sha384', 'sha512']
  supportedHashes = crypto.getHashes().filter((hash) => possibleRelevantHashes.includes(hash))
/* c8 ignore next 3 */
} catch {

}

function responseURL (response) {
  // https://fetch.spec.whatwg.org/#responses
  // A response has an associated URL. It is a pointer to the last URL
  // in response’s URL list and null if response’s URL list is empty.
  const urlList = response.urlList
  const length = urlList.length
  return length === 0 ? null : urlList[length - 1].toString()
}

// https://fetch.spec.whatwg.org/#concept-response-location-url
function responseLocationURL (response, requestFragment) {
  // 1. If response’s status is not a redirect status, then return null.
  if (!redirectStatusSet.has(response.status)) {
    return null
  }

  // 2. Let location be the result of extracting header list values given
  // `Location` and response’s header list.
  let location = response.headersList.get('location', true)

  // 3. If location is a header value, then set location to the result of
  //    parsing location with response’s URL.
  if (location !== null && isValidHeaderValue(location)) {
    if (!isValidEncodedURL(location)) {
      // Some websites respond location header in UTF-8 form without encoding them as ASCII
      // and major browsers redirect them to correctly UTF-8 encoded addresses.
      // Here, we handle that behavior in the same way.
      location = normalizeBinaryStringToUtf8(location)
    }
    location = new URL(location, responseURL(response))
  }

  // 4. If location is a URL whose fragment is null, then set location’s
  // fragment to requestFragment.
  if (location && !location.hash) {
    location.hash = requestFragment
  }

  // 5. Return location.
  return location
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc1738#section-2.2
 * @param {string} url
 * @returns {boolean}
 */
function isValidEncodedURL (url) {
  for (let i = 0; i < url.length; ++i) {
    const code = url.charCodeAt(i)

    if (
      code > 0x7E || // Non-US-ASCII + DEL
      code < 0x20 // Control characters NUL - US
    ) {
      return false
    }
  }
  return true
}

/**
 * If string contains non-ASCII characters, assumes it's UTF-8 encoded and decodes it.
 * Since UTF-8 is a superset of ASCII, this will work for ASCII strings as well.
 * @param {string} value
 * @returns {string}
 */
function normalizeBinaryStringToUtf8 (value) {
  return Buffer.from(value, 'binary').toString('utf8')
}

/** @returns {URL} */
function requestCurrentURL (request) {
  return request.urlList[request.urlList.length - 1]
}

function requestBadPort (request) {
  // 1. Let url be request’s current URL.
  const url = requestCurrentURL(request)

  // 2. If url’s scheme is an HTTP(S) scheme and url’s port is a bad port,
  // then return blocked.
  if (urlIsHttpHttpsScheme(url) && badPortsSet.has(url.port)) {
    return 'blocked'
  }

  // 3. Return allowed.
  return 'allowed'
}

function isErrorLike (object) {
  return object instanceof Error || (
    object?.constructor?.name === 'Error' ||
    object?.constructor?.name === 'DOMException'
  )
}

// Check whether |statusText| is a ByteString and
// matches the Reason-Phrase token production.
// RFC 2616: https://tools.ietf.org/html/rfc2616
// RFC 7230: https://tools.ietf.org/html/rfc7230
// "reason-phrase = *( HTAB / SP / VCHAR / obs-text )"
// https://github.com/chromium/chromium/blob/94.0.4604.1/third_party/blink/renderer/core/fetch/response.cc#L116
function isValidReasonPhrase (statusText) {
  for (let i = 0; i < statusText.length; ++i) {
    const c = statusText.charCodeAt(i)
    if (
      !(
        (
          c === 0x09 || // HTAB
          (c >= 0x20 && c <= 0x7e) || // SP / VCHAR
          (c >= 0x80 && c <= 0xff)
        ) // obs-text
      )
    ) {
      return false
    }
  }
  return true
}

/**
 * @see https://fetch.spec.whatwg.org/#header-name
 * @param {string} potentialValue
 */
const isValidHeaderName = isValidHTTPToken

/**
 * @see https://fetch.spec.whatwg.org/#header-value
 * @param {string} potentialValue
 */
function isValidHeaderValue (potentialValue) {
  // - Has no leading or trailing HTTP tab or space bytes.
  // - Contains no 0x00 (NUL) or HTTP newline bytes.
  return (
    potentialValue[0] === '\t' ||
    potentialValue[0] === ' ' ||
    potentialValue[potentialValue.length - 1] === '\t' ||
    potentialValue[potentialValue.length - 1] === ' ' ||
    potentialValue.includes('\n') ||
    potentialValue.includes('\r') ||
    potentialValue.includes('\0')
  ) === false
}

// https://w3c.github.io/webappsec-referrer-policy/#set-requests-referrer-policy-on-redirect
function setRequestReferrerPolicyOnRedirect (request, actualResponse) {
  //  Given a request request and a response actualResponse, this algorithm
  //  updates request’s referrer policy according to the Referrer-Policy
  //  header (if any) in actualResponse.

  // 1. Let policy be the result of executing § 8.1 Parse a referrer policy
  // from a Referrer-Policy header on actualResponse.

  // 8.1 Parse a referrer policy from a Referrer-Policy header
  // 1. Let policy-tokens be the result of extracting header list values given `Referrer-Policy` and response’s header list.
  const { headersList } = actualResponse
  // 2. Let policy be the empty string.
  // 3. For each token in policy-tokens, if token is a referrer policy and token is not the empty string, then set policy to token.
  // 4. Return policy.
  const policyHeader = (headersList.get('referrer-policy', true) ?? '').split(',')

  // Note: As the referrer-policy can contain multiple policies
  // separated by comma, we need to loop through all of them
  // and pick the first valid one.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy#specify_a_fallback_policy
  let policy = ''
  if (policyHeader.length > 0) {
    // The right-most policy takes precedence.
    // The left-most policy is the fallback.
    for (let i = policyHeader.length; i !== 0; i--) {
      const token = policyHeader[i - 1].trim()
      if (referrerPolicyTokens.has(token)) {
        policy = token
        break
      }
    }
  }

  // 2. If policy is not the empty string, then set request’s referrer policy to policy.
  if (policy !== '') {
    request.referrerPolicy = policy
  }
}

// https://fetch.spec.whatwg.org/#cross-origin-resource-policy-check
function crossOriginResourcePolicyCheck () {
  // TODO
  return 'allowed'
}

// https://fetch.spec.whatwg.org/#concept-cors-check
function corsCheck () {
  // TODO
  return 'success'
}

// https://fetch.spec.whatwg.org/#concept-tao-check
function TAOCheck () {
  // TODO
  return 'success'
}

function appendFetchMetadata (httpRequest) {
  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-dest-header
  //  TODO

  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-mode-header

  //  1. Assert: r’s url is a potentially trustworthy URL.
  //  TODO

  //  2. Let header be a Structured Header whose value is a token.
  let header = null

  //  3. Set header’s value to r’s mode.
  header = httpRequest.mode

  //  4. Set a structured field value `Sec-Fetch-Mode`/header in r’s header list.
  httpRequest.headersList.set('sec-fetch-mode', header, true)

  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-site-header
  //  TODO

  //  https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-user-header
  //  TODO
}

// https://fetch.spec.whatwg.org/#append-a-request-origin-header
function appendRequestOriginHeader (request) {
  // 1. Let serializedOrigin be the result of byte-serializing a request origin
  //    with request.
  // TODO: implement "byte-serializing a request origin"
  let serializedOrigin = request.origin

  // - "'client' is changed to an origin during fetching."
  //   This doesn't happen in undici (in most cases) because undici, by default,
  //   has no concept of origin.
  // - request.origin can also be set to request.client.origin (client being
  //   an environment settings object), which is undefined without using
  //   setGlobalOrigin.
  if (serializedOrigin === 'client' || serializedOrigin === undefined) {
    return
  }

  // 2. If request’s response tainting is "cors" or request’s mode is "websocket",
  //    then append (`Origin`, serializedOrigin) to request’s header list.
  // 3. Otherwise, if request’s method is neither `GET` nor `HEAD`, then:
  if (request.responseTainting === 'cors' || request.mode === 'websocket') {
    request.headersList.append('origin', serializedOrigin, true)
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    // 1. Switch on request’s referrer policy:
    switch (request.referrerPolicy) {
      case 'no-referrer':
        // Set serializedOrigin to `null`.
        serializedOrigin = null
        break
      case 'no-referrer-when-downgrade':
      case 'strict-origin':
      case 'strict-origin-when-cross-origin':
        // If request’s origin is a tuple origin, its scheme is "https", and
        // request’s current URL’s scheme is not "https", then set
        // serializedOrigin to `null`.
        if (request.origin && urlHasHttpsScheme(request.origin) && !urlHasHttpsScheme(requestCurrentURL(request))) {
          serializedOrigin = null
        }
        break
      case 'same-origin':
        // If request’s origin is not same origin with request’s current URL’s
        // origin, then set serializedOrigin to `null`.
        if (!sameOrigin(request, requestCurrentURL(request))) {
          serializedOrigin = null
        }
        break
      default:
        // Do nothing.
    }

    // 2. Append (`Origin`, serializedOrigin) to request’s header list.
    request.headersList.append('origin', serializedOrigin, true)
  }
}

// https://w3c.github.io/hr-time/#dfn-coarsen-time
function coarsenTime (timestamp, crossOriginIsolatedCapability) {
  // TODO
  return timestamp
}

// https://fetch.spec.whatwg.org/#clamp-and-coarsen-connection-timing-info
function clampAndCoarsenConnectionTimingInfo (connectionTimingInfo, defaultStartTime, crossOriginIsolatedCapability) {
  if (!connectionTimingInfo?.startTime || connectionTimingInfo.startTime < defaultStartTime) {
    return {
      domainLookupStartTime: defaultStartTime,
      domainLookupEndTime: defaultStartTime,
      connectionStartTime: defaultStartTime,
      connectionEndTime: defaultStartTime,
      secureConnectionStartTime: defaultStartTime,
      ALPNNegotiatedProtocol: connectionTimingInfo?.ALPNNegotiatedProtocol
    }
  }

  return {
    domainLookupStartTime: coarsenTime(connectionTimingInfo.domainLookupStartTime, crossOriginIsolatedCapability),
    domainLookupEndTime: coarsenTime(connectionTimingInfo.domainLookupEndTime, crossOriginIsolatedCapability),
    connectionStartTime: coarsenTime(connectionTimingInfo.connectionStartTime, crossOriginIsolatedCapability),
    connectionEndTime: coarsenTime(connectionTimingInfo.connectionEndTime, crossOriginIsolatedCapability),
    secureConnectionStartTime: coarsenTime(connectionTimingInfo.secureConnectionStartTime, crossOriginIsolatedCapability),
    ALPNNegotiatedProtocol: connectionTimingInfo.ALPNNegotiatedProtocol
  }
}

// https://w3c.github.io/hr-time/#dfn-coarsened-shared-current-time
function coarsenedSharedCurrentTime (crossOriginIsolatedCapability) {
  return coarsenTime(performance.now(), crossOriginIsolatedCapability)
}

// https://fetch.spec.whatwg.org/#create-an-opaque-timing-info
function createOpaqueTimingInfo (timingInfo) {
  return {
    startTime: timingInfo.startTime ?? 0,
    redirectStartTime: 0,
    redirectEndTime: 0,
    postRedirectStartTime: timingInfo.startTime ?? 0,
    finalServiceWorkerStartTime: 0,
    finalNetworkResponseStartTime: 0,
    finalNetworkRequestStartTime: 0,
    endTime: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
    finalConnectionTimingInfo: null
  }
}

// https://html.spec.whatwg.org/multipage/origin.html#policy-container
function makePolicyContainer () {
  // Note: the fetch spec doesn't make use of embedder policy or CSP list
  return {
    referrerPolicy: 'strict-origin-when-cross-origin'
  }
}

// https://html.spec.whatwg.org/multipage/origin.html#clone-a-policy-container
function clonePolicyContainer (policyContainer) {
  return {
    referrerPolicy: policyContainer.referrerPolicy
  }
}

// https://w3c.github.io/webappsec-referrer-policy/#determine-requests-referrer
function determineRequestsReferrer (request) {
  // 1. Let policy be request's referrer policy.
  const policy = request.referrerPolicy

  // Note: policy cannot (shouldn't) be null or an empty string.
  assert(policy)

  // 2. Let environment be request’s client.

  let referrerSource = null

  // 3. Switch on request’s referrer:
  if (request.referrer === 'client') {
    // Note: node isn't a browser and doesn't implement document/iframes,
    // so we bypass this step and replace it with our own.

    const globalOrigin = getGlobalOrigin()

    if (!globalOrigin || globalOrigin.origin === 'null') {
      return 'no-referrer'
    }

    // note: we need to clone it as it's mutated
    referrerSource = new URL(globalOrigin)
  } else if (request.referrer instanceof URL) {
    // Let referrerSource be request’s referrer.
    referrerSource = request.referrer
  }

  // 4. Let request’s referrerURL be the result of stripping referrerSource for
  //    use as a referrer.
  let referrerURL = stripURLForReferrer(referrerSource)

  // 5. Let referrerOrigin be the result of stripping referrerSource for use as
  //    a referrer, with the origin-only flag set to true.
  const referrerOrigin = stripURLForReferrer(referrerSource, true)

  // 6. If the result of serializing referrerURL is a string whose length is
  //    greater than 4096, set referrerURL to referrerOrigin.
  if (referrerURL.toString().length > 4096) {
    referrerURL = referrerOrigin
  }

  const areSameOrigin = sameOrigin(request, referrerURL)
  const isNonPotentiallyTrustWorthy = isURLPotentiallyTrustworthy(referrerURL) &&
    !isURLPotentiallyTrustworthy(request.url)

  // 8. Execute the switch statements corresponding to the value of policy:
  switch (policy) {
    case 'origin': return referrerOrigin != null ? referrerOrigin : stripURLForReferrer(referrerSource, true)
    case 'unsafe-url': return referrerURL
    case 'same-origin':
      return areSameOrigin ? referrerOrigin : 'no-referrer'
    case 'origin-when-cross-origin':
      return areSameOrigin ? referrerURL : referrerOrigin
    case 'strict-origin-when-cross-origin': {
      const currentURL = requestCurrentURL(request)

      // 1. If the origin of referrerURL and the origin of request’s current
      //    URL are the same, then return referrerURL.
      if (sameOrigin(referrerURL, currentURL)) {
        return referrerURL
      }

      // 2. If referrerURL is a potentially trustworthy URL and request’s
      //    current URL is not a potentially trustworthy URL, then return no
      //    referrer.
      if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) {
        return 'no-referrer'
      }

      // 3. Return referrerOrigin.
      return referrerOrigin
    }
    case 'strict-origin': // eslint-disable-line
      /**
         * 1. If referrerURL is a potentially trustworthy URL and
         * request’s current URL is not a potentially trustworthy URL,
         * then return no referrer.
         * 2. Return referrerOrigin
        */
    case 'no-referrer-when-downgrade': // eslint-disable-line
      /**
       * 1. If referrerURL is a potentially trustworthy URL and
       * request’s current URL is not a potentially trustworthy URL,
       * then return no referrer.
       * 2. Return referrerOrigin
      */

    default: // eslint-disable-line
      return isNonPotentiallyTrustWorthy ? 'no-referrer' : referrerOrigin
  }
}

/**
 * @see https://w3c.github.io/webappsec-referrer-policy/#strip-url
 * @param {URL} url
 * @param {boolean|undefined} originOnly
 */
function stripURLForReferrer (url, originOnly) {
  // 1. Assert: url is a URL.
  assert(url instanceof URL)

  url = new URL(url)

  // 2. If url’s scheme is a local scheme, then return no referrer.
  if (url.protocol === 'file:' || url.protocol === 'about:' || url.protocol === 'blank:') {
    return 'no-referrer'
  }

  // 3. Set url’s username to the empty string.
  url.username = ''

  // 4. Set url’s password to the empty string.
  url.password = ''

  // 5. Set url’s fragment to null.
  url.hash = ''

  // 6. If the origin-only flag is true, then:
  if (originOnly) {
    // 1. Set url’s path to « the empty string ».
    url.pathname = ''

    // 2. Set url’s query to null.
    url.search = ''
  }

  // 7. Return url.
  return url
}

function isURLPotentiallyTrustworthy (url) {
  if (!(url instanceof URL)) {
    return false
  }

  // If child of about, return true
  if (url.href === 'about:blank' || url.href === 'about:srcdoc') {
    return true
  }

  // If scheme is data, return true
  if (url.protocol === 'data:') return true

  // If file, return true
  if (url.protocol === 'file:') return true

  return isOriginPotentiallyTrustworthy(url.origin)

  function isOriginPotentiallyTrustworthy (origin) {
    // If origin is explicitly null, return false
    if (origin == null || origin === 'null') return false

    const originAsURL = new URL(origin)

    // If secure, return true
    if (originAsURL.protocol === 'https:' || originAsURL.protocol === 'wss:') {
      return true
    }

    // If localhost or variants, return true
    if (/^127(?:\.[0-9]+){0,2}\.[0-9]+$|^\[(?:0*:)*?:?0*1\]$/.test(originAsURL.hostname) ||
     (originAsURL.hostname === 'localhost' || originAsURL.hostname.includes('localhost.')) ||
     (originAsURL.hostname.endsWith('.localhost'))) {
      return true
    }

    // If any other, return false
    return false
  }
}

/**
 * @see https://w3c.github.io/webappsec-subresource-integrity/#does-response-match-metadatalist
 * @param {Uint8Array} bytes
 * @param {string} metadataList
 */
function bytesMatch (bytes, metadataList) {
  // If node is not built with OpenSSL support, we cannot check
  // a request's integrity, so allow it by default (the spec will
  // allow requests if an invalid hash is given, as precedence).
  /* istanbul ignore if: only if node is built with --without-ssl */
  if (crypto === undefined) {
    return true
  }

  // 1. Let parsedMetadata be the result of parsing metadataList.
  const parsedMetadata = parseMetadata(metadataList)

  // 2. If parsedMetadata is no metadata, return true.
  if (parsedMetadata === 'no metadata') {
    return true
  }

  // 3. If response is not eligible for integrity validation, return false.
  // TODO

  // 4. If parsedMetadata is the empty set, return true.
  if (parsedMetadata.length === 0) {
    return true
  }

  // 5. Let metadata be the result of getting the strongest
  //    metadata from parsedMetadata.
  const strongest = getStrongestMetadata(parsedMetadata)
  const metadata = filterMetadataListByAlgorithm(parsedMetadata, strongest)

  // 6. For each item in metadata:
  for (const item of metadata) {
    // 1. Let algorithm be the alg component of item.
    const algorithm = item.algo

    // 2. Let expectedValue be the val component of item.
    const expectedValue = item.hash

    // See https://github.com/web-platform-tests/wpt/commit/e4c5cc7a5e48093220528dfdd1c4012dc3837a0e
    // "be liberal with padding". This is annoying, and it's not even in the spec.

    // 3. Let actualValue be the result of applying algorithm to bytes.
    let actualValue = crypto.createHash(algorithm).update(bytes).digest('base64')

    if (actualValue[actualValue.length - 1] === '=') {
      if (actualValue[actualValue.length - 2] === '=') {
        actualValue = actualValue.slice(0, -2)
      } else {
        actualValue = actualValue.slice(0, -1)
      }
    }

    // 4. If actualValue is a case-sensitive match for expectedValue,
    //    return true.
    if (compareBase64Mixed(actualValue, expectedValue)) {
      return true
    }
  }

  // 7. Return false.
  return false
}

// https://w3c.github.io/webappsec-subresource-integrity/#grammardef-hash-with-options
// https://www.w3.org/TR/CSP2/#source-list-syntax
// https://www.rfc-editor.org/rfc/rfc5234#appendix-B.1
const parseHashWithOptions = /(?<algo>sha256|sha384|sha512)-((?<hash>[A-Za-z0-9+/]+|[A-Za-z0-9_-]+)={0,2}(?:\s|$)( +[!-~]*)?)?/i

/**
 * @see https://w3c.github.io/webappsec-subresource-integrity/#parse-metadata
 * @param {string} metadata
 */
function parseMetadata (metadata) {
  // 1. Let result be the empty set.
  /** @type {{ algo: string, hash: string }[]} */
  const result = []

  // 2. Let empty be equal to true.
  let empty = true

  // 3. For each token returned by splitting metadata on spaces:
  for (const token of metadata.split(' ')) {
    // 1. Set empty to false.
    empty = false

    // 2. Parse token as a hash-with-options.
    const parsedToken = parseHashWithOptions.exec(token)

    // 3. If token does not parse, continue to the next token.
    if (
      parsedToken === null ||
      parsedToken.groups === undefined ||
      parsedToken.groups.algo === undefined
    ) {
      // Note: Chromium blocks the request at this point, but Firefox
      // gives a warning that an invalid integrity was given. The
      // correct behavior is to ignore these, and subsequently not
      // check the integrity of the resource.
      continue
    }

    // 4. Let algorithm be the hash-algo component of token.
    const algorithm = parsedToken.groups.algo.toLowerCase()

    // 5. If algorithm is a hash function recognized by the user
    //    agent, add the parsed token to result.
    if (supportedHashes.includes(algorithm)) {
      result.push(parsedToken.groups)
    }
  }

  // 4. Return no metadata if empty is true, otherwise return result.
  if (empty === true) {
    return 'no metadata'
  }

  return result
}

/**
 * @param {{ algo: 'sha256' | 'sha384' | 'sha512' }[]} metadataList
 */
function getStrongestMetadata (metadataList) {
  // Let algorithm be the algo component of the first item in metadataList.
  // Can be sha256
  let algorithm = metadataList[0].algo
  // If the algorithm is sha512, then it is the strongest
  // and we can return immediately
  if (algorithm[3] === '5') {
    return algorithm
  }

  for (let i = 1; i < metadataList.length; ++i) {
    const metadata = metadataList[i]
    // If the algorithm is sha512, then it is the strongest
    // and we can break the loop immediately
    if (metadata.algo[3] === '5') {
      algorithm = 'sha512'
      break
    // If the algorithm is sha384, then a potential sha256 or sha384 is ignored
    } else if (algorithm[3] === '3') {
      continue
    // algorithm is sha256, check if algorithm is sha384 and if so, set it as
    // the strongest
    } else if (metadata.algo[3] === '3') {
      algorithm = 'sha384'
    }
  }
  return algorithm
}

function filterMetadataListByAlgorithm (metadataList, algorithm) {
  if (metadataList.length === 1) {
    return metadataList
  }

  let pos = 0
  for (let i = 0; i < metadataList.length; ++i) {
    if (metadataList[i].algo === algorithm) {
      metadataList[pos++] = metadataList[i]
    }
  }

  metadataList.length = pos

  return metadataList
}

/**
 * Compares two base64 strings, allowing for base64url
 * in the second string.
 *
* @param {string} actualValue always base64
 * @param {string} expectedValue base64 or base64url
 * @returns {boolean}
 */
function compareBase64Mixed (actualValue, expectedValue) {
  if (actualValue.length !== expectedValue.length) {
    return false
  }
  for (let i = 0; i < actualValue.length; ++i) {
    if (actualValue[i] !== expectedValue[i]) {
      if (
        (actualValue[i] === '+' && expectedValue[i] === '-') ||
        (actualValue[i] === '/' && expectedValue[i] === '_')
      ) {
        continue
      }
      return false
    }
  }

  return true
}

// https://w3c.github.io/webappsec-upgrade-insecure-requests/#upgrade-request
function tryUpgradeRequestToAPotentiallyTrustworthyURL (request) {
  // TODO
}

/**
 * @link {https://html.spec.whatwg.org/multipage/origin.html#same-origin}
 * @param {URL} A
 * @param {URL} B
 */
function sameOrigin (A, B) {
  // 1. If A and B are the same opaque origin, then return true.
  if (A.origin === B.origin && A.origin === 'null') {
    return true
  }

  // 2. If A and B are both tuple origins and their schemes,
  //    hosts, and port are identical, then return true.
  if (A.protocol === B.protocol && A.hostname === B.hostname && A.port === B.port) {
    return true
  }

  // 3. Return false.
  return false
}

function createDeferredPromise () {
  let res
  let rej
  const promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })

  return { promise, resolve: res, reject: rej }
}

function isAborted (fetchParams) {
  return fetchParams.controller.state === 'aborted'
}

function isCancelled (fetchParams) {
  return fetchParams.controller.state === 'aborted' ||
    fetchParams.controller.state === 'terminated'
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-method-normalize
 * @param {string} method
 */
function normalizeMethod (method) {
  return normalizedMethodRecordsBase[method.toLowerCase()] ?? method
}

// https://infra.spec.whatwg.org/#serialize-a-javascript-value-to-a-json-string
function serializeJavascriptValueToJSONString (value) {
  // 1. Let result be ? Call(%JSON.stringify%, undefined, « value »).
  const result = JSON.stringify(value)

  // 2. If result is undefined, then throw a TypeError.
  if (result === undefined) {
    throw new TypeError('Value is not JSON serializable')
  }

  // 3. Assert: result is a string.
  assert(typeof result === 'string')

  // 4. Return result.
  return result
}

// https://tc39.es/ecma262/#sec-%25iteratorprototype%25-object
const esIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))

/**
 * @see https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
 * @param {string} name name of the instance
 * @param {symbol} kInternalIterator
 * @param {string | number} [keyIndex]
 * @param {string | number} [valueIndex]
 */
function createIterator (name, kInternalIterator, keyIndex = 0, valueIndex = 1) {
  class FastIterableIterator {
    /** @type {any} */
    #target
    /** @type {'key' | 'value' | 'key+value'} */
    #kind
    /** @type {number} */
    #index

    /**
     * @see https://webidl.spec.whatwg.org/#dfn-default-iterator-object
     * @param {unknown} target
     * @param {'key' | 'value' | 'key+value'} kind
     */
    constructor (target, kind) {
      this.#target = target
      this.#kind = kind
      this.#index = 0
    }

    next () {
      // 1. Let interface be the interface for which the iterator prototype object exists.
      // 2. Let thisValue be the this value.
      // 3. Let object be ? ToObject(thisValue).
      // 4. If object is a platform object, then perform a security
      //    check, passing:
      // 5. If object is not a default iterator object for interface,
      //    then throw a TypeError.
      if (typeof this !== 'object' || this === null || !(#target in this)) {
        throw new TypeError(
          `'next' called on an object that does not implement interface ${name} Iterator.`
        )
      }

      // 6. Let index be object’s index.
      // 7. Let kind be object’s kind.
      // 8. Let values be object’s target's value pairs to iterate over.
      const index = this.#index
      const values = this.#target[kInternalIterator]

      // 9. Let len be the length of values.
      const len = values.length

      // 10. If index is greater than or equal to len, then return
      //     CreateIterResultObject(undefined, true).
      if (index >= len) {
        return {
          value: undefined,
          done: true
        }
      }

      // 11. Let pair be the entry in values at index index.
      const { [keyIndex]: key, [valueIndex]: value } = values[index]

      // 12. Set object’s index to index + 1.
      this.#index = index + 1

      // 13. Return the iterator result for pair and kind.

      // https://webidl.spec.whatwg.org/#iterator-result

      // 1. Let result be a value determined by the value of kind:
      let result
      switch (this.#kind) {
        case 'key':
          // 1. Let idlKey be pair’s key.
          // 2. Let key be the result of converting idlKey to an
          //    ECMAScript value.
          // 3. result is key.
          result = key
          break
        case 'value':
          // 1. Let idlValue be pair’s value.
          // 2. Let value be the result of converting idlValue to
          //    an ECMAScript value.
          // 3. result is value.
          result = value
          break
        case 'key+value':
          // 1. Let idlKey be pair’s key.
          // 2. Let idlValue be pair’s value.
          // 3. Let key be the result of converting idlKey to an
          //    ECMAScript value.
          // 4. Let value be the result of converting idlValue to
          //    an ECMAScript value.
          // 5. Let array be ! ArrayCreate(2).
          // 6. Call ! CreateDataProperty(array, "0", key).
          // 7. Call ! CreateDataProperty(array, "1", value).
          // 8. result is array.
          result = [key, value]
          break
      }

      // 2. Return CreateIterResultObject(result, false).
      return {
        value: result,
        done: false
      }
    }
  }

  // https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
  // @ts-ignore
  delete FastIterableIterator.prototype.constructor

  Object.setPrototypeOf(FastIterableIterator.prototype, esIteratorPrototype)

  Object.defineProperties(FastIterableIterator.prototype, {
    [Symbol.toStringTag]: {
      writable: false,
      enumerable: false,
      configurable: true,
      value: `${name} Iterator`
    },
    next: { writable: true, enumerable: true, configurable: true }
  })

  /**
   * @param {unknown} target
   * @param {'key' | 'value' | 'key+value'} kind
   * @returns {IterableIterator<any>}
   */
  return function (target, kind) {
    return new FastIterableIterator(target, kind)
  }
}

/**
 * @see https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
 * @param {string} name name of the instance
 * @param {any} object class
 * @param {symbol} kInternalIterator
 * @param {string | number} [keyIndex]
 * @param {string | number} [valueIndex]
 */
function iteratorMixin (name, object, kInternalIterator, keyIndex = 0, valueIndex = 1) {
  const makeIterator = createIterator(name, kInternalIterator, keyIndex, valueIndex)

  const properties = {
    keys: {
      writable: true,
      enumerable: true,
      configurable: true,
      value: function keys () {
        webidl.brandCheck(this, object)
        return makeIterator(this, 'key')
      }
    },
    values: {
      writable: true,
      enumerable: true,
      configurable: true,
      value: function values () {
        webidl.brandCheck(this, object)
        return makeIterator(this, 'value')
      }
    },
    entries: {
      writable: true,
      enumerable: true,
      configurable: true,
      value: function entries () {
        webidl.brandCheck(this, object)
        return makeIterator(this, 'key+value')
      }
    },
    forEach: {
      writable: true,
      enumerable: true,
      configurable: true,
      value: function forEach (callbackfn, thisArg = globalThis) {
        webidl.brandCheck(this, object)
        webidl.argumentLengthCheck(arguments, 1, `${name}.forEach`)
        if (typeof callbackfn !== 'function') {
          throw new TypeError(
            `Failed to execute 'forEach' on '${name}': parameter 1 is not of type 'Function'.`
          )
        }
        for (const { 0: key, 1: value } of makeIterator(this, 'key+value')) {
          callbackfn.call(thisArg, value, key, this)
        }
      }
    }
  }

  return Object.defineProperties(object.prototype, {
    ...properties,
    [Symbol.iterator]: {
      writable: true,
      enumerable: false,
      configurable: true,
      value: properties.entries.value
    }
  })
}

/**
 * @see https://fetch.spec.whatwg.org/#body-fully-read
 */
async function fullyReadBody (body, processBody, processBodyError) {
  // 1. If taskDestination is null, then set taskDestination to
  //    the result of starting a new parallel queue.

  // 2. Let successSteps given a byte sequence bytes be to queue a
  //    fetch task to run processBody given bytes, with taskDestination.
  const successSteps = processBody

  // 3. Let errorSteps be to queue a fetch task to run processBodyError,
  //    with taskDestination.
  const errorSteps = processBodyError

  // 4. Let reader be the result of getting a reader for body’s stream.
  //    If that threw an exception, then run errorSteps with that
  //    exception and return.
  let reader

  try {
    reader = body.stream.getReader()
  } catch (e) {
    errorSteps(e)
    return
  }

  // 5. Read all bytes from reader, given successSteps and errorSteps.
  try {
    successSteps(await readAllBytes(reader))
  } catch (e) {
    errorSteps(e)
  }
}

function isReadableStreamLike (stream) {
  return stream instanceof ReadableStream || (
    stream[Symbol.toStringTag] === 'ReadableStream' &&
    typeof stream.tee === 'function'
  )
}

/**
 * @param {ReadableStreamController<Uint8Array>} controller
 */
function readableStreamClose (controller) {
  try {
    controller.close()
    controller.byobRequest?.respond(0)
  } catch (err) {
    // TODO: add comment explaining why this error occurs.
    if (!err.message.includes('Controller is already closed') && !err.message.includes('ReadableStream is already closed')) {
      throw err
    }
  }
}

const invalidIsomorphicEncodeValueRegex = /[^\x00-\xFF]/ // eslint-disable-line

/**
 * @see https://infra.spec.whatwg.org/#isomorphic-encode
 * @param {string} input
 */
function isomorphicEncode (input) {
  // 1. Assert: input contains no code points greater than U+00FF.
  assert(!invalidIsomorphicEncodeValueRegex.test(input))

  // 2. Return a byte sequence whose length is equal to input’s code
  //    point length and whose bytes have the same values as the
  //    values of input’s code points, in the same order
  return input
}

/**
 * @see https://streams.spec.whatwg.org/#readablestreamdefaultreader-read-all-bytes
 * @see https://streams.spec.whatwg.org/#read-loop
 * @param {ReadableStreamDefaultReader} reader
 */
async function readAllBytes (reader) {
  const bytes = []
  let byteLength = 0

  while (true) {
    const { done, value: chunk } = await reader.read()

    if (done) {
      // 1. Call successSteps with bytes.
      return Buffer.concat(bytes, byteLength)
    }

    // 1. If chunk is not a Uint8Array object, call failureSteps
    //    with a TypeError and abort these steps.
    if (!isUint8Array(chunk)) {
      throw new TypeError('Received non-Uint8Array chunk')
    }

    // 2. Append the bytes represented by chunk to bytes.
    bytes.push(chunk)
    byteLength += chunk.length

    // 3. Read-loop given reader, bytes, successSteps, and failureSteps.
  }
}

/**
 * @see https://fetch.spec.whatwg.org/#is-local
 * @param {URL} url
 */
function urlIsLocal (url) {
  assert('protocol' in url) // ensure it's a url object

  const protocol = url.protocol

  return protocol === 'about:' || protocol === 'blob:' || protocol === 'data:'
}

/**
 * @param {string|URL} url
 * @returns {boolean}
 */
function urlHasHttpsScheme (url) {
  return (
    (
      typeof url === 'string' &&
      url[5] === ':' &&
      url[0] === 'h' &&
      url[1] === 't' &&
      url[2] === 't' &&
      url[3] === 'p' &&
      url[4] === 's'
    ) ||
    url.protocol === 'https:'
  )
}

/**
 * @see https://fetch.spec.whatwg.org/#http-scheme
 * @param {URL} url
 */
function urlIsHttpHttpsScheme (url) {
  assert('protocol' in url) // ensure it's a url object

  const protocol = url.protocol

  return protocol === 'http:' || protocol === 'https:'
}

/**
 * @see https://fetch.spec.whatwg.org/#simple-range-header-value
 * @param {string} value
 * @param {boolean} allowWhitespace
 */
function simpleRangeHeaderValue (value, allowWhitespace) {
  // 1. Let data be the isomorphic decoding of value.
  // Note: isomorphic decoding takes a sequence of bytes (ie. a Uint8Array) and turns it into a string,
  // nothing more. We obviously don't need to do that if value is a string already.
  const data = value

  // 2. If data does not start with "bytes", then return failure.
  if (!data.startsWith('bytes')) {
    return 'failure'
  }

  // 3. Let position be a position variable for data, initially pointing at the 5th code point of data.
  const position = { position: 5 }

  // 4. If allowWhitespace is true, collect a sequence of code points that are HTTP tab or space,
  //    from data given position.
  if (allowWhitespace) {
    collectASequenceOfCodePoints(
      (char) => char === '\t' || char === ' ',
      data,
      position
    )
  }

  // 5. If the code point at position within data is not U+003D (=), then return failure.
  if (data.charCodeAt(position.position) !== 0x3D) {
    return 'failure'
  }

  // 6. Advance position by 1.
  position.position++

  // 7. If allowWhitespace is true, collect a sequence of code points that are HTTP tab or space, from
  //    data given position.
  if (allowWhitespace) {
    collectASequenceOfCodePoints(
      (char) => char === '\t' || char === ' ',
      data,
      position
    )
  }

  // 8. Let rangeStart be the result of collecting a sequence of code points that are ASCII digits,
  //    from data given position.
  const rangeStart = collectASequenceOfCodePoints(
    (char) => {
      const code = char.charCodeAt(0)

      return code >= 0x30 && code <= 0x39
    },
    data,
    position
  )

  // 9. Let rangeStartValue be rangeStart, interpreted as decimal number, if rangeStart is not the
  //    empty string; otherwise null.
  const rangeStartValue = rangeStart.length ? Number(rangeStart) : null

  // 10. If allowWhitespace is true, collect a sequence of code points that are HTTP tab or space,
  //     from data given position.
  if (allowWhitespace) {
    collectASequenceOfCodePoints(
      (char) => char === '\t' || char === ' ',
      data,
      position
    )
  }

  // 11. If the code point at position within data is not U+002D (-), then return failure.
  if (data.charCodeAt(position.position) !== 0x2D) {
    return 'failure'
  }

  // 12. Advance position by 1.
  position.position++

  // 13. If allowWhitespace is true, collect a sequence of code points that are HTTP tab
  //     or space, from data given position.
  // Note from Khafra: its the same step as in #8 again lol
  if (allowWhitespace) {
    collectASequenceOfCodePoints(
      (char) => char === '\t' || char === ' ',
      data,
      position
    )
  }

  // 14. Let rangeEnd be the result of collecting a sequence of code points that are
  //     ASCII digits, from data given position.
  // Note from Khafra: you wouldn't guess it, but this is also the same step as #8
  const rangeEnd = collectASequenceOfCodePoints(
    (char) => {
      const code = char.charCodeAt(0)

      return code >= 0x30 && code <= 0x39
    },
    data,
    position
  )

  // 15. Let rangeEndValue be rangeEnd, interpreted as decimal number, if rangeEnd
  //     is not the empty string; otherwise null.
  // Note from Khafra: THE SAME STEP, AGAIN!!!
  // Note: why interpret as a decimal if we only collect ascii digits?
  const rangeEndValue = rangeEnd.length ? Number(rangeEnd) : null

  // 16. If position is not past the end of data, then return failure.
  if (position.position < data.length) {
    return 'failure'
  }

  // 17. If rangeEndValue and rangeStartValue are null, then return failure.
  if (rangeEndValue === null && rangeStartValue === null) {
    return 'failure'
  }

  // 18. If rangeStartValue and rangeEndValue are numbers, and rangeStartValue is
  //     greater than rangeEndValue, then return failure.
  // Note: ... when can they not be numbers?
  if (rangeStartValue > rangeEndValue) {
    return 'failure'
  }

  // 19. Return (rangeStartValue, rangeEndValue).
  return { rangeStartValue, rangeEndValue }
}

/**
 * @see https://fetch.spec.whatwg.org/#build-a-content-range
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @param {number} fullLength
 */
function buildContentRange (rangeStart, rangeEnd, fullLength) {
  // 1. Let contentRange be `bytes `.
  let contentRange = 'bytes '

  // 2. Append rangeStart, serialized and isomorphic encoded, to contentRange.
  contentRange += isomorphicEncode(`${rangeStart}`)

  // 3. Append 0x2D (-) to contentRange.
  contentRange += '-'

  // 4. Append rangeEnd, serialized and isomorphic encoded to contentRange.
  contentRange += isomorphicEncode(`${rangeEnd}`)

  // 5. Append 0x2F (/) to contentRange.
  contentRange += '/'

  // 6. Append fullLength, serialized and isomorphic encoded to contentRange.
  contentRange += isomorphicEncode(`${fullLength}`)

  // 7. Return contentRange.
  return contentRange
}

// A Stream, which pipes the response to zlib.createInflate() or
// zlib.createInflateRaw() depending on the first byte of the Buffer.
// If the lower byte of the first byte is 0x08, then the stream is
// interpreted as a zlib stream, otherwise it's interpreted as a
// raw deflate stream.
class InflateStream extends Transform {
  #zlibOptions

  /** @param {zlib.ZlibOptions} [zlibOptions] */
  constructor (zlibOptions) {
    super()
    this.#zlibOptions = zlibOptions
  }

  _transform (chunk, encoding, callback) {
    if (!this._inflateStream) {
      if (chunk.length === 0) {
        callback()
        return
      }
      this._inflateStream = (chunk[0] & 0x0F) === 0x08
        ? zlib.createInflate(this.#zlibOptions)
        : zlib.createInflateRaw(this.#zlibOptions)

      this._inflateStream.on('data', this.push.bind(this))
      this._inflateStream.on('end', () => this.push(null))
      this._inflateStream.on('error', (err) => this.destroy(err))
    }

    this._inflateStream.write(chunk, encoding, callback)
  }

  _final (callback) {
    if (this._inflateStream) {
      this._inflateStream.end()
      this._inflateStream = null
    }
    callback()
  }
}

/**
 * @param {zlib.ZlibOptions} [zlibOptions]
 * @returns {InflateStream}
 */
function createInflate (zlibOptions) {
  return new InflateStream(zlibOptions)
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-header-extract-mime-type
 * @param {import('./headers').HeadersList} headers
 */
function extractMimeType (headers) {
  // 1. Let charset be null.
  let charset = null

  // 2. Let essence be null.
  let essence = null

  // 3. Let mimeType be null.
  let mimeType = null

  // 4. Let values be the result of getting, decoding, and splitting `Content-Type` from headers.
  const values = getDecodeSplit('content-type', headers)

  // 5. If values is null, then return failure.
  if (values === null) {
    return 'failure'
  }

  // 6. For each value of values:
  for (const value of values) {
    // 6.1. Let temporaryMimeType be the result of parsing value.
    const temporaryMimeType = parseMIMEType(value)

    // 6.2. If temporaryMimeType is failure or its essence is "*/*", then continue.
    if (temporaryMimeType === 'failure' || temporaryMimeType.essence === '*/*') {
      continue
    }

    // 6.3. Set mimeType to temporaryMimeType.
    mimeType = temporaryMimeType

    // 6.4. If mimeType’s essence is not essence, then:
    if (mimeType.essence !== essence) {
      // 6.4.1. Set charset to null.
      charset = null

      // 6.4.2. If mimeType’s parameters["charset"] exists, then set charset to
      //        mimeType’s parameters["charset"].
      if (mimeType.parameters.has('charset')) {
        charset = mimeType.parameters.get('charset')
      }

      // 6.4.3. Set essence to mimeType’s essence.
      essence = mimeType.essence
    } else if (!mimeType.parameters.has('charset') && charset !== null) {
      // 6.5. Otherwise, if mimeType’s parameters["charset"] does not exist, and
      //      charset is non-null, set mimeType’s parameters["charset"] to charset.
      mimeType.parameters.set('charset', charset)
    }
  }

  // 7. If mimeType is null, then return failure.
  if (mimeType == null) {
    return 'failure'
  }

  // 8. Return mimeType.
  return mimeType
}

/**
 * @see https://fetch.spec.whatwg.org/#header-value-get-decode-and-split
 * @param {string|null} value
 */
function gettingDecodingSplitting (value) {
  // 1. Let input be the result of isomorphic decoding value.
  const input = value

  // 2. Let position be a position variable for input, initially pointing at the start of input.
  const position = { position: 0 }

  // 3. Let values be a list of strings, initially empty.
  const values = []

  // 4. Let temporaryValue be the empty string.
  let temporaryValue = ''

  // 5. While position is not past the end of input:
  while (position.position < input.length) {
    // 5.1. Append the result of collecting a sequence of code points that are not U+0022 (")
    //      or U+002C (,) from input, given position, to temporaryValue.
    temporaryValue += collectASequenceOfCodePoints(
      (char) => char !== '"' && char !== ',',
      input,
      position
    )

    // 5.2. If position is not past the end of input, then:
    if (position.position < input.length) {
      // 5.2.1. If the code point at position within input is U+0022 ("), then:
      if (input.charCodeAt(position.position) === 0x22) {
        // 5.2.1.1. Append the result of collecting an HTTP quoted string from input, given position, to temporaryValue.
        temporaryValue += collectAnHTTPQuotedString(
          input,
          position
        )

        // 5.2.1.2. If position is not past the end of input, then continue.
        if (position.position < input.length) {
          continue
        }
      } else {
        // 5.2.2. Otherwise:

        // 5.2.2.1. Assert: the code point at position within input is U+002C (,).
        assert(input.charCodeAt(position.position) === 0x2C)

        // 5.2.2.2. Advance position by 1.
        position.position++
      }
    }

    // 5.3. Remove all HTTP tab or space from the start and end of temporaryValue.
    temporaryValue = removeChars(temporaryValue, true, true, (char) => char === 0x9 || char === 0x20)

    // 5.4. Append temporaryValue to values.
    values.push(temporaryValue)

    // 5.6. Set temporaryValue to the empty string.
    temporaryValue = ''
  }

  // 6. Return values.
  return values
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-header-list-get-decode-split
 * @param {string} name lowercase header name
 * @param {import('./headers').HeadersList} list
 */
function getDecodeSplit (name, list) {
  // 1. Let value be the result of getting name from list.
  const value = list.get(name, true)

  // 2. If value is null, then return null.
  if (value === null) {
    return null
  }

  // 3. Return the result of getting, decoding, and splitting value.
  return gettingDecodingSplitting(value)
}

const textDecoder = new TextDecoder()

/**
 * @see https://encoding.spec.whatwg.org/#utf-8-decode
 * @param {Buffer} buffer
 */
function utf8DecodeBytes (buffer) {
  if (buffer.length === 0) {
    return ''
  }

  // 1. Let buffer be the result of peeking three bytes from
  //    ioQueue, converted to a byte sequence.

  // 2. If buffer is 0xEF 0xBB 0xBF, then read three
  //    bytes from ioQueue. (Do nothing with those bytes.)
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3)
  }

  // 3. Process a queue with an instance of UTF-8’s
  //    decoder, ioQueue, output, and "replacement".
  const output = textDecoder.decode(buffer)

  // 4. Return output.
  return output
}

class EnvironmentSettingsObjectBase {
  get baseUrl () {
    return getGlobalOrigin()
  }

  get origin () {
    return this.baseUrl?.origin
  }

  policyContainer = makePolicyContainer()
}

class EnvironmentSettingsObject {
  settingsObject = new EnvironmentSettingsObjectBase()
}

const environmentSettingsObject = new EnvironmentSettingsObject()

module.exports = {
  isAborted,
  isCancelled,
  isValidEncodedURL,
  createDeferredPromise,
  ReadableStreamFrom,
  tryUpgradeRequestToAPotentiallyTrustworthyURL,
  clampAndCoarsenConnectionTimingInfo,
  coarsenedSharedCurrentTime,
  determineRequestsReferrer,
  makePolicyContainer,
  clonePolicyContainer,
  appendFetchMetadata,
  appendRequestOriginHeader,
  TAOCheck,
  corsCheck,
  crossOriginResourcePolicyCheck,
  createOpaqueTimingInfo,
  setRequestReferrerPolicyOnRedirect,
  isValidHTTPToken,
  requestBadPort,
  requestCurrentURL,
  responseURL,
  responseLocationURL,
  isBlobLike,
  isURLPotentiallyTrustworthy,
  isValidReasonPhrase,
  sameOrigin,
  normalizeMethod,
  serializeJavascriptValueToJSONString,
  iteratorMixin,
  createIterator,
  isValidHeaderName,
  isValidHeaderValue,
  isErrorLike,
  fullyReadBody,
  bytesMatch,
  isReadableStreamLike,
  readableStreamClose,
  isomorphicEncode,
  urlIsLocal,
  urlHasHttpsScheme,
  urlIsHttpHttpsScheme,
  readAllBytes,
  simpleRangeHeaderValue,
  buildContentRange,
  parseMetadata,
  createInflate,
  extractMimeType,
  getDecodeSplit,
  utf8DecodeBytes,
  environmentSettingsObject
}


/***/ }),

/***/ 9346:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { types, inspect } = __nccwpck_require__(7261)
const { markAsUncloneable } = __nccwpck_require__(4086)
const { toUSVString } = __nccwpck_require__(9099)

/** @type {import('../../../types/webidl').Webidl} */
const webidl = {}
webidl.converters = {}
webidl.util = {}
webidl.errors = {}

webidl.errors.exception = function (message) {
  return new TypeError(`${message.header}: ${message.message}`)
}

webidl.errors.conversionFailed = function (context) {
  const plural = context.types.length === 1 ? '' : ' one of'
  const message =
    `${context.argument} could not be converted to` +
    `${plural}: ${context.types.join(', ')}.`

  return webidl.errors.exception({
    header: context.prefix,
    message
  })
}

webidl.errors.invalidArgument = function (context) {
  return webidl.errors.exception({
    header: context.prefix,
    message: `"${context.value}" is an invalid ${context.type}.`
  })
}

// https://webidl.spec.whatwg.org/#implements
webidl.brandCheck = function (V, I, opts) {
  if (opts?.strict !== false) {
    if (!(V instanceof I)) {
      const err = new TypeError('Illegal invocation')
      err.code = 'ERR_INVALID_THIS' // node compat.
      throw err
    }
  } else {
    if (V?.[Symbol.toStringTag] !== I.prototype[Symbol.toStringTag]) {
      const err = new TypeError('Illegal invocation')
      err.code = 'ERR_INVALID_THIS' // node compat.
      throw err
    }
  }
}

webidl.argumentLengthCheck = function ({ length }, min, ctx) {
  if (length < min) {
    throw webidl.errors.exception({
      message: `${min} argument${min !== 1 ? 's' : ''} required, ` +
               `but${length ? ' only' : ''} ${length} found.`,
      header: ctx
    })
  }
}

webidl.illegalConstructor = function () {
  throw webidl.errors.exception({
    header: 'TypeError',
    message: 'Illegal constructor'
  })
}

// https://tc39.es/ecma262/#sec-ecmascript-data-types-and-values
webidl.util.Type = function (V) {
  switch (typeof V) {
    case 'undefined': return 'Undefined'
    case 'boolean': return 'Boolean'
    case 'string': return 'String'
    case 'symbol': return 'Symbol'
    case 'number': return 'Number'
    case 'bigint': return 'BigInt'
    case 'function':
    case 'object': {
      if (V === null) {
        return 'Null'
      }

      return 'Object'
    }
  }
}

webidl.util.markAsUncloneable = markAsUncloneable || (() => {})
// https://webidl.spec.whatwg.org/#abstract-opdef-converttoint
webidl.util.ConvertToInt = function (V, bitLength, signedness, opts) {
  let upperBound
  let lowerBound

  // 1. If bitLength is 64, then:
  if (bitLength === 64) {
    // 1. Let upperBound be 2^53 − 1.
    upperBound = Math.pow(2, 53) - 1

    // 2. If signedness is "unsigned", then let lowerBound be 0.
    if (signedness === 'unsigned') {
      lowerBound = 0
    } else {
      // 3. Otherwise let lowerBound be −2^53 + 1.
      lowerBound = Math.pow(-2, 53) + 1
    }
  } else if (signedness === 'unsigned') {
    // 2. Otherwise, if signedness is "unsigned", then:

    // 1. Let lowerBound be 0.
    lowerBound = 0

    // 2. Let upperBound be 2^bitLength − 1.
    upperBound = Math.pow(2, bitLength) - 1
  } else {
    // 3. Otherwise:

    // 1. Let lowerBound be -2^bitLength − 1.
    lowerBound = Math.pow(-2, bitLength) - 1

    // 2. Let upperBound be 2^bitLength − 1 − 1.
    upperBound = Math.pow(2, bitLength - 1) - 1
  }

  // 4. Let x be ? ToNumber(V).
  let x = Number(V)

  // 5. If x is −0, then set x to +0.
  if (x === 0) {
    x = 0
  }

  // 6. If the conversion is to an IDL type associated
  //    with the [EnforceRange] extended attribute, then:
  if (opts?.enforceRange === true) {
    // 1. If x is NaN, +∞, or −∞, then throw a TypeError.
    if (
      Number.isNaN(x) ||
      x === Number.POSITIVE_INFINITY ||
      x === Number.NEGATIVE_INFINITY
    ) {
      throw webidl.errors.exception({
        header: 'Integer conversion',
        message: `Could not convert ${webidl.util.Stringify(V)} to an integer.`
      })
    }

    // 2. Set x to IntegerPart(x).
    x = webidl.util.IntegerPart(x)

    // 3. If x < lowerBound or x > upperBound, then
    //    throw a TypeError.
    if (x < lowerBound || x > upperBound) {
      throw webidl.errors.exception({
        header: 'Integer conversion',
        message: `Value must be between ${lowerBound}-${upperBound}, got ${x}.`
      })
    }

    // 4. Return x.
    return x
  }

  // 7. If x is not NaN and the conversion is to an IDL
  //    type associated with the [Clamp] extended
  //    attribute, then:
  if (!Number.isNaN(x) && opts?.clamp === true) {
    // 1. Set x to min(max(x, lowerBound), upperBound).
    x = Math.min(Math.max(x, lowerBound), upperBound)

    // 2. Round x to the nearest integer, choosing the
    //    even integer if it lies halfway between two,
    //    and choosing +0 rather than −0.
    if (Math.floor(x) % 2 === 0) {
      x = Math.floor(x)
    } else {
      x = Math.ceil(x)
    }

    // 3. Return x.
    return x
  }

  // 8. If x is NaN, +0, +∞, or −∞, then return +0.
  if (
    Number.isNaN(x) ||
    (x === 0 && Object.is(0, x)) ||
    x === Number.POSITIVE_INFINITY ||
    x === Number.NEGATIVE_INFINITY
  ) {
    return 0
  }

  // 9. Set x to IntegerPart(x).
  x = webidl.util.IntegerPart(x)

  // 10. Set x to x modulo 2^bitLength.
  x = x % Math.pow(2, bitLength)

  // 11. If signedness is "signed" and x ≥ 2^bitLength − 1,
  //    then return x − 2^bitLength.
  if (signedness === 'signed' && x >= Math.pow(2, bitLength) - 1) {
    return x - Math.pow(2, bitLength)
  }

  // 12. Otherwise, return x.
  return x
}

// https://webidl.spec.whatwg.org/#abstract-opdef-integerpart
webidl.util.IntegerPart = function (n) {
  // 1. Let r be floor(abs(n)).
  const r = Math.floor(Math.abs(n))

  // 2. If n < 0, then return -1 × r.
  if (n < 0) {
    return -1 * r
  }

  // 3. Otherwise, return r.
  return r
}

webidl.util.Stringify = function (V) {
  const type = webidl.util.Type(V)

  switch (type) {
    case 'Symbol':
      return `Symbol(${V.description})`
    case 'Object':
      return inspect(V)
    case 'String':
      return `"${V}"`
    default:
      return `${V}`
  }
}

// https://webidl.spec.whatwg.org/#es-sequence
webidl.sequenceConverter = function (converter) {
  return (V, prefix, argument, Iterable) => {
    // 1. If Type(V) is not Object, throw a TypeError.
    if (webidl.util.Type(V) !== 'Object') {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} (${webidl.util.Stringify(V)}) is not iterable.`
      })
    }

    // 2. Let method be ? GetMethod(V, @@iterator).
    /** @type {Generator} */
    const method = typeof Iterable === 'function' ? Iterable() : V?.[Symbol.iterator]?.()
    const seq = []
    let index = 0

    // 3. If method is undefined, throw a TypeError.
    if (
      method === undefined ||
      typeof method.next !== 'function'
    ) {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} is not iterable.`
      })
    }

    // https://webidl.spec.whatwg.org/#create-sequence-from-iterable
    while (true) {
      const { done, value } = method.next()

      if (done) {
        break
      }

      seq.push(converter(value, prefix, `${argument}[${index++}]`))
    }

    return seq
  }
}

// https://webidl.spec.whatwg.org/#es-to-record
webidl.recordConverter = function (keyConverter, valueConverter) {
  return (O, prefix, argument) => {
    // 1. If Type(O) is not Object, throw a TypeError.
    if (webidl.util.Type(O) !== 'Object') {
      throw webidl.errors.exception({
        header: prefix,
        message: `${argument} ("${webidl.util.Type(O)}") is not an Object.`
      })
    }

    // 2. Let result be a new empty instance of record<K, V>.
    const result = {}

    if (!types.isProxy(O)) {
      // 1. Let desc be ? O.[[GetOwnProperty]](key).
      const keys = [...Object.getOwnPropertyNames(O), ...Object.getOwnPropertySymbols(O)]

      for (const key of keys) {
        // 1. Let typedKey be key converted to an IDL value of type K.
        const typedKey = keyConverter(key, prefix, argument)

        // 2. Let value be ? Get(O, key).
        // 3. Let typedValue be value converted to an IDL value of type V.
        const typedValue = valueConverter(O[key], prefix, argument)

        // 4. Set result[typedKey] to typedValue.
        result[typedKey] = typedValue
      }

      // 5. Return result.
      return result
    }

    // 3. Let keys be ? O.[[OwnPropertyKeys]]().
    const keys = Reflect.ownKeys(O)

    // 4. For each key of keys.
    for (const key of keys) {
      // 1. Let desc be ? O.[[GetOwnProperty]](key).
      const desc = Reflect.getOwnPropertyDescriptor(O, key)

      // 2. If desc is not undefined and desc.[[Enumerable]] is true:
      if (desc?.enumerable) {
        // 1. Let typedKey be key converted to an IDL value of type K.
        const typedKey = keyConverter(key, prefix, argument)

        // 2. Let value be ? Get(O, key).
        // 3. Let typedValue be value converted to an IDL value of type V.
        const typedValue = valueConverter(O[key], prefix, argument)

        // 4. Set result[typedKey] to typedValue.
        result[typedKey] = typedValue
      }
    }

    // 5. Return result.
    return result
  }
}

webidl.interfaceConverter = function (i) {
  return (V, prefix, argument, opts) => {
    if (opts?.strict !== false && !(V instanceof i)) {
      throw webidl.errors.exception({
        header: prefix,
        message: `Expected ${argument} ("${webidl.util.Stringify(V)}") to be an instance of ${i.name}.`
      })
    }

    return V
  }
}

webidl.dictionaryConverter = function (converters) {
  return (dictionary, prefix, argument) => {
    const type = webidl.util.Type(dictionary)
    const dict = {}

    if (type === 'Null' || type === 'Undefined') {
      return dict
    } else if (type !== 'Object') {
      throw webidl.errors.exception({
        header: prefix,
        message: `Expected ${dictionary} to be one of: Null, Undefined, Object.`
      })
    }

    for (const options of converters) {
      const { key, defaultValue, required, converter } = options

      if (required === true) {
        if (!Object.hasOwn(dictionary, key)) {
          throw webidl.errors.exception({
            header: prefix,
            message: `Missing required key "${key}".`
          })
        }
      }

      let value = dictionary[key]
      const hasDefault = Object.hasOwn(options, 'defaultValue')

      // Only use defaultValue if value is undefined and
      // a defaultValue options was provided.
      if (hasDefault && value !== null) {
        value ??= defaultValue()
      }

      // A key can be optional and have no default value.
      // When this happens, do not perform a conversion,
      // and do not assign the key a value.
      if (required || hasDefault || value !== undefined) {
        value = converter(value, prefix, `${argument}.${key}`)

        if (
          options.allowedValues &&
          !options.allowedValues.includes(value)
        ) {
          throw webidl.errors.exception({
            header: prefix,
            message: `${value} is not an accepted type. Expected one of ${options.allowedValues.join(', ')}.`
          })
        }

        dict[key] = value
      }
    }

    return dict
  }
}

webidl.nullableConverter = function (converter) {
  return (V, prefix, argument) => {
    if (V === null) {
      return V
    }

    return converter(V, prefix, argument)
  }
}

// https://webidl.spec.whatwg.org/#es-DOMString
webidl.converters.DOMString = function (V, prefix, argument, opts) {
  // 1. If V is null and the conversion is to an IDL type
  //    associated with the [LegacyNullToEmptyString]
  //    extended attribute, then return the DOMString value
  //    that represents the empty string.
  if (V === null && opts?.legacyNullToEmptyString) {
    return ''
  }

  // 2. Let x be ? ToString(V).
  if (typeof V === 'symbol') {
    throw webidl.errors.exception({
      header: prefix,
      message: `${argument} is a symbol, which cannot be converted to a DOMString.`
    })
  }

  // 3. Return the IDL DOMString value that represents the
  //    same sequence of code units as the one the
  //    ECMAScript String value x represents.
  return String(V)
}

// https://webidl.spec.whatwg.org/#es-ByteString
webidl.converters.ByteString = function (V, prefix, argument) {
  // 1. Let x be ? ToString(V).
  // Note: DOMString converter perform ? ToString(V)
  const x = webidl.converters.DOMString(V, prefix, argument)

  // 2. If the value of any element of x is greater than
  //    255, then throw a TypeError.
  for (let index = 0; index < x.length; index++) {
    if (x.charCodeAt(index) > 255) {
      throw new TypeError(
        'Cannot convert argument to a ByteString because the character at ' +
        `index ${index} has a value of ${x.charCodeAt(index)} which is greater than 255.`
      )
    }
  }

  // 3. Return an IDL ByteString value whose length is the
  //    length of x, and where the value of each element is
  //    the value of the corresponding element of x.
  return x
}

// https://webidl.spec.whatwg.org/#es-USVString
// TODO: rewrite this so we can control the errors thrown
webidl.converters.USVString = toUSVString

// https://webidl.spec.whatwg.org/#es-boolean
webidl.converters.boolean = function (V) {
  // 1. Let x be the result of computing ToBoolean(V).
  const x = Boolean(V)

  // 2. Return the IDL boolean value that is the one that represents
  //    the same truth value as the ECMAScript Boolean value x.
  return x
}

// https://webidl.spec.whatwg.org/#es-any
webidl.converters.any = function (V) {
  return V
}

// https://webidl.spec.whatwg.org/#es-long-long
webidl.converters['long long'] = function (V, prefix, argument) {
  // 1. Let x be ? ConvertToInt(V, 64, "signed").
  const x = webidl.util.ConvertToInt(V, 64, 'signed', undefined, prefix, argument)

  // 2. Return the IDL long long value that represents
  //    the same numeric value as x.
  return x
}

// https://webidl.spec.whatwg.org/#es-unsigned-long-long
webidl.converters['unsigned long long'] = function (V, prefix, argument) {
  // 1. Let x be ? ConvertToInt(V, 64, "unsigned").
  const x = webidl.util.ConvertToInt(V, 64, 'unsigned', undefined, prefix, argument)

  // 2. Return the IDL unsigned long long value that
  //    represents the same numeric value as x.
  return x
}

// https://webidl.spec.whatwg.org/#es-unsigned-long
webidl.converters['unsigned long'] = function (V, prefix, argument) {
  // 1. Let x be ? ConvertToInt(V, 32, "unsigned").
  const x = webidl.util.ConvertToInt(V, 32, 'unsigned', undefined, prefix, argument)

  // 2. Return the IDL unsigned long value that
  //    represents the same numeric value as x.
  return x
}

// https://webidl.spec.whatwg.org/#es-unsigned-short
webidl.converters['unsigned short'] = function (V, prefix, argument, opts) {
  // 1. Let x be ? ConvertToInt(V, 16, "unsigned").
  const x = webidl.util.ConvertToInt(V, 16, 'unsigned', opts, prefix, argument)

  // 2. Return the IDL unsigned short value that represents
  //    the same numeric value as x.
  return x
}

// https://webidl.spec.whatwg.org/#idl-ArrayBuffer
webidl.converters.ArrayBuffer = function (V, prefix, argument, opts) {
  // 1. If Type(V) is not Object, or V does not have an
  //    [[ArrayBufferData]] internal slot, then throw a
  //    TypeError.
  // see: https://tc39.es/ecma262/#sec-properties-of-the-arraybuffer-instances
  // see: https://tc39.es/ecma262/#sec-properties-of-the-sharedarraybuffer-instances
  if (
    webidl.util.Type(V) !== 'Object' ||
    !types.isAnyArrayBuffer(V)
  ) {
    throw webidl.errors.conversionFailed({
      prefix,
      argument: `${argument} ("${webidl.util.Stringify(V)}")`,
      types: ['ArrayBuffer']
    })
  }

  // 2. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V) is true, then throw a
  //    TypeError.
  if (opts?.allowShared === false && types.isSharedArrayBuffer(V)) {
    throw webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'SharedArrayBuffer is not allowed.'
    })
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowResizable] extended attribute, and
  //    IsResizableArrayBuffer(V) is true, then throw a
  //    TypeError.
  if (V.resizable || V.growable) {
    throw webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'Received a resizable ArrayBuffer.'
    })
  }

  // 4. Return the IDL ArrayBuffer value that is a
  //    reference to the same object as V.
  return V
}

webidl.converters.TypedArray = function (V, T, prefix, name, opts) {
  // 1. Let T be the IDL type V is being converted to.

  // 2. If Type(V) is not Object, or V does not have a
  //    [[TypedArrayName]] internal slot with a value
  //    equal to T’s name, then throw a TypeError.
  if (
    webidl.util.Type(V) !== 'Object' ||
    !types.isTypedArray(V) ||
    V.constructor.name !== T.name
  ) {
    throw webidl.errors.conversionFailed({
      prefix,
      argument: `${name} ("${webidl.util.Stringify(V)}")`,
      types: [T.name]
    })
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  if (opts?.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
    throw webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'SharedArrayBuffer is not allowed.'
    })
  }

  // 4. If the conversion is not to an IDL type associated
  //    with the [AllowResizable] extended attribute, and
  //    IsResizableArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  if (V.buffer.resizable || V.buffer.growable) {
    throw webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'Received a resizable ArrayBuffer.'
    })
  }

  // 5. Return the IDL value of type T that is a reference
  //    to the same object as V.
  return V
}

webidl.converters.DataView = function (V, prefix, name, opts) {
  // 1. If Type(V) is not Object, or V does not have a
  //    [[DataView]] internal slot, then throw a TypeError.
  if (webidl.util.Type(V) !== 'Object' || !types.isDataView(V)) {
    throw webidl.errors.exception({
      header: prefix,
      message: `${name} is not a DataView.`
    })
  }

  // 2. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V.[[ViewedArrayBuffer]]) is true,
  //    then throw a TypeError.
  if (opts?.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
    throw webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'SharedArrayBuffer is not allowed.'
    })
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowResizable] extended attribute, and
  //    IsResizableArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  if (V.buffer.resizable || V.buffer.growable) {
    throw webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'Received a resizable ArrayBuffer.'
    })
  }

  // 4. Return the IDL DataView value that is a reference
  //    to the same object as V.
  return V
}

// https://webidl.spec.whatwg.org/#BufferSource
webidl.converters.BufferSource = function (V, prefix, name, opts) {
  if (types.isAnyArrayBuffer(V)) {
    return webidl.converters.ArrayBuffer(V, prefix, name, { ...opts, allowShared: false })
  }

  if (types.isTypedArray(V)) {
    return webidl.converters.TypedArray(V, V.constructor, prefix, name, { ...opts, allowShared: false })
  }

  if (types.isDataView(V)) {
    return webidl.converters.DataView(V, prefix, name, { ...opts, allowShared: false })
  }

  throw webidl.errors.conversionFailed({
    prefix,
    argument: `${name} ("${webidl.util.Stringify(V)}")`,
    types: ['BufferSource']
  })
}

webidl.converters['sequence<ByteString>'] = webidl.sequenceConverter(
  webidl.converters.ByteString
)

webidl.converters['sequence<sequence<ByteString>>'] = webidl.sequenceConverter(
  webidl.converters['sequence<ByteString>']
)

webidl.converters['record<ByteString, ByteString>'] = webidl.recordConverter(
  webidl.converters.ByteString,
  webidl.converters.ByteString
)

module.exports = {
  webidl
}


/***/ }),

/***/ 4033:
/***/ ((module) => {

"use strict";


/**
 * @see https://encoding.spec.whatwg.org/#concept-encoding-get
 * @param {string|undefined} label
 */
function getEncoding (label) {
  if (!label) {
    return 'failure'
  }

  // 1. Remove any leading and trailing ASCII whitespace from label.
  // 2. If label is an ASCII case-insensitive match for any of the
  //    labels listed in the table below, then return the
  //    corresponding encoding; otherwise return failure.
  switch (label.trim().toLowerCase()) {
    case 'unicode-1-1-utf-8':
    case 'unicode11utf8':
    case 'unicode20utf8':
    case 'utf-8':
    case 'utf8':
    case 'x-unicode20utf8':
      return 'UTF-8'
    case '866':
    case 'cp866':
    case 'csibm866':
    case 'ibm866':
      return 'IBM866'
    case 'csisolatin2':
    case 'iso-8859-2':
    case 'iso-ir-101':
    case 'iso8859-2':
    case 'iso88592':
    case 'iso_8859-2':
    case 'iso_8859-2:1987':
    case 'l2':
    case 'latin2':
      return 'ISO-8859-2'
    case 'csisolatin3':
    case 'iso-8859-3':
    case 'iso-ir-109':
    case 'iso8859-3':
    case 'iso88593':
    case 'iso_8859-3':
    case 'iso_8859-3:1988':
    case 'l3':
    case 'latin3':
      return 'ISO-8859-3'
    case 'csisolatin4':
    case 'iso-8859-4':
    case 'iso-ir-110':
    case 'iso8859-4':
    case 'iso88594':
    case 'iso_8859-4':
    case 'iso_8859-4:1988':
    case 'l4':
    case 'latin4':
      return 'ISO-8859-4'
    case 'csisolatincyrillic':
    case 'cyrillic':
    case 'iso-8859-5':
    case 'iso-ir-144':
    case 'iso8859-5':
    case 'iso88595':
    case 'iso_8859-5':
    case 'iso_8859-5:1988':
      return 'ISO-8859-5'
    case 'arabic':
    case 'asmo-708':
    case 'csiso88596e':
    case 'csiso88596i':
    case 'csisolatinarabic':
    case 'ecma-114':
    case 'iso-8859-6':
    case 'iso-8859-6-e':
    case 'iso-8859-6-i':
    case 'iso-ir-127':
    case 'iso8859-6':
    case 'iso88596':
    case 'iso_8859-6':
    case 'iso_8859-6:1987':
      return 'ISO-8859-6'
    case 'csisolatingreek':
    case 'ecma-118':
    case 'elot_928':
    case 'greek':
    case 'greek8':
    case 'iso-8859-7':
    case 'iso-ir-126':
    case 'iso8859-7':
    case 'iso88597':
    case 'iso_8859-7':
    case 'iso_8859-7:1987':
    case 'sun_eu_greek':
      return 'ISO-8859-7'
    case 'csiso88598e':
    case 'csisolatinhebrew':
    case 'hebrew':
    case 'iso-8859-8':
    case 'iso-8859-8-e':
    case 'iso-ir-138':
    case 'iso8859-8':
    case 'iso88598':
    case 'iso_8859-8':
    case 'iso_8859-8:1988':
    case 'visual':
      return 'ISO-8859-8'
    case 'csiso88598i':
    case 'iso-8859-8-i':
    case 'logical':
      return 'ISO-8859-8-I'
    case 'csisolatin6':
    case 'iso-8859-10':
    case 'iso-ir-157':
    case 'iso8859-10':
    case 'iso885910':
    case 'l6':
    case 'latin6':
      return 'ISO-8859-10'
    case 'iso-8859-13':
    case 'iso8859-13':
    case 'iso885913':
      return 'ISO-8859-13'
    case 'iso-8859-14':
    case 'iso8859-14':
    case 'iso885914':
      return 'ISO-8859-14'
    case 'csisolatin9':
    case 'iso-8859-15':
    case 'iso8859-15':
    case 'iso885915':
    case 'iso_8859-15':
    case 'l9':
      return 'ISO-8859-15'
    case 'iso-8859-16':
      return 'ISO-8859-16'
    case 'cskoi8r':
    case 'koi':
    case 'koi8':
    case 'koi8-r':
    case 'koi8_r':
      return 'KOI8-R'
    case 'koi8-ru':
    case 'koi8-u':
      return 'KOI8-U'
    case 'csmacintosh':
    case 'mac':
    case 'macintosh':
    case 'x-mac-roman':
      return 'macintosh'
    case 'iso-8859-11':
    case 'iso8859-11':
    case 'iso885911':
    case 'tis-620':
    case 'windows-874':
      return 'windows-874'
    case 'cp1250':
    case 'windows-1250':
    case 'x-cp1250':
      return 'windows-1250'
    case 'cp1251':
    case 'windows-1251':
    case 'x-cp1251':
      return 'windows-1251'
    case 'ansi_x3.4-1968':
    case 'ascii':
    case 'cp1252':
    case 'cp819':
    case 'csisolatin1':
    case 'ibm819':
    case 'iso-8859-1':
    case 'iso-ir-100':
    case 'iso8859-1':
    case 'iso88591':
    case 'iso_8859-1':
    case 'iso_8859-1:1987':
    case 'l1':
    case 'latin1':
    case 'us-ascii':
    case 'windows-1252':
    case 'x-cp1252':
      return 'windows-1252'
    case 'cp1253':
    case 'windows-1253':
    case 'x-cp1253':
      return 'windows-1253'
    case 'cp1254':
    case 'csisolatin5':
    case 'iso-8859-9':
    case 'iso-ir-148':
    case 'iso8859-9':
    case 'iso88599':
    case 'iso_8859-9':
    case 'iso_8859-9:1989':
    case 'l5':
    case 'latin5':
    case 'windows-1254':
    case 'x-cp1254':
      return 'windows-1254'
    case 'cp1255':
    case 'windows-1255':
    case 'x-cp1255':
      return 'windows-1255'
    case 'cp1256':
    case 'windows-1256':
    case 'x-cp1256':
      return 'windows-1256'
    case 'cp1257':
    case 'windows-1257':
    case 'x-cp1257':
      return 'windows-1257'
    case 'cp1258':
    case 'windows-1258':
    case 'x-cp1258':
      return 'windows-1258'
    case 'x-mac-cyrillic':
    case 'x-mac-ukrainian':
      return 'x-mac-cyrillic'
    case 'chinese':
    case 'csgb2312':
    case 'csiso58gb231280':
    case 'gb2312':
    case 'gb_2312':
    case 'gb_2312-80':
    case 'gbk':
    case 'iso-ir-58':
    case 'x-gbk':
      return 'GBK'
    case 'gb18030':
      return 'gb18030'
    case 'big5':
    case 'big5-hkscs':
    case 'cn-big5':
    case 'csbig5':
    case 'x-x-big5':
      return 'Big5'
    case 'cseucpkdfmtjapanese':
    case 'euc-jp':
    case 'x-euc-jp':
      return 'EUC-JP'
    case 'csiso2022jp':
    case 'iso-2022-jp':
      return 'ISO-2022-JP'
    case 'csshiftjis':
    case 'ms932':
    case 'ms_kanji':
    case 'shift-jis':
    case 'shift_jis':
    case 'sjis':
    case 'windows-31j':
    case 'x-sjis':
      return 'Shift_JIS'
    case 'cseuckr':
    case 'csksc56011987':
    case 'euc-kr':
    case 'iso-ir-149':
    case 'korean':
    case 'ks_c_5601-1987':
    case 'ks_c_5601-1989':
    case 'ksc5601':
    case 'ksc_5601':
    case 'windows-949':
      return 'EUC-KR'
    case 'csiso2022kr':
    case 'hz-gb-2312':
    case 'iso-2022-cn':
    case 'iso-2022-cn-ext':
    case 'iso-2022-kr':
    case 'replacement':
      return 'replacement'
    case 'unicodefffe':
    case 'utf-16be':
      return 'UTF-16BE'
    case 'csunicode':
    case 'iso-10646-ucs-2':
    case 'ucs-2':
    case 'unicode':
    case 'unicodefeff':
    case 'utf-16':
    case 'utf-16le':
      return 'UTF-16LE'
    case 'x-user-defined':
      return 'x-user-defined'
    default: return 'failure'
  }
}

module.exports = {
  getEncoding
}


/***/ }),

/***/ 2524:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  staticPropertyDescriptors,
  readOperation,
  fireAProgressEvent
} = __nccwpck_require__(6495)
const {
  kState,
  kError,
  kResult,
  kEvents,
  kAborted
} = __nccwpck_require__(7092)
const { webidl } = __nccwpck_require__(9346)
const { kEnumerableProperty } = __nccwpck_require__(9099)

class FileReader extends EventTarget {
  constructor () {
    super()

    this[kState] = 'empty'
    this[kResult] = null
    this[kError] = null
    this[kEvents] = {
      loadend: null,
      error: null,
      abort: null,
      load: null,
      progress: null,
      loadstart: null
    }
  }

  /**
   * @see https://w3c.github.io/FileAPI/#dfn-readAsArrayBuffer
   * @param {import('buffer').Blob} blob
   */
  readAsArrayBuffer (blob) {
    webidl.brandCheck(this, FileReader)

    webidl.argumentLengthCheck(arguments, 1, 'FileReader.readAsArrayBuffer')

    blob = webidl.converters.Blob(blob, { strict: false })

    // The readAsArrayBuffer(blob) method, when invoked,
    // must initiate a read operation for blob with ArrayBuffer.
    readOperation(this, blob, 'ArrayBuffer')
  }

  /**
   * @see https://w3c.github.io/FileAPI/#readAsBinaryString
   * @param {import('buffer').Blob} blob
   */
  readAsBinaryString (blob) {
    webidl.brandCheck(this, FileReader)

    webidl.argumentLengthCheck(arguments, 1, 'FileReader.readAsBinaryString')

    blob = webidl.converters.Blob(blob, { strict: false })

    // The readAsBinaryString(blob) method, when invoked,
    // must initiate a read operation for blob with BinaryString.
    readOperation(this, blob, 'BinaryString')
  }

  /**
   * @see https://w3c.github.io/FileAPI/#readAsDataText
   * @param {import('buffer').Blob} blob
   * @param {string?} encoding
   */
  readAsText (blob, encoding = undefined) {
    webidl.brandCheck(this, FileReader)

    webidl.argumentLengthCheck(arguments, 1, 'FileReader.readAsText')

    blob = webidl.converters.Blob(blob, { strict: false })

    if (encoding !== undefined) {
      encoding = webidl.converters.DOMString(encoding, 'FileReader.readAsText', 'encoding')
    }

    // The readAsText(blob, encoding) method, when invoked,
    // must initiate a read operation for blob with Text and encoding.
    readOperation(this, blob, 'Text', encoding)
  }

  /**
   * @see https://w3c.github.io/FileAPI/#dfn-readAsDataURL
   * @param {import('buffer').Blob} blob
   */
  readAsDataURL (blob) {
    webidl.brandCheck(this, FileReader)

    webidl.argumentLengthCheck(arguments, 1, 'FileReader.readAsDataURL')

    blob = webidl.converters.Blob(blob, { strict: false })

    // The readAsDataURL(blob) method, when invoked, must
    // initiate a read operation for blob with DataURL.
    readOperation(this, blob, 'DataURL')
  }

  /**
   * @see https://w3c.github.io/FileAPI/#dfn-abort
   */
  abort () {
    // 1. If this's state is "empty" or if this's state is
    //    "done" set this's result to null and terminate
    //    this algorithm.
    if (this[kState] === 'empty' || this[kState] === 'done') {
      this[kResult] = null
      return
    }

    // 2. If this's state is "loading" set this's state to
    //    "done" and set this's result to null.
    if (this[kState] === 'loading') {
      this[kState] = 'done'
      this[kResult] = null
    }

    // 3. If there are any tasks from this on the file reading
    //    task source in an affiliated task queue, then remove
    //    those tasks from that task queue.
    this[kAborted] = true

    // 4. Terminate the algorithm for the read method being processed.
    // TODO

    // 5. Fire a progress event called abort at this.
    fireAProgressEvent('abort', this)

    // 6. If this's state is not "loading", fire a progress
    //    event called loadend at this.
    if (this[kState] !== 'loading') {
      fireAProgressEvent('loadend', this)
    }
  }

  /**
   * @see https://w3c.github.io/FileAPI/#dom-filereader-readystate
   */
  get readyState () {
    webidl.brandCheck(this, FileReader)

    switch (this[kState]) {
      case 'empty': return this.EMPTY
      case 'loading': return this.LOADING
      case 'done': return this.DONE
    }
  }

  /**
   * @see https://w3c.github.io/FileAPI/#dom-filereader-result
   */
  get result () {
    webidl.brandCheck(this, FileReader)

    // The result attribute’s getter, when invoked, must return
    // this's result.
    return this[kResult]
  }

  /**
   * @see https://w3c.github.io/FileAPI/#dom-filereader-error
   */
  get error () {
    webidl.brandCheck(this, FileReader)

    // The error attribute’s getter, when invoked, must return
    // this's error.
    return this[kError]
  }

  get onloadend () {
    webidl.brandCheck(this, FileReader)

    return this[kEvents].loadend
  }

  set onloadend (fn) {
    webidl.brandCheck(this, FileReader)

    if (this[kEvents].loadend) {
      this.removeEventListener('loadend', this[kEvents].loadend)
    }

    if (typeof fn === 'function') {
      this[kEvents].loadend = fn
      this.addEventListener('loadend', fn)
    } else {
      this[kEvents].loadend = null
    }
  }

  get onerror () {
    webidl.brandCheck(this, FileReader)

    return this[kEvents].error
  }

  set onerror (fn) {
    webidl.brandCheck(this, FileReader)

    if (this[kEvents].error) {
      this.removeEventListener('error', this[kEvents].error)
    }

    if (typeof fn === 'function') {
      this[kEvents].error = fn
      this.addEventListener('error', fn)
    } else {
      this[kEvents].error = null
    }
  }

  get onloadstart () {
    webidl.brandCheck(this, FileReader)

    return this[kEvents].loadstart
  }

  set onloadstart (fn) {
    webidl.brandCheck(this, FileReader)

    if (this[kEvents].loadstart) {
      this.removeEventListener('loadstart', this[kEvents].loadstart)
    }

    if (typeof fn === 'function') {
      this[kEvents].loadstart = fn
      this.addEventListener('loadstart', fn)
    } else {
      this[kEvents].loadstart = null
    }
  }

  get onprogress () {
    webidl.brandCheck(this, FileReader)

    return this[kEvents].progress
  }

  set onprogress (fn) {
    webidl.brandCheck(this, FileReader)

    if (this[kEvents].progress) {
      this.removeEventListener('progress', this[kEvents].progress)
    }

    if (typeof fn === 'function') {
      this[kEvents].progress = fn
      this.addEventListener('progress', fn)
    } else {
      this[kEvents].progress = null
    }
  }

  get onload () {
    webidl.brandCheck(this, FileReader)

    return this[kEvents].load
  }

  set onload (fn) {
    webidl.brandCheck(this, FileReader)

    if (this[kEvents].load) {
      this.removeEventListener('load', this[kEvents].load)
    }

    if (typeof fn === 'function') {
      this[kEvents].load = fn
      this.addEventListener('load', fn)
    } else {
      this[kEvents].load = null
    }
  }

  get onabort () {
    webidl.brandCheck(this, FileReader)

    return this[kEvents].abort
  }

  set onabort (fn) {
    webidl.brandCheck(this, FileReader)

    if (this[kEvents].abort) {
      this.removeEventListener('abort', this[kEvents].abort)
    }

    if (typeof fn === 'function') {
      this[kEvents].abort = fn
      this.addEventListener('abort', fn)
    } else {
      this[kEvents].abort = null
    }
  }
}

// https://w3c.github.io/FileAPI/#dom-filereader-empty
FileReader.EMPTY = FileReader.prototype.EMPTY = 0
// https://w3c.github.io/FileAPI/#dom-filereader-loading
FileReader.LOADING = FileReader.prototype.LOADING = 1
// https://w3c.github.io/FileAPI/#dom-filereader-done
FileReader.DONE = FileReader.prototype.DONE = 2

Object.defineProperties(FileReader.prototype, {
  EMPTY: staticPropertyDescriptors,
  LOADING: staticPropertyDescriptors,
  DONE: staticPropertyDescriptors,
  readAsArrayBuffer: kEnumerableProperty,
  readAsBinaryString: kEnumerableProperty,
  readAsText: kEnumerableProperty,
  readAsDataURL: kEnumerableProperty,
  abort: kEnumerableProperty,
  readyState: kEnumerableProperty,
  result: kEnumerableProperty,
  error: kEnumerableProperty,
  onloadstart: kEnumerableProperty,
  onprogress: kEnumerableProperty,
  onload: kEnumerableProperty,
  onabort: kEnumerableProperty,
  onerror: kEnumerableProperty,
  onloadend: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'FileReader',
    writable: false,
    enumerable: false,
    configurable: true
  }
})

Object.defineProperties(FileReader, {
  EMPTY: staticPropertyDescriptors,
  LOADING: staticPropertyDescriptors,
  DONE: staticPropertyDescriptors
})

module.exports = {
  FileReader
}


/***/ }),

/***/ 4327:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { webidl } = __nccwpck_require__(9346)

const kState = Symbol('ProgressEvent state')

/**
 * @see https://xhr.spec.whatwg.org/#progressevent
 */
class ProgressEvent extends Event {
  constructor (type, eventInitDict = {}) {
    type = webidl.converters.DOMString(type, 'ProgressEvent constructor', 'type')
    eventInitDict = webidl.converters.ProgressEventInit(eventInitDict ?? {})

    super(type, eventInitDict)

    this[kState] = {
      lengthComputable: eventInitDict.lengthComputable,
      loaded: eventInitDict.loaded,
      total: eventInitDict.total
    }
  }

  get lengthComputable () {
    webidl.brandCheck(this, ProgressEvent)

    return this[kState].lengthComputable
  }

  get loaded () {
    webidl.brandCheck(this, ProgressEvent)

    return this[kState].loaded
  }

  get total () {
    webidl.brandCheck(this, ProgressEvent)

    return this[kState].total
  }
}

webidl.converters.ProgressEventInit = webidl.dictionaryConverter([
  {
    key: 'lengthComputable',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'loaded',
    converter: webidl.converters['unsigned long long'],
    defaultValue: () => 0
  },
  {
    key: 'total',
    converter: webidl.converters['unsigned long long'],
    defaultValue: () => 0
  },
  {
    key: 'bubbles',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'cancelable',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'composed',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  }
])

module.exports = {
  ProgressEvent
}


/***/ }),

/***/ 7092:
/***/ ((module) => {

"use strict";


module.exports = {
  kState: Symbol('FileReader state'),
  kResult: Symbol('FileReader result'),
  kError: Symbol('FileReader error'),
  kLastProgressEventFired: Symbol('FileReader last progress event fired timestamp'),
  kEvents: Symbol('FileReader events'),
  kAborted: Symbol('FileReader aborted')
}


/***/ }),

/***/ 6495:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  kState,
  kError,
  kResult,
  kAborted,
  kLastProgressEventFired
} = __nccwpck_require__(7092)
const { ProgressEvent } = __nccwpck_require__(4327)
const { getEncoding } = __nccwpck_require__(4033)
const { serializeAMimeType, parseMIMEType } = __nccwpck_require__(5253)
const { types } = __nccwpck_require__(7261)
const { StringDecoder } = __nccwpck_require__(1576)
const { btoa } = __nccwpck_require__(2254)

/** @type {PropertyDescriptor} */
const staticPropertyDescriptors = {
  enumerable: true,
  writable: false,
  configurable: false
}

/**
 * @see https://w3c.github.io/FileAPI/#readOperation
 * @param {import('./filereader').FileReader} fr
 * @param {import('buffer').Blob} blob
 * @param {string} type
 * @param {string?} encodingName
 */
function readOperation (fr, blob, type, encodingName) {
  // 1. If fr’s state is "loading", throw an InvalidStateError
  //    DOMException.
  if (fr[kState] === 'loading') {
    throw new DOMException('Invalid state', 'InvalidStateError')
  }

  // 2. Set fr’s state to "loading".
  fr[kState] = 'loading'

  // 3. Set fr’s result to null.
  fr[kResult] = null

  // 4. Set fr’s error to null.
  fr[kError] = null

  // 5. Let stream be the result of calling get stream on blob.
  /** @type {import('stream/web').ReadableStream} */
  const stream = blob.stream()

  // 6. Let reader be the result of getting a reader from stream.
  const reader = stream.getReader()

  // 7. Let bytes be an empty byte sequence.
  /** @type {Uint8Array[]} */
  const bytes = []

  // 8. Let chunkPromise be the result of reading a chunk from
  //    stream with reader.
  let chunkPromise = reader.read()

  // 9. Let isFirstChunk be true.
  let isFirstChunk = true

  // 10. In parallel, while true:
  // Note: "In parallel" just means non-blocking
  // Note 2: readOperation itself cannot be async as double
  // reading the body would then reject the promise, instead
  // of throwing an error.
  ;(async () => {
    while (!fr[kAborted]) {
      // 1. Wait for chunkPromise to be fulfilled or rejected.
      try {
        const { done, value } = await chunkPromise

        // 2. If chunkPromise is fulfilled, and isFirstChunk is
        //    true, queue a task to fire a progress event called
        //    loadstart at fr.
        if (isFirstChunk && !fr[kAborted]) {
          queueMicrotask(() => {
            fireAProgressEvent('loadstart', fr)
          })
        }

        // 3. Set isFirstChunk to false.
        isFirstChunk = false

        // 4. If chunkPromise is fulfilled with an object whose
        //    done property is false and whose value property is
        //    a Uint8Array object, run these steps:
        if (!done && types.isUint8Array(value)) {
          // 1. Let bs be the byte sequence represented by the
          //    Uint8Array object.

          // 2. Append bs to bytes.
          bytes.push(value)

          // 3. If roughly 50ms have passed since these steps
          //    were last invoked, queue a task to fire a
          //    progress event called progress at fr.
          if (
            (
              fr[kLastProgressEventFired] === undefined ||
              Date.now() - fr[kLastProgressEventFired] >= 50
            ) &&
            !fr[kAborted]
          ) {
            fr[kLastProgressEventFired] = Date.now()
            queueMicrotask(() => {
              fireAProgressEvent('progress', fr)
            })
          }

          // 4. Set chunkPromise to the result of reading a
          //    chunk from stream with reader.
          chunkPromise = reader.read()
        } else if (done) {
          // 5. Otherwise, if chunkPromise is fulfilled with an
          //    object whose done property is true, queue a task
          //    to run the following steps and abort this algorithm:
          queueMicrotask(() => {
            // 1. Set fr’s state to "done".
            fr[kState] = 'done'

            // 2. Let result be the result of package data given
            //    bytes, type, blob’s type, and encodingName.
            try {
              const result = packageData(bytes, type, blob.type, encodingName)

              // 4. Else:

              if (fr[kAborted]) {
                return
              }

              // 1. Set fr’s result to result.
              fr[kResult] = result

              // 2. Fire a progress event called load at the fr.
              fireAProgressEvent('load', fr)
            } catch (error) {
              // 3. If package data threw an exception error:

              // 1. Set fr’s error to error.
              fr[kError] = error

              // 2. Fire a progress event called error at fr.
              fireAProgressEvent('error', fr)
            }

            // 5. If fr’s state is not "loading", fire a progress
            //    event called loadend at the fr.
            if (fr[kState] !== 'loading') {
              fireAProgressEvent('loadend', fr)
            }
          })

          break
        }
      } catch (error) {
        if (fr[kAborted]) {
          return
        }

        // 6. Otherwise, if chunkPromise is rejected with an
        //    error error, queue a task to run the following
        //    steps and abort this algorithm:
        queueMicrotask(() => {
          // 1. Set fr’s state to "done".
          fr[kState] = 'done'

          // 2. Set fr’s error to error.
          fr[kError] = error

          // 3. Fire a progress event called error at fr.
          fireAProgressEvent('error', fr)

          // 4. If fr’s state is not "loading", fire a progress
          //    event called loadend at fr.
          if (fr[kState] !== 'loading') {
            fireAProgressEvent('loadend', fr)
          }
        })

        break
      }
    }
  })()
}

/**
 * @see https://w3c.github.io/FileAPI/#fire-a-progress-event
 * @see https://dom.spec.whatwg.org/#concept-event-fire
 * @param {string} e The name of the event
 * @param {import('./filereader').FileReader} reader
 */
function fireAProgressEvent (e, reader) {
  // The progress event e does not bubble. e.bubbles must be false
  // The progress event e is NOT cancelable. e.cancelable must be false
  const event = new ProgressEvent(e, {
    bubbles: false,
    cancelable: false
  })

  reader.dispatchEvent(event)
}

/**
 * @see https://w3c.github.io/FileAPI/#blob-package-data
 * @param {Uint8Array[]} bytes
 * @param {string} type
 * @param {string?} mimeType
 * @param {string?} encodingName
 */
function packageData (bytes, type, mimeType, encodingName) {
  // 1. A Blob has an associated package data algorithm, given
  //    bytes, a type, a optional mimeType, and a optional
  //    encodingName, which switches on type and runs the
  //    associated steps:

  switch (type) {
    case 'DataURL': {
      // 1. Return bytes as a DataURL [RFC2397] subject to
      //    the considerations below:
      //  * Use mimeType as part of the Data URL if it is
      //    available in keeping with the Data URL
      //    specification [RFC2397].
      //  * If mimeType is not available return a Data URL
      //    without a media-type. [RFC2397].

      // https://datatracker.ietf.org/doc/html/rfc2397#section-3
      // dataurl    := "data:" [ mediatype ] [ ";base64" ] "," data
      // mediatype  := [ type "/" subtype ] *( ";" parameter )
      // data       := *urlchar
      // parameter  := attribute "=" value
      let dataURL = 'data:'

      const parsed = parseMIMEType(mimeType || 'application/octet-stream')

      if (parsed !== 'failure') {
        dataURL += serializeAMimeType(parsed)
      }

      dataURL += ';base64,'

      const decoder = new StringDecoder('latin1')

      for (const chunk of bytes) {
        dataURL += btoa(decoder.write(chunk))
      }

      dataURL += btoa(decoder.end())

      return dataURL
    }
    case 'Text': {
      // 1. Let encoding be failure
      let encoding = 'failure'

      // 2. If the encodingName is present, set encoding to the
      //    result of getting an encoding from encodingName.
      if (encodingName) {
        encoding = getEncoding(encodingName)
      }

      // 3. If encoding is failure, and mimeType is present:
      if (encoding === 'failure' && mimeType) {
        // 1. Let type be the result of parse a MIME type
        //    given mimeType.
        const type = parseMIMEType(mimeType)

        // 2. If type is not failure, set encoding to the result
        //    of getting an encoding from type’s parameters["charset"].
        if (type !== 'failure') {
          encoding = getEncoding(type.parameters.get('charset'))
        }
      }

      // 4. If encoding is failure, then set encoding to UTF-8.
      if (encoding === 'failure') {
        encoding = 'UTF-8'
      }

      // 5. Decode bytes using fallback encoding encoding, and
      //    return the result.
      return decode(bytes, encoding)
    }
    case 'ArrayBuffer': {
      // Return a new ArrayBuffer whose contents are bytes.
      const sequence = combineByteSequences(bytes)

      return sequence.buffer
    }
    case 'BinaryString': {
      // Return bytes as a binary string, in which every byte
      //  is represented by a code unit of equal value [0..255].
      let binaryString = ''

      const decoder = new StringDecoder('latin1')

      for (const chunk of bytes) {
        binaryString += decoder.write(chunk)
      }

      binaryString += decoder.end()

      return binaryString
    }
  }
}

/**
 * @see https://encoding.spec.whatwg.org/#decode
 * @param {Uint8Array[]} ioQueue
 * @param {string} encoding
 */
function decode (ioQueue, encoding) {
  const bytes = combineByteSequences(ioQueue)

  // 1. Let BOMEncoding be the result of BOM sniffing ioQueue.
  const BOMEncoding = BOMSniffing(bytes)

  let slice = 0

  // 2. If BOMEncoding is non-null:
  if (BOMEncoding !== null) {
    // 1. Set encoding to BOMEncoding.
    encoding = BOMEncoding

    // 2. Read three bytes from ioQueue, if BOMEncoding is
    //    UTF-8; otherwise read two bytes.
    //    (Do nothing with those bytes.)
    slice = BOMEncoding === 'UTF-8' ? 3 : 2
  }

  // 3. Process a queue with an instance of encoding’s
  //    decoder, ioQueue, output, and "replacement".

  // 4. Return output.

  const sliced = bytes.slice(slice)
  return new TextDecoder(encoding).decode(sliced)
}

/**
 * @see https://encoding.spec.whatwg.org/#bom-sniff
 * @param {Uint8Array} ioQueue
 */
function BOMSniffing (ioQueue) {
  // 1. Let BOM be the result of peeking 3 bytes from ioQueue,
  //    converted to a byte sequence.
  const [a, b, c] = ioQueue

  // 2. For each of the rows in the table below, starting with
  //    the first one and going down, if BOM starts with the
  //    bytes given in the first column, then return the
  //    encoding given in the cell in the second column of that
  //    row. Otherwise, return null.
  if (a === 0xEF && b === 0xBB && c === 0xBF) {
    return 'UTF-8'
  } else if (a === 0xFE && b === 0xFF) {
    return 'UTF-16BE'
  } else if (a === 0xFF && b === 0xFE) {
    return 'UTF-16LE'
  }

  return null
}

/**
 * @param {Uint8Array[]} sequences
 */
function combineByteSequences (sequences) {
  const size = sequences.reduce((a, b) => {
    return a + b.byteLength
  }, 0)

  let offset = 0

  return sequences.reduce((a, b) => {
    a.set(b, offset)
    offset += b.byteLength
    return a
  }, new Uint8Array(size))
}

module.exports = {
  staticPropertyDescriptors,
  readOperation,
  fireAProgressEvent
}


/***/ }),

/***/ 6641:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { uid, states, sentCloseFrameState, emptyBuffer, opcodes } = __nccwpck_require__(5421)
const {
  kReadyState,
  kSentClose,
  kByteParser,
  kReceivedClose,
  kResponse
} = __nccwpck_require__(4227)
const { fireEvent, failWebsocketConnection, isClosing, isClosed, isEstablished, parseExtensions } = __nccwpck_require__(404)
const { channels } = __nccwpck_require__(7055)
const { CloseEvent } = __nccwpck_require__(1225)
const { makeRequest } = __nccwpck_require__(9884)
const { fetching } = __nccwpck_require__(7935)
const { Headers, getHeadersList } = __nccwpck_require__(1401)
const { getDecodeSplit } = __nccwpck_require__(8185)
const { WebsocketFrameSend } = __nccwpck_require__(9730)

/** @type {import('crypto')} */
let crypto
try {
  crypto = __nccwpck_require__(6005)
/* c8 ignore next 3 */
} catch {

}

/**
 * @see https://websockets.spec.whatwg.org/#concept-websocket-establish
 * @param {URL} url
 * @param {string|string[]} protocols
 * @param {import('./websocket').WebSocket} ws
 * @param {(response: any, extensions: string[] | undefined) => void} onEstablish
 * @param {Partial<import('../../types/websocket').WebSocketInit>} options
 */
function establishWebSocketConnection (url, protocols, client, ws, onEstablish, options) {
  // 1. Let requestURL be a copy of url, with its scheme set to "http", if url’s
  //    scheme is "ws", and to "https" otherwise.
  const requestURL = url

  requestURL.protocol = url.protocol === 'ws:' ? 'http:' : 'https:'

  // 2. Let request be a new request, whose URL is requestURL, client is client,
  //    service-workers mode is "none", referrer is "no-referrer", mode is
  //    "websocket", credentials mode is "include", cache mode is "no-store" ,
  //    and redirect mode is "error".
  const request = makeRequest({
    urlList: [requestURL],
    client,
    serviceWorkers: 'none',
    referrer: 'no-referrer',
    mode: 'websocket',
    credentials: 'include',
    cache: 'no-store',
    redirect: 'error'
  })

  // Note: undici extension, allow setting custom headers.
  if (options.headers) {
    const headersList = getHeadersList(new Headers(options.headers))

    request.headersList = headersList
  }

  // 3. Append (`Upgrade`, `websocket`) to request’s header list.
  // 4. Append (`Connection`, `Upgrade`) to request’s header list.
  // Note: both of these are handled by undici currently.
  // https://github.com/nodejs/undici/blob/68c269c4144c446f3f1220951338daef4a6b5ec4/lib/client.js#L1397

  // 5. Let keyValue be a nonce consisting of a randomly selected
  //    16-byte value that has been forgiving-base64-encoded and
  //    isomorphic encoded.
  const keyValue = crypto.randomBytes(16).toString('base64')

  // 6. Append (`Sec-WebSocket-Key`, keyValue) to request’s
  //    header list.
  request.headersList.append('sec-websocket-key', keyValue)

  // 7. Append (`Sec-WebSocket-Version`, `13`) to request’s
  //    header list.
  request.headersList.append('sec-websocket-version', '13')

  // 8. For each protocol in protocols, combine
  //    (`Sec-WebSocket-Protocol`, protocol) in request’s header
  //    list.
  for (const protocol of protocols) {
    request.headersList.append('sec-websocket-protocol', protocol)
  }

  // 9. Let permessageDeflate be a user-agent defined
  //    "permessage-deflate" extension header value.
  // https://github.com/mozilla/gecko-dev/blob/ce78234f5e653a5d3916813ff990f053510227bc/netwerk/protocol/websocket/WebSocketChannel.cpp#L2673
  const permessageDeflate = 'permessage-deflate; client_max_window_bits'

  // 10. Append (`Sec-WebSocket-Extensions`, permessageDeflate) to
  //     request’s header list.
  request.headersList.append('sec-websocket-extensions', permessageDeflate)

  // 11. Fetch request with useParallelQueue set to true, and
  //     processResponse given response being these steps:
  const controller = fetching({
    request,
    useParallelQueue: true,
    dispatcher: options.dispatcher,
    processResponse (response) {
      // 1. If response is a network error or its status is not 101,
      //    fail the WebSocket connection.
      if (response.type === 'error' || response.status !== 101) {
        failWebsocketConnection(ws, 'Received network error or non-101 status code.')
        return
      }

      // 2. If protocols is not the empty list and extracting header
      //    list values given `Sec-WebSocket-Protocol` and response’s
      //    header list results in null, failure, or the empty byte
      //    sequence, then fail the WebSocket connection.
      if (protocols.length !== 0 && !response.headersList.get('Sec-WebSocket-Protocol')) {
        failWebsocketConnection(ws, 'Server did not respond with sent protocols.')
        return
      }

      // 3. Follow the requirements stated step 2 to step 6, inclusive,
      //    of the last set of steps in section 4.1 of The WebSocket
      //    Protocol to validate response. This either results in fail
      //    the WebSocket connection or the WebSocket connection is
      //    established.

      // 2. If the response lacks an |Upgrade| header field or the |Upgrade|
      //    header field contains a value that is not an ASCII case-
      //    insensitive match for the value "websocket", the client MUST
      //    _Fail the WebSocket Connection_.
      if (response.headersList.get('Upgrade')?.toLowerCase() !== 'websocket') {
        failWebsocketConnection(ws, 'Server did not set Upgrade header to "websocket".')
        return
      }

      // 3. If the response lacks a |Connection| header field or the
      //    |Connection| header field doesn't contain a token that is an
      //    ASCII case-insensitive match for the value "Upgrade", the client
      //    MUST _Fail the WebSocket Connection_.
      if (response.headersList.get('Connection')?.toLowerCase() !== 'upgrade') {
        failWebsocketConnection(ws, 'Server did not set Connection header to "upgrade".')
        return
      }

      // 4. If the response lacks a |Sec-WebSocket-Accept| header field or
      //    the |Sec-WebSocket-Accept| contains a value other than the
      //    base64-encoded SHA-1 of the concatenation of the |Sec-WebSocket-
      //    Key| (as a string, not base64-decoded) with the string "258EAFA5-
      //    E914-47DA-95CA-C5AB0DC85B11" but ignoring any leading and
      //    trailing whitespace, the client MUST _Fail the WebSocket
      //    Connection_.
      const secWSAccept = response.headersList.get('Sec-WebSocket-Accept')
      const digest = crypto.createHash('sha1').update(keyValue + uid).digest('base64')
      if (secWSAccept !== digest) {
        failWebsocketConnection(ws, 'Incorrect hash received in Sec-WebSocket-Accept header.')
        return
      }

      // 5. If the response includes a |Sec-WebSocket-Extensions| header
      //    field and this header field indicates the use of an extension
      //    that was not present in the client's handshake (the server has
      //    indicated an extension not requested by the client), the client
      //    MUST _Fail the WebSocket Connection_.  (The parsing of this
      //    header field to determine which extensions are requested is
      //    discussed in Section 9.1.)
      const secExtension = response.headersList.get('Sec-WebSocket-Extensions')
      let extensions

      if (secExtension !== null) {
        extensions = parseExtensions(secExtension)

        if (!extensions.has('permessage-deflate')) {
          failWebsocketConnection(ws, 'Sec-WebSocket-Extensions header does not match.')
          return
        }
      }

      // 6. If the response includes a |Sec-WebSocket-Protocol| header field
      //    and this header field indicates the use of a subprotocol that was
      //    not present in the client's handshake (the server has indicated a
      //    subprotocol not requested by the client), the client MUST _Fail
      //    the WebSocket Connection_.
      const secProtocol = response.headersList.get('Sec-WebSocket-Protocol')

      if (secProtocol !== null) {
        const requestProtocols = getDecodeSplit('sec-websocket-protocol', request.headersList)

        // The client can request that the server use a specific subprotocol by
        // including the |Sec-WebSocket-Protocol| field in its handshake.  If it
        // is specified, the server needs to include the same field and one of
        // the selected subprotocol values in its response for the connection to
        // be established.
        if (!requestProtocols.includes(secProtocol)) {
          failWebsocketConnection(ws, 'Protocol was not set in the opening handshake.')
          return
        }
      }

      response.socket.on('data', onSocketData)
      response.socket.on('close', onSocketClose)
      response.socket.on('error', onSocketError)

      if (channels.open.hasSubscribers) {
        channels.open.publish({
          address: response.socket.address(),
          protocol: secProtocol,
          extensions: secExtension
        })
      }

      onEstablish(response, extensions)
    }
  })

  return controller
}

function closeWebSocketConnection (ws, code, reason, reasonByteLength) {
  if (isClosing(ws) || isClosed(ws)) {
    // If this's ready state is CLOSING (2) or CLOSED (3)
    // Do nothing.
  } else if (!isEstablished(ws)) {
    // If the WebSocket connection is not yet established
    // Fail the WebSocket connection and set this's ready state
    // to CLOSING (2).
    failWebsocketConnection(ws, 'Connection was closed before it was established.')
    ws[kReadyState] = states.CLOSING
  } else if (ws[kSentClose] === sentCloseFrameState.NOT_SENT) {
    // If the WebSocket closing handshake has not yet been started
    // Start the WebSocket closing handshake and set this's ready
    // state to CLOSING (2).
    // - If neither code nor reason is present, the WebSocket Close
    //   message must not have a body.
    // - If code is present, then the status code to use in the
    //   WebSocket Close message must be the integer given by code.
    // - If reason is also present, then reasonBytes must be
    //   provided in the Close message after the status code.

    ws[kSentClose] = sentCloseFrameState.PROCESSING

    const frame = new WebsocketFrameSend()

    // If neither code nor reason is present, the WebSocket Close
    // message must not have a body.

    // If code is present, then the status code to use in the
    // WebSocket Close message must be the integer given by code.
    if (code !== undefined && reason === undefined) {
      frame.frameData = Buffer.allocUnsafe(2)
      frame.frameData.writeUInt16BE(code, 0)
    } else if (code !== undefined && reason !== undefined) {
      // If reason is also present, then reasonBytes must be
      // provided in the Close message after the status code.
      frame.frameData = Buffer.allocUnsafe(2 + reasonByteLength)
      frame.frameData.writeUInt16BE(code, 0)
      // the body MAY contain UTF-8-encoded data with value /reason/
      frame.frameData.write(reason, 2, 'utf-8')
    } else {
      frame.frameData = emptyBuffer
    }

    /** @type {import('stream').Duplex} */
    const socket = ws[kResponse].socket

    socket.write(frame.createFrame(opcodes.CLOSE))

    ws[kSentClose] = sentCloseFrameState.SENT

    // Upon either sending or receiving a Close control frame, it is said
    // that _The WebSocket Closing Handshake is Started_ and that the
    // WebSocket connection is in the CLOSING state.
    ws[kReadyState] = states.CLOSING
  } else {
    // Otherwise
    // Set this's ready state to CLOSING (2).
    ws[kReadyState] = states.CLOSING
  }
}

/**
 * @param {Buffer} chunk
 */
function onSocketData (chunk) {
  if (!this.ws[kByteParser].write(chunk)) {
    this.pause()
  }
}

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.4
 */
function onSocketClose () {
  const { ws } = this
  const { [kResponse]: response } = ws

  response.socket.off('data', onSocketData)
  response.socket.off('close', onSocketClose)
  response.socket.off('error', onSocketError)

  // If the TCP connection was closed after the
  // WebSocket closing handshake was completed, the WebSocket connection
  // is said to have been closed _cleanly_.
  const wasClean = ws[kSentClose] === sentCloseFrameState.SENT && ws[kReceivedClose]

  let code = 1005
  let reason = ''

  const result = ws[kByteParser].closingInfo

  if (result && !result.error) {
    code = result.code ?? 1005
    reason = result.reason
  } else if (!ws[kReceivedClose]) {
    // If _The WebSocket
    // Connection is Closed_ and no Close control frame was received by the
    // endpoint (such as could occur if the underlying transport connection
    // is lost), _The WebSocket Connection Close Code_ is considered to be
    // 1006.
    code = 1006
  }

  // 1. Change the ready state to CLOSED (3).
  ws[kReadyState] = states.CLOSED

  // 2. If the user agent was required to fail the WebSocket
  //    connection, or if the WebSocket connection was closed
  //    after being flagged as full, fire an event named error
  //    at the WebSocket object.
  // TODO

  // 3. Fire an event named close at the WebSocket object,
  //    using CloseEvent, with the wasClean attribute
  //    initialized to true if the connection closed cleanly
  //    and false otherwise, the code attribute initialized to
  //    the WebSocket connection close code, and the reason
  //    attribute initialized to the result of applying UTF-8
  //    decode without BOM to the WebSocket connection close
  //    reason.
  // TODO: process.nextTick
  fireEvent('close', ws, (type, init) => new CloseEvent(type, init), {
    wasClean, code, reason
  })

  if (channels.close.hasSubscribers) {
    channels.close.publish({
      websocket: ws,
      code,
      reason
    })
  }
}

function onSocketError (error) {
  const { ws } = this

  ws[kReadyState] = states.CLOSING

  if (channels.socketError.hasSubscribers) {
    channels.socketError.publish(error)
  }

  this.destroy()
}

module.exports = {
  establishWebSocketConnection,
  closeWebSocketConnection
}


/***/ }),

/***/ 5421:
/***/ ((module) => {

"use strict";


// This is a Globally Unique Identifier unique used
// to validate that the endpoint accepts websocket
// connections.
// See https://www.rfc-editor.org/rfc/rfc6455.html#section-1.3
const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** @type {PropertyDescriptor} */
const staticPropertyDescriptors = {
  enumerable: true,
  writable: false,
  configurable: false
}

const states = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
}

const sentCloseFrameState = {
  NOT_SENT: 0,
  PROCESSING: 1,
  SENT: 2
}

const opcodes = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xA
}

const maxUnsigned16Bit = 2 ** 16 - 1 // 65535

const parserStates = {
  INFO: 0,
  PAYLOADLENGTH_16: 2,
  PAYLOADLENGTH_64: 3,
  READ_DATA: 4
}

const emptyBuffer = Buffer.allocUnsafe(0)

const sendHints = {
  string: 1,
  typedArray: 2,
  arrayBuffer: 3,
  blob: 4
}

module.exports = {
  uid,
  sentCloseFrameState,
  staticPropertyDescriptors,
  states,
  opcodes,
  maxUnsigned16Bit,
  parserStates,
  emptyBuffer,
  sendHints
}


/***/ }),

/***/ 1225:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { webidl } = __nccwpck_require__(9346)
const { kEnumerableProperty } = __nccwpck_require__(9099)
const { kConstruct } = __nccwpck_require__(46)
const { MessagePort } = __nccwpck_require__(4086)

/**
 * @see https://html.spec.whatwg.org/multipage/comms.html#messageevent
 */
class MessageEvent extends Event {
  #eventInit

  constructor (type, eventInitDict = {}) {
    if (type === kConstruct) {
      super(arguments[1], arguments[2])
      webidl.util.markAsUncloneable(this)
      return
    }

    const prefix = 'MessageEvent constructor'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    type = webidl.converters.DOMString(type, prefix, 'type')
    eventInitDict = webidl.converters.MessageEventInit(eventInitDict, prefix, 'eventInitDict')

    super(type, eventInitDict)

    this.#eventInit = eventInitDict
    webidl.util.markAsUncloneable(this)
  }

  get data () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.data
  }

  get origin () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.origin
  }

  get lastEventId () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.lastEventId
  }

  get source () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.source
  }

  get ports () {
    webidl.brandCheck(this, MessageEvent)

    if (!Object.isFrozen(this.#eventInit.ports)) {
      Object.freeze(this.#eventInit.ports)
    }

    return this.#eventInit.ports
  }

  initMessageEvent (
    type,
    bubbles = false,
    cancelable = false,
    data = null,
    origin = '',
    lastEventId = '',
    source = null,
    ports = []
  ) {
    webidl.brandCheck(this, MessageEvent)

    webidl.argumentLengthCheck(arguments, 1, 'MessageEvent.initMessageEvent')

    return new MessageEvent(type, {
      bubbles, cancelable, data, origin, lastEventId, source, ports
    })
  }

  static createFastMessageEvent (type, init) {
    const messageEvent = new MessageEvent(kConstruct, type, init)
    messageEvent.#eventInit = init
    messageEvent.#eventInit.data ??= null
    messageEvent.#eventInit.origin ??= ''
    messageEvent.#eventInit.lastEventId ??= ''
    messageEvent.#eventInit.source ??= null
    messageEvent.#eventInit.ports ??= []
    return messageEvent
  }
}

const { createFastMessageEvent } = MessageEvent
delete MessageEvent.createFastMessageEvent

/**
 * @see https://websockets.spec.whatwg.org/#the-closeevent-interface
 */
class CloseEvent extends Event {
  #eventInit

  constructor (type, eventInitDict = {}) {
    const prefix = 'CloseEvent constructor'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    type = webidl.converters.DOMString(type, prefix, 'type')
    eventInitDict = webidl.converters.CloseEventInit(eventInitDict)

    super(type, eventInitDict)

    this.#eventInit = eventInitDict
    webidl.util.markAsUncloneable(this)
  }

  get wasClean () {
    webidl.brandCheck(this, CloseEvent)

    return this.#eventInit.wasClean
  }

  get code () {
    webidl.brandCheck(this, CloseEvent)

    return this.#eventInit.code
  }

  get reason () {
    webidl.brandCheck(this, CloseEvent)

    return this.#eventInit.reason
  }
}

// https://html.spec.whatwg.org/multipage/webappapis.html#the-errorevent-interface
class ErrorEvent extends Event {
  #eventInit

  constructor (type, eventInitDict) {
    const prefix = 'ErrorEvent constructor'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    super(type, eventInitDict)
    webidl.util.markAsUncloneable(this)

    type = webidl.converters.DOMString(type, prefix, 'type')
    eventInitDict = webidl.converters.ErrorEventInit(eventInitDict ?? {})

    this.#eventInit = eventInitDict
  }

  get message () {
    webidl.brandCheck(this, ErrorEvent)

    return this.#eventInit.message
  }

  get filename () {
    webidl.brandCheck(this, ErrorEvent)

    return this.#eventInit.filename
  }

  get lineno () {
    webidl.brandCheck(this, ErrorEvent)

    return this.#eventInit.lineno
  }

  get colno () {
    webidl.brandCheck(this, ErrorEvent)

    return this.#eventInit.colno
  }

  get error () {
    webidl.brandCheck(this, ErrorEvent)

    return this.#eventInit.error
  }
}

Object.defineProperties(MessageEvent.prototype, {
  [Symbol.toStringTag]: {
    value: 'MessageEvent',
    configurable: true
  },
  data: kEnumerableProperty,
  origin: kEnumerableProperty,
  lastEventId: kEnumerableProperty,
  source: kEnumerableProperty,
  ports: kEnumerableProperty,
  initMessageEvent: kEnumerableProperty
})

Object.defineProperties(CloseEvent.prototype, {
  [Symbol.toStringTag]: {
    value: 'CloseEvent',
    configurable: true
  },
  reason: kEnumerableProperty,
  code: kEnumerableProperty,
  wasClean: kEnumerableProperty
})

Object.defineProperties(ErrorEvent.prototype, {
  [Symbol.toStringTag]: {
    value: 'ErrorEvent',
    configurable: true
  },
  message: kEnumerableProperty,
  filename: kEnumerableProperty,
  lineno: kEnumerableProperty,
  colno: kEnumerableProperty,
  error: kEnumerableProperty
})

webidl.converters.MessagePort = webidl.interfaceConverter(MessagePort)

webidl.converters['sequence<MessagePort>'] = webidl.sequenceConverter(
  webidl.converters.MessagePort
)

const eventInit = [
  {
    key: 'bubbles',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'cancelable',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'composed',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  }
]

webidl.converters.MessageEventInit = webidl.dictionaryConverter([
  ...eventInit,
  {
    key: 'data',
    converter: webidl.converters.any,
    defaultValue: () => null
  },
  {
    key: 'origin',
    converter: webidl.converters.USVString,
    defaultValue: () => ''
  },
  {
    key: 'lastEventId',
    converter: webidl.converters.DOMString,
    defaultValue: () => ''
  },
  {
    key: 'source',
    // Node doesn't implement WindowProxy or ServiceWorker, so the only
    // valid value for source is a MessagePort.
    converter: webidl.nullableConverter(webidl.converters.MessagePort),
    defaultValue: () => null
  },
  {
    key: 'ports',
    converter: webidl.converters['sequence<MessagePort>'],
    defaultValue: () => new Array(0)
  }
])

webidl.converters.CloseEventInit = webidl.dictionaryConverter([
  ...eventInit,
  {
    key: 'wasClean',
    converter: webidl.converters.boolean,
    defaultValue: () => false
  },
  {
    key: 'code',
    converter: webidl.converters['unsigned short'],
    defaultValue: () => 0
  },
  {
    key: 'reason',
    converter: webidl.converters.USVString,
    defaultValue: () => ''
  }
])

webidl.converters.ErrorEventInit = webidl.dictionaryConverter([
  ...eventInit,
  {
    key: 'message',
    converter: webidl.converters.DOMString,
    defaultValue: () => ''
  },
  {
    key: 'filename',
    converter: webidl.converters.USVString,
    defaultValue: () => ''
  },
  {
    key: 'lineno',
    converter: webidl.converters['unsigned long'],
    defaultValue: () => 0
  },
  {
    key: 'colno',
    converter: webidl.converters['unsigned long'],
    defaultValue: () => 0
  },
  {
    key: 'error',
    converter: webidl.converters.any
  }
])

module.exports = {
  MessageEvent,
  CloseEvent,
  ErrorEvent,
  createFastMessageEvent
}


/***/ }),

/***/ 9730:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { maxUnsigned16Bit } = __nccwpck_require__(5421)

const BUFFER_SIZE = 16386

/** @type {import('crypto')} */
let crypto
let buffer = null
let bufIdx = BUFFER_SIZE

try {
  crypto = __nccwpck_require__(6005)
/* c8 ignore next 3 */
} catch {
  crypto = {
    // not full compatibility, but minimum.
    randomFillSync: function randomFillSync (buffer, _offset, _size) {
      for (let i = 0; i < buffer.length; ++i) {
        buffer[i] = Math.random() * 255 | 0
      }
      return buffer
    }
  }
}

function generateMask () {
  if (bufIdx === BUFFER_SIZE) {
    bufIdx = 0
    crypto.randomFillSync((buffer ??= Buffer.allocUnsafe(BUFFER_SIZE)), 0, BUFFER_SIZE)
  }
  return [buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++]]
}

class WebsocketFrameSend {
  /**
   * @param {Buffer|undefined} data
   */
  constructor (data) {
    this.frameData = data
  }

  createFrame (opcode) {
    const frameData = this.frameData
    const maskKey = generateMask()
    const bodyLength = frameData?.byteLength ?? 0

    /** @type {number} */
    let payloadLength = bodyLength // 0-125
    let offset = 6

    if (bodyLength > maxUnsigned16Bit) {
      offset += 8 // payload length is next 8 bytes
      payloadLength = 127
    } else if (bodyLength > 125) {
      offset += 2 // payload length is next 2 bytes
      payloadLength = 126
    }

    const buffer = Buffer.allocUnsafe(bodyLength + offset)

    // Clear first 2 bytes, everything else is overwritten
    buffer[0] = buffer[1] = 0
    buffer[0] |= 0x80 // FIN
    buffer[0] = (buffer[0] & 0xF0) + opcode // opcode

    /*! ws. MIT License. Einar Otto Stangvik <einaros@gmail.com> */
    buffer[offset - 4] = maskKey[0]
    buffer[offset - 3] = maskKey[1]
    buffer[offset - 2] = maskKey[2]
    buffer[offset - 1] = maskKey[3]

    buffer[1] = payloadLength

    if (payloadLength === 126) {
      buffer.writeUInt16BE(bodyLength, 2)
    } else if (payloadLength === 127) {
      // Clear extended payload length
      buffer[2] = buffer[3] = 0
      buffer.writeUIntBE(bodyLength, 4, 6)
    }

    buffer[1] |= 0x80 // MASK

    // mask body
    for (let i = 0; i < bodyLength; ++i) {
      buffer[offset + i] = frameData[i] ^ maskKey[i & 3]
    }

    return buffer
  }
}

module.exports = {
  WebsocketFrameSend
}


/***/ }),

/***/ 7104:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { createInflateRaw, Z_DEFAULT_WINDOWBITS } = __nccwpck_require__(5628)
const { isValidClientWindowBits } = __nccwpck_require__(404)
const { MessageSizeExceededError } = __nccwpck_require__(8642)

const tail = Buffer.from([0x00, 0x00, 0xff, 0xff])
const kBuffer = Symbol('kBuffer')
const kLength = Symbol('kLength')

// Default maximum decompressed message size: 4 MB
const kDefaultMaxDecompressedSize = 4 * 1024 * 1024

class PerMessageDeflate {
  /** @type {import('node:zlib').InflateRaw} */
  #inflate

  #options = {}

  /** @type {boolean} */
  #aborted = false

  /** @type {Function|null} */
  #currentCallback = null

  /**
   * @param {Map<string, string>} extensions
   */
  constructor (extensions) {
    this.#options.serverNoContextTakeover = extensions.has('server_no_context_takeover')
    this.#options.serverMaxWindowBits = extensions.get('server_max_window_bits')
  }

  decompress (chunk, fin, callback) {
    // An endpoint uses the following algorithm to decompress a message.
    // 1.  Append 4 octets of 0x00 0x00 0xff 0xff to the tail end of the
    //     payload of the message.
    // 2.  Decompress the resulting data using DEFLATE.

    if (this.#aborted) {
      callback(new MessageSizeExceededError())
      return
    }

    if (!this.#inflate) {
      let windowBits = Z_DEFAULT_WINDOWBITS

      if (this.#options.serverMaxWindowBits) { // empty values default to Z_DEFAULT_WINDOWBITS
        if (!isValidClientWindowBits(this.#options.serverMaxWindowBits)) {
          callback(new Error('Invalid server_max_window_bits'))
          return
        }

        windowBits = Number.parseInt(this.#options.serverMaxWindowBits)
      }

      try {
        this.#inflate = createInflateRaw({ windowBits })
      } catch (err) {
        callback(err)
        return
      }
      this.#inflate[kBuffer] = []
      this.#inflate[kLength] = 0

      this.#inflate.on('data', (data) => {
        if (this.#aborted) {
          return
        }

        this.#inflate[kLength] += data.length

        if (this.#inflate[kLength] > kDefaultMaxDecompressedSize) {
          this.#aborted = true
          this.#inflate.removeAllListeners()
          this.#inflate.destroy()
          this.#inflate = null

          if (this.#currentCallback) {
            const cb = this.#currentCallback
            this.#currentCallback = null
            cb(new MessageSizeExceededError())
          }
          return
        }

        this.#inflate[kBuffer].push(data)
      })

      this.#inflate.on('error', (err) => {
        this.#inflate = null
        callback(err)
      })
    }

    this.#currentCallback = callback
    this.#inflate.write(chunk)
    if (fin) {
      this.#inflate.write(tail)
    }

    this.#inflate.flush(() => {
      if (this.#aborted || !this.#inflate) {
        return
      }

      const full = Buffer.concat(this.#inflate[kBuffer], this.#inflate[kLength])

      this.#inflate[kBuffer].length = 0
      this.#inflate[kLength] = 0
      this.#currentCallback = null

      callback(null, full)
    })
  }
}

module.exports = { PerMessageDeflate }


/***/ }),

/***/ 6114:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { Writable } = __nccwpck_require__(4492)
const assert = __nccwpck_require__(8061)
const { parserStates, opcodes, states, emptyBuffer, sentCloseFrameState } = __nccwpck_require__(5421)
const { kReadyState, kSentClose, kResponse, kReceivedClose } = __nccwpck_require__(4227)
const { channels } = __nccwpck_require__(7055)
const {
  isValidStatusCode,
  isValidOpcode,
  failWebsocketConnection,
  websocketMessageReceived,
  utf8Decode,
  isControlFrame,
  isTextBinaryFrame,
  isContinuationFrame
} = __nccwpck_require__(404)
const { WebsocketFrameSend } = __nccwpck_require__(9730)
const { closeWebSocketConnection } = __nccwpck_require__(6641)
const { PerMessageDeflate } = __nccwpck_require__(7104)

// This code was influenced by ws released under the MIT license.
// Copyright (c) 2011 Einar Otto Stangvik <einaros@gmail.com>
// Copyright (c) 2013 Arnout Kazemier and contributors
// Copyright (c) 2016 Luigi Pinca and contributors

class ByteParser extends Writable {
  #buffers = []
  #byteOffset = 0
  #loop = false

  #state = parserStates.INFO

  #info = {}
  #fragments = []

  /** @type {Map<string, PerMessageDeflate>} */
  #extensions

  /**
   * @param {import('./websocket').WebSocket} ws
   * @param {Map<string, string>|null} extensions
   */
  constructor (ws, extensions) {
    super()

    this.ws = ws
    this.#extensions = extensions == null ? new Map() : extensions

    if (this.#extensions.has('permessage-deflate')) {
      this.#extensions.set('permessage-deflate', new PerMessageDeflate(extensions))
    }
  }

  /**
   * @param {Buffer} chunk
   * @param {() => void} callback
   */
  _write (chunk, _, callback) {
    this.#buffers.push(chunk)
    this.#byteOffset += chunk.length
    this.#loop = true

    this.run(callback)
  }

  /**
   * Runs whenever a new chunk is received.
   * Callback is called whenever there are no more chunks buffering,
   * or not enough bytes are buffered to parse.
   */
  run (callback) {
    while (this.#loop) {
      if (this.#state === parserStates.INFO) {
        // If there aren't enough bytes to parse the payload length, etc.
        if (this.#byteOffset < 2) {
          return callback()
        }

        const buffer = this.consume(2)
        const fin = (buffer[0] & 0x80) !== 0
        const opcode = buffer[0] & 0x0F
        const masked = (buffer[1] & 0x80) === 0x80

        const fragmented = !fin && opcode !== opcodes.CONTINUATION
        const payloadLength = buffer[1] & 0x7F

        const rsv1 = buffer[0] & 0x40
        const rsv2 = buffer[0] & 0x20
        const rsv3 = buffer[0] & 0x10

        if (!isValidOpcode(opcode)) {
          failWebsocketConnection(this.ws, 'Invalid opcode received')
          return callback()
        }

        if (masked) {
          failWebsocketConnection(this.ws, 'Frame cannot be masked')
          return callback()
        }

        // MUST be 0 unless an extension is negotiated that defines meanings
        // for non-zero values.  If a nonzero value is received and none of
        // the negotiated extensions defines the meaning of such a nonzero
        // value, the receiving endpoint MUST _Fail the WebSocket
        // Connection_.
        // This document allocates the RSV1 bit of the WebSocket header for
        // PMCEs and calls the bit the "Per-Message Compressed" bit.  On a
        // WebSocket connection where a PMCE is in use, this bit indicates
        // whether a message is compressed or not.
        if (rsv1 !== 0 && !this.#extensions.has('permessage-deflate')) {
          failWebsocketConnection(this.ws, 'Expected RSV1 to be clear.')
          return
        }

        if (rsv2 !== 0 || rsv3 !== 0) {
          failWebsocketConnection(this.ws, 'RSV1, RSV2, RSV3 must be clear')
          return
        }

        if (fragmented && !isTextBinaryFrame(opcode)) {
          // Only text and binary frames can be fragmented
          failWebsocketConnection(this.ws, 'Invalid frame type was fragmented.')
          return
        }

        // If we are already parsing a text/binary frame and do not receive either
        // a continuation frame or close frame, fail the connection.
        if (isTextBinaryFrame(opcode) && this.#fragments.length > 0) {
          failWebsocketConnection(this.ws, 'Expected continuation frame')
          return
        }

        if (this.#info.fragmented && fragmented) {
          // A fragmented frame can't be fragmented itself
          failWebsocketConnection(this.ws, 'Fragmented frame exceeded 125 bytes.')
          return
        }

        // "All control frames MUST have a payload length of 125 bytes or less
        // and MUST NOT be fragmented."
        if ((payloadLength > 125 || fragmented) && isControlFrame(opcode)) {
          failWebsocketConnection(this.ws, 'Control frame either too large or fragmented')
          return
        }

        if (isContinuationFrame(opcode) && this.#fragments.length === 0 && !this.#info.compressed) {
          failWebsocketConnection(this.ws, 'Unexpected continuation frame')
          return
        }

        if (payloadLength <= 125) {
          this.#info.payloadLength = payloadLength
          this.#state = parserStates.READ_DATA
        } else if (payloadLength === 126) {
          this.#state = parserStates.PAYLOADLENGTH_16
        } else if (payloadLength === 127) {
          this.#state = parserStates.PAYLOADLENGTH_64
        }

        if (isTextBinaryFrame(opcode)) {
          this.#info.binaryType = opcode
          this.#info.compressed = rsv1 !== 0
        }

        this.#info.opcode = opcode
        this.#info.masked = masked
        this.#info.fin = fin
        this.#info.fragmented = fragmented
      } else if (this.#state === parserStates.PAYLOADLENGTH_16) {
        if (this.#byteOffset < 2) {
          return callback()
        }

        const buffer = this.consume(2)

        this.#info.payloadLength = buffer.readUInt16BE(0)
        this.#state = parserStates.READ_DATA
      } else if (this.#state === parserStates.PAYLOADLENGTH_64) {
        if (this.#byteOffset < 8) {
          return callback()
        }

        const buffer = this.consume(8)
        const upper = buffer.readUInt32BE(0)
        const lower = buffer.readUInt32BE(4)

        // 2^31 is the maximum bytes an arraybuffer can contain
        // on 32-bit systems. Although, on 64-bit systems, this is
        // 2^53-1 bytes.
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_array_length
        // https://source.chromium.org/chromium/chromium/src/+/main:v8/src/common/globals.h;drc=1946212ac0100668f14eb9e2843bdd846e510a1e;bpv=1;bpt=1;l=1275
        // https://source.chromium.org/chromium/chromium/src/+/main:v8/src/objects/js-array-buffer.h;l=34;drc=1946212ac0100668f14eb9e2843bdd846e510a1e
        if (upper !== 0 || lower > 2 ** 31 - 1) {
          failWebsocketConnection(this.ws, 'Received payload length > 2^31 bytes.')
          return
        }

        this.#info.payloadLength = lower
        this.#state = parserStates.READ_DATA
      } else if (this.#state === parserStates.READ_DATA) {
        if (this.#byteOffset < this.#info.payloadLength) {
          return callback()
        }

        const body = this.consume(this.#info.payloadLength)

        if (isControlFrame(this.#info.opcode)) {
          this.#loop = this.parseControlFrame(body)
          this.#state = parserStates.INFO
        } else {
          if (!this.#info.compressed) {
            this.#fragments.push(body)

            // If the frame is not fragmented, a message has been received.
            // If the frame is fragmented, it will terminate with a fin bit set
            // and an opcode of 0 (continuation), therefore we handle that when
            // parsing continuation frames, not here.
            if (!this.#info.fragmented && this.#info.fin) {
              const fullMessage = Buffer.concat(this.#fragments)
              websocketMessageReceived(this.ws, this.#info.binaryType, fullMessage)
              this.#fragments.length = 0
            }

            this.#state = parserStates.INFO
          } else {
            this.#extensions.get('permessage-deflate').decompress(body, this.#info.fin, (error, data) => {
              if (error) {
                failWebsocketConnection(this.ws, error.message)
                return
              }

              this.#fragments.push(data)

              if (!this.#info.fin) {
                this.#state = parserStates.INFO
                this.#loop = true
                this.run(callback)
                return
              }

              websocketMessageReceived(this.ws, this.#info.binaryType, Buffer.concat(this.#fragments))

              this.#loop = true
              this.#state = parserStates.INFO
              this.#fragments.length = 0
              this.run(callback)
            })

            this.#loop = false
            break
          }
        }
      }
    }
  }

  /**
   * Take n bytes from the buffered Buffers
   * @param {number} n
   * @returns {Buffer}
   */
  consume (n) {
    if (n > this.#byteOffset) {
      throw new Error('Called consume() before buffers satiated.')
    } else if (n === 0) {
      return emptyBuffer
    }

    if (this.#buffers[0].length === n) {
      this.#byteOffset -= this.#buffers[0].length
      return this.#buffers.shift()
    }

    const buffer = Buffer.allocUnsafe(n)
    let offset = 0

    while (offset !== n) {
      const next = this.#buffers[0]
      const { length } = next

      if (length + offset === n) {
        buffer.set(this.#buffers.shift(), offset)
        break
      } else if (length + offset > n) {
        buffer.set(next.subarray(0, n - offset), offset)
        this.#buffers[0] = next.subarray(n - offset)
        break
      } else {
        buffer.set(this.#buffers.shift(), offset)
        offset += next.length
      }
    }

    this.#byteOffset -= n

    return buffer
  }

  parseCloseBody (data) {
    assert(data.length !== 1)

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.5
    /** @type {number|undefined} */
    let code

    if (data.length >= 2) {
      // _The WebSocket Connection Close Code_ is
      // defined as the status code (Section 7.4) contained in the first Close
      // control frame received by the application
      code = data.readUInt16BE(0)
    }

    if (code !== undefined && !isValidStatusCode(code)) {
      return { code: 1002, reason: 'Invalid status code', error: true }
    }

    // https://datatracker.ietf.org/doc/html/rfc6455#section-7.1.6
    /** @type {Buffer} */
    let reason = data.subarray(2)

    // Remove BOM
    if (reason[0] === 0xEF && reason[1] === 0xBB && reason[2] === 0xBF) {
      reason = reason.subarray(3)
    }

    try {
      reason = utf8Decode(reason)
    } catch {
      return { code: 1007, reason: 'Invalid UTF-8', error: true }
    }

    return { code, reason, error: false }
  }

  /**
   * Parses control frames.
   * @param {Buffer} body
   */
  parseControlFrame (body) {
    const { opcode, payloadLength } = this.#info

    if (opcode === opcodes.CLOSE) {
      if (payloadLength === 1) {
        failWebsocketConnection(this.ws, 'Received close frame with a 1-byte body.')
        return false
      }

      this.#info.closeInfo = this.parseCloseBody(body)

      if (this.#info.closeInfo.error) {
        const { code, reason } = this.#info.closeInfo

        closeWebSocketConnection(this.ws, code, reason, reason.length)
        failWebsocketConnection(this.ws, reason)
        return false
      }

      if (this.ws[kSentClose] !== sentCloseFrameState.SENT) {
        // If an endpoint receives a Close frame and did not previously send a
        // Close frame, the endpoint MUST send a Close frame in response.  (When
        // sending a Close frame in response, the endpoint typically echos the
        // status code it received.)
        let body = emptyBuffer
        if (this.#info.closeInfo.code) {
          body = Buffer.allocUnsafe(2)
          body.writeUInt16BE(this.#info.closeInfo.code, 0)
        }
        const closeFrame = new WebsocketFrameSend(body)

        this.ws[kResponse].socket.write(
          closeFrame.createFrame(opcodes.CLOSE),
          (err) => {
            if (!err) {
              this.ws[kSentClose] = sentCloseFrameState.SENT
            }
          }
        )
      }

      // Upon either sending or receiving a Close control frame, it is said
      // that _The WebSocket Closing Handshake is Started_ and that the
      // WebSocket connection is in the CLOSING state.
      this.ws[kReadyState] = states.CLOSING
      this.ws[kReceivedClose] = true

      return false
    } else if (opcode === opcodes.PING) {
      // Upon receipt of a Ping frame, an endpoint MUST send a Pong frame in
      // response, unless it already received a Close frame.
      // A Pong frame sent in response to a Ping frame must have identical
      // "Application data"

      if (!this.ws[kReceivedClose]) {
        const frame = new WebsocketFrameSend(body)

        this.ws[kResponse].socket.write(frame.createFrame(opcodes.PONG))

        if (channels.ping.hasSubscribers) {
          channels.ping.publish({
            payload: body
          })
        }
      }
    } else if (opcode === opcodes.PONG) {
      // A Pong frame MAY be sent unsolicited.  This serves as a
      // unidirectional heartbeat.  A response to an unsolicited Pong frame is
      // not expected.

      if (channels.pong.hasSubscribers) {
        channels.pong.publish({
          payload: body
        })
      }
    }

    return true
  }

  get closingInfo () {
    return this.#info.closeInfo
  }
}

module.exports = {
  ByteParser
}


/***/ }),

/***/ 7881:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { WebsocketFrameSend } = __nccwpck_require__(9730)
const { opcodes, sendHints } = __nccwpck_require__(5421)
const FixedQueue = __nccwpck_require__(3039)

/** @type {typeof Uint8Array} */
const FastBuffer = Buffer[Symbol.species]

/**
 * @typedef {object} SendQueueNode
 * @property {Promise<void> | null} promise
 * @property {((...args: any[]) => any)} callback
 * @property {Buffer | null} frame
 */

class SendQueue {
  /**
   * @type {FixedQueue}
   */
  #queue = new FixedQueue()

  /**
   * @type {boolean}
   */
  #running = false

  /** @type {import('node:net').Socket} */
  #socket

  constructor (socket) {
    this.#socket = socket
  }

  add (item, cb, hint) {
    if (hint !== sendHints.blob) {
      const frame = createFrame(item, hint)
      if (!this.#running) {
        // fast-path
        this.#socket.write(frame, cb)
      } else {
        /** @type {SendQueueNode} */
        const node = {
          promise: null,
          callback: cb,
          frame
        }
        this.#queue.push(node)
      }
      return
    }

    /** @type {SendQueueNode} */
    const node = {
      promise: item.arrayBuffer().then((ab) => {
        node.promise = null
        node.frame = createFrame(ab, hint)
      }),
      callback: cb,
      frame: null
    }

    this.#queue.push(node)

    if (!this.#running) {
      this.#run()
    }
  }

  async #run () {
    this.#running = true
    const queue = this.#queue
    while (!queue.isEmpty()) {
      const node = queue.shift()
      // wait pending promise
      if (node.promise !== null) {
        await node.promise
      }
      // write
      this.#socket.write(node.frame, node.callback)
      // cleanup
      node.callback = node.frame = null
    }
    this.#running = false
  }
}

function createFrame (data, hint) {
  return new WebsocketFrameSend(toBuffer(data, hint)).createFrame(hint === sendHints.string ? opcodes.TEXT : opcodes.BINARY)
}

function toBuffer (data, hint) {
  switch (hint) {
    case sendHints.string:
      return Buffer.from(data)
    case sendHints.arrayBuffer:
    case sendHints.blob:
      return new FastBuffer(data)
    case sendHints.typedArray:
      return new FastBuffer(data.buffer, data.byteOffset, data.byteLength)
  }
}

module.exports = { SendQueue }


/***/ }),

/***/ 4227:
/***/ ((module) => {

"use strict";


module.exports = {
  kWebSocketURL: Symbol('url'),
  kReadyState: Symbol('ready state'),
  kController: Symbol('controller'),
  kResponse: Symbol('response'),
  kBinaryType: Symbol('binary type'),
  kSentClose: Symbol('sent close'),
  kReceivedClose: Symbol('received close'),
  kByteParser: Symbol('byte parser')
}


/***/ }),

/***/ 404:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { kReadyState, kController, kResponse, kBinaryType, kWebSocketURL } = __nccwpck_require__(4227)
const { states, opcodes } = __nccwpck_require__(5421)
const { ErrorEvent, createFastMessageEvent } = __nccwpck_require__(1225)
const { isUtf8 } = __nccwpck_require__(2254)
const { collectASequenceOfCodePointsFast, removeHTTPWhitespace } = __nccwpck_require__(5253)

/* globals Blob */

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isConnecting (ws) {
  // If the WebSocket connection is not yet established, and the connection
  // is not yet closed, then the WebSocket connection is in the CONNECTING state.
  return ws[kReadyState] === states.CONNECTING
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isEstablished (ws) {
  // If the server's response is validated as provided for above, it is
  // said that _The WebSocket Connection is Established_ and that the
  // WebSocket Connection is in the OPEN state.
  return ws[kReadyState] === states.OPEN
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isClosing (ws) {
  // Upon either sending or receiving a Close control frame, it is said
  // that _The WebSocket Closing Handshake is Started_ and that the
  // WebSocket connection is in the CLOSING state.
  return ws[kReadyState] === states.CLOSING
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @returns {boolean}
 */
function isClosed (ws) {
  return ws[kReadyState] === states.CLOSED
}

/**
 * @see https://dom.spec.whatwg.org/#concept-event-fire
 * @param {string} e
 * @param {EventTarget} target
 * @param {(...args: ConstructorParameters<typeof Event>) => Event} eventFactory
 * @param {EventInit | undefined} eventInitDict
 */
function fireEvent (e, target, eventFactory = (type, init) => new Event(type, init), eventInitDict = {}) {
  // 1. If eventConstructor is not given, then let eventConstructor be Event.

  // 2. Let event be the result of creating an event given eventConstructor,
  //    in the relevant realm of target.
  // 3. Initialize event’s type attribute to e.
  const event = eventFactory(e, eventInitDict)

  // 4. Initialize any other IDL attributes of event as described in the
  //    invocation of this algorithm.

  // 5. Return the result of dispatching event at target, with legacy target
  //    override flag set if set.
  target.dispatchEvent(event)
}

/**
 * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
 * @param {import('./websocket').WebSocket} ws
 * @param {number} type Opcode
 * @param {Buffer} data application data
 */
function websocketMessageReceived (ws, type, data) {
  // 1. If ready state is not OPEN (1), then return.
  if (ws[kReadyState] !== states.OPEN) {
    return
  }

  // 2. Let dataForEvent be determined by switching on type and binary type:
  let dataForEvent

  if (type === opcodes.TEXT) {
    // -> type indicates that the data is Text
    //      a new DOMString containing data
    try {
      dataForEvent = utf8Decode(data)
    } catch {
      failWebsocketConnection(ws, 'Received invalid UTF-8 in text frame.')
      return
    }
  } else if (type === opcodes.BINARY) {
    if (ws[kBinaryType] === 'blob') {
      // -> type indicates that the data is Binary and binary type is "blob"
      //      a new Blob object, created in the relevant Realm of the WebSocket
      //      object, that represents data as its raw data
      dataForEvent = new Blob([data])
    } else {
      // -> type indicates that the data is Binary and binary type is "arraybuffer"
      //      a new ArrayBuffer object, created in the relevant Realm of the
      //      WebSocket object, whose contents are data
      dataForEvent = toArrayBuffer(data)
    }
  }

  // 3. Fire an event named message at the WebSocket object, using MessageEvent,
  //    with the origin attribute initialized to the serialization of the WebSocket
  //    object’s url's origin, and the data attribute initialized to dataForEvent.
  fireEvent('message', ws, createFastMessageEvent, {
    origin: ws[kWebSocketURL].origin,
    data: dataForEvent
  })
}

function toArrayBuffer (buffer) {
  if (buffer.byteLength === buffer.buffer.byteLength) {
    return buffer.buffer
  }
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455
 * @see https://datatracker.ietf.org/doc/html/rfc2616
 * @see https://bugs.chromium.org/p/chromium/issues/detail?id=398407
 * @param {string} protocol
 */
function isValidSubprotocol (protocol) {
  // If present, this value indicates one
  // or more comma-separated subprotocol the client wishes to speak,
  // ordered by preference.  The elements that comprise this value
  // MUST be non-empty strings with characters in the range U+0021 to
  // U+007E not including separator characters as defined in
  // [RFC2616] and MUST all be unique strings.
  if (protocol.length === 0) {
    return false
  }

  for (let i = 0; i < protocol.length; ++i) {
    const code = protocol.charCodeAt(i)

    if (
      code < 0x21 || // CTL, contains SP (0x20) and HT (0x09)
      code > 0x7E ||
      code === 0x22 || // "
      code === 0x28 || // (
      code === 0x29 || // )
      code === 0x2C || // ,
      code === 0x2F || // /
      code === 0x3A || // :
      code === 0x3B || // ;
      code === 0x3C || // <
      code === 0x3D || // =
      code === 0x3E || // >
      code === 0x3F || // ?
      code === 0x40 || // @
      code === 0x5B || // [
      code === 0x5C || // \
      code === 0x5D || // ]
      code === 0x7B || // {
      code === 0x7D // }
    ) {
      return false
    }
  }

  return true
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-7-4
 * @param {number} code
 */
function isValidStatusCode (code) {
  if (code >= 1000 && code < 1015) {
    return (
      code !== 1004 && // reserved
      code !== 1005 && // "MUST NOT be set as a status code"
      code !== 1006 // "MUST NOT be set as a status code"
    )
  }

  return code >= 3000 && code <= 4999
}

/**
 * @param {import('./websocket').WebSocket} ws
 * @param {string|undefined} reason
 */
function failWebsocketConnection (ws, reason) {
  const { [kController]: controller, [kResponse]: response } = ws

  controller.abort()

  if (response?.socket && !response.socket.destroyed) {
    response.socket.destroy()
  }

  if (reason) {
    // TODO: process.nextTick
    fireEvent('error', ws, (type, init) => new ErrorEvent(type, init), {
      error: new Error(reason),
      message: reason
    })
  }
}

/**
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-5.5
 * @param {number} opcode
 */
function isControlFrame (opcode) {
  return (
    opcode === opcodes.CLOSE ||
    opcode === opcodes.PING ||
    opcode === opcodes.PONG
  )
}

function isContinuationFrame (opcode) {
  return opcode === opcodes.CONTINUATION
}

function isTextBinaryFrame (opcode) {
  return opcode === opcodes.TEXT || opcode === opcodes.BINARY
}

function isValidOpcode (opcode) {
  return isTextBinaryFrame(opcode) || isContinuationFrame(opcode) || isControlFrame(opcode)
}

/**
 * Parses a Sec-WebSocket-Extensions header value.
 * @param {string} extensions
 * @returns {Map<string, string>}
 */
// TODO(@Uzlopak, @KhafraDev): make compliant https://datatracker.ietf.org/doc/html/rfc6455#section-9.1
function parseExtensions (extensions) {
  const position = { position: 0 }
  const extensionList = new Map()

  while (position.position < extensions.length) {
    const pair = collectASequenceOfCodePointsFast(';', extensions, position)
    const [name, value = ''] = pair.split('=')

    extensionList.set(
      removeHTTPWhitespace(name, true, false),
      removeHTTPWhitespace(value, false, true)
    )

    position.position++
  }

  return extensionList
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc7692#section-7.1.2.2
 * @description "client-max-window-bits = 1*DIGIT"
 * @param {string} value
 */
function isValidClientWindowBits (value) {
  // Must have at least one character
  if (value.length === 0) {
    return false
  }

  // Check all characters are ASCII digits
  for (let i = 0; i < value.length; i++) {
    const byte = value.charCodeAt(i)

    if (byte < 0x30 || byte > 0x39) {
      return false
    }
  }

  // Check numeric range: zlib requires windowBits in range 8-15
  const num = Number.parseInt(value, 10)
  return num >= 8 && num <= 15
}

// https://nodejs.org/api/intl.html#detecting-internationalization-support
const hasIntl = typeof process.versions.icu === 'string'
const fatalDecoder = hasIntl ? new TextDecoder('utf-8', { fatal: true }) : undefined

/**
 * Converts a Buffer to utf-8, even on platforms without icu.
 * @param {Buffer} buffer
 */
const utf8Decode = hasIntl
  ? fatalDecoder.decode.bind(fatalDecoder)
  : function (buffer) {
    if (isUtf8(buffer)) {
      return buffer.toString('utf-8')
    }
    throw new TypeError('Invalid utf-8 received.')
  }

module.exports = {
  isConnecting,
  isEstablished,
  isClosing,
  isClosed,
  fireEvent,
  isValidSubprotocol,
  isValidStatusCode,
  failWebsocketConnection,
  websocketMessageReceived,
  utf8Decode,
  isControlFrame,
  isContinuationFrame,
  isTextBinaryFrame,
  isValidOpcode,
  parseExtensions,
  isValidClientWindowBits
}


/***/ }),

/***/ 3419:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const { webidl } = __nccwpck_require__(9346)
const { URLSerializer } = __nccwpck_require__(5253)
const { environmentSettingsObject } = __nccwpck_require__(8185)
const { staticPropertyDescriptors, states, sentCloseFrameState, sendHints } = __nccwpck_require__(5421)
const {
  kWebSocketURL,
  kReadyState,
  kController,
  kBinaryType,
  kResponse,
  kSentClose,
  kByteParser
} = __nccwpck_require__(4227)
const {
  isConnecting,
  isEstablished,
  isClosing,
  isValidSubprotocol,
  fireEvent
} = __nccwpck_require__(404)
const { establishWebSocketConnection, closeWebSocketConnection } = __nccwpck_require__(6641)
const { ByteParser } = __nccwpck_require__(6114)
const { kEnumerableProperty, isBlobLike } = __nccwpck_require__(9099)
const { getGlobalDispatcher } = __nccwpck_require__(415)
const { types } = __nccwpck_require__(7261)
const { ErrorEvent, CloseEvent } = __nccwpck_require__(1225)
const { SendQueue } = __nccwpck_require__(7881)

// https://websockets.spec.whatwg.org/#interface-definition
class WebSocket extends EventTarget {
  #events = {
    open: null,
    error: null,
    close: null,
    message: null
  }

  #bufferedAmount = 0
  #protocol = ''
  #extensions = ''

  /** @type {SendQueue} */
  #sendQueue

  /**
   * @param {string} url
   * @param {string|string[]} protocols
   */
  constructor (url, protocols = []) {
    super()

    webidl.util.markAsUncloneable(this)

    const prefix = 'WebSocket constructor'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    const options = webidl.converters['DOMString or sequence<DOMString> or WebSocketInit'](protocols, prefix, 'options')

    url = webidl.converters.USVString(url, prefix, 'url')
    protocols = options.protocols

    // 1. Let baseURL be this's relevant settings object's API base URL.
    const baseURL = environmentSettingsObject.settingsObject.baseUrl

    // 1. Let urlRecord be the result of applying the URL parser to url with baseURL.
    let urlRecord

    try {
      urlRecord = new URL(url, baseURL)
    } catch (e) {
      // 3. If urlRecord is failure, then throw a "SyntaxError" DOMException.
      throw new DOMException(e, 'SyntaxError')
    }

    // 4. If urlRecord’s scheme is "http", then set urlRecord’s scheme to "ws".
    if (urlRecord.protocol === 'http:') {
      urlRecord.protocol = 'ws:'
    } else if (urlRecord.protocol === 'https:') {
      // 5. Otherwise, if urlRecord’s scheme is "https", set urlRecord’s scheme to "wss".
      urlRecord.protocol = 'wss:'
    }

    // 6. If urlRecord’s scheme is not "ws" or "wss", then throw a "SyntaxError" DOMException.
    if (urlRecord.protocol !== 'ws:' && urlRecord.protocol !== 'wss:') {
      throw new DOMException(
        `Expected a ws: or wss: protocol, got ${urlRecord.protocol}`,
        'SyntaxError'
      )
    }

    // 7. If urlRecord’s fragment is non-null, then throw a "SyntaxError"
    //    DOMException.
    if (urlRecord.hash || urlRecord.href.endsWith('#')) {
      throw new DOMException('Got fragment', 'SyntaxError')
    }

    // 8. If protocols is a string, set protocols to a sequence consisting
    //    of just that string.
    if (typeof protocols === 'string') {
      protocols = [protocols]
    }

    // 9. If any of the values in protocols occur more than once or otherwise
    //    fail to match the requirements for elements that comprise the value
    //    of `Sec-WebSocket-Protocol` fields as defined by The WebSocket
    //    protocol, then throw a "SyntaxError" DOMException.
    if (protocols.length !== new Set(protocols.map(p => p.toLowerCase())).size) {
      throw new DOMException('Invalid Sec-WebSocket-Protocol value', 'SyntaxError')
    }

    if (protocols.length > 0 && !protocols.every(p => isValidSubprotocol(p))) {
      throw new DOMException('Invalid Sec-WebSocket-Protocol value', 'SyntaxError')
    }

    // 10. Set this's url to urlRecord.
    this[kWebSocketURL] = new URL(urlRecord.href)

    // 11. Let client be this's relevant settings object.
    const client = environmentSettingsObject.settingsObject

    // 12. Run this step in parallel:

    //    1. Establish a WebSocket connection given urlRecord, protocols,
    //       and client.
    this[kController] = establishWebSocketConnection(
      urlRecord,
      protocols,
      client,
      this,
      (response, extensions) => this.#onConnectionEstablished(response, extensions),
      options
    )

    // Each WebSocket object has an associated ready state, which is a
    // number representing the state of the connection. Initially it must
    // be CONNECTING (0).
    this[kReadyState] = WebSocket.CONNECTING

    this[kSentClose] = sentCloseFrameState.NOT_SENT

    // The extensions attribute must initially return the empty string.

    // The protocol attribute must initially return the empty string.

    // Each WebSocket object has an associated binary type, which is a
    // BinaryType. Initially it must be "blob".
    this[kBinaryType] = 'blob'
  }

  /**
   * @see https://websockets.spec.whatwg.org/#dom-websocket-close
   * @param {number|undefined} code
   * @param {string|undefined} reason
   */
  close (code = undefined, reason = undefined) {
    webidl.brandCheck(this, WebSocket)

    const prefix = 'WebSocket.close'

    if (code !== undefined) {
      code = webidl.converters['unsigned short'](code, prefix, 'code', { clamp: true })
    }

    if (reason !== undefined) {
      reason = webidl.converters.USVString(reason, prefix, 'reason')
    }

    // 1. If code is present, but is neither an integer equal to 1000 nor an
    //    integer in the range 3000 to 4999, inclusive, throw an
    //    "InvalidAccessError" DOMException.
    if (code !== undefined) {
      if (code !== 1000 && (code < 3000 || code > 4999)) {
        throw new DOMException('invalid code', 'InvalidAccessError')
      }
    }

    let reasonByteLength = 0

    // 2. If reason is present, then run these substeps:
    if (reason !== undefined) {
      // 1. Let reasonBytes be the result of encoding reason.
      // 2. If reasonBytes is longer than 123 bytes, then throw a
      //    "SyntaxError" DOMException.
      reasonByteLength = Buffer.byteLength(reason)

      if (reasonByteLength > 123) {
        throw new DOMException(
          `Reason must be less than 123 bytes; received ${reasonByteLength}`,
          'SyntaxError'
        )
      }
    }

    // 3. Run the first matching steps from the following list:
    closeWebSocketConnection(this, code, reason, reasonByteLength)
  }

  /**
   * @see https://websockets.spec.whatwg.org/#dom-websocket-send
   * @param {NodeJS.TypedArray|ArrayBuffer|Blob|string} data
   */
  send (data) {
    webidl.brandCheck(this, WebSocket)

    const prefix = 'WebSocket.send'
    webidl.argumentLengthCheck(arguments, 1, prefix)

    data = webidl.converters.WebSocketSendData(data, prefix, 'data')

    // 1. If this's ready state is CONNECTING, then throw an
    //    "InvalidStateError" DOMException.
    if (isConnecting(this)) {
      throw new DOMException('Sent before connected.', 'InvalidStateError')
    }

    // 2. Run the appropriate set of steps from the following list:
    // https://datatracker.ietf.org/doc/html/rfc6455#section-6.1
    // https://datatracker.ietf.org/doc/html/rfc6455#section-5.2

    if (!isEstablished(this) || isClosing(this)) {
      return
    }

    // If data is a string
    if (typeof data === 'string') {
      // If the WebSocket connection is established and the WebSocket
      // closing handshake has not yet started, then the user agent
      // must send a WebSocket Message comprised of the data argument
      // using a text frame opcode; if the data cannot be sent, e.g.
      // because it would need to be buffered but the buffer is full,
      // the user agent must flag the WebSocket as full and then close
      // the WebSocket connection. Any invocation of this method with a
      // string argument that does not throw an exception must increase
      // the bufferedAmount attribute by the number of bytes needed to
      // express the argument as UTF-8.

      const length = Buffer.byteLength(data)

      this.#bufferedAmount += length
      this.#sendQueue.add(data, () => {
        this.#bufferedAmount -= length
      }, sendHints.string)
    } else if (types.isArrayBuffer(data)) {
      // If the WebSocket connection is established, and the WebSocket
      // closing handshake has not yet started, then the user agent must
      // send a WebSocket Message comprised of data using a binary frame
      // opcode; if the data cannot be sent, e.g. because it would need
      // to be buffered but the buffer is full, the user agent must flag
      // the WebSocket as full and then close the WebSocket connection.
      // The data to be sent is the data stored in the buffer described
      // by the ArrayBuffer object. Any invocation of this method with an
      // ArrayBuffer argument that does not throw an exception must
      // increase the bufferedAmount attribute by the length of the
      // ArrayBuffer in bytes.

      this.#bufferedAmount += data.byteLength
      this.#sendQueue.add(data, () => {
        this.#bufferedAmount -= data.byteLength
      }, sendHints.arrayBuffer)
    } else if (ArrayBuffer.isView(data)) {
      // If the WebSocket connection is established, and the WebSocket
      // closing handshake has not yet started, then the user agent must
      // send a WebSocket Message comprised of data using a binary frame
      // opcode; if the data cannot be sent, e.g. because it would need to
      // be buffered but the buffer is full, the user agent must flag the
      // WebSocket as full and then close the WebSocket connection. The
      // data to be sent is the data stored in the section of the buffer
      // described by the ArrayBuffer object that data references. Any
      // invocation of this method with this kind of argument that does
      // not throw an exception must increase the bufferedAmount attribute
      // by the length of data’s buffer in bytes.

      this.#bufferedAmount += data.byteLength
      this.#sendQueue.add(data, () => {
        this.#bufferedAmount -= data.byteLength
      }, sendHints.typedArray)
    } else if (isBlobLike(data)) {
      // If the WebSocket connection is established, and the WebSocket
      // closing handshake has not yet started, then the user agent must
      // send a WebSocket Message comprised of data using a binary frame
      // opcode; if the data cannot be sent, e.g. because it would need to
      // be buffered but the buffer is full, the user agent must flag the
      // WebSocket as full and then close the WebSocket connection. The data
      // to be sent is the raw data represented by the Blob object. Any
      // invocation of this method with a Blob argument that does not throw
      // an exception must increase the bufferedAmount attribute by the size
      // of the Blob object’s raw data, in bytes.

      this.#bufferedAmount += data.size
      this.#sendQueue.add(data, () => {
        this.#bufferedAmount -= data.size
      }, sendHints.blob)
    }
  }

  get readyState () {
    webidl.brandCheck(this, WebSocket)

    // The readyState getter steps are to return this's ready state.
    return this[kReadyState]
  }

  get bufferedAmount () {
    webidl.brandCheck(this, WebSocket)

    return this.#bufferedAmount
  }

  get url () {
    webidl.brandCheck(this, WebSocket)

    // The url getter steps are to return this's url, serialized.
    return URLSerializer(this[kWebSocketURL])
  }

  get extensions () {
    webidl.brandCheck(this, WebSocket)

    return this.#extensions
  }

  get protocol () {
    webidl.brandCheck(this, WebSocket)

    return this.#protocol
  }

  get onopen () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.open
  }

  set onopen (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.open) {
      this.removeEventListener('open', this.#events.open)
    }

    if (typeof fn === 'function') {
      this.#events.open = fn
      this.addEventListener('open', fn)
    } else {
      this.#events.open = null
    }
  }

  get onerror () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.error
  }

  set onerror (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.error) {
      this.removeEventListener('error', this.#events.error)
    }

    if (typeof fn === 'function') {
      this.#events.error = fn
      this.addEventListener('error', fn)
    } else {
      this.#events.error = null
    }
  }

  get onclose () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.close
  }

  set onclose (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.close) {
      this.removeEventListener('close', this.#events.close)
    }

    if (typeof fn === 'function') {
      this.#events.close = fn
      this.addEventListener('close', fn)
    } else {
      this.#events.close = null
    }
  }

  get onmessage () {
    webidl.brandCheck(this, WebSocket)

    return this.#events.message
  }

  set onmessage (fn) {
    webidl.brandCheck(this, WebSocket)

    if (this.#events.message) {
      this.removeEventListener('message', this.#events.message)
    }

    if (typeof fn === 'function') {
      this.#events.message = fn
      this.addEventListener('message', fn)
    } else {
      this.#events.message = null
    }
  }

  get binaryType () {
    webidl.brandCheck(this, WebSocket)

    return this[kBinaryType]
  }

  set binaryType (type) {
    webidl.brandCheck(this, WebSocket)

    if (type !== 'blob' && type !== 'arraybuffer') {
      this[kBinaryType] = 'blob'
    } else {
      this[kBinaryType] = type
    }
  }

  /**
   * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
   */
  #onConnectionEstablished (response, parsedExtensions) {
    // processResponse is called when the "response's header list has been received and initialized."
    // once this happens, the connection is open
    this[kResponse] = response

    const parser = new ByteParser(this, parsedExtensions)
    parser.on('drain', onParserDrain)
    parser.on('error', onParserError.bind(this))

    response.socket.ws = this
    this[kByteParser] = parser

    this.#sendQueue = new SendQueue(response.socket)

    // 1. Change the ready state to OPEN (1).
    this[kReadyState] = states.OPEN

    // 2. Change the extensions attribute’s value to the extensions in use, if
    //    it is not the null value.
    // https://datatracker.ietf.org/doc/html/rfc6455#section-9.1
    const extensions = response.headersList.get('sec-websocket-extensions')

    if (extensions !== null) {
      this.#extensions = extensions
    }

    // 3. Change the protocol attribute’s value to the subprotocol in use, if
    //    it is not the null value.
    // https://datatracker.ietf.org/doc/html/rfc6455#section-1.9
    const protocol = response.headersList.get('sec-websocket-protocol')

    if (protocol !== null) {
      this.#protocol = protocol
    }

    // 4. Fire an event named open at the WebSocket object.
    fireEvent('open', this)
  }
}

// https://websockets.spec.whatwg.org/#dom-websocket-connecting
WebSocket.CONNECTING = WebSocket.prototype.CONNECTING = states.CONNECTING
// https://websockets.spec.whatwg.org/#dom-websocket-open
WebSocket.OPEN = WebSocket.prototype.OPEN = states.OPEN
// https://websockets.spec.whatwg.org/#dom-websocket-closing
WebSocket.CLOSING = WebSocket.prototype.CLOSING = states.CLOSING
// https://websockets.spec.whatwg.org/#dom-websocket-closed
WebSocket.CLOSED = WebSocket.prototype.CLOSED = states.CLOSED

Object.defineProperties(WebSocket.prototype, {
  CONNECTING: staticPropertyDescriptors,
  OPEN: staticPropertyDescriptors,
  CLOSING: staticPropertyDescriptors,
  CLOSED: staticPropertyDescriptors,
  url: kEnumerableProperty,
  readyState: kEnumerableProperty,
  bufferedAmount: kEnumerableProperty,
  onopen: kEnumerableProperty,
  onerror: kEnumerableProperty,
  onclose: kEnumerableProperty,
  close: kEnumerableProperty,
  onmessage: kEnumerableProperty,
  binaryType: kEnumerableProperty,
  send: kEnumerableProperty,
  extensions: kEnumerableProperty,
  protocol: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'WebSocket',
    writable: false,
    enumerable: false,
    configurable: true
  }
})

Object.defineProperties(WebSocket, {
  CONNECTING: staticPropertyDescriptors,
  OPEN: staticPropertyDescriptors,
  CLOSING: staticPropertyDescriptors,
  CLOSED: staticPropertyDescriptors
})

webidl.converters['sequence<DOMString>'] = webidl.sequenceConverter(
  webidl.converters.DOMString
)

webidl.converters['DOMString or sequence<DOMString>'] = function (V, prefix, argument) {
  if (webidl.util.Type(V) === 'Object' && Symbol.iterator in V) {
    return webidl.converters['sequence<DOMString>'](V)
  }

  return webidl.converters.DOMString(V, prefix, argument)
}

// This implements the proposal made in https://github.com/whatwg/websockets/issues/42
webidl.converters.WebSocketInit = webidl.dictionaryConverter([
  {
    key: 'protocols',
    converter: webidl.converters['DOMString or sequence<DOMString>'],
    defaultValue: () => new Array(0)
  },
  {
    key: 'dispatcher',
    converter: webidl.converters.any,
    defaultValue: () => getGlobalDispatcher()
  },
  {
    key: 'headers',
    converter: webidl.nullableConverter(webidl.converters.HeadersInit)
  }
])

webidl.converters['DOMString or sequence<DOMString> or WebSocketInit'] = function (V) {
  if (webidl.util.Type(V) === 'Object' && !(Symbol.iterator in V)) {
    return webidl.converters.WebSocketInit(V)
  }

  return { protocols: webidl.converters['DOMString or sequence<DOMString>'](V) }
}

webidl.converters.WebSocketSendData = function (V) {
  if (webidl.util.Type(V) === 'Object') {
    if (isBlobLike(V)) {
      return webidl.converters.Blob(V, { strict: false })
    }

    if (ArrayBuffer.isView(V) || types.isArrayBuffer(V)) {
      return webidl.converters.BufferSource(V)
    }
  }

  return webidl.converters.USVString(V)
}

function onParserDrain () {
  this.ws[kResponse].socket.resume()
}

function onParserError (err) {
  let message
  let code

  if (err instanceof CloseEvent) {
    message = err.reason
    code = err.code
  } else {
    message = err.message
  }

  fireEvent('error', this, () => new ErrorEvent('error', { error: err, message }))

  closeWebSocketConnection(this, code)
}

module.exports = {
  WebSocket
}


/***/ }),

/***/ 10:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/async-retry");

/***/ }),

/***/ 8061:
/***/ ((module) => {

"use strict";
module.exports = require("node:assert");

/***/ }),

/***/ 2761:
/***/ ((module) => {

"use strict";
module.exports = require("node:async_hooks");

/***/ }),

/***/ 2254:
/***/ ((module) => {

"use strict";
module.exports = require("node:buffer");

/***/ }),

/***/ 27:
/***/ ((module) => {

"use strict";
module.exports = require("node:console");

/***/ }),

/***/ 6005:
/***/ ((module) => {

"use strict";
module.exports = require("node:crypto");

/***/ }),

/***/ 5714:
/***/ ((module) => {

"use strict";
module.exports = require("node:diagnostics_channel");

/***/ }),

/***/ 604:
/***/ ((module) => {

"use strict";
module.exports = require("node:dns");

/***/ }),

/***/ 5673:
/***/ ((module) => {

"use strict";
module.exports = require("node:events");

/***/ }),

/***/ 8849:
/***/ ((module) => {

"use strict";
module.exports = require("node:http");

/***/ }),

/***/ 2725:
/***/ ((module) => {

"use strict";
module.exports = require("node:http2");

/***/ }),

/***/ 7503:
/***/ ((module) => {

"use strict";
module.exports = require("node:net");

/***/ }),

/***/ 8846:
/***/ ((module) => {

"use strict";
module.exports = require("node:perf_hooks");

/***/ }),

/***/ 9630:
/***/ ((module) => {

"use strict";
module.exports = require("node:querystring");

/***/ }),

/***/ 4492:
/***/ ((module) => {

"use strict";
module.exports = require("node:stream");

/***/ }),

/***/ 1764:
/***/ ((module) => {

"use strict";
module.exports = require("node:tls");

/***/ }),

/***/ 1041:
/***/ ((module) => {

"use strict";
module.exports = require("node:url");

/***/ }),

/***/ 7261:
/***/ ((module) => {

"use strict";
module.exports = require("node:util");

/***/ }),

/***/ 3746:
/***/ ((module) => {

"use strict";
module.exports = require("node:util/types");

/***/ }),

/***/ 4086:
/***/ ((module) => {

"use strict";
module.exports = require("node:worker_threads");

/***/ }),

/***/ 5628:
/***/ ((module) => {

"use strict";
module.exports = require("node:zlib");

/***/ }),

/***/ 2781:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ 1576:
/***/ ((module) => {

"use strict";
module.exports = require("string_decoder");

/***/ }),

/***/ 8740:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";
Object.defineProperty(exports, "__esModule", ({value: true})); function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }// src/helpers.ts
var _isnodeprocess = __nccwpck_require__(8576);

// src/multipart/helpers.ts
var _isbuffer = __nccwpck_require__(2935); var _isbuffer2 = _interopRequireDefault(_isbuffer);
var _stream = __nccwpck_require__(2781);
var supportsNewBlobFromArrayBuffer = new Promise((resolve) => {
  try {
    const helloAsArrayBuffer = new Uint8Array([104, 101, 108, 108, 111]);
    const blob = new Blob([helloAsArrayBuffer]);
    blob.text().then((text) => {
      resolve(text === "hello");
    }).catch(() => {
      resolve(false);
    });
  } catch (e) {
    resolve(false);
  }
});
async function toReadableStream(value) {
  if (value instanceof ReadableStream) {
    return value;
  }
  if (value instanceof Blob) {
    return value.stream();
  }
  if (isNodeJsReadableStream(value)) {
    return _stream.Readable.toWeb(value);
  }
  let streamValue;
  if (value instanceof ArrayBuffer) {
    streamValue = new Uint8Array(value);
  } else if (isNodeJsBuffer(value)) {
    streamValue = value;
  } else {
    streamValue = stringToUint8Array(value);
  }
  if (await supportsNewBlobFromArrayBuffer) {
    return new Blob([streamValue]).stream();
  }
  return new ReadableStream({
    start(controller) {
      controller.enqueue(streamValue);
      controller.close();
    }
  });
}
function isNodeJsReadableStream(value) {
  return typeof value === "object" && typeof value.pipe === "function" && value.readable && typeof value._read === "function" && // @ts-expect-error _readableState does exists on Readable
  typeof value._readableState === "object";
}
function stringToUint8Array(s) {
  const enc = new TextEncoder();
  return enc.encode(s);
}
function isNodeJsBuffer(value) {
  return _isbuffer2.default.call(void 0, value);
}

// src/bytes.ts
var parseRegExp = /^((-|\+)?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i;
var map = {
  b: 1,
  kb: 1 << 10,
  mb: 1 << 20,
  gb: 1 << 30,
  tb: 1024 ** 4,
  pb: 1024 ** 5
};
function bytes(val) {
  if (typeof val === "number" && !Number.isNaN(val)) {
    return val;
  }
  if (typeof val !== "string") {
    return null;
  }
  const results = parseRegExp.exec(val);
  let floatValue;
  let unit = "b";
  if (!results) {
    floatValue = parseInt(val, 10);
  } else {
    const [, res, , , unitMatch] = results;
    if (!res) {
      return null;
    }
    floatValue = parseFloat(res);
    if (unitMatch) {
      unit = unitMatch.toLowerCase();
    }
  }
  if (Number.isNaN(floatValue)) {
    return null;
  }
  return Math.floor(map[unit] * floatValue);
}

// src/helpers.ts
var defaultVercelBlobApiUrl = "https://vercel.com/api/blob";
function getTokenFromOptionsOrEnv(options) {
  if (options == null ? void 0 : options.token) {
    return options.token;
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return process.env.BLOB_READ_WRITE_TOKEN;
  }
  throw new BlobError(
    "No token found. Either configure the `BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to your calls."
  );
}
var BlobError = class extends Error {
  constructor(message) {
    super(`Vercel Blob: ${message}`);
  }
};
function getDownloadUrl(blobUrl) {
  const url = new URL(blobUrl);
  url.searchParams.set("download", "1");
  return url.toString();
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
}
var disallowedPathnameCharacters = ["//"];
var supportsRequestStreams = (() => {
  if (_isnodeprocess.isNodeProcess.call(void 0, )) {
    return true;
  }
  const apiUrl = getApiUrl();
  if (apiUrl.startsWith("http://localhost")) {
    return false;
  }
  let duplexAccessed = false;
  const hasContentType = new Request(getApiUrl(), {
    body: new ReadableStream(),
    method: "POST",
    // @ts-expect-error -- TypeScript doesn't yet have duplex but it's in the spec: https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1729
    get duplex() {
      duplexAccessed = true;
      return "half";
    }
  }).headers.has("Content-Type");
  return duplexAccessed && !hasContentType;
})();
function getApiUrl(pathname = "") {
  let baseUrl = null;
  try {
    baseUrl = process.env.VERCEL_BLOB_API_URL || process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL;
  } catch (e2) {
  }
  return `${baseUrl || defaultVercelBlobApiUrl}${pathname}`;
}
var TEXT_ENCODER = typeof TextEncoder === "function" ? new TextEncoder() : null;
function computeBodyLength(body) {
  if (!body) {
    return 0;
  }
  if (typeof body === "string") {
    if (TEXT_ENCODER) {
      return TEXT_ENCODER.encode(body).byteLength;
    }
    return new Blob([body]).size;
  }
  if ("byteLength" in body && typeof body.byteLength === "number") {
    return body.byteLength;
  }
  if ("size" in body && typeof body.size === "number") {
    return body.size;
  }
  return 0;
}
var createChunkTransformStream = (chunkSize, onProgress) => {
  let buffer = new Uint8Array(0);
  return new TransformStream({
    transform(chunk, controller) {
      queueMicrotask(() => {
        const newBuffer = new Uint8Array(buffer.length + chunk.byteLength);
        newBuffer.set(buffer);
        newBuffer.set(new Uint8Array(chunk), buffer.length);
        buffer = newBuffer;
        while (buffer.length >= chunkSize) {
          const newChunk = buffer.slice(0, chunkSize);
          controller.enqueue(newChunk);
          onProgress == null ? void 0 : onProgress(newChunk.byteLength);
          buffer = buffer.slice(chunkSize);
        }
      });
    },
    flush(controller) {
      queueMicrotask(() => {
        if (buffer.length > 0) {
          controller.enqueue(buffer);
          onProgress == null ? void 0 : onProgress(buffer.byteLength);
        }
      });
    }
  });
};
function isReadableStream(value) {
  return globalThis.ReadableStream && // TODO: Can be removed once Node.js 16 is no more required internally
  value instanceof ReadableStream;
}
function isStream(value) {
  if (isReadableStream(value)) {
    return true;
  }
  if (isNodeJsReadableStream(value)) {
    return true;
  }
  return false;
}

// src/api.ts
var _asyncretry = __nccwpck_require__(10); var _asyncretry2 = _interopRequireDefault(_asyncretry);

// src/debug.ts
var debugIsActive = false;
var _a, _b;
try {
  if (((_a = process.env.DEBUG) == null ? void 0 : _a.includes("blob")) || ((_b = process.env.NEXT_PUBLIC_DEBUG) == null ? void 0 : _b.includes("blob"))) {
    debugIsActive = true;
  }
} catch (e3) {
}
function debug(message, ...args) {
  if (debugIsActive) {
    console.debug(`vercel-blob: ${message}`, ...args);
  }
}

// src/dom-exception.ts
var _a2;
var DOMException2 = (_a2 = globalThis.DOMException) != null ? _a2 : (() => {
  try {
    atob("~");
  } catch (err) {
    return Object.getPrototypeOf(err).constructor;
  }
})();

// src/is-network-error.ts
var objectToString = Object.prototype.toString;
var isError = (value) => objectToString.call(value) === "[object Error]";
var errorMessages = /* @__PURE__ */ new Set([
  "network error",
  // Chrome
  "Failed to fetch",
  // Chrome
  "NetworkError when attempting to fetch resource.",
  // Firefox
  "The Internet connection appears to be offline.",
  // Safari 16
  "Load failed",
  // Safari 17+
  "Network request failed",
  // `cross-fetch`
  "fetch failed",
  // Undici (Node.js)
  "terminated"
  // Undici (Node.js)
]);
function isNetworkError(error) {
  const isValid = error && isError(error) && error.name === "TypeError" && typeof error.message === "string";
  if (!isValid) {
    return false;
  }
  if (error.message === "Load failed") {
    return error.stack === void 0;
  }
  return errorMessages.has(error.message);
}

// src/fetch.ts
var _undici = __nccwpck_require__(2614);
var hasFetch = typeof _undici.fetch === "function";
var hasFetchWithUploadProgress = hasFetch && supportsRequestStreams;
var CHUNK_SIZE = 64 * 1024;
var blobFetch = async ({
  input,
  init,
  onUploadProgress
}) => {
  debug("using fetch");
  let body;
  if (init.body) {
    if (onUploadProgress) {
      const stream = await toReadableStream(init.body);
      let loaded = 0;
      const chunkTransformStream = createChunkTransformStream(
        CHUNK_SIZE,
        (newLoaded) => {
          loaded += newLoaded;
          onUploadProgress(loaded);
        }
      );
      body = stream.pipeThrough(chunkTransformStream);
    } else {
      body = init.body;
    }
  }
  const duplex = supportsRequestStreams && body && isStream(body) ? "half" : void 0;
  return _undici.fetch.call(void 0, 
    input,
    // @ts-expect-error -- Blob and Nodejs Blob are triggering type errors, fine with it
    {
      ...init,
      ...init.body ? { body } : {},
      duplex
    }
  );
};

// src/xhr.ts
var hasXhr = typeof XMLHttpRequest !== "undefined";
var blobXhr = async ({
  input,
  init,
  onUploadProgress
}) => {
  debug("using xhr");
  let body = null;
  if (init.body) {
    if (isReadableStream(init.body)) {
      body = await new Response(init.body).blob();
    } else {
      body = init.body;
    }
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || "GET", input.toString(), true);
    if (onUploadProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onUploadProgress(event.loaded);
        }
      });
    }
    xhr.onload = () => {
      var _a3;
      if ((_a3 = init.signal) == null ? void 0 : _a3.aborted) {
        reject(new DOMException("The user aborted the request.", "AbortError"));
        return;
      }
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim().split(/[\r\n]+/);
      rawHeaders.forEach((line) => {
        const parts = line.split(": ");
        const key = parts.shift();
        const value = parts.join(": ");
        if (key) headers.set(key.toLowerCase(), value);
      });
      const response = new Response(xhr.response, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers
      });
      resolve(response);
    };
    xhr.onerror = () => {
      reject(new TypeError("Network request failed"));
    };
    xhr.ontimeout = () => {
      reject(new TypeError("Network request timed out"));
    };
    xhr.onabort = () => {
      reject(new DOMException("The user aborted a request.", "AbortError"));
    };
    if (init.headers) {
      const headers = new Headers(init.headers);
      headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });
    }
    if (init.signal) {
      init.signal.addEventListener("abort", () => {
        xhr.abort();
      });
      if (init.signal.aborted) {
        xhr.abort();
        return;
      }
    }
    xhr.send(body);
  });
};

// src/request.ts
var blobRequest = async ({
  input,
  init,
  onUploadProgress
}) => {
  if (onUploadProgress) {
    if (hasFetchWithUploadProgress) {
      return blobFetch({ input, init, onUploadProgress });
    }
    if (hasXhr) {
      return blobXhr({ input, init, onUploadProgress });
    }
  }
  if (hasFetch) {
    return blobFetch({ input, init });
  }
  if (hasXhr) {
    return blobXhr({ input, init });
  }
  throw new Error("No request implementation available");
};

// src/api.ts
var MAXIMUM_PATHNAME_LENGTH = 950;
var BlobAccessError = class extends BlobError {
  constructor() {
    super("Access denied, please provide a valid token for this resource.");
  }
};
var BlobContentTypeNotAllowedError = class extends BlobError {
  constructor(message) {
    super(`Content type mismatch, ${message}.`);
  }
};
var BlobPathnameMismatchError = class extends BlobError {
  constructor(message) {
    super(
      `Pathname mismatch, ${message}. Check the pathname used in upload() or put() matches the one from the client token.`
    );
  }
};
var BlobClientTokenExpiredError = class extends BlobError {
  constructor() {
    super("Client token has expired.");
  }
};
var BlobFileTooLargeError = class extends BlobError {
  constructor(message) {
    super(`File is too large, ${message}.`);
  }
};
var BlobStoreNotFoundError = class extends BlobError {
  constructor() {
    super("This store does not exist.");
  }
};
var BlobStoreSuspendedError = class extends BlobError {
  constructor() {
    super("This store has been suspended.");
  }
};
var BlobUnknownError = class extends BlobError {
  constructor() {
    super("Unknown error, please visit https://vercel.com/help.");
  }
};
var BlobNotFoundError = class extends BlobError {
  constructor() {
    super("The requested blob does not exist");
  }
};
var BlobServiceNotAvailable = class extends BlobError {
  constructor() {
    super("The blob service is currently not available. Please try again.");
  }
};
var BlobServiceRateLimited = class extends BlobError {
  constructor(seconds) {
    super(
      `Too many requests please lower the number of concurrent requests ${seconds ? ` - try again in ${seconds} seconds` : ""}.`
    );
    this.retryAfter = seconds != null ? seconds : 0;
  }
};
var BlobRequestAbortedError = class extends BlobError {
  constructor() {
    super("The request was aborted.");
  }
};
var BlobPreconditionFailedError = class extends BlobError {
  constructor() {
    super("Precondition failed: ETag mismatch.");
  }
};
var BLOB_API_VERSION = 12;
function getApiVersion() {
  let versionOverride = null;
  try {
    versionOverride = process.env.VERCEL_BLOB_API_VERSION_OVERRIDE || process.env.NEXT_PUBLIC_VERCEL_BLOB_API_VERSION_OVERRIDE;
  } catch (e4) {
  }
  return `${versionOverride != null ? versionOverride : BLOB_API_VERSION}`;
}
function getRetries() {
  try {
    const retries = process.env.VERCEL_BLOB_RETRIES || "10";
    return parseInt(retries, 10);
  } catch (e5) {
    return 10;
  }
}
function createBlobServiceRateLimited(response) {
  const retryAfter = response.headers.get("retry-after");
  return new BlobServiceRateLimited(
    retryAfter ? parseInt(retryAfter, 10) : void 0
  );
}
async function getBlobError(response) {
  var _a3, _b2, _c;
  let code;
  let message;
  try {
    const data = await response.json();
    code = (_b2 = (_a3 = data.error) == null ? void 0 : _a3.code) != null ? _b2 : "unknown_error";
    message = (_c = data.error) == null ? void 0 : _c.message;
  } catch (e6) {
    code = "unknown_error";
  }
  if ((message == null ? void 0 : message.includes("contentType")) && message.includes("is not allowed")) {
    code = "content_type_not_allowed";
  }
  if ((message == null ? void 0 : message.includes('"pathname"')) && message.includes("does not match the token payload")) {
    code = "client_token_pathname_mismatch";
  }
  if (message === "Token expired") {
    code = "client_token_expired";
  }
  if (message == null ? void 0 : message.includes("the file length cannot be greater than")) {
    code = "file_too_large";
  }
  let error;
  switch (code) {
    case "store_suspended":
      error = new BlobStoreSuspendedError();
      break;
    case "forbidden":
      error = new BlobAccessError();
      break;
    case "content_type_not_allowed":
      error = new BlobContentTypeNotAllowedError(message);
      break;
    case "client_token_pathname_mismatch":
      error = new BlobPathnameMismatchError(message);
      break;
    case "client_token_expired":
      error = new BlobClientTokenExpiredError();
      break;
    case "file_too_large":
      error = new BlobFileTooLargeError(message);
      break;
    case "not_found":
      error = new BlobNotFoundError();
      break;
    case "store_not_found":
      error = new BlobStoreNotFoundError();
      break;
    case "bad_request":
      error = new BlobError(message != null ? message : "Bad request");
      break;
    case "service_unavailable":
      error = new BlobServiceNotAvailable();
      break;
    case "rate_limited":
      error = createBlobServiceRateLimited(response);
      break;
    case "precondition_failed":
      error = new BlobPreconditionFailedError();
      break;
    case "unknown_error":
    case "not_allowed":
    default:
      error = new BlobUnknownError();
      break;
  }
  return { code, error };
}
async function requestApi(pathname, init, commandOptions) {
  const apiVersion = getApiVersion();
  const token = getTokenFromOptionsOrEnv(commandOptions);
  const extraHeaders = getProxyThroughAlternativeApiHeaderFromEnv();
  const [, , , storeId = ""] = token.split("_");
  const requestId = `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  let retryCount = 0;
  let bodyLength = 0;
  let totalLoaded = 0;
  const sendBodyLength = (commandOptions == null ? void 0 : commandOptions.onUploadProgress) || shouldUseXContentLength();
  if (init.body && // 1. For upload progress we always need to know the total size of the body
  // 2. In development we need the header for put() to work correctly when passing a stream
  sendBodyLength) {
    bodyLength = computeBodyLength(init.body);
  }
  if (commandOptions == null ? void 0 : commandOptions.onUploadProgress) {
    commandOptions.onUploadProgress({
      loaded: 0,
      total: bodyLength,
      percentage: 0
    });
  }
  const apiResponse = await _asyncretry2.default.call(void 0, 
    async (bail) => {
      let res;
      try {
        res = await blobRequest({
          input: getApiUrl(pathname),
          init: {
            ...init,
            headers: {
              "x-api-blob-request-id": requestId,
              "x-api-blob-request-attempt": String(retryCount),
              "x-api-version": apiVersion,
              ...sendBodyLength ? { "x-content-length": String(bodyLength) } : {},
              authorization: `Bearer ${token}`,
              ...extraHeaders,
              ...init.headers
            }
          },
          onUploadProgress: (commandOptions == null ? void 0 : commandOptions.onUploadProgress) ? (loaded) => {
            var _a3;
            const total = bodyLength !== 0 ? bodyLength : loaded;
            totalLoaded = loaded;
            const percentage = bodyLength > 0 ? Number((loaded / total * 100).toFixed(2)) : 0;
            if (percentage === 100 && bodyLength > 0) {
              return;
            }
            (_a3 = commandOptions.onUploadProgress) == null ? void 0 : _a3.call(commandOptions, {
              loaded,
              // When passing a stream to put(), we have no way to know the total size of the body.
              // Instead of defining total as total?: number we decided to set the total to the currently
              // loaded number. This is not inaccurate and way more practical for DX.
              // Passing down a stream to put() is very rare
              total,
              percentage
            });
          } : void 0
        });
      } catch (error2) {
        if (error2 instanceof DOMException2 && error2.name === "AbortError") {
          bail(new BlobRequestAbortedError());
          return;
        }
        if (isNetworkError(error2)) {
          throw error2;
        }
        if (error2 instanceof TypeError) {
          bail(error2);
          return;
        }
        throw error2;
      }
      if (res.ok) {
        return res;
      }
      const { code, error } = await getBlobError(res);
      if (code === "unknown_error" || code === "service_unavailable" || code === "internal_server_error") {
        throw error;
      }
      bail(error);
    },
    {
      retries: getRetries(),
      onRetry: (error) => {
        if (error instanceof Error) {
          debug(`retrying API request to ${pathname}`, error.message);
        }
        retryCount = retryCount + 1;
      }
    }
  );
  if (!apiResponse) {
    throw new BlobUnknownError();
  }
  if (commandOptions == null ? void 0 : commandOptions.onUploadProgress) {
    commandOptions.onUploadProgress({
      loaded: totalLoaded,
      total: totalLoaded,
      percentage: 100
    });
  }
  return await apiResponse.json();
}
function getProxyThroughAlternativeApiHeaderFromEnv() {
  const extraHeaders = {};
  try {
    if ("VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API" in process.env && process.env.VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API !== void 0) {
      extraHeaders["x-proxy-through-alternative-api"] = process.env.VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API;
    } else if ("NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API" in process.env && process.env.NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API !== void 0) {
      extraHeaders["x-proxy-through-alternative-api"] = process.env.NEXT_PUBLIC_VERCEL_BLOB_PROXY_THROUGH_ALTERNATIVE_API;
    }
  } catch (e7) {
  }
  return extraHeaders;
}
function shouldUseXContentLength() {
  try {
    return process.env.VERCEL_BLOB_USE_X_CONTENT_LENGTH === "1";
  } catch (e8) {
    return false;
  }
}

// src/put-helpers.ts
var putOptionHeaderMap = {
  cacheControlMaxAge: "x-cache-control-max-age",
  addRandomSuffix: "x-add-random-suffix",
  allowOverwrite: "x-allow-overwrite",
  contentType: "x-content-type",
  access: "x-vercel-blob-access",
  ifMatch: "x-if-match"
};
function createPutHeaders(allowedOptions, options) {
  const headers = {};
  headers[putOptionHeaderMap.access] = options.access;
  if (allowedOptions.includes("contentType") && options.contentType) {
    headers[putOptionHeaderMap.contentType] = options.contentType;
  }
  if (allowedOptions.includes("addRandomSuffix") && options.addRandomSuffix !== void 0) {
    headers[putOptionHeaderMap.addRandomSuffix] = options.addRandomSuffix ? "1" : "0";
  }
  if (allowedOptions.includes("ifMatch") && options.ifMatch) {
    if (options.allowOverwrite === false) {
      throw new BlobError(
        "ifMatch and allowOverwrite: false are contradictory. ifMatch is used for conditional overwrites, which requires allowOverwrite to be true."
      );
    }
    headers[putOptionHeaderMap.ifMatch] = options.ifMatch;
    if (allowedOptions.includes("allowOverwrite") && options.allowOverwrite === void 0) {
      headers[putOptionHeaderMap.allowOverwrite] = "1";
    }
  }
  if (allowedOptions.includes("allowOverwrite") && options.allowOverwrite !== void 0) {
    headers[putOptionHeaderMap.allowOverwrite] = options.allowOverwrite ? "1" : "0";
  }
  if (allowedOptions.includes("cacheControlMaxAge") && options.cacheControlMaxAge !== void 0) {
    headers[putOptionHeaderMap.cacheControlMaxAge] = options.cacheControlMaxAge.toString();
  }
  return headers;
}
async function createPutOptions({
  pathname,
  options,
  extraChecks,
  getToken
}) {
  if (!pathname) {
    throw new BlobError("pathname is required");
  }
  if (pathname.length > MAXIMUM_PATHNAME_LENGTH) {
    throw new BlobError(
      `pathname is too long, maximum length is ${MAXIMUM_PATHNAME_LENGTH}`
    );
  }
  for (const invalidCharacter of disallowedPathnameCharacters) {
    if (pathname.includes(invalidCharacter)) {
      throw new BlobError(
        `pathname cannot contain "${invalidCharacter}", please encode it if needed`
      );
    }
  }
  if (!options) {
    throw new BlobError("missing options, see usage");
  }
  if (options.access !== "public" && options.access !== "private") {
    throw new BlobError(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob'
    );
  }
  if (extraChecks) {
    extraChecks(options);
  }
  if (getToken) {
    options.token = await getToken(pathname, options);
  }
  return options;
}

// src/multipart/complete.ts
function createCompleteMultipartUploadMethod({ allowedOptions, getToken, extraChecks }) {
  return async (pathname, parts, optionsInput) => {
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken
    });
    const headers = createPutHeaders(allowedOptions, options);
    return completeMultipartUpload({
      uploadId: options.uploadId,
      key: options.key,
      pathname,
      headers,
      options,
      parts
    });
  };
}
async function completeMultipartUpload({
  uploadId,
  key,
  pathname,
  parts,
  headers,
  options
}) {
  const params = new URLSearchParams({ pathname });
  try {
    const response = await requestApi(
      `/mpu?${params.toString()}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
          "x-mpu-action": "complete",
          "x-mpu-upload-id": uploadId,
          // key can be any utf8 character so we need to encode it as HTTP headers can only be us-ascii
          // https://www.rfc-editor.org/rfc/rfc7230#swection-3.2.4
          "x-mpu-key": encodeURIComponent(key)
        },
        body: JSON.stringify(parts),
        signal: options.abortSignal
      },
      options
    );
    debug("mpu: complete", response);
    return response;
  } catch (error) {
    if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message === "fetch failed")) {
      throw new BlobServiceNotAvailable();
    } else {
      throw error;
    }
  }
}

// src/multipart/create.ts
function createCreateMultipartUploadMethod({ allowedOptions, getToken, extraChecks }) {
  return async (pathname, optionsInput) => {
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken
    });
    const headers = createPutHeaders(allowedOptions, options);
    const createMultipartUploadResponse = await createMultipartUpload(
      pathname,
      headers,
      options
    );
    return {
      key: createMultipartUploadResponse.key,
      uploadId: createMultipartUploadResponse.uploadId
    };
  };
}
async function createMultipartUpload(pathname, headers, options) {
  debug("mpu: create", "pathname:", pathname);
  const params = new URLSearchParams({ pathname });
  try {
    const response = await requestApi(
      `/mpu?${params.toString()}`,
      {
        method: "POST",
        headers: {
          ...headers,
          "x-mpu-action": "create"
        },
        signal: options.abortSignal
      },
      options
    );
    debug("mpu: create", response);
    return response;
  } catch (error) {
    if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message === "fetch failed")) {
      throw new BlobServiceNotAvailable();
    }
    throw error;
  }
}

// src/multipart/upload.ts
var _throttleit = __nccwpck_require__(766); var _throttleit2 = _interopRequireDefault(_throttleit);
function createUploadPartMethod({ allowedOptions, getToken, extraChecks }) {
  return async (pathname, body, optionsInput) => {
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken
    });
    const headers = createPutHeaders(allowedOptions, options);
    if (isPlainObject(body)) {
      throw new BlobError(
        "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload."
      );
    }
    const result = await uploadPart({
      uploadId: options.uploadId,
      key: options.key,
      pathname,
      part: { blob: body, partNumber: options.partNumber },
      headers,
      options
    });
    return {
      etag: result.etag,
      partNumber: options.partNumber
    };
  };
}
async function uploadPart({
  uploadId,
  key,
  pathname,
  headers,
  options,
  internalAbortController = new AbortController(),
  part
}) {
  var _a3, _b2, _c;
  const params = new URLSearchParams({ pathname });
  const responsePromise = requestApi(
    `/mpu?${params.toString()}`,
    {
      signal: internalAbortController.signal,
      method: "POST",
      headers: {
        ...headers,
        "x-mpu-action": "upload",
        "x-mpu-key": encodeURIComponent(key),
        "x-mpu-upload-id": uploadId,
        "x-mpu-part-number": part.partNumber.toString()
      },
      // weird things between undici types and native fetch types
      body: part.blob
    },
    options
  );
  function handleAbort() {
    internalAbortController.abort();
  }
  if ((_a3 = options.abortSignal) == null ? void 0 : _a3.aborted) {
    handleAbort();
  } else {
    (_b2 = options.abortSignal) == null ? void 0 : _b2.addEventListener("abort", handleAbort);
  }
  const response = await responsePromise;
  (_c = options.abortSignal) == null ? void 0 : _c.removeEventListener("abort", handleAbort);
  return response;
}
var maxConcurrentUploads = typeof window !== "undefined" ? 6 : 8;
var partSizeInBytes = 8 * 1024 * 1024;
var maxBytesInMemory = maxConcurrentUploads * partSizeInBytes * 2;
function uploadAllParts({
  uploadId,
  key,
  pathname,
  stream,
  headers,
  options,
  totalToLoad
}) {
  debug("mpu: upload init", "key:", key);
  const internalAbortController = new AbortController();
  return new Promise((resolve, reject) => {
    const partsToUpload = [];
    const completedParts = [];
    const reader = stream.getReader();
    let activeUploads = 0;
    let reading = false;
    let currentPartNumber = 1;
    let rejected = false;
    let currentBytesInMemory = 0;
    let doneReading = false;
    let bytesSent = 0;
    let arrayBuffers = [];
    let currentPartBytesRead = 0;
    let onUploadProgress;
    const totalLoadedPerPartNumber = {};
    if (options.onUploadProgress) {
      onUploadProgress = _throttleit2.default.call(void 0, () => {
        var _a3;
        const loaded = Object.values(totalLoadedPerPartNumber).reduce(
          (acc, cur) => {
            return acc + cur;
          },
          0
        );
        const total = totalToLoad || loaded;
        const percentage = totalToLoad > 0 ? Number(((loaded / totalToLoad || loaded) * 100).toFixed(2)) : 0;
        (_a3 = options.onUploadProgress) == null ? void 0 : _a3.call(options, { loaded, total, percentage });
      }, 150);
    }
    read().catch(cancel);
    async function read() {
      debug(
        "mpu: upload read start",
        "activeUploads:",
        activeUploads,
        "currentBytesInMemory:",
        `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
        "bytesSent:",
        bytes(bytesSent)
      );
      reading = true;
      while (currentBytesInMemory < maxBytesInMemory && !rejected) {
        try {
          const { value, done } = await reader.read();
          if (done) {
            doneReading = true;
            debug("mpu: upload read consumed the whole stream");
            if (arrayBuffers.length > 0) {
              partsToUpload.push({
                partNumber: currentPartNumber++,
                blob: new Blob(arrayBuffers, {
                  type: "application/octet-stream"
                })
              });
              sendParts();
            }
            reading = false;
            return;
          }
          currentBytesInMemory += value.byteLength;
          let valueOffset = 0;
          while (valueOffset < value.byteLength) {
            const remainingPartSize = partSizeInBytes - currentPartBytesRead;
            const endOffset = Math.min(
              valueOffset + remainingPartSize,
              value.byteLength
            );
            const chunk = value.slice(valueOffset, endOffset);
            arrayBuffers.push(chunk);
            currentPartBytesRead += chunk.byteLength;
            valueOffset = endOffset;
            if (currentPartBytesRead === partSizeInBytes) {
              partsToUpload.push({
                partNumber: currentPartNumber++,
                blob: new Blob(arrayBuffers, {
                  type: "application/octet-stream"
                })
              });
              arrayBuffers = [];
              currentPartBytesRead = 0;
              sendParts();
            }
          }
        } catch (error) {
          cancel(error);
        }
      }
      debug(
        "mpu: upload read end",
        "activeUploads:",
        activeUploads,
        "currentBytesInMemory:",
        `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
        "bytesSent:",
        bytes(bytesSent)
      );
      reading = false;
    }
    async function sendPart(part) {
      activeUploads++;
      debug(
        "mpu: upload send part start",
        "partNumber:",
        part.partNumber,
        "size:",
        part.blob.size,
        "activeUploads:",
        activeUploads,
        "currentBytesInMemory:",
        `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
        "bytesSent:",
        bytes(bytesSent)
      );
      try {
        const uploadProgressForPart = options.onUploadProgress ? (event) => {
          totalLoadedPerPartNumber[part.partNumber] = event.loaded;
          if (onUploadProgress) {
            onUploadProgress();
          }
        } : void 0;
        const completedPart = await uploadPart({
          uploadId,
          key,
          pathname,
          headers,
          options: {
            ...options,
            onUploadProgress: uploadProgressForPart
          },
          internalAbortController,
          part
        });
        debug(
          "mpu: upload send part end",
          "partNumber:",
          part.partNumber,
          "activeUploads",
          activeUploads,
          "currentBytesInMemory:",
          `${bytes(currentBytesInMemory)}/${bytes(maxBytesInMemory)}`,
          "bytesSent:",
          bytes(bytesSent)
        );
        if (rejected) {
          return;
        }
        completedParts.push({
          partNumber: part.partNumber,
          etag: completedPart.etag
        });
        currentBytesInMemory -= part.blob.size;
        activeUploads--;
        bytesSent += part.blob.size;
        if (partsToUpload.length > 0) {
          sendParts();
        }
        if (doneReading) {
          if (activeUploads === 0) {
            reader.releaseLock();
            resolve(completedParts);
          }
          return;
        }
        if (!reading) {
          read().catch(cancel);
        }
      } catch (error) {
        cancel(error);
      }
    }
    function sendParts() {
      if (rejected) {
        return;
      }
      debug(
        "send parts",
        "activeUploads",
        activeUploads,
        "partsToUpload",
        partsToUpload.length
      );
      while (activeUploads < maxConcurrentUploads && partsToUpload.length > 0) {
        const partToSend = partsToUpload.shift();
        if (partToSend) {
          void sendPart(partToSend);
        }
      }
    }
    function cancel(error) {
      if (rejected) {
        return;
      }
      rejected = true;
      internalAbortController.abort();
      reader.releaseLock();
      if (error instanceof TypeError && (error.message === "Failed to fetch" || error.message === "fetch failed")) {
        reject(new BlobServiceNotAvailable());
      } else {
        reject(error);
      }
    }
  });
}

// src/multipart/create-uploader.ts
function createCreateMultipartUploaderMethod({ allowedOptions, getToken, extraChecks }) {
  return async (pathname, optionsInput) => {
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken
    });
    const headers = createPutHeaders(allowedOptions, options);
    const createMultipartUploadResponse = await createMultipartUpload(
      pathname,
      headers,
      options
    );
    return {
      key: createMultipartUploadResponse.key,
      uploadId: createMultipartUploadResponse.uploadId,
      async uploadPart(partNumber, body) {
        if (isPlainObject(body)) {
          throw new BlobError(
            "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload."
          );
        }
        const result = await uploadPart({
          uploadId: createMultipartUploadResponse.uploadId,
          key: createMultipartUploadResponse.key,
          pathname,
          part: { partNumber, blob: body },
          headers,
          options
        });
        return {
          etag: result.etag,
          partNumber
        };
      },
      async complete(parts) {
        return completeMultipartUpload({
          uploadId: createMultipartUploadResponse.uploadId,
          key: createMultipartUploadResponse.key,
          pathname,
          parts,
          headers,
          options
        });
      }
    };
  };
}

// src/put.ts


// src/multipart/uncontrolled.ts
async function uncontrolledMultipartUpload(pathname, body, headers, options) {
  debug("mpu: init", "pathname:", pathname, "headers:", headers);
  const optionsWithoutOnUploadProgress = {
    ...options,
    onUploadProgress: void 0
  };
  const createMultipartUploadResponse = await createMultipartUpload(
    pathname,
    headers,
    optionsWithoutOnUploadProgress
  );
  const totalToLoad = computeBodyLength(body);
  const stream = await toReadableStream(body);
  const parts = await uploadAllParts({
    uploadId: createMultipartUploadResponse.uploadId,
    key: createMultipartUploadResponse.key,
    pathname,
    // @ts-expect-error ReadableStream<ArrayBuffer | Uint8Array> is compatible at runtime
    stream,
    headers,
    options,
    totalToLoad
  });
  const blob = await completeMultipartUpload({
    uploadId: createMultipartUploadResponse.uploadId,
    key: createMultipartUploadResponse.key,
    pathname,
    parts,
    headers,
    options: optionsWithoutOnUploadProgress
  });
  return blob;
}

// src/put.ts
function createPutMethod({
  allowedOptions,
  getToken,
  extraChecks
}) {
  return async function put(pathname, body, optionsInput) {
    if (!body) {
      throw new BlobError("body is required");
    }
    if (isPlainObject(body)) {
      throw new BlobError(
        "Body must be a string, buffer or stream. You sent a plain JavaScript object, double check what you're trying to upload."
      );
    }
    const options = await createPutOptions({
      pathname,
      options: optionsInput,
      extraChecks,
      getToken
    });
    const headers = createPutHeaders(allowedOptions, options);
    if (options.multipart === true) {
      return uncontrolledMultipartUpload(pathname, body, headers, options);
    }
    const onUploadProgress = options.onUploadProgress ? _throttleit2.default.call(void 0, options.onUploadProgress, 100) : void 0;
    const params = new URLSearchParams({ pathname });
    const response = await requestApi(
      `/?${params.toString()}`,
      {
        method: "PUT",
        body,
        headers,
        signal: options.abortSignal
      },
      {
        ...options,
        onUploadProgress
      }
    );
    return {
      url: response.url,
      downloadUrl: response.downloadUrl,
      pathname: response.pathname,
      contentType: response.contentType,
      contentDisposition: response.contentDisposition,
      etag: response.etag
    };
  };
}

// src/create-folder.ts
async function createFolder(pathname, options = { access: "public" }) {
  var _a3;
  const access = (_a3 = options.access) != null ? _a3 : "public";
  const folderPathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const headers = {};
  headers[putOptionHeaderMap.access] = access;
  headers[putOptionHeaderMap.addRandomSuffix] = "0";
  const params = new URLSearchParams({ pathname: folderPathname });
  const response = await requestApi(
    `/?${params.toString()}`,
    {
      method: "PUT",
      headers,
      signal: options.abortSignal
    },
    options
  );
  return {
    url: response.url,
    pathname: response.pathname
  };
}



























exports.getTokenFromOptionsOrEnv = getTokenFromOptionsOrEnv; exports.BlobError = BlobError; exports.getDownloadUrl = getDownloadUrl; exports.disallowedPathnameCharacters = disallowedPathnameCharacters; exports.MAXIMUM_PATHNAME_LENGTH = MAXIMUM_PATHNAME_LENGTH; exports.BlobAccessError = BlobAccessError; exports.BlobContentTypeNotAllowedError = BlobContentTypeNotAllowedError; exports.BlobPathnameMismatchError = BlobPathnameMismatchError; exports.BlobClientTokenExpiredError = BlobClientTokenExpiredError; exports.BlobFileTooLargeError = BlobFileTooLargeError; exports.BlobStoreNotFoundError = BlobStoreNotFoundError; exports.BlobStoreSuspendedError = BlobStoreSuspendedError; exports.BlobUnknownError = BlobUnknownError; exports.BlobNotFoundError = BlobNotFoundError; exports.BlobServiceNotAvailable = BlobServiceNotAvailable; exports.BlobServiceRateLimited = BlobServiceRateLimited; exports.BlobRequestAbortedError = BlobRequestAbortedError; exports.BlobPreconditionFailedError = BlobPreconditionFailedError; exports.requestApi = requestApi; exports.createCompleteMultipartUploadMethod = createCompleteMultipartUploadMethod; exports.createCreateMultipartUploadMethod = createCreateMultipartUploadMethod; exports.createUploadPartMethod = createUploadPartMethod; exports.createCreateMultipartUploaderMethod = createCreateMultipartUploaderMethod; exports.createPutMethod = createPutMethod; exports.createFolder = createFolder;
/*!
 * bytes
 * Copyright(c) 2012-2014 TJ Holowaychuk
 * Copyright(c) 2015 Jed Watson
 * MIT Licensed
 */
//# sourceMappingURL=chunk-ZCP6UQNE.cjs.map

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
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
var exports = __webpack_exports__;
Object.defineProperty(exports, "__esModule", ({value: true}));

























var _chunkZCP6UQNEcjs = __nccwpck_require__(8740);

// src/del.ts
async function del(urlOrPathname, options) {
  const urls = Array.isArray(urlOrPathname) ? urlOrPathname : [urlOrPathname];
  if ((options == null ? void 0 : options.ifMatch) && urls.length > 1) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)("ifMatch can only be used when deleting a single URL.");
  }
  const headers = {
    "content-type": "application/json"
  };
  if (options == null ? void 0 : options.ifMatch) {
    headers["x-if-match"] = options.ifMatch;
  }
  await _chunkZCP6UQNEcjs.requestApi.call(void 0, 
    "/delete",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ urls }),
      signal: options == null ? void 0 : options.abortSignal
    },
    options
  );
}

// src/head.ts
async function head(urlOrPathname, options) {
  const searchParams = new URLSearchParams({ url: urlOrPathname });
  const response = await _chunkZCP6UQNEcjs.requestApi.call(void 0, 
    `?${searchParams.toString()}`,
    // HEAD can't have body as a response, so we use GET
    {
      method: "GET",
      signal: options == null ? void 0 : options.abortSignal
    },
    options
  );
  return {
    url: response.url,
    downloadUrl: response.downloadUrl,
    pathname: response.pathname,
    size: response.size,
    contentType: response.contentType,
    contentDisposition: response.contentDisposition,
    cacheControl: response.cacheControl,
    uploadedAt: new Date(response.uploadedAt),
    etag: response.etag
  };
}

// src/get.ts
var _undici = __nccwpck_require__(2614);
function isUrl(urlOrPathname) {
  return urlOrPathname.startsWith("http://") || urlOrPathname.startsWith("https://");
}
function extractPathnameFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.pathname.slice(1);
  } catch (e) {
    return url;
  }
}
function getStoreIdFromToken(token) {
  const [, , , storeId = ""] = token.split("_");
  return storeId;
}
function constructBlobUrl(storeId, pathname, access) {
  return `https://${storeId}.${access}.blob.vercel-storage.com/${pathname}`;
}
async function get(urlOrPathname, options) {
  if (!urlOrPathname) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)("url or pathname is required");
  }
  if (!options) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)("missing options, see usage");
  }
  if (options.access !== "public" && options.access !== "private") {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob'
    );
  }
  const token = _chunkZCP6UQNEcjs.getTokenFromOptionsOrEnv.call(void 0, options);
  let blobUrl;
  let pathname;
  const access = options.access;
  if (isUrl(urlOrPathname)) {
    blobUrl = urlOrPathname;
    pathname = extractPathnameFromUrl(urlOrPathname);
    try {
      const { hostname } = new URL(blobUrl);
      if (!hostname.endsWith(".blob.vercel-storage.com")) {
        throw new (0, _chunkZCP6UQNEcjs.BlobError)(
          "Invalid URL: the URL does not point to a Vercel Blob store. Use a pathname instead, see https://vercel.com/docs/vercel-blob"
        );
      }
    } catch (error) {
      if (error instanceof _chunkZCP6UQNEcjs.BlobError) throw error;
      throw new (0, _chunkZCP6UQNEcjs.BlobError)("Invalid URL: unable to parse the provided URL");
    }
  } else {
    const storeId = getStoreIdFromToken(token);
    if (!storeId) {
      throw new (0, _chunkZCP6UQNEcjs.BlobError)("Invalid token: unable to extract store ID");
    }
    pathname = urlOrPathname;
    blobUrl = constructBlobUrl(storeId, pathname, access);
  }
  const requestHeaders = {
    ...options.ifNoneMatch ? { "If-None-Match": options.ifNoneMatch } : {},
    authorization: `Bearer ${token}`,
    ...options.headers
    // low-level escape hatch, applied last to override anything
  };
  let fetchUrl = blobUrl;
  if (options.useCache === false) {
    const url = new URL(blobUrl);
    url.searchParams.set("cache", "0");
    fetchUrl = url.toString();
  }
  const response = await _undici.fetch.call(void 0, fetchUrl, {
    method: "GET",
    headers: requestHeaders,
    signal: options.abortSignal
  });
  if (response.status === 304) {
    const downloadUrlObj = new URL(blobUrl);
    downloadUrlObj.searchParams.set("download", "1");
    const lastModified2 = response.headers.get("last-modified");
    return {
      statusCode: 304,
      stream: null,
      headers: response.headers,
      blob: {
        url: blobUrl,
        downloadUrl: downloadUrlObj.toString(),
        pathname,
        contentType: null,
        contentDisposition: response.headers.get("content-disposition") || "",
        cacheControl: response.headers.get("cache-control") || "",
        size: null,
        uploadedAt: lastModified2 ? new Date(lastModified2) : /* @__PURE__ */ new Date(),
        etag: response.headers.get("etag") || ""
      }
    };
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)(
      `Failed to fetch blob: ${response.status} ${response.statusText}`
    );
  }
  const stream = response.body;
  if (!stream) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)("Response body is null");
  }
  const contentLength = response.headers.get("content-length");
  const lastModified = response.headers.get("last-modified");
  const downloadUrl = new URL(blobUrl);
  downloadUrl.searchParams.set("download", "1");
  return {
    statusCode: 200,
    stream,
    headers: response.headers,
    blob: {
      url: blobUrl,
      downloadUrl: downloadUrl.toString(),
      pathname,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      contentDisposition: response.headers.get("content-disposition") || "",
      cacheControl: response.headers.get("cache-control") || "",
      size: contentLength ? parseInt(contentLength, 10) : 0,
      uploadedAt: lastModified ? new Date(lastModified) : /* @__PURE__ */ new Date(),
      etag: response.headers.get("etag") || ""
    }
  };
}

// src/list.ts
async function list(options) {
  var _a;
  const searchParams = new URLSearchParams();
  if (options == null ? void 0 : options.limit) {
    searchParams.set("limit", options.limit.toString());
  }
  if (options == null ? void 0 : options.prefix) {
    searchParams.set("prefix", options.prefix);
  }
  if (options == null ? void 0 : options.cursor) {
    searchParams.set("cursor", options.cursor);
  }
  if (options == null ? void 0 : options.mode) {
    searchParams.set("mode", options.mode);
  }
  const response = await _chunkZCP6UQNEcjs.requestApi.call(void 0, 
    `?${searchParams.toString()}`,
    {
      method: "GET",
      signal: options == null ? void 0 : options.abortSignal
    },
    options
  );
  if ((options == null ? void 0 : options.mode) === "folded") {
    return {
      folders: (_a = response.folders) != null ? _a : [],
      cursor: response.cursor,
      hasMore: response.hasMore,
      blobs: response.blobs.map(mapBlobResult)
    };
  }
  return {
    cursor: response.cursor,
    hasMore: response.hasMore,
    blobs: response.blobs.map(mapBlobResult)
  };
}
function mapBlobResult(blobResult) {
  return {
    url: blobResult.url,
    downloadUrl: blobResult.downloadUrl,
    pathname: blobResult.pathname,
    size: blobResult.size,
    uploadedAt: new Date(blobResult.uploadedAt),
    etag: blobResult.etag
  };
}

// src/copy.ts
async function copy(fromUrlOrPathname, toPathname, options) {
  if (!options) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)("missing options, see usage");
  }
  if (options.access !== "public" && options.access !== "private") {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)(
      'access must be "private" or "public", see https://vercel.com/docs/vercel-blob'
    );
  }
  if (toPathname.length > _chunkZCP6UQNEcjs.MAXIMUM_PATHNAME_LENGTH) {
    throw new (0, _chunkZCP6UQNEcjs.BlobError)(
      `pathname is too long, maximum length is ${_chunkZCP6UQNEcjs.MAXIMUM_PATHNAME_LENGTH}`
    );
  }
  for (const invalidCharacter of _chunkZCP6UQNEcjs.disallowedPathnameCharacters) {
    if (toPathname.includes(invalidCharacter)) {
      throw new (0, _chunkZCP6UQNEcjs.BlobError)(
        `pathname cannot contain "${invalidCharacter}", please encode it if needed`
      );
    }
  }
  const headers = {};
  headers["x-vercel-blob-access"] = options.access;
  if (options.addRandomSuffix !== void 0) {
    headers["x-add-random-suffix"] = options.addRandomSuffix ? "1" : "0";
  }
  if (options.allowOverwrite !== void 0) {
    headers["x-allow-overwrite"] = options.allowOverwrite ? "1" : "0";
  }
  if (options.contentType) {
    headers["x-content-type"] = options.contentType;
  }
  if (options.cacheControlMaxAge !== void 0) {
    headers["x-cache-control-max-age"] = options.cacheControlMaxAge.toString();
  }
  if (options.ifMatch) {
    headers["x-if-match"] = options.ifMatch;
  }
  const params = new URLSearchParams({
    pathname: toPathname,
    fromUrl: fromUrlOrPathname
  });
  const response = await _chunkZCP6UQNEcjs.requestApi.call(void 0, 
    `?${params.toString()}`,
    {
      method: "PUT",
      headers,
      signal: options.abortSignal
    },
    options
  );
  return {
    url: response.url,
    downloadUrl: response.downloadUrl,
    pathname: response.pathname,
    contentType: response.contentType,
    contentDisposition: response.contentDisposition,
    etag: response.etag
  };
}

// src/index.ts
var put = _chunkZCP6UQNEcjs.createPutMethod.call(void 0, {
  allowedOptions: [
    "cacheControlMaxAge",
    "addRandomSuffix",
    "allowOverwrite",
    "contentType",
    "ifMatch"
  ]
});
var createMultipartUpload = _chunkZCP6UQNEcjs.createCreateMultipartUploadMethod.call(void 0, {
  allowedOptions: [
    "cacheControlMaxAge",
    "addRandomSuffix",
    "allowOverwrite",
    "contentType",
    "ifMatch"
  ]
});
var createMultipartUploader = _chunkZCP6UQNEcjs.createCreateMultipartUploaderMethod.call(void 0, {
  allowedOptions: [
    "cacheControlMaxAge",
    "addRandomSuffix",
    "allowOverwrite",
    "contentType",
    "ifMatch"
  ]
});
var uploadPart = _chunkZCP6UQNEcjs.createUploadPartMethod.call(void 0, {
  allowedOptions: [
    "cacheControlMaxAge",
    "addRandomSuffix",
    "allowOverwrite",
    "contentType"
  ]
});
var completeMultipartUpload = _chunkZCP6UQNEcjs.createCompleteMultipartUploadMethod.call(void 0, {
  allowedOptions: [
    "cacheControlMaxAge",
    "addRandomSuffix",
    "allowOverwrite",
    "contentType"
  ]
});



























exports.BlobAccessError = _chunkZCP6UQNEcjs.BlobAccessError; exports.BlobClientTokenExpiredError = _chunkZCP6UQNEcjs.BlobClientTokenExpiredError; exports.BlobContentTypeNotAllowedError = _chunkZCP6UQNEcjs.BlobContentTypeNotAllowedError; exports.BlobError = _chunkZCP6UQNEcjs.BlobError; exports.BlobFileTooLargeError = _chunkZCP6UQNEcjs.BlobFileTooLargeError; exports.BlobNotFoundError = _chunkZCP6UQNEcjs.BlobNotFoundError; exports.BlobPathnameMismatchError = _chunkZCP6UQNEcjs.BlobPathnameMismatchError; exports.BlobPreconditionFailedError = _chunkZCP6UQNEcjs.BlobPreconditionFailedError; exports.BlobRequestAbortedError = _chunkZCP6UQNEcjs.BlobRequestAbortedError; exports.BlobServiceNotAvailable = _chunkZCP6UQNEcjs.BlobServiceNotAvailable; exports.BlobServiceRateLimited = _chunkZCP6UQNEcjs.BlobServiceRateLimited; exports.BlobStoreNotFoundError = _chunkZCP6UQNEcjs.BlobStoreNotFoundError; exports.BlobStoreSuspendedError = _chunkZCP6UQNEcjs.BlobStoreSuspendedError; exports.BlobUnknownError = _chunkZCP6UQNEcjs.BlobUnknownError; exports.completeMultipartUpload = completeMultipartUpload; exports.copy = copy; exports.createFolder = _chunkZCP6UQNEcjs.createFolder; exports.createMultipartUpload = createMultipartUpload; exports.createMultipartUploader = createMultipartUploader; exports.del = del; exports.get = get; exports.getDownloadUrl = _chunkZCP6UQNEcjs.getDownloadUrl; exports.head = head; exports.list = list; exports.put = put; exports.uploadPart = uploadPart;
//# sourceMappingURL=index.cjs.map
})();

module.exports = __webpack_exports__;
/******/ })()
;