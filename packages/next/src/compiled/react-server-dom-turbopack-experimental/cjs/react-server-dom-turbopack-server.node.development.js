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
    function voidHandler() {}
    function noop() {}
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable)
        return null;
      maybeIterable =
        (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
        maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    function flushBuffered(destination) {
      "function" === typeof destination.flush && destination.flush();
    }
    function beginWriting() {
      currentView = new Uint8Array(4096);
      writtenBytes = 0;
      destinationHasCapacity = !0;
    }
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
      } else
        0 !== chunk.byteLength &&
          (4096 < chunk.byteLength
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
                (writtenBytes = 0))));
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
    function byteLengthOfChunk(chunk) {
      return "string" === typeof chunk
        ? Buffer.byteLength(chunk, "utf8")
        : chunk.byteLength;
    }
    function isClientReference(reference) {
      return reference.$$typeof === CLIENT_REFERENCE_TAG$1;
    }
    function isServerReference(reference) {
      return reference.$$typeof === SERVER_REFERENCE_TAG;
    }
    function registerClientReferenceImpl(proxyImplementation, id, async) {
      return Object.defineProperties(proxyImplementation, {
        $$typeof: { value: CLIENT_REFERENCE_TAG$1 },
        $$id: { value: id },
        $$async: { value: async }
      });
    }
    function bind() {
      var newFn = FunctionBind$1.apply(this, arguments);
      if (this.$$typeof === SERVER_REFERENCE_TAG) {
        null != arguments[0] &&
          console.error(
            'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
          );
        var args = ArraySlice$1.call(arguments, 1),
          $$typeof = { value: SERVER_REFERENCE_TAG },
          $$id = { value: this.$$id };
        args = { value: this.$$bound ? this.$$bound.concat(args) : args };
        return Object.defineProperties(newFn, {
          $$typeof: $$typeof,
          $$id: $$id,
          $$bound: args,
          $$location: { value: this.$$location, configurable: !0 },
          bind: { value: bind, configurable: !0 }
        });
      }
      return newFn;
    }
    function registerServerReference(reference, id, exportName) {
      return Object.defineProperties(reference, {
        $$typeof: { value: SERVER_REFERENCE_TAG },
        $$id: {
          value: null === exportName ? id : id + "#" + exportName,
          configurable: !0
        },
        $$bound: { value: null, configurable: !0 },
        $$location: { value: Error("react-stack-top-frame"), configurable: !0 },
        bind: { value: bind, configurable: !0 },
        toString: serverReferenceToString
      });
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
    function getClientReferenceKey(reference) {
      return reference.$$async ? reference.$$id + "#async" : reference.$$id;
    }
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
    function resolveOwner() {
      if (currentOwner) return currentOwner;
      var owner = componentStorage.getStore();
      return owner ? owner : null;
    }
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
    function isPromiseAwaitInternal$1(url, functionName) {
      if ("node:internal/async_hooks" === url) return !0;
      if ("" !== url) return !1;
      switch (functionName) {
        case "Promise.then":
        case "Promise.catch":
        case "Promise.finally":
        case "Function.reject":
        case "Promise.reject":
        case "Function.resolve":
        case "Promise.resolve":
        case "Function.all":
        case "Promise.all":
        case "Function.allSettled":
        case "Promise.allSettled":
        case "Function.any":
        case "Promise.any":
        case "Function.race":
        case "Promise.race":
        case "Function.try":
        case "Promise.try":
        case "Function.withResolvers":
        case "Promise.withResolvers":
          return !0;
        default:
          return !1;
      }
    }
    function isAwaitInUserspace$2(filterStackFrame, stack) {
      for (
        var firstFrame = 0;
        stack.length > firstFrame &&
        isPromiseAwaitInternal$1(stack[firstFrame][1], stack[firstFrame][0]);

      )
        firstFrame++;
      if (stack.length > firstFrame) {
        stack = stack[firstFrame];
        firstFrame = stack[0];
        var url = stack[1];
        if (url.startsWith("about://React/")) {
          var envIdx = url.indexOf("/", 14),
            suffixIdx = url.lastIndexOf("?");
          -1 < envIdx &&
            -1 < suffixIdx &&
            (url = decodeURI(url.slice(envIdx + 1, suffixIdx)));
        }
        return (
          filterStackFrame(url, firstFrame, stack[2], stack[3]) && "" !== url
        );
      }
      return !1;
    }
    function resolvePromiseOrAwaitNode(unresolvedNode, endTime) {
      unresolvedNode.tag = 3 === unresolvedNode.tag ? 1 : 2;
      unresolvedNode.end = endTime;
      return unresolvedNode;
    }
    function initAsyncDebugInfo() {
      initialized ||
        ((initialized = !0),
        async_hooks
          .createHook({
            init: function (asyncId, type, triggerAsyncId, resource) {
              var trigger = pendingOperations.get(triggerAsyncId);
              if ("PROMISE" === type)
                if (
                  ((type = async_hooks.executionAsyncId()),
                  type !== triggerAsyncId)
                ) {
                  if (void 0 === trigger) return;
                  triggerAsyncId = null;
                  if (
                    null === trigger.stack ||
                    (2 !== trigger.tag && 4 !== trigger.tag)
                  ) {
                    resource = new WeakRef(resource);
                    var context = resolveCache();
                    context =
                      null === context ? void 0 : context.filterStackFrame;
                    void 0 !== context &&
                      ((triggerAsyncId = parseStackTracePrivate(Error(), 5)),
                      null === triggerAsyncId ||
                        isAwaitInUserspace$2(context, triggerAsyncId) ||
                        (triggerAsyncId = null));
                  } else
                    (triggerAsyncId = emptyStack),
                      (resource =
                        void 0 !== resource._debugInfo
                          ? new WeakRef(resource)
                          : trigger.promise);
                  type = pendingOperations.get(type);
                  trigger = {
                    tag: 4,
                    owner: resolveOwner(),
                    stack: triggerAsyncId,
                    start: performance.now(),
                    end: -1.1,
                    promise: resource,
                    awaited: trigger,
                    previous: void 0 === type ? null : type
                  };
                } else
                  (type = resolveOwner()),
                    (trigger = {
                      tag: 3,
                      owner: type,
                      stack:
                        null === type
                          ? null
                          : parseStackTracePrivate(Error(), 5),
                      start: performance.now(),
                      end: -1.1,
                      promise: new WeakRef(resource),
                      awaited: void 0 === trigger ? null : trigger,
                      previous: null
                    });
              else if (
                "bound-anonymous-fn" === type ||
                "Microtask" === type ||
                "TickObject" === type ||
                "Immediate" === type
              ) {
                if (void 0 === trigger) return;
              } else if (void 0 === trigger)
                (trigger = resolveOwner()),
                  (trigger = {
                    tag: 0,
                    owner: trigger,
                    stack:
                      null === trigger
                        ? parseStackTracePrivate(Error(), 3)
                        : null,
                    start: performance.now(),
                    end: -1.1,
                    promise: null,
                    awaited: null,
                    previous: null
                  });
              else if (2 === trigger.tag || 4 === trigger.tag)
                (type = resolveOwner()),
                  (trigger = {
                    tag: 0,
                    owner: type,
                    stack:
                      null === type ? parseStackTracePrivate(Error(), 3) : null,
                    start: performance.now(),
                    end: -1.1,
                    promise: null,
                    awaited: null,
                    previous: trigger
                  });
              pendingOperations.set(asyncId, trigger);
            },
            before: function (asyncId) {
              var node = pendingOperations.get(asyncId);
              if (void 0 !== node)
                switch (node.tag) {
                  case 0:
                    lastRanAwait = null;
                    0 > node.end
                      ? (node.end = performance.now())
                      : ((node = {
                          tag: 0,
                          owner: node.owner,
                          stack: node.stack,
                          start: node.start,
                          end: performance.now(),
                          promise: node.promise,
                          awaited: node.awaited,
                          previous: node.previous
                        }),
                        pendingOperations.set(asyncId, node));
                    break;
                  case 4:
                    lastRanAwait = resolvePromiseOrAwaitNode(
                      node,
                      performance.now()
                    );
                    break;
                  case 2:
                    lastRanAwait = node;
                    break;
                  case 3:
                    resolvePromiseOrAwaitNode(
                      node,
                      performance.now()
                    ).previous = lastRanAwait;
                    lastRanAwait = null;
                    break;
                  default:
                    lastRanAwait = null;
                }
            },
            promiseResolve: function (asyncId) {
              var node = pendingOperations.get(asyncId);
              if (void 0 !== node) {
                switch (node.tag) {
                  case 4:
                  case 3:
                    node = resolvePromiseOrAwaitNode(node, performance.now());
                    break;
                  case 2:
                  case 1:
                    break;
                  default:
                    throw Error(
                      "A Promise should never be an IO_NODE. This is a bug in React."
                    );
                }
                var currentAsyncId = async_hooks.executionAsyncId();
                asyncId !== currentAsyncId &&
                  ((asyncId = pendingOperations.get(currentAsyncId)),
                  1 === node.tag
                    ? (node.awaited = void 0 === asyncId ? null : asyncId)
                    : void 0 !== asyncId &&
                      ((currentAsyncId = {
                        tag: 2,
                        owner: node.owner,
                        stack: node.stack,
                        start: node.start,
                        end: node.end,
                        promise: node.promise,
                        awaited: node.awaited,
                        previous: node.previous
                      }),
                      (node.start = node.end),
                      (node.end = performance.now()),
                      (node.previous = currentAsyncId),
                      (node.awaited = asyncId)));
              }
            },
            destroy: function (asyncId) {
              pendingOperations.delete(asyncId);
            }
          })
          .enable());
    }
    function getCurrentAsyncSequence() {
      var currentNode = pendingOperations.get(async_hooks.executionAsyncId());
      return void 0 === currentNode ? null : currentNode;
    }
    function getAsyncSequenceFromPromise(promise) {
      try {
        var asyncId = getAsyncId.call(promise);
      } catch (x) {}
      if (void 0 === asyncId) return null;
      promise = pendingOperations.get(asyncId);
      return void 0 === promise ? null : promise;
    }
    function collectStackTracePrivate(error, structuredStackTrace) {
      error = [];
      for (var i = framesToSkip; i < structuredStackTrace.length; i++) {
        var callSite = structuredStackTrace[i],
          name = callSite.getFunctionName() || "<anonymous>";
        if (name.includes("react_stack_bottom_frame")) break;
        else if (callSite.isNative())
          (callSite = callSite.isAsync()),
            error.push([name, "", 0, 0, 0, 0, callSite]);
        else {
          if (callSite.isConstructor()) name = "new " + name;
          else if (!callSite.isToplevel()) {
            var callSite$jscomp$0 = callSite;
            name = callSite$jscomp$0.getTypeName();
            var methodName = callSite$jscomp$0.getMethodName();
            callSite$jscomp$0 = callSite$jscomp$0.getFunctionName();
            var result = "";
            callSite$jscomp$0
              ? (name &&
                  identifierRegExp.test(callSite$jscomp$0) &&
                  callSite$jscomp$0 !== name &&
                  (result += name + "."),
                (result += callSite$jscomp$0),
                !methodName ||
                  callSite$jscomp$0 === methodName ||
                  callSite$jscomp$0.endsWith("." + methodName) ||
                  callSite$jscomp$0.endsWith(" " + methodName) ||
                  (result += " [as " + methodName + "]"))
              : (name && (result += name + "."),
                (result = methodName
                  ? result + methodName
                  : result + "<anonymous>"));
            name = result;
          }
          "<anonymous>" === name && (name = "");
          methodName = callSite.getScriptNameOrSourceURL() || "<anonymous>";
          "<anonymous>" === methodName &&
            ((methodName = ""),
            callSite.isEval() &&
              (callSite$jscomp$0 = callSite.getEvalOrigin()) &&
              (methodName = callSite$jscomp$0.toString() + ", <anonymous>"));
          callSite$jscomp$0 = callSite.getLineNumber() || 0;
          result = callSite.getColumnNumber() || 0;
          var enclosingLine =
              "function" === typeof callSite.getEnclosingLineNumber
                ? callSite.getEnclosingLineNumber() || 0
                : 0,
            enclosingCol =
              "function" === typeof callSite.getEnclosingColumnNumber
                ? callSite.getEnclosingColumnNumber() || 0
                : 0;
          callSite = callSite.isAsync();
          error.push([
            name,
            methodName,
            callSite$jscomp$0,
            result,
            enclosingLine,
            enclosingCol,
            callSite
          ]);
        }
      }
      collectedStackTrace = error;
      return "";
    }
    function collectStackTrace(error, structuredStackTrace) {
      collectStackTracePrivate(error, structuredStackTrace);
      error = (error.name || "Error") + ": " + (error.message || "");
      for (var i = 0; i < structuredStackTrace.length; i++)
        error += "\n    at " + structuredStackTrace[i].toString();
      return error;
    }
    function parseStackTracePrivate(error, skipFrames) {
      collectedStackTrace = null;
      framesToSkip = skipFrames;
      skipFrames = Error.prepareStackTrace;
      Error.prepareStackTrace = collectStackTracePrivate;
      try {
        if ("" !== error.stack) return null;
      } finally {
        Error.prepareStackTrace = skipFrames;
      }
      return collectedStackTrace;
    }
    function parseStackTrace(error, skipFrames) {
      var existing = stackTraceCache.get(error);
      if (void 0 !== existing) return existing;
      collectedStackTrace = null;
      framesToSkip = skipFrames;
      existing = Error.prepareStackTrace;
      Error.prepareStackTrace = collectStackTrace;
      try {
        var stack = String(error.stack);
      } finally {
        Error.prepareStackTrace = existing;
      }
      if (null !== collectedStackTrace)
        return (
          (stack = collectedStackTrace),
          (collectedStackTrace = null),
          stackTraceCache.set(error, stack),
          stack
        );
      stack.startsWith("Error: react-stack-top-frame\n") &&
        (stack = stack.slice(29));
      existing = stack.indexOf("react_stack_bottom_frame");
      -1 !== existing && (existing = stack.lastIndexOf("\n", existing));
      -1 !== existing && (stack = stack.slice(0, existing));
      stack = stack.split("\n");
      for (existing = []; skipFrames < stack.length; skipFrames++) {
        var parsed = frameRegExp.exec(stack[skipFrames]);
        if (parsed) {
          var name = parsed[1] || "",
            isAsync = "async " === parsed[8];
          "<anonymous>" === name
            ? (name = "")
            : name.startsWith("async ") &&
              ((name = name.slice(6)), (isAsync = !0));
          var filename = parsed[2] || parsed[5] || "";
          "<anonymous>" === filename && (filename = "");
          existing.push([
            name,
            filename,
            +(parsed[3] || parsed[6]),
            +(parsed[4] || parsed[7]),
            0,
            0,
            isAsync
          ]);
        }
      }
      stackTraceCache.set(error, existing);
      return existing;
    }
    function unbadgeConsole(methodName, args) {
      var offset = 0;
      switch (methodName) {
        case "dir":
        case "dirxml":
        case "groupEnd":
        case "table":
          return null;
        case "assert":
          offset = 1;
      }
      var format = args[offset],
        style = args[offset + 1];
      methodName = args[offset + 2];
      return "string" === typeof format &&
        format.startsWith("\u001b[0m\u001b[7m%c%s\u001b[0m%c") &&
        "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px" ===
          style &&
        "string" === typeof methodName
        ? ((format = format.slice(18)),
          " " === format[0] && (format = format.slice(1)),
          args.splice(offset, 4, format),
          methodName.slice(1, methodName.length - 1))
        : null;
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
    function trackUsedThenable(thenableState, thenable, index) {
      index = thenableState[index];
      void 0 === index
        ? (thenableState.push(thenable),
          (thenableState._stacks || (thenableState._stacks = [])).push(Error()))
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
    function getSuspendedThenable() {
      if (null === suspendedThenable)
        throw Error(
          "Expected a suspended thenable. This is a bug in React. Please file an issue."
        );
      var thenable = suspendedThenable;
      suspendedThenable = null;
      return thenable;
    }
    function getThenableStateAfterSuspending$1() {
      var state = thenableState$1 || [];
      state._componentDebugInfo = currentComponentDebugInfo$1;
      thenableState$1 = currentComponentDebugInfo$1 = null;
      return state;
    }
    function unsupportedHook$1() {
      throw Error("This Hook is not supported in Server Components.");
    }
    function unsupportedRefresh$1() {
      throw Error(
        "Refreshing the cache is not supported in Server Components."
      );
    }
    function unsupportedContext$1() {
      throw Error("Cannot read a Client Context from a Server Component.");
    }
    function prepareStackTrace(error, structuredStackTrace) {
      error = (error.name || "Error") + ": " + (error.message || "");
      for (var i = 0; i < structuredStackTrace.length; i++)
        error += "\n    at " + structuredStackTrace[i].toString();
      return error;
    }
    function getOwnerStackByComponentInfoInDev(componentInfo) {
      try {
        var info = "";
        if (!componentInfo.owner && "string" === typeof componentInfo.name) {
          var name = componentInfo.name;
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
        for (; componentInfo; ) {
          var ownerStack = componentInfo.debugStack;
          if (null != ownerStack) {
            if ((componentInfo = componentInfo.owner)) {
              name = info;
              match = ownerStack;
              var prevPrepareStackTrace = Error.prepareStackTrace;
              Error.prepareStackTrace = prepareStackTrace;
              var stack = match.stack;
              Error.prepareStackTrace = prevPrepareStackTrace;
              stack.startsWith("Error: react-stack-top-frame\n") &&
                (stack = stack.slice(29));
              var idx = stack.indexOf("\n");
              -1 !== idx && (stack = stack.slice(idx + 1));
              idx = stack.indexOf("react_stack_bottom_frame");
              -1 !== idx && (idx = stack.lastIndexOf("\n", idx));
              var JSCompiler_inline_result =
                -1 !== idx ? (stack = stack.slice(0, idx)) : "";
              info = name + ("\n" + JSCompiler_inline_result);
            }
          } else break;
        }
        return info;
      } catch (x) {
        return "\nError generating stack: " + x.message + "\n" + x.stack;
      }
    }
    function resetOwnerStackLimit() {
      var now = getCurrentTime();
      1e3 < now - lastResetTime &&
        ((ReactSharedInternalsServer.recentlyCreatedOwnerStacks = 0),
        (lastResetTime = now));
    }
    function isObjectPrototype(object) {
      if (!object) return !1;
      var ObjectPrototype = Object.prototype;
      if (object === ObjectPrototype) return !0;
      if (getPrototypeOf$2(object)) return !1;
      object = Object.getOwnPropertyNames(object);
      for (var i = 0; i < object.length; i++)
        if (!(object[i] in ObjectPrototype)) return !1;
      return !0;
    }
    function isGetter(object, name) {
      if (object === Object.prototype || null === object) return !1;
      var descriptor = Object.getOwnPropertyDescriptor(object, name);
      return void 0 === descriptor
        ? isGetter(getPrototypeOf$2(object), name)
        : "function" === typeof descriptor.get;
    }
    function isSimpleObject(object) {
      if (!isObjectPrototype(getPrototypeOf$2(object))) return !1;
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
      object = Object.prototype.toString.call(object);
      return object.slice(8, object.length - 1);
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
    function binaryToComparableString(view) {
      return String.fromCharCode.apply(
        String,
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      );
    }
    function defaultFilterStackFrame$2(filename) {
      return (
        "" !== filename &&
        !filename.startsWith("node:") &&
        !filename.includes("node_modules")
      );
    }
    function devirtualizeURL$2(url) {
      if (url.startsWith("about://React/")) {
        var envIdx = url.indexOf("/", 14),
          suffixIdx = url.lastIndexOf("?");
        if (-1 < envIdx && -1 < suffixIdx)
          return decodeURI(url.slice(envIdx + 1, suffixIdx));
      }
      return url;
    }
    function isPromiseCreationInternal$1(url, functionName) {
      if ("node:internal/async_hooks" === url) return !0;
      if ("" !== url) return !1;
      switch (functionName) {
        case "new Promise":
        case "Function.withResolvers":
        case "Promise.withResolvers":
        case "Function.reject":
        case "Promise.reject":
        case "Function.resolve":
        case "Promise.resolve":
        case "Function.all":
        case "Promise.all":
        case "Function.allSettled":
        case "Promise.allSettled":
        case "Function.race":
        case "Promise.race":
        case "Function.try":
        case "Promise.try":
          return !0;
        default:
          return !1;
      }
    }
    function filterStackTrace$2(request, stack) {
      request = request.filterStackFrame;
      for (var filteredStack = [], i = 0; i < stack.length; i++) {
        var callsite = stack[i],
          functionName = callsite[0],
          url = devirtualizeURL$2(callsite[1]);
        request(url, functionName, callsite[2], callsite[3]) &&
          ((callsite = callsite.slice(0)),
          (callsite[1] = url),
          filteredStack.push(callsite));
      }
      return filteredStack;
    }
    function hasUnfilteredFrame$1(request, stack) {
      request = request.filterStackFrame;
      for (var i = 0; i < stack.length; i++) {
        var callsite = stack[i],
          functionName = callsite[0],
          url = devirtualizeURL$2(callsite[1]),
          lineNumber = callsite[2],
          columnNumber = callsite[3];
        if (
          !callsite[6] &&
          request(url, functionName, lineNumber, columnNumber) &&
          "" !== url
        )
          return !0;
      }
      return !1;
    }
    function isPromiseAwaitInternal(url, functionName) {
      if ("node:internal/async_hooks" === url) return !0;
      if ("" !== url) return !1;
      switch (functionName) {
        case "Promise.then":
        case "Promise.catch":
        case "Promise.finally":
        case "Function.reject":
        case "Promise.reject":
        case "Function.resolve":
        case "Promise.resolve":
        case "Function.all":
        case "Promise.all":
        case "Function.allSettled":
        case "Promise.allSettled":
        case "Function.any":
        case "Promise.any":
        case "Function.race":
        case "Promise.race":
        case "Function.try":
        case "Promise.try":
        case "Function.withResolvers":
        case "Promise.withResolvers":
          return !0;
        default:
          return !1;
      }
    }
    function isAwaitInUserspace$1(request, stack) {
      for (
        var firstFrame = 0;
        stack.length > firstFrame &&
        isPromiseAwaitInternal(stack[firstFrame][1], stack[firstFrame][0]);

      )
        firstFrame++;
      if (stack.length > firstFrame) {
        request = request.filterStackFrame;
        stack = stack[firstFrame];
        firstFrame = stack[0];
        var url = devirtualizeURL$2(stack[1]);
        return request(url, firstFrame, stack[2], stack[3]) && "" !== url;
      }
      return !1;
    }
    function patchConsole$2(consoleInst, methodName) {
      var descriptor = Object.getOwnPropertyDescriptor(consoleInst, methodName);
      if (
        descriptor &&
        (descriptor.configurable || descriptor.writable) &&
        "function" === typeof descriptor.value
      ) {
        var originalMethod = descriptor.value;
        descriptor = Object.getOwnPropertyDescriptor(originalMethod, "name");
        var wrapperMethod = function () {
          var request = resolveRequest$1();
          if (("assert" !== methodName || !arguments[0]) && null !== request) {
            var stack = filterStackTrace$2(
              request,
              parseStackTracePrivate(Error("react-stack-top-frame"), 1) || []
            );
            request.pendingDebugChunks++;
            var owner = resolveOwner(),
              args = Array.from(arguments),
              env = unbadgeConsole(methodName, args);
            null === env && (env = (0, request.environmentName)());
            null != owner && outlineComponentInfo$1(request, owner);
            var payload = [methodName, stack, owner, env];
            payload.push.apply(payload, args);
            args = serializeDebugModel$1(
              request,
              (null === request.deferredDebugObjects ? 500 : 10) + stack.length,
              payload
            );
            "[" !== args[0] &&
              (args = serializeDebugModel$1(request, 10 + stack.length, [
                methodName,
                stack,
                owner,
                env,
                "Unknown Value: React could not send it from the server."
              ]));
            request.completedDebugChunks.push(":W" + args + "\n");
          }
          return originalMethod.apply(this, arguments);
        };
        descriptor && Object.defineProperty(wrapperMethod, "name", descriptor);
        Object.defineProperty(consoleInst, methodName, {
          value: wrapperMethod
        });
      }
    }
    function getCurrentStackInDEV$1() {
      var owner = resolveOwner();
      return null === owner ? "" : getOwnerStackByComponentInfoInDev(owner);
    }
    function throwTaintViolation$2(message) {
      throw Error(message);
    }
    function cleanupTaintQueue$2(request) {
      request = request.taintCleanupQueue;
      TaintRegistryPendingRequests$2.delete(request);
      for (var i = 0; i < request.length; i++) {
        var entryValue = request[i],
          entry = TaintRegistryValues$2.get(entryValue);
        void 0 !== entry &&
          (1 === entry.count
            ? TaintRegistryValues$2.delete(entryValue)
            : entry.count--);
      }
      request.length = 0;
    }
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
      temporaryReferences,
      debugStartTime,
      environmentName,
      filterStackFrame,
      keepDebugAlive
    ) {
      if (
        null !== ReactSharedInternalsServer.A &&
        ReactSharedInternalsServer.A !== DefaultAsyncDispatcher
      )
        throw Error(
          "Currently React only supports one RSC renderer at a time."
        );
      ReactSharedInternalsServer.A = DefaultAsyncDispatcher;
      ReactSharedInternalsServer.getCurrentStack = getCurrentStackInDEV$1;
      var abortSet = new Set(),
        pingedTasks = [],
        cleanupQueue = [];
      TaintRegistryPendingRequests$2.add(cleanupQueue);
      var hints = new Set();
      this.type = type;
      this.status = OPENING$2;
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
      this.taintCleanupQueue = cleanupQueue;
      this.onError = void 0 === onError ? defaultErrorHandler$2 : onError;
      this.onAllReady = onAllReady;
      this.onFatalError = onFatalError;
      this.pendingDebugChunks = 0;
      this.completedDebugChunks = [];
      this.debugDestination = null;
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
      this.filterStackFrame =
        void 0 === filterStackFrame
          ? defaultFilterStackFrame$2
          : filterStackFrame;
      this.didWarnForKey = null;
      this.writtenDebugObjects = new WeakMap();
      this.deferredDebugObjects = keepDebugAlive
        ? { retained: new Map(), existing: new Map() }
        : null;
      type =
        "number" === typeof debugStartTime
          ? (this.timeOrigin = debugStartTime - performance.timeOrigin)
          : (this.timeOrigin = performance.now());
      emitTimeOriginChunk$1(this, type + performance.timeOrigin);
      this.abortTime = -0;
      model = createTask$2(
        this,
        model,
        null,
        !1,
        0,
        abortSet,
        type,
        null,
        null,
        null
      );
      pingedTasks.push(model);
    }
    function createRequest$2(
      model,
      bundlerConfig,
      onError,
      identifierPrefix,
      temporaryReferences,
      debugStartTime,
      environmentName,
      filterStackFrame,
      keepDebugAlive
    ) {
      resetOwnerStackLimit();
      return new RequestInstance$2(
        20,
        model,
        bundlerConfig,
        onError,
        noop,
        noop,
        identifierPrefix,
        temporaryReferences,
        debugStartTime,
        environmentName,
        filterStackFrame,
        keepDebugAlive
      );
    }
    function createPrerenderRequest$1(
      model,
      bundlerConfig,
      onAllReady,
      onFatalError,
      onError,
      identifierPrefix,
      temporaryReferences,
      debugStartTime,
      environmentName,
      filterStackFrame,
      keepDebugAlive
    ) {
      resetOwnerStackLimit();
      return new RequestInstance$2(
        PRERENDER$1,
        model,
        bundlerConfig,
        onError,
        onAllReady,
        onFatalError,
        identifierPrefix,
        temporaryReferences,
        debugStartTime,
        environmentName,
        filterStackFrame,
        keepDebugAlive
      );
    }
    function resolveRequest$1() {
      if (currentRequest$2) return currentRequest$2;
      var store = requestStorage.getStore();
      return store ? store : null;
    }
    function serializeDebugThenable$1(request, counter, thenable) {
      request.pendingDebugChunks++;
      var id = request.nextChunkId++,
        ref = "$@" + id.toString(16);
      request.writtenDebugObjects.set(thenable, ref);
      switch (thenable.status) {
        case "fulfilled":
          return (
            emitOutlinedDebugModelChunk$1(request, id, counter, thenable.value),
            ref
          );
        case "rejected":
          return (
            emitErrorChunk$1(request, id, "", thenable.reason, !0, null), ref
          );
      }
      if (request.status === ABORTING$2)
        return emitDebugHaltChunk$1(request, id), ref;
      var deferredDebugObjects = request.deferredDebugObjects;
      if (null !== deferredDebugObjects)
        return (
          deferredDebugObjects.retained.set(id, thenable),
          (ref = "$Y@" + id.toString(16)),
          request.writtenDebugObjects.set(thenable, ref),
          ref
        );
      var cancelled = !1;
      thenable.then(
        function (value) {
          cancelled ||
            ((cancelled = !0),
            request.status === ABORTING$2
              ? emitDebugHaltChunk$1(request, id)
              : (isArrayImpl(value) && 200 < value.length) ||
                  ((value instanceof ArrayBuffer ||
                    value instanceof Int8Array ||
                    value instanceof Uint8Array ||
                    value instanceof Uint8ClampedArray ||
                    value instanceof Int16Array ||
                    value instanceof Uint16Array ||
                    value instanceof Int32Array ||
                    value instanceof Uint32Array ||
                    value instanceof Float32Array ||
                    value instanceof Float64Array ||
                    value instanceof BigInt64Array ||
                    value instanceof BigUint64Array ||
                    value instanceof DataView) &&
                    1e3 < value.byteLength)
                ? emitDebugHaltChunk$1(request, id)
                : emitOutlinedDebugModelChunk$1(request, id, counter, value),
            enqueueFlush$1(request));
        },
        function (reason) {
          cancelled ||
            ((cancelled = !0),
            request.status === ABORTING$2
              ? emitDebugHaltChunk$1(request, id)
              : emitErrorChunk$1(request, id, "", reason, !0, null),
            enqueueFlush$1(request));
        }
      );
      Promise.resolve().then(function () {
        cancelled ||
          ((cancelled = !0),
          emitDebugHaltChunk$1(request, id),
          enqueueFlush$1(request),
          (counter = request = null));
      });
      return ref;
    }
    function emitRequestedDebugThenable$1(request, id, counter, thenable) {
      thenable.then(
        function (value) {
          request.status === ABORTING$2
            ? emitDebugHaltChunk$1(request, id)
            : emitOutlinedDebugModelChunk$1(request, id, counter, value);
          enqueueFlush$1(request);
        },
        function (reason) {
          request.status === ABORTING$2
            ? emitDebugHaltChunk$1(request, id)
            : emitErrorChunk$1(request, id, "", reason, !0, null);
          enqueueFlush$1(request);
        }
      );
    }
    function createThenableTask(request, task, thenable) {
      return createTask$2(
        request,
        thenable,
        task.keyPath,
        task.implicitSlot,
        task.formatContext,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
    }
    function serializeThenable$1(request, task, thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return (
            (task = createThenableTask(request, task, thenable)),
            forwardDebugInfoFromThenable$1(request, task, thenable, null, null),
            (task.model = thenable.value),
            pingTask$2(request, task),
            task.id
          );
        case "rejected":
          return (
            (task = createThenableTask(request, task, thenable)),
            forwardDebugInfoFromThenable$1(request, task, thenable, null, null),
            erroredTask$2(request, task, thenable.reason),
            task.id
          );
        case "pending_weak":
          var id = request.nextChunkId++,
            keyPath = task.keyPath,
            implicitSlot = task.implicitSlot,
            formatContext = task.formatContext,
            lastTimestamp = task.time,
            debugOwner = task.debugOwner,
            debugStack = task.debugStack,
            debugTask = task.debugTask,
            settled = !1;
          thenable.then(
            function (value) {
              settled ||
                request.status > OPEN$2 ||
                ((settled = !0),
                (value = createTaskWithID(
                  request,
                  id,
                  value,
                  keyPath,
                  implicitSlot,
                  formatContext,
                  request.abortableTasks,
                  lastTimestamp,
                  debugOwner,
                  debugStack,
                  debugTask
                )),
                forwardDebugInfoFromCurrentContext$1(request, value, thenable),
                pingTask$2(request, value));
            },
            function (reason) {
              if (!(settled || request.status > OPEN$2)) {
                settled = !0;
                var newTask = createTaskWithID(
                  request,
                  id,
                  thenable,
                  keyPath,
                  implicitSlot,
                  formatContext,
                  request.abortableTasks,
                  lastTimestamp,
                  debugOwner,
                  debugStack,
                  debugTask
                );
                newTask.timed = !0;
                erroredTask$2(request, newTask, reason);
                enqueueFlush$1(request);
              }
            }
          );
          return id;
        default:
          var _newTask2 = createThenableTask(request, task, thenable);
          if (request.status === ABORTING$2)
            return (
              request.abortableTasks.delete(_newTask2),
              request.type === PRERENDER$1
                ? (haltTask$1(_newTask2),
                  finishHaltedTask$1(_newTask2, request))
                : ((task = request.fatalError),
                  abortTask$2(_newTask2),
                  finishAbortedTask$1(_newTask2, request, task)),
              _newTask2.id
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
              forwardDebugInfoFromCurrentContext$1(
                request,
                _newTask2,
                thenable
              );
              _newTask2.model = value;
              pingTask$2(request, _newTask2);
            },
            function (reason) {
              _newTask2.status === PENDING$3 &&
                ((_newTask2.timed = !0),
                erroredTask$2(request, _newTask2, reason),
                enqueueFlush$1(request));
            }
          );
          return _newTask2.id;
      }
    }
    function serializeReadableStream$1(request, task, stream) {
      function progress(entry) {
        if (streamTask.status === PENDING$3)
          if (entry.done)
            (streamTask.status = COMPLETED$2),
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
            } catch (x$8) {
              error(x$8);
            }
      }
      function error(reason) {
        streamTask.status === PENDING$3 &&
          (request.cacheController.signal.removeEventListener(
            "abort",
            abortStream
          ),
          erroredTask$2(request, streamTask, reason),
          enqueueFlush$1(request),
          reader.cancel(reason).then(error, error));
      }
      function abortStream() {
        if (streamTask.status === PENDING$3) {
          var signal = request.cacheController.signal;
          signal.removeEventListener("abort", abortStream);
          signal = signal.reason;
          request.type === PRERENDER$1
            ? (request.abortableTasks.delete(streamTask),
              haltTask$1(streamTask),
              finishHaltedTask$1(streamTask, request))
            : (erroredTask$2(request, streamTask, signal),
              enqueueFlush$1(request));
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
          request.abortableTasks,
          task.time,
          task.debugOwner,
          task.debugStack,
          task.debugTask
        );
      request.pendingChunks++;
      task =
        streamTask.id.toString(16) + ":" + (isByteStream ? "r" : "R") + "\n";
      request.completedRegularChunks.push(task);
      request.cacheController.signal.addEventListener("abort", abortStream);
      reader.read().then(progress, error);
      return serializeByValueID$1(streamTask.id);
    }
    function serializeAsyncIterable$1(request, task, iterable, iterator) {
      function progress(entry) {
        if (streamTask.status === PENDING$3)
          if (entry.done) {
            streamTask.status = COMPLETED$2;
            if (void 0 === entry.value)
              var endStreamRow = streamTask.id.toString(16) + ":C\n";
            else
              try {
                var chunkId = outlineModel$2(request, entry.value);
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
                callIteratorInDEV(iterator, progress, error);
            } catch (x$9) {
              error(x$9);
            }
      }
      function error(reason) {
        streamTask.status === PENDING$3 &&
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
        if (streamTask.status === PENDING$3) {
          var signal = request.cacheController.signal;
          signal.removeEventListener("abort", abortIterable);
          var reason = signal.reason;
          request.type === PRERENDER$1
            ? (request.abortableTasks.delete(streamTask),
              haltTask$1(streamTask),
              finishHaltedTask$1(streamTask, request))
            : (erroredTask$2(request, streamTask, signal.reason),
              enqueueFlush$1(request));
          "function" === typeof iterator.throw &&
            iterator.throw(reason).then(noop, noop);
        }
      }
      var isIterator = iterable === iterator,
        streamTask = createTask$2(
          request,
          task.model,
          task.keyPath,
          task.implicitSlot,
          task.formatContext,
          request.abortableTasks,
          task.time,
          task.debugOwner,
          task.debugStack,
          task.debugTask
        );
      (task = iterable._debugInfo) &&
        forwardDebugInfo$2(request, streamTask, task);
      request.pendingChunks++;
      isIterator =
        streamTask.id.toString(16) + ":" + (isIterator ? "x" : "X") + "\n";
      request.completedRegularChunks.push(isIterator);
      request.cacheController.signal.addEventListener("abort", abortIterable);
      callIteratorInDEV(iterator, progress, error);
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
          return (
            forwardDebugInfoFromThenable$1(request, task, wakeable, null, null),
            wakeable.value
          );
        case "rejected":
          forwardDebugInfoFromThenable$1(request, task, wakeable, null, null);
          break;
        default:
          "string" !== typeof wakeable.status &&
            ((wakeable.status = "pending"),
            wakeable.then(
              function (fulfilledValue) {
                forwardDebugInfoFromCurrentContext$1(request, task, wakeable);
                "pending" === wakeable.status &&
                  ((wakeable.status = "fulfilled"),
                  (wakeable.value = fulfilledValue));
              },
              function (error) {
                forwardDebugInfoFromCurrentContext$1(request, task, wakeable);
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
    function callWithDebugContextInDEV$2(request, task, callback, arg) {
      var componentDebugInfo = {
        name: "",
        env: task.environmentName,
        key: null,
        owner: task.debugOwner
      };
      componentDebugInfo.stack =
        null === task.debugStack
          ? null
          : filterStackTrace$2(request, parseStackTrace(task.debugStack, 1));
      componentDebugInfo.debugStack = task.debugStack;
      request = componentDebugInfo.debugTask = task.debugTask;
      currentOwner = componentDebugInfo;
      try {
        return request ? request.run(callback.bind(null, arg)) : callback(arg);
      } finally {
        currentOwner = null;
      }
    }
    function processServerComponentReturnValue(
      request,
      task,
      Component,
      result
    ) {
      if (
        "object" !== typeof result ||
        null === result ||
        isClientReference(result)
      )
        return result;
      if ("function" === typeof result.then)
        return (
          result.then(function (resolvedValue) {
            "object" === typeof resolvedValue &&
              null !== resolvedValue &&
              resolvedValue.$$typeof === REACT_ELEMENT_TYPE &&
              (resolvedValue._store.validated = 1);
          }, voidHandler),
          createLazyWrapperAroundWakeable$1(request, task, result)
        );
      result.$$typeof === REACT_ELEMENT_TYPE && (result._store.validated = 1);
      var iteratorFn = getIteratorFn(result);
      if (iteratorFn) {
        var $jscomp$compprop0 = {};
        $jscomp$compprop0 =
          (($jscomp$compprop0[Symbol.iterator] = function () {
            var iterator = iteratorFn.call(result);
            iterator !== result ||
              ("[object GeneratorFunction]" ===
                Object.prototype.toString.call(Component) &&
                "[object Generator]" ===
                  Object.prototype.toString.call(result)) ||
              callWithDebugContextInDEV$2(request, task, function () {
                console.error(
                  "Returning an Iterator from a Server Component is not supported since it cannot be looped over more than once. "
                );
              });
            return iterator;
          }),
          $jscomp$compprop0);
        $jscomp$compprop0._debugInfo = result._debugInfo;
        return $jscomp$compprop0;
      }
      return "function" !== typeof result[ASYNC_ITERATOR] ||
        ("function" === typeof ReadableStream &&
          result instanceof ReadableStream)
        ? result
        : (($jscomp$compprop0 = {}),
          ($jscomp$compprop0 =
            (($jscomp$compprop0[ASYNC_ITERATOR] = function () {
              var iterator = result[ASYNC_ITERATOR]();
              iterator !== result ||
                ("[object AsyncGeneratorFunction]" ===
                  Object.prototype.toString.call(Component) &&
                  "[object AsyncGenerator]" ===
                    Object.prototype.toString.call(result)) ||
                callWithDebugContextInDEV$2(request, task, function () {
                  console.error(
                    "Returning an AsyncIterator from a Server Component is not supported since it cannot be looped over more than once. "
                  );
                });
              return iterator;
            }),
            $jscomp$compprop0)),
          ($jscomp$compprop0._debugInfo = result._debugInfo),
          $jscomp$compprop0);
    }
    function renderFunctionComponent$1(
      request,
      task,
      key,
      Component,
      props,
      validated
    ) {
      var prevThenableState = task.thenableState;
      task.thenableState = null;
      if (canEmitDebugInfo$1)
        if (null !== prevThenableState)
          var componentDebugInfo = prevThenableState._componentDebugInfo;
        else {
          var componentDebugID = task.id;
          componentDebugInfo = Component.displayName || Component.name || "";
          var componentEnv = (0, request.environmentName)();
          request.pendingChunks++;
          componentDebugInfo = {
            name: componentDebugInfo,
            env: componentEnv,
            key: key,
            owner: task.debugOwner
          };
          componentDebugInfo.stack =
            null === task.debugStack
              ? null
              : filterStackTrace$2(
                  request,
                  parseStackTrace(task.debugStack, 1)
                );
          componentDebugInfo.props = props;
          componentDebugInfo.debugStack = task.debugStack;
          componentDebugInfo.debugTask = task.debugTask;
          outlineComponentInfo$1(request, componentDebugInfo);
          advanceTaskTime$1(request, task, performance.now());
          emitDebugChunk$1(request, componentDebugID, componentDebugInfo);
          task.environmentName = componentEnv;
          2 === validated &&
            warnForMissingKey$1(
              request,
              key,
              componentDebugInfo,
              task.debugTask
            );
        }
      else return outlineTask$1(request, task);
      thenableIndexCounter$1 = 0;
      thenableState$1 = prevThenableState;
      currentComponentDebugInfo$1 = componentDebugInfo;
      props = task.debugTask
        ? task.debugTask.run(
            componentStorage.run.bind(
              componentStorage,
              componentDebugInfo,
              callComponentInDEV,
              Component,
              props,
              componentDebugInfo
            )
          )
        : componentStorage.run(
            componentDebugInfo,
            callComponentInDEV,
            Component,
            props,
            componentDebugInfo
          );
      if (request.status === ABORTING$2)
        throw (
          ("object" !== typeof props ||
            null === props ||
            "function" !== typeof props.then ||
            isClientReference(props) ||
            props.then(voidHandler, voidHandler),
          null)
        );
      validated = thenableState$1;
      if (null !== validated)
        for (
          prevThenableState = validated._stacks || (validated._stacks = []),
            componentDebugID = 0;
          componentDebugID < validated.length;
          componentDebugID++
        )
          forwardDebugInfoFromThenable$1(
            request,
            task,
            validated[componentDebugID],
            componentDebugInfo,
            prevThenableState[componentDebugID]
          );
      props = processServerComponentReturnValue(
        request,
        task,
        Component,
        props
      );
      task.debugOwner = componentDebugInfo;
      task.debugStack = null;
      task.debugTask = null;
      Component = task.keyPath;
      componentDebugInfo = task.implicitSlot;
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
      task.implicitSlot = componentDebugInfo;
      return request;
    }
    function warnForMissingKey$1(request, key, componentDebugInfo, debugTask) {
      function logKeyError() {
        console.error(
          'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
          "",
          ""
        );
      }
      key = request.didWarnForKey;
      null == key && (key = request.didWarnForKey = new WeakSet());
      request = componentDebugInfo.owner;
      if (null != request) {
        if (key.has(request)) return;
        key.add(request);
      }
      debugTask
        ? debugTask.run(
            componentStorage.run.bind(
              componentStorage,
              componentDebugInfo,
              callComponentInDEV,
              logKeyError,
              null,
              componentDebugInfo
            )
          )
        : componentStorage.run(
            componentDebugInfo,
            callComponentInDEV,
            logKeyError,
            null,
            componentDebugInfo
          );
    }
    function renderFragment$1(request, task, children) {
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
            null,
            null,
            0
          ]),
          task.implicitSlot ? [request] : request
        );
      if ((i = children._debugInfo)) {
        if (canEmitDebugInfo$1) forwardDebugInfo$2(request, task, i);
        else return outlineTask$1(request, task);
        children = Array.from(children);
      }
      return children;
    }
    function renderAsyncFragment$1(request, task, children, getAsyncIterator) {
      if (null !== task.keyPath)
        return (
          (request = [
            REACT_ELEMENT_TYPE,
            REACT_FRAGMENT_TYPE,
            task.keyPath,
            { children: children },
            null,
            null,
            0
          ]),
          task.implicitSlot ? [request] : request
        );
      getAsyncIterator = getAsyncIterator.call(children);
      return serializeAsyncIterable$1(
        request,
        task,
        children,
        getAsyncIterator
      );
    }
    function deferTask$2(request, task) {
      task = createTask$2(
        request,
        task.model,
        task.keyPath,
        task.implicitSlot,
        task.formatContext,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
      pingTask$2(request, task);
      return serializeLazyID$1(task.id);
    }
    function outlineTask$1(request, task) {
      task = createTask$2(
        request,
        task.model,
        task.keyPath,
        task.implicitSlot,
        task.formatContext,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
      retryTask$2(request, task);
      return task.status === COMPLETED$2
        ? serializeByValueID$1(task.id)
        : serializeLazyID$1(task.id);
    }
    function renderElement$1(request, task, type, key, ref, props, validated) {
      if (null !== ref && void 0 !== ref)
        throw Error(
          "Refs cannot be used in Server Components, nor passed to Client Components."
        );
      jsxPropsParents.set(props, type);
      "object" === typeof props.children &&
        null !== props.children &&
        jsxChildrenParents.set(props.children, type);
      if (
        "function" !== typeof type ||
        isClientReference(type) ||
        type.$$typeof === TEMPORARY_REFERENCE_TAG
      ) {
        if (type === REACT_FRAGMENT_TYPE && null === key)
          return (
            2 === validated &&
              ((validated = {
                name: "Fragment",
                env: (0, request.environmentName)(),
                key: key,
                owner: task.debugOwner,
                stack:
                  null === task.debugStack
                    ? null
                    : filterStackTrace$2(
                        request,
                        parseStackTrace(task.debugStack, 1)
                      ),
                props: props,
                debugStack: task.debugStack,
                debugTask: task.debugTask
              }),
              warnForMissingKey$1(request, key, validated, task.debugTask)),
            (validated = task.implicitSlot),
            null === task.keyPath && (task.implicitSlot = !0),
            (request = renderModelDestructive$2(
              request,
              task,
              emptyRoot$1,
              "",
              props.children
            )),
            (task.implicitSlot = validated),
            request
          );
        if (
          null != type &&
          "object" === typeof type &&
          !isClientReference(type)
        )
          switch (type.$$typeof) {
            case REACT_LAZY_TYPE:
              type = callLazyInitInDEV(type);
              if (request.status === ABORTING$2) throw null;
              return renderElement$1(
                request,
                task,
                type,
                key,
                ref,
                props,
                validated
              );
            case REACT_FORWARD_REF_TYPE:
              return renderFunctionComponent$1(
                request,
                task,
                key,
                type.render,
                props,
                validated
              );
            case REACT_MEMO_TYPE:
              return renderElement$1(
                request,
                task,
                type.type,
                key,
                ref,
                props,
                validated
              );
            case REACT_ELEMENT_TYPE:
              type._store.validated = 1;
          }
        else if ("string" === typeof type) {
          ref = task.formatContext;
          var newFormatContext = getChildFormatContext$1(ref, type, props);
          ref !== newFormatContext &&
            null != props.children &&
            outlineModelWithFormatContext$1(
              request,
              props.children,
              newFormatContext
            );
        }
      } else
        return renderFunctionComponent$1(
          request,
          task,
          key,
          type,
          props,
          validated
        );
      ref = task.keyPath;
      null === key
        ? (key = ref)
        : null !== ref &&
          (key =
            ref === REACT_OPTIMISTIC_KEY || key === REACT_OPTIMISTIC_KEY
              ? REACT_OPTIMISTIC_KEY
              : ref + "," + key);
      newFormatContext = null;
      ref = task.debugOwner;
      null !== ref && outlineComponentInfo$1(request, ref);
      if (null !== task.debugStack) {
        newFormatContext = filterStackTrace$2(
          request,
          parseStackTrace(task.debugStack, 1)
        );
        var id = outlineDebugModel$1(
          request,
          { objectLimit: 2 * newFormatContext.length + 1 },
          newFormatContext
        );
        request.writtenObjects.set(newFormatContext, serializeByValueID$1(id));
      }
      request = [
        REACT_ELEMENT_TYPE,
        type,
        key,
        props,
        ref,
        newFormatContext,
        validated
      ];
      task = task.implicitSlot && null !== key ? [request] : request;
      return task;
    }
    function visitAsyncNode$1(
      request,
      task$jscomp$0,
      node$jscomp$0,
      visited,
      cutOff
    ) {
      for (
        var chain = [];
        null !== node$jscomp$0 && !visited.has(node$jscomp$0);

      )
        chain.push(node$jscomp$0), (node$jscomp$0 = node$jscomp$0.previous);
      var previousIONode =
        null !== node$jscomp$0 ? visited.get(node$jscomp$0) : null;
      for (
        node$jscomp$0 = chain.length - 1;
        0 <= node$jscomp$0;
        node$jscomp$0--
      ) {
        var n = chain[node$jscomp$0];
        visited.set(n, null);
        var result = request;
        var task = task$jscomp$0,
          node = n,
          visited$jscomp$0 = visited,
          cutOff$jscomp$0 = cutOff;
        if (0 <= node.end && node.end <= result.timeOrigin) result = null;
        else
          switch (node.tag) {
            case 0:
              result = node;
              break;
            case 3:
              result = previousIONode;
              break;
            case 1:
              var awaited = node.awaited,
                promise = node.promise.deref();
              if (null !== awaited)
                if (
                  ((cutOff$jscomp$0 = visitAsyncNode$1(
                    result,
                    task,
                    awaited,
                    visited$jscomp$0,
                    cutOff$jscomp$0
                  )),
                  void 0 === cutOff$jscomp$0)
                ) {
                  result = void 0;
                  break;
                } else
                  null !== cutOff$jscomp$0
                    ? (previousIONode =
                        1 === cutOff$jscomp$0.tag
                          ? cutOff$jscomp$0
                          : (null !== node.stack &&
                                hasUnfilteredFrame$1(result, node.stack)) ||
                              (void 0 !== promise &&
                                "string" === typeof promise.displayName &&
                                (null === cutOff$jscomp$0.stack ||
                                  !hasUnfilteredFrame$1(
                                    result,
                                    cutOff$jscomp$0.stack
                                  )))
                            ? node
                            : cutOff$jscomp$0)
                    : result.status === ABORTING$2 &&
                      node.start < result.abortTime &&
                      node.end > result.abortTime &&
                      ((null !== node.stack &&
                        hasUnfilteredFrame$1(result, node.stack)) ||
                        (void 0 !== promise &&
                          "string" === typeof promise.displayName)) &&
                      (previousIONode = node);
              void 0 !== promise &&
                ((node = promise._debugInfo),
                null == node ||
                  visited$jscomp$0.has(node) ||
                  (visited$jscomp$0.set(node, null),
                  forwardDebugInfo$2(result, task, node)));
              result = previousIONode;
              break;
            case 4:
              result = previousIONode;
              break;
            case 2:
              awaited = node.awaited;
              if (null !== awaited)
                if (
                  ((promise = visitAsyncNode$1(
                    result,
                    task,
                    awaited,
                    visited$jscomp$0,
                    cutOff$jscomp$0
                  )),
                  void 0 === promise)
                ) {
                  result = void 0;
                  break;
                } else if (null !== promise) {
                  var startTime = node.start,
                    endTime = node.end;
                  startTime < cutOff$jscomp$0
                    ? ((previousIONode = promise),
                      null !== node.stack &&
                        isAwaitInUserspace$1(result, node.stack) &&
                        void 0 !==
                          (null === awaited.promise
                            ? void 0
                            : awaited.promise.deref()) &&
                        serializeIONode$1(result, promise, awaited.promise))
                    : null !== node.stack &&
                        isAwaitInUserspace$1(result, node.stack)
                      ? (result.status === ABORTING$2 &&
                          startTime > result.abortTime) ||
                        (serializeIONode$1(result, promise, awaited.promise),
                        visited$jscomp$0.set(promise, null),
                        null != node.owner &&
                          outlineComponentInfo$1(result, node.owner),
                        (cutOff$jscomp$0 = (0, result.environmentName)()),
                        advanceTaskTime$1(result, task, startTime),
                        result.pendingChunks++,
                        emitDebugChunk$1(result, task.id, {
                          awaited: promise,
                          env: cutOff$jscomp$0,
                          owner: node.owner,
                          stack:
                            null === node.stack
                              ? null
                              : filterStackTrace$2(result, node.stack)
                        }),
                        markOperationEndTime$2(result, task, endTime),
                        result.status === ABORTING$2 &&
                          (previousIONode = void 0))
                      : (previousIONode = promise);
                }
              node = node.promise.deref();
              void 0 !== node &&
                ((node = node._debugInfo),
                null == node ||
                  visited$jscomp$0.has(node) ||
                  (visited$jscomp$0.set(node, null),
                  forwardDebugInfo$2(result, task, node)));
              result = previousIONode;
              break;
            default:
              throw Error("Unknown AsyncSequence tag. This is a bug in React.");
          }
        null !== result && visited.set(n, result);
        if (void 0 === result) return;
        previousIONode = result;
      }
      return previousIONode;
    }
    function emitAsyncSequence$1(
      request,
      task,
      node,
      alreadyForwardedDebugInfo,
      owner,
      stack
    ) {
      var visited = new Map();
      alreadyForwardedDebugInfo && visited.set(alreadyForwardedDebugInfo, null);
      node = visitAsyncNode$1(request, task, node, visited, task.time);
      void 0 !== node &&
        null !== node &&
        (serializeIONode$1(request, node, node.promise),
        request.pendingChunks++,
        (alreadyForwardedDebugInfo = (0, request.environmentName)()),
        (alreadyForwardedDebugInfo = {
          awaited: node,
          env: alreadyForwardedDebugInfo
        }),
        null === owner && null === stack
          ? (null !== task.debugOwner &&
              (alreadyForwardedDebugInfo.owner = task.debugOwner),
            null !== task.debugStack &&
              (alreadyForwardedDebugInfo.stack = filterStackTrace$2(
                request,
                parseStackTrace(task.debugStack, 1)
              )))
          : (null != owner && (alreadyForwardedDebugInfo.owner = owner),
            null != stack &&
              (alreadyForwardedDebugInfo.stack = filterStackTrace$2(
                request,
                parseStackTrace(stack, 1)
              ))),
        advanceTaskTime$1(request, task, task.time),
        emitDebugChunk$1(request, task.id, alreadyForwardedDebugInfo),
        markOperationEndTime$2(request, task, node.end));
    }
    function pingTask$2(request, task) {
      task.timed = !0;
      var pingedTasks = request.pingedTasks;
      pingedTasks.push(task);
      1 === pingedTasks.length &&
        ((request.flushScheduled = null !== request.destination),
        request.type === PRERENDER$1 || request.status === OPENING$2
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
      abortSet,
      lastTimestamp,
      debugOwner,
      debugStack,
      debugTask
    ) {
      return createTaskWithID(
        request,
        request.nextChunkId++,
        model,
        keyPath,
        implicitSlot,
        formatContext,
        abortSet,
        lastTimestamp,
        debugOwner,
        debugStack,
        debugTask
      );
    }
    function createTaskWithID(
      request,
      id,
      model,
      keyPath,
      implicitSlot,
      formatContext,
      abortSet,
      lastTimestamp,
      debugOwner,
      debugStack,
      debugTask
    ) {
      request.pendingChunks++;
      "object" !== typeof model ||
        null === model ||
        null !== keyPath ||
        implicitSlot ||
        request.writtenObjects.set(model, serializeByValueID$1(id));
      var task = {
        id: id,
        status: PENDING$3,
        model: model,
        keyPath: keyPath,
        implicitSlot: implicitSlot,
        formatContext: formatContext,
        ping: function () {
          return pingTask$2(request, task);
        },
        thenableState: null,
        timed: !1
      };
      task.time = lastTimestamp;
      task.environmentName = request.environmentName();
      task.debugOwner = debugOwner;
      task.debugStack = debugStack;
      task.debugTask = debugTask;
      abortSet.add(task);
      return task;
    }
    function resolveModel$2(request, task, parent, parentPropertyName, value) {
      var jsonValue = value;
      null === value ||
        "object" !== typeof value ||
        isServerReference(value) ||
        "function" !== typeof value.toJSON ||
        (jsonValue = value.toJSON(parentPropertyName));
      var originalValue = parent[parentPropertyName];
      "object" !== typeof originalValue ||
        originalValue === jsonValue ||
        originalValue instanceof Date ||
        callWithDebugContextInDEV$2(request, task, function () {
          ArrayBuffer.isView(originalValue)
            ? console.error(
                "Binary data with a toJSON method, such as a Node.js Buffer, is serialized through toJSON instead of as binary. Pass a Uint8Array or ArrayBuffer to send binary data.%s",
                describeObjectForErrorMessage(parent, parentPropertyName)
              )
            : "Object" !== objectName(originalValue)
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
      value = renderModel$2(
        request,
        task,
        parent,
        parentPropertyName,
        jsonValue
      );
      if (null === value || "object" !== typeof value) return value;
      if (isArrayImpl(value)) {
        var _resolved = [];
        for (jsonValue = 0; jsonValue < value.length; jsonValue++)
          _resolved[jsonValue] = resolveModel$2(
            request,
            task,
            value,
            "" + jsonValue,
            value[jsonValue]
          );
        return _resolved;
      }
      jsonValue = {};
      for (_resolved in value)
        if (hasOwnProperty.call(value, _resolved)) {
          var resolvedValue = resolveModel$2(
            request,
            task,
            value,
            _resolved,
            value[_resolved]
          );
          _resolved === __PROTO__$1
            ? Object.defineProperty(jsonValue, _resolved, {
                value: resolvedValue,
                enumerable: !0,
                writable: !0,
                configurable: !0
              })
            : (jsonValue[_resolved] = resolvedValue);
        }
      return jsonValue;
    }
    function serializeByValueID$1(id) {
      return "$" + id.toString(16);
    }
    function serializeLazyID$1(id) {
      return "$L" + id.toString(16);
    }
    function serializeDeferredObject$1(request, value) {
      var deferredDebugObjects = request.deferredDebugObjects;
      return null !== deferredDebugObjects
        ? (request.pendingDebugChunks++,
          (request = request.nextChunkId++),
          deferredDebugObjects.existing.set(value, request),
          deferredDebugObjects.retained.set(request, value),
          "$Y" + request.toString(16))
        : "$Y";
    }
    function serializeNumber$1(number) {
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
      var clientReferenceKey = getClientReferenceKey(clientReference),
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
          ),
          json = stringifyImportMetadata$1(
            request,
            clientReferenceMetadata,
            !1
          );
        request.pendingChunks++;
        var importId = request.nextChunkId++;
        emitImportChunk$1(request, importId, json, !1);
        writtenClientReferences.set(clientReferenceKey, importId);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID$1(importId)
          : serializeByValueID$1(importId);
      } catch (x) {
        return (
          request.pendingChunks++,
          (parent = request.nextChunkId++),
          (parentPropertyName = logRecoverableError$2(request, x, null)),
          emitErrorChunk$1(request, parent, parentPropertyName, x, !1, null),
          serializeByValueID$1(parent)
        );
      }
    }
    function serializeDebugClientReference$1(
      request,
      parent,
      parentPropertyName,
      clientReference
    ) {
      var clientReferenceKey = getClientReferenceKey(clientReference);
      clientReferenceKey =
        request.writtenClientReferences.get(clientReferenceKey);
      if (void 0 !== clientReferenceKey)
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID$1(clientReferenceKey)
          : serializeByValueID$1(clientReferenceKey);
      try {
        var clientReferenceMetadata = resolveClientReferenceMetadata(
            request.bundlerConfig,
            clientReference
          ),
          json = stringifyImportMetadata$1(
            request,
            clientReferenceMetadata,
            !0
          );
        request.pendingDebugChunks++;
        var importId = request.nextChunkId++;
        emitImportChunk$1(request, importId, json, !0);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID$1(importId)
          : serializeByValueID$1(importId);
      } catch (x) {
        return (
          request.pendingDebugChunks++,
          (parent = request.nextChunkId++),
          (parentPropertyName = logRecoverableError$2(request, x, null)),
          emitErrorChunk$1(request, parent, parentPropertyName, x, !0, null),
          serializeByValueID$1(parent)
        );
      }
    }
    function outlineModel$2(request, value) {
      return outlineModelWithFormatContext$1(request, value, 0);
    }
    function outlineModelWithFormatContext$1(request, value, formatContext) {
      value = createTask$2(
        request,
        value,
        null,
        !1,
        formatContext,
        request.abortableTasks,
        performance.now(),
        null,
        null,
        null
      );
      retryTask$2(request, value);
      return value.id;
    }
    function serializeServerReference$1(request, serverReference) {
      var isObjectReference = "object" === typeof serverReference,
        writtenServerReferences = request.writtenServerReferences,
        existingId = writtenServerReferences.get(serverReference);
      if (void 0 !== existingId)
        return isObjectReference
          ? "$H" + existingId.toString(16)
          : "$h" + existingId.toString(16);
      existingId = serverReference.$$id;
      if (isObjectReference) existingId = { id: existingId };
      else {
        var boundArgs = serverReference.$$bound;
        boundArgs = null === boundArgs ? null : Promise.resolve(boundArgs);
        var location = null,
          error = serverReference.$$location;
        error &&
          ((error = parseStackTrace(error, 1)),
          0 < error.length &&
            ((location = error[0]),
            (location = [location[0], location[1], location[2], location[3]])));
        existingId =
          null !== location
            ? {
                id: existingId,
                bound: boundArgs,
                name:
                  "function" === typeof serverReference
                    ? serverReference.name
                    : "",
                env: (0, request.environmentName)(),
                location: location
              }
            : { id: existingId, bound: boundArgs };
      }
      request = outlineModel$2(request, existingId);
      writtenServerReferences.set(serverReference, request);
      return isObjectReference
        ? "$H" + request.toString(16)
        : "$h" + request.toString(16);
    }
    function serializeLargeTextString$1(request, text) {
      request.pendingChunks++;
      var textId = request.nextChunkId++;
      emitTextChunk$1(request, textId, text, !1);
      return serializeByValueID$1(textId);
    }
    function serializeMap$1(request, map) {
      map = Array.from(map);
      return "$Q" + outlineModel$2(request, map).toString(16);
    }
    function serializeFormData$1(request, formData) {
      formData = Array.from(formData.entries());
      return "$K" + outlineModel$2(request, formData).toString(16);
    }
    function serializeSet$1(request, set) {
      set = Array.from(set);
      return "$W" + outlineModel$2(request, set).toString(16);
    }
    function serializeTypedArray$1(request, tag, typedArray) {
      request.pendingChunks++;
      var bufferId = request.nextChunkId++;
      emitTypedArrayChunk$1(request, bufferId, tag, typedArray, !1);
      return serializeByValueID$1(bufferId);
    }
    function serializeDebugTypedArray$1(request, tag, typedArray) {
      if (1e3 < typedArray.byteLength && !doNotLimit$1.has(typedArray))
        return serializeDeferredObject$1(request, typedArray);
      request.pendingDebugChunks++;
      var bufferId = request.nextChunkId++;
      emitTypedArrayChunk$1(request, bufferId, tag, typedArray, !0);
      return serializeByValueID$1(bufferId);
    }
    function serializeDebugBlob$1(request, blob) {
      function progress(entry) {
        if (entry.done)
          emitOutlinedDebugModelChunk$1(
            request,
            id,
            { objectLimit: model.length + 2 },
            model
          ),
            enqueueFlush$1(request);
        else
          return (
            model.push(entry.value), reader.read().then(progress).catch(error)
          );
      }
      function error(reason) {
        emitErrorChunk$1(request, id, "", reason, !0, null);
        enqueueFlush$1(request);
        reader.cancel(reason).then(noop, noop);
      }
      var model = [blob.type],
        reader = blob.stream().getReader();
      request.pendingDebugChunks++;
      var id = request.nextChunkId++;
      reader.read().then(progress).catch(error);
      return "$B" + id.toString(16);
    }
    function serializeBlob$1(request, blob) {
      function progress(entry) {
        if (newTask.status === PENDING$3)
          if (entry.done)
            request.cacheController.signal.removeEventListener(
              "abort",
              abortBlob
            ),
              pingTask$2(request, newTask);
          else
            return (
              model.push(entry.value), reader.read().then(progress).catch(error)
            );
      }
      function error(reason) {
        newTask.status === PENDING$3 &&
          (request.cacheController.signal.removeEventListener(
            "abort",
            abortBlob
          ),
          erroredTask$2(request, newTask, reason),
          enqueueFlush$1(request),
          reader.cancel(reason).then(error, error));
      }
      function abortBlob() {
        if (newTask.status === PENDING$3) {
          var signal = request.cacheController.signal;
          signal.removeEventListener("abort", abortBlob);
          signal = signal.reason;
          request.type === PRERENDER$1
            ? (request.abortableTasks.delete(newTask),
              haltTask$1(newTask),
              finishHaltedTask$1(newTask, request))
            : (erroredTask$2(request, newTask, signal),
              enqueueFlush$1(request));
          reader.cancel(signal).then(error, error);
        }
      }
      var model = [blob.type],
        newTask = createTask$2(
          request,
          model,
          null,
          !1,
          0,
          request.abortableTasks,
          performance.now(),
          null,
          null,
          null
        ),
        reader = blob.stream().getReader();
      request.cacheController.signal.addEventListener("abort", abortBlob);
      reader.read().then(progress).catch(error);
      return "$B" + newTask.id.toString(16);
    }
    function escapeStringValue$1(value) {
      return "$" === value[0] ? "$" + value : value;
    }
    function serializeImportString$1(request, value) {
      if (value.length < MIN_DEDUPLICATED_IMPORT_STRING_LENGTH$1)
        return escapeStringValue$1(value);
      var writtenStrings = request.writtenImportStrings,
        existing = writtenStrings.get(value);
      if (void 0 !== existing) return existing;
      existing = request.writtenImportStringsSize + value.length;
      if (existing > MAX_DEDUPLICATED_IMPORT_STRINGS_SIZE$1)
        return escapeStringValue$1(value);
      request.writtenImportStringsSize = existing;
      request.pendingChunks++;
      existing = request.nextChunkId++;
      var json = stringify$1(escapeStringValue$1(value));
      request.completedImportChunks.push(
        existing.toString(16) + ":" + json + "\n"
      );
      request = serializeByValueID$1(existing);
      writtenStrings.set(value, request);
      return request;
    }
    function renderModel$2(request, task, parent, key, value) {
      serializedSize$1 += key.length;
      var prevKeyPath = task.keyPath,
        prevImplicitSlot = task.implicitSlot;
      try {
        return renderModelDestructive$2(request, task, parent, key, value);
      } catch (thrownValue) {
        parent = task.model;
        parent =
          "object" === typeof parent &&
          null !== parent &&
          (parent.$$typeof === REACT_ELEMENT_TYPE ||
            parent.$$typeof === REACT_LAZY_TYPE);
        if (request.status === ABORTING$2) {
          task.status = ABORTED$2;
          if (request.type === PRERENDER$1)
            return (
              (task = request.nextChunkId++),
              (task = parent
                ? serializeLazyID$1(task)
                : serializeByValueID$1(task)),
              task
            );
          task = request.fatalError;
          return parent ? serializeLazyID$1(task) : serializeByValueID$1(task);
        }
        key =
          thrownValue === SuspenseException
            ? getSuspendedThenable()
            : thrownValue;
        if (
          "object" === typeof key &&
          null !== key &&
          "function" === typeof key.then
        )
          return (
            (request = createTask$2(
              request,
              task.model,
              task.keyPath,
              task.implicitSlot,
              task.formatContext,
              request.abortableTasks,
              task.time,
              task.debugOwner,
              task.debugStack,
              task.debugTask
            )),
            (value = request.ping),
            key.then(value, value),
            (request.thenableState = getThenableStateAfterSuspending$1()),
            (task.keyPath = prevKeyPath),
            (task.implicitSlot = prevImplicitSlot),
            parent
              ? serializeLazyID$1(request.id)
              : serializeByValueID$1(request.id)
          );
        task.keyPath = prevKeyPath;
        task.implicitSlot = prevImplicitSlot;
        request.pendingChunks++;
        prevKeyPath = request.nextChunkId++;
        prevImplicitSlot = logRecoverableError$2(request, key, task);
        emitErrorChunk$1(
          request,
          prevKeyPath,
          prevImplicitSlot,
          key,
          !1,
          task.debugOwner
        );
        return parent
          ? serializeLazyID$1(prevKeyPath)
          : serializeByValueID$1(prevKeyPath);
      }
    }
    function renderModelDestructive$2(
      request,
      task,
      parent,
      parentPropertyName,
      value
    ) {
      task.model = value;
      parentPropertyName === __PROTO__$1 &&
        callWithDebugContextInDEV$2(request, task, function () {
          console.error(
            "Expected not to serialize an object with own property `__proto__`. When parsed this property will be omitted.%s",
            describeObjectForErrorMessage(parent, parentPropertyName)
          );
        });
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
                if (modelRoot$2 === value) modelRoot$2 = null;
                else return _existingReference;
              else
                -1 === parentPropertyName.indexOf(":") &&
                  ((_existingReference = _writtenObjects.get(parent)),
                  void 0 !== _existingReference &&
                    ((elementReference =
                      _existingReference + ":" + parentPropertyName),
                    _writtenObjects.set(value, elementReference)));
            }
            if (serializedSize$1 > MAX_ROW_SIZE$1)
              return deferTask$2(request, task);
            if ((_existingReference = value._debugInfo))
              if (canEmitDebugInfo$1)
                forwardDebugInfo$2(request, task, _existingReference);
              else return outlineTask$1(request, task);
            _existingReference = value.props;
            var refProp = _existingReference.ref;
            refProp = void 0 !== refProp ? refProp : null;
            task.debugOwner = value._owner;
            task.debugStack = value._debugStack;
            task.debugTask = value._debugTask;
            if (
              void 0 === value._owner ||
              void 0 === value._debugStack ||
              void 0 === value._debugTask
            ) {
              var key = "";
              null !== value.key &&
                value.key !== REACT_OPTIMISTIC_KEY &&
                (key = ' key="' + value.key + '"');
              console.error(
                "Attempted to render <%s%s> without development properties. This is not supported. It can happen if:\n- The element is created with a production version of React but rendered in development.\n- The element was cloned with a custom function instead of `React.cloneElement`.\nThe props of this element may help locate this element: %o",
                value.type,
                key,
                value.props
              );
            }
            request = renderElement$1(
              request,
              task,
              value.type,
              value.key,
              refProp,
              _existingReference,
              value._store.validated
            );
            "object" === typeof request &&
              null !== request &&
              null !== elementReference &&
              (_writtenObjects.has(request) ||
                _writtenObjects.set(request, elementReference));
            return request;
          case REACT_LAZY_TYPE:
            if (serializedSize$1 > MAX_ROW_SIZE$1)
              return deferTask$2(request, task);
            task.thenableState = null;
            elementReference = callLazyInitInDEV(value);
            if (request.status === ABORTING$2) throw null;
            if ((_writtenObjects = value._debugInfo))
              if (canEmitDebugInfo$1)
                forwardDebugInfo$2(request, task, _writtenObjects);
              else return outlineTask$1(request, task);
            return renderModelDestructive$2(
              request,
              task,
              parent,
              parentPropertyName,
              elementReference
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
        if (isServerReference(value))
          return serializeServerReference$1(request, value);
        if (
          void 0 !== request.temporaryReferences &&
          ((elementReference = request.temporaryReferences.get(value)),
          void 0 !== elementReference)
        )
          return "$T" + elementReference;
        elementReference = TaintRegistryObjects$2.get(value);
        void 0 !== elementReference && throwTaintViolation$2(elementReference);
        elementReference = request.writtenObjects;
        _writtenObjects = elementReference.get(value);
        if ("function" === typeof value.then) {
          if (void 0 !== _writtenObjects) {
            if (null !== task.keyPath || task.implicitSlot)
              return (
                (request = serializeThenable$1(request, task, value)),
                "pending_weak" === value.status
                  ? "$w" + request.toString(16)
                  : "$@" + request.toString(16)
              );
            if (modelRoot$2 === value) modelRoot$2 = null;
            else return _writtenObjects;
          }
          request = serializeThenable$1(request, task, value);
          request =
            "pending_weak" === value.status
              ? "$w" + request.toString(16)
              : "$@" + request.toString(16);
          elementReference.set(value, request);
          return request;
        }
        if (void 0 !== _writtenObjects)
          if (modelRoot$2 === value) {
            if (_writtenObjects !== serializeByValueID$1(task.id))
              return _writtenObjects;
            modelRoot$2 = null;
          } else return _writtenObjects;
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
                break;
              case "4":
                _existingReference = "_owner";
            }
          elementReference.set(
            value,
            _writtenObjects + ":" + _existingReference
          );
        }
        if (isArrayImpl(value)) return renderFragment$1(request, task, value);
        if (value instanceof Map) return serializeMap$1(request, value);
        if (value instanceof Set) return serializeSet$1(request, value);
        if ("function" === typeof FormData && value instanceof FormData)
          return serializeFormData$1(request, value);
        if (value instanceof Error)
          return serializeErrorValue$1(request, value);
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
            (elementReference = elementReference.call(value)),
            elementReference === value
              ? "$i" +
                outlineModel$2(request, Array.from(elementReference)).toString(
                  16
                )
              : renderFragment$1(request, task, Array.from(elementReference))
          );
        if (
          "function" === typeof ReadableStream &&
          value instanceof ReadableStream
        )
          return serializeReadableStream$1(request, task, value);
        elementReference = value[ASYNC_ITERATOR];
        if ("function" === typeof elementReference)
          return renderAsyncFragment$1(request, task, value, elementReference);
        if (value instanceof Date) return "$D" + value.toJSON();
        elementReference = getPrototypeOf$2(value);
        if (
          elementReference !== ObjectPrototype$3 &&
          (null === elementReference ||
            null !== getPrototypeOf$2(elementReference))
        )
          throw Error(
            "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
              describeObjectForErrorMessage(parent, parentPropertyName)
          );
        if ("Object" !== objectName(value))
          callWithDebugContextInDEV$2(request, task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. %s objects are not supported.%s",
              objectName(value),
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
        else if (!isSimpleObject(value))
          callWithDebugContextInDEV$2(request, task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.%s",
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
        else if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(value);
          0 < symbols.length &&
            callWithDebugContextInDEV$2(request, task, function () {
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
        return (
          (task = TaintRegistryValues$2.get(value)),
          void 0 !== task && throwTaintViolation$2(task.message),
          (serializedSize$1 += value.length),
          "Z" === value[value.length - 1] &&
          parent[parentPropertyName] instanceof Date
            ? "$D" + value
            : 1024 <= value.length && null !== byteLengthOfChunk
              ? serializeLargeTextString$1(request, value)
              : escapeStringValue$1(value)
        );
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber$1(value);
      if ("undefined" === typeof value) return "$undefined";
      if ("function" === typeof value) {
        if (isClientReference(value))
          return serializeClientReference$1(
            request,
            parent,
            parentPropertyName,
            value
          );
        if (isServerReference(value))
          return serializeServerReference$1(request, value);
        if (
          void 0 !== request.temporaryReferences &&
          ((request = request.temporaryReferences.get(value)),
          void 0 !== request)
        )
          return "$T" + request;
        request = TaintRegistryObjects$2.get(value);
        void 0 !== request && throwTaintViolation$2(request);
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
          return serializeByValueID$1(elementReference);
        elementReference = value.description;
        if (Symbol.for(elementReference) !== value)
          throw Error(
            "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
              (value.description + ") cannot be found among global symbols.") +
              describeObjectForErrorMessage(parent, parentPropertyName)
          );
        request.pendingChunks++;
        _writtenObjects = request.nextChunkId++;
        emitSymbolChunk$1(request, _writtenObjects, elementReference);
        task.set(value, _writtenObjects);
        return serializeByValueID$1(_writtenObjects);
      }
      if ("bigint" === typeof value)
        return (
          (request = TaintRegistryValues$2.get(value)),
          void 0 !== request && throwTaintViolation$2(request.message),
          "$n" + value.toString(10)
        );
      throw Error(
        "Type " +
          typeof value +
          " is not supported in Client Component props." +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    }
    function logRecoverableError$2(request, error, task) {
      var prevRequest = currentRequest$2;
      currentRequest$2 = null;
      var prevCache = setCurrentCache(null);
      try {
        var onError = request.onError;
        var errorDigest =
          null !== task
            ? cacheStorage.run(void 0, function () {
                return requestStorage.run(
                  void 0,
                  callWithDebugContextInDEV$2,
                  request,
                  task,
                  onError,
                  error
                );
              })
            : cacheStorage.run(void 0, function () {
                return requestStorage.run(void 0, onError, error);
              });
      } finally {
        (currentRequest$2 = prevRequest), setCurrentCache(prevCache);
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
      cleanupTaintQueue$2(request);
      null !== request.destination
        ? ((request.status = CLOSED$2), request.destination.destroy(error))
        : ((request.status = CLOSING$1), (request.fatalError = error));
      request.cacheController.abort(
        Error("The render was aborted due to a fatal error.", { cause: error })
      );
    }
    function serializeErrorValue$1(request, error) {
      var name = "Error",
        env = (0, request.environmentName)();
      try {
        name = error.name;
        var message = String(error.message);
        var stack = filterStackTrace$2(request, parseStackTrace(error, 0));
        var errorEnv = error.environmentName;
        "string" === typeof errorEnv && (env = errorEnv);
      } catch (x) {
        (message =
          "An error occurred but serializing the error message failed."),
          (stack = []);
      }
      name = { name: name, message: message, stack: stack, env: env };
      "cause" in error &&
        ((message = outlineModel$2(request, error.cause)),
        (name.cause = serializeByValueID$1(message)));
      "undefined" !== typeof AggregateError &&
        error instanceof AggregateError &&
        ((error = outlineModel$2(request, error.errors)),
        (name.errors = serializeByValueID$1(error)));
      return "$Z" + outlineModel$2(request, name).toString(16);
    }
    function emitErrorChunk$1(request, id, digest, error, debug, owner) {
      var name = "Error",
        env = (0, request.environmentName)(),
        causeReference = null,
        errorsReference = null;
      try {
        if (error instanceof Error) {
          name = error.name;
          var message = String(error.message);
          var stack = filterStackTrace$2(request, parseStackTrace(error, 0));
          var errorEnv = error.environmentName;
          "string" === typeof errorEnv && (env = errorEnv);
          if ("cause" in error) {
            var cause = error.cause,
              causeId = debug
                ? outlineDebugModel$1(request, { objectLimit: 5 }, cause)
                : outlineModel$2(request, cause);
            causeReference = serializeByValueID$1(causeId);
          }
          if (
            "undefined" !== typeof AggregateError &&
            error instanceof AggregateError
          ) {
            var errors = error.errors,
              errorsId = debug
                ? outlineDebugModel$1(request, { objectLimit: 5 }, errors)
                : outlineModel$2(request, errors);
            errorsReference = serializeByValueID$1(errorsId);
          }
        } else
          (message =
            "object" === typeof error && null !== error
              ? describeObjectForErrorMessage(error)
              : String(error)),
            (stack = []);
      } catch (x) {
        (message =
          "An error occurred but serializing the error message failed."),
          (stack = []);
      }
      error = null == owner ? null : outlineComponentInfo$1(request, owner);
      digest = {
        digest: digest,
        name: name,
        message: message,
        stack: stack,
        env: env,
        owner: error
      };
      null !== causeReference && (digest.cause = causeReference);
      null !== errorsReference && (digest.errors = errorsReference);
      id = id.toString(16) + ":E" + stringify$1(digest) + "\n";
      debug
        ? request.completedDebugChunks.push(id)
        : request.completedErrorChunks.push(id);
    }
    function importMetadataReplacer$1(key, value) {
      return "string" === typeof value
        ? ((key = importStringRequest$1),
          null === key
            ? escapeStringValue$1(value)
            : serializeImportString$1(key, value))
        : value;
    }
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
          if (
            depth > MAX_IMPORT_METADATA_DEPTH$1 ||
            "function" === typeof value.toJSON
          )
            return NOT_PLAIN_IMPORT_METADATA$1;
          if (isArrayImpl(value)) {
            for (
              var length = value.length, _copy = Array(length), i = 0;
              i < length;
              i++
            ) {
              var element = value[i];
              if ("string" === typeof element)
                _copy[i] = serializeImportString$1(request, element);
              else {
                element = transformImportMetadata$1(
                  request,
                  element,
                  depth + 1
                );
                if (element === NOT_PLAIN_IMPORT_METADATA$1)
                  return NOT_PLAIN_IMPORT_METADATA$1;
                _copy[i] = element;
              }
            }
            return _copy;
          }
          length = getPrototypeOf$2(value);
          if (length !== ObjectPrototype$3 && null !== length)
            return NOT_PLAIN_IMPORT_METADATA$1;
          length = Object.keys(value);
          _copy = {};
          for (i = 0; i < length.length; i++) {
            element = length[i];
            if (element in ObjectPrototype$3)
              return NOT_PLAIN_IMPORT_METADATA$1;
            var _element = value[element];
            if ("string" === typeof _element)
              _copy[element] = serializeImportString$1(request, _element);
            else {
              _element = transformImportMetadata$1(
                request,
                _element,
                depth + 1
              );
              if (_element === NOT_PLAIN_IMPORT_METADATA$1)
                return NOT_PLAIN_IMPORT_METADATA$1;
              _copy[element] = _element;
            }
          }
          return _copy;
        default:
          return NOT_PLAIN_IMPORT_METADATA$1;
      }
    }
    function stringifyImportMetadata$1(
      request,
      clientReferenceMetadata,
      debug
    ) {
      if (!debug) {
        var copy = transformImportMetadata$1(
          request,
          clientReferenceMetadata,
          0
        );
        if (copy !== NOT_PLAIN_IMPORT_METADATA$1) return stringify$1(copy);
      }
      a: {
        copy = importStringRequest$1;
        importStringRequest$1 = debug ? null : request;
        try {
          var JSCompiler_inline_result = stringify$1(
            clientReferenceMetadata,
            importMetadataReplacer$1
          );
          break a;
        } finally {
          importStringRequest$1 = copy;
        }
        JSCompiler_inline_result = void 0;
      }
      return JSCompiler_inline_result;
    }
    function emitImportChunk$1(request, id, json, debug) {
      id = id.toString(16) + ":I" + json + "\n";
      debug
        ? request.completedDebugChunks.push(id)
        : request.completedImportChunks.push(id);
    }
    function emitSymbolChunk$1(request, id, name) {
      id = encodeReferenceChunk$1(request, id, "$S" + name);
      request.completedImportChunks.push(id);
    }
    function emitModelChunk$1(request, id, json) {
      id = id.toString(16) + ":" + json + "\n";
      request.completedRegularChunks.push(id);
    }
    function emitDebugHaltChunk$1(request, id) {
      id = id.toString(16) + ":\n";
      request.completedDebugChunks.push(id);
    }
    function emitDebugChunk$1(request, id, debugInfo) {
      var json = serializeDebugModel$1(request, 500, debugInfo);
      null !== request.debugDestination
        ? '"' === json[0] && "$" === json[1]
          ? ((id = id.toString(16) + ":D" + json + "\n"),
            request.completedRegularChunks.push(id))
          : ((debugInfo = request.nextChunkId++),
            (json = debugInfo.toString(16) + ":" + json + "\n"),
            request.pendingDebugChunks++,
            request.completedDebugChunks.push(json),
            (id = id.toString(16) + ':D"$' + debugInfo.toString(16) + '"\n'),
            request.completedRegularChunks.push(id))
        : ((id = id.toString(16) + ":D" + json + "\n"),
          request.completedRegularChunks.push(id));
    }
    function outlineComponentInfo$1(request, componentInfo) {
      var existingRef = request.writtenDebugObjects.get(componentInfo);
      if (void 0 !== existingRef) return existingRef;
      null != componentInfo.owner &&
        outlineComponentInfo$1(request, componentInfo.owner);
      existingRef = 10;
      null != componentInfo.stack &&
        (existingRef += componentInfo.stack.length);
      existingRef = { objectLimit: existingRef };
      var componentDebugInfo = {
        name: componentInfo.name,
        key: componentInfo.key
      };
      null != componentInfo.env && (componentDebugInfo.env = componentInfo.env);
      null != componentInfo.owner &&
        (componentDebugInfo.owner = componentInfo.owner);
      null == componentInfo.stack && null != componentInfo.debugStack
        ? (componentDebugInfo.stack = filterStackTrace$2(
            request,
            parseStackTrace(componentInfo.debugStack, 1)
          ))
        : null != componentInfo.stack &&
          (componentDebugInfo.stack = componentInfo.stack);
      componentDebugInfo.props = componentInfo.props;
      existingRef = outlineDebugModel$1(
        request,
        existingRef,
        componentDebugInfo
      );
      existingRef = serializeByValueID$1(existingRef);
      request.writtenDebugObjects.set(componentInfo, existingRef);
      request.writtenObjects.set(componentInfo, existingRef);
      return existingRef;
    }
    function emitIOInfoChunk$1(
      request,
      id,
      name,
      start,
      end,
      value,
      env,
      owner,
      stack
    ) {
      var objectLimit = 10;
      stack && (objectLimit += stack.length);
      name = {
        name: name,
        start: start - request.timeOrigin,
        end: end - request.timeOrigin
      };
      null != env && (name.env = env);
      null != stack && (name.stack = stack);
      null != owner && (name.owner = owner);
      void 0 !== value && (name.value = value);
      value = serializeDebugModel$1(request, objectLimit, name);
      id = id.toString(16) + ":J" + value + "\n";
      request.completedDebugChunks.push(id);
    }
    function serializeIONode$1(request, ioNode, promiseRef) {
      var existingRef = request.writtenDebugObjects.get(ioNode);
      if (void 0 !== existingRef) return existingRef;
      existingRef = null;
      var name = "";
      if (null !== ioNode.promise) {
        var promise = ioNode.promise.deref();
        void 0 !== promise &&
          "string" === typeof promise.displayName &&
          (name = promise.displayName);
      }
      if (null !== ioNode.stack) {
        a: {
          existingRef = ioNode.stack;
          for (promise = 0; promise < existingRef.length; promise++) {
            var callsite = existingRef[promise];
            if (!isPromiseCreationInternal$1(callsite[1], callsite[0])) {
              promise = 0 < promise ? existingRef.slice(promise) : existingRef;
              break a;
            }
          }
          promise = [];
        }
        existingRef = filterStackTrace$2(request, promise);
        if ("" === name) {
          a: {
            name = promise;
            promise = "";
            callsite = request.filterStackFrame;
            for (var i = 0; i < name.length; i++) {
              var callsite$jscomp$0 = name[i],
                functionName = callsite$jscomp$0[0],
                url = devirtualizeURL$2(callsite$jscomp$0[1]);
              if (
                callsite(
                  url,
                  functionName,
                  callsite$jscomp$0[2],
                  callsite$jscomp$0[3]
                ) &&
                "" !== url
              ) {
                if ("" === promise) {
                  name = functionName;
                  break a;
                }
                name = promise;
                break a;
              } else promise = functionName;
            }
            name = "";
          }
          name.startsWith("Window.")
            ? (name = name.slice(7))
            : name.startsWith("<anonymous>.") && (name = name.slice(7));
        }
      }
      promise = ioNode.owner;
      null != promise && outlineComponentInfo$1(request, promise);
      callsite = void 0;
      null !== promiseRef && (callsite = promiseRef.deref());
      promiseRef = (0, request.environmentName)();
      i = 3 === ioNode.tag ? request.abortTime : ioNode.end;
      request.pendingDebugChunks++;
      callsite$jscomp$0 = request.nextChunkId++;
      emitIOInfoChunk$1(
        request,
        callsite$jscomp$0,
        name,
        ioNode.start,
        i,
        callsite,
        promiseRef,
        promise,
        existingRef
      );
      promiseRef = serializeByValueID$1(callsite$jscomp$0);
      request.writtenDebugObjects.set(ioNode, promiseRef);
      return promiseRef;
    }
    function emitTypedArrayChunk$1(request, id, tag, typedArray, debug) {
      if (TaintRegistryByteLengths$2.has(typedArray.byteLength)) {
        var tainted = TaintRegistryValues$2.get(
          binaryToComparableString(typedArray)
        );
        void 0 !== tainted && throwTaintViolation$2(tainted.message);
      }
      debug ? request.pendingDebugChunks++ : request.pendingChunks++;
      typedArray = new Uint8Array(
        typedArray.buffer,
        typedArray.byteOffset,
        typedArray.byteLength
      );
      tainted = typedArray.byteLength;
      id = id.toString(16) + ":" + tag + tainted.toString(16) + ",";
      debug
        ? request.completedDebugChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC$1,
            id,
            typedArray
          )
        : request.completedRegularChunks.push(
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
      var binaryLength = byteLengthOfChunk(text);
      id = id.toString(16) + ":T" + binaryLength.toString(16) + ",";
      debug
        ? request.completedDebugChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC$1,
            id,
            text
          )
        : request.completedRegularChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC$1,
            id,
            text
          );
    }
    function renderDebugModel$1(
      request,
      counter,
      parent,
      parentPropertyName,
      value
    ) {
      if (null === value) return null;
      if (value === REACT_ELEMENT_TYPE) return "$";
      if ("object" === typeof value) {
        if (isClientReference(value))
          return serializeDebugClientReference$1(
            request,
            parent,
            parentPropertyName,
            value
          );
        if (value.$$typeof === CONSTRUCTOR_MARKER$1) {
          value = value.constructor;
          var ref = request.writtenDebugObjects.get(value);
          void 0 === ref &&
            ((request = outlineDebugModel$1(request, counter, value)),
            (ref = serializeByValueID$1(request)));
          return "$P" + ref.slice(1);
        }
        if (void 0 !== request.temporaryReferences) {
          var tempRef = request.temporaryReferences.get(value);
          if (void 0 !== tempRef) return "$T" + tempRef;
        }
        tempRef = request.writtenDebugObjects;
        var existingDebugReference = tempRef.get(value);
        if (void 0 !== existingDebugReference)
          if (debugModelRoot$1 === value) debugModelRoot$1 = null;
          else return existingDebugReference;
        else if (-1 === parentPropertyName.indexOf(":"))
          if (
            ((existingDebugReference = tempRef.get(parent)),
            void 0 !== existingDebugReference)
          ) {
            if (0 >= counter.objectLimit && !doNotLimit$1.has(value))
              return serializeDeferredObject$1(request, value);
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
                  break;
                case "4":
                  propertyName = "_owner";
              }
            tempRef.set(value, existingDebugReference + ":" + propertyName);
          } else if (debugNoOutline$1 !== value) {
            if ("function" === typeof value.then)
              return serializeDebugThenable$1(request, counter, value);
            request = outlineDebugModel$1(request, counter, value);
            return serializeByValueID$1(request);
          }
        parent = request.writtenObjects.get(value);
        if (void 0 !== parent) return parent;
        if (0 >= counter.objectLimit && !doNotLimit$1.has(value))
          return serializeDeferredObject$1(request, value);
        counter.objectLimit--;
        parent = request.deferredDebugObjects;
        if (
          null !== parent &&
          ((parentPropertyName = parent.existing.get(value)),
          void 0 !== parentPropertyName)
        )
          return (
            parent.existing.delete(value),
            parent.retained.delete(parentPropertyName),
            emitOutlinedDebugModelChunk$1(
              request,
              parentPropertyName,
              counter,
              value
            ),
            serializeByValueID$1(parentPropertyName)
          );
        switch (value.$$typeof) {
          case REACT_ELEMENT_TYPE:
            null != value._owner &&
              outlineComponentInfo$1(request, value._owner);
            "object" === typeof value.type &&
              null !== value.type &&
              doNotLimit$1.add(value.type);
            "object" === typeof value.key &&
              null !== value.key &&
              doNotLimit$1.add(value.key);
            doNotLimit$1.add(value.props);
            null !== value._owner && doNotLimit$1.add(value._owner);
            counter = null;
            if (null != value._debugStack)
              for (
                counter = filterStackTrace$2(
                  request,
                  parseStackTrace(value._debugStack, 1)
                ),
                  doNotLimit$1.add(counter),
                  request = 0;
                request < counter.length;
                request++
              )
                doNotLimit$1.add(counter[request]);
            return [
              REACT_ELEMENT_TYPE,
              value.type,
              value.key,
              value.props,
              value._owner,
              counter,
              value._store.validated
            ];
          case REACT_LAZY_TYPE:
            value = value._payload;
            if (null !== value && "object" === typeof value) {
              switch (value._status) {
                case 1:
                  return (
                    (request = outlineDebugModel$1(
                      request,
                      counter,
                      value._result
                    )),
                    serializeLazyID$1(request)
                  );
                case 2:
                  return (
                    (counter = request.nextChunkId++),
                    emitErrorChunk$1(
                      request,
                      counter,
                      "",
                      value._result,
                      !0,
                      null
                    ),
                    serializeLazyID$1(counter)
                  );
              }
              switch (value.status) {
                case "fulfilled":
                  return (
                    (request = outlineDebugModel$1(
                      request,
                      counter,
                      value.value
                    )),
                    serializeLazyID$1(request)
                  );
                case "rejected":
                  return (
                    (counter = request.nextChunkId++),
                    emitErrorChunk$1(
                      request,
                      counter,
                      "",
                      value.reason,
                      !0,
                      null
                    ),
                    serializeLazyID$1(counter)
                  );
              }
            }
            request.pendingDebugChunks++;
            value = request.nextChunkId++;
            emitDebugHaltChunk$1(request, value);
            return serializeLazyID$1(value);
        }
        if ("function" === typeof value.then)
          return serializeDebugThenable$1(request, counter, value);
        if (isArrayImpl(value))
          return 200 < value.length && !doNotLimit$1.has(value)
            ? serializeDeferredObject$1(request, value)
            : value;
        if (value instanceof Date) return "$D" + value.toJSON();
        if (value instanceof Map) {
          value = Array.from(value);
          counter.objectLimit++;
          for (ref = 0; ref < value.length; ref++) {
            var entry = value[ref];
            doNotLimit$1.add(entry);
            var key = entry[0];
            entry = entry[1];
            "object" === typeof key && null !== key && doNotLimit$1.add(key);
            "object" === typeof entry &&
              null !== entry &&
              doNotLimit$1.add(entry);
          }
          return (
            "$Q" + outlineDebugModel$1(request, counter, value).toString(16)
          );
        }
        if (value instanceof Set) {
          value = Array.from(value);
          counter.objectLimit++;
          for (ref = 0; ref < value.length; ref++)
            (key = value[ref]),
              "object" === typeof key && null !== key && doNotLimit$1.add(key);
          return (
            "$W" + outlineDebugModel$1(request, counter, value).toString(16)
          );
        }
        if ("function" === typeof FormData && value instanceof FormData)
          return (
            (value = Array.from(value.entries())),
            "$K" +
              outlineDebugModel$1(
                request,
                { objectLimit: 2 * value.length + 1 },
                value
              ).toString(16)
          );
        if (value instanceof Error) {
          var name = "Error";
          parent = (0, request.environmentName)();
          try {
            (name = value.name),
              (key = String(value.message)),
              (ref = filterStackTrace$2(request, parseStackTrace(value, 0))),
              (entry = value.environmentName),
              "string" === typeof entry && (parent = entry);
          } catch (x) {
            (key =
              "An error occurred but serializing the error message failed."),
              (ref = []);
          }
          key = { name: name, message: key, stack: ref, env: parent };
          "cause" in value &&
            (counter.objectLimit--,
            (entry = outlineDebugModel$1(request, counter, value.cause)),
            (key.cause = serializeByValueID$1(entry)));
          "undefined" !== typeof AggregateError &&
            value instanceof AggregateError &&
            (counter.objectLimit--,
            (value = outlineDebugModel$1(request, counter, value.errors)),
            (key.errors = serializeByValueID$1(value)));
          request =
            "$Z" +
            outlineDebugModel$1(
              request,
              { objectLimit: 2 * ref.length + 2 },
              key
            ).toString(16);
          return request;
        }
        if (value instanceof ArrayBuffer)
          return serializeDebugTypedArray$1(
            request,
            "A",
            new Uint8Array(value)
          );
        if (value instanceof Int8Array)
          return serializeDebugTypedArray$1(request, "O", value);
        if (value instanceof Uint8Array)
          return serializeDebugTypedArray$1(request, "o", value);
        if (value instanceof Uint8ClampedArray)
          return serializeDebugTypedArray$1(request, "U", value);
        if (value instanceof Int16Array)
          return serializeDebugTypedArray$1(request, "S", value);
        if (value instanceof Uint16Array)
          return serializeDebugTypedArray$1(request, "s", value);
        if (value instanceof Int32Array)
          return serializeDebugTypedArray$1(request, "L", value);
        if (value instanceof Uint32Array)
          return serializeDebugTypedArray$1(request, "l", value);
        if (value instanceof Float32Array)
          return serializeDebugTypedArray$1(request, "G", value);
        if (value instanceof Float64Array)
          return serializeDebugTypedArray$1(request, "g", value);
        if (value instanceof BigInt64Array)
          return serializeDebugTypedArray$1(request, "M", value);
        if (value instanceof BigUint64Array)
          return serializeDebugTypedArray$1(request, "m", value);
        if (value instanceof DataView)
          return serializeDebugTypedArray$1(request, "V", value);
        if ("function" === typeof Blob && value instanceof Blob)
          return serializeDebugBlob$1(request, value);
        if (getIteratorFn(value)) return Array.from(value);
        request = getPrototypeOf$2(value);
        if (request !== ObjectPrototype$3 && null !== request) {
          counter = Object.create(null);
          for (name in value)
            if (hasOwnProperty.call(value, name) || isGetter(request, name))
              counter[name] = value[name];
          ref = request.constructor;
          "function" !== typeof ref ||
            ref.prototype !== request ||
            hasOwnProperty.call(value, "") ||
            isGetter(request, "") ||
            (counter[""] = {
              $$typeof: CONSTRUCTOR_MARKER$1,
              constructor: ref
            });
          return counter;
        }
        return value;
      }
      if ("string" === typeof value) {
        if (1e6 < value.length)
          return (
            "This string of length " +
            value.length +
            " has been omitted by React to avoid sending too much data from the server."
          );
        if (1024 <= value.length) {
          if (0 >= counter.objectLimit)
            return serializeDeferredObject$1(request, value);
          counter.objectLimit--;
          request.pendingDebugChunks++;
          counter = request.nextChunkId++;
          emitTextChunk$1(request, counter, value, !0);
          return serializeByValueID$1(counter);
        }
        return escapeStringValue$1(value);
      }
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber$1(value);
      if ("undefined" === typeof value) return "$undefined";
      if ("function" === typeof value) {
        if (isClientReference(value))
          return serializeDebugClientReference$1(
            request,
            parent,
            parentPropertyName,
            value
          );
        if (
          void 0 !== request.temporaryReferences &&
          ((counter = request.temporaryReferences.get(value)),
          void 0 !== counter)
        )
          return "$T" + counter;
        counter = request.writtenDebugObjects;
        ref = counter.get(value);
        if (void 0 !== ref) return ref;
        ref = Function.prototype.toString.call(value);
        key = value.name;
        key =
          "$E" +
          ("string" === typeof key
            ? "Object.defineProperty(" +
              ref +
              ',"name",{value:' +
              JSON.stringify(key) +
              "})"
            : "(" + ref + ")");
        request.pendingDebugChunks++;
        ref = request.nextChunkId++;
        key = encodeReferenceChunk$1(request, ref, key);
        request.completedDebugChunks.push(key);
        request = serializeByValueID$1(ref);
        counter.set(value, request);
        return request;
      }
      if ("symbol" === typeof value) {
        counter = request.writtenSymbols.get(value);
        if (void 0 !== counter) return serializeByValueID$1(counter);
        value = value.description;
        request.pendingChunks++;
        counter = request.nextChunkId++;
        emitSymbolChunk$1(request, counter, value);
        return serializeByValueID$1(counter);
      }
      return "bigint" === typeof value
        ? "$n" + value.toString(10)
        : "unknown type " + typeof value;
    }
    function serializeDebugModel$1(request, objectLimit, model) {
      function replacer(parentPropertyName) {
        try {
          return renderDebugModel$1(
            request,
            counter,
            this,
            parentPropertyName,
            this[parentPropertyName]
          );
        } catch (x) {
          return (
            "Unknown Value: React could not send it from the server.\n" +
            x.message
          );
        }
      }
      var counter = { objectLimit: objectLimit };
      objectLimit = debugNoOutline$1;
      debugNoOutline$1 = model;
      try {
        return stringify$1(model, replacer);
      } catch (x) {
        return stringify$1(
          "Unknown Value: React could not send it from the server.\n" +
            x.message
        );
      } finally {
        debugNoOutline$1 = objectLimit;
      }
    }
    function emitOutlinedDebugModelChunk$1(request, id, counter, model) {
      function replacer(parentPropertyName) {
        try {
          return renderDebugModel$1(
            request,
            counter,
            this,
            parentPropertyName,
            this[parentPropertyName]
          );
        } catch (x) {
          return (
            "Unknown Value: React could not send it from the server.\n" +
            x.message
          );
        }
      }
      "object" === typeof model && null !== model && doNotLimit$1.add(model);
      var prevModelRoot = debugModelRoot$1;
      debugModelRoot$1 = model;
      "object" === typeof model &&
        null !== model &&
        request.writtenDebugObjects.set(model, serializeByValueID$1(id));
      try {
        var json = stringify$1(model, replacer);
      } catch (x) {
        json = stringify$1(
          "Unknown Value: React could not send it from the server.\n" +
            x.message
        );
      } finally {
        debugModelRoot$1 = prevModelRoot;
      }
      id = id.toString(16) + ":" + json + "\n";
      request.completedDebugChunks.push(id);
    }
    function outlineDebugModel$1(request, counter, model) {
      var id = request.nextChunkId++;
      request.pendingDebugChunks++;
      emitOutlinedDebugModelChunk$1(request, id, counter, model);
      return id;
    }
    function emitTimeOriginChunk$1(request, timeOrigin) {
      request.pendingDebugChunks++;
      request.completedDebugChunks.push(":N" + timeOrigin + "\n");
    }
    function forwardDebugInfo$2(request$jscomp$0, task, debugInfo) {
      for (var id = task.id, i = 0; i < debugInfo.length; i++) {
        var info = debugInfo[i];
        if ("number" === typeof info.time)
          markOperationEndTime$2(request$jscomp$0, task, info.time);
        else if ("string" === typeof info.name)
          outlineComponentInfo$1(request$jscomp$0, info),
            request$jscomp$0.pendingChunks++,
            emitDebugChunk$1(request$jscomp$0, id, info);
        else if (info.awaited) {
          var ioInfo = info.awaited;
          if (!(ioInfo.end <= request$jscomp$0.timeOrigin)) {
            var request = request$jscomp$0,
              ioInfo$jscomp$0 = ioInfo;
            if (!request.writtenObjects.has(ioInfo$jscomp$0)) {
              request.pendingDebugChunks++;
              var id$jscomp$0 = request.nextChunkId++,
                owner = ioInfo$jscomp$0.owner;
              null != owner && outlineComponentInfo$1(request, owner);
              var debugStack =
                null == ioInfo$jscomp$0.stack &&
                null != ioInfo$jscomp$0.debugStack
                  ? filterStackTrace$2(
                      request,
                      parseStackTrace(ioInfo$jscomp$0.debugStack, 1)
                    )
                  : ioInfo$jscomp$0.stack;
              var env = ioInfo$jscomp$0.env;
              null == env && (env = (0, request.environmentName)());
              emitIOInfoChunk$1(
                request,
                id$jscomp$0,
                ioInfo$jscomp$0.name,
                ioInfo$jscomp$0.start,
                ioInfo$jscomp$0.end,
                ioInfo$jscomp$0.value,
                env,
                owner,
                debugStack
              );
              request.writtenDebugObjects.set(
                ioInfo$jscomp$0,
                serializeByValueID$1(id$jscomp$0)
              );
            }
            null != info.owner &&
              outlineComponentInfo$1(request$jscomp$0, info.owner);
            debugStack =
              null == info.stack && null != info.debugStack
                ? filterStackTrace$2(
                    request$jscomp$0,
                    parseStackTrace(info.debugStack, 1)
                  )
                : info.stack;
            ioInfo = { awaited: ioInfo };
            ioInfo.env =
              null != info.env
                ? info.env
                : (0, request$jscomp$0.environmentName)();
            null != info.owner && (ioInfo.owner = info.owner);
            null != debugStack && (ioInfo.stack = debugStack);
            request$jscomp$0.pendingChunks++;
            emitDebugChunk$1(request$jscomp$0, id, ioInfo);
          }
        } else
          request$jscomp$0.pendingChunks++,
            emitDebugChunk$1(request$jscomp$0, id, info);
      }
    }
    function forwardDebugInfoFromThenable$1(
      request,
      task,
      thenable,
      owner,
      stack
    ) {
      var debugInfo;
      (debugInfo = thenable._debugInfo) &&
        forwardDebugInfo$2(request, task, debugInfo);
      thenable = getAsyncSequenceFromPromise(thenable);
      null !== thenable &&
        emitAsyncSequence$1(request, task, thenable, debugInfo, owner, stack);
    }
    function forwardDebugInfoFromCurrentContext$1(request, task, thenable) {
      (thenable = thenable._debugInfo) &&
        forwardDebugInfo$2(request, task, thenable);
      var sequence = getCurrentAsyncSequence();
      null !== sequence &&
        emitAsyncSequence$1(request, task, sequence, thenable, null, null);
    }
    function forwardDebugInfoFromAbortedTask$1(request, task) {
      var model = task.model;
      if ("object" === typeof model && null !== model) {
        var debugInfo;
        (debugInfo = model._debugInfo) &&
          forwardDebugInfo$2(request, task, debugInfo);
        var thenable = null;
        "function" === typeof model.then
          ? (thenable = model)
          : model.$$typeof === REACT_LAZY_TYPE &&
            ((model = model._payload),
            "function" === typeof model.then && (thenable = model));
        if (
          null !== thenable &&
          ((model = getAsyncSequenceFromPromise(thenable)), null !== model)
        ) {
          for (
            thenable = model;
            4 === thenable.tag && null !== thenable.awaited;

          )
            thenable = thenable.awaited;
          3 === thenable.tag
            ? (serializeIONode$1(request, thenable, null),
              request.pendingChunks++,
              (debugInfo = (0, request.environmentName)()),
              (debugInfo = { awaited: thenable, env: debugInfo }),
              advanceTaskTime$1(request, task, task.time),
              emitDebugChunk$1(request, task.id, debugInfo))
            : emitAsyncSequence$1(request, task, model, debugInfo, null, null);
        }
      }
    }
    function emitTimingChunk$1(request, id, timestamp) {
      request.pendingChunks++;
      var json = '{"time":' + (timestamp - request.timeOrigin) + "}";
      null !== request.debugDestination
        ? ((timestamp = request.nextChunkId++),
          (json = timestamp.toString(16) + ":" + json + "\n"),
          request.pendingDebugChunks++,
          request.completedDebugChunks.push(json),
          (id = id.toString(16) + ':D"$' + timestamp.toString(16) + '"\n'),
          request.completedRegularChunks.push(id))
        : ((id = id.toString(16) + ":D" + json + "\n"),
          request.completedRegularChunks.push(id));
    }
    function advanceTaskTime$1(request, task, timestamp) {
      timestamp > task.time
        ? (emitTimingChunk$1(request, task.id, timestamp),
          (task.time = timestamp))
        : task.timed || emitTimingChunk$1(request, task.id, task.time);
      task.timed = !0;
    }
    function markOperationEndTime$2(request, task, timestamp) {
      (request.status === ABORTING$2 && timestamp > request.abortTime) ||
        (timestamp > task.time
          ? (emitTimingChunk$1(request, task.id, timestamp),
            (task.time = timestamp))
          : emitTimingChunk$1(request, task.id, task.time));
    }
    function emitChunk$1(request, task, value) {
      var id = task.id;
      "string" === typeof value && null !== byteLengthOfChunk
        ? ((task = TaintRegistryValues$2.get(value)),
          void 0 !== task && throwTaintViolation$2(task.message),
          emitTextChunk$1(request, id, value, !1))
        : "object" === typeof value &&
            null !== value &&
            isServerReference(value)
          ? ((task = stringify$1(serializeServerReference$1(request, value))),
            emitModelChunk$1(request, id, task))
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
                              ? emitTypedArrayChunk$1(
                                  request,
                                  id,
                                  "g",
                                  value,
                                  !1
                                )
                              : value instanceof BigInt64Array
                                ? emitTypedArrayChunk$1(
                                    request,
                                    id,
                                    "M",
                                    value,
                                    !1
                                  )
                                : value instanceof BigUint64Array
                                  ? emitTypedArrayChunk$1(
                                      request,
                                      id,
                                      "m",
                                      value,
                                      !1
                                    )
                                  : value instanceof DataView
                                    ? emitTypedArrayChunk$1(
                                        request,
                                        id,
                                        "V",
                                        value,
                                        !1
                                      )
                                    : ((id = resolveModel$2(
                                        request,
                                        task,
                                        { "": value },
                                        "",
                                        value
                                      )),
                                      (id = stringify$1(id)),
                                      emitModelChunk$1(request, task.id, id));
    }
    function erroredTask$2(request, task, error) {
      task.timed && markOperationEndTime$2(request, task, performance.now());
      task.status = ERRORED$3;
      var digest = logRecoverableError$2(request, error, task);
      emitErrorChunk$1(request, task.id, digest, error, !1, task.debugOwner);
      request.abortableTasks.delete(task);
      callOnAllReadyIfReady(request);
    }
    function retryTask$2(request, task) {
      if (task.status === PENDING$3) {
        var prevCanEmitDebugInfo = canEmitDebugInfo$1;
        task.status = RENDERING$2;
        var parentSerializedSize = serializedSize$1;
        try {
          modelRoot$2 = task.model;
          canEmitDebugInfo$1 = !0;
          var resolvedModel = renderModelDestructive$2(
            request,
            task,
            emptyRoot$1,
            "",
            task.model
          );
          canEmitDebugInfo$1 = !1;
          modelRoot$2 = resolvedModel;
          task.keyPath = null;
          task.implicitSlot = !1;
          var currentEnv = (0, request.environmentName)();
          currentEnv !== task.environmentName &&
            (request.pendingChunks++,
            emitDebugChunk$1(request, task.id, { env: currentEnv }));
          task.timed &&
            markOperationEndTime$2(request, task, performance.now());
          if ("object" === typeof resolvedModel && null !== resolvedModel)
            request.writtenObjects.set(
              resolvedModel,
              serializeByValueID$1(task.id)
            ),
              emitChunk$1(request, task, resolvedModel);
          else {
            var json = stringify$1(resolvedModel);
            emitModelChunk$1(request, task.id, json);
          }
          task.status = COMPLETED$2;
          request.abortableTasks.delete(task);
          callOnAllReadyIfReady(request);
        } catch (thrownValue) {
          if (request.status === ABORTING$2)
            if (
              (request.abortableTasks.delete(task),
              (task.status = PENDING$3),
              request.type === PRERENDER$1)
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
              task.status = PENDING$3;
              task.thenableState = getThenableStateAfterSuspending$1();
              var ping = task.ping;
              x.then(ping, ping);
            } else erroredTask$2(request, task, x);
          }
        } finally {
          (canEmitDebugInfo$1 = prevCanEmitDebugInfo),
            (serializedSize$1 = parentSerializedSize);
        }
      }
    }
    function tryStreamTask$2(request, task) {
      var prevCanEmitDebugInfo = canEmitDebugInfo$1;
      canEmitDebugInfo$1 = !1;
      var parentSerializedSize = serializedSize$1;
      try {
        emitChunk$1(request, task, task.model);
      } finally {
        (serializedSize$1 = parentSerializedSize),
          (canEmitDebugInfo$1 = prevCanEmitDebugInfo);
      }
    }
    function performWork$2(request) {
      pendingOperations.delete(async_hooks.executionAsyncId());
      var prevDispatcher = ReactSharedInternalsServer.H;
      ReactSharedInternalsServer.H = HooksDispatcher$1;
      var prevRequest = currentRequest$2;
      currentRequest$2 = request;
      var prevCache = setCurrentCache(request);
      currentRequest$3 = request;
      try {
        var pingedTasks = request.pingedTasks;
        request.pingedTasks = [];
        for (var i = 0; i < pingedTasks.length; i++)
          retryTask$2(request, pingedTasks[i]);
        flushCompletedChunks$1(request);
      } catch (error) {
        logRecoverableError$2(request, error, null),
          fatalError$2(request, error);
      } finally {
        (ReactSharedInternalsServer.H = prevDispatcher),
          (currentRequest$3 = null),
          (currentRequest$2 = prevRequest),
          setCurrentCache(prevCache);
      }
    }
    function abortTask$2(task) {
      task.status === PENDING$3 && (task.status = ABORTED$2);
    }
    function finishAbortedTask$1(task, request, errorId) {
      task.status === ABORTED$2 &&
        (forwardDebugInfoFromAbortedTask$1(request, task),
        task.timed && markOperationEndTime$2(request, task, request.abortTime),
        (errorId = serializeByValueID$1(errorId)),
        (task = encodeReferenceChunk$1(request, task.id, errorId)),
        request.completedErrorChunks.push(task));
    }
    function haltTask$1(task) {
      task.status === PENDING$3 && (task.status = ABORTED$2);
    }
    function finishHaltedTask$1(task, request) {
      task.status === ABORTED$2 &&
        (forwardDebugInfoFromAbortedTask$1(request, task),
        request.pendingChunks--);
    }
    function flushCompletedChunks$1(request) {
      if (null !== request.debugDestination) {
        var debugDestination = request.debugDestination;
        beginWriting();
        try {
          for (
            var debugChunks = request.completedDebugChunks, i = 0;
            i < debugChunks.length;
            i++
          ) {
            var item = debugChunks[i];
            if (item === NEXT_TWO_CHUNKS_ARE_ATOMIC$1) {
              if (i + 2 >= debugChunks.length)
                throw Error(
                  "A chunk pair is incomplete. This is a bug in React."
                );
              request.pendingDebugChunks -= 2;
              writeChunk(debugDestination, debugChunks[i + 1]);
              writeChunk(debugDestination, debugChunks[i + 2]);
              i += 2;
            } else
              request.pendingDebugChunks--, writeChunk(debugDestination, item);
          }
          debugChunks.splice(0, i);
        } finally {
          completeWriting(debugDestination);
        }
        flushBuffered(debugDestination);
      }
      debugDestination = request.destination;
      if (null !== debugDestination) {
        beginWriting();
        try {
          var importsChunks = request.completedImportChunks;
          for (
            debugChunks = 0;
            debugChunks < importsChunks.length;
            debugChunks++
          )
            if (
              (request.pendingChunks--,
              !writeChunkAndReturn(
                debugDestination,
                importsChunks[debugChunks]
              ))
            ) {
              request.destination = null;
              debugChunks++;
              break;
            }
          importsChunks.splice(0, debugChunks);
          var hintChunks = request.completedHintChunks;
          for (debugChunks = 0; debugChunks < hintChunks.length; debugChunks++)
            if (
              !writeChunkAndReturn(debugDestination, hintChunks[debugChunks])
            ) {
              request.destination = null;
              debugChunks++;
              break;
            }
          hintChunks.splice(0, debugChunks);
          if (null === request.debugDestination) {
            var _debugChunks = request.completedDebugChunks;
            for (
              debugChunks = 0;
              debugChunks < _debugChunks.length;
              debugChunks++
            ) {
              var _item = _debugChunks[debugChunks];
              importsChunks = void 0;
              if (_item === NEXT_TWO_CHUNKS_ARE_ATOMIC$1) {
                if (debugChunks + 2 >= _debugChunks.length)
                  throw Error(
                    "A chunk pair is incomplete. This is a bug in React."
                  );
                request.pendingDebugChunks -= 2;
                writeChunk(debugDestination, _debugChunks[debugChunks + 1]);
                importsChunks = writeChunkAndReturn(
                  debugDestination,
                  _debugChunks[debugChunks + 2]
                );
                debugChunks += 2;
              } else
                request.pendingDebugChunks--,
                  (importsChunks = writeChunkAndReturn(
                    debugDestination,
                    _item
                  ));
              if (!importsChunks) {
                request.destination = null;
                debugChunks++;
                break;
              }
            }
            _debugChunks.splice(0, debugChunks);
          }
          var regularChunks = request.completedRegularChunks;
          for (
            debugChunks = 0;
            debugChunks < regularChunks.length;
            debugChunks++
          ) {
            var _item2 = regularChunks[debugChunks];
            _debugChunks = void 0;
            if (_item2 === NEXT_TWO_CHUNKS_ARE_ATOMIC$1) {
              if (debugChunks + 2 >= regularChunks.length)
                throw Error(
                  "A chunk pair is incomplete. This is a bug in React."
                );
              request.pendingChunks -= 2;
              writeChunk(debugDestination, regularChunks[debugChunks + 1]);
              _debugChunks = writeChunkAndReturn(
                debugDestination,
                regularChunks[debugChunks + 2]
              );
              debugChunks += 2;
            } else
              request.pendingChunks--,
                (_debugChunks = writeChunkAndReturn(debugDestination, _item2));
            if (!_debugChunks) {
              request.destination = null;
              debugChunks++;
              break;
            }
          }
          regularChunks.splice(0, debugChunks);
          var errorChunks = request.completedErrorChunks;
          for (debugChunks = 0; debugChunks < errorChunks.length; debugChunks++)
            if (
              (request.pendingChunks--,
              !writeChunkAndReturn(debugDestination, errorChunks[debugChunks]))
            ) {
              request.destination = null;
              debugChunks++;
              break;
            }
          errorChunks.splice(0, debugChunks);
        } finally {
          (request.flushScheduled = !1), completeWriting(debugDestination);
        }
        flushBuffered(debugDestination);
      }
      0 === request.pendingChunks &&
        (request.status < ABORTING$2 &&
          request.cacheController.abort(
            Error(
              "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
            )
          ),
        (regularChunks = request.debugDestination),
        0 === request.pendingDebugChunks
          ? (null !== regularChunks &&
              (regularChunks.end(), (request.debugDestination = null)),
            cleanupTaintQueue$2(request),
            null !== request.destination &&
              ((request.status = CLOSED$2),
              request.destination.end(),
              (request.destination = null)),
            null !== request.debugDestination &&
              (request.debugDestination.end(),
              (request.debugDestination = null)))
          : null !== regularChunks &&
            null !== request.destination &&
            ((request.status = CLOSED$2),
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
        request.status === OPENING$2 && (request.status = OPEN$2);
      });
    }
    function enqueueFlush$1(request) {
      !1 !== request.flushScheduled ||
        0 !== request.pingedTasks.length ||
        (null === request.destination && null === request.debugDestination) ||
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
      if (request.status === CLOSING$1)
        (request.status = CLOSED$2), destination.destroy(request.fatalError);
      else if (request.status !== CLOSED$2 && null === request.destination) {
        request.destination = destination;
        try {
          flushCompletedChunks$1(request);
        } catch (error) {
          logRecoverableError$2(request, error, null),
            fatalError$2(request, error);
        }
      }
    }
    function startFlowingDebug$1(request, debugDestination) {
      if (request.status === CLOSING$1)
        (request.status = CLOSED$2),
          debugDestination.destroy(request.fatalError);
      else if (
        request.status !== CLOSED$2 &&
        null === request.debugDestination
      ) {
        request.debugDestination = debugDestination;
        try {
          flushCompletedChunks$1(request);
        } catch (error) {
          logRecoverableError$2(request, error, null),
            fatalError$2(request, error);
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
        logRecoverableError$2(request, error, null),
          fatalError$2(request, error);
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
        logRecoverableError$2(request, error, null),
          fatalError$2(request, error);
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
      if (!(request.status > OPEN$2))
        try {
          request.status = ABORTING$2;
          request.abortTime = performance.now();
          request.cacheController.abort(reason);
          var abortableTasks = request.abortableTasks;
          if (0 < abortableTasks.size)
            if (request.type === PRERENDER$1)
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
        } catch (error$10) {
          logRecoverableError$2(request, error$10, null),
            fatalError$2(request, error$10);
        }
    }
    function fromHex$1(str) {
      return parseInt(str, 16);
    }
    function resolveDebugMessage$1(request, message) {
      var deferredDebugObjects = request.deferredDebugObjects;
      if (null === deferredDebugObjects)
        throw Error(
          "resolveDebugMessage/closeDebugChannel should not be called for a Request that wasn't kept alive. This is a bug in React."
        );
      if ("" === message) closeDebugChannel$1(request);
      else {
        var command = message.charCodeAt(0);
        message = message.slice(2).split(",").map(fromHex$1);
        switch (command) {
          case 82:
            for (command = 0; command < message.length; command++) {
              var id = message[command],
                retainedValue = deferredDebugObjects.retained.get(id);
              void 0 !== retainedValue &&
                (request.pendingDebugChunks--,
                deferredDebugObjects.retained.delete(id),
                deferredDebugObjects.existing.delete(retainedValue),
                enqueueFlush$1(request));
            }
            break;
          case 81:
            for (command = 0; command < message.length; command++)
              (id = message[command]),
                (retainedValue = deferredDebugObjects.retained.get(id)),
                void 0 !== retainedValue &&
                  (deferredDebugObjects.retained.delete(id),
                  deferredDebugObjects.existing.delete(retainedValue),
                  emitOutlinedDebugModelChunk$1(
                    request,
                    id,
                    { objectLimit: 10 },
                    retainedValue
                  ),
                  enqueueFlush$1(request));
            break;
          case 80:
            for (command = 0; command < message.length; command++)
              (id = message[command]),
                (retainedValue = deferredDebugObjects.retained.get(id)),
                void 0 !== retainedValue &&
                  (deferredDebugObjects.retained.delete(id),
                  emitRequestedDebugThenable$1(
                    request,
                    id,
                    { objectLimit: 10 },
                    retainedValue
                  ));
            break;
          default:
            throw Error(
              "Unknown command. The debugChannel was not wired up properly."
            );
        }
      }
    }
    function closeDebugChannel$1(request) {
      var deferredDebugObjects = request.deferredDebugObjects;
      if (null === deferredDebugObjects)
        throw Error(
          "resolveDebugMessage/closeDebugChannel should not be called for a Request that wasn't kept alive. This is a bug in React."
        );
      deferredDebugObjects.retained.forEach(function (value, id) {
        request.pendingDebugChunks--;
        deferredDebugObjects.retained.delete(id);
        deferredDebugObjects.existing.delete(value);
      });
      enqueueFlush$1(request);
    }
    function createStringDecoder() {
      return new util.TextDecoder("utf-8", {
        ignoreBOM:
          0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : !1
      });
    }
    function readFinalStringChunk(decoder, buffer) {
      return decoder.decode(buffer);
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
      for (
        var chunks = metadata[1], promises = [], i = 0;
        i < chunks.length;
        i++
      ) {
        var thenable = globalThis.__next_chunk_load__(chunks[i]);
        loadedChunks.has(thenable) || promises.push(thenable);
        if (!instrumentedChunks.has(thenable)) {
          var resolve = loadedChunks.add.bind(loadedChunks, thenable);
          thenable.then(resolve, ignoreReject);
          instrumentedChunks.add(thenable);
        }
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
    function appendBackingEntry(backingStore, key, value) {
      backingStore.data.append(key, value);
      value = backingStore.keys;
      null === value
        ? ((backingStore.keys = Array.from(backingStore.data.keys())),
          (backingStore.keyPointer = 0))
        : value.push(key);
    }
    function ReactPromise$1(status, value, reason) {
      this.status = status;
      this.value = value;
      this.reason = reason;
    }
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
                for (
                  response = 0;
                  response < resolveListeners.length;
                  response++
                )
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
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}",
        (($jscomp$compprop4.id = -1),
        ($jscomp$compprop4[RESPONSE_SYMBOL] = response),
        $jscomp$compprop4)
      );
    }
    function resolveIteratorResultChunk(response, chunk, value, done) {
      resolveModelChunk(
        response,
        chunk,
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}",
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
      else if (id instanceof ReactPromise$1)
        cachedPromise = Promise.resolve(id);
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
                boundArgs = isArrayImpl(promiseValue)
                  ? promiseValue.slice(0)
                  : [];
              if (boundArgs.length > MAX_BOUND_ARGS)
                throw Error(
                  "Server Function has too many bound arguments. Received " +
                    boundArgs.length +
                    " but the limit is " +
                    MAX_BOUND_ARGS +
                    "."
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
    function loadServerObjectReference(response, metaData, parentObject, key) {
      function fulfill() {
        try {
          var value = requireServerReference(response, serverReference);
          if ("object" !== typeof value || null === value)
            throw Error(
              "Expected a Server Reference to an object to resolve to an object."
            );
        } catch (error) {
          triggerErrorOnChunk(response, blockedPromise, error);
          return;
        }
        resolveServerReferenceChunk(response, blockedPromise, value);
      }
      var id = metaData.id;
      if ("string" !== typeof id) return null;
      var cachedPromise = response._serverObjectReferenceCache.get(metaData);
      if (void 0 !== cachedPromise)
        return readServerReference(response, cachedPromise, parentObject, key);
      var blockedPromise = new ReactPromise$1("blocked", null, null);
      response._serverObjectReferenceCache.set(metaData, blockedPromise);
      var serverReference = resolveServerReference(response._bundlerConfig, id);
      metaData = preloadModule$1(serverReference);
      null === metaData
        ? fulfill()
        : metaData.then(fulfill, function (error) {
            triggerErrorOnChunk(response, blockedPromise, error);
          });
      return readServerReference(response, blockedPromise, parentObject, key);
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
    function initializeModelChunk(chunk) {
      var prevHandler = initializingHandler;
      initializingHandler = null;
      var _chunk$reason = chunk.reason,
        response = _chunk$reason[RESPONSE_SYMBOL];
      _chunk$reason = _chunk$reason.id;
      _chunk$reason =
        -1 === _chunk$reason ? void 0 : _chunk$reason.toString(16);
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
      chunk ||
        ((chunk = response._formData.data.get(response._prefix + id)),
        (chunk =
          "string" === typeof chunk
            ? createResolvedModelChunk(response, chunk, id)
            : response._closed
              ? new ReactPromise$1("rejected", null, response._closedReason)
              : new ReactPromise$1("pending", null, null)),
        chunks.set(id, chunk));
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
          null !== key &&
            wakeChunk(response, key, handler.value, parentObject)));
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
              (null !== serverReferenceObjects &&
                serverReferenceObjects.has(id)) ||
              (getPrototypeOf$2(id) !== ObjectPrototype$2 &&
                getPrototypeOf$2(id) !== ArrayPrototype) ||
              !hasOwnProperty.call(id, localLength)
            )
              throw Error("Invalid reference.");
            id = id[localLength];
            isArrayImpl(id)
              ? ((localLength = 0),
                (chunk = rootArrayContexts.get(id) || chunk))
              : ((chunk = null),
                "string" === typeof id
                  ? (localLength = id.length)
                  : "bigint" === typeof id
                    ? ((localLength = Math.abs(Number(id))),
                      (localLength =
                        0 === localLength
                          ? 1
                          : Math.floor(Math.log10(localLength)) + 1))
                    : (localLength = ArrayBuffer.isView(id)
                        ? id.byteLength
                        : 0));
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
      reference = response._formData.data.get(key).arrayBuffer();
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
      response = response._formData.data.getAll(response._prefix + id);
      for (id = 0; id < response.length; id++)
        (chunks = response[id]),
          "string" === typeof chunks &&
            ("C" === chunks[0]
              ? controller.close(
                  "C" === chunks ? '"$undefined"' : chunks.slice(1)
                )
              : controller.enqueueModel(chunks));
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
              var _chunk = new ReactPromise$1("pending", null, null);
              _chunk.then(enqueue, flightController.error);
              previousBlockedChunk = _chunk;
              chunk.then(function () {
                previousBlockedChunk === _chunk &&
                  (previousBlockedChunk = null);
                resolveModelChunk(response, _chunk, json, -1);
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
      iterator = iterator
        ? $jscomp$compprop5[ASYNC_ITERATOR]()
        : $jscomp$compprop5;
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
    function parseModelString(response, obj, key, value, reference, arrayRoot) {
      if ("$" === value[0]) {
        switch (value[1]) {
          case "$":
            return (
              null !== arrayRoot &&
                bumpArrayCount(arrayRoot, value.length - 1, response),
              value.slice(1)
            );
          case "@":
            return (
              (obj = parseInt(value.slice(2), 16)), getChunk(response, obj)
            );
          case "h":
            return (
              (arrayRoot = value.slice(2)),
              getOutlinedModel(
                response,
                arrayRoot,
                obj,
                key,
                null,
                loadServerReference$1
              )
            );
          case "H":
            return (
              (arrayRoot = value.slice(2)),
              getOutlinedModel(
                response,
                arrayRoot,
                obj,
                key,
                null,
                loadServerObjectReference
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
              (arrayRoot = value.slice(2)),
              getOutlinedModel(response, arrayRoot, obj, key, null, createMap)
            );
          case "W":
            return (
              (arrayRoot = value.slice(2)),
              getOutlinedModel(response, arrayRoot, obj, key, null, createSet)
            );
          case "K":
            key = value.slice(2);
            obj = response._prefix + "_";
            key = obj + key + "_";
            arrayRoot = new FormData();
            for (response = response._formData; ; ) {
              value = response;
              reference = value.keys;
              null === reference &&
                ((reference = value.keys = Array.from(value.data.keys())),
                (value.keyPointer = 0));
              value = reference[value.keyPointer];
              if (void 0 === value) break;
              if (value.startsWith(key)) {
                reference = response.data.getAll(value);
                for (
                  var referencedFormDataKey = value.slice(key.length), i = 0;
                  i < reference.length;
                  i++
                )
                  arrayRoot.append(referencedFormDataKey, reference[i]);
                reference = response;
                reference.data.delete(value);
                reference.keyPointer++;
              } else if (value.startsWith(obj)) break;
              else response.keyPointer++;
            }
            return arrayRoot;
          case "i":
            return (
              (arrayRoot = value.slice(2)),
              getOutlinedModel(
                response,
                arrayRoot,
                obj,
                key,
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
            if (obj.length > MAX_BIGINT_DIGITS)
              throw Error(
                "BigInt is too large. Received " +
                  obj.length +
                  " digits but the limit is " +
                  MAX_BIGINT_DIGITS +
                  "."
              );
            null !== arrayRoot &&
              bumpArrayCount(arrayRoot, obj.length, response);
            return BigInt(obj);
          case "A":
            return parseTypedArray(
              response,
              value,
              ArrayBuffer,
              1,
              obj,
              key,
              arrayRoot
            );
          case "O":
            return parseTypedArray(
              response,
              value,
              Int8Array,
              1,
              obj,
              key,
              arrayRoot
            );
          case "o":
            return parseTypedArray(
              response,
              value,
              Uint8Array,
              1,
              obj,
              key,
              arrayRoot
            );
          case "U":
            return parseTypedArray(
              response,
              value,
              Uint8ClampedArray,
              1,
              obj,
              key,
              arrayRoot
            );
          case "S":
            return parseTypedArray(
              response,
              value,
              Int16Array,
              2,
              obj,
              key,
              arrayRoot
            );
          case "s":
            return parseTypedArray(
              response,
              value,
              Uint16Array,
              2,
              obj,
              key,
              arrayRoot
            );
          case "L":
            return parseTypedArray(
              response,
              value,
              Int32Array,
              4,
              obj,
              key,
              arrayRoot
            );
          case "l":
            return parseTypedArray(
              response,
              value,
              Uint32Array,
              4,
              obj,
              key,
              arrayRoot
            );
          case "G":
            return parseTypedArray(
              response,
              value,
              Float32Array,
              4,
              obj,
              key,
              arrayRoot
            );
          case "g":
            return parseTypedArray(
              response,
              value,
              Float64Array,
              8,
              obj,
              key,
              arrayRoot
            );
          case "M":
            return parseTypedArray(
              response,
              value,
              BigInt64Array,
              8,
              obj,
              key,
              arrayRoot
            );
          case "m":
            return parseTypedArray(
              response,
              value,
              BigUint64Array,
              8,
              obj,
              key,
              arrayRoot
            );
          case "V":
            return parseTypedArray(
              response,
              value,
              DataView,
              1,
              obj,
              key,
              arrayRoot
            );
          case "B":
            obj = parseInt(value.slice(2), 16);
            response = response._formData.data.get(response._prefix + obj);
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
          key,
          arrayRoot,
          createModel
        );
      }
      null !== arrayRoot && bumpArrayCount(arrayRoot, value.length, response);
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
        arraySizeLimit =
          4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : 1e6,
        chunks = new Map();
      return {
        _bundlerConfig: bundlerConfig,
        _prefix: formFieldPrefix,
        _formData: { data: backingFormData, keyPointer: -1, keys: null },
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
      appendBackingEntry(response._formData, key, value);
      var prefix = response._prefix;
      if (key.startsWith(prefix)) {
        var chunks = response._chunks;
        key = +key.slice(prefix.length);
        (chunks = chunks.get(key)) &&
          resolveModelChunk(response, chunks, value, key);
      }
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
            if (_ref.length > MAX_BOUND_ARGS)
              throw Error(
                "Server Function has too many bound arguments. Received " +
                  _ref.length +
                  " but the limit is " +
                  MAX_BOUND_ARGS +
                  "."
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
    function startReadingFromDebugChannelReadable$1(request, stream) {
      function onData(chunk) {
        "string" === typeof chunk
          ? (lastWasPartial &&
              ((stringBuffer += readFinalStringChunk(
                stringDecoder,
                new Uint8Array(0)
              )),
              (lastWasPartial = !1)),
            (stringBuffer += chunk))
          : ((stringBuffer += stringDecoder.decode(chunk, decoderOptions)),
            (lastWasPartial = !0));
        chunk = stringBuffer.split("\n");
        for (var i = 0; i < chunk.length - 1; i++)
          resolveDebugMessage$1(request, chunk[i]);
        stringBuffer = chunk[chunk.length - 1];
      }
      function onError(error) {
        abort$2(
          request,
          Error("Lost connection to the Debug Channel.", { cause: error })
        );
      }
      function onClose() {
        closeDebugChannel$1(request);
      }
      var stringDecoder = createStringDecoder(),
        lastWasPartial = !1,
        stringBuffer = "";
      "function" === typeof stream.addEventListener &&
      "string" === typeof stream.binaryType
        ? ((stream.binaryType = "arraybuffer"),
          stream.addEventListener("message", function (event) {
            onData(event.data);
          }),
          stream.addEventListener("error", function (event) {
            onError(event.error);
          }),
          stream.addEventListener("close", onClose))
        : (stream.on("data", onData),
          stream.on("error", onError),
          stream.on("end", onClose));
    }
    function createFakeWritableFromWebSocket$1(webSocket) {
      return {
        write: function (chunk) {
          webSocket.send(chunk);
          return !0;
        },
        end: function () {
          webSocket.close();
        },
        destroy: function (reason) {
          "object" === typeof reason &&
            null !== reason &&
            (reason = reason.message);
          "string" === typeof reason
            ? webSocket.close(1011, reason)
            : webSocket.close(1011);
        }
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
    function startReadingFromDebugChannelReadableStream$1(request, stream) {
      function progress(_ref) {
        var done = _ref.done;
        _ref = _ref.value;
        stringBuffer += done
          ? readFinalStringChunk(stringDecoder, new Uint8Array(0))
          : stringDecoder.decode(_ref, decoderOptions);
        _ref = stringBuffer.split("\n");
        for (var i = 0; i < _ref.length - 1; i++)
          resolveDebugMessage$1(request, _ref[i]);
        stringBuffer = _ref[_ref.length - 1];
        if (done) closeDebugChannel$1(request);
        else return reader.read().then(progress).catch(error);
      }
      function error(e) {
        abort$2(
          request,
          Error("Lost connection to the Debug Channel.", { cause: e })
        );
      }
      var reader = stream.getReader(),
        stringDecoder = createStringDecoder(),
        stringBuffer = "";
      reader.read().then(progress).catch(error);
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
        jsonWorkCredit: 0,
        consoleEntries: []
      };
      root.consoleListeners = new Set();
      root.abort = abortResult.bind(null, root);
      return root;
    }
    function pushConsoleEntry(result, entry) {
      result.consoleEntries.push(entry);
      result.consoleListeners.forEach(function (listener) {
        return listener();
      });
    }
    function subscribeToConsole(result, callback) {
      function flush() {
        for (; active && index < result.consoleEntries.length; )
          callback(result.consoleEntries[index++]);
      }
      var index = 0,
        active = !0;
      result.consoleListeners.add(flush);
      flush();
      return function () {
        active = !1;
        result.consoleListeners.delete(flush);
      };
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
      null === listeners &&
        (result.completionListeners = listeners = new Set());
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
      null === references &&
        (result.modelReferences = references = new WeakMap());
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
      null === haltedModels &&
        (result.haltedModels = haltedModels = new WeakSet());
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
    function setTemporaryReference(result, value, reference) {
      var temporaryReferences = result.temporaryReferences;
      null === temporaryReferences &&
        (result.temporaryReferences = temporaryReferences = new WeakMap());
      temporaryReferences.set(value, reference);
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
    function ReactPromise(weak) {
      var _this = this;
      this.$$typeof = RESULT_MODEL_TYPE;
      this.status = weak ? "pending_weak" : "pending";
      this.reason = this.value = void 0;
      this._promise = new Promise(function (resolve, reject) {
        _this._resolve = resolve;
        _this._reject = reject;
      });
      this._promise.catch(noop);
    }
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
        (model.status = "rejected"),
          (model.reason = error),
          model._reject(error);
    }
    function pushDebugInfo(model, info) {
      model._debugInfo.push(info);
      model = model._debugListeners;
      void 0 !== model &&
        model.forEach(function (listener) {
          return listener(info);
        });
    }
    function subscribeToDebugInfo(model, listener) {
      var info = model._debugInfo;
      if (void 0 !== info)
        for (var i = 0; i < info.length; i++) listener(info[i]);
      info = model._debugListeners;
      void 0 === info && (model._debugListeners = info = new Set());
      var subscriptions = info;
      subscriptions.add(listener);
      return function () {
        subscriptions.delete(listener);
      };
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
          var pictureOrNoScriptTagInScope =
            parentContext & (PICTURE_SCOPE | NOSCRIPT_SCOPE);
          type = props.src;
          var srcSet = props.srcSet;
          if (
            !(
              "lazy" === props.loading ||
              (!type && !srcSet) ||
              ("string" !== typeof type && null != type) ||
              ("string" !== typeof srcSet && null != srcSet) ||
              "low" === props.fetchPriority ||
              pictureOrNoScriptTagInScope
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
            pictureOrNoScriptTagInScope =
              "string" === typeof props.sizes ? props.sizes : void 0;
            var crossOrigin = getCrossOriginString(props.crossOrigin);
            preload(type || "", "image", {
              imageSrcSet: srcSet,
              imageSizes: pictureOrNoScriptTagInScope,
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
              parentContext & NOSCRIPT_SCOPE ||
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
          return parentContext | PICTURE_SCOPE;
        case "noscript":
          return parentContext | NOSCRIPT_SCOPE;
        default:
          return parentContext;
      }
    }
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
    function defaultFilterStackFrame$1(filename) {
      return (
        "" !== filename &&
        !filename.startsWith("node:") &&
        !filename.includes("node_modules")
      );
    }
    function devirtualizeURL$1(url) {
      if (url.startsWith("about://React/")) {
        var envIdx = url.indexOf("/", 14),
          suffixIdx = url.lastIndexOf("?");
        if (-1 < envIdx && -1 < suffixIdx)
          return decodeURI(url.slice(envIdx + 1, suffixIdx));
      }
      return url;
    }
    function filterStackTrace$1(request, stack) {
      request = request.filterStackFrame;
      for (var filteredStack = [], i = 0; i < stack.length; i++) {
        var callsite = stack[i],
          functionName = callsite[0],
          url = devirtualizeURL$1(callsite[1]);
        request(url, functionName, callsite[2], callsite[3]) &&
          ((callsite = callsite.slice(0)),
          (callsite[1] = url),
          filteredStack.push(callsite));
      }
      return filteredStack;
    }
    function getCurrentStackInDEV() {
      var owner = resolveOwner();
      return null === owner ? "" : getOwnerStackByComponentInfoInDev(owner);
    }
    function callWithDebugContextInDEV$1(request, task, callback, arg) {
      request = {
        name: "",
        env: task.environmentName,
        key: null,
        owner: task.debugOwner,
        stack:
          null === task.debugStack
            ? null
            : filterStackTrace$1(request, parseStackTrace(task.debugStack, 1)),
        debugStack: task.debugStack,
        debugTask: task.debugTask
      };
      task = task.debugTask;
      currentOwner = request;
      try {
        return task ? task.run(callback.bind(null, arg)) : callback(arg);
      } finally {
        currentOwner = null;
      }
    }
    function defaultErrorHandler$1(error) {
      console.error(error);
    }
    function throwTaintViolation$1(message) {
      throw Error(message);
    }
    function cleanupTaintQueue$1(request) {
      request = request.taintCleanupQueue;
      TaintRegistryPendingRequests$1.delete(request);
      for (var i = 0; i < request.length; i++) {
        var entryValue = request[i],
          entry = TaintRegistryValues$1.get(entryValue);
        void 0 !== entry &&
          (1 === entry.count
            ? TaintRegistryValues$1.delete(entryValue)
            : entry.count--);
      }
      request.length = 0;
    }
    function RequestInstance$1(
      model,
      onError,
      identifierPrefix,
      temporaryReferences,
      createServerReference,
      type,
      onAllReady,
      onFatalError,
      environmentName,
      filterStackFrame,
      debugStartTime
    ) {
      var _this = this;
      if (
        null !== ReactSharedInternalsServer.A &&
        ReactSharedInternalsServer.A !== DefaultAsyncDispatcher
      )
        throw Error(
          "Currently React only supports one RSC renderer at a time."
        );
      ReactSharedInternalsServer.A = DefaultAsyncDispatcher;
      this.type = type;
      this.onAllReady = onAllReady;
      this.onFatalError = onFatalError;
      this.status = OPENING$1;
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
      this.deferredBlobs = null;
      onError = [];
      TaintRegistryPendingRequests$1.add(onError);
      this.taintCleanupQueue = onError;
      this.pendingWeakModels = null;
      this.abortableTasks = new Set();
      this.identifierPrefix = identifierPrefix || "";
      this.temporaryReferences = temporaryReferences;
      this.createServerReference = createServerReference;
      this.identifierCount = 1;
      ReactSharedInternalsServer.getCurrentStack = getCurrentStackInDEV;
      this.completedElements = [];
      this.didWarnForKey = null;
      this.unkeyedElements = new WeakSet();
      this.timeOrigin =
        "number" === typeof debugStartTime
          ? debugStartTime - performance.timeOrigin
          : performance.now();
      this.abortTime = -0;
      this.debugIONodes = new WeakMap();
      this.debugThenables = new WeakMap();
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
      this.filterStackFrame =
        void 0 === filterStackFrame
          ? defaultFilterStackFrame$1
          : filterStackFrame;
      model = createTask$1(this, model, null, !1, NO_SCOPE);
      identifierPrefix = model.promise;
      identifierPrefix._debugStartTime =
        this.timeOrigin + performance.timeOrigin;
      this.result = createResult(
        identifierPrefix,
        function (reason) {
          return abort$1(_this, reason);
        },
        temporaryReferences
      );
      this.pingedTasks = [model];
    }
    function resolveRequest() {
      var cache = resolveCache();
      return cache instanceof RequestInstance$1 ? cache : null;
    }
    function patchConsole$1(consoleInst, methodName) {
      var descriptor = Object.getOwnPropertyDescriptor(consoleInst, methodName);
      if (
        descriptor &&
        (descriptor.configurable || descriptor.writable) &&
        "function" === typeof descriptor.value
      ) {
        var originalMethod = descriptor.value;
        descriptor = Object.getOwnPropertyDescriptor(originalMethod, "name");
        var wrapperMethod = function () {
          var request = resolveRequest();
          if (("assert" !== methodName || !arguments[0]) && null !== request) {
            var stack = filterStackTrace$1(
                request,
                parseStackTracePrivate(Error("react-stack-top-frame"), 1) || []
              ),
              owner = resolveOwner(),
              args = Array.from(arguments),
              env = unbadgeConsole(methodName, args);
            null === env && (env = (0, request.environmentName)());
            pushConsoleEntry(request.result, {
              methodName: methodName,
              owner: owner,
              env: env,
              stack: stack,
              args: args
            });
          }
          return originalMethod.apply(this, arguments);
        };
        descriptor && Object.defineProperty(wrapperMethod, "name", descriptor);
        Object.defineProperty(consoleInst, methodName, {
          value: wrapperMethod
        });
      }
    }
    function emitHint$1(request, code, model) {
      request = request.result;
      request.hintsClosed ||
        ((request = getHintQueue(request)),
        request.completedHints.push({ code: code, model: model }),
        wakeHintQueue(request));
    }
    function renderFunctionComponent(request, task, Component, props, element) {
      if (!canEmitDebugInfo) return outlineTask(request, task);
      var renderedModels = getRenderedModels(
          request,
          element,
          task.keyPath,
          task.implicitSlot
        ),
        prevThenableState = task.thenableState,
        key = element.key;
      task.thenableState = null;
      var isRendering = request.renderingComponents.has(element),
        debugOwner = null;
      if (isRendering) var result = request.renderingComponents.get(element);
      else {
        if (null !== prevThenableState)
          var componentDebugInfo = prevThenableState._componentDebugInfo;
        else
          (componentDebugInfo = {
            name: Component.displayName || Component.name || "",
            env: (0, request.environmentName)(),
            key: element.key,
            stack:
              null === task.debugStack
                ? null
                : filterStackTrace$1(
                    request,
                    parseStackTrace(task.debugStack, 1)
                  ),
            props: props,
            debugStack: task.debugStack,
            debugTask: task.debugTask
          }),
            null !== task.debugOwner &&
              (componentDebugInfo.owner = task.debugOwner),
            (2 === element._store.validated ||
              request.unkeyedElements.has(element)) &&
              warnForMissingKey(
                request,
                key,
                componentDebugInfo,
                task.debugTask
              ),
            (task.time = performance.now()),
            pushDebugInfo(task.promise, { time: task.time }),
            (task.timed = !0),
            pushDebugInfo(task.promise, componentDebugInfo);
        prepareToUseHooksForComponent(prevThenableState, componentDebugInfo);
        result = task.debugTask
          ? task.debugTask.run(function () {
              return componentStorage.run(
                componentDebugInfo,
                callComponentInDEV,
                Component,
                props,
                componentDebugInfo
              );
            })
          : componentStorage.run(
              componentDebugInfo,
              callComponentInDEV,
              Component,
              props,
              componentDebugInfo
            );
        debugOwner = componentDebugInfo;
      }
      if (request.status === ABORTING$1 || request.status === CLOSED$1)
        throw (
          (null === result ||
            "object" !== typeof result ||
            isClientReference(result) ||
            "function" !== typeof result.then ||
            result.then(noop, noop),
          request.fatalError)
        );
      if (
        !isRendering &&
        ((prevThenableState = thenableState), null !== prevThenableState)
      )
        for (
          var stacks =
              prevThenableState._stacks || (prevThenableState._stacks = []),
            i = 0;
          i < prevThenableState.length;
          i++
        )
          forwardDebugInfoFromThenable(
            request,
            task,
            prevThenableState[i],
            debugOwner,
            stacks[i]
          );
      if (!isRendering) {
        if (
          null !== result &&
          "object" === typeof result &&
          !isClientReference(result) &&
          "function" === typeof result.then
        )
          if (
            ((prevThenableState = result),
            "fulfilled" === prevThenableState.status)
          )
            forwardDebugInfoFromThenable(request, task, prevThenableState),
              (result = prevThenableState.value);
          else if ("rejected" === prevThenableState.status)
            throw (
              (forwardDebugInfoFromThenable(request, task, prevThenableState),
              prevThenableState.reason)
            );
        task.debugOwner = debugOwner;
        task.debugStack = null;
        task.debugTask = null;
        null != result &&
          "object" === typeof result &&
          result.$$typeof === REACT_ELEMENT_TYPE &&
          (result._store.validated = 1);
      }
      debugOwner = task.keyPath;
      prevThenableState = task.implicitSlot;
      null !== key
        ? (task.keyPath =
            key === REACT_OPTIMISTIC_KEY || debugOwner === REACT_OPTIMISTIC_KEY
              ? REACT_OPTIMISTIC_KEY
              : null === debugOwner
                ? key
                : debugOwner + "," + key)
        : null === debugOwner && (task.implicitSlot = !0);
      if (isRendering)
        return (
          (element = renderModelDestructive$1(
            request,
            task,
            emptyRoot,
            "",
            result
          )),
          (task.keyPath = debugOwner),
          (task.implicitSlot = prevThenableState),
          element
        );
      if (
        null !== result &&
        "object" === typeof result &&
        !isClientReference(result) &&
        "function" === typeof result.then
      ) {
        result.then(function (resolvedValue) {
          null !== resolvedValue &&
            "object" === typeof resolvedValue &&
            resolvedValue.$$typeof === REACT_ELEMENT_TYPE &&
            (resolvedValue._store.validated = 1);
        }, noop);
        var expandedThenable = renderModelDestructive$1(
          request,
          task,
          emptyRoot,
          "",
          result
        );
        expandedThenable = createLazyWrapperAroundWakeable(expandedThenable);
        setRenderedModel(renderedModels, element, expandedThenable);
        task.keyPath = debugOwner;
        task.implicitSlot = prevThenableState;
        task.isModelReference = !0;
        return expandedThenable;
      }
      if (
        !(
          null === result ||
          "object" !== typeof result ||
          result.$$typeof === REACT_ELEMENT_TYPE ||
          isClientReference(result) ||
          isArrayImpl(result) ||
          result instanceof Map ||
          result instanceof Set
        )
      ) {
        var iteratorFn = getIteratorFn(result);
        if (iteratorFn) {
          var iterableChild = result;
          key = {};
          key =
            ((key[Symbol.iterator] = function () {
              var iterator = iteratorFn.call(iterableChild);
              iterator !== iterableChild ||
                ("[object GeneratorFunction]" ===
                  Object.prototype.toString.call(Component) &&
                  "[object Generator]" ===
                    Object.prototype.toString.call(iterableChild)) ||
                callWithDebugContextInDEV$1(
                  request,
                  task,
                  function () {
                    console.error(
                      "Returning an Iterator from a Server Component is not supported since it cannot be looped over more than once. "
                    );
                  },
                  void 0
                );
              return iterator;
            }),
            key);
          key._debugInfo = iterableChild._debugInfo;
          result = key;
        } else if (
          !(
            "function" !== typeof result[ASYNC_ITERATOR] ||
            ("function" === typeof ReadableStream &&
              result instanceof ReadableStream)
          )
        ) {
          var _iterableChild = result;
          key = {};
          key =
            ((key[ASYNC_ITERATOR] = function () {
              var iterator = _iterableChild[ASYNC_ITERATOR]();
              iterator !== _iterableChild ||
                ("[object AsyncGeneratorFunction]" ===
                  Object.prototype.toString.call(Component) &&
                  "[object AsyncGenerator]" ===
                    Object.prototype.toString.call(_iterableChild)) ||
                callWithDebugContextInDEV$1(
                  request,
                  task,
                  function () {
                    console.error(
                      "Returning an AsyncIterator from a Server Component is not supported since it cannot be looped over more than once. "
                    );
                  },
                  void 0
                );
              return iterator;
            }),
            key);
          key._debugInfo = _iterableChild._debugInfo;
          result = key;
        }
      }
      request.renderingComponents.set(element, result);
      try {
        return (
          (expandedThenable = renderModelDestructive$1(
            request,
            task,
            emptyRoot,
            "",
            result
          )),
          setRenderedModel(
            renderedModels,
            element,
            void 0 === expandedThenable ? UNDEFINED_MODEL : expandedThenable
          ),
          (task.keyPath = debugOwner),
          (task.implicitSlot = prevThenableState),
          expandedThenable
        );
      } finally {
        request.renderingComponents.delete(element);
      }
    }
    function renderElement(request, task, type, element) {
      for (;;) {
        var key = element.key,
          props = element.props,
          ref = props.ref;
        if (null !== ref && void 0 !== ref)
          throw Error(
            "Refs cannot be used in Server Components, nor passed to Client Components."
          );
        if (
          "function" === typeof type &&
          !isClientReference(type) &&
          type.$$typeof !== TEMPORARY_REFERENCE_TAG
        )
          return renderFunctionComponent(request, task, type, props, element);
        if (type === REACT_FRAGMENT_TYPE && null === key) {
          if (
            2 === element._store.validated ||
            request.unkeyedElements.has(element)
          )
            (type = {
              name: "Fragment",
              env: (0, request.environmentName)(),
              key: key,
              owner: task.debugOwner,
              stack:
                null === task.debugStack
                  ? null
                  : filterStackTrace$1(
                      request,
                      parseStackTrace(task.debugStack, 1)
                    ),
              props: props,
              debugStack: task.debugStack,
              debugTask: task.debugTask
            }),
              warnForMissingKey(request, key, type, task.debugTask);
          type = task.implicitSlot;
          key = getRenderedModels(
            request,
            element,
            task.keyPath,
            task.implicitSlot
          );
          null === task.keyPath && (task.implicitSlot = !0);
          request = renderModelDestructive$1(
            request,
            task,
            emptyRoot,
            "",
            props.children
          );
          setRenderedModel(
            key,
            element,
            void 0 === request ? UNDEFINED_MODEL : request
          );
          task.implicitSlot = type;
          return request;
        }
        if (null == type || "object" !== typeof type || isClientReference(type))
          "string" === typeof type &&
            ((key = task.formatContext),
            (ref = getChildFormatContext(key, type, props)),
            key !== ref &&
              null != props.children &&
              outlineModelWithFormatContext(request, props.children, ref));
        else
          switch (type.$$typeof) {
            case REACT_LAZY_TYPE:
              props = callLazyInitInDEV(type);
              if (request.status === ABORTING$1 || request.status === CLOSED$1)
                throw request.fatalError;
              type = props;
              continue;
            case REACT_FORWARD_REF_TYPE:
              return renderFunctionComponent(
                request,
                task,
                type.render,
                props,
                element
              );
            case REACT_MEMO_TYPE:
              type = type.type;
              continue;
          }
        props = type;
        type = element.key;
        ref = element.props;
        key = task.keyPath;
        null === type
          ? (type = key)
          : null !== key &&
            (type =
              key === REACT_OPTIMISTIC_KEY || type === REACT_OPTIMISTIC_KEY
                ? REACT_OPTIMISTIC_KEY
                : key + "," + type);
        task.implicitSlot && (element._store.validated = 1);
        jsxPropsParents.set(ref, props);
        "object" === typeof ref.children &&
          null !== ref.children &&
          jsxChildrenParents.set(ref.children, props);
        props = {
          $$typeof: REACT_ELEMENT_TYPE,
          type: props,
          key: type,
          props: ref,
          _owner: void 0 === element._owner ? null : element._owner,
          _store: element._store
        };
        Object.defineProperties(props, {
          ref: { value: null },
          _debugInfo: { value: null, writable: !0 },
          _debugStack: {
            value: void 0 === element._debugStack ? null : element._debugStack,
            writable: !0
          },
          _debugTask: {
            value: void 0 === element._debugTask ? null : element._debugTask,
            writable: !0
          }
        });
        key = getRenderedModels(request, element, key, task.implicitSlot);
        ref = props;
        if (task.implicitSlot && null !== type) {
          type = [props];
          ref = [];
          setRenderedModel(request.modelEntries, type, ref);
          var _reference = task.currentReference;
          null !== _reference &&
            (setModelReference(request, type, _reference),
            setModelReference(request, props, {
              root: _reference.root,
              parent: _reference,
              key: "0"
            }));
          task.model = type;
        }
        setRenderedModel(key, element, ref);
        element = task.currentReference;
        task.fieldParentReference =
          ref !== props
            ? void 0
            : null === element
              ? null
              : {
                  root: element.root,
                  parent: element.parent,
                  key: element.key
                };
        task.keyPath = null;
        task.implicitSlot = !1;
        task.isModelReference = !1;
        return ref;
      }
    }
    function validateSymbol(value, parent, parentPropertyName) {
      var name = value.description;
      if (Symbol.for(name) !== value)
        throw Error(
          "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
            (name + ") cannot be found among global symbols.") +
            describeObjectForErrorMessage(parent, parentPropertyName)
        );
    }
    function createTask$1(
      request,
      model,
      keyPath,
      implicitSlot,
      formatContext
    ) {
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
        status: PENDING$1,
        formatContext: formatContext,
        isModelReference: !1,
        ping: function () {
          return pingTask$1(request, task);
        },
        thenableState: null,
        keyPath: keyPath,
        implicitSlot: implicitSlot,
        timed: !1
      };
      task.time = request.timeOrigin;
      promise._debugInfo = [];
      task.environmentName = request.environmentName();
      task.debugOwner = null;
      task.debugStack = null;
      task.debugTask = null;
      request.abortableTasks.add(task);
      return task;
    }
    function pingTask$1(request, task) {
      if (request.status !== CLOSED$1 && task.status === PENDING$1) {
        task.timed = !0;
        var pingedTasks = request.pingedTasks;
        pingedTasks.push(task);
        1 === pingedTasks.length &&
          (request.type === PRERENDER || request.status === OPENING$1
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
        formatContext.status === COMPLETED$1
          ? formatContext.model
          : formatContext.promise;
      null !== value &&
        "object" === typeof value &&
        setRenderedModel(
          request.modelEntries,
          value,
          void 0 === model ? UNDEFINED_MODEL : model
        );
      formatContext.status !== COMPLETED$1 &&
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
      return outlineModelWithFormatContext(request, value, NO_SCOPE);
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
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: thenable,
        _init: readThenable
      };
    }
    function erroredTask$1(request, task, error) {
      task.status = ERRORED$1;
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
      error instanceof Error
        ? ((request = outlineModel$1(request, error)),
          (error =
            null !== request && "object" === typeof request
              ? request.$$typeof === RESULT_MODEL_TYPE
                ? request
                : null
              : null),
          null !== error
            ? error.then(task.reject, task.reject)
            : task.reject(request))
        : task.reject(error);
    }
    function logRecoverableError$1(request, error) {
      var task =
          2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null,
        prevCache = setCurrentCache(null);
      try {
        var onError = request.onError;
        var errorDigest =
          null !== task
            ? cacheStorage.run(void 0, function () {
                return requestStorage.run(
                  void 0,
                  callWithDebugContextInDEV$1,
                  request,
                  task,
                  onError,
                  error
                );
              })
            : cacheStorage.run(void 0, function () {
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
      request.status !== CLOSED$1 &&
        ((request.status = ABORTING$1),
        (request.fatalError = error),
        request.cacheController.abort(error),
        finishAbort$1(request, error),
        request.onFatalError(error));
    }
    function renderThenable(request, task, value) {
      if ("pending_weak" === value.status)
        return renderWeakThenable(request, task, value);
      var newTask = createTask$1(
        request,
        value,
        task.keyPath,
        task.implicitSlot,
        task.formatContext
      );
      newTask.environmentName = task.environmentName;
      newTask.time = task.time;
      newTask.timed = task.timed;
      newTask.debugOwner = task.debugOwner;
      newTask.debugStack = task.debugStack;
      newTask.debugTask = task.debugTask;
      setRenderedModel(
        getRenderedModels(request, value, task.keyPath, task.implicitSlot),
        value,
        newTask.promise
      );
      switch (value.status) {
        case "fulfilled":
          forwardDebugInfoFromThenable(request, newTask, value);
          newTask.model = value.value;
          pingTask$1(request, newTask);
          break;
        case "rejected":
          forwardDebugInfoFromThenable(request, newTask, value);
          try {
            erroredTask$1(request, newTask, value.reason);
          } catch (error) {
            fatalError$1(request, error);
          }
          break;
        default:
          request.status === ABORTING$1
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
                  newTask.status === PENDING$1 &&
                    (forwardDebugInfoFromCurrentContext(
                      request,
                      newTask,
                      value
                    ),
                    (newTask.model = fulfilledValue),
                    pingTask$1(request, newTask));
                },
                function (reason) {
                  if (newTask.status === PENDING$1) {
                    forwardDebugInfoFromCurrentContext(request, newTask, value);
                    try {
                      erroredTask$1(request, newTask, reason);
                    } catch (error$11) {
                      fatalError$1(request, error$11);
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
      value,
      parentReference
    ) {
      task.model = value;
      if (
        null !== value &&
        "object" === typeof value &&
        void 0 !== getValueReference(request.result, value)
      )
        return renderModelReference(task, value);
      if (
        null !== value &&
        ("object" === typeof value || "function" === typeof value)
      ) {
        if (isClientReference(value)) return renderModelReference(task, value);
        if (isServerReference(value))
          return renderModelReference(
            task,
            renderServerReference(request, value)
          );
        if (void 0 !== request.temporaryReferences) {
          var _reference2 = request.temporaryReferences.get(value);
          if (void 0 !== _reference2)
            return (
              setTemporaryReference(request.result, value, _reference2),
              renderModelReference(task, value)
            );
        }
      }
      "string" === typeof value || "bigint" === typeof value
        ? ((_reference2 = TaintRegistryValues$1.get(value)),
          void 0 !== _reference2 && throwTaintViolation$1(_reference2.message))
        : null === value ||
          ("object" !== typeof value && "function" !== typeof value) ||
          ((_reference2 = TaintRegistryObjects$1.get(value)),
          void 0 !== _reference2 && throwTaintViolation$1(_reference2));
      if (null === value || "object" !== typeof value) {
        "string" === typeof value &&
          1024 <= value.length &&
          (value = value.toWellFormed());
        if (
          "string" === typeof value &&
          "Z" === value[value.length - 1] &&
          parent[parentPropertyName] instanceof Date
        )
          return renderModelReference(task, new Date(value));
        if ("function" === typeof value) {
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
              ((task = value.displayName || value.name || "Component"),
              Error(
                "Functions are not valid as a child of Client Components. This may happen if you return " +
                  task +
                  " instead of <" +
                  task +
                  " /> from render. Or maybe you meant to call this function rather than return it." +
                  describeObjectForErrorMessage(parent, parentPropertyName)
              ))
            );
          throw Error(
            'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.' +
              describeObjectForErrorMessage(parent, parentPropertyName)
          );
        }
        "symbol" === typeof value &&
          validateSymbol(value, parent, parentPropertyName);
        return value;
      }
      _reference2 = getRenderedModels(
        request,
        value,
        task.keyPath,
        task.implicitSlot
      );
      var modelEntry = _reference2.get(value),
        existingModel = void 0 === modelEntry ? void 0 : modelEntry.model,
        elementType = value.$$typeof,
        canReference =
          elementType === REACT_ELEMENT_TYPE
            ? null === task.keyPath && !task.implicitSlot
            : (isArrayImpl(value) && null === task.keyPath) ||
              value instanceof Map ||
              value instanceof Set ||
              getPrototypeOf$1(value) === ObjectPrototype$1,
        referenceEntry = canReference
          ? _reference2 === request.modelEntries
            ? modelEntry
            : request.modelEntries.get(value)
          : void 0,
        reference =
          void 0 === referenceEntry || void 0 === referenceEntry.root
            ? void 0
            : referenceEntry;
      if (
        canReference &&
        void 0 !== reference &&
        reference.root !== task.promise &&
        void 0 !== existingModel &&
        "function" !== typeof value.then
      )
        return renderModelReference(
          task,
          createResultValueReference(request, reference)
        );
      if (void 0 !== existingModel) {
        if (
          elementType === REACT_ELEMENT_TYPE &&
          "string" === typeof existingModel &&
          void 0 !== modelEntry &&
          void 0 !== modelEntry.root &&
          modelRoot$1 !== value
        )
          return renderModelReference(
            task,
            createResultValueReference(request, modelEntry)
          );
        existingModel === UNDEFINED_MODEL && (existingModel = void 0);
        if (request.hasByValueModels && existingModel !== task.promise) {
          var outlinedModels = request.outlinedModels;
          if (null !== outlinedModels) {
            var dependency = outlinedModels.get(existingModel);
            if (void 0 !== dependency && dependency.status === COMPLETED$1)
              existingModel = dependency.model;
            else if (dependency === task && task.status === RENDERING$1)
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
        if (modelRoot$1 === value) {
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
        (parentReference =
          parent === emptyRoot
            ? task.currentReference
            : getModelReference(request, parent));
      void 0 === reference &&
        null != parentReference &&
        -1 === parentPropertyName.indexOf(":") &&
        (canReference
          ? ((existingModel = {
              model: void 0 === referenceEntry ? void 0 : referenceEntry.model,
              root: parentReference.root,
              parent:
                parent === emptyRoot ? parentReference.parent : parentReference,
              key:
                parent === emptyRoot ? parentReference.key : parentPropertyName
            }),
            request.modelEntries.set(value, existingModel),
            (reference = existingModel),
            _reference2 === request.modelEntries &&
              (modelEntry = existingModel))
          : (reference =
              parent === emptyRoot
                ? parentReference
                : {
                    root: parentReference.root,
                    parent: parentReference,
                    key: parentPropertyName
                  }));
      task.currentReference = void 0 === reference ? null : reference;
      if (elementType === REACT_ELEMENT_TYPE) {
        if (modelDepth > MAX_MODEL_DEPTH) return deferTask$1(request, task);
        parentReference = value;
        if ((modelEntry = parentReference._debugInfo)) {
          if (!canEmitDebugInfo) return outlineTask(request, task);
          forwardDebugInfo$1(request, task, modelEntry);
        }
        task.debugOwner = parentReference._owner;
        task.debugStack = parentReference._debugStack;
        task.debugTask = parentReference._debugTask;
        if (
          void 0 === parentReference._owner ||
          void 0 === parentReference._debugStack ||
          void 0 === parentReference._debugTask
        )
          (modelEntry = ""),
            null !== parentReference.key &&
              parentReference.key !== REACT_OPTIMISTIC_KEY &&
              (modelEntry = ' key="' + parentReference.key + '"'),
            console.error(
              "Attempted to render <%s%s> without development properties. This is not supported. It can happen if:\n- The element is created with a production version of React but rendered in development.\n- The element was cloned with a custom function instead of `React.cloneElement`.\nThe props of this element may help locate this element: %o",
              parentReference.type,
              modelEntry,
              parentReference.props
            );
        request = renderElement(
          request,
          task,
          parentReference.type,
          parentReference
        );
        "string" === typeof request &&
          void 0 !== reference &&
          ((parentReference = _reference2.get(value)),
          void 0 !== parentReference &&
            _reference2.set(
              value,
              createModelEntry(parentReference.model, reference)
            ));
        null !== request &&
          "object" === typeof request &&
          null != reference &&
          request.$$typeof === REACT_ELEMENT_TYPE &&
          null === task.fieldParentReference &&
          (task.fieldParentReference = {
            root: reference.root,
            parent: reference.parent,
            key: reference.key
          });
        return request;
      }
      if (elementType === REACT_LAZY_TYPE) {
        if (modelDepth > MAX_MODEL_DEPTH) return deferTask$1(request, task);
        reference = value;
        task.thenableState = null;
        _reference2 = callLazyInitInDEV(reference);
        if (request.status === ABORTING$1 || request.status === CLOSED$1)
          throw request.fatalError;
        if ((reference = reference._debugInfo)) {
          if (!canEmitDebugInfo) return outlineTask(request, task);
          forwardDebugInfo$1(request, task, reference);
        }
        return renderModelDestructive$1(
          request,
          task,
          parent,
          parentPropertyName,
          _reference2,
          parentReference
        );
      }
      if (elementType === REACT_LEGACY_ELEMENT_TYPE)
        throw Error(
          'A React Element from an older version of React was rendered. This is not supported. It can happen if:\n- Multiple copies of the "react" package is used.\n- A library pre-bundled an old copy of "react" or "react/jsx-runtime".\n- A compiler tries to "inline" JSX instead of using the runtime.'
        );
      if (isArrayImpl(value)) return renderFragment(request, task, value);
      if ("function" === typeof value.then)
        return renderModelReference(task, renderThenable(request, task, value));
      if (value instanceof Date)
        return (
          (request = value),
          renderModelReference(
            task,
            isSimpleDate(request)
              ? new Date(dateGetTime.call(request))
              : new Date("" + request.toJSON())
          )
        );
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
        return (
          (request =
            value instanceof ArrayBuffer ? new Uint8Array(value) : value),
          TaintRegistryByteLengths$1.has(request.byteLength) &&
            ((request = TaintRegistryValues$1.get(
              binaryToComparableString(request)
            )),
            void 0 !== request && throwTaintViolation$1(request.message)),
          renderModelReference(task, value)
        );
      if (value instanceof Map)
        return renderModelReference(task, renderMap(request, task, value));
      if (value instanceof Set)
        return renderModelReference(task, renderSet(request, task, value));
      parentReference = getPrototypeOf$1(value);
      if (parentReference !== ObjectPrototype$1) {
        if ("function" === typeof FormData && value instanceof FormData)
          return renderModelReference(
            task,
            renderFormData(request, task, value)
          );
        if (value instanceof Error)
          return renderModelReference(
            task,
            renderErrorValue(request, task, value)
          );
        if ("function" === typeof Blob && value instanceof Blob)
          return renderModelReference(task, renderBlob(request, task, value));
      }
      if ((reference = getIteratorFn(value)))
        return (
          (_reference2 = reference.call(value)),
          _reference2 === value
            ? renderModelReference(
                task,
                renderIterator(request, task, _reference2)
              )
            : renderFragment(request, task, Array.from(_reference2), value)
        );
      if (
        "function" === typeof ReadableStream &&
        value instanceof ReadableStream
      )
        return renderModelReference(
          task,
          renderReadableStream(request, task, value)
        );
      reference = value[ASYNC_ITERATOR];
      if ("function" === typeof reference)
        return (
          (request = renderAsyncFragment(request, task, value, reference)),
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
      if ("Object" !== objectName(value))
        callWithDebugContextInDEV$1(request, task, function () {
          console.error(
            "Only plain objects can be passed to Client Components from Server Components. %s objects are not supported.%s",
            objectName(value),
            describeObjectForErrorMessage(parent, parentPropertyName)
          );
        });
      else if (!isSimpleObject(value))
        callWithDebugContextInDEV$1(request, task, function () {
          console.error(
            "Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.%s",
            describeObjectForErrorMessage(parent, parentPropertyName)
          );
        });
      else if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(value);
        0 < symbols.length &&
          callWithDebugContextInDEV$1(request, task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. Objects with symbol properties like %s are not supported.%s",
              symbols[0].description,
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
      }
      parentReference = {};
      _reference2 !== request.modelEntries
        ? setRenderedModel(request.modelEntries, value, parentReference)
        : void 0 === modelEntry
          ? request.modelEntries.set(
              value,
              createModelEntry(parentReference, void 0)
            )
          : (modelEntry.model = parentReference);
      task.isModelReference = !1;
      task.fieldParentReference = void 0;
      return parentReference;
    }
    function resolveModel$1(
      request,
      task,
      parent,
      parentPropertyName,
      value,
      parentReference,
      renderedRoot
    ) {
      modelDepth++;
      var prevOwner = task.debugOwner,
        prevStack = task.debugStack,
        prevDebugTask = task.debugTask;
      try {
        var jsonValue = value;
        if (
          null !== value &&
          "object" === typeof value &&
          !isServerReference(value) &&
          "function" === typeof value.toJSON
        ) {
          var tainted = TaintRegistryObjects$1.get(value);
          void 0 !== tainted && throwTaintViolation$1(tainted);
          if (value instanceof Date && isSimpleDate(value)) {
            var time = dateGetTime.call(value);
            if (!Number.isNaN(time)) {
              var _tainted3 = TaintRegistryValues$1.get(
                dateToISOString.call(value)
              );
              void 0 !== _tainted3 && throwTaintViolation$1(_tainted3.message);
            }
            task.resolvedModelInfo = 0;
            return renderModelReference(
              task,
              Number.isNaN(time) ? null : new Date(time)
            );
          }
          jsonValue = value.toJSON(parentPropertyName);
        }
        var originalValue = parent[parentPropertyName];
        "object" !== typeof originalValue ||
          originalValue === jsonValue ||
          originalValue instanceof Date ||
          callWithDebugContextInDEV$1(request, task, function () {
            ArrayBuffer.isView(originalValue)
              ? console.error(
                  "Binary data with a toJSON method, such as a Node.js Buffer, is serialized through toJSON instead of as binary. Pass a Uint8Array or ArrayBuffer to send binary data.%s",
                  describeObjectForErrorMessage(parent, parentPropertyName)
                )
              : "Object" !== objectName(originalValue)
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
        var rendered =
          void 0 !== renderedRoot && jsonValue === value
            ? renderedRoot
            : renderModel$1(
                request,
                task,
                parent,
                parentPropertyName,
                jsonValue,
                parentReference
              );
        if (
          void 0 !== renderedRoot &&
          ((task.renderedModel = rendered), jsonValue !== value)
        ) {
          var outlinedModels = request.outlinedModels;
          null === outlinedModels &&
            (request.outlinedModels = outlinedModels = new WeakMap());
          outlinedModels.set(renderedRoot, task);
          request.hasByValueModels = !0;
        }
        if (task.isModelReference)
          return (
            (task.resolvedModelInfo =
              null !== rendered && "object" === typeof rendered
                ? getModelInfo(request.result, rendered)
                : 0),
            rendered
          );
        if (null === rendered || "object" !== typeof rendered)
          return (task.resolvedModelInfo = 0), rendered;
        var resolvingModelStack = request.resolvingModelStack;
        resolvingModelStack.push(rendered);
        null !== request.resolvingModels &&
          request.resolvingModels.add(rendered);
        try {
          return resolveModelFields(request, task, rendered);
        } finally {
          resolvingModelStack.pop(),
            null !== request.resolvingModels &&
              request.resolvingModels.delete(rendered);
        }
      } finally {
        modelDepth--,
          (task.debugOwner = prevOwner),
          (task.debugStack = prevStack),
          (task.debugTask = prevDebugTask);
      }
    }
    function renderModel$1(
      request,
      task,
      parent,
      parentPropertyName,
      value,
      parentReference
    ) {
      var prevKeyPath = task.keyPath,
        prevImplicitSlot = task.implicitSlot;
      try {
        return renderModelDestructive$1(
          request,
          task,
          parent,
          parentPropertyName,
          value,
          parentReference
        );
      } catch (thrownValue) {
        if (request.status === CLOSED$1) throw request.fatalError;
        parent =
          request.status === ABORTING$1
            ? request.fatalError
            : thrownValue === SuspenseException
              ? getSuspendedThenable()
              : thrownValue;
        parentPropertyName = task.model;
        if (
          null !== parentPropertyName &&
          "object" === typeof parentPropertyName &&
          (parentPropertyName.$$typeof === REACT_ELEMENT_TYPE ||
            parentPropertyName.$$typeof === REACT_LAZY_TYPE)
        ) {
          parentReference = createTask$1(
            request,
            parentPropertyName,
            task.keyPath,
            task.implicitSlot,
            task.formatContext
          );
          parentReference.environmentName = task.environmentName;
          parentReference.debugOwner = task.debugOwner;
          parentReference.debugStack = task.debugStack;
          parentReference.debugTask = task.debugTask;
          var lazy = createLazyWrapperAroundWakeable(parentReference.promise);
          setModelReference(
            request,
            parentPropertyName,
            parentReference.reference
          );
          if (parentPropertyName.$$typeof === REACT_ELEMENT_TYPE) {
            var renderedModels = getRenderedModels(
              request,
              parentPropertyName,
              task.keyPath,
              task.implicitSlot
            );
            void 0 === getRenderedModel(renderedModels, parentPropertyName) &&
              setRenderedModel(renderedModels, parentPropertyName, lazy);
          }
          value !== parentPropertyName &&
            null !== value &&
            "object" === typeof value &&
            value.$$typeof === REACT_ELEMENT_TYPE &&
            setRenderedModel(
              getRenderedModels(request, value, prevKeyPath, prevImplicitSlot),
              value,
              lazy
            );
          task.keyPath = prevKeyPath;
          task.implicitSlot = prevImplicitSlot;
          request.status === ABORTING$1
            ? abortTask$1(request, parentReference)
            : null != parent &&
                "object" === typeof parent &&
                "function" === typeof parent.then
              ? ((request = parentReference.ping),
                parent.then(request, request),
                (parentReference.thenableState =
                  getThenableStateAfterSuspending()))
              : erroredTask$1(request, parentReference, parent);
          return renderModelReference(task, lazy);
        }
        task.keyPath = prevKeyPath;
        task.implicitSlot = prevImplicitSlot;
        parentReference = createTask$1(
          request,
          parentPropertyName,
          prevKeyPath,
          prevImplicitSlot,
          task.formatContext
        );
        parentReference.environmentName = task.environmentName;
        parentReference.debugOwner = task.debugOwner;
        parentReference.debugStack = task.debugStack;
        parentReference.debugTask = task.debugTask;
        parentReference.resolve = resolveBoxedModel.bind(
          null,
          parentReference.resolve
        );
        null !== parentPropertyName &&
          "object" === typeof parentPropertyName &&
          setModelReference(request, parentPropertyName, {
            root: parentReference.promise,
            parent: parentReference.reference,
            key: "value"
          });
        parentPropertyName = request.outlinedModels;
        null === parentPropertyName &&
          (request.outlinedModels = parentPropertyName = new WeakMap());
        parentPropertyName.set(parentReference.promise, parentReference);
        request.hasByValueModels = !0;
        addModelDependency(task, parentReference.promise);
        markErroredModel(
          request,
          parentReference,
          value,
          prevKeyPath,
          prevImplicitSlot
        );
        request.status === ABORTING$1
          ? abortTask$1(request, parentReference)
          : null != parent &&
              "object" === typeof parent &&
              "function" === typeof parent.then
            ? ((parentReference.thenableState =
                getThenableStateAfterSuspending()),
              (value = parentReference.ping),
              parent.then(value, value))
            : erroredTask$1(request, parentReference, parent);
        request = createResultValueReference(request, {
          root: parentReference.promise,
          parent: parentReference.reference,
          key: "value"
        });
        parentPropertyName.set(request, parentReference);
        return renderModelReference(task, request);
      }
    }
    function resolveModelFields(request, task, rendered) {
      var model = task.model,
        parentReference = task.fieldParentReference,
        prevKeyPath = task.keyPath,
        prevImplicitSlot = task.implicitSlot;
      if (rendered.$$typeof === REACT_ELEMENT_TYPE) {
        var prevDependencies = task.modelDependencies;
        task.modelDependencies = null;
        task.keyPath = null;
        task.implicitSlot = !1;
        try {
          rendered.type = resolveModel$1(
            request,
            task,
            rendered,
            "type",
            rendered.type,
            parentReference
          );
          rendered.props = resolveModel$1(
            request,
            task,
            rendered,
            "props",
            rendered.props,
            parentReference
          );
          var resolved = renderOutlinedElement(
            request,
            task,
            rendered,
            model,
            prevKeyPath,
            prevImplicitSlot,
            task.modelDependencies
          );
          setModelInfo(request.result, rendered, 3);
          task.resolvedModelInfo = resolved === rendered ? 3 : 0;
          return resolved;
        } catch (error) {
          throw (
            (markErroredModel(
              request,
              task,
              rendered,
              prevKeyPath,
              prevImplicitSlot,
              rendered
            ),
            error)
          );
        } finally {
          task.modelDependencies = prevDependencies;
        }
      }
      if (isArrayImpl(rendered)) {
        task.keyPath = null;
        task.implicitSlot = !1;
        try {
          for (
            var _directlyReusable = !0,
              noEagerDependencies = !0,
              jsonWork = 1,
              localWork = 1,
              i = 0;
            i < model.length;
            i++
          )
            if (i in model) {
              prevDependencies = "" + i;
              var child = resolveModel$1(
                  request,
                  task,
                  model,
                  prevDependencies,
                  model[i],
                  parentReference
                ),
                _info2 = task.resolvedModelInfo;
              rendered[i] = child;
              (resolved =
                null !== child &&
                ("object" === typeof child || "function" === typeof child)) &&
                0 === (_info2 & 4) &&
                (_directlyReusable = !1);
              resolved &&
                0 === (_info2 & 20) &&
                3 !== (_info2 & 3) &&
                (noEagerDependencies = !1);
              var childWork = getJSONValueWork(child, _info2);
              localWork +=
                prevDependencies.length + 1 + (resolved ? 0 : childWork);
              0 !== jsonWork &&
                ((jsonWork += prevDependencies.length + 1 + childWork),
                0 === childWork || 33554431 < jsonWork) &&
                (jsonWork = 0);
            } else (_directlyReusable = !1), (jsonWork = 0);
          rendered.length = model.length;
          var _info = packModelInfo(
            2 | (_directlyReusable ? 4 : 0) | (noEagerDependencies ? 16 : 0),
            jsonWork
          );
          setModelInfo(request.result, rendered, _info);
          task.resolvedModelInfo = _info;
          request.result.jsonWorkCredit += localWork;
          return rendered;
        } catch (error$12) {
          throw (
            (markErroredModel(
              request,
              task,
              model,
              prevKeyPath,
              prevImplicitSlot
            ),
            error$12)
          );
        }
      }
      task.keyPath = null;
      task.implicitSlot = !1;
      try {
        _info2 = child = !0;
        _info = childWork = 1;
        for (_directlyReusable in model)
          hasOwnProperty.call(model, _directlyReusable) &&
            ((noEagerDependencies = resolveModel$1(
              request,
              task,
              model,
              _directlyReusable,
              model[_directlyReusable],
              parentReference
            )),
            (jsonWork = task.resolvedModelInfo),
            (prevDependencies =
              null !== noEagerDependencies &&
              ("object" === typeof noEagerDependencies ||
                "function" === typeof noEagerDependencies)) &&
              0 === (jsonWork & 4) &&
              (child = !1),
            prevDependencies &&
              0 === (jsonWork & 20) &&
              3 !== (jsonWork & 3) &&
              (_info2 = !1),
            (localWork = getJSONValueWork(noEagerDependencies, jsonWork)),
            (_info +=
              _directlyReusable.length +
              1 +
              (prevDependencies ? 0 : localWork)),
            0 !== childWork &&
              ((childWork += _directlyReusable.length + 1 + localWork),
              0 === localWork || 33554431 < childWork) &&
              (childWork = 0),
            "__proto__" === _directlyReusable
              ? Object.defineProperty(rendered, _directlyReusable, {
                  value: noEagerDependencies,
                  enumerable: !0,
                  writable: !0,
                  configurable: !0
                })
              : (rendered[_directlyReusable] = noEagerDependencies));
        i = packModelInfo(1 | (child ? 4 : 0) | (_info2 ? 16 : 0), childWork);
        setModelInfo(request.result, rendered, i);
        task.resolvedModelInfo = i;
        request.result.jsonWorkCredit += _info;
        return rendered;
      } catch (error$13) {
        throw (
          (markErroredModel(
            request,
            task,
            model,
            prevKeyPath,
            prevImplicitSlot
          ),
          error$13)
        );
      }
    }
    function retryTask$1(request, task) {
      if (request.status !== CLOSED$1 && task.status === PENDING$1) {
        task.status = RENDERING$1;
        var originalModel = task.model,
          originalKeyPath = task.keyPath,
          originalImplicitSlot = task.implicitSlot,
          prevCanEmitDebugInfo = canEmitDebugInfo;
        task.currentReference = task.reference;
        try {
          modelRoot$1 = task.model;
          canEmitDebugInfo = !0;
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
            forwardsDebugInfo = (canEmitDebugInfo = !1);
          if (
            null !== rendered &&
            "object" === typeof rendered &&
            rendered.$$typeof === REACT_LAZY_TYPE &&
            0 === getModelInfo(request.result, rendered)
          ) {
            var _outlinedModels = request.outlinedModels;
            forwardsDebugInfo =
              null === _outlinedModels ||
              !_outlinedModels.has(rendered._payload);
          }
          if (!forwardsDebugInfo) {
            var currentEnv = request.environmentName();
            currentEnv !== task.environmentName &&
              pushDebugInfo(task.promise, { env: currentEnv });
            task.timed &&
              markOperationEndTime$1(request, task, performance.now());
          }
          var resolvedModel =
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
          if (request.status !== CLOSED$1) {
            validateDeferredBlobs(request);
            var outlinedModels = request.outlinedModels;
            (null !== outlinedModels &&
              waitForOutlinedModel(
                request,
                task,
                resolvedModel,
                outlinedModels
              )) ||
              completeTask(request, task, resolvedModel);
          }
        } catch (thrownValue) {
          if (request.status >= ABORTING$1)
            request.status === ABORTING$1 && abortTask$1(request, task);
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
              task.status = PENDING$1;
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
          try {
            validateDeferredBlobs(request);
          } finally {
            canEmitDebugInfo = prevCanEmitDebugInfo;
          }
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
      for (
        var source =
            3 < arguments.length && void 0 !== arguments[3]
              ? arguments[3]
              : children,
          i = 0;
        i < children.length;
        i++
      ) {
        var child = children[i];
        null !== child &&
          "object" === typeof child &&
          child.$$typeof === REACT_ELEMENT_TYPE &&
          (null !== child.key ||
            child._store.validated ||
            request.unkeyedElements.add(child));
      }
      i = task.keyPath;
      if (null !== i) {
        child = {
          $$typeof: REACT_ELEMENT_TYPE,
          type: REACT_FRAGMENT_TYPE,
          key: i,
          props: { children: children },
          _owner: null,
          _store: { validated: 0 }
        };
        Object.defineProperties(child, {
          ref: { value: null },
          _debugInfo: { value: null, writable: !0 },
          _debugStack: { value: null, writable: !0 },
          _debugTask: { value: null, writable: !0 }
        });
        if (task.implicitSlot) {
          child = [child];
          var copy = [];
          setRenderedModel(request.modelEntries, child, copy);
          task.model = child;
          child = copy;
        }
        task.fieldParentReference = null;
        setRenderedModel(
          getRenderedModels(request, source, i, task.implicitSlot),
          source,
          child
        );
      } else
        (i = Array(children.length)),
          setRenderedModel(request.modelEntries, children, i),
          source !== children &&
            setRenderedModel(request.modelEntries, source, i),
          (task.model = children),
          (child = i),
          (task.fieldParentReference = source === children ? void 0 : null);
      task.isModelReference = !1;
      return child;
    }
    function performWork$1(request) {
      if (request.status !== CLOSED$1) {
        pendingOperations.delete(async_hooks.executionAsyncId());
        var prevDispatcher = ReactSharedInternalsServer.H;
        ReactSharedInternalsServer.H = HooksDispatcher;
        var prevCache = setCurrentCache(request);
        currentRequest$1 = request;
        try {
          var pingedTasks = request.pingedTasks;
          request.pingedTasks = [];
          for (var i = 0; i < pingedTasks.length; i++)
            retryTask$1(request, pingedTasks[i]);
        } catch (error) {
          fatalError$1(request, error);
        } finally {
          modelRoot$1 = null;
          pingedTasks = request.completedElements;
          for (i = 0; i < pingedTasks.length; i++)
            Object.freeze(pingedTasks[i].props), Object.freeze(pingedTasks[i]);
          pingedTasks.length = 0;
          request.status !== CLOSED$1 &&
            0 === request.abortableTasks.size &&
            ((request.status = CLOSED$1),
            closeResult(request),
            cleanupTaintQueue$1(request),
            request.cacheController.abort(
              Error(
                "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
              )
            ),
            request.onAllReady());
          ReactSharedInternalsServer.H = prevDispatcher;
          currentRequest$1 = null;
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
        request.status === OPENING$1 && (request.status = OPEN$1);
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
    function createResultValueReference(request, reference) {
      var JSCompiler_temp_const = request.result;
      if (
        null !== reference.parent ||
        hasOwnProperty.call(reference, "model")
      ) {
        var JSCompiler_inline_result = request.publishedModelReferences;
        null === JSCompiler_inline_result &&
          (request.publishedModelReferences = JSCompiler_inline_result =
            new WeakMap());
        request = JSCompiler_inline_result.get(reference);
        if (void 0 !== request) JSCompiler_inline_result = request;
        else {
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
                  JSCompiler_inline_result.set(reference, published))
                : (published = reference);
              break;
            }
            request.push(reference);
            reference = published;
            published = JSCompiler_inline_result.get(reference);
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
                JSCompiler_inline_result.set(source, published))
              : (published = source);
          }
          JSCompiler_inline_result = published;
        }
      } else JSCompiler_inline_result = reference;
      request = JSCompiler_temp_const.valueReferences;
      null === request &&
        (JSCompiler_temp_const.valueReferences = request = new WeakSet());
      request.add(JSCompiler_inline_result);
      return JSCompiler_inline_result;
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
    function getModelReference(request, value) {
      request = request.modelEntries.get(value);
      return void 0 === request || void 0 === request.root ? void 0 : request;
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
          request.modelEntries.set(
            value,
            createModelEntry(entry.model, reference)
          );
    }
    function resolveBoxedModel(resolve, model) {
      resolve({ value: model });
    }
    function markErroredModel(request, task, model, keyPath, implicitSlot) {
      var rendered =
        5 < arguments.length && void 0 !== arguments[5] ? arguments[5] : void 0;
      if (null !== model && "object" === typeof model) {
        var models = getRenderedModels(request, model, keyPath, implicitSlot);
        rendered =
          void 0 === rendered ? getRenderedModel(models, model) : rendered;
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
      null === dependencies &&
        (task.modelDependencies = dependencies = new Set());
      dependencies.add(promise);
    }
    function getOutlinedModelDependencies(request, model, outlinedModels) {
      function visit(value, parent) {
        if (null !== value && "object" === typeof value) {
          var outlinedTask = outlinedModels.get(value);
          if (void 0 !== outlinedTask)
            null !== parent &&
              outlinedTask.status !== COMPLETED$1 &&
              parent.dependencies.add(outlinedTask.promise);
          else if (((outlinedTask = cache.get(value)), void 0 !== outlinedTask))
            null !== parent &&
              null !== outlinedTask &&
              "fulfilled" !== outlinedTask.status &&
              parent.dependencies.add(outlinedTask);
          else if (
            ((outlinedTask = records.get(value)), void 0 !== outlinedTask)
          )
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
              var _dependencies = record.dependencies;
              _dependencies.forEach(function (dependency) {
                "fulfilled" === dependency.status &&
                  _dependencies.delete(dependency);
              });
              if (1 === _dependencies.size)
                _dependencies.forEach(function (dependency) {
                  record.ready = dependency;
                });
              else if (1 < _dependencies.size) {
                var ready = createResultModel();
                record.ready = ready;
                var remaining = _dependencies.size;
                _dependencies.forEach(function (dependency) {
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
            !isServerReference(value) &&
            void 0 === getTemporaryReference(request.result, value) &&
            void 0 === getValueReference(request.result, value))
        )
          if (
            3 === kind ||
            (0 === kind && value.$$typeof === REACT_ELEMENT_TYPE)
          )
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
                if (
                  "function" === typeof FormData &&
                  value instanceof FormData
                ) {
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
                if (value instanceof Error) {
                  "cause" in value && visit(value.cause, record);
                  "undefined" !== typeof AggregateError &&
                    value instanceof AggregateError &&
                    visit(value.errors, record);
                  return;
                }
              }
              kind = Object.keys(value);
              for (var _i2 = 0; _i2 < kind.length; _i2++)
                visit(value[kind[_i2]], record);
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
          ? ownTask.status !== COMPLETED$1 && dependencies.add(ownTask.promise)
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
            isServerReference(value) ||
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
                Object.is(child, value[dependency]) ||
                  (value[dependency] = child);
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
              0 === dependency
                ? getIteratorEntries(request.result, value)
                : void 0;
            if (0 === dependency && value instanceof Error)
              return (
                "cause" in value &&
                  ((dependency = resolve(value.cause)),
                  Object.is(dependency, value.cause) ||
                    (value.cause = dependency)),
                "undefined" !== typeof AggregateError &&
                  value instanceof AggregateError &&
                  ((dependency = resolve(value.errors)),
                  dependency !== value.errors && (value.errors = dependency)),
                value
              );
            if (void 0 !== child) return resolve(child), value;
            dependency = Object.keys(value);
            for (child = 0; child < dependency.length; child++) {
              var key = dependency[child],
                _child2 = resolve(value[key]);
              Object.is(_child2, value[key]) || (value[key] = _child2);
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
    function renderOutlinedElement(
      request,
      task,
      element,
      model,
      keyPath,
      implicitSlot,
      dependencies
    ) {
      var outlinedModels = request.outlinedModels;
      if (null !== outlinedModels && null !== dependencies) {
        var newTask = createTask$1(
          request,
          element,
          null,
          !1,
          task.formatContext
        );
        newTask.environmentName = task.environmentName;
        newTask.debugOwner = task.debugOwner;
        newTask.debugStack = task.debugStack;
        newTask.debugTask = task.debugTask;
        blockTask(request, newTask, element, dependencies);
        dependencies = createLazyWrapperAroundWakeable(newTask.promise);
        outlinedModels.set(element, newTask);
        outlinedModels.set(newTask.promise, newTask);
        null !== model &&
          "object" === typeof model &&
          setRenderedModel(
            getRenderedModels(request, model, keyPath, implicitSlot),
            model,
            dependencies
          );
        newTask.promise.then(function () {
          Object.freeze(element.props);
          Object.freeze(element);
        }, noop);
        return renderModelReference(task, dependencies);
      }
      request.completedElements.push(element);
      return element;
    }
    function waitForOutlinedModel(request, task, model, outlinedModels) {
      outlinedModels = getOutlinedModelDependencies(
        request,
        model,
        outlinedModels
      );
      if (0 === outlinedModels.size) return !1;
      blockTask(request, task, model, outlinedModels);
      return !0;
    }
    function blockTask(request, task, model, dependencies) {
      task.model = model;
      task.status = BLOCKED;
      null !== model &&
        "object" === typeof model &&
        model.$$typeof === REACT_ELEMENT_TYPE &&
        (task.promise._debugModel = model);
      if (request.status === ABORTING$1) abortTask$1(request, task);
      else {
        var remaining = dependencies.size;
        dependencies.forEach(function (dependency) {
          function reject(error) {
            task.status === BLOCKED &&
              (copyErrorReference(request.result, task.promise, dependency),
              (task.status = ERRORED$1),
              task.reject(error),
              request.abortableTasks.delete(task),
              scheduleMicrotask(function () {
                return performWork$1(request);
              }));
          }
          function resolve() {
            if (task.status === BLOCKED && 0 === --remaining) {
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
      task.status = COMPLETED$1;
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
          var unsubscribeDebugInfo = noop,
            unsubscribeSource = subscribeToDebugInfo(source, function (info) {
              forwardDebugInfo$1(request, task, [info]);
            }),
            unsubscribeResult = subscribeToResult(
              request.result,
              unsubscribeSource
            );
          unsubscribeDebugInfo = function () {
            unsubscribeSource();
            unsubscribeResult();
          };
          source.then(
            function (value) {
              unsubscribeDebugInfo();
              task.resolve(value);
            },
            function (error) {
              unsubscribeDebugInfo();
              copyErrorReference(request.result, task.promise, source);
              task.reject(error);
            }
          );
          request.abortableTasks.delete(task);
          return;
        }
      }
      task.resolve(resolvedModel);
      request.abortableTasks.delete(task);
    }
    function recordAsyncDebugInfo(request, task, info) {
      request = request.debugIONodes.get(info.awaited);
      if (void 0 === request)
        throw Error("Missing Result I/O metadata. This is a bug in React.");
      request = { awaited: request };
      void 0 !== info.env && (request.env = info.env);
      void 0 !== info.owner && (request.owner = info.owner);
      void 0 !== info.stack && (request.stack = info.stack);
      pushDebugInfo(task.promise, request);
    }
    function captureDebugThenable(request, thenable) {
      var existing = request.debugThenables.get(thenable);
      if (void 0 !== existing) return existing;
      var value = createResultModel();
      value._debugSource = thenable;
      request.debugThenables.set(thenable, value);
      if ("fulfilled" === thenable.status)
        fulfillResultModel(value, thenable.value);
      else if ("rejected" === thenable.status)
        rejectResultModel(value, thenable.reason);
      else {
        var owner = request.result;
        thenable.then(
          function (resolved) {
            if (null !== owner) {
              var result = owner;
              owner = null;
              (isArrayImpl(resolved) && 200 < resolved.length) ||
              (ArrayBuffer.isView(resolved) && 1e3 < resolved.byteLength)
                ? (markHalted(result, value), rejectResultModel(value, null))
                : fulfillResultModel(value, resolved);
            }
          },
          function (reason) {
            null !== owner &&
              ((owner = null), rejectResultModel(value, reason));
          }
        );
        Promise.resolve().then(function () {
          if (null !== owner) {
            var result = owner;
            owner = null;
            markHalted(result, value);
            rejectResultModel(value, null);
          }
        });
      }
      return value;
    }
    function isPromiseCreationInternal(url, functionName) {
      if ("node:internal/async_hooks" === url) return !0;
      if ("" !== url) return !1;
      switch (functionName) {
        case "new Promise":
        case "Function.withResolvers":
        case "Promise.withResolvers":
        case "Function.reject":
        case "Promise.reject":
        case "Function.resolve":
        case "Promise.resolve":
        case "Function.all":
        case "Promise.all":
        case "Function.allSettled":
        case "Promise.allSettled":
        case "Function.race":
        case "Promise.race":
        case "Function.try":
        case "Promise.try":
          return !0;
        default:
          return !1;
      }
    }
    function hasUnfilteredFrame(request, stack) {
      request = request.filterStackFrame;
      for (var i = 0; i < stack.length; i++) {
        var callsite = stack[i],
          functionName = callsite[0],
          url = devirtualizeURL$1(callsite[1]),
          lineNumber = callsite[2],
          columnNumber = callsite[3];
        if (
          !callsite[6] &&
          request(url, functionName, lineNumber, columnNumber) &&
          "" !== url
        )
          return !0;
      }
      return !1;
    }
    function visitAsyncNode(
      request,
      task$jscomp$0,
      node$jscomp$0,
      visited$jscomp$0,
      cutOff$jscomp$0
    ) {
      for (
        var chain = [];
        null !== node$jscomp$0 && !visited$jscomp$0.has(node$jscomp$0);

      )
        chain.push(node$jscomp$0), (node$jscomp$0 = node$jscomp$0.previous);
      var previousIONode =
        null !== node$jscomp$0 ? visited$jscomp$0.get(node$jscomp$0) : null;
      for (
        node$jscomp$0 = chain.length - 1;
        0 <= node$jscomp$0;
        node$jscomp$0--
      ) {
        var n = chain[node$jscomp$0];
        visited$jscomp$0.set(n, null);
        var result = request;
        var task = task$jscomp$0,
          node = n,
          visited = visited$jscomp$0,
          cutOff = cutOff$jscomp$0;
        if (0 <= node.end && node.end <= result.timeOrigin) result = null;
        else
          switch (node.tag) {
            case 0:
              result = node;
              break;
            case 3:
              result = previousIONode;
              break;
            case 1:
              var awaited = node.awaited,
                promise = node.promise.deref();
              if (null !== awaited)
                if (
                  ((cutOff = visitAsyncNode(
                    result,
                    task,
                    awaited,
                    visited,
                    cutOff
                  )),
                  void 0 === cutOff)
                ) {
                  result = void 0;
                  break;
                } else
                  null !== cutOff
                    ? (previousIONode =
                        1 === cutOff.tag
                          ? cutOff
                          : (null !== node.stack &&
                                hasUnfilteredFrame(result, node.stack)) ||
                              (void 0 !== promise &&
                                "string" === typeof promise.displayName &&
                                (null === cutOff.stack ||
                                  !hasUnfilteredFrame(result, cutOff.stack)))
                            ? node
                            : cutOff)
                    : result.status === ABORTING$1 &&
                      node.start < result.abortTime &&
                      node.end > result.abortTime &&
                      ((null !== node.stack &&
                        hasUnfilteredFrame(result, node.stack)) ||
                        (void 0 !== promise &&
                          "string" === typeof promise.displayName)) &&
                      (previousIONode = node);
              void 0 !== promise &&
                ((node = promise._debugInfo),
                null == node ||
                  visited.has(node) ||
                  (visited.set(node, null),
                  forwardDebugInfo$1(result, task, node)));
              result = previousIONode;
              break;
            case 4:
              result = previousIONode;
              break;
            case 2:
              awaited = node.awaited;
              if (null !== awaited)
                if (
                  ((promise = visitAsyncNode(
                    result,
                    task,
                    awaited,
                    visited,
                    cutOff
                  )),
                  void 0 === promise)
                ) {
                  result = void 0;
                  break;
                } else if (null !== promise) {
                  var startTime = node.start,
                    endTime = node.end;
                  startTime < cutOff
                    ? ((previousIONode = promise),
                      null !== node.stack &&
                        isAwaitInUserspace$2(
                          result.filterStackFrame,
                          node.stack
                        ) &&
                        void 0 !==
                          (null === awaited.promise
                            ? void 0
                            : awaited.promise.deref()) &&
                        serializeIONode(result, promise, awaited.promise))
                    : null !== node.stack &&
                        isAwaitInUserspace$2(
                          result.filterStackFrame,
                          node.stack
                        )
                      ? (result.status === ABORTING$1 &&
                          startTime > result.abortTime) ||
                        (serializeIONode(result, promise, awaited.promise),
                        visited.set(promise, null),
                        (cutOff = (0, result.environmentName)()),
                        advanceTaskTime(result, task, startTime),
                        recordAsyncDebugInfo(result, task, {
                          awaited: promise,
                          env: cutOff,
                          owner: node.owner,
                          stack:
                            null === node.stack
                              ? null
                              : filterStackTrace$1(result, node.stack)
                        }),
                        markOperationEndTime$1(result, task, endTime),
                        result.status === ABORTING$1 &&
                          (previousIONode = void 0))
                      : (previousIONode = promise);
                }
              node = node.promise.deref();
              void 0 !== node &&
                ((node = node._debugInfo),
                null == node ||
                  visited.has(node) ||
                  (visited.set(node, null),
                  forwardDebugInfo$1(result, task, node)));
              result = previousIONode;
              break;
            default:
              throw Error("Unknown AsyncSequence tag. This is a bug in React.");
          }
        null !== result && visited$jscomp$0.set(n, result);
        if (void 0 === result) return;
        previousIONode = result;
      }
      return previousIONode;
    }
    function emitAsyncSequence(
      request,
      task,
      node,
      alreadyForwardedDebugInfo,
      owner,
      stack
    ) {
      var visited = new Map();
      alreadyForwardedDebugInfo && visited.set(alreadyForwardedDebugInfo, null);
      node = visitAsyncNode(request, task, node, visited, task.time);
      void 0 !== node &&
        null !== node &&
        (serializeIONode(request, node, node.promise),
        (alreadyForwardedDebugInfo = (0, request.environmentName)()),
        (alreadyForwardedDebugInfo = {
          awaited: node,
          env: alreadyForwardedDebugInfo
        }),
        null === owner && null === stack
          ? (null !== task.debugOwner &&
              (alreadyForwardedDebugInfo.owner = task.debugOwner),
            null !== task.debugStack &&
              (alreadyForwardedDebugInfo.stack = filterStackTrace$1(
                request,
                parseStackTrace(task.debugStack, 1)
              )))
          : (null != owner && (alreadyForwardedDebugInfo.owner = owner),
            null != stack &&
              (alreadyForwardedDebugInfo.stack = filterStackTrace$1(
                request,
                parseStackTrace(stack, 1)
              ))),
        advanceTaskTime(request, task, task.time),
        recordAsyncDebugInfo(request, task, alreadyForwardedDebugInfo),
        markOperationEndTime$1(request, task, node.end));
    }
    function serializeIONode(request, ioNode, promiseRef) {
      var existingRef = request.debugIONodes.get(ioNode);
      if (void 0 !== existingRef) return existingRef;
      existingRef = null;
      var name = "";
      if (null !== ioNode.promise) {
        var promise = ioNode.promise.deref();
        void 0 !== promise &&
          "string" === typeof promise.displayName &&
          (name = promise.displayName);
      }
      if (null !== ioNode.stack) {
        a: {
          existingRef = ioNode.stack;
          for (promise = 0; promise < existingRef.length; promise++) {
            var callsite = existingRef[promise];
            if (!isPromiseCreationInternal(callsite[1], callsite[0])) {
              promise = 0 < promise ? existingRef.slice(promise) : existingRef;
              break a;
            }
          }
          promise = [];
        }
        existingRef = filterStackTrace$1(request, promise);
        if ("" === name) {
          a: {
            name = promise;
            promise = "";
            callsite = request.filterStackFrame;
            for (var i = 0; i < name.length; i++) {
              var callsite$jscomp$0 = name[i],
                functionName = callsite$jscomp$0[0],
                url = devirtualizeURL$1(callsite$jscomp$0[1]);
              if (
                callsite(
                  url,
                  functionName,
                  callsite$jscomp$0[2],
                  callsite$jscomp$0[3]
                ) &&
                "" !== url
              ) {
                if ("" === promise) {
                  name = functionName;
                  break a;
                }
                name = promise;
                break a;
              } else promise = functionName;
            }
            name = "";
          }
          name.startsWith("Window.")
            ? (name = name.slice(7))
            : name.startsWith("<anonymous>.") && (name = name.slice(7));
        }
      }
      callsite = ioNode.owner;
      promise = void 0;
      null !== promiseRef && (promise = promiseRef.deref());
      promiseRef = (0, request.environmentName)();
      promiseRef = {
        name: name,
        start: ioNode.start,
        end: 3 === ioNode.tag ? request.abortTime : ioNode.end,
        env: promiseRef,
        owner: callsite,
        stack: existingRef
      };
      void 0 !== promise &&
        (promiseRef.value = captureDebugThenable(request, promise));
      request.debugIONodes.set(ioNode, promiseRef);
      return promiseRef;
    }
    function advanceTaskTime(request, task, timestamp) {
      timestamp > task.time
        ? (recordTimingInfo(task, timestamp), (task.time = timestamp))
        : task.timed || recordTimingInfo(task, task.time);
      task.timed = !0;
    }
    function forwardDebugInfoFromThenable(request, task, thenable) {
      var owner =
          3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null,
        stack =
          4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : null,
        debugInfo = thenable._debugInfo;
      debugInfo && forwardDebugInfo$1(request, task, debugInfo);
      var sequence = getAsyncSequenceFromPromise(thenable);
      null !== sequence &&
        emitAsyncSequence(request, task, sequence, debugInfo, owner, stack);
    }
    function forwardDebugInfoFromCurrentContext(request, task, thenable) {
      (thenable = thenable._debugInfo) &&
        forwardDebugInfo$1(request, task, thenable);
      var sequence = getCurrentAsyncSequence();
      null !== sequence &&
        emitAsyncSequence(request, task, sequence, thenable, null, null);
    }
    function recordTimingInfo(task, time) {
      pushDebugInfo(task.promise, { time: time });
    }
    function markOperationEndTime$1(request, task, timestamp) {
      (request.status === ABORTING$1 && timestamp > request.abortTime) ||
        (timestamp > task.time
          ? (recordTimingInfo(task, timestamp), (task.time = timestamp))
          : recordTimingInfo(task, task.time));
    }
    function forwardDebugInfo$1(request, task, debugInfo) {
      for (var i = 0; i < debugInfo.length; i++) {
        var info = debugInfo[i];
        "number" === typeof info.time
          ? markOperationEndTime$1(request, task, info.time)
          : (info.awaited && info.awaited.end <= request.timeOrigin) ||
            pushDebugInfo(task.promise, info);
      }
    }
    function outlineTask(request, task) {
      var source = task.model,
        renderedModels = getRenderedModels(
          request,
          source,
          task.keyPath,
          task.implicitSlot
        ),
        newTask = createTask$1(
          request,
          task.model,
          task.keyPath,
          task.implicitSlot,
          task.formatContext
        );
      null !== task.model &&
        "object" === typeof task.model &&
        setModelReference(request, task.model, newTask.reference);
      newTask.time = task.time;
      newTask.debugOwner = task.debugOwner;
      newTask.debugStack = task.debugStack;
      newTask.debugTask = task.debugTask;
      retryTask$1(request, newTask);
      request =
        "fulfilled" === newTask.promise.status
          ? createResultValueReference(request, newTask.reference)
          : createLazyWrapperAroundWakeable(newTask.promise);
      null !== source &&
        "object" === typeof source &&
        setRenderedModel(renderedModels, source, request);
      return renderModelReference(task, request);
    }
    function deferTask$1(request, task) {
      var newTask = createTask$1(
        request,
        task.model,
        task.keyPath,
        task.implicitSlot,
        task.formatContext
      );
      newTask.time = task.time;
      newTask.debugOwner = task.debugOwner;
      newTask.debugStack = task.debugStack;
      newTask.debugTask = task.debugTask;
      var lazy = createLazyWrapperAroundWakeable(newTask.promise),
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
      var model = task.model;
      if ("object" === typeof model && null !== model) {
        var debugInfo;
        (debugInfo = model._debugInfo) &&
          forwardDebugInfo$1(request, task, debugInfo);
        var thenable = null;
        "function" === typeof model.then
          ? (thenable = model)
          : model.$$typeof === REACT_LAZY_TYPE &&
            ((model = model._payload),
            "function" === typeof model.then && (thenable = model));
        if (
          null !== thenable &&
          ((model = getAsyncSequenceFromPromise(thenable)), null !== model)
        ) {
          for (
            thenable = model;
            4 === thenable.tag && null !== thenable.awaited;

          )
            thenable = thenable.awaited;
          3 === thenable.tag
            ? (serializeIONode(request, thenable, null),
              (debugInfo = (0, request.environmentName)()),
              (debugInfo = { awaited: thenable, env: debugInfo }),
              advanceTaskTime(request, task, task.time),
              recordAsyncDebugInfo(request, task, debugInfo))
            : emitAsyncSequence(request, task, model, debugInfo, null, null);
        }
      }
      task.status = ABORTED$1;
      request.type === PRERENDER
        ? markHalted(request.result, task.promise)
        : ((debugInfo = request.abortModel),
          null !== debugInfo &&
            copyErrorReference(request.result, task.promise, debugInfo),
          task.reject(request.fatalError));
      request.abortableTasks.delete(task);
    }
    function finishAbort$1(request, error) {
      var preserveRendering =
        2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : !1;
      request.abortableTasks.forEach(function (task) {
        preserveRendering
          ? task.status !== RENDERING$1 &&
            (request.type === PRERENDER
              ? (task.status = ABORTED$1)
              : abortTask$1(request, task))
          : ((task.status = ABORTED$1),
            task.reject(error),
            request.abortableTasks.delete(task));
      });
      request.pingedTasks.length = 0;
      request.type === PRERENDER &&
      preserveRendering &&
      0 < request.abortableTasks.size
        ? setImmediate(function () {
            return finishAbortedTasks(request);
          })
        : 0 === request.abortableTasks.size &&
          ((request.status = CLOSED$1),
          closeResult(request),
          cleanupTaintQueue$1(request));
    }
    function renderAsyncIterable(request, task, iterable, iterator) {
      function progress(entry) {
        if (streamTask.status === PENDING$1) {
          var entryTask = createTask$1(
            request,
            entry.value,
            null,
            !1,
            entry.done ? NO_SCOPE : streamTask.formatContext
          );
          entryTask.environmentName = streamTask.environmentName;
          entryTask.debugOwner = entry.done ? null : streamTask.debugOwner;
          entryTask.debugStack = entry.done ? null : streamTask.debugStack;
          entryTask.debugTask = entry.done ? null : streamTask.debugTask;
          entry.done
            ? ((streamTask.status = COMPLETED$1),
              request.abortableTasks.delete(streamTask),
              request.cacheController.signal.removeEventListener(
                "abort",
                abortIterable
              ),
              controller.close(entryTask.promise))
            : controller.enqueue(entryTask.promise);
          request.pingedTasks.push(entryTask);
          performWork$1(request);
          entry.done || streamTask.status !== PENDING$1 || next();
        }
      }
      function throwIntoIterator(reason) {
        if ("function" === typeof iterator.throw)
          try {
            iterator.throw(reason).then(noop, noop);
          } catch (x) {}
      }
      function error(reason) {
        if (streamTask.status === PENDING$1) {
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
            controller.error(callbackError),
              fatalError$1(request, callbackError);
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
        request.type === PRERENDER
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
          callIteratorInDEV(iterator, progress, error);
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
        );
      streamTask.environmentName = task.environmentName;
      streamTask.debugOwner = task.debugOwner;
      streamTask.debugStack = task.debugStack;
      streamTask.debugTask = task.debugTask;
      var resolvedIterable = controller.iterable;
      setRenderedModel(request.modelEntries, iterable, resolvedIterable);
      setAsyncIterable(request.result, controller);
      request.cacheController.signal.addEventListener("abort", abortIterable);
      next();
      return resolvedIterable;
    }
    function renderAsyncFragment(request, task, children, getAsyncIterator) {
      var keyPath = task.keyPath,
        implicitSlot = task.implicitSlot;
      task.keyPath = null;
      task.implicitSlot = !1;
      var existingIterable = getRenderedModel(request.modelEntries, children);
      task =
        void 0 === existingIterable || existingIterable === task.promise
          ? renderAsyncIterable(
              request,
              task,
              children,
              getAsyncIterator.call(children)
            )
          : existingIterable;
      return null !== keyPath
        ? ((task = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: REACT_FRAGMENT_TYPE,
            key: keyPath,
            props: { children: task },
            _owner: null,
            _store: { validated: 0 }
          }),
          Object.defineProperties(task, {
            ref: { value: null },
            _debugInfo: { value: null, writable: !0 },
            _debugStack: { value: null, writable: !0 },
            _debugTask: { value: null, writable: !0 }
          }),
          request.completedElements.push(task),
          (task = implicitSlot ? [task] : task),
          setRenderedModel(
            getRenderedModels(request, children, keyPath, implicitSlot),
            children,
            task
          ),
          task)
        : task;
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
      if (!(request.status > OPEN$1))
        try {
          request.status = ABORTING$1;
          request.abortTime = performance.now();
          request.cacheController.abort(reason);
          if (request.type === PRERENDER) finishAbort$1(request, reason, !0);
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
                  : reason;
            request.fatalError = error;
            if (0 < request.abortableTasks.size) {
              var digest = logRecoverableError$1(request, error),
                abortModel = createResultModel();
              request.abortModel = abortModel;
              request.result.errorReferences.set(abortModel, {
                digest: digest
              });
              rejectResultModel(abortModel, error);
            }
            finishAbort$1(request, error, !0);
          }
          if (request.status === CLOSED$1) request.onAllReady();
        } catch (error$14) {
          fatalError$1(request, error$14);
        }
    }
    function createPrerenderRequest(
      model,
      onAllReady,
      onFatalError,
      onError,
      identifierPrefix,
      temporaryReferences,
      createServerReference,
      environmentName,
      filterStackFrame,
      debugStartTime
    ) {
      resetOwnerStackLimit();
      return new RequestInstance$1(
        model,
        onError,
        identifierPrefix,
        temporaryReferences,
        createServerReference,
        PRERENDER,
        onAllReady,
        onFatalError,
        environmentName,
        filterStackFrame,
        debugStartTime
      );
    }
    function finishAbortedTasks(request) {
      request.abortableTasks.forEach(function (task) {
        task.status === ABORTED$1 && abortTask$1(request, task);
      });
      0 === request.abortableTasks.size &&
        request.status !== CLOSED$1 &&
        ((request.status = CLOSED$1),
        closeResult(request),
        cleanupTaintQueue$1(request),
        request.onAllReady());
    }
    function renderMap(request, task, map) {
      function populate(values) {
        for (var i = 0; i < values.length; i++)
          copy.set(values[i][0], values[i][1]);
      }
      if (task.formatContext !== NO_SCOPE) return outlineModel$1(request, map);
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
      if (task.formatContext !== NO_SCOPE) return outlineModel$1(request, set);
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
    function renderFormData(request, task, formData) {
      if (task.formatContext !== NO_SCOPE)
        return outlineModel$1(request, formData);
      var entries = Array.from(formData.entries()),
        hasBlob = !1,
        hasOutlinedEntry = !1;
      setRenderedModel(request.modelEntries, formData, formData);
      task.keyPath = null;
      task.implicitSlot = !1;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i],
          key = resolveModel$1(request, task, entry, "0", entry[0]),
          value = resolveModel$1(request, task, entry, "1", entry[1]);
        "string" !== typeof entry[1] && (hasBlob = !0);
        if (key !== entry[0] || value !== entry[1])
          (hasOutlinedEntry = !0), (entry[0] = key), (entry[1] = value);
      }
      hasBlob &&
        ((task = request.result),
        (hasBlob = task.formDataWithBlobs),
        null === hasBlob && (task.formDataWithBlobs = hasBlob = new WeakSet()),
        hasBlob.add(formData));
      hasOutlinedEntry && blockModelOnDependencies(request, formData, entries);
      return formData;
    }
    function blockModelOnDependencies(request, model, dependencyModel) {
      var outlinedModels = request.outlinedModels;
      if (
        null !== outlinedModels &&
        ((dependencyModel = getOutlinedModelDependencies(
          request,
          dependencyModel,
          outlinedModels
        )),
        0 < dependencyModel.size)
      ) {
        var newTask = createTask$1(request, model, null, !1, NO_SCOPE);
        outlinedModels.set(model, newTask);
        blockTask(request, newTask, model, dependencyModel);
      }
    }
    function renderIterator(request, task, iterator) {
      if (task.formatContext !== NO_SCOPE)
        return outlineModel$1(request, iterator);
      var existingModel = getRenderedModel(request.modelEntries, iterator);
      if (void 0 !== existingModel && existingModel !== task.promise)
        return existingModel;
      existingModel = Array.from(iterator);
      var copy = [],
        resolvedIterator = copy.values();
      setRenderedModel(request.modelEntries, iterator, resolvedIterator);
      iterator = request.result;
      var iteratorEntries = iterator.iteratorEntries;
      null === iteratorEntries &&
        (iterator.iteratorEntries = iteratorEntries = new WeakMap());
      iteratorEntries.set(resolvedIterator, copy);
      task.keyPath = null;
      task.implicitSlot = !1;
      task.debugOwner = null;
      task.debugStack = null;
      task.debugTask = null;
      for (iterator = 0; iterator < existingModel.length; iterator++)
        copy[iterator] = resolveModel$1(
          request,
          task,
          existingModel,
          "" + iterator,
          existingModel[iterator]
        );
      return resolvedIterator;
    }
    function renderErrorValue(request, task, error) {
      if (task.formatContext !== NO_SCOPE)
        return outlineModel$1(request, error);
      var isAggregateError =
          "undefined" !== typeof AggregateError &&
          error instanceof AggregateError,
        name = "Error",
        env = (0, request.environmentName)();
      try {
        name = error.name;
        var message = String(error.message);
        var stack = filterStackTrace$1(request, parseStackTrace(error, 0));
        var errorEnv = error.environmentName;
        "string" === typeof errorEnv && (env = errorEnv);
        if ("cause" in error || isAggregateError) var rawStack = error.stack;
      } catch (x) {
        (message =
          "An error occurred but serializing the error message failed."),
          (stack = []),
          (rawStack = "");
      }
      stack = { name: name, message: message, stack: stack, env: env };
      errorEnv = error;
      if ("cause" in error || isAggregateError) {
        var descriptors = Object.getOwnPropertyDescriptors(error);
        delete descriptors.message;
        delete descriptors.cause;
        "cause" in error &&
          (descriptors.cause = { value: null, configurable: !0, writable: !0 });
        isAggregateError && delete descriptors.errors;
        descriptors.name = { value: name, configurable: !0, writable: !0 };
        descriptors.stack = { value: rawStack, configurable: !0, writable: !0 };
        descriptors.environmentName = {
          value: env,
          configurable: !0,
          writable: !0
        };
        errorEnv = isAggregateError
          ? new AggregateError([], message)
          : Error(message);
        Object.setPrototypeOf(errorEnv, getPrototypeOf$1(error));
        Object.defineProperties(errorEnv, descriptors);
      }
      setRenderedModel(request.modelEntries, error, errorEnv);
      task.keyPath = null;
      task.implicitSlot = !1;
      task.debugOwner = null;
      task.debugStack = null;
      task.debugTask = null;
      "cause" in error &&
        (errorEnv.cause = outlineModel$1(request, error.cause));
      isAggregateError &&
        (errorEnv.errors = outlineModel$1(request, error.errors));
      task = resolveModel$1(request, task, emptyRoot, "", stack);
      blockModelOnDependencies(request, errorEnv, task);
      request = request.result;
      task = errorEnv;
      error = request.errorInfos;
      null === error && (error = request.errorInfos = new WeakMap());
      error.set(task, stack);
      return errorEnv;
    }
    function renderBlob(request, task, blob) {
      setRenderedModel(request.modelEntries, blob, blob);
      var newTask = createTask$1(request, blob, null, !1, NO_SCOPE);
      newTask.environmentName = task.environmentName;
      newTask.debugOwner = task.debugOwner;
      newTask.debugStack = task.debugStack;
      newTask.debugTask = task.debugTask;
      var outlinedModels = request.outlinedModels;
      null === outlinedModels &&
        (request.outlinedModels = outlinedModels = new WeakMap());
      outlinedModels.set(blob, newTask);
      request.hasByValueModels = !0;
      addModelDependency(task, newTask.promise);
      task = request.deferredBlobs;
      null === task ? (request.deferredBlobs = [newTask]) : task.push(newTask);
      return blob;
    }
    function validateBlob(request, newTask) {
      function progress(entry) {
        if (newTask.status === PENDING$1)
          if (entry.done)
            request.cacheController.signal.removeEventListener(
              "abort",
              abortBlob
            ),
              scheduleMicrotask(function () {
                return performWork$1(request);
              }),
              completeTask(request, newTask, blob);
          else
            return (
              (entry = entry.value),
              TaintRegistryByteLengths$1.has(entry.byteLength) &&
                ((entry = TaintRegistryValues$1.get(
                  binaryToComparableString(entry)
                )),
                void 0 !== entry && throwTaintViolation$1(entry.message)),
              reader.read().then(progress).catch(error)
            );
      }
      function error(reason) {
        if (newTask.status === PENDING$1) {
          request.cacheController.signal.removeEventListener(
            "abort",
            abortBlob
          );
          scheduleMicrotask(function () {
            return performWork$1(request);
          });
          try {
            erroredTask$1(request, newTask, reason);
          } catch (callbackError) {
            fatalError$1(request, callbackError);
          } finally {
            reader.cancel(reason).then(noop, noop);
          }
        }
      }
      function abortBlob() {
        var signal = request.cacheController.signal;
        signal.removeEventListener("abort", abortBlob);
        reader.cancel(signal.reason).then(noop, noop);
      }
      if (newTask.status === PENDING$1) {
        var blob = newTask.model;
        try {
          var taintedType = TaintRegistryValues$1.get(blob.type);
          void 0 !== taintedType && throwTaintViolation$1(taintedType.message);
          if (0 === TaintRegistryByteLengths$1.size) {
            completeTask(request, newTask, blob);
            return;
          }
        } catch (x) {
          erroredTask$1(request, newTask, x);
          return;
        }
        var reader = new Blob([blob], { type: blob.type }).stream().getReader();
        request.cacheController.signal.addEventListener("abort", abortBlob);
        reader.read().then(progress).catch(error);
      }
    }
    function validateDeferredBlobs(request) {
      var deferredBlobs = request.deferredBlobs;
      request.deferredBlobs = null;
      if (null !== deferredBlobs)
        for (var i = 0; i < deferredBlobs.length; i++)
          validateBlob(request, deferredBlobs[i]);
    }
    function renderServerReference(request, reference) {
      var existingReference = getRenderedModel(request.modelEntries, reference);
      if (void 0 !== existingReference) return existingReference;
      var id = reference.$$id;
      if ("function" !== typeof reference)
        return (
          setServerReference(request.result, reference, {
            id: id,
            bound: null,
            isObjectReference: !0
          }),
          setRenderedModel(request.modelEntries, reference, reference),
          reference
        );
      existingReference = reference.$$bound;
      var location = null,
        error = reference.$$location;
      error &&
        ((error = parseStackTrace(error, 1)),
        0 < error.length &&
          ((location = error[0]),
          (location = [location[0], location[1], location[2], location[3]])));
      id =
        null !== location
          ? {
              id: id,
              bound: null,
              isObjectReference: !1,
              name: reference.name,
              env: (0, request.environmentName)(),
              location: location
            }
          : { id: id, bound: null, isObjectReference: !1 };
      if (null === existingReference)
        return (
          setServerReference(request.result, reference, id),
          setRenderedModel(request.modelEntries, reference, reference),
          reference
        );
      existingReference = createTask$1(
        request,
        existingReference,
        null,
        !1,
        NO_SCOPE
      );
      existingReference.promise.then(noop, noop);
      location = request.createServerReference(
        reference,
        existingReference.promise
      );
      id.bound = existingReference.promise;
      setServerReference(request.result, location, id);
      setRenderedModel(request.modelEntries, reference, location);
      pingTask$1(request, existingReference);
      return location;
    }
    function renderReadableStream(request, task, stream) {
      function progress(entry) {
        if (streamTask.status === PENDING$1)
          if (entry.done)
            (streamTask.status = COMPLETED$1),
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
                  (entryTask.environmentName = streamTask.environmentName),
                  (entryTask.debugOwner = streamTask.debugOwner),
                  (entryTask.debugStack = streamTask.debugStack),
                  (entryTask.debugTask = streamTask.debugTask),
                  controller.enqueue(entryTask.promise),
                  tryStreamTask$1(request, entryTask);
              streamTask.status === PENDING$1 &&
                reader.read().then(progress, error);
            } catch (x$15) {
              error(x$15),
                null !== entryTask &&
                  entryTask.status === RENDERING$1 &&
                  (copyErrorReference(
                    request.result,
                    entryTask.promise,
                    streamTask.promise
                  ),
                  (entryTask.status = ERRORED$1),
                  entryTask.reject(x$15),
                  request.abortableTasks.delete(entryTask));
            }
          }
      }
      function error(reason) {
        if (streamTask.status === PENDING$1) {
          request.cacheController.signal.removeEventListener(
            "abort",
            abortStream
          );
          try {
            erroredTask$1(request, streamTask, reason),
              copyErrorReference(
                request.result,
                resolvedStream,
                streamTask.promise
              ),
              controller.error(reason);
          } catch (callbackError) {
            controller.error(callbackError),
              fatalError$1(request, callbackError);
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
        request.type === PRERENDER
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
        );
      streamTask.environmentName = task.environmentName;
      streamTask.debugOwner = task.debugOwner;
      streamTask.debugStack = task.debugStack;
      streamTask.debugTask = task.debugTask;
      var resolvedStream = controller.stream;
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
      currentRequest$1 = request;
      task.status = RENDERING$1;
      try {
        var model = resolveModel$1(request, task, emptyRoot, "", task.model);
        if (request.status !== CLOSED$1) {
          validateDeferredBlobs(request);
          var outlinedModels = request.outlinedModels;
          (null !== outlinedModels &&
            waitForOutlinedModel(request, task, model, outlinedModels)) ||
            completeTask(request, task, model);
        }
      } catch (error) {
        if (request.status === ABORTING$1) abortTask$1(request, task);
        else throw error;
      } finally {
        modelRoot$1 = null;
        try {
          var elements = request.completedElements;
          for (task = 0; task < elements.length; task++)
            Object.freeze(elements[task].props), Object.freeze(elements[task]);
          elements.length = 0;
          validateDeferredBlobs(request);
          request.status !== CLOSED$1 &&
            0 === request.abortableTasks.size &&
            ((request.status = CLOSED$1),
            closeResult(request),
            cleanupTaintQueue$1(request),
            request.cacheController.abort(
              Error(
                "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
              )
            ),
            request.onAllReady());
        } finally {
          (ReactSharedInternalsServer.H = prevDispatcher),
            (currentRequest$1 = null),
            setCurrentCache(prevCache);
        }
      }
    }
    function renderWeakThenable(request, task, thenable) {
      function createThenableTask(model) {
        settled = !0;
        weakModels.delete(promise);
        var newTask = createTask$1(
          request,
          model,
          keyPath,
          implicitSlot,
          formatContext
        );
        newTask.debugOwner = debugOwner;
        newTask.debugStack = debugStack;
        newTask.debugTask = debugTask;
        newTask.environmentName = environmentName;
        newTask.promise.then(
          function (value) {
            fulfillResultModel(promise, value);
          },
          function (error) {
            copyErrorReference(request.result, promise, newTask.promise);
            rejectResultModel(promise, error);
          }
        );
        return newTask;
      }
      var promise = createResultModel(!0),
        pendingWeakModels = request.pendingWeakModels;
      null === pendingWeakModels &&
        (request.pendingWeakModels = pendingWeakModels = new Set());
      pendingWeakModels.add(promise);
      var weakModels = pendingWeakModels,
        keyPath = task.keyPath,
        implicitSlot = task.implicitSlot,
        formatContext = task.formatContext,
        debugOwner = task.debugOwner,
        debugStack = task.debugStack,
        debugTask = task.debugTask,
        environmentName = task.environmentName;
      setRenderedModel(
        getRenderedModels(request, thenable, keyPath, implicitSlot),
        thenable,
        promise
      );
      var settled = !1;
      thenable.then(
        function (value) {
          settled ||
            request.status > OPEN$1 ||
            ((value = createThenableTask(value)), pingTask$1(request, value));
        },
        function (reason) {
          if (!(settled || request.status > OPEN$1)) {
            var newTask = createThenableTask(thenable);
            try {
              erroredTask$1(request, newTask, reason);
            } catch (error) {
              fatalError$1(request, error);
            }
            scheduleMicrotask(function () {
              return performWork$1(request);
            });
          }
        }
      );
      return promise;
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
    function warnForMissingKey(request, key, componentDebugInfo, debugTask) {
      function logKeyError() {
        console.error(
          'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
          "",
          ""
        );
      }
      key = request.didWarnForKey;
      null == key && (key = request.didWarnForKey = new WeakSet());
      request = componentDebugInfo.owner;
      if (null != request) {
        if (key.has(request)) return;
        key.add(request);
      }
      debugTask
        ? debugTask.run(
            componentStorage.run.bind(
              componentStorage,
              componentDebugInfo,
              callComponentInDEV,
              logKeyError,
              null,
              componentDebugInfo
            )
          )
        : componentStorage.run(
            componentDebugInfo,
            callComponentInDEV,
            logKeyError,
            null,
            componentDebugInfo
          );
    }
    function subscribeToThenable$1(result, thenable, reader) {
      function detach() {
        unsubscribeDebug();
        unsubscribeDebug = noop;
        JSCompiler_object_inline_reader_648 =
          JSCompiler_object_inline_result_647 = null;
        unsubscribe();
      }
      var unsubscribeDebug = noop,
        debug = reader.debug;
      if (void 0 !== debug) {
        var model = thenable.$$typeof === RESULT_MODEL_TYPE ? thenable : null;
        null !== model &&
          (unsubscribeDebug = subscribeToDebugInfo(model, debug));
      }
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
      var JSCompiler_object_inline_result_647 = result;
      var JSCompiler_object_inline_reader_648 = reader;
      var unsubscribe = noop;
      unsubscribe = subscribeToResult(result, function () {
        var current = JSCompiler_object_inline_reader_648,
          source = JSCompiler_object_inline_result_647;
        null !== current &&
          null !== source &&
          isHalted(source, thenable) &&
          (detach(), current.halt());
      });
      null !== JSCompiler_object_inline_reader_648 &&
        thenable.then(
          function (value) {
            var current = JSCompiler_object_inline_reader_648;
            null !== current && (detach(), current.resolve(value));
          },
          function (error) {
            var current = JSCompiler_object_inline_reader_648,
              source = JSCompiler_object_inline_result_647;
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
      var input = {
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
                  return subscribeToAsyncIterable(
                    result,
                    value,
                    source,
                    reader
                  );
                }
              };
        },
        getIteratorEntries: function (value) {
          return getIteratorEntries(result, value);
        },
        temporaryReferences: result.temporaryReferenceSet,
        getServerReference: function (value) {
          var serverReferences = result.serverReferences;
          return null === serverReferences
            ? void 0
            : serverReferences.get(value);
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
            JSCompiler_object_inline_reader_650 =
              JSCompiler_object_inline_queue_649 = null;
            unsubscribe();
            unsubscribeConsole();
          }
          function flushHints() {
            var queue = JSCompiler_object_inline_queue_649,
              current = JSCompiler_object_inline_reader_650;
            if (null !== queue && null !== current) {
              for (
                var hints = queue.completedHints;
                nextHintIndex < hints.length &&
                null !== JSCompiler_object_inline_reader_650;

              ) {
                var hint = hints[nextHintIndex++];
                current.hint(hint.code, hint.model);
              }
              queue.closed || waitForHints(queue).then(flushHints);
            }
          }
          var JSCompiler_object_inline_queue_649 = getHintQueue(result);
          var JSCompiler_object_inline_reader_650 = reader;
          var nextHintIndex = 0,
            unsubscribe = noop,
            unsubscribeConsole = noop;
          void 0 !== reader.console &&
            (unsubscribeConsole = subscribeToConsole(result, reader.console));
          unsubscribe = subscribeToResult(result, function () {
            var current = JSCompiler_object_inline_reader_650;
            null !== current && (flushHints(), detach(), current.complete());
          });
          flushHints();
          return detach;
        }
      };
      input.debugStartTime = result.root._debugStartTime;
      return input;
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
              active && reading
                ? (unsubscribeEntry = unsubscribe)
                : unsubscribe();
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
    function defaultFilterStackFrame(filename) {
      return (
        "" !== filename &&
        !filename.startsWith("node:") &&
        !filename.includes("node_modules")
      );
    }
    function filterStackTrace(request, stack) {
      request = request.filterStackFrame;
      for (var filteredStack = [], i = 0; i < stack.length; i++) {
        var callsite = stack[i],
          functionName = callsite[0];
        var url = callsite[1];
        if (url.startsWith("about://React/")) {
          var envIdx = url.indexOf("/", 14),
            suffixIdx = url.lastIndexOf("?");
          -1 < envIdx &&
            -1 < suffixIdx &&
            (url = decodeURI(url.slice(envIdx + 1, suffixIdx)));
        }
        request(url, functionName, callsite[2], callsite[3]) &&
          ((callsite = callsite.slice(0)),
          (callsite[1] = url),
          filteredStack.push(callsite));
      }
      return filteredStack;
    }
    function RequestInstance(
      input,
      bundlerConfig,
      onError,
      temporaryReferences,
      debugStartTime,
      environmentName,
      filterStackFrame,
      keepDebugAlive
    ) {
      var cleanupQueue = [];
      TaintRegistryPendingRequests.add(cleanupQueue);
      this.taintCleanupQueue = cleanupQueue;
      this.temporaryReferences =
        input.temporaryReferences || temporaryReferences;
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
      this.filterStackFrame =
        void 0 === filterStackFrame
          ? defaultFilterStackFrame
          : filterStackFrame;
      this.nextChunkId = this.jsonWorkSpent = this.pendingChunks = 0;
      this.abortableTasks = new Set();
      this.pingedTasks = [];
      this.debugDestination = null;
      this.deferredDebugObjects = keepDebugAlive
        ? { retained: new Map(), existing: new Map() }
        : null;
      this.writtenDebugObjects = new WeakMap();
      this.pendingDebugChunks = 0;
      this.completedDebugChunks = [];
      void 0 === debugStartTime && (debugStartTime = input.debugStartTime);
      this.timeOrigin =
        "number" === typeof debugStartTime
          ? debugStartTime - performance.timeOrigin
          : performance.now();
      this.abortTime = -0;
      emitTimeOriginChunk(this, this.timeOrigin + performance.timeOrigin);
      bundlerConfig = createTask(
        this,
        null,
        this.abortableTasks,
        this.timeOrigin
      );
      subscribeToInput(this, input, bundlerConfig);
    }
    function defaultErrorHandler(error) {
      console.error(error);
    }
    function createRequest(
      input,
      bundlerConfig,
      onError,
      temporaryReferences,
      debugStartTime,
      environmentName,
      filterStackFrame
    ) {
      return new RequestInstance(
        input,
        bundlerConfig,
        onError,
        temporaryReferences,
        debugStartTime,
        environmentName,
        filterStackFrame,
        7 < arguments.length && void 0 !== arguments[7] ? arguments[7] : !1
      );
    }
    function renderClientElement(request, task, type, key, props, validated) {
      var debugStack = null;
      var debugOwner = task.debugOwner;
      null !== debugOwner && outlineComponentInfo(request, debugOwner);
      null !== task.debugStack &&
        ((debugStack = filterStackTrace(
          request,
          parseStackTrace(task.debugStack, 1)
        )),
        (task = outlineDebugModel(
          request,
          { objectLimit: 2 * debugStack.length + 1 },
          debugStack
        )),
        request.writtenObjects.set(debugStack, serializeByValueID(task)));
      return [
        REACT_ELEMENT_TYPE,
        type,
        key,
        props,
        debugOwner,
        debugStack,
        validated
      ];
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
    function deferTask(request, task) {
      var newTask = createTask(
        request,
        task.model,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
      "object" === typeof task.model &&
        null !== task.model &&
        request.writtenObjects.set(task.model, serializeByValueID(newTask.id));
      pingTask(request, newTask);
      return serializeLazyID(newTask.id);
    }
    function outlineModel(request, value) {
      var task = createTask(
        request,
        value,
        request.abortableTasks,
        performance.now()
      );
      null !== value &&
        "object" === typeof value &&
        request.writtenObjects.set(value, serializeByValueID(task.id));
      retryTask(request, task);
      return task.id;
    }
    function renderObjectReference(
      request,
      task,
      parent,
      key,
      value,
      parentReference
    ) {
      var writtenObjects = request.writtenObjects,
        existingReference = writtenObjects.get(value);
      if (void 0 !== existingReference)
        if (modelRoot === value) {
          if (existingReference !== serializeByValueID(task.id))
            return existingReference;
          modelRoot = null;
        } else return existingReference;
      else {
        if (-1 !== key.indexOf(":"))
          return serializeByValueID(outlineModel(request, value));
        void 0 === parentReference &&
          (parentReference = writtenObjects.get(parent));
        if (null != parentReference) {
          request = key;
          if (isArrayImpl(parent) && parent[0] === REACT_ELEMENT_TYPE)
            switch (key) {
              case "1":
                request = "type";
                break;
              case "2":
                request = "key";
                break;
              case "3":
                request = "props";
                break;
              case "4":
                request = "_owner";
            }
          writtenObjects.set(value, parentReference + ":" + request);
        }
      }
      return null;
    }
    function getStructuralReferenceAddress(request, task, reference) {
      reference = reference.root;
      if ("fulfilled" === reference.status) {
        var value = reference.value;
        if (
          null !== value &&
          "object" === typeof value &&
          ((value = request.writtenObjects.get(value)), void 0 !== value)
        )
          return value;
      }
      return serializeByValueID(serializeThenable(request, task, reference));
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
      "__proto__" === parentPropertyName &&
        callWithDebugContextInDEV(request, task, function () {
          console.error(
            "Expected not to serialize an object with own property `__proto__`. When parsed this property will be omitted.%s",
            describeObjectForErrorMessage(parent, parentPropertyName)
          );
        });
      if (
        null !== value &&
        ("object" === typeof value || "function" === typeof value) &&
        isClientReference(value)
      )
        return serializeClientReference(
          request,
          task,
          parent,
          parentPropertyName,
          value
        );
      if (
        null !== value &&
        ("object" === typeof value || "function" === typeof value)
      ) {
        if (isServerReference(value))
          return serializeServerReference(request, value);
        if (void 0 !== request.temporaryReferences) {
          var reference = request.temporaryReferences.get(value);
          if (void 0 !== reference) return "$T" + reference;
        }
      }
      if (null === value) return null;
      if ("object" === typeof value) {
        reference = TaintRegistryObjects.get(value);
        void 0 !== reference && throwTaintViolation(reference);
        reference = request.input;
        var _reference =
          null === reference ? void 0 : reference.getValueReference(value);
        if (void 0 !== _reference) {
          request = getStructuralReferenceAddress(request, task, _reference);
          value = [];
          task = _reference;
          for (parentReference = task.parent; null !== parentReference; )
            value.push(task.key),
              (task = parentReference),
              (parentReference = task.parent);
          for (task = value.length - 1; 0 <= task; task--)
            request += ":" + value[task];
          return request;
        }
        modelInfo =
          (void 0 === modelInfo
            ? null === reference
              ? 0
              : reference.getModelInfo(value)
            : modelInfo) & 3;
        if (
          1 === modelInfo ||
          2 === modelInfo ||
          3 === modelInfo ||
          (0 === modelInfo &&
            (isArrayImpl(value) ||
              value.$$typeof === REACT_ELEMENT_TYPE ||
              value instanceof Map ||
              value instanceof Set ||
              value instanceof Error ||
              ("function" === typeof FormData && value instanceof FormData) ||
              ("function" === typeof Blob && value instanceof Blob) ||
              value instanceof ArrayBuffer ||
              ArrayBuffer.isView(value) ||
              (null !== reference &&
                (void 0 !== reference.getReadableStream(value) ||
                  void 0 !== reference.getAsyncIterable(value) ||
                  void 0 !== reference.getIteratorEntries(value))) ||
              getPrototypeOf(value) === ObjectPrototype))
        )
          if (
            ((parentReference = renderObjectReference(
              request,
              task,
              parent,
              parentPropertyName,
              value,
              parentReference
            )),
            null !== parentReference)
          )
            return parentReference;
        if (1 === modelInfo || 2 === modelInfo) return value;
        if (value.$$typeof === REACT_LAZY_TYPE)
          return serializeLazyID(
            serializeThenable(request, task, value._payload)
          );
        if ("function" === typeof value.then)
          return (
            (request = serializeThenable(request, task, value)),
            "pending_weak" === value.status
              ? "$w" + request.toString(16)
              : "$@" + request.toString(16)
          );
        if (value instanceof Date) return serializeDate(value);
        if (3 === modelInfo || value.$$typeof === REACT_ELEMENT_TYPE) {
          task.debugOwner = value._owner;
          task.debugStack = value._debugStack;
          task.debugTask = value._debugTask;
          if (serializedSize > MAX_ROW_SIZE) return deferTask(request, task);
          task = renderClientElement(
            request,
            task,
            value.type,
            value.key,
            value.props,
            value._store.validated
          );
          value = request.writtenObjects.get(value);
          void 0 !== value && request.writtenObjects.set(task, value);
          return task;
        }
        if (value instanceof Map) return serializeMap(request, value);
        if (value instanceof Set) return serializeSet(request, value);
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
          return serializeFormData(request, value);
        if ("function" === typeof Blob && value instanceof Blob)
          return serializeBlob(request, value);
        if (value instanceof Error) return serializeErrorValue(request, value);
        if (isArrayImpl(value)) return value;
        if (getIteratorFn(value)) {
          value =
            null === reference ? void 0 : reference.getIteratorEntries(value);
          if (void 0 === value)
            throw Error("A Result must record iterators before serialization.");
          return "$i" + outlineModel(request, value).toString(16);
        }
        return null !== reference &&
          void 0 !== reference.getReadableStream(value)
          ? serializeReadableStream(request, task, value)
          : null !== reference && void 0 !== reference.getAsyncIterable(value)
            ? serializeAsyncIterable(request, task, value)
            : value;
      }
      if ("string" === typeof value)
        return (
          (task = TaintRegistryValues.get(value)),
          void 0 !== task && throwTaintViolation(task.message),
          (serializedSize += value.length),
          1024 <= value.length && null !== byteLengthOfChunk
            ? serializeLargeTextString(request, value)
            : escapeStringValue(value)
        );
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber(value);
      if ("undefined" === typeof value) return "$undefined";
      if (
        value === REACT_ELEMENT_TYPE &&
        "0" === parentPropertyName &&
        isArrayImpl(parent)
      )
        return "$";
      if ("symbol" === typeof value) {
        task = request.writtenSymbols;
        parentReference = task.get(value);
        if (void 0 !== parentReference)
          return serializeByValueID(parentReference);
        parentReference = value.description;
        request.pendingChunks++;
        modelInfo = request.nextChunkId++;
        emitSymbolChunk(request, modelInfo, parentReference);
        task.set(value, modelInfo);
        return serializeByValueID(modelInfo);
      }
      if ("bigint" === typeof value)
        return (
          (request = TaintRegistryValues.get(value)),
          void 0 !== request && throwTaintViolation(request.message),
          "$n" + value.toString(10)
        );
      throw Error("A Result must validate models before serialization.");
    }
    function patchConsole(consoleInst, methodName) {
      var descriptor = Object.getOwnPropertyDescriptor(consoleInst, methodName);
      if (
        descriptor &&
        (descriptor.configurable || descriptor.writable) &&
        "function" === typeof descriptor.value
      ) {
        var originalMethod = descriptor.value;
        descriptor = Object.getOwnPropertyDescriptor(originalMethod, "name");
        var wrapperMethod = function () {
          var request = currentRequest;
          if (("assert" !== methodName || !arguments[0]) && null !== request) {
            var stack = filterStackTrace(
              request,
              parseStackTracePrivate(Error("react-stack-top-frame"), 1) || []
            );
            request.pendingDebugChunks++;
            var owner = resolveOwner(),
              args = Array.from(arguments),
              env = unbadgeConsole(methodName, args);
            null === env && (env = (0, request.environmentName)());
            emitConsoleChunk(request, methodName, owner, env, stack, args);
          }
          return originalMethod.apply(this, arguments);
        };
        descriptor && Object.defineProperty(wrapperMethod, "name", descriptor);
        Object.defineProperty(consoleInst, methodName, {
          value: wrapperMethod
        });
      }
    }
    function serializeDate(date) {
      date = date.toJSON();
      if ("string" === typeof date) {
        var tainted = TaintRegistryValues.get(date);
        void 0 !== tainted && throwTaintViolation(tainted.message);
      }
      return "$D" + date;
    }
    function resolveModel(request, task, parent, parentPropertyName, value) {
      var parentReference = 6 < arguments.length ? arguments[6] : void 0,
        input = request.input;
      input =
        null !== value && "object" === typeof value && null !== input
          ? input.getModelInfo(value)
          : 0;
      serializedSize += parentPropertyName.length;
      try {
        var rendered = renderModelDestructive(
          request,
          task,
          parent,
          parentPropertyName,
          value,
          parentReference,
          input
        );
      } catch (thrownValue) {
        (rendered = task.model),
          (parentReference =
            null !== rendered &&
            "object" === typeof rendered &&
            null !== request.input
              ? request.input.getModelInfo(rendered) & 3
              : 0),
          (rendered =
            "object" === typeof rendered &&
            null !== rendered &&
            (3 === parentReference ||
              (0 === parentReference &&
                (rendered.$$typeof === REACT_ELEMENT_TYPE ||
                  rendered.$$typeof === REACT_LAZY_TYPE)))),
          12 === request.status
            ? ((task.status = 3),
              (parentReference = request.fatalError),
              (rendered = rendered
                ? serializeLazyID(parentReference)
                : serializeByValueID(parentReference)))
            : (request.pendingChunks++,
              (parentReference = request.nextChunkId++),
              (input = logRecoverableError(request, thrownValue, task)),
              emitErrorChunk(request, parentReference, input, thrownValue),
              (rendered = rendered
                ? serializeLazyID(parentReference)
                : serializeByValueID(parentReference)));
      }
      if (null === rendered || "object" !== typeof rendered) return rendered;
      if (isArrayImpl(rendered)) {
        for (var _resolved = null, i = 0; i < rendered.length; i++)
          (parentReference = rendered[i]),
            (input = resolveModel(
              request,
              task,
              rendered,
              "" + i,
              parentReference
            )),
            null === _resolved &&
              input !== parentReference &&
              (_resolved = 0 === i ? [] : rendered.slice(0, i)),
            null !== _resolved && (_resolved[i] = input);
        return null === _resolved ? rendered : _resolved;
      }
      parentReference = null;
      for (_resolved in rendered)
        if (hasOwnProperty.call(rendered, _resolved)) {
          input = rendered[_resolved];
          var _resolvedValue = resolveModel(
            request,
            task,
            rendered,
            _resolved,
            input
          );
          if (null === parentReference && _resolvedValue !== input)
            for (i in ((parentReference = {}), rendered)) {
              if (i === _resolved) break;
              hasOwnProperty.call(rendered, i) &&
                ("__proto__" === i
                  ? Object.defineProperty(parentReference, i, {
                      value: rendered[i],
                      enumerable: !0,
                      writable: !0,
                      configurable: !0
                    })
                  : (parentReference[i] = rendered[i]));
            }
          null !== parentReference &&
            ("__proto__" === _resolved
              ? Object.defineProperty(parentReference, _resolved, {
                  value: _resolvedValue,
                  enumerable: !0,
                  writable: !0,
                  configurable: !0
                })
              : (parentReference[_resolved] = _resolvedValue));
        }
      return null === parentReference ? rendered : parentReference;
    }
    function serializeLargeTextString(request, text) {
      request.pendingChunks++;
      var textId = request.nextChunkId++;
      emitTextChunk(request, textId, text);
      return serializeByValueID(textId);
    }
    function emitTextChunk(request, id, text) {
      var debug =
        3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : !1;
      if (null === byteLengthOfChunk)
        throw Error(
          "Existence of byteLengthOfChunk should have already been checked. This is a bug in React."
        );
      debug ? request.pendingDebugChunks++ : request.pendingChunks++;
      var binaryLength = byteLengthOfChunk(text);
      binaryLength = id.toString(16) + ":T" + binaryLength.toString(16) + ",";
      debug
        ? request.completedDebugChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC,
            binaryLength,
            text
          )
        : request.completedRegularChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC,
            binaryLength,
            text
          );
    }
    function renderDebugModel(
      request,
      counter,
      parent,
      parentPropertyName,
      value
    ) {
      if (null === value) return null;
      if (value === REACT_ELEMENT_TYPE) return "$";
      if ("object" === typeof value) {
        if (isClientReference(value))
          return serializeDebugClientReference(
            request,
            parent,
            parentPropertyName,
            value
          );
        if (value.$$typeof === CONSTRUCTOR_MARKER) {
          value = value.constructor;
          var ref = request.writtenDebugObjects.get(value);
          void 0 === ref &&
            ((request = outlineDebugModel(request, counter, value)),
            (ref = serializeByValueID(request)));
          return "$P" + ref.slice(1);
        }
        if (void 0 !== request.temporaryReferences) {
          var tempRef = request.temporaryReferences.get(value);
          if (void 0 !== tempRef) return "$T" + tempRef;
        }
        tempRef = request.writtenDebugObjects;
        var existingDebugReference = tempRef.get(value);
        if (void 0 !== existingDebugReference)
          if (debugModelRoot === value) debugModelRoot = null;
          else return existingDebugReference;
        else if (-1 === parentPropertyName.indexOf(":"))
          if (
            ((existingDebugReference = tempRef.get(parent)),
            void 0 !== existingDebugReference)
          ) {
            if (0 >= counter.objectLimit && !doNotLimit.has(value))
              return serializeDeferredObject(request, value);
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
                  break;
                case "4":
                  propertyName = "_owner";
              }
            tempRef.set(value, existingDebugReference + ":" + propertyName);
          } else if (debugNoOutline !== value) {
            if ("function" === typeof value.then)
              return serializeDebugThenable(request, counter, value);
            request = outlineDebugModel(request, counter, value);
            return serializeByValueID(request);
          }
        parent = request.writtenObjects.get(value);
        if (void 0 !== parent) return parent;
        if (0 >= counter.objectLimit && !doNotLimit.has(value))
          return serializeDeferredObject(request, value);
        counter.objectLimit--;
        parent = request.deferredDebugObjects;
        if (
          null !== parent &&
          ((parentPropertyName = parent.existing.get(value)),
          void 0 !== parentPropertyName)
        )
          return (
            parent.existing.delete(value),
            parent.retained.delete(parentPropertyName),
            emitOutlinedDebugModelChunk(
              request,
              parentPropertyName,
              counter,
              value
            ),
            serializeByValueID(parentPropertyName)
          );
        switch (value.$$typeof) {
          case REACT_ELEMENT_TYPE:
            null != value._owner && outlineComponentInfo(request, value._owner);
            "object" === typeof value.type &&
              null !== value.type &&
              doNotLimit.add(value.type);
            "object" === typeof value.key &&
              null !== value.key &&
              doNotLimit.add(value.key);
            doNotLimit.add(value.props);
            null !== value._owner && doNotLimit.add(value._owner);
            counter = null;
            if (null != value._debugStack)
              for (
                counter = filterStackTrace(
                  request,
                  parseStackTrace(value._debugStack, 1)
                ),
                  doNotLimit.add(counter),
                  request = 0;
                request < counter.length;
                request++
              )
                doNotLimit.add(counter[request]);
            return [
              REACT_ELEMENT_TYPE,
              value.type,
              value.key,
              value.props,
              value._owner,
              counter,
              value._store.validated
            ];
          case REACT_LAZY_TYPE:
            value = value._payload;
            if (null !== value && "object" === typeof value) {
              switch (value._status) {
                case 1:
                  return (
                    (request = outlineDebugModel(
                      request,
                      counter,
                      value._result
                    )),
                    serializeLazyID(request)
                  );
                case 2:
                  return (
                    (counter = request.nextChunkId++),
                    emitErrorChunk(
                      request,
                      counter,
                      "",
                      value._result,
                      !0,
                      null
                    ),
                    serializeLazyID(counter)
                  );
              }
              switch (value.status) {
                case "fulfilled":
                  return (
                    (request = outlineDebugModel(
                      request,
                      counter,
                      value.value
                    )),
                    serializeLazyID(request)
                  );
                case "rejected":
                  return (
                    (counter = request.nextChunkId++),
                    emitErrorChunk(
                      request,
                      counter,
                      "",
                      value.reason,
                      !0,
                      null
                    ),
                    serializeLazyID(counter)
                  );
              }
            }
            request.pendingDebugChunks++;
            value = request.nextChunkId++;
            emitDebugHaltChunk(request, value);
            return serializeLazyID(value);
        }
        if ("function" === typeof value.then)
          return serializeDebugThenable(request, counter, value);
        if (isArrayImpl(value))
          return 200 < value.length && !doNotLimit.has(value)
            ? serializeDeferredObject(request, value)
            : value;
        if (value instanceof Date) return serializeDate(value);
        if (value instanceof Map) {
          value = Array.from(value);
          counter.objectLimit++;
          for (ref = 0; ref < value.length; ref++) {
            var entry = value[ref];
            doNotLimit.add(entry);
            var key = entry[0];
            entry = entry[1];
            "object" === typeof key && null !== key && doNotLimit.add(key);
            "object" === typeof entry &&
              null !== entry &&
              doNotLimit.add(entry);
          }
          return "$Q" + outlineDebugModel(request, counter, value).toString(16);
        }
        if (value instanceof Set) {
          value = Array.from(value);
          counter.objectLimit++;
          for (ref = 0; ref < value.length; ref++)
            (key = value[ref]),
              "object" === typeof key && null !== key && doNotLimit.add(key);
          return "$W" + outlineDebugModel(request, counter, value).toString(16);
        }
        if ("function" === typeof FormData && value instanceof FormData)
          return (
            (value = Array.from(value.entries())),
            "$K" +
              outlineDebugModel(
                request,
                { objectLimit: 2 * value.length + 1 },
                value
              ).toString(16)
          );
        if (value instanceof Error) {
          var name = "Error";
          parent = (0, request.environmentName)();
          try {
            (name = value.name),
              (key = String(value.message)),
              (ref = filterStackTrace(request, parseStackTrace(value, 0))),
              (entry = value.environmentName),
              "string" === typeof entry && (parent = entry);
          } catch (x) {
            (key =
              "An error occurred but serializing the error message failed."),
              (ref = []);
          }
          key = { name: name, message: key, stack: ref, env: parent };
          "cause" in value &&
            (counter.objectLimit--,
            (entry = outlineDebugModel(request, counter, value.cause)),
            (key.cause = serializeByValueID(entry)));
          "undefined" !== typeof AggregateError &&
            value instanceof AggregateError &&
            (counter.objectLimit--,
            (value = outlineDebugModel(request, counter, value.errors)),
            (key.errors = serializeByValueID(value)));
          request =
            "$Z" +
            outlineDebugModel(
              request,
              { objectLimit: 2 * ref.length + 2 },
              key
            ).toString(16);
          return request;
        }
        if (value instanceof ArrayBuffer)
          return serializeDebugTypedArray(request, "A", new Uint8Array(value));
        if (value instanceof Int8Array)
          return serializeDebugTypedArray(request, "O", value);
        if (value instanceof Uint8Array)
          return serializeDebugTypedArray(request, "o", value);
        if (value instanceof Uint8ClampedArray)
          return serializeDebugTypedArray(request, "U", value);
        if (value instanceof Int16Array)
          return serializeDebugTypedArray(request, "S", value);
        if (value instanceof Uint16Array)
          return serializeDebugTypedArray(request, "s", value);
        if (value instanceof Int32Array)
          return serializeDebugTypedArray(request, "L", value);
        if (value instanceof Uint32Array)
          return serializeDebugTypedArray(request, "l", value);
        if (value instanceof Float32Array)
          return serializeDebugTypedArray(request, "G", value);
        if (value instanceof Float64Array)
          return serializeDebugTypedArray(request, "g", value);
        if (value instanceof BigInt64Array)
          return serializeDebugTypedArray(request, "M", value);
        if (value instanceof BigUint64Array)
          return serializeDebugTypedArray(request, "m", value);
        if (value instanceof DataView)
          return serializeDebugTypedArray(request, "V", value);
        if ("function" === typeof Blob && value instanceof Blob)
          return serializeDebugBlob(request, value);
        if (getIteratorFn(value)) return Array.from(value);
        request = getPrototypeOf(value);
        if (request !== ObjectPrototype && null !== request) {
          counter = Object.create(null);
          for (name in value)
            if (hasOwnProperty.call(value, name) || isGetter(request, name))
              counter[name] = value[name];
          ref = request.constructor;
          "function" !== typeof ref ||
            ref.prototype !== request ||
            hasOwnProperty.call(value, "") ||
            isGetter(request, "") ||
            (counter[""] = { $$typeof: CONSTRUCTOR_MARKER, constructor: ref });
          return counter;
        }
        return value;
      }
      if ("string" === typeof value) {
        if (1e6 < value.length)
          return (
            "This string of length " +
            value.length +
            " has been omitted by React to avoid sending too much data from the server."
          );
        if (1024 <= value.length) {
          if (0 >= counter.objectLimit)
            return serializeDeferredObject(request, value);
          counter.objectLimit--;
          request.pendingDebugChunks++;
          counter = request.nextChunkId++;
          emitTextChunk(request, counter, value, !0);
          return serializeByValueID(counter);
        }
        return "$" === value[0] ? "$" + value : value;
      }
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber(value);
      if ("undefined" === typeof value) return "$undefined";
      if ("function" === typeof value) {
        if (isClientReference(value))
          return serializeDebugClientReference(
            request,
            parent,
            parentPropertyName,
            value
          );
        if (
          void 0 !== request.temporaryReferences &&
          ((counter = request.temporaryReferences.get(value)),
          void 0 !== counter)
        )
          return "$T" + counter;
        counter = request.writtenDebugObjects;
        ref = counter.get(value);
        if (void 0 !== ref) return ref;
        ref = Function.prototype.toString.call(value);
        key = value.name;
        key =
          "$E" +
          ("string" === typeof key
            ? "Object.defineProperty(" +
              ref +
              ',"name",{value:' +
              JSON.stringify(key) +
              "})"
            : "(" + ref + ")");
        request.pendingDebugChunks++;
        ref = request.nextChunkId++;
        key = encodeReferenceChunk(request, ref, key);
        request.completedDebugChunks.push(key);
        request = serializeByValueID(ref);
        counter.set(value, request);
        return request;
      }
      if ("symbol" === typeof value) {
        counter = request.writtenSymbols.get(value);
        if (void 0 !== counter) return serializeByValueID(counter);
        value = value.description;
        request.pendingChunks++;
        counter = request.nextChunkId++;
        emitSymbolChunk(request, counter, value);
        return serializeByValueID(counter);
      }
      return "bigint" === typeof value
        ? "$n" + value.toString(10)
        : "unknown type " + typeof value;
    }
    function serializeDebugModel(request, objectLimit, model) {
      function replacer(parentPropertyName) {
        try {
          return renderDebugModel(
            request,
            counter,
            this,
            parentPropertyName,
            this[parentPropertyName]
          );
        } catch (x) {
          return (
            "Unknown Value: React could not send it from the server.\n" +
            x.message
          );
        }
      }
      var counter = { objectLimit: objectLimit };
      objectLimit = debugNoOutline;
      debugNoOutline = model;
      try {
        return stringify(model, replacer);
      } catch (x) {
        return stringify(
          "Unknown Value: React could not send it from the server.\n" +
            x.message
        );
      } finally {
        debugNoOutline = objectLimit;
      }
    }
    function emitOutlinedDebugModelChunk(request, id, counter, model) {
      function replacer(parentPropertyName) {
        try {
          return renderDebugModel(
            request,
            counter,
            this,
            parentPropertyName,
            this[parentPropertyName]
          );
        } catch (x) {
          return (
            "Unknown Value: React could not send it from the server.\n" +
            x.message
          );
        }
      }
      "object" === typeof model && null !== model && doNotLimit.add(model);
      var prevModelRoot = debugModelRoot;
      debugModelRoot = model;
      "object" === typeof model &&
        null !== model &&
        request.writtenDebugObjects.set(model, serializeByValueID(id));
      try {
        var json = stringify(model, replacer);
      } catch (x) {
        json = stringify(
          "Unknown Value: React could not send it from the server.\n" +
            x.message
        );
      } finally {
        debugModelRoot = prevModelRoot;
      }
      id = id.toString(16) + ":" + json + "\n";
      request.completedDebugChunks.push(id);
    }
    function outlineDebugModel(request, counter, model) {
      var id = request.nextChunkId++;
      request.pendingDebugChunks++;
      emitOutlinedDebugModelChunk(request, id, counter, model);
      return id;
    }
    function serializeDeferredObject(request, value) {
      var deferredDebugObjects = request.deferredDebugObjects;
      return null !== deferredDebugObjects
        ? (request.pendingDebugChunks++,
          (request = request.nextChunkId++),
          deferredDebugObjects.existing.set(value, request),
          deferredDebugObjects.retained.set(request, value),
          "$Y" + request.toString(16))
        : "$Y";
    }
    function emitModelChunk(request, id, json) {
      id = id.toString(16) + ":" + json + "\n";
      request.completedRegularChunks.push(id);
    }
    function emitTimingChunk(request, id, timestamp) {
      request.pendingChunks++;
      var json = '{"time":' + (timestamp - request.timeOrigin) + "}";
      null !== request.debugDestination
        ? ((timestamp = request.nextChunkId++),
          (json = timestamp.toString(16) + ":" + json + "\n"),
          request.pendingDebugChunks++,
          request.completedDebugChunks.push(json),
          (id = id.toString(16) + ':D"$' + timestamp.toString(16) + '"\n'),
          request.completedRegularChunks.push(id))
        : ((id = id.toString(16) + ":D" + json + "\n"),
          request.completedRegularChunks.push(id));
    }
    function emitConsoleChunk(
      request,
      methodName,
      owner,
      env,
      stackTrace,
      args
    ) {
      null != owner && outlineComponentInfo(request, owner);
      var payload = [methodName, stackTrace, owner, env];
      payload.push.apply(payload, args);
      args = serializeDebugModel(
        request,
        (null === request.deferredDebugObjects ? 500 : 10) + stackTrace.length,
        payload
      );
      "[" !== args[0] &&
        (args = serializeDebugModel(request, 10 + stackTrace.length, [
          methodName,
          stackTrace,
          owner,
          env,
          "Unknown Value: React could not send it from the server."
        ]));
      request.completedDebugChunks.push(":W" + args + "\n");
    }
    function emitTimeOriginChunk(request, timeOrigin) {
      request.pendingDebugChunks++;
      request.completedDebugChunks.push(":N" + timeOrigin + "\n");
    }
    function createTask(request, model, abortSet) {
      var lastTimestamp =
          3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : 0,
        debugOwner =
          4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : null,
        debugStack =
          5 < arguments.length && void 0 !== arguments[5] ? arguments[5] : null,
        debugTask =
          6 < arguments.length && void 0 !== arguments[6] ? arguments[6] : null,
        id = request.nextChunkId++;
      request.pendingChunks++;
      id = { id: id, status: 0, model: model, returnedTupleReference: null };
      id.time = lastTimestamp;
      id.debugPendingTime = null;
      id.debugOwner = debugOwner;
      id.debugStack = debugStack;
      id.debugTask = debugTask;
      id.environmentName = request.environmentName();
      abortSet.add(id);
      return id;
    }
    function retryTask(request, task) {
      if (0 === task.status) {
        task.status = 6;
        var parentSerializedSize = serializedSize;
        try {
          var model = task.model;
          flushInputDebugTime(request, task);
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
        var prevRequest = currentRequest;
        currentRequest = request;
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
          setCurrentCache(prevCache), (currentRequest = prevRequest);
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
    function serializeLazyID(id) {
      return "$L" + id.toString(16);
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
      request.completedImportChunks.push(
        existing.toString(16) + ":" + json + "\n"
      );
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
              var length = value.length, _copy = Array(length), i = 0;
              i < length;
              i++
            ) {
              var element = value[i];
              if ("string" === typeof element)
                _copy[i] = serializeImportString(request, element);
              else {
                element = transformImportMetadata(request, element, depth + 1);
                if (element === NOT_PLAIN_IMPORT_METADATA)
                  return NOT_PLAIN_IMPORT_METADATA;
                _copy[i] = element;
              }
            }
            return _copy;
          }
          length = getPrototypeOf(value);
          if (length !== ObjectPrototype && null !== length)
            return NOT_PLAIN_IMPORT_METADATA;
          length = Object.keys(value);
          _copy = {};
          for (i = 0; i < length.length; i++) {
            element = length[i];
            if (element in ObjectPrototype) return NOT_PLAIN_IMPORT_METADATA;
            var _element = value[element];
            if ("string" === typeof _element)
              _copy[element] = serializeImportString(request, _element);
            else {
              _element = transformImportMetadata(request, _element, depth + 1);
              if (_element === NOT_PLAIN_IMPORT_METADATA)
                return NOT_PLAIN_IMPORT_METADATA;
              _copy[element] = _element;
            }
          }
          return _copy;
        default:
          return NOT_PLAIN_IMPORT_METADATA;
      }
    }
    function stringifyImportMetadata(request, clientReferenceMetadata, debug) {
      if (!debug) {
        var copy = transformImportMetadata(request, clientReferenceMetadata, 0);
        if (copy !== NOT_PLAIN_IMPORT_METADATA) return stringify(copy);
      }
      a: {
        copy = importStringRequest;
        importStringRequest = debug ? null : request;
        try {
          var JSCompiler_inline_result = stringify(
            clientReferenceMetadata,
            importMetadataReplacer
          );
          break a;
        } finally {
          importStringRequest = copy;
        }
        JSCompiler_inline_result = void 0;
      }
      return JSCompiler_inline_result;
    }
    function emitSymbolChunk(request, id, name) {
      id = encodeReferenceChunk(request, id, "$S" + name);
      request.completedImportChunks.push(id);
    }
    function encodeReferenceChunk(request, id, reference) {
      request = JSON.stringify(reference);
      return id.toString(16) + ":" + request + "\n";
    }
    function subscribeToThenable(
      request$jscomp$1,
      task$jscomp$0,
      thenable,
      outlineNow
    ) {
      var synchronous = !0 === outlineNow;
      try {
        var input = request$jscomp$1.input;
        null !== input &&
          subscribeInput(request$jscomp$1, function (detach) {
            return input.subscribeToThenable(thenable, {
              debug: function (info$jscomp$0) {
                var time = info$jscomp$0.time;
                if ("number" === typeof time)
                  flushInputDebugTime(request$jscomp$1, task$jscomp$0),
                    (task$jscomp$0.time = time),
                    (task$jscomp$0.debugPendingTime = time);
                else {
                  "string" === typeof info$jscomp$0.name &&
                    outlineComponentInfo(request$jscomp$1, info$jscomp$0);
                  flushInputDebugTime(request$jscomp$1, task$jscomp$0);
                  info$jscomp$0 = [info$jscomp$0];
                  time = task$jscomp$0.id;
                  for (var i = 0; i < info$jscomp$0.length; i++) {
                    var info = info$jscomp$0[i];
                    if ("number" === typeof info.time) {
                      var request = request$jscomp$1,
                        task = task$jscomp$0;
                      info = info.time;
                      (12 === request.status && info > request.abortTime) ||
                        (info > task.time
                          ? (emitTimingChunk(request, task.id, info),
                            (task.time = info))
                          : emitTimingChunk(request, task.id, task.time));
                    } else if ("string" === typeof info.name)
                      outlineComponentInfo(request$jscomp$1, info),
                        request$jscomp$1.pendingChunks++,
                        emitDebugChunk(request$jscomp$1, time, info);
                    else if (info.awaited) {
                      request = info.awaited;
                      task = request$jscomp$1;
                      var ioInfo = request;
                      if (!task.writtenDebugObjects.has(ioInfo)) {
                        task.pendingDebugChunks++;
                        var id = task.nextChunkId++,
                          owner = ioInfo.owner;
                        null != owner && outlineComponentInfo(task, owner);
                        var debugStack =
                          null == ioInfo.stack && null != ioInfo.debugStack
                            ? filterStackTrace(
                                task,
                                parseStackTrace(ioInfo.debugStack, 1)
                              )
                            : ioInfo.stack;
                        var env = ioInfo.env;
                        null == env && (env = (0, task.environmentName)());
                        var request$jscomp$0 = task,
                          id$jscomp$0 = id,
                          value = ioInfo.value,
                          objectLimit = 10;
                        debugStack && (objectLimit += debugStack.length);
                        var debugIOInfo = {
                          name: ioInfo.name,
                          start: ioInfo.start - request$jscomp$0.timeOrigin,
                          end: ioInfo.end - request$jscomp$0.timeOrigin
                        };
                        null != env && (debugIOInfo.env = env);
                        null != debugStack && (debugIOInfo.stack = debugStack);
                        null != owner && (debugIOInfo.owner = owner);
                        void 0 !== value && (debugIOInfo.value = value);
                        env = serializeDebugModel(
                          request$jscomp$0,
                          objectLimit,
                          debugIOInfo
                        );
                        id$jscomp$0 =
                          id$jscomp$0.toString(16) + ":J" + env + "\n";
                        request$jscomp$0.completedDebugChunks.push(id$jscomp$0);
                        task.writtenDebugObjects.set(
                          ioInfo,
                          serializeByValueID(id)
                        );
                      }
                      null != info.owner &&
                        outlineComponentInfo(request$jscomp$1, info.owner);
                      task =
                        null == info.stack && null != info.debugStack
                          ? filterStackTrace(
                              request$jscomp$1,
                              parseStackTrace(info.debugStack, 1)
                            )
                          : info.stack;
                      request = { awaited: request };
                      request.env =
                        null != info.env
                          ? info.env
                          : (0, request$jscomp$1.environmentName)();
                      null != info.owner && (request.owner = info.owner);
                      null != task && (request.stack = task);
                      request$jscomp$1.pendingChunks++;
                      emitDebugChunk(request$jscomp$1, time, request);
                    } else
                      request$jscomp$1.pendingChunks++,
                        emitDebugChunk(request$jscomp$1, time, info);
                  }
                }
                enqueueFlush(request$jscomp$1);
              },
              halt: function () {
                flushInputDebugTime(request$jscomp$1, task$jscomp$0);
                detach();
                0 === task$jscomp$0.status &&
                  (haltTask(task$jscomp$0, request$jscomp$1),
                  request$jscomp$1.abortableTasks.delete(task$jscomp$0),
                  3 === task$jscomp$0.status &&
                    request$jscomp$1.pendingChunks--,
                  enqueueFlush(request$jscomp$1));
              },
              resolve: function (value) {
                detach();
                if (11 >= request$jscomp$1.status && 0 === task$jscomp$0.status)
                  if (((task$jscomp$0.model = value), synchronous)) {
                    value = task$jscomp$0.model;
                    null !== value &&
                      "object" === typeof value &&
                      request$jscomp$1.writtenObjects.set(
                        value,
                        serializeByValueID(task$jscomp$0.id)
                      );
                    value = modelRoot;
                    try {
                      retryTask(request$jscomp$1, task$jscomp$0);
                    } finally {
                      modelRoot = value;
                    }
                  } else pingTask(request$jscomp$1, task$jscomp$0);
              },
              reject: function (error, reference) {
                flushInputDebugTime(request$jscomp$1, task$jscomp$0);
                detach();
                if (11 >= request$jscomp$1.status && 0 === task$jscomp$0.status)
                  try {
                    erroredInputTask(
                      request$jscomp$1,
                      task$jscomp$0,
                      error,
                      reference
                    ),
                      enqueueFlush(request$jscomp$1);
                  } catch (fatal) {
                    fatalError(request$jscomp$1, fatal);
                  }
              }
            });
          });
      } finally {
        synchronous = !1;
      }
    }
    function serializeDebugThenable(request, counter, thenable) {
      var model = thenable.$$typeof === RESULT_MODEL_TYPE ? thenable : null;
      model = null === model ? void 0 : model._debugSource;
      if (void 0 !== model) {
        var existing = request.writtenDebugObjects.get(model);
        if (void 0 !== existing)
          return request.writtenDebugObjects.set(thenable, existing), existing;
      }
      request.pendingDebugChunks++;
      var id = request.nextChunkId++;
      existing = "$@" + id.toString(16);
      request.writtenDebugObjects.set(thenable, existing);
      void 0 !== model && request.writtenDebugObjects.set(model, existing);
      if (
        null !==
        (thenable.$$typeof === RESULT_MODEL_TYPE ? thenable.status : null)
      ) {
        var input = request.input;
        if (null !== input) {
          var settled = !1;
          subscribeInput(request, function (detach) {
            var unsubscribe = input.subscribeToThenable(thenable, {
              resolve: function (value) {
                settled = !0;
                detach();
                emitOutlinedDebugModelChunk(request, id, counter, value);
                enqueueFlush(request);
              },
              reject: function (error) {
                settled = !0;
                detach();
                emitErrorChunk(request, id, "", error, !0, null);
                enqueueFlush(request);
              },
              halt: function () {
                settled = !0;
                detach();
                emitDebugHaltChunk(request, id);
                enqueueFlush(request);
              }
            });
            return function () {
              unsubscribe();
              settled ||
                ((settled = !0),
                emitDebugHaltChunk(request, id),
                enqueueFlush(request));
            };
          });
          return existing;
        }
      }
      switch (thenable.status) {
        case "fulfilled":
          return (
            emitOutlinedDebugModelChunk(request, id, counter, thenable.value),
            existing
          );
        case "rejected":
          return (
            emitErrorChunk(request, id, "", thenable.reason, !0, null), existing
          );
      }
      if (12 === request.status)
        return emitDebugHaltChunk(request, id), existing;
      model = request.deferredDebugObjects;
      if (null !== model)
        return (
          model.retained.set(id, thenable),
          (model = "$Y@" + id.toString(16)),
          request.writtenDebugObjects.set(thenable, model),
          model
        );
      var cancelled = !1;
      thenable.then(
        function (value) {
          cancelled ||
            ((cancelled = !0),
            12 === request.status
              ? emitDebugHaltChunk(request, id)
              : (isArrayImpl(value) && 200 < value.length) ||
                  ((value instanceof ArrayBuffer ||
                    value instanceof Int8Array ||
                    value instanceof Uint8Array ||
                    value instanceof Uint8ClampedArray ||
                    value instanceof Int16Array ||
                    value instanceof Uint16Array ||
                    value instanceof Int32Array ||
                    value instanceof Uint32Array ||
                    value instanceof Float32Array ||
                    value instanceof Float64Array ||
                    value instanceof BigInt64Array ||
                    value instanceof BigUint64Array ||
                    value instanceof DataView) &&
                    1e3 < value.byteLength)
                ? emitDebugHaltChunk(request, id)
                : emitOutlinedDebugModelChunk(request, id, counter, value),
            enqueueFlush(request));
        },
        function (reason) {
          cancelled ||
            ((cancelled = !0),
            12 === request.status
              ? emitDebugHaltChunk(request, id)
              : emitErrorChunk(request, id, "", reason, !0, null),
            enqueueFlush(request));
        }
      );
      Promise.resolve().then(function () {
        cancelled ||
          ((cancelled = !0),
          emitDebugHaltChunk(request, id),
          enqueueFlush(request),
          (counter = request = null));
      });
      return existing;
    }
    function emitRequestedDebugThenable(request, id, counter, thenable) {
      thenable.then(
        function (value) {
          12 === request.status
            ? emitDebugHaltChunk(request, id)
            : emitOutlinedDebugModelChunk(request, id, counter, value);
          enqueueFlush(request);
        },
        function (reason) {
          12 === request.status
            ? emitDebugHaltChunk(request, id)
            : emitErrorChunk(request, id, "", reason, !0, null);
          enqueueFlush(request);
        }
      );
    }
    function flushInputDebugTime(request, task) {
      var time = task.debugPendingTime;
      null !== time &&
        ((task.debugPendingTime = null),
        emitTimingChunk(request, task.id, time));
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
      var existingId = request.writtenModels.get(thenable);
      if (void 0 !== existingId) return existingId;
      task = createTask(
        request,
        null,
        request.abortableTasks,
        null !== task ? task.time : request.timeOrigin,
        null !== task ? task.debugOwner : null,
        null !== task ? task.debugStack : null,
        null !== task ? task.debugTask : null
      );
      request.writtenModels.set(thenable, task.id);
      subscribeToThenable(request, task, thenable);
      return task.id;
    }
    function serializeClientReference(
      request,
      task,
      parent,
      parentPropertyName,
      clientReference
    ) {
      var clientReferenceKey = getClientReferenceKey(clientReference),
        writtenClientReferences = request.writtenClientReferences,
        existingId = writtenClientReferences.get(clientReferenceKey);
      if (void 0 !== existingId)
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(existingId)
          : serializeByValueID(existingId);
      try {
        var clientReferenceMetadata = resolveClientReferenceMetadata(
            request.bundlerConfig,
            clientReference
          ),
          json = stringifyImportMetadata(request, clientReferenceMetadata, !1);
        request.pendingChunks++;
        var importId = request.nextChunkId++;
        emitImportChunk(request, importId, json);
        writtenClientReferences.set(clientReferenceKey, importId);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(importId)
          : serializeByValueID(importId);
      } catch (error) {
        return (
          request.pendingChunks++,
          (parent = request.nextChunkId++),
          (task = logRecoverableError(request, error, task)),
          emitErrorChunk(request, parent, task, error),
          serializeByValueID(parent)
        );
      }
    }
    function serializeDebugClientReference(
      request,
      parent,
      parentPropertyName,
      clientReference
    ) {
      var clientReferenceKey = getClientReferenceKey(clientReference);
      clientReferenceKey =
        request.writtenClientReferences.get(clientReferenceKey);
      if (void 0 !== clientReferenceKey)
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(clientReferenceKey)
          : serializeByValueID(clientReferenceKey);
      try {
        var clientReferenceMetadata = resolveClientReferenceMetadata(
            request.bundlerConfig,
            clientReference
          ),
          json = stringifyImportMetadata(request, clientReferenceMetadata, !0);
        request.pendingDebugChunks++;
        var importId = request.nextChunkId++;
        emitImportChunk(request, importId, json, !0);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(importId)
          : serializeByValueID(importId);
      } catch (x) {
        return (
          request.pendingDebugChunks++,
          (parent = request.nextChunkId++),
          (parentPropertyName = logRecoverableError(request, x)),
          emitErrorChunk(request, parent, parentPropertyName, x, !0, null),
          serializeByValueID(parent)
        );
      }
    }
    function emitImportChunk(request, id, json) {
      var debug =
          3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : !1,
        processedChunk = id.toString(16) + ":I" + json + "\n";
      debug
        ? request.completedDebugChunks.push(processedChunk)
        : request.completedImportChunks.push(processedChunk);
    }
    function callWithDebugContextInDEV(request, task, callback, arg) {
      var componentDebugInfo = {
        name: "",
        env: task.environmentName,
        key: null,
        owner: task.debugOwner
      };
      componentDebugInfo.stack =
        null === task.debugStack
          ? null
          : filterStackTrace(request, parseStackTrace(task.debugStack, 1));
      componentDebugInfo.debugStack = task.debugStack;
      request = componentDebugInfo.debugTask = task.debugTask;
      currentOwner = componentDebugInfo;
      try {
        return request ? request.run(callback.bind(null, arg)) : callback(arg);
      } finally {
        currentOwner = null;
      }
    }
    function logRecoverableError(request, error) {
      var task =
          2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null,
        prevCache = setCurrentCache(null),
        prevRequest = currentRequest;
      currentRequest = null;
      try {
        var onError = request.onError;
        var errorDigest =
          null !== task
            ? cacheStorage.run(void 0, function () {
                return requestStorage.run(
                  void 0,
                  callWithDebugContextInDEV,
                  request,
                  task,
                  onError,
                  error
                );
              })
            : cacheStorage.run(void 0, function () {
                return requestStorage.run(void 0, onError, error);
              });
      } finally {
        setCurrentCache(prevCache), (currentRequest = prevRequest);
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
      var digest = logRecoverableError(request, error, task);
      emitErrorChunk(request, task.id, digest, error);
    }
    function erroredInputTask(request, task, error, reference) {
      if (void 0 === reference) erroredTask(request, task, error);
      else {
        task.status = 4;
        request.abortableTasks.delete(task);
        var existingId = request.writtenErrors.get(reference);
        void 0 === existingId
          ? (request.writtenErrors.set(reference, task.id),
            emitErrorChunk(request, task.id, reference.digest, error))
          : ((error = serializeByValueID(existingId)),
            request.completedErrorChunks.push(
              encodeReferenceChunk(request, task.id, error)
            ));
      }
    }
    function emitErrorChunk(request, id, digest, error) {
      var debug =
          4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : !1,
        owner =
          5 < arguments.length && void 0 !== arguments[5] ? arguments[5] : null;
      var errorInfo = "Error";
      var env = (0, request.environmentName)(),
        causeReference = null,
        errorsReference = null;
      try {
        if (error instanceof Error) {
          var input = request.input,
            capturedInfo = null === input ? void 0 : input.getErrorInfo(error);
          if (void 0 !== capturedInfo) {
            errorInfo = capturedInfo.name;
            var message = capturedInfo.message;
            var stack = capturedInfo.stack;
            env = capturedInfo.env;
          } else {
            errorInfo = error.name;
            message = String(error.message);
            stack = filterStackTrace(request, parseStackTrace(error, 0));
            var errorEnv = error.environmentName;
            "string" === typeof errorEnv && (env = errorEnv);
          }
          if ("cause" in error) {
            var cause = error.cause,
              causeId = debug
                ? outlineDebugModel(request, { objectLimit: 5 }, cause)
                : outlineModel(request, cause);
            causeReference = serializeByValueID(causeId);
          }
          if (
            "undefined" !== typeof AggregateError &&
            error instanceof AggregateError
          ) {
            var errors = error.errors,
              errorsId = debug
                ? outlineDebugModel(request, { objectLimit: 5 }, errors)
                : outlineModel(request, errors);
            errorsReference = serializeByValueID(errorsId);
          }
        } else
          (message =
            "object" === typeof error && null !== error
              ? describeObjectForErrorMessage(error)
              : String(error)),
            (stack = []);
      } catch (x) {
        (message =
          "An error occurred but serializing the error message failed."),
          (stack = []);
      }
      owner = null == owner ? null : outlineComponentInfo(request, owner);
      errorInfo = {
        digest: digest,
        name: errorInfo,
        message: message,
        stack: stack,
        env: env,
        owner: owner
      };
      null !== causeReference && (errorInfo.cause = causeReference);
      null !== errorsReference && (errorInfo.errors = errorsReference);
      causeReference = id.toString(16) + ":E" + stringify(errorInfo) + "\n";
      debug
        ? request.completedDebugChunks.push(causeReference)
        : request.completedErrorChunks.push(causeReference);
    }
    function enqueueFlush(request) {
      request.flushScheduled ||
        (null === request.destination && null === request.debugDestination) ||
        ((request.flushScheduled = !0),
        setImmediate(function () {
          request.flushScheduled = !1;
          flushCompletedChunks(request);
        }));
    }
    function emitDebugHaltChunk(request, id) {
      id = id.toString(16) + ":\n";
      request.completedDebugChunks.push(id);
    }
    function emitDebugChunk(request, id, debugInfo) {
      var json = serializeDebugModel(request, 500, debugInfo);
      null !== request.debugDestination
        ? '"' === json[0] && "$" === json[1]
          ? ((id = id.toString(16) + ":D" + json + "\n"),
            request.completedRegularChunks.push(id))
          : ((debugInfo = request.nextChunkId++),
            (json = debugInfo.toString(16) + ":" + json + "\n"),
            request.pendingDebugChunks++,
            request.completedDebugChunks.push(json),
            (id = id.toString(16) + ':D"$' + debugInfo.toString(16) + '"\n'),
            request.completedRegularChunks.push(id))
        : ((id = id.toString(16) + ":D" + json + "\n"),
          request.completedRegularChunks.push(id));
    }
    function outlineComponentInfo(request, componentInfo) {
      var existingRef = request.writtenDebugObjects.get(componentInfo);
      if (void 0 !== existingRef) return existingRef;
      null != componentInfo.owner &&
        outlineComponentInfo(request, componentInfo.owner);
      existingRef = 10;
      null != componentInfo.stack &&
        (existingRef += componentInfo.stack.length);
      existingRef = { objectLimit: existingRef };
      var componentDebugInfo = {
        name: componentInfo.name,
        key: componentInfo.key
      };
      null != componentInfo.env && (componentDebugInfo.env = componentInfo.env);
      null != componentInfo.owner &&
        (componentDebugInfo.owner = componentInfo.owner);
      null == componentInfo.stack && null != componentInfo.debugStack
        ? (componentDebugInfo.stack = filterStackTrace(
            request,
            parseStackTrace(componentInfo.debugStack, 1)
          ))
        : null != componentInfo.stack &&
          (componentDebugInfo.stack = componentInfo.stack);
      componentDebugInfo.props = componentInfo.props;
      existingRef = outlineDebugModel(request, existingRef, componentDebugInfo);
      existingRef = serializeByValueID(existingRef);
      request.writtenDebugObjects.set(componentInfo, existingRef);
      request.writtenObjects.set(componentInfo, existingRef);
      return existingRef;
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
          ((sourceComplete = !0),
          request.pendingChunks--,
          enqueueFlush(request));
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
            console: function (entry) {
              request.pendingDebugChunks++;
              emitConsoleChunk(
                request,
                entry.methodName,
                entry.owner,
                entry.env,
                entry.stack,
                entry.args
              );
              enqueueFlush(request);
            },
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
      cleanupTaintQueue(request);
      var destination = request.destination;
      null !== request.debugDestination &&
        (request.debugDestination.destroy(error),
        (request.debugDestination = null));
      null !== destination
        ? ((request.status = 14), destination.destroy(error))
        : (request.status = 13);
    }
    function flushCompletedChunks(request) {
      if (null !== request.debugDestination) {
        var debugDestination = request.debugDestination;
        beginWriting();
        try {
          for (
            var debugChunks = request.completedDebugChunks, i = 0;
            i < debugChunks.length;
            i++
          ) {
            var item = debugChunks[i];
            if ("symbol" === typeof item) {
              var headerChunk = debugChunks[i + 1],
                contentChunk = debugChunks[i + 2];
              if (
                i + 2 >= debugChunks.length ||
                "symbol" === typeof headerChunk ||
                "symbol" === typeof contentChunk
              )
                throw Error(
                  "A chunk pair is incomplete. This is a bug in React."
                );
              request.pendingDebugChunks -= 2;
              writeChunk(debugDestination, headerChunk);
              writeChunk(debugDestination, contentChunk);
              i += 2;
            } else
              request.pendingDebugChunks--, writeChunk(debugDestination, item);
          }
          debugChunks.splice(0, i);
        } finally {
          completeWriting(debugDestination);
        }
        flushBuffered(debugDestination);
      }
      debugDestination = request.destination;
      if (null !== debugDestination) {
        beginWriting();
        try {
          var importsChunks = request.completedImportChunks;
          for (
            debugChunks = 0;
            debugChunks < importsChunks.length;
            debugChunks++
          )
            if (
              (request.pendingChunks--,
              !writeChunkAndReturn(
                debugDestination,
                importsChunks[debugChunks]
              ))
            ) {
              request.destination = null;
              debugChunks++;
              break;
            }
          importsChunks.splice(0, debugChunks);
          var hintChunks = request.completedHintChunks;
          for (debugChunks = 0; debugChunks < hintChunks.length; debugChunks++)
            if (
              !writeChunkAndReturn(debugDestination, hintChunks[debugChunks])
            ) {
              request.destination = null;
              debugChunks++;
              break;
            }
          hintChunks.splice(0, debugChunks);
          if (null === request.debugDestination) {
            var _debugChunks = request.completedDebugChunks;
            for (
              debugChunks = 0;
              debugChunks < _debugChunks.length;
              debugChunks++
            ) {
              var _item = _debugChunks[debugChunks];
              importsChunks = void 0;
              if ("symbol" === typeof _item) {
                var _headerChunk = _debugChunks[debugChunks + 1],
                  _contentChunk = _debugChunks[debugChunks + 2];
                if (
                  debugChunks + 2 >= _debugChunks.length ||
                  "symbol" === typeof _headerChunk ||
                  "symbol" === typeof _contentChunk
                )
                  throw Error(
                    "A chunk pair is incomplete. This is a bug in React."
                  );
                request.pendingDebugChunks -= 2;
                writeChunk(debugDestination, _headerChunk);
                importsChunks = writeChunkAndReturn(
                  debugDestination,
                  _contentChunk
                );
                debugChunks += 2;
              } else
                request.pendingDebugChunks--,
                  (importsChunks = writeChunkAndReturn(
                    debugDestination,
                    _item
                  ));
              if (!importsChunks) {
                request.destination = null;
                debugChunks++;
                break;
              }
            }
            _debugChunks.splice(0, debugChunks);
          }
          var regularChunks = request.completedRegularChunks;
          for (
            debugChunks = 0;
            debugChunks < regularChunks.length;
            debugChunks++
          ) {
            var _item2 = regularChunks[debugChunks];
            _debugChunks = void 0;
            if ("symbol" === typeof _item2) {
              var _headerChunk2 = regularChunks[debugChunks + 1],
                _contentChunk2 = regularChunks[debugChunks + 2];
              if (
                debugChunks + 2 >= regularChunks.length ||
                "symbol" === typeof _headerChunk2 ||
                "symbol" === typeof _contentChunk2
              )
                throw Error(
                  "A chunk pair is incomplete. This is a bug in React."
                );
              request.pendingChunks -= 2;
              writeChunk(debugDestination, _headerChunk2);
              _debugChunks = writeChunkAndReturn(
                debugDestination,
                _contentChunk2
              );
              debugChunks += 2;
            } else
              request.pendingChunks--,
                (_debugChunks = writeChunkAndReturn(debugDestination, _item2));
            if (!_debugChunks) {
              request.destination = null;
              debugChunks++;
              break;
            }
          }
          regularChunks.splice(0, debugChunks);
          var errorChunks = request.completedErrorChunks;
          for (debugChunks = 0; debugChunks < errorChunks.length; debugChunks++)
            if (
              (request.pendingChunks--,
              !writeChunkAndReturn(debugDestination, errorChunks[debugChunks]))
            ) {
              request.destination = null;
              debugChunks++;
              break;
            }
          errorChunks.splice(0, debugChunks);
        } finally {
          (request.flushScheduled = !1), completeWriting(debugDestination);
        }
        flushBuffered(debugDestination);
      }
      0 === request.pendingChunks &&
        (cleanupInput(request),
        12 > request.status && request.abortController.abort(),
        (regularChunks = request.debugDestination),
        0 === request.pendingDebugChunks
          ? (null !== regularChunks &&
              (regularChunks.end(), (request.debugDestination = null)),
            cleanupTaintQueue(request),
            null !== request.destination &&
              ((request.status = 14),
              request.destination.end(),
              (request.destination = null)),
            null !== request.debugDestination &&
              (request.debugDestination.end(),
              (request.debugDestination = null)))
          : null !== regularChunks &&
            null !== request.destination &&
            ((request.status = 14),
            request.destination.end(),
            (request.destination = null)));
    }
    function subscribeToInput(request, input, rootTask) {
      request.pendingChunks++;
      subscribeHints(request);
      11 < request.status ||
        (request.writtenModels.set(input.root, rootTask.id),
        subscribeToThenable(request, rootTask, input.root));
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
    function startFlowingDebug(request, debugDestination) {
      if (13 === request.status)
        (request.status = 14), debugDestination.destroy(request.fatalError);
      else if (14 !== request.status && null === request.debugDestination) {
        request.debugDestination = debugDestination;
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
          request.abortTime = performance.now();
          request.abortController.abort(reason);
          var abortableTasks = request.abortableTasks;
          if (0 < abortableTasks.size) {
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
        } catch (error$16) {
          logRecoverableError(request, error$16), fatalError(request, error$16);
        }
    }
    function serializeCollectionEntries(request, model) {
      if (null === request.input)
        throw Error("Cannot serialize a detached Result.");
      var existingId = request.writtenModels.get(model);
      if (void 0 !== existingId) return existingId;
      existingId = createTask(
        request,
        null,
        request.abortableTasks,
        request.timeOrigin
      );
      request.writtenModels.set(model, existingId.id);
      subscribeToThenable(request, existingId, model, !0);
      return existingId.id;
    }
    function serializeMap(request, map) {
      var input = request.input;
      input = null === input ? void 0 : input.getCollectionEntries(map);
      if (void 0 !== input)
        return "$Q" + serializeCollectionEntries(request, input).toString(16);
      map = Array.from(map);
      return "$Q" + outlineModel(request, map).toString(16);
    }
    function serializeSet(request, set) {
      var input = request.input;
      input = null === input ? void 0 : input.getCollectionEntries(set);
      if (void 0 !== input)
        return "$W" + serializeCollectionEntries(request, input).toString(16);
      set = Array.from(set);
      return "$W" + outlineModel(request, set).toString(16);
    }
    function serializeTypedArray(request, tag, typedArray) {
      var bufferId = request.nextChunkId++;
      emitTypedArrayChunk(request, bufferId, tag, typedArray);
      request.pendingChunks++;
      return serializeByValueID(bufferId);
    }
    function emitTypedArrayChunk(request, id, tag, typedArray) {
      var debug =
        4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : !1;
      if (TaintRegistryByteLengths.has(typedArray.byteLength)) {
        var tainted = TaintRegistryValues.get(
          binaryToComparableString(typedArray)
        );
        void 0 !== tainted && throwTaintViolation(tainted.message);
      }
      debug ? request.pendingDebugChunks++ : request.pendingChunks++;
      tainted = new Uint8Array(
        new Uint8Array(
          typedArray.buffer,
          typedArray.byteOffset,
          typedArray.byteLength
        )
      );
      tainted = new Uint8Array(
        tainted.buffer,
        tainted.byteOffset,
        tainted.byteLength
      );
      var binaryLength = tainted.byteLength;
      binaryLength =
        id.toString(16) + ":" + tag + binaryLength.toString(16) + ",";
      debug
        ? request.completedDebugChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC,
            binaryLength,
            tainted
          )
        : request.completedRegularChunks.push(
            NEXT_TWO_CHUNKS_ARE_ATOMIC,
            binaryLength,
            tainted
          );
    }
    function serializeFormData(request, formData) {
      formData = Array.from(formData.entries());
      return "$K" + outlineModel(request, formData).toString(16);
    }
    function serializeBlob(request, blob) {
      function progress(entry) {
        if (0 === newTask.status)
          if (entry.done)
            request.abortController.signal.removeEventListener(
              "abort",
              abortBlob
            ),
              pingTask(request, newTask);
          else
            return (
              model.push(entry.value), reader.read().then(progress).catch(error)
            );
      }
      function error(reason) {
        0 === newTask.status &&
          (request.abortController.signal.removeEventListener(
            "abort",
            abortBlob
          ),
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
        newTask = createTask(
          request,
          model,
          request.abortableTasks,
          performance.now(),
          null,
          null,
          null
        );
      request.abortController.signal.addEventListener("abort", abortBlob);
      reader.read().then(progress).catch(error);
      return "$B" + newTask.id.toString(16);
    }
    function serializeServerReference(request, serverReference) {
      var isObjectReference = "object" === typeof serverReference,
        writtenServerReferences = request.writtenServerReferences,
        existingId = writtenServerReferences.get(serverReference);
      if (void 0 !== existingId)
        return isObjectReference
          ? "$H" + existingId.toString(16)
          : "$h" + existingId.toString(16);
      existingId = serverReference.$$id;
      if (isObjectReference) existingId = { id: existingId };
      else {
        var input = request.input;
        input =
          null === input ? void 0 : input.getServerReference(serverReference);
        if (void 0 === input)
          throw Error(
            "A Result must record server references before serialization."
          );
        var bound = input.bound,
          location = input.location;
        existingId =
          null != location
            ? {
                id: existingId,
                bound: bound,
                name: input.name,
                env: input.env,
                location: location
              }
            : { id: existingId, bound: bound };
      }
      request = outlineModel(request, existingId);
      writtenServerReferences.set(serverReference, request);
      return isObjectReference
        ? "$H" + request.toString(16)
        : "$h" + request.toString(16);
    }
    function emitChunk(request, task, value) {
      var id = task.id;
      if ("string" === typeof value && null !== byteLengthOfChunk)
        (task = TaintRegistryValues.get(value)),
          void 0 !== task && throwTaintViolation(task.message),
          emitTextChunk(request, id, value);
      else {
        var input = request.input;
        if (
          0 ===
          (null !== value && "object" === typeof value && null !== input
            ? input.getModelInfo(value) & 3
            : 0)
        ) {
          if (
            "object" === typeof value &&
            null !== value &&
            isServerReference(value)
          ) {
            task = JSON.stringify(serializeServerReference(request, value));
            emitModelChunk(request, id, task);
            return;
          }
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
        id = resolveModel(request, task, { "": value }, "", value, !0);
        id = JSON.stringify(id);
        emitModelChunk(request, task.id, id);
      }
    }
    function serializeDebugTypedArray(request, tag, typedArray) {
      if (1e3 < typedArray.byteLength && !doNotLimit.has(typedArray))
        return serializeDeferredObject(request, typedArray);
      var bufferId = request.nextChunkId++;
      emitTypedArrayChunk(request, bufferId, tag, typedArray, !0);
      request.pendingDebugChunks++;
      return serializeByValueID(bufferId);
    }
    function serializeReadableStream(request, task$jscomp$0, stream) {
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
        streamTask = createTask(
          request,
          task$jscomp$0.model,
          request.abortableTasks,
          task$jscomp$0.time,
          task$jscomp$0.debugOwner,
          task$jscomp$0.debugStack,
          task$jscomp$0.debugTask
        );
      request.pendingChunks++;
      task$jscomp$0 =
        streamTask.id.toString(16) + ":" + (isByteStream ? "r" : "R") + "\n";
      request.writtenObjects.set(stream, serializeByValueID(streamTask.id));
      request.completedRegularChunks.push(task$jscomp$0);
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
                    entry = streamTask;
                    var previousModelRoot = modelRoot,
                      parentSerializedSize = serializedSize;
                    try {
                      (modelRoot = null),
                        emitChunk(request, entry, entry.model);
                    } finally {
                      (modelRoot = previousModelRoot),
                        (serializedSize = parentSerializedSize);
                    }
                  }
                  endStreamRow = !1;
                  enqueueFlush(request);
                } catch (reason) {
                  endStreamRow && request.pendingChunks--,
                    error(reason, void 0);
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
            if (0 === streamTask.status) {
              var task = streamTask;
              request.abortableTasks.delete(task);
              haltTask(task);
              3 === task.status && request.pendingChunks--;
              enqueueFlush(request);
            }
          }
        });
      });
      return serializeByValueID(streamTask.id);
    }
    function fromHex(str) {
      return parseInt(str, 16);
    }
    function resolveDebugMessage(request, message) {
      var deferredDebugObjects = request.deferredDebugObjects;
      if (null === deferredDebugObjects)
        throw Error(
          "resolveDebugMessage/closeDebugChannel should not be called for a Request that wasn't kept alive. This is a bug in React."
        );
      if ("" === message) closeDebugChannel(request);
      else {
        var command = message.charCodeAt(0);
        message = message.slice(2).split(",").map(fromHex);
        switch (command) {
          case 82:
            for (command = 0; command < message.length; command++) {
              var id = message[command],
                retainedValue = deferredDebugObjects.retained.get(id);
              void 0 !== retainedValue &&
                (request.pendingDebugChunks--,
                deferredDebugObjects.retained.delete(id),
                deferredDebugObjects.existing.delete(retainedValue),
                enqueueFlush(request));
            }
            break;
          case 81:
            for (command = 0; command < message.length; command++)
              (id = message[command]),
                (retainedValue = deferredDebugObjects.retained.get(id)),
                void 0 !== retainedValue &&
                  (deferredDebugObjects.retained.delete(id),
                  deferredDebugObjects.existing.delete(retainedValue),
                  emitOutlinedDebugModelChunk(
                    request,
                    id,
                    { objectLimit: 10 },
                    retainedValue
                  ),
                  enqueueFlush(request));
            break;
          case 80:
            for (command = 0; command < message.length; command++)
              (id = message[command]),
                (retainedValue = deferredDebugObjects.retained.get(id)),
                void 0 !== retainedValue &&
                  (deferredDebugObjects.retained.delete(id),
                  emitRequestedDebugThenable(
                    request,
                    id,
                    { objectLimit: 10 },
                    retainedValue
                  ));
            break;
          default:
            throw Error(
              "Unknown command. The debugChannel was not wired up properly."
            );
        }
      }
    }
    function closeDebugChannel(request) {
      var deferredDebugObjects = request.deferredDebugObjects;
      if (null === deferredDebugObjects)
        throw Error(
          "resolveDebugMessage/closeDebugChannel should not be called for a Request that wasn't kept alive. This is a bug in React."
        );
      deferredDebugObjects.retained.forEach(function (value, id) {
        request.pendingDebugChunks--;
        deferredDebugObjects.retained.delete(id);
        deferredDebugObjects.existing.delete(value);
      });
      enqueueFlush(request);
    }
    function serializeErrorValue(request, error) {
      var name = "Error",
        env = (0, request.environmentName)(),
        input = request.input;
      input = null === input ? void 0 : input.getErrorInfo(error);
      if (void 0 !== input) {
        name = input.name;
        var message = input.message;
        var stack = input.stack;
        env = input.env;
      } else
        try {
          name = error.name;
          message = String(error.message);
          stack = filterStackTrace(request, parseStackTrace(error, 0));
          var errorEnv = error.environmentName;
          "string" === typeof errorEnv && (env = errorEnv);
        } catch (x) {
          (message =
            "An error occurred but serializing the error message failed."),
            (stack = []);
        }
      name = { name: name, message: message, stack: stack, env: env };
      "cause" in error &&
        ((message = outlineModel(request, error.cause)),
        (name.cause = serializeByValueID(message)));
      "undefined" !== typeof AggregateError &&
        error instanceof AggregateError &&
        ((error = outlineModel(request, error.errors)),
        (name.errors = serializeByValueID(error)));
      return "$Z" + outlineModel(request, name).toString(16);
    }
    function serializeDebugBlob(request, blob) {
      function progress(entry) {
        if (entry.done)
          emitOutlinedDebugModelChunk(
            request,
            id,
            { objectLimit: model.length + 2 },
            model
          ),
            enqueueFlush(request);
        else
          return (
            model.push(entry.value), reader.read().then(progress).catch(error)
          );
      }
      function error(reason) {
        emitErrorChunk(request, id, "", reason, !0, null);
        enqueueFlush(request);
        reader.cancel(reason).then(noop, noop);
      }
      var model = [blob.type],
        reader = blob.stream().getReader();
      request.pendingDebugChunks++;
      var id = request.nextChunkId++;
      reader.read().then(progress).catch(error);
      return "$B" + id.toString(16);
    }
    function serializeAsyncIterable(request, task$jscomp$0, iterable) {
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
        throw Error(
          "A Result must record async iterables before serialization."
        );
      var streamTask = createTask(
        request,
        task$jscomp$0.model,
        request.abortableTasks,
        task$jscomp$0.time,
        task$jscomp$0.debugOwner,
        task$jscomp$0.debugStack,
        task$jscomp$0.debugTask
      );
      request.pendingChunks++;
      task$jscomp$0 =
        streamTask.id.toString(16) +
        ":" +
        (source.isIterator ? "x" : "X") +
        "\n";
      request.writtenObjects.set(iterable, serializeByValueID(streamTask.id));
      request.completedRegularChunks.push(task$jscomp$0);
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
            if (0 === streamTask.status) {
              var task = streamTask;
              request.abortableTasks.delete(task);
              haltTask(task);
              3 === task.status && request.pendingChunks--;
              enqueueFlush(request);
            }
          }
        });
      });
      return serializeByValueID(streamTask.id);
    }
    function startReadingFromDebugChannelReadable(request, stream) {
      function onData(chunk) {
        "string" === typeof chunk
          ? (lastWasPartial &&
              ((stringBuffer += readFinalStringChunk(
                stringDecoder,
                new Uint8Array(0)
              )),
              (lastWasPartial = !1)),
            (stringBuffer += chunk))
          : ((stringBuffer += stringDecoder.decode(chunk, decoderOptions)),
            (lastWasPartial = !0));
        chunk = stringBuffer.split("\n");
        for (var i = 0; i < chunk.length - 1; i++)
          resolveDebugMessage(request, chunk[i]);
        stringBuffer = chunk[chunk.length - 1];
      }
      function onError(error) {
        abort(
          request,
          Error("Lost connection to the Debug Channel.", { cause: error })
        );
      }
      function onClose() {
        closeDebugChannel(request);
      }
      var stringDecoder = createStringDecoder(),
        lastWasPartial = !1,
        stringBuffer = "";
      "function" === typeof stream.addEventListener &&
      "string" === typeof stream.binaryType
        ? ((stream.binaryType = "arraybuffer"),
          stream.addEventListener("message", function (event) {
            onData(event.data);
          }),
          stream.addEventListener("error", function (event) {
            onError(event.error);
          }),
          stream.addEventListener("close", onClose))
        : (stream.on("data", onData),
          stream.on("error", onError),
          stream.on("end", onClose));
    }
    function createFakeWritableFromWebSocket(webSocket) {
      return {
        write: function (chunk) {
          webSocket.send(chunk);
          return !0;
        },
        end: function () {
          webSocket.close();
        },
        destroy: function (reason) {
          "object" === typeof reason &&
            null !== reason &&
            (reason = reason.message);
          "string" === typeof reason
            ? webSocket.close(1011, reason)
            : webSocket.close(1011);
        }
      };
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
    function renderToPipeableStream(input, turbopackMap, options) {
      var debugChannel = options ? options.debugChannel : void 0,
        debugChannelReadable =
          void 0 === debugChannel ||
          ("function" !== typeof debugChannel.read &&
            "number" !== typeof debugChannel.readyState)
            ? void 0
            : debugChannel;
      debugChannel =
        void 0 !== debugChannel
          ? "function" === typeof debugChannel.write
            ? debugChannel
            : "function" === typeof debugChannel.send
              ? createFakeWritableFromWebSocket(debugChannel)
              : void 0
          : void 0;
      var request = createRequest(
          input,
          turbopackMap,
          options ? options.onError : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.startTime : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          void 0 !== debugChannelReadable
        ),
        hasStartedFlowing = !1;
      startWork(request);
      void 0 !== debugChannel && startFlowingDebug(request, debugChannel);
      void 0 !== debugChannelReadable &&
        startReadingFromDebugChannelReadable(request, debugChannelReadable);
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
          if (void 0 === debugChannelReadable)
            destination.on(
              "close",
              createCancelHandler(
                request,
                "The destination stream closed early."
              )
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
    function startReadingFromDebugChannelReadableStream(request, stream) {
      function progress(_ref) {
        var done = _ref.done;
        _ref = _ref.value;
        stringBuffer += done
          ? readFinalStringChunk(stringDecoder, new Uint8Array(0))
          : stringDecoder.decode(_ref, decoderOptions);
        _ref = stringBuffer.split("\n");
        for (var i = 0; i < _ref.length - 1; i++)
          resolveDebugMessage(request, _ref[i]);
        stringBuffer = _ref[_ref.length - 1];
        if (done) closeDebugChannel(request);
        else return reader.read().then(progress).catch(error);
      }
      function error(e) {
        abort(
          request,
          Error("Lost connection to the Debug Channel.", { cause: e })
        );
      }
      var reader = stream.getReader(),
        stringDecoder = createStringDecoder(),
        stringBuffer = "";
      reader.read().then(progress).catch(error);
    }
    function renderToReadableStream(input, turbopackMap, options) {
      var debugChannelReadable =
          options && options.debugChannel
            ? options.debugChannel.readable
            : void 0,
        debugChannelWritable =
          options && options.debugChannel
            ? options.debugChannel.writable
            : void 0,
        request = createRequest(
          input,
          turbopackMap,
          options ? options.onError : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.startTime : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          void 0 !== debugChannelReadable
        );
      options && options.signal && attachAbortSignal(request, options.signal);
      if (void 0 !== debugChannelWritable) {
        var debugWritable;
        new ReadableStream(
          {
            type: "bytes",
            start: function (controller) {
              debugWritable =
                createFakeWritableFromReadableStreamController(controller);
            },
            pull: function () {
              startFlowingDebug(request, debugWritable);
            }
          },
          { highWaterMark: 0 }
        ).pipeTo(debugChannelWritable);
      }
      void 0 !== debugChannelReadable &&
        startReadingFromDebugChannelReadableStream(
          request,
          debugChannelReadable
        );
      var writable;
      return new ReadableStream(
        {
          type: "bytes",
          start: function (controller) {
            writable =
              createFakeWritableFromReadableStreamController(controller);
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
      null != arguments[0] &&
        console.error(
          'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
        );
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
    var stream = require("stream"),
      util = require("util");
    require("crypto");
    var async_hooks = require("async_hooks"),
      ReactDOM = require("react-dom"),
      React = require("react"),
      REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"),
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
      MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
      ASYNC_ITERATOR = Symbol.asyncIterator,
      REACT_OPTIMISTIC_KEY = Symbol.for("react.optimistic_key"),
      scheduleMicrotask = queueMicrotask,
      currentView = null,
      writtenBytes = 0,
      destinationHasCapacity = !0,
      textEncoder = new util.TextEncoder(),
      CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference"),
      SERVER_REFERENCE_TAG = Symbol.for("react.server.reference"),
      FunctionBind$1 = Function.prototype.bind,
      ArraySlice$1 = Array.prototype.slice,
      serverReferenceToString = {
        value: function () {
          return "function () { [omitted code] }";
        },
        configurable: !0,
        writable: !0
      },
      PROMISE_PROTOTYPE = Promise.prototype,
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
      previousDispatcher$1 = ReactDOMSharedInternals.d;
    ReactDOMSharedInternals.d = {
      f: previousDispatcher$1.f,
      r: previousDispatcher$1.r,
      D: function (href) {
        if ("string" === typeof href && href) {
          var request = resolveRequest$1();
          if (request) {
            var hints = request.hints,
              key = "D|" + href;
            hints.has(key) || (hints.add(key), emitHint$2(request, "D", href));
          } else previousDispatcher$1.D(href);
        }
      },
      C: function (href, crossOrigin) {
        if ("string" === typeof href) {
          var request = resolveRequest$1();
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
                ? emitHint$2(request, "C", [href, crossOrigin])
                : emitHint$2(request, "C", href));
          } else previousDispatcher$1.C(href, crossOrigin);
        }
      },
      L: preload$1,
      m: preloadModule$2,
      X: function (src, options) {
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
      },
      S: function (href, precedence, options) {
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
      },
      M: function (src, options) {
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
    };
    var currentOwner = null,
      currentCache = null,
      getAsyncId = async_hooks.AsyncResource.prototype.asyncId,
      pendingOperations = new Map(),
      lastRanAwait = null,
      initialized = !1,
      emptyStack = [],
      framesToSkip = 0,
      collectedStackTrace = null,
      identifierRegExp = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
      frameRegExp =
        /^ {3} at (?:(.+) \((?:(.+):(\d+):(\d+)|<anonymous>)\)|(?:async )?(.+):(\d+):(\d+)|<anonymous>)$/,
      stackTraceCache = new WeakMap(),
      requestStorage = new async_hooks.AsyncLocalStorage(),
      cacheStorage = new async_hooks.AsyncLocalStorage(),
      componentStorage = new async_hooks.AsyncLocalStorage(),
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
      },
      SuspenseException = Error(
        "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
      ),
      suspendedThenable = null,
      currentRequest$3 = null,
      thenableIndexCounter$1 = 0,
      thenableState$1 = null,
      currentComponentDebugInfo$1 = null,
      HooksDispatcher$1 = {
        readContext: unsupportedContext$1,
        use: function (usable) {
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
        },
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
        useId: function () {
          if (null === currentRequest$3)
            throw Error("useId can only be used while React is rendering");
          var id = currentRequest$3.identifierCount++;
          return (
            "_" +
            currentRequest$3.identifierPrefix +
            "S_" +
            id.toString(32) +
            "_"
          );
        },
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
      },
      DefaultAsyncDispatcher = {
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
      };
    DefaultAsyncDispatcher.getOwner = resolveOwner;
    var ReactSharedInternalsServer =
      React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    if (!ReactSharedInternalsServer)
      throw Error(
        'The "react" package in this environment is not configured correctly. The "react-server" condition must be enabled in any environment that runs React Server Components.'
      );
    var prefix, suffix;
    new ("function" === typeof WeakMap ? WeakMap : Map)();
    var lastResetTime = 0;
    if (
      "object" === typeof performance &&
      "function" === typeof performance.now
    ) {
      var localPerformance = performance;
      var getCurrentTime = function () {
        return localPerformance.now();
      };
    } else {
      var localDate = Date;
      getCurrentTime = function () {
        return localDate.now();
      };
    }
    var callComponent = {
        react_stack_bottom_frame: function (
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
        callComponent.react_stack_bottom_frame.bind(callComponent),
      callLazyInit = {
        react_stack_bottom_frame: function (lazy) {
          var init = lazy._init;
          return init(lazy._payload);
        }
      },
      callLazyInitInDEV =
        callLazyInit.react_stack_bottom_frame.bind(callLazyInit),
      callIterator = {
        react_stack_bottom_frame: function (iterator, progress, error) {
          iterator.next().then(progress, error);
        }
      },
      callIteratorInDEV =
        callIterator.react_stack_bottom_frame.bind(callIterator),
      isArrayImpl = Array.isArray,
      getPrototypeOf$2 = Object.getPrototypeOf,
      jsxPropsParents = new WeakMap(),
      jsxChildrenParents = new WeakMap(),
      CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
      hasOwnProperty = Object.prototype.hasOwnProperty,
      doNotLimit$1 = new WeakSet();
    initAsyncDebugInfo();
    "object" === typeof console &&
      null !== console &&
      (patchConsole$2(console, "assert"),
      patchConsole$2(console, "debug"),
      patchConsole$2(console, "dir"),
      patchConsole$2(console, "dirxml"),
      patchConsole$2(console, "error"),
      patchConsole$2(console, "group"),
      patchConsole$2(console, "groupCollapsed"),
      patchConsole$2(console, "groupEnd"),
      patchConsole$2(console, "info"),
      patchConsole$2(console, "log"),
      patchConsole$2(console, "table"),
      patchConsole$2(console, "trace"),
      patchConsole$2(console, "warn"));
    var ObjectPrototype$3 = Object.prototype,
      stringify$1 = JSON.stringify,
      PENDING$3 = 0,
      COMPLETED$2 = 1,
      ABORTED$2 = 3,
      ERRORED$3 = 4,
      RENDERING$2 = 5,
      __PROTO__$1 = "__proto__",
      OPENING$2 = 10,
      OPEN$2 = 11,
      ABORTING$2 = 12,
      CLOSING$1 = 13,
      CLOSED$2 = 14,
      PRERENDER$1 = 21,
      NEXT_TWO_CHUNKS_ARE_ATOMIC$1 = Symbol(),
      TaintRegistryObjects$2 = ReactSharedInternalsServer.TaintRegistryObjects,
      TaintRegistryValues$2 = ReactSharedInternalsServer.TaintRegistryValues,
      TaintRegistryByteLengths$2 =
        ReactSharedInternalsServer.TaintRegistryByteLengths,
      TaintRegistryPendingRequests$2 =
        ReactSharedInternalsServer.TaintRegistryPendingRequests,
      currentRequest$2 = null,
      canEmitDebugInfo$1 = !1,
      serializedSize$1 = 0,
      MAX_ROW_SIZE$1 = 3200,
      MIN_DEDUPLICATED_IMPORT_STRING_LENGTH$1 = 16,
      MAX_DEDUPLICATED_IMPORT_STRINGS_SIZE$1 = 32768,
      modelRoot$2 = !1,
      importStringRequest$1 = null,
      MAX_IMPORT_METADATA_DEPTH$1 = 16,
      NOT_PLAIN_IMPORT_METADATA$1 = {},
      CONSTRUCTOR_MARKER$1 = Symbol(),
      debugModelRoot$1 = null,
      debugNoOutline$1 = null,
      emptyRoot$1 = {},
      decoderOptions = { stream: !0 },
      instrumentedChunks = new WeakSet(),
      loadedChunks = new WeakSet(),
      RESPONSE_SYMBOL = Symbol();
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
              (null === this.value && (this.value = []),
              this.value.push(resolve));
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
      ArrayPrototype = Array.prototype,
      initializingHandler = null;
    FlightIterator.prototype = {};
    FlightIterator.prototype[ASYNC_ITERATOR] = function () {
      return this;
    };
    var MAX_BIGINT_DIGITS = 300,
      MAX_BOUND_ARGS = 1e3,
      SequencePrototype = {},
      currentRequest$1 = null,
      thenableIndexCounter = 0,
      thenableState = null,
      currentComponentDebugInfo = null,
      HooksDispatcher = {
        readContext: unsupportedContext,
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
          if (isClientReference(usable)) {
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
        },
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
        useId: function () {
          if (null === currentRequest$1)
            throw Error("useId can only be used while React is rendering");
          var id = currentRequest$1.identifierCount++;
          return (
            "_" +
            currentRequest$1.identifierPrefix +
            "S_" +
            id.toString(32) +
            "_"
          );
        },
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
      },
      RESULT_MODEL_TYPE = Symbol.for("react.result.model");
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
    var previousDispatcher = ReactDOMSharedInternals.d;
    ReactDOMSharedInternals.d = {
      f: previousDispatcher.f,
      r: previousDispatcher.r,
      D: function (href) {
        if ("string" === typeof href && href) {
          var request = resolveRequest();
          if (request) {
            var hints = request.hints,
              key = "D|" + href;
            hints.has(key) || (hints.add(key), emitHint$1(request, "D", href));
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
                ? emitHint$1(request, "C", [href, crossOrigin])
                : emitHint$1(request, "C", href));
          } else previousDispatcher.C(href, crossOrigin);
        }
      },
      L: preload,
      m: preloadModule,
      X: function (src, options) {
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
              ? emitHint$1(request, "M", [src, options])
              : emitHint$1(request, "M", src);
          }
          previousDispatcher.M(src, options);
        }
      }
    };
    var NO_SCOPE = 0,
      NOSCRIPT_SCOPE = 1,
      PICTURE_SCOPE = 2,
      UNDEFINED_MODEL = Symbol(),
      PENDING$1 = 0,
      COMPLETED$1 = 1,
      RENDERING$1 = 5,
      BLOCKED = 6,
      ERRORED$1 = 4,
      OPENING$1 = 10,
      OPEN$1 = 11,
      ABORTING$1 = 12,
      ABORTED$1 = 3,
      PRERENDER = 21,
      CLOSED$1 = 14,
      ObjectPrototype$1 = Object.prototype,
      DatePrototype = Date.prototype,
      dateToJSON = DatePrototype.toJSON,
      dateToISOString = DatePrototype.toISOString,
      dateValueOf = DatePrototype.valueOf,
      dateToPrimitive = Date.prototype[Symbol.toPrimitive],
      dateGetTime = DatePrototype.getTime,
      getPrototypeOf$1 = Object.getPrototypeOf,
      modelRoot$1 = null,
      canEmitDebugInfo = !1,
      modelDepth = 0,
      MAX_MODEL_DEPTH = 128,
      emptyRoot = {},
      TaintRegistryObjects$1 = ReactSharedInternalsServer.TaintRegistryObjects,
      TaintRegistryValues$1 = ReactSharedInternalsServer.TaintRegistryValues,
      TaintRegistryByteLengths$1 =
        ReactSharedInternalsServer.TaintRegistryByteLengths,
      TaintRegistryPendingRequests$1 =
        ReactSharedInternalsServer.TaintRegistryPendingRequests;
    initAsyncDebugInfo();
    "object" === typeof console &&
      null !== console &&
      (patchConsole$1(console, "assert"),
      patchConsole$1(console, "debug"),
      patchConsole$1(console, "dir"),
      patchConsole$1(console, "dirxml"),
      patchConsole$1(console, "error"),
      patchConsole$1(console, "group"),
      patchConsole$1(console, "groupCollapsed"),
      patchConsole$1(console, "groupEnd"),
      patchConsole$1(console, "info"),
      patchConsole$1(console, "log"),
      patchConsole$1(console, "table"),
      patchConsole$1(console, "trace"),
      patchConsole$1(console, "warn"));
    var stringify = JSON.stringify,
      getPrototypeOf = Object.getPrototypeOf,
      ObjectPrototype = Object.prototype,
      importStringRequest = null,
      NOT_PLAIN_IMPORT_METADATA = {},
      doNotLimit = new WeakSet(),
      CONSTRUCTOR_MARKER = Symbol(),
      debugModelRoot = null,
      debugNoOutline = null,
      currentRequest = null,
      NEXT_TWO_CHUNKS_ARE_ATOMIC = Symbol(),
      TaintRegistryObjects = ReactSharedInternalsServer.TaintRegistryObjects,
      TaintRegistryValues = ReactSharedInternalsServer.TaintRegistryValues,
      TaintRegistryByteLengths =
        ReactSharedInternalsServer.TaintRegistryByteLengths,
      TaintRegistryPendingRequests =
        ReactSharedInternalsServer.TaintRegistryPendingRequests,
      modelRoot = null,
      serializedSize = 0,
      MAX_ROW_SIZE = 3200;
    "object" === typeof console &&
      null !== console &&
      (patchConsole(console, "assert"),
      patchConsole(console, "debug"),
      patchConsole(console, "dir"),
      patchConsole(console, "dirxml"),
      patchConsole(console, "error"),
      patchConsole(console, "group"),
      patchConsole(console, "groupCollapsed"),
      patchConsole(console, "groupEnd"),
      patchConsole(console, "info"),
      patchConsole(console, "log"),
      patchConsole(console, "table"),
      patchConsole(console, "trace"),
      patchConsole(console, "warn"));
    var FunctionBind = Function.prototype.bind,
      ArraySlice = Array.prototype.slice;
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
          (action = loadServerReference(serverManifest, {
            id: body,
            bound: null
          }));
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
        body,
        options ? options.arraySizeLimit : void 0
      );
      turbopackMap = getChunk(body, 0);
      close(body);
      return turbopackMap;
    };
    exports.decodeReplyFromAsyncIterable = function (
      iterable,
      turbopackMap,
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
            : appendBackingEntry(response._formData, entry, _entry$value);
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
          turbopackMap,
          "",
          options ? options.temporaryReferences : void 0,
          void 0,
          options ? options.arraySizeLimit : void 0
        );
      iterator.next().then(progress, error);
      return getChunk(response, 0);
    };
    exports.decodeReplyFromBusboy = function (
      busboyStream,
      turbopackMap,
      options
    ) {
      function flush() {
        for (; null !== head; ) {
          var current = head;
          if (!current.complete) return;
          try {
            var response = response$jscomp$0,
              key = current.name,
              handle = current.file,
              blob = new Blob(handle.chunks, { type: handle.mime }),
              backingStore = response._formData;
            response = key;
            backingStore.data.append(response, blob, handle.filename);
            var keys = backingStore.keys;
            null === keys
              ? ((backingStore.keys = Array.from(backingStore.data.keys())),
                (backingStore.keyPointer = 0))
              : keys.push(response);
            var queuedFields = current.queuedFields;
            if (null !== queuedFields)
              for (response = 0; response < queuedFields.length; response += 2)
                resolveField(
                  response$jscomp$0,
                  queuedFields[response],
                  queuedFields[response + 1]
                );
          } catch (error) {
            busboyStream.destroy(error);
            return;
          }
          head = current.next;
        }
        tail = null;
        bodyFinished && !closed && ((closed = !0), close(response$jscomp$0));
      }
      var response$jscomp$0 = createResponse(
          turbopackMap,
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
            resolveField(response$jscomp$0, name, value);
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
            response$jscomp$0,
            Error("Reply finished with incomplete file part.")
          );
      });
      busboyStream.on("error", function (err) {
        reportGlobalError(response$jscomp$0, err);
      });
      return getChunk(response$jscomp$0, 0);
    };
    exports.prerender = function (model, turbopackMap, options) {
      return new Promise(function (resolve, reject) {
        var request = createPrerenderRequest$1(
          model,
          turbopackMap,
          function () {
            var writable,
              stream = new ReadableStream(
                {
                  type: "bytes",
                  start: function (controller) {
                    writable =
                      createFakeWritableFromReadableStreamController$1(
                        controller
                      );
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
          options ? options.onError : void 0,
          options ? options.identifierPrefix : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.startTime : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          !1
        );
        options &&
          options.signal &&
          attachAbortSignal$2(request, options.signal);
        startWork$2(request);
      });
    };
    exports.prerenderToNodeStream = function (model, turbopackMap, options) {
      return new Promise(function (resolve, reject) {
        var request = createPrerenderRequest$1(
          model,
          turbopackMap,
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
          options ? options.onError : void 0,
          options ? options.identifierPrefix : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.startTime : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          !1
        );
        options &&
          options.signal &&
          attachAbortSignal$2(request, options.signal);
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
          createServerReference,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          options ? options.startTime : void 0
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
    exports.registerServerObjectReference = function (
      reference,
      id,
      exportName
    ) {
      "function" === typeof reference &&
        console.error(
          "registerServerObjectReference: The reference is a function. Use registerServerReference to register a function as a Server Reference."
        );
      return Object.defineProperties(reference, {
        $$typeof: { value: SERVER_REFERENCE_TAG },
        $$id: {
          value: null === exportName ? id : id + "#" + exportName,
          configurable: !0
        }
      });
    };
    exports.registerServerReference = registerServerReference;
    exports.renderResultToPipeableStream = function (
      result,
      turbopackMap,
      options
    ) {
      result = createInput(result);
      return renderToPipeableStream(result, turbopackMap, options);
    };
    exports.renderResultToReadableStream = function (
      result,
      turbopackMap,
      options
    ) {
      result = createInput(result);
      return renderToReadableStream(result, turbopackMap, options);
    };
    exports.renderToPipeableStream = function (model, turbopackMap, options) {
      var debugChannel = options ? options.debugChannel : void 0,
        debugChannelReadable =
          void 0 === debugChannel ||
          ("function" !== typeof debugChannel.read &&
            "number" !== typeof debugChannel.readyState)
            ? void 0
            : debugChannel;
      debugChannel =
        void 0 !== debugChannel
          ? "function" === typeof debugChannel.write
            ? debugChannel
            : "function" === typeof debugChannel.send
              ? createFakeWritableFromWebSocket$1(debugChannel)
              : void 0
          : void 0;
      var request = createRequest$2(
          model,
          turbopackMap,
          options ? options.onError : void 0,
          options ? options.identifierPrefix : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.startTime : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          void 0 !== debugChannelReadable
        ),
        hasStartedFlowing = !1;
      startWork$2(request);
      void 0 !== debugChannel && startFlowingDebug$1(request, debugChannel);
      void 0 !== debugChannelReadable &&
        startReadingFromDebugChannelReadable$1(request, debugChannelReadable);
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
          if (void 0 === debugChannelReadable)
            destination.on(
              "close",
              createCancelHandler$1(
                request,
                "The destination stream closed early."
              )
            );
          return destination;
        },
        abort: function (reason) {
          abort$2(request, reason);
        }
      };
    };
    exports.renderToReadableStream = function (model, turbopackMap, options) {
      var debugChannelReadable =
          options && options.debugChannel
            ? options.debugChannel.readable
            : void 0,
        debugChannelWritable =
          options && options.debugChannel
            ? options.debugChannel.writable
            : void 0,
        request = createRequest$2(
          model,
          turbopackMap,
          options ? options.onError : void 0,
          options ? options.identifierPrefix : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.startTime : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          void 0 !== debugChannelReadable
        );
      options && options.signal && attachAbortSignal$2(request, options.signal);
      if (void 0 !== debugChannelWritable) {
        var debugWritable;
        new ReadableStream(
          {
            type: "bytes",
            start: function (controller) {
              debugWritable =
                createFakeWritableFromReadableStreamController$1(controller);
            },
            pull: function () {
              startFlowingDebug$1(request, debugWritable);
            }
          },
          { highWaterMark: 0 }
        ).pipeTo(debugChannelWritable);
      }
      void 0 !== debugChannelReadable &&
        startReadingFromDebugChannelReadableStream$1(
          request,
          debugChannelReadable
        );
      var writable;
      return new ReadableStream(
        {
          type: "bytes",
          start: function (controller) {
            writable =
              createFakeWritableFromReadableStreamController$1(controller);
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
      var onError = options ? options.onError : void 0,
        identifierPrefix = options ? options.identifierPrefix : void 0,
        temporaryReferences = options ? options.temporaryReferences : void 0,
        environmentName = options ? options.environmentName : void 0,
        filterStackFrame = options ? options.filterStackFrame : void 0,
        debugStartTime = options ? options.startTime : void 0;
      resetOwnerStackLimit();
      model = new RequestInstance$1(
        model,
        onError,
        identifierPrefix,
        temporaryReferences,
        createServerReference,
        20,
        noop,
        noop,
        environmentName,
        filterStackFrame,
        debugStartTime
      );
      startWork$1(model);
      options && options.signal && attachAbortSignal$1(model, options.signal);
      return model.result;
    };
  })();
