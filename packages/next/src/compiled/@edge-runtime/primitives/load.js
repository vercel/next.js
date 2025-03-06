"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateIn = (member, obj) => {
  if (Object(obj) !== obj)
    throw TypeError('Cannot use the "in" operator on this value');
  return member.has(obj);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// <define:process>
var define_process_default;
var init_define_process = __esm({
  "<define:process>"() {
    define_process_default = { version: "v18.20.5", env: {}, versions: { node: " 18.20.5" } };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/symbols.js
var require_symbols = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/symbols.js"(exports2, module2) {
    "use strict";
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
      kKeepAliveDefaultTimeout: Symbol("default keep alive timeout"),
      kKeepAliveMaxTimeout: Symbol("max keep alive timeout"),
      kKeepAliveTimeoutThreshold: Symbol("keep alive timeout threshold"),
      kKeepAliveTimeoutValue: Symbol("keep alive timeout"),
      kKeepAlive: Symbol("keep alive"),
      kHeadersTimeout: Symbol("headers timeout"),
      kBodyTimeout: Symbol("body timeout"),
      kServerName: Symbol("server name"),
      kLocalAddress: Symbol("local address"),
      kHost: Symbol("host"),
      kNoRef: Symbol("no ref"),
      kBodyUsed: Symbol("used"),
      kBody: Symbol("abstracted request body"),
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
      kDestroyed: Symbol.for("nodejs.stream.destroyed"),
      kResume: Symbol("resume"),
      kOnError: Symbol("on error"),
      kMaxHeadersSize: Symbol("max headers size"),
      kRunningIdx: Symbol("running index"),
      kPendingIdx: Symbol("pending index"),
      kError: Symbol("error"),
      kClients: Symbol("clients"),
      kClient: Symbol("client"),
      kParser: Symbol("parser"),
      kOnDestroyed: Symbol("destroy callbacks"),
      kPipelining: Symbol("pipelining"),
      kSocket: Symbol("socket"),
      kHostHeader: Symbol("host header"),
      kConnector: Symbol("connector"),
      kStrictContentLength: Symbol("strict content length"),
      kMaxRedirections: Symbol("maxRedirections"),
      kMaxRequests: Symbol("maxRequestsPerClient"),
      kProxy: Symbol("proxy agent options"),
      kCounter: Symbol("socket request counter"),
      kInterceptors: Symbol("dispatch interceptors"),
      kMaxResponseSize: Symbol("max response size"),
      kHTTP2Session: Symbol("http2Session"),
      kHTTP2SessionState: Symbol("http2Session state"),
      kRetryHandlerDefaultRetry: Symbol("retry agent default retry"),
      kConstruct: Symbol("constructable"),
      kListeners: Symbol("listeners"),
      kHTTPContext: Symbol("http context"),
      kMaxConcurrentStreams: Symbol("max concurrent streams"),
      kNoProxyAgent: Symbol("no proxy agent"),
      kHttpProxyAgent: Symbol("http proxy agent"),
      kHttpsProxyAgent: Symbol("https proxy agent")
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/errors.js
var require_errors = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/errors.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var _UndiciError = class _UndiciError extends Error {
      constructor(message) {
        super(message);
        this.name = "UndiciError";
        this.code = "UND_ERR";
      }
    };
    __name(_UndiciError, "UndiciError");
    var UndiciError = _UndiciError;
    var _ConnectTimeoutError = class _ConnectTimeoutError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "ConnectTimeoutError";
        this.message = message || "Connect Timeout Error";
        this.code = "UND_ERR_CONNECT_TIMEOUT";
      }
    };
    __name(_ConnectTimeoutError, "ConnectTimeoutError");
    var ConnectTimeoutError = _ConnectTimeoutError;
    var _HeadersTimeoutError = class _HeadersTimeoutError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "HeadersTimeoutError";
        this.message = message || "Headers Timeout Error";
        this.code = "UND_ERR_HEADERS_TIMEOUT";
      }
    };
    __name(_HeadersTimeoutError, "HeadersTimeoutError");
    var HeadersTimeoutError = _HeadersTimeoutError;
    var _HeadersOverflowError = class _HeadersOverflowError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "HeadersOverflowError";
        this.message = message || "Headers Overflow Error";
        this.code = "UND_ERR_HEADERS_OVERFLOW";
      }
    };
    __name(_HeadersOverflowError, "HeadersOverflowError");
    var HeadersOverflowError = _HeadersOverflowError;
    var _BodyTimeoutError = class _BodyTimeoutError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "BodyTimeoutError";
        this.message = message || "Body Timeout Error";
        this.code = "UND_ERR_BODY_TIMEOUT";
      }
    };
    __name(_BodyTimeoutError, "BodyTimeoutError");
    var BodyTimeoutError = _BodyTimeoutError;
    var _ResponseStatusCodeError = class _ResponseStatusCodeError extends UndiciError {
      constructor(message, statusCode, headers, body) {
        super(message);
        this.name = "ResponseStatusCodeError";
        this.message = message || "Response Status Code Error";
        this.code = "UND_ERR_RESPONSE_STATUS_CODE";
        this.body = body;
        this.status = statusCode;
        this.statusCode = statusCode;
        this.headers = headers;
      }
    };
    __name(_ResponseStatusCodeError, "ResponseStatusCodeError");
    var ResponseStatusCodeError = _ResponseStatusCodeError;
    var _InvalidArgumentError = class _InvalidArgumentError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "InvalidArgumentError";
        this.message = message || "Invalid Argument Error";
        this.code = "UND_ERR_INVALID_ARG";
      }
    };
    __name(_InvalidArgumentError, "InvalidArgumentError");
    var InvalidArgumentError = _InvalidArgumentError;
    var _InvalidReturnValueError = class _InvalidReturnValueError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "InvalidReturnValueError";
        this.message = message || "Invalid Return Value Error";
        this.code = "UND_ERR_INVALID_RETURN_VALUE";
      }
    };
    __name(_InvalidReturnValueError, "InvalidReturnValueError");
    var InvalidReturnValueError = _InvalidReturnValueError;
    var _AbortError = class _AbortError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "AbortError";
        this.message = message || "The operation was aborted";
      }
    };
    __name(_AbortError, "AbortError");
    var AbortError = _AbortError;
    var _RequestAbortedError = class _RequestAbortedError extends AbortError {
      constructor(message) {
        super(message);
        this.name = "AbortError";
        this.message = message || "Request aborted";
        this.code = "UND_ERR_ABORTED";
      }
    };
    __name(_RequestAbortedError, "RequestAbortedError");
    var RequestAbortedError = _RequestAbortedError;
    var _InformationalError = class _InformationalError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "InformationalError";
        this.message = message || "Request information";
        this.code = "UND_ERR_INFO";
      }
    };
    __name(_InformationalError, "InformationalError");
    var InformationalError = _InformationalError;
    var _RequestContentLengthMismatchError = class _RequestContentLengthMismatchError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "RequestContentLengthMismatchError";
        this.message = message || "Request body length does not match content-length header";
        this.code = "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH";
      }
    };
    __name(_RequestContentLengthMismatchError, "RequestContentLengthMismatchError");
    var RequestContentLengthMismatchError = _RequestContentLengthMismatchError;
    var _ResponseContentLengthMismatchError = class _ResponseContentLengthMismatchError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "ResponseContentLengthMismatchError";
        this.message = message || "Response body length does not match content-length header";
        this.code = "UND_ERR_RES_CONTENT_LENGTH_MISMATCH";
      }
    };
    __name(_ResponseContentLengthMismatchError, "ResponseContentLengthMismatchError");
    var ResponseContentLengthMismatchError = _ResponseContentLengthMismatchError;
    var _ClientDestroyedError = class _ClientDestroyedError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "ClientDestroyedError";
        this.message = message || "The client is destroyed";
        this.code = "UND_ERR_DESTROYED";
      }
    };
    __name(_ClientDestroyedError, "ClientDestroyedError");
    var ClientDestroyedError = _ClientDestroyedError;
    var _ClientClosedError = class _ClientClosedError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "ClientClosedError";
        this.message = message || "The client is closed";
        this.code = "UND_ERR_CLOSED";
      }
    };
    __name(_ClientClosedError, "ClientClosedError");
    var ClientClosedError = _ClientClosedError;
    var _SocketError = class _SocketError extends UndiciError {
      constructor(message, socket) {
        super(message);
        this.name = "SocketError";
        this.message = message || "Socket error";
        this.code = "UND_ERR_SOCKET";
        this.socket = socket;
      }
    };
    __name(_SocketError, "SocketError");
    var SocketError = _SocketError;
    var _NotSupportedError = class _NotSupportedError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "NotSupportedError";
        this.message = message || "Not supported error";
        this.code = "UND_ERR_NOT_SUPPORTED";
      }
    };
    __name(_NotSupportedError, "NotSupportedError");
    var NotSupportedError = _NotSupportedError;
    var _BalancedPoolMissingUpstreamError = class _BalancedPoolMissingUpstreamError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "MissingUpstreamError";
        this.message = message || "No upstream has been added to the BalancedPool";
        this.code = "UND_ERR_BPL_MISSING_UPSTREAM";
      }
    };
    __name(_BalancedPoolMissingUpstreamError, "BalancedPoolMissingUpstreamError");
    var BalancedPoolMissingUpstreamError = _BalancedPoolMissingUpstreamError;
    var _HTTPParserError = class _HTTPParserError extends Error {
      constructor(message, code, data) {
        super(message);
        this.name = "HTTPParserError";
        this.code = code ? `HPE_${code}` : void 0;
        this.data = data ? data.toString() : void 0;
      }
    };
    __name(_HTTPParserError, "HTTPParserError");
    var HTTPParserError = _HTTPParserError;
    var _ResponseExceededMaxSizeError = class _ResponseExceededMaxSizeError extends UndiciError {
      constructor(message) {
        super(message);
        this.name = "ResponseExceededMaxSizeError";
        this.message = message || "Response content exceeded max size";
        this.code = "UND_ERR_RES_EXCEEDED_MAX_SIZE";
      }
    };
    __name(_ResponseExceededMaxSizeError, "ResponseExceededMaxSizeError");
    var ResponseExceededMaxSizeError = _ResponseExceededMaxSizeError;
    var _RequestRetryError = class _RequestRetryError extends UndiciError {
      constructor(message, code, { headers, data }) {
        super(message);
        this.name = "RequestRetryError";
        this.message = message || "Request retry error";
        this.code = "UND_ERR_REQ_RETRY";
        this.statusCode = code;
        this.data = data;
        this.headers = headers;
      }
    };
    __name(_RequestRetryError, "RequestRetryError");
    var RequestRetryError = _RequestRetryError;
    var _ResponseError = class _ResponseError extends UndiciError {
      constructor(message, code, { headers, data }) {
        super(message);
        this.name = "ResponseError";
        this.message = message || "Response error";
        this.code = "UND_ERR_RESPONSE";
        this.statusCode = code;
        this.data = data;
        this.headers = headers;
      }
    };
    __name(_ResponseError, "ResponseError");
    var ResponseError = _ResponseError;
    var _SecureProxyConnectionError = class _SecureProxyConnectionError extends UndiciError {
      constructor(cause, message, options) {
        super(message, { cause, ...options ?? {} });
        this.name = "SecureProxyConnectionError";
        this.message = message || "Secure Proxy Connection failed";
        this.code = "UND_ERR_PRX_TLS";
        this.cause = cause;
      }
    };
    __name(_SecureProxyConnectionError, "SecureProxyConnectionError");
    var SecureProxyConnectionError = _SecureProxyConnectionError;
    module2.exports = {
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
      SecureProxyConnectionError
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/constants.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var headerNameLowerCasedRecord = {};
    var wellknownHeaderNames = [
      "Accept",
      "Accept-Encoding",
      "Accept-Language",
      "Accept-Ranges",
      "Access-Control-Allow-Credentials",
      "Access-Control-Allow-Headers",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Origin",
      "Access-Control-Expose-Headers",
      "Access-Control-Max-Age",
      "Access-Control-Request-Headers",
      "Access-Control-Request-Method",
      "Age",
      "Allow",
      "Alt-Svc",
      "Alt-Used",
      "Authorization",
      "Cache-Control",
      "Clear-Site-Data",
      "Connection",
      "Content-Disposition",
      "Content-Encoding",
      "Content-Language",
      "Content-Length",
      "Content-Location",
      "Content-Range",
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only",
      "Content-Type",
      "Cookie",
      "Cross-Origin-Embedder-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
      "Date",
      "Device-Memory",
      "Downlink",
      "ECT",
      "ETag",
      "Expect",
      "Expect-CT",
      "Expires",
      "Forwarded",
      "From",
      "Host",
      "If-Match",
      "If-Modified-Since",
      "If-None-Match",
      "If-Range",
      "If-Unmodified-Since",
      "Keep-Alive",
      "Last-Modified",
      "Link",
      "Location",
      "Max-Forwards",
      "Origin",
      "Permissions-Policy",
      "Pragma",
      "Proxy-Authenticate",
      "Proxy-Authorization",
      "RTT",
      "Range",
      "Referer",
      "Referrer-Policy",
      "Refresh",
      "Retry-After",
      "Sec-WebSocket-Accept",
      "Sec-WebSocket-Extensions",
      "Sec-WebSocket-Key",
      "Sec-WebSocket-Protocol",
      "Sec-WebSocket-Version",
      "Server",
      "Server-Timing",
      "Service-Worker-Allowed",
      "Service-Worker-Navigation-Preload",
      "Set-Cookie",
      "SourceMap",
      "Strict-Transport-Security",
      "Supports-Loading-Mode",
      "TE",
      "Timing-Allow-Origin",
      "Trailer",
      "Transfer-Encoding",
      "Upgrade",
      "Upgrade-Insecure-Requests",
      "User-Agent",
      "Vary",
      "Via",
      "WWW-Authenticate",
      "X-Content-Type-Options",
      "X-DNS-Prefetch-Control",
      "X-Frame-Options",
      "X-Permitted-Cross-Domain-Policies",
      "X-Powered-By",
      "X-Requested-With",
      "X-XSS-Protection"
    ];
    for (let i = 0; i < wellknownHeaderNames.length; ++i) {
      const key = wellknownHeaderNames[i];
      const lowerCasedKey = key.toLowerCase();
      headerNameLowerCasedRecord[key] = headerNameLowerCasedRecord[lowerCasedKey] = lowerCasedKey;
    }
    Object.setPrototypeOf(headerNameLowerCasedRecord, null);
    module2.exports = {
      wellknownHeaderNames,
      headerNameLowerCasedRecord
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/tree.js
var require_tree = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/tree.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      wellknownHeaderNames,
      headerNameLowerCasedRecord
    } = require_constants();
    var _TstNode = class _TstNode {
      /** @type {any} */
      value = null;
      /** @type {null | TstNode} */
      left = null;
      /** @type {null | TstNode} */
      middle = null;
      /** @type {null | TstNode} */
      right = null;
      /** @type {number} */
      code;
      /**
       * @param {string} key
       * @param {any} value
       * @param {number} index
       */
      constructor(key, value, index) {
        if (index === void 0 || index >= key.length) {
          throw new TypeError("Unreachable");
        }
        const code = this.code = key.charCodeAt(index);
        if (code > 127) {
          throw new TypeError("key must be ascii string");
        }
        if (key.length !== ++index) {
          this.middle = new _TstNode(key, value, index);
        } else {
          this.value = value;
        }
      }
      /**
       * @param {string} key
       * @param {any} value
       */
      add(key, value) {
        const length = key.length;
        if (length === 0) {
          throw new TypeError("Unreachable");
        }
        let index = 0;
        let node = this;
        while (true) {
          const code = key.charCodeAt(index);
          if (code > 127) {
            throw new TypeError("key must be ascii string");
          }
          if (node.code === code) {
            if (length === ++index) {
              node.value = value;
              break;
            } else if (node.middle !== null) {
              node = node.middle;
            } else {
              node.middle = new _TstNode(key, value, index);
              break;
            }
          } else if (node.code < code) {
            if (node.left !== null) {
              node = node.left;
            } else {
              node.left = new _TstNode(key, value, index);
              break;
            }
          } else if (node.right !== null) {
            node = node.right;
          } else {
            node.right = new _TstNode(key, value, index);
            break;
          }
        }
      }
      /**
       * @param {Uint8Array} key
       * @return {TstNode | null}
       */
      search(key) {
        const keylength = key.length;
        let index = 0;
        let node = this;
        while (node !== null && index < keylength) {
          let code = key[index];
          if (code <= 90 && code >= 65) {
            code |= 32;
          }
          while (node !== null) {
            if (code === node.code) {
              if (keylength === ++index) {
                return node;
              }
              node = node.middle;
              break;
            }
            node = node.code < code ? node.left : node.right;
          }
        }
        return null;
      }
    };
    __name(_TstNode, "TstNode");
    var TstNode = _TstNode;
    var _TernarySearchTree = class _TernarySearchTree {
      /** @type {TstNode | null} */
      node = null;
      /**
       * @param {string} key
       * @param {any} value
       * */
      insert(key, value) {
        if (this.node === null) {
          this.node = new TstNode(key, value, 0);
        } else {
          this.node.add(key, value);
        }
      }
      /**
       * @param {Uint8Array} key
       * @return {any}
       */
      lookup(key) {
        return this.node?.search(key)?.value ?? null;
      }
    };
    __name(_TernarySearchTree, "TernarySearchTree");
    var TernarySearchTree = _TernarySearchTree;
    var tree = new TernarySearchTree();
    for (let i = 0; i < wellknownHeaderNames.length; ++i) {
      const key = headerNameLowerCasedRecord[wellknownHeaderNames[i]];
      tree.insert(key, key);
    }
    module2.exports = {
      TernarySearchTree,
      tree
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/util.js
var require_util = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { kDestroyed, kBodyUsed, kListeners, kBody } = require_symbols();
    var { IncomingMessage } = require("http");
    var stream = require("stream");
    var net = require("net");
    var { Blob: Blob3 } = require("buffer");
    var nodeUtil = require("util");
    var { stringify } = require("querystring");
    var { EventEmitter: EE } = require("events");
    var { InvalidArgumentError } = require_errors();
    var { headerNameLowerCasedRecord } = require_constants();
    var { tree } = require_tree();
    var [nodeMajor, nodeMinor] = define_process_default.versions.node.split(".").map((v) => Number(v));
    var _BodyAsyncIterable = class _BodyAsyncIterable {
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
    __name(_BodyAsyncIterable, "BodyAsyncIterable");
    var BodyAsyncIterable = _BodyAsyncIterable;
    function wrapRequestBody(body) {
      if (isStream(body)) {
        if (bodyLength(body) === 0) {
          body.on("data", function() {
            assert(false);
          });
        }
        if (typeof body.readableDidRead !== "boolean") {
          body[kBodyUsed] = false;
          EE.prototype.on.call(body, "data", function() {
            this[kBodyUsed] = true;
          });
        }
        return body;
      } else if (body && typeof body.pipeTo === "function") {
        return new BodyAsyncIterable(body);
      } else if (body && typeof body !== "string" && !ArrayBuffer.isView(body) && isIterable(body)) {
        return new BodyAsyncIterable(body);
      } else {
        return body;
      }
    }
    __name(wrapRequestBody, "wrapRequestBody");
    function nop() {
    }
    __name(nop, "nop");
    function isStream(obj) {
      return obj && typeof obj === "object" && typeof obj.pipe === "function" && typeof obj.on === "function";
    }
    __name(isStream, "isStream");
    function isBlobLike(object) {
      if (object === null) {
        return false;
      } else if (object instanceof Blob3) {
        return true;
      } else if (typeof object !== "object") {
        return false;
      } else {
        const sTag = object[Symbol.toStringTag];
        return (sTag === "Blob" || sTag === "File") && ("stream" in object && typeof object.stream === "function" || "arrayBuffer" in object && typeof object.arrayBuffer === "function");
      }
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
    function isValidPort(port) {
      const value = parseInt(port, 10);
      return value === Number(port) && value >= 0 && value <= 65535;
    }
    __name(isValidPort, "isValidPort");
    function isHttpOrHttpsPrefixed(value) {
      return value != null && value[0] === "h" && value[1] === "t" && value[2] === "t" && value[3] === "p" && (value[4] === ":" || value[4] === "s" && value[5] === ":");
    }
    __name(isHttpOrHttpsPrefixed, "isHttpOrHttpsPrefixed");
    function parseURL(url) {
      if (typeof url === "string") {
        url = new URL(url);
        if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
          throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
        }
        return url;
      }
      if (!url || typeof url !== "object") {
        throw new InvalidArgumentError("Invalid URL: The URL argument must be a non-null object.");
      }
      if (!(url instanceof URL)) {
        if (url.port != null && url.port !== "" && isValidPort(url.port) === false) {
          throw new InvalidArgumentError("Invalid URL: port must be a valid integer or a string representation of an integer.");
        }
        if (url.path != null && typeof url.path !== "string") {
          throw new InvalidArgumentError("Invalid URL path: the path must be a string or null/undefined.");
        }
        if (url.pathname != null && typeof url.pathname !== "string") {
          throw new InvalidArgumentError("Invalid URL pathname: the pathname must be a string or null/undefined.");
        }
        if (url.hostname != null && typeof url.hostname !== "string") {
          throw new InvalidArgumentError("Invalid URL hostname: the hostname must be a string or null/undefined.");
        }
        if (url.origin != null && typeof url.origin !== "string") {
          throw new InvalidArgumentError("Invalid URL origin: the origin must be a string or null/undefined.");
        }
        if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
          throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
        }
        const port = url.port != null ? url.port : url.protocol === "https:" ? 443 : 80;
        let origin = url.origin != null ? url.origin : `${url.protocol || ""}//${url.hostname || ""}:${port}`;
        let path = url.path != null ? url.path : `${url.pathname || ""}${url.search || ""}`;
        if (origin[origin.length - 1] === "/") {
          origin = origin.slice(0, origin.length - 1);
        }
        if (path && path[0] !== "/") {
          path = `/${path}`;
        }
        return new URL(`${origin}${path}`);
      }
      if (!isHttpOrHttpsPrefixed(url.origin || url.protocol)) {
        throw new InvalidArgumentError("Invalid URL protocol: the URL must start with `http:` or `https:`.");
      }
      return url;
    }
    __name(parseURL, "parseURL");
    function parseOrigin(url) {
      url = parseURL(url);
      if (url.pathname !== "/" || url.search || url.hash) {
        throw new InvalidArgumentError("invalid url");
      }
      return url;
    }
    __name(parseOrigin, "parseOrigin");
    function getHostname(host) {
      if (host[0] === "[") {
        const idx2 = host.indexOf("]");
        assert(idx2 !== -1);
        return host.substring(1, idx2);
      }
      const idx = host.indexOf(":");
      if (idx === -1)
        return host;
      return host.substring(0, idx);
    }
    __name(getHostname, "getHostname");
    function getServerName(host) {
      if (!host) {
        return null;
      }
      assert(typeof host === "string");
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
        return state && state.objectMode === false && state.ended === true && Number.isFinite(state.length) ? state.length : null;
      } else if (isBlobLike(body)) {
        return body.size != null ? body.size : null;
      } else if (isBuffer(body)) {
        return body.byteLength;
      }
      return null;
    }
    __name(bodyLength, "bodyLength");
    function isDestroyed(body) {
      return body && !!(body.destroyed || body[kDestroyed] || stream.isDestroyed?.(body));
    }
    __name(isDestroyed, "isDestroyed");
    function destroy(stream2, err) {
      if (stream2 == null || !isStream(stream2) || isDestroyed(stream2)) {
        return;
      }
      if (typeof stream2.destroy === "function") {
        if (Object.getPrototypeOf(stream2).constructor === IncomingMessage) {
          stream2.socket = null;
        }
        stream2.destroy(err);
      } else if (err) {
        queueMicrotask(() => {
          stream2.emit("error", err);
        });
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
    function headerNameToString(value) {
      return typeof value === "string" ? headerNameLowerCasedRecord[value] ?? value.toLowerCase() : tree.lookup(value) ?? value.toString("latin1").toLowerCase();
    }
    __name(headerNameToString, "headerNameToString");
    function bufferToLowerCasedHeaderName(value) {
      return tree.lookup(value) ?? value.toString("latin1").toLowerCase();
    }
    __name(bufferToLowerCasedHeaderName, "bufferToLowerCasedHeaderName");
    function parseHeaders(headers, obj) {
      if (obj === void 0)
        obj = {};
      for (let i = 0; i < headers.length; i += 2) {
        const key = headerNameToString(headers[i]);
        let val = obj[key];
        if (val) {
          if (typeof val === "string") {
            val = [val];
            obj[key] = val;
          }
          val.push(headers[i + 1].toString("utf8"));
        } else {
          const headersValue = headers[i + 1];
          if (typeof headersValue === "string") {
            obj[key] = headersValue;
          } else {
            obj[key] = Array.isArray(headersValue) ? headersValue.map((x) => x.toString("utf8")) : headersValue.toString("utf8");
          }
        }
      }
      if ("content-length" in obj && "content-disposition" in obj) {
        obj["content-disposition"] = Buffer.from(obj["content-disposition"]).toString("latin1");
      }
      return obj;
    }
    __name(parseHeaders, "parseHeaders");
    function parseRawHeaders(headers) {
      const len = headers.length;
      const ret = new Array(len);
      let hasContentLength = false;
      let contentDispositionIdx = -1;
      let key;
      let val;
      let kLen = 0;
      for (let n = 0; n < headers.length; n += 2) {
        key = headers[n];
        val = headers[n + 1];
        typeof key !== "string" && (key = key.toString());
        typeof val !== "string" && (val = val.toString("utf8"));
        kLen = key.length;
        if (kLen === 14 && key[7] === "-" && (key === "content-length" || key.toLowerCase() === "content-length")) {
          hasContentLength = true;
        } else if (kLen === 19 && key[7] === "-" && (key === "content-disposition" || key.toLowerCase() === "content-disposition")) {
          contentDispositionIdx = n + 1;
        }
        ret[n] = key;
        ret[n + 1] = val;
      }
      if (hasContentLength && contentDispositionIdx !== -1) {
        ret[contentDispositionIdx] = Buffer.from(ret[contentDispositionIdx]).toString("latin1");
      }
      return ret;
    }
    __name(parseRawHeaders, "parseRawHeaders");
    function isBuffer(buffer) {
      return buffer instanceof Uint8Array || Buffer.isBuffer(buffer);
    }
    __name(isBuffer, "isBuffer");
    function validateHandler(handler, method, upgrade) {
      if (!handler || typeof handler !== "object") {
        throw new InvalidArgumentError("handler must be an object");
      }
      if (typeof handler.onConnect !== "function") {
        throw new InvalidArgumentError("invalid onConnect method");
      }
      if (typeof handler.onError !== "function") {
        throw new InvalidArgumentError("invalid onError method");
      }
      if (typeof handler.onBodySent !== "function" && handler.onBodySent !== void 0) {
        throw new InvalidArgumentError("invalid onBodySent method");
      }
      if (upgrade || method === "CONNECT") {
        if (typeof handler.onUpgrade !== "function") {
          throw new InvalidArgumentError("invalid onUpgrade method");
        }
      } else {
        if (typeof handler.onHeaders !== "function") {
          throw new InvalidArgumentError("invalid onHeaders method");
        }
        if (typeof handler.onData !== "function") {
          throw new InvalidArgumentError("invalid onData method");
        }
        if (typeof handler.onComplete !== "function") {
          throw new InvalidArgumentError("invalid onComplete method");
        }
      }
    }
    __name(validateHandler, "validateHandler");
    function isDisturbed(body) {
      return !!(body && (stream.isDisturbed(body) || body[kBodyUsed]));
    }
    __name(isDisturbed, "isDisturbed");
    function isErrored(body) {
      return !!(body && stream.isErrored(body));
    }
    __name(isErrored, "isErrored");
    function isReadable(body) {
      return !!(body && stream.isReadable(body));
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
    function ReadableStreamFrom(iterable) {
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
                controller.byobRequest?.respond(0);
              });
            } else {
              const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
              if (buf.byteLength) {
                controller.enqueue(new Uint8Array(buf));
              }
            }
            return controller.desiredSize > 0;
          },
          async cancel(reason) {
            await iterator.return();
          },
          type: "bytes"
        }
      );
    }
    __name(ReadableStreamFrom, "ReadableStreamFrom");
    function isFormDataLike(object) {
      return object && typeof object === "object" && typeof object.append === "function" && typeof object.delete === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.has === "function" && typeof object.set === "function" && object[Symbol.toStringTag] === "FormData";
    }
    __name(isFormDataLike, "isFormDataLike");
    function addAbortListener(signal, listener) {
      if ("addEventListener" in signal) {
        signal.addEventListener("abort", listener, { once: true });
        return () => signal.removeEventListener("abort", listener);
      }
      signal.addListener("abort", listener);
      return () => signal.removeListener("abort", listener);
    }
    __name(addAbortListener, "addAbortListener");
    var hasToWellFormed = typeof String.prototype.toWellFormed === "function";
    var hasIsWellFormed = typeof String.prototype.isWellFormed === "function";
    function toUSVString(val) {
      return hasToWellFormed ? `${val}`.toWellFormed() : nodeUtil.toUSVString(val);
    }
    __name(toUSVString, "toUSVString");
    function isUSVString(val) {
      return hasIsWellFormed ? `${val}`.isWellFormed() : toUSVString(val) === `${val}`;
    }
    __name(isUSVString, "isUSVString");
    function isTokenCharCode(c) {
      switch (c) {
        case 34:
        case 40:
        case 41:
        case 44:
        case 47:
        case 58:
        case 59:
        case 60:
        case 61:
        case 62:
        case 63:
        case 64:
        case 91:
        case 92:
        case 93:
        case 123:
        case 125:
          return false;
        default:
          return c >= 33 && c <= 126;
      }
    }
    __name(isTokenCharCode, "isTokenCharCode");
    function isValidHTTPToken(characters) {
      if (characters.length === 0) {
        return false;
      }
      for (let i = 0; i < characters.length; ++i) {
        if (!isTokenCharCode(characters.charCodeAt(i))) {
          return false;
        }
      }
      return true;
    }
    __name(isValidHTTPToken, "isValidHTTPToken");
    var headerCharRegex = /[^\t\x20-\x7e\x80-\xff]/;
    function isValidHeaderValue(characters) {
      return !headerCharRegex.test(characters);
    }
    __name(isValidHeaderValue, "isValidHeaderValue");
    function parseRangeHeader(range) {
      if (range == null || range === "")
        return { start: 0, end: null, size: null };
      const m = range ? range.match(/^bytes (\d+)-(\d+)\/(\d+)?$/) : null;
      return m ? {
        start: parseInt(m[1]),
        end: m[2] ? parseInt(m[2]) : null,
        size: m[3] ? parseInt(m[3]) : null
      } : null;
    }
    __name(parseRangeHeader, "parseRangeHeader");
    function addListener(obj, name, listener) {
      const listeners = obj[kListeners] ??= [];
      listeners.push([name, listener]);
      obj.on(name, listener);
      return obj;
    }
    __name(addListener, "addListener");
    function removeAllListeners(obj) {
      for (const [name, listener] of obj[kListeners] ?? []) {
        obj.removeListener(name, listener);
      }
      obj[kListeners] = null;
    }
    __name(removeAllListeners, "removeAllListeners");
    function errorRequest(client, request, err) {
      try {
        request.onError(err);
        assert(request.aborted);
      } catch (err2) {
        client.emit("error", err2);
      }
    }
    __name(errorRequest, "errorRequest");
    var kEnumerableProperty = /* @__PURE__ */ Object.create(null);
    kEnumerableProperty.enumerable = true;
    var normalizedMethodRecordsBase = {
      delete: "DELETE",
      DELETE: "DELETE",
      get: "GET",
      GET: "GET",
      head: "HEAD",
      HEAD: "HEAD",
      options: "OPTIONS",
      OPTIONS: "OPTIONS",
      post: "POST",
      POST: "POST",
      put: "PUT",
      PUT: "PUT"
    };
    var normalizedMethodRecords = {
      ...normalizedMethodRecordsBase,
      patch: "patch",
      PATCH: "PATCH"
    };
    Object.setPrototypeOf(normalizedMethodRecordsBase, null);
    Object.setPrototypeOf(normalizedMethodRecords, null);
    module2.exports = {
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
      safeHTTPMethods: ["GET", "HEAD", "OPTIONS", "TRACE"],
      wrapRequestBody
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/diagnostics.js
var require_diagnostics = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/diagnostics.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var diagnosticsChannel = require("diagnostics_channel");
    var util = require("util");
    var undiciDebugLog = util.debuglog("undici");
    var fetchDebuglog = util.debuglog("fetch");
    var websocketDebuglog = util.debuglog("websocket");
    var isClientSet = false;
    var channels = {
      // Client
      beforeConnect: diagnosticsChannel.channel("undici:client:beforeConnect"),
      connected: diagnosticsChannel.channel("undici:client:connected"),
      connectError: diagnosticsChannel.channel("undici:client:connectError"),
      sendHeaders: diagnosticsChannel.channel("undici:client:sendHeaders"),
      // Request
      create: diagnosticsChannel.channel("undici:request:create"),
      bodySent: diagnosticsChannel.channel("undici:request:bodySent"),
      headers: diagnosticsChannel.channel("undici:request:headers"),
      trailers: diagnosticsChannel.channel("undici:request:trailers"),
      error: diagnosticsChannel.channel("undici:request:error"),
      // WebSocket
      open: diagnosticsChannel.channel("undici:websocket:open"),
      close: diagnosticsChannel.channel("undici:websocket:close"),
      socketError: diagnosticsChannel.channel("undici:websocket:socket_error"),
      ping: diagnosticsChannel.channel("undici:websocket:ping"),
      pong: diagnosticsChannel.channel("undici:websocket:pong")
    };
    if (undiciDebugLog.enabled || fetchDebuglog.enabled) {
      const debuglog = fetchDebuglog.enabled ? fetchDebuglog : undiciDebugLog;
      diagnosticsChannel.channel("undici:client:beforeConnect").subscribe((evt) => {
        const {
          connectParams: { version, protocol, port, host }
        } = evt;
        debuglog(
          "connecting to %s using %s%s",
          `${host}${port ? `:${port}` : ""}`,
          protocol,
          version
        );
      });
      diagnosticsChannel.channel("undici:client:connected").subscribe((evt) => {
        const {
          connectParams: { version, protocol, port, host }
        } = evt;
        debuglog(
          "connected to %s using %s%s",
          `${host}${port ? `:${port}` : ""}`,
          protocol,
          version
        );
      });
      diagnosticsChannel.channel("undici:client:connectError").subscribe((evt) => {
        const {
          connectParams: { version, protocol, port, host },
          error
        } = evt;
        debuglog(
          "connection to %s using %s%s errored - %s",
          `${host}${port ? `:${port}` : ""}`,
          protocol,
          version,
          error.message
        );
      });
      diagnosticsChannel.channel("undici:client:sendHeaders").subscribe((evt) => {
        const {
          request: { method, path, origin }
        } = evt;
        debuglog("sending request to %s %s/%s", method, origin, path);
      });
      diagnosticsChannel.channel("undici:request:headers").subscribe((evt) => {
        const {
          request: { method, path, origin },
          response: { statusCode }
        } = evt;
        debuglog(
          "received response to %s %s/%s - HTTP %d",
          method,
          origin,
          path,
          statusCode
        );
      });
      diagnosticsChannel.channel("undici:request:trailers").subscribe((evt) => {
        const {
          request: { method, path, origin }
        } = evt;
        debuglog("trailers received from %s %s/%s", method, origin, path);
      });
      diagnosticsChannel.channel("undici:request:error").subscribe((evt) => {
        const {
          request: { method, path, origin },
          error
        } = evt;
        debuglog(
          "request to %s %s/%s errored - %s",
          method,
          origin,
          path,
          error.message
        );
      });
      isClientSet = true;
    }
    if (websocketDebuglog.enabled) {
      if (!isClientSet) {
        const debuglog = undiciDebugLog.enabled ? undiciDebugLog : websocketDebuglog;
        diagnosticsChannel.channel("undici:client:beforeConnect").subscribe((evt) => {
          const {
            connectParams: { version, protocol, port, host }
          } = evt;
          debuglog(
            "connecting to %s%s using %s%s",
            host,
            port ? `:${port}` : "",
            protocol,
            version
          );
        });
        diagnosticsChannel.channel("undici:client:connected").subscribe((evt) => {
          const {
            connectParams: { version, protocol, port, host }
          } = evt;
          debuglog(
            "connected to %s%s using %s%s",
            host,
            port ? `:${port}` : "",
            protocol,
            version
          );
        });
        diagnosticsChannel.channel("undici:client:connectError").subscribe((evt) => {
          const {
            connectParams: { version, protocol, port, host },
            error
          } = evt;
          debuglog(
            "connection to %s%s using %s%s errored - %s",
            host,
            port ? `:${port}` : "",
            protocol,
            version,
            error.message
          );
        });
        diagnosticsChannel.channel("undici:client:sendHeaders").subscribe((evt) => {
          const {
            request: { method, path, origin }
          } = evt;
          debuglog("sending request to %s %s/%s", method, origin, path);
        });
      }
      diagnosticsChannel.channel("undici:websocket:open").subscribe((evt) => {
        const {
          address: { address, port }
        } = evt;
        websocketDebuglog("connection opened %s%s", address, port ? `:${port}` : "");
      });
      diagnosticsChannel.channel("undici:websocket:close").subscribe((evt) => {
        const { websocket, code, reason } = evt;
        websocketDebuglog(
          "closed connection to %s - %s %s",
          websocket.url,
          code,
          reason
        );
      });
      diagnosticsChannel.channel("undici:websocket:socket_error").subscribe((err) => {
        websocketDebuglog("connection errored - %s", err.message);
      });
      diagnosticsChannel.channel("undici:websocket:ping").subscribe((evt) => {
        websocketDebuglog("ping received");
      });
      diagnosticsChannel.channel("undici:websocket:pong").subscribe((evt) => {
        websocketDebuglog("pong received");
      });
    }
    module2.exports = {
      channels
    };
  }
});

// src/patches/undici-core-request.js
var require_undici_core_request = __commonJS({
  "src/patches/undici-core-request.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      InvalidArgumentError,
      NotSupportedError
    } = require_errors();
    var assert = require("assert");
    var {
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
    } = require_util();
    var { channels } = require_diagnostics();
    var { headerNameLowerCasedRecord } = require_constants();
    var invalidPathRegex = /[^\u0021-\u00ff]/;
    var kHandler = Symbol("handler");
    var _Request2 = class _Request2 {
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
        reset,
        throwOnError,
        expectContinue,
        servername
      }, handler) {
        if (typeof path !== "string") {
          throw new InvalidArgumentError("path must be a string");
        } else if (path[0] !== "/" && !(path.startsWith("http://") || path.startsWith("https://")) && method !== "CONNECT") {
          throw new InvalidArgumentError(
            "path must be an absolute URL or start with a slash"
          );
        } else if (invalidPathRegex.test(path)) {
          throw new InvalidArgumentError("invalid request path");
        }
        if (typeof method !== "string") {
          throw new InvalidArgumentError("method must be a string");
        } else if (normalizedMethodRecords[method] === void 0 && !isValidHTTPToken(method)) {
          throw new InvalidArgumentError("invalid request method");
        }
        if (upgrade && typeof upgrade !== "string") {
          throw new InvalidArgumentError("upgrade must be a string");
        }
        if (headersTimeout != null && (!Number.isFinite(headersTimeout) || headersTimeout < 0)) {
          throw new InvalidArgumentError("invalid headersTimeout");
        }
        if (bodyTimeout != null && (!Number.isFinite(bodyTimeout) || bodyTimeout < 0)) {
          throw new InvalidArgumentError("invalid bodyTimeout");
        }
        if (reset != null && typeof reset !== "boolean") {
          throw new InvalidArgumentError("invalid reset");
        }
        if (expectContinue != null && typeof expectContinue !== "boolean") {
          throw new InvalidArgumentError("invalid expectContinue");
        }
        this.headersTimeout = headersTimeout;
        this.bodyTimeout = bodyTimeout;
        this.throwOnError = throwOnError === true;
        this.method = method;
        this.abort = null;
        if (body == null) {
          this.body = null;
        } else if (isStream(body)) {
          this.body = body;
          const rState = this.body._readableState;
          if (!rState || !rState.autoDestroy) {
            this.endHandler = /* @__PURE__ */ __name(function autoDestroy() {
              destroy(this);
            }, "autoDestroy");
            this.body.on("end", this.endHandler);
          }
          this.errorHandler = (err) => {
            if (this.abort) {
              this.abort(err);
            } else {
              this.error = err;
            }
          };
          this.body.on("error", this.errorHandler);
        } else if (isBuffer(body)) {
          this.body = body.byteLength ? body : null;
        } else if (ArrayBuffer.isView(body)) {
          this.body = body.buffer.byteLength ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : null;
        } else if (body instanceof ArrayBuffer) {
          this.body = body.byteLength ? Buffer.from(body) : null;
        } else if (typeof body === "string") {
          this.body = body.length ? Buffer.from(body) : null;
        } else if (isFormDataLike(body) || isIterable(body) || isBlobLike(body)) {
          this.body = body;
        } else {
          throw new InvalidArgumentError(
            "body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable"
          );
        }
        this.completed = false;
        this.aborted = false;
        this.upgrade = upgrade || null;
        this.path = query ? buildURL(path, query) : path;
        this.origin = origin;
        this.idempotent = idempotent == null ? method === "HEAD" || method === "GET" : idempotent;
        this.blocking = blocking == null ? false : blocking;
        this.reset = reset == null ? null : reset;
        this.host = null;
        this.contentLength = null;
        this.contentType = null;
        this.headers = [];
        this.expectContinue = expectContinue != null ? expectContinue : false;
        if (Array.isArray(headers)) {
          if (headers.length % 2 !== 0) {
            throw new InvalidArgumentError("headers array must be even");
          }
          for (let i = 0; i < headers.length; i += 2) {
            processHeader(this, headers[i], headers[i + 1]);
          }
        } else if (headers && typeof headers === "object") {
          if (headers[Symbol.iterator]) {
            for (const header of headers) {
              if (!Array.isArray(header) || header.length !== 2) {
                throw new InvalidArgumentError(
                  "headers must be in key-value pair format"
                );
              }
              processHeader(this, header[0], header[1]);
            }
          } else {
            const keys = Object.keys(headers);
            for (let i = 0; i < keys.length; ++i) {
              processHeader(this, keys[i], headers[keys[i]]);
            }
          }
        } else if (headers != null) {
          throw new InvalidArgumentError("headers must be an object or an array");
        }
        validateHandler(handler, method, upgrade);
        this.servername = servername || getServerName(this.host);
        this[kHandler] = handler;
        if (channels.create.hasSubscribers) {
          channels.create.publish({ request: this });
        }
      }
      onBodySent(chunk) {
        if (this[kHandler].onBodySent) {
          try {
            return this[kHandler].onBodySent(chunk);
          } catch (err) {
            this.abort(err);
          }
        }
      }
      onRequestSent() {
        if (channels.bodySent.hasSubscribers) {
          channels.bodySent.publish({ request: this });
        }
        if (this[kHandler].onRequestSent) {
          try {
            return this[kHandler].onRequestSent();
          } catch (err) {
            this.abort(err);
          }
        }
      }
      onConnect(abort) {
        assert(!this.aborted);
        assert(!this.completed);
        if (this.error) {
          abort(this.error);
        } else {
          this.abort = abort;
          return this[kHandler].onConnect(abort);
        }
      }
      onResponseStarted() {
        return this[kHandler].onResponseStarted?.();
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
        try {
          return this[kHandler].onHeaders(statusCode, headers, resume, statusText);
        } catch (err) {
          this.abort(err);
        }
      }
      onData(chunk) {
        assert(!this.aborted);
        assert(!this.completed);
        try {
          return this[kHandler].onData(chunk);
        } catch (err) {
          this.abort(err);
          return false;
        }
      }
      onUpgrade(statusCode, headers, socket) {
        assert(!this.aborted);
        assert(!this.completed);
        return this[kHandler].onUpgrade(statusCode, headers, socket);
      }
      onComplete(trailers) {
        this.onFinally();
        assert(!this.aborted);
        this.completed = true;
        if (channels.trailers.hasSubscribers) {
          channels.trailers.publish({ request: this, trailers });
        }
        try {
          return this[kHandler].onComplete(trailers);
        } catch (err) {
          this.onError(err);
        }
      }
      onError(error) {
        this.onFinally();
        if (channels.error.hasSubscribers) {
          channels.error.publish({ request: this, error });
        }
        if (this.aborted) {
          return;
        }
        this.aborted = true;
        return this[kHandler].onError(error);
      }
      onFinally() {
        if (this.errorHandler) {
          this.body.off("error", this.errorHandler);
          this.errorHandler = null;
        }
        if (this.endHandler) {
          this.body.off("end", this.endHandler);
          this.endHandler = null;
        }
      }
      addHeader(key, value) {
        processHeader(this, key, value);
        return this;
      }
    };
    __name(_Request2, "Request");
    var Request2 = _Request2;
    function processHeader(request, key, val) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        throw new InvalidArgumentError(`invalid ${key} header`);
      } else if (val === void 0) {
        return;
      }
      let headerName = headerNameLowerCasedRecord[key];
      if (headerName === void 0) {
        headerName = key.toLowerCase();
        if (headerNameLowerCasedRecord[headerName] === void 0 && !isValidHTTPToken(headerName)) {
          throw new InvalidArgumentError("invalid header key");
        }
      }
      if (Array.isArray(val)) {
        const arr = [];
        for (let i = 0; i < val.length; i++) {
          if (typeof val[i] === "string") {
            if (!isValidHeaderValue(val[i])) {
              throw new InvalidArgumentError(`invalid ${key} header`);
            }
            arr.push(val[i]);
          } else if (val[i] === null) {
            arr.push("");
          } else if (typeof val[i] === "object") {
            throw new InvalidArgumentError(`invalid ${key} header`);
          } else {
            arr.push(`${val[i]}`);
          }
        }
        val = arr;
      } else if (typeof val === "string") {
        if (!isValidHeaderValue(val)) {
          throw new InvalidArgumentError(`invalid ${key} header`);
        }
      } else if (val === null) {
        val = "";
      } else {
        val = `${val}`;
      }
      if (request.host === null && headerName === "host") {
        if (typeof val !== "string") {
          throw new InvalidArgumentError("invalid host header");
        }
        request.host = val;
      } else if (request.contentLength === null && headerName === "content-length") {
        request.contentLength = parseInt(val, 10);
        if (!Number.isFinite(request.contentLength)) {
          throw new InvalidArgumentError("invalid content-length header");
        }
      } else if (request.contentType === null && headerName === "content-type") {
        request.contentType = val;
        request.headers.push(key, val);
      } else if (headerName === "connection") {
        const value = typeof val === "string" ? val.toLowerCase() : null;
        if (value !== "close" && value !== "keep-alive") {
          throw new InvalidArgumentError("invalid connection header");
        }
        if (value === "close") {
          request.reset = true;
        }
      } else if (headerName === "expect") {
        throw new NotSupportedError("expect header not supported");
      } else {
        request.headers.push(key, val);
      }
    }
    __name(processHeader, "processHeader");
    module2.exports = Request2;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/dispatcher.js
var require_dispatcher = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/dispatcher.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var EventEmitter = require("events");
    var _Dispatcher = class _Dispatcher extends EventEmitter {
      dispatch() {
        throw new Error("not implemented");
      }
      close() {
        throw new Error("not implemented");
      }
      destroy() {
        throw new Error("not implemented");
      }
      compose(...args) {
        const interceptors = Array.isArray(args[0]) ? args[0] : args;
        let dispatch = this.dispatch.bind(this);
        for (const interceptor of interceptors) {
          if (interceptor == null) {
            continue;
          }
          if (typeof interceptor !== "function") {
            throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`);
          }
          dispatch = interceptor(dispatch);
          if (dispatch == null || typeof dispatch !== "function" || dispatch.length !== 2) {
            throw new TypeError("invalid interceptor");
          }
        }
        return new ComposedDispatcher(this, dispatch);
      }
    };
    __name(_Dispatcher, "Dispatcher");
    var Dispatcher = _Dispatcher;
    var _dispatcher, _dispatch;
    var _ComposedDispatcher = class _ComposedDispatcher extends Dispatcher {
      constructor(dispatcher, dispatch) {
        super();
        __privateAdd(this, _dispatcher, null);
        __privateAdd(this, _dispatch, null);
        __privateSet(this, _dispatcher, dispatcher);
        __privateSet(this, _dispatch, dispatch);
      }
      dispatch(...args) {
        __privateGet(this, _dispatch).call(this, ...args);
      }
      close(...args) {
        return __privateGet(this, _dispatcher).close(...args);
      }
      destroy(...args) {
        return __privateGet(this, _dispatcher).destroy(...args);
      }
    };
    _dispatcher = new WeakMap();
    _dispatch = new WeakMap();
    __name(_ComposedDispatcher, "ComposedDispatcher");
    var ComposedDispatcher = _ComposedDispatcher;
    module2.exports = Dispatcher;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/dispatcher-base.js
var require_dispatcher_base = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/dispatcher-base.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var Dispatcher = require_dispatcher();
    var {
      ClientDestroyedError,
      ClientClosedError,
      InvalidArgumentError
    } = require_errors();
    var { kDestroy, kClose, kClosed, kDestroyed, kDispatch, kInterceptors } = require_symbols();
    var kOnDestroyed = Symbol("onDestroyed");
    var kOnClosed = Symbol("onClosed");
    var kInterceptedDispatch = Symbol("Intercepted Dispatch");
    var _DispatcherBase = class _DispatcherBase extends Dispatcher {
      constructor() {
        super();
        this[kDestroyed] = false;
        this[kOnDestroyed] = null;
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
              throw new InvalidArgumentError("interceptor must be an function");
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
          throw new InvalidArgumentError("invalid callback");
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
              return err2 ? (
                /* istanbul ignore next: should never error */
                reject(err2)
              ) : resolve(data);
            });
          });
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError("invalid callback");
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
        this[kOnDestroyed] = this[kOnDestroyed] || [];
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
          throw new InvalidArgumentError("handler must be an object");
        }
        try {
          if (!opts || typeof opts !== "object") {
            throw new InvalidArgumentError("opts must be an object.");
          }
          if (this[kDestroyed] || this[kOnDestroyed]) {
            throw new ClientDestroyedError();
          }
          if (this[kClosed]) {
            throw new ClientClosedError();
          }
          return this[kInterceptedDispatch](opts, handler);
        } catch (err) {
          if (typeof handler.onError !== "function") {
            throw new InvalidArgumentError("invalid onError method");
          }
          handler.onError(err);
          return false;
        }
      }
    };
    __name(_DispatcherBase, "DispatcherBase");
    var DispatcherBase = _DispatcherBase;
    module2.exports = DispatcherBase;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/util/timers.js
var require_timers = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/util/timers.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var fastNow = 0;
    var RESOLUTION_MS = 1e3;
    var TICK_MS = (RESOLUTION_MS >> 1) - 1;
    var fastNowTimeout;
    var kFastTimer = Symbol("kFastTimer");
    var fastTimers = [];
    var NOT_IN_LIST = -2;
    var TO_BE_CLEARED = -1;
    var PENDING = 0;
    var ACTIVE = 1;
    function onTick() {
      fastNow += TICK_MS;
      let idx = 0;
      let len = fastTimers.length;
      while (idx < len) {
        const timer = fastTimers[idx];
        if (timer._state === PENDING) {
          timer._idleStart = fastNow - TICK_MS;
          timer._state = ACTIVE;
        } else if (timer._state === ACTIVE && fastNow >= timer._idleStart + timer._idleTimeout) {
          timer._state = TO_BE_CLEARED;
          timer._idleStart = -1;
          timer._onTimeout(timer._timerArg);
        }
        if (timer._state === TO_BE_CLEARED) {
          timer._state = NOT_IN_LIST;
          if (--len !== 0) {
            fastTimers[idx] = fastTimers[len];
          }
        } else {
          ++idx;
        }
      }
      fastTimers.length = len;
      if (fastTimers.length !== 0) {
        refreshTimeout();
      }
    }
    __name(onTick, "onTick");
    function refreshTimeout() {
      if (fastNowTimeout) {
        fastNowTimeout.refresh();
      } else {
        clearTimeout(fastNowTimeout);
        fastNowTimeout = setTimeout(onTick, TICK_MS);
        if (fastNowTimeout.unref) {
          fastNowTimeout.unref();
        }
      }
    }
    __name(refreshTimeout, "refreshTimeout");
    var _FastTimer = class _FastTimer {
      [kFastTimer] = true;
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
      _state = NOT_IN_LIST;
      /**
       * The number of milliseconds to wait before calling the callback.
       *
       * @type {number}
       * @private
       */
      _idleTimeout = -1;
      /**
       * The time in milliseconds when the timer was started. This value is used to
       * calculate when the timer should expire.
       *
       * @type {number}
       * @default -1
       * @private
       */
      _idleStart = -1;
      /**
       * The function to be executed when the timer expires.
       * @type {Function}
       * @private
       */
      _onTimeout;
      /**
       * The argument to be passed to the callback when the timer expires.
       *
       * @type {*}
       * @private
       */
      _timerArg;
      /**
       * @constructor
       * @param {Function} callback A function to be executed after the timer
       * expires.
       * @param {number} delay The time, in milliseconds that the timer should wait
       * before the specified function or code is executed.
       * @param {*} arg
       */
      constructor(callback, delay, arg) {
        this._onTimeout = callback;
        this._idleTimeout = delay;
        this._timerArg = arg;
        this.refresh();
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
      refresh() {
        if (this._state === NOT_IN_LIST) {
          fastTimers.push(this);
        }
        if (!fastNowTimeout || fastTimers.length === 1) {
          refreshTimeout();
        }
        this._state = PENDING;
      }
      /**
       * The `clear` method cancels the timer, preventing it from executing.
       *
       * @returns {void}
       * @private
       */
      clear() {
        this._state = TO_BE_CLEARED;
        this._idleStart = -1;
      }
    };
    __name(_FastTimer, "FastTimer");
    var FastTimer = _FastTimer;
    module2.exports = {
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
      setTimeout(callback, delay, arg) {
        return delay <= RESOLUTION_MS ? setTimeout(callback, delay, arg) : new FastTimer(callback, delay, arg);
      },
      /**
       * The clearTimeout method cancels an instantiated Timer previously created
       * by calling setTimeout.
       *
       * @param {NodeJS.Timeout|FastTimer} timeout
       */
      clearTimeout(timeout) {
        if (timeout[kFastTimer]) {
          timeout.clear();
        } else {
          clearTimeout(timeout);
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
      setFastTimeout(callback, delay, arg) {
        return new FastTimer(callback, delay, arg);
      },
      /**
       * The clearTimeout method cancels an instantiated FastTimer previously
       * created by calling setFastTimeout.
       *
       * @param {FastTimer} timeout
       */
      clearFastTimeout(timeout) {
        timeout.clear();
      },
      /**
       * The now method returns the value of the internal fast timer clock.
       *
       * @returns {number}
       */
      now() {
        return fastNow;
      },
      /**
       * Trigger the onTick function to process the fastTimers array.
       * Exported for testing purposes only.
       * Marking as deprecated to discourage any use outside of testing.
       * @deprecated
       * @param {number} [delay=0] The delay in milliseconds to add to the now value.
       */
      tick(delay = 0) {
        fastNow += delay - RESOLUTION_MS + 1;
        onTick();
        onTick();
      },
      /**
       * Reset FastTimers.
       * Exported for testing purposes only.
       * Marking as deprecated to discourage any use outside of testing.
       * @deprecated
       */
      reset() {
        fastNow = 0;
        fastTimers.length = 0;
        clearTimeout(fastNowTimeout);
        fastNowTimeout = null;
      },
      /**
       * Exporting for testing purposes only.
       * Marking as deprecated to discourage any use outside of testing.
       * @deprecated
       */
      kFastTimer
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/connect.js
var require_connect = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/core/connect.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var net = require("net");
    var assert = require("assert");
    var util = require_util();
    var { InvalidArgumentError, ConnectTimeoutError } = require_errors();
    var timers = require_timers();
    function noop() {
    }
    __name(noop, "noop");
    var tls;
    var SessionCache;
    var _a, _b;
    if (global.FinalizationRegistry && !(define_process_default.env.NODE_V8_COVERAGE || define_process_default.env.UNDICI_NO_FG)) {
      SessionCache = (_a = class {
        constructor(maxCachedSessions) {
          this._maxCachedSessions = maxCachedSessions;
          this._sessionCache = /* @__PURE__ */ new Map();
          this._sessionRegistry = new global.FinalizationRegistry((key) => {
            if (this._sessionCache.size < this._maxCachedSessions) {
              return;
            }
            const ref = this._sessionCache.get(key);
            if (ref !== void 0 && ref.deref() === void 0) {
              this._sessionCache.delete(key);
            }
          });
        }
        get(sessionKey) {
          const ref = this._sessionCache.get(sessionKey);
          return ref ? ref.deref() : null;
        }
        set(sessionKey, session) {
          if (this._maxCachedSessions === 0) {
            return;
          }
          this._sessionCache.set(sessionKey, new WeakRef(session));
          this._sessionRegistry.register(session, sessionKey);
        }
      }, __name(_a, "WeakSessionCache"), _a);
    } else {
      SessionCache = (_b = class {
        constructor(maxCachedSessions) {
          this._maxCachedSessions = maxCachedSessions;
          this._sessionCache = /* @__PURE__ */ new Map();
        }
        get(sessionKey) {
          return this._sessionCache.get(sessionKey);
        }
        set(sessionKey, session) {
          if (this._maxCachedSessions === 0) {
            return;
          }
          if (this._sessionCache.size >= this._maxCachedSessions) {
            const { value: oldestKey } = this._sessionCache.keys().next();
            this._sessionCache.delete(oldestKey);
          }
          this._sessionCache.set(sessionKey, session);
        }
      }, __name(_b, "SimpleSessionCache"), _b);
    }
    function buildConnector({ allowH2, maxCachedSessions, socketPath, timeout, session: customSession, ...opts }) {
      if (maxCachedSessions != null && (!Number.isInteger(maxCachedSessions) || maxCachedSessions < 0)) {
        throw new InvalidArgumentError("maxCachedSessions must be a positive integer or zero");
      }
      const options = { path: socketPath, ...opts };
      const sessionCache = new SessionCache(maxCachedSessions == null ? 100 : maxCachedSessions);
      timeout = timeout == null ? 1e4 : timeout;
      allowH2 = allowH2 != null ? allowH2 : false;
      return /* @__PURE__ */ __name(function connect({ hostname, host, protocol, port, servername, localAddress, httpSocket }, callback) {
        let socket;
        if (protocol === "https:") {
          if (!tls) {
            tls = require("tls");
          }
          servername = servername || options.servername || util.getServerName(host) || null;
          const sessionKey = servername || hostname;
          assert(sessionKey);
          const session = customSession || sessionCache.get(sessionKey) || null;
          port = port || 443;
          socket = tls.connect({
            highWaterMark: 16384,
            // TLS in node can't have bigger HWM anyway...
            ...options,
            servername,
            session,
            localAddress,
            // TODO(HTTP/2): Add support for h2c
            ALPNProtocols: allowH2 ? ["http/1.1", "h2"] : ["http/1.1"],
            socket: httpSocket,
            // upgrade socket connection
            port,
            host: hostname
          });
          socket.on("session", function(session2) {
            sessionCache.set(sessionKey, session2);
          });
        } else {
          assert(!httpSocket, "httpSocket can only be sent on TLS update");
          port = port || 80;
          socket = net.connect({
            highWaterMark: 64 * 1024,
            // Same as nodejs fs streams.
            ...options,
            localAddress,
            port,
            host: hostname
          });
        }
        if (options.keepAlive == null || options.keepAlive) {
          const keepAliveInitialDelay = options.keepAliveInitialDelay === void 0 ? 6e4 : options.keepAliveInitialDelay;
          socket.setKeepAlive(true, keepAliveInitialDelay);
        }
        const clearConnectTimeout = setupConnectTimeout(new WeakRef(socket), { timeout, hostname, port });
        socket.setNoDelay(true).once(protocol === "https:" ? "secureConnect" : "connect", function() {
          queueMicrotask(clearConnectTimeout);
          if (callback) {
            const cb = callback;
            callback = null;
            cb(null, this);
          }
        }).on("error", function(err) {
          queueMicrotask(clearConnectTimeout);
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
    var setupConnectTimeout = define_process_default.platform === "win32" ? (socketWeakRef, opts) => {
      if (!opts.timeout) {
        return noop;
      }
      let s1 = null;
      let s2 = null;
      const fastTimer = timers.setFastTimeout(() => {
        s1 = setImmediate(() => {
          s2 = setImmediate(() => onConnectTimeout(socketWeakRef.deref(), opts));
        });
      }, opts.timeout);
      return () => {
        timers.clearFastTimeout(fastTimer);
        clearImmediate(s1);
        clearImmediate(s2);
      };
    } : (socketWeakRef, opts) => {
      if (!opts.timeout) {
        return noop;
      }
      let s1 = null;
      const fastTimer = timers.setFastTimeout(() => {
        s1 = setImmediate(() => {
          onConnectTimeout(socketWeakRef.deref(), opts);
        });
      }, opts.timeout);
      return () => {
        timers.clearFastTimeout(fastTimer);
        clearImmediate(s1);
      };
    };
    function onConnectTimeout(socket, opts) {
      if (socket == null) {
        return;
      }
      let message = "Connect Timeout Error";
      if (Array.isArray(socket.autoSelectFamilyAttemptedAddresses)) {
        message += ` (attempted addresses: ${socket.autoSelectFamilyAttemptedAddresses.join(", ")},`;
      } else {
        message += ` (attempted address: ${opts.hostname}:${opts.port},`;
      }
      message += ` timeout: ${opts.timeout}ms)`;
      util.destroy(socket, new ConnectTimeoutError(message));
    }
    __name(onConnectTimeout, "onConnectTimeout");
    module2.exports = buildConnector;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/utils.js
var require_utils = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/utils.js"(exports2) {
    "use strict";
    init_define_process();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.enumToMap = void 0;
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
    exports2.enumToMap = enumToMap;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/constants.js
var require_constants2 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/constants.js"(exports2) {
    "use strict";
    init_define_process();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SPECIAL_HEADERS = exports2.HEADER_STATE = exports2.MINOR = exports2.MAJOR = exports2.CONNECTION_TOKEN_CHARS = exports2.HEADER_CHARS = exports2.TOKEN = exports2.STRICT_TOKEN = exports2.HEX = exports2.URL_CHAR = exports2.STRICT_URL_CHAR = exports2.USERINFO_CHARS = exports2.MARK = exports2.ALPHANUM = exports2.NUM = exports2.HEX_MAP = exports2.NUM_MAP = exports2.ALPHA = exports2.FINISH = exports2.H_METHOD_MAP = exports2.METHOD_MAP = exports2.METHODS_RTSP = exports2.METHODS_ICE = exports2.METHODS_HTTP = exports2.METHODS = exports2.LENIENT_FLAGS = exports2.FLAGS = exports2.TYPE = exports2.ERROR = void 0;
    var utils_1 = require_utils();
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
    })(ERROR = exports2.ERROR || (exports2.ERROR = {}));
    var TYPE;
    (function(TYPE2) {
      TYPE2[TYPE2["BOTH"] = 0] = "BOTH";
      TYPE2[TYPE2["REQUEST"] = 1] = "REQUEST";
      TYPE2[TYPE2["RESPONSE"] = 2] = "RESPONSE";
    })(TYPE = exports2.TYPE || (exports2.TYPE = {}));
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
    })(FLAGS = exports2.FLAGS || (exports2.FLAGS = {}));
    var LENIENT_FLAGS;
    (function(LENIENT_FLAGS2) {
      LENIENT_FLAGS2[LENIENT_FLAGS2["HEADERS"] = 1] = "HEADERS";
      LENIENT_FLAGS2[LENIENT_FLAGS2["CHUNKED_LENGTH"] = 2] = "CHUNKED_LENGTH";
      LENIENT_FLAGS2[LENIENT_FLAGS2["KEEP_ALIVE"] = 4] = "KEEP_ALIVE";
    })(LENIENT_FLAGS = exports2.LENIENT_FLAGS || (exports2.LENIENT_FLAGS = {}));
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
    })(METHODS = exports2.METHODS || (exports2.METHODS = {}));
    exports2.METHODS_HTTP = [
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
      // TODO(indutny): should we allow it with HTTP?
      METHODS.SOURCE
    ];
    exports2.METHODS_ICE = [
      METHODS.SOURCE
    ];
    exports2.METHODS_RTSP = [
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
      METHODS.POST
    ];
    exports2.METHOD_MAP = utils_1.enumToMap(METHODS);
    exports2.H_METHOD_MAP = {};
    Object.keys(exports2.METHOD_MAP).forEach((key) => {
      if (/^H/.test(key)) {
        exports2.H_METHOD_MAP[key] = exports2.METHOD_MAP[key];
      }
    });
    var FINISH;
    (function(FINISH2) {
      FINISH2[FINISH2["SAFE"] = 0] = "SAFE";
      FINISH2[FINISH2["SAFE_WITH_CB"] = 1] = "SAFE_WITH_CB";
      FINISH2[FINISH2["UNSAFE"] = 2] = "UNSAFE";
    })(FINISH = exports2.FINISH || (exports2.FINISH = {}));
    exports2.ALPHA = [];
    for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
      exports2.ALPHA.push(String.fromCharCode(i));
      exports2.ALPHA.push(String.fromCharCode(i + 32));
    }
    exports2.NUM_MAP = {
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
    exports2.HEX_MAP = {
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
    exports2.NUM = [
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
    exports2.ALPHANUM = exports2.ALPHA.concat(exports2.NUM);
    exports2.MARK = ["-", "_", ".", "!", "~", "*", "'", "(", ")"];
    exports2.USERINFO_CHARS = exports2.ALPHANUM.concat(exports2.MARK).concat(["%", ";", ":", "&", "=", "+", "$", ","]);
    exports2.STRICT_URL_CHAR = [
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
    ].concat(exports2.ALPHANUM);
    exports2.URL_CHAR = exports2.STRICT_URL_CHAR.concat(["	", "\f"]);
    for (let i = 128; i <= 255; i++) {
      exports2.URL_CHAR.push(i);
    }
    exports2.HEX = exports2.NUM.concat(["a", "b", "c", "d", "e", "f", "A", "B", "C", "D", "E", "F"]);
    exports2.STRICT_TOKEN = [
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
    ].concat(exports2.ALPHANUM);
    exports2.TOKEN = exports2.STRICT_TOKEN.concat([" "]);
    exports2.HEADER_CHARS = ["	"];
    for (let i = 32; i <= 255; i++) {
      if (i !== 127) {
        exports2.HEADER_CHARS.push(i);
      }
    }
    exports2.CONNECTION_TOKEN_CHARS = exports2.HEADER_CHARS.filter((c) => c !== 44);
    exports2.MAJOR = exports2.NUM_MAP;
    exports2.MINOR = exports2.MAJOR;
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
    })(HEADER_STATE = exports2.HEADER_STATE || (exports2.HEADER_STATE = {}));
    exports2.SPECIAL_HEADERS = {
      "connection": HEADER_STATE.CONNECTION,
      "content-length": HEADER_STATE.CONTENT_LENGTH,
      "proxy-connection": HEADER_STATE.CONNECTION,
      "transfer-encoding": HEADER_STATE.TRANSFER_ENCODING,
      "upgrade": HEADER_STATE.UPGRADE
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/llhttp-wasm.js
var require_llhttp_wasm = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/llhttp-wasm.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Buffer: Buffer2 } = require("buffer");
    module2.exports = Buffer2.from("AGFzbQEAAAABJwdgAX8Bf2ADf39/AX9gAX8AYAJ/fwBgBH9/f38Bf2AAAGADf39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQAEA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAy0sBQYAAAIAAAAAAAACAQIAAgICAAADAAAAAAMDAwMBAQEBAQEBAQEAAAIAAAAEBQFwARISBQMBAAIGCAF/AUGA1AQLB9EFIgZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAIGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAJGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQAvDGxsaHR0cF9hbGxvYwALBm1hbGxvYwAxC2xsaHR0cF9mcmVlAAwEZnJlZQAMD2xsaHR0cF9nZXRfdHlwZQANFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAOFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAPEWxsaHR0cF9nZXRfbWV0aG9kABAWbGxodHRwX2dldF9zdGF0dXNfY29kZQAREmxsaHR0cF9nZXRfdXBncmFkZQASDGxsaHR0cF9yZXNldAATDmxsaHR0cF9leGVjdXRlABQUbGxodHRwX3NldHRpbmdzX2luaXQAFQ1sbGh0dHBfZmluaXNoABYMbGxodHRwX3BhdXNlABcNbGxodHRwX3Jlc3VtZQAYG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAZEGxsaHR0cF9nZXRfZXJybm8AGhdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAbF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uABwUbGxodHRwX2dldF9lcnJvcl9wb3MAHRFsbGh0dHBfZXJybm9fbmFtZQAeEmxsaHR0cF9tZXRob2RfbmFtZQAfEmxsaHR0cF9zdGF0dXNfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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PgtBhwEMPQtBiAEMPAtBiQEMOwtBigEMOgtBiwEMOQtBjAEMOAtBjQEMNwtBjgEMNgtBjwEMNQtBkAEMNAtBkQEMMwtBkgEMMgtBkwEMMQtBlAEMMAtBlQEMLwtBlgEMLgtBlwEMLQtBmAEMLAtBmQEMKwtBmgEMKgtBmwEMKQtBnAEMKAtBnQEMJwtBngEMJgtBnwEMJQtBoAEMJAtBoQEMIwtBogEMIgtBowEMIQtBpAEMIAtBpQEMHwtBpgEMHgtBpwEMHQtBqAEMHAtBqQEMGwtBqgEMGgtBqwEMGQtBrAEMGAtBrQEMFwtBrgEMFgtBAQwVC0GvAQwUC0GwAQwTC0GxAQwSC0GzAQwRC0GyAQwQC0G0AQwPC0G1AQwOC0G2AQwNC0G3AQwMC0G4AQwLC0G5AQwKC0G6AQwJC0G7AQwIC0HGAQwHC0G8AQwGC0G9AQwFC0G+AQwEC0G/AQwDC0HAAQwCC0HCAQwBC0HBAQshAwNAAkACQAJAAkACQAJAAkACQAJAIAICfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgAgJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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iQEhAwykAgtBASABLQAAQd8ARw1nGiABQQFqIQEMXgtBigEhAyABIARGDaICIAIoAgAiACAEIAFraiEFIAEgAGtBAWohBgNAIAEtAAAgAEGMzwBqLQAARw1kIABBAUYN+gEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMogILQYsBIQMgASAERg2hAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGOzwBqLQAARw1kIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyiAgsgAkEANgIAIAZBAWohAUECDGULQYwBIQMgASAERg2gAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHwzwBqLQAARw1jIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyhAgsgAkEANgIAIAZBAWohAUEfDGQLQY0BIQMgASAERg2fAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHyzwBqLQAARw1iIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAygAgsgAkEANgIAIAZBAWohAUEJDGMLIAEgBEYEQEGOASEDDJ8CCwJAAkAgAS0AAEHJAGsOBwBiYmJiYgFiCyABQQFqIQFB+AAhAwyGAgsgAUEBaiEBQfkAIQMMhQILQY8BIQMgASAERg2dAiACKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEGRzwBqLQAARw1gIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyeAgsgAkEANgIAIAZBAWohAUEYDGELQZABIQMgASAERg2cAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGXzwBqLQAARw1fIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAydAgsgAkEANgIAIAZBAWohAUEXDGALQZEBIQMgASAERg2bAiACKAIAIgAgBCABa2ohBSABIABrQQZqIQYCQANAIAEtAAAgAEGazwBqLQAARw1eIABBBkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAycAgsgAkEANgIAIAZBAWohAUEV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JSIARQ0RIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMtAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0gIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMswELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0iIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMsgELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0OIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMsQELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0dIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMsAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0fIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMrwELIABBP0cNASABQQFqCyEBQQUhAwyUAQtBACEDIAJBADYCHCACIAE2AhQgAkH9EjYCECACQQc2AgwMrAELIAJBADYCHCACIAE2AhQgAkHcCDYCECACQQc2AgxBACEDDKsBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNByACQeUANgIcIAIgATYCFCACIAA2AgxBACEDDKoBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNFiACQdMANgIcIAIgATYCFCACIAA2AgxBACEDDKkBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNGCACQdIANgIcIAIgATYCFCACIAA2AgxBACEDDKgBCyACQQA2AhwgAiABNgIUIAJBxgo2AhAgAkEHNgIMQQAhAwynAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQMgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwymAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRIgAkHTADYCHCACIAE2AhQgAiAANgIMQQAhAwylAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRQgAkHSADYCHCACIAE2AhQgAiAANgIMQQAhAwykAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQAgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwyjAQtB1QAhAwyJAQsgAEEVRwRAIAJBADYCHCACIAE2AhQgAkG5DTYCECACQRo2AgxB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AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABB5ABrDvQDY2IAAWFhYWFhYQIDBAVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhBgcICQoLDA0OD2FhYWFhEGFhYWFhYWFhYWFhEWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYRITFBUWFxgZGhthYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2YTc4OTphYWFhYWFhYTthYWE8YWFhYT0+P2FhYWFhYWFhQGFhQWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYUJDREVGR0hJSktMTU5PUFFSU2FhYWFhYWFhVFVWV1hZWlthXF1hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFeYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhX2BhC0HhJw8LQaQhDwtByywPC0H+MQ8LQcAkDwtBqyQPC0GNKA8LQeImDwtBgDAPC0G5Lw8LQdckDwtB7x8PC0HhHw8LQfofDwtB8iAPC0GoLw8LQa4yDwtBiDAPC0HsJw8LQYIiDwtBjh0PC0HQLg8LQcojDwtBxTIPC0HfHA8LQdIcDwtBxCAPC0HXIA8LQaIfDwtB7S4PC0GrMA8LQdQlDwtBzC4PC0H6Lg8LQfwrDwtB0jAPC0HxHQ8LQbsgDwtB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CABB3AgLii1JbnZhbGlkIGNoYXIgaW4gdXJsIHF1ZXJ5AFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fYm9keQBDb250ZW50LUxlbmd0aCBvdmVyZmxvdwBDaHVuayBzaXplIG92ZXJmbG93AFJlc3BvbnNlIG92ZXJmbG93AEludmFsaWQgbWV0aG9kIGZvciBIVFRQL3gueCByZXF1ZXN0AEludmFsaWQgbWV0aG9kIGZvciBSVFNQL3gueCByZXF1ZXN0AEV4cGVjdGVkIFNPVVJDRSBtZXRob2QgZm9yIElDRS94LnggcmVxdWVzdABJbnZhbGlkIGNoYXIgaW4gdXJsIGZyYWdtZW50IHN0YXJ0AEV4cGVjdGVkIGRvdABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3N0YXR1cwBJbnZhbGlkIHJlc3BvbnNlIHN0YXR1cwBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBleHRlbnNpb25zAFVzZXIgY2FsbGJhY2sgZXJyb3IAYG9uX3Jlc2V0YCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfaGVhZGVyYCBjYWxsYmFjayBlcnJvcgBgb25fbWVzc2FnZV9iZWdpbmAgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2V4dGVuc2lvbl92YWx1ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3N0YXR1c19jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX3ZlcnNpb25fY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl91cmxfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX2hlYWRlcl92YWx1ZV9jb21wbGV0ZWAgY2FsbGJhY2sgZXJyb3IAYG9uX21lc3NhZ2VfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXRob2RfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9oZWFkZXJfZmllbGRfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19leHRlbnNpb25fbmFtZWAgY2FsbGJhY2sgZXJyb3IAVW5leHBlY3RlZCBjaGFyIGluIHVybCBzZXJ2ZXIASW52YWxpZCBoZWFkZXIgdmFsdWUgY2hhcgBJbnZhbGlkIGhlYWRlciBmaWVsZCBjaGFyAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fdmVyc2lvbgBJbnZhbGlkIG1pbm9yIHZlcnNpb24ASW52YWxpZCBtYWpvciB2ZXJzaW9uAEV4cGVjdGVkIHNwYWNlIGFmdGVyIHZlcnNpb24ARXhwZWN0ZWQgQ1JMRiBhZnRlciB2ZXJzaW9uAEludmFsaWQgSFRUUCB2ZXJzaW9uAEludmFsaWQgaGVhZGVyIHRva2VuAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fdXJsAEludmFsaWQgY2hhcmFjdGVycyBpbiB1cmwAVW5leHBlY3RlZCBzdGFydCBjaGFyIGluIHVybABEb3VibGUgQCBpbiB1cmwARW1wdHkgQ29udGVudC1MZW5ndGgASW52YWxpZCBjaGFyYWN0ZXIgaW4gQ29udGVudC1MZW5ndGgARHVwbGljYXRlIENvbnRlbnQtTGVuZ3RoAEludmFsaWQgY2hhciBpbiB1cmwgcGF0aABDb250ZW50LUxlbmd0aCBjYW4ndCBiZSBwcmVzZW50IHdpdGggVHJhbnNmZXItRW5jb2RpbmcASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgc2l6ZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl92YWx1ZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2NodW5rX2V4dGVuc2lvbl92YWx1ZQBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBleHRlbnNpb25zIHZhbHVlAE1pc3NpbmcgZXhwZWN0ZWQgTEYgYWZ0ZXIgaGVhZGVyIHZhbHVlAEludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYCBoZWFkZXIgdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBxdW90ZSB2YWx1ZQBJbnZhbGlkIGNoYXJhY3RlciBpbiBjaHVuayBleHRlbnNpb25zIHF1b3RlZCB2YWx1ZQBQYXVzZWQgYnkgb25faGVhZGVyc19jb21wbGV0ZQBJbnZhbGlkIEVPRiBzdGF0ZQBvbl9yZXNldCBwYXVzZQBvbl9jaHVua19oZWFkZXIgcGF1c2UAb25fbWVzc2FnZV9iZWdpbiBwYXVzZQBvbl9jaHVua19leHRlbnNpb25fdmFsdWUgcGF1c2UAb25fc3RhdHVzX2NvbXBsZXRlIHBhdXNlAG9uX3ZlcnNpb25fY29tcGxldGUgcGF1c2UAb25fdXJsX2NvbXBsZXRlIHBhdXNlAG9uX2NodW5rX2NvbXBsZXRlIHBhdXNlAG9uX2hlYWRlcl92YWx1ZV9jb21wbGV0ZSBwYXVzZQBvbl9tZXNzYWdlX2NvbXBsZXRlIHBhdXNlAG9uX21ldGhvZF9jb21wbGV0ZSBwYXVzZQBvbl9oZWFkZXJfZmllbGRfY29tcGxldGUgcGF1c2UAb25fY2h1bmtfZXh0ZW5zaW9uX25hbWUgcGF1c2UAVW5leHBlY3RlZCBzcGFjZSBhZnRlciBzdGFydCBsaW5lAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fY2h1bmtfZXh0ZW5zaW9uX25hbWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBuYW1lAFBhdXNlIG9uIENPTk5FQ1QvVXBncmFkZQBQYXVzZSBvbiBQUkkvVXBncmFkZQBFeHBlY3RlZCBIVFRQLzIgQ29ubmVjdGlvbiBQcmVmYWNlAFNwYW4gY2FsbGJhY2sgZXJyb3IgaW4gb25fbWV0aG9kAEV4cGVjdGVkIHNwYWNlIGFmdGVyIG1ldGhvZABTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2hlYWRlcl9maWVsZABQYXVzZWQASW52YWxpZCB3b3JkIGVuY291bnRlcmVkAEludmFsaWQgbWV0aG9kIGVuY291bnRlcmVkAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2NoZW1hAFJlcXVlc3QgaGFzIGludmFsaWQgYFRyYW5zZmVyLUVuY29kaW5nYABTV0lUQ0hfUFJPWFkAVVNFX1BST1hZAE1LQUNUSVZJVFkAVU5QUk9DRVNTQUJMRV9FTlRJVFkAQ09QWQBNT1ZFRF9QRVJNQU5FTlRMWQBUT09fRUFSTFkATk9USUZZAEZBSUxFRF9ERVBFTkRFTkNZAEJBRF9HQVRFV0FZAFBMQVkAUFVUAENIRUNLT1VUAEdBVEVXQVlfVElNRU9VVABSRVFVRVNUX1RJTUVPVVQATkVUV09SS19DT05ORUNUX1RJTUVPVVQAQ09OTkVDVElPTl9USU1FT1VUAExPR0lOX1RJTUVPVVQATkVUV09SS19SRUFEX1RJTUVPVVQAUE9TVABNSVNESVJFQ1RFRF9SRVFVRVNUAENMSUVOVF9DTE9TRURfUkVRVUVTVABDTElFTlRfQ0xPU0VEX0xPQURfQkFMQU5DRURfUkVRVUVTVABCQURfUkVRVUVTVABIVFRQX1JFUVVFU1RfU0VOVF9UT19IVFRQU19QT1JUAFJFUE9SVABJTV9BX1RFQVBPVABSRVNFVF9DT05URU5UAE5PX0NPTlRFTlQAUEFSVElBTF9DT05URU5UAEhQRV9JTlZBTElEX0NPTlNUQU5UAEhQRV9DQl9SRVNFVABHRVQASFBFX1NUUklDVABDT05GTElDVABURU1QT1JBUllfUkVESVJFQ1QAUEVSTUFORU5UX1JFRElSRUNUAENPTk5FQ1QATVVMVElfU1RBVFVTAEhQRV9JTlZBTElEX1NUQVRVUwBUT09fTUFOWV9SRVFVRVNUUwBFQVJMWV9ISU5UUwBVTkFWQUlMQUJMRV9GT1JfTEVHQUxfUkVBU09OUwBPUFRJT05TAFNXSVRDSElOR19QUk9UT0NPTFMAVkFSSUFOVF9BTFNPX05FR09USUFURVMATVVMVElQTEVfQ0hPSUNFUwBJTlRFUk5BTF9TRVJWRVJfRVJST1IAV0VCX1NFUlZFUl9VTktOT1dOX0VSUk9SAFJBSUxHVU5fRVJST1IASURFTlRJVFlfUFJPVklERVJfQVVUSEVOVElDQVRJT05fRVJST1IAU1NMX0NFUlRJRklDQVRFX0VSUk9SAElOVkFMSURfWF9GT1JXQVJERURfRk9SAFNFVF9QQVJBTUVURVIAR0VUX1BBUkFNRVRFUgBIUEVfVVNFUgBTRUVfT1RIRVIASFBFX0NCX0NIVU5LX0hFQURFUgBNS0NBTEVOREFSAFNFVFVQAFdFQl9TRVJWRVJfSVNfRE9XTgBURUFSRE9XTgBIUEVfQ0xPU0VEX0NPTk5FQ1RJT04ASEVVUklTVElDX0VYUElSQVRJT04ARElTQ09OTkVDVEVEX09QRVJBVElPTgBOT05fQVVUSE9SSVRBVElWRV9JTkZPUk1BVElPTgBIUEVfSU5WQUxJRF9WRVJTSU9OAEhQRV9DQl9NRVNTQUdFX0JFR0lOAFNJVEVfSVNfRlJPWkVOAEhQRV9JTlZBTElEX0hFQURFUl9UT0tFTgBJTlZBTElEX1RPS0VOAEZPUkJJRERFTgBFTkhBTkNFX1lPVVJfQ0FMTQBIUEVfSU5WQUxJRF9VUkwAQkxPQ0tFRF9CWV9QQVJFTlRBTF9DT05UUk9MAE1LQ09MAEFDTABIUEVfSU5URVJOQUwAUkVRVUVTVF9IRUFERVJfRklFTERTX1RPT19MQVJHRV9VTk9GRklDSUFMAEhQRV9PSwBVTkxJTksAVU5MT0NLAFBSSQBSRVRSWV9XSVRIAEhQRV9JTlZBTElEX0NPTlRFTlRfTEVOR1RIAEhQRV9VTkVYUEVDVEVEX0NPTlRFTlRfTEVOR1RIAEZMVVNIAFBST1BQQVRDSABNLVNFQVJDSABVUklfVE9PX0xPTkcAUFJPQ0VTU0lORwBNSVNDRUxMQU5FT1VTX1BFUlNJU1RFTlRfV0FSTklORwBNSVNDRUxMQU5FT1VTX1dBUk5JTkcASFBFX0lOVkFMSURfVFJBTlNGRVJfRU5DT0RJTkcARXhwZWN0ZWQgQ1JMRgBIUEVfSU5WQUxJRF9DSFVOS19TSVpFAE1PVkUAQ09OVElOVUUASFBFX0NCX1NUQVRVU19DT01QTEVURQBIUEVfQ0JfSEVBREVSU19DT01QTEVURQBIUEVfQ0JfVkVSU0lPTl9DT01QTEVURQBIUEVfQ0JfVVJMX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19DT01QTEVURQBIUEVfQ0JfSEVBREVSX1ZBTFVFX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19FWFRFTlNJT05fVkFMVUVfQ09NUExFVEUASFBFX0NCX0NIVU5LX0VYVEVOU0lPTl9OQU1FX0NPTVBMRVRFAEhQRV9DQl9NRVNTQUdFX0NPTVBMRVRFAEhQRV9DQl9NRVRIT0RfQ09NUExFVEUASFBFX0NCX0hFQURFUl9GSUVMRF9DT01QTEVURQBERUxFVEUASFBFX0lOVkFMSURfRU9GX1NUQVRFAElOVkFMSURfU1NMX0NFUlRJRklDQVRFAFBBVVNFAE5PX1JFU1BPTlNFAFVOU1VQUE9SVEVEX01FRElBX1RZUEUAR09ORQBOT1RfQUNDRVBUQUJMRQBTRVJWSUNFX1VOQVZBSUxBQkxFAFJBTkdFX05PVF9TQVRJU0ZJQUJMRQBPUklHSU5fSVNfVU5SRUFDSEFCTEUAUkVTUE9OU0VfSVNfU1RBTEUAUFVSR0UATUVSR0UAUkVRVUVTVF9IRUFERVJfRklFTERTX1RPT19MQVJHRQBSRVFVRVNUX0hFQURFUl9UT09fTEFSR0UAUEFZTE9BRF9UT09fTEFSR0UASU5TVUZGSUNJRU5UX1NUT1JBR0UASFBFX1BBVVNFRF9VUEdSQURFAEhQRV9QQVVTRURfSDJfVVBHUkFERQBTT1VSQ0UAQU5OT1VOQ0UAVFJBQ0UASFBFX1VORVhQRUNURURfU1BBQ0UAREVTQ1JJQkUAVU5TVUJTQ1JJQkUAUkVDT1JEAEhQRV9JTlZBTElEX01FVEhPRABOT1RfRk9VTkQAUFJPUEZJTkQAVU5CSU5EAFJFQklORABVTkFVVEhPUklaRUQATUVUSE9EX05PVF9BTExPV0VEAEhUVFBfVkVSU0lPTl9OT1RfU1VQUE9SVEVEAEFMUkVBRFlfUkVQT1JURUQAQUNDRVBURUQATk9UX0lNUExFTUVOVEVEAExPT1BfREVURUNURUQASFBFX0NSX0VYUEVDVEVEAEhQRV9MRl9FWFBFQ1RFRABDUkVBVEVEAElNX1VTRUQASFBFX1BBVVNFRABUSU1FT1VUX09DQ1VSRUQAUEFZTUVOVF9SRVFVSVJFRABQUkVDT05ESVRJT05fUkVRVUlSRUQAUFJPWFlfQVVUSEVOVElDQVRJT05fUkVRVUlSRUQATkVUV09SS19BVVRIRU5USUNBVElPTl9SRVFVSVJFRABMRU5HVEhfUkVRVUlSRUQAU1NMX0NFUlRJRklDQVRFX1JFUVVJUkVEAFVQR1JBREVfUkVRVUlSRUQAUEFHRV9FWFBJUkVEAFBSRUNPTkRJVElPTl9GQUlMRUQARVhQRUNUQVRJT05fRkFJTEVEAFJFVkFMSURBVElPTl9GQUlMRUQAU1NMX0hBTkRTSEFLRV9GQUlMRUQATE9DS0VEAFRSQU5TRk9STUFUSU9OX0FQUExJRUQATk9UX01PRElGSUVEAE5PVF9FWFRFTkRFRABCQU5EV0lEVEhfTElNSVRfRVhDRUVERUQAU0lURV9JU19PVkVSTE9BREVEAEhFQUQARXhwZWN0ZWQgSFRUUC8AAF4TAAAmEwAAMBAAAPAXAACdEwAAFRIAADkXAADwEgAAChAAAHUSAACtEgAAghMAAE8UAAB/EAAAoBUAACMUAACJEgAAixQAAE0VAADUEQAAzxQAABAYAADJFgAA3BYAAMERAADgFwAAuxQAAHQUAAB8FQAA5RQAAAgXAAAfEAAAZRUAAKMUAAAoFQAAAhUAAJkVAAAsEAAAixkAAE8PAADUDgAAahAAAM4QAAACFwAAiQ4AAG4TAAAcEwAAZhQAAFYXAADBEwAAzRMAAGwTAABoFwAAZhcAAF8XAAAiEwAAzg8AAGkOAADYDgAAYxYAAMsTAACqDgAAKBcAACYXAADFEwAAXRYAAOgRAABnEwAAZRMAAPIWAABzEwAAHRcAAPkWAADzEQAAzw4AAM4VAAAMEgAAsxEAAKURAABhEAAAMhcAALsTAEH5NQsBAQBBkDYL4AEBAQIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB/TcLAQEAQZE4C14CAwICAgICAAACAgACAgACAgICAgICAgICAAQAAAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgACAEH9OQsBAQBBkToLXgIAAgICAgIAAAICAAICAAICAgICAgICAgIAAwAEAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgIAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgACAAIAQfA7Cw1sb3NlZWVwLWFsaXZlAEGJPAsBAQBBoDwL4AEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBBiT4LAQEAQaA+C+cBAQEBAQEBAQEBAQEBAgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQFjaHVua2VkAEGwwAALXwEBAAEBAQEBAAABAQABAQABAQEBAQEBAQEBAAAAAAAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQABAEGQwgALIWVjdGlvbmVudC1sZW5ndGhvbnJveHktY29ubmVjdGlvbgBBwMIACy1yYW5zZmVyLWVuY29kaW5ncGdyYWRlDQoNCg0KU00NCg0KVFRQL0NFL1RTUC8AQfnCAAsFAQIAAQMAQZDDAAvgAQQBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAEH5xAALBQECAAEDAEGQxQAL4AEEAQEFAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB+cYACwQBAAABAEGRxwAL3wEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAEH6yAALBAEAAAIAQZDJAAtfAwQAAAQEBAQEBAQEBAQEBQQEBAQEBAQEBAQEBAAEAAYHBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQABAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAQAQfrKAAsEAQAAAQBBkMsACwEBAEGqywALQQIAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwAAAAAAAAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAEH6zAALBAEAAAEAQZDNAAsBAQBBms0ACwYCAAAAAAIAQbHNAAs6AwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBB8M4AC5YBTk9VTkNFRUNLT1VUTkVDVEVURUNSSUJFTFVTSEVURUFEU0VBUkNIUkdFQ1RJVklUWUxFTkRBUlZFT1RJRllQVElPTlNDSFNFQVlTVEFUQ0hHRU9SRElSRUNUT1JUUkNIUEFSQU1FVEVSVVJDRUJTQ1JJQkVBUkRPV05BQ0VJTkROS0NLVUJTQ1JJQkVIVFRQL0FEVFAv", "base64");
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/llhttp_simd-wasm.js
var require_llhttp_simd_wasm = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/llhttp/llhttp_simd-wasm.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Buffer: Buffer2 } = require("buffer");
    module2.exports = Buffer2.from("AGFzbQEAAAABJwdgAX8Bf2ADf39/AX9gAX8AYAJ/fwBgBH9/f38Bf2AAAGADf39/AALLAQgDZW52GHdhc21fb25faGVhZGVyc19jb21wbGV0ZQAEA2VudhV3YXNtX29uX21lc3NhZ2VfYmVnaW4AAANlbnYLd2FzbV9vbl91cmwAAQNlbnYOd2FzbV9vbl9zdGF0dXMAAQNlbnYUd2FzbV9vbl9oZWFkZXJfZmllbGQAAQNlbnYUd2FzbV9vbl9oZWFkZXJfdmFsdWUAAQNlbnYMd2FzbV9vbl9ib2R5AAEDZW52GHdhc21fb25fbWVzc2FnZV9jb21wbGV0ZQAAAy0sBQYAAAIAAAAAAAACAQIAAgICAAADAAAAAAMDAwMBAQEBAQEBAQEAAAIAAAAEBQFwARISBQMBAAIGCAF/AUGA1AQLB9EFIgZtZW1vcnkCAAtfaW5pdGlhbGl6ZQAIGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtsbGh0dHBfaW5pdAAJGGxsaHR0cF9zaG91bGRfa2VlcF9hbGl2ZQAvDGxsaHR0cF9hbGxvYwALBm1hbGxvYwAxC2xsaHR0cF9mcmVlAAwEZnJlZQAMD2xsaHR0cF9nZXRfdHlwZQANFWxsaHR0cF9nZXRfaHR0cF9tYWpvcgAOFWxsaHR0cF9nZXRfaHR0cF9taW5vcgAPEWxsaHR0cF9nZXRfbWV0aG9kABAWbGxodHRwX2dldF9zdGF0dXNfY29kZQAREmxsaHR0cF9nZXRfdXBncmFkZQASDGxsaHR0cF9yZXNldAATDmxsaHR0cF9leGVjdXRlABQUbGxodHRwX3NldHRpbmdzX2luaXQAFQ1sbGh0dHBfZmluaXNoABYMbGxodHRwX3BhdXNlABcNbGxodHRwX3Jlc3VtZQAYG2xsaHR0cF9yZXN1bWVfYWZ0ZXJfdXBncmFkZQAZEGxsaHR0cF9nZXRfZXJybm8AGhdsbGh0dHBfZ2V0X2Vycm9yX3JlYXNvbgAbF2xsaHR0cF9zZXRfZXJyb3JfcmVhc29uABwUbGxodHRwX2dldF9lcnJvcl9wb3MAHRFsbGh0dHBfZXJybm9fbmFtZQAeEmxsaHR0cF9tZXRob2RfbmFtZQAfEmxsaHR0cF9zdGF0dXNfbmFtZQAgGmxsaHR0cF9zZXRfbGVu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PgtBhwEMPQtBiAEMPAtBiQEMOwtBigEMOgtBiwEMOQtBjAEMOAtBjQEMNwtBjgEMNgtBjwEMNQtBkAEMNAtBkQEMMwtBkgEMMgtBkwEMMQtBlAEMMAtBlQEMLwtBlgEMLgtBlwEMLQtBmAEMLAtBmQEMKwtBmgEMKgtBmwEMKQtBnAEMKAtBnQEMJwtBngEMJgtBnwEMJQtBoAEMJAtBoQEMIwtBogEMIgtBowEMIQtBpAEMIAtBpQEMHwtBpgEMHgtBpwEMHQtBqAEMHAtBqQEMGwtBqgEMGgtBqwEMGQtBrAEMGAtBrQEMFwtBrgEMFgtBAQwVC0GvAQwUC0GwAQwTC0GxAQwSC0GzAQwRC0GyAQwQC0G0AQwPC0G1AQwOC0G2AQwNC0G3AQwMC0G4AQwLC0G5AQwKC0G6AQwJC0G7AQwIC0HGAQwHC0G8AQwGC0G9AQwFC0G+AQwEC0G/AQwDC0HAAQwCC0HCAQwBC0HBAQshAwNAAkACQAJAAkACQAJAAkACQAJAIAICfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgAgJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACfwJAAkACfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAC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iQEhAwykAgtBASABLQAAQd8ARw1nGiABQQFqIQEMXgtBigEhAyABIARGDaICIAIoAgAiACAEIAFraiEFIAEgAGtBAWohBgNAIAEtAAAgAEGMzwBqLQAARw1kIABBAUYN+gEgAEEBaiEAIAQgAUEBaiIBRw0ACyACIAU2AgAMogILQYsBIQMgASAERg2hAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGOzwBqLQAARw1kIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyiAgsgAkEANgIAIAZBAWohAUECDGULQYwBIQMgASAERg2gAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHwzwBqLQAARw1jIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyhAgsgAkEANgIAIAZBAWohAUEfDGQLQY0BIQMgASAERg2fAiACKAIAIgAgBCABa2ohBSABIABrQQFqIQYCQANAIAEtAAAgAEHyzwBqLQAARw1iIABBAUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAygAgsgAkEANgIAIAZBAWohAUEJDGMLIAEgBEYEQEGOASEDDJ8CCwJAAkAgAS0AAEHJAGsOBwBiYmJiYgFiCyABQQFqIQFB+AAhAwyGAgsgAUEBaiEBQfkAIQMMhQILQY8BIQMgASAERg2dAiACKAIAIgAgBCABa2ohBSABIABrQQVqIQYCQANAIAEtAAAgAEGRzwBqLQAARw1gIABBBUYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAyeAgsgAkEANgIAIAZBAWohAUEYDGELQZABIQMgASAERg2cAiACKAIAIgAgBCABa2ohBSABIABrQQJqIQYCQANAIAEtAAAgAEGXzwBqLQAARw1fIABBAkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAydAgsgAkEANgIAIAZBAWohAUEXDGALQZEBIQMgASAERg2bAiACKAIAIgAgBCABa2ohBSABIABrQQZqIQYCQANAIAEtAAAgAEGazwBqLQAARw1eIABBBkYNASAAQQFqIQAgBCABQQFqIgFHDQALIAIgBTYCAAycAgsgAkEANgIAIAZBAWohAUEV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JSIARQ0RIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMtAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0gIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMswELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0iIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMsgELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0OIAJB5QA2AhwgAiABNgIUIAIgADYCDEEAIQMMsQELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0dIAJB0wA2AhwgAiABNgIUIAIgADYCDEEAIQMMsAELIAIoAgQhACACQQA2AgQgAiAAIAEQJSIARQ0fIAJB0gA2AhwgAiABNgIUIAIgADYCDEEAIQMMrwELIABBP0cNASABQQFqCyEBQQUhAwyUAQtBACEDIAJBADYCHCACIAE2AhQgAkH9EjYCECACQQc2AgwMrAELIAJBADYCHCACIAE2AhQgAkHcCDYCECACQQc2AgxBACEDDKsBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNByACQeUANgIcIAIgATYCFCACIAA2AgxBACEDDKoBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNFiACQdMANgIcIAIgATYCFCACIAA2AgxBACEDDKkBCyACKAIEIQAgAkEANgIEIAIgACABECUiAEUNGCACQdIANgIcIAIgATYCFCACIAA2AgxBACEDDKgBCyACQQA2AhwgAiABNgIUIAJBxgo2AhAgAkEHNgIMQQAhAwynAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQMgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwymAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRIgAkHTADYCHCACIAE2AhQgAiAANgIMQQAhAwylAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDRQgAkHSADYCHCACIAE2AhQgAiAANgIMQQAhAwykAQsgAigCBCEAIAJBADYCBCACIAAgARAlIgBFDQAgAkHlADYCHCACIAE2AhQgAiAANgIMQQAhAwyjAQtB1QAhAwyJAQsgAEEVRwRAIAJBADYCHCACIAE2AhQgAkG5DTYCECACQRo2AgxB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AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIABB5ABrDvQDY2IAAWFhYWFhYQIDBAVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhBgcICQoLDA0OD2FhYWFhEGFhYWFhYWFhYWFhEWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYRITFBUWFxgZGhthYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2YTc4OTphYWFhYWFhYTthYWE8YWFhYT0+P2FhYWFhYWFhQGFhQWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYUJDREVGR0hJSktMTU5PUFFSU2FhYWFhYWFhVFVWV1hZWlthXF1hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFeYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhX2BhC0HhJw8LQaQhDwtByywPC0H+MQ8LQcAkDwtBqyQPC0GNKA8LQeImDwtBgDAPC0G5Lw8LQdckDwtB7x8PC0HhHw8LQfofDwtB8iAPC0GoLw8LQa4yDwtBiDAPC0HsJw8LQYIiDwtBjh0PC0HQLg8LQcojDwtBxTIPC0HfHA8LQdIcDwtBxCAPC0HXIA8LQaIfDwtB7S4PC0GrMA8LQdQlDwtBzC4PC0H6Lg8LQfwrDwtB0jAPC0HxHQ8LQbsgDwtB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AAADAEGUCAsFBAAAAAUAQaQICwkGAAAABwAAAAgAQdwIC4otSW52YWxpZCBjaGFyIGluIHVybCBxdWVyeQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2JvZHkAQ29udGVudC1MZW5ndGggb3ZlcmZsb3cAQ2h1bmsgc2l6ZSBvdmVyZmxvdwBSZXNwb25zZSBvdmVyZmxvdwBJbnZhbGlkIG1ldGhvZCBmb3IgSFRUUC94LnggcmVxdWVzdABJbnZhbGlkIG1ldGhvZCBmb3IgUlRTUC94LnggcmVxdWVzdABFeHBlY3RlZCBTT1VSQ0UgbWV0aG9kIGZvciBJQ0UveC54IHJlcXVlc3QASW52YWxpZCBjaGFyIGluIHVybCBmcmFnbWVudCBzdGFydABFeHBlY3RlZCBkb3QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9zdGF0dXMASW52YWxpZCByZXNwb25zZSBzdGF0dXMASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucwBVc2VyIGNhbGxiYWNrIGVycm9yAGBvbl9yZXNldGAgY2FsbGJhY2sgZXJyb3IAYG9uX2NodW5rX2hlYWRlcmAgY2FsbGJhY2sgZXJyb3IAYG9uX21lc3NhZ2VfYmVnaW5gIGNhbGxiYWNrIGVycm9yAGBvbl9jaHVua19leHRlbnNpb25fdmFsdWVgIGNhbGxiYWNrIGVycm9yAGBvbl9zdGF0dXNfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl92ZXJzaW9uX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fdXJsX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9oZWFkZXJfdmFsdWVfY29tcGxldGVgIGNhbGxiYWNrIGVycm9yAGBvbl9tZXNzYWdlX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fbWV0aG9kX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25faGVhZGVyX2ZpZWxkX2NvbXBsZXRlYCBjYWxsYmFjayBlcnJvcgBgb25fY2h1bmtfZXh0ZW5zaW9uX25hbWVgIGNhbGxiYWNrIGVycm9yAFVuZXhwZWN0ZWQgY2hhciBpbiB1cmwgc2VydmVyAEludmFsaWQgaGVhZGVyIHZhbHVlIGNoYXIASW52YWxpZCBoZWFkZXIgZmllbGQgY2hhcgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3ZlcnNpb24ASW52YWxpZCBtaW5vciB2ZXJzaW9uAEludmFsaWQgbWFqb3IgdmVyc2lvbgBFeHBlY3RlZCBzcGFjZSBhZnRlciB2ZXJzaW9uAEV4cGVjdGVkIENSTEYgYWZ0ZXIgdmVyc2lvbgBJbnZhbGlkIEhUVFAgdmVyc2lvbgBJbnZhbGlkIGhlYWRlciB0b2tlbgBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX3VybABJbnZhbGlkIGNoYXJhY3RlcnMgaW4gdXJsAFVuZXhwZWN0ZWQgc3RhcnQgY2hhciBpbiB1cmwARG91YmxlIEAgaW4gdXJsAEVtcHR5IENvbnRlbnQtTGVuZ3RoAEludmFsaWQgY2hhcmFjdGVyIGluIENvbnRlbnQtTGVuZ3RoAER1cGxpY2F0ZSBDb250ZW50LUxlbmd0aABJbnZhbGlkIGNoYXIgaW4gdXJsIHBhdGgAQ29udGVudC1MZW5ndGggY2FuJ3QgYmUgcHJlc2VudCB3aXRoIFRyYW5zZmVyLUVuY29kaW5nAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIHNpemUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfdmFsdWUAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9jaHVua19leHRlbnNpb25fdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyB2YWx1ZQBNaXNzaW5nIGV4cGVjdGVkIExGIGFmdGVyIGhlYWRlciB2YWx1ZQBJbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AgaGVhZGVyIHZhbHVlAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMgcXVvdGUgdmFsdWUASW52YWxpZCBjaGFyYWN0ZXIgaW4gY2h1bmsgZXh0ZW5zaW9ucyBxdW90ZWQgdmFsdWUAUGF1c2VkIGJ5IG9uX2hlYWRlcnNfY29tcGxldGUASW52YWxpZCBFT0Ygc3RhdGUAb25fcmVzZXQgcGF1c2UAb25fY2h1bmtfaGVhZGVyIHBhdXNlAG9uX21lc3NhZ2VfYmVnaW4gcGF1c2UAb25fY2h1bmtfZXh0ZW5zaW9uX3ZhbHVlIHBhdXNlAG9uX3N0YXR1c19jb21wbGV0ZSBwYXVzZQBvbl92ZXJzaW9uX2NvbXBsZXRlIHBhdXNlAG9uX3VybF9jb21wbGV0ZSBwYXVzZQBvbl9jaHVua19jb21wbGV0ZSBwYXVzZQBvbl9oZWFkZXJfdmFsdWVfY29tcGxldGUgcGF1c2UAb25fbWVzc2FnZV9jb21wbGV0ZSBwYXVzZQBvbl9tZXRob2RfY29tcGxldGUgcGF1c2UAb25faGVhZGVyX2ZpZWxkX2NvbXBsZXRlIHBhdXNlAG9uX2NodW5rX2V4dGVuc2lvbl9uYW1lIHBhdXNlAFVuZXhwZWN0ZWQgc3BhY2UgYWZ0ZXIgc3RhcnQgbGluZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX2NodW5rX2V4dGVuc2lvbl9uYW1lAEludmFsaWQgY2hhcmFjdGVyIGluIGNodW5rIGV4dGVuc2lvbnMgbmFtZQBQYXVzZSBvbiBDT05ORUNUL1VwZ3JhZGUAUGF1c2Ugb24gUFJJL1VwZ3JhZGUARXhwZWN0ZWQgSFRUUC8yIENvbm5lY3Rpb24gUHJlZmFjZQBTcGFuIGNhbGxiYWNrIGVycm9yIGluIG9uX21ldGhvZABFeHBlY3RlZCBzcGFjZSBhZnRlciBtZXRob2QAU3BhbiBjYWxsYmFjayBlcnJvciBpbiBvbl9oZWFkZXJfZmllbGQAUGF1c2VkAEludmFsaWQgd29yZCBlbmNvdW50ZXJlZABJbnZhbGlkIG1ldGhvZCBlbmNvdW50ZXJlZABVbmV4cGVjdGVkIGNoYXIgaW4gdXJsIHNjaGVtYQBSZXF1ZXN0IGhhcyBpbnZhbGlkIGBUcmFuc2Zlci1FbmNvZGluZ2AAU1dJVENIX1BST1hZAFVTRV9QUk9YWQBNS0FDVElWSVRZAFVOUFJPQ0VTU0FCTEVfRU5USVRZAENPUFkATU9WRURfUEVSTUFORU5UTFkAVE9PX0VBUkxZAE5PVElGWQBGQUlMRURfREVQRU5ERU5DWQBCQURfR0FURVdBWQBQTEFZAFBVVABDSEVDS09VVABHQVRFV0FZX1RJTUVPVVQAUkVRVUVTVF9USU1FT1VUAE5FVFdPUktfQ09OTkVDVF9USU1FT1VUAENPTk5FQ1RJT05fVElNRU9VVABMT0dJTl9USU1FT1VUAE5FVFdPUktfUkVBRF9USU1FT1VUAFBPU1QATUlTRElSRUNURURfUkVRVUVTVABDTElFTlRfQ0xPU0VEX1JFUVVFU1QAQ0xJRU5UX0NMT1NFRF9MT0FEX0JBTEFOQ0VEX1JFUVVFU1QAQkFEX1JFUVVFU1QASFRUUF9SRVFVRVNUX1NFTlRfVE9fSFRUUFNfUE9SVABSRVBPUlQASU1fQV9URUFQT1QAUkVTRVRfQ09OVEVOVABOT19DT05URU5UAFBBUlRJQUxfQ09OVEVOVABIUEVfSU5WQUxJRF9DT05TVEFOVABIUEVfQ0JfUkVTRVQAR0VUAEhQRV9TVFJJQ1QAQ09ORkxJQ1QAVEVNUE9SQVJZX1JFRElSRUNUAFBFUk1BTkVOVF9SRURJUkVDVABDT05ORUNUAE1VTFRJX1NUQVRVUwBIUEVfSU5WQUxJRF9TVEFUVVMAVE9PX01BTllfUkVRVUVTVFMARUFSTFlfSElOVFMAVU5BVkFJTEFCTEVfRk9SX0xFR0FMX1JFQVNPTlMAT1BUSU9OUwBTV0lUQ0hJTkdfUFJPVE9DT0xTAFZBUklBTlRfQUxTT19ORUdPVElBVEVTAE1VTFRJUExFX0NIT0lDRVMASU5URVJOQUxfU0VSVkVSX0VSUk9SAFdFQl9TRVJWRVJfVU5LTk9XTl9FUlJPUgBSQUlMR1VOX0VSUk9SAElERU5USVRZX1BST1ZJREVSX0FVVEhFTlRJQ0FUSU9OX0VSUk9SAFNTTF9DRVJUSUZJQ0FURV9FUlJPUgBJTlZBTElEX1hfRk9SV0FSREVEX0ZPUgBTRVRfUEFSQU1FVEVSAEdFVF9QQVJBTUVURVIASFBFX1VTRVIAU0VFX09USEVSAEhQRV9DQl9DSFVOS19IRUFERVIATUtDQUxFTkRBUgBTRVRVUABXRUJfU0VSVkVSX0lTX0RPV04AVEVBUkRPV04ASFBFX0NMT1NFRF9DT05ORUNUSU9OAEhFVVJJU1RJQ19FWFBJUkFUSU9OAERJU0NPTk5FQ1RFRF9PUEVSQVRJT04ATk9OX0FVVEhPUklUQVRJVkVfSU5GT1JNQVRJT04ASFBFX0lOVkFMSURfVkVSU0lPTgBIUEVfQ0JfTUVTU0FHRV9CRUdJTgBTSVRFX0lTX0ZST1pFTgBIUEVfSU5WQUxJRF9IRUFERVJfVE9LRU4ASU5WQUxJRF9UT0tFTgBGT1JCSURERU4ARU5IQU5DRV9ZT1VSX0NBTE0ASFBFX0lOVkFMSURfVVJMAEJMT0NLRURfQllfUEFSRU5UQUxfQ09OVFJPTABNS0NPTABBQ0wASFBFX0lOVEVSTkFMAFJFUVVFU1RfSEVBREVSX0ZJRUxEU19UT09fTEFSR0VfVU5PRkZJQ0lBTABIUEVfT0sAVU5MSU5LAFVOTE9DSwBQUkkAUkVUUllfV0lUSABIUEVfSU5WQUxJRF9DT05URU5UX0xFTkdUSABIUEVfVU5FWFBFQ1RFRF9DT05URU5UX0xFTkdUSABGTFVTSABQUk9QUEFUQ0gATS1TRUFSQ0gAVVJJX1RPT19MT05HAFBST0NFU1NJTkcATUlTQ0VMTEFORU9VU19QRVJTSVNURU5UX1dBUk5JTkcATUlTQ0VMTEFORU9VU19XQVJOSU5HAEhQRV9JTlZBTElEX1RSQU5TRkVSX0VOQ09ESU5HAEV4cGVjdGVkIENSTEYASFBFX0lOVkFMSURfQ0hVTktfU0laRQBNT1ZFAENPTlRJTlVFAEhQRV9DQl9TVEFUVVNfQ09NUExFVEUASFBFX0NCX0hFQURFUlNfQ09NUExFVEUASFBFX0NCX1ZFUlNJT05fQ09NUExFVEUASFBFX0NCX1VSTF9DT01QTEVURQBIUEVfQ0JfQ0hVTktfQ09NUExFVEUASFBFX0NCX0hFQURFUl9WQUxVRV9DT01QTEVURQBIUEVfQ0JfQ0hVTktfRVhURU5TSU9OX1ZBTFVFX0NPTVBMRVRFAEhQRV9DQl9DSFVOS19FWFRFTlNJT05fTkFNRV9DT01QTEVURQBIUEVfQ0JfTUVTU0FHRV9DT01QTEVURQBIUEVfQ0JfTUVUSE9EX0NPTVBMRVRFAEhQRV9DQl9IRUFERVJfRklFTERfQ09NUExFVEUAREVMRVRFAEhQRV9JTlZBTElEX0VPRl9TVEFURQBJTlZBTElEX1NTTF9DRVJUSUZJQ0FURQBQQVVTRQBOT19SRVNQT05TRQBVTlNVUFBPUlRFRF9NRURJQV9UWVBFAEdPTkUATk9UX0FDQ0VQVEFCTEUAU0VSVklDRV9VTkFWQUlMQUJMRQBSQU5HRV9OT1RfU0FUSVNGSUFCTEUAT1JJR0lOX0lTX1VOUkVBQ0hBQkxFAFJFU1BPTlNFX0lTX1NUQUxFAFBVUkdFAE1FUkdFAFJFUVVFU1RfSEVBREVSX0ZJRUxEU19UT09fTEFSR0UAUkVRVUVTVF9IRUFERVJfVE9PX0xBUkdFAFBBWUxPQURfVE9PX0xBUkdFAElOU1VGRklDSUVOVF9TVE9SQUdFAEhQRV9QQVVTRURfVVBHUkFERQBIUEVfUEFVU0VEX0gyX1VQR1JBREUAU09VUkNFAEFOTk9VTkNFAFRSQUNFAEhQRV9VTkVYUEVDVEVEX1NQQUNFAERFU0NSSUJFAFVOU1VCU0NSSUJFAFJFQ09SRABIUEVfSU5WQUxJRF9NRVRIT0QATk9UX0ZPVU5EAFBST1BGSU5EAFVOQklORABSRUJJTkQAVU5BVVRIT1JJWkVEAE1FVEhPRF9OT1RfQUxMT1dFRABIVFRQX1ZFUlNJT05fTk9UX1NVUFBPUlRFRABBTFJFQURZX1JFUE9SVEVEAEFDQ0VQVEVEAE5PVF9JTVBMRU1FTlRFRABMT09QX0RFVEVDVEVEAEhQRV9DUl9FWFBFQ1RFRABIUEVfTEZfRVhQRUNURUQAQ1JFQVRFRABJTV9VU0VEAEhQRV9QQVVTRUQAVElNRU9VVF9PQ0NVUkVEAFBBWU1FTlRfUkVRVUlSRUQAUFJFQ09ORElUSU9OX1JFUVVJUkVEAFBST1hZX0FVVEhFTlRJQ0FUSU9OX1JFUVVJUkVEAE5FVFdPUktfQVVUSEVOVElDQVRJT05fUkVRVUlSRUQATEVOR1RIX1JFUVVJUkVEAFNTTF9DRVJUSUZJQ0FURV9SRVFVSVJFRABVUEdSQURFX1JFUVVJUkVEAFBBR0VfRVhQSVJFRABQUkVDT05ESVRJT05fRkFJTEVEAEVYUEVDVEFUSU9OX0ZBSUxFRABSRVZBTElEQVRJT05fRkFJTEVEAFNTTF9IQU5EU0hBS0VfRkFJTEVEAExPQ0tFRABUUkFOU0ZPUk1BVElPTl9BUFBMSUVEAE5PVF9NT0RJRklFRABOT1RfRVhURU5ERUQAQkFORFdJRFRIX0xJTUlUX0VYQ0VFREVEAFNJVEVfSVNfT1ZFUkxPQURFRABIRUFEAEV4cGVjdGVkIEhUVFAvAABeEwAAJhMAADAQAADwFwAAnRMAABUSAAA5FwAA8BIAAAoQAAB1EgAArRIAAIITAABPFAAAfxAAAKAVAAAjFAAAiRIAAIsUAABNFQAA1BEAAM8UAAAQGAAAyRYAANwWAADBEQAA4BcAALsUAAB0FAAAfBUAAOUUAAAIFwAAHxAAAGUVAACjFAAAKBUAAAIVAACZFQAALBAAAIsZAABPDwAA1A4AAGoQAADOEAAAAhcAAIkOAABuEwAAHBMAAGYUAABWFwAAwRMAAM0TAABsEwAAaBcAAGYXAABfFwAAIhMAAM4PAABpDgAA2A4AAGMWAADLEwAAqg4AACgXAAAmFwAAxRMAAF0WAADoEQAAZxMAAGUTAADyFgAAcxMAAB0XAAD5FgAA8xEAAM8OAADOFQAADBIAALMRAAClEQAAYRAAADIXAAC7EwBB+TULAQEAQZA2C+ABAQECAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAQf03CwEBAEGROAteAgMCAgICAgAAAgIAAgIAAgICAgICAgICAgAEAAAAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAIAAgBB/TkLAQEAQZE6C14CAAICAgICAAACAgACAgACAgICAgICAgICAAMABAAAAAICAgICAgICAgICAgICAgICAgICAgICAgICAAAAAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAAgACAEHwOwsNbG9zZWVlcC1hbGl2ZQBBiTwLAQEAQaA8C+ABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAQYk+CwEBAEGgPgvnAQEBAQEBAQEBAQEBAQIBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBY2h1bmtlZABBsMAAC18BAQABAQEBAQAAAQEAAQEAAQEBAQEBAQEBAQAAAAAAAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQBBkMIACyFlY3Rpb25lbnQtbGVuZ3Rob25yb3h5LWNvbm5lY3Rpb24AQcDCAAstcmFuc2Zlci1lbmNvZGluZ3BncmFkZQ0KDQoNClNNDQoNClRUUC9DRS9UU1AvAEH5wgALBQECAAEDAEGQwwAL4AEEAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB+cQACwUBAgABAwBBkMUAC+ABBAEBBQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAQfnGAAsEAQAAAQBBkccAC98BAQEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBB+sgACwQBAAACAEGQyQALXwMEAAAEBAQEBAQEBAQEBAUEBAQEBAQEBAQEBAQABAAGBwQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAEAAQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAAAAEAEH6ygALBAEAAAEAQZDLAAsBAQBBqssAC0ECAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAAAAAAAADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwBB+swACwQBAAABAEGQzQALAQEAQZrNAAsGAgAAAAACAEGxzQALOgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAAAAAAAAAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMAQfDOAAuWAU5PVU5DRUVDS09VVE5FQ1RFVEVDUklCRUxVU0hFVEVBRFNFQVJDSFJHRUNUSVZJVFlMRU5EQVJWRU9USUZZUFRJT05TQ0hTRUFZU1RBVENIR0VPUkRJUkVDVE9SVFJDSFBBUkFNRVRFUlVSQ0VCU0NSSUJFQVJET1dOQUNFSU5ETktDS1VCU0NSSUJFSFRUUC9BRFRQLw==", "base64");
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/constants.js
var require_constants3 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/constants.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var corsSafeListedMethods = (
      /** @type {const} */
      ["GET", "HEAD", "POST"]
    );
    var corsSafeListedMethodsSet = new Set(corsSafeListedMethods);
    var nullBodyStatus = (
      /** @type {const} */
      [101, 204, 205, 304]
    );
    var redirectStatus = (
      /** @type {const} */
      [301, 302, 303, 307, 308]
    );
    var redirectStatusSet = new Set(redirectStatus);
    var badPorts = (
      /** @type {const} */
      [
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
        "4190",
        "5060",
        "5061",
        "6000",
        "6566",
        "6665",
        "6666",
        "6667",
        "6668",
        "6669",
        "6679",
        "6697",
        "10080"
      ]
    );
    var badPortsSet = new Set(badPorts);
    var referrerPolicy = (
      /** @type {const} */
      [
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
    );
    var referrerPolicySet = new Set(referrerPolicy);
    var requestRedirect = (
      /** @type {const} */
      ["follow", "manual", "error"]
    );
    var safeMethods = (
      /** @type {const} */
      ["GET", "HEAD", "OPTIONS", "TRACE"]
    );
    var safeMethodsSet = new Set(safeMethods);
    var requestMode = (
      /** @type {const} */
      ["navigate", "same-origin", "no-cors", "cors"]
    );
    var requestCredentials = (
      /** @type {const} */
      ["omit", "same-origin", "include"]
    );
    var requestCache = (
      /** @type {const} */
      [
        "default",
        "no-store",
        "reload",
        "no-cache",
        "force-cache",
        "only-if-cached"
      ]
    );
    var requestBodyHeader = (
      /** @type {const} */
      [
        "content-encoding",
        "content-language",
        "content-location",
        "content-type",
        // See https://github.com/nodejs/undici/issues/2021
        // 'Content-Length' is a forbidden header name, which is typically
        // removed in the Headers implementation. However, undici doesn't
        // filter out headers, so we add it here.
        "content-length"
      ]
    );
    var requestDuplex = (
      /** @type {const} */
      [
        "half"
      ]
    );
    var forbiddenMethods = (
      /** @type {const} */
      ["CONNECT", "TRACE", "TRACK"]
    );
    var forbiddenMethodsSet = new Set(forbiddenMethods);
    var subresource = (
      /** @type {const} */
      [
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
      ]
    );
    var subresourceSet = new Set(subresource);
    module2.exports = {
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
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/global.js
var require_global = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/global.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var globalOrigin = Symbol.for("undici.globalOrigin.1");
    function getGlobalOrigin() {
      return globalThis[globalOrigin];
    }
    __name(getGlobalOrigin, "getGlobalOrigin");
    function setGlobalOrigin(newOrigin) {
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

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/data-url.js
var require_data_url = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/data-url.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var encoder = new TextEncoder();
    var HTTP_TOKEN_CODEPOINTS = /^[!#$%&'*+\-.^_|~A-Za-z0-9]+$/;
    var HTTP_WHITESPACE_REGEX = /[\u000A\u000D\u0009\u0020]/;
    var ASCII_WHITESPACE_REPLACE_REGEX = /[\u0009\u000A\u000C\u000D\u0020]/g;
    var HTTP_QUOTED_STRING_TOKENS = /^[\u0009\u0020-\u007E\u0080-\u00FF]+$/;
    function dataURLProcessor(dataURL) {
      assert(dataURL.protocol === "data:");
      let input = URLSerializer(dataURL, true);
      input = input.slice(5);
      const position = { position: 0 };
      let mimeType = collectASequenceOfCodePointsFast(
        ",",
        input,
        position
      );
      const mimeTypeLength = mimeType.length;
      mimeType = removeASCIIWhitespace(mimeType, true, true);
      if (position.position >= input.length) {
        return "failure";
      }
      position.position++;
      const encodedBody = input.slice(mimeTypeLength + 1);
      let body = stringPercentDecode(encodedBody);
      if (/;(\u0020){0,}base64$/i.test(mimeType)) {
        const stringBody = isomorphicDecode(body);
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
      if (!excludeFragment) {
        return url.href;
      }
      const href = url.href;
      const hashLength = url.hash.length;
      const serialized = hashLength === 0 ? href : href.substring(0, href.length - hashLength);
      if (!hashLength && href.endsWith("#")) {
        return serialized.slice(0, -1);
      }
      return serialized;
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
    function collectASequenceOfCodePointsFast(char, input, position) {
      const idx = input.indexOf(char, position.position);
      const start = position.position;
      if (idx === -1) {
        position.position = input.length;
        return input.slice(start);
      }
      position.position = idx;
      return input.slice(start, position.position);
    }
    __name(collectASequenceOfCodePointsFast, "collectASequenceOfCodePointsFast");
    function stringPercentDecode(input) {
      const bytes = encoder.encode(input);
      return percentDecode(bytes);
    }
    __name(stringPercentDecode, "stringPercentDecode");
    function isHexCharByte(byte) {
      return byte >= 48 && byte <= 57 || byte >= 65 && byte <= 70 || byte >= 97 && byte <= 102;
    }
    __name(isHexCharByte, "isHexCharByte");
    function hexByteToNumber(byte) {
      return (
        // 0-9
        byte >= 48 && byte <= 57 ? byte - 48 : (byte & 223) - 55
      );
    }
    __name(hexByteToNumber, "hexByteToNumber");
    function percentDecode(input) {
      const length = input.length;
      const output = new Uint8Array(length);
      let j = 0;
      for (let i = 0; i < length; ++i) {
        const byte = input[i];
        if (byte !== 37) {
          output[j++] = byte;
        } else if (byte === 37 && !(isHexCharByte(input[i + 1]) && isHexCharByte(input[i + 2]))) {
          output[j++] = 37;
        } else {
          output[j++] = hexByteToNumber(input[i + 1]) << 4 | hexByteToNumber(input[i + 2]);
          i += 2;
        }
      }
      return length === j ? output : output.subarray(0, j);
    }
    __name(percentDecode, "percentDecode");
    function parseMIMEType(input) {
      input = removeHTTPWhitespace(input, true, true);
      const position = { position: 0 };
      const type = collectASequenceOfCodePointsFast(
        "/",
        input,
        position
      );
      if (type.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(type)) {
        return "failure";
      }
      if (position.position > input.length) {
        return "failure";
      }
      position.position++;
      let subtype = collectASequenceOfCodePointsFast(
        ";",
        input,
        position
      );
      subtype = removeHTTPWhitespace(subtype, false, true);
      if (subtype.length === 0 || !HTTP_TOKEN_CODEPOINTS.test(subtype)) {
        return "failure";
      }
      const typeLowercase = type.toLowerCase();
      const subtypeLowercase = subtype.toLowerCase();
      const mimeType = {
        type: typeLowercase,
        subtype: subtypeLowercase,
        /** @type {Map<string, string>} */
        parameters: /* @__PURE__ */ new Map(),
        // https://mimesniff.spec.whatwg.org/#mime-type-essence
        essence: `${typeLowercase}/${subtypeLowercase}`
      };
      while (position.position < input.length) {
        position.position++;
        collectASequenceOfCodePoints(
          // https://fetch.spec.whatwg.org/#http-whitespace
          (char) => HTTP_WHITESPACE_REGEX.test(char),
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
          collectASequenceOfCodePointsFast(
            ";",
            input,
            position
          );
        } else {
          parameterValue = collectASequenceOfCodePointsFast(
            ";",
            input,
            position
          );
          parameterValue = removeHTTPWhitespace(parameterValue, false, true);
          if (parameterValue.length === 0) {
            continue;
          }
        }
        if (parameterName.length !== 0 && HTTP_TOKEN_CODEPOINTS.test(parameterName) && (parameterValue.length === 0 || HTTP_QUOTED_STRING_TOKENS.test(parameterValue)) && !mimeType.parameters.has(parameterName)) {
          mimeType.parameters.set(parameterName, parameterValue);
        }
      }
      return mimeType;
    }
    __name(parseMIMEType, "parseMIMEType");
    function forgivingBase64(data) {
      data = data.replace(ASCII_WHITESPACE_REPLACE_REGEX, "");
      let dataLength = data.length;
      if (dataLength % 4 === 0) {
        if (data.charCodeAt(dataLength - 1) === 61) {
          --dataLength;
          if (data.charCodeAt(dataLength - 1) === 61) {
            --dataLength;
          }
        }
      }
      if (dataLength % 4 === 1) {
        return "failure";
      }
      if (/[^+/0-9A-Za-z]/.test(data.length === dataLength ? data : data.substring(0, dataLength))) {
        return "failure";
      }
      const buffer = Buffer.from(data, "base64");
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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
      const { parameters, essence } = mimeType;
      let serialization = essence;
      for (let [name, value] of parameters.entries()) {
        serialization += ";";
        serialization += name;
        serialization += "=";
        if (!HTTP_TOKEN_CODEPOINTS.test(value)) {
          value = value.replace(/(\\|")/g, "\\$1");
          value = '"' + value;
          value += '"';
        }
        serialization += value;
      }
      return serialization;
    }
    __name(serializeAMimeType, "serializeAMimeType");
    function isHTTPWhiteSpace(char) {
      return char === 13 || char === 10 || char === 9 || char === 32;
    }
    __name(isHTTPWhiteSpace, "isHTTPWhiteSpace");
    function removeHTTPWhitespace(str, leading = true, trailing = true) {
      return removeChars(str, leading, trailing, isHTTPWhiteSpace);
    }
    __name(removeHTTPWhitespace, "removeHTTPWhitespace");
    function isASCIIWhitespace(char) {
      return char === 13 || char === 10 || char === 9 || char === 12 || char === 32;
    }
    __name(isASCIIWhitespace, "isASCIIWhitespace");
    function removeASCIIWhitespace(str, leading = true, trailing = true) {
      return removeChars(str, leading, trailing, isASCIIWhitespace);
    }
    __name(removeASCIIWhitespace, "removeASCIIWhitespace");
    function removeChars(str, leading, trailing, predicate) {
      let lead = 0;
      let trail = str.length - 1;
      if (leading) {
        while (lead < str.length && predicate(str.charCodeAt(lead)))
          lead++;
      }
      if (trailing) {
        while (trail > 0 && predicate(str.charCodeAt(trail)))
          trail--;
      }
      return lead === 0 && trail === str.length - 1 ? str : str.slice(lead, trail + 1);
    }
    __name(removeChars, "removeChars");
    function isomorphicDecode(input) {
      const length = input.length;
      if ((2 << 15) - 1 > length) {
        return String.fromCharCode.apply(null, input);
      }
      let result = "";
      let i = 0;
      let addition = (2 << 15) - 1;
      while (i < length) {
        if (i + addition > length) {
          addition = length - i;
        }
        result += String.fromCharCode.apply(null, input.subarray(i, i += addition));
      }
      return result;
    }
    __name(isomorphicDecode, "isomorphicDecode");
    function minimizeSupportedMimeType(mimeType) {
      switch (mimeType.essence) {
        case "application/ecmascript":
        case "application/javascript":
        case "application/x-ecmascript":
        case "application/x-javascript":
        case "text/ecmascript":
        case "text/javascript":
        case "text/javascript1.0":
        case "text/javascript1.1":
        case "text/javascript1.2":
        case "text/javascript1.3":
        case "text/javascript1.4":
        case "text/javascript1.5":
        case "text/jscript":
        case "text/livescript":
        case "text/x-ecmascript":
        case "text/x-javascript":
          return "text/javascript";
        case "application/json":
        case "text/json":
          return "application/json";
        case "image/svg+xml":
          return "image/svg+xml";
        case "text/xml":
        case "application/xml":
          return "application/xml";
      }
      if (mimeType.subtype.endsWith("+json")) {
        return "application/json";
      }
      if (mimeType.subtype.endsWith("+xml")) {
        return "application/xml";
      }
      return "";
    }
    __name(minimizeSupportedMimeType, "minimizeSupportedMimeType");
    module2.exports = {
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
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/webidl.js
var require_webidl = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/webidl.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { types, inspect } = require("util");
    var { markAsUncloneable } = require("worker_threads");
    var { toUSVString } = require_util();
    var webidl = {};
    webidl.converters = {};
    webidl.util = {};
    webidl.errors = {};
    webidl.errors.exception = function(message) {
      return new TypeError(`${message.header}: ${message.message}`);
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
    webidl.brandCheck = function(V, I, opts) {
      if (opts?.strict !== false) {
        if (!(V instanceof I)) {
          const err = new TypeError("Illegal invocation");
          err.code = "ERR_INVALID_THIS";
          throw err;
        }
      } else {
        if (V?.[Symbol.toStringTag] !== I.prototype[Symbol.toStringTag]) {
          const err = new TypeError("Illegal invocation");
          err.code = "ERR_INVALID_THIS";
          throw err;
        }
      }
    };
    webidl.argumentLengthCheck = function({ length }, min, ctx) {
      if (length < min) {
        throw webidl.errors.exception({
          message: `${min} argument${min !== 1 ? "s" : ""} required, but${length ? " only" : ""} ${length} found.`,
          header: ctx
        });
      }
    };
    webidl.illegalConstructor = function() {
      throw webidl.errors.exception({
        header: "TypeError",
        message: "Illegal constructor"
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
    webidl.util.markAsUncloneable = markAsUncloneable || (() => {
    });
    webidl.util.ConvertToInt = function(V, bitLength, signedness, opts) {
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
      if (x === 0) {
        x = 0;
      }
      if (opts?.enforceRange === true) {
        if (Number.isNaN(x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) {
          throw webidl.errors.exception({
            header: "Integer conversion",
            message: `Could not convert ${webidl.util.Stringify(V)} to an integer.`
          });
        }
        x = webidl.util.IntegerPart(x);
        if (x < lowerBound || x > upperBound) {
          throw webidl.errors.exception({
            header: "Integer conversion",
            message: `Value must be between ${lowerBound}-${upperBound}, got ${x}.`
          });
        }
        return x;
      }
      if (!Number.isNaN(x) && opts?.clamp === true) {
        x = Math.min(Math.max(x, lowerBound), upperBound);
        if (Math.floor(x) % 2 === 0) {
          x = Math.floor(x);
        } else {
          x = Math.ceil(x);
        }
        return x;
      }
      if (Number.isNaN(x) || x === 0 && Object.is(0, x) || x === Number.POSITIVE_INFINITY || x === Number.NEGATIVE_INFINITY) {
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
    webidl.util.Stringify = function(V) {
      const type = webidl.util.Type(V);
      switch (type) {
        case "Symbol":
          return `Symbol(${V.description})`;
        case "Object":
          return inspect(V);
        case "String":
          return `"${V}"`;
        default:
          return `${V}`;
      }
    };
    webidl.sequenceConverter = function(converter) {
      return (V, prefix, argument, Iterable) => {
        if (webidl.util.Type(V) !== "Object") {
          throw webidl.errors.exception({
            header: prefix,
            message: `${argument} (${webidl.util.Stringify(V)}) is not iterable.`
          });
        }
        const method = typeof Iterable === "function" ? Iterable() : V?.[Symbol.iterator]?.();
        const seq = [];
        let index = 0;
        if (method === void 0 || typeof method.next !== "function") {
          throw webidl.errors.exception({
            header: prefix,
            message: `${argument} is not iterable.`
          });
        }
        while (true) {
          const { done, value } = method.next();
          if (done) {
            break;
          }
          seq.push(converter(value, prefix, `${argument}[${index++}]`));
        }
        return seq;
      };
    };
    webidl.recordConverter = function(keyConverter, valueConverter) {
      return (O, prefix, argument) => {
        if (webidl.util.Type(O) !== "Object") {
          throw webidl.errors.exception({
            header: prefix,
            message: `${argument} ("${webidl.util.Type(O)}") is not an Object.`
          });
        }
        const result = {};
        if (!types.isProxy(O)) {
          const keys2 = [...Object.getOwnPropertyNames(O), ...Object.getOwnPropertySymbols(O)];
          for (const key of keys2) {
            const typedKey = keyConverter(key, prefix, argument);
            const typedValue = valueConverter(O[key], prefix, argument);
            result[typedKey] = typedValue;
          }
          return result;
        }
        const keys = Reflect.ownKeys(O);
        for (const key of keys) {
          const desc = Reflect.getOwnPropertyDescriptor(O, key);
          if (desc?.enumerable) {
            const typedKey = keyConverter(key, prefix, argument);
            const typedValue = valueConverter(O[key], prefix, argument);
            result[typedKey] = typedValue;
          }
        }
        return result;
      };
    };
    webidl.interfaceConverter = function(i) {
      return (V, prefix, argument, opts) => {
        if (opts?.strict !== false && !(V instanceof i)) {
          throw webidl.errors.exception({
            header: prefix,
            message: `Expected ${argument} ("${webidl.util.Stringify(V)}") to be an instance of ${i.name}.`
          });
        }
        return V;
      };
    };
    webidl.dictionaryConverter = function(converters) {
      return (dictionary, prefix, argument) => {
        const type = webidl.util.Type(dictionary);
        const dict = {};
        if (type === "Null" || type === "Undefined") {
          return dict;
        } else if (type !== "Object") {
          throw webidl.errors.exception({
            header: prefix,
            message: `Expected ${dictionary} to be one of: Null, Undefined, Object.`
          });
        }
        for (const options of converters) {
          const { key, defaultValue, required, converter } = options;
          if (required === true) {
            if (!Object.hasOwn(dictionary, key)) {
              throw webidl.errors.exception({
                header: prefix,
                message: `Missing required key "${key}".`
              });
            }
          }
          let value = dictionary[key];
          const hasDefault = Object.hasOwn(options, "defaultValue");
          if (hasDefault && value !== null) {
            value ??= defaultValue();
          }
          if (required || hasDefault || value !== void 0) {
            value = converter(value, prefix, `${argument}.${key}`);
            if (options.allowedValues && !options.allowedValues.includes(value)) {
              throw webidl.errors.exception({
                header: prefix,
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
      return (V, prefix, argument) => {
        if (V === null) {
          return V;
        }
        return converter(V, prefix, argument);
      };
    };
    webidl.converters.DOMString = function(V, prefix, argument, opts) {
      if (V === null && opts?.legacyNullToEmptyString) {
        return "";
      }
      if (typeof V === "symbol") {
        throw webidl.errors.exception({
          header: prefix,
          message: `${argument} is a symbol, which cannot be converted to a DOMString.`
        });
      }
      return String(V);
    };
    webidl.converters.ByteString = function(V, prefix, argument) {
      const x = webidl.converters.DOMString(V, prefix, argument);
      for (let index = 0; index < x.length; index++) {
        if (x.charCodeAt(index) > 255) {
          throw new TypeError(
            `Cannot convert argument to a ByteString because the character at index ${index} has a value of ${x.charCodeAt(index)} which is greater than 255.`
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
    webidl.converters["long long"] = function(V, prefix, argument) {
      const x = webidl.util.ConvertToInt(V, 64, "signed", void 0, prefix, argument);
      return x;
    };
    webidl.converters["unsigned long long"] = function(V, prefix, argument) {
      const x = webidl.util.ConvertToInt(V, 64, "unsigned", void 0, prefix, argument);
      return x;
    };
    webidl.converters["unsigned long"] = function(V, prefix, argument) {
      const x = webidl.util.ConvertToInt(V, 32, "unsigned", void 0, prefix, argument);
      return x;
    };
    webidl.converters["unsigned short"] = function(V, prefix, argument, opts) {
      const x = webidl.util.ConvertToInt(V, 16, "unsigned", opts, prefix, argument);
      return x;
    };
    webidl.converters.ArrayBuffer = function(V, prefix, argument, opts) {
      if (webidl.util.Type(V) !== "Object" || !types.isAnyArrayBuffer(V)) {
        throw webidl.errors.conversionFailed({
          prefix,
          argument: `${argument} ("${webidl.util.Stringify(V)}")`,
          types: ["ArrayBuffer"]
        });
      }
      if (opts?.allowShared === false && types.isSharedArrayBuffer(V)) {
        throw webidl.errors.exception({
          header: "ArrayBuffer",
          message: "SharedArrayBuffer is not allowed."
        });
      }
      if (V.resizable || V.growable) {
        throw webidl.errors.exception({
          header: "ArrayBuffer",
          message: "Received a resizable ArrayBuffer."
        });
      }
      return V;
    };
    webidl.converters.TypedArray = function(V, T, prefix, name, opts) {
      if (webidl.util.Type(V) !== "Object" || !types.isTypedArray(V) || V.constructor.name !== T.name) {
        throw webidl.errors.conversionFailed({
          prefix,
          argument: `${name} ("${webidl.util.Stringify(V)}")`,
          types: [T.name]
        });
      }
      if (opts?.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
        throw webidl.errors.exception({
          header: "ArrayBuffer",
          message: "SharedArrayBuffer is not allowed."
        });
      }
      if (V.buffer.resizable || V.buffer.growable) {
        throw webidl.errors.exception({
          header: "ArrayBuffer",
          message: "Received a resizable ArrayBuffer."
        });
      }
      return V;
    };
    webidl.converters.DataView = function(V, prefix, name, opts) {
      if (webidl.util.Type(V) !== "Object" || !types.isDataView(V)) {
        throw webidl.errors.exception({
          header: prefix,
          message: `${name} is not a DataView.`
        });
      }
      if (opts?.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
        throw webidl.errors.exception({
          header: "ArrayBuffer",
          message: "SharedArrayBuffer is not allowed."
        });
      }
      if (V.buffer.resizable || V.buffer.growable) {
        throw webidl.errors.exception({
          header: "ArrayBuffer",
          message: "Received a resizable ArrayBuffer."
        });
      }
      return V;
    };
    webidl.converters.BufferSource = function(V, prefix, name, opts) {
      if (types.isAnyArrayBuffer(V)) {
        return webidl.converters.ArrayBuffer(V, prefix, name, { ...opts, allowShared: false });
      }
      if (types.isTypedArray(V)) {
        return webidl.converters.TypedArray(V, V.constructor, prefix, name, { ...opts, allowShared: false });
      }
      if (types.isDataView(V)) {
        return webidl.converters.DataView(V, prefix, name, { ...opts, allowShared: false });
      }
      throw webidl.errors.conversionFailed({
        prefix,
        argument: `${name} ("${webidl.util.Stringify(V)}")`,
        types: ["BufferSource"]
      });
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

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/util.js
var require_util2 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Transform } = require("stream");
    var zlib = require("zlib");
    var { redirectStatusSet, referrerPolicySet: referrerPolicyTokens, badPortsSet } = require_constants3();
    var { getGlobalOrigin } = require_global();
    var { collectASequenceOfCodePoints, collectAnHTTPQuotedString, removeChars, parseMIMEType } = require_data_url();
    var { performance: performance2 } = require("perf_hooks");
    var { isBlobLike, ReadableStreamFrom, isValidHTTPToken, normalizedMethodRecordsBase } = require_util();
    var assert = require("assert");
    var { isUint8Array } = require("util/types");
    var { webidl } = require_webidl();
    var supportedHashes = [];
    var crypto;
    try {
      crypto = require("crypto");
      const possibleRelevantHashes = ["sha256", "sha384", "sha512"];
      supportedHashes = crypto.getHashes().filter((hash) => possibleRelevantHashes.includes(hash));
    } catch {
    }
    function responseURL(response) {
      const urlList = response.urlList;
      const length = urlList.length;
      return length === 0 ? null : urlList[length - 1].toString();
    }
    __name(responseURL, "responseURL");
    function responseLocationURL(response, requestFragment) {
      if (!redirectStatusSet.has(response.status)) {
        return null;
      }
      let location = response.headersList.get("location", true);
      if (location !== null && isValidHeaderValue(location)) {
        if (!isValidEncodedURL(location)) {
          location = normalizeBinaryStringToUtf8(location);
        }
        location = new URL(location, responseURL(response));
      }
      if (location && !location.hash) {
        location.hash = requestFragment;
      }
      return location;
    }
    __name(responseLocationURL, "responseLocationURL");
    function isValidEncodedURL(url) {
      for (let i = 0; i < url.length; ++i) {
        const code = url.charCodeAt(i);
        if (code > 126 || // Non-US-ASCII + DEL
        code < 32) {
          return false;
        }
      }
      return true;
    }
    __name(isValidEncodedURL, "isValidEncodedURL");
    function normalizeBinaryStringToUtf8(value) {
      return Buffer.from(value, "binary").toString("utf8");
    }
    __name(normalizeBinaryStringToUtf8, "normalizeBinaryStringToUtf8");
    function requestCurrentURL(request) {
      return request.urlList[request.urlList.length - 1];
    }
    __name(requestCurrentURL, "requestCurrentURL");
    function requestBadPort(request) {
      const url = requestCurrentURL(request);
      if (urlIsHttpHttpsScheme(url) && badPortsSet.has(url.port)) {
        return "blocked";
      }
      return "allowed";
    }
    __name(requestBadPort, "requestBadPort");
    function isErrorLike(object) {
      return object instanceof Error || (object?.constructor?.name === "Error" || object?.constructor?.name === "DOMException");
    }
    __name(isErrorLike, "isErrorLike");
    function isValidReasonPhrase(statusText) {
      for (let i = 0; i < statusText.length; ++i) {
        const c = statusText.charCodeAt(i);
        if (!(c === 9 || // HTAB
        c >= 32 && c <= 126 || // SP / VCHAR
        c >= 128 && c <= 255)) {
          return false;
        }
      }
      return true;
    }
    __name(isValidReasonPhrase, "isValidReasonPhrase");
    var isValidHeaderName = isValidHTTPToken;
    function isValidHeaderValue(potentialValue) {
      return (potentialValue[0] === "	" || potentialValue[0] === " " || potentialValue[potentialValue.length - 1] === "	" || potentialValue[potentialValue.length - 1] === " " || potentialValue.includes("\n") || potentialValue.includes("\r") || potentialValue.includes("\0")) === false;
    }
    __name(isValidHeaderValue, "isValidHeaderValue");
    function setRequestReferrerPolicyOnRedirect(request, actualResponse) {
      const { headersList } = actualResponse;
      const policyHeader = (headersList.get("referrer-policy", true) ?? "").split(",");
      let policy = "";
      if (policyHeader.length > 0) {
        for (let i = policyHeader.length; i !== 0; i--) {
          const token = policyHeader[i - 1].trim();
          if (referrerPolicyTokens.has(token)) {
            policy = token;
            break;
          }
        }
      }
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
      httpRequest.headersList.set("sec-fetch-mode", header, true);
    }
    __name(appendFetchMetadata, "appendFetchMetadata");
    function appendRequestOriginHeader(request) {
      let serializedOrigin = request.origin;
      if (serializedOrigin === "client" || serializedOrigin === void 0) {
        return;
      }
      if (request.responseTainting === "cors" || request.mode === "websocket") {
        request.headersList.append("origin", serializedOrigin, true);
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        switch (request.referrerPolicy) {
          case "no-referrer":
            serializedOrigin = null;
            break;
          case "no-referrer-when-downgrade":
          case "strict-origin":
          case "strict-origin-when-cross-origin":
            if (request.origin && urlHasHttpsScheme(request.origin) && !urlHasHttpsScheme(requestCurrentURL(request))) {
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
        request.headersList.append("origin", serializedOrigin, true);
      }
    }
    __name(appendRequestOriginHeader, "appendRequestOriginHeader");
    function coarsenTime(timestamp, crossOriginIsolatedCapability) {
      return timestamp;
    }
    __name(coarsenTime, "coarsenTime");
    function clampAndCoarsenConnectionTimingInfo(connectionTimingInfo, defaultStartTime, crossOriginIsolatedCapability) {
      if (!connectionTimingInfo?.startTime || connectionTimingInfo.startTime < defaultStartTime) {
        return {
          domainLookupStartTime: defaultStartTime,
          domainLookupEndTime: defaultStartTime,
          connectionStartTime: defaultStartTime,
          connectionEndTime: defaultStartTime,
          secureConnectionStartTime: defaultStartTime,
          ALPNNegotiatedProtocol: connectionTimingInfo?.ALPNNegotiatedProtocol
        };
      }
      return {
        domainLookupStartTime: coarsenTime(connectionTimingInfo.domainLookupStartTime, crossOriginIsolatedCapability),
        domainLookupEndTime: coarsenTime(connectionTimingInfo.domainLookupEndTime, crossOriginIsolatedCapability),
        connectionStartTime: coarsenTime(connectionTimingInfo.connectionStartTime, crossOriginIsolatedCapability),
        connectionEndTime: coarsenTime(connectionTimingInfo.connectionEndTime, crossOriginIsolatedCapability),
        secureConnectionStartTime: coarsenTime(connectionTimingInfo.secureConnectionStartTime, crossOriginIsolatedCapability),
        ALPNNegotiatedProtocol: connectionTimingInfo.ALPNNegotiatedProtocol
      };
    }
    __name(clampAndCoarsenConnectionTimingInfo, "clampAndCoarsenConnectionTimingInfo");
    function coarsenedSharedCurrentTime(crossOriginIsolatedCapability) {
      return coarsenTime(performance2.now(), crossOriginIsolatedCapability);
    }
    __name(coarsenedSharedCurrentTime, "coarsenedSharedCurrentTime");
    function createOpaqueTimingInfo(timingInfo) {
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
      };
    }
    __name(createOpaqueTimingInfo, "createOpaqueTimingInfo");
    function makePolicyContainer() {
      return {
        referrerPolicy: "strict-origin-when-cross-origin"
      };
    }
    __name(makePolicyContainer, "makePolicyContainer");
    function clonePolicyContainer(policyContainer) {
      return {
        referrerPolicy: policyContainer.referrerPolicy
      };
    }
    __name(clonePolicyContainer, "clonePolicyContainer");
    function determineRequestsReferrer(request) {
      const policy = request.referrerPolicy;
      assert(policy);
      let referrerSource = null;
      if (request.referrer === "client") {
        const globalOrigin = getGlobalOrigin();
        if (!globalOrigin || globalOrigin.origin === "null") {
          return "no-referrer";
        }
        referrerSource = new URL(globalOrigin);
      } else if (request.referrer instanceof URL) {
        referrerSource = request.referrer;
      }
      let referrerURL = stripURLForReferrer(referrerSource);
      const referrerOrigin = stripURLForReferrer(referrerSource, true);
      if (referrerURL.toString().length > 4096) {
        referrerURL = referrerOrigin;
      }
      const areSameOrigin = sameOrigin(request, referrerURL);
      const isNonPotentiallyTrustWorthy = isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(request.url);
      switch (policy) {
        case "origin":
          return referrerOrigin != null ? referrerOrigin : stripURLForReferrer(referrerSource, true);
        case "unsafe-url":
          return referrerURL;
        case "same-origin":
          return areSameOrigin ? referrerOrigin : "no-referrer";
        case "origin-when-cross-origin":
          return areSameOrigin ? referrerURL : referrerOrigin;
        case "strict-origin-when-cross-origin": {
          const currentURL = requestCurrentURL(request);
          if (sameOrigin(referrerURL, currentURL)) {
            return referrerURL;
          }
          if (isURLPotentiallyTrustworthy(referrerURL) && !isURLPotentiallyTrustworthy(currentURL)) {
            return "no-referrer";
          }
          return referrerOrigin;
        }
        case "strict-origin":
        case "no-referrer-when-downgrade":
        default:
          return isNonPotentiallyTrustWorthy ? "no-referrer" : referrerOrigin;
      }
    }
    __name(determineRequestsReferrer, "determineRequestsReferrer");
    function stripURLForReferrer(url, originOnly) {
      assert(url instanceof URL);
      url = new URL(url);
      if (url.protocol === "file:" || url.protocol === "about:" || url.protocol === "blank:") {
        return "no-referrer";
      }
      url.username = "";
      url.password = "";
      url.hash = "";
      if (originOnly) {
        url.pathname = "";
        url.search = "";
      }
      return url;
    }
    __name(stripURLForReferrer, "stripURLForReferrer");
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
      const strongest = getStrongestMetadata(parsedMetadata);
      const metadata = filterMetadataListByAlgorithm(parsedMetadata, strongest);
      for (const item of metadata) {
        const algorithm = item.algo;
        const expectedValue = item.hash;
        let actualValue = crypto.createHash(algorithm).update(bytes).digest("base64");
        if (actualValue[actualValue.length - 1] === "=") {
          if (actualValue[actualValue.length - 2] === "=") {
            actualValue = actualValue.slice(0, -2);
          } else {
            actualValue = actualValue.slice(0, -1);
          }
        }
        if (compareBase64Mixed(actualValue, expectedValue)) {
          return true;
        }
      }
      return false;
    }
    __name(bytesMatch, "bytesMatch");
    var parseHashWithOptions = /(?<algo>sha256|sha384|sha512)-((?<hash>[A-Za-z0-9+/]+|[A-Za-z0-9_-]+)={0,2}(?:\s|$)( +[!-~]*)?)?/i;
    function parseMetadata(metadata) {
      const result = [];
      let empty = true;
      for (const token of metadata.split(" ")) {
        empty = false;
        const parsedToken = parseHashWithOptions.exec(token);
        if (parsedToken === null || parsedToken.groups === void 0 || parsedToken.groups.algo === void 0) {
          continue;
        }
        const algorithm = parsedToken.groups.algo.toLowerCase();
        if (supportedHashes.includes(algorithm)) {
          result.push(parsedToken.groups);
        }
      }
      if (empty === true) {
        return "no metadata";
      }
      return result;
    }
    __name(parseMetadata, "parseMetadata");
    function getStrongestMetadata(metadataList) {
      let algorithm = metadataList[0].algo;
      if (algorithm[3] === "5") {
        return algorithm;
      }
      for (let i = 1; i < metadataList.length; ++i) {
        const metadata = metadataList[i];
        if (metadata.algo[3] === "5") {
          algorithm = "sha512";
          break;
        } else if (algorithm[3] === "3") {
          continue;
        } else if (metadata.algo[3] === "3") {
          algorithm = "sha384";
        }
      }
      return algorithm;
    }
    __name(getStrongestMetadata, "getStrongestMetadata");
    function filterMetadataListByAlgorithm(metadataList, algorithm) {
      if (metadataList.length === 1) {
        return metadataList;
      }
      let pos = 0;
      for (let i = 0; i < metadataList.length; ++i) {
        if (metadataList[i].algo === algorithm) {
          metadataList[pos++] = metadataList[i];
        }
      }
      metadataList.length = pos;
      return metadataList;
    }
    __name(filterMetadataListByAlgorithm, "filterMetadataListByAlgorithm");
    function compareBase64Mixed(actualValue, expectedValue) {
      if (actualValue.length !== expectedValue.length) {
        return false;
      }
      for (let i = 0; i < actualValue.length; ++i) {
        if (actualValue[i] !== expectedValue[i]) {
          if (actualValue[i] === "+" && expectedValue[i] === "-" || actualValue[i] === "/" && expectedValue[i] === "_") {
            continue;
          }
          return false;
        }
      }
      return true;
    }
    __name(compareBase64Mixed, "compareBase64Mixed");
    function tryUpgradeRequestToAPotentiallyTrustworthyURL(request) {
    }
    __name(tryUpgradeRequestToAPotentiallyTrustworthyURL, "tryUpgradeRequestToAPotentiallyTrustworthyURL");
    function sameOrigin(A, B) {
      if (A.origin === B.origin && A.origin === "null") {
        return true;
      }
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
      return normalizedMethodRecordsBase[method.toLowerCase()] ?? method;
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
    function createIterator(name, kInternalIterator, keyIndex = 0, valueIndex = 1) {
      var _target, _kind, _index;
      const _FastIterableIterator = class _FastIterableIterator {
        /**
         * @see https://webidl.spec.whatwg.org/#dfn-default-iterator-object
         * @param {unknown} target
         * @param {'key' | 'value' | 'key+value'} kind
         */
        constructor(target, kind) {
          /** @type {any} */
          __privateAdd(this, _target, void 0);
          /** @type {'key' | 'value' | 'key+value'} */
          __privateAdd(this, _kind, void 0);
          /** @type {number} */
          __privateAdd(this, _index, void 0);
          __privateSet(this, _target, target);
          __privateSet(this, _kind, kind);
          __privateSet(this, _index, 0);
        }
        next() {
          if (typeof this !== "object" || this === null || !__privateIn(_target, this)) {
            throw new TypeError(
              `'next' called on an object that does not implement interface ${name} Iterator.`
            );
          }
          const index = __privateGet(this, _index);
          const values = __privateGet(this, _target)[kInternalIterator];
          const len = values.length;
          if (index >= len) {
            return {
              value: void 0,
              done: true
            };
          }
          const { [keyIndex]: key, [valueIndex]: value } = values[index];
          __privateSet(this, _index, index + 1);
          let result;
          switch (__privateGet(this, _kind)) {
            case "key":
              result = key;
              break;
            case "value":
              result = value;
              break;
            case "key+value":
              result = [key, value];
              break;
          }
          return {
            value: result,
            done: false
          };
        }
      };
      _target = new WeakMap();
      _kind = new WeakMap();
      _index = new WeakMap();
      __name(_FastIterableIterator, "FastIterableIterator");
      let FastIterableIterator = _FastIterableIterator;
      delete FastIterableIterator.prototype.constructor;
      Object.setPrototypeOf(FastIterableIterator.prototype, esIteratorPrototype);
      Object.defineProperties(FastIterableIterator.prototype, {
        [Symbol.toStringTag]: {
          writable: false,
          enumerable: false,
          configurable: true,
          value: `${name} Iterator`
        },
        next: { writable: true, enumerable: true, configurable: true }
      });
      return function(target, kind) {
        return new FastIterableIterator(target, kind);
      };
    }
    __name(createIterator, "createIterator");
    function iteratorMixin(name, object, kInternalIterator, keyIndex = 0, valueIndex = 1) {
      const makeIterator = createIterator(name, kInternalIterator, keyIndex, valueIndex);
      const properties = {
        keys: {
          writable: true,
          enumerable: true,
          configurable: true,
          value: /* @__PURE__ */ __name(function keys() {
            webidl.brandCheck(this, object);
            return makeIterator(this, "key");
          }, "keys")
        },
        values: {
          writable: true,
          enumerable: true,
          configurable: true,
          value: /* @__PURE__ */ __name(function values() {
            webidl.brandCheck(this, object);
            return makeIterator(this, "value");
          }, "values")
        },
        entries: {
          writable: true,
          enumerable: true,
          configurable: true,
          value: /* @__PURE__ */ __name(function entries() {
            webidl.brandCheck(this, object);
            return makeIterator(this, "key+value");
          }, "entries")
        },
        forEach: {
          writable: true,
          enumerable: true,
          configurable: true,
          value: /* @__PURE__ */ __name(function forEach(callbackfn, thisArg = globalThis) {
            webidl.brandCheck(this, object);
            webidl.argumentLengthCheck(arguments, 1, `${name}.forEach`);
            if (typeof callbackfn !== "function") {
              throw new TypeError(
                `Failed to execute 'forEach' on '${name}': parameter 1 is not of type 'Function'.`
              );
            }
            for (const { 0: key, 1: value } of makeIterator(this, "key+value")) {
              callbackfn.call(thisArg, value, key, this);
            }
          }, "forEach")
        }
      };
      return Object.defineProperties(object.prototype, {
        ...properties,
        [Symbol.iterator]: {
          writable: true,
          enumerable: false,
          configurable: true,
          value: properties.entries.value
        }
      });
    }
    __name(iteratorMixin, "iteratorMixin");
    async function fullyReadBody(body, processBody, processBodyError) {
      const successSteps = processBody;
      const errorSteps = processBodyError;
      let reader;
      try {
        reader = body.stream.getReader();
      } catch (e) {
        errorSteps(e);
        return;
      }
      try {
        successSteps(await readAllBytes(reader));
      } catch (e) {
        errorSteps(e);
      }
    }
    __name(fullyReadBody, "fullyReadBody");
    function isReadableStreamLike(stream) {
      return stream instanceof ReadableStream || stream[Symbol.toStringTag] === "ReadableStream" && typeof stream.tee === "function";
    }
    __name(isReadableStreamLike, "isReadableStreamLike");
    function readableStreamClose(controller) {
      try {
        controller.close();
        controller.byobRequest?.respond(0);
      } catch (err) {
        if (!err.message.includes("Controller is already closed") && !err.message.includes("ReadableStream is already closed")) {
          throw err;
        }
      }
    }
    __name(readableStreamClose, "readableStreamClose");
    var invalidIsomorphicEncodeValueRegex = /[^\x00-\xFF]/;
    function isomorphicEncode(input) {
      assert(!invalidIsomorphicEncodeValueRegex.test(input));
      return input;
    }
    __name(isomorphicEncode, "isomorphicEncode");
    async function readAllBytes(reader) {
      const bytes = [];
      let byteLength = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) {
          return Buffer.concat(bytes, byteLength);
        }
        if (!isUint8Array(chunk)) {
          throw new TypeError("Received non-Uint8Array chunk");
        }
        bytes.push(chunk);
        byteLength += chunk.length;
      }
    }
    __name(readAllBytes, "readAllBytes");
    function urlIsLocal(url) {
      assert("protocol" in url);
      const protocol = url.protocol;
      return protocol === "about:" || protocol === "blob:" || protocol === "data:";
    }
    __name(urlIsLocal, "urlIsLocal");
    function urlHasHttpsScheme(url) {
      return typeof url === "string" && url[5] === ":" && url[0] === "h" && url[1] === "t" && url[2] === "t" && url[3] === "p" && url[4] === "s" || url.protocol === "https:";
    }
    __name(urlHasHttpsScheme, "urlHasHttpsScheme");
    function urlIsHttpHttpsScheme(url) {
      assert("protocol" in url);
      const protocol = url.protocol;
      return protocol === "http:" || protocol === "https:";
    }
    __name(urlIsHttpHttpsScheme, "urlIsHttpHttpsScheme");
    function simpleRangeHeaderValue(value, allowWhitespace) {
      const data = value;
      if (!data.startsWith("bytes")) {
        return "failure";
      }
      const position = { position: 5 };
      if (allowWhitespace) {
        collectASequenceOfCodePoints(
          (char) => char === "	" || char === " ",
          data,
          position
        );
      }
      if (data.charCodeAt(position.position) !== 61) {
        return "failure";
      }
      position.position++;
      if (allowWhitespace) {
        collectASequenceOfCodePoints(
          (char) => char === "	" || char === " ",
          data,
          position
        );
      }
      const rangeStart = collectASequenceOfCodePoints(
        (char) => {
          const code = char.charCodeAt(0);
          return code >= 48 && code <= 57;
        },
        data,
        position
      );
      const rangeStartValue = rangeStart.length ? Number(rangeStart) : null;
      if (allowWhitespace) {
        collectASequenceOfCodePoints(
          (char) => char === "	" || char === " ",
          data,
          position
        );
      }
      if (data.charCodeAt(position.position) !== 45) {
        return "failure";
      }
      position.position++;
      if (allowWhitespace) {
        collectASequenceOfCodePoints(
          (char) => char === "	" || char === " ",
          data,
          position
        );
      }
      const rangeEnd = collectASequenceOfCodePoints(
        (char) => {
          const code = char.charCodeAt(0);
          return code >= 48 && code <= 57;
        },
        data,
        position
      );
      const rangeEndValue = rangeEnd.length ? Number(rangeEnd) : null;
      if (position.position < data.length) {
        return "failure";
      }
      if (rangeEndValue === null && rangeStartValue === null) {
        return "failure";
      }
      if (rangeStartValue > rangeEndValue) {
        return "failure";
      }
      return { rangeStartValue, rangeEndValue };
    }
    __name(simpleRangeHeaderValue, "simpleRangeHeaderValue");
    function buildContentRange(rangeStart, rangeEnd, fullLength) {
      let contentRange = "bytes ";
      contentRange += isomorphicEncode(`${rangeStart}`);
      contentRange += "-";
      contentRange += isomorphicEncode(`${rangeEnd}`);
      contentRange += "/";
      contentRange += isomorphicEncode(`${fullLength}`);
      return contentRange;
    }
    __name(buildContentRange, "buildContentRange");
    var _zlibOptions;
    var _InflateStream = class _InflateStream extends Transform {
      /** @param {zlib.ZlibOptions} [zlibOptions] */
      constructor(zlibOptions) {
        super();
        __privateAdd(this, _zlibOptions, void 0);
        __privateSet(this, _zlibOptions, zlibOptions);
      }
      _transform(chunk, encoding, callback) {
        if (!this._inflateStream) {
          if (chunk.length === 0) {
            callback();
            return;
          }
          this._inflateStream = (chunk[0] & 15) === 8 ? zlib.createInflate(__privateGet(this, _zlibOptions)) : zlib.createInflateRaw(__privateGet(this, _zlibOptions));
          this._inflateStream.on("data", this.push.bind(this));
          this._inflateStream.on("end", () => this.push(null));
          this._inflateStream.on("error", (err) => this.destroy(err));
        }
        this._inflateStream.write(chunk, encoding, callback);
      }
      _final(callback) {
        if (this._inflateStream) {
          this._inflateStream.end();
          this._inflateStream = null;
        }
        callback();
      }
    };
    _zlibOptions = new WeakMap();
    __name(_InflateStream, "InflateStream");
    var InflateStream = _InflateStream;
    function createInflate(zlibOptions) {
      return new InflateStream(zlibOptions);
    }
    __name(createInflate, "createInflate");
    function extractMimeType(headers) {
      let charset = null;
      let essence = null;
      let mimeType = null;
      const values = getDecodeSplit("content-type", headers);
      if (values === null) {
        return "failure";
      }
      for (const value of values) {
        const temporaryMimeType = parseMIMEType(value);
        if (temporaryMimeType === "failure" || temporaryMimeType.essence === "*/*") {
          continue;
        }
        mimeType = temporaryMimeType;
        if (mimeType.essence !== essence) {
          charset = null;
          if (mimeType.parameters.has("charset")) {
            charset = mimeType.parameters.get("charset");
          }
          essence = mimeType.essence;
        } else if (!mimeType.parameters.has("charset") && charset !== null) {
          mimeType.parameters.set("charset", charset);
        }
      }
      if (mimeType == null) {
        return "failure";
      }
      return mimeType;
    }
    __name(extractMimeType, "extractMimeType");
    function gettingDecodingSplitting(value) {
      const input = value;
      const position = { position: 0 };
      const values = [];
      let temporaryValue = "";
      while (position.position < input.length) {
        temporaryValue += collectASequenceOfCodePoints(
          (char) => char !== '"' && char !== ",",
          input,
          position
        );
        if (position.position < input.length) {
          if (input.charCodeAt(position.position) === 34) {
            temporaryValue += collectAnHTTPQuotedString(
              input,
              position
            );
            if (position.position < input.length) {
              continue;
            }
          } else {
            assert(input.charCodeAt(position.position) === 44);
            position.position++;
          }
        }
        temporaryValue = removeChars(temporaryValue, true, true, (char) => char === 9 || char === 32);
        values.push(temporaryValue);
        temporaryValue = "";
      }
      return values;
    }
    __name(gettingDecodingSplitting, "gettingDecodingSplitting");
    function getDecodeSplit(name, list) {
      const value = list.get(name, true);
      if (value === null) {
        return null;
      }
      return gettingDecodingSplitting(value);
    }
    __name(getDecodeSplit, "getDecodeSplit");
    var textDecoder = new TextDecoder();
    function utf8DecodeBytes(buffer) {
      if (buffer.length === 0) {
        return "";
      }
      if (buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191) {
        buffer = buffer.subarray(3);
      }
      const output = textDecoder.decode(buffer);
      return output;
    }
    __name(utf8DecodeBytes, "utf8DecodeBytes");
    var _EnvironmentSettingsObjectBase = class _EnvironmentSettingsObjectBase {
      get baseUrl() {
        return getGlobalOrigin();
      }
      get origin() {
        return this.baseUrl?.origin;
      }
      policyContainer = makePolicyContainer();
    };
    __name(_EnvironmentSettingsObjectBase, "EnvironmentSettingsObjectBase");
    var EnvironmentSettingsObjectBase = _EnvironmentSettingsObjectBase;
    var _EnvironmentSettingsObject = class _EnvironmentSettingsObject {
      settingsObject = new EnvironmentSettingsObjectBase();
    };
    __name(_EnvironmentSettingsObject, "EnvironmentSettingsObject");
    var EnvironmentSettingsObject = _EnvironmentSettingsObject;
    var environmentSettingsObject = new EnvironmentSettingsObject();
    module2.exports = {
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
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/symbols.js
var require_symbols2 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/symbols.js"(exports2, module2) {
    "use strict";
    init_define_process();
    module2.exports = {
      kUrl: Symbol("url"),
      kHeaders: Symbol("headers"),
      kSignal: Symbol("signal"),
      kState: Symbol("state"),
      kDispatcher: Symbol("dispatcher")
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/file.js
var require_file = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/file.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Blob: Blob3, File: File2 } = require("buffer");
    var { kState } = require_symbols2();
    var { webidl } = require_webidl();
    var _FileLike = class _FileLike {
      constructor(blobLike, fileName, options = {}) {
        const n = fileName;
        const t = options.type;
        const d = options.lastModified ?? Date.now();
        this[kState] = {
          blobLike,
          name: n,
          type: t,
          lastModified: d
        };
      }
      stream(...args) {
        webidl.brandCheck(this, _FileLike);
        return this[kState].blobLike.stream(...args);
      }
      arrayBuffer(...args) {
        webidl.brandCheck(this, _FileLike);
        return this[kState].blobLike.arrayBuffer(...args);
      }
      slice(...args) {
        webidl.brandCheck(this, _FileLike);
        return this[kState].blobLike.slice(...args);
      }
      text(...args) {
        webidl.brandCheck(this, _FileLike);
        return this[kState].blobLike.text(...args);
      }
      get size() {
        webidl.brandCheck(this, _FileLike);
        return this[kState].blobLike.size;
      }
      get type() {
        webidl.brandCheck(this, _FileLike);
        return this[kState].blobLike.type;
      }
      get name() {
        webidl.brandCheck(this, _FileLike);
        return this[kState].name;
      }
      get lastModified() {
        webidl.brandCheck(this, _FileLike);
        return this[kState].lastModified;
      }
      get [Symbol.toStringTag]() {
        return "File";
      }
    };
    __name(_FileLike, "FileLike");
    var FileLike = _FileLike;
    webidl.converters.Blob = webidl.interfaceConverter(Blob3);
    function isFileLike(object) {
      return object instanceof File2 || object && (typeof object.stream === "function" || typeof object.arrayBuffer === "function") && object[Symbol.toStringTag] === "File";
    }
    __name(isFileLike, "isFileLike");
    module2.exports = { FileLike, isFileLike };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/formdata.js
var require_formdata = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/formdata.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { isBlobLike, iteratorMixin } = require_util2();
    var { kState } = require_symbols2();
    var { kEnumerableProperty } = require_util();
    var { FileLike, isFileLike } = require_file();
    var { webidl } = require_webidl();
    var { File: NativeFile } = require("buffer");
    var nodeUtil = require("util");
    var File2 = globalThis.File ?? NativeFile;
    var _FormData = class _FormData {
      constructor(form) {
        webidl.util.markAsUncloneable(this);
        if (form !== void 0) {
          throw webidl.errors.conversionFailed({
            prefix: "FormData constructor",
            argument: "Argument 1",
            types: ["undefined"]
          });
        }
        this[kState] = [];
      }
      append(name, value, filename = void 0) {
        webidl.brandCheck(this, _FormData);
        const prefix = "FormData.append";
        webidl.argumentLengthCheck(arguments, 2, prefix);
        if (arguments.length === 3 && !isBlobLike(value)) {
          throw new TypeError(
            "Failed to execute 'append' on 'FormData': parameter 2 is not of type 'Blob'"
          );
        }
        name = webidl.converters.USVString(name, prefix, "name");
        value = isBlobLike(value) ? webidl.converters.Blob(value, prefix, "value", { strict: false }) : webidl.converters.USVString(value, prefix, "value");
        filename = arguments.length === 3 ? webidl.converters.USVString(filename, prefix, "filename") : void 0;
        const entry = makeEntry(name, value, filename);
        this[kState].push(entry);
      }
      delete(name) {
        webidl.brandCheck(this, _FormData);
        const prefix = "FormData.delete";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        name = webidl.converters.USVString(name, prefix, "name");
        this[kState] = this[kState].filter((entry) => entry.name !== name);
      }
      get(name) {
        webidl.brandCheck(this, _FormData);
        const prefix = "FormData.get";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        name = webidl.converters.USVString(name, prefix, "name");
        const idx = this[kState].findIndex((entry) => entry.name === name);
        if (idx === -1) {
          return null;
        }
        return this[kState][idx].value;
      }
      getAll(name) {
        webidl.brandCheck(this, _FormData);
        const prefix = "FormData.getAll";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        name = webidl.converters.USVString(name, prefix, "name");
        return this[kState].filter((entry) => entry.name === name).map((entry) => entry.value);
      }
      has(name) {
        webidl.brandCheck(this, _FormData);
        const prefix = "FormData.has";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        name = webidl.converters.USVString(name, prefix, "name");
        return this[kState].findIndex((entry) => entry.name === name) !== -1;
      }
      set(name, value, filename = void 0) {
        webidl.brandCheck(this, _FormData);
        const prefix = "FormData.set";
        webidl.argumentLengthCheck(arguments, 2, prefix);
        if (arguments.length === 3 && !isBlobLike(value)) {
          throw new TypeError(
            "Failed to execute 'set' on 'FormData': parameter 2 is not of type 'Blob'"
          );
        }
        name = webidl.converters.USVString(name, prefix, "name");
        value = isBlobLike(value) ? webidl.converters.Blob(value, prefix, "name", { strict: false }) : webidl.converters.USVString(value, prefix, "name");
        filename = arguments.length === 3 ? webidl.converters.USVString(filename, prefix, "name") : void 0;
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
      [nodeUtil.inspect.custom](depth, options) {
        const state = this[kState].reduce((a, b) => {
          if (a[b.name]) {
            if (Array.isArray(a[b.name])) {
              a[b.name].push(b.value);
            } else {
              a[b.name] = [a[b.name], b.value];
            }
          } else {
            a[b.name] = b.value;
          }
          return a;
        }, { __proto__: null });
        options.depth ??= depth;
        options.colors ??= true;
        const output = nodeUtil.formatWithOptions(options, state);
        return `FormData ${output.slice(output.indexOf("]") + 2)}`;
      }
    };
    __name(_FormData, "FormData");
    var FormData2 = _FormData;
    iteratorMixin("FormData", FormData2, kState, "name", "value");
    Object.defineProperties(FormData2.prototype, {
      append: kEnumerableProperty,
      delete: kEnumerableProperty,
      get: kEnumerableProperty,
      getAll: kEnumerableProperty,
      has: kEnumerableProperty,
      set: kEnumerableProperty,
      [Symbol.toStringTag]: {
        value: "FormData",
        configurable: true
      }
    });
    function makeEntry(name, value, filename) {
      if (typeof value === "string") {
      } else {
        if (!isFileLike(value)) {
          value = value instanceof Blob ? new File2([value], "blob", { type: value.type }) : new FileLike(value, "blob", { type: value.type });
        }
        if (filename !== void 0) {
          const options = {
            type: value.type,
            lastModified: value.lastModified
          };
          value = value instanceof NativeFile ? new File2([value], filename, options) : new FileLike(value, filename, options);
        }
      }
      return { name, value };
    }
    __name(makeEntry, "makeEntry");
    module2.exports = { FormData: FormData2, makeEntry };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/formdata-parser.js
var require_formdata_parser = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/formdata-parser.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { isUSVString, bufferToLowerCasedHeaderName } = require_util();
    var { utf8DecodeBytes } = require_util2();
    var { HTTP_TOKEN_CODEPOINTS, isomorphicDecode } = require_data_url();
    var { isFileLike } = require_file();
    var { makeEntry } = require_formdata();
    var assert = require("assert");
    var { File: NodeFile } = require("buffer");
    var File2 = globalThis.File ?? NodeFile;
    var formDataNameBuffer = Buffer.from('form-data; name="');
    var filenameBuffer = Buffer.from("; filename");
    var dd = Buffer.from("--");
    var ddcrlf = Buffer.from("--\r\n");
    function isAsciiString(chars) {
      for (let i = 0; i < chars.length; ++i) {
        if ((chars.charCodeAt(i) & ~127) !== 0) {
          return false;
        }
      }
      return true;
    }
    __name(isAsciiString, "isAsciiString");
    function validateBoundary(boundary) {
      const length = boundary.length;
      if (length < 27 || length > 70) {
        return false;
      }
      for (let i = 0; i < length; ++i) {
        const cp = boundary.charCodeAt(i);
        if (!(cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 39 || cp === 45 || cp === 95)) {
          return false;
        }
      }
      return true;
    }
    __name(validateBoundary, "validateBoundary");
    function multipartFormDataParser(input, mimeType) {
      assert(mimeType !== "failure" && mimeType.essence === "multipart/form-data");
      const boundaryString = mimeType.parameters.get("boundary");
      if (boundaryString === void 0) {
        return "failure";
      }
      const boundary = Buffer.from(`--${boundaryString}`, "utf8");
      const entryList = [];
      const position = { position: 0 };
      while (input[position.position] === 13 && input[position.position + 1] === 10) {
        position.position += 2;
      }
      let trailing = input.length;
      while (input[trailing - 1] === 10 && input[trailing - 2] === 13) {
        trailing -= 2;
      }
      if (trailing !== input.length) {
        input = input.subarray(0, trailing);
      }
      while (true) {
        if (input.subarray(position.position, position.position + boundary.length).equals(boundary)) {
          position.position += boundary.length;
        } else {
          return "failure";
        }
        if (position.position === input.length - 2 && bufferStartsWith(input, dd, position) || position.position === input.length - 4 && bufferStartsWith(input, ddcrlf, position)) {
          return entryList;
        }
        if (input[position.position] !== 13 || input[position.position + 1] !== 10) {
          return "failure";
        }
        position.position += 2;
        const result = parseMultipartFormDataHeaders(input, position);
        if (result === "failure") {
          return "failure";
        }
        let { name, filename, contentType, encoding } = result;
        position.position += 2;
        let body;
        {
          const boundaryIndex = input.indexOf(boundary.subarray(2), position.position);
          if (boundaryIndex === -1) {
            return "failure";
          }
          body = input.subarray(position.position, boundaryIndex - 4);
          position.position += body.length;
          if (encoding === "base64") {
            body = Buffer.from(body.toString(), "base64");
          }
        }
        if (input[position.position] !== 13 || input[position.position + 1] !== 10) {
          return "failure";
        } else {
          position.position += 2;
        }
        let value;
        if (filename !== null) {
          contentType ??= "text/plain";
          if (!isAsciiString(contentType)) {
            contentType = "";
          }
          value = new File2([body], filename, { type: contentType });
        } else {
          value = utf8DecodeBytes(Buffer.from(body));
        }
        assert(isUSVString(name));
        assert(typeof value === "string" && isUSVString(value) || isFileLike(value));
        entryList.push(makeEntry(name, value, filename));
      }
    }
    __name(multipartFormDataParser, "multipartFormDataParser");
    function parseMultipartFormDataHeaders(input, position) {
      let name = null;
      let filename = null;
      let contentType = null;
      let encoding = null;
      while (true) {
        if (input[position.position] === 13 && input[position.position + 1] === 10) {
          if (name === null) {
            return "failure";
          }
          return { name, filename, contentType, encoding };
        }
        let headerName = collectASequenceOfBytes(
          (char) => char !== 10 && char !== 13 && char !== 58,
          input,
          position
        );
        headerName = removeChars(headerName, true, true, (char) => char === 9 || char === 32);
        if (!HTTP_TOKEN_CODEPOINTS.test(headerName.toString())) {
          return "failure";
        }
        if (input[position.position] !== 58) {
          return "failure";
        }
        position.position++;
        collectASequenceOfBytes(
          (char) => char === 32 || char === 9,
          input,
          position
        );
        switch (bufferToLowerCasedHeaderName(headerName)) {
          case "content-disposition": {
            name = filename = null;
            if (!bufferStartsWith(input, formDataNameBuffer, position)) {
              return "failure";
            }
            position.position += 17;
            name = parseMultipartFormDataName(input, position);
            if (name === null) {
              return "failure";
            }
            if (bufferStartsWith(input, filenameBuffer, position)) {
              let check = position.position + filenameBuffer.length;
              if (input[check] === 42) {
                position.position += 1;
                check += 1;
              }
              if (input[check] !== 61 || input[check + 1] !== 34) {
                return "failure";
              }
              position.position += 12;
              filename = parseMultipartFormDataName(input, position);
              if (filename === null) {
                return "failure";
              }
            }
            break;
          }
          case "content-type": {
            let headerValue = collectASequenceOfBytes(
              (char) => char !== 10 && char !== 13,
              input,
              position
            );
            headerValue = removeChars(headerValue, false, true, (char) => char === 9 || char === 32);
            contentType = isomorphicDecode(headerValue);
            break;
          }
          case "content-transfer-encoding": {
            let headerValue = collectASequenceOfBytes(
              (char) => char !== 10 && char !== 13,
              input,
              position
            );
            headerValue = removeChars(headerValue, false, true, (char) => char === 9 || char === 32);
            encoding = isomorphicDecode(headerValue);
            break;
          }
          default: {
            collectASequenceOfBytes(
              (char) => char !== 10 && char !== 13,
              input,
              position
            );
          }
        }
        if (input[position.position] !== 13 && input[position.position + 1] !== 10) {
          return "failure";
        } else {
          position.position += 2;
        }
      }
    }
    __name(parseMultipartFormDataHeaders, "parseMultipartFormDataHeaders");
    function parseMultipartFormDataName(input, position) {
      assert(input[position.position - 1] === 34);
      let name = collectASequenceOfBytes(
        (char) => char !== 10 && char !== 13 && char !== 34,
        input,
        position
      );
      if (input[position.position] !== 34) {
        return null;
      } else {
        position.position++;
      }
      name = new TextDecoder().decode(name).replace(/%0A/ig, "\n").replace(/%0D/ig, "\r").replace(/%22/g, '"');
      return name;
    }
    __name(parseMultipartFormDataName, "parseMultipartFormDataName");
    function collectASequenceOfBytes(condition, input, position) {
      let start = position.position;
      while (start < input.length && condition(input[start])) {
        ++start;
      }
      return input.subarray(position.position, position.position = start);
    }
    __name(collectASequenceOfBytes, "collectASequenceOfBytes");
    function removeChars(buf, leading, trailing, predicate) {
      let lead = 0;
      let trail = buf.length - 1;
      if (leading) {
        while (lead < buf.length && predicate(buf[lead]))
          lead++;
      }
      if (trailing) {
        while (trail > 0 && predicate(buf[trail]))
          trail--;
      }
      return lead === 0 && trail === buf.length - 1 ? buf : buf.subarray(lead, trail + 1);
    }
    __name(removeChars, "removeChars");
    function bufferStartsWith(buffer, start, position) {
      if (buffer.length < start.length) {
        return false;
      }
      for (let i = 0; i < start.length; i++) {
        if (start[i] !== buffer[position.position + i]) {
          return false;
        }
      }
      return true;
    }
    __name(bufferStartsWith, "bufferStartsWith");
    module2.exports = {
      multipartFormDataParser,
      validateBoundary
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/body.js
var require_body = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/body.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var util = require_util();
    var {
      ReadableStreamFrom,
      isBlobLike,
      isReadableStreamLike,
      readableStreamClose,
      createDeferredPromise,
      fullyReadBody,
      extractMimeType,
      utf8DecodeBytes
    } = require_util2();
    var { FormData: FormData2 } = require_formdata();
    var { kState } = require_symbols2();
    var { webidl } = require_webidl();
    var { Blob: Blob3 } = require("buffer");
    var assert = require("assert");
    var { isErrored, isDisturbed } = require("stream");
    var { isArrayBuffer } = require("util/types");
    var { serializeAMimeType } = require_data_url();
    var { multipartFormDataParser } = require_formdata_parser();
    var textEncoder = new TextEncoder();
    function noop() {
    }
    __name(noop, "noop");
    var hasFinalizationRegistry = globalThis.FinalizationRegistry && define_process_default.version.indexOf("v18") !== 0;
    var streamRegistry;
    if (hasFinalizationRegistry) {
      streamRegistry = new FinalizationRegistry((weakRef) => {
        const stream = weakRef.deref();
        if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
          stream.cancel("Response object has been garbage collected").catch(noop);
        }
      });
    }
    function extractBody(object, keepalive = false) {
      let stream = null;
      if (object instanceof ReadableStream) {
        stream = object;
      } else if (isBlobLike(object)) {
        stream = object.stream();
      } else {
        stream = new ReadableStream({
          async pull(controller) {
            const buffer = typeof source === "string" ? textEncoder.encode(source) : source;
            if (buffer.byteLength) {
              controller.enqueue(buffer);
            }
            queueMicrotask(() => readableStreamClose(controller));
          },
          start() {
          },
          type: "bytes"
        });
      }
      assert(isReadableStreamLike(stream));
      let action = null;
      let source = null;
      let length = null;
      let type = null;
      if (typeof object === "string") {
        source = object;
        type = "text/plain;charset=UTF-8";
      } else if (object instanceof URLSearchParams) {
        source = object.toString();
        type = "application/x-www-form-urlencoded;charset=UTF-8";
      } else if (isArrayBuffer(object)) {
        source = new Uint8Array(object.slice());
      } else if (ArrayBuffer.isView(object)) {
        source = new Uint8Array(object.buffer.slice(object.byteOffset, object.byteOffset + object.byteLength));
      } else if (util.isFormDataLike(object)) {
        const boundary = `----formdata-undici-0${`${Math.floor(Math.random() * 1e11)}`.padStart(11, "0")}`;
        const prefix = `--${boundary}\r
Content-Disposition: form-data`;
        const escape = /* @__PURE__ */ __name((str) => str.replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/"/g, "%22"), "escape");
        const normalizeLinefeeds = /* @__PURE__ */ __name((value) => value.replace(/\r?\n|\r/g, "\r\n"), "normalizeLinefeeds");
        const blobParts = [];
        const rn = new Uint8Array([13, 10]);
        length = 0;
        let hasUnknownSizeValue = false;
        for (const [name, value] of object) {
          if (typeof value === "string") {
            const chunk2 = textEncoder.encode(prefix + `; name="${escape(normalizeLinefeeds(name))}"\r
\r
${normalizeLinefeeds(value)}\r
`);
            blobParts.push(chunk2);
            length += chunk2.byteLength;
          } else {
            const chunk2 = textEncoder.encode(`${prefix}; name="${escape(normalizeLinefeeds(name))}"` + (value.name ? `; filename="${escape(value.name)}"` : "") + `\r
Content-Type: ${value.type || "application/octet-stream"}\r
\r
`);
            blobParts.push(chunk2, value, rn);
            if (typeof value.size === "number") {
              length += chunk2.byteLength + value.size + rn.byteLength;
            } else {
              hasUnknownSizeValue = true;
            }
          }
        }
        const chunk = textEncoder.encode(`--${boundary}--`);
        blobParts.push(chunk);
        length += chunk.byteLength;
        if (hasUnknownSizeValue) {
          length = null;
        }
        source = object;
        action = /* @__PURE__ */ __name(async function* () {
          for (const part of blobParts) {
            if (part.stream) {
              yield* part.stream();
            } else {
              yield part;
            }
          }
        }, "action");
        type = `multipart/form-data; boundary=${boundary}`;
      } else if (isBlobLike(object)) {
        source = object;
        length = object.size;
        if (object.type) {
          type = object.type;
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
                controller.byobRequest?.respond(0);
              });
            } else {
              if (!isErrored(stream)) {
                const buffer = new Uint8Array(value);
                if (buffer.byteLength) {
                  controller.enqueue(buffer);
                }
              }
            }
            return controller.desiredSize > 0;
          },
          async cancel(reason) {
            await iterator.return();
          },
          type: "bytes"
        });
      }
      const body = { stream, source, length };
      return [body, type];
    }
    __name(extractBody, "extractBody");
    function safelyExtractBody(object, keepalive = false) {
      if (object instanceof ReadableStream) {
        assert(!util.isDisturbed(object), "The body has already been consumed.");
        assert(!object.locked, "The stream is locked.");
      }
      return extractBody(object, keepalive);
    }
    __name(safelyExtractBody, "safelyExtractBody");
    function cloneBody(instance, body) {
      const [out1, out2] = body.stream.tee();
      if (hasFinalizationRegistry) {
        streamRegistry.register(instance, new WeakRef(out1));
      }
      body.stream = out1;
      return {
        stream: out2,
        length: body.length,
        source: body.source
      };
    }
    __name(cloneBody, "cloneBody");
    function throwIfAborted(state) {
      if (state.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
    }
    __name(throwIfAborted, "throwIfAborted");
    function bodyMixinMethods(instance) {
      const methods = {
        blob() {
          return consumeBody(this, (bytes) => {
            let mimeType = bodyMimeType(this);
            if (mimeType === null) {
              mimeType = "";
            } else if (mimeType) {
              mimeType = serializeAMimeType(mimeType);
            }
            return new Blob3([bytes], { type: mimeType });
          }, instance);
        },
        arrayBuffer() {
          return consumeBody(this, (bytes) => {
            return new Uint8Array(bytes).buffer;
          }, instance);
        },
        text() {
          return consumeBody(this, utf8DecodeBytes, instance);
        },
        json() {
          return consumeBody(this, parseJSONFromBytes, instance);
        },
        formData() {
          return consumeBody(this, (value) => {
            const mimeType = bodyMimeType(this);
            if (mimeType !== null) {
              switch (mimeType.essence) {
                case "multipart/form-data": {
                  const parsed = multipartFormDataParser(value, mimeType);
                  if (parsed === "failure") {
                    throw new TypeError("Failed to parse body as FormData.");
                  }
                  const fd = new FormData2();
                  fd[kState] = parsed;
                  return fd;
                }
                case "application/x-www-form-urlencoded": {
                  const entries = new URLSearchParams(value.toString());
                  const fd = new FormData2();
                  for (const [name, value2] of entries) {
                    fd.append(name, value2);
                  }
                  return fd;
                }
              }
            }
            throw new TypeError(
              'Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".'
            );
          }, instance);
        },
        bytes() {
          return consumeBody(this, (bytes) => {
            return new Uint8Array(bytes);
          }, instance);
        }
      };
      return methods;
    }
    __name(bodyMixinMethods, "bodyMixinMethods");
    function mixinBody(prototype) {
      Object.assign(prototype.prototype, bodyMixinMethods(prototype));
    }
    __name(mixinBody, "mixinBody");
    async function consumeBody(object, convertBytesToJSValue, instance) {
      webidl.brandCheck(object, instance);
      if (bodyUnusable(object)) {
        throw new TypeError("Body is unusable: Body has already been read");
      }
      throwIfAborted(object[kState]);
      const promise = createDeferredPromise();
      const errorSteps = /* @__PURE__ */ __name((error) => promise.reject(error), "errorSteps");
      const successSteps = /* @__PURE__ */ __name((data) => {
        try {
          promise.resolve(convertBytesToJSValue(data));
        } catch (e) {
          errorSteps(e);
        }
      }, "successSteps");
      if (object[kState].body == null) {
        successSteps(Buffer.allocUnsafe(0));
        return promise.promise;
      }
      await fullyReadBody(object[kState].body, successSteps, errorSteps);
      return promise.promise;
    }
    __name(consumeBody, "consumeBody");
    function bodyUnusable(object) {
      const body = object[kState].body;
      return body != null && (body.stream.locked || util.isDisturbed(body.stream));
    }
    __name(bodyUnusable, "bodyUnusable");
    function parseJSONFromBytes(bytes) {
      return JSON.parse(utf8DecodeBytes(bytes));
    }
    __name(parseJSONFromBytes, "parseJSONFromBytes");
    function bodyMimeType(requestOrResponse) {
      const headers = requestOrResponse[kState].headersList;
      const mimeType = extractMimeType(headers);
      if (mimeType === "failure") {
        return null;
      }
      return mimeType;
    }
    __name(bodyMimeType, "bodyMimeType");
    module2.exports = {
      extractBody,
      safelyExtractBody,
      cloneBody,
      mixinBody,
      streamRegistry,
      hasFinalizationRegistry,
      bodyUnusable
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/client-h1.js
var require_client_h1 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/client-h1.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var util = require_util();
    var { channels } = require_diagnostics();
    var timers = require_timers();
    var {
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
    } = require_errors();
    var {
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
    } = require_symbols();
    var constants = require_constants2();
    var EMPTY_BUF = Buffer.alloc(0);
    var FastBuffer = Buffer[Symbol.species];
    var addListener = util.addListener;
    var removeAllListeners = util.removeAllListeners;
    var extractBody;
    async function lazyllhttp() {
      const llhttpWasmData = define_process_default.env.JEST_WORKER_ID ? require_llhttp_wasm() : void 0;
      let mod;
      try {
        mod = await WebAssembly.compile(require_llhttp_simd_wasm());
      } catch (e) {
        mod = await WebAssembly.compile(llhttpWasmData || require_llhttp_wasm());
      }
      return await WebAssembly.instantiate(mod, {
        env: {
          /* eslint-disable camelcase */
          wasm_on_url: (p, at, len) => {
            return 0;
          },
          wasm_on_status: (p, at, len) => {
            assert(currentParser.ptr === p);
            const start = at - currentBufferPtr + currentBufferRef.byteOffset;
            return currentParser.onStatus(new FastBuffer(currentBufferRef.buffer, start, len)) || 0;
          },
          wasm_on_message_begin: (p) => {
            assert(currentParser.ptr === p);
            return currentParser.onMessageBegin() || 0;
          },
          wasm_on_header_field: (p, at, len) => {
            assert(currentParser.ptr === p);
            const start = at - currentBufferPtr + currentBufferRef.byteOffset;
            return currentParser.onHeaderField(new FastBuffer(currentBufferRef.buffer, start, len)) || 0;
          },
          wasm_on_header_value: (p, at, len) => {
            assert(currentParser.ptr === p);
            const start = at - currentBufferPtr + currentBufferRef.byteOffset;
            return currentParser.onHeaderValue(new FastBuffer(currentBufferRef.buffer, start, len)) || 0;
          },
          wasm_on_headers_complete: (p, statusCode, upgrade, shouldKeepAlive) => {
            assert(currentParser.ptr === p);
            return currentParser.onHeadersComplete(statusCode, Boolean(upgrade), Boolean(shouldKeepAlive)) || 0;
          },
          wasm_on_body: (p, at, len) => {
            assert(currentParser.ptr === p);
            const start = at - currentBufferPtr + currentBufferRef.byteOffset;
            return currentParser.onBody(new FastBuffer(currentBufferRef.buffer, start, len)) || 0;
          },
          wasm_on_message_complete: (p) => {
            assert(currentParser.ptr === p);
            return currentParser.onMessageComplete() || 0;
          }
          /* eslint-enable camelcase */
        }
      });
    }
    __name(lazyllhttp, "lazyllhttp");
    var llhttpInstance = null;
    var llhttpPromise = lazyllhttp();
    llhttpPromise.catch();
    var currentParser = null;
    var currentBufferRef = null;
    var currentBufferSize = 0;
    var currentBufferPtr = null;
    var USE_NATIVE_TIMER = 0;
    var USE_FAST_TIMER = 1;
    var TIMEOUT_HEADERS = 2 | USE_FAST_TIMER;
    var TIMEOUT_BODY = 4 | USE_FAST_TIMER;
    var TIMEOUT_KEEP_ALIVE = 8 | USE_NATIVE_TIMER;
    var _Parser = class _Parser {
      constructor(client, socket, { exports: exports3 }) {
        assert(Number.isFinite(client[kMaxHeadersSize]) && client[kMaxHeadersSize] > 0);
        this.llhttp = exports3;
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
        this.connection = "";
        this.maxResponseSize = client[kMaxResponseSize];
      }
      setTimeout(delay, type) {
        if (delay !== this.timeoutValue || type & USE_FAST_TIMER ^ this.timeoutType & USE_FAST_TIMER) {
          if (this.timeout) {
            timers.clearTimeout(this.timeout);
            this.timeout = null;
          }
          if (delay) {
            if (type & USE_FAST_TIMER) {
              this.timeout = timers.setFastTimeout(onParserTimeout, delay, new WeakRef(this));
            } else {
              this.timeout = setTimeout(onParserTimeout, delay, new WeakRef(this));
              this.timeout.unref();
            }
          }
          this.timeoutValue = delay;
        } else if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        this.timeoutType = type;
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
              message = "Response does not match the HTTP/1.1 protocol (" + Buffer.from(llhttp.memory.buffer, ptr, len).toString() + ")";
            }
            throw new HTTPParserError(message, constants.ERROR[ret], data.slice(offset));
          }
        } catch (err) {
          util.destroy(socket, err);
        }
      }
      destroy() {
        assert(this.ptr != null);
        assert(currentParser == null);
        this.llhttp.llhttp_free(this.ptr);
        this.ptr = null;
        this.timeout && timers.clearTimeout(this.timeout);
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
        request.onResponseStarted();
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
        if (key.length === 10) {
          const headerName = util.bufferToLowerCasedHeaderName(key);
          if (headerName === "keep-alive") {
            this.keepAlive += buf.toString();
          } else if (headerName === "connection") {
            this.connection += buf.toString();
          }
        } else if (key.length === 14 && util.bufferToLowerCasedHeaderName(key) === "content-length") {
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
        assert(client[kSocket] === socket);
        assert(!socket.destroyed);
        assert(!this.paused);
        assert((headers.length & 1) === 0);
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert(request.upgrade || request.method === "CONNECT");
        this.statusCode = null;
        this.statusText = "";
        this.shouldKeepAlive = null;
        this.headers = [];
        this.headersSize = 0;
        socket.unshift(head);
        socket[kParser].destroy();
        socket[kParser] = null;
        socket[kClient] = null;
        socket[kError] = null;
        removeAllListeners(socket);
        client[kSocket] = null;
        client[kHTTPContext] = null;
        client[kQueue][client[kRunningIdx]++] = null;
        client.emit("disconnect", client[kUrl], [client], new InformationalError("upgrade"));
        try {
          request.onUpgrade(statusCode, headers, socket);
        } catch (err) {
          util.destroy(socket, err);
        }
        client[kResume]();
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
        assert(this.timeoutType === TIMEOUT_HEADERS);
        this.statusCode = statusCode;
        this.shouldKeepAlive = shouldKeepAlive || // Override llhttp value which does not allow keepAlive for HEAD.
        request.method === "HEAD" && !socket[kReset] && this.connection.toLowerCase() === "keep-alive";
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
        assert((this.headers.length & 1) === 0);
        this.headers = [];
        this.headersSize = 0;
        if (this.shouldKeepAlive && client[kPipelining]) {
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
        const pause = request.onHeaders(statusCode, headers, this.resume, statusText) === false;
        if (request.aborted) {
          return -1;
        }
        if (request.method === "HEAD") {
          return 1;
        }
        if (statusCode < 200) {
          return 1;
        }
        if (socket[kBlocking]) {
          socket[kBlocking] = false;
          client[kResume]();
        }
        return pause ? constants.ERROR.PAUSED : 0;
      }
      onBody(buf) {
        const { client, socket, statusCode, maxResponseSize } = this;
        if (socket.destroyed) {
          return -1;
        }
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        assert(this.timeoutType === TIMEOUT_BODY);
        if (this.timeout) {
          if (this.timeout.refresh) {
            this.timeout.refresh();
          }
        }
        assert(statusCode >= 200);
        if (maxResponseSize > -1 && this.bytesRead + buf.length > maxResponseSize) {
          util.destroy(socket, new ResponseExceededMaxSizeError());
          return -1;
        }
        this.bytesRead += buf.length;
        if (request.onData(buf) === false) {
          return constants.ERROR.PAUSED;
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
        assert(statusCode >= 100);
        assert((this.headers.length & 1) === 0);
        const request = client[kQueue][client[kRunningIdx]];
        assert(request);
        this.statusCode = null;
        this.statusText = "";
        this.bytesRead = 0;
        this.contentLength = "";
        this.keepAlive = "";
        this.connection = "";
        this.headers = [];
        this.headersSize = 0;
        if (statusCode < 200) {
          return;
        }
        if (request.method !== "HEAD" && contentLength && bytesRead !== parseInt(contentLength, 10)) {
          util.destroy(socket, new ResponseContentLengthMismatchError());
          return -1;
        }
        request.onComplete(headers);
        client[kQueue][client[kRunningIdx]++] = null;
        if (socket[kWriting]) {
          assert(client[kRunning] === 0);
          util.destroy(socket, new InformationalError("reset"));
          return constants.ERROR.PAUSED;
        } else if (!shouldKeepAlive) {
          util.destroy(socket, new InformationalError("reset"));
          return constants.ERROR.PAUSED;
        } else if (socket[kReset] && client[kRunning] === 0) {
          util.destroy(socket, new InformationalError("reset"));
          return constants.ERROR.PAUSED;
        } else if (client[kPipelining] == null || client[kPipelining] === 1) {
          setImmediate(() => client[kResume]());
        } else {
          client[kResume]();
        }
      }
    };
    __name(_Parser, "Parser");
    var Parser = _Parser;
    function onParserTimeout(parser) {
      const { socket, timeoutType, client, paused } = parser.deref();
      if (timeoutType === TIMEOUT_HEADERS) {
        if (!socket[kWriting] || socket.writableNeedDrain || client[kRunning] > 1) {
          assert(!paused, "cannot be paused while waiting for headers");
          util.destroy(socket, new HeadersTimeoutError());
        }
      } else if (timeoutType === TIMEOUT_BODY) {
        if (!paused) {
          util.destroy(socket, new BodyTimeoutError());
        }
      } else if (timeoutType === TIMEOUT_KEEP_ALIVE) {
        assert(client[kRunning] === 0 && client[kKeepAliveTimeoutValue]);
        util.destroy(socket, new InformationalError("socket idle timeout"));
      }
    }
    __name(onParserTimeout, "onParserTimeout");
    async function connectH1(client, socket) {
      client[kSocket] = socket;
      if (!llhttpInstance) {
        llhttpInstance = await llhttpPromise;
        llhttpPromise = null;
      }
      socket[kNoRef] = false;
      socket[kWriting] = false;
      socket[kReset] = false;
      socket[kBlocking] = false;
      socket[kParser] = new Parser(client, socket, llhttpInstance);
      addListener(socket, "error", function(err) {
        assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
        const parser = this[kParser];
        if (err.code === "ECONNRESET" && parser.statusCode && !parser.shouldKeepAlive) {
          parser.onMessageComplete();
          return;
        }
        this[kError] = err;
        this[kClient][kOnError](err);
      });
      addListener(socket, "readable", function() {
        const parser = this[kParser];
        if (parser) {
          parser.readMore();
        }
      });
      addListener(socket, "end", function() {
        const parser = this[kParser];
        if (parser.statusCode && !parser.shouldKeepAlive) {
          parser.onMessageComplete();
          return;
        }
        util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
      });
      addListener(socket, "close", function() {
        const client2 = this[kClient];
        const parser = this[kParser];
        if (parser) {
          if (!this[kError] && parser.statusCode && !parser.shouldKeepAlive) {
            parser.onMessageComplete();
          }
          this[kParser].destroy();
          this[kParser] = null;
        }
        const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
        client2[kSocket] = null;
        client2[kHTTPContext] = null;
        if (client2.destroyed) {
          assert(client2[kPending] === 0);
          const requests = client2[kQueue].splice(client2[kRunningIdx]);
          for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            util.errorRequest(client2, request, err);
          }
        } else if (client2[kRunning] > 0 && err.code !== "UND_ERR_INFO") {
          const request = client2[kQueue][client2[kRunningIdx]];
          client2[kQueue][client2[kRunningIdx]++] = null;
          util.errorRequest(client2, request, err);
        }
        client2[kPendingIdx] = client2[kRunningIdx];
        assert(client2[kRunning] === 0);
        client2.emit("disconnect", client2[kUrl], [client2], err);
        client2[kResume]();
      });
      let closed = false;
      socket.on("close", () => {
        closed = true;
      });
      return {
        version: "h1",
        defaultPipelining: 1,
        write(...args) {
          return writeH1(client, ...args);
        },
        resume() {
          resumeH1(client);
        },
        destroy(err, callback) {
          if (closed) {
            queueMicrotask(callback);
          } else {
            socket.destroy(err).on("close", callback);
          }
        },
        get destroyed() {
          return socket.destroyed;
        },
        busy(request) {
          if (socket[kWriting] || socket[kReset] || socket[kBlocking]) {
            return true;
          }
          if (request) {
            if (client[kRunning] > 0 && !request.idempotent) {
              return true;
            }
            if (client[kRunning] > 0 && (request.upgrade || request.method === "CONNECT")) {
              return true;
            }
            if (client[kRunning] > 0 && util.bodyLength(request.body) !== 0 && (util.isStream(request.body) || util.isAsyncIterable(request.body) || util.isFormDataLike(request.body))) {
              return true;
            }
          }
          return false;
        }
      };
    }
    __name(connectH1, "connectH1");
    function resumeH1(client) {
      const socket = client[kSocket];
      if (socket && !socket.destroyed) {
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
          if (socket[kParser].timeoutType !== TIMEOUT_KEEP_ALIVE) {
            socket[kParser].setTimeout(client[kKeepAliveTimeoutValue], TIMEOUT_KEEP_ALIVE);
          }
        } else if (client[kRunning] > 0 && socket[kParser].statusCode < 200) {
          if (socket[kParser].timeoutType !== TIMEOUT_HEADERS) {
            const request = client[kQueue][client[kRunningIdx]];
            const headersTimeout = request.headersTimeout != null ? request.headersTimeout : client[kHeadersTimeout];
            socket[kParser].setTimeout(headersTimeout, TIMEOUT_HEADERS);
          }
        }
      }
    }
    __name(resumeH1, "resumeH1");
    function shouldSendContentLength(method) {
      return method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE" && method !== "CONNECT";
    }
    __name(shouldSendContentLength, "shouldSendContentLength");
    function writeH1(client, request) {
      const { method, path, host, upgrade, blocking, reset } = request;
      let { body, headers, contentLength } = request;
      const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH" || method === "QUERY" || method === "PROPFIND" || method === "PROPPATCH";
      if (util.isFormDataLike(body)) {
        if (!extractBody) {
          extractBody = require_body().extractBody;
        }
        const [bodyStream, contentType] = extractBody(body);
        if (request.contentType == null) {
          headers.push("content-type", contentType);
        }
        body = bodyStream.stream;
        contentLength = bodyStream.length;
      } else if (util.isBlobLike(body) && request.contentType == null && body.type) {
        headers.push("content-type", body.type);
      }
      if (body && typeof body.read === "function") {
        body.read(0);
      }
      const bodyLength = util.bodyLength(body);
      contentLength = bodyLength ?? contentLength;
      if (contentLength === null) {
        contentLength = request.contentLength;
      }
      if (contentLength === 0 && !expectsPayload) {
        contentLength = null;
      }
      if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength !== null && request.contentLength !== contentLength) {
        if (client[kStrictContentLength]) {
          util.errorRequest(client, request, new RequestContentLengthMismatchError());
          return false;
        }
        define_process_default.emitWarning(new RequestContentLengthMismatchError());
      }
      const socket = client[kSocket];
      const abort = /* @__PURE__ */ __name((err) => {
        if (request.aborted || request.completed) {
          return;
        }
        util.errorRequest(client, request, err || new RequestAbortedError());
        util.destroy(body);
        util.destroy(socket, new InformationalError("aborted"));
      }, "abort");
      try {
        request.onConnect(abort);
      } catch (err) {
        util.errorRequest(client, request, err);
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
      if (reset != null) {
        socket[kReset] = reset;
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
      } else if (client[kPipelining] && !socket[kReset]) {
        header += "connection: keep-alive\r\n";
      } else {
        header += "connection: close\r\n";
      }
      if (Array.isArray(headers)) {
        for (let n = 0; n < headers.length; n += 2) {
          const key = headers[n + 0];
          const val = headers[n + 1];
          if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
              header += `${key}: ${val[i]}\r
`;
            }
          } else {
            header += `${key}: ${val}\r
`;
          }
        }
      }
      if (channels.sendHeaders.hasSubscribers) {
        channels.sendHeaders.publish({ request, headers: header, socket });
      }
      if (!body || bodyLength === 0) {
        writeBuffer(abort, null, client, request, socket, contentLength, header, expectsPayload);
      } else if (util.isBuffer(body)) {
        writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload);
      } else if (util.isBlobLike(body)) {
        if (typeof body.stream === "function") {
          writeIterable(abort, body.stream(), client, request, socket, contentLength, header, expectsPayload);
        } else {
          writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload);
        }
      } else if (util.isStream(body)) {
        writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload);
      } else if (util.isIterable(body)) {
        writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload);
      } else {
        assert(false);
      }
      return true;
    }
    __name(writeH1, "writeH1");
    function writeStream(abort, body, client, request, socket, contentLength, header, expectsPayload) {
      assert(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
      let finished = false;
      const writer = new AsyncWriter({ abort, socket, request, contentLength, client, expectsPayload, header });
      const onData = /* @__PURE__ */ __name(function(chunk) {
        if (finished) {
          return;
        }
        try {
          if (!writer.write(chunk) && this.pause) {
            this.pause();
          }
        } catch (err) {
          util.destroy(this, err);
        }
      }, "onData");
      const onDrain = /* @__PURE__ */ __name(function() {
        if (finished) {
          return;
        }
        if (body.resume) {
          body.resume();
        }
      }, "onDrain");
      const onClose = /* @__PURE__ */ __name(function() {
        queueMicrotask(() => {
          body.removeListener("error", onFinished);
        });
        if (!finished) {
          const err = new RequestAbortedError();
          queueMicrotask(() => onFinished(err));
        }
      }, "onClose");
      const onFinished = /* @__PURE__ */ __name(function(err) {
        if (finished) {
          return;
        }
        finished = true;
        assert(socket.destroyed || socket[kWriting] && client[kRunning] <= 1);
        socket.off("drain", onDrain).off("error", onFinished);
        body.removeListener("data", onData).removeListener("end", onFinished).removeListener("close", onClose);
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
      body.on("data", onData).on("end", onFinished).on("error", onFinished).on("close", onClose);
      if (body.resume) {
        body.resume();
      }
      socket.on("drain", onDrain).on("error", onFinished);
      if (body.errorEmitted ?? body.errored) {
        setImmediate(() => onFinished(body.errored));
      } else if (body.endEmitted ?? body.readableEnded) {
        setImmediate(() => onFinished(null));
      }
      if (body.closeEmitted ?? body.closed) {
        setImmediate(onClose);
      }
    }
    __name(writeStream, "writeStream");
    function writeBuffer(abort, body, client, request, socket, contentLength, header, expectsPayload) {
      try {
        if (!body) {
          if (contentLength === 0) {
            socket.write(`${header}content-length: 0\r
\r
`, "latin1");
          } else {
            assert(contentLength === null, "no body must not have content length");
            socket.write(`${header}\r
`, "latin1");
          }
        } else if (util.isBuffer(body)) {
          assert(contentLength === body.byteLength, "buffer body must have content length");
          socket.cork();
          socket.write(`${header}content-length: ${contentLength}\r
\r
`, "latin1");
          socket.write(body);
          socket.uncork();
          request.onBodySent(body);
          if (!expectsPayload && request.reset !== false) {
            socket[kReset] = true;
          }
        }
        request.onRequestSent();
        client[kResume]();
      } catch (err) {
        abort(err);
      }
    }
    __name(writeBuffer, "writeBuffer");
    async function writeBlob(abort, body, client, request, socket, contentLength, header, expectsPayload) {
      assert(contentLength === body.size, "blob body must have content length");
      try {
        if (contentLength != null && contentLength !== body.size) {
          throw new RequestContentLengthMismatchError();
        }
        const buffer = Buffer.from(await body.arrayBuffer());
        socket.cork();
        socket.write(`${header}content-length: ${contentLength}\r
\r
`, "latin1");
        socket.write(buffer);
        socket.uncork();
        request.onBodySent(buffer);
        request.onRequestSent();
        if (!expectsPayload && request.reset !== false) {
          socket[kReset] = true;
        }
        client[kResume]();
      } catch (err) {
        abort(err);
      }
    }
    __name(writeBlob, "writeBlob");
    async function writeIterable(abort, body, client, request, socket, contentLength, header, expectsPayload) {
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
      const writer = new AsyncWriter({ abort, socket, request, contentLength, client, expectsPayload, header });
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
    var _AsyncWriter = class _AsyncWriter {
      constructor({ abort, socket, request, contentLength, client, expectsPayload, header }) {
        this.socket = socket;
        this.request = request;
        this.contentLength = contentLength;
        this.client = client;
        this.bytesWritten = 0;
        this.expectsPayload = expectsPayload;
        this.header = header;
        this.abort = abort;
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
        socket.cork();
        if (bytesWritten === 0) {
          if (!expectsPayload && request.reset !== false) {
            socket[kReset] = true;
          }
          if (contentLength === null) {
            socket.write(`${header}transfer-encoding: chunked\r
`, "latin1");
          } else {
            socket.write(`${header}content-length: ${contentLength}\r
\r
`, "latin1");
          }
        }
        if (contentLength === null) {
          socket.write(`\r
${len.toString(16)}\r
`, "latin1");
        }
        this.bytesWritten += len;
        const ret = socket.write(chunk);
        socket.uncork();
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
`, "latin1");
          } else {
            socket.write(`${header}\r
`, "latin1");
          }
        } else if (contentLength === null) {
          socket.write("\r\n0\r\n\r\n", "latin1");
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
        client[kResume]();
      }
      destroy(err) {
        const { socket, client, abort } = this;
        socket[kWriting] = false;
        if (err) {
          assert(client[kRunning] <= 1, "pipeline should only contain this request");
          abort(err);
        }
      }
    };
    __name(_AsyncWriter, "AsyncWriter");
    var AsyncWriter = _AsyncWriter;
    module2.exports = connectH1;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/client-h2.js
var require_client_h2 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/client-h2.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { pipeline } = require("stream");
    var util = require_util();
    var {
      RequestContentLengthMismatchError,
      RequestAbortedError,
      SocketError,
      InformationalError
    } = require_errors();
    var {
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
    } = require_symbols();
    var kOpenStreams = Symbol("open streams");
    var h2ExperimentalWarned = false;
    var http2;
    try {
      http2 = require("http2");
    } catch {
      http2 = { constants: {} };
    }
    var {
      constants: {
        HTTP2_HEADER_AUTHORITY,
        HTTP2_HEADER_METHOD,
        HTTP2_HEADER_PATH,
        HTTP2_HEADER_SCHEME,
        HTTP2_HEADER_CONTENT_LENGTH,
        HTTP2_HEADER_EXPECT,
        HTTP2_HEADER_STATUS
      }
    } = http2;
    function parseH2Headers(headers) {
      const result = [];
      for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
          for (const subvalue of value) {
            result.push(Buffer.from(name), Buffer.from(subvalue));
          }
        } else {
          result.push(Buffer.from(name), Buffer.from(value));
        }
      }
      return result;
    }
    __name(parseH2Headers, "parseH2Headers");
    async function connectH2(client, socket) {
      client[kSocket] = socket;
      if (!h2ExperimentalWarned) {
        h2ExperimentalWarned = true;
        define_process_default.emitWarning("H2 support is experimental, expect them to change at any time.", {
          code: "UNDICI-H2"
        });
      }
      const session = http2.connect(client[kUrl], {
        createConnection: () => socket,
        peerMaxConcurrentStreams: client[kMaxConcurrentStreams]
      });
      session[kOpenStreams] = 0;
      session[kClient] = client;
      session[kSocket] = socket;
      util.addListener(session, "error", onHttp2SessionError);
      util.addListener(session, "frameError", onHttp2FrameError);
      util.addListener(session, "end", onHttp2SessionEnd);
      util.addListener(session, "goaway", onHTTP2GoAway);
      util.addListener(session, "close", function() {
        const { [kClient]: client2 } = this;
        const { [kSocket]: socket2 } = client2;
        const err = this[kSocket][kError] || this[kError] || new SocketError("closed", util.getSocketInfo(socket2));
        client2[kHTTP2Session] = null;
        if (client2.destroyed) {
          assert(client2[kPending] === 0);
          const requests = client2[kQueue].splice(client2[kRunningIdx]);
          for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            util.errorRequest(client2, request, err);
          }
        }
      });
      session.unref();
      client[kHTTP2Session] = session;
      socket[kHTTP2Session] = session;
      util.addListener(socket, "error", function(err) {
        assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
        this[kError] = err;
        this[kClient][kOnError](err);
      });
      util.addListener(socket, "end", function() {
        util.destroy(this, new SocketError("other side closed", util.getSocketInfo(this)));
      });
      util.addListener(socket, "close", function() {
        const err = this[kError] || new SocketError("closed", util.getSocketInfo(this));
        client[kSocket] = null;
        if (this[kHTTP2Session] != null) {
          this[kHTTP2Session].destroy(err);
        }
        client[kPendingIdx] = client[kRunningIdx];
        assert(client[kRunning] === 0);
        client.emit("disconnect", client[kUrl], [client], err);
        client[kResume]();
      });
      let closed = false;
      socket.on("close", () => {
        closed = true;
      });
      return {
        version: "h2",
        defaultPipelining: Infinity,
        write(...args) {
          return writeH2(client, ...args);
        },
        resume() {
          resumeH2(client);
        },
        destroy(err, callback) {
          if (closed) {
            queueMicrotask(callback);
          } else {
            socket.destroy(err).on("close", callback);
          }
        },
        get destroyed() {
          return socket.destroyed;
        },
        busy() {
          return false;
        }
      };
    }
    __name(connectH2, "connectH2");
    function resumeH2(client) {
      const socket = client[kSocket];
      if (socket?.destroyed === false) {
        if (client[kSize] === 0 && client[kMaxConcurrentStreams] === 0) {
          socket.unref();
          client[kHTTP2Session].unref();
        } else {
          socket.ref();
          client[kHTTP2Session].ref();
        }
      }
    }
    __name(resumeH2, "resumeH2");
    function onHttp2SessionError(err) {
      assert(err.code !== "ERR_TLS_CERT_ALTNAME_INVALID");
      this[kSocket][kError] = err;
      this[kClient][kOnError](err);
    }
    __name(onHttp2SessionError, "onHttp2SessionError");
    function onHttp2FrameError(type, code, id) {
      if (id === 0) {
        const err = new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`);
        this[kSocket][kError] = err;
        this[kClient][kOnError](err);
      }
    }
    __name(onHttp2FrameError, "onHttp2FrameError");
    function onHttp2SessionEnd() {
      const err = new SocketError("other side closed", util.getSocketInfo(this[kSocket]));
      this.destroy(err);
      util.destroy(this[kSocket], err);
    }
    __name(onHttp2SessionEnd, "onHttp2SessionEnd");
    function onHTTP2GoAway(code) {
      const err = this[kError] || new SocketError(`HTTP/2: "GOAWAY" frame received with code ${code}`, util.getSocketInfo(this));
      const client = this[kClient];
      client[kSocket] = null;
      client[kHTTPContext] = null;
      if (this[kHTTP2Session] != null) {
        this[kHTTP2Session].destroy(err);
        this[kHTTP2Session] = null;
      }
      util.destroy(this[kSocket], err);
      const request = client[kQueue][client[kRunningIdx]];
      client[kQueue][client[kRunningIdx]++] = null;
      util.errorRequest(client, request, err);
      client[kPendingIdx] = client[kRunningIdx];
      assert(client[kRunning] === 0);
      client.emit("disconnect", client[kUrl], [client], err);
      client[kResume]();
    }
    __name(onHTTP2GoAway, "onHTTP2GoAway");
    function shouldSendContentLength(method) {
      return method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && method !== "TRACE" && method !== "CONNECT";
    }
    __name(shouldSendContentLength, "shouldSendContentLength");
    function writeH2(client, request) {
      const session = client[kHTTP2Session];
      const { body, method, path, host, upgrade, expectContinue, signal, headers: reqHeaders } = request;
      if (upgrade) {
        util.errorRequest(client, request, new Error("Upgrade not supported for H2"));
        return false;
      }
      const headers = {};
      for (let n = 0; n < reqHeaders.length; n += 2) {
        const key = reqHeaders[n + 0];
        const val = reqHeaders[n + 1];
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            if (headers[key]) {
              headers[key] += `,${val[i]}`;
            } else {
              headers[key] = val[i];
            }
          }
        } else {
          headers[key] = val;
        }
      }
      let stream;
      const { hostname, port } = client[kUrl];
      headers[HTTP2_HEADER_AUTHORITY] = host || `${hostname}${port ? `:${port}` : ""}`;
      headers[HTTP2_HEADER_METHOD] = method;
      const abort = /* @__PURE__ */ __name((err) => {
        if (request.aborted || request.completed) {
          return;
        }
        err = err || new RequestAbortedError();
        util.errorRequest(client, request, err);
        if (stream != null) {
          util.destroy(stream, err);
        }
        util.destroy(body, err);
        client[kQueue][client[kRunningIdx]++] = null;
        client[kResume]();
      }, "abort");
      try {
        request.onConnect(abort);
      } catch (err) {
        util.errorRequest(client, request, err);
      }
      if (request.aborted) {
        return false;
      }
      if (method === "CONNECT") {
        session.ref();
        stream = session.request(headers, { endStream: false, signal });
        if (stream.id && !stream.pending) {
          request.onUpgrade(null, null, stream);
          ++session[kOpenStreams];
          client[kQueue][client[kRunningIdx]++] = null;
        } else {
          stream.once("ready", () => {
            request.onUpgrade(null, null, stream);
            ++session[kOpenStreams];
            client[kQueue][client[kRunningIdx]++] = null;
          });
        }
        stream.once("close", () => {
          session[kOpenStreams] -= 1;
          if (session[kOpenStreams] === 0)
            session.unref();
        });
        return true;
      }
      headers[HTTP2_HEADER_PATH] = path;
      headers[HTTP2_HEADER_SCHEME] = "https";
      const expectsPayload = method === "PUT" || method === "POST" || method === "PATCH";
      if (body && typeof body.read === "function") {
        body.read(0);
      }
      let contentLength = util.bodyLength(body);
      if (contentLength == null) {
        contentLength = request.contentLength;
      }
      if (contentLength === 0 || !expectsPayload) {
        contentLength = null;
      }
      if (shouldSendContentLength(method) && contentLength > 0 && request.contentLength != null && request.contentLength !== contentLength) {
        if (client[kStrictContentLength]) {
          util.errorRequest(client, request, new RequestContentLengthMismatchError());
          return false;
        }
        define_process_default.emitWarning(new RequestContentLengthMismatchError());
      }
      if (contentLength != null) {
        assert(body, "no body must not have content length");
        headers[HTTP2_HEADER_CONTENT_LENGTH] = `${contentLength}`;
      }
      session.ref();
      const shouldEndStream = method === "GET" || method === "HEAD" || body === null;
      if (expectContinue) {
        headers[HTTP2_HEADER_EXPECT] = "100-continue";
        stream = session.request(headers, { endStream: shouldEndStream, signal });
        stream.once("continue", writeBodyH2);
      } else {
        stream = session.request(headers, {
          endStream: shouldEndStream,
          signal
        });
        writeBodyH2();
      }
      ++session[kOpenStreams];
      stream.once("response", (headers2) => {
        const { [HTTP2_HEADER_STATUS]: statusCode, ...realHeaders } = headers2;
        request.onResponseStarted();
        if (request.aborted) {
          const err = new RequestAbortedError();
          util.errorRequest(client, request, err);
          util.destroy(stream, err);
          return;
        }
        if (request.onHeaders(Number(statusCode), parseH2Headers(realHeaders), stream.resume.bind(stream), "") === false) {
          stream.pause();
        }
        stream.on("data", (chunk) => {
          if (request.onData(chunk) === false) {
            stream.pause();
          }
        });
      });
      stream.once("end", () => {
        if (stream.state?.state == null || stream.state.state < 6) {
          request.onComplete([]);
        }
        if (session[kOpenStreams] === 0) {
          session.unref();
        }
        abort(new InformationalError("HTTP/2: stream half-closed (remote)"));
        client[kQueue][client[kRunningIdx]++] = null;
        client[kPendingIdx] = client[kRunningIdx];
        client[kResume]();
      });
      stream.once("close", () => {
        session[kOpenStreams] -= 1;
        if (session[kOpenStreams] === 0) {
          session.unref();
        }
      });
      stream.once("error", function(err) {
        abort(err);
      });
      stream.once("frameError", (type, code) => {
        abort(new InformationalError(`HTTP/2: "frameError" received - type ${type}, code ${code}`));
      });
      return true;
      function writeBodyH2() {
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
          );
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
          );
        } else if (util.isBlobLike(body)) {
          if (typeof body.stream === "function") {
            writeIterable(
              abort,
              stream,
              body.stream(),
              client,
              request,
              client[kSocket],
              contentLength,
              expectsPayload
            );
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
            );
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
          );
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
          );
        } else {
          assert(false);
        }
      }
      __name(writeBodyH2, "writeBodyH2");
    }
    __name(writeH2, "writeH2");
    function writeBuffer(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
      try {
        if (body != null && util.isBuffer(body)) {
          assert(contentLength === body.byteLength, "buffer body must have content length");
          h2stream.cork();
          h2stream.write(body);
          h2stream.uncork();
          h2stream.end();
          request.onBodySent(body);
        }
        if (!expectsPayload) {
          socket[kReset] = true;
        }
        request.onRequestSent();
        client[kResume]();
      } catch (error) {
        abort(error);
      }
    }
    __name(writeBuffer, "writeBuffer");
    function writeStream(abort, socket, expectsPayload, h2stream, body, client, request, contentLength) {
      assert(contentLength !== 0 || client[kRunning] === 0, "stream body cannot be pipelined");
      const pipe = pipeline(
        body,
        h2stream,
        (err) => {
          if (err) {
            util.destroy(pipe, err);
            abort(err);
          } else {
            util.removeAllListeners(pipe);
            request.onRequestSent();
            if (!expectsPayload) {
              socket[kReset] = true;
            }
            client[kResume]();
          }
        }
      );
      util.addListener(pipe, "data", onPipeData);
      function onPipeData(chunk) {
        request.onBodySent(chunk);
      }
      __name(onPipeData, "onPipeData");
    }
    __name(writeStream, "writeStream");
    async function writeBlob(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
      assert(contentLength === body.size, "blob body must have content length");
      try {
        if (contentLength != null && contentLength !== body.size) {
          throw new RequestContentLengthMismatchError();
        }
        const buffer = Buffer.from(await body.arrayBuffer());
        h2stream.cork();
        h2stream.write(buffer);
        h2stream.uncork();
        h2stream.end();
        request.onBodySent(buffer);
        request.onRequestSent();
        if (!expectsPayload) {
          socket[kReset] = true;
        }
        client[kResume]();
      } catch (err) {
        abort(err);
      }
    }
    __name(writeBlob, "writeBlob");
    async function writeIterable(abort, h2stream, body, client, request, socket, contentLength, expectsPayload) {
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
      h2stream.on("close", onDrain).on("drain", onDrain);
      try {
        for await (const chunk of body) {
          if (socket[kError]) {
            throw socket[kError];
          }
          const res = h2stream.write(chunk);
          request.onBodySent(chunk);
          if (!res) {
            await waitForDrain();
          }
        }
        h2stream.end();
        request.onRequestSent();
        if (!expectsPayload) {
          socket[kReset] = true;
        }
        client[kResume]();
      } catch (err) {
        abort(err);
      } finally {
        h2stream.off("close", onDrain).off("drain", onDrain);
      }
    }
    __name(writeIterable, "writeIterable");
    module2.exports = connectH2;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/handler/redirect-handler.js
var require_redirect_handler = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/handler/redirect-handler.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var util = require_util();
    var { kBodyUsed } = require_symbols();
    var assert = require("assert");
    var { InvalidArgumentError } = require_errors();
    var EE = require("events");
    var redirectableStatusCodes = [300, 301, 302, 303, 307, 308];
    var kBody = Symbol("body");
    var _BodyAsyncIterable = class _BodyAsyncIterable {
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
    __name(_BodyAsyncIterable, "BodyAsyncIterable");
    var BodyAsyncIterable = _BodyAsyncIterable;
    var _RedirectHandler = class _RedirectHandler {
      constructor(dispatch, maxRedirections, opts, handler) {
        if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
          throw new InvalidArgumentError("maxRedirections must be a positive number");
        }
        util.validateHandler(handler, opts.method, opts.upgrade);
        this.dispatch = dispatch;
        this.location = null;
        this.abort = null;
        this.opts = { ...opts, maxRedirections: 0 };
        this.maxRedirections = maxRedirections;
        this.handler = handler;
        this.history = [];
        this.redirectionLimitReached = false;
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
        if (this.opts.throwOnMaxRedirect && this.history.length >= this.maxRedirections) {
          if (this.request) {
            this.request.abort(new Error("max redirects"));
          }
          this.redirectionLimitReached = true;
          this.abort(new Error("max redirects"));
          return;
        }
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
        this.opts.query = null;
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
    __name(_RedirectHandler, "RedirectHandler");
    var RedirectHandler = _RedirectHandler;
    function parseLocation(statusCode, headers) {
      if (redirectableStatusCodes.indexOf(statusCode) === -1) {
        return null;
      }
      for (let i = 0; i < headers.length; i += 2) {
        if (headers[i].length === 8 && util.headerNameToString(headers[i]) === "location") {
          return headers[i + 1];
        }
      }
    }
    __name(parseLocation, "parseLocation");
    function shouldRemoveHeader(header, removeContent, unknownOrigin) {
      if (header.length === 4) {
        return util.headerNameToString(header) === "host";
      }
      if (removeContent && util.headerNameToString(header).startsWith("content-")) {
        return true;
      }
      if (unknownOrigin && (header.length === 13 || header.length === 6 || header.length === 19)) {
        const name = util.headerNameToString(header);
        return name === "authorization" || name === "cookie" || name === "proxy-authorization";
      }
      return false;
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

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/redirect-interceptor.js
var require_redirect_interceptor = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/redirect-interceptor.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var RedirectHandler = require_redirect_handler();
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

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/client.js
var require_client = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/client.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var net = require("net");
    var http = require("http");
    var util = require_util();
    var { channels } = require_diagnostics();
    var Request2 = require_undici_core_request();
    var DispatcherBase = require_dispatcher_base();
    var {
      InvalidArgumentError,
      InformationalError,
      ClientDestroyedError
    } = require_errors();
    var buildConnector = require_connect();
    var {
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
    } = require_symbols();
    var connectH1 = require_client_h1();
    var connectH2 = require_client_h2();
    var deprecatedInterceptorWarned = false;
    var kClosedResolve = Symbol("kClosedResolve");
    var noop = /* @__PURE__ */ __name(() => {
    }, "noop");
    function getPipelining(client) {
      return client[kPipelining] ?? client[kHTTPContext]?.defaultPipelining ?? 1;
    }
    __name(getPipelining, "getPipelining");
    var _Client = class _Client extends DispatcherBase {
      /**
       *
       * @param {string|URL} url
       * @param {import('../../types/client.js').Client.Options} options
       */
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
        maxRequestsPerClient,
        localAddress,
        maxResponseSize,
        autoSelectFamily,
        autoSelectFamilyAttemptTimeout,
        // h2
        maxConcurrentStreams,
        allowH2
      } = {}) {
        super();
        if (keepAlive !== void 0) {
          throw new InvalidArgumentError("unsupported keepAlive, use pipelining=0 instead");
        }
        if (socketTimeout !== void 0) {
          throw new InvalidArgumentError("unsupported socketTimeout, use headersTimeout & bodyTimeout instead");
        }
        if (requestTimeout !== void 0) {
          throw new InvalidArgumentError("unsupported requestTimeout, use headersTimeout & bodyTimeout instead");
        }
        if (idleTimeout !== void 0) {
          throw new InvalidArgumentError("unsupported idleTimeout, use keepAliveTimeout instead");
        }
        if (maxKeepAliveTimeout !== void 0) {
          throw new InvalidArgumentError("unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead");
        }
        if (maxHeaderSize != null && !Number.isFinite(maxHeaderSize)) {
          throw new InvalidArgumentError("invalid maxHeaderSize");
        }
        if (socketPath != null && typeof socketPath !== "string") {
          throw new InvalidArgumentError("invalid socketPath");
        }
        if (connectTimeout != null && (!Number.isFinite(connectTimeout) || connectTimeout < 0)) {
          throw new InvalidArgumentError("invalid connectTimeout");
        }
        if (keepAliveTimeout != null && (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout <= 0)) {
          throw new InvalidArgumentError("invalid keepAliveTimeout");
        }
        if (keepAliveMaxTimeout != null && (!Number.isFinite(keepAliveMaxTimeout) || keepAliveMaxTimeout <= 0)) {
          throw new InvalidArgumentError("invalid keepAliveMaxTimeout");
        }
        if (keepAliveTimeoutThreshold != null && !Number.isFinite(keepAliveTimeoutThreshold)) {
          throw new InvalidArgumentError("invalid keepAliveTimeoutThreshold");
        }
        if (headersTimeout != null && (!Number.isInteger(headersTimeout) || headersTimeout < 0)) {
          throw new InvalidArgumentError("headersTimeout must be a positive integer or zero");
        }
        if (bodyTimeout != null && (!Number.isInteger(bodyTimeout) || bodyTimeout < 0)) {
          throw new InvalidArgumentError("bodyTimeout must be a positive integer or zero");
        }
        if (connect2 != null && typeof connect2 !== "function" && typeof connect2 !== "object") {
          throw new InvalidArgumentError("connect must be a function or an object");
        }
        if (maxRedirections != null && (!Number.isInteger(maxRedirections) || maxRedirections < 0)) {
          throw new InvalidArgumentError("maxRedirections must be a positive number");
        }
        if (maxRequestsPerClient != null && (!Number.isInteger(maxRequestsPerClient) || maxRequestsPerClient < 0)) {
          throw new InvalidArgumentError("maxRequestsPerClient must be a positive number");
        }
        if (localAddress != null && (typeof localAddress !== "string" || net.isIP(localAddress) === 0)) {
          throw new InvalidArgumentError("localAddress must be valid string IP address");
        }
        if (maxResponseSize != null && (!Number.isInteger(maxResponseSize) || maxResponseSize < -1)) {
          throw new InvalidArgumentError("maxResponseSize must be a positive number");
        }
        if (autoSelectFamilyAttemptTimeout != null && (!Number.isInteger(autoSelectFamilyAttemptTimeout) || autoSelectFamilyAttemptTimeout < -1)) {
          throw new InvalidArgumentError("autoSelectFamilyAttemptTimeout must be a positive number");
        }
        if (allowH2 != null && typeof allowH2 !== "boolean") {
          throw new InvalidArgumentError("allowH2 must be a valid boolean value");
        }
        if (maxConcurrentStreams != null && (typeof maxConcurrentStreams !== "number" || maxConcurrentStreams < 1)) {
          throw new InvalidArgumentError("maxConcurrentStreams must be a positive integer, greater than 0");
        }
        if (typeof connect2 !== "function") {
          connect2 = buildConnector({
            ...tls,
            maxCachedSessions,
            allowH2,
            socketPath,
            timeout: connectTimeout,
            ...autoSelectFamily ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : void 0,
            ...connect2
          });
        }
        if (interceptors?.Client && Array.isArray(interceptors.Client)) {
          this[kInterceptors] = interceptors.Client;
          if (!deprecatedInterceptorWarned) {
            deprecatedInterceptorWarned = true;
            define_process_default.emitWarning("Client.Options#interceptor is deprecated. Use Dispatcher#compose instead.", {
              code: "UNDICI-CLIENT-INTERCEPTOR-DEPRECATED"
            });
          }
        } else {
          this[kInterceptors] = [createRedirectInterceptor({ maxRedirections })];
        }
        this[kUrl] = util.parseOrigin(url);
        this[kConnector] = connect2;
        this[kPipelining] = pipelining != null ? pipelining : 1;
        this[kMaxHeadersSize] = maxHeaderSize || http.maxHeaderSize;
        this[kKeepAliveDefaultTimeout] = keepAliveTimeout == null ? 4e3 : keepAliveTimeout;
        this[kKeepAliveMaxTimeout] = keepAliveMaxTimeout == null ? 6e5 : keepAliveMaxTimeout;
        this[kKeepAliveTimeoutThreshold] = keepAliveTimeoutThreshold == null ? 2e3 : keepAliveTimeoutThreshold;
        this[kKeepAliveTimeoutValue] = this[kKeepAliveDefaultTimeout];
        this[kServerName] = null;
        this[kLocalAddress] = localAddress != null ? localAddress : null;
        this[kResuming] = 0;
        this[kNeedDrain] = 0;
        this[kHostHeader] = `host: ${this[kUrl].hostname}${this[kUrl].port ? `:${this[kUrl].port}` : ""}\r
`;
        this[kBodyTimeout] = bodyTimeout != null ? bodyTimeout : 3e5;
        this[kHeadersTimeout] = headersTimeout != null ? headersTimeout : 3e5;
        this[kStrictContentLength] = strictContentLength == null ? true : strictContentLength;
        this[kMaxRedirections] = maxRedirections;
        this[kMaxRequests] = maxRequestsPerClient;
        this[kClosedResolve] = null;
        this[kMaxResponseSize] = maxResponseSize > -1 ? maxResponseSize : -1;
        this[kMaxConcurrentStreams] = maxConcurrentStreams != null ? maxConcurrentStreams : 100;
        this[kHTTPContext] = null;
        this[kQueue] = [];
        this[kRunningIdx] = 0;
        this[kPendingIdx] = 0;
        this[kResume] = (sync) => resume(this, sync);
        this[kOnError] = (err) => onError(this, err);
      }
      get pipelining() {
        return this[kPipelining];
      }
      set pipelining(value) {
        this[kPipelining] = value;
        this[kResume](true);
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
        return !!this[kHTTPContext] && !this[kConnecting] && !this[kHTTPContext].destroyed;
      }
      get [kBusy]() {
        return Boolean(
          this[kHTTPContext]?.busy(null) || this[kSize] >= (getPipelining(this) || 1) || this[kPending] > 0
        );
      }
      /* istanbul ignore: only used for test */
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
          queueMicrotask(() => resume(this));
        } else {
          this[kResume](true);
        }
        if (this[kResuming] && this[kNeedDrain] !== 2 && this[kBusy]) {
          this[kNeedDrain] = 2;
        }
        return this[kNeedDrain] < 2;
      }
      async [kClose]() {
        return new Promise((resolve) => {
          if (this[kSize]) {
            this[kClosedResolve] = resolve;
          } else {
            resolve(null);
          }
        });
      }
      async [kDestroy](err) {
        return new Promise((resolve) => {
          const requests = this[kQueue].splice(this[kPendingIdx]);
          for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            util.errorRequest(this, request, err);
          }
          const callback = /* @__PURE__ */ __name(() => {
            if (this[kClosedResolve]) {
              this[kClosedResolve]();
              this[kClosedResolve] = null;
            }
            resolve(null);
          }, "callback");
          if (this[kHTTPContext]) {
            this[kHTTPContext].destroy(err, callback);
            this[kHTTPContext] = null;
          } else {
            queueMicrotask(callback);
          }
          this[kResume]();
        });
      }
    };
    __name(_Client, "Client");
    var Client = _Client;
    var createRedirectInterceptor = require_redirect_interceptor();
    function onError(client, err) {
      if (client[kRunning] === 0 && err.code !== "UND_ERR_INFO" && err.code !== "UND_ERR_SOCKET") {
        assert(client[kPendingIdx] === client[kRunningIdx]);
        const requests = client[kQueue].splice(client[kRunningIdx]);
        for (let i = 0; i < requests.length; i++) {
          const request = requests[i];
          util.errorRequest(client, request, err);
        }
        assert(client[kSize] === 0);
      }
    }
    __name(onError, "onError");
    async function connect(client) {
      assert(!client[kConnecting]);
      assert(!client[kHTTPContext]);
      let { host, hostname, protocol, port } = client[kUrl];
      if (hostname[0] === "[") {
        const idx = hostname.indexOf("]");
        assert(idx !== -1);
        const ip = hostname.substring(1, idx);
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
            version: client[kHTTPContext]?.version,
            servername: client[kServerName],
            localAddress: client[kLocalAddress]
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
            servername: client[kServerName],
            localAddress: client[kLocalAddress]
          }, (err, socket2) => {
            if (err) {
              reject(err);
            } else {
              resolve(socket2);
            }
          });
        });
        if (client.destroyed) {
          util.destroy(socket.on("error", noop), new ClientDestroyedError());
          return;
        }
        assert(socket);
        try {
          client[kHTTPContext] = socket.alpnProtocol === "h2" ? await connectH2(client, socket) : await connectH1(client, socket);
        } catch (err) {
          socket.destroy().on("error", noop);
          throw err;
        }
        client[kConnecting] = false;
        socket[kCounter] = 0;
        socket[kMaxRequests] = client[kMaxRequests];
        socket[kClient] = client;
        socket[kError] = null;
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
          });
        }
        client.emit("connect", client[kUrl], [client]);
      } catch (err) {
        if (client.destroyed) {
          return;
        }
        client[kConnecting] = false;
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
          });
        }
        if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
          assert(client[kRunning] === 0);
          while (client[kPending] > 0 && client[kQueue][client[kPendingIdx]].servername === client[kServerName]) {
            const request = client[kQueue][client[kPendingIdx]++];
            util.errorRequest(client, request, err);
          }
        } else {
          onError(client, err);
        }
        client.emit("connectionError", client[kUrl], [client], err);
      }
      client[kResume]();
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
        if (client[kClosedResolve] && !client[kSize]) {
          client[kClosedResolve]();
          client[kClosedResolve] = null;
          return;
        }
        if (client[kHTTPContext]) {
          client[kHTTPContext].resume();
        }
        if (client[kBusy]) {
          client[kNeedDrain] = 2;
        } else if (client[kNeedDrain] === 2) {
          if (sync) {
            client[kNeedDrain] = 1;
            queueMicrotask(() => emitDrain(client));
          } else {
            emitDrain(client);
          }
          continue;
        }
        if (client[kPending] === 0) {
          return;
        }
        if (client[kRunning] >= (getPipelining(client) || 1)) {
          return;
        }
        const request = client[kQueue][client[kPendingIdx]];
        if (client[kUrl].protocol === "https:" && client[kServerName] !== request.servername) {
          if (client[kRunning] > 0) {
            return;
          }
          client[kServerName] = request.servername;
          client[kHTTPContext]?.destroy(new InformationalError("servername changed"), () => {
            client[kHTTPContext] = null;
            resume(client);
          });
        }
        if (client[kConnecting]) {
          return;
        }
        if (!client[kHTTPContext]) {
          connect(client);
          return;
        }
        if (client[kHTTPContext].destroyed) {
          return;
        }
        if (client[kHTTPContext].busy(request)) {
          return;
        }
        if (!request.aborted && client[kHTTPContext].write(request)) {
          client[kPendingIdx]++;
        } else {
          client[kQueue].splice(client[kPendingIdx], 1);
        }
      }
    }
    __name(_resume, "_resume");
    module2.exports = Client;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/fixed-queue.js
var require_fixed_queue = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/fixed-queue.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var kSize = 2048;
    var kMask = kSize - 1;
    var _FixedCircularBuffer = class _FixedCircularBuffer {
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
    __name(_FixedCircularBuffer, "FixedCircularBuffer");
    var FixedCircularBuffer = _FixedCircularBuffer;
    var _a;
    module2.exports = (_a = class {
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
    }, __name(_a, "FixedQueue"), _a);
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/pool-stats.js
var require_pool_stats = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/pool-stats.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kFree, kConnected, kPending, kQueued, kRunning, kSize } = require_symbols();
    var kPool = Symbol("pool");
    var _PoolStats = class _PoolStats {
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
    __name(_PoolStats, "PoolStats");
    var PoolStats = _PoolStats;
    module2.exports = PoolStats;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/pool-base.js
var require_pool_base = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/pool-base.js"(exports2, module2) {
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
    var _PoolBase = class _PoolBase extends DispatcherBase {
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
          await Promise.all(this[kClients].map((c) => c.close()));
        } else {
          await new Promise((resolve) => {
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
        await Promise.all(this[kClients].map((c) => c.destroy(err)));
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
          queueMicrotask(() => {
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
    __name(_PoolBase, "PoolBase");
    var PoolBase = _PoolBase;
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

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/pool.js
var require_pool = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/pool.js"(exports2, module2) {
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
      InvalidArgumentError
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
    var _Pool = class _Pool extends PoolBase {
      constructor(origin, {
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
        super();
        if (connections != null && (!Number.isFinite(connections) || connections < 0)) {
          throw new InvalidArgumentError("invalid connections");
        }
        if (typeof factory !== "function") {
          throw new InvalidArgumentError("factory must be a function.");
        }
        if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
          throw new InvalidArgumentError("connect must be a function or an object");
        }
        if (typeof connect !== "function") {
          connect = buildConnector({
            ...tls,
            maxCachedSessions,
            allowH2,
            socketPath,
            timeout: connectTimeout,
            ...autoSelectFamily ? { autoSelectFamily, autoSelectFamilyAttemptTimeout } : void 0,
            ...connect
          });
        }
        this[kInterceptors] = options.interceptors?.Pool && Array.isArray(options.interceptors.Pool) ? options.interceptors.Pool : [];
        this[kConnections] = connections || null;
        this[kUrl] = util.parseOrigin(origin);
        this[kOptions] = { ...util.deepClone(options), connect, allowH2 };
        this[kOptions].interceptors = options.interceptors ? { ...options.interceptors } : void 0;
        this[kFactory] = factory;
      }
      [kGetDispatcher]() {
        for (const client of this[kClients]) {
          if (!client[kNeedDrain]) {
            return client;
          }
        }
        if (!this[kConnections] || this[kClients].length < this[kConnections]) {
          const dispatcher = this[kFactory](this[kUrl], this[kOptions]);
          this[kAddClient](dispatcher);
          return dispatcher;
        }
      }
    };
    __name(_Pool, "Pool");
    var Pool = _Pool;
    module2.exports = Pool;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/balanced-pool.js
var require_balanced_pool = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/balanced-pool.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      BalancedPoolMissingUpstreamError,
      InvalidArgumentError
    } = require_errors();
    var {
      PoolBase,
      kClients,
      kNeedDrain,
      kAddClient,
      kRemoveClient,
      kGetDispatcher
    } = require_pool_base();
    var Pool = require_pool();
    var { kUrl, kInterceptors } = require_symbols();
    var { parseOrigin } = require_util();
    var kFactory = Symbol("factory");
    var kOptions = Symbol("options");
    var kGreatestCommonDivisor = Symbol("kGreatestCommonDivisor");
    var kCurrentWeight = Symbol("kCurrentWeight");
    var kIndex = Symbol("kIndex");
    var kWeight = Symbol("kWeight");
    var kMaxWeightPerServer = Symbol("kMaxWeightPerServer");
    var kErrorPenalty = Symbol("kErrorPenalty");
    function getGreatestCommonDivisor(a, b) {
      if (a === 0)
        return b;
      while (b !== 0) {
        const t = b;
        b = a % b;
        a = t;
      }
      return a;
    }
    __name(getGreatestCommonDivisor, "getGreatestCommonDivisor");
    function defaultFactory(origin, opts) {
      return new Pool(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var _BalancedPool = class _BalancedPool extends PoolBase {
      constructor(upstreams = [], { factory = defaultFactory, ...opts } = {}) {
        super();
        this[kOptions] = opts;
        this[kIndex] = -1;
        this[kCurrentWeight] = 0;
        this[kMaxWeightPerServer] = this[kOptions].maxWeightPerServer || 100;
        this[kErrorPenalty] = this[kOptions].errorPenalty || 15;
        if (!Array.isArray(upstreams)) {
          upstreams = [upstreams];
        }
        if (typeof factory !== "function") {
          throw new InvalidArgumentError("factory must be a function.");
        }
        this[kInterceptors] = opts.interceptors?.BalancedPool && Array.isArray(opts.interceptors.BalancedPool) ? opts.interceptors.BalancedPool : [];
        this[kFactory] = factory;
        for (const upstream of upstreams) {
          this.addUpstream(upstream);
        }
        this._updateBalancedPoolStats();
      }
      addUpstream(upstream) {
        const upstreamOrigin = parseOrigin(upstream).origin;
        if (this[kClients].find((pool2) => pool2[kUrl].origin === upstreamOrigin && pool2.closed !== true && pool2.destroyed !== true)) {
          return this;
        }
        const pool = this[kFactory](upstreamOrigin, Object.assign({}, this[kOptions]));
        this[kAddClient](pool);
        pool.on("connect", () => {
          pool[kWeight] = Math.min(this[kMaxWeightPerServer], pool[kWeight] + this[kErrorPenalty]);
        });
        pool.on("connectionError", () => {
          pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty]);
          this._updateBalancedPoolStats();
        });
        pool.on("disconnect", (...args) => {
          const err = args[2];
          if (err && err.code === "UND_ERR_SOCKET") {
            pool[kWeight] = Math.max(1, pool[kWeight] - this[kErrorPenalty]);
            this._updateBalancedPoolStats();
          }
        });
        for (const client of this[kClients]) {
          client[kWeight] = this[kMaxWeightPerServer];
        }
        this._updateBalancedPoolStats();
        return this;
      }
      _updateBalancedPoolStats() {
        let result = 0;
        for (let i = 0; i < this[kClients].length; i++) {
          result = getGreatestCommonDivisor(this[kClients][i][kWeight], result);
        }
        this[kGreatestCommonDivisor] = result;
      }
      removeUpstream(upstream) {
        const upstreamOrigin = parseOrigin(upstream).origin;
        const pool = this[kClients].find((pool2) => pool2[kUrl].origin === upstreamOrigin && pool2.closed !== true && pool2.destroyed !== true);
        if (pool) {
          this[kRemoveClient](pool);
        }
        return this;
      }
      get upstreams() {
        return this[kClients].filter((dispatcher) => dispatcher.closed !== true && dispatcher.destroyed !== true).map((p) => p[kUrl].origin);
      }
      [kGetDispatcher]() {
        if (this[kClients].length === 0) {
          throw new BalancedPoolMissingUpstreamError();
        }
        const dispatcher = this[kClients].find((dispatcher2) => !dispatcher2[kNeedDrain] && dispatcher2.closed !== true && dispatcher2.destroyed !== true);
        if (!dispatcher) {
          return;
        }
        const allClientsBusy = this[kClients].map((pool) => pool[kNeedDrain]).reduce((a, b) => a && b, true);
        if (allClientsBusy) {
          return;
        }
        let counter = 0;
        let maxWeightIndex = this[kClients].findIndex((pool) => !pool[kNeedDrain]);
        while (counter++ < this[kClients].length) {
          this[kIndex] = (this[kIndex] + 1) % this[kClients].length;
          const pool = this[kClients][this[kIndex]];
          if (pool[kWeight] > this[kClients][maxWeightIndex][kWeight] && !pool[kNeedDrain]) {
            maxWeightIndex = this[kIndex];
          }
          if (this[kIndex] === 0) {
            this[kCurrentWeight] = this[kCurrentWeight] - this[kGreatestCommonDivisor];
            if (this[kCurrentWeight] <= 0) {
              this[kCurrentWeight] = this[kMaxWeightPerServer];
            }
          }
          if (pool[kWeight] >= this[kCurrentWeight] && !pool[kNeedDrain]) {
            return pool;
          }
        }
        this[kCurrentWeight] = this[kClients][maxWeightIndex][kWeight];
        this[kIndex] = maxWeightIndex;
        return this[kClients][maxWeightIndex];
      }
    };
    __name(_BalancedPool, "BalancedPool");
    var BalancedPool = _BalancedPool;
    module2.exports = BalancedPool;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/agent.js
var require_agent = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/agent.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { InvalidArgumentError } = require_errors();
    var { kClients, kRunning, kClose, kDestroy, kDispatch, kInterceptors } = require_symbols();
    var DispatcherBase = require_dispatcher_base();
    var Pool = require_pool();
    var Client = require_client();
    var util = require_util();
    var createRedirectInterceptor = require_redirect_interceptor();
    var kOnConnect = Symbol("onConnect");
    var kOnDisconnect = Symbol("onDisconnect");
    var kOnConnectionError = Symbol("onConnectionError");
    var kMaxRedirections = Symbol("maxRedirections");
    var kOnDrain = Symbol("onDrain");
    var kFactory = Symbol("factory");
    var kOptions = Symbol("options");
    function defaultFactory(origin, opts) {
      return opts && opts.connections === 1 ? new Client(origin, opts) : new Pool(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var _Agent = class _Agent extends DispatcherBase {
      constructor({ factory = defaultFactory, maxRedirections = 0, connect, ...options } = {}) {
        super();
        if (typeof factory !== "function") {
          throw new InvalidArgumentError("factory must be a function.");
        }
        if (connect != null && typeof connect !== "function" && typeof connect !== "object") {
          throw new InvalidArgumentError("connect must be a function or an object");
        }
        if (!Number.isInteger(maxRedirections) || maxRedirections < 0) {
          throw new InvalidArgumentError("maxRedirections must be a positive number");
        }
        if (connect && typeof connect !== "function") {
          connect = { ...connect };
        }
        this[kInterceptors] = options.interceptors?.Agent && Array.isArray(options.interceptors.Agent) ? options.interceptors.Agent : [createRedirectInterceptor({ maxRedirections })];
        this[kOptions] = { ...util.deepClone(options), connect };
        this[kOptions].interceptors = options.interceptors ? { ...options.interceptors } : void 0;
        this[kMaxRedirections] = maxRedirections;
        this[kFactory] = factory;
        this[kClients] = /* @__PURE__ */ new Map();
        this[kOnDrain] = (origin, targets) => {
          this.emit("drain", origin, [this, ...targets]);
        };
        this[kOnConnect] = (origin, targets) => {
          this.emit("connect", origin, [this, ...targets]);
        };
        this[kOnDisconnect] = (origin, targets, err) => {
          this.emit("disconnect", origin, [this, ...targets], err);
        };
        this[kOnConnectionError] = (origin, targets, err) => {
          this.emit("connectionError", origin, [this, ...targets], err);
        };
      }
      get [kRunning]() {
        let ret = 0;
        for (const client of this[kClients].values()) {
          ret += client[kRunning];
        }
        return ret;
      }
      [kDispatch](opts, handler) {
        let key;
        if (opts.origin && (typeof opts.origin === "string" || opts.origin instanceof URL)) {
          key = String(opts.origin);
        } else {
          throw new InvalidArgumentError("opts.origin must be a non-empty string or URL.");
        }
        let dispatcher = this[kClients].get(key);
        if (!dispatcher) {
          dispatcher = this[kFactory](opts.origin, this[kOptions]).on("drain", this[kOnDrain]).on("connect", this[kOnConnect]).on("disconnect", this[kOnDisconnect]).on("connectionError", this[kOnConnectionError]);
          this[kClients].set(key, dispatcher);
        }
        return dispatcher.dispatch(opts, handler);
      }
      async [kClose]() {
        const closePromises = [];
        for (const client of this[kClients].values()) {
          closePromises.push(client.close());
        }
        this[kClients].clear();
        await Promise.all(closePromises);
      }
      async [kDestroy](err) {
        const destroyPromises = [];
        for (const client of this[kClients].values()) {
          destroyPromises.push(client.destroy(err));
        }
        this[kClients].clear();
        await Promise.all(destroyPromises);
      }
    };
    __name(_Agent, "Agent");
    var Agent = _Agent;
    module2.exports = Agent;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/proxy-agent.js
var require_proxy_agent = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/proxy-agent.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kProxy, kClose, kDestroy, kInterceptors } = require_symbols();
    var { URL: URL2 } = require("url");
    var Agent = require_agent();
    var Pool = require_pool();
    var DispatcherBase = require_dispatcher_base();
    var { InvalidArgumentError, RequestAbortedError, SecureProxyConnectionError } = require_errors();
    var buildConnector = require_connect();
    var kAgent = Symbol("proxy agent");
    var kClient = Symbol("proxy client");
    var kProxyHeaders = Symbol("proxy headers");
    var kRequestTls = Symbol("request tls settings");
    var kProxyTls = Symbol("proxy tls settings");
    var kConnectEndpoint = Symbol("connect endpoint function");
    function defaultProtocolPort(protocol) {
      return protocol === "https:" ? 443 : 80;
    }
    __name(defaultProtocolPort, "defaultProtocolPort");
    function defaultFactory(origin, opts) {
      return new Pool(origin, opts);
    }
    __name(defaultFactory, "defaultFactory");
    var noop = /* @__PURE__ */ __name(() => {
    }, "noop");
    var _getUrl, getUrl_fn;
    var _ProxyAgent = class _ProxyAgent extends DispatcherBase {
      constructor(opts) {
        super();
        /**
         * @param {import('../types/proxy-agent').ProxyAgent.Options | string | URL} opts
         * @returns {URL}
         */
        __privateAdd(this, _getUrl);
        if (!opts || typeof opts === "object" && !(opts instanceof URL2) && !opts.uri) {
          throw new InvalidArgumentError("Proxy uri is mandatory");
        }
        const { clientFactory = defaultFactory } = opts;
        if (typeof clientFactory !== "function") {
          throw new InvalidArgumentError("Proxy opts.clientFactory must be a function.");
        }
        const url = __privateMethod(this, _getUrl, getUrl_fn).call(this, opts);
        const { href, origin, port, protocol, username, password, hostname: proxyHostname } = url;
        this[kProxy] = { uri: href, protocol };
        this[kInterceptors] = opts.interceptors?.ProxyAgent && Array.isArray(opts.interceptors.ProxyAgent) ? opts.interceptors.ProxyAgent : [];
        this[kRequestTls] = opts.requestTls;
        this[kProxyTls] = opts.proxyTls;
        this[kProxyHeaders] = opts.headers || {};
        if (opts.auth && opts.token) {
          throw new InvalidArgumentError("opts.auth cannot be used in combination with opts.token");
        } else if (opts.auth) {
          this[kProxyHeaders]["proxy-authorization"] = `Basic ${opts.auth}`;
        } else if (opts.token) {
          this[kProxyHeaders]["proxy-authorization"] = opts.token;
        } else if (username && password) {
          this[kProxyHeaders]["proxy-authorization"] = `Basic ${Buffer.from(`${decodeURIComponent(username)}:${decodeURIComponent(password)}`).toString("base64")}`;
        }
        const connect = buildConnector({ ...opts.proxyTls });
        this[kConnectEndpoint] = buildConnector({ ...opts.requestTls });
        this[kClient] = clientFactory(url, { connect });
        this[kAgent] = new Agent({
          ...opts,
          connect: async (opts2, callback) => {
            let requestedPath = opts2.host;
            if (!opts2.port) {
              requestedPath += `:${defaultProtocolPort(opts2.protocol)}`;
            }
            try {
              const { socket, statusCode } = await this[kClient].connect({
                origin,
                port,
                path: requestedPath,
                signal: opts2.signal,
                headers: {
                  ...this[kProxyHeaders],
                  host: opts2.host
                },
                servername: this[kProxyTls]?.servername || proxyHostname
              });
              if (statusCode !== 200) {
                socket.on("error", noop).destroy();
                callback(new RequestAbortedError(`Proxy response (${statusCode}) !== 200 when HTTP Tunneling`));
              }
              if (opts2.protocol !== "https:") {
                callback(null, socket);
                return;
              }
              let servername;
              if (this[kRequestTls]) {
                servername = this[kRequestTls].servername;
              } else {
                servername = opts2.servername;
              }
              this[kConnectEndpoint]({ ...opts2, servername, httpSocket: socket }, callback);
            } catch (err) {
              if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
                callback(new SecureProxyConnectionError(err));
              } else {
                callback(err);
              }
            }
          }
        });
      }
      dispatch(opts, handler) {
        const headers = buildHeaders(opts.headers);
        throwIfProxyAuthIsSent(headers);
        if (headers && !("host" in headers) && !("Host" in headers)) {
          const { host } = new URL2(opts.origin);
          headers.host = host;
        }
        return this[kAgent].dispatch(
          {
            ...opts,
            headers
          },
          handler
        );
      }
      async [kClose]() {
        await this[kAgent].close();
        await this[kClient].close();
      }
      async [kDestroy]() {
        await this[kAgent].destroy();
        await this[kClient].destroy();
      }
    };
    _getUrl = new WeakSet();
    getUrl_fn = /* @__PURE__ */ __name(function(opts) {
      if (typeof opts === "string") {
        return new URL2(opts);
      } else if (opts instanceof URL2) {
        return opts;
      } else {
        return new URL2(opts.uri);
      }
    }, "#getUrl");
    __name(_ProxyAgent, "ProxyAgent");
    var ProxyAgent = _ProxyAgent;
    function buildHeaders(headers) {
      if (Array.isArray(headers)) {
        const headersPair = {};
        for (let i = 0; i < headers.length; i += 2) {
          headersPair[headers[i]] = headers[i + 1];
        }
        return headersPair;
      }
      return headers;
    }
    __name(buildHeaders, "buildHeaders");
    function throwIfProxyAuthIsSent(headers) {
      const existProxyAuth = headers && Object.keys(headers).find((key) => key.toLowerCase() === "proxy-authorization");
      if (existProxyAuth) {
        throw new InvalidArgumentError("Proxy-Authorization should be sent in ProxyAgent constructor");
      }
    }
    __name(throwIfProxyAuthIsSent, "throwIfProxyAuthIsSent");
    module2.exports = ProxyAgent;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/env-http-proxy-agent.js
var require_env_http_proxy_agent = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/env-http-proxy-agent.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var DispatcherBase = require_dispatcher_base();
    var { kClose, kDestroy, kClosed, kDestroyed, kDispatch, kNoProxyAgent, kHttpProxyAgent, kHttpsProxyAgent } = require_symbols();
    var ProxyAgent = require_proxy_agent();
    var Agent = require_agent();
    var DEFAULT_PORTS = {
      "http:": 80,
      "https:": 443
    };
    var experimentalWarned = false;
    var _noProxyValue, _noProxyEntries, _opts, _getProxyAgentForUrl, getProxyAgentForUrl_fn, _shouldProxy, shouldProxy_fn, _parseNoProxy, parseNoProxy_fn, _noProxyChanged, noProxyChanged_get, _noProxyEnv, noProxyEnv_get;
    var _EnvHttpProxyAgent = class _EnvHttpProxyAgent extends DispatcherBase {
      constructor(opts = {}) {
        super();
        __privateAdd(this, _getProxyAgentForUrl);
        __privateAdd(this, _shouldProxy);
        __privateAdd(this, _parseNoProxy);
        __privateAdd(this, _noProxyChanged);
        __privateAdd(this, _noProxyEnv);
        __privateAdd(this, _noProxyValue, null);
        __privateAdd(this, _noProxyEntries, null);
        __privateAdd(this, _opts, null);
        __privateSet(this, _opts, opts);
        if (!experimentalWarned) {
          experimentalWarned = true;
          define_process_default.emitWarning("EnvHttpProxyAgent is experimental, expect them to change at any time.", {
            code: "UNDICI-EHPA"
          });
        }
        const { httpProxy, httpsProxy, noProxy, ...agentOpts } = opts;
        this[kNoProxyAgent] = new Agent(agentOpts);
        const HTTP_PROXY = httpProxy ?? define_process_default.env.http_proxy ?? define_process_default.env.HTTP_PROXY;
        if (HTTP_PROXY) {
          this[kHttpProxyAgent] = new ProxyAgent({ ...agentOpts, uri: HTTP_PROXY });
        } else {
          this[kHttpProxyAgent] = this[kNoProxyAgent];
        }
        const HTTPS_PROXY = httpsProxy ?? define_process_default.env.https_proxy ?? define_process_default.env.HTTPS_PROXY;
        if (HTTPS_PROXY) {
          this[kHttpsProxyAgent] = new ProxyAgent({ ...agentOpts, uri: HTTPS_PROXY });
        } else {
          this[kHttpsProxyAgent] = this[kHttpProxyAgent];
        }
        __privateMethod(this, _parseNoProxy, parseNoProxy_fn).call(this);
      }
      [kDispatch](opts, handler) {
        const url = new URL(opts.origin);
        const agent = __privateMethod(this, _getProxyAgentForUrl, getProxyAgentForUrl_fn).call(this, url);
        return agent.dispatch(opts, handler);
      }
      async [kClose]() {
        await this[kNoProxyAgent].close();
        if (!this[kHttpProxyAgent][kClosed]) {
          await this[kHttpProxyAgent].close();
        }
        if (!this[kHttpsProxyAgent][kClosed]) {
          await this[kHttpsProxyAgent].close();
        }
      }
      async [kDestroy](err) {
        await this[kNoProxyAgent].destroy(err);
        if (!this[kHttpProxyAgent][kDestroyed]) {
          await this[kHttpProxyAgent].destroy(err);
        }
        if (!this[kHttpsProxyAgent][kDestroyed]) {
          await this[kHttpsProxyAgent].destroy(err);
        }
      }
    };
    _noProxyValue = new WeakMap();
    _noProxyEntries = new WeakMap();
    _opts = new WeakMap();
    _getProxyAgentForUrl = new WeakSet();
    getProxyAgentForUrl_fn = /* @__PURE__ */ __name(function(url) {
      let { protocol, host: hostname, port } = url;
      hostname = hostname.replace(/:\d*$/, "").toLowerCase();
      port = Number.parseInt(port, 10) || DEFAULT_PORTS[protocol] || 0;
      if (!__privateMethod(this, _shouldProxy, shouldProxy_fn).call(this, hostname, port)) {
        return this[kNoProxyAgent];
      }
      if (protocol === "https:") {
        return this[kHttpsProxyAgent];
      }
      return this[kHttpProxyAgent];
    }, "#getProxyAgentForUrl");
    _shouldProxy = new WeakSet();
    shouldProxy_fn = /* @__PURE__ */ __name(function(hostname, port) {
      if (__privateGet(this, _noProxyChanged, noProxyChanged_get)) {
        __privateMethod(this, _parseNoProxy, parseNoProxy_fn).call(this);
      }
      if (__privateGet(this, _noProxyEntries).length === 0) {
        return true;
      }
      if (__privateGet(this, _noProxyValue) === "*") {
        return false;
      }
      for (let i = 0; i < __privateGet(this, _noProxyEntries).length; i++) {
        const entry = __privateGet(this, _noProxyEntries)[i];
        if (entry.port && entry.port !== port) {
          continue;
        }
        if (!/^[.*]/.test(entry.hostname)) {
          if (hostname === entry.hostname) {
            return false;
          }
        } else {
          if (hostname.endsWith(entry.hostname.replace(/^\*/, ""))) {
            return false;
          }
        }
      }
      return true;
    }, "#shouldProxy");
    _parseNoProxy = new WeakSet();
    parseNoProxy_fn = /* @__PURE__ */ __name(function() {
      const noProxyValue = __privateGet(this, _opts).noProxy ?? __privateGet(this, _noProxyEnv, noProxyEnv_get);
      const noProxySplit = noProxyValue.split(/[,\s]/);
      const noProxyEntries = [];
      for (let i = 0; i < noProxySplit.length; i++) {
        const entry = noProxySplit[i];
        if (!entry) {
          continue;
        }
        const parsed = entry.match(/^(.+):(\d+)$/);
        noProxyEntries.push({
          hostname: (parsed ? parsed[1] : entry).toLowerCase(),
          port: parsed ? Number.parseInt(parsed[2], 10) : 0
        });
      }
      __privateSet(this, _noProxyValue, noProxyValue);
      __privateSet(this, _noProxyEntries, noProxyEntries);
    }, "#parseNoProxy");
    _noProxyChanged = new WeakSet();
    noProxyChanged_get = /* @__PURE__ */ __name(function() {
      if (__privateGet(this, _opts).noProxy !== void 0) {
        return false;
      }
      return __privateGet(this, _noProxyValue) !== __privateGet(this, _noProxyEnv, noProxyEnv_get);
    }, "#noProxyChanged");
    _noProxyEnv = new WeakSet();
    noProxyEnv_get = /* @__PURE__ */ __name(function() {
      return define_process_default.env.no_proxy ?? define_process_default.env.NO_PROXY ?? "";
    }, "#noProxyEnv");
    __name(_EnvHttpProxyAgent, "EnvHttpProxyAgent");
    var EnvHttpProxyAgent = _EnvHttpProxyAgent;
    module2.exports = EnvHttpProxyAgent;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/handler/retry-handler.js
var require_retry_handler = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/handler/retry-handler.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { kRetryHandlerDefaultRetry } = require_symbols();
    var { RequestRetryError } = require_errors();
    var {
      isDisturbed,
      parseHeaders,
      parseRangeHeader,
      wrapRequestBody
    } = require_util();
    function calculateRetryAfterHeader(retryAfter) {
      const current = Date.now();
      return new Date(retryAfter).getTime() - current;
    }
    __name(calculateRetryAfterHeader, "calculateRetryAfterHeader");
    var _RetryHandler = class _RetryHandler {
      constructor(opts, handlers) {
        const { retryOptions, ...dispatchOpts } = opts;
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
        } = retryOptions ?? {};
        this.dispatch = handlers.dispatch;
        this.handler = handlers.handler;
        this.opts = { ...dispatchOpts, body: wrapRequestBody(opts.body) };
        this.abort = null;
        this.aborted = false;
        this.retryOpts = {
          retry: retryFn ?? _RetryHandler[kRetryHandlerDefaultRetry],
          retryAfter: retryAfter ?? true,
          maxTimeout: maxTimeout ?? 30 * 1e3,
          // 30s,
          minTimeout: minTimeout ?? 500,
          // .5s
          timeoutFactor: timeoutFactor ?? 2,
          maxRetries: maxRetries ?? 5,
          // What errors we should retry
          methods: methods ?? ["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "TRACE"],
          // Indicates which errors to retry
          statusCodes: statusCodes ?? [500, 502, 503, 504, 429],
          // List of errors to retry
          errorCodes: errorCodes ?? [
            "ECONNRESET",
            "ECONNREFUSED",
            "ENOTFOUND",
            "ENETDOWN",
            "ENETUNREACH",
            "EHOSTDOWN",
            "EHOSTUNREACH",
            "EPIPE",
            "UND_ERR_SOCKET"
          ]
        };
        this.retryCount = 0;
        this.retryCountCheckpoint = 0;
        this.start = 0;
        this.end = null;
        this.etag = null;
        this.resume = null;
        this.handler.onConnect((reason) => {
          this.aborted = true;
          if (this.abort) {
            this.abort(reason);
          } else {
            this.reason = reason;
          }
        });
      }
      onRequestSent() {
        if (this.handler.onRequestSent) {
          this.handler.onRequestSent();
        }
      }
      onUpgrade(statusCode, headers, socket) {
        if (this.handler.onUpgrade) {
          this.handler.onUpgrade(statusCode, headers, socket);
        }
      }
      onConnect(abort) {
        if (this.aborted) {
          abort(this.reason);
        } else {
          this.abort = abort;
        }
      }
      onBodySent(chunk) {
        if (this.handler.onBodySent)
          return this.handler.onBodySent(chunk);
      }
      static [kRetryHandlerDefaultRetry](err, { state, opts }, cb) {
        const { statusCode, code, headers } = err;
        const { method, retryOptions } = opts;
        const {
          maxRetries,
          minTimeout,
          maxTimeout,
          timeoutFactor,
          statusCodes,
          errorCodes,
          methods
        } = retryOptions;
        const { counter } = state;
        if (code && code !== "UND_ERR_REQ_RETRY" && !errorCodes.includes(code)) {
          cb(err);
          return;
        }
        if (Array.isArray(methods) && !methods.includes(method)) {
          cb(err);
          return;
        }
        if (statusCode != null && Array.isArray(statusCodes) && !statusCodes.includes(statusCode)) {
          cb(err);
          return;
        }
        if (counter > maxRetries) {
          cb(err);
          return;
        }
        let retryAfterHeader = headers?.["retry-after"];
        if (retryAfterHeader) {
          retryAfterHeader = Number(retryAfterHeader);
          retryAfterHeader = Number.isNaN(retryAfterHeader) ? calculateRetryAfterHeader(retryAfterHeader) : retryAfterHeader * 1e3;
        }
        const retryTimeout = retryAfterHeader > 0 ? Math.min(retryAfterHeader, maxTimeout) : Math.min(minTimeout * timeoutFactor ** (counter - 1), maxTimeout);
        setTimeout(() => cb(null), retryTimeout);
      }
      onHeaders(statusCode, rawHeaders, resume, statusMessage) {
        const headers = parseHeaders(rawHeaders);
        this.retryCount += 1;
        if (statusCode >= 300) {
          if (this.retryOpts.statusCodes.includes(statusCode) === false) {
            return this.handler.onHeaders(
              statusCode,
              rawHeaders,
              resume,
              statusMessage
            );
          } else {
            this.abort(
              new RequestRetryError("Request failed", statusCode, {
                headers,
                data: {
                  count: this.retryCount
                }
              })
            );
            return false;
          }
        }
        if (this.resume != null) {
          this.resume = null;
          if (statusCode !== 206 && (this.start > 0 || statusCode !== 200)) {
            this.abort(
              new RequestRetryError("server does not support the range header and the payload was partially consumed", statusCode, {
                headers,
                data: { count: this.retryCount }
              })
            );
            return false;
          }
          const contentRange = parseRangeHeader(headers["content-range"]);
          if (!contentRange) {
            this.abort(
              new RequestRetryError("Content-Range mismatch", statusCode, {
                headers,
                data: { count: this.retryCount }
              })
            );
            return false;
          }
          if (this.etag != null && this.etag !== headers.etag) {
            this.abort(
              new RequestRetryError("ETag mismatch", statusCode, {
                headers,
                data: { count: this.retryCount }
              })
            );
            return false;
          }
          const { start, size, end = size - 1 } = contentRange;
          assert(this.start === start, "content-range mismatch");
          assert(this.end == null || this.end === end, "content-range mismatch");
          this.resume = resume;
          return true;
        }
        if (this.end == null) {
          if (statusCode === 206) {
            const range = parseRangeHeader(headers["content-range"]);
            if (range == null) {
              return this.handler.onHeaders(
                statusCode,
                rawHeaders,
                resume,
                statusMessage
              );
            }
            const { start, size, end = size - 1 } = range;
            assert(
              start != null && Number.isFinite(start),
              "content-range mismatch"
            );
            assert(end != null && Number.isFinite(end), "invalid content-length");
            this.start = start;
            this.end = end;
          }
          if (this.end == null) {
            const contentLength = headers["content-length"];
            this.end = contentLength != null ? Number(contentLength) - 1 : null;
          }
          assert(Number.isFinite(this.start));
          assert(
            this.end == null || Number.isFinite(this.end),
            "invalid content-length"
          );
          this.resume = resume;
          this.etag = headers.etag != null ? headers.etag : null;
          if (this.etag != null && this.etag.startsWith("W/")) {
            this.etag = null;
          }
          return this.handler.onHeaders(
            statusCode,
            rawHeaders,
            resume,
            statusMessage
          );
        }
        const err = new RequestRetryError("Request failed", statusCode, {
          headers,
          data: { count: this.retryCount }
        });
        this.abort(err);
        return false;
      }
      onData(chunk) {
        this.start += chunk.length;
        return this.handler.onData(chunk);
      }
      onComplete(rawTrailers) {
        this.retryCount = 0;
        return this.handler.onComplete(rawTrailers);
      }
      onError(err) {
        if (this.aborted || isDisturbed(this.opts.body)) {
          return this.handler.onError(err);
        }
        if (this.retryCount - this.retryCountCheckpoint > 0) {
          this.retryCount = this.retryCountCheckpoint + (this.retryCount - this.retryCountCheckpoint);
        } else {
          this.retryCount += 1;
        }
        this.retryOpts.retry(
          err,
          {
            state: { counter: this.retryCount },
            opts: { retryOptions: this.retryOpts, ...this.opts }
          },
          onRetry.bind(this)
        );
        function onRetry(err2) {
          if (err2 != null || this.aborted || isDisturbed(this.opts.body)) {
            return this.handler.onError(err2);
          }
          if (this.start !== 0) {
            const headers = { range: `bytes=${this.start}-${this.end ?? ""}` };
            if (this.etag != null) {
              headers["if-match"] = this.etag;
            }
            this.opts = {
              ...this.opts,
              headers: {
                ...this.opts.headers,
                ...headers
              }
            };
          }
          try {
            this.retryCountCheckpoint = this.retryCount;
            this.dispatch(this.opts, this);
          } catch (err3) {
            this.handler.onError(err3);
          }
        }
        __name(onRetry, "onRetry");
      }
    };
    __name(_RetryHandler, "RetryHandler");
    var RetryHandler = _RetryHandler;
    module2.exports = RetryHandler;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/retry-agent.js
var require_retry_agent = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/dispatcher/retry-agent.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var Dispatcher = require_dispatcher();
    var RetryHandler = require_retry_handler();
    var _agent, _options;
    var _RetryAgent = class _RetryAgent extends Dispatcher {
      constructor(agent, options = {}) {
        super(options);
        __privateAdd(this, _agent, null);
        __privateAdd(this, _options, null);
        __privateSet(this, _agent, agent);
        __privateSet(this, _options, options);
      }
      dispatch(opts, handler) {
        const retry = new RetryHandler({
          ...opts,
          retryOptions: __privateGet(this, _options)
        }, {
          dispatch: __privateGet(this, _agent).dispatch.bind(__privateGet(this, _agent)),
          handler
        });
        return __privateGet(this, _agent).dispatch(opts, retry);
      }
      close() {
        return __privateGet(this, _agent).close();
      }
      destroy() {
        return __privateGet(this, _agent).destroy();
      }
    };
    _agent = new WeakMap();
    _options = new WeakMap();
    __name(_RetryAgent, "RetryAgent");
    var RetryAgent = _RetryAgent;
    module2.exports = RetryAgent;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/readable.js
var require_readable = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/readable.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { Readable } = require("stream");
    var { RequestAbortedError, NotSupportedError, InvalidArgumentError, AbortError } = require_errors();
    var util = require_util();
    var { ReadableStreamFrom } = require_util();
    var kConsume = Symbol("kConsume");
    var kReading = Symbol("kReading");
    var kBody = Symbol("kBody");
    var kAbort = Symbol("kAbort");
    var kContentType = Symbol("kContentType");
    var kContentLength = Symbol("kContentLength");
    var noop = /* @__PURE__ */ __name(() => {
    }, "noop");
    var _BodyReadable = class _BodyReadable extends Readable {
      constructor({
        resume,
        abort,
        contentType = "",
        contentLength,
        highWaterMark = 64 * 1024
        // Same as nodejs fs streams.
      }) {
        super({
          autoDestroy: true,
          read: resume,
          highWaterMark
        });
        this._readableState.dataEmitted = false;
        this[kAbort] = abort;
        this[kConsume] = null;
        this[kBody] = null;
        this[kContentType] = contentType;
        this[kContentLength] = contentLength;
        this[kReading] = false;
      }
      destroy(err) {
        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError();
        }
        if (err) {
          this[kAbort]();
        }
        return super.destroy(err);
      }
      _destroy(err, callback) {
        if (!this[kReading]) {
          setImmediate(() => {
            callback(err);
          });
        } else {
          callback(err);
        }
      }
      on(ev, ...args) {
        if (ev === "data" || ev === "readable") {
          this[kReading] = true;
        }
        return super.on(ev, ...args);
      }
      addListener(ev, ...args) {
        return this.on(ev, ...args);
      }
      off(ev, ...args) {
        const ret = super.off(ev, ...args);
        if (ev === "data" || ev === "readable") {
          this[kReading] = this.listenerCount("data") > 0 || this.listenerCount("readable") > 0;
        }
        return ret;
      }
      removeListener(ev, ...args) {
        return this.off(ev, ...args);
      }
      push(chunk) {
        if (this[kConsume] && chunk !== null) {
          consumePush(this[kConsume], chunk);
          return this[kReading] ? super.push(chunk) : true;
        }
        return super.push(chunk);
      }
      // https://fetch.spec.whatwg.org/#dom-body-text
      async text() {
        return consume(this, "text");
      }
      // https://fetch.spec.whatwg.org/#dom-body-json
      async json() {
        return consume(this, "json");
      }
      // https://fetch.spec.whatwg.org/#dom-body-blob
      async blob() {
        return consume(this, "blob");
      }
      // https://fetch.spec.whatwg.org/#dom-body-bytes
      async bytes() {
        return consume(this, "bytes");
      }
      // https://fetch.spec.whatwg.org/#dom-body-arraybuffer
      async arrayBuffer() {
        return consume(this, "arrayBuffer");
      }
      // https://fetch.spec.whatwg.org/#dom-body-formdata
      async formData() {
        throw new NotSupportedError();
      }
      // https://fetch.spec.whatwg.org/#dom-body-bodyused
      get bodyUsed() {
        return util.isDisturbed(this);
      }
      // https://fetch.spec.whatwg.org/#dom-body-body
      get body() {
        if (!this[kBody]) {
          this[kBody] = ReadableStreamFrom(this);
          if (this[kConsume]) {
            this[kBody].getReader();
            assert(this[kBody].locked);
          }
        }
        return this[kBody];
      }
      async dump(opts) {
        let limit = Number.isFinite(opts?.limit) ? opts.limit : 128 * 1024;
        const signal = opts?.signal;
        if (signal != null && (typeof signal !== "object" || !("aborted" in signal))) {
          throw new InvalidArgumentError("signal must be an AbortSignal");
        }
        signal?.throwIfAborted();
        if (this._readableState.closeEmitted) {
          return null;
        }
        return await new Promise((resolve, reject) => {
          if (this[kContentLength] > limit) {
            this.destroy(new AbortError());
          }
          const onAbort = /* @__PURE__ */ __name(() => {
            this.destroy(signal.reason ?? new AbortError());
          }, "onAbort");
          signal?.addEventListener("abort", onAbort);
          this.on("close", function() {
            signal?.removeEventListener("abort", onAbort);
            if (signal?.aborted) {
              reject(signal.reason ?? new AbortError());
            } else {
              resolve(null);
            }
          }).on("error", noop).on("data", function(chunk) {
            limit -= chunk.length;
            if (limit <= 0) {
              this.destroy();
            }
          }).resume();
        });
      }
    };
    __name(_BodyReadable, "BodyReadable");
    var BodyReadable = _BodyReadable;
    function isLocked(self) {
      return self[kBody] && self[kBody].locked === true || self[kConsume];
    }
    __name(isLocked, "isLocked");
    function isUnusable(self) {
      return util.isDisturbed(self) || isLocked(self);
    }
    __name(isUnusable, "isUnusable");
    async function consume(stream, type) {
      assert(!stream[kConsume]);
      return new Promise((resolve, reject) => {
        if (isUnusable(stream)) {
          const rState = stream._readableState;
          if (rState.destroyed && rState.closeEmitted === false) {
            stream.on("error", (err) => {
              reject(err);
            }).on("close", () => {
              reject(new TypeError("unusable"));
            });
          } else {
            reject(rState.errored ?? new TypeError("unusable"));
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
            };
            stream.on("error", function(err) {
              consumeFinish(this[kConsume], err);
            }).on("close", function() {
              if (this[kConsume].body !== null) {
                consumeFinish(this[kConsume], new RequestAbortedError());
              }
            });
            consumeStart(stream[kConsume]);
          });
        }
      });
    }
    __name(consume, "consume");
    function consumeStart(consume2) {
      if (consume2.body === null) {
        return;
      }
      const { _readableState: state } = consume2.stream;
      if (state.bufferIndex) {
        const start = state.bufferIndex;
        const end = state.buffer.length;
        for (let n = start; n < end; n++) {
          consumePush(consume2, state.buffer[n]);
        }
      } else {
        for (const chunk of state.buffer) {
          consumePush(consume2, chunk);
        }
      }
      if (state.endEmitted) {
        consumeEnd(this[kConsume]);
      } else {
        consume2.stream.on("end", function() {
          consumeEnd(this[kConsume]);
        });
      }
      consume2.stream.resume();
      while (consume2.stream.read() != null) {
      }
    }
    __name(consumeStart, "consumeStart");
    function chunksDecode(chunks, length) {
      if (chunks.length === 0 || length === 0) {
        return "";
      }
      const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, length);
      const bufferLength = buffer.length;
      const start = bufferLength > 2 && buffer[0] === 239 && buffer[1] === 187 && buffer[2] === 191 ? 3 : 0;
      return buffer.utf8Slice(start, bufferLength);
    }
    __name(chunksDecode, "chunksDecode");
    function chunksConcat(chunks, length) {
      if (chunks.length === 0 || length === 0) {
        return new Uint8Array(0);
      }
      if (chunks.length === 1) {
        return new Uint8Array(chunks[0]);
      }
      const buffer = new Uint8Array(Buffer.allocUnsafeSlow(length).buffer);
      let offset = 0;
      for (let i = 0; i < chunks.length; ++i) {
        const chunk = chunks[i];
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      return buffer;
    }
    __name(chunksConcat, "chunksConcat");
    function consumeEnd(consume2) {
      const { type, body, resolve, stream, length } = consume2;
      try {
        if (type === "text") {
          resolve(chunksDecode(body, length));
        } else if (type === "json") {
          resolve(JSON.parse(chunksDecode(body, length)));
        } else if (type === "arrayBuffer") {
          resolve(chunksConcat(body, length).buffer);
        } else if (type === "blob") {
          resolve(new Blob(body, { type: stream[kContentType] }));
        } else if (type === "bytes") {
          resolve(chunksConcat(body, length));
        }
        consumeFinish(consume2);
      } catch (err) {
        stream.destroy(err);
      }
    }
    __name(consumeEnd, "consumeEnd");
    function consumePush(consume2, chunk) {
      consume2.length += chunk.length;
      consume2.body.push(chunk);
    }
    __name(consumePush, "consumePush");
    function consumeFinish(consume2, err) {
      if (consume2.body === null) {
        return;
      }
      if (err) {
        consume2.reject(err);
      } else {
        consume2.resolve();
      }
      consume2.type = null;
      consume2.stream = null;
      consume2.resolve = null;
      consume2.reject = null;
      consume2.length = 0;
      consume2.body = null;
    }
    __name(consumeFinish, "consumeFinish");
    module2.exports = { Readable: BodyReadable, chunksDecode };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/util.js
var require_util3 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var {
      ResponseStatusCodeError
    } = require_errors();
    var { chunksDecode } = require_readable();
    var CHUNK_LIMIT = 128 * 1024;
    async function getResolveErrorBodyCallback({ callback, body, contentType, statusCode, statusMessage, headers }) {
      assert(body);
      let chunks = [];
      let length = 0;
      try {
        for await (const chunk of body) {
          chunks.push(chunk);
          length += chunk.length;
          if (length > CHUNK_LIMIT) {
            chunks = [];
            length = 0;
            break;
          }
        }
      } catch {
        chunks = [];
        length = 0;
      }
      const message = `Response status code ${statusCode}${statusMessage ? `: ${statusMessage}` : ""}`;
      if (statusCode === 204 || !contentType || !length) {
        queueMicrotask(() => callback(new ResponseStatusCodeError(message, statusCode, headers)));
        return;
      }
      const stackTraceLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = 0;
      let payload;
      try {
        if (isContentTypeApplicationJson(contentType)) {
          payload = JSON.parse(chunksDecode(chunks, length));
        } else if (isContentTypeText(contentType)) {
          payload = chunksDecode(chunks, length);
        }
      } catch {
      } finally {
        Error.stackTraceLimit = stackTraceLimit;
      }
      queueMicrotask(() => callback(new ResponseStatusCodeError(message, statusCode, headers, payload)));
    }
    __name(getResolveErrorBodyCallback, "getResolveErrorBodyCallback");
    var isContentTypeApplicationJson = /* @__PURE__ */ __name((contentType) => {
      return contentType.length > 15 && contentType[11] === "/" && contentType[0] === "a" && contentType[1] === "p" && contentType[2] === "p" && contentType[3] === "l" && contentType[4] === "i" && contentType[5] === "c" && contentType[6] === "a" && contentType[7] === "t" && contentType[8] === "i" && contentType[9] === "o" && contentType[10] === "n" && contentType[12] === "j" && contentType[13] === "s" && contentType[14] === "o" && contentType[15] === "n";
    }, "isContentTypeApplicationJson");
    var isContentTypeText = /* @__PURE__ */ __name((contentType) => {
      return contentType.length > 4 && contentType[4] === "/" && contentType[0] === "t" && contentType[1] === "e" && contentType[2] === "x" && contentType[3] === "t";
    }, "isContentTypeText");
    module2.exports = {
      getResolveErrorBodyCallback,
      isContentTypeApplicationJson,
      isContentTypeText
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-request.js
var require_api_request = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-request.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { Readable } = require_readable();
    var { InvalidArgumentError, RequestAbortedError } = require_errors();
    var util = require_util();
    var { getResolveErrorBodyCallback } = require_util3();
    var { AsyncResource } = require("async_hooks");
    var _RequestHandler = class _RequestHandler extends AsyncResource {
      constructor(opts, callback) {
        if (!opts || typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        const { signal, method, opaque, body, onInfo, responseHeaders, throwOnError, highWaterMark } = opts;
        try {
          if (typeof callback !== "function") {
            throw new InvalidArgumentError("invalid callback");
          }
          if (highWaterMark && (typeof highWaterMark !== "number" || highWaterMark < 0)) {
            throw new InvalidArgumentError("invalid highWaterMark");
          }
          if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
            throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
          }
          if (method === "CONNECT") {
            throw new InvalidArgumentError("invalid method");
          }
          if (onInfo && typeof onInfo !== "function") {
            throw new InvalidArgumentError("invalid onInfo callback");
          }
          super("UNDICI_REQUEST");
        } catch (err) {
          if (util.isStream(body)) {
            util.destroy(body.on("error", util.nop), err);
          }
          throw err;
        }
        this.method = method;
        this.responseHeaders = responseHeaders || null;
        this.opaque = opaque || null;
        this.callback = callback;
        this.res = null;
        this.abort = null;
        this.body = body;
        this.trailers = {};
        this.context = null;
        this.onInfo = onInfo || null;
        this.throwOnError = throwOnError;
        this.highWaterMark = highWaterMark;
        this.signal = signal;
        this.reason = null;
        this.removeAbortListener = null;
        if (util.isStream(body)) {
          body.on("error", (err) => {
            this.onError(err);
          });
        }
        if (this.signal) {
          if (this.signal.aborted) {
            this.reason = this.signal.reason ?? new RequestAbortedError();
          } else {
            this.removeAbortListener = util.addAbortListener(this.signal, () => {
              this.reason = this.signal.reason ?? new RequestAbortedError();
              if (this.res) {
                util.destroy(this.res, this.reason);
              } else if (this.abort) {
                this.abort(this.reason);
              }
              if (this.removeAbortListener) {
                this.res?.off("close", this.removeAbortListener);
                this.removeAbortListener();
                this.removeAbortListener = null;
              }
            });
          }
        }
      }
      onConnect(abort, context) {
        if (this.reason) {
          abort(this.reason);
          return;
        }
        assert(this.callback);
        this.abort = abort;
        this.context = context;
      }
      onHeaders(statusCode, rawHeaders, resume, statusMessage) {
        const { callback, opaque, abort, context, responseHeaders, highWaterMark } = this;
        const headers = responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
        if (statusCode < 200) {
          if (this.onInfo) {
            this.onInfo({ statusCode, headers });
          }
          return;
        }
        const parsedHeaders = responseHeaders === "raw" ? util.parseHeaders(rawHeaders) : headers;
        const contentType = parsedHeaders["content-type"];
        const contentLength = parsedHeaders["content-length"];
        const res = new Readable({
          resume,
          abort,
          contentType,
          contentLength: this.method !== "HEAD" && contentLength ? Number(contentLength) : null,
          highWaterMark
        });
        if (this.removeAbortListener) {
          res.on("close", this.removeAbortListener);
        }
        this.callback = null;
        this.res = res;
        if (callback !== null) {
          if (this.throwOnError && statusCode >= 400) {
            this.runInAsyncScope(
              getResolveErrorBodyCallback,
              null,
              { callback, body: res, contentType, statusCode, statusMessage, headers }
            );
          } else {
            this.runInAsyncScope(callback, null, null, {
              statusCode,
              headers,
              trailers: this.trailers,
              opaque,
              body: res,
              context
            });
          }
        }
      }
      onData(chunk) {
        return this.res.push(chunk);
      }
      onComplete(trailers) {
        util.parseHeaders(trailers, this.trailers);
        this.res.push(null);
      }
      onError(err) {
        const { res, callback, body, opaque } = this;
        if (callback) {
          this.callback = null;
          queueMicrotask(() => {
            this.runInAsyncScope(callback, null, err, { opaque });
          });
        }
        if (res) {
          this.res = null;
          queueMicrotask(() => {
            util.destroy(res, err);
          });
        }
        if (body) {
          this.body = null;
          util.destroy(body, err);
        }
        if (this.removeAbortListener) {
          res?.off("close", this.removeAbortListener);
          this.removeAbortListener();
          this.removeAbortListener = null;
        }
      }
    };
    __name(_RequestHandler, "RequestHandler");
    var RequestHandler = _RequestHandler;
    function request(opts, callback) {
      if (callback === void 0) {
        return new Promise((resolve, reject) => {
          request.call(this, opts, (err, data) => {
            return err ? reject(err) : resolve(data);
          });
        });
      }
      try {
        this.dispatch(opts, new RequestHandler(opts, callback));
      } catch (err) {
        if (typeof callback !== "function") {
          throw err;
        }
        const opaque = opts?.opaque;
        queueMicrotask(() => callback(err, { opaque }));
      }
    }
    __name(request, "request");
    module2.exports = request;
    module2.exports.RequestHandler = RequestHandler;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/abort-signal.js
var require_abort_signal = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/abort-signal.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { addAbortListener } = require_util();
    var { RequestAbortedError } = require_errors();
    var kListener = Symbol("kListener");
    var kSignal = Symbol("kSignal");
    function abort(self) {
      if (self.abort) {
        self.abort(self[kSignal]?.reason);
      } else {
        self.reason = self[kSignal]?.reason ?? new RequestAbortedError();
      }
      removeSignal(self);
    }
    __name(abort, "abort");
    function addSignal(self, signal) {
      self.reason = null;
      self[kSignal] = null;
      self[kListener] = null;
      if (!signal) {
        return;
      }
      if (signal.aborted) {
        abort(self);
        return;
      }
      self[kSignal] = signal;
      self[kListener] = () => {
        abort(self);
      };
      addAbortListener(self[kSignal], self[kListener]);
    }
    __name(addSignal, "addSignal");
    function removeSignal(self) {
      if (!self[kSignal]) {
        return;
      }
      if ("removeEventListener" in self[kSignal]) {
        self[kSignal].removeEventListener("abort", self[kListener]);
      } else {
        self[kSignal].removeListener("abort", self[kListener]);
      }
      self[kSignal] = null;
      self[kListener] = null;
    }
    __name(removeSignal, "removeSignal");
    module2.exports = {
      addSignal,
      removeSignal
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-stream.js
var require_api_stream = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-stream.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { finished, PassThrough } = require("stream");
    var { InvalidArgumentError, InvalidReturnValueError } = require_errors();
    var util = require_util();
    var { getResolveErrorBodyCallback } = require_util3();
    var { AsyncResource } = require("async_hooks");
    var { addSignal, removeSignal } = require_abort_signal();
    var _StreamHandler = class _StreamHandler extends AsyncResource {
      constructor(opts, factory, callback) {
        if (!opts || typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        const { signal, method, opaque, body, onInfo, responseHeaders, throwOnError } = opts;
        try {
          if (typeof callback !== "function") {
            throw new InvalidArgumentError("invalid callback");
          }
          if (typeof factory !== "function") {
            throw new InvalidArgumentError("invalid factory");
          }
          if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
            throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
          }
          if (method === "CONNECT") {
            throw new InvalidArgumentError("invalid method");
          }
          if (onInfo && typeof onInfo !== "function") {
            throw new InvalidArgumentError("invalid onInfo callback");
          }
          super("UNDICI_STREAM");
        } catch (err) {
          if (util.isStream(body)) {
            util.destroy(body.on("error", util.nop), err);
          }
          throw err;
        }
        this.responseHeaders = responseHeaders || null;
        this.opaque = opaque || null;
        this.factory = factory;
        this.callback = callback;
        this.res = null;
        this.abort = null;
        this.context = null;
        this.trailers = null;
        this.body = body;
        this.onInfo = onInfo || null;
        this.throwOnError = throwOnError || false;
        if (util.isStream(body)) {
          body.on("error", (err) => {
            this.onError(err);
          });
        }
        addSignal(this, signal);
      }
      onConnect(abort, context) {
        if (this.reason) {
          abort(this.reason);
          return;
        }
        assert(this.callback);
        this.abort = abort;
        this.context = context;
      }
      onHeaders(statusCode, rawHeaders, resume, statusMessage) {
        const { factory, opaque, context, callback, responseHeaders } = this;
        const headers = responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
        if (statusCode < 200) {
          if (this.onInfo) {
            this.onInfo({ statusCode, headers });
          }
          return;
        }
        this.factory = null;
        let res;
        if (this.throwOnError && statusCode >= 400) {
          const parsedHeaders = responseHeaders === "raw" ? util.parseHeaders(rawHeaders) : headers;
          const contentType = parsedHeaders["content-type"];
          res = new PassThrough();
          this.callback = null;
          this.runInAsyncScope(
            getResolveErrorBodyCallback,
            null,
            { callback, body: res, contentType, statusCode, statusMessage, headers }
          );
        } else {
          if (factory === null) {
            return;
          }
          res = this.runInAsyncScope(factory, null, {
            statusCode,
            headers,
            opaque,
            context
          });
          if (!res || typeof res.write !== "function" || typeof res.end !== "function" || typeof res.on !== "function") {
            throw new InvalidReturnValueError("expected Writable");
          }
          finished(res, { readable: false }, (err) => {
            const { callback: callback2, res: res2, opaque: opaque2, trailers, abort } = this;
            this.res = null;
            if (err || !res2.readable) {
              util.destroy(res2, err);
            }
            this.callback = null;
            this.runInAsyncScope(callback2, null, err || null, { opaque: opaque2, trailers });
            if (err) {
              abort();
            }
          });
        }
        res.on("drain", resume);
        this.res = res;
        const needDrain = res.writableNeedDrain !== void 0 ? res.writableNeedDrain : res._writableState?.needDrain;
        return needDrain !== true;
      }
      onData(chunk) {
        const { res } = this;
        return res ? res.write(chunk) : true;
      }
      onComplete(trailers) {
        const { res } = this;
        removeSignal(this);
        if (!res) {
          return;
        }
        this.trailers = util.parseHeaders(trailers);
        res.end();
      }
      onError(err) {
        const { res, callback, opaque, body } = this;
        removeSignal(this);
        this.factory = null;
        if (res) {
          this.res = null;
          util.destroy(res, err);
        } else if (callback) {
          this.callback = null;
          queueMicrotask(() => {
            this.runInAsyncScope(callback, null, err, { opaque });
          });
        }
        if (body) {
          this.body = null;
          util.destroy(body, err);
        }
      }
    };
    __name(_StreamHandler, "StreamHandler");
    var StreamHandler = _StreamHandler;
    function stream(opts, factory, callback) {
      if (callback === void 0) {
        return new Promise((resolve, reject) => {
          stream.call(this, opts, factory, (err, data) => {
            return err ? reject(err) : resolve(data);
          });
        });
      }
      try {
        this.dispatch(opts, new StreamHandler(opts, factory, callback));
      } catch (err) {
        if (typeof callback !== "function") {
          throw err;
        }
        const opaque = opts?.opaque;
        queueMicrotask(() => callback(err, { opaque }));
      }
    }
    __name(stream, "stream");
    module2.exports = stream;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-pipeline.js
var require_api_pipeline = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-pipeline.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      Readable,
      Duplex,
      PassThrough
    } = require("stream");
    var {
      InvalidArgumentError,
      InvalidReturnValueError,
      RequestAbortedError
    } = require_errors();
    var util = require_util();
    var { AsyncResource } = require("async_hooks");
    var { addSignal, removeSignal } = require_abort_signal();
    var assert = require("assert");
    var kResume = Symbol("resume");
    var _PipelineRequest = class _PipelineRequest extends Readable {
      constructor() {
        super({ autoDestroy: true });
        this[kResume] = null;
      }
      _read() {
        const { [kResume]: resume } = this;
        if (resume) {
          this[kResume] = null;
          resume();
        }
      }
      _destroy(err, callback) {
        this._read();
        callback(err);
      }
    };
    __name(_PipelineRequest, "PipelineRequest");
    var PipelineRequest = _PipelineRequest;
    var _PipelineResponse = class _PipelineResponse extends Readable {
      constructor(resume) {
        super({ autoDestroy: true });
        this[kResume] = resume;
      }
      _read() {
        this[kResume]();
      }
      _destroy(err, callback) {
        if (!err && !this._readableState.endEmitted) {
          err = new RequestAbortedError();
        }
        callback(err);
      }
    };
    __name(_PipelineResponse, "PipelineResponse");
    var PipelineResponse = _PipelineResponse;
    var _PipelineHandler = class _PipelineHandler extends AsyncResource {
      constructor(opts, handler) {
        if (!opts || typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        if (typeof handler !== "function") {
          throw new InvalidArgumentError("invalid handler");
        }
        const { signal, method, opaque, onInfo, responseHeaders } = opts;
        if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
          throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
        }
        if (method === "CONNECT") {
          throw new InvalidArgumentError("invalid method");
        }
        if (onInfo && typeof onInfo !== "function") {
          throw new InvalidArgumentError("invalid onInfo callback");
        }
        super("UNDICI_PIPELINE");
        this.opaque = opaque || null;
        this.responseHeaders = responseHeaders || null;
        this.handler = handler;
        this.abort = null;
        this.context = null;
        this.onInfo = onInfo || null;
        this.req = new PipelineRequest().on("error", util.nop);
        this.ret = new Duplex({
          readableObjectMode: opts.objectMode,
          autoDestroy: true,
          read: () => {
            const { body } = this;
            if (body?.resume) {
              body.resume();
            }
          },
          write: (chunk, encoding, callback) => {
            const { req } = this;
            if (req.push(chunk, encoding) || req._readableState.destroyed) {
              callback();
            } else {
              req[kResume] = callback;
            }
          },
          destroy: (err, callback) => {
            const { body, req, res, ret, abort } = this;
            if (!err && !ret._readableState.endEmitted) {
              err = new RequestAbortedError();
            }
            if (abort && err) {
              abort();
            }
            util.destroy(body, err);
            util.destroy(req, err);
            util.destroy(res, err);
            removeSignal(this);
            callback(err);
          }
        }).on("prefinish", () => {
          const { req } = this;
          req.push(null);
        });
        this.res = null;
        addSignal(this, signal);
      }
      onConnect(abort, context) {
        const { ret, res } = this;
        if (this.reason) {
          abort(this.reason);
          return;
        }
        assert(!res, "pipeline cannot be retried");
        assert(!ret.destroyed);
        this.abort = abort;
        this.context = context;
      }
      onHeaders(statusCode, rawHeaders, resume) {
        const { opaque, handler, context } = this;
        if (statusCode < 200) {
          if (this.onInfo) {
            const headers = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
            this.onInfo({ statusCode, headers });
          }
          return;
        }
        this.res = new PipelineResponse(resume);
        let body;
        try {
          this.handler = null;
          const headers = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
          body = this.runInAsyncScope(handler, null, {
            statusCode,
            headers,
            opaque,
            body: this.res,
            context
          });
        } catch (err) {
          this.res.on("error", util.nop);
          throw err;
        }
        if (!body || typeof body.on !== "function") {
          throw new InvalidReturnValueError("expected Readable");
        }
        body.on("data", (chunk) => {
          const { ret, body: body2 } = this;
          if (!ret.push(chunk) && body2.pause) {
            body2.pause();
          }
        }).on("error", (err) => {
          const { ret } = this;
          util.destroy(ret, err);
        }).on("end", () => {
          const { ret } = this;
          ret.push(null);
        }).on("close", () => {
          const { ret } = this;
          if (!ret._readableState.ended) {
            util.destroy(ret, new RequestAbortedError());
          }
        });
        this.body = body;
      }
      onData(chunk) {
        const { res } = this;
        return res.push(chunk);
      }
      onComplete(trailers) {
        const { res } = this;
        res.push(null);
      }
      onError(err) {
        const { ret } = this;
        this.handler = null;
        util.destroy(ret, err);
      }
    };
    __name(_PipelineHandler, "PipelineHandler");
    var PipelineHandler = _PipelineHandler;
    function pipeline(opts, handler) {
      try {
        const pipelineHandler = new PipelineHandler(opts, handler);
        this.dispatch({ ...opts, body: pipelineHandler.req }, pipelineHandler);
        return pipelineHandler.ret;
      } catch (err) {
        return new PassThrough().destroy(err);
      }
    }
    __name(pipeline, "pipeline");
    module2.exports = pipeline;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-upgrade.js
var require_api_upgrade = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-upgrade.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { InvalidArgumentError, SocketError } = require_errors();
    var { AsyncResource } = require("async_hooks");
    var util = require_util();
    var { addSignal, removeSignal } = require_abort_signal();
    var assert = require("assert");
    var _UpgradeHandler = class _UpgradeHandler extends AsyncResource {
      constructor(opts, callback) {
        if (!opts || typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError("invalid callback");
        }
        const { signal, opaque, responseHeaders } = opts;
        if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
          throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
        }
        super("UNDICI_UPGRADE");
        this.responseHeaders = responseHeaders || null;
        this.opaque = opaque || null;
        this.callback = callback;
        this.abort = null;
        this.context = null;
        addSignal(this, signal);
      }
      onConnect(abort, context) {
        if (this.reason) {
          abort(this.reason);
          return;
        }
        assert(this.callback);
        this.abort = abort;
        this.context = null;
      }
      onHeaders() {
        throw new SocketError("bad upgrade", null);
      }
      onUpgrade(statusCode, rawHeaders, socket) {
        assert(statusCode === 101);
        const { callback, opaque, context } = this;
        removeSignal(this);
        this.callback = null;
        const headers = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
        this.runInAsyncScope(callback, null, null, {
          headers,
          socket,
          opaque,
          context
        });
      }
      onError(err) {
        const { callback, opaque } = this;
        removeSignal(this);
        if (callback) {
          this.callback = null;
          queueMicrotask(() => {
            this.runInAsyncScope(callback, null, err, { opaque });
          });
        }
      }
    };
    __name(_UpgradeHandler, "UpgradeHandler");
    var UpgradeHandler = _UpgradeHandler;
    function upgrade(opts, callback) {
      if (callback === void 0) {
        return new Promise((resolve, reject) => {
          upgrade.call(this, opts, (err, data) => {
            return err ? reject(err) : resolve(data);
          });
        });
      }
      try {
        const upgradeHandler = new UpgradeHandler(opts, callback);
        this.dispatch({
          ...opts,
          method: opts.method || "GET",
          upgrade: opts.protocol || "Websocket"
        }, upgradeHandler);
      } catch (err) {
        if (typeof callback !== "function") {
          throw err;
        }
        const opaque = opts?.opaque;
        queueMicrotask(() => callback(err, { opaque }));
      }
    }
    __name(upgrade, "upgrade");
    module2.exports = upgrade;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-connect.js
var require_api_connect = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/api-connect.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { AsyncResource } = require("async_hooks");
    var { InvalidArgumentError, SocketError } = require_errors();
    var util = require_util();
    var { addSignal, removeSignal } = require_abort_signal();
    var _ConnectHandler = class _ConnectHandler extends AsyncResource {
      constructor(opts, callback) {
        if (!opts || typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        if (typeof callback !== "function") {
          throw new InvalidArgumentError("invalid callback");
        }
        const { signal, opaque, responseHeaders } = opts;
        if (signal && typeof signal.on !== "function" && typeof signal.addEventListener !== "function") {
          throw new InvalidArgumentError("signal must be an EventEmitter or EventTarget");
        }
        super("UNDICI_CONNECT");
        this.opaque = opaque || null;
        this.responseHeaders = responseHeaders || null;
        this.callback = callback;
        this.abort = null;
        addSignal(this, signal);
      }
      onConnect(abort, context) {
        if (this.reason) {
          abort(this.reason);
          return;
        }
        assert(this.callback);
        this.abort = abort;
        this.context = context;
      }
      onHeaders() {
        throw new SocketError("bad connect", null);
      }
      onUpgrade(statusCode, rawHeaders, socket) {
        const { callback, opaque, context } = this;
        removeSignal(this);
        this.callback = null;
        let headers = rawHeaders;
        if (headers != null) {
          headers = this.responseHeaders === "raw" ? util.parseRawHeaders(rawHeaders) : util.parseHeaders(rawHeaders);
        }
        this.runInAsyncScope(callback, null, null, {
          statusCode,
          headers,
          socket,
          opaque,
          context
        });
      }
      onError(err) {
        const { callback, opaque } = this;
        removeSignal(this);
        if (callback) {
          this.callback = null;
          queueMicrotask(() => {
            this.runInAsyncScope(callback, null, err, { opaque });
          });
        }
      }
    };
    __name(_ConnectHandler, "ConnectHandler");
    var ConnectHandler = _ConnectHandler;
    function connect(opts, callback) {
      if (callback === void 0) {
        return new Promise((resolve, reject) => {
          connect.call(this, opts, (err, data) => {
            return err ? reject(err) : resolve(data);
          });
        });
      }
      try {
        const connectHandler = new ConnectHandler(opts, callback);
        this.dispatch({ ...opts, method: "CONNECT" }, connectHandler);
      } catch (err) {
        if (typeof callback !== "function") {
          throw err;
        }
        const opaque = opts?.opaque;
        queueMicrotask(() => callback(err, { opaque }));
      }
    }
    __name(connect, "connect");
    module2.exports = connect;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/index.js
var require_api = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/api/index.js"(exports2, module2) {
    "use strict";
    init_define_process();
    module2.exports.request = require_api_request();
    module2.exports.stream = require_api_stream();
    module2.exports.pipeline = require_api_pipeline();
    module2.exports.upgrade = require_api_upgrade();
    module2.exports.connect = require_api_connect();
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-errors.js
var require_mock_errors = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-errors.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { UndiciError } = require_errors();
    var _MockNotMatchedError = class _MockNotMatchedError extends UndiciError {
      constructor(message) {
        super(message);
        Error.captureStackTrace(this, _MockNotMatchedError);
        this.name = "MockNotMatchedError";
        this.message = message || "The request does not match any registered mock dispatches";
        this.code = "UND_MOCK_ERR_MOCK_NOT_MATCHED";
      }
    };
    __name(_MockNotMatchedError, "MockNotMatchedError");
    var MockNotMatchedError = _MockNotMatchedError;
    module2.exports = {
      MockNotMatchedError
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-symbols.js
var require_mock_symbols = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-symbols.js"(exports2, module2) {
    "use strict";
    init_define_process();
    module2.exports = {
      kAgent: Symbol("agent"),
      kOptions: Symbol("options"),
      kFactory: Symbol("factory"),
      kDispatches: Symbol("dispatches"),
      kDispatchKey: Symbol("dispatch key"),
      kDefaultHeaders: Symbol("default headers"),
      kDefaultTrailers: Symbol("default trailers"),
      kContentLength: Symbol("content length"),
      kMockAgent: Symbol("mock agent"),
      kMockAgentSet: Symbol("mock agent set"),
      kMockAgentGet: Symbol("mock agent get"),
      kMockDispatch: Symbol("mock dispatch"),
      kClose: Symbol("close"),
      kOriginalClose: Symbol("original agent close"),
      kOrigin: Symbol("origin"),
      kIsMockActive: Symbol("is mock active"),
      kNetConnect: Symbol("net connect"),
      kGetNetConnect: Symbol("get net connect"),
      kConnected: Symbol("connected")
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-utils.js
var require_mock_utils = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-utils.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { MockNotMatchedError } = require_mock_errors();
    var {
      kDispatches,
      kMockAgent,
      kOriginalDispatch,
      kOrigin,
      kGetNetConnect
    } = require_mock_symbols();
    var { buildURL } = require_util();
    var { STATUS_CODES } = require("http");
    var {
      types: {
        isPromise
      }
    } = require("util");
    function matchValue(match, value) {
      if (typeof match === "string") {
        return match === value;
      }
      if (match instanceof RegExp) {
        return match.test(value);
      }
      if (typeof match === "function") {
        return match(value) === true;
      }
      return false;
    }
    __name(matchValue, "matchValue");
    function lowerCaseEntries(headers) {
      return Object.fromEntries(
        Object.entries(headers).map(([headerName, headerValue]) => {
          return [headerName.toLocaleLowerCase(), headerValue];
        })
      );
    }
    __name(lowerCaseEntries, "lowerCaseEntries");
    function getHeaderByName(headers, key) {
      if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i += 2) {
          if (headers[i].toLocaleLowerCase() === key.toLocaleLowerCase()) {
            return headers[i + 1];
          }
        }
        return void 0;
      } else if (typeof headers.get === "function") {
        return headers.get(key);
      } else {
        return lowerCaseEntries(headers)[key.toLocaleLowerCase()];
      }
    }
    __name(getHeaderByName, "getHeaderByName");
    function buildHeadersFromArray(headers) {
      const clone = headers.slice();
      const entries = [];
      for (let index = 0; index < clone.length; index += 2) {
        entries.push([clone[index], clone[index + 1]]);
      }
      return Object.fromEntries(entries);
    }
    __name(buildHeadersFromArray, "buildHeadersFromArray");
    function matchHeaders(mockDispatch2, headers) {
      if (typeof mockDispatch2.headers === "function") {
        if (Array.isArray(headers)) {
          headers = buildHeadersFromArray(headers);
        }
        return mockDispatch2.headers(headers ? lowerCaseEntries(headers) : {});
      }
      if (typeof mockDispatch2.headers === "undefined") {
        return true;
      }
      if (typeof headers !== "object" || typeof mockDispatch2.headers !== "object") {
        return false;
      }
      for (const [matchHeaderName, matchHeaderValue] of Object.entries(mockDispatch2.headers)) {
        const headerValue = getHeaderByName(headers, matchHeaderName);
        if (!matchValue(matchHeaderValue, headerValue)) {
          return false;
        }
      }
      return true;
    }
    __name(matchHeaders, "matchHeaders");
    function safeUrl(path) {
      if (typeof path !== "string") {
        return path;
      }
      const pathSegments = path.split("?");
      if (pathSegments.length !== 2) {
        return path;
      }
      const qp = new URLSearchParams(pathSegments.pop());
      qp.sort();
      return [...pathSegments, qp.toString()].join("?");
    }
    __name(safeUrl, "safeUrl");
    function matchKey(mockDispatch2, { path, method, body, headers }) {
      const pathMatch = matchValue(mockDispatch2.path, path);
      const methodMatch = matchValue(mockDispatch2.method, method);
      const bodyMatch = typeof mockDispatch2.body !== "undefined" ? matchValue(mockDispatch2.body, body) : true;
      const headersMatch = matchHeaders(mockDispatch2, headers);
      return pathMatch && methodMatch && bodyMatch && headersMatch;
    }
    __name(matchKey, "matchKey");
    function getResponseData(data) {
      if (Buffer.isBuffer(data)) {
        return data;
      } else if (data instanceof Uint8Array) {
        return data;
      } else if (data instanceof ArrayBuffer) {
        return data;
      } else if (typeof data === "object") {
        return JSON.stringify(data);
      } else {
        return data.toString();
      }
    }
    __name(getResponseData, "getResponseData");
    function getMockDispatch(mockDispatches, key) {
      const basePath = key.query ? buildURL(key.path, key.query) : key.path;
      const resolvedPath = typeof basePath === "string" ? safeUrl(basePath) : basePath;
      let matchedMockDispatches = mockDispatches.filter(({ consumed }) => !consumed).filter(({ path }) => matchValue(safeUrl(path), resolvedPath));
      if (matchedMockDispatches.length === 0) {
        throw new MockNotMatchedError(`Mock dispatch not matched for path '${resolvedPath}'`);
      }
      matchedMockDispatches = matchedMockDispatches.filter(({ method }) => matchValue(method, key.method));
      if (matchedMockDispatches.length === 0) {
        throw new MockNotMatchedError(`Mock dispatch not matched for method '${key.method}' on path '${resolvedPath}'`);
      }
      matchedMockDispatches = matchedMockDispatches.filter(({ body }) => typeof body !== "undefined" ? matchValue(body, key.body) : true);
      if (matchedMockDispatches.length === 0) {
        throw new MockNotMatchedError(`Mock dispatch not matched for body '${key.body}' on path '${resolvedPath}'`);
      }
      matchedMockDispatches = matchedMockDispatches.filter((mockDispatch2) => matchHeaders(mockDispatch2, key.headers));
      if (matchedMockDispatches.length === 0) {
        const headers = typeof key.headers === "object" ? JSON.stringify(key.headers) : key.headers;
        throw new MockNotMatchedError(`Mock dispatch not matched for headers '${headers}' on path '${resolvedPath}'`);
      }
      return matchedMockDispatches[0];
    }
    __name(getMockDispatch, "getMockDispatch");
    function addMockDispatch(mockDispatches, key, data) {
      const baseData = { timesInvoked: 0, times: 1, persist: false, consumed: false };
      const replyData = typeof data === "function" ? { callback: data } : { ...data };
      const newMockDispatch = { ...baseData, ...key, pending: true, data: { error: null, ...replyData } };
      mockDispatches.push(newMockDispatch);
      return newMockDispatch;
    }
    __name(addMockDispatch, "addMockDispatch");
    function deleteMockDispatch(mockDispatches, key) {
      const index = mockDispatches.findIndex((dispatch) => {
        if (!dispatch.consumed) {
          return false;
        }
        return matchKey(dispatch, key);
      });
      if (index !== -1) {
        mockDispatches.splice(index, 1);
      }
    }
    __name(deleteMockDispatch, "deleteMockDispatch");
    function buildKey(opts) {
      const { path, method, body, headers, query } = opts;
      return {
        path,
        method,
        body,
        headers,
        query
      };
    }
    __name(buildKey, "buildKey");
    function generateKeyValues(data) {
      const keys = Object.keys(data);
      const result = [];
      for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        const value = data[key];
        const name = Buffer.from(`${key}`);
        if (Array.isArray(value)) {
          for (let j = 0; j < value.length; ++j) {
            result.push(name, Buffer.from(`${value[j]}`));
          }
        } else {
          result.push(name, Buffer.from(`${value}`));
        }
      }
      return result;
    }
    __name(generateKeyValues, "generateKeyValues");
    function getStatusText(statusCode) {
      return STATUS_CODES[statusCode] || "unknown";
    }
    __name(getStatusText, "getStatusText");
    async function getResponse(body) {
      const buffers = [];
      for await (const data of body) {
        buffers.push(data);
      }
      return Buffer.concat(buffers).toString("utf8");
    }
    __name(getResponse, "getResponse");
    function mockDispatch(opts, handler) {
      const key = buildKey(opts);
      const mockDispatch2 = getMockDispatch(this[kDispatches], key);
      mockDispatch2.timesInvoked++;
      if (mockDispatch2.data.callback) {
        mockDispatch2.data = { ...mockDispatch2.data, ...mockDispatch2.data.callback(opts) };
      }
      const { data: { statusCode, data, headers, trailers, error }, delay, persist } = mockDispatch2;
      const { timesInvoked, times } = mockDispatch2;
      mockDispatch2.consumed = !persist && timesInvoked >= times;
      mockDispatch2.pending = timesInvoked < times;
      if (error !== null) {
        deleteMockDispatch(this[kDispatches], key);
        handler.onError(error);
        return true;
      }
      if (typeof delay === "number" && delay > 0) {
        setTimeout(() => {
          handleReply(this[kDispatches]);
        }, delay);
      } else {
        handleReply(this[kDispatches]);
      }
      function handleReply(mockDispatches, _data = data) {
        const optsHeaders = Array.isArray(opts.headers) ? buildHeadersFromArray(opts.headers) : opts.headers;
        const body = typeof _data === "function" ? _data({ ...opts, headers: optsHeaders }) : _data;
        if (isPromise(body)) {
          body.then((newData) => handleReply(mockDispatches, newData));
          return;
        }
        const responseData = getResponseData(body);
        const responseHeaders = generateKeyValues(headers);
        const responseTrailers = generateKeyValues(trailers);
        handler.onConnect?.((err) => handler.onError(err), null);
        handler.onHeaders?.(statusCode, responseHeaders, resume, getStatusText(statusCode));
        handler.onData?.(Buffer.from(responseData));
        handler.onComplete?.(responseTrailers);
        deleteMockDispatch(mockDispatches, key);
      }
      __name(handleReply, "handleReply");
      function resume() {
      }
      __name(resume, "resume");
      return true;
    }
    __name(mockDispatch, "mockDispatch");
    function buildMockDispatch() {
      const agent = this[kMockAgent];
      const origin = this[kOrigin];
      const originalDispatch = this[kOriginalDispatch];
      return /* @__PURE__ */ __name(function dispatch(opts, handler) {
        if (agent.isMockActive) {
          try {
            mockDispatch.call(this, opts, handler);
          } catch (error) {
            if (error instanceof MockNotMatchedError) {
              const netConnect = agent[kGetNetConnect]();
              if (netConnect === false) {
                throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect disabled)`);
              }
              if (checkNetConnect(netConnect, origin)) {
                originalDispatch.call(this, opts, handler);
              } else {
                throw new MockNotMatchedError(`${error.message}: subsequent request to origin ${origin} was not allowed (net.connect is not enabled for this origin)`);
              }
            } else {
              throw error;
            }
          }
        } else {
          originalDispatch.call(this, opts, handler);
        }
      }, "dispatch");
    }
    __name(buildMockDispatch, "buildMockDispatch");
    function checkNetConnect(netConnect, origin) {
      const url = new URL(origin);
      if (netConnect === true) {
        return true;
      } else if (Array.isArray(netConnect) && netConnect.some((matcher) => matchValue(matcher, url.host))) {
        return true;
      }
      return false;
    }
    __name(checkNetConnect, "checkNetConnect");
    function buildMockOptions(opts) {
      if (opts) {
        const { agent, ...mockOptions } = opts;
        return mockOptions;
      }
    }
    __name(buildMockOptions, "buildMockOptions");
    module2.exports = {
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
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-interceptor.js
var require_mock_interceptor = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-interceptor.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { getResponseData, buildKey, addMockDispatch } = require_mock_utils();
    var {
      kDispatches,
      kDispatchKey,
      kDefaultHeaders,
      kDefaultTrailers,
      kContentLength,
      kMockDispatch
    } = require_mock_symbols();
    var { InvalidArgumentError } = require_errors();
    var { buildURL } = require_util();
    var _MockScope = class _MockScope {
      constructor(mockDispatch) {
        this[kMockDispatch] = mockDispatch;
      }
      /**
       * Delay a reply by a set amount in ms.
       */
      delay(waitInMs) {
        if (typeof waitInMs !== "number" || !Number.isInteger(waitInMs) || waitInMs <= 0) {
          throw new InvalidArgumentError("waitInMs must be a valid integer > 0");
        }
        this[kMockDispatch].delay = waitInMs;
        return this;
      }
      /**
       * For a defined reply, never mark as consumed.
       */
      persist() {
        this[kMockDispatch].persist = true;
        return this;
      }
      /**
       * Allow one to define a reply for a set amount of matching requests.
       */
      times(repeatTimes) {
        if (typeof repeatTimes !== "number" || !Number.isInteger(repeatTimes) || repeatTimes <= 0) {
          throw new InvalidArgumentError("repeatTimes must be a valid integer > 0");
        }
        this[kMockDispatch].times = repeatTimes;
        return this;
      }
    };
    __name(_MockScope, "MockScope");
    var MockScope = _MockScope;
    var _MockInterceptor = class _MockInterceptor {
      constructor(opts, mockDispatches) {
        if (typeof opts !== "object") {
          throw new InvalidArgumentError("opts must be an object");
        }
        if (typeof opts.path === "undefined") {
          throw new InvalidArgumentError("opts.path must be defined");
        }
        if (typeof opts.method === "undefined") {
          opts.method = "GET";
        }
        if (typeof opts.path === "string") {
          if (opts.query) {
            opts.path = buildURL(opts.path, opts.query);
          } else {
            const parsedURL = new URL(opts.path, "data://");
            opts.path = parsedURL.pathname + parsedURL.search;
          }
        }
        if (typeof opts.method === "string") {
          opts.method = opts.method.toUpperCase();
        }
        this[kDispatchKey] = buildKey(opts);
        this[kDispatches] = mockDispatches;
        this[kDefaultHeaders] = {};
        this[kDefaultTrailers] = {};
        this[kContentLength] = false;
      }
      createMockScopeDispatchData({ statusCode, data, responseOptions }) {
        const responseData = getResponseData(data);
        const contentLength = this[kContentLength] ? { "content-length": responseData.length } : {};
        const headers = { ...this[kDefaultHeaders], ...contentLength, ...responseOptions.headers };
        const trailers = { ...this[kDefaultTrailers], ...responseOptions.trailers };
        return { statusCode, data, headers, trailers };
      }
      validateReplyParameters(replyParameters) {
        if (typeof replyParameters.statusCode === "undefined") {
          throw new InvalidArgumentError("statusCode must be defined");
        }
        if (typeof replyParameters.responseOptions !== "object" || replyParameters.responseOptions === null) {
          throw new InvalidArgumentError("responseOptions must be an object");
        }
      }
      /**
       * Mock an undici request with a defined reply.
       */
      reply(replyOptionsCallbackOrStatusCode) {
        if (typeof replyOptionsCallbackOrStatusCode === "function") {
          const wrappedDefaultsCallback = /* @__PURE__ */ __name((opts) => {
            const resolvedData = replyOptionsCallbackOrStatusCode(opts);
            if (typeof resolvedData !== "object" || resolvedData === null) {
              throw new InvalidArgumentError("reply options callback must return an object");
            }
            const replyParameters2 = { data: "", responseOptions: {}, ...resolvedData };
            this.validateReplyParameters(replyParameters2);
            return {
              ...this.createMockScopeDispatchData(replyParameters2)
            };
          }, "wrappedDefaultsCallback");
          const newMockDispatch2 = addMockDispatch(this[kDispatches], this[kDispatchKey], wrappedDefaultsCallback);
          return new MockScope(newMockDispatch2);
        }
        const replyParameters = {
          statusCode: replyOptionsCallbackOrStatusCode,
          data: arguments[1] === void 0 ? "" : arguments[1],
          responseOptions: arguments[2] === void 0 ? {} : arguments[2]
        };
        this.validateReplyParameters(replyParameters);
        const dispatchData = this.createMockScopeDispatchData(replyParameters);
        const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], dispatchData);
        return new MockScope(newMockDispatch);
      }
      /**
       * Mock an undici request with a defined error.
       */
      replyWithError(error) {
        if (typeof error === "undefined") {
          throw new InvalidArgumentError("error must be defined");
        }
        const newMockDispatch = addMockDispatch(this[kDispatches], this[kDispatchKey], { error });
        return new MockScope(newMockDispatch);
      }
      /**
       * Set default reply headers on the interceptor for subsequent replies
       */
      defaultReplyHeaders(headers) {
        if (typeof headers === "undefined") {
          throw new InvalidArgumentError("headers must be defined");
        }
        this[kDefaultHeaders] = headers;
        return this;
      }
      /**
       * Set default reply trailers on the interceptor for subsequent replies
       */
      defaultReplyTrailers(trailers) {
        if (typeof trailers === "undefined") {
          throw new InvalidArgumentError("trailers must be defined");
        }
        this[kDefaultTrailers] = trailers;
        return this;
      }
      /**
       * Set reply content length header for replies on the interceptor
       */
      replyContentLength() {
        this[kContentLength] = true;
        return this;
      }
    };
    __name(_MockInterceptor, "MockInterceptor");
    var MockInterceptor = _MockInterceptor;
    module2.exports.MockInterceptor = MockInterceptor;
    module2.exports.MockScope = MockScope;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-client.js
var require_mock_client = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-client.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { promisify } = require("util");
    var Client = require_client();
    var { buildMockDispatch } = require_mock_utils();
    var {
      kDispatches,
      kMockAgent,
      kClose,
      kOriginalClose,
      kOrigin,
      kOriginalDispatch,
      kConnected
    } = require_mock_symbols();
    var { MockInterceptor } = require_mock_interceptor();
    var Symbols = require_symbols();
    var { InvalidArgumentError } = require_errors();
    var _MockClient = class _MockClient extends Client {
      constructor(origin, opts) {
        super(origin, opts);
        if (!opts || !opts.agent || typeof opts.agent.dispatch !== "function") {
          throw new InvalidArgumentError("Argument opts.agent must implement Agent");
        }
        this[kMockAgent] = opts.agent;
        this[kOrigin] = origin;
        this[kDispatches] = [];
        this[kConnected] = 1;
        this[kOriginalDispatch] = this.dispatch;
        this[kOriginalClose] = this.close.bind(this);
        this.dispatch = buildMockDispatch.call(this);
        this.close = this[kClose];
      }
      get [Symbols.kConnected]() {
        return this[kConnected];
      }
      /**
       * Sets up the base interceptor for mocking replies from undici.
       */
      intercept(opts) {
        return new MockInterceptor(opts, this[kDispatches]);
      }
      async [kClose]() {
        await promisify(this[kOriginalClose])();
        this[kConnected] = 0;
        this[kMockAgent][Symbols.kClients].delete(this[kOrigin]);
      }
    };
    __name(_MockClient, "MockClient");
    var MockClient = _MockClient;
    module2.exports = MockClient;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-pool.js
var require_mock_pool = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-pool.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { promisify } = require("util");
    var Pool = require_pool();
    var { buildMockDispatch } = require_mock_utils();
    var {
      kDispatches,
      kMockAgent,
      kClose,
      kOriginalClose,
      kOrigin,
      kOriginalDispatch,
      kConnected
    } = require_mock_symbols();
    var { MockInterceptor } = require_mock_interceptor();
    var Symbols = require_symbols();
    var { InvalidArgumentError } = require_errors();
    var _MockPool = class _MockPool extends Pool {
      constructor(origin, opts) {
        super(origin, opts);
        if (!opts || !opts.agent || typeof opts.agent.dispatch !== "function") {
          throw new InvalidArgumentError("Argument opts.agent must implement Agent");
        }
        this[kMockAgent] = opts.agent;
        this[kOrigin] = origin;
        this[kDispatches] = [];
        this[kConnected] = 1;
        this[kOriginalDispatch] = this.dispatch;
        this[kOriginalClose] = this.close.bind(this);
        this.dispatch = buildMockDispatch.call(this);
        this.close = this[kClose];
      }
      get [Symbols.kConnected]() {
        return this[kConnected];
      }
      /**
       * Sets up the base interceptor for mocking replies from undici.
       */
      intercept(opts) {
        return new MockInterceptor(opts, this[kDispatches]);
      }
      async [kClose]() {
        await promisify(this[kOriginalClose])();
        this[kConnected] = 0;
        this[kMockAgent][Symbols.kClients].delete(this[kOrigin]);
      }
    };
    __name(_MockPool, "MockPool");
    var MockPool = _MockPool;
    module2.exports = MockPool;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/pluralizer.js
var require_pluralizer = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/pluralizer.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var singulars = {
      pronoun: "it",
      is: "is",
      was: "was",
      this: "this"
    };
    var plurals = {
      pronoun: "they",
      is: "are",
      was: "were",
      this: "these"
    };
    var _a;
    module2.exports = (_a = class {
      constructor(singular, plural) {
        this.singular = singular;
        this.plural = plural;
      }
      pluralize(count) {
        const one = count === 1;
        const keys = one ? singulars : plurals;
        const noun = one ? this.singular : this.plural;
        return { ...keys, count, noun };
      }
    }, __name(_a, "Pluralizer"), _a);
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/pending-interceptors-formatter.js
var require_pending_interceptors_formatter = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/pending-interceptors-formatter.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Transform } = require("stream");
    var { Console } = require("console");
    var PERSISTENT = define_process_default.versions.icu ? "\u2705" : "Y ";
    var NOT_PERSISTENT = define_process_default.versions.icu ? "\u274C" : "N ";
    var _a;
    module2.exports = (_a = class {
      constructor({ disableColors } = {}) {
        this.transform = new Transform({
          transform(chunk, _enc, cb) {
            cb(null, chunk);
          }
        });
        this.logger = new Console({
          stdout: this.transform,
          inspectOptions: {
            colors: !disableColors && !define_process_default.env.CI
          }
        });
      }
      format(pendingInterceptors) {
        const withPrettyHeaders = pendingInterceptors.map(
          ({ method, path, data: { statusCode }, persist, times, timesInvoked, origin }) => ({
            Method: method,
            Origin: origin,
            Path: path,
            "Status code": statusCode,
            Persistent: persist ? PERSISTENT : NOT_PERSISTENT,
            Invocations: timesInvoked,
            Remaining: persist ? Infinity : times - timesInvoked
          })
        );
        this.logger.table(withPrettyHeaders);
        return this.transform.read().toString();
      }
    }, __name(_a, "PendingInterceptorsFormatter"), _a);
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-agent.js
var require_mock_agent = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/mock/mock-agent.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kClients } = require_symbols();
    var Agent = require_agent();
    var {
      kAgent,
      kMockAgentSet,
      kMockAgentGet,
      kDispatches,
      kIsMockActive,
      kNetConnect,
      kGetNetConnect,
      kOptions,
      kFactory
    } = require_mock_symbols();
    var MockClient = require_mock_client();
    var MockPool = require_mock_pool();
    var { matchValue, buildMockOptions } = require_mock_utils();
    var { InvalidArgumentError, UndiciError } = require_errors();
    var Dispatcher = require_dispatcher();
    var Pluralizer = require_pluralizer();
    var PendingInterceptorsFormatter = require_pending_interceptors_formatter();
    var _MockAgent = class _MockAgent extends Dispatcher {
      constructor(opts) {
        super(opts);
        this[kNetConnect] = true;
        this[kIsMockActive] = true;
        if (opts?.agent && typeof opts.agent.dispatch !== "function") {
          throw new InvalidArgumentError("Argument opts.agent must implement Agent");
        }
        const agent = opts?.agent ? opts.agent : new Agent(opts);
        this[kAgent] = agent;
        this[kClients] = agent[kClients];
        this[kOptions] = buildMockOptions(opts);
      }
      get(origin) {
        let dispatcher = this[kMockAgentGet](origin);
        if (!dispatcher) {
          dispatcher = this[kFactory](origin);
          this[kMockAgentSet](origin, dispatcher);
        }
        return dispatcher;
      }
      dispatch(opts, handler) {
        this.get(opts.origin);
        return this[kAgent].dispatch(opts, handler);
      }
      async close() {
        await this[kAgent].close();
        this[kClients].clear();
      }
      deactivate() {
        this[kIsMockActive] = false;
      }
      activate() {
        this[kIsMockActive] = true;
      }
      enableNetConnect(matcher) {
        if (typeof matcher === "string" || typeof matcher === "function" || matcher instanceof RegExp) {
          if (Array.isArray(this[kNetConnect])) {
            this[kNetConnect].push(matcher);
          } else {
            this[kNetConnect] = [matcher];
          }
        } else if (typeof matcher === "undefined") {
          this[kNetConnect] = true;
        } else {
          throw new InvalidArgumentError("Unsupported matcher. Must be one of String|Function|RegExp.");
        }
      }
      disableNetConnect() {
        this[kNetConnect] = false;
      }
      // This is required to bypass issues caused by using global symbols - see:
      // https://github.com/nodejs/undici/issues/1447
      get isMockActive() {
        return this[kIsMockActive];
      }
      [kMockAgentSet](origin, dispatcher) {
        this[kClients].set(origin, dispatcher);
      }
      [kFactory](origin) {
        const mockOptions = Object.assign({ agent: this }, this[kOptions]);
        return this[kOptions] && this[kOptions].connections === 1 ? new MockClient(origin, mockOptions) : new MockPool(origin, mockOptions);
      }
      [kMockAgentGet](origin) {
        const client = this[kClients].get(origin);
        if (client) {
          return client;
        }
        if (typeof origin !== "string") {
          const dispatcher = this[kFactory]("http://localhost:9999");
          this[kMockAgentSet](origin, dispatcher);
          return dispatcher;
        }
        for (const [keyMatcher, nonExplicitDispatcher] of Array.from(this[kClients])) {
          if (nonExplicitDispatcher && typeof keyMatcher !== "string" && matchValue(keyMatcher, origin)) {
            const dispatcher = this[kFactory](origin);
            this[kMockAgentSet](origin, dispatcher);
            dispatcher[kDispatches] = nonExplicitDispatcher[kDispatches];
            return dispatcher;
          }
        }
      }
      [kGetNetConnect]() {
        return this[kNetConnect];
      }
      pendingInterceptors() {
        const mockAgentClients = this[kClients];
        return Array.from(mockAgentClients.entries()).flatMap(([origin, scope]) => scope[kDispatches].map((dispatch) => ({ ...dispatch, origin }))).filter(({ pending }) => pending);
      }
      assertNoPendingInterceptors({ pendingInterceptorsFormatter = new PendingInterceptorsFormatter() } = {}) {
        const pending = this.pendingInterceptors();
        if (pending.length === 0) {
          return;
        }
        const pluralizer = new Pluralizer("interceptor", "interceptors").pluralize(pending.length);
        throw new UndiciError(`
${pluralizer.count} ${pluralizer.noun} ${pluralizer.is} pending:

${pendingInterceptorsFormatter.format(pending)}
`.trim());
      }
    };
    __name(_MockAgent, "MockAgent");
    var MockAgent = _MockAgent;
    module2.exports = MockAgent;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/global.js
var require_global2 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/global.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var globalDispatcher = Symbol.for("undici.globalDispatcher.1");
    var { InvalidArgumentError } = require_errors();
    var Agent = require_agent();
    if (getGlobalDispatcher() === void 0) {
      setGlobalDispatcher(new Agent());
    }
    function setGlobalDispatcher(agent) {
      if (!agent || typeof agent.dispatch !== "function") {
        throw new InvalidArgumentError("Argument agent must implement Agent");
      }
      Object.defineProperty(globalThis, globalDispatcher, {
        value: agent,
        writable: true,
        enumerable: false,
        configurable: false
      });
    }
    __name(setGlobalDispatcher, "setGlobalDispatcher");
    function getGlobalDispatcher() {
      return globalThis[globalDispatcher];
    }
    __name(getGlobalDispatcher, "getGlobalDispatcher");
    module2.exports = {
      setGlobalDispatcher,
      getGlobalDispatcher
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/handler/decorator-handler.js
var require_decorator_handler = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/handler/decorator-handler.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var _handler, _a;
    module2.exports = (_a = class {
      constructor(handler) {
        __privateAdd(this, _handler, void 0);
        if (typeof handler !== "object" || handler === null) {
          throw new TypeError("handler must be an object");
        }
        __privateSet(this, _handler, handler);
      }
      onConnect(...args) {
        return __privateGet(this, _handler).onConnect?.(...args);
      }
      onError(...args) {
        return __privateGet(this, _handler).onError?.(...args);
      }
      onUpgrade(...args) {
        return __privateGet(this, _handler).onUpgrade?.(...args);
      }
      onResponseStarted(...args) {
        return __privateGet(this, _handler).onResponseStarted?.(...args);
      }
      onHeaders(...args) {
        return __privateGet(this, _handler).onHeaders?.(...args);
      }
      onData(...args) {
        return __privateGet(this, _handler).onData?.(...args);
      }
      onComplete(...args) {
        return __privateGet(this, _handler).onComplete?.(...args);
      }
      onBodySent(...args) {
        return __privateGet(this, _handler).onBodySent?.(...args);
      }
    }, _handler = new WeakMap(), __name(_a, "DecoratorHandler"), _a);
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/redirect.js
var require_redirect = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/redirect.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var RedirectHandler = require_redirect_handler();
    module2.exports = (opts) => {
      const globalMaxRedirections = opts?.maxRedirections;
      return (dispatch) => {
        return /* @__PURE__ */ __name(function redirectInterceptor(opts2, handler) {
          const { maxRedirections = globalMaxRedirections, ...baseOpts } = opts2;
          if (!maxRedirections) {
            return dispatch(opts2, handler);
          }
          const redirectHandler = new RedirectHandler(
            dispatch,
            maxRedirections,
            opts2,
            handler
          );
          return dispatch(baseOpts, redirectHandler);
        }, "redirectInterceptor");
      };
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/retry.js
var require_retry = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/retry.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var RetryHandler = require_retry_handler();
    module2.exports = (globalOpts) => {
      return (dispatch) => {
        return /* @__PURE__ */ __name(function retryInterceptor(opts, handler) {
          return dispatch(
            opts,
            new RetryHandler(
              { ...opts, retryOptions: { ...globalOpts, ...opts.retryOptions } },
              {
                handler,
                dispatch
              }
            )
          );
        }, "retryInterceptor");
      };
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/dump.js
var require_dump = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/interceptor/dump.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var util = require_util();
    var { InvalidArgumentError, RequestAbortedError } = require_errors();
    var DecoratorHandler = require_decorator_handler();
    var _maxSize, _abort, _dumped, _aborted, _size, _reason, _handler, _customAbort, customAbort_fn;
    var _DumpHandler = class _DumpHandler extends DecoratorHandler {
      constructor({ maxSize }, handler) {
        super(handler);
        __privateAdd(this, _customAbort);
        __privateAdd(this, _maxSize, 1024 * 1024);
        __privateAdd(this, _abort, null);
        __privateAdd(this, _dumped, false);
        __privateAdd(this, _aborted, false);
        __privateAdd(this, _size, 0);
        __privateAdd(this, _reason, null);
        __privateAdd(this, _handler, null);
        if (maxSize != null && (!Number.isFinite(maxSize) || maxSize < 1)) {
          throw new InvalidArgumentError("maxSize must be a number greater than 0");
        }
        __privateSet(this, _maxSize, maxSize ?? __privateGet(this, _maxSize));
        __privateSet(this, _handler, handler);
      }
      onConnect(abort) {
        __privateSet(this, _abort, abort);
        __privateGet(this, _handler).onConnect(__privateMethod(this, _customAbort, customAbort_fn).bind(this));
      }
      // TODO: will require adjustment after new hooks are out
      onHeaders(statusCode, rawHeaders, resume, statusMessage) {
        const headers = util.parseHeaders(rawHeaders);
        const contentLength = headers["content-length"];
        if (contentLength != null && contentLength > __privateGet(this, _maxSize)) {
          throw new RequestAbortedError(
            `Response size (${contentLength}) larger than maxSize (${__privateGet(this, _maxSize)})`
          );
        }
        if (__privateGet(this, _aborted)) {
          return true;
        }
        return __privateGet(this, _handler).onHeaders(
          statusCode,
          rawHeaders,
          resume,
          statusMessage
        );
      }
      onError(err) {
        if (__privateGet(this, _dumped)) {
          return;
        }
        err = __privateGet(this, _reason) ?? err;
        __privateGet(this, _handler).onError(err);
      }
      onData(chunk) {
        __privateSet(this, _size, __privateGet(this, _size) + chunk.length);
        if (__privateGet(this, _size) >= __privateGet(this, _maxSize)) {
          __privateSet(this, _dumped, true);
          if (__privateGet(this, _aborted)) {
            __privateGet(this, _handler).onError(__privateGet(this, _reason));
          } else {
            __privateGet(this, _handler).onComplete([]);
          }
        }
        return true;
      }
      onComplete(trailers) {
        if (__privateGet(this, _dumped)) {
          return;
        }
        if (__privateGet(this, _aborted)) {
          __privateGet(this, _handler).onError(this.reason);
          return;
        }
        __privateGet(this, _handler).onComplete(trailers);
      }
    };
    _maxSize = new WeakMap();
    _abort = new WeakMap();
    _dumped = new WeakMap();
    _aborted = new WeakMap();
    _size = new WeakMap();
    _reason = new WeakMap();
    _handler = new WeakMap();
    _customAbort = new WeakSet();
    customAbort_fn = /* @__PURE__ */ __name(function(reason) {
      __privateSet(this, _aborted, true);
      __privateSet(this, _reason, reason);
    }, "#customAbort");
    __name(_DumpHandler, "DumpHandler");
    var DumpHandler = _DumpHandler;
    function createDumpInterceptor({ maxSize: defaultMaxSize } = {
      maxSize: 1024 * 1024
    }) {
      return (dispatch) => {
        return /* @__PURE__ */ __name(function Intercept(opts, handler) {
          const { dumpMaxSize = defaultMaxSize } = opts;
          const dumpHandler = new DumpHandler(
            { maxSize: dumpMaxSize },
            handler
          );
          return dispatch(opts, dumpHandler);
        }, "Intercept");
      };
    }
    __name(createDumpInterceptor, "createDumpInterceptor");
    module2.exports = createDumpInterceptor;
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/headers.js
var require_headers = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/headers.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kConstruct } = require_symbols();
    var { kEnumerableProperty } = require_util();
    var {
      iteratorMixin,
      isValidHeaderName,
      isValidHeaderValue
    } = require_util2();
    var { webidl } = require_webidl();
    var assert = require("assert");
    var util = require("util");
    var kHeadersMap = Symbol("headers map");
    var kHeadersSortedMap = Symbol("headers map sorted");
    function isHTTPWhiteSpaceCharCode(code) {
      return code === 10 || code === 13 || code === 9 || code === 32;
    }
    __name(isHTTPWhiteSpaceCharCode, "isHTTPWhiteSpaceCharCode");
    function headerValueNormalize(potentialValue) {
      let i = 0;
      let j = potentialValue.length;
      while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(j - 1)))
        --j;
      while (j > i && isHTTPWhiteSpaceCharCode(potentialValue.charCodeAt(i)))
        ++i;
      return i === 0 && j === potentialValue.length ? potentialValue : potentialValue.substring(i, j);
    }
    __name(headerValueNormalize, "headerValueNormalize");
    function fill(headers, object) {
      if (Array.isArray(object)) {
        for (let i = 0; i < object.length; ++i) {
          const header = object[i];
          if (header.length !== 2) {
            throw webidl.errors.exception({
              header: "Headers constructor",
              message: `expected name/value pair to be length 2, found ${header.length}.`
            });
          }
          appendHeader(headers, header[0], header[1]);
        }
      } else if (typeof object === "object" && object !== null) {
        const keys = Object.keys(object);
        for (let i = 0; i < keys.length; ++i) {
          appendHeader(headers, keys[i], object[keys[i]]);
        }
      } else {
        throw webidl.errors.conversionFailed({
          prefix: "Headers constructor",
          argument: "Argument 1",
          types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
        });
      }
    }
    __name(fill, "fill");
    function appendHeader(headers, name, value) {
      value = headerValueNormalize(value);
      if (!isValidHeaderName(name)) {
        throw webidl.errors.invalidArgument({
          prefix: "Headers.append",
          value: name,
          type: "header name"
        });
      } else if (!isValidHeaderValue(value)) {
        throw webidl.errors.invalidArgument({
          prefix: "Headers.append",
          value,
          type: "header value"
        });
      }
      if (getHeadersGuard(headers) === "immutable") {
        throw new TypeError("immutable");
      }
      return getHeadersList(headers).append(name, value, false);
    }
    __name(appendHeader, "appendHeader");
    function compareHeaderName(a, b) {
      return a[0] < b[0] ? -1 : 1;
    }
    __name(compareHeaderName, "compareHeaderName");
    var _HeadersList = class _HeadersList {
      /** @type {[string, string][]|null} */
      cookies = null;
      constructor(init) {
        if (init instanceof _HeadersList) {
          this[kHeadersMap] = new Map(init[kHeadersMap]);
          this[kHeadersSortedMap] = init[kHeadersSortedMap];
          this.cookies = init.cookies === null ? null : [...init.cookies];
        } else {
          this[kHeadersMap] = new Map(init);
          this[kHeadersSortedMap] = null;
        }
      }
      /**
       * @see https://fetch.spec.whatwg.org/#header-list-contains
       * @param {string} name
       * @param {boolean} isLowerCase
       */
      contains(name, isLowerCase) {
        return this[kHeadersMap].has(isLowerCase ? name : name.toLowerCase());
      }
      clear() {
        this[kHeadersMap].clear();
        this[kHeadersSortedMap] = null;
        this.cookies = null;
      }
      /**
       * @see https://fetch.spec.whatwg.org/#concept-header-list-append
       * @param {string} name
       * @param {string} value
       * @param {boolean} isLowerCase
       */
      append(name, value, isLowerCase) {
        this[kHeadersSortedMap] = null;
        const lowercaseName = isLowerCase ? name : name.toLowerCase();
        const exists = this[kHeadersMap].get(lowercaseName);
        if (exists) {
          const delimiter = lowercaseName === "cookie" ? "; " : ", ";
          this[kHeadersMap].set(lowercaseName, {
            name: exists.name,
            value: `${exists.value}${delimiter}${value}`
          });
        } else {
          this[kHeadersMap].set(lowercaseName, { name, value });
        }
        if (lowercaseName === "set-cookie") {
          (this.cookies ??= []).push(value);
        }
      }
      /**
       * @see https://fetch.spec.whatwg.org/#concept-header-list-set
       * @param {string} name
       * @param {string} value
       * @param {boolean} isLowerCase
       */
      set(name, value, isLowerCase) {
        this[kHeadersSortedMap] = null;
        const lowercaseName = isLowerCase ? name : name.toLowerCase();
        if (lowercaseName === "set-cookie") {
          this.cookies = [value];
        }
        this[kHeadersMap].set(lowercaseName, { name, value });
      }
      /**
       * @see https://fetch.spec.whatwg.org/#concept-header-list-delete
       * @param {string} name
       * @param {boolean} isLowerCase
       */
      delete(name, isLowerCase) {
        this[kHeadersSortedMap] = null;
        if (!isLowerCase)
          name = name.toLowerCase();
        if (name === "set-cookie") {
          this.cookies = null;
        }
        this[kHeadersMap].delete(name);
      }
      /**
       * @see https://fetch.spec.whatwg.org/#concept-header-list-get
       * @param {string} name
       * @param {boolean} isLowerCase
       * @returns {string | null}
       */
      get(name, isLowerCase) {
        return this[kHeadersMap].get(isLowerCase ? name : name.toLowerCase())?.value ?? null;
      }
      *[Symbol.iterator]() {
        for (const { 0: name, 1: { value } } of this[kHeadersMap]) {
          yield [name, value];
        }
      }
      get entries() {
        const headers = {};
        if (this[kHeadersMap].size !== 0) {
          for (const { name, value } of this[kHeadersMap].values()) {
            headers[name] = value;
          }
        }
        return headers;
      }
      rawValues() {
        return this[kHeadersMap].values();
      }
      get entriesList() {
        const headers = [];
        if (this[kHeadersMap].size !== 0) {
          for (const { 0: lowerName, 1: { name, value } } of this[kHeadersMap]) {
            if (lowerName === "set-cookie") {
              for (const cookie of this.cookies) {
                headers.push([name, cookie]);
              }
            } else {
              headers.push([name, value]);
            }
          }
        }
        return headers;
      }
      // https://fetch.spec.whatwg.org/#convert-header-names-to-a-sorted-lowercase-set
      toSortedArray() {
        const size = this[kHeadersMap].size;
        const array = new Array(size);
        if (size <= 32) {
          if (size === 0) {
            return array;
          }
          const iterator = this[kHeadersMap][Symbol.iterator]();
          const firstValue = iterator.next().value;
          array[0] = [firstValue[0], firstValue[1].value];
          assert(firstValue[1].value !== null);
          for (let i = 1, j = 0, right = 0, left = 0, pivot = 0, x, value; i < size; ++i) {
            value = iterator.next().value;
            x = array[i] = [value[0], value[1].value];
            assert(x[1] !== null);
            left = 0;
            right = i;
            while (left < right) {
              pivot = left + (right - left >> 1);
              if (array[pivot][0] <= x[0]) {
                left = pivot + 1;
              } else {
                right = pivot;
              }
            }
            if (i !== pivot) {
              j = i;
              while (j > left) {
                array[j] = array[--j];
              }
              array[left] = x;
            }
          }
          if (!iterator.next().done) {
            throw new TypeError("Unreachable");
          }
          return array;
        } else {
          let i = 0;
          for (const { 0: name, 1: { value } } of this[kHeadersMap]) {
            array[i++] = [name, value];
            assert(value !== null);
          }
          return array.sort(compareHeaderName);
        }
      }
    };
    __name(_HeadersList, "HeadersList");
    var HeadersList = _HeadersList;
    var _guard, _headersList;
    var _Headers = class _Headers {
      constructor(init = void 0) {
        __privateAdd(this, _guard, void 0);
        __privateAdd(this, _headersList, void 0);
        webidl.util.markAsUncloneable(this);
        if (init === kConstruct) {
          return;
        }
        __privateSet(this, _headersList, new HeadersList());
        __privateSet(this, _guard, "none");
        if (init !== void 0) {
          init = webidl.converters.HeadersInit(init, "Headers contructor", "init");
          fill(this, init);
        }
      }
      // https://fetch.spec.whatwg.org/#dom-headers-append
      append(name, value) {
        webidl.brandCheck(this, _Headers);
        webidl.argumentLengthCheck(arguments, 2, "Headers.append");
        const prefix = "Headers.append";
        name = webidl.converters.ByteString(name, prefix, "name");
        value = webidl.converters.ByteString(value, prefix, "value");
        return appendHeader(this, name, value);
      }
      // https://fetch.spec.whatwg.org/#dom-headers-delete
      delete(name) {
        webidl.brandCheck(this, _Headers);
        webidl.argumentLengthCheck(arguments, 1, "Headers.delete");
        const prefix = "Headers.delete";
        name = webidl.converters.ByteString(name, prefix, "name");
        if (!isValidHeaderName(name)) {
          throw webidl.errors.invalidArgument({
            prefix: "Headers.delete",
            value: name,
            type: "header name"
          });
        }
        if (__privateGet(this, _guard) === "immutable") {
          throw new TypeError("immutable");
        }
        if (!__privateGet(this, _headersList).contains(name, false)) {
          return;
        }
        __privateGet(this, _headersList).delete(name, false);
      }
      // https://fetch.spec.whatwg.org/#dom-headers-get
      get(name) {
        webidl.brandCheck(this, _Headers);
        webidl.argumentLengthCheck(arguments, 1, "Headers.get");
        const prefix = "Headers.get";
        name = webidl.converters.ByteString(name, prefix, "name");
        if (!isValidHeaderName(name)) {
          throw webidl.errors.invalidArgument({
            prefix,
            value: name,
            type: "header name"
          });
        }
        return __privateGet(this, _headersList).get(name, false);
      }
      // https://fetch.spec.whatwg.org/#dom-headers-has
      has(name) {
        webidl.brandCheck(this, _Headers);
        webidl.argumentLengthCheck(arguments, 1, "Headers.has");
        const prefix = "Headers.has";
        name = webidl.converters.ByteString(name, prefix, "name");
        if (!isValidHeaderName(name)) {
          throw webidl.errors.invalidArgument({
            prefix,
            value: name,
            type: "header name"
          });
        }
        return __privateGet(this, _headersList).contains(name, false);
      }
      // https://fetch.spec.whatwg.org/#dom-headers-set
      set(name, value) {
        webidl.brandCheck(this, _Headers);
        webidl.argumentLengthCheck(arguments, 2, "Headers.set");
        const prefix = "Headers.set";
        name = webidl.converters.ByteString(name, prefix, "name");
        value = webidl.converters.ByteString(value, prefix, "value");
        value = headerValueNormalize(value);
        if (!isValidHeaderName(name)) {
          throw webidl.errors.invalidArgument({
            prefix,
            value: name,
            type: "header name"
          });
        } else if (!isValidHeaderValue(value)) {
          throw webidl.errors.invalidArgument({
            prefix,
            value,
            type: "header value"
          });
        }
        if (__privateGet(this, _guard) === "immutable") {
          throw new TypeError("immutable");
        }
        __privateGet(this, _headersList).set(name, value, false);
      }
      // https://fetch.spec.whatwg.org/#dom-headers-getsetcookie
      getSetCookie() {
        webidl.brandCheck(this, _Headers);
        const list = __privateGet(this, _headersList).cookies;
        if (list) {
          return [...list];
        }
        return [];
      }
      // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
      get [kHeadersSortedMap]() {
        if (__privateGet(this, _headersList)[kHeadersSortedMap]) {
          return __privateGet(this, _headersList)[kHeadersSortedMap];
        }
        const headers = [];
        const names = __privateGet(this, _headersList).toSortedArray();
        const cookies = __privateGet(this, _headersList).cookies;
        if (cookies === null || cookies.length === 1) {
          return __privateGet(this, _headersList)[kHeadersSortedMap] = names;
        }
        for (let i = 0; i < names.length; ++i) {
          const { 0: name, 1: value } = names[i];
          if (name === "set-cookie") {
            for (let j = 0; j < cookies.length; ++j) {
              headers.push([name, cookies[j]]);
            }
          } else {
            headers.push([name, value]);
          }
        }
        return __privateGet(this, _headersList)[kHeadersSortedMap] = headers;
      }
      [util.inspect.custom](depth, options) {
        options.depth ??= depth;
        return `Headers ${util.formatWithOptions(options, __privateGet(this, _headersList).entries)}`;
      }
      static getHeadersGuard(o) {
        return __privateGet(o, _guard);
      }
      static setHeadersGuard(o, guard) {
        __privateSet(o, _guard, guard);
      }
      static getHeadersList(o) {
        return __privateGet(o, _headersList);
      }
      static setHeadersList(o, list) {
        __privateSet(o, _headersList, list);
      }
    };
    _guard = new WeakMap();
    _headersList = new WeakMap();
    __name(_Headers, "Headers");
    var Headers2 = _Headers;
    var { getHeadersGuard, setHeadersGuard, getHeadersList, setHeadersList } = Headers2;
    Reflect.deleteProperty(Headers2, "getHeadersGuard");
    Reflect.deleteProperty(Headers2, "setHeadersGuard");
    Reflect.deleteProperty(Headers2, "getHeadersList");
    Reflect.deleteProperty(Headers2, "setHeadersList");
    iteratorMixin("Headers", Headers2, kHeadersSortedMap, 0, 1);
    Object.defineProperties(Headers2.prototype, {
      append: kEnumerableProperty,
      delete: kEnumerableProperty,
      get: kEnumerableProperty,
      has: kEnumerableProperty,
      set: kEnumerableProperty,
      getSetCookie: kEnumerableProperty,
      [Symbol.toStringTag]: {
        value: "Headers",
        configurable: true
      },
      [util.inspect.custom]: {
        enumerable: false
      }
    });
    webidl.converters.HeadersInit = function(V, prefix, argument) {
      if (webidl.util.Type(V) === "Object") {
        const iterator = Reflect.get(V, Symbol.iterator);
        if (!util.types.isProxy(V) && iterator === Headers2.prototype.entries) {
          try {
            return getHeadersList(V).entriesList;
          } catch {
          }
        }
        if (typeof iterator === "function") {
          return webidl.converters["sequence<sequence<ByteString>>"](V, prefix, argument, iterator.bind(V));
        }
        return webidl.converters["record<ByteString, ByteString>"](V, prefix, argument);
      }
      throw webidl.errors.conversionFailed({
        prefix: "Headers constructor",
        argument: "Argument 1",
        types: ["sequence<sequence<ByteString>>", "record<ByteString, ByteString>"]
      });
    };
    module2.exports = {
      fill,
      // for test.
      compareHeaderName,
      Headers: Headers2,
      HeadersList,
      getHeadersGuard,
      setHeadersGuard,
      setHeadersList,
      getHeadersList
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/response.js
var require_response = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/response.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Headers: Headers2, HeadersList, fill, getHeadersGuard, setHeadersGuard, setHeadersList } = require_headers();
    var { extractBody, cloneBody, mixinBody, hasFinalizationRegistry, streamRegistry, bodyUnusable } = require_body();
    var util = require_util();
    var nodeUtil = require("util");
    var { kEnumerableProperty } = util;
    var {
      isValidReasonPhrase,
      isCancelled,
      isAborted,
      isBlobLike,
      serializeJavascriptValueToJSONString,
      isErrorLike,
      isomorphicEncode,
      environmentSettingsObject: relevantRealm
    } = require_util2();
    var {
      redirectStatusSet,
      nullBodyStatus
    } = require_constants3();
    var { kState, kHeaders } = require_symbols2();
    var { webidl } = require_webidl();
    var { FormData: FormData2 } = require_formdata();
    var { URLSerializer } = require_data_url();
    var { kConstruct } = require_symbols();
    var assert = require("assert");
    var { types } = require("util");
    var textEncoder = new TextEncoder("utf-8");
    var _Response = class _Response {
      // Creates network error Response.
      static error() {
        const responseObject = fromInnerResponse2(makeNetworkError2(), "immutable");
        return responseObject;
      }
      // https://fetch.spec.whatwg.org/#dom-response-json
      static json(data, init = {}) {
        webidl.argumentLengthCheck(arguments, 1, "Response.json");
        if (init !== null) {
          init = webidl.converters.ResponseInit(init);
        }
        const bytes = textEncoder.encode(
          serializeJavascriptValueToJSONString(data)
        );
        const body = extractBody(bytes);
        const responseObject = fromInnerResponse2(makeResponse({}), "response");
        initializeResponse(responseObject, init, { body: body[0], type: "application/json" });
        return responseObject;
      }
      // Creates a redirect Response that redirects to url with status status.
      static redirect(url, status = 302) {
        webidl.argumentLengthCheck(arguments, 1, "Response.redirect");
        url = webidl.converters.USVString(url);
        status = webidl.converters["unsigned short"](status);
        let parsedURL;
        try {
          parsedURL = new URL(url, relevantRealm.settingsObject.baseUrl);
        } catch (err) {
          throw new TypeError(`Failed to parse URL from ${url}`, { cause: err });
        }
        if (!redirectStatusSet.has(status)) {
          throw new RangeError(`Invalid status code ${status}`);
        }
        const responseObject = fromInnerResponse2(makeResponse({}), "immutable");
        responseObject[kState].status = status;
        const value = isomorphicEncode(URLSerializer(parsedURL));
        responseObject[kState].headersList.append("location", value, true);
        return responseObject;
      }
      // https://fetch.spec.whatwg.org/#dom-response
      constructor(body = null, init = {}) {
        webidl.util.markAsUncloneable(this);
        if (body === kConstruct) {
          return;
        }
        if (body !== null) {
          body = webidl.converters.BodyInit(body);
        }
        init = webidl.converters.ResponseInit(init);
        this[kState] = makeResponse({});
        this[kHeaders] = new Headers2(kConstruct);
        setHeadersGuard(this[kHeaders], "response");
        setHeadersList(this[kHeaders], this[kState].headersList);
        let bodyWithType = null;
        if (body != null) {
          const [extractedBody, type] = extractBody(body);
          bodyWithType = { body: extractedBody, type };
        }
        initializeResponse(this, init, bodyWithType);
      }
      // Returns response’s type, e.g., "cors".
      get type() {
        webidl.brandCheck(this, _Response);
        return this[kState].type;
      }
      // Returns response’s URL, if it has one; otherwise the empty string.
      get url() {
        webidl.brandCheck(this, _Response);
        const urlList = this[kState].urlList;
        const url = urlList[urlList.length - 1] ?? null;
        if (url === null) {
          return "";
        }
        return URLSerializer(url, true);
      }
      // Returns whether response was obtained through a redirect.
      get redirected() {
        webidl.brandCheck(this, _Response);
        return this[kState].urlList.length > 1;
      }
      // Returns response’s status.
      get status() {
        webidl.brandCheck(this, _Response);
        return this[kState].status;
      }
      // Returns whether response’s status is an ok status.
      get ok() {
        webidl.brandCheck(this, _Response);
        return this[kState].status >= 200 && this[kState].status <= 299;
      }
      // Returns response’s status message.
      get statusText() {
        webidl.brandCheck(this, _Response);
        return this[kState].statusText;
      }
      // Returns response’s headers as Headers.
      get headers() {
        webidl.brandCheck(this, _Response);
        return this[kHeaders];
      }
      get body() {
        webidl.brandCheck(this, _Response);
        return this[kState].body ? this[kState].body.stream : null;
      }
      get bodyUsed() {
        webidl.brandCheck(this, _Response);
        return !!this[kState].body && util.isDisturbed(this[kState].body.stream);
      }
      // Returns a clone of response.
      clone() {
        webidl.brandCheck(this, _Response);
        if (bodyUnusable(this)) {
          throw webidl.errors.exception({
            header: "Response.clone",
            message: "Body has already been consumed."
          });
        }
        const clonedResponse = cloneResponse(this[kState]);
        return fromInnerResponse2(clonedResponse, getHeadersGuard(this[kHeaders]));
      }
      [nodeUtil.inspect.custom](depth, options) {
        if (options.depth === null) {
          options.depth = 2;
        }
        options.colors ??= true;
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
        };
        return `Response ${nodeUtil.formatWithOptions(options, properties)}`;
      }
    };
    __name(_Response, "Response");
    var Response2 = _Response;
    mixinBody(Response2);
    Object.defineProperties(Response2.prototype, {
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
        value: "Response",
        configurable: true
      }
    });
    Object.defineProperties(Response2, {
      json: kEnumerableProperty,
      redirect: kEnumerableProperty,
      error: kEnumerableProperty
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
        newResponse.body = cloneBody(newResponse, response.body);
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
        headersList: init?.headersList ? new HeadersList(init?.headersList) : new HeadersList(),
        urlList: init?.urlList ? [...init.urlList] : []
      };
    }
    __name(makeResponse, "makeResponse");
    function makeNetworkError2(reason) {
      const isError = isErrorLike(reason);
      return makeResponse({
        type: "error",
        status: 0,
        error: isError ? reason : new Error(reason ? String(reason) : reason),
        aborted: reason && reason.name === "AbortError"
      });
    }
    __name(makeNetworkError2, "makeNetworkError");
    function isNetworkError(response) {
      return (
        // A network error is a response whose type is "error",
        response.type === "error" && // status is 0
        response.status === 0
      );
    }
    __name(isNetworkError, "isNetworkError");
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
    function makeAppropriateNetworkError(fetchParams, err = null) {
      assert(isCancelled(fetchParams));
      return isAborted(fetchParams) ? makeNetworkError2(Object.assign(new DOMException("The operation was aborted.", "AbortError"), { cause: err })) : makeNetworkError2(Object.assign(new DOMException("Request was cancelled."), { cause: err }));
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
        fill(response[kHeaders], init.headers);
      }
      if (body) {
        if (nullBodyStatus.includes(response.status)) {
          throw webidl.errors.exception({
            header: "Response constructor",
            message: `Invalid response status code ${response.status}`
          });
        }
        response[kState].body = body.body;
        if (body.type != null && !response[kState].headersList.contains("content-type", true)) {
          response[kState].headersList.append("content-type", body.type, true);
        }
      }
    }
    __name(initializeResponse, "initializeResponse");
    function fromInnerResponse2(innerResponse, guard) {
      const response = new Response2(kConstruct);
      response[kState] = innerResponse;
      response[kHeaders] = new Headers2(kConstruct);
      setHeadersList(response[kHeaders], innerResponse.headersList);
      setHeadersGuard(response[kHeaders], guard);
      if (hasFinalizationRegistry && innerResponse.body?.stream) {
        streamRegistry.register(response, new WeakRef(innerResponse.body.stream));
      }
      return response;
    }
    __name(fromInnerResponse2, "fromInnerResponse");
    webidl.converters.ReadableStream = webidl.interfaceConverter(
      ReadableStream
    );
    webidl.converters.FormData = webidl.interfaceConverter(
      FormData2
    );
    webidl.converters.URLSearchParams = webidl.interfaceConverter(
      URLSearchParams
    );
    webidl.converters.XMLHttpRequestBodyInit = function(V, prefix, name) {
      if (typeof V === "string") {
        return webidl.converters.USVString(V, prefix, name);
      }
      if (isBlobLike(V)) {
        return webidl.converters.Blob(V, prefix, name, { strict: false });
      }
      if (ArrayBuffer.isView(V) || types.isArrayBuffer(V)) {
        return webidl.converters.BufferSource(V, prefix, name);
      }
      if (util.isFormDataLike(V)) {
        return webidl.converters.FormData(V, prefix, name, { strict: false });
      }
      if (V instanceof URLSearchParams) {
        return webidl.converters.URLSearchParams(V, prefix, name);
      }
      return webidl.converters.DOMString(V, prefix, name);
    };
    webidl.converters.BodyInit = function(V, prefix, argument) {
      if (V instanceof ReadableStream) {
        return webidl.converters.ReadableStream(V, prefix, argument);
      }
      if (V?.[Symbol.asyncIterator]) {
        return V;
      }
      return webidl.converters.XMLHttpRequestBodyInit(V, prefix, argument);
    };
    webidl.converters.ResponseInit = webidl.dictionaryConverter([
      {
        key: "status",
        converter: webidl.converters["unsigned short"],
        defaultValue: () => 200
      },
      {
        key: "statusText",
        converter: webidl.converters.ByteString,
        defaultValue: () => ""
      },
      {
        key: "headers",
        converter: webidl.converters.HeadersInit
      }
    ]);
    module2.exports = {
      isNetworkError,
      makeNetworkError: makeNetworkError2,
      makeResponse,
      makeAppropriateNetworkError,
      filterResponse,
      Response: Response2,
      cloneResponse,
      fromInnerResponse: fromInnerResponse2
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/dispatcher-weakref.js
var require_dispatcher_weakref = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/dispatcher-weakref.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kConnected, kSize } = require_symbols();
    var _CompatWeakRef = class _CompatWeakRef {
      constructor(value) {
        this.value = value;
      }
      deref() {
        return this.value[kConnected] === 0 && this.value[kSize] === 0 ? void 0 : this.value;
      }
    };
    __name(_CompatWeakRef, "CompatWeakRef");
    var CompatWeakRef = _CompatWeakRef;
    var _CompatFinalizer = class _CompatFinalizer {
      constructor(finalizer) {
        this.finalizer = finalizer;
      }
      register(dispatcher, key) {
        if (dispatcher.on) {
          dispatcher.on("disconnect", () => {
            if (dispatcher[kConnected] === 0 && dispatcher[kSize] === 0) {
              this.finalizer(key);
            }
          });
        }
      }
      unregister(key) {
      }
    };
    __name(_CompatFinalizer, "CompatFinalizer");
    var CompatFinalizer = _CompatFinalizer;
    module2.exports = function() {
      if (define_process_default.env.NODE_V8_COVERAGE && define_process_default.version.startsWith("v18")) {
        define_process_default._rawDebug("Using compatibility WeakRef and FinalizationRegistry");
        return {
          WeakRef: CompatWeakRef,
          FinalizationRegistry: CompatFinalizer
        };
      }
      return { WeakRef, FinalizationRegistry };
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/request.js
var require_request = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/request.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { extractBody, mixinBody, cloneBody, bodyUnusable } = require_body();
    var { Headers: Headers2, fill: fillHeaders, HeadersList, setHeadersGuard, getHeadersGuard, setHeadersList, getHeadersList } = require_headers();
    var { FinalizationRegistry: FinalizationRegistry2 } = require_dispatcher_weakref()();
    var util = require_util();
    var nodeUtil = require("util");
    var {
      isValidHTTPToken,
      sameOrigin,
      environmentSettingsObject
    } = require_util2();
    var {
      forbiddenMethodsSet,
      corsSafeListedMethodsSet,
      referrerPolicy,
      requestRedirect,
      requestMode,
      requestCredentials,
      requestCache,
      requestDuplex
    } = require_constants3();
    var { kEnumerableProperty, normalizedMethodRecordsBase, normalizedMethodRecords } = util;
    var { kHeaders, kSignal, kState, kDispatcher } = require_symbols2();
    var { webidl } = require_webidl();
    var { URLSerializer } = require_data_url();
    var { kConstruct } = require_symbols();
    var assert = require("assert");
    var { getMaxListeners, setMaxListeners, getEventListeners, defaultMaxListeners } = require("events");
    var kAbortController = Symbol("abortController");
    var requestFinalizer = new FinalizationRegistry2(({ signal, abort }) => {
      signal.removeEventListener("abort", abort);
    });
    var dependentControllerMap = /* @__PURE__ */ new WeakMap();
    function buildAbort(acRef) {
      return abort;
      function abort() {
        const ac = acRef.deref();
        if (ac !== void 0) {
          requestFinalizer.unregister(abort);
          this.removeEventListener("abort", abort);
          ac.abort(this.reason);
          const controllerList = dependentControllerMap.get(ac.signal);
          if (controllerList !== void 0) {
            if (controllerList.size !== 0) {
              for (const ref of controllerList) {
                const ctrl = ref.deref();
                if (ctrl !== void 0) {
                  ctrl.abort(this.reason);
                }
              }
              controllerList.clear();
            }
            dependentControllerMap.delete(ac.signal);
          }
        }
      }
      __name(abort, "abort");
    }
    __name(buildAbort, "buildAbort");
    var patchMethodWarning = false;
    var _Request2 = class _Request2 {
      // https://fetch.spec.whatwg.org/#dom-request
      constructor(input, init = {}) {
        webidl.util.markAsUncloneable(this);
        if (input === kConstruct) {
          return;
        }
        const prefix = "Request constructor";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        input = webidl.converters.RequestInfo(input, prefix, "input");
        init = webidl.converters.RequestInit(init, prefix, "init");
        let request = null;
        let fallbackMode = null;
        const baseUrl = environmentSettingsObject.settingsObject.baseUrl;
        let signal = null;
        if (typeof input === "string") {
          this[kDispatcher] = init.dispatcher;
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
          this[kDispatcher] = init.dispatcher || input[kDispatcher];
          assert(input instanceof _Request2);
          request = input[kState];
          signal = input[kSignal];
        }
        const origin = environmentSettingsObject.settingsObject.origin;
        let window = "client";
        if (request.window?.constructor?.name === "EnvironmentSettingsObject" && sameOrigin(request.window, origin)) {
          window = request.window;
        }
        if (init.window != null) {
          throw new TypeError(`'window' option '${window}' must be null`);
        }
        if ("window" in init) {
          window = "no-window";
        }
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
        });
        const initHasKey = Object.keys(init).length !== 0;
        if (initHasKey) {
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
            if (parsedReferrer.protocol === "about:" && parsedReferrer.hostname === "client" || origin && !sameOrigin(parsedReferrer, environmentSettingsObject.settingsObject.baseUrl)) {
              request.referrer = "client";
            } else {
              request.referrer = parsedReferrer;
            }
          }
        }
        if (init.referrerPolicy !== void 0) {
          request.referrerPolicy = init.referrerPolicy;
        }
        let mode;
        if (init.mode !== void 0) {
          mode = init.mode;
        } else {
          mode = fallbackMode;
        }
        if (mode === "navigate") {
          throw webidl.errors.exception({
            header: "Request constructor",
            message: "invalid request mode navigate."
          });
        }
        if (mode != null) {
          request.mode = mode;
        }
        if (init.credentials !== void 0) {
          request.credentials = init.credentials;
        }
        if (init.cache !== void 0) {
          request.cache = init.cache;
        }
        if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
          throw new TypeError(
            "'only-if-cached' can be set only with 'same-origin' mode"
          );
        }
        if (init.redirect !== void 0) {
          request.redirect = init.redirect;
        }
        if (init.integrity != null) {
          request.integrity = String(init.integrity);
        }
        if (init.keepalive !== void 0) {
          request.keepalive = Boolean(init.keepalive);
        }
        if (init.method !== void 0) {
          let method = init.method;
          const mayBeNormalized = normalizedMethodRecords[method];
          if (mayBeNormalized !== void 0) {
            request.method = mayBeNormalized;
          } else {
            if (!isValidHTTPToken(method)) {
              throw new TypeError(`'${method}' is not a valid HTTP method.`);
            }
            const upperCase = method.toUpperCase();
            if (forbiddenMethodsSet.has(upperCase)) {
              throw new TypeError(`'${method}' HTTP method is unsupported.`);
            }
            method = normalizedMethodRecordsBase[upperCase] ?? method;
            request.method = method;
          }
          if (!patchMethodWarning && request.method === "patch") {
            define_process_default.emitWarning("Using `patch` is highly likely to result in a `405 Method Not Allowed`. `PATCH` is much more likely to succeed.", {
              code: "UNDICI-FETCH-patch"
            });
            patchMethodWarning = true;
          }
        }
        if (init.signal !== void 0) {
          signal = init.signal;
        }
        this[kState] = request;
        const ac = new AbortController();
        this[kSignal] = ac.signal;
        if (signal != null) {
          if (!signal || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function") {
            throw new TypeError(
              "Failed to construct 'Request': member signal is not of type AbortSignal."
            );
          }
          if (signal.aborted) {
            ac.abort(signal.reason);
          } else {
            this[kAbortController] = ac;
            const acRef = new WeakRef(ac);
            const abort = buildAbort(acRef);
            try {
              if (typeof getMaxListeners === "function" && getMaxListeners(signal) === defaultMaxListeners) {
                setMaxListeners(1500, signal);
              } else if (getEventListeners(signal, "abort").length >= defaultMaxListeners) {
                setMaxListeners(1500, signal);
              }
            } catch {
            }
            util.addAbortListener(signal, abort);
            requestFinalizer.register(ac, { signal, abort }, abort);
          }
        }
        this[kHeaders] = new Headers2(kConstruct);
        setHeadersList(this[kHeaders], request.headersList);
        setHeadersGuard(this[kHeaders], "request");
        if (mode === "no-cors") {
          if (!corsSafeListedMethodsSet.has(request.method)) {
            throw new TypeError(
              `'${request.method} is unsupported in no-cors mode.`
            );
          }
          setHeadersGuard(this[kHeaders], "request-no-cors");
        }
        if (initHasKey) {
          const headersList = getHeadersList(this[kHeaders]);
          const headers = init.headers !== void 0 ? init.headers : new HeadersList(headersList);
          headersList.clear();
          if (headers instanceof HeadersList) {
            for (const { name, value } of headers.rawValues()) {
              headersList.append(name, value, false);
            }
            headersList.cookies = headers.cookies;
          } else {
            fillHeaders(this[kHeaders], headers);
          }
        }
        const inputBody = input instanceof _Request2 ? input[kState].body : null;
        if ((init.body != null || inputBody != null) && (request.method === "GET" || request.method === "HEAD")) {
          throw new TypeError("Request with GET/HEAD method cannot have body.");
        }
        let initBody = null;
        if (init.body != null) {
          const [extractedBody, contentType] = extractBody(
            init.body,
            request.keepalive
          );
          initBody = extractedBody;
          if (contentType && !getHeadersList(this[kHeaders]).contains("content-type", true)) {
            this[kHeaders].append("content-type", contentType);
          }
        }
        const inputOrInitBody = initBody ?? inputBody;
        if (inputOrInitBody != null && inputOrInitBody.source == null) {
          if (initBody != null && init.duplex == null) {
            throw new TypeError("RequestInit: duplex option is required when sending a body.");
          }
          if (request.mode !== "same-origin" && request.mode !== "cors") {
            throw new TypeError(
              'If request is made from ReadableStream, mode should be "same-origin" or "cors"'
            );
          }
          request.useCORSPreflightFlag = true;
        }
        let finalBody = inputOrInitBody;
        if (initBody == null && inputBody != null) {
          if (bodyUnusable(input)) {
            throw new TypeError(
              "Cannot construct a Request with a Request object that has already been used."
            );
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
      // Returns request’s HTTP method, which is "GET" by default.
      get method() {
        webidl.brandCheck(this, _Request2);
        return this[kState].method;
      }
      // Returns the URL of request as a string.
      get url() {
        webidl.brandCheck(this, _Request2);
        return URLSerializer(this[kState].url);
      }
      // Returns a Headers object consisting of the headers associated with request.
      // Note that headers added in the network layer by the user agent will not
      // be accounted for in this object, e.g., the "Host" header.
      get headers() {
        webidl.brandCheck(this, _Request2);
        return this[kHeaders];
      }
      // Returns the kind of resource requested by request, e.g., "document"
      // or "script".
      get destination() {
        webidl.brandCheck(this, _Request2);
        return this[kState].destination;
      }
      // Returns the referrer of request. Its value can be a same-origin URL if
      // explicitly set in init, the empty string to indicate no referrer, and
      // "about:client" when defaulting to the global’s default. This is used
      // during fetching to determine the value of the `Referer` header of the
      // request being made.
      get referrer() {
        webidl.brandCheck(this, _Request2);
        if (this[kState].referrer === "no-referrer") {
          return "";
        }
        if (this[kState].referrer === "client") {
          return "about:client";
        }
        return this[kState].referrer.toString();
      }
      // Returns the referrer policy associated with request.
      // This is used during fetching to compute the value of the request’s
      // referrer.
      get referrerPolicy() {
        webidl.brandCheck(this, _Request2);
        return this[kState].referrerPolicy;
      }
      // Returns the mode associated with request, which is a string indicating
      // whether the request will use CORS, or will be restricted to same-origin
      // URLs.
      get mode() {
        webidl.brandCheck(this, _Request2);
        return this[kState].mode;
      }
      // Returns the credentials mode associated with request,
      // which is a string indicating whether credentials will be sent with the
      // request always, never, or only when sent to a same-origin URL.
      get credentials() {
        return this[kState].credentials;
      }
      // Returns the cache mode associated with request,
      // which is a string indicating how the request will
      // interact with the browser’s cache when fetching.
      get cache() {
        webidl.brandCheck(this, _Request2);
        return this[kState].cache;
      }
      // Returns the redirect mode associated with request,
      // which is a string indicating how redirects for the
      // request will be handled during fetching. A request
      // will follow redirects by default.
      get redirect() {
        webidl.brandCheck(this, _Request2);
        return this[kState].redirect;
      }
      // Returns request’s subresource integrity metadata, which is a
      // cryptographic hash of the resource being fetched. Its value
      // consists of multiple hashes separated by whitespace. [SRI]
      get integrity() {
        webidl.brandCheck(this, _Request2);
        return this[kState].integrity;
      }
      // Returns a boolean indicating whether or not request can outlive the
      // global in which it was created.
      get keepalive() {
        webidl.brandCheck(this, _Request2);
        return this[kState].keepalive;
      }
      // Returns a boolean indicating whether or not request is for a reload
      // navigation.
      get isReloadNavigation() {
        webidl.brandCheck(this, _Request2);
        return this[kState].reloadNavigation;
      }
      // Returns a boolean indicating whether or not request is for a history
      // navigation (a.k.a. back-forward navigation).
      get isHistoryNavigation() {
        webidl.brandCheck(this, _Request2);
        return this[kState].historyNavigation;
      }
      // Returns the signal associated with request, which is an AbortSignal
      // object indicating whether or not request has been aborted, and its
      // abort event handler.
      get signal() {
        webidl.brandCheck(this, _Request2);
        return this[kSignal];
      }
      get body() {
        webidl.brandCheck(this, _Request2);
        return this[kState].body ? this[kState].body.stream : null;
      }
      get bodyUsed() {
        webidl.brandCheck(this, _Request2);
        return !!this[kState].body && util.isDisturbed(this[kState].body.stream);
      }
      get duplex() {
        webidl.brandCheck(this, _Request2);
        return "half";
      }
      // Returns a clone of request.
      clone() {
        webidl.brandCheck(this, _Request2);
        if (bodyUnusable(this)) {
          throw new TypeError("unusable");
        }
        const clonedRequest = cloneRequest(this[kState]);
        const ac = new AbortController();
        if (this.signal.aborted) {
          ac.abort(this.signal.reason);
        } else {
          let list = dependentControllerMap.get(this.signal);
          if (list === void 0) {
            list = /* @__PURE__ */ new Set();
            dependentControllerMap.set(this.signal, list);
          }
          const acRef = new WeakRef(ac);
          list.add(acRef);
          util.addAbortListener(
            ac.signal,
            buildAbort(acRef)
          );
        }
        return fromInnerRequest(clonedRequest, ac.signal, getHeadersGuard(this[kHeaders]));
      }
      [nodeUtil.inspect.custom](depth, options) {
        if (options.depth === null) {
          options.depth = 2;
        }
        options.colors ??= true;
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
        };
        return `Request ${nodeUtil.formatWithOptions(options, properties)}`;
      }
    };
    __name(_Request2, "Request");
    var Request2 = _Request2;
    mixinBody(Request2);
    function makeRequest(init) {
      return {
        method: init.method ?? "GET",
        localURLsOnly: init.localURLsOnly ?? false,
        unsafeRequest: init.unsafeRequest ?? false,
        body: init.body ?? null,
        client: init.client ?? null,
        reservedClient: init.reservedClient ?? null,
        replacesClientId: init.replacesClientId ?? "",
        window: init.window ?? "client",
        keepalive: init.keepalive ?? false,
        serviceWorkers: init.serviceWorkers ?? "all",
        initiator: init.initiator ?? "",
        destination: init.destination ?? "",
        priority: init.priority ?? null,
        origin: init.origin ?? "client",
        policyContainer: init.policyContainer ?? "client",
        referrer: init.referrer ?? "client",
        referrerPolicy: init.referrerPolicy ?? "",
        mode: init.mode ?? "no-cors",
        useCORSPreflightFlag: init.useCORSPreflightFlag ?? false,
        credentials: init.credentials ?? "same-origin",
        useCredentials: init.useCredentials ?? false,
        cache: init.cache ?? "default",
        redirect: init.redirect ?? "follow",
        integrity: init.integrity ?? "",
        cryptoGraphicsNonceMetadata: init.cryptoGraphicsNonceMetadata ?? "",
        parserMetadata: init.parserMetadata ?? "",
        reloadNavigation: init.reloadNavigation ?? false,
        historyNavigation: init.historyNavigation ?? false,
        userActivation: init.userActivation ?? false,
        taintedOrigin: init.taintedOrigin ?? false,
        redirectCount: init.redirectCount ?? 0,
        responseTainting: init.responseTainting ?? "basic",
        preventNoCacheCacheControlHeaderModification: init.preventNoCacheCacheControlHeaderModification ?? false,
        done: init.done ?? false,
        timingAllowFailed: init.timingAllowFailed ?? false,
        urlList: init.urlList,
        url: init.urlList[0],
        headersList: init.headersList ? new HeadersList(init.headersList) : new HeadersList()
      };
    }
    __name(makeRequest, "makeRequest");
    function cloneRequest(request) {
      const newRequest = makeRequest({ ...request, body: null });
      if (request.body != null) {
        newRequest.body = cloneBody(newRequest, request.body);
      }
      return newRequest;
    }
    __name(cloneRequest, "cloneRequest");
    function fromInnerRequest(innerRequest, signal, guard) {
      const request = new Request2(kConstruct);
      request[kState] = innerRequest;
      request[kSignal] = signal;
      request[kHeaders] = new Headers2(kConstruct);
      setHeadersList(request[kHeaders], innerRequest.headersList);
      setHeadersGuard(request[kHeaders], guard);
      return request;
    }
    __name(fromInnerRequest, "fromInnerRequest");
    Object.defineProperties(Request2.prototype, {
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
        value: "Request",
        configurable: true
      }
    });
    webidl.converters.Request = webidl.interfaceConverter(
      Request2
    );
    webidl.converters.RequestInfo = function(V, prefix, argument) {
      if (typeof V === "string") {
        return webidl.converters.USVString(V, prefix, argument);
      }
      if (V instanceof Request2) {
        return webidl.converters.Request(V, prefix, argument);
      }
      return webidl.converters.USVString(V, prefix, argument);
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
        // https://w3c.github.io/webappsec-referrer-policy/#referrer-policy
        allowedValues: referrerPolicy
      },
      {
        key: "mode",
        converter: webidl.converters.DOMString,
        // https://fetch.spec.whatwg.org/#concept-request-mode
        allowedValues: requestMode
      },
      {
        key: "credentials",
        converter: webidl.converters.DOMString,
        // https://fetch.spec.whatwg.org/#requestcredentials
        allowedValues: requestCredentials
      },
      {
        key: "cache",
        converter: webidl.converters.DOMString,
        // https://fetch.spec.whatwg.org/#requestcache
        allowedValues: requestCache
      },
      {
        key: "redirect",
        converter: webidl.converters.DOMString,
        // https://fetch.spec.whatwg.org/#requestredirect
        allowedValues: requestRedirect
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
            "RequestInit",
            "signal",
            { strict: false }
          )
        )
      },
      {
        key: "window",
        converter: webidl.converters.any
      },
      {
        key: "duplex",
        converter: webidl.converters.DOMString,
        allowedValues: requestDuplex
      },
      {
        key: "dispatcher",
        // undici specific option
        converter: webidl.converters.any
      }
    ]);
    module2.exports = { Request: Request2, makeRequest, fromInnerRequest, cloneRequest };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/index.js
var require_fetch = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fetch/index.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      makeNetworkError: makeNetworkError2,
      makeAppropriateNetworkError,
      filterResponse,
      makeResponse,
      fromInnerResponse: fromInnerResponse2
    } = require_response();
    var { HeadersList } = require_headers();
    var { Request: Request2, cloneRequest } = require_request();
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
    } = require_util2();
    var { kState, kDispatcher } = require_symbols2();
    var assert = require("assert");
    var { safelyExtractBody, extractBody } = require_body();
    var {
      redirectStatusSet,
      nullBodyStatus,
      safeMethodsSet,
      requestBodyHeader,
      subresourceSet
    } = require_constants3();
    var EE = require("events");
    var { Readable, pipeline, finished } = require("stream");
    var { addAbortListener, isErrored, isReadable, bufferToLowerCasedHeaderName } = require_util();
    var { dataURLProcessor, serializeAMimeType, minimizeSupportedMimeType } = require_data_url();
    var { getGlobalDispatcher } = require_global2();
    var { webidl } = require_webidl();
    var { STATUS_CODES } = require("http");
    var GET_OR_HEAD = ["GET", "HEAD"];
    var defaultUserAgent = typeof __UNDICI_IS_NODE__ !== "undefined" || typeof esbuildDetection !== "undefined" ? "node" : "undici";
    var resolveObjectURL;
    var _Fetch = class _Fetch extends EE {
      constructor(dispatcher) {
        super();
        this.dispatcher = dispatcher;
        this.connection = null;
        this.dump = false;
        this.state = "ongoing";
      }
      terminate(reason) {
        if (this.state !== "ongoing") {
          return;
        }
        this.state = "terminated";
        this.connection?.destroy(reason);
        this.emit("terminated", reason);
      }
      // https://fetch.spec.whatwg.org/#fetch-controller-abort
      abort(error) {
        if (this.state !== "ongoing") {
          return;
        }
        this.state = "aborted";
        if (!error) {
          error = new DOMException("The operation was aborted.", "AbortError");
        }
        this.serializedAbortReason = error;
        this.connection?.destroy(error);
        this.emit("terminated", error);
      }
    };
    __name(_Fetch, "Fetch");
    var Fetch = _Fetch;
    function handleFetchDone(response) {
      finalizeAndReportTiming(response, "fetch");
    }
    __name(handleFetchDone, "handleFetchDone");
    function fetch2(input, init = void 0) {
      webidl.argumentLengthCheck(arguments, 1, "globalThis.fetch");
      let p = createDeferredPromise();
      let requestObject;
      try {
        requestObject = new Request2(input, init);
      } catch (e) {
        p.reject(e);
        return p.promise;
      }
      const request = requestObject[kState];
      if (requestObject.signal.aborted) {
        abortFetch(p, request, null, requestObject.signal.reason);
        return p.promise;
      }
      const globalObject = request.client.globalObject;
      if (globalObject?.constructor?.name === "ServiceWorkerGlobalScope") {
        request.serviceWorkers = "none";
      }
      let responseObject = null;
      let locallyAborted = false;
      let controller = null;
      addAbortListener(
        requestObject.signal,
        () => {
          locallyAborted = true;
          assert(controller != null);
          controller.abort(requestObject.signal.reason);
          const realResponse = responseObject?.deref();
          abortFetch(p, request, realResponse, requestObject.signal.reason);
        }
      );
      const processResponse = /* @__PURE__ */ __name((response) => {
        if (locallyAborted) {
          return;
        }
        if (response.aborted) {
          abortFetch(p, request, responseObject, controller.serializedAbortReason);
          return;
        }
        if (response.type === "error") {
          p.reject(new TypeError("fetch failed", { cause: response.error }));
          return;
        }
        responseObject = new WeakRef(fromInnerResponse2(response, "immutable"));
        p.resolve(responseObject.deref());
        p = null;
      }, "processResponse");
      controller = fetching({
        request,
        processResponseEndOfBody: handleFetchDone,
        processResponse,
        dispatcher: requestObject[kDispatcher]
        // undici
      });
      return p.promise;
    }
    __name(fetch2, "fetch");
    function finalizeAndReportTiming(response, initiatorType = "other") {
      if (response.type === "error" && response.aborted) {
        return;
      }
      if (!response.urlList?.length) {
        return;
      }
      const originalURL = response.urlList[0];
      let timingInfo = response.timingInfo;
      let cacheState = response.cacheState;
      if (!urlIsHttpHttpsScheme(originalURL)) {
        return;
      }
      if (timingInfo === null) {
        return;
      }
      if (!response.timingAllowPassed) {
        timingInfo = createOpaqueTimingInfo({
          startTime: timingInfo.startTime
        });
        cacheState = "";
      }
      timingInfo.endTime = coarsenedSharedCurrentTime();
      response.timingInfo = timingInfo;
      markResourceTiming(
        timingInfo,
        originalURL.href,
        initiatorType,
        globalThis,
        cacheState
      );
    }
    __name(finalizeAndReportTiming, "finalizeAndReportTiming");
    var markResourceTiming = performance.markResourceTiming;
    function abortFetch(p, request, responseObject, error) {
      if (p) {
        p.reject(error);
      }
      if (request.body != null && isReadable(request.body?.stream)) {
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
      if (response.body != null && isReadable(response.body?.stream)) {
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
      dispatcher = getGlobalDispatcher()
      // undici
    }) {
      assert(dispatcher);
      let taskDestination = null;
      let crossOriginIsolatedCapability = false;
      if (request.client != null) {
        taskDestination = request.client.globalObject;
        crossOriginIsolatedCapability = request.client.crossOriginIsolatedCapability;
      }
      const currentTime = coarsenedSharedCurrentTime(crossOriginIsolatedCapability);
      const timingInfo = createOpaqueTimingInfo({
        startTime: currentTime
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
        request.window = request.client?.globalObject?.constructor?.name === "Window" ? request.client : "no-window";
      }
      if (request.origin === "client") {
        request.origin = request.client.origin;
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
      if (!request.headersList.contains("accept", true)) {
        const value = "*/*";
        request.headersList.append("accept", value, true);
      }
      if (!request.headersList.contains("accept-language", true)) {
        request.headersList.append("accept-language", "*", true);
      }
      if (request.priority === null) {
      }
      if (subresourceSet.has(request.destination)) {
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
      if (request.localURLsOnly && !urlIsLocal(requestCurrentURL(request))) {
        response = makeNetworkError2("local URLs only");
      }
      tryUpgradeRequestToAPotentiallyTrustworthyURL(request);
      if (requestBadPort(request) === "blocked") {
        response = makeNetworkError2("bad port");
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
          if (
            // - request’s current URL’s origin is same origin with request’s origin,
            //   and request’s response tainting is "basic"
            sameOrigin(currentURL, request.url) && request.responseTainting === "basic" || // request’s current URL’s scheme is "data"
            currentURL.protocol === "data:" || // - request’s mode is "navigate" or "websocket"
            (request.mode === "navigate" || request.mode === "websocket")
          ) {
            request.responseTainting = "basic";
            return await schemeFetch(fetchParams);
          }
          if (request.mode === "same-origin") {
            return makeNetworkError2('request mode cannot be "same-origin"');
          }
          if (request.mode === "no-cors") {
            if (request.redirect !== "follow") {
              return makeNetworkError2(
                'redirect mode cannot be "follow" for "no-cors" request'
              );
            }
            request.responseTainting = "opaque";
            return await schemeFetch(fetchParams);
          }
          if (!urlIsHttpHttpsScheme(requestCurrentURL(request))) {
            return makeNetworkError2("URL scheme must be a HTTP(S) scheme");
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
      if (response.type === "opaque" && internalResponse.status === 206 && internalResponse.rangeRequested && !request.headers.contains("range", true)) {
        response = internalResponse = makeNetworkError2();
      }
      if (response.status !== 0 && (request.method === "HEAD" || request.method === "CONNECT" || nullBodyStatus.includes(internalResponse.status))) {
        internalResponse.body = null;
        fetchParams.controller.dump = true;
      }
      if (request.integrity) {
        const processBodyError = /* @__PURE__ */ __name((reason) => fetchFinale(fetchParams, makeNetworkError2(reason)), "processBodyError");
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
    function schemeFetch(fetchParams) {
      if (isCancelled(fetchParams) && fetchParams.request.redirectCount === 0) {
        return Promise.resolve(makeAppropriateNetworkError(fetchParams));
      }
      const { request } = fetchParams;
      const { protocol: scheme } = requestCurrentURL(request);
      switch (scheme) {
        case "about:": {
          return Promise.resolve(makeNetworkError2("about scheme is not supported"));
        }
        case "blob:": {
          if (!resolveObjectURL) {
            resolveObjectURL = require("buffer").resolveObjectURL;
          }
          const blobURLEntry = requestCurrentURL(request);
          if (blobURLEntry.search.length !== 0) {
            return Promise.resolve(makeNetworkError2("NetworkError when attempting to fetch resource."));
          }
          const blob = resolveObjectURL(blobURLEntry.toString());
          if (request.method !== "GET" || !isBlobLike(blob)) {
            return Promise.resolve(makeNetworkError2("invalid method"));
          }
          const response = makeResponse();
          const fullLength = blob.size;
          const serializedFullLength = isomorphicEncode(`${fullLength}`);
          const type = blob.type;
          if (!request.headersList.contains("range", true)) {
            const bodyWithType = extractBody(blob);
            response.statusText = "OK";
            response.body = bodyWithType[0];
            response.headersList.set("content-length", serializedFullLength, true);
            response.headersList.set("content-type", type, true);
          } else {
            response.rangeRequested = true;
            const rangeHeader = request.headersList.get("range", true);
            const rangeValue = simpleRangeHeaderValue(rangeHeader, true);
            if (rangeValue === "failure") {
              return Promise.resolve(makeNetworkError2("failed to fetch the data URL"));
            }
            let { rangeStartValue: rangeStart, rangeEndValue: rangeEnd } = rangeValue;
            if (rangeStart === null) {
              rangeStart = fullLength - rangeEnd;
              rangeEnd = rangeStart + rangeEnd - 1;
            } else {
              if (rangeStart >= fullLength) {
                return Promise.resolve(makeNetworkError2("Range start is greater than the blob's size."));
              }
              if (rangeEnd === null || rangeEnd >= fullLength) {
                rangeEnd = fullLength - 1;
              }
            }
            const slicedBlob = blob.slice(rangeStart, rangeEnd, type);
            const slicedBodyWithType = extractBody(slicedBlob);
            response.body = slicedBodyWithType[0];
            const serializedSlicedLength = isomorphicEncode(`${slicedBlob.size}`);
            const contentRange = buildContentRange(rangeStart, rangeEnd, fullLength);
            response.status = 206;
            response.statusText = "Partial Content";
            response.headersList.set("content-length", serializedSlicedLength, true);
            response.headersList.set("content-type", type, true);
            response.headersList.set("content-range", contentRange, true);
          }
          return Promise.resolve(response);
        }
        case "data:": {
          const currentURL = requestCurrentURL(request);
          const dataURLStruct = dataURLProcessor(currentURL);
          if (dataURLStruct === "failure") {
            return Promise.resolve(makeNetworkError2("failed to fetch the data URL"));
          }
          const mimeType = serializeAMimeType(dataURLStruct.mimeType);
          return Promise.resolve(makeResponse({
            statusText: "OK",
            headersList: [
              ["content-type", { name: "Content-Type", value: mimeType }]
            ],
            body: safelyExtractBody(dataURLStruct.body)[0]
          }));
        }
        case "file:": {
          return Promise.resolve(makeNetworkError2("not implemented... yet..."));
        }
        case "http:":
        case "https:": {
          return httpFetch(fetchParams).catch((err) => makeNetworkError2(err));
        }
        default: {
          return Promise.resolve(makeNetworkError2("unknown scheme"));
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
    function fetchFinale(fetchParams, response) {
      let timingInfo = fetchParams.timingInfo;
      const processResponseEndOfBody = /* @__PURE__ */ __name(() => {
        const unsafeEndTime = Date.now();
        if (fetchParams.request.destination === "document") {
          fetchParams.controller.fullTimingInfo = timingInfo;
        }
        fetchParams.controller.reportTimingSteps = () => {
          if (fetchParams.request.url.protocol !== "https:") {
            return;
          }
          timingInfo.endTime = unsafeEndTime;
          let cacheState = response.cacheState;
          const bodyInfo = response.bodyInfo;
          if (!response.timingAllowPassed) {
            timingInfo = createOpaqueTimingInfo(timingInfo);
            cacheState = "";
          }
          let responseStatus = 0;
          if (fetchParams.request.mode !== "navigator" || !response.hasCrossOriginRedirects) {
            responseStatus = response.status;
            const mimeType = extractMimeType(response.headersList);
            if (mimeType !== "failure") {
              bodyInfo.contentType = minimizeSupportedMimeType(mimeType);
            }
          }
          if (fetchParams.request.initiatorType != null) {
            markResourceTiming(timingInfo, fetchParams.request.url.href, fetchParams.request.initiatorType, globalThis, cacheState, bodyInfo, responseStatus);
          }
        };
        const processResponseEndOfBodyTask = /* @__PURE__ */ __name(() => {
          fetchParams.request.done = true;
          if (fetchParams.processResponseEndOfBody != null) {
            queueMicrotask(() => fetchParams.processResponseEndOfBody(response));
          }
          if (fetchParams.request.initiatorType != null) {
            fetchParams.controller.reportTimingSteps();
          }
        }, "processResponseEndOfBodyTask");
        queueMicrotask(() => processResponseEndOfBodyTask());
      }, "processResponseEndOfBody");
      if (fetchParams.processResponse != null) {
        queueMicrotask(() => {
          fetchParams.processResponse(response);
          fetchParams.processResponse = null;
        });
      }
      const internalResponse = response.type === "error" ? response : response.internalResponse ?? response;
      if (internalResponse.body == null) {
        processResponseEndOfBody();
      } else {
        finished(internalResponse.body.stream, () => {
          processResponseEndOfBody();
        });
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
          return makeNetworkError2("cors failure");
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
        return makeNetworkError2("blocked");
      }
      if (redirectStatusSet.has(actualResponse.status)) {
        if (request.redirect !== "manual") {
          fetchParams.controller.connection.destroy(void 0, false);
        }
        if (request.redirect === "error") {
          response = makeNetworkError2("unexpected redirect");
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
    function httpRedirectFetch(fetchParams, response) {
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
        return Promise.resolve(makeNetworkError2(err));
      }
      if (!urlIsHttpHttpsScheme(locationURL)) {
        return Promise.resolve(makeNetworkError2("URL scheme must be a HTTP(S) scheme"));
      }
      if (request.redirectCount === 20) {
        return Promise.resolve(makeNetworkError2("redirect count exceeded"));
      }
      request.redirectCount += 1;
      if (request.mode === "cors" && (locationURL.username || locationURL.password) && !sameOrigin(request, locationURL)) {
        return Promise.resolve(makeNetworkError2('cross origin not allowed for request mode "cors"'));
      }
      if (request.responseTainting === "cors" && (locationURL.username || locationURL.password)) {
        return Promise.resolve(makeNetworkError2(
          'URL cannot contain credentials for request mode "cors"'
        ));
      }
      if (actualResponse.status !== 303 && request.body != null && request.body.source == null) {
        return Promise.resolve(makeNetworkError2());
      }
      if ([301, 302].includes(actualResponse.status) && request.method === "POST" || actualResponse.status === 303 && !GET_OR_HEAD.includes(request.method)) {
        request.method = "GET";
        request.body = null;
        for (const headerName of requestBodyHeader) {
          request.headersList.delete(headerName);
        }
      }
      if (!sameOrigin(requestCurrentURL(request), locationURL)) {
        request.headersList.delete("authorization", true);
        request.headersList.delete("proxy-authorization", true);
        request.headersList.delete("cookie", true);
        request.headersList.delete("host", true);
      }
      if (request.body != null) {
        assert(request.body.source != null);
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
        httpRequest = cloneRequest(request);
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
        contentLengthHeaderValue = isomorphicEncode(`${contentLength}`);
      }
      if (contentLengthHeaderValue != null) {
        httpRequest.headersList.append("content-length", contentLengthHeaderValue, true);
      }
      if (contentLength != null && httpRequest.keepalive) {
      }
      if (httpRequest.referrer instanceof URL) {
        httpRequest.headersList.append("referer", isomorphicEncode(httpRequest.referrer.href), true);
      }
      appendRequestOriginHeader(httpRequest);
      appendFetchMetadata(httpRequest);
      if (!httpRequest.headersList.contains("user-agent", true)) {
        httpRequest.headersList.append("user-agent", defaultUserAgent);
      }
      if (httpRequest.cache === "default" && (httpRequest.headersList.contains("if-modified-since", true) || httpRequest.headersList.contains("if-none-match", true) || httpRequest.headersList.contains("if-unmodified-since", true) || httpRequest.headersList.contains("if-match", true) || httpRequest.headersList.contains("if-range", true))) {
        httpRequest.cache = "no-store";
      }
      if (httpRequest.cache === "no-cache" && !httpRequest.preventNoCacheCacheControlHeaderModification && !httpRequest.headersList.contains("cache-control", true)) {
        httpRequest.headersList.append("cache-control", "max-age=0", true);
      }
      if (httpRequest.cache === "no-store" || httpRequest.cache === "reload") {
        if (!httpRequest.headersList.contains("pragma", true)) {
          httpRequest.headersList.append("pragma", "no-cache", true);
        }
        if (!httpRequest.headersList.contains("cache-control", true)) {
          httpRequest.headersList.append("cache-control", "no-cache", true);
        }
      }
      if (httpRequest.headersList.contains("range", true)) {
        httpRequest.headersList.append("accept-encoding", "identity", true);
      }
      if (!httpRequest.headersList.contains("accept-encoding", true)) {
        if (urlHasHttpsScheme(requestCurrentURL(httpRequest))) {
          httpRequest.headersList.append("accept-encoding", "br, gzip, deflate", true);
        } else {
          httpRequest.headersList.append("accept-encoding", "gzip, deflate", true);
        }
      }
      if (includeCredentials) {
      }
      if (httpCache == null) {
        httpRequest.cache = "no-store";
      }
      if (httpRequest.cache !== "no-store" && httpRequest.cache !== "reload") {
      }
      if (response == null) {
        if (httpRequest.cache === "only-if-cached") {
          return makeNetworkError2("only if cached");
        }
        const forwardResponse = await httpNetworkFetch(
          httpFetchParams,
          includeCredentials,
          isNewConnectionFetch
        );
        if (!safeMethodsSet.has(httpRequest.method) && forwardResponse.status >= 200 && forwardResponse.status <= 399) {
        }
        if (revalidatingFlag && forwardResponse.status === 304) {
        }
        if (response == null) {
          response = forwardResponse;
        }
      }
      response.urlList = [...httpRequest.urlList];
      if (httpRequest.headersList.contains("range", true)) {
        response.rangeRequested = true;
      }
      response.requestIncludesCredentials = includeCredentials;
      if (response.status === 407) {
        if (request.window === "no-window") {
          return makeNetworkError2();
        }
        if (isCancelled(fetchParams)) {
          return makeAppropriateNetworkError(fetchParams);
        }
        return makeNetworkError2("proxy authentication required");
      }
      if (
        // response’s status is 421
        response.status === 421 && // isNewConnectionFetch is false
        !isNewConnectionFetch && // request’s body is null, or request’s body is non-null and request’s body’s source is non-null
        (request.body == null || request.body.source != null)
      ) {
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
        destroy(err, abort = true) {
          if (!this.destroyed) {
            this.destroyed = true;
            if (abort) {
              this.abort?.(err ?? new DOMException("The operation was aborted.", "AbortError"));
            }
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
          if (isCancelled(fetchParams)) {
            return;
          }
          yield bytes;
          fetchParams.processRequestBodyChunkLength?.(bytes.byteLength);
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
        const { body, status, statusText, headersList, socket } = await dispatch({ body: requestBody });
        if (socket) {
          response = makeResponse({ status, statusText, headersList, socket });
        } else {
          const iterator = body[Symbol.asyncIterator]();
          fetchParams.controller.next = () => iterator.next();
          response = makeResponse({ status, statusText, headersList });
        }
      } catch (err) {
        if (err.name === "AbortError") {
          fetchParams.controller.connection.destroy();
          return makeAppropriateNetworkError(fetchParams, err);
        }
        return makeNetworkError2(err);
      }
      const pullAlgorithm = /* @__PURE__ */ __name(async () => {
        await fetchParams.controller.resume();
      }, "pullAlgorithm");
      const cancelAlgorithm = /* @__PURE__ */ __name((reason) => {
        if (!isCancelled(fetchParams)) {
          fetchParams.controller.abort(reason);
        }
      }, "cancelAlgorithm");
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
          },
          type: "bytes"
        }
      );
      response.body = { stream, source: null, length: null };
      fetchParams.controller.onAborted = onAborted;
      fetchParams.controller.on("terminated", onAborted);
      fetchParams.controller.resume = async () => {
        while (true) {
          let bytes;
          let isFailure;
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
              isFailure = true;
            }
          }
          if (bytes === void 0) {
            readableStreamClose(fetchParams.controller.controller);
            finalizeResponse(fetchParams, response);
            return;
          }
          timingInfo.decodedBodySize += bytes?.byteLength ?? 0;
          if (isFailure) {
            fetchParams.controller.terminate(bytes);
            return;
          }
          const buffer = new Uint8Array(bytes);
          if (buffer.byteLength) {
            fetchParams.controller.controller.enqueue(buffer);
          }
          if (isErrored(stream)) {
            fetchParams.controller.terminate();
            return;
          }
          if (fetchParams.controller.controller.desiredSize <= 0) {
            return;
          }
        }
      };
      function onAborted(reason) {
        if (isAborted(fetchParams)) {
          response.aborted = true;
          if (isReadable(stream)) {
            fetchParams.controller.controller.error(
              fetchParams.controller.serializedAbortReason
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
      function dispatch({ body }) {
        const url = requestCurrentURL(request);
        const agent = fetchParams.controller.dispatcher;
        return new Promise((resolve, reject) => agent.dispatch(
          {
            path: url.pathname + url.search,
            origin: url.origin,
            method: request.method,
            body: agent.isMockActive ? request.body && (request.body.source || request.body.stream) : body,
            headers: request.headersList.entries,
            maxRedirections: 0,
            upgrade: request.mode === "websocket" ? "websocket" : void 0
          },
          {
            body: null,
            abort: null,
            onConnect(abort) {
              const { connection } = fetchParams.controller;
              timingInfo.finalConnectionTimingInfo = clampAndCoarsenConnectionTimingInfo(void 0, timingInfo.postRedirectStartTime, fetchParams.crossOriginIsolatedCapability);
              if (connection.destroyed) {
                abort(new DOMException("The operation was aborted.", "AbortError"));
              } else {
                fetchParams.controller.on("terminated", abort);
                this.abort = connection.abort = abort;
              }
              timingInfo.finalNetworkRequestStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
            },
            onResponseStarted() {
              timingInfo.finalNetworkResponseStartTime = coarsenedSharedCurrentTime(fetchParams.crossOriginIsolatedCapability);
            },
            onHeaders(status, rawHeaders, resume, statusText) {
              if (status < 200) {
                return;
              }
              let codings = [];
              let location = "";
              const headersList = new HeadersList();
              for (let i = 0; i < rawHeaders.length; i += 2) {
                headersList.append(bufferToLowerCasedHeaderName(rawHeaders[i]), rawHeaders[i + 1].toString("latin1"), true);
              }
              const contentEncoding = headersList.get("content-encoding", true);
              if (contentEncoding) {
                codings = contentEncoding.toLowerCase().split(",").map((x) => x.trim());
              }
              location = headersList.get("location", true);
              this.body = new Readable({ read: resume });
              const decoders = [];
              const willFollow = location && request.redirect === "follow" && redirectStatusSet.has(status);
              if (codings.length !== 0 && request.method !== "HEAD" && request.method !== "CONNECT" && !nullBodyStatus.includes(status) && !willFollow) {
                for (let i = codings.length - 1; i >= 0; --i) {
                  const coding = codings[i];
                  if (coding === "x-gzip" || coding === "gzip") {
                    decoders.push(zlib.createGunzip({
                      // Be less strict when decoding compressed responses, since sometimes
                      // servers send slightly invalid responses that are still accepted
                      // by common browsers.
                      // Always using Z_SYNC_FLUSH is what cURL does.
                      flush: zlib.constants.Z_SYNC_FLUSH,
                      finishFlush: zlib.constants.Z_SYNC_FLUSH
                    }));
                  } else if (coding === "deflate") {
                    decoders.push(createInflate({
                      flush: zlib.constants.Z_SYNC_FLUSH,
                      finishFlush: zlib.constants.Z_SYNC_FLUSH
                    }));
                  } else if (coding === "br") {
                    decoders.push(zlib.createBrotliDecompress({
                      flush: zlib.constants.BROTLI_OPERATION_FLUSH,
                      finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH
                    }));
                  } else {
                    decoders.length = 0;
                    break;
                  }
                }
              }
              const onError = this.onError.bind(this);
              resolve({
                status,
                statusText,
                headersList,
                body: decoders.length ? pipeline(this.body, ...decoders, (err) => {
                  if (err) {
                    this.onError(err);
                  }
                }).on("error", onError) : this.body.on("error", onError)
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
              if (fetchParams.controller.onAborted) {
                fetchParams.controller.off("terminated", fetchParams.controller.onAborted);
              }
              fetchParams.controller.ended = true;
              this.body.push(null);
            },
            onError(error) {
              if (this.abort) {
                fetchParams.controller.off("terminated", this.abort);
              }
              this.body?.destroy(error);
              fetchParams.controller.terminate(error);
              reject(error);
            },
            onUpgrade(status, rawHeaders, socket) {
              if (status !== 101) {
                return;
              }
              const headersList = new HeadersList();
              for (let i = 0; i < rawHeaders.length; i += 2) {
                headersList.append(bufferToLowerCasedHeaderName(rawHeaders[i]), rawHeaders[i + 1].toString("latin1"), true);
              }
              resolve({
                status,
                statusText: STATUS_CODES[status],
                headersList,
                socket
              });
              return true;
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

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/symbols.js
var require_symbols3 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/symbols.js"(exports2, module2) {
    "use strict";
    init_define_process();
    module2.exports = {
      kState: Symbol("FileReader state"),
      kResult: Symbol("FileReader result"),
      kError: Symbol("FileReader error"),
      kLastProgressEventFired: Symbol("FileReader last progress event fired timestamp"),
      kEvents: Symbol("FileReader events"),
      kAborted: Symbol("FileReader aborted")
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/progressevent.js
var require_progressevent = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/progressevent.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { webidl } = require_webidl();
    var kState = Symbol("ProgressEvent state");
    var _ProgressEvent = class _ProgressEvent extends Event {
      constructor(type, eventInitDict = {}) {
        type = webidl.converters.DOMString(type, "ProgressEvent constructor", "type");
        eventInitDict = webidl.converters.ProgressEventInit(eventInitDict ?? {});
        super(type, eventInitDict);
        this[kState] = {
          lengthComputable: eventInitDict.lengthComputable,
          loaded: eventInitDict.loaded,
          total: eventInitDict.total
        };
      }
      get lengthComputable() {
        webidl.brandCheck(this, _ProgressEvent);
        return this[kState].lengthComputable;
      }
      get loaded() {
        webidl.brandCheck(this, _ProgressEvent);
        return this[kState].loaded;
      }
      get total() {
        webidl.brandCheck(this, _ProgressEvent);
        return this[kState].total;
      }
    };
    __name(_ProgressEvent, "ProgressEvent");
    var ProgressEvent = _ProgressEvent;
    webidl.converters.ProgressEventInit = webidl.dictionaryConverter([
      {
        key: "lengthComputable",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "loaded",
        converter: webidl.converters["unsigned long long"],
        defaultValue: () => 0
      },
      {
        key: "total",
        converter: webidl.converters["unsigned long long"],
        defaultValue: () => 0
      },
      {
        key: "bubbles",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "cancelable",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "composed",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      }
    ]);
    module2.exports = {
      ProgressEvent
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/encoding.js
var require_encoding = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/encoding.js"(exports2, module2) {
    "use strict";
    init_define_process();
    function getEncoding(label) {
      if (!label) {
        return "failure";
      }
      switch (label.trim().toLowerCase()) {
        case "unicode-1-1-utf-8":
        case "unicode11utf8":
        case "unicode20utf8":
        case "utf-8":
        case "utf8":
        case "x-unicode20utf8":
          return "UTF-8";
        case "866":
        case "cp866":
        case "csibm866":
        case "ibm866":
          return "IBM866";
        case "csisolatin2":
        case "iso-8859-2":
        case "iso-ir-101":
        case "iso8859-2":
        case "iso88592":
        case "iso_8859-2":
        case "iso_8859-2:1987":
        case "l2":
        case "latin2":
          return "ISO-8859-2";
        case "csisolatin3":
        case "iso-8859-3":
        case "iso-ir-109":
        case "iso8859-3":
        case "iso88593":
        case "iso_8859-3":
        case "iso_8859-3:1988":
        case "l3":
        case "latin3":
          return "ISO-8859-3";
        case "csisolatin4":
        case "iso-8859-4":
        case "iso-ir-110":
        case "iso8859-4":
        case "iso88594":
        case "iso_8859-4":
        case "iso_8859-4:1988":
        case "l4":
        case "latin4":
          return "ISO-8859-4";
        case "csisolatincyrillic":
        case "cyrillic":
        case "iso-8859-5":
        case "iso-ir-144":
        case "iso8859-5":
        case "iso88595":
        case "iso_8859-5":
        case "iso_8859-5:1988":
          return "ISO-8859-5";
        case "arabic":
        case "asmo-708":
        case "csiso88596e":
        case "csiso88596i":
        case "csisolatinarabic":
        case "ecma-114":
        case "iso-8859-6":
        case "iso-8859-6-e":
        case "iso-8859-6-i":
        case "iso-ir-127":
        case "iso8859-6":
        case "iso88596":
        case "iso_8859-6":
        case "iso_8859-6:1987":
          return "ISO-8859-6";
        case "csisolatingreek":
        case "ecma-118":
        case "elot_928":
        case "greek":
        case "greek8":
        case "iso-8859-7":
        case "iso-ir-126":
        case "iso8859-7":
        case "iso88597":
        case "iso_8859-7":
        case "iso_8859-7:1987":
        case "sun_eu_greek":
          return "ISO-8859-7";
        case "csiso88598e":
        case "csisolatinhebrew":
        case "hebrew":
        case "iso-8859-8":
        case "iso-8859-8-e":
        case "iso-ir-138":
        case "iso8859-8":
        case "iso88598":
        case "iso_8859-8":
        case "iso_8859-8:1988":
        case "visual":
          return "ISO-8859-8";
        case "csiso88598i":
        case "iso-8859-8-i":
        case "logical":
          return "ISO-8859-8-I";
        case "csisolatin6":
        case "iso-8859-10":
        case "iso-ir-157":
        case "iso8859-10":
        case "iso885910":
        case "l6":
        case "latin6":
          return "ISO-8859-10";
        case "iso-8859-13":
        case "iso8859-13":
        case "iso885913":
          return "ISO-8859-13";
        case "iso-8859-14":
        case "iso8859-14":
        case "iso885914":
          return "ISO-8859-14";
        case "csisolatin9":
        case "iso-8859-15":
        case "iso8859-15":
        case "iso885915":
        case "iso_8859-15":
        case "l9":
          return "ISO-8859-15";
        case "iso-8859-16":
          return "ISO-8859-16";
        case "cskoi8r":
        case "koi":
        case "koi8":
        case "koi8-r":
        case "koi8_r":
          return "KOI8-R";
        case "koi8-ru":
        case "koi8-u":
          return "KOI8-U";
        case "csmacintosh":
        case "mac":
        case "macintosh":
        case "x-mac-roman":
          return "macintosh";
        case "iso-8859-11":
        case "iso8859-11":
        case "iso885911":
        case "tis-620":
        case "windows-874":
          return "windows-874";
        case "cp1250":
        case "windows-1250":
        case "x-cp1250":
          return "windows-1250";
        case "cp1251":
        case "windows-1251":
        case "x-cp1251":
          return "windows-1251";
        case "ansi_x3.4-1968":
        case "ascii":
        case "cp1252":
        case "cp819":
        case "csisolatin1":
        case "ibm819":
        case "iso-8859-1":
        case "iso-ir-100":
        case "iso8859-1":
        case "iso88591":
        case "iso_8859-1":
        case "iso_8859-1:1987":
        case "l1":
        case "latin1":
        case "us-ascii":
        case "windows-1252":
        case "x-cp1252":
          return "windows-1252";
        case "cp1253":
        case "windows-1253":
        case "x-cp1253":
          return "windows-1253";
        case "cp1254":
        case "csisolatin5":
        case "iso-8859-9":
        case "iso-ir-148":
        case "iso8859-9":
        case "iso88599":
        case "iso_8859-9":
        case "iso_8859-9:1989":
        case "l5":
        case "latin5":
        case "windows-1254":
        case "x-cp1254":
          return "windows-1254";
        case "cp1255":
        case "windows-1255":
        case "x-cp1255":
          return "windows-1255";
        case "cp1256":
        case "windows-1256":
        case "x-cp1256":
          return "windows-1256";
        case "cp1257":
        case "windows-1257":
        case "x-cp1257":
          return "windows-1257";
        case "cp1258":
        case "windows-1258":
        case "x-cp1258":
          return "windows-1258";
        case "x-mac-cyrillic":
        case "x-mac-ukrainian":
          return "x-mac-cyrillic";
        case "chinese":
        case "csgb2312":
        case "csiso58gb231280":
        case "gb2312":
        case "gb_2312":
        case "gb_2312-80":
        case "gbk":
        case "iso-ir-58":
        case "x-gbk":
          return "GBK";
        case "gb18030":
          return "gb18030";
        case "big5":
        case "big5-hkscs":
        case "cn-big5":
        case "csbig5":
        case "x-x-big5":
          return "Big5";
        case "cseucpkdfmtjapanese":
        case "euc-jp":
        case "x-euc-jp":
          return "EUC-JP";
        case "csiso2022jp":
        case "iso-2022-jp":
          return "ISO-2022-JP";
        case "csshiftjis":
        case "ms932":
        case "ms_kanji":
        case "shift-jis":
        case "shift_jis":
        case "sjis":
        case "windows-31j":
        case "x-sjis":
          return "Shift_JIS";
        case "cseuckr":
        case "csksc56011987":
        case "euc-kr":
        case "iso-ir-149":
        case "korean":
        case "ks_c_5601-1987":
        case "ks_c_5601-1989":
        case "ksc5601":
        case "ksc_5601":
        case "windows-949":
          return "EUC-KR";
        case "csiso2022kr":
        case "hz-gb-2312":
        case "iso-2022-cn":
        case "iso-2022-cn-ext":
        case "iso-2022-kr":
        case "replacement":
          return "replacement";
        case "unicodefffe":
        case "utf-16be":
          return "UTF-16BE";
        case "csunicode":
        case "iso-10646-ucs-2":
        case "ucs-2":
        case "unicode":
        case "unicodefeff":
        case "utf-16":
        case "utf-16le":
          return "UTF-16LE";
        case "x-user-defined":
          return "x-user-defined";
        default:
          return "failure";
      }
    }
    __name(getEncoding, "getEncoding");
    module2.exports = {
      getEncoding
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/util.js
var require_util4 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      kState,
      kError,
      kResult,
      kAborted,
      kLastProgressEventFired
    } = require_symbols3();
    var { ProgressEvent } = require_progressevent();
    var { getEncoding } = require_encoding();
    var { serializeAMimeType, parseMIMEType } = require_data_url();
    var { types } = require("util");
    var { StringDecoder } = require("string_decoder");
    var { btoa: btoa2 } = require("buffer");
    var staticPropertyDescriptors = {
      enumerable: true,
      writable: false,
      configurable: false
    };
    function readOperation(fr, blob, type, encodingName) {
      if (fr[kState] === "loading") {
        throw new DOMException("Invalid state", "InvalidStateError");
      }
      fr[kState] = "loading";
      fr[kResult] = null;
      fr[kError] = null;
      const stream = blob.stream();
      const reader = stream.getReader();
      const bytes = [];
      let chunkPromise = reader.read();
      let isFirstChunk = true;
      (async () => {
        while (!fr[kAborted]) {
          try {
            const { done, value } = await chunkPromise;
            if (isFirstChunk && !fr[kAborted]) {
              queueMicrotask(() => {
                fireAProgressEvent("loadstart", fr);
              });
            }
            isFirstChunk = false;
            if (!done && types.isUint8Array(value)) {
              bytes.push(value);
              if ((fr[kLastProgressEventFired] === void 0 || Date.now() - fr[kLastProgressEventFired] >= 50) && !fr[kAborted]) {
                fr[kLastProgressEventFired] = Date.now();
                queueMicrotask(() => {
                  fireAProgressEvent("progress", fr);
                });
              }
              chunkPromise = reader.read();
            } else if (done) {
              queueMicrotask(() => {
                fr[kState] = "done";
                try {
                  const result = packageData(bytes, type, blob.type, encodingName);
                  if (fr[kAborted]) {
                    return;
                  }
                  fr[kResult] = result;
                  fireAProgressEvent("load", fr);
                } catch (error) {
                  fr[kError] = error;
                  fireAProgressEvent("error", fr);
                }
                if (fr[kState] !== "loading") {
                  fireAProgressEvent("loadend", fr);
                }
              });
              break;
            }
          } catch (error) {
            if (fr[kAborted]) {
              return;
            }
            queueMicrotask(() => {
              fr[kState] = "done";
              fr[kError] = error;
              fireAProgressEvent("error", fr);
              if (fr[kState] !== "loading") {
                fireAProgressEvent("loadend", fr);
              }
            });
            break;
          }
        }
      })();
    }
    __name(readOperation, "readOperation");
    function fireAProgressEvent(e, reader) {
      const event = new ProgressEvent(e, {
        bubbles: false,
        cancelable: false
      });
      reader.dispatchEvent(event);
    }
    __name(fireAProgressEvent, "fireAProgressEvent");
    function packageData(bytes, type, mimeType, encodingName) {
      switch (type) {
        case "DataURL": {
          let dataURL = "data:";
          const parsed = parseMIMEType(mimeType || "application/octet-stream");
          if (parsed !== "failure") {
            dataURL += serializeAMimeType(parsed);
          }
          dataURL += ";base64,";
          const decoder = new StringDecoder("latin1");
          for (const chunk of bytes) {
            dataURL += btoa2(decoder.write(chunk));
          }
          dataURL += btoa2(decoder.end());
          return dataURL;
        }
        case "Text": {
          let encoding = "failure";
          if (encodingName) {
            encoding = getEncoding(encodingName);
          }
          if (encoding === "failure" && mimeType) {
            const type2 = parseMIMEType(mimeType);
            if (type2 !== "failure") {
              encoding = getEncoding(type2.parameters.get("charset"));
            }
          }
          if (encoding === "failure") {
            encoding = "UTF-8";
          }
          return decode(bytes, encoding);
        }
        case "ArrayBuffer": {
          const sequence = combineByteSequences(bytes);
          return sequence.buffer;
        }
        case "BinaryString": {
          let binaryString = "";
          const decoder = new StringDecoder("latin1");
          for (const chunk of bytes) {
            binaryString += decoder.write(chunk);
          }
          binaryString += decoder.end();
          return binaryString;
        }
      }
    }
    __name(packageData, "packageData");
    function decode(ioQueue, encoding) {
      const bytes = combineByteSequences(ioQueue);
      const BOMEncoding = BOMSniffing(bytes);
      let slice = 0;
      if (BOMEncoding !== null) {
        encoding = BOMEncoding;
        slice = BOMEncoding === "UTF-8" ? 3 : 2;
      }
      const sliced = bytes.slice(slice);
      return new TextDecoder(encoding).decode(sliced);
    }
    __name(decode, "decode");
    function BOMSniffing(ioQueue) {
      const [a, b, c] = ioQueue;
      if (a === 239 && b === 187 && c === 191) {
        return "UTF-8";
      } else if (a === 254 && b === 255) {
        return "UTF-16BE";
      } else if (a === 255 && b === 254) {
        return "UTF-16LE";
      }
      return null;
    }
    __name(BOMSniffing, "BOMSniffing");
    function combineByteSequences(sequences) {
      const size = sequences.reduce((a, b) => {
        return a + b.byteLength;
      }, 0);
      let offset = 0;
      return sequences.reduce((a, b) => {
        a.set(b, offset);
        offset += b.byteLength;
        return a;
      }, new Uint8Array(size));
    }
    __name(combineByteSequences, "combineByteSequences");
    module2.exports = {
      staticPropertyDescriptors,
      readOperation,
      fireAProgressEvent
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/filereader.js
var require_filereader = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/fileapi/filereader.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var {
      staticPropertyDescriptors,
      readOperation,
      fireAProgressEvent
    } = require_util4();
    var {
      kState,
      kError,
      kResult,
      kEvents,
      kAborted
    } = require_symbols3();
    var { webidl } = require_webidl();
    var { kEnumerableProperty } = require_util();
    var _FileReader = class _FileReader extends EventTarget {
      constructor() {
        super();
        this[kState] = "empty";
        this[kResult] = null;
        this[kError] = null;
        this[kEvents] = {
          loadend: null,
          error: null,
          abort: null,
          load: null,
          progress: null,
          loadstart: null
        };
      }
      /**
       * @see https://w3c.github.io/FileAPI/#dfn-readAsArrayBuffer
       * @param {import('buffer').Blob} blob
       */
      readAsArrayBuffer(blob) {
        webidl.brandCheck(this, _FileReader);
        webidl.argumentLengthCheck(arguments, 1, "FileReader.readAsArrayBuffer");
        blob = webidl.converters.Blob(blob, { strict: false });
        readOperation(this, blob, "ArrayBuffer");
      }
      /**
       * @see https://w3c.github.io/FileAPI/#readAsBinaryString
       * @param {import('buffer').Blob} blob
       */
      readAsBinaryString(blob) {
        webidl.brandCheck(this, _FileReader);
        webidl.argumentLengthCheck(arguments, 1, "FileReader.readAsBinaryString");
        blob = webidl.converters.Blob(blob, { strict: false });
        readOperation(this, blob, "BinaryString");
      }
      /**
       * @see https://w3c.github.io/FileAPI/#readAsDataText
       * @param {import('buffer').Blob} blob
       * @param {string?} encoding
       */
      readAsText(blob, encoding = void 0) {
        webidl.brandCheck(this, _FileReader);
        webidl.argumentLengthCheck(arguments, 1, "FileReader.readAsText");
        blob = webidl.converters.Blob(blob, { strict: false });
        if (encoding !== void 0) {
          encoding = webidl.converters.DOMString(encoding, "FileReader.readAsText", "encoding");
        }
        readOperation(this, blob, "Text", encoding);
      }
      /**
       * @see https://w3c.github.io/FileAPI/#dfn-readAsDataURL
       * @param {import('buffer').Blob} blob
       */
      readAsDataURL(blob) {
        webidl.brandCheck(this, _FileReader);
        webidl.argumentLengthCheck(arguments, 1, "FileReader.readAsDataURL");
        blob = webidl.converters.Blob(blob, { strict: false });
        readOperation(this, blob, "DataURL");
      }
      /**
       * @see https://w3c.github.io/FileAPI/#dfn-abort
       */
      abort() {
        if (this[kState] === "empty" || this[kState] === "done") {
          this[kResult] = null;
          return;
        }
        if (this[kState] === "loading") {
          this[kState] = "done";
          this[kResult] = null;
        }
        this[kAborted] = true;
        fireAProgressEvent("abort", this);
        if (this[kState] !== "loading") {
          fireAProgressEvent("loadend", this);
        }
      }
      /**
       * @see https://w3c.github.io/FileAPI/#dom-filereader-readystate
       */
      get readyState() {
        webidl.brandCheck(this, _FileReader);
        switch (this[kState]) {
          case "empty":
            return this.EMPTY;
          case "loading":
            return this.LOADING;
          case "done":
            return this.DONE;
        }
      }
      /**
       * @see https://w3c.github.io/FileAPI/#dom-filereader-result
       */
      get result() {
        webidl.brandCheck(this, _FileReader);
        return this[kResult];
      }
      /**
       * @see https://w3c.github.io/FileAPI/#dom-filereader-error
       */
      get error() {
        webidl.brandCheck(this, _FileReader);
        return this[kError];
      }
      get onloadend() {
        webidl.brandCheck(this, _FileReader);
        return this[kEvents].loadend;
      }
      set onloadend(fn) {
        webidl.brandCheck(this, _FileReader);
        if (this[kEvents].loadend) {
          this.removeEventListener("loadend", this[kEvents].loadend);
        }
        if (typeof fn === "function") {
          this[kEvents].loadend = fn;
          this.addEventListener("loadend", fn);
        } else {
          this[kEvents].loadend = null;
        }
      }
      get onerror() {
        webidl.brandCheck(this, _FileReader);
        return this[kEvents].error;
      }
      set onerror(fn) {
        webidl.brandCheck(this, _FileReader);
        if (this[kEvents].error) {
          this.removeEventListener("error", this[kEvents].error);
        }
        if (typeof fn === "function") {
          this[kEvents].error = fn;
          this.addEventListener("error", fn);
        } else {
          this[kEvents].error = null;
        }
      }
      get onloadstart() {
        webidl.brandCheck(this, _FileReader);
        return this[kEvents].loadstart;
      }
      set onloadstart(fn) {
        webidl.brandCheck(this, _FileReader);
        if (this[kEvents].loadstart) {
          this.removeEventListener("loadstart", this[kEvents].loadstart);
        }
        if (typeof fn === "function") {
          this[kEvents].loadstart = fn;
          this.addEventListener("loadstart", fn);
        } else {
          this[kEvents].loadstart = null;
        }
      }
      get onprogress() {
        webidl.brandCheck(this, _FileReader);
        return this[kEvents].progress;
      }
      set onprogress(fn) {
        webidl.brandCheck(this, _FileReader);
        if (this[kEvents].progress) {
          this.removeEventListener("progress", this[kEvents].progress);
        }
        if (typeof fn === "function") {
          this[kEvents].progress = fn;
          this.addEventListener("progress", fn);
        } else {
          this[kEvents].progress = null;
        }
      }
      get onload() {
        webidl.brandCheck(this, _FileReader);
        return this[kEvents].load;
      }
      set onload(fn) {
        webidl.brandCheck(this, _FileReader);
        if (this[kEvents].load) {
          this.removeEventListener("load", this[kEvents].load);
        }
        if (typeof fn === "function") {
          this[kEvents].load = fn;
          this.addEventListener("load", fn);
        } else {
          this[kEvents].load = null;
        }
      }
      get onabort() {
        webidl.brandCheck(this, _FileReader);
        return this[kEvents].abort;
      }
      set onabort(fn) {
        webidl.brandCheck(this, _FileReader);
        if (this[kEvents].abort) {
          this.removeEventListener("abort", this[kEvents].abort);
        }
        if (typeof fn === "function") {
          this[kEvents].abort = fn;
          this.addEventListener("abort", fn);
        } else {
          this[kEvents].abort = null;
        }
      }
    };
    __name(_FileReader, "FileReader");
    var FileReader = _FileReader;
    FileReader.EMPTY = FileReader.prototype.EMPTY = 0;
    FileReader.LOADING = FileReader.prototype.LOADING = 1;
    FileReader.DONE = FileReader.prototype.DONE = 2;
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
        value: "FileReader",
        writable: false,
        enumerable: false,
        configurable: true
      }
    });
    Object.defineProperties(FileReader, {
      EMPTY: staticPropertyDescriptors,
      LOADING: staticPropertyDescriptors,
      DONE: staticPropertyDescriptors
    });
    module2.exports = {
      FileReader
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/symbols.js
var require_symbols4 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/symbols.js"(exports2, module2) {
    "use strict";
    init_define_process();
    module2.exports = {
      kConstruct: require_symbols().kConstruct
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/util.js
var require_util5 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var assert = require("assert");
    var { URLSerializer } = require_data_url();
    var { isValidHeaderName } = require_util2();
    function urlEquals(A, B, excludeFragment = false) {
      const serializedA = URLSerializer(A, excludeFragment);
      const serializedB = URLSerializer(B, excludeFragment);
      return serializedA === serializedB;
    }
    __name(urlEquals, "urlEquals");
    function getFieldValues(header) {
      assert(header !== null);
      const values = [];
      for (let value of header.split(",")) {
        value = value.trim();
        if (isValidHeaderName(value)) {
          values.push(value);
        }
      }
      return values;
    }
    __name(getFieldValues, "getFieldValues");
    module2.exports = {
      urlEquals,
      getFieldValues
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/cache.js
var require_cache = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/cache.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kConstruct } = require_symbols4();
    var { urlEquals, getFieldValues } = require_util5();
    var { kEnumerableProperty, isDisturbed } = require_util();
    var { webidl } = require_webidl();
    var { Response: Response2, cloneResponse, fromInnerResponse: fromInnerResponse2 } = require_response();
    var { Request: Request2, fromInnerRequest } = require_request();
    var { kState } = require_symbols2();
    var { fetching } = require_fetch();
    var { urlIsHttpHttpsScheme, createDeferredPromise, readAllBytes } = require_util2();
    var assert = require("assert");
    var _relevantRequestResponseList, _batchCacheOperations, batchCacheOperations_fn, _queryCache, queryCache_fn, _requestMatchesCachedItem, requestMatchesCachedItem_fn, _internalMatchAll, internalMatchAll_fn;
    var _Cache = class _Cache {
      constructor() {
        /**
         * @see https://w3c.github.io/ServiceWorker/#batch-cache-operations-algorithm
         * @param {CacheBatchOperation[]} operations
         * @returns {requestResponseList}
         */
        __privateAdd(this, _batchCacheOperations);
        /**
         * @see https://w3c.github.io/ServiceWorker/#query-cache
         * @param {any} requestQuery
         * @param {import('../../types/cache').CacheQueryOptions} options
         * @param {requestResponseList} targetStorage
         * @returns {requestResponseList}
         */
        __privateAdd(this, _queryCache);
        /**
         * @see https://w3c.github.io/ServiceWorker/#request-matches-cached-item-algorithm
         * @param {any} requestQuery
         * @param {any} request
         * @param {any | null} response
         * @param {import('../../types/cache').CacheQueryOptions | undefined} options
         * @returns {boolean}
         */
        __privateAdd(this, _requestMatchesCachedItem);
        __privateAdd(this, _internalMatchAll);
        /**
         * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-request-response-list
         * @type {requestResponseList}
         */
        __privateAdd(this, _relevantRequestResponseList, void 0);
        if (arguments[0] !== kConstruct) {
          webidl.illegalConstructor();
        }
        webidl.util.markAsUncloneable(this);
        __privateSet(this, _relevantRequestResponseList, arguments[1]);
      }
      async match(request, options = {}) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.match";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        request = webidl.converters.RequestInfo(request, prefix, "request");
        options = webidl.converters.CacheQueryOptions(options, prefix, "options");
        const p = __privateMethod(this, _internalMatchAll, internalMatchAll_fn).call(this, request, options, 1);
        if (p.length === 0) {
          return;
        }
        return p[0];
      }
      async matchAll(request = void 0, options = {}) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.matchAll";
        if (request !== void 0)
          request = webidl.converters.RequestInfo(request, prefix, "request");
        options = webidl.converters.CacheQueryOptions(options, prefix, "options");
        return __privateMethod(this, _internalMatchAll, internalMatchAll_fn).call(this, request, options);
      }
      async add(request) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.add";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        request = webidl.converters.RequestInfo(request, prefix, "request");
        const requests = [request];
        const responseArrayPromise = this.addAll(requests);
        return await responseArrayPromise;
      }
      async addAll(requests) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.addAll";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        const responsePromises = [];
        const requestList = [];
        for (let request of requests) {
          if (request === void 0) {
            throw webidl.errors.conversionFailed({
              prefix,
              argument: "Argument 1",
              types: ["undefined is not allowed"]
            });
          }
          request = webidl.converters.RequestInfo(request);
          if (typeof request === "string") {
            continue;
          }
          const r = request[kState];
          if (!urlIsHttpHttpsScheme(r.url) || r.method !== "GET") {
            throw webidl.errors.exception({
              header: prefix,
              message: "Expected http/s scheme when method is not GET."
            });
          }
        }
        const fetchControllers = [];
        for (const request of requests) {
          const r = new Request2(request)[kState];
          if (!urlIsHttpHttpsScheme(r.url)) {
            throw webidl.errors.exception({
              header: prefix,
              message: "Expected http/s scheme."
            });
          }
          r.initiator = "fetch";
          r.destination = "subresource";
          requestList.push(r);
          const responsePromise = createDeferredPromise();
          fetchControllers.push(fetching({
            request: r,
            processResponse(response) {
              if (response.type === "error" || response.status === 206 || response.status < 200 || response.status > 299) {
                responsePromise.reject(webidl.errors.exception({
                  header: "Cache.addAll",
                  message: "Received an invalid status code or the request failed."
                }));
              } else if (response.headersList.contains("vary")) {
                const fieldValues = getFieldValues(response.headersList.get("vary"));
                for (const fieldValue of fieldValues) {
                  if (fieldValue === "*") {
                    responsePromise.reject(webidl.errors.exception({
                      header: "Cache.addAll",
                      message: "invalid vary field value"
                    }));
                    for (const controller of fetchControllers) {
                      controller.abort();
                    }
                    return;
                  }
                }
              }
            },
            processResponseEndOfBody(response) {
              if (response.aborted) {
                responsePromise.reject(new DOMException("aborted", "AbortError"));
                return;
              }
              responsePromise.resolve(response);
            }
          }));
          responsePromises.push(responsePromise.promise);
        }
        const p = Promise.all(responsePromises);
        const responses = await p;
        const operations = [];
        let index = 0;
        for (const response of responses) {
          const operation = {
            type: "put",
            // 7.3.2
            request: requestList[index],
            // 7.3.3
            response
            // 7.3.4
          };
          operations.push(operation);
          index++;
        }
        const cacheJobPromise = createDeferredPromise();
        let errorData = null;
        try {
          __privateMethod(this, _batchCacheOperations, batchCacheOperations_fn).call(this, operations);
        } catch (e) {
          errorData = e;
        }
        queueMicrotask(() => {
          if (errorData === null) {
            cacheJobPromise.resolve(void 0);
          } else {
            cacheJobPromise.reject(errorData);
          }
        });
        return cacheJobPromise.promise;
      }
      async put(request, response) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.put";
        webidl.argumentLengthCheck(arguments, 2, prefix);
        request = webidl.converters.RequestInfo(request, prefix, "request");
        response = webidl.converters.Response(response, prefix, "response");
        let innerRequest = null;
        if (request instanceof Request2) {
          innerRequest = request[kState];
        } else {
          innerRequest = new Request2(request)[kState];
        }
        if (!urlIsHttpHttpsScheme(innerRequest.url) || innerRequest.method !== "GET") {
          throw webidl.errors.exception({
            header: prefix,
            message: "Expected an http/s scheme when method is not GET"
          });
        }
        const innerResponse = response[kState];
        if (innerResponse.status === 206) {
          throw webidl.errors.exception({
            header: prefix,
            message: "Got 206 status"
          });
        }
        if (innerResponse.headersList.contains("vary")) {
          const fieldValues = getFieldValues(innerResponse.headersList.get("vary"));
          for (const fieldValue of fieldValues) {
            if (fieldValue === "*") {
              throw webidl.errors.exception({
                header: prefix,
                message: "Got * vary field value"
              });
            }
          }
        }
        if (innerResponse.body && (isDisturbed(innerResponse.body.stream) || innerResponse.body.stream.locked)) {
          throw webidl.errors.exception({
            header: prefix,
            message: "Response body is locked or disturbed"
          });
        }
        const clonedResponse = cloneResponse(innerResponse);
        const bodyReadPromise = createDeferredPromise();
        if (innerResponse.body != null) {
          const stream = innerResponse.body.stream;
          const reader = stream.getReader();
          readAllBytes(reader).then(bodyReadPromise.resolve, bodyReadPromise.reject);
        } else {
          bodyReadPromise.resolve(void 0);
        }
        const operations = [];
        const operation = {
          type: "put",
          // 14.
          request: innerRequest,
          // 15.
          response: clonedResponse
          // 16.
        };
        operations.push(operation);
        const bytes = await bodyReadPromise.promise;
        if (clonedResponse.body != null) {
          clonedResponse.body.source = bytes;
        }
        const cacheJobPromise = createDeferredPromise();
        let errorData = null;
        try {
          __privateMethod(this, _batchCacheOperations, batchCacheOperations_fn).call(this, operations);
        } catch (e) {
          errorData = e;
        }
        queueMicrotask(() => {
          if (errorData === null) {
            cacheJobPromise.resolve();
          } else {
            cacheJobPromise.reject(errorData);
          }
        });
        return cacheJobPromise.promise;
      }
      async delete(request, options = {}) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.delete";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        request = webidl.converters.RequestInfo(request, prefix, "request");
        options = webidl.converters.CacheQueryOptions(options, prefix, "options");
        let r = null;
        if (request instanceof Request2) {
          r = request[kState];
          if (r.method !== "GET" && !options.ignoreMethod) {
            return false;
          }
        } else {
          assert(typeof request === "string");
          r = new Request2(request)[kState];
        }
        const operations = [];
        const operation = {
          type: "delete",
          request: r,
          options
        };
        operations.push(operation);
        const cacheJobPromise = createDeferredPromise();
        let errorData = null;
        let requestResponses;
        try {
          requestResponses = __privateMethod(this, _batchCacheOperations, batchCacheOperations_fn).call(this, operations);
        } catch (e) {
          errorData = e;
        }
        queueMicrotask(() => {
          if (errorData === null) {
            cacheJobPromise.resolve(!!requestResponses?.length);
          } else {
            cacheJobPromise.reject(errorData);
          }
        });
        return cacheJobPromise.promise;
      }
      /**
       * @see https://w3c.github.io/ServiceWorker/#dom-cache-keys
       * @param {any} request
       * @param {import('../../types/cache').CacheQueryOptions} options
       * @returns {Promise<readonly Request[]>}
       */
      async keys(request = void 0, options = {}) {
        webidl.brandCheck(this, _Cache);
        const prefix = "Cache.keys";
        if (request !== void 0)
          request = webidl.converters.RequestInfo(request, prefix, "request");
        options = webidl.converters.CacheQueryOptions(options, prefix, "options");
        let r = null;
        if (request !== void 0) {
          if (request instanceof Request2) {
            r = request[kState];
            if (r.method !== "GET" && !options.ignoreMethod) {
              return [];
            }
          } else if (typeof request === "string") {
            r = new Request2(request)[kState];
          }
        }
        const promise = createDeferredPromise();
        const requests = [];
        if (request === void 0) {
          for (const requestResponse of __privateGet(this, _relevantRequestResponseList)) {
            requests.push(requestResponse[0]);
          }
        } else {
          const requestResponses = __privateMethod(this, _queryCache, queryCache_fn).call(this, r, options);
          for (const requestResponse of requestResponses) {
            requests.push(requestResponse[0]);
          }
        }
        queueMicrotask(() => {
          const requestList = [];
          for (const request2 of requests) {
            const requestObject = fromInnerRequest(
              request2,
              new AbortController().signal,
              "immutable"
            );
            requestList.push(requestObject);
          }
          promise.resolve(Object.freeze(requestList));
        });
        return promise.promise;
      }
    };
    _relevantRequestResponseList = new WeakMap();
    _batchCacheOperations = new WeakSet();
    batchCacheOperations_fn = /* @__PURE__ */ __name(function(operations) {
      const cache = __privateGet(this, _relevantRequestResponseList);
      const backupCache = [...cache];
      const addedItems = [];
      const resultList = [];
      try {
        for (const operation of operations) {
          if (operation.type !== "delete" && operation.type !== "put") {
            throw webidl.errors.exception({
              header: "Cache.#batchCacheOperations",
              message: 'operation type does not match "delete" or "put"'
            });
          }
          if (operation.type === "delete" && operation.response != null) {
            throw webidl.errors.exception({
              header: "Cache.#batchCacheOperations",
              message: "delete operation should not have an associated response"
            });
          }
          if (__privateMethod(this, _queryCache, queryCache_fn).call(this, operation.request, operation.options, addedItems).length) {
            throw new DOMException("???", "InvalidStateError");
          }
          let requestResponses;
          if (operation.type === "delete") {
            requestResponses = __privateMethod(this, _queryCache, queryCache_fn).call(this, operation.request, operation.options);
            if (requestResponses.length === 0) {
              return [];
            }
            for (const requestResponse of requestResponses) {
              const idx = cache.indexOf(requestResponse);
              assert(idx !== -1);
              cache.splice(idx, 1);
            }
          } else if (operation.type === "put") {
            if (operation.response == null) {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "put operation should have an associated response"
              });
            }
            const r = operation.request;
            if (!urlIsHttpHttpsScheme(r.url)) {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "expected http or https scheme"
              });
            }
            if (r.method !== "GET") {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "not get method"
              });
            }
            if (operation.options != null) {
              throw webidl.errors.exception({
                header: "Cache.#batchCacheOperations",
                message: "options must not be defined"
              });
            }
            requestResponses = __privateMethod(this, _queryCache, queryCache_fn).call(this, operation.request);
            for (const requestResponse of requestResponses) {
              const idx = cache.indexOf(requestResponse);
              assert(idx !== -1);
              cache.splice(idx, 1);
            }
            cache.push([operation.request, operation.response]);
            addedItems.push([operation.request, operation.response]);
          }
          resultList.push([operation.request, operation.response]);
        }
        return resultList;
      } catch (e) {
        __privateGet(this, _relevantRequestResponseList).length = 0;
        __privateSet(this, _relevantRequestResponseList, backupCache);
        throw e;
      }
    }, "#batchCacheOperations");
    _queryCache = new WeakSet();
    queryCache_fn = /* @__PURE__ */ __name(function(requestQuery, options, targetStorage) {
      const resultList = [];
      const storage = targetStorage ?? __privateGet(this, _relevantRequestResponseList);
      for (const requestResponse of storage) {
        const [cachedRequest, cachedResponse] = requestResponse;
        if (__privateMethod(this, _requestMatchesCachedItem, requestMatchesCachedItem_fn).call(this, requestQuery, cachedRequest, cachedResponse, options)) {
          resultList.push(requestResponse);
        }
      }
      return resultList;
    }, "#queryCache");
    _requestMatchesCachedItem = new WeakSet();
    requestMatchesCachedItem_fn = /* @__PURE__ */ __name(function(requestQuery, request, response = null, options) {
      const queryURL = new URL(requestQuery.url);
      const cachedURL = new URL(request.url);
      if (options?.ignoreSearch) {
        cachedURL.search = "";
        queryURL.search = "";
      }
      if (!urlEquals(queryURL, cachedURL, true)) {
        return false;
      }
      if (response == null || options?.ignoreVary || !response.headersList.contains("vary")) {
        return true;
      }
      const fieldValues = getFieldValues(response.headersList.get("vary"));
      for (const fieldValue of fieldValues) {
        if (fieldValue === "*") {
          return false;
        }
        const requestValue = request.headersList.get(fieldValue);
        const queryValue = requestQuery.headersList.get(fieldValue);
        if (requestValue !== queryValue) {
          return false;
        }
      }
      return true;
    }, "#requestMatchesCachedItem");
    _internalMatchAll = new WeakSet();
    internalMatchAll_fn = /* @__PURE__ */ __name(function(request, options, maxResponses = Infinity) {
      let r = null;
      if (request !== void 0) {
        if (request instanceof Request2) {
          r = request[kState];
          if (r.method !== "GET" && !options.ignoreMethod) {
            return [];
          }
        } else if (typeof request === "string") {
          r = new Request2(request)[kState];
        }
      }
      const responses = [];
      if (request === void 0) {
        for (const requestResponse of __privateGet(this, _relevantRequestResponseList)) {
          responses.push(requestResponse[1]);
        }
      } else {
        const requestResponses = __privateMethod(this, _queryCache, queryCache_fn).call(this, r, options);
        for (const requestResponse of requestResponses) {
          responses.push(requestResponse[1]);
        }
      }
      const responseList = [];
      for (const response of responses) {
        const responseObject = fromInnerResponse2(response, "immutable");
        responseList.push(responseObject.clone());
        if (responseList.length >= maxResponses) {
          break;
        }
      }
      return Object.freeze(responseList);
    }, "#internalMatchAll");
    __name(_Cache, "Cache");
    var Cache = _Cache;
    Object.defineProperties(Cache.prototype, {
      [Symbol.toStringTag]: {
        value: "Cache",
        configurable: true
      },
      match: kEnumerableProperty,
      matchAll: kEnumerableProperty,
      add: kEnumerableProperty,
      addAll: kEnumerableProperty,
      put: kEnumerableProperty,
      delete: kEnumerableProperty,
      keys: kEnumerableProperty
    });
    var cacheQueryOptionConverters = [
      {
        key: "ignoreSearch",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "ignoreMethod",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "ignoreVary",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      }
    ];
    webidl.converters.CacheQueryOptions = webidl.dictionaryConverter(cacheQueryOptionConverters);
    webidl.converters.MultiCacheQueryOptions = webidl.dictionaryConverter([
      ...cacheQueryOptionConverters,
      {
        key: "cacheName",
        converter: webidl.converters.DOMString
      }
    ]);
    webidl.converters.Response = webidl.interfaceConverter(Response2);
    webidl.converters["sequence<RequestInfo>"] = webidl.sequenceConverter(
      webidl.converters.RequestInfo
    );
    module2.exports = {
      Cache
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/cachestorage.js
var require_cachestorage = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cache/cachestorage.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kConstruct } = require_symbols4();
    var { Cache } = require_cache();
    var { webidl } = require_webidl();
    var { kEnumerableProperty } = require_util();
    var _caches;
    var _CacheStorage = class _CacheStorage {
      constructor() {
        /**
         * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-name-to-cache-map
         * @type {Map<string, import('./cache').requestResponseList}
         */
        __privateAdd(this, _caches, /* @__PURE__ */ new Map());
        if (arguments[0] !== kConstruct) {
          webidl.illegalConstructor();
        }
        webidl.util.markAsUncloneable(this);
      }
      async match(request, options = {}) {
        webidl.brandCheck(this, _CacheStorage);
        webidl.argumentLengthCheck(arguments, 1, "CacheStorage.match");
        request = webidl.converters.RequestInfo(request);
        options = webidl.converters.MultiCacheQueryOptions(options);
        if (options.cacheName != null) {
          if (__privateGet(this, _caches).has(options.cacheName)) {
            const cacheList = __privateGet(this, _caches).get(options.cacheName);
            const cache = new Cache(kConstruct, cacheList);
            return await cache.match(request, options);
          }
        } else {
          for (const cacheList of __privateGet(this, _caches).values()) {
            const cache = new Cache(kConstruct, cacheList);
            const response = await cache.match(request, options);
            if (response !== void 0) {
              return response;
            }
          }
        }
      }
      /**
       * @see https://w3c.github.io/ServiceWorker/#cache-storage-has
       * @param {string} cacheName
       * @returns {Promise<boolean>}
       */
      async has(cacheName) {
        webidl.brandCheck(this, _CacheStorage);
        const prefix = "CacheStorage.has";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
        return __privateGet(this, _caches).has(cacheName);
      }
      /**
       * @see https://w3c.github.io/ServiceWorker/#dom-cachestorage-open
       * @param {string} cacheName
       * @returns {Promise<Cache>}
       */
      async open(cacheName) {
        webidl.brandCheck(this, _CacheStorage);
        const prefix = "CacheStorage.open";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
        if (__privateGet(this, _caches).has(cacheName)) {
          const cache2 = __privateGet(this, _caches).get(cacheName);
          return new Cache(kConstruct, cache2);
        }
        const cache = [];
        __privateGet(this, _caches).set(cacheName, cache);
        return new Cache(kConstruct, cache);
      }
      /**
       * @see https://w3c.github.io/ServiceWorker/#cache-storage-delete
       * @param {string} cacheName
       * @returns {Promise<boolean>}
       */
      async delete(cacheName) {
        webidl.brandCheck(this, _CacheStorage);
        const prefix = "CacheStorage.delete";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        cacheName = webidl.converters.DOMString(cacheName, prefix, "cacheName");
        return __privateGet(this, _caches).delete(cacheName);
      }
      /**
       * @see https://w3c.github.io/ServiceWorker/#cache-storage-keys
       * @returns {Promise<string[]>}
       */
      async keys() {
        webidl.brandCheck(this, _CacheStorage);
        const keys = __privateGet(this, _caches).keys();
        return [...keys];
      }
    };
    _caches = new WeakMap();
    __name(_CacheStorage, "CacheStorage");
    var CacheStorage = _CacheStorage;
    Object.defineProperties(CacheStorage.prototype, {
      [Symbol.toStringTag]: {
        value: "CacheStorage",
        configurable: true
      },
      match: kEnumerableProperty,
      has: kEnumerableProperty,
      open: kEnumerableProperty,
      delete: kEnumerableProperty,
      keys: kEnumerableProperty
    });
    module2.exports = {
      CacheStorage
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/constants.js
var require_constants4 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/constants.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var maxAttributeValueSize = 1024;
    var maxNameValuePairSize = 4096;
    module2.exports = {
      maxAttributeValueSize,
      maxNameValuePairSize
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/util.js
var require_util6 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    function isCTLExcludingHtab(value) {
      for (let i = 0; i < value.length; ++i) {
        const code = value.charCodeAt(i);
        if (code >= 0 && code <= 8 || code >= 10 && code <= 31 || code === 127) {
          return true;
        }
      }
      return false;
    }
    __name(isCTLExcludingHtab, "isCTLExcludingHtab");
    function validateCookieName(name) {
      for (let i = 0; i < name.length; ++i) {
        const code = name.charCodeAt(i);
        if (code < 33 || // exclude CTLs (0-31), SP and HT
        code > 126 || // exclude non-ascii and DEL
        code === 34 || // "
        code === 40 || // (
        code === 41 || // )
        code === 60 || // <
        code === 62 || // >
        code === 64 || // @
        code === 44 || // ,
        code === 59 || // ;
        code === 58 || // :
        code === 92 || // \
        code === 47 || // /
        code === 91 || // [
        code === 93 || // ]
        code === 63 || // ?
        code === 61 || // =
        code === 123 || // {
        code === 125) {
          throw new Error("Invalid cookie name");
        }
      }
    }
    __name(validateCookieName, "validateCookieName");
    function validateCookieValue(value) {
      let len = value.length;
      let i = 0;
      if (value[0] === '"') {
        if (len === 1 || value[len - 1] !== '"') {
          throw new Error("Invalid cookie value");
        }
        --len;
        ++i;
      }
      while (i < len) {
        const code = value.charCodeAt(i++);
        if (code < 33 || // exclude CTLs (0-31)
        code > 126 || // non-ascii and DEL (127)
        code === 34 || // "
        code === 44 || // ,
        code === 59 || // ;
        code === 92) {
          throw new Error("Invalid cookie value");
        }
      }
    }
    __name(validateCookieValue, "validateCookieValue");
    function validateCookiePath(path) {
      for (let i = 0; i < path.length; ++i) {
        const code = path.charCodeAt(i);
        if (code < 32 || // exclude CTLs (0-31)
        code === 127 || // DEL
        code === 59) {
          throw new Error("Invalid cookie path");
        }
      }
    }
    __name(validateCookiePath, "validateCookiePath");
    function validateCookieDomain(domain) {
      if (domain.startsWith("-") || domain.endsWith(".") || domain.endsWith("-")) {
        throw new Error("Invalid cookie domain");
      }
    }
    __name(validateCookieDomain, "validateCookieDomain");
    var IMFDays = [
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat"
    ];
    var IMFMonths = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    var IMFPaddedNumbers = Array(61).fill(0).map((_, i) => i.toString().padStart(2, "0"));
    function toIMFDate(date) {
      if (typeof date === "number") {
        date = new Date(date);
      }
      return `${IMFDays[date.getUTCDay()]}, ${IMFPaddedNumbers[date.getUTCDate()]} ${IMFMonths[date.getUTCMonth()]} ${date.getUTCFullYear()} ${IMFPaddedNumbers[date.getUTCHours()]}:${IMFPaddedNumbers[date.getUTCMinutes()]}:${IMFPaddedNumbers[date.getUTCSeconds()]} GMT`;
    }
    __name(toIMFDate, "toIMFDate");
    function validateCookieMaxAge(maxAge) {
      if (maxAge < 0) {
        throw new Error("Invalid cookie max-age");
      }
    }
    __name(validateCookieMaxAge, "validateCookieMaxAge");
    function stringify(cookie) {
      if (cookie.name.length === 0) {
        return null;
      }
      validateCookieName(cookie.name);
      validateCookieValue(cookie.value);
      const out = [`${cookie.name}=${cookie.value}`];
      if (cookie.name.startsWith("__Secure-")) {
        cookie.secure = true;
      }
      if (cookie.name.startsWith("__Host-")) {
        cookie.secure = true;
        cookie.domain = null;
        cookie.path = "/";
      }
      if (cookie.secure) {
        out.push("Secure");
      }
      if (cookie.httpOnly) {
        out.push("HttpOnly");
      }
      if (typeof cookie.maxAge === "number") {
        validateCookieMaxAge(cookie.maxAge);
        out.push(`Max-Age=${cookie.maxAge}`);
      }
      if (cookie.domain) {
        validateCookieDomain(cookie.domain);
        out.push(`Domain=${cookie.domain}`);
      }
      if (cookie.path) {
        validateCookiePath(cookie.path);
        out.push(`Path=${cookie.path}`);
      }
      if (cookie.expires && cookie.expires.toString() !== "Invalid Date") {
        out.push(`Expires=${toIMFDate(cookie.expires)}`);
      }
      if (cookie.sameSite) {
        out.push(`SameSite=${cookie.sameSite}`);
      }
      for (const part of cookie.unparsed) {
        if (!part.includes("=")) {
          throw new Error("Invalid unparsed");
        }
        const [key, ...value] = part.split("=");
        out.push(`${key.trim()}=${value.join("=")}`);
      }
      return out.join("; ");
    }
    __name(stringify, "stringify");
    module2.exports = {
      isCTLExcludingHtab,
      validateCookieName,
      validateCookiePath,
      validateCookieValue,
      toIMFDate,
      stringify
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/parse.js
var require_parse = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/parse.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { maxNameValuePairSize, maxAttributeValueSize } = require_constants4();
    var { isCTLExcludingHtab } = require_util6();
    var { collectASequenceOfCodePointsFast } = require_data_url();
    var assert = require("assert");
    function parseSetCookie(header) {
      if (isCTLExcludingHtab(header)) {
        return null;
      }
      let nameValuePair = "";
      let unparsedAttributes = "";
      let name = "";
      let value = "";
      if (header.includes(";")) {
        const position = { position: 0 };
        nameValuePair = collectASequenceOfCodePointsFast(";", header, position);
        unparsedAttributes = header.slice(position.position);
      } else {
        nameValuePair = header;
      }
      if (!nameValuePair.includes("=")) {
        value = nameValuePair;
      } else {
        const position = { position: 0 };
        name = collectASequenceOfCodePointsFast(
          "=",
          nameValuePair,
          position
        );
        value = nameValuePair.slice(position.position + 1);
      }
      name = name.trim();
      value = value.trim();
      if (name.length + value.length > maxNameValuePairSize) {
        return null;
      }
      return {
        name,
        value,
        ...parseUnparsedAttributes(unparsedAttributes)
      };
    }
    __name(parseSetCookie, "parseSetCookie");
    function parseUnparsedAttributes(unparsedAttributes, cookieAttributeList = {}) {
      if (unparsedAttributes.length === 0) {
        return cookieAttributeList;
      }
      assert(unparsedAttributes[0] === ";");
      unparsedAttributes = unparsedAttributes.slice(1);
      let cookieAv = "";
      if (unparsedAttributes.includes(";")) {
        cookieAv = collectASequenceOfCodePointsFast(
          ";",
          unparsedAttributes,
          { position: 0 }
        );
        unparsedAttributes = unparsedAttributes.slice(cookieAv.length);
      } else {
        cookieAv = unparsedAttributes;
        unparsedAttributes = "";
      }
      let attributeName = "";
      let attributeValue = "";
      if (cookieAv.includes("=")) {
        const position = { position: 0 };
        attributeName = collectASequenceOfCodePointsFast(
          "=",
          cookieAv,
          position
        );
        attributeValue = cookieAv.slice(position.position + 1);
      } else {
        attributeName = cookieAv;
      }
      attributeName = attributeName.trim();
      attributeValue = attributeValue.trim();
      if (attributeValue.length > maxAttributeValueSize) {
        return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
      }
      const attributeNameLowercase = attributeName.toLowerCase();
      if (attributeNameLowercase === "expires") {
        const expiryTime = new Date(attributeValue);
        cookieAttributeList.expires = expiryTime;
      } else if (attributeNameLowercase === "max-age") {
        const charCode = attributeValue.charCodeAt(0);
        if ((charCode < 48 || charCode > 57) && attributeValue[0] !== "-") {
          return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
        }
        if (!/^\d+$/.test(attributeValue)) {
          return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
        }
        const deltaSeconds = Number(attributeValue);
        cookieAttributeList.maxAge = deltaSeconds;
      } else if (attributeNameLowercase === "domain") {
        let cookieDomain = attributeValue;
        if (cookieDomain[0] === ".") {
          cookieDomain = cookieDomain.slice(1);
        }
        cookieDomain = cookieDomain.toLowerCase();
        cookieAttributeList.domain = cookieDomain;
      } else if (attributeNameLowercase === "path") {
        let cookiePath = "";
        if (attributeValue.length === 0 || attributeValue[0] !== "/") {
          cookiePath = "/";
        } else {
          cookiePath = attributeValue;
        }
        cookieAttributeList.path = cookiePath;
      } else if (attributeNameLowercase === "secure") {
        cookieAttributeList.secure = true;
      } else if (attributeNameLowercase === "httponly") {
        cookieAttributeList.httpOnly = true;
      } else if (attributeNameLowercase === "samesite") {
        let enforcement = "Default";
        const attributeValueLowercase = attributeValue.toLowerCase();
        if (attributeValueLowercase.includes("none")) {
          enforcement = "None";
        }
        if (attributeValueLowercase.includes("strict")) {
          enforcement = "Strict";
        }
        if (attributeValueLowercase.includes("lax")) {
          enforcement = "Lax";
        }
        cookieAttributeList.sameSite = enforcement;
      } else {
        cookieAttributeList.unparsed ??= [];
        cookieAttributeList.unparsed.push(`${attributeName}=${attributeValue}`);
      }
      return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList);
    }
    __name(parseUnparsedAttributes, "parseUnparsedAttributes");
    module2.exports = {
      parseSetCookie,
      parseUnparsedAttributes
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/index.js
var require_cookies = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/cookies/index.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { parseSetCookie } = require_parse();
    var { stringify } = require_util6();
    var { webidl } = require_webidl();
    var { Headers: Headers2 } = require_headers();
    function getCookies(headers) {
      webidl.argumentLengthCheck(arguments, 1, "getCookies");
      webidl.brandCheck(headers, Headers2, { strict: false });
      const cookie = headers.get("cookie");
      const out = {};
      if (!cookie) {
        return out;
      }
      for (const piece of cookie.split(";")) {
        const [name, ...value] = piece.split("=");
        out[name.trim()] = value.join("=");
      }
      return out;
    }
    __name(getCookies, "getCookies");
    function deleteCookie(headers, name, attributes) {
      webidl.brandCheck(headers, Headers2, { strict: false });
      const prefix = "deleteCookie";
      webidl.argumentLengthCheck(arguments, 2, prefix);
      name = webidl.converters.DOMString(name, prefix, "name");
      attributes = webidl.converters.DeleteCookieAttributes(attributes);
      setCookie(headers, {
        name,
        value: "",
        expires: /* @__PURE__ */ new Date(0),
        ...attributes
      });
    }
    __name(deleteCookie, "deleteCookie");
    function getSetCookies(headers) {
      webidl.argumentLengthCheck(arguments, 1, "getSetCookies");
      webidl.brandCheck(headers, Headers2, { strict: false });
      const cookies = headers.getSetCookie();
      if (!cookies) {
        return [];
      }
      return cookies.map((pair) => parseSetCookie(pair));
    }
    __name(getSetCookies, "getSetCookies");
    function setCookie(headers, cookie) {
      webidl.argumentLengthCheck(arguments, 2, "setCookie");
      webidl.brandCheck(headers, Headers2, { strict: false });
      cookie = webidl.converters.Cookie(cookie);
      const str = stringify(cookie);
      if (str) {
        headers.append("Set-Cookie", str);
      }
    }
    __name(setCookie, "setCookie");
    webidl.converters.DeleteCookieAttributes = webidl.dictionaryConverter([
      {
        converter: webidl.nullableConverter(webidl.converters.DOMString),
        key: "path",
        defaultValue: () => null
      },
      {
        converter: webidl.nullableConverter(webidl.converters.DOMString),
        key: "domain",
        defaultValue: () => null
      }
    ]);
    webidl.converters.Cookie = webidl.dictionaryConverter([
      {
        converter: webidl.converters.DOMString,
        key: "name"
      },
      {
        converter: webidl.converters.DOMString,
        key: "value"
      },
      {
        converter: webidl.nullableConverter((value) => {
          if (typeof value === "number") {
            return webidl.converters["unsigned long long"](value);
          }
          return new Date(value);
        }),
        key: "expires",
        defaultValue: () => null
      },
      {
        converter: webidl.nullableConverter(webidl.converters["long long"]),
        key: "maxAge",
        defaultValue: () => null
      },
      {
        converter: webidl.nullableConverter(webidl.converters.DOMString),
        key: "domain",
        defaultValue: () => null
      },
      {
        converter: webidl.nullableConverter(webidl.converters.DOMString),
        key: "path",
        defaultValue: () => null
      },
      {
        converter: webidl.nullableConverter(webidl.converters.boolean),
        key: "secure",
        defaultValue: () => null
      },
      {
        converter: webidl.nullableConverter(webidl.converters.boolean),
        key: "httpOnly",
        defaultValue: () => null
      },
      {
        converter: webidl.converters.USVString,
        key: "sameSite",
        allowedValues: ["Strict", "Lax", "None"]
      },
      {
        converter: webidl.sequenceConverter(webidl.converters.DOMString),
        key: "unparsed",
        defaultValue: () => new Array(0)
      }
    ]);
    module2.exports = {
      getCookies,
      deleteCookie,
      getSetCookies,
      setCookie
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/events.js
var require_events = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/events.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { webidl } = require_webidl();
    var { kEnumerableProperty } = require_util();
    var { kConstruct } = require_symbols();
    var { MessagePort } = require("worker_threads");
    var _eventInit;
    var _MessageEvent = class _MessageEvent extends Event {
      constructor(type, eventInitDict = {}) {
        var __super = (...args) => {
          super(...args);
          __privateAdd(this, _eventInit, void 0);
          return this;
        };
        if (type === kConstruct) {
          __super(arguments[1], arguments[2]);
          webidl.util.markAsUncloneable(this);
          return;
        }
        const prefix = "MessageEvent constructor";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        type = webidl.converters.DOMString(type, prefix, "type");
        eventInitDict = webidl.converters.MessageEventInit(eventInitDict, prefix, "eventInitDict");
        __super(type, eventInitDict);
        __privateSet(this, _eventInit, eventInitDict);
        webidl.util.markAsUncloneable(this);
      }
      get data() {
        webidl.brandCheck(this, _MessageEvent);
        return __privateGet(this, _eventInit).data;
      }
      get origin() {
        webidl.brandCheck(this, _MessageEvent);
        return __privateGet(this, _eventInit).origin;
      }
      get lastEventId() {
        webidl.brandCheck(this, _MessageEvent);
        return __privateGet(this, _eventInit).lastEventId;
      }
      get source() {
        webidl.brandCheck(this, _MessageEvent);
        return __privateGet(this, _eventInit).source;
      }
      get ports() {
        webidl.brandCheck(this, _MessageEvent);
        if (!Object.isFrozen(__privateGet(this, _eventInit).ports)) {
          Object.freeze(__privateGet(this, _eventInit).ports);
        }
        return __privateGet(this, _eventInit).ports;
      }
      initMessageEvent(type, bubbles = false, cancelable = false, data = null, origin = "", lastEventId = "", source = null, ports = []) {
        webidl.brandCheck(this, _MessageEvent);
        webidl.argumentLengthCheck(arguments, 1, "MessageEvent.initMessageEvent");
        return new _MessageEvent(type, {
          bubbles,
          cancelable,
          data,
          origin,
          lastEventId,
          source,
          ports
        });
      }
      static createFastMessageEvent(type, init) {
        const messageEvent = new _MessageEvent(kConstruct, type, init);
        __privateSet(messageEvent, _eventInit, init);
        __privateGet(messageEvent, _eventInit).data ??= null;
        __privateGet(messageEvent, _eventInit).origin ??= "";
        __privateGet(messageEvent, _eventInit).lastEventId ??= "";
        __privateGet(messageEvent, _eventInit).source ??= null;
        __privateGet(messageEvent, _eventInit).ports ??= [];
        return messageEvent;
      }
    };
    _eventInit = new WeakMap();
    __name(_MessageEvent, "MessageEvent");
    var MessageEvent = _MessageEvent;
    var { createFastMessageEvent } = MessageEvent;
    delete MessageEvent.createFastMessageEvent;
    var _eventInit2;
    var _CloseEvent = class _CloseEvent extends Event {
      constructor(type, eventInitDict = {}) {
        const prefix = "CloseEvent constructor";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        type = webidl.converters.DOMString(type, prefix, "type");
        eventInitDict = webidl.converters.CloseEventInit(eventInitDict);
        super(type, eventInitDict);
        __privateAdd(this, _eventInit2, void 0);
        __privateSet(this, _eventInit2, eventInitDict);
        webidl.util.markAsUncloneable(this);
      }
      get wasClean() {
        webidl.brandCheck(this, _CloseEvent);
        return __privateGet(this, _eventInit2).wasClean;
      }
      get code() {
        webidl.brandCheck(this, _CloseEvent);
        return __privateGet(this, _eventInit2).code;
      }
      get reason() {
        webidl.brandCheck(this, _CloseEvent);
        return __privateGet(this, _eventInit2).reason;
      }
    };
    _eventInit2 = new WeakMap();
    __name(_CloseEvent, "CloseEvent");
    var CloseEvent = _CloseEvent;
    var _eventInit3;
    var _ErrorEvent = class _ErrorEvent extends Event {
      constructor(type, eventInitDict) {
        const prefix = "ErrorEvent constructor";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        super(type, eventInitDict);
        __privateAdd(this, _eventInit3, void 0);
        webidl.util.markAsUncloneable(this);
        type = webidl.converters.DOMString(type, prefix, "type");
        eventInitDict = webidl.converters.ErrorEventInit(eventInitDict ?? {});
        __privateSet(this, _eventInit3, eventInitDict);
      }
      get message() {
        webidl.brandCheck(this, _ErrorEvent);
        return __privateGet(this, _eventInit3).message;
      }
      get filename() {
        webidl.brandCheck(this, _ErrorEvent);
        return __privateGet(this, _eventInit3).filename;
      }
      get lineno() {
        webidl.brandCheck(this, _ErrorEvent);
        return __privateGet(this, _eventInit3).lineno;
      }
      get colno() {
        webidl.brandCheck(this, _ErrorEvent);
        return __privateGet(this, _eventInit3).colno;
      }
      get error() {
        webidl.brandCheck(this, _ErrorEvent);
        return __privateGet(this, _eventInit3).error;
      }
    };
    _eventInit3 = new WeakMap();
    __name(_ErrorEvent, "ErrorEvent");
    var ErrorEvent = _ErrorEvent;
    Object.defineProperties(MessageEvent.prototype, {
      [Symbol.toStringTag]: {
        value: "MessageEvent",
        configurable: true
      },
      data: kEnumerableProperty,
      origin: kEnumerableProperty,
      lastEventId: kEnumerableProperty,
      source: kEnumerableProperty,
      ports: kEnumerableProperty,
      initMessageEvent: kEnumerableProperty
    });
    Object.defineProperties(CloseEvent.prototype, {
      [Symbol.toStringTag]: {
        value: "CloseEvent",
        configurable: true
      },
      reason: kEnumerableProperty,
      code: kEnumerableProperty,
      wasClean: kEnumerableProperty
    });
    Object.defineProperties(ErrorEvent.prototype, {
      [Symbol.toStringTag]: {
        value: "ErrorEvent",
        configurable: true
      },
      message: kEnumerableProperty,
      filename: kEnumerableProperty,
      lineno: kEnumerableProperty,
      colno: kEnumerableProperty,
      error: kEnumerableProperty
    });
    webidl.converters.MessagePort = webidl.interfaceConverter(MessagePort);
    webidl.converters["sequence<MessagePort>"] = webidl.sequenceConverter(
      webidl.converters.MessagePort
    );
    var eventInit = [
      {
        key: "bubbles",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "cancelable",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "composed",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      }
    ];
    webidl.converters.MessageEventInit = webidl.dictionaryConverter([
      ...eventInit,
      {
        key: "data",
        converter: webidl.converters.any,
        defaultValue: () => null
      },
      {
        key: "origin",
        converter: webidl.converters.USVString,
        defaultValue: () => ""
      },
      {
        key: "lastEventId",
        converter: webidl.converters.DOMString,
        defaultValue: () => ""
      },
      {
        key: "source",
        // Node doesn't implement WindowProxy or ServiceWorker, so the only
        // valid value for source is a MessagePort.
        converter: webidl.nullableConverter(webidl.converters.MessagePort),
        defaultValue: () => null
      },
      {
        key: "ports",
        converter: webidl.converters["sequence<MessagePort>"],
        defaultValue: () => new Array(0)
      }
    ]);
    webidl.converters.CloseEventInit = webidl.dictionaryConverter([
      ...eventInit,
      {
        key: "wasClean",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "code",
        converter: webidl.converters["unsigned short"],
        defaultValue: () => 0
      },
      {
        key: "reason",
        converter: webidl.converters.USVString,
        defaultValue: () => ""
      }
    ]);
    webidl.converters.ErrorEventInit = webidl.dictionaryConverter([
      ...eventInit,
      {
        key: "message",
        converter: webidl.converters.DOMString,
        defaultValue: () => ""
      },
      {
        key: "filename",
        converter: webidl.converters.USVString,
        defaultValue: () => ""
      },
      {
        key: "lineno",
        converter: webidl.converters["unsigned long"],
        defaultValue: () => 0
      },
      {
        key: "colno",
        converter: webidl.converters["unsigned long"],
        defaultValue: () => 0
      },
      {
        key: "error",
        converter: webidl.converters.any
      }
    ]);
    module2.exports = {
      MessageEvent,
      CloseEvent,
      ErrorEvent,
      createFastMessageEvent
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/constants.js
var require_constants5 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/constants.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var uid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    var staticPropertyDescriptors = {
      enumerable: true,
      writable: false,
      configurable: false
    };
    var states = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    };
    var sentCloseFrameState = {
      NOT_SENT: 0,
      PROCESSING: 1,
      SENT: 2
    };
    var opcodes = {
      CONTINUATION: 0,
      TEXT: 1,
      BINARY: 2,
      CLOSE: 8,
      PING: 9,
      PONG: 10
    };
    var maxUnsigned16Bit = 2 ** 16 - 1;
    var parserStates = {
      INFO: 0,
      PAYLOADLENGTH_16: 2,
      PAYLOADLENGTH_64: 3,
      READ_DATA: 4
    };
    var emptyBuffer = Buffer.allocUnsafe(0);
    var sendHints = {
      string: 1,
      typedArray: 2,
      arrayBuffer: 3,
      blob: 4
    };
    module2.exports = {
      uid,
      sentCloseFrameState,
      staticPropertyDescriptors,
      states,
      opcodes,
      maxUnsigned16Bit,
      parserStates,
      emptyBuffer,
      sendHints
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/symbols.js
var require_symbols5 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/symbols.js"(exports2, module2) {
    "use strict";
    init_define_process();
    module2.exports = {
      kWebSocketURL: Symbol("url"),
      kReadyState: Symbol("ready state"),
      kController: Symbol("controller"),
      kResponse: Symbol("response"),
      kBinaryType: Symbol("binary type"),
      kSentClose: Symbol("sent close"),
      kReceivedClose: Symbol("received close"),
      kByteParser: Symbol("byte parser")
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/util.js
var require_util7 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { kReadyState, kController, kResponse, kBinaryType, kWebSocketURL } = require_symbols5();
    var { states, opcodes } = require_constants5();
    var { ErrorEvent, createFastMessageEvent } = require_events();
    var { isUtf8 } = require("buffer");
    var { collectASequenceOfCodePointsFast, removeHTTPWhitespace } = require_data_url();
    function isConnecting(ws) {
      return ws[kReadyState] === states.CONNECTING;
    }
    __name(isConnecting, "isConnecting");
    function isEstablished(ws) {
      return ws[kReadyState] === states.OPEN;
    }
    __name(isEstablished, "isEstablished");
    function isClosing(ws) {
      return ws[kReadyState] === states.CLOSING;
    }
    __name(isClosing, "isClosing");
    function isClosed(ws) {
      return ws[kReadyState] === states.CLOSED;
    }
    __name(isClosed, "isClosed");
    function fireEvent(e, target, eventFactory = (type, init) => new Event(type, init), eventInitDict = {}) {
      const event = eventFactory(e, eventInitDict);
      target.dispatchEvent(event);
    }
    __name(fireEvent, "fireEvent");
    function websocketMessageReceived(ws, type, data) {
      if (ws[kReadyState] !== states.OPEN) {
        return;
      }
      let dataForEvent;
      if (type === opcodes.TEXT) {
        try {
          dataForEvent = utf8Decode(data);
        } catch {
          failWebsocketConnection(ws, "Received invalid UTF-8 in text frame.");
          return;
        }
      } else if (type === opcodes.BINARY) {
        if (ws[kBinaryType] === "blob") {
          dataForEvent = new Blob([data]);
        } else {
          dataForEvent = toArrayBuffer(data);
        }
      }
      fireEvent("message", ws, createFastMessageEvent, {
        origin: ws[kWebSocketURL].origin,
        data: dataForEvent
      });
    }
    __name(websocketMessageReceived, "websocketMessageReceived");
    function toArrayBuffer(buffer) {
      if (buffer.byteLength === buffer.buffer.byteLength) {
        return buffer.buffer;
      }
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    __name(toArrayBuffer, "toArrayBuffer");
    function isValidSubprotocol(protocol) {
      if (protocol.length === 0) {
        return false;
      }
      for (let i = 0; i < protocol.length; ++i) {
        const code = protocol.charCodeAt(i);
        if (code < 33 || // CTL, contains SP (0x20) and HT (0x09)
        code > 126 || code === 34 || // "
        code === 40 || // (
        code === 41 || // )
        code === 44 || // ,
        code === 47 || // /
        code === 58 || // :
        code === 59 || // ;
        code === 60 || // <
        code === 61 || // =
        code === 62 || // >
        code === 63 || // ?
        code === 64 || // @
        code === 91 || // [
        code === 92 || // \
        code === 93 || // ]
        code === 123 || // {
        code === 125) {
          return false;
        }
      }
      return true;
    }
    __name(isValidSubprotocol, "isValidSubprotocol");
    function isValidStatusCode(code) {
      if (code >= 1e3 && code < 1015) {
        return code !== 1004 && // reserved
        code !== 1005 && // "MUST NOT be set as a status code"
        code !== 1006;
      }
      return code >= 3e3 && code <= 4999;
    }
    __name(isValidStatusCode, "isValidStatusCode");
    function failWebsocketConnection(ws, reason) {
      const { [kController]: controller, [kResponse]: response } = ws;
      controller.abort();
      if (response?.socket && !response.socket.destroyed) {
        response.socket.destroy();
      }
      if (reason) {
        fireEvent("error", ws, (type, init) => new ErrorEvent(type, init), {
          error: new Error(reason),
          message: reason
        });
      }
    }
    __name(failWebsocketConnection, "failWebsocketConnection");
    function isControlFrame(opcode) {
      return opcode === opcodes.CLOSE || opcode === opcodes.PING || opcode === opcodes.PONG;
    }
    __name(isControlFrame, "isControlFrame");
    function isContinuationFrame(opcode) {
      return opcode === opcodes.CONTINUATION;
    }
    __name(isContinuationFrame, "isContinuationFrame");
    function isTextBinaryFrame(opcode) {
      return opcode === opcodes.TEXT || opcode === opcodes.BINARY;
    }
    __name(isTextBinaryFrame, "isTextBinaryFrame");
    function isValidOpcode(opcode) {
      return isTextBinaryFrame(opcode) || isContinuationFrame(opcode) || isControlFrame(opcode);
    }
    __name(isValidOpcode, "isValidOpcode");
    function parseExtensions(extensions) {
      const position = { position: 0 };
      const extensionList = /* @__PURE__ */ new Map();
      while (position.position < extensions.length) {
        const pair = collectASequenceOfCodePointsFast(";", extensions, position);
        const [name, value = ""] = pair.split("=");
        extensionList.set(
          removeHTTPWhitespace(name, true, false),
          removeHTTPWhitespace(value, false, true)
        );
        position.position++;
      }
      return extensionList;
    }
    __name(parseExtensions, "parseExtensions");
    function isValidClientWindowBits(value) {
      for (let i = 0; i < value.length; i++) {
        const byte = value.charCodeAt(i);
        if (byte < 48 || byte > 57) {
          return false;
        }
      }
      return true;
    }
    __name(isValidClientWindowBits, "isValidClientWindowBits");
    var hasIntl = typeof define_process_default.versions.icu === "string";
    var fatalDecoder = hasIntl ? new TextDecoder("utf-8", { fatal: true }) : void 0;
    var utf8Decode = hasIntl ? fatalDecoder.decode.bind(fatalDecoder) : function(buffer) {
      if (isUtf8(buffer)) {
        return buffer.toString("utf-8");
      }
      throw new TypeError("Invalid utf-8 received.");
    };
    module2.exports = {
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
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/frame.js
var require_frame = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/frame.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { maxUnsigned16Bit } = require_constants5();
    var BUFFER_SIZE = 16386;
    var crypto;
    var buffer = null;
    var bufIdx = BUFFER_SIZE;
    try {
      crypto = require("crypto");
    } catch {
      crypto = {
        // not full compatibility, but minimum.
        randomFillSync: /* @__PURE__ */ __name(function randomFillSync(buffer2, _offset, _size) {
          for (let i = 0; i < buffer2.length; ++i) {
            buffer2[i] = Math.random() * 255 | 0;
          }
          return buffer2;
        }, "randomFillSync")
      };
    }
    function generateMask() {
      if (bufIdx === BUFFER_SIZE) {
        bufIdx = 0;
        crypto.randomFillSync(buffer ??= Buffer.allocUnsafe(BUFFER_SIZE), 0, BUFFER_SIZE);
      }
      return [buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++], buffer[bufIdx++]];
    }
    __name(generateMask, "generateMask");
    var _WebsocketFrameSend = class _WebsocketFrameSend {
      /**
       * @param {Buffer|undefined} data
       */
      constructor(data) {
        this.frameData = data;
      }
      createFrame(opcode) {
        const frameData = this.frameData;
        const maskKey = generateMask();
        const bodyLength = frameData?.byteLength ?? 0;
        let payloadLength = bodyLength;
        let offset = 6;
        if (bodyLength > maxUnsigned16Bit) {
          offset += 8;
          payloadLength = 127;
        } else if (bodyLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const buffer2 = Buffer.allocUnsafe(bodyLength + offset);
        buffer2[0] = buffer2[1] = 0;
        buffer2[0] |= 128;
        buffer2[0] = (buffer2[0] & 240) + opcode;
        buffer2[offset - 4] = maskKey[0];
        buffer2[offset - 3] = maskKey[1];
        buffer2[offset - 2] = maskKey[2];
        buffer2[offset - 1] = maskKey[3];
        buffer2[1] = payloadLength;
        if (payloadLength === 126) {
          buffer2.writeUInt16BE(bodyLength, 2);
        } else if (payloadLength === 127) {
          buffer2[2] = buffer2[3] = 0;
          buffer2.writeUIntBE(bodyLength, 4, 6);
        }
        buffer2[1] |= 128;
        for (let i = 0; i < bodyLength; ++i) {
          buffer2[offset + i] = frameData[i] ^ maskKey[i & 3];
        }
        return buffer2;
      }
    };
    __name(_WebsocketFrameSend, "WebsocketFrameSend");
    var WebsocketFrameSend = _WebsocketFrameSend;
    module2.exports = {
      WebsocketFrameSend
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/connection.js
var require_connection = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/connection.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { uid, states, sentCloseFrameState, emptyBuffer, opcodes } = require_constants5();
    var {
      kReadyState,
      kSentClose,
      kByteParser,
      kReceivedClose,
      kResponse
    } = require_symbols5();
    var { fireEvent, failWebsocketConnection, isClosing, isClosed, isEstablished, parseExtensions } = require_util7();
    var { channels } = require_diagnostics();
    var { CloseEvent } = require_events();
    var { makeRequest } = require_request();
    var { fetching } = require_fetch();
    var { Headers: Headers2, getHeadersList } = require_headers();
    var { getDecodeSplit } = require_util2();
    var { WebsocketFrameSend } = require_frame();
    var crypto;
    try {
      crypto = require("crypto");
    } catch {
    }
    function establishWebSocketConnection(url, protocols, client, ws, onEstablish, options) {
      const requestURL = url;
      requestURL.protocol = url.protocol === "ws:" ? "http:" : "https:";
      const request = makeRequest({
        urlList: [requestURL],
        client,
        serviceWorkers: "none",
        referrer: "no-referrer",
        mode: "websocket",
        credentials: "include",
        cache: "no-store",
        redirect: "error"
      });
      if (options.headers) {
        const headersList = getHeadersList(new Headers2(options.headers));
        request.headersList = headersList;
      }
      const keyValue = crypto.randomBytes(16).toString("base64");
      request.headersList.append("sec-websocket-key", keyValue);
      request.headersList.append("sec-websocket-version", "13");
      for (const protocol of protocols) {
        request.headersList.append("sec-websocket-protocol", protocol);
      }
      const permessageDeflate = "permessage-deflate; client_max_window_bits";
      request.headersList.append("sec-websocket-extensions", permessageDeflate);
      const controller = fetching({
        request,
        useParallelQueue: true,
        dispatcher: options.dispatcher,
        processResponse(response) {
          if (response.type === "error" || response.status !== 101) {
            failWebsocketConnection(ws, "Received network error or non-101 status code.");
            return;
          }
          if (protocols.length !== 0 && !response.headersList.get("Sec-WebSocket-Protocol")) {
            failWebsocketConnection(ws, "Server did not respond with sent protocols.");
            return;
          }
          if (response.headersList.get("Upgrade")?.toLowerCase() !== "websocket") {
            failWebsocketConnection(ws, 'Server did not set Upgrade header to "websocket".');
            return;
          }
          if (response.headersList.get("Connection")?.toLowerCase() !== "upgrade") {
            failWebsocketConnection(ws, 'Server did not set Connection header to "upgrade".');
            return;
          }
          const secWSAccept = response.headersList.get("Sec-WebSocket-Accept");
          const digest = crypto.createHash("sha1").update(keyValue + uid).digest("base64");
          if (secWSAccept !== digest) {
            failWebsocketConnection(ws, "Incorrect hash received in Sec-WebSocket-Accept header.");
            return;
          }
          const secExtension = response.headersList.get("Sec-WebSocket-Extensions");
          let extensions;
          if (secExtension !== null) {
            extensions = parseExtensions(secExtension);
            if (!extensions.has("permessage-deflate")) {
              failWebsocketConnection(ws, "Sec-WebSocket-Extensions header does not match.");
              return;
            }
          }
          const secProtocol = response.headersList.get("Sec-WebSocket-Protocol");
          if (secProtocol !== null) {
            const requestProtocols = getDecodeSplit("sec-websocket-protocol", request.headersList);
            if (!requestProtocols.includes(secProtocol)) {
              failWebsocketConnection(ws, "Protocol was not set in the opening handshake.");
              return;
            }
          }
          response.socket.on("data", onSocketData);
          response.socket.on("close", onSocketClose);
          response.socket.on("error", onSocketError);
          if (channels.open.hasSubscribers) {
            channels.open.publish({
              address: response.socket.address(),
              protocol: secProtocol,
              extensions: secExtension
            });
          }
          onEstablish(response, extensions);
        }
      });
      return controller;
    }
    __name(establishWebSocketConnection, "establishWebSocketConnection");
    function closeWebSocketConnection(ws, code, reason, reasonByteLength) {
      if (isClosing(ws) || isClosed(ws)) {
      } else if (!isEstablished(ws)) {
        failWebsocketConnection(ws, "Connection was closed before it was established.");
        ws[kReadyState] = states.CLOSING;
      } else if (ws[kSentClose] === sentCloseFrameState.NOT_SENT) {
        ws[kSentClose] = sentCloseFrameState.PROCESSING;
        const frame = new WebsocketFrameSend();
        if (code !== void 0 && reason === void 0) {
          frame.frameData = Buffer.allocUnsafe(2);
          frame.frameData.writeUInt16BE(code, 0);
        } else if (code !== void 0 && reason !== void 0) {
          frame.frameData = Buffer.allocUnsafe(2 + reasonByteLength);
          frame.frameData.writeUInt16BE(code, 0);
          frame.frameData.write(reason, 2, "utf-8");
        } else {
          frame.frameData = emptyBuffer;
        }
        const socket = ws[kResponse].socket;
        socket.write(frame.createFrame(opcodes.CLOSE));
        ws[kSentClose] = sentCloseFrameState.SENT;
        ws[kReadyState] = states.CLOSING;
      } else {
        ws[kReadyState] = states.CLOSING;
      }
    }
    __name(closeWebSocketConnection, "closeWebSocketConnection");
    function onSocketData(chunk) {
      if (!this.ws[kByteParser].write(chunk)) {
        this.pause();
      }
    }
    __name(onSocketData, "onSocketData");
    function onSocketClose() {
      const { ws } = this;
      const { [kResponse]: response } = ws;
      response.socket.off("data", onSocketData);
      response.socket.off("close", onSocketClose);
      response.socket.off("error", onSocketError);
      const wasClean = ws[kSentClose] === sentCloseFrameState.SENT && ws[kReceivedClose];
      let code = 1005;
      let reason = "";
      const result = ws[kByteParser].closingInfo;
      if (result && !result.error) {
        code = result.code ?? 1005;
        reason = result.reason;
      } else if (!ws[kReceivedClose]) {
        code = 1006;
      }
      ws[kReadyState] = states.CLOSED;
      fireEvent("close", ws, (type, init) => new CloseEvent(type, init), {
        wasClean,
        code,
        reason
      });
      if (channels.close.hasSubscribers) {
        channels.close.publish({
          websocket: ws,
          code,
          reason
        });
      }
    }
    __name(onSocketClose, "onSocketClose");
    function onSocketError(error) {
      const { ws } = this;
      ws[kReadyState] = states.CLOSING;
      if (channels.socketError.hasSubscribers) {
        channels.socketError.publish(error);
      }
      this.destroy();
    }
    __name(onSocketError, "onSocketError");
    module2.exports = {
      establishWebSocketConnection,
      closeWebSocketConnection
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/permessage-deflate.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { createInflateRaw, Z_DEFAULT_WINDOWBITS } = require("zlib");
    var { isValidClientWindowBits } = require_util7();
    var tail = Buffer.from([0, 0, 255, 255]);
    var kBuffer = Symbol("kBuffer");
    var kLength = Symbol("kLength");
    var _inflate, _options;
    var _PerMessageDeflate = class _PerMessageDeflate {
      constructor(extensions) {
        /** @type {import('node:zlib').InflateRaw} */
        __privateAdd(this, _inflate, void 0);
        __privateAdd(this, _options, {});
        __privateGet(this, _options).serverNoContextTakeover = extensions.has("server_no_context_takeover");
        __privateGet(this, _options).serverMaxWindowBits = extensions.get("server_max_window_bits");
      }
      decompress(chunk, fin, callback) {
        if (!__privateGet(this, _inflate)) {
          let windowBits = Z_DEFAULT_WINDOWBITS;
          if (__privateGet(this, _options).serverMaxWindowBits) {
            if (!isValidClientWindowBits(__privateGet(this, _options).serverMaxWindowBits)) {
              callback(new Error("Invalid server_max_window_bits"));
              return;
            }
            windowBits = Number.parseInt(__privateGet(this, _options).serverMaxWindowBits);
          }
          __privateSet(this, _inflate, createInflateRaw({ windowBits }));
          __privateGet(this, _inflate)[kBuffer] = [];
          __privateGet(this, _inflate)[kLength] = 0;
          __privateGet(this, _inflate).on("data", (data) => {
            __privateGet(this, _inflate)[kBuffer].push(data);
            __privateGet(this, _inflate)[kLength] += data.length;
          });
          __privateGet(this, _inflate).on("error", (err) => {
            __privateSet(this, _inflate, null);
            callback(err);
          });
        }
        __privateGet(this, _inflate).write(chunk);
        if (fin) {
          __privateGet(this, _inflate).write(tail);
        }
        __privateGet(this, _inflate).flush(() => {
          const full = Buffer.concat(__privateGet(this, _inflate)[kBuffer], __privateGet(this, _inflate)[kLength]);
          __privateGet(this, _inflate)[kBuffer].length = 0;
          __privateGet(this, _inflate)[kLength] = 0;
          callback(null, full);
        });
      }
    };
    _inflate = new WeakMap();
    _options = new WeakMap();
    __name(_PerMessageDeflate, "PerMessageDeflate");
    var PerMessageDeflate = _PerMessageDeflate;
    module2.exports = { PerMessageDeflate };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/receiver.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Writable } = require("stream");
    var assert = require("assert");
    var { parserStates, opcodes, states, emptyBuffer, sentCloseFrameState } = require_constants5();
    var { kReadyState, kSentClose, kResponse, kReceivedClose } = require_symbols5();
    var { channels } = require_diagnostics();
    var {
      isValidStatusCode,
      isValidOpcode,
      failWebsocketConnection,
      websocketMessageReceived,
      utf8Decode,
      isControlFrame,
      isTextBinaryFrame,
      isContinuationFrame
    } = require_util7();
    var { WebsocketFrameSend } = require_frame();
    var { closeWebSocketConnection } = require_connection();
    var { PerMessageDeflate } = require_permessage_deflate();
    var _buffers, _byteOffset, _loop, _state, _info, _fragments, _extensions;
    var _ByteParser = class _ByteParser extends Writable {
      constructor(ws, extensions) {
        super();
        __privateAdd(this, _buffers, []);
        __privateAdd(this, _byteOffset, 0);
        __privateAdd(this, _loop, false);
        __privateAdd(this, _state, parserStates.INFO);
        __privateAdd(this, _info, {});
        __privateAdd(this, _fragments, []);
        /** @type {Map<string, PerMessageDeflate>} */
        __privateAdd(this, _extensions, void 0);
        this.ws = ws;
        __privateSet(this, _extensions, extensions == null ? /* @__PURE__ */ new Map() : extensions);
        if (__privateGet(this, _extensions).has("permessage-deflate")) {
          __privateGet(this, _extensions).set("permessage-deflate", new PerMessageDeflate(extensions));
        }
      }
      /**
       * @param {Buffer} chunk
       * @param {() => void} callback
       */
      _write(chunk, _, callback) {
        __privateGet(this, _buffers).push(chunk);
        __privateSet(this, _byteOffset, __privateGet(this, _byteOffset) + chunk.length);
        __privateSet(this, _loop, true);
        this.run(callback);
      }
      /**
       * Runs whenever a new chunk is received.
       * Callback is called whenever there are no more chunks buffering,
       * or not enough bytes are buffered to parse.
       */
      run(callback) {
        while (__privateGet(this, _loop)) {
          if (__privateGet(this, _state) === parserStates.INFO) {
            if (__privateGet(this, _byteOffset) < 2) {
              return callback();
            }
            const buffer = this.consume(2);
            const fin = (buffer[0] & 128) !== 0;
            const opcode = buffer[0] & 15;
            const masked = (buffer[1] & 128) === 128;
            const fragmented = !fin && opcode !== opcodes.CONTINUATION;
            const payloadLength = buffer[1] & 127;
            const rsv1 = buffer[0] & 64;
            const rsv2 = buffer[0] & 32;
            const rsv3 = buffer[0] & 16;
            if (!isValidOpcode(opcode)) {
              failWebsocketConnection(this.ws, "Invalid opcode received");
              return callback();
            }
            if (masked) {
              failWebsocketConnection(this.ws, "Frame cannot be masked");
              return callback();
            }
            if (rsv1 !== 0 && !__privateGet(this, _extensions).has("permessage-deflate")) {
              failWebsocketConnection(this.ws, "Expected RSV1 to be clear.");
              return;
            }
            if (rsv2 !== 0 || rsv3 !== 0) {
              failWebsocketConnection(this.ws, "RSV1, RSV2, RSV3 must be clear");
              return;
            }
            if (fragmented && !isTextBinaryFrame(opcode)) {
              failWebsocketConnection(this.ws, "Invalid frame type was fragmented.");
              return;
            }
            if (isTextBinaryFrame(opcode) && __privateGet(this, _fragments).length > 0) {
              failWebsocketConnection(this.ws, "Expected continuation frame");
              return;
            }
            if (__privateGet(this, _info).fragmented && fragmented) {
              failWebsocketConnection(this.ws, "Fragmented frame exceeded 125 bytes.");
              return;
            }
            if ((payloadLength > 125 || fragmented) && isControlFrame(opcode)) {
              failWebsocketConnection(this.ws, "Control frame either too large or fragmented");
              return;
            }
            if (isContinuationFrame(opcode) && __privateGet(this, _fragments).length === 0 && !__privateGet(this, _info).compressed) {
              failWebsocketConnection(this.ws, "Unexpected continuation frame");
              return;
            }
            if (payloadLength <= 125) {
              __privateGet(this, _info).payloadLength = payloadLength;
              __privateSet(this, _state, parserStates.READ_DATA);
            } else if (payloadLength === 126) {
              __privateSet(this, _state, parserStates.PAYLOADLENGTH_16);
            } else if (payloadLength === 127) {
              __privateSet(this, _state, parserStates.PAYLOADLENGTH_64);
            }
            if (isTextBinaryFrame(opcode)) {
              __privateGet(this, _info).binaryType = opcode;
              __privateGet(this, _info).compressed = rsv1 !== 0;
            }
            __privateGet(this, _info).opcode = opcode;
            __privateGet(this, _info).masked = masked;
            __privateGet(this, _info).fin = fin;
            __privateGet(this, _info).fragmented = fragmented;
          } else if (__privateGet(this, _state) === parserStates.PAYLOADLENGTH_16) {
            if (__privateGet(this, _byteOffset) < 2) {
              return callback();
            }
            const buffer = this.consume(2);
            __privateGet(this, _info).payloadLength = buffer.readUInt16BE(0);
            __privateSet(this, _state, parserStates.READ_DATA);
          } else if (__privateGet(this, _state) === parserStates.PAYLOADLENGTH_64) {
            if (__privateGet(this, _byteOffset) < 8) {
              return callback();
            }
            const buffer = this.consume(8);
            const upper = buffer.readUInt32BE(0);
            if (upper > 2 ** 31 - 1) {
              failWebsocketConnection(this.ws, "Received payload length > 2^31 bytes.");
              return;
            }
            const lower = buffer.readUInt32BE(4);
            __privateGet(this, _info).payloadLength = (upper << 8) + lower;
            __privateSet(this, _state, parserStates.READ_DATA);
          } else if (__privateGet(this, _state) === parserStates.READ_DATA) {
            if (__privateGet(this, _byteOffset) < __privateGet(this, _info).payloadLength) {
              return callback();
            }
            const body = this.consume(__privateGet(this, _info).payloadLength);
            if (isControlFrame(__privateGet(this, _info).opcode)) {
              __privateSet(this, _loop, this.parseControlFrame(body));
              __privateSet(this, _state, parserStates.INFO);
            } else {
              if (!__privateGet(this, _info).compressed) {
                __privateGet(this, _fragments).push(body);
                if (!__privateGet(this, _info).fragmented && __privateGet(this, _info).fin) {
                  const fullMessage = Buffer.concat(__privateGet(this, _fragments));
                  websocketMessageReceived(this.ws, __privateGet(this, _info).binaryType, fullMessage);
                  __privateGet(this, _fragments).length = 0;
                }
                __privateSet(this, _state, parserStates.INFO);
              } else {
                __privateGet(this, _extensions).get("permessage-deflate").decompress(body, __privateGet(this, _info).fin, (error, data) => {
                  if (error) {
                    closeWebSocketConnection(this.ws, 1007, error.message, error.message.length);
                    return;
                  }
                  __privateGet(this, _fragments).push(data);
                  if (!__privateGet(this, _info).fin) {
                    __privateSet(this, _state, parserStates.INFO);
                    __privateSet(this, _loop, true);
                    this.run(callback);
                    return;
                  }
                  websocketMessageReceived(this.ws, __privateGet(this, _info).binaryType, Buffer.concat(__privateGet(this, _fragments)));
                  __privateSet(this, _loop, true);
                  __privateSet(this, _state, parserStates.INFO);
                  __privateGet(this, _fragments).length = 0;
                  this.run(callback);
                });
                __privateSet(this, _loop, false);
                break;
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
      consume(n) {
        if (n > __privateGet(this, _byteOffset)) {
          throw new Error("Called consume() before buffers satiated.");
        } else if (n === 0) {
          return emptyBuffer;
        }
        if (__privateGet(this, _buffers)[0].length === n) {
          __privateSet(this, _byteOffset, __privateGet(this, _byteOffset) - __privateGet(this, _buffers)[0].length);
          return __privateGet(this, _buffers).shift();
        }
        const buffer = Buffer.allocUnsafe(n);
        let offset = 0;
        while (offset !== n) {
          const next = __privateGet(this, _buffers)[0];
          const { length } = next;
          if (length + offset === n) {
            buffer.set(__privateGet(this, _buffers).shift(), offset);
            break;
          } else if (length + offset > n) {
            buffer.set(next.subarray(0, n - offset), offset);
            __privateGet(this, _buffers)[0] = next.subarray(n - offset);
            break;
          } else {
            buffer.set(__privateGet(this, _buffers).shift(), offset);
            offset += next.length;
          }
        }
        __privateSet(this, _byteOffset, __privateGet(this, _byteOffset) - n);
        return buffer;
      }
      parseCloseBody(data) {
        assert(data.length !== 1);
        let code;
        if (data.length >= 2) {
          code = data.readUInt16BE(0);
        }
        if (code !== void 0 && !isValidStatusCode(code)) {
          return { code: 1002, reason: "Invalid status code", error: true };
        }
        let reason = data.subarray(2);
        if (reason[0] === 239 && reason[1] === 187 && reason[2] === 191) {
          reason = reason.subarray(3);
        }
        try {
          reason = utf8Decode(reason);
        } catch {
          return { code: 1007, reason: "Invalid UTF-8", error: true };
        }
        return { code, reason, error: false };
      }
      /**
       * Parses control frames.
       * @param {Buffer} body
       */
      parseControlFrame(body) {
        const { opcode, payloadLength } = __privateGet(this, _info);
        if (opcode === opcodes.CLOSE) {
          if (payloadLength === 1) {
            failWebsocketConnection(this.ws, "Received close frame with a 1-byte body.");
            return false;
          }
          __privateGet(this, _info).closeInfo = this.parseCloseBody(body);
          if (__privateGet(this, _info).closeInfo.error) {
            const { code, reason } = __privateGet(this, _info).closeInfo;
            closeWebSocketConnection(this.ws, code, reason, reason.length);
            failWebsocketConnection(this.ws, reason);
            return false;
          }
          if (this.ws[kSentClose] !== sentCloseFrameState.SENT) {
            let body2 = emptyBuffer;
            if (__privateGet(this, _info).closeInfo.code) {
              body2 = Buffer.allocUnsafe(2);
              body2.writeUInt16BE(__privateGet(this, _info).closeInfo.code, 0);
            }
            const closeFrame = new WebsocketFrameSend(body2);
            this.ws[kResponse].socket.write(
              closeFrame.createFrame(opcodes.CLOSE),
              (err) => {
                if (!err) {
                  this.ws[kSentClose] = sentCloseFrameState.SENT;
                }
              }
            );
          }
          this.ws[kReadyState] = states.CLOSING;
          this.ws[kReceivedClose] = true;
          return false;
        } else if (opcode === opcodes.PING) {
          if (!this.ws[kReceivedClose]) {
            const frame = new WebsocketFrameSend(body);
            this.ws[kResponse].socket.write(frame.createFrame(opcodes.PONG));
            if (channels.ping.hasSubscribers) {
              channels.ping.publish({
                payload: body
              });
            }
          }
        } else if (opcode === opcodes.PONG) {
          if (channels.pong.hasSubscribers) {
            channels.pong.publish({
              payload: body
            });
          }
        }
        return true;
      }
      get closingInfo() {
        return __privateGet(this, _info).closeInfo;
      }
    };
    _buffers = new WeakMap();
    _byteOffset = new WeakMap();
    _loop = new WeakMap();
    _state = new WeakMap();
    _info = new WeakMap();
    _fragments = new WeakMap();
    _extensions = new WeakMap();
    __name(_ByteParser, "ByteParser");
    var ByteParser = _ByteParser;
    module2.exports = {
      ByteParser
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/sender.js
var require_sender = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/sender.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { WebsocketFrameSend } = require_frame();
    var { opcodes, sendHints } = require_constants5();
    var FixedQueue = require_fixed_queue();
    var FastBuffer = Buffer[Symbol.species];
    var _queue, _running, _socket, _run, run_fn;
    var _SendQueue = class _SendQueue {
      constructor(socket) {
        __privateAdd(this, _run);
        /**
         * @type {FixedQueue}
         */
        __privateAdd(this, _queue, new FixedQueue());
        /**
         * @type {boolean}
         */
        __privateAdd(this, _running, false);
        /** @type {import('node:net').Socket} */
        __privateAdd(this, _socket, void 0);
        __privateSet(this, _socket, socket);
      }
      add(item, cb, hint) {
        if (hint !== sendHints.blob) {
          const frame = createFrame(item, hint);
          if (!__privateGet(this, _running)) {
            __privateGet(this, _socket).write(frame, cb);
          } else {
            const node2 = {
              promise: null,
              callback: cb,
              frame
            };
            __privateGet(this, _queue).push(node2);
          }
          return;
        }
        const node = {
          promise: item.arrayBuffer().then((ab) => {
            node.promise = null;
            node.frame = createFrame(ab, hint);
          }),
          callback: cb,
          frame: null
        };
        __privateGet(this, _queue).push(node);
        if (!__privateGet(this, _running)) {
          __privateMethod(this, _run, run_fn).call(this);
        }
      }
    };
    _queue = new WeakMap();
    _running = new WeakMap();
    _socket = new WeakMap();
    _run = new WeakSet();
    run_fn = /* @__PURE__ */ __name(async function() {
      __privateSet(this, _running, true);
      const queue = __privateGet(this, _queue);
      while (!queue.isEmpty()) {
        const node = queue.shift();
        if (node.promise !== null) {
          await node.promise;
        }
        __privateGet(this, _socket).write(node.frame, node.callback);
        node.callback = node.frame = null;
      }
      __privateSet(this, _running, false);
    }, "#run");
    __name(_SendQueue, "SendQueue");
    var SendQueue = _SendQueue;
    function createFrame(data, hint) {
      return new WebsocketFrameSend(toBuffer(data, hint)).createFrame(hint === sendHints.string ? opcodes.TEXT : opcodes.BINARY);
    }
    __name(createFrame, "createFrame");
    function toBuffer(data, hint) {
      switch (hint) {
        case sendHints.string:
          return Buffer.from(data);
        case sendHints.arrayBuffer:
        case sendHints.blob:
          return new FastBuffer(data);
        case sendHints.typedArray:
          return new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      }
    }
    __name(toBuffer, "toBuffer");
    module2.exports = { SendQueue };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/websocket/websocket.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { webidl } = require_webidl();
    var { URLSerializer } = require_data_url();
    var { environmentSettingsObject } = require_util2();
    var { staticPropertyDescriptors, states, sentCloseFrameState, sendHints } = require_constants5();
    var {
      kWebSocketURL,
      kReadyState,
      kController,
      kBinaryType,
      kResponse,
      kSentClose,
      kByteParser
    } = require_symbols5();
    var {
      isConnecting,
      isEstablished,
      isClosing,
      isValidSubprotocol,
      fireEvent
    } = require_util7();
    var { establishWebSocketConnection, closeWebSocketConnection } = require_connection();
    var { ByteParser } = require_receiver();
    var { kEnumerableProperty, isBlobLike } = require_util();
    var { getGlobalDispatcher } = require_global2();
    var { types } = require("util");
    var { ErrorEvent, CloseEvent } = require_events();
    var { SendQueue } = require_sender();
    var _events, _bufferedAmount, _protocol, _extensions, _sendQueue, _onConnectionEstablished, onConnectionEstablished_fn;
    var _WebSocket = class _WebSocket extends EventTarget {
      /**
       * @param {string} url
       * @param {string|string[]} protocols
       */
      constructor(url, protocols = []) {
        super();
        /**
         * @see https://websockets.spec.whatwg.org/#feedback-from-the-protocol
         */
        __privateAdd(this, _onConnectionEstablished);
        __privateAdd(this, _events, {
          open: null,
          error: null,
          close: null,
          message: null
        });
        __privateAdd(this, _bufferedAmount, 0);
        __privateAdd(this, _protocol, "");
        __privateAdd(this, _extensions, "");
        /** @type {SendQueue} */
        __privateAdd(this, _sendQueue, void 0);
        webidl.util.markAsUncloneable(this);
        const prefix = "WebSocket constructor";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        const options = webidl.converters["DOMString or sequence<DOMString> or WebSocketInit"](protocols, prefix, "options");
        url = webidl.converters.USVString(url, prefix, "url");
        protocols = options.protocols;
        const baseURL = environmentSettingsObject.settingsObject.baseUrl;
        let urlRecord;
        try {
          urlRecord = new URL(url, baseURL);
        } catch (e) {
          throw new DOMException(e, "SyntaxError");
        }
        if (urlRecord.protocol === "http:") {
          urlRecord.protocol = "ws:";
        } else if (urlRecord.protocol === "https:") {
          urlRecord.protocol = "wss:";
        }
        if (urlRecord.protocol !== "ws:" && urlRecord.protocol !== "wss:") {
          throw new DOMException(
            `Expected a ws: or wss: protocol, got ${urlRecord.protocol}`,
            "SyntaxError"
          );
        }
        if (urlRecord.hash || urlRecord.href.endsWith("#")) {
          throw new DOMException("Got fragment", "SyntaxError");
        }
        if (typeof protocols === "string") {
          protocols = [protocols];
        }
        if (protocols.length !== new Set(protocols.map((p) => p.toLowerCase())).size) {
          throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
        }
        if (protocols.length > 0 && !protocols.every((p) => isValidSubprotocol(p))) {
          throw new DOMException("Invalid Sec-WebSocket-Protocol value", "SyntaxError");
        }
        this[kWebSocketURL] = new URL(urlRecord.href);
        const client = environmentSettingsObject.settingsObject;
        this[kController] = establishWebSocketConnection(
          urlRecord,
          protocols,
          client,
          this,
          (response, extensions) => __privateMethod(this, _onConnectionEstablished, onConnectionEstablished_fn).call(this, response, extensions),
          options
        );
        this[kReadyState] = _WebSocket.CONNECTING;
        this[kSentClose] = sentCloseFrameState.NOT_SENT;
        this[kBinaryType] = "blob";
      }
      /**
       * @see https://websockets.spec.whatwg.org/#dom-websocket-close
       * @param {number|undefined} code
       * @param {string|undefined} reason
       */
      close(code = void 0, reason = void 0) {
        webidl.brandCheck(this, _WebSocket);
        const prefix = "WebSocket.close";
        if (code !== void 0) {
          code = webidl.converters["unsigned short"](code, prefix, "code", { clamp: true });
        }
        if (reason !== void 0) {
          reason = webidl.converters.USVString(reason, prefix, "reason");
        }
        if (code !== void 0) {
          if (code !== 1e3 && (code < 3e3 || code > 4999)) {
            throw new DOMException("invalid code", "InvalidAccessError");
          }
        }
        let reasonByteLength = 0;
        if (reason !== void 0) {
          reasonByteLength = Buffer.byteLength(reason);
          if (reasonByteLength > 123) {
            throw new DOMException(
              `Reason must be less than 123 bytes; received ${reasonByteLength}`,
              "SyntaxError"
            );
          }
        }
        closeWebSocketConnection(this, code, reason, reasonByteLength);
      }
      /**
       * @see https://websockets.spec.whatwg.org/#dom-websocket-send
       * @param {NodeJS.TypedArray|ArrayBuffer|Blob|string} data
       */
      send(data) {
        webidl.brandCheck(this, _WebSocket);
        const prefix = "WebSocket.send";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        data = webidl.converters.WebSocketSendData(data, prefix, "data");
        if (isConnecting(this)) {
          throw new DOMException("Sent before connected.", "InvalidStateError");
        }
        if (!isEstablished(this) || isClosing(this)) {
          return;
        }
        if (typeof data === "string") {
          const length = Buffer.byteLength(data);
          __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) + length);
          __privateGet(this, _sendQueue).add(data, () => {
            __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) - length);
          }, sendHints.string);
        } else if (types.isArrayBuffer(data)) {
          __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) + data.byteLength);
          __privateGet(this, _sendQueue).add(data, () => {
            __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) - data.byteLength);
          }, sendHints.arrayBuffer);
        } else if (ArrayBuffer.isView(data)) {
          __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) + data.byteLength);
          __privateGet(this, _sendQueue).add(data, () => {
            __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) - data.byteLength);
          }, sendHints.typedArray);
        } else if (isBlobLike(data)) {
          __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) + data.size);
          __privateGet(this, _sendQueue).add(data, () => {
            __privateSet(this, _bufferedAmount, __privateGet(this, _bufferedAmount) - data.size);
          }, sendHints.blob);
        }
      }
      get readyState() {
        webidl.brandCheck(this, _WebSocket);
        return this[kReadyState];
      }
      get bufferedAmount() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _bufferedAmount);
      }
      get url() {
        webidl.brandCheck(this, _WebSocket);
        return URLSerializer(this[kWebSocketURL]);
      }
      get extensions() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _extensions);
      }
      get protocol() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _protocol);
      }
      get onopen() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _events).open;
      }
      set onopen(fn) {
        webidl.brandCheck(this, _WebSocket);
        if (__privateGet(this, _events).open) {
          this.removeEventListener("open", __privateGet(this, _events).open);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).open = fn;
          this.addEventListener("open", fn);
        } else {
          __privateGet(this, _events).open = null;
        }
      }
      get onerror() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _events).error;
      }
      set onerror(fn) {
        webidl.brandCheck(this, _WebSocket);
        if (__privateGet(this, _events).error) {
          this.removeEventListener("error", __privateGet(this, _events).error);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).error = fn;
          this.addEventListener("error", fn);
        } else {
          __privateGet(this, _events).error = null;
        }
      }
      get onclose() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _events).close;
      }
      set onclose(fn) {
        webidl.brandCheck(this, _WebSocket);
        if (__privateGet(this, _events).close) {
          this.removeEventListener("close", __privateGet(this, _events).close);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).close = fn;
          this.addEventListener("close", fn);
        } else {
          __privateGet(this, _events).close = null;
        }
      }
      get onmessage() {
        webidl.brandCheck(this, _WebSocket);
        return __privateGet(this, _events).message;
      }
      set onmessage(fn) {
        webidl.brandCheck(this, _WebSocket);
        if (__privateGet(this, _events).message) {
          this.removeEventListener("message", __privateGet(this, _events).message);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).message = fn;
          this.addEventListener("message", fn);
        } else {
          __privateGet(this, _events).message = null;
        }
      }
      get binaryType() {
        webidl.brandCheck(this, _WebSocket);
        return this[kBinaryType];
      }
      set binaryType(type) {
        webidl.brandCheck(this, _WebSocket);
        if (type !== "blob" && type !== "arraybuffer") {
          this[kBinaryType] = "blob";
        } else {
          this[kBinaryType] = type;
        }
      }
    };
    _events = new WeakMap();
    _bufferedAmount = new WeakMap();
    _protocol = new WeakMap();
    _extensions = new WeakMap();
    _sendQueue = new WeakMap();
    _onConnectionEstablished = new WeakSet();
    onConnectionEstablished_fn = /* @__PURE__ */ __name(function(response, parsedExtensions) {
      this[kResponse] = response;
      const parser = new ByteParser(this, parsedExtensions);
      parser.on("drain", onParserDrain);
      parser.on("error", onParserError.bind(this));
      response.socket.ws = this;
      this[kByteParser] = parser;
      __privateSet(this, _sendQueue, new SendQueue(response.socket));
      this[kReadyState] = states.OPEN;
      const extensions = response.headersList.get("sec-websocket-extensions");
      if (extensions !== null) {
        __privateSet(this, _extensions, extensions);
      }
      const protocol = response.headersList.get("sec-websocket-protocol");
      if (protocol !== null) {
        __privateSet(this, _protocol, protocol);
      }
      fireEvent("open", this);
    }, "#onConnectionEstablished");
    __name(_WebSocket, "WebSocket");
    var WebSocket2 = _WebSocket;
    WebSocket2.CONNECTING = WebSocket2.prototype.CONNECTING = states.CONNECTING;
    WebSocket2.OPEN = WebSocket2.prototype.OPEN = states.OPEN;
    WebSocket2.CLOSING = WebSocket2.prototype.CLOSING = states.CLOSING;
    WebSocket2.CLOSED = WebSocket2.prototype.CLOSED = states.CLOSED;
    Object.defineProperties(WebSocket2.prototype, {
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
        value: "WebSocket",
        writable: false,
        enumerable: false,
        configurable: true
      }
    });
    Object.defineProperties(WebSocket2, {
      CONNECTING: staticPropertyDescriptors,
      OPEN: staticPropertyDescriptors,
      CLOSING: staticPropertyDescriptors,
      CLOSED: staticPropertyDescriptors
    });
    webidl.converters["sequence<DOMString>"] = webidl.sequenceConverter(
      webidl.converters.DOMString
    );
    webidl.converters["DOMString or sequence<DOMString>"] = function(V, prefix, argument) {
      if (webidl.util.Type(V) === "Object" && Symbol.iterator in V) {
        return webidl.converters["sequence<DOMString>"](V);
      }
      return webidl.converters.DOMString(V, prefix, argument);
    };
    webidl.converters.WebSocketInit = webidl.dictionaryConverter([
      {
        key: "protocols",
        converter: webidl.converters["DOMString or sequence<DOMString>"],
        defaultValue: () => new Array(0)
      },
      {
        key: "dispatcher",
        converter: webidl.converters.any,
        defaultValue: () => getGlobalDispatcher()
      },
      {
        key: "headers",
        converter: webidl.nullableConverter(webidl.converters.HeadersInit)
      }
    ]);
    webidl.converters["DOMString or sequence<DOMString> or WebSocketInit"] = function(V) {
      if (webidl.util.Type(V) === "Object" && !(Symbol.iterator in V)) {
        return webidl.converters.WebSocketInit(V);
      }
      return { protocols: webidl.converters["DOMString or sequence<DOMString>"](V) };
    };
    webidl.converters.WebSocketSendData = function(V) {
      if (webidl.util.Type(V) === "Object") {
        if (isBlobLike(V)) {
          return webidl.converters.Blob(V, { strict: false });
        }
        if (ArrayBuffer.isView(V) || types.isArrayBuffer(V)) {
          return webidl.converters.BufferSource(V);
        }
      }
      return webidl.converters.USVString(V);
    };
    function onParserDrain() {
      this.ws[kResponse].socket.resume();
    }
    __name(onParserDrain, "onParserDrain");
    function onParserError(err) {
      let message;
      let code;
      if (err instanceof CloseEvent) {
        message = err.reason;
        code = err.code;
      } else {
        message = err.message;
      }
      fireEvent("error", this, () => new ErrorEvent("error", { error: err, message }));
      closeWebSocketConnection(this, code);
    }
    __name(onParserError, "onParserError");
    module2.exports = {
      WebSocket: WebSocket2
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/eventsource/util.js
var require_util8 = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/eventsource/util.js"(exports2, module2) {
    "use strict";
    init_define_process();
    function isValidLastEventId(value) {
      return value.indexOf("\0") === -1;
    }
    __name(isValidLastEventId, "isValidLastEventId");
    function isASCIINumber(value) {
      if (value.length === 0)
        return false;
      for (let i = 0; i < value.length; i++) {
        if (value.charCodeAt(i) < 48 || value.charCodeAt(i) > 57)
          return false;
      }
      return true;
    }
    __name(isASCIINumber, "isASCIINumber");
    function delay(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms).unref();
      });
    }
    __name(delay, "delay");
    module2.exports = {
      isValidLastEventId,
      isASCIINumber,
      delay
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/eventsource/eventsource-stream.js
var require_eventsource_stream = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/eventsource/eventsource-stream.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { Transform } = require("stream");
    var { isASCIINumber, isValidLastEventId } = require_util8();
    var BOM = [239, 187, 191];
    var LF = 10;
    var CR = 13;
    var COLON = 58;
    var SPACE = 32;
    var _EventSourceStream = class _EventSourceStream extends Transform {
      /**
       * @type {eventSourceSettings}
       */
      state = null;
      /**
       * Leading byte-order-mark check.
       * @type {boolean}
       */
      checkBOM = true;
      /**
       * @type {boolean}
       */
      crlfCheck = false;
      /**
       * @type {boolean}
       */
      eventEndCheck = false;
      /**
       * @type {Buffer}
       */
      buffer = null;
      pos = 0;
      event = {
        data: void 0,
        event: void 0,
        id: void 0,
        retry: void 0
      };
      /**
       * @param {object} options
       * @param {eventSourceSettings} options.eventSourceSettings
       * @param {Function} [options.push]
       */
      constructor(options = {}) {
        options.readableObjectMode = true;
        super(options);
        this.state = options.eventSourceSettings || {};
        if (options.push) {
          this.push = options.push;
        }
      }
      /**
       * @param {Buffer} chunk
       * @param {string} _encoding
       * @param {Function} callback
       * @returns {void}
       */
      _transform(chunk, _encoding, callback) {
        if (chunk.length === 0) {
          callback();
          return;
        }
        if (this.buffer) {
          this.buffer = Buffer.concat([this.buffer, chunk]);
        } else {
          this.buffer = chunk;
        }
        if (this.checkBOM) {
          switch (this.buffer.length) {
            case 1:
              if (this.buffer[0] === BOM[0]) {
                callback();
                return;
              }
              this.checkBOM = false;
              callback();
              return;
            case 2:
              if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1]) {
                callback();
                return;
              }
              this.checkBOM = false;
              break;
            case 3:
              if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1] && this.buffer[2] === BOM[2]) {
                this.buffer = Buffer.alloc(0);
                this.checkBOM = false;
                callback();
                return;
              }
              this.checkBOM = false;
              break;
            default:
              if (this.buffer[0] === BOM[0] && this.buffer[1] === BOM[1] && this.buffer[2] === BOM[2]) {
                this.buffer = this.buffer.subarray(3);
              }
              this.checkBOM = false;
              break;
          }
        }
        while (this.pos < this.buffer.length) {
          if (this.eventEndCheck) {
            if (this.crlfCheck) {
              if (this.buffer[this.pos] === LF) {
                this.buffer = this.buffer.subarray(this.pos + 1);
                this.pos = 0;
                this.crlfCheck = false;
                continue;
              }
              this.crlfCheck = false;
            }
            if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
              if (this.buffer[this.pos] === CR) {
                this.crlfCheck = true;
              }
              this.buffer = this.buffer.subarray(this.pos + 1);
              this.pos = 0;
              if (this.event.data !== void 0 || this.event.event || this.event.id || this.event.retry) {
                this.processEvent(this.event);
              }
              this.clearEvent();
              continue;
            }
            this.eventEndCheck = false;
            continue;
          }
          if (this.buffer[this.pos] === LF || this.buffer[this.pos] === CR) {
            if (this.buffer[this.pos] === CR) {
              this.crlfCheck = true;
            }
            this.parseLine(this.buffer.subarray(0, this.pos), this.event);
            this.buffer = this.buffer.subarray(this.pos + 1);
            this.pos = 0;
            this.eventEndCheck = true;
            continue;
          }
          this.pos++;
        }
        callback();
      }
      /**
       * @param {Buffer} line
       * @param {EventStreamEvent} event
       */
      parseLine(line, event) {
        if (line.length === 0) {
          return;
        }
        const colonPosition = line.indexOf(COLON);
        if (colonPosition === 0) {
          return;
        }
        let field = "";
        let value = "";
        if (colonPosition !== -1) {
          field = line.subarray(0, colonPosition).toString("utf8");
          let valueStart = colonPosition + 1;
          if (line[valueStart] === SPACE) {
            ++valueStart;
          }
          value = line.subarray(valueStart).toString("utf8");
        } else {
          field = line.toString("utf8");
          value = "";
        }
        switch (field) {
          case "data":
            if (event[field] === void 0) {
              event[field] = value;
            } else {
              event[field] += `
${value}`;
            }
            break;
          case "retry":
            if (isASCIINumber(value)) {
              event[field] = value;
            }
            break;
          case "id":
            if (isValidLastEventId(value)) {
              event[field] = value;
            }
            break;
          case "event":
            if (value.length > 0) {
              event[field] = value;
            }
            break;
        }
      }
      /**
       * @param {EventSourceStreamEvent} event
       */
      processEvent(event) {
        if (event.retry && isASCIINumber(event.retry)) {
          this.state.reconnectionTime = parseInt(event.retry, 10);
        }
        if (event.id && isValidLastEventId(event.id)) {
          this.state.lastEventId = event.id;
        }
        if (event.data !== void 0) {
          this.push({
            type: event.event || "message",
            options: {
              data: event.data,
              lastEventId: this.state.lastEventId,
              origin: this.state.origin
            }
          });
        }
      }
      clearEvent() {
        this.event = {
          data: void 0,
          event: void 0,
          id: void 0,
          retry: void 0
        };
      }
    };
    __name(_EventSourceStream, "EventSourceStream");
    var EventSourceStream = _EventSourceStream;
    module2.exports = {
      EventSourceStream
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/eventsource/eventsource.js
var require_eventsource = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/lib/web/eventsource/eventsource.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var { pipeline } = require("stream");
    var { fetching } = require_fetch();
    var { makeRequest } = require_request();
    var { webidl } = require_webidl();
    var { EventSourceStream } = require_eventsource_stream();
    var { parseMIMEType } = require_data_url();
    var { createFastMessageEvent } = require_events();
    var { isNetworkError } = require_response();
    var { delay } = require_util8();
    var { kEnumerableProperty } = require_util();
    var { environmentSettingsObject } = require_util2();
    var experimentalWarned = false;
    var defaultReconnectionTime = 3e3;
    var CONNECTING = 0;
    var OPEN = 1;
    var CLOSED = 2;
    var ANONYMOUS = "anonymous";
    var USE_CREDENTIALS = "use-credentials";
    var _events, _url, _withCredentials, _readyState, _request, _controller, _dispatcher, _state, _connect, connect_fn, _reconnect, reconnect_fn;
    var _EventSource = class _EventSource extends EventTarget {
      /**
       * Creates a new EventSource object.
       * @param {string} url
       * @param {EventSourceInit} [eventSourceInitDict]
       * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface
       */
      constructor(url, eventSourceInitDict = {}) {
        super();
        __privateAdd(this, _connect);
        /**
         * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model
         * @returns {Promise<void>}
         */
        __privateAdd(this, _reconnect);
        __privateAdd(this, _events, {
          open: null,
          error: null,
          message: null
        });
        __privateAdd(this, _url, null);
        __privateAdd(this, _withCredentials, false);
        __privateAdd(this, _readyState, CONNECTING);
        __privateAdd(this, _request, null);
        __privateAdd(this, _controller, null);
        __privateAdd(this, _dispatcher, void 0);
        /**
         * @type {import('./eventsource-stream').eventSourceSettings}
         */
        __privateAdd(this, _state, void 0);
        webidl.util.markAsUncloneable(this);
        const prefix = "EventSource constructor";
        webidl.argumentLengthCheck(arguments, 1, prefix);
        if (!experimentalWarned) {
          experimentalWarned = true;
          define_process_default.emitWarning("EventSource is experimental, expect them to change at any time.", {
            code: "UNDICI-ES"
          });
        }
        url = webidl.converters.USVString(url, prefix, "url");
        eventSourceInitDict = webidl.converters.EventSourceInitDict(eventSourceInitDict, prefix, "eventSourceInitDict");
        __privateSet(this, _dispatcher, eventSourceInitDict.dispatcher);
        __privateSet(this, _state, {
          lastEventId: "",
          reconnectionTime: defaultReconnectionTime
        });
        const settings = environmentSettingsObject;
        let urlRecord;
        try {
          urlRecord = new URL(url, settings.settingsObject.baseUrl);
          __privateGet(this, _state).origin = urlRecord.origin;
        } catch (e) {
          throw new DOMException(e, "SyntaxError");
        }
        __privateSet(this, _url, urlRecord.href);
        let corsAttributeState = ANONYMOUS;
        if (eventSourceInitDict.withCredentials) {
          corsAttributeState = USE_CREDENTIALS;
          __privateSet(this, _withCredentials, true);
        }
        const initRequest = {
          redirect: "follow",
          keepalive: true,
          // @see https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes
          mode: "cors",
          credentials: corsAttributeState === "anonymous" ? "same-origin" : "omit",
          referrer: "no-referrer"
        };
        initRequest.client = environmentSettingsObject.settingsObject;
        initRequest.headersList = [["accept", { name: "accept", value: "text/event-stream" }]];
        initRequest.cache = "no-store";
        initRequest.initiator = "other";
        initRequest.urlList = [new URL(__privateGet(this, _url))];
        __privateSet(this, _request, makeRequest(initRequest));
        __privateMethod(this, _connect, connect_fn).call(this);
      }
      /**
       * Returns the state of this EventSource object's connection. It can have the
       * values described below.
       * @returns {0|1|2}
       * @readonly
       */
      get readyState() {
        return __privateGet(this, _readyState);
      }
      /**
       * Returns the URL providing the event stream.
       * @readonly
       * @returns {string}
       */
      get url() {
        return __privateGet(this, _url);
      }
      /**
       * Returns a boolean indicating whether the EventSource object was
       * instantiated with CORS credentials set (true), or not (false, the default).
       */
      get withCredentials() {
        return __privateGet(this, _withCredentials);
      }
      /**
       * Closes the connection, if any, and sets the readyState attribute to
       * CLOSED.
       */
      close() {
        webidl.brandCheck(this, _EventSource);
        if (__privateGet(this, _readyState) === CLOSED)
          return;
        __privateSet(this, _readyState, CLOSED);
        __privateGet(this, _controller).abort();
        __privateSet(this, _request, null);
      }
      get onopen() {
        return __privateGet(this, _events).open;
      }
      set onopen(fn) {
        if (__privateGet(this, _events).open) {
          this.removeEventListener("open", __privateGet(this, _events).open);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).open = fn;
          this.addEventListener("open", fn);
        } else {
          __privateGet(this, _events).open = null;
        }
      }
      get onmessage() {
        return __privateGet(this, _events).message;
      }
      set onmessage(fn) {
        if (__privateGet(this, _events).message) {
          this.removeEventListener("message", __privateGet(this, _events).message);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).message = fn;
          this.addEventListener("message", fn);
        } else {
          __privateGet(this, _events).message = null;
        }
      }
      get onerror() {
        return __privateGet(this, _events).error;
      }
      set onerror(fn) {
        if (__privateGet(this, _events).error) {
          this.removeEventListener("error", __privateGet(this, _events).error);
        }
        if (typeof fn === "function") {
          __privateGet(this, _events).error = fn;
          this.addEventListener("error", fn);
        } else {
          __privateGet(this, _events).error = null;
        }
      }
    };
    _events = new WeakMap();
    _url = new WeakMap();
    _withCredentials = new WeakMap();
    _readyState = new WeakMap();
    _request = new WeakMap();
    _controller = new WeakMap();
    _dispatcher = new WeakMap();
    _state = new WeakMap();
    _connect = new WeakSet();
    connect_fn = /* @__PURE__ */ __name(function() {
      if (__privateGet(this, _readyState) === CLOSED)
        return;
      __privateSet(this, _readyState, CONNECTING);
      const fetchParams = {
        request: __privateGet(this, _request),
        dispatcher: __privateGet(this, _dispatcher)
      };
      const processEventSourceEndOfBody = /* @__PURE__ */ __name((response) => {
        if (isNetworkError(response)) {
          this.dispatchEvent(new Event("error"));
          this.close();
        }
        __privateMethod(this, _reconnect, reconnect_fn).call(this);
      }, "processEventSourceEndOfBody");
      fetchParams.processResponseEndOfBody = processEventSourceEndOfBody;
      fetchParams.processResponse = (response) => {
        if (isNetworkError(response)) {
          if (response.aborted) {
            this.close();
            this.dispatchEvent(new Event("error"));
            return;
          } else {
            __privateMethod(this, _reconnect, reconnect_fn).call(this);
            return;
          }
        }
        const contentType = response.headersList.get("content-type", true);
        const mimeType = contentType !== null ? parseMIMEType(contentType) : "failure";
        const contentTypeValid = mimeType !== "failure" && mimeType.essence === "text/event-stream";
        if (response.status !== 200 || contentTypeValid === false) {
          this.close();
          this.dispatchEvent(new Event("error"));
          return;
        }
        __privateSet(this, _readyState, OPEN);
        this.dispatchEvent(new Event("open"));
        __privateGet(this, _state).origin = response.urlList[response.urlList.length - 1].origin;
        const eventSourceStream = new EventSourceStream({
          eventSourceSettings: __privateGet(this, _state),
          push: (event) => {
            this.dispatchEvent(createFastMessageEvent(
              event.type,
              event.options
            ));
          }
        });
        pipeline(
          response.body.stream,
          eventSourceStream,
          (error) => {
            if (error?.aborted === false) {
              this.close();
              this.dispatchEvent(new Event("error"));
            }
          }
        );
      };
      __privateSet(this, _controller, fetching(fetchParams));
    }, "#connect");
    _reconnect = new WeakSet();
    reconnect_fn = /* @__PURE__ */ __name(async function() {
      if (__privateGet(this, _readyState) === CLOSED)
        return;
      __privateSet(this, _readyState, CONNECTING);
      this.dispatchEvent(new Event("error"));
      await delay(__privateGet(this, _state).reconnectionTime);
      if (__privateGet(this, _readyState) !== CONNECTING)
        return;
      if (__privateGet(this, _state).lastEventId.length) {
        __privateGet(this, _request).headersList.set("last-event-id", __privateGet(this, _state).lastEventId, true);
      }
      __privateMethod(this, _connect, connect_fn).call(this);
    }, "#reconnect");
    __name(_EventSource, "EventSource");
    var EventSource = _EventSource;
    var constantsPropertyDescriptors = {
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
    };
    Object.defineProperties(EventSource, constantsPropertyDescriptors);
    Object.defineProperties(EventSource.prototype, constantsPropertyDescriptors);
    Object.defineProperties(EventSource.prototype, {
      close: kEnumerableProperty,
      onerror: kEnumerableProperty,
      onmessage: kEnumerableProperty,
      onopen: kEnumerableProperty,
      readyState: kEnumerableProperty,
      url: kEnumerableProperty,
      withCredentials: kEnumerableProperty
    });
    webidl.converters.EventSourceInitDict = webidl.dictionaryConverter([
      {
        key: "withCredentials",
        converter: webidl.converters.boolean,
        defaultValue: () => false
      },
      {
        key: "dispatcher",
        // undici only
        converter: webidl.converters.any
      }
    ]);
    module2.exports = {
      EventSource,
      defaultReconnectionTime
    };
  }
});

// ../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/index.js
var require_undici = __commonJS({
  "../../node_modules/.pnpm/undici@6.21.0/node_modules/undici/index.js"(exports2, module2) {
    "use strict";
    init_define_process();
    var Client = require_client();
    var Dispatcher = require_dispatcher();
    var Pool = require_pool();
    var BalancedPool = require_balanced_pool();
    var Agent = require_agent();
    var ProxyAgent = require_proxy_agent();
    var EnvHttpProxyAgent = require_env_http_proxy_agent();
    var RetryAgent = require_retry_agent();
    var errors = require_errors();
    var util = require_util();
    var { InvalidArgumentError } = errors;
    var api = require_api();
    var buildConnector = require_connect();
    var MockClient = require_mock_client();
    var MockAgent = require_mock_agent();
    var MockPool = require_mock_pool();
    var mockErrors = require_mock_errors();
    var RetryHandler = require_retry_handler();
    var { getGlobalDispatcher, setGlobalDispatcher } = require_global2();
    var DecoratorHandler = require_decorator_handler();
    var RedirectHandler = require_redirect_handler();
    var createRedirectInterceptor = require_redirect_interceptor();
    Object.assign(Dispatcher.prototype, api);
    module2.exports.Dispatcher = Dispatcher;
    module2.exports.Client = Client;
    module2.exports.Pool = Pool;
    module2.exports.BalancedPool = BalancedPool;
    module2.exports.Agent = Agent;
    module2.exports.ProxyAgent = ProxyAgent;
    module2.exports.EnvHttpProxyAgent = EnvHttpProxyAgent;
    module2.exports.RetryAgent = RetryAgent;
    module2.exports.RetryHandler = RetryHandler;
    module2.exports.DecoratorHandler = DecoratorHandler;
    module2.exports.RedirectHandler = RedirectHandler;
    module2.exports.createRedirectInterceptor = createRedirectInterceptor;
    module2.exports.interceptors = {
      redirect: require_redirect(),
      retry: require_retry(),
      dump: require_dump()
    };
    module2.exports.buildConnector = buildConnector;
    module2.exports.errors = errors;
    module2.exports.util = {
      parseHeaders: util.parseHeaders,
      headerNameToString: util.headerNameToString
    };
    function makeDispatcher(fn) {
      return (url, opts, handler) => {
        if (typeof opts === "function") {
          handler = opts;
          opts = null;
        }
        if (!url || typeof url !== "string" && typeof url !== "object" && !(url instanceof URL)) {
          throw new InvalidArgumentError("invalid url");
        }
        if (opts != null && typeof opts !== "object") {
          throw new InvalidArgumentError("invalid opts");
        }
        if (opts && opts.path != null) {
          if (typeof opts.path !== "string") {
            throw new InvalidArgumentError("invalid opts.path");
          }
          let path = opts.path;
          if (!opts.path.startsWith("/")) {
            path = `/${path}`;
          }
          url = new URL(util.parseOrigin(url).origin + path);
        } else {
          if (!opts) {
            opts = typeof url === "object" ? url : {};
          }
          url = util.parseURL(url);
        }
        const { agent, dispatcher = getGlobalDispatcher() } = opts;
        if (agent) {
          throw new InvalidArgumentError("unsupported opts.agent. Did you mean opts.client?");
        }
        return fn.call(dispatcher, {
          ...opts,
          origin: url.origin,
          path: url.search ? `${url.pathname}${url.search}` : url.pathname,
          method: opts.method || (opts.body ? "PUT" : "GET")
        }, handler);
      };
    }
    __name(makeDispatcher, "makeDispatcher");
    module2.exports.setGlobalDispatcher = setGlobalDispatcher;
    module2.exports.getGlobalDispatcher = getGlobalDispatcher;
    var fetchImpl = require_fetch().fetch;
    module2.exports.fetch = /* @__PURE__ */ __name(async function fetch2(init, options = void 0) {
      try {
        return await fetchImpl(init, options);
      } catch (err) {
        if (err && typeof err === "object") {
          Error.captureStackTrace(err);
        }
        throw err;
      }
    }, "fetch");
    module2.exports.Headers = require_headers().Headers;
    module2.exports.Response = require_response().Response;
    module2.exports.Request = require_request().Request;
    module2.exports.FormData = require_formdata().FormData;
    module2.exports.File = globalThis.File ?? require("buffer").File;
    module2.exports.FileReader = require_filereader().FileReader;
    var { setGlobalOrigin, getGlobalOrigin } = require_global();
    module2.exports.setGlobalOrigin = setGlobalOrigin;
    module2.exports.getGlobalOrigin = getGlobalOrigin;
    var { CacheStorage } = require_cachestorage();
    var { kConstruct } = require_symbols4();
    module2.exports.caches = new CacheStorage(kConstruct);
    var { deleteCookie, getCookies, getSetCookies, setCookie } = require_cookies();
    module2.exports.deleteCookie = deleteCookie;
    module2.exports.getCookies = getCookies;
    module2.exports.getSetCookies = getSetCookies;
    module2.exports.setCookie = setCookie;
    var { parseMIMEType, serializeAMimeType } = require_data_url();
    module2.exports.parseMIMEType = parseMIMEType;
    module2.exports.serializeAMimeType = serializeAMimeType;
    var { CloseEvent, ErrorEvent, MessageEvent } = require_events();
    module2.exports.WebSocket = require_websocket().WebSocket;
    module2.exports.CloseEvent = CloseEvent;
    module2.exports.ErrorEvent = ErrorEvent;
    module2.exports.MessageEvent = MessageEvent;
    module2.exports.request = makeDispatcher(api.request);
    module2.exports.stream = makeDispatcher(api.stream);
    module2.exports.pipeline = makeDispatcher(api.pipeline);
    module2.exports.connect = makeDispatcher(api.connect);
    module2.exports.upgrade = makeDispatcher(api.upgrade);
    module2.exports.MockClient = MockClient;
    module2.exports.MockPool = MockPool;
    module2.exports.MockAgent = MockAgent;
    module2.exports.mockErrors = mockErrors;
    var { EventSource } = require_eventsource();
    module2.exports.EventSource = EventSource;
  }
});

// src/primitives/fetch.js
var fetch_exports = {};
__export(fetch_exports, {
  Blob: () => Blob2,
  File: () => import_node_buffer.File,
  FormData: () => FormData,
  Headers: () => Headers,
  Request: () => Request,
  Response: () => Response,
  WebSocket: () => WebSocket,
  fetch: () => fetch
});
function addDuplexToInit(options) {
  return typeof options === "undefined" || typeof options === "object" && options.duplex === void 0 ? { duplex: "half", ...options } : options;
}
async function fetch(resource, options) {
  const res = await import_undici.default.fetch(resource, addDuplexToInit(options));
  const response = new Response(res.body, res);
  Object.defineProperty(response, "url", { value: res.url });
  return response;
}
var import_node_buffer, import_undici, import_response, _Request, Request, Response, Headers, FormData, WebSocket, Blob2;
var init_fetch = __esm({
  "src/primitives/fetch.js"() {
    "use strict";
    init_define_process();
    import_node_buffer = require("buffer");
    import_undici = __toESM(require_undici());
    import_response = __toESM(require_response());
    __name(addDuplexToInit, "addDuplexToInit");
    _Request = class _Request extends import_undici.default.Request {
      constructor(input, options) {
        super(input, addDuplexToInit(options));
      }
    };
    __name(_Request, "Request");
    Request = _Request;
    Response = import_undici.default.Response;
    Response.error = function() {
      return (0, import_response.fromInnerResponse)((0, import_response.makeNetworkError)(), "");
    };
    __name(fetch, "fetch");
    ({ Headers, FormData, WebSocket } = import_undici.default);
    ({ Blob: Blob2 } = globalThis);
  }
});

// src/primitives/load.js
var load_exports = {};
__export(load_exports, {
  load: () => load
});
module.exports = __toCommonJS(load_exports);
init_define_process();
var import_module = __toESM(require("module"));
function load(scopedContext = {}) {
  const context = {};
  Object.assign(context, {
    TextDecoder,
    TextEncoder,
    TextEncoderStream,
    TextDecoderStream,
    atob,
    btoa,
    performance
  });
  const consoleImpl = requireWithFakeGlobalScope({
    context,
    id: "console.js",
    sourceCode: require("./console.js.text.js"),
    scopedContext
  });
  Object.assign(context, { console: consoleImpl.console });
  const timersImpl = requireWithFakeGlobalScope({
    context,
    id: "timers.js",
    sourceCode: require("./timers.js.text.js"),
    scopedContext
  });
  Object.assign(context, {
    setTimeout: timersImpl.setTimeout,
    setInterval: timersImpl.setInterval
  });
  const eventsImpl = requireWithFakeGlobalScope({
    context,
    id: "events.js",
    sourceCode: require("./events.js.text.js"),
    scopedContext
  });
  Object.assign(context, {
    Event,
    EventTarget,
    FetchEvent: eventsImpl.FetchEvent,
    // @ts-expect-error we need to add this to the type definitions maybe
    PromiseRejectionEvent: eventsImpl.PromiseRejectionEvent
  });
  Object.assign(context, require("./stream"));
  const abortControllerImpl = requireWithFakeGlobalScope({
    context,
    id: "abort-controller.js",
    sourceCode: require("./abort-controller.js.text.js"),
    scopedContext: { ...scopedContext }
  });
  Object.assign(context, {
    AbortController: abortControllerImpl.AbortController,
    AbortSignal: abortControllerImpl.AbortSignal,
    DOMException: abortControllerImpl.DOMException
  });
  const urlImpl = requireWithFakeGlobalScope({
    context,
    id: "url.js",
    sourceCode: require("./url.js.text.js"),
    scopedContext: { ...scopedContext }
  });
  Object.assign(context, {
    URL,
    URLSearchParams,
    URLPattern: urlImpl.URLPattern
  });
  Object.assign(context, { structuredClone });
  Object.assign(context, (init_fetch(), __toCommonJS(fetch_exports)));
  Object.assign(context, getCrypto(scopedContext));
  return context;
}
__name(load, "load");
function getCrypto(scopedContext) {
  if (typeof SubtleCrypto !== "undefined" || scopedContext.SubtleCrypto) {
    return {
      crypto: scopedContext.crypto || globalThis.crypto,
      Crypto: scopedContext.Crypto || globalThis.Crypto,
      CryptoKey: scopedContext.CryptoKey || globalThis.CryptoKey,
      SubtleCrypto: scopedContext.SubtleCrypto || globalThis.SubtleCrypto
    };
  } else {
    const webcrypto = require("crypto").webcrypto;
    return {
      crypto: webcrypto,
      Crypto: webcrypto.constructor,
      CryptoKey: webcrypto.CryptoKey,
      SubtleCrypto: webcrypto.subtle.constructor
    };
  }
}
__name(getCrypto, "getCrypto");
function requireWithFakeGlobalScope(params) {
  const getModuleCode = `(function(module,exports,require,globalThis,${Object.keys(
    params.scopedContext
  ).join(",")}) {${params.sourceCode}
})`;
  const module = {
    exports: {},
    loaded: false,
    id: params.id
  };
  const moduleRequire = (import_module.default.createRequire || import_module.default.createRequireFromPath)(
    __filename
  );
  function throwingRequire(pathToRequire) {
    if (pathToRequire.startsWith("./")) {
      const moduleName = pathToRequire.replace(/^\.\//, "");
      if (!params.cache || !params.cache.has(moduleName)) {
        throw new Error(`Cannot find module '${moduleName}'`);
      }
      return params.cache.get(moduleName).exports;
    }
    return moduleRequire(pathToRequire);
  }
  __name(throwingRequire, "throwingRequire");
  throwingRequire.resolve = moduleRequire.resolve.bind(moduleRequire);
  eval(getModuleCode)(
    module,
    module.exports,
    throwingRequire,
    params.context,
    ...Object.values(params.scopedContext)
  );
  return module.exports;
}
__name(requireWithFakeGlobalScope, "requireWithFakeGlobalScope");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load
});
