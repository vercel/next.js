/**
 * @license React
 * react-server-dom-webpack-server.edge.development.js
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
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable)
        return null;
      maybeIterable =
        (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
        maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    function _defineProperty(obj, key, value) {
      a: if ("object" == typeof key && key) {
        var e = key[Symbol.toPrimitive];
        if (void 0 !== e) {
          key = e.call(key, "string");
          if ("object" != typeof key) break a;
          throw new TypeError("@@toPrimitive must return a primitive value.");
        }
        key = String(key);
      }
      key = "symbol" == typeof key ? key : key + "";
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
    function handleErrorInNextTick(error) {
      setTimeout(function () {
        throw error;
      });
    }
    function writeChunkAndReturn(destination, chunk) {
      if (0 !== chunk.byteLength)
        if (2048 < chunk.byteLength)
          0 < writtenBytes &&
            (destination.enqueue(
              new Uint8Array(currentView.buffer, 0, writtenBytes)
            ),
            (currentView = new Uint8Array(2048)),
            (writtenBytes = 0)),
            destination.enqueue(chunk);
        else {
          var allowableBytes = currentView.length - writtenBytes;
          allowableBytes < chunk.byteLength &&
            (0 === allowableBytes
              ? destination.enqueue(currentView)
              : (currentView.set(
                  chunk.subarray(0, allowableBytes),
                  writtenBytes
                ),
                destination.enqueue(currentView),
                (chunk = chunk.subarray(allowableBytes))),
            (currentView = new Uint8Array(2048)),
            (writtenBytes = 0));
          currentView.set(chunk, writtenBytes);
          writtenBytes += chunk.byteLength;
        }
      return !0;
    }
    function completeWriting(destination) {
      currentView &&
        0 < writtenBytes &&
        (destination.enqueue(
          new Uint8Array(currentView.buffer, 0, writtenBytes)
        ),
        (currentView = null),
        (writtenBytes = 0));
    }
    function stringToChunk(content) {
      return textEncoder.encode(content);
    }
    function byteLengthOfChunk(chunk) {
      return chunk.byteLength;
    }
    function closeWithError(destination, error) {
      "function" === typeof destination.error
        ? destination.error(error)
        : destination.close();
    }
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
    function bind() {
      var newFn = FunctionBind.apply(this, arguments);
      if (this.$$typeof === SERVER_REFERENCE_TAG) {
        null != arguments[0] &&
          console.error(
            'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
          );
        var args = ArraySlice.call(arguments, 1),
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
              ((name = name.slice(5)), (isAsync = !0));
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
    function noop() {}
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
    function resolveOwner() {
      if (currentOwner) return currentOwner;
      if (supportsComponentStorage) {
        var owner = componentStorage.getStore();
        if (owner) return owner;
      }
      return null;
    }
    function prepareStackTrace(error, structuredStackTrace) {
      error = (error.name || "Error") + ": " + (error.message || "");
      for (var i = 0; i < structuredStackTrace.length; i++)
        error += "\n    at " + structuredStackTrace[i].toString();
      return error;
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
      if (getPrototypeOf(object)) return !1;
      object = Object.getOwnPropertyNames(object);
      for (var i = 0; i < object.length; i++)
        if (!(object[i] in ObjectPrototype)) return !1;
      return !0;
    }
    function isGetter(object, name) {
      if (object === Object.prototype || null === object) return !1;
      var descriptor = Object.getOwnPropertyDescriptor(object, name);
      return void 0 === descriptor
        ? isGetter(getPrototypeOf(object), name)
        : "function" === typeof descriptor.get;
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
        if (url.startsWith("rsc://React/")) {
          var envIdx = url.indexOf("/", 12),
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
          var request = resolveRequest();
          if (("assert" !== methodName || !arguments[0]) && null !== request) {
            a: {
              var error = Error("react-stack-top-frame");
              collectedStackTrace = null;
              framesToSkip = 1;
              var previousPrepare = Error.prepareStackTrace;
              Error.prepareStackTrace = collectStackTracePrivate;
              try {
                if ("" !== error.stack) {
                  var JSCompiler_inline_result = null;
                  break a;
                }
              } finally {
                Error.prepareStackTrace = previousPrepare;
              }
              JSCompiler_inline_result = collectedStackTrace;
            }
            JSCompiler_inline_result = filterStackTrace(
              request,
              JSCompiler_inline_result || []
            );
            request.pendingDebugChunks++;
            error = resolveOwner();
            previousPrepare = Array.from(arguments);
            a: {
              var env = 0;
              switch (methodName) {
                case "dir":
                case "dirxml":
                case "groupEnd":
                case "table":
                  env = null;
                  break a;
                case "assert":
                  env = 1;
              }
              var format = previousPrepare[env],
                style = previousPrepare[env + 1],
                badge = previousPrepare[env + 2];
              "string" === typeof format &&
              format.startsWith("\u001b[0m\u001b[7m%c%s\u001b[0m%c ") &&
              "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px" ===
                style &&
              "string" === typeof badge
                ? (previousPrepare.splice(env, 4, format.slice(19)),
                  (env = badge.slice(1, badge.length - 1)))
                : (env = null);
            }
            null === env && (env = (0, request.environmentName)());
            null != error && outlineComponentInfo(request, error);
            format = [methodName, JSCompiler_inline_result, error, env];
            format.push.apply(format, previousPrepare);
            previousPrepare = serializeDebugModel(
              request,
              (null === request.deferredDebugObjects ? 500 : 10) +
                JSCompiler_inline_result.length,
              format
            );
            "[" !== previousPrepare[0] &&
              (previousPrepare = serializeDebugModel(
                request,
                10 + JSCompiler_inline_result.length,
                [
                  methodName,
                  JSCompiler_inline_result,
                  error,
                  env,
                  "Unknown Value: React could not send it from the server."
                ]
              ));
            JSCompiler_inline_result = stringToChunk(
              ":W" + previousPrepare + "\n"
            );
            request.completedDebugChunks.push(JSCompiler_inline_result);
          }
          return originalMethod.apply(this, arguments);
        };
        descriptor && Object.defineProperty(wrapperMethod, "name", descriptor);
        Object.defineProperty(consoleInst, methodName, {
          value: wrapperMethod
        });
      }
    }
    function getCurrentStackInDEV() {
      var owner = resolveOwner();
      if (null === owner) return "";
      try {
        var info = "";
        if (owner.owner || "string" !== typeof owner.name) {
          for (; owner; ) {
            var ownerStack = owner.debugStack;
            if (null != ownerStack) {
              if ((owner = owner.owner)) {
                var JSCompiler_temp_const = info;
                var error = ownerStack,
                  prevPrepareStackTrace = Error.prepareStackTrace;
                Error.prepareStackTrace = prepareStackTrace;
                var stack = error.stack;
                Error.prepareStackTrace = prevPrepareStackTrace;
                stack.startsWith("Error: react-stack-top-frame\n") &&
                  (stack = stack.slice(29));
                var idx = stack.indexOf("\n");
                -1 !== idx && (stack = stack.slice(idx + 1));
                idx = stack.indexOf("react_stack_bottom_frame");
                -1 !== idx && (idx = stack.lastIndexOf("\n", idx));
                var JSCompiler_inline_result =
                  -1 !== idx ? (stack = stack.slice(0, idx)) : "";
                info =
                  JSCompiler_temp_const + ("\n" + JSCompiler_inline_result);
              }
            } else break;
          }
          var JSCompiler_inline_result$jscomp$0 = info;
        } else {
          JSCompiler_temp_const = owner.name;
          if (void 0 === prefix)
            try {
              throw Error();
            } catch (x) {
              (prefix =
                ((error = x.stack.trim().match(/\n( *(at )?)/)) && error[1]) ||
                ""),
                (suffix =
                  -1 < x.stack.indexOf("\n    at")
                    ? " (<anonymous>)"
                    : -1 < x.stack.indexOf("@")
                      ? "@unknown:0:0"
                      : "");
            }
          JSCompiler_inline_result$jscomp$0 =
            "\n" + prefix + JSCompiler_temp_const + suffix;
        }
      } catch (x) {
        JSCompiler_inline_result$jscomp$0 =
          "\nError generating stack: " + x.message + "\n" + x.stack;
      }
      return JSCompiler_inline_result$jscomp$0;
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
    function defaultErrorHandler(error) {
      console.error(error);
    }
    function RequestInstance(
      type,
      model,
      bundlerConfig,
      onError,
      onPostpone,
      onAllReady,
      onFatalError,
      identifierPrefix,
      temporaryReferences,
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
      ReactSharedInternalsServer.getCurrentStack = getCurrentStackInDEV;
      var abortSet = new Set(),
        pingedTasks = [],
        cleanupQueue = [];
      TaintRegistryPendingRequests.add(cleanupQueue);
      var hints = new Set();
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
      this.temporaryReferences = temporaryReferences;
      this.identifierPrefix = identifierPrefix || "";
      this.identifierCount = 1;
      this.taintCleanupQueue = cleanupQueue;
      this.onError = void 0 === onError ? defaultErrorHandler : onError;
      this.onPostpone =
        void 0 === onPostpone ? defaultPostponeHandler : onPostpone;
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
          ? defaultFilterStackFrame
          : filterStackFrame;
      this.didWarnForKey = null;
      this.writtenDebugObjects = new WeakMap();
      this.deferredDebugObjects = keepDebugAlive
        ? { retained: new Map(), existing: new Map() }
        : null;
      type = this.timeOrigin = performance.now();
      emitTimeOriginChunk(this, type + performance.timeOrigin);
      this.abortTime = -0;
      model = createTask(
        this,
        model,
        null,
        !1,
        abortSet,
        type,
        null,
        null,
        null
      );
      pingedTasks.push(model);
    }
    function createRequest(
      model,
      bundlerConfig,
      onError,
      identifierPrefix,
      onPostpone,
      temporaryReferences,
      environmentName,
      filterStackFrame,
      keepDebugAlive
    ) {
      resetOwnerStackLimit();
      return new RequestInstance(
        20,
        model,
        bundlerConfig,
        onError,
        onPostpone,
        noop,
        noop,
        identifierPrefix,
        temporaryReferences,
        environmentName,
        filterStackFrame,
        keepDebugAlive
      );
    }
    function createPrerenderRequest(
      model,
      bundlerConfig,
      onAllReady,
      onFatalError,
      onError,
      identifierPrefix,
      onPostpone,
      temporaryReferences,
      environmentName,
      filterStackFrame,
      keepDebugAlive
    ) {
      resetOwnerStackLimit();
      return new RequestInstance(
        21,
        model,
        bundlerConfig,
        onError,
        onPostpone,
        onAllReady,
        onFatalError,
        identifierPrefix,
        temporaryReferences,
        environmentName,
        filterStackFrame,
        keepDebugAlive
      );
    }
    function resolveRequest() {
      if (currentRequest) return currentRequest;
      if (supportsRequestStorage) {
        var store = requestStorage.getStore();
        if (store) return store;
      }
      return null;
    }
    function serializeDebugThenable(request, counter, thenable) {
      request.pendingDebugChunks++;
      var id = request.nextChunkId++,
        ref = "$@" + id.toString(16);
      request.writtenDebugObjects.set(thenable, ref);
      switch (thenable.status) {
        case "fulfilled":
          return (
            emitOutlinedDebugModelChunk(request, id, counter, thenable.value),
            ref
          );
        case "rejected":
          return emitErrorChunk(request, id, "", thenable.reason, !0), ref;
      }
      if (request.status === ABORTING)
        return emitDebugHaltChunk(request, id), ref;
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
            request.status === ABORTING
              ? emitDebugHaltChunk(request, id)
              : emitOutlinedDebugModelChunk(request, id, counter, value),
            enqueueFlush(request));
        },
        function (reason) {
          cancelled ||
            ((cancelled = !0),
            request.status === ABORTING
              ? emitDebugHaltChunk(request, id)
              : emitErrorChunk(request, id, "", reason, !0),
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
      return ref;
    }
    function emitRequestedDebugThenable(request, id, counter, thenable) {
      thenable.then(
        function (value) {
          request.status === ABORTING
            ? emitDebugHaltChunk(request, id)
            : emitOutlinedDebugModelChunk(request, id, counter, value);
          enqueueFlush(request);
        },
        function (reason) {
          request.status === ABORTING
            ? emitDebugHaltChunk(request, id)
            : emitErrorChunk(request, id, "", reason, !0);
          enqueueFlush(request);
        }
      );
    }
    function serializeThenable(request, task, thenable) {
      var newTask = createTask(
        request,
        thenable,
        task.keyPath,
        task.implicitSlot,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
      switch (thenable.status) {
        case "fulfilled":
          return (
            forwardDebugInfoFromThenable(
              request,
              newTask,
              thenable,
              null,
              null
            ),
            (newTask.model = thenable.value),
            pingTask(request, newTask),
            newTask.id
          );
        case "rejected":
          return (
            forwardDebugInfoFromThenable(
              request,
              newTask,
              thenable,
              null,
              null
            ),
            erroredTask(request, newTask, thenable.reason),
            newTask.id
          );
        default:
          if (request.status === ABORTING)
            return (
              request.abortableTasks.delete(newTask),
              21 === request.type
                ? (haltTask(newTask), finishHaltedTask(newTask, request))
                : ((task = request.fatalError),
                  abortTask(newTask),
                  finishAbortedTask(newTask, request, task)),
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
          forwardDebugInfoFromCurrentContext(request, newTask, thenable);
          newTask.model = value;
          pingTask(request, newTask);
        },
        function (reason) {
          0 === newTask.status &&
            ((newTask.timed = !0),
            erroredTask(request, newTask, reason),
            enqueueFlush(request));
        }
      );
      return newTask.id;
    }
    function serializeReadableStream(request, task, stream) {
      function progress(entry) {
        if (0 === streamTask.status)
          if (entry.done)
            (streamTask.status = 1),
              (entry = streamTask.id.toString(16) + ":C\n"),
              request.completedRegularChunks.push(stringToChunk(entry)),
              request.abortableTasks.delete(streamTask),
              request.cacheController.signal.removeEventListener(
                "abort",
                abortStream
              ),
              enqueueFlush(request),
              callOnAllReadyIfReady(request);
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
        0 === streamTask.status &&
          (request.cacheController.signal.removeEventListener(
            "abort",
            abortStream
          ),
          erroredTask(request, streamTask, reason),
          enqueueFlush(request),
          reader.cancel(reason).then(error, error));
      }
      function abortStream() {
        if (0 === streamTask.status) {
          var signal = request.cacheController.signal;
          signal.removeEventListener("abort", abortStream);
          signal = signal.reason;
          21 === request.type
            ? (request.abortableTasks.delete(streamTask),
              haltTask(streamTask),
              finishHaltedTask(streamTask, request))
            : (erroredTask(request, streamTask, signal), enqueueFlush(request));
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
      var reader = stream.getReader(),
        streamTask = createTask(
          request,
          task.model,
          task.keyPath,
          task.implicitSlot,
          request.abortableTasks,
          task.time,
          task.debugOwner,
          task.debugStack,
          task.debugTask
        );
      request.pendingChunks++;
      task =
        streamTask.id.toString(16) + ":" + (supportsBYOB ? "r" : "R") + "\n";
      request.completedRegularChunks.push(stringToChunk(task));
      request.cacheController.signal.addEventListener("abort", abortStream);
      reader.read().then(progress, error);
      return serializeByValueID(streamTask.id);
    }
    function serializeAsyncIterable(request, task, iterable, iterator) {
      function progress(entry) {
        if (0 === streamTask.status)
          if (entry.done) {
            streamTask.status = 1;
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
            request.completedRegularChunks.push(stringToChunk(endStreamRow));
            request.abortableTasks.delete(streamTask);
            request.cacheController.signal.removeEventListener(
              "abort",
              abortIterable
            );
            enqueueFlush(request);
            callOnAllReadyIfReady(request);
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
        0 === streamTask.status &&
          (request.cacheController.signal.removeEventListener(
            "abort",
            abortIterable
          ),
          erroredTask(request, streamTask, reason),
          enqueueFlush(request),
          "function" === typeof iterator.throw &&
            iterator.throw(reason).then(error, error));
      }
      function abortIterable() {
        if (0 === streamTask.status) {
          var signal = request.cacheController.signal;
          signal.removeEventListener("abort", abortIterable);
          var reason = signal.reason;
          21 === request.type
            ? (request.abortableTasks.delete(streamTask),
              haltTask(streamTask),
              finishHaltedTask(streamTask, request))
            : (erroredTask(request, streamTask, signal.reason),
              enqueueFlush(request));
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
          task.time,
          task.debugOwner,
          task.debugStack,
          task.debugTask
        );
      request.pendingChunks++;
      task = streamTask.id.toString(16) + ":" + (isIterator ? "x" : "X") + "\n";
      request.completedRegularChunks.push(stringToChunk(task));
      (iterable = iterable._debugInfo) &&
        forwardDebugInfo(request, streamTask, iterable);
      request.cacheController.signal.addEventListener("abort", abortIterable);
      callIteratorInDEV(iterator, progress, error);
      return serializeByValueID(streamTask.id);
    }
    function emitHint(request, code, model) {
      model = stringify(model);
      code = stringToChunk(":H" + code + model + "\n");
      request.completedHintChunks.push(code);
      enqueueFlush(request);
    }
    function readThenable(thenable) {
      if ("fulfilled" === thenable.status) return thenable.value;
      if ("rejected" === thenable.status) throw thenable.reason;
      throw thenable;
    }
    function createLazyWrapperAroundWakeable(request, task, wakeable) {
      switch (wakeable.status) {
        case "fulfilled":
          return (
            forwardDebugInfoFromThenable(request, task, wakeable, null, null),
            wakeable.value
          );
        case "rejected":
          forwardDebugInfoFromThenable(request, task, wakeable, null, null);
          break;
        default:
          "string" !== typeof wakeable.status &&
            ((wakeable.status = "pending"),
            wakeable.then(
              function (fulfilledValue) {
                forwardDebugInfoFromCurrentContext(request, task, wakeable);
                "pending" === wakeable.status &&
                  ((wakeable.status = "fulfilled"),
                  (wakeable.value = fulfilledValue));
              },
              function (error) {
                forwardDebugInfoFromCurrentContext(request, task, wakeable);
                "pending" === wakeable.status &&
                  ((wakeable.status = "rejected"), (wakeable.reason = error));
              }
            ));
      }
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: wakeable,
        _init: readThenable
      };
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
          createLazyWrapperAroundWakeable(request, task, result)
        );
      result.$$typeof === REACT_ELEMENT_TYPE && (result._store.validated = 1);
      var iteratorFn = getIteratorFn(result);
      if (iteratorFn) {
        var multiShot = _defineProperty({}, Symbol.iterator, function () {
          var iterator = iteratorFn.call(result);
          iterator !== result ||
            ("[object GeneratorFunction]" ===
              Object.prototype.toString.call(Component) &&
              "[object Generator]" ===
                Object.prototype.toString.call(result)) ||
            callWithDebugContextInDEV(request, task, function () {
              console.error(
                "Returning an Iterator from a Server Component is not supported since it cannot be looped over more than once. "
              );
            });
          return iterator;
        });
        multiShot._debugInfo = result._debugInfo;
        return multiShot;
      }
      return "function" !== typeof result[ASYNC_ITERATOR] ||
        ("function" === typeof ReadableStream &&
          result instanceof ReadableStream)
        ? result
        : ((multiShot = _defineProperty({}, ASYNC_ITERATOR, function () {
            var iterator = result[ASYNC_ITERATOR]();
            iterator !== result ||
              ("[object AsyncGeneratorFunction]" ===
                Object.prototype.toString.call(Component) &&
                "[object AsyncGenerator]" ===
                  Object.prototype.toString.call(result)) ||
              callWithDebugContextInDEV(request, task, function () {
                console.error(
                  "Returning an AsyncIterator from a Server Component is not supported since it cannot be looped over more than once. "
                );
              });
            return iterator;
          })),
          (multiShot._debugInfo = result._debugInfo),
          multiShot);
    }
    function renderFunctionComponent(
      request,
      task,
      key,
      Component,
      props,
      validated
    ) {
      var prevThenableState = task.thenableState;
      task.thenableState = null;
      if (canEmitDebugInfo)
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
              : filterStackTrace(request, parseStackTrace(task.debugStack, 1));
          componentDebugInfo.props = props;
          componentDebugInfo.debugStack = task.debugStack;
          componentDebugInfo.debugTask = task.debugTask;
          outlineComponentInfo(request, componentDebugInfo);
          var timestamp = performance.now();
          timestamp > task.time
            ? (emitTimingChunk(request, task.id, timestamp),
              (task.time = timestamp))
            : task.timed || emitTimingChunk(request, task.id, task.time);
          task.timed = !0;
          emitDebugChunk(request, componentDebugID, componentDebugInfo);
          task.environmentName = componentEnv;
          2 === validated &&
            warnForMissingKey(request, key, componentDebugInfo, task.debugTask);
        }
      else return outlineTask(request, task);
      thenableIndexCounter = 0;
      thenableState = prevThenableState;
      currentComponentDebugInfo = componentDebugInfo;
      props = supportsComponentStorage
        ? task.debugTask
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
            )
        : task.debugTask
          ? task.debugTask.run(
              callComponentInDEV.bind(
                null,
                Component,
                props,
                componentDebugInfo
              )
            )
          : callComponentInDEV(Component, props, componentDebugInfo);
      if (request.status === ABORTING)
        throw (
          ("object" !== typeof props ||
            null === props ||
            "function" !== typeof props.then ||
            isClientReference(props) ||
            props.then(voidHandler, voidHandler),
          null)
        );
      validated = thenableState;
      if (null !== validated)
        for (
          prevThenableState = validated._stacks || (validated._stacks = []),
            componentDebugID = 0;
          componentDebugID < validated.length;
          componentDebugID++
        )
          forwardDebugInfoFromThenable(
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
      Component = task.keyPath;
      componentDebugInfo = task.implicitSlot;
      null !== key
        ? (task.keyPath = null === Component ? key : Component + "," + key)
        : null === Component && (task.implicitSlot = !0);
      request = renderModelDestructive(request, task, emptyRoot, "", props);
      task.keyPath = Component;
      task.implicitSlot = componentDebugInfo;
      return request;
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
      supportsComponentStorage
        ? debugTask
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
            )
        : debugTask
          ? debugTask.run(
              callComponentInDEV.bind(
                null,
                logKeyError,
                null,
                componentDebugInfo
              )
            )
          : callComponentInDEV(logKeyError, null, componentDebugInfo);
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
            null,
            null,
            0
          ]),
          task.implicitSlot ? [request] : request
        );
      if ((i = children._debugInfo)) {
        if (canEmitDebugInfo) forwardDebugInfo(request, task, i);
        else return outlineTask(request, task);
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
            null,
            null,
            0
          ]),
          task.implicitSlot ? [request] : request
        );
      getAsyncIterator = getAsyncIterator.call(children);
      return serializeAsyncIterable(request, task, children, getAsyncIterator);
    }
    function deferTask(request, task) {
      task = createTask(
        request,
        task.model,
        task.keyPath,
        task.implicitSlot,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
      pingTask(request, task);
      return serializeLazyID(task.id);
    }
    function outlineTask(request, task) {
      task = createTask(
        request,
        task.model,
        task.keyPath,
        task.implicitSlot,
        request.abortableTasks,
        task.time,
        task.debugOwner,
        task.debugStack,
        task.debugTask
      );
      retryTask(request, task);
      return 1 === task.status
        ? serializeByValueID(task.id)
        : serializeLazyID(task.id);
    }
    function renderElement(request, task, type, key, ref, props, validated) {
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
                    : filterStackTrace(
                        request,
                        parseStackTrace(task.debugStack, 1)
                      ),
                props: props,
                debugStack: task.debugStack,
                debugTask: task.debugTask
              }),
              warnForMissingKey(request, key, validated, task.debugTask)),
            (validated = task.implicitSlot),
            null === task.keyPath && (task.implicitSlot = !0),
            (request = renderModelDestructive(
              request,
              task,
              emptyRoot,
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
              if (request.status === ABORTING) throw null;
              return renderElement(
                request,
                task,
                type,
                key,
                ref,
                props,
                validated
              );
            case REACT_FORWARD_REF_TYPE:
              return renderFunctionComponent(
                request,
                task,
                key,
                type.render,
                props,
                validated
              );
            case REACT_MEMO_TYPE:
              return renderElement(
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
      } else
        return renderFunctionComponent(
          request,
          task,
          key,
          type,
          props,
          validated
        );
      ref = task.keyPath;
      null === key ? (key = ref) : null !== ref && (key = ref + "," + key);
      var debugStack = null;
      ref = task.debugOwner;
      null !== ref && outlineComponentInfo(request, ref);
      if (null !== task.debugStack) {
        debugStack = filterStackTrace(
          request,
          parseStackTrace(task.debugStack, 1)
        );
        var id = outlineDebugModel(
          request,
          { objectLimit: 2 * debugStack.length + 1 },
          debugStack
        );
        request.writtenObjects.set(debugStack, serializeByValueID(id));
      }
      request = [
        REACT_ELEMENT_TYPE,
        type,
        key,
        props,
        ref,
        debugStack,
        validated
      ];
      task = task.implicitSlot && null !== key ? [request] : request;
      return task;
    }
    function pingTask(request, task) {
      task.timed = !0;
      var pingedTasks = request.pingedTasks;
      pingedTasks.push(task);
      1 === pingedTasks.length &&
        ((request.flushScheduled = null !== request.destination),
        21 === request.type || 10 === request.status
          ? scheduleMicrotask(function () {
              return performWork(request);
            })
          : setTimeout(function () {
              return performWork(request);
            }, 0));
    }
    function createTask(
      request,
      model,
      keyPath,
      implicitSlot,
      abortSet,
      lastTimestamp,
      debugOwner,
      debugStack,
      debugTask
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
            callWithDebugContextInDEV(request, task, function () {
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
    function serializeByValueID(id) {
      return "$" + id.toString(16);
    }
    function serializeLazyID(id) {
      return "$L" + id.toString(16);
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
      id = id.toString(16) + ":" + request + "\n";
      return stringToChunk(id);
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
        var clientReferenceMetadata = resolveClientReferenceMetadata(
          request.bundlerConfig,
          clientReference
        );
        request.pendingChunks++;
        var importId = request.nextChunkId++;
        emitImportChunk(request, importId, clientReferenceMetadata, !1);
        writtenClientReferences.set(clientReferenceKey, importId);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(importId)
          : serializeByValueID(importId);
      } catch (x) {
        return (
          request.pendingChunks++,
          (parent = request.nextChunkId++),
          (parentPropertyName = logRecoverableError(request, x, null)),
          emitErrorChunk(request, parent, parentPropertyName, x, !1),
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
      var existingId = request.writtenClientReferences.get(
        clientReference.$$async
          ? clientReference.$$id + "#async"
          : clientReference.$$id
      );
      if (void 0 !== existingId)
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(existingId)
          : serializeByValueID(existingId);
      try {
        var clientReferenceMetadata = resolveClientReferenceMetadata(
          request.bundlerConfig,
          clientReference
        );
        request.pendingDebugChunks++;
        var importId = request.nextChunkId++;
        emitImportChunk(request, importId, clientReferenceMetadata, !0);
        return parent[0] === REACT_ELEMENT_TYPE && "1" === parentPropertyName
          ? serializeLazyID(importId)
          : serializeByValueID(importId);
      } catch (x) {
        return (
          request.pendingDebugChunks++,
          (parent = request.nextChunkId++),
          (parentPropertyName = logRecoverableError(request, x, null)),
          emitErrorChunk(request, parent, parentPropertyName, x, !0),
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
        performance.now(),
        null,
        null,
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
      existingId = null === existingId ? null : Promise.resolve(existingId);
      var id = serverReference.$$id,
        location = null,
        error = serverReference.$$location;
      error &&
        ((error = parseStackTrace(error, 1)),
        0 < error.length &&
          ((location = error[0]),
          (location = [location[0], location[1], location[2], location[3]])));
      existingId =
        null !== location
          ? {
              id: id,
              bound: existingId,
              name:
                "function" === typeof serverReference
                  ? serverReference.name
                  : "",
              env: (0, request.environmentName)(),
              location: location
            }
          : { id: id, bound: existingId };
      request = outlineModel(request, existingId);
      writtenServerReferences.set(serverReference, request);
      return "$F" + request.toString(16);
    }
    function serializeLargeTextString(request, text) {
      request.pendingChunks++;
      var textId = request.nextChunkId++;
      emitTextChunk(request, textId, text, !1);
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
      emitTypedArrayChunk(request, bufferId, tag, typedArray, !1);
      return serializeByValueID(bufferId);
    }
    function serializeDebugTypedArray(request, tag, typedArray) {
      request.pendingDebugChunks++;
      var bufferId = request.nextChunkId++;
      emitTypedArrayChunk(request, bufferId, tag, typedArray, !0);
      return serializeByValueID(bufferId);
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
        emitErrorChunk(request, id, "", reason, !0);
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
    function serializeBlob(request, blob) {
      function progress(entry) {
        if (0 === newTask.status)
          if (entry.done)
            request.cacheController.signal.removeEventListener(
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
          (request.cacheController.signal.removeEventListener(
            "abort",
            abortBlob
          ),
          erroredTask(request, newTask, reason),
          enqueueFlush(request),
          reader.cancel(reason).then(error, error));
      }
      function abortBlob() {
        if (0 === newTask.status) {
          var signal = request.cacheController.signal;
          signal.removeEventListener("abort", abortBlob);
          signal = signal.reason;
          21 === request.type
            ? (request.abortableTasks.delete(newTask),
              haltTask(newTask),
              finishHaltedTask(newTask, request))
            : (erroredTask(request, newTask, signal), enqueueFlush(request));
          reader.cancel(signal).then(error, error);
        }
      }
      var model = [blob.type],
        newTask = createTask(
          request,
          model,
          null,
          !1,
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
    function renderModel(request, task, parent, key, value) {
      serializedSize += key.length;
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
        if (request.status === ABORTING) {
          task.status = 3;
          if (21 === request.type)
            return (
              (task = request.nextChunkId++),
              (task = parent
                ? serializeLazyID(task)
                : serializeByValueID(task)),
              task
            );
          task = request.fatalError;
          return parent ? serializeLazyID(task) : serializeByValueID(task);
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
            (request = createTask(
              request,
              task.model,
              task.keyPath,
              task.implicitSlot,
              request.abortableTasks,
              task.time,
              task.debugOwner,
              task.debugStack,
              task.debugTask
            )),
            (value = request.ping),
            key.then(value, value),
            (request.thenableState = getThenableStateAfterSuspending()),
            (task.keyPath = prevKeyPath),
            (task.implicitSlot = prevImplicitSlot),
            parent
              ? serializeLazyID(request.id)
              : serializeByValueID(request.id)
          );
        task.keyPath = prevKeyPath;
        task.implicitSlot = prevImplicitSlot;
        request.pendingChunks++;
        prevKeyPath = request.nextChunkId++;
        "object" === typeof key &&
        null !== key &&
        key.$$typeof === REACT_POSTPONE_TYPE
          ? (logPostpone(request, key.message, task),
            emitPostponeChunk(request, prevKeyPath, key))
          : ((task = logRecoverableError(request, key, task)),
            emitErrorChunk(request, prevKeyPath, task, key, !1));
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
            if (serializedSize > MAX_ROW_SIZE) return deferTask(request, task);
            if ((_existingReference = value._debugInfo))
              if (canEmitDebugInfo)
                forwardDebugInfo(request, task, _existingReference);
              else return outlineTask(request, task);
            _existingReference = value.props;
            var refProp = _existingReference.ref;
            task.debugOwner = value._owner;
            task.debugStack = value._debugStack;
            task.debugTask = value._debugTask;
            request = renderElement(
              request,
              task,
              value.type,
              value.key,
              void 0 !== refProp ? refProp : null,
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
            if (serializedSize > MAX_ROW_SIZE) return deferTask(request, task);
            task.thenableState = null;
            elementReference = callLazyInitInDEV(value);
            if (request.status === ABORTING) throw null;
            if ((_writtenObjects = value._debugInfo))
              if (canEmitDebugInfo)
                forwardDebugInfo(request, task, _writtenObjects);
              else return outlineTask(request, task);
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
        if (isClientReference(value))
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
          if (modelRoot === value) {
            if (_writtenObjects !== serializeByValueID(task.id))
              return _writtenObjects;
            modelRoot = null;
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
        if (isArrayImpl(value)) return renderFragment(request, task, value);
        if (value instanceof Map) return serializeMap(request, value);
        if (value instanceof Set) return serializeSet(request, value);
        if ("function" === typeof FormData && value instanceof FormData)
          return serializeFormData(request, value);
        if (value instanceof Error) return serializeErrorValue(request, value);
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
        if (value instanceof Date) return "$D" + value.toJSON();
        elementReference = getPrototypeOf(value);
        if (
          elementReference !== ObjectPrototype &&
          (null === elementReference ||
            null !== getPrototypeOf(elementReference))
        )
          throw Error(
            "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
              describeObjectForErrorMessage(parent, parentPropertyName)
          );
        if ("Object" !== objectName(value))
          callWithDebugContextInDEV(request, task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. %s objects are not supported.%s",
              objectName(value),
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
        else if (!isSimpleObject(value))
          callWithDebugContextInDEV(request, task, function () {
            console.error(
              "Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported.%s",
              describeObjectForErrorMessage(parent, parentPropertyName)
            );
          });
        else if (Object.getOwnPropertySymbols) {
          var symbols = Object.getOwnPropertySymbols(value);
          0 < symbols.length &&
            callWithDebugContextInDEV(request, task, function () {
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
          (task = TaintRegistryValues.get(value)),
          void 0 !== task && throwTaintViolation(task.message),
          (serializedSize += value.length),
          "Z" === value[value.length - 1] &&
          parent[parentPropertyName] instanceof Date
            ? "$D" + value
            : 1024 <= value.length && null !== byteLengthOfChunk
              ? serializeLargeTextString(request, value)
              : "$" === value[0]
                ? "$" + value
                : value
        );
      if ("boolean" === typeof value) return value;
      if ("number" === typeof value) return serializeNumber(value);
      if ("undefined" === typeof value) return "$undefined";
      if ("function" === typeof value) {
        if (isClientReference(value))
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
    function logPostpone(request, reason, task) {
      var prevRequest = currentRequest;
      currentRequest = null;
      try {
        var onPostpone = request.onPostpone;
        null !== task
          ? supportsRequestStorage
            ? requestStorage.run(
                void 0,
                callWithDebugContextInDEV,
                request,
                task,
                onPostpone,
                reason
              )
            : callWithDebugContextInDEV(request, task, onPostpone, reason)
          : supportsRequestStorage
            ? requestStorage.run(void 0, onPostpone, reason)
            : onPostpone(reason);
      } finally {
        currentRequest = prevRequest;
      }
    }
    function logRecoverableError(request, error, task) {
      var prevRequest = currentRequest;
      currentRequest = null;
      try {
        var onError = request.onError;
        var errorDigest =
          null !== task
            ? supportsRequestStorage
              ? requestStorage.run(
                  void 0,
                  callWithDebugContextInDEV,
                  request,
                  task,
                  onError,
                  error
                )
              : callWithDebugContextInDEV(request, task, onError, error)
            : supportsRequestStorage
              ? requestStorage.run(void 0, onError, error)
              : onError(error);
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
      var onFatalError = request.onFatalError;
      onFatalError(error);
      cleanupTaintQueue(request);
      null !== request.destination
        ? ((request.status = CLOSED),
          closeWithError(request.destination, error))
        : ((request.status = 13), (request.fatalError = error));
      request.cacheController.abort(
        Error("The render was aborted due to a fatal error.", { cause: error })
      );
    }
    function emitPostponeChunk(request, id, postponeInstance) {
      var reason = "",
        env = request.environmentName();
      try {
        reason = String(postponeInstance.message);
        var stack = filterStackTrace(
          request,
          parseStackTrace(postponeInstance, 0)
        );
      } catch (x) {
        stack = [];
      }
      id =
        id.toString(16) +
        ":P" +
        stringify({ reason: reason, stack: stack, env: env }) +
        "\n";
      id = stringToChunk(id);
      request.completedErrorChunks.push(id);
    }
    function serializeErrorValue(request, error) {
      var name = "Error",
        env = (0, request.environmentName)();
      try {
        name = error.name;
        var message = String(error.message);
        var stack = filterStackTrace(request, parseStackTrace(error, 0));
        var errorEnv = error.environmentName;
        "string" === typeof errorEnv && (env = errorEnv);
      } catch (x) {
        (message =
          "An error occurred but serializing the error message failed."),
          (stack = []);
      }
      return (
        "$Z" +
        outlineModel(request, {
          name: name,
          message: message,
          stack: stack,
          env: env
        }).toString(16)
      );
    }
    function emitErrorChunk(request, id, digest, error, debug) {
      var name = "Error",
        env = (0, request.environmentName)();
      try {
        if (error instanceof Error) {
          name = error.name;
          var message = String(error.message);
          var stack = filterStackTrace(request, parseStackTrace(error, 0));
          var errorEnv = error.environmentName;
          "string" === typeof errorEnv && (env = errorEnv);
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
      digest = {
        digest: digest,
        name: name,
        message: message,
        stack: stack,
        env: env
      };
      id = id.toString(16) + ":E" + stringify(digest) + "\n";
      id = stringToChunk(id);
      debug
        ? request.completedDebugChunks.push(id)
        : request.completedErrorChunks.push(id);
    }
    function emitImportChunk(request, id, clientReferenceMetadata, debug) {
      clientReferenceMetadata = stringify(clientReferenceMetadata);
      id = id.toString(16) + ":I" + clientReferenceMetadata + "\n";
      id = stringToChunk(id);
      debug
        ? request.completedDebugChunks.push(id)
        : request.completedImportChunks.push(id);
    }
    function emitSymbolChunk(request, id, name) {
      id = encodeReferenceChunk(request, id, "$S" + name);
      request.completedImportChunks.push(id);
    }
    function emitModelChunk(request, id, json) {
      id = id.toString(16) + ":" + json + "\n";
      id = stringToChunk(id);
      request.completedRegularChunks.push(id);
    }
    function emitDebugHaltChunk(request, id) {
      id = id.toString(16) + ":\n";
      id = stringToChunk(id);
      request.completedDebugChunks.push(id);
    }
    function emitDebugChunk(request, id, debugInfo) {
      var json = serializeDebugModel(request, 500, debugInfo);
      null !== request.debugDestination
        ? ((debugInfo = request.nextChunkId++),
          (json = debugInfo.toString(16) + ":" + json + "\n"),
          request.pendingDebugChunks++,
          request.completedDebugChunks.push(stringToChunk(json)),
          (id = id.toString(16) + ':D"$' + debugInfo.toString(16) + '"\n'),
          request.completedRegularChunks.push(stringToChunk(id)))
        : ((id = id.toString(16) + ":D" + json + "\n"),
          request.completedRegularChunks.push(stringToChunk(id)));
    }
    function outlineComponentInfo(request, componentInfo) {
      if (!request.writtenDebugObjects.has(componentInfo)) {
        null != componentInfo.owner &&
          outlineComponentInfo(request, componentInfo.owner);
        var objectLimit = 10;
        null != componentInfo.stack &&
          (objectLimit += componentInfo.stack.length);
        objectLimit = { objectLimit: objectLimit };
        var componentDebugInfo = {
          name: componentInfo.name,
          key: componentInfo.key
        };
        null != componentInfo.env &&
          (componentDebugInfo.env = componentInfo.env);
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
        objectLimit = outlineDebugModel(
          request,
          objectLimit,
          componentDebugInfo
        );
        objectLimit = serializeByValueID(objectLimit);
        request.writtenDebugObjects.set(componentInfo, objectLimit);
        request.writtenObjects.set(componentInfo, objectLimit);
      }
    }
    function emitTypedArrayChunk(request, id, tag, typedArray, debug) {
      if (TaintRegistryByteLengths.has(typedArray.byteLength)) {
        var tainted = TaintRegistryValues.get(
          String.fromCharCode.apply(
            String,
            new Uint8Array(
              typedArray.buffer,
              typedArray.byteOffset,
              typedArray.byteLength
            )
          )
        );
        void 0 !== tainted && throwTaintViolation(tainted.message);
      }
      debug ? request.pendingDebugChunks++ : request.pendingChunks++;
      tainted = new Uint8Array(
        typedArray.buffer,
        typedArray.byteOffset,
        typedArray.byteLength
      );
      typedArray = 2048 < typedArray.byteLength ? tainted.slice() : tainted;
      tainted = typedArray.byteLength;
      id = id.toString(16) + ":" + tag + tainted.toString(16) + ",";
      id = stringToChunk(id);
      debug
        ? request.completedDebugChunks.push(id, typedArray)
        : request.completedRegularChunks.push(id, typedArray);
    }
    function emitTextChunk(request, id, text, debug) {
      if (null === byteLengthOfChunk)
        throw Error(
          "Existence of byteLengthOfChunk should have already been checked. This is a bug in React."
        );
      debug ? request.pendingDebugChunks++ : request.pendingChunks++;
      text = stringToChunk(text);
      var binaryLength = text.byteLength;
      id = id.toString(16) + ":T" + binaryLength.toString(16) + ",";
      id = stringToChunk(id);
      debug
        ? request.completedDebugChunks.push(id, text)
        : request.completedRegularChunks.push(id, text);
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
        }
        if ("function" === typeof value.then)
          return serializeDebugThenable(request, counter, value);
        if (isArrayImpl(value)) return value;
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
          counter = "Error";
          var env = (0, request.environmentName)();
          try {
            (counter = value.name),
              (ref = String(value.message)),
              (key = filterStackTrace(request, parseStackTrace(value, 0))),
              (entry = value.environmentName),
              "string" === typeof entry && (env = entry);
          } catch (x) {
            (ref =
              "An error occurred but serializing the error message failed."),
              (key = []);
          }
          request =
            "$Z" +
            outlineDebugModel(
              request,
              { objectLimit: 2 * key.length + 1 },
              { name: counter, message: ref, stack: key, env: env }
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
          for (env in value)
            if (hasOwnProperty.call(value, env) || isGetter(request, env))
              counter[env] = value[env];
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
        if (
          "Z" === value[value.length - 1] &&
          parent[parentPropertyName] instanceof Date
        )
          return "$D" + value;
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
        key = "$E(" + (Function.prototype.toString.call(value) + ")");
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
        : value instanceof Date
          ? "$D" + value.toJSON()
          : "unknown type " + typeof value;
    }
    function serializeDebugModel(request, objectLimit, model) {
      function replacer(parentPropertyName, value) {
        try {
          return renderDebugModel(
            request,
            counter,
            this,
            parentPropertyName,
            value
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
      function replacer(parentPropertyName, value) {
        try {
          return renderDebugModel(
            request,
            counter,
            this,
            parentPropertyName,
            value
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
      id = stringToChunk(id);
      request.completedDebugChunks.push(id);
    }
    function outlineDebugModel(request, counter, model) {
      var id = request.nextChunkId++;
      request.pendingDebugChunks++;
      emitOutlinedDebugModelChunk(request, id, counter, model);
      return id;
    }
    function emitTimeOriginChunk(request, timeOrigin) {
      request.pendingDebugChunks++;
      timeOrigin = stringToChunk(":N" + timeOrigin + "\n");
      request.completedDebugChunks.push(timeOrigin);
    }
    function forwardDebugInfo(request$jscomp$1, task, debugInfo) {
      for (var id = task.id, i = 0; i < debugInfo.length; i++) {
        var info = debugInfo[i];
        if ("number" === typeof info.time)
          markOperationEndTime(request$jscomp$1, task, info.time);
        else if ("string" === typeof info.name)
          outlineComponentInfo(request$jscomp$1, info),
            request$jscomp$1.pendingChunks++,
            emitDebugChunk(request$jscomp$1, id, info);
        else if (info.awaited) {
          var ioInfo = info.awaited;
          if (!(ioInfo.end <= request$jscomp$1.timeOrigin)) {
            var request = request$jscomp$1,
              ioInfo$jscomp$0 = ioInfo;
            if (!request.writtenObjects.has(ioInfo$jscomp$0)) {
              request.pendingDebugChunks++;
              var id$jscomp$0 = request.nextChunkId++,
                owner = ioInfo$jscomp$0.owner;
              null != owner && outlineComponentInfo(request, owner);
              var debugStack =
                null == ioInfo$jscomp$0.stack &&
                null != ioInfo$jscomp$0.debugStack
                  ? filterStackTrace(
                      request,
                      parseStackTrace(ioInfo$jscomp$0.debugStack, 1)
                    )
                  : ioInfo$jscomp$0.stack;
              var request$jscomp$0 = request,
                id$jscomp$1 = id$jscomp$0,
                value = ioInfo$jscomp$0.value,
                env = ioInfo$jscomp$0.env,
                objectLimit = 10;
              debugStack && (objectLimit += debugStack.length);
              var debugIOInfo = {
                name: ioInfo$jscomp$0.name,
                start: ioInfo$jscomp$0.start - request$jscomp$0.timeOrigin,
                end: ioInfo$jscomp$0.end - request$jscomp$0.timeOrigin
              };
              null != env && (debugIOInfo.env = env);
              null != debugStack && (debugIOInfo.stack = debugStack);
              null != owner && (debugIOInfo.owner = owner);
              void 0 !== value && (debugIOInfo.value = value);
              value = serializeDebugModel(
                request$jscomp$0,
                objectLimit,
                debugIOInfo
              );
              id$jscomp$1 = id$jscomp$1.toString(16) + ":J" + value + "\n";
              id$jscomp$1 = stringToChunk(id$jscomp$1);
              request$jscomp$0.completedDebugChunks.push(id$jscomp$1);
              request.writtenDebugObjects.set(
                ioInfo$jscomp$0,
                serializeByValueID(id$jscomp$0)
              );
            }
            request =
              null == info.stack && null != info.debugStack
                ? filterStackTrace(
                    request$jscomp$1,
                    parseStackTrace(info.debugStack, 1)
                  )
                : info.stack;
            ioInfo = { awaited: ioInfo };
            null != info.env && (ioInfo.env = info.env);
            null != info.owner && (ioInfo.owner = info.owner);
            null != request && (ioInfo.stack = request);
            request$jscomp$1.pendingChunks++;
            emitDebugChunk(request$jscomp$1, id, ioInfo);
          }
        } else
          request$jscomp$1.pendingChunks++,
            emitDebugChunk(request$jscomp$1, id, info);
      }
    }
    function forwardDebugInfoFromThenable(request, task, thenable) {
      (thenable = thenable._debugInfo) &&
        forwardDebugInfo(request, task, thenable);
    }
    function forwardDebugInfoFromCurrentContext(request, task, thenable) {
      (thenable = thenable._debugInfo) &&
        forwardDebugInfo(request, task, thenable);
    }
    function forwardDebugInfoFromAbortedTask(request, task) {
      var model = task.model;
      "object" === typeof model &&
        null !== model &&
        (model = model._debugInfo) &&
        forwardDebugInfo(request, task, model);
    }
    function emitTimingChunk(request, id, timestamp) {
      request.pendingChunks++;
      var json = '{"time":' + (timestamp - request.timeOrigin) + "}";
      null !== request.debugDestination
        ? ((timestamp = request.nextChunkId++),
          (json = timestamp.toString(16) + ":" + json + "\n"),
          request.pendingDebugChunks++,
          request.completedDebugChunks.push(stringToChunk(json)),
          (id = id.toString(16) + ':D"$' + timestamp.toString(16) + '"\n'),
          request.completedRegularChunks.push(stringToChunk(id)))
        : ((id = id.toString(16) + ":D" + json + "\n"),
          request.completedRegularChunks.push(stringToChunk(id)));
    }
    function markOperationEndTime(request, task, timestamp) {
      (request.status === ABORTING && timestamp > request.abortTime) ||
        (timestamp > task.time
          ? (emitTimingChunk(request, task.id, timestamp),
            (task.time = timestamp))
          : emitTimingChunk(request, task.id, task.time));
    }
    function emitChunk(request, task, value) {
      var id = task.id;
      "string" === typeof value && null !== byteLengthOfChunk
        ? ((task = TaintRegistryValues.get(value)),
          void 0 !== task && throwTaintViolation(task.message),
          emitTextChunk(request, id, value, !1))
        : value instanceof ArrayBuffer
          ? emitTypedArrayChunk(request, id, "A", new Uint8Array(value), !1)
          : value instanceof Int8Array
            ? emitTypedArrayChunk(request, id, "O", value, !1)
            : value instanceof Uint8Array
              ? emitTypedArrayChunk(request, id, "o", value, !1)
              : value instanceof Uint8ClampedArray
                ? emitTypedArrayChunk(request, id, "U", value, !1)
                : value instanceof Int16Array
                  ? emitTypedArrayChunk(request, id, "S", value, !1)
                  : value instanceof Uint16Array
                    ? emitTypedArrayChunk(request, id, "s", value, !1)
                    : value instanceof Int32Array
                      ? emitTypedArrayChunk(request, id, "L", value, !1)
                      : value instanceof Uint32Array
                        ? emitTypedArrayChunk(request, id, "l", value, !1)
                        : value instanceof Float32Array
                          ? emitTypedArrayChunk(request, id, "G", value, !1)
                          : value instanceof Float64Array
                            ? emitTypedArrayChunk(request, id, "g", value, !1)
                            : value instanceof BigInt64Array
                              ? emitTypedArrayChunk(request, id, "M", value, !1)
                              : value instanceof BigUint64Array
                                ? emitTypedArrayChunk(
                                    request,
                                    id,
                                    "m",
                                    value,
                                    !1
                                  )
                                : value instanceof DataView
                                  ? emitTypedArrayChunk(
                                      request,
                                      id,
                                      "V",
                                      value,
                                      !1
                                    )
                                  : ((value = stringify(value, task.toJSON)),
                                    emitModelChunk(request, task.id, value));
    }
    function erroredTask(request, task, error) {
      task.timed && markOperationEndTime(request, task, performance.now());
      task.status = 4;
      if (
        "object" === typeof error &&
        null !== error &&
        error.$$typeof === REACT_POSTPONE_TYPE
      )
        logPostpone(request, error.message, task),
          emitPostponeChunk(request, task.id, error);
      else {
        var digest = logRecoverableError(request, error, task);
        emitErrorChunk(request, task.id, digest, error, !1);
      }
      request.abortableTasks.delete(task);
      callOnAllReadyIfReady(request);
    }
    function retryTask(request, task) {
      if (0 === task.status) {
        var prevCanEmitDebugInfo = canEmitDebugInfo;
        task.status = 5;
        var parentSerializedSize = serializedSize;
        try {
          modelRoot = task.model;
          canEmitDebugInfo = !0;
          var resolvedModel = renderModelDestructive(
            request,
            task,
            emptyRoot,
            "",
            task.model
          );
          canEmitDebugInfo = !1;
          modelRoot = resolvedModel;
          task.keyPath = null;
          task.implicitSlot = !1;
          var currentEnv = (0, request.environmentName)();
          currentEnv !== task.environmentName &&
            (request.pendingChunks++,
            emitDebugChunk(request, task.id, { env: currentEnv }));
          task.timed && markOperationEndTime(request, task, performance.now());
          if ("object" === typeof resolvedModel && null !== resolvedModel)
            request.writtenObjects.set(
              resolvedModel,
              serializeByValueID(task.id)
            ),
              emitChunk(request, task, resolvedModel);
          else {
            var json = stringify(resolvedModel);
            emitModelChunk(request, task.id, json);
          }
          task.status = 1;
          request.abortableTasks.delete(task);
          callOnAllReadyIfReady(request);
        } catch (thrownValue) {
          if (request.status === ABORTING)
            if (
              (request.abortableTasks.delete(task),
              (task.status = 0),
              21 === request.type)
            )
              haltTask(task), finishHaltedTask(task, request);
            else {
              var errorId = request.fatalError;
              abortTask(task);
              finishAbortedTask(task, request, errorId);
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
              task.thenableState = getThenableStateAfterSuspending();
              var ping = task.ping;
              x.then(ping, ping);
            } else erroredTask(request, task, x);
          }
        } finally {
          (canEmitDebugInfo = prevCanEmitDebugInfo),
            (serializedSize = parentSerializedSize);
        }
      }
    }
    function tryStreamTask(request, task) {
      var prevCanEmitDebugInfo = canEmitDebugInfo;
      canEmitDebugInfo = !1;
      var parentSerializedSize = serializedSize;
      try {
        emitChunk(request, task, task.model);
      } finally {
        (serializedSize = parentSerializedSize),
          (canEmitDebugInfo = prevCanEmitDebugInfo);
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
        flushCompletedChunks(request);
      } catch (error) {
        logRecoverableError(request, error, null), fatalError(request, error);
      } finally {
        (ReactSharedInternalsServer.H = prevDispatcher),
          (currentRequest$1 = null),
          (currentRequest = prevRequest);
      }
    }
    function abortTask(task) {
      0 === task.status && (task.status = 3);
    }
    function finishAbortedTask(task, request, errorId) {
      3 === task.status &&
        (forwardDebugInfoFromAbortedTask(request, task),
        task.timed && markOperationEndTime(request, task, request.abortTime),
        (errorId = serializeByValueID(errorId)),
        (task = encodeReferenceChunk(request, task.id, errorId)),
        request.completedErrorChunks.push(task));
    }
    function haltTask(task) {
      0 === task.status && (task.status = 3);
    }
    function finishHaltedTask(task, request) {
      3 === task.status &&
        (forwardDebugInfoFromAbortedTask(request, task),
        request.pendingChunks--);
    }
    function flushCompletedChunks(request) {
      if (null !== request.debugDestination) {
        var debugDestination = request.debugDestination;
        currentView = new Uint8Array(2048);
        writtenBytes = 0;
        try {
          for (
            var debugChunks = request.completedDebugChunks, i = 0;
            i < debugChunks.length;
            i++
          )
            request.pendingDebugChunks--,
              writeChunkAndReturn(debugDestination, debugChunks[i]);
          debugChunks.splice(0, i);
        } finally {
          completeWriting(debugDestination);
        }
      }
      debugDestination = request.destination;
      if (null !== debugDestination) {
        currentView = new Uint8Array(2048);
        writtenBytes = 0;
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
            )
              if (
                (request.pendingDebugChunks--,
                !writeChunkAndReturn(
                  debugDestination,
                  _debugChunks[debugChunks]
                ))
              ) {
                request.destination = null;
                debugChunks++;
                break;
              }
            _debugChunks.splice(0, debugChunks);
          }
          var regularChunks = request.completedRegularChunks;
          for (
            debugChunks = 0;
            debugChunks < regularChunks.length;
            debugChunks++
          )
            if (
              (request.pendingChunks--,
              !writeChunkAndReturn(
                debugDestination,
                regularChunks[debugChunks]
              ))
            ) {
              request.destination = null;
              debugChunks++;
              break;
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
      }
      0 === request.pendingChunks &&
        ((importsChunks = request.debugDestination),
        0 === request.pendingDebugChunks
          ? (null !== importsChunks &&
              (importsChunks.close(), (request.debugDestination = null)),
            cleanupTaintQueue(request),
            request.status < ABORTING &&
              request.cacheController.abort(
                Error(
                  "This render completed successfully. All cacheSignals are now aborted to allow clean up of any unused resources."
                )
              ),
            (request.status = CLOSED),
            null !== request.destination &&
              (request.destination.close(), (request.destination = null)),
            null !== request.debugDestination &&
              (request.debugDestination.close(),
              (request.debugDestination = null)))
          : null !== importsChunks &&
            null !== request.destination &&
            (request.destination.close(), (request.destination = null)));
    }
    function startWork(request) {
      request.flushScheduled = null !== request.destination;
      supportsRequestStorage
        ? scheduleMicrotask(function () {
            requestStorage.run(request, performWork, request);
          })
        : scheduleMicrotask(function () {
            return performWork(request);
          });
      setTimeout(function () {
        10 === request.status && (request.status = 11);
      }, 0);
    }
    function enqueueFlush(request) {
      !1 !== request.flushScheduled ||
        0 !== request.pingedTasks.length ||
        (null === request.destination && null === request.debugDestination) ||
        ((request.flushScheduled = !0),
        setTimeout(function () {
          request.flushScheduled = !1;
          flushCompletedChunks(request);
        }, 0));
    }
    function callOnAllReadyIfReady(request) {
      0 === request.abortableTasks.size &&
        ((request = request.onAllReady), request());
    }
    function startFlowing(request, destination) {
      if (13 === request.status)
        (request.status = CLOSED),
          closeWithError(destination, request.fatalError);
      else if (request.status !== CLOSED && null === request.destination) {
        request.destination = destination;
        try {
          flushCompletedChunks(request);
        } catch (error) {
          logRecoverableError(request, error, null), fatalError(request, error);
        }
      }
    }
    function finishHalt(request, abortedTasks) {
      try {
        abortedTasks.forEach(function (task) {
          return finishHaltedTask(task, request);
        });
        var onAllReady = request.onAllReady;
        onAllReady();
        flushCompletedChunks(request);
      } catch (error) {
        logRecoverableError(request, error, null), fatalError(request, error);
      }
    }
    function finishAbort(request, abortedTasks, errorId) {
      try {
        abortedTasks.forEach(function (task) {
          return finishAbortedTask(task, request, errorId);
        });
        var onAllReady = request.onAllReady;
        onAllReady();
        flushCompletedChunks(request);
      } catch (error) {
        logRecoverableError(request, error, null), fatalError(request, error);
      }
    }
    function abort(request, reason) {
      if (!(11 < request.status))
        try {
          request.status = ABORTING;
          request.abortTime = performance.now();
          request.cacheController.abort(reason);
          var abortableTasks = request.abortableTasks;
          if (0 < abortableTasks.size)
            if (21 === request.type)
              abortableTasks.forEach(function (task) {
                return haltTask(task, request);
              }),
                setTimeout(function () {
                  return finishHalt(request, abortableTasks);
                }, 0);
            else if (
              "object" === typeof reason &&
              null !== reason &&
              reason.$$typeof === REACT_POSTPONE_TYPE
            ) {
              logPostpone(request, reason.message, null);
              var errorId = request.nextChunkId++;
              request.fatalError = errorId;
              request.pendingChunks++;
              emitPostponeChunk(request, errorId, reason);
              abortableTasks.forEach(function (task) {
                return abortTask(task, request, errorId);
              });
              setTimeout(function () {
                return finishAbort(request, abortableTasks, errorId);
              }, 0);
            } else {
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
                digest = logRecoverableError(request, error, null),
                _errorId2 = request.nextChunkId++;
              request.fatalError = _errorId2;
              request.pendingChunks++;
              emitErrorChunk(request, _errorId2, digest, error, !1);
              abortableTasks.forEach(function (task) {
                return abortTask(task, request, _errorId2);
              });
              setTimeout(function () {
                return finishAbort(request, abortableTasks, _errorId2);
              }, 0);
            }
          else {
            var onAllReady = request.onAllReady;
            onAllReady();
            flushCompletedChunks(request);
          }
        } catch (error$2) {
          logRecoverableError(request, error$2, null),
            fatalError(request, error$2);
        }
    }
    function fromHex(str) {
      return parseInt(str, 16);
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
    function preloadModule(metadata) {
      for (
        var chunks = metadata[1], promises = [], i = 0;
        i < chunks.length;

      ) {
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
      response._closed = !0;
      response._closedReason = error;
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
            : response._closed
              ? new Chunk("rejected", null, response._closedReason, response)
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
        _closed: !1,
        _closedReason: null,
        _temporaryReferences: temporaryReferences
      };
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
    function startReadingFromDebugChannelReadableStream(
      request$jscomp$0,
      stream
    ) {
      function progress(_ref) {
        var done = _ref.done,
          buffer = _ref.value;
        _ref = stringBuffer;
        done
          ? ((buffer = new Uint8Array(0)),
            (buffer = stringDecoder.decode(buffer)))
          : (buffer = stringDecoder.decode(buffer, decoderOptions));
        stringBuffer = _ref + buffer;
        _ref = stringBuffer.split("\n");
        for (buffer = 0; buffer < _ref.length - 1; buffer++) {
          var request = request$jscomp$0,
            message = _ref[buffer],
            deferredDebugObjects = request.deferredDebugObjects;
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
        stringBuffer = _ref[_ref.length - 1];
        if (done) closeDebugChannel(request$jscomp$0);
        else return reader.read().then(progress).catch(error);
      }
      function error(e) {
        abort(
          request$jscomp$0,
          Error("Lost connection to the Debug Channel.", { cause: e })
        );
      }
      var reader = stream.getReader(),
        stringDecoder = new TextDecoder(),
        stringBuffer = "";
      reader.read().then(progress).catch(error);
    }
    var ReactDOM = require("react-dom"),
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
      REACT_POSTPONE_TYPE = Symbol.for("react.postpone"),
      REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
      MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
      ASYNC_ITERATOR = Symbol.asyncIterator,
      LocalPromise = Promise,
      scheduleMicrotask =
        "function" === typeof queueMicrotask
          ? queueMicrotask
          : function (callback) {
              LocalPromise.resolve(null)
                .then(callback)
                .catch(handleErrorInNextTick);
            },
      currentView = null,
      writtenBytes = 0,
      textEncoder = new TextEncoder(),
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
            case "_debugInfo":
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
    var framesToSkip = 0,
      collectedStackTrace = null,
      identifierRegExp = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/,
      frameRegExp =
        /^ {3} at (?:(.+) \((?:(.+):(\d+):(\d+)|<anonymous>)\)|(?:async )?(.+):(\d+):(\d+)|<anonymous>)$/,
      stackTraceCache = new WeakMap(),
      supportsRequestStorage = "function" === typeof AsyncLocalStorage,
      requestStorage = supportsRequestStorage ? new AsyncLocalStorage() : null,
      supportsComponentStorage = supportsRequestStorage,
      componentStorage = supportsComponentStorage
        ? new AsyncLocalStorage()
        : null,
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
            case "_debugInfo":
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
      SuspenseException = Error(
        "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
      ),
      suspendedThenable = null,
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
        }
      };
    HooksDispatcher.useEffectEvent = unsupportedHook;
    var currentOwner = null,
      DefaultAsyncDispatcher = {
        getCacheForType: function (resourceType) {
          var cache = (cache = resolveRequest()) ? cache.cache : new Map();
          var entry = cache.get(resourceType);
          void 0 === entry &&
            ((entry = resourceType()), cache.set(resourceType, entry));
          return entry;
        },
        cacheSignal: function () {
          var request = resolveRequest();
          return request ? request.cacheController.signal : null;
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
      getPrototypeOf = Object.getPrototypeOf,
      jsxPropsParents = new WeakMap(),
      jsxChildrenParents = new WeakMap(),
      CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
      hasOwnProperty = Object.prototype.hasOwnProperty,
      doNotLimit = new WeakSet();
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
    var ObjectPrototype = Object.prototype,
      stringify = JSON.stringify,
      ABORTING = 12,
      CLOSED = 14,
      TaintRegistryObjects = ReactSharedInternalsServer.TaintRegistryObjects,
      TaintRegistryValues = ReactSharedInternalsServer.TaintRegistryValues,
      TaintRegistryByteLengths =
        ReactSharedInternalsServer.TaintRegistryByteLengths,
      TaintRegistryPendingRequests =
        ReactSharedInternalsServer.TaintRegistryPendingRequests,
      defaultPostponeHandler = noop,
      currentRequest = null,
      canEmitDebugInfo = !1,
      serializedSize = 0,
      MAX_ROW_SIZE = 3200,
      modelRoot = !1,
      CONSTRUCTOR_MARKER = Symbol(),
      debugModelRoot = null,
      debugNoOutline = null,
      emptyRoot = {},
      decoderOptions = { stream: !0 },
      chunkCache = new Map();
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
    exports.decodeReplyFromAsyncIterable = function (
      iterable,
      webpackMap,
      options
    ) {
      function progress(entry) {
        if (entry.done) close(response$jscomp$0);
        else {
          entry = entry.value;
          var name = entry[0];
          entry = entry[1];
          if ("string" === typeof entry) {
            var response = response$jscomp$0;
            response._formData.append(name, entry);
            var prefix = response._prefix;
            name.startsWith(prefix) &&
              ((response = response._chunks),
              (name = +name.slice(prefix.length)),
              (prefix = response.get(name)) &&
                resolveModelChunk(prefix, entry, name));
          } else response$jscomp$0._formData.append(name, entry);
          iterator.next().then(progress, error);
        }
      }
      function error(reason) {
        reportGlobalError(response$jscomp$0, reason);
        "function" === typeof iterator.throw &&
          iterator.throw(reason).then(error, error);
      }
      var iterator = iterable[ASYNC_ITERATOR](),
        response$jscomp$0 = createResponse(
          webpackMap,
          "",
          options ? options.temporaryReferences : void 0
        );
      iterator.next().then(progress, error);
      return getChunk(response$jscomp$0, 0);
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
        $$location: { value: Error("react-stack-top-frame"), configurable: !0 },
        bind: { value: bind, configurable: !0 }
      });
    };
    exports.renderToReadableStream = function (model, webpackMap, options) {
      var debugChannelReadable =
          options && options.debugChannel
            ? options.debugChannel.readable
            : void 0,
        debugChannelWritable =
          options && options.debugChannel
            ? options.debugChannel.writable
            : void 0,
        request = createRequest(
          model,
          webpackMap,
          options ? options.onError : void 0,
          options ? options.identifierPrefix : void 0,
          options ? options.onPostpone : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          void 0 !== debugChannelReadable
        );
      if (options && options.signal) {
        var signal = options.signal;
        if (signal.aborted) abort(request, signal.reason);
        else {
          var listener = function () {
            abort(request, signal.reason);
            signal.removeEventListener("abort", listener);
          };
          signal.addEventListener("abort", listener);
        }
      }
      void 0 !== debugChannelWritable &&
        new ReadableStream(
          {
            type: "bytes",
            pull: function (controller) {
              if (13 === request.status)
                (request.status = CLOSED),
                  closeWithError(controller, request.fatalError);
              else if (
                request.status !== CLOSED &&
                null === request.debugDestination
              ) {
                request.debugDestination = controller;
                try {
                  flushCompletedChunks(request);
                } catch (error) {
                  logRecoverableError(request, error, null),
                    fatalError(request, error);
                }
              }
            }
          },
          { highWaterMark: 0 }
        ).pipeTo(debugChannelWritable);
      void 0 !== debugChannelReadable &&
        startReadingFromDebugChannelReadableStream(
          request,
          debugChannelReadable
        );
      return new ReadableStream(
        {
          type: "bytes",
          start: function () {
            startWork(request);
          },
          pull: function (controller) {
            startFlowing(request, controller);
          },
          cancel: function (reason) {
            request.destination = null;
            abort(request, reason);
          }
        },
        { highWaterMark: 0 }
      );
    };
    exports.unstable_prerender = function (model, webpackMap, options) {
      return new Promise(function (resolve, reject) {
        var request = createPrerenderRequest(
          model,
          webpackMap,
          function () {
            var stream = new ReadableStream(
              {
                type: "bytes",
                pull: function (controller) {
                  startFlowing(request, controller);
                },
                cancel: function (reason) {
                  request.destination = null;
                  abort(request, reason);
                }
              },
              { highWaterMark: 0 }
            );
            resolve({ prelude: stream });
          },
          reject,
          options ? options.onError : void 0,
          options ? options.identifierPrefix : void 0,
          options ? options.onPostpone : void 0,
          options ? options.temporaryReferences : void 0,
          options ? options.environmentName : void 0,
          options ? options.filterStackFrame : void 0,
          !1
        );
        if (options && options.signal) {
          var signal = options.signal;
          if (signal.aborted) abort(request, signal.reason);
          else {
            var listener = function () {
              abort(request, signal.reason);
              signal.removeEventListener("abort", listener);
            };
            signal.addEventListener("abort", listener);
          }
        }
        startWork(request);
      });
    };
  })();
