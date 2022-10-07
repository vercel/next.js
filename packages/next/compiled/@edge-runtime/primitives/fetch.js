"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// <define:process>
var define_process_default;
var init_define_process = __esm({
  "<define:process>"() {
    define_process_default = { env: {}, versions: { node: "16.6.0" } };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/symbols.js
var require_symbols = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/symbols.js"(exports, module2) {
    init_define_process();
    module2.exports = {
      kClose: Symbol("close"),
      kDestroy: Symbol("destroy"),
      kDispatch: Symbol("dispatch"),
      kUrl: Symbol("url"),
      kWriting: Symbol("writing"),
      kResuming: Symbol("resuming"),
      kQueue: Symbol("queue"),
      kConnect: Symbol("connect"),
      kConnecting: Symbol("connecting"),
      kHeadersList: Symbol("headers list"),
      kKeepAliveDefaultTimeout: Symbol("default keep alive timeout"),
      kKeepAliveMaxTimeout: Symbol("max keep alive timeout"),
      kKeepAliveTimeoutThreshold: Symbol("keep alive timeout threshold"),
      kKeepAliveTimeoutValue: Symbol("keep alive timeout"),
      kKeepAlive: Symbol("keep alive"),
      kHeadersTimeout: Symbol("headers timeout"),
      kBodyTimeout: Symbol("body timeout"),
      kServerName: Symbol("server name"),
      kHost: Symbol("host"),
      kNoRef: Symbol("no ref"),
      kBodyUsed: Symbol("used"),
      kRunning: Symbol("running"),
      kBlocking: Symbol("blocking"),
      kPending: Symbol("pending"),
      kSize: Symbol("size"),
      kBusy: Symbol("busy"),
      kQueued: Symbol("queued"),
      kFree: Symbol("free"),
      kConnected: Symbol("connected"),
      kClosed: Symbol("closed"),
      kNeedDrain: Symbol("need drain"),
      kReset: Symbol("reset"),
      kDestroyed: Symbol("destroyed"),
      kMaxHeadersSize: Symbol("max headers size"),
      kRunningIdx: Symbol("running index"),
      kPendingIdx: Symbol("pending index"),
      kError: Symbol("error"),
      kClients: Symbol("clients"),
      kClient: Symbol("client"),
      kParser: Symbol("parser"),
      kOnDestroyed: Symbol("destroy callbacks"),
      kPipelining: Symbol("pipelinig"),
      kSocket: Symbol("socket"),
      kHostHeader: Symbol("host header"),
      kConnector: Symbol("connector"),
      kStrictContentLength: Symbol("strict content length"),
      kMaxRedirections: Symbol("maxRedirections"),
      kMaxRequests: Symbol("maxRequestsPerClient"),
      kProxy: Symbol("proxy agent options"),
      kCounter: Symbol("socket request counter"),
      kInterceptors: Symbol("dispatch interceptors")
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/symbols.js
var require_symbols2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/symbols.js"(exports, module2) {
    "use strict";
    init_define_process();
    module2.exports = {
      kUrl: Symbol("url"),
      kHeaders: Symbol("headers"),
      kSignal: Symbol("signal"),
      kState: Symbol("state"),
      kGuard: Symbol("guard"),
      kRealm: Symbol("realm")
    };
  }
});

// src/patches/http.js
var require_http = __commonJS({
  "src/patches/http.js"() {
    init_define_process();
    var http = require_http();
    http.validateHeaderName = /* @__PURE__ */ __name(function validateHeaderName(name) {
      if (typeof name !== "string" || !name) {
        const message = `Header name must be a valid HTTP token ["${name}"]`;
        const error = new TypeError(message);
        error.code = "ERR_INVALID_HTTP_TOKEN";
        throw error;
      }
    }, "validateHeaderName");
    http.validateHeaderValue = /* @__PURE__ */ __name(function validateHeaderValue(value) {
      if (value === void 0) {
        const message = `Invalid value "${value}" for header "${value}"`;
        const error = new TypeError(message);
        error.code = "ERR_HTTP_INVALID_HEADER_VALUE";
        throw error;
      }
    }, "validateHeaderValue");
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/errors.js
var require_errors = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/errors.js"(exports, module2) {
    "use strict";
    init_define_process();
    var UndiciError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "UndiciError";
        this.code = "UND_ERR";
      }
    };
    __name(UndiciError, "UndiciError");
    var ConnectTimeoutError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ConnectTimeoutError);
        this.name = "ConnectTimeoutError";
        this.message = message || "Connect Timeout Error";
        this.code = "UND_ERR_CONNECT_TIMEOUT";
      }
    };
    __name(ConnectTimeoutError, "ConnectTimeoutError");
    var HeadersTimeoutError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, HeadersTimeoutError);
        this.name = "HeadersTimeoutError";
        this.message = message || "Headers Timeout Error";
        this.code = "UND_ERR_HEADERS_TIMEOUT";
      }
    };
    __name(HeadersTimeoutError, "HeadersTimeoutError");
    var HeadersOverflowError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, HeadersOverflowError);
        this.name = "HeadersOverflowError";
        this.message = message || "Headers Overflow Error";
        this.code = "UND_ERR_HEADERS_OVERFLOW";
      }
    };
    __name(HeadersOverflowError, "HeadersOverflowError");
    var BodyTimeoutError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, BodyTimeoutError);
        this.name = "BodyTimeoutError";
        this.message = message || "Body Timeout Error";
        this.code = "UND_ERR_BODY_TIMEOUT";
      }
    };
    __name(BodyTimeoutError, "BodyTimeoutError");
    var ResponseStatusCodeError = class extends UndiciError {
      constructor(message, statusCode, headers, body) {
        super(message);
        Error.captureStackTrace(this, ResponseStatusCodeError);
        this.name = "ResponseStatusCodeError";
        this.message = message || "Response Status Code Error";
        this.code = "UND_ERR_RESPONSE_STATUS_CODE";
        this.body = body;
        this.status = statusCode;
        this.statusCode = statusCode;
        this.headers = headers;
      }
    };
    __name(ResponseStatusCodeError, "ResponseStatusCodeError");
    var InvalidArgumentError2 = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, InvalidArgumentError2);
        this.name = "InvalidArgumentError";
        this.message = message || "Invalid Argument Error";
        this.code = "UND_ERR_INVALID_ARG";
      }
    };
    __name(InvalidArgumentError2, "InvalidArgumentError");
    var InvalidReturnValueError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, InvalidReturnValueError);
        this.name = "InvalidReturnValueError";
        this.message = message || "Invalid Return Value Error";
        this.code = "UND_ERR_INVALID_RETURN_VALUE";
      }
    };
    __name(InvalidReturnValueError, "InvalidReturnValueError");
    var RequestAbortedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, RequestAbortedError);
        this.name = "AbortError";
        this.message = message || "Request aborted";
        this.code = "UND_ERR_ABORTED";
      }
    };
    __name(RequestAbortedError, "RequestAbortedError");
    var InformationalError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, InformationalError);
        this.name = "InformationalError";
        this.message = message || "Request information";
        this.code = "UND_ERR_INFO";
      }
    };
    __name(InformationalError, "InformationalError");
    var RequestContentLengthMismatchError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, RequestContentLengthMismatchError);
        this.name = "RequestContentLengthMismatchError";
        this.message = message || "Request body length does not match content-length header";
        this.code = "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH";
      }
    };
    __name(RequestContentLengthMismatchError, "RequestContentLengthMismatchError");
    var ResponseContentLengthMismatchError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ResponseContentLengthMismatchError);
        this.name = "ResponseContentLengthMismatchError";
        this.message = message || "Response body length does not match content-length header";
        this.code = "UND_ERR_RES_CONTENT_LENGTH_MISMATCH";
      }
    };
    __name(ResponseContentLengthMismatchError, "ResponseContentLengthMismatchError");
    var ClientDestroyedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ClientDestroyedError);
        this.name = "ClientDestroyedError";
        this.message = message || "The client is destroyed";
        this.code = "UND_ERR_DESTROYED";
      }
    };
    __name(ClientDestroyedError, "ClientDestroyedError");
    var ClientClosedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, ClientClosedError);
        this.name = "ClientClosedError";
        this.message = message || "The client is closed";
        this.code = "UND_ERR_CLOSED";
      }
    };
    __name(ClientClosedError, "ClientClosedError");
    var SocketError = class extends UndiciError {
      constructor(message, socket) {
        super(message);
        Error.captureStackTrace(this, SocketError);
        this.name = "SocketError";
        this.message = message || "Socket error";
        this.code = "UND_ERR_SOCKET";
        this.socket = socket;
      }
    };
    __name(SocketError, "SocketError");
    var NotSupportedError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, NotSupportedError);
        this.name = "NotSupportedError";
        this.message = message || "Not supported error";
        this.code = "UND_ERR_NOT_SUPPORTED";
      }
    };
    __name(NotSupportedError, "NotSupportedError");
    var BalancedPoolMissingUpstreamError = class extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, NotSupportedError);
        this.name = "MissingUpstreamError";
        this.message = message || "No upstream has been added to the BalancedPool";
        this.code = "UND_ERR_BPL_MISSING_UPSTREAM";
      }
    };
    __name(BalancedPoolMissingUpstreamError, "BalancedPoolMissingUpstreamError");
    var HTTPParserError = class extends Error {
      constructor(message, code, data) {
        super(message);
        Error.captureStackTrace(this, HTTPParserError);
        this.name = "HTTPParserError";
        this.code = code ? `HPE_${code}` : void 0;
        this.data = data ? data.toString() : void 0;
      }
    };
    __name(HTTPParserError, "HTTPParserError");
    module2.exports = {
      HTTPParserError,
      UndiciError,
      HeadersTimeoutError,
      HeadersOverflowError,
      BodyTimeoutError,
      RequestContentLengthMismatchError,
      ConnectTimeoutError,
      ResponseStatusCodeError,
      InvalidArgumentError: InvalidArgumentError2,
      InvalidReturnValueError,
      RequestAbortedError,
      ClientDestroyedError,
      ClientClosedError,
      InformationalError,
      SocketError,
      NotSupportedError,
      ResponseContentLengthMismatchError,
      BalancedPoolMissingUpstreamError
    };
  }
});

// src/patches/buffer.js
var require_buffer = __commonJS({
  "src/patches/buffer.js"(exports, module2) {
    init_define_process();
    module2.exports = require_buffer();
    module2.exports.Blob = require("./blob").Blob;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/util.js
var require_util = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/util.js"(exports, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { kDestroyed, kBodyUsed } = require_symbols();
    var { IncomingMessage } = require_http();
    var stream = require("stream");
    var net = require("net");
    var { InvalidArgumentError: InvalidArgumentError2 } = require_errors();
    var { Blob } = require_buffer();
    var nodeUtil = require("util");
    var { stringify } = require("querystring");
    function nop() {
    }
    __name(nop, "nop");
    function isStream(obj) {
      return obj && typeof obj.pipe === "function";
    }
    __name(isStream, "isStream");
    function isBlobLike(object) {
      return Blob && object instanceof Blob || object && typeof object === "object" && (typeof object.stream === "function" || typeof object.arrayBuffer === "function") && /^(Blob|File)$/.test(object[Symbol.toStringTag]);
    }
    __name(isBlobLike, "isBlobLike");
    function buildURL(url, queryParams) {
      if (url.includes("?") || url.includes("#")) {
        throw new Error('Query params cannot be passed when url already contains "?" or "#".');
      }
      const stringified = stringify(queryParams);
      if (stringified) {
        url += "?" + stringified;
      }
      return url;
    }
    __name(buildURL, "buildURL");
    function parseURL(url) {
      if (typeof url === "string") {
        url = new URL(url);
      }
      if (!url || typeof url !== "object") {
        throw new InvalidArgumentError2("invalid url");
      }
      if (url.port != null && url.port !== "" && !Number.isFinite(parseInt(url.port))) {
        throw new InvalidArgumentError2("invalid port");
      }
      if (url.path != null && typeof url.path !== "string") {
        throw new InvalidArgumentError2("invalid path");
      }
      if (url.pathname != null && typeof url.pathname !== "string") {
        throw new InvalidArgumentError2("invalid pathname");
      }
      if (url.hostname != null && typeof url.hostname !== "string") {
        throw new InvalidArgumentError2("invalid hostname");
      }
      if (url.origin != null && typeof url.origin !== "string") {
        throw new InvalidArgumentError2("invalid origin");
      }
      if (!/^https?:/.test(url.origin || url.protocol)) {
        throw new InvalidArgumentError2("invalid protocol");
      }
      if (!(url instanceof URL)) {
        const port = url.port != null ? url.port : url.protocol === "https:" ? 443 : 80;
        let origin = url.origin != null ? url.origin : `${url.protocol}//${url.hostname}:${port}`;
        let path = url.path != null ? url.path : `${url.pathname || ""}${url.search || ""}`;
        if (origin.endsWith("/")) {
          origin = origin.substring(0, origin.length - 1);
        }
        if (path && !path.startsWith("/")) {
          path = `/${path}`;
        }
        url = new URL(origin + path);
      }
      return url;
    }
    __name(parseURL, "parseURL");
    function parseOrigin(url) {
      url = parseURL(url);
      if (url.pathname !== "/" || url.search || url.hash) {
        throw new InvalidArgumentError2("invalid url");
      }
      return url;
    }
    __name(parseOrigin, "parseOrigin");
    function getHostname(host) {
      if (host[0] === "[") {
        const idx2 = host.indexOf("]");
        assert(idx2 !== -1);
        return host.substr(1, idx2 - 1);
      }
      const idx = host.indexOf(":");
      if (idx === -1)
        return host;
      return host.substr(0, idx);
    }
    __name(getHostname, "getHostname");
    function getServerName(host) {
      if (!host) {
        return null;
      }
      assert.strictEqual(typeof host, "string");
      const servername = getHostname(host);
      if (net.isIP(servername)) {
        return "";
      }
      return servername;
    }
    __name(getServerName, "getServerName");
    function deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }
    __name(deepClone, "deepClone");
    function isAsyncIterable(obj) {
      return !!(obj != null && typeof obj[Symbol.asyncIterator] === "function");
    }
    __name(isAsyncIterable, "isAsyncIterable");
    function isIterable(obj) {
      return !!(obj != null && (typeof obj[Symbol.iterator] === "function" || typeof obj[Symbol.asyncIterator] === "function"));
    }
    __name(isIterable, "isIterable");
    function bodyLength(body) {
      if (body == null) {
        return 0;
      } else if (isStream(body)) {
        const state = body._readableState;
        return state && state.ended === true && Number.isFinite(state.length) ? state.length : null;
      } else if (isBlobLike(body)) {
        return body.size != null ? body.size : null;
      } else if (isBuffer(body)) {
        return body.byteLength;
      }
      return null;
    }
    __name(bodyLength, "bodyLength");
    function isDestroyed(stream2) {
      return !stream2 || !!(stream2.destroyed || stream2[kDestroyed]);
    }
    __name(isDestroyed, "isDestroyed");
    function isReadableAborted(stream2) {
      const state = stream2 && stream2._readableState;
      return isDestroyed(stream2) && state && !state.endEmitted;
    }
    __name(isReadableAborted, "isReadableAborted");
    function destroy(stream2, err) {
      if (!isStream(stream2) || isDestroyed(stream2)) {
        return;
      }
      if (typeof stream2.destroy === "function") {
        if (Object.getPrototypeOf(stream2).constructor === IncomingMessage) {
          stream2.socket = null;
        }
        stream2.destroy(err);
      } else if (err) {
        define_process_default.nextTick((stream3, err2) => {
          stream3.emit("error", err2);
        }, stream2, err);
      }
      if (stream2.destroyed !== true) {
        stream2[kDestroyed] = true;
      }
    }
    __name(destroy, "destroy");
    var KEEPALIVE_TIMEOUT_EXPR = /timeout=(\d+)/;
    function parseKeepAliveTimeout(val) {
      const m = val.toString().match(KEEPALIVE_TIMEOUT_EXPR);
      return m ? parseInt(m[1], 10) * 1e3 : null;
    }
    __name(parseKeepAliveTimeout, "parseKeepAliveTimeout");
    function parseHeaders(headers, obj = {}) {
      for (let i = 0; i < headers.length; i += 2) {
        const key = headers[i].toString().toLowerCase();
        let val = obj[key];
        if (!val) {
          if (Array.isArray(headers[i + 1])) {
            obj[key] = headers[i + 1];
          } else {
            obj[key] = headers[i + 1].toString();
          }
        } else {
          if (!Array.isArray(val)) {
            val = [val];
            obj[key] = val;
          }
          val.push(headers[i + 1].toString());
        }
      }
      return obj;
    }
    __name(parseHeaders, "parseHeaders");
    function parseRawHeaders(headers) {
      return headers.map((header) => header.toString());
    }
    __name(parseRawHeaders, "parseRawHeaders");
    function isBuffer(buffer) {
      return buffer instanceof Uint8Array || Buffer.isBuffer(buffer);
    }
    __name(isBuffer, "isBuffer");
    function validateHandler(handler, method, upgrade) {
      if (!handler || typeof handler !== "object") {
        throw new InvalidArgumentError2("handler must be an object");
      }
      if (typeof handler.onConnect !== "function") {
        throw new InvalidArgumentError2("invalid onConnect method");
      }
      if (typeof handler.onError !== "function") {
        throw new InvalidArgumentError2("invalid onError method");
      }
      if (typeof handler.onBodySent !== "function" && handler.onBodySent !== void 0) {
        throw new InvalidArgumentError2("invalid onBodySent method");
      }
      if (upgrade || method === "CONNECT") {
        if (typeof handler.onUpgrade !== "function") {
          throw new InvalidArgumentError2("invalid onUpgrade method");
        }
      } else {
        if (typeof handler.onHeaders !== "function") {
          throw new InvalidArgumentError2("invalid onHeaders method");
        }
        if (typeof handler.onData !== "function") {
          throw new InvalidArgumentError2("invalid onData method");
        }
        if (typeof handler.onComplete !== "function") {
          throw new InvalidArgumentError2("invalid onComplete method");
        }
      }
    }
    __name(validateHandler, "validateHandler");
    function isDisturbed(body) {
      return !!(body && (stream.isDisturbed ? stream.isDisturbed(body) || body[kBodyUsed] : body[kBodyUsed] || body.readableDidRead || body._readableState && body._readableState.dataEmitted || isReadableAborted(body)));
    }
    __name(isDisturbed, "isDisturbed");
    function isErrored(body) {
      return !!(body && (stream.isErrored ? stream.isErrored(body) : /state: 'errored'/.test(
        nodeUtil.inspect(body)
      )));
    }
    __name(isErrored, "isErrored");
    function isReadable(body) {
      return !!(body && (stream.isReadable ? stream.isReadable(body) : /state: 'readable'/.test(
        nodeUtil.inspect(body)
      )));
    }
    __name(isReadable, "isReadable");
    function getSocketInfo(socket) {
      return {
        localAddress: socket.localAddress,
        localPort: socket.localPort,
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort,
        remoteFamily: socket.remoteFamily,
        timeout: socket.timeout,
        bytesWritten: socket.bytesWritten,
        bytesRead: socket.bytesRead
      };
    }
    __name(getSocketInfo, "getSocketInfo");
    var ReadableStream;
    function ReadableStreamFrom(iterable) {
      if (!ReadableStream) {
        ReadableStream = require("./streams").ReadableStream;
      }
      if (ReadableStream.from) {
        return ReadableStream.from(iterable);
      }
      let iterator;
      return new ReadableStream(
        {
          async start() {
            iterator = iterable[Symbol.asyncIterator]();
          },
          async pull(controller) {
            const { done, value } = await iterator.next();
            if (done) {
              queueMicrotask(() => {
                controller.close();
              });
            } else {
              const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
              controller.enqueue(new Uint8Array(buf));
            }
            return controller.desiredSize > 0;
          },
          async cancel(reason) {
            await iterator.return();
          }
        },
        0
      );
    }
    __name(ReadableStreamFrom, "ReadableStreamFrom");
    function isFormDataLike(chunk) {
      return chunk && chunk.constructor && chunk.constructor.name === "FormData";
    }
    __name(isFormDataLike, "isFormDataLike");
    var kEnumerableProperty = /* @__PURE__ */ Object.create(null);
    kEnumerableProperty.enumerable = true;
    module2.exports = {
      kEnumerableProperty,
      nop,
      isDisturbed,
      isErrored,
      isReadable,
      toUSVString: nodeUtil.toUSVString || ((val) => `${val}`),
      isReadableAborted,
      isBlobLike,
      parseOrigin,
      parseURL,
      getServerName,
      isStream,
      isIterable,
      isAsyncIterable,
      isDestroyed,
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
      buildURL
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/constants.js"(exports, module2) {
    "use strict";
    init_define_process();
    var corsSafeListedMethods = ["GET", "HEAD", "POST"];
    var nullBodyStatus = [101, 204, 205, 304];
    var redirectStatus = [301, 302, 303, 307, 308];
    var referrerPolicy = [
      "",
      "no-referrer",
      "no-referrer-when-downgrade",
      "same-origin",
      "origin",
      "strict-origin",
      "origin-when-cross-origin",
      "strict-origin-when-cross-origin",
      "unsafe-url"
    ];
    var requestRedirect = ["follow", "manual", "error"];
    var safeMethods = ["GET", "HEAD", "OPTIONS", "TRACE"];
    var requestMode = ["navigate", "same-origin", "no-cors", "cors"];
    var requestCredentials = ["omit", "same-origin", "include"];
    var requestCache = [
      "default",
      "no-store",
      "reload",
      "no-cache",
      "force-cache",
      "only-if-cached"
    ];
    var requestBodyHeader = [
      "content-encoding",
      "content-language",
      "content-location",
      "content-type"
    ];
    var forbiddenMethods = ["CONNECT", "TRACE", "TRACK"];
    var subresource = [
      "audio",
      "audioworklet",
      "font",
      "image",
      "manifest",
      "paintworklet",
      "script",
      "style",
      "track",
      "video",
      "xslt",
      ""
    ];
    var _a;
    var DOMException = (_a = globalThis.DOMException) != null ? _a : (() => {
      try {
        atob("~");
      } catch (err) {
        return Object.getPrototypeOf(err).constructor;
      }
    })();
    module2.exports = {
      DOMException,
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
      safeMethods
    };
  }
});

// src/patches/util-types.js
var require_util_types = __commonJS({
  "src/patches/util-types.js"(exports, module2) {
    init_define_process();
    module2.exports = require("util").types;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/util.js
var require_util2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/util.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { redirectStatus } = require_constants();
    var { performance: performance2 } = require("perf_hooks");
    var { isBlobLike, toUSVString, ReadableStreamFrom } = require_util();
    var assert = require("assert");
    var { isUint8Array } = require_util_types();
    var crypto;
    try {
      crypto = require("crypto");
    } catch {
    }
    var badPorts = [
      "1",
      "7",
      "9",
      "11",
      "13",
      "15",
      "17",
      "19",
      "20",
      "21",
      "22",
      "23",
      "25",
      "37",
      "42",
      "43",
      "53",
      "69",
      "77",
      "79",
      "87",
      "95",
      "101",
      "102",
      "103",
      "104",
      "109",
      "110",
      "111",
      "113",
      "115",
      "117",
      "119",
      "123",
      "135",
      "137",
      "139",
      "143",
      "161",
      "179",
      "389",
      "427",
      "465",
      "512",
      "513",
      "514",
      "515",
      "526",
      "530",
      "531",
      "532",
      "540",
      "548",
      "554",
      "556",
      "563",
      "587",
      "601",
      "636",
      "989",
      "990",
      "993",
      "995",
      "1719",
      "1720",
      "1723",
      "2049",
      "3659",
      "4045",
      "5060",
      "5061",
      "6000",
      "6566",
      "6665",
      "6666",
      "6667",
      "6668",
      "6669",
      "6697",
      "10080"
    ];
    function responseURL(response) {
      const urlList = response.urlList;
      const length = urlList.length;
      return length === 0 ? null : urlList[length - 1].toString();
    }
    __name(responseURL, "responseURL");
    function responseLocationURL(response, requestFragment) {
      if (!redirectStatus.includes(response.status)) {
        return null;
      }
      let location = response.headersList.get("location");
      location = location ? new URL(location, responseURL(response)) : null;
      if (location && !location.hash) {
        location.hash = requestFragment;
      }
      return location;
    }
    __name(responseLocationURL, "responseLocationURL");
    function requestCurrentURL(request) {
      return request.urlList[request.urlList.length - 1];
    }
    __name(requestCurrentURL, "requestCurrentURL");
    function requestBadPort(request) {
      const url = requestCurrentURL(request);
      if (/^https?:/.test(url.protocol) && badPorts.includes(url.port)) {
        return "blocked";
      }
      return "allowed";
    }
    __name(requestBadPort, "requestBadPort");
    function isErrorLike(object) {
      var _a, _b;
      return object instanceof Error || (((_a = object == null ? void 0 : object.constructor) == null ? void 0 : _a.name) === "Error" || ((_b = object == null ? void 0 : object.constructor) == null ? void 0 : _b.name) === "DOMException");
    }
    __name(isErrorLike, "isErrorLike");
    function isValidReasonPhrase(statusText) {
      for (let i = 0; i < statusText.length; ++i) {
        const c = statusText.charCodeAt(i);
        if (!(c === 9 || c >= 32 && c <= 126 || c >= 128 && c <= 255)) {
          return false;
        }
      }
      return true;
    }
    __name(isValidReasonPhrase, "isValidReasonPhrase");
    function isTokenChar(c) {
      return !(c >= 127 || c <= 32 || c === "(" || c === ")" || c === "<" || c === ">" || c === "@" || c === "," || c === ";" || c === ":" || c === "\\" || c === '"' || c === "/" || c === "[" || c === "]" || c === "?" || c === "=" || c === "{" || c === "}");
    }
    __name(isTokenChar, "isTokenChar");
    function isValidHTTPToken(characters) {
      if (!characters || typeof characters !== "string") {
        return false;
      }
      for (let i = 0; i < characters.length; ++i) {
        const c = characters.charCodeAt(i);
        if (c > 127 || !isTokenChar(c)) {
          return false;
        }
      }
      return true;
    }
    __name(isValidHTTPToken, "isValidHTTPToken");
    function isValidHeaderName2(potentialValue) {
      if (potentialValue.length === 0) {
        return false;
      }
      for (const char of potentialValue) {
        if (!isValidHTTPToken(char)) {
          return false;
        }
      }
      return true;
    }
    __name(isValidHeaderName2, "isValidHeaderName");
    function isValidHeaderValue2(potentialValue) {
      if (potentialValue.startsWith("	") || potentialValue.startsWith(" ") || potentialValue.endsWith("	") || potentialValue.endsWith(" ")) {
        return false;
      }
      if (potentialValue.includes("\0") || potentialValue.includes("\r") || potentialValue.includes("\n")) {
        return false;
      }
      return true;
    }
    __name(isValidHeaderValue2, "isValidHeaderValue");
    function setRequestReferrerPolicyOnRedirect(request, actualResponse) {
      const policy = "";
      if (policy !== "") {
        request.referrerPolicy = policy;
      }
    }
    __name(setRequestReferrerPolicyOnRedirect, "setRequestReferrerPolicyOnRedirect");
    function crossOriginResourcePolicyCheck() {
      return "allowed";
    }
    __name(crossOriginResourcePolicyCheck, "crossOriginResourcePolicyCheck");
    function corsCheck() {
      return "success";
    }
    __name(corsCheck, "corsCheck");
    function TAOCheck() {
      return "success";
    }
    __name(TAOCheck, "TAOCheck");
    function appendFetchMetadata(httpRequest) {
      let header = null;
      header = httpRequest.mode;
      httpRequest.headersList.set("sec-fetch-mode", header);
    }
    __name(appendFetchMetadata, "appendFetchMetadata");
    function appendRequestOriginHeader(request) {
      let serializedOrigin = request.origin;
      if (request.responseTainting === "cors" || request.mode === "websocket") {
        if (serializedOrigin) {
          request.headersList.append("Origin", serializedOrigin);
        }
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        switch (request.referrerPolicy) {
          case "no-referrer":
            serializedOrigin = null;
            break;
          case "no-referrer-when-downgrade":
          case "strict-origin":
          case "strict-origin-when-cross-origin":
            if (/^https:/.test(request.origin) && !/^https:/.test(requestCurrentURL(request))) {
              serializedOrigin = null;
            }
            break;
          case "same-origin":
            if (!sameOrigin(request, requestCurrentURL(request))) {
              serializedOrigin = null;
            }
            break;
          default:
        }
        if (serializedOrigin) {
          request.headersList.append("Origin", serializedOrigin);
        }
      }
    }
    __name(appendRequestOriginHeader, "appendRequestOriginHeader");
    function coarsenedSharedCurrentTime(crossOriginIsolatedCapability) {
      return performance2.now();
    }
    __name(coarsenedSharedCurrentTime, "coarsenedSharedCurrentTime");
    function createOpaqueTimingInfo(timingInfo) {
      var _a, _b;
      return {
        startTime: (_a = timingInfo.startTime) != null ? _a : 0,
        redirectStartTime: 0,
        redirectEndTime: 0,
        postRedirectStartTime: (_b = timingInfo.startTime) != null ? _b : 0,
        finalServiceWorkerStartTime: 0,
        finalNetworkResponseStartTime: 0,
        finalNetworkRequestStartTime: 0,
        endTime: 0,
        encodedBodySize: 0,
        decodedBodySize: 0,
        finalConnectionTimingInfo: null
      };
    }
    __name(createOpaqueTimingInfo, "createOpaqueTimingInfo");
    function makePolicyContainer() {
      return {};
    }
    __name(makePolicyContainer, "makePolicyContainer");
    function clonePolicyContainer() {
      return {};
    }
    __name(clonePolicyContainer, "clonePolicyContainer");
    function determineRequestsReferrer(request) {
      var _a, _b, _c, _d, _e, _f, _g;
      const policy = request.referrerPolicy;
      if (policy == null || policy === "" || policy === "no-referrer") {
        return "no-referrer";
      }
      const environment = request.client;
      let referrerSource = null;
      if (request.referrer === "client") {
        if (((_c = (_b = (_a = request.client) == null ? void 0 : _a.globalObject) == null ? void 0 : _b.constructor) == null ? void 0 : _c.name) === "Window") {
          const origin = (_f = (_d = environment.globalObject.self) == null ? void 0 : _d.origin) != null ? _f : (_e = environment.globalObject.location) == null ? void 0 : _e.origin;
          if (origin == null || origin === "null")
            return "no-referrer";
          referrerSource = new URL(environment.globalObject.location.href);
        } else {
          if (((_g = environment == null ? void 0 : environment.globalObject) == null ? void 0 : _g.location) == null) {
            return "no-referrer";
          }
          referrerSource = new URL(environment.globalObject.location.href);
        }
      } else if (request.referrer instanceof URL) {
        referrerSource = request.referrer;
      } else {
        return "no-referrer";
      }
      const urlProtocol = referrerSource.protocol;
      if (urlProtocol === "about:" || urlProtocol === "data:" || urlProtocol === "blob:") {
        return "no-referrer";
      }
      let temp;
      let referrerOrigin;
      const referrerUrl = (temp = stripURLForReferrer(referrerSource)).length > 4096 ? referrerOrigin = stripURLForReferrer(referrerSource, true) : temp;
      const areSameOrigin = sameOrigin(request, referrerUrl);
      const isNonPotentiallyTrustWorthy = isURLPotentiallyTrustworthy(referrerUrl) && !isURLPotentiallyTrustworthy(request.url);
      switch (policy) {
        case "origin":
          return referrerOrigin != null ? referrerOrigin : stripURLForReferrer(referrerSource, true);
        case "unsafe-url":
          return referrerUrl;
        case "same-origin":
          return areSameOrigin ? referrerOrigin : "no-referrer";
        case "origin-when-cross-origin":
          return areSameOrigin ? referrerUrl : referrerOrigin;
        case "strict-origin-when-cross-origin":
          if (areSameOrigin)
            return referrerOrigin;
        case "strict-origin":
        case "no-referrer-when-downgrade":
        default:
          return isNonPotentiallyTrustWorthy ? "no-referrer" : referrerOrigin;
      }
      function stripURLForReferrer(url, originOnly = false) {
        const urlObject = new URL(url.href);
        urlObject.username = "";
        urlObject.password = "";
        urlObject.hash = "";
        return originOnly ? urlObject.origin : urlObject.href;
      }
      __name(stripURLForReferrer, "stripURLForReferrer");
    }
    __name(determineRequestsReferrer, "determineRequestsReferrer");
    function isURLPotentiallyTrustworthy(url) {
      if (!(url instanceof URL)) {
        return false;
      }
      if (url.href === "about:blank" || url.href === "about:srcdoc") {
        return true;
      }
      if (url.protocol === "data:")
        return true;
      if (url.protocol === "file:")
        return true;
      return isOriginPotentiallyTrustworthy(url.origin);
      function isOriginPotentiallyTrustworthy(origin) {
        if (origin == null || origin === "null")
          return false;
        const originAsURL = new URL(origin);
        if (originAsURL.protocol === "https:" || originAsURL.protocol === "wss:") {
          return true;
        }
        if (/^127(?:\.[0-9]+){0,2}\.[0-9]+$|^\[(?:0*:)*?:?0*1\]$/.test(originAsURL.hostname) || (originAsURL.hostname === "localhost" || originAsURL.hostname.includes("localhost.")) || originAsURL.hostname.endsWith(".localhost")) {
          return true;
        }
        return false;
      }
      __name(isOriginPotentiallyTrustworthy, "isOriginPotentiallyTrustworthy");
    }
    __name(isURLPotentiallyTrustworthy, "isURLPotentiallyTrustworthy");
    function bytesMatch(bytes, metadataList) {
      if (crypto === void 0) {
        return true;
      }
      const parsedMetadata = parseMetadata(metadataList);
      if (parsedMetadata === "no metadata") {
        return true;
      }
      if (parsedMetadata.length === 0) {
        return true;
      }
      const metadata = parsedMetadata.sort((c, d) => d.algo.localeCompare(c.algo));
      for (const item of metadata) {
        const algorithm = item.algo;
        const expectedValue = item.hash;
        const actualValue = crypto.createHash(algorithm).update(bytes).digest("base64");
        if (actualValue === expectedValue) {
          return true;
        }
      }
      return false;
    }
    __name(bytesMatch, "bytesMatch");
    var parseHashWithOptions = /((?<algo>sha256|sha384|sha512)-(?<hash>[A-z0-9+/]{1}.*={1,2}))( +[\x21-\x7e]?)?/i;
    function parseMetadata(metadata) {
      const result = [];
      let empty = true;
      const supportedHashes = crypto.getHashes();
      for (const token of metadata.split(" ")) {
        empty = false;
        const parsedToken = parseHashWithOptions.exec(token);
        if (parsedToken === null || parsedToken.groups === void 0) {
          continue;
        }
        const algorithm = parsedToken.groups.algo;
        if (supportedHashes.includes(algorithm.toLowerCase())) {
          result.push(parsedToken.groups);
        }
      }
      if (empty === true) {
        return "no metadata";
      }
      return result;
    }
    __name(parseMetadata, "parseMetadata");
    function tryUpgradeRequestToAPotentiallyTrustworthyURL(request) {
    }
    __name(tryUpgradeRequestToAPotentiallyTrustworthyURL, "tryUpgradeRequestToAPotentiallyTrustworthyURL");
    function sameOrigin(A, B) {
      if (A.protocol === B.protocol && A.hostname === B.hostname && A.port === B.port) {
        return true;
      }
      return false;
    }
    __name(sameOrigin, "sameOrigin");
    function createDeferredPromise() {
      let res;
      let rej;
      const promise = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
      });
      return { promise, resolve: res, reject: rej };
    }
    __name(createDeferredPromise, "createDeferredPromise");
    function isAborted(fetchParams) {
      return fetchParams.controller.state === "aborted";
    }
    __name(isAborted, "isAborted");
    function isCancelled(fetchParams) {
      return fetchParams.controller.state === "aborted" || fetchParams.controller.state === "terminated";
    }
    __name(isCancelled, "isCancelled");
    function normalizeMethod(method) {
      return /^(DELETE|GET|HEAD|OPTIONS|POST|PUT)$/i.test(method) ? method.toUpperCase() : method;
    }
    __name(normalizeMethod, "normalizeMethod");
    function serializeJavascriptValueToJSONString(value) {
      const result = JSON.stringify(value);
      if (result === void 0) {
        throw new TypeError("Value is not JSON serializable");
      }
      assert(typeof result === "string");
      return result;
    }
    __name(serializeJavascriptValueToJSONString, "serializeJavascriptValueToJSONString");
    var esIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
    function makeIterator(iterator, name) {
      const i = {
        next() {
          if (Object.getPrototypeOf(this) !== i) {
            throw new TypeError(
              `'next' called on an object that does not implement interface ${name} Iterator.`
            );
          }
          return iterator.next();
        },
        [Symbol.toStringTag]: `${name} Iterator`
      };
      Object.setPrototypeOf(i, esIteratorPrototype);
      return Object.setPrototypeOf({}, i);
    }
    __name(makeIterator, "makeIterator");
    async function fullyReadBody(body, processBody, processBodyError) {
      try {
        const chunks = [];
        let length = 0;
        const reader = body.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done === true) {
            break;
          }
          assert(isUint8Array(value));
          chunks.push(value);
          length += value.byteLength;
        }
        const fulfilledSteps = /* @__PURE__ */ __name((bytes) => queueMicrotask(() => {
          processBody(bytes);
        }), "fulfilledSteps");
        fulfilledSteps(Buffer.concat(chunks, length));
      } catch (err) {
        queueMicrotask(() => processBodyError(err));
      }
    }
    __name(fullyReadBody, "fullyReadBody");
    var hasOwn = Object.hasOwn || ((dict, key) => Object.prototype.hasOwnProperty.call(dict, key));
    module2.exports = {
      isAborted,
      isCancelled,
      createDeferredPromise,
      ReadableStreamFrom,
      toUSVString,
      tryUpgradeRequestToAPotentiallyTrustworthyURL,
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
      makeIterator,
      isValidHeaderName: isValidHeaderName2,
      isValidHeaderValue: isValidHeaderValue2,
      hasOwn,
      isErrorLike,
      fullyReadBody,
      bytesMatch
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/webidl.js
var require_webidl = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/webidl.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { types } = require("util");
    var { hasOwn, toUSVString } = require_util2();
    var webidl = {};
    webidl.converters = {};
    webidl.util = {};
    webidl.errors = {};
    webidl.errors.exception = function(message) {
      throw new TypeError(`${message.header}: ${message.message}`);
    };
    webidl.errors.conversionFailed = function(context) {
      const plural = context.types.length === 1 ? "" : " one of";
      const message = `${context.argument} could not be converted to${plural}: ${context.types.join(", ")}.`;
      return webidl.errors.exception({
        header: context.prefix,
        message
      });
    };
    webidl.errors.invalidArgument = function(context) {
      return webidl.errors.exception({
        header: context.prefix,
        message: `"${context.value}" is an invalid ${context.type}.`
      });
    };
    webidl.util.Type = function(V) {
      switch (typeof V) {
        case "undefined":
          return "Undefined";
        case "boolean":
          return "Boolean";
        case "string":
          return "String";
        case "symbol":
          return "Symbol";
        case "number":
          return "Number";
        case "bigint":
          return "BigInt";
        case "function":
        case "object": {
          if (V === null) {
            return "Null";
          }
          return "Object";
        }
      }
    };
    webidl.util.ConvertToInt = function(V, bitLength, signedness, opts = {}) {
      let upperBound;
      let lowerBound;
      if (bitLength === 64) {
        upperBound = Math.pow(2, 53) - 1;
        if (signedness === "unsigned") {
          lowerBound = 0;
        } else {
          lowerBound = Math.pow(-2, 53) + 1;
        }
      } else if (signedness === "unsigned") {
        lowerBound = 0;
        upperBound = Math.pow(2, bitLength) - 1;
      } else {
        lowerBound = Math.pow(-2, bitLength) - 1;
        upperBound = Math.pow(2, bitLength - 1) - 1;
      }
      let x = Number(V);
      if (Object.is(-0, x)) {
        x = 0;
      }
      if (opts.enforceRange === true) {
        if (Number.isNaN(x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) {
          webidl.errors.exception({
            header: "Integer conversion",
            message: `Could not convert ${V} to an integer.`
          });
        }
        x = webidl.util.IntegerPart(x);
        if (x < lowerBound || x > upperBound) {
          webidl.errors.exception({
            header: "Integer conversion",
            message: `Value must be between ${lowerBound}-${upperBound}, got ${x}.`
          });
        }
        return x;
      }
      if (!Number.isNaN(x) && opts.clamp === true) {
        x = Math.min(Math.max(x, lowerBound), upperBound);
        if (Math.floor(x) % 2 === 0) {
          x = Math.floor(x);
        } else {
          x = Math.ceil(x);
        }
        return x;
      }
      if (Number.isNaN(x) || Object.is(0, x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) {
        return 0;
      }
      x = webidl.util.IntegerPart(x);
      x = x % Math.pow(2, bitLength);
      if (signedness === "signed" && x >= Math.pow(2, bitLength) - 1) {
        return x - Math.pow(2, bitLength);
      }
      return x;
    };
    webidl.util.IntegerPart = function(n) {
      const r = Math.floor(Math.abs(n));
      if (n < 0) {
        return -1 * r;
      }
      return r;
    };
    webidl.sequenceConverter = function(converter) {
      return (V) => {
        var _a;
        if (webidl.util.Type(V) !== "Object") {
          webidl.errors.exception({
            header: "Sequence",
            message: `Value of type ${webidl.util.Type(V)} is not an Object.`
          });
        }
        const method = (_a = V == null ? void 0 : V[Symbol.iterator]) == null ? void 0 : _a.call(V);
        const seq = [];
        if (method === void 0 || typeof method.next !== "function") {
          webidl.errors.exception({
            header: "Sequence",
            message: "Object is not an iterator."
          });
        }
        while (true) {
          const { done, value } = method.next();
          if (done) {
            break;
          }
          seq.push(converter(value));
        }
        return seq;
      };
    };
    webidl.recordConverter = function(keyConverter, valueConverter) {
      return (V) => {
        const record = {};
        const type = webidl.util.Type(V);
        if (type === "Undefined" || type === "Null") {
          return record;
        }
        if (type !== "Object") {
          webidl.errors.exception({
            header: "Record",
            message: `Expected ${V} to be an Object type.`
          });
        }
        for (let [key, value] of Object.entries(V)) {
          key = keyConverter(key);
          value = valueConverter(value);
          record[key] = value;
        }
        return record;
      };
    };
    webidl.interfaceConverter = function(i) {
      return (V, opts = {}) => {
        if (opts.strict !== false && !(V instanceof i)) {
          webidl.errors.exception({
            header: i.name,
            message: `Expected ${V} to be an instance of ${i.name}.`
          });
        }
        return V;
      };
    };
    webidl.dictionaryConverter = function(converters) {
      return (dictionary) => {
        const type = webidl.util.Type(dictionary);
        const dict = {};
        if (type !== "Null" && type !== "Undefined" && type !== "Object") {
          webidl.errors.exception({
            header: "Dictionary",
            message: `Expected ${dictionary} to be one of: Null, Undefined, Object.`
          });
        }
        for (const options of converters) {
          const { key, defaultValue, required, converter } = options;
          if (required === true) {
            if (!hasOwn(dictionary, key)) {
              webidl.errors.exception({
                header: "Dictionary",
                message: `Missing required key "${key}".`
              });
            }
          }
          let value = dictionary[key];
          const hasDefault = hasOwn(options, "defaultValue");
          if (hasDefault && value !== null) {
            value = value != null ? value : defaultValue;
          }
          if (required || hasDefault || value !== void 0) {
            value = converter(value);
            if (options.allowedValues && !options.allowedValues.includes(value)) {
              webidl.errors.exception({
                header: "Dictionary",
                message: `${value} is not an accepted type. Expected one of ${options.allowedValues.join(", ")}.`
              });
            }
            dict[key] = value;
          }
        }
        return dict;
      };
    };
    webidl.nullableConverter = function(converter) {
      return (V) => {
        if (V === null) {
          return V;
        }
        return converter(V);
      };
    };
    webidl.converters.DOMString = function(V, opts = {}) {
      if (V === null && opts.legacyNullToEmptyString) {
        return "";
      }
      if (typeof V === "symbol") {
        throw new TypeError("Could not convert argument of type symbol to string.");
      }
      return String(V);
    };
    webidl.converters.ByteString = function(V) {
      const x = webidl.converters.DOMString(V);
      for (let index = 0; index < x.length; index++) {
        const charCode = x.charCodeAt(index);
        if (charCode > 255) {
          throw new TypeError(
            `Cannot convert argument to a ByteString because the character atindex ${index} has a value of ${charCode} which is greater than 255.`
          );
        }
      }
      return x;
    };
    webidl.converters.USVString = toUSVString;
    webidl.converters.boolean = function(V) {
      const x = Boolean(V);
      return x;
    };
    webidl.converters.any = function(V) {
      return V;
    };
    webidl.converters["long long"] = function(V, opts) {
      const x = webidl.util.ConvertToInt(V, 64, "signed", opts);
      return x;
    };
    webidl.converters["unsigned short"] = function(V) {
      const x = webidl.util.ConvertToInt(V, 16, "unsigned");
      return x;
    };
    webidl.converters.ArrayBuffer = function(V, opts = {}) {
      if (webidl.util.Type(V) !== "Object" || !types.isAnyArrayBuffer(V)) {
        webidl.errors.conversionFailed({
          prefix: `${V}`,
          argument: `${V}`,
          types: ["ArrayBuffer"]
        });
      }
      if (opts.allowShared === false && types.isSharedArrayBuffer(V)) {
        webidl.errors.exception({
          header: "ArrayBuffer",
          message: "SharedArrayBuffer is not allowed."
        });
      }
      return V;
    };
    webidl.converters.TypedArray = function(V, T, opts = {}) {
      if (webidl.util.Type(V) !== "Object" || !types.isTypedArray(V) || V.constructor.name !== T.name) {
        webidl.errors.conversionFailed({
          prefix: `${T.name}`,
          argument: `${V}`,
          types: [T.name]
        });
      }
      if (opts.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
        webidl.errors.exception({
          header: "ArrayBuffer",
          message: "SharedArrayBuffer is not allowed."
        });
      }
      return V;
    };
    webidl.converters.DataView = function(V, opts = {}) {
      if (webidl.util.Type(V) !== "Object" || !types.isDataView(V)) {
        webidl.errors.exception({
          header: "DataView",
          message: "Object is not a DataView."
        });
      }
      if (opts.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
        webidl.errors.exception({
          header: "ArrayBuffer",
          message: "SharedArrayBuffer is not allowed."
        });
      }
      return V;
    };
    webidl.converters.BufferSource = function(V, opts = {}) {
      if (types.isAnyArrayBuffer(V)) {
        return webidl.converters.ArrayBuffer(V, opts);
      }
      if (types.isTypedArray(V)) {
        return webidl.converters.TypedArray(V, V.constructor);
      }
      if (types.isDataView(V)) {
        return webidl.converters.DataView(V, opts);
      }
      throw new TypeError(`Could not convert ${V} to a BufferSource.`);
    };
    webidl.converters["sequence<ByteString>"] = webidl.sequenceConverter(
      webidl.converters.ByteString
    );
    webidl.converters["sequence<sequence<ByteString>>"] = webidl.sequenceConverter(
      webidl.converters["sequence<ByteString>"]
    );
    webidl.converters["record<ByteString, ByteString>"] = webidl.recordConverter(
      webidl.converters.ByteString,
      webidl.converters.ByteString
    );
    module2.exports = {
      webidl
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/headers.js
var require_headers = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/headers.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { kHeadersList: kHeadersList2 } = require_symbols();
    var { kGuard: kGuard2 } = require_symbols2();
    var { kEnumerableProperty } = require_util();
    var {
      makeIterator,
      isValidHeaderName: isValidHeaderName2,
      isValidHeaderValue: isValidHeaderValue2
    } = require_util2();
    var { webidl } = require_webidl();
    var kHeadersMap = Symbol("headers map");
    var kHeadersSortedMap = Symbol("headers map sorted");
    function headerValueNormalize(potentialValue) {
      return potentialValue.replace(
        /^[\r\n\t ]+|[\r\n\t ]+$/g,
        ""
      );
    }
    __name(headerValueNormalize, "headerValueNormalize");
    function fill(headers, object) {
      if (Array.isArray(object)) {
        for (const header of object) {
          if (header.length !== 2) {
            webidl.errors.exception({
              header: "Headers constructor",
              message: `expected name/value pair to be length 2, found ${header.length}.`
            });
          }
          headers.append(header[0], header[1]);
        }
      } else if (typeof object === "object" && object !== null) {
        for (const [key, value] of Object.entries(object)) {
          headers.append(key, value);
        }
      } else {
        webidl.errors.conversionFailed({
          prefix: "Headers constructor",
          argument: "Argument 1",
          types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
        });
      }
    }
    __name(fill, "fill");
    var HeadersList2 = class {
      constructor(init) {
        if (init instanceof HeadersList2) {
          this[kHeadersMap] = new Map(init[kHeadersMap]);
          this[kHeadersSortedMap] = init[kHeadersSortedMap];
        } else {
          this[kHeadersMap] = new Map(init);
          this[kHeadersSortedMap] = null;
        }
      }
      contains(name) {
        name = name.toLowerCase();
        return this[kHeadersMap].has(name);
      }
      clear() {
        this[kHeadersMap].clear();
        this[kHeadersSortedMap] = null;
      }
      append(name, value) {
        this[kHeadersSortedMap] = null;
        name = name.toLowerCase();
        const exists = this[kHeadersMap].get(name);
        if (exists) {
          this[kHeadersMap].set(name, `${exists}, ${value}`);
        } else {
          this[kHeadersMap].set(name, `${value}`);
        }
      }
      set(name, value) {
        this[kHeadersSortedMap] = null;
        name = name.toLowerCase();
        return this[kHeadersMap].set(name, value);
      }
      delete(name) {
        this[kHeadersSortedMap] = null;
        name = name.toLowerCase();
        return this[kHeadersMap].delete(name);
      }
      get(name) {
        var _a;
        name = name.toLowerCase();
        if (!this.contains(name)) {
          return null;
        }
        return (_a = this[kHeadersMap].get(name)) != null ? _a : null;
      }
      has(name) {
        name = name.toLowerCase();
        return this[kHeadersMap].has(name);
      }
      keys() {
        return this[kHeadersMap].keys();
      }
      values() {
        return this[kHeadersMap].values();
      }
      entries() {
        return this[kHeadersMap].entries();
      }
      [Symbol.iterator]() {
        return this[kHeadersMap][Symbol.iterator]();
      }
    };
    __name(HeadersList2, "HeadersList");
    var Headers3 = class {
      constructor(init = void 0) {
        this[kHeadersList2] = new HeadersList2();
        this[kGuard2] = "none";
        if (init !== void 0) {
          init = webidl.converters.HeadersInit(init);
          fill(this, init);
        }
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      append(name, value) {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 2) {
          throw new TypeError(
            `Failed to execute 'append' on 'Headers': 2 arguments required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.ByteString(name);
        value = webidl.converters.ByteString(value);
        value = headerValueNormalize(value);
        if (!isValidHeaderName2(name)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.append",
            value: name,
            type: "header name"
          });
        } else if (!isValidHeaderValue2(value)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.append",
            value,
            type: "header value"
          });
        }
        if (this[kGuard2] === "immutable") {
          throw new TypeError("immutable");
        } else if (this[kGuard2] === "request-no-cors") {
        }
        return this[kHeadersList2].append(name, value);
      }
      delete(name) {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'delete' on 'Headers': 1 argument required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.ByteString(name);
        if (!isValidHeaderName2(name)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.delete",
            value: name,
            type: "header name"
          });
        }
        if (this[kGuard2] === "immutable") {
          throw new TypeError("immutable");
        } else if (this[kGuard2] === "request-no-cors") {
        }
        if (!this[kHeadersList2].contains(name)) {
          return;
        }
        return this[kHeadersList2].delete(name);
      }
      get(name) {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'get' on 'Headers': 1 argument required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.ByteString(name);
        if (!isValidHeaderName2(name)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.get",
            value: name,
            type: "header name"
          });
        }
        return this[kHeadersList2].get(name);
      }
      has(name) {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'has' on 'Headers': 1 argument required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.ByteString(name);
        if (!isValidHeaderName2(name)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.has",
            value: name,
            type: "header name"
          });
        }
        return this[kHeadersList2].contains(name);
      }
      set(name, value) {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 2) {
          throw new TypeError(
            `Failed to execute 'set' on 'Headers': 2 arguments required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.ByteString(name);
        value = webidl.converters.ByteString(value);
        value = headerValueNormalize(value);
        if (!isValidHeaderName2(name)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.set",
            value: name,
            type: "header name"
          });
        } else if (!isValidHeaderValue2(value)) {
          webidl.errors.invalidArgument({
            prefix: "Headers.set",
            value,
            type: "header value"
          });
        }
        if (this[kGuard2] === "immutable") {
          throw new TypeError("immutable");
        } else if (this[kGuard2] === "request-no-cors") {
        }
        return this[kHeadersList2].set(name, value);
      }
      get [kHeadersSortedMap]() {
        if (!this[kHeadersList2][kHeadersSortedMap]) {
          this[kHeadersList2][kHeadersSortedMap] = new Map([...this[kHeadersList2]].sort((a, b) => a[0] < b[0] ? -1 : 1));
        }
        return this[kHeadersList2][kHeadersSortedMap];
      }
      keys() {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(this[kHeadersSortedMap].keys(), "Headers");
      }
      values() {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(this[kHeadersSortedMap].values(), "Headers");
      }
      entries() {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(this[kHeadersSortedMap].entries(), "Headers");
      }
      forEach(callbackFn, thisArg = globalThis) {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'forEach' on 'Headers': 1 argument required, but only ${arguments.length} present.`
          );
        }
        if (typeof callbackFn !== "function") {
          throw new TypeError(
            "Failed to execute 'forEach' on 'Headers': parameter 1 is not of type 'Function'."
          );
        }
        for (const [key, value] of this) {
          callbackFn.apply(thisArg, [value, key, this]);
        }
      }
      [Symbol.for("nodejs.util.inspect.custom")]() {
        if (!(this instanceof Headers3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kHeadersList2];
      }
    };
    __name(Headers3, "Headers");
    Headers3.prototype[Symbol.iterator] = Headers3.prototype.entries;
    Object.defineProperties(Headers3.prototype, {
      append: kEnumerableProperty,
      delete: kEnumerableProperty,
      get: kEnumerableProperty,
      has: kEnumerableProperty,
      set: kEnumerableProperty,
      keys: kEnumerableProperty,
      values: kEnumerableProperty,
      entries: kEnumerableProperty,
      forEach: kEnumerableProperty
    });
    webidl.converters.HeadersInit = function(V) {
      if (webidl.util.Type(V) === "Object") {
        if (V[Symbol.iterator]) {
          return webidl.converters["sequence<sequence<ByteString>>"](V);
        }
        return webidl.converters["record<ByteString, ByteString>"](V);
      }
      webidl.errors.conversionFailed({
        prefix: "Headers constructor",
        argument: "Argument 1",
        types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
      });
    };
    module2.exports = {
      fill,
      Headers: Headers3,
      HeadersList: HeadersList2
    };
  }
});

// ../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/utils.js
var require_utils = __commonJS({
  "../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/utils.js"(exports, module2) {
    "use strict";
    init_define_process();
    function parseContentType(str) {
      if (str.length === 0)
        return;
      const params = /* @__PURE__ */ Object.create(null);
      let i = 0;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (code !== 47 || i === 0)
            return;
          break;
        }
      }
      if (i === str.length)
        return;
      const type = str.slice(0, i).toLowerCase();
      const subtypeStart = ++i;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (i === subtypeStart)
            return;
          if (parseContentTypeParams(str, i, params) === void 0)
            return;
          break;
        }
      }
      if (i === subtypeStart)
        return;
      const subtype = str.slice(subtypeStart, i).toLowerCase();
      return { type, subtype, params };
    }
    __name(parseContentType, "parseContentType");
    function parseContentTypeParams(str, i, params) {
      while (i < str.length) {
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          break;
        if (str.charCodeAt(i++) !== 59)
          return;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          return;
        let name;
        const nameStart = i;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (TOKEN[code] !== 1) {
            if (code !== 61)
              return;
            break;
          }
        }
        if (i === str.length)
          return;
        name = str.slice(nameStart, i);
        ++i;
        if (i === str.length)
          return;
        let value = "";
        let valueStart;
        if (str.charCodeAt(i) === 34) {
          valueStart = ++i;
          let escaping = false;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (code === 92) {
              if (escaping) {
                valueStart = i;
                escaping = false;
              } else {
                value += str.slice(valueStart, i);
                escaping = true;
              }
              continue;
            }
            if (code === 34) {
              if (escaping) {
                valueStart = i;
                escaping = false;
                continue;
              }
              value += str.slice(valueStart, i);
              break;
            }
            if (escaping) {
              valueStart = i - 1;
              escaping = false;
            }
            if (QDTEXT[code] !== 1)
              return;
          }
          if (i === str.length)
            return;
          ++i;
        } else {
          valueStart = i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (TOKEN[code] !== 1) {
              if (i === valueStart)
                return;
              break;
            }
          }
          value = str.slice(valueStart, i);
        }
        name = name.toLowerCase();
        if (params[name] === void 0)
          params[name] = value;
      }
      return params;
    }
    __name(parseContentTypeParams, "parseContentTypeParams");
    function parseDisposition(str, defDecoder) {
      if (str.length === 0)
        return;
      const params = /* @__PURE__ */ Object.create(null);
      let i = 0;
      for (; i < str.length; ++i) {
        const code = str.charCodeAt(i);
        if (TOKEN[code] !== 1) {
          if (parseDispositionParams(str, i, params, defDecoder) === void 0)
            return;
          break;
        }
      }
      const type = str.slice(0, i).toLowerCase();
      return { type, params };
    }
    __name(parseDisposition, "parseDisposition");
    function parseDispositionParams(str, i, params, defDecoder) {
      while (i < str.length) {
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          break;
        if (str.charCodeAt(i++) !== 59)
          return;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (code !== 32 && code !== 9)
            break;
        }
        if (i === str.length)
          return;
        let name;
        const nameStart = i;
        for (; i < str.length; ++i) {
          const code = str.charCodeAt(i);
          if (TOKEN[code] !== 1) {
            if (code === 61)
              break;
            return;
          }
        }
        if (i === str.length)
          return;
        let value = "";
        let valueStart;
        let charset;
        name = str.slice(nameStart, i);
        if (name.charCodeAt(name.length - 1) === 42) {
          const charsetStart = ++i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (CHARSET[code] !== 1) {
              if (code !== 39)
                return;
              break;
            }
          }
          if (i === str.length)
            return;
          charset = str.slice(charsetStart, i);
          ++i;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (code === 39)
              break;
          }
          if (i === str.length)
            return;
          ++i;
          if (i === str.length)
            return;
          valueStart = i;
          let encode = 0;
          for (; i < str.length; ++i) {
            const code = str.charCodeAt(i);
            if (EXTENDED_VALUE[code] !== 1) {
              if (code === 37) {
                let hexUpper;
                let hexLower;
                if (i + 2 < str.length && (hexUpper = HEX_VALUES[str.charCodeAt(i + 1)]) !== -1 && (hexLower = HEX_VALUES[str.charCodeAt(i + 2)]) !== -1) {
                  const byteVal = (hexUpper << 4) + hexLower;
                  value += str.slice(valueStart, i);
                  value += String.fromCharCode(byteVal);
                  i += 2;
                  valueStart = i + 1;
                  if (byteVal >= 128)
                    encode = 2;
                  else if (encode === 0)
                    encode = 1;
                  continue;
                }
                return;
              }
              break;
            }
          }
          value += str.slice(valueStart, i);
          value = convertToUTF8(value, charset, encode);
          if (value === void 0)
            return;
        } else {
          ++i;
          if (i === str.length)
            return;
          if (str.charCodeAt(i) === 34) {
            valueStart = ++i;
            let escaping = false;
            for (; i < str.length; ++i) {
              const code = str.charCodeAt(i);
              if (code === 92) {
                if (escaping) {
                  valueStart = i;
                  escaping = false;
                } else {
                  value += str.slice(valueStart, i);
                  escaping = true;
                }
                continue;
              }
              if (code === 34) {
                if (escaping) {
                  valueStart = i;
                  escaping = false;
                  continue;
                }
                value += str.slice(valueStart, i);
                break;
              }
              if (escaping) {
                valueStart = i - 1;
                escaping = false;
              }
              if (QDTEXT[code] !== 1)
                return;
            }
            if (i === str.length)
              return;
            ++i;
          } else {
            valueStart = i;
            for (; i < str.length; ++i) {
              const code = str.charCodeAt(i);
              if (TOKEN[code] !== 1) {
                if (i === valueStart)
                  return;
                break;
              }
            }
            value = str.slice(valueStart, i);
          }
          value = defDecoder(value, 2);
          if (value === void 0)
            return;
        }
        name = name.toLowerCase();
        if (params[name] === void 0)
          params[name] = value;
      }
      return params;
    }
    __name(parseDispositionParams, "parseDispositionParams");
    function getDecoder(charset) {
      let lc;
      while (true) {
        switch (charset) {
          case "utf-8":
          case "utf8":
            return decoders.utf8;
          case "latin1":
          case "ascii":
          case "us-ascii":
          case "iso-8859-1":
          case "iso8859-1":
          case "iso88591":
          case "iso_8859-1":
          case "windows-1252":
          case "iso_8859-1:1987":
          case "cp1252":
          case "x-cp1252":
            return decoders.latin1;
          case "utf16le":
          case "utf-16le":
          case "ucs2":
          case "ucs-2":
            return decoders.utf16le;
          case "base64":
            return decoders.base64;
          default:
            if (lc === void 0) {
              lc = true;
              charset = charset.toLowerCase();
              continue;
            }
            return decoders.other.bind(charset);
        }
      }
    }
    __name(getDecoder, "getDecoder");
    var decoders = {
      utf8: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string") {
          if (hint < 2)
            return data;
          data = Buffer.from(data, "latin1");
        }
        return data.utf8Slice(0, data.length);
      },
      latin1: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          return data;
        return data.latin1Slice(0, data.length);
      },
      utf16le: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        return data.ucs2Slice(0, data.length);
      },
      base64: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        return data.base64Slice(0, data.length);
      },
      other: (data, hint) => {
        if (data.length === 0)
          return "";
        if (typeof data === "string")
          data = Buffer.from(data, "latin1");
        try {
          const decoder = new TextDecoder(exports);
          return decoder.decode(data);
        } catch {
        }
      }
    };
    function convertToUTF8(data, charset, hint) {
      const decode = getDecoder(charset);
      if (decode)
        return decode(data, hint);
    }
    __name(convertToUTF8, "convertToUTF8");
    function basename(path) {
      if (typeof path !== "string")
        return "";
      for (let i = path.length - 1; i >= 0; --i) {
        switch (path.charCodeAt(i)) {
          case 47:
          case 92:
            path = path.slice(i + 1);
            return path === ".." || path === "." ? "" : path;
        }
      }
      return path === ".." || path === "." ? "" : path;
    }
    __name(basename, "basename");
    var TOKEN = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var QDTEXT = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1
    ];
    var CHARSET = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var EXTENDED_VALUE = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var HEX_VALUES = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    module2.exports = {
      basename,
      convertToUTF8,
      getDecoder,
      parseContentType,
      parseDisposition
    };
  }
});

// ../../node_modules/.pnpm/streamsearch@1.1.0/node_modules/streamsearch/lib/sbmh.js
var require_sbmh = __commonJS({
  "../../node_modules/.pnpm/streamsearch@1.1.0/node_modules/streamsearch/lib/sbmh.js"(exports, module2) {
    "use strict";
    init_define_process();
    function memcmp(buf1, pos1, buf2, pos2, num) {
      for (let i = 0; i < num; ++i) {
        if (buf1[pos1 + i] !== buf2[pos2 + i])
          return false;
      }
      return true;
    }
    __name(memcmp, "memcmp");
    var SBMH = class {
      constructor(needle, cb) {
        if (typeof cb !== "function")
          throw new Error("Missing match callback");
        if (typeof needle === "string")
          needle = Buffer.from(needle);
        else if (!Buffer.isBuffer(needle))
          throw new Error(`Expected Buffer for needle, got ${typeof needle}`);
        const needleLen = needle.length;
        this.maxMatches = Infinity;
        this.matches = 0;
        this._cb = cb;
        this._lookbehindSize = 0;
        this._needle = needle;
        this._bufPos = 0;
        this._lookbehind = Buffer.allocUnsafe(needleLen);
        this._occ = [
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen,
          needleLen
        ];
        if (needleLen > 1) {
          for (let i = 0; i < needleLen - 1; ++i)
            this._occ[needle[i]] = needleLen - 1 - i;
        }
      }
      reset() {
        this.matches = 0;
        this._lookbehindSize = 0;
        this._bufPos = 0;
      }
      push(chunk, pos) {
        let result;
        if (!Buffer.isBuffer(chunk))
          chunk = Buffer.from(chunk, "latin1");
        const chunkLen = chunk.length;
        this._bufPos = pos || 0;
        while (result !== chunkLen && this.matches < this.maxMatches)
          result = feed(this, chunk);
        return result;
      }
      destroy() {
        const lbSize = this._lookbehindSize;
        if (lbSize)
          this._cb(false, this._lookbehind, 0, lbSize, false);
        this.reset();
      }
    };
    __name(SBMH, "SBMH");
    function feed(self, data) {
      const len = data.length;
      const needle = self._needle;
      const needleLen = needle.length;
      let pos = -self._lookbehindSize;
      const lastNeedleCharPos = needleLen - 1;
      const lastNeedleChar = needle[lastNeedleCharPos];
      const end = len - needleLen;
      const occ = self._occ;
      const lookbehind = self._lookbehind;
      if (pos < 0) {
        while (pos < 0 && pos <= end) {
          const nextPos = pos + lastNeedleCharPos;
          const ch = nextPos < 0 ? lookbehind[self._lookbehindSize + nextPos] : data[nextPos];
          if (ch === lastNeedleChar && matchNeedle(self, data, pos, lastNeedleCharPos)) {
            self._lookbehindSize = 0;
            ++self.matches;
            if (pos > -self._lookbehindSize)
              self._cb(true, lookbehind, 0, self._lookbehindSize + pos, false);
            else
              self._cb(true, void 0, 0, 0, true);
            return self._bufPos = pos + needleLen;
          }
          pos += occ[ch];
        }
        while (pos < 0 && !matchNeedle(self, data, pos, len - pos))
          ++pos;
        if (pos < 0) {
          const bytesToCutOff = self._lookbehindSize + pos;
          if (bytesToCutOff > 0) {
            self._cb(false, lookbehind, 0, bytesToCutOff, false);
          }
          self._lookbehindSize -= bytesToCutOff;
          lookbehind.copy(lookbehind, 0, bytesToCutOff, self._lookbehindSize);
          lookbehind.set(data, self._lookbehindSize);
          self._lookbehindSize += len;
          self._bufPos = len;
          return len;
        }
        self._cb(false, lookbehind, 0, self._lookbehindSize, false);
        self._lookbehindSize = 0;
      }
      pos += self._bufPos;
      const firstNeedleChar = needle[0];
      while (pos <= end) {
        const ch = data[pos + lastNeedleCharPos];
        if (ch === lastNeedleChar && data[pos] === firstNeedleChar && memcmp(needle, 0, data, pos, lastNeedleCharPos)) {
          ++self.matches;
          if (pos > 0)
            self._cb(true, data, self._bufPos, pos, true);
          else
            self._cb(true, void 0, 0, 0, true);
          return self._bufPos = pos + needleLen;
        }
        pos += occ[ch];
      }
      while (pos < len) {
        if (data[pos] !== firstNeedleChar || !memcmp(data, pos, needle, 0, len - pos)) {
          ++pos;
          continue;
        }
        data.copy(lookbehind, 0, pos, len);
        self._lookbehindSize = len - pos;
        break;
      }
      if (pos > 0)
        self._cb(false, data, self._bufPos, pos < len ? pos : len, true);
      self._bufPos = len;
      return len;
    }
    __name(feed, "feed");
    function matchNeedle(self, data, pos, len) {
      const lb = self._lookbehind;
      const lbSize = self._lookbehindSize;
      const needle = self._needle;
      for (let i = 0; i < len; ++i, ++pos) {
        const ch = pos < 0 ? lb[lbSize + pos] : data[pos];
        if (ch !== needle[i])
          return false;
      }
      return true;
    }
    __name(matchNeedle, "matchNeedle");
    module2.exports = SBMH;
  }
});

// ../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/types/multipart.js
var require_multipart = __commonJS({
  "../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/types/multipart.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { Readable, Writable } = require("stream");
    var StreamSearch = require_sbmh();
    var {
      basename,
      convertToUTF8,
      getDecoder,
      parseContentType,
      parseDisposition
    } = require_utils();
    var BUF_CRLF = Buffer.from("\r\n");
    var BUF_CR = Buffer.from("\r");
    var BUF_DASH = Buffer.from("-");
    function noop() {
    }
    __name(noop, "noop");
    var MAX_HEADER_PAIRS = 2e3;
    var MAX_HEADER_SIZE = 16 * 1024;
    var HPARSER_NAME = 0;
    var HPARSER_PRE_OWS = 1;
    var HPARSER_VALUE = 2;
    var HeaderParser = class {
      constructor(cb) {
        this.header = /* @__PURE__ */ Object.create(null);
        this.pairCount = 0;
        this.byteCount = 0;
        this.state = HPARSER_NAME;
        this.name = "";
        this.value = "";
        this.crlf = 0;
        this.cb = cb;
      }
      reset() {
        this.header = /* @__PURE__ */ Object.create(null);
        this.pairCount = 0;
        this.byteCount = 0;
        this.state = HPARSER_NAME;
        this.name = "";
        this.value = "";
        this.crlf = 0;
      }
      push(chunk, pos, end) {
        let start = pos;
        while (pos < end) {
          switch (this.state) {
            case HPARSER_NAME: {
              let done = false;
              for (; pos < end; ++pos) {
                if (this.byteCount === MAX_HEADER_SIZE)
                  return -1;
                ++this.byteCount;
                const code = chunk[pos];
                if (TOKEN[code] !== 1) {
                  if (code !== 58)
                    return -1;
                  this.name += chunk.latin1Slice(start, pos);
                  if (this.name.length === 0)
                    return -1;
                  ++pos;
                  done = true;
                  this.state = HPARSER_PRE_OWS;
                  break;
                }
              }
              if (!done) {
                this.name += chunk.latin1Slice(start, pos);
                break;
              }
            }
            case HPARSER_PRE_OWS: {
              let done = false;
              for (; pos < end; ++pos) {
                if (this.byteCount === MAX_HEADER_SIZE)
                  return -1;
                ++this.byteCount;
                const code = chunk[pos];
                if (code !== 32 && code !== 9) {
                  start = pos;
                  done = true;
                  this.state = HPARSER_VALUE;
                  break;
                }
              }
              if (!done)
                break;
            }
            case HPARSER_VALUE:
              switch (this.crlf) {
                case 0:
                  for (; pos < end; ++pos) {
                    if (this.byteCount === MAX_HEADER_SIZE)
                      return -1;
                    ++this.byteCount;
                    const code = chunk[pos];
                    if (FIELD_VCHAR[code] !== 1) {
                      if (code !== 13)
                        return -1;
                      ++this.crlf;
                      break;
                    }
                  }
                  this.value += chunk.latin1Slice(start, pos++);
                  break;
                case 1:
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  if (chunk[pos++] !== 10)
                    return -1;
                  ++this.crlf;
                  break;
                case 2: {
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  const code = chunk[pos];
                  if (code === 32 || code === 9) {
                    start = pos;
                    this.crlf = 0;
                  } else {
                    if (++this.pairCount < MAX_HEADER_PAIRS) {
                      this.name = this.name.toLowerCase();
                      if (this.header[this.name] === void 0)
                        this.header[this.name] = [this.value];
                      else
                        this.header[this.name].push(this.value);
                    }
                    if (code === 13) {
                      ++this.crlf;
                      ++pos;
                    } else {
                      start = pos;
                      this.crlf = 0;
                      this.state = HPARSER_NAME;
                      this.name = "";
                      this.value = "";
                    }
                  }
                  break;
                }
                case 3: {
                  if (this.byteCount === MAX_HEADER_SIZE)
                    return -1;
                  ++this.byteCount;
                  if (chunk[pos++] !== 10)
                    return -1;
                  const header = this.header;
                  this.reset();
                  this.cb(header);
                  return pos;
                }
              }
              break;
          }
        }
        return pos;
      }
    };
    __name(HeaderParser, "HeaderParser");
    var FileStream = class extends Readable {
      constructor(opts, owner) {
        super(opts);
        this.truncated = false;
        this._readcb = null;
        this.once("end", () => {
          this._read();
          if (--owner._fileEndsLeft === 0 && owner._finalcb) {
            const cb = owner._finalcb;
            owner._finalcb = null;
            define_process_default.nextTick(cb);
          }
        });
      }
      _read(n) {
        const cb = this._readcb;
        if (cb) {
          this._readcb = null;
          cb();
        }
      }
    };
    __name(FileStream, "FileStream");
    var ignoreData = {
      push: (chunk, pos) => {
      },
      destroy: () => {
      }
    };
    function callAndUnsetCb(self, err) {
      const cb = self._writecb;
      self._writecb = null;
      if (err)
        self.destroy(err);
      else if (cb)
        cb();
    }
    __name(callAndUnsetCb, "callAndUnsetCb");
    function nullDecoder(val, hint) {
      return val;
    }
    __name(nullDecoder, "nullDecoder");
    var Multipart = class extends Writable {
      constructor(cfg) {
        const streamOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.highWaterMark === "number" ? cfg.highWaterMark : void 0
        };
        super(streamOpts);
        if (!cfg.conType.params || typeof cfg.conType.params.boundary !== "string")
          throw new Error("Multipart: Boundary not found");
        const boundary = cfg.conType.params.boundary;
        const paramDecoder = typeof cfg.defParamCharset === "string" && cfg.defParamCharset ? getDecoder(cfg.defParamCharset) : nullDecoder;
        const defCharset = cfg.defCharset || "utf8";
        const preservePath = cfg.preservePath;
        const fileOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.fileHwm === "number" ? cfg.fileHwm : void 0
        };
        const limits = cfg.limits;
        const fieldSizeLimit = limits && typeof limits.fieldSize === "number" ? limits.fieldSize : 1 * 1024 * 1024;
        const fileSizeLimit = limits && typeof limits.fileSize === "number" ? limits.fileSize : Infinity;
        const filesLimit = limits && typeof limits.files === "number" ? limits.files : Infinity;
        const fieldsLimit = limits && typeof limits.fields === "number" ? limits.fields : Infinity;
        const partsLimit = limits && typeof limits.parts === "number" ? limits.parts : Infinity;
        let parts = -1;
        let fields = 0;
        let files = 0;
        let skipPart = false;
        this._fileEndsLeft = 0;
        this._fileStream = void 0;
        this._complete = false;
        let fileSize = 0;
        let field;
        let fieldSize = 0;
        let partCharset;
        let partEncoding;
        let partType;
        let partName;
        let partTruncated = false;
        let hitFilesLimit = false;
        let hitFieldsLimit = false;
        this._hparser = null;
        const hparser = new HeaderParser((header) => {
          this._hparser = null;
          skipPart = false;
          partType = "text/plain";
          partCharset = defCharset;
          partEncoding = "7bit";
          partName = void 0;
          partTruncated = false;
          let filename;
          if (!header["content-disposition"]) {
            skipPart = true;
            return;
          }
          const disp = parseDisposition(
            header["content-disposition"][0],
            paramDecoder
          );
          if (!disp || disp.type !== "form-data") {
            skipPart = true;
            return;
          }
          if (disp.params) {
            if (disp.params.name)
              partName = disp.params.name;
            if (disp.params["filename*"])
              filename = disp.params["filename*"];
            else if (disp.params.filename)
              filename = disp.params.filename;
            if (filename !== void 0 && !preservePath)
              filename = basename(filename);
          }
          if (header["content-type"]) {
            const conType = parseContentType(header["content-type"][0]);
            if (conType) {
              partType = `${conType.type}/${conType.subtype}`;
              if (conType.params && typeof conType.params.charset === "string")
                partCharset = conType.params.charset.toLowerCase();
            }
          }
          if (header["content-transfer-encoding"])
            partEncoding = header["content-transfer-encoding"][0].toLowerCase();
          if (partType === "application/octet-stream" || filename !== void 0) {
            if (files === filesLimit) {
              if (!hitFilesLimit) {
                hitFilesLimit = true;
                this.emit("filesLimit");
              }
              skipPart = true;
              return;
            }
            ++files;
            if (this.listenerCount("file") === 0) {
              skipPart = true;
              return;
            }
            fileSize = 0;
            this._fileStream = new FileStream(fileOpts, this);
            ++this._fileEndsLeft;
            this.emit(
              "file",
              partName,
              this._fileStream,
              {
                filename,
                encoding: partEncoding,
                mimeType: partType
              }
            );
          } else {
            if (fields === fieldsLimit) {
              if (!hitFieldsLimit) {
                hitFieldsLimit = true;
                this.emit("fieldsLimit");
              }
              skipPart = true;
              return;
            }
            ++fields;
            if (this.listenerCount("field") === 0) {
              skipPart = true;
              return;
            }
            field = [];
            fieldSize = 0;
          }
        });
        let matchPostBoundary = 0;
        const ssCb = /* @__PURE__ */ __name((isMatch, data, start, end, isDataSafe) => {
          retrydata:
            while (data) {
              if (this._hparser !== null) {
                const ret = this._hparser.push(data, start, end);
                if (ret === -1) {
                  this._hparser = null;
                  hparser.reset();
                  this.emit("error", new Error("Malformed part header"));
                  break;
                }
                start = ret;
              }
              if (start === end)
                break;
              if (matchPostBoundary !== 0) {
                if (matchPostBoundary === 1) {
                  switch (data[start]) {
                    case 45:
                      matchPostBoundary = 2;
                      ++start;
                      break;
                    case 13:
                      matchPostBoundary = 3;
                      ++start;
                      break;
                    default:
                      matchPostBoundary = 0;
                  }
                  if (start === end)
                    return;
                }
                if (matchPostBoundary === 2) {
                  matchPostBoundary = 0;
                  if (data[start] === 45) {
                    this._complete = true;
                    this._bparser = ignoreData;
                    return;
                  }
                  const writecb = this._writecb;
                  this._writecb = noop;
                  ssCb(false, BUF_DASH, 0, 1, false);
                  this._writecb = writecb;
                } else if (matchPostBoundary === 3) {
                  matchPostBoundary = 0;
                  if (data[start] === 10) {
                    ++start;
                    if (parts >= partsLimit)
                      break;
                    this._hparser = hparser;
                    if (start === end)
                      break;
                    continue retrydata;
                  } else {
                    const writecb = this._writecb;
                    this._writecb = noop;
                    ssCb(false, BUF_CR, 0, 1, false);
                    this._writecb = writecb;
                  }
                }
              }
              if (!skipPart) {
                if (this._fileStream) {
                  let chunk;
                  const actualLen = Math.min(end - start, fileSizeLimit - fileSize);
                  if (!isDataSafe) {
                    chunk = Buffer.allocUnsafe(actualLen);
                    data.copy(chunk, 0, start, start + actualLen);
                  } else {
                    chunk = data.slice(start, start + actualLen);
                  }
                  fileSize += chunk.length;
                  if (fileSize === fileSizeLimit) {
                    if (chunk.length > 0)
                      this._fileStream.push(chunk);
                    this._fileStream.emit("limit");
                    this._fileStream.truncated = true;
                    skipPart = true;
                  } else if (!this._fileStream.push(chunk)) {
                    if (this._writecb)
                      this._fileStream._readcb = this._writecb;
                    this._writecb = null;
                  }
                } else if (field !== void 0) {
                  let chunk;
                  const actualLen = Math.min(
                    end - start,
                    fieldSizeLimit - fieldSize
                  );
                  if (!isDataSafe) {
                    chunk = Buffer.allocUnsafe(actualLen);
                    data.copy(chunk, 0, start, start + actualLen);
                  } else {
                    chunk = data.slice(start, start + actualLen);
                  }
                  fieldSize += actualLen;
                  field.push(chunk);
                  if (fieldSize === fieldSizeLimit) {
                    skipPart = true;
                    partTruncated = true;
                  }
                }
              }
              break;
            }
          if (isMatch) {
            matchPostBoundary = 1;
            if (this._fileStream) {
              this._fileStream.push(null);
              this._fileStream = null;
            } else if (field !== void 0) {
              let data2;
              switch (field.length) {
                case 0:
                  data2 = "";
                  break;
                case 1:
                  data2 = convertToUTF8(field[0], partCharset, 0);
                  break;
                default:
                  data2 = convertToUTF8(
                    Buffer.concat(field, fieldSize),
                    partCharset,
                    0
                  );
              }
              field = void 0;
              fieldSize = 0;
              this.emit(
                "field",
                partName,
                data2,
                {
                  nameTruncated: false,
                  valueTruncated: partTruncated,
                  encoding: partEncoding,
                  mimeType: partType
                }
              );
            }
            if (++parts === partsLimit)
              this.emit("partsLimit");
          }
        }, "ssCb");
        this._bparser = new StreamSearch(`\r
--${boundary}`, ssCb);
        this._writecb = null;
        this._finalcb = null;
        this.write(BUF_CRLF);
      }
      static detect(conType) {
        return conType.type === "multipart" && conType.subtype === "form-data";
      }
      _write(chunk, enc, cb) {
        this._writecb = cb;
        this._bparser.push(chunk, 0);
        if (this._writecb)
          callAndUnsetCb(this);
      }
      _destroy(err, cb) {
        this._hparser = null;
        this._bparser = ignoreData;
        if (!err)
          err = checkEndState(this);
        const fileStream = this._fileStream;
        if (fileStream) {
          this._fileStream = null;
          fileStream.destroy(err);
        }
        cb(err);
      }
      _final(cb) {
        this._bparser.destroy();
        if (!this._complete)
          return cb(new Error("Unexpected end of form"));
        if (this._fileEndsLeft)
          this._finalcb = finalcb.bind(null, this, cb);
        else
          finalcb(this, cb);
      }
    };
    __name(Multipart, "Multipart");
    function finalcb(self, cb, err) {
      if (err)
        return cb(err);
      err = checkEndState(self);
      cb(err);
    }
    __name(finalcb, "finalcb");
    function checkEndState(self) {
      if (self._hparser)
        return new Error("Malformed part header");
      const fileStream = self._fileStream;
      if (fileStream) {
        self._fileStream = null;
        fileStream.destroy(new Error("Unexpected end of file"));
      }
      if (!self._complete)
        return new Error("Unexpected end of form");
    }
    __name(checkEndState, "checkEndState");
    var TOKEN = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    ];
    var FIELD_VCHAR = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1
    ];
    module2.exports = Multipart;
  }
});

// ../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/types/urlencoded.js
var require_urlencoded = __commonJS({
  "../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/types/urlencoded.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { Writable } = require("stream");
    var { getDecoder } = require_utils();
    var URLEncoded = class extends Writable {
      constructor(cfg) {
        const streamOpts = {
          autoDestroy: true,
          emitClose: true,
          highWaterMark: typeof cfg.highWaterMark === "number" ? cfg.highWaterMark : void 0
        };
        super(streamOpts);
        let charset = cfg.defCharset || "utf8";
        if (cfg.conType.params && typeof cfg.conType.params.charset === "string")
          charset = cfg.conType.params.charset;
        this.charset = charset;
        const limits = cfg.limits;
        this.fieldSizeLimit = limits && typeof limits.fieldSize === "number" ? limits.fieldSize : 1 * 1024 * 1024;
        this.fieldsLimit = limits && typeof limits.fields === "number" ? limits.fields : Infinity;
        this.fieldNameSizeLimit = limits && typeof limits.fieldNameSize === "number" ? limits.fieldNameSize : 100;
        this._inKey = true;
        this._keyTrunc = false;
        this._valTrunc = false;
        this._bytesKey = 0;
        this._bytesVal = 0;
        this._fields = 0;
        this._key = "";
        this._val = "";
        this._byte = -2;
        this._lastPos = 0;
        this._encode = 0;
        this._decoder = getDecoder(charset);
      }
      static detect(conType) {
        return conType.type === "application" && conType.subtype === "x-www-form-urlencoded";
      }
      _write(chunk, enc, cb) {
        if (this._fields >= this.fieldsLimit)
          return cb();
        let i = 0;
        const len = chunk.length;
        this._lastPos = 0;
        if (this._byte !== -2) {
          i = readPctEnc(this, chunk, i, len);
          if (i === -1)
            return cb(new Error("Malformed urlencoded form"));
          if (i >= len)
            return cb();
          if (this._inKey)
            ++this._bytesKey;
          else
            ++this._bytesVal;
        }
        main:
          while (i < len) {
            if (this._inKey) {
              i = skipKeyBytes(this, chunk, i, len);
              while (i < len) {
                switch (chunk[i]) {
                  case 61:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._key = this._decoder(this._key, this._encode);
                    this._encode = 0;
                    this._inKey = false;
                    continue main;
                  case 38:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._key = this._decoder(this._key, this._encode);
                    this._encode = 0;
                    if (this._bytesKey > 0) {
                      this.emit(
                        "field",
                        this._key,
                        "",
                        {
                          nameTruncated: this._keyTrunc,
                          valueTruncated: false,
                          encoding: this.charset,
                          mimeType: "text/plain"
                        }
                      );
                    }
                    this._key = "";
                    this._val = "";
                    this._keyTrunc = false;
                    this._valTrunc = false;
                    this._bytesKey = 0;
                    this._bytesVal = 0;
                    if (++this._fields >= this.fieldsLimit) {
                      this.emit("fieldsLimit");
                      return cb();
                    }
                    continue;
                  case 43:
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._key += " ";
                    this._lastPos = i + 1;
                    break;
                  case 37:
                    if (this._encode === 0)
                      this._encode = 1;
                    if (this._lastPos < i)
                      this._key += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = i + 1;
                    this._byte = -1;
                    i = readPctEnc(this, chunk, i + 1, len);
                    if (i === -1)
                      return cb(new Error("Malformed urlencoded form"));
                    if (i >= len)
                      return cb();
                    ++this._bytesKey;
                    i = skipKeyBytes(this, chunk, i, len);
                    continue;
                }
                ++i;
                ++this._bytesKey;
                i = skipKeyBytes(this, chunk, i, len);
              }
              if (this._lastPos < i)
                this._key += chunk.latin1Slice(this._lastPos, i);
            } else {
              i = skipValBytes(this, chunk, i, len);
              while (i < len) {
                switch (chunk[i]) {
                  case 38:
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = ++i;
                    this._inKey = true;
                    this._val = this._decoder(this._val, this._encode);
                    this._encode = 0;
                    if (this._bytesKey > 0 || this._bytesVal > 0) {
                      this.emit(
                        "field",
                        this._key,
                        this._val,
                        {
                          nameTruncated: this._keyTrunc,
                          valueTruncated: this._valTrunc,
                          encoding: this.charset,
                          mimeType: "text/plain"
                        }
                      );
                    }
                    this._key = "";
                    this._val = "";
                    this._keyTrunc = false;
                    this._valTrunc = false;
                    this._bytesKey = 0;
                    this._bytesVal = 0;
                    if (++this._fields >= this.fieldsLimit) {
                      this.emit("fieldsLimit");
                      return cb();
                    }
                    continue main;
                  case 43:
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._val += " ";
                    this._lastPos = i + 1;
                    break;
                  case 37:
                    if (this._encode === 0)
                      this._encode = 1;
                    if (this._lastPos < i)
                      this._val += chunk.latin1Slice(this._lastPos, i);
                    this._lastPos = i + 1;
                    this._byte = -1;
                    i = readPctEnc(this, chunk, i + 1, len);
                    if (i === -1)
                      return cb(new Error("Malformed urlencoded form"));
                    if (i >= len)
                      return cb();
                    ++this._bytesVal;
                    i = skipValBytes(this, chunk, i, len);
                    continue;
                }
                ++i;
                ++this._bytesVal;
                i = skipValBytes(this, chunk, i, len);
              }
              if (this._lastPos < i)
                this._val += chunk.latin1Slice(this._lastPos, i);
            }
          }
        cb();
      }
      _final(cb) {
        if (this._byte !== -2)
          return cb(new Error("Malformed urlencoded form"));
        if (!this._inKey || this._bytesKey > 0 || this._bytesVal > 0) {
          if (this._inKey)
            this._key = this._decoder(this._key, this._encode);
          else
            this._val = this._decoder(this._val, this._encode);
          this.emit(
            "field",
            this._key,
            this._val,
            {
              nameTruncated: this._keyTrunc,
              valueTruncated: this._valTrunc,
              encoding: this.charset,
              mimeType: "text/plain"
            }
          );
        }
        cb();
      }
    };
    __name(URLEncoded, "URLEncoded");
    function readPctEnc(self, chunk, pos, len) {
      if (pos >= len)
        return len;
      if (self._byte === -1) {
        const hexUpper = HEX_VALUES[chunk[pos++]];
        if (hexUpper === -1)
          return -1;
        if (hexUpper >= 8)
          self._encode = 2;
        if (pos < len) {
          const hexLower = HEX_VALUES[chunk[pos++]];
          if (hexLower === -1)
            return -1;
          if (self._inKey)
            self._key += String.fromCharCode((hexUpper << 4) + hexLower);
          else
            self._val += String.fromCharCode((hexUpper << 4) + hexLower);
          self._byte = -2;
          self._lastPos = pos;
        } else {
          self._byte = hexUpper;
        }
      } else {
        const hexLower = HEX_VALUES[chunk[pos++]];
        if (hexLower === -1)
          return -1;
        if (self._inKey)
          self._key += String.fromCharCode((self._byte << 4) + hexLower);
        else
          self._val += String.fromCharCode((self._byte << 4) + hexLower);
        self._byte = -2;
        self._lastPos = pos;
      }
      return pos;
    }
    __name(readPctEnc, "readPctEnc");
    function skipKeyBytes(self, chunk, pos, len) {
      if (self._bytesKey > self.fieldNameSizeLimit) {
        if (!self._keyTrunc) {
          if (self._lastPos < pos)
            self._key += chunk.latin1Slice(self._lastPos, pos - 1);
        }
        self._keyTrunc = true;
        for (; pos < len; ++pos) {
          const code = chunk[pos];
          if (code === 61 || code === 38)
            break;
          ++self._bytesKey;
        }
        self._lastPos = pos;
      }
      return pos;
    }
    __name(skipKeyBytes, "skipKeyBytes");
    function skipValBytes(self, chunk, pos, len) {
      if (self._bytesVal > self.fieldSizeLimit) {
        if (!self._valTrunc) {
          if (self._lastPos < pos)
            self._val += chunk.latin1Slice(self._lastPos, pos - 1);
        }
        self._valTrunc = true;
        for (; pos < len; ++pos) {
          if (chunk[pos] === 38)
            break;
          ++self._bytesVal;
        }
        self._lastPos = pos;
      }
      return pos;
    }
    __name(skipValBytes, "skipValBytes");
    var HEX_VALUES = [
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      10,
      11,
      12,
      13,
      14,
      15,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1
    ];
    module2.exports = URLEncoded;
  }
});

// ../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/index.js
var require_lib = __commonJS({
  "../../node_modules/.pnpm/busboy@1.6.0/node_modules/busboy/lib/index.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { parseContentType } = require_utils();
    function getInstance(cfg) {
      const headers = cfg.headers;
      const conType = parseContentType(headers["content-type"]);
      if (!conType)
        throw new Error("Malformed content type");
      for (const type of TYPES) {
        const matched = type.detect(conType);
        if (!matched)
          continue;
        const instanceCfg = {
          limits: cfg.limits,
          headers,
          conType,
          highWaterMark: void 0,
          fileHwm: void 0,
          defCharset: void 0,
          defParamCharset: void 0,
          preservePath: false
        };
        if (cfg.highWaterMark)
          instanceCfg.highWaterMark = cfg.highWaterMark;
        if (cfg.fileHwm)
          instanceCfg.fileHwm = cfg.fileHwm;
        instanceCfg.defCharset = cfg.defCharset;
        instanceCfg.defParamCharset = cfg.defParamCharset;
        instanceCfg.preservePath = cfg.preservePath;
        return new type(instanceCfg);
      }
      throw new Error(`Unsupported content type: ${headers["content-type"]}`);
    }
    __name(getInstance, "getInstance");
    var TYPES = [
      require_multipart(),
      require_urlencoded()
    ].filter(function(typemod) {
      return typeof typemod.detect === "function";
    });
    module2.exports = (cfg) => {
      if (typeof cfg !== "object" || cfg === null)
        cfg = {};
      if (typeof cfg.headers !== "object" || cfg.headers === null || typeof cfg.headers["content-type"] !== "string") {
        throw new Error("Missing Content-Type");
      }
      return getInstance(cfg);
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/file.js
var require_file = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/file.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { Blob } = require_buffer();
    var { types } = require("util");
    var { kState } = require_symbols2();
    var { isBlobLike } = require_util2();
    var { webidl } = require_webidl();
    var File2 = class extends Blob {
      constructor(fileBits, fileName, options = {}) {
        if (arguments.length < 2) {
          throw new TypeError("2 arguments required");
        }
        fileBits = webidl.converters["sequence<BlobPart>"](fileBits);
        fileName = webidl.converters.USVString(fileName);
        options = webidl.converters.FilePropertyBag(options);
        const n = fileName;
        const d = options.lastModified;
        super(processBlobParts(fileBits, options), { type: options.type });
        this[kState] = {
          name: n,
          lastModified: d
        };
      }
      get name() {
        if (!(this instanceof File2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].name;
      }
      get lastModified() {
        if (!(this instanceof File2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].lastModified;
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
    };
    __name(File2, "File");
    var FileLike = class {
      constructor(blobLike, fileName, options = {}) {
        var _a;
        const n = fileName;
        const t = options.type;
        const d = (_a = options.lastModified) != null ? _a : Date.now();
        this[kState] = {
          blobLike,
          name: n,
          type: t,
          lastModified: d
        };
      }
      stream(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.stream(...args);
      }
      arrayBuffer(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.arrayBuffer(...args);
      }
      slice(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.slice(...args);
      }
      text(...args) {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.text(...args);
      }
      get size() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.size;
      }
      get type() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].blobLike.type;
      }
      get name() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].name;
      }
      get lastModified() {
        if (!(this instanceof FileLike)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].lastModified;
      }
      get [Symbol.toStringTag]() {
        return "File";
      }
    };
    __name(FileLike, "FileLike");
    webidl.converters.Blob = webidl.interfaceConverter(Blob);
    webidl.converters.BlobPart = function(V, opts) {
      if (webidl.util.Type(V) === "Object") {
        if (isBlobLike(V)) {
          return webidl.converters.Blob(V, { strict: false });
        }
        return webidl.converters.BufferSource(V, opts);
      } else {
        return webidl.converters.USVString(V, opts);
      }
    };
    webidl.converters["sequence<BlobPart>"] = webidl.sequenceConverter(
      webidl.converters.BlobPart
    );
    webidl.converters.FilePropertyBag = webidl.dictionaryConverter([
      {
        key: "lastModified",
        converter: webidl.converters["long long"],
        get defaultValue() {
          return Date.now();
        }
      },
      {
        key: "type",
        converter: webidl.converters.DOMString,
        defaultValue: ""
      },
      {
        key: "endings",
        converter: (value) => {
          value = webidl.converters.DOMString(value);
          value = value.toLowerCase();
          if (value !== "native") {
            value = "transparent";
          }
          return value;
        },
        defaultValue: "transparent"
      }
    ]);
    function processBlobParts(parts, options) {
      const bytes = [];
      for (const element of parts) {
        if (typeof element === "string") {
          let s = element;
          if (options.endings === "native") {
            s = convertLineEndingsNative(s);
          }
          bytes.push(new TextEncoder().encode(s));
        } else if (types.isAnyArrayBuffer(element) || types.isTypedArray(element)) {
          if (!element.buffer) {
            bytes.push(new Uint8Array(element));
          } else {
            bytes.push(
              new Uint8Array(element.buffer, element.byteOffset, element.byteLength)
            );
          }
        } else if (isBlobLike(element)) {
          bytes.push(element);
        }
      }
      return bytes;
    }
    __name(processBlobParts, "processBlobParts");
    function convertLineEndingsNative(s) {
      let nativeLineEnding = "\n";
      if (define_process_default.platform === "win32") {
        nativeLineEnding = "\r\n";
      }
      return s.replace(/\r?\n/g, nativeLineEnding);
    }
    __name(convertLineEndingsNative, "convertLineEndingsNative");
    function isFileLike(object) {
      return object instanceof File2 || object && (typeof object.stream === "function" || typeof object.arrayBuffer === "function") && object[Symbol.toStringTag] === "File";
    }
    __name(isFileLike, "isFileLike");
    module2.exports = { File: File2, FileLike, isFileLike };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/formdata.js
var require_formdata = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/formdata.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { isBlobLike, toUSVString, makeIterator } = require_util2();
    var { kState } = require_symbols2();
    var { File: File2, FileLike, isFileLike } = require_file();
    var { webidl } = require_webidl();
    var { Blob } = require_buffer();
    var _FormData = class {
      constructor(form) {
        if (arguments.length > 0 && form != null) {
          webidl.errors.conversionFailed({
            prefix: "FormData constructor",
            argument: "Argument 1",
            types: ["null"]
          });
        }
        this[kState] = [];
      }
      append(name, value, filename = void 0) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 2) {
          throw new TypeError(
            `Failed to execute 'append' on 'FormData': 2 arguments required, but only ${arguments.length} present.`
          );
        }
        if (arguments.length === 3 && !isBlobLike(value)) {
          throw new TypeError(
            "Failed to execute 'append' on 'FormData': parameter 2 is not of type 'Blob'"
          );
        }
        name = webidl.converters.USVString(name);
        value = isBlobLike(value) ? webidl.converters.Blob(value, { strict: false }) : webidl.converters.USVString(value);
        filename = arguments.length === 3 ? webidl.converters.USVString(filename) : void 0;
        const entry = makeEntry(name, value, filename);
        this[kState].push(entry);
      }
      delete(name) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'delete' on 'FormData': 1 arguments required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.USVString(name);
        const next = [];
        for (const entry of this[kState]) {
          if (entry.name !== name) {
            next.push(entry);
          }
        }
        this[kState] = next;
      }
      get(name) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'get' on 'FormData': 1 arguments required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.USVString(name);
        const idx = this[kState].findIndex((entry) => entry.name === name);
        if (idx === -1) {
          return null;
        }
        return this[kState][idx].value;
      }
      getAll(name) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'getAll' on 'FormData': 1 arguments required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.USVString(name);
        return this[kState].filter((entry) => entry.name === name).map((entry) => entry.value);
      }
      has(name) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'has' on 'FormData': 1 arguments required, but only ${arguments.length} present.`
          );
        }
        name = webidl.converters.USVString(name);
        return this[kState].findIndex((entry) => entry.name === name) !== -1;
      }
      set(name, value, filename = void 0) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 2) {
          throw new TypeError(
            `Failed to execute 'set' on 'FormData': 2 arguments required, but only ${arguments.length} present.`
          );
        }
        if (arguments.length === 3 && !isBlobLike(value)) {
          throw new TypeError(
            "Failed to execute 'set' on 'FormData': parameter 2 is not of type 'Blob'"
          );
        }
        name = webidl.converters.USVString(name);
        value = isBlobLike(value) ? webidl.converters.Blob(value, { strict: false }) : webidl.converters.USVString(value);
        filename = arguments.length === 3 ? toUSVString(filename) : void 0;
        const entry = makeEntry(name, value, filename);
        const idx = this[kState].findIndex((entry2) => entry2.name === name);
        if (idx !== -1) {
          this[kState] = [
            ...this[kState].slice(0, idx),
            entry,
            ...this[kState].slice(idx + 1).filter((entry2) => entry2.name !== name)
          ];
        } else {
          this[kState].push(entry);
        }
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      entries() {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(
          makeIterable(this[kState], "entries"),
          "FormData"
        );
      }
      keys() {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(
          makeIterable(this[kState], "keys"),
          "FormData"
        );
      }
      values() {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        return makeIterator(
          makeIterable(this[kState], "values"),
          "FormData"
        );
      }
      forEach(callbackFn, thisArg = globalThis) {
        if (!(this instanceof _FormData)) {
          throw new TypeError("Illegal invocation");
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'forEach' on 'FormData': 1 argument required, but only ${arguments.length} present.`
          );
        }
        if (typeof callbackFn !== "function") {
          throw new TypeError(
            "Failed to execute 'forEach' on 'FormData': parameter 1 is not of type 'Function'."
          );
        }
        for (const [key, value] of this) {
          callbackFn.apply(thisArg, [value, key, this]);
        }
      }
    };
    var FormData2 = _FormData;
    __name(FormData2, "FormData");
    __publicField(FormData2, "name", "FormData");
    FormData2.prototype[Symbol.iterator] = FormData2.prototype.entries;
    function makeEntry(name, value, filename) {
      name = Buffer.from(name).toString("utf8");
      if (typeof value === "string") {
        value = Buffer.from(value).toString("utf8");
      } else {
        if (!isFileLike(value)) {
          value = value instanceof Blob ? new File2([value], "blob", { type: value.type }) : new FileLike(value, "blob", { type: value.type });
        }
        if (filename !== void 0) {
          value = value instanceof File2 ? new File2([value], filename, { type: value.type }) : new FileLike(value, filename, { type: value.type });
        }
      }
      return { name, value };
    }
    __name(makeEntry, "makeEntry");
    function* makeIterable(entries, type) {
      for (const { name, value } of entries) {
        if (type === "entries") {
          yield [name, value];
        } else if (type === "values") {
          yield value;
        } else {
          yield name;
        }
      }
    }
    __name(makeIterable, "makeIterable");
    module2.exports = { FormData: FormData2 };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/body.js
var require_body = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/body.js"(exports, module2) {
    "use strict";
    init_define_process();
    var Busboy = require_lib();
    var util = require_util();
    var { ReadableStreamFrom, toUSVString, isBlobLike } = require_util2();
    var { FormData: FormData2 } = require_formdata();
    var { kState } = require_symbols2();
    var { webidl } = require_webidl();
    var { DOMException } = require_constants();
    var { Blob } = require_buffer();
    var { kBodyUsed } = require_symbols();
    var assert = require("assert");
    var { isErrored } = require_util();
    var { isUint8Array, isArrayBuffer } = require_util_types();
    var { File: File2 } = require_file();
    var ReadableStream;
    async function* blobGen(blob) {
      yield* blob.stream();
    }
    __name(blobGen, "blobGen");
    function extractBody(object, keepalive = false) {
      if (!ReadableStream) {
        ReadableStream = require("./streams").ReadableStream;
      }
      let stream = null;
      let action = null;
      let source = null;
      let length = null;
      let contentType = null;
      if (object == null) {
      } else if (object instanceof URLSearchParams) {
        source = object.toString();
        contentType = "application/x-www-form-urlencoded;charset=UTF-8";
      } else if (isArrayBuffer(object)) {
        source = new Uint8Array(object.slice());
      } else if (ArrayBuffer.isView(object)) {
        source = new Uint8Array(object.buffer.slice(object.byteOffset, object.byteOffset + object.byteLength));
      } else if (util.isFormDataLike(object)) {
        const boundary = "----formdata-undici-" + Math.random();
        const prefix = `--${boundary}\r
Content-Disposition: form-data`;
        const escape = /* @__PURE__ */ __name((str) => str.replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/"/g, "%22"), "escape");
        const normalizeLinefeeds = /* @__PURE__ */ __name((value) => value.replace(/\r?\n|\r/g, "\r\n"), "normalizeLinefeeds");
        action = /* @__PURE__ */ __name(async function* (object2) {
          const enc = new TextEncoder();
          for (const [name, value] of object2) {
            if (typeof value === "string") {
              yield enc.encode(
                prefix + `; name="${escape(normalizeLinefeeds(name))}"\r
\r
${normalizeLinefeeds(value)}\r
`
              );
            } else {
              yield enc.encode(
                prefix + `; name="${escape(normalizeLinefeeds(name))}"` + (value.name ? `; filename="${escape(value.name)}"` : "") + `\r
Content-Type: ${value.type || "application/octet-stream"}\r
\r
`
              );
              yield* blobGen(value);
              yield enc.encode("\r\n");
            }
          }
          yield enc.encode(`--${boundary}--`);
        }, "action");
        source = object;
        contentType = "multipart/form-data; boundary=" + boundary;
      } else if (isBlobLike(object)) {
        action = blobGen;
        source = object;
        length = object.size;
        if (object.type) {
          contentType = object.type;
        }
      } else if (typeof object[Symbol.asyncIterator] === "function") {
        if (keepalive) {
          throw new TypeError("keepalive");
        }
        if (util.isDisturbed(object) || object.locked) {
          throw new TypeError(
            "Response body object should not be disturbed or locked"
          );
        }
        stream = object instanceof ReadableStream ? object : ReadableStreamFrom(object);
      } else {
        source = toUSVString(object);
        contentType = "text/plain;charset=UTF-8";
      }
      if (typeof source === "string" || util.isBuffer(source)) {
        length = Buffer.byteLength(source);
      }
      if (action != null) {
        let iterator;
        stream = new ReadableStream({
          async start() {
            iterator = action(object)[Symbol.asyncIterator]();
          },
          async pull(controller) {
            const { value, done } = await iterator.next();
            if (done) {
              queueMicrotask(() => {
                controller.close();
              });
            } else {
              if (!isErrored(stream)) {
                controller.enqueue(new Uint8Array(value));
              }
            }
            return controller.desiredSize > 0;
          },
          async cancel(reason) {
            await iterator.return();
          }
        });
      } else if (!stream) {
        stream = new ReadableStream({
          async pull(controller) {
            controller.enqueue(
              typeof source === "string" ? new TextEncoder().encode(source) : source
            );
            queueMicrotask(() => {
              controller.close();
            });
          }
        });
      }
      const body = { stream, source, length };
      return [body, contentType];
    }
    __name(extractBody, "extractBody");
    function safelyExtractBody(object, keepalive = false) {
      if (!ReadableStream) {
        ReadableStream = require("./streams").ReadableStream;
      }
      if (object instanceof ReadableStream) {
        assert(!util.isDisturbed(object), "The body has already been consumed.");
        assert(!object.locked, "The stream is locked.");
      }
      return extractBody(object, keepalive);
    }
    __name(safelyExtractBody, "safelyExtractBody");
    function cloneBody(body) {
      const [out1, out2] = body.stream.tee();
      body.stream = out1;
      return {
        stream: out2,
        length: body.length,
        source: body.source
      };
    }
    __name(cloneBody, "cloneBody");
    async function* consumeBody(body) {
      if (body) {
        if (isUint8Array(body)) {
          yield body;
        } else {
          const stream = body.stream;
          if (util.isDisturbed(stream)) {
            throw new TypeError("The body has already been consumed.");
          }
          if (stream.locked) {
            throw new TypeError("The stream is locked.");
          }
          stream[kBodyUsed] = true;
          yield* stream;
        }
      }
    }
    __name(consumeBody, "consumeBody");
    function throwIfAborted(state) {
      if (state.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
    }
    __name(throwIfAborted, "throwIfAborted");
    function bodyMixinMethods(instance) {
      const methods = {
        async blob() {
          if (!(this instanceof instance)) {
            throw new TypeError("Illegal invocation");
          }
          throwIfAborted(this[kState]);
          const chunks = [];
          for await (const chunk of consumeBody(this[kState].body)) {
            if (!isUint8Array(chunk)) {
              throw new TypeError("Expected Uint8Array chunk");
            }
            chunks.push(new Blob([chunk]));
          }
          return new Blob(chunks, { type: this.headers.get("Content-Type") || "" });
        },
        async arrayBuffer() {
          if (!(this instanceof instance)) {
            throw new TypeError("Illegal invocation");
          }
          throwIfAborted(this[kState]);
          const contentLength = this.headers.get("content-length");
          const encoded = this.headers.has("content-encoding");
          if (!encoded && contentLength) {
            const buffer2 = new Uint8Array(contentLength);
            let offset2 = 0;
            for await (const chunk of consumeBody(this[kState].body)) {
              if (!isUint8Array(chunk)) {
                throw new TypeError("Expected Uint8Array chunk");
              }
              buffer2.set(chunk, offset2);
              offset2 += chunk.length;
            }
            return buffer2.buffer;
          }
          const chunks = [];
          let size = 0;
          for await (const chunk of consumeBody(this[kState].body)) {
            if (!isUint8Array(chunk)) {
              throw new TypeError("Expected Uint8Array chunk");
            }
            chunks.push(chunk);
            size += chunk.byteLength;
          }
          const buffer = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return buffer.buffer;
        },
        async text() {
          if (!(this instanceof instance)) {
            throw new TypeError("Illegal invocation");
          }
          throwIfAborted(this[kState]);
          let result = "";
          const textDecoder = new TextDecoder();
          for await (const chunk of consumeBody(this[kState].body)) {
            if (!isUint8Array(chunk)) {
              throw new TypeError("Expected Uint8Array chunk");
            }
            result += textDecoder.decode(chunk, { stream: true });
          }
          result += textDecoder.decode();
          return result;
        },
        async json() {
          if (!(this instanceof instance)) {
            throw new TypeError("Illegal invocation");
          }
          throwIfAborted(this[kState]);
          return JSON.parse(await this.text());
        },
        async formData() {
          if (!(this instanceof instance)) {
            throw new TypeError("Illegal invocation");
          }
          throwIfAborted(this[kState]);
          const contentType = this.headers.get("Content-Type");
          if (/multipart\/form-data/.test(contentType)) {
            const headers = {};
            for (const [key, value] of this.headers)
              headers[key.toLowerCase()] = value;
            const responseFormData = new FormData2();
            let busboy;
            try {
              busboy = Busboy({ headers });
            } catch (err) {
              throw Object.assign(new TypeError(), { cause: err });
            }
            busboy.on("field", (name, value) => {
              responseFormData.append(name, value);
            });
            busboy.on("file", (name, value, info) => {
              const { filename, encoding, mimeType } = info;
              const chunks = [];
              if (encoding.toLowerCase() === "base64") {
                let base64chunk = "";
                value.on("data", (chunk) => {
                  base64chunk += chunk.toString().replace(/[\r\n]/gm, "");
                  const end = base64chunk.length - base64chunk.length % 4;
                  chunks.push(Buffer.from(base64chunk.slice(0, end), "base64"));
                  base64chunk = base64chunk.slice(end);
                });
                value.on("end", () => {
                  chunks.push(Buffer.from(base64chunk, "base64"));
                  responseFormData.append(name, new File2(chunks, filename, { type: mimeType }));
                });
              } else {
                value.on("data", (chunk) => {
                  chunks.push(chunk);
                });
                value.on("end", () => {
                  responseFormData.append(name, new File2(chunks, filename, { type: mimeType }));
                });
              }
            });
            const busboyResolve = new Promise((resolve, reject) => {
              busboy.on("finish", resolve);
              busboy.on("error", (err) => reject(err));
            });
            if (this.body !== null)
              for await (const chunk of consumeBody(this[kState].body))
                busboy.write(chunk);
            busboy.end();
            await busboyResolve;
            return responseFormData;
          } else if (/application\/x-www-form-urlencoded/.test(contentType)) {
            let entries;
            try {
              let text = "";
              const textDecoder = new TextDecoder("utf-8", { ignoreBOM: true });
              for await (const chunk of consumeBody(this[kState].body)) {
                if (!isUint8Array(chunk)) {
                  throw new TypeError("Expected Uint8Array chunk");
                }
                text += textDecoder.decode(chunk, { stream: true });
              }
              text += textDecoder.decode();
              entries = new URLSearchParams(text);
            } catch (err) {
              throw Object.assign(new TypeError(), { cause: err });
            }
            const formData = new FormData2();
            for (const [name, value] of entries) {
              formData.append(name, value);
            }
            return formData;
          } else {
            await Promise.resolve();
            throwIfAborted(this[kState]);
            webidl.errors.exception({
              header: `${instance.name}.formData`,
              message: "Could not parse content as FormData."
            });
          }
        }
      };
      return methods;
    }
    __name(bodyMixinMethods, "bodyMixinMethods");
    var properties = {
      body: {
        enumerable: true,
        get() {
          if (!this || !this[kState]) {
            throw new TypeError("Illegal invocation");
          }
          return this[kState].body ? this[kState].body.stream : null;
        }
      },
      bodyUsed: {
        enumerable: true,
        get() {
          if (!this || !this[kState]) {
            throw new TypeError("Illegal invocation");
          }
          return !!this[kState].body && util.isDisturbed(this[kState].body.stream);
        }
      }
    };
    function mixinBody(prototype) {
      Object.assign(prototype.prototype, bodyMixinMethods(prototype));
      Object.defineProperties(prototype.prototype, properties);
    }
    __name(mixinBody, "mixinBody");
    module2.exports = {
      extractBody,
      safelyExtractBody,
      cloneBody,
      mixinBody
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/global.js
var require_global = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/global.js"(exports, module2) {
    "use strict";
    init_define_process();
    var globalOrigin = Symbol.for("undici.globalOrigin.1");
    function getGlobalOrigin() {
      return globalThis[globalOrigin];
    }
    __name(getGlobalOrigin, "getGlobalOrigin");
    function setGlobalOrigin(newOrigin) {
      if (newOrigin !== void 0 && typeof newOrigin !== "string" && !(newOrigin instanceof URL)) {
        throw new Error("Invalid base url");
      }
      if (newOrigin === void 0) {
        Object.defineProperty(globalThis, globalOrigin, {
          value: void 0,
          writable: true,
          enumerable: false,
          configurable: false
        });
        return;
      }
      const parsedURL = new URL(newOrigin);
      if (parsedURL.protocol !== "http:" && parsedURL.protocol !== "https:") {
        throw new TypeError(`Only http & https urls are allowed, received ${parsedURL.protocol}`);
      }
      Object.defineProperty(globalThis, globalOrigin, {
        value: parsedURL,
        writable: true,
        enumerable: false,
        configurable: false
      });
    }
    __name(setGlobalOrigin, "setGlobalOrigin");
    module2.exports = {
      getGlobalOrigin,
      setGlobalOrigin
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/response.js
var require_response = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/response.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { Headers: Headers3, HeadersList: HeadersList2, fill } = require_headers();
    var { extractBody, cloneBody, mixinBody } = require_body();
    var util = require_util();
    var { kEnumerableProperty } = util;
    var {
      responseURL,
      isValidReasonPhrase,
      isCancelled,
      isAborted,
      isBlobLike,
      serializeJavascriptValueToJSONString,
      isErrorLike
    } = require_util2();
    var {
      redirectStatus,
      nullBodyStatus,
      DOMException
    } = require_constants();
    var { kState, kHeaders: kHeaders2, kGuard: kGuard2, kRealm } = require_symbols2();
    var { webidl } = require_webidl();
    var { FormData: FormData2 } = require_formdata();
    var { getGlobalOrigin } = require_global();
    var { kHeadersList: kHeadersList2 } = require_symbols();
    var assert = require("assert");
    var { types } = require("util");
    var ReadableStream = globalThis.ReadableStream || require("./streams").ReadableStream;
    var Response3 = class {
      static error() {
        const relevantRealm = { settingsObject: {} };
        const responseObject = new Response3();
        responseObject[kState] = makeNetworkError();
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders2][kHeadersList2] = responseObject[kState].headersList;
        responseObject[kHeaders2][kGuard2] = "immutable";
        responseObject[kHeaders2][kRealm] = relevantRealm;
        return responseObject;
      }
      static json(data, init = {}) {
        if (arguments.length === 0) {
          throw new TypeError(
            "Failed to execute 'json' on 'Response': 1 argument required, but 0 present."
          );
        }
        if (init !== null) {
          init = webidl.converters.ResponseInit(init);
        }
        const bytes = new TextEncoder("utf-8").encode(
          serializeJavascriptValueToJSONString(data)
        );
        const body = extractBody(bytes);
        const relevantRealm = { settingsObject: {} };
        const responseObject = new Response3();
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders2][kGuard2] = "response";
        responseObject[kHeaders2][kRealm] = relevantRealm;
        initializeResponse(responseObject, init, { body: body[0], type: "application/json" });
        return responseObject;
      }
      static redirect(url, status = 302) {
        const relevantRealm = { settingsObject: {} };
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to execute 'redirect' on 'Response': 1 argument required, but only ${arguments.length} present.`
          );
        }
        url = webidl.converters.USVString(url);
        status = webidl.converters["unsigned short"](status);
        let parsedURL;
        try {
          parsedURL = new URL(url, getGlobalOrigin());
        } catch (err) {
          throw Object.assign(new TypeError("Failed to parse URL from " + url), {
            cause: err
          });
        }
        if (!redirectStatus.includes(status)) {
          throw new RangeError("Invalid status code");
        }
        const responseObject = new Response3();
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders2][kGuard2] = "immutable";
        responseObject[kHeaders2][kRealm] = relevantRealm;
        responseObject[kState].status = status;
        const value = parsedURL.toString();
        responseObject[kState].headersList.append("location", value);
        return responseObject;
      }
      constructor(body = null, init = {}) {
        if (body !== null) {
          body = webidl.converters.BodyInit(body);
        }
        init = webidl.converters.ResponseInit(init);
        this[kRealm] = { settingsObject: {} };
        this[kState] = makeResponse({});
        this[kHeaders2] = new Headers3();
        this[kHeaders2][kGuard2] = "response";
        this[kHeaders2][kHeadersList2] = this[kState].headersList;
        this[kHeaders2][kRealm] = this[kRealm];
        let bodyWithType = null;
        if (body != null) {
          const [extractedBody, type] = extractBody(body);
          bodyWithType = { body: extractedBody, type };
        }
        initializeResponse(this, init, bodyWithType);
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      get type() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].type;
      }
      get url() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        let url = responseURL(this[kState]);
        if (url == null) {
          return "";
        }
        if (url.hash) {
          url = new URL(url);
          url.hash = "";
        }
        return url.toString();
      }
      get redirected() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].urlList.length > 1;
      }
      get status() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].status;
      }
      get ok() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].status >= 200 && this[kState].status <= 299;
      }
      get statusText() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].statusText;
      }
      get headers() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kHeaders2];
      }
      clone() {
        if (!(this instanceof Response3)) {
          throw new TypeError("Illegal invocation");
        }
        if (this.bodyUsed || this.body && this.body.locked) {
          webidl.errors.exception({
            header: "Response.clone",
            message: "Body has already been consumed."
          });
        }
        const clonedResponse = cloneResponse(this[kState]);
        const clonedResponseObject = new Response3();
        clonedResponseObject[kState] = clonedResponse;
        clonedResponseObject[kRealm] = this[kRealm];
        clonedResponseObject[kHeaders2][kHeadersList2] = clonedResponse.headersList;
        clonedResponseObject[kHeaders2][kGuard2] = this[kHeaders2][kGuard2];
        clonedResponseObject[kHeaders2][kRealm] = this[kHeaders2][kRealm];
        return clonedResponseObject;
      }
    };
    __name(Response3, "Response");
    mixinBody(Response3);
    Object.defineProperties(Response3.prototype, {
      type: kEnumerableProperty,
      url: kEnumerableProperty,
      status: kEnumerableProperty,
      ok: kEnumerableProperty,
      redirected: kEnumerableProperty,
      statusText: kEnumerableProperty,
      headers: kEnumerableProperty,
      clone: kEnumerableProperty
    });
    function cloneResponse(response) {
      if (response.internalResponse) {
        return filterResponse(
          cloneResponse(response.internalResponse),
          response.type
        );
      }
      const newResponse = makeResponse({ ...response, body: null });
      if (response.body != null) {
        newResponse.body = cloneBody(response.body);
      }
      return newResponse;
    }
    __name(cloneResponse, "cloneResponse");
    function makeResponse(init) {
      return {
        aborted: false,
        rangeRequested: false,
        timingAllowPassed: false,
        requestIncludesCredentials: false,
        type: "default",
        status: 200,
        timingInfo: null,
        cacheState: "",
        statusText: "",
        ...init,
        headersList: init.headersList ? new HeadersList2(init.headersList) : new HeadersList2(),
        urlList: init.urlList ? [...init.urlList] : []
      };
    }
    __name(makeResponse, "makeResponse");
    function makeNetworkError(reason) {
      const isError = isErrorLike(reason);
      return makeResponse({
        type: "error",
        status: 0,
        error: isError ? reason : new Error(reason ? String(reason) : reason, {
          cause: isError ? reason : void 0
        }),
        aborted: reason && reason.name === "AbortError"
      });
    }
    __name(makeNetworkError, "makeNetworkError");
    function makeFilteredResponse(response, state) {
      state = {
        internalResponse: response,
        ...state
      };
      return new Proxy(response, {
        get(target, p) {
          return p in state ? state[p] : target[p];
        },
        set(target, p, value) {
          assert(!(p in state));
          target[p] = value;
          return true;
        }
      });
    }
    __name(makeFilteredResponse, "makeFilteredResponse");
    function filterResponse(response, type) {
      if (type === "basic") {
        return makeFilteredResponse(response, {
          type: "basic",
          headersList: response.headersList
        });
      } else if (type === "cors") {
        return makeFilteredResponse(response, {
          type: "cors",
          headersList: response.headersList
        });
      } else if (type === "opaque") {
        return makeFilteredResponse(response, {
          type: "opaque",
          urlList: Object.freeze([]),
          status: 0,
          statusText: "",
          body: null
        });
      } else if (type === "opaqueredirect") {
        return makeFilteredResponse(response, {
          type: "opaqueredirect",
          status: 0,
          statusText: "",
          headersList: [],
          body: null
        });
      } else {
        assert(false);
      }
    }
    __name(filterResponse, "filterResponse");
    function makeAppropriateNetworkError(fetchParams) {
      assert(isCancelled(fetchParams));
      return isAborted(fetchParams) ? makeNetworkError(new DOMException("The operation was aborted.", "AbortError")) : makeNetworkError(fetchParams.controller.terminated.reason);
    }
    __name(makeAppropriateNetworkError, "makeAppropriateNetworkError");
    function initializeResponse(response, init, body) {
      if (init.status !== null && (init.status < 200 || init.status > 599)) {
        throw new RangeError('init["status"] must be in the range of 200 to 599, inclusive.');
      }
      if ("statusText" in init && init.statusText != null) {
        if (!isValidReasonPhrase(String(init.statusText))) {
          throw new TypeError("Invalid statusText");
        }
      }
      if ("status" in init && init.status != null) {
        response[kState].status = init.status;
      }
      if ("statusText" in init && init.statusText != null) {
        response[kState].statusText = init.statusText;
      }
      if ("headers" in init && init.headers != null) {
        fill(response[kState].headersList, init.headers);
      }
      if (body) {
        if (nullBodyStatus.includes(response.status)) {
          webidl.errors.exception({
            header: "Response constructor",
            message: "Invalid response status code."
          });
        }
        response[kState].body = body.body;
        if (body.type != null && !response[kState].headersList.has("Content-Type")) {
          response[kState].headersList.append("content-type", body.type);
        }
      }
    }
    __name(initializeResponse, "initializeResponse");
    webidl.converters.ReadableStream = webidl.interfaceConverter(
      ReadableStream
    );
    webidl.converters.FormData = webidl.interfaceConverter(
      FormData2
    );
    webidl.converters.URLSearchParams = webidl.interfaceConverter(
      URLSearchParams
    );
    webidl.converters.XMLHttpRequestBodyInit = function(V) {
      if (typeof V === "string") {
        return webidl.converters.USVString(V);
      }
      if (isBlobLike(V)) {
        return webidl.converters.Blob(V, { strict: false });
      }
      if (types.isAnyArrayBuffer(V) || types.isTypedArray(V) || types.isDataView(V)) {
        return webidl.converters.BufferSource(V);
      }
      if (util.isFormDataLike(V)) {
        return webidl.converters.FormData(V, { strict: false });
      }
      if (V instanceof URLSearchParams) {
        return webidl.converters.URLSearchParams(V);
      }
      return webidl.converters.DOMString(V);
    };
    webidl.converters.BodyInit = function(V) {
      if (V instanceof ReadableStream) {
        return webidl.converters.ReadableStream(V);
      }
      if (V == null ? void 0 : V[Symbol.asyncIterator]) {
        return V;
      }
      return webidl.converters.XMLHttpRequestBodyInit(V);
    };
    webidl.converters.ResponseInit = webidl.dictionaryConverter([
      {
        key: "status",
        converter: webidl.converters["unsigned short"],
        defaultValue: 200
      },
      {
        key: "statusText",
        converter: webidl.converters.ByteString,
        defaultValue: ""
      },
      {
        key: "headers",
        converter: webidl.converters.HeadersInit
      }
    ]);
    module2.exports = {
      makeNetworkError,
      makeResponse,
      makeAppropriateNetworkError,
      filterResponse,
      Response: Response3
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/compat/dispatcher-weakref.js
var require_dispatcher_weakref = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/compat/dispatcher-weakref.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { kConnected, kSize } = require_symbols();
    var CompatWeakRef = class {
      constructor(value) {
        this.value = value;
      }
      deref() {
        return this.value[kConnected] === 0 && this.value[kSize] === 0 ? void 0 : this.value;
      }
    };
    __name(CompatWeakRef, "CompatWeakRef");
    var CompatFinalizer = class {
      constructor(finalizer) {
        this.finalizer = finalizer;
      }
      register(dispatcher, key) {
        dispatcher.on("disconnect", () => {
          if (dispatcher[kConnected] === 0 && dispatcher[kSize] === 0) {
            this.finalizer(key);
          }
        });
      }
    };
    __name(CompatFinalizer, "CompatFinalizer");
    module2.exports = function() {
      return {
        WeakRef: global.WeakRef || CompatWeakRef,
        FinalizationRegistry: global.FinalizationRegistry || CompatFinalizer
      };
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/request.js
var require_request = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/request.js"(exports, module2) {
    init_define_process();
    global.FinalizationRegistry = function() {
      return { register: function() {
      } };
    };
    var { extractBody, mixinBody, cloneBody } = require_body();
    var { Headers: Headers3, fill: fillHeaders, HeadersList: HeadersList2 } = require_headers();
    var { FinalizationRegistry } = require_dispatcher_weakref()();
    var util = require_util();
    var {
      isValidHTTPToken,
      sameOrigin,
      normalizeMethod
    } = require_util2();
    var {
      forbiddenMethods,
      corsSafeListedMethods,
      referrerPolicy,
      requestRedirect,
      requestMode,
      requestCredentials,
      requestCache
    } = require_constants();
    var { kEnumerableProperty } = util;
    var { kHeaders: kHeaders2, kSignal, kState, kGuard: kGuard2, kRealm } = require_symbols2();
    var { webidl } = require_webidl();
    var { getGlobalOrigin } = require_global();
    var { kHeadersList: kHeadersList2 } = require_symbols();
    var assert = require("assert");
    var TransformStream;
    var kInit = Symbol("init");
    var requestFinalizer = new FinalizationRegistry(({ signal, abort }) => {
      signal.removeEventListener("abort", abort);
    });
    var Request2 = class {
      constructor(input, init = {}) {
        var _a, _b;
        if (input === kInit) {
          return;
        }
        if (arguments.length < 1) {
          throw new TypeError(
            `Failed to construct 'Request': 1 argument required, but only ${arguments.length} present.`
          );
        }
        input = webidl.converters.RequestInfo(input);
        init = webidl.converters.RequestInit(init);
        this[kRealm] = {
          settingsObject: {
            baseUrl: getGlobalOrigin()
          }
        };
        let request = null;
        let fallbackMode = null;
        const baseUrl = this[kRealm].settingsObject.baseUrl;
        let signal = null;
        if (typeof input === "string") {
          let parsedURL;
          try {
            parsedURL = new URL(input, baseUrl);
          } catch (err) {
            throw new TypeError("Failed to parse URL from " + input, { cause: err });
          }
          if (parsedURL.username || parsedURL.password) {
            throw new TypeError(
              "Request cannot be constructed from a URL that includes credentials: " + input
            );
          }
          request = makeRequest({ urlList: [parsedURL] });
          fallbackMode = "cors";
        } else {
          assert(input instanceof Request2);
          request = input[kState];
          signal = input[kSignal];
        }
        const origin = this[kRealm].settingsObject.origin;
        let window = "client";
        if (((_b = (_a = request.window) == null ? void 0 : _a.constructor) == null ? void 0 : _b.name) === "EnvironmentSettingsObject" && sameOrigin(request.window, origin)) {
          window = request.window;
        }
        if (init.window !== void 0 && init.window != null) {
          throw new TypeError(`'window' option '${window}' must be null`);
        }
        if (init.window !== void 0) {
          window = "no-window";
        }
        request = makeRequest({
          method: request.method,
          headersList: request.headersList,
          unsafeRequest: request.unsafeRequest,
          client: this[kRealm].settingsObject,
          window,
          priority: request.priority,
          origin: request.origin,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          mode: request.mode,
          credentials: request.credentials,
          cache: request.cache,
          redirect: request.redirect,
          integrity: request.integrity,
          keepalive: request.keepalive,
          reloadNavigation: request.reloadNavigation,
          historyNavigation: request.historyNavigation,
          urlList: [...request.urlList]
        });
        if (Object.keys(init).length > 0) {
          if (request.mode === "navigate") {
            request.mode = "same-origin";
          }
          request.reloadNavigation = false;
          request.historyNavigation = false;
          request.origin = "client";
          request.referrer = "client";
          request.referrerPolicy = "";
          request.url = request.urlList[request.urlList.length - 1];
          request.urlList = [request.url];
        }
        if (init.referrer !== void 0) {
          const referrer = init.referrer;
          if (referrer === "") {
            request.referrer = "no-referrer";
          } else {
            let parsedReferrer;
            try {
              parsedReferrer = new URL(referrer, baseUrl);
            } catch (err) {
              throw new TypeError(`Referrer "${referrer}" is not a valid URL.`, { cause: err });
            }
            request.referrer = parsedReferrer;
          }
        }
        if (init.referrerPolicy !== void 0) {
          request.referrerPolicy = init.referrerPolicy;
          if (!referrerPolicy.includes(request.referrerPolicy)) {
            throw new TypeError(
              `Failed to construct 'Request': The provided value '${request.referrerPolicy}' is not a valid enum value of type ReferrerPolicy.`
            );
          }
        }
        let mode;
        if (init.mode !== void 0) {
          mode = init.mode;
          if (!requestMode.includes(mode)) {
            throw new TypeError(
              `Failed to construct 'Request': The provided value '${request.mode}' is not a valid enum value of type RequestMode.`
            );
          }
        } else {
          mode = fallbackMode;
        }
        if (mode === "navigate") {
          webidl.errors.exception({
            header: "Request constructor",
            message: "invalid request mode navigate."
          });
        }
        if (mode != null) {
          request.mode = mode;
        }
        if (init.credentials !== void 0) {
          request.credentials = init.credentials;
          if (!requestCredentials.includes(request.credentials)) {
            throw new TypeError(
              `Failed to construct 'Request': The provided value '${request.credentials}' is not a valid enum value of type RequestCredentials.`
            );
          }
        }
        if (init.cache !== void 0) {
          request.cache = init.cache;
          if (!requestCache.includes(request.cache)) {
            throw new TypeError(
              `Failed to construct 'Request': The provided value '${request.cache}' is not a valid enum value of type RequestCache.`
            );
          }
        }
        if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
          throw new TypeError(
            "'only-if-cached' can be set only with 'same-origin' mode"
          );
        }
        if (init.redirect !== void 0) {
          request.redirect = init.redirect;
          if (!requestRedirect.includes(request.redirect)) {
            throw new TypeError(
              `Failed to construct 'Request': The provided value '${request.redirect}' is not a valid enum value of type RequestRedirect.`
            );
          }
        }
        if (init.integrity !== void 0 && init.integrity != null) {
          request.integrity = String(init.integrity);
        }
        if (init.keepalive !== void 0) {
          request.keepalive = Boolean(init.keepalive);
        }
        if (init.method !== void 0) {
          let method = init.method;
          if (!isValidHTTPToken(init.method)) {
            throw TypeError(`'${init.method}' is not a valid HTTP method.`);
          }
          if (forbiddenMethods.indexOf(method.toUpperCase()) !== -1) {
            throw TypeError(`'${init.method}' HTTP method is unsupported.`);
          }
          method = normalizeMethod(init.method);
          request.method = method;
        }
        if (init.signal !== void 0) {
          signal = init.signal;
        }
        this[kState] = request;
        const ac = new AbortController();
        this[kSignal] = ac.signal;
        this[kSignal][kRealm] = this[kRealm];
        if (signal != null) {
          if (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function") {
            throw new TypeError(
              "Failed to construct 'Request': member signal is not of type AbortSignal."
            );
          }
          if (signal.aborted) {
            ac.abort(signal.reason);
          } else {
            const abort = /* @__PURE__ */ __name(() => ac.abort(signal.reason), "abort");
            signal.addEventListener("abort", abort, { once: true });
            requestFinalizer.register(this, { signal, abort });
          }
        }
        this[kHeaders2] = new Headers3();
        this[kHeaders2][kHeadersList2] = request.headersList;
        this[kHeaders2][kGuard2] = "request";
        this[kHeaders2][kRealm] = this[kRealm];
        if (mode === "no-cors") {
          if (!corsSafeListedMethods.includes(request.method)) {
            throw new TypeError(
              `'${request.method} is unsupported in no-cors mode.`
            );
          }
          this[kHeaders2][kGuard2] = "request-no-cors";
        }
        if (Object.keys(init).length !== 0) {
          let headers = new Headers3(this[kHeaders2]);
          if (init.headers !== void 0) {
            headers = init.headers;
          }
          this[kHeaders2][kHeadersList2].clear();
          if (headers.constructor.name === "Headers") {
            for (const [key, val] of headers) {
              this[kHeaders2].append(key, val);
            }
          } else {
            fillHeaders(this[kHeaders2], headers);
          }
        }
        const inputBody = input instanceof Request2 ? input[kState].body : null;
        if ((init.body !== void 0 && init.body != null || inputBody != null) && (request.method === "GET" || request.method === "HEAD")) {
          throw new TypeError("Request with GET/HEAD method cannot have body.");
        }
        let initBody = null;
        if (init.body !== void 0 && init.body != null) {
          const [extractedBody, contentType] = extractBody(
            init.body,
            request.keepalive
          );
          initBody = extractedBody;
          if (contentType && !this[kHeaders2].has("content-type")) {
            this[kHeaders2].append("content-type", contentType);
          }
        }
        const inputOrInitBody = initBody != null ? initBody : inputBody;
        if (inputOrInitBody != null && inputOrInitBody.source == null) {
          if (request.mode !== "same-origin" && request.mode !== "cors") {
            throw new TypeError(
              'If request is made from ReadableStream, mode should be "same-origin" or "cors"'
            );
          }
          request.useCORSPreflightFlag = true;
        }
        let finalBody = inputOrInitBody;
        if (initBody == null && inputBody != null) {
          if (util.isDisturbed(inputBody.stream) || inputBody.stream.locked) {
            throw new TypeError(
              "Cannot construct a Request with a Request object that has already been used."
            );
          }
          if (!TransformStream) {
            TransformStream = require("./streams").TransformStream;
          }
          const identityTransform = new TransformStream();
          inputBody.stream.pipeThrough(identityTransform);
          finalBody = {
            source: inputBody.source,
            length: inputBody.length,
            stream: identityTransform.readable
          };
        }
        this[kState].body = finalBody;
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      get method() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].method;
      }
      get url() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].url.toString();
      }
      get headers() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kHeaders2];
      }
      get destination() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].destination;
      }
      get referrer() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        if (this[kState].referrer === "no-referrer") {
          return "";
        }
        if (this[kState].referrer === "client") {
          return "about:client";
        }
        return this[kState].referrer.toString();
      }
      get referrerPolicy() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].referrerPolicy;
      }
      get mode() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].mode;
      }
      get credentials() {
        return this[kState].credentials;
      }
      get cache() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].cache;
      }
      get redirect() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].redirect;
      }
      get integrity() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].integrity;
      }
      get keepalive() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].keepalive;
      }
      get isReloadNavigation() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].reloadNavigation;
      }
      get isHistoryNavigation() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kState].historyNavigation;
      }
      get signal() {
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        return this[kSignal];
      }
      clone() {
        var _a;
        if (!(this instanceof Request2)) {
          throw new TypeError("Illegal invocation");
        }
        if (this.bodyUsed || ((_a = this.body) == null ? void 0 : _a.locked)) {
          throw new TypeError("unusable");
        }
        const clonedRequest = cloneRequest(this[kState]);
        const clonedRequestObject = new Request2(kInit);
        clonedRequestObject[kState] = clonedRequest;
        clonedRequestObject[kRealm] = this[kRealm];
        clonedRequestObject[kHeaders2] = new Headers3();
        clonedRequestObject[kHeaders2][kHeadersList2] = clonedRequest.headersList;
        clonedRequestObject[kHeaders2][kGuard2] = this[kHeaders2][kGuard2];
        clonedRequestObject[kHeaders2][kRealm] = this[kHeaders2][kRealm];
        const ac = new AbortController();
        if (this.signal.aborted) {
          ac.abort(this.signal.reason);
        } else {
          this.signal.addEventListener(
            "abort",
            () => {
              ac.abort(this.signal.reason);
            },
            { once: true }
          );
        }
        clonedRequestObject[kSignal] = ac.signal;
        return clonedRequestObject;
      }
    };
    __name(Request2, "Request");
    mixinBody(Request2);
    function makeRequest(init) {
      const request = {
        method: "GET",
        localURLsOnly: false,
        unsafeRequest: false,
        body: null,
        client: null,
        reservedClient: null,
        replacesClientId: "",
        window: "client",
        keepalive: false,
        serviceWorkers: "all",
        initiator: "",
        destination: "",
        priority: null,
        origin: "client",
        policyContainer: "client",
        referrer: "client",
        referrerPolicy: "",
        mode: "no-cors",
        useCORSPreflightFlag: false,
        credentials: "same-origin",
        useCredentials: false,
        cache: "default",
        redirect: "follow",
        integrity: "",
        cryptoGraphicsNonceMetadata: "",
        parserMetadata: "",
        reloadNavigation: false,
        historyNavigation: false,
        userActivation: false,
        taintedOrigin: false,
        redirectCount: 0,
        responseTainting: "basic",
        preventNoCacheCacheControlHeaderModification: false,
        done: false,
        timingAllowFailed: false,
        ...init,
        headersList: init.headersList ? new HeadersList2(init.headersList) : new HeadersList2()
      };
      request.url = request.urlList[0];
      return request;
    }
    __name(makeRequest, "makeRequest");
    function cloneRequest(request) {
      const newRequest = makeRequest({ ...request, body: null });
      if (request.body != null) {
        newRequest.body = cloneBody(request.body);
      }
      return newRequest;
    }
    __name(cloneRequest, "cloneRequest");
    Object.defineProperties(Request2.prototype, {
      method: kEnumerableProperty,
      url: kEnumerableProperty,
      headers: kEnumerableProperty,
      redirect: kEnumerableProperty,
      clone: kEnumerableProperty,
      signal: kEnumerableProperty
    });
    webidl.converters.Request = webidl.interfaceConverter(
      Request2
    );
    webidl.converters.RequestInfo = function(V) {
      if (typeof V === "string") {
        return webidl.converters.USVString(V);
      }
      if (V instanceof Request2) {
        return webidl.converters.Request(V);
      }
      return webidl.converters.USVString(V);
    };
    webidl.converters.AbortSignal = webidl.interfaceConverter(
      AbortSignal
    );
    webidl.converters.RequestInit = webidl.dictionaryConverter([
      {
        key: "method",
        converter: webidl.converters.ByteString
      },
      {
        key: "headers",
        converter: webidl.converters.HeadersInit
      },
      {
        key: "body",
        converter: webidl.nullableConverter(
          webidl.converters.BodyInit
        )
      },
      {
        key: "referrer",
        converter: webidl.converters.USVString
      },
      {
        key: "referrerPolicy",
        converter: webidl.converters.DOMString,
        allowedValues: [
          "",
          "no-referrer",
          "no-referrer-when-downgrade",
          "same-origin",
          "origin",
          "strict-origin",
          "origin-when-cross-origin",
          "strict-origin-when-cross-origin",
          "unsafe-url"
        ]
      },
      {
        key: "mode",
        converter: webidl.converters.DOMString,
        allowedValues: [
          "same-origin",
          "cors",
          "no-cors",
          "navigate",
          "websocket"
        ]
      },
      {
        key: "credentials",
        converter: webidl.converters.DOMString,
        allowedValues: [
          "omit",
          "same-origin",
          "include"
        ]
      },
      {
        key: "cache",
        converter: webidl.converters.DOMString,
        allowedValues: [
          "default",
          "no-store",
          "reload",
          "no-cache",
          "force-cache",
          "only-if-cached"
        ]
      },
      {
        key: "redirect",
        converter: webidl.converters.DOMString,
        allowedValues: [
          "follow",
          "error",
          "manual"
        ]
      },
      {
        key: "integrity",
        converter: webidl.converters.DOMString
      },
      {
        key: "keepalive",
        converter: webidl.converters.boolean
      },
      {
        key: "signal",
        converter: webidl.nullableConverter(
          (signal) => webidl.converters.AbortSignal(
            signal,
            { strict: false }
          )
        )
      },
      {
        key: "window",
        converter: webidl.converters.any
      }
    ]);
    module2.exports = { Request: Request2, makeRequest };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/dataURL.js
var require_dataURL = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/dataURL.js"(exports, module2) {
    init_define_process();
    var assert = require("assert");
    var { atob: atob2 } = require_buffer();
    var { isValidHTTPToken } = require_util2();
    var encoder = new TextEncoder();
    function dataURLProcessor(dataURL) {
      assert(dataURL.protocol === "data:");
      let input = URLSerializer(dataURL, true);
      input = input.slice(5);
      const position = { position: 0 };
      let mimeType = collectASequenceOfCodePoints(
        (char) => char !== ",",
        input,
        position
      );
      const mimeTypeLength = mimeType.length;
      mimeType = mimeType.replace(/^(\u0020)+|(\u0020)+$/g, "");
      if (position.position >= input.length) {
        return "failure";
      }
      position.position++;
      const encodedBody = input.slice(mimeTypeLength + 1);
      let body = stringPercentDecode(encodedBody);
      if (/;(\u0020){0,}base64$/i.test(mimeType)) {
        const stringBody = decodeURIComponent(new TextDecoder("utf-8").decode(body));
        body = forgivingBase64(stringBody);
        if (body === "failure") {
          return "failure";
        }
        mimeType = mimeType.slice(0, -6);
        mimeType = mimeType.replace(/(\u0020)+$/, "");
        mimeType = mimeType.slice(0, -1);
      }
      if (mimeType.startsWith(";")) {
        mimeType = "text/plain" + mimeType;
      }
      let mimeTypeRecord = parseMIMEType(mimeType);
      if (mimeTypeRecord === "failure") {
        mimeTypeRecord = parseMIMEType("text/plain;charset=US-ASCII");
      }
      return { mimeType: mimeTypeRecord, body };
    }
    __name(dataURLProcessor, "dataURLProcessor");
    function URLSerializer(url, excludeFragment = false) {
      let output = url.protocol;
      if (url.host.length > 0) {
        output += "//";
        if (url.username.length > 0 || url.password.length > 0) {
          output += url.username;
          if (url.password.length > 0) {
            output += ":" + url.password;
          }
          output += "@";
        }
        output += decodeURIComponent(url.host);
        if (url.port.length > 0) {
          output += ":" + url.port;
        }
      }
      if (url.host.length === 0 && url.pathname.length > 1 && url.href.slice(url.protocol.length + 1)[0] === ".") {
        output += "/.";
      }
      output += url.pathname;
      if (url.search.length > 0) {
        output += url.search;
      }
      if (excludeFragment === false && url.hash.length > 0) {
        output += url.hash;
      }
      return output;
    }
    __name(URLSerializer, "URLSerializer");
    function collectASequenceOfCodePoints(condition, input, position) {
      let result = "";
      while (position.position < input.length && condition(input[position.position])) {
        result += input[position.position];
        position.position++;
      }
      return result;
    }
    __name(collectASequenceOfCodePoints, "collectASequenceOfCodePoints");
    function stringPercentDecode(input) {
      const bytes = encoder.encode(input);
      return percentDecode(bytes);
    }
    __name(stringPercentDecode, "stringPercentDecode");
    function percentDecode(input) {
      const output = [];
      for (let i = 0; i < input.length; i++) {
        const byte = input[i];
        if (byte !== 37) {
          output.push(byte);
        } else if (byte === 37 && !/^[0-9A-Fa-f]{2}$/i.test(String.fromCharCode(input[i + 1], input[i + 2]))) {
          output.push(37);
        } else {
          const nextTwoBytes = String.fromCharCode(input[i + 1], input[i + 2]);
          const bytePoint = Number.parseInt(nextTwoBytes, 16);
          output.push(bytePoint);
          i += 2;
        }
      }
      return Uint8Array.from(output);
    }
    __name(percentDecode, "percentDecode");
    function parseMIMEType(input) {
      input = input.trim();
      const position = { position: 0 };
      const type = collectASequenceOfCodePoints(
        (char) => char !== "/",
        input,
        position
      );
      if (type.length === 0 || !/^[!#$%&'*+-.^_|~A-z0-9]+$/.test(type)) {
        return "failure";
      }
      if (position.position > input.length) {
        return "failure";
      }
      position.position++;
      let subtype = collectASequenceOfCodePoints(
        (char) => char !== ";",
        input,
        position
      );
      subtype = subtype.trim();
      if (subtype.length === 0 || !/^[!#$%&'*+-.^_|~A-z0-9]+$/.test(subtype)) {
        return "failure";
      }
      const mimeType = {
        type: type.toLowerCase(),
        subtype: subtype.toLowerCase(),
        parameters: /* @__PURE__ */ new Map()
      };
      while (position.position < input.length) {
        position.position++;
        collectASequenceOfCodePoints(
          (char) => /(\u000A|\u000D|\u0009|\u0020)/.test(char),
          input,
          position
        );
        let parameterName = collectASequenceOfCodePoints(
          (char) => char !== ";" && char !== "=",
          input,
          position
        );
        parameterName = parameterName.toLowerCase();
        if (position.position < input.length) {
          if (input[position.position] === ";") {
            continue;
          }
          position.position++;
        }
        if (position.position > input.length) {
          break;
        }
        let parameterValue = null;
        if (input[position.position] === '"') {
          parameterValue = collectAnHTTPQuotedString(input, position, true);
          collectASequenceOfCodePoints(
            (char) => char !== ";",
            input,
            position
          );
        } else {
          parameterValue = collectASequenceOfCodePoints(
            (char) => char !== ";",
            input,
            position
          );
          parameterValue = parameterValue.trimEnd();
          if (parameterValue.length === 0) {
            continue;
          }
        }
        if (parameterName.length !== 0 && /^[!#$%&'*+-.^_|~A-z0-9]+$/.test(parameterName) && !/^(\u0009|\x{0020}-\x{007E}|\x{0080}-\x{00FF})+$/.test(parameterValue) && !mimeType.parameters.has(parameterName)) {
          mimeType.parameters.set(parameterName, parameterValue);
        }
      }
      return mimeType;
    }
    __name(parseMIMEType, "parseMIMEType");
    function forgivingBase64(data) {
      data = data.replace(/[\u0009\u000A\u000C\u000D\u0020]/g, "");
      if (data.length % 4 === 0) {
        data = data.replace(/=?=$/, "");
      }
      if (data.length % 4 === 1) {
        return "failure";
      }
      if (/[^+/0-9A-Za-z]/.test(data)) {
        return "failure";
      }
      const binary = atob2(data);
      const bytes = new Uint8Array(binary.length);
      for (let byte = 0; byte < binary.length; byte++) {
        bytes[byte] = binary.charCodeAt(byte);
      }
      return bytes;
    }
    __name(forgivingBase64, "forgivingBase64");
    function collectAnHTTPQuotedString(input, position, extractValue) {
      const positionStart = position.position;
      let value = "";
      assert(input[position.position] === '"');
      position.position++;
      while (true) {
        value += collectASequenceOfCodePoints(
          (char) => char !== '"' && char !== "\\",
          input,
          position
        );
        if (position.position >= input.length) {
          break;
        }
        const quoteOrBackslash = input[position.position];
        position.position++;
        if (quoteOrBackslash === "\\") {
          if (position.position >= input.length) {
            value += "\\";
            break;
          }
          value += input[position.position];
          position.position++;
        } else {
          assert(quoteOrBackslash === '"');
          break;
        }
      }
      if (extractValue) {
        return value;
      }
      return input.slice(positionStart, position.position);
    }
    __name(collectAnHTTPQuotedString, "collectAnHTTPQuotedString");
    function serializeAMimeType(mimeType) {
      assert(mimeType !== "failure");
      const { type, subtype, parameters } = mimeType;
      let serialization = `${type}/${subtype}`;
      for (let [name, value] of parameters.entries()) {
        serialization += ";";
        serialization += name;
        serialization += "=";
        if (!isValidHTTPToken(value)) {
          value = value.replace(/(\\|")/g, "\\$1");
          value = '"' + value;
          value += '"';
        }
        serialization += value;
      }
      return serialization;
    }
    __name(serializeAMimeType, "serializeAMimeType");
    module2.exports = {
      dataURLProcessor,
      URLSerializer,
      collectASequenceOfCodePoints,
      stringPercentDecode,
      parseMIMEType,
      collectAnHTTPQuotedString,
      serializeAMimeType
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/index.js
var require_fetch = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/fetch/index.js"(exports, module2) {
    "use strict";
    init_define_process();
    var {
      Response: Response3,
      makeNetworkError,
      makeAppropriateNetworkError,
      filterResponse,
      makeResponse
    } = require_response();
    var { Headers: Headers3 } = require_headers();
    var { Request: Request2, makeRequest } = require_request();
    var zlib = require("zlib");
    var {
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
      fullyReadBody
    } = require_util2();
    var { kState, kHeaders: kHeaders2, kGuard: kGuard2, kRealm } = require_symbols2();
    var assert = require("assert");
    var { safelyExtractBody, extractBody } = require_body();
    var {
      redirectStatus,
      nullBodyStatus,
      safeMethods,
      requestBodyHeader,
      subresource,
      DOMException
    } = require_constants();
    var { kHeadersList: kHeadersList2 } = require_symbols();
    var EE = require("events");
    var { Readable, pipeline } = require("stream");
    var { isErrored, isReadable } = require_util();
    var { dataURLProcessor, serializeAMimeType } = require_dataURL();
    var { TransformStream } = require("./streams");
    var resolveObjectURL;
    var ReadableStream;
    var nodeVersion = define_process_default.versions.node.split(".");
    var nodeMajor = Number(nodeVersion[0]);
    var nodeMinor = Number(nodeVersion[1]);
    var Fetch = class extends EE {
      constructor(dispatcher) {
        super();
        this.dispatcher = dispatcher;
        this.connection = null;
        this.dump = false;
        this.state = "ongoing";
      }
      terminate(reason) {
        var _a;
        if (this.state !== "ongoing") {
          return;
        }
        this.state = "terminated";
        (_a = this.connection) == null ? void 0 : _a.destroy(reason);
        this.emit("terminated", reason);
      }
      abort() {
        var _a;
        if (this.state !== "ongoing") {
          return;
        }
        const reason = new DOMException("The operation was aborted.", "AbortError");
        this.state = "aborted";
        (_a = this.connection) == null ? void 0 : _a.destroy(reason);
        this.emit("terminated", reason);
      }
    };
    __name(Fetch, "Fetch");
    async function fetch2(input, init = {}) {
      var _a;
      if (arguments.length < 1) {
        throw new TypeError(
          `Failed to execute 'fetch' on 'Window': 1 argument required, but only ${arguments.length} present.`
        );
      }
      const p = createDeferredPromise();
      let requestObject;
      try {
        requestObject = new Request2(input, init);
      } catch (e) {
        p.reject(e);
        return p.promise;
      }
      const request = requestObject[kState];
      if (requestObject.signal.aborted) {
        abortFetch(p, request, null);
        return p.promise;
      }
      const globalObject = request.client.globalObject;
      if (((_a = globalObject == null ? void 0 : globalObject.constructor) == null ? void 0 : _a.name) === "ServiceWorkerGlobalScope") {
        request.serviceWorkers = "none";
      }
      let responseObject = null;
      const relevantRealm = null;
      let locallyAborted = false;
      let controller = null;
      requestObject.signal.addEventListener(
        "abort",
        () => {
          locallyAborted = true;
          abortFetch(p, request, responseObject);
          if (controller != null) {
            controller.abort();
          }
        },
        { once: true }
      );
      const handleFetchDone = /* @__PURE__ */ __name((response) => finalizeAndReportTiming(response, "fetch"), "handleFetchDone");
      const processResponse = /* @__PURE__ */ __name((response) => {
        if (locallyAborted) {
          return;
        }
        if (response.aborted) {
          abortFetch(p, request, responseObject);
          return;
        }
        if (response.type === "error") {
          p.reject(
            Object.assign(new TypeError("fetch failed"), { cause: response.error })
          );
          return;
        }
        responseObject = new Response3();
        responseObject[kState] = response;
        responseObject[kRealm] = relevantRealm;
        responseObject[kHeaders2][kHeadersList2] = response.headersList;
        responseObject[kHeaders2][kGuard2] = "immutable";
        responseObject[kHeaders2][kRealm] = relevantRealm;
        p.resolve(responseObject);
      }, "processResponse");
      controller = fetching({
        request,
        processResponseEndOfBody: handleFetchDone,
        processResponse,
        dispatcher: this
      });
      return p.promise;
    }
    __name(fetch2, "fetch");
    function finalizeAndReportTiming(response, initiatorType = "other") {
      var _a;
      if (response.type === "error" && response.aborted) {
        return;
      }
      if (!((_a = response.urlList) == null ? void 0 : _a.length)) {
        return;
      }
      const originalURL = response.urlList[0];
      let timingInfo = response.timingInfo;
      let cacheState = response.cacheState;
      if (!/^https?:/.test(originalURL.protocol)) {
        return;
      }
      if (timingInfo === null) {
        return;
      }
      if (!timingInfo.timingAllowPassed) {
        timingInfo = createOpaqueTimingInfo({
          startTime: timingInfo.startTime
        });
        cacheState = "";
      }
      response.timingInfo.endTime = coarsenedSharedCurrentTime();
      response.timingInfo = timingInfo;
      markResourceTiming(
        timingInfo,
        originalURL,
        initiatorType,
        globalThis,
        cacheState
      );
    }
    __name(finalizeAndReportTiming, "finalizeAndReportTiming");
    function markResourceTiming(timingInfo, originalURL, initiatorType, globalThis2, cacheState) {
      if (nodeMajor >= 18 && nodeMinor >= 2) {
        performance.markResourceTiming(timingInfo, originalURL, initiatorType, globalThis2, cacheState);
      }
    }
    __name(markResourceTiming, "markResourceTiming");
    function abortFetch(p, request, responseObject) {
      var _a, _b;
      const error = new DOMException("The operation was aborted.", "AbortError");
      p.reject(error);
      if (request.body != null && isReadable((_a = request.body) == null ? void 0 : _a.stream)) {
        request.body.stream.cancel(error).catch((err) => {
          if (err.code === "ERR_INVALID_STATE") {
            return;
          }
          throw err;
        });
      }
      if (responseObject == null) {
        return;
      }
      const response = responseObject[kState];
      if (response.body != null && isReadable((_b = response.body) == null ? void 0 : _b.stream)) {
        response.body.stream.cancel(error).catch((err) => {
          if (err.code === "ERR_INVALID_STATE") {
            return;
          }
          throw err;
        });
      }
    }
    __name(abortFetch, "abortFetch");
    function fetching({
      request,
      processRequestBodyChunkLength,
      processRequestEndOfBody,
      processResponse,
      processResponseEndOfBody,
      processResponseConsumeBody,
      useParallelQueue = false,
      dispatcher
    }) {
      var _a, _b, _c, _d;
      let taskDestination = null;
      let crossOriginIsolatedCapability = false;
      if (request.client != null) {
        taskDestination = request.client.globalObject;
        crossOriginIsolatedCapability = request.client.crossOriginIsolatedCapability;
      }
      const currenTime = coarsenedSharedCurrentTime(crossOriginIsolatedCapability);
      const timingInfo = createOpaqueTimingInfo({
        startTime: currenTime
      });
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
      };
      assert(!request.body || request.body.stream);
      if (request.window === "client") {
        request.window = ((_c = (_b = (_a = request.client) == null ? void 0 : _a.globalObject) == null ? void 0 : _b.constructor) == null ? void 0 : _c.name) === "Window" ? request.client : "no-window";
      }
      if (request.origin === "client") {
        request.origin = (_d = request.client) == null ? void 0 : _d.origin;
      }
      if (request.policyContainer === "client") {
        if (request.client != null) {
          request.policyContainer = clonePolicyContainer(
            request.client.policyContainer
          );
        } else {
          request.policyContainer = makePolicyContainer();
        }
      }
      if (!request.headersList.has("accept")) {
        const value = "*/*";
        request.headersList.append("accept", value);
      }
      if (!request.headersList.has("accept-language")) {
        request.headersList.append("accept-language", "*");
      }
      if (request.priority === null) {
      }
      if (subresource.includes(request.destination)) {
      }
      mainFetch(fetchParams).catch((err) => {
        fetchParams.controller.terminate(err);
      });
      return fetchParams.controller;
    }
    __name(fetching, "fetching");
    async function mainFetch(fetchParams, recursive = false) {
      const request = fetchParams.request;
      let response = null;
      if (request.localURLsOnly && !/^(about|blob|data):/.test(requestCurrentURL(request).protocol)) {
        response = makeNetworkError("local URLs only");
      }
      tryUpgradeRequestToAPotentiallyTrustworthyURL(request);
      if (requestBadPort(request) === "blocked") {
        response = makeNetworkError("bad port");
      }
      if (request.referrerPolicy === "") {
        request.referrerPolicy = request.policyContainer.referrerPolicy;
      }
      if (request.referrer !== "no-referrer") {
        request.referrer = determineRequestsReferrer(request);
      }
      if (response === null) {
        response = await (async () => {
          const currentURL = requestCurrentURL(request);
          if (sameOrigin(currentURL, request.url) && request.responseTainting === "basic" || currentURL.protocol === "data:" || (request.mode === "navigate" || request.mode === "websocket")) {
            request.responseTainting = "basic";
            return await schemeFetch(fetchParams);
          }
          if (request.mode === "same-origin") {
            return makeNetworkError('request mode cannot be "same-origin"');
          }
          if (request.mode === "no-cors") {
            if (request.redirect !== "follow") {
              return makeNetworkError(
                'redirect mode cannot be "follow" for "no-cors" request'
              );
            }
            request.responseTainting = "opaque";
            return await schemeFetch(fetchParams);
          }
          if (!/^https?:/.test(requestCurrentURL(request).protocol)) {
            return makeNetworkError("URL scheme must be a HTTP(S) scheme");
          }
          request.responseTainting = "cors";
          return await httpFetch(fetchParams);
        })();
      }
      if (recursive) {
        return response;
      }
      if (response.status !== 0 && !response.internalResponse) {
        if (request.responseTainting === "cors") {
        }
        if (request.responseTainting === "basic") {
          response = filterResponse(response, "basic");
        } else if (request.responseTainting === "cors") {
          response = filterResponse(response, "cors");
        } else if (request.responseTainting === "opaque") {
          response = filterResponse(response, "opaque");
        } else {
          assert(false);
        }
      }
      let internalResponse = response.status === 0 ? response : response.internalResponse;
      if (internalResponse.urlList.length === 0) {
        internalResponse.urlList.push(...request.urlList);
      }
      if (!request.timingAllowFailed) {
        response.timingAllowPassed = true;
      }
      if (response.type === "opaque" && internalResponse.status === 206 && internalResponse.rangeRequested && !request.headers.has("range")) {
        response = internalResponse = makeNetworkError();
      }
      if (response.status !== 0 && (request.method === "HEAD" || request.method === "CONNECT" || nullBodyStatus.includes(internalResponse.status))) {
        internalResponse.body = null;
        fetchParams.controller.dump = true;
      }
      if (request.integrity) {
        const processBodyError = /* @__PURE__ */ __name((reason) => fetchFinale(fetchParams, makeNetworkError(reason)), "processBodyError");
        if (request.responseTainting === "opaque" || response.body == null) {
          processBodyError(response.error);
          return;
        }
        const processBody = /* @__PURE__ */ __name((bytes) => {
          if (!bytesMatch(bytes, request.integrity)) {
            processBodyError("integrity mismatch");
            return;
          }
          response.body = safelyExtractBody(bytes)[0];
          fetchFinale(fetchParams, response);
        }, "processBody");
        await fullyReadBody(response.body, processBody, processBodyError);
      } else {
        fetchFinale(fetchParams, response);
      }
    }
    __name(mainFetch, "mainFetch");
    async function schemeFetch(fetchParams) {
      const { request } = fetchParams;
      const {
        protocol: scheme,
        pathname: path
      } = requestCurrentURL(request);
      switch (scheme) {
        case "about:": {
          if (path === "blank") {
            const resp = makeResponse({
              statusText: "OK",
              headersList: [
                ["content-type", "text/html;charset=utf-8"]
              ]
            });
            resp.urlList = [new URL("about:blank")];
            return resp;
          }
          return makeNetworkError("invalid path called");
        }
        case "blob:": {
          resolveObjectURL = resolveObjectURL || require_buffer().resolveObjectURL;
          const currentURL = requestCurrentURL(request);
          if (currentURL.search.length !== 0) {
            return makeNetworkError("NetworkError when attempting to fetch resource.");
          }
          const blob = resolveObjectURL(currentURL.toString());
          if (request.method !== "GET" || !isBlobLike(blob)) {
            return makeNetworkError("invalid method");
          }
          const response = makeResponse({ statusText: "OK", urlList: [currentURL] });
          response.headersList.set("content-length", `${blob.size}`);
          response.headersList.set("content-type", blob.type);
          response.body = extractBody(blob)[0];
          return response;
        }
        case "data:": {
          const currentURL = requestCurrentURL(request);
          const dataURLStruct = dataURLProcessor(currentURL);
          if (dataURLStruct === "failure") {
            return makeNetworkError("failed to fetch the data URL");
          }
          const mimeType = serializeAMimeType(dataURLStruct.mimeType);
          return makeResponse({
            statusText: "OK",
            headersList: [
              ["content-type", mimeType]
            ],
            body: extractBody(dataURLStruct.body)[0]
          });
        }
        case "file:": {
          return makeNetworkError("not implemented... yet...");
        }
        case "http:":
        case "https:": {
          return await httpFetch(fetchParams).catch((err) => makeNetworkError(err));
        }
        default: {
          return makeNetworkError("unknown scheme");
        }
      }
    }
    __name(schemeFetch, "schemeFetch");
    function finalizeResponse(fetchParams, response) {
      fetchParams.request.done = true;
      if (fetchParams.processResponseDone != null) {
        queueMicrotask(() => fetchParams.processResponseDone(response));
      }
    }
    __name(finalizeResponse, "finalizeResponse");
    async function fetchFinale(fetchParams, response) {
      if (response.type === "error") {
        response.urlList = [fetchParams.request.urlList[0]];
        response.timingInfo = createOpaqueTimingInfo({
          startTime: fetchParams.timingInfo.startTime
        });
      }
      const processResponseEndOfBody = /* @__PURE__ */ __name(() => {
        fetchParams.request.done = true;
        if (fetchParams.processResponseEndOfBody != null) {
          queueMicrotask(() => fetchParams.processResponseEndOfBody(response));
        }
      }, "processResponseEndOfBody");
      if (fetchParams.processResponse != null) {
        queueMicrotask(() => fetchParams.processResponse(response));
      }
      if (response.body == null) {
        processResponseEndOfBody();
      } else {
        const identityTransformAlgorithm = /* @__PURE__ */ __name((chunk, controller) => {
          controller.enqueue(chunk);
        }, "identityTransformAlgorithm");
        const transformStream = new TransformStream({
          start() {
          },
          transform: identityTransformAlgorithm,
          flush: processResponseEndOfBody
        });
        response.body = { stream: response.body.stream.pipeThrough(transformStream) };
      }
      if (fetchParams.processResponseConsumeBody != null) {
        const processBody = /* @__PURE__ */ __name((nullOrBytes) => fetchParams.processResponseConsumeBody(response, nullOrBytes), "processBody");
        const processBodyError = /* @__PURE__ */ __name((failure) => fetchParams.processResponseConsumeBody(response, failure), "processBodyError");
        if (response.body == null) {
          queueMicrotask(() => processBody(null));
        } else {
          await fullyReadBody(response.body, processBody, processBodyError);
        }
      }
    }
    __name(fetchFinale, "fetchFinale");
    async function httpFetch(fetchParams) {
      const request = fetchParams.request;
      let response = null;
      let actualResponse = null;
      const timingInfo = fetchParams.timingInfo;
      if (request.serviceWorkers === "all") {
      }
      if (response === null) {
        if (request.redirect === "follow") {
          request.serviceWorkers = "none";
        }
        actualResponse = response = await httpNetworkOrCacheFetch(fetchParams);
        if (request.responseTainting === "cors" && corsCheck(request, response) === "failure") {
          return makeNetworkError("cors failure");
        }
        if (TAOCheck(request, response) === "failure") {
          request.timingAllowFailed = true;
        }
      }
      if ((request.responseTainting === "opaque" || response.type === "opaque") && crossOriginResourcePolicyCheck(
        request.origin,
        request.client,
        request.destination,
        actualResponse
      ) === "blocked") {
        return makeNetworkError("blocked");
      }
      if (redirectStatus.includes(actualResponse.status)) {
        if (request.redirect !== "manual") {
          fetchParams.controller.connection.destroy();
        }
        if (request.redirect === "error") {
          response = makeNetworkError("unexpected redirect");
        } else if (request.redirect === "manual") {
          response = actualResponse;
        } else if (request.redirect === "follow") {
          response = await httpRedirectFetch(fetchParams, response);
        } else {
          assert(false);
        }
      }
      response.timingInfo = timingInfo;
      return response;
    }
    __name(httpFetch, "httpFetch");
    async function httpRedirectFetch(fetchParams, response) {
      const request = fetchParams.request;
      const actualResponse = response.internalResponse ? response.internalResponse : response;
      let locationURL;
      try {
        locationURL = responseLocationURL(
          actualResponse,
          requestCurrentURL(request).hash
        );
        if (locationURL == null) {
          return response;
        }
      } catch (err) {
        return makeNetworkError(err);
      }
      if (!/^https?:/.test(locationURL.protocol)) {
        return makeNetworkError("URL scheme must be a HTTP(S) scheme");
      }
      if (request.redirectCount === 20) {
        return makeNetworkError("redirect count exceeded");
      }
      request.redirectCount += 1;
      if (request.mode === "cors" && (locationURL.username || locationURL.password) && !sameOrigin(request, locationURL)) {
        return makeNetworkError('cross origin not allowed for request mode "cors"');
      }
      if (request.responseTainting === "cors" && (locationURL.username || locationURL.password)) {
        return makeNetworkError(
          'URL cannot contain credentials for request mode "cors"'
        );
      }
      if (actualResponse.status !== 303 && request.body != null && request.body.source == null) {
        return makeNetworkError();
      }
      if ([301, 302].includes(actualResponse.status) && request.method === "POST" || actualResponse.status === 303 && !["GET", "HEAD"].includes(request.method)) {
        request.method = "GET";
        request.body = null;
        for (const headerName of requestBodyHeader) {
          request.headersList.delete(headerName);
        }
      }
      if (request.body != null) {
        assert(request.body.source);
        request.body = safelyExtractBody(request.body.source)[0];
      }
      const timingInfo = fetchParams.timingInfo;
      timingInfo.redirectEndTime = timingInfo.postRedirectStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
      if (timingInfo.redirectStartTime === 0) {
        timingInfo.redirectStartTime = timingInfo.startTime;
      }
      request.urlList.push(locationURL);
      setRequestReferrerPolicyOnRedirect(request, actualResponse);
      return mainFetch(fetchParams, true);
    }
    __name(httpRedirectFetch, "httpRedirectFetch");
    async function httpNetworkOrCacheFetch(fetchParams, isAuthenticationFetch = false, isNewConnectionFetch = false) {
      const request = fetchParams.request;
      let httpFetchParams = null;
      let httpRequest = null;
      let response = null;
      const httpCache = null;
      const revalidatingFlag = false;
      if (request.window === "no-window" && request.redirect === "error") {
        httpFetchParams = fetchParams;
        httpRequest = request;
      } else {
        httpRequest = makeRequest(request);
        httpFetchParams = { ...fetchParams };
        httpFetchParams.request = httpRequest;
      }
      const includeCredentials = request.credentials === "include" || request.credentials === "same-origin" && request.responseTainting === "basic";
      const contentLength = httpRequest.body ? httpRequest.body.length : null;
      let contentLengthHeaderValue = null;
      if (httpRequest.body == null && ["POST", "PUT"].includes(httpRequest.method)) {
        contentLengthHeaderValue = "0";
      }
      if (contentLength != null) {
        contentLengthHeaderValue = String(contentLength);
      }
      if (contentLengthHeaderValue != null) {
        httpRequest.headersList.append("content-length", contentLengthHeaderValue);
      }
      if (contentLength != null && httpRequest.keepalive) {
      }
      if (httpRequest.referrer instanceof URL) {
        httpRequest.headersList.append("referer", httpRequest.referrer.href);
      }
      appendRequestOriginHeader(httpRequest);
      appendFetchMetadata(httpRequest);
      if (!httpRequest.headersList.has("user-agent")) {
        httpRequest.headersList.append("user-agent", "undici");
      }
      if (httpRequest.cache === "default" && (httpRequest.headersList.has("if-modified-since") || httpRequest.headersList.has("if-none-match") || httpRequest.headersList.has("if-unmodified-since") || httpRequest.headersList.has("if-match") || httpRequest.headersList.has("if-range"))) {
        httpRequest.cache = "no-store";
      }
      if (httpRequest.cache === "no-cache" && !httpRequest.preventNoCacheCacheControlHeaderModification && !httpRequest.headersList.has("cache-control")) {
        httpRequest.headersList.append("cache-control", "max-age=0");
      }
      if (httpRequest.cache === "no-store" || httpRequest.cache === "reload") {
        if (!httpRequest.headersList.has("pragma")) {
          httpRequest.headersList.append("pragma", "no-cache");
        }
        if (!httpRequest.headersList.has("cache-control")) {
          httpRequest.headersList.append("cache-control", "no-cache");
        }
      }
      if (httpRequest.headersList.has("range")) {
        httpRequest.headersList.append("accept-encoding", "identity");
      }
      if (!httpRequest.headersList.has("accept-encoding")) {
        if (/^https:/.test(requestCurrentURL(httpRequest).protocol)) {
          httpRequest.headersList.append("accept-encoding", "br, gzip, deflate");
        } else {
          httpRequest.headersList.append("accept-encoding", "gzip, deflate");
        }
      }
      if (includeCredentials) {
      }
      if (httpCache == null) {
        httpRequest.cache = "no-store";
      }
      if (httpRequest.mode !== "no-store" && httpRequest.mode !== "reload") {
      }
      if (response == null) {
        if (httpRequest.mode === "only-if-cached") {
          return makeNetworkError("only if cached");
        }
        const forwardResponse = await httpNetworkFetch(
          httpFetchParams,
          includeCredentials,
          isNewConnectionFetch
        );
        if (!safeMethods.includes(httpRequest.method) && forwardResponse.status >= 200 && forwardResponse.status <= 399) {
        }
        if (revalidatingFlag && forwardResponse.status === 304) {
        }
        if (response == null) {
          response = forwardResponse;
        }
      }
      response.urlList = [...httpRequest.urlList];
      if (httpRequest.headersList.has("range")) {
        response.rangeRequested = true;
      }
      response.requestIncludesCredentials = includeCredentials;
      if (response.status === 407) {
        if (request.window === "no-window") {
          return makeNetworkError();
        }
        if (isCancelled(fetchParams)) {
          return makeAppropriateNetworkError(fetchParams);
        }
        return makeNetworkError("proxy authentication required");
      }
      if (response.status === 421 && !isNewConnectionFetch && (request.body == null || request.body.source != null)) {
        if (isCancelled(fetchParams)) {
          return makeAppropriateNetworkError(fetchParams);
        }
        fetchParams.controller.connection.destroy();
        response = await httpNetworkOrCacheFetch(
          fetchParams,
          isAuthenticationFetch,
          true
        );
      }
      if (isAuthenticationFetch) {
      }
      return response;
    }
    __name(httpNetworkOrCacheFetch, "httpNetworkOrCacheFetch");
    async function httpNetworkFetch(fetchParams, includeCredentials = false, forceNewConnection = false) {
      assert(!fetchParams.controller.connection || fetchParams.controller.connection.destroyed);
      fetchParams.controller.connection = {
        abort: null,
        destroyed: false,
        destroy(err) {
          var _a;
          if (!this.destroyed) {
            this.destroyed = true;
            (_a = this.abort) == null ? void 0 : _a.call(this, err != null ? err : new DOMException("The operation was aborted.", "AbortError"));
          }
        }
      };
      const request = fetchParams.request;
      let response = null;
      const timingInfo = fetchParams.timingInfo;
      const httpCache = null;
      if (httpCache == null) {
        request.cache = "no-store";
      }
      const newConnection = forceNewConnection ? "yes" : "no";
      if (request.mode === "websocket") {
      } else {
      }
      let requestBody = null;
      if (request.body == null && fetchParams.processRequestEndOfBody) {
        queueMicrotask(() => fetchParams.processRequestEndOfBody());
      } else if (request.body != null) {
        const processBodyChunk = /* @__PURE__ */ __name(async function* (bytes) {
          var _a;
          if (isCancelled(fetchParams)) {
            return;
          }
          yield bytes;
          (_a = fetchParams.processRequestBodyChunkLength) == null ? void 0 : _a.call(fetchParams, bytes.byteLength);
        }, "processBodyChunk");
        const processEndOfBody = /* @__PURE__ */ __name(() => {
          if (isCancelled(fetchParams)) {
            return;
          }
          if (fetchParams.processRequestEndOfBody) {
            fetchParams.processRequestEndOfBody();
          }
        }, "processEndOfBody");
        const processBodyError = /* @__PURE__ */ __name((e) => {
          if (isCancelled(fetchParams)) {
            return;
          }
          if (e.name === "AbortError") {
            fetchParams.controller.abort();
          } else {
            fetchParams.controller.terminate(e);
          }
        }, "processBodyError");
        requestBody = async function* () {
          try {
            for await (const bytes of request.body.stream) {
              yield* processBodyChunk(bytes);
            }
            processEndOfBody();
          } catch (err) {
            processBodyError(err);
          }
        }();
      }
      try {
        const { body, status, statusText, headersList } = await dispatch({ body: requestBody });
        const iterator = body[Symbol.asyncIterator]();
        fetchParams.controller.next = () => iterator.next();
        response = makeResponse({ status, statusText, headersList });
      } catch (err) {
        if (err.name === "AbortError") {
          fetchParams.controller.connection.destroy();
          return makeAppropriateNetworkError(fetchParams);
        }
        return makeNetworkError(err);
      }
      const pullAlgorithm = /* @__PURE__ */ __name(() => {
        fetchParams.controller.resume();
      }, "pullAlgorithm");
      const cancelAlgorithm = /* @__PURE__ */ __name(() => {
        fetchParams.controller.abort();
      }, "cancelAlgorithm");
      if (!ReadableStream) {
        ReadableStream = require("./streams").ReadableStream;
      }
      const stream = new ReadableStream(
        {
          async start(controller) {
            fetchParams.controller.controller = controller;
          },
          async pull(controller) {
            await pullAlgorithm(controller);
          },
          async cancel(reason) {
            await cancelAlgorithm(reason);
          }
        },
        { highWaterMark: 0 }
      );
      response.body = { stream };
      fetchParams.controller.on("terminated", onAborted);
      fetchParams.controller.resume = async () => {
        var _a;
        while (true) {
          let bytes;
          try {
            const { done, value } = await fetchParams.controller.next();
            if (isAborted(fetchParams)) {
              break;
            }
            bytes = done ? void 0 : value;
          } catch (err) {
            if (fetchParams.controller.ended && !timingInfo.encodedBodySize) {
              bytes = void 0;
            } else {
              bytes = err;
            }
          }
          if (bytes === void 0) {
            try {
              fetchParams.controller.controller.close();
            } catch (err) {
              if (!/Controller is already closed/.test(err)) {
                throw err;
              }
            }
            finalizeResponse(fetchParams, response);
            return;
          }
          timingInfo.decodedBodySize += (_a = bytes == null ? void 0 : bytes.byteLength) != null ? _a : 0;
          if (isErrorLike(bytes)) {
            fetchParams.controller.terminate(bytes);
            return;
          }
          fetchParams.controller.controller.enqueue(new Uint8Array(bytes));
          if (isErrored(stream)) {
            fetchParams.controller.terminate();
            return;
          }
          if (!fetchParams.controller.controller.desiredSize) {
            return;
          }
        }
      };
      function onAborted(reason) {
        if (isAborted(fetchParams)) {
          response.aborted = true;
          if (isReadable(stream)) {
            fetchParams.controller.controller.error(
              new DOMException("The operation was aborted.", "AbortError")
            );
          }
        } else {
          if (isReadable(stream)) {
            fetchParams.controller.controller.error(new TypeError("terminated", {
              cause: isErrorLike(reason) ? reason : void 0
            }));
          }
        }
        fetchParams.controller.connection.destroy();
      }
      __name(onAborted, "onAborted");
      return response;
      async function dispatch({ body }) {
        const url = requestCurrentURL(request);
        return new Promise((resolve, reject) => fetchParams.controller.dispatcher.dispatch(
          {
            path: url.pathname + url.search,
            origin: url.origin,
            method: request.method,
            body: fetchParams.controller.dispatcher.isMockActive ? request.body && request.body.source : body,
            headers: [...request.headersList].flat(),
            maxRedirections: 0,
            bodyTimeout: 3e5,
            headersTimeout: 3e5
          },
          {
            body: null,
            abort: null,
            onConnect(abort) {
              const { connection } = fetchParams.controller;
              if (connection.destroyed) {
                abort(new DOMException("The operation was aborted.", "AbortError"));
              } else {
                fetchParams.controller.on("terminated", abort);
                this.abort = connection.abort = abort;
              }
            },
            onHeaders(status, headersList, resume, statusText) {
              if (status < 200) {
                return;
              }
              let codings = [];
              let location = "";
              const headers = new Headers3();
              for (let n = 0; n < headersList.length; n += 2) {
                const key = headersList[n + 0].toString("latin1");
                const val = headersList[n + 1].toString("latin1");
                if (key.toLowerCase() === "content-encoding") {
                  codings = val.split(",").map((x) => x.trim());
                } else if (key.toLowerCase() === "location") {
                  location = val;
                }
                headers.append(key, val);
              }
              this.body = new Readable({ read: resume });
              const decoders = [];
              const willFollow = request.redirect === "follow" && location && redirectStatus.includes(status);
              if (request.method !== "HEAD" && request.method !== "CONNECT" && !nullBodyStatus.includes(status) && !willFollow) {
                for (const coding of codings) {
                  if (/(x-)?gzip/.test(coding)) {
                    decoders.push(zlib.createGunzip());
                  } else if (/(x-)?deflate/.test(coding)) {
                    decoders.push(zlib.createInflate());
                  } else if (coding === "br") {
                    decoders.push(zlib.createBrotliDecompress());
                  } else {
                    decoders.length = 0;
                    break;
                  }
                }
              }
              resolve({
                status,
                statusText,
                headersList: headers[kHeadersList2],
                body: decoders.length ? pipeline(this.body, ...decoders, () => {
                }) : this.body.on("error", () => {
                })
              });
              return true;
            },
            onData(chunk) {
              if (fetchParams.controller.dump) {
                return;
              }
              const bytes = chunk;
              timingInfo.encodedBodySize += bytes.byteLength;
              return this.body.push(bytes);
            },
            onComplete() {
              if (this.abort) {
                fetchParams.controller.off("terminated", this.abort);
              }
              fetchParams.controller.ended = true;
              this.body.push(null);
            },
            onError(error) {
              var _a;
              if (this.abort) {
                fetchParams.controller.off("terminated", this.abort);
              }
              (_a = this.body) == null ? void 0 : _a.destroy(error);
              fetchParams.controller.terminate(error);
              reject(error);
            }
          }
        ));
      }
      __name(dispatch, "dispatch");
    }
    __name(httpNetworkFetch, "httpNetworkFetch");
    module2.exports = {
      fetch: fetch2,
      Fetch,
      fetching,
      finalizeAndReportTiming
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/dispatcher.js
var require_dispatcher = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/dispatcher.js"(exports, module2) {
    "use strict";
    init_define_process();
    var EventEmitter = require("events");
    var Dispatcher = class extends EventEmitter {
      dispatch() {
        throw new Error("not implemented");
      }
      close() {
        throw new Error("not implemented");
      }
      destroy() {
        throw new Error("not implemented");
      }
    };
    __name(Dispatcher, "Dispatcher");
    module2.exports = Dispatcher;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/dispatcher-base.js
var require_dispatcher_base = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/dispatcher-base.js"(exports, module2) {
    "use strict";
    init_define_process();
    var Dispatcher = require_dispatcher();
    var {
      ClientDestroyedError,
      ClientClosedError,
      InvalidArgumentError: InvalidArgumentError2
    } = require_errors();
    var { kDestroy, kClose, kDispatch, kInterceptors } = require_symbols();
    var kDestroyed = Symbol("destroyed");
    var kClosed = Symbol("closed");
    var kOnDestroyed = Symbol("onDestroyed");
    var kOnClosed = Symbol("onClosed");
    var kInterceptedDispatch = Symbol("Intercepted Dispatch");
    var DispatcherBase = class extends Dispatcher {
      constructor() {
        super();
        this[kDestroyed] = false;
        this[kOnDestroyed] = [];
        this[kClosed] = false;
        this[kOnClosed] = [];
      }
      get destroyed() {
        return this[kDestroyed];
      }
      get closed() {
        return this[kClosed];
      }
      get interceptors() {
        return this[kInterceptors];
      }
      set interceptors(newInterceptors) {
        if (newInterceptors) {
          for (let i = newInterceptors.length - 1; i >= 0; i--) {
            const interceptor = this[kInterceptors][i];
            if (typeof interceptor !== "function") {
              throw new InvalidArgumentError2("interceptor must be an function");
            }
          }
        }
        this[kInterceptors] = newInterceptors;
      }
      close(callback) {
        if (callback === void 0) {
          return new Promise((resolve, reject) => {
            this.close((err, data) => {
              return err ? reject(err) : resolve(data);
            });
          });
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError2("invalid callback");
        }
        if (this[kDestroyed]) {
          queueMicrotask(() => callback(new ClientDestroyedError(), null));
          return;
        }
        if (this[kClosed]) {
          if (this[kOnClosed]) {
            this[kOnClosed].push(callback);
          } else {
            queueMicrotask(() => callback(null, null));
          }
          return;
        }
        this[kClosed] = true;
        this[kOnClosed].push(callback);
        const onClosed = /* @__PURE__ */ __name(() => {
          const callbacks = this[kOnClosed];
          this[kOnClosed] = null;
          for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](null, null);
          }
        }, "onClosed");
        this[kClose]().then(() => this.destroy()).then(() => {
          queueMicrotask(onClosed);
        });
      }
      destroy(err, callback) {
        if (typeof err === "function") {
          callback = err;
          err = null;
        }
        if (callback === void 0) {
          return new Promise((resolve, reject) => {
            this.destroy(err, (err2, data) => {
              return err2 ? reject(err2) : resolve(data);
            });
          });
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError2("invalid callback");
        }
        if (this[kDestroyed]) {
          if (this[kOnDestroyed]) {
            this[kOnDestroyed].push(callback);
          } else {
            queueMicrotask(() => callback(null, null));
          }
          return;
        }
        if (!err) {
          err = new ClientDestroyedError();
        }
        this[kDestroyed] = true;
        this[kOnDestroyed].push(callback);
        const onDestroyed = /* @__PURE__ */ __name(() => {
          const callbacks = this[kOnDestroyed];
          this[kOnDestroyed] = null;
          for (let i = 0; i < callbacks.length; i++) {
            callbacks[i](null, null);
          }
        }, "onDestroyed");
        this[kDestroy](err).then(() => {
          queueMicrotask(onDestroyed);
        });
      }
      [kInterceptedDispatch](opts, handler) {
        if (!this[kInterceptors] || this[kInterceptors].length === 0) {
          this[kInterceptedDispatch] = this[kDispatch];
          return this[kDispatch](opts, handler);
        }
        let dispatch = this[kDispatch].bind(this);
        for (let i = this[kInterceptors].length - 1; i >= 0; i--) {
          dispatch = this[kInterceptors][i](dispatch);
        }
        this[kInterceptedDispatch] = dispatch;
        return dispatch(opts, handler);
      }
      dispatch(opts, handler) {
        if (!handler || typeof handler !== "object") {
          throw new InvalidArgumentError2("handler must be an object");
        }
        try {
          if (!opts || typeof opts !== "object") {
            throw new InvalidArgumentError2("opts must be an object.");
          }
          if (this[kDestroyed]) {
            throw new ClientDestroyedError();
          }
          if (this[kClosed]) {
            throw new ClientClosedError();
          }
          return this[kInterceptedDispatch](opts, handler);
        } catch (err) {
          if (typeof handler.onError !== "function") {
            throw new InvalidArgumentError2("invalid onError method");
          }
          handler.onError(err);
          return false;
        }
      }
    };
    __name(DispatcherBase, "DispatcherBase");
    module2.exports = DispatcherBase;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/node/fixed-queue.js
var require_fixed_queue = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/node/fixed-queue.js"(exports, module2) {
    "use strict";
    init_define_process();
    var kSize = 2048;
    var kMask = kSize - 1;
    var FixedCircularBuffer = class {
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
        return (this.top + 1 & kMask) === this.bottom;
      }
      push(data) {
        this.list[this.top] = data;
        this.top = this.top + 1 & kMask;
      }
      shift() {
        const nextItem = this.list[this.bottom];
        if (nextItem === void 0)
          return null;
        this.list[this.bottom] = void 0;
        this.bottom = this.bottom + 1 & kMask;
        return nextItem;
      }
    };
    __name(FixedCircularBuffer, "FixedCircularBuffer");
    module2.exports = /* @__PURE__ */ __name(class FixedQueue {
      constructor() {
        this.head = this.tail = new FixedCircularBuffer();
      }
      isEmpty() {
        return this.head.isEmpty();
      }
      push(data) {
        if (this.head.isFull()) {
          this.head = this.head.next = new FixedCircularBuffer();
        }
        this.head.push(data);
      }
      shift() {
        const tail = this.tail;
        const next = tail.shift();
        if (tail.isEmpty() && tail.next !== null) {
          this.tail = tail.next;
        }
        return next;
      }
    }, "FixedQueue");
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/pool-stats.js
var require_pool_stats = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/pool-stats.js"(exports, module2) {
    init_define_process();
    var { kFree, kConnected, kPending, kQueued, kRunning, kSize } = require_symbols();
    var kPool = Symbol("pool");
    var PoolStats = class {
      constructor(pool) {
        this[kPool] = pool;
      }
      get connected() {
        return this[kPool][kConnected];
      }
      get free() {
        return this[kPool][kFree];
      }
      get pending() {
        return this[kPool][kPending];
      }
      get queued() {
        return this[kPool][kQueued];
      }
      get running() {
        return this[kPool][kRunning];
      }
      get size() {
        return this[kPool][kSize];
      }
    };
    __name(PoolStats, "PoolStats");
    module2.exports = PoolStats;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/pool-base.js
var require_pool_base = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/pool-base.js"(exports, module2) {
    "use strict";
    init_define_process();
    var DispatcherBase = require_dispatcher_base();
    var FixedQueue = require_fixed_queue();
    var { kConnected, kSize, kRunning, kPending, kQueued, kBusy, kFree, kUrl, kClose, kDestroy, kDispatch } = require_symbols();
    var PoolStats = require_pool_stats();
    var kClients = Symbol("clients");
    var kNeedDrain = Symbol("needDrain");
    var kQueue = Symbol("queue");
    var kClosedResolve = Symbol("closed resolve");
    var kOnDrain = Symbol("onDrain");
    var kOnConnect = Symbol("onConnect");
    var kOnDisconnect = Symbol("onDisconnect");
    var kOnConnectionError = Symbol("onConnectionError");
    var kGetDispatcher = Symbol("get dispatcher");
    var kAddClient = Symbol("add client");
    var kRemoveClient = Symbol("remove client");
    var kStats = Symbol("stats");
    var PoolBase = class extends DispatcherBase {
      constructor() {
        super();
        this[kQueue] = new FixedQueue();
        this[kClients] = [];
        this[kQueued] = 0;
        const pool = this;
        this[kOnDrain] = /* @__PURE__ */ __name(function onDrain(origin, targets) {
          const queue = pool[kQueue];
          let needDrain = false;
          while (!needDrain) {
            const item = queue.shift();
            if (!item) {
              break;
            }
            pool[kQueued]--;
            needDrain = !this.dispatch(item.opts, item.handler);
          }
          this[kNeedDrain] = needDrain;
          if (!this[kNeedDrain] && pool[kNeedDrain]) {
            pool[kNeedDrain] = false;
            pool.emit("drain", origin, [pool, ...targets]);
          }
          if (pool[kClosedResolve] && queue.isEmpty()) {
            Promise.all(pool[kClients].map((c) => c.close())).then(pool[kClosedResolve]);
          }
        }, "onDrain");
        this[kOnConnect] = (origin, targets) => {
          pool.emit("connect", origin, [pool, ...targets]);
        };
        this[kOnDisconnect] = (origin, targets, err) => {
          pool.emit("disconnect", origin, [pool, ...targets], err);
        };
        this[kOnConnectionError] = (origin, targets, err) => {
          pool.emit("connectionError", origin, [pool, ...targets], err);
        };
        this[kStats] = new PoolStats(this);
      }
      get [kBusy]() {
        return this[kNeedDrain];
      }
      get [kConnected]() {
        return this[kClients].filter((client) => client[kConnected]).length;
      }
      get [kFree]() {
        return this[kClients].filter((client) => client[kConnected] && !client[kNeedDrain]).length;
      }
      get [kPending]() {
        let ret = this[kQueued];
        for (const { [kPending]: pending } of this[kClients]) {
          ret += pending;
        }
        return ret;
      }
      get [kRunning]() {
        let ret = 0;
        for (const { [kRunning]: running } of this[kClients]) {
          ret += running;
        }
        return ret;
      }
      get [kSize]() {
        let ret = this[kQueued];
        for (const { [kSize]: size } of this[kClients]) {
          ret += size;
        }
        return ret;
      }
      get stats() {
        return this[kStats];
      }
      async [kClose]() {
        if (this[kQueue].isEmpty()) {
          return Promise.all(this[kClients].map((c) => c.close()));
        } else {
          return new Promise((resolve) => {
            this[kClosedResolve] = resolve;
          });
        }
      }
      async [kDestroy](err) {
        while (true) {
          const item = this[kQueue].shift();
          if (!item) {
            break;
          }
          item.handler.onError(err);
        }
        return Promise.all(this[kClients].map((c) => c.destroy(err)));
      }
      [kDispatch](opts, handler) {
        const dispatcher = this[kGetDispatcher]();
        if (!dispatcher) {
          this[kNeedDrain] = true;
          this[kQueue].push({ opts, handler });
          this[kQueued]++;
        } else if (!dispatcher.dispatch(opts, handler)) {
          dispatcher[kNeedDrain] = true;
          this[kNeedDrain] = !this[kGetDispatcher]();
        }
        return !this[kNeedDrain];
      }
      [kAddClient](client) {
        client.on("drain", this[kOnDrain]).on("connect", this[kOnConnect]).on("disconnect", this[kOnDisconnect]).on("connectionError", this[kOnConnectionError]);
        this[kClients].push(client);
        if (this[kNeedDrain]) {
          define_process_default.nextTick(() => {
            if (this[kNeedDrain]) {
              this[kOnDrain](client[kUrl], [this, client]);
            }
          });
        }
        return this;
      }
      [kRemoveClient](client) {
        client.close(() => {
          const idx = this[kClients].indexOf(client);
          if (idx !== -1) {
            this[kClients].splice(idx, 1);
          }
        });
        this[kNeedDrain] = this[kClients].some((dispatcher) => !dispatcher[kNeedDrain] && dispatcher.closed !== true && dispatcher.destroyed !== true);
      }
    };
    __name(PoolBase, "PoolBase");
    module2.exports = {
      PoolBase,
      kClients,
      kNeedDrain,
      kAddClient,
      kRemoveClient,
      kGetDispatcher
    };
  }
});

// src/patches/undici-core-request.js
var require_undici_core_request = __commonJS({
  "src/patches/undici-core-request.js"(exports, module2) {
    "use strict";
    init_define_process();
    var {
      InvalidArgumentError: InvalidArgumentError2,
      NotSupportedError
    } = require_errors();
    var assert = require("assert");
    var util = require_util();
    var kHandler = Symbol("handler");
    var channels = {};
    var extractBody;
    var nodeVersion = define_process_default.versions.node.split(".");
    var nodeMajor = Number(nodeVersion[0]);
    var nodeMinor = Number(nodeVersion[1]);
    try {
      const diagnosticsChannel = require("diagnostics_channel");
      channels.create = diagnosticsChannel.channel("undici:request:create");
      channels.bodySent = diagnosticsChannel.channel("undici:request:bodySent");
      channels.headers = diagnosticsChannel.channel("undici:request:headers");
      channels.trailers = diagnosticsChannel.channel("undici:request:trailers");
      channels.error = diagnosticsChannel.channel("undici:request:error");
    } catch {
      channels.create = { hasSubscribers: false };
      channels.bodySent = { hasSubscribers: false };
      channels.headers = { hasSubscribers: false };
      channels.trailers = { hasSubscribers: false };
      channels.error = { hasSubscribers: false };
    }
    var Request2 = class {
      constructor(origin, {
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
        throwOnError
      }, handler) {
        if (typeof path !== "string") {
          throw new InvalidArgumentError2("path must be a string");
        } else if (path[0] !== "/" && !(path.startsWith("http://") || path.startsWith("https://")) && method !== "CONNECT") {
          throw new InvalidArgumentError2(
            "path must be an absolute URL or start with a slash"
          );
        }
        if (typeof method !== "string") {
          throw new InvalidArgumentError2("method must be a string");
        }
        if (upgrade && typeof upgrade !== "string") {
          throw new InvalidArgumentError2("upgrade must be a string");
        }
        if (headersTimeout != null && (!Number.isFinite(headersTimeout) || headersTimeout < 0)) {
          throw new InvalidArgumentError2("invalid headersTimeout");
        }
        if (bodyTimeout != null && (!Number.isFinite(bodyTimeout) || bodyTimeout < 0)) {
          throw new InvalidArgumentError2("invalid bodyTimeout");
        }
        this.headersTimeout = headersTimeout;
        this.bodyTimeout = bodyTimeout;
        this.throwOnError = throwOnError === true;
        this.method = method;
        if (body == null) {
          this.body = null;
        } else if (util.isStream(body)) {
          this.body = body;
        } else if (util.isBuffer(body)) {
          this.body = body.byteLength ? body : null;
        } else if (ArrayBuffer.isView(body)) {
          this.body = body.buffer.byteLength ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null;
        } else if (body instanceof ArrayBuffer) {
          this.body = body.byteLength ? Buffer.from(body) : null;
        } else if (typeof body === "string") {
          this.body = body.length ? Buffer.from(body) : null;
        } else if (util.isFormDataLike(body) || util.isIterable(body) || util.isBlobLike(body)) {
          this.body = body;
        } else {
          throw new InvalidArgumentError2(
            "body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable"
          );
        }
        this.completed = false;
        this.aborted = false;
        this.upgrade = upgrade || null;
        this.path = query ? util.buildURL(path, query) : path;
        this.origin = origin;
        this.idempotent = idempotent == null ? method === "HEAD" || method === "GET" : idempotent;
        this.blocking = blocking == null ? false : blocking;
        this.host = null;
        this.contentLength = null;
        this.contentType = null;
        this.headers = "";
        if (Array.isArray(headers)) {
          if (headers.length % 2 !== 0) {
            throw new InvalidArgumentError2("headers array must be even");
          }
          for (let i = 0; i < headers.length; i += 2) {
            processHeader(this, headers[i], headers[i + 1]);
          }
        } else if (headers && typeof headers === "object") {
          const keys = Object.keys(headers);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            processHeader(this, key, headers[key]);
          }
        } else if (headers != null) {
          throw new InvalidArgumentError2("headers must be an object or an array");
        }
        if (util.isFormDataLike(this.body)) {
          if (nodeMajor < 16 || nodeMajor === 16 && nodeMinor < 5) {
            throw new InvalidArgumentError2(
              "Form-Data bodies are only supported in node v16.5 and newer."
            );
          }
          if (!extractBody) {
            extractBody = require_body().extractBody;
          }
          const [bodyStream, contentType] = extractBody(body);
          if (this.contentType == null) {
            this.contentType = contentType;
            this.headers += `content-type: ${contentType}\r
`;
          }
          this.body = bodyStream.stream;
        } else if (util.isBlobLike(body) && this.contentType == null && body.type) {
          this.contentType = body.type;
          this.headers += `content-type: ${body.type}\r
`;
        }
        util.validateHandler(handler, method, upgrade);
        this.servername = util.getServerName(this.host);
        this[kHandler] = handler;
        if (channels.create.hasSubscribers) {
          channels.create.publish({ request: this });
        }
      }
      onBodySent(chunk) {
        if (this[kHandler].onBodySent) {
          try {
            this[kHandler].onBodySent(chunk);
          } catch (err) {
            this.onError(err);
          }
        }
      }
      onRequestSent() {
        if (channels.bodySent.hasSubscribers) {
          channels.bodySent.publish({ request: this });
        }
      }
      onConnect(abort) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onConnect(abort);
      }
      onHeaders(statusCode, headers, resume, statusText) {
        assert(!this.aborted);
        assert(!this.completed);
        if (channels.headers.hasSubscribers) {
          channels.headers.publish({
            request: this,
            response: { statusCode, headers, statusText }
          });
        }
        return this[kHandler].onHeaders(statusCode, headers, resume, statusText);
      }
      onData(chunk) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onData(chunk);
      }
      onUpgrade(statusCode, headers, socket) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onUpgrade(statusCode, headers, socket);
      }
      onComplete(trailers) {
        assert(!this.aborted);
        this.completed = true;
        if (channels.trailers.hasSubscribers) {
          channels.trailers.publish({ request: this, trailers });
        }
        return this[kHandler].onComplete(trailers);
      }
      onError(error) {
        if (channels.error.hasSubscribers) {
          channels.error.publish({ request: this, error });
        }
        if (this.aborted) {
          return;
        }
        this.aborted = true;
        return this[kHandler].onError(error);
      }
      addHeader(key, value) {
        processHeader(this, key, value);
        return this;
      }
    };
    __name(Request2, "Request");
    function processHeader(request, key, val) {
      if (val && typeof val === "object") {
        throw new InvalidArgumentError2(`invalid ${key} header`);
      } else if (val === void 0) {
        return;
      }
      if (request.host === null && key.length === 4 && key.toLowerCase() === "host") {
        request.host = val;
      } else if (request.contentLength === null && key.length === 14 && key.toLowerCase() === "content-length") {
        request.contentLength = parseInt(val, 10);
        if (!Number.isFinite(request.contentLength)) {
          throw new InvalidArgumentError2("invalid content-length header");
        }
      } else if (request.contentType === null && key.length === 12 && key.toLowerCase() === "content-type") {
        request.contentType = val;
        request.headers += `${key}: ${val}\r
`;
      } else if (key.length === 6 && key.toLowerCase() === "expect") {
        throw new NotSupportedError("expect header not supported");
      } else {
        request.headers += `${key}: ${val}\r
`;
      }
    }
    __name(processHeader, "processHeader");
    module2.exports = Request2;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/connect.js
var require_connect = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/core/connect.js"(exports, module2) {
    "use strict";
    init_define_process();
    var net = require("net");
    var assert = require("assert");
    var util = require_util();
    var { InvalidArgumentError: InvalidArgumentError2, ConnectTimeoutError } = require_errors();
    var tls;
    function buildConnector({ maxCachedSessions, socketPath, timeout, ...opts }) {
      if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
        throw new InvalidArgumentError2("maxCachedSessions must be a positive integer or zero");
      }
      const options = { path: socketPath, ...opts };
      const sessionCache = /* @__PURE__ */ new Map();
      timeout = timeout == null ? 1e4 : timeout;
      maxCachedSessions = maxCachedSessions == null ? 100 : maxCachedSessions;
      return /* @__PURE__ */ __name(function connect({ hostname, host, protocol, port, servername, httpSocket }, callback) {
        let socket;
        if (protocol === "https:") {
          if (!tls) {
            tls = require("tls");
          }
          servername = servername || options.servername || util.getServerName(host) || null;
          const sessionKey = servername || hostname;
          const session = sessionCache.get(sessionKey) || null;
          assert(sessionKey);
          socket = tls.connect({
            highWaterMark: 16384,
            ...options,
            servername,
            session,
            socket: httpSocket,
            port: port || 443,
            host: hostname
          });
          socket.on("session", function(session2) {
            if (maxCachedSessions === 0) {
              return;
            }
            if (sessionCache.size >= maxCachedSessions) {
              const { value: oldestKey } = sessionCache.keys().next();
              sessionCache.delete(oldestKey);
            }
            sessionCache.set(sessionKey, session2);
          }).on("error", function(err) {
            if (sessionKey && err.code !== "UND_ERR_INFO") {
              sessionCache.delete(sessionKey);
            }
          });
        } else {
          assert(!httpSocket, "httpSocket can only be sent on TLS update");
          socket = net.connect({
            highWaterMark: 64 * 1024,
            ...options,
            port: port || 80,
            host: hostname
          });
        }
        const cancelTimeout = setupTimeout(() => onConnectTimeout(socket), timeout);
        socket.setNoDelay(true).once(protocol === "https:" ? "secureConnect" : "connect", function() {
          cancelTimeout();
          if (callback) {
            const cb = callback;
            callback = null;
            cb(null, this);
          }
        }).on("error", function(err) {
          cancelTimeout();
          if (callback) {
            const cb = callback;
            callback = null;
            cb(err);
          }
        });
        return socket;
      }, "connect");
    }
    __name(buildConnector, "buildConnector");
    function setupTimeout(onConnectTimeout2, timeout) {
      if (!timeout) {
        return () => {
        };
      }
      let s1 = null;
      let s2 = null;
      const timeoutId = setTimeout(() => {
        s1 = setImmediate(() => {
          if (define_process_default.platform === "win32") {
            s2 = setImmediate(() => onConnectTimeout2());
          } else {
            onConnectTimeout2();
          }
        });
      }, timeout);
      return () => {
        clearTimeout(timeoutId);
        clearImmediate(s1);
        clearImmediate(s2);
      };
    }
    __name(setupTimeout, "setupTimeout");
    function onConnectTimeout(socket) {
      util.destroy(socket, new ConnectTimeoutError());
    }
    __name(onConnectTimeout, "onConnectTimeout");
    module2.exports = buildConnector;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/utils.js
var require_utils2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/utils.js"(exports) {
    "use strict";
    init_define_process();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.enumToMap = void 0;
    function enumToMap(obj) {
      const res = {};
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (typeof value === "number") {
          res[key] = value;
        }
      });
      return res;
    }
    __name(enumToMap, "enumToMap");
    exports.enumToMap = enumToMap;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/constants.js
var require_constants2 = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/constants.js"(exports) {
    "use strict";
    init_define_process();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.SPECIAL_HEADERS = exports.HEADER_STATE = exports.MINOR = exports.MAJOR = exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS = exports.TOKEN = exports.STRICT_TOKEN = exports.HEX = exports.URL_CHAR = exports.STRICT_URL_CHAR = exports.USERINFO_CHARS = exports.MARK = exports.ALPHANUM = exports.NUM = exports.HEX_MAP = exports.NUM_MAP = exports.ALPHA = exports.FINISH = exports.H_METHOD_MAP = exports.METHOD_MAP = exports.METHODS_RTSP = exports.METHODS_ICE = exports.METHODS_HTTP = exports.METHODS = exports.LENIENT_FLAGS = exports.FLAGS = exports.TYPE = exports.ERROR = void 0;
    var utils_1 = require_utils2();
    var ERROR;
    (function(ERROR2) {
      ERROR2[ERROR2["OK"] = 0] = "OK";
      ERROR2[ERROR2["INTERNAL"] = 1] = "INTERNAL";
      ERROR2[ERROR2["STRICT"] = 2] = "STRICT";
      ERROR2[ERROR2["LF_EXPECTED"] = 3] = "LF_EXPECTED";
      ERROR2[ERROR2["UNEXPECTED_CONTENT_LENGTH"] = 4] = "UNEXPECTED_CONTENT_LENGTH";
      ERROR2[ERROR2["CLOSED_CONNECTION"] = 5] = "CLOSED_CONNECTION";
      ERROR2[ERROR2["INVALID_METHOD"] = 6] = "INVALID_METHOD";
      ERROR2[ERROR2["INVALID_URL"] = 7] = "INVALID_URL";
      ERROR2[ERROR2["INVALID_CONSTANT"] = 8] = "INVALID_CONSTANT";
      ERROR2[ERROR2["INVALID_VERSION"] = 9] = "INVALID_VERSION";
      ERROR2[ERROR2["INVALID_HEADER_TOKEN"] = 10] = "INVALID_HEADER_TOKEN";
      ERROR2[ERROR2["INVALID_CONTENT_LENGTH"] = 11] = "INVALID_CONTENT_LENGTH";
      ERROR2[ERROR2["INVALID_CHUNK_SIZE"] = 12] = "INVALID_CHUNK_SIZE";
      ERROR2[ERROR2["INVALID_STATUS"] = 13] = "INVALID_STATUS";
      ERROR2[ERROR2["INVALID_EOF_STATE"] = 14] = "INVALID_EOF_STATE";
      ERROR2[ERROR2["INVALID_TRANSFER_ENCODING"] = 15] = "INVALID_TRANSFER_ENCODING";
      ERROR2[ERROR2["CB_MESSAGE_BEGIN"] = 16] = "CB_MESSAGE_BEGIN";
      ERROR2[ERROR2["CB_HEADERS_COMPLETE"] = 17] = "CB_HEADERS_COMPLETE";
      ERROR2[ERROR2["CB_MESSAGE_COMPLETE"] = 18] = "CB_MESSAGE_COMPLETE";
      ERROR2[ERROR2["CB_CHUNK_HEADER"] = 19] = "CB_CHUNK_HEADER";
      ERROR2[ERROR2["CB_CHUNK_COMPLETE"] = 20] = "CB_CHUNK_COMPLETE";
      ERROR2[ERROR2["PAUSED"] = 21] = "PAUSED";
      ERROR2[ERROR2["PAUSED_UPGRADE"] = 22] = "PAUSED_UPGRADE";
      ERROR2[ERROR2["PAUSED_H2_UPGRADE"] = 23] = "PAUSED_H2_UPGRADE";
      ERROR2[ERROR2["USER"] = 24] = "USER";
    })(ERROR = exports.ERROR || (exports.ERROR = {}));
    var TYPE;
    (function(TYPE2) {
      TYPE2[TYPE2["BOTH"] = 0] = "BOTH";
      TYPE2[TYPE2["REQUEST"] = 1] = "REQUEST";
      TYPE2[TYPE2["RESPONSE"] = 2] = "RESPONSE";
    })(TYPE = exports.TYPE || (exports.TYPE = {}));
    var FLAGS;
    (function(FLAGS2) {
      FLAGS2[FLAGS2["CONNECTION_KEEP_ALIVE"] = 1] = "CONNECTION_KEEP_ALIVE";
      FLAGS2[FLAGS2["CONNECTION_CLOSE"] = 2] = "CONNECTION_CLOSE";
      FLAGS2[FLAGS2["CONNECTION_UPGRADE"] = 4] = "CONNECTION_UPGRADE";
      FLAGS2[FLAGS2["CHUNKED"] = 8] = "CHUNKED";
      FLAGS2[FLAGS2["UPGRADE"] = 16] = "UPGRADE";
      FLAGS2[FLAGS2["CONTENT_LENGTH"] = 32] = "CONTENT_LENGTH";
      FLAGS2[FLAGS2["SKIPBODY"] = 64] = "SKIPBODY";
      FLAGS2[FLAGS2["TRAILING"] = 128] = "TRAILING";
      FLAGS2[FLAGS2["TRANSFER_ENCODING"] = 512] = "TRANSFER_ENCODING";
    })(FLAGS = exports.FLAGS || (exports.FLAGS = {}));
    var LENIENT_FLAGS;
    (function(LENIENT_FLAGS2) {
      LENIENT_FLAGS2[LENIENT_FLAGS2["HEADERS"] = 1] = "HEADERS";
      LENIENT_FLAGS2[LENIENT_FLAGS2["CHUNKED_LENGTH"] = 2] = "CHUNKED_LENGTH";
      LENIENT_FLAGS2[LENIENT_FLAGS2["KEEP_ALIVE"] = 4] = "KEEP_ALIVE";
    })(LENIENT_FLAGS = exports.LENIENT_FLAGS || (exports.LENIENT_FLAGS = {}));
    var METHODS;
    (function(METHODS2) {
      METHODS2[METHODS2["DELETE"] = 0] = "DELETE";
      METHODS2[METHODS2["GET"] = 1] = "GET";
      METHODS2[METHODS2["HEAD"] = 2] = "HEAD";
      METHODS2[METHODS2["POST"] = 3] = "POST";
      METHODS2[METHODS2["PUT"] = 4] = "PUT";
      METHODS2[METHODS2["CONNECT"] = 5] = "CONNECT";
      METHODS2[METHODS2["OPTIONS"] = 6] = "OPTIONS";
      METHODS2[METHODS2["TRACE"] = 7] = "TRACE";
      METHODS2[METHODS2["COPY"] = 8] = "COPY";
      METHODS2[METHODS2["LOCK"] = 9] = "LOCK";
      METHODS2[METHODS2["MKCOL"] = 10] = "MKCOL";
      METHODS2[METHODS2["MOVE"] = 11] = "MOVE";
      METHODS2[METHODS2["PROPFIND"] = 12] = "PROPFIND";
      METHODS2[METHODS2["PROPPATCH"] = 13] = "PROPPATCH";
      METHODS2[METHODS2["SEARCH"] = 14] = "SEARCH";
      METHODS2[METHODS2["UNLOCK"] = 15] = "UNLOCK";
      METHODS2[METHODS2["BIND"] = 16] = "BIND";
      METHODS2[METHODS2["REBIND"] = 17] = "REBIND";
      METHODS2[METHODS2["UNBIND"] = 18] = "UNBIND";
      METHODS2[METHODS2["ACL"] = 19] = "ACL";
      METHODS2[METHODS2["REPORT"] = 20] = "REPORT";
      METHODS2[METHODS2["MKACTIVITY"] = 21] = "MKACTIVITY";
      METHODS2[METHODS2["CHECKOUT"] = 22] = "CHECKOUT";
      METHODS2[METHODS2["MERGE"] = 23] = "MERGE";
      METHODS2[METHODS2["M-SEARCH"] = 24] = "M-SEARCH";
      METHODS2[METHODS2["NOTIFY"] = 25] = "NOTIFY";
      METHODS2[METHODS2["SUBSCRIBE"] = 26] = "SUBSCRIBE";
      METHODS2[METHODS2["UNSUBSCRIBE"] = 27] = "UNSUBSCRIBE";
      METHODS2[METHODS2["PATCH"] = 28] = "PATCH";
      METHODS2[METHODS2["PURGE"] = 29] = "PURGE";
      METHODS2[METHODS2["MKCALENDAR"] = 30] = "MKCALENDAR";
      METHODS2[METHODS2["LINK"] = 31] = "LINK";
      METHODS2[METHODS2["UNLINK"] = 32] = "UNLINK";
      METHODS2[METHODS2["SOURCE"] = 33] = "SOURCE";
      METHODS2[METHODS2["PRI"] = 34] = "PRI";
      METHODS2[METHODS2["DESCRIBE"] = 35] = "DESCRIBE";
      METHODS2[METHODS2["ANNOUNCE"] = 36] = "ANNOUNCE";
      METHODS2[METHODS2["SETUP"] = 37] = "SETUP";
      METHODS2[METHODS2["PLAY"] = 38] = "PLAY";
      METHODS2[METHODS2["PAUSE"] = 39] = "PAUSE";
      METHODS2[METHODS2["TEARDOWN"] = 40] = "TEARDOWN";
      METHODS2[METHODS2["GET_PARAMETER"] = 41] = "GET_PARAMETER";
      METHODS2[METHODS2["SET_PARAMETER"] = 42] = "SET_PARAMETER";
      METHODS2[METHODS2["REDIRECT"] = 43] = "REDIRECT";
      METHODS2[METHODS2["RECORD"] = 44] = "RECORD";
      METHODS2[METHODS2["FLUSH"] = 45] = "FLUSH";
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
      METHODS["M-SEARCH"],
      METHODS.NOTIFY,
      METHODS.SUBSCRIBE,
      METHODS.UNSUBSCRIBE,
      METHODS.PATCH,
      METHODS.PURGE,
      METHODS.MKCALENDAR,
      METHODS.LINK,
      METHODS.UNLINK,
      METHODS.PRI,
      METHODS.SOURCE
    ];
    exports.METHODS_ICE = [
      METHODS.SOURCE
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
      METHODS.GET,
      METHODS.POST
    ];
    exports.METHOD_MAP = utils_1.enumToMap(METHODS);
    exports.H_METHOD_MAP = {};
    Object.keys(exports.METHOD_MAP).forEach((key) => {
      if (/^H/.test(key)) {
        exports.H_METHOD_MAP[key] = exports.METHOD_MAP[key];
      }
    });
    var FINISH;
    (function(FINISH2) {
      FINISH2[FINISH2["SAFE"] = 0] = "SAFE";
      FINISH2[FINISH2["SAFE_WITH_CB"] = 1] = "SAFE_WITH_CB";
      FINISH2[FINISH2["UNSAFE"] = 2] = "UNSAFE";
    })(FINISH = exports.FINISH || (exports.FINISH = {}));
    exports.ALPHA = [];
    for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
      exports.ALPHA.push(String.fromCharCode(i));
      exports.ALPHA.push(String.fromCharCode(i + 32));
    }
    exports.NUM_MAP = {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
      9: 9
    };
    exports.HEX_MAP = {
      0: 0,
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
      7: 7,
      8: 8,
      9: 9,
      A: 10,
      B: 11,
      C: 12,
      D: 13,
      E: 14,
      F: 15,
      a: 10,
      b: 11,
      c: 12,
      d: 13,
      e: 14,
      f: 15
    };
    exports.NUM = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9"
    ];
    exports.ALPHANUM = exports.ALPHA.concat(exports.NUM);
    exports.MARK = ["-", "_", ".", "!", "~", "*", "'", "(", ")"];
    exports.USERINFO_CHARS = exports.ALPHANUM.concat(exports.MARK).concat(["%", ";", ":", "&", "=", "+", "$", ","]);
    exports.STRICT_URL_CHAR = [
      "!",
      '"',
      "$",
      "%",
      "&",
      "'",
      "(",
      ")",
      "*",
      "+",
      ",",
      "-",
      ".",
      "/",
      ":",
      ";",
      "<",
      "=",
      ">",
      "@",
      "[",
      "\\",
      "]",
      "^",
      "_",
      "`",
      "{",
      "|",
      "}",
      "~"
    ].concat(exports.ALPHANUM);
    exports.URL_CHAR = exports.STRICT_URL_CHAR.concat(["	", "\f"]);
    for (let i = 128; i <= 255; i++) {
      exports.URL_CHAR.push(i);
    }
    exports.HEX = exports.NUM.concat(["a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"]);
    exports.STRICT_TOKEN = [
      "!",
      "#",
      "$",
      "%",
      "&",
      "'",
      "*",
      "+",
      "-",
      ".",
      "^",
      "_",
      "`",
      "|",
      "~"
    ].concat(exports.ALPHANUM);
    exports.TOKEN = exports.STRICT_TOKEN.concat([" "]);
    exports.HEADER_CHARS = ["	"];
    for (let i = 32; i <= 255; i++) {
      if (i !== 127) {
        exports.HEADER_CHARS.push(i);
      }
    }
    exports.CONNECTION_TOKEN_CHARS = exports.HEADER_CHARS.filter((c) => c !== 44);
    exports.MAJOR = exports.NUM_MAP;
    exports.MINOR = exports.MAJOR;
    var HEADER_STATE;
    (function(HEADER_STATE2) {
      HEADER_STATE2[HEADER_STATE2["GENERAL"] = 0] = "GENERAL";
      HEADER_STATE2[HEADER_STATE2["CONNECTION"] = 1] = "CONNECTION";
      HEADER_STATE2[HEADER_STATE2["CONTENT_LENGTH"] = 2] = "CONTENT_LENGTH";
      HEADER_STATE2[HEADER_STATE2["TRANSFER_ENCODING"] = 3] = "TRANSFER_ENCODING";
      HEADER_STATE2[HEADER_STATE2["UPGRADE"] = 4] = "UPGRADE";
      HEADER_STATE2[HEADER_STATE2["CONNECTION_KEEP_ALIVE"] = 5] = "CONNECTION_KEEP_ALIVE";
      HEADER_STATE2[HEADER_STATE2["CONNECTION_CLOSE"] = 6] = "CONNECTION_CLOSE";
      HEADER_STATE2[HEADER_STATE2["CONNECTION_UPGRADE"] = 7] = "CONNECTION_UPGRADE";
      HEADER_STATE2[HEADER_STATE2["TRANSFER_ENCODING_CHUNKED"] = 8] = "TRANSFER_ENCODING_CHUNKED";
    })(HEADER_STATE = exports.HEADER_STATE || (exports.HEADER_STATE = {}));
    exports.SPECIAL_HEADERS = {
      "connection": HEADER_STATE.CONNECTION,
      "content-length": HEADER_STATE.CONTENT_LENGTH,
      "proxy-connection": HEADER_STATE.CONNECTION,
      "transfer-encoding": HEADER_STATE.TRANSFER_ENCODING,
      "upgrade": HEADER_STATE.UPGRADE
    };
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/handler/RedirectHandler.js
var require_RedirectHandler = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/handler/RedirectHandler.js"(exports, module2) {
    "use strict";
    init_define_process();
    var util = require_util();
    var { kBodyUsed } = require_symbols();
    var assert = require("assert");
    var { InvalidArgumentError: InvalidArgumentError2 } = require_errors();
    var EE = require("events");
    var redirectableStatusCodes = [300, 301, 302, 303, 307, 308];
    var kBody = Symbol("body");
    var BodyAsyncIterable = class {
      constructor(body) {
        this[kBody] = body;
        this[kBodyUsed] = false;
      }
      async *[Symbol.asyncIterator]() {
        assert(!this[kBodyUsed], "disturbed");
        this[kBodyUsed] = true;
        yield* this[kBody];
      }
    };
    __name(BodyAsyncIterable, "BodyAsyncIterable");
    var RedirectHandler = class {
      constructor(dispatch, maxRedirections, opts, handler) {
        if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
          throw new InvalidArgumentError2("maxRedirections must be a positive number");
        }
        util.validateHandler(handler, opts.method, opts.upgrade);
        this.dispatch = dispatch;
        this.location = null;
        this.abort = null;
        this.opts = { ...opts, maxRedirections: 0 };
        this.maxRedirections = maxRedirections;
        this.handler = handler;
        this.history = [];
        if (util.isStream(this.opts.body)) {
          if (util.bodyLength(this.opts.body) === 0) {
            this.opts.body.on("data", function() {
              assert(false);
            });
          }
          if (typeof this.opts.body.readableDidRead !== "boolean") {
            this.opts.body[kBodyUsed] = false;
            EE.prototype.on.call(this.opts.body, "data", function() {
              this[kBodyUsed] = true;
            });
          }
        } else if (this.opts.body && typeof this.opts.body.pipeTo === "function") {
          this.opts.body = new BodyAsyncIterable(this.opts.body);
        } else if (this.opts.body && typeof this.opts.body !== "string" && !ArrayBuffer.isView(this.opts.body) && util.isIterable(this.opts.body)) {
          this.opts.body = new BodyAsyncIterable(this.opts.body);
        }
      }
      onConnect(abort) {
        this.abort = abort;
        this.handler.onConnect(abort, { history: this.history });
      }
      onUpgrade(statusCode, headers, socket) {
        this.handler.onUpgrade(statusCode, headers, socket);
      }
      onError(error) {
        this.handler.onError(error);
      }
      onHeaders(statusCode, headers, resume, statusText) {
        this.location = this.history.length >= this.maxRedirections || util.isDisturbed(this.opts.body) ? null : parseLocation(statusCode, headers);
        if (this.opts.origin) {
          this.history.push(new URL(this.opts.path, this.opts.origin));
        }
        if (!this.location) {
          return this.handler.onHeaders(statusCode, headers, resume, statusText);
        }
        const { origin, pathname, search } = util.parseURL(new URL(this.location, this.opts.origin && new URL(this.opts.path, this.opts.origin)));
        const path = search ? `${pathname}${search}` : pathname;
        this.opts.headers = cleanRequestHeaders(this.opts.headers, statusCode === 303, this.opts.origin !== origin);
        this.opts.path = path;
        this.opts.origin = origin;
        this.opts.maxRedirections = 0;
        if (statusCode === 303 && this.opts.method !== "HEAD") {
          this.opts.method = "GET";
          this.opts.body = null;
        }
      }
      onData(chunk) {
        if (this.location) {
        } else {
          return this.handler.onData(chunk);
        }
      }
      onComplete(trailers) {
        if (this.location) {
          this.location = null;
          this.abort = null;
          this.dispatch(this.opts, this);
        } else {
          this.handler.onComplete(trailers);
        }
      }
      onBodySent(chunk) {
        if (this.handler.onBodySent) {
          this.handler.onBodySent(chunk);
        }
      }
    };
    __name(RedirectHandler, "RedirectHandler");
    function parseLocation(statusCode, headers) {
      if (redirectableStatusCodes.indexOf(statusCode) === -1) {
        return null;
      }
      for (let i = 0; i < headers.length; i += 2) {
        if (headers[i].toString().toLowerCase() === "location") {
          return headers[i + 1];
        }
      }
    }
    __name(parseLocation, "parseLocation");
    function shouldRemoveHeader(header, removeContent, unknownOrigin) {
      return header.length === 4 && header.toString().toLowerCase() === "host" || removeContent && header.toString().toLowerCase().indexOf("content-") === 0 || unknownOrigin && header.length === 13 && header.toString().toLowerCase() === "authorization" || unknownOrigin && header.length === 6 && header.toString().toLowerCase() === "cookie";
    }
    __name(shouldRemoveHeader, "shouldRemoveHeader");
    function cleanRequestHeaders(headers, removeContent, unknownOrigin) {
      const ret = [];
      if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i += 2) {
          if (!shouldRemoveHeader(headers[i], removeContent, unknownOrigin)) {
            ret.push(headers[i], headers[i + 1]);
          }
        }
      } else if (headers && typeof headers === "object") {
        for (const key of Object.keys(headers)) {
          if (!shouldRemoveHeader(key, removeContent, unknownOrigin)) {
            ret.push(key, headers[key]);
          }
        }
      } else {
        assert(headers == null, "headers must be an object or an array");
      }
      return ret;
    }
    __name(cleanRequestHeaders, "cleanRequestHeaders");
    module2.exports = RedirectHandler;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/interceptor/redirectInterceptor.js
var require_redirectInterceptor = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/interceptor/redirectInterceptor.js"(exports, module2) {
    "use strict";
    init_define_process();
    var RedirectHandler = require_RedirectHandler();
    function createRedirectInterceptor({ maxRedirections: defaultMaxRedirections }) {
      return (dispatch) => {
        return /* @__PURE__ */ __name(function Intercept(opts, handler) {
          const { maxRedirections = defaultMaxRedirections } = opts;
          if (!maxRedirections) {
            return dispatch(opts, handler);
          }
          const redirectHandler = new RedirectHandler(dispatch, maxRedirections, opts, handler);
          opts = { ...opts, maxRedirections: 0 };
          return dispatch(opts, redirectHandler);
        }, "Intercept");
      };
    }
    __name(createRedirectInterceptor, "createRedirectInterceptor");
    module2.exports = createRedirectInterceptor;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/llhttp.wasm.js
var require_llhttp_wasm = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/llhttp.wasm.js"(exports, module2) {
    init_define_process();
    module2.exports = "AGFzbQEAAAABMAhgAX8Bf2ADf39/AX9gBH9/f38Bf2AAAGADf39/AGABfwBgAn9/AGAGf39/f39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQACA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAzk4AwMEAAAFAAAAAAAABQEFAAUFBQAABgAAAAYGAQEBAQEBAQEBAQEBAQEBAQABAAABAQcAAAUFAAMEBQFwAQ4OBQMBAAIGCAF/AUGAuAQLB/UEHwZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAJGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAKGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQA1DGxsaHR0cF9hbGxvYwAMBm1hbGxvYwA6C2xsaHR0cF9mcmVlAA0EZnJlZQA8D2xsaHR0cF9nZXRfdHlwZQAOFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAPFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAQEWxsaHR0cF9nZXRfbWV0aG9kABEWbGxodHRwX2dldF9zdGF0dXNfY29kZQASEmxsaHR0cF9nZXRfdXBncmFkZQATDGxsaHR0cF9yZXNldAAUDmxsaHR0cF9leGVjdXRlABUUbGxodHRwX3NldHRpbmdzX2luaXQAFg1sbGh0dHBfZmluaXNoABcMbGxodHRwX3BhdXNlABgNbGxodHRwX3Jlc3VtZQAZG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAaEGxsaHR0cF9nZXRfZXJybm8AGxdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAcF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uAB0UbGxodHRwX2dldF9lcnJvcl9wb3MAHhFsbGh0dHBfZXJybm9fbmFtZQAfEmxsaHR0cF9tZXRob2RfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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f2pB5ABJDQAgAEHMAUYNACAAQbACRg0AQQQhBSAEQYgEcUGABEYNAiAEQShxRQ0CC0EADwtBAEEDIAApAyBQGyEFCyAFC10BAn9BACEBAkAgAC0AKEEBRg0AIAAvATIiAkGcf2pB5ABJDQAgAkHMAUYNACACQbACRg0AIAAvATAiAEHAAHENAEEBIQEgAEGIBHFBgARGDQAgAEEocUUhAQsgAQuiAQEDfwJAAkACQCAALQAqRQ0AIAAtACtFDQBBACEDIAAvATAiBEECcUUNAQwCC0EAIQMgAC8BMCIEQQFxRQ0BC0EBIQMgAC0AKEEBRg0AIAAvATIiBUGcf2pB5ABJDQAgBUHMAUYNACAFQbACRg0AIARBwABxDQBBACEDIARBiARxQYAERg0AIARBKHFBAEchAwsgAEEAOwEwIABBADoALyADC5QBAQJ/AkACQAJAIAAtACpFDQAgAC0AK0UNAEEAIQEgAC8BMCICQQJxRQ0BDAILQQAhASAALwEwIgJBAXFFDQELQQEhASAALQAoQQFGDQAgAC8BMiIAQZx/akHkAEkNACAAQcwBRg0AIABBsAJGDQAgAkHAAHENAEEAIQEgAkGIBHFBgARGDQAgAkEocUEARyEBCyABC08AIABBGGpCADcDACAAQgA3AwAgAEEwakIANwMAIABBKGpCADcDACAAQSBqQgA3AwAgAEEQakIANwMAIABBCGpCADcDACAAQbwBNgIcQQALewEBfwJAIAAoAgwiAw0AAkAgACgCBEUNACAAIAE2AgQLAkAgACABIAIQuICAgAAiAw0AIAAoAgwPCyAAIAM2AhxBACEDIAAoAgQiAUUNACAAIAEgAiAAKAIIEYGAgIAAACIBRQ0AIAAgAjYCFCAAIAE2AgwgASEDCyADC9POAQMcfwN+BX8jgICAgABBEGsiAySAgICAACABIQQgASEFIAEhBiABIQcgASEIIAEhCSABIQogASELIAEhDCABIQ0gASEOIAEhDyABIRAgASERIAEhEiABIRMgASEUIAEhFSABIRYgASEXIAEhGCABIRkgASEaIAEhGyABIRwgASEdAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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HgwTC0GZASEeDBILQZ0BIR4MEQtBmgEhHgwQC0EBIR4MDwtBmwEhHgwOC0GcASEeDA0LQZ4BIR4MDAtBoAEhHgwLC0GfASEeDAoLQaEBIR4MCQtBogEhHgwIC0GjASEeDAcLQaQBIR4MBgtBpQEhHgwFC0GmASEeDAQLQacBIR4MAwtBqAEhHgwCC0GpASEeDAELQa8BIR4LA0ACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgHg6wAQABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgaHB4fICMkJSYnKCkqLC0uLzD7AjQ2ODk8P0FCQ0RFRkdISUpLTE1OT1BRUlNVV1lcXV5gYmNkZWZnaGtsbW5vcHFyc3R1dnd4eXp7fH1+f4ABgQGCAYMBhAGFAYYBhwGIAYkBigGLAYwBjQGOAY8BkAGRAZIBkwGUAZUBlgGXAZgBmQGaAZsBnAGdAZ4BnwGgAaEBogGjAaQBpQGmAacBqAGpAaoBqwGsAa0BrgGvAbABsQGyAbQBtQG2AbcBuAG5AboBuwG8Ab0BvgG/AcABwQHCAdoB4AHhAeQB8QG9Ar0CCyABIgggAkcNwgFBvAEhHgyVAwsgASIeIAJHDbEBQawBIR4MlAMLIAEiASACRw1nQeIAIR4MkwMLIAEiASACRw1dQdoAIR4MkgMLIAEiASACRw1WQdUAIR4MkQMLIAEiASACRw1SQdMAIR4MkAMLIAEiASACRw1PQdEAIR4MjwMLIAEiASACRw1MQc8AIR4MjgMLIAEiASACRw0QQQwhHgyNAwsgASIBIAJHDTNBOCEeDIwDCyABIgEgAkcNL0E1IR4MiwMLIAEiASACRw0mQTIhHgyKAwsgASIBIAJHDSRBLyEeDIkDCyABIgEgAkcNHUEkIR4MiAMLIAAtAC5BAUYN/QIMxwELIAAgASIBIAIQtICAgABBAUcNtAEMtQELIAAgASIBIAIQrYCAgAAiHg21ASABIQEMsAILAkAgASIBIAJHDQBBBiEeDIUDCyAAIAFBAWoiASACELCAgIAAIh4NtgEgASEBDA8LIABCADcDIEETIR4M8wILIAEiHiACRw0JQQ8hHgyCAwsCQCABIgEgAkYNACABQQFqIQFBESEeDPICC0EHIR4MgQMLIABCACAAKQMgIh8gAiABIh5rrSIgfSIhICEgH1YbNwMgIB8gIFYiIkUNswFBCCEeDIADCwJAIAEiASACRg0AIABBiYCAgAA2AgggACABNgIEIAEhAUEVIR4M8AILQQkhHgz/AgsgASEBIAApAyBQDbIBIAEhAQytAgsCQCABIgEgAkcNAEELIR4M/gILIAAgAUEBaiIBIAIQr4CAgAAiHg2yASABIQEMrQILA0ACQCABLQAAQfCdgIAAai0AACIeQQFGDQAgHkECRw20ASABQQFqIQEMAwsgAUEBaiIBIAJHDQALQQwhHgz8AgsCQCABIgEgAkcNAEENIR4M/AILAkACQCABLQAAIh5Bc2oOFAG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgG2AbYBtgEAtAELIAFBAWohAQy0AQsgAUEBaiEBC0EYIR4M6gILAkAgASIeIAJHDQBBDiEeDPoCC0IAIR8gHiEBAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCAeLQAAQVBqDjfIAccBAAECAwQFBge+Ar4CvgK+Ar4CvgK+AggJCgsMDb4CvgK+Ar4CvgK+Ar4CvgK+Ar4CvgK+Ar4CvgK+Ar4CvgK+Ar4CvgK+Ar4CvgK+Ar4CvgIODxAREhO+AgtCAiEfDMcBC0IDIR8MxgELQgQhHwzFAQtCBSEfDMQBC0IGIR8MwwELQgchHwzCAQtCCCEfDMEBC0IJIR8MwAELQgohHwy/AQtCCyEfDL4BC0IMIR8MvQELQg0hHwy8AQtCDiEfDLsBC0IPIR8MugELQgohHwy5AQtCCyEfDLgBC0IMIR8MtwELQg0hHwy2AQtCDiEfDLUBC0IPIR8MtAELQgAhHwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgHi0AAEFQag43xwHGAQABAgMEBQYHyAHIAcgByAHIAcgByAEICQoLDA3IAcgByAHIAcgByAHIAcgByAHIAcgByAHIAcgByAHIAcgByAHIAcgByAHIAcgByAHIAcgBDg8QERITyAELQgIhHwzGAQtCAyEfDMUBC0IEIR8MxAELQgUhHwzDAQtCBiEfDMIBC0IHIR8MwQELQgghHwzAAQtCCSEfDL8BC0IKIR8MvgELQgshHwy9AQtCDCEfDLwBC0INIR8MuwELQg4hHwy6AQtCDyEfDLkBC0IKIR8MuAELQgshHwy3AQtCDCEfDLYBC0INIR8MtQELQg4hHwy0AQtCDyEfDLMBCyAAQgAgACkDICIfIAIgASIea60iIH0iISAhIB9WGzcDICAfICBWIiJFDbQBQREhHgz3AgsCQCABIgEgAkYNACAAQYmAgIAANgIIIAAgATYCBCABIQFBGyEeDOcCC0ESIR4M9gILIAAgASIeIAIQsoCAgABBf2oOBaYBAKICAbMBtAELQRIhHgzkAgsgAEEBOgAvIB4hAQzyAgsgASIBIAJHDbQBQRYhHgzyAgsgASIcIAJHDRlBOSEeDPECCwJAIAEiASACRw0AQRohHgzxAgsgAEEANgIEIABBioCAgAA2AgggACABIAEQqoCAgAAiHg22ASABIQEMuQELAkAgASIeIAJHDQBBGyEeDPACCwJAIB4tAAAiAUEgRw0AIB5BAWohAQwaCyABQQlHDbYBIB5BAWohAQwZCwJAIAEiASACRg0AIAFBAWohAQwUC0EcIR4M7gILAkAgASIeIAJHDQBBHSEeDO4CCwJAIB4tAAAiAUEJRw0AIB4hAQzSAgsgAUEgRw21ASAeIQEM0QILAkAgASIBIAJHDQBBHiEeDO0CCyABLQAAQQpHDbgBIAFBAWohAQygAgsgASIBIAJHDbgBQSIhHgzrAgsDQAJAIAEtAAAiHkEgRg0AAkAgHkF2ag4EAL4BvgEAvAELIAEhAQzEAQsgAUEBaiIBIAJHDQALQSQhHgzqAgtBJSEeIAEiIyACRg3pAiACICNrIAAoAgAiJGohJSAjISYgJCEBAkADQCAmLQAAIiJBIHIgIiAiQb9/akH/AXFBGkkbQf8BcSABQfCfgIAAai0AAEcNASABQQNGDdYCIAFBAWohASAmQQFqIiYgAkcNAAsgACAlNgIADOoCCyAAQQA2AgAgJiEBDLsBC0EmIR4gASIjIAJGDegCIAIgI2sgACgCACIkaiElICMhJiAkIQECQANAICYtAAAiIkEgciAiICJBv39qQf8BcUEaSRtB/wFxIAFB9J+AgABqLQAARw0BIAFBCEYNvQEgAUEBaiEBICZBAWoiJiACRw0ACyAAICU2AgAM6QILIABBADYCACAmIQEMugELQSchHiABIiMgAkYN5wIgAiAjayAAKAIAIiRqISUgIyEmICQhAQJAA0AgJi0AACIiQSByICIgIkG/f2pB/wFxQRpJG0H/AXEgAUHQpoCAAGotAABHDQEgAUEFRg29ASABQQFqIQEgJkEBaiImIAJHDQALIAAgJTYCAAzoAgsgAEEANgIAICYhAQy5AQsCQCABIgEgAkYNAANAAkAgAS0AAEGAooCAAGotAAAiHkEBRg0AIB5BAkYNCiABIQEMwQELIAFBAWoiASACRw0AC0EjIR4M5wILQSMhHgzmAgsCQCABIgEgAkYNAANAAkAgAS0AACIeQSBGDQAgHkF2ag4EvQG+Ab4BvQG+AQsgAUEBaiIBIAJHDQALQSshHgzmAgtBKyEeDOUCCwNAAkAgAS0AACIeQSBGDQAgHkEJRw0DCyABQQFqIgEgAkcNAAtBLyEeDOQCCwNAAkAgAS0AACIeQSBGDQACQAJAIB5BdmoOBL4BAQG+AQALIB5BLEYNvwELIAEhAQwECyABQQFqIgEgAkcNAAtBMiEeDOMCCyABIQEMvwELQTMhHiABIiYgAkYN4QIgAiAmayAAKAIAIiNqISQgJiEiICMhAQJAA0AgIi0AAEEgciABQYCkgIAAai0AAEcNASABQQZGDdACIAFBAWohASAiQQFqIiIgAkcNAAsgACAkNgIADOICCyAAQQA2AgAgIiEBC0ErIR4M0AILAkAgASIdIAJHDQBBNCEeDOACCyAAQYqAgIAANgIIIAAgHTYCBCAdIQEgAC0ALEF/ag4ErwG5AbsBvQHHAgsgAUEBaiEBDK4BCwJAIAEiASACRg0AA0ACQCABLQAAIh5BIHIgHiAeQb9/akH/AXFBGkkbQf8BcSIeQQlGDQAgHkEgRg0AAkACQAJAAkAgHkGdf2oOEwADAwMDAwMDAQMDAwMDAwMDAwIDCyABQQFqIQFBJiEeDNMCCyABQQFqIQFBJyEeDNICCyABQQFqIQFBKCEeDNECCyABIQEMsgELIAFBAWoiASACRw0AC0EoIR4M3gILQSghHgzdAgsCQCABIgEgAkYNAANAAkAgAS0AAEGAoICAAGotAABBAUYNACABIQEMtwELIAFBAWoiASACRw0AC0EwIR4M3QILQTAhHgzcAgsCQANAAkAgAS0AAEF3ag4YAALBAsECxwLBAsECwQLBAsECwQLBAsECwQLBAsECwQLBAsECwQLBAsECwQIAwQILIAFBAWoiASACRw0AC0E1IR4M3AILIAFBAWohAQtBISEeDMoCCyABIgEgAkcNuQFBNyEeDNkCCwNAAkAgAS0AAEGQpICAAGotAABBAUYNACABIQEMkAILIAFBAWoiASACRw0AC0E4IR4M2AILIBwtAAAiHkEgRg2aASAeQTpHDcYCIAAoAgQhASAAQQA2AgQgACABIBwQqICAgAAiAQ22ASAcQQFqIQEMuAELIAAgASACEKmAgIAAGgtBCiEeDMUCC0E6IR4gASImIAJGDdQCIAIgJmsgACgCACIjaiEkICYhHCAjIQECQANAIBwtAAAiIkEgciAiICJBv39qQf8BcUEaSRtB/wFxIAFBkKaAgABqLQAARw3EAiABQQVGDQEgAUEBaiEBIBxBAWoiHCACRw0ACyAAICQ2AgAM1QILIABBADYCACAAQQE6ACwgJiAja0EGaiEBDL4CC0E7IR4gASImIAJGDdMCIAIgJmsgACgCACIjaiEkICYhHCAjIQECQANAIBwtAAAiIkEgciAiICJBv39qQf8BcUEaSRtB/wFxIAFBlqaAgABqLQAARw3DAiABQQlGDQEgAUEBaiEBIBxBAWoiHCACRw0ACyAAICQ2AgAM1AILIABBADYCACAAQQI6ACwgJiAja0EKaiEBDL0CCwJAIAEiHCACRw0AQTwhHgzTAgsCQAJAIBwtAAAiAUEgciABIAFBv39qQf8BcUEaSRtB/wFxQZJ/ag4HAMMCwwLDAsMCwwIBwwILIBxBAWohAUEyIR4MwwILIBxBAWohAUEzIR4MwgILQT0hHiABIiYgAkYN0QIgAiAmayAAKAIAIiNqISQgJiEcICMhAQNAIBwtAAAiIkEgciAiICJBv39qQf8BcUEaSRtB/wFxIAFBoKaAgABqLQAARw3AAiABQQFGDbQCIAFBAWohASAcQQFqIhwgAkcNAAsgACAkNgIADNECC0E+IR4gASImIAJGDdACIAIgJmsgACgCACIjaiEkICYhHCAjIQECQANAIBwtAAAiIkEgciAiICJBv39qQf8BcUEaSRtB/wFxIAFBoqaAgABqLQAARw3AAiABQQ5GDQEgAUEBaiEBIBxBAWoiHCACRw0ACyAAICQ2AgAM0QILIABBADYCACAAQQE6ACwgJiAja0EPaiEBDLoCC0E/IR4gASImIAJGDc8CIAIgJmsgACgCACIjaiEkICYhHCAjIQECQANAIBwtAAAiIkEgciAiICJBv39qQf8BcUEaSRtB/wFxIAFBwKaAgABqLQAARw2/AiABQQ9GDQEgAUEBaiEBIBxBAWoiHCACRw0ACyAAICQ2AgAM0AILIABBADYCACAAQQM6ACwgJiAja0EQaiEBDLkCC0HAACEeIAEiJiACRg3OAiACICZrIAAoAgAiI2ohJCAmIRwgIyEBAkADQCAcLQAAIiJBIHIgIiAiQb9/akH/AXFBGkkbQf8BcSABQdCmgIAAai0AAEcNvgIgAUEFRg0BIAFBAWohASAcQQFqIhwgAkcNAAsgACAkNgIADM8CCyAAQQA2AgAgAEEEOgAsICYgI2tBBmohAQy4AgsCQCABIhwgAkcNAEHBACEeDM4CCwJAAkACQAJAIBwtAAAiAUEgciABIAFBv39qQf8BcUEaSRtB/wFxQZ1/ag4TAMACwALAAsACwALAAsACwALAAsACwALAAgHAAsACwAICA8ACCyAcQQFqIQFBNSEeDMACCyAcQQFqIQFBNiEeDL8CCyAcQQFqIQFBNyEeDL4CCyAcQQFqIQFBOCEeDL0CCwJAIAEiASACRg0AIABBi4CAgAA2AgggACABNgIEIAEhAUE5IR4MvQILQcIAIR4MzAILIAEiASACRw2vAUHEACEeDMsCC0HFACEeIAEiJiACRg3KAiACICZrIAAoAgAiI2ohJCAmISIgIyEBAkADQCAiLQAAIAFB1qaAgABqLQAARw20ASABQQFGDQEgAUEBaiEBICJBAWoiIiACRw0ACyAAICQ2AgAMywILIABBADYCACAmICNrQQJqIQEMrwELAkAgASIBIAJHDQBBxwAhHgzKAgsgAS0AAEEKRw2zASABQQFqIQEMrwELAkAgASIBIAJHDQBByAAhHgzJAgsCQAJAIAEtAABBdmoOBAG0AbQBALQBCyABQQFqIQFBPSEeDLkCCyABQQFqIQEMrgELAkAgASIBIAJHDQBByQAhHgzIAgtBACEeAkACQAJAAkACQAJAAkACQCABLQAAQVBqDgq7AboBAAECAwQFBge8AQtBAiEeDLoBC0EDIR4MuQELQQQhHgy4AQtBBSEeDLcBC0EGIR4MtgELQQchHgy1AQtBCCEeDLQBC0EJIR4MswELAkAgASIBIAJHDQBBygAhHgzHAgsgAS0AAEEuRw20ASABQQFqIQEMgAILAkAgASIBIAJHDQBBywAhHgzGAgtBACEeAkACQAJAAkACQAJAAkACQCABLQAAQVBqDgq9AbwBAAECAwQFBge+AQtBAiEeDLwBC0EDIR4MuwELQQQhHgy6AQtBBSEeDLkBC0EGIR4MuAELQQchHgy3AQtBCCEeDLYBC0EJIR4MtQELQcwAIR4gASImIAJGDcQCIAIgJmsgACgCACIjaiEkICYhASAjISIDQCABLQAAICJB4qaAgABqLQAARw24ASAiQQNGDbcBICJBAWohIiABQQFqIgEgAkcNAAsgACAkNgIADMQCC0HNACEeIAEiJiACRg3DAiACICZrIAAoAgAiI2ohJCAmIQEgIyEiA0AgAS0AACAiQeamgIAAai0AAEcNtwEgIkECRg25ASAiQQFqISIgAUEBaiIBIAJHDQALIAAgJDYCAAzDAgtBzgAhHiABIiYgAkYNwgIgAiAmayAAKAIAIiNqISQgJiEBICMhIgNAIAEtAAAgIkHppoCAAGotAABHDbYBICJBA0YNuQEgIkEBaiEiIAFBAWoiASACRw0ACyAAICQ2AgAMwgILA0ACQCABLQAAIh5BIEYNAAJAAkACQCAeQbh/ag4LAAG6AboBugG6AboBugG6AboBAroBCyABQQFqIQFBwgAhHgy1AgsgAUEBaiEBQcMAIR4MtAILIAFBAWohAUHEACEeDLMCCyABQQFqIgEgAkcNAAtBzwAhHgzBAgsCQCABIgEgAkYNACAAIAFBAWoiASACEKWAgIAAGiABIQFBByEeDLECC0HQACEeDMACCwNAAkAgAS0AAEHwpoCAAGotAAAiHkEBRg0AIB5BfmoOA7kBugG7AbwBCyABQQFqIgEgAkcNAAtB0QAhHgy/AgsCQCABIgEgAkYNACABQQFqIQEMAwtB0gAhHgy+AgsDQAJAIAEtAABB8KiAgABqLQAAIh5BAUYNAAJAIB5BfmoOBLwBvQG+AQC/AQsgASEBQcYAIR4MrwILIAFBAWoiASACRw0AC0HTACEeDL0CCwJAIAEiASACRw0AQdQAIR4MvQILAkAgAS0AACIeQXZqDhqkAb8BvwGmAb8BvwG/Ab8BvwG/Ab8BvwG/Ab8BvwG/Ab8BvwG/Ab8BvwG/AbQBvwG/AQC9AQsgAUEBaiEBC0EGIR4MqwILA0ACQCABLQAAQfCqgIAAai0AAEEBRg0AIAEhAQz6AQsgAUEBaiIBIAJHDQALQdUAIR4MugILAkAgASIBIAJGDQAgAUEBaiEBDAMLQdYAIR4MuQILAkAgASIBIAJHDQBB1wAhHgy5AgsgAUEBaiEBDAELAkAgASIBIAJHDQBB2AAhHgy4AgsgAUEBaiEBC0EEIR4MpgILAkAgASIiIAJHDQBB2QAhHgy2AgsgIiEBAkACQAJAICItAABB8KyAgABqLQAAQX9qDge+Ab8BwAEA+AEBAsEBCyAiQQFqIQEMCgsgIkEBaiEBDLcBC0EAIR4gAEEANgIcIABB8Y6AgAA2AhAgAEEHNgIMIAAgIkEBajYCFAy1AgsCQANAAkAgAS0AAEHwrICAAGotAAAiHkEERg0AAkACQCAeQX9qDge8Ab0BvgHDAQAEAcMBCyABIQFByQAhHgyoAgsgAUEBaiEBQcsAIR4MpwILIAFBAWoiASACRw0AC0HaACEeDLUCCyABQQFqIQEMtQELAkAgASIiIAJHDQBB2wAhHgy0AgsgIi0AAEEvRw2+ASAiQQFqIQEMBgsCQCABIiIgAkcNAEHcACEeDLMCCwJAICItAAAiAUEvRw0AICJBAWohAUHMACEeDKMCCyABQXZqIgFBFksNvQFBASABdEGJgIACcUUNvQEMkwILAkAgASIBIAJGDQAgAUEBaiEBQc0AIR4MogILQd0AIR4MsQILAkAgASIiIAJHDQBB3wAhHgyxAgsgIiEBAkAgIi0AAEHwsICAAGotAABBf2oOA5IC8AEAvgELQdAAIR4MoAILAkAgASIiIAJGDQADQAJAICItAABB8K6AgABqLQAAIgFBA0YNAAJAIAFBf2oOApQCAL8BCyAiIQFBzgAhHgyiAgsgIkEBaiIiIAJHDQALQd4AIR4MsAILQd4AIR4MrwILAkAgASIBIAJGDQAgAEGMgICAADYCCCAAIAE2AgQgASEBQc8AIR4MnwILQeAAIR4MrgILAkAgASIBIAJHDQBB4QAhHgyuAgsgAEGMgICAADYCCCAAIAE2AgQgASEBC0EDIR4MnAILA0AgAS0AAEEgRw2MAiABQQFqIgEgAkcNAAtB4gAhHgyrAgsCQCABIgEgAkcNAEHjACEeDKsCCyABLQAAQSBHDbgBIAFBAWohAQzUAQsCQCABIgggAkcNAEHkACEeDKoCCyAILQAAQcwARw27ASAIQQFqIQFBEyEeDLkBC0HlACEeIAEiIiACRg2oAiACICJrIAAoAgAiJmohIyAiIQggJiEBA0AgCC0AACABQfCygIAAai0AAEcNugEgAUEFRg24ASABQQFqIQEgCEEBaiIIIAJHDQALIAAgIzYCAAyoAgsCQCABIgggAkcNAEHmACEeDKgCCwJAAkAgCC0AAEG9f2oODAC7AbsBuwG7AbsBuwG7AbsBuwG7AQG7AQsgCEEBaiEBQdQAIR4MmAILIAhBAWohAUHVACEeDJcCC0HnACEeIAEiIiACRg2mAiACICJrIAAoAgAiJmohIyAiIQggJiEBAkADQCAILQAAIAFB7bOAgABqLQAARw25ASABQQJGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICM2AgAMpwILIABBADYCACAiICZrQQNqIQFBECEeDLYBC0HoACEeIAEiIiACRg2lAiACICJrIAAoAgAiJmohIyAiIQggJiEBAkADQCAILQAAIAFB9rKAgABqLQAARw24ASABQQVGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICM2AgAMpgILIABBADYCACAiICZrQQZqIQFBFiEeDLUBC0HpACEeIAEiIiACRg2kAiACICJrIAAoAgAiJmohIyAiIQggJiEBAkADQCAILQAAIAFB/LKAgABqLQAARw23ASABQQNGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICM2AgAMpQILIABBADYCACAiICZrQQRqIQFBBSEeDLQBCwJAIAEiCCACRw0AQeoAIR4MpAILIAgtAABB2QBHDbUBIAhBAWohAUEIIR4MswELAkAgASIIIAJHDQBB6wAhHgyjAgsCQAJAIAgtAABBsn9qDgMAtgEBtgELIAhBAWohAUHZACEeDJMCCyAIQQFqIQFB2gAhHgySAgsCQCABIgggAkcNAEHsACEeDKICCwJAAkAgCC0AAEG4f2oOCAC1AbUBtQG1AbUBtQEBtQELIAhBAWohAUHYACEeDJICCyAIQQFqIQFB2wAhHgyRAgtB7QAhHiABIiIgAkYNoAIgAiAiayAAKAIAIiZqISMgIiEIICYhAQJAA0AgCC0AACABQYCzgIAAai0AAEcNswEgAUECRg0BIAFBAWohASAIQQFqIgggAkcNAAsgACAjNgIADKECC0EAIR4gAEEANgIAICIgJmtBA2ohAQywAQtB7gAhHiABIiIgAkYNnwIgAiAiayAAKAIAIiZqISMgIiEIICYhAQJAA0AgCC0AACABQYOzgIAAai0AAEcNsgEgAUEERg0BIAFBAWohASAIQQFqIgggAkcNAAsgACAjNgIADKACCyAAQQA2AgAgIiAma0EFaiEBQSMhHgyvAQsCQCABIgggAkcN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ImohJiAeIQggIiEBAkADQCAILQAAIAFBp7OAgABqLQAARw2gASABQQFGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICY2AgBBgAEhHgyOAgsgAEEANgIAIB4gImtBAmohAUELIR4MnQELAkAgASIIIAJHDQBBgQEhHgyNAgsCQAJAAkACQCAILQAAQVNqDiMAogGiAaIBogGiAaIBogGiAaIBogGiAaIBogGiAaIBogGiAaIBogGiAaIBogGiAQGiAaIBogGiAaIBAqIBogGiAQOiAQsgCEEBaiEBQekAIR4M/wELIAhBAWohAUHqACEeDP4BCyAIQQFqIQFB7wAhHgz9AQsgCEEBaiEBQfAAIR4M/AELAkAgASIeIAJHDQBBggEhHgyMAgsgAiAeayAAKAIAIiJqISYgHiEIICIhAQJAA0AgCC0AACABQamzgIAAai0AAEcNngEgAUEERg0BIAFBAWohASAIQQFqIgggAkcNAAsgACAmNgIAQYIBIR4MjAILIABBADYCACAeICJrQQVqIQFBGSEeDJsBCwJAIAEiIiACRw0AQYMBIR4MiwILIAIgImsgACgCACImaiEeICIhCCAmIQECQANAIAgtAAAgAUGus4CAAGotAABHDZ0BIAFBBUYNASABQQFqIQEgCEEBaiIIIAJHDQALIAAgHjYCAEGDASEeDIsCCyAAQQA2AgBBBiEeICIgJmtBBmohAQyaAQsCQCABIh4gAkcNAEGEASEeDIoCCyACIB5rIAAoAgAiImohJiAeIQggIiEBAkADQCAILQAAIAFBtLOAgABqLQAARw2cASABQQFGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICY2AgBBhAEhHgyKAgsgAEEANgIAIB4gImtBAmohAUEcIR4MmQELAkAgASIeIAJHDQBBhQEhHgyJAgsgAiAeayAAKAIAIiJqISYgHiEIICIhAQJAA0AgCC0AACABQbazgIAAai0AAEcNmwEgAUEBRg0BIAFBAWohASAIQQFqIgggAkcNAAsgACAmNgIAQYUBIR4MiQILIABBADYCACAeICJrQQJqIQFBJyEeDJgBCwJAIAEiCCACRw0AQYYBIR4MiAILAkACQCAILQAAQax/ag4CAAGbAQsgCEEBaiEBQfQAIR4M+AELIAhBAWohAUH1ACEeDPcBCwJAIAEiHiAC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IiEBDDELIABBxAA2AhwgACAiNgIUIAAgATYCDEEAIR4MeQsgACgCBCEBIABBADYCBAJAIAAgASAiEKSAgIAAIgENACAiIQEMMQsgAEHFADYCHCAAICI2AhQgACABNgIMQQAhHgx4CyAAKAIEIQEgAEEANgIEAkAgACABICIQpICAgAAiAQ0AICIhAQw1CyAAQdAANgIcIAAgIjYCFCAAIAE2AgxBACEeDHcLIABBADYCHCAAICI2AhQgAEHQjICAADYCECAAQQc2AgxBACEeDHYLIABBADYCHCAAIAE2AhQgAEHQjICAADYCECAAQQc2AgxBACEeDHULQQAhHiAAQQA2AhwgACAiNgIUIABBv5SAgAA2AhAgAEEHNgIMDHQLIABBADYCHCAAICI2AhQgAEG/lICAADYCECAAQQc2AgxBACEeDHMLIABBADYCHCAAICI2AhQgAEHUjoCAADYCECAAQQc2AgxBACEeDHILIABBADYCHCAAIAE2AhQgAEHBk4CAADYCECAAQQY2AgxBACEeDHELIABBADYCACAiICZrQQZqIQFBJCEeCyAAIB46ACkgASEBDE4LIABBADYCAAtBACEeIABBADYCHCAAIAg2AhQgAEGklICAADYCECAAQQY2AgwMbQsgACgCBCETIABBADYCBCAAIBMgHhCmgICAACITDQEgHkEBaiETC0GdASEeDFsLIABBqgE2AhwgACATNgIMIAAgHkEBajYCFEEAIR4MagsgACgCBCEUIABBADYCBCAAIBQgHhCmgICAACIUDQEgHkEBaiEUC0GaASEeDFgLIABBqwE2AhwgACAUNgIMIAAgHkEBajYCFEEAIR4MZwsgAEEANgIcIAAgFTYCFCAAQfOKgIAANgIQIABBDTYCDEEAIR4MZgsgAEEANgIcIAAgFjYCFCAAQc6NgIAANgIQIABBCTYCDEEAIR4MZQtBASEeCyAAIB46ACsgF0EBaiEWDC4LIABBADYCHCAAIBc2AhQgAEGijYCAADYCECAAQQk2AgxBACEeDGILIABBADYCHCAAIBg2AhQgAEHFioCAADYCECAAQQk2AgxBACEeDGELQQEhHgsgACAeOgAqIBlBAWohGAwsCyAAQQA2AhwgACAZNgIUIABBuI2AgAA2AhAgAEEJNgIMQQAhHgxeCyAAQQA2AhwgACAZNgIUIABB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QR9GG3QhAiAEKAIAIQYCQANAIAYiBCgCBEF4cSAARg0BIAJBHXYhBiACQQF0IQIgBCAGQQRxakEQaiIDKAIAIgYNAAsgAyABNgIAIAFBGGogBDYCACABIAE2AgwgASABNgIIDAELIAQoAggiACABNgIMIAQgATYCCCABQRhqQQA2AgAgASAENgIMIAEgADYCCAtBAEEAKAKotICAAEF/aiIBQX8gARs2Aqi0gIAACwtOAAJAIAANAD8AQRB0DwsCQCAAQf//A3ENACAAQX9MDQACQCAAQRB2QAAiAEF/Rw0AQQBBMDYC+LeAgABBfw8LIABBEHQPCxC/gICAAAALBAAAAAsLjiwBAEGACAuGLAEAAAACAAAAAwAAAAQAAAAFAAAABgAAAAcAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW52YWxpZCBjaGFyIGluIHVybCBxdWVyeQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2JvZHkAQ29udGVudC1MZW5ndGggb3ZlcmZsb3cAQ2h1bmsgc2l6ZSBvdmVyZmxvdwBSZXNwb25zZSBvdmVyZmxvdwBJbnZhbGlkIG1ldGhvZCBmb3IgSFRUUC94LnggcmVxdWVzdABJbnZhbGlkIG1ldGhvZCBmb3IgUlRTUC94LnggcmVxdWVzdABFeHBlY3RlZCBTT1VSQ0UgbWV0aG9kIGZvciBJQ0UveC54IHJlcXVlc3QASW52YWxpZCBjaGFyIGluIHVybCBmcmFnbWVudCBzdGFydABFeHBlY3RlZCBkb3QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9zdGF0dXMASW52YWxpZCByZXNwb25zZSBzdGF0dXMASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgcGFyYW1ldGVycwBVc2VyIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19oZWFkZXJgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2JlZ2luYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBVbmV4cGVjdGVkIGNoYXIgaW4gdXJsIHNlcnZlcgBJbnZhbGlkIGhlYWRlciB2YWx1ZSBjaGFyAEludmFsaWQgaGVhZGVyIGZpZWxkIGNoYXIASW52YWxpZCBtaW5vciB2ZXJzaW9uAEludmFsaWQgbWFqb3IgdmVyc2lvbgBFeHBlY3RlZCBzcGFjZSBhZnRlciB2ZXJzaW9uAEV4cGVjdGVkIENSTEYgYWZ0ZXIgdmVyc2lvbgBJbnZhbGlkIGhlYWRlciB0b2tlbgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3VybABJbnZhbGlkIGNoYXJhY3RlcnMgaW4gdXJsAFVuZXhwZWN0ZWQgc3RhcnQgY2hhciBpbiB1cmwARG91YmxlIEAgaW4gdXJsAEVtcHR5IENvbnRlbnQtTGVuZ3RoAEludmFsaWQgY2hhcmFjdGVyIGluIENvbnRlbnQtTGVuZ3RoAER1cGxpY2F0ZSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXIgaW4gdXJsIHBhdGgAQ29udGVudC1MZW5ndGggY2FuJ3QgYmUgcHJlc2VudCB3aXRoIFRyYW5zZmVyLUVuY29kaW5nAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHNpemUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfdmFsdWUATWlzc2luZyBleHBlY3RlZCBDUiBhZnRlciBoZWFkZXIgdmFsdWUATWlzc2luZyBleHBlY3RlZCBMRiBhZnRlciBoZWFkZXIgdmFsdWUASW52YWxpZCBgVHJhbnNmZXItRW5jb2RpbmdgIGhlYWRlciB2YWx1ZQBQYXVzZWQgYnkgb25faGVhZGVyc19jb21wbGV0ZQBJbnZhbGlkIEVPRiBzdGF0ZQBvbl9jaHVua19oZWFkZXIgcGF1c2UAb25fbWVzc2FnZV9iZWdpbiBwYXVzZQBvbl9jaHVua19jb21wbGV0ZSBwYXVzZQBvbl9tZXNzYWdlX2NvbXBsZXRlIHBhdXNlAFBhdXNlIG9uIENPTk5FQ1QvVXBncmFkZQBQYXVzZSBvbiBQUkkvVXBncmFkZQBFeHBlY3RlZCBIVFRQLzIgQ29ubmVjdGlvbiBQcmVmYWNlAEV4cGVjdGVkIHNwYWNlIGFmdGVyIG1ldGhvZABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl9maWVsZABQYXVzZWQASW52YWxpZCB3b3JkIGVuY291bnRlcmVkAEludmFsaWQgbWV0aG9kIGVuY291bnRlcmVkAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2NoZW1hAFJlcXVlc3QgaGFzIGludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYABNS0FDVElWSVRZAENPUFkATk9USUZZAFBMQVkAUFVUAENIRUNLT1VUAFBPU1QAUkVQT1JUAEhQRV9JTlZBTElEX0NPTlNUQU5UAEdFVABIUEVfU1RSSUNUAFJFRElSRUNUAENPTk5FQ1QASFBFX0lOVkFMSURfU1RBVFVTAE9QVElPTlMAU0VUX1BBUkFNRVRFUgBHRVRfUEFSQU1FVEVSAEhQRV9VU0VSAEhQRV9DQl9DSFVOS19IRUFERVIATUtDQUxFTkRBUgBTRVRVUABURUFSRE9XTgBIUEVfQ0xPU0VEX0NPTk5FQ1RJT04ASFBFX0lOVkFMSURfVkVSU0lPTgBIUEVfQ0JfTUVTU0FHRV9CRUdJTgBIUEVfSU5WQUxJRF9IRUFERVJfVE9LRU4ASFBFX0lOVkFMSURfVVJMAE1LQ09MAEFDTABIUEVfSU5URVJOQUwASFBFX09LAFVOTElOSwBVTkxPQ0sAUFJJAEhQRV9JTlZBTElEX0NPTlRFTlRfTEVOR1RIAEhQRV9VTkVYUEVDVEVEX0NPTlRFTlRfTEVOR1RIAEZMVVNIAFBST1BQQVRDSABNLVNFQVJDSABIUEVfSU5WQUxJRF9UUkFOU0ZFUl9FTkNPRElORwBFeHBlY3RlZCBDUkxGAEhQRV9JTlZBTElEX0NIVU5LX1NJWkUATU9WRQBIUEVfQ0JfSEVBREVSU19DT01QTEVURQBIUEVfQ0JfQ0hVTktfQ09NUExFVEUASFBFX0NCX01FU1NBR0VfQ09NUExFVEUAREVMRVRFAEhQRV9JTlZBTElEX0VPRl9TVEFURQBQQVVTRQBQVVJHRQBNRVJHRQBIUEVfUEFVU0VEX1VQR1JBREUASFBFX1BBVVNFRF9IMl9VUEdSQURFAFNPVVJDRQBBTk5PVU5DRQBUUkFDRQBERVNDUklCRQBVTlNVQlNDUklCRQBSRUNPUkQASFBFX0lOVkFMSURfTUVUSE9EAFBST1BGSU5EAFVO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AAAAAAAAAAAAAAAEAQEFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAAAAAAAAAEAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAAAAQAAAgAAAAAAAAAAAAAAAAAAAAAAAAMEAAAEBAQEBAQEBAQEBAUEBAQEBAQEBAQEBAQABAAGBwQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAEAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAIAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABOT1VOQ0VFQ0tPVVRORUNURVRFQ1JJQkVMVVNIRVRFQURTRUFSQ0hSR0VDVElWSVRZTEVOREFSVkVPVElGWVBUSU9OU0NIU0VBWVNUQVRDSEdFT1JESVJFQ1RPUlRSQ0hQQVJBTUVURVJVUkNFQlNDUklCRUFSRE9XTkFDRUlORE5LQ0tVQlNDUklCRUhUVFAvQURUUC8=";
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/llhttp_simd.wasm.js
var require_llhttp_simd_wasm = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/llhttp/llhttp_simd.wasm.js"(exports, module2) {
    init_define_process();
    module2.exports = "AGFzbQEAAAABMAhgAX8Bf2ADf39/AX9gBH9/f38Bf2AAAGADf39/AGABfwBgAn9/AGAGf39/f39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQACA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAzk4AwMEAAAFAAAAAAAABQEFAAUFBQAABgAAAAYGAQEBAQEBAQEBAQEBAQEBAQABAAABAQcAAAUFAAMEBQFwAQ4OBQMBAAIGCAF/AUGAuAQLB/UEHwZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAJGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAKGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQA1DGxsaHR0cF9hbGxvYwAMBm1hbGxvYwA6C2xsaHR0cF9mcmVlAA0EZnJlZQA8D2xsaHR0cF9nZXRfdHlwZQAOFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAPFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAQEWxsaHR0cF9nZXRfbWV0aG9kABEWbGxodHRwX2dldF9zdGF0dXNfY29kZQASEmxsaHR0cF9nZXRfdXBncmFkZQATDGxsaHR0cF9yZXNldAAUDmxsaHR0cF9leGVjdXRlABUUbGxodHRwX3NldHRpbmdzX2luaXQAFg1sbGh0dHBfZmluaXNoABcMbGxodHRwX3BhdXNlABgNbGxodHRwX3Jlc3VtZQAZG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAaEGxsaHR0cF9nZXRfZXJybm8AGxdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAcF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uAB0UbGxodHRwX2dldF9lcnJvcl9wb3MAHhFsbGh0dHBfZXJybm9fbmFtZQAfEmxsaHR0cF9tZXRob2RfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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ASEeDBELQZoBIR4MEAtBASEeDA8LQZsBIR4MDgtBnAEhHgwNC0GeASEeDAwLQaABIR4MCwtBnwEhHgwKC0GhASEeDAkLQaIBIR4MCAtBowEhHgwHC0GkASEeDAYLQaUBIR4MBQtBpgEhHgwEC0GnASEeDAMLQagBIR4MAgtBqQEhHgwBC0GvASEeCwNAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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IAgtAABBtH9qDggAsgGyAbIBsgGyAbIBAbIBCyAIQQFqIQFB3QAhHgyPAgsgCEEBaiEBQd4AIR4MjgILAkAgASIIIAJHDQBB8AAhHgyeAgsgCC0AAEHFAEcNrwEgCEEBaiEBDN4BC0HxACEeIAEiIiACRg2cAiACICJrIAAoAgAiJmohIyAiIQggJiEBAkADQCAILQAAIAFBiLOAgABqLQAARw2vASABQQNGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICM2AgAMnQILIABBADYCACAiICZrQQRqIQFBLSEeDKwBC0HyACEeIAEiIiACRg2bAiACICJrIAAoAgAiJmohIyAiIQggJiEBAkADQCAILQAAIAFB0LOAgABqLQAARw2uASABQQhGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICM2AgAMnAILIABBADYCACAiICZrQQlqIQFBKSEeDKsBCwJAIAEiASACRw0AQfMAIR4MmwILQQEhHiABLQAAQd8ARw2qASABQQFqIQEM3AELQfQAIR4gASIiIAJGDZkCIAIgImsgACgCACImaiEjICIhCCAmIQEDQCAILQAAIAFBjLOAgABqLQAARw2rASABQQFGDfcBIAFBAWohASAIQQFqIgggAkcNAAsgACAjNgIADJkCCwJAIAEiHiACRw0AQfUAIR4MmQILIAIgHmsgACgCACIiaiEmIB4hCCAiIQECQANAIAgtAAAgAUGOs4CAAGotAABHDasBIAFBAkYNASABQQFqIQEgCEEBaiIIIAJHDQALIAAgJjYCAEH1ACEeDJkCCyAAQQA2AgAgHiAia0EDaiEBQQIhHgyoAQsCQCABIh4gAkcNAEH2ACEeDJgCCyACIB5rIAAoAgAiImohJiAeIQggIiEBAkADQCAILQAAIAFB8LOAgABqLQAARw2qASABQQFGDQEgAUEBaiEBIAhBAWoiCCACRw0ACyAAICY2AgBB9gAhHgyYAgsgAEEANgIAIB4gImtBAmohAUEfIR4MpwELAkAgASIeIAJHDQBB9wAhHgyXAgsgAiAeayAAKAIAIiJqISYgHiEIICIhAQJAA0AgCC0AACABQfKzgIAAai0AAEcNqQEgAUEBRg0BIAFBAWohASAIQQFqIgggAkcNAAsgACAmNgIAQfcAIR4MlwILIABBADYCACAeICJrQQJq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LwEwQRByOwEwDIcBCyAAQTY2AhwgACABNgIMIAAgHEEBajYCFEEAIR4MoAELIAEtAABBOkcNAiAAKAIEIR4gAEEANgIEIAAgHiABEKiAgIAAIh4NASABQQFqIQELQTEhHgyOAQsgAEE2NgIcIAAgHjYCDCAAIAFBAWo2AhRBACEeDJ0BCyAAQQA2AhwgACABNgIUIABBh46AgAA2AhAgAEEKNgIMQQAhHgycAQsgAUEBaiEBCyAAQYASOwEqIAAgASACEKWAgIAAGiABIQELQawBIR4MiQELIAAoAgQhHiAAQQA2AgQCQCAAIB4gARCkgICAACIeDQAgASEBDFALIABBxAA2AhwgACABNgIUIAAgHjYCDEEAIR4MmAELIABBADYCHCAAICI2AhQgAEHlmICAADYCECAAQQc2AgwgAEEANgIAQQAhHgyXAQsgACgCBCEeIABBADYCBAJAIAAgHiABEKSAgIAAIh4NACABIQEMTwsgAEHFADYCHCAAIAE2AhQgACAeNgIMQQAhHgyWAQtBACEeIABBADYCHCAAIAE2AhQgAEHrjYCAADYCECAAQQk2AgwMlQELQQEhHgsgACAeOgArIAFBAWohASAALQApQSJGDYsBDEwLIABBADYCHCAAIAE2AhQgAEGijYCAADYCECAAQQk2AgxBACEeDJIBCyAAQQA2AhwgACABNgIUIABBxYqAgAA2AhAgAEEJNgIMQQAhHgyRAQtBASEeCyAAIB46ACogAUEBaiEBDEoLIABBADYCHCAAIAE2AhQgAEG4jYCAADYCECAAQQk2AgxBACEeDI4BCyAAQQA2AgAgJiAja0EEaiEBAkAgAC0AKUEjTw0AIAEhAQxKCyAAQQA2AhwgACABNgIUIABBr4mAgAA2AhAgAEEINgIMQQAhHgyNAQsgAEEANgIAC0EAIR4gAEEANgIcIAAgATYCFCAAQbmbgIAANgIQIABBCDYCDAyLAQsgAEEANgIAICYgI2tBA2ohAQJAIAAtAClBIUcNACABIQEMRwsgAEEANgIcIAAgATYCFCAAQfeJgIAANgIQIABBCDYCDEEAIR4MigELIABBADYCACAmICNrQQRqIQECQCAALQApIh5BXWpBC08NACABIQEMRgsCQCAeQQZLDQBBASAedEHKAHFFDQAgASEBDEYLQQAhHiAAQQA2AhwgACABNgIUIABB04mAgAA2AhAgAEEINgIMDIkBCyAAKAIEIR4gAEEANgIEAkAgACAeIAEQpICAgAAiHg0AIAEhAQxGCyAAQdAANgIcIAAgATYCFCAAIB42AgxBACEeDIgBCyAAKAIEIR4gAEEANgIEAkAgACAeIAEQpICAgAAiHg0AIAEhAQw/CyAAQcQANgIcIAAgATYCFCAAIB42AgxBACEeDIcBCyAAKAIEIR4gAEEANgIEAkAgACAeIAEQpICAgAAiHg0AIAEhAQw/CyAAQcUANgIcIAAgATYCFCAAIB42AgxBACEeDIYBCyAAKAIEIR4gAEEANgIEAkAgACAeIAEQpICAgAAiHg0AIAEhAQxDCyAAQdAANgIcIAAgATYCFCAAIB42AgxBACEeDIUBCyAAQQA2AhwgACABNgIUIABBooqAgAA2AhAgAEEHNgIMQQAhHgyEAQsgACgCBCEeIABBADYCBAJAIAAgHiABEKSAgIAAIh4NACABIQEMOwsgAEHEADYCHCAAIAE2AhQgACAeNgIMQQAhHgyDAQsgACgCBCEeIABBADYCBAJAIAAgHiABEKSAgIAAIh4NACABIQEMOwsgAEHFADYCHCAAIAE2AhQgACAeNgIMQQAhHgyCAQsgACgCBCEeIABBADYCBAJAIAAgHiABEKSAgIAAIh4NACABIQEMPwsgAEHQADYCHCAAIAE2AhQgACAeNgIMQQAhHgyBAQsgAEEANgIcIAAgATYCFCAAQbiIgIAANgIQIABBBzYCDEEAIR4MgAELIB5BP0cNASABQQFqIQELQQUhHgxuC0EAIR4gAEEANgIcIAAgATYCFCAAQdOPgIAANgIQIABBBzYCDAx9CyAAKAIEIR4gAEEANgIEAkAgACAeIAEQpICAgAAiHg0AIAEhAQw0CyAAQcQANgIcIAAgATYCFCAAIB42AgxBACEeDHwLIAAoAgQhHiAAQQA2AgQCQCAAIB4gARCkgICAACIeDQAgASEBDDQLIABBxQA2AhwgACABNgIUIAAgHjYCDEEAIR4MewsgACgCBCEeIABBADYCBAJAIAAgHiABEKSAgIAAIh4NACABIQEMOAsgAEHQADYCHCAAIAE2AhQgACAeNgIMQQAhHgx6CyAAKAIEIQEgAEEANgIEAkAgACABICIQpICAgAAiAQ0AICIhAQwxCyAAQcQANgIcIAAgIjYCFCAAIAE2AgxBACEeDHkLIAAoAgQhASAAQQA2AgQCQCAAIAEgIhCkgICAACIBDQAgIiEBDDELIABBxQA2AhwgACAiNgIUIAAgATYCDEEAIR4MeAsgACgCBCEBIABBADYCBAJAIAAgASAiEKSAgIAAIgENACAiIQEMNQsgAEHQADYCHCAAICI2AhQgACABNgIMQQAhHgx3CyAAQQA2AhwgACAiNgIUIABB0IyAgAA2AhAgAEEHNgIMQQAhHgx2CyAAQQA2AhwgACABNgIUIABB0IyAgAA2AhAgAEEHNgIMQQAhHgx1C0EAIR4gAEEANgIcIAAgIjYCFCAAQb+UgIAANgIQIABBBzYCDAx0CyAAQQA2AhwgACAiNgIUIABBv5SAgAA2AhAgAEEHNgIMQQAhHgxzCyAAQQA2AhwgACAiNgIUIABB1I6AgAA2AhAgAEEHNgIMQQAhHgxyCyAAQQA2AhwgACABNgIUIABBwZOAgAA2AhAgAEEGNgIMQQAhHgxxCyAAQQA2AgAgIiAma0EGaiEBQSQhHgsgACAeOgApIAEhAQxOCyAAQQA2AgALQQAhHiAAQQA2AhwgACAINgIUIABBpJSAgAA2AhAgAEEGNgIMDG0LIAAoAgQhEyAAQQA2AgQgACATIB4QpoCAgAAiEw0BIB5BAWohEwtBnQEhHgxbCyAAQaoBNgIcIAAgEzYCDCAAIB5BAWo2AhRBACEeDGoLIAAoAgQhFCAAQQA2AgQgACAUIB4QpoCAgAAiFA0BIB5BAWohFAtBmgEhHgxYCyAAQasBNgIcIAAgFDYCDCAAIB5BAWo2AhRBACEeDGcLIABBADYCHCAAIBU2AhQgAEHzioCAADYCECAAQQ02AgxBACEeDGYLIABBADYCHCAAIBY2AhQgAEHOjYCAADYCECAAQQk2AgxBACEeDGULQQEhHgsgACAeOgArIBdBAWohFgwuCyAAQQA2AhwgACAXNgIUIABBoo2AgAA2AhAgAEEJNgIMQQAhHgxiCyAAQQA2AhwgACAYNgIUIABBxYqAgAA2AhAgAEEJNgIMQQAhHgxhC0EBIR4LIAAgHjoAKiAZQQFqIRgMLAsgAEEANgIcIAAgGTYCFCAAQbiNgIAANgIQIABBCTYCDEEAIR4MXgsgAEEANgIcIAAgGTYCFCAAQbmbgIAANgIQIABBCDYCDCAAQQA2AgBBACEeDF0LIABBADYCAAtBACEeIABBADYCHCAAIAg2AhQgAEGLlICAADYCECAAQQg2AgwMWwsgAEECOgAoIABBADYCACAbIBlrQQNqIRkMNgsgAEECOgAvIAAgCCACEKOAgIAAIh4NAUGvASEeDEkLIAAtAChBf2oOAh4gHwsgHkEVRw0nIABBuwE2AhwgACAINgIUIABBp5KAgAA2AhAgAEEVNgIMQQAhHgxXC0EAIR4MRgtBAiEeDEULQQ4hHgxEC0EQIR4MQwtBHCEeDEILQRQhHgxBC0EWIR4MQAtBFyEeDD8LQRkhHgw+C0EaIR4MPQtBOiEeDDwLQSMhHgw7C0EkIR4MOgtBMCEeDDkLQTshHgw4C0E8IR4MNwtBPiEeDDYLQT8hHgw1C0HAACEeDDQLQcEAIR4MMwtBxQAhHgwyC0HHACEeDDELQcgAIR4MMAtBygAhHgwvC0HfACEeDC4LQeIAIR4MLQtB+wAhHgwsC0GFASEeDCsLQZcBIR4MKgtBmQEhHgwpC0GpASEeDCgLQaQBIR4MJwtBmwEhHgwmC0GeASEeDCULQZ8BIR4MJAtBoQEhHgwjC0GiASEeDCILQacBIR4MIQtBqAEhHgwgCyAAQQA2AhwgACAINgIUIABB5ouAgAA2AhAgAEEQNgIMQQAhHgwvCyAAQQA2AgQgACAdIB0QqoCAgAAiAUUNASAAQS02AhwgACABNgIMIAAgHUEBajYCFEEAIR4MLgsgACgCBCEIIABBADYCBAJAIAAgCCABEKqAgIAAIghFDQAgAEEuNgIcIAAgCDYCDCAAIAFBAWo2AhRBACEeDC4LIAFBAWohAQweCyAdQQFqIQEMHgsgAEEANgIcIAAgHTYCFCAAQbqPgIAANgIQIABBBDYCDEEAIR4MKwsgAEEpNgIcIAAgATYCFCAAIAg2AgxBACEeDCoLIBxBAWohAQweCyAAQQo2AhwgACABNgIUIABBkZKAgAA2AhAgAEEVNgIMQQAhHgwoCyAAQRA2AhwgACABNgIUIABBvpKAgAA2AhAgAEEVNgIMQQAhHgwnCyAAQQA2AhwgACAeNgIUIABBiIyAgAA2AhAgAEEUNgIMQQAhHgwmCyAAQQQ2AhwgACABNgIUIABB1pKAgAA2AhAgAEEVNgIMQQAhHgwlCyAAQQA2AgAgCCAia0EFaiEZC0GjASEeDBMLIABBADYCACAiICZrQQJqIQFB4wAhHgwSCyAAQQA2AgAgAEGBBDsBKCAaIB5rQQJqIQELQdMAIR4MEAsgASEBAkAgAC0AKUEFRw0AQdIAIR4MEAtB0QAhHgwPC0EAIR4gAEEANgIcIABBuo6AgAA2AhAgAEEHNgIMIAAgIkEBajYCFAweCyAAQQA2AgAgJiAja0ECaiEBQTQhHgwNCyABIQELQS0hHgwLCwJAIAEiHSACRg0AA0ACQCAdLQAAQYCigIAAai0AACIBQQFGDQAgAUECRw0DIB1BAWohAQwECyAdQQFqIh0gAkcNAAtBMSEeDBsLQTEhHgwaCyAAQQA6ACwgHSEBDAELQQwhHgwIC0EvIR4MBwsgAUEBaiEBQSIhHgwGC0EfIR4MBQsgAEEANgIAICMgJGtBBGohAUEGIR4LIAAgHjoALCABIQFBDSEeDAMLIABBADYCACAmICNrQQdqIQFBCyEeDAILIABBADYCAAsgAEEAOgAsIBwhAUEJIR4MAAsLQQAhHiAAQQA2AhwgACABNgIUIABBuJGAgAA2AhAgAEEPNgIMDA4LQQAhHiAAQQA2AhwgACABNgIUIABBuJGAgAA2AhAgAEEPNgIMDA0LQQAhHiAAQQA2AhwgACABNgIUIABBlo+AgAA2AhAgAEELNgIMDAwLQQAhHiAAQQA2AhwgACABNgIUIABB8YiAgAA2AhAgAEELNgIMDAsLQQAhHiAAQQA2AhwgACABNgIUIABBiI2AgAA2AhAgAEEKNgIMDAoLIABBAjYCHCAAIAE2AhQgAEHwkoCAADYCECAAQRY2AgxBACEeDAkLQQEhHgwIC0HGACEeIAEiASACRg0HIANBCGogACABIAJB2KaAgABBChC5gICAACADKAIMIQEgAygCCA4DAQcCAAsQv4CAgAAACyAAQQA2AhwgAEGJk4CAADYCECAAQRc2AgwgACABQQFqNgIUQQAhHgwFCyAAQQA2AhwgACABNgIUIABBnpOAgAA2AhAgAEEJNgIMQQAhHgwECwJAIAEiASACRw0AQSEhHgwECwJAIAEtAABBCkYNACAAQQA2AhwgACABNgIUIABB7oyAgAA2AhAgAEEKNgIMQQAhHgwECyAAKAIEIQggAEEANgIEIAAgCCABEKqAgIAAIggNASABQQFqIQELQQAhHiAAQQA2AhwgACABNgIUIABB6pCAgAA2AhAgAEEZNgIMDAILIABBIDYCHCAAIAg2AgwgACABQQFqNgIUQQAhHgwBCwJAIAEiASACRw0AQRQhHgwBCyAAQYmAgIAANgIIIAAgATYCBEETIR4LIANBEGokgICAgAAgHguvAQECfyABKAIAIQYCQAJAIAIgA0YNACAEIAZqIQQgBiADaiACayEHIAIgBkF/cyAFaiIGaiEFA0ACQCACLQAAIAQtAABGDQBBAiEEDAMLAkAgBg0AQQAhBCAFIQIMAwsgBkF/aiEGIARBAWohBCACQQFqIgIgA0cNAAsgByEGIAMhAgsgAEEBNgIAIAEgBjYCACAAIAI2AgQPCyABQQA2AgAgACAENgIAIAAgAjYCBAsKACAAELuAgIAAC5U3AQt/I4CAgIAAQRBrIgEkgICAgAACQEEAKAKgtICAAA0AQQAQvoCAgABBgLiEgABrIgJB2QBJDQBBACEDAkBBACgC4LeAgAAiBA0AQQBCfzcC7LeAgABBAEKAgISAgIDAADcC5LeAgABBACABQQhqQXBxQdiq1aoFcyIENgLgt4CAAEEAQQA2AvS3gIAAQQBBADYCxLeAgAALQQAgAjYCzLeAgABBAEGAuISAADYCyLeAgABBAEGAuISAADYCmLSAgABBACAENgKstICAAEEAQX82Aqi0gIAAA0AgA0HEtICAAGogA0G4tICAAGoiBDYCACAEIANBsLSAgABqIgU2AgAgA0G8tICAAGogBTYCACADQcy0gIAAaiADQcC0gIAAaiIFNgIAIAUgBDYCACADQdS0gIAAaiADQci0gIAAaiIENgIAIAQgBTYCACADQdC0gIAAaiAENgIAIANBIGoiA0GAAkcNAAtBgLiEgABBeEGAuISAAGtBD3FBAEGAuISAAEEIakEPcRsiA2oiBEEEaiACIANrQUhqIgNBAXI2AgBBAEEAKALwt4CAADYCpLSAgABBACAENgKgtICAAEEAIAM2ApS0gIAAIAJBgLiEgABqQUxqQTg2AgALAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABB7AFLDQACQEEAKAKItICAACIGQRAgAEETakFwcSAAQQtJGyICQQN2IgR2IgNBA3FFDQAgA0EBcSAEckEBcyIFQQN0IgBBuLSAgABqKAIAIgRBCGohAwJA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AkADQCAGIgQoAgRBeHEgAEYNASACQR12IQYgAkEBdCECIAQgBkEEcWpBEGoiAygCACIGDQALIAMgATYCACABQRhqIAQ2AgAgASABNgIMIAEgATYCCAwBCyAEKAIIIgAgATYCDCAEIAE2AgggAUEYakEANgIAIAEgBDYCDCABIAA2AggLQQBBACgCqLSAgABBf2oiAUF/IAEbNgKotICAAAsLTgACQCAADQA/AEEQdA8LAkAgAEH//wNxDQAgAEF/TA0AAkAgAEEQdkAAIgBBf0cNAEEAQTA2Avi3gIAAQX8PCyAAQRB0DwsQv4CAgAAACwQAAAALC44sAQBBgAgLhiwBAAAAAgAAAAMAAAAEAAAABQAAAAYAAAAHAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEludmFsaWQgY2hhciBpbiB1cmwgcXVlcnkAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9ib2R5AENvbnRlbnQtTGVuZ3RoIG92ZXJmbG93AENodW5rIHNpemUgb3ZlcmZsb3cAUmVzcG9uc2Ugb3ZlcmZsb3cASW52YWxpZCBtZXRob2QgZm9yIEhUVFAveC54IHJlcXVlc3QASW52YWxpZCBtZXRob2QgZm9yIFJUU1AveC54IHJlcXVlc3QARXhwZWN0ZWQgU09VUkNFIG1ldGhvZCBmb3IgSUNFL3gueCByZXF1ZXN0AEludmFsaWQgY2hhciBpbiB1cmwgZnJhZ21lbnQgc3RhcnQARXhwZWN0ZWQgZG90AFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fc3RhdHVzAEludmFsaWQgcmVzcG9uc2Ugc3RhdHVzAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHBhcmFtZXRlcnMAVXNlciBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfaGVhZGVyYCBjYWxsYmFjayBlcnJvcgBgb25fbWVzc2FnZV9iZWdpbmAgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fbWVzc2FnZV9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAVW5leHBlY3RlZCBjaGFyIGluIHVybCBzZXJ2ZXIASW52YWxpZCBoZWFkZXIgdmFsdWUgY2hhcgBJbnZhbGlkIGhlYWRlciBmaWVsZCBjaGFyAEludmFsaWQgbWlub3IgdmVyc2lvbgBJbnZhbGlkIG1ham9yIHZlcnNpb24ARXhwZWN0ZWQgc3BhY2UgYWZ0ZXIgdmVyc2lvbgBFeHBlY3RlZCBDUkxGIGFmdGVyIHZlcnNpb24ASW52YWxpZCBoZWFkZXIgdG9rZW4AU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl91cmwASW52YWxpZCBjaGFyYWN0ZXJzIGluIHVybABVbmV4cGVjdGVkIHN0YXJ0IGNoYXIgaW4gdXJsAERvdWJsZSBAIGluIHVybABFbXB0eSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXJhY3RlciBpbiBDb250ZW50LUxlbmd0aABEdXBsaWNhdGUgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyIGluIHVybCBwYXRoAENvbnRlbnQtTGVuZ3RoIGNhbid0IGJlIHByZXNlbnQgd2l0aCBUcmFuc2Zlci1FbmNvZGluZwBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBzaXplAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25faGVhZGVyX3ZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgQ1IgYWZ0ZXIgaGVhZGVyIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgTEYgYWZ0ZXIgaGVhZGVyIHZhbHVlAEludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYCBoZWFkZXIgdmFsdWUAUGF1c2VkIGJ5IG9uX2hlYWRlcnNfY29tcGxldGUASW52YWxpZCBFT0Ygc3RhdGUAb25fY2h1bmtfaGVhZGVyIHBhdXNlAG9uX21lc3NhZ2VfYmVnaW4gcGF1c2UAb25fY2h1bmtfY29tcGxldGUgcGF1c2UAb25fbWVzc2FnZV9jb21wbGV0ZSBwYXVzZQBQYXVzZSBvbiBDT05ORUNUL1VwZ3JhZGUAUGF1c2Ugb24gUFJJL1VwZ3JhZGUARXhwZWN0ZWQgSFRUUC8yIENvbm5lY3Rpb24gUHJlZmFjZQBFeHBlY3RlZCBzcGFjZSBhZnRlciBtZXRob2QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfZmllbGQAUGF1c2VkAEludmFsaWQgd29yZCBlbmNvdW50ZXJlZABJbnZhbGlkIG1ldGhvZCBlbmNvdW50ZXJlZABVbmV4cGVjdGVkIGNoYXIgaW4gdXJsIHNjaGVtYQBSZXF1ZXN0IGhhcyBpbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AATUtBQ1RJVklUWQBDT1BZAE5PVElGWQBQTEFZAFBVVABDSEVDS09VVABQT1NUAFJFUE9SVABIUEVfSU5WQUxJRF9DT05TVEFOVABHRVQASFBFX1NUUklDVABSRURJUkVDVABDT05ORUNUAEhQRV9JTlZBTElEX1NUQVRVUwBPUFRJT05TAFNFVF9QQVJBTUVURVIAR0VUX1BBUkFNRVRFUgBIUEVfVVNFUgBIUEVfQ0JfQ0hVTktfSEVBREVSAE1LQ0FMRU5EQVIAU0VUVVAAVEVBUkRPV04ASFBFX0NMT1NFRF9DT05ORUNUSU9OAEhQRV9JTlZBTElEX1ZFUlNJT04ASFBFX0NCX01FU1NBR0VfQkVHSU4ASFBFX0lOVkFMSURfSEVBREVSX1RPS0VOAEhQRV9JTlZBTElEX1VSTABNS0NPTABBQ0wASFBFX0lOVEVSTkFMAEhQRV9PSwBVTkxJTksAVU5MT0NLAFBSSQBIUEVfSU5WQUxJRF9DT05URU5UX0xFTkdUSABIUEVfVU5FWFBFQ1RFRF9DT05URU5UX0xFTkdUSABGTFVTSABQUk9QUEFUQ0gATS1TRUFSQ0gASFBFX0lOVkFMSURfVFJBTlNGRVJfRU5DT0RJTkcARXhwZWN0ZWQgQ1JMRgBIUEVfSU5WQUxJRF9DSFVOS19TSVpFAE1PVkUASFBFX0NCX0hFQURFUlNfQ09NUExFVEUASFBFX0NCX0NIVU5LX0NPTVBMRVRFAEhQRV9DQl9NRVNTQUdFX0NPTVBMRVRFAERFTEVURQBIUEVfSU5WQUxJRF9FT0ZfU1RBVEUAUEFVU0UAUFVSR0UATUVSR0UASFBFX1BBVVNFRF9VUEdSQURFAEhQRV9QQVVTRURfSDJfVVBHUkFERQBTT1VSQ0UAQU5OT1VOQ0UAVFJBQ0UAREVTQ1JJQkUAVU5TVUJTQ1JJQkUAUkVDT1JEAEhQRV9JTlZBTElEX01FVEhPRABQUk9QRklORABVTkJJTkQAUkVCSU5EAEhQ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BQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAAAAAAAAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAAABAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAEAAAIAAAAAAAAAAAAAAAAAAAAAAAADBAAABAQEBAQEBAQEBAQFBAQEBAQEBAQEBAQEAAQABgcEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAAEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAACAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATk9VTkNFRUNLT1VUTkVDVEVURUNSSUJFTFVTSEVURUFEU0VBUkNIUkdFQ1RJVklUWUxFTkRBUlZFT1RJRllQVElPTlNDSFNFQVlTVEFUQ0hHRU9SRElSRUNUT1JUUkNIUEFSQU1FVEVSVVJDRUJTQ1JJQkVBUkRPV05BQ0VJTkROS0NLVUJTQ1JJQkVIVFRQL0FEVFAv";
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/client.js
var require_client = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/client.js"(exports, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var net = require("net");
    var util = require_util();
    var Request2 = require_undici_core_request();
    var DispatcherBase = require_dispatcher_base();
    var {
      RequestContentLengthMismatchError,
      ResponseContentLengthMismatchError,
      InvalidArgumentError: InvalidArgumentError2,
      RequestAbortedError,
      HeadersTimeoutError,
      HeadersOverflowError,
      SocketError,
      InformationalError,
      BodyTimeoutError,
      HTTPParserError
    } = require_errors();
    var buildConnector = require_connect();
    var {
      kUrl,
      kReset,
      kServerName,
      kClient,
      kBusy,
      kParser,
      kConnect,
      kBlocking,
      kResuming,
      kRunning,
      kPending,
      kSize,
      kWriting,
      kQueue,
      kConnected,
      kConnecting,
      kNeedDrain,
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
      kConnector,
      kMaxRedirections,
      kMaxRequests,
      kCounter,
      kClose,
      kDestroy,
      kDispatch,
      kInterceptors
    } = require_symbols();
    var kClosedResolve = Symbol("kClosedResolve");
    var channels = {};
    try {
      const diagnosticsChannel = require("diagnostics_channel");
      channels.sendHeaders = diagnosticsChannel.channel("undici:client:sendHeaders");
      channels.beforeConnect = diagnosticsChannel.channel("undici:client:beforeConnect");
      channels.connectError = diagnosticsChannel.channel("undici:client:connectError");
      channels.connected = diagnosticsChannel.channel("undici:client:connected");
    } catch {
      channels.sendHeaders = { hasSubscribers: false };
      channels.beforeConnect = { hasSubscribers: false };
      channels.connectError = { hasSubscribers: false };
      channels.connected = { hasSubscribers: false };
    }
    var Client = class extends DispatcherBase {
      constructor(url, {
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
        connect: connect2,
        maxRequestsPerClient
      } = {}) {
        super();
        if (keepAlive !== void 0) {
          throw new InvalidArgumentError2("unsupported keepAlive, use pipelining=0 instead");
        }
        if (socketTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported socketTimeout, use headersTimeout & bodyTimeout instead");
        }
        if (requestTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported requestTimeout, use headersTimeout & bodyTimeout instead");
        }
        if (idleTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported idleTimeout, use keepAliveTimeout instead");
        }
        if (maxKeepAliveTimeout !== void 0) {
          throw new InvalidArgumentError2("unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead");
        }
        if (maxHeaderSize != null && !Number.isFinite(maxHeaderSize)) {
          throw new InvalidArgumentError2("invalid maxHeaderSize");
        }
        if (socketPath != null && typeof socketPath !== "string") {
          throw new InvalidArgumentError2("invalid socketPath");
        }
        if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) {
          throw new InvalidArgumentError2("invalid connectTimeout");
        }
        if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) {
          throw new InvalidArgumentError2("invalid keepAliveTimeout");
        }
        if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) {
          throw new InvalidArgumentError2("invalid keepAliveMaxTimeout");
        }
        if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
          throw new InvalidArgumentError2("invalid keepAliveTimeoutThreshold");
        }
        if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
          throw new InvalidArgumentError2("headersTimeout must be a positive integer or zero");
        }
        if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
          throw new InvalidArgumentError2("bodyTimeout must be a positive integer or zero");
        }
        if (connect2 != null && typeof connect2 !== "function" && typeof connect2 !== "object") {
          throw new InvalidArgumentError2("connect must be a function or an object");
        }
        if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
          throw new InvalidArgumentError2("maxRedirections must be a positive number");
        }
        if (maxRequestsPerClient != null && (!Number.isInteger(maxRequestsPerClient) || maxRequestsPerClient < 0)) {
          throw new InvalidArgumentError2("maxRequestsPerClient must be a positive number");
        }
        if (typeof connect2 !== "function") {
          connect2 = buildConnector({
            ...tls,
            maxCachedSessions,
            socketPath,
            timeout: connectTimeout,
            ...connect2
          });
        }
        this[kInterceptors] = interceptors && interceptors.Client && Array.isArray(interceptors.Client) ? interceptors.Client : [createRedirectInterceptor({ maxRedirections })];
        this[kUrl] = util.parseOrigin(url);
        this[kConnector] = connect2;
        this[kSocket] = null;
        this[kPipelining] = pipelining != null ? pipelining : 1;
        this[kMaxHeadersSize] = maxHeaderSize || 16384;
        this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout;
        this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 6e5 : keepAliveMaxTimeout;
        this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 1e3 : keepAliveTimeoutThreshold;
        this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout];
        this[kServerName] = null;
        this[kResuming] = 0;
        this[kNeedDrain] = 0;
        this[kHostHeader] = `host: ${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ""}\r
`;
        this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 3e4;
        this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 3e4;
        this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength;
        this[kMaxRedirections] = maxRedirections;
        this[kMaxRequests] = maxRequestsPerClient;
        this[kClosedResolve] = null;
        this[kQueue] = [];
        this[kRunningIdx] = 0;
        this[kPendingIdx] = 0;
      }
      get pipelining() {
        return this[kPipelining];
      }
      set pipelining(value) {
        this[kPipelining] = value;
        resume(this, true);
      }
      get [kPending]() {
        return this[kQueue].length - this[kPendingIdx];
      }
      get [kRunning]() {
        return this[kPendingIdx] - this[kRunningIdx];
      }
      get [kSize]() {
        return this[kQueue].length - this[kRunningIdx];
      }
      get [kConnected]() {
        return !!this[kSocket] && !this[kConnecting] && !this[kSocket].destroyed;
      }
      get [kBusy]() {
        const socket = this[kSocket];
        return socket && (socket[kReset] || socket[kWriting] || socket[kBlocking]) || this[kSize] >= (this[kPipelining] || 1) || this[kPending] > 0;
      }
      [kConnect](cb) {
        connect(this);
        this.once("connect", cb);
      }
      [kDispatch](opts, handler) {
        const origin = opts.origin || this[kUrl].origin;
        const request = new Request2(origin, opts, handler);
        this[kQueue].push(request);
        if (this[kResuming]) {
        } else if (util.bodyLength(request.body) == null && util.isIterable(request.body)) {
          this[kResuming] = 1;
          define_process_default.nextTick(resume, this);
        } else {
          resume(this, true);
        }
        if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) {
          this[kNeedDrain] = 2;
        }
        return this[kNeedDrain] < 2;
      }
      async [kClose]() {
        return new Promise((resolve) => {
          if (!this[kSize]) {
            this.destroy(resolve);
          } else {
            this[kClosedResolve] = resolve;
          }
        });
      }
      async [kDestroy](err) {
        return new Promise((resolve) => {
          const requests = this[kQueue].splice(this[kPendingIdx]);
          for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            errorRequest(this, request, err);
          }
          const callback = /* @__PURE__ */ __name(() => {
            if (this[kClosedResolve]) {
              this[kClosedResolve]();
              this[kClosedResolve] = null;
            }
            resolve();
          }, "callback");
          if (!this[kSocket]) {
            queueMicrotask(callback);
          } else {
            util.destroy(this[kSocket].on("close", callback), err);
          }
          resume(this);
        });
      }
    };
    __name(Client, "Client");
    var constants = require_constants2();
    var createRedirectInterceptor = require_redirectInterceptor();
    var EMPTY_BUF = Buffer.alloc(0);
    async function lazyllhttp() {
      const llhttpWasmData = define_process_default.env.JEST_WORKER_ID ? require_llhttp_wasm() : void 0;
      let mod;
      try {
        mod = await WebAssembly.compile(Buffer.from(require_llhttp_simd_wasm(), "base64"));
      } catch (e) {
        mod = await WebAssembly.compile(Buffer.from(llhttpWasmData || require_llhttp_wasm(), "base64"));
      }
      return await WebAssembly.instantiate(mod, {
        env: {
          wasm_on_url: (p, at, len) => {
            return 0;
          },
          wasm_on_status: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onStatus(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_message_begin: (p) => {
            assert.strictEqual(currentParser.ptr, p);
            return currentParser.onMessageBegin() || 0;
          },
          wasm_on_header_field: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onHeaderField(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_header_value: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onHeaderValue(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
            assert.strictEqual(currentParser.ptr, p);
            return currentParser.onHeadersComplete(statusCode, Boolean(upgrade), Boolean(shouldKeepAlive)) || 0;
          },
          wasm_on_body: (p, at, len) => {
            assert.strictEqual(currentParser.ptr, p);
            const start = at - currentBufferPtr;
            const end = start + len;
            return currentParser.onBody(currentBufferRef.slice(start, end)) || 0;
          },
          wasm_on_message_complete: (p) => {
            assert.strictEqual(currentParser.ptr, p);
            return currentParser.onMessageComplete() || 0;
          }
        }
      });
    }
    __name(lazyllhttp, "lazyllhttp");
    var llhttpInstance = null;
    var llhttpPromise = lazyllhttp().catch(() => {
    });
    var currentParser = null;
    var currentBufferRef = null;
    var currentBufferSize = 0;
    var currentBufferPtr = null;
    var TIMEOUT_HEADERS = 1;
    var TIMEOUT_BODY = 2;
    var TIMEOUT_IDLE = 3;
    var Parser = class {
      constructor(client, socket, { exports: exports2 }) {
        assert(Number.isFinite(client[kMaxHeadersSize]) && client[kMaxHeadersSize] > 0);
        this.llhttp = exports2;
        this.ptr = this.llhttp.llhttp_alloc(constants.TYPE.RESPONSE);
        this.client = client;
        this.socket = socket;
        this.timeout = null;
        this.timeoutValue = null;
        this.timeoutType = null;
        this.statusCode = null;
        this.statusText = "";
        this.upgrade = false;
        this.headers = [];
        this.headersSize = 0;
        this.headersMaxSize = client[kMaxHeadersSize];
        this.shouldKeepAlive = false;
        this.paused = false;
        this.resume = this.resume.bind(this);
        this.bytesRead = 0;
        this.keepAlive = "";
        this.contentLength = "";
      }
      setTimeout(value, type) {
        this.timeoutType = type;
        if (value !== this.timeoutValue) {
          clearTimeout(this.timeout);
          if (value) {
            this.timeout = setTimeout(onParserTimeout, value, this);
            if (this.timeout.unref) {
              this.timeout.unref();
            }
          } else {
            this.timeout = null;
          }
          this.timeoutValue = value;
        } else if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
      }
      resume() {
        if (this.socket.destroyed || !this.paused) {
          return;
        }
        assert(this.ptr != null);
        assert(currentParser == null);
        this.llhttp.llhttp_resume(this.ptr);
        assert(this.timeoutType === TIMEOUT_BODY);
        if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        this.paused = false;
        this.execute(this.socket.read() || EMPTY_BUF);
        this.readMore();
      }
      readMore() {
        while (!this.paused && this.ptr) {
          const chunk = this.socket.read();
          if (chunk === null) {
            break;
          }
          this.execute(chunk);
        }
      }
      execute(data) {
        assert(this.ptr != null);
        assert(currentParser == null);
        assert(!this.paused);
        const { socket, llhttp } = this;
        if (data.length > currentBufferSize) {
          if (currentBufferPtr) {
            llhttp.free(currentBufferPtr);
          }
          currentBufferSize = Math.ceil(data.length / 4096) * 4096;
          currentBufferPtr = llhttp.malloc(currentBufferSize);
        }
        new Uint8Array(llhttp.memory.buffer, currentBufferPtr, currentBufferSize).set(data);
        try {
          let ret;
          try {
            currentBufferRef = data;
            currentParser = this;
            ret = llhttp.llhttp_execute(this.ptr, currentBufferPtr, data.length);
          } catch (err) {
            throw err;
          } finally {
            currentParser = null;
            currentBufferRef = null;
          }
          const offset = llhttp.llhttp_get_error_pos(this.ptr) - currentBufferPtr;
          if (ret === constants.ERROR.PAUSED_UPGRADE) {
            this.onUpgrade(data.slice(offset));
          } else if (ret === constants.ERROR.PAUSED) {
            this.paused = true;
            socket.unshift(data.slice(offset));
          } else if (ret !== constants.ERROR.OK) {
            const ptr = llhttp.llhttp_get_error_reason(this.ptr);
            let message = "";
            if (ptr) {
              const len = new Uint8Array(llhttp.memory.buffer, ptr).indexOf(0);
              message = Buffer.from(llhttp.memory.buffer, ptr, len).toString();
            }
            throw new HTTPParserError(message, constants.ERROR[ret], data.slice(offset));
          }
        } catch (err) {
          util.destroy(socket, err);
        }
      }
      finish() {
        try {
          try {
            currentParser = this;
          } finally {
            currentParser = null;
          }
        } catch (err) {
          util.destroy(this.socket, err);
        }
      }
      destroy() {
        assert(this.ptr != null);
        assert(currentParser == null);
        this.llhttp.llhttp_free(this.ptr);
        this.ptr = null;
        clearTimeout(this.timeout);
        this.timeout = null;
        this.timeoutValue = null;
        this.timeoutType = null;
        this.paused = false;
      }
      onStatus(buf) {
        this.statusText = buf.toString();
      }
      onMessageBegin() {
        const { socket, client } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        if (!request) {
          return -1;
        }
      }
      onHeaderField(buf) {
        const len = this.headers.length;
        if ((len & 1) === 0) {
          this.headers.push(buf);
        } else {
          this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
        }
        this.trackHeader(buf.length);
      }
      onHeaderValue(buf) {
        let len = this.headers.length;
        if ((len & 1) === 1) {
          this.headers.push(buf);
          len += 1;
        } else {
          this.headers[len - 1] = Buffer.concat([this.headers[len - 1], buf]);
        }
        const key = this.headers[len - 2];
        if (key.length === 10 && key.toString().toLowerCase() === "keep-alive") {
          this.keepAlive += buf.toString();
        } else if (key.length === 14 && key.toString().toLowerCase() === "content-length") {
          this.contentLength += buf.toString();
        }
        this.trackHeader(buf.length);
      }
      trackHeader(len) {
        this.headersSize += len;
        if (this.headersSize >= this.headersMaxSize) {
          util.destroy(this.socket, new HeadersOverflowError());
        }
      }
      onUpgrade(head) {
        const { upgrade, client, socket, headers, statusCode } = this;
        assert(upgrade);
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert(!socket.destroyed);
        assert(socket === client[kSocket]);
        assert(!this.paused);
        assert(request.upgrade || request.method === "CONNECT");
        this.statusCode = null;
        this.statusText = "";
        this.shouldKeepAlive = null;
        assert(this.headers.length % 2 === 0);
        this.headers = [];
        this.headersSize = 0;
        socket.unshift(head);
        socket[kParser].destroy();
        socket[kParser] = null;
        socket[kClient] = null;
        socket[kError] = null;
        socket.removeListener("error", onSocketError).removeListener("readable", onSocketReadable).removeListener("end", onSocketEnd).removeListener("close", onSocketClose);
        client[kSocket] = null;
        client[kQueue][client[kRunningIdx]++] = null;
        client.emit("disconnect", client[kUrl], [client], new InformationalError("upgrade"));
        try {
          request.onUpgrade(statusCode, headers, socket);
        } catch (err) {
          util.destroy(socket, err);
        }
        resume(client);
      }
      onHeadersComplete(statusCode, upgrade, shouldKeepAlive) {
        const { client, socket, headers, statusText } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        if (!request) {
          return -1;
        }
        assert(!this.upgrade);
        assert(this.statusCode < 200);
        if (statusCode === 100) {
          util.destroy(socket, new SocketError("bad response", util.getSocketInfo(socket)));
          return -1;
        }
        if (upgrade && !request.upgrade) {
          util.destroy(socket, new SocketError("bad upgrade", util.getSocketInfo(socket)));
          return -1;
        }
        assert.strictEqual(this.timeoutType, TIMEOUT_HEADERS);
        this.statusCode = statusCode;
        this.shouldKeepAlive = shouldKeepAlive;
        if (this.statusCode >= 200) {
          const bodyTimeout = request.bodyTimeout != null ? request.bodyTimeout : client[kBodyTimeout];
          this.setTimeout(bodyTimeout, TIMEOUT_BODY);
        } else if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        if (request.method === "CONNECT") {
          assert(client[kRunning] === 1);
          this.upgrade = true;
          return 2;
        }
        if (upgrade) {
          assert(client[kRunning] === 1);
          this.upgrade = true;
          return 2;
        }
        assert(this.headers.length % 2 === 0);
        this.headers = [];
        this.headersSize = 0;
        if (shouldKeepAlive && client[kPipelining]) {
          const keepAliveTimeout = this.keepAlive ? util.parseKeepAliveTimeout(this.keepAlive) : null;
          if (keepAliveTimeout != null) {
            const timeout = Math.min(
              keepAliveTimeout - client[kKeepAliveTimeoutThreshold],
              client[kKeepAliveMaxTimeout]
            );
            if (timeout <= 0) {
              socket[kReset] = true;
            } else {
              client[kKeepAliveTimeoutValue] = timeout;
            }
          } else {
            client[kKeepAliveTimeoutValue] = client[kKeepAliveDefaultTimeout];
          }
        } else {
          socket[kReset] = true;
        }
        let pause;
        try {
          pause = request.onHeaders(statusCode, headers, this.resume, statusText) === false;
        } catch (err) {
          util.destroy(socket, err);
          return -1;
        }
        if (request.method === "HEAD") {
          assert(socket[kReset]);
          return 1;
        }
        if (statusCode < 200) {
          return 1;
        }
        if (socket[kBlocking]) {
          socket[kBlocking] = false;
          resume(client);
        }
        return pause ? constants.ERROR.PAUSED : 0;
      }
      onBody(buf) {
        const { client, socket, statusCode } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert.strictEqual(this.timeoutType, TIMEOUT_BODY);
        if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        assert(statusCode >= 200);
        this.bytesRead += buf.length;
        try {
          if (request.onData(buf) === false) {
            return constants.ERROR.PAUSED;
          }
        } catch (err) {
          util.destroy(socket, err);
          return -1;
        }
      }
      onMessageComplete() {
        const { client, socket, statusCode, upgrade, headers, contentLength, bytesRead, shouldKeepAlive } = this;
        if (socket.destroyed && (!statusCode || shouldKeepAlive)) {
          return -1;
        }
        if (upgrade) {
          return;
        }
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert(statusCode >= 100);
        this.statusCode = null;
        this.statusText = "";
        this.bytesRead = 0;
        this.contentLength = "";
        this.keepAlive = "";
        assert(this.headers.length % 2 === 0);
        this.headers = [];
        this.headersSize = 0;
        if (statusCode < 200) {
          return;
        }
        if (request.method !== "HEAD" && contentLength && bytesRead !== parseInt(contentLength, 10)) {
          util.destroy(socket, new ResponseContentLengthMismatchError());
          return -1;
        }
        try {
          request.onComplete(headers);
        } catch (err) {
          errorRequest(client, request, err);
        }
        client[kQueue][client[kRunningIdx]++] = null;
        if (socket[kWriting]) {
          assert.strictEqual(client[kRunning], 0);
          util.destroy(socket, new InformationalError("reset"));
          return constants.ERROR.PAUSED;
        } else if (!shouldKeepAlive) {
          util.destroy(socket, new InformationalError("reset"));
          return constants.ERROR.PAUSED;
        } else if (socket[kReset] && client[kRunning] === 0) {
          util.destroy(socket, new InformationalError("reset"));
          return constants.ERROR.PAUSED;
        } else if (client[kPipelining] === 1) {
          setImmediate(resume, client);
        } else {
          resume(client);
        }
      }
    };
    __name(Parser, "Parser");
    function onParserTimeout(parser) {
      const { socket, timeoutType, client } = parser;
      if (timeoutType === TIMEOUT_HEADERS) {
        if (!socket[kWriting] || socket.writableNeedDrain || client[kRunning] > 1) {
          assert(!parser.paused, "cannot be paused while waiting for headers");
          util.destroy(socket, new HeadersTimeoutError());
        }
      } else if (timeoutType === TIMEOUT_BODY) {
        if (!parser.paused) {
          util.destroy(socket, new BodyTimeoutError());
        }
      } else if (timeoutType === TIMEOUT_IDLE) {
        assert(client[kRunning] === 0 && client[kKeepAliveTimeoutValue]);
        util.destroy(socket, new InformationalError("socket idle timeout"));
      }
    }
    __name(onParserTimeout, "onParserTimeout");
    function onSocketReadable() {
      const { [kParser]: parser } = this;
      parser.readMore();
    }
    __name(onSocketReadable, "onSocketReadable");
    function onSocketError(err) {
      const { [kParser]: parser } = this;
      assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
      if (err.code === "ECONNRESET" && parser.statusCode && !parser.shouldKeepAlive) {
        parser.finish();
        return;
      }
      this[kError] = err;
      onError(this[kClient], err);
    }
    __name(onSocketError, "onSocketError");
    function onError(client, err) {
      if (client[kRunning] === 0 && err.code !== "UND_ERR_INFO" && err.code !== "UND_ERR_SOCKET") {
        assert(client[kPendingIdx] === client[kRunningIdx]);
        const requests = client[kQueue].splice(client[kRunningIdx]);
        for (let i = 0; i < requests.length; i++) {
          const request = requests[i];
          errorRequest(client, request, err);
        }
        assert(client[kSize] === 0);
      }
    }
    __name(onError, "onError");
    function onSocketEnd() {
      const { [kParser]: parser } = this;
      if (parser.statusCode && !parser.shouldKeepAlive) {
        parser.finish();
        return;
      }
      util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
    }
    __name(onSocketEnd, "onSocketEnd");
    function onSocketClose() {
      const { [kClient]: client } = this;
      this[kParser].destroy();
      this[kParser] = null;
      const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
      client[kSocket] = null;
      if (client.destroyed) {
        assert(client[kPending] === 0);
        const requests = client[kQueue].splice(client[kRunningIdx]);
        for (let i = 0; i < requests.length; i++) {
          const request = requests[i];
          errorRequest(client, request, err);
        }
      } else if (client[kRunning] > 0 && err.code !== "UND_ERR_INFO") {
        const request = client[kQueue][client[kRunningIdx]];
        client[kQueue][client[kRunningIdx]++] = null;
        errorRequest(client, request, err);
      }
      client[kPendingIdx] = client[kRunningIdx];
      assert(client[kRunning] === 0);
      client.emit("disconnect", client[kUrl], [client], err);
      resume(client);
    }
    __name(onSocketClose, "onSocketClose");
    async function connect(client) {
      assert(!client[kConnecting]);
      assert(!client[kSocket]);
      let { host, hostname, protocol, port } = client[kUrl];
      if (hostname[0] === "[") {
        const idx = hostname.indexOf("]");
        assert(idx !== -1);
        const ip = hostname.substr(1, idx - 1);
        assert(net.isIP(ip));
        hostname = ip;
      }
      client[kConnecting] = true;
      if (channels.beforeConnect.hasSubscribers) {
        channels.beforeConnect.publish({
          connectParams: {
            host,
            hostname,
            protocol,
            port,
            servername: client[kServerName]
          },
          connector: client[kConnector]
        });
      }
      try {
        const socket = await new Promise((resolve, reject) => {
          client[kConnector]({
            host,
            hostname,
            protocol,
            port,
            servername: client[kServerName]
          }, (err, socket2) => {
            if (err) {
              reject(err);
            } else {
              resolve(socket2);
            }
          });
        });
        if (!llhttpInstance) {
          llhttpInstance = await llhttpPromise;
          llhttpPromise = null;
        }
        client[kConnecting] = false;
        assert(socket);
        client[kSocket] = socket;
        socket[kNoRef] = false;
        socket[kWriting] = false;
        socket[kReset] = false;
        socket[kBlocking] = false;
        socket[kError] = null;
        socket[kParser] = new Parser(client, socket, llhttpInstance);
        socket[kClient] = client;
        socket[kCounter] = 0;
        socket[kMaxRequests] = client[kMaxRequests];
        socket.on("error", onSocketError).on("readable", onSocketReadable).on("end", onSocketEnd).on("close", onSocketClose);
        if (channels.connected.hasSubscribers) {
          channels.connected.publish({
            connectParams: {
              host,
              hostname,
              protocol,
              port,
              servername: client[kServerName]
            },
            connector: client[kConnector],
            socket
          });
        }
        client.emit("connect", client[kUrl], [client]);
      } catch (err) {
        client[kConnecting] = false;
        if (channels.connectError.hasSubscribers) {
          channels.connectError.publish({
            connectParams: {
              host,
              hostname,
              protocol,
              port,
              servername: client[kServerName]
            },
            connector: client[kConnector],
            error: err
          });
        }
        if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
          assert(client[kRunning] === 0);
          while (client[kPending] > 0 && client[kQueue][client[kPendingIdx]].servername === client[kServerName]) {
            const request = client[kQueue][client[kPendingIdx]++];
            errorRequest(client, request, err);
          }
        } else {
          onError(client, err);
        }
        client.emit("connectionError", client[kUrl], [client], err);
      }
      resume(client);
    }
    __name(connect, "connect");
    function emitDrain(client) {
      client[kNeedDrain] = 0;
      client.emit("drain", client[kUrl], [client]);
    }
    __name(emitDrain, "emitDrain");
    function resume(client, sync) {
      if (client[kResuming] === 2) {
        return;
      }
      client[kResuming] = 2;
      _resume(client, sync);
      client[kResuming] = 0;
      if (client[kRunningIdx] > 256) {
        client[kQueue].splice(0, client[kRunningIdx]);
        client[kPendingIdx] -= client[kRunningIdx];
        client[kRunningIdx] = 0;
      }
    }
    __name(resume, "resume");
    function _resume(client, sync) {
      while (true) {
        if (client.destroyed) {
          assert(client[kPending] === 0);
          return;
        }
        if (client.closed && !client[kSize]) {
          client.destroy();
          return;
        }
        const socket = client[kSocket];
        if (socket) {
          if (client[kSize] === 0) {
            if (!socket[kNoRef] && socket.unref) {
              socket.unref();
              socket[kNoRef] = true;
            }
          } else if (socket[kNoRef] && socket.ref) {
            socket.ref();
            socket[kNoRef] = false;
          }
          if (client[kSize] === 0) {
            if (socket[kParser].timeoutType !== TIMEOUT_IDLE) {
              socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_IDLE);
            }
          } else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
            if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
              const request2 = client[kQueue][client[kRunningIdx]];
              const headersTimeout = request2.headersTimeout != null ? request2.headersTimeout : client[kHeadersTimeout];
              socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS);
            }
          }
        }
        if (client[kBusy]) {
          client[kNeedDrain] = 2;
        } else if (client[kNeedDrain] === 2) {
          if (sync) {
            client[kNeedDrain] = 1;
            define_process_default.nextTick(emitDrain, client);
          } else {
            emitDrain(client);
          }
          continue;
        }
        if (client[kPending] === 0) {
          return;
        }
        if (client[kRunning] >= (client[kPipelining] || 1)) {
          return;
        }
        const request = client[kQueue][client[kPendingIdx]];
        if (client[kUrl].protocol === "https:" && client[kServerName] !== request.servername) {
          if (client[kRunning] > 0) {
            return;
          }
          client[kServerName] = request.servername;
          if (socket && socket.servername !== request.servername) {
            util.destroy(socket, new InformationalError("servername changed"));
            return;
          }
        }
        if (client[kConnecting]) {
          return;
        }
        if (!socket) {
          connect(client);
          continue;
        }
        if (socket.destroyed || socket[kWriting] || socket[kReset] || socket[kBlocking]) {
          return;
        }
        if (client[kRunning] > 0 && !request.idempotent) {
          return;
        }
        if (client[kRunning] > 0 && (request.upgrade || request.method === "CONNECT")) {
          return;
        }
        if (util.isStream(request.body) && util.bodyLength(request.body) === 0) {
          request.body.on("data", function() {
            assert(false);
          }).on("error", function(err) {
            errorRequest(client, request, err);
          }).on("end", function() {
            util.destroy(this);
          });
          request.body = null;
        }
        if (client[kRunning] > 0 && (util.isStream(request.body) || util.isAsyncIterable(request.body))) {
          return;
        }
        if (!request.aborted && write(client, request)) {
          client[kPendingIdx]++;
        } else {
          client[kQueue].splice(client[kPendingIdx], 1);
        }
      }
    }
    __name(_resume, "_resume");
    function write(client, request) {
      const { body, method, path, host, upgrade, headers, blocking } = request;
      const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH";
      if (body && typeof body.read === "function") {
        body.read(0);
      }
      let contentLength = util.bodyLength(body);
      if (contentLength === null) {
        contentLength = request.contentLength;
      }
      if (contentLength === 0 && !expectsPayload) {
        contentLength = null;
      }
      if (request.contentLength !== null && request.contentLength !== contentLength) {
        if (client[kStrictContentLength]) {
          errorRequest(client, request, new RequestContentLengthMismatchError());
          return false;
        }
        define_process_default.emitWarning(new RequestContentLengthMismatchError());
      }
      const socket = client[kSocket];
      try {
        request.onConnect((err) => {
          if (request.aborted || request.completed) {
            return;
          }
          errorRequest(client, request, err || new RequestAbortedError());
          util.destroy(socket, new InformationalError("aborted"));
        });
      } catch (err) {
        errorRequest(client, request, err);
      }
      if (request.aborted) {
        return false;
      }
      if (method === "HEAD") {
        socket[kReset] = true;
      }
      if (upgrade || method === "CONNECT") {
        socket[kReset] = true;
      }
      if (client[kMaxRequests] && socket[kCounter]++ >= client[kMaxRequests]) {
        socket[kReset] = true;
      }
      if (blocking) {
        socket[kBlocking] = true;
      }
      let header = `${method} ${path} HTTP/1.1\r
`;
      if (typeof host === "string") {
        header += `host: ${host}\r
`;
      } else {
        header += client[kHostHeader];
      }
      if (upgrade) {
        header += `connection: upgrade\r
upgrade: ${upgrade}\r
`;
      } else if (client[kPipelining]) {
        header += "connection: keep-alive\r\n";
      } else {
        header += "connection: close\r\n";
      }
      if (headers) {
        header += headers;
      }
      if (channels.sendHeaders.hasSubscribers) {
        channels.sendHeaders.publish({ request, headers: header, socket });
      }
      if (!body) {
        if (contentLength === 0) {
          socket.write(`${header}content-length: 0\r
\r
`, "ascii");
        } else {
          assert(contentLength === null, "no body must not have content length");
          socket.write(`${header}\r
`, "ascii");
        }
        request.onRequestSent();
      } else if (util.isBuffer(body)) {
        assert(contentLength === body.byteLength, "buffer body must have content length");
        socket.cork();
        socket.write(`${header}content-length: ${contentLength}\r
\r
`, "ascii");
        socket.write(body);
        socket.uncork();
        request.onBodySent(body);
        request.onRequestSent();
        if (!expectsPayload) {
          socket[kReset] = true;
        }
      } else if (util.isBlobLike(body)) {
        if (typeof body.stream === "function") {
          writeIterable({ body: body.stream(), client, request, socket, contentLength, header, expectsPayload });
        } else {
          writeBlob({ body, client, request, socket, contentLength, header, expectsPayload });
        }
      } else if (util.isStream(body)) {
        writeStream({ body, client, request, socket, contentLength, header, expectsPayload });
      } else if (util.isIterable(body)) {
        writeIterable({ body, client, request, socket, contentLength, header, expectsPayload });
      } else {
        assert(false);
      }
      return true;
    }
    __name(write, "write");
    function writeStream({ body, client, request, socket, contentLength, header, expectsPayload }) {
      assert(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
      let finished = false;
      const writer = new AsyncWriter({ socket, request, contentLength, client, expectsPayload, header });
      const onData = /* @__PURE__ */ __name(function(chunk) {
        try {
          assert(!finished);
          if (!writer.write(chunk) && this.pause) {
            this.pause();
          }
        } catch (err) {
          util.destroy(this, err);
        }
      }, "onData");
      const onDrain = /* @__PURE__ */ __name(function() {
        assert(!finished);
        if (body.resume) {
          body.resume();
        }
      }, "onDrain");
      const onAbort = /* @__PURE__ */ __name(function() {
        onFinished(new RequestAbortedError());
      }, "onAbort");
      const onFinished = /* @__PURE__ */ __name(function(err) {
        if (finished) {
          return;
        }
        finished = true;
        assert(socket.destroyed || socket[kWriting] && client[kRunning] <= 1);
        socket.off("drain", onDrain).off("error", onFinished);
        body.removeListener("data", onData).removeListener("end", onFinished).removeListener("error", onFinished).removeListener("close", onAbort);
        if (!err) {
          try {
            writer.end();
          } catch (er) {
            err = er;
          }
        }
        writer.destroy(err);
        if (err && (err.code !== "UND_ERR_INFO" || err.message !== "reset")) {
          util.destroy(body, err);
        } else {
          util.destroy(body);
        }
      }, "onFinished");
      body.on("data", onData).on("end", onFinished).on("error", onFinished).on("close", onAbort);
      if (body.resume) {
        body.resume();
      }
      socket.on("drain", onDrain).on("error", onFinished);
    }
    __name(writeStream, "writeStream");
    async function writeBlob({ body, client, request, socket, contentLength, header, expectsPayload }) {
      assert(contentLength === body.size, "blob body must have content length");
      try {
        if (contentLength != null && contentLength !== body.size) {
          throw new RequestContentLengthMismatchError();
        }
        const buffer = Buffer.from(await body.arrayBuffer());
        socket.cork();
        socket.write(`${header}content-length: ${contentLength}\r
\r
`, "ascii");
        socket.write(buffer);
        socket.uncork();
        request.onBodySent(buffer);
        request.onRequestSent();
        if (!expectsPayload) {
          socket[kReset] = true;
        }
        resume(client);
      } catch (err) {
        util.destroy(socket, err);
      }
    }
    __name(writeBlob, "writeBlob");
    async function writeIterable({ body, client, request, socket, contentLength, header, expectsPayload }) {
      assert(contentLength !== 0 || client[kRunning] === 0, "iterator body cannot be pipelined");
      let callback = null;
      function onDrain() {
        if (callback) {
          const cb = callback;
          callback = null;
          cb();
        }
      }
      __name(onDrain, "onDrain");
      const waitForDrain = /* @__PURE__ */ __name(() => new Promise((resolve, reject) => {
        assert(callback === null);
        if (socket[kError]) {
          reject(socket[kError]);
        } else {
          callback = resolve;
        }
      }), "waitForDrain");
      socket.on("close", onDrain).on("drain", onDrain);
      const writer = new AsyncWriter({ socket, request, contentLength, client, expectsPayload, header });
      try {
        for await (const chunk of body) {
          if (socket[kError]) {
            throw socket[kError];
          }
          if (!writer.write(chunk)) {
            await waitForDrain();
          }
        }
        writer.end();
      } catch (err) {
        writer.destroy(err);
      } finally {
        socket.off("close", onDrain).off("drain", onDrain);
      }
    }
    __name(writeIterable, "writeIterable");
    var AsyncWriter = class {
      constructor({ socket, request, contentLength, client, expectsPayload, header }) {
        this.socket = socket;
        this.request = request;
        this.contentLength = contentLength;
        this.client = client;
        this.bytesWritten = 0;
        this.expectsPayload = expectsPayload;
        this.header = header;
        socket[kWriting] = true;
      }
      write(chunk) {
        const { socket, request, contentLength, client, bytesWritten, expectsPayload, header } = this;
        if (socket[kError]) {
          throw socket[kError];
        }
        if (socket.destroyed) {
          return false;
        }
        const len = Buffer.byteLength(chunk);
        if (!len) {
          return true;
        }
        if (contentLength !== null && bytesWritten + len > contentLength) {
          if (client[kStrictContentLength]) {
            throw new RequestContentLengthMismatchError();
          }
          define_process_default.emitWarning(new RequestContentLengthMismatchError());
        }
        if (bytesWritten === 0) {
          if (!expectsPayload) {
            socket[kReset] = true;
          }
          if (contentLength === null) {
            socket.write(`${header}transfer-encoding: chunked\r
`, "ascii");
          } else {
            socket.write(`${header}content-length: ${contentLength}\r
\r
`, "ascii");
          }
        }
        if (contentLength === null) {
          socket.write(`\r
${len.toString(16)}\r
`, "ascii");
        }
        this.bytesWritten += len;
        const ret = socket.write(chunk);
        request.onBodySent(chunk);
        if (!ret) {
          if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
            if (socket[kParser].timeout.refresh) {
              socket[kParser].timeout.refresh();
            }
          }
        }
        return ret;
      }
      end() {
        const { socket, contentLength, client, bytesWritten, expectsPayload, header, request } = this;
        request.onRequestSent();
        socket[kWriting] = false;
        if (socket[kError]) {
          throw socket[kError];
        }
        if (socket.destroyed) {
          return;
        }
        if (bytesWritten === 0) {
          if (expectsPayload) {
            socket.write(`${header}content-length: 0\r
\r
`, "ascii");
          } else {
            socket.write(`${header}\r
`, "ascii");
          }
        } else if (contentLength === null) {
          socket.write("\r\n0\r\n\r\n", "ascii");
        }
        if (contentLength !== null && bytesWritten !== contentLength) {
          if (client[kStrictContentLength]) {
            throw new RequestContentLengthMismatchError();
          } else {
            define_process_default.emitWarning(new RequestContentLengthMismatchError());
          }
        }
        if (socket[kParser].timeout && socket[kParser].timeoutType === TIMEOUT_HEADERS) {
          if (socket[kParser].timeout.refresh) {
            socket[kParser].timeout.refresh();
          }
        }
        resume(client);
      }
      destroy(err) {
        const { socket, client } = this;
        socket[kWriting] = false;
        if (err) {
          assert(client[kRunning] <= 1, "pipeline should only contain this request");
          util.destroy(socket, err);
        }
      }
    };
    __name(AsyncWriter, "AsyncWriter");
    function errorRequest(client, request, err) {
      try {
        request.onError(err);
        assert(request.aborted);
      } catch (err2) {
        client.emit("error", err2);
      }
    }
    __name(errorRequest, "errorRequest");
    module2.exports = Client;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/pool.js
var require_pool = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/pool.js"(exports, module2) {
    "use strict";
    init_define_process();
    var {
      PoolBase,
      kClients,
      kNeedDrain,
      kAddClient,
      kGetDispatcher
    } = require_pool_base();
    var Client = require_client();
    var {
      InvalidArgumentError: InvalidArgumentError2
    } = require_errors();
    var util = require_util();
    var { kUrl, kInterceptors } = require_symbols();
    var buildConnector = require_connect();
    var kOptions = Symbol("options");
    var kConnections = Symbol("connections");
    var kFactory = Symbol("factory");
    function defaultFactory(origin, opts) {
      return new Client(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var Pool = class extends PoolBase {
      constructor(origin, {
        connections,
        factory = defaultFactory,
        connect,
        connectTimeout,
        tls,
        maxCachedSessions,
        socketPath,
        ...options
      } = {}) {
        super();
        if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
          throw new InvalidArgumentError2("invalid connections");
        }
        if (typeof factory !== "function") {
          throw new InvalidArgumentError2("factory must be a function.");
        }
        if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
          throw new InvalidArgumentError2("connect must be a function or an object");
        }
        if (typeof connect !== "function") {
          connect = buildConnector({
            ...tls,
            maxCachedSessions,
            socketPath,
            timeout: connectTimeout == null ? 1e4 : connectTimeout,
            ...connect
          });
        }
        this[kInterceptors] = options.interceptors && options.interceptors.Pool && Array.isArray(options.interceptors.Pool) ? options.interceptors.Pool : [];
        this[kConnections] = connections || null;
        this[kUrl] = util.parseOrigin(origin);
        this[kOptions] = { ...util.deepClone(options), connect };
        this[kOptions].interceptors = options.interceptors ? { ...options.interceptors } : void 0;
        this[kFactory] = factory;
      }
      [kGetDispatcher]() {
        let dispatcher = this[kClients].find((dispatcher2) => !dispatcher2[kNeedDrain]);
        if (dispatcher) {
          return dispatcher;
        }
        if (!this[kConnections] || this[kClients].length < this[kConnections]) {
          dispatcher = this[kFactory](this[kUrl], this[kOptions]);
          this[kAddClient](dispatcher);
        }
        return dispatcher;
      }
    };
    __name(Pool, "Pool");
    module2.exports = Pool;
  }
});

// ../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/agent.js
var require_agent = __commonJS({
  "../../node_modules/.pnpm/undici@5.11.0/node_modules/undici/lib/agent.js"(exports, module2) {
    "use strict";
    init_define_process();
    var { InvalidArgumentError: InvalidArgumentError2 } = require_errors();
    var { kClients, kRunning, kClose, kDestroy, kDispatch, kInterceptors } = require_symbols();
    var DispatcherBase = require_dispatcher_base();
    var Pool = require_pool();
    var Client = require_client();
    var util = require_util();
    var createRedirectInterceptor = require_redirectInterceptor();
    var { WeakRef, FinalizationRegistry } = require_dispatcher_weakref()();
    var kOnConnect = Symbol("onConnect");
    var kOnDisconnect = Symbol("onDisconnect");
    var kOnConnectionError = Symbol("onConnectionError");
    var kMaxRedirections = Symbol("maxRedirections");
    var kOnDrain = Symbol("onDrain");
    var kFactory = Symbol("factory");
    var kFinalizer = Symbol("finalizer");
    var kOptions = Symbol("options");
    function defaultFactory(origin, opts) {
      return opts && opts.connections === 1 ? new Client(origin, opts) : new Pool(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var Agent2 = class extends DispatcherBase {
      constructor({ factory = defaultFactory, maxRedirections = 0, connect, ...options } = {}) {
        super();
        if (typeof factory !== "function") {
          throw new InvalidArgumentError2("factory must be a function.");
        }
        if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
          throw new InvalidArgumentError2("connect must be a function or an object");
        }
        if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
          throw new InvalidArgumentError2("maxRedirections must be a positive number");
        }
        if (connect && typeof connect !== "function") {
          connect = { ...connect };
        }
        this[kInterceptors] = options.interceptors && options.interceptors.Agent && Array.isArray(options.interceptors.Agent) ? options.interceptors.Agent : [createRedirectInterceptor({ maxRedirections })];
        this[kOptions] = { ...util.deepClone(options), connect };
        this[kOptions].interceptors = options.interceptors ? { ...options.interceptors } : void 0;
        this[kMaxRedirections] = maxRedirections;
        this[kFactory] = factory;
        this[kClients] = /* @__PURE__ */ new Map();
        this[kFinalizer] = new FinalizationRegistry((key) => {
          const ref = this[kClients].get(key);
          if (ref !== void 0 && ref.deref() === void 0) {
            this[kClients].delete(key);
          }
        });
        const agent = this;
        this[kOnDrain] = (origin, targets) => {
          agent.emit("drain", origin, [agent, ...targets]);
        };
        this[kOnConnect] = (origin, targets) => {
          agent.emit("connect", origin, [agent, ...targets]);
        };
        this[kOnDisconnect] = (origin, targets, err) => {
          agent.emit("disconnect", origin, [agent, ...targets], err);
        };
        this[kOnConnectionError] = (origin, targets, err) => {
          agent.emit("connectionError", origin, [agent, ...targets], err);
        };
      }
      get [kRunning]() {
        let ret = 0;
        for (const ref of this[kClients].values()) {
          const client = ref.deref();
          if (client) {
            ret += client[kRunning];
          }
        }
        return ret;
      }
      [kDispatch](opts, handler) {
        let key;
        if (opts.origin && (typeof opts.origin === "string" || opts.origin instanceof URL)) {
          key = String(opts.origin);
        } else {
          throw new InvalidArgumentError2("opts.origin must be a non-empty string or URL.");
        }
        const ref = this[kClients].get(key);
        let dispatcher = ref ? ref.deref() : null;
        if (!dispatcher) {
          dispatcher = this[kFactory](opts.origin, this[kOptions]).on("drain", this[kOnDrain]).on("connect", this[kOnConnect]).on("disconnect", this[kOnDisconnect]).on("connectionError", this[kOnConnectionError]);
          this[kClients].set(key, new WeakRef(dispatcher));
          this[kFinalizer].register(dispatcher, key);
        }
        return dispatcher.dispatch(opts, handler);
      }
      async [kClose]() {
        const closePromises = [];
        for (const ref of this[kClients].values()) {
          const client = ref.deref();
          if (client) {
            closePromises.push(client.close());
          }
        }
        await Promise.all(closePromises);
      }
      async [kDestroy](err) {
        const destroyPromises = [];
        for (const ref of this[kClients].values()) {
          const client = ref.deref();
          if (client) {
            destroyPromises.push(client.destroy(err));
          }
        }
        await Promise.all(destroyPromises);
      }
    };
    __name(Agent2, "Agent");
    module2.exports = Agent2;
  }
});

// src/primitives/fetch.js
var fetch_exports = {};
__export(fetch_exports, {
  File: () => import_file.File,
  FormData: () => import_formdata.FormData,
  Headers: () => Headers2,
  Request: () => import_request.Request,
  Response: () => Response2,
  fetch: () => fetch,
  getGlobalDispatcher: () => getGlobalDispatcher,
  setGlobalDispatcher: () => setGlobalDispatcher
});
module.exports = __toCommonJS(fetch_exports);
init_define_process();
var import_abort_controller = require("./abort-controller");
var import_abort_controller2 = require("./abort-controller");
var CoreSymbols = __toESM(require_symbols());
var FetchSymbols = __toESM(require_symbols2());
var HeadersModule = __toESM(require_headers());
var ResponseModule = __toESM(require_response());
var UtilModule = __toESM(require_util2());
var WebIDLModule = __toESM(require_webidl());
var import_fetch = __toESM(require_fetch());
var import_agent = __toESM(require_agent());
var import_formdata = __toESM(require_formdata());
var import_request = __toESM(require_request());
var import_file = __toESM(require_file());
global.AbortController = import_abort_controller.AbortController;
global.AbortSignal = import_abort_controller2.AbortSignal;
define_process_default.nextTick = setImmediate;
var SCookies = Symbol("set-cookie");
var __append = HeadersModule.HeadersList.prototype.append;
HeadersModule.HeadersList.prototype.append = function(name, value) {
  const result = __append.call(this, name, value);
  if (!this[SCookies]) {
    Object.defineProperty(this, SCookies, {
      configurable: false,
      enumerable: false,
      writable: true,
      value: []
    });
  }
  const _name = normalizeAndValidateHeaderValue(name, "Header.append");
  if (_name === "set-cookie") {
    this[SCookies].push(normalizeAndValidateHeaderValue(value, "Header.append"));
  }
  return result;
};
var __set = HeadersModule.HeadersList.prototype.set;
HeadersModule.HeadersList.prototype.set = function(name, value) {
  const result = __set.call(this, name, value);
  if (!this[SCookies]) {
    Object.defineProperty(this, SCookies, {
      configurable: false,
      enumerable: false,
      writable: true,
      value: []
    });
  }
  const _name = normalizeAndValidateHeaderName(name);
  if (_name === "set-cookie") {
    this[SCookies] = [normalizeAndValidateHeaderValue(value, "HeadersList.set")];
  }
  return result;
};
var __delete = HeadersModule.HeadersList.prototype.delete;
HeadersModule.HeadersList.prototype.delete = function(name) {
  __delete.call(this, name);
  if (!this[SCookies]) {
    Object.defineProperty(this, SCookies, {
      configurable: false,
      enumerable: false,
      writable: true,
      value: []
    });
  }
  const _name = normalizeAndValidateHeaderName(name, "Headers.delete");
  if (_name === "set-cookie") {
    this[SCookies] = [];
  }
};
HeadersModule.Headers.prototype.getAll = function(name) {
  const _name = normalizeAndValidateHeaderName(name, "Headers.getAll");
  if (_name !== "set-cookie") {
    throw new Error(`getAll can only be used with 'set-cookie'`);
  }
  return this[CoreSymbols.kHeadersList][SCookies] || [];
};
var __error = ResponseModule.Response.error;
ResponseModule.Response.error = function(...args) {
  const response = __error.call(this, ...args);
  response[FetchSymbols.kHeaders][FetchSymbols.kGuard] = "response";
  return response;
};
function normalizeAndValidateHeaderName(potentialName, errorPrefix) {
  const normalizedName = potentialName.toLowerCase();
  if (UtilModule.isValidHeaderName(normalizedName)) {
    return normalizedName;
  }
  WebIDLModule.errors.invalidArgument({
    prefix: errorPrefix,
    value: normalizedName,
    type: "header name"
  });
}
__name(normalizeAndValidateHeaderName, "normalizeAndValidateHeaderName");
function normalizeAndValidateHeaderValue(potentialValue, errorPrefix) {
  const normalizedValue = potentialValue.replace(/^[\r\n\t ]+|[\r\n\t ]+$/g, "");
  if (UtilModule.isValidHeaderValue(normalizedValue)) {
    return normalizedValue;
  }
  WebIDLModule.errors.invalidArgument({
    prefix: errorPrefix,
    value: normalizedValue,
    type: "header value"
  });
}
__name(normalizeAndValidateHeaderValue, "normalizeAndValidateHeaderValue");
var globalDispatcher = new import_agent.default();
function getGlobalDispatcher() {
  return globalDispatcher;
}
__name(getGlobalDispatcher, "getGlobalDispatcher");
function setGlobalDispatcher(agent) {
  if (!agent || typeof agent.dispatch !== "function") {
    throw new InvalidArgumentError("Argument agent must implement Agent");
  }
  globalDispatcher = agent;
}
__name(setGlobalDispatcher, "setGlobalDispatcher");
async function fetch() {
  const res = await import_fetch.fetch.apply(getGlobalDispatcher(), arguments);
  const response = new Response2(res.body, res);
  Object.defineProperty(response, "url", { value: res.url });
  return response;
}
__name(fetch, "fetch");
var Headers2 = HeadersModule.Headers;
var Response2 = ResponseModule.Response;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  File,
  FormData,
  Headers,
  Request,
  Response,
  fetch,
  getGlobalDispatcher,
  setGlobalDispatcher
});
