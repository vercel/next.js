/**
 * @license React
 * react-markup.react-server.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/*


 JS Implementation of MurmurHash3 (r136) (as of May 20, 2011)

 Copyright (c) 2011 Gary Court
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
*/
"use strict";
var React = require("next/dist/compiled/react-experimental"),
  ReactSharedInternalsServer =
    React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
if (!ReactSharedInternalsServer)
  throw Error(
    'The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled in any environment that runs React Server Components.'
  );
var ReactSharedInternals = { H: null, A: null, T: null, S: null };
function murmurhash3_32_gc(key, seed) {
  var remainder = key.length & 3;
  var bytes = key.length - remainder;
  var h1 = seed;
  for (seed = 0; seed < bytes; ) {
    var k1 =
      (key.charCodeAt(seed) & 255) |
      ((key.charCodeAt(++seed) & 255) << 8) |
      ((key.charCodeAt(++seed) & 255) << 16) |
      ((key.charCodeAt(++seed) & 255) << 24);
    ++seed;
    k1 =
      (3432918353 * (k1 & 65535) +
        (((3432918353 * (k1 >>> 16)) & 65535) << 16)) &
      4294967295;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 =
      (461845907 * (k1 & 65535) + (((461845907 * (k1 >>> 16)) & 65535) << 16)) &
      4294967295;
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (5 * (h1 & 65535) + (((5 * (h1 >>> 16)) & 65535) << 16)) & 4294967295;
    h1 = (h1 & 65535) + 27492 + ((((h1 >>> 16) + 58964) & 65535) << 16);
  }
  k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(seed + 2) & 255) << 16;
    case 2:
      k1 ^= (key.charCodeAt(seed + 1) & 255) << 8;
    case 1:
      (k1 ^= key.charCodeAt(seed) & 255),
        (k1 =
          (3432918353 * (k1 & 65535) +
            (((3432918353 * (k1 >>> 16)) & 65535) << 16)) &
          4294967295),
        (k1 = (k1 << 15) | (k1 >>> 17)),
        (h1 ^=
          (461845907 * (k1 & 65535) +
            (((461845907 * (k1 >>> 16)) & 65535) << 16)) &
          4294967295);
  }
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 =
    (2246822507 * (h1 & 65535) + (((2246822507 * (h1 >>> 16)) & 65535) << 16)) &
    4294967295;
  h1 ^= h1 >>> 13;
  h1 =
    (3266489909 * (h1 & 65535) + (((3266489909 * (h1 >>> 16)) & 65535) << 16)) &
    4294967295;
  return (h1 ^ (h1 >>> 16)) >>> 0;
}
var CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference"),
  SERVER_REFERENCE_TAG = Symbol.for("react.server.reference"),
  TEMPORARY_REFERENCE_TAG = Symbol.for("react.temporary.reference"),
  REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"),
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_PORTAL_TYPE = Symbol.for("react.portal"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
  REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"),
  REACT_PROFILER_TYPE = Symbol.for("react.profiler"),
  REACT_PROVIDER_TYPE = Symbol.for("react.provider"),
  REACT_CONSUMER_TYPE = Symbol.for("react.consumer"),
  REACT_CONTEXT_TYPE = Symbol.for("react.context"),
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
  REACT_MEMO_TYPE = Symbol.for("react.memo"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
  REACT_SCOPE_TYPE = Symbol.for("react.scope"),
  REACT_DEBUG_TRACING_MODE_TYPE = Symbol.for("react.debug_trace_mode"),
  REACT_OFFSCREEN_TYPE = Symbol.for("react.offscreen"),
  REACT_LEGACY_HIDDEN_TYPE = Symbol.for("react.legacy_hidden"),
  REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel"),
  REACT_POSTPONE_TYPE = Symbol.for("react.postpone"),
  MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
function getIteratorFn(maybeIterable) {
  if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
  maybeIterable =
    (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
    maybeIterable["@@iterator"];
  return "function" === typeof maybeIterable ? maybeIterable : null;
}
var ASYNC_ITERATOR = Symbol.asyncIterator,
  SuspenseException$1 = Error(
    "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`"
  );
function noop$4() {}
function trackUsedThenable$1(thenableState, thenable, index) {
  index = thenableState[index];
  void 0 === index
    ? thenableState.push(thenable)
    : index !== thenable && (thenable.then(noop$4, noop$4), (thenable = index));
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      throw thenable.reason;
    default:
      "string" === typeof thenable.status
        ? thenable.then(noop$4, noop$4)
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
      suspendedThenable$1 = thenable;
      throw SuspenseException$1;
  }
}
var suspendedThenable$1 = null;
function getSuspendedThenable$1() {
  if (null === suspendedThenable$1)
    throw Error(
      "Expected a suspended thenable. This is a bug in React. Please file an issue."
    );
  var thenable = suspendedThenable$1;
  suspendedThenable$1 = null;
  return thenable;
}
var currentRequest$1 = null,
  thenableIndexCounter$1 = 0,
  thenableState$1 = null;
function getThenableStateAfterSuspending$1() {
  var state = thenableState$1 || [];
  thenableState$1 = null;
  return state;
}
var HooksDispatcher$1 = {
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
  useId: useId$1,
  useSyncExternalStore: unsupportedHook,
  useCacheRefresh: function () {
    return unsupportedRefresh$1;
  },
  useMemoCache: function (size) {
    for (var data = Array(size), i = 0; i < size; i++)
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    return data;
  },
  use: use$1
};
function unsupportedHook() {
  throw Error("This Hook is not supported in Server Components.");
}
function unsupportedRefresh$1() {
  throw Error("Refreshing the cache is not supported in Server Components.");
}
function unsupportedContext() {
  throw Error("Cannot read a Client Context from a Server Component.");
}
function useId$1() {
  if (null === currentRequest$1)
    throw Error("useId can only be used while React is rendering");
  var id = currentRequest$1.identifierCount++;
  return ":" + currentRequest$1.identifierPrefix + "S" + id.toString(32) + ":";
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
      return trackUsedThenable$1(thenableState$1, usable, index);
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
var DefaultAsyncDispatcher$1 = {
    getCacheForType: function (resourceType) {
      var JSCompiler_inline_result = (JSCompiler_inline_result = currentRequest
        ? currentRequest
        : null)
        ? JSCompiler_inline_result.cache
        : new Map();
      var entry = JSCompiler_inline_result.get(resourceType);
      void 0 === entry &&
        ((entry = resourceType()),
        JSCompiler_inline_result.set(resourceType, entry));
      return entry;
    }
  },
  assign = Object.assign,
  prefix,
  suffix;
function describeBuiltInComponentFrame(name) {
  if (void 0 === prefix)
    try {
      throw Error();
    } catch (x) {
      var match = x.stack.trim().match(/\n( *(at )?)/);
      prefix = (match && match[1]) || "";
      suffix =
        -1 < x.stack.indexOf("\n    at")
          ? " (<anonymous>)"
          : -1 < x.stack.indexOf("@")
            ? "@unknown:0:0"
            : "";
    }
  return "\n" + prefix + name + suffix;
}
var reentry = !1;
function describeNativeComponentFrame(fn, construct) {
  if (!fn || reentry) return "";
  reentry = !0;
  var previousPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = void 0;
  var RunInRootFrame = {
    DetermineComponentFrameRoot: function () {
      try {
        if (construct) {
          var Fake = function () {
            throw Error();
          };
          Object.defineProperty(Fake.prototype, "props", {
            set: function () {
              throw Error();
            }
          });
          if ("object" === typeof Reflect && Reflect.construct) {
            try {
              Reflect.construct(Fake, []);
            } catch (x) {
              var control = x;
            }
            Reflect.construct(fn, [], Fake);
          } else {
            try {
              Fake.call();
            } catch (x$3) {
              control = x$3;
            }
            fn.call(Fake.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (x$4) {
            control = x$4;
          }
          (Fake = fn()) &&
            "function" === typeof Fake.catch &&
            Fake.catch(function () {});
        }
      } catch (sample) {
        if (sample && control && "string" === typeof sample.stack)
          return [sample.stack, control.stack];
      }
      return [null, null];
    }
  };
  RunInRootFrame.DetermineComponentFrameRoot.displayName =
    "DetermineComponentFrameRoot";
  var namePropDescriptor = Object.getOwnPropertyDescriptor(
    RunInRootFrame.DetermineComponentFrameRoot,
    "name"
  );
  namePropDescriptor &&
    namePropDescriptor.configurable &&
    Object.defineProperty(RunInRootFrame.DetermineComponentFrameRoot, "name", {
      value: "DetermineComponentFrameRoot"
    });
  try {
    var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(),
      sampleStack = _RunInRootFrame$Deter[0],
      controlStack = _RunInRootFrame$Deter[1];
    if (sampleStack && controlStack) {
      var sampleLines = sampleStack.split("\n"),
        controlLines = controlStack.split("\n");
      for (
        namePropDescriptor = RunInRootFrame = 0;
        RunInRootFrame < sampleLines.length &&
        !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot");

      )
        RunInRootFrame++;
      for (
        ;
        namePropDescriptor < controlLines.length &&
        !controlLines[namePropDescriptor].includes(
          "DetermineComponentFrameRoot"
        );

      )
        namePropDescriptor++;
      if (
        RunInRootFrame === sampleLines.length ||
        namePropDescriptor === controlLines.length
      )
        for (
          RunInRootFrame = sampleLines.length - 1,
            namePropDescriptor = controlLines.length - 1;
          1 <= RunInRootFrame &&
          0 <= namePropDescriptor &&
          sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor];

        )
          namePropDescriptor--;
      for (
        ;
        1 <= RunInRootFrame && 0 <= namePropDescriptor;
        RunInRootFrame--, namePropDescriptor--
      )
        if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
          if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
            do
              if (
                (RunInRootFrame--,
                namePropDescriptor--,
                0 > namePropDescriptor ||
                  sampleLines[RunInRootFrame] !==
                    controlLines[namePropDescriptor])
              ) {
                var frame =
                  "\n" +
                  sampleLines[RunInRootFrame].replace(" at new ", " at ");
                fn.displayName &&
                  frame.includes("<anonymous>") &&
                  (frame = frame.replace("<anonymous>", fn.displayName));
                return frame;
              }
            while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
          }
          break;
        }
    }
  } finally {
    (reentry = !1), (Error.prepareStackTrace = previousPrepareStackTrace);
  }
  return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "")
    ? describeBuiltInComponentFrame(previousPrepareStackTrace)
    : "";
}
var isArrayImpl = Array.isArray,
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
var ObjectPrototype$1 = Object.prototype,
  stringify = JSON.stringify,
  TaintRegistryObjects = ReactSharedInternalsServer.TaintRegistryObjects,
  TaintRegistryValues = ReactSharedInternalsServer.TaintRegistryValues,
  TaintRegistryByteLengths =
    ReactSharedInternalsServer.TaintRegistryByteLengths,
  TaintRegistryPendingRequests =
    ReactSharedInternalsServer.TaintRegistryPendingRequests;
function throwTaintViolation(message) {
  throw Error(message);
}
function cleanupTaintQueue(request) {
  request = request.taintCleanupQueue;
  TaintRegistryPendingRequests.delete(request);
  for (var i = 0; i < request.length; i++) {
    var entryValue = request[i],
      entry = TaintRegistryValues.get(entryValue);
    void 0 !== entry &&
      (1 === entry.count
        ? TaintRegistryValues.delete(entryValue)
        : entry.count--);
  }
  request.length = 0;
}
function defaultErrorHandler$1(error) {
  console.error(error);
}
function defaultPostponeHandler() {}
function RequestInstance$1(
  model,
  bundlerConfig,
  onError,
  identifierPrefix,
  onPostpone,
  temporaryReferences,
  environmentName,
  filterStackFrame,
  onAllReady,
  onFatalError
) {
  if (
    null !== ReactSharedInternalsServer.A &&
    ReactSharedInternalsServer.A !== DefaultAsyncDispatcher$1
  )
    throw Error("Currently React only supports one RSC renderer at a time.");
  ReactSharedInternalsServer.A = DefaultAsyncDispatcher$1;
  filterStackFrame = new Set();
  environmentName = [];
  var cleanupQueue = [];
  TaintRegistryPendingRequests.add(cleanupQueue);
  this.status = 0;
  this.flushScheduled = !1;
  this.destination = this.fatalError = null;
  this.bundlerConfig = bundlerConfig;
  this.cache = new Map();
  this.pendingChunks = this.nextChunkId = 0;
  this.hints = null;
  this.abortListeners = new Set();
  this.abortableTasks = filterStackFrame;
  this.pingedTasks = environmentName;
  this.completedImportChunks = [];
  this.completedHintChunks = [];
  this.completedRegularChunks = [];
  this.completedErrorChunks = [];
  this.writtenSymbols = new Map();
  this.writtenClientReferences = new Map();
  this.writtenServerReferences = new Map();
  this.writtenObjects = new WeakMap();
  this.temporaryReferences = temporaryReferences;
  this.identifierPrefix = identifierPrefix || "";
  this.identifierCount = 1;
  this.taintCleanupQueue = cleanupQueue;
  this.onError = void 0 === onError ? defaultErrorHandler$1 : onError;
  this.onPostpone = void 0 === onPostpone ? defaultPostponeHandler : onPostpone;
  this.onAllReady = void 0 === onAllReady ? noop$3 : onAllReady;
  this.onFatalError = void 0 === onFatalError ? noop$3 : onFatalError;
  model = createTask(this, model, null, !1, filterStackFrame);
  environmentName.push(model);
}
function noop$3() {}
var currentRequest = null;
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
        (newTask.model = thenable.value),
        pingTask$1(request, newTask),
        newTask.id
      );
    case "rejected":
      return (
        (task = thenable.reason),
        "object" === typeof task &&
        null !== task &&
        task.$$typeof === REACT_POSTPONE_TYPE
          ? (logPostpone$1(request, task.message, newTask),
            emitPostponeChunk(request, newTask.id))
          : ((task = logRecoverableError$1(request, task, null)),
            emitErrorChunk(request, newTask.id, task)),
        (newTask.status = 4),
        request.abortableTasks.delete(newTask),
        newTask.id
      );
    default:
      if (1 === request.status)
        return (
          (newTask.status = 3),
          (task = stringify(serializeByValueID$1(request.fatalError))),
          emitModelChunk(request, newTask.id, task),
          request.abortableTasks.delete(newTask),
          newTask.id
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
  }
  thenable.then(
    function (value) {
      newTask.model = value;
      pingTask$1(request, newTask);
    },
    function (reason) {
      "object" === typeof reason &&
      null !== reason &&
      reason.$$typeof === REACT_POSTPONE_TYPE
        ? (logPostpone$1(request, reason.message, newTask),
          emitPostponeChunk(request, newTask.id))
        : ((reason = logRecoverableError$1(request, reason, newTask)),
          emitErrorChunk(request, newTask.id, reason));
      newTask.status = 4;
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
        } catch (x$11) {
          error(x$11);
        }
  }
  function error(reason) {
    if (!aborted) {
      aborted = !0;
      request.abortListeners.delete(error);
      if (
        "object" === typeof reason &&
        null !== reason &&
        reason.$$typeof === REACT_POSTPONE_TYPE
      )
        logPostpone$1(request, reason.message, streamTask),
          emitPostponeChunk(request, streamTask.id);
      else {
        var digest = logRecoverableError$1(request, reason, streamTask);
        emitErrorChunk(request, streamTask.id, digest);
      }
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
  return serializeByValueID$1(streamTask.id);
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
              stringify(serializeByValueID$1(chunkId)) +
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
        } catch (x$12) {
          error(x$12);
        }
  }
  function error(reason) {
    if (!aborted) {
      aborted = !0;
      request.abortListeners.delete(error);
      if (
        "object" === typeof reason &&
        null !== reason &&
        reason.$$typeof === REACT_POSTPONE_TYPE
      )
        logPostpone$1(request, reason.message, streamTask),
          emitPostponeChunk(request, streamTask.id);
      else {
        var digest = logRecoverableError$1(request, reason, streamTask);
        emitErrorChunk(request, streamTask.id, digest);
      }
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
  return serializeByValueID$1(streamTask.id);
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
function voidHandler() {}
function renderFunctionComponent$1(request, task, key, Component, props) {
  var prevThenableState = task.thenableState;
  task.thenableState = null;
  thenableIndexCounter$1 = 0;
  thenableState$1 = prevThenableState;
  Component = Component(props, void 0);
  if (1 === request.status)
    throw (
      ("object" === typeof Component &&
        null !== Component &&
        "function" === typeof Component.then &&
        Component.$$typeof !== CLIENT_REFERENCE_TAG$1 &&
        Component.then(voidHandler, voidHandler),
      null)
    );
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
      var iterableChild$13 = Component;
      Component = {};
      Component =
        ((Component[ASYNC_ITERATOR] = function () {
          return iterableChild$13[ASYNC_ITERATOR]();
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
function renderElement$1(request, task, type, key, ref, props) {
  if (null !== ref && void 0 !== ref)
    throw Error(
      "Refs cannot be used in Server Components, nor passed to Client Components."
    );
  if (
    "function" === typeof type &&
    type.$$typeof !== CLIENT_REFERENCE_TAG$1 &&
    type.$$typeof !== TEMPORARY_REFERENCE_TAG
  )
    return renderFunctionComponent$1(request, task, key, type, props);
  if (type === REACT_FRAGMENT_TYPE && null === key)
    return (
      (type = task.implicitSlot),
      null === task.keyPath && (task.implicitSlot = !0),
      (props = renderModelDestructive(
        request,
        task,
        emptyRoot,
        "",
        props.children
      )),
      (task.implicitSlot = type),
      props
    );
  if (
    null != type &&
    "object" === typeof type &&
    type.$$typeof !== CLIENT_REFERENCE_TAG$1
  )
    switch (type.$$typeof) {
      case REACT_LAZY_TYPE:
        var init = type._init;
        type = init(type._payload);
        if (1 === request.status) throw null;
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
  request = key;
  key = task.keyPath;
  null === request
    ? (request = key)
    : null !== key && (request = key + "," + request);
  props = [REACT_ELEMENT_TYPE, type, request, props];
  task = task.implicitSlot && null !== request ? [props] : props;
  return task;
}
function pingTask$1(request, task) {
  var pingedTasks = request.pingedTasks;
  pingedTasks.push(task);
  1 === pingedTasks.length &&
    ((request.flushScheduled = null !== request.destination),
    performWork$1(request));
}
function createTask(request, model, keyPath, implicitSlot, abortSet) {
  request.pendingChunks++;
  var id = request.nextChunkId++;
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
    ping: function () {
      return pingTask$1(request, task);
    },
    toJSON: function (parentPropertyName, value) {
      return renderModel(request, task, this, parentPropertyName, value);
    },
    thenableState: null
  };
  abortSet.add(task);
  return task;
}
function serializeByValueID$1(id) {
  return "$" + id.toString(16);
}
function encodeReferenceChunk(request, id, reference) {
  request = stringify(reference);
  return id.toString(16) + ":" + request + "\n";
}
function serializeClientReference() {
  throw Error(
    "Attempted to render a Client Component from renderToHTML. This is not supported since it will never hydrate. Only render Server Components with renderToHTML."
  );
}
function outlineModel(request, value) {
  value = createTask(request, value, null, !1, request.abortableTasks);
  retryTask$1(request, value);
  return value.id;
}
function serializeTypedArray(request, tag, typedArray) {
  request.pendingChunks++;
  var bufferId = request.nextChunkId++;
  emitTypedArrayChunk(request, bufferId, tag, typedArray);
  return serializeByValueID$1(bufferId);
}
function serializeBlob(request, blob) {
  function progress(entry) {
    if (!aborted)
      if (entry.done)
        request.abortListeners.delete(error),
          (aborted = !0),
          pingTask$1(request, newTask);
      else
        return (
          model.push(entry.value), reader.read().then(progress).catch(error)
        );
  }
  function error(reason) {
    if (!aborted) {
      aborted = !0;
      request.abortListeners.delete(error);
      var digest = logRecoverableError$1(request, reason, newTask);
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
function renderModel(request, task, parent, key, value) {
  var prevKeyPath = task.keyPath,
    prevImplicitSlot = task.implicitSlot;
  try {
    return renderModelDestructive(request, task, parent, key, value);
  } catch (thrownValue) {
    parent = task.model;
    parent =
      "object" === typeof parent &&
      null !== parent &&
      (parent.$$typeof === REACT_ELEMENT_TYPE ||
        parent.$$typeof === REACT_LAZY_TYPE);
    key =
      thrownValue === SuspenseException$1
        ? getSuspendedThenable$1()
        : thrownValue;
    if ("object" === typeof key && null !== key) {
      if ("function" === typeof key.then) {
        if (1 === request.status)
          return (
            (task.status = 3),
            (task = request.fatalError),
            parent ? "$L" + task.toString(16) : serializeByValueID$1(task)
          );
        request = createTask(
          request,
          task.model,
          task.keyPath,
          task.implicitSlot,
          request.abortableTasks
        );
        value = request.ping;
        key.then(value, value);
        request.thenableState = getThenableStateAfterSuspending$1();
        task.keyPath = prevKeyPath;
        task.implicitSlot = prevImplicitSlot;
        return parent
          ? "$L" + request.id.toString(16)
          : serializeByValueID$1(request.id);
      }
      if (key.$$typeof === REACT_POSTPONE_TYPE)
        return (
          request.pendingChunks++,
          (value = request.nextChunkId++),
          logPostpone$1(request, key.message, task),
          emitPostponeChunk(request, value),
          (task.keyPath = prevKeyPath),
          (task.implicitSlot = prevImplicitSlot),
          parent ? "$L" + value.toString(16) : serializeByValueID$1(value)
        );
    }
    if (1 === request.status)
      return (
        (task.status = 3),
        (task = request.fatalError),
        parent ? "$L" + task.toString(16) : serializeByValueID$1(task)
      );
    task.keyPath = prevKeyPath;
    task.implicitSlot = prevImplicitSlot;
    request.pendingChunks++;
    prevKeyPath = request.nextChunkId++;
    task = logRecoverableError$1(request, key, task);
    emitErrorChunk(request, prevKeyPath, task);
    return parent
      ? "$L" + prevKeyPath.toString(16)
      : serializeByValueID$1(prevKeyPath);
  }
}
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
        var elementReference = null,
          writtenObjects = request.writtenObjects;
        if (null === task.keyPath && !task.implicitSlot) {
          var existingReference = writtenObjects.get(value);
          if (void 0 !== existingReference)
            if (modelRoot === value) modelRoot = null;
            else return existingReference;
          else
            -1 === parentPropertyName.indexOf(":") &&
              ((parent = writtenObjects.get(parent)),
              void 0 !== parent &&
                ((elementReference = parent + ":" + parentPropertyName),
                writtenObjects.set(value, elementReference)));
        }
        parentPropertyName = value.props;
        parent = parentPropertyName.ref;
        value = renderElement$1(
          request,
          task,
          value.type,
          value.key,
          void 0 !== parent ? parent : null,
          parentPropertyName
        );
        "object" === typeof value &&
          null !== value &&
          null !== elementReference &&
          (writtenObjects.has(value) ||
            writtenObjects.set(value, elementReference));
        return value;
      case REACT_LAZY_TYPE:
        task.thenableState = null;
        parentPropertyName = value._init;
        value = parentPropertyName(value._payload);
        if (1 === request.status) throw null;
        return renderModelDestructive(request, task, emptyRoot, "", value);
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
      ((elementReference = request.temporaryReferences.get(value)),
      void 0 !== elementReference)
    )
      return "$T" + elementReference;
    elementReference = TaintRegistryObjects.get(value);
    void 0 !== elementReference && throwTaintViolation(elementReference);
    elementReference = request.writtenObjects;
    writtenObjects = elementReference.get(value);
    if ("function" === typeof value.then) {
      if (void 0 !== writtenObjects) {
        if (null !== task.keyPath || task.implicitSlot)
          return "$@" + serializeThenable(request, task, value).toString(16);
        if (modelRoot === value) modelRoot = null;
        else return writtenObjects;
      }
      request = "$@" + serializeThenable(request, task, value).toString(16);
      elementReference.set(value, request);
      return request;
    }
    if (void 0 !== writtenObjects)
      if (modelRoot === value) modelRoot = null;
      else return writtenObjects;
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
        }
      elementReference.set(value, writtenObjects + ":" + existingReference);
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
    if ((elementReference = getIteratorFn(value)))
      return (
        (parentPropertyName = elementReference.call(value)),
        parentPropertyName === value
          ? "$i" +
            outlineModel(request, Array.from(parentPropertyName)).toString(16)
          : renderFragment(request, task, Array.from(parentPropertyName))
      );
    if ("function" === typeof ReadableStream && value instanceof ReadableStream)
      return serializeReadableStream(request, task, value);
    elementReference = value[ASYNC_ITERATOR];
    if ("function" === typeof elementReference)
      return (
        null !== task.keyPath
          ? ((value = [
              REACT_ELEMENT_TYPE,
              REACT_FRAGMENT_TYPE,
              task.keyPath,
              { children: value }
            ]),
            (value = task.implicitSlot ? [value] : value))
          : ((parentPropertyName = elementReference.call(value)),
            (value = serializeAsyncIterable(
              request,
              task,
              value,
              parentPropertyName
            ))),
        value
      );
    request = getPrototypeOf(value);
    if (
      request !== ObjectPrototype$1 &&
      (null === request || null !== getPrototypeOf(request))
    )
      throw Error(
        "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    return value;
  }
  if ("string" === typeof value) {
    request = TaintRegistryValues.get(value);
    void 0 !== request && throwTaintViolation(request.message);
    if (
      "Z" === value[value.length - 1] &&
      parent[parentPropertyName] instanceof Date
    )
      return "$D" + value;
    value = "$" === value[0] ? "$" + value : value;
    return value;
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
    if (value.$$typeof === SERVER_REFERENCE_TAG) {
      value = request.writtenServerReferences.get(value);
      if (void 0 !== value) value = "$F" + value.toString(16);
      else
        throw Error(
          "Attempted to render a Server Action from renderToHTML. This is not supported since it varies by version of the app. Use a fixed URL for any forms instead."
        );
      return value;
    }
    if (
      void 0 !== request.temporaryReferences &&
      ((request = request.temporaryReferences.get(value)), void 0 !== request)
    )
      return "$T" + request;
    request = TaintRegistryObjects.get(value);
    void 0 !== request && throwTaintViolation(request);
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
    parent = encodeReferenceChunk(
      request,
      parentPropertyName,
      "$S" + elementReference
    );
    request.completedImportChunks.push(parent);
    task.set(value, parentPropertyName);
    return serializeByValueID$1(parentPropertyName);
  }
  if ("bigint" === typeof value)
    return (
      (request = TaintRegistryValues.get(value)),
      void 0 !== request && throwTaintViolation(request.message),
      "$n" + value.toString(10)
    );
  throw Error(
    "Type " +
      typeof value +
      " is not supported in Client Component props." +
      describeObjectForErrorMessage(parent, parentPropertyName)
  );
}
function logPostpone$1(request, reason) {
  var prevRequest = currentRequest;
  currentRequest = null;
  try {
    var onPostpone = request.onPostpone;
    onPostpone(reason);
  } finally {
    currentRequest = prevRequest;
  }
}
function logRecoverableError$1(request, error) {
  var prevRequest = currentRequest;
  currentRequest = null;
  try {
    var onError = request.onError;
    var errorDigest = onError(error);
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
function fatalError$1(request, error) {
  var onFatalError = request.onFatalError;
  onFatalError(error);
  cleanupTaintQueue(request);
  null !== request.destination
    ? ((request.status = 3), request.destination.destroy(error))
    : ((request.status = 2), (request.fatalError = error));
}
function emitPostponeChunk(request, id) {
  id = id.toString(16) + ":P\n";
  request.completedErrorChunks.push(id);
}
function emitErrorChunk(request, id, digest) {
  digest = { digest: digest };
  id = id.toString(16) + ":E" + stringify(digest) + "\n";
  request.completedErrorChunks.push(id);
}
function emitModelChunk(request, id, json) {
  id = id.toString(16) + ":" + json + "\n";
  request.completedRegularChunks.push(id);
}
function emitTypedArrayChunk(request, id, tag, typedArray) {
  TaintRegistryByteLengths.has(typedArray.byteLength) &&
    ((id = TaintRegistryValues.get(
      String.fromCharCode.apply(
        String,
        new Uint8Array(
          typedArray.buffer,
          typedArray.byteOffset,
          typedArray.byteLength
        )
      )
    )),
    void 0 !== id && throwTaintViolation(id.message));
  request.pendingChunks++;
  throw Error("Not implemented.");
}
function emitChunk(request, task, value) {
  var id = task.id;
  value instanceof ArrayBuffer
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
                              emitModelChunk(request, task.id, value));
}
var emptyRoot = {};
function retryTask$1(request, task) {
  if (0 === task.status) {
    task.status = 5;
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
        request.writtenObjects.set(
          resolvedModel,
          serializeByValueID$1(task.id)
        ),
          emitChunk(request, task, resolvedModel);
      else {
        var json = stringify(resolvedModel);
        emitModelChunk(request, task.id, json);
      }
      request.abortableTasks.delete(task);
      task.status = 1;
    } catch (thrownValue) {
      var x =
        thrownValue === SuspenseException$1
          ? getSuspendedThenable$1()
          : thrownValue;
      if ("object" === typeof x && null !== x) {
        if ("function" === typeof x.then) {
          if (1 === request.status) {
            request.abortableTasks.delete(task);
            task.status = 3;
            var model = stringify(serializeByValueID$1(request.fatalError));
            emitModelChunk(request, task.id, model);
            return;
          }
          task.status = 0;
          task.thenableState = getThenableStateAfterSuspending$1();
          var ping = task.ping;
          x.then(ping, ping);
          return;
        }
        if (x.$$typeof === REACT_POSTPONE_TYPE) {
          request.abortableTasks.delete(task);
          task.status = 4;
          logPostpone$1(request, x.message, task);
          emitPostponeChunk(request, task.id);
          return;
        }
      }
      if (1 === request.status) {
        request.abortableTasks.delete(task);
        task.status = 3;
        var model$25 = stringify(serializeByValueID$1(request.fatalError));
        emitModelChunk(request, task.id, model$25);
      } else {
        request.abortableTasks.delete(task);
        task.status = 4;
        var digest = logRecoverableError$1(request, x, task);
        emitErrorChunk(request, task.id, digest);
      }
    } finally {
    }
  }
}
function performWork$1(request) {
  var prevDispatcher = ReactSharedInternalsServer.H;
  ReactSharedInternalsServer.H = HooksDispatcher$1;
  var prevRequest = currentRequest;
  currentRequest$1 = currentRequest = request;
  try {
    var pingedTasks = request.pingedTasks;
    request.pingedTasks = [];
    for (var i = 0; i < pingedTasks.length; i++)
      retryTask$1(request, pingedTasks[i]);
    null !== request.destination &&
      flushCompletedChunks(request, request.destination);
    if (0 === request.abortableTasks.size) {
      var onAllReady = request.onAllReady;
      onAllReady();
    }
  } catch (error) {
    logRecoverableError$1(request, error, null), fatalError$1(request, error);
  } finally {
    (ReactSharedInternalsServer.H = prevDispatcher),
      (currentRequest$1 = null),
      (currentRequest = prevRequest);
  }
}
function flushCompletedChunks(request, destination) {
  try {
    for (
      var importsChunks = request.completedImportChunks, i = 0;
      i < importsChunks.length;
      i++
    )
      if ((request.pendingChunks--, !destination.push(importsChunks[i]))) {
        request.destination = null;
        i++;
        break;
      }
    importsChunks.splice(0, i);
    var hintChunks = request.completedHintChunks;
    for (i = 0; i < hintChunks.length; i++)
      if (!destination.push(hintChunks[i])) {
        request.destination = null;
        i++;
        break;
      }
    hintChunks.splice(0, i);
    var regularChunks = request.completedRegularChunks;
    for (i = 0; i < regularChunks.length; i++)
      if ((request.pendingChunks--, !destination.push(regularChunks[i]))) {
        request.destination = null;
        i++;
        break;
      }
    regularChunks.splice(0, i);
    var errorChunks = request.completedErrorChunks;
    for (i = 0; i < errorChunks.length; i++)
      if ((request.pendingChunks--, !destination.push(errorChunks[i]))) {
        request.destination = null;
        i++;
        break;
      }
    errorChunks.splice(0, i);
  } finally {
    request.flushScheduled = !1;
  }
  0 === request.pendingChunks &&
    (cleanupTaintQueue(request),
    (request.status = 3),
    destination.push(null),
    (request.destination = null));
}
function enqueueFlush(request) {
  if (
    !1 === request.flushScheduled &&
    0 === request.pingedTasks.length &&
    null !== request.destination
  ) {
    request.flushScheduled = !1;
    var destination = request.destination;
    destination && flushCompletedChunks(request, destination);
  }
}
function abort$1(request, reason) {
  try {
    0 === request.status && (request.status = 1);
    var abortableTasks = request.abortableTasks;
    if (0 < abortableTasks.size) {
      request.pendingChunks++;
      var errorId = request.nextChunkId++;
      request.fatalError = errorId;
      if (
        "object" === typeof reason &&
        null !== reason &&
        reason.$$typeof === REACT_POSTPONE_TYPE
      )
        logPostpone$1(request, reason.message, null),
          emitPostponeChunk(request, errorId, reason);
      else {
        var error =
            void 0 === reason
              ? Error("The render was aborted by the server without a reason.")
              : "object" === typeof reason &&
                  null !== reason &&
                  "function" === typeof reason.then
                ? Error("The render was aborted by the server with a promise.")
                : reason,
          digest = logRecoverableError$1(request, error, null);
        emitErrorChunk(request, errorId, digest, error);
      }
      abortableTasks.forEach(function (task) {
        if (5 !== task.status) {
          task.status = 3;
          var ref = serializeByValueID$1(errorId);
          task = encodeReferenceChunk(request, task.id, ref);
          request.completedErrorChunks.push(task);
        }
      });
      abortableTasks.clear();
    }
    var abortListeners = request.abortListeners;
    if (0 < abortListeners.size) {
      var error$32 =
        "object" === typeof reason &&
        null !== reason &&
        reason.$$typeof === REACT_POSTPONE_TYPE
          ? Error("The render was aborted due to being postponed.")
          : void 0 === reason
            ? Error("The render was aborted by the server without a reason.")
            : "object" === typeof reason &&
                null !== reason &&
                "function" === typeof reason.then
              ? Error("The render was aborted by the server with a promise.")
              : reason;
      abortListeners.forEach(function (callback) {
        return callback(error$32);
      });
      abortListeners.clear();
    }
    null !== request.destination &&
      flushCompletedChunks(request, request.destination);
  } catch (error$33) {
    logRecoverableError$1(request, error$33, null),
      fatalError$1(request, error$33);
  }
}
var bind$1 = Function.prototype.bind,
  ObjectPrototype = Object.prototype,
  knownServerReferences = new WeakMap();
function serializeNumber(number) {
  return Number.isFinite(number)
    ? 0 === number && -Infinity === 1 / number
      ? "$-0"
      : number
    : Infinity === number
      ? "$Infinity"
      : -Infinity === number
        ? "$-Infinity"
        : "$NaN";
}
function processReply(
  root,
  formFieldPrefix,
  temporaryReferences,
  resolve,
  reject
) {
  function serializeTypedArray(tag, typedArray) {
    typedArray = new Blob([
      new Uint8Array(
        typedArray.buffer,
        typedArray.byteOffset,
        typedArray.byteLength
      )
    ]);
    var blobId = nextPartId++;
    null === formData && (formData = new FormData());
    formData.append(formFieldPrefix + blobId, typedArray);
    return "$" + tag + blobId.toString(16);
  }
  function serializeBinaryReader(reader) {
    function progress(entry) {
      entry.done
        ? ((entry = nextPartId++),
          data.append(formFieldPrefix + entry, new Blob(buffer)),
          data.append(
            formFieldPrefix + streamId,
            '"$o' + entry.toString(16) + '"'
          ),
          data.append(formFieldPrefix + streamId, "C"),
          pendingParts--,
          0 === pendingParts && resolve(data))
        : (buffer.push(entry.value),
          reader.read(new Uint8Array(1024)).then(progress, reject));
    }
    null === formData && (formData = new FormData());
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++,
      buffer = [];
    reader.read(new Uint8Array(1024)).then(progress, reject);
    return "$r" + streamId.toString(16);
  }
  function serializeReader(reader) {
    function progress(entry) {
      if (entry.done)
        data.append(formFieldPrefix + streamId, "C"),
          pendingParts--,
          0 === pendingParts && resolve(data);
      else
        try {
          var partJSON = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, partJSON);
          reader.read().then(progress, reject);
        } catch (x) {
          reject(x);
        }
    }
    null === formData && (formData = new FormData());
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;
    reader.read().then(progress, reject);
    return "$R" + streamId.toString(16);
  }
  function serializeReadableStream(stream) {
    try {
      var binaryReader = stream.getReader({ mode: "byob" });
    } catch (x) {
      return serializeReader(stream.getReader());
    }
    return serializeBinaryReader(binaryReader);
  }
  function serializeAsyncIterable(iterable, iterator) {
    function progress(entry) {
      if (entry.done) {
        if (void 0 === entry.value)
          data.append(formFieldPrefix + streamId, "C");
        else
          try {
            var partJSON = JSON.stringify(entry.value, resolveToJSON);
            data.append(formFieldPrefix + streamId, "C" + partJSON);
          } catch (x) {
            reject(x);
            return;
          }
        pendingParts--;
        0 === pendingParts && resolve(data);
      } else
        try {
          var partJSON$34 = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, partJSON$34);
          iterator.next().then(progress, reject);
        } catch (x$35) {
          reject(x$35);
        }
    }
    null === formData && (formData = new FormData());
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;
    iterable = iterable === iterator;
    iterator.next().then(progress, reject);
    return "$" + (iterable ? "x" : "X") + streamId.toString(16);
  }
  function resolveToJSON(key, value) {
    if (null === value) return null;
    if ("object" === typeof value) {
      switch (value.$$typeof) {
        case REACT_ELEMENT_TYPE:
          if (void 0 !== temporaryReferences && -1 === key.indexOf(":")) {
            var parentReference = writtenObjects.get(this);
            if (void 0 !== parentReference)
              return (
                temporaryReferences.set(parentReference + ":" + key, value),
                "$T"
              );
          }
          throw Error(
            "React Element cannot be passed to Server Functions from the Client without a temporary reference set. Pass a TemporaryReferenceSet to the options."
          );
        case REACT_LAZY_TYPE:
          parentReference = value._payload;
          var init = value._init;
          null === formData && (formData = new FormData());
          pendingParts++;
          try {
            var resolvedModel = init(parentReference),
              lazyId = nextPartId++,
              partJSON = serializeModel(resolvedModel, lazyId);
            formData.append(formFieldPrefix + lazyId, partJSON);
            return "$" + lazyId.toString(16);
          } catch (x) {
            if (
              "object" === typeof x &&
              null !== x &&
              "function" === typeof x.then
            ) {
              pendingParts++;
              var lazyId$36 = nextPartId++;
              parentReference = function () {
                try {
                  var partJSON$37 = serializeModel(value, lazyId$36),
                    data$38 = formData;
                  data$38.append(formFieldPrefix + lazyId$36, partJSON$37);
                  pendingParts--;
                  0 === pendingParts && resolve(data$38);
                } catch (reason) {
                  reject(reason);
                }
              };
              x.then(parentReference, parentReference);
              return "$" + lazyId$36.toString(16);
            }
            reject(x);
            return null;
          } finally {
            pendingParts--;
          }
      }
      if ("function" === typeof value.then) {
        null === formData && (formData = new FormData());
        pendingParts++;
        var promiseId = nextPartId++;
        value.then(function (partValue) {
          try {
            var partJSON$40 = serializeModel(partValue, promiseId);
            partValue = formData;
            partValue.append(formFieldPrefix + promiseId, partJSON$40);
            pendingParts--;
            0 === pendingParts && resolve(partValue);
          } catch (reason) {
            reject(reason);
          }
        }, reject);
        return "$@" + promiseId.toString(16);
      }
      parentReference = writtenObjects.get(value);
      if (void 0 !== parentReference)
        if (modelRoot === value) modelRoot = null;
        else return parentReference;
      else
        -1 === key.indexOf(":") &&
          ((parentReference = writtenObjects.get(this)),
          void 0 !== parentReference &&
            ((key = parentReference + ":" + key),
            writtenObjects.set(value, key),
            void 0 !== temporaryReferences &&
              temporaryReferences.set(key, value)));
      if (isArrayImpl(value)) return value;
      if (value instanceof FormData) {
        null === formData && (formData = new FormData());
        var data$44 = formData;
        key = nextPartId++;
        var prefix$45 = formFieldPrefix + key + "_";
        value.forEach(function (originalValue, originalKey) {
          data$44.append(prefix$45 + originalKey, originalValue);
        });
        return "$K" + key.toString(16);
      }
      if (value instanceof Map)
        return (
          (key = nextPartId++),
          (parentReference = serializeModel(Array.from(value), key)),
          null === formData && (formData = new FormData()),
          formData.append(formFieldPrefix + key, parentReference),
          "$Q" + key.toString(16)
        );
      if (value instanceof Set)
        return (
          (key = nextPartId++),
          (parentReference = serializeModel(Array.from(value), key)),
          null === formData && (formData = new FormData()),
          formData.append(formFieldPrefix + key, parentReference),
          "$W" + key.toString(16)
        );
      if (value instanceof ArrayBuffer)
        return (
          (key = new Blob([value])),
          (parentReference = nextPartId++),
          null === formData && (formData = new FormData()),
          formData.append(formFieldPrefix + parentReference, key),
          "$A" + parentReference.toString(16)
        );
      if (value instanceof Int8Array) return serializeTypedArray("O", value);
      if (value instanceof Uint8Array) return serializeTypedArray("o", value);
      if (value instanceof Uint8ClampedArray)
        return serializeTypedArray("U", value);
      if (value instanceof Int16Array) return serializeTypedArray("S", value);
      if (value instanceof Uint16Array) return serializeTypedArray("s", value);
      if (value instanceof Int32Array) return serializeTypedArray("L", value);
      if (value instanceof Uint32Array) return serializeTypedArray("l", value);
      if (value instanceof Float32Array) return serializeTypedArray("G", value);
      if (value instanceof Float64Array) return serializeTypedArray("g", value);
      if (value instanceof BigInt64Array)
        return serializeTypedArray("M", value);
      if (value instanceof BigUint64Array)
        return serializeTypedArray("m", value);
      if (value instanceof DataView) return serializeTypedArray("V", value);
      if ("function" === typeof Blob && value instanceof Blob)
        return (
          null === formData && (formData = new FormData()),
          (key = nextPartId++),
          formData.append(formFieldPrefix + key, value),
          "$B" + key.toString(16)
        );
      if ((key = getIteratorFn(value)))
        return (
          (parentReference = key.call(value)),
          parentReference === value
            ? ((key = nextPartId++),
              (parentReference = serializeModel(
                Array.from(parentReference),
                key
              )),
              null === formData && (formData = new FormData()),
              formData.append(formFieldPrefix + key, parentReference),
              "$i" + key.toString(16))
            : Array.from(parentReference)
        );
      if (
        "function" === typeof ReadableStream &&
        value instanceof ReadableStream
      )
        return serializeReadableStream(value);
      key = value[ASYNC_ITERATOR];
      if ("function" === typeof key)
        return serializeAsyncIterable(value, key.call(value));
      key = getPrototypeOf(value);
      if (
        key !== ObjectPrototype &&
        (null === key || null !== getPrototypeOf(key))
      ) {
        if (void 0 === temporaryReferences)
          throw Error(
            "Only plain objects, and a few built-ins, can be passed to Server Actions. Classes or null prototypes are not supported."
          );
        return "$T";
      }
      return value;
    }
    if ("string" === typeof value) {
      if ("Z" === value[value.length - 1] && this[key] instanceof Date)
        return "$D" + value;
      key = "$" === value[0] ? "$" + value : value;
      return key;
    }
    if ("boolean" === typeof value) return value;
    if ("number" === typeof value) return serializeNumber(value);
    if ("undefined" === typeof value) return "$undefined";
    if ("function" === typeof value) {
      parentReference = knownServerReferences.get(value);
      if (void 0 !== parentReference)
        return (
          (key = JSON.stringify(parentReference, resolveToJSON)),
          null === formData && (formData = new FormData()),
          (parentReference = nextPartId++),
          formData.set(formFieldPrefix + parentReference, key),
          "$F" + parentReference.toString(16)
        );
      if (
        void 0 !== temporaryReferences &&
        -1 === key.indexOf(":") &&
        ((parentReference = writtenObjects.get(this)),
        void 0 !== parentReference)
      )
        return (
          temporaryReferences.set(parentReference + ":" + key, value), "$T"
        );
      throw Error(
        "Client Functions cannot be passed directly to Server Functions. Only Functions passed from the Server can be passed back again."
      );
    }
    if ("symbol" === typeof value) {
      if (
        void 0 !== temporaryReferences &&
        -1 === key.indexOf(":") &&
        ((parentReference = writtenObjects.get(this)),
        void 0 !== parentReference)
      )
        return (
          temporaryReferences.set(parentReference + ":" + key, value), "$T"
        );
      throw Error(
        "Symbols cannot be passed to a Server Function without a temporary reference set. Pass a TemporaryReferenceSet to the options."
      );
    }
    if ("bigint" === typeof value) return "$n" + value.toString(10);
    throw Error(
      "Type " +
        typeof value +
        " is not supported as an argument to a Server Function."
    );
  }
  function serializeModel(model, id) {
    "object" === typeof model &&
      null !== model &&
      ((id = "$" + id.toString(16)),
      writtenObjects.set(model, id),
      void 0 !== temporaryReferences && temporaryReferences.set(id, model));
    modelRoot = model;
    return JSON.stringify(model, resolveToJSON);
  }
  var nextPartId = 1,
    pendingParts = 0,
    formData = null,
    writtenObjects = new WeakMap(),
    modelRoot = root;
  root = serializeModel(root, 0);
  null === formData
    ? resolve(root)
    : (formData.set(formFieldPrefix + "0", root),
      0 === pendingParts && resolve(formData));
}
var boundCache = new WeakMap();
function encodeFormData(reference) {
  var resolve,
    reject,
    thenable = new Promise(function (res, rej) {
      resolve = res;
      reject = rej;
    });
  processReply(
    reference,
    "",
    void 0,
    function (body) {
      if ("string" === typeof body) {
        var data = new FormData();
        data.append("0", body);
        body = data;
      }
      thenable.status = "fulfilled";
      thenable.value = body;
      resolve(body);
    },
    function (e) {
      thenable.status = "rejected";
      thenable.reason = e;
      reject(e);
    }
  );
  return thenable;
}
function defaultEncodeFormAction(identifierPrefix) {
  var reference = knownServerReferences.get(this);
  if (!reference)
    throw Error(
      "Tried to encode a Server Action from a different instance than the encoder is from. This is a bug in React."
    );
  var data = null;
  if (null !== reference.bound) {
    data = boundCache.get(reference);
    data ||
      ((data = encodeFormData(reference)), boundCache.set(reference, data));
    if ("rejected" === data.status) throw data.reason;
    if ("fulfilled" !== data.status) throw data;
    reference = data.value;
    var prefixedData = new FormData();
    reference.forEach(function (value, key) {
      prefixedData.append("$ACTION_" + identifierPrefix + ":" + key, value);
    });
    data = prefixedData;
    reference = "$ACTION_REF_" + identifierPrefix;
  } else reference = "$ACTION_ID_" + reference.id;
  return {
    name: reference,
    method: "POST",
    encType: "multipart/form-data",
    data: data
  };
}
function isSignatureEqual(referenceId, numberOfBoundArgs) {
  var reference = knownServerReferences.get(this);
  if (!reference)
    throw Error(
      "Tried to encode a Server Action from a different instance than the encoder is from. This is a bug in React."
    );
  if (reference.id !== referenceId) return !1;
  var boundPromise = reference.bound;
  if (null === boundPromise) return 0 === numberOfBoundArgs;
  switch (boundPromise.status) {
    case "fulfilled":
      return boundPromise.value.length === numberOfBoundArgs;
    case "pending":
      throw boundPromise;
    case "rejected":
      throw boundPromise.reason;
    default:
      throw (
        ("string" !== typeof boundPromise.status &&
          ((boundPromise.status = "pending"),
          boundPromise.then(
            function (boundArgs) {
              boundPromise.status = "fulfilled";
              boundPromise.value = boundArgs;
            },
            function (error) {
              boundPromise.status = "rejected";
              boundPromise.reason = error;
            }
          )),
        boundPromise)
      );
  }
}
function registerServerReference(proxy, reference$jscomp$0, encodeFormAction) {
  Object.defineProperties(proxy, {
    $$FORM_ACTION: {
      value:
        void 0 === encodeFormAction
          ? defaultEncodeFormAction
          : function () {
              var reference = knownServerReferences.get(this);
              if (!reference)
                throw Error(
                  "Tried to encode a Server Action from a different instance than the encoder is from. This is a bug in React."
                );
              var boundPromise = reference.bound;
              null === boundPromise && (boundPromise = Promise.resolve([]));
              return encodeFormAction(reference.id, boundPromise);
            }
    },
    $$IS_SIGNATURE_EQUAL: { value: isSignatureEqual },
    bind: { value: bind }
  });
  knownServerReferences.set(proxy, reference$jscomp$0);
}
var FunctionBind = Function.prototype.bind,
  ArraySlice = Array.prototype.slice;
function bind() {
  var newFn = FunctionBind.apply(this, arguments),
    reference = knownServerReferences.get(this);
  if (reference) {
    var args = ArraySlice.call(arguments, 1),
      boundPromise = null;
    boundPromise =
      null !== reference.bound
        ? Promise.resolve(reference.bound).then(function (boundArgs) {
            return boundArgs.concat(args);
          })
        : Promise.resolve(args);
    Object.defineProperties(newFn, {
      $$FORM_ACTION: { value: this.$$FORM_ACTION },
      $$IS_SIGNATURE_EQUAL: { value: isSignatureEqual },
      bind: { value: bind }
    });
    knownServerReferences.set(newFn, { id: reference.id, bound: boundPromise });
  }
  return newFn;
}
var REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
function getComponentNameFromType(type) {
  if (null == type) return null;
  if ("function" === typeof type)
    return type.$$typeof === REACT_CLIENT_REFERENCE
      ? null
      : type.displayName || type.name || null;
  if ("string" === typeof type) return type;
  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return "Fragment";
    case REACT_PORTAL_TYPE:
      return "Portal";
    case REACT_PROFILER_TYPE:
      return "Profiler";
    case REACT_STRICT_MODE_TYPE:
      return "StrictMode";
    case REACT_SUSPENSE_TYPE:
      return "Suspense";
    case REACT_SUSPENSE_LIST_TYPE:
      return "SuspenseList";
  }
  if ("object" === typeof type)
    switch (type.$$typeof) {
      case REACT_CONTEXT_TYPE:
        return (type.displayName || "Context") + ".Provider";
      case REACT_CONSUMER_TYPE:
        return (type._context.displayName || "Context") + ".Consumer";
      case REACT_FORWARD_REF_TYPE:
        var innerType = type.render;
        type = type.displayName;
        type ||
          ((type = innerType.displayName || innerType.name || ""),
          (type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef"));
        return type;
      case REACT_MEMO_TYPE:
        return (
          (innerType = type.displayName || null),
          null !== innerType
            ? innerType
            : getComponentNameFromType(type.type) || "Memo"
        );
      case REACT_LAZY_TYPE:
        innerType = type._payload;
        type = type._init;
        try {
          return getComponentNameFromType(type(innerType));
        } catch (x) {}
    }
  return null;
}
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
      break;
    case "resolved_module":
      initializeModuleChunk(this);
  }
  switch (this.status) {
    case "fulfilled":
      resolve(this.value);
      break;
    case "pending":
    case "blocked":
      resolve &&
        (null === this.value && (this.value = []), this.value.push(resolve));
      reject &&
        (null === this.reason && (this.reason = []), this.reason.push(reject));
      break;
    default:
      reject && reject(this.reason);
  }
};
function readChunk(chunk) {
  switch (chunk.status) {
    case "resolved_model":
      initializeModelChunk(chunk);
      break;
    case "resolved_module":
      initializeModuleChunk(chunk);
  }
  switch (chunk.status) {
    case "fulfilled":
      return chunk.value;
    case "pending":
    case "blocked":
      throw chunk;
    default:
      throw chunk.reason;
  }
}
function createPendingChunk(response) {
  return new Chunk("pending", null, null, response);
}
function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) (0, listeners[i])(value);
}
function wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners) {
  switch (chunk.status) {
    case "fulfilled":
      wakeChunk(resolveListeners, chunk.value);
      break;
    case "pending":
    case "blocked":
      if (chunk.value)
        for (var i = 0; i < resolveListeners.length; i++)
          chunk.value.push(resolveListeners[i]);
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
      rejectListeners && wakeChunk(rejectListeners, chunk.reason);
  }
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
function createResolvedIteratorResultChunk(response, value, done) {
  return new Chunk(
    "resolved_model",
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    null,
    response
  );
}
function resolveIteratorResultChunk(chunk, value, done) {
  resolveModelChunk(
    chunk,
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}"
  );
}
function resolveModelChunk(chunk, value) {
  if ("pending" !== chunk.status) chunk.reason.enqueueModel(value);
  else {
    var resolveListeners = chunk.value,
      rejectListeners = chunk.reason;
    chunk.status = "resolved_model";
    chunk.value = value;
    null !== resolveListeners &&
      (initializeModelChunk(chunk),
      wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners));
  }
}
var initializingHandler = null;
function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler;
  initializingHandler = null;
  var resolvedModel = chunk.value;
  chunk.status = "blocked";
  chunk.value = null;
  chunk.reason = null;
  try {
    var value = JSON.parse(resolvedModel, chunk._response._fromJSON),
      resolveListeners = chunk.value;
    null !== resolveListeners &&
      ((chunk.value = null),
      (chunk.reason = null),
      wakeChunk(resolveListeners, value));
    if (null !== initializingHandler) {
      if (initializingHandler.errored) throw initializingHandler.value;
      if (0 < initializingHandler.deps) {
        initializingHandler.value = value;
        initializingHandler.chunk = chunk;
        return;
      }
    }
    chunk.status = "fulfilled";
    chunk.value = value;
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
  } finally {
    initializingHandler = prevHandler;
  }
}
function initializeModuleChunk(chunk) {
  try {
    throw Error(
      "renderToHTML should not have emitted Client References. This is a bug in React."
    );
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
  }
}
function reportGlobalError(response, error) {
  response._chunks.forEach(function (chunk) {
    "pending" === chunk.status && triggerErrorOnChunk(chunk, error);
  });
}
function createLazyChunkWrapper(chunk) {
  return { $$typeof: REACT_LAZY_TYPE, _payload: chunk, _init: readChunk };
}
function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk || ((chunk = createPendingChunk(response)), chunks.set(id, chunk));
  return chunk;
}
function waitForReference(
  referencedChunk,
  parentObject,
  key,
  response,
  map,
  path
) {
  function fulfill(value) {
    for (var i = 1; i < path.length; i++) {
      for (; value.$$typeof === REACT_LAZY_TYPE; )
        if (((value = value._payload), value === handler.chunk))
          value = handler.value;
        else if ("fulfilled" === value.status) value = value.value;
        else {
          path.splice(0, i - 1);
          value.then(fulfill, reject);
          return;
        }
      value = value[path[i]];
    }
    parentObject[key] = map(response, value);
    "" === key && null === handler.value && (handler.value = parentObject[key]);
    parentObject[0] === REACT_ELEMENT_TYPE &&
      "3" === key &&
      "object" === typeof handler.value &&
      null !== handler.value &&
      handler.value.$$typeof === REACT_ELEMENT_TYPE &&
      null === handler.value.props &&
      (handler.value.props = parentObject[key]);
    handler.deps--;
    0 === handler.deps &&
      ((i = handler.chunk),
      null !== i &&
        "blocked" === i.status &&
        ((value = i.value),
        (i.status = "fulfilled"),
        (i.value = handler.value),
        null !== value && wakeChunk(value, handler.value)));
  }
  function reject(error) {
    if (!handler.errored) {
      handler.errored = !0;
      handler.value = error;
      var chunk = handler.chunk;
      null !== chunk &&
        "blocked" === chunk.status &&
        triggerErrorOnChunk(chunk, error);
    }
  }
  if (initializingHandler) {
    var handler = initializingHandler;
    handler.deps++;
  } else
    handler = initializingHandler = {
      parent: null,
      chunk: null,
      value: null,
      deps: 1,
      errored: !1
    };
  referencedChunk.then(fulfill, reject);
  return null;
}
function createServerReferenceProxy(response, metaData) {
  function proxy() {
    var args = Array.prototype.slice.call(arguments),
      p = metaData.bound;
    return p
      ? "fulfilled" === p.status
        ? callServer(metaData.id, p.value.concat(args))
        : Promise.resolve(p).then(function (bound) {
            return callServer(metaData.id, bound.concat(args));
          })
      : callServer(metaData.id, args);
  }
  var callServer = response._callServer;
  registerServerReference(proxy, metaData, response._encodeFormAction);
  return proxy;
}
function getOutlinedModel(response, reference, parentObject, key, map) {
  reference = reference.split(":");
  var id = parseInt(reference[0], 16);
  id = getChunk(response, id);
  switch (id.status) {
    case "resolved_model":
      initializeModelChunk(id);
      break;
    case "resolved_module":
      initializeModuleChunk(id);
  }
  switch (id.status) {
    case "fulfilled":
      var value = id.value;
      for (id = 1; id < reference.length; id++)
        if (
          ((value = value[reference[id]]), value.$$typeof === REACT_LAZY_TYPE)
        )
          if (((value = value._payload), "fulfilled" === value.status))
            value = value.value;
          else
            return waitForReference(
              value,
              parentObject,
              key,
              response,
              map,
              reference.slice(id)
            );
      return map(response, value);
    case "pending":
    case "blocked":
      return waitForReference(id, parentObject, key, response, map, reference);
    default:
      return (
        initializingHandler
          ? ((initializingHandler.errored = !0),
            (initializingHandler.value = id.reason))
          : (initializingHandler = {
              parent: null,
              chunk: null,
              value: id.reason,
              deps: 0,
              errored: !0
            }),
        null
      );
  }
}
function createMap(response, model) {
  return new Map(model);
}
function createSet(response, model) {
  return new Set(model);
}
function createBlob(response, model) {
  return new Blob(model.slice(1), { type: model[0] });
}
function createFormData(response, model) {
  response = new FormData();
  for (var i = 0; i < model.length; i++)
    response.append(model[i][0], model[i][1]);
  return response;
}
function extractIterator(response, model) {
  return model[Symbol.iterator]();
}
function createModel(response, model) {
  return model;
}
function parseModelString(response, parentObject, key, value) {
  if ("$" === value[0]) {
    if ("$" === value)
      return (
        null !== initializingHandler &&
          "0" === key &&
          (initializingHandler = {
            parent: initializingHandler,
            chunk: null,
            value: null,
            deps: 0,
            errored: !1
          }),
        REACT_ELEMENT_TYPE
      );
    switch (value[1]) {
      case "$":
        return value.slice(1);
      case "L":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          (response = getChunk(response, parentObject)),
          createLazyChunkWrapper(response)
        );
      case "@":
        if (2 === value.length) return new Promise(function () {});
        parentObject = parseInt(value.slice(2), 16);
        return getChunk(response, parentObject);
      case "S":
        return Symbol.for(value.slice(2));
      case "F":
        return (
          (value = value.slice(2)),
          getOutlinedModel(
            response,
            value,
            parentObject,
            key,
            createServerReferenceProxy
          )
        );
      case "T":
        parentObject = "$" + value.slice(2);
        response = response._tempRefs;
        if (null == response)
          throw Error(
            "Missing a temporary reference set but the RSC response returned a temporary reference. Pass a temporaryReference option with the set that was used with the reply."
          );
        return response.get(parentObject);
      case "Q":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, parentObject, key, createMap)
        );
      case "W":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, parentObject, key, createSet)
        );
      case "B":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, parentObject, key, createBlob)
        );
      case "K":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, parentObject, key, createFormData)
        );
      case "i":
        return (
          (value = value.slice(2)),
          getOutlinedModel(response, value, parentObject, key, extractIterator)
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
      default:
        return (
          (value = value.slice(1)),
          getOutlinedModel(response, value, parentObject, key, createModel)
        );
    }
  }
  return value;
}
function missingCall() {
  throw Error(
    'Trying to call a function from "use server" but the callServer option was not implemented in your router runtime.'
  );
}
function ResponseInstance(
  bundlerConfig,
  moduleLoading,
  callServer,
  encodeFormAction,
  nonce,
  temporaryReferences
) {
  var chunks = new Map();
  this._bundlerConfig = bundlerConfig;
  this._moduleLoading = moduleLoading;
  this._callServer = void 0 !== callServer ? callServer : missingCall;
  this._encodeFormAction = encodeFormAction;
  this._nonce = nonce;
  this._chunks = chunks;
  this._fromJSON = this._stringDecoder = null;
  this._rowLength = this._rowTag = this._rowID = this._rowState = 0;
  this._buffer = [];
  this._tempRefs = temporaryReferences;
  this._fromJSON = createFromJSONCallback(this);
}
function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk
    ? "pending" === chunk.status &&
      ((response = chunk.value),
      (chunk.status = "fulfilled"),
      (chunk.value = stream),
      (chunk.reason = controller),
      null !== response && wakeChunk(response, chunk.value))
    : chunks.set(id, new Chunk("fulfilled", stream, controller, response));
}
function startReadableStream(response, id, type) {
  var controller = null;
  type = new ReadableStream({
    type: type,
    start: function (c) {
      controller = c;
    }
  });
  var previousBlockedChunk = null;
  resolveStream(response, id, type, {
    enqueueValue: function (value) {
      null === previousBlockedChunk
        ? controller.enqueue(value)
        : previousBlockedChunk.then(function () {
            controller.enqueue(value);
          });
    },
    enqueueModel: function (json) {
      if (null === previousBlockedChunk) {
        var chunk = new Chunk("resolved_model", json, null, response);
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
        var chunk$65 = createPendingChunk(response);
        chunk$65.then(
          function (v) {
            return controller.enqueue(v);
          },
          function (e) {
            return controller.error(e);
          }
        );
        previousBlockedChunk = chunk$65;
        chunk.then(function () {
          previousBlockedChunk === chunk$65 && (previousBlockedChunk = null);
          resolveModelChunk(chunk$65, json);
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
}
function asyncIterator() {
  return this;
}
function createIterator(next) {
  next = { next: next };
  next[ASYNC_ITERATOR] = asyncIterator;
  return next;
}
function startAsyncIterable(response, id, iterator) {
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
  resolveStream(
    response,
    id,
    iterator ? $jscomp$compprop2[ASYNC_ITERATOR]() : $jscomp$compprop2,
    {
      enqueueValue: function (value) {
        if (nextWriteIndex === buffer.length)
          buffer[nextWriteIndex] = new Chunk(
            "fulfilled",
            { done: !1, value: value },
            null,
            response
          );
        else {
          var chunk = buffer[nextWriteIndex],
            resolveListeners = chunk.value,
            rejectListeners = chunk.reason;
          chunk.status = "fulfilled";
          chunk.value = { done: !1, value: value };
          null !== resolveListeners &&
            wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners);
        }
        nextWriteIndex++;
      },
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
    }
  );
}
function createFromJSONCallback(response) {
  return function (key, value) {
    if ("string" === typeof value)
      return parseModelString(response, this, key, value);
    if ("object" === typeof value && null !== value) {
      if (value[0] === REACT_ELEMENT_TYPE) {
        if (
          ((key = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: value[1],
            key: value[2],
            ref: null,
            props: value[3]
          }),
          null !== initializingHandler)
        )
          if (
            ((value = initializingHandler),
            (initializingHandler = value.parent),
            value.errored)
          )
            (key = new Chunk("rejected", null, value.value, response)),
              (key = createLazyChunkWrapper(key));
          else if (0 < value.deps) {
            var blockedChunk = new Chunk("blocked", null, null, response);
            value.value = key;
            value.chunk = blockedChunk;
            key = createLazyChunkWrapper(blockedChunk);
          }
      } else key = value;
      return key;
    }
    return value;
  };
}
var hasOwnProperty = Object.prototype.hasOwnProperty,
  VALID_ATTRIBUTE_NAME_REGEX = RegExp(
    "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
  ),
  illegalAttributeNameCache = {},
  validatedAttributeNameCache = {};
function isAttributeNameSafe(attributeName) {
  if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
    return !0;
  if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return !1;
  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
    return (validatedAttributeNameCache[attributeName] = !0);
  illegalAttributeNameCache[attributeName] = !0;
  return !1;
}
var unitlessNumbers = new Set(
    "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
      " "
    )
  ),
  aliases = new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]),
  matchHtmlRegExp = /["'&<>]/;
function escapeTextForBrowser(text) {
  if (
    "boolean" === typeof text ||
    "number" === typeof text ||
    "bigint" === typeof text
  )
    return "" + text;
  text = "" + text;
  var match = matchHtmlRegExp.exec(text);
  if (match) {
    var html = "",
      index,
      lastIndex = 0;
    for (index = match.index; index < text.length; index++) {
      switch (text.charCodeAt(index)) {
        case 34:
          match = "&quot;";
          break;
        case 38:
          match = "&amp;";
          break;
        case 39:
          match = "&#x27;";
          break;
        case 60:
          match = "&lt;";
          break;
        case 62:
          match = "&gt;";
          break;
        default:
          continue;
      }
      lastIndex !== index && (html += text.slice(lastIndex, index));
      lastIndex = index + 1;
      html += match;
    }
    text = lastIndex !== index ? html + text.slice(lastIndex, index) : html;
  }
  return text;
}
var uppercasePattern = /([A-Z])/g,
  msPattern = /^ms-/,
  isJavaScriptProtocol =
    /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
function sanitizeURL(url) {
  return isJavaScriptProtocol.test("" + url)
    ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
    : url;
}
var sharedNotPendingObject = {
    pending: !1,
    data: null,
    method: null,
    action: null
  },
  PRELOAD_NO_CREDS = [],
  scriptRegex = /(<\/|<)(s)(cript)/gi;
function scriptReplacer(match, prefix, s, suffix) {
  return "" + prefix + ("s" === s ? "\\u0073" : "\\u0053") + suffix;
}
function createRenderState(
  resumableState,
  nonce,
  externalRuntimeConfig,
  importMap,
  onHeaders,
  maxHeadersLength
) {
  var inlineScriptWithNonce =
      void 0 === nonce
        ? "<script>"
        : '<script nonce="' + escapeTextForBrowser(nonce) + '">',
    idPrefix = resumableState.idPrefix,
    bootstrapChunks = [],
    externalRuntimeScript = null,
    bootstrapScriptContent = resumableState.bootstrapScriptContent,
    bootstrapScripts = resumableState.bootstrapScripts,
    bootstrapModules = resumableState.bootstrapModules;
  void 0 !== bootstrapScriptContent &&
    bootstrapChunks.push(
      inlineScriptWithNonce,
      ("" + bootstrapScriptContent).replace(scriptRegex, scriptReplacer),
      "\x3c/script>"
    );
  void 0 !== externalRuntimeConfig &&
    ("string" === typeof externalRuntimeConfig
      ? ((externalRuntimeScript = { src: externalRuntimeConfig, chunks: [] }),
        pushScriptImpl(externalRuntimeScript.chunks, {
          src: externalRuntimeConfig,
          async: !0,
          integrity: void 0,
          nonce: nonce
        }))
      : ((externalRuntimeScript = {
          src: externalRuntimeConfig.src,
          chunks: []
        }),
        pushScriptImpl(externalRuntimeScript.chunks, {
          src: externalRuntimeConfig.src,
          async: !0,
          integrity: externalRuntimeConfig.integrity,
          nonce: nonce
        })));
  externalRuntimeConfig = [];
  void 0 !== importMap &&
    (externalRuntimeConfig.push('<script type="importmap">'),
    externalRuntimeConfig.push(
      ("" + JSON.stringify(importMap)).replace(scriptRegex, scriptReplacer)
    ),
    externalRuntimeConfig.push("\x3c/script>"));
  importMap = {
    placeholderPrefix: idPrefix + "P:",
    segmentPrefix: idPrefix + "S:",
    boundaryPrefix: idPrefix + "B:",
    startInlineScript: inlineScriptWithNonce,
    htmlChunks: null,
    headChunks: null,
    externalRuntimeScript: externalRuntimeScript,
    bootstrapChunks: bootstrapChunks,
    importMapChunks: externalRuntimeConfig,
    onHeaders: onHeaders,
    headers: onHeaders
      ? {
          preconnects: "",
          fontPreloads: "",
          highImagePreloads: "",
          remainingCapacity:
            2 + ("number" === typeof maxHeadersLength ? maxHeadersLength : 2e3)
        }
      : null,
    resets: {
      font: {},
      dns: {},
      connect: { default: {}, anonymous: {}, credentials: {} },
      image: {},
      style: {}
    },
    charsetChunks: [],
    viewportChunks: [],
    hoistableChunks: [],
    preconnects: new Set(),
    fontPreloads: new Set(),
    highImagePreloads: new Set(),
    styles: new Map(),
    bootstrapScripts: new Set(),
    scripts: new Set(),
    bulkPreloads: new Set(),
    preloads: {
      images: new Map(),
      stylesheets: new Map(),
      scripts: new Map(),
      moduleScripts: new Map()
    },
    nonce: nonce,
    hoistableState: null,
    stylesToHoist: !1
  };
  if (void 0 !== bootstrapScripts)
    for (onHeaders = 0; onHeaders < bootstrapScripts.length; onHeaders++)
      (externalRuntimeConfig = bootstrapScripts[onHeaders]),
        (idPrefix = inlineScriptWithNonce = void 0),
        (externalRuntimeScript = {
          rel: "preload",
          as: "script",
          fetchPriority: "low",
          nonce: nonce
        }),
        "string" === typeof externalRuntimeConfig
          ? (externalRuntimeScript.href = maxHeadersLength =
              externalRuntimeConfig)
          : ((externalRuntimeScript.href = maxHeadersLength =
              externalRuntimeConfig.src),
            (externalRuntimeScript.integrity = idPrefix =
              "string" === typeof externalRuntimeConfig.integrity
                ? externalRuntimeConfig.integrity
                : void 0),
            (externalRuntimeScript.crossOrigin = inlineScriptWithNonce =
              "string" === typeof externalRuntimeConfig ||
              null == externalRuntimeConfig.crossOrigin
                ? void 0
                : "use-credentials" === externalRuntimeConfig.crossOrigin
                  ? "use-credentials"
                  : "")),
        (externalRuntimeConfig = resumableState),
        (bootstrapScriptContent = maxHeadersLength),
        (externalRuntimeConfig.scriptResources[bootstrapScriptContent] = null),
        (externalRuntimeConfig.moduleScriptResources[bootstrapScriptContent] =
          null),
        (externalRuntimeConfig = []),
        pushLinkImpl(externalRuntimeConfig, externalRuntimeScript),
        importMap.bootstrapScripts.add(externalRuntimeConfig),
        bootstrapChunks.push(
          '<script src="',
          escapeTextForBrowser(maxHeadersLength)
        ),
        nonce && bootstrapChunks.push('" nonce="', escapeTextForBrowser(nonce)),
        "string" === typeof idPrefix &&
          bootstrapChunks.push('" integrity="', escapeTextForBrowser(idPrefix)),
        "string" === typeof inlineScriptWithNonce &&
          bootstrapChunks.push(
            '" crossorigin="',
            escapeTextForBrowser(inlineScriptWithNonce)
          ),
        bootstrapChunks.push('" async="">\x3c/script>');
  if (void 0 !== bootstrapModules)
    for (
      bootstrapScripts = 0;
      bootstrapScripts < bootstrapModules.length;
      bootstrapScripts++
    )
      (externalRuntimeScript = bootstrapModules[bootstrapScripts]),
        (inlineScriptWithNonce = maxHeadersLength = void 0),
        (idPrefix = {
          rel: "modulepreload",
          fetchPriority: "low",
          nonce: nonce
        }),
        "string" === typeof externalRuntimeScript
          ? (idPrefix.href = onHeaders = externalRuntimeScript)
          : ((idPrefix.href = onHeaders = externalRuntimeScript.src),
            (idPrefix.integrity = inlineScriptWithNonce =
              "string" === typeof externalRuntimeScript.integrity
                ? externalRuntimeScript.integrity
                : void 0),
            (idPrefix.crossOrigin = maxHeadersLength =
              "string" === typeof externalRuntimeScript ||
              null == externalRuntimeScript.crossOrigin
                ? void 0
                : "use-credentials" === externalRuntimeScript.crossOrigin
                  ? "use-credentials"
                  : "")),
        (externalRuntimeScript = resumableState),
        (externalRuntimeConfig = onHeaders),
        (externalRuntimeScript.scriptResources[externalRuntimeConfig] = null),
        (externalRuntimeScript.moduleScriptResources[externalRuntimeConfig] =
          null),
        (externalRuntimeScript = []),
        pushLinkImpl(externalRuntimeScript, idPrefix),
        importMap.bootstrapScripts.add(externalRuntimeScript),
        bootstrapChunks.push(
          '<script type="module" src="',
          escapeTextForBrowser(onHeaders)
        ),
        nonce && bootstrapChunks.push('" nonce="', escapeTextForBrowser(nonce)),
        "string" === typeof inlineScriptWithNonce &&
          bootstrapChunks.push(
            '" integrity="',
            escapeTextForBrowser(inlineScriptWithNonce)
          ),
        "string" === typeof maxHeadersLength &&
          bootstrapChunks.push(
            '" crossorigin="',
            escapeTextForBrowser(maxHeadersLength)
          ),
        bootstrapChunks.push('" async="">\x3c/script>');
  return importMap;
}
function createResumableState(
  identifierPrefix,
  externalRuntimeConfig,
  bootstrapScriptContent,
  bootstrapScripts,
  bootstrapModules
) {
  var streamingFormat = 0;
  void 0 !== externalRuntimeConfig && (streamingFormat = 1);
  return {
    idPrefix: void 0 === identifierPrefix ? "" : identifierPrefix,
    nextFormID: 0,
    streamingFormat: streamingFormat,
    bootstrapScriptContent: bootstrapScriptContent,
    bootstrapScripts: bootstrapScripts,
    bootstrapModules: bootstrapModules,
    instructions: 0,
    hasBody: !1,
    hasHtml: !1,
    unknownResources: {},
    dnsResources: {},
    connectResources: { default: {}, anonymous: {}, credentials: {} },
    imageResources: {},
    styleResources: {},
    scriptResources: {},
    moduleUnknownResources: {},
    moduleScriptResources: {}
  };
}
function createFormatContext(insertionMode, selectedValue, tagScope) {
  return {
    insertionMode: insertionMode,
    selectedValue: selectedValue,
    tagScope: tagScope
  };
}
function getChildFormatContext(parentContext, type, props) {
  switch (type) {
    case "noscript":
      return createFormatContext(2, null, parentContext.tagScope | 1);
    case "select":
      return createFormatContext(
        2,
        null != props.value ? props.value : props.defaultValue,
        parentContext.tagScope
      );
    case "svg":
      return createFormatContext(3, null, parentContext.tagScope);
    case "picture":
      return createFormatContext(2, null, parentContext.tagScope | 2);
    case "math":
      return createFormatContext(4, null, parentContext.tagScope);
    case "foreignObject":
      return createFormatContext(2, null, parentContext.tagScope);
    case "table":
      return createFormatContext(5, null, parentContext.tagScope);
    case "thead":
    case "tbody":
    case "tfoot":
      return createFormatContext(6, null, parentContext.tagScope);
    case "colgroup":
      return createFormatContext(8, null, parentContext.tagScope);
    case "tr":
      return createFormatContext(7, null, parentContext.tagScope);
  }
  return 5 <= parentContext.insertionMode
    ? createFormatContext(2, null, parentContext.tagScope)
    : 0 === parentContext.insertionMode
      ? "html" === type
        ? createFormatContext(1, null, parentContext.tagScope)
        : createFormatContext(2, null, parentContext.tagScope)
      : 1 === parentContext.insertionMode
        ? createFormatContext(2, null, parentContext.tagScope)
        : parentContext;
}
var styleNameCache = new Map();
function pushStyleAttribute(target, style) {
  if ("object" !== typeof style)
    throw Error(
      "The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX."
    );
  var isFirst = !0,
    styleName;
  for (styleName in style)
    if (hasOwnProperty.call(style, styleName)) {
      var styleValue = style[styleName];
      if (
        null != styleValue &&
        "boolean" !== typeof styleValue &&
        "" !== styleValue
      ) {
        if (0 === styleName.indexOf("--")) {
          var nameChunk = escapeTextForBrowser(styleName);
          styleValue = escapeTextForBrowser(("" + styleValue).trim());
        } else
          (nameChunk = styleNameCache.get(styleName)),
            void 0 === nameChunk &&
              ((nameChunk = escapeTextForBrowser(
                styleName
                  .replace(uppercasePattern, "-$1")
                  .toLowerCase()
                  .replace(msPattern, "-ms-")
              )),
              styleNameCache.set(styleName, nameChunk)),
            (styleValue =
              "number" === typeof styleValue
                ? 0 === styleValue || unitlessNumbers.has(styleName)
                  ? "" + styleValue
                  : styleValue + "px"
                : escapeTextForBrowser(("" + styleValue).trim()));
        isFirst
          ? ((isFirst = !1),
            target.push(' style="', nameChunk, ":", styleValue))
          : target.push(";", nameChunk, ":", styleValue);
      }
    }
  isFirst || target.push('"');
}
function pushBooleanAttribute(target, name, value) {
  value &&
    "function" !== typeof value &&
    "symbol" !== typeof value &&
    target.push(" ", name, '=""');
}
function pushStringAttribute(target, name, value) {
  "function" !== typeof value &&
    "symbol" !== typeof value &&
    "boolean" !== typeof value &&
    target.push(" ", name, '="', escapeTextForBrowser(value), '"');
}
var actionJavaScriptURL = escapeTextForBrowser(
  "javascript:throw new Error('React form unexpectedly submitted.')"
);
function pushAdditionalFormField(value, key) {
  this.push('<input type="hidden"');
  validateAdditionalFormField(value);
  pushStringAttribute(this, "name", key);
  pushStringAttribute(this, "value", value);
  this.push("/>");
}
function validateAdditionalFormField(value) {
  if ("string" !== typeof value)
    throw Error(
      "File/Blob fields are not yet supported in progressive forms. Will fallback to client hydration."
    );
}
function getCustomFormFields(resumableState, formAction) {
  if ("function" === typeof formAction.$$FORM_ACTION) {
    var id = resumableState.nextFormID++;
    resumableState = resumableState.idPrefix + id;
    try {
      var customFields = formAction.$$FORM_ACTION(resumableState);
      if (customFields) {
        var formData = customFields.data;
        null != formData && formData.forEach(validateAdditionalFormField);
      }
      return customFields;
    } catch (x) {
      if ("object" === typeof x && null !== x && "function" === typeof x.then)
        throw x;
    }
  }
  return null;
}
function pushFormActionAttribute(
  target,
  resumableState,
  renderState,
  formAction,
  formEncType,
  formMethod,
  formTarget,
  name
) {
  var formData = null;
  if ("function" === typeof formAction) {
    var customFields = getCustomFormFields(resumableState, formAction);
    null !== customFields
      ? ((name = customFields.name),
        (formAction = customFields.action || ""),
        (formEncType = customFields.encType),
        (formMethod = customFields.method),
        (formTarget = customFields.target),
        (formData = customFields.data))
      : (target.push(" ", "formAction", '="', actionJavaScriptURL, '"'),
        (formTarget = formMethod = formEncType = formAction = name = null),
        injectFormReplayingRuntime(resumableState, renderState));
  }
  null != name && pushAttribute(target, "name", name);
  null != formAction && pushAttribute(target, "formAction", formAction);
  null != formEncType && pushAttribute(target, "formEncType", formEncType);
  null != formMethod && pushAttribute(target, "formMethod", formMethod);
  null != formTarget && pushAttribute(target, "formTarget", formTarget);
  return formData;
}
function pushAttribute(target, name, value) {
  switch (name) {
    case "className":
      pushStringAttribute(target, "class", value);
      break;
    case "tabIndex":
      pushStringAttribute(target, "tabindex", value);
      break;
    case "dir":
    case "role":
    case "viewBox":
    case "width":
    case "height":
      pushStringAttribute(target, name, value);
      break;
    case "style":
      pushStyleAttribute(target, value);
      break;
    case "src":
    case "href":
      if ("" === value) break;
    case "action":
    case "formAction":
      if (
        null == value ||
        "function" === typeof value ||
        "symbol" === typeof value ||
        "boolean" === typeof value
      )
        break;
      value = sanitizeURL("" + value);
      target.push(" ", name, '="', escapeTextForBrowser(value), '"');
      break;
    case "defaultValue":
    case "defaultChecked":
    case "innerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "ref":
      break;
    case "autoFocus":
    case "multiple":
    case "muted":
      pushBooleanAttribute(target, name.toLowerCase(), value);
      break;
    case "xlinkHref":
      if (
        "function" === typeof value ||
        "symbol" === typeof value ||
        "boolean" === typeof value
      )
        break;
      value = sanitizeURL("" + value);
      target.push(" ", "xlink:href", '="', escapeTextForBrowser(value), '"');
      break;
    case "contentEditable":
    case "spellCheck":
    case "draggable":
    case "value":
    case "autoReverse":
    case "externalResourcesRequired":
    case "focusable":
    case "preserveAlpha":
      "function" !== typeof value &&
        "symbol" !== typeof value &&
        target.push(" ", name, '="', escapeTextForBrowser(value), '"');
      break;
    case "inert":
    case "allowFullScreen":
    case "async":
    case "autoPlay":
    case "controls":
    case "default":
    case "defer":
    case "disabled":
    case "disablePictureInPicture":
    case "disableRemotePlayback":
    case "formNoValidate":
    case "hidden":
    case "loop":
    case "noModule":
    case "noValidate":
    case "open":
    case "playsInline":
    case "readOnly":
    case "required":
    case "reversed":
    case "scoped":
    case "seamless":
    case "itemScope":
      value &&
        "function" !== typeof value &&
        "symbol" !== typeof value &&
        target.push(" ", name, '=""');
      break;
    case "capture":
    case "download":
      !0 === value
        ? target.push(" ", name, '=""')
        : !1 !== value &&
          "function" !== typeof value &&
          "symbol" !== typeof value &&
          target.push(" ", name, '="', escapeTextForBrowser(value), '"');
      break;
    case "cols":
    case "rows":
    case "size":
    case "span":
      "function" !== typeof value &&
        "symbol" !== typeof value &&
        !isNaN(value) &&
        1 <= value &&
        target.push(" ", name, '="', escapeTextForBrowser(value), '"');
      break;
    case "rowSpan":
    case "start":
      "function" === typeof value ||
        "symbol" === typeof value ||
        isNaN(value) ||
        target.push(" ", name, '="', escapeTextForBrowser(value), '"');
      break;
    case "xlinkActuate":
      pushStringAttribute(target, "xlink:actuate", value);
      break;
    case "xlinkArcrole":
      pushStringAttribute(target, "xlink:arcrole", value);
      break;
    case "xlinkRole":
      pushStringAttribute(target, "xlink:role", value);
      break;
    case "xlinkShow":
      pushStringAttribute(target, "xlink:show", value);
      break;
    case "xlinkTitle":
      pushStringAttribute(target, "xlink:title", value);
      break;
    case "xlinkType":
      pushStringAttribute(target, "xlink:type", value);
      break;
    case "xmlBase":
      pushStringAttribute(target, "xml:base", value);
      break;
    case "xmlLang":
      pushStringAttribute(target, "xml:lang", value);
      break;
    case "xmlSpace":
      pushStringAttribute(target, "xml:space", value);
      break;
    default:
      if (
        !(2 < name.length) ||
        ("o" !== name[0] && "O" !== name[0]) ||
        ("n" !== name[1] && "N" !== name[1])
      )
        if (((name = aliases.get(name) || name), isAttributeNameSafe(name))) {
          switch (typeof value) {
            case "function":
            case "symbol":
              return;
            case "boolean":
              var prefix$75 = name.toLowerCase().slice(0, 5);
              if ("data-" !== prefix$75 && "aria-" !== prefix$75) return;
          }
          target.push(" ", name, '="', escapeTextForBrowser(value), '"');
        }
  }
}
function pushInnerHTML(target, innerHTML, children) {
  if (null != innerHTML) {
    if (null != children)
      throw Error(
        "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
      );
    if ("object" !== typeof innerHTML || !("__html" in innerHTML))
      throw Error(
        "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
      );
    innerHTML = innerHTML.__html;
    null !== innerHTML && void 0 !== innerHTML && target.push("" + innerHTML);
  }
}
function flattenOptionChildren(children) {
  var content = "";
  React.Children.forEach(children, function (child) {
    null != child && (content += child);
  });
  return content;
}
function injectFormReplayingRuntime(resumableState, renderState) {
  0 !== (resumableState.instructions & 16) ||
    renderState.externalRuntimeScript ||
    ((resumableState.instructions |= 16),
    renderState.bootstrapChunks.unshift(
      renderState.startInlineScript,
      'addEventListener("submit",function(a){if(!a.defaultPrevented){var c=a.target,d=a.submitter,e=c.action,b=d;if(d){var f=d.getAttribute("formAction");null!=f&&(e=f,b=null)}"javascript:throw new Error(\'React form unexpectedly submitted.\')"===e&&(a.preventDefault(),b?(a=document.createElement("input"),a.name=b.name,a.value=b.value,b.parentNode.insertBefore(a,b),b=new FormData(c),a.parentNode.removeChild(a)):b=new FormData(c),a=c.ownerDocument||c,(a.$$reactFormReplay=a.$$reactFormReplay||[]).push(c,d,b))}});',
      "\x3c/script>"
    ));
}
function pushLinkImpl(target, props) {
  target.push(startChunkForTag("link"));
  for (var propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(
              "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
            );
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push("/>");
  return null;
}
var styleRegex = /(<\/|<)(s)(tyle)/gi;
function styleReplacer(match, prefix, s, suffix) {
  return "" + prefix + ("s" === s ? "\\73 " : "\\53 ") + suffix;
}
function pushSelfClosing(target, props, tag) {
  target.push(startChunkForTag(tag));
  for (var propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(
              tag +
                " is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
            );
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push("/>");
  return null;
}
function pushTitleImpl(target, props) {
  target.push(startChunkForTag("title"));
  var children = null,
    innerHTML = null,
    propKey;
  for (propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
            children = propValue;
            break;
          case "dangerouslySetInnerHTML":
            innerHTML = propValue;
            break;
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(">");
  props = Array.isArray(children)
    ? 2 > children.length
      ? children[0]
      : null
    : children;
  "function" !== typeof props &&
    "symbol" !== typeof props &&
    null !== props &&
    void 0 !== props &&
    target.push(escapeTextForBrowser("" + props));
  pushInnerHTML(target, innerHTML, children);
  target.push(endChunkForTag("title"));
  return null;
}
function pushScriptImpl(target, props) {
  target.push(startChunkForTag("script"));
  var children = null,
    innerHTML = null,
    propKey;
  for (propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
            children = propValue;
            break;
          case "dangerouslySetInnerHTML":
            innerHTML = propValue;
            break;
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(">");
  pushInnerHTML(target, innerHTML, children);
  "string" === typeof children &&
    target.push(("" + children).replace(scriptRegex, scriptReplacer));
  target.push(endChunkForTag("script"));
  return null;
}
function pushStartGenericElement(target, props, tag) {
  target.push(startChunkForTag(tag));
  var innerHTML = (tag = null),
    propKey;
  for (propKey in props)
    if (hasOwnProperty.call(props, propKey)) {
      var propValue = props[propKey];
      if (null != propValue)
        switch (propKey) {
          case "children":
            tag = propValue;
            break;
          case "dangerouslySetInnerHTML":
            innerHTML = propValue;
            break;
          default:
            pushAttribute(target, propKey, propValue);
        }
    }
  target.push(">");
  pushInnerHTML(target, innerHTML, tag);
  return "string" === typeof tag
    ? (target.push(escapeTextForBrowser(tag)), null)
    : tag;
}
var VALID_TAG_REGEX = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/,
  validatedTagCache = new Map();
function startChunkForTag(tag) {
  var tagStartChunk = validatedTagCache.get(tag);
  if (void 0 === tagStartChunk) {
    if (!VALID_TAG_REGEX.test(tag)) throw Error("Invalid tag: " + tag);
    tagStartChunk = "<" + tag;
    validatedTagCache.set(tag, tagStartChunk);
  }
  return tagStartChunk;
}
function pushStartInstance$1(
  target$jscomp$0,
  type,
  props,
  resumableState,
  renderState,
  hoistableState,
  formatContext,
  textEmbedded,
  isFallback
) {
  switch (type) {
    case "div":
    case "span":
    case "svg":
    case "path":
      break;
    case "a":
      target$jscomp$0.push(startChunkForTag("a"));
      var children = null,
        innerHTML = null,
        propKey;
      for (propKey in props)
        if (hasOwnProperty.call(props, propKey)) {
          var propValue = props[propKey];
          if (null != propValue)
            switch (propKey) {
              case "children":
                children = propValue;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML = propValue;
                break;
              case "href":
                "" === propValue
                  ? pushStringAttribute(target$jscomp$0, "href", "")
                  : pushAttribute(target$jscomp$0, propKey, propValue);
                break;
              default:
                pushAttribute(target$jscomp$0, propKey, propValue);
            }
        }
      target$jscomp$0.push(">");
      pushInnerHTML(target$jscomp$0, innerHTML, children);
      if ("string" === typeof children) {
        target$jscomp$0.push(escapeTextForBrowser(children));
        var JSCompiler_inline_result = null;
      } else JSCompiler_inline_result = children;
      return JSCompiler_inline_result;
    case "g":
    case "p":
    case "li":
      break;
    case "select":
      target$jscomp$0.push(startChunkForTag("select"));
      var children$jscomp$0 = null,
        innerHTML$jscomp$0 = null,
        propKey$jscomp$0;
      for (propKey$jscomp$0 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$0)) {
          var propValue$jscomp$0 = props[propKey$jscomp$0];
          if (null != propValue$jscomp$0)
            switch (propKey$jscomp$0) {
              case "children":
                children$jscomp$0 = propValue$jscomp$0;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$0 = propValue$jscomp$0;
                break;
              case "defaultValue":
              case "value":
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$0,
                  propValue$jscomp$0
                );
            }
        }
      target$jscomp$0.push(">");
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$0, children$jscomp$0);
      return children$jscomp$0;
    case "option":
      var selectedValue = formatContext.selectedValue;
      target$jscomp$0.push(startChunkForTag("option"));
      var children$jscomp$1 = null,
        value = null,
        selected = null,
        innerHTML$jscomp$1 = null,
        propKey$jscomp$1;
      for (propKey$jscomp$1 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$1)) {
          var propValue$jscomp$1 = props[propKey$jscomp$1];
          if (null != propValue$jscomp$1)
            switch (propKey$jscomp$1) {
              case "children":
                children$jscomp$1 = propValue$jscomp$1;
                break;
              case "selected":
                selected = propValue$jscomp$1;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$1 = propValue$jscomp$1;
                break;
              case "value":
                value = propValue$jscomp$1;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$1,
                  propValue$jscomp$1
                );
            }
        }
      if (null != selectedValue) {
        var stringValue =
          null !== value
            ? "" + value
            : flattenOptionChildren(children$jscomp$1);
        if (isArrayImpl(selectedValue))
          for (var i = 0; i < selectedValue.length; i++) {
            if ("" + selectedValue[i] === stringValue) {
              target$jscomp$0.push(' selected=""');
              break;
            }
          }
        else
          "" + selectedValue === stringValue &&
            target$jscomp$0.push(' selected=""');
      } else selected && target$jscomp$0.push(' selected=""');
      target$jscomp$0.push(">");
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$1, children$jscomp$1);
      return children$jscomp$1;
    case "textarea":
      target$jscomp$0.push(startChunkForTag("textarea"));
      var value$jscomp$0 = null,
        defaultValue = null,
        children$jscomp$2 = null,
        propKey$jscomp$2;
      for (propKey$jscomp$2 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$2)) {
          var propValue$jscomp$2 = props[propKey$jscomp$2];
          if (null != propValue$jscomp$2)
            switch (propKey$jscomp$2) {
              case "children":
                children$jscomp$2 = propValue$jscomp$2;
                break;
              case "value":
                value$jscomp$0 = propValue$jscomp$2;
                break;
              case "defaultValue":
                defaultValue = propValue$jscomp$2;
                break;
              case "dangerouslySetInnerHTML":
                throw Error(
                  "`dangerouslySetInnerHTML` does not make sense on <textarea>."
                );
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$2,
                  propValue$jscomp$2
                );
            }
        }
      null === value$jscomp$0 &&
        null !== defaultValue &&
        (value$jscomp$0 = defaultValue);
      target$jscomp$0.push(">");
      if (null != children$jscomp$2) {
        if (null != value$jscomp$0)
          throw Error(
            "If you supply `defaultValue` on a <textarea>, do not pass children."
          );
        if (isArrayImpl(children$jscomp$2)) {
          if (1 < children$jscomp$2.length)
            throw Error("<textarea> can only have at most one child.");
          value$jscomp$0 = "" + children$jscomp$2[0];
        }
        value$jscomp$0 = "" + children$jscomp$2;
      }
      "string" === typeof value$jscomp$0 &&
        "\n" === value$jscomp$0[0] &&
        target$jscomp$0.push("\n");
      null !== value$jscomp$0 &&
        target$jscomp$0.push(escapeTextForBrowser("" + value$jscomp$0));
      return null;
    case "input":
      target$jscomp$0.push(startChunkForTag("input"));
      var name = null,
        formAction = null,
        formEncType = null,
        formMethod = null,
        formTarget = null,
        value$jscomp$1 = null,
        defaultValue$jscomp$0 = null,
        checked = null,
        defaultChecked = null,
        propKey$jscomp$3;
      for (propKey$jscomp$3 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$3)) {
          var propValue$jscomp$3 = props[propKey$jscomp$3];
          if (null != propValue$jscomp$3)
            switch (propKey$jscomp$3) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "input is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              case "name":
                name = propValue$jscomp$3;
                break;
              case "formAction":
                formAction = propValue$jscomp$3;
                break;
              case "formEncType":
                formEncType = propValue$jscomp$3;
                break;
              case "formMethod":
                formMethod = propValue$jscomp$3;
                break;
              case "formTarget":
                formTarget = propValue$jscomp$3;
                break;
              case "defaultChecked":
                defaultChecked = propValue$jscomp$3;
                break;
              case "defaultValue":
                defaultValue$jscomp$0 = propValue$jscomp$3;
                break;
              case "checked":
                checked = propValue$jscomp$3;
                break;
              case "value":
                value$jscomp$1 = propValue$jscomp$3;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$3,
                  propValue$jscomp$3
                );
            }
        }
      var formData = pushFormActionAttribute(
        target$jscomp$0,
        resumableState,
        renderState,
        formAction,
        formEncType,
        formMethod,
        formTarget,
        name
      );
      null !== checked
        ? pushBooleanAttribute(target$jscomp$0, "checked", checked)
        : null !== defaultChecked &&
          pushBooleanAttribute(target$jscomp$0, "checked", defaultChecked);
      null !== value$jscomp$1
        ? pushAttribute(target$jscomp$0, "value", value$jscomp$1)
        : null !== defaultValue$jscomp$0 &&
          pushAttribute(target$jscomp$0, "value", defaultValue$jscomp$0);
      target$jscomp$0.push("/>");
      null != formData &&
        formData.forEach(pushAdditionalFormField, target$jscomp$0);
      return null;
    case "button":
      target$jscomp$0.push(startChunkForTag("button"));
      var children$jscomp$3 = null,
        innerHTML$jscomp$2 = null,
        name$jscomp$0 = null,
        formAction$jscomp$0 = null,
        formEncType$jscomp$0 = null,
        formMethod$jscomp$0 = null,
        formTarget$jscomp$0 = null,
        propKey$jscomp$4;
      for (propKey$jscomp$4 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$4)) {
          var propValue$jscomp$4 = props[propKey$jscomp$4];
          if (null != propValue$jscomp$4)
            switch (propKey$jscomp$4) {
              case "children":
                children$jscomp$3 = propValue$jscomp$4;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$2 = propValue$jscomp$4;
                break;
              case "name":
                name$jscomp$0 = propValue$jscomp$4;
                break;
              case "formAction":
                formAction$jscomp$0 = propValue$jscomp$4;
                break;
              case "formEncType":
                formEncType$jscomp$0 = propValue$jscomp$4;
                break;
              case "formMethod":
                formMethod$jscomp$0 = propValue$jscomp$4;
                break;
              case "formTarget":
                formTarget$jscomp$0 = propValue$jscomp$4;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$4,
                  propValue$jscomp$4
                );
            }
        }
      var formData$jscomp$0 = pushFormActionAttribute(
        target$jscomp$0,
        resumableState,
        renderState,
        formAction$jscomp$0,
        formEncType$jscomp$0,
        formMethod$jscomp$0,
        formTarget$jscomp$0,
        name$jscomp$0
      );
      target$jscomp$0.push(">");
      null != formData$jscomp$0 &&
        formData$jscomp$0.forEach(pushAdditionalFormField, target$jscomp$0);
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$2, children$jscomp$3);
      if ("string" === typeof children$jscomp$3) {
        target$jscomp$0.push(escapeTextForBrowser(children$jscomp$3));
        var JSCompiler_inline_result$jscomp$0 = null;
      } else JSCompiler_inline_result$jscomp$0 = children$jscomp$3;
      return JSCompiler_inline_result$jscomp$0;
    case "form":
      target$jscomp$0.push(startChunkForTag("form"));
      var children$jscomp$4 = null,
        innerHTML$jscomp$3 = null,
        formAction$jscomp$1 = null,
        formEncType$jscomp$1 = null,
        formMethod$jscomp$1 = null,
        formTarget$jscomp$1 = null,
        propKey$jscomp$5;
      for (propKey$jscomp$5 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$5)) {
          var propValue$jscomp$5 = props[propKey$jscomp$5];
          if (null != propValue$jscomp$5)
            switch (propKey$jscomp$5) {
              case "children":
                children$jscomp$4 = propValue$jscomp$5;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$3 = propValue$jscomp$5;
                break;
              case "action":
                formAction$jscomp$1 = propValue$jscomp$5;
                break;
              case "encType":
                formEncType$jscomp$1 = propValue$jscomp$5;
                break;
              case "method":
                formMethod$jscomp$1 = propValue$jscomp$5;
                break;
              case "target":
                formTarget$jscomp$1 = propValue$jscomp$5;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$5,
                  propValue$jscomp$5
                );
            }
        }
      var formData$jscomp$1 = null,
        formActionName = null;
      if ("function" === typeof formAction$jscomp$1) {
        var customFields = getCustomFormFields(
          resumableState,
          formAction$jscomp$1
        );
        null !== customFields
          ? ((formAction$jscomp$1 = customFields.action || ""),
            (formEncType$jscomp$1 = customFields.encType),
            (formMethod$jscomp$1 = customFields.method),
            (formTarget$jscomp$1 = customFields.target),
            (formData$jscomp$1 = customFields.data),
            (formActionName = customFields.name))
          : (target$jscomp$0.push(
              " ",
              "action",
              '="',
              actionJavaScriptURL,
              '"'
            ),
            (formTarget$jscomp$1 =
              formMethod$jscomp$1 =
              formEncType$jscomp$1 =
              formAction$jscomp$1 =
                null),
            injectFormReplayingRuntime(resumableState, renderState));
      }
      null != formAction$jscomp$1 &&
        pushAttribute(target$jscomp$0, "action", formAction$jscomp$1);
      null != formEncType$jscomp$1 &&
        pushAttribute(target$jscomp$0, "encType", formEncType$jscomp$1);
      null != formMethod$jscomp$1 &&
        pushAttribute(target$jscomp$0, "method", formMethod$jscomp$1);
      null != formTarget$jscomp$1 &&
        pushAttribute(target$jscomp$0, "target", formTarget$jscomp$1);
      target$jscomp$0.push(">");
      null !== formActionName &&
        (target$jscomp$0.push('<input type="hidden"'),
        pushStringAttribute(target$jscomp$0, "name", formActionName),
        target$jscomp$0.push("/>"),
        null != formData$jscomp$1 &&
          formData$jscomp$1.forEach(pushAdditionalFormField, target$jscomp$0));
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$3, children$jscomp$4);
      if ("string" === typeof children$jscomp$4) {
        target$jscomp$0.push(escapeTextForBrowser(children$jscomp$4));
        var JSCompiler_inline_result$jscomp$1 = null;
      } else JSCompiler_inline_result$jscomp$1 = children$jscomp$4;
      return JSCompiler_inline_result$jscomp$1;
    case "menuitem":
      target$jscomp$0.push(startChunkForTag("menuitem"));
      for (var propKey$jscomp$6 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$6)) {
          var propValue$jscomp$6 = props[propKey$jscomp$6];
          if (null != propValue$jscomp$6)
            switch (propKey$jscomp$6) {
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "menuitems cannot have `children` nor `dangerouslySetInnerHTML`."
                );
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$6,
                  propValue$jscomp$6
                );
            }
        }
      target$jscomp$0.push(">");
      return null;
    case "object":
      target$jscomp$0.push(startChunkForTag("object"));
      var children$jscomp$5 = null,
        innerHTML$jscomp$4 = null,
        propKey$jscomp$7;
      for (propKey$jscomp$7 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$7)) {
          var propValue$jscomp$7 = props[propKey$jscomp$7];
          if (null != propValue$jscomp$7)
            switch (propKey$jscomp$7) {
              case "children":
                children$jscomp$5 = propValue$jscomp$7;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$4 = propValue$jscomp$7;
                break;
              case "data":
                var sanitizedValue = sanitizeURL("" + propValue$jscomp$7);
                if ("" === sanitizedValue) break;
                target$jscomp$0.push(
                  " ",
                  "data",
                  '="',
                  escapeTextForBrowser(sanitizedValue),
                  '"'
                );
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$7,
                  propValue$jscomp$7
                );
            }
        }
      target$jscomp$0.push(">");
      pushInnerHTML(target$jscomp$0, innerHTML$jscomp$4, children$jscomp$5);
      if ("string" === typeof children$jscomp$5) {
        target$jscomp$0.push(escapeTextForBrowser(children$jscomp$5));
        var JSCompiler_inline_result$jscomp$2 = null;
      } else JSCompiler_inline_result$jscomp$2 = children$jscomp$5;
      return JSCompiler_inline_result$jscomp$2;
    case "title":
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp
      )
        var JSCompiler_inline_result$jscomp$3 = pushTitleImpl(
          target$jscomp$0,
          props
        );
      else
        isFallback
          ? (JSCompiler_inline_result$jscomp$3 = null)
          : (pushTitleImpl(renderState.hoistableChunks, props),
            (JSCompiler_inline_result$jscomp$3 = void 0));
      return JSCompiler_inline_result$jscomp$3;
    case "link":
      var rel = props.rel,
        href = props.href,
        precedence = props.precedence;
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp ||
        "string" !== typeof rel ||
        "string" !== typeof href ||
        "" === href
      ) {
        pushLinkImpl(target$jscomp$0, props);
        var JSCompiler_inline_result$jscomp$4 = null;
      } else if ("stylesheet" === props.rel)
        if (
          "string" !== typeof precedence ||
          null != props.disabled ||
          props.onLoad ||
          props.onError
        )
          JSCompiler_inline_result$jscomp$4 = pushLinkImpl(
            target$jscomp$0,
            props
          );
        else {
          var styleQueue = renderState.styles.get(precedence),
            resourceState = resumableState.styleResources.hasOwnProperty(href)
              ? resumableState.styleResources[href]
              : void 0;
          if (null !== resourceState) {
            resumableState.styleResources[href] = null;
            styleQueue ||
              ((styleQueue = {
                precedence: escapeTextForBrowser(precedence),
                rules: [],
                hrefs: [],
                sheets: new Map()
              }),
              renderState.styles.set(precedence, styleQueue));
            var resource = {
              state: 0,
              props: assign({}, props, {
                "data-precedence": props.precedence,
                precedence: null
              })
            };
            if (resourceState) {
              2 === resourceState.length &&
                adoptPreloadCredentials(resource.props, resourceState);
              var preloadResource = renderState.preloads.stylesheets.get(href);
              preloadResource && 0 < preloadResource.length
                ? (preloadResource.length = 0)
                : (resource.state = 1);
            }
            styleQueue.sheets.set(href, resource);
            hoistableState && hoistableState.stylesheets.add(resource);
          } else if (styleQueue) {
            var resource$76 = styleQueue.sheets.get(href);
            resource$76 &&
              hoistableState &&
              hoistableState.stylesheets.add(resource$76);
          }
          textEmbedded && target$jscomp$0.push("\x3c!-- --\x3e");
          JSCompiler_inline_result$jscomp$4 = null;
        }
      else
        props.onLoad || props.onError
          ? (JSCompiler_inline_result$jscomp$4 = pushLinkImpl(
              target$jscomp$0,
              props
            ))
          : (textEmbedded && target$jscomp$0.push("\x3c!-- --\x3e"),
            (JSCompiler_inline_result$jscomp$4 = isFallback
              ? null
              : pushLinkImpl(renderState.hoistableChunks, props)));
      return JSCompiler_inline_result$jscomp$4;
    case "script":
      var asyncProp = props.async;
      if (
        "string" !== typeof props.src ||
        !props.src ||
        !asyncProp ||
        "function" === typeof asyncProp ||
        "symbol" === typeof asyncProp ||
        props.onLoad ||
        props.onError ||
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp
      )
        var JSCompiler_inline_result$jscomp$5 = pushScriptImpl(
          target$jscomp$0,
          props
        );
      else {
        var key = props.src;
        if ("module" === props.type) {
          var resources = resumableState.moduleScriptResources;
          var preloads = renderState.preloads.moduleScripts;
        } else
          (resources = resumableState.scriptResources),
            (preloads = renderState.preloads.scripts);
        var resourceState$jscomp$0 = resources.hasOwnProperty(key)
          ? resources[key]
          : void 0;
        if (null !== resourceState$jscomp$0) {
          resources[key] = null;
          var scriptProps = props;
          if (resourceState$jscomp$0) {
            2 === resourceState$jscomp$0.length &&
              ((scriptProps = assign({}, props)),
              adoptPreloadCredentials(scriptProps, resourceState$jscomp$0));
            var preloadResource$jscomp$0 = preloads.get(key);
            preloadResource$jscomp$0 && (preloadResource$jscomp$0.length = 0);
          }
          var resource$jscomp$0 = [];
          renderState.scripts.add(resource$jscomp$0);
          pushScriptImpl(resource$jscomp$0, scriptProps);
        }
        textEmbedded && target$jscomp$0.push("\x3c!-- --\x3e");
        JSCompiler_inline_result$jscomp$5 = null;
      }
      return JSCompiler_inline_result$jscomp$5;
    case "style":
      var precedence$jscomp$0 = props.precedence,
        href$jscomp$0 = props.href;
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp ||
        "string" !== typeof precedence$jscomp$0 ||
        "string" !== typeof href$jscomp$0 ||
        "" === href$jscomp$0
      ) {
        target$jscomp$0.push(startChunkForTag("style"));
        var children$jscomp$6 = null,
          innerHTML$jscomp$5 = null,
          propKey$jscomp$8;
        for (propKey$jscomp$8 in props)
          if (hasOwnProperty.call(props, propKey$jscomp$8)) {
            var propValue$jscomp$8 = props[propKey$jscomp$8];
            if (null != propValue$jscomp$8)
              switch (propKey$jscomp$8) {
                case "children":
                  children$jscomp$6 = propValue$jscomp$8;
                  break;
                case "dangerouslySetInnerHTML":
                  innerHTML$jscomp$5 = propValue$jscomp$8;
                  break;
                default:
                  pushAttribute(
                    target$jscomp$0,
                    propKey$jscomp$8,
                    propValue$jscomp$8
                  );
              }
          }
        target$jscomp$0.push(">");
        var child = Array.isArray(children$jscomp$6)
          ? 2 > children$jscomp$6.length
            ? children$jscomp$6[0]
            : null
          : children$jscomp$6;
        "function" !== typeof child &&
          "symbol" !== typeof child &&
          null !== child &&
          void 0 !== child &&
          target$jscomp$0.push(("" + child).replace(styleRegex, styleReplacer));
        pushInnerHTML(target$jscomp$0, innerHTML$jscomp$5, children$jscomp$6);
        target$jscomp$0.push(endChunkForTag("style"));
        var JSCompiler_inline_result$jscomp$6 = null;
      } else {
        var styleQueue$jscomp$0 = renderState.styles.get(precedence$jscomp$0);
        if (
          null !==
          (resumableState.styleResources.hasOwnProperty(href$jscomp$0)
            ? resumableState.styleResources[href$jscomp$0]
            : void 0)
        ) {
          resumableState.styleResources[href$jscomp$0] = null;
          styleQueue$jscomp$0
            ? styleQueue$jscomp$0.hrefs.push(
                escapeTextForBrowser(href$jscomp$0)
              )
            : ((styleQueue$jscomp$0 = {
                precedence: escapeTextForBrowser(precedence$jscomp$0),
                rules: [],
                hrefs: [escapeTextForBrowser(href$jscomp$0)],
                sheets: new Map()
              }),
              renderState.styles.set(precedence$jscomp$0, styleQueue$jscomp$0));
          var target = styleQueue$jscomp$0.rules,
            children$jscomp$7 = null,
            innerHTML$jscomp$6 = null,
            propKey$jscomp$9;
          for (propKey$jscomp$9 in props)
            if (hasOwnProperty.call(props, propKey$jscomp$9)) {
              var propValue$jscomp$9 = props[propKey$jscomp$9];
              if (null != propValue$jscomp$9)
                switch (propKey$jscomp$9) {
                  case "children":
                    children$jscomp$7 = propValue$jscomp$9;
                    break;
                  case "dangerouslySetInnerHTML":
                    innerHTML$jscomp$6 = propValue$jscomp$9;
                }
            }
          var child$jscomp$0 = Array.isArray(children$jscomp$7)
            ? 2 > children$jscomp$7.length
              ? children$jscomp$7[0]
              : null
            : children$jscomp$7;
          "function" !== typeof child$jscomp$0 &&
            "symbol" !== typeof child$jscomp$0 &&
            null !== child$jscomp$0 &&
            void 0 !== child$jscomp$0 &&
            target.push(
              ("" + child$jscomp$0).replace(styleRegex, styleReplacer)
            );
          pushInnerHTML(target, innerHTML$jscomp$6, children$jscomp$7);
        }
        styleQueue$jscomp$0 &&
          hoistableState &&
          hoistableState.styles.add(styleQueue$jscomp$0);
        textEmbedded && target$jscomp$0.push("\x3c!-- --\x3e");
        JSCompiler_inline_result$jscomp$6 = void 0;
      }
      return JSCompiler_inline_result$jscomp$6;
    case "meta":
      if (
        3 === formatContext.insertionMode ||
        formatContext.tagScope & 1 ||
        null != props.itemProp
      )
        var JSCompiler_inline_result$jscomp$7 = pushSelfClosing(
          target$jscomp$0,
          props,
          "meta"
        );
      else
        textEmbedded && target$jscomp$0.push("\x3c!-- --\x3e"),
          (JSCompiler_inline_result$jscomp$7 = isFallback
            ? null
            : "string" === typeof props.charSet
              ? pushSelfClosing(renderState.charsetChunks, props, "meta")
              : "viewport" === props.name
                ? pushSelfClosing(renderState.viewportChunks, props, "meta")
                : pushSelfClosing(renderState.hoistableChunks, props, "meta"));
      return JSCompiler_inline_result$jscomp$7;
    case "listing":
    case "pre":
      target$jscomp$0.push(startChunkForTag(type));
      var children$jscomp$8 = null,
        innerHTML$jscomp$7 = null,
        propKey$jscomp$10;
      for (propKey$jscomp$10 in props)
        if (hasOwnProperty.call(props, propKey$jscomp$10)) {
          var propValue$jscomp$10 = props[propKey$jscomp$10];
          if (null != propValue$jscomp$10)
            switch (propKey$jscomp$10) {
              case "children":
                children$jscomp$8 = propValue$jscomp$10;
                break;
              case "dangerouslySetInnerHTML":
                innerHTML$jscomp$7 = propValue$jscomp$10;
                break;
              default:
                pushAttribute(
                  target$jscomp$0,
                  propKey$jscomp$10,
                  propValue$jscomp$10
                );
            }
        }
      target$jscomp$0.push(">");
      if (null != innerHTML$jscomp$7) {
        if (null != children$jscomp$8)
          throw Error(
            "Can only set one of `children` or `props.dangerouslySetInnerHTML`."
          );
        if (
          "object" !== typeof innerHTML$jscomp$7 ||
          !("__html" in innerHTML$jscomp$7)
        )
          throw Error(
            "`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information."
          );
        var html = innerHTML$jscomp$7.__html;
        null !== html &&
          void 0 !== html &&
          ("string" === typeof html && 0 < html.length && "\n" === html[0]
            ? target$jscomp$0.push("\n", html)
            : target$jscomp$0.push("" + html));
      }
      "string" === typeof children$jscomp$8 &&
        "\n" === children$jscomp$8[0] &&
        target$jscomp$0.push("\n");
      return children$jscomp$8;
    case "img":
      var src = props.src,
        srcSet = props.srcSet;
      if (
        !(
          "lazy" === props.loading ||
          (!src && !srcSet) ||
          ("string" !== typeof src && null != src) ||
          ("string" !== typeof srcSet && null != srcSet)
        ) &&
        "low" !== props.fetchPriority &&
        !1 === !!(formatContext.tagScope & 3) &&
        ("string" !== typeof src ||
          ":" !== src[4] ||
          ("d" !== src[0] && "D" !== src[0]) ||
          ("a" !== src[1] && "A" !== src[1]) ||
          ("t" !== src[2] && "T" !== src[2]) ||
          ("a" !== src[3] && "A" !== src[3])) &&
        ("string" !== typeof srcSet ||
          ":" !== srcSet[4] ||
          ("d" !== srcSet[0] && "D" !== srcSet[0]) ||
          ("a" !== srcSet[1] && "A" !== srcSet[1]) ||
          ("t" !== srcSet[2] && "T" !== srcSet[2]) ||
          ("a" !== srcSet[3] && "A" !== srcSet[3]))
      ) {
        var sizes = "string" === typeof props.sizes ? props.sizes : void 0,
          key$jscomp$0 = srcSet ? srcSet + "\n" + (sizes || "") : src,
          promotablePreloads = renderState.preloads.images,
          resource$jscomp$1 = promotablePreloads.get(key$jscomp$0);
        if (resource$jscomp$1) {
          if (
            "high" === props.fetchPriority ||
            10 > renderState.highImagePreloads.size
          )
            promotablePreloads.delete(key$jscomp$0),
              renderState.highImagePreloads.add(resource$jscomp$1);
        } else if (
          !resumableState.imageResources.hasOwnProperty(key$jscomp$0)
        ) {
          resumableState.imageResources[key$jscomp$0] = PRELOAD_NO_CREDS;
          var input = props.crossOrigin;
          var JSCompiler_inline_result$jscomp$8 =
            "string" === typeof input
              ? "use-credentials" === input
                ? input
                : ""
              : void 0;
          var headers = renderState.headers,
            header;
          headers &&
          0 < headers.remainingCapacity &&
          ("high" === props.fetchPriority ||
            500 > headers.highImagePreloads.length) &&
          ((header = getPreloadAsHeader(src, "image", {
            imageSrcSet: props.srcSet,
            imageSizes: props.sizes,
            crossOrigin: JSCompiler_inline_result$jscomp$8,
            integrity: props.integrity,
            nonce: props.nonce,
            type: props.type,
            fetchPriority: props.fetchPriority,
            referrerPolicy: props.refererPolicy
          })),
          0 <= (headers.remainingCapacity -= header.length + 2))
            ? ((renderState.resets.image[key$jscomp$0] = PRELOAD_NO_CREDS),
              headers.highImagePreloads && (headers.highImagePreloads += ", "),
              (headers.highImagePreloads += header))
            : ((resource$jscomp$1 = []),
              pushLinkImpl(resource$jscomp$1, {
                rel: "preload",
                as: "image",
                href: srcSet ? void 0 : src,
                imageSrcSet: srcSet,
                imageSizes: sizes,
                crossOrigin: JSCompiler_inline_result$jscomp$8,
                integrity: props.integrity,
                type: props.type,
                fetchPriority: props.fetchPriority,
                referrerPolicy: props.referrerPolicy
              }),
              "high" === props.fetchPriority ||
              10 > renderState.highImagePreloads.size
                ? renderState.highImagePreloads.add(resource$jscomp$1)
                : (renderState.bulkPreloads.add(resource$jscomp$1),
                  promotablePreloads.set(key$jscomp$0, resource$jscomp$1)));
        }
      }
      return pushSelfClosing(target$jscomp$0, props, "img");
    case "base":
    case "area":
    case "br":
    case "col":
    case "embed":
    case "hr":
    case "keygen":
    case "param":
    case "source":
    case "track":
    case "wbr":
      return pushSelfClosing(target$jscomp$0, props, type);
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      break;
    case "head":
      if (2 > formatContext.insertionMode && null === renderState.headChunks) {
        renderState.headChunks = [];
        var JSCompiler_inline_result$jscomp$9 = pushStartGenericElement(
          renderState.headChunks,
          props,
          "head"
        );
      } else
        JSCompiler_inline_result$jscomp$9 = pushStartGenericElement(
          target$jscomp$0,
          props,
          "head"
        );
      return JSCompiler_inline_result$jscomp$9;
    case "html":
      if (
        0 === formatContext.insertionMode &&
        null === renderState.htmlChunks
      ) {
        renderState.htmlChunks = ["<!DOCTYPE html>"];
        var JSCompiler_inline_result$jscomp$10 = pushStartGenericElement(
          renderState.htmlChunks,
          props,
          "html"
        );
      } else
        JSCompiler_inline_result$jscomp$10 = pushStartGenericElement(
          target$jscomp$0,
          props,
          "html"
        );
      return JSCompiler_inline_result$jscomp$10;
    default:
      if (-1 !== type.indexOf("-")) {
        target$jscomp$0.push(startChunkForTag(type));
        var children$jscomp$9 = null,
          innerHTML$jscomp$8 = null,
          propKey$jscomp$11;
        for (propKey$jscomp$11 in props)
          if (hasOwnProperty.call(props, propKey$jscomp$11)) {
            var propValue$jscomp$11 = props[propKey$jscomp$11];
            if (null != propValue$jscomp$11) {
              var attributeName = propKey$jscomp$11;
              switch (propKey$jscomp$11) {
                case "children":
                  children$jscomp$9 = propValue$jscomp$11;
                  break;
                case "dangerouslySetInnerHTML":
                  innerHTML$jscomp$8 = propValue$jscomp$11;
                  break;
                case "style":
                  pushStyleAttribute(target$jscomp$0, propValue$jscomp$11);
                  break;
                case "suppressContentEditableWarning":
                case "suppressHydrationWarning":
                case "ref":
                  break;
                case "className":
                  attributeName = "class";
                default:
                  if (
                    isAttributeNameSafe(propKey$jscomp$11) &&
                    "function" !== typeof propValue$jscomp$11 &&
                    "symbol" !== typeof propValue$jscomp$11 &&
                    !1 !== propValue$jscomp$11
                  ) {
                    if (!0 === propValue$jscomp$11) propValue$jscomp$11 = "";
                    else if ("object" === typeof propValue$jscomp$11) continue;
                    target$jscomp$0.push(
                      " ",
                      attributeName,
                      '="',
                      escapeTextForBrowser(propValue$jscomp$11),
                      '"'
                    );
                  }
              }
            }
          }
        target$jscomp$0.push(">");
        pushInnerHTML(target$jscomp$0, innerHTML$jscomp$8, children$jscomp$9);
        return children$jscomp$9;
      }
  }
  return pushStartGenericElement(target$jscomp$0, props, type);
}
var endTagCache = new Map();
function endChunkForTag(tag) {
  var chunk = endTagCache.get(tag);
  void 0 === chunk && ((chunk = "</" + tag + ">"), endTagCache.set(tag, chunk));
  return chunk;
}
function writeBootstrap(destination, renderState) {
  renderState = renderState.bootstrapChunks;
  for (var i = 0; i < renderState.length - 1; i++)
    destination.push(renderState[i]);
  return i < renderState.length
    ? ((i = renderState[i]), (renderState.length = 0), destination.push(i))
    : !0;
}
function writeStartPendingSuspenseBoundary(destination, renderState, id) {
  destination.push('\x3c!--$?--\x3e<template id="');
  if (null === id)
    throw Error(
      "An ID must have been assigned before we can complete the boundary."
    );
  destination.push(renderState.boundaryPrefix);
  renderState = id.toString(16);
  destination.push(renderState);
  return destination.push('"></template>');
}
function writeStartSegment(destination, renderState, formatContext, id) {
  switch (formatContext.insertionMode) {
    case 0:
    case 1:
    case 2:
      return (
        destination.push('<div hidden id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    case 3:
      return (
        destination.push('<svg aria-hidden="true" style="display:none" id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    case 4:
      return (
        destination.push('<math aria-hidden="true" style="display:none" id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    case 5:
      return (
        destination.push('<table hidden id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    case 6:
      return (
        destination.push('<table hidden><tbody id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    case 7:
      return (
        destination.push('<table hidden><tr id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    case 8:
      return (
        destination.push('<table hidden><colgroup id="'),
        destination.push(renderState.segmentPrefix),
        (renderState = id.toString(16)),
        destination.push(renderState),
        destination.push('">')
      );
    default:
      throw Error("Unknown insertion mode. This is a bug in React.");
  }
}
function writeEndSegment(destination, formatContext) {
  switch (formatContext.insertionMode) {
    case 0:
    case 1:
    case 2:
      return destination.push("</div>");
    case 3:
      return destination.push("</svg>");
    case 4:
      return destination.push("</math>");
    case 5:
      return destination.push("</table>");
    case 6:
      return destination.push("</tbody></table>");
    case 7:
      return destination.push("</tr></table>");
    case 8:
      return destination.push("</colgroup></table>");
    default:
      throw Error("Unknown insertion mode. This is a bug in React.");
  }
}
var regexForJSStringsInInstructionScripts = /[<\u2028\u2029]/g;
function escapeJSStringsForInstructionScripts(input) {
  return JSON.stringify(input).replace(
    regexForJSStringsInInstructionScripts,
    function (match) {
      switch (match) {
        case "<":
          return "\\u003c";
        case "\u2028":
          return "\\u2028";
        case "\u2029":
          return "\\u2029";
        default:
          throw Error(
            "escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
  );
}
var regexForJSStringsInScripts = /[&><\u2028\u2029]/g;
function escapeJSObjectForInstructionScripts(input) {
  return JSON.stringify(input).replace(
    regexForJSStringsInScripts,
    function (match) {
      switch (match) {
        case "&":
          return "\\u0026";
        case ">":
          return "\\u003e";
        case "<":
          return "\\u003c";
        case "\u2028":
          return "\\u2028";
        case "\u2029":
          return "\\u2029";
        default:
          throw Error(
            "escapeJSObjectForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
          );
      }
    }
  );
}
var currentlyRenderingBoundaryHasStylesToHoist = !1,
  destinationHasCapacity = !0;
function flushStyleTagsLateForBoundary(styleQueue) {
  var rules = styleQueue.rules,
    hrefs = styleQueue.hrefs,
    i = 0;
  if (hrefs.length) {
    this.push('<style media="not all" data-precedence="');
    this.push(styleQueue.precedence);
    for (this.push('" data-href="'); i < hrefs.length - 1; i++)
      this.push(hrefs[i]), this.push(" ");
    this.push(hrefs[i]);
    this.push('">');
    for (i = 0; i < rules.length; i++) this.push(rules[i]);
    destinationHasCapacity = this.push("</style>");
    currentlyRenderingBoundaryHasStylesToHoist = !0;
    rules.length = 0;
    hrefs.length = 0;
  }
}
function hasStylesToHoist(stylesheet) {
  return 2 !== stylesheet.state
    ? (currentlyRenderingBoundaryHasStylesToHoist = !0)
    : !1;
}
function writeHoistablesForBoundary(destination, hoistableState, renderState) {
  currentlyRenderingBoundaryHasStylesToHoist = !1;
  destinationHasCapacity = !0;
  hoistableState.styles.forEach(flushStyleTagsLateForBoundary, destination);
  hoistableState.stylesheets.forEach(hasStylesToHoist);
  currentlyRenderingBoundaryHasStylesToHoist &&
    (renderState.stylesToHoist = !0);
  return destinationHasCapacity;
}
function flushResource(resource) {
  for (var i = 0; i < resource.length; i++) this.push(resource[i]);
  resource.length = 0;
}
var stylesheetFlushingQueue = [];
function flushStyleInPreamble(stylesheet) {
  pushLinkImpl(stylesheetFlushingQueue, stylesheet.props);
  for (var i = 0; i < stylesheetFlushingQueue.length; i++)
    this.push(stylesheetFlushingQueue[i]);
  stylesheetFlushingQueue.length = 0;
  stylesheet.state = 2;
}
function flushStylesInPreamble(styleQueue) {
  var hasStylesheets = 0 < styleQueue.sheets.size;
  styleQueue.sheets.forEach(flushStyleInPreamble, this);
  styleQueue.sheets.clear();
  var rules = styleQueue.rules,
    hrefs = styleQueue.hrefs;
  if (!hasStylesheets || hrefs.length) {
    this.push('<style data-precedence="');
    this.push(styleQueue.precedence);
    styleQueue = 0;
    if (hrefs.length) {
      for (
        this.push('" data-href="');
        styleQueue < hrefs.length - 1;
        styleQueue++
      )
        this.push(hrefs[styleQueue]), this.push(" ");
      this.push(hrefs[styleQueue]);
    }
    this.push('">');
    for (styleQueue = 0; styleQueue < rules.length; styleQueue++)
      this.push(rules[styleQueue]);
    this.push("</style>");
    rules.length = 0;
    hrefs.length = 0;
  }
}
function preloadLateStyle(stylesheet) {
  if (0 === stylesheet.state) {
    stylesheet.state = 1;
    var props = stylesheet.props;
    pushLinkImpl(stylesheetFlushingQueue, {
      rel: "preload",
      as: "style",
      href: stylesheet.props.href,
      crossOrigin: props.crossOrigin,
      fetchPriority: props.fetchPriority,
      integrity: props.integrity,
      media: props.media,
      hrefLang: props.hrefLang,
      referrerPolicy: props.referrerPolicy
    });
    for (
      stylesheet = 0;
      stylesheet < stylesheetFlushingQueue.length;
      stylesheet++
    )
      this.push(stylesheetFlushingQueue[stylesheet]);
    stylesheetFlushingQueue.length = 0;
  }
}
function preloadLateStyles(styleQueue) {
  styleQueue.sheets.forEach(preloadLateStyle, this);
  styleQueue.sheets.clear();
}
function writeStyleResourceDependenciesInJS(destination, hoistableState) {
  destination.push("[");
  var nextArrayOpenBrackChunk = "[";
  hoistableState.stylesheets.forEach(function (resource) {
    if (2 !== resource.state)
      if (3 === resource.state)
        destination.push(nextArrayOpenBrackChunk),
          (resource = escapeJSObjectForInstructionScripts(
            "" + resource.props.href
          )),
          destination.push(resource),
          destination.push("]"),
          (nextArrayOpenBrackChunk = ",[");
      else {
        destination.push(nextArrayOpenBrackChunk);
        var precedence = resource.props["data-precedence"],
          props = resource.props,
          coercedHref = sanitizeURL("" + resource.props.href);
        coercedHref = escapeJSObjectForInstructionScripts(coercedHref);
        destination.push(coercedHref);
        precedence = "" + precedence;
        destination.push(",");
        precedence = escapeJSObjectForInstructionScripts(precedence);
        destination.push(precedence);
        for (var propKey in props)
          if (
            hasOwnProperty.call(props, propKey) &&
            ((precedence = props[propKey]), null != precedence)
          )
            switch (propKey) {
              case "href":
              case "rel":
              case "precedence":
              case "data-precedence":
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                writeStyleResourceAttributeInJS(
                  destination,
                  propKey,
                  precedence
                );
            }
        destination.push("]");
        nextArrayOpenBrackChunk = ",[";
        resource.state = 3;
      }
  });
  destination.push("]");
}
function writeStyleResourceAttributeInJS(destination, name, value) {
  var attributeName = name.toLowerCase();
  switch (typeof value) {
    case "function":
    case "symbol":
      return;
  }
  switch (name) {
    case "innerHTML":
    case "dangerouslySetInnerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "style":
    case "ref":
      return;
    case "className":
      attributeName = "class";
      name = "" + value;
      break;
    case "hidden":
      if (!1 === value) return;
      name = "";
      break;
    case "src":
    case "href":
      value = sanitizeURL(value);
      name = "" + value;
      break;
    default:
      if (
        (2 < name.length &&
          ("o" === name[0] || "O" === name[0]) &&
          ("n" === name[1] || "N" === name[1])) ||
        !isAttributeNameSafe(name)
      )
        return;
      name = "" + value;
  }
  destination.push(",");
  attributeName = escapeJSObjectForInstructionScripts(attributeName);
  destination.push(attributeName);
  destination.push(",");
  attributeName = escapeJSObjectForInstructionScripts(name);
  destination.push(attributeName);
}
function writeStyleResourceDependenciesInAttr(destination, hoistableState) {
  destination.push("[");
  var nextArrayOpenBrackChunk = "[";
  hoistableState.stylesheets.forEach(function (resource) {
    if (2 !== resource.state)
      if (3 === resource.state)
        destination.push(nextArrayOpenBrackChunk),
          (resource = escapeTextForBrowser(
            JSON.stringify("" + resource.props.href)
          )),
          destination.push(resource),
          destination.push("]"),
          (nextArrayOpenBrackChunk = ",[");
      else {
        destination.push(nextArrayOpenBrackChunk);
        var precedence = resource.props["data-precedence"],
          props = resource.props,
          coercedHref = sanitizeURL("" + resource.props.href);
        coercedHref = escapeTextForBrowser(JSON.stringify(coercedHref));
        destination.push(coercedHref);
        precedence = "" + precedence;
        destination.push(",");
        precedence = escapeTextForBrowser(JSON.stringify(precedence));
        destination.push(precedence);
        for (var propKey in props)
          if (
            hasOwnProperty.call(props, propKey) &&
            ((precedence = props[propKey]), null != precedence)
          )
            switch (propKey) {
              case "href":
              case "rel":
              case "precedence":
              case "data-precedence":
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(
                  "link is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`."
                );
              default:
                writeStyleResourceAttributeInAttr(
                  destination,
                  propKey,
                  precedence
                );
            }
        destination.push("]");
        nextArrayOpenBrackChunk = ",[";
        resource.state = 3;
      }
  });
  destination.push("]");
}
function writeStyleResourceAttributeInAttr(destination, name, value) {
  var attributeName = name.toLowerCase();
  switch (typeof value) {
    case "function":
    case "symbol":
      return;
  }
  switch (name) {
    case "innerHTML":
    case "dangerouslySetInnerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "style":
    case "ref":
      return;
    case "className":
      attributeName = "class";
      name = "" + value;
      break;
    case "hidden":
      if (!1 === value) return;
      name = "";
      break;
    case "src":
    case "href":
      value = sanitizeURL(value);
      name = "" + value;
      break;
    default:
      if (
        (2 < name.length &&
          ("o" === name[0] || "O" === name[0]) &&
          ("n" === name[1] || "N" === name[1])) ||
        !isAttributeNameSafe(name)
      )
        return;
      name = "" + value;
  }
  destination.push(",");
  attributeName = escapeTextForBrowser(JSON.stringify(attributeName));
  destination.push(attributeName);
  destination.push(",");
  attributeName = escapeTextForBrowser(JSON.stringify(name));
  destination.push(attributeName);
}
function createHoistableState() {
  return { styles: new Set(), stylesheets: new Set() };
}
function adoptPreloadCredentials(target, preloadState) {
  null == target.crossOrigin && (target.crossOrigin = preloadState[0]);
  null == target.integrity && (target.integrity = preloadState[1]);
}
function getPreloadAsHeader(href, as, params) {
  href = ("" + href).replace(
    regexForHrefInLinkHeaderURLContext,
    escapeHrefForLinkHeaderURLContextReplacer
  );
  as = ("" + as).replace(
    regexForLinkHeaderQuotedParamValueContext,
    escapeStringForLinkHeaderQuotedParamValueContextReplacer
  );
  as = "<" + href + '>; rel=preload; as="' + as + '"';
  for (var paramName in params)
    hasOwnProperty.call(params, paramName) &&
      ((href = params[paramName]),
      "string" === typeof href &&
        (as +=
          "; " +
          paramName.toLowerCase() +
          '="' +
          ("" + href).replace(
            regexForLinkHeaderQuotedParamValueContext,
            escapeStringForLinkHeaderQuotedParamValueContextReplacer
          ) +
          '"'));
  return as;
}
var regexForHrefInLinkHeaderURLContext = /[<>\r\n]/g;
function escapeHrefForLinkHeaderURLContextReplacer(match) {
  switch (match) {
    case "<":
      return "%3C";
    case ">":
      return "%3E";
    case "\n":
      return "%0A";
    case "\r":
      return "%0D";
    default:
      throw Error(
        "escapeLinkHrefForHeaderContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
      );
  }
}
var regexForLinkHeaderQuotedParamValueContext = /["';,\r\n]/g;
function escapeStringForLinkHeaderQuotedParamValueContextReplacer(match) {
  switch (match) {
    case '"':
      return "%22";
    case "'":
      return "%27";
    case ";":
      return "%3B";
    case ",":
      return "%2C";
    case "\n":
      return "%0A";
    case "\r":
      return "%0D";
    default:
      throw Error(
        "escapeStringForLinkHeaderQuotedParamValueContextReplacer encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React"
      );
  }
}
function hoistStyleQueueDependency(styleQueue) {
  this.styles.add(styleQueue);
}
function hoistStylesheetDependency(stylesheet) {
  this.stylesheets.add(stylesheet);
}
var emptyContextObject = {},
  currentActiveSnapshot = null;
function popToNearestCommonAncestor(prev, next) {
  if (prev !== next) {
    prev.context._currentValue2 = prev.parentValue;
    prev = prev.parent;
    var parentNext = next.parent;
    if (null === prev) {
      if (null !== parentNext)
        throw Error(
          "The stacks must reach the root at the same time. This is a bug in React."
        );
    } else {
      if (null === parentNext)
        throw Error(
          "The stacks must reach the root at the same time. This is a bug in React."
        );
      popToNearestCommonAncestor(prev, parentNext);
    }
    next.context._currentValue2 = next.value;
  }
}
function popAllPrevious(prev) {
  prev.context._currentValue2 = prev.parentValue;
  prev = prev.parent;
  null !== prev && popAllPrevious(prev);
}
function pushAllNext(next) {
  var parentNext = next.parent;
  null !== parentNext && pushAllNext(parentNext);
  next.context._currentValue2 = next.value;
}
function popPreviousToCommonLevel(prev, next) {
  prev.context._currentValue2 = prev.parentValue;
  prev = prev.parent;
  if (null === prev)
    throw Error(
      "The depth must equal at least at zero before reaching the root. This is a bug in React."
    );
  prev.depth === next.depth
    ? popToNearestCommonAncestor(prev, next)
    : popPreviousToCommonLevel(prev, next);
}
function popNextToCommonLevel(prev, next) {
  var parentNext = next.parent;
  if (null === parentNext)
    throw Error(
      "The depth must equal at least at zero before reaching the root. This is a bug in React."
    );
  prev.depth === parentNext.depth
    ? popToNearestCommonAncestor(prev, parentNext)
    : popNextToCommonLevel(prev, parentNext);
  next.context._currentValue2 = next.value;
}
function switchContext(newSnapshot) {
  var prev = currentActiveSnapshot;
  prev !== newSnapshot &&
    (null === prev
      ? pushAllNext(newSnapshot)
      : null === newSnapshot
        ? popAllPrevious(prev)
        : prev.depth === newSnapshot.depth
          ? popToNearestCommonAncestor(prev, newSnapshot)
          : prev.depth > newSnapshot.depth
            ? popPreviousToCommonLevel(prev, newSnapshot)
            : popNextToCommonLevel(prev, newSnapshot),
    (currentActiveSnapshot = newSnapshot));
}
var classComponentUpdater = {
    isMounted: function () {
      return !1;
    },
    enqueueSetState: function (inst, payload) {
      inst = inst._reactInternals;
      null !== inst.queue && inst.queue.push(payload);
    },
    enqueueReplaceState: function (inst, payload) {
      inst = inst._reactInternals;
      inst.replace = !0;
      inst.queue = [payload];
    },
    enqueueForceUpdate: function () {}
  },
  emptyTreeContext = { id: 1, overflow: "" };
function pushTreeContext(baseContext, totalChildren, index) {
  var baseIdWithLeadingBit = baseContext.id;
  baseContext = baseContext.overflow;
  var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
  baseIdWithLeadingBit &= ~(1 << baseLength);
  index += 1;
  var length = 32 - clz32(totalChildren) + baseLength;
  if (30 < length) {
    var numberOfOverflowBits = baseLength - (baseLength % 5);
    length = (
      baseIdWithLeadingBit &
      ((1 << numberOfOverflowBits) - 1)
    ).toString(32);
    baseIdWithLeadingBit >>= numberOfOverflowBits;
    baseLength -= numberOfOverflowBits;
    return {
      id:
        (1 << (32 - clz32(totalChildren) + baseLength)) |
        (index << baseLength) |
        baseIdWithLeadingBit,
      overflow: length + baseContext
    };
  }
  return {
    id: (1 << length) | (index << baseLength) | baseIdWithLeadingBit,
    overflow: baseContext
  };
}
var clz32 = Math.clz32 ? Math.clz32 : clz32Fallback,
  log = Math.log,
  LN2 = Math.LN2;
function clz32Fallback(x) {
  x >>>= 0;
  return 0 === x ? 32 : (31 - ((log(x) / LN2) | 0)) | 0;
}
var SuspenseException = Error(
  "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`"
);
function noop$2() {}
function trackUsedThenable(thenableState, thenable, index) {
  index = thenableState[index];
  void 0 === index
    ? thenableState.push(thenable)
    : index !== thenable && (thenable.then(noop$2, noop$2), (thenable = index));
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      throw thenable.reason;
    default:
      "string" === typeof thenable.status
        ? thenable.then(noop$2, noop$2)
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
function is(x, y) {
  return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
}
var objectIs = "function" === typeof Object.is ? Object.is : is,
  currentlyRenderingComponent = null,
  currentlyRenderingTask = null,
  currentlyRenderingRequest = null,
  currentlyRenderingKeyPath = null,
  firstWorkInProgressHook = null,
  workInProgressHook = null,
  didScheduleRenderPhaseUpdate = !1,
  localIdCounter = 0,
  actionStateCounter = 0,
  actionStateMatchingIndex = -1,
  thenableIndexCounter = 0,
  thenableState = null,
  numberOfReRenders = 0;
function resolveCurrentlyRenderingComponent() {
  if (null === currentlyRenderingComponent)
    throw Error(
      "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
    );
  return currentlyRenderingComponent;
}
function createHook() {
  if (0 < numberOfReRenders)
    throw Error("Rendered more hooks than during the previous render");
  return { memoizedState: null, queue: null, next: null };
}
function getThenableStateAfterSuspending() {
  var state = thenableState;
  thenableState = null;
  return state;
}
function resetHooksState() {
  currentlyRenderingKeyPath =
    currentlyRenderingRequest =
    currentlyRenderingTask =
    currentlyRenderingComponent =
      null;
  didScheduleRenderPhaseUpdate = !1;
  firstWorkInProgressHook = null;
  numberOfReRenders = 0;
  workInProgressHook = null;
}
function useMemo(nextCreate, deps) {
  currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
  null === workInProgressHook
    ? null === firstWorkInProgressHook
      ? (firstWorkInProgressHook = workInProgressHook = createHook())
      : (workInProgressHook = firstWorkInProgressHook)
    : (workInProgressHook =
        null === workInProgressHook.next
          ? (workInProgressHook.next = createHook())
          : workInProgressHook.next);
  deps = void 0 === deps ? null : deps;
  if (null !== workInProgressHook) {
    var prevState = workInProgressHook.memoizedState;
    if (null !== prevState && null !== deps) {
      var prevDeps = prevState[1];
      a: if (null === prevDeps) prevDeps = !1;
      else {
        for (var i = 0; i < prevDeps.length && i < deps.length; i++)
          if (!objectIs(deps[i], prevDeps[i])) {
            prevDeps = !1;
            break a;
          }
        prevDeps = !0;
      }
      if (prevDeps) return prevState[0];
    }
  }
  nextCreate = nextCreate();
  workInProgressHook.memoizedState = [nextCreate, deps];
  return nextCreate;
}
function throwOnUseEffectEventCall() {
  throw Error(
    "A function wrapped in useEffectEvent can't be called during rendering."
  );
}
function unsupportedSetOptimisticState() {
  throw Error("Cannot update optimistic state while rendering.");
}
function useActionState(action, initialState, permalink) {
  resolveCurrentlyRenderingComponent();
  var actionStateHookIndex = actionStateCounter++,
    request = currentlyRenderingRequest;
  if ("function" === typeof action.$$FORM_ACTION) {
    var nextPostbackStateKey = null,
      componentKeyPath = currentlyRenderingKeyPath;
    request = request.formState;
    var isSignatureEqual$79 = action.$$IS_SIGNATURE_EQUAL;
    if (null !== request && "function" === typeof isSignatureEqual$79) {
      var postbackKey = request[1];
      isSignatureEqual$79.call(action, request[2], request[3]) &&
        ((nextPostbackStateKey =
          void 0 !== permalink
            ? "p" + permalink
            : "k" +
              murmurhash3_32_gc(
                JSON.stringify([componentKeyPath, null, actionStateHookIndex]),
                0
              )),
        postbackKey === nextPostbackStateKey &&
          ((actionStateMatchingIndex = actionStateHookIndex),
          (initialState = request[0])));
    }
    var boundAction = action.bind(null, initialState);
    action = function (payload) {
      boundAction(payload);
    };
    "function" === typeof boundAction.$$FORM_ACTION &&
      (action.$$FORM_ACTION = function (prefix) {
        prefix = boundAction.$$FORM_ACTION(prefix);
        void 0 !== permalink &&
          ((permalink += ""), (prefix.action = permalink));
        var formData = prefix.data;
        formData &&
          (null === nextPostbackStateKey &&
            (nextPostbackStateKey =
              void 0 !== permalink
                ? "p" + permalink
                : "k" +
                  murmurhash3_32_gc(
                    JSON.stringify([
                      componentKeyPath,
                      null,
                      actionStateHookIndex
                    ]),
                    0
                  )),
          formData.append("$ACTION_KEY", nextPostbackStateKey));
        return prefix;
      });
    return [initialState, action, !1];
  }
  var boundAction$80 = action.bind(null, initialState);
  return [
    initialState,
    function (payload) {
      boundAction$80(payload);
    },
    !1
  ];
}
function unwrapThenable(thenable) {
  var index = thenableIndexCounter;
  thenableIndexCounter += 1;
  null === thenableState && (thenableState = []);
  return trackUsedThenable(thenableState, thenable, index);
}
function readPreviousThenableFromState() {
  var index = thenableIndexCounter;
  thenableIndexCounter += 1;
  if (null !== thenableState)
    return (
      (index = thenableState[index]),
      (index = void 0 === index ? void 0 : index.value),
      index
    );
}
function unsupportedRefresh() {
  throw Error("Cache cannot be refreshed during server rendering.");
}
function clientHookNotSupported() {
  throw Error(
    "Cannot use state or effect Hooks in renderToHTML because this component will never be hydrated."
  );
}
var HooksDispatcher = {
  readContext: function (context) {
    return context._currentValue2;
  },
  use: function (usable) {
    if (null !== usable && "object" === typeof usable) {
      if ("function" === typeof usable.then) return unwrapThenable(usable);
      if (usable.$$typeof === REACT_CONTEXT_TYPE) return usable._currentValue2;
    }
    throw Error("An unsupported type was passed to use(): " + String(usable));
  },
  useContext: function (context) {
    resolveCurrentlyRenderingComponent();
    return context._currentValue2;
  },
  useMemo: useMemo,
  useReducer: clientHookNotSupported,
  useRef: clientHookNotSupported,
  useState: clientHookNotSupported,
  useInsertionEffect: clientHookNotSupported,
  useLayoutEffect: clientHookNotSupported,
  useCallback: function (callback, deps) {
    return useMemo(function () {
      return callback;
    }, deps);
  },
  useImperativeHandle: clientHookNotSupported,
  useEffect: clientHookNotSupported,
  useDebugValue: function () {},
  useDeferredValue: clientHookNotSupported,
  useTransition: clientHookNotSupported,
  useId: function () {
    var JSCompiler_inline_result = currentlyRenderingTask.treeContext;
    var overflow = JSCompiler_inline_result.overflow;
    JSCompiler_inline_result = JSCompiler_inline_result.id;
    JSCompiler_inline_result =
      (
        JSCompiler_inline_result &
        ~(1 << (32 - clz32(JSCompiler_inline_result) - 1))
      ).toString(32) + overflow;
    var resumableState = currentResumableState;
    if (null === resumableState)
      throw Error(
        "Invalid hook call. Hooks can only be called inside of the body of a function component."
      );
    overflow = localIdCounter++;
    JSCompiler_inline_result =
      ":" + resumableState.idPrefix + "R" + JSCompiler_inline_result;
    0 < overflow && (JSCompiler_inline_result += "H" + overflow.toString(32));
    return JSCompiler_inline_result + ":";
  },
  useSyncExternalStore: clientHookNotSupported,
  useCacheRefresh: function () {
    return unsupportedRefresh;
  },
  useEffectEvent: function () {
    return throwOnUseEffectEventCall;
  },
  useMemoCache: function (size) {
    for (var data = Array(size), i = 0; i < size; i++)
      data[i] = REACT_MEMO_CACHE_SENTINEL;
    return data;
  },
  useHostTransitionStatus: function () {
    resolveCurrentlyRenderingComponent();
    return sharedNotPendingObject;
  },
  useOptimistic: function (passthrough) {
    resolveCurrentlyRenderingComponent();
    return [passthrough, unsupportedSetOptimisticState];
  }
};
HooksDispatcher.useFormState = useActionState;
HooksDispatcher.useActionState = useActionState;
var currentResumableState = null,
  DefaultAsyncDispatcher = {
    getCacheForType: function () {
      throw Error("Not implemented.");
    }
  };
function describeComponentStackByType(type) {
  if ("string" === typeof type) return describeBuiltInComponentFrame(type);
  if ("function" === typeof type)
    return type.prototype && type.prototype.isReactComponent
      ? ((type = describeNativeComponentFrame(type, !0)), type)
      : describeNativeComponentFrame(type, !1);
  if ("object" === typeof type && null !== type) {
    switch (type.$$typeof) {
      case REACT_FORWARD_REF_TYPE:
        return describeNativeComponentFrame(type.render, !1);
      case REACT_MEMO_TYPE:
        return describeNativeComponentFrame(type.type, !1);
      case REACT_LAZY_TYPE:
        var lazyComponent = type,
          payload = lazyComponent._payload;
        lazyComponent = lazyComponent._init;
        try {
          type = lazyComponent(payload);
        } catch (x) {
          return describeBuiltInComponentFrame("Lazy");
        }
        return describeComponentStackByType(type);
    }
    if ("string" === typeof type.name)
      return (
        (payload = type.env),
        describeBuiltInComponentFrame(
          type.name + (payload ? " [" + payload + "]" : "")
        )
      );
  }
  switch (type) {
    case REACT_SUSPENSE_LIST_TYPE:
      return describeBuiltInComponentFrame("SuspenseList");
    case REACT_SUSPENSE_TYPE:
      return describeBuiltInComponentFrame("Suspense");
  }
  return "";
}
function defaultErrorHandler(error) {
  if (
    "object" === typeof error &&
    null !== error &&
    "string" === typeof error.environmentName
  ) {
    var JSCompiler_inline_result = error.environmentName;
    error = [error].slice(0);
    "string" === typeof error[0]
      ? error.splice(
          0,
          1,
          "[%s] " + error[0],
          " " + JSCompiler_inline_result + " "
        )
      : error.splice(0, 0, "[%s] ", " " + JSCompiler_inline_result + " ");
    error.unshift(console);
    JSCompiler_inline_result = bind$1.apply(console.error, error);
    JSCompiler_inline_result();
  } else console.error(error);
  return null;
}
function noop() {}
function RequestInstance(
  children,
  resumableState,
  renderState,
  rootFormatContext,
  progressiveChunkSize,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone,
  formState
) {
  var pingedTasks = [],
    abortSet = new Set();
  this.destination = null;
  this.flushScheduled = !1;
  this.resumableState = resumableState;
  this.renderState = renderState;
  this.rootFormatContext = rootFormatContext;
  this.progressiveChunkSize =
    void 0 === progressiveChunkSize ? 12800 : progressiveChunkSize;
  this.status = 0;
  this.fatalError = null;
  this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0;
  this.completedRootSegment = null;
  this.abortableTasks = abortSet;
  this.pingedTasks = pingedTasks;
  this.clientRenderedBoundaries = [];
  this.completedBoundaries = [];
  this.partialBoundaries = [];
  this.trackedPostpones = null;
  this.onError = void 0 === onError ? defaultErrorHandler : onError;
  this.onPostpone = void 0 === onPostpone ? noop : onPostpone;
  this.onAllReady = void 0 === onAllReady ? noop : onAllReady;
  this.onShellReady = void 0 === onShellReady ? noop : onShellReady;
  this.onShellError = void 0 === onShellError ? noop : onShellError;
  this.onFatalError = void 0 === onFatalError ? noop : onFatalError;
  this.formState = void 0 === formState ? null : formState;
  resumableState = createPendingSegment(
    this,
    0,
    null,
    rootFormatContext,
    !1,
    !1
  );
  resumableState.parentFlushed = !0;
  children = createRenderTask(
    this,
    null,
    children,
    -1,
    null,
    resumableState,
    null,
    abortSet,
    null,
    rootFormatContext,
    null,
    emptyTreeContext,
    null,
    !1
  );
  pushComponentStack(children);
  pingedTasks.push(children);
}
function createRequest(
  children,
  resumableState,
  renderState,
  rootFormatContext,
  progressiveChunkSize,
  onError,
  onAllReady,
  onShellReady,
  onShellError,
  onFatalError,
  onPostpone,
  formState
) {
  return new RequestInstance(
    children,
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    onPostpone,
    formState
  );
}
var AbortSigil = {};
function pingTask(request, task) {
  request.pingedTasks.push(task);
  1 === request.pingedTasks.length &&
    ((request.flushScheduled = null !== request.destination),
    performWork(request));
}
function createSuspenseBoundary(request, fallbackAbortableTasks) {
  return {
    status: 0,
    rootSegmentID: -1,
    parentFlushed: !1,
    pendingTasks: 0,
    completedSegments: [],
    byteSize: 0,
    fallbackAbortableTasks: fallbackAbortableTasks,
    errorDigest: null,
    contentState: createHoistableState(),
    fallbackState: createHoistableState(),
    trackedContentKeyPath: null,
    trackedFallbackNode: null
  };
}
function createRenderTask(
  request,
  thenableState,
  node,
  childIndex,
  blockedBoundary,
  blockedSegment,
  hoistableState,
  abortSet,
  keyPath,
  formatContext,
  context,
  treeContext,
  componentStack,
  isFallback
) {
  request.allPendingTasks++;
  null === blockedBoundary
    ? request.pendingRootTasks++
    : blockedBoundary.pendingTasks++;
  var task = {
    replay: null,
    node: node,
    childIndex: childIndex,
    ping: function () {
      return pingTask(request, task);
    },
    blockedBoundary: blockedBoundary,
    blockedSegment: blockedSegment,
    hoistableState: hoistableState,
    abortSet: abortSet,
    keyPath: keyPath,
    formatContext: formatContext,
    context: context,
    treeContext: treeContext,
    componentStack: componentStack,
    thenableState: thenableState,
    isFallback: isFallback
  };
  abortSet.add(task);
  return task;
}
function createReplayTask(
  request,
  thenableState,
  replay,
  node,
  childIndex,
  blockedBoundary,
  hoistableState,
  abortSet,
  keyPath,
  formatContext,
  context,
  treeContext,
  componentStack,
  isFallback
) {
  request.allPendingTasks++;
  null === blockedBoundary
    ? request.pendingRootTasks++
    : blockedBoundary.pendingTasks++;
  replay.pendingTasks++;
  var task = {
    replay: replay,
    node: node,
    childIndex: childIndex,
    ping: function () {
      return pingTask(request, task);
    },
    blockedBoundary: blockedBoundary,
    blockedSegment: null,
    hoistableState: hoistableState,
    abortSet: abortSet,
    keyPath: keyPath,
    formatContext: formatContext,
    context: context,
    treeContext: treeContext,
    componentStack: componentStack,
    thenableState: thenableState,
    isFallback: isFallback
  };
  abortSet.add(task);
  return task;
}
function createPendingSegment(
  request,
  index,
  boundary,
  parentFormatContext,
  lastPushedText,
  textEmbedded
) {
  return {
    status: 0,
    id: -1,
    index: index,
    parentFlushed: !1,
    chunks: [],
    children: [],
    parentFormatContext: parentFormatContext,
    boundary: boundary,
    lastPushedText: lastPushedText,
    textEmbedded: textEmbedded
  };
}
function pushComponentStack(task) {
  var node = task.node;
  if ("object" === typeof node && null !== node)
    switch (node.$$typeof) {
      case REACT_ELEMENT_TYPE:
        task.componentStack = { parent: task.componentStack, type: node.type };
    }
}
function getThrownInfo(node$jscomp$0) {
  var errorInfo = {};
  node$jscomp$0 &&
    Object.defineProperty(errorInfo, "componentStack", {
      configurable: !0,
      enumerable: !0,
      get: function () {
        try {
          var info = "",
            node = node$jscomp$0;
          do
            (info += describeComponentStackByType(node.type)),
              (node = node.parent);
          while (node);
          var JSCompiler_inline_result = info;
        } catch (x) {
          JSCompiler_inline_result =
            "\nError generating stack: " + x.message + "\n" + x.stack;
        }
        Object.defineProperty(errorInfo, "componentStack", {
          value: JSCompiler_inline_result
        });
        return JSCompiler_inline_result;
      }
    });
  return errorInfo;
}
function logPostpone(request, reason, postponeInfo) {
  request = request.onPostpone;
  request(reason, postponeInfo);
}
function logRecoverableError(request, error, errorInfo) {
  request = request.onError;
  error = request(error, errorInfo);
  if (null == error || "string" === typeof error) return error;
}
function fatalError(request, error) {
  var onShellError = request.onShellError,
    onFatalError = request.onFatalError;
  onShellError(error);
  onFatalError(error);
  null !== request.destination
    ? ((request.status = 3), request.destination.destroy(error))
    : ((request.status = 2), (request.fatalError = error));
}
function renderWithHooks(request, task, keyPath, Component, props, secondArg) {
  var prevThenableState = task.thenableState;
  task.thenableState = null;
  currentlyRenderingComponent = {};
  currentlyRenderingTask = task;
  currentlyRenderingRequest = request;
  currentlyRenderingKeyPath = keyPath;
  actionStateCounter = localIdCounter = 0;
  actionStateMatchingIndex = -1;
  thenableIndexCounter = 0;
  thenableState = prevThenableState;
  for (request = Component(props, secondArg); didScheduleRenderPhaseUpdate; )
    (didScheduleRenderPhaseUpdate = !1),
      (actionStateCounter = localIdCounter = 0),
      (actionStateMatchingIndex = -1),
      (thenableIndexCounter = 0),
      (numberOfReRenders += 1),
      (workInProgressHook = null),
      (request = Component(props, secondArg));
  resetHooksState();
  return request;
}
function finishFunctionComponent(
  request,
  task,
  keyPath,
  children,
  hasId,
  actionStateCount,
  actionStateMatchingIndex
) {
  var didEmitActionStateMarkers = !1;
  if (0 !== actionStateCount && null !== request.formState) {
    var segment = task.blockedSegment;
    if (null !== segment) {
      didEmitActionStateMarkers = !0;
      segment = segment.chunks;
      for (var i = 0; i < actionStateCount; i++)
        i === actionStateMatchingIndex
          ? segment.push("\x3c!--F!--\x3e")
          : segment.push("\x3c!--F--\x3e");
    }
  }
  actionStateCount = task.keyPath;
  task.keyPath = keyPath;
  hasId
    ? ((keyPath = task.treeContext),
      (task.treeContext = pushTreeContext(keyPath, 1, 0)),
      renderNode(request, task, children, -1),
      (task.treeContext = keyPath))
    : didEmitActionStateMarkers
      ? renderNode(request, task, children, -1)
      : renderNodeDestructive(request, task, children, -1);
  task.keyPath = actionStateCount;
}
function renderElement(request, task, keyPath, type, props, ref) {
  if ("function" === typeof type)
    if (type.prototype && type.prototype.isReactComponent) {
      var newProps = props;
      if ("ref" in props) {
        newProps = {};
        for (var propName in props)
          "ref" !== propName && (newProps[propName] = props[propName]);
      }
      var defaultProps = type.defaultProps;
      if (defaultProps) {
        newProps === props && (newProps = assign({}, newProps, props));
        for (var propName$89 in defaultProps)
          void 0 === newProps[propName$89] &&
            (newProps[propName$89] = defaultProps[propName$89]);
      }
      props = newProps;
      newProps = emptyContextObject;
      defaultProps = type.contextType;
      "object" === typeof defaultProps &&
        null !== defaultProps &&
        (newProps = defaultProps._currentValue2);
      newProps = new type(props, newProps);
      var initialState = void 0 !== newProps.state ? newProps.state : null;
      newProps.updater = classComponentUpdater;
      newProps.props = props;
      newProps.state = initialState;
      defaultProps = { queue: [], replace: !1 };
      newProps._reactInternals = defaultProps;
      var contextType = type.contextType;
      newProps.context =
        "object" === typeof contextType && null !== contextType
          ? contextType._currentValue2
          : emptyContextObject;
      contextType = type.getDerivedStateFromProps;
      "function" === typeof contextType &&
        ((contextType = contextType(props, initialState)),
        (initialState =
          null === contextType || void 0 === contextType
            ? initialState
            : assign({}, initialState, contextType)),
        (newProps.state = initialState));
      if (
        "function" !== typeof type.getDerivedStateFromProps &&
        "function" !== typeof newProps.getSnapshotBeforeUpdate &&
        ("function" === typeof newProps.UNSAFE_componentWillMount ||
          "function" === typeof newProps.componentWillMount)
      )
        if (
          ((type = newProps.state),
          "function" === typeof newProps.componentWillMount &&
            newProps.componentWillMount(),
          "function" === typeof newProps.UNSAFE_componentWillMount &&
            newProps.UNSAFE_componentWillMount(),
          type !== newProps.state &&
            classComponentUpdater.enqueueReplaceState(
              newProps,
              newProps.state,
              null
            ),
          null !== defaultProps.queue && 0 < defaultProps.queue.length)
        )
          if (
            ((type = defaultProps.queue),
            (contextType = defaultProps.replace),
            (defaultProps.queue = null),
            (defaultProps.replace = !1),
            contextType && 1 === type.length)
          )
            newProps.state = type[0];
          else {
            defaultProps = contextType ? type[0] : newProps.state;
            initialState = !0;
            for (
              contextType = contextType ? 1 : 0;
              contextType < type.length;
              contextType++
            )
              (ref = type[contextType]),
                (ref =
                  "function" === typeof ref
                    ? ref.call(newProps, defaultProps, props, void 0)
                    : ref),
                null != ref &&
                  (initialState
                    ? ((initialState = !1),
                      (defaultProps = assign({}, defaultProps, ref)))
                    : assign(defaultProps, ref));
            newProps.state = defaultProps;
          }
        else defaultProps.queue = null;
      type = newProps.render();
      if (1 === request.status) throw AbortSigil;
      props = task.keyPath;
      task.keyPath = keyPath;
      renderNodeDestructive(request, task, type, -1);
      task.keyPath = props;
    } else {
      type = renderWithHooks(request, task, keyPath, type, props, void 0);
      if (1 === request.status) throw AbortSigil;
      finishFunctionComponent(
        request,
        task,
        keyPath,
        type,
        0 !== localIdCounter,
        actionStateCounter,
        actionStateMatchingIndex
      );
    }
  else if ("string" === typeof type)
    if (((newProps = task.blockedSegment), null === newProps))
      (newProps = props.children),
        (defaultProps = task.formatContext),
        (initialState = task.keyPath),
        (task.formatContext = getChildFormatContext(defaultProps, type, props)),
        (task.keyPath = keyPath),
        renderNode(request, task, newProps, -1),
        (task.formatContext = defaultProps),
        (task.keyPath = initialState);
    else {
      defaultProps = newProps.chunks;
      initialState = request.resumableState;
      ref = request.renderState;
      propName$89 = task.hoistableState;
      propName = task.formatContext;
      var textEmbedded = newProps.lastPushedText,
        isFallback = task.isFallback;
      for (contextType in props)
        if (hasOwnProperty.call(props, contextType)) {
          var propValue = props[contextType];
          if ("ref" === contextType && null != propValue)
            throw Error(
              "Cannot pass ref in renderToHTML because they will never be hydrated."
            );
          if ("function" === typeof propValue)
            throw Error(
              "Cannot pass event handlers (" +
                contextType +
                ") in renderToHTML because the HTML will never be hydrated so they can never get called."
            );
        }
      initialState = pushStartInstance$1(
        defaultProps,
        type,
        props,
        initialState,
        ref,
        propName$89,
        propName,
        textEmbedded,
        isFallback
      );
      newProps.lastPushedText = !1;
      defaultProps = task.formatContext;
      contextType = task.keyPath;
      task.formatContext = getChildFormatContext(defaultProps, type, props);
      task.keyPath = keyPath;
      renderNode(request, task, initialState, -1);
      task.formatContext = defaultProps;
      task.keyPath = contextType;
      a: {
        task = newProps.chunks;
        request = request.resumableState;
        switch (type) {
          case "title":
          case "style":
          case "script":
          case "area":
          case "base":
          case "br":
          case "col":
          case "embed":
          case "hr":
          case "img":
          case "input":
          case "keygen":
          case "link":
          case "meta":
          case "param":
          case "source":
          case "track":
          case "wbr":
            break a;
          case "body":
            if (1 >= defaultProps.insertionMode) {
              request.hasBody = !0;
              break a;
            }
            break;
          case "html":
            if (0 === defaultProps.insertionMode) {
              request.hasHtml = !0;
              break a;
            }
        }
        task.push(endChunkForTag(type));
      }
      newProps.lastPushedText = !1;
    }
  else {
    switch (type) {
      case REACT_LEGACY_HIDDEN_TYPE:
      case REACT_DEBUG_TRACING_MODE_TYPE:
      case REACT_STRICT_MODE_TYPE:
      case REACT_PROFILER_TYPE:
      case REACT_FRAGMENT_TYPE:
        type = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = type;
        return;
      case REACT_OFFSCREEN_TYPE:
        "hidden" !== props.mode &&
          ((type = task.keyPath),
          (task.keyPath = keyPath),
          renderNodeDestructive(request, task, props.children, -1),
          (task.keyPath = type));
        return;
      case REACT_SUSPENSE_LIST_TYPE:
        type = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, props.children, -1);
        task.keyPath = type;
        return;
      case REACT_SCOPE_TYPE:
        throw Error("ReactDOMServer does not yet support scope components.");
      case REACT_SUSPENSE_TYPE:
        a: if (null !== task.replay) {
          type = task.keyPath;
          task.keyPath = keyPath;
          keyPath = props.children;
          try {
            renderNode(request, task, keyPath, -1);
          } finally {
            task.keyPath = type;
          }
        } else {
          type = task.keyPath;
          isFallback = task.blockedBoundary;
          propValue = task.hoistableState;
          contextType = task.blockedSegment;
          ref = props.fallback;
          props = props.children;
          var fallbackAbortSet = new Set();
          propName$89 = createSuspenseBoundary(request, fallbackAbortSet);
          null !== request.trackedPostpones &&
            (propName$89.trackedContentKeyPath = keyPath);
          propName = createPendingSegment(
            request,
            contextType.chunks.length,
            propName$89,
            task.formatContext,
            !1,
            !1
          );
          contextType.children.push(propName);
          contextType.lastPushedText = !1;
          textEmbedded = createPendingSegment(
            request,
            0,
            null,
            task.formatContext,
            !1,
            !1
          );
          textEmbedded.parentFlushed = !0;
          if (null !== request.trackedPostpones) {
            newProps = [keyPath[0], "Suspense Fallback", keyPath[2]];
            defaultProps = [newProps[1], newProps[2], [], null];
            request.trackedPostpones.workingMap.set(newProps, defaultProps);
            propName$89.trackedFallbackNode = defaultProps;
            task.blockedSegment = propName;
            task.keyPath = newProps;
            propName.status = 6;
            try {
              renderNode(request, task, ref, -1), (propName.status = 1);
            } catch (thrownValue) {
              throw (
                ((propName.status = thrownValue === AbortSigil ? 3 : 4),
                thrownValue)
              );
            } finally {
              (task.blockedSegment = contextType), (task.keyPath = type);
            }
            task = createRenderTask(
              request,
              null,
              props,
              -1,
              propName$89,
              textEmbedded,
              propName$89.contentState,
              task.abortSet,
              keyPath,
              task.formatContext,
              task.context,
              task.treeContext,
              task.componentStack,
              task.isFallback
            );
            pushComponentStack(task);
            request.pingedTasks.push(task);
          } else {
            task.blockedBoundary = propName$89;
            task.hoistableState = propName$89.contentState;
            task.blockedSegment = textEmbedded;
            task.keyPath = keyPath;
            textEmbedded.status = 6;
            try {
              if (
                (renderNode(request, task, props, -1),
                (textEmbedded.status = 1),
                queueCompletedSegment(propName$89, textEmbedded),
                0 === propName$89.pendingTasks && 0 === propName$89.status)
              ) {
                propName$89.status = 1;
                break a;
              }
            } catch (thrownValue$84) {
              (propName$89.status = 4),
                thrownValue$84 === AbortSigil
                  ? ((textEmbedded.status = 3), (newProps = request.fatalError))
                  : ((textEmbedded.status = 4), (newProps = thrownValue$84)),
                (defaultProps = getThrownInfo(task.componentStack)),
                "object" === typeof newProps &&
                null !== newProps &&
                newProps.$$typeof === REACT_POSTPONE_TYPE
                  ? (logPostpone(request, newProps.message, defaultProps),
                    (initialState = "POSTPONE"))
                  : (initialState = logRecoverableError(
                      request,
                      newProps,
                      defaultProps
                    )),
                (propName$89.errorDigest = initialState),
                untrackBoundary(request, propName$89);
            } finally {
              (task.blockedBoundary = isFallback),
                (task.hoistableState = propValue),
                (task.blockedSegment = contextType),
                (task.keyPath = type);
            }
            task = createRenderTask(
              request,
              null,
              ref,
              -1,
              isFallback,
              propName,
              propName$89.fallbackState,
              fallbackAbortSet,
              [keyPath[0], "Suspense Fallback", keyPath[2]],
              task.formatContext,
              task.context,
              task.treeContext,
              task.componentStack,
              !0
            );
            pushComponentStack(task);
            request.pingedTasks.push(task);
          }
        }
        return;
    }
    if ("object" === typeof type && null !== type)
      switch (type.$$typeof) {
        case REACT_FORWARD_REF_TYPE:
          if ("ref" in props)
            for (textEmbedded in ((newProps = {}), props))
              "ref" !== textEmbedded &&
                (newProps[textEmbedded] = props[textEmbedded]);
          else newProps = props;
          type = renderWithHooks(
            request,
            task,
            keyPath,
            type.render,
            newProps,
            ref
          );
          finishFunctionComponent(
            request,
            task,
            keyPath,
            type,
            0 !== localIdCounter,
            actionStateCounter,
            actionStateMatchingIndex
          );
          return;
        case REACT_MEMO_TYPE:
          renderElement(request, task, keyPath, type.type, props, ref);
          return;
        case REACT_PROVIDER_TYPE:
        case REACT_CONTEXT_TYPE:
          defaultProps = props.children;
          newProps = task.keyPath;
          props = props.value;
          initialState = type._currentValue2;
          type._currentValue2 = props;
          contextType = currentActiveSnapshot;
          currentActiveSnapshot = type = {
            parent: contextType,
            depth: null === contextType ? 0 : contextType.depth + 1,
            context: type,
            parentValue: initialState,
            value: props
          };
          task.context = type;
          task.keyPath = keyPath;
          renderNodeDestructive(request, task, defaultProps, -1);
          request = currentActiveSnapshot;
          if (null === request)
            throw Error(
              "Tried to pop a Context at the root of the app. This is a bug in React."
            );
          request.context._currentValue2 = request.parentValue;
          request = currentActiveSnapshot = request.parent;
          task.context = request;
          task.keyPath = newProps;
          return;
        case REACT_CONSUMER_TYPE:
          props = props.children;
          type = props(type._context._currentValue2);
          props = task.keyPath;
          task.keyPath = keyPath;
          renderNodeDestructive(request, task, type, -1);
          task.keyPath = props;
          return;
        case REACT_LAZY_TYPE:
          newProps = type._init;
          type = newProps(type._payload);
          if (1 === request.status) throw AbortSigil;
          renderElement(request, task, keyPath, type, props, ref);
          return;
      }
    throw Error(
      "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " +
        ((null == type ? type : typeof type) + ".")
    );
  }
}
function resumeNode(request, task, segmentId, node, childIndex) {
  var prevReplay = task.replay,
    blockedBoundary = task.blockedBoundary,
    resumedSegment = createPendingSegment(
      request,
      0,
      null,
      task.formatContext,
      !1,
      !1
    );
  resumedSegment.id = segmentId;
  resumedSegment.parentFlushed = !0;
  try {
    (task.replay = null),
      (task.blockedSegment = resumedSegment),
      renderNode(request, task, node, childIndex),
      (resumedSegment.status = 1),
      null === blockedBoundary
        ? (request.completedRootSegment = resumedSegment)
        : (queueCompletedSegment(blockedBoundary, resumedSegment),
          blockedBoundary.parentFlushed &&
            request.partialBoundaries.push(blockedBoundary));
  } finally {
    (task.replay = prevReplay), (task.blockedSegment = null);
  }
}
function renderNodeDestructive(request, task, node, childIndex) {
  null !== task.replay && "number" === typeof task.replay.slots
    ? resumeNode(request, task, task.replay.slots, node, childIndex)
    : ((task.node = node),
      (task.childIndex = childIndex),
      (node = task.componentStack),
      pushComponentStack(task),
      retryNode(request, task),
      (task.componentStack = node));
}
function retryNode(request, task) {
  var node = task.node,
    childIndex = task.childIndex;
  if (null !== node) {
    if ("object" === typeof node) {
      switch (node.$$typeof) {
        case REACT_ELEMENT_TYPE:
          var type = node.type,
            key = node.key,
            props = node.props;
          node = props.ref;
          var ref = void 0 !== node ? node : null;
          var name = getComponentNameFromType(type),
            keyOrIndex =
              null == key ? (-1 === childIndex ? 0 : childIndex) : key;
          key = [task.keyPath, name, keyOrIndex];
          if (null !== task.replay)
            a: {
              var replay = task.replay;
              childIndex = replay.nodes;
              for (node = 0; node < childIndex.length; node++) {
                var node$jscomp$0 = childIndex[node];
                if (keyOrIndex === node$jscomp$0[1]) {
                  if (4 === node$jscomp$0.length) {
                    if (null !== name && name !== node$jscomp$0[0])
                      throw Error(
                        "Expected the resume to render <" +
                          node$jscomp$0[0] +
                          "> in this slot but instead it rendered <" +
                          name +
                          ">. The tree doesn't match so React will fallback to client rendering."
                      );
                    var childNodes = node$jscomp$0[2];
                    name = node$jscomp$0[3];
                    keyOrIndex = task.node;
                    task.replay = {
                      nodes: childNodes,
                      slots: name,
                      pendingTasks: 1
                    };
                    try {
                      renderElement(request, task, key, type, props, ref);
                      if (
                        1 === task.replay.pendingTasks &&
                        0 < task.replay.nodes.length
                      )
                        throw Error(
                          "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                        );
                      task.replay.pendingTasks--;
                    } catch (x) {
                      if (
                        "object" === typeof x &&
                        null !== x &&
                        (x === SuspenseException ||
                          "function" === typeof x.then)
                      )
                        throw (
                          (task.node === keyOrIndex && (task.replay = replay),
                          x)
                        );
                      task.replay.pendingTasks--;
                      props = getThrownInfo(task.componentStack);
                      erroredReplay(
                        request,
                        task.blockedBoundary,
                        x,
                        props,
                        childNodes,
                        name
                      );
                    }
                    task.replay = replay;
                  } else {
                    if (type !== REACT_SUSPENSE_TYPE)
                      throw Error(
                        "Expected the resume to render <Suspense> in this slot but instead it rendered <" +
                          (getComponentNameFromType(type) || "Unknown") +
                          ">. The tree doesn't match so React will fallback to client rendering."
                      );
                    b: {
                      type = void 0;
                      ref = node$jscomp$0[5];
                      replay = node$jscomp$0[2];
                      name = node$jscomp$0[3];
                      keyOrIndex =
                        null === node$jscomp$0[4] ? [] : node$jscomp$0[4][2];
                      node$jscomp$0 =
                        null === node$jscomp$0[4] ? null : node$jscomp$0[4][3];
                      var prevKeyPath = task.keyPath,
                        previousReplaySet = task.replay,
                        parentBoundary = task.blockedBoundary,
                        parentHoistableState = task.hoistableState,
                        content = props.children;
                      props = props.fallback;
                      var fallbackAbortSet = new Set(),
                        resumedBoundary = createSuspenseBoundary(
                          request,
                          fallbackAbortSet
                        );
                      resumedBoundary.parentFlushed = !0;
                      resumedBoundary.rootSegmentID = ref;
                      task.blockedBoundary = resumedBoundary;
                      task.hoistableState = resumedBoundary.contentState;
                      task.replay = {
                        nodes: replay,
                        slots: name,
                        pendingTasks: 1
                      };
                      try {
                        renderNode(request, task, content, -1);
                        if (
                          1 === task.replay.pendingTasks &&
                          0 < task.replay.nodes.length
                        )
                          throw Error(
                            "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                          );
                        task.replay.pendingTasks--;
                        if (
                          0 === resumedBoundary.pendingTasks &&
                          0 === resumedBoundary.status
                        ) {
                          resumedBoundary.status = 1;
                          request.completedBoundaries.push(resumedBoundary);
                          break b;
                        }
                      } catch (error) {
                        (resumedBoundary.status = 4),
                          (childNodes = getThrownInfo(task.componentStack)),
                          "object" === typeof error &&
                          null !== error &&
                          error.$$typeof === REACT_POSTPONE_TYPE
                            ? (logPostpone(request, error.message, childNodes),
                              (type = "POSTPONE"))
                            : (type = logRecoverableError(
                                request,
                                error,
                                childNodes
                              )),
                          (resumedBoundary.errorDigest = type),
                          task.replay.pendingTasks--,
                          request.clientRenderedBoundaries.push(
                            resumedBoundary
                          );
                      } finally {
                        (task.blockedBoundary = parentBoundary),
                          (task.hoistableState = parentHoistableState),
                          (task.replay = previousReplaySet),
                          (task.keyPath = prevKeyPath);
                      }
                      task = createReplayTask(
                        request,
                        null,
                        {
                          nodes: keyOrIndex,
                          slots: node$jscomp$0,
                          pendingTasks: 0
                        },
                        props,
                        -1,
                        parentBoundary,
                        resumedBoundary.fallbackState,
                        fallbackAbortSet,
                        [key[0], "Suspense Fallback", key[2]],
                        task.formatContext,
                        task.context,
                        task.treeContext,
                        task.componentStack,
                        !0
                      );
                      pushComponentStack(task);
                      request.pingedTasks.push(task);
                    }
                  }
                  childIndex.splice(node, 1);
                  break a;
                }
              }
            }
          else renderElement(request, task, key, type, props, ref);
          return;
        case REACT_PORTAL_TYPE:
          throw Error(
            "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
          );
        case REACT_LAZY_TYPE:
          childNodes = node._init;
          node = childNodes(node._payload);
          if (1 === request.status) throw AbortSigil;
          renderNodeDestructive(request, task, node, childIndex);
          return;
      }
      if (isArrayImpl(node)) {
        renderChildrenArray(request, task, node, childIndex);
        return;
      }
      if ((childNodes = getIteratorFn(node)))
        if ((childNodes = childNodes.call(node))) {
          node = childNodes.next();
          if (!node.done) {
            props = [];
            do props.push(node.value), (node = childNodes.next());
            while (!node.done);
            renderChildrenArray(request, task, props, childIndex);
          }
          return;
        }
      if (
        "function" === typeof node[ASYNC_ITERATOR] &&
        (childNodes = node[ASYNC_ITERATOR]())
      ) {
        props = task.thenableState;
        task.thenableState = null;
        thenableIndexCounter = 0;
        thenableState = props;
        props = [];
        key = !1;
        if (childNodes === node)
          for (node = readPreviousThenableFromState(); void 0 !== node; ) {
            if (node.done) {
              key = !0;
              break;
            }
            props.push(node.value);
            node = readPreviousThenableFromState();
          }
        if (!key)
          for (node = unwrapThenable(childNodes.next()); !node.done; )
            props.push(node.value), (node = unwrapThenable(childNodes.next()));
        renderChildrenArray(request, task, props, childIndex);
        return;
      }
      if ("function" === typeof node.then)
        return (
          (task.thenableState = null),
          renderNodeDestructive(request, task, unwrapThenable(node), childIndex)
        );
      if (node.$$typeof === REACT_CONTEXT_TYPE)
        return renderNodeDestructive(
          request,
          task,
          node._currentValue2,
          childIndex
        );
      task = Object.prototype.toString.call(node);
      throw Error(
        "Objects are not valid as a React child (found: " +
          ("[object Object]" === task
            ? "object with keys {" + Object.keys(node).join(", ") + "}"
            : task) +
          "). If you meant to render a collection of children, use an array instead."
      );
    }
    if ("string" === typeof node)
      (task = task.blockedSegment),
        null !== task &&
          (task.chunks.push(escapeTextForBrowser(node)),
          (task.lastPushedText = !1));
    else if ("number" === typeof node || "bigint" === typeof node)
      (task = task.blockedSegment),
        null !== task &&
          (task.chunks.push(escapeTextForBrowser("" + node)),
          (task.lastPushedText = !1));
  }
}
function renderChildrenArray(request, task, children, childIndex) {
  var prevKeyPath = task.keyPath;
  if (
    -1 !== childIndex &&
    ((task.keyPath = [task.keyPath, "Fragment", childIndex]),
    null !== task.replay)
  ) {
    for (
      var replay = task.replay, replayNodes = replay.nodes, j = 0;
      j < replayNodes.length;
      j++
    ) {
      var node = replayNodes[j];
      if (node[1] === childIndex) {
        childIndex = node[2];
        node = node[3];
        task.replay = { nodes: childIndex, slots: node, pendingTasks: 1 };
        try {
          renderChildrenArray(request, task, children, -1);
          if (1 === task.replay.pendingTasks && 0 < task.replay.nodes.length)
            throw Error(
              "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
            );
          task.replay.pendingTasks--;
        } catch (x) {
          if (
            "object" === typeof x &&
            null !== x &&
            (x === SuspenseException || "function" === typeof x.then)
          )
            throw x;
          task.replay.pendingTasks--;
          children = getThrownInfo(task.componentStack);
          erroredReplay(
            request,
            task.blockedBoundary,
            x,
            children,
            childIndex,
            node
          );
        }
        task.replay = replay;
        replayNodes.splice(j, 1);
        break;
      }
    }
    task.keyPath = prevKeyPath;
    return;
  }
  replay = task.treeContext;
  replayNodes = children.length;
  if (
    null !== task.replay &&
    ((j = task.replay.slots), null !== j && "object" === typeof j)
  ) {
    for (childIndex = 0; childIndex < replayNodes; childIndex++) {
      node = children[childIndex];
      task.treeContext = pushTreeContext(replay, replayNodes, childIndex);
      var resumeSegmentID = j[childIndex];
      "number" === typeof resumeSegmentID
        ? (resumeNode(request, task, resumeSegmentID, node, childIndex),
          delete j[childIndex])
        : renderNode(request, task, node, childIndex);
    }
    task.treeContext = replay;
    task.keyPath = prevKeyPath;
    return;
  }
  for (j = 0; j < replayNodes; j++)
    (childIndex = children[j]),
      (task.treeContext = pushTreeContext(replay, replayNodes, j)),
      renderNode(request, task, childIndex, j);
  task.treeContext = replay;
  task.keyPath = prevKeyPath;
}
function trackPostpone(request, trackedPostpones, task, segment) {
  segment.status = 5;
  var keyPath = task.keyPath,
    boundary = task.blockedBoundary;
  if (null === boundary)
    (segment.id = request.nextSegmentId++),
      (trackedPostpones.rootSlots = segment.id),
      null !== request.completedRootSegment &&
        (request.completedRootSegment.status = 5);
  else {
    if (null !== boundary && 0 === boundary.status) {
      boundary.status = 5;
      boundary.rootSegmentID = request.nextSegmentId++;
      var boundaryKeyPath = boundary.trackedContentKeyPath;
      if (null === boundaryKeyPath)
        throw Error(
          "It should not be possible to postpone at the root. This is a bug in React."
        );
      var fallbackReplayNode = boundary.trackedFallbackNode,
        children = [];
      if (boundaryKeyPath === keyPath && -1 === task.childIndex) {
        -1 === segment.id &&
          (segment.id = segment.parentFlushed
            ? boundary.rootSegmentID
            : request.nextSegmentId++);
        segment = [
          boundaryKeyPath[1],
          boundaryKeyPath[2],
          children,
          segment.id,
          fallbackReplayNode,
          boundary.rootSegmentID
        ];
        trackedPostpones.workingMap.set(boundaryKeyPath, segment);
        addToReplayParent(segment, boundaryKeyPath[0], trackedPostpones);
        return;
      }
      var boundaryNode$99 = trackedPostpones.workingMap.get(boundaryKeyPath);
      void 0 === boundaryNode$99
        ? ((boundaryNode$99 = [
            boundaryKeyPath[1],
            boundaryKeyPath[2],
            children,
            null,
            fallbackReplayNode,
            boundary.rootSegmentID
          ]),
          trackedPostpones.workingMap.set(boundaryKeyPath, boundaryNode$99),
          addToReplayParent(
            boundaryNode$99,
            boundaryKeyPath[0],
            trackedPostpones
          ))
        : ((boundaryKeyPath = boundaryNode$99),
          (boundaryKeyPath[4] = fallbackReplayNode),
          (boundaryKeyPath[5] = boundary.rootSegmentID));
    }
    -1 === segment.id &&
      (segment.id =
        segment.parentFlushed && null !== boundary
          ? boundary.rootSegmentID
          : request.nextSegmentId++);
    if (-1 === task.childIndex)
      null === keyPath
        ? (trackedPostpones.rootSlots = segment.id)
        : ((task = trackedPostpones.workingMap.get(keyPath)),
          void 0 === task
            ? ((task = [keyPath[1], keyPath[2], [], segment.id]),
              addToReplayParent(task, keyPath[0], trackedPostpones))
            : (task[3] = segment.id));
    else {
      if (null === keyPath)
        if (((request = trackedPostpones.rootSlots), null === request))
          request = trackedPostpones.rootSlots = {};
        else {
          if ("number" === typeof request)
            throw Error(
              "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
            );
        }
      else if (
        ((boundary = trackedPostpones.workingMap),
        (boundaryKeyPath = boundary.get(keyPath)),
        void 0 === boundaryKeyPath)
      )
        (request = {}),
          (boundaryKeyPath = [keyPath[1], keyPath[2], [], request]),
          boundary.set(keyPath, boundaryKeyPath),
          addToReplayParent(boundaryKeyPath, keyPath[0], trackedPostpones);
      else if (((request = boundaryKeyPath[3]), null === request))
        request = boundaryKeyPath[3] = {};
      else if ("number" === typeof request)
        throw Error(
          "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
        );
      request[task.childIndex] = segment.id;
    }
  }
}
function untrackBoundary(request, boundary) {
  request = request.trackedPostpones;
  null !== request &&
    ((boundary = boundary.trackedContentKeyPath),
    null !== boundary &&
      ((boundary = request.workingMap.get(boundary)),
      void 0 !== boundary &&
        ((boundary.length = 4), (boundary[2] = []), (boundary[3] = null))));
}
function renderNode(request, task, node, childIndex) {
  var previousFormatContext = task.formatContext,
    previousContext = task.context,
    previousKeyPath = task.keyPath,
    previousTreeContext = task.treeContext,
    previousComponentStack = task.componentStack,
    segment = task.blockedSegment;
  if (null === segment)
    try {
      return renderNodeDestructive(request, task, node, childIndex);
    } catch (thrownValue) {
      if (
        (resetHooksState(),
        (childIndex =
          thrownValue === SuspenseException
            ? getSuspendedThenable()
            : thrownValue),
        "object" === typeof childIndex &&
          null !== childIndex &&
          "function" === typeof childIndex.then)
      ) {
        node = childIndex;
        childIndex = getThenableStateAfterSuspending();
        request = createReplayTask(
          request,
          childIndex,
          task.replay,
          task.node,
          task.childIndex,
          task.blockedBoundary,
          task.hoistableState,
          task.abortSet,
          task.keyPath,
          task.formatContext,
          task.context,
          task.treeContext,
          task.componentStack,
          task.isFallback
        ).ping;
        node.then(request, request);
        task.formatContext = previousFormatContext;
        task.context = previousContext;
        task.keyPath = previousKeyPath;
        task.treeContext = previousTreeContext;
        task.componentStack = previousComponentStack;
        switchContext(previousContext);
        return;
      }
    }
  else {
    var childrenLength = segment.children.length,
      chunkLength = segment.chunks.length;
    try {
      return renderNodeDestructive(request, task, node, childIndex);
    } catch (thrownValue$105) {
      if (
        (resetHooksState(),
        (segment.children.length = childrenLength),
        (segment.chunks.length = chunkLength),
        (childIndex =
          thrownValue$105 === SuspenseException
            ? getSuspendedThenable()
            : thrownValue$105),
        "object" === typeof childIndex && null !== childIndex)
      ) {
        if ("function" === typeof childIndex.then) {
          node = childIndex;
          childIndex = getThenableStateAfterSuspending();
          segment = task.blockedSegment;
          childrenLength = createPendingSegment(
            request,
            segment.chunks.length,
            null,
            task.formatContext,
            segment.lastPushedText,
            !0
          );
          segment.children.push(childrenLength);
          segment.lastPushedText = !1;
          request = createRenderTask(
            request,
            childIndex,
            task.node,
            task.childIndex,
            task.blockedBoundary,
            childrenLength,
            task.hoistableState,
            task.abortSet,
            task.keyPath,
            task.formatContext,
            task.context,
            task.treeContext,
            task.componentStack,
            task.isFallback
          ).ping;
          node.then(request, request);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
        if (
          childIndex.$$typeof === REACT_POSTPONE_TYPE &&
          null !== request.trackedPostpones &&
          null !== task.blockedBoundary
        ) {
          node = request.trackedPostpones;
          segment = getThrownInfo(task.componentStack);
          logPostpone(request, childIndex.message, segment);
          childIndex = task.blockedSegment;
          segment = createPendingSegment(
            request,
            childIndex.chunks.length,
            null,
            task.formatContext,
            childIndex.lastPushedText,
            !0
          );
          childIndex.children.push(segment);
          childIndex.lastPushedText = !1;
          trackPostpone(request, node, task, segment);
          task.formatContext = previousFormatContext;
          task.context = previousContext;
          task.keyPath = previousKeyPath;
          task.treeContext = previousTreeContext;
          task.componentStack = previousComponentStack;
          switchContext(previousContext);
          return;
        }
      }
    }
  }
  task.formatContext = previousFormatContext;
  task.context = previousContext;
  task.keyPath = previousKeyPath;
  task.treeContext = previousTreeContext;
  switchContext(previousContext);
  throw childIndex;
}
function erroredReplay(
  request,
  boundary,
  error,
  errorInfo,
  replayNodes,
  resumeSlots
) {
  "object" === typeof error &&
  null !== error &&
  error.$$typeof === REACT_POSTPONE_TYPE
    ? (logPostpone(request, error.message, errorInfo), (errorInfo = "POSTPONE"))
    : (errorInfo = logRecoverableError(request, error, errorInfo));
  abortRemainingReplayNodes(
    request,
    boundary,
    replayNodes,
    resumeSlots,
    error,
    errorInfo
  );
}
function abortTaskSoft(task) {
  var boundary = task.blockedBoundary;
  task = task.blockedSegment;
  null !== task && ((task.status = 3), finishedTask(this, boundary, task));
}
function abortRemainingReplayNodes(
  request$jscomp$0,
  boundary,
  nodes,
  slots,
  error,
  errorDigest$jscomp$0
) {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (4 === node.length)
      abortRemainingReplayNodes(
        request$jscomp$0,
        boundary,
        node[2],
        node[3],
        error,
        errorDigest$jscomp$0
      );
    else {
      node = node[5];
      var request = request$jscomp$0,
        errorDigest = errorDigest$jscomp$0,
        resumedBoundary = createSuspenseBoundary(request, new Set());
      resumedBoundary.parentFlushed = !0;
      resumedBoundary.rootSegmentID = node;
      resumedBoundary.status = 4;
      resumedBoundary.errorDigest = errorDigest;
      resumedBoundary.parentFlushed &&
        request.clientRenderedBoundaries.push(resumedBoundary);
    }
  }
  nodes.length = 0;
  if (null !== slots) {
    if (null === boundary)
      throw Error(
        "We should not have any resumable nodes in the shell. This is a bug in React."
      );
    4 !== boundary.status &&
      ((boundary.status = 4),
      (boundary.errorDigest = errorDigest$jscomp$0),
      boundary.parentFlushed &&
        request$jscomp$0.clientRenderedBoundaries.push(boundary));
    if ("object" === typeof slots) for (var index in slots) delete slots[index];
  }
}
function abortTask(task, request, error) {
  var boundary = task.blockedBoundary,
    segment = task.blockedSegment;
  if (null !== segment) {
    if (6 === segment.status) return;
    segment.status = 3;
  }
  if (null === boundary) {
    if (((boundary = {}), 2 !== request.status && 3 !== request.status)) {
      var replay = task.replay;
      if (null === replay) {
        "object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
          ? ((replay = request.trackedPostpones),
            null !== replay && null !== segment
              ? (logPostpone(request, error.message, boundary),
                trackPostpone(request, replay, task, segment),
                finishedTask(request, null, segment))
              : ((task = Error(
                  "The render was aborted with postpone when the shell is incomplete. Reason: " +
                    error.message
                )),
                logRecoverableError(request, task, boundary),
                fatalError(request, task)))
          : (logRecoverableError(request, error, boundary),
            fatalError(request, error));
        return;
      }
      replay.pendingTasks--;
      0 === replay.pendingTasks &&
        0 < replay.nodes.length &&
        ("object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
          ? (logPostpone(request, error.message, boundary), (task = "POSTPONE"))
          : (task = logRecoverableError(request, error, boundary)),
        abortRemainingReplayNodes(
          request,
          null,
          replay.nodes,
          replay.slots,
          error,
          task
        ));
      request.pendingRootTasks--;
      0 === request.pendingRootTasks && completeShell(request);
    }
  } else
    boundary.pendingTasks--,
      4 !== boundary.status &&
        ((boundary.status = 4),
        (task = getThrownInfo(task.componentStack)),
        "object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
          ? (logPostpone(request, error.message, task), (task = "POSTPONE"))
          : (task = logRecoverableError(request, error, task)),
        (boundary.errorDigest = task),
        untrackBoundary(request, boundary),
        boundary.parentFlushed &&
          request.clientRenderedBoundaries.push(boundary)),
      boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
        return abortTask(fallbackTask, request, error);
      }),
      boundary.fallbackAbortableTasks.clear();
  request.allPendingTasks--;
  0 === request.allPendingTasks && completeAll(request);
}
function safelyEmitEarlyPreloads(request, shellComplete) {
  try {
    var renderState = request.renderState,
      onHeaders = renderState.onHeaders;
    if (onHeaders) {
      var headers = renderState.headers;
      if (headers) {
        renderState.headers = null;
        var linkHeader = headers.preconnects;
        headers.fontPreloads &&
          (linkHeader && (linkHeader += ", "),
          (linkHeader += headers.fontPreloads));
        headers.highImagePreloads &&
          (linkHeader && (linkHeader += ", "),
          (linkHeader += headers.highImagePreloads));
        if (!shellComplete) {
          var queueIter = renderState.styles.values(),
            queueStep = queueIter.next();
          b: for (
            ;
            0 < headers.remainingCapacity && !queueStep.done;
            queueStep = queueIter.next()
          )
            for (
              var sheetIter = queueStep.value.sheets.values(),
                sheetStep = sheetIter.next();
              0 < headers.remainingCapacity && !sheetStep.done;
              sheetStep = sheetIter.next()
            ) {
              var sheet = sheetStep.value,
                props = sheet.props,
                key = props.href,
                props$jscomp$0 = sheet.props,
                header = getPreloadAsHeader(props$jscomp$0.href, "style", {
                  crossOrigin: props$jscomp$0.crossOrigin,
                  integrity: props$jscomp$0.integrity,
                  nonce: props$jscomp$0.nonce,
                  type: props$jscomp$0.type,
                  fetchPriority: props$jscomp$0.fetchPriority,
                  referrerPolicy: props$jscomp$0.referrerPolicy,
                  media: props$jscomp$0.media
                });
              if (0 <= (headers.remainingCapacity -= header.length + 2))
                (renderState.resets.style[key] = PRELOAD_NO_CREDS),
                  linkHeader && (linkHeader += ", "),
                  (linkHeader += header),
                  (renderState.resets.style[key] =
                    "string" === typeof props.crossOrigin ||
                    "string" === typeof props.integrity
                      ? [props.crossOrigin, props.integrity]
                      : PRELOAD_NO_CREDS);
              else break b;
            }
        }
        linkHeader ? onHeaders({ Link: linkHeader }) : onHeaders({});
      }
    }
  } catch (error) {
    logRecoverableError(request, error, {});
  }
}
function completeShell(request) {
  null === request.trackedPostpones && safelyEmitEarlyPreloads(request, !0);
  request.onShellError = noop;
  request = request.onShellReady;
  request();
}
function completeAll(request) {
  safelyEmitEarlyPreloads(
    request,
    null === request.trackedPostpones
      ? !0
      : null === request.completedRootSegment ||
          5 !== request.completedRootSegment.status
  );
  request = request.onAllReady;
  request();
}
function queueCompletedSegment(boundary, segment) {
  if (
    0 === segment.chunks.length &&
    1 === segment.children.length &&
    null === segment.children[0].boundary &&
    -1 === segment.children[0].id
  ) {
    var childSegment = segment.children[0];
    childSegment.id = segment.id;
    childSegment.parentFlushed = !0;
    1 === childSegment.status && queueCompletedSegment(boundary, childSegment);
  } else boundary.completedSegments.push(segment);
}
function finishedTask(request, boundary, segment) {
  if (null === boundary) {
    if (null !== segment && segment.parentFlushed) {
      if (null !== request.completedRootSegment)
        throw Error(
          "There can only be one root segment. This is a bug in React."
        );
      request.completedRootSegment = segment;
    }
    request.pendingRootTasks--;
    0 === request.pendingRootTasks && completeShell(request);
  } else
    boundary.pendingTasks--,
      4 !== boundary.status &&
        (0 === boundary.pendingTasks
          ? (0 === boundary.status && (boundary.status = 1),
            null !== segment &&
              segment.parentFlushed &&
              1 === segment.status &&
              queueCompletedSegment(boundary, segment),
            boundary.parentFlushed &&
              request.completedBoundaries.push(boundary),
            1 === boundary.status &&
              (boundary.fallbackAbortableTasks.forEach(abortTaskSoft, request),
              boundary.fallbackAbortableTasks.clear()))
          : null !== segment &&
            segment.parentFlushed &&
            1 === segment.status &&
            (queueCompletedSegment(boundary, segment),
            1 === boundary.completedSegments.length &&
              boundary.parentFlushed &&
              request.partialBoundaries.push(boundary)));
  request.allPendingTasks--;
  0 === request.allPendingTasks && completeAll(request);
}
function performWork(request$jscomp$1) {
  if (3 !== request$jscomp$1.status && 2 !== request$jscomp$1.status) {
    var prevContext = currentActiveSnapshot,
      prevDispatcher = ReactSharedInternals.H;
    ReactSharedInternals.H = HooksDispatcher;
    var prevAsyncDispatcher = ReactSharedInternals.A;
    ReactSharedInternals.A = DefaultAsyncDispatcher;
    var prevResumableState = currentResumableState;
    currentResumableState = request$jscomp$1.resumableState;
    try {
      var pingedTasks = request$jscomp$1.pingedTasks,
        i;
      for (i = 0; i < pingedTasks.length; i++) {
        var task = pingedTasks[i],
          request = request$jscomp$1,
          segment = task.blockedSegment;
        if (null === segment) {
          var request$jscomp$0 = request;
          if (0 !== task.replay.pendingTasks) {
            switchContext(task.context);
            try {
              "number" === typeof task.replay.slots
                ? resumeNode(
                    request$jscomp$0,
                    task,
                    task.replay.slots,
                    task.node,
                    task.childIndex
                  )
                : retryNode(request$jscomp$0, task);
              if (
                1 === task.replay.pendingTasks &&
                0 < task.replay.nodes.length
              )
                throw Error(
                  "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                );
              task.replay.pendingTasks--;
              task.abortSet.delete(task);
              finishedTask(request$jscomp$0, task.blockedBoundary, null);
            } catch (thrownValue) {
              resetHooksState();
              var x =
                thrownValue === SuspenseException
                  ? getSuspendedThenable()
                  : thrownValue;
              if (
                "object" === typeof x &&
                null !== x &&
                "function" === typeof x.then
              ) {
                var ping = task.ping;
                x.then(ping, ping);
                task.thenableState = getThenableStateAfterSuspending();
              } else {
                task.replay.pendingTasks--;
                task.abortSet.delete(task);
                var errorInfo = getThrownInfo(task.componentStack);
                erroredReplay(
                  request$jscomp$0,
                  task.blockedBoundary,
                  x === AbortSigil ? request$jscomp$0.fatalError : x,
                  errorInfo,
                  task.replay.nodes,
                  task.replay.slots
                );
                request$jscomp$0.pendingRootTasks--;
                0 === request$jscomp$0.pendingRootTasks &&
                  completeShell(request$jscomp$0);
                request$jscomp$0.allPendingTasks--;
                0 === request$jscomp$0.allPendingTasks &&
                  completeAll(request$jscomp$0);
              }
            } finally {
            }
          }
        } else
          a: {
            request$jscomp$0 = void 0;
            var segment$jscomp$0 = segment;
            if (0 === segment$jscomp$0.status) {
              segment$jscomp$0.status = 6;
              switchContext(task.context);
              var childrenLength = segment$jscomp$0.children.length,
                chunkLength = segment$jscomp$0.chunks.length;
              try {
                retryNode(request, task),
                  task.abortSet.delete(task),
                  (segment$jscomp$0.status = 1),
                  finishedTask(request, task.blockedBoundary, segment$jscomp$0);
              } catch (thrownValue) {
                resetHooksState();
                segment$jscomp$0.children.length = childrenLength;
                segment$jscomp$0.chunks.length = chunkLength;
                var x$jscomp$0 =
                  thrownValue === SuspenseException
                    ? getSuspendedThenable()
                    : thrownValue === AbortSigil
                      ? request.fatalError
                      : thrownValue;
                if ("object" === typeof x$jscomp$0 && null !== x$jscomp$0) {
                  if ("function" === typeof x$jscomp$0.then) {
                    segment$jscomp$0.status = 0;
                    task.thenableState = getThenableStateAfterSuspending();
                    var ping$jscomp$0 = task.ping;
                    x$jscomp$0.then(ping$jscomp$0, ping$jscomp$0);
                    break a;
                  }
                  if (
                    null !== request.trackedPostpones &&
                    x$jscomp$0.$$typeof === REACT_POSTPONE_TYPE
                  ) {
                    var trackedPostpones = request.trackedPostpones;
                    task.abortSet.delete(task);
                    var postponeInfo = getThrownInfo(task.componentStack);
                    logPostpone(request, x$jscomp$0.message, postponeInfo);
                    trackPostpone(
                      request,
                      trackedPostpones,
                      task,
                      segment$jscomp$0
                    );
                    finishedTask(
                      request,
                      task.blockedBoundary,
                      segment$jscomp$0
                    );
                    break a;
                  }
                }
                var errorInfo$jscomp$0 = getThrownInfo(task.componentStack);
                task.abortSet.delete(task);
                segment$jscomp$0.status = 4;
                var boundary = task.blockedBoundary;
                "object" === typeof x$jscomp$0 &&
                null !== x$jscomp$0 &&
                x$jscomp$0.$$typeof === REACT_POSTPONE_TYPE
                  ? (logPostpone(
                      request,
                      x$jscomp$0.message,
                      errorInfo$jscomp$0
                    ),
                    (request$jscomp$0 = "POSTPONE"))
                  : (request$jscomp$0 = logRecoverableError(
                      request,
                      x$jscomp$0,
                      errorInfo$jscomp$0
                    ));
                null === boundary
                  ? fatalError(request, x$jscomp$0)
                  : (boundary.pendingTasks--,
                    4 !== boundary.status &&
                      ((boundary.status = 4),
                      (boundary.errorDigest = request$jscomp$0),
                      untrackBoundary(request, boundary),
                      boundary.parentFlushed &&
                        request.clientRenderedBoundaries.push(boundary)));
                request.allPendingTasks--;
                0 === request.allPendingTasks && completeAll(request);
              } finally {
              }
            }
          }
      }
      pingedTasks.splice(0, i);
      null !== request$jscomp$1.destination &&
        flushCompletedQueues(request$jscomp$1, request$jscomp$1.destination);
    } catch (error) {
      logRecoverableError(request$jscomp$1, error, {}),
        fatalError(request$jscomp$1, error);
    } finally {
      (currentResumableState = prevResumableState),
        (ReactSharedInternals.H = prevDispatcher),
        (ReactSharedInternals.A = prevAsyncDispatcher),
        prevDispatcher === HooksDispatcher && switchContext(prevContext);
    }
  }
}
function flushSubtree(request, destination, segment, hoistableState) {
  segment.parentFlushed = !0;
  switch (segment.status) {
    case 0:
      segment.id = request.nextSegmentId++;
    case 5:
      return (
        (hoistableState = segment.id),
        (segment.lastPushedText = !1),
        (segment.textEmbedded = !1),
        (request = request.renderState),
        destination.push('<template id="'),
        destination.push(request.placeholderPrefix),
        (request = hoistableState.toString(16)),
        destination.push(request),
        destination.push('"></template>')
      );
    case 1:
      segment.status = 2;
      var r = !0,
        chunks = segment.chunks,
        chunkIdx = 0;
      segment = segment.children;
      for (var childIdx = 0; childIdx < segment.length; childIdx++) {
        for (r = segment[childIdx]; chunkIdx < r.index; chunkIdx++)
          destination.push(chunks[chunkIdx]);
        r = flushSegment(request, destination, r, hoistableState);
      }
      for (; chunkIdx < chunks.length - 1; chunkIdx++)
        destination.push(chunks[chunkIdx]);
      chunkIdx < chunks.length && (r = destination.push(chunks[chunkIdx]));
      return r;
    default:
      throw Error(
        "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
      );
  }
}
function flushSegment(request, destination, segment, hoistableState) {
  var boundary = segment.boundary;
  if (null === boundary)
    return flushSubtree(request, destination, segment, hoistableState);
  boundary.parentFlushed = !0;
  if (4 === boundary.status)
    return flushSubtree(request, destination, segment, hoistableState), !0;
  if (1 !== boundary.status)
    return (
      0 === boundary.status &&
        (boundary.rootSegmentID = request.nextSegmentId++),
      0 < boundary.completedSegments.length &&
        request.partialBoundaries.push(boundary),
      writeStartPendingSuspenseBoundary(
        destination,
        request.renderState,
        boundary.rootSegmentID
      ),
      hoistableState &&
        ((boundary = boundary.fallbackState),
        boundary.styles.forEach(hoistStyleQueueDependency, hoistableState),
        boundary.stylesheets.forEach(
          hoistStylesheetDependency,
          hoistableState
        )),
      flushSubtree(request, destination, segment, hoistableState),
      destination.push("\x3c!--/$--\x3e")
    );
  if (boundary.byteSize > request.progressiveChunkSize)
    return (
      (boundary.rootSegmentID = request.nextSegmentId++),
      request.completedBoundaries.push(boundary),
      writeStartPendingSuspenseBoundary(
        destination,
        request.renderState,
        boundary.rootSegmentID
      ),
      flushSubtree(request, destination, segment, hoistableState),
      destination.push("\x3c!--/$--\x3e")
    );
  hoistableState &&
    ((segment = boundary.contentState),
    segment.styles.forEach(hoistStyleQueueDependency, hoistableState),
    segment.stylesheets.forEach(hoistStylesheetDependency, hoistableState));
  segment = boundary.completedSegments;
  if (1 !== segment.length)
    throw Error(
      "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
    );
  flushSegment(request, destination, segment[0], hoistableState);
  return !0;
}
function flushSegmentContainer(request, destination, segment, hoistableState) {
  writeStartSegment(
    destination,
    request.renderState,
    segment.parentFormatContext,
    segment.id
  );
  flushSegment(request, destination, segment, hoistableState);
  return writeEndSegment(destination, segment.parentFormatContext);
}
function flushCompletedBoundary(request, destination, boundary) {
  for (
    var completedSegments = boundary.completedSegments, i = 0;
    i < completedSegments.length;
    i++
  )
    flushPartiallyCompletedSegment(
      request,
      destination,
      boundary,
      completedSegments[i]
    );
  completedSegments.length = 0;
  writeHoistablesForBoundary(
    destination,
    boundary.contentState,
    request.renderState
  );
  completedSegments = request.resumableState;
  request = request.renderState;
  i = boundary.rootSegmentID;
  boundary = boundary.contentState;
  var requiresStyleInsertion = request.stylesToHoist;
  request.stylesToHoist = !1;
  var scriptFormat = 0 === completedSegments.streamingFormat;
  scriptFormat
    ? (destination.push(request.startInlineScript),
      requiresStyleInsertion
        ? 0 === (completedSegments.instructions & 2)
          ? ((completedSegments.instructions |= 10),
            destination.push(
              '$RC=function(b,c,e){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(e)b.data="$!",a.setAttribute("data-dgst",e);else{e=b.parentNode;a=b.nextSibling;var f=0;do{if(a&&8===a.nodeType){var d=a.data;if("/$"===d)if(0===f)break;else f--;else"$"!==d&&"$?"!==d&&"$!"!==d||f++}d=a.nextSibling;e.removeChild(a);a=d}while(a);for(;c.firstChild;)e.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RM=new Map;\n$RR=function(t,u,y){function v(n){this._p=null;n()}for(var w=$RC,p=$RM,q=new Map,r=document,g,b,h=r.querySelectorAll("link[data-precedence],style[data-precedence]"),x=[],k=0;b=h[k++];)"not all"===b.getAttribute("media")?x.push(b):("LINK"===b.tagName&&p.set(b.getAttribute("href"),b),q.set(b.dataset.precedence,g=b));b=0;h=[];var l,a;for(k=!0;;){if(k){var e=y[b++];if(!e){k=!1;b=0;continue}var c=!1,m=0;var d=e[m++];if(a=p.get(d)){var f=a._p;c=!0}else{a=r.createElement("link");a.href=\nd;a.rel="stylesheet";for(a.dataset.precedence=l=e[m++];f=e[m++];)a.setAttribute(f,e[m++]);f=a._p=new Promise(function(n,z){a.onload=v.bind(a,n);a.onerror=v.bind(a,z)});p.set(d,a)}d=a.getAttribute("media");!f||d&&!matchMedia(d).matches||h.push(f);if(c)continue}else{a=x[b++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=q.get(l)||g;c===g&&(g=a);q.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=r.head,c.insertBefore(a,c.firstChild))}Promise.all(h).then(w.bind(null,\nt,u,""),w.bind(null,t,u,"Resource failed to load"))};$RR("'
            ))
          : 0 === (completedSegments.instructions & 8)
            ? ((completedSegments.instructions |= 8),
              destination.push(
                '$RM=new Map;\n$RR=function(t,u,y){function v(n){this._p=null;n()}for(var w=$RC,p=$RM,q=new Map,r=document,g,b,h=r.querySelectorAll("link[data-precedence],style[data-precedence]"),x=[],k=0;b=h[k++];)"not all"===b.getAttribute("media")?x.push(b):("LINK"===b.tagName&&p.set(b.getAttribute("href"),b),q.set(b.dataset.precedence,g=b));b=0;h=[];var l,a;for(k=!0;;){if(k){var e=y[b++];if(!e){k=!1;b=0;continue}var c=!1,m=0;var d=e[m++];if(a=p.get(d)){var f=a._p;c=!0}else{a=r.createElement("link");a.href=\nd;a.rel="stylesheet";for(a.dataset.precedence=l=e[m++];f=e[m++];)a.setAttribute(f,e[m++]);f=a._p=new Promise(function(n,z){a.onload=v.bind(a,n);a.onerror=v.bind(a,z)});p.set(d,a)}d=a.getAttribute("media");!f||d&&!matchMedia(d).matches||h.push(f);if(c)continue}else{a=x[b++];if(!a)break;l=a.getAttribute("data-precedence");a.removeAttribute("media")}c=q.get(l)||g;c===g&&(g=a);q.set(l,a);c?c.parentNode.insertBefore(a,c.nextSibling):(c=r.head,c.insertBefore(a,c.firstChild))}Promise.all(h).then(w.bind(null,\nt,u,""),w.bind(null,t,u,"Resource failed to load"))};$RR("'
              ))
            : destination.push('$RR("')
        : 0 === (completedSegments.instructions & 2)
          ? ((completedSegments.instructions |= 2),
            destination.push(
              '$RC=function(b,c,e){c=document.getElementById(c);c.parentNode.removeChild(c);var a=document.getElementById(b);if(a){b=a.previousSibling;if(e)b.data="$!",a.setAttribute("data-dgst",e);else{e=b.parentNode;a=b.nextSibling;var f=0;do{if(a&&8===a.nodeType){var d=a.data;if("/$"===d)if(0===f)break;else f--;else"$"!==d&&"$?"!==d&&"$!"!==d||f++}d=a.nextSibling;e.removeChild(a);a=d}while(a);for(;c.firstChild;)e.insertBefore(c.firstChild,a);b.data="$"}b._reactRetry&&b._reactRetry()}};$RC("'
            ))
          : destination.push('$RC("'))
    : requiresStyleInsertion
      ? destination.push('<template data-rri="" data-bid="')
      : destination.push('<template data-rci="" data-bid="');
  completedSegments = i.toString(16);
  destination.push(request.boundaryPrefix);
  destination.push(completedSegments);
  scriptFormat ? destination.push('","') : destination.push('" data-sid="');
  destination.push(request.segmentPrefix);
  destination.push(completedSegments);
  requiresStyleInsertion
    ? scriptFormat
      ? (destination.push('",'),
        writeStyleResourceDependenciesInJS(destination, boundary))
      : (destination.push('" data-sty="'),
        writeStyleResourceDependenciesInAttr(destination, boundary))
    : scriptFormat && destination.push('"');
  completedSegments = scriptFormat
    ? destination.push(")\x3c/script>")
    : destination.push('"></template>');
  return writeBootstrap(destination, request) && completedSegments;
}
function flushPartiallyCompletedSegment(
  request,
  destination,
  boundary,
  segment
) {
  if (2 === segment.status) return !0;
  var hoistableState = boundary.contentState,
    segmentID = segment.id;
  if (-1 === segmentID) {
    if (-1 === (segment.id = boundary.rootSegmentID))
      throw Error(
        "A root segment ID must have been assigned by now. This is a bug in React."
      );
    return flushSegmentContainer(request, destination, segment, hoistableState);
  }
  if (segmentID === boundary.rootSegmentID)
    return flushSegmentContainer(request, destination, segment, hoistableState);
  flushSegmentContainer(request, destination, segment, hoistableState);
  boundary = request.resumableState;
  request = request.renderState;
  (segment = 0 === boundary.streamingFormat)
    ? (destination.push(request.startInlineScript),
      0 === (boundary.instructions & 1)
        ? ((boundary.instructions |= 1),
          destination.push(
            '$RS=function(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'
          ))
        : destination.push('$RS("'))
    : destination.push('<template data-rsi="" data-sid="');
  destination.push(request.segmentPrefix);
  segmentID = segmentID.toString(16);
  destination.push(segmentID);
  segment ? destination.push('","') : destination.push('" data-pid="');
  destination.push(request.placeholderPrefix);
  destination.push(segmentID);
  destination = segment
    ? destination.push('")\x3c/script>')
    : destination.push('"></template>');
  return destination;
}
function flushCompletedQueues(request, destination) {
  try {
    if (!(0 < request.pendingRootTasks)) {
      var i,
        completedRootSegment = request.completedRootSegment;
      if (null !== completedRootSegment) {
        if (5 === completedRootSegment.status) return;
        var renderState = request.renderState;
        if (
          (0 !== request.allPendingTasks ||
            null !== request.trackedPostpones) &&
          renderState.externalRuntimeScript
        ) {
          var _renderState$external = renderState.externalRuntimeScript,
            resumableState = request.resumableState,
            src = _renderState$external.src,
            chunks = _renderState$external.chunks;
          resumableState.scriptResources.hasOwnProperty(src) ||
            ((resumableState.scriptResources[src] = null),
            renderState.scripts.add(chunks));
        }
        var htmlChunks = renderState.htmlChunks,
          headChunks = renderState.headChunks,
          i$jscomp$0;
        if (htmlChunks) {
          for (i$jscomp$0 = 0; i$jscomp$0 < htmlChunks.length; i$jscomp$0++)
            destination.push(htmlChunks[i$jscomp$0]);
          if (headChunks)
            for (i$jscomp$0 = 0; i$jscomp$0 < headChunks.length; i$jscomp$0++)
              destination.push(headChunks[i$jscomp$0]);
          else {
            var chunk = startChunkForTag("head");
            destination.push(chunk);
            destination.push(">");
          }
        } else if (headChunks)
          for (i$jscomp$0 = 0; i$jscomp$0 < headChunks.length; i$jscomp$0++)
            destination.push(headChunks[i$jscomp$0]);
        var charsetChunks = renderState.charsetChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < charsetChunks.length; i$jscomp$0++)
          destination.push(charsetChunks[i$jscomp$0]);
        charsetChunks.length = 0;
        renderState.preconnects.forEach(flushResource, destination);
        renderState.preconnects.clear();
        var viewportChunks = renderState.viewportChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < viewportChunks.length; i$jscomp$0++)
          destination.push(viewportChunks[i$jscomp$0]);
        viewportChunks.length = 0;
        renderState.fontPreloads.forEach(flushResource, destination);
        renderState.fontPreloads.clear();
        renderState.highImagePreloads.forEach(flushResource, destination);
        renderState.highImagePreloads.clear();
        renderState.styles.forEach(flushStylesInPreamble, destination);
        var importMapChunks = renderState.importMapChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < importMapChunks.length; i$jscomp$0++)
          destination.push(importMapChunks[i$jscomp$0]);
        importMapChunks.length = 0;
        renderState.bootstrapScripts.forEach(flushResource, destination);
        renderState.scripts.forEach(flushResource, destination);
        renderState.scripts.clear();
        renderState.bulkPreloads.forEach(flushResource, destination);
        renderState.bulkPreloads.clear();
        var hoistableChunks = renderState.hoistableChunks;
        for (i$jscomp$0 = 0; i$jscomp$0 < hoistableChunks.length; i$jscomp$0++)
          destination.push(hoistableChunks[i$jscomp$0]);
        hoistableChunks.length = 0;
        if (htmlChunks && null === headChunks) {
          var chunk$jscomp$0 = endChunkForTag("head");
          destination.push(chunk$jscomp$0);
        }
        flushSegment(request, destination, completedRootSegment, null);
        request.completedRootSegment = null;
        writeBootstrap(destination, request.renderState);
      }
      var renderState$jscomp$0 = request.renderState;
      completedRootSegment = 0;
      var viewportChunks$jscomp$0 = renderState$jscomp$0.viewportChunks;
      for (
        completedRootSegment = 0;
        completedRootSegment < viewportChunks$jscomp$0.length;
        completedRootSegment++
      )
        destination.push(viewportChunks$jscomp$0[completedRootSegment]);
      viewportChunks$jscomp$0.length = 0;
      renderState$jscomp$0.preconnects.forEach(flushResource, destination);
      renderState$jscomp$0.preconnects.clear();
      renderState$jscomp$0.fontPreloads.forEach(flushResource, destination);
      renderState$jscomp$0.fontPreloads.clear();
      renderState$jscomp$0.highImagePreloads.forEach(
        flushResource,
        destination
      );
      renderState$jscomp$0.highImagePreloads.clear();
      renderState$jscomp$0.styles.forEach(preloadLateStyles, destination);
      renderState$jscomp$0.scripts.forEach(flushResource, destination);
      renderState$jscomp$0.scripts.clear();
      renderState$jscomp$0.bulkPreloads.forEach(flushResource, destination);
      renderState$jscomp$0.bulkPreloads.clear();
      var hoistableChunks$jscomp$0 = renderState$jscomp$0.hoistableChunks;
      for (
        completedRootSegment = 0;
        completedRootSegment < hoistableChunks$jscomp$0.length;
        completedRootSegment++
      )
        destination.push(hoistableChunks$jscomp$0[completedRootSegment]);
      hoistableChunks$jscomp$0.length = 0;
      var clientRenderedBoundaries = request.clientRenderedBoundaries;
      for (i = 0; i < clientRenderedBoundaries.length; i++) {
        var boundary = clientRenderedBoundaries[i];
        renderState$jscomp$0 = destination;
        var resumableState$jscomp$0 = request.resumableState,
          renderState$jscomp$1 = request.renderState,
          id = boundary.rootSegmentID,
          errorDigest = boundary.errorDigest,
          scriptFormat = 0 === resumableState$jscomp$0.streamingFormat;
        scriptFormat
          ? (renderState$jscomp$0.push(renderState$jscomp$1.startInlineScript),
            0 === (resumableState$jscomp$0.instructions & 4)
              ? ((resumableState$jscomp$0.instructions |= 4),
                renderState$jscomp$0.push(
                  '$RX=function(b,c,d,e,f){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),f&&(a.cstck=f),b._reactRetry&&b._reactRetry())};;$RX("'
                ))
              : renderState$jscomp$0.push('$RX("'))
          : renderState$jscomp$0.push('<template data-rxi="" data-bid="');
        renderState$jscomp$0.push(renderState$jscomp$1.boundaryPrefix);
        var chunk$jscomp$1 = id.toString(16);
        renderState$jscomp$0.push(chunk$jscomp$1);
        scriptFormat && renderState$jscomp$0.push('"');
        if (errorDigest)
          if (scriptFormat) {
            renderState$jscomp$0.push(",");
            var chunk$jscomp$2 = escapeJSStringsForInstructionScripts(
              errorDigest || ""
            );
            renderState$jscomp$0.push(chunk$jscomp$2);
          } else {
            renderState$jscomp$0.push('" data-dgst="');
            var chunk$jscomp$3 = escapeTextForBrowser(errorDigest || "");
            renderState$jscomp$0.push(chunk$jscomp$3);
          }
        var JSCompiler_inline_result = scriptFormat
          ? renderState$jscomp$0.push(")\x3c/script>")
          : renderState$jscomp$0.push('"></template>');
        if (!JSCompiler_inline_result) {
          request.destination = null;
          i++;
          clientRenderedBoundaries.splice(0, i);
          return;
        }
      }
      clientRenderedBoundaries.splice(0, i);
      var completedBoundaries = request.completedBoundaries;
      for (i = 0; i < completedBoundaries.length; i++)
        if (
          !flushCompletedBoundary(request, destination, completedBoundaries[i])
        ) {
          request.destination = null;
          i++;
          completedBoundaries.splice(0, i);
          return;
        }
      completedBoundaries.splice(0, i);
      var partialBoundaries = request.partialBoundaries;
      for (i = 0; i < partialBoundaries.length; i++) {
        var boundary$111 = partialBoundaries[i];
        a: {
          clientRenderedBoundaries = request;
          boundary = destination;
          var completedSegments = boundary$111.completedSegments;
          for (
            JSCompiler_inline_result = 0;
            JSCompiler_inline_result < completedSegments.length;
            JSCompiler_inline_result++
          )
            if (
              !flushPartiallyCompletedSegment(
                clientRenderedBoundaries,
                boundary,
                boundary$111,
                completedSegments[JSCompiler_inline_result]
              )
            ) {
              JSCompiler_inline_result++;
              completedSegments.splice(0, JSCompiler_inline_result);
              var JSCompiler_inline_result$jscomp$0 = !1;
              break a;
            }
          completedSegments.splice(0, JSCompiler_inline_result);
          JSCompiler_inline_result$jscomp$0 = writeHoistablesForBoundary(
            boundary,
            boundary$111.contentState,
            clientRenderedBoundaries.renderState
          );
        }
        if (!JSCompiler_inline_result$jscomp$0) {
          request.destination = null;
          i++;
          partialBoundaries.splice(0, i);
          return;
        }
      }
      partialBoundaries.splice(0, i);
      var largeBoundaries = request.completedBoundaries;
      for (i = 0; i < largeBoundaries.length; i++)
        if (!flushCompletedBoundary(request, destination, largeBoundaries[i])) {
          request.destination = null;
          i++;
          largeBoundaries.splice(0, i);
          return;
        }
      largeBoundaries.splice(0, i);
    }
  } finally {
    0 === request.allPendingTasks &&
      0 === request.pingedTasks.length &&
      0 === request.clientRenderedBoundaries.length &&
      0 === request.completedBoundaries.length &&
      ((request.flushScheduled = !1),
      null === request.trackedPostpones &&
        ((i = request.resumableState),
        i.hasBody &&
          ((partialBoundaries = endChunkForTag("body")),
          destination.push(partialBoundaries)),
        i.hasHtml && ((i = endChunkForTag("html")), destination.push(i))),
      (request.status = 3),
      destination.push(null),
      (request.destination = null));
  }
}
function startFlowing(request, destination) {
  if (2 === request.status)
    (request.status = 3), destination.destroy(request.fatalError);
  else if (3 !== request.status && null === request.destination) {
    request.destination = destination;
    try {
      flushCompletedQueues(request, destination);
    } catch (error) {
      logRecoverableError(request, error, {}), fatalError(request, error);
    }
  }
}
function abort(request, reason) {
  0 === request.status && (request.status = 1);
  try {
    var abortableTasks = request.abortableTasks;
    if (0 < abortableTasks.size) {
      var error =
        void 0 === reason
          ? Error("The render was aborted by the server without a reason.")
          : "object" === typeof reason &&
              null !== reason &&
              "function" === typeof reason.then
            ? Error("The render was aborted by the server with a promise.")
            : reason;
      request.fatalError = error;
      abortableTasks.forEach(function (task) {
        return abortTask(task, request, error);
      });
      abortableTasks.clear();
    }
    null !== request.destination &&
      flushCompletedQueues(request, request.destination);
  } catch (error$113) {
    logRecoverableError(request, error$113, {}), fatalError(request, error$113);
  }
}
function addToReplayParent(node, parentKeyPath, trackedPostpones) {
  if (null === parentKeyPath) trackedPostpones.rootNodes.push(node);
  else {
    var workingMap = trackedPostpones.workingMap,
      parentNode = workingMap.get(parentKeyPath);
    void 0 === parentNode &&
      ((parentNode = [parentKeyPath[1], parentKeyPath[2], [], null]),
      workingMap.set(parentKeyPath, parentNode),
      addToReplayParent(parentNode, parentKeyPath[0], trackedPostpones));
    parentNode[2].push(node);
  }
}
function noServerCallOrFormAction() {
  throw Error(
    "renderToHTML should not have emitted Server References. This is a bug in React."
  );
}
exports.experimental_renderToHTML = function (children, options) {
  return new Promise(function (resolve, reject) {
    var flightDestination = {
        push: function (chunk) {
          if (null !== chunk) {
            for (
              var i = 0,
                rowState = flightResponse._rowState,
                rowID = flightResponse._rowID,
                rowTag = flightResponse._rowTag,
                rowLength = flightResponse._rowLength,
                buffer = flightResponse._buffer,
                chunkLength = chunk.length;
              i < chunkLength;

            ) {
              var lastIdx = -1;
              switch (rowState) {
                case 0:
                  lastIdx = chunk.charCodeAt(i++);
                  58 === lastIdx
                    ? (rowState = 1)
                    : (rowID =
                        (rowID << 4) |
                        (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
                  continue;
                case 1:
                  rowState = chunk.charCodeAt(i);
                  84 === rowState ||
                  65 === rowState ||
                  79 === rowState ||
                  111 === rowState ||
                  85 === rowState ||
                  83 === rowState ||
                  115 === rowState ||
                  76 === rowState ||
                  108 === rowState ||
                  71 === rowState ||
                  103 === rowState ||
                  77 === rowState ||
                  109 === rowState ||
                  86 === rowState
                    ? ((rowTag = rowState), (rowState = 2), i++)
                    : (64 < rowState && 91 > rowState) ||
                        114 === rowState ||
                        120 === rowState
                      ? ((rowTag = rowState), (rowState = 3), i++)
                      : ((rowTag = 0), (rowState = 3));
                  continue;
                case 2:
                  lastIdx = chunk.charCodeAt(i++);
                  44 === lastIdx
                    ? (rowState = 4)
                    : (rowLength =
                        (rowLength << 4) |
                        (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
                  continue;
                case 3:
                  lastIdx = chunk.indexOf("\n", i);
                  break;
                case 4:
                  if (84 !== rowTag)
                    throw Error(
                      "Binary RSC chunks cannot be encoded as strings. This is a bug in the wiring of the React streams."
                    );
                  if (rowLength < chunk.length || chunk.length > 3 * rowLength)
                    throw Error(
                      "String chunks need to be passed in their original shape. Not split into smaller string chunks. This is a bug in the wiring of the React streams."
                    );
                  lastIdx = chunk.length;
              }
              if (-1 < lastIdx) {
                if (0 < buffer.length)
                  throw Error(
                    "String chunks need to be passed in their original shape. Not split into smaller string chunks. This is a bug in the wiring of the React streams."
                  );
                i = chunk.slice(i, lastIdx);
                switch (rowTag) {
                  case 73:
                    throw (
                      (flightResponse._chunks.get(rowID),
                      JSON.parse(i, flightResponse._fromJSON),
                      Error(
                        "renderToHTML should not have emitted Client References. This is a bug in React."
                      ))
                    );
                  case 72:
                    rowID = i.slice(1);
                    JSON.parse(rowID, flightResponse._fromJSON);
                    break;
                  case 69:
                    rowTag = JSON.parse(i).digest;
                    i = Error(
                      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."
                    );
                    i.stack = "Error: " + i.message;
                    i.digest = rowTag;
                    rowTag = flightResponse._chunks;
                    (rowLength = rowTag.get(rowID))
                      ? triggerErrorOnChunk(rowLength, i)
                      : rowTag.set(
                          rowID,
                          new Chunk("rejected", null, i, flightResponse)
                        );
                    break;
                  case 84:
                    rowTag = flightResponse._chunks;
                    (rowLength = rowTag.get(rowID)) &&
                    "pending" !== rowLength.status
                      ? rowLength.reason.enqueueValue(i)
                      : rowTag.set(
                          rowID,
                          new Chunk("fulfilled", i, null, flightResponse)
                        );
                    break;
                  case 68:
                  case 87:
                    throw Error(
                      "Failed to read a RSC payload created by a development version of React on the server while using a production version on the client. Always use matching versions on the server and the client."
                    );
                  case 82:
                    startReadableStream(flightResponse, rowID, void 0);
                    break;
                  case 114:
                    startReadableStream(flightResponse, rowID, "bytes");
                    break;
                  case 88:
                    startAsyncIterable(flightResponse, rowID, !1);
                    break;
                  case 120:
                    startAsyncIterable(flightResponse, rowID, !0);
                    break;
                  case 67:
                    (rowID = flightResponse._chunks.get(rowID)) &&
                      "fulfilled" === rowID.status &&
                      rowID.reason.close("" === i ? '"$undefined"' : i);
                    break;
                  case 80:
                    i = Error(
                      "A Server Component was postponed. The reason is omitted in production builds to avoid leaking sensitive details."
                    );
                    i.$$typeof = REACT_POSTPONE_TYPE;
                    i.stack = "Error: " + i.message;
                    rowTag = flightResponse._chunks;
                    (rowLength = rowTag.get(rowID))
                      ? triggerErrorOnChunk(rowLength, i)
                      : rowTag.set(
                          rowID,
                          new Chunk("rejected", null, i, flightResponse)
                        );
                    break;
                  default:
                    (rowTag = flightResponse._chunks),
                      (rowLength = rowTag.get(rowID))
                        ? resolveModelChunk(rowLength, i)
                        : rowTag.set(
                            rowID,
                            new Chunk("resolved_model", i, null, flightResponse)
                          );
                }
                i = lastIdx;
                3 === rowState && i++;
                rowLength = rowID = rowTag = rowState = 0;
                buffer.length = 0;
              } else if (chunk.length !== i)
                throw Error(
                  "String chunks need to be passed in their original shape. Not split into smaller string chunks. This is a bug in the wiring of the React streams."
                );
            }
            flightResponse._rowState = rowState;
            flightResponse._rowID = rowID;
            flightResponse._rowTag = rowTag;
            flightResponse._rowLength = rowLength;
          } else reportGlobalError(flightResponse, Error("Connection closed."));
          return !0;
        },
        destroy: function (error) {
          abort(fizzRequest, error);
          reject(error);
        }
      },
      buffer$jscomp$0 = "",
      stashErrorIdx = 1,
      stashedErrors = new Map(),
      flightRequest = new RequestInstance$1(
        children,
        null,
        function (error) {
          var id = "" + stashErrorIdx++;
          stashedErrors.set(id, error);
          return id;
        },
        options ? options.identifierPrefix : void 0,
        void 0,
        void 0,
        "Markup",
        void 0,
        void 0,
        void 0
      ),
      flightResponse = new ResponseInstance(
        null,
        null,
        noServerCallOrFormAction,
        noServerCallOrFormAction,
        void 0,
        void 0
      ),
      resumableState = createResumableState(
        options ? options.identifierPrefix : void 0,
        void 0
      ),
      root = getChunk(flightResponse, 0),
      fizzRequest = createRequest(
        root,
        resumableState,
        createRenderState(
          resumableState,
          void 0,
          void 0,
          void 0,
          void 0,
          void 0
        ),
        createFormatContext(0, null, 0),
        Infinity,
        function (error, errorInfo) {
          if ("object" === typeof error && null !== error) {
            var id = error.digest;
            "string" === typeof id &&
              stashedErrors.has(id) &&
              (error = stashedErrors.get(id));
          }
          reject(error);
          (id = options && options.onError) && id(error, errorInfo);
        },
        void 0,
        void 0,
        void 0,
        void 0,
        void 0,
        void 0
      );
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted)
        abort$1(flightRequest, signal.reason),
          abort(fizzRequest, signal.reason);
      else {
        var listener = function () {
          abort$1(flightRequest, signal.reason);
          abort(fizzRequest, signal.reason);
          signal.removeEventListener("abort", listener);
        };
        signal.addEventListener("abort", listener);
      }
    }
    flightRequest.flushScheduled = null !== flightRequest.destination;
    performWork$1(flightRequest);
    if (2 === flightRequest.status)
      (flightRequest.status = 3),
        flightDestination.destroy(flightRequest.fatalError);
    else if (3 !== flightRequest.status && null === flightRequest.destination) {
      flightRequest.destination = flightDestination;
      try {
        flushCompletedChunks(flightRequest, flightDestination);
      } catch (error) {
        logRecoverableError$1(flightRequest, error, null),
          fatalError$1(flightRequest, error);
      }
    }
    fizzRequest.flushScheduled = null !== fizzRequest.destination;
    performWork(fizzRequest);
    null === fizzRequest.trackedPostpones &&
      safelyEmitEarlyPreloads(fizzRequest, 0 === fizzRequest.pendingRootTasks);
    startFlowing(fizzRequest, {
      push: function (chunk) {
        null !== chunk ? (buffer$jscomp$0 += chunk) : resolve(buffer$jscomp$0);
        return !0;
      },
      destroy: function (error) {
        abort$1(flightRequest, error);
        reject(error);
      }
    });
  });
};
exports.version = "19.0.0-experimental-1eaccd82-20240816";
