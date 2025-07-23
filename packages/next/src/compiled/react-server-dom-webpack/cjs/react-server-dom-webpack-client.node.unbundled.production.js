/**
 * @license React
 * react-server-dom-webpack-client.node.unbundled.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var util = require("util"),
  ReactDOM = require("react-dom"),
  decoderOptions = { stream: !0 };
function resolveClientReference(bundlerConfig, metadata) {
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
  return {
    specifier: bundlerConfig.specifier,
    name: moduleExports,
    async: 4 === metadata.length
  };
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
        { crossOrigin: JSCompiler_inline_result, nonce: nonce }
      );
    }
}
var ReactDOMSharedInternals =
    ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
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
          var partJSON$21 = JSON.stringify(entry.value, resolveToJSON);
          data.append(formFieldPrefix + streamId, partJSON$21);
          iterator.next().then(progress, reject);
        } catch (x$22) {
          reject(x$22);
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
              var lazyId$23 = nextPartId++;
              parentReference = function () {
                try {
                  var partJSON$24 = serializeModel(value, lazyId$23),
                    data$25 = formData;
                  data$25.append(formFieldPrefix + lazyId$23, partJSON$24);
                  pendingParts--;
                  0 === pendingParts && resolve(data$25);
                } catch (reason) {
                  reject(reason);
                }
              };
              x.then(parentReference, parentReference);
              return "$" + lazyId$23.toString(16);
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
            var partJSON$27 = serializeModel(partValue, promiseId);
            partValue = formData;
            partValue.append(formFieldPrefix + promiseId, partJSON$27);
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
        var data$31 = formData;
        key = nextPartId++;
        var prefix = formFieldPrefix + key + "_";
        value.forEach(function (originalValue, originalKey) {
          data$31.append(prefix + originalKey, originalValue);
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
      parentReference = knownServerReferences.get(value);
      if (void 0 !== parentReference)
        return (
          (key = JSON.stringify(
            { id: parentReference.id, bound: parentReference.bound },
            resolveToJSON
          )),
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
function ReactPromise(status, value, reason) {
  this.status = status;
  this.value = value;
  this.reason = reason;
}
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
      "function" === typeof resolve && resolve(this.value);
      break;
    case "pending":
    case "blocked":
      "function" === typeof resolve &&
        (null === this.value && (this.value = []), this.value.push(resolve));
      "function" === typeof reject &&
        (null === this.reason && (this.reason = []), this.reason.push(reject));
      break;
    case "halted":
      break;
    default:
      "function" === typeof reject && reject(this.reason);
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
    case "halted":
      throw chunk;
    default:
      throw chunk.reason;
  }
}
function wakeChunk(listeners, value) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    "function" === typeof listener
      ? listener(value)
      : fulfillReference(listener, value);
  }
}
function rejectChunk(listeners, error) {
  for (var i = 0; i < listeners.length; i++) {
    var listener = listeners[i];
    "function" === typeof listener
      ? listener(error)
      : rejectReference(listener, error);
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
function wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners) {
  switch (chunk.status) {
    case "fulfilled":
      wakeChunk(resolveListeners, chunk.value);
      break;
    case "blocked":
      for (var i = 0; i < resolveListeners.length; i++) {
        var listener = resolveListeners[i];
        if ("function" !== typeof listener) {
          var cyclicHandler = resolveBlockedCycle(chunk, listener);
          null !== cyclicHandler &&
            (fulfillReference(listener, cyclicHandler.value),
            resolveListeners.splice(i, 1),
            i--,
            null !== rejectListeners &&
              ((listener = rejectListeners.indexOf(listener)),
              -1 !== listener && rejectListeners.splice(listener, 1)));
        }
      }
    case "pending":
      if (chunk.value)
        for (i = 0; i < resolveListeners.length; i++)
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
      rejectListeners && rejectChunk(rejectListeners, chunk.reason);
  }
}
function triggerErrorOnChunk(response, chunk, error) {
  "pending" !== chunk.status && "blocked" !== chunk.status
    ? chunk.reason.error(error)
    : ((response = chunk.reason),
      (chunk.status = "rejected"),
      (chunk.reason = error),
      null !== response && rejectChunk(response, error));
}
function createResolvedIteratorResultChunk(response, value, done) {
  return new ReactPromise(
    "resolved_model",
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}",
    response
  );
}
function resolveIteratorResultChunk(response, chunk, value, done) {
  resolveModelChunk(
    response,
    chunk,
    (done ? '{"done":true,"value":' : '{"done":false,"value":') + value + "}"
  );
}
function resolveModelChunk(response, chunk, value) {
  if ("pending" !== chunk.status) chunk.reason.enqueueModel(value);
  else {
    var resolveListeners = chunk.value,
      rejectListeners = chunk.reason;
    chunk.status = "resolved_model";
    chunk.value = value;
    chunk.reason = response;
    null !== resolveListeners &&
      (initializeModelChunk(chunk),
      wakeChunkIfInitialized(chunk, resolveListeners, rejectListeners));
  }
}
function resolveModuleChunk(response, chunk, value) {
  if ("pending" === chunk.status || "blocked" === chunk.status) {
    response = chunk.value;
    var rejectListeners = chunk.reason;
    chunk.status = "resolved_module";
    chunk.value = value;
    null !== response &&
      (initializeModuleChunk(chunk),
      wakeChunkIfInitialized(chunk, response, rejectListeners));
  }
}
var initializingHandler = null;
function initializeModelChunk(chunk) {
  var prevHandler = initializingHandler;
  initializingHandler = null;
  var resolvedModel = chunk.value,
    response = chunk.reason;
  chunk.status = "blocked";
  chunk.value = null;
  chunk.reason = null;
  try {
    var value = JSON.parse(resolvedModel, response._fromJSON),
      resolveListeners = chunk.value;
    null !== resolveListeners &&
      ((chunk.value = null),
      (chunk.reason = null),
      wakeChunk(resolveListeners, value));
    if (null !== initializingHandler) {
      if (initializingHandler.errored) throw initializingHandler.reason;
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
    var value = requireModule(chunk.value);
    chunk.status = "fulfilled";
    chunk.value = value;
  } catch (error) {
    (chunk.status = "rejected"), (chunk.reason = error);
  }
}
function reportGlobalError(weakResponse, error) {
  weakResponse._closed = !0;
  weakResponse._closedReason = error;
  weakResponse._chunks.forEach(function (chunk) {
    "pending" === chunk.status &&
      triggerErrorOnChunk(weakResponse, chunk, error);
  });
}
function createLazyChunkWrapper(chunk) {
  return { $$typeof: REACT_LAZY_TYPE, _payload: chunk, _init: readChunk };
}
function getChunk(response, id) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  chunk ||
    ((chunk = response._closed
      ? new ReactPromise("rejected", null, response._closedReason)
      : new ReactPromise("pending", null, null)),
    chunks.set(id, chunk));
  return chunk;
}
function fulfillReference(reference, value) {
  for (
    var response = reference.response,
      handler = reference.handler,
      parentObject = reference.parentObject,
      key = reference.key,
      map = reference.map,
      path = reference.path,
      i = 1;
    i < path.length;
    i++
  ) {
    for (; value.$$typeof === REACT_LAZY_TYPE; )
      if (((value = value._payload), value === handler.chunk))
        value = handler.value;
      else {
        switch (value.status) {
          case "resolved_model":
            initializeModelChunk(value);
            break;
          case "resolved_module":
            initializeModuleChunk(value);
        }
        switch (value.status) {
          case "fulfilled":
            value = value.value;
            continue;
          case "blocked":
            var cyclicHandler = resolveBlockedCycle(value, reference);
            if (null !== cyclicHandler) {
              value = cyclicHandler.value;
              continue;
            }
          case "pending":
            path.splice(0, i - 1);
            null === value.value
              ? (value.value = [reference])
              : value.value.push(reference);
            null === value.reason
              ? (value.reason = [reference])
              : value.reason.push(reference);
            return;
          case "halted":
            return;
          default:
            rejectReference(reference, value.reason);
            return;
        }
      }
    value = value[path[i]];
  }
  reference = map(response, value, parentObject, key);
  parentObject[key] = reference;
  "" === key && null === handler.value && (handler.value = reference);
  if (
    parentObject[0] === REACT_ELEMENT_TYPE &&
    "object" === typeof handler.value &&
    null !== handler.value &&
    handler.value.$$typeof === REACT_ELEMENT_TYPE
  )
    switch (((parentObject = handler.value), key)) {
      case "3":
        parentObject.props = reference;
    }
  handler.deps--;
  0 === handler.deps &&
    ((key = handler.chunk),
    null !== key &&
      "blocked" === key.status &&
      ((parentObject = key.value),
      (key.status = "fulfilled"),
      (key.value = handler.value),
      (key.reason = handler.reason),
      null !== parentObject && wakeChunk(parentObject, handler.value)));
}
function rejectReference(reference, error) {
  var handler = reference.handler;
  reference = reference.response;
  handler.errored ||
    ((handler.errored = !0),
    (handler.value = null),
    (handler.reason = error),
    (handler = handler.chunk),
    null !== handler &&
      "blocked" === handler.status &&
      triggerErrorOnChunk(reference, handler, error));
}
function waitForReference(
  referencedChunk,
  parentObject,
  key,
  response,
  map,
  path
) {
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
  parentObject = {
    response: response,
    handler: handler,
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
      parentObject[key] = resolvedValue;
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
        handler.errored = !0;
        handler.value = null;
        handler.reason = error;
        var chunk = handler.chunk;
        null !== chunk &&
          "blocked" === chunk.status &&
          triggerErrorOnChunk(response, chunk, error);
      }
    }
  );
  return null;
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
      for (id = 1; id < reference.length; id++) {
        for (; value.$$typeof === REACT_LAZY_TYPE; ) {
          value = value._payload;
          switch (value.status) {
            case "resolved_model":
              initializeModelChunk(value);
              break;
            case "resolved_module":
              initializeModuleChunk(value);
          }
          switch (value.status) {
            case "fulfilled":
              value = value.value;
              break;
            case "blocked":
            case "pending":
              return waitForReference(
                value,
                parentObject,
                key,
                response,
                map,
                reference.slice(id - 1)
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
                  ? ((initializingHandler.errored = !0),
                    (initializingHandler.value = null),
                    (initializingHandler.reason = value.reason))
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
        value = value[reference[id]];
      }
      return map(response, value, parentObject, key);
    case "pending":
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
          ? ((initializingHandler.errored = !0),
            (initializingHandler.value = null),
            (initializingHandler.reason = id.reason))
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
          createLazyChunkWrapper(response)
        );
      case "@":
        return (
          (parentObject = parseInt(value.slice(2), 16)),
          getChunk(response, parentObject)
        );
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
          getOutlinedModel(response, value, parentObject, key, createFormData)
        );
      case "Z":
        return resolveErrorProd();
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
  temporaryReferences
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
  this._closed = !1;
  this._closedReason = null;
  this._tempRefs = temporaryReferences;
  this._fromJSON = createFromJSONCallback(this);
}
function createStreamState() {
  return { _rowState: 0, _rowID: 0, _rowTag: 0, _rowLength: 0, _buffer: [] };
}
function resolveBuffer(response, id, buffer) {
  response = response._chunks;
  var chunk = response.get(id);
  chunk && "pending" !== chunk.status
    ? chunk.reason.enqueueValue(buffer)
    : response.set(id, new ReactPromise("fulfilled", buffer, null));
}
function resolveModule(response, id, model) {
  var chunks = response._chunks,
    chunk = chunks.get(id);
  model = JSON.parse(model, response._fromJSON);
  var clientReference = resolveClientReference(response._bundlerConfig, model);
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
      (blockedChunk = new ReactPromise("blocked", null, null)),
        chunks.set(id, blockedChunk);
    model.then(
      function () {
        return resolveModuleChunk(response, blockedChunk, clientReference);
      },
      function (error) {
        return triggerErrorOnChunk(response, blockedChunk, error);
      }
    );
  } else
    chunk
      ? resolveModuleChunk(response, chunk, clientReference)
      : chunks.set(
          id,
          new ReactPromise("resolved_module", clientReference, null)
        );
}
function resolveStream(response, id, stream, controller) {
  var chunks = response._chunks;
  response = chunks.get(id);
  response
    ? "pending" === response.status &&
      ((id = response.value),
      (response.status = "fulfilled"),
      (response.value = stream),
      (response.reason = controller),
      null !== id && wakeChunk(id, response.value))
    : chunks.set(id, new ReactPromise("fulfilled", stream, controller));
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
        var chunk = new ReactPromise("resolved_model", json, response);
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
        var chunk$52 = new ReactPromise("pending", null, null);
        chunk$52.then(
          function (v) {
            return controller.enqueue(v);
          },
          function (e) {
            return controller.error(e);
          }
        );
        previousBlockedChunk = chunk$52;
        chunk.then(function () {
          previousBlockedChunk === chunk$52 && (previousBlockedChunk = null);
          resolveModelChunk(response, chunk$52, json);
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
          return new ReactPromise(
            "fulfilled",
            { done: !0, value: void 0 },
            null
          );
        buffer[nextReadIndex] = new ReactPromise("pending", null, null);
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
          buffer[nextWriteIndex] = new ReactPromise(
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
          : resolveIteratorResultChunk(
              response,
              buffer[nextWriteIndex],
              value,
              !1
            );
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
          : resolveIteratorResultChunk(
              response,
              buffer[nextWriteIndex],
              value,
              !0
            );
        for (nextWriteIndex++; nextWriteIndex < buffer.length; )
          resolveIteratorResultChunk(
            response,
            buffer[nextWriteIndex++],
            '"$undefined"',
            !0
          );
      },
      error: function (error) {
        closed = !0;
        for (
          nextWriteIndex === buffer.length &&
          (buffer[nextWriteIndex] = new ReactPromise("pending", null, null));
          nextWriteIndex < buffer.length;

        )
          triggerErrorOnChunk(response, buffer[nextWriteIndex++], error);
      }
    }
  );
}
function resolveErrorProd() {
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
  for (var i$53 = (i = 0); i$53 < l; i$53++) {
    var chunk = buffer[i$53];
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
      id = row[0];
      row = row.slice(1);
      response = JSON.parse(row, response._fromJSON);
      row = ReactDOMSharedInternals.d;
      switch (id) {
        case "D":
          row.D(response);
          break;
        case "C":
          "string" === typeof response
            ? row.C(response)
            : row.C(response[0], response[1]);
          break;
        case "L":
          id = response[0];
          tag = response[1];
          3 === response.length ? row.L(id, tag, response[2]) : row.L(id, tag);
          break;
        case "m":
          "string" === typeof response
            ? row.m(response)
            : row.m(response[0], response[1]);
          break;
        case "X":
          "string" === typeof response
            ? row.X(response)
            : row.X(response[0], response[1]);
          break;
        case "S":
          "string" === typeof response
            ? row.S(response)
            : row.S(
                response[0],
                0 === response[1] ? void 0 : response[1],
                3 === response.length ? response[2] : void 0
              );
          break;
        case "M":
          "string" === typeof response
            ? row.M(response)
            : row.M(response[0], response[1]);
      }
      break;
    case 69:
      tag = response._chunks;
      var chunk = tag.get(id);
      row = JSON.parse(row);
      var error = resolveErrorProd();
      error.digest = row.digest;
      chunk
        ? triggerErrorOnChunk(response, chunk, error)
        : tag.set(id, new ReactPromise("rejected", null, error));
      break;
    case 84:
      response = response._chunks;
      (tag = response.get(id)) && "pending" !== tag.status
        ? tag.reason.enqueueValue(row)
        : response.set(id, new ReactPromise("fulfilled", row, null));
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
      (response = response._chunks.get(id)) &&
        "fulfilled" === response.status &&
        response.reason.close("" === row ? '"$undefined"' : row);
      break;
    default:
      (tag = response._chunks),
        (chunk = tag.get(id))
          ? resolveModelChunk(response, chunk, row)
          : tag.set(id, new ReactPromise("resolved_model", row, response));
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
        processFullBinaryRow(weakResponse, rowID, rowTag, buffer, rowLength),
        (i = lastIdx),
        3 === rowState && i++,
        (rowLength = rowID = rowTag = rowState = 0),
        (buffer.length = 0);
    else {
      weakResponse = new Uint8Array(chunk.buffer, offset, chunk.byteLength - i);
      buffer.push(weakResponse);
      rowLength -= weakResponse.byteLength;
      break;
    }
  }
  streamState._rowState = rowState;
  streamState._rowID = rowID;
  streamState._rowTag = rowTag;
  streamState._rowLength = rowLength;
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
            (key = new ReactPromise("rejected", null, value.reason)),
              (key = createLazyChunkWrapper(key));
          else if (0 < value.deps) {
            var blockedChunk = new ReactPromise("blocked", null, null);
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
function close(weakResponse) {
  reportGlobalError(weakResponse, Error("Connection closed."));
}
function noServerCall$1() {
  throw Error(
    "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
  );
}
function createResponseFromOptions(options) {
  return new ResponseInstance(
    options.serverConsumerManifest.moduleMap,
    options.serverConsumerManifest.serverModuleMap,
    options.serverConsumerManifest.moduleLoading,
    noServerCall$1,
    options.encodeFormAction,
    "string" === typeof options.nonce ? options.nonce : void 0,
    options && options.temporaryReferences
      ? options.temporaryReferences
      : void 0
  );
}
function startReadingFromStream(response, stream) {
  function progress(_ref) {
    var value = _ref.value;
    if (_ref.done) close(response);
    else
      return (
        processBinaryChunk(response, streamState, value),
        reader.read().then(progress).catch(error)
      );
  }
  function error(e) {
    reportGlobalError(response, e);
  }
  var streamState = createStreamState(),
    reader = stream.getReader();
  reader.read().then(progress).catch(error);
}
function noServerCall() {
  throw Error(
    "Server Functions cannot be called during initial render. This would create a fetch waterfall. Try to use a Server Component to pass data to Client Components instead."
  );
}
exports.createFromFetch = function (promiseForResponse, options) {
  var response = createResponseFromOptions(options);
  promiseForResponse.then(
    function (r) {
      startReadingFromStream(response, r.body);
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
  var response = new ResponseInstance(
      serverConsumerManifest.moduleMap,
      serverConsumerManifest.serverModuleMap,
      serverConsumerManifest.moduleLoading,
      noServerCall,
      options ? options.encodeFormAction : void 0,
      options && "string" === typeof options.nonce ? options.nonce : void 0,
      void 0
    ),
    streamState = createStreamState();
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
          processFullStringRow(response, rowID, rowTag, i);
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
  stream.on("end", function () {
    return close(response);
  });
  return getChunk(response, 0);
};
exports.createFromReadableStream = function (stream, options) {
  options = createResponseFromOptions(options);
  startReadingFromStream(options, stream);
  return getChunk(options, 0);
};
exports.createServerReference = function (id) {
  return createServerReference$1(id, noServerCall$1);
};
exports.createTemporaryReferenceSet = function () {
  return new Map();
};
exports.encodeReply = function (value, options) {
  return new Promise(function (resolve, reject) {
    var abort = processReply(
      value,
      "",
      options && options.temporaryReferences
        ? options.temporaryReferences
        : void 0,
      resolve,
      reject
    );
    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) abort(signal.reason);
      else {
        var listener = function () {
          abort(signal.reason);
          signal.removeEventListener("abort", listener);
        };
        signal.addEventListener("abort", listener);
      }
    }
  });
};
exports.registerServerReference = function (reference, id, encodeFormAction) {
  registerBoundServerReference(reference, id, null, encodeFormAction);
  return reference;
};
