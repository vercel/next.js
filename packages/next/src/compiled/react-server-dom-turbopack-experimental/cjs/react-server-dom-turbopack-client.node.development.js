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
    function prepareDestinationWithChunks(
      moduleLoading,
      chunks,
      nonce$jscomp$0
    ) {
      if (null !== moduleLoading)
        for (var i = 0; i < chunks.length; i++) {
          var nonce = nonce$jscomp$0,
            JSCompiler_temp_const = ReactDOMSharedInternals.d,
            JSCompiler_temp_const$jscomp$0 = JSCompiler_temp_const.X,
            JSCompiler_temp_const$jscomp$1 = moduleLoading.prefix + chunks[i];
          var JSCompiler_inline_result = moduleLoading.crossOrigin;
          JSCompiler_inline_result =
            "string" === typeof JSCompiler_inline_result
              ? "use-credentials" === JSCompiler_inline_result
                ? JSCompiler_inline_result
                : ""
              : void 0;
          JSCompiler_temp_const$jscomp$0.call(
            JSCompiler_temp_const,
            JSCompiler_temp_const$jscomp$1,
            { crossOrigin: JSCompiler_inline_result, nonce: nonce }
          );
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
              var _partJSON = JSON.stringify(entry.value, resolveToJSON);
              data.append(formFieldPrefix + streamId, _partJSON);
              iterator.next().then(progress, reject);
            } catch (x$0) {
              reject(x$0);
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
                "React Element cannot be passed to Server Functions from the Client without a temporary reference set. Pass a TemporaryReferenceSet to the options." +
                  describeObjectForErrorMessage(this, key)
              );
            case REACT_LAZY_TYPE:
              originalValue = value._payload;
              var init = value._init;
              null === formData && (formData = new FormData());
              pendingParts++;
              try {
                parentReference = init(originalValue);
                var lazyId = nextPartId++,
                  partJSON = serializeModel(parentReference, lazyId);
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
                  parentReference = function () {
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
                  x.then(parentReference, parentReference);
                  return "$" + _lazyId.toString(16);
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
                var _partJSON3 = serializeModel(partValue, promiseId);
                partValue = formData;
                partValue.append(formFieldPrefix + promiseId, _partJSON3);
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
                ((parentReference = parentReference + ":" + key),
                writtenObjects.set(value, parentReference),
                void 0 !== temporaryReferences &&
                  temporaryReferences.set(parentReference, value)));
          if (isArrayImpl(value)) return value;
          if (value instanceof FormData) {
            null === formData && (formData = new FormData());
            var _data3 = formData;
            key = nextPartId++;
            var prefix = formFieldPrefix + key + "_";
            value.forEach(function (originalValue, originalKey) {
              _data3.append(prefix + originalKey, originalValue);
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
          if ((parentReference = getIteratorFn(value)))
            return (
              (parentReference = parentReference.call(value)),
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
          parentReference = value[ASYNC_ITERATOR];
          if ("function" === typeof parentReference)
            return serializeAsyncIterable(value, parentReference.call(value));
          parentReference = getPrototypeOf(value);
          if (
            parentReference !== ObjectPrototype &&
            (null === parentReference ||
              null !== getPrototypeOf(parentReference))
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
                  ((parentReference = Object.getOwnPropertySymbols(value)),
                  0 < parentReference.length &&
                    console.error(
                      "Only plain objects can be passed to Server Functions from the Client. Objects with symbol properties like %s are not supported.%s",
                      parentReference[0].description,
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
      var nextPartId = 1,
        pendingParts = 0,
        formData = null,
        writtenObjects = new WeakMap(),
        modelRoot = root,
        json = serializeModel(root, 0);
      null === formData
        ? resolve(json)
        : (formData.set(formFieldPrefix + "0", json),
          0 === pendingParts && resolve(formData));
      return function () {
        0 < pendingParts &&
          ((pendingParts = 0),
          null === formData ? resolve(json) : resolve(formData));
      };
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
            "\n//# sourceURL=rsc://React/" +
            encodeURIComponent(environmentName) +
            "/" +
            filename +
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
      reference$jscomp$0,
      id,
      bound,
      encodeFormAction
    ) {
      Object.defineProperties(reference$jscomp$0, {
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
      knownServerReferences.set(reference$jscomp$0, { id: id, bound: bound });
    }
    function bind() {
      var newFn = FunctionBind.apply(this, arguments),
        reference = knownServerReferences.get(this);
      if (reference) {
        null != arguments[0] &&
          console.error(
            'Cannot bind "this" of a Server Action. Pass null or undefined as the first argument to .bind().'
          );
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
        knownServerReferences.set(newFn, {
          id: reference.id,
          bound: boundPromise
        });
      }
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
    function prepareStackTrace(error, structuredStackTrace) {
      error = (error.name || "Error") + ": " + (error.message || "");
      for (var i = 0; i < structuredStackTrace.length; i++)
        error += "\n    at " + structuredStackTrace[i].toString();
      return error;
    }
    function ReactPromise(status, value, reason, response) {
      this.status = status;
      this.value = value;
      this.reason = reason;
      this._response = response;
      this._children = [];
      this._debugInfo = null;
    }
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
      return new ReactPromise("pending", null, null, response);
    }
    function createErrorChunk(response, error) {
      return new ReactPromise("rejected", null, error, response);
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
      return new ReactPromise(
        "resolved_model",
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}",
        null,
        response
      );
    }
    function resolveIteratorResultChunk(chunk, value, done) {
      resolveModelChunk(
        chunk,
        (done ? '{"done":true,"value":' : '{"done":false,"value":') +
          value +
          "}"
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
    function resolveModuleChunk(chunk, value) {
      if ("pending" === chunk.status || "blocked" === chunk.status) {
        var resolveListeners = chunk.value,
          rejectListeners = chunk.reason;
        chunk.status = "resolved_module";
        chunk.value = value;
        null !== resolveListeners &&
          (initializeModuleChunk(chunk),
          wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners));
      }
    }
    function initializeModelChunk(chunk) {
      var prevHandler = initializingHandler,
        prevChunk = initializingChunk;
      initializingHandler = null;
      var resolvedModel = chunk.value;
      chunk.status = "blocked";
      chunk.value = null;
      chunk.reason = null;
      initializingChunk = chunk;
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
        (initializingHandler = prevHandler), (initializingChunk = prevChunk);
      }
    }
    function initializeModuleChunk(chunk) {
      try {
        var value = requireModule(chunk.value);
        chunk.status = "fulfilled";
        chunk.value = value;
      } catch (error) {
        (chunk.status = "rejected"), (chunk.reason = error);
      }
    }
    function reportGlobalError(response, error) {
      response._closed = !0;
      response._closedReason = error;
      response._chunks.forEach(function (chunk) {
        "pending" === chunk.status && triggerErrorOnChunk(chunk, error);
      });
      supportsUserTiming &&
        performance.mark("Server Components Track", componentsTrackMarker);
      flushComponentPerformance(
        response,
        getChunk(response, 0),
        0,
        -Infinity,
        -Infinity
      );
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
        return type._init === readChunk ? '"use client"' : "<...>";
      try {
        var name = getComponentNameFromType(type);
        return name ? "<" + name + ">" : "<...>";
      } catch (x) {
        return "<...>";
      }
    }
    function createLazyChunkWrapper(chunk) {
      var lazyType = {
        $$typeof: REACT_LAZY_TYPE,
        _payload: chunk,
        _init: readChunk
      };
      chunk = chunk._debugInfo || (chunk._debugInfo = []);
      lazyType._debugInfo = chunk;
      return lazyType;
    }
    function getChunk(response, id) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk ||
        ((chunk = response._closed
          ? createErrorChunk(response, response._closedReason)
          : createPendingChunk(response)),
        chunks.set(id, chunk));
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
        i = map(response, value, parentObject, key);
        parentObject[key] = i;
        "" === key && null === handler.value && (handler.value = i);
        if (
          parentObject[0] === REACT_ELEMENT_TYPE &&
          "object" === typeof handler.value &&
          null !== handler.value &&
          handler.value.$$typeof === REACT_ELEMENT_TYPE
        )
          switch (((value = handler.value), key)) {
            case "3":
              value.props = i;
              break;
            case "4":
              value._owner = i;
          }
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
          var blockedValue = handler.value;
          handler.errored = !0;
          handler.value = error;
          var chunk = handler.chunk;
          if (null !== chunk && "blocked" === chunk.status) {
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
              supportsCreateTask &&
                (erroredComponent.debugTask = blockedValue._debugTask);
              (chunk._debugInfo || (chunk._debugInfo = [])).push(
                erroredComponent
              );
            }
            triggerErrorOnChunk(chunk, error);
          }
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
    function loadServerReference(response, metaData, parentObject, key) {
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
          parentObject[key] = resolvedValue;
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
          0 === handler.deps &&
            ((resolvedValue = handler.chunk),
            null !== resolvedValue &&
              "blocked" === resolvedValue.status &&
              ((boundArgs = resolvedValue.value),
              (resolvedValue.status = "fulfilled"),
              (resolvedValue.value = handler.value),
              null !== boundArgs && wakeChunk(boundArgs, handler.value)));
        },
        function (error) {
          if (!handler.errored) {
            var blockedValue = handler.value;
            handler.errored = !0;
            handler.value = error;
            var chunk = handler.chunk;
            if (null !== chunk && "blocked" === chunk.status) {
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
                supportsCreateTask &&
                  (erroredComponent.debugTask = blockedValue._debugTask);
                (chunk._debugInfo || (chunk._debugInfo = [])).push(
                  erroredComponent
                );
              }
              triggerErrorOnChunk(chunk, error);
            }
          }
        }
      );
      return null;
    }
    function getOutlinedModel(response, reference, parentObject, key, map) {
      reference = reference.split(":");
      var id = parseInt(reference[0], 16);
      id = getChunk(response, id);
      null !== initializingChunk &&
        isArrayImpl(initializingChunk._children) &&
        initializingChunk._children.push(id);
      switch (id.status) {
        case "resolved_model":
          initializeModelChunk(id);
          break;
        case "resolved_module":
          initializeModuleChunk(id);
      }
      switch (id.status) {
        case "fulfilled":
          for (var value = id.value, i = 1; i < reference.length; i++) {
            for (; value.$$typeof === REACT_LAZY_TYPE; )
              if (((value = value._payload), "fulfilled" === value.status))
                value = value.value;
              else
                return waitForReference(
                  value,
                  parentObject,
                  key,
                  response,
                  map,
                  reference.slice(i - 1)
                );
            value = value[reference[i]];
          }
          response = map(response, value, parentObject, key);
          id._debugInfo &&
            ("object" !== typeof response ||
              null === response ||
              (!isArrayImpl(response) &&
                "function" !== typeof response[ASYNC_ITERATOR] &&
                response.$$typeof !== REACT_ELEMENT_TYPE) ||
              response._debugInfo ||
              Object.defineProperty(response, "_debugInfo", {
                configurable: !1,
                enumerable: !1,
                writable: !0,
                value: id._debugInfo
              }));
          return response;
        case "pending":
        case "blocked":
          return waitForReference(
            id,
            parentObject,
            key,
            response,
            map,
            reference
          );
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
              null !== initializingChunk &&
                isArrayImpl(initializingChunk._children) &&
                initializingChunk._children.push(response),
              createLazyChunkWrapper(response)
            );
          case "@":
            if (2 === value.length) return new Promise(function () {});
            parentObject = parseInt(value.slice(2), 16);
            response = getChunk(response, parentObject);
            null !== initializingChunk &&
              isArrayImpl(initializingChunk._children) &&
              initializingChunk._children.push(response);
            return response;
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
                loadServerReference
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
              getOutlinedModel(
                response,
                value,
                parentObject,
                key,
                createFormData
              )
            );
          case "Z":
            return (
              (value = value.slice(2)),
              getOutlinedModel(
                response,
                value,
                parentObject,
                key,
                resolveErrorDev
              )
            );
          case "i":
            return (
              (value = value.slice(2)),
              getOutlinedModel(
                response,
                value,
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
          case "E":
            try {
              return (0, eval)(value.slice(2));
            } catch (x) {
              return function () {};
            }
          case "Y":
            return (
              Object.defineProperty(parentObject, key, {
                get: function () {
                  return "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects.";
                },
                enumerable: !0,
                configurable: !1
              }),
              null
            );
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
      serverReferenceConfig,
      moduleLoading,
      callServer,
      encodeFormAction,
      nonce,
      temporaryReferences,
      findSourceMapURL,
      replayConsole,
      environmentName
    ) {
      var chunks = new Map();
      this._bundlerConfig = bundlerConfig;
      this._serverReferenceConfig = serverReferenceConfig;
      this._moduleLoading = moduleLoading;
      this._callServer = void 0 !== callServer ? callServer : missingCall;
      this._encodeFormAction = encodeFormAction;
      this._nonce = nonce;
      this._chunks = chunks;
      this._stringDecoder = new util.TextDecoder();
      this._fromJSON = null;
      this._rowLength = this._rowTag = this._rowID = this._rowState = 0;
      this._buffer = [];
      this._closed = !1;
      this._closedReason = null;
      this._tempRefs = temporaryReferences;
      this._timeOrigin = 0;
      this._debugRootOwner = bundlerConfig =
        void 0 === ReactSharedInteralsServer ||
        null === ReactSharedInteralsServer.A
          ? null
          : ReactSharedInteralsServer.A.getOwner();
      this._debugRootStack =
        null !== bundlerConfig ? Error("react-stack-top-frame") : null;
      environmentName = void 0 === environmentName ? "Server" : environmentName;
      supportsCreateTask &&
        (this._debugRootTask = console.createTask(
          '"use ' + environmentName.toLowerCase() + '"'
        ));
      this._debugFindSourceMapURL = findSourceMapURL;
      this._replayConsole = replayConsole;
      this._rootEnvironmentName = environmentName;
      this._fromJSON = createFromJSONCallback(this);
    }
    function resolveModel(response, id, model) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk
        ? resolveModelChunk(chunk, model)
        : chunks.set(
            id,
            new ReactPromise("resolved_model", model, null, response)
          );
    }
    function resolveText(response, id, text) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk && "pending" !== chunk.status
        ? chunk.reason.enqueueValue(text)
        : chunks.set(id, new ReactPromise("fulfilled", text, null, response));
    }
    function resolveBuffer(response, id, buffer) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      chunk && "pending" !== chunk.status
        ? chunk.reason.enqueueValue(buffer)
        : chunks.set(id, new ReactPromise("fulfilled", buffer, null, response));
    }
    function resolveModule(response, id, model) {
      var chunks = response._chunks,
        chunk = chunks.get(id);
      model = JSON.parse(model, response._fromJSON);
      var clientReference = resolveClientReference(
        response._bundlerConfig,
        model
      );
      prepareDestinationWithChunks(
        response._moduleLoading,
        model[1],
        response._nonce
      );
      if ((model = preloadModule(clientReference))) {
        if (chunk) {
          var blockedChunk = chunk;
          blockedChunk.status = "blocked";
        } else
          (blockedChunk = new ReactPromise("blocked", null, null, response)),
            chunks.set(id, blockedChunk);
        model.then(
          function () {
            return resolveModuleChunk(blockedChunk, clientReference);
          },
          function (error) {
            return triggerErrorOnChunk(blockedChunk, error);
          }
        );
      } else
        chunk
          ? resolveModuleChunk(chunk, clientReference)
          : chunks.set(
              id,
              new ReactPromise(
                "resolved_module",
                clientReference,
                null,
                response
              )
            );
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
        : chunks.set(
            id,
            new ReactPromise("fulfilled", stream, controller, response)
          );
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
            var chunk = new ReactPromise(
              "resolved_model",
              json,
              null,
              response
            );
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
            var _chunk3 = createPendingChunk(response);
            _chunk3.then(
              function (v) {
                return controller.enqueue(v);
              },
              function (e) {
                return controller.error(e);
              }
            );
            previousBlockedChunk = _chunk3;
            chunk.then(function () {
              previousBlockedChunk === _chunk3 && (previousBlockedChunk = null);
              resolveModelChunk(_chunk3, json);
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
        iterable = _defineProperty({}, ASYNC_ITERATOR, function () {
          var nextReadIndex = 0;
          return createIterator(function (arg) {
            if (void 0 !== arg)
              throw Error(
                "Values cannot be passed to next() of AsyncIterables passed to Client Components."
              );
            if (nextReadIndex === buffer.length) {
              if (closed)
                return new ReactPromise(
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
      resolveStream(
        response,
        id,
        iterator ? iterable[ASYNC_ITERATOR]() : iterable,
        {
          enqueueValue: function (value) {
            if (nextWriteIndex === buffer.length)
              buffer[nextWriteIndex] = new ReactPromise(
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
                wakeChunkIfInitialized(
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
    function stopStream(response, id, row) {
      (response = response._chunks.get(id)) &&
        "fulfilled" === response.status &&
        response.reason.close("" === row ? '"$undefined"' : row);
    }
    function resolveErrorDev(response, errorInfo) {
      var name = errorInfo.name,
        env = errorInfo.env;
      errorInfo = buildFakeCallStack(
        response,
        errorInfo.stack,
        env,
        Error.bind(
          null,
          errorInfo.message ||
            "An error occurred in the Server Components render but no message was provided"
        )
      );
      response = getRootTask(response, env);
      response = null != response ? response.run(errorInfo) : errorInfo();
      response.name = name;
      response.environmentName = env;
      return response;
    }
    function resolvePostponeDev(response, id, reason, stack, env) {
      reason = buildFakeCallStack(
        response,
        stack,
        env,
        Error.bind(null, reason || "")
      );
      stack = response._debugRootTask;
      reason = null != stack ? stack.run(reason) : reason();
      reason.$$typeof = REACT_POSTPONE_TYPE;
      stack = response._chunks;
      (env = stack.get(id))
        ? triggerErrorOnChunk(env, reason)
        : stack.set(id, createErrorChunk(response, reason));
    }
    function resolveHint(response, code, model) {
      response = JSON.parse(model, response._fromJSON);
      model = ReactDOMSharedInternals.d;
      switch (code) {
        case "D":
          model.D(response);
          break;
        case "C":
          "string" === typeof response
            ? model.C(response)
            : model.C(response[0], response[1]);
          break;
        case "L":
          code = response[0];
          var as = response[1];
          3 === response.length
            ? model.L(code, as, response[2])
            : model.L(code, as);
          break;
        case "m":
          "string" === typeof response
            ? model.m(response)
            : model.m(response[0], response[1]);
          break;
        case "X":
          "string" === typeof response
            ? model.X(response)
            : model.X(response[0], response[1]);
          break;
        case "S":
          "string" === typeof response
            ? model.S(response)
            : model.S(
                response[0],
                0 === response[1] ? void 0 : response[1],
                3 === response.length ? response[2] : void 0
              );
          break;
        case "M":
          "string" === typeof response
            ? model.M(response)
            : model.M(response[0], response[1]);
      }
    }
    function createFakeFunction(
      name,
      filename,
      sourceMap,
      line,
      col,
      environmentName
    ) {
      name || (name = "<anonymous>");
      var encodedName = JSON.stringify(name);
      1 >= line
        ? ((line = encodedName.length + 7),
          (col =
            "({" +
            encodedName +
            ":_=>" +
            " ".repeat(col < line ? 0 : col - line) +
            "_()})\n/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */"))
        : (col =
            "/* This module was rendered by a Server Component. Turn on Source Maps to see the server source. */" +
            "\n".repeat(line - 2) +
            "({" +
            encodedName +
            ":_=>\n" +
            " ".repeat(1 > col ? 0 : col - 1) +
            "_()})");
      filename.startsWith("/") && (filename = "file://" + filename);
      sourceMap
        ? ((col +=
            "\n//# sourceURL=rsc://React/" +
            encodeURIComponent(environmentName) +
            "/" +
            encodeURI(filename) +
            "?" +
            fakeFunctionIdx++),
          (col += "\n//# sourceMappingURL=" + sourceMap))
        : (col = filename
            ? col + ("\n//# sourceURL=" + encodeURI(filename))
            : col + "\n//# sourceURL=<anonymous>");
      try {
        var fn = (0, eval)(col)[name];
      } catch (x) {
        fn = function (_) {
          return _();
        };
      }
      return fn;
    }
    function buildFakeCallStack(response, stack, environmentName, innerCall) {
      for (var i = 0; i < stack.length; i++) {
        var frame = stack[i],
          frameKey = frame.join("-") + "-" + environmentName,
          fn = fakeFunctionCache.get(frameKey);
        if (void 0 === fn) {
          fn = frame[0];
          var filename = frame[1],
            line = frame[2];
          frame = frame[3];
          var findSourceMapURL = response._debugFindSourceMapURL;
          findSourceMapURL = findSourceMapURL
            ? findSourceMapURL(filename, environmentName)
            : null;
          fn = createFakeFunction(
            fn,
            filename,
            findSourceMapURL,
            line,
            frame,
            environmentName
          );
          fakeFunctionCache.set(frameKey, fn);
        }
        innerCall = fn.bind(null, innerCall);
      }
      return innerCall;
    }
    function getRootTask(response, childEnvironmentName) {
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
    function initializeFakeTask(response, debugInfo, childEnvironmentName) {
      if (!supportsCreateTask || null == debugInfo.stack) return null;
      var stack = debugInfo.stack,
        env =
          null == debugInfo.env ? response._rootEnvironmentName : debugInfo.env;
      if (env !== childEnvironmentName)
        return (
          (debugInfo =
            null == debugInfo.owner
              ? null
              : initializeFakeTask(response, debugInfo.owner, env)),
          buildFakeTask(
            response,
            debugInfo,
            stack,
            '"use ' + childEnvironmentName.toLowerCase() + '"',
            env
          )
        );
      childEnvironmentName = debugInfo.debugTask;
      if (void 0 !== childEnvironmentName) return childEnvironmentName;
      childEnvironmentName =
        null == debugInfo.owner
          ? null
          : initializeFakeTask(response, debugInfo.owner, env);
      return (debugInfo.debugTask = buildFakeTask(
        response,
        childEnvironmentName,
        stack,
        "<" + (debugInfo.name || "...") + ">",
        env
      ));
    }
    function buildFakeTask(response, ownerTask, stack, taskName, env) {
      taskName = console.createTask.bind(console, taskName);
      stack = buildFakeCallStack(response, stack, env, taskName);
      return null === ownerTask
        ? ((response = getRootTask(response, env)),
          null != response ? response.run(stack) : stack())
        : ownerTask.run(stack);
    }
    function fakeJSXCallSite() {
      return Error("react-stack-top-frame");
    }
    function initializeFakeStack(response, debugInfo) {
      void 0 === debugInfo.debugStack &&
        (null != debugInfo.stack &&
          (debugInfo.debugStack = createFakeJSXCallStackInDEV(
            response,
            debugInfo.stack,
            null == debugInfo.env ? "" : debugInfo.env
          )),
        null != debugInfo.owner &&
          initializeFakeStack(response, debugInfo.owner));
    }
    function resolveDebugInfo(response, id, debugInfo) {
      var env =
        void 0 === debugInfo.env
          ? response._rootEnvironmentName
          : debugInfo.env;
      void 0 !== debugInfo.stack &&
        initializeFakeTask(response, debugInfo, env);
      null === debugInfo.owner && null != response._debugRootOwner
        ? ((env = debugInfo),
          (env.owner = response._debugRootOwner),
          (env.debugStack = response._debugRootStack))
        : void 0 !== debugInfo.stack &&
          initializeFakeStack(response, debugInfo);
      "number" === typeof debugInfo.time &&
        (debugInfo = { time: debugInfo.time + response._timeOrigin });
      response = getChunk(response, id);
      (response._debugInfo || (response._debugInfo = [])).push(debugInfo);
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
                idx = stack.indexOf("react-stack-bottom-frame");
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
    function resolveConsoleEntry(response, value) {
      if (response._replayConsole) {
        var payload = JSON.parse(value, response._fromJSON);
        value = payload[0];
        var stackTrace = payload[1],
          owner = payload[2],
          env = payload[3];
        payload = payload.slice(4);
        replayConsoleWithCallStackInDEV(
          response,
          value,
          stackTrace,
          owner,
          env,
          payload
        );
      }
    }
    function mergeBuffer(buffer, lastChunk) {
      for (
        var l = buffer.length, byteLength = lastChunk.length, i = 0;
        i < l;
        i++
      )
        byteLength += buffer[i].byteLength;
      byteLength = new Uint8Array(byteLength);
      for (var _i2 = (i = 0); _i2 < l; _i2++) {
        var chunk = buffer[_i2];
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
      bytesPerElement
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
      resolveBuffer(response, id, constructor);
    }
    function flushComponentPerformance(
      response,
      root,
      trackIdx$jscomp$0,
      trackTime,
      parentEndTime
    ) {
      if (!isArrayImpl(root._children)) {
        response = root._children;
        root = response.endTime;
        if (
          -Infinity < parentEndTime &&
          parentEndTime < root &&
          null !== response.component
        ) {
          var trackIdx = trackIdx$jscomp$0,
            startTime = parentEndTime;
          if (supportsUserTiming && 0 <= root && 10 > trackIdx) {
            var name = response.component.name;
            reusableComponentDevToolDetails.color = "tertiary-light";
            reusableComponentDevToolDetails.track = trackNames[trackIdx];
            reusableComponentOptions.start = 0 > startTime ? 0 : startTime;
            reusableComponentOptions.end = root;
            performance.measure(name + " [deduped]", reusableComponentOptions);
          }
        }
        response.track = trackIdx$jscomp$0;
        return response;
      }
      var children = root._children;
      "resolved_model" === root.status && initializeModelChunk(root);
      if ((trackIdx = root._debugInfo)) {
        for (startTime = 1; startTime < trackIdx.length; startTime++)
          if (
            "string" === typeof trackIdx[startTime].name &&
            ((name = trackIdx[startTime - 1]), "number" === typeof name.time)
          ) {
            startTime = name.time;
            startTime < trackTime && trackIdx$jscomp$0++;
            trackTime = startTime;
            break;
          }
        for (startTime = trackIdx.length - 1; 0 <= startTime; startTime--)
          (name = trackIdx[startTime]),
            "number" === typeof name.time &&
              name.time > parentEndTime &&
              (parentEndTime = name.time);
      }
      startTime = {
        track: trackIdx$jscomp$0,
        endTime: -Infinity,
        component: null
      };
      root._children = startTime;
      name = -Infinity;
      var childTrackIdx = trackIdx$jscomp$0,
        childTrackTime = trackTime;
      for (trackTime = 0; trackTime < children.length; trackTime++) {
        childTrackTime = flushComponentPerformance(
          response,
          children[trackTime],
          childTrackIdx,
          childTrackTime,
          parentEndTime
        );
        null !== childTrackTime.component &&
          (startTime.component = childTrackTime.component);
        childTrackIdx = childTrackTime.track;
        var childEndTime = childTrackTime.endTime;
        childTrackTime = childEndTime;
        childEndTime > name && (name = childEndTime);
      }
      if (trackIdx)
        for (
          parentEndTime = 0, childTrackIdx = !0, children = trackIdx.length - 1;
          0 <= children;
          children--
        )
          if (
            ((trackTime = trackIdx[children]),
            "number" === typeof trackTime.time &&
              ((parentEndTime = trackTime.time),
              parentEndTime > name && (name = parentEndTime)),
            "string" === typeof trackTime.name && 0 < children)
          ) {
            childTrackTime = trackIdx[children - 1];
            if ("number" === typeof childTrackTime.time) {
              childTrackTime = childTrackTime.time;
              if (
                childTrackIdx &&
                "rejected" === root.status &&
                root.reason !== response._closedReason
              ) {
                var componentInfo = trackTime;
                childTrackIdx = trackIdx$jscomp$0;
                childEndTime = name;
                var rootEnv = response._rootEnvironmentName,
                  error = root.reason;
                if (supportsUserTiming) {
                  var properties = [];
                  properties.push([
                    "Error",
                    "object" === typeof error &&
                    null !== error &&
                    "string" === typeof error.message
                      ? String(error.message)
                      : String(error)
                  ]);
                  error = componentInfo.env;
                  componentInfo = componentInfo.name;
                  componentInfo =
                    error === rootEnv || void 0 === error
                      ? componentInfo
                      : componentInfo + " [" + error + "]";
                  performance.measure(componentInfo, {
                    start: 0 > childTrackTime ? 0 : childTrackTime,
                    end: childEndTime,
                    detail: {
                      devtools: {
                        color: "error",
                        track: trackNames[childTrackIdx],
                        trackGroup: "Server Components \u269b",
                        tooltipText: componentInfo + " Errored",
                        properties: properties
                      }
                    }
                  });
                }
              } else
                (childTrackIdx = trackIdx$jscomp$0),
                  (childEndTime = name),
                  supportsUserTiming &&
                    0 <= childEndTime &&
                    10 > childTrackIdx &&
                    ((properties = trackTime.env),
                    (componentInfo = trackTime.name),
                    (rootEnv = properties === response._rootEnvironmentName),
                    (error = parentEndTime - childTrackTime),
                    (reusableComponentDevToolDetails.color =
                      0.5 > error
                        ? rootEnv
                          ? "primary-light"
                          : "secondary-light"
                        : 50 > error
                          ? rootEnv
                            ? "primary"
                            : "secondary"
                          : 500 > error
                            ? rootEnv
                              ? "primary-dark"
                              : "secondary-dark"
                            : "error"),
                    (reusableComponentDevToolDetails.track =
                      trackNames[childTrackIdx]),
                    (reusableComponentOptions.start =
                      0 > childTrackTime ? 0 : childTrackTime),
                    (reusableComponentOptions.end = childEndTime),
                    performance.measure(
                      rootEnv || void 0 === properties
                        ? componentInfo
                        : componentInfo + " [" + properties + "]",
                      reusableComponentOptions
                    ));
              startTime.component = trackTime;
            }
            childTrackIdx = !1;
          }
      startTime.endTime = name;
      return startTime;
    }
    function processFullBinaryRow(response, id, tag, buffer, chunk) {
      switch (tag) {
        case 65:
          resolveBuffer(response, id, mergeBuffer(buffer, chunk).buffer);
          return;
        case 79:
          resolveTypedArray(response, id, buffer, chunk, Int8Array, 1);
          return;
        case 111:
          resolveBuffer(
            response,
            id,
            0 === buffer.length ? chunk : mergeBuffer(buffer, chunk)
          );
          return;
        case 85:
          resolveTypedArray(response, id, buffer, chunk, Uint8ClampedArray, 1);
          return;
        case 83:
          resolveTypedArray(response, id, buffer, chunk, Int16Array, 2);
          return;
        case 115:
          resolveTypedArray(response, id, buffer, chunk, Uint16Array, 2);
          return;
        case 76:
          resolveTypedArray(response, id, buffer, chunk, Int32Array, 4);
          return;
        case 108:
          resolveTypedArray(response, id, buffer, chunk, Uint32Array, 4);
          return;
        case 71:
          resolveTypedArray(response, id, buffer, chunk, Float32Array, 4);
          return;
        case 103:
          resolveTypedArray(response, id, buffer, chunk, Float64Array, 8);
          return;
        case 77:
          resolveTypedArray(response, id, buffer, chunk, BigInt64Array, 8);
          return;
        case 109:
          resolveTypedArray(response, id, buffer, chunk, BigUint64Array, 8);
          return;
        case 86:
          resolveTypedArray(response, id, buffer, chunk, DataView, 1);
          return;
      }
      for (
        var stringDecoder = response._stringDecoder, row = "", i = 0;
        i < buffer.length;
        i++
      )
        row += stringDecoder.decode(buffer[i], decoderOptions);
      row += stringDecoder.decode(chunk);
      processFullStringRow(response, id, tag, row);
    }
    function processFullStringRow(response, id, tag, row) {
      switch (tag) {
        case 73:
          resolveModule(response, id, row);
          break;
        case 72:
          resolveHint(response, row[0], row.slice(1));
          break;
        case 69:
          row = JSON.parse(row);
          tag = resolveErrorDev(response, row);
          tag.digest = row.digest;
          row = response._chunks;
          var chunk = row.get(id);
          chunk
            ? triggerErrorOnChunk(chunk, tag)
            : row.set(id, createErrorChunk(response, tag));
          break;
        case 84:
          resolveText(response, id, row);
          break;
        case 78:
          response._timeOrigin = +row - performance.timeOrigin;
          break;
        case 68:
          tag = new ReactPromise("resolved_model", row, null, response);
          initializeModelChunk(tag);
          "fulfilled" === tag.status
            ? resolveDebugInfo(response, id, tag.value)
            : tag.then(
                function (v) {
                  return resolveDebugInfo(response, id, v);
                },
                function () {}
              );
          break;
        case 87:
          resolveConsoleEntry(response, row);
          break;
        case 82:
          startReadableStream(response, id, void 0);
          break;
        case 114:
          startReadableStream(response, id, "bytes");
          break;
        case 88:
          startAsyncIterable(response, id, !1);
          break;
        case 120:
          startAsyncIterable(response, id, !0);
          break;
        case 67:
          stopStream(response, id, row);
          break;
        case 80:
          tag = JSON.parse(row);
          resolvePostponeDev(response, id, tag.reason, tag.stack, tag.env);
          break;
        default:
          resolveModel(response, id, row);
      }
    }
    function createFromJSONCallback(response) {
      return function (key, value) {
        if ("string" === typeof value)
          return parseModelString(response, this, key, value);
        if ("object" === typeof value && null !== value) {
          if (value[0] === REACT_ELEMENT_TYPE) {
            var type = value[1];
            key = value[4];
            var stack = value[5],
              validated = value[6];
            value = {
              $$typeof: REACT_ELEMENT_TYPE,
              type: type,
              key: value[2],
              props: value[3],
              _owner: null === key ? response._debugRootOwner : key
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
              value: validated
            });
            Object.defineProperty(value, "_debugInfo", {
              configurable: !1,
              enumerable: !1,
              writable: !0,
              value: null
            });
            validated = response._rootEnvironmentName;
            null !== key && null != key.env && (validated = key.env);
            var normalizedStackTrace = null;
            null === key && null != response._debugRootStack
              ? (normalizedStackTrace = response._debugRootStack)
              : null !== stack &&
                (normalizedStackTrace = createFakeJSXCallStackInDEV(
                  response,
                  stack,
                  validated
                ));
            Object.defineProperty(value, "_debugStack", {
              configurable: !1,
              enumerable: !1,
              writable: !0,
              value: normalizedStackTrace
            });
            normalizedStackTrace = null;
            supportsCreateTask &&
              null !== stack &&
              ((type = console.createTask.bind(console, getTaskName(type))),
              (stack = buildFakeCallStack(response, stack, validated, type)),
              (type =
                null === key
                  ? null
                  : initializeFakeTask(response, key, validated)),
              null === type
                ? ((type = response._debugRootTask),
                  (normalizedStackTrace =
                    null != type ? type.run(stack) : stack()))
                : (normalizedStackTrace = type.run(stack)));
            Object.defineProperty(value, "_debugTask", {
              configurable: !1,
              enumerable: !1,
              writable: !0,
              value: normalizedStackTrace
            });
            null !== key && initializeFakeStack(response, key);
            null !== initializingHandler
              ? ((stack = initializingHandler),
                (initializingHandler = stack.parent),
                stack.errored
                  ? ((key = createErrorChunk(response, stack.value)),
                    (stack = {
                      name: getComponentNameFromType(value.type) || "",
                      owner: value._owner
                    }),
                    (stack.debugStack = value._debugStack),
                    supportsCreateTask && (stack.debugTask = value._debugTask),
                    (key._debugInfo = [stack]),
                    (value = createLazyChunkWrapper(key)))
                  : 0 < stack.deps &&
                    ((key = new ReactPromise("blocked", null, null, response)),
                    (stack.value = value),
                    (stack.chunk = key),
                    (value = Object.freeze.bind(Object, value.props)),
                    key.then(value, value),
                    (value = createLazyChunkWrapper(key))))
              : Object.freeze(value.props);
          }
          return value;
        }
        return value;
      };
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
      chunkCache = new Map(),
      ReactDOMSharedInternals =
        ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
      REACT_PORTAL_TYPE = Symbol.for("react.portal"),
      REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
      REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"),
      REACT_PROFILER_TYPE = Symbol.for("react.profiler");
    Symbol.for("react.provider");
    var REACT_CONSUMER_TYPE = Symbol.for("react.consumer"),
      REACT_CONTEXT_TYPE = Symbol.for("react.context"),
      REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
      REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
      REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
      REACT_MEMO_TYPE = Symbol.for("react.memo"),
      REACT_LAZY_TYPE = Symbol.for("react.lazy"),
      REACT_POSTPONE_TYPE = Symbol.for("react.postpone"),
      REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
      MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
      ASYNC_ITERATOR = Symbol.asyncIterator,
      isArrayImpl = Array.isArray,
      getPrototypeOf = Object.getPrototypeOf,
      jsxPropsParents = new WeakMap(),
      jsxChildrenParents = new WeakMap(),
      CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
      ObjectPrototype = Object.prototype,
      knownServerReferences = new WeakMap(),
      boundCache = new WeakMap(),
      fakeServerFunctionIdx = 0,
      FunctionBind = Function.prototype.bind,
      ArraySlice = Array.prototype.slice,
      v8FrameRegExp =
        /^ {3} at (?:(.+) \((.+):(\d+):(\d+)\)|(?:async )?(.+):(\d+):(\d+))$/,
      jscSpiderMonkeyFrameRegExp = /(?:(.*)@)?(.*):(\d+):(\d+)/,
      supportsUserTiming =
        "undefined" !== typeof performance &&
        "function" === typeof performance.measure,
      componentsTrackMarker = {
        startTime: 0.001,
        detail: {
          devtools: {
            color: "primary-light",
            track: "Primary",
            trackGroup: "Server Components \u269b"
          }
        }
      },
      reusableComponentDevToolDetails = {
        color: "primary",
        track: "",
        trackGroup: "Server Components \u269b"
      },
      reusableComponentOptions = {
        start: -0,
        end: -0,
        detail: { devtools: reusableComponentDevToolDetails }
      },
      trackNames =
        "Primary Parallel Parallel\u200b Parallel\u200b\u200b Parallel\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b\u200b".split(
          " "
        ),
      REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"),
      prefix,
      suffix;
    new ("function" === typeof WeakMap ? WeakMap : Map)();
    var ReactSharedInteralsServer =
        React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      ReactSharedInternals =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
        ReactSharedInteralsServer;
    ReactPromise.prototype = Object.create(Promise.prototype);
    ReactPromise.prototype.then = function (resolve, reject) {
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
            (null === this.value && (this.value = []),
            this.value.push(resolve));
          reject &&
            (null === this.reason && (this.reason = []),
            this.reason.push(reject));
          break;
        default:
          reject && reject(this.reason);
      }
    };
    var initializingHandler = null,
      initializingChunk = null,
      supportsCreateTask = !!console.createTask,
      fakeFunctionCache = new Map(),
      fakeFunctionIdx = 0,
      createFakeJSXCallStack = {
        "react-stack-bottom-frame": function (
          response,
          stack,
          environmentName
        ) {
          return buildFakeCallStack(
            response,
            stack,
            environmentName,
            fakeJSXCallSite
          )();
        }
      },
      createFakeJSXCallStackInDEV = createFakeJSXCallStack[
        "react-stack-bottom-frame"
      ].bind(createFakeJSXCallStack),
      currentOwnerInDEV = null,
      replayConsoleWithCallStack = {
        "react-stack-bottom-frame": function (
          response,
          methodName,
          stackTrace,
          owner,
          env,
          args
        ) {
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
                    [console].concat(args)
                  );
                  break a;
                case "assert":
                  offset = 1;
              }
              var newArgs = args.slice(0);
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
                    "\u001b[0m\u001b[7m%c%s\u001b[0m%c ",
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
            var callStack = buildFakeCallStack(
              response,
              stackTrace,
              env,
              JSCompiler_inline_result
            );
            if (null != owner) {
              var task = initializeFakeTask(response, owner, env);
              initializeFakeStack(response, owner);
              if (null !== task) {
                task.run(callStack);
                return;
              }
            }
            var rootTask = getRootTask(response, env);
            null != rootTask ? rootTask.run(callStack) : callStack();
          } finally {
            (currentOwnerInDEV = null),
              (ReactSharedInternals.getCurrentStack = prevStack);
          }
        }
      },
      replayConsoleWithCallStackInDEV = replayConsoleWithCallStack[
        "react-stack-bottom-frame"
      ].bind(replayConsoleWithCallStack);
    exports.createFromNodeStream = function (
      stream,
      serverConsumerManifest,
      options
    ) {
      var response = new ResponseInstance(
        serverConsumerManifest.moduleMap,
        serverConsumerManifest.serverModuleMap,
        serverConsumerManifest.moduleLoading,
        noServerCall,
        options ? options.encodeFormAction : void 0,
        options && "string" === typeof options.nonce ? options.nonce : void 0,
        void 0,
        options && options.findSourceMapURL ? options.findSourceMapURL : void 0,
        options ? !0 === options.replayConsoleLogs : !1,
        options && options.environmentName ? options.environmentName : void 0
      );
      stream.on("data", function (chunk) {
        for (
          var i = 0,
            rowState = response._rowState,
            rowID = response._rowID,
            rowTag = response._rowTag,
            rowLength = response._rowLength,
            buffer = response._buffer,
            chunkLength = chunk.length;
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
              processFullBinaryRow(response, rowID, rowTag, buffer, rowLength),
              (i = lastIdx),
              3 === rowState && i++,
              (rowLength = rowID = rowTag = rowState = 0),
              (buffer.length = 0);
          else {
            chunk = new Uint8Array(chunk.buffer, offset, chunk.byteLength - i);
            buffer.push(chunk);
            rowLength -= chunk.byteLength;
            break;
          }
        }
        response._rowState = rowState;
        response._rowID = rowID;
        response._rowTag = rowTag;
        response._rowLength = rowLength;
      });
      stream.on("error", function (error) {
        reportGlobalError(response, error);
      });
      stream.on("end", function () {
        reportGlobalError(response, Error("Connection closed."));
      });
      return getChunk(response, 0);
    };
    exports.createServerReference = function (id) {
      return createServerReference$1(id, noServerCall);
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
