/**
 * @license React
 * react-server-dom-turbopack-server.node.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
"production" !== process.env.NODE_ENV &&
  (function () {
    function _defineProperty(obj, key, value) {
      key in obj
        ? Object.defineProperty(obj, key, {
            value: value,
            enumerable: !0,
            configurable: !0,
            writable: !0
          })
        : (obj[key] = value);
      return obj;
    }
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
    function byteLengthOfChunk(chunk) {
      return "string" === typeof chunk
        ? Buffer.byteLength(chunk, "utf8")
        : chunk.byteLength;
    }
    function registerClientReferenceImpl(proxyImplementation, id, async) {
      return Object.defineProperties(proxyImplementation, {
        $$typeof: { value: CLIENT_REFERENCE_TAG$1 },
        $$id: { value: id },
        $$async: { value: async }
      });
    }
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
          var clientReference = registerClientReferenceImpl(
              {},
              target.$$id,
              !0
            ),
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
    function prepareStackTrace(error, structuredStackTrace) {
      error = (error.name || "Error") + ": " + (error.message || "");
      for (var i = 0; i < structuredStackTrace.length; i++)
        error += "\n    at " + structuredStackTrace[i].toString();
      return error;
    }
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
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable)
        return null;
      maybeIterable =
        (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
        maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
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
    function getSuspendedThenable() {
      if (null === suspendedThenable)
        throw Error(
          "Expected a suspended thenable. This is a bug in React. Please file an issue."
        );
      var thenable = suspendedThenable;
      suspendedThenable = null;
      return thenable;
    }
    function prepareToUseHooksForComponent(
      prevThenableState,
      componentDebugInfo
    ) {
      thenableIndexCounter = 0;
      thenableState = prevThenableState;
      currentComponentDebugInfo = componentDebugInfo;
    }
    function getThenableStateAfterSuspending() {
      var state = thenableState || [];
      state._componentDebugInfo = currentComponentDebugInfo;
      thenableState = currentComponentDebugInfo = null;
      return state;
    }
    function unsupportedHook() {
      throw Error("This Hook is not supported in Server Components.");
    }
    function unsupportedRefresh() {
      throw Error(
        "Refreshing the cache is not supported in Server Components."
      );
    }
    function unsupportedContext() {
      throw Error("Cannot read a Client Context from a Server Component.");
    }
    function isObjectPrototype(object) {
      if (!object) return !1;
      var ObjectPrototype = Object.prototype;
      if (object === ObjectPrototype) return !0;
      if (getPrototypeOf(object)) return !1;
      object = Object.getOwnPropertyNames(object);
      for (var i = 0; i < object.length; i++)
        if (!(object[i] in ObjectPrototype)) return !1;
      return !0;
    }
    function isSimpleObject(object) {
      if (!isObjectPrototype(getPrototypeOf(object))) return !1;
      for (
        var names = Object.getOwnPropertyNames(object), i = 0;
        i < names.length;
        i++
      ) {
        var descriptor = Object.getOwnPropertyDescriptor(object, names[i]);
        if (
          !descriptor ||
          (!descriptor.enumerable &&
            (("key" !== names[i] && "ref" !== names[i]) ||
              "function" !== typeof descriptor.get))
        )
          return !1;
      }
      return !0;
    }
    function objectName(object) {
      return Object.prototype.toString
        .call(object)
        .replace(/^\[object (.*)\]$/, function (m, p0) {
          return p0;
        });
    }
    function describeKeyForErrorMessage(key) {
      var encodedKey = JSON.stringify(key);
      return '"' + key + '"' === encodedKey ? key : encodedKey;
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
    function describeObjectForErrorMessage(objectOrArray, expandedName) {
      var objKind = objectName(objectOrArray);
      if ("Object" !== objKind && "Array" !== objKind) return objKind;
      var start = -1,
        length = 0;
      if (isArrayImpl(objectOrArray))
        if (jsxChildrenParents.has(objectOrArray)) {
          var type = jsxChildrenParents.get(objectOrArray);
          objKind = "<" + describeElementType(type) + ">";
          for (var i = 0; i < objectOrArray.length; i++) {
            var value = objectOrArray[i];
            value =
              "string" === typeof value
                ? value
                : "object" === typeof value && null !== value
                  ? "{" + describeObjectForErrorMessage(value) + "}"
                  : "{" + describeValueForErrorMessage(value) + "}";
            "" + i === expandedName
              ? ((start = objKind.length),
                (length = value.length),
                (objKind += value))
              : (objKind =
                  15 > value.length && 40 > objKind.length + value.length
                    ? objKind + value
                    : objKind + "{...}");
          }
          objKind += "</" + describeElementType(type) + ">";
        } else {
          objKind = "[";
          for (type = 0; type < objectOrArray.length; type++)
            0 < type && (objKind += ", "),
              (i = objectOrArray[type]),
              (i =
                "object" === typeof i && null !== i
                  ? describeObjectForErrorMessage(i)
                  : describeValueForErrorMessage(i)),
              "" + type === expandedName
                ? ((start = objKind.length),
                  (length = i.length),
                  (objKind += i))
                : (objKind =
                    10 > i.length && 40 > objKind.length + i.length
                      ? objKind + i
                      : objKind + "...");
          objKind += "]";
        }
      else if (objectOrArray.$$typeof === REACT_ELEMENT_TYPE)
        objKind = "<" + describeElementType(objectOrArray.type) + "/>";
      else {
        if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG) return "client";
        if (jsxPropsParents.has(objectOrArray)) {
          objKind = jsxPropsParents.get(objectOrArray);
          objKind = "<" + (describeElementType(objKind) || "...");
          type = Object.keys(objectOrArray);
          for (i = 0; i < type.length; i++) {
            objKind += " ";
            value = type[i];
            objKind += describeKeyForErrorMessage(value) + "=";
            var _value2 = objectOrArray[value];
            var _substr2 =
              value === expandedName &&
              "object" === typeof _value2 &&
              null !== _value2
                ? describeObjectForErrorMessage(_value2)
                : describeValueForErrorMessage(_value2);
            "string" !== typeof _value2 && (_substr2 = "{" + _substr2 + "}");
            value === expandedName
              ? ((start = objKind.length),
                (length = _substr2.length),
                (objKind += _substr2))
              : (objKind =
                  10 > _substr2.length && 40 > objKind.length + _substr2.length
                    ? objKind + _substr2
                    : objKind + "...");
          }
          objKind += ">";
        } else {
          objKind = "{";
          type = Object.keys(objectOrArray);
          for (i = 0; i < type.length; i++)
            0 < i && (objKind += ", "),
              (value = type[i]),
              (objKind += describeKeyForErrorMessage(value) + ": "),
              (_value2 = objectOrArray[value]),
              (_value2 =
                "object" === typeof _value2 && null !== _value2
                  ? describeObjectForErrorMessage(_value2)
                  : describeValueForErrorMessage(_value2)),
              value === expandedName
                ? ((start = objKind.length),
                  (length = _value2.length),
                  (objKind += _value2))
                : (objKind =
                    10 > _value2.length && 40 > objKind.length + _value2.length
                      ? objKind + _value2
                      : objKind + "...");
          objKind += "}";
        }
      }
      return void 0 === expandedName
        ? objKind
        : -1 < start && 0 < length
          ? ((objectOrArray = " ".repeat(start) + "^".repeat(length)),
            "\n  " + objKind + "\n  " + objectOrArray)
          : "\n  " + objKind;
    }
    function isNotExternal(stackFrame) {
      return !externalRegExp.test(stackFrame[1]);
    }
    function getCurrentStackInDEV() {
      return "";
    }
    function defaultErrorHandler(error) {
      console.error(error);
    }
    function defaultPostponeHandler() {}
    function RequestInstance(
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
        throw Error(
          "Currently React only supports one RSC renderer at a time."
        );
      ReactSharedInternalsServer.A = DefaultAsyncDispatcher;
      ReactSharedInternalsServer.getCurrentStack = getCurrentStackInDEV;
      var abortSet = new Set(),
        pingedTasks = [],
        hints = new Set();
      this.status = 0;
      this.flushScheduled = !1;
      this.destination = this.fatalError = null;
      this.bundlerConfig = bundlerConfig;
      this.cache = new Map();
      this.pendingChunks = this.nextChunkId = 0;
      this.hints = hints;
      this.abortListeners = new Set();
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
      this.temporaryReferences = temporaryReferences;
      this.identifierPrefix = identifierPrefix || "";
      this.identifierCount = 1;
      this.taintCleanupQueue = [];
      this.onError = void 0 === onError ? defaultErrorHandler : onError;
      this.onPostpone =
        void 0 === onPostpone ? defaultPostponeHandler : onPostpone;
      this.environmentName =
        void 0 === environmentName
          ? function () {
              return "Server";
            }
          : "function" !== typeof environmentName
            ? function () {
                return environmentName;
              }
            : environmentName;
      this.didWarnForKey = null;
      model = createTask(this, model, null, !1, abortSet, null);
      pingedTasks.push(model);
    }
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
        request.abortableTasks,
        task.debugOwner
      );
      (task = thenable._debugInfo) &&
        forwardDebugInfo(request, newTask.id, task);
      switch (thenable.status) {
        case "fulfilled":
          return (
            (newTask.model = thenable.value),
            pingTask(request, newTask),
            newTask.id
          );
        case "rejected":
          task = thenable.reason;
          var digest = logRecoverableError(request, task, null);
          emitErrorChunk(request, newTask.id, digest, task);
          return newTask.id;
        default:
          if (1 === request.status)
            return (
              (newTask.status = 3),
              (task = stringify(serializeByValueID(request.fatalError))),
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
          pingTask(request, newTask);
        },
        function (reason) {
          newTask.status = 4;
          var _digest = logRecoverableError(request, reason, newTask);
          emitErrorChunk(request, newTask.id, _digest, reason);
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
                tryStreamTask(request, streamTask),
                enqueueFlush(request),
                reader.read().then(progress, error);
            } catch (x$0) {
              error(x$0);
            }
      }
      function error(reason) {
        if (!aborted) {
          aborted = !0;
          request.abortListeners.delete(error);
          var digest = logRecoverableError(request, reason, streamTask);
          emitErrorChunk(request, streamTask.id, digest, reason);
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
          request.abortableTasks,
          task.debugOwner
        );
      request.abortableTasks.delete(streamTask);
      request.pendingChunks++;
      task =
        streamTask.id.toString(16) + ":" + (supportsBYOB ? "r" : "R") + "\n";
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
                tryStreamTask(request, streamTask),
                enqueueFlush(request),
                callIteratorInDEV(iterator, progress, error);
            } catch (x$1) {
              error(x$1);
            }
      }
      function error(reason) {
        if (!aborted) {
          aborted = !0;
          request.abortListeners.delete(error);
          var digest = logRecoverableError(request, reason, streamTask);
          emitErrorChunk(request, streamTask.id, digest, reason);
          enqueueFlush(request);
          "function" === typeof iterator.throw &&
            iterator.throw(reason).then(error, error);
        }
      }
      var isIterator = iterable === iterator,
        streamTask = createTask(
          request,
          task.model,
          task.keyPath,
          task.implicitSlot,
          request.abortableTasks,
          task.debugOwner
        );
      request.abortableTasks.delete(streamTask);
      request.pendingChunks++;
      task = streamTask.id.toString(16) + ":" + (isIterator ? "x" : "X") + "\n";
      request.completedRegularChunks.push(task);
      (iterable = iterable._debugInfo) &&
        forwardDebugInfo(request, streamTask.id, iterable);
      var aborted = !1;
      request.abortListeners.add(error);
      callIteratorInDEV(iterator, progress, error);
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
      var lazyType = {
        $$typeof: REACT_LAZY_TYPE,
        _payload: wakeable,
        _init: readThenable
      };
      lazyType._debugInfo = wakeable._debugInfo || [];
      return lazyType;
    }
    function callWithDebugContextInDEV(task, callback, arg) {
      currentOwner = { env: task.environmentName, owner: task.debugOwner };
      try {
        return callback(arg);
      } finally {
        currentOwner = null;
      }
    }
    function renderFunctionComponent(request, task, key, Component, props) {
      var prevThenableState = task.thenableState;
      task.thenableState = null;
      if (null === debugID) return outlineTask(request, task);
      if (null !== prevThenableState)
        var componentDebugInfo = prevThenableState._componentDebugInfo;
      else {
        var componentDebugID = debugID;
        componentDebugInfo = Component.displayName || Component.name || "";
        var componentEnv = request.environmentName();
        request.pendingChunks++;
        componentDebugInfo = {
          name: componentDebugInfo,
          env: componentEnv,
          owner: task.debugOwner
        };
        outlineModel(request, componentDebugInfo);
        emitDebugChunk(request, componentDebugID, componentDebugInfo);
        task.environmentName = componentEnv;
      }
      prepareToUseHooksForComponent(prevThenableState, componentDebugInfo);
      props = componentStorage.run(
        componentDebugInfo,
        callComponentInDEV,
        Component,
        props,
        componentDebugInfo
      );
      if (1 === request.status) throw AbortSigil;
      if (
        "object" === typeof props &&
        null !== props &&
        props.$$typeof !== CLIENT_REFERENCE_TAG$1
      ) {
        if ("function" === typeof props.then) {
          prevThenableState = props;
          prevThenableState.then(
            function (resolvedValue) {
              "object" === typeof resolvedValue &&
                null !== resolvedValue &&
                resolvedValue.$$typeof === REACT_ELEMENT_TYPE &&
                (resolvedValue._store.validated = 1);
            },
            function () {}
          );
          if ("fulfilled" === prevThenableState.status)
            return prevThenableState.value;
          props = createLazyWrapperAroundWakeable(props);
        }
        var iteratorFn = getIteratorFn(props);
        if (iteratorFn) {
          var iterableChild = props;
          props = _defineProperty({}, Symbol.iterator, function () {
            var iterator = iteratorFn.call(iterableChild);
            iterator !== iterableChild ||
              ("[object GeneratorFunction]" ===
                Object.prototype.toString.call(Component) &&
                "[object Generator]" ===
                  Object.prototype.toString.call(iterableChild)) ||
              callWithDebugContextInDEV(task, function () {
                console.error(
                  "Returning an Iterator from a Server Component is not supported since it cannot be looped over more than once. "
                );
              });
            return iterator;
          });
          props._debugInfo = iterableChild._debugInfo;
        } else if (
          "function" !== typeof props[ASYNC_ITERATOR] ||
          ("function" === typeof ReadableStream &&
            props instanceof ReadableStream)
        )
          props.$$typeof === REACT_ELEMENT_TYPE && (props._store.validated = 1);
        else {
          var _iterableChild = props;
          props = _defineProperty({}, ASYNC_ITERATOR, function () {
            var iterator = _iterableChild[ASYNC_ITERATOR]();
            iterator !== _iterableChild ||
              ("[object AsyncGeneratorFunction]" ===
                Object.prototype.toString.call(Component) &&
                "[object AsyncGenerator]" ===
                  Object.prototype.toString.call(_iterableChild)) ||
              callWithDebugContextInDEV(task, function () {
                console.error(
                  "Returning an AsyncIterator from a Server Component is not supported since it cannot be looped over more than once. "
                );
              });
            return iterator;
          });
          props._debugInfo = _iterableChild._debugInfo;
        }
      }
      prevThenableState = task.keyPath;
      componentDebugID = task.implicitSlot;
      null !== key
        ? (task.keyPath =
            null === prevThenableState ? key : prevThenableState + "," + key)
        : null === prevThenableState && (task.implicitSlot = !0);
      request = renderModelDestructive(request, task, emptyRoot, "", props);
      task.keyPath = prevThenableState;
      task.implicitSlot = componentDebugID;
      return request;
    }
    function renderFragment(request, task, children) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        null === child ||
          "object" !== typeof child ||
          child.$$typeof !== REACT_ELEMENT_TYPE ||
          null !== child.key ||
          child._store.validated ||
          (child._store.validated = 2);
      }
      if (null !== task.keyPath)
        return (
          (request = [
            REACT_ELEMENT_TYPE,
            REACT_FRAGMENT_TYPE,
            task.keyPath,
            { children: children },
            null
          ]),
          task.implicitSlot ? [request] : request
        );
      if ((i = children._debugInfo)) {
        if (null === debugID) return outlineTask(request, task);
        forwardDebugInfo(request, debugID, i);
        children = Array.from(children);
      }
      return children;
    }
    function renderAsyncFragment(request, task, children, getAsyncIterator) {
      if (null !== task.keyPath)
        return (
          (request = [
            REACT_ELEMENT_TYPE,
            REACT_FRAGMENT_TYPE,
            task.keyPath,
            { children: children },
            null
          ]),
          task.implicitSlot ? [request] : request
        );
      getAsyncIterator = getAsyncIterator.call(children);
      return serializeAsyncIterable(request, task, children, getAsyncIterator);
    }
    function outlineTask(request, task) {
      task = createTask(
        request,
        task.model,
        task.keyPath,
        task.implicitSlot,
        request.abortableTasks,
        task.debugOwner
      );
      retryTask(request, task);
      return 1 === task.status
        ? serializeByValueID(task.id)
        : serializeLazyID(task.id);
    }
    function renderElement(request, task, type, key, ref, props) {
      if (null !== ref && void 0 !== ref)
        throw Error(
          "Refs cannot be used in Server Components, nor passed to Client Components."
        );
      jsxPropsParents.set(props, type);
      "object" === typeof props.children &&
        null !== props.children &&
        jsxChildrenParents.set(props.children, type);
      if (
        "function" === typeof type &&
        type.$$typeof !== CLIENT_REFERENCE_TAG$1 &&
        type.$$typeof !== TEMPORARY_REFERENCE_TAG
      )
        return renderFunctionComponent(request, task, key, type, props);
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
            type = callLazyInitInDEV(type);
            if (1 === request.status) throw AbortSigil;
            return renderElement(request, task, type, key, ref, props);
          case REACT_FORWARD_REF_TYPE:
            return renderFunctionComponent(
              request,
              task,
              key,
              type.render,
              props
            );
          case REACT_MEMO_TYPE:
            return renderElement(request, task, type.type, key, ref, props);
          case REACT_ELEMENT_TYPE:
            type._store.validated = 1;
        }
      request = key;
      key = task.keyPath;
      null === request
        ? (request = key)
        : null !== key && (request = key + "," + request);
      props = [REACT_ELEMENT_TYPE, type, request, props, task.debugOwner];
      task = task.implicitSlot && null !== request ? [props] : props;
      return task;
    }
    function pingTask(request, task) {
      var pingedTasks = request.pingedTasks;
      pingedTasks.push(task);
      1 === pingedTasks.length &&
        ((request.flushScheduled = null !== request.destination),
        scheduleMicrotask(function () {
          return performWork(request);
        }));
    }
    function createTask(
      request,
      model,
      keyPath,
      implicitSlot,
      abortSet,
      debugOwner
    ) {
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
          var parent = this,
            originalValue = parent[parentPropertyName];
          "object" !== typeof originalValue ||
            originalValue === value ||
            originalValue instanceof Date ||
            callWithDebugContextInDEV(task, function () {
              "Object" !== objectName(originalValue)
                ? "string" === typeof jsxChildrenParents.get(parent)
                  ? console.error(
                      "%s objects cannot be rendered as text children. Try formatting it using toString().%s",
                      objectName(originalValue),
                      describeObjectForErrorMessage(parent, parentPropertyName)
                    )
                  : console.error(
                      "Only plain objects can be passed to Client Components from Server Components. %s objects are not supported.%s",
                      objectName(originalValue),
                      describeObjectForErrorMessage(parent, parentPropertyName)
                    )
                : console.error(
                    "Only plain objects can be passed to Client Components from Server Components. Objects with toJSON methods are not supported. Convert it manually to a simple value before passing it to props.%s",
                    describeObjectForErrorMessage(parent, parentPropertyName)
                  );
            });
          return renderModel(request, task, parent, parentPropertyName, value);
        },
        thenableState: null
      };
      task.environmentName = request.environmentName();
      task.debugOwner = debugOwner;
      abortSet.add(task);
      return task;
    }
    function serializeByValueID(id) {
      return "$" + id.toString(16);
    }
    function serializeLazyID(id) {
      return "$L" + id.toString(16);
    }
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
          ? serializeLazyID(existingId)
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
        var clientReferenceMetadata =
          !0 === clientReference.$$async
            ? [resolvedModuleData.id, resolvedModuleData.chunks, existingId, 1]
            : [resolvedModuleData.id, resolvedModuleData.chunks, existingId];
        request.pendingChunks++;
        var importId = request.nextChunkId++,
          json = stringify(clientReferenceMetadata),
          processedChunk = importId.toString(16) + ":I" + json + "\n";
        request.completedImportChunks.push(processedChunk);
        writtenClientReferences.set(clientReferenceKey, importId);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(importId)
          : serializeByValueID(importId);
      } catch (x) {
        return (
          request.pendingChunks++,
          (parent = request.nextChunkId++),
          (parentPropertyName = logRecoverableError(request, x, null)),
          emitErrorChunk(request, parent, parentPropertyName, x),
          serializeByValueID(parent)
        );
      }
    }
    function outlineModel(request, value) {
      value = createTask(
        request,
        value,
        null,
        !1,
        request.abortableTasks,
        null
      );
      retryTask(request, value);
      return value.id;
    }
    function serializeServerReference(request, serverReference) {
      var writtenServerReferences = request.writtenServerReferences,
        existingId = writtenServerReferences.get(serverReference);
      if (void 0 !== existingId) return "$F" + existingId.toString(16);
      existingId = serverReference.$$bound;
      existingId = {
        id: serverReference.$$id,
        bound: existingId ? Promise.resolve(existingId) : null
      };
      request = outlineModel(request, existingId);
      writtenServerReferences.set(serverReference, request);
      return "$F" + request.toString(16);
    }
    function serializeLargeTextString(request, text) {
      request.pendingChunks++;
      var textId = request.nextChunkId++;
      emitTextChunk(request, textId, text);
      return serializeByValueID(textId);
    }
    function serializeMap(request, map) {
      map = Array.from(map);
      return "$Q" + outlineModel(request, map).toString(16);
    }
    function serializeFormData(request, formData) {
      formData = Array.from(formData.entries());
      return "$K" + outlineModel(request, formData).toString(16);
    }
    function serializeSet(request, set) {
      set = Array.from(set);
      return "$W" + outlineModel(request, set).toString(16);
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
          var digest = logRecoverableError(request, reason, newTask);
          emitErrorChunk(request, newTask.id, digest, reason);
          request.abortableTasks.delete(newTask);
          enqueueFlush(request);
          reader.cancel(reason).then(error, error);
        }
      }
      var model = [blob.type],
        newTask = createTask(
          request,
          model,
          null,
          !1,
          request.abortableTasks,
          null
        ),
        reader = blob.stream().getReader(),
        aborted = !1;
      request.abortListeners.add(error);
      reader.read().then(progress).catch(error);
      return "$B" + newTask.id.toString(16);
    }
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
          thrownValue === SuspenseException
            ? getSuspendedThenable()
            : thrownValue;
        if (
          "object" === typeof key &&
          null !== key &&
          "function" === typeof key.then
        ) {
          if (1 === request.status)
            return (
              (task.status = 3),
              (task = request.fatalError),
              parent ? serializeLazyID(task) : serializeByValueID(task)
            );
          request = createTask(
            request,
            task.model,
            task.keyPath,
            task.implicitSlot,
            request.abortableTasks,
            task.debugOwner
          );
          value = request.ping;
          key.then(value, value);
          request.thenableState = getThenableStateAfterSuspending();
          task.keyPath = prevKeyPath;
          task.implicitSlot = prevImplicitSlot;
          return parent
            ? serializeLazyID(request.id)
            : serializeByValueID(request.id);
        }
        if (thrownValue === AbortSigil)
          return (
            (task.status = 3),
            (task = request.fatalError),
            parent ? serializeLazyID(task) : serializeByValueID(task)
          );
        task.keyPath = prevKeyPath;
        task.implicitSlot = prevImplicitSlot;
        request.pendingChunks++;
        prevKeyPath = request.nextChunkId++;
        task = logRecoverableError(request, key, task);
        emitErrorChunk(request, prevKeyPath, task, key);
        return parent
          ? serializeLazyID(prevKeyPath)
          : serializeByValueID(prevKeyPath);
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
              _writtenObjects = request.writtenObjects;
            if (null === task.keyPath && !task.implicitSlot) {
              var _existingReference = _writtenObjects.get(value);
              if (void 0 !== _existingReference)
                if (modelRoot === value) modelRoot = null;
                else return _existingReference;
              else
                -1 === parentPropertyName.indexOf(":") &&
                  ((_existingReference = _writtenObjects.get(parent)),
                  void 0 !== _existingReference &&
                    ((elementReference =
                      _existingReference + ":" + parentPropertyName),
                    _writtenObjects.set(value, elementReference)));
            }
            if ((_existingReference = value._debugInfo)) {
              if (null === debugID) return outlineTask(request, task);
              forwardDebugInfo(request, debugID, _existingReference);
            }
            _existingReference = value.props;
            var refProp = _existingReference.ref;
            task.debugOwner = value._owner;
            request = renderElement(
              request,
              task,
              value.type,
              value.key,
              void 0 !== refProp ? refProp : null,
              _existingReference
            );
            "object" === typeof request &&
              null !== request &&
              null !== elementReference &&
              (_writtenObjects.has(request) ||
                _writtenObjects.set(request, elementReference));
            return request;
          case REACT_LAZY_TYPE:
            task.thenableState = null;
            elementReference = callLazyInitInDEV(value);
            if (1 === request.status) throw AbortSigil;
            if ((_writtenObjects = value._debugInfo)) {
              if (null === debugID) return outlineTask(request, task);
              forwardDebugInfo(request, debugID, _writtenObjects);
            }
            return renderModelDestructive(
              request,
              task,
              emptyRoot,
              "",
              elementReference
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
          ((elementReference = request.temporaryReferences.get(value)),
          void 0 !== elementReference)
        )
          return "$T" + elementReference;
        elementReference = request.writtenObjects;
        _writtenObjects = elementReference.get(value);
        if ("function" === typeof value.then) {
          if (void 0 !== _writtenObjects) {
            if (null !== task.keyPath || task.implicitSlot)
              return (
                "$@" + serializeThenable(request, task, value).toString(16)
              );
            if (modelRoot === value) modelRoot = null;
            else return _writtenObjects;
          }
          request = "$@" + serializeThenable(request, task, value).toString(16);
          elementReference.set(value, request);
          return request;
        }
        if (void 0 !== _writtenObjects)
          if (modelRoot === value) modelRoot = null;
          else return _writtenObjects;
        else if (
          -1 === parentPropertyName.indexOf(":") &&
          ((_writtenObjects = elementReference.get(parent)),
          void 0 !== _writtenObjects)
        ) {
          _existingReference = parentPropertyName;
          if (isArrayImpl(parent) && parent[0] === REACT_ELEMENT_TYPE)
            switch (parentPropertyName) {
              case "1":
                _existingReference = "type";
                break;
              case "2":
                _existingReference = "key";
                break;
              case "3":
                _existingReference = "props";
            }
          elementReference.set(
            value,
            _writtenObjects + ":" + _existingReference
          );
        }
        if (isArrayImpl(value)) return renderFragment(request, task, value);
        if (value instanceof Map) return serializeMap(request, value);
        if (value instanceof Set) return serializeSet(request, value);
        if ("function" === typeof FormData && value instanceof FormData)
          return serializeFormData(request, value);
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
            (elementReference = elementReference.call(value)),
            elementReference === value
              ? "$i" +
                outlineModel(request, Array.from(elementReference)).toString(16)
              : renderFragment(request, task, Array.from(elementReference))
          );
        if (
          "function" === typeof ReadableStream &&
          value instanceof ReadableStream
        )
          return serializeReadableStream(request, task, value);
        elementReference = value[ASYNC_ITERATOR];
        if ("function" === typeof elementReference)
          return renderAsyncFragment(request, task, value, elementReference);
        request = getPrototypeOf(value);
        if (
          request !== ObjectPrototype &&
          (null === request || null !== getPrototypeOf(request))
        )
          throw Error(
            "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
              describeObjectForErrorMessage(parent, parentPropertyName)
          );
        if (
          (("object" === typeof value.debugTask &&
            null !== value.debugTask &&
            "function" === typeof value.debugTask.run) ||
            value.debugStack instanceof Error) &&
          "undefined" === typeof value.stack &&
          "string" === typeof value.name &&
          "string" === typeof value.env &&
          void 0 !== value.owner
        )
          return { name: value.name, env: value.env, owner: value.owner };
        if ("Object" !== objectName(value))
          callWithDebugContextInDEV(task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. %s objects are not supported.%s",
              objectName(value),
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
        else if (!isSimpleObject(value))
          callWithDebugContextInDEV(task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.%s",
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
        else if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(value);
          0 < symbols.length &&
            callWithDebugContextInDEV(task, function () {
              console.error(
                "Only plain objects can be passed to Client Components from Server Components. Objects with symbol properties like %s are not supported.%s",
                symbols[0].description,
                describeObjectForErrorMessage(parent, parentPropertyName)
              );
            });
        }
        return value;
      }
      if ("string" === typeof value)
        return "Z" === value[value.length - 1] &&
          parent[parentPropertyName] instanceof Date
          ? "$D" + value
          : 1024 <= value.length && null !== byteLengthOfChunk
            ? serializeLargeTextString(request, value)
            : "$" === value[0]
              ? "$" + value
              : value;
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber(value);
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
          return serializeServerReference(request, value);
        if (
          void 0 !== request.temporaryReferences &&
          ((request = request.temporaryReferences.get(value)),
          void 0 !== request)
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
        if (
          jsxChildrenParents.has(parent) ||
          (jsxPropsParents.has(parent) && "children" === parentPropertyName)
        )
          throw (
            ((request = value.displayName || value.name || "Component"),
            Error(
              "Functions are not valid as a child of Client Components. This may happen if you return " +
                request +
                " instead of <" +
                request +
                " /> from render. Or maybe you meant to call this function rather than return it." +
                describeObjectForErrorMessage(parent, parentPropertyName)
            ))
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
          return serializeByValueID(elementReference);
        elementReference = value.description;
        if (Symbol.for(elementReference) !== value)
          throw Error(
            "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
              (value.description + ") cannot be found among global symbols.") +
              describeObjectForErrorMessage(parent, parentPropertyName)
          );
        request.pendingChunks++;
        _writtenObjects = request.nextChunkId++;
        emitSymbolChunk(request, _writtenObjects, elementReference);
        task.set(value, _writtenObjects);
        return serializeByValueID(_writtenObjects);
      }
      if ("bigint" === typeof value) return "$n" + value.toString(10);
      throw Error(
        "Type " +
          typeof value +
          " is not supported in Client Component props." +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    }
    function logRecoverableError(request, error, task) {
      var prevRequest = currentRequest;
      currentRequest = null;
      try {
        var onError = request.onError;
        var errorDigest =
          null !== task
            ? requestStorage.run(
                void 0,
                callWithDebugContextInDEV,
                task,
                onError,
                error
              )
            : requestStorage.run(void 0, onError, error);
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
        ? ((request.status = CLOSED), request.destination.destroy(error))
        : ((request.status = 2), (request.fatalError = error));
    }
    function emitErrorChunk(request, id, digest, error) {
      var env = request.environmentName();
      try {
        if (error instanceof Error) {
          var message = String(error.message);
          a: {
            var previousPrepare = Error.prepareStackTrace;
            Error.prepareStackTrace = prepareStackTrace;
            try {
              var stack = String(error.stack);
              break a;
            } finally {
              Error.prepareStackTrace = previousPrepare;
            }
            stack = void 0;
          }
          stack.startsWith("Error: react-stack-top-frame\n") &&
            (stack = stack.slice(29));
          var idx = stack.indexOf("react-stack-bottom-frame");
          -1 !== idx && (idx = stack.lastIndexOf("\n", idx));
          -1 !== idx && (stack = stack.slice(0, idx));
          var frames = stack.split("\n");
          stack = [];
          for (
            previousPrepare = 0;
            previousPrepare < frames.length;
            previousPrepare++
          ) {
            var parsed = frameRegExp.exec(frames[previousPrepare]);
            if (parsed) {
              var name = parsed[1] || "";
              "<anonymous>" === name && (name = "");
              var filename = parsed[2] || parsed[5] || "";
              "<anonymous>" === filename && (filename = "");
              stack.push([
                name,
                filename,
                +(parsed[3] || parsed[6]),
                +(parsed[4] || parsed[7])
              ]);
            }
          }
          var stack$jscomp$0 = stack.filter(isNotExternal);
          for (frames = 0; frames < stack$jscomp$0.length; frames++) {
            var callsite = stack$jscomp$0[frames],
              url = callsite[1];
            if (url.startsWith("rsc://React/")) {
              var suffixIdx = url.lastIndexOf("?");
              -1 < suffixIdx && (callsite[1] = url.slice(12, suffixIdx));
            }
          }
          var stack$jscomp$1 = stack$jscomp$0;
          var errorEnv = error.environmentName;
          "string" === typeof errorEnv && (env = errorEnv);
        } else
          (message =
            "object" === typeof error && null !== error
              ? describeObjectForErrorMessage(error)
              : String(error)),
            (stack$jscomp$1 = []);
      } catch (x) {
        message = "An error occurred but serializing the error message failed.";
      }
      digest = {
        digest: digest,
        message: message,
        stack: stack$jscomp$1,
        env: env
      };
      id = id.toString(16) + ":E" + stringify(digest) + "\n";
      request.completedErrorChunks.push(id);
    }
    function emitSymbolChunk(request, id, name) {
      id = encodeReferenceChunk(request, id, "$S" + name);
      request.completedImportChunks.push(id);
    }
    function emitModelChunk(request, id, json) {
      id = id.toString(16) + ":" + json + "\n";
      request.completedRegularChunks.push(id);
    }
    function emitDebugChunk(request, id, debugInfo) {
      var counter = { objectCount: 0 };
      debugInfo = stringify(debugInfo, function (parentPropertyName, value) {
        return renderConsoleValue(
          request,
          counter,
          this,
          parentPropertyName,
          value
        );
      });
      id = id.toString(16) + ":D" + debugInfo + "\n";
      request.completedRegularChunks.push(id);
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
      if (null === byteLengthOfChunk)
        throw Error(
          "Existence of byteLengthOfChunk should have already been checked. This is a bug in React."
        );
      request.pendingChunks++;
      var binaryLength = byteLengthOfChunk(text);
      id = id.toString(16) + ":T" + binaryLength.toString(16) + ",";
      request.completedRegularChunks.push(id, text);
    }
    function renderConsoleValue(
      request,
      counter,
      parent,
      parentPropertyName,
      value
    ) {
      var originalValue = parent[parentPropertyName];
      if (null === value) return null;
      if ("object" === typeof value) {
        if (value.$$typeof === CLIENT_REFERENCE_TAG$1)
          return serializeClientReference(
            request,
            parent,
            parentPropertyName,
            value
          );
        if (
          void 0 !== request.temporaryReferences &&
          ((parent = request.temporaryReferences.get(value)), void 0 !== parent)
        )
          return "$T" + parent;
        if (500 < counter.objectCount) return "$Y";
        counter.objectCount++;
        parent = request.writtenObjects.get(value);
        if ("function" === typeof value.then) {
          if (void 0 !== parent) return parent;
          switch (value.status) {
            case "fulfilled":
              return (
                "$@" +
                outlineConsoleValue(request, counter, value.value).toString(16)
              );
            case "rejected":
              return (
                (counter = value.reason),
                request.pendingChunks++,
                (value = request.nextChunkId++),
                emitErrorChunk(request, value, "", counter),
                "$@" + value.toString(16)
              );
          }
          return "$@";
        }
        return void 0 !== parent
          ? parent
          : isArrayImpl(value)
            ? value
            : value instanceof Map
              ? ((value = Array.from(value)),
                "$Q" +
                  outlineConsoleValue(request, counter, value).toString(16))
              : value instanceof Set
                ? ((value = Array.from(value)),
                  "$W" +
                    outlineConsoleValue(request, counter, value).toString(16))
                : "function" === typeof FormData && value instanceof FormData
                  ? serializeFormData(request, value)
                  : value instanceof ArrayBuffer
                    ? serializeTypedArray(request, "A", new Uint8Array(value))
                    : value instanceof Int8Array
                      ? serializeTypedArray(request, "O", value)
                      : value instanceof Uint8Array
                        ? serializeTypedArray(request, "o", value)
                        : value instanceof Uint8ClampedArray
                          ? serializeTypedArray(request, "U", value)
                          : value instanceof Int16Array
                            ? serializeTypedArray(request, "S", value)
                            : value instanceof Uint16Array
                              ? serializeTypedArray(request, "s", value)
                              : value instanceof Int32Array
                                ? serializeTypedArray(request, "L", value)
                                : value instanceof Uint32Array
                                  ? serializeTypedArray(request, "l", value)
                                  : value instanceof Float32Array
                                    ? serializeTypedArray(request, "G", value)
                                    : value instanceof Float64Array
                                      ? serializeTypedArray(request, "g", value)
                                      : value instanceof BigInt64Array
                                        ? serializeTypedArray(
                                            request,
                                            "M",
                                            value
                                          )
                                        : value instanceof BigUint64Array
                                          ? serializeTypedArray(
                                              request,
                                              "m",
                                              value
                                            )
                                          : value instanceof DataView
                                            ? serializeTypedArray(
                                                request,
                                                "V",
                                                value
                                              )
                                            : "function" === typeof Blob &&
                                                value instanceof Blob
                                              ? serializeBlob(request, value)
                                              : getIteratorFn(value)
                                                ? Array.from(value)
                                                : value;
      }
      if ("string" === typeof value)
        return "Z" === value[value.length - 1] && originalValue instanceof Date
          ? "$D" + value
          : 1024 <= value.length
            ? serializeLargeTextString(request, value)
            : "$" === value[0]
              ? "$" + value
              : value;
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber(value);
      if ("undefined" === typeof value) return "$undefined";
      if ("function" === typeof value)
        return value.$$typeof === CLIENT_REFERENCE_TAG$1
          ? serializeClientReference(request, parent, parentPropertyName, value)
          : void 0 !== request.temporaryReferences &&
              ((request = request.temporaryReferences.get(value)),
              void 0 !== request)
            ? "$T" + request
            : "$E(" + (Function.prototype.toString.call(value) + ")");
      if ("symbol" === typeof value) {
        counter = request.writtenSymbols.get(value);
        if (void 0 !== counter) return serializeByValueID(counter);
        counter = value.description;
        request.pendingChunks++;
        value = request.nextChunkId++;
        emitSymbolChunk(request, value, counter);
        return serializeByValueID(value);
      }
      return "bigint" === typeof value
        ? "$n" + value.toString(10)
        : "unknown type " + typeof value;
    }
    function outlineConsoleValue(request, counter, model) {
      var json = stringify(model, function (parentPropertyName, value) {
        try {
          return renderConsoleValue(
            request,
            counter,
            this,
            parentPropertyName,
            value
          );
        } catch (x) {
          return "unknown value";
        }
      });
      request.pendingChunks++;
      model = request.nextChunkId++;
      json = model.toString(16) + ":" + json + "\n";
      request.completedRegularChunks.push(json);
      return model;
    }
    function forwardDebugInfo(request, id, debugInfo) {
      for (var i = 0; i < debugInfo.length; i++)
        request.pendingChunks++,
          "string" === typeof debugInfo[i].name &&
            outlineModel(request, debugInfo[i]),
          emitDebugChunk(request, id, debugInfo[i]);
    }
    function emitChunk(request, task, value) {
      var id = task.id;
      "string" === typeof value && null !== byteLengthOfChunk
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
                                    emitModelChunk(request, task.id, value));
    }
    function retryTask(request, task) {
      if (0 === task.status) {
        var prevDebugID = debugID;
        task.status = 5;
        try {
          modelRoot = task.model;
          debugID = task.id;
          var resolvedModel = renderModelDestructive(
            request,
            task,
            emptyRoot,
            "",
            task.model
          );
          debugID = null;
          modelRoot = resolvedModel;
          task.keyPath = null;
          task.implicitSlot = !1;
          if ("object" === typeof resolvedModel && null !== resolvedModel) {
            request.writtenObjects.set(
              resolvedModel,
              serializeByValueID(task.id)
            );
            var currentEnv = request.environmentName();
            currentEnv !== task.environmentName &&
              emitDebugChunk(request, task.id, { env: currentEnv });
            emitChunk(request, task, resolvedModel);
          } else {
            var json = stringify(resolvedModel),
              _currentEnv = request.environmentName();
            _currentEnv !== task.environmentName &&
              emitDebugChunk(request, task.id, { env: _currentEnv });
            emitModelChunk(request, task.id, json);
          }
          request.abortableTasks.delete(task);
          task.status = 1;
        } catch (thrownValue) {
          var x =
            thrownValue === SuspenseException
              ? getSuspendedThenable()
              : thrownValue;
          if (
            "object" === typeof x &&
            null !== x &&
            "function" === typeof x.then
          )
            if (1 === request.status) {
              request.abortableTasks.delete(task);
              task.status = 3;
              var model = stringify(serializeByValueID(request.fatalError));
              emitModelChunk(request, task.id, model);
            } else {
              task.status = 0;
              task.thenableState = getThenableStateAfterSuspending();
              var ping = task.ping;
              x.then(ping, ping);
            }
          else if (x === AbortSigil) {
            request.abortableTasks.delete(task);
            task.status = 3;
            var _model = stringify(serializeByValueID(request.fatalError));
            emitModelChunk(request, task.id, _model);
          } else {
            request.abortableTasks.delete(task);
            task.status = 4;
            var digest = logRecoverableError(request, x, task);
            emitErrorChunk(request, task.id, digest, x);
          }
        } finally {
          debugID = prevDebugID;
        }
      }
    }
    function tryStreamTask(request, task) {
      var prevDebugID = debugID;
      debugID = null;
      try {
        emitChunk(request, task, task.model);
      } finally {
        debugID = prevDebugID;
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
        logRecoverableError(request, error, null), fatalError(request, error);
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
        ((request.status = CLOSED),
        destination.end(),
        (request.destination = null));
    }
    function startWork(request) {
      request.flushScheduled = null !== request.destination;
      setImmediate(function () {
        return requestStorage.run(request, performWork, request);
      });
    }
    function enqueueFlush(request) {
      !1 === request.flushScheduled &&
        0 === request.pingedTasks.length &&
        null !== request.destination &&
        ((request.flushScheduled = !0),
        setImmediate(function () {
          request.flushScheduled = !1;
          var destination = request.destination;
          destination && flushCompletedChunks(request, destination);
        }));
    }
    function startFlowing(request, destination) {
      if (2 === request.status)
        (request.status = CLOSED), destination.destroy(request.fatalError);
      else if (request.status !== CLOSED && null === request.destination) {
        request.destination = destination;
        try {
          flushCompletedChunks(request, destination);
        } catch (error) {
          logRecoverableError(request, error, null), fatalError(request, error);
        }
      }
    }
    function abort(request, reason) {
      try {
        request.status = 1;
        var abortableTasks = request.abortableTasks;
        if (0 < abortableTasks.size) {
          request.pendingChunks++;
          var errorId = request.nextChunkId++;
          request.fatalError = errorId;
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
            digest = logRecoverableError(request, error, null);
          emitErrorChunk(request, errorId, digest, error);
          abortableTasks.forEach(function (task) {
            if (5 !== task.status) {
              task.status = 3;
              var ref = serializeByValueID(errorId);
              task = encodeReferenceChunk(request, task.id, ref);
              request.completedErrorChunks.push(task);
            }
          });
          abortableTasks.clear();
        }
        var abortListeners = request.abortListeners;
        if (0 < abortListeners.size) {
          var _error =
            void 0 === reason
              ? Error("The render was aborted by the server without a reason.")
              : "object" === typeof reason &&
                  null !== reason &&
                  "function" === typeof reason.then
                ? Error("The render was aborted by the server with a promise.")
                : reason;
          abortListeners.forEach(function (callback) {
            return callback(_error);
          });
          abortListeners.clear();
        }
        null !== request.destination &&
          flushCompletedChunks(request, request.destination);
      } catch (error$2) {
        logRecoverableError(request, error$2, null),
          fatalError(request, error$2);
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
      return [resolvedModuleData.id, resolvedModuleData.chunks, name];
    }
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
    function preloadModule(metadata) {
      for (
        var chunks = metadata[1], promises = [], i = 0;
        i < chunks.length;
        i++
      ) {
        var chunkFilename = chunks[i],
          entry = chunkCache.get(chunkFilename);
        if (void 0 === entry) {
          entry = globalThis.__next_chunk_load__(chunkFilename);
          promises.push(entry);
          var resolve = chunkCache.set.bind(chunkCache, chunkFilename, null);
          entry.then(resolve, ignoreReject);
          chunkCache.set(chunkFilename, entry);
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
      return "*" === metadata[2]
        ? moduleExports
        : "" === metadata[2]
          ? moduleExports.__esModule
            ? moduleExports.default
            : moduleExports
          : moduleExports[metadata[2]];
    }
    function Chunk(status, value, reason, response) {
      this.status = status;
      this.value = value;
      this.reason = reason;
      this._response = response;
    }
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
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}",
        -1,
        response
      );
    }
    function resolveIteratorResultChunk(chunk, value, done) {
      resolveModelChunk(
        chunk,
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}",
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
        return parseModelString(
          response,
          parentObj,
          parentKey,
          value,
          reference
        );
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
              (parentObj = reviveModel(
                response,
                value,
                i,
                value[i],
                parentObj
              )),
              void 0 !== parentObj ? (value[i] = parentObj) : delete value[i]);
      return value;
    }
    function initializeModelChunk(chunk) {
      var prevChunk = initializingChunk,
        prevBlocked = initializingChunkBlockedModel;
      initializingChunk = chunk;
      initializingChunkBlockedModel = null;
      var rootReference =
          -1 === chunk.reason ? void 0 : chunk.reason.toString(16),
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
          (initializingChunkBlockedModel.value = value),
            (chunk.status = "blocked");
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
        "" === key &&
          null === blocked.value &&
          (blocked.value = parentObject[key]);
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
            ? controller.close(
                "C" === chunks ? '"$undefined"' : chunks.slice(1)
              )
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
            var _chunk = createPendingChunk(response);
            _chunk.then(
              function (v) {
                return controller.enqueue(v);
              },
              function (e) {
                return controller.error(e);
              }
            );
            previousBlockedChunk = _chunk;
            chunk.then(function () {
              previousBlockedChunk === _chunk && (previousBlockedChunk = null);
              resolveModelChunk(_chunk, json, -1);
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
        iterable = _defineProperty({}, ASYNC_ITERATOR, function () {
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
        });
      iterator = iterator ? iterable[ASYNC_ITERATOR]() : iterable;
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
            return (
              (obj = parseInt(value.slice(2), 16)), getChunk(response, obj)
            );
          case "F":
            return (
              (value = value.slice(2)),
              (value = getOutlinedModel(
                response,
                value,
                obj,
                key,
                createModel
              )),
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
            if (
              void 0 === reference ||
              void 0 === response._temporaryReferences
            )
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
            return parseTypedArray(
              response,
              value,
              Uint8ClampedArray,
              1,
              obj,
              key
            );
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
            return parseTypedArray(
              response,
              value,
              BigUint64Array,
              8,
              obj,
              key
            );
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
    function createResponse(
      bundlerConfig,
      formFieldPrefix,
      temporaryReferences
    ) {
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
    var util = require("util");
    require("crypto");
    var async_hooks = require("async_hooks"),
      ReactDOM = require("react-dom"),
      React = require("react"),
      scheduleMicrotask = queueMicrotask,
      currentView = null,
      writtenBytes = 0,
      destinationHasCapacity = !0,
      textEncoder = new util.TextEncoder(),
      CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference"),
      SERVER_REFERENCE_TAG = Symbol.for("react.server.reference"),
      FunctionBind = Function.prototype.bind,
      ArraySlice = Array.prototype.slice,
      PROMISE_PROTOTYPE = Promise.prototype,
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
      },
      proxyHandlers$1 = {
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
      D: function (href) {
        if ("string" === typeof href && href) {
          var request = resolveRequest();
          if (request) {
            var hints = request.hints,
              key = "D|" + href;
            hints.has(key) || (hints.add(key), emitHint(request, "D", href));
          } else previousDispatcher.D(href);
        }
      },
      C: function (href, crossOrigin) {
        if ("string" === typeof href) {
          var request = resolveRequest();
          if (request) {
            var hints = request.hints,
              key =
                "C|" +
                (null == crossOrigin ? "null" : crossOrigin) +
                "|" +
                href;
            hints.has(key) ||
              (hints.add(key),
              "string" === typeof crossOrigin
                ? emitHint(request, "C", [href, crossOrigin])
                : emitHint(request, "C", href));
          } else previousDispatcher.C(href, crossOrigin);
        }
      },
      L: function (href, as, options) {
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
      },
      m: function (href, options) {
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
      },
      X: function (src, options) {
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
      },
      S: function (href, precedence, options) {
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
      },
      M: function (src, options) {
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
    };
    var frameRegExp =
        /^ {3} at (?:(.+) \((.+):(\d+):(\d+)\)|(?:async )?(.+):(\d+):(\d+))$/,
      requestStorage = new async_hooks.AsyncLocalStorage(),
      componentStorage = new async_hooks.AsyncLocalStorage(),
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
      },
      REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"),
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
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
      ASYNC_ITERATOR = Symbol.asyncIterator,
      SuspenseException = Error(
        "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`"
      ),
      suspendedThenable = null,
      currentRequest$1 = null,
      thenableIndexCounter = 0,
      thenableState = null,
      currentComponentDebugInfo = null,
      HooksDispatcher = {
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
        useId: function () {
          if (null === currentRequest$1)
            throw Error("useId can only be used while React is rendering");
          var id = currentRequest$1.identifierCount++;
          return (
            ":" +
            currentRequest$1.identifierPrefix +
            "S" +
            id.toString(32) +
            ":"
          );
        },
        useSyncExternalStore: unsupportedHook,
        useCacheRefresh: function () {
          return unsupportedRefresh;
        },
        useMemoCache: function (size) {
          for (var data = Array(size), i = 0; i < size; i++)
            data[i] = REACT_MEMO_CACHE_SENTINEL;
          return data;
        },
        use: function (usable) {
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
            if (
              null != usable.value &&
              usable.value.$$typeof === REACT_CONTEXT_TYPE
            )
              throw Error(
                "Cannot read a Client Context from a Server Component."
              );
            throw Error("Cannot use() an already resolved Client Reference.");
          }
          throw Error(
            "An unsupported type was passed to use(): " + String(usable)
          );
        }
      },
      currentOwner = null,
      DefaultAsyncDispatcher = {
        getCacheForType: function (resourceType) {
          var cache = (cache = resolveRequest()) ? cache.cache : new Map();
          var entry = cache.get(resourceType);
          void 0 === entry &&
            ((entry = resourceType()), cache.set(resourceType, entry));
          return entry;
        },
        getOwner: function () {
          if (currentOwner) return currentOwner;
          var owner = componentStorage.getStore();
          return owner ? owner : null;
        }
      },
      ReactSharedInternalsServer =
        React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    if (!ReactSharedInternalsServer)
      throw Error(
        'The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled in any environment that runs React Server Components.'
      );
    new ("function" === typeof WeakMap ? WeakMap : Map)();
    var callComponent = {
        "react-stack-bottom-frame": function (
          Component,
          props,
          componentDebugInfo
        ) {
          currentOwner = componentDebugInfo;
          try {
            return Component(props, void 0);
          } finally {
            currentOwner = null;
          }
        }
      },
      callComponentInDEV =
        callComponent["react-stack-bottom-frame"].bind(callComponent),
      callLazyInit = {
        "react-stack-bottom-frame": function (lazy) {
          var init = lazy._init;
          return init(lazy._payload);
        }
      },
      callLazyInitInDEV =
        callLazyInit["react-stack-bottom-frame"].bind(callLazyInit),
      callIterator = {
        "react-stack-bottom-frame": function (iterator, progress, error) {
          iterator.next().then(progress, error);
        }
      },
      callIteratorInDEV =
        callIterator["react-stack-bottom-frame"].bind(callIterator),
      isArrayImpl = Array.isArray,
      getPrototypeOf = Object.getPrototypeOf,
      jsxPropsParents = new WeakMap(),
      jsxChildrenParents = new WeakMap(),
      CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
      externalRegExp = /\/node_modules\/|^node:|^$/,
      ObjectPrototype = Object.prototype,
      stringify = JSON.stringify,
      AbortSigil = {},
      CLOSED = 3,
      currentRequest = null,
      debugID = null,
      modelRoot = !1,
      emptyRoot = {},
      chunkCache = new Map(),
      hasOwnProperty = Object.prototype.hasOwnProperty;
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
            (null === this.value && (this.value = []),
            this.value.push(resolve));
          reject &&
            (null === this.reason && (this.reason = []),
            this.reason.push(reject));
          break;
        default:
          reject(this.reason);
      }
    };
    var initializingChunk = null,
      initializingChunkBlockedModel = null;
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
              (action = loadServerReference(
                serverManifest,
                value.id,
                value.bound
              )))
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
    exports.decodeReply = function (body, turbopackMap, options) {
      if ("string" === typeof body) {
        var form = new FormData();
        form.append("0", body);
        body = form;
      }
      body = createResponse(
        turbopackMap,
        "",
        options ? options.temporaryReferences : void 0,
        body
      );
      turbopackMap = getChunk(body, 0);
      close(body);
      return turbopackMap;
    };
    exports.decodeReplyFromBusboy = function (
      busboyStream,
      turbopackMap,
      options
    ) {
      var response = createResponse(
          turbopackMap,
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
        var JSCompiler_object_inline_chunks_143 = [];
        value.on("data", function (chunk) {
          JSCompiler_object_inline_chunks_143.push(chunk);
        });
        value.on("end", function () {
          var blob = new Blob(JSCompiler_object_inline_chunks_143, {
            type: mimeType
          });
          response._formData.append(name, blob, filename);
          pendingFiles--;
          if (0 === pendingFiles) {
            for (blob = 0; blob < queuedFields.length; blob += 2)
              resolveField(
                response,
                queuedFields[blob],
                queuedFields[blob + 1]
              );
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
    exports.renderToPipeableStream = function (model, turbopackMap, options) {
      var request = new RequestInstance(
          model,
          turbopackMap,
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
  })();
