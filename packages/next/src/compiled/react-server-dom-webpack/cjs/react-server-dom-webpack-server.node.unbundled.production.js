/**
 * @license React
 * react-server-dom-webpack-server.node.unbundled.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var util = require("util");
require("crypto");
var async_hooks = require("async_hooks"),
  ReactDOM = require("react-dom"),
  React = require("react"),
  currentView = null,
  writtenBytes = 0,
  destinationHasCapacity = !0;
function writeToDestination(destination, view) {
  destination = destination.write(view);
  destinationHasCapacity = destinationHasCapacity && destination;
}
function writeChunkAndReturn(destination, chunk) {
  if ("string" === typeof chunk) {
    if (0 !== chunk.length)
      if (2048 < 3 * chunk.length)
        0 < writtenBytes &&
          (writeToDestination(
            destination,
            currentView.subarray(0, writtenBytes)
          ),
          (currentView = new Uint8Array(2048)),
          (writtenBytes = 0)),
          writeToDestination(destination, textEncoder.encode(chunk));
      else {
        var target = currentView;
        0 < writtenBytes && (target = currentView.subarray(writtenBytes));
        target = textEncoder.encodeInto(chunk, target);
        var read = target.read;
        writtenBytes += target.written;
        read < chunk.length &&
          (writeToDestination(
            destination,
            currentView.subarray(0, writtenBytes)
          ),
          (currentView = new Uint8Array(2048)),
          (writtenBytes = textEncoder.encodeInto(
            chunk.slice(read),
            currentView
          ).written));
        2048 === writtenBytes &&
          (writeToDestination(destination, currentView),
          (currentView = new Uint8Array(2048)),
          (writtenBytes = 0));
      }
  } else
    0 !== chunk.byteLength &&
      (2048 < chunk.byteLength
        ? (0 < writtenBytes &&
            (writeToDestination(
              destination,
              currentView.subarray(0, writtenBytes)
            ),
            (currentView = new Uint8Array(2048)),
            (writtenBytes = 0)),
          writeToDestination(destination, chunk))
        : ((target = currentView.length - writtenBytes),
          target < chunk.byteLength &&
            (0 === target
              ? writeToDestination(destination, currentView)
              : (currentView.set(chunk.subarray(0, target), writtenBytes),
                (writtenBytes += target),
                writeToDestination(destination, currentView),
                (chunk = chunk.subarray(target))),
            (currentView = new Uint8Array(2048)),
            (writtenBytes = 0)),
          currentView.set(chunk, writtenBytes),
          (writtenBytes += chunk.byteLength),
          2048 === writtenBytes &&
            (writeToDestination(destination, currentView),
            (currentView = new Uint8Array(2048)),
            (writtenBytes = 0))));
  return destinationHasCapacity;
}
var textEncoder = new util.TextEncoder(),
  CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference"),
  SERVER_REFERENCE_TAG = Symbol.for("react.server.reference");
function registerClientReferenceImpl(proxyImplementation, id, async) {
  return Object.defineProperties(proxyImplementation, {
    $$typeof: { value: CLIENT_REFERENCE_TAG$1 },
    $$id: { value: id },
    $$async: { value: async }
  });
}
var FunctionBind = Function.prototype.bind,
  ArraySlice = Array.prototype.slice;
function bind() {
  var newFn = FunctionBind.apply(this, arguments);
  if (this.$$typeof === SERVER_REFERENCE_TAG) {
    var args = ArraySlice.call(arguments, 1);
    return Object.defineProperties(newFn, {
      $$typeof: { value: SERVER_REFERENCE_TAG },
      $$id: { value: this.$$id },
      $$bound: { value: this.$$bound ? this.$$bound.concat(args) : args },
      bind: { value: bind }
    });
  }
  return newFn;
}
var PROMISE_PROTOTYPE = Promise.prototype,
  deepProxyHandlers = {
    get: function (target, name) {
      switch (name) {
        case "$$typeof":
          return target.$$typeof;
        case "$$id":
          return target.$$id;
        case "$$async":
          return target.$$async;
        case "name":
          return target.name;
        case "displayName":
          return;
        case "defaultProps":
          return;
        case "toJSON":
          return;
        case Symbol.toPrimitive:
          return Object.prototype[Symbol.toPrimitive];
        case Symbol.toStringTag:
          return Object.prototype[Symbol.toStringTag];
        case "Provider":
          throw Error(
            "Cannot render a Client Context Provider on the Server. Instead, you can export a Client Component wrapper that itself renders a Client Context Provider."
          );
      }
      throw Error(
        "Cannot access " +
          (String(target.name) + "." + String(name)) +
          " on the server. You cannot dot into a client module from a server component. You can only pass the imported name through."
      );
    },
    set: function () {
      throw Error("Cannot assign to a client module from a server module.");
    }
  };
function getReference(target, name) {
  switch (name) {
    case "$$typeof":
      return target.$$typeof;
    case "$$id":
      return target.$$id;
    case "$$async":
      return target.$$async;
    case "name":
      return target.name;
    case "defaultProps":
      return;
    case "toJSON":
      return;
    case Symbol.toPrimitive:
      return Object.prototype[Symbol.toPrimitive];
    case Symbol.toStringTag:
      return Object.prototype[Symbol.toStringTag];
    case "__esModule":
      var moduleId = target.$$id;
      target.default = registerClientReferenceImpl(
        function () {
          throw Error(
            "Attempted to call the default export of " +
              moduleId +
              " from the server but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
          );
        },
        target.$$id + "#",
        target.$$async
      );
      return !0;
    case "then":
      if (target.then) return target.then;
      if (target.$$async) return;
      var clientReference = registerClientReferenceImpl({}, target.$$id, !0),
        proxy = new Proxy(clientReference, proxyHandlers$1);
      target.status = "fulfilled";
      target.value = proxy;
      return (target.then = registerClientReferenceImpl(
        function (resolve) {
          return Promise.resolve(resolve(proxy));
        },
        target.$$id + "#then",
        !1
      ));
  }
  if ("symbol" === typeof name)
    throw Error(
      "Cannot read Symbol exports. Only named exports are supported on a client module imported on the server."
    );
  clientReference = target[name];
  clientReference ||
    ((clientReference = registerClientReferenceImpl(
      function () {
        throw Error(
          "Attempted to call " +
            String(name) +
            "() from the server but " +
            String(name) +
            " is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
        );
      },
      target.$$id + "#" + name,
      target.$$async
    )),
    Object.defineProperty(clientReference, "name", { value: name }),
    (clientReference = target[name] =
      new Proxy(clientReference, deepProxyHandlers)));
  return clientReference;
}
var proxyHandlers$1 = {
    get: function (target, name) {
      return getReference(target, name);
    },
    getOwnPropertyDescriptor: function (target, name) {
      var descriptor = Object.getOwnPropertyDescriptor(target, name);
      descriptor ||
        ((descriptor = {
          value: getReference(target, name),
          writable: !1,
          configurable: !1,
          enumerable: !1
        }),
        Object.defineProperty(target, name, descriptor));
      return descriptor;
    },
    getPrototypeOf: function () {
      return PROMISE_PROTOTYPE;
    },
    set: function () {
      throw Error("Cannot assign to a client module from a server module.");
    }
  },
  ReactDOMSharedInternals =
    ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  previousDispatcher = ReactDOMSharedInternals.d;
ReactDOMSharedInternals.d = {
  f: previousDispatcher.f,
  r: previousDispatcher.r,
  D: prefetchDNS,
  C: preconnect,
  L: preload,
  m: preloadModule$1,
  X: preinitScript,
  S: preinitStyle,
  M: preinitModuleScript
};
function prefetchDNS(href) {
  if ("string" === typeof href && href) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "D|" + href;
      hints.has(key) || (hints.add(key), emitHint(request, "D", href));
    } else previousDispatcher.D(href);
  }
}
function preconnect(href, crossOrigin) {
  if ("string" === typeof href) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "C|" + (null == crossOrigin ? "null" : crossOrigin) + "|" + href;
      hints.has(key) ||
        (hints.add(key),
        "string" === typeof crossOrigin
          ? emitHint(request, "C", [href, crossOrigin])
          : emitHint(request, "C", href));
    } else previousDispatcher.C(href, crossOrigin);
  }
}
function preload(href, as, options) {
  if ("string" === typeof href) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "L";
      if ("image" === as && options) {
        var imageSrcSet = options.imageSrcSet,
          imageSizes = options.imageSizes,
          uniquePart = "";
        "string" === typeof imageSrcSet && "" !== imageSrcSet
          ? ((uniquePart += "[" + imageSrcSet + "]"),
            "string" === typeof imageSizes &&
              (uniquePart += "[" + imageSizes + "]"))
          : (uniquePart += "[][]" + href);
        key += "[image]" + uniquePart;
      } else key += "[" + as + "]" + href;
      hints.has(key) ||
        (hints.add(key),
        (options = trimOptions(options))
          ? emitHint(request, "L", [href, as, options])
          : emitHint(request, "L", [href, as]));
    } else previousDispatcher.L(href, as, options);
  }
}
function preloadModule$1(href, options) {
  if ("string" === typeof href) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "m|" + href;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions(options))
        ? emitHint(request, "m", [href, options])
        : emitHint(request, "m", href);
    }
    previousDispatcher.m(href, options);
  }
}
function preinitStyle(href, precedence, options) {
  if ("string" === typeof href) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "S|" + href;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions(options))
        ? emitHint(request, "S", [
            href,
            "string" === typeof precedence ? precedence : 0,
            options
          ])
        : "string" === typeof precedence
        ? emitHint(request, "S", [href, precedence])
        : emitHint(request, "S", href);
    }
    previousDispatcher.S(href, precedence, options);
  }
}
function preinitScript(src, options) {
  if ("string" === typeof src) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "X|" + src;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions(options))
        ? emitHint(request, "X", [src, options])
        : emitHint(request, "X", src);
    }
    previousDispatcher.X(src, options);
  }
}
function preinitModuleScript(src, options) {
  if ("string" === typeof src) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "M|" + src;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions(options))
        ? emitHint(request, "M", [src, options])
        : emitHint(request, "M", src);
    }
    previousDispatcher.M(src, options);
  }
}
function trimOptions(options) {
  if (null == options) return null;
  var hasProperties = !1,
    trimmed = {},
    key;
  for (key in options)
    null != options[key] &&
      ((hasProperties = !0), (trimmed[key] = options[key]));
  return hasProperties ? trimmed : null;
}
var requestStorage = new async_hooks.AsyncLocalStorage(),
  TEMPORARY_REFERENCE_TAG = Symbol.for("react.temporary.reference"),
  proxyHandlers = {
    get: function (target, name) {
      switch (name) {
        case "$$typeof":
          return target.$$typeof;
        case "name":
          return;
        case "displayName":
          return;
        case "defaultProps":
          return;
        case "toJSON":
          return;
        case Symbol.toPrimitive:
          return Object.prototype[Symbol.toPrimitive];
        case Symbol.toStringTag:
          return Object.prototype[Symbol.toStringTag];
        case "Provider":
          throw Error(
            "Cannot render a Client Context Provider on the Server. Instead, you can export a Client Component wrapper that itself renders a Client Context Provider."
          );
      }
      throw Error(
        "Cannot access " +
          String(name) +
          " on the server. You cannot dot into a temporary client reference from a server component. You can only pass the value through to the client."
      );
    },
    set: function () {
      throw Error(
        "Cannot assign to a temporary client reference from a server module."
      );
    }
  };
function createTemporaryReference(temporaryReferences, id) {
  var reference = Object.defineProperties(
    function () {
      throw Error(
        "Attempted to call a temporary Client Reference from the server but it is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
      );
    },
    { $$typeof: { value: TEMPORARY_REFERENCE_TAG } }
  );
  reference = new Proxy(reference, proxyHandlers);
  temporaryReferences.set(reference, id);
  return reference;
}
var REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"),
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
  REACT_CONTEXT_TYPE = Symbol.for("react.context"),
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
  REACT_MEMO_TYPE = Symbol.for("react.memo"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
  REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
Symbol.for("react.postpone");
var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
function getIteratorFn(maybeIterable) {
  if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
  maybeIterable =
    (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
    maybeIterable["@@iterator"];
  return "function" === typeof maybeIterable ? maybeIterable : null;
}
var ASYNC_ITERATOR = Symbol.asyncIterator,
  SuspenseException = Error(
    "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`"
  );
function noop() {}
function trackUsedThenable(thenableState, thenable, index) {
  index = thenableState[index];
  void 0 === index
    ? thenableState.push(thenable)
    : index !== thenable && (thenable.then(noop, noop), (thenable = index));
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      throw thenable.reason;
    default:
      "string" === typeof thenable.status
        ? thenable.then(noop, noop)
        : ((thenableState = thenable),
          (thenableState.status = "pending"),
          thenableState.then(
            function (fulfilledValue) {
              if ("pending" === thenable.status) {
                var fulfilledThenable = thenable;
                fulfilledThenable.status = "fulfilled";
                fulfilledThenable.value = fulfilledValue;
              }
            },
            function (error) {
              if ("pending" === thenable.status) {
                var rejectedThenable = thenable;
                rejectedThenable.status = "rejected";
                rejectedThenable.reason = error;
              }
            }
          ));
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
      }
      suspendedThenable = thenable;
      throw SuspenseException;
  }
}
var suspendedThenable = null;
function getSuspendedThenable() {
  if (null === suspendedThenable)
    throw Error(
      "Expected a suspended thenable. This is a bug in React. Please file an issue."
    );
  var thenable = suspendedThenable;
  suspendedThenable = null;
  return thenable;
}
var currentRequest$1 = null,
  thenableIndexCounter = 0,
  thenableState = null;
function getThenableStateAfterSuspending() {
  var state = thenableState || [];
  thenableState = null;
  return state;
}
var HooksDispatcher = {
  useMemo: function (nextCreate) {
    return nextCreate();
  },
  useCallback: function (callback) {
    return callback;
  },
  useDebugValue: function () {},
  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  readContext: unsupportedContext,
  useContext: unsupportedContext,
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useEffect: unsupportedHook,
  useId: useId,
  useSyncExternalStore: unsupportedHook,
  useCacheRefresh: function () {
    return unsupportedRefresh;
  },
  useMemoCache: function (size) {
    for (var data = Array(size), i = 0; i < size; i++)
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    return data;
  },
  use: use
};
function unsupportedHook() {
  throw Error("This Hook is not supported in Server Components.");
}
function unsupportedRefresh() {
  throw Error("Refreshing the cache is not supported in Server Components.");
}
function unsupportedContext() {
  throw Error("Cannot read a Client Context from a Server Component.");
}
function useId() {
  if (null === currentRequest$1)
    throw Error("useId can only be used while React is rendering");
  var id = currentRequest$1.identifierCount++;
  return ":" + currentRequest$1.identifierPrefix + "S" + id.toString(32) + ":";
}
function use(usable) {
  if (
    (null !== usable && "object" === typeof usable) ||
    "function" === typeof usable
  ) {
    if ("function" === typeof usable.then) {
      var index = thenableIndexCounter;
      thenableIndexCounter += 1;
      null === thenableState && (thenableState = []);
      return trackUsedThenable(thenableState, usable, index);
    }
    usable.$$typeof === REACT_CONTEXT_TYPE && unsupportedContext();
  }
  if (usable.$$typeof === CLIENT_REFERENCE_TAG$1) {
    if (null != usable.value && usable.value.$$typeof === REACT_CONTEXT_TYPE)
      throw Error("Cannot read a Client Context from a Server Component.");
    throw Error("Cannot use() an already resolved Client Reference.");
  }
  throw Error("An unsupported type was passed to use(): " + String(usable));
}
var DefaultAsyncDispatcher = {
    getCacheForType: function (resourceType) {
      var JSCompiler_inline_result = (JSCompiler_inline_result =
        resolveRequest())
        ? JSCompiler_inline_result.cache
        : new Map();
      var entry = JSCompiler_inline_result.get(resourceType);
      void 0 === entry &&
        ((entry = resourceType()),
        JSCompiler_inline_result.set(resourceType, entry));
      return entry;
    }
  },
  isArrayImpl = Array.isArray,
  getPrototypeOf = Object.getPrototypeOf;
function objectName(object) {
  return Object.prototype.toString
    .call(object)
    .replace(/^\[object (.*)\]$/, function (m, p0) {
      return p0;
    });
}
function describeValueForErrorMessage(value) {
  switch (typeof value) {
    case "string":
      return JSON.stringify(
        10 >= value.length ? value : value.slice(0, 10) + "..."
      );
    case "object":
      if (isArrayImpl(value)) return "[...]";
      if (null !== value && value.$$typeof === CLIENT_REFERENCE_TAG)
        return "client";
      value = objectName(value);
      return "Object" === value ? "{...}" : value;
    case "function":
      return value.$$typeof === CLIENT_REFERENCE_TAG
        ? "client"
        : (value = value.displayName || value.name)
        ? "function " + value
        : "function";
    default:
      return String(value);
  }
}
function describeElementType(type) {
  if ("string" === typeof type) return type;
  switch (type) {
    case REACT_SUSPENSE_TYPE:
      return "Suspense";
    case REACT_SUSPENSE_LIST_TYPE:
      return "SuspenseList";
  }
  if ("object" === typeof type)
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        return describeElementType(type.render);
      case REACT_MEMO_TYPE:
        return describeElementType(type.type);
      case REACT_LAZY_TYPE:
        var payload = type._payload;
        type = type._init;
        try {
          return describeElementType(type(payload));
        } catch (x) {}
    }
  return "";
}
var CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");
function describeObjectForErrorMessage(objectOrArray, expandedName) {
  var objKind = objectName(objectOrArray);
  if ("Object" !== objKind && "Array" !== objKind) return objKind;
  objKind = -1;
  var length = 0;
  if (isArrayImpl(objectOrArray)) {
    var str = "[";
    for (var i = 0; i < objectOrArray.length; i++) {
      0 < i && (str += ", ");
      var value = objectOrArray[i];
      value =
        "object" === typeof value && null !== value
          ? describeObjectForErrorMessage(value)
          : describeValueForErrorMessage(value);
      "" + i === expandedName
        ? ((objKind = str.length), (length = value.length), (str += value))
        : (str =
            10 > value.length && 40 > str.length + value.length
              ? str + value
              : str + "...");
    }
    str += "]";
  } else if (objectOrArray.$$typeof === REACT_ELEMENT_TYPE)
    str = "<" + describeElementType(objectOrArray.type) + "/>";
  else {
    if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG) return "client";
    str = "{";
    i = Object.keys(objectOrArray);
    for (value = 0; value < i.length; value++) {
      0 < value && (str += ", ");
      var name = i[value],
        encodedKey = JSON.stringify(name);
      str += ('"' + name + '"' === encodedKey ? name : encodedKey) + ": ";
      encodedKey = objectOrArray[name];
      encodedKey =
        "object" === typeof encodedKey && null !== encodedKey
          ? describeObjectForErrorMessage(encodedKey)
          : describeValueForErrorMessage(encodedKey);
      name === expandedName
        ? ((objKind = str.length),
          (length = encodedKey.length),
          (str += encodedKey))
        : (str =
            10 > encodedKey.length && 40 > str.length + encodedKey.length
              ? str + encodedKey
              : str + "...");
    }
    str += "}";
  }
  return void 0 === expandedName
    ? str
    : -1 < objKind && 0 < length
    ? ((objectOrArray = " ".repeat(objKind) + "^".repeat(length)),
      "\n  " + str + "\n  " + objectOrArray)
    : "\n  " + str;
}
var ReactSharedInternalsServer =
  React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
if (!ReactSharedInternalsServer)
  throw Error(
    'The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled in any environment that runs React Server Components.'
  );
var ObjectPrototype = Object.prototype,
  stringify = JSON.stringify;
function defaultErrorHandler(error) {
  console.error(error);
}
function defaultPostponeHandler() {}
function createRequest(
  model,
  bundlerConfig,
  onError,
  identifierPrefix,
  onPostpone,
  environmentName,
  temporaryReferences
) {
  if (
    null !== ReactSharedInternalsServer.A &&
    ReactSharedInternalsServer.A !== DefaultAsyncDispatcher
  )
    throw Error("Currently React only supports one RSC renderer at a time.");
  ReactSharedInternalsServer.A = DefaultAsyncDispatcher;
  var abortSet = new Set();
  environmentName = [];
  var hints = new Set();
  bundlerConfig = {
    status: 0,
    flushScheduled: !1,
    fatalError: null,
    destination: null,
    bundlerConfig: bundlerConfig,
    cache: new Map(),
    nextChunkId: 0,
    pendingChunks: 0,
    hints: hints,
    abortListeners: new Set(),
    abortableTasks: abortSet,
    pingedTasks: environmentName,
    completedImportChunks: [],
    completedHintChunks: [],
    completedRegularChunks: [],
    completedErrorChunks: [],
    writtenSymbols: new Map(),
    writtenClientReferences: new Map(),
    writtenServerReferences: new Map(),
    writtenObjects: new WeakMap(),
    temporaryReferences: temporaryReferences,
    identifierPrefix: identifierPrefix || "",
    identifierCount: 1,
    taintCleanupQueue: [],
    onError: void 0 === onError ? defaultErrorHandler : onError,
    onPostpone: void 0 === onPostpone ? defaultPostponeHandler : onPostpone
  };
  model = createTask(bundlerConfig, model, null, !1, abortSet);
  environmentName.push(model);
  return bundlerConfig;
}
var currentRequest = null;
function resolveRequest() {
  if (currentRequest) return currentRequest;
  var store = requestStorage.getStore();
  return store ? store : null;
}
function serializeThenable(request, task, thenable) {
  var newTask = createTask(
    request,
    null,
    task.keyPath,
    task.implicitSlot,
    request.abortableTasks
  );
  switch (thenable.status) {
    case "fulfilled":
      return (
        (newTask.model = thenable.value), pingTask(request, newTask), newTask.id
      );
    case "rejected":
      return (
        (task = logRecoverableError(request, thenable.reason)),
        emitErrorChunk(request, newTask.id, task),
        newTask.id
      );
    default:
      "string" !== typeof thenable.status &&
        ((thenable.status = "pending"),
        thenable.then(
          function (fulfilledValue) {
            "pending" === thenable.status &&
              ((thenable.status = "fulfilled"),
              (thenable.value = fulfilledValue));
          },
          function (error) {
            "pending" === thenable.status &&
              ((thenable.status = "rejected"), (thenable.reason = error));
          }
        ));
  }
  thenable.then(
    function (value) {
      newTask.model = value;
      pingTask(request, newTask);
    },
    function (reason) {
      newTask.status = 4;
      reason = logRecoverableError(request, reason);
      emitErrorChunk(request, newTask.id, reason);
      request.abortableTasks.delete(newTask);
      enqueueFlush(request);
    }
  );
  return newTask.id;
}
function serializeReadableStream(request, task, stream) {
  function progress(entry) {
    if (!aborted)
      if (entry.done)
        request.abortListeners.delete(error),
          (entry = streamTask.id.toString(16) + ":C\n"),
          request.completedRegularChunks.push(entry),
          enqueueFlush(request),
          (aborted = !0);
      else
        try {
          (streamTask.model = entry.value),
            request.pendingChunks++,
            emitChunk(request, streamTask, streamTask.model),
            enqueueFlush(request),
            reader.read().then(progress, error);
        } catch (x$8) {
          error(x$8);
        }
  }
  function error(reason) {
    if (!aborted) {
      aborted = !0;
      request.abortListeners.delete(error);
      var digest = logRecoverableError(request, reason);
      emitErrorChunk(request, streamTask.id, digest);
      enqueueFlush(request);
      reader.cancel(reason).then(error, error);
    }
  }
  var supportsBYOB = stream.supportsBYOB;
  if (void 0 === supportsBYOB)
    try {
      stream.getReader({ mode: "byob" }).releaseLock(), (supportsBYOB = !0);
    } catch (x) {
      supportsBYOB = !1;
    }
  var reader = stream.getReader(),
    streamTask = createTask(
      request,
      task.model,
      task.keyPath,
      task.implicitSlot,
      request.abortableTasks
    );
  request.abortableTasks.delete(streamTask);
  request.pendingChunks++;
  task = streamTask.id.toString(16) + ":" + (supportsBYOB ? "r" : "R") + "\n";
  request.completedRegularChunks.push(task);
  var aborted = !1;
  request.abortListeners.add(error);
  reader.read().then(progress, error);
  return serializeByValueID(streamTask.id);
}
function serializeAsyncIterable(request, task, iterable, iterator) {
  function progress(entry) {
    if (!aborted)
      if (entry.done) {
        request.abortListeners.delete(error);
        if (void 0 === entry.value)
          var endStreamRow = streamTask.id.toString(16) + ":C\n";
        else
          try {
            var chunkId = outlineModel(request, entry.value);
            endStreamRow =
              streamTask.id.toString(16) +
              ":C" +
              stringify(serializeByValueID(chunkId)) +
              "\n";
          } catch (x) {
            error(x);
            return;
          }
        request.completedRegularChunks.push(endStreamRow);
        enqueueFlush(request);
        aborted = !0;
      } else
        try {
          (streamTask.model = entry.value),
            request.pendingChunks++,
            emitChunk(request, streamTask, streamTask.model),
            enqueueFlush(request),
            iterator.next().then(progress, error);
        } catch (x$9) {
          error(x$9);
        }
  }
  function error(reason) {
    if (!aborted) {
      aborted = !0;
      request.abortListeners.delete(error);
      var digest = logRecoverableError(request, reason);
      emitErrorChunk(request, streamTask.id, digest);
      enqueueFlush(request);
      "function" === typeof iterator.throw &&
        iterator.throw(reason).then(error, error);
    }
  }
  iterable = iterable === iterator;
  var streamTask = createTask(
    request,
    task.model,
    task.keyPath,
    task.implicitSlot,
    request.abortableTasks
  );
  request.abortableTasks.delete(streamTask);
  request.pendingChunks++;
  task = streamTask.id.toString(16) + ":" + (iterable ? "x" : "X") + "\n";
  request.completedRegularChunks.push(task);
  var aborted = !1;
  request.abortListeners.add(error);
  iterator.next().then(progress, error);
  return serializeByValueID(streamTask.id);
}
function emitHint(request, code, model) {
  model = stringify(model);
  var id = request.nextChunkId++;
  code = "H" + code;
  code = id.toString(16) + ":" + code;
  request.completedHintChunks.push(code + model + "\n");
  enqueueFlush(request);
}
function readThenable(thenable) {
  if ("fulfilled" === thenable.status) return thenable.value;
  if ("rejected" === thenable.status) throw thenable.reason;
  throw thenable;
}
function createLazyWrapperAroundWakeable(wakeable) {
  switch (wakeable.status) {
    case "fulfilled":
    case "rejected":
      break;
    default:
      "string" !== typeof wakeable.status &&
        ((wakeable.status = "pending"),
        wakeable.then(
          function (fulfilledValue) {
            "pending" === wakeable.status &&
              ((wakeable.status = "fulfilled"),
              (wakeable.value = fulfilledValue));
          },
          function (error) {
            "pending" === wakeable.status &&
              ((wakeable.status = "rejected"), (wakeable.reason = error));
          }
        ));
  }
  return { $$typeof: REACT_LAZY_TYPE, _payload: wakeable, _init: readThenable };
}
function renderFunctionComponent(request, task, key, Component, props) {
  var prevThenableState = task.thenableState;
  task.thenableState = null;
  thenableIndexCounter = 0;
  thenableState = prevThenableState;
  Component = Component(props, void 0);
  if (
    "object" === typeof Component &&
    null !== Component &&
    Component.$$typeof !== CLIENT_REFERENCE_TAG$1
  ) {
    if ("function" === typeof Component.then) {
      props = Component;
      if ("fulfilled" === props.status) return props.value;
      Component = createLazyWrapperAroundWakeable(Component);
    }
    var iteratorFn = getIteratorFn(Component);
    if (iteratorFn) {
      var iterableChild = Component;
      Component = {};
      Component =
        ((Component[Symbol.iterator] = function () {
          return iteratorFn.call(iterableChild);
        }),
        Component);
    } else if (
      !(
        "function" !== typeof Component[ASYNC_ITERATOR] ||
        ("function" === typeof ReadableStream &&
          Component instanceof ReadableStream)
      )
    ) {
      var iterableChild$10 = Component;
      Component = {};
      Component =
        ((Component[ASYNC_ITERATOR] = function () {
          return iterableChild$10[ASYNC_ITERATOR]();
        }),
        Component);
    }
  }
  props = task.keyPath;
  prevThenableState = task.implicitSlot;
  null !== key
    ? (task.keyPath = null === props ? key : props + "," + key)
    : null === props && (task.implicitSlot = !0);
  request = renderModelDestructive(request, task, emptyRoot, "", Component);
  task.keyPath = props;
  task.implicitSlot = prevThenableState;
  return request;
}
function renderFragment(request, task, children) {
  return null !== task.keyPath
    ? ((request = [
        REACT_ELEMENT_TYPE,
        REACT_FRAGMENT_TYPE,
        task.keyPath,
        { children: children }
      ]),
      task.implicitSlot ? [request] : request)
    : children;
}
function renderClientElement(task, type, key, props) {
  var keyPath = task.keyPath;
  null === key
    ? (key = keyPath)
    : null !== keyPath && (key = keyPath + "," + key);
  type = [REACT_ELEMENT_TYPE, type, key, props];
  return task.implicitSlot && null !== key ? [type] : type;
}
function renderElement(request, task, type, key, ref, props) {
  if (null !== ref && void 0 !== ref)
    throw Error(
      "Refs cannot be used in Server Components, nor passed to Client Components."
    );
  if ("function" === typeof type)
    return type.$$typeof === CLIENT_REFERENCE_TAG$1 ||
      type.$$typeof === TEMPORARY_REFERENCE_TAG
      ? renderClientElement(task, type, key, props)
      : renderFunctionComponent(request, task, key, type, props);
  if ("string" === typeof type)
    return renderClientElement(task, type, key, props);
  if ("symbol" === typeof type)
    return type === REACT_FRAGMENT_TYPE && null === key
      ? ((key = task.implicitSlot),
        null === task.keyPath && (task.implicitSlot = !0),
        (request = renderModelDestructive(
          request,
          task,
          emptyRoot,
          "",
          props.children
        )),
        (task.implicitSlot = key),
        request)
      : renderClientElement(task, type, key, props);
  if (null != type && "object" === typeof type) {
    if (type.$$typeof === CLIENT_REFERENCE_TAG$1)
      return renderClientElement(task, type, key, props);
    switch (type.$$typeof) {
      case REACT_LAZY_TYPE:
        var init = type._init;
        type = init(type._payload);
        return renderElement(request, task, type, key, ref, props);
      case REACT_FORWARD_REF_TYPE:
        return renderFunctionComponent(request, task, key, type.render, props);
      case REACT_MEMO_TYPE:
        return renderElement(request, task, type.type, key, ref, props);
    }
  }
  throw Error(
    "Unsupported Server Component type: " + describeValueForErrorMessage(type)
  );
}
function pingTask(request, task) {
  var pingedTasks = request.pingedTasks;
  pingedTasks.push(task);
  1 === pingedTasks.length &&
    ((request.flushScheduled = null !== request.destination),
    setImmediate(function () {
      return performWork(request);
    }));
}
function createTask(request, model, keyPath, implicitSlot, abortSet) {
  request.pendingChunks++;
  var id = request.nextChunkId++;
  "object" !== typeof model ||
    null === model ||
    null !== keyPath ||
    implicitSlot ||
    request.writtenObjects.set(model, serializeByValueID(id));
  var task = {
    id: id,
    status: 0,
    model: model,
    keyPath: keyPath,
    implicitSlot: implicitSlot,
    ping: function () {
      return pingTask(request, task);
    },
    toJSON: function (parentPropertyName, value) {
      var prevKeyPath = task.keyPath,
        prevImplicitSlot = task.implicitSlot;
      try {
        var JSCompiler_inline_result = renderModelDestructive(
          request,
          task,
          this,
          parentPropertyName,
          value
        );
      } catch (thrownValue) {
        if (
          ((parentPropertyName =
            thrownValue === SuspenseException
              ? getSuspendedThenable()
              : thrownValue),
          (value = task.model),
          (value =
            "object" === typeof value &&
            null !== value &&
            (value.$$typeof === REACT_ELEMENT_TYPE ||
              value.$$typeof === REACT_LAZY_TYPE)),
          "object" === typeof parentPropertyName &&
            null !== parentPropertyName &&
            "function" === typeof parentPropertyName.then)
        ) {
          JSCompiler_inline_result = createTask(
            request,
            task.model,
            task.keyPath,
            task.implicitSlot,
            request.abortableTasks
          );
          var ping = JSCompiler_inline_result.ping;
          parentPropertyName.then(ping, ping);
          JSCompiler_inline_result.thenableState =
            getThenableStateAfterSuspending();
          task.keyPath = prevKeyPath;
          task.implicitSlot = prevImplicitSlot;
          JSCompiler_inline_result = value
            ? "$L" + JSCompiler_inline_result.id.toString(16)
            : serializeByValueID(JSCompiler_inline_result.id);
        } else if (
          ((task.keyPath = prevKeyPath),
          (task.implicitSlot = prevImplicitSlot),
          value)
        )
          request.pendingChunks++,
            (prevKeyPath = request.nextChunkId++),
            (prevImplicitSlot = logRecoverableError(
              request,
              parentPropertyName
            )),
            emitErrorChunk(request, prevKeyPath, prevImplicitSlot),
            (JSCompiler_inline_result = "$L" + prevKeyPath.toString(16));
        else throw parentPropertyName;
      }
      return JSCompiler_inline_result;
    },
    thenableState: null
  };
  abortSet.add(task);
  return task;
}
function serializeByValueID(id) {
  return "$" + id.toString(16);
}
function encodeReferenceChunk(request, id, reference) {
  request = stringify(reference);
  return id.toString(16) + ":" + request + "\n";
}
function serializeClientReference(
  request,
  parent,
  parentPropertyName,
  clientReference
) {
  var clientReferenceKey = clientReference.$$async
      ? clientReference.$$id + "#async"
      : clientReference.$$id,
    writtenClientReferences = request.writtenClientReferences,
    existingId = writtenClientReferences.get(clientReferenceKey);
  if (void 0 !== existingId)
    return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
      ? "$L" + existingId.toString(16)
      : serializeByValueID(existingId);
  try {
    var config = request.bundlerConfig,
      modulePath = clientReference.$$id;
    existingId = "";
    var resolvedModuleData = config[modulePath];
    if (resolvedModuleData) existingId = resolvedModuleData.name;
    else {
      var idx = modulePath.lastIndexOf("#");
      -1 !== idx &&
        ((existingId = modulePath.slice(idx + 1)),
        (resolvedModuleData = config[modulePath.slice(0, idx)]));
      if (!resolvedModuleData)
        throw Error(
          'Could not find the module "' +
            modulePath +
            '" in the React Client Manifest. This is probably a bug in the React Server Components bundler.'
        );
    }
    var JSCompiler_inline_result =
      !0 === clientReference.$$async
        ? [resolvedModuleData.id, resolvedModuleData.chunks, existingId, 1]
        : [resolvedModuleData.id, resolvedModuleData.chunks, existingId];
    request.pendingChunks++;
    var importId = request.nextChunkId++,
      json = stringify(JSCompiler_inline_result),
      processedChunk = importId.toString(16) + ":I" + json + "\n";
    request.completedImportChunks.push(processedChunk);
    writtenClientReferences.set(clientReferenceKey, importId);
    return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
      ? "$L" + importId.toString(16)
      : serializeByValueID(importId);
  } catch (x) {
    return (
      request.pendingChunks++,
      (parent = request.nextChunkId++),
      (parentPropertyName = logRecoverableError(request, x)),
      emitErrorChunk(request, parent, parentPropertyName),
      serializeByValueID(parent)
    );
  }
}
function outlineModel(request, value) {
  value = createTask(request, value, null, !1, request.abortableTasks);
  retryTask(request, value);
  return value.id;
}
function serializeTypedArray(request, tag, typedArray) {
  request.pendingChunks++;
  var bufferId = request.nextChunkId++;
  emitTypedArrayChunk(request, bufferId, tag, typedArray);
  return serializeByValueID(bufferId);
}
function serializeBlob(request, blob) {
  function progress(entry) {
    if (!aborted)
      if (entry.done)
        request.abortListeners.delete(error),
          (aborted = !0),
          pingTask(request, newTask);
      else
        return (
          model.push(entry.value), reader.read().then(progress).catch(error)
        );
  }
  function error(reason) {
    if (!aborted) {
      aborted = !0;
      request.abortListeners.delete(error);
      var digest = logRecoverableError(request, reason);
      emitErrorChunk(request, newTask.id, digest);
      request.abortableTasks.delete(newTask);
      enqueueFlush(request);
      reader.cancel(reason).then(error, error);
    }
  }
  var model = [blob.type],
    newTask = createTask(request, model, null, !1, request.abortableTasks),
    reader = blob.stream().getReader(),
    aborted = !1;
  request.abortListeners.add(error);
  reader.read().then(progress).catch(error);
  return "$B" + newTask.id.toString(16);
}
var modelRoot = !1;
function renderModelDestructive(
  request,
  task,
  parent,
  parentPropertyName,
  value
) {
  task.model = value;
  if (value === REACT_ELEMENT_TYPE) return "$";
  if (null === value) return null;
  if ("object" === typeof value) {
    switch (value.$$typeof) {
      case REACT_ELEMENT_TYPE:
        var writtenObjects = request.writtenObjects;
        if (null === task.keyPath && !task.implicitSlot) {
          var existingReference = writtenObjects.get(value);
          if (void 0 !== existingReference)
            if (modelRoot === value) modelRoot = null;
            else return existingReference;
          else
            -1 === parentPropertyName.indexOf(":") &&
              ((parent = writtenObjects.get(parent)),
              void 0 !== parent &&
                writtenObjects.set(value, parent + ":" + parentPropertyName));
        }
        parentPropertyName = value.props;
        parent = parentPropertyName.ref;
        return renderElement(
          request,
          task,
          value.type,
          value.key,
          void 0 !== parent ? parent : null,
          parentPropertyName
        );
      case REACT_LAZY_TYPE:
        return (
          (task.thenableState = null),
          (parentPropertyName = value._init),
          (value = parentPropertyName(value._payload)),
          renderModelDestructive(request, task, emptyRoot, "", value)
        );
      case REACT_LEGACY_ELEMENT_TYPE:
        throw Error(
          'A React Element from an older version of React was rendered. This is not supported. It can happen if:\n- Multiple copies of the "react" package is used.\n- A library pre-bundled an old copy of "react" or "react/jsx-runtime".\n- A compiler tries to "inline" JSX instead of using the runtime.'
        );
    }
    if (value.$$typeof === CLIENT_REFERENCE_TAG$1)
      return serializeClientReference(
        request,
        parent,
        parentPropertyName,
        value
      );
    if (
      void 0 !== request.temporaryReferences &&
      ((writtenObjects = request.temporaryReferences.get(value)),
      void 0 !== writtenObjects)
    )
      return "$T" + writtenObjects;
    writtenObjects = request.writtenObjects;
    existingReference = writtenObjects.get(value);
    if ("function" === typeof value.then) {
      if (void 0 !== existingReference) {
        if (null !== task.keyPath || task.implicitSlot)
          return "$@" + serializeThenable(request, task, value).toString(16);
        if (modelRoot === value) modelRoot = null;
        else return existingReference;
      }
      request = "$@" + serializeThenable(request, task, value).toString(16);
      writtenObjects.set(value, request);
      return request;
    }
    if (void 0 !== existingReference)
      if (modelRoot === value) modelRoot = null;
      else return existingReference;
    else if (
      -1 === parentPropertyName.indexOf(":") &&
      ((existingReference = writtenObjects.get(parent)),
      void 0 !== existingReference)
    ) {
      var propertyName = parentPropertyName;
      if (isArrayImpl(parent) && parent[0] === REACT_ELEMENT_TYPE)
        switch (parentPropertyName) {
          case "1":
            propertyName = "type";
            break;
          case "2":
            propertyName = "key";
            break;
          case "3":
            propertyName = "props";
        }
      writtenObjects.set(value, existingReference + ":" + propertyName);
    }
    if (isArrayImpl(value)) return renderFragment(request, task, value);
    if (value instanceof Map)
      return (
        (value = Array.from(value)),
        "$Q" + outlineModel(request, value).toString(16)
      );
    if (value instanceof Set)
      return (
        (value = Array.from(value)),
        "$W" + outlineModel(request, value).toString(16)
      );
    if ("function" === typeof FormData && value instanceof FormData)
      return (
        (value = Array.from(value.entries())),
        "$K" + outlineModel(request, value).toString(16)
      );
    if (value instanceof ArrayBuffer)
      return serializeTypedArray(request, "A", new Uint8Array(value));
    if (value instanceof Int8Array)
      return serializeTypedArray(request, "O", value);
    if (value instanceof Uint8Array)
      return serializeTypedArray(request, "o", value);
    if (value instanceof Uint8ClampedArray)
      return serializeTypedArray(request, "U", value);
    if (value instanceof Int16Array)
      return serializeTypedArray(request, "S", value);
    if (value instanceof Uint16Array)
      return serializeTypedArray(request, "s", value);
    if (value instanceof Int32Array)
      return serializeTypedArray(request, "L", value);
    if (value instanceof Uint32Array)
      return serializeTypedArray(request, "l", value);
    if (value instanceof Float32Array)
      return serializeTypedArray(request, "G", value);
    if (value instanceof Float64Array)
      return serializeTypedArray(request, "g", value);
    if (value instanceof BigInt64Array)
      return serializeTypedArray(request, "M", value);
    if (value instanceof BigUint64Array)
      return serializeTypedArray(request, "m", value);
    if (value instanceof DataView)
      return serializeTypedArray(request, "V", value);
    if ("function" === typeof Blob && value instanceof Blob)
      return serializeBlob(request, value);
    if ((parentPropertyName = getIteratorFn(value)))
      return (
        (parentPropertyName = parentPropertyName.call(value)),
        parentPropertyName === value
          ? "$i" +
            outlineModel(request, Array.from(parentPropertyName)).toString(16)
          : renderFragment(request, task, Array.from(parentPropertyName))
      );
    if ("function" === typeof ReadableStream && value instanceof ReadableStream)
      return serializeReadableStream(request, task, value);
    parentPropertyName = value[ASYNC_ITERATOR];
    if ("function" === typeof parentPropertyName)
      return (
        null !== task.keyPath
          ? ((request = [
              REACT_ELEMENT_TYPE,
              REACT_FRAGMENT_TYPE,
              task.keyPath,
              { children: value }
            ]),
            (request = task.implicitSlot ? [request] : request))
          : ((parentPropertyName = parentPropertyName.call(value)),
            (request = serializeAsyncIterable(
              request,
              task,
              value,
              parentPropertyName
            ))),
        request
      );
    request = getPrototypeOf(value);
    if (
      request !== ObjectPrototype &&
      (null === request || null !== getPrototypeOf(request))
    )
      throw Error(
        "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported."
      );
    return value;
  }
  if ("string" === typeof value) {
    if (
      "Z" === value[value.length - 1] &&
      parent[parentPropertyName] instanceof Date
    )
      return "$D" + value;
    if (1024 <= value.length)
      return (
        request.pendingChunks++,
        (task = request.nextChunkId++),
        emitTextChunk(request, task, value),
        serializeByValueID(task)
      );
    request = "$" === value[0] ? "$" + value : value;
    return request;
  }
  if ("boolean" === typeof value) return value;
  if ("number" === typeof value)
    return Number.isFinite(value)
      ? 0 === value && -Infinity === 1 / value
        ? "$-0"
        : value
      : Infinity === value
      ? "$Infinity"
      : -Infinity === value
      ? "$-Infinity"
      : "$NaN";
  if ("undefined" === typeof value) return "$undefined";
  if ("function" === typeof value) {
    if (value.$$typeof === CLIENT_REFERENCE_TAG$1)
      return serializeClientReference(
        request,
        parent,
        parentPropertyName,
        value
      );
    if (value.$$typeof === SERVER_REFERENCE_TAG)
      return (
        (task = request.writtenServerReferences),
        (parentPropertyName = task.get(value)),
        void 0 !== parentPropertyName
          ? (request = "$F" + parentPropertyName.toString(16))
          : ((parentPropertyName = value.$$bound),
            (parentPropertyName = {
              id: value.$$id,
              bound: parentPropertyName
                ? Promise.resolve(parentPropertyName)
                : null
            }),
            (request = outlineModel(request, parentPropertyName)),
            task.set(value, request),
            (request = "$F" + request.toString(16))),
        request
      );
    if (
      void 0 !== request.temporaryReferences &&
      ((request = request.temporaryReferences.get(value)), void 0 !== request)
    )
      return "$T" + request;
    if (value.$$typeof === TEMPORARY_REFERENCE_TAG)
      throw Error(
        "Could not reference an opaque temporary reference. This is likely due to misconfiguring the temporaryReferences options on the server."
      );
    if (/^on[A-Z]/.test(parentPropertyName))
      throw Error(
        "Event handlers cannot be passed to Client Component props." +
          describeObjectForErrorMessage(parent, parentPropertyName) +
          "\nIf you need interactivity, consider converting part of this to a Client Component."
      );
    throw Error(
      'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.' +
        describeObjectForErrorMessage(parent, parentPropertyName)
    );
  }
  if ("symbol" === typeof value) {
    task = request.writtenSymbols;
    writtenObjects = task.get(value);
    if (void 0 !== writtenObjects) return serializeByValueID(writtenObjects);
    writtenObjects = value.description;
    if (Symbol.for(writtenObjects) !== value)
      throw Error(
        "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
          (value.description + ") cannot be found among global symbols.") +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    request.pendingChunks++;
    parentPropertyName = request.nextChunkId++;
    parent = encodeReferenceChunk(
      request,
      parentPropertyName,
      "$S" + writtenObjects
    );
    request.completedImportChunks.push(parent);
    task.set(value, parentPropertyName);
    return serializeByValueID(parentPropertyName);
  }
  if ("bigint" === typeof value) return "$n" + value.toString(10);
  throw Error(
    "Type " +
      typeof value +
      " is not supported in Client Component props." +
      describeObjectForErrorMessage(parent, parentPropertyName)
  );
}
function logRecoverableError(request, error) {
  var prevRequest = currentRequest;
  currentRequest = null;
  try {
    var errorDigest = requestStorage.run(void 0, request.onError, error);
  } finally {
    currentRequest = prevRequest;
  }
  if (null != errorDigest && "string" !== typeof errorDigest)
    throw Error(
      'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
        typeof errorDigest +
        '" instead'
    );
  return errorDigest || "";
}
function fatalError(request, error) {
  null !== request.destination
    ? ((request.status = 2), request.destination.destroy(error))
    : ((request.status = 1), (request.fatalError = error));
}
function emitErrorChunk(request, id, digest) {
  digest = { digest: digest };
  id = id.toString(16) + ":E" + stringify(digest) + "\n";
  request.completedErrorChunks.push(id);
}
function emitTypedArrayChunk(request, id, tag, typedArray) {
  request.pendingChunks++;
  typedArray = new Uint8Array(
    typedArray.buffer,
    typedArray.byteOffset,
    typedArray.byteLength
  );
  var binaryLength = typedArray.byteLength;
  id = id.toString(16) + ":" + tag + binaryLength.toString(16) + ",";
  request.completedRegularChunks.push(id, typedArray);
}
function emitTextChunk(request, id, text) {
  request.pendingChunks++;
  var binaryLength =
    "string" === typeof text
      ? Buffer.byteLength(text, "utf8")
      : text.byteLength;
  id = id.toString(16) + ":T" + binaryLength.toString(16) + ",";
  request.completedRegularChunks.push(id, text);
}
function emitChunk(request, task, value) {
  var id = task.id;
  "string" === typeof value
    ? emitTextChunk(request, id, value)
    : value instanceof ArrayBuffer
    ? emitTypedArrayChunk(request, id, "A", new Uint8Array(value))
    : value instanceof Int8Array
    ? emitTypedArrayChunk(request, id, "O", value)
    : value instanceof Uint8Array
    ? emitTypedArrayChunk(request, id, "o", value)
    : value instanceof Uint8ClampedArray
    ? emitTypedArrayChunk(request, id, "U", value)
    : value instanceof Int16Array
    ? emitTypedArrayChunk(request, id, "S", value)
    : value instanceof Uint16Array
    ? emitTypedArrayChunk(request, id, "s", value)
    : value instanceof Int32Array
    ? emitTypedArrayChunk(request, id, "L", value)
    : value instanceof Uint32Array
    ? emitTypedArrayChunk(request, id, "l", value)
    : value instanceof Float32Array
    ? emitTypedArrayChunk(request, id, "G", value)
    : value instanceof Float64Array
    ? emitTypedArrayChunk(request, id, "g", value)
    : value instanceof BigInt64Array
    ? emitTypedArrayChunk(request, id, "M", value)
    : value instanceof BigUint64Array
    ? emitTypedArrayChunk(request, id, "m", value)
    : value instanceof DataView
    ? emitTypedArrayChunk(request, id, "V", value)
    : ((value = stringify(value, task.toJSON)),
      (task = task.id.toString(16) + ":" + value + "\n"),
      request.completedRegularChunks.push(task));
}
var emptyRoot = {};
function retryTask(request, task) {
  if (0 === task.status)
    try {
      modelRoot = task.model;
      var resolvedModel = renderModelDestructive(
        request,
        task,
        emptyRoot,
        "",
        task.model
      );
      modelRoot = resolvedModel;
      task.keyPath = null;
      task.implicitSlot = !1;
      if ("object" === typeof resolvedModel && null !== resolvedModel)
        request.writtenObjects.set(resolvedModel, serializeByValueID(task.id)),
          emitChunk(request, task, resolvedModel);
      else {
        var json = stringify(resolvedModel),
          processedChunk = task.id.toString(16) + ":" + json + "\n";
        request.completedRegularChunks.push(processedChunk);
      }
      request.abortableTasks.delete(task);
      task.status = 1;
    } catch (thrownValue) {
      var x =
        thrownValue === SuspenseException
          ? getSuspendedThenable()
          : thrownValue;
      if ("object" === typeof x && null !== x && "function" === typeof x.then) {
        var ping = task.ping;
        x.then(ping, ping);
        task.thenableState = getThenableStateAfterSuspending();
      } else {
        request.abortableTasks.delete(task);
        task.status = 4;
        var digest = logRecoverableError(request, x);
        emitErrorChunk(request, task.id, digest);
      }
    } finally {
    }
}
function performWork(request) {
  var prevDispatcher = ReactSharedInternalsServer.H;
  ReactSharedInternalsServer.H = HooksDispatcher;
  var prevRequest = currentRequest;
  currentRequest$1 = currentRequest = request;
  try {
    var pingedTasks = request.pingedTasks;
    request.pingedTasks = [];
    for (var i = 0; i < pingedTasks.length; i++)
      retryTask(request, pingedTasks[i]);
    null !== request.destination &&
      flushCompletedChunks(request, request.destination);
  } catch (error) {
    logRecoverableError(request, error), fatalError(request, error);
  } finally {
    (ReactSharedInternalsServer.H = prevDispatcher),
      (currentRequest$1 = null),
      (currentRequest = prevRequest);
  }
}
function flushCompletedChunks(request, destination) {
  currentView = new Uint8Array(2048);
  writtenBytes = 0;
  destinationHasCapacity = !0;
  try {
    for (
      var importsChunks = request.completedImportChunks, i = 0;
      i < importsChunks.length;
      i++
    )
      if (
        (request.pendingChunks--,
        !writeChunkAndReturn(destination, importsChunks[i]))
      ) {
        request.destination = null;
        i++;
        break;
      }
    importsChunks.splice(0, i);
    var hintChunks = request.completedHintChunks;
    for (i = 0; i < hintChunks.length; i++)
      if (!writeChunkAndReturn(destination, hintChunks[i])) {
        request.destination = null;
        i++;
        break;
      }
    hintChunks.splice(0, i);
    var regularChunks = request.completedRegularChunks;
    for (i = 0; i < regularChunks.length; i++)
      if (
        (request.pendingChunks--,
        !writeChunkAndReturn(destination, regularChunks[i]))
      ) {
        request.destination = null;
        i++;
        break;
      }
    regularChunks.splice(0, i);
    var errorChunks = request.completedErrorChunks;
    for (i = 0; i < errorChunks.length; i++)
      if (
        (request.pendingChunks--,
        !writeChunkAndReturn(destination, errorChunks[i]))
      ) {
        request.destination = null;
        i++;
        break;
      }
    errorChunks.splice(0, i);
  } finally {
    (request.flushScheduled = !1),
      currentView &&
        0 < writtenBytes &&
        destination.write(currentView.subarray(0, writtenBytes)),
      (currentView = null),
      (writtenBytes = 0),
      (destinationHasCapacity = !0);
  }
  "function" === typeof destination.flush && destination.flush();
  0 === request.pendingChunks &&
    (destination.end(), (request.destination = null));
}
function startWork(request) {
  request.flushScheduled = null !== request.destination;
  setImmediate(function () {
    return requestStorage.run(request, performWork, request);
  });
}
function enqueueFlush(request) {
  if (
    !1 === request.flushScheduled &&
    0 === request.pingedTasks.length &&
    null !== request.destination
  ) {
    var destination = request.destination;
    request.flushScheduled = !0;
    setImmediate(function () {
      return flushCompletedChunks(request, destination);
    });
  }
}
function startFlowing(request, destination) {
  if (1 === request.status)
    (request.status = 2), destination.destroy(request.fatalError);
  else if (2 !== request.status && null === request.destination) {
    request.destination = destination;
    try {
      flushCompletedChunks(request, destination);
    } catch (error) {
      logRecoverableError(request, error), fatalError(request, error);
    }
  }
}
function abort(request, reason) {
  try {
    var abortableTasks = request.abortableTasks;
    if (0 < abortableTasks.size) {
      request.pendingChunks++;
      var errorId = request.nextChunkId++,
        error =
          void 0 === reason
            ? Error("The render was aborted by the server without a reason.")
            : reason,
        digest = logRecoverableError(request, error);
      emitErrorChunk(request, errorId, digest, error);
      abortableTasks.forEach(function (task) {
        task.status = 3;
        var ref = serializeByValueID(errorId);
        task = encodeReferenceChunk(request, task.id, ref);
        request.completedErrorChunks.push(task);
      });
      abortableTasks.clear();
    }
    var abortListeners = request.abortListeners;
    if (0 < abortListeners.size) {
      var error$22 =
        void 0 === reason
          ? Error("The render was aborted by the server without a reason.")
          : reason;
      abortListeners.forEach(function (callback) {
        return callback(error$22);
      });
      abortListeners.clear();
    }
    null !== request.destination &&
      flushCompletedChunks(request, request.destination);
  } catch (error$23) {
    logRecoverableError(request, error$23), fatalError(request, error$23);
  }
}
function resolveServerReference(bundlerConfig, id) {
  var idx = id.lastIndexOf("#");
  bundlerConfig = id.slice(0, idx);
  id = id.slice(idx + 1);
  return { specifier: bundlerConfig, name: id };
}
var asyncModuleCache = new Map();
function preloadModule(metadata) {
  var existingPromise = asyncModuleCache.get(metadata.specifier);
  if (existingPromise)
    return "fulfilled" === existingPromise.status ? null : existingPromise;
  var modulePromise = import(metadata.specifier);
  metadata.async &&
    (modulePromise = modulePromise.then(function (value) {
      return value.default;
    }));
  modulePromise.then(
    function (value) {
      var fulfilledThenable = modulePromise;
      fulfilledThenable.status = "fulfilled";
      fulfilledThenable.value = value;
    },
    function (reason) {
      var rejectedThenable = modulePromise;
      rejectedThenable.status = "rejected";
      rejectedThenable.reason = reason;
    }
  );
  asyncModuleCache.set(metadata.specifier, modulePromise);
  return modulePromise;
}
function requireModule(metadata) {
  var moduleExports = asyncModuleCache.get(metadata.specifier);
  if ("fulfilled" === moduleExports.status) moduleExports = moduleExports.value;
  else throw moduleExports.reason;
  return "*" === metadata.name
    ? moduleExports
    : "" === metadata.name
    ? moduleExports.default
    : moduleExports[metadata.name];
}
var hasOwnProperty = Object.prototype.hasOwnProperty;
function Chunk(status, value, reason, response) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
}
Chunk.prototype = Object.create(Promise.prototype);
Chunk.prototype.then = function (resolve, reject) {
  switch (this.status) {
    case "resolved_model":
      initializeModelChunk(this);
  }
  switch (this.status) {
    case "fulfilled":
      resolve(this.value);
      break;
    case "pending":
    case "blocked":
    case "cyclic":
      resolve &&
        (null === this.value && (this.value = []), this.value.push(resolve));
      reject &&
        (null === this.reason && (this.reason = []), this.reason.push(reject));
      break;
    default:
      reject(this.reason);
  }
};
function createPendingChunk(response) {
  return new Chunk("pending", null, null, response);
}
function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) (0, listeners[i])(value);
}
function triggerErrorOnChunk(chunk, error) {
  if ("pending" !== chunk.status && "blocked" !== chunk.status)
    chunk.reason.error(error);
  else {
    var listeners = chunk.reason;
    chunk.status = "rejected";
    chunk.reason = error;
    null !== listeners && wakeChunk(listeners, error);
  }
}
function resolveModelChunk(chunk, value, id) {
  if ("pending" !== chunk.status)
    (chunk = chunk.reason),
      "C" === value[0]
        ? chunk.close("C" === value ? '"$undefined"' : value.slice(1))
        : chunk.enqueueModel(value);
  else {
    var resolveListeners = chunk.value,
      rejectListeners = chunk.reason;
    chunk.status = "resolved_model";
    chunk.value = value;
    chunk.reason = id;
    if (null !== resolveListeners)
      switch ((initializeModelChunk(chunk), chunk.status)) {
        case "fulfilled":
          wakeChunk(resolveListeners, chunk.value);
          break;
        case "pending":
        case "blocked":
        case "cyclic":
          if (chunk.value)
            for (value = 0; value < resolveListeners.length; value++)
              chunk.value.push(resolveListeners[value]);
          else chunk.value = resolveListeners;
          if (chunk.reason) {
            if (rejectListeners)
              for (value = 0; value < rejectListeners.length; value++)
                chunk.reason.push(rejectListeners[value]);
          } else chunk.reason = rejectListeners;
          break;
        case "rejected":
          rejectListeners && wakeChunk(rejectListeners, chunk.reason);
      }
  }
}
function createResolvedIteratorResultChunk(response, value, done) {
  return new Chunk(
    "resolved_model",
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    -1,
    response
  );
}
function resolveIteratorResultChunk(chunk, value, done) {
  resolveModelChunk(
    chunk,
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    -1
  );
}
function loadServerReference$1(
  response,
  id,
  bound,
  parentChunk,
  parentObject,
  key
) {
  var serverReference = resolveServerReference(response._bundlerConfig, id);
  id = preloadModule(serverReference);
  if (bound)
    bound = Promise.all([bound, id]).then(function (_ref) {
      _ref = _ref[0];
      var fn = requireModule(serverReference);
      return fn.bind.apply(fn, [null].concat(_ref));
    });
  else if (id)
    bound = Promise.resolve(id).then(function () {
      return requireModule(serverReference);
    });
  else return requireModule(serverReference);
  bound.then(
    createModelResolver(
      parentChunk,
      parentObject,
      key,
      !1,
      response,
      createModel,
      []
    ),
    createModelReject(parentChunk)
  );
  return null;
}
function reviveModel(response, parentObj, parentKey, value, reference) {
  if ("string" === typeof value)
    return parseModelString(response, parentObj, parentKey, value, reference);
  if ("object" === typeof value && null !== value)
    if (
      (void 0 !== reference &&
        void 0 !== response._temporaryReferences &&
        response._temporaryReferences.set(value, reference),
      Array.isArray(value))
    )
      for (var i = 0; i < value.length; i++)
        value[i] = reviveModel(
          response,
          value,
          "" + i,
          value[i],
          void 0 !== reference ? reference + ":" + i : void 0
        );
    else
      for (i in value)
        hasOwnProperty.call(value, i) &&
          ((parentObj =
            void 0 !== reference && -1 === i.indexOf(":")
              ? reference + ":" + i
              : void 0),
          (parentObj = reviveModel(response, value, i, value[i], parentObj)),
          void 0 !== parentObj ? (value[i] = parentObj) : delete value[i]);
  return value;
}
var initializingChunk = null,
  initializingChunkBlockedModel = null;
function initializeModelChunk(chunk) {
  var prevChunk = initializingChunk,
    prevBlocked = initializingChunkBlockedModel;
  initializingChunk = chunk;
  initializingChunkBlockedModel = null;
  var rootReference = -1 === chunk.reason ? void 0 : chunk.reason.toString(16),
    resolvedModel = chunk.value;
  chunk.status = "cyclic";
  chunk.value = null;
  chunk.reason = null;
  try {
    var rawModel = JSON.parse(resolvedModel),
      value = reviveModel(
        chunk._response,
        { "": rawModel },
        "",
        rawModel,
        rootReference
      );
    if (
      null !== initializingChunkBlockedModel &&
      0 < initializingChunkBlockedModel.deps
    )
      (initializingChunkBlockedModel.value = value), (chunk.status = "blocked");
    else {
      var resolveListeners = chunk.value;
      chunk.status = "fulfilled";
      chunk.value = value;
      null !== resolveListeners && wakeChunk(resolveListeners, value);
    }
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
  } finally {
    (initializingChunk = prevChunk),
      (initializingChunkBlockedModel = prevBlocked);
  }
}
function reportGlobalError(response, error) {
  response._chunks.forEach(function (chunk) {
    "pending" === chunk.status && triggerErrorOnChunk(chunk, error);
  });
}
function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk ||
    ((chunk = response._formData.get(response._prefix + id)),
    (chunk =
      null != chunk
        ? new Chunk("resolved_model", chunk, id, response)
        : createPendingChunk(response)),
    chunks.set(id, chunk));
  return chunk;
}
function createModelResolver(
  chunk,
  parentObject,
  key,
  cyclic,
  response,
  map,
  path
) {
  if (initializingChunkBlockedModel) {
    var blocked = initializingChunkBlockedModel;
    cyclic || blocked.deps++;
  } else
    blocked = initializingChunkBlockedModel = {
      deps: cyclic ? 0 : 1,
      value: null
    };
  return function (value) {
    for (var i = 1; i < path.length; i++) value = value[path[i]];
    parentObject[key] = map(response, value);
    "" === key && null === blocked.value && (blocked.value = parentObject[key]);
    blocked.deps--;
    0 === blocked.deps &&
      "blocked" === chunk.status &&
      ((value = chunk.value),
      (chunk.status = "fulfilled"),
      (chunk.value = blocked.value),
      null !== value && wakeChunk(value, blocked.value));
  };
}
function createModelReject(chunk) {
  return function (error) {
    return triggerErrorOnChunk(chunk, error);
  };
}
function getOutlinedModel(response, reference, parentObject, key, map) {
  reference = reference.split(":");
  var id = parseInt(reference[0], 16);
  id = getChunk(response, id);
  switch (id.status) {
    case "resolved_model":
      initializeModelChunk(id);
  }
  switch (id.status) {
    case "fulfilled":
      parentObject = id.value;
      for (key = 1; key < reference.length; key++)
        parentObject = parentObject[reference[key]];
      return map(response, parentObject);
    case "pending":
    case "blocked":
    case "cyclic":
      var parentChunk = initializingChunk;
      id.then(
        createModelResolver(
          parentChunk,
          parentObject,
          key,
          "cyclic" === id.status,
          response,
          map,
          reference
        ),
        createModelReject(parentChunk)
      );
      return null;
    default:
      throw id.reason;
  }
}
function createMap(response, model) {
  return new Map(model);
}
function createSet(response, model) {
  return new Set(model);
}
function extractIterator(response, model) {
  return model[Symbol.iterator]();
}
function createModel(response, model) {
  return model;
}
function parseTypedArray(
  response,
  reference,
  constructor,
  bytesPerElement,
  parentObject,
  parentKey
) {
  reference = parseInt(reference.slice(2), 16);
  reference = response._formData.get(response._prefix + reference);
  reference =
    constructor === ArrayBuffer
      ? reference.arrayBuffer()
      : reference.arrayBuffer().then(function (buffer) {
          return new constructor(buffer);
        });
  bytesPerElement = initializingChunk;
  reference.then(
    createModelResolver(
      bytesPerElement,
      parentObject,
      parentKey,
      !1,
      response,
      createModel,
      []
    ),
    createModelReject(bytesPerElement)
  );
  return null;
}
function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks;
  stream = new Chunk("fulfilled", stream, controller, response);
  chunks.set(id, stream);
  response = response._formData.getAll(response._prefix + id);
  for (id = 0; id < response.length; id++)
    (chunks = response[id]),
      "C" === chunks[0]
        ? controller.close("C" === chunks ? '"$undefined"' : chunks.slice(1))
        : controller.enqueueModel(chunks);
}
function parseReadableStream(response, reference, type) {
  reference = parseInt(reference.slice(2), 16);
  var controller = null;
  type = new ReadableStream({
    type: type,
    start: function (c) {
      controller = c;
    }
  });
  var previousBlockedChunk = null;
  resolveStream(response, reference, type, {
    enqueueModel: function (json) {
      if (null === previousBlockedChunk) {
        var chunk = new Chunk("resolved_model", json, -1, response);
        initializeModelChunk(chunk);
        "fulfilled" === chunk.status
          ? controller.enqueue(chunk.value)
          : (chunk.then(
              function (v) {
                return controller.enqueue(v);
              },
              function (e) {
                return controller.error(e);
              }
            ),
            (previousBlockedChunk = chunk));
      } else {
        chunk = previousBlockedChunk;
        var chunk$26 = createPendingChunk(response);
        chunk$26.then(
          function (v) {
            return controller.enqueue(v);
          },
          function (e) {
            return controller.error(e);
          }
        );
        previousBlockedChunk = chunk$26;
        chunk.then(function () {
          previousBlockedChunk === chunk$26 && (previousBlockedChunk = null);
          resolveModelChunk(chunk$26, json, -1);
        });
      }
    },
    close: function () {
      if (null === previousBlockedChunk) controller.close();
      else {
        var blockedChunk = previousBlockedChunk;
        previousBlockedChunk = null;
        blockedChunk.then(function () {
          return controller.close();
        });
      }
    },
    error: function (error) {
      if (null === previousBlockedChunk) controller.error(error);
      else {
        var blockedChunk = previousBlockedChunk;
        previousBlockedChunk = null;
        blockedChunk.then(function () {
          return controller.error(error);
        });
      }
    }
  });
  return type;
}
function asyncIterator() {
  return this;
}
function createIterator(next) {
  next = { next: next };
  next[ASYNC_ITERATOR] = asyncIterator;
  return next;
}
function parseAsyncIterable(response, reference, iterator) {
  reference = parseInt(reference.slice(2), 16);
  var buffer = [],
    closed = !1,
    nextWriteIndex = 0,
    $jscomp$compprop2 = {};
  $jscomp$compprop2 =
    (($jscomp$compprop2[ASYNC_ITERATOR] = function () {
      var nextReadIndex = 0;
      return createIterator(function (arg) {
        if (void 0 !== arg)
          throw Error(
            "Values cannot be passed to next() of AsyncIterables passed to Client Components."
          );
        if (nextReadIndex === buffer.length) {
          if (closed)
            return new Chunk(
              "fulfilled",
              { done: !0, value: void 0 },
              null,
              response
            );
          buffer[nextReadIndex] = createPendingChunk(response);
        }
        return buffer[nextReadIndex++];
      });
    }),
    $jscomp$compprop2);
  iterator = iterator ? $jscomp$compprop2[ASYNC_ITERATOR]() : $jscomp$compprop2;
  resolveStream(response, reference, iterator, {
    enqueueModel: function (value) {
      nextWriteIndex === buffer.length
        ? (buffer[nextWriteIndex] = createResolvedIteratorResultChunk(
            response,
            value,
            !1
          ))
        : resolveIteratorResultChunk(buffer[nextWriteIndex], value, !1);
      nextWriteIndex++;
    },
    close: function (value) {
      closed = !0;
      nextWriteIndex === buffer.length
        ? (buffer[nextWriteIndex] = createResolvedIteratorResultChunk(
            response,
            value,
            !0
          ))
        : resolveIteratorResultChunk(buffer[nextWriteIndex], value, !0);
      for (nextWriteIndex++; nextWriteIndex < buffer.length; )
        resolveIteratorResultChunk(
          buffer[nextWriteIndex++],
          '"$undefined"',
          !0
        );
    },
    error: function (error) {
      closed = !0;
      for (
        nextWriteIndex === buffer.length &&
        (buffer[nextWriteIndex] = createPendingChunk(response));
        nextWriteIndex < buffer.length;

      )
        triggerErrorOnChunk(buffer[nextWriteIndex++], error);
    }
  });
  return iterator;
}
function parseModelString(response, obj, key, value, reference) {
  if ("$" === value[0]) {
    switch (value[1]) {
      case "$":
        return value.slice(1);
      case "@":
        return (obj = parseInt(value.slice(2), 16)), getChunk(response, obj);
      case "F":
        return (
          (value = value.slice(2)),
          (value = getOutlinedModel(response, value, obj, key, createModel)),
          loadServerReference$1(
            response,
            value.id,
            value.bound,
            initializingChunk,
            obj,
            key
          )
        );
      case "T":
        if (void 0 === reference || void 0 === response._temporaryReferences)
          throw Error(
            "Could not reference an opaque temporary reference. This is likely due to misconfiguring the temporaryReferences options on the server."
          );
        return createTemporaryReference(
          response._temporaryReferences,
          reference
        );
      case "Q":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, obj, key, createMap)
        );
      case "W":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, obj, key, createSet)
        );
      case "K":
        obj = value.slice(2);
        var formPrefix = response._prefix + obj + "_",
          data = new FormData();
        response._formData.forEach(function (entry, entryKey) {
          entryKey.startsWith(formPrefix) &&
            data.append(entryKey.slice(formPrefix.length), entry);
        });
        return data;
      case "i":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, obj, key, extractIterator)
        );
      case "I":
        return Infinity;
      case "-":
        return "$-0" === value ? -0 : -Infinity;
      case "N":
        return NaN;
      case "u":
        return;
      case "D":
        return new Date(Date.parse(value.slice(2)));
      case "n":
        return BigInt(value.slice(2));
    }
    switch (value[1]) {
      case "A":
        return parseTypedArray(response, value, ArrayBuffer, 1, obj, key);
      case "O":
        return parseTypedArray(response, value, Int8Array, 1, obj, key);
      case "o":
        return parseTypedArray(response, value, Uint8Array, 1, obj, key);
      case "U":
        return parseTypedArray(response, value, Uint8ClampedArray, 1, obj, key);
      case "S":
        return parseTypedArray(response, value, Int16Array, 2, obj, key);
      case "s":
        return parseTypedArray(response, value, Uint16Array, 2, obj, key);
      case "L":
        return parseTypedArray(response, value, Int32Array, 4, obj, key);
      case "l":
        return parseTypedArray(response, value, Uint32Array, 4, obj, key);
      case "G":
        return parseTypedArray(response, value, Float32Array, 4, obj, key);
      case "g":
        return parseTypedArray(response, value, Float64Array, 8, obj, key);
      case "M":
        return parseTypedArray(response, value, BigInt64Array, 8, obj, key);
      case "m":
        return parseTypedArray(response, value, BigUint64Array, 8, obj, key);
      case "V":
        return parseTypedArray(response, value, DataView, 1, obj, key);
      case "B":
        return (
          (obj = parseInt(value.slice(2), 16)),
          response._formData.get(response._prefix + obj)
        );
    }
    switch (value[1]) {
      case "R":
        return parseReadableStream(response, value, void 0);
      case "r":
        return parseReadableStream(response, value, "bytes");
      case "X":
        return parseAsyncIterable(response, value, !1);
      case "x":
        return parseAsyncIterable(response, value, !0);
    }
    value = value.slice(1);
    return getOutlinedModel(response, value, obj, key, createModel);
  }
  return value;
}
function createResponse(bundlerConfig, formFieldPrefix, temporaryReferences) {
  var backingFormData =
      3 < arguments.length && void 0 !== arguments[3]
        ? arguments[3]
        : new FormData(),
    chunks = new Map();
  return {
    _bundlerConfig: bundlerConfig,
    _prefix: formFieldPrefix,
    _formData: backingFormData,
    _chunks: chunks,
    _temporaryReferences: temporaryReferences
  };
}
function resolveField(response, key, value) {
  response._formData.append(key, value);
  var prefix = response._prefix;
  key.startsWith(prefix) &&
    ((response = response._chunks),
    (key = +key.slice(prefix.length)),
    (prefix = response.get(key)) && resolveModelChunk(prefix, value, key));
}
function close(response) {
  reportGlobalError(response, Error("Connection closed."));
}
function loadServerReference(bundlerConfig, id, bound) {
  var serverReference = resolveServerReference(bundlerConfig, id);
  bundlerConfig = preloadModule(serverReference);
  return bound
    ? Promise.all([bound, bundlerConfig]).then(function (_ref) {
        _ref = _ref[0];
        var fn = requireModule(serverReference);
        return fn.bind.apply(fn, [null].concat(_ref));
      })
    : bundlerConfig
    ? Promise.resolve(bundlerConfig).then(function () {
        return requireModule(serverReference);
      })
    : Promise.resolve(requireModule(serverReference));
}
function decodeBoundActionMetaData(body, serverManifest, formFieldPrefix) {
  body = createResponse(serverManifest, formFieldPrefix, void 0, body);
  close(body);
  body = getChunk(body, 0);
  body.then(function () {});
  if ("fulfilled" !== body.status) throw body.reason;
  return body.value;
}
function createDrainHandler(destination, request) {
  return function () {
    return startFlowing(request, destination);
  };
}
function createCancelHandler(request, reason) {
  return function () {
    request.destination = null;
    abort(request, Error(reason));
  };
}
exports.createClientModuleProxy = function (moduleId) {
  moduleId = registerClientReferenceImpl({}, moduleId, !1);
  return new Proxy(moduleId, proxyHandlers$1);
};
exports.createTemporaryReferenceSet = function () {
  return new WeakMap();
};
exports.decodeAction = function (body, serverManifest) {
  var formData = new FormData(),
    action = null;
  body.forEach(function (value, key) {
    key.startsWith("$ACTION_")
      ? key.startsWith("$ACTION_REF_")
        ? ((value = "$ACTION_" + key.slice(12) + ":"),
          (value = decodeBoundActionMetaData(body, serverManifest, value)),
          (action = loadServerReference(serverManifest, value.id, value.bound)))
        : key.startsWith("$ACTION_ID_") &&
          ((value = key.slice(11)),
          (action = loadServerReference(serverManifest, value, null)))
      : formData.append(key, value);
  });
  return null === action
    ? null
    : action.then(function (fn) {
        return fn.bind(null, formData);
      });
};
exports.decodeFormState = function (actionResult, body, serverManifest) {
  var keyPath = body.get("$ACTION_KEY");
  if ("string" !== typeof keyPath) return Promise.resolve(null);
  var metaData = null;
  body.forEach(function (value, key) {
    key.startsWith("$ACTION_REF_") &&
      ((value = "$ACTION_" + key.slice(12) + ":"),
      (metaData = decodeBoundActionMetaData(body, serverManifest, value)));
  });
  if (null === metaData) return Promise.resolve(null);
  var referenceId = metaData.id;
  return Promise.resolve(metaData.bound).then(function (bound) {
    return null === bound
      ? null
      : [actionResult, keyPath, referenceId, bound.length - 1];
  });
};
exports.decodeReply = function (body, webpackMap, options) {
  if ("string" === typeof body) {
    var form = new FormData();
    form.append("0", body);
    body = form;
  }
  body = createResponse(
    webpackMap,
    "",
    options ? options.temporaryReferences : void 0,
    body
  );
  webpackMap = getChunk(body, 0);
  close(body);
  return webpackMap;
};
exports.decodeReplyFromBusboy = function (busboyStream, webpackMap, options) {
  var response = createResponse(
      webpackMap,
      "",
      options ? options.temporaryReferences : void 0
    ),
    pendingFiles = 0,
    queuedFields = [];
  busboyStream.on("field", function (name, value) {
    0 < pendingFiles
      ? queuedFields.push(name, value)
      : resolveField(response, name, value);
  });
  busboyStream.on("file", function (name, value, _ref) {
    var filename = _ref.filename,
      mimeType = _ref.mimeType;
    if ("base64" === _ref.encoding.toLowerCase())
      throw Error(
        "React doesn't accept base64 encoded file uploads because we don't expect form data passed from a browser to ever encode data that way. If that's the wrong assumption, we can easily fix it."
      );
    pendingFiles++;
    var JSCompiler_object_inline_chunks_216 = [];
    value.on("data", function (chunk) {
      JSCompiler_object_inline_chunks_216.push(chunk);
    });
    value.on("end", function () {
      var blob = new Blob(JSCompiler_object_inline_chunks_216, {
        type: mimeType
      });
      response._formData.append(name, blob, filename);
      pendingFiles--;
      if (0 === pendingFiles) {
        for (blob = 0; blob < queuedFields.length; blob += 2)
          resolveField(response, queuedFields[blob], queuedFields[blob + 1]);
        queuedFields.length = 0;
      }
    });
  });
  busboyStream.on("finish", function () {
    close(response);
  });
  busboyStream.on("error", function (err) {
    reportGlobalError(response, err);
  });
  return getChunk(response, 0);
};
exports.registerClientReference = function (
  proxyImplementation,
  id,
  exportName
) {
  return registerClientReferenceImpl(
    proxyImplementation,
    id + "#" + exportName,
    !1
  );
};
exports.registerServerReference = function (reference, id, exportName) {
  return Object.defineProperties(reference, {
    $$typeof: { value: SERVER_REFERENCE_TAG },
    $$id: {
      value: null === exportName ? id : id + "#" + exportName,
      configurable: !0
    },
    $$bound: { value: null, configurable: !0 },
    bind: { value: bind, configurable: !0 }
  });
};
exports.renderToPipeableStream = function (model, webpackMap, options) {
  var request = createRequest(
      model,
      webpackMap,
      options ? options.onError : void 0,
      options ? options.identifierPrefix : void 0,
      options ? options.onPostpone : void 0,
      options ? options.environmentName : void 0,
      options ? options.temporaryReferences : void 0
    ),
    hasStartedFlowing = !1;
  startWork(request);
  return {
    pipe: function (destination) {
      if (hasStartedFlowing)
        throw Error(
          "React currently only supports piping to one writable stream."
        );
      hasStartedFlowing = !0;
      startFlowing(request, destination);
      destination.on("drain", createDrainHandler(destination, request));
      destination.on(
        "error",
        createCancelHandler(
          request,
          "The destination stream errored while writing data."
        )
      );
      destination.on(
        "close",
        createCancelHandler(request, "The destination stream closed early.")
      );
      return destination;
    },
    abort: function (reason) {
      abort(request, reason);
    }
  };
};
