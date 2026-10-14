/**
 * @license React
 * react-server-dom-turbopack-client.node.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
"production" !== process.env.NODE_ENV &&
  (function () {
    function createStringDecoder() {
      return new util.TextDecoder("utf-8", {
        ignoreBOM:
          0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : !1
      });
    }
    function checkEvalAvailabilityOnceDev() {
      if (!hasConfirmedEval) {
        hasConfirmedEval = !0;
        try {
          (0, eval)("null");
        } catch ($jscomp$unused$catch) {
          console.error(
            "eval() is not supported in this environment. This can happen if you started the Node.js process with --disallow-code-generation-from-strings, or if `eval` was patched by other means. React requires eval() in development mode for various debugging features like reconstructing callstacks from a different environment.\nReact will never use eval() in production mode"
          );
        }
      }
    }
    function resolveClientReference(bundlerConfig, metadata) {
      if (bundlerConfig) {
        var moduleExports = bundlerConfig[metadata[0]];
        if ((bundlerConfig = moduleExports && moduleExports[metadata[2]]))
          moduleExports = bundlerConfig.name;
        else {
          bundlerConfig = moduleExports && moduleExports["*"];
          if (!bundlerConfig)
            throw Error(
              'Could not find the module "' +
                metadata[0] +
                '" in the React Server Consumer Manifest. This is probably a bug in the React Server Components bundler.'
            );
          moduleExports = metadata[2];
        }
        return 4 === metadata.length
          ? [bundlerConfig.id, bundlerConfig.chunks, moduleExports, 1]
          : [bundlerConfig.id, bundlerConfig.chunks, moduleExports];
      }
      return metadata;
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
    function prepareDestinationWithChunks(
      moduleLoading,
      chunks,
      nonce$jscomp$0
    ) {
      if (null !== moduleLoading)
        for (var i = 0; i < chunks.length; i++) {
          var chunk = chunks[i],
            nonce = nonce$jscomp$0,
            JSCompiler_temp_const = ReactDOMSharedInternals.d,
            JSCompiler_temp_const$jscomp$0 = JSCompiler_temp_const.X;
          chunk =
            moduleLoading.prefix +
            ("string" === typeof chunk ? chunk : chunk[0]);
          var JSCompiler_inline_result = moduleLoading.crossOrigin;
          JSCompiler_inline_result =
            "string" === typeof JSCompiler_inline_result
              ? "use-credentials" === JSCompiler_inline_result
                ? JSCompiler_inline_result
                : ""
              : void 0;
          JSCompiler_temp_const$jscomp$0.call(JSCompiler_temp_const, chunk, {
            crossOrigin: JSCompiler_inline_result,
            integrity: void 0,
            fetchPriority: void 0,
            nonce: nonce
          });
        }
    }
    function dispatchHint(code, model) {
      var dispatcher = ReactDOMSharedInternals.d;
      switch (code) {
        case "D":
          dispatcher.D(model);
          break;
        case "C":
          "string" === typeof model
            ? dispatcher.C(model)
            : dispatcher.C(model[0], model[1]);
          break;
        case "L":
          code = model[0];
          var as = model[1];
          3 === model.length
            ? dispatcher.L(code, as, model[2])
            : dispatcher.L(code, as);
          break;
        case "m":
          "string" === typeof model
            ? dispatcher.m(model)
            : dispatcher.m(model[0], model[1]);
          break;
        case "X":
          "string" === typeof model
            ? dispatcher.X(model)
            : dispatcher.X(model[0], model[1]);
          break;
        case "S":
          "string" === typeof model
            ? dispatcher.S(model)
            : dispatcher.S(
                model[0],
                0 === model[1] ? void 0 : model[1],
                3 === model.length ? model[2] : void 0
              );
          break;
        case "M":
          "string" === typeof model
            ? dispatcher.M(model)
            : dispatcher.M(model[0], model[1]);
      }
    }
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable)
        return null;
      maybeIterable =
        (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
        maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
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
          if (null !== value && value.$$typeof === CLIENT_REFERENCE_TAG$1)
            return "client";
          value = objectName(value);
          return "Object" === value ? "{...}" : value;
        case "function":
          return value.$$typeof === CLIENT_REFERENCE_TAG$1
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
        if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG$1) return "client";
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
      onResolve,
      onReject,
      signal
    ) {
      function endReplyLifetime() {
        null !== replyLifetimeController &&
          replyLifetimeController.abort("The reply ended.");
      }
      function resolve(value) {
        settled = !0;
        endReplyLifetime();
        onResolve(value);
      }
      function reject(error) {
        settled = !0;
        endReplyLifetime();
        onReject(error);
      }
      function attachAbortSignal(abortSignal) {
        abortSignal.aborted
          ? abort()
          : ((replyLifetimeController = new AbortController()),
            abortSignal.addEventListener(
              "abort",
              function () {
                abort();
              },
              { signal: replyLifetimeController.signal }
            ));
      }
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
              var _partJSON = JSON.stringify(entry.value, resolveToJSON);
              data.append(formFieldPrefix + streamId, _partJSON);
              iterator.next().then(progress, reject);
            } catch (x$1) {
              reject(x$1);
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
        "__proto__" === key &&
          console.error(
            "Expected not to serialize an object with own property `__proto__`. When parsed this property will be omitted.%s",
            describeObjectForErrorMessage(this, key)
          );
        var originalValue = this[key];
        "object" !== typeof originalValue ||
          originalValue === value ||
          originalValue instanceof Date ||
          ("Object" !== objectName(originalValue)
            ? console.error(
                "Only plain objects can be passed to Server Functions from the Client. %s objects are not supported.%s",
                objectName(originalValue),
                describeObjectForErrorMessage(this, key)
              )
            : console.error(
                "Only plain objects can be passed to Server Functions from the Client. Objects with toJSON methods are not supported. Convert it manually to a simple value before passing it to props.%s",
                describeObjectForErrorMessage(this, key)
              ));
        if (null === value) return null;
        if ("object" === typeof value) {
          originalValue = knownServerObjectReferences.get(value);
          if (void 0 !== originalValue) {
            key = writtenObjects.get(value);
            if (void 0 !== key)
              if (modelRoot === value) modelRoot = null;
              else return key;
            key = JSON.stringify({ id: originalValue }, resolveToJSON);
            null === formData && (formData = new FormData());
            var refId = nextPartId++;
            formData.set(formFieldPrefix + refId, key);
            key = "$H" + refId.toString(16);
            writtenObjects.set(value, key);
            return key;
          }
          switch (value.$$typeof) {
            case REACT_ELEMENT_TYPE:
              if (
                void 0 !== temporaryReferences &&
                -1 === key.indexOf(":") &&
                ((refId = writtenObjects.get(this)), void 0 !== refId)
              )
                return temporaryReferences.set(refId + ":" + key, value), "$T";
              if (void 0 !== temporaryReferences && modelRoot === value)
                return (modelRoot = null), "$T";
              throw Error(
                "React Element cannot be passed to Server Functions from the Client without a temporary reference set. Pass a TemporaryReferenceSet to the options." +
                  describeObjectForErrorMessage(this, key)
              );
            case REACT_LAZY_TYPE:
              originalValue = value._payload;
              var init = value._init;
              null === formData && (formData = new FormData());
              pendingParts++;
              try {
                refId = init(originalValue);
                var lazyId = nextPartId++,
                  partJSON = serializeModel(refId, lazyId);
                formData.append(formFieldPrefix + lazyId, partJSON);
                return "$" + lazyId.toString(16);
              } catch (x) {
                if (
                  "object" === typeof x &&
                  null !== x &&
                  "function" === typeof x.then
                ) {
                  pendingParts++;
                  var _lazyId = nextPartId++;
                  refId = function () {
                    try {
                      var _partJSON2 = serializeModel(value, _lazyId),
                        _data = formData;
                      _data.append(formFieldPrefix + _lazyId, _partJSON2);
                      pendingParts--;
                      0 === pendingParts && resolve(_data);
                    } catch (reason) {
                      reject(reason);
                    }
                  };
                  x.then(refId, refId);
                  return "$" + _lazyId.toString(16);
                }
                reject(x);
                return null;
              } finally {
                pendingParts--;
              }
          }
          refId = writtenObjects.get(value);
          if ("function" === typeof value.then) {
            if (void 0 !== refId)
              if (modelRoot === value) modelRoot = null;
              else return refId;
            null === formData && (formData = new FormData());
            pendingParts++;
            var promiseId = nextPartId++;
            key = "$@" + promiseId.toString(16);
            writtenObjects.set(value, key);
            value.then(function (partValue) {
              try {
                var previousReference = writtenObjects.get(partValue);
                var _partJSON3 =
                  void 0 !== previousReference
                    ? JSON.stringify(previousReference)
                    : serializeModel(partValue, promiseId);
                partValue = formData;
                partValue.append(formFieldPrefix + promiseId, _partJSON3);
                pendingParts--;
                0 === pendingParts && resolve(partValue);
              } catch (reason) {
                reject(reason);
              }
            }, reject);
            return key;
          }
          if (void 0 !== refId)
            if (modelRoot === value) modelRoot = null;
            else return refId;
          else
            -1 === key.indexOf(":") &&
              ((refId = writtenObjects.get(this)),
              void 0 !== refId &&
                ((refId = refId + ":" + key),
                writtenObjects.set(value, refId),
                void 0 !== temporaryReferences &&
                  temporaryReferences.set(refId, value)));
          if (isArrayImpl(value)) return value;
          if (value instanceof FormData) {
            null === formData && (formData = new FormData());
            var _data3 = formData;
            key = nextPartId++;
            var prefix = formFieldPrefix + "_" + key + "_";
            value.forEach(function (originalValue, originalKey) {
              _data3.append(prefix + originalKey, originalValue);
            });
            return "$K" + key.toString(16);
          }
          if (value instanceof Map)
            return (
              (key = nextPartId++),
              (refId = serializeModel(Array.from(value), key)),
              null === formData && (formData = new FormData()),
              formData.append(formFieldPrefix + key, refId),
              "$Q" + key.toString(16)
            );
          if (value instanceof Set)
            return (
              (key = nextPartId++),
              (refId = serializeModel(Array.from(value), key)),
              null === formData && (formData = new FormData()),
              formData.append(formFieldPrefix + key, refId),
              "$W" + key.toString(16)
            );
          if (value instanceof ArrayBuffer)
            return (
              (key = new Blob([value])),
              (refId = nextPartId++),
              null === formData && (formData = new FormData()),
              formData.append(formFieldPrefix + refId, key),
              "$A" + refId.toString(16)
            );
          if (value instanceof Int8Array)
            return serializeTypedArray("O", value);
          if (value instanceof Uint8Array)
            return serializeTypedArray("o", value);
          if (value instanceof Uint8ClampedArray)
            return serializeTypedArray("U", value);
          if (value instanceof Int16Array)
            return serializeTypedArray("S", value);
          if (value instanceof Uint16Array)
            return serializeTypedArray("s", value);
          if (value instanceof Int32Array)
            return serializeTypedArray("L", value);
          if (value instanceof Uint32Array)
            return serializeTypedArray("l", value);
          if (value instanceof Float32Array)
            return serializeTypedArray("G", value);
          if (value instanceof Float64Array)
            return serializeTypedArray("g", value);
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
          if ((refId = getIteratorFn(value)))
            return (
              (refId = refId.call(value)),
              refId === value
                ? ((key = nextPartId++),
                  (refId = serializeModel(Array.from(refId), key)),
                  null === formData && (formData = new FormData()),
                  formData.append(formFieldPrefix + key, refId),
                  "$i" + key.toString(16))
                : Array.from(refId)
            );
          if (
            "function" === typeof ReadableStream &&
            value instanceof ReadableStream
          )
            return serializeReadableStream(value);
          refId = value[ASYNC_ITERATOR];
          if ("function" === typeof refId)
            return serializeAsyncIterable(value, refId.call(value));
          refId = getPrototypeOf(value);
          if (
            refId !== ObjectPrototype$2 &&
            (null === refId || null !== getPrototypeOf(refId))
          ) {
            if (void 0 === temporaryReferences)
              throw Error(
                "Only plain objects, and a few built-ins, can be passed to Server Functions. Classes or null prototypes are not supported." +
                  describeObjectForErrorMessage(this, key)
              );
            return "$T";
          }
          value.$$typeof === REACT_CONTEXT_TYPE
            ? console.error(
                "React Context Providers cannot be passed to Server Functions from the Client.%s",
                describeObjectForErrorMessage(this, key)
              )
            : "Object" !== objectName(value)
              ? console.error(
                  "Only plain objects can be passed to Server Functions from the Client. %s objects are not supported.%s",
                  objectName(value),
                  describeObjectForErrorMessage(this, key)
                )
              : isSimpleObject(value)
                ? Object.getOwnPropertySymbols &&
                  ((refId = Object.getOwnPropertySymbols(value)),
                  0 < refId.length &&
                    console.error(
                      "Only plain objects can be passed to Server Functions from the Client. Objects with symbol properties like %s are not supported.%s",
                      refId[0].description,
                      describeObjectForErrorMessage(this, key)
                    ))
                : console.error(
                    "Only plain objects can be passed to Server Functions from the Client. Classes or other objects with methods are not supported.%s",
                    describeObjectForErrorMessage(this, key)
                  );
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
          refId = knownServerReferences.get(value);
          if (void 0 !== refId) {
            key = writtenObjects.get(value);
            if (void 0 !== key) return key;
            key = JSON.stringify(
              { id: refId.id, bound: refId.bound },
              resolveToJSON
            );
            null === formData && (formData = new FormData());
            refId = nextPartId++;
            formData.set(formFieldPrefix + refId, key);
            key = "$h" + refId.toString(16);
            writtenObjects.set(value, key);
            return key;
          }
          if (
            void 0 !== temporaryReferences &&
            -1 === key.indexOf(":") &&
            ((refId = writtenObjects.get(this)), void 0 !== refId)
          )
            return temporaryReferences.set(refId + ":" + key, value), "$T";
          throw Error(
            "Client Functions cannot be passed directly to Server Functions. Only Functions passed from the Server can be passed back again."
          );
        }
        if ("symbol" === typeof value) {
          if (
            void 0 !== temporaryReferences &&
            -1 === key.indexOf(":") &&
            ((refId = writtenObjects.get(this)), void 0 !== refId)
          )
            return temporaryReferences.set(refId + ":" + key, value), "$T";
          throw Error(
            "Symbols cannot be passed to a Server Function without a temporary reference set. Pass a TemporaryReferenceSet to the options." +
              describeObjectForErrorMessage(this, key)
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
      function abort() {
        endReplyLifetime();
        0 < pendingParts &&
          ((pendingParts = 0),
          null === formData ? resolve(json) : resolve(formData));
      }
      var nextPartId = 1,
        pendingParts = 0,
        formData = null,
        writtenObjects = new WeakMap(),
        modelRoot = root,
        settled = !1,
        replyLifetimeController = null;
      checkEvalAvailabilityOnceDev();
      var json = serializeModel(root, 0);
      null === formData
        ? resolve(json)
        : (formData.set(formFieldPrefix + "0", json),
          0 === pendingParts && resolve(formData));
      void 0 === signal || settled || attachAbortSignal(signal);
    }
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
      var referenceClosure = knownServerReferences.get(this);
      if (!referenceClosure)
        throw Error(
          "Tried to encode a Server Action from a different instance than the encoder is from. This is a bug in React."
        );
      var data = null;
      if (null !== referenceClosure.bound) {
        data = boundCache.get(referenceClosure);
        data ||
          ((data = encodeFormData({
            id: referenceClosure.id,
            bound: referenceClosure.bound
          })),
          boundCache.set(referenceClosure, data));
        if ("rejected" === data.status) throw data.reason;
        if ("fulfilled" !== data.status) throw data;
        referenceClosure = data.value;
        var prefixedData = new FormData();
        referenceClosure.forEach(function (value, key) {
          prefixedData.append("$ACTION_" + identifierPrefix + ":" + key, value);
        });
        data = prefixedData;
        referenceClosure = "$ACTION_REF_" + identifierPrefix;
      } else referenceClosure = "$ACTION_ID_" + referenceClosure.id;
      return {
        name: referenceClosure,
        method: "POST",
        encType: "multipart/form-data",
        data: data
      };
    }
    function isSignatureEqual(referenceId, numberOfBoundArgs) {
      var referenceClosure = knownServerReferences.get(this);
      if (!referenceClosure)
        throw Error(
          "Tried to encode a Server Action from a different instance than the encoder is from. This is a bug in React."
        );
      if (referenceClosure.id !== referenceId) return !1;
      var boundPromise = referenceClosure.bound;
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
    function createFakeServerFunction(
      name,
      filename,
      sourceMap,
      line,
      col,
      environmentName,
      innerFunction
    ) {
      name || (name = "<anonymous>");
      var encodedName = JSON.stringify(name);
      1 >= line
        ? ((line = encodedName.length + 7),
          (col =
            "s=>({" +
            encodedName +
            " ".repeat(col < line ? 0 : col - line) +
            ":(...args) => s(...args)})\n/* This module is a proxy to a Server Action. Turn on Source Maps to see the server source. */"))
        : (col =
            "/* This module is a proxy to a Server Action. Turn on Source Maps to see the server source. */" +
            "\n".repeat(line - 2) +
            "server=>({" +
            encodedName +
            ":\n" +
            " ".repeat(1 > col ? 0 : col - 1) +
            "(...args) => server(...args)})");
      filename.startsWith("/") && (filename = "file://" + filename);
      sourceMap
        ? ((col +=
            "\n//# sourceURL=about://React/" +
            encodeURIComponent(environmentName) +
            "/" +
            encodeURI(filename) +
            "?s" +
            fakeServerFunctionIdx++),
          (col += "\n//# sourceMappingURL=" + sourceMap))
        : filename && (col += "\n//# sourceURL=" + filename);
      try {
        return (0, eval)(col)(innerFunction)[name];
      } catch (x) {
        return innerFunction;
      }
    }
    function registerBoundServerReference(
      reference,
      id,
      bound,
      encodeFormAction
    ) {
      knownServerReferences.has(reference) ||
        (knownServerReferences.set(reference, {
          id: id,
          originalBind: reference.bind,
          bound: bound
        }),
        Object.defineProperties(reference, {
          $$FORM_ACTION: {
            value:
              void 0 === encodeFormAction
                ? defaultEncodeFormAction
                : function () {
                    var referenceClosure = knownServerReferences.get(this);
                    if (!referenceClosure)
                      throw Error(
                        "Tried to encode a Server Action from a different instance than the encoder is from. This is a bug in React."
                      );
                    var boundPromise = referenceClosure.bound;
                    null === boundPromise &&
                      (boundPromise = Promise.resolve([]));
                    return encodeFormAction(referenceClosure.id, boundPromise);
                  }
          },
          $$IS_SIGNATURE_EQUAL: { value: isSignatureEqual },
          bind: { value: bind }
        }));
    }
    function createServerObjectReference(id) {
      var reference = new Proxy({}, serverObjectReferenceProxyHandlers);
      knownServerObjectReferences.set(reference, id);
      return reference;
    }
    function bind() {
      var referenceClosure = knownServerReferences.get(this);
      if (!referenceClosure) return FunctionBind.apply(this, arguments);
      var newFn = referenceClosure.originalBind.apply(this, arguments);
      null != arguments[0] &&
        console.error(
          'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
        );
      var args = ArraySlice.call(arguments, 1),
        boundPromise = null;
      boundPromise =
        null !== referenceClosure.bound
          ? Promise.resolve(referenceClosure.bound).then(function (boundArgs) {
              return boundArgs.concat(args);
            })
          : Promise.resolve(args);
      knownServerReferences.set(newFn, {
        id: referenceClosure.id,
        originalBind: newFn.bind,
        bound: boundPromise
      });
      Object.defineProperties(newFn, {
        $$FORM_ACTION: { value: this.$$FORM_ACTION },
        $$IS_SIGNATURE_EQUAL: { value: isSignatureEqual },
        bind: { value: bind }
      });
      return newFn;
    }
    function createBoundServerReference(
      metaData,
      callServer,
      encodeFormAction,
      findSourceMapURL
    ) {
      function action() {
        var args = Array.prototype.slice.call(arguments);
        return bound
          ? "fulfilled" === bound.status
            ? callServer(id, bound.value.concat(args))
            : Promise.resolve(bound).then(function (boundArgs) {
                return callServer(id, boundArgs.concat(args));
              })
          : callServer(id, args);
      }
      var id = metaData.id,
        bound = metaData.bound,
        location = metaData.location;
      if (location) {
        var functionName = metaData.name || "",
          filename = location[1],
          line = location[2];
        location = location[3];
        metaData = metaData.env || "Server";
        findSourceMapURL =
          null == findSourceMapURL
            ? null
            : findSourceMapURL(filename, metaData);
        action = createFakeServerFunction(
          functionName,
          filename,
          findSourceMapURL,
          line,
          location,
          metaData,
          action
        );
      }
      registerBoundServerReference(action, id, bound, encodeFormAction);
      return action;
    }
    function parseStackLocation(error) {
      error = error.stack;
      error.startsWith("Error: react-stack-top-frame\n") &&
        (error = error.slice(29));
      var endOfFirst = error.indexOf("\n");
      if (-1 !== endOfFirst) {
        var endOfSecond = error.indexOf("\n", endOfFirst + 1);
        endOfFirst =
          -1 === endOfSecond
            ? error.slice(endOfFirst + 1)
            : error.slice(endOfFirst + 1, endOfSecond);
      } else endOfFirst = error;
      error = v8FrameRegExp.exec(endOfFirst);
      if (
        !error &&
        ((error = jscSpiderMonkeyFrameRegExp.exec(endOfFirst)), !error)
      )
        return null;
      endOfFirst = error[1] || "";
      "<anonymous>" === endOfFirst && (endOfFirst = "");
      endOfSecond = error[2] || error[5] || "";
      "<anonymous>" === endOfSecond && (endOfSecond = "");
      return [
        endOfFirst,
        endOfSecond,
        +(error[3] || error[6]),
        +(error[4] || error[7])
      ];
    }
    function createServerReference$1(
      id,
      callServer,
      encodeFormAction,
      findSourceMapURL,
      functionName
    ) {
      function action() {
        var args = Array.prototype.slice.call(arguments);
        return callServer(id, args);
      }
      var location = parseStackLocation(Error("react-stack-top-frame"));
      if (null !== location) {
        var filename = location[1],
          line = location[2];
        location = location[3];
        findSourceMapURL =
          null == findSourceMapURL
            ? null
            : findSourceMapURL(filename, "Client");
        action = createFakeServerFunction(
          functionName || "",
          filename,
          findSourceMapURL,
          line,
          location,
          "Client",
          action
        );
      }
      registerBoundServerReference(action, id, null, encodeFormAction);
      return action;
    }
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
        case REACT_PROFILER_TYPE:
          return "Profiler";
        case REACT_STRICT_MODE_TYPE:
          return "StrictMode";
        case REACT_SUSPENSE_TYPE:
          return "Suspense";
        case REACT_SUSPENSE_LIST_TYPE:
          return "SuspenseList";
        case REACT_ACTIVITY_TYPE:
          return "Activity";
        case REACT_VIEW_TRANSITION_TYPE:
          return "ViewTransition";
      }
      if ("object" === typeof type)
        switch (
          ("number" === typeof type.tag &&
            console.error(
              "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
            ),
          type.$$typeof)
        ) {
          case REACT_PORTAL_TYPE:
            return "Portal";
          case REACT_CONTEXT_TYPE:
            return type.displayName || "Context";
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
    function getArrayKind(array) {
      for (var kind = 0, i = 0; i < array.length && 100 > i; i++) {
        var value = array[i];
        if ("object" === typeof value && null !== value)
          if (
            isArrayImpl(value) &&
            2 === value.length &&
            "string" === typeof value[0]
          ) {
            if (0 !== kind && 3 !== kind) return 1;
            kind = 3;
          } else return 1;
        else {
          if (
            "function" === typeof value ||
            ("string" === typeof value && 50 < value.length) ||
            (0 !== kind && 2 !== kind) ||
            "bigint" === typeof value
          )
            return 1;
          kind = 2;
        }
      }
      return kind;
    }
    function addObjectToProperties(object, properties, indent, prefix) {
      if (!ArrayBuffer.isView(object)) {
        var addedProperties = 0,
          key;
        for (key in object)
          if (
            hasOwnProperty.call(object, key) &&
            "_" !== key[0] &&
            (addedProperties++,
            addValueToProperties(key, object[key], properties, indent, prefix),
            100 <= addedProperties)
          ) {
            properties.push([
              prefix +
                "\u00a0\u00a0".repeat(indent) +
                "Only 100 properties are shown. React will not log more properties of this object.",
              ""
            ]);
            break;
          }
      }
    }
    function addValueToProperties(
      propertyName,
      value,
      properties,
      indent,
      prefix
    ) {
      switch (typeof value) {
        case "object":
          if (null === value) {
            value = "null";
            break;
          } else {
            if (
              ("$$typeof" in value && hasOwnProperty.call(value, "$$typeof")
                ? value.$$typeof
                : void 0) === REACT_ELEMENT_TYPE
            ) {
              var typeName = getComponentNameFromType(value.type) || "\u2026",
                key = value.key;
              value = value.props;
              var propsKeys = Object.keys(value),
                propsLength = propsKeys.length;
              if (null == key && 0 === propsLength) {
                value = "<" + typeName + " />";
                break;
              }
              if (
                3 > indent ||
                (1 === propsLength &&
                  "children" === propsKeys[0] &&
                  null == key)
              ) {
                value = "<" + typeName + " \u2026 />";
                break;
              }
              properties.push([
                prefix + "\u00a0\u00a0".repeat(indent) + propertyName,
                "<" + typeName
              ]);
              null !== key &&
                addValueToProperties(
                  "key",
                  key,
                  properties,
                  indent + 1,
                  prefix
                );
              propertyName = !1;
              key = 0;
              for (var propKey in value)
                if (
                  (key++,
                  "children" === propKey
                    ? null != value.children &&
                      (!isArrayImpl(value.children) ||
                        0 < value.children.length) &&
                      (propertyName = !0)
                    : hasOwnProperty.call(value, propKey) &&
                      "_" !== propKey[0] &&
                      addValueToProperties(
                        propKey,
                        value[propKey],
                        properties,
                        indent + 1,
                        prefix
                      ),
                  100 <= key)
                )
                  break;
              properties.push([
                "",
                propertyName ? ">\u2026</" + typeName + ">" : "/>"
              ]);
              return;
            }
            typeName = Object.prototype.toString.call(value);
            typeName = typeName.slice(8, typeName.length - 1);
            if (ArrayBuffer.isView(value)) {
              value = value.length;
              value =
                "number" === typeof value
                  ? typeName + "(" + value + ")"
                  : typeName;
              break;
            }
            if ("Array" === typeName)
              if (
                ((propKey = 100 < value.length),
                (key = getArrayKind(value)),
                2 === key || 0 === key)
              ) {
                value = JSON.stringify(
                  propKey ? value.slice(0, 100).concat("\u2026") : value
                );
                break;
              } else if (3 === key) {
                properties.push([
                  prefix + "\u00a0\u00a0".repeat(indent) + propertyName,
                  ""
                ]);
                for (
                  propertyName = 0;
                  propertyName < value.length && 100 > propertyName;
                  propertyName++
                )
                  (typeName = value[propertyName]),
                    addValueToProperties(
                      typeName[0],
                      typeName[1],
                      properties,
                      indent + 1,
                      prefix
                    );
                propKey &&
                  addValueToProperties(
                    (100).toString(),
                    "\u2026",
                    properties,
                    indent + 1,
                    prefix
                  );
                return;
              }
            if ("Promise" === typeName) {
              if ("fulfilled" === value.status) {
                if (
                  ((typeName = properties.length),
                  addValueToProperties(
                    propertyName,
                    value.value,
                    properties,
                    indent,
                    prefix
                  ),
                  properties.length > typeName)
                ) {
                  properties = properties[typeName];
                  properties[1] =
                    "Promise<" + (properties[1] || "Object") + ">";
                  return;
                }
              } else if (
                "rejected" === value.status &&
                ((typeName = properties.length),
                addValueToProperties(
                  propertyName,
                  value.reason,
                  properties,
                  indent,
                  prefix
                ),
                properties.length > typeName)
              ) {
                properties = properties[typeName];
                properties[1] = "Rejected Promise<" + properties[1] + ">";
                return;
              }
              properties.push([
                "\u00a0\u00a0".repeat(indent) + propertyName,
                "Promise"
              ]);
              return;
            }
            "Object" === typeName &&
              (propKey = Object.getPrototypeOf(value)) &&
              "function" === typeof propKey.constructor &&
              (typeName = propKey.constructor.name);
            properties.push([
              prefix + "\u00a0\u00a0".repeat(indent) + propertyName,
              "Object" === typeName ? (3 > indent ? "" : "\u2026") : typeName
            ]);
            3 > indent &&
              addObjectToProperties(value, properties, indent + 1, prefix);
            return;
          }
        case "function":
          value = value.name;
          value =
            "" === value || "string" !== typeof value
              ? "() => {}"
              : value + "() {}";
          break;
        case "string":
          value =
            "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects." ===
            value
              ? "\u2026"
              : JSON.stringify(
                  1024 <= value.length ? value.slice(0, 1023) + "\u2026" : value
                );
          break;
        case "undefined":
          value = "undefined";
          break;
        case "boolean":
          value = value ? "true" : "false";
          break;
        default:
          value = String(value);
      }
      properties.push([
        prefix + "\u00a0\u00a0".repeat(indent) + propertyName,
        value
      ]);
    }
    function getIODescription(value) {
      try {
        switch (typeof value) {
          case "function":
            return value.name || "";
          case "object":
            if (null === value) return "";
            if (value instanceof Error) return String(value.message);
            if ("string" === typeof value.url) return value.url;
            if ("string" === typeof value.href) return value.href;
            if ("string" === typeof value.src) return value.src;
            if ("string" === typeof value.currentSrc) return value.currentSrc;
            if ("string" === typeof value.command) return value.command;
            if (
              "object" === typeof value.request &&
              null !== value.request &&
              "string" === typeof value.request.url
            )
              return value.request.url;
            if (
              "object" === typeof value.response &&
              null !== value.response &&
              "string" === typeof value.response.url
            )
              return value.response.url;
            if (
              "string" === typeof value.id ||
              "number" === typeof value.id ||
              "bigint" === typeof value.id
            )
              return String(value.id);
            if ("string" === typeof value.name) return value.name;
            var str = value.toString();
            return str.startsWith("[object ") ||
              5 > str.length ||
              500 < str.length
              ? ""
              : str;
          case "string":
            return 5 > value.length || 500 < value.length ? "" : value;
          case "number":
          case "bigint":
            return String(value);
          default:
            return "";
        }
      } catch (x) {
        return "";
      }
    }
    function markAllTracksInOrder() {
      supportsUserTiming &&
        (console.timeStamp(
          "Server Requests Track",
          0.001,
          0.001,
          "Server Requests \u269b",
          void 0,
          "primary-light"
        ),
        console.timeStamp(
          "Server Components Track",
          0.001,
          0.001,
          "Primary",
          "Server Components \u269b",
          "primary-light"
        ));
    }
    function getIOColor(functionName) {
      switch (functionName.charCodeAt(0) % 3) {
        case 0:
          return "tertiary-light";
        case 1:
          return "tertiary";
        default:
          return "tertiary-dark";
      }
    }
    function getIOLongName(ioInfo, description, env, rootEnv) {
      ioInfo = ioInfo.name;
      description =
        "" === description ? ioInfo : ioInfo + " (" + description + ")";
      return env === rootEnv || void 0 === env
        ? description
        : description + " [" + env + "]";
    }
    function getIOShortName(ioInfo, description, env, rootEnv) {
      ioInfo = ioInfo.name;
      env = env === rootEnv || void 0 === env ? "" : " [" + env + "]";
      var desc = "";
      rootEnv = 30 - ioInfo.length - env.length;
      if (1 < rootEnv) {
        var l = description.length;
        if (0 < l && l <= rootEnv) desc = " (" + description + ")";
        else if (
          description.startsWith("http://") ||
          description.startsWith("https://") ||
          description.startsWith("/")
        ) {
          var queryIdx = description.indexOf("?");
          -1 === queryIdx && (queryIdx = description.length);
          47 === description.charCodeAt(queryIdx - 1) && queryIdx--;
          desc = description.lastIndexOf("/", queryIdx - 1);
          queryIdx - desc < rootEnv
            ? (desc = " (\u2026" + description.slice(desc, queryIdx) + ")")
            : ((l = description.slice(desc, desc + rootEnv / 2)),
              (description = description.slice(
                queryIdx - rootEnv / 2,
                queryIdx
              )),
              (desc =
                " (" +
                (0 < desc ? "\u2026" : "") +
                l +
                "\u2026" +
                description +
                ")"));
        }
      }
      return ioInfo + desc + env;
    }
    function logComponentAwait(
      asyncInfo,
      trackIdx,
      startTime,
      endTime,
      rootEnv,
      value
    ) {
      if (supportsUserTiming && 0 < endTime) {
        var description = getIODescription(value),
          name = getIOShortName(
            asyncInfo.awaited,
            description,
            asyncInfo.env,
            rootEnv
          ),
          entryName = "await " + name;
        name = getIOColor(name);
        var debugTask = asyncInfo.debugTask || asyncInfo.awaited.debugTask;
        if (debugTask) {
          var properties = [];
          "object" === typeof value && null !== value
            ? addObjectToProperties(value, properties, 0, "")
            : void 0 !== value &&
              addValueToProperties("awaited value", value, properties, 0, "");
          asyncInfo = getIOLongName(
            asyncInfo.awaited,
            description,
            asyncInfo.env,
            rootEnv
          );
          debugTask.run(
            performance.measure.bind(performance, entryName, {
              start: 0 > startTime ? 0 : startTime,
              end: endTime,
              detail: {
                devtools: {
                  color: name,
                  track: trackNames[trackIdx],
                  trackGroup: "Server Components \u269b",
                  properties: properties,
                  tooltipText: asyncInfo
                }
              }
            })
          );
          performance.clearMeasures(entryName);
        } else
          console.timeStamp(
            entryName,
            0 > startTime ? 0 : startTime,
            endTime,
            trackNames[trackIdx],
            "Server Components \u269b",
            name
          );
      }
    }
    function logIOInfoErrored(ioInfo, rootEnv, error) {
      var startTime = ioInfo.start,
        endTime = ioInfo.end;
      if (supportsUserTiming && 0 <= endTime) {
        var description = getIODescription(error),
          entryName = getIOShortName(ioInfo, description, ioInfo.env, rootEnv),
          debugTask = ioInfo.debugTask;
        entryName = "\u200b" + entryName;
        debugTask
          ? ((error = [
              [
                "rejected with",
                "object" === typeof error &&
                null !== error &&
                "string" === typeof error.message
                  ? String(error.message)
                  : String(error)
              ]
            ]),
            (ioInfo =
              getIOLongName(ioInfo, description, ioInfo.env, rootEnv) +
              " Rejected"),
            debugTask.run(
              performance.measure.bind(performance, entryName, {
                start: 0 > startTime ? 0 : startTime,
                end: endTime,
                detail: {
                  devtools: {
                    color: "error",
                    track: "Server Requests \u269b",
                    properties: error,
                    tooltipText: ioInfo
                  }
                }
              })
            ),
            performance.clearMeasures(entryName))
          : console.timeStamp(
              entryName,
              0 > startTime ? 0 : startTime,
              endTime,
              "Server Requests \u269b",
              void 0,
              "error"
            );
      }
    }
    function logIOInfo(ioInfo, rootEnv, value) {
      var startTime = ioInfo.start,
        endTime = ioInfo.end;
      if (supportsUserTiming && 0 <= endTime) {
        var description = getIODescription(value),
          entryName = getIOShortName(ioInfo, description, ioInfo.env, rootEnv),
          color = getIOColor(entryName),
          debugTask = ioInfo.debugTask;
        entryName = "\u200b" + entryName;
        if (debugTask) {
          var properties = [];
          "object" === typeof value && null !== value
            ? addObjectToProperties(value, properties, 0, "")
            : void 0 !== value &&
              addValueToProperties("Resolved", value, properties, 0, "");
          ioInfo = getIOLongName(ioInfo, description, ioInfo.env, rootEnv);
          debugTask.run(
            performance.measure.bind(performance, entryName, {
              start: 0 > startTime ? 0 : startTime,
              end: endTime,
              detail: {
                devtools: {
                  color: color,
                  track: "Server Requests \u269b",
                  properties: properties,
                  tooltipText: ioInfo
                }
              }
            })
          );
          performance.clearMeasures(entryName);
        } else
          console.timeStamp(
            entryName,
            0 > startTime ? 0 : startTime,
            endTime,
            "Server Requests \u269b",
            void 0,
            color
          );
      }
    }
    function prepareStackTrace(error, structuredStackTrace) {
      error = (error.name || "Error") + ": " + (error.message || "");
      for (var i = 0; i < structuredStackTrace.length; i++)
        error += "\n    at " + structuredStackTrace[i].toString();
      return error;
    }
    function ReactPromise$2(status, value, reason) {
      this.status = status;
      this.value = value;
      this.reason = reason;
      this._children = [];
      this._debugChunk = null;
      this._debugInfo = [];
      this._receivedDebugInfo = null;
    }
    function hasGCedResponse(weakResponse) {
      return void 0 === weakResponse.weak.deref();
    }
    function unwrapWeakResponse(weakResponse) {
      weakResponse = weakResponse.weak.deref();
      if (void 0 === weakResponse)
        throw Error(
          "We did not expect to receive new data after GC:ing the response."
        );
      return weakResponse;
    }
    function closeDebugChannel(debugChannel) {
      debugChannel.callback && debugChannel.callback("");
    }
    function readChunk$1(chunk) {
      switch (chunk.status) {
        case "resolved_model":
          initializeModelChunk$1(chunk);
          break;
        case "resolved_module":
          initializeModuleChunk$1(chunk);
      }
      switch (chunk.status) {
        case "fulfilled":
          return chunk.value;
        case "pending":
        case "pending_weak":
        case "blocked":
        case "halted":
          throw chunk;
        default:
          throw chunk.reason;
      }
    }
    function getRoot$1(weakResponse) {
      weakResponse = unwrapWeakResponse(weakResponse);
      return getChunk(weakResponse, 0);
    }
    function createPendingChunk$1(response) {
      0 === response._pendingChunks++ &&
        ((response._weakResponse.response = response),
        null !== response._pendingInitialRender &&
          (clearTimeout(response._pendingInitialRender),
          (response._pendingInitialRender = null)));
      return new ReactPromise$2("pending", null, null);
    }
    function releasePendingChunk(response, chunk) {
      "pending" === chunk.status &&
        0 === --response._pendingChunks &&
        ((response._weakResponse.response = null),
        (response._pendingInitialRender = setTimeout(
          flushInitialRenderPerformance.bind(null, response),
          100
        )));
    }
    function haltChunk$1(response, chunk) {
      releasePendingChunk(response, chunk);
      chunk.status = "halted";
      chunk.value = null;
      chunk.reason = null;
    }
    function filterDebugInfo(response, value) {
      if (null !== response._debugEndTime) {
        response = response._debugEndTime - performance.timeOrigin;
        for (var debugInfo = [], i = 0; i < value._debugInfo.length; i++) {
          var info = value._debugInfo[i];
          if ("number" === typeof info.time && info.time > response) break;
          debugInfo.push(info);
        }
        value._debugInfo = debugInfo;
      }
    }
    function moveDebugInfoFromChunkToInnerValue(chunk, value) {
      value = resolveLazy(value);
      "object" !== typeof value ||
        null === value ||
        (!isArrayImpl(value) &&
          "function" !== typeof value[ASYNC_ITERATOR] &&
          value.$$typeof !== REACT_ELEMENT_TYPE &&
          value.$$typeof !== REACT_LAZY_TYPE) ||
        ((chunk = chunk._debugInfo.splice(0)),
        isArrayImpl(value._debugInfo)
          ? value._debugInfo.unshift.apply(value._debugInfo, chunk)
          : Object.isFrozen(value) ||
            Object.defineProperty(value, "_debugInfo", {
              configurable: !1,
              enumerable: !1,
              writable: !0,
              value: chunk
            }));
    }
    function wakeChunk$1(response, listeners, value, chunk) {
      for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        "function" === typeof listener
          ? listener(value)
          : fulfillReference(response, listener, value, chunk);
      }
      filterDebugInfo(response, chunk);
      moveDebugInfoFromChunkToInnerValue(chunk, value);
    }
    function rejectChunk$1(response, listeners, error) {
      for (var i = 0; i < listeners.length; i++) {
        var listener = listeners[i];
        "function" === typeof listener
          ? listener(error)
          : rejectReference(response, listener.handler, error);
      }
    }
    function resolveBlockedCycle(resolvedChunk, reference) {
      var referencedChunk = reference.handler.chunk;
      if (null === referencedChunk) return null;
      if (referencedChunk === resolvedChunk) return reference.handler;
      reference = referencedChunk.value;
      if (null !== reference)
        for (
          referencedChunk = 0;
          referencedChunk < reference.length;
          referencedChunk++
        ) {
          var listener = reference[referencedChunk];
          if (
            "function" !== typeof listener &&
            ((listener = resolveBlockedCycle(resolvedChunk, listener)),
            null !== listener)
          )
            return listener;
        }
      return null;
    }
    function wakeChunkIfInitialized$1(
      response,
      chunk,
      resolveListeners,
      rejectListeners
    ) {
      switch (chunk.status) {
        case "fulfilled":
          wakeChunk$1(response, resolveListeners, chunk.value, chunk);
          break;
        case "blocked":
          for (var i = 0; i < resolveListeners.length; i++) {
            var listener = resolveListeners[i];
            if ("function" !== typeof listener) {
              var cyclicHandler = resolveBlockedCycle(chunk, listener);
              if (null !== cyclicHandler)
                switch (
                  (fulfillReference(
                    response,
                    listener,
                    cyclicHandler.value,
                    chunk
                  ),
                  resolveListeners.splice(i, 1),
                  i--,
                  null !== rejectListeners &&
                    ((listener = rejectListeners.indexOf(listener)),
                    -1 !== listener && rejectListeners.splice(listener, 1)),
                  chunk.status)
                ) {
                  case "fulfilled":
                    wakeChunk$1(response, resolveListeners, chunk.value, chunk);
                    return;
                  case "rejected":
                    null !== rejectListeners &&
                      rejectChunk$1(response, rejectListeners, chunk.reason);
                    return;
                }
            }
          }
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
            rejectChunk$1(response, rejectListeners, chunk.reason);
      }
    }
    function triggerErrorOnChunk$1(response, chunk, error) {
      if (
        "pending" !== chunk.status &&
        "pending_weak" !== chunk.status &&
        "blocked" !== chunk.status
      )
        chunk.reason.error(error);
      else {
        releasePendingChunk(response, chunk);
        var listeners = chunk.reason;
        if (
          ("pending" === chunk.status || "pending_weak" === chunk.status) &&
          null != chunk._debugChunk
        ) {
          var prevHandler = initializingHandler,
            prevChunk = initializingChunk;
          initializingHandler = null;
          chunk.status = "blocked";
          chunk.value = null;
          chunk.reason = null;
          initializingChunk = chunk;
          try {
            initializeDebugChunk(response, chunk);
          } finally {
            (initializingHandler = prevHandler),
              (initializingChunk = prevChunk);
          }
        }
        chunk.status = "rejected";
        chunk.reason = error;
        a: if (null !== response._debugEndTime)
          for (
            prevHandler = response._debugEndTime - performance.timeOrigin,
              chunk = chunk._debugInfo,
              prevChunk = 0;
            prevChunk < chunk.length;
            prevChunk++
          ) {
            var info = chunk[prevChunk];
            if ("number" === typeof info.time && info.time > prevHandler) {
              chunk.length = prevChunk;
              break a;
            }
          }
        null !== listeners && rejectChunk$1(response, listeners, error);
      }
    }
    function createResolvedModelChunk(response, value) {
      return new ReactPromise$2("resolved_model", value, response);
    }
    function createResolvedIteratorResultChunk(response, value, done) {
      return new ReactPromise$2(
        "resolved_model",
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}",
        response
      );
    }
    function resolveIteratorResultChunk(response, chunk, value, done) {
      resolveModelChunk$1(
        response,
        chunk,
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}"
      );
    }
    function resolveModelChunk$1(response, chunk, value) {
      if ("pending" !== chunk.status && "pending_weak" !== chunk.status)
        chunk.reason.enqueueModel(value);
      else {
        releasePendingChunk(response, chunk);
        var resolveListeners = chunk.value,
          rejectListeners = chunk.reason;
        chunk.status = "resolved_model";
        chunk.value = value;
        chunk.reason = response;
        null !== resolveListeners &&
          (initializeModelChunk$1(chunk),
          wakeChunkIfInitialized$1(
            response,
            chunk,
            resolveListeners,
            rejectListeners
          ));
      }
    }
    function resolveModuleChunk$1(response, chunk, value) {
      if (
        "pending" === chunk.status ||
        "pending_weak" === chunk.status ||
        "blocked" === chunk.status
      ) {
        releasePendingChunk(response, chunk);
        var resolveListeners = chunk.value,
          rejectListeners = chunk.reason;
        chunk.status = "resolved_module";
        chunk.value = value;
        chunk.reason = null;
        value = [];
        null !== value && chunk._debugInfo.push.apply(chunk._debugInfo, value);
        null !== resolveListeners &&
          (initializeModuleChunk$1(chunk),
          wakeChunkIfInitialized$1(
            response,
            chunk,
            resolveListeners,
            rejectListeners
          ));
      }
    }
    function initializeDebugChunk(response, chunk) {
      var debugChunk = chunk._debugChunk;
      if (null !== debugChunk) {
        var debugInfo = chunk._debugInfo,
          prevIsInitializingDebugInfo = isInitializingDebugInfo;
        isInitializingDebugInfo = !0;
        try {
          if ("resolved_model" === debugChunk.status) {
            for (
              var idx = debugInfo.length, c = debugChunk._debugChunk;
              null !== c;

            )
              "fulfilled" !== c.status && idx++, (c = c._debugChunk);
            initializeModelChunk$1(debugChunk);
            switch (debugChunk.status) {
              case "fulfilled":
                debugInfo[idx] = initializeDebugInfo(
                  response,
                  debugChunk.value
                );
                break;
              case "blocked":
              case "pending":
              case "pending_weak":
                waitForReference(
                  debugChunk,
                  debugInfo,
                  "" + idx,
                  response,
                  initializeDebugInfo,
                  [""],
                  !0
                );
                break;
              default:
                throw debugChunk.reason;
            }
          } else
            switch (debugChunk.status) {
              case "fulfilled":
                break;
              case "blocked":
              case "pending":
              case "pending_weak":
                waitForReference(
                  debugChunk,
                  {},
                  "debug",
                  response,
                  initializeDebugInfo,
                  [""],
                  !0
                );
                break;
              default:
                throw debugChunk.reason;
            }
        } catch (error) {
          triggerErrorOnChunk$1(response, chunk, error);
        } finally {
          isInitializingDebugInfo = prevIsInitializingDebugInfo;
        }
      }
    }
    function initializeModelChunk$1(chunk) {
      var prevHandler = initializingHandler,
        prevChunk = initializingChunk;
      initializingHandler = null;
      var resolvedModel = chunk.value,
        response = chunk.reason;
      chunk.status = "blocked";
      chunk.value = null;
      chunk.reason = null;
      initializingChunk = chunk;
      initializeDebugChunk(response, chunk);
      try {
        var value = parseModel(response, resolvedModel);
        resolvedModel = initializingHandler;
        if (null !== resolvedModel) {
          if (resolvedModel.errored) {
            "blocked" === chunk.status &&
              triggerErrorOnChunk$1(response, chunk, resolvedModel.reason);
            return;
          }
          resolvedModel.value = value;
          resolvedModel.chunk = chunk;
        }
        var listeners = chunk.value,
          rejectListeners = chunk.reason;
        chunk.value = null;
        chunk.reason = null;
        if (null !== listeners) {
          for (
            var cyclic = null, deferred = null, i = 0;
            i < listeners.length;
            i++
          ) {
            var listener = listeners[i];
            if (
              "function" !== typeof listener &&
              null !== resolveBlockedCycle(chunk, listener)
            ) {
              if (
                (null === cyclic && (cyclic = []),
                cyclic.push(listener),
                null !== rejectListeners)
              ) {
                var rejectionIdx = rejectListeners.indexOf(listener);
                -1 !== rejectionIdx && rejectListeners.splice(rejectionIdx, 1);
              }
            } else
              null === deferred && (deferred = []), deferred.push(listener);
          }
          null !== deferred &&
            ((chunk.value = deferred), (chunk.reason = rejectListeners));
          if (null !== cyclic)
            for (listeners = 0; listeners < cyclic.length; listeners++)
              fulfillReference(response, cyclic[listeners], value, chunk);
        }
        "blocked" !== chunk.status ||
          (null !== resolvedModel && 0 < resolvedModel.deps) ||
          initializeBlockedChunk(response, chunk, value, null);
      } catch (error) {
        (chunk.status = "rejected"), (chunk.reason = error);
      } finally {
        (initializingHandler = prevHandler), (initializingChunk = prevChunk);
      }
    }
    function initializeModuleChunk$1(chunk) {
      try {
        var value = requireModule(chunk.value);
        chunk.status = "fulfilled";
        chunk.value = value;
        chunk.reason = null;
      } catch (error) {
        (chunk.status = "rejected"), (chunk.reason = error);
      }
    }
    function reportGlobalError$1(weakResponse, error) {
      if (!hasGCedResponse(weakResponse)) {
        var response = unwrapWeakResponse(weakResponse);
        response._closed = !0;
        response._closedReason = error;
        response._chunks.forEach(function (chunk) {
          "pending" === chunk.status
            ? triggerErrorOnChunk$1(response, chunk, error)
            : "pending_weak" === chunk.status
              ? haltChunk$1(response, chunk)
              : "fulfilled" === chunk.status &&
                null !== chunk.reason &&
                chunk.reason.error(error);
        });
        weakResponse = response._debugChannel;
        void 0 !== weakResponse &&
          (closeDebugChannel(weakResponse),
          (response._debugChannel = void 0),
          null !== debugChannelRegistry &&
            debugChannelRegistry.unregister(response));
      }
    }
    function nullRefGetter() {
      return null;
    }
    function getTaskName(type) {
      if (type === REACT_FRAGMENT_TYPE) return "<>";
      if ("function" === typeof type) return '"use client"';
      if (
        "object" === typeof type &&
        null !== type &&
        type.$$typeof === REACT_LAZY_TYPE
      )
        return type._payload instanceof ReactPromise$2
          ? '"use client"'
          : "<...>";
      try {
        var name = getComponentNameFromType(type);
        return name ? "<" + name + ">" : "<...>";
      } catch (x) {
        return "<...>";
      }
    }
    function initializeElement(response, element, lazyNode) {
      var stack = element._debugStack,
        owner = element._owner;
      null === owner && (element._owner = response._debugRootOwner);
      var env = response._rootEnvironmentName;
      null !== owner && null != owner.env && (env = owner.env);
      var normalizedStackTrace = null;
      null === owner && null != response._debugRootStack
        ? (normalizedStackTrace = response._debugRootStack)
        : null !== stack &&
          (normalizedStackTrace = createFakeJSXCallStackInDEV(
            response,
            stack,
            env
          ));
      element._debugStack = normalizedStackTrace;
      normalizedStackTrace = null;
      supportsCreateTask$1 &&
        null !== stack &&
        ((normalizedStackTrace = console.createTask.bind(
          console,
          getTaskName(element.type)
        )),
        (stack = buildFakeCallStack$1(
          response,
          stack,
          env,
          !1,
          normalizedStackTrace
        )),
        (env = null === owner ? null : initializeFakeTask(response, owner)),
        null === env
          ? ((env = response._debugRootTask),
            (normalizedStackTrace = null != env ? env.run(stack) : stack()))
          : (normalizedStackTrace = env.run(stack)));
      element._debugTask = normalizedStackTrace;
      null !== owner && initializeFakeStack(response, owner);
      null !== lazyNode &&
        "fulfilled" === lazyNode._payload.status &&
        lazyNode._debugInfo &&
        ((response = lazyNode._debugInfo.splice(0)),
        element._debugInfo
          ? element._debugInfo.unshift.apply(element._debugInfo, response)
          : Object.defineProperty(element, "_debugInfo", {
              configurable: !1,
              enumerable: !1,
              writable: !0,
              value: response
            }));
      Object.freeze(element.props);
    }
    function readChunkAndTransferValidation(store, payload) {
      payload = readChunk$1(payload);
      if (store.validated && "object" === typeof payload && null !== payload) {
        var $$typeof = payload.$$typeof;
        ($$typeof !== REACT_ELEMENT_TYPE && $$typeof !== REACT_LAZY_TYPE) ||
          !($$typeof = payload._store) ||
          $$typeof.validated ||
          ($$typeof.validated = store.validated);
      }
      return payload;
    }
    function createLazyChunkWrapper$1(chunk, validated) {
      var lazyType = {
        $$typeof: REACT_LAZY_TYPE,
        _payload: chunk,
        _init: readChunk$1
      };
      lazyType._debugInfo = chunk._debugInfo;
      chunk = { validated: validated };
      lazyType._store = chunk;
      lazyType._init = readChunkAndTransferValidation.bind(null, chunk);
      return lazyType;
    }
    function getChunk(response, id) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk ||
        ((chunk = response._closed
          ? response._allowPartialStream
            ? new ReactPromise$2("halted", null, null)
            : new ReactPromise$2("rejected", null, response._closedReason)
          : createPendingChunk$1(response)),
        chunks.set(id, chunk));
      return chunk;
    }
    function getWeakChunk(response, id) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk ||
        ((chunk = response._closed
          ? new ReactPromise$2("halted", null, null)
          : new ReactPromise$2("pending_weak", null, null)),
        chunks.set(id, chunk));
      return chunk;
    }
    function initializeBlockedChunk(response, chunk, value, reason) {
      var resolveListeners = chunk.value;
      chunk._receivedDebugInfo = null;
      chunk.status = "fulfilled";
      chunk.value = value;
      chunk.reason = reason;
      null !== resolveListeners
        ? wakeChunk$1(response, resolveListeners, value, chunk)
        : (filterDebugInfo(response, chunk),
          moveDebugInfoFromChunkToInnerValue(chunk, value));
    }
    function initializeChunkIfUnblocked(response, handler) {
      if (0 === handler.deps && !handler.errored) {
        var chunk = handler.chunk;
        null !== chunk &&
          "blocked" === chunk.status &&
          initializeBlockedChunk(
            response,
            chunk,
            handler.value,
            handler.reason
          );
      }
    }
    function fulfillReference(response, reference, value, fulfilledChunk) {
      var handler = reference.handler,
        parentObject = reference.parentObject,
        key = reference.key,
        map = reference.map,
        path = reference.path;
      try {
        for (var i = 1; i < path.length; i++) {
          for (
            ;
            "object" === typeof value &&
            null !== value &&
            value.$$typeof === REACT_LAZY_TYPE;

          ) {
            var referencedChunk = value._payload;
            if (referencedChunk === handler.chunk) value = handler.value;
            else {
              switch (referencedChunk.status) {
                case "resolved_model":
                  initializeModelChunk$1(referencedChunk);
                  break;
                case "resolved_module":
                  initializeModuleChunk$1(referencedChunk);
              }
              switch (referencedChunk.status) {
                case "fulfilled":
                  value = referencedChunk.value;
                  continue;
                case "blocked":
                  var cyclicHandler = resolveBlockedCycle(
                    referencedChunk,
                    reference
                  );
                  if (null !== cyclicHandler) {
                    value = cyclicHandler.value;
                    continue;
                  }
                case "pending":
                case "pending_weak":
                  path.splice(0, i - 1);
                  null === referencedChunk.value
                    ? (referencedChunk.value = [reference])
                    : referencedChunk.value.push(reference);
                  null === referencedChunk.reason
                    ? (referencedChunk.reason = [reference])
                    : referencedChunk.reason.push(reference);
                  return;
                case "halted":
                  return;
                default:
                  rejectReference(
                    response,
                    reference.handler,
                    referencedChunk.reason
                  );
                  return;
              }
            }
          }
          var name = path[i];
          if (
            "object" === typeof value &&
            null !== value &&
            hasOwnProperty.call(value, name)
          )
            value = value[name];
          else throw Error("Invalid reference.");
        }
        for (
          ;
          "object" === typeof value &&
          null !== value &&
          value.$$typeof === REACT_LAZY_TYPE;

        ) {
          var _referencedChunk = value._payload;
          if (_referencedChunk === handler.chunk) value = handler.value;
          else {
            switch (_referencedChunk.status) {
              case "resolved_model":
                initializeModelChunk$1(_referencedChunk);
                break;
              case "resolved_module":
                initializeModuleChunk$1(_referencedChunk);
            }
            switch (_referencedChunk.status) {
              case "fulfilled":
                value = _referencedChunk.value;
                continue;
            }
            break;
          }
        }
        var mappedValue = map(response, value, parentObject, key);
        "__proto__" !== key && (parentObject[key] = mappedValue);
        "" === key && null === handler.value && (handler.value = mappedValue);
        if (
          parentObject[0] === REACT_ELEMENT_TYPE &&
          "object" === typeof handler.value &&
          null !== handler.value &&
          handler.value.$$typeof === REACT_ELEMENT_TYPE
        ) {
          var element = handler.value;
          switch (key) {
            case "3":
              reference.isDebug ||
                transferReferencedDebugInfo(handler.chunk, fulfilledChunk);
              element.props = mappedValue;
              break;
            case "4":
              element._owner = mappedValue;
              break;
            case "5":
              element._debugStack = mappedValue;
              break;
            default:
              reference.isDebug ||
                transferReferencedDebugInfo(handler.chunk, fulfilledChunk);
          }
        } else
          reference.isDebug ||
            transferReferencedDebugInfo(handler.chunk, fulfilledChunk);
      } catch (error) {
        rejectReference(response, reference.handler, error);
        return;
      }
      handler.deps--;
      initializeChunkIfUnblocked(response, handler);
    }
    function rejectReference(response, handler, error) {
      if (!handler.errored) {
        var blockedValue = handler.value;
        handler.errored = !0;
        handler.value = null;
        handler.reason = error;
        handler = handler.chunk;
        if (null !== handler && "blocked" === handler.status) {
          if (
            "object" === typeof blockedValue &&
            null !== blockedValue &&
            blockedValue.$$typeof === REACT_ELEMENT_TYPE
          ) {
            var erroredComponent = {
              name: getComponentNameFromType(blockedValue.type) || "",
              owner: blockedValue._owner
            };
            erroredComponent.debugStack = blockedValue._debugStack;
            supportsCreateTask$1 &&
              (erroredComponent.debugTask = blockedValue._debugTask);
            handler._debugInfo.push(erroredComponent);
          }
          triggerErrorOnChunk$1(response, handler, error);
        }
      }
    }
    function waitForReference(
      referencedChunk,
      parentObject,
      key,
      response,
      map,
      path,
      isAwaitingDebugInfo
    ) {
      if (
        !(
          (void 0 !== response._debugChannel &&
            response._debugChannel.hasReadable) ||
          "pending" !== referencedChunk.status ||
          parentObject[0] !== REACT_ELEMENT_TYPE ||
          ("4" !== key && "5" !== key)
        )
      )
        return null;
      initializingHandler
        ? ((response = initializingHandler), response.deps++)
        : (response = initializingHandler =
            {
              parent: null,
              chunk: null,
              value: null,
              reason: null,
              deps: 1,
              errored: !1
            });
      parentObject = {
        handler: response,
        parentObject: parentObject,
        key: key,
        map: map,
        path: path
      };
      parentObject.isDebug = isAwaitingDebugInfo;
      null === referencedChunk.value
        ? (referencedChunk.value = [parentObject])
        : referencedChunk.value.push(parentObject);
      null === referencedChunk.reason
        ? (referencedChunk.reason = [parentObject])
        : referencedChunk.reason.push(parentObject);
      return null;
    }
    function loadServerReference$1(response, metaData, parentObject, key) {
      if (!response._serverReferenceConfig)
        return createBoundServerReference(
          metaData,
          response._callServer,
          response._encodeFormAction,
          response._debugFindSourceMapURL
        );
      var serverReference = resolveServerReference(
          response._serverReferenceConfig,
          metaData.id
        ),
        promise = preloadModule(serverReference);
      if (promise)
        metaData.bound && (promise = Promise.all([promise, metaData.bound]));
      else if (metaData.bound) promise = Promise.resolve(metaData.bound);
      else
        return (
          (promise = requireModule(serverReference)),
          registerBoundServerReference(
            promise,
            metaData.id,
            metaData.bound,
            response._encodeFormAction
          ),
          promise
        );
      if (initializingHandler) {
        var handler = initializingHandler;
        handler.deps++;
      } else
        handler = initializingHandler = {
          parent: null,
          chunk: null,
          value: null,
          reason: null,
          deps: 1,
          errored: !1
        };
      promise.then(
        function () {
          var resolvedValue = requireModule(serverReference);
          if (metaData.bound) {
            var boundArgs = metaData.bound.value.slice(0);
            boundArgs.unshift(null);
            resolvedValue = resolvedValue.bind.apply(resolvedValue, boundArgs);
          }
          registerBoundServerReference(
            resolvedValue,
            metaData.id,
            metaData.bound,
            response._encodeFormAction
          );
          "__proto__" !== key && (parentObject[key] = resolvedValue);
          "" === key &&
            null === handler.value &&
            (handler.value = resolvedValue);
          if (
            parentObject[0] === REACT_ELEMENT_TYPE &&
            "object" === typeof handler.value &&
            null !== handler.value &&
            handler.value.$$typeof === REACT_ELEMENT_TYPE
          )
            switch (((boundArgs = handler.value), key)) {
              case "3":
                boundArgs.props = resolvedValue;
                break;
              case "4":
                boundArgs._owner = resolvedValue;
            }
          handler.deps--;
          initializeChunkIfUnblocked(response, handler);
        },
        function (error) {
          if (!handler.errored) {
            var blockedValue = handler.value,
              erroredHandler = handler;
            erroredHandler.errored = !0;
            erroredHandler.value = null;
            erroredHandler.reason = error;
            erroredHandler = handler.chunk;
            if (
              null !== erroredHandler &&
              "blocked" === erroredHandler.status
            ) {
              if (
                "object" === typeof blockedValue &&
                null !== blockedValue &&
                blockedValue.$$typeof === REACT_ELEMENT_TYPE
              ) {
                var erroredComponent = {
                  name: getComponentNameFromType(blockedValue.type) || "",
                  owner: blockedValue._owner
                };
                erroredComponent.debugStack = blockedValue._debugStack;
                supportsCreateTask$1 &&
                  (erroredComponent.debugTask = blockedValue._debugTask);
                erroredHandler._debugInfo.push(erroredComponent);
              }
              triggerErrorOnChunk$1(response, erroredHandler, error);
            }
          }
        }
      );
      return null;
    }
    function loadServerObjectReference(response, metaData) {
      response = metaData.$$reference;
      if (void 0 !== response) return response;
      response = createServerObjectReference(metaData.id);
      return (metaData.$$reference = response);
    }
    function resolveLazy(value) {
      for (
        ;
        "object" === typeof value &&
        null !== value &&
        value.$$typeof === REACT_LAZY_TYPE;

      ) {
        var payload = value._payload;
        if ("fulfilled" === payload.status) value = payload.value;
        else break;
      }
      return value;
    }
    function transferReferencedDebugInfo(receivingChunk, referencedChunk) {
      if (null !== receivingChunk) {
        referencedChunk = referencedChunk._debugInfo;
        var receivingDebugInfo = receivingChunk._debugInfo,
          receivedDebugInfo = receivingChunk._receivedDebugInfo;
        null === receivedDebugInfo &&
          (receivedDebugInfo = receivingChunk._receivedDebugInfo = new Set());
        for (
          receivingChunk = 0;
          receivingChunk < referencedChunk.length;
          ++receivingChunk
        ) {
          var debugInfoEntry = referencedChunk[receivingChunk];
          null != debugInfoEntry.name ||
            receivedDebugInfo.has(debugInfoEntry) ||
            (receivedDebugInfo.add(debugInfoEntry),
            receivingDebugInfo.push(debugInfoEntry));
        }
      }
    }
    function getOutlinedModel(response, reference, parentObject, key, map) {
      var id = parseInt(reference, 16);
      reference =
        -1 === reference.indexOf(":")
          ? EMPTY_REFERENCE_PATH
          : reference.split(":");
      id = getChunk(response, id);
      null !== initializingChunk &&
        isArrayImpl(initializingChunk._children) &&
        initializingChunk._children.push(id);
      switch (id.status) {
        case "resolved_model":
          initializeModelChunk$1(id);
          break;
        case "resolved_module":
          initializeModuleChunk$1(id);
      }
      switch (id.status) {
        case "fulfilled":
          for (var value = id.value, i = 1; i < reference.length; i++) {
            for (
              ;
              "object" === typeof value &&
              null !== value &&
              value.$$typeof === REACT_LAZY_TYPE;

            ) {
              value = value._payload;
              switch (value.status) {
                case "resolved_model":
                  initializeModelChunk$1(value);
                  break;
                case "resolved_module":
                  initializeModuleChunk$1(value);
              }
              switch (value.status) {
                case "fulfilled":
                  value = value.value;
                  break;
                case "blocked":
                case "pending":
                case "pending_weak":
                  return waitForReference(
                    value,
                    parentObject,
                    key,
                    response,
                    map,
                    reference.slice(i - 1),
                    isInitializingDebugInfo
                  );
                case "halted":
                  return (
                    initializingHandler
                      ? ((parentObject = initializingHandler),
                        parentObject.deps++)
                      : (initializingHandler = {
                          parent: null,
                          chunk: null,
                          value: null,
                          reason: null,
                          deps: 1,
                          errored: !1
                        }),
                    null
                  );
                default:
                  return (
                    initializingHandler
                      ? ((parentObject = initializingHandler),
                        (parentObject.errored = !0),
                        (parentObject.value = null),
                        (parentObject.reason = value.reason))
                      : (initializingHandler = {
                          parent: null,
                          chunk: null,
                          value: null,
                          reason: value.reason,
                          deps: 0,
                          errored: !0
                        }),
                    null
                  );
              }
            }
            var name = reference[i];
            if (
              "object" !== typeof value ||
              null === value ||
              (getPrototypeOf(value) !== ObjectPrototype$1 &&
                getPrototypeOf(value) !== ArrayPrototype) ||
              !hasOwnProperty.call(value, name)
            )
              throw Error("Invalid reference.");
            value = value[name];
          }
          for (
            ;
            "object" === typeof value &&
            null !== value &&
            value.$$typeof === REACT_LAZY_TYPE;

          ) {
            reference = value._payload;
            switch (reference.status) {
              case "resolved_model":
                initializeModelChunk$1(reference);
                break;
              case "resolved_module":
                initializeModuleChunk$1(reference);
            }
            switch (reference.status) {
              case "fulfilled":
                value = reference.value;
                continue;
            }
            break;
          }
          response = map(response, value, parentObject, key);
          if (
            parentObject[0] !== REACT_ELEMENT_TYPE ||
            ("4" !== key && "5" !== key)
          )
            isInitializingDebugInfo ||
              transferReferencedDebugInfo(initializingChunk, id);
          return response;
        case "pending":
        case "pending_weak":
        case "blocked":
          return waitForReference(
            id,
            parentObject,
            key,
            response,
            map,
            reference,
            isInitializingDebugInfo
          );
        case "halted":
          return (
            initializingHandler
              ? ((parentObject = initializingHandler), parentObject.deps++)
              : (initializingHandler = {
                  parent: null,
                  chunk: null,
                  value: null,
                  reason: null,
                  deps: 1,
                  errored: !1
                }),
            null
          );
        default:
          return (
            initializingHandler
              ? ((parentObject = initializingHandler),
                (parentObject.errored = !0),
                (parentObject.value = null),
                (parentObject.reason = id.reason))
              : (initializingHandler = {
                  parent: null,
                  chunk: null,
                  value: null,
                  reason: id.reason,
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
    function applyConstructor(response, model, parentObject) {
      Object.setPrototypeOf(parentObject, model.prototype);
    }
    function defineLazyGetter(response, chunk, parentObject, key) {
      "__proto__" !== key &&
        Object.defineProperty(parentObject, key, {
          get: function () {
            "resolved_model" === chunk.status && initializeModelChunk$1(chunk);
            switch (chunk.status) {
              case "fulfilled":
                return chunk.value;
              case "rejected":
                throw chunk.reason;
            }
            return "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects.";
          },
          set: function () {},
          enumerable: !0,
          configurable: !1
        });
      return null;
    }
    function extractIterator(response, model) {
      return model[Symbol.iterator]();
    }
    function createModel(response, model) {
      return model;
    }
    function getInferredFunctionApproximate(code) {
      code = code.startsWith("Object.defineProperty(")
        ? code.slice(22)
        : code.startsWith("(")
          ? code.slice(1)
          : code;
      if (code.startsWith("async function")) {
        var idx = code.indexOf("(", 14);
        if (-1 !== idx)
          return (
            (code = code.slice(14, idx).trim()),
            (0, eval)("({" + JSON.stringify(code) + ":async function(){}})")[
              code
            ]
          );
      } else if (code.startsWith("function")) {
        if (((idx = code.indexOf("(", 8)), -1 !== idx))
          return (
            (code = code.slice(8, idx).trim()),
            (0, eval)("({" + JSON.stringify(code) + ":function(){}})")[code]
          );
      } else if (
        code.startsWith("class") &&
        ((idx = code.indexOf("{", 5)), -1 !== idx)
      )
        return (
          (code = code.slice(5, idx).trim()),
          (0, eval)("({" + JSON.stringify(code) + ":class{}})")[code]
        );
      return function () {};
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
                reason: null,
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
              null !== initializingChunk &&
                isArrayImpl(initializingChunk._children) &&
                initializingChunk._children.push(response),
              createLazyChunkWrapper$1(response, 0)
            );
          case "@":
            return (
              (parentObject = parseInt(value.slice(2), 16)),
              (response = getChunk(response, parentObject)),
              null !== initializingChunk &&
                isArrayImpl(initializingChunk._children) &&
                initializingChunk._children.push(response),
              response
            );
          case "w":
            return (
              (parentObject = parseInt(value.slice(2), 16)),
              (response = getWeakChunk(response, parentObject)),
              null !== initializingChunk &&
                isArrayImpl(initializingChunk._children) &&
                initializingChunk._children.push(response),
              response
            );
          case "S":
            return Symbol.for(value.slice(2));
          case "h":
            var ref = value.slice(2);
            return getOutlinedModel(
              response,
              ref,
              parentObject,
              key,
              loadServerReference$1
            );
          case "H":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(
                response,
                ref,
                parentObject,
                key,
                loadServerObjectReference
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
              (ref = value.slice(2)),
              getOutlinedModel(response, ref, parentObject, key, createMap)
            );
          case "W":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(response, ref, parentObject, key, createSet)
            );
          case "B":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(response, ref, parentObject, key, createBlob)
            );
          case "K":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(response, ref, parentObject, key, createFormData)
            );
          case "Z":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(
                response,
                ref,
                parentObject,
                key,
                resolveErrorDev
              )
            );
          case "i":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(
                response,
                ref,
                parentObject,
                key,
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
            return BigInt(value.slice(2));
          case "P":
            return (
              (ref = value.slice(2)),
              getOutlinedModel(
                response,
                ref,
                parentObject,
                key,
                applyConstructor
              )
            );
          case "E":
            response = value.slice(2);
            try {
              if (!mightHaveStaticConstructor.test(response))
                return (0, eval)(response);
            } catch (x) {}
            try {
              if (
                ((ref = getInferredFunctionApproximate(response)),
                response.startsWith("Object.defineProperty("))
              ) {
                var idx = response.lastIndexOf(',"name",{value:"');
                if (-1 !== idx) {
                  var name = JSON.parse(
                    response.slice(idx + 16 - 1, response.length - 2)
                  );
                  Object.defineProperty(ref, "name", { value: name });
                }
              }
            } catch (_) {
              ref = function () {};
            }
            return ref;
          case "Y":
            if (
              2 < value.length &&
              (ref = response._debugChannel && response._debugChannel.callback)
            ) {
              if ("@" === value[2])
                return (
                  (parentObject = value.slice(3)),
                  (key = parseInt(parentObject, 16)),
                  response._chunks.has(key) || ref("P:" + parentObject),
                  getChunk(response, key)
                );
              value = value.slice(2);
              idx = parseInt(value, 16);
              response._chunks.has(idx) || ref("Q:" + value);
              ref = getChunk(response, idx);
              return "fulfilled" === ref.status
                ? ref.value
                : defineLazyGetter(response, ref, parentObject, key);
            }
            "__proto__" !== key &&
              Object.defineProperty(parentObject, key, {
                get: function () {
                  return "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects.";
                },
                set: function () {},
                enumerable: !0,
                configurable: !1
              });
            return null;
          default:
            return (
              (ref = value.slice(1)),
              getOutlinedModel(response, ref, parentObject, key, createModel)
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
    function markIOStarted() {
      this._debugIOStarted = !0;
    }
    function ResponseInstance(
      bundlerConfig,
      serverReferenceConfig,
      moduleLoading,
      callServer,
      encodeFormAction,
      nonce,
      temporaryReferences,
      allowPartialStream,
      findSourceMapURL,
      replayConsole,
      environmentName,
      debugStartTime,
      debugEndTime,
      debugChannel
    ) {
      var chunks = new Map();
      this._bundlerConfig = bundlerConfig;
      this._serverReferenceConfig = serverReferenceConfig;
      this._moduleLoading = moduleLoading;
      this._callServer = void 0 !== callServer ? callServer : missingCall;
      this._encodeFormAction = encodeFormAction;
      this._nonce = nonce;
      this._chunks = chunks;
      this._stringDecoder = createStringDecoder(!0);
      this._closed = !1;
      this._closedReason = null;
      this._allowPartialStream = allowPartialStream;
      this._tempRefs = temporaryReferences;
      this._timeOrigin = 0;
      this._pendingInitialRender = null;
      this._pendingChunks = 0;
      this._weakResponse = { weak: new WeakRef(this), response: this };
      this._debugRootOwner = bundlerConfig =
        void 0 === ReactSharedInteralsServer ||
        null === ReactSharedInteralsServer.A
          ? null
          : ReactSharedInteralsServer.A.getOwner();
      this._debugRootStack =
        null !== bundlerConfig ? Error("react-stack-top-frame") : null;
      environmentName = void 0 === environmentName ? "Server" : environmentName;
      supportsCreateTask$1 &&
        (this._debugRootTask = console.createTask(
          '"use ' + environmentName.toLowerCase() + '"'
        ));
      this._debugStartTime =
        null == debugStartTime ? performance.now() : debugStartTime;
      this._debugIOStarted = !1;
      setTimeout(markIOStarted.bind(this), 0);
      this._debugEndTime = void 0 === debugEndTime ? null : debugEndTime;
      this._debugFindSourceMapURL = findSourceMapURL;
      this._debugChannel = debugChannel;
      this._blockedConsole = null;
      this._replayConsole = replayConsole;
      this._rootEnvironmentName = environmentName;
      debugChannel &&
        (null === debugChannelRegistry
          ? (closeDebugChannel(debugChannel), (this._debugChannel = void 0))
          : debugChannelRegistry.register(this, debugChannel, this));
      replayConsole && markAllTracksInOrder();
    }
    function createResponse$1(
      bundlerConfig,
      serverReferenceConfig,
      moduleLoading,
      callServer,
      encodeFormAction,
      nonce,
      temporaryReferences,
      allowPartialStream,
      findSourceMapURL,
      replayConsole,
      environmentName,
      debugStartTime,
      debugEndTime,
      debugChannel
    ) {
      checkEvalAvailabilityOnceDev();
      bundlerConfig = new ResponseInstance(
        bundlerConfig,
        serverReferenceConfig,
        moduleLoading,
        callServer,
        encodeFormAction,
        nonce,
        temporaryReferences,
        allowPartialStream,
        findSourceMapURL,
        replayConsole,
        environmentName,
        debugStartTime,
        debugEndTime,
        debugChannel
      )._weakResponse;
      return bundlerConfig;
    }
    function createStreamState(weakResponse, streamDebugValue) {
      var streamState = {
        _rowState: 0,
        _rowID: 0,
        _rowTag: 0,
        _rowLength: 0,
        _buffer: []
      };
      weakResponse = unwrapWeakResponse(weakResponse);
      var debugValuePromise = Promise.resolve(streamDebugValue);
      debugValuePromise.status = "fulfilled";
      debugValuePromise.value = streamDebugValue;
      streamState._debugInfo = {
        name: "rsc stream",
        start: weakResponse._debugStartTime,
        end: weakResponse._debugStartTime,
        byteSize: 0,
        value: debugValuePromise,
        owner: weakResponse._debugRootOwner,
        debugStack: weakResponse._debugRootStack,
        debugTask: weakResponse._debugRootTask
      };
      streamState._debugTargetChunkSize = MIN_CHUNK_SIZE;
      return streamState;
    }
    function incrementChunkDebugInfo(streamState, chunkLength) {
      var debugInfo = streamState._debugInfo,
        endTime = performance.now(),
        previousEndTime = debugInfo.end;
      chunkLength = debugInfo.byteSize + chunkLength;
      chunkLength > streamState._debugTargetChunkSize ||
      endTime > previousEndTime + 10
        ? ((streamState._debugInfo = {
            name: debugInfo.name,
            start: debugInfo.start,
            end: endTime,
            byteSize: chunkLength,
            value: debugInfo.value,
            owner: debugInfo.owner,
            debugStack: debugInfo.debugStack,
            debugTask: debugInfo.debugTask
          }),
          (streamState._debugTargetChunkSize = chunkLength + MIN_CHUNK_SIZE))
        : ((debugInfo.end = endTime), (debugInfo.byteSize = chunkLength));
    }
    function addAsyncInfo(chunk, asyncInfo) {
      var value = resolveLazy(chunk.value);
      "object" !== typeof value ||
      null === value ||
      (!isArrayImpl(value) &&
        "function" !== typeof value[ASYNC_ITERATOR] &&
        value.$$typeof !== REACT_ELEMENT_TYPE &&
        value.$$typeof !== REACT_LAZY_TYPE)
        ? chunk._debugInfo.push(asyncInfo)
        : isArrayImpl(value._debugInfo)
          ? value._debugInfo.push(asyncInfo)
          : Object.isFrozen(value) ||
            Object.defineProperty(value, "_debugInfo", {
              configurable: !1,
              enumerable: !1,
              writable: !0,
              value: [asyncInfo]
            });
    }
    function resolveChunkDebugInfo(response, streamState, chunk) {
      response._debugIOStarted &&
        ((response = { awaited: streamState._debugInfo }),
        "pending" === chunk.status || "blocked" === chunk.status
          ? ((response = addAsyncInfo.bind(null, chunk, response)),
            chunk.then(response, response))
          : addAsyncInfo(chunk, response));
    }
    function resolveBuffer(response, id, buffer, streamState) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk && "pending" !== chunk.status
        ? chunk.reason.enqueueValue(buffer)
        : (chunk && releasePendingChunk(response, chunk),
          (buffer = new ReactPromise$2("fulfilled", buffer, null)),
          resolveChunkDebugInfo(response, streamState, buffer),
          chunks.set(id, buffer));
    }
    function resolveModule$1(response, id, model, streamState) {
      var chunks = response._chunks,
        chunk = chunks.get(id),
        prevHandler = initializingHandler;
      initializingHandler = null;
      try {
        var clientReferenceMetadata = parseModel(response, model);
        if (null !== initializingHandler)
          throw Error(
            "A client reference was blocked on a row that has not been received yet. This is a bug in React."
          );
      } finally {
        initializingHandler = prevHandler;
      }
      var clientReference = resolveClientReference(
        response._bundlerConfig,
        clientReferenceMetadata
      );
      prepareDestinationWithChunks(
        response._moduleLoading,
        clientReferenceMetadata[1],
        response._nonce
      );
      if ((model = preloadModule(clientReference))) {
        if (chunk) {
          releasePendingChunk(response, chunk);
          var blockedChunk = chunk;
          blockedChunk.status = "blocked";
        } else
          (blockedChunk = new ReactPromise$2("blocked", null, null)),
            chunks.set(id, blockedChunk);
        resolveChunkDebugInfo(response, streamState, blockedChunk);
        model.then(
          function () {
            return resolveModuleChunk$1(
              response,
              blockedChunk,
              clientReference
            );
          },
          function (error) {
            return triggerErrorOnChunk$1(response, blockedChunk, error);
          }
        );
      } else
        chunk
          ? (resolveChunkDebugInfo(response, streamState, chunk),
            resolveModuleChunk$1(response, chunk, clientReference))
          : ((chunk = new ReactPromise$2(
              "resolved_module",
              clientReference,
              null
            )),
            resolveChunkDebugInfo(response, streamState, chunk),
            chunks.set(id, chunk));
    }
    function resolveStream(response, id, stream, controller, streamState) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      if (chunk) {
        if (
          (resolveChunkDebugInfo(response, streamState, chunk),
          "pending" === chunk.status)
        ) {
          id = chunk.value;
          if (null != chunk._debugChunk) {
            streamState = initializingHandler;
            chunks = initializingChunk;
            initializingHandler = null;
            chunk.status = "blocked";
            chunk.value = null;
            chunk.reason = null;
            initializingChunk = chunk;
            try {
              if (
                (initializeDebugChunk(response, chunk),
                null !== initializingHandler &&
                  !initializingHandler.errored &&
                  0 < initializingHandler.deps)
              ) {
                initializingHandler.value = stream;
                initializingHandler.reason = controller;
                initializingHandler.chunk = chunk;
                return;
              }
            } finally {
              (initializingHandler = streamState), (initializingChunk = chunks);
            }
          }
          chunk.status = "fulfilled";
          chunk.value = stream;
          chunk.reason = controller;
          null !== id
            ? wakeChunk$1(response, id, chunk.value, chunk)
            : (filterDebugInfo(response, chunk),
              moveDebugInfoFromChunkToInnerValue(chunk, stream));
        }
      } else
        0 === response._pendingChunks++ &&
          (response._weakResponse.response = response),
          (stream = new ReactPromise$2("fulfilled", stream, controller)),
          resolveChunkDebugInfo(response, streamState, stream),
          chunks.set(id, stream);
    }
    function startReadableStream(response, id, type, streamState) {
      var controller = null,
        closed = !1;
      type = new ReadableStream({
        type: type,
        start: function (c) {
          controller = c;
        }
      });
      var previousBlockedChunk = null;
      resolveStream(
        response,
        id,
        type,
        {
          enqueueValue: function (value) {
            null === previousBlockedChunk
              ? controller.enqueue(value)
              : previousBlockedChunk.then(function () {
                  controller.enqueue(value);
                });
          },
          enqueueModel: function (json) {
            if (null === previousBlockedChunk) {
              var chunk = createResolvedModelChunk(response, json);
              initializeModelChunk$1(chunk);
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
              var _chunk4 = createPendingChunk$1(response);
              _chunk4.then(
                function (v) {
                  return controller.enqueue(v);
                },
                function (e) {
                  return controller.error(e);
                }
              );
              previousBlockedChunk = _chunk4;
              chunk.then(function () {
                previousBlockedChunk === _chunk4 &&
                  (previousBlockedChunk = null);
                resolveModelChunk$1(response, _chunk4, json);
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
        },
        streamState
      );
    }
    function asyncIterator$1() {
      return this;
    }
    function createIterator(next) {
      next = { next: next };
      next[ASYNC_ITERATOR] = asyncIterator$1;
      return next;
    }
    function startAsyncIterable(response, id, iterator, streamState) {
      var buffer = [],
        closed = !1,
        nextWriteIndex = 0,
        iterable = {};
      iterable[ASYNC_ITERATOR] = function () {
        var nextReadIndex = 0;
        return createIterator(function (arg) {
          if (void 0 !== arg)
            throw Error(
              "Values cannot be passed to next() of AsyncIterables passed to Client Components."
            );
          if (nextReadIndex === buffer.length) {
            if (closed)
              return new ReactPromise$2(
                "fulfilled",
                { done: !0, value: void 0 },
                null
              );
            buffer[nextReadIndex] = createPendingChunk$1(response);
          }
          return buffer[nextReadIndex++];
        });
      };
      resolveStream(
        response,
        id,
        iterator ? iterable[ASYNC_ITERATOR]() : iterable,
        {
          enqueueValue: function (value) {
            if (nextWriteIndex === buffer.length)
              buffer[nextWriteIndex] = new ReactPromise$2(
                "fulfilled",
                { done: !1, value: value },
                null
              );
            else {
              var chunk = buffer[nextWriteIndex],
                resolveListeners = chunk.value,
                rejectListeners = chunk.reason;
              chunk.status = "fulfilled";
              chunk.value = { done: !1, value: value };
              chunk.reason = null;
              null !== resolveListeners &&
                wakeChunkIfInitialized$1(
                  response,
                  chunk,
                  resolveListeners,
                  rejectListeners
                );
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
                    ? (buffer[nextWriteIndex] =
                        createResolvedIteratorResultChunk(response, value, !0))
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
                    (buffer[nextWriteIndex] = createPendingChunk$1(response));
                nextWriteIndex < buffer.length;

              )
                triggerErrorOnChunk$1(
                  response,
                  buffer[nextWriteIndex++],
                  error
                );
          }
        },
        streamState
      );
    }
    function resolveErrorDev(response, errorInfo) {
      var name = errorInfo.name,
        message = errorInfo.message,
        stack = errorInfo.stack,
        env = errorInfo.env,
        errorOptions =
          "cause" in errorInfo
            ? {
                cause: reviveModel(
                  response,
                  errorInfo.cause,
                  errorInfo,
                  "cause"
                )
              }
            : void 0,
        isAggregateError =
          "undefined" !== typeof AggregateError && "errors" in errorInfo,
        revivedErrors = isAggregateError
          ? reviveModel(response, errorInfo.errors, errorInfo, "errors")
          : null;
      message = buildFakeCallStack$1(
        response,
        stack,
        env,
        !1,
        isAggregateError
          ? AggregateError.bind(
              null,
              revivedErrors,
              message ||
                "An error occurred in the Server Components render but no message was provided",
              errorOptions
            )
          : Error.bind(
              null,
              message ||
                "An error occurred in the Server Components render but no message was provided",
              errorOptions
            )
      );
      stack = null;
      null != errorInfo.owner &&
        ((errorInfo = errorInfo.owner.slice(1)),
        (errorInfo = getOutlinedModel(
          response,
          errorInfo,
          {},
          "",
          createModel
        )),
        null !== errorInfo &&
          (stack = initializeFakeTask(response, errorInfo)));
      null === stack
        ? ((response = getRootTask$1(response, env)),
          (response = null != response ? response.run(message) : message()))
        : (response = stack.run(message));
      response.name = name;
      response.environmentName = env;
      return response;
    }
    function createFakeFunction$1(
      name,
      filename,
      sourceMap,
      line,
      col,
      enclosingLine,
      enclosingCol,
      environmentName
    ) {
      name || (name = "<anonymous>");
      var encodedName = JSON.stringify(name);
      1 > enclosingLine ? (enclosingLine = 0) : enclosingLine--;
      1 > enclosingCol ? (enclosingCol = 0) : enclosingCol--;
      1 > line ? (line = 0) : line--;
      1 > col ? (col = 0) : col--;
      if (
        line < enclosingLine ||
        (line === enclosingLine && col < enclosingCol)
      )
        enclosingCol = enclosingLine = 0;
      1 > line
        ? ((line = encodedName.length + 3),
          (enclosingCol -= line),
          0 > enclosingCol && (enclosingCol = 0),
          (col = col - enclosingCol - line - 3),
          0 > col && (col = 0),
          (encodedName =
            "({" +
            encodedName +
            ":" +
            " ".repeat(enclosingCol) +
            "_=>" +
            " ".repeat(col) +
            "_()})"))
        : 1 > enclosingLine
          ? ((enclosingCol -= encodedName.length + 3),
            0 > enclosingCol && (enclosingCol = 0),
            (encodedName =
              "({" +
              encodedName +
              ":" +
              " ".repeat(enclosingCol) +
              "_=>" +
              "\n".repeat(line - enclosingLine) +
              " ".repeat(col) +
              "_()})"))
          : enclosingLine === line
            ? ((col = col - enclosingCol - 3),
              0 > col && (col = 0),
              (encodedName =
                "\n".repeat(enclosingLine - 1) +
                "({" +
                encodedName +
                ":\n" +
                " ".repeat(enclosingCol) +
                "_=>" +
                " ".repeat(col) +
                "_()})"))
            : (encodedName =
                "\n".repeat(enclosingLine - 1) +
                "({" +
                encodedName +
                ":\n" +
                " ".repeat(enclosingCol) +
                "_=>" +
                "\n".repeat(line - enclosingLine) +
                " ".repeat(col) +
                "_()})");
      encodedName =
        1 > enclosingLine
          ? encodedName +
            "\n/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
          : "/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */" +
            encodedName;
      filename.startsWith("/") && (filename = "file://" + filename);
      sourceMap
        ? ((encodedName +=
            "\n//# sourceURL=about://React/" +
            encodeURIComponent(environmentName) +
            "/" +
            encodeURI(filename) +
            "?" +
            fakeFunctionIdx$1++),
          (encodedName += "\n//# sourceMappingURL=" + sourceMap))
        : (encodedName = filename
            ? encodedName + ("\n//# sourceURL=" + encodeURI(filename))
            : encodedName + "\n//# sourceURL=<anonymous>");
      try {
        var fn = (0, eval)(encodedName)[name];
      } catch (x) {
        (fn = function (_) {
          return _();
        }),
          Object.defineProperty(fn, "name", { value: name });
      }
      return fn;
    }
    function buildFakeCallStack$1(
      response,
      stack,
      environmentName,
      useEnclosingLine,
      innerCall
    ) {
      for (var i = 0; i < stack.length; i++) {
        var frame = stack[i],
          frameKey =
            frame.join("-") +
            "-" +
            environmentName +
            (useEnclosingLine ? "-e" : "-n"),
          fn = fakeFunctionCache$1.get(frameKey);
        if (void 0 === fn) {
          fn = frame[0];
          var filename = frame[1],
            line = frame[2],
            col = frame[3],
            enclosingLine = frame[4];
          frame = frame[5];
          var findSourceMapURL = response._debugFindSourceMapURL;
          findSourceMapURL = findSourceMapURL
            ? findSourceMapURL(filename, environmentName)
            : null;
          fn = createFakeFunction$1(
            fn,
            filename,
            findSourceMapURL,
            line,
            col,
            useEnclosingLine ? line : enclosingLine,
            useEnclosingLine ? col : frame,
            environmentName
          );
          fakeFunctionCache$1.set(frameKey, fn);
        }
        innerCall = fn.bind(null, innerCall);
      }
      return innerCall;
    }
    function getRootTask$1(response, childEnvironmentName) {
      var rootTask = response._debugRootTask;
      return rootTask
        ? response._rootEnvironmentName !== childEnvironmentName
          ? ((response = console.createTask.bind(
              console,
              '"use ' + childEnvironmentName.toLowerCase() + '"'
            )),
            rootTask.run(response))
          : rootTask
        : null;
    }
    function initializeFakeTask(response, debugInfo) {
      if (!supportsCreateTask$1 || null == debugInfo.stack) return null;
      var cachedEntry = debugInfo.debugTask;
      if (void 0 !== cachedEntry) return cachedEntry;
      var useEnclosingLine = void 0 === debugInfo.key,
        stack = debugInfo.stack,
        env =
          null == debugInfo.env ? response._rootEnvironmentName : debugInfo.env;
      cachedEntry =
        null == debugInfo.owner || null == debugInfo.owner.env
          ? response._rootEnvironmentName
          : debugInfo.owner.env;
      var ownerTask =
        null == debugInfo.owner
          ? null
          : initializeFakeTask(response, debugInfo.owner);
      env =
        env !== cachedEntry
          ? '"use ' + env.toLowerCase() + '"'
          : void 0 !== debugInfo.key
            ? "<" + (debugInfo.name || "...") + ">"
            : void 0 !== debugInfo.name
              ? debugInfo.name || "unknown"
              : "await " + (debugInfo.awaited.name || "unknown");
      env = console.createTask.bind(console, env);
      useEnclosingLine = buildFakeCallStack$1(
        response,
        stack,
        cachedEntry,
        useEnclosingLine,
        env
      );
      null === ownerTask
        ? ((response = getRootTask$1(response, cachedEntry)),
          (response =
            null != response
              ? response.run(useEnclosingLine)
              : useEnclosingLine()))
        : (response = ownerTask.run(useEnclosingLine));
      return (debugInfo.debugTask = response);
    }
    function fakeJSXCallSite() {
      var previousStackTraceLimit = Error.stackTraceLimit;
      Error.stackTraceLimit = ownerStackTraceLimit;
      var error = Error("react-stack-top-frame");
      Error.stackTraceLimit = previousStackTraceLimit;
      return error;
    }
    function initializeFakeStack(response, debugInfo) {
      if (void 0 === debugInfo.debugStack) {
        null != debugInfo.stack &&
          (debugInfo.debugStack = createFakeJSXCallStackInDEV(
            response,
            debugInfo.stack,
            null == debugInfo.env ? "" : debugInfo.env
          ));
        var owner = debugInfo.owner;
        null != owner &&
          (initializeFakeStack(response, owner),
          void 0 === owner.debugLocation &&
            null != debugInfo.debugStack &&
            (owner.debugLocation = debugInfo.debugStack));
      }
    }
    function initializeDebugInfo(response, debugInfo) {
      void 0 !== debugInfo.stack && initializeFakeTask(response, debugInfo);
      if (null == debugInfo.owner && null != response._debugRootOwner) {
        var _componentInfoOrAsyncInfo = debugInfo;
        _componentInfoOrAsyncInfo.owner = response._debugRootOwner;
        _componentInfoOrAsyncInfo.stack = null;
        _componentInfoOrAsyncInfo.debugStack = response._debugRootStack;
        _componentInfoOrAsyncInfo.debugTask = response._debugRootTask;
      } else
        void 0 !== debugInfo.stack && initializeFakeStack(response, debugInfo);
      "number" === typeof debugInfo.time &&
        (debugInfo = { time: debugInfo.time + response._timeOrigin });
      return debugInfo;
    }
    function getCurrentStackInDEV() {
      var owner = currentOwnerInDEV;
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
    function resolveConsoleEntry(response, json) {
      if (response._replayConsole) {
        var blockedChunk = response._blockedConsole;
        if (null == blockedChunk)
          (blockedChunk = createResolvedModelChunk(response, json)),
            initializeModelChunk$1(blockedChunk),
            "fulfilled" === blockedChunk.status
              ? replayConsoleWithCallStackInDEV(response, blockedChunk.value)
              : (blockedChunk.then(
                  function (v) {
                    return replayConsoleWithCallStackInDEV(response, v);
                  },
                  function () {}
                ),
                (response._blockedConsole = blockedChunk));
        else {
          var _chunk5 = createPendingChunk$1(response);
          _chunk5.then(
            function (v) {
              return replayConsoleWithCallStackInDEV(response, v);
            },
            function () {}
          );
          response._blockedConsole = _chunk5;
          var unblock = function () {
            response._blockedConsole === _chunk5 &&
              (response._blockedConsole = null);
            resolveModelChunk$1(response, _chunk5, json);
          };
          blockedChunk.then(unblock, unblock);
        }
      }
    }
    function initializeIOInfo(response, ioInfo) {
      void 0 !== ioInfo.stack &&
        (initializeFakeTask(response, ioInfo),
        initializeFakeStack(response, ioInfo));
      ioInfo.start += response._timeOrigin;
      ioInfo.end += response._timeOrigin;
      if (response._replayConsole) {
        response = response._rootEnvironmentName;
        var promise = ioInfo.value;
        if (promise)
          switch (promise.status) {
            case "fulfilled":
              logIOInfo(ioInfo, response, promise.value);
              break;
            case "rejected":
              logIOInfoErrored(ioInfo, response, promise.reason);
              break;
            default:
              promise.then(
                logIOInfo.bind(null, ioInfo, response),
                logIOInfoErrored.bind(null, ioInfo, response)
              );
          }
        else logIOInfo(ioInfo, response, void 0);
      }
    }
    function resolveIOInfo(response, id, model) {
      var chunks = response._chunks,
        chunk = chunks.get(id),
        prevIsInitializingDebugInfo = isInitializingDebugInfo;
      isInitializingDebugInfo = !0;
      try {
        chunk
          ? (resolveModelChunk$1(response, chunk, model),
            "resolved_model" === chunk.status && initializeModelChunk$1(chunk))
          : ((chunk = createResolvedModelChunk(response, model)),
            chunks.set(id, chunk),
            initializeModelChunk$1(chunk));
      } finally {
        isInitializingDebugInfo = prevIsInitializingDebugInfo;
      }
      "fulfilled" === chunk.status
        ? initializeIOInfo(response, chunk.value)
        : chunk.then(
            function (v) {
              initializeIOInfo(response, v);
            },
            function () {}
          );
    }
    function mergeBuffer(buffer, lastChunk) {
      for (
        var l = buffer.length, byteLength = lastChunk.length, i = 0;
        i < l;
        i++
      )
        byteLength += buffer[i].byteLength;
      byteLength = new Uint8Array(byteLength);
      for (var _i4 = (i = 0); _i4 < l; _i4++) {
        var chunk = buffer[_i4];
        byteLength.set(chunk, i);
        i += chunk.byteLength;
      }
      byteLength.set(lastChunk, i);
      return byteLength;
    }
    function resolveTypedArray(
      response,
      id,
      buffer,
      lastChunk,
      constructor,
      bytesPerElement,
      streamState
    ) {
      buffer =
        0 === buffer.length && 0 === lastChunk.byteOffset % bytesPerElement
          ? lastChunk
          : mergeBuffer(buffer, lastChunk);
      constructor = new constructor(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / bytesPerElement
      );
      resolveBuffer(response, id, constructor, streamState);
    }
    function flushComponentPerformance(
      response$jscomp$0,
      root,
      trackIdx$jscomp$6,
      trackTime,
      parentEndTime
    ) {
      if (!isArrayImpl(root._children)) {
        var previousResult = root._children,
          previousEndTime = previousResult.endTime;
        if (
          -Infinity < parentEndTime &&
          parentEndTime < previousEndTime &&
          null !== previousResult.component
        ) {
          var componentInfo = previousResult.component,
            trackIdx = trackIdx$jscomp$6,
            startTime = parentEndTime;
          if (supportsUserTiming && 0 <= previousEndTime && 10 > trackIdx) {
            var color =
                componentInfo.env === response$jscomp$0._rootEnvironmentName
                  ? "primary-light"
                  : "secondary-light",
              entryName = componentInfo.name + " [deduped]",
              debugTask = componentInfo.debugTask;
            debugTask
              ? debugTask.run(
                  console.timeStamp.bind(
                    console,
                    entryName,
                    0 > startTime ? 0 : startTime,
                    previousEndTime,
                    trackNames[trackIdx],
                    "Server Components \u269b",
                    color
                  )
                )
              : console.timeStamp(
                  entryName,
                  0 > startTime ? 0 : startTime,
                  previousEndTime,
                  trackNames[trackIdx],
                  "Server Components \u269b",
                  color
                );
          }
        }
        previousResult.track = trackIdx$jscomp$6;
        return previousResult;
      }
      var children = root._children;
      var debugInfo = root._debugInfo;
      if (0 === debugInfo.length && "fulfilled" === root.status) {
        var resolvedValue = resolveLazy(root.value);
        "object" === typeof resolvedValue &&
          null !== resolvedValue &&
          (isArrayImpl(resolvedValue) ||
            "function" === typeof resolvedValue[ASYNC_ITERATOR] ||
            resolvedValue.$$typeof === REACT_ELEMENT_TYPE ||
            resolvedValue.$$typeof === REACT_LAZY_TYPE) &&
          isArrayImpl(resolvedValue._debugInfo) &&
          (debugInfo = resolvedValue._debugInfo);
      }
      if (debugInfo) {
        for (var startTime$jscomp$0 = 0, i = 0; i < debugInfo.length; i++) {
          var info = debugInfo[i];
          "number" === typeof info.time && (startTime$jscomp$0 = info.time);
          if ("string" === typeof info.name) {
            startTime$jscomp$0 < trackTime && trackIdx$jscomp$6++;
            trackTime = startTime$jscomp$0;
            break;
          }
        }
        for (var _i5 = debugInfo.length - 1; 0 <= _i5; _i5--) {
          var _info = debugInfo[_i5];
          if ("number" === typeof _info.time && _info.time > parentEndTime) {
            parentEndTime = _info.time;
            break;
          }
        }
      }
      var result = {
        track: trackIdx$jscomp$6,
        endTime: -Infinity,
        component: null
      };
      root._children = result;
      for (
        var childrenEndTime = -Infinity,
          childTrackIdx = trackIdx$jscomp$6,
          childTrackTime = trackTime,
          _i6 = 0;
        _i6 < children.length;
        _i6++
      ) {
        var childResult = flushComponentPerformance(
          response$jscomp$0,
          children[_i6],
          childTrackIdx,
          childTrackTime,
          parentEndTime
        );
        null !== childResult.component &&
          (result.component = childResult.component);
        childTrackIdx = childResult.track;
        var childEndTime = childResult.endTime;
        childEndTime > childTrackTime && (childTrackTime = childEndTime);
        childEndTime > childrenEndTime && (childrenEndTime = childEndTime);
      }
      if (debugInfo)
        for (
          var componentEndTime = 0,
            isLastComponent = !0,
            endTime = -1,
            endTimeIdx = -1,
            _i7 = debugInfo.length - 1;
          0 <= _i7;
          _i7--
        ) {
          var _info2 = debugInfo[_i7];
          if ("number" === typeof _info2.time) {
            0 === componentEndTime && (componentEndTime = _info2.time);
            var time = _info2.time;
            if (-1 < endTimeIdx)
              for (var j = endTimeIdx - 1; j > _i7; j--) {
                var candidateInfo = debugInfo[j];
                if ("string" === typeof candidateInfo.name) {
                  componentEndTime > childrenEndTime &&
                    (childrenEndTime = componentEndTime);
                  var componentInfo$jscomp$0 = candidateInfo,
                    response = response$jscomp$0,
                    componentInfo$jscomp$1 = componentInfo$jscomp$0,
                    trackIdx$jscomp$0 = trackIdx$jscomp$6,
                    startTime$jscomp$1 = time,
                    componentEndTime$jscomp$0 = componentEndTime,
                    childrenEndTime$jscomp$0 = childrenEndTime;
                  if (
                    isLastComponent &&
                    "rejected" === root.status &&
                    root.reason !== response._closedReason
                  ) {
                    var componentInfo$jscomp$2 = componentInfo$jscomp$1,
                      trackIdx$jscomp$1 = trackIdx$jscomp$0,
                      startTime$jscomp$2 = startTime$jscomp$1,
                      childrenEndTime$jscomp$1 = childrenEndTime$jscomp$0,
                      error = root.reason;
                    if (supportsUserTiming) {
                      var env = componentInfo$jscomp$2.env,
                        name = componentInfo$jscomp$2.name,
                        entryName$jscomp$0 =
                          env === response._rootEnvironmentName ||
                          void 0 === env
                            ? name
                            : name + " [" + env + "]",
                        measureName = "\u200b" + entryName$jscomp$0,
                        properties = [
                          [
                            "Error",
                            "object" === typeof error &&
                            null !== error &&
                            "string" === typeof error.message
                              ? String(error.message)
                              : String(error)
                          ]
                        ];
                      null != componentInfo$jscomp$2.key &&
                        addValueToProperties(
                          "key",
                          componentInfo$jscomp$2.key,
                          properties,
                          0,
                          ""
                        );
                      null != componentInfo$jscomp$2.props &&
                        addObjectToProperties(
                          componentInfo$jscomp$2.props,
                          properties,
                          0,
                          ""
                        );
                      performance.measure(measureName, {
                        start: 0 > startTime$jscomp$2 ? 0 : startTime$jscomp$2,
                        end: childrenEndTime$jscomp$1,
                        detail: {
                          devtools: {
                            color: "error",
                            track: trackNames[trackIdx$jscomp$1],
                            trackGroup: "Server Components \u269b",
                            tooltipText: entryName$jscomp$0 + " Errored",
                            properties: properties
                          }
                        }
                      });
                      performance.clearMeasures(measureName);
                    }
                  } else {
                    var componentInfo$jscomp$3 = componentInfo$jscomp$1,
                      trackIdx$jscomp$2 = trackIdx$jscomp$0,
                      startTime$jscomp$3 = startTime$jscomp$1,
                      childrenEndTime$jscomp$2 = childrenEndTime$jscomp$0;
                    if (
                      supportsUserTiming &&
                      0 <= childrenEndTime$jscomp$2 &&
                      10 > trackIdx$jscomp$2
                    ) {
                      var env$jscomp$0 = componentInfo$jscomp$3.env,
                        name$jscomp$0 = componentInfo$jscomp$3.name,
                        isPrimaryEnv =
                          env$jscomp$0 === response._rootEnvironmentName,
                        selfTime =
                          componentEndTime$jscomp$0 - startTime$jscomp$3,
                        color$jscomp$0 =
                          0.5 > selfTime
                            ? isPrimaryEnv
                              ? "primary-light"
                              : "secondary-light"
                            : 50 > selfTime
                              ? isPrimaryEnv
                                ? "primary"
                                : "secondary"
                              : 500 > selfTime
                                ? isPrimaryEnv
                                  ? "primary-dark"
                                  : "secondary-dark"
                                : "error",
                        debugTask$jscomp$0 = componentInfo$jscomp$3.debugTask,
                        measureName$jscomp$0 =
                          "\u200b" +
                          (isPrimaryEnv || void 0 === env$jscomp$0
                            ? name$jscomp$0
                            : name$jscomp$0 + " [" + env$jscomp$0 + "]");
                      if (debugTask$jscomp$0) {
                        var properties$jscomp$0 = [];
                        null != componentInfo$jscomp$3.key &&
                          addValueToProperties(
                            "key",
                            componentInfo$jscomp$3.key,
                            properties$jscomp$0,
                            0,
                            ""
                          );
                        null != componentInfo$jscomp$3.props &&
                          addObjectToProperties(
                            componentInfo$jscomp$3.props,
                            properties$jscomp$0,
                            0,
                            ""
                          );
                        debugTask$jscomp$0.run(
                          performance.measure.bind(
                            performance,
                            measureName$jscomp$0,
                            {
                              start:
                                0 > startTime$jscomp$3 ? 0 : startTime$jscomp$3,
                              end: childrenEndTime$jscomp$2,
                              detail: {
                                devtools: {
                                  color: color$jscomp$0,
                                  track: trackNames[trackIdx$jscomp$2],
                                  trackGroup: "Server Components \u269b",
                                  properties: properties$jscomp$0
                                }
                              }
                            }
                          )
                        );
                        performance.clearMeasures(measureName$jscomp$0);
                      } else
                        console.timeStamp(
                          measureName$jscomp$0,
                          0 > startTime$jscomp$3 ? 0 : startTime$jscomp$3,
                          childrenEndTime$jscomp$2,
                          trackNames[trackIdx$jscomp$2],
                          "Server Components \u269b",
                          color$jscomp$0
                        );
                    }
                  }
                  componentEndTime = time;
                  result.component = componentInfo$jscomp$0;
                  isLastComponent = !1;
                } else if (
                  candidateInfo.awaited &&
                  null != candidateInfo.awaited.env
                ) {
                  endTime > childrenEndTime && (childrenEndTime = endTime);
                  var asyncInfo = candidateInfo,
                    env$jscomp$1 = response$jscomp$0._rootEnvironmentName,
                    promise = asyncInfo.awaited.value;
                  if (promise) {
                    var thenable = promise;
                    switch (thenable.status) {
                      case "fulfilled":
                        logComponentAwait(
                          asyncInfo,
                          trackIdx$jscomp$6,
                          time,
                          endTime,
                          env$jscomp$1,
                          thenable.value
                        );
                        break;
                      case "rejected":
                        var asyncInfo$jscomp$0 = asyncInfo,
                          trackIdx$jscomp$3 = trackIdx$jscomp$6,
                          startTime$jscomp$4 = time,
                          endTime$jscomp$0 = endTime,
                          rootEnv = env$jscomp$1,
                          error$jscomp$0 = thenable.reason;
                        if (supportsUserTiming && 0 < endTime$jscomp$0) {
                          var description = getIODescription(error$jscomp$0),
                            entryName$jscomp$1 =
                              "await " +
                              getIOShortName(
                                asyncInfo$jscomp$0.awaited,
                                description,
                                asyncInfo$jscomp$0.env,
                                rootEnv
                              ),
                            debugTask$jscomp$1 =
                              asyncInfo$jscomp$0.debugTask ||
                              asyncInfo$jscomp$0.awaited.debugTask;
                          if (debugTask$jscomp$1) {
                            var properties$jscomp$1 = [
                                [
                                  "Rejected",
                                  "object" === typeof error$jscomp$0 &&
                                  null !== error$jscomp$0 &&
                                  "string" === typeof error$jscomp$0.message
                                    ? String(error$jscomp$0.message)
                                    : String(error$jscomp$0)
                                ]
                              ],
                              tooltipText =
                                getIOLongName(
                                  asyncInfo$jscomp$0.awaited,
                                  description,
                                  asyncInfo$jscomp$0.env,
                                  rootEnv
                                ) + " Rejected";
                            debugTask$jscomp$1.run(
                              performance.measure.bind(
                                performance,
                                entryName$jscomp$1,
                                {
                                  start:
                                    0 > startTime$jscomp$4
                                      ? 0
                                      : startTime$jscomp$4,
                                  end: endTime$jscomp$0,
                                  detail: {
                                    devtools: {
                                      color: "error",
                                      track: trackNames[trackIdx$jscomp$3],
                                      trackGroup: "Server Components \u269b",
                                      properties: properties$jscomp$1,
                                      tooltipText: tooltipText
                                    }
                                  }
                                }
                              )
                            );
                            performance.clearMeasures(entryName$jscomp$1);
                          } else
                            console.timeStamp(
                              entryName$jscomp$1,
                              0 > startTime$jscomp$4 ? 0 : startTime$jscomp$4,
                              endTime$jscomp$0,
                              trackNames[trackIdx$jscomp$3],
                              "Server Components \u269b",
                              "error"
                            );
                        }
                        break;
                      default:
                        logComponentAwait(
                          asyncInfo,
                          trackIdx$jscomp$6,
                          time,
                          endTime,
                          env$jscomp$1,
                          void 0
                        );
                    }
                  } else
                    logComponentAwait(
                      asyncInfo,
                      trackIdx$jscomp$6,
                      time,
                      endTime,
                      env$jscomp$1,
                      void 0
                    );
                }
              }
            else {
              endTime = time;
              for (var _j = debugInfo.length - 1; _j > _i7; _j--) {
                var _candidateInfo = debugInfo[_j];
                if ("string" === typeof _candidateInfo.name) {
                  componentEndTime > childrenEndTime &&
                    (childrenEndTime = componentEndTime);
                  var _componentInfo = _candidateInfo,
                    _env = response$jscomp$0._rootEnvironmentName,
                    componentInfo$jscomp$4 = _componentInfo,
                    trackIdx$jscomp$4 = trackIdx$jscomp$6,
                    startTime$jscomp$5 = time,
                    childrenEndTime$jscomp$3 = childrenEndTime;
                  if (supportsUserTiming) {
                    var env$jscomp$2 = componentInfo$jscomp$4.env,
                      name$jscomp$1 = componentInfo$jscomp$4.name,
                      entryName$jscomp$2 =
                        env$jscomp$2 === _env || void 0 === env$jscomp$2
                          ? name$jscomp$1
                          : name$jscomp$1 + " [" + env$jscomp$2 + "]",
                      measureName$jscomp$1 = "\u200b" + entryName$jscomp$2,
                      properties$jscomp$2 = [
                        [
                          "Aborted",
                          "The stream was aborted before this Component finished rendering."
                        ]
                      ];
                    null != componentInfo$jscomp$4.key &&
                      addValueToProperties(
                        "key",
                        componentInfo$jscomp$4.key,
                        properties$jscomp$2,
                        0,
                        ""
                      );
                    null != componentInfo$jscomp$4.props &&
                      addObjectToProperties(
                        componentInfo$jscomp$4.props,
                        properties$jscomp$2,
                        0,
                        ""
                      );
                    performance.measure(measureName$jscomp$1, {
                      start: 0 > startTime$jscomp$5 ? 0 : startTime$jscomp$5,
                      end: childrenEndTime$jscomp$3,
                      detail: {
                        devtools: {
                          color: "warning",
                          track: trackNames[trackIdx$jscomp$4],
                          trackGroup: "Server Components \u269b",
                          tooltipText: entryName$jscomp$2 + " Aborted",
                          properties: properties$jscomp$2
                        }
                      }
                    });
                    performance.clearMeasures(measureName$jscomp$1);
                  }
                  componentEndTime = time;
                  result.component = _componentInfo;
                  isLastComponent = !1;
                } else if (
                  _candidateInfo.awaited &&
                  null != _candidateInfo.awaited.env
                ) {
                  var _asyncInfo = _candidateInfo,
                    _env2 = response$jscomp$0._rootEnvironmentName;
                  _asyncInfo.awaited.end > endTime &&
                    (endTime = _asyncInfo.awaited.end);
                  endTime > childrenEndTime && (childrenEndTime = endTime);
                  var asyncInfo$jscomp$1 = _asyncInfo,
                    trackIdx$jscomp$5 = trackIdx$jscomp$6,
                    startTime$jscomp$6 = time,
                    endTime$jscomp$1 = endTime,
                    rootEnv$jscomp$0 = _env2;
                  if (supportsUserTiming && 0 < endTime$jscomp$1) {
                    var entryName$jscomp$3 =
                        "await " +
                        getIOShortName(
                          asyncInfo$jscomp$1.awaited,
                          "",
                          asyncInfo$jscomp$1.env,
                          rootEnv$jscomp$0
                        ),
                      debugTask$jscomp$2 =
                        asyncInfo$jscomp$1.debugTask ||
                        asyncInfo$jscomp$1.awaited.debugTask;
                    if (debugTask$jscomp$2) {
                      var tooltipText$jscomp$0 =
                        getIOLongName(
                          asyncInfo$jscomp$1.awaited,
                          "",
                          asyncInfo$jscomp$1.env,
                          rootEnv$jscomp$0
                        ) + " Aborted";
                      debugTask$jscomp$2.run(
                        performance.measure.bind(
                          performance,
                          entryName$jscomp$3,
                          {
                            start:
                              0 > startTime$jscomp$6 ? 0 : startTime$jscomp$6,
                            end: endTime$jscomp$1,
                            detail: {
                              devtools: {
                                color: "warning",
                                track: trackNames[trackIdx$jscomp$5],
                                trackGroup: "Server Components \u269b",
                                properties: [
                                  [
                                    "Aborted",
                                    "The stream was aborted before this Promise resolved."
                                  ]
                                ],
                                tooltipText: tooltipText$jscomp$0
                              }
                            }
                          }
                        )
                      );
                      performance.clearMeasures(entryName$jscomp$3);
                    } else
                      console.timeStamp(
                        entryName$jscomp$3,
                        0 > startTime$jscomp$6 ? 0 : startTime$jscomp$6,
                        endTime$jscomp$1,
                        trackNames[trackIdx$jscomp$5],
                        "Server Components \u269b",
                        "warning"
                      );
                  }
                }
              }
            }
            endTime = time;
            endTimeIdx = _i7;
          }
        }
      result.endTime = childrenEndTime;
      return result;
    }
    function flushInitialRenderPerformance(response) {
      if (response._replayConsole) {
        var rootChunk = getChunk(response, 0);
        isArrayImpl(rootChunk._children) &&
          (markAllTracksInOrder(),
          flushComponentPerformance(
            response,
            rootChunk,
            0,
            -Infinity,
            -Infinity
          ));
      }
    }
    function processFullBinaryRow(
      response,
      streamState,
      id,
      tag,
      buffer,
      chunk
    ) {
      switch (tag) {
        case 65:
          resolveBuffer(
            response,
            id,
            mergeBuffer(buffer, chunk).buffer,
            streamState
          );
          return;
        case 79:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Int8Array,
            1,
            streamState
          );
          return;
        case 111:
          resolveBuffer(
            response,
            id,
            0 === buffer.length ? chunk : mergeBuffer(buffer, chunk),
            streamState
          );
          return;
        case 85:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Uint8ClampedArray,
            1,
            streamState
          );
          return;
        case 83:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Int16Array,
            2,
            streamState
          );
          return;
        case 115:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Uint16Array,
            2,
            streamState
          );
          return;
        case 76:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Int32Array,
            4,
            streamState
          );
          return;
        case 108:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Uint32Array,
            4,
            streamState
          );
          return;
        case 71:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Float32Array,
            4,
            streamState
          );
          return;
        case 103:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            Float64Array,
            8,
            streamState
          );
          return;
        case 77:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            BigInt64Array,
            8,
            streamState
          );
          return;
        case 109:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            BigUint64Array,
            8,
            streamState
          );
          return;
        case 86:
          resolveTypedArray(
            response,
            id,
            buffer,
            chunk,
            DataView,
            1,
            streamState
          );
          return;
      }
      for (
        var stringDecoder = response._stringDecoder, row = "", i = 0;
        i < buffer.length;
        i++
      )
        row += stringDecoder.decode(buffer[i], decoderOptions);
      row += stringDecoder.decode(chunk);
      processFullStringRow(response, streamState, id, tag, row);
    }
    function processFullStringRow(response, streamState, id, tag, row) {
      switch (tag) {
        case 73:
          resolveModule$1(response, id, row, streamState);
          break;
        case 72:
          id = row[0];
          streamState = row.slice(1);
          response = parseModel(response, streamState);
          dispatchHint(id, response);
          break;
        case 69:
          tag = response._chunks;
          var chunk = tag.get(id);
          row = JSON.parse(row);
          var error = resolveErrorDev(response, row);
          error.digest = row.digest;
          chunk
            ? (resolveChunkDebugInfo(response, streamState, chunk),
              triggerErrorOnChunk$1(response, chunk, error))
            : ((row = new ReactPromise$2("rejected", null, error)),
              resolveChunkDebugInfo(response, streamState, row),
              tag.set(id, row));
          break;
        case 84:
          tag = response._chunks;
          (chunk = tag.get(id)) && "pending" !== chunk.status
            ? chunk.reason.enqueueValue(row)
            : (chunk && releasePendingChunk(response, chunk),
              (row = new ReactPromise$2("fulfilled", row, null)),
              resolveChunkDebugInfo(response, streamState, row),
              tag.set(id, row));
          break;
        case 78:
          response._timeOrigin = +row - performance.timeOrigin;
          break;
        case 68:
          id = getChunk(response, id);
          "fulfilled" !== id.status &&
            "rejected" !== id.status &&
            "halted" !== id.status &&
            "blocked" !== id.status &&
            "resolved_module" !== id.status &&
            ((streamState = id._debugChunk),
            (tag = createResolvedModelChunk(response, row)),
            (tag._debugChunk = streamState),
            (id._debugChunk = tag),
            initializeDebugChunk(response, id),
            "blocked" !== tag.status ||
              (void 0 !== response._debugChannel &&
                response._debugChannel.hasReadable) ||
              '"' !== row[0] ||
              "$" !== row[1] ||
              ((streamState = row.slice(2, row.length - 1).split(":")),
              (streamState = parseInt(streamState[0], 16)),
              "pending" === getChunk(response, streamState).status &&
                (id._debugChunk = null)));
          break;
        case 74:
          resolveIOInfo(response, id, row);
          break;
        case 87:
          resolveConsoleEntry(response, row);
          break;
        case 82:
          startReadableStream(response, id, void 0, streamState);
          break;
        case 114:
          startReadableStream(response, id, "bytes", streamState);
          break;
        case 88:
          startAsyncIterable(response, id, !1, streamState);
          break;
        case 120:
          startAsyncIterable(response, id, !0, streamState);
          break;
        case 67:
          (id = response._chunks.get(id)) &&
            "fulfilled" === id.status &&
            (0 === --response._pendingChunks &&
              (response._weakResponse.response = null),
            id.reason.close("" === row ? '"$undefined"' : row));
          break;
        default:
          "" === row
            ? ((streamState = response._chunks),
              (row = streamState.get(id)) ||
                streamState.set(id, (row = createPendingChunk$1(response))),
              ("pending" !== row.status &&
                "pending_weak" !== row.status &&
                "blocked" !== row.status) ||
                haltChunk$1(response, row))
            : ((tag = response._chunks),
              (chunk = tag.get(id))
                ? (resolveChunkDebugInfo(response, streamState, chunk),
                  resolveModelChunk$1(response, chunk, row))
                : ((row = createResolvedModelChunk(response, row)),
                  resolveChunkDebugInfo(response, streamState, row),
                  tag.set(id, row)));
      }
    }
    function processBinaryChunk(weakResponse, streamState, chunk) {
      if (!hasGCedResponse(weakResponse)) {
        weakResponse = unwrapWeakResponse(weakResponse);
        var i = 0,
          rowState = streamState._rowState,
          rowID = streamState._rowID,
          rowTag = streamState._rowTag,
          rowLength = streamState._rowLength,
          buffer = streamState._buffer,
          chunkLength = chunk.length;
        for (
          incrementChunkDebugInfo(streamState, chunkLength);
          i < chunkLength;

        ) {
          var lastIdx = -1;
          switch (rowState) {
            case 0:
              lastIdx = chunk[i++];
              58 === lastIdx
                ? (rowState = 1)
                : (rowID =
                    (rowID << 4) |
                    (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
              continue;
            case 1:
              rowState = chunk[i];
              84 === rowState ||
              65 === rowState ||
              79 === rowState ||
              111 === rowState ||
              98 === rowState ||
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
                    35 === rowState ||
                    114 === rowState ||
                    120 === rowState
                  ? ((rowTag = rowState), (rowState = 3), i++)
                  : ((rowTag = 0), (rowState = 3));
              continue;
            case 2:
              lastIdx = chunk[i++];
              44 === lastIdx
                ? (rowState = 4)
                : (rowLength =
                    (rowLength << 4) |
                    (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
              continue;
            case 3:
              lastIdx = chunk.indexOf(10, i);
              break;
            case 4:
              (lastIdx = i + rowLength),
                lastIdx > chunk.length && (lastIdx = -1);
          }
          var offset = chunk.byteOffset + i;
          if (-1 < lastIdx)
            (rowLength = new Uint8Array(chunk.buffer, offset, lastIdx - i)),
              98 === rowTag
                ? resolveBuffer(
                    weakResponse,
                    rowID,
                    lastIdx === chunkLength ? rowLength : rowLength.slice(),
                    streamState
                  )
                : processFullBinaryRow(
                    weakResponse,
                    streamState,
                    rowID,
                    rowTag,
                    buffer,
                    rowLength
                  ),
              (i = lastIdx),
              3 === rowState && i++,
              (rowLength = rowID = rowTag = rowState = 0),
              (buffer.length = 0);
          else {
            chunk = new Uint8Array(chunk.buffer, offset, chunk.byteLength - i);
            98 === rowTag
              ? ((rowLength -= chunk.byteLength),
                resolveBuffer(weakResponse, rowID, chunk, streamState))
              : (buffer.push(chunk), (rowLength -= chunk.byteLength));
            break;
          }
        }
        streamState._rowState = rowState;
        streamState._rowID = rowID;
        streamState._rowTag = rowTag;
        streamState._rowLength = rowLength;
      }
    }
    function parseModel(response, json) {
      json = JSON.parse(json);
      return reviveModel(response, json, { "": json }, "");
    }
    function reviveModel(response, value, parentObject, key) {
      if ("string" === typeof value)
        return "$" === value[0]
          ? parseModelString(response, parentObject, key, value)
          : value;
      if ("object" !== typeof value || null === value) return value;
      if (isArrayImpl(value)) {
        for (var i = 0; i < value.length; i++)
          value[i] = reviveModel(response, value[i], value, "" + i);
        if (value[0] === REACT_ELEMENT_TYPE) {
          if (value[0] === REACT_ELEMENT_TYPE)
            b: {
              key = value[4];
              parentObject = value[5];
              i = value[6];
              value = {
                $$typeof: REACT_ELEMENT_TYPE,
                type: value[1],
                key: value[2],
                props: value[3],
                _owner: void 0 === key ? null : key
              };
              Object.defineProperty(value, "ref", {
                enumerable: !1,
                get: nullRefGetter
              });
              value._store = {};
              Object.defineProperty(value._store, "validated", {
                configurable: !1,
                enumerable: !1,
                writable: !0,
                value: i
              });
              Object.defineProperty(value, "_debugInfo", {
                configurable: !1,
                enumerable: !1,
                writable: !0,
                value: null
              });
              Object.defineProperty(value, "_debugStack", {
                configurable: !1,
                enumerable: !1,
                writable: !0,
                value: void 0 === parentObject ? null : parentObject
              });
              Object.defineProperty(value, "_debugTask", {
                configurable: !1,
                enumerable: !1,
                writable: !0,
                value: null
              });
              if (null !== initializingHandler) {
                key = initializingHandler;
                initializingHandler = key.parent;
                if (key.errored) {
                  parentObject = new ReactPromise$2(
                    "rejected",
                    null,
                    key.reason
                  );
                  initializeElement(response, value, null);
                  response = {
                    name: getComponentNameFromType(value.type) || "",
                    owner: value._owner
                  };
                  response.debugStack = value._debugStack;
                  supportsCreateTask$1 &&
                    (response.debugTask = value._debugTask);
                  parentObject._debugInfo = [response];
                  response = createLazyChunkWrapper$1(parentObject, i);
                  break b;
                }
                if (0 < key.deps) {
                  parentObject = new ReactPromise$2("blocked", null, null);
                  key.value = value;
                  key.chunk = parentObject;
                  i = createLazyChunkWrapper$1(parentObject, i);
                  response = initializeElement.bind(null, response, value, i);
                  parentObject.then(response, response);
                  response = i;
                  break b;
                }
              }
              initializeElement(response, value, null);
              response = value;
            }
          else response = value;
          return response;
        }
        return value;
      }
      for (i in value)
        hasOwnProperty.call(value, i) &&
          ("__proto__" === i
            ? delete value[i]
            : ((parentObject = reviveModel(response, value[i], value, i)),
              void 0 !== parentObject
                ? (value[i] = parentObject)
                : delete value[i]));
      return value;
    }
    function close(weakResponse) {
      if (!hasGCedResponse(weakResponse)) {
        var response = unwrapWeakResponse(weakResponse);
        response._allowPartialStream
          ? ((response._closed = !0),
            response._chunks.forEach(function (chunk) {
              "pending" === chunk.status || "pending_weak" === chunk.status
                ? haltChunk$1(response, chunk)
                : "fulfilled" === chunk.status &&
                  null !== chunk.reason &&
                  chunk.reason.close('"$undefined"');
            }),
            (weakResponse = response._debugChannel),
            void 0 !== weakResponse &&
              (closeDebugChannel(weakResponse),
              (response._debugChannel = void 0),
              null !== debugChannelRegistry &&
                debugChannelRegistry.unregister(response)))
          : reportGlobalError$1(weakResponse, Error("Connection closed."));
      }
    }
    function noServerCall$2() {
      throw Error(
        "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
      );
    }
    function createResponseFromOptions(options) {
      return createResponse$1(
        options.serverConsumerManifest.moduleMap,
        options.serverConsumerManifest.serverModuleMap,
        options.serverConsumerManifest.moduleLoading,
        noServerCall$2,
        options.encodeFormAction,
        "string" === typeof options.nonce ? options.nonce : void 0,
        options && options.temporaryReferences
          ? options.temporaryReferences
          : void 0,
        options && options.unstable_allowPartialStream
          ? options.unstable_allowPartialStream
          : !1,
        options && options.findSourceMapURL ? options.findSourceMapURL : void 0,
        options ? !0 === options.replayConsoleLogs : !1,
        options && options.environmentName ? options.environmentName : void 0,
        options && null != options.startTime ? options.startTime : void 0,
        options && null != options.endTime ? options.endTime : void 0,
        options && void 0 !== options.debugChannel
          ? {
              hasReadable: void 0 !== options.debugChannel.readable,
              callback: null
            }
          : void 0
      );
    }
    function startReadingFromStream$1(response, stream, onDone, debugValue) {
      function progress(_ref) {
        var value = _ref.value;
        if (_ref.done) return onDone();
        processBinaryChunk(response, streamState, value);
        return reader.read().then(progress).catch(error);
      }
      function error(e) {
        reportGlobalError$1(response, e);
      }
      var streamState = createStreamState(response, debugValue),
        reader = stream.getReader();
      reader.read().then(progress).catch(error);
    }
    function noServerCall$1() {
      throw Error(
        "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
      );
    }
    function startReadingFromStream(response$jscomp$0, stream, onEnd) {
      var streamState = createStreamState(response$jscomp$0, stream);
      stream.on("data", function (chunk) {
        if ("string" === typeof chunk) {
          if (!hasGCedResponse(response$jscomp$0)) {
            var response = unwrapWeakResponse(response$jscomp$0),
              i = 0,
              rowState = streamState._rowState,
              rowID = streamState._rowID,
              rowTag = streamState._rowTag,
              rowLength = streamState._rowLength,
              buffer = streamState._buffer,
              chunkLength = chunk.length;
            for (
              incrementChunkDebugInfo(streamState, chunkLength);
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
                processFullStringRow(response, streamState, rowID, rowTag, i);
                i = lastIdx;
                3 === rowState && i++;
                rowLength = rowID = rowTag = rowState = 0;
                buffer.length = 0;
              } else if (chunk.length !== i)
                throw Error(
                  "String chunks need to be passed in their original shape. Not split into smaller string chunks. This is a bug in the wiring of the React streams."
                );
            }
            streamState._rowState = rowState;
            streamState._rowID = rowID;
            streamState._rowTag = rowTag;
            streamState._rowLength = rowLength;
          }
        } else processBinaryChunk(response$jscomp$0, streamState, chunk);
      });
      stream.on("error", function (error) {
        reportGlobalError$1(response$jscomp$0, error);
      });
      stream.on("end", onEnd);
    }
    function closeReadableStream(controller, isByteStream) {
      try {
        if ((controller.close(), isByteStream)) {
          var byobRequest = controller.byobRequest;
          null !== byobRequest && byobRequest.respond(0);
        }
      } catch (error) {
        controller.error(error);
      }
    }
    function noop() {}
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
    function waitForHints(queue) {
      var wakeup = queue.wakeup;
      null === wakeup &&
        (queue.wakeup = wakeup =
          new Promise(function (resolve) {
            queue.resolve = resolve;
          }));
      return wakeup;
    }
    function getValueReference(result, value) {
      result = result.valueReferences;
      return null !== result && result.has(value) ? value : void 0;
    }
    function getModelInfo(result, model) {
      result = result.modelInfo;
      return null === result ? 0 : result.get(model) || 0;
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
    function getCollectionEntries(result, collection) {
      result = result.collectionEntries;
      return null === result ? void 0 : result.get(collection);
    }
    function hasFormDataBlobs(result, formData) {
      result = result.formDataWithBlobs;
      return null !== result && result.has(formData);
    }
    function getIteratorEntries(result, iterator) {
      result = result.iteratorEntries;
      return null === result ? void 0 : result.get(iterator);
    }
    function getReadableStream(result, stream) {
      result = result.readableStreams;
      return null === result ? void 0 : result.get(stream);
    }
    function getAsyncIterable(result, iterable) {
      result = result.asyncIterables;
      return null === result ? void 0 : result.get(iterable);
    }
    function getErrorInfo(result, error) {
      result = result.errorInfos;
      return null === result ? void 0 : result.get(error);
    }
    function ReactPromise$1(weak) {
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
    function getResultModelStatus(value) {
      return value.$$typeof === RESULT_MODEL_TYPE ? value.status : null;
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
    function createResponse(
      result,
      bundlerConfig,
      serverReferenceConfig,
      moduleLoading,
      resolveClientReferenceMetadata,
      callServer,
      encodeFormAction,
      nonce,
      temporaryReferences,
      onError
    ) {
      var findSourceMapURL = 11 < arguments.length ? arguments[11] : void 0,
        environmentName = 12 < arguments.length ? arguments[12] : void 0,
        response = {
          _result: result,
          _bundlerConfig: bundlerConfig,
          _serverReferenceConfig: serverReferenceConfig,
          _callServer: callServer,
          _encodeFormAction: encodeFormAction,
          _tempRefs: temporaryReferences,
          _moduleLoading: moduleLoading,
          _nonce: nonce,
          _resolveClientReferenceMetadata: resolveClientReferenceMetadata,
          _onError: onError || defaultErrorHandler,
          _allowPartialStream:
            10 < arguments.length && void 0 !== arguments[10]
              ? arguments[10]
              : !1,
          _modules: new Map(),
          _closed: !1,
          _closedReason: null,
          _disposed: !1,
          _subscriptions: null,
          _weakSubscriptions: null,
          _streamErrors: null,
          _cleanups: null,
          _models: new Map(),
          _preloads: new Map(),
          _chunks: new Set(),
          _completedElements: []
        };
      response._debugFindSourceMapURL = findSourceMapURL;
      findSourceMapURL =
        void 0 === environmentName ? "Server" : environmentName;
      supportsCreateTask &&
        (response._debugRootTask = console.createTask(
          '"use ' + findSourceMapURL.toLowerCase() + '"'
        ));
      response._rootEnvironmentName = findSourceMapURL;
      return response;
    }
    function ReactPromise(status, value, reason) {
      this.status = status;
      this.value = value;
      this.reason = reason;
      this._debugInfo = [];
    }
    function createPendingChunk() {
      var response =
          0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : null,
        weak =
          1 < arguments.length && void 0 !== arguments[1] ? arguments[1] : !1,
        chunk = new ReactPromise(weak ? "pending_weak" : "pending", null, null);
      null !== response &&
        (response._chunks.add(chunk),
        response._closed &&
          !weak &&
          triggerErrorOnChunk(chunk, getClosedReason(response)));
      return chunk;
    }
    function haltChunk(chunk) {
      chunk.status = "halted";
      chunk.value = null;
      chunk.reason = null;
    }
    function createBlockedChunk(response) {
      var chunk = new ReactPromise("blocked", null, null);
      response._chunks.add(chunk);
      return chunk;
    }
    function wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners) {
      switch (chunk.status) {
        case "fulfilled":
          rejectListeners = chunk.value;
          for (chunk = 0; chunk < resolveListeners.length; chunk++)
            resolveListeners[chunk](rejectListeners);
          break;
        case "rejected":
          if (null !== rejectListeners)
            for (
              resolveListeners = chunk.reason, chunk = 0;
              chunk < rejectListeners.length;
              chunk++
            )
              rejectListeners[chunk](resolveListeners);
          break;
        case "pending":
        case "pending_weak":
        case "blocked":
          if (null === chunk.value) chunk.value = resolveListeners;
          else
            for (var i = 0; i < resolveListeners.length; i++)
              chunk.value.push(resolveListeners[i]);
          if (null !== rejectListeners)
            if (null === chunk.reason) chunk.reason = rejectListeners;
            else
              for (
                resolveListeners = 0;
                resolveListeners < rejectListeners.length;
                resolveListeners++
              )
                chunk.reason.push(rejectListeners[resolveListeners]);
      }
    }
    function initializeChunk(chunk, value) {
      if (
        "pending" === chunk.status ||
        "pending_weak" === chunk.status ||
        "blocked" === chunk.status
      ) {
        var resolveListeners = chunk.value;
        chunk.status = "fulfilled";
        chunk.value = value;
        chunk.reason = null;
        if (null !== resolveListeners)
          for (chunk = 0; chunk < resolveListeners.length; chunk++)
            resolveListeners[chunk](value);
      }
    }
    function triggerErrorOnChunk(chunk, error) {
      if (
        "pending" === chunk.status ||
        "pending_weak" === chunk.status ||
        "blocked" === chunk.status ||
        "resolved_model" === chunk.status ||
        "resolved_module" === chunk.status
      ) {
        var listeners =
          "pending" === chunk.status ||
          "pending_weak" === chunk.status ||
          "blocked" === chunk.status
            ? chunk.reason
            : null;
        chunk.status = "rejected";
        chunk.value = null;
        chunk.reason = error;
        if (null !== listeners)
          for (chunk = 0; chunk < listeners.length; chunk++)
            listeners[chunk](error);
      }
    }
    function getClosedReason(response) {
      var error = response._closedReason;
      null === error &&
        (response._closedReason = error = Error("Connection closed."));
      return error;
    }
    function isHaltedModel(response, model) {
      return !response._allowPartialStream && isHalted(response._result, model);
    }
    function reportGlobalError(response, error) {
      if (!response._closed) {
        response._closed = !0;
        response._closedReason = error;
        closeWeakSubscriptions(response);
        var streamErrors = response._streamErrors;
        response._streamErrors = null;
        if (null !== streamErrors)
          for (var i = 0; i < streamErrors.length; i++) streamErrors[i](error);
        response._chunks.forEach(function (chunk) {
          "pending_weak" === chunk.status
            ? haltChunk(chunk)
            : triggerErrorOnChunk(chunk, error);
        });
      }
    }
    function stopReading(response, reason) {
      if (!response._disposed) {
        response._disposed = !0;
        reason = reason instanceof Error ? reason : Error("Connection closed.");
        var subscriptions = response._subscriptions;
        null !== subscriptions &&
          (subscriptions.forEach(function (subscription) {
            return detachModelSubscription(subscription);
          }),
          (response._subscriptions = null));
        subscriptions = response._cleanups;
        null !== subscriptions &&
          (subscriptions.forEach(function (cleanup) {
            return cleanup();
          }),
          (response._cleanups = null));
        reportGlobalError(response, reason);
      }
    }
    function addResponseCleanup(response, cleanup) {
      if (response._disposed) cleanup();
      else {
        var cleanups = response._cleanups;
        null === cleanups && (response._cleanups = cleanups = new Set());
        cleanups.add(cleanup);
      }
    }
    function detachModelSubscription(subscription) {
      var response = subscription.response;
      subscription.response = null;
      subscription.resolve = null;
      subscription.reject = null;
      var owner = subscription.owner;
      subscription.owner = null;
      null !== owner && owner.delete(subscription);
      null !== response &&
        null !== response._subscriptions &&
        response._subscriptions.delete(subscription);
    }
    function subscribeToModel(response, source, resolve, reject) {
      var owner =
        4 < arguments.length && void 0 !== arguments[4] ? arguments[4] : null;
      if (!response._disposed) {
        var subscription = {
          response: response,
          owner: owner,
          resolve: resolve,
          reject: reject
        };
        null !== owner && owner.add(subscription);
        owner = response._subscriptions;
        null === owner && (response._subscriptions = owner = new Set());
        owner.add(subscription);
        source.then(
          function (model) {
            var onResolve = subscription.resolve;
            detachModelSubscription(subscription);
            null !== onResolve && onResolve(model);
          },
          function (error) {
            var onReject = subscription.reject;
            detachModelSubscription(subscription);
            null !== onReject && onReject(error);
          }
        );
      }
    }
    function readChunk(chunk) {
      "resolved_model" === chunk.status
        ? initializeResolvedModelChunk(chunk)
        : "resolved_module" === chunk.status && initializeModuleChunk(chunk);
      switch (chunk.status) {
        case "fulfilled":
          return chunk.value;
        case "pending":
        case "pending_weak":
        case "halted":
        case "blocked":
          throw chunk;
        default:
          throw chunk.reason;
      }
    }
    function createLazyChunkWrapper(chunk) {
      var lazy = {
        $$typeof: REACT_LAZY_TYPE,
        _payload: chunk,
        _init: readChunk
      };
      lazy._debugInfo = chunk._debugInfo;
      return lazy;
    }
    function initializeModuleChunk(chunk) {
      try {
        var value = requireModule(chunk.value);
        chunk.status = "fulfilled";
        chunk.value = value;
        chunk.reason = null;
      } catch (error) {
        (chunk.status = "rejected"), (chunk.reason = error);
      }
    }
    function resolveModuleChunk(chunk, clientReference) {
      if (
        "pending" === chunk.status ||
        "pending_weak" === chunk.status ||
        "blocked" === chunk.status
      ) {
        var resolveListeners = chunk.value,
          rejectListeners = chunk.reason;
        chunk.status = "resolved_module";
        chunk.value = clientReference;
        chunk.reason = null;
        null !== resolveListeners &&
          (initializeModuleChunk(chunk),
          wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners));
      }
    }
    function defaultErrorHandler(error) {
      console.error(error);
    }
    function resolveModule(response, reference) {
      var existingChunk = response._modules.get(reference);
      if (void 0 !== existingChunk) return existingChunk;
      try {
        try {
          var metadata = response._resolveClientReferenceMetadata(reference);
        } catch (error) {
          var chunk = createPendingChunk(response);
          response._modules.set(reference, chunk);
          try {
            existingChunk = chunk;
            metadata = error;
            var digest = response._onError(metadata);
            if (null != digest && "string" !== typeof digest)
              throw Error(
                'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
                  typeof digest +
                  '" instead'
              );
            if (metadata instanceof Error) {
              var resolvedError = Error(metadata.message);
              resolvedError.name = metadata.name;
              resolvedError.stack = metadata.stack;
            } else {
              var message =
                "object" === typeof metadata && null !== metadata
                  ? describeObjectForErrorMessage(metadata)
                  : String(metadata);
              resolvedError = Error(message);
            }
            resolvedError.digest = digest || "";
            triggerErrorOnChunk(existingChunk, resolvedError);
          } catch (fatalError) {
            stopReading(response, fatalError);
          }
          return chunk;
        }
        if (null === metadata) {
          var serverReferences = response._result.serverReferences;
          var serverReferenceMetadata =
            null === serverReferences
              ? void 0
              : serverReferences.get(reference);
          if (void 0 === serverReferenceMetadata) return null;
          chunk = createBlockedChunk(response);
          response._modules.set(reference, chunk);
          if (response._closed)
            return triggerErrorOnChunk(chunk, getClosedReason(response)), chunk;
          loadServerReference(response, serverReferenceMetadata, chunk);
          return chunk;
        }
        chunk = createPendingChunk(response);
        response._modules.set(reference, chunk);
        if (response._closed) return chunk;
        var clientReference = resolveClientReference(
          response._bundlerConfig,
          metadata
        );
        prepareDestinationWithChunks(
          response._moduleLoading,
          metadata[1],
          response._nonce
        );
        var promise = preloadModule(clientReference);
        promise
          ? subscribeToModel(
              response,
              promise,
              resolveModuleChunk.bind(null, chunk, clientReference),
              triggerErrorOnChunk.bind(null, chunk)
            )
          : resolveModuleChunk(chunk, clientReference);
      } catch (error$2) {
        void 0 === chunk &&
          ((chunk = createPendingChunk(response)),
          response._modules.set(reference, chunk)),
          triggerErrorOnChunk(chunk, error$2);
      }
      return chunk;
    }
    function createElementStore(validated) {
      var store = { validated: validated };
      Object.defineProperty(store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: validated
      });
      return store;
    }
    function createElement(response, element, registerModel) {
      var resolvedElement = {
        $$typeof: REACT_ELEMENT_TYPE,
        type: element.type,
        key: element.key,
        props: element.props,
        _owner: element._owner,
        _store: createElementStore(element._store.validated)
      };
      Object.defineProperties(resolvedElement, {
        ref: { value: null },
        _debugInfo: {
          value: isArrayImpl(element._debugInfo)
            ? element._debugInfo.slice()
            : element._debugInfo,
          writable: !0
        },
        _debugStack: { value: element._debugStack, writable: !0 },
        _debugTask: { value: element._debugTask, writable: !0 }
      });
      registerModel && response._models.set(element, resolvedElement);
      registerModel = element.type;
      var moduleChunk =
        null === registerModel ||
        ("object" !== typeof registerModel &&
          "function" !== typeof registerModel)
          ? null
          : resolveModule(response, registerModel);
      null !== moduleChunk
        ? (resolvedElement.type = createLazyChunkWrapper(moduleChunk))
        : null === registerModel ||
          ("object" !== typeof registerModel &&
            "function" !== typeof registerModel) ||
          !resolveTemporaryReference(response, registerModel) ||
          (resolvedElement.type = response._models.get(registerModel));
      resolvedElement.props = readModel(response, element.props);
      response._completedElements.push(resolvedElement);
      return resolvedElement;
    }
    function readElement(response, element) {
      var type = element.type;
      null === type ||
        ("object" !== typeof type && "function" !== typeof type) ||
        resolveModule(response, type);
      try {
        var promise = preloadModel(response, element.props);
      } catch (error) {
        return (
          (promise = createPendingChunk(response)),
          (type = createLazyChunkWrapper(promise)),
          response._models.set(element, type),
          triggerErrorOnChunk(promise, error),
          type
        );
      }
      if (null === promise) return createElement(response, element, !0);
      var chunk = createPendingChunk(response);
      type = createLazyChunkWrapper(chunk);
      response._models.set(element, type);
      subscribeToModel(
        response,
        promise,
        function () {
          if (!response._closed)
            try {
              initializeChunk(chunk, createElement(response, element, !1));
            } catch (error$3) {
              triggerErrorOnChunk(chunk, error$3);
            } finally {
              freezeCompletedElements(response);
            }
        },
        function (error) {
          return triggerErrorOnChunk(chunk, error);
        }
      );
      return type;
    }
    function isLazyModel(response, model) {
      return (
        null !== model &&
        "object" === typeof model &&
        model.$$typeof === REACT_LAZY_TYPE &&
        0 === getModelInfo(response._result, model)
      );
    }
    function isElementModel(response, model) {
      if (
        null === model ||
        "object" !== typeof model ||
        model.$$typeof !== REACT_ELEMENT_TYPE
      )
        return !1;
      response = getModelInfo(response._result, model) & 3;
      return 0 === response || 3 === response;
    }
    function readModelReference(response, reference, visitElement) {
      var source = reference.root;
      if ("fulfilled" !== source.status) {
        if ("rejected" === source.status)
          throw resolveError(response, source, source.reason);
        throw source;
      }
      for (var keys = [], parent = reference.parent; null !== parent; )
        keys.push(reference.key),
          (reference = parent),
          (parent = reference.parent);
      source = source.value;
      for (reference = keys.length; 0 <= reference; reference--) {
        for (; isLazyModel(response, source); ) {
          parent = source;
          try {
            source = parent._init(parent._payload);
          } catch (error) {
            throw resolveError(response, parent._payload, error);
          }
        }
        void 0 !== visitElement &&
          isElementModel(response, source) &&
          visitElement(source);
        0 < reference && (source = source[keys[reference - 1]]);
      }
      return source;
    }
    function readModel(response, value) {
      if (
        null === value ||
        ("object" !== typeof value && "function" !== typeof value)
      )
        return value;
      var info = getModelInfo(response._result, value),
        models = response._models,
        existingModel = models.get(value);
      if (void 0 !== existingModel) return existingModel;
      existingModel = getValueReference(response._result, value);
      if (void 0 !== existingModel)
        return (
          (info = readModelReference(response, existingModel)),
          null === existingModel.parent && info === existingModel.root.value
            ? ((existingModel = readModel(response, existingModel.root)),
              "resolved_model" === existingModel.status &&
                initializeResolvedModelChunk(existingModel),
              (response =
                "fulfilled" === existingModel.status
                  ? existingModel.value
                  : readModel(response, info)))
            : (response = readModel(response, info)),
          models.set(value, response),
          response
        );
      if (0 !== (info & 4))
        return isArrayImpl(value) ? readArray(response, value) : value;
      switch (info & 3) {
        case 1:
          return readObject(response, value);
        case 2:
          return readArray(response, value);
        case 3:
          return readElement(response, value);
      }
      return isArrayImpl(value)
        ? readArray(response, value)
        : readSpecialModel(response, value);
    }
    function readArray(response, value) {
      var copy = Array(value.length);
      response._models.set(value, copy);
      for (var i = 0; i < value.length; i++)
        copy[i] = readModel(response, value[i]);
      return copy;
    }
    function readObject(response, object) {
      var copy = {};
      response._models.set(object, copy);
      for (var keys = Object.keys(object), i = 0; i < keys.length; i++) {
        var key = keys[i],
          child = readModel(response, object[key]);
        "__proto__" === key
          ? Object.defineProperty(copy, key, {
              value: child,
              enumerable: !0,
              writable: !0,
              configurable: !0
            })
          : (copy[key] = child);
      }
      return copy;
    }
    function readSpecialModel(response, value) {
      if (resolveTemporaryReference(response, value))
        return response._models.get(value);
      var moduleChunk = resolveModule(response, value);
      if (null !== moduleChunk) return readChunk(moduleChunk);
      if (value.$$typeof === REACT_ELEMENT_TYPE)
        return readElement(response, value);
      if (value.$$typeof === REACT_LAZY_TYPE) {
        var chunk = createPendingChunk(response);
        moduleChunk = createLazyChunkWrapper(chunk);
        var debugInfo = value._debugInfo;
        if (void 0 !== debugInfo && null !== debugInfo)
          for (
            var localDebugInfo = chunk._debugInfo, i = 0;
            i < debugInfo.length;
            i++
          )
            localDebugInfo.push(debugInfo[i]);
        debugInfo = value._store;
        moduleChunk._store =
          void 0 === debugInfo
            ? void 0
            : createElementStore(debugInfo.validated);
        response._models.set(value, moduleChunk);
        var source = value._payload;
        subscribeChunkDebugInfo(response, chunk, source);
        debugInfo = function (error) {
          if (null !== getResultModelStatus(source)) {
            var model = source._debugModel;
            if (void 0 !== model) {
              error = resolveError(response, source, error);
              var erroredComponent = {
                name: getComponentNameFromType(model.type) || "",
                owner: model._owner
              };
              erroredComponent.debugStack = model._debugStack;
              supportsCreateTask &&
                (erroredComponent.debugTask = model._debugTask);
              chunk._debugInfo.push(erroredComponent);
              triggerErrorOnChunk(chunk, error);
              return;
            }
          }
          triggerErrorOnChunk(chunk, resolveError(response, source, error));
        };
        if (response._closed || isHaltedModel(response, source))
          return (
            triggerErrorOnChunk(chunk, getClosedReason(response)), moduleChunk
          );
        localDebugInfo = getResultModelStatus(source);
        if ("fulfilled" === localDebugInfo)
          return resolveModelChunk(response, chunk, source.value), moduleChunk;
        if ("rejected" === localDebugInfo)
          return debugInfo(source.reason), moduleChunk;
        subscribeToModel(
          response,
          source,
          function (model) {
            return resolveModelChunk(response, chunk, model);
          },
          debugInfo
        );
        return moduleChunk;
      }
      if ("function" === typeof value.then) {
        var _chunk2 = createPendingChunk(
          response,
          "pending_weak" === value.status
        );
        response._models.set(value, _chunk2);
        subscribeChunkDebugInfo(response, _chunk2, value);
        if (response._closed)
          return (
            "pending_weak" === _chunk2.status
              ? haltChunk(_chunk2)
              : triggerErrorOnChunk(_chunk2, getClosedReason(response)),
            _chunk2
          );
        if (
          "pending_weak" === _chunk2.status &&
          isHalted(response._result, value)
        )
          return haltChunk(_chunk2), _chunk2;
        if (isHaltedModel(response, value))
          return (
            triggerErrorOnChunk(_chunk2, getClosedReason(response)), _chunk2
          );
        if ("pending_weak" === _chunk2.status)
          return subscribeWeakModel(response, _chunk2, value), _chunk2;
        moduleChunk = getResultModelStatus(value);
        if ("fulfilled" === moduleChunk)
          return resolveModelChunk(response, _chunk2, value.value), _chunk2;
        if ("rejected" === moduleChunk)
          return (
            triggerErrorOnChunk(
              _chunk2,
              resolveError(response, value, value.reason)
            ),
            _chunk2
          );
        subscribeToModel(
          response,
          value,
          function (model) {
            return resolveModelChunk(response, _chunk2, model);
          },
          function (error) {
            return triggerErrorOnChunk(
              _chunk2,
              resolveError(response, value, error)
            );
          }
        );
        return _chunk2;
      }
      if (
        value instanceof Date ||
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
      )
        return value;
      if (value instanceof Map) {
        var copy = new Map();
        response._models.set(value, copy);
        moduleChunk = getCollectionEntries(response._result, value);
        if (void 0 !== moduleChunk) {
          moduleChunk = readModel(
            response,
            readModelReference(response, {
              root: moduleChunk,
              parent: null,
              key: ""
            })
          );
          for (debugInfo = 0; debugInfo < moduleChunk.length; debugInfo++)
            copy.set(moduleChunk[debugInfo][0], moduleChunk[debugInfo][1]);
          return copy;
        }
        value.forEach(function (child, key) {
          copy.set(readModel(response, key), readModel(response, child));
        });
        return copy;
      }
      if (value instanceof Set) {
        var _copy = new Set();
        response._models.set(value, _copy);
        moduleChunk = getCollectionEntries(response._result, value);
        if (void 0 !== moduleChunk) {
          moduleChunk = readModel(
            response,
            readModelReference(response, {
              root: moduleChunk,
              parent: null,
              key: ""
            })
          );
          for (debugInfo = 0; debugInfo < moduleChunk.length; debugInfo++)
            _copy.add(moduleChunk[debugInfo]);
          return _copy;
        }
        value.forEach(function (child) {
          _copy.add(readModel(response, child));
        });
        return _copy;
      }
      if (getPrototypeOf(value) === ObjectPrototype)
        return readObject(response, value);
      moduleChunk = getReadableStream(response._result, value);
      if (void 0 !== moduleChunk)
        return readReadableStream(response, value, moduleChunk);
      moduleChunk = getAsyncIterable(response._result, value);
      if (void 0 !== moduleChunk)
        return readAsyncIterable(response, value, moduleChunk);
      moduleChunk = getIteratorEntries(response._result, value);
      if (void 0 !== moduleChunk) {
        debugInfo = [];
        localDebugInfo = debugInfo.values();
        response._models.set(value, localDebugInfo);
        for (i = 0; i < moduleChunk.length; i++)
          debugInfo[i] = readModel(response, moduleChunk[i]);
        return localDebugInfo;
      }
      if ("function" === typeof FormData && value instanceof FormData) {
        if (!hasFormDataBlobs(response._result, value)) return value;
        moduleChunk = Array.from(value.entries());
        debugInfo = new FormData();
        response._models.set(value, debugInfo);
        for (
          localDebugInfo = 0;
          localDebugInfo < moduleChunk.length;
          localDebugInfo++
        )
          (i = moduleChunk[localDebugInfo]),
            debugInfo.append(i[0], readModel(response, i[1]));
        return debugInfo;
      }
      if ("function" === typeof Blob && value instanceof Blob)
        return (
          (moduleChunk = new Blob([value], { type: value.type })),
          response._models.set(value, moduleChunk),
          moduleChunk
        );
      if (value instanceof Error) {
        moduleChunk = getErrorInfo(response._result, value);
        if (void 0 === moduleChunk)
          throw Error(
            "Expected Error metadata in Result. This is a bug in React."
          );
        moduleChunk = resolveResultErrorDev(
          response,
          moduleChunk,
          "cause" in value ? { cause: void 0 } : void 0,
          "undefined" !== typeof AggregateError &&
            value instanceof AggregateError
        );
        response._models.set(value, moduleChunk);
        "cause" in value &&
          (moduleChunk.cause = readOutlinedModel(response, value.cause));
        "undefined" !== typeof AggregateError &&
          value instanceof AggregateError &&
          moduleChunk instanceof AggregateError &&
          (moduleChunk.errors = new AggregateError(
            readOutlinedModel(response, value.errors)
          ).errors);
        return moduleChunk;
      }
      if (getPrototypeOf(value) === ObjectPrototype)
        return readObject(response, value);
      throw Error("Not implemented.");
    }
    function resolveModelChunk(response, chunk, model) {
      if ("pending" === chunk.status || "pending_weak" === chunk.status) {
        var resolveListeners = chunk.value,
          rejectListeners = chunk.reason;
        chunk.status = "resolved_model";
        chunk.value = model;
        chunk.reason = response;
        null !== resolveListeners &&
          (initializeResolvedModelChunk(chunk),
          wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners));
      }
    }
    function initializeResolvedModelChunk(chunk) {
      var model = chunk.value,
        response = chunk.reason;
      chunk.status = "blocked";
      chunk.value = null;
      chunk.reason = null;
      initializeModelChunk(response, chunk, model);
    }
    function freezeCompletedElements(response) {
      response = response._completedElements;
      for (var i = 0; i < response.length; i++)
        Object.freeze(response[i].props);
      response.length = 0;
    }
    function completeModel(response, model, debugInfo) {
      try {
        var value =
          void 0 !== debugInfo &&
          0 < debugInfo.length &&
          isArrayImpl(model) &&
          (void 0 === response._models.get(model) ||
            response._models.get(model) === model)
            ? readArray(response, model)
            : readModel(response, model);
        if (
          void 0 !== debugInfo &&
          0 < debugInfo.length &&
          null !== value &&
          "object" === typeof value &&
          (value.$$typeof === REACT_ELEMENT_TYPE || isArrayImpl(value))
        ) {
          var resolvedDebugInfo = debugInfo.splice(0);
          isArrayImpl(value._debugInfo)
            ? value._debugInfo.unshift.apply(
                value._debugInfo,
                resolvedDebugInfo
              )
            : Object.isFrozen(value) ||
              Object.defineProperty(value, "_debugInfo", {
                configurable: !1,
                enumerable: !1,
                value: resolvedDebugInfo,
                writable: !0
              });
        }
        return value;
      } finally {
        freezeCompletedElements(response);
      }
    }
    function subscribeChunkDebugInfo(response, chunk, source) {
      if (
        !response._closed &&
        null !== getResultModelStatus(source) &&
        void 0 !== source._debugInfo &&
        !isHalted(response._result, source)
      ) {
        var debugChunk = chunk,
          unsubscribe = subscribeToDebugInfo(source, function (info) {
            null !== debugChunk && debugChunk._debugInfo.push(info);
          }),
          owner = response,
          cleanup = function () {
            unsubscribe();
            debugChunk = null;
            null !== owner &&
              (null !== owner._cleanups && owner._cleanups.delete(cleanup),
              (owner = null));
          };
        null === response._cleanups && (response._cleanups = new Set());
        response._cleanups.add(cleanup);
        source.then(cleanup, cleanup);
      }
    }
    function initializeModelChunk(response, chunk, model) {
      if (!response._closed)
        try {
          var promise = preloadModel(response, model);
          null === promise
            ? initializeChunk(
                chunk,
                completeModel(response, model, chunk._debugInfo)
              )
            : subscribeToModel(
                response,
                promise,
                function () {
                  if (!response._closed)
                    try {
                      initializeChunk(
                        chunk,
                        completeModel(response, model, chunk._debugInfo)
                      );
                    } catch (error) {
                      triggerErrorOnChunk(chunk, error);
                    }
                },
                function (error) {
                  return triggerErrorOnChunk(chunk, error);
                }
              );
        } catch (error) {
          triggerErrorOnChunk(chunk, error);
        }
    }
    function waitForOutlinedModel(response, model, wakeable) {
      return new Promise(function (resolve, reject) {
        function retry() {
          try {
            var pending = preloadModel(response, model, !0);
            null === pending
              ? resolve()
              : subscribeToModel(response, pending, resolve, reject);
          } catch (error) {
            reject(error);
          }
        }
        subscribeToModel(response, wakeable, retry, retry);
      });
    }
    function scanOutlinedModel(response, model, state, chunks) {
      for (var value = model; isLazyModel(response, value); ) {
        var lazy = value;
        try {
          value = lazy._init(lazy._payload);
        } catch (error) {
          value = error;
          if (isHaltedModel(response, lazy._payload))
            throw getClosedReason(response);
          if (
            "rejected" !== lazy._payload.status &&
            null !== error &&
            "object" === typeof error &&
            "function" === typeof value.then
          ) {
            null !== state.parent && (state.parent.cacheable = !1);
            addPreloadDependency(
              chunks,
              waitForOutlinedModel(response, model, value)
            );
            return;
          }
          throw resolveError(response, lazy._payload, error);
        }
      }
      isElementModel(response, value)
        ? ((model = value.type),
          null === model ||
            ("object" !== typeof model && "function" !== typeof model) ||
            resolveModule(response, model),
          scanModel(response, value.props, state, chunks))
        : scanModel(response, value, state, chunks);
    }
    function createPreloadPromise(chunk) {
      return new Promise(function (resolve, reject) {
        chunk.then(function () {
          return resolve();
        }, reject);
      });
    }
    function preloadModel(response, model) {
      var isOutlined =
        2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : !1;
      if (
        null === model ||
        ("object" !== typeof model && "function" !== typeof model) ||
        response._models.get(model) === model ||
        0 !== (getModelInfo(response._result, model) & 20)
      )
        return null;
      var state = { nextIndex: 0, parent: null, stack: [] },
        pending = { dependencies: null };
      try {
        isOutlined
          ? scanOutlinedModel(response, model, state, pending)
          : scanModel(response, model, state, pending);
      } catch (error) {
        isOutlined = new ReactPromise("rejected", null, error);
        for (pending = 0; pending < state.stack.length; pending++) {
          var preload = state.stack[pending];
          preload.onStack = !1;
          preload.dependencies = null;
          preload.chunk = isOutlined;
        }
        throw error;
      }
      isOutlined = pending.dependencies;
      if (null === isOutlined) return null;
      state = [];
      isOutlined = isOutlined.values();
      for (
        pending = isOutlined.next();
        !pending.done;
        pending = isOutlined.next()
      )
        state.push(createPreloadPromise(pending.value));
      return Promise.all(state).then(noop);
    }
    function scanModelReference(response, value, reference, state, chunks) {
      try {
        var root = reference.root;
        if ("fulfilled" !== root.status) {
          if ("rejected" === root.status)
            throw resolveError(response, root, root.reason);
          throw root;
        }
        scanModel(response, root.value, state, chunks);
        var model = readModelReference(response, reference, function (element) {
          scanModel(response, element.props, state, chunks);
        });
        scanModel(response, model, state, chunks);
      } catch (error) {
        if (
          ((reference = error),
          null !== error &&
            "object" === typeof error &&
            "function" === typeof reference.then)
        )
          null !== state.parent && (state.parent.cacheable = !1),
            addPreloadDependency(
              chunks,
              waitForOutlinedModel(response, value, reference)
            );
        else throw error;
      }
    }
    function scanModel(response, value, state, chunks$jscomp$0) {
      if (
        null !== value &&
        ("object" === typeof value || "function" === typeof value) &&
        void 0 === response._models.get(value)
      ) {
        var info = getModelInfo(response._result, value);
        if (0 === (info & 20)) {
          var kind = info & 3;
          if (3 !== kind) {
            if (0 === kind) {
              if (resolveTemporaryReference(response, value)) return;
              info = resolveModule(response, value);
              if (null !== info) {
                "resolved_module" === info.status &&
                  initializeModuleChunk(info);
                if ("rejected" === info.status) throw info.reason;
                ("pending" !== info.status && "blocked" !== info.status) ||
                  addPreloadDependency(chunks$jscomp$0, info);
                return;
              }
              if (
                value instanceof Date ||
                value instanceof ArrayBuffer ||
                ArrayBuffer.isView(value) ||
                value.$$typeof === REACT_ELEMENT_TYPE ||
                value.$$typeof === REACT_LAZY_TYPE ||
                "function" === typeof value.then
              )
                return;
            }
            var preload = response._preloads.get(value);
            info = void 0 !== preload;
            var parent = state.parent;
            if (void 0 === preload) {
              preload = state.nextIndex++;
              preload = {
                model: value,
                index: preload,
                lowlink: preload,
                onStack: !0,
                cacheable: !0,
                chunk: null,
                dependencies: null
              };
              response._preloads.set(value, preload);
              state.stack.push(preload);
              state.parent = preload;
              try {
                a: {
                  var chunks = preload,
                    reference = getValueReference(response._result, value);
                  if (void 0 !== reference)
                    scanModelReference(
                      response,
                      value,
                      reference,
                      state,
                      chunks
                    );
                  else {
                    var collection =
                      0 === kind
                        ? getCollectionEntries(response._result, value)
                        : void 0;
                    if (void 0 !== collection)
                      scanModelReference(
                        response,
                        value,
                        { root: collection, parent: null, key: "" },
                        state,
                        chunks
                      );
                    else if (2 === kind || (0 === kind && isArrayImpl(value)))
                      for (var i = 0; i < value.length; i++)
                        scanModel(response, value[i], state, chunks);
                    else if (0 === kind && value instanceof Map)
                      for (
                        var iterator = value.entries(), entry = iterator.next();
                        !entry.done;
                        entry = iterator.next()
                      )
                        scanModel(response, entry.value[0], state, chunks),
                          scanModel(response, entry.value[1], state, chunks);
                    else if (0 === kind && value instanceof Set)
                      for (
                        var _iterator = value.values(),
                          _entry = _iterator.next();
                        !_entry.done;
                        _entry = _iterator.next()
                      )
                        scanModel(response, _entry.value, state, chunks);
                    else {
                      if (
                        0 === kind &&
                        getPrototypeOf(value) !== ObjectPrototype
                      ) {
                        if (
                          void 0 !==
                            getReadableStream(response._result, value) ||
                          void 0 !== getAsyncIterable(response._result, value)
                        )
                          break a;
                        var entries = getIteratorEntries(
                          response._result,
                          value
                        );
                        if (void 0 !== entries) {
                          scanModel(response, entries, state, chunks);
                          break a;
                        }
                        if (
                          ("function" === typeof FormData &&
                            value instanceof FormData) ||
                          ("function" === typeof Blob && value instanceof Blob)
                        )
                          break a;
                        if (value instanceof Error) {
                          "cause" in value &&
                            scanOutlinedModel(
                              response,
                              value.cause,
                              state,
                              chunks
                            );
                          "undefined" !== typeof AggregateError &&
                            value instanceof AggregateError &&
                            scanOutlinedModel(
                              response,
                              value.errors,
                              state,
                              chunks
                            );
                          break a;
                        }
                      }
                      i = Object.keys(value);
                      for (reference = 0; reference < i.length; reference++)
                        scanModel(response, value[i[reference]], state, chunks);
                    }
                  }
                }
              } finally {
                state.parent = parent;
              }
              if (preload.lowlink === preload.index)
                if (
                  ((reference = preload),
                  (collection = state.stack),
                  collection[collection.length - 1] === reference)
                )
                  collection.pop(),
                    (reference.onStack = !1),
                    (reference.chunk = createModelPreloadChunk(
                      response,
                      reference.dependencies
                    )),
                    (reference.dependencies = null),
                    reference.cacheable ||
                      response._preloads.delete(reference.model);
                else {
                  state = [];
                  iterator = null;
                  value = !0;
                  do {
                    i = collection.pop();
                    if (void 0 === i)
                      throw Error("Expected a pending Result model preload.");
                    i.onStack = !1;
                    value = value && i.cacheable;
                    state.push(i);
                    entry = i.dependencies;
                    if (null !== entry) {
                      if (null === iterator) iterator = entry;
                      else
                        for (
                          entry = entry.values(), _iterator = entry.next();
                          !_iterator.done;
                          _iterator = entry.next()
                        )
                          iterator.add(_iterator.value);
                      i.dependencies = null;
                    }
                  } while (i !== reference);
                  reference = createModelPreloadChunk(response, iterator);
                  for (collection = 0; collection < state.length; collection++)
                    (i = state[collection]),
                      (i.chunk = reference),
                      (i.cacheable = value),
                      i.cacheable || response._preloads.delete(i.model);
                }
            }
            null === parent || preload.cacheable || (parent.cacheable = !1);
            if (preload.onStack)
              null !== parent &&
                (parent.lowlink = Math.min(
                  parent.lowlink,
                  info ? preload.index : preload.lowlink
                ));
            else if (((response = preload.chunk), null !== response)) {
              if ("rejected" === response.status) throw response.reason;
              "fulfilled" !== response.status &&
                addPreloadDependency(chunks$jscomp$0, response);
            }
          }
        }
      }
    }
    function addPreloadDependency(preload, dependency) {
      var dependencies = preload.dependencies;
      null === dependencies &&
        (preload.dependencies = dependencies = new Set());
      dependencies.add(dependency);
    }
    function createModelPreloadChunk(response, dependencies) {
      if (null === dependencies) return null;
      var chunk = createBlockedChunk(response),
        remaining = dependencies.size;
      dependencies.forEach(function (dependency) {
        dependency.then(
          function () {
            0 === --remaining && initializeChunk(chunk, void 0);
          },
          function (error) {
            return triggerErrorOnChunk(chunk, error);
          }
        );
      });
      return chunk;
    }
    function resolveError(response, thenable, error) {
      if (isHaltedModel(response, thenable)) return getClosedReason(response);
      thenable = response._result.errorReferences.get(thenable);
      if (void 0 === thenable) return error;
      var existingError = response._models.get(thenable);
      if (void 0 !== existingError) return existingError;
      if (
        error instanceof Error &&
        void 0 !== getErrorInfo(response._result, error)
      )
        error = readModel(response, error);
      else {
        existingError = "Error";
        var descriptors = null;
        try {
          if (error instanceof Error) {
            existingError = error.name;
            var message = String(error.message);
            descriptors = Object.getOwnPropertyDescriptors(error);
            delete descriptors.digest;
            delete descriptors.message;
            delete descriptors.name;
          } else
            message =
              "object" === typeof error && null !== error
                ? describeObjectForErrorMessage(error)
                : String(error);
        } catch (x) {
          (message =
            "An error occurred but serializing the error message failed."),
            (descriptors = null);
        }
        error = Error(message);
        null !== descriptors && Object.defineProperties(error, descriptors);
        error.name = existingError;
      }
      error.digest = thenable.digest;
      response._models.set(thenable, error);
      return error;
    }
    function readResult(response, result) {
      function flushHints() {
        if (!response._closed)
          try {
            for (
              var completedHints = hints.completedHints;
              nextHintIndex < completedHints.length;
              nextHintIndex++
            ) {
              var hint = completedHints[nextHintIndex];
              dispatchHint(hint.code, hint.model);
            }
            hints.closed
              ? closeWeakSubscriptions(response)
              : subscribeToModel(
                  response,
                  waitForHints(hints),
                  flushHints,
                  function (error) {
                    return stopReading(response, error);
                  }
                );
          } catch (error) {
            stopReading(response, error);
          }
      }
      var chunk = readModel(response, result.root),
        hints = getHintQueue(result),
        nextHintIndex = 0;
      flushHints();
      return chunk;
    }
    function resolveTemporaryReference(response, value) {
      var reference = response._result.temporaryReferences;
      reference = null === reference ? void 0 : reference.get(value);
      if (void 0 === reference) return !1;
      var temporaryReferences = response._tempRefs;
      if (null == temporaryReferences)
        throw Error(
          "Missing a temporary reference set but the RSC response returned a temporary reference. Pass a temporaryReference option with the set that was used with the reply."
        );
      response._models.set(value, temporaryReferences.get("$" + reference));
      return !0;
    }
    function loadServerReference(response, metaData, chunk) {
      if (metaData.isObjectReference)
        initializeChunk(chunk, createServerObjectReference(metaData.id));
      else {
        var bound =
          null === metaData.bound ? null : readModel(response, metaData.bound);
        null !== bound && bound.catch(noop);
        if (response._serverReferenceConfig) {
          var serverReference = resolveServerReference(
              response._serverReferenceConfig,
              metaData.id
            ),
            promise = preloadModule(serverReference);
          promise || bound
            ? subscribeToModel(
                response,
                Promise.all([promise, bound]),
                function (_ref) {
                  _ref = _ref[1];
                  try {
                    var _resolvedValue = requireModule(serverReference);
                    null !== _ref &&
                      ((_ref = _ref.slice(0)),
                      _ref.unshift(null),
                      (_resolvedValue = _resolvedValue.bind.apply(
                        _resolvedValue,
                        _ref
                      )));
                    registerBoundServerReference(
                      _resolvedValue,
                      metaData.id,
                      bound,
                      response._encodeFormAction
                    );
                    initializeChunk(chunk, _resolvedValue);
                  } catch (error) {
                    triggerErrorOnChunk(chunk, error);
                  }
                },
                function (error) {
                  return triggerErrorOnChunk(chunk, error);
                }
              )
            : ((promise = requireModule(serverReference)),
              registerBoundServerReference(
                promise,
                metaData.id,
                bound,
                response._encodeFormAction
              ),
              initializeChunk(chunk, promise));
        } else
          initializeChunk(
            chunk,
            createBoundServerReference(
              {
                id: metaData.id,
                bound: bound,
                name: metaData.name,
                env: metaData.env,
                location: metaData.location
              },
              response._callServer,
              response._encodeFormAction,
              response._debugFindSourceMapURL
            )
          );
      }
    }
    function registerStreamError(response, onError) {
      var streamErrors = response._streamErrors;
      null === streamErrors && (response._streamErrors = streamErrors = []);
      streamErrors.push(onError);
      return function () {
        var errors = response._streamErrors;
        if (null !== errors) {
          var index = errors.indexOf(onError);
          -1 !== index && errors.splice(index, 1);
        }
      };
    }
    function readReadableStream(response, model, source) {
      function subscribe(wakeable, resolve) {
        subscribeToModel(
          response,
          wakeable,
          resolve,
          2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : noop,
          subscriptions
        );
      }
      function cancel(reason) {
        cancelled ||
          ((closed = cancelled = !0),
          unsubscribe(),
          unregisterError(),
          subscriptions.forEach(detachModelSubscription),
          pendingChunks.forEach(function (chunk) {
            return triggerErrorOnChunk(chunk, reason);
          }),
          pendingChunks.clear(),
          (previousBlockedChunk = null));
      }
      var controller = null,
        closed = !1,
        cancelled = !1,
        unsubscribe = noop,
        unregisterError = noop,
        pendingChunks = new Set(),
        subscriptions = new Set(),
        stream = new ReadableStream({
          type: source.isByteStream ? "bytes" : void 0,
          start: function (c) {
            controller = c;
          },
          cancel: function (reason) {
            cancel(reason);
          }
        });
      response._models.set(model, stream);
      if (response._closed || isHaltedModel(response, model))
        return controller.error(getClosedReason(response)), stream;
      var previousBlockedChunk = null,
        reader = {
          halt: function () {
            response._allowPartialStream
              ? reader.close()
              : reader.error(getClosedReason(response));
          },
          enqueue: function (entry) {
            if (!closed && !cancelled) {
              var previous = previousBlockedChunk,
                chunk = createPendingChunk();
              pendingChunks.add(chunk);
              previousBlockedChunk = chunk;
              subscribe(
                chunk,
                function (value) {
                  pendingChunks.delete(chunk);
                  cancelled ||
                    controller.enqueue(
                      source.isByteStream ? new Uint8Array(value) : value
                    );
                  previousBlockedChunk === chunk &&
                    (previousBlockedChunk = null);
                },
                function (reason) {
                  pendingChunks.delete(chunk);
                  cancelled || (cancel(reason), controller.error(reason));
                }
              );
              isHaltedModel(response, entry)
                ? null === previous
                  ? triggerErrorOnChunk(chunk, getClosedReason(response))
                  : subscribe(
                      previous,
                      function () {
                        return triggerErrorOnChunk(
                          chunk,
                          getClosedReason(response)
                        );
                      },
                      function (reason) {
                        return triggerErrorOnChunk(chunk, reason);
                      }
                    )
                : subscribe(
                    entry,
                    function (value) {
                      if ("pending" === chunk.status) {
                        chunk.status = "blocked";
                        try {
                          var pending = preloadModel(response, value);
                          null !== pending && pending.catch(noop);
                          var initialize = function () {
                            null === pending
                              ? initializeModelChunk(response, chunk, value)
                              : subscribe(
                                  pending,
                                  function () {
                                    return initializeModelChunk(
                                      response,
                                      chunk,
                                      value
                                    );
                                  },
                                  function (reason) {
                                    return triggerErrorOnChunk(chunk, reason);
                                  }
                                );
                          };
                          null === previous
                            ? initialize()
                            : subscribe(
                                previous,
                                initialize,
                                function (reason) {
                                  return triggerErrorOnChunk(chunk, reason);
                                }
                              );
                        } catch (reason) {
                          null === previous
                            ? triggerErrorOnChunk(chunk, reason)
                            : subscribe(
                                previous,
                                function () {
                                  return triggerErrorOnChunk(chunk, reason);
                                },
                                function (error) {
                                  return triggerErrorOnChunk(chunk, error);
                                }
                              );
                        }
                      }
                    },
                    function (reason) {
                      null === previous
                        ? triggerErrorOnChunk(
                            chunk,
                            resolveError(response, entry, reason)
                          )
                        : subscribe(
                            previous,
                            function () {
                              return triggerErrorOnChunk(
                                chunk,
                                resolveError(response, entry, reason)
                              );
                            },
                            function (error) {
                              return triggerErrorOnChunk(chunk, error);
                            }
                          );
                    }
                  );
            }
          },
          close: function () {
            if (!closed) {
              closed = !0;
              var previous = previousBlockedChunk;
              previousBlockedChunk = null;
              null === previous
                ? cancelled ||
                  (closeReadableStream(controller, source.isByteStream),
                  unregisterError())
                : subscribe(previous, function () {
                    cancelled ||
                      (closeReadableStream(controller, source.isByteStream),
                      unregisterError());
                  });
            }
          },
          error: function (reason) {
            if (!closed) {
              closed = !0;
              var error = resolveError(response, model, reason);
              reason = previousBlockedChunk;
              previousBlockedChunk = null;
              null === reason
                ? cancelled ||
                  ((cancelled = !0), controller.error(error), unregisterError())
                : subscribe(reason, function () {
                    cancelled ||
                      ((cancelled = !0),
                      controller.error(error),
                      unregisterError());
                  });
            }
          }
        };
      unregisterError = registerStreamError(response, function (error) {
        cancel(error);
        controller.error(error);
      });
      unsubscribe = source.subscribe(reader);
      cancelled && unsubscribe();
      return stream;
    }
    function asyncIterator() {
      return this;
    }
    function readAsyncIterable(response, model, source) {
      function release() {
        closed &&
          0 === subscriptions.size &&
          (unsubscribe(), unregisterError());
      }
      function resolveIteratorResult(chunk, entry) {
        function initialize() {
          if ("blocked" === chunk.status) {
            try {
              var value = entry.done
                ? readOutlinedModel(response, entry.value)
                : readModel(response, entry.value);
              freezeCompletedElements(response);
              initializeChunk(
                chunk,
                entry.done
                  ? { done: !0, value: value }
                  : { done: !1, value: value }
              );
            } catch (error) {
              triggerErrorOnChunk(chunk, error);
            }
            release();
          }
        }
        if ("pending" === chunk.status) {
          chunk.status = "blocked";
          try {
            var pending = preloadModel(response, entry.value, !!entry.done);
            null === pending
              ? initialize()
              : subscribeToModel(
                  response,
                  pending,
                  initialize,
                  function (error) {
                    triggerErrorOnChunk(chunk, error);
                    release();
                  },
                  subscriptions
                );
          } catch (error) {
            triggerErrorOnChunk(chunk, error), release();
          }
        }
      }
      function enqueue(entry, done) {
        if (!closed) {
          nextWriteIndex === buffer.length &&
            (buffer[nextWriteIndex] = createPendingChunk());
          var chunk = buffer[nextWriteIndex++];
          isHaltedModel(response, entry)
            ? triggerErrorOnChunk(chunk, getClosedReason(response))
            : subscribeToModel(
                response,
                entry,
                function (value) {
                  return resolveIteratorResult(
                    chunk,
                    done
                      ? { done: !0, value: value }
                      : { done: !1, value: value }
                  );
                },
                function (reason) {
                  reason = resolveError(response, entry, reason);
                  triggerErrorOnChunk(chunk, reason);
                  release();
                },
                subscriptions
              );
        }
      }
      function close() {
        if (!closed) {
          for (closed = !0; nextWriteIndex < buffer.length; )
            initializeChunk(buffer[nextWriteIndex++], {
              done: !0,
              value: void 0
            });
          release();
        }
      }
      function errorIterable(reason) {
        if (!closed) {
          closed = !0;
          nextWriteIndex === buffer.length &&
            (buffer[nextWriteIndex] = createPendingChunk());
          for (
            reason = resolveError(response, model, reason);
            nextWriteIndex < buffer.length;

          )
            triggerErrorOnChunk(buffer[nextWriteIndex++], reason);
          release();
        }
      }
      function halt() {
        response._allowPartialStream
          ? close()
          : errorIterable(getClosedReason(response));
      }
      function getIterator() {
        var nextReadIndex = 0,
          iterator = {
            next: function (arg) {
              if (void 0 !== arg)
                throw Error(
                  "Values cannot be passed to next() of AsyncIterables passed to Client Components."
                );
              if (nextReadIndex === buffer.length) {
                if (closed)
                  return new ReactPromise(
                    "fulfilled",
                    { done: !0, value: void 0 },
                    null
                  );
                buffer[nextReadIndex] = createPendingChunk();
              }
              return buffer[nextReadIndex++];
            }
          };
        iterator[ASYNC_ITERATOR] = asyncIterator;
        return iterator;
      }
      var buffer = [],
        closed = !1,
        nextWriteIndex = 0,
        unsubscribe = noop,
        unregisterError = noop,
        subscriptions = new Set(),
        $jscomp$compprop0 = {};
      $jscomp$compprop0 = source.isIterator
        ? getIterator()
        : (($jscomp$compprop0[ASYNC_ITERATOR] = getIterator),
          $jscomp$compprop0);
      response._models.set(model, $jscomp$compprop0);
      response._closed
        ? errorIterable(getClosedReason(response))
        : ((unregisterError = registerStreamError(response, function (error) {
            unsubscribe();
            subscriptions.forEach(detachModelSubscription);
            for (var i = 0; i < buffer.length; i++)
              ("pending" !== buffer[i].status &&
                "blocked" !== buffer[i].status) ||
                triggerErrorOnChunk(buffer[i], error);
            errorIterable(error);
          })),
          (unsubscribe = source.subscribe({
            enqueue: enqueue,
            close: close,
            error: errorIterable,
            halt: halt
          })),
          closed && unsubscribe());
      return $jscomp$compprop0;
    }
    function readOutlinedModel(response, model) {
      for (; isLazyModel(response, model); ) {
        var lazy = model;
        try {
          model = lazy._init(lazy._payload);
        } catch (error) {
          throw resolveError(response, lazy._payload, error);
        }
      }
      lazy = readModel(response, model);
      if (isElementModel(response, model))
        for (; lazy.$$typeof === REACT_LAZY_TYPE; ) {
          response = lazy._payload._initializingElement;
          if (void 0 !== response) return response;
          lazy = lazy._init(lazy._payload);
        }
      return lazy;
    }
    function closeWeakSubscriptions(response) {
      var subscriptions = response._weakSubscriptions;
      response._weakSubscriptions = null;
      if (null !== subscriptions)
        for (var i = 0; i < subscriptions.length; i++) {
          var subscription = subscriptions[i],
            chunk = subscription.chunk;
          null !== chunk &&
            (response._closed ||
              isHalted(response._result, subscription.source)) &&
            ("pending_weak" === chunk.status && haltChunk(chunk),
            (subscription.response = null),
            (subscription.chunk = null));
        }
    }
    function subscribeWeakModel(response, chunk, source) {
      var subscription = { response: response, chunk: chunk, source: source };
      chunk = response._weakSubscriptions;
      null === chunk && (response._weakSubscriptions = chunk = []);
      chunk.push(subscription);
      source.then(
        function (model) {
          var target = subscription.response,
            pending = subscription.chunk;
          subscription.response = null;
          subscription.chunk = null;
          null === target ||
            null === pending ||
            target._closed ||
            (resolveModelChunk(target, pending, model),
            "resolved_model" === pending.status &&
              initializeResolvedModelChunk(pending));
        },
        function (error) {
          var target = subscription.response,
            pending = subscription.chunk;
          subscription.response = null;
          subscription.chunk = null;
          null !== target &&
            null !== pending &&
            triggerErrorOnChunk(
              pending,
              resolveError(target, subscription.source, error)
            );
        }
      );
    }
    function createFakeFunction(
      name,
      filename,
      sourceMap,
      line,
      col,
      enclosingLine,
      enclosingCol,
      environmentName
    ) {
      name || (name = "<anonymous>");
      var encodedName = JSON.stringify(name);
      1 > enclosingLine ? (enclosingLine = 0) : enclosingLine--;
      1 > enclosingCol ? (enclosingCol = 0) : enclosingCol--;
      1 > line ? (line = 0) : line--;
      1 > col ? (col = 0) : col--;
      if (
        line < enclosingLine ||
        (line === enclosingLine && col < enclosingCol)
      )
        enclosingCol = enclosingLine = 0;
      1 > line
        ? ((line = encodedName.length + 3),
          (enclosingCol -= line),
          0 > enclosingCol && (enclosingCol = 0),
          (col = col - enclosingCol - line - 3),
          0 > col && (col = 0),
          (encodedName =
            "({" +
            encodedName +
            ":" +
            " ".repeat(enclosingCol) +
            "_=>" +
            " ".repeat(col) +
            "_()})"))
        : 1 > enclosingLine
          ? ((enclosingCol -= encodedName.length + 3),
            0 > enclosingCol && (enclosingCol = 0),
            (encodedName =
              "({" +
              encodedName +
              ":" +
              " ".repeat(enclosingCol) +
              "_=>" +
              "\n".repeat(line - enclosingLine) +
              " ".repeat(col) +
              "_()})"))
          : enclosingLine === line
            ? ((col = col - enclosingCol - 3),
              0 > col && (col = 0),
              (encodedName =
                "\n".repeat(enclosingLine - 1) +
                "({" +
                encodedName +
                ":\n" +
                " ".repeat(enclosingCol) +
                "_=>" +
                " ".repeat(col) +
                "_()})"))
            : (encodedName =
                "\n".repeat(enclosingLine - 1) +
                "({" +
                encodedName +
                ":\n" +
                " ".repeat(enclosingCol) +
                "_=>" +
                "\n".repeat(line - enclosingLine) +
                " ".repeat(col) +
                "_()})");
      encodedName =
        1 > enclosingLine
          ? encodedName +
            "\n/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"
          : "/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */" +
            encodedName;
      filename.startsWith("/") && (filename = "file://" + filename);
      sourceMap
        ? ((encodedName +=
            "\n//# sourceURL=about://React/" +
            encodeURIComponent(environmentName) +
            "/" +
            encodeURI(filename) +
            "?" +
            fakeFunctionIdx++),
          (encodedName += "\n//# sourceMappingURL=" + sourceMap))
        : (encodedName = filename
            ? encodedName + ("\n//# sourceURL=" + encodeURI(filename))
            : encodedName + "\n//# sourceURL=<anonymous>");
      try {
        var fn = (0, eval)(encodedName)[name];
      } catch (x) {
        (fn = function (_) {
          return _();
        }),
          Object.defineProperty(fn, "name", { value: name });
      }
      return fn;
    }
    function resolveResultErrorDev(
      response,
      errorInfo,
      errorOptions,
      isAggregateError
    ) {
      var name = errorInfo.name,
        message = errorInfo.message,
        env = errorInfo.env;
      errorInfo = errorInfo.stack;
      errorOptions = isAggregateError
        ? AggregateError.bind(
            null,
            [],
            message ||
              "An error occurred in the Server Components render but no message was provided",
            errorOptions
          )
        : Error.bind(
            null,
            message ||
              "An error occurred in the Server Components render but no message was provided",
            errorOptions
          );
      for (
        isAggregateError = 0;
        isAggregateError < errorInfo.length;
        isAggregateError++
      ) {
        var frame = errorInfo[isAggregateError];
        message = frame.join("-") + "-" + env + "-n";
        var fn = fakeFunctionCache.get(message);
        if (void 0 === fn) {
          fn = frame[0];
          var filename = frame[1],
            line = frame[2],
            col = frame[3],
            enclosingLine = frame[4];
          frame = frame[5];
          var findSourceMapURL = response._debugFindSourceMapURL;
          findSourceMapURL = findSourceMapURL
            ? findSourceMapURL(filename, env)
            : null;
          fn = createFakeFunction(
            fn,
            filename,
            findSourceMapURL,
            line,
            col,
            enclosingLine,
            frame,
            env
          );
          fakeFunctionCache.set(message, fn);
        }
        errorOptions = fn.bind(null, errorOptions);
      }
      errorInfo = errorOptions;
      (errorOptions = response._debugRootTask)
        ? response._rootEnvironmentName !== env
          ? ((response = console.createTask.bind(
              console,
              '"use ' + env.toLowerCase() + '"'
            )),
            (response = errorOptions.run(response)))
          : (response = errorOptions)
        : (response = null);
      response = null != response ? response.run(errorInfo) : errorInfo();
      response.name = name;
      response.environmentName = env;
      return response;
    }
    function noServerCall() {
      throw Error(
        "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
      );
    }
    var util = require("util"),
      ReactDOM = require("react-dom"),
      React = require("react"),
      decoderOptions = { stream: !0 },
      bind$1 = Function.prototype.bind,
      hasConfirmedEval = !1,
      hasOwnProperty = Object.prototype.hasOwnProperty,
      instrumentedChunks = new WeakSet(),
      loadedChunks = new WeakSet(),
      ReactDOMSharedInternals =
        ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
      REACT_PORTAL_TYPE = Symbol.for("react.portal"),
      REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
      REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"),
      REACT_PROFILER_TYPE = Symbol.for("react.profiler"),
      REACT_CONSUMER_TYPE = Symbol.for("react.consumer"),
      REACT_CONTEXT_TYPE = Symbol.for("react.context"),
      REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
      REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
      REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
      REACT_MEMO_TYPE = Symbol.for("react.memo"),
      REACT_LAZY_TYPE = Symbol.for("react.lazy"),
      REACT_ACTIVITY_TYPE = Symbol.for("react.activity"),
      REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
      MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
      ASYNC_ITERATOR = Symbol.asyncIterator,
      isArrayImpl = Array.isArray,
      getPrototypeOf = Object.getPrototypeOf,
      jsxPropsParents = new WeakMap(),
      jsxChildrenParents = new WeakMap(),
      CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference"),
      ObjectPrototype$2 = Object.prototype,
      knownServerReferences = new WeakMap(),
      knownServerObjectReferences = new WeakMap(),
      boundCache = new WeakMap(),
      fakeServerFunctionIdx = 0,
      serverObjectReferenceProxyHandlers = {
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
            case ASYNC_ITERATOR:
              return;
            case "toJSON":
              return;
            case Symbol.toPrimitive:
              return Object.prototype[Symbol.toPrimitive];
            case Symbol.toStringTag:
              return Object.prototype[Symbol.toStringTag];
            case "then":
              return;
          }
          throw Error(
            "Cannot access " +
              String(name) +
              " on the client. You cannot read a Server Reference to an object on the client. You can only pass it back to the server."
          );
        },
        set: function () {
          throw Error(
            "Cannot assign to a Server Reference to an object on the client."
          );
        }
      },
      FunctionBind = Function.prototype.bind,
      ArraySlice = Array.prototype.slice,
      v8FrameRegExp =
        /^ {3} at (?:(.+) \((.+):(\d+):(\d+)\)|(?:async )?(.+):(\d+):(\d+))$/,
      jscSpiderMonkeyFrameRegExp = /(?:(.*)@)?(.*):(\d+):(\d+)/,
      REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"),
      supportsUserTiming =
        "undefined" !== typeof console &&
        "function" === typeof console.timeStamp &&
        "undefined" !== typeof performance &&
        "function" === typeof performance.measure,
      trackNames =
        "Primary Parallel Parallel\u200b Parallel\u200b\u200b Parallel\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b\u200b".split(
          " "
        ),
      prefix,
      suffix;
    new ("function" === typeof WeakMap ? WeakMap : Map)();
    var ReactSharedInteralsServer =
        React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      ReactSharedInternals =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
        ReactSharedInteralsServer,
      ObjectPrototype$1 = Object.prototype,
      ArrayPrototype = Array.prototype;
    ReactPromise$2.prototype = Object.create(Promise.prototype);
    Object.defineProperty(ReactPromise$2.prototype, "then", {
      writable: !0,
      enumerable: !0,
      configurable: !0,
      value: function (resolve, reject) {
        var _this = this;
        switch (this.status) {
          case "resolved_model":
            initializeModelChunk$1(this);
            break;
          case "resolved_module":
            initializeModuleChunk$1(this);
        }
        var resolveCallback = resolve,
          rejectCallback = reject,
          wrapperPromise = new Promise(function (res, rej) {
            resolve = function (value) {
              wrapperPromise._debugInfo = _this._debugInfo;
              res(value);
            };
            reject = function (reason) {
              wrapperPromise._debugInfo = _this._debugInfo;
              rej(reason);
            };
          });
        wrapperPromise.then(resolveCallback, rejectCallback);
        switch (this.status) {
          case "fulfilled":
            "function" === typeof resolve && resolve(this.value);
            break;
          case "pending":
          case "pending_weak":
          case "blocked":
            "function" === typeof resolve &&
              (null === this.value && (this.value = []),
              this.value.push(resolve));
            "function" === typeof reject &&
              (null === this.reason && (this.reason = []),
              this.reason.push(reject));
            break;
          case "halted":
            break;
          default:
            "function" === typeof reject && reject(this.reason);
        }
      }
    });
    var debugChannelRegistry =
        "function" === typeof FinalizationRegistry
          ? new FinalizationRegistry(closeDebugChannel)
          : null,
      initializingHandler = null,
      initializingChunk = null,
      isInitializingDebugInfo = !1,
      EMPTY_REFERENCE_PATH = [],
      mightHaveStaticConstructor = /\bclass\b.*\bstatic\b/,
      MIN_CHUNK_SIZE = 65536,
      supportsCreateTask$1 = !!console.createTask,
      fakeFunctionCache$1 = new Map(),
      fakeFunctionIdx$1 = 0,
      createFakeJSXCallStack = {
        react_stack_bottom_frame: function (response, stack, environmentName) {
          return buildFakeCallStack$1(
            response,
            stack,
            environmentName,
            !1,
            fakeJSXCallSite
          )();
        }
      },
      createFakeJSXCallStackInDEV =
        createFakeJSXCallStack.react_stack_bottom_frame.bind(
          createFakeJSXCallStack
        ),
      ownerStackTraceLimit = 10,
      currentOwnerInDEV = null,
      replayConsoleWithCallStack = {
        react_stack_bottom_frame: function (response, payload) {
          var methodName = payload[0],
            stackTrace = payload[1],
            owner = payload[2],
            env = payload[3];
          payload = payload.slice(4);
          var prevStack = ReactSharedInternals.getCurrentStack;
          ReactSharedInternals.getCurrentStack = getCurrentStackInDEV;
          currentOwnerInDEV = null === owner ? response._debugRootOwner : owner;
          try {
            a: {
              var offset = 0;
              switch (methodName) {
                case "dir":
                case "dirxml":
                case "groupEnd":
                case "table":
                  var JSCompiler_inline_result = bind$1.apply(
                    console[methodName],
                    [console].concat(payload)
                  );
                  break a;
                case "assert":
                  offset = 1;
              }
              var newArgs = payload.slice(0);
              "string" === typeof newArgs[offset]
                ? newArgs.splice(
                    offset,
                    1,
                    "\u001b[0m\u001b[7m%c%s\u001b[0m%c " + newArgs[offset],
                    "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
                    " " + env + " ",
                    ""
                  )
                : newArgs.splice(
                    offset,
                    0,
                    "\u001b[0m\u001b[7m%c%s\u001b[0m%c",
                    "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px",
                    " " + env + " ",
                    ""
                  );
              newArgs.unshift(console);
              JSCompiler_inline_result = bind$1.apply(
                console[methodName],
                newArgs
              );
            }
            var callStack = buildFakeCallStack$1(
              response,
              stackTrace,
              env,
              !1,
              JSCompiler_inline_result
            );
            if (null != owner) {
              var task = initializeFakeTask(response, owner);
              initializeFakeStack(response, owner);
              if (null !== task) {
                task.run(callStack);
                return;
              }
            }
            var rootTask = getRootTask$1(response, env);
            null != rootTask ? rootTask.run(callStack) : callStack();
          } finally {
            (currentOwnerInDEV = null),
              (ReactSharedInternals.getCurrentStack = prevStack);
          }
        }
      },
      replayConsoleWithCallStackInDEV =
        replayConsoleWithCallStack.react_stack_bottom_frame.bind(
          replayConsoleWithCallStack
        ),
      RESULT_MODEL_TYPE = Symbol.for("react.result.model");
    ReactPromise$1.prototype = Object.create(Promise.prototype);
    Object.defineProperty(ReactPromise$1.prototype, "then", {
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
    var ObjectPrototype = Object.prototype,
      supportsCreateTask = !!console.createTask;
    ReactPromise.prototype = Object.create(Promise.prototype);
    Object.defineProperty(ReactPromise.prototype, "then", {
      writable: !0,
      enumerable: !0,
      configurable: !0,
      value: function (resolve, reject) {
        "resolved_model" === this.status
          ? initializeResolvedModelChunk(this)
          : "resolved_module" === this.status && initializeModuleChunk(this);
        switch (this.status) {
          case "fulfilled":
            "function" === typeof resolve && resolve(this.value);
            break;
          case "pending":
          case "pending_weak":
          case "blocked":
            "function" === typeof resolve &&
              (null === this.value && (this.value = []),
              this.value.push(resolve));
            "function" === typeof reject &&
              (null === this.reason && (this.reason = []),
              this.reason.push(reject));
            break;
          case "halted":
            break;
          default:
            "function" === typeof reject && reject(this.reason);
        }
      }
    });
    var fakeFunctionCache = new Map(),
      fakeFunctionIdx = 0,
      CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");
    exports.createFromFetch = function (promiseForResponse, options) {
      var response = createResponseFromOptions(options);
      promiseForResponse.then(
        function (r) {
          if (
            options &&
            options.debugChannel &&
            options.debugChannel.readable
          ) {
            var streamDoneCount = 0,
              handleDone = function () {
                2 === ++streamDoneCount && close(response);
              };
            startReadingFromStream$1(
              response,
              options.debugChannel.readable,
              handleDone
            );
            startReadingFromStream$1(response, r.body, handleDone, r);
          } else
            startReadingFromStream$1(
              response,
              r.body,
              close.bind(null, response),
              r
            );
        },
        function (e) {
          reportGlobalError$1(response, e);
        }
      );
      return getRoot$1(response);
    };
    exports.createFromNodeStream = function (
      stream,
      serverConsumerManifest,
      options
    ) {
      var response = createResponse$1(
        serverConsumerManifest.moduleMap,
        serverConsumerManifest.serverModuleMap,
        serverConsumerManifest.moduleLoading,
        noServerCall$1,
        options ? options.encodeFormAction : void 0,
        options && "string" === typeof options.nonce ? options.nonce : void 0,
        void 0,
        options && options.unstable_allowPartialStream
          ? options.unstable_allowPartialStream
          : !1,
        options && options.findSourceMapURL ? options.findSourceMapURL : void 0,
        options ? !0 === options.replayConsoleLogs : !1,
        options && options.environmentName ? options.environmentName : void 0,
        options && null != options.startTime ? options.startTime : void 0,
        options && null != options.endTime ? options.endTime : void 0,
        options && void 0 !== options.debugChannel
          ? { hasReadable: !0, callback: null }
          : void 0
      );
      if (options && options.debugChannel) {
        var streamEndedCount = 0;
        serverConsumerManifest = function () {
          2 === ++streamEndedCount && close(response);
        };
        startReadingFromStream(
          response,
          options.debugChannel,
          serverConsumerManifest
        );
        startReadingFromStream(response, stream, serverConsumerManifest);
      } else
        startReadingFromStream(response, stream, close.bind(null, response));
      return getRoot$1(response);
    };
    exports.createFromReadableStream = function (stream, options) {
      var response = createResponseFromOptions(options);
      if (options && options.debugChannel && options.debugChannel.readable) {
        var streamDoneCount = 0,
          handleDone = function () {
            2 === ++streamDoneCount && close(response);
          };
        startReadingFromStream$1(
          response,
          options.debugChannel.readable,
          handleDone
        );
        startReadingFromStream$1(response, stream, handleDone, stream);
      } else
        startReadingFromStream$1(
          response,
          stream,
          close.bind(null, response),
          stream
        );
      return getRoot$1(response);
    };
    exports.createFromResult = function (result, options) {
      var manifest = options.serverConsumerManifest,
        response = createResponse(
          result,
          manifest.moduleMap,
          manifest.serverModuleMap,
          manifest.moduleLoading,
          function (value) {
            if (value.$$typeof !== CLIENT_REFERENCE_TAG) return null;
            var config = options.clientManifest,
              modulePath = value.$$id,
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
            if (!0 === resolvedModuleData.async && !0 === value.$$async)
              throw Error(
                'The module "' +
                  modulePath +
                  '" is marked as an async ESM module but was loaded as a CJS proxy. This is probably a bug in the React Server Components bundler.'
              );
            value =
              !0 === resolvedModuleData.async || !0 === value.$$async
                ? [resolvedModuleData.id, resolvedModuleData.chunks, name, 1]
                : [resolvedModuleData.id, resolvedModuleData.chunks, name];
            return value;
          },
          noServerCall,
          options.encodeFormAction,
          options.nonce,
          options.temporaryReferences,
          options.onError,
          !0 === options.unstable_allowPartialStream,
          options.findSourceMapURL,
          options.environmentName
        ),
        signal = options.signal;
      if (void 0 !== signal) {
        var onAbort = function () {
          return stopReading(response, signal.reason);
        };
        signal.aborted
          ? onAbort()
          : (signal.addEventListener("abort", onAbort, { once: !0 }),
            addResponseCleanup(response, function () {
              return signal.removeEventListener("abort", onAbort);
            }));
      }
      return readResult(response, result);
    };
    exports.createServerReference = function (id) {
      return createServerReference$1(id, noServerCall$2);
    };
    exports.createTemporaryReferenceSet = function () {
      return new Map();
    };
    exports.encodeReply = function (value, options) {
      return new Promise(function (resolve, reject) {
        processReply(
          value,
          "",
          options && options.temporaryReferences
            ? options.temporaryReferences
            : void 0,
          resolve,
          reject,
          options ? options.signal : void 0
        );
      });
    };
    exports.registerServerReference = function (
      reference,
      id,
      encodeFormAction
    ) {
      registerBoundServerReference(reference, id, null, encodeFormAction);
      return reference;
    };
  })();
