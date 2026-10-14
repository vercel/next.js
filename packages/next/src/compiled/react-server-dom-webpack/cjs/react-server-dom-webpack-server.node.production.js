/**
 * @license React
 * react-server-dom-webpack-server.node.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var stream = require("stream"),
  util = require("util");
require("crypto");
var async_hooks = require("async_hooks"),
  ReactDOM = require("react-dom"),
  React = require("react");
function noop() {}
var REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"),
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
  REACT_CONTEXT_TYPE = Symbol.for("react.context"),
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
  REACT_MEMO_TYPE = Symbol.for("react.memo"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
  REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel"),
  REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
  MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
function getIteratorFn(maybeIterable) {
  if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
  maybeIterable =
    (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
    maybeIterable["@@iterator"];
  return "function" === typeof maybeIterable ? maybeIterable : null;
}
var ASYNC_ITERATOR = Symbol.asyncIterator,
  REACT_OPTIMISTIC_KEY = Symbol.for("react.optimistic_key"),
  hasOwnProperty = Object.prototype.hasOwnProperty,
  supportsArrayBufferDetached = hasOwnProperty.call(
    ArrayBuffer.prototype,
    "detached"
  ),
  scheduleMicrotask = queueMicrotask;
function flushBuffered(destination) {
  "function" === typeof destination.flush && destination.flush();
}
var currentView = null,
  writtenBytes = 0,
  destinationHasCapacity = !0;
function writeChunk(destination, chunk) {
  if ("string" === typeof chunk) {
    if (0 !== chunk.length)
      if (4096 < 3 * chunk.length)
        0 < writtenBytes &&
          (writeToDestination(
            destination,
            currentView.subarray(0, writtenBytes)
          ),
          (currentView = new Uint8Array(4096)),
          (writtenBytes = 0)),
          writeToDestination(destination, chunk);
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
          (currentView = new Uint8Array(4096)),
          (writtenBytes = textEncoder.encodeInto(
            chunk.slice(read),
            currentView
          ).written));
        4096 === writtenBytes &&
          (writeToDestination(destination, currentView),
          (currentView = new Uint8Array(4096)),
          (writtenBytes = 0));
      }
  } else if (0 === chunk.byteLength) {
    if (supportsArrayBufferDetached && chunk.buffer.detached)
      throw Error(
        "Cannot transport a detached buffer. This usually happens when trying to transport multiple buffer-spanning views on the same underyling buffer. Either reuse the exact same view by identity or copy the underlying buffer manually via `view.slice()`."
      );
  } else
    4096 < chunk.byteLength
      ? (0 < writtenBytes &&
          (writeToDestination(
            destination,
            currentView.subarray(0, writtenBytes)
          ),
          (currentView = new Uint8Array(4096)),
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
          (currentView = new Uint8Array(4096)),
          (writtenBytes = 0)),
        currentView.set(chunk, writtenBytes),
        (writtenBytes += chunk.byteLength),
        4096 === writtenBytes &&
          (writeToDestination(destination, currentView),
          (currentView = new Uint8Array(4096)),
          (writtenBytes = 0)));
}
function writeToDestination(destination, view) {
  destination = destination.write(view);
  destinationHasCapacity = destinationHasCapacity && destination;
}
function writeChunkAndReturn(destination, chunk) {
  writeChunk(destination, chunk);
  return destinationHasCapacity;
}
function completeWriting(destination) {
  currentView &&
    0 < writtenBytes &&
    destination.write(currentView.subarray(0, writtenBytes));
  currentView = null;
  writtenBytes = 0;
  destinationHasCapacity = !0;
}
var textEncoder = new util.TextEncoder();
function typedArrayToBinaryChunk(content) {
  var view = new Uint8Array(
    content.buffer,
    content.byteOffset,
    content.byteLength
  );
  return 4096 < content.byteLength &&
    (0 !== content.byteOffset ||
      content.byteLength !== content.buffer.byteLength ||
      content.buffer.resizable ||
      !supportsArrayBufferDetached)
    ? view.slice()
    : view;
}
function byteLengthOfChunk(chunk) {
  return "string" === typeof chunk
    ? Buffer.byteLength(chunk, "utf8")
    : chunk.byteLength;
}
var CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference"),
  SERVER_REFERENCE_TAG = Symbol.for("react.server.reference");
function isClientReference(reference) {
  return reference.$$typeof === CLIENT_REFERENCE_TAG$1;
}
function registerClientReferenceImpl(proxyImplementation, id, async) {
  return Object.defineProperties(proxyImplementation, {
    $$typeof: { value: CLIENT_REFERENCE_TAG$1 },
    $$id: { value: id },
    $$async: { value: async }
  });
}
var FunctionBind$1 = Function.prototype.bind,
  ArraySlice$1 = Array.prototype.slice;
function bind() {
  var newFn = FunctionBind$1.apply(this, arguments);
  if (this.$$typeof === SERVER_REFERENCE_TAG) {
    var args = ArraySlice$1.call(arguments, 1),
      $$typeof = { value: SERVER_REFERENCE_TAG },
      $$id = { value: this.$$id };
    args = { value: this.$$bound ? this.$$bound.concat(args) : args };
    return Object.defineProperties(newFn, {
      $$typeof: $$typeof,
      $$id: $$id,
      $$bound: args,
      bind: { value: bind, configurable: !0 }
    });
  }
  return newFn;
}
var serverReferenceToString = {
  value: function () {
    return "function () { [omitted code] }";
  },
  configurable: !0,
  writable: !0
};
function registerServerReference(reference, id, exportName) {
  return Object.defineProperties(reference, {
    $$typeof: { value: SERVER_REFERENCE_TAG },
    $$id: {
      value: null === exportName ? id : id + "#" + exportName,
      configurable: !0
    },
    $$bound: { value: null, configurable: !0 },
    bind: { value: bind, configurable: !0 },
    toString: serverReferenceToString
  });
}
var PROMISE_PROTOTYPE = Promise.prototype,
  deepProxyHandlers = {
    get: function (target, name, receiver) {
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
        case "_debugInfo":
          return;
        case "toJSON":
          return;
        case Symbol.toPrimitive:
          return Object.prototype[Symbol.toPrimitive];
        case Symbol.toStringTag:
          return Object.prototype[Symbol.toStringTag];
        case "Provider":
          return receiver;
        case "then":
          throw Error(
            "Cannot await or return from a thenable. You cannot await a client module from a server component."
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
    case "_debugInfo":
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
};
function resolveClientReferenceMetadata(config, clientReference) {
  var modulePath = clientReference.$$id,
    name = "",
    resolvedModuleData = config[modulePath];
  if (resolvedModuleData) name = resolvedModuleData.name;
  else {
    var idx = modulePath.lastIndexOf("#");
    -1 !== idx &&
      ((name = modulePath.slice(idx + 1)),
      (resolvedModuleData = config[modulePath.slice(0, idx)]));
    if (!resolvedModuleData)
      throw Error(
        'Could not find the module "' +
          modulePath +
          '" in the React Client Manifest. This is probably a bug in the React Server Components bundler.'
      );
  }
  if (!0 === resolvedModuleData.async && !0 === clientReference.$$async)
    throw Error(
      'The module "' +
        modulePath +
        '" is marked as an async ESM module but was loaded as a CJS proxy. This is probably a bug in the React Server Components bundler.'
    );
  return !0 === resolvedModuleData.async || !0 === clientReference.$$async
    ? [resolvedModuleData.id, resolvedModuleData.chunks, name, 1]
    : [resolvedModuleData.id, resolvedModuleData.chunks, name];
}
var ReactDOMSharedInternals =
    ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  previousDispatcher$1 = ReactDOMSharedInternals.d;
ReactDOMSharedInternals.d = {
  f: previousDispatcher$1.f,
  r: previousDispatcher$1.r,
  D: prefetchDNS$1,
  C: preconnect$1,
  L: preload$1,
  m: preloadModule$2,
  X: preinitScript$1,
  S: preinitStyle$1,
  M: preinitModuleScript$1
};
function prefetchDNS$1(href) {
  if ("string" === typeof href && href) {
    var request = resolveRequest$1();
    if (request) {
      var hints = request.hints,
        key = "D|" + href;
      hints.has(key) || (hints.add(key), emitHint$2(request, "D", href));
    } else previousDispatcher$1.D(href);
  }
}
function preconnect$1(href, crossOrigin) {
  if ("string" === typeof href) {
    var request = resolveRequest$1();
    if (request) {
      var hints = request.hints,
        key = "C|" + (null == crossOrigin ? "null" : crossOrigin) + "|" + href;
      hints.has(key) ||
        (hints.add(key),
        "string" === typeof crossOrigin
          ? emitHint$2(request, "C", [href, crossOrigin])
          : emitHint$2(request, "C", href));
    } else previousDispatcher$1.C(href, crossOrigin);
  }
}
function preload$1(href, as, options) {
  if ("string" === typeof href) {
    var request = resolveRequest$1();
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
        (options = trimOptions$1(options))
          ? emitHint$2(request, "L", [href, as, options])
          : emitHint$2(request, "L", [href, as]));
    } else previousDispatcher$1.L(href, as, options);
  }
}
function preloadModule$2(href, options) {
  if ("string" === typeof href) {
    var request = resolveRequest$1();
    if (request) {
      var hints = request.hints,
        key = "m|" + href;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions$1(options))
        ? emitHint$2(request, "m", [href, options])
        : emitHint$2(request, "m", href);
    }
    previousDispatcher$1.m(href, options);
  }
}
function preinitStyle$1(href, precedence, options) {
  if ("string" === typeof href) {
    var request = resolveRequest$1();
    if (request) {
      var hints = request.hints,
        key = "S|" + href;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions$1(options))
        ? emitHint$2(request, "S", [
            href,
            "string" === typeof precedence ? precedence : 0,
            options
          ])
        : "string" === typeof precedence
          ? emitHint$2(request, "S", [href, precedence])
          : emitHint$2(request, "S", href);
    }
    previousDispatcher$1.S(href, precedence, options);
  }
}
function preinitScript$1(src, options) {
  if ("string" === typeof src) {
    var request = resolveRequest$1();
    if (request) {
      var hints = request.hints,
        key = "X|" + src;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions$1(options))
        ? emitHint$2(request, "X", [src, options])
        : emitHint$2(request, "X", src);
    }
    previousDispatcher$1.X(src, options);
  }
}
function preinitModuleScript$1(src, options) {
  if ("string" === typeof src) {
    var request = resolveRequest$1();
    if (request) {
      var hints = request.hints,
        key = "M|" + src;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions$1(options))
        ? emitHint$2(request, "M", [src, options])
        : emitHint$2(request, "M", src);
    }
    previousDispatcher$1.M(src, options);
  }
}
function trimOptions$1(options) {
  if (null == options) return null;
  var hasProperties = !1,
    trimmed = {},
    key;
  for (key in options)
    null != options[key] &&
      ((hasProperties = !0), (trimmed[key] = options[key]));
  return hasProperties ? trimmed : null;
}
function getCrossOriginString(input) {
  if ("string" === typeof input)
    return "use-credentials" === input ? input : "";
}
function getChildFormatContext$1(parentContext, type, props) {
  switch (type) {
    case "img":
      type = props.src;
      var srcSet = props.srcSet;
      if (
        !(
          "lazy" === props.loading ||
          (!type && !srcSet) ||
          ("string" !== typeof type && null != type) ||
          ("string" !== typeof srcSet && null != srcSet) ||
          "low" === props.fetchPriority ||
          parentContext & 3
        ) &&
        ("string" !== typeof type ||
          ":" !== type[4] ||
          ("d" !== type[0] && "D" !== type[0]) ||
          ("a" !== type[1] && "A" !== type[1]) ||
          ("t" !== type[2] && "T" !== type[2]) ||
          ("a" !== type[3] && "A" !== type[3])) &&
        ("string" !== typeof srcSet ||
          ":" !== srcSet[4] ||
          ("d" !== srcSet[0] && "D" !== srcSet[0]) ||
          ("a" !== srcSet[1] && "A" !== srcSet[1]) ||
          ("t" !== srcSet[2] && "T" !== srcSet[2]) ||
          ("a" !== srcSet[3] && "A" !== srcSet[3]))
      ) {
        var sizes = "string" === typeof props.sizes ? props.sizes : void 0,
          crossOrigin = getCrossOriginString(props.crossOrigin);
        preload$1(type || "", "image", {
          imageSrcSet: srcSet,
          imageSizes: sizes,
          crossOrigin: crossOrigin,
          integrity: props.integrity,
          type: props.type,
          fetchPriority: props.fetchPriority,
          referrerPolicy: props.referrerPolicy
        });
      }
      return parentContext;
    case "link":
      type = props.rel;
      srcSet = props.href;
      if (
        !(
          parentContext & 1 ||
          null != props.itemProp ||
          "string" !== typeof type ||
          "string" !== typeof srcSet ||
          "" === srcSet
        )
      )
        switch (type) {
          case "preload":
            preload$1(srcSet, props.as, {
              crossOrigin: props.crossOrigin,
              integrity: props.integrity,
              nonce: props.nonce,
              type: props.type,
              fetchPriority: props.fetchPriority,
              referrerPolicy: props.referrerPolicy,
              imageSrcSet: props.imageSrcSet,
              imageSizes: props.imageSizes,
              media: props.media
            });
            break;
          case "modulepreload":
            preloadModule$2(srcSet, {
              as: props.as,
              crossOrigin: props.crossOrigin,
              integrity: props.integrity,
              nonce: props.nonce
            });
            break;
          case "stylesheet":
            preload$1(srcSet, "style", {
              crossOrigin: props.crossOrigin,
              integrity: props.integrity,
              nonce: props.nonce,
              type: props.type,
              fetchPriority: props.fetchPriority,
              referrerPolicy: props.referrerPolicy,
              media: props.media
            });
        }
      return parentContext;
    case "picture":
      return parentContext | 2;
    case "noscript":
      return parentContext | 1;
    default:
      return parentContext;
  }
}
var currentCache = null;
function setCurrentCache(cache) {
  var previousCache = currentCache;
  currentCache = cache;
  return previousCache;
}
function resolveCache() {
  if (currentCache) return currentCache;
  var cache = cacheStorage.getStore();
  return cache ? cache : null;
}
var requestStorage = new async_hooks.AsyncLocalStorage(),
  cacheStorage = new async_hooks.AsyncLocalStorage(),
  TEMPORARY_REFERENCE_TAG = Symbol.for("react.temporary.reference"),
  proxyHandlers = {
    get: function (target, name, receiver) {
      switch (name) {
        case "$$typeof":
          return target.$$typeof;
        case "name":
          return;
        case "displayName":
          return;
        case "defaultProps":
          return;
        case "_debugInfo":
          return;
        case "toJSON":
          return;
        case Symbol.toPrimitive:
          return Object.prototype[Symbol.toPrimitive];
        case Symbol.toStringTag:
          return Object.prototype[Symbol.toStringTag];
        case "Provider":
          return receiver;
        case "then":
          return;
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
var SuspenseException = Error(
  "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
);
function trackUsedThenable(thenableState, thenable, index) {
  index = thenableState[index];
  void 0 === index
    ? thenableState.push(thenable)
    : index !== thenable && (thenable.then(noop, noop), (thenable = index));
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      thenableState = thenable.reason;
      if (void 0 === thenableState && !("reason" in thenable))
        throw Error(
          "A rejected Promise was passed to React without a `reason` property. React threw a generic error from where the Promise was used to assist in identifying the problematic Promise. Make sure that instrumented Promises correctly set the `reason` property when setting `status` to `'rejected'`."
        );
      throw thenableState;
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
var currentRequest$2 = null,
  thenableIndexCounter$1 = 0,
  thenableState$1 = null;
function getThenableStateAfterSuspending$1() {
  var state = thenableState$1 || [];
  thenableState$1 = null;
  return state;
}
var HooksDispatcher$1 = {
  readContext: unsupportedContext$1,
  use: use$1,
  useCallback: function (callback) {
    return callback;
  },
  useContext: unsupportedContext$1,
  useEffect: unsupportedHook$1,
  useImperativeHandle: unsupportedHook$1,
  useLayoutEffect: unsupportedHook$1,
  useInsertionEffect: unsupportedHook$1,
  useMemo: function (nextCreate) {
    return nextCreate();
  },
  useReducer: unsupportedHook$1,
  useRef: unsupportedHook$1,
  useState: unsupportedHook$1,
  useDebugValue: function () {},
  useDeferredValue: unsupportedHook$1,
  useTransition: unsupportedHook$1,
  useSyncExternalStore: unsupportedHook$1,
  useId: useId$1,
  useHostTransitionStatus: unsupportedHook$1,
  useFormState: unsupportedHook$1,
  useActionState: unsupportedHook$1,
  useOptimistic: unsupportedHook$1,
  useMemoCache: function (size) {
    for (var data = Array(size), i = 0; i < size; i++)
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    return data;
  },
  useCacheRefresh: function () {
    return unsupportedRefresh$1;
  },
  useEffectEvent: unsupportedHook$1
};
function unsupportedHook$1() {
  throw Error("This Hook is not supported in Server Components.");
}
function unsupportedRefresh$1() {
  throw Error("Refreshing the cache is not supported in Server Components.");
}
function unsupportedContext$1() {
  throw Error("Cannot read a Client Context from a Server Component.");
}
function useId$1() {
  if (null === currentRequest$2)
    throw Error("useId can only be used while React is rendering");
  var id = currentRequest$2.identifierCount++;
  return "_" + currentRequest$2.identifierPrefix + "S_" + id.toString(32) + "_";
}
function use$1(usable) {
  if (
    (null !== usable && "object" === typeof usable) ||
    "function" === typeof usable
  ) {
    if ("function" === typeof usable.then) {
      var index = thenableIndexCounter$1;
      thenableIndexCounter$1 += 1;
      null === thenableState$1 && (thenableState$1 = []);
      return trackUsedThenable(thenableState$1, usable, index);
    }
    usable.$$typeof === REACT_CONTEXT_TYPE && unsupportedContext$1();
  }
  if (isClientReference(usable)) {
    if (null != usable.value && usable.value.$$typeof === REACT_CONTEXT_TYPE)
      throw Error("Cannot read a Client Context from a Server Component.");
    throw Error("Cannot use() an already resolved Client Reference.");
  }
  throw Error("An unsupported type was passed to use(): " + String(usable));
}
var DefaultAsyncDispatcher = {
    getCacheForType: function (resourceType) {
      var context = resolveCache();
      context = context ? context.cache : new Map();
      var entry = context.get(resourceType);
      void 0 === entry &&
        ((entry = resourceType()), context.set(resourceType, entry));
      return entry;
    },
    cacheSignal: function () {
      var context = resolveCache();
      return context ? context.cacheController.signal : null;
    }
  },
  ReactSharedInternalsServer =
    React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
if (!ReactSharedInternalsServer)
  throw Error(
    'The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled in any environment that runs React Server Components.'
  );
var isArrayImpl = Array.isArray,
  getPrototypeOf$2 = Object.getPrototypeOf;
new WeakMap();
function objectName(object) {
  object = Object.prototype.toString.call(object);
  return object.slice(8, object.length - 1);
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
    case REACT_VIEW_TRANSITION_TYPE:
      return "ViewTransition";
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
var ObjectPrototype$3 = Object.prototype,
  stringify$1 = JSON.stringify,
  NEXT_TWO_CHUNKS_ARE_ATOMIC$1 = Symbol();
function defaultErrorHandler$2(error) {
  console.error(error);
}
function RequestInstance$2(
  type,
  model,
  bundlerConfig,
  onError,
  onAllReady,
  onFatalError,
  identifierPrefix,
  temporaryReferences
) {
  if (
    null !== ReactSharedInternalsServer.A &&
    ReactSharedInternalsServer.A !== DefaultAsyncDispatcher
  )
    throw Error("Currently React only supports one RSC renderer at a time.");
  ReactSharedInternalsServer.A = DefaultAsyncDispatcher;
  var abortSet = new Set(),
    pingedTasks = [],
    hints = new Set();
  this.type = type;
  this.status = 10;
  this.flushScheduled = !1;
  this.destination = this.fatalError = null;
  this.bundlerConfig = bundlerConfig;
  this.cache = new Map();
  this.cacheController = new AbortController();
  this.pendingChunks = this.nextChunkId = 0;
  this.hints = hints;
  this.abortableTasks = abortSet;
  this.pingedTasks = pingedTasks;
  this.completedImportChunks = [];
  this.completedHintChunks = [];
  this.completedRegularChunks = [];
  this.completedErrorChunks = [];
  this.writtenSymbols = new Map();
  this.writtenClientReferences = new Map();
  this.writtenServerReferences = new Map();
  this.writtenObjects = new WeakMap();
  this.writtenImportStrings = new Map();
  this.writtenImportStringsSize = 0;
  this.temporaryReferences = temporaryReferences;
  this.identifierPrefix = identifierPrefix || "";
  this.identifierCount = 1;
  this.taintCleanupQueue = [];
  this.onError = void 0 === onError ? defaultErrorHandler$2 : onError;
  this.onAllReady = onAllReady;
  this.onFatalError = onFatalError;
  type = createTask$2(this, model, null, !1, 0, abortSet);
  pingedTasks.push(type);
}
var currentRequest$1 = null;
function resolveRequest$1() {
  if (currentRequest$1) return currentRequest$1;
  var store = requestStorage.getStore();
  return store ? store : null;
}
function serializeThenable$1(request, task, thenable) {
  switch (thenable.status) {
    case "fulfilled":
      return (
        (task = createTask$2(
          request,
          thenable,
          task.keyPath,
          task.implicitSlot,
          task.formatContext,
          request.abortableTasks
        )),
        (task.model = thenable.value),
        pingTask$2(request, task),
        task.id
      );
    case "rejected":
      return (
        (task = createTask$2(
          request,
          thenable,
          task.keyPath,
          task.implicitSlot,
          task.formatContext,
          request.abortableTasks
        )),
        erroredTask$2(request, task, thenable.reason),
        task.id
      );
    default:
      var newTask$14 = createTask$2(
        request,
        thenable,
        task.keyPath,
        task.implicitSlot,
        task.formatContext,
        request.abortableTasks
      );
      if (12 === request.status)
        return (
          request.abortableTasks.delete(newTask$14),
          21 === request.type
            ? (haltTask$1(newTask$14), finishHaltedTask$1(newTask$14, request))
            : ((task = request.fatalError),
              abortTask$2(newTask$14),
              finishAbortedTask$1(newTask$14, request, task)),
          newTask$14.id
        );
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
      thenable.then(
        function (value) {
          newTask$14.model = value;
          pingTask$2(request, newTask$14);
        },
        function (reason) {
          0 === newTask$14.status &&
            (erroredTask$2(request, newTask$14, reason),
            enqueueFlush$1(request));
        }
      );
      return newTask$14.id;
  }
}
function serializeReadableStream$1(request, task, stream) {
  function progress(entry) {
    if (0 === streamTask.status)
      if (entry.done)
        (streamTask.status = 1),
          (entry = streamTask.id.toString(16) + ":C\n"),
          request.completedRegularChunks.push(entry),
          request.abortableTasks.delete(streamTask),
          request.cacheController.signal.removeEventListener(
            "abort",
            abortStream
          ),
          enqueueFlush$1(request),
          callOnAllReadyIfReady(request);
      else
        try {
          request.pendingChunks++,
            (streamTask.model = entry.value),
            isByteStream
              ? emitTypedArrayChunk$1(
                  request,
                  streamTask.id,
                  "b",
                  streamTask.model,
                  !1
                )
              : tryStreamTask$2(request, streamTask),
            enqueueFlush$1(request),
            reader.read().then(progress, error);
        } catch (x$15) {
          error(x$15);
        }
  }
  function error(reason) {
    0 === streamTask.status &&
      (request.cacheController.signal.removeEventListener("abort", abortStream),
      erroredTask$2(request, streamTask, reason),
      enqueueFlush$1(request),
      reader.cancel(reason).then(error, error));
  }
  function abortStream() {
    if (0 === streamTask.status) {
      var signal = request.cacheController.signal;
      signal.removeEventListener("abort", abortStream);
      signal = signal.reason;
      21 === request.type
        ? (request.abortableTasks.delete(streamTask),
          haltTask$1(streamTask),
          finishHaltedTask$1(streamTask, request))
        : (erroredTask$2(request, streamTask, signal), enqueueFlush$1(request));
      reader.cancel(signal).then(error, error);
    }
  }
  var supportsBYOB = stream.supportsBYOB;
  if (void 0 === supportsBYOB)
    try {
      stream.getReader({ mode: "byob" }).releaseLock(), (supportsBYOB = !0);
    } catch (x) {
      supportsBYOB = !1;
    }
  var isByteStream = supportsBYOB,
    reader = stream.getReader(),
    streamTask = createTask$2(
      request,
      task.model,
      task.keyPath,
      task.implicitSlot,
      task.formatContext,
      request.abortableTasks
    );
  request.pendingChunks++;
  task = streamTask.id.toString(16) + ":" + (isByteStream ? "r" : "R") + "\n";
  request.completedRegularChunks.push(task);
  request.cacheController.signal.addEventListener("abort", abortStream);
  reader.read().then(progress, error);
  return serializeByValueID$1(streamTask.id);
}
function serializeAsyncIterable$1(request, task, iterable, iterator) {
  function progress(entry) {
    if (0 === streamTask.status)
      if (entry.done) {
        streamTask.status = 1;
        if (void 0 === entry.value)
          var endStreamRow = streamTask.id.toString(16) + ":C\n";
        else
          try {
            var chunkId = outlineModelWithFormatContext$1(
              request,
              entry.value,
              0
            );
            endStreamRow =
              streamTask.id.toString(16) +
              ":C" +
              stringify$1(serializeByValueID$1(chunkId)) +
              "\n";
          } catch (x) {
            error(x);
            return;
          }
        request.completedRegularChunks.push(endStreamRow);
        request.abortableTasks.delete(streamTask);
        request.cacheController.signal.removeEventListener(
          "abort",
          abortIterable
        );
        enqueueFlush$1(request);
        callOnAllReadyIfReady(request);
      } else
        try {
          (streamTask.model = entry.value),
            request.pendingChunks++,
            tryStreamTask$2(request, streamTask),
            enqueueFlush$1(request),
            iterator.next().then(progress, error);
        } catch (x$16) {
          error(x$16);
        }
  }
  function error(reason) {
    0 === streamTask.status &&
      (request.cacheController.signal.removeEventListener(
        "abort",
        abortIterable
      ),
      erroredTask$2(request, streamTask, reason),
      enqueueFlush$1(request),
      "function" === typeof iterator.throw &&
        iterator.throw(reason).then(noop, noop));
  }
  function abortIterable() {
    if (0 === streamTask.status) {
      var signal = request.cacheController.signal;
      signal.removeEventListener("abort", abortIterable);
      var reason = signal.reason;
      21 === request.type
        ? (request.abortableTasks.delete(streamTask),
          haltTask$1(streamTask),
          finishHaltedTask$1(streamTask, request))
        : (erroredTask$2(request, streamTask, signal.reason),
          enqueueFlush$1(request));
      "function" === typeof iterator.throw &&
        iterator.throw(reason).then(noop, noop);
    }
  }
  iterable = iterable === iterator;
  var streamTask = createTask$2(
    request,
    task.model,
    task.keyPath,
    task.implicitSlot,
    task.formatContext,
    request.abortableTasks
  );
  request.pendingChunks++;
  task = streamTask.id.toString(16) + ":" + (iterable ? "x" : "X") + "\n";
  request.completedRegularChunks.push(task);
  request.cacheController.signal.addEventListener("abort", abortIterable);
  iterator.next().then(progress, error);
  return serializeByValueID$1(streamTask.id);
}
function emitHint$2(request, code, model) {
  model = stringify$1(model);
  request.completedHintChunks.push(":H" + code + model + "\n");
  enqueueFlush$1(request);
}
function readThenable$1(thenable) {
  if ("fulfilled" === thenable.status) return thenable.value;
  if ("rejected" === thenable.status) throw thenable.reason;
  throw thenable;
}
function createLazyWrapperAroundWakeable$1(request, task, wakeable) {
  switch (wakeable.status) {
    case "fulfilled":
      return wakeable.value;
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
  return {
    $$typeof: REACT_LAZY_TYPE,
    _payload: wakeable,
    _init: readThenable$1
  };
}
function voidHandler() {}
function processServerComponentReturnValue(request, task, Component, result) {
  if (
    "object" !== typeof result ||
    null === result ||
    isClientReference(result)
  )
    return result;
  if ("function" === typeof result.then)
    return createLazyWrapperAroundWakeable$1(request, task, result);
  var iteratorFn = getIteratorFn(result);
  return iteratorFn
    ? ((request = {}),
      (request[Symbol.iterator] = function () {
        return iteratorFn.call(result);
      }),
      request)
    : "function" !== typeof result[ASYNC_ITERATOR] ||
        ("function" === typeof ReadableStream &&
          result instanceof ReadableStream)
      ? result
      : ((request = {}),
        (request[ASYNC_ITERATOR] = function () {
          return result[ASYNC_ITERATOR]();
        }),
        request);
}
function renderFunctionComponent$1(request, task, key, Component, props) {
  var prevThenableState = task.thenableState;
  task.thenableState = null;
  thenableIndexCounter$1 = 0;
  thenableState$1 = prevThenableState;
  props = Component(props, void 0);
  if (12 === request.status)
    throw (
      ("object" !== typeof props ||
        null === props ||
        "function" !== typeof props.then ||
        isClientReference(props) ||
        props.then(voidHandler, voidHandler),
      null)
    );
  props = processServerComponentReturnValue(request, task, Component, props);
  Component = task.keyPath;
  prevThenableState = task.implicitSlot;
  null !== key
    ? (task.keyPath =
        key === REACT_OPTIMISTIC_KEY || Component === REACT_OPTIMISTIC_KEY
          ? REACT_OPTIMISTIC_KEY
          : null === Component
            ? key
            : Component + "," + key)
    : null === Component && (task.implicitSlot = !0);
  request = renderModelDestructive$2(request, task, emptyRoot$1, "", props);
  task.keyPath = Component;
  task.implicitSlot = prevThenableState;
  return request;
}
function renderFragment$1(request, task, children) {
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
var serializedSize$1 = 0;
function deferTask$2(request, task) {
  task = createTask$2(
    request,
    task.model,
    task.keyPath,
    task.implicitSlot,
    task.formatContext,
    request.abortableTasks
  );
  pingTask$2(request, task);
  return serializeLazyID$1(task.id);
}
function renderElement$1(request, task, type, key, ref, props) {
  if (null !== ref && void 0 !== ref)
    throw Error(
      "Refs cannot be used in Server Components, nor passed to Client Components."
    );
  if (
    "function" !== typeof type ||
    isClientReference(type) ||
    type.$$typeof === TEMPORARY_REFERENCE_TAG
  ) {
    if (type === REACT_FRAGMENT_TYPE && null === key)
      return (
        (type = task.implicitSlot),
        null === task.keyPath && (task.implicitSlot = !0),
        (props = renderModelDestructive$2(
          request,
          task,
          emptyRoot$1,
          "",
          props.children
        )),
        (task.implicitSlot = type),
        props
      );
    if (null == type || "object" !== typeof type || isClientReference(type))
      "string" === typeof type &&
        ((ref = task.formatContext),
        (init = getChildFormatContext$1(ref, type, props)),
        ref !== init &&
          null != props.children &&
          outlineModelWithFormatContext$1(request, props.children, init));
    else
      switch (type.$$typeof) {
        case REACT_LAZY_TYPE:
          var init = type._init;
          type = init(type._payload);
          if (12 === request.status) throw null;
          return renderElement$1(request, task, type, key, ref, props);
        case REACT_FORWARD_REF_TYPE:
          return renderFunctionComponent$1(
            request,
            task,
            key,
            type.render,
            props
          );
        case REACT_MEMO_TYPE:
          return renderElement$1(request, task, type.type, key, ref, props);
      }
  } else return renderFunctionComponent$1(request, task, key, type, props);
  request = key;
  key = task.keyPath;
  null === request
    ? (request = key)
    : null !== key &&
      (request =
        key === REACT_OPTIMISTIC_KEY || request === REACT_OPTIMISTIC_KEY
          ? REACT_OPTIMISTIC_KEY
          : key + "," + request);
  props = [REACT_ELEMENT_TYPE, type, request, props];
  task = task.implicitSlot && null !== request ? [props] : props;
  return task;
}
function pingTask$2(request, task) {
  var pingedTasks = request.pingedTasks;
  pingedTasks.push(task);
  1 === pingedTasks.length &&
    ((request.flushScheduled = null !== request.destination),
    21 === request.type || 10 === request.status
      ? scheduleMicrotask(function () {
          return performWork$2(request);
        })
      : setImmediate(function () {
          return performWork$2(request);
        }));
}
function createTask$2(
  request,
  model,
  keyPath,
  implicitSlot,
  formatContext,
  abortSet
) {
  return createTaskWithID(
    request,
    request.nextChunkId++,
    model,
    keyPath,
    implicitSlot,
    formatContext,
    abortSet
  );
}
function createTaskWithID(
  request,
  id,
  model,
  keyPath,
  implicitSlot,
  formatContext,
  abortSet
) {
  request.pendingChunks++;
  "object" !== typeof model ||
    null === model ||
    null !== keyPath ||
    implicitSlot ||
    request.writtenObjects.set(model, serializeByValueID$1(id));
  var task = {
    id: id,
    status: 0,
    model: model,
    keyPath: keyPath,
    implicitSlot: implicitSlot,
    formatContext: formatContext,
    ping: function () {
      return pingTask$2(request, task);
    },
    thenableState: null
  };
  abortSet.add(task);
  return task;
}
function resolveModel$2(request, task, parent, parentPropertyName, value) {
  var jsonValue = value;
  null !== value &&
    "object" === typeof value &&
    "function" === typeof value.toJSON &&
    (jsonValue = value.toJSON(parentPropertyName));
  serializedSize$1 += parentPropertyName.length;
  value = task.keyPath;
  var prevImplicitSlot = task.implicitSlot;
  try {
    var JSCompiler_inline_result = renderModelDestructive$2(
      request,
      task,
      parent,
      parentPropertyName,
      jsonValue
    );
  } catch (thrownValue) {
    (parent = task.model),
      (parent =
        "object" === typeof parent &&
        null !== parent &&
        (parent.$$typeof === REACT_ELEMENT_TYPE ||
          parent.$$typeof === REACT_LAZY_TYPE)),
      12 === request.status
        ? ((task.status = 3),
          21 === request.type
            ? ((value = request.nextChunkId++),
              (value = parent
                ? serializeLazyID$1(value)
                : serializeByValueID$1(value)),
              (JSCompiler_inline_result = value))
            : ((value = request.fatalError),
              (JSCompiler_inline_result = parent
                ? serializeLazyID$1(value)
                : serializeByValueID$1(value))))
        : ((parentPropertyName =
            thrownValue === SuspenseException
              ? getSuspendedThenable()
              : thrownValue),
          "object" === typeof parentPropertyName &&
          null !== parentPropertyName &&
          "function" === typeof parentPropertyName.then
            ? ((jsonValue = createTask$2(
                request,
                task.model,
                task.keyPath,
                task.implicitSlot,
                task.formatContext,
                request.abortableTasks
              )),
              (JSCompiler_inline_result = jsonValue.ping),
              parentPropertyName.then(
                JSCompiler_inline_result,
                JSCompiler_inline_result
              ),
              (jsonValue.thenableState = getThenableStateAfterSuspending$1()),
              (task.keyPath = value),
              (task.implicitSlot = prevImplicitSlot),
              (JSCompiler_inline_result = parent
                ? serializeLazyID$1(jsonValue.id)
                : serializeByValueID$1(jsonValue.id)))
            : ((task.keyPath = value),
              (task.implicitSlot = prevImplicitSlot),
              request.pendingChunks++,
              (value = request.nextChunkId++),
              (prevImplicitSlot = logRecoverableError$2(
                request,
                parentPropertyName,
                task
              )),
              emitErrorChunk$1(request, value, prevImplicitSlot),
              (JSCompiler_inline_result = parent
                ? serializeLazyID$1(value)
                : serializeByValueID$1(value))));
  }
  value = JSCompiler_inline_result;
  if (null === value || "object" !== typeof value) return value;
  if (isArrayImpl(value)) {
    var resolved$18 = [];
    for (
      prevImplicitSlot = 0;
      prevImplicitSlot < value.length;
      prevImplicitSlot++
    )
      resolved$18[prevImplicitSlot] = resolveModel$2(
        request,
        task,
        value,
        "" + prevImplicitSlot,
        value[prevImplicitSlot]
      );
    return resolved$18;
  }
  prevImplicitSlot = {};
  for (resolved$18 in value)
    hasOwnProperty.call(value, resolved$18) &&
      ((parent = resolveModel$2(
        request,
        task,
        value,
        resolved$18,
        value[resolved$18]
      )),
      "__proto__" === resolved$18
        ? Object.defineProperty(prevImplicitSlot, resolved$18, {
            value: parent,
            enumerable: !0,
            writable: !0,
            configurable: !0
          })
        : (prevImplicitSlot[resolved$18] = parent));
  return prevImplicitSlot;
}
function serializeByValueID$1(id) {
  return "$" + id.toString(16);
}
function serializeLazyID$1(id) {
  return "$L" + id.toString(16);
}
function encodeReferenceChunk$1(request, id, reference) {
  request = stringify$1(reference);
  return id.toString(16) + ":" + request + "\n";
}
function serializeClientReference$1(
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
      ? serializeLazyID$1(existingId)
      : serializeByValueID$1(existingId);
  try {
    var clientReferenceMetadata = resolveClientReferenceMetadata(
      request.bundlerConfig,
      clientReference
    );
    var copy = transformImportMetadata$1(request, clientReferenceMetadata, 0);
    if (copy !== NOT_PLAIN_IMPORT_METADATA$1)
      var JSCompiler_temp = stringify$1(copy);
    else
      b: {
        clientReference = importStringRequest$1;
        importStringRequest$1 = request;
        try {
          JSCompiler_temp = stringify$1(
            clientReferenceMetadata,
            importMetadataReplacer$1
          );
          break b;
        } finally {
          importStringRequest$1 = clientReference;
        }
        JSCompiler_temp = void 0;
      }
    var JSCompiler_inline_result = JSCompiler_temp;
    request.pendingChunks++;
    var importId = request.nextChunkId++,
      processedChunk =
        importId.toString(16) + ":I" + JSCompiler_inline_result + "\n";
    request.completedImportChunks.push(processedChunk);
    writtenClientReferences.set(clientReferenceKey, importId);
    return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
      ? serializeLazyID$1(importId)
      : serializeByValueID$1(importId);
  } catch (x) {
    return (
      request.pendingChunks++,
      (parent = request.nextChunkId++),
      (parentPropertyName = logRecoverableError$2(request, x, null)),
      emitErrorChunk$1(request, parent, parentPropertyName),
      serializeByValueID$1(parent)
    );
  }
}
function outlineModelWithFormatContext$1(request, value, formatContext) {
  value = createTask$2(
    request,
    value,
    null,
    !1,
    formatContext,
    request.abortableTasks
  );
  retryTask$2(request, value);
  return value.id;
}
function serializeTypedArray$1(request, tag, typedArray) {
  request.pendingChunks++;
  var bufferId = request.nextChunkId++;
  emitTypedArrayChunk$1(request, bufferId, tag, typedArray, !1);
  return serializeByValueID$1(bufferId);
}
function serializeBlob$1(request, blob) {
  function progress(entry) {
    if (0 === newTask.status)
      if (entry.done)
        request.cacheController.signal.removeEventListener("abort", abortBlob),
          pingTask$2(request, newTask);
      else
        return (
          model.push(entry.value), reader.read().then(progress).catch(error)
        );
  }
  function error(reason) {
    0 === newTask.status &&
      (request.cacheController.signal.removeEventListener("abort", abortBlob),
      erroredTask$2(request, newTask, reason),
      enqueueFlush$1(request),
      reader.cancel(reason).then(error, error));
  }
  function abortBlob() {
    if (0 === newTask.status) {
      var signal = request.cacheController.signal;
      signal.removeEventListener("abort", abortBlob);
      signal = signal.reason;
      21 === request.type
        ? (request.abortableTasks.delete(newTask),
          haltTask$1(newTask),
          finishHaltedTask$1(newTask, request))
        : (erroredTask$2(request, newTask, signal), enqueueFlush$1(request));
      reader.cancel(signal).then(error, error);
    }
  }
  var model = [blob.type],
    newTask = createTask$2(request, model, null, !1, 0, request.abortableTasks),
    reader = blob.stream().getReader();
  request.cacheController.signal.addEventListener("abort", abortBlob);
  reader.read().then(progress).catch(error);
  return "$B" + newTask.id.toString(16);
}
function escapeStringValue$1(value) {
  return "$" === value[0] ? "$" + value : value;
}
function serializeImportString$1(request, value) {
  if (16 > value.length) return escapeStringValue$1(value);
  var writtenStrings = request.writtenImportStrings,
    existing = writtenStrings.get(value);
  if (void 0 !== existing) return existing;
  existing = request.writtenImportStringsSize + value.length;
  if (32768 < existing) return escapeStringValue$1(value);
  request.writtenImportStringsSize = existing;
  request.pendingChunks++;
  existing = request.nextChunkId++;
  var json = stringify$1(escapeStringValue$1(value));
  request.completedImportChunks.push(existing.toString(16) + ":" + json + "\n");
  request = serializeByValueID$1(existing);
  writtenStrings.set(value, request);
  return request;
}
var modelRoot$2 = !1;
function renderModelDestructive$2(
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
        var elementReference = null,
          writtenObjects = request.writtenObjects;
        if (null === task.keyPath && !task.implicitSlot) {
          var existingReference = writtenObjects.get(value);
          if (void 0 !== existingReference)
            if (modelRoot$2 === value) modelRoot$2 = null;
            else return existingReference;
          else
            -1 === parentPropertyName.indexOf(":") &&
              ((parent = writtenObjects.get(parent)),
              void 0 !== parent &&
                ((elementReference = parent + ":" + parentPropertyName),
                writtenObjects.set(value, elementReference)));
        }
        if (3200 < serializedSize$1) return deferTask$2(request, task);
        parentPropertyName = value.props;
        parent = parentPropertyName.ref;
        request = renderElement$1(
          request,
          task,
          value.type,
          value.key,
          void 0 !== parent ? parent : null,
          parentPropertyName
        );
        "object" === typeof request &&
          null !== request &&
          null !== elementReference &&
          (writtenObjects.has(request) ||
            writtenObjects.set(request, elementReference));
        return request;
      case REACT_LAZY_TYPE:
        if (3200 < serializedSize$1) return deferTask$2(request, task);
        task.thenableState = null;
        elementReference = value._init;
        value = elementReference(value._payload);
        if (12 === request.status) throw null;
        return renderModelDestructive$2(
          request,
          task,
          parent,
          parentPropertyName,
          value
        );
      case REACT_LEGACY_ELEMENT_TYPE:
        throw Error(
          'A React Element from an older version of React was rendered. This is not supported. It can happen if:\n- Multiple copies of the "react" package is used.\n- A library pre-bundled an old copy of "react" or "react/jsx-runtime".\n- A compiler tries to "inline" JSX instead of using the runtime.'
        );
    }
    if (isClientReference(value))
      return serializeClientReference$1(
        request,
        parent,
        parentPropertyName,
        value
      );
    if (
      void 0 !== request.temporaryReferences &&
      ((elementReference = request.temporaryReferences.get(value)),
      void 0 !== elementReference)
    )
      return "$T" + elementReference;
    elementReference = request.writtenObjects;
    writtenObjects = elementReference.get(value);
    if ("function" === typeof value.then) {
      if (void 0 !== writtenObjects) {
        if (null !== task.keyPath || task.implicitSlot)
          return "$@" + serializeThenable$1(request, task, value).toString(16);
        if (modelRoot$2 === value) modelRoot$2 = null;
        else return writtenObjects;
      }
      request = "$@" + serializeThenable$1(request, task, value).toString(16);
      elementReference.set(value, request);
      return request;
    }
    if (void 0 !== writtenObjects)
      if (modelRoot$2 === value) {
        if (writtenObjects !== serializeByValueID$1(task.id))
          return writtenObjects;
        modelRoot$2 = null;
      } else return writtenObjects;
    else if (
      -1 === parentPropertyName.indexOf(":") &&
      ((writtenObjects = elementReference.get(parent)),
      void 0 !== writtenObjects)
    ) {
      existingReference = parentPropertyName;
      if (isArrayImpl(parent) && parent[0] === REACT_ELEMENT_TYPE)
        switch (parentPropertyName) {
          case "1":
            existingReference = "type";
            break;
          case "2":
            existingReference = "key";
            break;
          case "3":
            existingReference = "props";
            break;
          case "4":
            existingReference = "_owner";
        }
      elementReference.set(value, writtenObjects + ":" + existingReference);
    }
    if (isArrayImpl(value)) return renderFragment$1(request, task, value);
    if (value instanceof Map)
      return (
        (value = Array.from(value)),
        "$Q" + outlineModelWithFormatContext$1(request, value, 0).toString(16)
      );
    if (value instanceof Set)
      return (
        (value = Array.from(value)),
        "$W" + outlineModelWithFormatContext$1(request, value, 0).toString(16)
      );
    if ("function" === typeof FormData && value instanceof FormData)
      return (
        (value = Array.from(value.entries())),
        "$K" + outlineModelWithFormatContext$1(request, value, 0).toString(16)
      );
    if (value instanceof Error) return "$Z";
    if (value instanceof ArrayBuffer)
      return serializeTypedArray$1(request, "A", new Uint8Array(value));
    if (value instanceof Int8Array)
      return serializeTypedArray$1(request, "O", value);
    if (value instanceof Uint8Array)
      return serializeTypedArray$1(request, "o", value);
    if (value instanceof Uint8ClampedArray)
      return serializeTypedArray$1(request, "U", value);
    if (value instanceof Int16Array)
      return serializeTypedArray$1(request, "S", value);
    if (value instanceof Uint16Array)
      return serializeTypedArray$1(request, "s", value);
    if (value instanceof Int32Array)
      return serializeTypedArray$1(request, "L", value);
    if (value instanceof Uint32Array)
      return serializeTypedArray$1(request, "l", value);
    if (value instanceof Float32Array)
      return serializeTypedArray$1(request, "G", value);
    if (value instanceof Float64Array)
      return serializeTypedArray$1(request, "g", value);
    if (value instanceof BigInt64Array)
      return serializeTypedArray$1(request, "M", value);
    if (value instanceof BigUint64Array)
      return serializeTypedArray$1(request, "m", value);
    if (value instanceof DataView)
      return serializeTypedArray$1(request, "V", value);
    if ("function" === typeof Blob && value instanceof Blob)
      return serializeBlob$1(request, value);
    if ((elementReference = getIteratorFn(value)))
      return (
        (parentPropertyName = elementReference.call(value)),
        parentPropertyName === value
          ? ((value = Array.from(parentPropertyName)),
            "$i" +
              outlineModelWithFormatContext$1(request, value, 0).toString(16))
          : renderFragment$1(request, task, Array.from(parentPropertyName))
      );
    if ("function" === typeof ReadableStream && value instanceof ReadableStream)
      return serializeReadableStream$1(request, task, value);
    elementReference = value[ASYNC_ITERATOR];
    if ("function" === typeof elementReference)
      return (
        null !== task.keyPath
          ? ((request = [
              REACT_ELEMENT_TYPE,
              REACT_FRAGMENT_TYPE,
              task.keyPath,
              { children: value }
            ]),
            (request = task.implicitSlot ? [request] : request))
          : ((parentPropertyName = elementReference.call(value)),
            (request = serializeAsyncIterable$1(
              request,
              task,
              value,
              parentPropertyName
            ))),
        request
      );
    if (value instanceof Date) return "$D" + value.toJSON();
    request = getPrototypeOf$2(value);
    if (
      request !== ObjectPrototype$3 &&
      (null === request || null !== getPrototypeOf$2(request))
    )
      throw Error(
        "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    return value;
  }
  if ("string" === typeof value)
    return (
      (serializedSize$1 += value.length),
      "Z" === value[value.length - 1] &&
      parent[parentPropertyName] instanceof Date
        ? "$D" + value
        : 1024 <= value.length && null !== byteLengthOfChunk
          ? (request.pendingChunks++,
            (task = request.nextChunkId++),
            emitTextChunk$1(request, task, value, !1),
            serializeByValueID$1(task))
          : escapeStringValue$1(value)
    );
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
    if (isClientReference(value))
      return serializeClientReference$1(
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
          ? (request = "$h" + parentPropertyName.toString(16))
          : ((parentPropertyName = value.$$id),
            (parent = value.$$bound),
            (parent = null === parent ? null : Promise.resolve(parent)),
            (request = outlineModelWithFormatContext$1(
              request,
              { id: parentPropertyName, bound: parent },
              0
            )),
            task.set(value, request),
            (request = "$h" + request.toString(16))),
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
    elementReference = task.get(value);
    if (void 0 !== elementReference)
      return serializeByValueID$1(elementReference);
    elementReference = value.description;
    if (Symbol.for(elementReference) !== value)
      throw Error(
        "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
          (value.description + ") cannot be found among global symbols.") +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    request.pendingChunks++;
    parentPropertyName = request.nextChunkId++;
    parent = encodeReferenceChunk$1(
      request,
      parentPropertyName,
      "$S" + elementReference
    );
    request.completedImportChunks.push(parent);
    task.set(value, parentPropertyName);
    return serializeByValueID$1(parentPropertyName);
  }
  if ("bigint" === typeof value) return "$n" + value.toString(10);
  throw Error(
    "Type " +
      typeof value +
      " is not supported in Client Component props." +
      describeObjectForErrorMessage(parent, parentPropertyName)
  );
}
function logRecoverableError$2(request, error) {
  var prevRequest = currentRequest$1;
  currentRequest$1 = null;
  var prevCache = setCurrentCache(null);
  try {
    var onError = request.onError;
    var errorDigest = cacheStorage.run(void 0, function () {
      return requestStorage.run(void 0, onError, error);
    });
  } finally {
    (currentRequest$1 = prevRequest), setCurrentCache(prevCache);
  }
  if (null != errorDigest && "string" !== typeof errorDigest)
    throw Error(
      'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
        typeof errorDigest +
        '" instead'
    );
  return errorDigest || "";
}
function fatalError$2(request, error) {
  var onFatalError = request.onFatalError;
  onFatalError(error);
  null !== request.destination
    ? ((request.status = 14), request.destination.destroy(error))
    : ((request.status = 13), (request.fatalError = error));
  request.cacheController.abort(
    Error("The render was aborted due to a fatal error.", { cause: error })
  );
}
function emitErrorChunk$1(request, id, digest) {
  digest = { digest: digest };
  id = id.toString(16) + ":E" + stringify$1(digest) + "\n";
  request.completedErrorChunks.push(id);
}
var importStringRequest$1 = null;
function importMetadataReplacer$1(key, value) {
  return "string" === typeof value
    ? ((key = importStringRequest$1),
      null === key
        ? escapeStringValue$1(value)
        : serializeImportString$1(key, value))
    : value;
}
var NOT_PLAIN_IMPORT_METADATA$1 = {};
function transformImportMetadata$1(request, value, depth) {
  switch (typeof value) {
    case "string":
      return serializeImportString$1(request, value);
    case "number":
    case "boolean":
    case "undefined":
      return value;
    case "object":
      if (null === value) return null;
      if (16 < depth || "function" === typeof value.toJSON)
        return NOT_PLAIN_IMPORT_METADATA$1;
      if (isArrayImpl(value)) {
        for (
          var length = value.length, copy = Array(length), i = 0;
          i < length;
          i++
        ) {
          var element = value[i];
          if ("string" === typeof element)
            copy[i] = serializeImportString$1(request, element);
          else {
            element = transformImportMetadata$1(request, element, depth + 1);
            if (element === NOT_PLAIN_IMPORT_METADATA$1)
              return NOT_PLAIN_IMPORT_METADATA$1;
            copy[i] = element;
          }
        }
        return copy;
      }
      length = getPrototypeOf$2(value);
      if (length !== ObjectPrototype$3 && null !== length)
        return NOT_PLAIN_IMPORT_METADATA$1;
      length = Object.keys(value);
      copy = {};
      for (i = 0; i < length.length; i++) {
        element = length[i];
        if (element in ObjectPrototype$3) return NOT_PLAIN_IMPORT_METADATA$1;
        var element$27 = value[element];
        if ("string" === typeof element$27)
          copy[element] = serializeImportString$1(request, element$27);
        else {
          element$27 = transformImportMetadata$1(
            request,
            element$27,
            depth + 1
          );
          if (element$27 === NOT_PLAIN_IMPORT_METADATA$1)
            return NOT_PLAIN_IMPORT_METADATA$1;
          copy[element] = element$27;
        }
      }
      return copy;
    default:
      return NOT_PLAIN_IMPORT_METADATA$1;
  }
}
function emitTypedArrayChunk$1(request, id, tag, typedArray, debug) {
  debug ? request.pendingDebugChunks++ : request.pendingChunks++;
  typedArray = typedArrayToBinaryChunk(typedArray);
  debug = typedArray.byteLength;
  id = id.toString(16) + ":" + tag + debug.toString(16) + ",";
  request.completedRegularChunks.push(
    NEXT_TWO_CHUNKS_ARE_ATOMIC$1,
    id,
    typedArray
  );
}
function emitTextChunk$1(request, id, text, debug) {
  if (null === byteLengthOfChunk)
    throw Error(
      "Existence of byteLengthOfChunk should have already been checked. This is a bug in React."
    );
  debug ? request.pendingDebugChunks++ : request.pendingChunks++;
  debug = byteLengthOfChunk(text);
  id = id.toString(16) + ":T" + debug.toString(16) + ",";
  request.completedRegularChunks.push(NEXT_TWO_CHUNKS_ARE_ATOMIC$1, id, text);
}
function emitChunk$1(request, task, value) {
  var id = task.id;
  "string" === typeof value && null !== byteLengthOfChunk
    ? emitTextChunk$1(request, id, value, !1)
    : value instanceof ArrayBuffer
      ? emitTypedArrayChunk$1(request, id, "A", new Uint8Array(value), !1)
      : value instanceof Int8Array
        ? emitTypedArrayChunk$1(request, id, "O", value, !1)
        : value instanceof Uint8Array
          ? emitTypedArrayChunk$1(request, id, "o", value, !1)
          : value instanceof Uint8ClampedArray
            ? emitTypedArrayChunk$1(request, id, "U", value, !1)
            : value instanceof Int16Array
              ? emitTypedArrayChunk$1(request, id, "S", value, !1)
              : value instanceof Uint16Array
                ? emitTypedArrayChunk$1(request, id, "s", value, !1)
                : value instanceof Int32Array
                  ? emitTypedArrayChunk$1(request, id, "L", value, !1)
                  : value instanceof Uint32Array
                    ? emitTypedArrayChunk$1(request, id, "l", value, !1)
                    : value instanceof Float32Array
                      ? emitTypedArrayChunk$1(request, id, "G", value, !1)
                      : value instanceof Float64Array
                        ? emitTypedArrayChunk$1(request, id, "g", value, !1)
                        : value instanceof BigInt64Array
                          ? emitTypedArrayChunk$1(request, id, "M", value, !1)
                          : value instanceof BigUint64Array
                            ? emitTypedArrayChunk$1(request, id, "m", value, !1)
                            : value instanceof DataView
                              ? emitTypedArrayChunk$1(
                                  request,
                                  id,
                                  "V",
                                  value,
                                  !1
                                )
                              : ((value = resolveModel$2(
                                  request,
                                  task,
                                  { "": value },
                                  "",
                                  value
                                )),
                                (value = stringify$1(value)),
                                (task =
                                  task.id.toString(16) + ":" + value + "\n"),
                                request.completedRegularChunks.push(task));
}
function erroredTask$2(request, task, error) {
  task.status = 4;
  error = logRecoverableError$2(request, error, task);
  emitErrorChunk$1(request, task.id, error);
  request.abortableTasks.delete(task);
  callOnAllReadyIfReady(request);
}
var emptyRoot$1 = {};
function retryTask$2(request, task) {
  if (0 === task.status) {
    task.status = 5;
    var parentSerializedSize = serializedSize$1;
    try {
      modelRoot$2 = task.model;
      var resolvedModel = renderModelDestructive$2(
        request,
        task,
        emptyRoot$1,
        "",
        task.model
      );
      modelRoot$2 = resolvedModel;
      task.keyPath = null;
      task.implicitSlot = !1;
      if ("object" === typeof resolvedModel && null !== resolvedModel)
        request.writtenObjects.set(
          resolvedModel,
          serializeByValueID$1(task.id)
        ),
          emitChunk$1(request, task, resolvedModel);
      else {
        var json = stringify$1(resolvedModel),
          processedChunk = task.id.toString(16) + ":" + json + "\n";
        request.completedRegularChunks.push(processedChunk);
      }
      task.status = 1;
      request.abortableTasks.delete(task);
      callOnAllReadyIfReady(request);
    } catch (thrownValue) {
      if (12 === request.status)
        if (
          (request.abortableTasks.delete(task),
          (task.status = 0),
          21 === request.type)
        )
          haltTask$1(task), finishHaltedTask$1(task, request);
        else {
          var errorId = request.fatalError;
          abortTask$2(task);
          finishAbortedTask$1(task, request, errorId);
        }
      else {
        var x =
          thrownValue === SuspenseException
            ? getSuspendedThenable()
            : thrownValue;
        if (
          "object" === typeof x &&
          null !== x &&
          "function" === typeof x.then
        ) {
          task.status = 0;
          task.thenableState = getThenableStateAfterSuspending$1();
          var ping = task.ping;
          x.then(ping, ping);
        } else erroredTask$2(request, task, x);
      }
    } finally {
      serializedSize$1 = parentSerializedSize;
    }
  }
}
function tryStreamTask$2(request, task) {
  var parentSerializedSize = serializedSize$1;
  try {
    emitChunk$1(request, task, task.model);
  } finally {
    serializedSize$1 = parentSerializedSize;
  }
}
function performWork$2(request) {
  var prevDispatcher = ReactSharedInternalsServer.H;
  ReactSharedInternalsServer.H = HooksDispatcher$1;
  var prevRequest = currentRequest$1;
  currentRequest$1 = request;
  var prevCache = setCurrentCache(request);
  currentRequest$2 = request;
  try {
    var pingedTasks = request.pingedTasks;
    request.pingedTasks = [];
    for (var i = 0; i < pingedTasks.length; i++)
      retryTask$2(request, pingedTasks[i]);
    flushCompletedChunks$1(request);
  } catch (error) {
    logRecoverableError$2(request, error, null), fatalError$2(request, error);
  } finally {
    (ReactSharedInternalsServer.H = prevDispatcher),
      (currentRequest$2 = null),
      (currentRequest$1 = prevRequest),
      setCurrentCache(prevCache);
  }
}
function abortTask$2(task) {
  0 === task.status && (task.status = 3);
}
function finishAbortedTask$1(task, request, errorId) {
  3 === task.status &&
    ((errorId = serializeByValueID$1(errorId)),
    (task = encodeReferenceChunk$1(request, task.id, errorId)),
    request.completedErrorChunks.push(task));
}
function haltTask$1(task) {
  0 === task.status && (task.status = 3);
}
function finishHaltedTask$1(task, request) {
  3 === task.status && request.pendingChunks--;
}
function flushCompletedChunks$1(request) {
  var destination = request.destination;
  if (null !== destination) {
    currentView = new Uint8Array(4096);
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
      for (i = 0; i < regularChunks.length; i++) {
        var item = regularChunks[i];
        importsChunks = void 0;
        if (item === NEXT_TWO_CHUNKS_ARE_ATOMIC$1) {
          if (i + 2 >= regularChunks.length)
            throw Error("A chunk pair is incomplete. This is a bug in React.");
          request.pendingChunks -= 2;
          writeChunk(destination, regularChunks[i + 1]);
          importsChunks = writeChunkAndReturn(
            destination,
            regularChunks[i + 2]
          );
          i += 2;
        } else
          request.pendingChunks--,
            (importsChunks = writeChunkAndReturn(destination, item));
        if (!importsChunks) {
          request.destination = null;
          i++;
          break;
        }
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
      (request.flushScheduled = !1), completeWriting(destination);
    }
    flushBuffered(destination);
  }
  0 === request.pendingChunks &&
    (12 > request.status &&
      request.cacheController.abort(
        Error(
          "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
        )
      ),
    null !== request.destination &&
      ((request.status = 14),
      request.destination.end(),
      (request.destination = null)));
}
function startWork$2(request) {
  request.flushScheduled = null !== request.destination;
  scheduleMicrotask(function () {
    cacheStorage.run(request, function () {
      return requestStorage.run(request, performWork$2, request);
    });
  });
  setImmediate(function () {
    10 === request.status && (request.status = 11);
  });
}
function enqueueFlush$1(request) {
  !1 === request.flushScheduled &&
    0 === request.pingedTasks.length &&
    null !== request.destination &&
    ((request.flushScheduled = !0),
    setImmediate(function () {
      request.flushScheduled = !1;
      flushCompletedChunks$1(request);
    }));
}
function callOnAllReadyIfReady(request) {
  0 === request.abortableTasks.size &&
    ((request = request.onAllReady), request());
}
function startFlowing$1(request, destination) {
  if (13 === request.status)
    (request.status = 14), destination.destroy(request.fatalError);
  else if (14 !== request.status && null === request.destination) {
    request.destination = destination;
    try {
      flushCompletedChunks$1(request);
    } catch (error) {
      logRecoverableError$2(request, error, null), fatalError$2(request, error);
    }
  }
}
function finishHalt(request, abortedTasks) {
  try {
    abortedTasks.forEach(function (task) {
      return finishHaltedTask$1(task, request);
    });
    var onAllReady = request.onAllReady;
    onAllReady();
    flushCompletedChunks$1(request);
  } catch (error) {
    logRecoverableError$2(request, error, null), fatalError$2(request, error);
  }
}
function finishAbort$2(request, abortedTasks, errorId) {
  try {
    abortedTasks.forEach(function (task) {
      return finishAbortedTask$1(task, request, errorId);
    });
    var onAllReady = request.onAllReady;
    onAllReady();
    flushCompletedChunks$1(request);
  } catch (error) {
    logRecoverableError$2(request, error, null), fatalError$2(request, error);
  }
}
function attachAbortSignal$2(request, signal) {
  signal.aborted
    ? abort$2(request, signal.reason)
    : signal.addEventListener(
        "abort",
        function () {
          abort$2(request, signal.reason);
        },
        { signal: request.cacheController.signal }
      );
}
function abort$2(request, reason) {
  if (!(11 < request.status))
    try {
      request.status = 12;
      request.cacheController.abort(reason);
      var abortableTasks = request.abortableTasks;
      if (0 < abortableTasks.size)
        if (21 === request.type)
          abortableTasks.forEach(function (task) {
            return haltTask$1(task, request);
          }),
            setImmediate(function () {
              return finishHalt(request, abortableTasks);
            });
        else {
          var error =
              void 0 === reason
                ? Error(
                    "The render was aborted by the server without a reason."
                  )
                : "object" === typeof reason &&
                    null !== reason &&
                    "function" === typeof reason.then
                  ? Error(
                      "The render was aborted by the server with a promise."
                    )
                  : reason,
            digest = logRecoverableError$2(request, error, null),
            errorId = request.nextChunkId++;
          request.fatalError = errorId;
          request.pendingChunks++;
          emitErrorChunk$1(request, errorId, digest, error, !1, null);
          abortableTasks.forEach(function (task) {
            return abortTask$2(task, request, errorId);
          });
          setImmediate(function () {
            return finishAbort$2(request, abortableTasks, errorId);
          });
        }
      else {
        var onAllReady = request.onAllReady;
        onAllReady();
        flushCompletedChunks$1(request);
      }
    } catch (error$34) {
      logRecoverableError$2(request, error$34, null),
        fatalError$2(request, error$34);
    }
}
function resolveServerReference(bundlerConfig, id) {
  var name = "",
    resolvedModuleData = bundlerConfig[id];
  if (resolvedModuleData) name = resolvedModuleData.name;
  else {
    var idx = id.lastIndexOf("#");
    -1 !== idx &&
      ((name = id.slice(idx + 1)),
      (resolvedModuleData = bundlerConfig[id.slice(0, idx)]));
    if (!resolvedModuleData)
      throw Error(
        'Could not find the module "' +
          id +
          '" in the React Server Manifest. This is probably a bug in the React Server Components bundler.'
      );
  }
  return resolvedModuleData.async
    ? [resolvedModuleData.id, resolvedModuleData.chunks, name, 1]
    : [resolvedModuleData.id, resolvedModuleData.chunks, name];
}
var chunkCache = new Map();
function requireAsyncModule(id) {
  var promise = globalThis.__next_require__(id);
  if ("function" !== typeof promise.then || "fulfilled" === promise.status)
    return null;
  promise.then(
    function (value) {
      promise.status = "fulfilled";
      promise.value = value;
    },
    function (reason) {
      promise.status = "rejected";
      promise.reason = reason;
    }
  );
  return promise;
}
function ignoreReject() {}
function preloadModule$1(metadata) {
  for (var chunks = metadata[1], promises = [], i = 0; i < chunks.length; ) {
    var chunkId = chunks[i++];
    chunks[i++];
    var entry = chunkCache.get(chunkId);
    if (void 0 === entry) {
      entry = __webpack_chunk_load__(chunkId);
      promises.push(entry);
      var resolve = chunkCache.set.bind(chunkCache, chunkId, null);
      entry.then(resolve, ignoreReject);
      chunkCache.set(chunkId, entry);
    } else null !== entry && promises.push(entry);
  }
  return 4 === metadata.length
    ? 0 === promises.length
      ? requireAsyncModule(metadata[0])
      : Promise.all(promises).then(function () {
          return requireAsyncModule(metadata[0]);
        })
    : 0 < promises.length
      ? Promise.all(promises)
      : null;
}
function requireModule(metadata) {
  var moduleExports = globalThis.__next_require__(metadata[0]);
  if (4 === metadata.length && "function" === typeof moduleExports.then)
    if ("fulfilled" === moduleExports.status)
      moduleExports = moduleExports.value;
    else throw moduleExports.reason;
  if ("*" === metadata[2]) return moduleExports;
  if ("" === metadata[2])
    return moduleExports.__esModule ? moduleExports.default : moduleExports;
  if (hasOwnProperty.call(moduleExports, metadata[2]))
    return moduleExports[metadata[2]];
}
function appendBackingEntry(backingStore, value, key) {
  var prefix = backingStore.prefix;
  if (key.startsWith(prefix)) {
    switch (key[prefix.length]) {
      case "_":
        prefix = backingStore.referencedEntries;
        null === prefix && (prefix = backingStore.referencedEntries = []);
        prefix.push([key, value]);
        return;
      case "S":
        "string" === typeof value &&
          ((prefix = backingStore.streamChunks),
          null === prefix && (prefix = backingStore.streamChunks = new Map()),
          (backingStore = prefix.get(key)),
          void 0 === backingStore
            ? prefix.set(key, [value])
            : backingStore.push(value));
        return;
    }
    "string" === typeof value
      ? ((prefix = backingStore.stringChunks),
        null === prefix && (prefix = backingStore.stringChunks = new Map()),
        prefix.set(key, value))
      : ((prefix = backingStore.blobs),
        null === prefix && (prefix = backingStore.blobs = new Map()),
        prefix.set(key, value));
  }
}
function getBackingBlob(backingStore, key) {
  backingStore = backingStore.blobs;
  return null === backingStore ? void 0 : backingStore.get(key);
}
var RESPONSE_SYMBOL = Symbol();
function ReactPromise$1(status, value, reason) {
  this.status = status;
  this.value = value;
  this.reason = reason;
}
ReactPromise$1.prototype = Object.create(Promise.prototype);
Object.defineProperty(ReactPromise$1.prototype, "then", {
  writable: !0,
  enumerable: !0,
  configurable: !0,
  value: function (resolve, reject) {
    switch (this.status) {
      case "resolved_model":
        initializeModelChunk(this);
    }
    switch (this.status) {
      case "fulfilled":
        if ("function" === typeof resolve) {
          for (
            var inspectedValue = this.value,
              cycleProtection = 0,
              visited = new Set();
            inspectedValue instanceof ReactPromise$1;

          ) {
            cycleProtection++;
            if (
              inspectedValue === this ||
              visited.has(inspectedValue) ||
              1e3 < cycleProtection
            ) {
              "function" === typeof reject &&
                reject(Error("Cannot have cyclic thenables."));
              return;
            }
            visited.add(inspectedValue);
            if ("fulfilled" === inspectedValue.status)
              inspectedValue = inspectedValue.value;
            else break;
          }
          resolve(this.value);
        }
        break;
      case "pending":
      case "blocked":
        "function" === typeof resolve &&
          (null === this.value && (this.value = []), this.value.push(resolve));
        "function" === typeof reject &&
          (null === this.reason && (this.reason = []),
          this.reason.push(reject));
        break;
      default:
        "function" === typeof reject && reject(this.reason);
    }
  }
});
var ObjectPrototype$2 = Object.prototype,
  ArrayPrototype = Array.prototype;
function wakeChunk(response, listeners, value, chunk) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    "function" === typeof listener
      ? listener(value)
      : fulfillReference(response, listener, value, chunk.reason);
  }
}
function rejectChunk(response, listeners, error) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    "function" === typeof listener
      ? listener(error)
      : rejectReference(response, listener.handler, error);
  }
}
function triggerErrorOnChunk(response, chunk, error) {
  if ("pending" !== chunk.status && "blocked" !== chunk.status)
    chunk.reason.error(error);
  else {
    var listeners = chunk.reason;
    chunk.status = "rejected";
    chunk.reason = error;
    null !== listeners && rejectChunk(response, listeners, error);
  }
}
function createResolvedModelChunk(response, value, id) {
  var $jscomp$compprop2 = {};
  return new ReactPromise$1(
    "resolved_model",
    value,
    (($jscomp$compprop2.id = id),
    ($jscomp$compprop2[RESPONSE_SYMBOL] = response),
    $jscomp$compprop2)
  );
}
function resolveModelChunk(response, chunk, value, id) {
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
    value = {};
    chunk.reason =
      ((value.id = id), (value[RESPONSE_SYMBOL] = response), value);
    if (null !== resolveListeners)
      switch ((initializeModelChunk(chunk), chunk.status)) {
        case "fulfilled":
          wakeChunk(response, resolveListeners, chunk.value, chunk);
          break;
        case "blocked":
        case "pending":
          if (chunk.value)
            for (response = 0; response < resolveListeners.length; response++)
              chunk.value.push(resolveListeners[response]);
          else chunk.value = resolveListeners;
          if (chunk.reason) {
            if (rejectListeners)
              for (
                resolveListeners = 0;
                resolveListeners < rejectListeners.length;
                resolveListeners++
              )
                chunk.reason.push(rejectListeners[resolveListeners]);
          } else chunk.reason = rejectListeners;
          break;
        case "rejected":
          rejectListeners &&
            rejectChunk(response, rejectListeners, chunk.reason);
      }
  }
}
function createResolvedIteratorResultChunk(response, value, done) {
  var $jscomp$compprop4 = {};
  return new ReactPromise$1(
    "resolved_model",
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    (($jscomp$compprop4.id = -1),
    ($jscomp$compprop4[RESPONSE_SYMBOL] = response),
    $jscomp$compprop4)
  );
}
function resolveIteratorResultChunk(response, chunk, value, done) {
  resolveModelChunk(
    response,
    chunk,
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    -1
  );
}
function loadServerReference$1(response, metaData, parentObject, key) {
  var id = metaData.id;
  if ("string" !== typeof id || "then" === key) return null;
  var cachedPromise = response._serverReferenceCache.get(metaData);
  if (void 0 !== cachedPromise)
    return readServerReference(response, cachedPromise, parentObject, key);
  var blockedPromise = new ReactPromise$1("blocked", null, null);
  response._serverReferenceCache.set(metaData, blockedPromise);
  var serverReference = resolveServerReference(response._bundlerConfig, id);
  id = metaData.bound;
  if ((cachedPromise = preloadModule$1(serverReference)))
    id instanceof ReactPromise$1 &&
      (cachedPromise = Promise.all([cachedPromise, id]));
  else if (id instanceof ReactPromise$1) cachedPromise = Promise.resolve(id);
  else
    return (
      (id = requireServerReference(response, serverReference)),
      resolveServerReferenceChunk(response, blockedPromise, id),
      readServerReference(response, blockedPromise, parentObject, key)
    );
  cachedPromise.then(
    function () {
      try {
        var value = requireServerReference(response, serverReference);
        if (metaData.bound) {
          var promiseValue = metaData.bound.value,
            boundArgs = isArrayImpl(promiseValue) ? promiseValue.slice(0) : [];
          if (1e3 < boundArgs.length)
            throw Error(
              "Server Function has too many bound arguments. Received " +
                boundArgs.length +
                " but the limit is 1000."
            );
          boundArgs.unshift(null);
          value = value.bind.apply(value, boundArgs);
        }
      } catch (error) {
        triggerErrorOnChunk(response, blockedPromise, error);
        return;
      }
      resolveServerReferenceChunk(response, blockedPromise, value);
    },
    function (error) {
      triggerErrorOnChunk(response, blockedPromise, error);
    }
  );
  return readServerReference(response, blockedPromise, parentObject, key);
}
function requireServerReference(response, reference) {
  reference = requireModule(reference);
  if ("object" === typeof reference && null !== reference) {
    var serverReferenceObjects = response._serverReferenceObjects;
    null === serverReferenceObjects &&
      (serverReferenceObjects = response._serverReferenceObjects =
        new WeakSet());
    serverReferenceObjects.add(reference);
  }
  return reference;
}
function resolveServerReferenceChunk(response, chunk, value) {
  var resolveListeners = chunk.value;
  chunk.status = "fulfilled";
  chunk.value = value;
  chunk.reason = null;
  null !== resolveListeners &&
    wakeChunk(response, resolveListeners, value, chunk);
}
function readServerReference(response, chunk, parentObject, key) {
  switch (chunk.status) {
    case "fulfilled":
      return chunk.value;
    case "blocked":
      return waitForReference(
        response,
        chunk,
        parentObject,
        key,
        null,
        createModel,
        []
      );
    default:
      throw chunk.reason;
  }
}
function reviveModel(
  response,
  parentObj,
  parentKey,
  value,
  reference,
  arrayRoot
) {
  if ("string" === typeof value)
    return parseModelString(
      response,
      parentObj,
      parentKey,
      value,
      reference,
      arrayRoot
    );
  if ("object" === typeof value && null !== value)
    if (
      (void 0 !== reference &&
        void 0 !== response._temporaryReferences &&
        response._temporaryReferences.set(value, reference),
      isArrayImpl(value))
    ) {
      if (null === arrayRoot) {
        var childContext = { count: 0, fork: !1 };
        response._rootArrayContexts.set(value, childContext);
      } else childContext = arrayRoot;
      1 < value.length && (childContext.fork = !0);
      bumpArrayCount(childContext, value.length + 1, response);
      for (parentObj = 0; parentObj < value.length; parentObj++)
        value[parentObj] = reviveModel(
          response,
          value,
          "" + parentObj,
          value[parentObj],
          void 0 !== reference ? reference + ":" + parentObj : void 0,
          childContext
        );
    } else
      for (childContext in value)
        hasOwnProperty.call(value, childContext) &&
          ("__proto__" === childContext
            ? delete value[childContext]
            : ((parentObj =
                void 0 !== reference && -1 === childContext.indexOf(":")
                  ? reference + ":" + childContext
                  : void 0),
              (parentObj = reviveModel(
                response,
                value,
                childContext,
                value[childContext],
                parentObj,
                null
              )),
              void 0 !== parentObj
                ? (value[childContext] = parentObj)
                : delete value[childContext]));
  return value;
}
function bumpArrayCount(arrayContext, slots, response) {
  if (
    (arrayContext.count += slots) > response._arraySizeLimit &&
    arrayContext.fork
  )
    throw Error(
      "Maximum array nesting exceeded. Large nested arrays can be dangerous. Try adding intermediate objects."
    );
}
var initializingHandler = null;
function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler;
  initializingHandler = null;
  var _chunk$reason = chunk.reason,
    response = _chunk$reason[RESPONSE_SYMBOL];
  _chunk$reason = _chunk$reason.id;
  _chunk$reason = -1 === _chunk$reason ? void 0 : _chunk$reason.toString(16);
  var resolvedModel = chunk.value;
  chunk.status = "blocked";
  chunk.value = null;
  chunk.reason = null;
  try {
    var rawModel = JSON.parse(resolvedModel);
    resolvedModel = { count: 0, fork: !1 };
    var value = reviveModel(
        response,
        { "": rawModel },
        "",
        rawModel,
        _chunk$reason,
        resolvedModel
      ),
      resolveListeners = chunk.value;
    if (null !== resolveListeners)
      for (
        chunk.value = null, chunk.reason = null, rawModel = 0;
        rawModel < resolveListeners.length;
        rawModel++
      ) {
        var listener = resolveListeners[rawModel];
        "function" === typeof listener
          ? listener(value)
          : fulfillReference(response, listener, value, resolvedModel);
      }
    if (null !== initializingHandler) {
      if (initializingHandler.errored) throw initializingHandler.reason;
      if (0 < initializingHandler.deps) {
        initializingHandler.value = value;
        initializingHandler.reason = resolvedModel;
        initializingHandler.chunk = chunk;
        return;
      }
    }
    chunk.status = "fulfilled";
    chunk.value = value;
    chunk.reason = resolvedModel;
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
  } finally {
    initializingHandler = prevHandler;
  }
}
function reportGlobalError(response, error) {
  response._closed = !0;
  response._closedReason = error;
  response._chunks.forEach(function (chunk) {
    "pending" === chunk.status
      ? triggerErrorOnChunk(response, chunk, error)
      : "fulfilled" === chunk.status &&
        null !== chunk.reason &&
        ((chunk = chunk.reason),
        "function" === typeof chunk.error && chunk.error(error));
  });
}
function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  if (!chunk) {
    chunk = response._prefix;
    var stringChunks = response._formData.stringChunks;
    chunk = null === stringChunks ? void 0 : stringChunks.get(chunk + id);
    chunk =
      "string" === typeof chunk
        ? createResolvedModelChunk(response, chunk, id)
        : response._closed
          ? new ReactPromise$1("rejected", null, response._closedReason)
          : new ReactPromise$1("pending", null, null);
    chunks.set(id, chunk);
  }
  return chunk;
}
function fulfillReference(response, reference, value, arrayRoot) {
  var handler = reference.handler,
    parentObject = reference.parentObject,
    key = reference.key,
    map = reference.map,
    path = reference.path;
  try {
    for (
      var localLength = 0,
        rootArrayContexts = response._rootArrayContexts,
        serverReferenceObjects = response._serverReferenceObjects,
        i = 1;
      i < path.length;
      i++
    ) {
      var name = path[i];
      if (
        "object" !== typeof value ||
        null === value ||
        (null !== serverReferenceObjects &&
          serverReferenceObjects.has(value)) ||
        (getPrototypeOf$2(value) !== ObjectPrototype$2 &&
          getPrototypeOf$2(value) !== ArrayPrototype) ||
        !hasOwnProperty.call(value, name)
      )
        throw Error("Invalid reference.");
      value = value[name];
      if (isArrayImpl(value))
        (localLength = 0),
          (arrayRoot = rootArrayContexts.get(value) || arrayRoot);
      else if (((arrayRoot = null), "string" === typeof value))
        localLength = value.length;
      else if ("bigint" === typeof value) {
        var n = Math.abs(Number(value));
        localLength = 0 === n ? 1 : Math.floor(Math.log10(n)) + 1;
      } else localLength = ArrayBuffer.isView(value) ? value.byteLength : 0;
    }
    var resolvedValue = map(response, value, parentObject, key);
    var referenceArrayRoot = reference.arrayRoot;
    null !== referenceArrayRoot &&
      (null !== arrayRoot
        ? (arrayRoot.fork && (referenceArrayRoot.fork = !0),
          bumpArrayCount(referenceArrayRoot, arrayRoot.count, response))
        : 0 < localLength &&
          bumpArrayCount(referenceArrayRoot, localLength, response));
  } catch (error) {
    rejectReference(response, handler, error);
    return;
  }
  reference = resolvedValue;
  "__proto__" !== key && (parentObject[key] = reference);
  "" === key && null === handler.value && (handler.value = reference);
  handler.deps--;
  0 === handler.deps &&
    ((parentObject = handler.chunk),
    null !== parentObject &&
      "blocked" === parentObject.status &&
      ((key = parentObject.value),
      (parentObject.status = "fulfilled"),
      (parentObject.value = handler.value),
      (parentObject.reason = handler.reason),
      null !== key && wakeChunk(response, key, handler.value, parentObject)));
}
function rejectReference(response, handler, error) {
  handler.errored ||
    ((handler.errored = !0),
    (handler.value = null),
    (handler.reason = error),
    (handler = handler.chunk),
    null !== handler &&
      "blocked" === handler.status &&
      triggerErrorOnChunk(response, handler, error));
}
function waitForReference(
  response,
  referencedChunk,
  parentObject,
  key,
  arrayRoot,
  map,
  path
) {
  initializingHandler
    ? ((response = initializingHandler), response.deps++)
    : (response = initializingHandler =
        { chunk: null, value: null, reason: null, deps: 1, errored: !1 });
  parentObject = {
    handler: response,
    parentObject: parentObject,
    key: key,
    map: map,
    path: path,
    arrayRoot: arrayRoot
  };
  null === referencedChunk.value
    ? (referencedChunk.value = [parentObject])
    : referencedChunk.value.push(parentObject);
  null === referencedChunk.reason
    ? (referencedChunk.reason = [parentObject])
    : referencedChunk.reason.push(parentObject);
  return null;
}
function getOutlinedModel(
  response,
  reference,
  parentObject,
  key,
  referenceArrayRoot,
  map
) {
  reference = reference.split(":");
  var id = parseInt(reference[0], 16),
    chunk = getChunk(response, id);
  switch (chunk.status) {
    case "resolved_model":
      initializeModelChunk(chunk);
  }
  switch (chunk.status) {
    case "fulfilled":
      id = chunk.value;
      chunk = chunk.reason;
      if (null !== chunk && "error" in chunk)
        throw Error(
          "Expected an initialized chunk but got an initialized stream chunk instead. This payload may have been submitted by an older version of React."
        );
      for (
        var localLength = 0,
          rootArrayContexts = response._rootArrayContexts,
          serverReferenceObjects = response._serverReferenceObjects,
          i = 1;
        i < reference.length;
        i++
      ) {
        localLength = reference[i];
        if (
          "object" !== typeof id ||
          null === id ||
          (null !== serverReferenceObjects && serverReferenceObjects.has(id)) ||
          (getPrototypeOf$2(id) !== ObjectPrototype$2 &&
            getPrototypeOf$2(id) !== ArrayPrototype) ||
          !hasOwnProperty.call(id, localLength)
        )
          throw Error("Invalid reference.");
        id = id[localLength];
        isArrayImpl(id)
          ? ((localLength = 0), (chunk = rootArrayContexts.get(id) || chunk))
          : ((chunk = null),
            "string" === typeof id
              ? (localLength = id.length)
              : "bigint" === typeof id
                ? ((localLength = Math.abs(Number(id))),
                  (localLength =
                    0 === localLength
                      ? 1
                      : Math.floor(Math.log10(localLength)) + 1))
                : (localLength = ArrayBuffer.isView(id) ? id.byteLength : 0));
      }
      parentObject = map(response, id, parentObject, key);
      null !== referenceArrayRoot &&
        (null !== chunk
          ? (chunk.fork && (referenceArrayRoot.fork = !0),
            bumpArrayCount(referenceArrayRoot, chunk.count, response))
          : 0 < localLength &&
            bumpArrayCount(referenceArrayRoot, localLength, response));
      return parentObject;
    case "blocked":
      return waitForReference(
        response,
        chunk,
        parentObject,
        key,
        referenceArrayRoot,
        map,
        reference
      );
    case "pending":
      throw Error("Invalid forward reference.");
    default:
      return (
        initializingHandler
          ? ((initializingHandler.errored = !0),
            (initializingHandler.value = null),
            (initializingHandler.reason = chunk.reason))
          : (initializingHandler = {
              chunk: null,
              value: null,
              reason: chunk.reason,
              deps: 0,
              errored: !0
            }),
        null
      );
  }
}
function isServerReferenceObject(response, value) {
  response = response._serverReferenceObjects;
  return (
    null !== response &&
    "object" === typeof value &&
    null !== value &&
    response.has(value)
  );
}
function createMap(response, model) {
  if (!isArrayImpl(model) || isServerReferenceObject(response, model))
    throw Error("Invalid Map initializer.");
  if (!0 === model.$$consumed) throw Error("Already initialized Map.");
  model.$$consumed = !0;
  return new Map(model);
}
function createSet(response, model) {
  if (!isArrayImpl(model) || isServerReferenceObject(response, model))
    throw Error("Invalid Set initializer.");
  if (!0 === model.$$consumed) throw Error("Already initialized Set.");
  model.$$consumed = !0;
  return new Set(model);
}
function extractIterator(response, model) {
  if (!isArrayImpl(model) || isServerReferenceObject(response, model))
    throw Error("Invalid Iterator initializer.");
  if (!0 === model.$$consumed) throw Error("Already initialized Iterator.");
  model.$$consumed = !0;
  return model[Symbol.iterator]();
}
function createModel(response, model, parentObject, key) {
  return "then" === key && "function" === typeof model ? null : model;
}
function parseTypedArray(
  response,
  reference,
  constructor,
  bytesPerElement,
  parentObject,
  parentKey,
  referenceArrayRoot
) {
  function reject(error) {
    if (!handler.errored) {
      handler.errored = !0;
      handler.value = null;
      handler.reason = error;
      var chunk = handler.chunk;
      null !== chunk &&
        "blocked" === chunk.status &&
        triggerErrorOnChunk(response, chunk, error);
    }
  }
  reference = parseInt(reference.slice(2), 16);
  var key = response._prefix + reference;
  bytesPerElement = response._chunks;
  if (bytesPerElement.has(reference))
    throw Error("Already initialized typed array.");
  bytesPerElement.set(
    reference,
    new ReactPromise$1(
      "rejected",
      null,
      Error("Already initialized typed array.")
    )
  );
  reference = getBackingBlob(response._formData, key).arrayBuffer();
  if (initializingHandler) {
    var handler = initializingHandler;
    handler.deps++;
  } else
    handler = initializingHandler = {
      chunk: null,
      value: null,
      reason: null,
      deps: 1,
      errored: !1
    };
  reference.then(function (buffer) {
    try {
      null !== referenceArrayRoot &&
        bumpArrayCount(referenceArrayRoot, buffer.byteLength, response);
      var resolvedValue =
        constructor === ArrayBuffer ? buffer : new constructor(buffer);
      "__proto__" !== key && (parentObject[parentKey] = resolvedValue);
      "" === parentKey &&
        null === handler.value &&
        (handler.value = resolvedValue);
    } catch (x) {
      reject(x);
      return;
    }
    handler.deps--;
    0 === handler.deps &&
      ((buffer = handler.chunk),
      null !== buffer &&
        "blocked" === buffer.status &&
        ((resolvedValue = buffer.value),
        (buffer.status = "fulfilled"),
        (buffer.value = handler.value),
        (buffer.reason = null),
        null !== resolvedValue &&
          wakeChunk(response, resolvedValue, handler.value, buffer)));
  }, reject);
  return null;
}
function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks;
  stream = new ReactPromise$1("fulfilled", stream, controller);
  chunks.set(id, stream);
  chunks = response._prefix;
  response = response._formData.streamChunks;
  id = null === response ? void 0 : response.get(chunks + "S" + id);
  if (void 0 !== id)
    for (response = 0; response < id.length; response++)
      (chunks = id[response]),
        "C" === chunks[0]
          ? controller.close("C" === chunks ? '"$undefined"' : chunks.slice(1))
          : controller.enqueueModel(chunks);
}
function parseReadableStream(response, reference, type) {
  function enqueue(value) {
    "bytes" !== type || ArrayBuffer.isView(value)
      ? controller.enqueue(value)
      : flightController.error(Error("Invalid data for bytes stream."));
  }
  reference = parseInt(reference.slice(2), 16);
  if (response._chunks.has(reference))
    throw Error("Already initialized stream.");
  var controller = null,
    closed = !1,
    stream = new ReadableStream({
      type: type,
      start: function (c) {
        controller = c;
      }
    }),
    previousBlockedChunk = null,
    flightController = {
      enqueueModel: function (json) {
        if (null === previousBlockedChunk) {
          var chunk = createResolvedModelChunk(response, json, -1);
          initializeModelChunk(chunk);
          "fulfilled" === chunk.status
            ? enqueue(chunk.value)
            : (chunk.then(enqueue, flightController.error),
              (previousBlockedChunk = chunk));
        } else {
          chunk = previousBlockedChunk;
          var chunk$37 = new ReactPromise$1("pending", null, null);
          chunk$37.then(enqueue, flightController.error);
          previousBlockedChunk = chunk$37;
          chunk.then(function () {
            previousBlockedChunk === chunk$37 && (previousBlockedChunk = null);
            resolveModelChunk(response, chunk$37, json, -1);
          });
        }
      },
      close: function () {
        if (!closed)
          if (((closed = !0), null === previousBlockedChunk))
            controller.close();
          else {
            var blockedChunk = previousBlockedChunk;
            previousBlockedChunk = null;
            blockedChunk.then(function () {
              return controller.close();
            });
          }
      },
      error: function (error) {
        if (!closed)
          if (((closed = !0), null === previousBlockedChunk))
            controller.error(error);
          else {
            var blockedChunk = previousBlockedChunk;
            previousBlockedChunk = null;
            blockedChunk.then(function () {
              return controller.error(error);
            });
          }
      }
    };
  resolveStream(response, reference, stream, flightController);
  return stream;
}
function FlightIterator(next) {
  this.next = next;
}
FlightIterator.prototype = {};
FlightIterator.prototype[ASYNC_ITERATOR] = function () {
  return this;
};
function parseAsyncIterable(response, reference, iterator) {
  reference = parseInt(reference.slice(2), 16);
  if (response._chunks.has(reference))
    throw Error("Already initialized stream.");
  var buffer = [],
    closed = !1,
    nextWriteIndex = 0,
    $jscomp$compprop5 = {};
  $jscomp$compprop5 =
    (($jscomp$compprop5[ASYNC_ITERATOR] = function () {
      var nextReadIndex = 0;
      return new FlightIterator(function (arg) {
        if (void 0 !== arg)
          throw Error(
            "Values cannot be passed to next() of AsyncIterables passed to Client Components."
          );
        if (nextReadIndex === buffer.length) {
          if (closed)
            return new ReactPromise$1(
              "fulfilled",
              { done: !0, value: void 0 },
              null
            );
          buffer[nextReadIndex] = new ReactPromise$1("pending", null, null);
        }
        return buffer[nextReadIndex++];
      });
    }),
    $jscomp$compprop5);
  iterator = iterator ? $jscomp$compprop5[ASYNC_ITERATOR]() : $jscomp$compprop5;
  resolveStream(response, reference, iterator, {
    enqueueModel: function (value) {
      nextWriteIndex === buffer.length
        ? (buffer[nextWriteIndex] = createResolvedIteratorResultChunk(
            response,
            value,
            !1
          ))
        : resolveIteratorResultChunk(
            response,
            buffer[nextWriteIndex],
            value,
            !1
          );
      nextWriteIndex++;
    },
    close: function (value) {
      if (!closed)
        for (
          closed = !0,
            nextWriteIndex === buffer.length
              ? (buffer[nextWriteIndex] = createResolvedIteratorResultChunk(
                  response,
                  value,
                  !0
                ))
              : resolveIteratorResultChunk(
                  response,
                  buffer[nextWriteIndex],
                  value,
                  !0
                ),
            nextWriteIndex++;
          nextWriteIndex < buffer.length;

        )
          resolveIteratorResultChunk(
            response,
            buffer[nextWriteIndex++],
            '"$undefined"',
            !0
          );
    },
    error: function (error) {
      if (!closed)
        for (
          closed = !0,
            nextWriteIndex === buffer.length &&
              (buffer[nextWriteIndex] = new ReactPromise$1(
                "pending",
                null,
                null
              ));
          nextWriteIndex < buffer.length;

        )
          triggerErrorOnChunk(response, buffer[nextWriteIndex++], error);
    }
  });
  return iterator;
}
function parseModelString(
  response,
  obj,
  key$jscomp$0,
  value,
  reference,
  arrayRoot
) {
  if ("$" === value[0]) {
    switch (value[1]) {
      case "$":
        return (
          null !== arrayRoot &&
            bumpArrayCount(arrayRoot, value.length - 1, response),
          value.slice(1)
        );
      case "@":
        return (obj = parseInt(value.slice(2), 16)), getChunk(response, obj);
      case "h":
        return (
          (arrayRoot = value.slice(2)),
          getOutlinedModel(
            response,
            arrayRoot,
            obj,
            key$jscomp$0,
            null,
            loadServerReference$1
          )
        );
      case "H":
        return;
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
          (arrayRoot = value.slice(2)),
          getOutlinedModel(
            response,
            arrayRoot,
            obj,
            key$jscomp$0,
            null,
            createMap
          )
        );
      case "W":
        return (
          (arrayRoot = value.slice(2)),
          getOutlinedModel(
            response,
            arrayRoot,
            obj,
            key$jscomp$0,
            null,
            createSet
          )
        );
      case "K":
        obj = value.slice(2);
        obj = response._prefix + "_" + obj + "_";
        response = response._formData;
        key$jscomp$0 = new FormData();
        arrayRoot = response.referencedEntries;
        if (null !== arrayRoot) {
          for (value = response.keyPointer; value < arrayRoot.length; ) {
            reference = arrayRoot[value];
            var key = reference[0];
            if (!key.startsWith(obj)) break;
            key$jscomp$0.append(key.slice(obj.length), reference[1]);
            value++;
          }
          response.keyPointer = value;
        }
        return key$jscomp$0;
      case "i":
        return (
          (arrayRoot = value.slice(2)),
          getOutlinedModel(
            response,
            arrayRoot,
            obj,
            key$jscomp$0,
            null,
            extractIterator
          )
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
        obj = value.slice(2);
        if (300 < obj.length)
          throw Error(
            "BigInt is too large. Received " +
              obj.length +
              " digits but the limit is 300."
          );
        null !== arrayRoot && bumpArrayCount(arrayRoot, obj.length, response);
        return BigInt(obj);
      case "A":
        return parseTypedArray(
          response,
          value,
          ArrayBuffer,
          1,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "O":
        return parseTypedArray(
          response,
          value,
          Int8Array,
          1,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "o":
        return parseTypedArray(
          response,
          value,
          Uint8Array,
          1,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "U":
        return parseTypedArray(
          response,
          value,
          Uint8ClampedArray,
          1,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "S":
        return parseTypedArray(
          response,
          value,
          Int16Array,
          2,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "s":
        return parseTypedArray(
          response,
          value,
          Uint16Array,
          2,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "L":
        return parseTypedArray(
          response,
          value,
          Int32Array,
          4,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "l":
        return parseTypedArray(
          response,
          value,
          Uint32Array,
          4,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "G":
        return parseTypedArray(
          response,
          value,
          Float32Array,
          4,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "g":
        return parseTypedArray(
          response,
          value,
          Float64Array,
          8,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "M":
        return parseTypedArray(
          response,
          value,
          BigInt64Array,
          8,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "m":
        return parseTypedArray(
          response,
          value,
          BigUint64Array,
          8,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "V":
        return parseTypedArray(
          response,
          value,
          DataView,
          1,
          obj,
          key$jscomp$0,
          arrayRoot
        );
      case "B":
        obj = parseInt(value.slice(2), 16);
        response = getBackingBlob(response._formData, response._prefix + obj);
        if (!(response instanceof Blob))
          throw Error("Referenced Blob is not a Blob.");
        return response;
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
    return getOutlinedModel(
      response,
      value,
      obj,
      key$jscomp$0,
      arrayRoot,
      createModel
    );
  }
  null !== arrayRoot && bumpArrayCount(arrayRoot, value.length, response);
  return value;
}
function createResponse(bundlerConfig, formFieldPrefix, temporaryReferences) {
  var backingFormData =
      3 < arguments.length && void 0 !== arguments[3]
        ? arguments[3]
        : new FormData(),
    arraySizeLimit =
      4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : 1e6,
    chunks = new Map(),
    backingStore = {
      prefix: formFieldPrefix,
      referencedEntries: null,
      keyPointer: 0,
      stringChunks: null,
      streamChunks: null,
      blobs: null
    };
  backingFormData.forEach(appendBackingEntry.bind(null, backingStore));
  return {
    _bundlerConfig: bundlerConfig,
    _prefix: formFieldPrefix,
    _formData: backingStore,
    _chunks: chunks,
    _closed: !1,
    _closedReason: null,
    _temporaryReferences: temporaryReferences,
    _serverReferenceObjects: null,
    _serverReferenceCache: new WeakMap(),
    _serverObjectReferenceCache: new WeakMap(),
    _rootArrayContexts: new WeakMap(),
    _arraySizeLimit: arraySizeLimit
  };
}
function resolveField(response, key, value) {
  var prefix = response._prefix;
  if (key.startsWith(prefix)) {
    var chunks = response._chunks;
    if ("S" === key[prefix.length]) {
      if (
        key.length > prefix.length + 1 &&
        ((prefix = +key.slice(prefix.length + 1)),
        (chunks = chunks.get(prefix)))
      ) {
        resolveModelChunk(response, chunks, value, prefix);
        return;
      }
    } else if (
      ((prefix = +key.slice(prefix.length)), (chunks = chunks.get(prefix)))
    ) {
      resolveModelChunk(response, chunks, value, prefix);
      return;
    }
  }
  appendBackingEntry(response._formData, value, key);
}
function close(response) {
  reportGlobalError(response, Error("Connection closed."));
}
function loadServerReference(bundlerConfig, metaData) {
  var id = metaData.id;
  if ("string" !== typeof id) return null;
  var serverReference = resolveServerReference(bundlerConfig, id);
  bundlerConfig = preloadModule$1(serverReference);
  metaData = metaData.bound;
  return metaData instanceof Promise
    ? Promise.all([metaData, bundlerConfig]).then(function (_ref) {
        _ref = _ref[0];
        var fn = requireModule(serverReference);
        if (1e3 < _ref.length)
          throw Error(
            "Server Function has too many bound arguments. Received " +
              _ref.length +
              " but the limit is 1000."
          );
        return fn.bind.apply(fn, [null].concat(_ref));
      })
    : bundlerConfig
      ? Promise.resolve(bundlerConfig).then(function () {
          return requireModule(serverReference);
        })
      : Promise.resolve(requireModule(serverReference));
}
function decodeBoundActionMetaData(
  body,
  serverManifest,
  formFieldPrefix,
  arraySizeLimit
) {
  body = createResponse(
    serverManifest,
    formFieldPrefix,
    void 0,
    body,
    arraySizeLimit
  );
  close(body);
  body = getChunk(body, 0);
  body.then(function () {});
  if ("fulfilled" !== body.status) throw body.reason;
  return body.value;
}
function createDrainHandler$1(destination, request) {
  return function () {
    return startFlowing$1(request, destination);
  };
}
function createCancelHandler$1(request, reason) {
  return function () {
    request.destination = null;
    abort$2(request, Error(reason));
  };
}
function createFakeWritableFromReadableStreamController$1(controller) {
  return {
    write: function (chunk) {
      "string" === typeof chunk && (chunk = textEncoder.encode(chunk));
      controller.enqueue(chunk);
      return !0;
    },
    end: function () {
      controller.close();
    },
    destroy: function (error) {
      "function" === typeof controller.error
        ? controller.error(error)
        : controller.close();
    }
  };
}
function createFakeWritableFromNodeReadable(readable) {
  return {
    write: function (chunk) {
      return readable.push(chunk);
    },
    end: function () {
      readable.push(null);
    },
    destroy: function (error) {
      readable.destroy(error);
    }
  };
}
var SequencePrototype = {};
function createSequence() {
  function finish(nextStatus, reason) {
    0 === status &&
      ((status = nextStatus),
      (errorReason = reason),
      readers.forEach(function (reader) {
        1 === status
          ? reader.close()
          : 2 === status
            ? reader.error(reason)
            : reader.halt();
      }),
      readers.clear());
  }
  var models = [],
    readers = new Set(),
    status = 0,
    errorReason;
  return {
    model: Object.create(SequencePrototype),
    subscribe: function (reader) {
      for (var i = 0; i < models.length; i++) {
        var entry = models[i];
        reader.enqueue(entry.model, entry.done);
      }
      0 === status
        ? readers.add(reader)
        : 1 === status
          ? reader.close()
          : 2 === status
            ? reader.error(errorReason)
            : reader.halt();
      return function () {
        readers.delete(reader);
      };
    },
    enqueue: function (model) {
      var done =
        1 < arguments.length && void 0 !== arguments[1] ? arguments[1] : !1;
      0 === status &&
        (models.push({ model: model, done: done }),
        readers.forEach(function (reader) {
          return reader.enqueue(model, done);
        }));
    },
    close: function () {
      finish(1, void 0);
    },
    error: function (reason) {
      finish(2, reason);
    },
    halt: function () {
      finish(3, void 0);
    }
  };
}
function createAsyncIterable(isIterator) {
  var sequence = createSequence();
  return {
    iterable: sequence.model,
    isIterator: isIterator,
    subscribe: sequence.subscribe,
    enqueue: sequence.enqueue,
    close: function (model) {
      sequence.enqueue(model, !0);
      sequence.close();
    },
    error: sequence.error,
    halt: sequence.halt
  };
}
function createReadableStream(isByteStream) {
  var sequence = createSequence();
  return {
    stream: sequence.model,
    isByteStream: isByteStream,
    subscribe: sequence.subscribe,
    enqueue: sequence.enqueue,
    close: sequence.close,
    error: sequence.error,
    halt: sequence.halt
  };
}
var currentRequest = null,
  thenableIndexCounter = 0,
  thenableState = null;
function getThenableStateAfterSuspending() {
  var state = thenableState || [];
  thenableState = null;
  return state;
}
var HooksDispatcher = {
  readContext: unsupportedContext,
  use: use,
  useCallback: function (callback) {
    return callback;
  },
  useContext: unsupportedContext,
  useEffect: unsupportedHook,
  useImperativeHandle: unsupportedHook,
  useLayoutEffect: unsupportedHook,
  useInsertionEffect: unsupportedHook,
  useMemo: function (nextCreate) {
    return nextCreate();
  },
  useReducer: unsupportedHook,
  useRef: unsupportedHook,
  useState: unsupportedHook,
  useDebugValue: function () {},
  useDeferredValue: unsupportedHook,
  useTransition: unsupportedHook,
  useSyncExternalStore: unsupportedHook,
  useId: useId,
  useHostTransitionStatus: unsupportedHook,
  useFormState: unsupportedHook,
  useActionState: unsupportedHook,
  useOptimistic: unsupportedHook,
  useMemoCache: function (size) {
    for (var data = Array(size), i = 0; i < size; i++)
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    return data;
  },
  useCacheRefresh: function () {
    return unsupportedRefresh;
  },
  useEffectEvent: unsupportedHook
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
  if (null === currentRequest)
    throw Error("useId can only be used while React is rendering");
  var id = currentRequest.identifierCount++;
  return "_" + currentRequest.identifierPrefix + "S_" + id.toString(32) + "_";
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
  if (isClientReference(usable)) {
    if (null != usable.value && usable.value.$$typeof === REACT_CONTEXT_TYPE)
      throw Error("Cannot read a Client Context from a Server Component.");
    throw Error("Cannot use() an already resolved Client Reference.");
  }
  throw Error("An unsupported type was passed to use(): " + String(usable));
}
function packModelInfo(flags, jsonWork) {
  return 0 < jsonWork && 33554431 >= jsonWork
    ? flags | 8 | (jsonWork << 5)
    : flags;
}
function getJSONValueWork(value, info) {
  return null === value || "boolean" === typeof value
    ? 1
    : "number" === typeof value
      ? Number.isFinite(value) && !Object.is(value, -0)
        ? 1
        : 0
      : "string" === typeof value
        ? 1024 > value.length && "$" !== value[0]
          ? 1 + value.length
          : 0
        : 0 === (info & 8)
          ? 0
          : info >>> 5;
}
function abortResult(result, reason) {
  result = result.abortCallback;
  null !== result && result(reason);
}
function createResult(root, abort, temporaryReferenceSet) {
  root = {
    root: root,
    temporaryReferenceSet: temporaryReferenceSet,
    closed: !1,
    completionListeners: null,
    hintQueue: null,
    hintsClosed: !1,
    abortCallback: abort,
    abort: noop,
    errorReferences: new WeakMap(),
    errorInfos: null,
    haltedModels: null,
    modelReferences: null,
    valueReferences: null,
    temporaryReferences: null,
    serverReferences: null,
    formDataWithBlobs: null,
    asyncIterables: null,
    readableStreams: null,
    iteratorEntries: null,
    collectionEntries: null,
    modelInfo: null,
    jsonWorkCredit: 0
  };
  root.abort = abortResult.bind(null, root);
  return root;
}
function completeResult(result) {
  if (!result.closed) {
    result.closed = !0;
    result.abortCallback = null;
    var listeners = result.completionListeners;
    result.completionListeners = null;
    null !== listeners &&
      (listeners.forEach(function (listener) {
        return listener();
      }),
      listeners.clear());
  }
}
function subscribeToResult(result, listener) {
  if (result.closed) return listener(), noop;
  var listeners = result.completionListeners;
  null === listeners && (result.completionListeners = listeners = new Set());
  listeners.add(listener);
  var subscriptions = listeners;
  return function () {
    subscriptions.delete(listener);
  };
}
function getHintQueue(result) {
  var queue = result.hintQueue;
  null === queue &&
    (result.hintQueue = queue =
      {
        completedHints: [],
        closed: result.hintsClosed,
        wakeup: null,
        resolve: noop
      });
  return queue;
}
function wakeHintQueue(queue) {
  var resolve = queue.resolve;
  queue.wakeup = null;
  queue.resolve = noop;
  resolve();
}
function waitForHints(queue) {
  var wakeup = queue.wakeup;
  null === wakeup &&
    (queue.wakeup = wakeup =
      new Promise(function (resolve) {
        queue.resolve = resolve;
      }));
  return wakeup;
}
function closeHints(result) {
  result.hintsClosed = !0;
  result = result.hintQueue;
  null !== result && ((result.closed = !0), wakeHintQueue(result));
}
function createValueReference(result, reference) {
  var references = result.valueReferences;
  null === references && (result.valueReferences = references = new WeakSet());
  references.add(reference);
  return reference;
}
function getValueReference(result, value) {
  result = result.valueReferences;
  return null !== result && result.has(value) ? value : void 0;
}
function copyErrorReference(result, thenable, source) {
  source = result.errorReferences.get(source);
  void 0 !== source && result.errorReferences.set(thenable, source);
}
function forwardModelReference(result, promise, thenable) {
  var references = result.modelReferences;
  null === references && (result.modelReferences = references = new WeakMap());
  references.set(promise, thenable);
  thenable.then(noop, function () {
    copyErrorReference(result, promise, thenable);
  });
}
function setModelInfo(result, model, info) {
  var work = 0 === (info & 8) ? 0 : info >>> 5;
  (0 < work && 129 > work) ||
    ((work = result.modelInfo),
    null === work && (result.modelInfo = work = new Map()),
    work.set(model, info));
}
function getModelInfo(result, model) {
  result = result.modelInfo;
  return null === result ? 0 : result.get(model) || 0;
}
function markHalted(result, model) {
  var haltedModels = result.haltedModels;
  null === haltedModels && (result.haltedModels = haltedModels = new WeakSet());
  haltedModels.add(model);
}
function isHalted(result, model) {
  var haltedModels = result.haltedModels;
  if (null === haltedModels) return !1;
  result = result.modelReferences;
  for (var visited = new Set(); !visited.has(model); ) {
    if (haltedModels.has(model)) return !0;
    visited.add(model);
    model = null === result ? void 0 : result.get(model);
    if (void 0 === model) break;
  }
  return !1;
}
function getIteratorEntries(result, iterator) {
  result = result.iteratorEntries;
  return null === result ? void 0 : result.get(iterator);
}
function setServerReference(result, value, metadata) {
  var serverReferences = result.serverReferences;
  null === serverReferences &&
    (result.serverReferences = serverReferences = new WeakMap());
  serverReferences.set(value, metadata);
}
function getTemporaryReference(result, value) {
  result = result.temporaryReferences;
  return null === result ? void 0 : result.get(value);
}
function setReadableStream(result, controller) {
  var readableStreams = result.readableStreams;
  null === readableStreams &&
    (result.readableStreams = readableStreams = new WeakMap());
  readableStreams.set(controller.stream, controller);
}
function getReadableStream(result, stream) {
  result = result.readableStreams;
  return null === result ? void 0 : result.get(stream);
}
function setAsyncIterable(result, controller) {
  var asyncIterables = result.asyncIterables;
  null === asyncIterables &&
    (result.asyncIterables = asyncIterables = new WeakMap());
  asyncIterables.set(controller.iterable, controller);
}
function getAsyncIterable(result, iterable) {
  result = result.asyncIterables;
  return null === result ? void 0 : result.get(iterable);
}
var RESULT_MODEL_TYPE = Symbol.for("react.result.model");
function ReactPromise(weak) {
  var $jscomp$this = this;
  this.$$typeof = RESULT_MODEL_TYPE;
  this.status = weak ? "pending_weak" : "pending";
  this.reason = this.value = void 0;
  this._promise = new Promise(function (resolve, reject) {
    $jscomp$this._resolve = resolve;
    $jscomp$this._reject = reject;
  });
  this._promise.catch(noop);
}
ReactPromise.prototype = Object.create(Promise.prototype);
Object.defineProperty(ReactPromise.prototype, "then", {
  writable: !0,
  enumerable: !0,
  configurable: !0,
  value: function (resolve, reject) {
    return this._promise.then(function (outcome) {
      return "function" === typeof resolve
        ? resolve(outcome.value)
        : outcome.value;
    }, reject);
  }
});
function createResultModel() {
  return new ReactPromise(
    0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : !1
  );
}
function fulfillResultModel(model, value) {
  if ("pending" === model.status || "pending_weak" === model.status)
    (model.status = "fulfilled"),
      (model.value = value),
      model._resolve({ value: value });
}
function rejectResultModel(model, error) {
  if ("pending" === model.status || "pending_weak" === model.status)
    (model.status = "rejected"), (model.reason = error), model._reject(error);
}
var previousDispatcher = ReactDOMSharedInternals.d;
ReactDOMSharedInternals.d = {
  f: previousDispatcher.f,
  r: previousDispatcher.r,
  D: prefetchDNS,
  C: preconnect,
  L: preload,
  m: preloadModule,
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
      hints.has(key) || (hints.add(key), emitHint$1(request, "D", href));
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
          ? emitHint$1(request, "C", [href, crossOrigin])
          : emitHint$1(request, "C", href));
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
          ? emitHint$1(request, "L", [href, as, options])
          : emitHint$1(request, "L", [href, as]));
    } else previousDispatcher.L(href, as, options);
  }
}
function preloadModule(href, options) {
  if ("string" === typeof href) {
    var request = resolveRequest();
    if (request) {
      var hints = request.hints,
        key = "m|" + href;
      if (hints.has(key)) return;
      hints.add(key);
      return (options = trimOptions(options))
        ? emitHint$1(request, "m", [href, options])
        : emitHint$1(request, "m", href);
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
        ? emitHint$1(request, "S", [
            href,
            "string" === typeof precedence ? precedence : 0,
            options
          ])
        : "string" === typeof precedence
          ? emitHint$1(request, "S", [href, precedence])
          : emitHint$1(request, "S", href);
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
        ? emitHint$1(request, "X", [src, options])
        : emitHint$1(request, "X", src);
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
        ? emitHint$1(request, "M", [src, options])
        : emitHint$1(request, "M", src);
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
function getChildFormatContext(parentContext, type, props) {
  switch (type) {
    case "img":
      type = props.src;
      var srcSet = props.srcSet;
      if (
        !(
          "lazy" === props.loading ||
          (!type && !srcSet) ||
          ("string" !== typeof type && null != type) ||
          ("string" !== typeof srcSet && null != srcSet) ||
          "low" === props.fetchPriority ||
          parentContext & 3
        ) &&
        ("string" !== typeof type ||
          ":" !== type[4] ||
          ("d" !== type[0] && "D" !== type[0]) ||
          ("a" !== type[1] && "A" !== type[1]) ||
          ("t" !== type[2] && "T" !== type[2]) ||
          ("a" !== type[3] && "A" !== type[3])) &&
        ("string" !== typeof srcSet ||
          ":" !== srcSet[4] ||
          ("d" !== srcSet[0] && "D" !== srcSet[0]) ||
          ("a" !== srcSet[1] && "A" !== srcSet[1]) ||
          ("t" !== srcSet[2] && "T" !== srcSet[2]) ||
          ("a" !== srcSet[3] && "A" !== srcSet[3]))
      ) {
        var sizes = "string" === typeof props.sizes ? props.sizes : void 0,
          crossOrigin = getCrossOriginString(props.crossOrigin);
        preload(type || "", "image", {
          imageSrcSet: srcSet,
          imageSizes: sizes,
          crossOrigin: crossOrigin,
          integrity: props.integrity,
          type: props.type,
          fetchPriority: props.fetchPriority,
          referrerPolicy: props.referrerPolicy
        });
      }
      return parentContext;
    case "link":
      type = props.rel;
      srcSet = props.href;
      if (
        !(
          parentContext & 1 ||
          null != props.itemProp ||
          "string" !== typeof type ||
          "string" !== typeof srcSet ||
          "" === srcSet
        )
      )
        switch (type) {
          case "preload":
            preload(srcSet, props.as, {
              crossOrigin: props.crossOrigin,
              integrity: props.integrity,
              nonce: props.nonce,
              type: props.type,
              fetchPriority: props.fetchPriority,
              referrerPolicy: props.referrerPolicy,
              imageSrcSet: props.imageSrcSet,
              imageSizes: props.imageSizes,
              media: props.media
            });
            break;
          case "modulepreload":
            preloadModule(srcSet, {
              as: props.as,
              crossOrigin: props.crossOrigin,
              integrity: props.integrity,
              nonce: props.nonce
            });
            break;
          case "stylesheet":
            preload(srcSet, "style", {
              crossOrigin: props.crossOrigin,
              integrity: props.integrity,
              nonce: props.nonce,
              type: props.type,
              fetchPriority: props.fetchPriority,
              referrerPolicy: props.referrerPolicy,
              media: props.media
            });
        }
      return parentContext;
    case "picture":
      return parentContext | 2;
    case "noscript":
      return parentContext | 1;
    default:
      return parentContext;
  }
}
var UNDEFINED_MODEL = Symbol(),
  ObjectPrototype$1 = Object.prototype,
  DatePrototype = Date.prototype,
  dateToJSON = DatePrototype.toJSON,
  dateToISOString = DatePrototype.toISOString,
  dateValueOf = DatePrototype.valueOf,
  dateToPrimitive = Date.prototype[Symbol.toPrimitive],
  dateGetTime = DatePrototype.getTime;
function isSimpleDate(value) {
  return (
    getPrototypeOf$1(value) === DatePrototype &&
    !hasOwnProperty.call(value, "toJSON") &&
    !hasOwnProperty.call(value, "toISOString") &&
    !hasOwnProperty.call(value, "valueOf") &&
    !hasOwnProperty.call(value, Symbol.toPrimitive) &&
    DatePrototype.toJSON === dateToJSON &&
    DatePrototype.toISOString === dateToISOString &&
    DatePrototype.valueOf === dateValueOf &&
    Date.prototype[Symbol.toPrimitive] === dateToPrimitive
  );
}
var getPrototypeOf$1 = Object.getPrototypeOf,
  modelRoot$1 = null,
  modelDepth = 0,
  emptyRoot = {};
function defaultErrorHandler$1(error) {
  console.error(error);
}
function RequestInstance$1(
  model,
  onError,
  identifierPrefix,
  temporaryReferences,
  createServerReference,
  type,
  onAllReady,
  onFatalError
) {
  var $jscomp$this = this;
  if (
    null !== ReactSharedInternalsServer.A &&
    ReactSharedInternalsServer.A !== DefaultAsyncDispatcher
  )
    throw Error("Currently React only supports one RSC renderer at a time.");
  ReactSharedInternalsServer.A = DefaultAsyncDispatcher;
  this.type = type;
  this.onAllReady = onAllReady;
  this.onFatalError = onFatalError;
  this.status = 10;
  this.abortModel = this.fatalError = null;
  this.onError = void 0 === onError ? defaultErrorHandler$1 : onError;
  this.hints = new Set();
  this.cache = new Map();
  this.cacheController = new AbortController();
  this.modelEntries = new WeakMap();
  this.renderingComponents = new Map();
  this.renderedImplicitModels = new WeakMap();
  this.resolvedOutlinedModels =
    this.outlinedModelDependencies =
    this.outlinedModels =
    this.publishedModelReferences =
    this.renderedKeyedModels =
      null;
  this.resolvingModelStack = [];
  this.resolvingModels = null;
  this.hasByValueModels = !1;
  this.taintCleanupQueue = [];
  this.pendingWeakModels = null;
  this.abortableTasks = new Set();
  this.identifierPrefix = identifierPrefix || "";
  this.temporaryReferences = temporaryReferences;
  this.createServerReference = createServerReference;
  this.identifierCount = 1;
  model = createTask$1(this, model, null, !1, 0);
  this.result = createResult(
    model.promise,
    function (reason) {
      return abort$1($jscomp$this, reason);
    },
    temporaryReferences
  );
  this.pingedTasks = [model];
}
function resolveRequest() {
  var cache = resolveCache();
  return cache instanceof RequestInstance$1 ? cache : null;
}
function emitHint$1(request, code, model) {
  request = request.result;
  request.hintsClosed ||
    ((request = getHintQueue(request)),
    request.completedHints.push({ code: code, model: model }),
    wakeHintQueue(request));
}
function renderFunctionComponent(request, task, Component, props, element) {
  var renderedModels = getRenderedModels(
      request,
      element,
      task.keyPath,
      task.implicitSlot
    ),
    prevThenableState = task.thenableState,
    key = element.key;
  task.thenableState = null;
  var isRendering = request.renderingComponents.has(element);
  isRendering
    ? (prevThenableState = request.renderingComponents.get(element))
    : ((thenableIndexCounter = 0),
      (thenableState = prevThenableState),
      (prevThenableState = Component(props, void 0)));
  if (12 === request.status || 14 === request.status)
    throw (
      (null === prevThenableState ||
        "object" !== typeof prevThenableState ||
        isClientReference(prevThenableState) ||
        "function" !== typeof prevThenableState.then ||
        prevThenableState.then(noop, noop),
      request.fatalError)
    );
  Component = task.keyPath;
  props = task.implicitSlot;
  null !== key
    ? (task.keyPath =
        key === REACT_OPTIMISTIC_KEY || Component === REACT_OPTIMISTIC_KEY
          ? REACT_OPTIMISTIC_KEY
          : null === Component
            ? key
            : Component + "," + key)
    : null === Component && (task.implicitSlot = !0);
  if (isRendering)
    return (
      (element = renderModelDestructive$1(
        request,
        task,
        emptyRoot,
        "",
        prevThenableState
      )),
      (task.keyPath = Component),
      (task.implicitSlot = props),
      element
    );
  if (
    null !== prevThenableState &&
    "object" === typeof prevThenableState &&
    !isClientReference(prevThenableState) &&
    "function" === typeof prevThenableState.then
  )
    return (
      (request = renderModelDestructive$1(
        request,
        task,
        emptyRoot,
        "",
        prevThenableState
      )),
      (request = createLazyWrapperAroundWakeable(request)),
      setRenderedModel(renderedModels, element, request),
      (task.keyPath = Component),
      (task.implicitSlot = props),
      (task.isModelReference = !0),
      request
    );
  if (
    !(
      null === prevThenableState ||
      "object" !== typeof prevThenableState ||
      prevThenableState.$$typeof === REACT_ELEMENT_TYPE ||
      isClientReference(prevThenableState) ||
      isArrayImpl(prevThenableState) ||
      prevThenableState instanceof Map ||
      prevThenableState instanceof Set
    )
  ) {
    var iteratorFn = getIteratorFn(prevThenableState);
    if (iteratorFn) {
      var iterableChild = prevThenableState;
      key = {};
      prevThenableState =
        ((key[Symbol.iterator] = function () {
          return iteratorFn.call(iterableChild);
        }),
        key);
    } else if (
      !(
        "function" !== typeof prevThenableState[ASYNC_ITERATOR] ||
        ("function" === typeof ReadableStream &&
          prevThenableState instanceof ReadableStream)
      )
    ) {
      var iterableChild$46 = prevThenableState;
      key = {};
      prevThenableState =
        ((key[ASYNC_ITERATOR] = function () {
          return iterableChild$46[ASYNC_ITERATOR]();
        }),
        key);
    }
  }
  request.renderingComponents.set(element, prevThenableState);
  try {
    var resolvedModel$48 = renderModelDestructive$1(
      request,
      task,
      emptyRoot,
      "",
      prevThenableState
    );
    setRenderedModel(
      renderedModels,
      element,
      void 0 === resolvedModel$48 ? UNDEFINED_MODEL : resolvedModel$48
    );
    task.keyPath = Component;
    task.implicitSlot = props;
    return resolvedModel$48;
  } finally {
    request.renderingComponents.delete(element);
  }
}
function createTask$1(request, model, keyPath, implicitSlot, formatContext) {
  var promise = createResultModel(),
    reference = { root: promise, parent: null, key: "" };
  null !== model &&
    "object" === typeof model &&
    setModelReferenceIfAbsent(request, model, reference);
  var task = {
    model: model,
    promise: promise,
    reference: reference,
    currentReference: reference,
    fieldParentReference: void 0,
    renderedModel: void 0,
    resolvedModelInfo: 0,
    modelDependencies: null,
    resolve: function (value) {
      return fulfillResultModel(promise, value);
    },
    reject: function (error) {
      return rejectResultModel(promise, error);
    },
    status: 0,
    formatContext: formatContext,
    isModelReference: !1,
    ping: function () {
      return pingTask$1(request, task);
    },
    thenableState: null,
    keyPath: keyPath,
    implicitSlot: implicitSlot
  };
  request.abortableTasks.add(task);
  return task;
}
function pingTask$1(request, task) {
  if (14 !== request.status && 0 === task.status) {
    var pingedTasks = request.pingedTasks;
    pingedTasks.push(task);
    1 === pingedTasks.length &&
      (21 === request.type || 10 === request.status
        ? scheduleMicrotask(function () {
            return performWork$1(request);
          })
        : setImmediate(function () {
            return performWork$1(request);
          }));
  }
}
function outlineModelWithFormatContext(request, value, formatContext) {
  formatContext = createTask$1(request, value, null, !1, formatContext);
  null !== value &&
    "object" === typeof value &&
    (setModelReference(request, value, formatContext.reference),
    setRenderedModel(request.modelEntries, value, formatContext.promise));
  retryTask$1(request, formatContext);
  var model =
    1 === formatContext.status ? formatContext.model : formatContext.promise;
  null !== value &&
    "object" === typeof value &&
    setRenderedModel(
      request.modelEntries,
      value,
      void 0 === model ? UNDEFINED_MODEL : model
    );
  1 !== formatContext.status &&
    ((value = request.outlinedModels),
    null === value && (request.outlinedModels = value = new WeakMap()),
    value.set(formatContext.promise, formatContext),
    (request.hasByValueModels = !0));
  return model;
}
function outlineModel$1(request, value) {
  if (null !== value && "object" === typeof value) {
    var existingModel = getRenderedModel(request.modelEntries, value);
    if (void 0 !== existingModel)
      return existingModel === UNDEFINED_MODEL ? void 0 : existingModel;
  }
  return outlineModelWithFormatContext(request, value, 0);
}
function readThenable(thenable) {
  if ("fulfilled" === thenable.status) return thenable.value;
  if ("rejected" === thenable.status) throw thenable.reason;
  throw thenable;
}
function createLazyWrapperAroundWakeable(thenable) {
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      break;
    default:
      "string" !== typeof thenable.status &&
        ((thenable.status = "pending"),
        thenable.then(
          function (value) {
            "pending" === thenable.status &&
              ((thenable.status = "fulfilled"), (thenable.value = value));
          },
          function (error) {
            "pending" === thenable.status &&
              ((thenable.status = "rejected"), (thenable.reason = error));
          }
        ));
  }
  return { $$typeof: REACT_LAZY_TYPE, _payload: thenable, _init: readThenable };
}
function erroredTask$1(request, task, error) {
  task.status = 4;
  logRecoverableError$1(request, error, task);
  var model = task.model;
  if (
    null !== model &&
    "object" === typeof model &&
    model.$$typeof === REACT_ELEMENT_TYPE
  ) {
    var renderedModels = getRenderedModels(
      request,
      model,
      task.keyPath,
      task.implicitSlot
    );
    void 0 === getRenderedModel(renderedModels, model) &&
      setRenderedModel(
        renderedModels,
        model,
        createLazyWrapperAroundWakeable(task.promise)
      );
  }
  request.abortableTasks.delete(task);
  task.reject(error);
}
function logRecoverableError$1(request, error) {
  var task =
      2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null,
    prevCache = setCurrentCache(null);
  try {
    var onError = request.onError;
    var errorDigest = cacheStorage.run(void 0, function () {
      return requestStorage.run(void 0, onError, error);
    });
  } finally {
    setCurrentCache(prevCache);
  }
  if (null != errorDigest && "string" !== typeof errorDigest)
    throw Error(
      'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
        typeof errorDigest +
        '" instead'
    );
  prevCache = errorDigest || "";
  null !== task &&
    request.result.errorReferences.set(task.promise, { digest: prevCache });
  return prevCache;
}
function fatalError$1(request, error) {
  14 !== request.status &&
    ((request.status = 12),
    (request.fatalError = error),
    request.cacheController.abort(error),
    finishAbort$1(request, error),
    request.onFatalError(error));
}
function renderThenable(request, task, value) {
  var newTask = createTask$1(
    request,
    value,
    task.keyPath,
    task.implicitSlot,
    task.formatContext
  );
  setRenderedModel(
    getRenderedModels(request, value, task.keyPath, task.implicitSlot),
    value,
    newTask.promise
  );
  switch (value.status) {
    case "fulfilled":
      newTask.model = value.value;
      pingTask$1(request, newTask);
      break;
    case "rejected":
      try {
        erroredTask$1(request, newTask, value.reason);
      } catch (error) {
        fatalError$1(request, error);
      }
      break;
    default:
      12 === request.status
        ? abortTask$1(request, newTask)
        : ("string" !== typeof value.status &&
            ((value.status = "pending"),
            value.then(
              function (fulfilledValue) {
                "pending" === value.status &&
                  ((value.status = "fulfilled"),
                  (value.value = fulfilledValue));
              },
              function (error) {
                "pending" === value.status &&
                  ((value.status = "rejected"), (value.reason = error));
              }
            )),
          value.then(
            function (fulfilledValue) {
              0 === newTask.status &&
                ((newTask.model = fulfilledValue),
                pingTask$1(request, newTask));
            },
            function (reason) {
              if (0 === newTask.status) {
                try {
                  erroredTask$1(request, newTask, reason);
                } catch (error$49) {
                  fatalError$1(request, error$49);
                }
                scheduleMicrotask(function () {
                  return performWork$1(request);
                });
              }
            }
          ));
  }
  return newTask.promise;
}
function renderModelDestructive$1(
  request,
  task,
  parent,
  parentPropertyName,
  value,
  parentReference
) {
  modelDepth++;
  try {
    return renderModelDestructiveImpl(
      request,
      task,
      parent,
      parentPropertyName,
      value,
      parentReference
    );
  } finally {
    modelDepth--;
  }
}
function renderModelDestructiveImpl(
  request,
  task,
  parent,
  parentPropertyName,
  value$jscomp$0,
  parentReference
) {
  task.model = value$jscomp$0;
  if (
    null !== value$jscomp$0 &&
    "object" === typeof value$jscomp$0 &&
    void 0 !== getValueReference(request.result, value$jscomp$0)
  )
    return renderModelReference(task, value$jscomp$0);
  if (
    null !== value$jscomp$0 &&
    ("object" === typeof value$jscomp$0 || "function" === typeof value$jscomp$0)
  ) {
    if (isClientReference(value$jscomp$0))
      return renderModelReference(task, value$jscomp$0);
    if (
      "function" === typeof value$jscomp$0 &&
      value$jscomp$0.$$typeof === SERVER_REFERENCE_TAG
    )
      return renderModelReference(
        task,
        renderServerReference(request, value$jscomp$0)
      );
    if (void 0 !== request.temporaryReferences) {
      var reference$51 = request.temporaryReferences.get(value$jscomp$0);
      if (void 0 !== reference$51) {
        request = request.result;
        var value = value$jscomp$0;
        parent = request.temporaryReferences;
        null === parent &&
          (request.temporaryReferences = parent = new WeakMap());
        parent.set(value, reference$51);
        return renderModelReference(task, value$jscomp$0);
      }
    }
  }
  if (null === value$jscomp$0 || "object" !== typeof value$jscomp$0) {
    "string" === typeof value$jscomp$0 &&
      1024 <= value$jscomp$0.length &&
      (value$jscomp$0 = value$jscomp$0.toWellFormed());
    if (
      "string" === typeof value$jscomp$0 &&
      "Z" === value$jscomp$0[value$jscomp$0.length - 1] &&
      parent[parentPropertyName] instanceof Date
    )
      return renderModelReference(task, new Date(value$jscomp$0));
    if ("function" === typeof value$jscomp$0) {
      if (value$jscomp$0.$$typeof === TEMPORARY_REFERENCE_TAG)
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
    if (
      "symbol" === typeof value$jscomp$0 &&
      ((task = value$jscomp$0),
      (request = task.description),
      Symbol.for(request) !== task)
    )
      throw Error(
        "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
          (request + ") cannot be found among global symbols.") +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    return value$jscomp$0;
  }
  reference$51 = getRenderedModels(
    request,
    value$jscomp$0,
    task.keyPath,
    task.implicitSlot
  );
  var modelEntry = reference$51.get(value$jscomp$0),
    existingModel = void 0 === modelEntry ? void 0 : modelEntry.model,
    elementType = value$jscomp$0.$$typeof,
    canReference =
      elementType === REACT_ELEMENT_TYPE
        ? null === task.keyPath && !task.implicitSlot
        : (isArrayImpl(value$jscomp$0) && null === task.keyPath) ||
          value$jscomp$0 instanceof Map ||
          value$jscomp$0 instanceof Set ||
          getPrototypeOf$1(value$jscomp$0) === ObjectPrototype$1,
    referenceEntry = canReference
      ? reference$51 === request.modelEntries
        ? modelEntry
        : request.modelEntries.get(value$jscomp$0)
      : void 0;
  value = getEntryReference(referenceEntry);
  if (
    canReference &&
    void 0 !== value &&
    value.root !== task.promise &&
    void 0 !== existingModel &&
    "function" !== typeof value$jscomp$0.then
  )
    return renderModelReference(
      task,
      createValueReference(
        request.result,
        getPublishedModelReference(request, value)
      )
    );
  if (void 0 !== existingModel) {
    if (
      elementType === REACT_ELEMENT_TYPE &&
      "string" === typeof existingModel &&
      void 0 !== modelEntry &&
      void 0 !== modelEntry.root &&
      modelRoot$1 !== value$jscomp$0
    )
      return renderModelReference(
        task,
        createValueReference(
          request.result,
          getPublishedModelReference(request, modelEntry)
        )
      );
    existingModel === UNDEFINED_MODEL && (existingModel = void 0);
    if (request.hasByValueModels && existingModel !== task.promise) {
      var outlinedModels = request.outlinedModels;
      if (null !== outlinedModels) {
        var dependency = outlinedModels.get(existingModel);
        if (void 0 !== dependency && 1 === dependency.status)
          existingModel = dependency.model;
        else if (dependency === task && 5 === task.status)
          existingModel = task.renderedModel;
        else
          for (
            outlinedModels = getOutlinedModelDependencies(
              request,
              existingModel,
              outlinedModels
            ).values(),
              dependency = outlinedModels.next();
            !dependency.done;
            dependency = outlinedModels.next()
          )
            addModelDependency(task, dependency.value);
      }
    }
    if (modelRoot$1 === value$jscomp$0) {
      if (
        existingModel !== task.promise &&
        (null === existingModel ||
          "object" !== typeof existingModel ||
          existingModel.$$typeof !== REACT_LAZY_TYPE ||
          existingModel._payload !== task.promise)
      )
        return renderModelReference(task, existingModel);
      modelRoot$1 = null;
    } else return renderModelReference(task, existingModel);
  }
  void 0 === parentReference &&
    (parent === emptyRoot
      ? (parentReference = task.currentReference)
      : ((parentReference = request.modelEntries.get(parent)),
        (parentReference = getEntryReference(parentReference))));
  void 0 === value &&
    null != parentReference &&
    -1 === parentPropertyName.indexOf(":") &&
    (canReference
      ? ((canReference = {
          model: void 0 === referenceEntry ? void 0 : referenceEntry.model,
          root: parentReference.root,
          parent:
            parent === emptyRoot ? parentReference.parent : parentReference,
          key: parent === emptyRoot ? parentReference.key : parentPropertyName
        }),
        request.modelEntries.set(value$jscomp$0, canReference),
        (value = canReference),
        reference$51 === request.modelEntries && (modelEntry = canReference))
      : (value =
          parent === emptyRoot
            ? parentReference
            : {
                root: parentReference.root,
                parent: parentReference,
                key: parentPropertyName
              }));
  task.currentReference = void 0 === value ? null : value;
  if (elementType === REACT_ELEMENT_TYPE) {
    if (128 < modelDepth) return deferTask$1(request, task);
    parent = value$jscomp$0;
    a: for (parentPropertyName = parent.type; ; ) {
      parentReference = parent.key;
      modelEntry = parent.props;
      elementType = modelEntry.ref;
      if (null !== elementType && void 0 !== elementType)
        throw Error(
          "Refs cannot be used in Server Components, nor passed to Client Components."
        );
      if (
        "function" === typeof parentPropertyName &&
        !isClientReference(parentPropertyName) &&
        parentPropertyName.$$typeof !== TEMPORARY_REFERENCE_TAG
      ) {
        request = renderFunctionComponent(
          request,
          task,
          parentPropertyName,
          modelEntry,
          parent
        );
        break a;
      }
      if (
        parentPropertyName === REACT_FRAGMENT_TYPE &&
        null === parentReference
      ) {
        parentPropertyName = task.implicitSlot;
        parentReference = getRenderedModels(
          request,
          parent,
          task.keyPath,
          task.implicitSlot
        );
        null === task.keyPath && (task.implicitSlot = !0);
        request = renderModelDestructive$1(
          request,
          task,
          emptyRoot,
          "",
          modelEntry.children
        );
        setRenderedModel(
          parentReference,
          parent,
          void 0 === request ? UNDEFINED_MODEL : request
        );
        task.implicitSlot = parentPropertyName;
        break a;
      }
      if (
        null == parentPropertyName ||
        "object" !== typeof parentPropertyName ||
        isClientReference(parentPropertyName)
      )
        "string" === typeof parentPropertyName &&
          ((parentReference = task.formatContext),
          (elementType = getChildFormatContext(
            parentReference,
            parentPropertyName,
            modelEntry
          )),
          parentReference !== elementType &&
            null != modelEntry.children &&
            outlineModelWithFormatContext(
              request,
              modelEntry.children,
              elementType
            ));
      else
        switch (parentPropertyName.$$typeof) {
          case REACT_LAZY_TYPE:
            modelEntry = parentPropertyName._init;
            parentPropertyName = modelEntry(parentPropertyName._payload);
            if (12 === request.status || 14 === request.status)
              throw request.fatalError;
            continue;
          case REACT_FORWARD_REF_TYPE:
            request = renderFunctionComponent(
              request,
              task,
              parentPropertyName.render,
              modelEntry,
              parent
            );
            break a;
          case REACT_MEMO_TYPE:
            parentPropertyName = parentPropertyName.type;
            continue;
        }
      modelEntry = request;
      request = task;
      parentReference = parent.key;
      canReference = parent.props;
      elementType = request.keyPath;
      null === parentReference
        ? (parentReference = elementType)
        : null !== elementType &&
          (parentReference =
            elementType === REACT_OPTIMISTIC_KEY ||
            parentReference === REACT_OPTIMISTIC_KEY
              ? REACT_OPTIMISTIC_KEY
              : elementType + "," + parentReference);
      parentPropertyName = {
        $$typeof: REACT_ELEMENT_TYPE,
        type: parentPropertyName,
        key: parentReference,
        ref: null,
        props: canReference
      };
      elementType = getRenderedModels(
        modelEntry,
        parent,
        elementType,
        request.implicitSlot
      );
      canReference = parentPropertyName;
      request.implicitSlot &&
        null !== parentReference &&
        ((parentReference = [parentPropertyName]),
        (canReference = []),
        setRenderedModel(
          modelEntry.modelEntries,
          parentReference,
          canReference
        ),
        (referenceEntry = request.currentReference),
        null !== referenceEntry &&
          (setModelReference(modelEntry, parentReference, referenceEntry),
          setModelReference(modelEntry, parentPropertyName, {
            root: referenceEntry.root,
            parent: referenceEntry,
            key: "0"
          })),
        (request.model = parentReference));
      setRenderedModel(elementType, parent, canReference);
      parent = request.currentReference;
      request.fieldParentReference =
        canReference !== parentPropertyName
          ? void 0
          : null === parent
            ? null
            : { root: parent.root, parent: parent.parent, key: parent.key };
      request.keyPath = null;
      request.implicitSlot = !1;
      request.isModelReference = !1;
      request = canReference;
      break a;
    }
    "string" === typeof request &&
      void 0 !== value &&
      ((parent = reference$51.get(value$jscomp$0)),
      void 0 !== parent &&
        reference$51.set(
          value$jscomp$0,
          createModelEntry(parent.model, value)
        ));
    null !== request &&
      "object" === typeof request &&
      null != value &&
      request.$$typeof === REACT_ELEMENT_TYPE &&
      null === task.fieldParentReference &&
      (task.fieldParentReference = {
        root: value.root,
        parent: value.parent,
        key: value.key
      });
    return request;
  }
  if (elementType === REACT_LAZY_TYPE) {
    if (128 < modelDepth) return deferTask$1(request, task);
    task.thenableState = null;
    reference$51 = value$jscomp$0._init;
    value$jscomp$0 = reference$51(value$jscomp$0._payload);
    if (12 === request.status || 14 === request.status)
      throw request.fatalError;
    return renderModelDestructive$1(
      request,
      task,
      parent,
      parentPropertyName,
      value$jscomp$0,
      parentReference
    );
  }
  if (elementType === REACT_LEGACY_ELEMENT_TYPE)
    throw Error(
      'A React Element from an older version of React was rendered. This is not supported. It can happen if:\n- Multiple copies of the "react" package is used.\n- A library pre-bundled an old copy of "react" or "react/jsx-runtime".\n- A compiler tries to "inline" JSX instead of using the runtime.'
    );
  if (isArrayImpl(value$jscomp$0))
    return renderFragment(request, task, value$jscomp$0);
  if ("function" === typeof value$jscomp$0.then)
    return renderModelReference(
      task,
      renderThenable(request, task, value$jscomp$0)
    );
  if (value$jscomp$0 instanceof Date)
    return (
      (request = value$jscomp$0),
      renderModelReference(
        task,
        isSimpleDate(request)
          ? new Date(dateGetTime.call(request))
          : new Date("" + request.toJSON())
      )
    );
  if (
    value$jscomp$0 instanceof ArrayBuffer ||
    ArrayBuffer.isView(value$jscomp$0)
  )
    return renderModelReference(task, value$jscomp$0);
  if (value$jscomp$0 instanceof Map)
    return renderModelReference(task, renderMap(request, task, value$jscomp$0));
  if (value$jscomp$0 instanceof Set)
    return renderModelReference(task, renderSet(request, task, value$jscomp$0));
  parentReference = getPrototypeOf$1(value$jscomp$0);
  if (parentReference !== ObjectPrototype$1) {
    if ("function" === typeof FormData && value$jscomp$0 instanceof FormData) {
      if (0 !== task.formatContext)
        request = outlineModel$1(request, value$jscomp$0);
      else {
        reference$51 = Array.from(value$jscomp$0.entries());
        value = parent = !1;
        setRenderedModel(request.modelEntries, value$jscomp$0, value$jscomp$0);
        task.keyPath = null;
        task.implicitSlot = !1;
        for (
          parentPropertyName = 0;
          parentPropertyName < reference$51.length;
          parentPropertyName++
        )
          if (
            ((modelEntry = reference$51[parentPropertyName]),
            (parentReference = resolveModel$1(
              request,
              task,
              modelEntry,
              "0",
              modelEntry[0]
            )),
            (elementType = resolveModel$1(
              request,
              task,
              modelEntry,
              "1",
              modelEntry[1]
            )),
            "string" !== typeof modelEntry[1] && (parent = !0),
            parentReference !== modelEntry[0] || elementType !== modelEntry[1])
          )
            (value = !0),
              (modelEntry[0] = parentReference),
              (modelEntry[1] = elementType);
        parent &&
          ((parent = request.result),
          (parentPropertyName = parent.formDataWithBlobs),
          null === parentPropertyName &&
            (parent.formDataWithBlobs = parentPropertyName = new WeakSet()),
          parentPropertyName.add(value$jscomp$0));
        value &&
          ((value = request.outlinedModels),
          null !== value &&
            ((reference$51 = getOutlinedModelDependencies(
              request,
              reference$51,
              value
            )),
            0 < reference$51.size &&
              ((parent = createTask$1(request, value$jscomp$0, null, !1, 0)),
              value.set(value$jscomp$0, parent),
              blockTask(request, parent, value$jscomp$0, reference$51))));
        request = value$jscomp$0;
      }
      return renderModelReference(task, request);
    }
    if (
      value$jscomp$0 instanceof Error ||
      ("function" === typeof Blob && value$jscomp$0 instanceof Blob)
    )
      return (
        setRenderedModel(request.modelEntries, value$jscomp$0, value$jscomp$0),
        renderModelReference(task, value$jscomp$0)
      );
  }
  if ((value = getIteratorFn(value$jscomp$0))) {
    parent = value.call(value$jscomp$0);
    if (parent === value$jscomp$0) {
      if (0 !== task.formatContext) request = outlineModel$1(request, parent);
      else if (
        ((value$jscomp$0 = getRenderedModel(request.modelEntries, parent)),
        void 0 !== value$jscomp$0 && value$jscomp$0 !== task.promise)
      )
        request = value$jscomp$0;
      else {
        value$jscomp$0 = Array.from(parent);
        reference$51 = [];
        value = reference$51.values();
        setRenderedModel(request.modelEntries, parent, value);
        parent = request.result;
        parentPropertyName = parent.iteratorEntries;
        null === parentPropertyName &&
          (parent.iteratorEntries = parentPropertyName = new WeakMap());
        parentPropertyName.set(value, reference$51);
        task.keyPath = null;
        task.implicitSlot = !1;
        for (parent = 0; parent < value$jscomp$0.length; parent++)
          reference$51[parent] = resolveModel$1(
            request,
            task,
            value$jscomp$0,
            "" + parent,
            value$jscomp$0[parent]
          );
        request = value;
      }
      return renderModelReference(task, request);
    }
    return renderFragment(request, task, Array.from(parent), value$jscomp$0);
  }
  if (
    "function" === typeof ReadableStream &&
    value$jscomp$0 instanceof ReadableStream
  )
    return renderModelReference(
      task,
      renderReadableStream(request, task, value$jscomp$0)
    );
  value = value$jscomp$0[ASYNC_ITERATOR];
  if ("function" === typeof value)
    return (
      (reference$51 = task.keyPath),
      (parent = task.implicitSlot),
      (task.keyPath = null),
      (task.implicitSlot = !1),
      (parentPropertyName = getRenderedModel(
        request.modelEntries,
        value$jscomp$0
      )),
      (value =
        void 0 === parentPropertyName || parentPropertyName === task.promise
          ? renderAsyncIterable(
              request,
              task,
              value$jscomp$0,
              value.call(value$jscomp$0)
            )
          : parentPropertyName),
      null !== reference$51
        ? ((value = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: REACT_FRAGMENT_TYPE,
            key: reference$51,
            ref: null,
            props: { children: value }
          }),
          (value = parent ? [value] : value),
          setRenderedModel(
            getRenderedModels(request, value$jscomp$0, reference$51, parent),
            value$jscomp$0,
            value
          ),
          (request = value))
        : (request = value),
      renderModelReference(task, request)
    );
  if (
    parentReference !== ObjectPrototype$1 &&
    (null === parentReference || null !== getPrototypeOf$1(parentReference))
  )
    throw Error(
      "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
        describeObjectForErrorMessage(parent, parentPropertyName)
    );
  value = {};
  reference$51 !== request.modelEntries
    ? setRenderedModel(request.modelEntries, value$jscomp$0, value)
    : void 0 === modelEntry
      ? request.modelEntries.set(
          value$jscomp$0,
          createModelEntry(value, void 0)
        )
      : (modelEntry.model = value);
  task.isModelReference = !1;
  task.fieldParentReference = void 0;
  return value;
}
function resolveModel$1(
  request,
  task,
  parent,
  parentPropertyName,
  value,
  parentReference$jscomp$0,
  renderedRoot
) {
  modelDepth++;
  try {
    var jsonValue = value;
    if (
      null !== value &&
      "object" === typeof value &&
      "function" === typeof value.toJSON
    ) {
      if (value instanceof Date && isSimpleDate(value)) {
        var time = dateGetTime.call(value);
        task.resolvedModelInfo = 0;
        return renderModelReference(
          task,
          Number.isNaN(time) ? null : new Date(time)
        );
      }
      jsonValue = value.toJSON(parentPropertyName);
    }
    if (void 0 !== renderedRoot && jsonValue === value)
      var JSCompiler_temp = renderedRoot;
    else {
      time = jsonValue;
      var prevKeyPath = task.keyPath,
        prevImplicitSlot = task.implicitSlot;
      try {
        JSCompiler_temp = renderModelDestructive$1(
          request,
          task,
          parent,
          parentPropertyName,
          time,
          parentReference$jscomp$0
        );
      } catch (thrownValue) {
        if (14 === request.status) throw request.fatalError;
        var error$jscomp$0 =
            12 === request.status
              ? request.fatalError
              : thrownValue === SuspenseException
                ? getSuspendedThenable()
                : thrownValue,
          model = task.model;
        if (
          null === model ||
          "object" !== typeof model ||
          (model.$$typeof !== REACT_ELEMENT_TYPE &&
            model.$$typeof !== REACT_LAZY_TYPE)
        ) {
          task.keyPath = prevKeyPath;
          task.implicitSlot = prevImplicitSlot;
          var newTask$54 = createTask$1(
            request,
            model,
            prevKeyPath,
            prevImplicitSlot,
            task.formatContext
          );
          newTask$54.resolve = resolveBoxedModel.bind(null, newTask$54.resolve);
          null !== model &&
            "object" === typeof model &&
            setModelReference(request, model, {
              root: newTask$54.promise,
              parent: newTask$54.reference,
              key: "value"
            });
          var outlinedModels = request.outlinedModels;
          null === outlinedModels &&
            (request.outlinedModels = outlinedModels = new WeakMap());
          outlinedModels.set(newTask$54.promise, newTask$54);
          request.hasByValueModels = !0;
          addModelDependency(task, newTask$54.promise);
          markErroredModel(
            request,
            newTask$54,
            time,
            prevKeyPath,
            prevImplicitSlot
          );
          if (12 === request.status) abortTask$1(request, newTask$54);
          else if (
            null != error$jscomp$0 &&
            "object" === typeof error$jscomp$0 &&
            "function" === typeof error$jscomp$0.then
          ) {
            newTask$54.thenableState = getThenableStateAfterSuspending();
            var ping$55 = newTask$54.ping;
            error$jscomp$0.then(ping$55, ping$55);
          } else erroredTask$1(request, newTask$54, error$jscomp$0);
          JSCompiler_temp = renderModelReference(task, newTask$54.promise);
        } else {
          var newTask = createTask$1(
              request,
              model,
              task.keyPath,
              task.implicitSlot,
              task.formatContext
            ),
            lazy = createLazyWrapperAroundWakeable(newTask.promise);
          setModelReference(request, model, newTask.reference);
          if (model.$$typeof === REACT_ELEMENT_TYPE) {
            var renderedModels = getRenderedModels(
              request,
              model,
              task.keyPath,
              task.implicitSlot
            );
            void 0 === getRenderedModel(renderedModels, model) &&
              setRenderedModel(renderedModels, model, lazy);
          }
          time !== model &&
            null !== time &&
            "object" === typeof time &&
            time.$$typeof === REACT_ELEMENT_TYPE &&
            setRenderedModel(
              getRenderedModels(request, time, prevKeyPath, prevImplicitSlot),
              time,
              lazy
            );
          task.keyPath = prevKeyPath;
          task.implicitSlot = prevImplicitSlot;
          if (12 === request.status) abortTask$1(request, newTask);
          else if (
            null != error$jscomp$0 &&
            "object" === typeof error$jscomp$0 &&
            "function" === typeof error$jscomp$0.then
          ) {
            var ping = newTask.ping;
            error$jscomp$0.then(ping, ping);
            newTask.thenableState = getThenableStateAfterSuspending();
          } else erroredTask$1(request, newTask, error$jscomp$0);
          JSCompiler_temp = renderModelReference(task, lazy);
        }
      }
    }
    parent = JSCompiler_temp;
    if (
      void 0 !== renderedRoot &&
      ((task.renderedModel = parent), jsonValue !== value)
    ) {
      var outlinedModels$jscomp$0 = request.outlinedModels;
      null === outlinedModels$jscomp$0 &&
        (request.outlinedModels = outlinedModels$jscomp$0 = new WeakMap());
      outlinedModels$jscomp$0.set(renderedRoot, task);
      request.hasByValueModels = !0;
    }
    if (task.isModelReference)
      return (
        (task.resolvedModelInfo =
          null !== parent && "object" === typeof parent
            ? getModelInfo(request.result, parent)
            : 0),
        parent
      );
    if (null === parent || "object" !== typeof parent)
      return (task.resolvedModelInfo = 0), parent;
    var resolvingModelStack = request.resolvingModelStack;
    resolvingModelStack.push(parent);
    null !== request.resolvingModels && request.resolvingModels.add(parent);
    try {
      a: {
        var model$jscomp$0 = task.model,
          parentReference = task.fieldParentReference,
          prevKeyPath$jscomp$0 = task.keyPath,
          prevImplicitSlot$jscomp$0 = task.implicitSlot;
        if (parent.$$typeof === REACT_ELEMENT_TYPE) {
          var prevDependencies = task.modelDependencies;
          task.modelDependencies = null;
          task.keyPath = null;
          task.implicitSlot = !1;
          try {
            parent.type = resolveModel$1(
              request,
              task,
              parent,
              "type",
              parent.type,
              parentReference
            );
            parent.props = resolveModel$1(
              request,
              task,
              parent,
              "props",
              parent.props,
              parentReference
            );
            var propsInfo = task.resolvedModelInfo;
            var dependencies = task.modelDependencies,
              outlinedModels$jscomp$1 = request.outlinedModels;
            if (null !== outlinedModels$jscomp$1 && null !== dependencies) {
              var newTask$jscomp$0 = createTask$1(
                request,
                parent,
                null,
                !1,
                task.formatContext
              );
              blockTask(request, newTask$jscomp$0, parent, dependencies);
              var lazy$jscomp$0 = createLazyWrapperAroundWakeable(
                newTask$jscomp$0.promise
              );
              outlinedModels$jscomp$1.set(parent, newTask$jscomp$0);
              outlinedModels$jscomp$1.set(
                newTask$jscomp$0.promise,
                newTask$jscomp$0
              );
              null !== model$jscomp$0 &&
                "object" === typeof model$jscomp$0 &&
                setRenderedModel(
                  getRenderedModels(
                    request,
                    model$jscomp$0,
                    prevKeyPath$jscomp$0,
                    prevImplicitSlot$jscomp$0
                  ),
                  model$jscomp$0,
                  lazy$jscomp$0
                );
              var JSCompiler_inline_result = renderModelReference(
                task,
                lazy$jscomp$0
              );
            } else JSCompiler_inline_result = parent;
            value = JSCompiler_inline_result;
            var info =
              3 |
              (value !== parent ||
              ("string" !== typeof parent.type &&
                "symbol" !== typeof parent.type) ||
              (null !== parent.props &&
                ("object" === typeof parent.props ||
                  "function" === typeof parent.props) &&
                0 === (propsInfo & 4))
                ? 0
                : 4);
            setModelInfo(request.result, parent, info);
            task.resolvedModelInfo = value === parent ? info : 0;
            var JSCompiler_inline_result$jscomp$0 = value;
            break a;
          } catch (error) {
            throw (
              (markErroredModel(
                request,
                task,
                parent,
                prevKeyPath$jscomp$0,
                prevImplicitSlot$jscomp$0,
                parent
              ),
              error)
            );
          } finally {
            task.modelDependencies = prevDependencies;
          }
        }
        if (isArrayImpl(parent)) {
          task.keyPath = null;
          task.implicitSlot = !1;
          try {
            for (
              var directlyReusable$57 = !0,
                noEagerDependencies = !0,
                jsonWork = 1,
                localWork = 1,
                i = 0;
              i < model$jscomp$0.length;
              i++
            )
              if (i in model$jscomp$0) {
                var key = "" + i,
                  child = resolveModel$1(
                    request,
                    task,
                    model$jscomp$0,
                    key,
                    model$jscomp$0[i],
                    parentReference
                  ),
                  info$58 = task.resolvedModelInfo;
                parent[i] = child;
                (prevDependencies =
                  null !== child &&
                  ("object" === typeof child || "function" === typeof child)) &&
                  0 === (info$58 & 4) &&
                  (directlyReusable$57 = !1);
                prevDependencies &&
                  0 === (info$58 & 20) &&
                  3 !== (info$58 & 3) &&
                  (noEagerDependencies = !1);
                var childWork = getJSONValueWork(child, info$58);
                localWork +=
                  key.length + 1 + (prevDependencies ? 0 : childWork);
                0 !== jsonWork &&
                  ((jsonWork += key.length + 1 + childWork),
                  0 === childWork || 33554431 < jsonWork) &&
                  (jsonWork = 0);
              } else (directlyReusable$57 = !1), (jsonWork = 0);
            parent.length = model$jscomp$0.length;
            var info$59 = packModelInfo(
              2 |
                (directlyReusable$57 ? 4 : 0) |
                (noEagerDependencies ? 16 : 0),
              jsonWork
            );
            setModelInfo(request.result, parent, info$59);
            task.resolvedModelInfo = info$59;
            var result = request.result;
            result.jsonWorkCredit += localWork;
            JSCompiler_inline_result$jscomp$0 = parent;
            break a;
          } catch (error$60) {
            throw (
              (markErroredModel(
                request,
                task,
                model$jscomp$0,
                prevKeyPath$jscomp$0,
                prevImplicitSlot$jscomp$0
              ),
              error$60)
            );
          }
        }
        task.keyPath = null;
        task.implicitSlot = !1;
        try {
          info$58 = child = !0;
          info$59 = childWork = 1;
          for (directlyReusable$57 in model$jscomp$0)
            hasOwnProperty.call(model$jscomp$0, directlyReusable$57) &&
              ((noEagerDependencies = resolveModel$1(
                request,
                task,
                model$jscomp$0,
                directlyReusable$57,
                model$jscomp$0[directlyReusable$57],
                parentReference
              )),
              (jsonWork = task.resolvedModelInfo),
              (result =
                null !== noEagerDependencies &&
                ("object" === typeof noEagerDependencies ||
                  "function" === typeof noEagerDependencies)) &&
                0 === (jsonWork & 4) &&
                (child = !1),
              result &&
                0 === (jsonWork & 20) &&
                3 !== (jsonWork & 3) &&
                (info$58 = !1),
              (localWork = getJSONValueWork(noEagerDependencies, jsonWork)),
              (info$59 +=
                directlyReusable$57.length + 1 + (result ? 0 : localWork)),
              0 !== childWork &&
                ((childWork += directlyReusable$57.length + 1 + localWork),
                0 === localWork || 33554431 < childWork) &&
                (childWork = 0),
              "__proto__" === directlyReusable$57
                ? Object.defineProperty(parent, directlyReusable$57, {
                    value: noEagerDependencies,
                    enumerable: !0,
                    writable: !0,
                    configurable: !0
                  })
                : (parent[directlyReusable$57] = noEagerDependencies));
          i = packModelInfo(
            1 | (child ? 4 : 0) | (info$58 ? 16 : 0),
            childWork
          );
          setModelInfo(request.result, parent, i);
          task.resolvedModelInfo = i;
          key = request.result;
          key.jsonWorkCredit += info$59;
          JSCompiler_inline_result$jscomp$0 = parent;
        } catch (error$71) {
          throw (
            (markErroredModel(
              request,
              task,
              model$jscomp$0,
              prevKeyPath$jscomp$0,
              prevImplicitSlot$jscomp$0
            ),
            error$71)
          );
        }
      }
      return JSCompiler_inline_result$jscomp$0;
    } finally {
      resolvingModelStack.pop(),
        null !== request.resolvingModels &&
          request.resolvingModels.delete(parent);
    }
  } finally {
    modelDepth--;
  }
}
function retryTask$1(request, task) {
  if (14 !== request.status && 0 === task.status) {
    task.status = 5;
    var originalModel = task.model,
      originalKeyPath = task.keyPath,
      originalImplicitSlot = task.implicitSlot;
    task.currentReference = task.reference;
    try {
      modelRoot$1 = task.model;
      var rendered = renderModelDestructive$1(
        request,
        task,
        emptyRoot,
        "",
        task.model
      );
      task.renderedModel = rendered;
      var rootModel =
          null !== rendered &&
          "object" === typeof rendered &&
          rendered.$$typeof === REACT_ELEMENT_TYPE
            ? rendered
            : task.model,
        resolvedModel =
          task.isModelReference ||
          null === rendered ||
          "object" !== typeof rendered
            ? rendered
            : resolveModel$1(
                request,
                task,
                { "": rootModel },
                "",
                rootModel,
                void 0,
                rendered
              );
      if (14 !== request.status) {
        var outlinedModels = request.outlinedModels;
        (null !== outlinedModels &&
          waitForOutlinedModel(request, task, resolvedModel, outlinedModels)) ||
          completeTask(request, task, resolvedModel);
      }
    } catch (thrownValue) {
      if (12 <= request.status)
        12 === request.status && abortTask$1(request, task);
      else {
        var error =
          thrownValue === SuspenseException
            ? getSuspendedThenable()
            : thrownValue;
        if (
          "object" === typeof error &&
          null !== error &&
          "function" === typeof error.then
        ) {
          markErroredModel(
            request,
            task,
            task.model,
            task.keyPath,
            task.implicitSlot
          );
          task.status = 0;
          task.thenableState = getThenableStateAfterSuspending();
          var ping = task.ping;
          error.then(ping, ping);
        } else
          markErroredModel(
            request,
            task,
            originalModel,
            originalKeyPath,
            originalImplicitSlot
          ),
            erroredTask$1(request, task, error);
      }
    } finally {
    }
  }
}
function getRenderedModels(request, value, keyPath, implicitSlot) {
  return null === keyPath ||
    null === value ||
    "object" !== typeof value ||
    (value.$$typeof !== REACT_ELEMENT_TYPE &&
      "function" !== typeof value.then &&
      !isArrayImpl(value) &&
      (value instanceof Map ||
        value instanceof Set ||
        (null === getIteratorFn(value) &&
          "function" !== typeof value[ASYNC_ITERATOR])))
    ? implicitSlot &&
      null !== value &&
      "object" === typeof value &&
      ((value.$$typeof === REACT_ELEMENT_TYPE && null !== value.key) ||
        "function" === typeof value.then)
      ? request.renderedImplicitModels
      : request.modelEntries
    : ((value = request.renderedKeyedModels),
      null === value && (request.renderedKeyedModels = value = new Map()),
      (request = value.get(keyPath)),
      void 0 === request &&
        ((request = { explicit: new WeakMap(), implicit: new WeakMap() }),
        value.set(keyPath, request)),
      implicitSlot ? request.implicit : request.explicit);
}
function renderFragment(request, task, children) {
  var source =
      3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : children,
    keyPath = task.keyPath;
  if (null !== keyPath) {
    var resolvedModel = {
      $$typeof: REACT_ELEMENT_TYPE,
      type: REACT_FRAGMENT_TYPE,
      key: keyPath,
      ref: null,
      props: { children: children }
    };
    if (task.implicitSlot) {
      resolvedModel = [resolvedModel];
      var copy = [];
      setRenderedModel(request.modelEntries, resolvedModel, copy);
      task.model = resolvedModel;
      resolvedModel = copy;
    }
    task.fieldParentReference = null;
    setRenderedModel(
      getRenderedModels(request, source, keyPath, task.implicitSlot),
      source,
      resolvedModel
    );
  } else
    (keyPath = Array(children.length)),
      setRenderedModel(request.modelEntries, children, keyPath),
      source !== children &&
        setRenderedModel(request.modelEntries, source, keyPath),
      (task.model = children),
      (resolvedModel = keyPath),
      (task.fieldParentReference = source === children ? void 0 : null);
  task.isModelReference = !1;
  return resolvedModel;
}
function performWork$1(request) {
  if (14 !== request.status) {
    var prevDispatcher = ReactSharedInternalsServer.H;
    ReactSharedInternalsServer.H = HooksDispatcher;
    var prevCache = setCurrentCache(request);
    currentRequest = request;
    try {
      var pingedTasks = request.pingedTasks;
      request.pingedTasks = [];
      for (var i = 0; i < pingedTasks.length; i++)
        retryTask$1(request, pingedTasks[i]);
    } catch (error) {
      fatalError$1(request, error);
    } finally {
      (modelRoot$1 = null),
        14 !== request.status &&
          0 === request.abortableTasks.size &&
          ((request.status = 14),
          closeResult(request),
          request.cacheController.abort(
            Error(
              "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
            )
          ),
          request.onAllReady()),
        (ReactSharedInternalsServer.H = prevDispatcher),
        (currentRequest = null),
        setCurrentCache(prevCache);
    }
  }
}
function startWork$1(request) {
  scheduleMicrotask(function () {
    cacheStorage.run(request, function () {
      return requestStorage.run(void 0, performWork$1, request);
    });
  });
  setImmediate(function () {
    10 === request.status && (request.status = 11);
  });
}
function createModelEntry(model, reference) {
  return void 0 === reference
    ? { model: model, root: void 0, parent: null, key: "" }
    : {
        model: model,
        root: reference.root,
        parent: reference.parent,
        key: reference.key
      };
}
function getEntryReference(entry) {
  return void 0 === entry || void 0 === entry.root ? void 0 : entry;
}
function getPublishedModelReference(request, reference) {
  if (null === reference.parent && !hasOwnProperty.call(reference, "model"))
    return reference;
  var publishedReferences = request.publishedModelReferences;
  null === publishedReferences &&
    (request.publishedModelReferences = publishedReferences = new WeakMap());
  request = publishedReferences.get(reference);
  if (void 0 !== request) return request;
  request = [];
  for (var published; ; ) {
    published = reference.parent;
    if (null === published) {
      hasOwnProperty.call(reference, "model")
        ? ((published = {
            root: reference.root,
            parent: null,
            key: reference.key
          }),
          publishedReferences.set(reference, published))
        : (published = reference);
      break;
    }
    request.push(reference);
    reference = published;
    published = publishedReferences.get(reference);
    if (void 0 !== published) break;
  }
  for (reference = request.length - 1; 0 <= reference; reference--) {
    var source = request[reference];
    hasOwnProperty.call(source, "model") || source.parent !== published
      ? ((published = {
          root: source.root,
          parent: published,
          key: source.key
        }),
        publishedReferences.set(source, published))
      : (published = source);
  }
  return published;
}
function getRenderedModel(models, value) {
  models = models.get(value);
  return void 0 === models ? void 0 : models.model;
}
function setRenderedModel(models, value, model) {
  var entry = models.get(value);
  void 0 === entry
    ? models.set(value, createModelEntry(model, void 0))
    : (entry.model = model);
}
function setModelReference(request, value, reference) {
  var entry = request.modelEntries.get(value);
  request.modelEntries.set(
    value,
    createModelEntry(void 0 === entry ? void 0 : entry.model, reference)
  );
}
function setModelReferenceIfAbsent(request, value, reference) {
  var entry = request.modelEntries.get(value);
  void 0 === entry
    ? request.modelEntries.set(value, createModelEntry(void 0, reference))
    : void 0 === entry.root &&
      request.modelEntries.set(value, createModelEntry(entry.model, reference));
}
function resolveBoxedModel(resolve, model) {
  resolve({ value: model });
}
function markErroredModel(request, task, model, keyPath, implicitSlot) {
  var rendered =
    5 < arguments.length && void 0 !== arguments[5] ? arguments[5] : void 0;
  if (null !== model && "object" === typeof model) {
    var models = getRenderedModels(request, model, keyPath, implicitSlot);
    rendered = void 0 === rendered ? getRenderedModel(models, model) : rendered;
    if (
      null !== rendered &&
      "object" === typeof rendered &&
      rendered !== task.promise &&
      rendered.$$typeof !== REACT_LAZY_TYPE
    ) {
      var outlinedModels = request.outlinedModels;
      null === outlinedModels &&
        (request.outlinedModels = outlinedModels = new WeakMap());
      outlinedModels.set(rendered, task);
      request.hasByValueModels = !0;
    }
    setRenderedModel(
      models,
      model,
      model.$$typeof === REACT_ELEMENT_TYPE
        ? createLazyWrapperAroundWakeable(task.promise)
        : task.promise
    );
  }
}
function renderModelReference(task, model) {
  task.isModelReference = !0;
  return model;
}
function addModelDependency(task, promise) {
  var dependencies = task.modelDependencies;
  null === dependencies && (task.modelDependencies = dependencies = new Set());
  dependencies.add(promise);
}
function getOutlinedModelDependencies(request, model, outlinedModels) {
  function visit(value, parent) {
    if (null !== value && "object" === typeof value) {
      var outlinedTask = outlinedModels.get(value);
      if (void 0 !== outlinedTask)
        null !== parent &&
          1 !== outlinedTask.status &&
          parent.dependencies.add(outlinedTask.promise);
      else if (((outlinedTask = cache.get(value)), void 0 !== outlinedTask))
        null !== parent &&
          null !== outlinedTask &&
          "fulfilled" !== outlinedTask.status &&
          parent.dependencies.add(outlinedTask);
      else if (((outlinedTask = records.get(value)), void 0 !== outlinedTask))
        null !== parent &&
          (outlinedTask.active
            ? (parent.low = Math.min(parent.low, outlinedTask.index))
            : (null !== outlinedTask.ready &&
                "fulfilled" !== outlinedTask.ready.status &&
                parent.dependencies.add(outlinedTask.ready),
              (parent.stable = parent.stable && outlinedTask.stable)));
      else {
        var record = {
          model: value,
          index: index,
          low: index++,
          active: !0,
          stable: !resolvingModels.has(value),
          dependencies: new Set(),
          ready: null
        };
        records.set(value, record);
        stack.push(record);
        visitFields(value, record);
        if (record.low === record.index) {
          value = [];
          do
            (outlinedTask = stack[stack.length - 1]),
              stack.length--,
              value.push(outlinedTask),
              outlinedTask.dependencies.forEach(function (dependency) {
                return record.dependencies.add(dependency);
              }),
              (record.stable = record.stable && outlinedTask.stable);
          while (outlinedTask !== record);
          var dependencies$73 = record.dependencies;
          dependencies$73.forEach(function (dependency) {
            "fulfilled" === dependency.status &&
              dependencies$73.delete(dependency);
          });
          if (1 === dependencies$73.size)
            dependencies$73.forEach(function (dependency) {
              record.ready = dependency;
            });
          else if (1 < dependencies$73.size) {
            var ready = createResultModel();
            record.ready = ready;
            var remaining = dependencies$73.size;
            dependencies$73.forEach(function (dependency) {
              dependency.then(
                function () {
                  0 === --remaining && fulfillResultModel(ready, void 0);
                },
                function (error) {
                  copyErrorReference(request.result, ready, dependency);
                  rejectResultModel(ready, error);
                }
              );
            });
          }
          for (var i = 0; i < value.length; i++)
            (outlinedTask = value[i]),
              (outlinedTask.active = !1),
              (outlinedTask.stable = record.stable),
              (outlinedTask.ready = record.ready),
              outlinedTask.dependencies.clear(),
              record.stable && cache.set(outlinedTask.model, record.ready);
        }
        null !== parent &&
          (record.active
            ? (parent.low = Math.min(parent.low, record.low))
            : (null !== record.ready &&
                "fulfilled" !== record.ready.status &&
                parent.dependencies.add(record.ready),
              (parent.stable = parent.stable && record.stable)));
      }
    }
  }
  function visitFields(value, record) {
    var kind = getModelInfo(request.result, value) & 3;
    if (
      0 !== kind ||
      (!isClientReference(value) &&
        value.$$typeof !== SERVER_REFERENCE_TAG &&
        void 0 === getTemporaryReference(request.result, value) &&
        void 0 === getValueReference(request.result, value))
    )
      if (3 === kind || (0 === kind && value.$$typeof === REACT_ELEMENT_TYPE))
        visit(value.type, record), visit(value.props, record);
      else if (
        0 !== kind ||
        !(
          value.$$typeof === REACT_LAZY_TYPE ||
          "function" === typeof value.then ||
          value instanceof Date ||
          value instanceof ArrayBuffer ||
          ArrayBuffer.isView(value)
        )
      )
        if (2 === kind || (0 === kind && isArrayImpl(value)))
          for (kind = 0; kind < value.length; kind++)
            visit(value[kind], record);
        else if (0 === kind && value instanceof Map)
          value.forEach(function (child, key) {
            visit(key, record);
            visit(child, record);
          });
        else if (0 === kind && value instanceof Set)
          value.forEach(function (child) {
            return visit(child, record);
          });
        else {
          if (0 === kind && getPrototypeOf$1(value) !== ObjectPrototype$1) {
            if ("function" === typeof FormData && value instanceof FormData) {
              value = value.entries();
              for (kind = value.next(); !kind.done; kind = value.next())
                visit(kind.value[1], record);
              return;
            }
            if ("function" === typeof Blob && value instanceof Blob) return;
            kind = getIteratorEntries(request.result, value);
            if (void 0 !== kind) {
              visit(kind, record);
              return;
            }
            if (value instanceof Error) return;
          }
          kind = Object.keys(value);
          for (var i$74 = 0; i$74 < kind.length; i$74++)
            visit(value[kind[i$74]], record);
        }
  }
  var resolvingModels =
    null === request.resolvingModels
      ? new Set(request.resolvingModelStack)
      : request.resolvingModels;
  request.resolvingModels = resolvingModels;
  var cache =
    null === request.outlinedModelDependencies
      ? new WeakMap()
      : request.outlinedModelDependencies;
  request.outlinedModelDependencies = cache;
  var records = new Map(),
    stack = [],
    index = 0;
  visit(model, null);
  var dependencies = new Set();
  if (null !== model && "object" === typeof model) {
    var ownTask = outlinedModels.get(model);
    void 0 !== ownTask
      ? 1 !== ownTask.status && dependencies.add(ownTask.promise)
      : ((ownTask = records.get(model)),
        (model = void 0 === ownTask ? cache.get(model) : ownTask.ready),
        void 0 !== model &&
          null !== model &&
          "fulfilled" !== model.status &&
          dependencies.add(model));
  }
  return dependencies;
}
function resolveOutlinedModel(request, model, outlinedModels) {
  function resolve(value) {
    if (null === value || "object" !== typeof value) return value;
    if (visited.has(value)) return visited.get(value);
    visited.set(value, value);
    var dependency = outlinedModels.get(value);
    if (void 0 !== dependency && value !== dependency.model)
      return (
        visited.set(value, dependency.model),
        (dependency = resolve(dependency.model)),
        visited.set(value, dependency),
        dependency
      );
    dependency = getModelInfo(request.result, value) & 3;
    if (
      0 === dependency &&
      (isClientReference(value) ||
        value.$$typeof === SERVER_REFERENCE_TAG ||
        void 0 !== getTemporaryReference(request.result, value) ||
        void 0 !== getValueReference(request.result, value))
    )
      return value;
    if (
      3 === dependency ||
      (0 === dependency && value.$$typeof === REACT_ELEMENT_TYPE)
    )
      (dependency = resolve(value.type)),
        dependency !== value.type && (value.type = dependency),
        (dependency = resolve(value.props)),
        dependency !== value.props && (value.props = dependency);
    else if (
      0 !== dependency ||
      !(
        value.$$typeof === REACT_LAZY_TYPE ||
        "function" === typeof value.then ||
        value instanceof Date ||
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
      )
    )
      if (2 === dependency || (0 === dependency && isArrayImpl(value)))
        for (dependency = 0; dependency < value.length; dependency++) {
          if (hasOwnProperty.call(value, dependency)) {
            var child = resolve(value[dependency]);
            Object.is(child, value[dependency]) || (value[dependency] = child);
          }
        }
      else if (0 === dependency && value instanceof Map)
        for (
          dependency = Array.from(value), value.clear(), child = 0;
          child < dependency.length;
          child++
        )
          value.set(
            resolve(dependency[child][0]),
            resolve(dependency[child][1])
          );
      else if (0 === dependency && value instanceof Set)
        for (
          dependency = Array.from(value), value.clear(), child = 0;
          child < dependency.length;
          child++
        )
          value.add(resolve(dependency[child]));
      else {
        if (
          0 === dependency &&
          getPrototypeOf$1(value) !== ObjectPrototype$1 &&
          (("function" === typeof FormData && value instanceof FormData) ||
            ("function" === typeof Blob && value instanceof Blob))
        )
          return value;
        child =
          0 === dependency ? getIteratorEntries(request.result, value) : void 0;
        if (0 === dependency && value instanceof Error) return value;
        if (void 0 !== child) return resolve(child), value;
        dependency = Object.keys(value);
        for (child = 0; child < dependency.length; child++) {
          var key = dependency[child],
            child$80 = resolve(value[key]);
          Object.is(child$80, value[key]) || (value[key] = child$80);
        }
      }
    return value;
  }
  var visited =
    null === request.resolvedOutlinedModels
      ? new WeakMap()
      : request.resolvedOutlinedModels;
  request.resolvedOutlinedModels = visited;
  return resolve(model);
}
function waitForOutlinedModel(request, task, model, outlinedModels) {
  outlinedModels = getOutlinedModelDependencies(request, model, outlinedModels);
  if (0 === outlinedModels.size) return !1;
  blockTask(request, task, model, outlinedModels);
  return !0;
}
function blockTask(request, task, model, dependencies) {
  task.model = model;
  task.status = 6;
  if (12 === request.status) abortTask$1(request, task);
  else {
    var remaining = dependencies.size;
    dependencies.forEach(function (dependency) {
      function reject(error) {
        6 === task.status &&
          (copyErrorReference(request.result, task.promise, dependency),
          (task.status = 4),
          task.reject(error),
          request.abortableTasks.delete(task),
          scheduleMicrotask(function () {
            return performWork$1(request);
          }));
      }
      function resolve() {
        if (6 === task.status && 0 === --remaining) {
          var outlinedModels = request.outlinedModels;
          completeTask(
            request,
            task,
            null === outlinedModels
              ? model
              : resolveOutlinedModel(request, model, outlinedModels)
          );
          scheduleMicrotask(function () {
            return performWork$1(request);
          });
        }
      }
      "fulfilled" === dependency.status
        ? resolve()
        : "rejected" === dependency.status
          ? reject(dependency.reason)
          : dependency.then(resolve, reject);
    });
  }
}
function completeTask(request, task, resolvedModel) {
  task.model = resolvedModel;
  task.status = 1;
  if (
    null !== resolvedModel &&
    "object" === typeof resolvedModel &&
    resolvedModel.$$typeof === REACT_LAZY_TYPE &&
    0 === getModelInfo(request.result, resolvedModel)
  ) {
    var outlinedModels = request.outlinedModels;
    if (
      null === outlinedModels ||
      !outlinedModels.has(resolvedModel._payload)
    ) {
      var source = resolvedModel._payload;
      forwardModelReference(request.result, task.promise, source);
      source.then(task.resolve, function (error) {
        copyErrorReference(request.result, task.promise, source);
        task.reject(error);
      });
      request.abortableTasks.delete(task);
      return;
    }
  }
  task.resolve(resolvedModel);
  request.abortableTasks.delete(task);
}
function deferTask$1(request, task) {
  var newTask = createTask$1(
      request,
      task.model,
      task.keyPath,
      task.implicitSlot,
      task.formatContext
    ),
    lazy = createLazyWrapperAroundWakeable(newTask.promise),
    model = task.model;
  null !== model &&
    "object" === typeof model &&
    (setModelReference(request, model, newTask.reference),
    setRenderedModel(
      getRenderedModels(request, model, task.keyPath, task.implicitSlot),
      model,
      lazy
    ));
  pingTask$1(request, newTask);
  return renderModelReference(task, lazy);
}
function abortTask$1(request, task) {
  task.status = 3;
  if (21 === request.type) markHalted(request.result, task.promise);
  else {
    var abortModel = request.abortModel;
    null !== abortModel &&
      copyErrorReference(request.result, task.promise, abortModel);
    task.reject(request.fatalError);
  }
  request.abortableTasks.delete(task);
}
function finishAbort$1(request, error) {
  var preserveRendering =
    2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : !1;
  request.abortableTasks.forEach(function (task) {
    preserveRendering
      ? 5 !== task.status && abortTask$1(request, task)
      : ((task.status = 3),
        task.reject(error),
        request.abortableTasks.delete(task));
  });
  request.pingedTasks.length = 0;
  0 === request.abortableTasks.size &&
    ((request.status = 14), closeResult(request));
}
function renderAsyncIterable(request, task, iterable, iterator) {
  function progress(entry) {
    if (0 === streamTask.status) {
      var entryTask = createTask$1(
        request,
        entry.value,
        null,
        !1,
        entry.done ? 0 : streamTask.formatContext
      );
      entry.done
        ? ((streamTask.status = 1),
          request.abortableTasks.delete(streamTask),
          request.cacheController.signal.removeEventListener(
            "abort",
            abortIterable
          ),
          controller.close(entryTask.promise))
        : controller.enqueue(entryTask.promise);
      request.pingedTasks.push(entryTask);
      performWork$1(request);
      entry.done || 0 !== streamTask.status || next();
    }
  }
  function throwIntoIterator(reason) {
    if ("function" === typeof iterator.throw)
      try {
        iterator.throw(reason).then(noop, noop);
      } catch (x) {}
  }
  function error(reason) {
    if (0 === streamTask.status) {
      request.cacheController.signal.removeEventListener(
        "abort",
        abortIterable
      );
      try {
        erroredTask$1(request, streamTask, reason),
          copyErrorReference(
            request.result,
            resolvedIterable,
            streamTask.promise
          ),
          controller.error(reason);
      } catch (callbackError) {
        controller.error(callbackError), fatalError$1(request, callbackError);
      } finally {
        throwIntoIterator(reason),
          scheduleMicrotask(function () {
            return performWork$1(request);
          });
      }
    }
  }
  function abortIterable() {
    var signal = request.cacheController.signal;
    signal.removeEventListener("abort", abortIterable);
    signal = signal.reason;
    21 === request.type
      ? (markHalted(request.result, resolvedIterable), controller.halt())
      : streamTask.promise.then(noop, function (abortError) {
          copyErrorReference(
            request.result,
            resolvedIterable,
            streamTask.promise
          );
          controller.error(abortError);
        });
    throwIntoIterator(signal);
  }
  function next() {
    try {
      iterator.next().then(progress, error);
    } catch (x) {
      error(x);
    }
  }
  var controller = createAsyncIterable(iterable === iterator),
    streamTask = createTask$1(
      request,
      task.model,
      null,
      !1,
      task.formatContext
    ),
    resolvedIterable = controller.iterable;
  setRenderedModel(request.modelEntries, iterable, resolvedIterable);
  setAsyncIterable(request.result, controller);
  request.cacheController.signal.addEventListener("abort", abortIterable);
  next();
  return resolvedIterable;
}
function attachAbortSignal$1(request, signal) {
  function onAbort() {
    var current = subscription.request;
    null !== current && abort$1(current, signal.reason);
  }
  if (signal.aborted) abort$1(request, signal.reason);
  else {
    var cacheSignal = request.cacheController.signal;
    if (!cacheSignal.aborted) {
      var subscription = { request: request };
      signal.addEventListener("abort", onAbort);
      cacheSignal.addEventListener(
        "abort",
        function () {
          subscription.request = null;
          signal.removeEventListener("abort", onAbort);
        },
        { once: !0 }
      );
    }
  }
}
function abort$1(request, reason) {
  if (!(11 < request.status))
    try {
      request.status = 12;
      request.cacheController.abort(reason);
      if (21 === request.type) finishAbort$1(request, reason, !0);
      else {
        var error =
          void 0 === reason
            ? Error("The render was aborted by the server without a reason.")
            : "object" === typeof reason &&
                null !== reason &&
                "function" === typeof reason.then
              ? Error("The render was aborted by the server with a promise.")
              : reason;
        request.fatalError = error;
        if (0 < request.abortableTasks.size) {
          var digest = logRecoverableError$1(request, error),
            abortModel = createResultModel();
          request.abortModel = abortModel;
          request.result.errorReferences.set(abortModel, { digest: digest });
          rejectResultModel(abortModel, error);
        }
        finishAbort$1(request, error, !0);
      }
      if (14 === request.status) request.onAllReady();
    } catch (error$81) {
      fatalError$1(request, error$81);
    }
}
function createPrerenderRequest(
  model,
  onAllReady,
  onFatalError,
  onError,
  identifierPrefix,
  temporaryReferences,
  createServerReference
) {
  return new RequestInstance$1(
    model,
    onError,
    identifierPrefix,
    temporaryReferences,
    createServerReference,
    21,
    onAllReady,
    onFatalError
  );
}
function renderMap(request, task, map) {
  function populate(values) {
    for (var i = 0; i < values.length; i++)
      copy.set(values[i][0], values[i][1]);
  }
  if (0 !== task.formatContext) return outlineModel$1(request, map);
  var entries = Array.from(map),
    copy = new Map();
  setRenderedModel(request.modelEntries, map, copy);
  request = renderCollectionEntries(request, task, copy, entries);
  task = request.value;
  "fulfilled" === request.status && void 0 !== task
    ? populate(task)
    : request.then(populate, noop);
  return copy;
}
function renderSet(request, task, set) {
  function populate(values) {
    for (var i = 0; i < values.length; i++) copy.add(values[i]);
  }
  if (0 !== task.formatContext) return outlineModel$1(request, set);
  var entries = Array.from(set),
    copy = new Set();
  setRenderedModel(request.modelEntries, set, copy);
  request = renderCollectionEntries(request, task, copy, entries);
  task = request.value;
  "fulfilled" === request.status && void 0 !== task
    ? populate(task)
    : request.then(populate, noop);
  return copy;
}
function renderCollectionEntries(request, task, collection, entries) {
  var reference = task.currentReference;
  null !== reference && setModelReference(request, collection, reference);
  task = createTask$1(request, entries, null, !1, task.formatContext);
  entries = request.result;
  reference = task.promise;
  var collections = entries.collectionEntries;
  null === collections &&
    (entries.collectionEntries = collections = new WeakMap());
  collections.set(collection, reference);
  retryTask$1(request, task);
  return task.promise;
}
function renderServerReference(request, reference) {
  var existingReference = getRenderedModel(request.modelEntries, reference);
  if (void 0 !== existingReference) return existingReference;
  existingReference = reference.$$id;
  if ("function" !== typeof reference)
    return (
      setServerReference(request.result, reference, {
        id: existingReference,
        bound: null,
        isObjectReference: !0
      }),
      setRenderedModel(request.modelEntries, reference, reference),
      reference
    );
  var boundArgs = reference.$$bound;
  existingReference = {
    id: existingReference,
    bound: null,
    isObjectReference: !1
  };
  if (null === boundArgs)
    return (
      setServerReference(request.result, reference, existingReference),
      setRenderedModel(request.modelEntries, reference, reference),
      reference
    );
  boundArgs = createTask$1(request, boundArgs, null, !1, 0);
  boundArgs.promise.then(noop, noop);
  var copy = request.createServerReference(reference, boundArgs.promise);
  existingReference.bound = boundArgs.promise;
  setServerReference(request.result, copy, existingReference);
  setRenderedModel(request.modelEntries, reference, copy);
  pingTask$1(request, boundArgs);
  return copy;
}
function renderReadableStream(request, task, stream) {
  function progress(entry) {
    if (0 === streamTask.status)
      if (entry.done)
        (streamTask.status = 1),
          request.abortableTasks.delete(streamTask),
          request.cacheController.signal.removeEventListener(
            "abort",
            abortStream
          ),
          controller.close(),
          scheduleMicrotask(function () {
            return performWork$1(request);
          });
      else {
        var entryTask = null;
        try {
          streamTask.model = entry.value;
          if (isByteStream) {
            var value = renderModelDestructive$1(
              request,
              streamTask,
              emptyRoot,
              "",
              entry.value
            );
            controller.enqueue(Promise.resolve(value));
          } else
            (entryTask = createTask$1(
              request,
              entry.value,
              streamTask.keyPath,
              streamTask.implicitSlot,
              streamTask.formatContext
            )),
              controller.enqueue(entryTask.promise),
              tryStreamTask$1(request, entryTask);
          0 === streamTask.status && reader.read().then(progress, error);
        } catch (x$82) {
          error(x$82),
            null !== entryTask &&
              5 === entryTask.status &&
              (copyErrorReference(
                request.result,
                entryTask.promise,
                streamTask.promise
              ),
              (entryTask.status = 4),
              entryTask.reject(x$82),
              request.abortableTasks.delete(entryTask));
        }
      }
  }
  function error(reason) {
    if (0 === streamTask.status) {
      request.cacheController.signal.removeEventListener("abort", abortStream);
      try {
        erroredTask$1(request, streamTask, reason),
          copyErrorReference(
            request.result,
            resolvedStream,
            streamTask.promise
          ),
          controller.error(reason);
      } catch (callbackError) {
        controller.error(callbackError), fatalError$1(request, callbackError);
      } finally {
        reader.cancel(reason).then(noop, noop),
          scheduleMicrotask(function () {
            return performWork$1(request);
          });
      }
    }
  }
  function abortStream() {
    var signal = request.cacheController.signal;
    signal.removeEventListener("abort", abortStream);
    signal = signal.reason;
    21 === request.type
      ? (markHalted(request.result, resolvedStream), controller.halt())
      : streamTask.promise.then(noop, function (abortError) {
          copyErrorReference(
            request.result,
            resolvedStream,
            streamTask.promise
          );
          controller.error(abortError);
        });
    reader.cancel(signal).then(noop, noop);
  }
  var supportsBYOB = stream.supportsBYOB;
  if (void 0 === supportsBYOB)
    try {
      stream.getReader({ mode: "byob" }).releaseLock(), (supportsBYOB = !0);
    } catch (x) {
      supportsBYOB = !1;
    }
  var isByteStream = supportsBYOB,
    reader = stream.getReader(),
    controller = createReadableStream(isByteStream),
    streamTask = createTask$1(
      request,
      task.model,
      task.keyPath,
      task.implicitSlot,
      task.formatContext
    ),
    resolvedStream = controller.stream;
  setRenderedModel(request.modelEntries, stream, resolvedStream);
  setReadableStream(request.result, controller);
  request.cacheController.signal.addEventListener("abort", abortStream);
  reader.read().then(progress, error);
  return resolvedStream;
}
function tryStreamTask$1(request, task) {
  var prevDispatcher = ReactSharedInternalsServer.H;
  ReactSharedInternalsServer.H = HooksDispatcher;
  var prevCache = setCurrentCache(request);
  currentRequest = request;
  task.status = 5;
  try {
    var model = resolveModel$1(request, task, emptyRoot, "", task.model);
    if (14 !== request.status) {
      var outlinedModels = request.outlinedModels;
      (null !== outlinedModels &&
        waitForOutlinedModel(request, task, model, outlinedModels)) ||
        completeTask(request, task, model);
    }
  } catch (error) {
    if (12 === request.status) abortTask$1(request, task);
    else throw error;
  } finally {
    modelRoot$1 = null;
    try {
      14 !== request.status &&
        0 === request.abortableTasks.size &&
        ((request.status = 14),
        closeResult(request),
        request.cacheController.abort(
          Error(
            "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
          )
        ),
        request.onAllReady());
    } finally {
      (ReactSharedInternalsServer.H = prevDispatcher),
        (currentRequest = null),
        setCurrentCache(prevCache);
    }
  }
}
function closeResult(request) {
  var pendingWeakModels = request.pendingWeakModels;
  null !== pendingWeakModels &&
    (pendingWeakModels.forEach(function (model) {
      return markHalted(request.result, model);
    }),
    pendingWeakModels.clear(),
    (request.pendingWeakModels = null));
  closeHints(request.result);
  completeResult(request.result);
}
function subscribeToThenable$1(result, thenable, reader) {
  function detach() {
    unsubscribeDebug();
    unsubscribeDebug = noop;
    JSCompiler_object_inline_reader_794 = JSCompiler_object_inline_result_793 =
      null;
    unsubscribe();
  }
  var unsubscribeDebug = noop;
  if (isHalted(result, thenable))
    return unsubscribeDebug(), reader.halt(), noop;
  if ("fulfilled" === thenable.status)
    return unsubscribeDebug(), reader.resolve(thenable.value), noop;
  if ("rejected" === thenable.status)
    return (
      unsubscribeDebug(),
      reader.reject(thenable.reason, result.errorReferences.get(thenable)),
      noop
    );
  var JSCompiler_object_inline_result_793 = result;
  var JSCompiler_object_inline_reader_794 = reader;
  var unsubscribe = noop;
  unsubscribe = subscribeToResult(result, function () {
    var current = JSCompiler_object_inline_reader_794,
      source = JSCompiler_object_inline_result_793;
    null !== current &&
      null !== source &&
      isHalted(source, thenable) &&
      (detach(), current.halt());
  });
  null !== JSCompiler_object_inline_reader_794 &&
    thenable.then(
      function (value) {
        var current = JSCompiler_object_inline_reader_794;
        null !== current && (detach(), current.resolve(value));
      },
      function (error) {
        var current = JSCompiler_object_inline_reader_794,
          source = JSCompiler_object_inline_result_793;
        if (null !== current && null !== source) {
          var reference = source.errorReferences.get(thenable);
          detach();
          isHalted(source, thenable)
            ? current.halt()
            : current.reject(error, reference);
        }
      }
    );
  return detach;
}
function createInput(result) {
  return {
    root: result.root,
    getReadableStream: function (value) {
      var source = getReadableStream(result, value);
      return void 0 === source
        ? void 0
        : {
            isByteStream: source.isByteStream,
            subscribe: function (reader) {
              return subscribeToSequence(result, value, source, reader);
            }
          };
    },
    getAsyncIterable: function (value) {
      var source = getAsyncIterable(result, value);
      return void 0 === source
        ? void 0
        : {
            isIterator: source.isIterator,
            subscribe: function (reader) {
              return subscribeToAsyncIterable(result, value, source, reader);
            }
          };
    },
    getIteratorEntries: function (value) {
      return getIteratorEntries(result, value);
    },
    temporaryReferences: result.temporaryReferenceSet,
    getServerReference: function (value) {
      var serverReferences = result.serverReferences;
      return null === serverReferences ? void 0 : serverReferences.get(value);
    },
    getValueReference: function (value) {
      return getValueReference(result, value);
    },
    getModelInfo: function (value) {
      return getModelInfo(result, value);
    },
    getJSONWorkCredit: function () {
      return result.jsonWorkCredit;
    },
    getErrorInfo: function (value) {
      var errorInfos = result.errorInfos;
      return null === errorInfos ? void 0 : errorInfos.get(value);
    },
    getCollectionEntries: function (value) {
      var collections = result.collectionEntries;
      return null === collections ? void 0 : collections.get(value);
    },
    subscribeToThenable: function (thenable, reader) {
      return subscribeToThenable$1(result, thenable, reader);
    },
    subscribe: function (reader) {
      function detach() {
        JSCompiler_object_inline_reader_796 =
          JSCompiler_object_inline_queue_795 = null;
        unsubscribe();
      }
      function flushHints() {
        var queue = JSCompiler_object_inline_queue_795,
          current = JSCompiler_object_inline_reader_796;
        if (null !== queue && null !== current) {
          for (
            var hints = queue.completedHints;
            nextHintIndex < hints.length &&
            null !== JSCompiler_object_inline_reader_796;

          ) {
            var hint = hints[nextHintIndex++];
            current.hint(hint.code, hint.model);
          }
          queue.closed || waitForHints(queue).then(flushHints);
        }
      }
      var JSCompiler_object_inline_queue_795 = getHintQueue(result);
      var JSCompiler_object_inline_reader_796 = reader;
      var nextHintIndex = 0,
        unsubscribe = noop;
      unsubscribe = subscribeToResult(result, function () {
        var current = JSCompiler_object_inline_reader_796;
        null !== current && (flushHints(), detach(), current.complete());
      });
      flushHints();
      return detach;
    }
  };
}
function subscribeToSequence(result, model, source, reader) {
  function detach() {
    active = !1;
    entries.length = 0;
    unsubscribeSource();
    unsubscribeEntry();
  }
  function halt() {
    active && (detach(), reader.halt());
  }
  function readNext() {
    if (active && !reading && !draining) {
      draining = !0;
      try {
        for (; active && !reading; ) {
          if (nextEntryIndex >= entries.length) {
            null !== finish && finish();
            break;
          }
          var entry = entries[nextEntryIndex++];
          nextEntryIndex === entries.length &&
            (nextEntryIndex = entries.length = 0);
          reading = !0;
          var unsubscribe = subscribeToThenable$1(result, entry, {
            resolve: function (value) {
              active &&
                ((reading = !1),
                (unsubscribeEntry = noop),
                reader.progress({ value: value }),
                readNext());
            },
            reject: function (reason, reference) {
              active &&
                ((reading = !1),
                (unsubscribeEntry = noop),
                reader.rejectEntry(reason, reference),
                readNext());
            },
            halt: halt
          });
          active && reading ? (unsubscribeEntry = unsubscribe) : unsubscribe();
        }
      } finally {
        draining = !1;
      }
    }
  }
  var entries = [],
    nextEntryIndex = 0,
    reading = !1,
    draining = !1,
    active = !0,
    finish = null,
    unsubscribeSource = noop,
    unsubscribeEntry = noop;
  unsubscribeSource = source.subscribe({
    enqueue: function (entry) {
      active && (entries.push(entry), readNext());
    },
    close: function () {
      finish = function () {
        detach();
        reader.progress({ done: !0, value: void 0 });
      };
      readNext();
    },
    error: function (reason) {
      finish = function () {
        var reference = result.errorReferences.get(model);
        active && (detach(), reader.error(reason, reference));
      };
      readNext();
    },
    halt: function () {
      finish = halt;
      readNext();
    }
  });
  active || unsubscribeSource();
  return detach;
}
function subscribeToAsyncIterable(result, model, source, reader) {
  return source.subscribe({
    enqueue: reader.enqueue,
    close: reader.close,
    error: function (reason) {
      return reader.error(reason, result.errorReferences.get(model));
    },
    halt: reader.halt
  });
}
var stringify = JSON.stringify,
  getPrototypeOf = Object.getPrototypeOf,
  ObjectPrototype = Object.prototype,
  importStringRequest = null,
  NOT_PLAIN_IMPORT_METADATA = {},
  NEXT_TWO_CHUNKS_ARE_ATOMIC = Symbol();
function RequestInstance(input, bundlerConfig, onError, temporaryReferences) {
  this.taintCleanupQueue = [];
  this.temporaryReferences = input.temporaryReferences || temporaryReferences;
  this.writtenServerReferences = new Map();
  this.input = input;
  this.abortController = new AbortController();
  this.destination = null;
  this.status = 10;
  this.fatalError = null;
  this.completedRegularChunks = [];
  this.completedHintChunks = [];
  this.flushScheduled = !1;
  this.bundlerConfig = bundlerConfig;
  this.writtenClientReferences = new Map();
  this.writtenImportStrings = new Map();
  this.writtenImportStringsSize = 0;
  this.completedImportChunks = [];
  this.writtenModels = new WeakMap();
  this.writtenObjects = new WeakMap();
  this.inputSubscriptions = new Set();
  this.writtenSymbols = new Map();
  this.writtenErrors = new WeakMap();
  this.completedErrorChunks = [];
  this.onError = void 0 === onError ? defaultErrorHandler : onError;
  this.nextChunkId = this.jsonWorkSpent = this.pendingChunks = 0;
  this.abortableTasks = new Set();
  this.pingedTasks = [];
  bundlerConfig = createTask(this, null, this.abortableTasks);
  this.pendingChunks++;
  subscribeHints(this);
  11 < this.status ||
    (this.writtenModels.set(input.root, bundlerConfig.id),
    subscribeToThenable(this, bundlerConfig, input.root));
}
function defaultErrorHandler(error) {
  console.error(error);
}
var modelRoot = null,
  serializedSize = 0;
function outlineModel(request, value) {
  var task = createTask(request, value, request.abortableTasks);
  null !== value &&
    "object" === typeof value &&
    request.writtenObjects.set(value, serializeByValueID(task.id));
  retryTask(request, task);
  return task.id;
}
function renderModelDestructive(
  request,
  task,
  parent,
  parentPropertyName,
  value,
  parentReference,
  modelInfo
) {
  task.model = value;
  if (
    null !== value &&
    ("object" === typeof value || "function" === typeof value) &&
    isClientReference(value)
  ) {
    parentReference = value.$$async ? value.$$id + "#async" : value.$$id;
    modelInfo = request.writtenClientReferences;
    var existingId = modelInfo.get(parentReference);
    if (void 0 !== existingId)
      var JSCompiler_inline_result =
        parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? "$L" + existingId.toString(16)
          : serializeByValueID(existingId);
    else
      try {
        var clientReferenceMetadata = resolveClientReferenceMetadata(
            request.bundlerConfig,
            value
          ),
          copy = transformImportMetadata(request, clientReferenceMetadata, 0);
        if (copy !== NOT_PLAIN_IMPORT_METADATA)
          var JSCompiler_temp = stringify(copy);
        else
          b: {
            value = importStringRequest;
            importStringRequest = request;
            try {
              JSCompiler_temp = stringify(
                clientReferenceMetadata,
                importMetadataReplacer
              );
              break b;
            } finally {
              importStringRequest = value;
            }
            JSCompiler_temp = void 0;
          }
        var JSCompiler_inline_result$jscomp$0 = JSCompiler_temp;
        request.pendingChunks++;
        var importId = request.nextChunkId++,
          processedChunk =
            importId.toString(16) +
            ":I" +
            JSCompiler_inline_result$jscomp$0 +
            "\n";
        request.completedImportChunks.push(processedChunk);
        modelInfo.set(parentReference, importId);
        JSCompiler_inline_result =
          parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
            ? "$L" + importId.toString(16)
            : serializeByValueID(importId);
      } catch (error) {
        request.pendingChunks++,
          (value = request.nextChunkId++),
          (task = logRecoverableError(request, error, task)),
          emitErrorChunk(request, value, task),
          (JSCompiler_inline_result = serializeByValueID(value));
      }
    return JSCompiler_inline_result;
  }
  if (
    null !== value &&
    ("object" === typeof value || "function" === typeof value)
  ) {
    if (
      "function" === typeof value &&
      value.$$typeof === SERVER_REFERENCE_TAG
    ) {
      task = request.writtenServerReferences;
      parent = task.get(value);
      if (void 0 !== parent) request = "$h" + parent.toString(16);
      else {
        parent = value.$$id;
        parentPropertyName = request.input;
        parentPropertyName =
          null === parentPropertyName
            ? void 0
            : parentPropertyName.getServerReference(value);
        if (void 0 === parentPropertyName)
          throw Error(
            "A Result must record server references before serialization."
          );
        request = outlineModel(request, {
          id: parent,
          bound: parentPropertyName.bound
        });
        task.set(value, request);
        request = "$h" + request.toString(16);
      }
      return request;
    }
    if (
      void 0 !== request.temporaryReferences &&
      ((JSCompiler_inline_result = request.temporaryReferences.get(value)),
      void 0 !== JSCompiler_inline_result)
    )
      return "$T" + JSCompiler_inline_result;
  }
  if (null === value) return null;
  if ("object" === typeof value) {
    JSCompiler_inline_result = request.input;
    clientReferenceMetadata =
      null === JSCompiler_inline_result
        ? void 0
        : JSCompiler_inline_result.getValueReference(value);
    if (void 0 !== clientReferenceMetadata) {
      a: {
        value = clientReferenceMetadata.root;
        if (
          "fulfilled" === value.status &&
          ((parent = value.value),
          null !== parent &&
            "object" === typeof parent &&
            ((parent = request.writtenObjects.get(parent)), void 0 !== parent))
        ) {
          request = parent;
          break a;
        }
        request = serializeByValueID(serializeThenable(request, task, value));
      }
      value = [];
      task = clientReferenceMetadata;
      for (parent = task.parent; null !== parent; )
        value.push(task.key), (task = parent), (parent = task.parent);
      for (task = value.length - 1; 0 <= task; task--)
        request += ":" + value[task];
      return request;
    }
    clientReferenceMetadata =
      (void 0 === modelInfo
        ? null === JSCompiler_inline_result
          ? 0
          : JSCompiler_inline_result.getModelInfo(value)
        : modelInfo) & 3;
    if (
      1 === clientReferenceMetadata ||
      2 === clientReferenceMetadata ||
      3 === clientReferenceMetadata ||
      (0 === clientReferenceMetadata &&
        (isArrayImpl(value) ||
          value.$$typeof === REACT_ELEMENT_TYPE ||
          value instanceof Map ||
          value instanceof Set ||
          value instanceof Error ||
          ("function" === typeof FormData && value instanceof FormData) ||
          ("function" === typeof Blob && value instanceof Blob) ||
          value instanceof ArrayBuffer ||
          ArrayBuffer.isView(value) ||
          (null !== JSCompiler_inline_result &&
            (void 0 !== JSCompiler_inline_result.getReadableStream(value) ||
              void 0 !== JSCompiler_inline_result.getAsyncIterable(value) ||
              void 0 !== JSCompiler_inline_result.getIteratorEntries(value))) ||
          getPrototypeOf(value) === ObjectPrototype))
    ) {
      a: {
        JSCompiler_inline_result$jscomp$0 = request.writtenObjects;
        JSCompiler_temp = JSCompiler_inline_result$jscomp$0.get(value);
        if (void 0 !== JSCompiler_temp)
          if (modelRoot === value) {
            if (JSCompiler_temp !== serializeByValueID(task.id)) {
              parent = JSCompiler_temp;
              break a;
            }
            modelRoot = null;
          } else {
            parent = JSCompiler_temp;
            break a;
          }
        else if (-1 !== parentPropertyName.indexOf(":")) {
          parent = serializeByValueID(outlineModel(request, value));
          break a;
        } else if (
          (void 0 === parentReference &&
            (parentReference = JSCompiler_inline_result$jscomp$0.get(parent)),
          null != parentReference)
        ) {
          JSCompiler_temp = parentPropertyName;
          if (isArrayImpl(parent) && parent[0] === REACT_ELEMENT_TYPE)
            switch (parentPropertyName) {
              case "1":
                JSCompiler_temp = "type";
                break;
              case "2":
                JSCompiler_temp = "key";
                break;
              case "3":
                JSCompiler_temp = "props";
                break;
              case "4":
                JSCompiler_temp = "_owner";
            }
          JSCompiler_inline_result$jscomp$0.set(
            value,
            parentReference + ":" + JSCompiler_temp
          );
        }
        parent = null;
      }
      if (null !== parent) return parent;
    }
    if (1 === clientReferenceMetadata || 2 === clientReferenceMetadata)
      return value;
    if (value.$$typeof === REACT_LAZY_TYPE)
      return (
        "$L" + serializeThenable(request, task, value._payload).toString(16)
      );
    if ("function" === typeof value.then)
      return "$@" + serializeThenable(request, task, value).toString(16);
    if (value instanceof Date) return "$D" + value.toJSON();
    if (
      3 === clientReferenceMetadata ||
      value.$$typeof === REACT_ELEMENT_TYPE
    ) {
      if (3200 < serializedSize)
        return (
          (value = createTask(request, task.model, request.abortableTasks)),
          "object" === typeof task.model &&
            null !== task.model &&
            request.writtenObjects.set(
              task.model,
              serializeByValueID(value.id)
            ),
          pingTask(request, value),
          "$L" + value.id.toString(16)
        );
      parent = [REACT_ELEMENT_TYPE, value.type, value.key, value.props];
      request = request.writtenObjects.get(value);
      task.returnedTupleReference = void 0 === request ? null : request;
      return parent;
    }
    if (value instanceof Map)
      return (
        (task = request.input),
        (task = null === task ? void 0 : task.getCollectionEntries(value)),
        void 0 !== task
          ? (request =
              "$Q" + serializeCollectionEntries(request, task).toString(16))
          : ((value = Array.from(value)),
            (request = "$Q" + outlineModel(request, value).toString(16))),
        request
      );
    if (value instanceof Set)
      return (
        (task = request.input),
        (task = null === task ? void 0 : task.getCollectionEntries(value)),
        void 0 !== task
          ? (request =
              "$W" + serializeCollectionEntries(request, task).toString(16))
          : ((value = Array.from(value)),
            (request = "$W" + outlineModel(request, value).toString(16))),
        request
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
    if ("function" === typeof FormData && value instanceof FormData)
      return (
        (value = Array.from(value.entries())),
        "$K" + outlineModel(request, value).toString(16)
      );
    if ("function" === typeof Blob && value instanceof Blob)
      return serializeBlob(request, value);
    if (value instanceof Error) return "$Z";
    if (isArrayImpl(value)) return value;
    if (getIteratorFn(value)) {
      value =
        null === JSCompiler_inline_result
          ? void 0
          : JSCompiler_inline_result.getIteratorEntries(value);
      if (void 0 === value)
        throw Error("A Result must record iterators before serialization.");
      return "$i" + outlineModel(request, value).toString(16);
    }
    return null !== JSCompiler_inline_result &&
      void 0 !== JSCompiler_inline_result.getReadableStream(value)
      ? serializeReadableStream(request, task, value)
      : null !== JSCompiler_inline_result &&
          void 0 !== JSCompiler_inline_result.getAsyncIterable(value)
        ? serializeAsyncIterable(request, task, value)
        : value;
  }
  if ("string" === typeof value)
    return (
      (serializedSize += value.length),
      1024 <= value.length && null !== byteLengthOfChunk
        ? (request.pendingChunks++,
          (task = request.nextChunkId++),
          emitTextChunk(request, task, value),
          serializeByValueID(task))
        : escapeStringValue(value)
    );
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
  if (
    value === REACT_ELEMENT_TYPE &&
    "0" === parentPropertyName &&
    isArrayImpl(parent)
  )
    return "$";
  if ("symbol" === typeof value) {
    task = request.writtenSymbols;
    parent = task.get(value);
    if (void 0 !== parent) return serializeByValueID(parent);
    parentPropertyName = value.description;
    request.pendingChunks++;
    parent = request.nextChunkId++;
    parentPropertyName = encodeReferenceChunk(
      request,
      parent,
      "$S" + parentPropertyName
    );
    request.completedImportChunks.push(parentPropertyName);
    task.set(value, parent);
    return serializeByValueID(parent);
  }
  if ("bigint" === typeof value) return "$n" + value.toString(10);
  throw Error("A Result must validate models before serialization.");
}
function resolveModel(request, task, parent, parentPropertyName, value) {
  var rowRoot =
      5 < arguments.length && void 0 !== arguments[5] ? arguments[5] : !1,
    parentReference = 6 < arguments.length ? arguments[6] : void 0,
    input = request.input,
    modelInfo =
      null !== value && "object" === typeof value && null !== input
        ? input.getModelInfo(value)
        : 0;
  serializedSize += parentPropertyName.length;
  try {
    var JSCompiler_inline_result = renderModelDestructive(
      request,
      task,
      parent,
      parentPropertyName,
      value,
      parentReference,
      modelInfo
    );
  } catch (thrownValue) {
    if (
      ((parentReference = task.model),
      (JSCompiler_inline_result =
        null !== parentReference &&
        "object" === typeof parentReference &&
        null !== request.input
          ? request.input.getModelInfo(parentReference) & 3
          : 0),
      (parentReference =
        "object" === typeof parentReference &&
        null !== parentReference &&
        (3 === JSCompiler_inline_result ||
          (0 === JSCompiler_inline_result &&
            (parentReference.$$typeof === REACT_ELEMENT_TYPE ||
              parentReference.$$typeof === REACT_LAZY_TYPE)))),
      12 === request.status)
    )
      (task.status = 3),
        (JSCompiler_inline_result = request.fatalError),
        (JSCompiler_inline_result = parentReference
          ? "$L" + JSCompiler_inline_result.toString(16)
          : serializeByValueID(JSCompiler_inline_result));
    else {
      request.pendingChunks++;
      JSCompiler_inline_result = request.nextChunkId++;
      var digest = logRecoverableError(request, thrownValue, task);
      emitErrorChunk(request, JSCompiler_inline_result, digest);
      JSCompiler_inline_result = parentReference
        ? "$L" + JSCompiler_inline_result.toString(16)
        : serializeByValueID(JSCompiler_inline_result);
    }
  }
  parentReference = JSCompiler_inline_result;
  if (null === parentReference || "object" !== typeof parentReference)
    return parentReference;
  if (
    parentReference === value &&
    (rowRoot || 3200 < serializedSize) &&
    null !== input &&
    ((rowRoot = 0 === (modelInfo & 8) ? 0 : modelInfo >>> 5),
    0 !== rowRoot &&
      request.jsonWorkSpent + rowRoot <= input.getJSONWorkCredit())
  )
    return (request.jsonWorkSpent += rowRoot), parentReference;
  if (isArrayImpl(parentReference)) {
    if (parentReference !== value) {
      rowRoot = task.returnedTupleReference;
      var marker = resolveModel(
          request,
          task,
          parentReference,
          "0",
          parentReference[0],
          !1,
          rowRoot
        ),
        type = resolveModel(
          request,
          task,
          parentReference,
          "1",
          parentReference[1],
          !1,
          rowRoot
        );
      input = resolveModel(
        request,
        task,
        parentReference,
        "2",
        parentReference[2],
        !1,
        rowRoot
      );
      rowRoot = resolveModel(
        request,
        task,
        parentReference,
        "3",
        parentReference[3],
        !1,
        rowRoot
      );
      parentReference[0] = marker;
      parentReference[1] = type;
      parentReference[2] = input;
      parentReference[3] = rowRoot;
      return parentReference;
    }
    marker = null;
    for (type = 0; type < parentReference.length; type++)
      (input = parentReference[type]),
        (rowRoot = resolveModel(
          request,
          task,
          parentReference,
          "" + type,
          input
        )),
        null === marker &&
          rowRoot !== input &&
          (marker = 0 === type ? [] : parentReference.slice(0, type)),
        null !== marker && (marker[type] = rowRoot);
    return null === marker ? parentReference : marker;
  }
  input = null;
  for (marker in parentReference)
    if (hasOwnProperty.call(parentReference, marker)) {
      rowRoot = parentReference[marker];
      modelInfo = resolveModel(request, task, parentReference, marker, rowRoot);
      if (null === input && modelInfo !== rowRoot)
        for (type in ((input = {}), parentReference)) {
          if (type === marker) break;
          hasOwnProperty.call(parentReference, type) &&
            ("__proto__" === type
              ? Object.defineProperty(input, type, {
                  value: parentReference[type],
                  enumerable: !0,
                  writable: !0,
                  configurable: !0
                })
              : (input[type] = parentReference[type]));
        }
      null !== input &&
        ("__proto__" === marker
          ? Object.defineProperty(input, marker, {
              value: modelInfo,
              enumerable: !0,
              writable: !0,
              configurable: !0
            })
          : (input[marker] = modelInfo));
    }
  return null === input ? parentReference : input;
}
function emitTextChunk(request, id, text) {
  var debug =
    3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : !1;
  if (null === byteLengthOfChunk)
    throw Error(
      "Existence of byteLengthOfChunk should have already been checked. This is a bug in React."
    );
  debug ? request.pendingDebugChunks++ : request.pendingChunks++;
  debug = byteLengthOfChunk(text);
  debug = id.toString(16) + ":T" + debug.toString(16) + ",";
  request.completedRegularChunks.push(NEXT_TWO_CHUNKS_ARE_ATOMIC, debug, text);
}
function emitModelChunk(request, id, json) {
  id = id.toString(16) + ":" + json + "\n";
  request.completedRegularChunks.push(id);
}
function createTask(request, model, abortSet) {
  var id = request.nextChunkId++;
  request.pendingChunks++;
  request = { id: id, status: 0, model: model, returnedTupleReference: null };
  abortSet.add(request);
  return request;
}
function retryTask(request, task) {
  if (0 === task.status) {
    task.status = 6;
    var parentSerializedSize = serializedSize;
    try {
      var model = task.model;
      modelRoot = model;
      null === model ||
        "object" !== typeof model ||
        request.writtenObjects.has(model) ||
        request.writtenObjects.set(model, serializeByValueID(task.id));
      var resolvedModel = resolveModel(
          request,
          task,
          { "": model },
          "",
          model,
          !0
        ),
        json = JSON.stringify(resolvedModel);
      emitModelChunk(request, task.id, json);
      task.status = 1;
      request.abortableTasks.delete(task);
    } catch (error) {
      if (12 === request.status) {
        request.abortableTasks.delete(task);
        task.status = 0;
        var errorId = request.fatalError;
        0 === task.status && (task.status = 3);
        finishAbortedTask(task, request, errorId);
      } else
        try {
          erroredTask(request, task, error);
        } catch (fatal) {
          fatalError(request, fatal);
        }
    } finally {
      serializedSize = parentSerializedSize;
    }
  }
}
function performWork(request) {
  if (14 !== request.status && 13 !== request.status) {
    var prevCache = setCurrentCache(null);
    try {
      var pingedTasks = request.pingedTasks;
      request.pingedTasks = [];
      for (var i = 0; i < pingedTasks.length; i++)
        if (
          (retryTask(request, pingedTasks[i]),
          14 === request.status || 13 === request.status)
        )
          return;
      flushCompletedChunks(request);
    } catch (error) {
      logRecoverableError(request, error, null), fatalError(request, error);
    } finally {
      setCurrentCache(prevCache);
    }
  }
}
function performWorkWithContext(request) {
  cacheStorage.run(void 0, function () {
    return requestStorage.run(void 0, performWork, request);
  });
}
function pingTask(request, task) {
  if (14 !== request.status && 0 === task.status) {
    var pingedTasks = request.pingedTasks;
    pingedTasks.push(task);
    1 === pingedTasks.length &&
      (10 === request.status
        ? scheduleMicrotask(function () {
            return performWorkWithContext(request);
          })
        : setImmediate(function () {
            return performWorkWithContext(request);
          }));
  }
}
function serializeByValueID(id) {
  return "$" + id.toString(16);
}
function escapeStringValue(value) {
  return "$" === value[0] ? "$" + value : value;
}
function serializeImportString(request, value) {
  if (16 > value.length) return escapeStringValue(value);
  var writtenStrings = request.writtenImportStrings,
    existing = writtenStrings.get(value);
  if (void 0 !== existing) return existing;
  existing = request.writtenImportStringsSize + value.length;
  if (32768 < existing) return escapeStringValue(value);
  request.writtenImportStringsSize = existing;
  request.pendingChunks++;
  existing = request.nextChunkId++;
  var json = stringify(escapeStringValue(value));
  request.completedImportChunks.push(existing.toString(16) + ":" + json + "\n");
  request = serializeByValueID(existing);
  writtenStrings.set(value, request);
  return request;
}
function importMetadataReplacer(key, value) {
  return "string" === typeof value
    ? ((key = importStringRequest),
      null === key
        ? escapeStringValue(value)
        : serializeImportString(key, value))
    : value;
}
function transformImportMetadata(request, value, depth) {
  switch (typeof value) {
    case "string":
      return serializeImportString(request, value);
    case "number":
    case "boolean":
    case "undefined":
      return value;
    case "object":
      if (null === value) return null;
      if (16 < depth || "function" === typeof value.toJSON)
        return NOT_PLAIN_IMPORT_METADATA;
      if (isArrayImpl(value)) {
        for (
          var length = value.length, copy = Array(length), i = 0;
          i < length;
          i++
        ) {
          var element = value[i];
          if ("string" === typeof element)
            copy[i] = serializeImportString(request, element);
          else {
            element = transformImportMetadata(request, element, depth + 1);
            if (element === NOT_PLAIN_IMPORT_METADATA)
              return NOT_PLAIN_IMPORT_METADATA;
            copy[i] = element;
          }
        }
        return copy;
      }
      length = getPrototypeOf(value);
      if (length !== ObjectPrototype && null !== length)
        return NOT_PLAIN_IMPORT_METADATA;
      length = Object.keys(value);
      copy = {};
      for (i = 0; i < length.length; i++) {
        element = length[i];
        if (element in ObjectPrototype) return NOT_PLAIN_IMPORT_METADATA;
        var element$91 = value[element];
        if ("string" === typeof element$91)
          copy[element] = serializeImportString(request, element$91);
        else {
          element$91 = transformImportMetadata(request, element$91, depth + 1);
          if (element$91 === NOT_PLAIN_IMPORT_METADATA)
            return NOT_PLAIN_IMPORT_METADATA;
          copy[element] = element$91;
        }
      }
      return copy;
    default:
      return NOT_PLAIN_IMPORT_METADATA;
  }
}
function encodeReferenceChunk(request, id, reference) {
  request = JSON.stringify(reference);
  return id.toString(16) + ":" + request + "\n";
}
function subscribeToThenable(request, task, thenable, outlineNow) {
  var synchronous = !0 === outlineNow;
  try {
    var input = request.input;
    null !== input &&
      subscribeInput(request, function (detach) {
        return input.subscribeToThenable(thenable, {
          debug: void 0,
          halt: function () {
            detach();
            0 === task.status &&
              (haltTask(task, request),
              request.abortableTasks.delete(task),
              3 === task.status && request.pendingChunks--,
              enqueueFlush(request));
          },
          resolve: function (value) {
            detach();
            if (11 >= request.status && 0 === task.status)
              if (((task.model = value), synchronous)) {
                value = task.model;
                null !== value &&
                  "object" === typeof value &&
                  request.writtenObjects.set(
                    value,
                    serializeByValueID(task.id)
                  );
                value = modelRoot;
                try {
                  retryTask(request, task);
                } finally {
                  modelRoot = value;
                }
              } else pingTask(request, task);
          },
          reject: function (error, reference) {
            detach();
            if (11 >= request.status && 0 === task.status)
              try {
                erroredInputTask(request, task, error, reference),
                  enqueueFlush(request);
              } catch (fatal) {
                fatalError(request, fatal);
              }
          }
        });
      });
  } finally {
    synchronous = !1;
  }
}
function subscribeInput(request, subscribe) {
  function detach() {
    active = !1;
    request.inputSubscriptions.delete(detach);
    unsubscribe();
  }
  var unsubscribe = noop,
    active = !0;
  request.inputSubscriptions.add(detach);
  unsubscribe = subscribe(detach);
  (!active || 11 < request.status) && detach();
}
function serializeThenable(request, task, thenable) {
  if (null === request.input)
    throw Error("Cannot serialize a detached Result.");
  task = request.writtenModels.get(thenable);
  if (void 0 !== task) return task;
  task = createTask(request, null, request.abortableTasks);
  request.writtenModels.set(thenable, task.id);
  subscribeToThenable(request, task, thenable);
  return task.id;
}
function logRecoverableError(request, error) {
  var prevCache = setCurrentCache(null);
  try {
    var onError = request.onError;
    var errorDigest = cacheStorage.run(void 0, function () {
      return requestStorage.run(void 0, onError, error);
    });
  } finally {
    setCurrentCache(prevCache);
  }
  if (null != errorDigest && "string" !== typeof errorDigest)
    throw Error(
      'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
        typeof errorDigest +
        '" instead'
    );
  return errorDigest || "";
}
function erroredTask(request, task, error) {
  task.status = 4;
  request.abortableTasks.delete(task);
  error = logRecoverableError(request, error, task);
  emitErrorChunk(request, task.id, error);
}
function erroredInputTask(request, task, error, reference) {
  void 0 === reference
    ? erroredTask(request, task, error)
    : ((task.status = 4),
      request.abortableTasks.delete(task),
      (error = request.writtenErrors.get(reference)),
      void 0 === error
        ? (request.writtenErrors.set(reference, task.id),
          emitErrorChunk(request, task.id, reference.digest))
        : ((reference = serializeByValueID(error)),
          request.completedErrorChunks.push(
            encodeReferenceChunk(request, task.id, reference)
          )));
}
function emitErrorChunk(request, id, digest) {
  digest = { digest: digest };
  id = id.toString(16) + ":E" + stringify(digest) + "\n";
  request.completedErrorChunks.push(id);
}
function enqueueFlush(request) {
  request.flushScheduled ||
    null === request.destination ||
    ((request.flushScheduled = !0),
    setImmediate(function () {
      request.flushScheduled = !1;
      flushCompletedChunks(request);
    }));
}
function cleanupInput(request) {
  request.input = null;
  request.inputSubscriptions.forEach(function (detach) {
    return detach();
  });
  request.inputSubscriptions.clear();
}
function subscribeHints(request) {
  function completeInput() {
    sourceComplete ||
      ((sourceComplete = !0), request.pendingChunks--, enqueueFlush(request));
  }
  var input = request.input;
  if (null !== input) {
    var sourceComplete = !1;
    request.abortController.signal.addEventListener(
      "abort",
      function () {
        completeInput();
        cleanupInput(request);
      },
      { once: !0 }
    );
    subscribeInput(request, function (detach) {
      return input.subscribe({
        hint: function (code, model) {
          try {
            var json = JSON.stringify(model);
            request.completedHintChunks.push(":H" + code + json + "\n");
            enqueueFlush(request);
          } catch (error) {
            fatalError(request, error);
          }
        },
        console: function () {},
        complete: function () {
          detach();
          completeInput();
        }
      });
    });
  }
}
function fatalError(request, error) {
  request.abortController.abort(error);
  request.fatalError = error;
  cleanupInput(request);
  var destination = request.destination;
  null !== destination
    ? ((request.status = 14), destination.destroy(error))
    : (request.status = 13);
}
function flushCompletedChunks(request) {
  var destination = request.destination;
  if (null !== destination) {
    currentView = new Uint8Array(4096);
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
      for (i = 0; i < regularChunks.length; i++) {
        var item = regularChunks[i];
        importsChunks = void 0;
        if ("symbol" === typeof item) {
          var headerChunk = regularChunks[i + 1],
            contentChunk = regularChunks[i + 2];
          if (
            i + 2 >= regularChunks.length ||
            "symbol" === typeof headerChunk ||
            "symbol" === typeof contentChunk
          )
            throw Error("A chunk pair is incomplete. This is a bug in React.");
          request.pendingChunks -= 2;
          writeChunk(destination, headerChunk);
          importsChunks = writeChunkAndReturn(destination, contentChunk);
          i += 2;
        } else
          request.pendingChunks--,
            (importsChunks = writeChunkAndReturn(destination, item));
        if (!importsChunks) {
          request.destination = null;
          i++;
          break;
        }
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
      (request.flushScheduled = !1), completeWriting(destination);
    }
    flushBuffered(destination);
  }
  0 === request.pendingChunks &&
    (cleanupInput(request),
    12 > request.status && request.abortController.abort(),
    null !== request.destination &&
      ((request.status = 14),
      request.destination.end(),
      (request.destination = null)));
}
function startWork(request) {
  scheduleMicrotask(function () {
    return performWorkWithContext(request);
  });
  setImmediate(function () {
    10 === request.status && (request.status = 11);
  });
}
function startFlowing(request, destination) {
  if (13 === request.status)
    (request.status = 14), destination.destroy(request.fatalError);
  else if (14 !== request.status && null === request.destination) {
    request.destination = destination;
    try {
      flushCompletedChunks(request);
    } catch (error) {
      fatalError(request, error);
    }
  }
}
function finishAbortedTask(task, request, errorId) {
  3 === task.status &&
    ((errorId = serializeByValueID(errorId)),
    (task = encodeReferenceChunk(request, task.id, errorId)),
    request.completedErrorChunks.push(task));
}
function haltTask(task) {
  0 === task.status && (task.status = 3);
}
function finishAbort(request, abortedTasks, errorId) {
  try {
    abortedTasks.forEach(function (task) {
      return finishAbortedTask(task, request, errorId);
    }),
      flushCompletedChunks(request);
  } catch (error) {
    logRecoverableError(request, error), fatalError(request, error);
  }
}
function attachAbortSignal(request, signal) {
  signal.aborted
    ? abort(request, signal.reason)
    : signal.addEventListener(
        "abort",
        function () {
          abort(request, signal.reason);
        },
        { signal: request.abortController.signal }
      );
}
function abort(request, reason) {
  if (!(11 < request.status))
    try {
      request.status = 12;
      request.abortController.abort(reason);
      var abortableTasks = request.abortableTasks;
      if (0 < abortableTasks.size) {
        var error =
            void 0 === reason
              ? Error("The render was aborted by the server without a reason.")
              : "object" === typeof reason &&
                  null !== reason &&
                  "function" === typeof reason.then
                ? Error("The render was aborted by the server with a promise.")
                : reason,
          digest = logRecoverableError(request, error),
          errorId = request.nextChunkId++;
        request.fatalError = errorId;
        request.pendingChunks++;
        emitErrorChunk(request, errorId, digest, error);
        abortableTasks.forEach(function (task) {
          0 === task.status && (task.status = 3);
        });
        setImmediate(function () {
          return finishAbort(request, abortableTasks, errorId);
        });
      } else flushCompletedChunks(request);
    } catch (error$98) {
      logRecoverableError(request, error$98), fatalError(request, error$98);
    }
}
function serializeCollectionEntries(request, model) {
  if (null === request.input)
    throw Error("Cannot serialize a detached Result.");
  var existingId = request.writtenModels.get(model);
  if (void 0 !== existingId) return existingId;
  existingId = createTask(request, null, request.abortableTasks);
  request.writtenModels.set(model, existingId.id);
  subscribeToThenable(request, existingId, model, !0);
  return existingId.id;
}
function serializeTypedArray(request, tag, typedArray) {
  var bufferId = request.nextChunkId++;
  emitTypedArrayChunk(request, bufferId, tag, typedArray);
  request.pendingChunks++;
  return serializeByValueID(bufferId);
}
function emitTypedArrayChunk(request, id, tag, typedArray) {
  4 < arguments.length && void 0 !== arguments[4] && arguments[4]
    ? request.pendingDebugChunks++
    : request.pendingChunks++;
  var bytes = new Uint8Array(
    new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength
    )
  );
  bytes = typedArrayToBinaryChunk(bytes);
  var binaryLength = bytes.byteLength;
  binaryLength = id.toString(16) + ":" + tag + binaryLength.toString(16) + ",";
  request.completedRegularChunks.push(
    NEXT_TWO_CHUNKS_ARE_ATOMIC,
    binaryLength,
    bytes
  );
}
function serializeBlob(request, blob) {
  function progress(entry) {
    if (0 === newTask.status)
      if (entry.done)
        request.abortController.signal.removeEventListener("abort", abortBlob),
          pingTask(request, newTask);
      else
        return (
          model.push(entry.value), reader.read().then(progress).catch(error)
        );
  }
  function error(reason) {
    0 === newTask.status &&
      (request.abortController.signal.removeEventListener("abort", abortBlob),
      erroredTask(request, newTask, reason),
      enqueueFlush(request),
      reader.cancel(reason).then(error, error));
  }
  function abortBlob() {
    if (0 === newTask.status) {
      var signal = request.abortController.signal;
      signal.removeEventListener("abort", abortBlob);
      signal = signal.reason;
      erroredTask(request, newTask, signal);
      enqueueFlush(request);
      reader.cancel(signal).then(error, error);
    }
  }
  var model = [blob.type],
    reader = blob.stream().getReader(),
    newTask = createTask(request, model, request.abortableTasks);
  request.abortController.signal.addEventListener("abort", abortBlob);
  reader.read().then(progress).catch(error);
  return "$B" + newTask.id.toString(16);
}
function emitChunk(request, task, value) {
  var id = task.id;
  if ("string" === typeof value && null !== byteLengthOfChunk)
    emitTextChunk(request, id, value);
  else {
    var input = request.input;
    if (
      0 ===
      (null !== value && "object" === typeof value && null !== input
        ? input.getModelInfo(value) & 3
        : 0)
    ) {
      if (value instanceof ArrayBuffer) {
        emitTypedArrayChunk(request, id, "A", new Uint8Array(value));
        return;
      }
      if (value instanceof Int8Array) {
        emitTypedArrayChunk(request, id, "O", value);
        return;
      }
      if (value instanceof Uint8Array) {
        emitTypedArrayChunk(request, id, "o", value);
        return;
      }
      if (value instanceof Uint8ClampedArray) {
        emitTypedArrayChunk(request, id, "U", value);
        return;
      }
      if (value instanceof Int16Array) {
        emitTypedArrayChunk(request, id, "S", value);
        return;
      }
      if (value instanceof Uint16Array) {
        emitTypedArrayChunk(request, id, "s", value);
        return;
      }
      if (value instanceof Int32Array) {
        emitTypedArrayChunk(request, id, "L", value);
        return;
      }
      if (value instanceof Uint32Array) {
        emitTypedArrayChunk(request, id, "l", value);
        return;
      }
      if (value instanceof Float32Array) {
        emitTypedArrayChunk(request, id, "G", value);
        return;
      }
      if (value instanceof Float64Array) {
        emitTypedArrayChunk(request, id, "g", value);
        return;
      }
      if (value instanceof BigInt64Array) {
        emitTypedArrayChunk(request, id, "M", value);
        return;
      }
      if (value instanceof BigUint64Array) {
        emitTypedArrayChunk(request, id, "m", value);
        return;
      }
      if (value instanceof DataView) {
        emitTypedArrayChunk(request, id, "V", value);
        return;
      }
    }
    value = resolveModel(request, task, { "": value }, "", value, !0);
    value = JSON.stringify(value);
    emitModelChunk(request, task.id, value);
  }
}
function serializeReadableStream(request, task, stream) {
  function error(reason, reference) {
    if (0 === streamTask.status)
      try {
        erroredInputTask(request, streamTask, reason, reference),
          scheduleMicrotask(function () {
            return flushCompletedChunks(request);
          });
      } catch (fatal) {
        fatalError(request, fatal);
      }
  }
  var input = request.input,
    source = null === input ? void 0 : input.getReadableStream(stream);
  if (void 0 === source)
    throw Error("A Result must record streams before serialization.");
  var isByteStream = source.isByteStream,
    streamTask = createTask(request, task.model, request.abortableTasks);
  request.pendingChunks++;
  task = streamTask.id.toString(16) + ":" + (isByteStream ? "r" : "R") + "\n";
  request.writtenObjects.set(stream, serializeByValueID(streamTask.id));
  request.completedRegularChunks.push(task);
  subscribeInput(request, function (detach) {
    return source.subscribe({
      progress: function (entry) {
        if (0 === streamTask.status)
          if (entry.done) {
            streamTask.status = 1;
            var endStreamRow = streamTask.id.toString(16) + ":C\n";
            request.completedRegularChunks.push(endStreamRow);
            request.abortableTasks.delete(streamTask);
            enqueueFlush(request);
          } else {
            request.pendingChunks++;
            endStreamRow = !0;
            try {
              streamTask.model = entry.value;
              if (isByteStream)
                emitTypedArrayChunk(
                  request,
                  streamTask.id,
                  "b",
                  streamTask.model
                );
              else {
                entry = modelRoot;
                var parentSerializedSize = serializedSize;
                try {
                  (modelRoot = null),
                    emitChunk(request, streamTask, streamTask.model);
                } finally {
                  (modelRoot = entry), (serializedSize = parentSerializedSize);
                }
              }
              endStreamRow = !1;
              enqueueFlush(request);
            } catch (reason) {
              endStreamRow && request.pendingChunks--, error(reason, void 0);
            }
          }
        0 !== streamTask.status && detach();
      },
      error: function (reason, reference) {
        detach();
        error(reason, reference);
      },
      rejectEntry: function (reason, reference) {
        detach();
        error(reason, reference);
      },
      halt: function () {
        detach();
        0 === streamTask.status &&
          (request.abortableTasks.delete(streamTask),
          haltTask(streamTask),
          3 === streamTask.status && request.pendingChunks--,
          enqueueFlush(request));
      }
    });
  });
  return serializeByValueID(streamTask.id);
}
function serializeAsyncIterable(request, task, iterable) {
  function error(reason, reference) {
    if (0 === streamTask.status)
      try {
        erroredInputTask(request, streamTask, reason, reference),
          scheduleMicrotask(function () {
            return flushCompletedChunks(request);
          });
      } catch (fatal) {
        fatalError(request, fatal);
      }
  }
  var input = request.input,
    source = null === input ? void 0 : input.getAsyncIterable(iterable);
  if (void 0 === source)
    throw Error("A Result must record async iterables before serialization.");
  var streamTask = createTask(request, task.model, request.abortableTasks);
  request.pendingChunks++;
  task =
    streamTask.id.toString(16) + ":" + (source.isIterator ? "x" : "X") + "\n";
  request.writtenObjects.set(iterable, serializeByValueID(streamTask.id));
  request.completedRegularChunks.push(task);
  subscribeInput(request, function (detach) {
    return source.subscribe({
      enqueue: function (entry, done) {
        if (0 === streamTask.status)
          try {
            var entryId = serializeThenable(request, streamTask, entry),
              reference = serializeByValueID(entryId);
            if (done) {
              streamTask.status = 1;
              var endStreamRow =
                streamTask.id.toString(16) +
                ":C" +
                JSON.stringify(reference) +
                "\n";
              request.completedRegularChunks.push(endStreamRow);
              request.abortableTasks.delete(streamTask);
              detach();
            } else
              request.pendingChunks++,
                emitModelChunk(
                  request,
                  streamTask.id,
                  JSON.stringify(reference)
                );
            enqueueFlush(request);
          } catch (reason) {
            detach(), error(reason, void 0);
          }
      },
      close: function () {
        detach();
      },
      error: function (reason, reference) {
        detach();
        error(reason, reference);
      },
      halt: function () {
        detach();
        0 === streamTask.status &&
          (request.abortableTasks.delete(streamTask),
          haltTask(streamTask),
          3 === streamTask.status && request.pendingChunks--,
          enqueueFlush(request));
      }
    });
  });
  return serializeByValueID(streamTask.id);
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
function renderToPipeableStream(input, webpackMap, options) {
  var request = new RequestInstance(
      input,
      webpackMap,
      options ? options.onError : void 0,
      options ? options.temporaryReferences : void 0
    ),
    hasStartedFlowing = !1;
  startWork(request);
  input = options ? options.signal : void 0;
  void 0 !== input && attachAbortSignal(request, input);
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
}
function createFakeWritableFromReadableStreamController(controller) {
  return {
    write: function (chunk) {
      "string" === typeof chunk && (chunk = textEncoder.encode(chunk));
      controller.enqueue(chunk);
      return !0;
    },
    end: function () {
      controller.close();
    },
    destroy: function (error) {
      "function" === typeof controller.error
        ? controller.error(error)
        : controller.close();
    }
  };
}
function renderToReadableStream(input, webpackMap, options) {
  var request = new RequestInstance(
    input,
    webpackMap,
    options ? options.onError : void 0,
    options ? options.temporaryReferences : void 0
  );
  options && options.signal && attachAbortSignal(request, options.signal);
  var writable;
  return new ReadableStream(
    {
      type: "bytes",
      start: function (controller) {
        writable = createFakeWritableFromReadableStreamController(controller);
        startWork(request);
      },
      pull: function () {
        startFlowing(request, writable);
      },
      cancel: function (reason) {
        request.destination = null;
        abort(request, reason);
      }
    },
    { highWaterMark: 0 }
  );
}
var FunctionBind = Function.prototype.bind,
  ArraySlice = Array.prototype.slice;
function createServerReference(reference, bound) {
  var copy = FunctionBind.call(reference, null);
  registerServerReference(copy, reference.$$id, null);
  Object.defineProperties(copy, {
    $$bound: { value: bound },
    bind: { value: bindServerReference }
  });
  return copy;
}
function bindServerReference() {
  var copy = FunctionBind.apply(this, arguments),
    args = ArraySlice.call(arguments, 1),
    bound = Promise.resolve(this.$$bound).then(function (values) {
      return values.concat(args);
    });
  bound.catch(noop);
  registerServerReference(copy, this.$$id, null);
  Object.defineProperties(copy, {
    $$bound: { value: bound },
    bind: { value: bindServerReference }
  });
  return copy;
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
    maybeActionKey = null;
  body.forEach(function (value, key) {
    key.startsWith("$ACTION_")
      ? key.startsWith("$ACTION_REF_")
        ? (maybeActionKey = key)
        : key.startsWith("$ACTION_ID_") && (maybeActionKey = key)
      : formData.append(key, value);
  });
  if (null === maybeActionKey) return null;
  var actionKey = maybeActionKey,
    action = null;
  if (actionKey.startsWith("$ACTION_REF_"))
    (actionKey = "$ACTION_" + actionKey.slice(12) + ":"),
      (body = decodeBoundActionMetaData(body, serverManifest, actionKey)),
      (action = loadServerReference(serverManifest, body));
  else if (actionKey.startsWith("$ACTION_ID_"))
    (body = actionKey.slice(11)),
      (action = loadServerReference(serverManifest, { id: body, bound: null }));
  else throw Error("Cannot handle action key. This is a bug in React.");
  return action.then(function (fn) {
    return fn.bind(null, formData);
  });
};
exports.decodeFormState = function (actionResult, body, serverManifest) {
  var keyPath = body.get("$ACTION_KEY");
  if ("string" !== typeof keyPath) return Promise.resolve(null);
  var actionKey = null;
  body.forEach(function (value, key) {
    key.startsWith("$ACTION_REF_") && (actionKey = key);
  });
  if (null === actionKey) return Promise.resolve(null);
  var formFieldPrefix = "$ACTION_" + actionKey.slice(12) + ":";
  body = decodeBoundActionMetaData(body, serverManifest, formFieldPrefix);
  var referenceId = body.id;
  return Promise.resolve(body.bound).then(function (bound) {
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
    body,
    options ? options.arraySizeLimit : void 0
  );
  webpackMap = getChunk(body, 0);
  close(body);
  return webpackMap;
};
exports.decodeReplyFromAsyncIterable = function (
  iterable,
  webpackMap,
  options
) {
  function progress(entry) {
    if (entry.done) close(response);
    else {
      var _entry$value = entry.value;
      entry = _entry$value[0];
      _entry$value = _entry$value[1];
      "string" === typeof _entry$value
        ? resolveField(response, entry, _entry$value)
        : appendBackingEntry(response._formData, _entry$value, entry);
      iterator.next().then(progress, error);
    }
  }
  function error(reason) {
    reportGlobalError(response, reason);
    "function" === typeof iterator.throw &&
      iterator.throw(reason).then(noop, noop);
  }
  var iterator = iterable[ASYNC_ITERATOR](),
    response = createResponse(
      webpackMap,
      "",
      options ? options.temporaryReferences : void 0,
      void 0,
      options ? options.arraySizeLimit : void 0
    );
  iterator.next().then(progress, error);
  return getChunk(response, 0);
};
exports.decodeReplyFromBusboy = function (busboyStream, webpackMap, options) {
  function flush() {
    for (; null !== head; ) {
      var current = head;
      if (!current.complete) return;
      try {
        var key = current.name,
          JSCompiler_temp_const = response._formData;
        var handle = current.file;
        if ("function" === typeof File)
          var JSCompiler_inline_result = new File(
            handle.chunks,
            handle.filename,
            { type: handle.mime }
          );
        else {
          var scratch = new FormData();
          scratch.append(
            "file",
            new Blob(handle.chunks, { type: handle.mime }),
            handle.filename
          );
          JSCompiler_inline_result = scratch.get("file");
        }
        appendBackingEntry(
          JSCompiler_temp_const,
          JSCompiler_inline_result,
          key
        );
        var queuedFields = current.queuedFields;
        if (null !== queuedFields)
          for (var i = 0; i < queuedFields.length; i += 2)
            resolveField(response, queuedFields[i], queuedFields[i + 1]);
      } catch (error) {
        busboyStream.destroy(error);
        return;
      }
      head = current.next;
    }
    tail = null;
    bodyFinished && !closed && ((closed = !0), close(response));
  }
  var response = createResponse(
      webpackMap,
      "",
      options ? options.temporaryReferences : void 0,
      void 0,
      options ? options.arraySizeLimit : void 0
    ),
    head = null,
    tail = null,
    bodyFinished = !1,
    closed = !1;
  busboyStream.on("field", function (name, value) {
    if (null !== tail)
      null === tail.queuedFields && (tail.queuedFields = []),
        tail.queuedFields.push(name, value);
    else
      try {
        resolveField(response, name, value);
      } catch (error) {
        busboyStream.destroy(error);
      }
  });
  busboyStream.on("file", function (name, value, _ref2) {
    var filename = _ref2.filename,
      mimeType = _ref2.mimeType;
    if ("base64" === _ref2.encoding.toLowerCase())
      busboyStream.destroy(
        Error(
          "React doesn't accept base64 encoded file uploads because we don't expect form data passed from a browser to ever encode data that way. If that's the wrong assumption, we can easily fix it."
        )
      );
    else {
      var file = { chunks: [], filename: filename, mime: mimeType },
        pendingFile = {
          name: name,
          file: file,
          complete: !1,
          queuedFields: null,
          next: null
        };
      null === tail ? (head = pendingFile) : (tail.next = pendingFile);
      tail = pendingFile;
      value.on("data", function (chunk) {
        try {
          file.chunks.push(chunk);
        } catch (error) {
          busboyStream.destroy(error);
        }
      });
      value.on("error", function (error) {
        busboyStream.destroy(error);
      });
      value.on("end", function () {
        pendingFile.complete = !0;
        flush();
      });
    }
  });
  busboyStream.on("finish", function () {
    bodyFinished = !0;
    flush();
    closed ||
      reportGlobalError(
        response,
        Error("Reply finished with incomplete file part.")
      );
  });
  busboyStream.on("error", function (err) {
    reportGlobalError(response, err);
  });
  return getChunk(response, 0);
};
exports.prerender = function (model, webpackMap, options) {
  return new Promise(function (resolve, reject) {
    var request = new RequestInstance$2(
      21,
      model,
      webpackMap,
      options ? options.onError : void 0,
      function () {
        var writable,
          stream = new ReadableStream(
            {
              type: "bytes",
              start: function (controller) {
                writable =
                  createFakeWritableFromReadableStreamController$1(controller);
              },
              pull: function () {
                startFlowing$1(request, writable);
              },
              cancel: function (reason) {
                request.destination = null;
                abort$2(request, reason);
              }
            },
            { highWaterMark: 0 }
          );
        resolve({ prelude: stream });
      },
      reject,
      options ? options.identifierPrefix : void 0,
      options ? options.temporaryReferences : void 0
    );
    options && options.signal && attachAbortSignal$2(request, options.signal);
    startWork$2(request);
  });
};
exports.prerenderToNodeStream = function (model, webpackMap, options) {
  return new Promise(function (resolve, reject) {
    var request = new RequestInstance$2(
      21,
      model,
      webpackMap,
      options ? options.onError : void 0,
      function () {
        var readable = new stream.Readable({
            read: function () {
              startFlowing$1(request, writable);
            }
          }),
          writable = createFakeWritableFromNodeReadable(readable);
        resolve({ prelude: readable });
      },
      reject,
      options ? options.identifierPrefix : void 0,
      options ? options.temporaryReferences : void 0
    );
    options && options.signal && attachAbortSignal$2(request, options.signal);
    startWork$2(request);
  });
};
exports.prerenderToResult = function (model, options) {
  return new Promise(function (resolve, reject) {
    var request = createPrerenderRequest(
      model,
      function () {
        return resolve(request.result);
      },
      reject,
      options ? options.onError : void 0,
      options ? options.identifierPrefix : void 0,
      options ? options.temporaryReferences : void 0,
      createServerReference
    );
    startWork$1(request);
    (reject = options ? options.signal : void 0) &&
      attachAbortSignal$1(request, reject);
  });
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
exports.registerServerReference = registerServerReference;
exports.renderResultToPipeableStream = function (result, webpackMap, options) {
  result = createInput(result);
  return renderToPipeableStream(result, webpackMap, options);
};
exports.renderResultToReadableStream = function (result, webpackMap, options) {
  result = createInput(result);
  return renderToReadableStream(result, webpackMap, options);
};
exports.renderToPipeableStream = function (model, webpackMap, options) {
  var request = new RequestInstance$2(
      20,
      model,
      webpackMap,
      options ? options.onError : void 0,
      noop,
      noop,
      options ? options.identifierPrefix : void 0,
      options ? options.temporaryReferences : void 0
    ),
    hasStartedFlowing = !1;
  startWork$2(request);
  return {
    pipe: function (destination) {
      if (hasStartedFlowing)
        throw Error(
          "React currently only supports piping to one writable stream."
        );
      hasStartedFlowing = !0;
      startFlowing$1(request, destination);
      destination.on("drain", createDrainHandler$1(destination, request));
      destination.on(
        "error",
        createCancelHandler$1(
          request,
          "The destination stream errored while writing data."
        )
      );
      destination.on(
        "close",
        createCancelHandler$1(request, "The destination stream closed early.")
      );
      return destination;
    },
    abort: function (reason) {
      abort$2(request, reason);
    }
  };
};
exports.renderToReadableStream = function (model, webpackMap, options) {
  var request = new RequestInstance$2(
    20,
    model,
    webpackMap,
    options ? options.onError : void 0,
    noop,
    noop,
    options ? options.identifierPrefix : void 0,
    options ? options.temporaryReferences : void 0
  );
  options && options.signal && attachAbortSignal$2(request, options.signal);
  var writable;
  return new ReadableStream(
    {
      type: "bytes",
      start: function (controller) {
        writable = createFakeWritableFromReadableStreamController$1(controller);
        startWork$2(request);
      },
      pull: function () {
        startFlowing$1(request, writable);
      },
      cancel: function (reason) {
        request.destination = null;
        abort$2(request, reason);
      }
    },
    { highWaterMark: 0 }
  );
};
exports.renderToResult = function (model, options) {
  model = new RequestInstance$1(
    model,
    options ? options.onError : void 0,
    options ? options.identifierPrefix : void 0,
    options ? options.temporaryReferences : void 0,
    createServerReference,
    20,
    noop,
    noop
  );
  startWork$1(model);
  options && options.signal && attachAbortSignal$1(model, options.signal);
  return model.result;
};
