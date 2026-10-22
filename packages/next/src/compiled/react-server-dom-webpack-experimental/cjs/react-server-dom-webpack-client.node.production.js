/**
 * @license React
 * react-server-dom-webpack-client.node.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var util = require("util"),
  ReactDOM = require("react-dom"),
  async_hooks = require("async_hooks");
function createStringDecoder() {
  return new util.TextDecoder("utf-8", {
    ignoreBOM:
      0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : !1
  });
}
var decoderOptions = { stream: !0 },
  hasOwnProperty = Object.prototype.hasOwnProperty;
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
function preloadModule(metadata) {
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
function prepareDestinationWithChunks(moduleLoading, chunks, nonce$jscomp$0) {
  if (null !== moduleLoading)
    for (var i = 1; i < chunks.length; i += 2) {
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
        {
          crossOrigin: JSCompiler_inline_result,
          integrity: void 0,
          fetchPriority: void 0,
          nonce: nonce
        }
      );
    }
}
var ReactDOMSharedInternals =
  ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
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
var REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"),
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
  REACT_MEMO_TYPE = Symbol.for("react.memo"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
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
  isArrayImpl = Array.isArray,
  getPrototypeOf = Object.getPrototypeOf;
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
var CLIENT_REFERENCE_TAG$1 = Symbol.for("react.client.reference");
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
    if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG$1) return "client";
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
var ObjectPrototype$2 = Object.prototype,
  knownServerReferences = new WeakMap(),
  knownServerObjectReferences = new WeakMap();
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
          data.append(streamPrefix, '"$o' + entry.toString(16) + '"'),
          data.append(streamPrefix, "C"),
          pendingParts--,
          0 === pendingParts && resolve(data))
        : (buffer.push(entry.value),
          reader.read(new Uint8Array(1024)).then(progress, reject));
    }
    null === formData && (formData = new FormData());
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++,
      buffer = [],
      streamPrefix = formFieldPrefix + "S" + streamId;
    reader.read(new Uint8Array(1024)).then(progress, reject);
    return "$r" + streamId.toString(16);
  }
  function serializeReader(reader) {
    function progress(entry) {
      if (entry.done)
        data.append(streamPrefix, "C"),
          pendingParts--,
          0 === pendingParts && resolve(data);
      else
        try {
          var partJSON = JSON.stringify(entry.value, resolveToJSON);
          data.append(streamPrefix, partJSON);
          reader.read().then(progress, reject);
        } catch (x) {
          reject(x);
        }
    }
    null === formData && (formData = new FormData());
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++,
      streamPrefix = formFieldPrefix + "S" + streamId;
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
        if (void 0 === entry.value) data.append(streamPrefix, "C");
        else
          try {
            var partJSON = JSON.stringify(entry.value, resolveToJSON);
            data.append(streamPrefix, "C" + partJSON);
          } catch (x) {
            reject(x);
            return;
          }
        pendingParts--;
        0 === pendingParts && resolve(data);
      } else
        try {
          var partJSON$30 = JSON.stringify(entry.value, resolveToJSON);
          data.append(streamPrefix, partJSON$30);
          iterator.next().then(progress, reject);
        } catch (x$31) {
          reject(x$31);
        }
    }
    null === formData && (formData = new FormData());
    var data = formData;
    pendingParts++;
    var streamId = nextPartId++;
    iterable = iterable === iterator;
    var streamPrefix = formFieldPrefix + "S" + streamId;
    iterator.next().then(progress, reject);
    return "$" + (iterable ? "x" : "X") + streamId.toString(16);
  }
  function resolveToJSON(key, value) {
    if (null === value) return null;
    if ("object" === typeof value) {
      var objectReferenceId = knownServerObjectReferences.get(value);
      if (void 0 !== objectReferenceId) {
        key = writtenObjects.get(value);
        if (void 0 !== key)
          if (modelRoot === value) modelRoot = null;
          else return key;
        key = JSON.stringify({ id: objectReferenceId }, resolveToJSON);
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
            "React Element cannot be passed to Server Functions from the Client without a temporary reference set. Pass a TemporaryReferenceSet to the options."
          );
        case REACT_LAZY_TYPE:
          objectReferenceId = value._payload;
          var init = value._init;
          null === formData && (formData = new FormData());
          pendingParts++;
          try {
            refId = init(objectReferenceId);
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
              var lazyId$32 = nextPartId++;
              refId = function () {
                try {
                  var partJSON$33 = serializeModel(value, lazyId$32),
                    data$34 = formData;
                  data$34.append(formFieldPrefix + lazyId$32, partJSON$33);
                  pendingParts--;
                  0 === pendingParts && resolve(data$34);
                } catch (reason) {
                  reject(reason);
                }
              };
              x.then(refId, refId);
              return "$" + lazyId$32.toString(16);
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
            var partJSON$37 =
              void 0 !== previousReference
                ? JSON.stringify(previousReference)
                : serializeModel(partValue, promiseId);
            partValue = formData;
            partValue.append(formFieldPrefix + promiseId, partJSON$37);
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
            ((key = refId + ":" + key),
            writtenObjects.set(value, key),
            void 0 !== temporaryReferences &&
              temporaryReferences.set(key, value)));
      if (isArrayImpl(value)) return value;
      if (value instanceof FormData) {
        null === formData && (formData = new FormData());
        var data$41 = formData;
        key = nextPartId++;
        var prefix = formFieldPrefix + "_" + key + "_";
        value.forEach(function (originalValue, originalKey) {
          data$41.append(prefix + originalKey, originalValue);
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
          (refId = key.call(value)),
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
      key = value[ASYNC_ITERATOR];
      if ("function" === typeof key)
        return serializeAsyncIterable(value, key.call(value));
      key = getPrototypeOf(value);
      if (
        key !== ObjectPrototype$2 &&
        (null === key || null !== getPrototypeOf(key))
      ) {
        if (void 0 === temporaryReferences)
          throw Error(
            "Only plain objects, and a few built-ins, can be passed to Server Functions. Classes or null prototypes are not supported."
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
    replyLifetimeController = null,
    json = serializeModel(root, 0);
  null === formData
    ? resolve(json)
    : (formData.set(formFieldPrefix + "0", json),
      0 === pendingParts && resolve(formData));
  void 0 === signal || settled || attachAbortSignal(signal);
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
function registerBoundServerReference(reference, id, bound, encodeFormAction) {
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
                null === boundPromise && (boundPromise = Promise.resolve([]));
                return encodeFormAction(referenceClosure.id, boundPromise);
              }
      },
      $$IS_SIGNATURE_EQUAL: { value: isSignatureEqual },
      bind: { value: bind }
    }));
}
var serverObjectReferenceProxyHandlers = {
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
  ArraySlice = Array.prototype.slice;
function bind() {
  var referenceClosure = knownServerReferences.get(this);
  if (!referenceClosure) return FunctionBind.apply(this, arguments);
  var newFn = referenceClosure.originalBind.apply(this, arguments),
    args = ArraySlice.call(arguments, 1),
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
function createBoundServerReference(metaData, callServer, encodeFormAction) {
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
    bound = metaData.bound;
  registerBoundServerReference(action, id, bound, encodeFormAction);
  return action;
}
function createServerReference$1(id, callServer, encodeFormAction) {
  function action() {
    var args = Array.prototype.slice.call(arguments);
    return callServer(id, args);
  }
  registerBoundServerReference(action, id, null, encodeFormAction);
  return action;
}
var ObjectPrototype$1 = Object.prototype,
  ArrayPrototype = Array.prototype,
  RESPONSE_SYMBOL = Symbol();
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
        break;
      case "resolved_module":
        initializeModuleChunk$1(this);
    }
    switch (this.status) {
      case "fulfilled":
        "function" === typeof resolve && resolve(this.value);
        break;
      case "pending":
      case "pending_weak":
      case "blocked":
        "function" === typeof resolve &&
          (null === this.value && (this.value = []), this.value.push(resolve));
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
function readChunk$1(chunk) {
  switch (chunk.status) {
    case "resolved_model":
      initializeModelChunk(chunk);
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
function wakeChunk$1(response, listeners, value, chunk) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    "function" === typeof listener
      ? listener(value)
      : fulfillReference(response, listener, value, chunk);
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
              (fulfillReference(response, listener, cyclicHandler.value, chunk),
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
                  rejectChunk(response, rejectListeners, chunk.reason);
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
      rejectListeners && rejectChunk(response, rejectListeners, chunk.reason);
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
    var listeners = chunk.reason;
    chunk.status = "rejected";
    chunk.reason = error;
    null !== listeners && rejectChunk(response, listeners, error);
  }
}
function createResolvedModelChunk(response, value) {
  var $jscomp$compprop0 = {};
  return new ReactPromise$1(
    "resolved_model",
    value,
    (($jscomp$compprop0[RESPONSE_SYMBOL] = response), $jscomp$compprop0)
  );
}
function createResolvedIteratorResultChunk(response, value, done) {
  var $jscomp$compprop1 = {};
  return new ReactPromise$1(
    "resolved_model",
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    (($jscomp$compprop1[RESPONSE_SYMBOL] = response), $jscomp$compprop1)
  );
}
function resolveIteratorResultChunk(response, chunk, value, done) {
  resolveModelChunk$1(
    response,
    chunk,
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}"
  );
}
function resolveModelChunk$1(response, chunk, value) {
  if ("pending" !== chunk.status && "pending_weak" !== chunk.status)
    chunk.reason.enqueueModel(value);
  else {
    var resolveListeners = chunk.value,
      rejectListeners = chunk.reason;
    chunk.status = "resolved_model";
    chunk.value = value;
    value = {};
    chunk.reason = ((value[RESPONSE_SYMBOL] = response), value);
    null !== resolveListeners &&
      (initializeModelChunk(chunk),
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
    var resolveListeners = chunk.value,
      rejectListeners = chunk.reason;
    chunk.status = "resolved_module";
    chunk.value = value;
    chunk.reason = null;
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
var initializingHandler = null;
function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler;
  initializingHandler = null;
  var resolvedModel = chunk.value,
    response = chunk.reason[RESPONSE_SYMBOL];
  chunk.status = "blocked";
  chunk.value = null;
  chunk.reason = null;
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
        } else null === deferred && (deferred = []), deferred.push(listener);
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
    initializingHandler = prevHandler;
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
function reportGlobalError(weakResponse, error) {
  weakResponse._closed = !0;
  weakResponse._closedReason = error;
  weakResponse._chunks.forEach(function (chunk) {
    "pending" === chunk.status
      ? triggerErrorOnChunk$1(weakResponse, chunk, error)
      : "pending_weak" === chunk.status
        ? ((chunk.status = "halted"),
          (chunk.value = null),
          (chunk.reason = null))
        : "fulfilled" === chunk.status &&
          null !== chunk.reason &&
          chunk.reason.error(error);
  });
}
function createLazyChunkWrapper$1(chunk) {
  return { $$typeof: REACT_LAZY_TYPE, _payload: chunk, _init: readChunk$1 };
}
function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk ||
    ((chunk = response._closed
      ? response._allowPartialStream
        ? new ReactPromise$1("halted", null, null)
        : new ReactPromise$1("rejected", null, response._closedReason)
      : new ReactPromise$1("pending", null, null)),
    chunks.set(id, chunk));
  return chunk;
}
function initializeBlockedChunk(response, chunk, value, reason) {
  var resolveListeners = chunk.value;
  chunk.status = "fulfilled";
  chunk.value = value;
  chunk.reason = reason;
  null !== resolveListeners &&
    wakeChunk$1(response, resolveListeners, value, chunk);
}
function initializeChunkIfUnblocked(response, handler) {
  if (0 === handler.deps && !handler.errored) {
    var chunk = handler.chunk;
    null !== chunk &&
      "blocked" === chunk.status &&
      initializeBlockedChunk(response, chunk, handler.value, handler.reason);
  }
}
function fulfillReference(response, reference, value) {
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
              initializeModelChunk(referencedChunk);
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
      var referencedChunk$56 = value._payload;
      if (referencedChunk$56 === handler.chunk) value = handler.value;
      else {
        switch (referencedChunk$56.status) {
          case "resolved_model":
            initializeModelChunk(referencedChunk$56);
            break;
          case "resolved_module":
            initializeModuleChunk$1(referencedChunk$56);
        }
        switch (referencedChunk$56.status) {
          case "fulfilled":
            value = referencedChunk$56.value;
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
          element.props = mappedValue;
      }
    }
  } catch (error) {
    rejectReference(response, reference.handler, error);
    return;
  }
  handler.deps--;
  initializeChunkIfUnblocked(response, handler);
}
function rejectReference(response, handler, error) {
  handler.errored ||
    ((handler.errored = !0),
    (handler.value = null),
    (handler.reason = error),
    (handler = handler.chunk),
    null !== handler &&
      "blocked" === handler.status &&
      triggerErrorOnChunk$1(response, handler, error));
}
function waitForReference(
  referencedChunk,
  parentObject,
  key,
  response,
  map,
  path
) {
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
  null === referencedChunk.value
    ? (referencedChunk.value = [parentObject])
    : referencedChunk.value.push(parentObject);
  null === referencedChunk.reason
    ? (referencedChunk.reason = [parentObject])
    : referencedChunk.reason.push(parentObject);
  return null;
}
function loadServerReference(response, metaData, parentObject, key) {
  if ("then" === key) return null;
  var id = metaData.id;
  if ("string" !== typeof id) return null;
  if (!response._serverReferenceConfig)
    return createBoundServerReference(
      metaData,
      response._callServer,
      response._encodeFormAction
    );
  var serverReference = resolveServerReference(
      response._serverReferenceConfig,
      id
    ),
    bound = metaData.bound;
  if ((metaData = preloadModule(serverReference)))
    bound instanceof ReactPromise$1 &&
      (metaData = Promise.all([metaData, bound]));
  else if (bound instanceof ReactPromise$1) metaData = Promise.resolve(bound);
  else
    return (
      (metaData = requireModule(serverReference)),
      registerBoundServerReference(
        metaData,
        id,
        bound,
        response._encodeFormAction
      ),
      metaData
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
  metaData.then(
    function () {
      var resolvedValue = requireModule(serverReference);
      if (bound) {
        var promiseValue = bound.value;
        promiseValue = isArrayImpl(promiseValue) ? promiseValue.slice(0) : [];
        promiseValue.unshift(null);
        resolvedValue = resolvedValue.bind.apply(resolvedValue, promiseValue);
      }
      registerBoundServerReference(
        resolvedValue,
        id,
        bound,
        response._encodeFormAction
      );
      "__proto__" !== key && (parentObject[key] = resolvedValue);
      "" === key && null === handler.value && (handler.value = resolvedValue);
      if (
        parentObject[0] === REACT_ELEMENT_TYPE &&
        "object" === typeof handler.value &&
        null !== handler.value &&
        handler.value.$$typeof === REACT_ELEMENT_TYPE
      )
        switch (((promiseValue = handler.value), key)) {
          case "3":
            promiseValue.props = resolvedValue;
        }
      handler.deps--;
      initializeChunkIfUnblocked(response, handler);
    },
    function (error) {
      if (!handler.errored) {
        var erroredHandler = handler;
        erroredHandler.errored = !0;
        erroredHandler.value = null;
        erroredHandler.reason = error;
        erroredHandler = handler.chunk;
        null !== erroredHandler &&
          "blocked" === erroredHandler.status &&
          triggerErrorOnChunk$1(response, erroredHandler, error);
      }
    }
  );
  return null;
}
function loadServerObjectReference(response, metaData) {
  response = metaData.$$reference;
  if (void 0 !== response) return response;
  response = metaData.id;
  var reference = new Proxy({}, serverObjectReferenceProxyHandlers);
  knownServerObjectReferences.set(reference, response);
  return (metaData.$$reference = reference);
}
var EMPTY_REFERENCE_PATH = [];
function getOutlinedModel(response, reference, parentObject, key, map) {
  var id = parseInt(reference, 16);
  reference =
    -1 === reference.indexOf(":") ? EMPTY_REFERENCE_PATH : reference.split(":");
  id = getChunk(response, id);
  switch (id.status) {
    case "resolved_model":
      initializeModelChunk(id);
      break;
    case "resolved_module":
      initializeModuleChunk$1(id);
  }
  switch (id.status) {
    case "fulfilled":
      id = id.value;
      for (var i = 1; i < reference.length; i++) {
        for (
          ;
          "object" === typeof id &&
          null !== id &&
          id.$$typeof === REACT_LAZY_TYPE;

        ) {
          id = id._payload;
          switch (id.status) {
            case "resolved_model":
              initializeModelChunk(id);
              break;
            case "resolved_module":
              initializeModuleChunk$1(id);
          }
          switch (id.status) {
            case "fulfilled":
              id = id.value;
              break;
            case "blocked":
            case "pending":
            case "pending_weak":
              return waitForReference(
                id,
                parentObject,
                key,
                response,
                map,
                reference.slice(i - 1)
              );
            case "halted":
              return (
                initializingHandler
                  ? ((response = initializingHandler), response.deps++)
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
                  ? ((response = initializingHandler),
                    (response.errored = !0),
                    (response.value = null),
                    (response.reason = id.reason))
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
        var name = reference[i];
        if (
          "object" !== typeof id ||
          null === id ||
          (getPrototypeOf(id) !== ObjectPrototype$1 &&
            getPrototypeOf(id) !== ArrayPrototype) ||
          !hasOwnProperty.call(id, name)
        )
          throw Error("Invalid reference.");
        id = id[name];
      }
      for (
        ;
        "object" === typeof id &&
        null !== id &&
        id.$$typeof === REACT_LAZY_TYPE;

      ) {
        reference = id._payload;
        switch (reference.status) {
          case "resolved_model":
            initializeModelChunk(reference);
            break;
          case "resolved_module":
            initializeModuleChunk$1(reference);
        }
        switch (reference.status) {
          case "fulfilled":
            id = reference.value;
            continue;
        }
        break;
      }
      return map(response, id, parentObject, key);
    case "pending":
    case "pending_weak":
    case "blocked":
      return waitForReference(id, parentObject, key, response, map, reference);
    case "halted":
      return (
        initializingHandler
          ? ((response = initializingHandler), response.deps++)
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
          ? ((response = initializingHandler),
            (response.errored = !0),
            (response.value = null),
            (response.reason = id.reason))
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
function extractIterator(response, model) {
  return model[Symbol.iterator]();
}
function createModel(response, model, parentObject, key) {
  return "then" === key && "function" === typeof model ? null : model;
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
          createLazyChunkWrapper$1(response)
        );
      case "@":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          getChunk(response, parentObject)
        );
      case "w":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          (key = response._chunks),
          (value = key.get(parentObject)),
          value ||
            ((value = response._closed
              ? new ReactPromise$1("halted", null, null)
              : new ReactPromise$1("pending_weak", null, null)),
            key.set(parentObject, value)),
          value
        );
      case "S":
        return Symbol.for(value.slice(2));
      case "h":
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
      case "H":
        return (
          (value = value.slice(2)),
          getOutlinedModel(
            response,
            value,
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
      case "Z":
        return resolveErrorProd$1();
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
  serverReferenceConfig,
  moduleLoading,
  callServer,
  encodeFormAction,
  nonce,
  temporaryReferences,
  allowPartialStream
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
}
function createStreamState() {
  return { _rowState: 0, _rowID: 0, _rowTag: 0, _rowLength: 0, _buffer: [] };
}
function resolveBuffer(response, id, buffer) {
  response = response._chunks;
  var chunk = response.get(id);
  chunk && "pending" !== chunk.status
    ? chunk.reason.enqueueValue(buffer)
    : ((buffer = new ReactPromise$1("fulfilled", buffer, null)),
      response.set(id, buffer));
}
function resolveModule(response, id, model) {
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
      var blockedChunk = chunk;
      blockedChunk.status = "blocked";
    } else
      (blockedChunk = new ReactPromise$1("blocked", null, null)),
        chunks.set(id, blockedChunk);
    model.then(
      function () {
        return resolveModuleChunk$1(response, blockedChunk, clientReference);
      },
      function (error) {
        return triggerErrorOnChunk$1(response, blockedChunk, error);
      }
    );
  } else
    chunk
      ? resolveModuleChunk$1(response, chunk, clientReference)
      : ((chunk = new ReactPromise$1("resolved_module", clientReference, null)),
        chunks.set(id, chunk));
}
function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk
    ? "pending" === chunk.status &&
      ((id = chunk.value),
      (chunk.status = "fulfilled"),
      (chunk.value = stream),
      (chunk.reason = controller),
      null !== id && wakeChunk$1(response, id, chunk.value, chunk))
    : ((response = new ReactPromise$1("fulfilled", stream, controller)),
      chunks.set(id, response));
}
function startReadableStream(response, id, type) {
  var controller = null,
    closed = !1;
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
        var chunk = createResolvedModelChunk(response, json);
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
        var chunk$71 = new ReactPromise$1("pending", null, null);
        chunk$71.then(
          function (v) {
            return controller.enqueue(v);
          },
          function (e) {
            return controller.error(e);
          }
        );
        previousBlockedChunk = chunk$71;
        chunk.then(function () {
          previousBlockedChunk === chunk$71 && (previousBlockedChunk = null);
          resolveModelChunk$1(response, chunk$71, json);
        });
      }
    },
    close: function () {
      if (!closed)
        if (((closed = !0), null === previousBlockedChunk)) controller.close();
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
  });
}
function asyncIterator$1() {
  return this;
}
function createIterator(next) {
  next = { next: next };
  next[ASYNC_ITERATOR] = asyncIterator$1;
  return next;
}
function startAsyncIterable(response, id, iterator) {
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
          return new ReactPromise$1(
            "fulfilled",
            { done: !0, value: void 0 },
            null
          );
        buffer[nextReadIndex] = new ReactPromise$1("pending", null, null);
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
          buffer[nextWriteIndex] = new ReactPromise$1(
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
            triggerErrorOnChunk$1(response, buffer[nextWriteIndex++], error);
      }
    }
  );
}
function resolveErrorProd$1() {
  var error = Error(
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."
  );
  error.stack = "Error: " + error.message;
  return error;
}
function mergeBuffer(buffer, lastChunk) {
  for (var l = buffer.length, byteLength = lastChunk.length, i = 0; i < l; i++)
    byteLength += buffer[i].byteLength;
  byteLength = new Uint8Array(byteLength);
  for (var i$72 = (i = 0); i$72 < l; i$72++) {
    var chunk = buffer[i$72];
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
function processFullBinaryRow(response, streamState, id, tag, buffer, chunk) {
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
  processFullStringRow(response, streamState, id, tag, row);
}
function processFullStringRow(response, streamState, id, tag, row) {
  switch (tag) {
    case 73:
      resolveModule(response, id, row);
      break;
    case 72:
      id = row[0];
      row = row.slice(1);
      response = parseModel(response, row);
      dispatchHint(id, response);
      break;
    case 69:
      streamState = response._chunks;
      tag = streamState.get(id);
      row = JSON.parse(row);
      var error = resolveErrorProd$1();
      error.digest = row.digest;
      tag
        ? triggerErrorOnChunk$1(response, tag, error)
        : ((response = new ReactPromise$1("rejected", null, error)),
          streamState.set(id, response));
      break;
    case 84:
      response = response._chunks;
      (streamState = response.get(id)) && "pending" !== streamState.status
        ? streamState.reason.enqueueValue(row)
        : ((row = new ReactPromise$1("fulfilled", row, null)),
          response.set(id, row));
      break;
    case 78:
    case 68:
    case 74:
    case 87:
      throw Error(
        "Failed to read a RSC payload created by a development version of React on the server while using a production version on the client. Always use matching versions on the server and the client."
      );
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
      (id = response._chunks.get(id)) &&
        "fulfilled" === id.status &&
        id.reason.close("" === row ? '"$undefined"' : row);
      break;
    default:
      (streamState = response._chunks),
        (tag = streamState.get(id))
          ? resolveModelChunk$1(response, tag, row)
          : ((response = createResolvedModelChunk(response, row)),
            streamState.set(id, response));
  }
}
function processBinaryChunk(weakResponse, streamState, chunk) {
  for (
    var i = 0,
      rowState = streamState._rowState,
      rowID = streamState._rowID,
      rowTag = streamState._rowTag,
      rowLength = streamState._rowLength,
      buffer = streamState._buffer,
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
              (rowID << 4) | (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
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
              (rowLength << 4) | (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
        continue;
      case 3:
        lastIdx = chunk.indexOf(10, i);
        break;
      case 4:
        (lastIdx = i + rowLength), lastIdx > chunk.length && (lastIdx = -1);
    }
    var offset = chunk.byteOffset + i;
    if (-1 < lastIdx)
      (rowLength = new Uint8Array(chunk.buffer, offset, lastIdx - i)),
        98 === rowTag
          ? resolveBuffer(
              weakResponse,
              rowID,
              lastIdx === chunkLength ? rowLength : rowLength.slice()
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
          resolveBuffer(weakResponse, rowID, chunk))
        : (buffer.push(chunk), (rowLength -= chunk.byteLength));
      break;
    }
  }
  streamState._rowState = rowState;
  streamState._rowID = rowID;
  streamState._rowTag = rowTag;
  streamState._rowLength = rowLength;
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
    return value[0] === REACT_ELEMENT_TYPE
      ? (value[0] === REACT_ELEMENT_TYPE
          ? ((response = {
              $$typeof: REACT_ELEMENT_TYPE,
              type: value[1],
              key: value[2],
              ref: null,
              props: value[3]
            }),
            null !== initializingHandler &&
              ((value = initializingHandler),
              (initializingHandler = value.parent),
              value.errored
                ? ((response = new ReactPromise$1(
                    "rejected",
                    null,
                    value.reason
                  )),
                  (response = createLazyChunkWrapper$1(response)))
                : 0 < value.deps &&
                  ((i = new ReactPromise$1("blocked", null, null)),
                  (value.value = response),
                  (value.chunk = i),
                  (response = createLazyChunkWrapper$1(i)))))
          : (response = value),
        response)
      : value;
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
function close$1(weakResponse) {
  weakResponse._allowPartialStream
    ? ((weakResponse._closed = !0),
      weakResponse._chunks.forEach(function (chunk) {
        "pending" === chunk.status || "pending_weak" === chunk.status
          ? ((chunk.status = "halted"),
            (chunk.value = null),
            (chunk.reason = null))
          : "fulfilled" === chunk.status &&
            null !== chunk.reason &&
            chunk.reason.close('"$undefined"');
      }))
    : reportGlobalError(weakResponse, Error("Connection closed."));
}
function noServerCall$2() {
  throw Error(
    "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
  );
}
function createResponseFromOptions(options) {
  return new ResponseInstance(
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
      : !1
  );
}
function startReadingFromStream$1(response, stream, onDone) {
  function progress(_ref) {
    var value = _ref.value;
    if (_ref.done) return onDone();
    processBinaryChunk(response, streamState, value);
    return reader.read().then(progress).catch(error);
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  var streamState = createStreamState(),
    reader = stream.getReader();
  reader.read().then(progress).catch(error);
}
function noServerCall$1() {
  throw Error(
    "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
  );
}
function startReadingFromStream(response, stream, onEnd) {
  var streamState = createStreamState();
  stream.on("data", function (chunk) {
    if ("string" === typeof chunk) {
      for (
        var i = 0,
          rowState = streamState._rowState,
          rowID = streamState._rowID,
          rowTag = streamState._rowTag,
          rowLength = streamState._rowLength,
          buffer = streamState._buffer,
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
                  (rowID << 4) | (96 < lastIdx ? lastIdx - 87 : lastIdx - 48));
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
    } else processBinaryChunk(response, streamState, chunk);
  });
  stream.on("error", function (error) {
    reportGlobalError(response, error);
  });
  stream.on("end", onEnd);
}
function subscribeToHints(context, listener) {
  for (var queue = context.hintQueue, i = 0; i < queue.length; i++)
    listener(queue[i]);
  var listeners = context.hintListeners;
  listeners.push(listener);
  return function () {
    var index = listeners.indexOf(listener);
    -1 !== index && listeners.splice(index, 1);
  };
}
function noop() {}
function ResultTask(model, ping) {
  this.status = "pending";
  this.reason = this.value = void 0;
  this.model = model;
  this.ping = ping;
  this._listeners = this.thenableState = null;
}
ResultTask.prototype = Object.create(Promise.prototype);
Object.defineProperty(ResultTask.prototype, "then", {
  writable: !0,
  enumerable: !0,
  configurable: !0,
  value: function (resolve, reject) {
    switch (this.status) {
      case "fulfilled":
        resolve(this.value);
        break;
      case "rejected":
        reject(this.reason);
        break;
      default:
        var listeners = this._listeners;
        null === listeners && (this._listeners = listeners = []);
        listeners.push([resolve, reject]);
    }
  }
});
function createResultTask(result, model) {
  var task = new ResultTask(model, function () {
    return result.retryTask(result, task);
  });
  return task;
}
function getResultTask(result, element) {
  var tasks = result.tasks,
    task = tasks.get(element);
  void 0 === task &&
    ((task = createResultTask(result, element)),
    tasks.set(element, task),
    result.retryTask(result, task));
  return task;
}
function createReplay(isByteStream, isIterator) {
  return {
    entries: [],
    status: 0,
    error: void 0,
    isByteStream: isByteStream,
    isIterator: isIterator,
    listeners: null
  };
}
function wakeReplay(replay) {
  var listeners = replay.listeners;
  if (null !== listeners)
    for (
      replay.listeners = null, replay = 0;
      replay < listeners.length;
      replay++
    )
      listeners[replay]();
}
function waitForReplay(replay, index, listener) {
  index < replay.entries.length || 0 !== replay.status
    ? listener()
    : ((index = replay.listeners),
      null === index && (replay.listeners = index = []),
      index.push(listener));
}
function pushReplayEntry(replay, value, done) {
  0 === replay.status &&
    (replay.entries.push({ value: value, done: done }),
    done && (replay.status = 1),
    wakeReplay(replay));
}
function getStreamReplay(result, stream) {
  function progress(entry) {
    0 === replay.status &&
      (pushReplayEntry(replay, entry.value, entry.done),
      entry.done
        ? signal.removeEventListener("abort", abortStream)
        : reader.read().then(progress, error));
  }
  function error(reason) {
    0 === replay.status &&
      (signal.removeEventListener("abort", abortStream),
      0 === replay.status &&
        ((replay.status = 2), (replay.error = reason), wakeReplay(replay)),
      reader.cancel(reason).then(noop, noop));
  }
  function abortStream() {
    error(signal.reason);
  }
  var replays = result.replays;
  null === replays && (result.replays = replays = new WeakMap());
  var existing = replays.get(stream);
  if (void 0 !== existing) return existing;
  existing = stream.supportsBYOB;
  if (void 0 === existing)
    try {
      stream.getReader({ mode: "byob" }).releaseLock(), (existing = !0);
    } catch (x) {
      existing = !1;
    }
  var replay = createReplay(!0 === existing, !1);
  replays.set(stream, replay);
  var reader = stream.getReader(),
    signal = result.abortController.signal;
  signal.addEventListener("abort", abortStream);
  reader.read().then(progress, error);
  return replay;
}
function getAsyncIterableReplay(result, iterable, getAsyncIterator) {
  function progress(entry) {
    0 === replay.status &&
      (pushReplayEntry(replay, entry.value, entry.done),
      entry.done
        ? signal.removeEventListener("abort", abortIterable)
        : iterator.next().then(progress, error));
  }
  function error(reason) {
    0 === replay.status &&
      (signal.removeEventListener("abort", abortIterable),
      0 === replay.status &&
        ((replay.status = 2), (replay.error = reason), wakeReplay(replay)),
      "function" === typeof iterator.throw &&
        iterator.throw(reason).then(noop, noop));
  }
  function abortIterable() {
    error(signal.reason);
  }
  var replays = result.replays;
  null === replays && (result.replays = replays = new WeakMap());
  var existing = replays.get(iterable);
  if (void 0 !== existing) return existing;
  var iterator = getAsyncIterator.call(iterable),
    replay = createReplay(!1, iterator === iterable);
  replays.set(iterable, replay);
  var signal = result.abortController.signal;
  signal.addEventListener("abort", abortIterable);
  iterator.next().then(progress, error);
  return replay;
}
function createReplayReadableStream(replay) {
  function pull(controller) {
    return new Promise(function (resolve) {
      waitForReplay(replay, index, function () {
        if (index < replay.entries.length) {
          var entry = replay.entries[index++];
          entry.done
            ? controller.close()
            : replay.isByteStream
              ? ((entry = entry.value),
                controller.enqueue(
                  new Uint8Array(
                    entry.buffer.slice(
                      entry.byteOffset,
                      entry.byteOffset + entry.byteLength
                    )
                  )
                ))
              : controller.enqueue(entry.value);
        } else
          2 === replay.status
            ? controller.error(replay.error)
            : controller.close();
        resolve();
      });
    });
  }
  var index = 0;
  return replay.isByteStream
    ? new ReadableStream({ type: "bytes", pull: pull })
    : new ReadableStream({ pull: pull });
}
function asyncIterator() {
  return this;
}
function createReplayAsyncIterable(replay) {
  var iterable = {};
  iterable[Symbol.asyncIterator] = function () {
    var index = 0,
      iterator = {
        next: function (arg) {
          if (void 0 !== arg)
            throw Error(
              "Values cannot be passed to next() of AsyncIterables passed to Client Components."
            );
          return new Promise(function (resolve, reject) {
            waitForReplay(replay, index, function () {
              if (index < replay.entries.length) {
                var entry = replay.entries[index++];
                resolve({ done: entry.done, value: entry.value });
              } else
                2 === replay.status
                  ? reject(replay.error)
                  : resolve({ done: !0, value: void 0 });
            });
          });
        }
      };
    iterator[Symbol.asyncIterator] = asyncIterator;
    return iterator;
  };
  return replay.isIterator ? iterable[Symbol.asyncIterator]() : iterable;
}
function isSingleShotIterator(iterator) {
  if ("function" !== typeof iterator.next) return !1;
  var iteratorFn = getIteratorFn(iterator);
  return (
    "function" === typeof iteratorFn && iteratorFn.call(iterator) === iterator
  );
}
function getIteratorEntries(result, iterator) {
  var entries = result.iteratorEntries;
  null === entries && (result.iteratorEntries = entries = new WeakMap());
  result = entries.get(iterator);
  void 0 === result &&
    ((result = Array.from(iterator)), entries.set(iterator, result));
  return result;
}
var ObjectPrototype = Object.prototype,
  emptyRoot = {},
  context$jscomp$inline_214 = {
    keyPath: null,
    implicitSlot: !1,
    enclosing: null
  };
context$jscomp$inline_214.enclosing = context$jscomp$inline_214;
function enterServerComponent(context, key) {
  var prevKeyPath = context.keyPath;
  return null !== key
    ? {
        keyPath:
          key === REACT_OPTIMISTIC_KEY || prevKeyPath === REACT_OPTIMISTIC_KEY
            ? REACT_OPTIMISTIC_KEY
            : null === prevKeyPath
              ? key
              : prevKeyPath + "," + key,
        implicitSlot: context.implicitSlot,
        enclosing: context.enclosing
      }
    : null !== prevKeyPath || context.implicitSlot
      ? context
      : { keyPath: null, implicitSlot: !0, enclosing: context.enclosing };
}
function ReactPromise(status, value, reason, response, context) {
  this.status = status;
  this.value = value;
  this.reason = reason;
  this._response = response;
  this._context = context;
}
ReactPromise.prototype = Object.create(Promise.prototype);
Object.defineProperty(ReactPromise.prototype, "then", {
  writable: !0,
  enumerable: !0,
  configurable: !0,
  value: function (resolve, reject) {
    switch (this.status) {
      case "resolved_module":
        initializeModuleChunk(this);
    }
    switch (this.status) {
      case "fulfilled":
        "function" === typeof resolve && resolve(this.value);
        break;
      case "pending":
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
function readChunk(chunk) {
  switch (chunk.status) {
    case "resolved_module":
      initializeModuleChunk(chunk);
  }
  switch (chunk.status) {
    case "fulfilled":
      return chunk.value;
    case "pending":
      throw chunk;
    default:
      throw chunk.reason;
  }
}
function createPendingChunk(response, context) {
  context = new ReactPromise("pending", null, null, response, context);
  response._pendingChunks.add(context);
  return context;
}
function createErrorChunk(response, error) {
  return new ReactPromise("rejected", null, error, response, null);
}
function createModelChunk(response, model, context) {
  context = createPendingChunk(response, context);
  resolveModelChunk(response, context, model);
  return context;
}
function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) listeners[i](value);
}
function fulfillChunk(chunk, value) {
  if ("pending" === chunk.status) {
    chunk._response._pendingChunks.delete(chunk);
    var listeners = chunk.value;
    chunk.status = "fulfilled";
    chunk.value = value;
    chunk.reason = null;
    null !== listeners && wakeChunk(listeners, value);
  }
}
function triggerErrorOnChunk(chunk, error) {
  if ("pending" === chunk.status) {
    chunk._response._pendingChunks.delete(chunk);
    var listeners = chunk.reason;
    chunk.status = "rejected";
    chunk.reason = error;
    null !== listeners && wakeChunk(listeners, error);
  }
}
function resolveModelChunk(response, chunk, model) {
  if ("pending" === chunk.status) {
    var prevReadError = response._readError;
    response._readError = null;
    var recorded = response._recorded.length;
    try {
      var value = readModel(response, model, chunk._context, emptyRoot, "");
    } catch (thrown) {
      response._readError = prevReadError;
      if (isThenable(thrown)) {
        forgetModels(response, recorded);
        prevReadError = function () {
          return resolveModelChunk(response, chunk, model);
        };
        thrown.then(prevReadError, prevReadError);
        return;
      }
      triggerErrorOnChunk(chunk, reportReadError(response, thrown));
      return;
    }
    recorded = response._readError;
    response._readError = prevReadError;
    null !== recorded
      ? triggerErrorOnChunk(chunk, recorded)
      : "object" === typeof value &&
          null !== value &&
          value.$$typeof === REACT_LAZY_TYPE &&
          value._init === readChunk
        ? value._payload.then(
            function (resolvedValue) {
              return fulfillChunk(chunk, resolvedValue);
            },
            function (reason) {
              return triggerErrorOnChunk(chunk, reason);
            }
          )
        : fulfillChunk(chunk, value);
  }
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
function createLazyChunkWrapper(chunk) {
  return { $$typeof: REACT_LAZY_TYPE, _payload: chunk, _init: readChunk };
}
function resolveErrorProd() {
  var error = Error(
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."
  );
  error.stack = "Error: " + error.message;
  return error;
}
function reportReadError(response, error) {
  a: {
    var result = response._result;
    if ("object" === typeof error && null !== error) {
      var knownDigest = result.errorDigests.get(error);
      if (void 0 !== knownDigest) {
        error = knownDigest;
        break a;
      }
    }
    response = response._onError;
    response = response(error);
    if (null != response && "string" !== typeof response)
      throw Error(
        'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
          typeof response +
          '" instead'
      );
    response = response || "";
    "object" === typeof error &&
      null !== error &&
      result.errorDigests.set(error, response);
    error = response;
  }
  result = resolveErrorProd();
  result.digest = error;
  return result;
}
function reportErrorOnChunk(response, chunk, reason) {
  "pending" === chunk.status &&
    triggerErrorOnChunk(chunk, reportReadError(response, reason));
}
function createElement(type, key, props) {
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: key,
    ref: null,
    props: props
  };
}
function readValue(response, value, context, parent, parentPropertyName) {
  try {
    return readModel(response, value, context, parent, parentPropertyName);
  } catch (thrown) {
    if (isThenable(thrown)) throw thrown;
    value = reportReadError(response, thrown);
    null === response._readError && (response._readError = value);
  }
}
function recordModel(response, model, read) {
  response._models.set(model, read);
  response._recorded.push(model);
}
function forgetModels(response, recorded) {
  var models = response._models;
  response = response._recorded;
  for (var i = recorded; i < response.length; i++) models.delete(response[i]);
  response.length = recorded;
}
function enterContainer(response, container, createCopy) {
  var visiting = response._visiting;
  if (-1 !== visiting.indexOf(container))
    return copyOf(response, container, createCopy);
  visiting.push(container);
  return null;
}
function copyOf(response, container, createCopy) {
  var copy = response._models.get(container);
  void 0 === copy &&
    ((copy = createCopy()), recordModel(response, container, copy));
  return copy;
}
function createArrayCopy() {
  return [];
}
function createObjectCopy() {
  return {};
}
function createMapCopy() {
  return new Map();
}
function createSetCopy() {
  return new Set();
}
function readFragment(response, children, context) {
  return null !== context.keyPath
    ? ((response = createElement(REACT_FRAGMENT_TYPE, context.keyPath, {
        children: readArray(response, children, context.enclosing)
      })),
      context.implicitSlot ? [response] : response)
    : readArray(response, children, context.enclosing);
}
function readArray(response, array, context) {
  var cycle = enterContainer(response, array, createArrayCopy);
  if (null !== cycle) return cycle;
  cycle = null;
  try {
    for (var i = 0; i < array.length; i++) {
      var child = array[i],
        read = readValue(response, child, context, array, "" + i);
      if (null === cycle) {
        if (read === child) continue;
        cycle = copyOf(response, array, createArrayCopy);
        for (var j = 0; j < i; j++) cycle[j] = array[j];
      }
      cycle[i] = read;
    }
  } finally {
    response._visiting.pop();
  }
  return null === cycle ? array : cycle;
}
function readObject(response, object, context) {
  var cycle = enterContainer(response, object, createObjectCopy);
  if (null !== cycle) return cycle;
  cycle = null;
  try {
    for (var keys = Object.keys(object), i = 0; i < keys.length; i++) {
      var key = keys[i],
        child = object[key],
        read =
          void 0 === child || "__proto__" === key
            ? void 0
            : readValue(response, child, context, object, key);
      if (null === cycle) {
        if (read === child && void 0 !== child) continue;
        cycle = copyOf(response, object, createObjectCopy);
        for (var j = 0; j < i; j++) cycle[keys[j]] = object[keys[j]];
      }
      void 0 !== read && (cycle[key] = read);
    }
  } finally {
    response._visiting.pop();
  }
  return null === cycle ? object : cycle;
}
function resolveServerComponentType(response, type) {
  if ("function" === typeof type && !response._bundler.isClientReference(type))
    return type;
  if (
    null != type &&
    "object" === typeof type &&
    !response._bundler.isClientReference(type)
  )
    switch (type.$$typeof) {
      case REACT_LAZY_TYPE:
        var init = type._init;
        return resolveServerComponentType(response, init(type._payload));
      case REACT_FORWARD_REF_TYPE:
        return resolveServerComponentType(response, type.render);
      case REACT_MEMO_TYPE:
        return resolveServerComponentType(response, type.type);
    }
  return null;
}
function processServerComponentReturnValue(response, output) {
  if (
    "object" !== typeof output ||
    null === output ||
    "function" === typeof output.then ||
    response._bundler.isClientReference(output)
  )
    return output;
  var iteratorFn = getIteratorFn(output);
  return iteratorFn
    ? ((response = {}),
      (response[Symbol.iterator] = function () {
        return iteratorFn.call(output);
      }),
      response)
    : "function" !== typeof output[ASYNC_ITERATOR] ||
        ("function" === typeof ReadableStream &&
          output instanceof ReadableStream)
      ? output
      : ((response = {}),
        (response[ASYNC_ITERATOR] = function () {
          return output[ASYNC_ITERATOR]();
        }),
        response);
}
function readServerComponentOutput(response, output, context) {
  output = processServerComponentReturnValue(response, output);
  if (isThenable(output) && !response._bundler.isClientReference(output)) {
    switch (output.status) {
      case "fulfilled":
        return readServerComponentOutput(response, output.value, context);
      case "rejected":
        return createLazyChunkWrapper(
          createErrorChunk(response, reportReadError(response, output.reason))
        );
    }
    context = createPendingChunk(response, context);
    resolveServerComponentOutput(response, context, output);
    return createLazyChunkWrapper(context);
  }
  return readModel(response, output, context, emptyRoot, "");
}
function resolveServerComponentOutput(response, chunk, output) {
  output = processServerComponentReturnValue(response, output);
  isThenable(output) && !response._bundler.isClientReference(output)
    ? output.then(
        function (value) {
          return resolveServerComponentOutput(response, chunk, value);
        },
        function (reason) {
          return reportErrorOnChunk(response, chunk, reason);
        }
      )
    : resolveModelChunk(response, chunk, output);
}
function readServerComponent(response, element, context) {
  var task = getResultTask(response._result, element);
  context = enterServerComponent(context, element.key);
  switch (task.status) {
    case "fulfilled":
      return readServerComponentOutput(response, task.value, context);
    case "pending":
      var chunk = createPendingChunk(response, context);
      task.then(
        function (value) {
          return resolveServerComponentOutput(response, chunk, value);
        },
        function (reason) {
          return reportErrorOnChunk(response, chunk, reason);
        }
      );
      return createLazyChunkWrapper(chunk);
    default:
      return createLazyChunkWrapper(
        createErrorChunk(response, reportReadError(response, task.reason))
      );
  }
}
function readThenable(response, thenable, context) {
  var reusable = null === context.keyPath && !context.implicitSlot;
  if (reusable) {
    var existing = response._models.get(thenable);
    if (void 0 !== existing) return existing;
  }
  switch (thenable.status) {
    case "fulfilled":
      context = createModelChunk(response, thenable.value, context);
      break;
    case "rejected":
      context = createErrorChunk(
        response,
        reportReadError(response, thenable.reason)
      );
      break;
    default:
      var pendingChunk = createPendingChunk(response, context);
      thenable.then(
        function (value) {
          return resolveModelChunk(response, pendingChunk, value);
        },
        function (reason) {
          return reportErrorOnChunk(response, pendingChunk, reason);
        }
      );
      context = pendingChunk;
  }
  reusable && recordModel(response, thenable, context);
  return context;
}
function isThenable(value) {
  return (
    "object" === typeof value &&
    null !== value &&
    "function" === typeof value.then
  );
}
function readStreamedEntry(response, entry, context) {
  return new Promise(function (resolve, reject) {
    function attempt() {
      try {
        var value = entry.value,
          prevReadError = response._readError;
        response._readError = null;
        try {
          var read = readModel(response, value, context, emptyRoot, "");
        } catch (thrown) {
          response._readError = prevReadError;
          if (isThenable(thrown)) throw thrown;
          throw reportReadError(response, thrown);
        }
        var error = response._readError;
        response._readError = prevReadError;
        if (null !== error) throw error;
        var value$jscomp$0 = read;
      } catch (thrown) {
        if (isThenable(thrown)) {
          thrown.then(attempt, attempt);
          return;
        }
        reject(thrown);
        return;
      }
      resolve(
        entry.done
          ? { done: !0, value: value$jscomp$0 }
          : { done: !1, value: value$jscomp$0 }
      );
    }
    attempt();
  });
}
function readStream(response, stream, context) {
  stream = getStreamReplay(response._result, stream);
  var replayed = createReplayReadableStream(stream);
  if (stream.isByteStream) return replayed;
  var reader = replayed.getReader();
  return new ReadableStream({
    pull: function (controller) {
      return reader.read().then(
        function (entry) {
          if (entry.done) controller.close();
          else
            return readStreamedEntry(response, entry, context).then(
              function (read) {
                controller.enqueue(read.value);
              },
              function (error) {
                controller.error(error);
              }
            );
        },
        function (reason) {
          controller.error(reportReadError(response, reason));
        }
      );
    }
  });
}
function readAsyncIterable(response, iterable, context) {
  iterable = getAsyncIterableReplay(
    response._result,
    iterable,
    iterable[ASYNC_ITERATOR]
  );
  var replayed = createReplayAsyncIterable(iterable),
    read = {};
  read[ASYNC_ITERATOR] = function () {
    var source = replayed[ASYNC_ITERATOR](),
      iterator = {
        next: function (arg) {
          return source.next(arg).then(
            function (entry) {
              return entry.done && void 0 === entry.value
                ? entry
                : readStreamedEntry(response, entry, context);
            },
            function (reason) {
              throw reportReadError(response, reason);
            }
          );
        }
      };
    iterator[ASYNC_ITERATOR] = function () {
      return iterator;
    };
    return iterator;
  };
  return iterable.isIterator ? read[ASYNC_ITERATOR]() : read;
}
function readAsyncFragment(response, iterable, context) {
  return null !== context.keyPath
    ? ((response = createElement(REACT_FRAGMENT_TYPE, context.keyPath, {
        children: readAsyncIterable(response, iterable, context.enclosing)
      })),
      context.implicitSlot ? [response] : response)
    : readAsyncIterable(response, iterable, context);
}
function readElement(response, element, context) {
  var reusable = null === context.keyPath && !context.implicitSlot;
  if (reusable) {
    var existing = response._models.get(element);
    if (void 0 !== existing) return existing;
  }
  existing = response._recorded.length;
  try {
    var read =
      null !== resolveServerComponentType(response, element.type)
        ? readServerComponent(response, element, context)
        : readClientElement(response, element, context);
  } catch (thrown) {
    if (isThenable(thrown)) {
      forgetModels(response, existing);
      var chunk = createPendingChunk(response, context);
      context = function () {
        response._models.delete(element);
        resolveModelChunk(response, chunk, element);
      };
      thrown.then(context, context);
      read = createLazyChunkWrapper(chunk);
    } else
      (context = createErrorChunk(response, reportReadError(response, thrown))),
        (read = createLazyChunkWrapper(context));
  }
  reusable && recordModel(response, element, read);
  return read;
}
function readClientElement(response, element, context) {
  var props = element.props;
  if (void 0 !== props.ref && null !== props.ref)
    throw Error(
      "Refs cannot be used in Server Components, nor passed to Client Components."
    );
  var type = element.type;
  if (type === REACT_FRAGMENT_TYPE && null === element.key)
    return readModel(
      response,
      props.children,
      null !== context.keyPath || context.implicitSlot
        ? context
        : { keyPath: null, implicitSlot: !0, enclosing: context.enclosing },
      props,
      "children"
    );
  for (
    ;
    null !== type &&
    "object" === typeof type &&
    !response._bundler.isClientReference(type);

  ) {
    switch (type.$$typeof) {
      case REACT_LAZY_TYPE:
        var init = type._init;
        type = init(type._payload);
        continue;
      case REACT_MEMO_TYPE:
        type = type.type;
        continue;
      case REACT_FORWARD_REF_TYPE:
        type = type.render;
        continue;
    }
    break;
  }
  init = element.key;
  var keyPath = context.keyPath;
  init =
    null === init
      ? keyPath
      : null !== keyPath
        ? keyPath === REACT_OPTIMISTIC_KEY || init === REACT_OPTIMISTIC_KEY
          ? REACT_OPTIMISTIC_KEY
          : keyPath + "," + init
        : init;
  keyPath = response._readError;
  response._readError = null;
  var readProps = readValue(
      response,
      props,
      context.enclosing,
      element,
      "props"
    ),
    error = response._readError;
  response._readError = keyPath;
  null !== error
    ? ((response = createErrorChunk(response, error)),
      (response = createLazyChunkWrapper(response)))
    : (response = response._bundler.isClientReference(type)
        ? createElement(
            createLazyChunkWrapper(getModuleChunk(response, type)),
            init,
            readProps
          )
        : init === element.key && type === element.type && readProps === props
          ? element
          : createElement(type, init, readProps));
  return context.implicitSlot && null !== init ? [response] : response;
}
function getModuleChunk(response, reference) {
  var id = reference.$$id,
    modules = response._modules,
    existing = modules.get(id);
  if (void 0 !== existing) return existing;
  var clientReferenceMetadata =
      response._bundler.resolveClientReferenceMetadata(reference),
    clientReference = resolveClientReference(
      response._bundlerConfig,
      clientReferenceMetadata
    );
  reference = response._bindToConsumer;
  null !== reference
    ? reference(function () {
        prepareDestinationWithChunks(
          response._moduleLoading,
          clientReferenceMetadata[1],
          response._nonce
        );
      })
    : prepareDestinationWithChunks(
        response._moduleLoading,
        clientReferenceMetadata[1],
        response._nonce
      );
  if ((reference = preloadModule(clientReference))) {
    var pendingChunk = new ReactPromise("pending", null, null, response, null);
    reference.then(
      function () {
        if ("pending" === pendingChunk.status) {
          pendingChunk._response._pendingChunks.delete(pendingChunk);
          var resolveListeners = pendingChunk.value,
            rejectListeners = pendingChunk.reason;
          pendingChunk.status = "resolved_module";
          pendingChunk.value = clientReference;
          pendingChunk.reason = null;
          if (null !== resolveListeners)
            switch (
              (initializeModuleChunk(pendingChunk), pendingChunk.status)
            ) {
              case "fulfilled":
                wakeChunk(resolveListeners, pendingChunk.value);
                break;
              case "pending":
                if (pendingChunk.value)
                  for (var i = 0; i < resolveListeners.length; i++)
                    pendingChunk.value.push(resolveListeners[i]);
                else pendingChunk.value = resolveListeners;
                if (pendingChunk.reason) {
                  if (rejectListeners)
                    for (
                      resolveListeners = 0;
                      resolveListeners < rejectListeners.length;
                      resolveListeners++
                    )
                      pendingChunk.reason.push(
                        rejectListeners[resolveListeners]
                      );
                } else pendingChunk.reason = rejectListeners;
                break;
              case "rejected":
                rejectListeners &&
                  wakeChunk(rejectListeners, pendingChunk.reason);
            }
        }
      },
      function (error) {
        return triggerErrorOnChunk(pendingChunk, error);
      }
    );
    reference = pendingChunk;
  } else
    reference = new ReactPromise(
      "resolved_module",
      clientReference,
      null,
      response,
      null
    );
  modules.set(id, reference);
  return reference;
}
function readReferenceChunk(response, chunk) {
  switch (chunk.status) {
    case "resolved_module":
      initializeModuleChunk(chunk);
  }
  switch (chunk.status) {
    case "fulfilled":
      return chunk.value;
    case "pending":
      throw chunk;
    default:
      null === response._readError && (response._readError = chunk.reason);
  }
}
function readServerReference(response, reference, context) {
  var serverReferences = response._serverReferences,
    existing = serverReferences.get(reference);
  if (void 0 !== existing) return readReferenceChunk(response, existing);
  existing = response._bundler;
  var id = existing.getServerReferenceId(reference);
  existing = existing.getServerReferenceBoundArguments(reference);
  var args = null === existing ? null : readArray(response, existing, context),
    bound = null === args ? null : Promise.resolve(args);
  if (response._serverReferenceConfig) {
    var serverReference = resolveServerReference(
        response._serverReferenceConfig,
        id
      ),
      pendingChunk = new ReactPromise("pending", null, null, response, null);
    context = function () {
      try {
        var fn = requireModule(serverReference);
        null !== args && (fn = fn.bind.apply(fn, [null].concat(args)));
        registerBoundServerReference(fn, id, bound, response._encodeFormAction);
      } catch (error) {
        triggerErrorOnChunk(pendingChunk, error);
        return;
      }
      fulfillChunk(pendingChunk, fn);
    };
    (existing = preloadModule(serverReference))
      ? existing.then(context, function (error) {
          return triggerErrorOnChunk(pendingChunk, error);
        })
      : context();
    context = pendingChunk;
  } else
    (context = createBoundServerReference(
      { id: id, bound: bound },
      response._callServer,
      response._encodeFormAction
    )),
      (context = new ReactPromise("fulfilled", context, null, response, null));
  serverReferences.set(reference, context);
  return readReferenceChunk(response, context);
}
function readTemporaryReferenceValue(response, value) {
  value = response._bundler.resolveTemporaryReference(value);
  if (void 0 !== value) {
    response = response._temporaryReferences;
    if (void 0 === response)
      throw Error(
        "Missing a temporary reference set but the RSC response returned a temporary reference. Pass a temporaryReference option with the set that was used with the reply."
      );
    return response.get("$" + value);
  }
}
function checkTaintedObject(response, value) {
  response = response._result.taintRegistries.objects.get(value);
  if (void 0 !== response) throw Error(response);
}
function checkTaintedValue(response, value) {
  response = response._result.taintRegistries.values.get(value);
  if (void 0 !== response) throw Error(response.message);
}
function checkTaintedBytes(response, view) {
  response = response._result.taintRegistries;
  if (
    response.byteLengths.has(view.byteLength) &&
    ((view = response.values.get(
      String.fromCharCode.apply(
        String,
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      )
    )),
    void 0 !== view)
  )
    throw Error(view.message);
}
function readBlobBytes(response, blob) {
  var blobs = response._blobs;
  null === blobs && (blobs = response._blobs = new Map());
  var chunk = blobs.get(blob);
  if (void 0 === chunk) {
    var pendingChunk = new ReactPromise("pending", null, null, response, null),
      reader = blob.stream().getReader(),
      error = function (reason) {
        triggerErrorOnChunk(pendingChunk, reportReadError(response, reason));
      },
      progress = function (entry) {
        if (entry.done) fulfillChunk(pendingChunk, blob);
        else {
          try {
            checkTaintedBytes(response, entry.value);
          } catch (x) {
            error(x);
            return;
          }
          return reader.read().then(progress, error);
        }
      };
    reader.read().then(progress, error);
    chunk = pendingChunk;
    blobs.set(blob, chunk);
  }
  return chunk;
}
function readIterable(response, value, iteratorFn, context) {
  if (isSingleShotIterator(value))
    return readArray(
      response,
      getIteratorEntries(response._result, value),
      context
    )[Symbol.iterator]();
  value = iteratorFn.call(value);
  return isSingleShotIterator(value)
    ? readFragment(
        response,
        getIteratorEntries(response._result, value),
        context
      )
    : readFragment(response, Array.from(value), context);
}
function readModel(response, value, context, parent, parentPropertyName) {
  if (null === value) return null;
  if ("object" === typeof value) {
    switch (value.$$typeof) {
      case REACT_ELEMENT_TYPE:
        return readElement(response, value, context);
      case REACT_LAZY_TYPE:
        var init = value._init;
        return readModel(
          response,
          init(value._payload),
          context,
          parent,
          parentPropertyName
        );
      case REACT_LEGACY_ELEMENT_TYPE:
        throw Error(
          'A React Element from an older version of React was rendered. This is not supported. It can happen if:\n- Multiple copies of the "react" package is used.\n- A library pre-bundled an old copy of "react" or "react/jsx-runtime".\n- A compiler tries to "inline" JSX instead of using the runtime.'
        );
    }
    if (response._bundler.isClientReference(value))
      return readReferenceChunk(response, getModuleChunk(response, value));
    if (response._bundler.isServerReference(value))
      return readServerReference(response, value, context);
    var temporaryReference = readTemporaryReferenceValue(response, value);
    if (void 0 !== temporaryReference) return temporaryReference;
    checkTaintedObject(response, value);
    if ("function" === typeof value.then)
      return readThenable(response, value, context);
    temporaryReference = response._models.get(value);
    if (void 0 !== temporaryReference) return temporaryReference;
    temporaryReference = getPrototypeOf(value);
    if (temporaryReference === ObjectPrototype)
      return (parent = getIteratorFn(value))
        ? readIterable(response, value, parent, context)
        : "function" === typeof value[ASYNC_ITERATOR]
          ? readAsyncFragment(response, value, context)
          : readObject(response, value, context);
    if (isArrayImpl(value)) return readFragment(response, value, context);
    if (value instanceof Map) {
      a: if (
        ((parent = enterContainer(response, value, createMapCopy)),
        null !== parent)
      )
        var JSCompiler_inline_result = parent;
      else {
        try {
          var entries = Array.from(value);
          init = readArray(response, entries, context);
          if (init === entries) {
            JSCompiler_inline_result = value;
            break a;
          }
        } finally {
          response._visiting.pop();
        }
        response = copyOf(response, value, createMapCopy);
        for (value = 0; value < init.length; value++)
          response.set(init[value][0], init[value][1]);
        JSCompiler_inline_result = response;
      }
      return JSCompiler_inline_result;
    }
    if (value instanceof Set) {
      a: if (
        ((parent = enterContainer(response, value, createSetCopy)),
        null !== parent)
      )
        var JSCompiler_inline_result$jscomp$0 = parent;
      else {
        try {
          var values = Array.from(value);
          var read = readArray(response, values, context);
          if (read === values) {
            JSCompiler_inline_result$jscomp$0 = value;
            break a;
          }
        } finally {
          response._visiting.pop();
        }
        response = copyOf(response, value, createSetCopy);
        for (value = 0; value < read.length; value++) response.add(read[value]);
        JSCompiler_inline_result$jscomp$0 = response;
      }
      return JSCompiler_inline_result$jscomp$0;
    }
    if ("function" === typeof FormData && value instanceof FormData) {
      context = Array.from(value.entries());
      for (parent = 0; parent < context.length; parent++)
        (parentPropertyName = context[parent][1]),
          checkTaintedValue(response, context[parent][0]),
          "string" === typeof parentPropertyName
            ? checkTaintedValue(response, parentPropertyName)
            : readReferenceChunk(
                response,
                readBlobBytes(response, parentPropertyName)
              );
      return value;
    }
    if (value instanceof Error) return resolveErrorProd();
    if (value instanceof ArrayBuffer)
      return checkTaintedBytes(response, new Uint8Array(value)), value;
    if (ArrayBuffer.isView(value))
      return checkTaintedBytes(response, value), value;
    if ("function" === typeof Blob && value instanceof Blob)
      return readReferenceChunk(response, readBlobBytes(response, value));
    if ((init = getIteratorFn(value)))
      return readIterable(response, value, init, context);
    if ("function" === typeof ReadableStream && value instanceof ReadableStream)
      return readStream(response, value, context);
    if ("function" === typeof value[ASYNC_ITERATOR])
      return readAsyncFragment(response, value, context);
    if (value instanceof Date) return value;
    if (
      null === temporaryReference ||
      null !== getPrototypeOf(temporaryReference)
    )
      throw Error(
        "Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported." +
          describeObjectForErrorMessage(parent, parentPropertyName)
      );
    return readObject(response, value, context);
  }
  if ("string" === typeof value)
    return checkTaintedValue(response, value), value;
  if ("boolean" === typeof value || "number" === typeof value) return value;
  if ("undefined" !== typeof value) {
    if ("function" === typeof value) {
      if (response._bundler.isClientReference(value))
        return readReferenceChunk(response, getModuleChunk(response, value));
      if (response._bundler.isServerReference(value))
        return readServerReference(response, value, context);
      context = readTemporaryReferenceValue(response, value);
      if (void 0 !== context) return context;
      checkTaintedObject(response, value);
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
      if (void 0 === Symbol.keyFor(value))
        throw Error(
          "Only global symbols received from Symbol.for(...) can be passed to Client Components. The symbol Symbol.for(" +
            (value.description + ") cannot be found among global symbols.") +
            describeObjectForErrorMessage(parent, parentPropertyName)
        );
      return value;
    }
    if ("bigint" === typeof value)
      return checkTaintedValue(response, value), value;
    throw Error(
      "Type " +
        typeof value +
        " is not supported in Client Component props." +
        describeObjectForErrorMessage(parent, parentPropertyName)
    );
  }
}
function createResponse(
  result,
  bundlerConfig,
  serverReferenceConfig,
  moduleLoading,
  bundler,
  callServer,
  encodeFormAction,
  temporaryReferences,
  bindToConsumer,
  nonce,
  onError
) {
  function abortListener() {
    var pendingChunks = response._pendingChunks;
    if (0 < pendingChunks.size) {
      var error = reportReadError(response, signal.reason);
      pendingChunks.forEach(function (chunk) {
        return triggerErrorOnChunk(chunk, error);
      });
    }
  }
  var response = {
    _result: result,
    _bundlerConfig: bundlerConfig,
    _serverReferenceConfig: serverReferenceConfig,
    _moduleLoading: moduleLoading,
    _nonce: nonce,
    _bundler: bundler,
    _callServer: callServer,
    _encodeFormAction: encodeFormAction,
    _temporaryReferences: temporaryReferences,
    _bindToConsumer: bindToConsumer,
    _modules: new Map(),
    _serverReferences: new Map(),
    _onError: void 0 === onError ? result.onError : onError,
    _models: new Map(),
    _recorded: [],
    _visiting: [],
    _pendingChunks: new Set(),
    _unsubscribe: null,
    _readError: null,
    _taintCleanupQueue: null,
    _blobs: null
  };
  result.consumers++;
  bundlerConfig = [];
  response._taintCleanupQueue = bundlerConfig;
  result.taintRegistries.pendingRequests.add(bundlerConfig);
  var signal = result.abortController.signal;
  signal.addEventListener("abort", abortListener);
  var unsubscribeHints = subscribeToHints(result.context, function (hint) {
    null !== bindToConsumer
      ? bindToConsumer(function () {
          return dispatchHint(hint.code, hint.model);
        })
      : dispatchHint(hint.code, hint.model);
  });
  response._unsubscribe = function () {
    signal.removeEventListener("abort", abortListener);
    unsubscribeHints();
  };
  return response;
}
function close(response, reason) {
  var unsubscribe = response._unsubscribe;
  if (null !== unsubscribe) {
    response._unsubscribe = null;
    unsubscribe();
    unsubscribe = response._result.taintRegistries;
    var cleanupQueue = response._taintCleanupQueue;
    if (null !== cleanupQueue) {
      response._taintCleanupQueue = null;
      unsubscribe.pendingRequests.delete(cleanupQueue);
      for (var i = 0; i < cleanupQueue.length; i++) {
        var entryValue = cleanupQueue[i],
          entry = unsubscribe.values.get(entryValue);
        void 0 !== entry &&
          (1 === entry.count
            ? unsubscribe.values.delete(entryValue)
            : entry.count--);
      }
      cleanupQueue.length = 0;
    }
    response = response._result;
    0 === --response.consumers &&
      response.context.cacheController.abort(reason);
  }
}
var CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
  SERVER_REFERENCE_TAG = Symbol.for("react.server.reference");
function isClientReference(reference) {
  return reference.$$typeof === CLIENT_REFERENCE_TAG;
}
function isServerReference(reference) {
  return reference.$$typeof === SERVER_REFERENCE_TAG;
}
function noServerCall() {
  throw Error(
    "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
  );
}
function createFromResult$1(result, options, bindToConsumer) {
  var clientManifest = options.clientManifest,
    serverTemporaryReferences = result.temporaryReferences,
    response = createResponse(
      result,
      options.serverConsumerManifest.moduleMap,
      options.serverConsumerManifest.serverModuleMap,
      options.serverConsumerManifest.moduleLoading,
      {
        isClientReference: isClientReference,
        resolveClientReferenceMetadata: function (reference) {
          var modulePath = reference.$$id,
            name = "",
            resolvedModuleData = clientManifest[modulePath];
          if (resolvedModuleData) name = resolvedModuleData.name;
          else {
            var idx = modulePath.lastIndexOf("#");
            -1 !== idx &&
              ((name = modulePath.slice(idx + 1)),
              (resolvedModuleData = clientManifest[modulePath.slice(0, idx)]));
            if (!resolvedModuleData)
              throw Error(
                'Could not find the module "' +
                  modulePath +
                  '" in the React Client Manifest. This is probably a bug in the React Server Components bundler.'
              );
          }
          if (!0 === resolvedModuleData.async && !0 === reference.$$async)
            throw Error(
              'The module "' +
                modulePath +
                '" is marked as an async ESM module but was loaded as a CJS proxy. This is probably a bug in the React Server Components bundler.'
            );
          reference =
            !0 === resolvedModuleData.async || !0 === reference.$$async
              ? [resolvedModuleData.id, resolvedModuleData.chunks, name, 1]
              : [resolvedModuleData.id, resolvedModuleData.chunks, name];
          return reference;
        },
        isServerReference: isServerReference,
        getServerReferenceId: function (reference) {
          return reference.$$id;
        },
        getServerReferenceBoundArguments: function (reference) {
          return reference.$$bound;
        },
        resolveTemporaryReference: function (value) {
          return void 0 === serverTemporaryReferences
            ? void 0
            : serverTemporaryReferences.get(value);
        }
      },
      noServerCall,
      options.encodeFormAction,
      options.temporaryReferences,
      bindToConsumer,
      "string" === typeof options.nonce ? options.nonce : void 0,
      options.onError
    ),
    signal = options.signal;
  if (signal)
    if (signal.aborted) close(response, signal.reason);
    else {
      var listener = function () {
        close(response, signal.reason);
        signal.removeEventListener("abort", listener);
      };
      signal.addEventListener("abort", listener);
    }
  return createModelChunk(
    response,
    response._result.model,
    context$jscomp$inline_214
  );
}
exports.createFromFetch = function (promiseForResponse, options) {
  var response = createResponseFromOptions(options);
  promiseForResponse.then(
    function (r) {
      startReadingFromStream$1(response, r.body, close$1.bind(null, response));
    },
    function (e) {
      reportGlobalError(response, e);
    }
  );
  return getChunk(response, 0);
};
exports.createFromNodeStream = function (
  stream,
  serverConsumerManifest,
  options
) {
  serverConsumerManifest = new ResponseInstance(
    serverConsumerManifest.moduleMap,
    serverConsumerManifest.serverModuleMap,
    serverConsumerManifest.moduleLoading,
    noServerCall$1,
    options ? options.encodeFormAction : void 0,
    options && "string" === typeof options.nonce ? options.nonce : void 0,
    void 0,
    options && options.unstable_allowPartialStream
      ? options.unstable_allowPartialStream
      : !1
  );
  startReadingFromStream(
    serverConsumerManifest,
    stream,
    close$1.bind(null, serverConsumerManifest)
  );
  return getChunk(serverConsumerManifest, 0);
};
exports.createFromReadableStream = function (stream, options) {
  options = createResponseFromOptions(options);
  startReadingFromStream$1(options, stream, close$1.bind(null, options));
  return getChunk(options, 0);
};
exports.createFromResult = function (result, options) {
  var snapshot = async_hooks.AsyncLocalStorage.snapshot;
  return createFromResult$1(
    result,
    options,
    "function" === typeof snapshot ? snapshot() : null
  );
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
exports.registerServerReference = function (reference, id, encodeFormAction) {
  registerBoundServerReference(reference, id, null, encodeFormAction);
  return reference;
};
