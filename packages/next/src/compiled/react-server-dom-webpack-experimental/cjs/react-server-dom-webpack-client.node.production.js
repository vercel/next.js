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
  ReactDOM = require("react-dom");
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
var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_LAZY_TYPE = Symbol.for("react.lazy"),
  MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
function getIteratorFn(maybeIterable) {
  if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
  maybeIterable =
    (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
    maybeIterable["@@iterator"];
  return "function" === typeof maybeIterable ? maybeIterable : null;
}
var ASYNC_ITERATOR = Symbol.asyncIterator,
  isArrayImpl = Array.isArray,
  getPrototypeOf = Object.getPrototypeOf,
  ObjectPrototype$2 = Object.prototype,
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
          var partJSON$22 = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, partJSON$22);
          iterator.next().then(progress, reject);
        } catch (x$23) {
          reject(x$23);
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
              var lazyId$24 = nextPartId++;
              refId = function () {
                try {
                  var partJSON$25 = serializeModel(value, lazyId$24),
                    data$26 = formData;
                  data$26.append(formFieldPrefix + lazyId$24, partJSON$25);
                  pendingParts--;
                  0 === pendingParts && resolve(data$26);
                } catch (reason) {
                  reject(reason);
                }
              };
              x.then(refId, refId);
              return "$" + lazyId$24.toString(16);
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
            var partJSON$29 =
              void 0 !== previousReference
                ? JSON.stringify(previousReference)
                : serializeModel(partValue, promiseId);
            partValue = formData;
            partValue.append(formFieldPrefix + promiseId, partJSON$29);
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
        var data$33 = formData;
        key = nextPartId++;
        var prefix = formFieldPrefix + "_" + key + "_";
        value.forEach(function (originalValue, originalKey) {
          data$33.append(prefix + originalKey, originalValue);
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
};
function createServerObjectReference(id) {
  var reference = new Proxy({}, serverObjectReferenceProxyHandlers);
  knownServerObjectReferences.set(reference, id);
  return reference;
}
var FunctionBind = Function.prototype.bind,
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
  ArrayPrototype = Array.prototype;
function ReactPromise$2(status, value, reason) {
  this.status = status;
  this.value = value;
  this.reason = reason;
}
ReactPromise$2.prototype = Object.create(Promise.prototype);
Object.defineProperty(ReactPromise$2.prototype, "then", {
  writable: !0,
  enumerable: !0,
  configurable: !0,
  value: function (resolve, reject) {
    switch (this.status) {
      case "resolved_model":
        initializeModelChunk$1(this);
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
function wakeChunk$1(response, listeners, value, chunk) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    "function" === typeof listener
      ? listener(value)
      : fulfillReference(response, listener, value, chunk);
  }
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
      rejectListeners && rejectChunk$1(response, rejectListeners, chunk.reason);
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
    null !== listeners && rejectChunk$1(response, listeners, error);
  }
}
function createResolvedIteratorResultChunk(response, value, done) {
  return new ReactPromise$2(
    "resolved_model",
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    response
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
function initializeModelChunk$1(chunk) {
  var prevHandler = initializingHandler;
  initializingHandler = null;
  var resolvedModel = chunk.value,
    response = chunk.reason;
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
function reportGlobalError$1(weakResponse, error) {
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
        ? new ReactPromise$2("halted", null, null)
        : new ReactPromise$2("rejected", null, response._closedReason)
      : new ReactPromise$2("pending", null, null)),
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
      var referencedChunk$48 = value._payload;
      if (referencedChunk$48 === handler.chunk) value = handler.value;
      else {
        switch (referencedChunk$48.status) {
          case "resolved_model":
            initializeModelChunk$1(referencedChunk$48);
            break;
          case "resolved_module":
            initializeModuleChunk$1(referencedChunk$48);
        }
        switch (referencedChunk$48.status) {
          case "fulfilled":
            value = referencedChunk$48.value;
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
function loadServerReference$1(response, metaData, parentObject, key) {
  if (!response._serverReferenceConfig)
    return createBoundServerReference(
      metaData,
      response._callServer,
      response._encodeFormAction
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
      "" === key && null === handler.value && (handler.value = resolvedValue);
      if (
        parentObject[0] === REACT_ELEMENT_TYPE &&
        "object" === typeof handler.value &&
        null !== handler.value &&
        handler.value.$$typeof === REACT_ELEMENT_TYPE
      )
        switch (((boundArgs = handler.value), key)) {
          case "3":
            boundArgs.props = resolvedValue;
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
  response = createServerObjectReference(metaData.id);
  return (metaData.$$reference = response);
}
var EMPTY_REFERENCE_PATH = [];
function getOutlinedModel(response, reference, parentObject, key, map) {
  var id = parseInt(reference, 16);
  reference =
    -1 === reference.indexOf(":") ? EMPTY_REFERENCE_PATH : reference.split(":");
  id = getChunk(response, id);
  switch (id.status) {
    case "resolved_model":
      initializeModelChunk$1(id);
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
              initializeModelChunk$1(id);
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
            initializeModelChunk$1(reference);
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
              ? new ReactPromise$2("halted", null, null)
              : new ReactPromise$2("pending_weak", null, null)),
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
            loadServerReference$1
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
    : ((buffer = new ReactPromise$2("fulfilled", buffer, null)),
      response.set(id, buffer));
}
function resolveModule$1(response, id, model) {
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
      (blockedChunk = new ReactPromise$2("blocked", null, null)),
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
      : ((chunk = new ReactPromise$2("resolved_module", clientReference, null)),
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
    : ((response = new ReactPromise$2("fulfilled", stream, controller)),
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
        var chunk = new ReactPromise$2("resolved_model", json, response);
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
        var chunk$63 = new ReactPromise$2("pending", null, null);
        chunk$63.then(
          function (v) {
            return controller.enqueue(v);
          },
          function (e) {
            return controller.error(e);
          }
        );
        previousBlockedChunk = chunk$63;
        chunk.then(function () {
          previousBlockedChunk === chunk$63 && (previousBlockedChunk = null);
          resolveModelChunk$1(response, chunk$63, json);
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
          return new ReactPromise$2(
            "fulfilled",
            { done: !0, value: void 0 },
            null
          );
        buffer[nextReadIndex] = new ReactPromise$2("pending", null, null);
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
                (buffer[nextWriteIndex] = new ReactPromise$2(
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
  for (var i$64 = (i = 0); i$64 < l; i$64++) {
    var chunk = buffer[i$64];
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
      resolveModule$1(response, id, row);
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
        : ((response = new ReactPromise$2("rejected", null, error)),
          streamState.set(id, response));
      break;
    case 84:
      response = response._chunks;
      (streamState = response.get(id)) && "pending" !== streamState.status
        ? streamState.reason.enqueueValue(row)
        : ((row = new ReactPromise$2("fulfilled", row, null)),
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
          : ((response = new ReactPromise$2("resolved_model", row, response)),
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
                ? ((response = new ReactPromise$2(
                    "rejected",
                    null,
                    value.reason
                  )),
                  (response = createLazyChunkWrapper$1(response)))
                : 0 < value.deps &&
                  ((i = new ReactPromise$2("blocked", null, null)),
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
function close(weakResponse) {
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
    : reportGlobalError$1(weakResponse, Error("Connection closed."));
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
    reportGlobalError$1(response, e);
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
    reportGlobalError$1(response, error);
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
var RESULT_MODEL_TYPE = Symbol.for("react.result.model");
function ReactPromise$1(weak) {
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
var ObjectPrototype = Object.prototype;
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
  return {
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
      10 < arguments.length && void 0 !== arguments[10] ? arguments[10] : !1,
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
    _chunks: new Set()
  };
}
function ReactPromise(status, value, reason) {
  this.status = status;
  this.value = value;
  this.reason = reason;
}
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
function createPendingChunk() {
  var response =
      0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : null,
    weak = 1 < arguments.length && void 0 !== arguments[1] ? arguments[1] : !1,
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
  return { $$typeof: REACT_LAZY_TYPE, _payload: chunk, _init: readChunk };
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
        var digest = response._onError(error);
        if (null != digest && "string" !== typeof digest)
          throw Error(
            'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' +
              typeof digest +
              '" instead'
          );
        var resolvedError = resolveErrorProd();
        resolvedError.digest = digest || "";
        triggerErrorOnChunk(existingChunk, resolvedError);
      } catch (fatalError) {
        stopReading(response, fatalError);
      }
      return chunk;
    }
    if (null === metadata) {
      var serverReferences = response._result.serverReferences;
      var JSCompiler_inline_result =
        null === serverReferences ? void 0 : serverReferences.get(reference);
      if (void 0 === JSCompiler_inline_result) return null;
      chunk = createBlockedChunk(response);
      response._modules.set(reference, chunk);
      if (response._closed)
        return triggerErrorOnChunk(chunk, getClosedReason(response)), chunk;
      loadServerReference(response, JSCompiler_inline_result, chunk);
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
  } catch (error$69) {
    void 0 === chunk &&
      ((chunk = createPendingChunk(response)),
      response._modules.set(reference, chunk)),
      triggerErrorOnChunk(chunk, error$69);
  }
  return chunk;
}
function createElement(response, element, registerModel) {
  var resolvedElement = {
    $$typeof: REACT_ELEMENT_TYPE,
    type: element.type,
    key: element.key,
    ref: null,
    props: element.props
  };
  registerModel && response._models.set(element, resolvedElement);
  registerModel = element.type;
  var moduleChunk =
    null === registerModel ||
    ("object" !== typeof registerModel && "function" !== typeof registerModel)
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
        } catch (error$72) {
          triggerErrorOnChunk(chunk, error$72);
        } finally {
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
    keys.push(reference.key), (reference = parent), (parent = reference.parent);
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
  var info = getModelInfo(response._result, value);
  if (0 !== (info & 4)) return value;
  var models = response._models,
    existingModel = models.get(value);
  if (void 0 !== existingModel) return existingModel;
  existingModel = getValueReference(response._result, value);
  if (void 0 !== existingModel)
    return (
      (info = readModelReference(response, existingModel)),
      (response = readModel(response, info)),
      models.set(value, response),
      response
    );
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
    response._models.set(value, moduleChunk);
    var source = value._payload,
      reject = function (error) {
        triggerErrorOnChunk(chunk, resolveError(response, source, error));
      };
    if (response._closed || isHaltedModel(response, source))
      return triggerErrorOnChunk(chunk, getClosedReason(response)), moduleChunk;
    var resultModelStatus =
      source.$$typeof === RESULT_MODEL_TYPE ? source.status : null;
    if ("fulfilled" === resultModelStatus)
      return resolveModelChunk(response, chunk, source.value), moduleChunk;
    if ("rejected" === resultModelStatus)
      return reject(source.reason), moduleChunk;
    subscribeToModel(
      response,
      source,
      function (model) {
        return resolveModelChunk(response, chunk, model);
      },
      reject
    );
    return moduleChunk;
  }
  if ("function" === typeof value.then) {
    var chunk$73 = createPendingChunk(
      response,
      "pending_weak" === value.status
    );
    response._models.set(value, chunk$73);
    if (response._closed)
      return (
        "pending_weak" === chunk$73.status
          ? haltChunk(chunk$73)
          : triggerErrorOnChunk(chunk$73, getClosedReason(response)),
        chunk$73
      );
    if ("pending_weak" === chunk$73.status && isHalted(response._result, value))
      return haltChunk(chunk$73), chunk$73;
    if (isHaltedModel(response, value))
      return triggerErrorOnChunk(chunk$73, getClosedReason(response)), chunk$73;
    if ("pending_weak" === chunk$73.status)
      return subscribeWeakModel(response, chunk$73, value), chunk$73;
    moduleChunk = value.$$typeof === RESULT_MODEL_TYPE ? value.status : null;
    if ("fulfilled" === moduleChunk)
      return resolveModelChunk(response, chunk$73, value.value), chunk$73;
    if ("rejected" === moduleChunk)
      return (
        triggerErrorOnChunk(
          chunk$73,
          resolveError(response, value, value.reason)
        ),
        chunk$73
      );
    subscribeToModel(
      response,
      value,
      function (model) {
        return resolveModelChunk(response, chunk$73, model);
      },
      function (error) {
        return triggerErrorOnChunk(
          chunk$73,
          resolveError(response, value, error)
        );
      }
    );
    return chunk$73;
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
      for (reject = 0; reject < moduleChunk.length; reject++)
        copy.set(moduleChunk[reject][0], moduleChunk[reject][1]);
      return copy;
    }
    value.forEach(function (child, key) {
      copy.set(readModel(response, key), readModel(response, child));
    });
    return copy;
  }
  if (value instanceof Set) {
    var copy$75 = new Set();
    response._models.set(value, copy$75);
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
      for (reject = 0; reject < moduleChunk.length; reject++)
        copy$75.add(moduleChunk[reject]);
      return copy$75;
    }
    value.forEach(function (child) {
      copy$75.add(readModel(response, child));
    });
    return copy$75;
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
    reject = [];
    resultModelStatus = reject.values();
    response._models.set(value, resultModelStatus);
    for (var i$80 = 0; i$80 < moduleChunk.length; i$80++)
      reject[i$80] = readModel(response, moduleChunk[i$80]);
    return resultModelStatus;
  }
  if ("function" === typeof FormData && value instanceof FormData) {
    if (!hasFormDataBlobs(response._result, value)) return value;
    moduleChunk = Array.from(value.entries());
    reject = new FormData();
    response._models.set(value, reject);
    for (
      resultModelStatus = 0;
      resultModelStatus < moduleChunk.length;
      resultModelStatus++
    )
      (i$80 = moduleChunk[resultModelStatus]),
        reject.append(i$80[0], readModel(response, i$80[1]));
    return reject;
  }
  if ("function" === typeof Blob && value instanceof Blob)
    return (
      (moduleChunk = new Blob([value], { type: value.type })),
      response._models.set(value, moduleChunk),
      moduleChunk
    );
  if (value instanceof Error)
    return (
      (moduleChunk = resolveErrorProd()),
      response._models.set(value, moduleChunk),
      moduleChunk
    );
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
function initializeModelChunk(response, chunk, model) {
  if (!response._closed)
    try {
      var promise = preloadModel(response, model);
      null === promise
        ? initializeChunk(chunk, readModel(response, model))
        : subscribeToModel(
            response,
            promise,
            function () {
              if (!response._closed)
                try {
                  initializeChunk(chunk, readModel(response, model));
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
    if (isOutlined)
      a: {
        for (var value = model; isLazyModel(response, value); ) {
          isOutlined = value;
          try {
            value = isOutlined._init(isOutlined._payload);
          } catch (error) {
            var wakeable = error;
            if (isHaltedModel(response, isOutlined._payload))
              throw getClosedReason(response);
            if (
              "rejected" !== isOutlined._payload.status &&
              null !== error &&
              "object" === typeof error &&
              "function" === typeof wakeable.then
            ) {
              null !== state.parent && (state.parent.cacheable = !1);
              addPreloadDependency(
                pending,
                waitForOutlinedModel(response, model, wakeable)
              );
              break a;
            }
            throw resolveError(response, isOutlined._payload, error);
          }
        }
        isElementModel(response, value)
          ? ((wakeable = value.type),
            null === wakeable ||
              ("object" !== typeof wakeable &&
                "function" !== typeof wakeable) ||
              resolveModule(response, wakeable),
            scanModel(response, value.props, state, pending))
          : scanModel(response, value, state, pending);
      }
    else scanModel(response, model, state, pending);
  } catch (error) {
    pending = new ReactPromise("rejected", null, error);
    for (isOutlined = 0; isOutlined < state.stack.length; isOutlined++)
      (wakeable = state.stack[isOutlined]),
        (wakeable.onStack = !1),
        (wakeable.dependencies = null),
        (wakeable.chunk = pending);
    throw error;
  }
  pending = pending.dependencies;
  if (null === pending) return null;
  state = [];
  pending = pending.values();
  for (
    isOutlined = pending.next();
    !isOutlined.done;
    isOutlined = pending.next()
  )
    state.push(createPreloadPromise(isOutlined.value));
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
            "resolved_module" === info.status && initializeModuleChunk(info);
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
                scanModelReference(response, value, reference, state, chunks);
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
                    var iterator$86 = value.values(),
                      entry$87 = iterator$86.next();
                    !entry$87.done;
                    entry$87 = iterator$86.next()
                  )
                    scanModel(response, entry$87.value, state, chunks);
                else {
                  if (0 === kind && getPrototypeOf(value) !== ObjectPrototype) {
                    if (
                      void 0 !== getReadableStream(response._result, value) ||
                      void 0 !== getAsyncIterable(response._result, value)
                    )
                      break a;
                    var entries = getIteratorEntries(response._result, value);
                    if (void 0 !== entries) {
                      scanModel(response, entries, state, chunks);
                      break a;
                    }
                    if (
                      ("function" === typeof FormData &&
                        value instanceof FormData) ||
                      ("function" === typeof Blob && value instanceof Blob) ||
                      value instanceof Error
                    )
                      break a;
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
                      entry = entry.values(), iterator$86 = entry.next();
                      !iterator$86.done;
                      iterator$86 = entry.next()
                    )
                      iterator.add(iterator$86.value);
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
  null === dependencies && (preload.dependencies = dependencies = new Set());
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
function resolveErrorProd() {
  var error = Error(
    "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error."
  );
  error.stack = "Error: " + error.message;
  return error;
}
function resolveError(response, thenable, error) {
  if (isHaltedModel(response, thenable)) return getClosedReason(response);
  thenable = response._result.errorReferences.get(thenable);
  if (void 0 === thenable) return error;
  error = response._models.get(thenable);
  if (void 0 !== error) return error;
  error = resolveErrorProd();
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
  var JSCompiler_inline_result = response._result.temporaryReferences;
  JSCompiler_inline_result =
    null === JSCompiler_inline_result
      ? void 0
      : JSCompiler_inline_result.get(value);
  if (void 0 === JSCompiler_inline_result) return !1;
  var temporaryReferences = response._tempRefs;
  if (null == temporaryReferences)
    throw Error(
      "Missing a temporary reference set but the RSC response returned a temporary reference. Pass a temporaryReference option with the set that was used with the reply."
    );
  response._models.set(
    value,
    temporaryReferences.get("$" + JSCompiler_inline_result)
  );
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
                var resolvedValue$89 = requireModule(serverReference);
                null !== _ref &&
                  ((_ref = _ref.slice(0)),
                  _ref.unshift(null),
                  (resolvedValue$89 = resolvedValue$89.bind.apply(
                    resolvedValue$89,
                    _ref
                  )));
                registerBoundServerReference(
                  resolvedValue$89,
                  metaData.id,
                  bound,
                  response._encodeFormAction
                );
                initializeChunk(chunk, resolvedValue$89);
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
          { id: metaData.id, bound: bound },
          response._callServer,
          response._encodeFormAction
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
              previousBlockedChunk === chunk && (previousBlockedChunk = null);
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
                        : subscribe(previous, initialize, function (reason) {
                            return triggerErrorOnChunk(chunk, reason);
                          });
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
function readAsyncIterable(response, model$jscomp$0, source) {
  function release() {
    closed && 0 === subscriptions.size && (unsubscribe(), unregisterError());
  }
  function resolveIteratorResult(chunk, entry) {
    function initialize() {
      if ("blocked" === chunk.status) {
        try {
          if (entry.done)
            a: {
              for (var model = entry.value; isLazyModel(response, model); ) {
                var lazy = model;
                try {
                  model = lazy._init(lazy._payload);
                } catch (error) {
                  throw resolveError(response, lazy._payload, error);
                }
              }
              var value = readModel(response, model);
              if (isElementModel(response, model))
                for (; value.$$typeof === REACT_LAZY_TYPE; ) {
                  var initializingElement = value._payload._initializingElement;
                  if (void 0 !== initializingElement) {
                    var JSCompiler_temp = initializingElement;
                    break a;
                  }
                  value = value._init(value._payload);
                }
              JSCompiler_temp = value;
            }
          else JSCompiler_temp = readModel(response, entry.value);
          initializeChunk(
            chunk,
            entry.done
              ? { done: !0, value: JSCompiler_temp }
              : { done: !1, value: JSCompiler_temp }
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
                done ? { done: !0, value: value } : { done: !1, value: value }
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
        initializeChunk(buffer[nextWriteIndex++], { done: !0, value: void 0 });
      release();
    }
  }
  function errorIterable(reason) {
    if (!closed) {
      closed = !0;
      nextWriteIndex === buffer.length &&
        (buffer[nextWriteIndex] = createPendingChunk());
      for (
        reason = resolveError(response, model$jscomp$0, reason);
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
    : (($jscomp$compprop0[ASYNC_ITERATOR] = getIterator), $jscomp$compprop0);
  response._models.set(model$jscomp$0, $jscomp$compprop0);
  response._closed
    ? errorIterable(getClosedReason(response))
    : ((unregisterError = registerStreamError(response, function (error) {
        unsubscribe();
        subscriptions.forEach(detachModelSubscription);
        for (var i = 0; i < buffer.length; i++)
          ("pending" !== buffer[i].status && "blocked" !== buffer[i].status) ||
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
function closeWeakSubscriptions(response) {
  var subscriptions = response._weakSubscriptions;
  response._weakSubscriptions = null;
  if (null !== subscriptions)
    for (var i = 0; i < subscriptions.length; i++) {
      var subscription = subscriptions[i],
        chunk = subscription.chunk;
      null !== chunk &&
        (response._closed || isHalted(response._result, subscription.source)) &&
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
var CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference");
function noServerCall() {
  throw Error(
    "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
  );
}
exports.createFromFetch = function (promiseForResponse, options) {
  var response = createResponseFromOptions(options);
  promiseForResponse.then(
    function (r) {
      startReadingFromStream$1(response, r.body, close.bind(null, response));
    },
    function (e) {
      reportGlobalError$1(response, e);
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
    close.bind(null, serverConsumerManifest)
  );
  return getChunk(serverConsumerManifest, 0);
};
exports.createFromReadableStream = function (stream, options) {
  options = createResponseFromOptions(options);
  startReadingFromStream$1(options, stream, close.bind(null, options));
  return getChunk(options, 0);
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
      void 0,
      void 0
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
exports.registerServerReference = function (reference, id, encodeFormAction) {
  registerBoundServerReference(reference, id, null, encodeFormAction);
  return reference;
};
